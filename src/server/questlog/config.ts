export interface CreateTarget {
  project: string
  issueType: string
  /** Labels stamped on every quest handed out from this page. */
  labels: string[]
}

export interface PageConfig {
  id: string
  title: string
  boardId: number | null
  jql: string | null
  create: CreateTarget | null
}

export interface JiraConfig {
  baseUrl: string
  flavor: 'auto' | 'server' | 'cloud'
  storyPointsField: string | null
  /** Overrides for instances that renamed the agile fields; null = look them up. */
  epicLinkField: string | null
  epicNameField: string | null
  doneStatusCategories: string[]
  doingStatusCategories: string[]
  openStatusCategories: string[]
  maxQuests: number
}

export interface QuestlogConfig {
  jira: JiraConfig
  pages: PageConfig[]
  refreshSeconds: number
  cacheSeconds: { jira: number }
}

const strings = (raw: unknown): string[] => (Array.isArray(raw) ? raw.map(String) : [])

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function parseCreate(raw: unknown): CreateTarget | null {
  const source = (raw ?? {}) as Record<string, any>
  const project = String(source.project ?? '').trim()
  if (!project) return null
  return {
    project,
    issueType: String(source.issueType ?? 'Task').trim() || 'Task',
    labels: strings(source.labels),
  }
}

export function parsePage(raw: unknown, index: number): PageConfig {
  const source = (raw ?? {}) as Record<string, any>
  const title = String(source.title ?? `Seite ${index + 1}`)
  return {
    id: String(source.id ?? slug(title) ?? `page-${index}`) || `page-${index}`,
    title,
    boardId: source.boardId == null ? null : Number(source.boardId),
    jql: source.jql ? String(source.jql) : null,
    create: parseCreate(source.create),
  }
}

export function parseConfig(raw: unknown): QuestlogConfig {
  const source = (raw ?? {}) as Record<string, any>
  const jira = source.jira ?? {}
  const cache = source.cacheSeconds ?? {}

  return {
    jira: {
      baseUrl: String(jira.baseUrl ?? '').replace(/\/+$/, ''),
      flavor: ['server', 'cloud'].includes(jira.flavor) ? jira.flavor : 'auto',
      storyPointsField: jira.storyPointsField ? String(jira.storyPointsField) : null,
      epicLinkField: jira.epicLinkField ? String(jira.epicLinkField) : null,
      epicNameField: jira.epicNameField ? String(jira.epicNameField) : null,
      doneStatusCategories: Array.isArray(jira.doneStatusCategories)
        ? jira.doneStatusCategories.map(String)
        : ['done'],
      doingStatusCategories: Array.isArray(jira.doingStatusCategories)
        ? jira.doingStatusCategories.map(String)
        : ['indeterminate'],
      openStatusCategories: Array.isArray(jira.openStatusCategories)
        ? jira.openStatusCategories.map(String)
        : ['new'],
      maxQuests: Number(jira.maxQuests ?? 100),
    },
    pages: (Array.isArray(source.pages) ? source.pages : []).map(parsePage),
    refreshSeconds: Number(source.refreshSeconds ?? 120),
    cacheSeconds: { jira: Number(cache.jira ?? 120) },
  }
}

export function pageById(config: QuestlogConfig, id: string): PageConfig | null {
  return config.pages.find((page) => page.id === id) ?? null
}
