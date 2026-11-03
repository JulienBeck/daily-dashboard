import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMergeRequests, getPipelines } from './api.js'

const ok = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })

afterEach(() => {
  vi.unstubAllGlobals()
})

const calledUrl = (fetch: ReturnType<typeof ok>) => String(fetch.mock.calls[0]![0])

describe('api', () => {
  it('asks the proxy for a fresh sweep when the reload button sets the flag', async () => {
    const fetch = ok({ data: [], stale: false })
    vi.stubGlobal('fetch', fetch)

    await getPipelines(true)

    expect(calledUrl(fetch)).toMatch(/\/api\/pipelines\?fresh=1$/)
  })

  it('leaves the cache alone on the ordinary poll', async () => {
    const fetch = ok({ data: [], stale: false })
    vi.stubGlobal('fetch', fetch)

    await getPipelines()

    expect(calledUrl(fetch)).toMatch(/\/api\/pipelines$/)
  })

  it('adds no flag to the endpoints that have no reload button', async () => {
    const fetch = ok({ data: [], stale: false })
    vi.stubGlobal('fetch', fetch)

    await getMergeRequests()

    expect(calledUrl(fetch)).toMatch(/\/api\/mrs$/)
  })

  it('carries the proxy message into the thrown error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.resolve({ error: 'GITLAB_TOKEN ist nicht gesetzt' }),
      }),
    )

    await expect(getPipelines(true)).rejects.toThrow('GITLAB_TOKEN ist nicht gesetzt')
  })
})
