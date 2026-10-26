import { describe, expect, it, vi } from 'vitest'
import {
  cutoffOf,
  eventPath,
  eventsInWindow,
  fetchCommits,
  lastWorkdayStart,
  missingProjectIds,
  sinceOf,
  toCommitRows,
  type PushEvent,
} from './activity.js'

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

describe('cutoffOf', () => {
  it('goes back the given hours, not whole days', () => {
    expect(cutoffOf(new Date(2026, 9, 23, 9, 0), 36)).toEqual(new Date(2026, 9, 21, 21, 0))
  })

  it('reaches yesterday morning from today at nine', () => {
    expect(cutoffOf(new Date(2026, 9, 23, 9, 0), 36).getDate()).toBe(21)
  })

  it('leaves the weekend alone when nobody asked for it', () => {
    expect(cutoffOf(MONDAY, 36)).toEqual(new Date(2026, 9, 31, 21, 0))
  })
})

// Monday 2026-11-02; the week before carries the end of summer time, which
// shifts every literal by an hour and has nothing to do with what is tested.
const MONDAY = new Date(2026, 10, 2, 9, 0)
const TUESDAY = new Date(2026, 10, 3, 9, 0)
const SUNDAY = new Date(2026, 10, 1, 9, 0)
const FRIDAY_MIDNIGHT = new Date(2026, 9, 30)

describe('cutoffOf over the last workday', () => {
  it('reaches back over the weekend to friday midnight on a monday', () => {
    expect(cutoffOf(MONDAY, 36, true)).toEqual(FRIDAY_MIDNIGHT)
  })

  it('changes nothing on a tuesday, where the hours already cover monday', () => {
    expect(cutoffOf(TUESDAY, 36, true)).toEqual(cutoffOf(TUESDAY, 36))
    expect(cutoffOf(TUESDAY, 36, true)).toEqual(new Date(2026, 10, 1, 21, 0))
  })

  it('reaches back to friday from a sunday as well', () => {
    expect(cutoffOf(SUNDAY, 36, true)).toEqual(FRIDAY_MIDNIGHT)
  })

  it('keeps the wider window when the hours already reach further back', () => {
    expect(cutoffOf(MONDAY, 96, true)).toEqual(new Date(2026, 9, 29, 9, 0))
  })
})

describe('lastWorkdayStart', () => {
  it('skips saturday and sunday from a monday', () => {
    expect(lastWorkdayStart(MONDAY)).toEqual(FRIDAY_MIDNIGHT)
  })

  it('takes plain yesterday in the middle of the week', () => {
    expect(lastWorkdayStart(new Date(2026, 10, 4, 9, 0))).toEqual(new Date(2026, 10, 3))
  })

  it('takes friday from a saturday, not the day before that', () => {
    expect(lastWorkdayStart(new Date(2026, 9, 31, 9, 0))).toEqual(FRIDAY_MIDNIGHT)
  })
})

describe('sinceOf', () => {
  it('asks a day earlier than the cut-off, because GitLab after= is exclusive', () => {
    expect(sinceOf(new Date(2026, 9, 23, 9, 0), 36)).toBe('2026-10-20')
  })

  it('still covers yesterday at a short window late in the day', () => {
    expect(sinceOf(new Date(2026, 9, 23, 23, 0), 1)).toBe('2026-10-22')
  })

  it('crosses the month boundary', () => {
    expect(sinceOf(new Date(2026, 10, 1, 9, 0), 36)).toBe('2026-10-29')
  })

  it('pads month and day, because GitLab rejects 2026-1-4', () => {
    expect(sinceOf(new Date(2026, 0, 6, 9, 0), 36)).toBe('2026-01-03')
  })

  it('stays on the local date instead of slipping a day through UTC', () => {
    expect(sinceOf(new Date(2026, 9, 19, 0, 30), 0)).toBe('2026-10-18')
  })

  it('asks back past the weekend on a monday, so friday survives the prefilter', () => {
    expect(sinceOf(MONDAY, 36, true)).toBe('2026-10-29')
  })

  it('asks no further than usual on a tuesday', () => {
    expect(sinceOf(TUESDAY, 36, true)).toBe('2026-10-31')
  })
})

describe('eventsInWindow', () => {
  const cutoff = new Date('2026-10-22T09:00:00.000Z')

  it('keeps a push from inside the window', () => {
    const kept = eventsInWindow([push({ created_at: '2026-10-22T10:00:00.000Z' })], cutoff)
    expect(kept).toHaveLength(1)
  })

  it('keeps a push that sits exactly on the cut-off', () => {
    const kept = eventsInWindow([push({ created_at: '2026-10-22T09:00:00.000Z' })], cutoff)
    expect(kept).toHaveLength(1)
  })

  it('drops a push from before the window', () => {
    const kept = eventsInWindow([push({ created_at: '2026-10-22T08:59:59.000Z' })], cutoff)
    expect(kept).toHaveLength(0)
  })

  it('drops a push without a commit title', () => {
    const stale = push({ created_at: '2026-10-22T10:00:00.000Z', push_data: { commit_title: null } })
    expect(eventsInWindow([stale], cutoff)).toHaveLength(0)
  })

  it('drops a push whose date cannot be read, rather than letting it through', () => {
    expect(eventsInWindow([push({ created_at: 'gestern' })], cutoff)).toHaveLength(0)
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
      36,
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
      36,
      5,
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  const monday = { fetch: null as never, now: () => MONDAY }
  const friday = push({ created_at: '2026-10-30T15:00:00.000Z', project_id: 1 })

  it('drops fridays push on a monday without the workday window', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 1, name: 'ki-backend' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [friday] })

    const result = await fetchCommits(
      config,
      't',
      { ...monday, fetch: fetchMock as never },
      [{ name: 'Julien', gitlabUser: null, self: true }],
      36,
      5,
    )
    expect(result.Julien).toEqual([])
  })

  it('keeps fridays push on a monday and asks gitlab far enough back', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 1, name: 'ki-backend' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [friday] })

    const result = await fetchCommits(
      config,
      't',
      { ...monday, fetch: fetchMock as never },
      [{ name: 'Julien', gitlabUser: null, self: true }],
      36,
      5,
      true,
    )

    expect(String(fetchMock.mock.calls[1]![0])).toContain('after=2026-10-29')
    expect(result.Julien).toHaveLength(1)
    expect(result.Julien![0]!.project).toBe('ki-backend')
  })
})

describe('fetchCommits logging', () => {
  const config = { baseUrl: 'https://git.example.com' } as never
  const ok = (body: unknown) => ({ ok: true, json: async () => body })

  const run = async (
    members: { name: string; gitlabUser: string | null; self: boolean }[],
    fetchMock: ReturnType<typeof vi.fn>,
  ) => {
    const lines: string[] = []
    await fetchCommits(
      config,
      't',
      { fetch: fetchMock as never, now: () => new Date(2026, 9, 19), log: (m) => lines.push(m) },
      members,
      36,
      5,
    )
    return lines.join('\n')
  }

  it('says so when a member has no gitlab user at all', async () => {
    const lines = await run(
      [{ name: 'Timo', gitlabUser: null, self: false }],
      vi.fn().mockResolvedValue(ok([])),
    )
    expect(lines).toContain('Timo')
    expect(lines).toContain('keinen gitlabUser')
  })

  it('suspects a group token out loud when the own event feed is empty', async () => {
    const lines = await run(
      [{ name: 'Julien', gitlabUser: null, self: true }],
      vi.fn().mockResolvedValue(ok([])),
    )
    expect(lines).toContain('Bot-Benutzer')
  })

  it('names the queried username when a foreign feed is empty', async () => {
    const lines = await run(
      [{ name: 'Timo', gitlabUser: 'timo', self: false }],
      vi.fn().mockResolvedValue(ok([])),
    )
    expect(lines).toContain('/users/timo/events')
  })

  it('reports a failing request instead of swallowing it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })
    const lines = await run([{ name: 'Timo', gitlabUser: 'tippfehler', self: false }], fetchMock)
    expect(lines).toContain('nicht lesbar')
    expect(lines).toContain('404')
  })

  it('separates "nothing pushed" from "nothing recent"', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([push({ created_at: '2020-01-01T09:00:00.000Z' })]))
    const lines = await run([{ name: 'Timo', gitlabUser: 'timo', self: false }], fetchMock)
    expect(lines).toContain('keinen im Fenster')
  })

  it('stays quiet when there is something to show', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok([push()]))
    const lines = await run([{ name: 'Timo', gitlabUser: 'timo', self: false }], fetchMock)
    expect(lines).toBe('')
  })
})

describe('missingProjectIds', () => {
  it('names the projects the membership list does not cover', () => {
    expect(missingProjectIds([push({ project_id: 99 })], names)).toEqual([99])
  })

  it('asks for an unknown project only once, however often it was pushed to', () => {
    expect(
      missingProjectIds([push({ project_id: 99 }), push({ project_id: 99 })], names),
    ).toEqual([99])
  })

  it('stays quiet for projects that are already known', () => {
    expect(missingProjectIds([push({ project_id: 1 })], names)).toEqual([])
  })

  it('ignores events that never become a row', () => {
    const empty = push({ project_id: 99, push_data: { commit_title: null } })
    expect(missingProjectIds([empty], names)).toEqual([])
  })

  it('ignores an event without a project at all', () => {
    expect(missingProjectIds([push({ project_id: undefined })], names)).toEqual([])
  })
})

describe('fetchCommits project names', () => {
  const config = { baseUrl: 'https://git.example.com' } as never
  const deps = () => ({ fetch: vi.fn(), now: () => new Date(2026, 9, 19) })
  const ok = (body: unknown) => ({ ok: true, json: async () => body })
  const member = [{ name: 'Julien', gitlabUser: null, self: true }]

  it('looks a project up when it is not in the membership list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok([{ id: 1, name: 'ki-backend' }]))
      .mockResolvedValueOnce(ok([push({ project_id: 77 })]))
      .mockResolvedValueOnce(ok({ id: 77, name: 'daily-dashboard' }))

    const result = await fetchCommits(
      config,
      't',
      { fetch: fetchMock as never, now: () => new Date(2026, 9, 19) },
      member,
      36,
      5,
    )

    expect(String(fetchMock.mock.calls[2]![0])).toContain('/projects/77')
    expect(result.Julien![0]!.project).toBe('daily-dashboard')
  })

  it('looks nothing up when the membership list already knows the project', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok([{ id: 1, name: 'ki-backend' }]))
      .mockResolvedValueOnce(ok([push({ project_id: 1 })]))

    const result = await fetchCommits(config, 't', { ...deps(), fetch: fetchMock as never }, member, 36, 5)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.Julien![0]!.project).toBe('ki-backend')
  })

  it('keeps the dash when even the lookup fails, instead of losing the commit', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([push({ project_id: 77 })]))
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })

    const result = await fetchCommits(config, 't', { ...deps(), fetch: fetchMock as never }, member, 36, 5)

    expect(result.Julien).toHaveLength(1)
    expect(result.Julien![0]!.project).toBe('—')
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

  it('puts the repository with the newest push first', () => {
    const rows = toCommitRows(
      [
        push({ project_id: 1, created_at: '2026-10-18T08:00:00.000Z', push_data: { commit_title: 'alt' } }),
        push({ project_id: 2, created_at: '2026-10-18T17:00:00.000Z', push_data: { commit_title: 'neu' } }),
      ],
      names,
      5,
    )
    expect(rows.map((row) => row.project)).toEqual(['ai-chat', 'ki-backend'])
  })

  it('honours the per-member limit, now counted in repositories', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      push({
        project_id: i,
        created_at: `2026-10-18T0${i}:00:00.000Z`,
        push_data: { commit_title: `c${i}` },
      }),
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

  it('folds several pushes to one repository into a single row', () => {
    const rows = toCommitRows(
      [
        push({ project_id: 1, created_at: '2026-10-22T08:00:00.000Z' }),
        push({ project_id: 1, created_at: '2026-10-22T17:00:00.000Z' }),
      ],
      names,
      5,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.project).toBe('ki-backend')
  })

  it('adds the commits of every push in that repository up', () => {
    const rows = toCommitRows(
      [
        push({ project_id: 1, created_at: '2026-10-22T08:00:00.000Z', push_data: { commit_count: 2, commit_title: 'a' } }),
        push({ project_id: 1, created_at: '2026-10-22T17:00:00.000Z', push_data: { commit_count: 5, commit_title: 'b' } }),
      ],
      names,
      5,
    )
    expect(rows[0]!.count).toBe(7)
  })

  it('shows the newest title of the repository, whatever order the events arrive in', () => {
    const early = push({ project_id: 1, created_at: '2026-10-22T08:00:00.000Z', push_data: { commit_title: 'alt', ref: 'alt-branch' } })
    const late = push({ project_id: 1, created_at: '2026-10-22T17:00:00.000Z', push_data: { commit_title: 'neu', ref: 'master' } })

    for (const events of [[early, late], [late, early]]) {
      const row = toCommitRows(events, names, 5)[0]!
      expect(row.title).toBe('neu')
      expect(row.ref).toBe('master')
      expect(row.at).toBe('2026-10-22T17:00:00.000Z')
    }
  })

  it('keeps two different repositories apart', () => {
    const rows = toCommitRows(
      [push({ project_id: 1 }), push({ project_id: 2 })],
      names,
      5,
    )
    expect(rows.map((row) => row.project).sort()).toEqual(['ai-chat', 'ki-backend'])
  })

  it('keeps two unknown repositories apart instead of merging them under one dash', () => {
    const rows = toCommitRows(
      [push({ project_id: 98 }), push({ project_id: 99 })],
      names,
      5,
    )
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.project === '—')).toBe(true)
  })
})
