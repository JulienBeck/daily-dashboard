import { describe, expect, it, vi } from 'vitest'
import type { JiraConfig, PageConfig } from './config.js'
import {
  abandonQuest,
  acceptQuest,
  apiPath,
  authHeader,
  completeQuest,
  createBody,
  createQuest,
  detectFlavor,
  epicTitle,
  estimationField,
  fetchPage,
  fieldList,
  pickEpicLinkField,
  pickEpicNameField,
  pickStoryPointsField,
  pickTransition,
  plainText,
  readable,
  splitObjective,
  toQuest,
  validateNewQuest,
} from './jira.js'

const jira: JiraConfig = {
  baseUrl: 'https://jira.test',
  flavor: 'server',
  storyPointsField: 'customfield_1',
  epicLinkField: null,
  epicNameField: null,
  doneStatusCategories: ['done'],
  doingStatusCategories: ['indeterminate'],
  openStatusCategories: ['new'],
  maxQuests: 100,
}

const page: PageConfig = {
  id: 'ki',
  title: 'KI',
  boardId: 7,
  jql: null,
  create: { project: 'PRO', issueType: 'Task', labels: ['questlog'] },
}

const issue = (over: Record<string, any> = {}) => ({
  key: 'PRO-42',
  fields: {
    summary: 'Die Stunde der Abrechnung',
    description: 'Sprich mit Mathias Shaw.\n\nDie Allianz braucht dich.',
    status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
    priority: { name: 'Major' },
    issuetype: { name: 'Story' },
    assignee: { displayName: 'Timo' },
    reporter: { displayName: 'Anduin Wrynn' },
    labels: ['allianz'],
    parent: { key: 'PRO-100', fields: { summary: 'Krieg der Dornen' } },
    project: { key: 'PRO', name: 'Produkt' },
    customfield_1: 11,
    ...over,
  },
})

describe('authHeader', () => {
  it('uses bearer on Data Center and basic on Cloud', () => {
    expect(authHeader({ token: 'abc', email: null }, 'server')).toBe('Bearer abc')
    expect(authHeader({ token: 'abc', email: 'a@b.c' }, 'cloud')).toBe(
      `Basic ${Buffer.from('a@b.c:abc').toString('base64')}`,
    )
  })
})

describe('apiPath', () => {
  it('picks the API version per flavor', () => {
    expect(apiPath('server')).toBe('2')
    expect(apiPath('cloud')).toBe('3')
  })
})

describe('detectFlavor', () => {
  it('trusts a configured flavor without asking Jira', async () => {
    const fetchMock = vi.fn()
    await expect(detectFlavor(jira, { fetch: fetchMock as any })).resolves.toBe('server')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads deploymentType when set to auto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ deploymentType: 'Cloud' }),
    })
    await expect(
      detectFlavor({ ...jira, flavor: 'auto' }, { fetch: fetchMock as any }),
    ).resolves.toBe('cloud')
  })
})

describe('plainText', () => {
  it('passes wiki markup through unchanged', () => {
    expect(plainText('Hallo')).toBe('Hallo')
  })

  it('flattens an ADF document into paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Eins' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Zwei' }] },
      ],
    }
    expect(plainText(doc)).toBe('Eins\n\nZwei\n\n')
  })

  it('has nothing to say about null', () => {
    expect(plainText(null)).toBe('')
  })
})

describe('readable', () => {
  it('strips wiki decoration and links', () => {
    expect(readable('h2. Titel\n*fett* und [Text|https://x]')).toBe('Titel\nfett und Text')
  })

  it('collapses runs of blank lines', () => {
    expect(readable('a\n\n\n\nb')).toBe('a\n\nb')
  })
})

describe('splitObjective', () => {
  it('takes the first paragraph as the objective', () => {
    expect(splitObjective('Auftrag\n\nRest\n\nMehr', 'Titel')).toEqual({
      objective: 'Auftrag',
      body: 'Rest\n\nMehr',
    })
  })

  it('leaves the body empty with a single paragraph', () => {
    expect(splitObjective('Nur das', 'Titel')).toEqual({ objective: 'Nur das', body: '' })
  })

  it('falls back to the summary when there is no description', () => {
    expect(splitObjective('', 'Titel')).toEqual({ objective: 'Titel', body: '' })
  })
})

describe('pickStoryPointsField', () => {
  it('finds the estimate field by name', () => {
    expect(
      pickStoryPointsField([
        { id: 'customfield_9', name: 'Sprint' },
        { id: 'customfield_1', name: 'Story Points' },
      ]),
    ).toBe('customfield_1')
  })

  it('gives up when no field matches', () => {
    expect(pickStoryPointsField([{ id: 'x', name: 'Sprint' }])).toBeNull()
  })
})

describe('estimationField', () => {
  it('reads the board estimate field', () => {
    expect(estimationField({ estimation: { type: 'field', field: { fieldId: 'cf_1' } } })).toBe(
      'cf_1',
    )
  })

  it('ignores issue count boards and the "none" field', () => {
    expect(estimationField({ estimation: { type: 'issueCount' } })).toBeNull()
    expect(estimationField({ estimation: { type: 'field', field: { fieldId: 'none' } } })).toBeNull()
  })

  it('ignores a leftover field on a board that counts issues', () => {
    expect(
      estimationField({ estimation: { type: 'issueCount', field: { fieldId: 'cf_1' } } }),
    ).toBeNull()
  })
})

describe('fieldList', () => {
  it('appends the estimate field when there is one', () => {
    expect(fieldList({ points: 'cf_1', epicLink: null, epicName: null })).toContain('cf_1')
    expect(
      fieldList({ points: null, epicLink: null, epicName: null }).split(','),
    ).not.toContain('null')
  })
})

describe('toQuest', () => {
  it('turns an issue into a quest', () => {
    const quest = toQuest(issue(), jira, { points: 'customfield_1', epicLink: null, epicName: null }, 'https://jira.test')

    expect(quest).toMatchObject({
      key: 'PRO-42',
      project: 'PRO',
      projectName: 'Produkt',
      level: 110,
      state: 'active',
      difficulty: 'deadly',
      giver: 'Anduin Wrynn',
      assignee: 'Timo',
      seriesKey: 'PRO-100',
      seriesName: 'Krieg der Dornen',
      experience: 1650,
      objective: 'Sprich mit Mathias Shaw.',
      description: 'Die Allianz braucht dich.',
      webUrl: 'https://jira.test/browse/PRO-42',
    })
  })

  it('survives an issue without estimate, parent or people', () => {
    const quest = toQuest(
      issue({
        customfield_1: null,
        parent: undefined,
        assignee: null,
        reporter: null,
        description: null,
        status: { name: 'Open', statusCategory: { key: 'new' } },
      }),
      jira,
      { points: 'customfield_1', epicLink: null, epicName: null },
      'https://jira.test',
    )

    expect(quest.level).toBeNull()
    expect(quest.experience).toBe(0)
    expect(quest.seriesKey).toBeNull()
    expect(quest.seriesName).toBeNull()
    expect(quest.giver).toBeNull()
    expect(quest.state).toBe('available')
    expect(quest.objective).toBe('Die Stunde der Abrechnung')
  })

  it('refuses an estimate that is not a number', () => {
    const quest = toQuest(issue({ customfield_1: '11' }), jira, { points: 'customfield_1', epicLink: null, epicName: null }, 'https://jira.test')
    expect(quest.points).toBeNull()
    expect(quest.level).toBeNull()
  })

  it('derives the project key from the issue key when the field is missing', () => {
    const quest = toQuest(issue({ project: undefined }), jira, { points: 'customfield_1', epicLink: null, epicName: null }, 'https://jira.test')
    expect(quest.project).toBe('PRO')
  })
})

describe('epicTitle', () => {
  const ids = { points: null, epicLink: null, epicName: 'customfield_10009' }

  it('prefers the short Epic Name the board shows', () => {
    expect(
      epicTitle({ key: 'PRO-100', fields: { summary: 'Langer Titel', customfield_10009: 'Krieg der Dornen' } }, ids),
    ).toBe('Krieg der Dornen')
  })

  it('falls back to the summary when the field is empty or blank', () => {
    expect(epicTitle({ key: 'PRO-100', fields: { summary: 'Langer Titel', customfield_10009: '  ' } }, ids)).toBe(
      'Langer Titel',
    )
    expect(epicTitle({ key: 'PRO-100', fields: { summary: 'Langer Titel' } }, { ...ids, epicName: null })).toBe(
      'Langer Titel',
    )
  })

  it('falls back to the key rather than printing an empty heading', () => {
    expect(epicTitle({ key: 'PRO-100', fields: {} }, ids)).toBe('PRO-100')
  })
})

describe('pickEpicLinkField', () => {
  const catalogue = [
    { id: 'customfield_9', name: 'Sprint' },
    { id: 'customfield_10008', name: 'Epic Link' },
    { id: 'customfield_10009', name: 'Epic Name' },
  ]

  it('finds the two agile fields by name', () => {
    expect(pickEpicLinkField(catalogue)).toBe('customfield_10008')
    expect(pickEpicNameField(catalogue)).toBe('customfield_10009')
  })

  // The field name follows the Jira language, not the API. Measured on our own
  // instance: "Epic-Verknüpfung" and "Epic-Name".
  it('finds them on a German instance', () => {
    const german = [
      { id: 'customfield_10431', name: 'Epic-Verknüpfung' },
      { id: 'customfield_10433', name: 'Epic-Name' },
      { id: 'customfield_10432', name: 'Epic-Status' },
      { id: 'customfield_14430', name: 'Epic Progress' },
    ]
    expect(pickEpicLinkField(german)).toBe('customfield_10431')
    expect(pickEpicNameField(german)).toBe('customfield_10433')
  })

  it('does not mistake the neighbouring epic fields for the link', () => {
    expect(pickEpicLinkField([{ id: 'x', name: 'Epic-Status' }])).toBeNull()
    expect(pickEpicLinkField([{ id: 'x', name: 'Epic Progress' }])).toBeNull()
    expect(pickEpicNameField([{ id: 'x', name: 'Epic-Farbe' }])).toBeNull()
  })

  it('ignores case and padding, the way Jira hands names out', () => {
    expect(pickEpicLinkField([{ id: 'x', name: '  EPIC LINK ' }])).toBe('x')
  })

  it('gives up when the instance has neither', () => {
    expect(pickEpicLinkField([{ id: 'x', name: 'Sprint' }])).toBeNull()
    expect(pickEpicNameField([])).toBeNull()
  })
})

describe('toQuest and the epic', () => {
  const ids = { points: 'customfield_1', epicLink: 'customfield_10008', epicName: null }

  // The agile API resolves the epic itself and hands over key and name in one
  // go - no field name to guess, no second query for the title.
  it('takes the epic the agile API already resolved', () => {
    const quest = toQuest(
      issue({
        parent: undefined,
        epic: { key: 'EAT-1649', name: 'PI Planning 10/26', summary: 'PI-Planning 10/26' },
      }),
      jira,
      ids,
      'https://jira.test',
    )
    expect(quest.seriesKey).toBe('EAT-1649')
    // The epic's own name, not its summary - that is what the board shows.
    expect(quest.seriesName).toBe('PI Planning 10/26')
  })

  it('falls back to the epic summary when it carries no name', () => {
    const quest = toQuest(
      issue({ parent: undefined, epic: { key: 'EAT-1649', summary: 'PI-Planning 10/26' } }),
      jira,
      ids,
      'https://jira.test',
    )
    expect(quest.seriesName).toBe('PI-Planning 10/26')
  })

  it('lets the agile epic win over both other routes', () => {
    const quest = toQuest(
      issue({ epic: { key: 'EAT-1649', name: 'PI Planning' }, customfield_10008: 'PRO-200' }),
      jira,
      ids,
      'https://jira.test',
    )
    expect(quest.seriesKey).toBe('EAT-1649')
  })

  it('stays orphaned when the agile API says there is no epic', () => {
    const quest = toQuest(issue({ parent: undefined, epic: null }), jira, ids, 'https://jira.test')
    expect(quest.seriesKey).toBeNull()
  })

  it('reads the epic from the Epic Link field, as Data Center stores it', () => {
    const quest = toQuest(
      issue({ parent: undefined, customfield_10008: 'PRO-100' }),
      jira,
      ids,
      'https://jira.test',
    )
    expect(quest.seriesKey).toBe('PRO-100')
    // The link carries no title; that is looked up later.
    expect(quest.seriesName).toBeNull()
  })

  it('still prefers parent, which is what Cloud fills in', () => {
    const quest = toQuest(issue({ customfield_10008: 'PRO-999' }), jira, ids, 'https://jira.test')
    expect(quest.seriesKey).toBe('PRO-100')
    expect(quest.seriesName).toBe('Krieg der Dornen')
  })

  it('takes the key out of an object, should the field hand one over', () => {
    const quest = toQuest(
      issue({ parent: undefined, customfield_10008: { key: 'PRO-200' } }),
      jira,
      ids,
      'https://jira.test',
    )
    expect(quest.seriesKey).toBe('PRO-200')
  })

  it('stays orphaned when nothing links an epic', () => {
    const quest = toQuest(issue({ parent: undefined }), jira, ids, 'https://jira.test')
    expect(quest.seriesKey).toBeNull()
  })
})

describe('fieldList', () => {
  it('asks for the agile fields as well, without repeating one', () => {
    const asked = fieldList({ points: 'cf_1', epicLink: 'cf_2', epicName: 'cf_1' }).split(',')
    expect(asked).toContain('cf_1')
    expect(asked).toContain('cf_2')
    expect(asked.filter((name) => name === 'cf_1')).toHaveLength(1)
  })
})

describe('validateNewQuest', () => {
  it('trims and keeps the values', () => {
    expect(validateNewQuest({ title: '  Hilf mir  ', points: 3, priority: 'Major' })).toEqual({
      title: 'Hilf mir',
      description: '',
      points: 3,
      priority: 'Major',
    })
  })

  it('refuses a quest without a title', () => {
    expect(() => validateNewQuest({ title: '   ' })).toThrow(/without a title/)
  })

  it('refuses a title longer than Jira allows', () => {
    expect(() => validateNewQuest({ title: 'x'.repeat(256) })).toThrow(/255/)
  })

  it('refuses a negative estimate', () => {
    expect(() => validateNewQuest({ title: 'a', points: -1 })).toThrow(/from 0 upwards/)
  })
})

describe('createBody', () => {
  const quest = { title: 'Hilf mir', description: 'Eins\n\nZwei', points: 3, priority: 'Major' }

  it('builds the Data Center body with plain text', () => {
    expect(createBody(page, quest, 'customfield_1', 'server')).toEqual({
      fields: {
        project: { key: 'PRO' },
        issuetype: { name: 'Task' },
        summary: 'Hilf mir',
        labels: ['questlog'],
        priority: { name: 'Major' },
        customfield_1: 3,
        description: 'Eins\n\nZwei',
      },
    })
  })

  it('wraps the description in ADF for Cloud', () => {
    const body = createBody(page, quest, 'customfield_1', 'cloud') as any
    expect(body.fields.description.type).toBe('doc')
    expect(body.fields.description.content).toHaveLength(2)
  })

  it('never sets a reporter — Jira stamps the token owner', () => {
    const body = createBody(page, quest, null, 'server') as any
    expect(body.fields.reporter).toBeUndefined()
    expect(body.fields.customfield_1).toBeUndefined()
  })

  it('leaves out an empty description and empty labels', () => {
    const bare: PageConfig = { ...page, create: { project: 'PRO', issueType: 'Bug', labels: [] } }
    const body = createBody(bare, { ...quest, description: '' }, null, 'server') as any
    expect(body.fields.description).toBeUndefined()
    expect(body.fields.labels).toBeUndefined()
  })
})

const ok = (payload: unknown) => ({ ok: true, json: async () => payload })

describe('fetchPage', () => {
  it('reads the active sprint of a board page', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/board/7/sprint')) return ok({ values: [{ id: 99, name: 'Sprint 12' }] })
      if (url.includes('/sprint/99/issue')) return ok({ issues: [issue()] })
      throw new Error(`unerwartet: ${url}`)
    })

    const payload = await fetchPage(jira, page, { token: 't', email: null }, {
      fetch: fetchMock as any,
    })

    expect(payload.chapter).toBe('Sprint 12')
    expect(payload.jql).toBe('sprint = 99')
    expect(payload.series).toHaveLength(1)
    expect(payload.series[0]!.name).toBe('Krieg der Dornen')
    expect(payload.series[0]!.webUrl).toBe('https://jira.test/browse/PRO-100')
    expect(payload.total).toBe(1)
    expect(payload.complete).toBe(0)
    expect(payload.page.canCreate).toBe(true)
  })

  it('counts finished quests for the header', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/board/7/sprint')) return ok({ values: [{ id: 99, name: 'Sprint 12' }] })
      if (url.includes('/sprint/99/issue'))
        return ok({
          issues: [
            issue(),
            issue({ status: { name: 'Done', statusCategory: { key: 'done' } } }),
          ],
        })
      throw new Error(`unerwartet: ${url}`)
    })

    const payload = await fetchPage(jira, page, { token: 't', email: null }, {
      fetch: fetchMock as any,
    })
    expect(payload).toMatchObject({ total: 2, complete: 1 })
  })

  it('turns epics into series headers instead of rows', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/board/7/sprint')) return ok({ values: [{ id: 99, name: 'Sprint 12' }] })
      if (url.includes('/sprint/99/issue'))
        return ok({
          issues: [
            issue({ issuetype: { name: 'Epic' }, summary: 'Krieg der Dornen', parent: undefined }),
            issue(),
            issue({ parent: undefined }),
          ],
        })
      throw new Error(`unerwartet: ${url}`)
    })

    const payload = await fetchPage(jira, page, { token: 't', email: null }, {
      fetch: fetchMock as any,
    })

    // The epic is gone from the rows and names the series its story hangs under.
    expect(payload.total).toBe(2)
    expect(payload.series.map((entry) => entry.name)).toEqual(['Krieg der Dornen', null])
    expect(payload.series[0]!.quests).toHaveLength(1)
  })

  it('also drops an epic recognised by its hierarchy level', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/board/7/sprint')) return ok({ values: [{ id: 99, name: 'Sprint 12' }] })
      if (url.includes('/sprint/99/issue'))
        return ok({
          issues: [issue({ issuetype: { name: 'Initiative', hierarchyLevel: 1 } }), issue()],
        })
      throw new Error(`unerwartet: ${url}`)
    })

    const payload = await fetchPage(jira, page, { token: 't', email: null }, {
      fetch: fetchMock as any,
    })
    expect(payload.total).toBe(1)
  })

  it('asks the sprint for the resolved epic alongside the plain fields', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/field')) return ok([])
      if (url.includes('/board/7/sprint')) return ok({ values: [{ id: 99, name: 'Sprint 12' }] })
      if (url.includes('/sprint/99/issue'))
        return ok({
          issues: [issue({ parent: undefined, epic: { key: 'EAT-1', name: 'PI Planning' } })],
        })
      if (url.includes('key%20in'))
        return ok({ issues: [{ key: 'EAT-1', fields: { summary: 'Langer Jira-Titel' } }] })
      throw new Error(`unerwartet: ${url}`)
    })

    const payload = await fetchPage(jira, page, { token: 't', email: null }, {
      fetch: fetchMock as any,
    })

    const asked = fetchMock.mock.calls.find(([url]) => url.includes('/sprint/99/issue'))![0]
    expect(asked).toContain('fields=')
    expect(asked).toContain('epic')
    // The agile API already named it; the epic search does not overwrite that.
    expect(payload.series[0]!.name).toBe('PI Planning')
  })

  it('names the series it only got a key for', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/field'))
        return ok([
          { id: 'customfield_1', name: 'Story Points' },
          { id: 'customfield_10008', name: 'Epic Link' },
          { id: 'customfield_10009', name: 'Epic Name' },
        ])
      if (url.includes('/board/7/sprint')) return ok({ values: [{ id: 99, name: 'Sprint 12' }] })
      if (url.includes('/sprint/99/issue'))
        return ok({ issues: [issue({ parent: undefined, customfield_10008: 'PRO-100' })] })
      if (url.includes('key%20in')) {
        return ok({
          issues: [{ key: 'PRO-100', fields: { summary: 'Egal', customfield_10009: 'Krieg der Dornen' } }],
        })
      }
      throw new Error(`unerwartet: ${url}`)
    })

    const payload = await fetchPage(jira, page, { token: 't', email: null }, {
      fetch: fetchMock as any,
    })

    // The Epic Name wins over the summary - that is the epic's own title.
    expect(payload.series[0]!.name).toBe('Krieg der Dornen')
    expect(payload.series[0]!.webUrl).toBe('https://jira.test/browse/PRO-100')
  })

  it('keeps the name a story brought, even when the epic search says otherwise', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/field')) return ok([{ id: 'customfield_10008', name: 'Epic Link' }])
      if (url.includes('/board/7/sprint')) return ok({ values: [{ id: 99, name: 'Sprint 12' }] })
      if (url.includes('/sprint/99/issue'))
        return ok({
          issues: [
            // One brought its epic along, one only a key.
            issue(),
            issue({ key: 'PRO-43', parent: undefined, customfield_10008: 'PRO-200' }),
          ],
        })
      if (url.includes('key%20in'))
        return ok({
          issues: [
            { key: 'PRO-100', fields: { summary: 'Langer Jira-Titel' } },
            { key: 'PRO-200', fields: { summary: 'Zweite Front' } },
          ],
        })
      throw new Error(`unerwartet: ${url}`)
    })

    const payload = await fetchPage(jira, page, { token: 't', email: null }, {
      fetch: fetchMock as any,
    })

    expect(payload.series.map((entry) => entry.name)).toEqual([
      'Krieg der Dornen',
      'Zweite Front',
    ])
    // Both are asked about now: the sheet needs the body, not only the name.
    const asked = fetchMock.mock.calls.find(([url]) => url.includes('key%20in'))![0]
    expect(asked).toContain('PRO-100')
    expect(asked).toContain('PRO-200')
  })

  it('falls back to the key when the epic cannot be read', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/field')) return ok([{ id: 'customfield_10008', name: 'Epic Link' }])
      if (url.includes('/board/7/sprint')) return ok({ values: [{ id: 99, name: 'Sprint 12' }] })
      if (url.includes('/sprint/99/issue'))
        return ok({ issues: [issue({ parent: undefined, customfield_10008: 'PRO-100' })] })
      // A series named after its key still reads; an empty book does not.
      return { ok: false, status: 403, statusText: 'Forbidden', text: async () => '' }
    })

    const payload = await fetchPage(jira, page, { token: 't', email: null }, {
      fetch: fetchMock as any,
    })
    expect(payload.series[0]!.name).toBe('PRO-100')
  })

  /*
   * The search used to run only for series without a name. It runs always now:
   * the sheet on the right prints the epic, and a name alone is not a sheet.
   */
  it('hangs the epic with its own text on the series', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/field')) return ok([])
      if (url.includes('/board/7/sprint')) return ok({ values: [{ id: 99, name: 'Sprint 12' }] })
      if (url.includes('/sprint/99/issue')) return ok({ issues: [issue()] })
      if (url.includes('key%20in'))
        return ok({
          issues: [
            {
              key: 'PRO-100',
              fields: {
                summary: 'Krieg der Dornen',
                description: 'Die Horde marschiert.\n\nHalte die Linie.',
                status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
                reporter: { displayName: 'Anduin Wrynn' },
                project: { key: 'PRO', name: 'Produkt' },
              },
            },
          ],
        })
      throw new Error(`unerwartet: ${url}`)
    })

    const payload = await fetchPage(jira, page, { token: 't', email: null }, {
      fetch: fetchMock as any,
    })

    const epic = payload.series[0]!.epic!
    expect(epic.key).toBe('PRO-100')
    expect(epic.title).toBe('Krieg der Dornen')
    expect(epic.objective).toBe('Die Horde marschiert.')
    expect(epic.description).toBe('Halte die Linie.')
    expect(epic.giver).toBe('Anduin Wrynn')
  })

  it('counts the whole chain into the reward of its epic', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/field')) return ok([])
      if (url.includes('/board/7/sprint')) return ok({ values: [{ id: 99, name: 'Sprint 12' }] })
      if (url.includes('/sprint/99/issue'))
        return ok({ issues: [issue(), issue({ key: 'PRO-43', customfield_1: 5 })] })
      if (url.includes('key%20in'))
        return ok({ issues: [{ key: 'PRO-100', fields: { summary: 'Krieg der Dornen' } }] })
      throw new Error(`unerwartet: ${url}`)
    })

    const payload = await fetchPage(jira, page, { token: 't', email: null }, {
      fetch: fetchMock as any,
    })

    // 11 from the first story, 5 from the second - the epic estimates nothing.
    expect(payload.series[0]!.epic!.points).toBe(16)
  })

  it('leaves the epic null when Jira hands none over', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/field')) return ok([])
      if (url.includes('/board/7/sprint')) return ok({ values: [{ id: 99, name: 'Sprint 12' }] })
      if (url.includes('/sprint/99/issue')) return ok({ issues: [issue()] })
      if (url.includes('key%20in')) return { ok: false, status: 403, statusText: 'Forbidden' }
      throw new Error(`unerwartet: ${url}`)
    })

    const payload = await fetchPage(jira, page, { token: 't', email: null }, {
      fetch: fetchMock as any,
    })

    // The series still reads, it only has no sheet to open.
    expect(payload.series[0]!.name).toBe('Krieg der Dornen')
    expect(payload.series[0]!.epic).toBeNull()
  })

  it('uses the configured JQL instead of a board', async () => {
    const fetchMock = vi.fn(async (url: string) => { void url; return ok({ issues: [issue()] }) })
    const jqlPage: PageConfig = { ...page, boardId: null, jql: 'labels = sidequest' }

    const payload = await fetchPage(jira, jqlPage, { token: 't', email: null }, {
      fetch: fetchMock as any,
    })

    expect(payload.jql).toBe('labels = sidequest')
    // Not calls[0]: the field catalogue is fetched first. Look for the search.
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls.some((url) => url.includes('labels%20%3D%20sidequest'))).toBe(true)
  })

  it('says so when a board has no running sprint', async () => {
    const fetchMock = vi.fn(async () => ok({ values: [] }))
    await expect(
      fetchPage(jira, page, { token: 't', email: null }, { fetch: fetchMock as any }),
    ).rejects.toThrow(/no running sprint/)
  })

  it('refuses a page with neither board nor JQL', async () => {
    const empty: PageConfig = { ...page, boardId: null, jql: null }
    await expect(
      fetchPage(jira, empty, { token: 't', email: null }, { fetch: vi.fn() as any }),
    ).rejects.toThrow(/neither boardId nor jql/)
  })
})

describe('pickTransition', () => {
  const doing = ['indeterminate']

  it('takes the first transition into the running column', () => {
    expect(
      pickTransition(
        [
          { id: '1', name: 'Close', to: { name: 'Done', statusCategory: { key: 'done' } } },
          { id: '2', name: 'Start', to: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } },
        ],
        doing,
      )?.id,
    ).toBe('2')
  })

  it('finds none when the workflow offers none', () => {
    expect(
      pickTransition([{ id: '1', name: 'Close', to: { statusCategory: { key: 'done' } } }], doing),
    ).toBeNull()
  })
})

describe('acceptQuest', () => {
  const taking = (transitions: unknown[]) =>
    vi.fn(async (url: string, init?: any) => {
      if (url.endsWith('/myself')) return ok({ name: 'jbeck', displayName: 'Julien Beck' })
      if (url.endsWith('/transitions') && init?.method !== 'POST') return ok({ transitions })
      return { ok: true, status: 204, json: async () => ({}), text: async () => '' }
    })

  it('assigns the issue to the caller and starts it', async () => {
    const fetchMock = taking([
      { id: '7', name: 'Start', to: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } },
    ])

    const taken = await acceptQuest(jira, { token: 't', email: null }, { fetch: fetchMock as any }, 'PRO-42')

    expect(taken).toEqual({ key: 'PRO-42', status: 'In Progress', assignee: 'Julien Beck' })
    const calls = fetchMock.mock.calls.map(([url]) => url)
    expect(calls).toContain('https://jira.test/rest/api/2/issue/PRO-42/assignee')
    // Data Center wants the username; accountId is Cloud only.
    const assign = fetchMock.mock.calls.find(([url]) => url.endsWith('/assignee'))!
    expect(JSON.parse((assign[1] as any).body)).toEqual({ name: 'jbeck' })
    expect((assign[1] as any).method).toBe('PUT')
  })

  it('still takes the quest when no transition fits', async () => {
    const fetchMock = taking([{ id: '9', name: 'Close', to: { statusCategory: { key: 'done' } } }])

    const taken = await acceptQuest(jira, { token: 't', email: null }, { fetch: fetchMock as any }, 'PRO-42')

    expect(taken.status).toBeNull()
    expect(fetchMock.mock.calls.filter(([, init]) => (init as any)?.method === 'POST')).toHaveLength(0)
  })

  it('refuses something that is not an issue key', async () => {
    await expect(
      acceptQuest(jira, { token: 't', email: null }, { fetch: vi.fn() as any }, '../secrets'),
    ).rejects.toThrow(/Not a Jira issue key/)
  })
})

describe('completeQuest', () => {
  const handing = (transitions: unknown[]) =>
    vi.fn(async (url: string, init?: any) => {
      if (url.endsWith('/transitions') && init?.method !== 'POST') return ok({ transitions })
      return { ok: true, status: 204, json: async () => ({}), text: async () => '' }
    })

  it('moves the issue into the done column', async () => {
    const fetchMock = handing([
      { id: '3', name: 'Start', to: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } },
      { id: '9', name: 'Close', to: { name: 'Done', statusCategory: { key: 'done' } } },
    ])

    const handed = await completeQuest(jira, { token: 't', email: null }, { fetch: fetchMock as any }, 'PRO-42')

    expect(handed).toEqual({ key: 'PRO-42', status: 'Done' })
    const posted = fetchMock.mock.calls.find(([, init]) => (init as any)?.method === 'POST')!
    expect(posted[0]).toBe('https://jira.test/rest/api/2/issue/PRO-42/transitions')
    expect(JSON.parse((posted[1] as any).body)).toEqual({ transition: { id: '9' } })
  })

  it('leaves the assignee alone', async () => {
    const fetchMock = handing([{ id: '9', name: 'Close', to: { statusCategory: { key: 'done' } } }])

    await completeQuest(jira, { token: 't', email: null }, { fetch: fetchMock as any }, 'PRO-42')

    expect(fetchMock.mock.calls.map(([url]) => url).filter((url) => url.endsWith('/assignee'))).toHaveLength(0)
  })

  it('fails loudly when the workflow offers no way to done', async () => {
    const fetchMock = handing([
      { id: '3', name: 'Start', to: { statusCategory: { key: 'indeterminate' } } },
    ])

    await expect(
      completeQuest(jira, { token: 't', email: null }, { fetch: fetchMock as any }, 'PRO-42'),
    ).rejects.toThrow(/no transition into a done status — offered: Start/)
    expect(fetchMock.mock.calls.filter(([, init]) => (init as any)?.method === 'POST')).toHaveLength(0)
  })

  it('refuses something that is not an issue key', async () => {
    await expect(
      completeQuest(jira, { token: 't', email: null }, { fetch: vi.fn() as any }, '../secrets'),
    ).rejects.toThrow(/Not a Jira issue key/)
  })
})

describe('abandonQuest', () => {
  const back = [
    { id: '3', name: 'Start', to: { statusCategory: { key: 'indeterminate' } } },
    { id: '11', name: 'Reopen', to: { name: 'Open', statusCategory: { key: 'new' } } },
  ]

  const dropping = (transitions: unknown[], assignee: unknown = { name: 'jbeck', accountId: 'acc-1' }) =>
    vi.fn(async (url: string, init?: any) => {
      if (url.endsWith('/myself')) return ok({ name: 'jbeck', accountId: 'acc-1', displayName: 'Julien Beck' })
      if (url.endsWith('?fields=assignee')) return ok({ fields: { assignee } })
      if (url.endsWith('/transitions') && init?.method !== 'POST') return ok({ transitions })
      return { ok: true, status: 204, json: async () => ({}), text: async () => '' }
    })

  const writes = (fetchMock: ReturnType<typeof dropping>) =>
    fetchMock.mock.calls
      .filter(([, init]) => (init as any)?.method === 'POST' || (init as any)?.method === 'PUT')
      .map(([url, init]) => ({ url, method: (init as any).method, body: JSON.parse((init as any).body) }))

  it('moves the quest back into an open status and then lets go of it', async () => {
    const fetchMock = dropping(back)

    const dropped = await abandonQuest(jira, { token: 't', email: null }, { fetch: fetchMock as any }, 'PRO-42')

    expect(dropped).toEqual({ key: 'PRO-42', status: 'Open' })
    expect(writes(fetchMock)).toEqual([
      { url: 'https://jira.test/rest/api/2/issue/PRO-42/transitions', method: 'POST', body: { transition: { id: '11' } } },
      { url: 'https://jira.test/rest/api/2/issue/PRO-42/assignee', method: 'PUT', body: { name: null } },
    ])
  })

  it('clears the account id on Cloud', async () => {
    const fetchMock = dropping(back, { accountId: 'acc-1' })

    await abandonQuest({ ...jira, flavor: 'cloud' }, { token: 't', email: 'j@test' }, { fetch: fetchMock as any }, 'PRO-42')

    expect(writes(fetchMock).at(-1)).toEqual({
      url: 'https://jira.test/rest/api/3/issue/PRO-42/assignee',
      method: 'PUT',
      body: { accountId: null },
    })
  })

  it('leaves somebody else’s quest alone', async () => {
    const fetchMock = dropping(back, { name: 'anna', displayName: 'Anna Berg' })

    await expect(
      abandonQuest(jira, { token: 't', email: null }, { fetch: fetchMock as any }, 'PRO-42'),
    ).rejects.toThrow('PRO-42 belongs to Anna Berg, not to you')
    expect(writes(fetchMock)).toEqual([])
  })

  it('reopens a quest nobody holds', async () => {
    const fetchMock = dropping(back, null)

    await abandonQuest(jira, { token: 't', email: null }, { fetch: fetchMock as any }, 'PRO-42')

    expect(writes(fetchMock).map((write) => write.method)).toEqual(['POST', 'PUT'])
  })

  it('changes nothing when the workflow offers no way back', async () => {
    const fetchMock = dropping([back[0]])

    await expect(
      abandonQuest(jira, { token: 't', email: null }, { fetch: fetchMock as any }, 'PRO-42'),
    ).rejects.toThrow(/no transition into an open status — offered: Start/)
    expect(writes(fetchMock)).toEqual([])
  })

  it('refuses something that is not an issue key', async () => {
    await expect(
      abandonQuest(jira, { token: 't', email: null }, { fetch: vi.fn() as any }, '../secrets'),
    ).rejects.toThrow(/Not a Jira issue key/)
  })
})

describe('createQuest', () => {
  it('posts the issue and returns its address', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url
      void init
      return ok({ key: 'PRO-77' })
    })
    const created = await createQuest(jira, page, { token: 't', email: null }, {
      fetch: fetchMock as any,
    }, { title: 'Hilf mir' })

    expect(created).toEqual({ key: 'PRO-77', webUrl: 'https://jira.test/browse/PRO-77' })
    // Not calls[0]: the field catalogue is fetched first. Look for the POST.
    const posted = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(posted![0]).toBe('https://jira.test/rest/api/2/issue')
  })

  it('refuses a page that hands out no quests', async () => {
    const readOnly: PageConfig = { ...page, create: null }
    await expect(
      createQuest(jira, readOnly, { token: 't', email: null }, { fetch: vi.fn() as any }, {
        title: 'Hilf mir',
      }),
    ).rejects.toThrow(/hands out no quests/)
  })

  it('passes the Jira complaint on', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'issuetype is required',
    }))
    await expect(
      createQuest(jira, page, { token: 't', email: null }, { fetch: fetchMock as any }, {
        title: 'Hilf mir',
      }),
    ).rejects.toThrow(/issuetype is required/)
  })
})
