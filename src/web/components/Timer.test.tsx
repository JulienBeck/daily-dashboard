import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatClock, Timer } from './Timer.js'

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const press = (name: string) => act(() => void fireEvent.click(screen.getByRole('button', { name })))
const space = () =>
  act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })))

describe('formatClock', () => {
  it.each([
    [900, '15:00'],
    [59, '00:59'],
    [0, '00:00'],
    [-5, '00:00'],
    [61, '01:01'],
  ])('renders %i seconds as %s', (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected)
  })
})

describe('Timer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('counts down only while it runs', () => {
    render(<Timer />)

    tick(3000)
    expect(screen.getByText('15:00')).toBeInTheDocument()

    press('Start')
    tick(3000)
    expect(screen.getByText('14:57')).toBeInTheDocument()
  })

  it('pauses and resumes from where it stopped', () => {
    render(<Timer />)

    press('Start')
    tick(2000)
    press('Pause')
    tick(5000)

    expect(screen.getByText('14:58')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeInTheDocument()

    press('Weiter')
    tick(1000)
    expect(screen.getByText('14:57')).toBeInTheDocument()
  })

  it('stops at zero instead of going negative', () => {
    render(<Timer />)

    press('Start')
    tick(1000 * 1000)

    expect(screen.getByText('00:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zurücksetzen' })).toBeInTheDocument()
  })

  it('goes back to the full timebox after it ran out', () => {
    render(<Timer />)

    press('Start')
    tick(1000 * 1000)
    press('Zurücksetzen')

    expect(screen.getByText('15:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('starts and stops on the space bar', () => {
    render(<Timer />)

    space()
    tick(2000)
    expect(screen.getByText('14:58')).toBeInTheDocument()

    space()
    tick(5000)
    expect(screen.getByText('14:58')).toBeInTheDocument()
  })
})
