import { describe, expect, it } from 'vitest'
import {
  applyFilter,
  bySeries,
  chainReward,
  coinsFor,
  countComplete,
  difficultyOf,
  experienceOf,
  formatLevel,
  levelOf,
  splitCoins,
  stateOf,
} from './quest.js'
import type { Quest, Series } from './types.js'

const quest = (over: Partial<Quest>): Quest => ({
  key: 'PRO-1',
  title: 'Titel',
  project: 'PRO',
  projectName: 'Produkt',
  seriesKey: 'PRO-100',
  seriesName: 'Krieg der Dornen',
  level: 30,
  difficulty: 'standard',
  state: 'available',
  points: 3,
  priority: 'Major',
  issueType: 'Task',
  status: 'Open',
  assignee: null,
  giver: null,
  objective: '',
  description: '',
  labels: [],
  experience: 450,
  coins: { gold: 0, silver: 0, copper: 0 },
  webUrl: 'https://jira/browse/PRO-1',
  ...over,
})

describe('levelOf', () => {
  it('scales story points by ten', () => {
    expect(levelOf(11)).toBe(110)
    expect(levelOf(0.5)).toBe(5)
  })

  it('has no level without an estimate', () => {
    expect(levelOf(null)).toBeNull()
    expect(levelOf(0)).toBeNull()
    expect(levelOf(Number.NaN)).toBeNull()
  })
})

describe('difficultyOf', () => {
  it('rises with the estimate', () => {
    expect(difficultyOf(1)).toBe('trivial')
    expect(difficultyOf(2)).toBe('easy')
    expect(difficultyOf(3)).toBe('easy')
    expect(difficultyOf(4)).toBe('standard')
    expect(difficultyOf(5)).toBe('standard')
    expect(difficultyOf(8)).toBe('difficult')
    expect(difficultyOf(13)).toBe('deadly')
  })

  it('treats an unestimated story as standard, not as trivial', () => {
    expect(difficultyOf(null)).toBe('standard')
  })
})

describe('stateOf', () => {
  const done = ['done']
  const doing = ['indeterminate']

  it('maps the Jira status category', () => {
    expect(stateOf('done', done, doing)).toBe('complete')
    expect(stateOf('indeterminate', done, doing)).toBe('active')
    expect(stateOf('new', done, doing)).toBe('available')
    expect(stateOf('', done, doing)).toBe('available')
  })
})

describe('experienceOf', () => {
  it('pays fifteen per level', () => {
    expect(experienceOf(110)).toBe(1650)
    expect(experienceOf(null)).toBe(0)
  })
})

describe('splitCoins', () => {
  it('breaks copper into gold and silver', () => {
    expect(splitCoins(125000)).toEqual({ gold: 12, silver: 50, copper: 0 })
    expect(splitCoins(94)).toEqual({ gold: 0, silver: 0, copper: 94 })
    expect(splitCoins(-5)).toEqual({ gold: 0, silver: 0, copper: 0 })
  })
})

describe('coinsFor', () => {
  it('pays more for a higher priority', () => {
    expect(coinsFor('Blocker').gold).toBeGreaterThan(coinsFor('Major').gold)
    expect(coinsFor('Trivial')).toEqual({ gold: 0, silver: 0, copper: 94 })
  })

  it('ignores case and falls back to medium', () => {
    expect(coinsFor('major')).toEqual(coinsFor('Major'))
    expect(coinsFor('Gibt es nicht')).toEqual(coinsFor('Medium'))
    expect(coinsFor(null)).toEqual(coinsFor('Medium'))
  })
})

describe('formatLevel', () => {
  it('shows two question marks without an estimate', () => {
    expect(formatLevel(80)).toBe('[80]')
    expect(formatLevel(null)).toBe('[??]')
  })
})

describe('bySeries', () => {
  it('groups stories under their epic and sorts by its name', () => {
    const grouped = bySeries([
      quest({ key: 'PRO-9', seriesKey: 'PRO-200', seriesName: 'Zweite Front' }),
      quest({ key: 'PRO-1', seriesKey: 'PRO-100', seriesName: 'Krieg der Dornen' }),
      quest({ key: 'PRO-2', seriesKey: 'PRO-100', seriesName: 'Krieg der Dornen' }),
    ])

    expect(grouped.map((entry) => entry.name)).toEqual(['Krieg der Dornen', 'Zweite Front'])
    expect(grouped[0]!.quests.map((entry) => entry.key)).toEqual(['PRO-1', 'PRO-2'])
  })

  it('gives a named series the address of its epic', () => {
    const grouped = bySeries([quest({})], 'https://jira.test')
    expect(grouped[0]!.webUrl).toBe('https://jira.test/browse/PRO-100')
  })

  it('leaves the bucket without an epic without an address', () => {
    const grouped = bySeries([quest({ seriesKey: null, seriesName: null })], 'https://jira.test')
    expect(grouped[0]!.webUrl).toBeNull()
  })

  it('keeps the incoming order inside a series', () => {
    const grouped = bySeries([quest({ key: 'PRO-9' }), quest({ key: 'PRO-2' })])
    expect(grouped[0]!.quests.map((entry) => entry.key)).toEqual(['PRO-9', 'PRO-2'])
  })

  it('collects stories without an epic and puts them last', () => {
    // "Zweite Front" sorts after "Ohne Reihe", so only the explicit rule — not
    // the alphabet — can keep the bucket at the end.
    const order = (quests: Quest[]) => bySeries(quests).map((entry) => entry.name)
    const named = [
      quest({ key: 'PRO-1', seriesKey: 'PRO-100', seriesName: 'Krieg der Dornen' }),
      quest({ key: 'PRO-9', seriesKey: 'PRO-200', seriesName: 'Zweite Front' }),
    ]
    const loose = [
      quest({ key: 'PRO-5', seriesKey: null, seriesName: null }),
      quest({ key: 'PRO-6', seriesKey: null, seriesName: null }),
    ]
    // The bucket carries no name; what it is called is the interface's business.
    const expected = ['Krieg der Dornen', 'Zweite Front', null]

    // Three orders, because the comparator sees the bucket sometimes on the
    // left and sometimes on the right. The last one matters most: "Zweite
    // Front" sorts after "Ohne Reihe", so the alphabet alone would get it wrong.
    expect(order([...loose, ...named])).toEqual(expected)
    expect(order([named[0]!, ...loose, named[1]!])).toEqual(expected)
    expect(order([named[1]!, ...loose, named[0]!])).toEqual(expected)

    const grouped = bySeries([...loose, ...named])
    expect(grouped[2]!.quests.map((entry) => entry.key)).toEqual(['PRO-5', 'PRO-6'])
    expect(grouped[2]!.key).toBe('')
  })
})

describe('chainReward', () => {
  const epic = quest({ key: 'PRO-100', points: null, level: null, experience: 0 })

  it('adds the points of the whole chain up', () => {
    const reward = chainReward(epic, [quest({ points: 11 }), quest({ points: 5 })])
    expect(reward.points).toBe(16)
    expect(reward.level).toBe(160)
    expect(reward.experience).toBe(2400)
  })

  it('reads an unestimated chain as unestimated, not as worth nothing', () => {
    const reward = chainReward(epic, [quest({ points: null }), quest({ points: null })])
    expect(reward.points).toBeNull()
    expect(reward.level).toBeNull()
  })

  it('counts a chain in which only some stories carry an estimate', () => {
    expect(chainReward(epic, [quest({ points: 8 }), quest({ points: null })]).points).toBe(8)
  })

  it('leaves everything else of the epic untouched', () => {
    const reward = chainReward(quest({ key: 'PRO-100', title: 'Krieg der Dornen' }), [])
    expect(reward.key).toBe('PRO-100')
    expect(reward.title).toBe('Krieg der Dornen')
  })
})

describe('countComplete', () => {
  it('counts finished quests across all series', () => {
    const series: Series[] = [
      {
        key: 'PRO-100',
        name: 'Krieg der Dornen',
        webUrl: 'https://jira.test/browse/PRO-100',
        epic: null,
        quests: [quest({ state: 'complete' }), quest({ key: 'PRO-2', state: 'active' })],
      },
      { key: 'PRO-200', name: 'Zweite Front', webUrl: 'https://jira.test/browse/PRO-200', epic: null, quests: [quest({ key: 'ZZZ-1', state: 'complete' })] },
    ]
    expect(countComplete(series)).toEqual({ total: 3, complete: 2 })
  })
})

describe('applyFilter', () => {
  const series: Series[] = [
    { key: 'PRO-100', name: 'Krieg der Dornen', webUrl: 'https://jira.test/browse/PRO-100', epic: null, quests: [quest({ state: 'complete' })] },
    { key: 'PRO-200', name: 'Zweite Front', webUrl: 'https://jira.test/browse/PRO-200', epic: null, quests: [quest({ key: 'ZZZ-1', state: 'active' })] },
  ]

  it('keeps everything on all', () => {
    expect(applyFilter(series, 'all')).toHaveLength(2)
  })

  it('drops a series that keeps no quest', () => {
    const filtered = applyFilter(series, 'active')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.key).toBe('PRO-200')
  })

  it('leaves the input untouched', () => {
    applyFilter(series, 'active')
    expect(series[0]!.quests).toHaveLength(1)
  })
})
