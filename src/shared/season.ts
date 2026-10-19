import type { SeasonKey } from './types.js'

export interface Season {
  key: SeasonKey
  label: string
  startMonth: number
  span: string
}

export const SEASONS: readonly Season[] = [
  { key: 'winter', label: 'Winter', startMonth: 12, span: 'Dez – Feb' },
  { key: 'spring', label: 'Frühling', startMonth: 3, span: 'Mrz – Mai' },
  { key: 'summer', label: 'Sommer', startMonth: 6, span: 'Jun – Aug' },
  { key: 'autumn', label: 'Herbst', startMonth: 9, span: 'Sep – Nov' },
]

export const seasonByKey = (key: string): Season | undefined =>
  SEASONS.find((s) => s.key === key)

export function seasonFor(date: Date): Season {
  const month = date.getMonth() + 1
  const start = month - (month % 3)
  const wrapped = start === 0 ? 12 : start
  return SEASONS.find((s) => s.startMonth === wrapped) as Season
}

export function nextSeasonStart(date: Date): Date {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const next = Math.ceil((month + 1) / 3) * 3
  return next > 12 ? new Date(year + 1, 2, 1) : new Date(year, next - 1, 1)
}

export function nextSeason(date: Date): Season {
  const start = nextSeasonStart(date)
  return SEASONS.find((s) => s.startMonth === start.getMonth() + 1) as Season
}

export function daysUntil(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / 86_400_000)
}

export function reminderActive(date: Date, leadMonths = 1): boolean {
  const start = nextSeasonStart(date)
  const lead = new Date(start.getFullYear(), start.getMonth() - leadMonths, 1)
  return date.getTime() >= lead.getTime()
}

export function workdaysBetween(from: Date, to: Date): number {
  const days = daysUntil(from, to)
  if (days <= 0) return 0
  let count = 0
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  for (let i = 0; i < days; i++) {
    cursor.setDate(cursor.getDate() + 1)
    const weekday = cursor.getDay()
    if (weekday !== 0 && weekday !== 6) count++
  }
  return count
}
