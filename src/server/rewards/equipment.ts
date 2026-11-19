import type { Body, OwnedItem } from '../../shared/avatar.js'
import type { Person } from '../../shared/rewards.js'
import type { Db, Sql } from '../db.js'

export async function outfit(db: Db, person: Person, starter: readonly OwnedItem[], now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into player (id, name) values ($1, $2)
       on conflict (id) do update set name = excluded.name`,
      [person.id, person.name],
    )
    const { rows } = await tx.query<{ outfitted_at: unknown }>(
      'select outfitted_at from player where id = $1 for update',
      [person.id],
    )
    if (rows[0]?.outfitted_at != null) return
    for (const [index, item] of starter.entries()) {
      await tx.query(
        `insert into inventory (player_id, item_id, equipped, acquired_at) values ($1, $2, $3, $4)
         on conflict (player_id, item_id) do nothing`,
        [person.id, item.id, item.equipped, new Date(now.getTime() + index)],
      )
    }
    await tx.query('update player set outfitted_at = $2 where id = $1', [person.id, now])
  })
}

export async function inventory(db: Sql, playerId: string): Promise<OwnedItem[]> {
  const { rows } = await db.query<{ item_id: string; equipped: boolean }>(
    'select item_id, equipped from inventory where player_id = $1 order by acquired_at, item_id',
    [playerId],
  )
  return rows.map((row) => ({ id: row.item_id, equipped: Boolean(row.equipped) }))
}

export async function setEquipped(
  db: Db,
  playerId: string,
  itemId: string,
  sameSlot: readonly string[],
  equipped: boolean,
): Promise<void> {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      'select 1 from inventory where player_id = $1 and item_id = $2 for update',
      [playerId, itemId],
    )
    if (rows.length === 0) throw new Error(`${itemId} gehört nicht zur Ausrüstung`)
    if (equipped) {
      await tx.query('update inventory set equipped = false where player_id = $1 and item_id = any($2)', [
        playerId,
        sameSlot,
      ])
    }
    await tx.query('update inventory set equipped = $3 where player_id = $1 and item_id = $2', [
      playerId,
      itemId,
      equipped,
    ])
  })
}

export async function bodyOf(db: Sql, playerId: string): Promise<Body> {
  const { rows } = await db.query<{ body: Body }>('select body from player where id = $1', [playerId])
  return rows[0]?.body ?? 'male'
}

export async function setBody(db: Sql, playerId: string, body: Body): Promise<void> {
  await db.query('update player set body = $2 where id = $1', [playerId, body])
}
