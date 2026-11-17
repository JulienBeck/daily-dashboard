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
import { pageById } from './questlog/config.js'
import {
  acceptQuest,
  completeQuest,
  createQuest,
  fetchPage,
  type NewQuest,
} from './questlog/jira.js'

const config = loadConfig()
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

function forgetQuestlogPages() {
  for (const page of config.questlog.pages) cache.invalidate(`questlog:${page.id}`)
}

function afterQuestWrite() {
  forgetQuestlogPages()
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

app.get<{ Params: { id: string } }>('/api/questlog/pages/:id', async (request) => {
  const page = questlogPage(request.params.id)
  return cache.get(`questlog:${page.id}`, config.questlog.cacheSeconds.jira, () =>
    fetchPage(config.questlog.jira, page, jiraCredentials, deps),
  )
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
    questlogPage(request.params.id)
    guard(isIssueKey(request.params.key), 'Kein gültiger Jira-Schlüssel')
    const handed = await completeQuest(config.questlog.jira, jiraCredentials, deps, request.params.key)
    afterQuestWrite()
    return handed
  },
)

app.setErrorHandler((error: unknown, _request, reply) => {
  app.log.error(error)
  reply.status(502).send({ error: error instanceof Error ? error.message : String(error) })
})

const port = Number(process.env.PORT ?? 3399)
app.listen({ port, host: '0.0.0.0' }).catch((error) => {
  app.log.error(error)
  process.exit(1)
})
