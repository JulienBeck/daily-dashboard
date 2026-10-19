import { describe, expect, it } from 'vitest'
import { ampelState, excluded, isWaiting, stateFromGroup, tally } from './pipeline.js'

const now = new Date(2026, 9, 19)
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()

describe('ampelState', () => {
  it.each([
    ['success', 'good'],
    ['failed', 'critical'],
    ['canceled', 'warning'],
    ['skipped', 'warning'],
    ['manual', 'good'],
    ['running', 'running'],
    ['pending', 'running'],
  ])('maps %s to %s', (status, expected) => {
    expect(ampelState(status, daysAgo(1), now, 14)).toBe(expected)
  })

  it('accepts GitLab casing variants', () => {
    expect(ampelState('SUCCESS', daysAgo(1), now, 14)).toBe('good')
  })

  it('treats a project without a pipeline as idle', () => {
    expect(ampelState(null, null, now, 14)).toBe('idle')
  })

  it('treats an unknown status as idle rather than guessing', () => {
    expect(ampelState('exploded', daysAgo(1), now, 14)).toBe('idle')
  })

  it('demotes a finished pipeline that is older than the window', () => {
    expect(ampelState('success', daysAgo(15), now, 14)).toBe('idle')
    expect(ampelState('failed', daysAgo(15), now, 14)).toBe('idle')
  })

  it('keeps a pipeline exactly at the window edge', () => {
    expect(ampelState('success', daysAgo(14), now, 14)).toBe('good')
  })

  it('never ages out a running pipeline', () => {
    expect(ampelState('running', daysAgo(99), now, 14)).toBe('running')
  })

  it('keeps the mapping when the timestamp is unusable', () => {
    expect(ampelState('failed', 'nicht-ein-datum', now, 14)).toBe('critical')
  })
})

describe('stateFromGroup', () => {
  it('reads "passed with warnings" as green, because the run passed', () => {
    expect(stateFromGroup('success-with-warnings')).toBe('good')
  })

  it('reads plain success as green', () => {
    expect(stateFromGroup('success')).toBe('good')
  })

  it('reads a failure as red, warnings or not', () => {
    expect(stateFromGroup('failed')).toBe('critical')
    expect(stateFromGroup('failed-with-warnings')).toBe('critical')
  })

  it('ignores a group it does not know, so the plain status decides', () => {
    expect(stateFromGroup('manual')).toBeNull()
    expect(stateFromGroup('canceled')).toBeNull()
    expect(stateFromGroup(null)).toBeNull()
  })
})

describe('ampelState with a detailed group', () => {
  it('lets the group overrule a status that cannot express warnings', () => {
    expect(ampelState('success', daysAgo(1), now, 14, 'success-with-warnings')).toBe('good')
  })

  it('the group wins where it disagrees with the plain status', () => {
    expect(ampelState('canceled', daysAgo(1), now, 14, 'success-with-warnings')).toBe('good')
    expect(ampelState('canceled', daysAgo(1), now, 14, null)).toBe('warning')
  })

  it('the group turns a nominal success red when the run actually failed', () => {
    expect(ampelState('success', daysAgo(1), now, 14, 'failed')).toBe('critical')
  })

  it('still ages the run out when it is too old', () => {
    expect(ampelState('success', daysAgo(99), now, 14, 'success-with-warnings')).toBe('idle')
  })

  it('falls back to the plain status when there is no group', () => {
    expect(ampelState('canceled', daysAgo(1), now, 14, null)).toBe('warning')
  })

  it('does not resurrect a project without any pipeline', () => {
    expect(ampelState(null, null, now, 14, 'success')).toBe('idle')
  })
})

describe('isWaiting', () => {
  it('is true for a run that only lacks a button press', () => {
    expect(isWaiting('manual')).toBe(true)
    expect(isWaiting('scheduled')).toBe(true)
  })

  it('ignores casing, because GitLab shouts in GraphQL', () => {
    expect(isWaiting('MANUAL')).toBe(true)
  })

  it('is false for everything that actually ran to an end', () => {
    expect(isWaiting('success')).toBe(false)
    expect(isWaiting('failed')).toBe(false)
    expect(isWaiting('canceled')).toBe(false)
    expect(isWaiting(null)).toBe(false)
  })
})

describe('a manual gate', () => {
  it('is green, because no job failed', () => {
    expect(ampelState('manual', daysAgo(1), now, 14)).toBe('good')
  })

  it('counts a scheduled run as green too — it simply has not started', () => {
    expect(ampelState('scheduled', daysAgo(1), now, 14)).toBe('good')
  })

  it('does not drag a real failure along with it', () => {
    expect(ampelState('failed', daysAgo(1), now, 14)).toBe('critical')
  })

  it('leaves a cancelled run yellow — somebody stopped that one', () => {
    expect(ampelState('canceled', daysAgo(1), now, 14)).toBe('warning')
    expect(ampelState('skipped', daysAgo(1), now, 14)).toBe('warning')
  })

  it('still ages out when nobody presses the button for weeks', () => {
    expect(ampelState('manual', daysAgo(99), now, 14)).toBe('idle')
  })
})

describe('ampelState with forceGood', () => {
  it('forces a raw status to green', () => {
    expect(ampelState('manual', daysAgo(1), now, 14, null, ['manual'])).toBe('good')
  })

  it('forces a detail group to green', () => {
    expect(ampelState('manual', daysAgo(1), now, 14, 'manual', ['manual'])).toBe('good')
  })

  it('ignores case, so the config does not have to match GitLab exactly', () => {
    expect(ampelState('MANUAL', daysAgo(1), now, 14, null, ['Manual'])).toBe('good')
  })

  it('leaves everything else alone', () => {
    expect(ampelState('failed', daysAgo(1), now, 14, null, ['manual'])).toBe('critical')
  })

  it('does not revive a project without a pipeline', () => {
    expect(ampelState(null, null, now, 14, null, ['manual'])).toBe('idle')
  })

  it('still ages a forced run out when it is too old', () => {
    expect(ampelState('manual', daysAgo(99), now, 14, null, ['manual'])).toBe('idle')
  })

  it('changes nothing when the list is empty', () => {
    expect(ampelState('canceled', daysAgo(1), now, 14, null, [])).toBe('warning')
  })
})

describe('excluded', () => {
  it('matches an exact path', () => {
    expect(excluded('fe/ki/ki-helm-chart', ['fe/ki/ki-helm-chart'])).toBe(true)
  })

  it('does not match a longer path with the same prefix', () => {
    expect(excluded('fe/ki/ki-helm-chart-on-prem', ['fe/ki/ki-helm-chart'])).toBe(false)
  })

  it('honours a trailing wildcard', () => {
    expect(excluded('fe/ki/oobabooga-docker-image', ['fe/ki/oobabooga*'])).toBe(true)
  })

  it('treats dots literally, not as any-character', () => {
    expect(excluded('feXki/thing', ['fe.ki/thing'])).toBe(false)
  })

  it('returns false for an empty pattern list', () => {
    expect(excluded('fe/ki/ki-backend', [])).toBe(false)
  })
})

describe('tally', () => {
  it('counts every state and reports zeroes for the rest', () => {
    expect(tally(['good', 'good', 'critical'])).toEqual({
      good: 2,
      warning: 0,
      critical: 1,
      running: 0,
      idle: 0,
    })
  })
})
