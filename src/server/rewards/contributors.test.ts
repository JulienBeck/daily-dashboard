import { describe, expect, it } from 'vitest'
import { assigneeChanges, contributors, personOf } from './contributors.js'

const anna = { id: 'JIRAUSER1', name: 'Anna Berg' }
const ben = { id: 'JIRAUSER2', name: 'Ben Cohn' }

describe('personOf', () => {
  it('prefers the account id, then the user key, then the login', () => {
    expect(personOf({ accountId: 'acc', key: 'k', name: 'n', displayName: 'Anna' })).toEqual({ id: 'acc', name: 'Anna' })
    expect(personOf({ key: 'k', name: 'n', displayName: 'Anna' })).toEqual({ id: 'k', name: 'Anna' })
    expect(personOf({ name: 'aberg' })).toEqual({ id: 'aberg', name: 'aberg' })
  })

  it('knows nobody without an identifier', () => {
    expect(personOf(null)).toBeNull()
    expect(personOf({ displayName: 'Anna' })).toBeNull()
  })
})

describe('assigneeChanges', () => {
  it('picks the assignee changes out of the history, oldest first', () => {
    const changes = assigneeChanges([
      { created: '2026-11-10T10:00:00Z', items: [{ field: 'assignee', from: 'JIRAUSER1', fromString: 'Anna Berg', to: 'JIRAUSER2', toString: 'Ben Cohn' }] },
      { created: '2026-11-05T10:00:00Z', items: [{ field: 'status', from: '1', to: '3' }, { field: 'reporter', from: 'JIRAUSER7', fromString: 'Alt', to: 'JIRAUSER8', toString: 'Neu' }, { fieldId: 'assignee', from: null, to: 'JIRAUSER1', toString: 'Anna Berg' }] },
    ])

    expect(changes).toEqual([
      { at: '2026-11-05T10:00:00Z', from: null, to: anna },
      { at: '2026-11-10T10:00:00Z', from: anna, to: ben },
    ])
  })

  it('falls back to the identifier when the name is missing', () => {
    expect(assigneeChanges([{ created: 'x', items: [{ field: 'assignee', from: 'JIRAUSER1', to: null }] }])[0]!.from).toEqual({
      id: 'JIRAUSER1',
      name: 'JIRAUSER1',
    })
  })
})

describe('contributors', () => {
  it('weighs everybody by the time the quest was theirs', () => {
    const shares = contributors('2026-11-01T00:00:00Z', '2026-11-05T00:00:00Z', ben, [
      { at: '2026-11-01T00:00:00Z', from: null, to: anna },
      { at: '2026-11-04T00:00:00Z', from: anna, to: ben },
    ])

    expect(shares).toEqual([
      { ...anna, share: 0.75 },
      { ...ben, share: 0.25 },
    ])
  })

  it('leaves out the time nobody had it', () => {
    const shares = contributors('2026-11-01T00:00:00Z', '2026-11-05T00:00:00Z', anna, [
      { at: '2026-11-03T00:00:00Z', from: null, to: anna },
    ])

    expect(shares).toEqual([{ ...anna, share: 1 }])
  })

  it('counts the first assignee from creation on', () => {
    const shares = contributors('2026-11-01T00:00:00Z', '2026-11-03T00:00:00Z', ben, [
      { at: '2026-11-02T00:00:00Z', from: anna, to: ben },
    ])

    expect(shares).toEqual([
      { ...anna, share: 0.5 },
      { ...ben, share: 0.5 },
    ])
  })

  it('adds up somebody who had it twice', () => {
    const shares = contributors('2026-11-01T00:00:00Z', '2026-11-05T00:00:00Z', anna, [
      { at: '2026-11-02T00:00:00Z', from: anna, to: ben },
      { at: '2026-11-03T00:00:00Z', from: ben, to: anna },
    ])

    expect(shares).toEqual([
      { ...anna, share: 0.75 },
      { ...ben, share: 0.25 },
    ])
  })

  it('ignores changes after the quest was done', () => {
    const shares = contributors('2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', ben, [
      { at: '2026-11-04T00:00:00Z', from: anna, to: ben },
    ])

    expect(shares).toEqual([{ ...anna, share: 1 }])
  })

  it('gives a quest done on the spot to whoever held it then, not to whom it was handed later', () => {
    expect(
      contributors('2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z', ben, [
        { at: '2026-11-04T00:00:00Z', from: anna, to: ben },
      ]),
    ).toEqual([{ ...anna, share: 1 }])
  })

  it('takes the current assignee when the history says nothing', () => {
    expect(contributors('2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', anna, [])).toEqual([{ ...anna, share: 1 }])
  })

  it('gives a quest done on the spot to whoever held it', () => {
    expect(contributors('2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z', anna, [])).toEqual([{ ...anna, share: 1 }])
  })

  it('finds nobody for a quest that never had an assignee', () => {
    expect(contributors('2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', null, [])).toEqual([])
  })
})
