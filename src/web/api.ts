import type {
  BurndownPayload,
  CalendarByMember,
  CommitsPayload,
  EpicsPayload,
  IssueRow,
  MergeRequestRow,
  Payload,
  PipelineRow,
  SprintInfo,
  TeamMember,
} from '../shared/types.js'
import type { Body, EquipmentPayload } from '../shared/avatar.js'
import type { ProfilePayload } from '../shared/questlog/types.js'
import type { InboxPayload, Person, RewardDraft, Weighted } from '../shared/rewards.js'

export interface BoardConfig {
  team: TeamMember[]
  refreshSeconds: number
  reminderLeadMonths: number
  weekComponents: string[]
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '')

async function get<T>(path: string, fresh = false): Promise<T> {
  const response = await fetch(`${base}/api${path}${fresh ? '?fresh=1' : ''}`, {
    headers: { accept: 'application/json' },
  })
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
export const getPipelines = (fresh = false) => get<Payload<PipelineRow[]>>('/pipelines', fresh)
export const getMergeRequests = () => get<Payload<MergeRequestRow[]>>('/mrs')
export const getSprint = () => get<Payload<{ sprint: SprintInfo; issues: IssueRow[] }>>('/sprint')
export const getCommits = () => get<Payload<CommitsPayload>>('/commits')
export const getCalendar = () => get<Payload<CalendarByMember>>('/calendar')
export const getEpics = () => get<Payload<EpicsPayload>>('/epics')
export const getBurndown = () => get<Payload<BurndownPayload>>('/burndown')
export const getProfile = () => get<Payload<ProfilePayload>>('/profile')
export const getInbox = () => get<InboxPayload>('/inbox')
export const markRead = (ids: number[]) => post<{ ok: boolean }>('/inbox/read', { ids })
export const getReward = (key: string) => get<RewardDraft>(`/rewards/${encodeURIComponent(key)}`)
export const distributeReward = (key: string, shares: Weighted[]) =>
  post<RewardDraft>(`/rewards/${encodeURIComponent(key)}`, { shares })
export const getEquipment = () => get<EquipmentPayload>('/equipment')
export const setEquipped = (item: string, equipped: boolean) =>
  post<EquipmentPayload>('/equipment', { item, equipped })
export const setBody = (body: Body) => post<EquipmentPayload>('/body', { body })
export const searchUsers = (query: string) => get<Person[]>(`/users?q=${encodeURIComponent(query)}`)

export const moveIssue = (key: string, lane: IssueRow['lane']) =>
  post<{ key: string; lane: IssueRow['lane']; status: string }>(
    `/issues/${encodeURIComponent(key)}/lane`,
    { lane },
  )

export const moveIssueToWeek = (key: string, week: string | null) =>
  post<{ key: string; week: string | null }>(`/issues/${encodeURIComponent(key)}/week`, { week })
