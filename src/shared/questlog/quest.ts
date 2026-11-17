import type { Coins, Difficulty, Quest, QuestState, Series } from './types.js'

export const COPPER_PER_SILVER = 100
export const SILVER_PER_GOLD = 100

export const NO_SERIES = ''

export function levelOf(points: number | null): number | null {
  if (points == null || !Number.isFinite(points) || points <= 0) return null
  return Math.round(points * 10)
}

/**
 * The game's colours say how a quest compares to the player's level, so here
 * they say how much a story is worth. Grey is a trivial story, red one nobody
 * takes on alone. Being finished does not change that — the marker says so.
 */
export function difficultyOf(points: number | null): Difficulty {
  if (points == null) return 'standard'
  if (points <= 1) return 'trivial'
  if (points <= 3) return 'easy'
  if (points <= 5) return 'standard'
  if (points <= 8) return 'difficult'
  return 'deadly'
}

export function stateOf(
  categoryKey: string,
  done: readonly string[],
  doing: readonly string[],
): QuestState {
  if (done.includes(categoryKey)) return 'complete'
  if (doing.includes(categoryKey)) return 'active'
  return 'available'
}

export function experienceOf(level: number | null): number {
  return level == null ? 0 : level * 15
}

const PRIORITY_COPPER: Record<string, number> = {
  blocker: 125000,
  highest: 125000,
  critical: 50000,
  high: 50000,
  major: 50000,
  medium: 9400,
  normal: 9400,
  low: 2500,
  minor: 2500,
  lowest: 94,
  trivial: 94,
}

export function splitCoins(copper: number): Coins {
  const total = Math.max(0, Math.floor(copper))
  const gold = Math.floor(total / (COPPER_PER_SILVER * SILVER_PER_GOLD))
  const silver = Math.floor((total % (COPPER_PER_SILVER * SILVER_PER_GOLD)) / COPPER_PER_SILVER)
  return { gold, silver, copper: total % COPPER_PER_SILVER }
}

export function coinsFor(priority: string | null): Coins {
  const key = (priority ?? '').trim().toLowerCase()
  return splitCoins(PRIORITY_COPPER[key] ?? PRIORITY_COPPER.medium!)
}

export function formatLevel(level: number | null): string {
  return level == null ? '[??]' : `[${level}]`
}

export function formatNumber(value: number, locale = 'de-DE'): string {
  return value.toLocaleString(locale)
}

/**
 * Stories group under their epic. Everything without one lands in a single
 * bucket at the end — in front of the named series it would read like the
 * most important one.
 */
export function bySeries(quests: readonly Quest[], baseUrl = ''): Series[] {
  const series = new Map<string, Series>()
  for (const quest of quests) {
    const key = quest.seriesKey ?? NO_SERIES
    const found = series.get(key)
    if (found) found.quests.push(quest)
    else
      series.set(key, {
        key,
        name: quest.seriesName,
        webUrl: key ? `${baseUrl}/browse/${key}` : null,
        epic: null,
        quests: [quest],
      })
  }
  return [...series.values()].sort((left, right) => {
    if (left.key === NO_SERIES) return 1
    if (right.key === NO_SERIES) return -1
    return (left.name ?? '').localeCompare(right.name ?? '', 'de')
  })
}

/**
 * An epic carries no estimate of its own, so its sheet would promise 0 XP for a
 * whole chain. What it is worth is what its stories are worth together; an
 * unestimated chain keeps the empty estimate rather than claiming zero.
 */
export function chainReward(epic: Quest, quests: readonly Quest[]): Quest {
  const points = quests.some((quest) => quest.points != null)
    ? quests.reduce((sum, quest) => sum + (quest.points ?? 0), 0)
    : null
  const level = levelOf(points)
  return {
    ...epic,
    points,
    level,
    difficulty: difficultyOf(points),
    experience: experienceOf(level),
  }
}

export function countComplete(series: readonly Series[]): { total: number; complete: number } {
  const quests = series.flatMap((entry) => entry.quests)
  return {
    total: quests.length,
    complete: quests.filter((quest) => quest.state === 'complete').length,
  }
}

export type Filter = 'all' | 'available' | 'active' | 'complete'

export function matchesFilter(quest: Quest, filter: Filter): boolean {
  return filter === 'all' || quest.state === filter
}

export function applyFilter(series: readonly Series[], filter: Filter): Series[] {
  return series
    .map((entry) => ({ ...entry, quests: entry.quests.filter((q) => matchesFilter(q, filter)) }))
    .filter((entry) => entry.quests.length > 0)
}
