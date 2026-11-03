import type { CommitRow, CommitsPayload } from '../shared/types.js'
import type { GitlabConfig } from './config.js'
import type { GitlabDeps } from './gitlab.js'

export interface GitlabUser {
  id: number
  username: string
  name?: string
}

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

const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6

export function lastWorkdayStart(now: Date): Date {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  do {
    day.setDate(day.getDate() - 1)
  } while (isWeekend(day))
  return day
}

export function cutoffOf(now: Date, hours: number, sinceLastWorkday = false): Date {
  const cutoff = new Date(now.getTime() - hours * 3_600_000)
  if (!sinceLastWorkday) return cutoff
  const workday = lastWorkdayStart(now)
  return cutoff.getTime() > workday.getTime() ? workday : cutoff
}

export function sinceOf(now: Date, hours: number, sinceLastWorkday = false): string {
  const cutoff = cutoffOf(now, hours, sinceLastWorkday)
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

export function asUser(value: unknown): GitlabUser | null {
  const user = value as GitlabUser | null
  return user && typeof user === 'object' && typeof user.username === 'string' ? user : null
}

export async function diagnoseEmptyFeed(
  member: { gitlabUser: string | null; self: boolean },
  owner: () => Promise<GitlabUser | null>,
  lookup: (handle: string) => Promise<GitlabUser[] | null>,
): Promise<string> {
  if (member.self) {
    const user = await owner()
    return user
      ? `der Token gehört „${user.username}", und dieser Benutzer hat nichts gepusht — bei einem Gruppen-Token ist das dessen Bot-Benutzer`
      : 'der Token-Besitzer ließ sich nicht ermitteln'
  }

  const handle = member.gitlabUser ?? ''
  const found = await lookup(handle)
  if (found === null) return `„${handle}" ließ sich bei GitLab nicht nachschlagen`
  if (found.length > 0) return `„${handle}" gibt es, liefert aber keine sichtbaren Pushes`

  const user = await owner()
  return user
    ? `GitLab kennt keinen Benutzer „${handle}" — der Token gehört „${user.username}"`
    : `GitLab kennt keinen Benutzer „${handle}"`
}

export async function fetchCommits(
  config: GitlabConfig,
  token: string,
  deps: GitlabDeps,
  members: readonly { name: string; gitlabUser: string | null; self: boolean }[],
  hours: number,
  limit: number,
  sinceLastWorkday = false,
): Promise<CommitsPayload> {
  const now = deps.now()
  const cutoff = cutoffOf(now, hours, sinceLastWorkday)
  const since = sinceOf(now, hours, sinceLastWorkday)
  const projects = await rest<{ id: number; name: string }[]>(
    config,
    token,
    deps,
    `/projects?membership=true&simple=true&per_page=100`,
  ).catch(() => [])
  const names = new Map(projects.map((project) => [project.id, project.name]))

  let ownerOnce: Promise<GitlabUser | null> | null = null
  const owner = () =>
    (ownerOnce ??= rest<unknown>(config, token, deps, '/user').then(asUser, () => null))

  const lookup = (handle: string) =>
    rest<unknown>(config, token, deps, `/users?username=${encodeURIComponent(handle)}`).then(
      (value) =>
        Array.isArray(value)
          ? value.map(asUser).filter((user): user is GitlabUser => user !== null)
          : [],
      () => null,
    )

  const pushes = await Promise.all(
    members.map(async (member) => {
      const path = eventPath(member, since)
      if (path === null) {
        deps.log?.(`GitLab: ${member.name} hat keinen gitlabUser, keine Commits geholt`)
        return [member.name, [] as PushEvent[], null] as const
      }

      const events = await rest<PushEvent[]>(config, token, deps, path).catch((error: unknown) => {
        deps.log?.(`GitLab: Commits für ${member.name} nicht lesbar (${String(error)})`)
        return [] as PushEvent[]
      })

      const inWindow = eventsInWindow(events, cutoff)
      if (events.length === 0) {
        const problem = await diagnoseEmptyFeed(member, owner, lookup)
        deps.log?.(`GitLab: keine Commits für ${member.name} — ${problem}`)
        return [member.name, inWindow, problem] as const
      }

      if (inWindow.length === 0) {
        deps.log?.(`GitLab: ${member.name} hat ${events.length} Pushes, aber keinen im Fenster`)
      }

      return [member.name, inWindow, null] as const
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

  return {
    byMember: Object.fromEntries(
      pushes.map(([member, events]) => [member, toCommitRows(events, names, limit)]),
    ),
    problems: Object.fromEntries(
      pushes
        .filter((entry): entry is readonly [string, PushEvent[], string] => entry[2] !== null)
        .map(([member, , problem]) => [member, problem]),
    ),
  }
}
