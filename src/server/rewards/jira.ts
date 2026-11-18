import type { Quest } from '../../shared/questlog/types.js'
import type { Person } from '../../shared/rewards.js'
import { avatarUrl } from '../jira.js'
import type { JiraConfig } from '../questlog/config.js'
import {
  apiPath,
  call,
  detectFlavor,
  fieldList,
  isSeries,
  type JiraCredentials,
  type JiraDeps,
  type JiraIssue,
  resolveFields,
  toQuest,
} from '../questlog/jira.js'
import {
  assigneeChanges,
  type ChangelogHistory,
  contributors,
  type JiraUserRef,
  personOf,
} from './contributors.js'
import { toCopper } from '../../shared/rewards.js'
import type { LegacyQuest, QuestRecord } from './store.js'

export const LEGACY_PAGE = 100
export const LEGACY_LIMIT = 1000
export const USER_LIMIT = 10

export interface Me extends Person {
  avatar: string | null
}

export async function fetchMe(config: JiraConfig, credentials: JiraCredentials, deps: JiraDeps): Promise<Me> {
  const flavor = await detectFlavor(config, deps)
  const user = await call<JiraUserRef & { avatarUrls?: Record<string, string> }>(
    config,
    credentials,
    flavor,
    deps,
    `/rest/api/${apiPath(flavor)}/myself`,
  )
  const person = personOf(user)
  if (!person) throw new Error('Jira: kein Benutzer hinter dem Token')
  return { ...person, avatar: avatarUrl(user.avatarUrls, config.baseUrl) }
}

const jqlDate = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function legacyJql(config: Pick<JiraConfig, 'doneStatusCategories'>, cutoff: Date): string {
  return `assignee = currentUser() AND statusCategory in (${config.doneStatusCategories.join(', ')}) AND resolutiondate < "${jqlDate(cutoff)}" ORDER BY resolutiondate DESC`
}

export function legacyOf(quest: Quest, resolved: string | null): LegacyQuest {
  return {
    key: quest.key,
    title: quest.title,
    webUrl: quest.webUrl,
    difficulty: quest.difficulty,
    experience: quest.experience,
    copper: toCopper(quest.coins),
    completedAt: new Date(resolved ?? 0),
  }
}

export async function fetchLegacy(
  config: JiraConfig,
  boardId: number | null,
  credentials: JiraCredentials,
  deps: JiraDeps,
  cutoff: Date,
): Promise<LegacyQuest[]> {
  const flavor = await detectFlavor(config, deps)
  const version = apiPath(flavor)
  const ids = await resolveFields(config, credentials, flavor, deps, boardId)
  const fields = fieldList(ids, ['resolutiondate'])
  const jql = encodeURIComponent(legacyJql(config, cutoff))

  const issues: JiraIssue[] = []
  for (let startAt = 0; startAt < LEGACY_LIMIT; startAt += LEGACY_PAGE) {
    const page = await call<{ issues?: JiraIssue[]; total?: number }>(
      config,
      credentials,
      flavor,
      deps,
      `/rest/api/${version}/search?startAt=${startAt}&maxResults=${LEGACY_PAGE}&fields=${fields}&jql=${jql}`,
    )
    const found = page.issues ?? []
    issues.push(...found)
    if (found.length < LEGACY_PAGE || issues.length >= (page.total ?? 0)) break
  }

  return issues
    .filter((issue) => !isSeries(issue))
    .map((issue) =>
      legacyOf(
        toQuest(issue, config, ids, config.baseUrl),
        typeof issue.fields?.resolutiondate === 'string' ? issue.fields.resolutiondate : null,
      ),
    )
}

interface IssueWithChangelog {
  key: string
  fields?: {
    created?: string
    resolutiondate?: string | null
    assignee?: JiraUserRef | null
    reporter?: JiraUserRef | null
  }
  changelog?: { histories?: ChangelogHistory[] }
}

export async function fetchQuestRecord(
  config: JiraConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
  quest: Quest,
  dueAt: Date,
  now: Date,
): Promise<QuestRecord> {
  const flavor = await detectFlavor(config, deps)
  const issue = await call<IssueWithChangelog>(
    config,
    credentials,
    flavor,
    deps,
    `/rest/api/${apiPath(flavor)}/issue/${encodeURIComponent(quest.key)}?expand=changelog&fields=created,resolutiondate,assignee,reporter`,
  )
  const resolved = issue.fields?.resolutiondate ?? now.toISOString()
  const created = issue.fields?.created ?? resolved
  return {
    key: quest.key,
    title: quest.title,
    webUrl: quest.webUrl,
    difficulty: quest.difficulty,
    experience: quest.experience,
    copper: toCopper(quest.coins),
    giver: personOf(issue.fields?.reporter),
    completedAt: new Date(resolved),
    dueAt,
    shares: contributors(
      created,
      resolved,
      personOf(issue.fields?.assignee),
      assigneeChanges(issue.changelog?.histories ?? []),
    ),
  }
}

export async function searchUsers(
  config: JiraConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
  query: string,
): Promise<Person[]> {
  const text = query.trim()
  if (text.length < 2) return []
  const flavor = await detectFlavor(config, deps)
  const param = flavor === 'cloud' ? 'query' : 'username'
  const users = await call<(JiraUserRef & { active?: boolean })[]>(
    config,
    credentials,
    flavor,
    deps,
    `/rest/api/${apiPath(flavor)}/user/search?${param}=${encodeURIComponent(text)}&maxResults=${USER_LIMIT}`,
  )
  return (Array.isArray(users) ? users : [])
    .filter((user) => user.active !== false)
    .map(personOf)
    .filter((person): person is Person => person != null)
}
