import { COPPER_PER_SILVER, SILVER_PER_GOLD, splitCoins } from '../../shared/questlog/quest.js'
import type { Coins, ProfilePayload, Quest } from '../../shared/questlog/types.js'
import { avatarUrl } from '../jira.js'
import type { JiraConfig } from './config.js'
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
} from './jira.js'

export const PROFILE_PAGE = 100
export const PROFILE_LIMIT = 1000
export const PROFILE_RECENT = 30

export interface Me {
  displayName?: string
  name?: string
  avatarUrls?: Record<string, string>
}

export function profileJql(config: Pick<JiraConfig, 'doneStatusCategories'>): string {
  return `assignee = currentUser() AND statusCategory in (${config.doneStatusCategories.join(', ')}) ORDER BY resolutiondate DESC`
}

const toCopper = ({ gold, silver, copper }: Coins) =>
  (gold * SILVER_PER_GOLD + silver) * COPPER_PER_SILVER + copper

export function summariseProfile(
  me: Me,
  done: readonly { quest: Quest; resolved: string | null }[],
  total: number,
  baseUrl: string,
): ProfilePayload {
  return {
    name: me.displayName ?? me.name ?? 'Unbekannt',
    avatar: avatarUrl(me.avatarUrls, baseUrl),
    experience: done.reduce((sum, { quest }) => sum + quest.experience, 0),
    coins: splitCoins(done.reduce((sum, { quest }) => sum + toCopper(quest.coins), 0)),
    completed: Math.max(total, done.length),
    counted: done.length,
    quests: done.slice(0, PROFILE_RECENT).map(({ quest, resolved }) => ({
      key: quest.key,
      title: quest.title,
      difficulty: quest.difficulty,
      experience: quest.experience,
      coins: quest.coins,
      resolved,
      webUrl: quest.webUrl,
    })),
  }
}

export async function fetchProfile(
  config: JiraConfig,
  boardId: number | null,
  credentials: JiraCredentials,
  deps: JiraDeps,
): Promise<ProfilePayload> {
  const flavor = await detectFlavor(config, deps)
  const version = apiPath(flavor)
  const me = await call<Me>(config, credentials, flavor, deps, `/rest/api/${version}/myself`)
  const ids = await resolveFields(config, credentials, flavor, deps, boardId)
  const fields = fieldList(ids, ['resolutiondate'])
  const jql = encodeURIComponent(profileJql(config))

  const issues: JiraIssue[] = []
  let total = 0
  for (let startAt = 0; startAt < PROFILE_LIMIT; startAt += PROFILE_PAGE) {
    const page = await call<{ issues?: JiraIssue[]; total?: number }>(
      config,
      credentials,
      flavor,
      deps,
      `/rest/api/${version}/search?startAt=${startAt}&maxResults=${PROFILE_PAGE}&fields=${fields}&jql=${jql}`,
    )
    const found = page.issues ?? []
    issues.push(...found)
    total = page.total ?? issues.length
    if (found.length < PROFILE_PAGE || issues.length >= total) break
  }

  const done = issues
    .filter((issue) => !isSeries(issue))
    .map((issue) => ({
      quest: toQuest(issue, config, ids, config.baseUrl),
      resolved: typeof issue.fields?.resolutiondate === 'string' ? issue.fields.resolutiondate : null,
    }))
  return summariseProfile(me, done, total, config.baseUrl)
}
