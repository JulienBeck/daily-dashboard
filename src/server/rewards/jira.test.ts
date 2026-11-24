import { describe, expect, it } from 'vitest'
import type { Quest } from '../../shared/questlog/types.js'
import type { JiraConfig } from '../questlog/config.js'
import { fetchMe, fetchPerson, fetchQuestRecord, searchUsers, USER_LIMIT } from './jira.js'

const jira: JiraConfig = {
  baseUrl: 'https://jira.test',
  flavor: 'server',
  storyPointsField: 'customfield_1',
  epicLinkField: 'customfield_2',
  epicNameField: 'customfield_3',
  doneStatusCategories: ['done'],
  doingStatusCategories: ['indeterminate'],
  openStatusCategories: ['new'],
  maxQuests: 100,
}

const credentials = { token: 't', email: null }

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
  assignee: 'Ben Cohn',
  giver: 'Gerd Geber',
  objective: '',
  description: '',
  labels: [],
  experience: 450,
  coins: { gold: 0, silver: 94, copper: 0 },
  webUrl: 'https://jira.test/browse/PRO-1',
  ...over,
})

function fake(answer: (url: URL) => unknown, flavor: 'server' | 'cloud' = 'server') {
  const calls: URL[] = []
  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    calls.push(url)
    const body = answer(url)
    return body === undefined ? new Response('nope', { status: 404 }) : new Response(JSON.stringify(body))
  }) as typeof globalThis.fetch
  return { calls, deps: { fetch }, config: { ...jira, flavor } }
}

describe('fetchMe', () => {
  it('names the token’s owner by user key and hands out the picture through the proxy', async () => {
    const { deps, config } = fake(() => ({
      key: 'JIRAUSER1',
      name: 'aberg',
      displayName: 'Anna Berg',
      avatarUrls: { '48x48': 'https://jira.test/a.png' },
    }))

    expect(await fetchMe(config, credentials, deps)).toEqual({
      id: 'JIRAUSER1',
      name: 'Anna Berg',
      avatar: `/api/avatar?url=${encodeURIComponent('https://jira.test/a.png')}`,
      ref: { name: 'aberg' },
    })
  })

  it('fails without anybody behind the token', async () => {
    const { deps, config } = fake(() => ({}))

    await expect(fetchMe(config, credentials, deps)).rejects.toThrow('kein Benutzer')
  })
})

describe('fetchQuestRecord', () => {
  it('reads giver and contributors from the issue and its changelog', async () => {
    const { calls, deps, config } = fake(() => ({
      key: 'PRO-1',
      fields: {
        created: '2026-11-01T00:00:00.000Z',
        resolutiondate: '2026-11-05T00:00:00.000Z',
        assignee: { key: 'JIRAUSER2', displayName: 'Ben Cohn' },
        reporter: { key: 'JIRAUSER9', displayName: 'Gerd Geber' },
      },
      changelog: {
        histories: [
          {
            created: '2026-11-04T00:00:00.000Z',
            items: [{ field: 'assignee', from: 'JIRAUSER1', fromString: 'Anna Berg', to: 'JIRAUSER2', toString: 'Ben Cohn' }],
          },
        ],
      },
    }))
    const due = new Date('2026-11-20T00:00:00Z')

    const record = await fetchQuestRecord(config, credentials, deps, quest(), due, new Date())

    expect(calls[0]!.pathname).toBe('/rest/api/2/issue/PRO-1')
    expect(calls[0]!.searchParams.get('expand')).toBe('changelog')
    expect(record).toEqual({
      key: 'PRO-1',
      title: 'Index nachts neu bauen',
      webUrl: 'https://jira.test/browse/PRO-1',
      difficulty: 'easy',
      experience: 450,
      copper: 9400,
      giver: { id: 'JIRAUSER9', name: 'Gerd Geber' },
      completedAt: new Date('2026-11-05T00:00:00.000Z'),
      dueAt: due,
      shares: [
        { id: 'JIRAUSER1', name: 'Anna Berg', share: 0.75 },
        { id: 'JIRAUSER2', name: 'Ben Cohn', share: 0.25 },
      ],
    })
  })

  it('takes now as the finishing time when Jira has none', async () => {
    const { deps, config } = fake(() => ({ key: 'PRO-1', fields: { assignee: { key: 'JIRAUSER2', displayName: 'Ben Cohn' } } }))
    const now = new Date('2026-11-12T09:00:00Z')

    const record = await fetchQuestRecord(config, credentials, deps, quest(), now, now)

    expect(record.completedAt).toEqual(now)
    expect(record.giver).toBeNull()
    expect(record.shares).toEqual([{ id: 'JIRAUSER2', name: 'Ben Cohn', share: 1 }])
  })
})

describe('searchUsers', () => {
  it('searches Data Center by username and skips deactivated accounts', async () => {
    const { calls, deps, config } = fake(() => [
      { key: 'JIRAUSER1', displayName: 'Anna Berg' },
      { key: 'JIRAUSER4', displayName: 'Alt', active: false },
    ])

    expect(await searchUsers(config, credentials, deps, ' an ')).toEqual([{ id: 'JIRAUSER1', name: 'Anna Berg' }])
    expect(calls[0]!.pathname).toBe('/rest/api/2/user/search')
    expect(calls[0]!.searchParams.get('username')).toBe('an')
    expect(calls[0]!.searchParams.get('maxResults')).toBe(String(USER_LIMIT))
  })

  it('searches Cloud by query', async () => {
    const { calls, deps, config } = fake(() => [{ accountId: 'acc-1', displayName: 'Anna Berg' }], 'cloud')

    expect(await searchUsers(config, credentials, deps, 'anna')).toEqual([{ id: 'acc-1', name: 'Anna Berg' }])
    expect(calls[0]!.pathname).toBe('/rest/api/3/user/search')
    expect(calls[0]!.searchParams.get('query')).toBe('anna')
  })

  it('does not ask Jira for a single letter', async () => {
    const { calls, deps, config } = fake(() => [])

    expect(await searchUsers(config, credentials, deps, 'a')).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('treats a strange answer as nobody found', async () => {
    const { deps, config } = fake(() => ({ message: 'proxy' }))

    expect(await searchUsers(config, credentials, deps, 'anna')).toEqual([])
  })
})

describe('fetchPerson', () => {
  const daniel = { key: 'JIRAUSER4', name: 'D.Dietrich', displayName: 'Daniel Dietrich', emailAddress: 'D.Dietrich@ceyoniq.com' }

  it('takes the one user whose address matches the login, whatever its case', async () => {
    const { calls, deps, config } = fake(() => [daniel])

    expect(await fetchPerson(config, credentials, deps, 'd.dietrich@ceyoniq.com')).toEqual({
      id: 'JIRAUSER4',
      name: 'Daniel Dietrich',
      avatar: null,
      ref: { name: 'D.Dietrich' },
    })
    expect(calls[0]!.searchParams.get('username')).toBe('d.dietrich@ceyoniq.com')
  })

  it('falls back to the username when Jira hides the address', async () => {
    const hidden = { ...daniel, emailAddress: undefined }
    const { calls, deps, config } = fake((url) => (url.searchParams.get('username') === 'd.dietrich' ? [hidden] : []))

    expect((await fetchPerson(config, credentials, deps, 'D.Dietrich@ceyoniq.com')).id).toBe('JIRAUSER4')
    expect(calls.map((url) => url.searchParams.get('username'))).toEqual(['D.Dietrich@ceyoniq.com', 'd.dietrich'])
  })

  it('never settles for a lone hit that only resembles the login', async () => {
    const { deps, config } = fake(() => [{ key: 'JIRAUSER5', name: 'dirk', displayName: 'D. Dietrich' }])

    await expect(fetchPerson(config, credentials, deps, 'd.dietrich@ceyoniq.com')).rejects.toThrow('kein Benutzer')
  })

  it('refuses a login that fits two users', async () => {
    const { deps, config } = fake(() => [daniel, { ...daniel, key: 'JIRAUSER6' }])

    await expect(fetchPerson(config, credentials, deps, 'd.dietrich@ceyoniq.com')).rejects.toThrow('mehrere Benutzer')
  })

  it('skips deactivated accounts', async () => {
    const { deps, config } = fake(() => [{ ...daniel, active: false }])

    await expect(fetchPerson(config, credentials, deps, 'd.dietrich@ceyoniq.com')).rejects.toThrow('kein Benutzer')
  })

  it('names the Cloud account by its accountId', async () => {
    const { deps, config } = fake(() => [{ accountId: 'acc-7', displayName: 'Daniel', emailAddress: 'd@x.test' }], 'cloud')

    expect((await fetchPerson(config, credentials, deps, 'd@x.test')).ref).toEqual({ accountId: 'acc-7' })
  })
})
