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

export const cutoffOf = (now: Date, hours: number) =>
  new Date(now.getTime() - hours * 3_600_000)

export function sinceOf(now: Date, hours: number): string {
  const cutoff = cutoffOf(now, hours)
  const day = new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate() - 1)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

export function eventsInWindow(events: readonly PushEvent[], cutoff: Date): PushEvent[] {
  return events.filter((event) => {
    if (!event.push_data?.commit_title) return false
    return Date.parse(event.created_at) >= cutoff.getTime()
  })
}

export function toCommitRows(
  events: readonly PushEvent[],
  projectNames: ReadonlyMap<number, string>,
  limit: number,
): CommitRow[] {
  const groups = new Map<number, CommitRow>()

  for (const event of events) {
    const title = event.push_data?.commit_title
    if (!title) continue

    const id = event.project_id ?? -1
    const previous = groups.get(id)
    const count = (previous?.count ?? 0) + (event.push_data?.commit_count ?? 1)

    if (previous && Date.parse(previous.at) >= Date.parse(event.created_at)) {
      groups.set(id, { ...previous, count })
      continue
    }

    groups.set(id, {
      title: String(title),
      project: projectNames.get(id) ?? '—',
      ref: event.push_data?.ref ?? null,
      count,
      at: event.created_at,
    })
  }

  return [...groups.values()]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
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

export function missingProjectIds(
  events: readonly PushEvent[],
  known: ReadonlyMap<number, string>,
): number[] {
  const ids = events
    .filter((event) => Boolean(event.push_data?.commit_title))
    .map((event) => event.project_id)
    .filter((id): id is number => typeof id === 'number')
  return [...new Set(ids)].filter((id) => !known.has(id))
}

async function resolveProjects(
  config: GitlabConfig,
  token: string,
  deps: GitlabDeps,
  ids: readonly number[],
): Promise<[number, string][]> {
  const found = await Promise.all(
    ids.map((id) =>
      rest<{ name?: string }>(config, token, deps, `/projects/${id}`)
        .then((project) => (project.name ? ([id, project.name] as [number, string]) : null))
        .catch(() => null),
    ),
  )
  return found.filter((entry): entry is [number, string] => entry !== null)
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
  hours: number,
  limit: number,
): Promise<Record<string, CommitRow[]>> {
  const now = deps.now()
  const cutoff = cutoffOf(now, hours)
  const since = sinceOf(now, hours)
  const projects = await rest<{ id: number; name: string }[]>(
    config,
    token,
    deps,
    `/projects?membership=true&simple=true&per_page=100`,
  ).catch(() => [])
  const names = new Map(projects.map((project) => [project.id, project.name]))

  const pushes = await Promise.all(
    members.map(async (member) => {
      const path = eventPath(member, since)
      if (path === null) return [member.name, [] as PushEvent[]] as const
      const events = await rest<PushEvent[]>(config, token, deps, path).catch(() => [])
      return [member.name, eventsInWindow(events, cutoff)] as const
    }),
  )

  const seen = pushes.flatMap(([, events]) => events)
  for (const [id, name] of await resolveProjects(
    config,
    token,
    deps,
    missingProjectIds(seen, names),
  )) {
    names.set(id, name)
  }

  return Object.fromEntries(
    pushes.map(([member, events]) => [member, toCommitRows(events, names, limit)]),
  )
}
