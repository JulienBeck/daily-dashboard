import { describe, expect, it } from 'vitest'
import {
  daysUntil,
  nextSeason,
  nextSeasonStart,
  reminderActive,
  seasonFor,
  workdaysBetween,
} from './season.js'

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('seasonFor', () => {
  it.each([
    [at(2026, 3, 1), 'spring'],
    [at(2026, 5, 31), 'spring'],
    [at(2026, 6, 1), 'summer'],
    [at(2026, 8, 31), 'summer'],
    [at(2026, 9, 1), 'autumn'],
    [at(2026, 11, 30), 'autumn'],
    [at(2026, 12, 1), 'winter'],
    [at(2027, 1, 15), 'winter'],
    [at(2027, 2, 28), 'winter'],
  ])('%s is %s', (date, key) => {
    expect(seasonFor(date).key).toBe(key)
  })

  it('flips on the first of the month, not before', () => {
    expect(seasonFor(at(2026, 2, 28)).key).toBe('winter')
    expect(seasonFor(at(2026, 3, 1)).key).toBe('spring')
  })
})

describe('nextSeasonStart', () => {
  it.each([
    [at(2026, 10, 19), at(2026, 12, 1)],
    [at(2026, 3, 1), at(2026, 6, 1)],
    [at(2026, 5, 31), at(2026, 6, 1)],
    [at(2026, 11, 30), at(2026, 12, 1)],
  ])('%s points at %s', (now, expected) => {
    expect(nextSeasonStart(now).getTime()).toBe(expected.getTime())
  })

  it('crosses the year boundary from December', () => {
    expect(nextSeasonStart(at(2026, 12, 15)).getTime()).toBe(at(2027, 3, 1).getTime())
  })

  it('stays inside the year from February', () => {
    expect(nextSeasonStart(at(2027, 2, 1)).getTime()).toBe(at(2027, 3, 1).getTime())
  })
})

describe('nextSeason', () => {
  it('names the season that is coming, not the current one', () => {
    expect(nextSeason(at(2026, 10, 19)).key).toBe('winter')
    expect(nextSeason(at(2026, 12, 2)).key).toBe('spring')
  })
})

describe('daysUntil', () => {
  it('counts calendar days regardless of clock time', () => {
    const from = new Date(2026, 9, 19, 23, 59)
    const to = new Date(2026, 9, 20, 0, 1)
    expect(daysUntil(from, to)).toBe(1)
  })

  it('is unaffected by the daylight-saving change', () => {
    expect(daysUntil(at(2026, 10, 24), at(2026, 10, 26))).toBe(2)
  })

  it('goes negative for a past date', () => {
    expect(daysUntil(at(2026, 10, 19), at(2026, 10, 17))).toBe(-2)
  })
})

describe('reminderActive', () => {
  it('is quiet two months before the change', () => {
    expect(reminderActive(at(2026, 10, 31))).toBe(false)
  })

  it('fires from the first of the preceding month', () => {
    expect(reminderActive(at(2026, 11, 1))).toBe(true)
    expect(reminderActive(at(2026, 11, 30))).toBe(true)
  })

  it('fires across the year boundary', () => {
    expect(reminderActive(at(2027, 2, 1))).toBe(true)
    expect(reminderActive(at(2027, 1, 31))).toBe(false)
  })

  it('honours a longer lead time', () => {
    expect(reminderActive(at(2026, 10, 1), 2)).toBe(true)
    expect(reminderActive(at(2026, 9, 30), 2)).toBe(false)
  })
})

describe('workdaysBetween', () => {
  it('skips weekends', () => {
    expect(workdaysBetween(at(2026, 10, 19), at(2026, 10, 26))).toBe(5)
  })

  it('is zero once the target has passed', () => {
    expect(workdaysBetween(at(2026, 10, 26), at(2026, 10, 19))).toBe(0)
  })

  it('counts the target day itself', () => {
    expect(workdaysBetween(at(2026, 10, 19), at(2026, 10, 20))).toBe(1)
  })
})
