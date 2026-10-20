import { describe, expect, it } from 'vitest'
import { forBoard, parseConfig } from './config.js'

describe('parseConfig', () => {
  it('fills every section when given nothing', () => {
    const config = parseConfig({})
    expect(config.gitlab.groups).toEqual([])
    expect(config.gitlab.staleAfterDays).toBe(14)
    expect(config.jira.flavor).toBe('auto')
    expect(config.refreshSeconds).toBe(60)
    expect(config.cacheSeconds).toEqual({ gitlab: 60, jira: 120, calendar: 300 })
  })

  it('strips a trailing slash from both base urls', () => {
    const config = parseConfig({
      gitlab: { baseUrl: 'https://git.example.com///' },
      jira: { baseUrl: 'https://jira.example.com/' },
    })
    expect(config.gitlab.baseUrl).toBe('https://git.example.com')
    expect(config.jira.baseUrl).toBe('https://jira.example.com')
  })

  it('keeps the forceGood escape hatch empty unless asked', () => {
    expect(parseConfig({}).gitlab.forceGood).toEqual([])
    expect(parseConfig({ gitlab: { forceGood: ['manual'] } }).gitlab.forceGood).toEqual(['manual'])
  })

  it('defaults includeSubgroups to on but lets it be switched off', () => {
    expect(parseConfig({}).gitlab.includeSubgroups).toBe(true)
    expect(parseConfig({ gitlab: { includeSubgroups: false } }).gitlab.includeSubgroups).toBe(false)
  })

  it('keeps the epic query and caps how many are shown', () => {
    expect(parseConfig({}).jira.epicsJql).toBeNull()
    expect(parseConfig({}).jira.epicsLimit).toBe(4)
    const custom = parseConfig({ jira: { epicsJql: 'project = KI', epicsLimit: 3 } })
    expect(custom.jira.epicsJql).toBe('project = KI')
    expect(custom.jira.epicsLimit).toBe(3)
  })

  it('leaves every lane without a preferred status, so jira decides alone', () => {
    expect(parseConfig({}).jira.laneStatus).toEqual({ todo: [], doing: [], done: [] })
  })

  it('keeps the order of the preferred statuses, because the first one wins', () => {
    const config = parseConfig({ jira: { laneStatus: { doing: ['In Review', 'In Progress'] } } })
    expect(config.jira.laneStatus.doing).toEqual(['In Review', 'In Progress'])
    expect(config.jira.laneStatus.done).toEqual([])
  })

  it('keeps the mail address and leaves the picture to the proxy', () => {
    const config = parseConfig({ team: [{ name: 'Timo', email: 't.weber@example.com' }] })
    expect(config.team[0]!.email).toBe('t.weber@example.com')
    expect(config.team[0]!.avatar).toBeNull()
  })

  it('keeps the mail address out of what the browser gets', () => {
    const member = parseConfig({ team: [{ name: 'Timo', email: 't.weber@example.com' }] }).team[0]!
    expect(forBoard(member, null)).not.toHaveProperty('email')
  })

  it('hands the browser everything the board needs to draw a member', () => {
    const member = parseConfig({
      team: [{ name: 'Timo', away: 'Urlaub', gitlabUser: 'timo', email: 't@example.com' }],
    }).team[0]!
    expect(forBoard(member, '/api/avatar?url=x')).toEqual({
      name: 'Timo',
      initials: 'T',
      away: 'Urlaub',
      gitlabUser: 'timo',
      self: false,
      avatar: '/api/avatar?url=x',
    })
  })

  it('searches by name when no address is given', () => {
    expect(parseConfig({ team: [{ name: 'Timo' }] }).team[0]!.email).toBeNull()
    expect(parseConfig({ team: [{ name: 'Timo', email: '' }] }).team[0]!.email).toBeNull()
  })

  it('shows epics in progress by default, because that is the running theme', () => {
    expect(parseConfig({}).jira.epicsStatusCategories).toEqual(['indeterminate'])
  })

  it('lets the epic categories be widened', () => {
    const config = parseConfig({ jira: { epicsStatusCategories: ['indeterminate', 'new'] } })
    expect(config.jira.epicsStatusCategories).toEqual(['indeterminate', 'new'])
  })

  it('keeps the epic board id as a number', () => {
    expect(parseConfig({ jira: { epicsBoardId: '96' } }).jira.epicsBoardId).toBe(96)
    expect(parseConfig({}).jira.epicsBoardId).toBeNull()
  })

  it('rejects an unknown jira flavor instead of passing it through', () => {
    expect(parseConfig({ jira: { flavor: 'datacenter' } }).jira.flavor).toBe('auto')
    expect(parseConfig({ jira: { flavor: 'cloud' } }).jira.flavor).toBe('cloud')
  })

  it('derives initials from the name when none are given', () => {
    const config = parseConfig({ team: [{ name: 'Jan Beck' }, { name: 'A. Hartmann' }] })
    expect(config.team[0]!.initials).toBe('JB')
    expect(config.team[1]!.initials).toBe('AH')
  })

  it('keeps explicit initials', () => {
    expect(parseConfig({ team: [{ name: 'Jan Beck', initials: 'JAN' }] }).team[0]!.initials).toBe('JAN')
  })

  it('turns a missing absence into null, not undefined', () => {
    expect(parseConfig({ team: [{ name: 'Jan Beck' }] }).team[0]!.away).toBeNull()
  })

  it('keeps the gitlab user, so foreign commits can be fetched', () => {
    const config = parseConfig({ team: [{ name: 'Jan Beck', gitlabUser: 'j.beck' }] })
    expect(config.team[0]!.gitlabUser).toBe('j.beck')
    expect(config.team[0]!.self).toBe(false)
  })

  it('reads gitlabUser true as "that is me"', () => {
    const config = parseConfig({ team: [{ name: 'Jan Beck', gitlabUser: true }] })
    expect(config.team[0]!.self).toBe(true)
    expect(config.team[0]!.gitlabUser).toBeNull()
  })

  it('reads gitlabUser false as "no commits", not as "that is me"', () => {
    const config = parseConfig({ team: [{ name: 'Timo', gitlabUser: false }] })
    expect(config.team[0]!.self).toBe(false)
    expect(config.team[0]!.gitlabUser).toBeNull()
  })

  it('treats a missing gitlabUser the same as false', () => {
    const config = parseConfig({ team: [{ name: 'Timo' }] })
    expect(config.team[0]!.self).toBe(false)
    expect(config.team[0]!.gitlabUser).toBeNull()
  })

  it('ignores an empty username rather than querying /users//events', () => {
    expect(parseConfig({ team: [{ name: 'Timo', gitlabUser: '' }] }).team[0]!.gitlabUser).toBeNull()
  })

  it('fills the activity window with defaults', () => {
    expect(parseConfig({}).activity).toEqual({ days: 1, perMember: 5 })
    expect(parseConfig({ activity: { days: 3, perMember: 2 } }).activity).toEqual({
      days: 3,
      perMember: 2,
    })
  })

  it('keeps a configured board id as a number', () => {
    expect(parseConfig({ jira: { boardId: '42' } }).jira.boardId).toBe(42)
    expect(parseConfig({ jira: {} }).jira.boardId).toBeNull()
  })
})
