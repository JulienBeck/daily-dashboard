import type { Viewer } from '../shared/types.js'
import type { ConfigMember } from './config.js'

type Headers = Record<string, string | string[] | undefined>

const header = (headers: Headers, name: string): string | null => {
  const value = headers[name]
  const first = (Array.isArray(value) ? value[0] : value)?.trim()
  return first ? first : null
}

export function viewerOf(headers: Headers, team: readonly Pick<ConfigMember, 'name' | 'email'>[]): Viewer | null {
  const email = header(headers, 'x-forwarded-email')
  if (!email) return null
  const member = team.find((entry) => entry.email?.toLowerCase() === email.toLowerCase()) ?? null
  return {
    email,
    name: member?.name ?? header(headers, 'x-forwarded-preferred-username') ?? email,
    member: member?.name ?? null,
  }
}
