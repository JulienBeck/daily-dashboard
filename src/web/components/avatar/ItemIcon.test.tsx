import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { itemById } from '../../../shared/avatar.js'
import { iconPosition, ItemIcon } from './ItemIcon.js'

describe('iconPosition', () => {
  it('finds each item on the four by four sheet in item order', () => {
    expect(iconPosition('wool-hood')).toBe('0% 0%')
    expect(iconPosition('steel-pauldrons')).toBe('100% 0%')
    expect(iconPosition('linen-tunic')).toBe('0% 33.3333%')
    expect(iconPosition('leather-boots')).toBe('66.6667% 66.6667%')
    expect(iconPosition('parrying-dagger')).toBe('100% 100%')
  })

  it('has no place for an unknown item', () => {
    expect(iconPosition('ghost-item')).toBeNull()
  })
})

describe('ItemIcon', () => {
  it('cuts the item out of the sheet and fades an empty slot', () => {
    const { container, rerender } = render(<ItemIcon item={itemById('iron-helm')} />)
    const icon = container.querySelector<HTMLElement>('[data-item="iron-helm"]')!

    expect(icon.style.backgroundPosition).toBe('33.3333% 0%')
    expect(icon.style.backgroundSize).toBe('400% 400%')
    expect(icon.style.opacity).toBe('')

    rerender(<ItemIcon item={itemById('iron-helm')} faded />)
    expect(container.querySelector<HTMLElement>('[data-item="iron-helm"]')!.style.opacity).toBe('0.18')
  })

  it('draws nothing without an item', () => {
    const { container } = render(<ItemIcon />)

    expect(container).toBeEmptyDOMElement()
  })
})
