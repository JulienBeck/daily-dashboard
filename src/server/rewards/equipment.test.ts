import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db.js'
import { inventory, outfit, setEquipped } from './equipment.js'
import { memoryDb } from './memoryDb.js'

const anna = { id: 'JIRAUSER1', name: 'Anna Berg' }
const starter = [
  { id: 'wool-hood', equipped: true },
  { id: 'iron-helm', equipped: false },
  { id: 'short-sword', equipped: true },
]
const now = new Date('2026-11-18T09:00:00Z')
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

describe('outfit', () => {
  it('hands a new player the starter kit in its order', async () => {
    await outfit(db, anna, starter, now)

    expect(await inventory(db, anna.id)).toEqual(starter)
  })

  it('hands it out only once, so what was put away stays away', async () => {
    await outfit(db, anna, starter, now)
    await setEquipped(db, anna.id, 'wool-hood', ['wool-hood', 'iron-helm'], false)

    await outfit(db, anna, [...starter, { id: 'flanged-mace', equipped: true }], now)

    expect(await inventory(db, anna.id)).toEqual([
      { id: 'wool-hood', equipped: false },
      { id: 'iron-helm', equipped: false },
      { id: 'short-sword', equipped: true },
    ])
  })
})

describe('setEquipped', () => {
  it('puts on an item and takes off whatever held its slot', async () => {
    await outfit(db, anna, starter, now)

    await setEquipped(db, anna.id, 'iron-helm', ['wool-hood', 'iron-helm'], true)

    expect(await inventory(db, anna.id)).toEqual([
      { id: 'wool-hood', equipped: false },
      { id: 'iron-helm', equipped: true },
      { id: 'short-sword', equipped: true },
    ])
  })

  it('takes an item off', async () => {
    await outfit(db, anna, starter, now)

    await setEquipped(db, anna.id, 'short-sword', ['short-sword', 'flanged-mace'], false)

    expect((await inventory(db, anna.id)).find((item) => item.id === 'short-sword')).toEqual({
      id: 'short-sword',
      equipped: false,
    })
  })

  it('refuses an item the player does not own', async () => {
    await outfit(db, anna, starter, now)

    await expect(setEquipped(db, anna.id, 'flanged-mace', ['short-sword', 'flanged-mace'], true)).rejects.toThrow(
      'gehört nicht zur Ausrüstung',
    )
    expect((await inventory(db, anna.id)).find((item) => item.id === 'short-sword')?.equipped).toBe(true)
  })

  it('has nothing for somebody it has never seen', async () => {
    expect(await inventory(db, 'nobody')).toEqual([])
  })
})
