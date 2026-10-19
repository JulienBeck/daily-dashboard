import { describe, expect, it, vi } from 'vitest'
import { parseConfig } from './config.js'
import {
  fetchPipelines,
  groupsOrThrow,
  newestOnRef,
  toMergeRequestRows,
  toPipelineRows,
} from './gitlab.js'

const now = new Date(2026, 9, 19)
const config = parseConfig({
  gitlab: { baseUrl: 'https://git.example.com', groups: ['fe/ki'], exclude: ['fe/ki/tot*'] },
}).gitlab

const project = (over: Partial<Record<string, any>> = {}) => ({
  fullPath: 'fe/ki/ki-backend',
  name: 'ki-backend',
  webUrl: 'https://git.example.com/fe/ki/ki-backend',
  archived: false,
  repository: { rootRef: 'master' },
  pipelines: {
    nodes: [
      {
        status: 'success',
        ref: 'master',
        finishedAt: new Date(2026, 9, 19, 8).toISOString(),
        createdAt: new Date(2026, 9, 19, 7).toISOString(),
        path: '/fe/ki/ki-backend/-/pipelines/1',
        user: { name: 'A. Hartmann' },
      },
    ],
  },
  ...over,
})

describe('newestOnRef', () => {
  const run = (over: Partial<Record<string, any>> = {}) => ({
    status: 'success',
    ref: 'master',
    source: 'push',
    finishedAt: null,
    createdAt: '2026-10-19T08:00:00.000Z',
    updatedAt: '2026-10-19T08:00:00.000Z',
    path: '/p/1',
    user: null,
    ...over,
  })

  it('takes the run that was touched last, not the one GitLab happens to list first', () => {
    const picked = newestOnRef(
      [
        run({ status: 'canceled', updatedAt: '2026-10-19T09:00:00.000Z', path: '/p/alt' }),
        run({ status: 'success', updatedAt: '2026-10-19T11:00:00.000Z', path: '/p/neu' }),
      ],
      'master',
    )
    expect(picked!.status).toBe('success')
  })

  it('sees a retry: same creation time, newer update time wins', () => {
    const picked = newestOnRef(
      [
        run({ status: 'failed', createdAt: '2026-10-19T08:00:00.000Z', updatedAt: '2026-10-19T08:30:00.000Z' }),
        run({ status: 'success', createdAt: '2026-10-19T08:00:00.000Z', updatedAt: '2026-10-19T10:00:00.000Z' }),
      ],
      'master',
    )
    expect(picked!.status).toBe('success')
  })

  it('ignores runs on another branch', () => {
    const picked = newestOnRef(
      [
        run({ status: 'failed', ref: 'feature/x', updatedAt: '2026-10-19T23:00:00.000Z' }),
        run({ status: 'success' }),
      ],
      'master',
    )
    expect(picked!.status).toBe('success')
  })

  it.each(['parent_pipeline', 'merge_request_event', 'external'])(
    'ignores a %s run, which is not the branch build',
    (source) => {
      const picked = newestOnRef(
        [
          run({ status: 'manual', source, updatedAt: '2026-10-19T23:00:00.000Z' }),
          run({ status: 'success' }),
        ],
        'master',
      )
      expect(picked!.status).toBe('success')
    },
  )

  it('keeps a scheduled run, because that is a real branch build', () => {
    const picked = newestOnRef(
      [run({ status: 'failed', source: 'schedule', updatedAt: '2026-10-19T23:00:00.000Z' })],
      'master',
    )
    expect(picked!.status).toBe('failed')
  })

  it('falls back to createdAt when GitLab sends no update time', () => {
    const picked = newestOnRef(
      [
        run({ status: 'failed', createdAt: '2026-10-19T08:00:00.000Z', updatedAt: null }),
        run({ status: 'success', createdAt: '2026-10-19T12:00:00.000Z', updatedAt: null }),
      ],
      'master',
    )
    expect(picked!.status).toBe('success')
  })

  it('returns null when nothing ran on the branch', () => {
    expect(newestOnRef([run({ ref: 'feature/x' })], 'master')).toBeNull()
    expect(newestOnRef([], 'master')).toBeNull()
  })
})

describe('toPipelineRows', () => {
  it('reads the pipeline of the default branch, not the newest one', () => {
    const rows = toPipelineRows(
      [
        project({
          pipelines: {
            nodes: [
              { status: 'failed', ref: 'feature/x', finishedAt: null, createdAt: now.toISOString(), path: '/p/2', user: null },
              { status: 'success', ref: 'master', finishedAt: now.toISOString(), createdAt: now.toISOString(), path: '/p/1', user: null },
            ],
          },
        }),
      ],
      config,
      now,
    )
    expect(rows[0]!.state).toBe('good')
    expect(rows[0]!.ref).toBe('master')
  })

  it('drops a project that has no pipeline on its default branch', () => {
    expect(toPipelineRows([project({ pipelines: { nodes: [] } })], config, now)).toHaveLength(0)
  })

  it('keeps such a project as idle when asked to', () => {
    const keep = { ...config, hideWithoutPipeline: false }
    const rows = toPipelineRows([project({ pipelines: { nodes: [] } })], keep, now)
    expect(rows[0]!.state).toBe('idle')
    expect(rows[0]!.webUrl).toBe('https://git.example.com/fe/ki/ki-backend')
  })

  it('keeps a project whose pipeline is merely old', () => {
    const stale = {
      status: 'success',
      ref: 'master',
      finishedAt: new Date(2026, 6, 1).toISOString(),
      createdAt: new Date(2026, 6, 1).toISOString(),
      path: '/p/9',
      user: null,
    }
    const rows = toPipelineRows([project({ pipelines: { nodes: [stale] } })], config, now)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.state).toBe('idle')
  })

  it('drops excluded projects', () => {
    const rows = toPipelineRows(
      [project(), project({ fullPath: 'fe/ki/tot-repo', name: 'tot-repo' })],
      config,
      now,
    )
    expect(rows.map((r) => r.name)).toEqual(['ki-backend'])
  })

  it('drops archived projects unless they are asked for', () => {
    const archived = project({ fullPath: 'fe/ki/alt', name: 'alt', archived: true })
    expect(toPipelineRows([archived], config, now)).toHaveLength(0)
    expect(toPipelineRows([archived], { ...config, includeArchived: true }, now)).toHaveLength(1)
  })

  const withStatus = (status: string, group: string | null, label: string | null) =>
    project({
      pipelines: {
        nodes: [
          {
            status,
            ref: 'master',
            source: 'push',
            finishedAt: now.toISOString(),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            path: '/p/1',
            user: null,
            detailedStatus: group ? { group, label } : null,
          },
        ],
      },
    })

  it('stays green when the run passed with warnings', () => {
    const rows = toPipelineRows(
      [withStatus('success', 'success-with-warnings', 'passed with warnings')],
      config,
      now,
    )
    expect(rows[0]!.state).toBe('good')
    expect(rows[0]!.detail).toBe('passed with warnings')
  })

  it('passes the detailed group on, even where the plain status says otherwise', () => {
    const rows = toPipelineRows(
      [withStatus('manual', 'success-with-warnings', 'passed with warnings')],
      config,
      now,
    )
    expect(rows[0]!.state).toBe('good')
  })

  it('marks a run that waits on a manual job', () => {
    const rows = toPipelineRows(
      [withStatus('manual', 'manual', 'waiting for manual action')],
      config,
      now,
    )
    expect(rows[0]!.waiting).toBe(true)
    expect(rows[0]!.state).toBe('good')
  })

  it('does not mark an ordinary run as waiting', () => {
    const rows = toPipelineRows([withStatus('success', 'success', 'passed')], config, now)
    expect(rows[0]!.waiting).toBe(false)
  })

  it('keeps the plain status when GitLab sends no detail', () => {
    const rows = toPipelineRows([withStatus('canceled', null, null)], config, now)
    expect(rows[0]!.state).toBe('warning')
    expect(rows[0]!.detail).toBeNull()
  })

  it('builds an absolute pipeline link from the relative path', () => {
    expect(toPipelineRows([project()], config, now)[0]!.webUrl).toBe(
      'https://git.example.com/fe/ki/ki-backend/-/pipelines/1',
    )
  })

  it('survives a project without a repository', () => {
    const rows = toPipelineRows([project({ repository: null })], config, now)
    expect(rows[0]!.ref).toBe('master')
  })
})

describe('toMergeRequestRows', () => {
  const mr = (over: Partial<Record<string, any>> = {}) => ({
    title: 'Etwas reparieren',
    webUrl: 'https://git.example.com/mr/1',
    createdAt: new Date(2026, 9, 7).toISOString(),
    draft: false,
    author: { name: 'J. Beck' },
    project: { name: 'ki-backend' },
    approvedBy: { nodes: [] },
    ...over,
  })

  it('hides drafts, because nobody reviews them in the daily', () => {
    expect(toMergeRequestRows([mr({ draft: true })], now)).toHaveLength(0)
  })

  it('sorts the oldest to the top', () => {
    const rows = toMergeRequestRows(
      [mr({ title: 'jung', createdAt: new Date(2026, 9, 18).toISOString() }), mr({ title: 'alt' })],
      now,
    )
    expect(rows.map((r) => r.title)).toEqual(['alt', 'jung'])
  })

  it('counts whole days of age', () => {
    expect(toMergeRequestRows([mr()], now)[0]!.ageDays).toBe(12)
  })

  it('never reports a negative age for a future timestamp', () => {
    expect(toMergeRequestRows([mr({ createdAt: new Date(2026, 9, 25).toISOString() })], now)[0]!.ageDays).toBe(0)
  })

  it('reports how many approvals a request already has', () => {
    const rows = toMergeRequestRows([mr({ approvedBy: { nodes: [{ name: 'S. Kern' }] } })], now)
    expect(rows[0]!.approvals).toBe(1)
  })
})

describe('fetchPipelines', () => {
  const ok = (data: unknown) =>
    ({ ok: true, status: 200, statusText: 'OK', json: async () => ({ data }) }) as Response

  it('sends the token as a bearer header to the graphql endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ group: { projects: { nodes: [project()] } } }))
    await fetchPipelines(config, 'geheim', { fetch: fetchMock as never, now: () => now })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://git.example.com/api/graphql')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer geheim')
  })

  it('turns an http error into a readable message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' })
    await expect(
      fetchPipelines(config, 'falsch', { fetch: fetchMock as never, now: () => now }),
    ).rejects.toThrow('GitLab 401 Unauthorized')
  })

  it('reports graphql errors instead of returning an empty board', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ errors: [{ message: 'Feld fehlt' }] }),
    })
    await expect(
      fetchPipelines(config, 't', { fetch: fetchMock as never, now: () => now }),
    ).rejects.toThrow('Feld fehlt')
  })

  it('says so when the group is invisible instead of showing an empty board', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ group: null }))
    await expect(
      fetchPipelines(config, 't', { fetch: fetchMock as never, now: () => now }),
    ).rejects.toThrow('fe/ki')
  })

  it('returns an empty list when the group exists but holds no projects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ group: { projects: { nodes: [] } } }))
    await expect(
      fetchPipelines(config, 't', { fetch: fetchMock as never, now: () => now }),
    ).resolves.toEqual([])
  })
})

describe('groupsOrThrow', () => {
  it('names every missing group, not just the first', () => {
    expect(() =>
      groupsOrThrow(['a/b', 'c/d', 'e/f'], [{ group: null }, { group: 1 }, { group: null }]),
    ).toThrow('a/b, e/f')
  })

  it('passes the groups through when they all resolved', () => {
    expect(groupsOrThrow(['a/b'], [{ group: 7 }])).toEqual([7])
  })

  it('points at the full path, because a short path is the usual cause', () => {
    expect(() => groupsOrThrow(['fe/ki'], [{ group: null }])).toThrow(/vollständige Pfad/)
  })
})
