import { describe, expect, it } from 'vitest'
import { pageById, parseConfig, parseCreate, parsePage } from './config.js'

describe('parseCreate', () => {
  it('needs a project key', () => {
    expect(parseCreate({ issueType: 'Task' })).toBeNull()
    expect(parseCreate(null)).toBeNull()
  })

  it('defaults the issue type to Task', () => {
    expect(parseCreate({ project: 'PRO' })).toEqual({
      project: 'PRO',
      issueType: 'Task',
      labels: [],
    })
  })
})

describe('parsePage', () => {
  it('derives an id from the title', () => {
    expect(parsePage({ title: 'Team KI' }, 0).id).toBe('team-ki')
  })

  it('keeps an explicit id', () => {
    expect(parsePage({ id: 'ki', title: 'Team KI' }, 0).id).toBe('ki')
  })

  it('numbers a page without a title', () => {
    expect(parsePage({}, 2)).toMatchObject({ id: 'seite-3', title: 'Seite 3' })
  })
})

describe('parseConfig', () => {
  it('fills the defaults', () => {
    const config = parseConfig({})
    expect(config.jira.flavor).toBe('auto')
    expect(config.jira.doneStatusCategories).toEqual(['done'])
    expect(config.jira.maxQuests).toBe(100)
    expect(config.pages).toEqual([])
    expect(config.refreshSeconds).toBe(120)
  })

  it('strips a trailing slash from the Jira address', () => {
    expect(parseConfig({ jira: { baseUrl: 'https://jira.test//' } }).jira.baseUrl).toBe(
      'https://jira.test',
    )
  })

  it('rejects an unknown flavor', () => {
    expect(parseConfig({ jira: { flavor: 'onprem' } }).jira.flavor).toBe('auto')
    expect(parseConfig({ jira: { flavor: 'cloud' } }).jira.flavor).toBe('cloud')
  })
})

describe('pageById', () => {
  const config = parseConfig({ pages: [{ id: 'ki', title: 'KI' }] })

  it('finds a page and reports an unknown one', () => {
    expect(pageById(config, 'ki')?.title).toBe('KI')
    expect(pageById(config, 'nope')).toBeNull()
  })
})
