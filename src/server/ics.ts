export interface IcsEvent {
  summary: string
  start: Date
  end: Date
  allDay: boolean
}

interface RawEvent {
  summary: string
  start: Date
  end: Date
  allDay: boolean
  rrule: string | null
  exdates: number[]
}

export function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

export function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

export function parseDate(value: string): { date: Date; allDay: boolean } | null {
  const plain = /^(\d{4})(\d{2})(\d{2})$/.exec(value)
  if (plain) {
    const n = (index: number) => Number(plain[index])
    return { date: new Date(n(1), n(2) - 1, n(3)), allDay: true }
  }

  const stamp = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value)
  if (!stamp) return null
  const n = (index: number) => Number(stamp[index])

  // A TZID we cannot resolve is read as local time: the board runs in the same
  // timezone as the calendar it shows. Only a trailing Z is unambiguous.
  const date =
    stamp[7] === 'Z'
      ? new Date(Date.UTC(n(1), n(2) - 1, n(3), n(4), n(5), n(6)))
      : new Date(n(1), n(2) - 1, n(3), n(4), n(5), n(6))

  return { date, allDay: false }
}

const WEEKDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export function matchesByDay(date: Date, byDay: readonly string[]): boolean {
  if (byDay.length === 0) return true
  return byDay.some((entry) => entry.slice(-2) === WEEKDAY[date.getDay()])
}

export function expand(event: RawEvent, from: Date, to: Date): IcsEvent[] {
  const base = {
    summary: event.summary,
    allDay: event.allDay,
  }
  const length = event.end.getTime() - event.start.getTime()

  if (!event.rrule) {
    return event.start < to && event.end > from ? [{ ...base, start: event.start, end: event.end }] : []
  }

  const rule = Object.fromEntries(
    event.rrule.split(';').map((part) => {
      const [key, value] = part.split('=')
      return [String(key).toUpperCase(), String(value ?? '')]
    }),
  )

  const freq = rule.FREQ ?? ''
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1))
  const byDay = rule.BYDAY ? rule.BYDAY.split(',') : []
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity
  const until = rule.UNTIL ? (parseDate(rule.UNTIL)?.date ?? null) : null

  const out: IcsEvent[] = []
  const cursor = new Date(event.start)
  const weekStart = startOfWeek(event.start)
  let produced = 0
  let steps = 0

  while (steps < 2000 && produced < count) {
    steps++
    if (until && cursor > until) break
    if (cursor.getTime() - length > to.getTime()) break

    const onWeek =
      freq !== 'WEEKLY' ||
      byDay.length === 0 ||
      weeksBetween(weekStart, cursor) % interval === 0
    const fits = freq === 'WEEKLY' || freq === 'DAILY' ? matchesByDay(cursor, byDay) && onWeek : true

    if (fits) {
      produced++
      const start = new Date(cursor)
      const end = new Date(cursor.getTime() + length)
      if (start < to && end > from && !event.exdates.includes(start.getTime())) {
        out.push({ ...base, start, end })
      }
    }

    if (freq === 'DAILY') cursor.setDate(cursor.getDate() + interval)
    else if (freq === 'WEEKLY') {
      cursor.setDate(cursor.getDate() + (byDay.length > 0 ? 1 : 7 * interval))
    } else if (freq === 'MONTHLY') cursor.setMonth(cursor.getMonth() + interval)
    else if (freq === 'YEARLY') cursor.setFullYear(cursor.getFullYear() + interval)
    else break
  }

  return out
}

function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

function weeksBetween(from: Date, to: Date): number {
  return Math.round((startOfWeek(to).getTime() - from.getTime()) / (7 * 86_400_000))
}

export function parseIcs(text: string, from: Date, to: Date): IcsEvent[] {
  const events: IcsEvent[] = []
  let current: Partial<RawEvent> | null = null

  for (const line of unfold(text)) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = { summary: '', rrule: null, exdates: [] }
      continue
    }
    if (line.startsWith('END:VEVENT')) {
      if (current?.start && current.end && current.summary) {
        events.push(...expand(current as RawEvent, from, to))
      }
      current = null
      continue
    }
    if (!current) continue

    const colon = line.indexOf(':')
    if (colon < 0) continue
    const left = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const [name] = left.split(';')

    if (name === 'SUMMARY') current.summary = unescapeText(value)
    else if (name === 'RRULE') current.rrule = value
    else if (name === 'DTSTART') {
      const parsed = parseDate(value)
      if (parsed) {
        current.start = parsed.date
        current.allDay = parsed.allDay
      }
    } else if (name === 'DTEND') {
      const parsed = parseDate(value)
      if (parsed) current.end = parsed.date
    } else if (name === 'EXDATE') {
      for (const part of value.split(',')) {
        const parsed = parseDate(part)
        if (parsed) current.exdates!.push(parsed.date.getTime())
      }
    }
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime())
}
