import { describe, expect, it, vi } from 'vitest'
import { parseConfig } from './config.js'
import {
  apiPath,
  authHeader,
  avatarUrl,
  detectFlavor,
  sameOrigin,
  toEpicRows,
  epicsJqlFor,
  estimationField,
  fetchEpics,
  fetchTeamAvatars,
  initialsOf,
  pickUser,
  queriesFor,
  userSearchPath,
  isIssueKey,
  isLane,
  laneOf,
  moveIssue,
  pickStoryPointsField,
  pickTransition,
  summarise,
  toIssueRows,
  weekOf,
} from './jira.js'

const config = parseConfig({ jira: { baseUrl: 'https://jira.example.com' } }).jira
const now = new Date(2026, 9, 19)

describe('authHeader', () => {
  it('uses a bearer token on server and data center', () => {
    expect(authHeader({ token: 'abc', email: null }, 'server')).toBe('Bearer abc')
  })

  it('uses basic auth with the mail address on cloud', () => {
    const header = authHeader({ token: 'abc', email: 'j@example.com' }, 'cloud')
    expect(header.startsWith('Basic ')).toBe(true)
    expect(Buffer.from(header.slice(6), 'base64').toString()).toBe('j@example.com:abc')
  })
})

describe('apiPath', () => {
  it('picks the api version that belongs to the flavor', () => {
    expect(apiPath('server')).toBe('2')
    expect(apiPath('cloud')).toBe('3')
  })
})

describe('detectFlavor', () => {
  it('trusts an explicit setting without asking jira', async () => {
    const fetchMock = vi.fn()
    expect(await detectFlavor({ ...config, flavor: 'cloud' }, { token: 't', email: null }, { fetch: fetchMock as never, now: () => now })).toBe('cloud')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads the deployment type from serverInfo', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ deploymentType: 'Server' }) })
    expect(await detectFlavor(config, { token: 't', email: null }, { fetch: fetchMock as never, now: () => now })).toBe('server')
  })

  it('assumes cloud when the server endpoint is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    expect(await detectFlavor(config, { token: 't', email: null }, { fetch: fetchMock as never, now: () => now })).toBe('cloud')
  })
})

describe('initialsOf', () => {
  it.each([
    ['Jan Beck', 'JB'],
    ['A. Hartmann', 'AH'],
    ['Madonna', 'M'],
    [null, '?'],
  ])('turns %s into %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })

  it('stops at two letters for a long name', () => {
    expect(initialsOf('Maria Anna von Habsburg')).toBe('MA')
  })
})

describe('laneOf', () => {
  it('maps the three jira status categories onto the board lanes', () => {
    expect(laneOf('done', config)).toBe('done')
    expect(laneOf('indeterminate', config)).toBe('doing')
    expect(laneOf('new', config)).toBe('todo')
  })

  it('puts an unknown category into to-do rather than hiding it', () => {
    expect(laneOf('', config)).toBe('todo')
  })
})

describe('pickStoryPointsField', () => {
  it('finds the cloud field name', () => {
    expect(pickStoryPointsField([{ id: 'customfield_10016', name: 'Story point estimate' }])).toBe('customfield_10016')
  })

  it('finds the data center field name', () => {
    expect(pickStoryPointsField([{ id: 'customfield_10002', name: 'Story Points' }])).toBe('customfield_10002')
  })

  it('returns null instead of guessing a wrong field', () => {
    expect(pickStoryPointsField([{ id: 'customfield_1', name: 'Sprint' }])).toBeNull()
  })
})

describe('toIssueRows', () => {
  const issue = (over: Record<string, any> = {}) => ({
    key: 'KI-612',
    fields: {
      summary: 'Mehrere Replikas absichern',
      assignee: { displayName: 'A. Hartmann' },
      status: { statusCategory: { key: 'indeterminate' } },
      customfield_10016: 8,
      ...over,
    },
  })

  it('reads summary, assignee, points and lane', () => {
    const rows = toIssueRows([issue()], config, 'customfield_10016', 'https://jira.example.com')
    expect(rows[0]).toMatchObject({
      key: 'KI-612',
      summary: 'Mehrere Replikas absichern',
      initials: 'AH',
      points: 8,
      lane: 'doing',
      webUrl: 'https://jira.example.com/browse/KI-612',
    })
  })

  it('leaves points null when the field is unknown', () => {
    expect(toIssueRows([issue()], config, null, '')[0]!.points).toBeNull()
  })

  it('leaves points null when the field holds something other than a number', () => {
    const rows = toIssueRows([issue({ customfield_10016: 'acht' })], config, 'customfield_10016', '')
    expect(rows[0]!.points).toBeNull()
  })

  it('copes with an unassigned issue', () => {
    const rows = toIssueRows([issue({ assignee: null })], config, null, '')
    expect(rows[0]!.assignee).toBeNull()
    expect(rows[0]!.initials).toBe('?')
  })

  it('marks a flagged issue', () => {
    expect(toIssueRows([issue({ flagged: [{ value: 'Impediment' }] })], config, null, '')[0]!.flagged).toBe(true)
    expect(toIssueRows([issue()], config, null, '')[0]!.flagged).toBe(false)
  })
})

describe('summarise', () => {
  const rows = [
    { lane: 'done', points: 8 },
    { lane: 'done', points: 5 },
    { lane: 'doing', points: 3 },
    { lane: 'todo', points: null },
  ] as never[]

  const sprint = (start: Date | null, end: Date | null, field: string | null = 'customfield_1') =>
    summarise(
      rows,
      'Sprint 42',
      start ? start.toISOString() : null,
      end ? end.toISOString() : null,
      field,
      now,
    )

  it('adds the points up per lane', () => {
    expect(sprint(null, null).points).toEqual({ done: 13, doing: 3, open: 0 })
  })

  it('counts the remaining workdays to the sprint end', () => {
    expect(sprint(null, new Date(2026, 9, 30)).workdaysLeft).toBe(9)
  })

  it('counts the whole sprint in workdays, for the ring', () => {
    expect(sprint(new Date(2026, 9, 12), new Date(2026, 9, 30)).workdaysTotal).toBe(14)
  })

  it('reports no remaining days when the sprint has no end date', () => {
    expect(sprint(null, null).workdaysLeft).toBeNull()
    expect(sprint(null, null).workdaysTotal).toBeNull()
  })

  it('never goes below zero once the sprint is over', () => {
    expect(sprint(null, new Date(2026, 9, 1)).workdaysLeft).toBe(0)
  })

  it('passes the points field through, so the board can say which one it used', () => {
    expect(sprint(null, null, 'customfield_10002').pointsField).toBe('customfield_10002')
    expect(sprint(null, null, null).pointsField).toBeNull()
  })
})

describe('avatarUrl', () => {
  it('prefers the largest size jira offers', () => {
    const url = avatarUrl(
      { '16x16': '/a/16.png', '48x48': '/a/48.png', '24x24': '/a/24.png' },
      'https://jira.example.com',
    )
    expect(url).toContain(encodeURIComponent('https://jira.example.com/a/48.png'))
  })

  it('falls back to a smaller size when the large one is missing', () => {
    const url = avatarUrl({ '24x24': '/a/24.png' }, 'https://jira.example.com')
    expect(url).toContain(encodeURIComponent('https://jira.example.com/a/24.png'))
  })

  it('routes through the proxy, because the browser has no jira token', () => {
    expect(avatarUrl({ '48x48': '/a.png' }, 'https://jira.example.com')).toMatch(
      /^\/api\/avatar\?url=/,
    )
  })

  it('keeps an already absolute url instead of prefixing the base again', () => {
    const url = avatarUrl({ '48x48': 'https://cdn.example.com/a.png' }, 'https://jira.example.com')
    expect(url).toBe(`/api/avatar?url=${encodeURIComponent('https://cdn.example.com/a.png')}`)
  })

  it('builds exactly one absolute url from a relative path', () => {
    const url = avatarUrl({ '48x48': '/a/48.png' }, 'https://jira.example.com')
    expect(url).toBe(`/api/avatar?url=${encodeURIComponent('https://jira.example.com/a/48.png')}`)
  })

  it('returns null when jira sends no avatar at all', () => {
    expect(avatarUrl(undefined, 'https://jira.example.com')).toBeNull()
    expect(avatarUrl({}, 'https://jira.example.com')).toBeNull()
  })
})

describe('toEpicRows', () => {
  const raw = (over: Record<string, any> = {}) => ({
    key: 'KI-100',
    fields: {
      summary: 'Mandantenfähigkeit',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      ...over,
    },
  })

  it('reads key, summary, status and lane', () => {
    const rows = toEpicRows([raw()], config, 4)
    expect(rows[0]).toMatchObject({
      key: 'KI-100',
      summary: 'Mandantenfähigkeit',
      status: 'In Progress',
      lane: 'doing',
      webUrl: 'https://jira.example.com/browse/KI-100',
    })
  })

  it('prefers the epic name field over the plain summary', () => {
    const rows = toEpicRows([raw({ customfield_10005: 'Mandanten' })], config, 4)
    expect(rows[0]!.summary).toBe('Mandanten')
  })

  it('never returns more than the limit, whatever jira sends', () => {
    const many = Array.from({ length: 9 }, (_, i) => raw({ summary: `E${i}` }))
    expect(toEpicRows(many, config, 4)).toHaveLength(4)
  })

  it('survives an issue without a status', () => {
    const rows = toEpicRows([{ key: 'KI-1', fields: { summary: 'X' } }], config, 4)
    expect(rows[0]!.lane).toBe('todo')
    expect(rows[0]!.status).toBe('')
  })
})

describe('epicsJqlFor', () => {
  it('scopes to the board filter, so the board defines what counts', () => {
    expect(epicsJqlFor(1091, ['indeterminate'])).toContain('filter = 1091')
  })

  it('narrows to epics in progress, which is the running theme', () => {
    expect(epicsJqlFor(1091, ['indeterminate'])).toContain('statusCategory in ("In Progress")')
  })

  it('can take several categories', () => {
    expect(epicsJqlFor(1091, ['indeterminate', 'new'])).toContain(
      'statusCategory in ("In Progress", "To Do")',
    )
  })

  it('leaves the status open when no category is configured', () => {
    expect(epicsJqlFor(1091, [])).not.toContain('statusCategory')
  })

  it('ignores a category jira does not know', () => {
    expect(epicsJqlFor(1091, ['erfunden'])).not.toContain('statusCategory')
  })

  it('always restricts to epics and keeps the board order', () => {
    const jql = epicsJqlFor(1091, ['indeterminate'])
    expect(jql).toContain('issuetype = Epic')
    expect(jql).toContain('ORDER BY rank')
  })
})

describe('fetchEpics', () => {
  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response

  it('asks the board for its filter, then searches with it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ filter: { id: '1091' } }))
      .mockResolvedValueOnce(ok({ issues: [] }))

    await fetchEpics(
      { ...config, flavor: 'server', epicsBoardId: 96 },
      { token: 't', email: null },
      { fetch: fetchMock as never, now: () => now },
    )

    expect(String(fetchMock.mock.calls[0]![0])).toContain('/board/96/configuration')
    expect(decodeURIComponent(String(fetchMock.mock.calls[1]![0]))).toContain('filter = 1091')
  })

  it('uses an explicit jql without asking the board at all', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ issues: [] }))

    await fetchEpics(
      { ...config, flavor: 'server', epicsBoardId: 96, epicsJql: 'project = PRO' },
      { token: 't', email: null },
      { fetch: fetchMock as never, now: () => now },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(decodeURIComponent(String(fetchMock.mock.calls[0]![0]))).toContain('project = PRO')
  })

  it('says so when the board has no readable filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({}))
    await expect(
      fetchEpics(
        { ...config, flavor: 'server', epicsBoardId: 96 },
        { token: 't', email: null },
        { fetch: fetchMock as never, now: () => now },
      ),
    ).rejects.toThrow(/Filter/)
  })

  it('refuses to guess when neither source is configured', async () => {
    const fetchMock = vi.fn()
    await expect(
      fetchEpics(
        { ...config, flavor: 'server' },
        { token: 't', email: null },
        { fetch: fetchMock as never, now: () => now },
      ),
    ).rejects.toThrow(/epicsBoardId/)
  })
})

describe('userSearchPath', () => {
  it('searches by username on server, because cloud hides it', () => {
    expect(userSearchPath('server', 'timo')).toContain('/rest/api/2/user/search?username=timo')
  })

  it('searches by free query on cloud', () => {
    expect(userSearchPath('cloud', 'timo')).toContain('/rest/api/3/user/search?query=timo')
  })

  it('escapes a name with a space in it', () => {
    expect(userSearchPath('server', 'Jan Beck')).toContain('username=Jan%20Beck')
  })
})

describe('pickUser', () => {
  const user = (name: string, displayName: string) => ({ name, displayName })

  it('takes the only hit when the search was unambiguous', () => {
    expect(pickUser([user('t.weber', 'Timo Weber')], 'Timo')?.name).toBe('t.weber')
  })

  it('prefers the exact username over the other hits', () => {
    const picked = pickUser([user('t.weber2', 'Timo W.'), user('t.weber', 'Timo Weber')], 't.weber')
    expect(picked?.name).toBe('t.weber')
  })

  it('prefers the exact display name over the other hits', () => {
    expect(pickUser([user('a', 'Timo Weber'), user('b', 'Timo')], 'Timo')?.name).toBe('b')
  })

  it('matches the mail address jira reports, not only the name', () => {
    const picked = pickUser(
      [
        { name: 'tkern', displayName: 'Timo Kern' },
        { name: 'tweb', displayName: 'Timotheus W.', emailAddress: 't.weber@example.com' },
      ],
      't.weber@example.com',
    )
    expect(picked?.name).toBe('tweb')
  })

  it('ignores case and stray spaces', () => {
    expect(pickUser([user('a', 'Timo Weber'), user('b', ' TIMO ')], 'timo')?.name).toBe('b')
  })

  it('shows nobody rather than the wrong face when a first name is ambiguous', () => {
    expect(pickUser([user('a', 'Timo Weber'), user('b', 'Timo Kern')], 'Timo')).toBeNull()
  })

  it('shows nobody when two people carry the same exact name', () => {
    expect(pickUser([user('a', 'Timo'), user('b', 'Timo')], 'Timo')).toBeNull()
  })

  it('returns null when the search found nobody', () => {
    expect(pickUser([], 'Timo')).toBeNull()
  })
})

describe('queriesFor', () => {
  it('tries the address first, then its local part, then the name', () => {
    expect(queriesFor({ name: 'Timo', email: 'T.Krause@ceyoniq.com' })).toEqual([
      'T.Krause@ceyoniq.com',
      'T.Krause',
      'Timo',
    ])
  })

  it('asks for the name alone when no address is configured', () => {
    expect(queriesFor({ name: 'Timo', email: null })).toEqual(['Timo'])
  })

  it('never asks the same thing twice', () => {
    expect(queriesFor({ name: 'T.Krause', email: 'T.Krause@ceyoniq.com' })).toEqual([
      'T.Krause@ceyoniq.com',
      'T.Krause',
    ])
  })

  it('asks nothing for a member without name and address', () => {
    expect(queriesFor({ name: ' ', email: null })).toEqual([])
  })
})

describe('fetchTeamAvatars', () => {
  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response
  const server = { ...config, flavor: 'server' as const }
  const credentials = { token: 't', email: null }
  const deps = (fetchMock: unknown) => ({ fetch: fetchMock as never, now: () => now })

  const hit = (over: Record<string, unknown> = {}) => ({
    name: 't.weber',
    displayName: 'Timo Weber',
    avatarUrls: { '48x48': '/secure/useravatar?ownerId=t.weber' },
    ...over,
  })

  it('routes the picture through the proxy, because the browser has no token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([hit()]))

    const avatars = await fetchTeamAvatars(server, credentials, deps(fetchMock), [
      { name: 'Timo', email: null },
    ])

    expect(avatars.Timo).toBe(
      '/api/avatar?url=' +
        encodeURIComponent('https://jira.example.com/secure/useravatar?ownerId=t.weber'),
    )
  })

  it('searches for the configured address instead of the display name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([hit()]))

    await fetchTeamAvatars(server, credentials, deps(fetchMock), [
      { name: 'Timo', email: 't.weber@example.com' },
    ])

    expect(decodeURIComponent(String(fetchMock.mock.calls[0]![0]))).toContain(
      'username=t.weber@example.com',
    )
  })

  it('falls back to the local part when jira hides the mail address', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([hit({ name: 't.weber' })]))

    const avatars = await fetchTeamAvatars(server, credentials, deps(fetchMock), [
      { name: 'Timo', email: 't.weber@example.com' },
    ])

    expect(decodeURIComponent(String(fetchMock.mock.calls[1]![0]))).toContain('username=t.weber&')
    expect(avatars.Timo).toContain(encodeURIComponent('ownerId=t.weber'))
  })

  it('stops searching as soon as a picture was found', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([hit()]))

    await fetchTeamAvatars(server, credentials, deps(fetchMock), [
      { name: 'Timo', email: 't.weber@example.com' },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves a member without a picture instead of failing the whole board', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' } as Response)
      .mockResolvedValueOnce(ok([hit()]))

    const avatars = await fetchTeamAvatars(server, credentials, deps(fetchMock), [
      { name: 'Timo', email: null },
      { name: 'Daniel', email: null },
    ])

    expect(avatars.Timo).not.toBeNull()
    expect(avatars.Daniel).toBeNull()
  })

  it('says in the log which queries it tried for whom', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([]))
    const log = vi.fn()

    await fetchTeamAvatars(server, credentials, { ...deps(fetchMock), log }, [
      { name: 'Daniel', email: 'D.Dietrich@example.com' },
    ])

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Daniel'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('D.Dietrich@example.com → 0'))
  })

  it('stays quiet in the log once a picture was found', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([hit()]))
    const log = vi.fn()

    await fetchTeamAvatars(server, credentials, { ...deps(fetchMock), log }, [
      { name: 'Timo', email: null },
    ])

    expect(log).not.toHaveBeenCalled()
  })

  it('asks jira nothing for a member without a name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([hit()]))

    const avatars = await fetchTeamAvatars(server, credentials, deps(fetchMock), [
      { name: ' ', email: null },
    ])

    expect(avatars[' ']).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves a user without a picture null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([hit({ avatarUrls: undefined })]))

    const avatars = await fetchTeamAvatars(server, credentials, deps(fetchMock), [
      { name: 'Timo', email: null },
    ])

    expect(avatars.Timo).toBeNull()
  })
})

describe('isIssueKey', () => {
  it('accepts a normal jira key', () => {
    expect(isIssueKey('PRO-1234')).toBe(true)
  })

  it('rejects a key carrying a path, so it cannot reach another endpoint', () => {
    expect(isIssueKey('PRO-1/../../admin')).toBe(false)
    expect(isIssueKey('PRO-1?expand=x')).toBe(false)
  })

  it('rejects something that is not a key at all', () => {
    expect(isIssueKey('PRO')).toBe(false)
    expect(isIssueKey('')).toBe(false)
  })
})

describe('isLane', () => {
  it('knows the three board columns', () => {
    expect(isLane('todo')).toBe(true)
    expect(isLane('doing')).toBe(true)
    expect(isLane('done')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isLane('erledigt')).toBe(false)
    expect(isLane(null)).toBe(false)
  })
})

describe('pickTransition', () => {
  const lanes = parseConfig({
    jira: { laneStatus: { doing: ['In Progress'], done: [], todo: [] } },
  }).jira

  const transition = (id: string, name: string, category: string) => ({
    id,
    name,
    to: { name, statusCategory: { key: category } },
  })

  it('prefers the status named in the configuration', () => {
    const picked = pickTransition(
      [
        transition('1', 'In Review', 'indeterminate'),
        transition('2', 'In Progress', 'indeterminate'),
      ],
      'doing',
      lanes,
    )
    expect(picked?.id).toBe('2')
  })

  it('keeps the configured order when several names fit', () => {
    const config = parseConfig({
      jira: { laneStatus: { doing: ['In Review', 'In Progress'] } },
    }).jira
    const picked = pickTransition(
      [
        transition('1', 'In Progress', 'indeterminate'),
        transition('2', 'In Review', 'indeterminate'),
      ],
      'doing',
      config,
    )
    expect(picked?.id).toBe('2')
  })

  it('ignores case and stray spaces in the configured name', () => {
    const picked = pickTransition([transition('7', ' in progress ', 'indeterminate')], 'doing', lanes)
    expect(picked?.id).toBe('7')
  })

  it('falls back to the first transition of the right category', () => {
    const picked = pickTransition(
      [transition('1', 'Reopen', 'new'), transition('2', 'Resolve', 'done')],
      'done',
      lanes,
    )
    expect(picked?.id).toBe('2')
  })

  it('never takes a transition whose category is unknown, even into todo', () => {
    expect(pickTransition([{ id: '1', name: 'Irgendwas', to: { name: 'X' } }], 'todo', lanes)).toBeNull()
  })

  it('returns null when nothing leads into that column', () => {
    expect(pickTransition([transition('1', 'Resolve', 'done')], 'doing', lanes)).toBeNull()
  })
})

describe('moveIssue', () => {
  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response
  const server = { ...config, flavor: 'server' as const }
  const credentials = { token: 't', email: null }

  const transitions = {
    transitions: [
      { id: '31', name: 'Start', to: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } },
      { id: '41', name: 'Fertig', to: { name: 'Done', statusCategory: { key: 'done' } } },
    ],
  }

  it('posts the transition that belongs to the dropped column', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(transitions)).mockResolvedValueOnce(ok({}))

    const result = await moveIssue(server, credentials, { fetch: fetchMock as never, now: () => now }, 'PRO-7', 'done')

    const [url, init] = fetchMock.mock.calls[1]!
    expect(String(url)).toBe('https://jira.example.com/rest/api/2/issue/PRO-7/transitions')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ transition: { id: '41' } })
    expect(result).toEqual({ key: 'PRO-7', lane: 'done', status: 'Done' })
  })

  it('names the possible transitions when the column cannot be reached', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ transitions: [transitions.transitions[0]] }))

    await expect(
      moveIssue(server, credentials, { fetch: fetchMock as never, now: () => now }, 'PRO-7', 'done'),
    ).rejects.toThrow(/In Progress/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('passes a failing transition on instead of reporting success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(transitions))
      .mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' } as Response)

    await expect(
      moveIssue(server, credentials, { fetch: fetchMock as never, now: () => now }, 'PRO-7', 'done'),
    ).rejects.toThrow(/403/)
  })
})

describe('sameOrigin', () => {
  it('accepts an address on the configured jira host', () => {
    expect(sameOrigin('https://jira.example.com/a.png', 'https://jira.example.com')).toBe(true)
  })

  it('rejects a foreign host, so the proxy cannot be aimed elsewhere', () => {
    expect(sameOrigin('https://evil.example.com/a.png', 'https://jira.example.com')).toBe(false)
  })

  it('rejects a different scheme on the same host', () => {
    expect(sameOrigin('http://jira.example.com/a.png', 'https://jira.example.com')).toBe(false)
  })

  it('rejects something that is not a url at all', () => {
    expect(sameOrigin('/etc/passwd', 'https://jira.example.com')).toBe(false)
  })
})

describe('estimationField', () => {
  it('reads the field the board actually estimates with', () => {
    expect(
      estimationField({ estimation: { type: 'field', field: { fieldId: 'customfield_10002' } } }),
    ).toBe('customfield_10002')
  })

  it('returns null when the board counts issues instead of estimating', () => {
    expect(estimationField({ estimation: { type: 'issueCount' } })).toBeNull()
  })

  it('returns null for the explicit none field', () => {
    expect(estimationField({ estimation: { type: 'field', field: { fieldId: 'none' } } })).toBeNull()
  })

  it('survives a board without an estimation block', () => {
    expect(estimationField({})).toBeNull()
  })
})

describe('weekOf', () => {
  const weeks = ['Woche 1', 'Woche 2']

  it('finds the week component among several components', () => {
    expect(weekOf([{ name: 'Backend' }, { name: 'Woche 2' }], weeks)).toBe('Woche 2')
  })

  it('ignores case and stray spaces', () => {
    expect(weekOf([{ name: ' woche 1 ' }], weeks)).toBe('Woche 1')
  })

  it('returns the configured spelling, not the one from jira', () => {
    expect(weekOf([{ name: 'WOCHE 1' }], weeks)).toBe('Woche 1')
  })

  it('returns null when no week is set', () => {
    expect(weekOf([{ name: 'Backend' }], weeks)).toBeNull()
    expect(weekOf([], weeks)).toBeNull()
    expect(weekOf(undefined, weeks)).toBeNull()
  })

  it('keeps the configured order when an issue carries both', () => {
    expect(weekOf([{ name: 'Woche 2' }, { name: 'Woche 1' }], weeks)).toBe('Woche 1')
  })
})
