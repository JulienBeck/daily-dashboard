import { readFileSync } from 'node:fs'
import type { TeamMember } from '../shared/types.js'

export interface GitlabConfig {
  baseUrl: string
  groups: string[]
  includeSubgroups: boolean
  exclude: string[]
  staleAfterDays: number
  includeArchived: boolean
  hideWithoutPipeline: boolean
  /** Raw statuses or detail groups to show as green anyway. Escape hatch. */
  forceGood: string[]
}

export interface JiraConfig {
  baseUrl: string
  flavor: 'auto' | 'server' | 'cloud'
  boardId: number | null
  jql: string | null
  storyPointsField: string | null
  doneStatusCategories: string[]
  doingStatusCategories: string[]
  weekComponents: string[]
  epicsBoardId: number | null
  epicsJql: string | null
  epicsStatusCategories: string[]
  epicsLimit: number
}

export interface CalendarSource {
  member: string
  env: string
  own: boolean
}

export interface CalendarConfig {
  sources: CalendarSource[]
  absenceKeywords: string[]
}

export interface DashboardConfig {
  gitlab: GitlabConfig
  jira: JiraConfig
  theme: { reminderLeadMonths: number }
  team: TeamMember[]
  calendar: CalendarConfig
  activity: { days: number; perMember: number }
  refreshSeconds: number
  cacheSeconds: { gitlab: number; jira: number; calendar: number }
}

const initials = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .slice(0, 2)
    .join('')

export function parseConfig(raw: unknown): DashboardConfig {
  const source = (raw ?? {}) as Record<string, any>
  const gitlab = source.gitlab ?? {}
  const jira = source.jira ?? {}
  const theme = source.theme ?? {}
  const activity = source.activity ?? {}
  const calendar = source.calendar ?? {}
  const cache = source.cacheSeconds ?? {}

  return {
    gitlab: {
      baseUrl: String(gitlab.baseUrl ?? '').replace(/\/+$/, ''),
      groups: Array.isArray(gitlab.groups) ? gitlab.groups.map(String) : [],
      includeSubgroups: gitlab.includeSubgroups !== false,
      exclude: Array.isArray(gitlab.exclude) ? gitlab.exclude.map(String) : [],
      staleAfterDays: Number(gitlab.staleAfterDays ?? 14),
      includeArchived: gitlab.includeArchived === true,
      hideWithoutPipeline: gitlab.hideWithoutPipeline !== false,
      forceGood: Array.isArray(gitlab.forceGood) ? gitlab.forceGood.map(String) : [],
    },
    jira: {
      baseUrl: String(jira.baseUrl ?? '').replace(/\/+$/, ''),
      flavor: ['server', 'cloud'].includes(jira.flavor) ? jira.flavor : 'auto',
      boardId: jira.boardId == null ? null : Number(jira.boardId),
      jql: jira.jql ? String(jira.jql) : null,
      storyPointsField: jira.storyPointsField ? String(jira.storyPointsField) : null,
      doneStatusCategories: Array.isArray(jira.doneStatusCategories)
        ? jira.doneStatusCategories.map(String)
        : ['done'],
      doingStatusCategories: Array.isArray(jira.doingStatusCategories)
        ? jira.doingStatusCategories.map(String)
        : ['indeterminate'],
      weekComponents: Array.isArray(jira.weekComponents)
        ? jira.weekComponents.map(String)
        : ['Woche 1', 'Woche 2'],
      epicsBoardId: jira.epicsBoardId == null ? null : Number(jira.epicsBoardId),
      epicsJql: jira.epicsJql ? String(jira.epicsJql) : null,
      epicsStatusCategories: Array.isArray(jira.epicsStatusCategories)
        ? jira.epicsStatusCategories.map(String)
        : ['indeterminate'],
      epicsLimit: Number(jira.epicsLimit ?? 4),
    },
    theme: { reminderLeadMonths: Number(theme.reminderLeadMonths ?? 1) },
    team: (Array.isArray(source.team) ? source.team : []).map((member: any) => ({
      name: String(member.name ?? ''),
      initials: member.initials ? String(member.initials) : initials(String(member.name ?? '?')),
      away: member.away ? String(member.away) : null,
      // gitlabUser: true means "that is me, use the token owner"; a string is a
      // username; false/absent means this member gets no commit list at all.
      gitlabUser: typeof member.gitlabUser === 'string' && member.gitlabUser ? member.gitlabUser : null,
      self: member.gitlabUser === true || member.self === true,
    })),
    calendar: {
      sources: (Array.isArray(calendar.sources) ? calendar.sources : []).map((entry: any) => ({
        member: String(entry.member ?? ''),
        env: String(entry.env ?? ''),
        own: entry.own === true,
      })),
      absenceKeywords: Array.isArray(calendar.absenceKeywords)
        ? calendar.absenceKeywords.map(String)
        : ['urlaub', 'abwesend', 'frei', 'krank', 'ooo', 'out of office'],
    },
    activity: {
      days: Number(activity.days ?? 1),
      perMember: Number(activity.perMember ?? 5),
    },
    refreshSeconds: Number(source.refreshSeconds ?? 60),
    cacheSeconds: {
      gitlab: Number(cache.gitlab ?? 60),
      jira: Number(cache.jira ?? 120),
      calendar: Number(cache.calendar ?? 300),
    },
  }
}

export function loadConfig(path = process.env.DASHBOARD_CONFIG ?? './dashboard.config.json') {
  return parseConfig(JSON.parse(readFileSync(path, 'utf8')))
}
