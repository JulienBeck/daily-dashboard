import { describe, expect, it, vi } from 'vitest'
import { retry } from './db.js'

describe('retry', () => {
  it('waits for the database instead of giving up on the first refusal', async () => {
    const work = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue('ready')
    const wait = vi.fn(async () => undefined)
    const onFailure = vi.fn()

    expect(await retry(work, 5, 3000, onFailure, wait)).toBe('ready')
    expect(work).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(3000)
    expect(onFailure.mock.calls.map(([, attempt]) => attempt)).toEqual([1, 2])
  })

  it('gives up after the last attempt with the last error', async () => {
    const work = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    const wait = vi.fn(async () => undefined)

    await expect(retry(work, 3, 10, undefined, wait)).rejects.toThrow('ECONNREFUSED')
    expect(work).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenCalledTimes(2)
  })

  it('does not wait when the first attempt works', async () => {
    const wait = vi.fn(async () => undefined)

    expect(await retry(async () => 1, 3, 10, undefined, wait)).toBe(1)
    expect(wait).not.toHaveBeenCalled()
  })
})
