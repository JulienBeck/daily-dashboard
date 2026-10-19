import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SprintInfo } from '../../shared/types.js'
import { share, SprintTile, timeLeftShare } from './SprintTile.js'

const sprint: SprintInfo = {
  name: 'Sprint 42',
  startDate: null,
  endDate: null,
  workdaysLeft: 6,
  workdaysTotal: 10,
  pointsField: 'customfield_10002',
  points: { done: 34, doing: 18, open: 13 },
}

describe('share', () => {
  it('turns points into percentages that add up', () => {
    expect(share({ done: 1, doing: 1, open: 2 })).toEqual({ done: 25, doing: 25, open: 50 })
  })

  it('returns zeroes instead of dividing by zero on an empty sprint', () => {
    expect(share({ done: 0, doing: 0, open: 0 })).toEqual({ done: 0, doing: 0, open: 0 })
  })
})

describe('timeLeftShare', () => {
  it('gives the remaining share of the sprint', () => {
    expect(timeLeftShare(sprint)).toBe(60)
  })

  it('is null when the sprint has no dates to measure against', () => {
    expect(timeLeftShare({ ...sprint, workdaysTotal: null })).toBeNull()
    expect(timeLeftShare({ ...sprint, workdaysLeft: null })).toBeNull()
  })

  it('does not divide by zero on a one-day sprint that already ended', () => {
    expect(timeLeftShare({ ...sprint, workdaysTotal: 0 })).toBeNull()
  })

  it('never exceeds a full ring', () => {
    expect(timeLeftShare({ ...sprint, workdaysLeft: 20, workdaysTotal: 10 })).toBe(100)
  })
})

describe('SprintTile', () => {
  it('shows the remaining workdays in the ring', () => {
    render(<SprintTile sprint={sprint} />)
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByLabelText('6 von 10 Arbeitstagen übrig')).toBeInTheDocument()
  })

  it('shows a dash when the sprint has no end date', () => {
    render(<SprintTile sprint={{ ...sprint, workdaysLeft: null }} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('labels every segment with its points, so colour is never the only cue', () => {
    render(<SprintTile sprint={sprint} />)
    expect(screen.getByText('34 P')).toBeInTheDocument()
    expect(screen.getByText('18 P')).toBeInTheDocument()
    expect(screen.getByText('13 P')).toBeInTheDocument()
  })

  it('says which field was read when the sprint has no points at all', () => {
    render(<SprintTile sprint={{ ...sprint, points: { done: 0, doing: 0, open: 0 } }} />)
    expect(screen.getByText(/Keine Story Points gefunden/)).toHaveTextContent('customfield_10002')
  })

  it('says that no field was found at all when there is none', () => {
    render(
      <SprintTile
        sprint={{ ...sprint, pointsField: null, points: { done: 0, doing: 0, open: 0 } }}
      />,
    )
    expect(screen.getByText(/kein Schätzfeld ermittelt/)).toBeInTheDocument()
  })

  it('stays quiet about the field as soon as points arrive', () => {
    render(<SprintTile sprint={sprint} />)
    expect(screen.queryByText(/Keine Story Points/)).not.toBeInTheDocument()
  })
})
