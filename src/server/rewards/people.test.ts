import { describe, expect, it } from 'vitest'
import type { JiraConfig } from '../questlog/config.js'
import { createPeople, PEOPLE_SECONDS } from './people.js'

const jira: JiraConfig = {
  baseUrl: 'https://jira.test',
  flavor: 'server',
  storyPointsField: null,
  epicLinkField: null,
  epicNameField: null,
  doneStatusCategories: ['done'],
  doingStatusCategories: ['indeterminate'],
  openStatusCategories: ['new'],
  maxQuests: 100,
}

const owner = { key: 'JIRAUSER1', name: 'jbeck', displayName: 'Julien Beck' }
const daniel = { key: 'JIRAUSER4', name: 'D.Dietrich', displayName: 'Daniel Dietrich', emailAddress: 'D.Dietrich@x.test' }
const viewer = (email: string) => ({ email, name: email, member: null })
const usual = (url: URL) => (url.pathname.endsWith('/myself') ? owner : [daniel])

function setup(answer: (url: URL) => unknown = usual) {
  const clock = { now: new Date('2026-11-24T09:00:00.000Z') }
  const calls: URL[] = []
  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    calls.push(url)
    const body = answer(url)
    return body === undefined ? new Response('nope', { status: 500 }) : new Response(JSON.stringify(body))
  }) as typeof globalThis.fetch
  return { people: createPeople(jira, { token: 't', email: null }, { fetch, now: () => clock.now }), calls, clock }
}

describe('createPeople', () => {
  it('is the token owner while nobody is signed in', async () => {
    const { people } = setup()

    expect((await people.who(null)).name).toBe('Julien Beck')
  })

  it('is the Jira user behind the signed-in address', async () => {
    const { people } = setup()

    expect((await people.who(viewer('d.dietrich@x.test'))).id).toBe('JIRAUSER4')
  })

  it('asks Jira once per address and not again within the cache time', async () => {
    const { people, calls, clock } = setup()

    await people.who(viewer('d.dietrich@x.test'))
    await people.who(viewer('D.Dietrich@X.test'))
    expect(calls).toHaveLength(1)

    clock.now = new Date(clock.now.getTime() + PEOPLE_SECONDS * 1000)
    await people.who(viewer('d.dietrich@x.test'))
    expect(calls).toHaveLength(2)
  })

  it('keeps the token owner and a signed-in person apart', async () => {
    const { people } = setup()

    expect((await people.who(null)).id).toBe('JIRAUSER1')
    expect((await people.who(viewer('d.dietrich@x.test'))).id).toBe('JIRAUSER4')
  })

  it('forgets a failed lookup, so the next request tries again', async () => {
    let up = false
    const { people } = setup(() => (up ? [daniel] : []))

    await expect(people.who(viewer('d.dietrich@x.test'))).rejects.toThrow()
    up = true
    expect((await people.who(viewer('d.dietrich@x.test'))).id).toBe('JIRAUSER4')
  })
})
