import { describe, expect, it } from 'vitest'
import type { Quest } from '../../shared/questlog/types.js'
import type { JiraConfig } from './config.js'
import type { JiraIssue } from './jira.js'
import {
  fetchProfile,
  PROFILE_LIMIT,
  PROFILE_PAGE,
  PROFILE_RECENT,
  profileJql,
  summariseProfile,
} from './profile.js'

const jira: JiraConfig = {
  baseUrl: 'https://jira.test',
  flavor: 'server',
  storyPointsField: 'customfield_1',
  epicLinkField: 'customfield_2',
  epicNameField: 'customfield_3',
  doneStatusCategories: ['done'],
  doingStatusCategories: ['indeterminate'],
  maxQuests: 100,
}

const quest = (over: Partial<Quest> = {}): Quest => ({
  key: 'PRO-1',
  title: 'Index nachts neu bauen',
  project: 'PRO',
  projectName: 'Produkt',
  seriesKey: null,
  seriesName: null,
  level: 30,
  difficulty: 'easy',
  state: 'complete',
  points: 3,
  priority: 'Medium',
  issueType: 'Story',
  status: 'Done',
  assignee: 'Anna Berg',
  giver: null,
  objective: '',
  description: '',
  labels: [],
  experience: 450,
  coins: { gold: 0, silver: 94, copper: 0 },
  webUrl: 'https://jira.test/browse/PRO-1',
  ...over,
})

const me = {
  displayName: 'Anna Berg',
  name: 'aberg',
  avatarUrls: { '48x48': 'https://jira.test/secure/useravatar?ownerId=aberg' },
}

const story = (n: number, over: Record<string, unknown> = {}): JiraIssue => ({
  key: `PRO-${n}`,
  fields: {
    summary: `Story ${n}`,
    status: { name: 'Done', statusCategory: { key: 'done' } },
    priority: { name: 'Medium' },
    issuetype: { name: 'Story' },
    customfield_1: 2,
    resolutiondate: `2026-11-${String((n % 28) + 1).padStart(2, '0')}T10:00:00.000+0100`,
    ...over,
  },
})

function fakeJira(pages: JiraIssue[][], total: number) {
  const calls: string[] = []
  const fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    if (url.endsWith('/myself')) return json(me)
    if (url.includes('/search?')) {
      const startAt = Number(new URL(url).searchParams.get('startAt'))
      return json({ issues: pages[startAt / PROFILE_PAGE] ?? [], total })
    }
    return new Response('nope', { status: 404 })
  }) as typeof globalThis.fetch
  return { calls, deps: { fetch } }
}

describe('profileJql', () => {
  it('asks for the caller’s finished issues, newest first, in the configured done categories', () => {
    expect(profileJql({ doneStatusCategories: ['done', 'closed'] })).toBe(
      'assignee = currentUser() AND statusCategory in (done, closed) ORDER BY resolutiondate DESC',
    )
  })
})

describe('summariseProfile', () => {
  it('adds up experience and coins, carrying copper into silver and silver into gold', () => {
    const done = [
      { quest: quest({ experience: 450, coins: { gold: 0, silver: 94, copper: 0 } }), resolved: null },
      { quest: quest({ experience: 150, coins: { gold: 0, silver: 94, copper: 50 } }), resolved: null },
      { quest: quest({ experience: 15, coins: { gold: 1, silver: 12, copper: 60 } }), resolved: null },
    ]

    const profile = summariseProfile(me, done, 3, jira.baseUrl)

    expect(profile.experience).toBe(615)
    expect(profile.coins).toEqual({ gold: 3, silver: 1, copper: 10 })
  })

  it('names the player after the Jira account and shows its picture through the proxy', () => {
    const profile = summariseProfile(me, [], 0, jira.baseUrl)

    expect(profile.name).toBe('Anna Berg')
    expect(profile.avatar).toBe(`/api/avatar?url=${encodeURIComponent(me.avatarUrls['48x48'])}`)
  })

  it('falls back to the login name and no picture', () => {
    const profile = summariseProfile({ name: 'aberg' }, [], 0, jira.baseUrl)

    expect(profile.name).toBe('aberg')
    expect(profile.avatar).toBeNull()
  })

  it('starts with an empty purse', () => {
    const profile = summariseProfile(me, [], 0, jira.baseUrl)

    expect(profile).toMatchObject({ experience: 0, coins: { gold: 0, silver: 0, copper: 0 }, completed: 0, counted: 0 })
  })

  it('lists only the most recent quests but counts all of them', () => {
    const done = Array.from({ length: PROFILE_RECENT + 5 }, (_, i) => ({
      quest: quest({ key: `PRO-${i}`, experience: 10 }),
      resolved: `2026-11-01T0${i % 10}:00:00Z`,
    }))

    const profile = summariseProfile(me, done, 120, jira.baseUrl)

    expect(profile.quests).toHaveLength(PROFILE_RECENT)
    expect(profile.quests[0]).toMatchObject({ key: 'PRO-0', resolved: '2026-11-01T00:00:00Z', experience: 10 })
    expect(profile.experience).toBe((PROFILE_RECENT + 5) * 10)
    expect(profile.counted).toBe(PROFILE_RECENT + 5)
    expect(profile.completed).toBe(120)
  })
})

describe('fetchProfile', () => {
  it('pages through the finished issues until Jira has handed all of them over', async () => {
    const first = Array.from({ length: PROFILE_PAGE }, (_, i) => story(i + 1))
    const second = [story(500), story(501)]
    const { calls, deps } = fakeJira([first, second], PROFILE_PAGE + 2)

    const profile = await fetchProfile(jira, 7, { token: 't', email: null }, deps)

    const searches = calls.filter((url) => url.includes('/search?'))
    expect(searches).toHaveLength(2)
    expect(searches[1]).toContain(`startAt=${PROFILE_PAGE}`)
    expect(decodeURIComponent(searches[0]!)).toContain('assignee = currentUser()')
    expect(new URL(searches[0]!).searchParams.get('fields')?.split(',')).toContain('resolutiondate')
    expect(profile.counted).toBe(PROFILE_PAGE + 2)
    expect(profile.completed).toBe(PROFILE_PAGE + 2)
    expect(profile.name).toBe('Anna Berg')
  })

  it('leaves epics out, they are worth what their stories are worth', async () => {
    const { deps } = fakeJira([[story(1), story(2, { issuetype: { name: 'Epic' } })]], 2)

    const profile = await fetchProfile(jira, null, { token: 't', email: null }, deps)

    expect(profile.quests.map((entry) => entry.key)).toEqual(['PRO-1'])
    expect(profile.quests[0]).toMatchObject({ resolved: '2026-11-02T10:00:00.000+0100', experience: 300 })
  })

  it('stops at the limit instead of walking a whole Jira history', async () => {
    const full = Array.from({ length: PROFILE_PAGE }, (_, i) => story(i + 1))
    const { calls, deps } = fakeJira(
      Array.from({ length: 50 }, () => full),
      PROFILE_LIMIT * 5,
    )

    const profile = await fetchProfile(jira, null, { token: 't', email: null }, deps)

    expect(calls.filter((url) => url.includes('/search?'))).toHaveLength(PROFILE_LIMIT / PROFILE_PAGE)
    expect(profile.counted).toBe(PROFILE_LIMIT)
    expect(profile.completed).toBe(PROFILE_LIMIT * 5)
  })
})
