import { describe, expect, it, vi } from 'vitest'
import { eventPath, fetchCommits, sinceOf, toCommitRows, type PushEvent } from './activity.js'

const names = new Map([
  [1, 'ki-backend'],
  [2, 'ai-chat'],
])

const push = (over: Partial<PushEvent> = {}): PushEvent => ({
  created_at: '2026-10-18T09:00:00.000Z',
  project_id: 1,
  push_data: { commit_count: 1, commit_title: 'Etwas reparieren', ref: 'master' },
  ...over,
})

describe('sinceOf', () => {
  it('goes back whole days and keeps only the date', () => {
    expect(sinceOf(new Date(2026, 9, 19), 1)).toBe('2026-10-18')
  })

  it('crosses the month boundary', () => {
    expect(sinceOf(new Date(2026, 10, 1), 1)).toBe('2026-10-31')
  })

  it('can look back further than a day', () => {
    expect(sinceOf(new Date(2026, 9, 19), 7)).toBe('2026-10-12')
  })

  it('pads month and day, because GitLab rejects 2026-1-4', () => {
    expect(sinceOf(new Date(2026, 0, 5), 1)).toBe('2026-01-04')
  })

  it('stays on the local date instead of slipping a day through UTC', () => {
    expect(sinceOf(new Date(2026, 9, 19, 0, 30), 0)).toBe('2026-10-19')
  })
})

describe('eventPath', () => {
  it('reads the token owner for the member marked as self', () => {
    expect(eventPath({ gitlabUser: null, self: true }, '2026-10-18')).toContain('/events?')
  })

  it('reads a named user for everybody else', () => {
    expect(eventPath({ gitlabUser: 'a.hartmann', self: false }, '2026-10-18')).toContain(
      '/users/a.hartmann/events',
    )
  })

  it('fetches nothing for a member without a gitlab name', () => {
    expect(eventPath({ gitlabUser: null, self: false }, '2026-10-18')).toBeNull()
  })

  it('escapes a name with a dot or slash in it', () => {
    expect(eventPath({ gitlabUser: 'a/b', self: false }, '2026-10-18')).toContain('/users/a%2Fb/')
  })

  it('passes the cut-off date along', () => {
    expect(eventPath({ gitlabUser: null, self: true }, '2026-10-18')).toContain('after=2026-10-18')
  })
})

describe('fetchCommits', () => {
  const config = { baseUrl: 'https://git.example.com' } as never

  it('asks GitLab nothing for a member without a gitlab name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    const result = await fetchCommits(
      config,
      't',
      { fetch: fetchMock as never, now: () => new Date(2026, 9, 19) },
      [{ name: 'Timo', gitlabUser: null, self: false }],
      1,
      5,
    )
    expect(result).toEqual({ Timo: [] })
    // one call for the project list, none for the member
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('asks once per member that has a channel', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    await fetchCommits(
      config,
      't',
      { fetch: fetchMock as never, now: () => new Date(2026, 9, 19) },
      [
        { name: 'Julien', gitlabUser: null, self: true },
        { name: 'Timo', gitlabUser: 'timo', self: false },
        { name: 'Daniel', gitlabUser: null, self: false },
      ],
      1,
      5,
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('toCommitRows', () => {
  it('resolves the project name from the id', () => {
    expect(toCommitRows([push()], names, 5)[0]!.project).toBe('ki-backend')
  })

  it('says so rather than inventing a name for an unknown project', () => {
    expect(toCommitRows([push({ project_id: 99 })], names, 5)[0]!.project).toBe('—')
  })

  it('drops events that carry no commit title', () => {
    const empty = push({ push_data: { commit_count: 0, commit_title: null } })
    expect(toCommitRows([empty], names, 5)).toHaveLength(0)
  })

  it('drops events without push data at all', () => {
    expect(toCommitRows([push({ push_data: undefined })], names, 5)).toHaveLength(0)
  })

  it('puts the newest push first', () => {
    const rows = toCommitRows(
      [
        push({ created_at: '2026-10-18T08:00:00.000Z', push_data: { commit_title: 'alt' } }),
        push({ created_at: '2026-10-18T17:00:00.000Z', push_data: { commit_title: 'neu' } }),
      ],
      names,
      5,
    )
    expect(rows.map((row) => row.title)).toEqual(['neu', 'alt'])
  })

  it('honours the per-member limit', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      push({ created_at: `2026-10-18T0${i}:00:00.000Z`, push_data: { commit_title: `c${i}` } }),
    )
    expect(toCommitRows(many, names, 3)).toHaveLength(3)
  })

  it('keeps the commit count so a big push is visible', () => {
    const rows = toCommitRows(
      [push({ push_data: { commit_count: 7, commit_title: 'Grosser Wurf' } })],
      names,
      5,
    )
    expect(rows[0]!.count).toBe(7)
  })

  it('assumes a single commit when the count is missing', () => {
    const rows = toCommitRows([push({ push_data: { commit_title: 'Eins' } })], names, 5)
    expect(rows[0]!.count).toBe(1)
  })
})
