import type { Payload } from '../shared/types.js'

interface Entry<T> {
  data: T
  fetchedAt: number
  inflight: Promise<T> | null
}

export class StaleCache {
  private entries = new Map<string, Entry<unknown>>()

  constructor(private now: () => number = () => Date.now()) {}

  invalidate(key: string): void {
    this.entries.delete(key)
  }

  async get<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<Payload<T>> {
    const entry = this.entries.get(key) as Entry<T> | undefined
    const fresh = entry && this.now() - entry.fetchedAt < ttlSeconds * 1000

    if (fresh) {
      return { data: entry.data, fetchedAt: new Date(entry.fetchedAt).toISOString(), stale: false, error: null }
    }

    const inflight = entry?.inflight ?? load()
    if (entry) entry.inflight = inflight

    try {
      const data = await inflight
      this.entries.set(key, { data, fetchedAt: this.now(), inflight: null })
      return { data, fetchedAt: new Date(this.now()).toISOString(), stale: false, error: null }
    } catch (error) {
      if (entry) entry.inflight = null
      if (!entry) throw error
      return {
        data: entry.data,
        fetchedAt: new Date(entry.fetchedAt).toISOString(),
        stale: true,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
