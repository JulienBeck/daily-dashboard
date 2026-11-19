import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db.js'
import { memoryDb } from './memoryDb.js'
import {
  distribute,
  distributeDue,
  draft,
  inbox,
  isOpened,
  knownKeys,
  markRead,
  openPlayer,
  profile,
  type QuestRecord,
  recordQuest,
  rewardStates,
  setting,
  settleSetting,
  withdraw,
} from './store.js'

const anna = { id: 'JIRAUSER1', name: 'Anna Berg' }
const ben = { id: 'JIRAUSER2', name: 'Ben Cohn' }
const cara = { id: 'JIRAUSER3', name: 'Cara Dietz' }
const giver = { id: 'JIRAUSER9', name: 'Gerd Geber' }

const record = (over: Partial<QuestRecord> = {}): QuestRecord => ({
  key: 'PRO-1',
  title: 'Index nachts neu bauen',
  webUrl: 'https://jira.test/browse/PRO-1',
  difficulty: 'easy',
  experience: 450,
  copper: 9400,
  giver,
  completedAt: new Date('2026-11-10T10:00:00Z'),
  dueAt: new Date('2026-11-20T17:00:00Z'),
  shares: [
    { ...anna, share: 0.75 },
    { ...ben, share: 0.25 },
  ],
  ...over,
})

const now = new Date('2026-11-12T09:00:00Z')
let db: Db

beforeAll(async () => {
  db = await memoryDb()
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.query('truncate inventory, message, share, quest, player, setting restart identity cascade')
})

const wallet = async (id: string) => {
  const { rows } = await db.query<{ experience: unknown; copper: unknown }>(
    'select experience, copper from player where id = $1',
    [id],
  )
  return { experience: Number(rows[0]?.experience), copper: Number(rows[0]?.copper) }
}

describe('settings', () => {
  it('keeps the first value, so the cutoff never moves once it is set', async () => {
    expect(await setting(db, 'cutoff')).toBeNull()
    expect(await settleSetting(db, 'cutoff', 'a')).toBe('a')
    expect(await settleSetting(db, 'cutoff', 'b')).toBe('a')
  })
})

describe('recordQuest', () => {
  it('files the quest with its proposal and asks the giver to distribute', async () => {
    expect(await recordQuest(db, record())).toBe(true)

    const found = await draft(db, 'PRO-1', giver)
    expect(found).toMatchObject({
      key: 'PRO-1',
      experience: 450,
      coins: { gold: 0, silver: 94, copper: 0 },
      giver,
      distributedAt: null,
      mayDistribute: true,
      completedAt: '2026-11-10T10:00:00.000Z',
      dueAt: '2026-11-20T17:00:00.000Z',
    })
    expect(found!.shares.map(({ id, share, experience }) => ({ id, share, experience }))).toEqual([
      { id: anna.id, share: 0.75, experience: null },
      { id: ben.id, share: 0.25, experience: null },
    ])
    expect((await inbox(db, giver)).map(({ kind, quest }) => ({ kind, key: quest.key }))).toEqual([
      { kind: 'distribute', key: 'PRO-1' },
    ])
  })

  it('files a quest only once', async () => {
    await recordQuest(db, record())

    expect(await recordQuest(db, record({ title: 'anders' }))).toBe(false)
    expect(await inbox(db, giver)).toHaveLength(1)
    expect((await draft(db, 'PRO-1', giver))!.title).toBe('Index nachts neu bauen')
    expect(await knownKeys(db, ['PRO-1', 'PRO-2'])).toEqual(new Set(['PRO-1']))
  })

  it('sends nobody a message for a quest without giver', async () => {
    await recordQuest(db, record({ giver: null }))

    expect(await inbox(db, giver)).toEqual([])
    expect((await draft(db, 'PRO-1', giver))!.mayDistribute).toBe(false)
  })

  it('merges one person named twice and scales the proposal to one', async () => {
    await recordQuest(db, record({ shares: [{ ...anna, share: 1 }, { ...anna, share: 1 }, { ...ben, share: 2 }] }))

    expect((await draft(db, 'PRO-1', giver))!.shares.map(({ id, share }) => ({ id, share }))).toEqual([
      { id: anna.id, share: 0.5 },
      { id: ben.id, share: 0.5 },
    ])
  })

  it('knows no keys when asked for none', async () => {
    expect(await knownKeys(db, [])).toEqual(new Set())
  })
})

describe('distribute', () => {
  it('splits experience and coins by the given weights and credits the wallets', async () => {
    await recordQuest(db, record())

    await distribute(db, 'PRO-1', [{ ...anna, share: 2 }, { ...cara, share: 1 }], giver.id, now)

    expect(await wallet(anna.id)).toEqual({ experience: 300, copper: 6267 })
    expect(await wallet(cara.id)).toEqual({ experience: 150, copper: 3133 })
    expect(await wallet(ben.id)).toEqual({ experience: 0, copper: 0 })
    const found = (await draft(db, 'PRO-1', giver))!
    expect(found.distributedAt).toBe(now.toISOString())
    expect(found.distributedBy).toBe(giver.id)
    expect(found.mayDistribute).toBe(false)
    expect(found.shares.map(({ id, experience, coins }) => ({ id, experience, coins }))).toEqual([
      { id: anna.id, experience: 300, coins: { gold: 0, silver: 62, copper: 67 } },
      { id: cara.id, experience: 150, coins: { gold: 0, silver: 31, copper: 33 } },
    ])
  })

  it('closes the giver’s task and tells everybody who got something', async () => {
    await recordQuest(db, record())

    await distribute(db, 'PRO-1', [{ ...anna, share: 1 }, { ...ben, share: 0 }], giver.id, now)

    expect(await inbox(db, giver)).toEqual([])
    expect(await inbox(db, ben)).toEqual([])
    expect(await inbox(db, anna)).toEqual([
      {
        id: 2,
        kind: 'reward',
        createdAt: now.toISOString(),
        read: false,
        done: false,
        quest: { key: 'PRO-1', title: 'Index nachts neu bauen', dueAt: '2026-11-20T17:00:00.000Z' },
        experience: 450,
        coins: { gold: 0, silver: 94, copper: 0 },
        by: 'Gerd Geber',
      },
    ])
  })

  it('distributes a quest only once', async () => {
    await recordQuest(db, record())
    await distribute(db, 'PRO-1', [{ ...anna, share: 1 }], giver.id, now)

    await expect(distribute(db, 'PRO-1', [{ ...ben, share: 1 }], giver.id, now)).rejects.toThrow('bereits verteilt')
    expect(await wallet(anna.id)).toEqual({ experience: 450, copper: 9400 })
    expect(await wallet(ben.id)).toEqual({ experience: 0, copper: 0 })
  })

  it('refuses a quest it does not know', async () => {
    await expect(distribute(db, 'PRO-9', [{ ...anna, share: 1 }], giver.id, now)).rejects.toThrow('Unbekannte Quest')
  })
})

describe('rewardStates', () => {
  it('tells a waiting reward from a paid one and leaves unknown quests out', async () => {
    await recordQuest(db, record())
    await recordQuest(db, record({ key: 'PRO-2' }))
    await distribute(db, 'PRO-2', [{ ...anna, share: 1 }], giver.id, now)

    expect(await rewardStates(db, ['PRO-1', 'PRO-2', 'PRO-3'])).toEqual({ 'PRO-1': 'pending', 'PRO-2': 'paid' })
  })

  it('knows nothing when asked about nothing', async () => {
    expect(await rewardStates(db, [])).toEqual({})
  })
})

describe('withdraw', () => {
  it('drops a waiting reward with its shares and the giver’s task', async () => {
    await recordQuest(db, record())

    expect(await withdraw(db, 'PRO-1')).toBe(true)

    expect(await rewardStates(db, ['PRO-1'])).toEqual({})
    expect((await db.query('select 1 from share')).rows).toHaveLength(0)
    expect(await inbox(db, giver)).toEqual([])
  })

  it('keeps a reward that is already paid out', async () => {
    await recordQuest(db, record())
    await distribute(db, 'PRO-1', [{ ...anna, share: 1 }], giver.id, now)

    expect(await withdraw(db, 'PRO-1')).toBe(false)

    expect(await rewardStates(db, ['PRO-1'])).toEqual({ 'PRO-1': 'paid' })
    expect(await wallet(anna.id)).toEqual({ experience: 450, copper: 9400 })
  })
})

describe('distributeDue', () => {
  it('distributes overdue quests by the proposal and leaves the rest to the giver', async () => {
    await recordQuest(db, record())
    await recordQuest(db, record({ key: 'PRO-2', dueAt: new Date('2026-12-01T00:00:00Z') }))

    const done = await distributeDue(db, new Date('2026-11-21T00:00:00Z'))

    expect(done).toEqual(['PRO-1'])
    expect(await wallet(anna.id)).toEqual({ experience: 338, copper: 7050 })
    expect(await wallet(ben.id)).toEqual({ experience: 112, copper: 2350 })
    expect((await draft(db, 'PRO-1', giver))!.distributedBy).toBe('auto')
    expect((await draft(db, 'PRO-2', giver))!.distributedAt).toBeNull()
    const reward = (await inbox(db, anna)).find((message) => message.kind === 'reward')
    expect(reward).toMatchObject({ by: null, quest: { key: 'PRO-1' } })
  })

  it('lets a quest without anybody lapse', async () => {
    await recordQuest(db, record({ shares: [] }))

    expect(await distributeDue(db, new Date('2026-11-21T00:00:00Z'))).toEqual(['PRO-1'])
    expect((await draft(db, 'PRO-1', giver))!.distributedAt).not.toBeNull()
  })
})

describe('draft', () => {
  it('lets only the giver distribute', async () => {
    await recordQuest(db, record())

    expect((await draft(db, 'PRO-1', anna))!.mayDistribute).toBe(false)
    expect((await draft(db, 'PRO-1', null))!.mayDistribute).toBe(false)
    expect(await draft(db, 'PRO-9', giver)).toBeNull()
  })
})

describe('inbox', () => {
  it('shows only the reader’s own messages, newest first, and remembers what was read', async () => {
    await recordQuest(db, record())
    await recordQuest(db, record({ key: 'PRO-2', completedAt: new Date('2026-11-11T10:00:00Z') }))

    const before = await inbox(db, giver)
    expect(before.map((message) => message.quest.key)).toEqual(['PRO-2', 'PRO-1'])

    await markRead(db, anna, [before[0]!.id], now)
    expect((await inbox(db, giver)).every((message) => !message.read)).toBe(true)

    await markRead(db, giver, [before[0]!.id], now)
    expect((await inbox(db, giver)).map((message) => message.read)).toEqual([true, false])
  })

  it('accepts an empty list of read messages', async () => {
    await expect(markRead(db, giver, [], now)).resolves.toBeUndefined()
  })
})

describe('openPlayer', () => {
  const legacy = [
    {
      key: 'PRO-0',
      title: 'Alt',
      webUrl: 'https://jira.test/browse/PRO-0',
      difficulty: 'trivial' as const,
      experience: 150,
      copper: 2500,
      completedAt: new Date('2026-10-01T10:00:00Z'),
    },
  ]

  it('books the quests from before the cutoff once, at the old rule', async () => {
    expect(await isOpened(db, anna.id)).toBe(false)

    await openPlayer(db, anna, legacy, now)
    await openPlayer(db, anna, [...legacy, { ...legacy[0]!, key: 'PRO-00' }], now)

    expect(await isOpened(db, anna.id)).toBe(true)
    expect(await wallet(anna.id)).toEqual({ experience: 150, copper: 2500 })
    expect((await draft(db, 'PRO-0', anna))!.distributedBy).toBe('legacy')
    expect(await draft(db, 'PRO-00', anna)).toBeNull()
  })

  it('keeps what the player already earned before opening the profile', async () => {
    await recordQuest(db, record())
    await distribute(db, 'PRO-1', [{ ...anna, share: 1 }], giver.id, now)

    await openPlayer(db, anna, [...legacy, { ...legacy[0]!, key: 'PRO-1' }], now)

    expect(await wallet(anna.id)).toEqual({ experience: 600, copper: 11900 })
  })
})

describe('profile', () => {
  it('reads the wallet, the finished quests and what is still waiting for the giver', async () => {
    await recordQuest(db, record())
    await distribute(db, 'PRO-1', [{ ...anna, share: 1 }, { ...ben, share: 1 }], giver.id, now)
    await recordQuest(db, record({ key: 'PRO-2', title: 'Offen', completedAt: new Date('2026-11-11T10:00:00Z') }))

    const result = await profile(db, anna, '/api/avatar?url=x')

    expect(result).toMatchObject({
      name: 'Anna Berg',
      avatar: '/api/avatar?url=x',
      experience: 225,
      coins: { gold: 0, silver: 47, copper: 0 },
      completed: 1,
      pending: { experience: 338, coins: { gold: 0, silver: 70, copper: 50 }, quests: 1 },
    })
    expect(result.quests).toEqual([
      {
        key: 'PRO-1',
        title: 'Index nachts neu bauen',
        difficulty: 'easy',
        experience: 225,
        coins: { gold: 0, silver: 47, copper: 0 },
        share: 0.5,
        resolved: '2026-11-10T10:00:00.000Z',
        webUrl: 'https://jira.test/browse/PRO-1',
      },
    ])
  })

  it('does not count a quest the giver gave somebody else entirely', async () => {
    await recordQuest(db, record())
    await distribute(db, 'PRO-1', [{ ...anna, share: 0 }, { ...ben, share: 1 }], giver.id, now)

    expect(await profile(db, anna, null)).toMatchObject({ completed: 0, quests: [], experience: 0 })
  })

  it('starts empty for somebody it has never seen', async () => {
    expect(await profile(db, cara, null)).toEqual({
      name: 'Cara Dietz',
      avatar: null,
      experience: 0,
      coins: { gold: 0, silver: 0, copper: 0 },
      completed: 0,
      pending: { experience: 0, coins: { gold: 0, silver: 0, copper: 0 }, quests: 0 },
      quests: [],
    })
  })
})
