import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { minutesAt, nextMinutes, TimerDial } from './TimerDial.js'

if (!('PointerEvent' in window)) {
  class PointerEventStub extends MouseEvent {
    readonly pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
    }
  }
  Object.assign(window, { PointerEvent: PointerEventStub })
}

const dial = (initial = 15) => {
  const onApply = vi.fn()
  const onCancel = vi.fn()
  render(<TimerDial initial={initial} onApply={onApply} onCancel={onCancel} />)
  return { onApply, onCancel }
}

const slider = () => screen.getByRole('slider')
const svg = () => slider().querySelector('svg') as SVGSVGElement

const placeSvg = () =>
  vi.spyOn(svg(), 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })

const at = (minutes: number) => {
  const angle = (minutes / 60) * 2 * Math.PI
  return { clientX: 100 + 80 * Math.sin(angle), clientY: 100 - 80 * Math.cos(angle) }
}

describe('minutesAt', () => {
  it.each([
    [0, -1, 0],
    [1, 0, 15],
    [0, 1, 30],
    [-1, 0, 45],
    [-0.01, -1, 0],
  ])('reads (%f, %f) as minute %i', (dx, dy, expected) => {
    expect(minutesAt(dx, dy)).toBe(expected)
  })
})

describe('nextMinutes', () => {
  it('follows the pointer inside the circle', () => {
    expect(nextMinutes(15, 25)).toBe(25)
  })

  it('stops at a full hour instead of wrapping past the top', () => {
    expect(nextMinutes(58, 2)).toBe(60)
    expect(nextMinutes(60, 0)).toBe(60)
  })

  it('stops at one minute instead of wrapping back past the top', () => {
    expect(nextMinutes(2, 58)).toBe(1)
  })

  it('never goes below one minute', () => {
    expect(nextMinutes(20, 0)).toBe(1)
  })

  it('comes back from a full hour when turned back', () => {
    expect(nextMinutes(60, 55)).toBe(55)
  })
})

describe('TimerDial', () => {
  it('starts at the current timebox', () => {
    dial(15)

    expect(slider()).toHaveAttribute('aria-valuenow', '15')
    expect(slider()).toHaveAttribute('aria-valuetext', '15 Minuten')
  })

  it('takes the keyboard focus so arrows work right away', () => {
    dial()

    expect(slider()).toHaveFocus()
  })

  it('draws the arc as the share of a full hour', () => {
    dial(15)
    const arc = screen.getByTestId('dial-arc')
    const [filled, whole] = (arc.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number)

    expect(filled / whole).toBeCloseTo(0.25)
  })

  it('puts the handle at the end of the arc', () => {
    dial(15)
    const handle = screen.getByTestId('dial-handle')

    expect(Number(handle.getAttribute('cx'))).toBeCloseTo(178)
    expect(Number(handle.getAttribute('cy'))).toBeCloseTo(100)
  })

  it('follows a drag clockwise', () => {
    dial(15)
    placeSvg()

    fireEvent.pointerDown(svg(), at(15))
    fireEvent.pointerMove(svg(), at(25))
    fireEvent.pointerMove(svg(), at(40))
    fireEvent.pointerUp(svg(), at(40))

    expect(slider()).toHaveAttribute('aria-valuenow', '40')
  })

  it('jumps to the minute that is tapped on the ring', () => {
    dial(15)
    placeSvg()

    fireEvent.pointerDown(svg(), at(40))

    expect(slider()).toHaveAttribute('aria-valuenow', '40')
  })

  it('ignores pointer moves without a pressed button', () => {
    dial(15)
    placeSvg()

    fireEvent.pointerMove(svg(), at(40))

    expect(slider()).toHaveAttribute('aria-valuenow', '15')
  })

  it('stays at a full hour when dragged past the top', () => {
    dial(50)
    placeSvg()

    fireEvent.pointerDown(svg(), at(50))
    fireEvent.pointerMove(svg(), at(57))
    fireEvent.pointerMove(svg(), at(3))
    fireEvent.pointerMove(svg(), at(8))

    expect(slider()).toHaveAttribute('aria-valuenow', '60')
  })

  it.each([
    ['ArrowUp', 16],
    ['ArrowRight', 16],
    ['ArrowDown', 14],
    ['ArrowLeft', 14],
    ['PageUp', 20],
    ['PageDown', 10],
    ['Home', 1],
    ['End', 60],
  ])('moves on %s', (key, expected) => {
    dial(15)

    fireEvent.keyDown(slider(), { key })

    expect(slider()).toHaveAttribute('aria-valuenow', String(expected))
  })

  it('keeps the keyboard inside one minute and one hour', () => {
    dial(59)

    fireEvent.keyDown(slider(), { key: 'PageUp' })
    expect(slider()).toHaveAttribute('aria-valuenow', '60')

    fireEvent.keyDown(slider(), { key: 'Home' })
    fireEvent.keyDown(slider(), { key: 'ArrowDown' })
    expect(slider()).toHaveAttribute('aria-valuenow', '1')
  })

  it('applies the chosen minutes', () => {
    const { onApply } = dial(15)

    fireEvent.keyDown(slider(), { key: 'PageUp' })
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))

    expect(onApply).toHaveBeenCalledWith(20)
  })

  it('applies on enter', () => {
    const { onApply } = dial(15)

    fireEvent.keyDown(slider(), { key: 'ArrowUp' })
    fireEvent.keyDown(slider(), { key: 'Enter' })

    expect(onApply).toHaveBeenCalledWith(16)
  })

  it('cancels on the button and on escape', () => {
    const { onApply, onCancel } = dial(15)

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('uses the singular for one minute', () => {
    dial(1)

    expect(slider()).toHaveAttribute('aria-valuetext', '1 Minute')
  })
})
