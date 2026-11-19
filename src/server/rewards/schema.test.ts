import { afterEach, describe, expect, it } from 'vitest'
import type { Db } from '../db.js'
import { emptyDb as fresh } from './memoryDb.js'
import { migrate, MIGRATIONS, type Migration } from './schema.js'

const opened: Db[] = []

function emptyDb(): Db {
  const db = fresh()
  opened.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.close()))
})

const versions = async (db: Db) =>
  (await db.query<{ version: number }>('select version from schema_migration order by version')).rows.map(
    (row) => row.version,
  )

const columns = async (db: Db, table: string) =>
  (
    await db.query<{ column_name: string }>(
      'select column_name from information_schema.columns where table_name = $1',
      [table],
    )
  ).rows.map((row) => row.column_name)

describe('migrate', () => {
  it('builds an empty database up to the newest version', async () => {
    const db = emptyDb()

    expect(await migrate(db)).toEqual(MIGRATIONS.map((migration) => migration.version))

    expect(await versions(db)).toEqual(MIGRATIONS.map((migration) => migration.version))
    expect(await columns(db, 'player')).toContain('body')
  })

  it('runs every migration only once', async () => {
    const db = emptyDb()
    await migrate(db)

    expect(await migrate(db)).toEqual([])
  })

  it('takes over a database from before the versioning without losing a row', async () => {
    const db = emptyDb()
    for (const statement of MIGRATIONS[0]!.statements) await db.query(statement)
    await db.query(`insert into player (id, name, copper) values ('JIRAUSER1', 'Anna Berg', 9400)`)

    await migrate(db)

    expect((await db.query('select copper, body from player')).rows).toEqual([{ copper: 9400, body: 'male' }])
  })

  it('accepts only the two body types', async () => {
    const db = emptyDb()
    await migrate(db)

    await expect(db.query(`insert into player (id, name, body) values ('x', 'X', 'troll')`)).rejects.toThrow()
  })

  it('runs the migrations in version order, whatever order they are listed in', async () => {
    const db = emptyDb()
    const later: Migration = { version: 11, name: 'later', statements: ['alter table first add column b int'] }
    const first: Migration = { version: 10, name: 'first', statements: ['create table first (a int)'] }

    expect(await migrate(db, [later, first])).toEqual([10, 11])
  })

  it('leaves no trace of a migration that fails halfway', async () => {
    const db = emptyDb()
    const broken: Migration = {
      version: 10,
      name: 'broken',
      statements: ['create table half (a int)', 'select * from missing'],
    }

    await expect(migrate(db, [broken])).rejects.toThrow()

    expect(await versions(db)).toEqual([])
    expect(await columns(db, 'half')).toEqual([])
  })
})
