import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { itemById, ITEMS, SLOTS, worn } from '../../../shared/avatar.js'
import { Figure, ItemIcon, taper } from './Figure.js'

const all = worn(ITEMS.filter((item) => item.quality === 'common').map((item) => ({ id: item.id, equipped: true })))
const parts = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-part]')].map((node) => node.getAttribute('data-part'))

describe('taper', () => {
  it('runs from the full width at the start to the narrower end, with round caps', () => {
    expect(taper('M0 0 L0 10', 4, 2)).toBe('M-2.00 0.00 L-1.00 10.00 A1.00 1.00 0 0 0 1.00 10.00 L2.00 0.00 A2.00 2.00 0 0 0 -2.00 0.00 Z')
  })

  it('narrows to four fifths unless told otherwise', () => {
    expect(taper('M0 0 L10 0', 10)).toContain('L10.00 4.00')
  })
})

describe('Figure', () => {
  it('draws a person that idles and is named for screen readers', () => {
    const { container } = render(<Figure worn={{}} title="Spielfigur von Anna" />)

    expect(screen.getByRole('img', { name: 'Spielfigur von Anna' })).toHaveClass('avatar')
    for (const name of ['avatar-idle', 'avatar-breathe', 'avatar-arm-right', 'avatar-arm-left', 'avatar-head', 'avatar-eyes']) {
      expect(container.querySelector(`.${name}`)).not.toBeNull()
    }
    expect(parts(container)).toEqual(['body-legs'])
  })

  it('wears one piece for every slot that is filled', () => {
    const { container } = render(<Figure worn={all} title="x" />)

    expect(new Set(parts(container))).toEqual(new Set(['body-legs', 'legs', 'boots', 'chest', 'gloves', 'shoulders', 'mainHand', 'offHand', 'head']))
  })

  it('carries the weapons in the swinging arms, the sword right and the shield left', () => {
    const { container } = render(<Figure worn={all} title="x" />)

    expect(container.querySelector('.avatar-arm-right [data-part="mainHand"]')).not.toBeNull()
    expect(container.querySelector('.avatar-arm-left [data-part="offHand"]')).not.toBeNull()
    expect(container.querySelectorAll('.avatar-arm-right [data-part="shoulders"], .avatar-arm-left [data-part="shoulders"]')).toHaveLength(2)
  })

  it('draws each kind in its own shape, not just in other colours', () => {
    const shapes = (id: string) => {
      const item = itemById(id)!
      const { container, unmount } = render(<Figure worn={{ [item.slot]: item }} title="x" />)
      const markup = container.querySelector(`[data-part="${item.slot}"]`)!.innerHTML.replace(/#[0-9a-f]{6}/gi, '')
      unmount()
      return markup
    }

    for (const { slot } of SLOTS) {
      const [first, second] = ITEMS.filter((item) => item.slot === slot)
      expect(shapes(first!.id)).not.toBe(shapes(second!.id))
    }
  })
})

describe('ItemIcon', () => {
  it('crops the piece out of the figure and fades an empty slot', () => {
    const { container, rerender } = render(<ItemIcon slot="head" item={itemById('iron-helm')} />)

    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '72 14 56 56')
    expect(container.querySelector('[data-part="head"]')).not.toBeNull()
    expect(container.querySelector('svg')).not.toHaveStyle({ opacity: '0.18' })

    rerender(<ItemIcon slot="head" item={itemById('iron-helm')} faded />)
    expect(container.querySelector('svg')).toHaveStyle({ opacity: '0.18' })
  })
})
