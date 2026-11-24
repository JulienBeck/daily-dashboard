import { describe, expect, it } from 'vitest'
import { viewerOf } from './identity.js'

const team = [
  { name: 'Julien', email: 'J.Beck@ceyoniq.com' },
  { name: 'Timo', email: null },
]

describe('viewerOf', () => {
  it('knows nobody without the header oauth2-proxy sets', () => {
    expect(viewerOf({}, team)).toBeNull()
    expect(viewerOf({ 'x-forwarded-email': '  ' }, team)).toBeNull()
  })

  it('maps the login to the team member with that address, whatever its case', () => {
    expect(viewerOf({ 'x-forwarded-email': 'j.beck@ceyoniq.com', 'x-forwarded-preferred-username': 'jbeck' }, team)).toEqual({
      email: 'j.beck@ceyoniq.com',
      name: 'Julien',
      member: 'Julien',
    })
  })

  it('still names a login outside the team, but claims no member for it', () => {
    expect(viewerOf({ 'x-forwarded-email': 'gast@ceyoniq.com', 'x-forwarded-preferred-username': 'gast' }, team)).toEqual({
      email: 'gast@ceyoniq.com',
      name: 'gast',
      member: null,
    })
    expect(viewerOf({ 'x-forwarded-email': 'gast@ceyoniq.com' }, team)?.name).toBe('gast@ceyoniq.com')
  })

  it('takes the first value of a repeated header', () => {
    expect(viewerOf({ 'x-forwarded-email': ['J.Beck@ceyoniq.com', 'other@x'] }, team)?.member).toBe('Julien')
  })
})
