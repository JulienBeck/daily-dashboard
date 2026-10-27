import { describe, expect, it } from 'vitest'
import { isIssueCount, toBurndown, type ScopeChangeChart } from './burndown.js'

const START = Date.parse('2026-10-12T08:00:00.000Z')
const END = Date.parse('2026-10-23T16:00:00.000Z')
const day = (offset: number) => String(START + offset * 86_400_000)

const sprint = { name: 'Sprint 42', startDate: new Date(START).toISOString(), endDate: new Date(END).toISOString() }

const chart: ScopeChangeChart = {
  startTime: START,
  endTime: END,
  now: START + 5 * 86_400_000,
  statisticField: { fieldId: 'customfield_10002' },
  changes: {
    [String(START)]: [
      { key: 'AI-1', added: true, statC: { newValue: 5 } },
      { key: 'AI-2', added: true, statC: { newValue: 8 } },
      { key: 'AI-3', added: true, statC: { newValue: 3 } },
    ],
    [day(2)]: [{ key: 'AI-1', column: { done: true } }],
    [day(3)]: [{ key: 'AI-4', added: true, statC: { newValue: 2 } }],
    [day(4)]: [{ key: 'AI-2', column: { done: true } }],
  },
}

const remainingAt = (result: ReturnType<typeof toBurndown>, index: number) =>
  result.points[index]!.remaining

describe('isIssueCount', () => {
  it('counts issues when the board estimates by issue count', () => {
    expect(isIssueCount({ statisticField: { fieldId: 'issueCount_' } })).toBe(true)
  })

  it('counts issues when Jira names no estimation field at all', () => {
    expect(isIssueCount({})).toBe(true)
  })

  it('sums the estimate when the board has a points field', () => {
    expect(isIssueCount({ statisticField: { fieldId: 'customfield_10002' } })).toBe(false)
  })
})

describe('toBurndown', () => {
  it('starts at the scope the sprint was committed with', () => {
    const result = toBurndown(chart, sprint, new Date(START))
    expect(result.startScope).toBe(16)
    expect(remainingAt(result, 0)).toBe(16)
  })

  it('burns the estimate down when an issue reaches the done column', () => {
    const result = toBurndown(chart, sprint, new Date(START))
    expect(remainingAt(result, 1)).toBe(11)
    expect(remainingAt(result, 3)).toBe(5)
  })

  it('raises the line again when scope is added mid-sprint', () => {
    const result = toBurndown(chart, sprint, new Date(START))
    expect(remainingAt(result, 2)).toBe(13)
    expect(result.scope).toBe(18)
  })

  it('puts an issue back on the line when it leaves the done column', () => {
    const reopened: ScopeChangeChart = {
      ...chart,
      changes: { ...chart.changes, [day(5)]: [{ key: 'AI-1', column: { notDone: true } }] },
    }
    const result = toBurndown(reopened, sprint, new Date(START))
    expect(remainingAt(result, 4)).toBe(10)
  })

  it('drops an issue that was pulled out of the sprint again', () => {
    const removed: ScopeChangeChart = {
      ...chart,
      changes: { ...chart.changes, [day(5)]: [{ key: 'AI-3', added: false }] },
    }
    const result = toBurndown(removed, sprint, new Date(START))
    expect(remainingAt(result, 4)).toBe(2)
    expect(result.scope).toBe(15)
  })

  it('keeps the estimate when a change only moves the column', () => {
    const result = toBurndown(chart, sprint, new Date(START))
    expect(result.points).toHaveLength(4)
    expect(remainingAt(result, 3)).toBe(5)
  })

  it('follows a re-estimate without losing the issue', () => {
    const regraded: ScopeChangeChart = {
      ...chart,
      changes: { ...chart.changes, [day(5)]: [{ key: 'AI-3', statC: { newValue: 13 } }] },
    }
    const result = toBurndown(regraded, sprint, new Date(START))
    expect(remainingAt(result, 4)).toBe(15)
  })

  it('treats a cleared estimate as zero instead of keeping the old one', () => {
    const cleared: ScopeChangeChart = {
      ...chart,
      changes: { ...chart.changes, [day(5)]: [{ key: 'AI-3', statC: {} }] },
    }
    const result = toBurndown(cleared, sprint, new Date(START))
    expect(remainingAt(result, 4)).toBe(2)
  })

  it('counts every issue as one when the board estimates by issue count', () => {
    const counted: ScopeChangeChart = { ...chart, statisticField: { fieldId: 'issueCount_' } }
    const result = toBurndown(counted, sprint, new Date(START))
    expect(result.unit).toBe('issues')
    expect(result.startScope).toBe(3)
    expect(remainingAt(result, 1)).toBe(2)
  })

  it('walks the changes in time order even when Jira lists them unsorted', () => {
    const shuffled: ScopeChangeChart = {
      ...chart,
      changes: {
        [day(4)]: chart.changes![day(4)]!,
        [String(START)]: chart.changes![String(START)]!,
        [day(3)]: chart.changes![day(3)]!,
        [day(2)]: chart.changes![day(2)]!,
      },
    }
    const result = toBurndown(shuffled, sprint, new Date(START))
    expect(result.points.map((point) => point.remaining)).toEqual([16, 11, 13, 5])
  })

  it('ignores a change that names no issue', () => {
    const noisy: ScopeChangeChart = {
      ...chart,
      changes: { ...chart.changes, [day(5)]: [{ column: { done: true } }] },
    }
    const result = toBurndown(noisy, sprint, new Date(START))
    expect(remainingAt(result, 4)).toBe(5)
  })

  it('takes the sprint dates from the agile API when the chart carries none', () => {
    const undated: ScopeChangeChart = { ...chart, startTime: undefined, endTime: undefined }
    const result = toBurndown(undated, sprint, new Date(START))
    expect(result.start).toBe(sprint.startDate)
    expect(result.end).toBe(sprint.endDate)
  })

  it('survives a sprint Jira has no history for', () => {
    const result = toBurndown({ startTime: START, endTime: END }, sprint, new Date(START))
    expect(result.points).toEqual([])
    expect(result.startScope).toBe(0)
    expect(result.scope).toBe(0)
  })

  it('counts a change made exactly at the sprint start into the committed scope', () => {
    const planned: ScopeChangeChart = {
      ...chart,
      changes: {
        [String(START - 86_400_000)]: [{ key: 'AI-0', added: true, statC: { newValue: 4 } }],
        ...chart.changes,
      },
    }
    const result = toBurndown(planned, sprint, new Date(START))
    expect(result.startScope).toBe(20)
  })

  it('falls back to the first change when nothing happened before the sprint start', () => {
    const late: ScopeChangeChart = {
      startTime: START,
      endTime: END,
      statisticField: { fieldId: 'customfield_10002' },
      changes: { [day(1)]: [{ key: 'AI-9', added: true, statC: { newValue: 7 } }] },
    }
    const result = toBurndown(late, sprint, new Date(START))
    expect(result.startScope).toBe(7)
  })
})
