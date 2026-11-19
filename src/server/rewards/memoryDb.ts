import { PGlite, type Transaction } from '@electric-sql/pglite'
import type { Db, Sql } from '../db.js'
import { migrate } from './schema.js'

const wrap = (target: PGlite | Transaction): Sql => ({
  query: async <T>(text: string, params?: unknown[]) => ({
    rows: (await target.query<T>(text, params)).rows,
  }),
})

export function emptyDb(): Db {
  const lite = new PGlite()
  return {
    ...wrap(lite),
    transaction: (work) => lite.transaction((tx) => work(wrap(tx))),
    close: () => lite.close(),
  }
}

export async function memoryDb(): Promise<Db> {
  const db = emptyDb()
  await migrate(db)
  return db
}
