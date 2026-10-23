import { ampelState, excluded, isWaiting } from '../shared/pipeline.js'
import type { MergeRequestRow, PipelineRow } from '../shared/types.js'
import type { GitlabConfig } from './config.js'

const PROJECTS_QUERY = `
query Projects($fullPath: ID!, $includeSubgroups: Boolean!) {
  group(fullPath: $fullPath) {
    projects(includeSubgroups: $includeSubgroups, first: 100) {
      nodes {
        fullPath
        name
        webUrl
        archived
        repository { rootRef }
        pipelines(first: 15) {
          nodes {
            status
            ref
            source
            finishedAt
            createdAt
            updatedAt
            path
            user { name }
            detailedStatus { group label }
          }
        }
      }
    }
  }
}`

const MRS_QUERY = `
query Mrs($fullPath: ID!, $includeSubgroups: Boolean!) {
  group(fullPath: $fullPath) {
    mergeRequests(state: opened, includeSubgroups: $includeSubgroups, first: 50, sort: CREATED_ASC) {
      nodes {
        title
        webUrl
        createdAt
        draft
        author { name }
        project { name }
        approvedBy { nodes { name } }
      }
    }
  }
}`

export interface GitlabDeps {
  fetch: typeof fetch
  now: () => Date
  log?: (message: string) => void
}

async function graphql<T>(config: GitlabConfig, token: string, deps: GitlabDeps, query: string, variables: unknown): Promise<T> {
  const response = await deps.fetch(`${config.baseUrl}/api/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`GitLab ${response.status} ${response.statusText}`)
  }

  const body = (await response.json()) as { data?: T; errors?: { message: string }[] }
  if (body.errors?.length) {
    throw new Error(`GitLab: ${body.errors.map((e) => e.message).join('; ')}`)
  }
  if (!body.data) throw new Error('GitLab: leere Antwort')
  return body.data
}

interface ProjectNode {
  fullPath: string
  name: string
  webUrl: string
  archived: boolean
  repository: { rootRef: string | null } | null
  pipelines: { nodes: PipelineNode[] }
}

export interface PipelineNode {
  status: string
  ref: string
  source?: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt?: string | null
  path: string
  user: { name: string } | null
  detailedStatus?: { group?: string | null; label?: string | null } | null
}

/** Pipelines GitLab reports for a ref that are not the run we mean. */
const SIDE_SOURCES = ['parent_pipeline', 'merge_request_event', 'external', 'ondemand_dast_scan']

export function newestOnRef(nodes: readonly PipelineNode[], ref: string): PipelineNode | null {
  const candidates = nodes
    .filter((node) => node.ref === ref)
    .filter((node) => !SIDE_SOURCES.includes(node.source ?? ''))

  if (candidates.length === 0) return null

  // GitLab does not promise an order here, and a retried run changes updatedAt
  // without changing createdAt — so sort on the newest timestamp we have.
  const stamp = (node: PipelineNode) =>
    new Date(node.updatedAt ?? node.finishedAt ?? node.createdAt).getTime()

  return candidates.reduce((best, node) => (stamp(node) > stamp(best) ? node : best))
}

export function toPipelineRows(
  projects: readonly ProjectNode[],
  config: GitlabConfig,
  now: Date,
): PipelineRow[] {
  const rows: PipelineRow[] = []

  for (const project of projects) {
    if (!config.includeArchived && project.archived) continue
    if (excluded(project.fullPath, config.exclude)) continue

    const ref = project.repository?.rootRef ?? 'master'
    const pipeline = newestOnRef(project.pipelines.nodes, ref)
    if (pipeline === null && config.hideWithoutPipeline) continue

    rows.push({
      fullPath: project.fullPath,
      name: project.name,
      ref,
      rawStatus: pipeline?.status ?? '',
      detail: pipeline?.detailedStatus?.label ?? pipeline?.detailedStatus?.group ?? null,
      waiting: isWaiting(pipeline?.status),
      state: ampelState(
        pipeline?.status,
        pipeline?.finishedAt ?? null,
        now,
        config.staleAfterDays,
        pipeline?.detailedStatus?.group,
        config.forceGood,
      ),
      finishedAt: pipeline?.finishedAt ?? pipeline?.updatedAt ?? pipeline?.createdAt ?? null,
      author: pipeline?.user?.name ?? null,
      webUrl: pipeline ? `${config.baseUrl}${pipeline.path}` : project.webUrl,
    })
  }

  return rows.sort((a, b) => a.fullPath.localeCompare(b.fullPath))
}

interface MrNode {
  title: string
  webUrl: string
  createdAt: string
  draft: boolean
  author: { name: string } | null
  project: { name: string } | null
  approvedBy: { nodes: { name: string }[] } | null
}

export function toMergeRequestRows(nodes: readonly MrNode[], now: Date): MergeRequestRow[] {
  return nodes
    .map((node) => ({
      title: node.title,
      project: node.project?.name ?? '—',
      author: node.author?.name ?? '—',
      ageDays: Math.max(
        0,
        Math.floor((now.getTime() - new Date(node.createdAt).getTime()) / 86_400_000),
      ),
      draft: node.draft,
      approvals: node.approvedBy?.nodes.length ?? 0,
      webUrl: node.webUrl,
    }))
    .filter((row) => !row.draft)
    .sort((a, b) => b.ageDays - a.ageDays)
}

export function groupsOrThrow<T>(
  paths: readonly string[],
  results: readonly { group: T | null }[],
): T[] {
  const missing = paths.filter((_, index) => !results[index]?.group)
  if (missing.length > 0) {
    throw new Error(
      `GitLab: Gruppe ${missing.join(', ')} nicht gefunden oder für den Token nicht sichtbar — ` +
        'der vollständige Pfad ist gemeint, nicht nur der letzte Teil',
    )
  }
  return results.map((result) => result.group as T)
}

export async function fetchPipelines(config: GitlabConfig, token: string, deps: GitlabDeps) {
  const perGroup = await Promise.all(
    config.groups.map((fullPath) =>
      graphql<{ group: { projects: { nodes: ProjectNode[] } } | null }>(
        config,
        token,
        deps,
        PROJECTS_QUERY,
        { fullPath, includeSubgroups: config.includeSubgroups },
      ),
    ),
  )
  const projects = groupsOrThrow(config.groups, perGroup).flatMap((group) => group.projects.nodes)
  return toPipelineRows(projects, config, deps.now())
}

export async function fetchMergeRequests(config: GitlabConfig, token: string, deps: GitlabDeps) {
  const perGroup = await Promise.all(
    config.groups.map((fullPath) =>
      graphql<{ group: { mergeRequests: { nodes: MrNode[] } } | null }>(
        config,
        token,
        deps,
        MRS_QUERY,
        { fullPath, includeSubgroups: config.includeSubgroups },
      ),
    ),
  )
  const nodes = groupsOrThrow(config.groups, perGroup).flatMap(
    (group) => group.mergeRequests.nodes,
  )
  return toMergeRequestRows(nodes, deps.now())
}
