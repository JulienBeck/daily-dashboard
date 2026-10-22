import { describe, expect, it } from 'vitest'
import { dayKey, daysBetween, parseAbsences, resolveAbsence, type Absence } from './absence.js'

const list = (...entries: Partial<Absence>[]): Absence[] =>
  (entries.length ? entries : [{}]).map((entry) => ({
    member: 'Timo',
    from: '2026-10-20',
    to: '2026-10-24',
    label: 'Urlaub',
    ...entry,
  }))

describe('dayKey', () => {
  it('reads the local day, not the utc day', () => {
    expect(dayKey(new Date(2026, 9, 20, 23, 30))).toBe('2026-10-20')
    expect(dayKey(new Date(2026, 9, 20, 0, 30))).toBe('2026-10-20')
  })

  it('pads month and day to two digits', () => {
    expect(dayKey(new Date(2026, 0, 3))).toBe('2026-01-03')
  })
})

describe('daysBetween', () => {
  it('counts whole days forward', () => {
    expect(daysBetween('2026-10-20', '2026-10-24')).toBe(4)
  })

  it('counts across a month boundary', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3)
  })

  it('stays exact across the end of summer time', () => {
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })

  it('is zero for the same day', () => {
    expect(daysBetween('2026-10-20', '2026-10-20')).toBe(0)
  })
})

describe('parseAbsences', () => {
  it('reads a hand-written range', () => {
    const parsed = parseAbsences([
      { member: 'Timo', from: '2026-10-20', to: '2026-10-24', label: 'Urlaub' },
    ])
    expect(parsed).toEqual([
      { member: 'Timo', from: '2026-10-20', to: '2026-10-24', label: 'Urlaub' },
    ])
  })

  it('treats a missing end as a single day off', () => {
    expect(parseAbsences([{ member: 'Timo', from: '2026-11-03' }])[0]).toEqual({
      member: 'Timo',
      from: '2026-11-03',
      to: '2026-11-03',
      label: 'Urlaub',
    })
  })

  it('calls an unlabelled entry Urlaub', () => {
    expect(parseAbsences([{ member: 'Timo', from: '2026-11-03', to: '2026-11-04' }])[0]!.label).toBe(
      'Urlaub',
    )
    expect(
      parseAbsences([{ member: 'Timo', from: '2026-11-03', label: 'Fortbildung' }])[0]!.label,
    ).toBe('Fortbildung')
  })

  it('turns a reversed range round instead of showing nothing', () => {
    expect(parseAbsences([{ member: 'Timo', from: '2026-10-24', to: '2026-10-20' }])[0]).toMatchObject(
      { from: '2026-10-20', to: '2026-10-24' },
    )
  })

  it('drops an entry whose date is not a plain yyyy-mm-dd', () => {
    expect(parseAbsences([{ member: 'Timo', from: '20.10.2026', to: '24.10.2026' }])).toEqual([])
    expect(parseAbsences([{ member: 'Timo', from: '2026-10-20T00:00:00Z' }])).toEqual([])
  })

  it('drops an entry without a member or without a start', () => {
    expect(parseAbsences([{ from: '2026-10-20', to: '2026-10-24' }])).toEqual([])
    expect(parseAbsences([{ member: 'Timo', to: '2026-10-24' }])).toEqual([])
    expect(parseAbsences([{ member: '', from: '2026-10-20' }])).toEqual([])
  })

  it('keeps the good entries when one neighbour is broken', () => {
    const parsed = parseAbsences([
      { member: 'Timo', from: 'morgen' },
      { member: 'Julien', from: '2026-12-22', to: '2027-01-02' },
    ])
    expect(parsed.map((entry) => entry.member)).toEqual(['Julien'])
  })

  it('reads a missing section as no absences at all', () => {
    expect(parseAbsences(undefined)).toEqual([])
    expect(parseAbsences({ Timo: '2026-10-20' })).toEqual([])
  })
})

describe('resolveAbsence', () => {
  it('reports the label on the first day of the range', () => {
    expect(resolveAbsence(list(), 'Timo', '2026-10-20', 14).away).toBe('Urlaub')
  })

  it('counts the end date as still absent', () => {
    expect(resolveAbsence(list(), 'Timo', '2026-10-24', 14).away).toBe('Urlaub')
  })

  it('has the member back the day after the range', () => {
    expect(resolveAbsence(list(), 'Timo', '2026-10-25', 14).away).toBeNull()
  })

  it('says nothing the day before the range starts', () => {
    expect(resolveAbsence(list(), 'Timo', '2026-10-19', 14).away).toBeNull()
  })

  it('keeps the ranges of other members out', () => {
    expect(resolveAbsence(list(), 'Julien', '2026-10-21', 14).away).toBeNull()
  })

  it('announces the next absence with the days left', () => {
    expect(resolveAbsence(list(), 'Timo', '2026-10-18', 14).nextAway).toEqual({
      label: 'Urlaub',
      from: '2026-10-20',
      to: '2026-10-24',
      inDays: 2,
    })
  })

  it('stays quiet about an absence beyond the lookahead', () => {
    expect(resolveAbsence(list(), 'Timo', '2026-10-01', 14).nextAway).toBeNull()
    expect(resolveAbsence(list(), 'Timo', '2026-10-06', 14).nextAway).not.toBeNull()
  })

  it('announces the nearest of several, not the first in the file', () => {
    const absences = list(
      { from: '2026-12-22', to: '2027-01-02' },
      { from: '2026-10-20', to: '2026-10-24' },
    )
    expect(resolveAbsence(absences, 'Timo', '2026-10-18', 90).nextAway?.from).toBe('2026-10-20')
  })

  it('looks past the running absence to the next one', () => {
    const absences = list({ from: '2026-10-20', to: '2026-10-24' }, { from: '2026-10-28' })
    const resolved = resolveAbsence(absences, 'Timo', '2026-10-21', 14)
    expect(resolved.away).toBe('Urlaub')
    expect(resolved.nextAway?.from).toBe('2026-10-28')
  })

  it('does not announce the absence that already runs today', () => {
    expect(resolveAbsence(list(), 'Timo', '2026-10-21', 14).nextAway).toBeNull()
  })

  it('stops announcing on the day the absence begins', () => {
    const resolved = resolveAbsence(list(), 'Timo', '2026-10-20', 14)
    expect(resolved.away).toBe('Urlaub')
    expect(resolved.nextAway).toBeNull()
  })
})
