import {
  bySeries,
  chainReward,
  coinsFor,
  countComplete,
  difficultyOf,
  experienceOf,
  levelOf,
  stateOf,
} from '../../shared/questlog/quest.js'
import type { PagePayload, Quest } from '../../shared/questlog/types.js'
import type { JiraConfig, PageConfig } from './config.js'

export interface JiraCredentials {
  token: string
  email: string | null
}

export interface JiraDeps {
  fetch: typeof fetch
}

export type Flavor = 'server' | 'cloud'

export function authHeader(credentials: JiraCredentials, flavor: Flavor): string {
  if (flavor === 'cloud') {
    const basic = Buffer.from(`${credentials.email ?? ''}:${credentials.token}`).toString('base64')
    return `Basic ${basic}`
  }
  return `Bearer ${credentials.token}`
}

export const apiPath = (flavor: Flavor) => (flavor === 'cloud' ? '3' : '2')

export async function detectFlavor(config: JiraConfig, deps: JiraDeps): Promise<Flavor> {
  if (config.flavor !== 'auto') return config.flavor
  const response = await deps.fetch(`${config.baseUrl}/rest/api/2/serverInfo`, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) return 'cloud'
  const info = (await response.json()) as { deploymentType?: string }
  return info.deploymentType === 'Cloud' ? 'cloud' : 'server'
}

/**
 * Data Center hands the description out as wiki markup, Cloud as an ADF tree.
 * Both end up as plain paragraphs — the parchment has no room for rich text.
 */
export function plainText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const node = value as { type?: string; text?: string; content?: unknown[] }
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  const inner = (node.content ?? []).map(plainText).join('')
  return ['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'].includes(node.type ?? '')
    ? `${inner}\n\n`
    : inner
}

const WIKI_NOISE = [
  [/\{code(:[^}]*)?}/g, ''],
  [/\{noformat}/g, ''],
  [/\{quote}/g, ''],
  [/\{color(:[^}]*)?}/g, ''],
  [/\[([^|\]]+)\|[^\]]+]/g, '$1'],
  [/[*_]{1,2}([^*_\n]+)[*_]{1,2}/g, '$1'],
  [/^h[1-6]\.\s*/gm, ''],
] as const

export function readable(raw: unknown): string {
  const text = WIKI_NOISE.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    plainText(raw),
  )
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * The right page wants an objective line first and the body below it, like the
 * game. Jira has no objective, so the opening paragraph becomes one.
 */
export function splitObjective(text: string, fallback: string): { objective: string; body: string } {
  const paragraphs = text.split(/\n{2,}/).filter((part) => part.trim())
  if (paragraphs.length === 0) return { objective: fallback, body: '' }
  return { objective: paragraphs[0]!.trim(), body: paragraphs.slice(1).join('\n\n').trim() }
}

export interface JiraField {
  id: string
  name: string
}

function byName(fields: readonly JiraField[], wanted: readonly string[]): string | null {
  const match = fields.find((field) => wanted.includes(field.name.trim().toLowerCase()))
  return match?.id ?? null
}

export function pickStoryPointsField(fields: readonly JiraField[]): string | null {
  return byName(fields, ['story point estimate', 'story points', 'storypoints', 'story punkte'])
}

/*
 * Data Center hangs a story's epic on a custom field called "Epic Link", not on
 * parent - there, parent only ever holds the parent of a sub-task. Without this
 * every story looks orphaned and the whole book collapses into one nameless
 * heap, which is exactly what it did.
 */
export function pickEpicLinkField(fields: readonly JiraField[]): string | null {
  // German instances call it "Epic-Verknuepfung"; the field name follows the
  // Jira language, not the API.
  return byName(fields, [
    'epic link',
    'epic-link',
    'epiclink',
    'epic-verknüpfung',
    'epic verknüpfung',
    'epos-verknüpfung',
    'epos verknüpfung',
  ])
}

/** The epic's own title; its summary is the fallback. */
export function pickEpicNameField(fields: readonly JiraField[]): string | null {
  return byName(fields, ['epic name', 'epic-name', 'epicname', 'epos-name', 'epic-name'])
}

export interface FieldIds {
  points: string | null
  epicLink: string | null
  epicName: string | null
}

export interface BoardConfiguration {
  estimation?: { type?: string; field?: { fieldId?: string } }
}

export function estimationField(configuration: BoardConfiguration): string | null {
  if (configuration.estimation?.type !== 'field') return null
  const id = configuration.estimation.field?.fieldId
  return id && id !== 'none' ? id : null
}

export interface JiraIssue {
  key: string
  fields: Record<string, any>
}

/**
 * An epic is the series header, not a row of its own. Jira Data Center names
 * the type, newer instances also carry a hierarchy level above the story.
 */
export function isSeries(issue: JiraIssue): boolean {
  const type = issue.fields?.issuetype ?? {}
  const level = Number(type.hierarchyLevel)
  return String(type.name ?? '').trim().toLowerCase() === 'epic' || (Number.isFinite(level) && level >= 1)
}

export function toQuest(
  issue: JiraIssue,
  config: JiraConfig,
  ids: FieldIds,
  baseUrl: string,
): Quest {
  const fields = issue.fields ?? {}
  const raw = ids.points ? fields[ids.points] : null
  const points = typeof raw === 'number' ? raw : null
  const level = levelOf(points)
  const state = stateOf(
    String(fields.status?.statusCategory?.key ?? ''),
    config.doneStatusCategories,
    config.doingStatusCategories,
  )
  const title = String(fields.summary ?? '')
  const { objective, body } = splitObjective(readable(fields.description), title)
  // Three ways to the epic, best first:
  //   fields.epic   the agile API resolves it and hands over key AND name
  //   parent        Cloud and team-managed projects
  //   Epic Link     Data Center's custom field, key only
  const agile = fields.epic
  const linked = ids.epicLink ? fields[ids.epicLink] : null
  const linkedKey = typeof linked === 'string' ? linked : (linked?.key ?? null)
  const parent = fields.parent
  const seriesKey = agile?.key ?? parent?.key ?? linkedKey ?? null
  const seriesName = agile?.name ?? agile?.summary ?? parent?.fields?.summary ?? null

  return {
    key: issue.key,
    title,
    project: String(fields.project?.key ?? issue.key.split('-')[0] ?? '?'),
    projectName: String(fields.project?.name ?? fields.project?.key ?? 'Ohne Projekt'),
    seriesKey: seriesKey ? String(seriesKey) : null,
    seriesName: seriesName ? String(seriesName) : null,
    level,
    difficulty: difficultyOf(points),
    state,
    points,
    priority: fields.priority?.name ? String(fields.priority.name) : null,
    issueType: fields.issuetype?.name ? String(fields.issuetype.name) : null,
    status: String(fields.status?.name ?? ''),
    assignee: fields.assignee?.displayName ? String(fields.assignee.displayName) : null,
    giver: fields.reporter?.displayName ? String(fields.reporter.displayName) : null,
    objective,
    description: body,
    labels: Array.isArray(fields.labels) ? fields.labels.map(String) : [],
    experience: experienceOf(level),
    coins: coinsFor(fields.priority?.name ?? null),
    webUrl: `${baseUrl}/browse/${issue.key}`,
  }
}

export async function call<T>(
  config: JiraConfig,
  credentials: JiraCredentials,
  flavor: Flavor,
  deps: JiraDeps,
  path: string,
): Promise<T> {
  const response = await deps.fetch(`${config.baseUrl}${path}`, {
    headers: { accept: 'application/json', authorization: authHeader(credentials, flavor) },
  })
  if (!response.ok) throw new Error(`Jira ${response.status} ${response.statusText}`)
  return (await response.json()) as T
}

async function send(
  config: JiraConfig,
  credentials: JiraCredentials,
  flavor: Flavor,
  deps: JiraDeps,
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
): Promise<Response> {
  const response = await deps.fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: authHeader(credentials, flavor),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Jira ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`)
  }
  return response
}

async function post<T>(
  config: JiraConfig,
  credentials: JiraCredentials,
  flavor: Flavor,
  deps: JiraDeps,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await send(config, credentials, flavor, deps, 'POST', path, body)
  // A transition answers 204 with an empty body; only the create call returns one.
  return (await response.json().catch(() => ({}))) as T
}

async function put(
  config: JiraConfig,
  credentials: JiraCredentials,
  flavor: Flavor,
  deps: JiraDeps,
  path: string,
  body: unknown,
): Promise<void> {
  await send(config, credentials, flavor, deps, 'PUT', path, body)
}

const BASE_FIELDS = [
  'summary',
  'description',
  'status',
  'priority',
  'issuetype',
  'assignee',
  'reporter',
  'labels',
  'parent',
  'project',
]

export function fieldList(fields: FieldIds, also: readonly string[] = []): string {
  const extra = [fields.points, fields.epicLink, fields.epicName, ...also].filter(
    (id): id is string => Boolean(id),
  )
  return [...BASE_FIELDS, ...new Set(extra)].join(',')
}

export async function resolveFields(
  config: JiraConfig,
  credentials: JiraCredentials,
  flavor: Flavor,
  deps: JiraDeps,
  boardId: number | null,
): Promise<FieldIds> {
  let points = config.storyPointsField

  if (!points && boardId != null) {
    const configuration = await call<BoardConfiguration>(
      config,
      credentials,
      flavor,
      deps,
      `/rest/agile/1.0/board/${boardId}/configuration`,
    ).catch(() => null)
    points = configuration ? estimationField(configuration) : null
  }

  // One catalogue call answers all three; asking per field would be three.
  // Not an array means some proxy answered instead of Jira - treat it as empty
  // rather than letting a page die on a field lookup.
  const answer =
    !points || !config.epicLinkField || !config.epicNameField
      ? await call<JiraField[]>(
          config,
          credentials,
          flavor,
          deps,
          `/rest/api/${apiPath(flavor)}/field`,
        ).catch(() => [])
      : []
  const catalogue = Array.isArray(answer) ? answer : []

  return {
    points: points ?? pickStoryPointsField(catalogue),
    epicLink: config.epicLinkField ?? pickEpicLinkField(catalogue),
    epicName: config.epicNameField ?? pickEpicNameField(catalogue),
  }
}

export function epicTitle(issue: JiraIssue, ids: FieldIds): string {
  // "Epic Name" is the short one the board shows; summary is the long title.
  // The list and the sheet have to agree, so both take the short one.
  const own = ids.epicName ? issue.fields?.[ids.epicName] : null
  return String(typeof own === 'string' && own.trim() ? own : (issue.fields?.summary ?? issue.key))
}

/**
 * One search for every epic on the page. It carries two loads: the titles the
 * Epic Link does not hand over, and the body the right-hand sheet prints when
 * an epic is picked. Fails silently on purpose — a series named after its key
 * still reads, an empty book does not.
 */
async function resolveEpics(
  config: JiraConfig,
  credentials: JiraCredentials,
  flavor: Flavor,
  deps: JiraDeps,
  ids: FieldIds,
  keys: readonly string[],
): Promise<Map<string, Quest>> {
  if (keys.length === 0) return new Map()

  const jql = `key in (${keys.join(',')})`
  const found = await call<{ issues: JiraIssue[] }>(
    config,
    credentials,
    flavor,
    deps,
    `/rest/api/${apiPath(flavor)}/search?maxResults=${keys.length}&fields=${fieldList(ids)}&jql=${encodeURIComponent(jql)}`,
  ).catch(() => null)

  const epics = new Map<string, Quest>()
  for (const issue of found?.issues ?? []) {
    // The title is swapped in before the conversion, so it also becomes the
    // fallback objective of an epic that carries no description.
    const titled = { ...issue, fields: { ...issue.fields, summary: epicTitle(issue, ids) } }
    epics.set(issue.key, toQuest(titled, config, ids, config.baseUrl))
  }
  return epics
}

export async function fetchPage(
  config: JiraConfig,
  page: PageConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
): Promise<PagePayload> {
  const flavor = await detectFlavor(config, deps)
  const version = apiPath(flavor)
  const ids = await resolveFields(config, credentials, flavor, deps, page.boardId)
  const fields = fieldList(ids)

  let issues: JiraIssue[] = []
  let chapter = page.title
  let jql = page.jql ?? ''

  if (page.jql) {
    const result = await call<{ issues: JiraIssue[] }>(
      config,
      credentials,
      flavor,
      deps,
      `/rest/api/${version}/search?maxResults=${config.maxQuests}&fields=${fields}&jql=${encodeURIComponent(page.jql)}`,
    )
    issues = result.issues ?? []
  } else if (page.boardId != null) {
    const sprints = await call<{ values: { id: number; name: string }[] }>(
      config,
      credentials,
      flavor,
      deps,
      `/rest/agile/1.0/board/${page.boardId}/sprint?state=active`,
    )
    const active = sprints.values?.[0]
    if (!active) throw new Error(`Jira: no running sprint on board ${page.boardId}`)
    chapter = active.name
    jql = `sprint = ${active.id}`
    const result = await call<{ issues: JiraIssue[] }>(
      config,
      credentials,
      flavor,
      deps,
      `/rest/agile/1.0/sprint/${active.id}/issue?maxResults=${config.maxQuests}&fields=${fieldList(ids, ['epic'])}`,
    )
    issues = result.issues ?? []
  } else {
    throw new Error(`Questlog: page "${page.title}" has neither boardId nor jql`)
  }

  // Epics drop out here: they head the series their stories hang under. An epic
  // whose stories are all outside this page therefore shows up nowhere.
  const quests = issues
    .filter((issue) => !isSeries(issue))
    .map((issue) => toQuest(issue, config, ids, config.baseUrl))

  const epicKeys = [
    ...new Set(quests.map((quest) => quest.seriesKey).filter((key) => key != null)),
  ]
  const epics = await resolveEpics(config, credentials, flavor, deps, ids, epicKeys)

  const named = quests.map((quest) =>
    quest.seriesKey && !quest.seriesName
      ? { ...quest, seriesName: epics.get(quest.seriesKey)?.title ?? quest.seriesKey }
      : quest,
  )
  const series = bySeries(named, config.baseUrl).map((entry) => {
    const epic = epics.get(entry.key)
    return { ...entry, epic: epic ? chainReward(epic, entry.quests) : null }
  })
  const counted = countComplete(series)

  return {
    page: { id: page.id, title: page.title, canCreate: page.create != null },
    jql,
    chapter,
    series,
    total: counted.total,
    complete: counted.complete,
    rewards: {},
  }
}

export function isIssueKey(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(value)
}

export interface Transition {
  id: string
  name: string
  to?: { name?: string; statusCategory?: { key?: string } }
}

/**
 * A lane holds a whole status category, so several transitions can fit. The
 * first one into the wanted category wins; nothing else is a safe guess.
 */
export function pickTransition(
  transitions: readonly Transition[],
  wanted: readonly string[],
): Transition | null {
  return (
    transitions.find((transition) =>
      wanted.includes(String(transition.to?.statusCategory?.key ?? '')),
    ) ?? null
  )
}

async function transitionsOf(
  config: JiraConfig,
  credentials: JiraCredentials,
  flavor: Flavor,
  deps: JiraDeps,
  key: string,
): Promise<Transition[]> {
  const available = await call<{ transitions: Transition[] }>(
    config,
    credentials,
    flavor,
    deps,
    `/rest/api/${apiPath(flavor)}/issue/${key}/transitions`,
  )
  return available.transitions ?? []
}

interface JiraUser {
  name?: string
  accountId?: string
  displayName?: string
}

export interface JiraActor {
  name?: string
  accountId?: string
  displayName?: string
}

const asUser = (flavor: Flavor, actor: JiraActor) =>
  flavor === 'cloud' ? { accountId: actor.accountId } : { name: actor.name }

async function actorOrSelf(
  config: JiraConfig,
  credentials: JiraCredentials,
  flavor: Flavor,
  deps: JiraDeps,
  actor: JiraActor | undefined,
): Promise<JiraActor> {
  return actor ?? (await call<JiraUser>(config, credentials, flavor, deps, `/rest/api/${apiPath(flavor)}/myself`))
}

export async function acceptQuest(
  config: JiraConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
  key: string,
  actor?: JiraActor,
): Promise<{ key: string; status: string | null; assignee: string }> {
  if (!isIssueKey(key)) throw new Error(`Not a Jira issue key: ${key}`)
  const flavor = await detectFlavor(config, deps)
  const version = apiPath(flavor)

  const me = await actorOrSelf(config, credentials, flavor, deps, actor)
  await put(config, credentials, flavor, deps, `/rest/api/${version}/issue/${key}/assignee`, asUser(flavor, me))

  const available = await transitionsOf(config, credentials, flavor, deps, key)
  const picked = pickTransition(available, config.doingStatusCategories)

  // Already running, or a workflow that forbids the step: the quest is taken
  // either way, so this is not worth failing the click over.
  if (picked) {
    await post(config, credentials, flavor, deps, `/rest/api/${version}/issue/${key}/transitions`, {
      transition: { id: picked.id },
    })
  }

  return {
    key,
    status: picked?.to?.name ?? picked?.name ?? null,
    assignee: me.displayName ?? me.name ?? 'dir',
  }
}

/**
 * Handing a quest in moves it into the done category and nothing else - the
 * assignee stays whoever took it. Unlike accepting, a missing transition fails
 * the call: the quest is not done, and a silent no-op would claim it is.
 */
export async function completeQuest(
  config: JiraConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
  key: string,
): Promise<{ key: string; status: string }> {
  if (!isIssueKey(key)) throw new Error(`Not a Jira issue key: ${key}`)
  const flavor = await detectFlavor(config, deps)
  const version = apiPath(flavor)

  const available = await transitionsOf(config, credentials, flavor, deps, key)
  const picked = pickTransition(available, config.doneStatusCategories)
  if (!picked) throw noTransition(key, 'a done', available)

  await post(config, credentials, flavor, deps, `/rest/api/${version}/issue/${key}/transitions`, {
    transition: { id: picked.id },
  })

  return { key, status: picked.to?.name ?? picked.name }
}

function noTransition(key: string, target: string, available: readonly Transition[]): Error {
  const offered = available.map((transition) => transition.name).join(', ')
  return new Error(
    `${key} has no transition into ${target} status${offered ? ` — offered: ${offered}` : ''}`,
  )
}

export async function abandonQuest(
  config: JiraConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
  key: string,
  actor?: JiraActor,
): Promise<{ key: string; status: string }> {
  if (!isIssueKey(key)) throw new Error(`Not a Jira issue key: ${key}`)
  const flavor = await detectFlavor(config, deps)
  const version = apiPath(flavor)

  const [me, issue] = await Promise.all([
    actorOrSelf(config, credentials, flavor, deps, actor),
    call<{ fields?: { assignee?: JiraUser | null } }>(
      config,
      credentials,
      flavor,
      deps,
      `/rest/api/${version}/issue/${key}?fields=assignee`,
    ),
  ])
  const holder = issue.fields?.assignee
  const mine = flavor === 'cloud' ? holder?.accountId === me.accountId : holder?.name === me.name
  if (holder && !mine) {
    throw new Error(`${key} belongs to ${holder.displayName ?? holder.name ?? 'someone else'}, not to you`)
  }

  const available = await transitionsOf(config, credentials, flavor, deps, key)
  const picked = pickTransition(available, config.openStatusCategories)
  if (!picked) throw noTransition(key, 'an open', available)

  await post(config, credentials, flavor, deps, `/rest/api/${version}/issue/${key}/transitions`, {
    transition: { id: picked.id },
  })
  const nobody = flavor === 'cloud' ? { accountId: null } : { name: null }
  await put(config, credentials, flavor, deps, `/rest/api/${version}/issue/${key}/assignee`, nobody)

  return { key, status: picked.to?.name ?? picked.name }
}

export interface NewQuest {
  title: string
  description: string
  points: number | null
  priority: string | null
}

export function validateNewQuest(input: Partial<NewQuest>): NewQuest {
  const title = String(input.title ?? '').trim()
  if (!title) throw new Error('Nobody hands out a quest without a title')
  if (title.length > 255) throw new Error('The title is longer than Jira allows (255 characters)')
  const points = input.points == null ? null : Number(input.points)
  if (points != null && (!Number.isFinite(points) || points < 0)) {
    throw new Error('The estimate needs a number from 0 upwards')
  }
  return {
    title,
    description: String(input.description ?? '').trim(),
    points,
    priority: input.priority ? String(input.priority) : null,
  }
}

export function createBody(
  page: PageConfig,
  quest: NewQuest,
  pointsField: string | null,
  flavor: Flavor,
  reporter?: JiraActor,
): Record<string, unknown> {
  const create = page.create!
  const fields: Record<string, unknown> = {
    project: { key: create.project },
    issuetype: { name: create.issueType },
    summary: quest.title,
  }
  if (create.labels.length > 0) fields.labels = create.labels
  if (reporter) fields.reporter = asUser(flavor, reporter)
  if (quest.priority) fields.priority = { name: quest.priority }
  if (pointsField && quest.points != null) fields[pointsField] = quest.points
  if (quest.description) {
    fields.description =
      flavor === 'cloud'
        ? {
            type: 'doc',
            version: 1,
            content: quest.description.split(/\n{2,}/).map((paragraph) => ({
              type: 'paragraph',
              content: [{ type: 'text', text: paragraph }],
            })),
          }
        : quest.description
  }
  return { fields }
}

export async function createQuest(
  config: JiraConfig,
  page: PageConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
  input: Partial<NewQuest>,
  reporter?: JiraActor,
): Promise<{ key: string; webUrl: string }> {
  if (!page.create) throw new Error(`The page "${page.title}" hands out no quests`)
  const quest = validateNewQuest(input)
  const flavor = await detectFlavor(config, deps)
  const { points } = await resolveFields(config, credentials, flavor, deps, page.boardId)

  const created = await post<{ key: string }>(
    config,
    credentials,
    flavor,
    deps,
    `/rest/api/${apiPath(flavor)}/issue`,
    createBody(page, quest, points, flavor, reporter),
  )
  return { key: created.key, webUrl: `${config.baseUrl}/browse/${created.key}` }
}
