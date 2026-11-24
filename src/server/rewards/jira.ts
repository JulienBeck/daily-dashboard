import type { Quest } from '../../shared/questlog/types.js'
import type { Person } from '../../shared/rewards.js'
import { avatarUrl, userSearchPath } from '../jira.js'
import type { JiraConfig } from '../questlog/config.js'
import { apiPath, call, detectFlavor, type JiraCredentials, type JiraDeps } from '../questlog/jira.js'
import {
  assigneeChanges,
  type ChangelogHistory,
  contributors,
  type JiraUserRef,
  personOf,
} from './contributors.js'
import { toCopper } from '../../shared/rewards.js'
import type { QuestRecord } from './store.js'

export const USER_LIMIT = 10

export interface Me extends Person {
  avatar: string | null
  ref: Pick<JiraUserRef, 'name' | 'accountId'>
}

type JiraPerson = JiraUserRef & { emailAddress?: string; active?: boolean; avatarUrls?: Record<string, string> }

function meOf(user: JiraPerson, baseUrl: string): Me | null {
  const person = personOf(user)
  if (!person) return null
  const ref: Me['ref'] = {}
  if (user.name) ref.name = user.name
  if (user.accountId) ref.accountId = user.accountId
  return { ...person, avatar: avatarUrl(user.avatarUrls, baseUrl), ref }
}

export async function fetchMe(config: JiraConfig, credentials: JiraCredentials, deps: JiraDeps): Promise<Me> {
  const flavor = await detectFlavor(config, deps)
  const user = await call<JiraPerson>(config, credentials, flavor, deps, `/rest/api/${apiPath(flavor)}/myself`)
  const me = meOf(user ?? {}, config.baseUrl)
  if (!me) throw new Error('Jira: kein Benutzer hinter dem Token')
  return me
}

const lower = (value: string | undefined) => (value ?? '').trim().toLowerCase()

export async function fetchPerson(
  config: JiraConfig,
  credentials: JiraCredentials,
  deps: JiraDeps,
  email: string,
): Promise<Me> {
  const flavor = await detectFlavor(config, deps)
  const wanted = lower(email)
  const local = wanted.split('@')[0] ?? ''
  for (const query of [...new Set([email.trim(), local])].filter(Boolean)) {
    const found = await call<JiraPerson[]>(config, credentials, flavor, deps, userSearchPath(flavor, query)).catch(
      () => [],
    )
    const hits = (Array.isArray(found) ? found : []).filter(
      (user) => user.active !== false && (lower(user.emailAddress) === wanted || lower(user.name) === local),
    )
    if (hits.length > 1) throw new Error(`Jira: ${email} passt auf mehrere Benutzer`)
    const me = hits.length === 1 ? meOf(hits[0]!, config.baseUrl) : null
    if (me) return me
  }
  throw new Error(`Jira: kein Benutzer zu ${email}`)
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
