import type {
  CalendarByMember,
  CommitRow,
  EpicsPayload,
  IssueRow,
  MergeRequestRow,
  Payload,
  PipelineRow,
  SprintInfo,
  TeamMember,
} from '../shared/types.js'

export interface BoardConfig {
  team: TeamMember[]
  refreshSeconds: number
  reminderLeadMonths: number
  weekComponents: string[]
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '')

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${base}/api${path}`, { headers: { accept: 'application/json' } })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${base}/api${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? `${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

export const getBoard = () => get<BoardConfig>('/board')
export const getPipelines = () => get<Payload<PipelineRow[]>>('/pipelines')
export const getMergeRequests = () => get<Payload<MergeRequestRow[]>>('/mrs')
export const getSprint = () => get<Payload<{ sprint: SprintInfo; issues: IssueRow[] }>>('/sprint')
export const getCommits = () => get<Payload<Record<string, CommitRow[]>>>('/commits')
export const getCalendar = () => get<Payload<CalendarByMember>>('/calendar')
export const getEpics = () => get<Payload<EpicsPayload>>('/epics')

export const moveIssue = (key: string, lane: IssueRow['lane']) =>
  post<{ key: string; lane: IssueRow['lane']; status: string }>(
    `/issues/${encodeURIComponent(key)}/lane`,
    { lane },
  )
