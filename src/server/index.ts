import Fastify from 'fastify'
import { dayKey, resolveAbsence } from './absence.js'
import { fetchCommits } from './activity.js'
import { fetchBurndown } from './burndown.js'
import { StaleCache } from './cache.js'
import { fetchCalendar } from './calendar.js'
import { forBoard, loadConfig } from './config.js'
import { fetchMergeRequests, fetchPipelines } from './gitlab.js'
import {
  fetchAvatar,
  fetchEpics,
  fetchSprint,
  fetchTeamAvatars,
  isIssueKey,
  isLane,
  isWeek,
  moveIssue,
  setIssueWeek,
} from './jira.js'
import { type PageConfig, pageById } from './questlog/config.js'
import {
  abandonQuest,
  acceptQuest,
  completeQuest,
  createQuest,
  fetchPage,
  type NewQuest,
} from './questlog/jira.js'
import { postgres, retry } from './db.js'
import { migrate } from './rewards/schema.js'
import { createRewards, parseBody, parseEquip, parseIds, parseShares, questOn, type Rewards } from './rewards/service.js'

const config = loadConfig()
const REWARD_SYNC_MS = 5 * 60_000
const DB_ATTEMPTS = 40
const DB_RETRY_MS = 3000
const cache = new StaleCache()
const deps = {
  fetch: globalThis.fetch,
  now: () => new Date(),
  log: (message: string) => app.log.info(message),
}

const gitlabToken = process.env.GITLAB_TOKEN ?? ''
const jiraCredentials = {
  token: process.env.JIRA_TOKEN ?? '',
  email: process.env.JIRA_EMAIL ?? null,
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

const guard = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message)
}

// Pictures are a nicety: a sulking Jira must not cost us the whole board.
async function avatarsByName(): Promise<Record<string, string | null>> {
  if (!jiraCredentials.token || !config.jira.baseUrl) return {}
  const payload = await cache
    .get('team-avatars', config.cacheSeconds.jira * 10, () =>
      fetchTeamAvatars(config.jira, jiraCredentials, deps, config.team),
    )
    .catch(() => null)
  return payload?.data ?? {}
}

async function teamForBoard() {
  const avatars = await avatarsByName()
  const today = dayKey(deps.now())
  return config.team.map((member) =>
    forBoard(
      member,
      avatars[member.name] ?? null,
      resolveAbsence(config.absences, member.name, today, config.theme.absenceLookaheadDays),
    ),
  )
}

app.get('/api/board', async () => ({
  team: await teamForBoard(),
  refreshSeconds: config.refreshSeconds,
  reminderLeadMonths: config.theme.reminderLeadMonths,
  weekComponents: config.jira.weekComponents,
}))

app.get<{ Querystring: { fresh?: string } }>('/api/pipelines', async (request) => {
  guard(Boolean(gitlabToken), 'GITLAB_TOKEN ist nicht gesetzt')
  guard(config.gitlab.groups.length > 0, 'Keine GitLab-Gruppe konfiguriert')
  const ttl = request.query.fresh === '1' ? 0 : config.cacheSeconds.gitlab
  return cache.get('pipelines', ttl, () => fetchPipelines(config.gitlab, gitlabToken, deps))
})

app.get('/api/mrs', async () => {
  guard(Boolean(gitlabToken), 'GITLAB_TOKEN ist nicht gesetzt')
  guard(config.gitlab.groups.length > 0, 'Keine GitLab-Gruppe konfiguriert')
  return cache.get('mrs', config.cacheSeconds.gitlab, () =>
    fetchMergeRequests(config.gitlab, gitlabToken, deps),
  )
})

app.get('/api/epics', async () => {
  guard(Boolean(jiraCredentials.token), 'JIRA_TOKEN ist nicht gesetzt')
  guard(
    config.jira.epicsBoardId != null || Boolean(config.jira.epicsJql),
    'Keine Epic-Quelle konfiguriert (jira.epicsBoardId oder jira.epicsJql)',
  )
  return cache.get('epics', config.cacheSeconds.jira, () =>
    fetchEpics(config.jira, jiraCredentials, deps),
  )
})

app.get('/api/calendar', async () => {
  const urls = Object.fromEntries(
    config.calendar.sources.map((source) => [source.env, process.env[source.env] ?? '']),
  )
  guard(
    config.calendar.sources.some((source) => urls[source.env]),
    'Kein Kalender konfiguriert — ICS-Adresse fehlt',
  )
  return cache.get('calendar', config.cacheSeconds.calendar, () =>
    fetchCalendar(config.calendar, urls, deps),
  )
})

app.get('/api/commits', async () => {
  guard(Boolean(gitlabToken), 'GITLAB_TOKEN ist nicht gesetzt')
  return cache.get('commits', config.cacheSeconds.gitlab, () =>
    fetchCommits(
      config.gitlab,
      gitlabToken,
      deps,
      config.team,
      config.activity.hours,
      config.activity.perMember,
      config.activity.sinceLastWorkday,
    ),
  )
})

app.get<{ Querystring: { url?: string } }>('/api/avatar', async (request, reply) => {
  const url = request.query.url
  guard(Boolean(url), 'Avatar: keine Adresse angegeben')
  guard(Boolean(jiraCredentials.token), 'JIRA_TOKEN ist nicht gesetzt')
  const image = await fetchAvatar(url!, config.jira, jiraCredentials, deps)
  // Avatars never change within a session; a day of caching keeps the board quiet.
  reply.header('content-type', image.contentType).header('cache-control', 'private, max-age=86400')
  return Buffer.from(image.body)
})

app.get('/api/sprint', async () => {
  guard(Boolean(jiraCredentials.token), 'JIRA_TOKEN ist nicht gesetzt')
  guard(Boolean(config.jira.baseUrl), 'Keine Jira-Adresse konfiguriert')
  return cache.get('sprint', config.cacheSeconds.jira, () =>
    fetchSprint(config.jira, jiraCredentials, deps),
  )
})

app.get('/api/burndown', async () => {
  guard(Boolean(jiraCredentials.token), 'JIRA_TOKEN ist nicht gesetzt')
  guard(config.jira.boardId != null, 'Burndown braucht jira.boardId — freies JQL hat keine Historie')
  return cache.get('burndown', config.cacheSeconds.jira, () =>
    fetchBurndown(config.jira, jiraCredentials, deps),
  )
})

app.post<{ Params: { key: string }; Body: { lane?: string } }>(
  '/api/issues/:key/lane',
  async (request) => {
    guard(Boolean(jiraCredentials.token), 'JIRA_TOKEN ist nicht gesetzt')
    guard(isIssueKey(request.params.key), 'Kein gültiger Jira-Schlüssel')
    const lane = request.body?.lane
    guard(isLane(lane), 'Unbekannte Spalte')
    const moved = await moveIssue(
      config.jira,
      jiraCredentials,
      deps,
      request.params.key,
      lane as 'todo' | 'doing' | 'done',
    )
    // The board polls the cached sprint; without this the card would snap back.
    cache.invalidate('sprint')
    cache.invalidate('burndown')
    forgetQuestlogPages()
    return moved
  },
)

app.post<{ Params: { key: string }; Body: { week?: unknown } }>(
  '/api/issues/:key/week',
  async (request) => {
    guard(Boolean(jiraCredentials.token), 'JIRA_TOKEN ist nicht gesetzt')
    guard(isIssueKey(request.params.key), 'Kein gültiger Jira-Schlüssel')
    const week = request.body?.week
    guard(isWeek(week, config.jira.weekComponents), 'Unbekannte Woche')
    const moved = await setIssueWeek(
      config.jira,
      jiraCredentials,
      deps,
      request.params.key,
      week as string | null,
    )
    cache.invalidate('sprint')
    return moved
  },
)

const questlogPage = (id: string) => {
  guard(Boolean(jiraCredentials.token), 'JIRA_TOKEN ist nicht gesetzt')
  guard(Boolean(config.questlog.jira.baseUrl), 'Keine Jira-Adresse konfiguriert')
  const page = pageById(config.questlog, id)
  guard(page != null, `Unbekannte Questlog-Seite: ${id}`)
  return page!
}

const pagePayload = (page: PageConfig) =>
  cache.get(`questlog:${page.id}`, config.questlog.cacheSeconds.jira, () =>
    fetchPage(config.questlog.jira, page, jiraCredentials, deps),
  )

function forgetQuestlogPages() {
  for (const page of config.questlog.pages) cache.invalidate(`questlog:${page.id}`)
  cache.invalidate('profile')
}

function afterQuestWrite() {
  forgetQuestlogPages()
  void rewards?.sync(true).catch((error: unknown) => app.log.warn(error))
  cache.invalidate('sprint')
  cache.invalidate('burndown')
}

app.get('/api/questlog', async () => ({
  pages: config.questlog.pages.map((page) => ({
    id: page.id,
    title: page.title,
    canCreate: page.create != null,
  })),
  refreshSeconds: config.questlog.refreshSeconds,
  jiraBaseUrl: config.questlog.jira.baseUrl,
}))

const databaseUrl = process.env.DATABASE_URL ?? ''
const db = databaseUrl ? postgres(databaseUrl) : null

const rewards: Rewards | null = db
  ? createRewards({
      db,
      jira: config.questlog.jira,
      credentials: jiraCredentials,
      deps,
      sprint: async () => {
        if (config.jira.boardId == null) return null
        const payload = await cache.get('sprint', config.cacheSeconds.jira, () =>
          fetchSprint(config.jira, jiraCredentials, deps),
        )
        return { start: payload.data.sprint.startDate, end: payload.data.sprint.endDate }
      },
    })
  : null

const rewardsReady = () => {
  guard(Boolean(jiraCredentials.token), 'JIRA_TOKEN ist nicht gesetzt')
  guard(Boolean(config.questlog.jira.baseUrl), 'Keine Jira-Adresse konfiguriert')
  guard(rewards != null, 'DATABASE_URL ist nicht gesetzt')
  return rewards!
}

app.get('/api/profile', async () => {
  const service = rewardsReady()
  return cache.get('profile', config.questlog.cacheSeconds.jira, () => service.profile())
})

app.get('/api/inbox', async () => rewardsReady().inbox())

app.post<{ Body: { ids?: unknown } }>('/api/inbox/read', async (request) => {
  await rewardsReady().markRead(parseIds(request.body?.ids))
  return { ok: true }
})

app.get<{ Params: { key: string } }>('/api/rewards/:key', async (request) => {
  guard(isIssueKey(request.params.key), 'Kein gültiger Jira-Schlüssel')
  return rewardsReady().draft(request.params.key)
})

app.post<{ Params: { key: string }; Body: { shares?: unknown } }>('/api/rewards/:key', async (request) => {
  guard(isIssueKey(request.params.key), 'Kein gültiger Jira-Schlüssel')
  const service = rewardsReady()
  const result = await service.distribute(request.params.key, parseShares(request.body?.shares))
  cache.invalidate('profile')
  return result
})

app.get('/api/equipment', async () => rewardsReady().equipment())

app.post<{ Body: unknown }>('/api/equipment', async (request) => {
  const { item, equipped } = parseEquip(request.body)
  return rewardsReady().equip(item, equipped)
})

app.post<{ Body: unknown }>('/api/body', async (request) => rewardsReady().chooseBody(parseBody(request.body)))

app.get<{ Querystring: { q?: string } }>('/api/users', async (request) =>
  rewardsReady().users(request.query.q ?? ''),
)

app.get<{ Params: { id: string } }>('/api/questlog/pages/:id', async (request) => {
  const payload = await pagePayload(questlogPage(request.params.id))
  if (!rewards) return payload
  const stamped = await rewards.stamp(payload.data).catch((error: unknown) => {
    app.log.warn(error)
    return payload.data
  })
  return { ...payload, data: stamped }
})

app.post<{ Params: { id: string }; Body: Partial<NewQuest> }>(
  '/api/questlog/pages/:id/quests',
  async (request, reply) => {
    const page = questlogPage(request.params.id)
    const created = await createQuest(
      config.questlog.jira,
      page,
      jiraCredentials,
      deps,
      request.body ?? {},
    )
    afterQuestWrite()
    reply.status(201)
    return created
  },
)

app.post<{ Params: { id: string; key: string } }>(
  '/api/questlog/pages/:id/quests/:key/accept',
  async (request) => {
    questlogPage(request.params.id)
    guard(isIssueKey(request.params.key), 'Kein gültiger Jira-Schlüssel')
    const taken = await acceptQuest(config.questlog.jira, jiraCredentials, deps, request.params.key)
    afterQuestWrite()
    return taken
  },
)

app.post<{ Params: { id: string; key: string } }>(
  '/api/questlog/pages/:id/quests/:key/complete',
  async (request) => {
    const page = questlogPage(request.params.id)
    const key = request.params.key
    guard(isIssueKey(key), 'Kein gültiger Jira-Schlüssel')
    const quest = rewards ? questOn((await pagePayload(page)).data, key) : null
    guard(rewards == null || quest != null, `${key} steht nicht auf dieser Seite`)
    await rewards?.assertHandable(key)
    const handed = await completeQuest(config.questlog.jira, jiraCredentials, deps, key)
    if (quest) await rewards?.handIn(quest)
    afterQuestWrite()
    return handed
  },
)

app.post<{ Params: { id: string; key: string } }>(
  '/api/questlog/pages/:id/quests/:key/abandon',
  async (request) => {
    questlogPage(request.params.id)
    guard(isIssueKey(request.params.key), 'Kein gültiger Jira-Schlüssel')
    await rewards?.assertAbandonable(request.params.key)
    const dropped = await abandonQuest(config.questlog.jira, jiraCredentials, deps, request.params.key)
    await rewards?.withdraw(request.params.key)
    afterQuestWrite()
    return dropped
  },
)

app.setErrorHandler((error: unknown, _request, reply) => {
  app.log.error(error)
  reply.status(502).send({ error: error instanceof Error ? error.message : String(error) })
})

const port = Number(process.env.PORT ?? 3399)

async function start() {
  if (db) {
    await retry(() => migrate(db), DB_ATTEMPTS, DB_RETRY_MS, (error, attempt) =>
      app.log.warn(`Datenbank noch nicht bereit (Versuch ${attempt}/${DB_ATTEMPTS}): ${String(error)}`),
    )
    setInterval(() => {
      void rewards?.sync().catch((error: unknown) => app.log.warn(error))
    }, REWARD_SYNC_MS)
  }
  await app.listen({ port, host: '0.0.0.0' })
}

start().catch((error: unknown) => {
  app.log.error(error)
  process.exit(1)
})
