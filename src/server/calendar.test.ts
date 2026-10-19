import { describe, expect, it, vi } from 'vitest'
import { absencesOf, fetchCalendar, isAbsence, startOfDay, toEntries } from './calendar.js'
import type { IcsEvent } from './ics.js'

const KEYWORDS = ['urlaub', 'abwesend', 'frei', 'krank']
const now = new Date(2026, 9, 19, 10, 30)

const ev = (over: Partial<IcsEvent> = {}): IcsEvent => ({
  summary: 'Daily',
  start: new Date(2026, 9, 19, 9, 0),
  end: new Date(2026, 9, 19, 9, 15),
  allDay: false,
  ...over,
})

describe('startOfDay', () => {
  it('drops the time', () => {
    expect(startOfDay(now).getHours()).toBe(0)
  })

  it('shifts by whole days', () => {
    expect(startOfDay(now, -1).getDate()).toBe(18)
    expect(startOfDay(now, 1).getDate()).toBe(20)
  })
})

describe('isAbsence', () => {
  it.each(['Urlaub', 'URLAUB bis Freitag', 'Bin abwesend', 'krank gemeldet'])(
    'recognises %s',
    (summary) => {
      expect(isAbsence(summary, KEYWORDS)).toBe(true)
    },
  )

  it('leaves a normal appointment alone', () => {
    expect(isAbsence('Sprint Planning', KEYWORDS)).toBe(false)
  })

  it('does not fire on an empty keyword list', () => {
    expect(isAbsence('Urlaub', [])).toBe(false)
  })
})

describe('toEntries', () => {
  const dayStart = startOfDay(now)
  const dayEnd = startOfDay(now, 1)

  it('keeps an appointment inside the day', () => {
    expect(toEntries([ev()], dayStart, dayEnd)).toHaveLength(1)
  })

  it('drops an appointment from another day', () => {
    expect(toEntries([ev({ start: new Date(2026, 9, 17), end: new Date(2026, 9, 17, 1) })], dayStart, dayEnd)).toHaveLength(0)
  })

  it('keeps an appointment that reaches into the day', () => {
    const overnight = ev({ start: new Date(2026, 9, 18, 23), end: new Date(2026, 9, 19, 1) })
    expect(toEntries([overnight], dayStart, dayEnd)).toHaveLength(1)
  })

  it('sorts by start time', () => {
    const rows = toEntries(
      [
        ev({ summary: 'spaet', start: new Date(2026, 9, 19, 15), end: new Date(2026, 9, 19, 16) }),
        ev({ summary: 'frueh' }),
      ],
      dayStart,
      dayEnd,
    )
    expect(rows.map((row) => row.summary)).toEqual(['frueh', 'spaet'])
  })
})

describe('absencesOf', () => {
  const dayStart = startOfDay(now)
  const dayEnd = startOfDay(now, 1)

  it('finds an all-day absence', () => {
    const urlaub = ev({
      summary: 'Urlaub',
      allDay: true,
      start: new Date(2026, 9, 19),
      end: new Date(2026, 9, 24),
    })
    expect(absencesOf([urlaub], dayStart, dayEnd, KEYWORDS)).toBe('Urlaub')
  })

  it('ignores a timed appointment even if it says urlaub', () => {
    expect(absencesOf([ev({ summary: 'Urlaub planen' })], dayStart, dayEnd, KEYWORDS)).toBeNull()
  })

  it('ignores an absence on another day', () => {
    const past = ev({
      summary: 'Urlaub',
      allDay: true,
      start: new Date(2026, 9, 10),
      end: new Date(2026, 9, 12),
    })
    expect(absencesOf([past], dayStart, dayEnd, KEYWORDS)).toBeNull()
  })
})

describe('fetchCalendar', () => {
  const config = {
    sources: [
      { member: 'J. Beck', env: 'ICS_BECK', own: true },
      { member: 'A. Hartmann', env: 'ICS_HARTMANN', own: false },
    ],
    absenceKeywords: KEYWORDS,
  }

  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Daily',
    'DTSTART:20261019T070000Z',
    'DTEND:20261019T071500Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const ok = (text: string) => ({ ok: true, text: async () => text }) as Response

  it('keeps every member apart', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(ics))
    const result = await fetchCalendar(config, { ICS_BECK: 'u1', ICS_HARTMANN: 'u2' }, {
      fetch: fetchMock as never,
      now: () => now,
    })
    expect(Object.keys(result)).toEqual(['J. Beck', 'A. Hartmann'])
    expect(result['J. Beck']!.today).toHaveLength(1)
  })

  it('returns an empty day for a member without a configured url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(ics))
    const result = await fetchCalendar(config, { ICS_BECK: 'u1' }, {
      fetch: fetchMock as never,
      now: () => now,
    })
    expect(result['A. Hartmann']).toEqual({ yesterday: [], today: [], away: null })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not let one broken calendar take the others down', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })
      .mockResolvedValueOnce(ok(ics))
    const result = await fetchCalendar(config, { ICS_BECK: 'u1', ICS_HARTMANN: 'u2' }, {
      fetch: fetchMock as never,
      now: () => now,
    })
    expect(result['J. Beck']!.today).toHaveLength(0)
    expect(result['A. Hartmann']!.today).toHaveLength(1)
  })
})
