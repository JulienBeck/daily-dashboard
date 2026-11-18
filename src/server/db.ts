import pg from 'pg'

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
}

export interface Db extends Sql {
  transaction<T>(work: (tx: Sql) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export function postgres(url: string): Db {
  const pool = new pg.Pool({ connectionString: url })
  const run = (client: pg.Pool | pg.PoolClient): Sql => ({
    query: async <T>(text: string, params?: unknown[]) => {
      const result = await client.query(text, params)
      return { rows: result.rows as T[] }
    },
  })
  return {
    ...run(pool),
    async transaction(work) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const result = await work(run(client))
        await client.query('commit')
        return result
      } catch (error) {
        await client.query('rollback')
        throw error
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function retry<T>(
  work: () => Promise<T>,
  attempts: number,
  delayMs: number,
  onFailure: (error: unknown, attempt: number) => void = () => undefined,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work()
    } catch (error) {
      if (attempt >= attempts) throw error
      onFailure(error, attempt)
      await wait(delayMs)
    }
  }
}
