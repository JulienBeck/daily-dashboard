import type { Viewer } from '../../shared/types.js'
import type { JiraConfig } from '../questlog/config.js'
import type { JiraCredentials, JiraDeps } from '../questlog/jira.js'
import { fetchMe, fetchPerson, type Me } from './jira.js'

export const PEOPLE_SECONDS = 600

export interface People {
  who(viewer: Viewer | null): Promise<Me>
}

export function createPeople(
  jira: JiraConfig,
  credentials: JiraCredentials,
  deps: JiraDeps & { now: () => Date },
): People {
  const known = new Map<string, { value: Promise<Me>; at: number }>()
  return {
    who(viewer) {
      const key = viewer ? viewer.email.trim().toLowerCase() : ''
      const now = deps.now().getTime()
      const hit = known.get(key)
      if (hit && now - hit.at < PEOPLE_SECONDS * 1000) return hit.value
      const value = viewer ? fetchPerson(jira, credentials, deps, viewer.email) : fetchMe(jira, credentials, deps)
      known.set(key, { value, at: now })
      value.catch(() => {
        if (known.get(key)?.value === value) known.delete(key)
      })
      return value
    },
  }
}
