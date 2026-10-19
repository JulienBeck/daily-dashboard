import { describe, expect, it } from 'vitest'
import { matchesByDay, parseDate, parseIcs, unescapeText, unfold } from './ics.js'

const wrap = (body: string) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', body, 'END:VCALENDAR'].join('\r\n')

const event = (lines: string[]) => wrap(['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n'))

const from = new Date(2026, 9, 18)
const to = new Date(2026, 9, 20)

describe('unfold', () => {
  it('drops the fold marker and joins without inserting a space', () => {
    expect(unfold('SUMMARY:Ein sehr \r\n langer Titel')).toEqual(['SUMMARY:Ein sehr langer Titel'])
  })

  it('joins a line wrapped with a tab', () => {
    expect(unfold('SUMMARY:A\r\n\tB')).toEqual(['SUMMARY:AB'])
  })

  it('leaves normal lines alone', () => {
    expect(unfold('A\r\nB')).toEqual(['A', 'B'])
  })
})

describe('unescapeText', () => {
  it('turns the escaped separators back into characters', () => {
    expect(unescapeText('Planung\\, Teil 2\\; Raum A')).toBe('Planung, Teil 2; Raum A')
  })

  it('replaces a line break with a space, because the row is one line', () => {
    expect(unescapeText('Zeile 1\\nZeile 2')).toBe('Zeile 1 Zeile 2')
  })
})

describe('parseDate', () => {
  it('reads an all-day date as local midnight', () => {
    const parsed = parseDate('20261019')!
    expect(parsed.allDay).toBe(true)
    expect(parsed.date.getHours()).toBe(0)
    expect(parsed.date.getDate()).toBe(19)
  })

  it('reads a Z timestamp as UTC', () => {
    const parsed = parseDate('20261019T070000Z')!
    expect(parsed.allDay).toBe(false)
    expect(parsed.date.toISOString()).toBe('2026-10-19T07:00:00.000Z')
  })

  it('reads a timestamp without Z as local time', () => {
    const parsed = parseDate('20261019T090000')!
    expect(parsed.date.getHours()).toBe(9)
  })

  it('returns null for something that is not a date', () => {
    expect(parseDate('morgen')).toBeNull()
  })
})

describe('matchesByDay', () => {
  it('accepts every day when no BYDAY is given', () => {
    expect(matchesByDay(new Date(2026, 9, 18), [])).toBe(true)
  })

  it('matches the weekday code', () => {
    expect(matchesByDay(new Date(2026, 9, 19), ['MO'])).toBe(true)
    expect(matchesByDay(new Date(2026, 9, 19), ['TU'])).toBe(false)
  })

  it('ignores an ordinal prefix like 2TH', () => {
    expect(matchesByDay(new Date(2026, 9, 19), ['2MO'])).toBe(true)
  })
})

describe('parseIcs', () => {
  it('reads a single appointment', () => {
    const events = parseIcs(
      event(['SUMMARY:Daily', 'DTSTART:20261019T070000Z', 'DTEND:20261019T071500Z']),
      from,
      to,
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.summary).toBe('Daily')
  })

  it('leaves out an appointment outside the window', () => {
    const events = parseIcs(
      event(['SUMMARY:Alt', 'DTSTART:20260101T070000Z', 'DTEND:20260101T080000Z']),
      from,
      to,
    )
    expect(events).toHaveLength(0)
  })

  it('skips an entry without a summary rather than showing an empty row', () => {
    const events = parseIcs(event(['DTSTART:20261019T070000Z', 'DTEND:20261019T071500Z']), from, to)
    expect(events).toHaveLength(0)
  })

  it('expands a daily series into the window', () => {
    const events = parseIcs(
      event([
        'SUMMARY:Daily',
        'DTSTART:20260105T070000Z',
        'DTEND:20260105T071500Z',
        'RRULE:FREQ=DAILY',
      ]),
      from,
      to,
    )
    expect(events).toHaveLength(2)
  })

  it('honours BYDAY on a weekly series', () => {
    const events = parseIcs(
      event([
        'SUMMARY:Jour fixe',
        'DTSTART:20260105T070000Z',
        'DTEND:20260105T080000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=MO',
      ]),
      from,
      to,
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.start.getDay()).toBe(1)
  })

  it('honours an every-other-week interval', () => {
    const odd = event([
      'SUMMARY:Alle zwei Wochen',
      'DTSTART:20261012T070000Z',
      'DTEND:20261012T080000Z',
      'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
    ])
    expect(parseIcs(odd, from, to)).toHaveLength(0)

    const even = event([
      'SUMMARY:Alle zwei Wochen',
      'DTSTART:20261005T070000Z',
      'DTEND:20261005T080000Z',
      'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
    ])
    expect(parseIcs(even, from, to)).toHaveLength(1)
  })

  it('stops a series at its UNTIL date', () => {
    const events = parseIcs(
      event([
        'SUMMARY:Endet',
        'DTSTART:20260105T070000Z',
        'DTEND:20260105T071500Z',
        'RRULE:FREQ=DAILY;UNTIL=20260201T000000Z',
      ]),
      from,
      to,
    )
    expect(events).toHaveLength(0)
  })

  it('stops a series after COUNT occurrences', () => {
    const events = parseIcs(
      event([
        'SUMMARY:Dreimal',
        'DTSTART:20260105T070000Z',
        'DTEND:20260105T071500Z',
        'RRULE:FREQ=DAILY;COUNT=3',
      ]),
      from,
      to,
    )
    expect(events).toHaveLength(0)
  })

  it('leaves out a cancelled occurrence listed in EXDATE', () => {
    const events = parseIcs(
      event([
        'SUMMARY:Daily',
        'DTSTART:20261005T070000Z',
        'DTEND:20261005T071500Z',
        'RRULE:FREQ=DAILY',
        'EXDATE:20261019T070000Z',
      ]),
      from,
      to,
    )
    expect(events.map((row) => row.start.getDate())).toEqual([18])
  })

  it('reads an all-day absence', () => {
    const events = parseIcs(
      event(['SUMMARY:Urlaub', 'DTSTART;VALUE=DATE:20261019', 'DTEND;VALUE=DATE:20261020']),
      from,
      to,
    )
    expect(events[0]!.allDay).toBe(true)
  })

  it('returns the appointments in chronological order', () => {
    const text = wrap(
      [
        'BEGIN:VEVENT',
        'SUMMARY:Spaet',
        'DTSTART:20261019T150000Z',
        'DTEND:20261019T160000Z',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'SUMMARY:Frueh',
        'DTSTART:20261019T070000Z',
        'DTEND:20261019T080000Z',
        'END:VEVENT',
      ].join('\r\n'),
    )
    expect(parseIcs(text, from, to).map((row) => row.summary)).toEqual(['Frueh', 'Spaet'])
  })

  it('survives a file with no events at all', () => {
    expect(parseIcs(wrap(''), from, to)).toEqual([])
  })
})
