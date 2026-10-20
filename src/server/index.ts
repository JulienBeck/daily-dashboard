import Fastify from 'fastify'
import { fetchCommits } from './activity.js'
import { StaleCache } from './cache.js'
import { fetchCalendar } from './calendar.js'
import { loadConfig } from './config.js'
import { fetchMergeRequests, fetchPipelines } from './gitlab.js'
import {
  fetchAvatar,
  fetchEpics,
  fetchSprint,
  fetchTeamAvatars,
  isIssueKey,
  isLane,
  moveIssue,
} from './jira.js'

const config = loadConfig()
const cache = new StaleCache()
const deps = { fetch: globalThis.fetch, now: () => new Date() }

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
async function teamWithAvatars() {
  if (!jiraCredentials.token || !config.jira.baseUrl) return config.team
  const payload = await cache
    .get('team-avatars', config.cacheSeconds.jira * 10, () =>
      fetchTeamAvatars(config.jira, jiraCredentials, deps, config.team),
    )
    .catch(() => null)
  const avatars = payload?.data ?? {}
  return config.team.map((member) => ({ ...member, avatar: avatars[member.name] ?? null }))
}

app.get('/api/board', async () => ({
  team: await teamWithAvatars(),
  refreshSeconds: config.refreshSeconds,
  reminderLeadMonths: config.theme.reminderLeadMonths,
  weekComponents: config.jira.weekComponents,
}))

app.get('/api/pipelines', async () => {
  guard(Boolean(gitlabToken), 'GITLAB_TOKEN ist nicht gesetzt')
  guard(config.gitlab.groups.length > 0, 'Keine GitLab-Gruppe konfiguriert')
  return cache.get('pipelines', config.cacheSeconds.gitlab, () =>
    fetchPipelines(config.gitlab, gitlabToken, deps),
  )
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
      config.activity.days,
      config.activity.perMember,
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
    return moved
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
