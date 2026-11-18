import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SEASONS } from '../../shared/season.js'
import type { Look } from '../look.js'
import { SeasonHeader } from './SeasonHeader.js'

const [winter, spring] = SEASONS

interface Over {
  reminder?: boolean
  daysLeft?: number
  onDismiss?: () => void
  look?: Look
  onToggleLook?: () => void
  preview?: boolean
}

const header = (over: Over = {}) =>
  render(
    <SeasonHeader
      season={winter}
      next={spring}
      nextStart={new Date(2027, 2, 1)}
      daysLeft={over.daysLeft ?? 14}
      reminder={over.reminder ?? false}
      onDismiss={over.onDismiss ?? (() => undefined)}
      preview={over.preview ?? false}
      clock={new Date(2027, 1, 8, 9, 0)}
      epics={[]}
      epicsJql={null}
      epicsError={null}
      look={over.look ?? 'classic'}
      onToggleLook={over.onToggleLook ?? (() => undefined)}
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

  it('offers the questlog look as a switch that shows its state', () => {
    const onToggleLook = vi.fn()
    header({ look: 'questlog', onToggleLook })

    const toggle = screen.getByRole('button', { name: 'Questlog-Look' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(toggle)

    expect(onToggleLook).toHaveBeenCalledOnce()
  })

  it('shows the switch released in the classic look', () => {
    header()

    expect(screen.getByRole('button', { name: 'Questlog-Look' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('shows this and the next theme as pictures in the classic look', () => {
    header()

    expect(screen.getByRole('img', { name: 'Winter' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Frühling' })).toBeInTheDocument()
  })

  it('drops both theme pictures in the questlog look, the frames carry the season there', () => {
    header({ look: 'questlog' })

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('noch 14 Arbeitstage').closest('[title]')).toHaveAttribute(
      'title',
      'nächstes Theme: Frühling',
    )
  })

  it('still marks a forced season as preview in the questlog look', () => {
    header({ look: 'questlog', preview: true })

    expect(screen.getByText('Vorschau: Winter')).toBeInTheDocument()
  })

  it('names no season next to the clock without a preview', () => {
    header({ look: 'questlog' })

    expect(screen.queryByText(/Vorschau/)).not.toBeInTheDocument()
  })
})
