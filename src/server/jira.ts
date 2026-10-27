import { workdaysBetween } from '../shared/season.js'
import type { EpicRow, EpicsPayload, IssueRow, SprintInfo } from '../shared/types.js'
import type { JiraConfig } from './config.js'

export interface JiraCredentials {
  token: string
  email: string | null
}

export interface JiraDeps {
  fetch: typeof fetch
  now: () => Date
  log?: (message: string) => void
}

export function authHeader(credentials: JiraCredentials, flavor: 'server' | 'cloud'): string {
  if (flavor === 'cloud') {
    const basic = Buffer.from(`${credentials.email ?? ''}:${credentials.token}`).toString('base64')
    return `Basic ${basic}`
  }
  return `Bearer ${credentials.token}`
}

export const apiPath = (flavor: 'server' | 'cloud') => (flavor === 'cloud' ? '3' : '2')

export function initialsOf(name: string | null): string {
  if (!name) return '?'
  return name
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .slice(0, 2)
    .join('')
}

export function laneOf(
  categoryKey: string,
  config: Pick<JiraConfig, 'doneStatusCategories' | 'doingStatusCategories'>,
): IssueRow['lane'] {
  if (config.doneStatusCategories.includes(categoryKey)) return 'done'
  if (config.doingStatusCategories.includes(categoryKey)) return 'doing'
  return 'todo'
}

export function pickStoryPointsField(
  fields: readonly { id: string; name: string }[],
): string | null {
  const wanted = ['story point estimate', 'story points', 'storypoints']
  const match = fields.find((field) => wanted.includes(field.name.toLowerCase()))
  return match?.id ?? null
}

export interface BoardConfiguration {
  estimation?: { type?: string; field?: { fieldId?: string } }
}

export function estimationField(configuration: BoardConfiguration): string | null {
  if (configuration.estimation?.type !== 'field') return null
  const id = configuration.estimation.field?.fieldId
  return id && id !== 'none' ? id : null
}

export function weekOf(
  components: readonly { name?: string }[] | undefined,
  wanted: readonly string[],
): string | null {
  const names = (components ?? []).map((component) => component.name ?? '')
  const hit = wanted.find((week) =>
    names.some((name) => name.trim().toLowerCase() === week.trim().toLowerCase()),
  )
  return hit ?? null
}

interface JiraIssue {
  key: string
  fields: Record<string, any>
}

const AVATAR_SIZES = ['48x48', '32x32', '24x24', '16x16']

export function avatarUrl(
  urls: Record<string, string> | undefined,
  baseUrl: string,
): string | null {
  if (!urls) return null
  const picked = AVATAR_SIZES.map((size) => urls[size]).find(Boolean)
  if (!picked) return null
  const absolute = picked.startsWith('http') ? picked : `${baseUrl}${picked}`
  return `/api/avatar?url=${encodeURIComponent(absolute)}`
}

export function toIssueRows(
  issues: readonly JiraIssue[],
  config: JiraConfig,
  pointsField: string | null,
  baseUrl: string,
): IssueRow[] {
  return issues.map((issue) => {
    const assignee = issue.fields.assignee?.displayName ?? null
    const points = pointsField ? issue.fields[pointsField] : null
    return {
      key: issue.key,
      summary: String(issue.fields.summary ?? ''),
      assignee,
      initials: initialsOf(assignee),
      avatar: avatarUrl(issue.fields.assignee?.avatarUrls, baseUrl),
      points: typeof points === 'number' ? points : null,
      flagged: Array.isArray(issue.fields.flagged) ? issue.fields.flagged.length > 0 : false,
      lane: laneOf(String(issue.fields.status?.statusCategory?.key ?? ''), config),
      week: weekOf(issue.fields.components, config.weekComponents),
      webUrl: `${baseUrl}/browse/${issue.key}`,
    }
  })
}

export function summarise(
  rows: readonly IssueRow[],
  sprintName: string,
  startDate: string | null,
  endDate: string | null,
  pointsField: string | null,
  now: Date,
): SprintInfo {
  const sum = (lane: IssueRow['lane']) =>
    rows.filter((row) => row.lane === lane).reduce((total, row) => total + (row.points ?? 0), 0)

  return {
    name: sprintName,
    startDate,
    endDate,
    pointsField,
    workdaysLeft: endDate ? workdaysBetween(now, new Date(endDate)) : null,
    workdaysTotal:
      startDate && endDate ? workdaysBetween(new Date(startDate), new Date(endDate)) : null,
    points: { done: sum('done'), doing: sum('doing'), open: sum('todo') },
  }
}

export async function call<T>(
  config: JiraConfig,
  credentials: JiraCredentials,
  flavor: 'server' | 'cloud',
  deps: JiraDeps,
  path: string,
): Promise<T> {
  const response = await deps.fetch(`${config.baseUrl}${path}`, {
    headers: { accept: 'application/json', authorization: authHeader(credentials, flavor) },
  })
  if (!response.ok) throw new Error(`Jira ${response.status} ${response.statusText}`)
  return (await response.json()) as T
}

async function post(
  config: JiraConfig,
  credentials: JiraCredentials,
  flavor: 'server' | 'cloud',
  deps: JiraDeps,
  path: string,
  body: unknown,
): Promise<void> {
  const response = await deps.fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: authHeader(credentials, flavor),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Jira ${response.status} ${response.statusText}`)
}

export function isIssueKey(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(value)
}

export function isLane(value: unknown): value is IssueRow['lane'] {
  return value === 'todo' || value === 'doing' || value === 'done'
}

export interface Transition {
  id: string
  name: string
  to?: { name?: string; statusCategory?: { key?: string } }
}

type LaneConfig = Pick<
  JiraConfig,
  'doneStatusCategories' | 'doingStatusCategories' | 'laneStatus'
>

/**
 * A lane holds a whole status category, so several transitions can fit. The
 * configured status names win; without them the first matching one is taken.
 */
export function pickTransition(
  transitions: readonly Transition[],
  lane: IssueRow['lane'],
  config: LaneConfig,
): Transition | null {
  const normalise = (value: string) => value.trim().toLowerCase()
  const wanted = config.laneStatus[lane].map(normalise)

  for (const name of wanted) {
    const named = transitions.find((transition) => normalise(transition.to?.name ?? '') === name)
    if (named) return named
  }

  return (
    transitions.find((transition) => {
      const category = transition.to?.statusCategory?.key
      return Boolean(category) && laneOf(String(category), config) === lane
    }) ?? null
  )
}

export async function moveIssue(
  config: JiraConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
  key: string,
  lane: IssueRow['lane'],
): Promise<{ key: string; lane: IssueRow['lane']; status: string }> {
  const flavor = await detectFlavor(config, credentials, deps)
  const version = apiPath(flavor)

  const available = await call<{ transitions: Transition[] }>(
    config,
    credentials,
    flavor,
    deps,
    `/rest/api/${version}/issue/${key}/transitions`,
  )
  const transitions = available.transitions ?? []
  const picked = pickTransition(transitions, lane, config)

  if (!picked) {
    const offered = transitions.map((transition) => transition.to?.name ?? transition.name)
    throw new Error(
      `Jira: ${key} kennt keinen Übergang in diese Spalte` +
        (offered.length > 0 ? ` — möglich wäre: ${offered.join(', ')}` : ''),
    )
  }

  await post(config, credentials, flavor, deps, `/rest/api/${version}/issue/${key}/transitions`, {
    transition: { id: picked.id },
  })

  return { key, lane, status: picked.to?.name ?? picked.name }
}

export function sameOrigin(candidate: string, baseUrl: string): boolean {
  try {
    return new URL(candidate).origin === new URL(baseUrl).origin
  } catch {
    return false
  }
}

export async function fetchAvatar(
  url: string,
  config: JiraConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
): Promise<{ body: ArrayBuffer; contentType: string }> {
  if (!sameOrigin(url, config.baseUrl)) {
    throw new Error('Avatar: Adresse gehört nicht zur konfigurierten Jira-Instanz')
  }
  const flavor = config.flavor === 'auto' ? 'server' : config.flavor
  const response = await deps.fetch(url, {
    headers: { authorization: authHeader(credentials, flavor) },
  })
  if (!response.ok) throw new Error(`Avatar: ${response.status} ${response.statusText}`)
  return {
    body: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') ?? 'image/png',
  }
}

export interface JiraUser {
  name?: string
  displayName?: string
  emailAddress?: string
  avatarUrls?: Record<string, string>
}

export function userSearchPath(flavor: 'server' | 'cloud', query: string): string {
  const param = flavor === 'cloud' ? 'query' : 'username'
  return `/rest/api/${apiPath(flavor)}/user/search?${param}=${encodeURIComponent(query)}&maxResults=10`
}

const normalise = (value: string | undefined) => (value ?? '').trim().toLowerCase()

/**
 * Only an exact or an unambiguous hit counts — a wrong face in the daily goes
 * unnoticed, a circle with initials does not.
 */
export function pickUser(users: readonly JiraUser[], query: string): JiraUser | null {
  const wanted = normalise(query)
  const exact = users.filter((user) =>
    [user.name, user.displayName, user.emailAddress].some((value) => normalise(value) === wanted),
  )
  if (exact.length === 1) return exact[0]!
  return users.length === 1 ? users[0]! : null
}

/**
 * Jira hides mail addresses depending on the instance's privacy setting, so the
 * address alone finds nobody there. The local part usually is the username.
 */
export function queriesFor(member: { name: string; email: string | null }): string[] {
  const candidates = member.email
    ? [member.email, member.email.split('@')[0] ?? '', member.name]
    : [member.name]
  return [...new Set(candidates.map((value) => value.trim()).filter(Boolean))]
}

export async function fetchTeamAvatars(
  config: JiraConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
  members: readonly { name: string; email: string | null }[],
): Promise<Record<string, string | null>> {
  const flavor = await detectFlavor(config, credentials, deps)

  const entries = await Promise.all(
    members.map(async (member) => {
      const tried: string[] = []

      for (const query of queriesFor(member)) {
        const users = await call<JiraUser[]>(
          config,
          credentials,
          flavor,
          deps,
          userSearchPath(flavor, query),
        ).catch(() => [])
        tried.push(`${query} → ${users.length}`)
        const avatar = avatarUrl(pickUser(users, query)?.avatarUrls, config.baseUrl)
        if (avatar) return [member.name, avatar] as const
      }

      deps.log?.(`Jira: kein Profilbild für ${member.name} (${tried.join(', ')})`)
      return [member.name, null] as const
    }),
  )

  return Object.fromEntries(entries)
}

export function toEpicRows(
  issues: readonly JiraIssue[],
  config: JiraConfig,
  limit: number,
): EpicRow[] {
  return issues.slice(0, limit).map((issue) => ({
    key: issue.key,
    summary: String(
      issue.fields.customfield_10005 ?? issue.fields.epicName ?? issue.fields.summary ?? '',
    ),
    status: String(issue.fields.status?.name ?? ''),
    lane: laneOf(String(issue.fields.status?.statusCategory?.key ?? ''), config),
    colour: null,
    webUrl: `${config.baseUrl}/browse/${issue.key}`,
  }))
}

const CATEGORY_JQL: Record<string, string> = {
  new: 'To Do',
  indeterminate: 'In Progress',
  done: 'Done',
}

/**
 * The board's own filter plus a status condition. The agile /epic endpoint only
 * knows done/not done, so "in Progress" has to come from JQL.
 */
export function epicsJqlFor(filterId: number | string, categories: readonly string[]): string {
  const names = categories
    .map((key) => CATEGORY_JQL[key])
    .filter(Boolean)
    .map((name) => `"${name}"`)

  const status = names.length > 0 ? ` AND statusCategory in (${names.join(', ')})` : ''
  return `filter = ${filterId} AND issuetype = Epic${status} ORDER BY rank`
}

export async function fetchEpics(
  config: JiraConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
): Promise<EpicsPayload> {
  const flavor = await detectFlavor(config, credentials, deps)
  const version = apiPath(flavor)

  let jql = config.epicsJql

  if (!jql && config.epicsBoardId != null) {
    const configuration = await call<{ filter?: { id?: string | number } }>(
      config,
      credentials,
      flavor,
      deps,
      `/rest/agile/1.0/board/${config.epicsBoardId}/configuration`,
    )
    const filterId = configuration.filter?.id
    if (filterId == null) throw new Error('Jira: Board hat keinen Filter, den wir lesen können')
    jql = epicsJqlFor(filterId, config.epicsStatusCategories)
  }

  if (!jql) throw new Error('Jira: weder epicsBoardId noch epicsJql konfiguriert')

  const result = await call<{ issues: JiraIssue[] }>(
    config,
    credentials,
    flavor,
    deps,
    `/rest/api/${version}/search?maxResults=${config.epicsLimit}&jql=${encodeURIComponent(jql)}`,
  )
  return { jql, rows: toEpicRows(result.issues, config, config.epicsLimit) }
}

export async function detectFlavor(
  config: JiraConfig,
  _credentials: JiraCredentials,
  deps: JiraDeps,
): Promise<'server' | 'cloud'> {
  if (config.flavor !== 'auto') return config.flavor
  const response = await deps.fetch(`${config.baseUrl}/rest/api/2/serverInfo`, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) return 'cloud'
  const info = (await response.json()) as { deploymentType?: string }
  return info.deploymentType === 'Cloud' ? 'cloud' : 'server'
}

export interface ActiveSprint {
  id: number
  name: string
  startDate?: string
  endDate?: string
}

export async function fetchActiveSprint(
  config: JiraConfig,
  credentials: JiraCredentials,
  flavor: 'server' | 'cloud',
  deps: JiraDeps,
): Promise<ActiveSprint> {
  const sprints = await call<{ values: ActiveSprint[] }>(
    config,
    credentials,
    flavor,
    deps,
    `/rest/agile/1.0/board/${config.boardId}/sprint?state=active`,
  )
  const active = sprints.values?.[0]
  if (!active) throw new Error('Jira: kein aktiver Sprint auf diesem Board')
  return active
}

export async function fetchSprint(
  config: JiraConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
): Promise<{ sprint: SprintInfo; issues: IssueRow[] }> {
  const flavor = await detectFlavor(config, credentials, deps)
  const version = apiPath(flavor)

  let pointsField = config.storyPointsField

  if (!pointsField && config.boardId != null) {
    const configuration = await call<BoardConfiguration>(
      config,
      credentials,
      flavor,
      deps,
      `/rest/agile/1.0/board/${config.boardId}/configuration`,
    )
    pointsField = estimationField(configuration)
  }

  if (!pointsField) {
    const fields = await call<{ id: string; name: string }[]>(
      config,
      credentials,
      flavor,
      deps,
      `/rest/api/${version}/field`,
    )
    pointsField = pickStoryPointsField(fields)
  }

  let sprintName = 'Sprint'
  let startDate: string | null = null
  let endDate: string | null = null
  let issues: JiraIssue[] = []

  if (config.boardId != null) {
    const active = await fetchActiveSprint(config, credentials, flavor, deps)
    sprintName = active.name
    startDate = active.startDate ?? null
    endDate = active.endDate ?? null
    const result = await call<{ issues: JiraIssue[] }>(
      config,
      credentials,
      flavor,
      deps,
      `/rest/agile/1.0/sprint/${active.id}/issue?maxResults=100&fields=*navigable`,
    )
    issues = result.issues
  } else if (config.jql) {
    const result = await call<{ issues: JiraIssue[] }>(
      config,
      credentials,
      flavor,
      deps,
      `/rest/api/${version}/search?maxResults=100&jql=${encodeURIComponent(config.jql)}`,
    )
    issues = result.issues
  } else {
    throw new Error('Jira: weder boardId noch jql konfiguriert')
  }

  const rows = toIssueRows(issues, config, pointsField, config.baseUrl)
  return {
    sprint: summarise(rows, sprintName, startDate, endDate, pointsField, deps.now()),
    issues: rows,
  }
}
