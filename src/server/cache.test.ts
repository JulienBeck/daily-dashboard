import { describe, expect, it, vi } from 'vitest'
import { StaleCache } from './cache.js'

describe('StaleCache', () => {
  it('calls the loader once inside the ttl', async () => {
    let clock = 1_000_000
    const cache = new StaleCache(() => clock)
    const load = vi.fn().mockResolvedValue('a')

    await cache.get('k', 60, load)
    clock += 59_000
    const second = await cache.get('k', 60, load)

    expect(load).toHaveBeenCalledTimes(1)
    expect(second.data).toBe('a')
    expect(second.stale).toBe(false)
  })

  it('reloads once the ttl has passed', async () => {
    let clock = 1_000_000
    const cache = new StaleCache(() => clock)
    const load = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b')

    await cache.get('k', 60, load)
    clock += 61_000
    expect((await cache.get('k', 60, load)).data).toBe('b')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('serves the last good value and flags it when the loader fails', async () => {
    let clock = 1_000_000
    const cache = new StaleCache(() => clock)
    const load = vi.fn().mockResolvedValueOnce('a').mockRejectedValueOnce(new Error('GitLab weg'))

    await cache.get('k', 60, load)
    clock += 61_000
    const result = await cache.get('k', 60, load)

    expect(result.data).toBe('a')
    expect(result.stale).toBe(true)
    expect(result.error).toBe('GitLab weg')
    expect(result.fetchedAt).toBe(new Date(1_000_000).toISOString())
  })

  it('throws when the very first load fails, because there is nothing to serve', async () => {
    const cache = new StaleCache(() => 0)
    await expect(cache.get('k', 60, () => Promise.reject(new Error('kaputt')))).rejects.toThrow('kaputt')
  })

  it('recovers after a failure instead of staying stale forever', async () => {
    let clock = 1_000_000
    const cache = new StaleCache(() => clock)
    const load = vi
      .fn()
      .mockResolvedValueOnce('a')
      .mockRejectedValueOnce(new Error('weg'))
      .mockResolvedValueOnce('c')

    await cache.get('k', 60, load)
    clock += 61_000
    await cache.get('k', 60, load)
    clock += 61_000
    const result = await cache.get('k', 60, load)

    expect(result.data).toBe('c')
    expect(result.stale).toBe(false)
  })

  it('reloads a key that was invalidated before its ttl ran out', async () => {
    const cache = new StaleCache(() => 1_000_000)
    const load = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b')

    await cache.get('k', 60, load)
    cache.invalidate('k')

    expect((await cache.get('k', 60, load)).data).toBe('b')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('leaves the other keys alone when one is invalidated', async () => {
    const cache = new StaleCache(() => 1_000_000)
    await cache.get('a', 60, () => Promise.resolve(1))
    await cache.get('b', 60, () => Promise.resolve(2))

    cache.invalidate('a')

    expect((await cache.get('b', 60, () => Promise.resolve(9))).data).toBe(2)
  })

  it('keeps separate keys apart', async () => {
    const cache = new StaleCache(() => 0)
    await cache.get('a', 60, () => Promise.resolve(1))
    expect((await cache.get('b', 60, () => Promise.resolve(2))).data).toBe(2)
    expect((await cache.get('a', 60, () => Promise.resolve(9))).data).toBe(1)
  })
})
