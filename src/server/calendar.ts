import type { CalendarByMember, CalendarEntry } from '../shared/types.js'
import type { CalendarConfig } from './config.js'
import { parseIcs, type IcsEvent } from './ics.js'

export interface CalendarDeps {
  fetch: typeof fetch
  now: () => Date
}

export const startOfDay = (date: Date, offsetDays = 0) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays)

export function isAbsence(summary: string, keywords: readonly string[]): boolean {
  const text = summary.toLowerCase()
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()))
}

export function toEntries(
  events: readonly IcsEvent[],
  dayStart: Date,
  dayEnd: Date,
): CalendarEntry[] {
  return events
    .filter((event) => event.start < dayEnd && event.end > dayStart)
    .map((event) => ({
      summary: event.summary,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      allDay: event.allDay,
    }))
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function absencesOf(
  events: readonly IcsEvent[],
  dayStart: Date,
  dayEnd: Date,
  keywords: readonly string[],
): string | null {
  const hit = events.find(
    (event) =>
      event.allDay &&
      event.start < dayEnd &&
      event.end > dayStart &&
      isAbsence(event.summary, keywords),
  )
  return hit?.summary ?? null
}

export async function fetchCalendar(
  config: CalendarConfig,
  urls: Readonly<Record<string, string>>,
  deps: CalendarDeps,
): Promise<CalendarByMember> {
  const now = deps.now()
  const from = startOfDay(now, -1)
  const todayStart = startOfDay(now)
  const todayEnd = startOfDay(now, 1)

  const entries = await Promise.all(
    config.sources.map(async (source) => {
      const url = urls[source.env]
      const events: IcsEvent[] = url ? await loadIcs(url, from, todayEnd, deps).catch(() => []) : []
      return [
        source.member,
        {
          yesterday: toEntries(events, from, todayStart),
          today: toEntries(events, todayStart, todayEnd),
          away: absencesOf(events, todayStart, todayEnd, config.absenceKeywords),
        },
      ] as const
    }),
  )

  return Object.fromEntries(entries)
}

async function loadIcs(
  url: string,
  from: Date,
  to: Date,
  deps: CalendarDeps,
): Promise<IcsEvent[]> {
  const response = await deps.fetch(url, { headers: { accept: 'text/calendar' } })
  if (!response.ok) throw new Error(`Kalender ${response.status} ${response.statusText}`)
  return parseIcs(await response.text(), from, to)
}
