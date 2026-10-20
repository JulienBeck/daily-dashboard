export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter'

export type AmpelState = 'good' | 'warning' | 'critical' | 'running' | 'idle'

export interface PipelineRow {
  fullPath: string
  name: string
  ref: string
  state: AmpelState
  rawStatus: string
  /** GitLab's own wording, e.g. "passed with warnings" — shown on hover. */
  detail: string | null
  /** Run is through, a manual job is still waiting for someone to press it. */
  waiting: boolean
  finishedAt: string | null
  author: string | null
  webUrl: string | null
}

export interface MergeRequestRow {
  title: string
  project: string
  author: string
  ageDays: number
  draft: boolean
  approvals: number
  webUrl: string
}

export interface IssueRow {
  key: string
  summary: string
  assignee: string | null
  initials: string
  avatar: string | null
  points: number | null
  flagged: boolean
  lane: 'todo' | 'doing' | 'done'
  week: string | null
  webUrl: string
}

export interface EpicsPayload {
  /** The JQL actually sent to Jira — shown in the UI so it can be checked. */
  jql: string
  rows: EpicRow[]
}

export interface EpicRow {
  key: string
  summary: string
  status: string
  lane: 'todo' | 'doing' | 'done'
  colour: string | null
  webUrl: string
}

export interface SprintInfo {
  name: string
  startDate: string | null
  endDate: string | null
  workdaysLeft: number | null
  workdaysTotal: number | null
  pointsField: string | null
  points: { done: number; doing: number; open: number }
}

export interface TeamMember {
  name: string
  initials: string
  away: string | null
  /** GitLab username; null means no commits are fetched for this member. */
  gitlabUser: string | null
  /** true for the one member the GITLAB_TOKEN belongs to. */
  self: boolean
  /** Jira user to look the picture up with; null means search by name. */
  jiraUser: string | null
  /** Filled by the proxy, not by the config file. */
  avatar: string | null
}

export interface CalendarEntry {
  summary: string
  start: string
  end: string
  allDay: boolean
}

export interface MemberDay {
  yesterday: CalendarEntry[]
  today: CalendarEntry[]
  away: string | null
}

export type CalendarByMember = Record<string, MemberDay>

export interface CommitRow {
  title: string
  project: string
  ref: string | null
  count: number
  at: string
}

export interface Payload<T> {
  data: T
  fetchedAt: string
  stale: boolean
  error: string | null
}
