import type { CommitRow } from '../shared/types.js'
import type { GitlabConfig } from './config.js'
import type { GitlabDeps } from './gitlab.js'

export interface PushEvent {
  created_at: string
  project_id?: number
  author?: { name?: string }
  push_data?: {
    commit_count?: number
    commit_title?: string | null
    ref?: string | null
    action?: string
  }
}

export function sinceOf(now: Date, days: number): string {
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${since.getFullYear()}-${pad(since.getMonth() + 1)}-${pad(since.getDate())}`
}

export function toCommitRows(
  events: readonly PushEvent[],
  projectNames: ReadonlyMap<number, string>,
  limit: number,
): CommitRow[] {
  return events
    .filter((event) => Boolean(event.push_data?.commit_title))
    .map((event) => ({
      title: String(event.push_data!.commit_title),
      project: projectNames.get(event.project_id ?? -1) ?? '—',
      ref: event.push_data?.ref ?? null,
      count: event.push_data?.commit_count ?? 1,
      at: event.created_at,
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
}

async function rest<T>(
  config: GitlabConfig,
  token: string,
  deps: GitlabDeps,
  path: string,
): Promise<T> {
  const response = await deps.fetch(`${config.baseUrl}/api/v4${path}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`GitLab ${response.status} ${response.statusText}`)
  return (await response.json()) as T
}

export function eventPath(
  member: { gitlabUser: string | null; self: boolean },
  since: string,
): string | null {
  if (member.self) return `/events?action=pushed&after=${since}&per_page=50`
  if (member.gitlabUser) {
    return `/users/${encodeURIComponent(member.gitlabUser)}/events?action=pushed&after=${since}&per_page=50`
  }
  return null
}

export async function fetchCommits(
  config: GitlabConfig,
  token: string,
  deps: GitlabDeps,
  members: readonly { name: string; gitlabUser: string | null; self: boolean }[],
  days: number,
  limit: number,
): Promise<Record<string, CommitRow[]>> {
  const since = sinceOf(deps.now(), days)
  const projects = await rest<{ id: number; name: string }[]>(
    config,
    token,
    deps,
    `/projects?membership=true&simple=true&per_page=100`,
  ).catch(() => [])
  const names = new Map(projects.map((project) => [project.id, project.name]))

  const entries = await Promise.all(
    members.map(async (member) => {
      const path = eventPath(member, since)
      if (path === null) return [member.name, []] as const
      const events = await rest<PushEvent[]>(config, token, deps, path).catch(() => [])
      return [member.name, toCommitRows(events, names, limit)] as const
    }),
  )

  return Object.fromEntries(entries)
}
