import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PagePayload, Quest } from '../../shared/questlog/types.js'
import type { Db } from '../db.js'
import type { JiraConfig } from '../questlog/config.js'
import { memoryDb } from './memoryDb.js'
import {
  createRewards,
  dueDate,
  FALLBACK_DUE_DAYS,
  parseIds,
  parseEquip,
  parseShares,
  questOn,
  type SprintWindow,
  SYNC_SECONDS,
} from './service.js'

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

const quest = (key: string, state: Quest['state'] = 'complete'): Quest => ({
  key,
  title: `Quest ${key}`,
  project: 'PRO',
  projectName: 'Produkt',
  seriesKey: null,
  seriesName: null,
  level: 30,
  difficulty: 'easy',
  state,
  points: 3,
  priority: 'Medium',
  issueType: 'Story',
  status: 'Done',
  assignee: 'Anna Berg',
  giver: 'Gerd Geber',
  objective: '',
  description: '',
  labels: [],
  experience: 450,
  coins: { gold: 0, silver: 94, copper: 0 },
  webUrl: `https://jira.test/browse/${key}`,
})

const page = (quests: Quest[]): PagePayload => ({
  page: { id: 'sprint', title: 'Sprint', canCreate: false },
  jql: 'sprint = 1',
  chapter: 'Sprint 47',
  series: [{ key: '', name: null, webUrl: null, epic: null, quests }],
  total: quests.length,
  complete: quests.length,
  rewards: {},
})

const anna = { key: 'JIRAUSER1', displayName: 'Anna Berg' }
const giver = { key: 'JIRAUSER9', displayName: 'Gerd Geber' }
const sprint: SprintWindow = { start: '2026-11-09T08:00:00.000Z', end: '2026-11-20T17:00:00.000Z' }

let db: Db

beforeAll(async () => {
  db = await memoryDb()
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.query('truncate inventory, message, share, quest, player, setting restart identity cascade')
})

function setup(over: { me?: object; resolved?: string; sprint?: SprintWindow | null } = {}) {
  const clock = { now: new Date('2026-11-12T09:00:00.000Z') }
  const calls: URL[] = []
  const state = { me: over.me ?? giver }
  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    calls.push(url)
    const json = (body: unknown) => new Response(JSON.stringify(body))
    if (url.pathname.endsWith('/myself')) return json(state.me)
    if (url.pathname.startsWith('/rest/api/2/issue/')) {
      return json({
        key: url.pathname.split('/').pop(),
        fields: {
          created: '2026-11-09T09:00:00.000Z',
          resolutiondate: over.resolved ?? '2026-11-11T09:00:00.000Z',
          assignee: anna,
          reporter: giver,
        },
      })
    }
    if (url.pathname.endsWith('/user/search')) return json([anna])
    return new Response('nope', { status: 404 })
  }) as typeof globalThis.fetch
  const rewards = createRewards({
    db,
    jira,
    credentials: { token: 't', email: null },
    deps: { fetch, now: () => clock.now },
    sprint: async () => (over.sprint === undefined ? sprint : over.sprint),
  })
  const issueCalls = () => calls.filter((url) => url.pathname.startsWith('/rest/api/2/issue/'))
  return { rewards, calls, issueCalls, clock, state }
}

describe('questOn', () => {
  it('finds a quest in any series of the page', () => {
    const shown = { ...page([]), series: [page([quest('PRO-1')]).series[0]!, page([quest('PRO-7')]).series[0]!] }

    expect(questOn(shown, 'PRO-7')?.key).toBe('PRO-7')
    expect(questOn(shown, 'PRO-9')).toBeNull()
  })
})

describe('dueDate', () => {
  const now = new Date('2026-11-12T09:00:00.000Z')

  it('is the end of the running sprint', () => {
    expect(dueDate(sprint, now)).toEqual(new Date(sprint.end!))
  })

  it('falls back to two weeks without a sprint or after its end', () => {
    const fallback = new Date(now.getTime() + FALLBACK_DUE_DAYS * 86_400_000)
    expect(dueDate(null, now)).toEqual(fallback)
    expect(dueDate({ start: null, end: '2026-11-01T00:00:00.000Z' }, now)).toEqual(fallback)
  })
})

describe('parseShares', () => {
  it('accepts people with a weight and names the nameless after their id', () => {
    expect(parseShares([{ id: 'a', name: 'Anna', share: 2 }, { id: 'b', share: 0 }])).toEqual([
      { id: 'a', name: 'Anna', share: 2 },
      { id: 'b', name: 'b', share: 0 },
    ])
  })

  it('refuses anything that is not a clean list of weights', () => {
    expect(() => parseShares(undefined)).toThrow('Liste der Beteiligten fehlt')
    expect(() => parseShares([{ share: 1 }])).toThrow('ohne Kennung')
    expect(() => parseShares([{ id: 'a', share: -1 }])).toThrow('ungültiger Anteil')
    expect(() => parseShares([{ id: 'a', share: Number.NaN }])).toThrow('ungültiger Anteil')
    expect(() => parseShares([null])).toThrow('ohne Kennung')
  })
})

describe('parseIds', () => {
  it('keeps whole numbers only', () => {
    expect(parseIds([1, '2', 3.5, 4])).toEqual([1, 4])
    expect(parseIds('1')).toEqual([])
  })
})

describe('reward guards', () => {
  it('stamps each quest of a page with the state of its reward', async () => {
    const { rewards } = setup()
    await rewards.handIn(quest('PRO-1'))

    const stamped = await rewards.stamp(page([quest('PRO-1'), quest('PRO-2', 'active')]))

    expect(stamped.rewards).toEqual({ 'PRO-1': 'pending' })
  })

  it('lets a quest be handed in that has no reward yet', async () => {
    const { rewards } = setup()

    await expect(rewards.assertHandable('PRO-1')).resolves.toBeUndefined()
  })

  it('refuses a second hand-in while the giver has not distributed yet', async () => {
    const { rewards } = setup()
    await rewards.handIn(quest('PRO-1'))

    await expect(rewards.assertHandable('PRO-1')).rejects.toThrow('PRO-1 ist schon abgegeben, die Belohnung')
  })

  it('refuses a second hand-in once the reward is paid', async () => {
    const { rewards } = setup()
    await rewards.handIn(quest('PRO-1'))
    await rewards.distribute('PRO-1', [{ id: 'JIRAUSER1', name: 'Anna Berg', share: 1 }])

    await expect(rewards.assertHandable('PRO-1')).rejects.toThrow('PRO-1 ist schon abgegeben und belohnt')
    await expect(rewards.assertAbandonable('PRO-1')).rejects.toThrow('PRO-1 ist schon belohnt')
  })

  it('lets a quest go whose reward still waits', async () => {
    const { rewards } = setup()
    await rewards.handIn(quest('PRO-1'))

    await expect(rewards.assertAbandonable('PRO-1')).resolves.toBeUndefined()
  })

  it('forgets the reward of an abandoned quest and files it again on the next hand-in', async () => {
    const { rewards } = setup()
    await rewards.handIn(quest('PRO-1'))

    await rewards.withdraw('PRO-1')
    expect((await rewards.stamp(page([quest('PRO-1')]))).rewards).toEqual({})

    await rewards.handIn(quest('PRO-1'))
    expect((await rewards.stamp(page([quest('PRO-1')]))).rewards).toEqual({ 'PRO-1': 'pending' })
  })

})

describe('handIn', () => {
  it('files the handed in quest for everybody who worked on it and asks the giver to distribute', async () => {
    const { rewards, issueCalls } = setup()

    await rewards.handIn(quest('PRO-1'))

    expect(issueCalls().map((url) => url.pathname)).toEqual(['/rest/api/2/issue/PRO-1'])
    const draft = await rewards.draft('PRO-1')
    expect(draft).toMatchObject({ dueAt: sprint.end, mayDistribute: true, giver: { id: 'JIRAUSER9' } })
    expect(draft.shares.map(({ id, share }) => ({ id, share }))).toEqual([{ id: 'JIRAUSER1', share: 1 }])
    expect((await rewards.inbox()).messages.map((message) => message.kind)).toEqual(['distribute'])
  })

  it('gives two weeks without a running sprint', async () => {
    const { rewards, clock } = setup({ sprint: null })

    await rewards.handIn(quest('PRO-1'))

    expect((await rewards.draft('PRO-1')).dueAt).toBe(dueDate(null, clock.now).toISOString())
  })
})

describe('sync', () => {
  it('files nothing on its own, so a quest done directly in Jira earns nothing', async () => {
    const { rewards, issueCalls } = setup()

    await rewards.sync(true)

    expect(issueCalls()).toEqual([])
    expect((await rewards.stamp(page([quest('PRO-1')]))).rewards).toEqual({})
  })

  it('distributes overdue quests by the proposal', async () => {
    const { rewards, clock } = setup()
    await rewards.handIn(quest('PRO-1'))

    clock.now = new Date('2026-11-21T00:00:00.000Z')
    await rewards.sync(true)

    expect((await rewards.draft('PRO-1')).distributedBy).toBe('auto')
  })

  it('syncs at most once a minute unless forced', async () => {
    const { rewards, clock } = setup()
    await rewards.handIn(quest('PRO-1'))
    const due = new Date(sprint.end!).getTime()

    clock.now = new Date(due - 10_000)
    await rewards.sync()
    clock.now = new Date(due + 10_000)
    await rewards.sync()
    expect((await rewards.draft('PRO-1')).distributedAt).toBeNull()

    clock.now = new Date(due + SYNC_SECONDS * 1000)
    await rewards.sync()
    expect((await rewards.draft('PRO-1')).distributedAt).not.toBeNull()
  })
})

describe('distribute', () => {
  it('lets the giver split the reward', async () => {
    const { rewards } = setup()
    await rewards.handIn(quest('PRO-1'))

    const result = await rewards.distribute('PRO-1', [
      { id: 'JIRAUSER1', name: 'Anna Berg', share: 1 },
      { id: 'JIRAUSER2', name: 'Ben Cohn', share: 1 },
    ])

    expect(result.distributedBy).toBe('JIRAUSER9')
    expect(result.shares.map(({ id, experience }) => ({ id, experience }))).toEqual([
      { id: 'JIRAUSER1', experience: 225 },
      { id: 'JIRAUSER2', experience: 225 },
    ])
  })

  it('refuses anybody but the giver', async () => {
    const { rewards } = setup({ me: anna })
    await rewards.handIn(quest('PRO-1'))

    await expect(rewards.distribute('PRO-1', [{ id: 'JIRAUSER1', name: 'Anna', share: 1 }])).rejects.toThrow(
      'Nur Gerd Geber verteilt PRO-1',
    )
  })

  it('refuses a second distribution and an empty one', async () => {
    const { rewards } = setup()
    await rewards.handIn(quest('PRO-1'))

    await expect(rewards.distribute('PRO-1', [])).rejects.toThrow('Niemand zum Verteilen')
    await rewards.distribute('PRO-1', [{ id: 'JIRAUSER1', name: 'Anna', share: 1 }])
    await expect(rewards.distribute('PRO-1', [{ id: 'JIRAUSER1', name: 'Anna', share: 1 }])).rejects.toThrow(
      'bereits verteilt',
    )
  })

  it('refuses a quest it never filed', async () => {
    const { rewards } = setup()

    await expect(rewards.distribute('PRO-9', [{ id: 'a', name: 'a', share: 1 }])).rejects.toThrow(
      'Keine Belohnung zu PRO-9',
    )
  })
})

describe('profile', () => {
  it('opens without searching Jira for old quests', async () => {
    const { rewards, calls } = setup({ me: anna })

    const result = await rewards.profile()

    expect(calls.filter((url) => url.pathname.endsWith('/search'))).toEqual([])
    expect(result).toMatchObject({ experience: 0, completed: 0, pending: { quests: 0 } })
  })

  it('shows what is waiting for the giver as pending', async () => {
    const { rewards } = setup({ me: anna })
    await rewards.handIn(quest('PRO-1'))

    const result = await rewards.profile()

    expect(result).toMatchObject({ name: 'Anna Berg', pending: { experience: 450, quests: 1 }, experience: 0 })
  })
})

describe('inbox', () => {
  it('names the reader and marks messages read', async () => {
    const { rewards } = setup()
    await rewards.handIn(quest('PRO-1'))
    const before = await rewards.inbox()

    await rewards.markRead(before.messages.map((message) => message.id))

    expect(before.me).toEqual({ id: 'JIRAUSER9', name: 'Gerd Geber' })
    expect((await rewards.inbox()).messages.map((message) => message.read)).toEqual([true])
  })
})

describe('users', () => {
  it('finds Jira users for the dialog', async () => {
    const { rewards } = setup()

    expect(await rewards.users('anna')).toEqual([{ id: 'JIRAUSER1', name: 'Anna Berg' }])
  })
})

describe('parseEquip', () => {
  it('wants an item and whether to put it on', () => {
    expect(parseEquip({ item: 'iron-helm', equipped: true })).toEqual({ item: 'iron-helm', equipped: true })
    expect(() => parseEquip({ equipped: true })).toThrow('Gegenstand fehlt')
    expect(() => parseEquip({ item: 'iron-helm', equipped: 'ja' })).toThrow('anlegen oder ablegen')
    expect(() => parseEquip(null)).toThrow('Gegenstand fehlt')
  })
})

describe('equipment', () => {
  it('dresses the player in the starter kit on first sight', async () => {
    const { rewards } = setup({ me: anna })

    const result = await rewards.equipment()

    expect(result.items.filter((item) => item.equipped).map((item) => item.id)).toContain('wool-hood')
    expect(result.items.find((item) => item.id === 'iron-helm')).toEqual({ id: 'iron-helm', equipped: false })
  })

  it('swaps an item in its slot', async () => {
    const { rewards } = setup({ me: anna })

    const result = await rewards.equip('iron-helm', true)

    expect(result.items.find((item) => item.id === 'iron-helm')?.equipped).toBe(true)
    expect(result.items.find((item) => item.id === 'wool-hood')?.equipped).toBe(false)
  })

  it('refuses an item that does not exist', async () => {
    const { rewards } = setup({ me: anna })

    await expect(rewards.equip('golden-crown', true)).rejects.toThrow('Unbekannter Gegenstand: golden-crown')
  })
})
