import { splitCoins } from '../../shared/questlog/quest.js'
import type { Difficulty, ProfilePayload, RewardState } from '../../shared/questlog/types.js'
import {
  type InboxMessage,
  normalise,
  type Person,
  type RewardDraft,
  split,
  type Weighted,
} from '../../shared/rewards.js'
import type { Db, Sql } from '../db.js'

export const RECENT = 30
export const INBOX_LIMIT = 50

export interface QuestRecord {
  key: string
  title: string
  webUrl: string
  difficulty: Difficulty
  experience: number
  copper: number
  giver: Person | null
  completedAt: Date
  dueAt: Date
  shares: Weighted[]
}

export type LegacyQuest = Omit<QuestRecord, 'giver' | 'dueAt' | 'shares'>

const iso = (value: unknown) => new Date(value as string).toISOString()
const isoOrNull = (value: unknown) => (value == null ? null : iso(value))

export async function setting(db: Sql, key: string): Promise<string | null> {
  const { rows } = await db.query<{ value: string }>('select value from setting where key = $1', [key])
  return rows[0]?.value ?? null
}

export async function settleSetting(db: Sql, key: string, value: string): Promise<string> {
  await db.query('insert into setting (key, value) values ($1, $2) on conflict (key) do nothing', [key, value])
  return (await setting(db, key)) ?? value
}

export async function knownKeys(db: Sql, keys: readonly string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set()
  const { rows } = await db.query<{ key: string }>('select key from quest where key = any($1)', [keys])
  return new Set(rows.map((row) => row.key))
}

export async function rewardStates(db: Sql, keys: readonly string[]): Promise<Record<string, RewardState>> {
  if (keys.length === 0) return {}
  const { rows } = await db.query<{ key: string; distributed_at: unknown }>(
    'select key, distributed_at from quest where key = any($1)',
    [keys],
  )
  return Object.fromEntries(rows.map((row) => [row.key, row.distributed_at == null ? 'pending' : 'paid']))
}

export async function withdraw(db: Sql, key: string): Promise<boolean> {
  const { rows } = await db.query('delete from quest where key = $1 and distributed_at is null returning key', [key])
  return rows.length > 0
}

async function ensurePlayer(tx: Sql, person: Person): Promise<void> {
  await tx.query(
    `insert into player (id, name) values ($1, $2)
     on conflict (id) do update set name = excluded.name`,
    [person.id, person.name],
  )
}

function unique(shares: readonly Weighted[]): Weighted[] {
  const byId = new Map<string, Weighted>()
  for (const share of shares) {
    const found = byId.get(share.id)
    byId.set(share.id, found ? { ...found, share: found.share + share.share } : { ...share })
  }
  return [...byId.values()]
}

export async function recordQuest(db: Db, record: QuestRecord): Promise<boolean> {
  return db.transaction(async (tx) => {
    const inserted = await tx.query(
      `insert into quest (key, title, web_url, difficulty, experience, copper, giver_id, giver_name, completed_at, due_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (key) do nothing
       returning key`,
      [
        record.key,
        record.title,
        record.webUrl,
        record.difficulty,
        record.experience,
        record.copper,
        record.giver?.id ?? null,
        record.giver?.name ?? null,
        record.completedAt,
        record.dueAt,
      ],
    )
    if (inserted.rows.length === 0) return false
    for (const share of normalise(unique(record.shares))) {
      await ensurePlayer(tx, share)
      await tx.query('insert into share (quest_key, player_id, proposed) values ($1, $2, $3)', [
        record.key,
        share.id,
        share.share,
      ])
    }
    if (record.giver) {
      await tx.query(
        `insert into message (recipient_id, kind, quest_key, created_at) values ($1, 'distribute', $2, $3)`,
        [record.giver.id, record.key, record.completedAt],
      )
    }
    return true
  })
}

interface QuestRow {
  key: string
  title: string
  web_url: string
  difficulty: Difficulty
  experience: number
  copper: string | number
  giver_id: string | null
  giver_name: string | null
  completed_at: unknown
  due_at: unknown
  distributed_at: unknown
  distributed_by: string | null
}

export async function distribute(
  db: Db,
  key: string,
  shares: readonly Weighted[],
  by: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<QuestRow>('select * from quest where key = $1 for update', [key])
    const quest = rows[0]
    if (!quest) throw new Error(`Unbekannte Quest: ${key}`)
    if (quest.distributed_at != null) throw new Error(`${key} ist bereits verteilt`)

    const weighted = normalise(unique(shares))
    const experience = split(quest.experience, weighted.map((entry) => entry.share))
    const copper = split(Number(quest.copper), weighted.map((entry) => entry.share))

    await tx.query('delete from share where quest_key = $1', [key])
    for (const [index, share] of weighted.entries()) {
      await ensurePlayer(tx, share)
      await tx.query(
        'insert into share (quest_key, player_id, proposed, experience, copper) values ($1, $2, $3, $4, $5)',
        [key, share.id, share.share, experience[index], copper[index]],
      )
      await tx.query('update player set experience = experience + $2, copper = copper + $3 where id = $1', [
        share.id,
        experience[index],
        copper[index],
      ])
      if (experience[index]! > 0 || copper[index]! > 0) {
        await tx.query(
          `insert into message (recipient_id, kind, quest_key, created_at) values ($1, 'reward', $2, $3)`,
          [share.id, key, now],
        )
      }
    }
    await tx.query('update quest set distributed_at = $2, distributed_by = $3 where key = $1', [key, now, by])
    await tx.query(
      `update message set done_at = $2, read_at = coalesce(read_at, $2)
       where quest_key = $1 and kind = 'distribute' and done_at is null`,
      [key, now],
    )
  })
}

export async function distributeDue(db: Db, now: Date): Promise<string[]> {
  const { rows } = await db.query<{ key: string }>(
    'select key from quest where distributed_at is null and due_at <= $1 order by due_at',
    [now],
  )
  for (const { key } of rows) {
    const proposed = await db.query<{ id: string; name: string; share: number }>(
      `select p.id, p.name, s.proposed as share from share s join player p on p.id = s.player_id
       where s.quest_key = $1`,
      [key],
    )
    await distribute(db, key, proposed.rows, 'auto', now)
  }
  return rows.map((row) => row.key)
}

export async function draft(db: Sql, key: string, me: Person | null): Promise<RewardDraft | null> {
  const { rows } = await db.query<QuestRow>('select * from quest where key = $1', [key])
  const quest = rows[0]
  if (!quest) return null
  const shares = await db.query<{
    id: string
    name: string
    share: number
    experience: number | null
    copper: string | number | null
  }>(
    `select p.id, p.name, s.proposed as share, s.experience, s.copper
     from share s join player p on p.id = s.player_id
     where s.quest_key = $1 order by s.proposed desc, p.name`,
    [key],
  )
  return {
    key: quest.key,
    title: quest.title,
    webUrl: quest.web_url,
    difficulty: quest.difficulty,
    experience: quest.experience,
    coins: splitCoins(Number(quest.copper)),
    giver: quest.giver_id ? { id: quest.giver_id, name: quest.giver_name ?? quest.giver_id } : null,
    completedAt: iso(quest.completed_at),
    dueAt: iso(quest.due_at),
    distributedAt: isoOrNull(quest.distributed_at),
    distributedBy: quest.distributed_by,
    shares: shares.rows.map((row) => ({
      id: row.id,
      name: row.name,
      share: Number(row.share),
      experience: row.experience == null ? null : Number(row.experience),
      coins: row.copper == null ? null : splitCoins(Number(row.copper)),
    })),
    mayDistribute: quest.distributed_at == null && me != null && quest.giver_id === me.id,
  }
}

export async function inbox(db: Sql, me: Person): Promise<InboxMessage[]> {
  const { rows } = await db.query<{
    id: string | number
    kind: 'distribute' | 'reward'
    created_at: unknown
    read_at: unknown
    done_at: unknown
    key: string
    title: string
    due_at: unknown
    distributed_by: string | null
    giver_name: string | null
    experience: number | null
    copper: string | number | null
  }>(
    `select m.id, m.kind, m.created_at, m.read_at, m.done_at, q.key, q.title, q.due_at,
            q.distributed_by, q.giver_name, s.experience, s.copper
     from message m
     join quest q on q.key = m.quest_key
     left join share s on s.quest_key = q.key and s.player_id = m.recipient_id
     where m.recipient_id = $1 and (m.kind = 'reward' or m.done_at is null)
     order by m.created_at desc, m.id desc
     limit $2`,
    [me.id, INBOX_LIMIT],
  )
  return rows.map((row) => {
    const base = {
      id: Number(row.id),
      createdAt: iso(row.created_at),
      read: row.read_at != null,
      done: row.done_at != null,
      quest: { key: row.key, title: row.title, dueAt: iso(row.due_at) },
    }
    return row.kind === 'reward'
      ? {
          ...base,
          kind: 'reward' as const,
          experience: Number(row.experience ?? 0),
          coins: splitCoins(Number(row.copper ?? 0)),
          by: row.distributed_by === 'auto' ? null : row.giver_name,
        }
      : { ...base, kind: 'distribute' as const }
  })
}

export async function markRead(db: Sql, me: Person, ids: readonly number[], now: Date): Promise<void> {
  if (ids.length === 0) return
  await db.query(
    'update message set read_at = coalesce(read_at, $3) where recipient_id = $1 and id = any($2)',
    [me.id, ids, now],
  )
}

export async function isOpened(db: Sql, id: string): Promise<boolean> {
  const { rows } = await db.query('select 1 from player where id = $1 and opened_at is not null', [id])
  return rows.length > 0
}

export async function openPlayer(
  db: Db,
  person: Person,
  legacy: readonly LegacyQuest[],
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await ensurePlayer(tx, person)
    const { rows } = await tx.query<{ opened_at: unknown }>(
      'select opened_at from player where id = $1 for update',
      [person.id],
    )
    if (rows[0]?.opened_at != null) return
    for (const quest of legacy) {
      const inserted = await tx.query(
        `insert into quest (key, title, web_url, difficulty, experience, copper, completed_at, due_at, distributed_at, distributed_by)
         values ($1, $2, $3, $4, $5, $6, $7, $7, $7, 'legacy')
         on conflict (key) do nothing
         returning key`,
        [quest.key, quest.title, quest.webUrl, quest.difficulty, quest.experience, quest.copper, quest.completedAt],
      )
      if (inserted.rows.length === 0) continue
      await tx.query(
        'insert into share (quest_key, player_id, proposed, experience, copper) values ($1, $2, 1, $3, $4)',
        [quest.key, person.id, quest.experience, quest.copper],
      )
      await tx.query('update player set experience = experience + $2, copper = copper + $3 where id = $1', [
        person.id,
        quest.experience,
        quest.copper,
      ])
    }
    await tx.query('update player set opened_at = $2 where id = $1', [person.id, now])
  })
}

export async function profile(db: Sql, me: Person, avatar: string | null): Promise<ProfilePayload> {
  const player = await db.query<{ name: string; experience: string | number; copper: string | number }>(
    'select name, experience, copper from player where id = $1',
    [me.id],
  )
  const done = await db.query<{ count: string | number }>(
    `select count(*) as count from share s join quest q on q.key = s.quest_key
     where s.player_id = $1 and q.distributed_at is not null and s.proposed > 0`,
    [me.id],
  )
  const recent = await db.query<{
    key: string
    title: string
    difficulty: Difficulty
    web_url: string
    completed_at: unknown
    share: number
    experience: number
    copper: string | number
  }>(
    `select q.key, q.title, q.difficulty, q.web_url, q.completed_at, s.proposed as share, s.experience, s.copper
     from share s join quest q on q.key = s.quest_key
     where s.player_id = $1 and q.distributed_at is not null and s.proposed > 0
     order by q.completed_at desc, q.key
     limit $2`,
    [me.id, RECENT],
  )
  const open = await db.query<{
    key: string
    experience: number
    copper: string | number
    player_id: string
    share: number
  }>(
    `select q.key, q.experience, q.copper, s.player_id, s.proposed as share
     from quest q join share s on s.quest_key = q.key
     where q.distributed_at is null
       and q.key in (select quest_key from share where player_id = $1)
     order by q.key, s.player_id`,
    [me.id],
  )

  const pending = { experience: 0, copper: 0, quests: 0 }
  const byQuest = new Map<string, typeof open.rows>()
  for (const entry of open.rows) byQuest.set(entry.key, [...(byQuest.get(entry.key) ?? []), entry])
  for (const rows of byQuest.values()) {
    const index = rows.findIndex((row) => row.player_id === me.id)
    const weights = rows.map((row) => Number(row.share))
    pending.experience += split(rows[0]!.experience, weights)[index]!
    pending.copper += split(Number(rows[0]!.copper), weights)[index]!
    pending.quests += 1
  }

  const row = player.rows[0]
  return {
    name: row?.name ?? me.name,
    avatar,
    experience: Number(row?.experience ?? 0),
    coins: splitCoins(Number(row?.copper ?? 0)),
    completed: Number(done.rows[0]?.count ?? 0),
    pending: { experience: pending.experience, coins: splitCoins(pending.copper), quests: pending.quests },
    quests: recent.rows.map((entry) => ({
      key: entry.key,
      title: entry.title,
      difficulty: entry.difficulty,
      experience: Number(entry.experience),
      coins: splitCoins(Number(entry.copper)),
      share: Number(entry.share),
      resolved: iso(entry.completed_at),
      webUrl: entry.web_url,
    })),
  }
}
