import { readFile } from 'node:fs/promises'

const server = process.env.KEYCLOAK_URL ?? 'http://keycloak:8080/auth'
const realm = process.env.KEYCLOAK_REALM ?? 'daily-dashboard'
const configFile = process.env.DASHBOARD_CONFIG ?? '/config/dashboard.config.json'

async function adminToken() {
  for (let attempt = 1; attempt <= 60; attempt++) {
    const response = await fetch(`${server}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: process.env.KEYCLOAK_ADMIN ?? 'admin',
        password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
      }),
    }).catch(() => null)
    const realmReady = await fetch(`${server}/realms/${realm}`).catch(() => null)
    if (response?.ok && realmReady?.ok) {
      const { access_token: accessToken } = await response.json()
      return accessToken
    }
    console.log(`waiting for keycloak (${attempt})`)
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  throw new Error('keycloak did not come up')
}

const token = await adminToken()
const admin = (path, init = {}) =>
  fetch(`${server}/admin/realms/${realm}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  })

const { team = [] } = JSON.parse(await readFile(configFile, 'utf8'))
for (const member of team) {
  if (!member.email) continue
  const username = member.name.toLowerCase()
  const created = await admin('/users', {
    method: 'POST',
    body: JSON.stringify({
      username,
      email: member.email,
      firstName: member.name,
      lastName: 'Team',
      enabled: true,
      emailVerified: true,
      credentials: [{ type: 'password', value: username, temporary: false }],
    }),
  })
  console.log(`${username} <${member.email}>: ${created.status === 409 ? 'exists' : created.ok ? 'created' : `failed ${created.status}`}`)
}
