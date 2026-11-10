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

  it('stays quiet while the timebox still runs', () => {
    render(<Timer />)

    press('Start')
    tick(1000 * 899)
    expect(screen.getByText('00:01')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('raises the frame the moment it hits zero', () => {
    render(<Timer />)

    press('Start')
    tick(1000 * 900)

    expect(screen.getByText('00:00')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveClass('alarm-frame')
  })

  it('takes the frame away once it has blinked', () => {
    render(<Timer />)

    press('Start')
    tick(1000 * 1000)
    act(() => void fireEvent.animationEnd(screen.getByRole('alert')))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not raise the frame a second time by itself', () => {
    render(<Timer />)

    press('Start')
    tick(1000 * 1000)
    act(() => void fireEvent.animationEnd(screen.getByRole('alert')))
    tick(1000 * 10)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('fills the bar from left to right as the timebox burns', () => {
    render(<Timer />)
    const bar = () => screen.getByRole('progressbar').firstElementChild as HTMLElement

    expect(bar().style.width).toBe('0%')

    press('Start')
    tick(1000 * 450)
    expect(bar().style.width).toBe('50%')

    tick(1000 * 450)
    expect(bar().style.width).toBe('100%')
  })

  it('reports elapsed and remaining time to assistive tech', () => {
    render(<Timer />)

    press('Start')
    tick(1000 * 60)

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '60')
    expect(bar).toHaveAttribute('aria-valuemax', '900')
    expect(bar).toHaveAttribute('aria-valuetext', '14:00 verbleibend')
  })

  it('blinks the bar along with the frame', () => {
    render(<Timer />)

    press('Start')
    tick(1000 * 900)

    expect(screen.getByRole('progressbar')).toHaveClass('timer-alarm')
  })

  it('leaves the bar alone while the timebox still runs', () => {
    render(<Timer />)

    press('Start')
    tick(1000 * 899)

    expect(screen.getByRole('progressbar')).not.toHaveClass('timer-alarm')
  })

  it('takes the bar back to normal once it has blinked', () => {
    render(<Timer />)

    press('Start')
    tick(1000 * 1000)
    act(() => void fireEvent.animationEnd(screen.getByRole('alert')))

    expect(screen.getByRole('progressbar')).not.toHaveClass('timer-alarm')
  })

  it('clears the frame when the timebox is reset', () => {
    render(<Timer />)

    press('Start')
    tick(1000 * 1000)
    press('Zurücksetzen')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('raises the frame again after a reset and a second run', () => {
    render(<Timer />)

    press('Start')
    tick(1000 * 1000)
    press('Zurücksetzen')
    press('Start')
    tick(1000 * 1000)

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('asks on load whether to start when told to', () => {
    render(<Timer ask />)

    expect(screen.getByRole('dialog', { name: 'Daily-Timer starten?' })).toBeInTheDocument()
  })

  it('does not ask unless told to', () => {
    render(<Timer />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('starts the timebox when the prompt is confirmed', () => {
    render(<Timer ask />)

    press('Starten')
    tick(2000)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('14:58')).toBeInTheDocument()
  })

  it('leaves the timebox untouched when the prompt is declined', () => {
    render(<Timer ask />)

    press('Nicht jetzt')
    tick(2000)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('15:00')).toBeInTheDocument()
  })

  it('declines the prompt on escape', () => {
    render(<Timer ask />)

    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    tick(2000)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('15:00')).toBeInTheDocument()
  })

  it('ignores the space bar while the prompt is open', () => {
    render(<Timer ask />)

    space()
    tick(2000)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('15:00')).toBeInTheDocument()
  })

  it('focuses the start button so enter confirms', () => {
    render(<Timer ask />)

    expect(screen.getByRole('button', { name: 'Starten' })).toHaveFocus()
  })

  it('opens the dial when the time is clicked', () => {
    render(<Timer />)

    press('Timebox einstellen, 15:00')

    expect(screen.getByRole('dialog', { name: 'Timebox einstellen' })).toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '15')
  })

  it('runs the timebox chosen on the dial', () => {
    render(<Timer />)

    press('Timebox einstellen, 15:00')
    act(() => void fireEvent.keyDown(screen.getByRole('slider'), { key: 'PageUp' }))
    press('Übernehmen')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('20:00')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '1200')

    press('Start')
    tick(3000)
    expect(screen.getByText('19:57')).toBeInTheDocument()
  })

  it('goes back to the chosen timebox after it ran out', () => {
    render(<Timer />)

    press('Timebox einstellen, 15:00')
    act(() => void fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' }))
    press('Übernehmen')
    press('Start')
    tick(1000 * 4000)
    press('Zurücksetzen')

    expect(screen.getByText('60:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('starts a fresh timebox when a paused one is changed', () => {
    render(<Timer />)

    press('Start')
    tick(5000)
    press('Pause')
    press('Timebox einstellen, 14:55')
    act(() => void fireEvent.keyDown(screen.getByRole('slider'), { key: 'PageDown' }))
    press('Übernehmen')

    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('keeps the timebox when the dial is cancelled', () => {
    render(<Timer />)

    press('Timebox einstellen, 15:00')
    act(() => void fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' }))
    press('Abbrechen')

    expect(screen.getByText('15:00')).toBeInTheDocument()
  })

  it('closes the dial on a click outside of it', () => {
    render(<Timer />)

    press('Timebox einstellen, 15:00')
    act(() => void fireEvent.pointerDown(document.body))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the dial open on a click inside of it', () => {
    render(<Timer />)

    press('Timebox einstellen, 15:00')
    act(() => void fireEvent.pointerDown(screen.getByRole('slider')))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes the dial when the time is clicked again', () => {
    render(<Timer />)

    press('Timebox einstellen, 15:00')
    press('Timebox einstellen, 15:00')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('locks the time while the timebox runs', () => {
    render(<Timer />)

    press('Start')

    expect(screen.getByRole('button', { name: 'Timebox einstellen, 15:00' })).toBeDisabled()
  })

  it('ignores the space bar while the dial is open', () => {
    render(<Timer />)

    press('Timebox einstellen, 15:00')
    space()
    tick(2000)

    expect(screen.getByText('15:00')).toBeInTheDocument()
  })

  it('names the chosen timebox in the start prompt', () => {
    render(<Timer ask />)

    expect(screen.getByText('15:00 Timebox')).toBeInTheDocument()
  })

  it('fills the bar against the chosen timebox', () => {
    render(<Timer />)
    const bar = () => screen.getByRole('progressbar').firstElementChild as HTMLElement

    press('Timebox einstellen, 15:00')
    act(() => void fireEvent.keyDown(screen.getByRole('slider'), { key: 'PageUp' }))
    press('Übernehmen')
    press('Start')
    tick(1000 * 600)

    expect(bar().style.width).toBe('50%')
  })
})
