import type { UpcomingAbsence } from '../shared/types.js'

export interface Absence {
  member: string
  from: string
  to: string
  label: string
}

export interface MemberAbsence {
  away: string | null
  nextAway: UpcomingAbsence | null
}

const isDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

export const dayKey = (date: Date) =>
  `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

export function parseAbsences(raw: unknown): Absence[] {
  const entries = Array.isArray(raw) ? raw : []
  const parsed: Absence[] = []

  for (const entry of entries as Record<string, unknown>[]) {
    const member = entry?.member
    const from = entry?.from
    const to = isDay(entry?.to) ? entry.to : from
    if (typeof member !== 'string' || !member || !isDay(from) || !isDay(to)) continue

    parsed.push({
      member,
      from: from <= to ? from : to,
      to: from <= to ? to : from,
      label: typeof entry.label === 'string' && entry.label ? entry.label : 'Urlaub',
    })
  }

  return parsed
}

export function resolveAbsence(
  absences: readonly Absence[],
  member: string,
  today: string,
  lookaheadDays: number,
): MemberAbsence {
  const mine = absences.filter((entry) => entry.member === member)
  const current = mine.find((entry) => entry.from <= today && today <= entry.to)
  const next = mine
    .filter((entry) => entry.from > today && daysBetween(today, entry.from) <= lookaheadDays)
    .sort((a, b) => a.from.localeCompare(b.from))[0]

  return {
    away: current?.label ?? null,
    nextAway: next
      ? { label: next.label, from: next.from, to: next.to, inDays: daysBetween(today, next.from) }
      : null,
  }
}
