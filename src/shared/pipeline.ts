import type { AmpelState } from './types.js'

const BY_STATUS: Record<string, AmpelState> = {
  success: 'good',
  failed: 'critical',
  canceled: 'warning',
  cancelled: 'warning',
  skipped: 'warning',
  // Every automatic job passed and a human gate is open. Nothing is broken, so
  // the colour stays green; the chip carries a pause icon instead of a check.
  manual: 'good',
  scheduled: 'good',
  running: 'running',
  pending: 'running',
  preparing: 'running',
  created: 'running',
  waiting_for_resource: 'running',
}

const WAITING_STATUSES = ['manual', 'scheduled']

/** True while the run itself is through and only a manual gate is left. */
export function isWaiting(status: string | null | undefined): boolean {
  return Boolean(status) && WAITING_STATUSES.includes(String(status).toLowerCase())
}

export const AMPEL_ORDER: readonly AmpelState[] = [
  'critical',
  'warning',
  'running',
  'idle',
  'good',
]

/**
 * GitLab's plain status cannot express "passed with warnings" — it reports
 * SUCCESS. Its detailedStatus.group can, and so can the other way round, so we
 * let the group decide whenever it says anything about success or failure.
 */
export function stateFromGroup(group: string | null | undefined): AmpelState | null {
  if (!group) return null
  const normalised = group.toLowerCase()
  if (normalised.startsWith('success')) return 'good'
  if (normalised.startsWith('failed')) return 'critical'
  if (normalised === 'running' || normalised === 'pending' || normalised === 'preparing') {
    return 'running'
  }
  return null
}

export function ampelState(
  status: string | null | undefined,
  finishedAt: string | null | undefined,
  now: Date,
  staleAfterDays: number,
  group?: string | null,
  forceGood: readonly string[] = [],
): AmpelState {
  if (!status) return 'idle'

  const wanted = forceGood.map((entry) => entry.toLowerCase())
  const forced =
    wanted.includes(status.toLowerCase()) || (group ? wanted.includes(group.toLowerCase()) : false)

  const mapped = forced ? 'good' : (stateFromGroup(group) ?? BY_STATUS[status.toLowerCase()])
  if (!mapped) return 'idle'
  if (mapped === 'running') return 'running'
  if (!finishedAt) return mapped
  const age = (now.getTime() - new Date(finishedAt).getTime()) / 86_400_000
  if (Number.isNaN(age)) return mapped
  return age > staleAfterDays ? 'idle' : mapped
}

export function excluded(fullPath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    const expression = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`)
    return expression.test(fullPath)
  })
}

export function tally(states: readonly AmpelState[]): Record<AmpelState, number> {
  const counts: Record<AmpelState, number> = {
    good: 0,
    warning: 0,
    critical: 0,
    running: 0,
    idle: 0,
  }
  for (const state of states) counts[state]++
  return counts
}
