import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BurndownPayload } from '../../shared/types.js'
import { Burndown, idealRemaining, maxScope, stepPath, withNow } from './Burndown.js'

const payload: BurndownPayload = {
  sprintName: 'Sprint 42',
  start: '2026-10-12T08:00:00.000Z',
  end: '2026-10-22T08:00:00.000Z',
  now: '2026-10-17T08:00:00.000Z',
  points: [
    { at: '2026-10-12T08:00:00.000Z', remaining: 16 },
    { at: '2026-10-14T08:00:00.000Z', remaining: 11 },
    { at: '2026-10-16T08:00:00.000Z', remaining: 5 },
  ],
  startScope: 16,
  scope: 16,
  unit: 'points',
}

describe('maxScope', () => {
  it('takes the highest the line ever reached, not just the start', () => {
    expect(maxScope({ ...payload, startScope: 10 })).toBe(16)
  })

  it('keeps the committed scope on the axis even after the line fell below it', () => {
    expect(maxScope({ ...payload, points: payload.points.slice(2) })).toBe(16)
  })

  it('never collapses the axis to zero on an empty sprint', () => {
    expect(maxScope({ ...payload, points: [], startScope: 0 })).toBe(1)
  })
})

describe('idealRemaining', () => {
  it('is the full scope at the sprint start', () => {
    expect(idealRemaining(payload, payload.start)).toBe(16)
  })

  it('is zero at the sprint end', () => {
    expect(idealRemaining(payload, payload.end)).toBe(0)
  })

  it('halves the scope at half time', () => {
    expect(idealRemaining(payload, '2026-10-17T08:00:00.000Z')).toBe(8)
  })

  it('does not run negative past the sprint end', () => {
    expect(idealRemaining(payload, '2026-11-01T08:00:00.000Z')).toBe(0)
  })

  it('has no slope to measure when start and end fall together', () => {
    expect(idealRemaining({ ...payload, end: payload.start }, payload.now)).toBeNull()
  })
})

describe('stepPath', () => {
  const x = (at: string) => (Date.parse(at) - Date.parse(payload.start)) / 86_400_000
  const y = (value: number) => 100 - value

  it('holds the value until the next change instead of sloping', () => {
    expect(stepPath(payload.points, x, y)).toBe('M 0 84 H 2 V 89 H 4 V 95')
  })

  it('draws nothing when there is no history', () => {
    expect(stepPath([], x, y)).toBe('')
  })

  it('places a single change without a step', () => {
    expect(stepPath([payload.points[0]!], x, y)).toBe('M 0 84')
  })
})

describe('withNow', () => {
  it('carries the last value forward to today', () => {
    const series = withNow(payload)
    expect(series).toHaveLength(4)
    expect(series[3]).toEqual({ at: payload.now, remaining: 5 })
  })

  it('adds nothing when the last change is newer than the clock', () => {
    expect(withNow({ ...payload, now: '2026-10-15T08:00:00.000Z' })).toHaveLength(3)
  })

  it('does not duplicate the point when a change lands on the clock itself', () => {
    expect(withNow({ ...payload, now: '2026-10-16T08:00:00.000Z' })).toHaveLength(3)
  })

  it('stays empty when Jira sent no history', () => {
    expect(withNow({ ...payload, points: [] })).toEqual([])
  })
})

describe('Burndown', () => {
  it('names the gap to the ideal line in the heading', () => {
    render(<Burndown payload={payload} />)
    expect(screen.getByText('−3.0 P')).toBeInTheDocument()
  })

  it('marks a sprint that is behind in the warning colour', () => {
    render(<Burndown payload={{ ...payload, points: [{ at: payload.start, remaining: 16 }] }} />)
    expect(screen.getByText('+8.0 P')).toHaveClass('text-serious')
  })

  it('spells the remaining work out in the chart label, not only in colour', () => {
    render(<Burndown payload={payload} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Burndown: noch 5 P von 16 P, 3.0 P vor der Ideallinie',
    )
  })

  it('labels both lines, so the dashed one is never guesswork', () => {
    render(<Burndown payload={payload} />)
    expect(screen.getByText(/Rest 5/)).toBeInTheDocument()
    expect(screen.getByText('Ideal')).toBeInTheDocument()
  })

  it('shows the scope change only when the sprint actually grew', () => {
    const { rerender } = render(<Burndown payload={payload} />)
    expect(screen.queryByText(/Scope/)).not.toBeInTheDocument()

    rerender(<Burndown payload={{ ...payload, scope: 18 }} />)
    expect(screen.getByText('Scope 16 → 18 P')).toBeInTheDocument()
  })

  it('says so instead of drawing an empty box when Jira has no history', () => {
    render(<Burndown payload={{ ...payload, points: [] }} />)
    expect(screen.getByText(/Keine Sprint-Historie/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('drops the unit when the board counts issues rather than points', () => {
    render(<Burndown payload={{ ...payload, unit: 'issues' }} />)
    expect(screen.getByText('−3.0')).toBeInTheDocument()
  })
})
