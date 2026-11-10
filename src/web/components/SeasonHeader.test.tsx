import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SEASONS } from '../../shared/season.js'
import { SeasonHeader } from './SeasonHeader.js'

const [winter, spring] = SEASONS

const header = (over: { reminder?: boolean; daysLeft?: number; onDismiss?: () => void } = {}) =>
  render(
    <SeasonHeader
      season={winter}
      next={spring}
      nextStart={new Date(2027, 2, 1)}
      daysLeft={over.daysLeft ?? 14}
      reminder={over.reminder ?? false}
      onDismiss={over.onDismiss ?? (() => undefined)}
      preview={false}
      clock={new Date(2027, 1, 8, 9, 0)}
      epics={[]}
      epicsJql={null}
      epicsError={null}
    />,
  )

const warning = () => screen.queryByRole('button', { name: 'Nächstes Theme planen, heute ausblenden' })

describe('SeasonHeader', () => {
  it('shows the remaining workdays without a warning outside the lead time', () => {
    header()

    expect(screen.getByText('noch 14 Arbeitstage')).toBeInTheDocument()
    expect(warning()).not.toBeInTheDocument()
  })

  it('puts a warning sign next to the remaining workdays inside the lead time', () => {
    header({ reminder: true })

    expect(warning()).toBeInTheDocument()
    expect(screen.getByText('noch 14 Arbeitstage').parentElement).toHaveClass('text-warning')
  })

  it('names the next theme in the warning tooltip', () => {
    header({ reminder: true })

    expect(warning()).toHaveAttribute('title', expect.stringContaining('Frühling'))
  })

  it('dismisses the warning when the sign is clicked', () => {
    const onDismiss = vi.fn()
    header({ reminder: true, onDismiss })

    fireEvent.click(warning() as HTMLElement)

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('uses the singular for a single workday', () => {
    header({ daysLeft: 1 })

    expect(screen.getByText('noch 1 Arbeitstag')).toBeInTheDocument()
  })
})
