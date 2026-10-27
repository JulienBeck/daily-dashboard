import type { BurndownPayload, BurndownPoint } from '../shared/types.js'
import type { JiraConfig } from './config.js'
import {
  call,
  detectFlavor,
  fetchActiveSprint,
  type JiraCredentials,
  type JiraDeps,
} from './jira.js'

export interface ChartChange {
  key?: string
  added?: boolean
  statC?: { newValue?: number; oldValue?: number }
  column?: { done?: boolean; notDone?: boolean }
}

export interface ScopeChangeChart {
  startTime?: number
  endTime?: number
  now?: number
  changes?: Record<string, ChartChange[]>
  statisticField?: { fieldId?: string }
}

interface IssueState {
  size: number
  inSprint: boolean
  done: boolean
}

export function isIssueCount(chart: ScopeChangeChart): boolean {
  const field = chart.statisticField?.fieldId ?? ''
  return field === '' || field.startsWith('issueCount')
}

/**
 * Replays Jira's own change log into a remaining-work series: every entry moves
 * one issue in or out of the sprint, re-sizes it, or flips its column, and the
 * sum over all issues still in the sprint and not done is one point of the line.
 */
export function toBurndown(
  chart: ScopeChangeChart,
  sprint: { name: string; startDate?: string; endDate?: string },
  now: Date,
): BurndownPayload {
  const counting = isIssueCount(chart)
  const state = new Map<string, IssueState>()
  const points: BurndownPoint[] = []

  const remaining = () => {
    let total = 0
    for (const issue of state.values()) {
      if (issue.inSprint && !issue.done) total += counting ? 1 : issue.size
    }
    return Math.round(total * 100) / 100
  }

  const stamps = Object.keys(chart.changes ?? {})
    .map(Number)
    .filter((stamp) => Number.isFinite(stamp))
    .sort((left, right) => left - right)

  const start = chart.startTime ?? (sprint.startDate ? Date.parse(sprint.startDate) : stamps[0]) ?? 0
  const end = chart.endTime ?? (sprint.endDate ? Date.parse(sprint.endDate) : start)

  let startScope = 0
  let seenStart = false

  for (const stamp of stamps) {
    for (const change of chart.changes![String(stamp)] ?? []) {
      if (!change.key) continue
      const issue = state.get(change.key) ?? { size: 0, inSprint: false, done: false }
      if (change.added != null) issue.inSprint = change.added
      if (change.statC) issue.size = change.statC.newValue ?? 0
      if (change.column?.done === true) issue.done = true
      else if (change.column?.notDone === true) issue.done = false
      state.set(change.key, issue)
    }

    const at = new Date(stamp).toISOString()
    points.push({ at, remaining: remaining() })

    if (stamp <= start) {
      startScope = remaining()
      seenStart = true
    }
  }

  if (!seenStart) startScope = points[0]?.remaining ?? 0

  return {
    sprintName: sprint.name,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    now: new Date(chart.now ?? now.getTime()).toISOString(),
    points,
    startScope,
    scope: scopeOf(state, counting),
    unit: counting ? 'issues' : 'points',
  }
}

function scopeOf(state: Map<string, IssueState>, counting: boolean): number {
  let total = 0
  for (const issue of state.values()) {
    if (issue.inSprint) total += counting ? 1 : issue.size
  }
  return Math.round(total * 100) / 100
}

export async function fetchBurndown(
  config: JiraConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
): Promise<BurndownPayload> {
  const flavor = await detectFlavor(config, credentials, deps)
  const sprint = await fetchActiveSprint(config, credentials, flavor, deps)

  // Undocumented, but the only endpoint that carries the sprint's history. The
  // rapid view id equals the agile board id on Server/DC. Cloud has no such path.
  const chart = await call<ScopeChangeChart>(
    config,
    credentials,
    flavor,
    deps,
    `/rest/greenhopper/1.0/rapid/charts/scopechangeburndownchart?rapidViewId=${config.boardId}&sprintId=${sprint.id}`,
  )

  return toBurndown(chart, sprint, deps.now())
}
