import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { itemById } from '../../../shared/avatar.js'
import { ItemIcon } from './ItemIcon.js'

describe('ItemIcon', () => {
  it('shows the rendered icon of the item and fades an empty slot', () => {
    const { container, rerender } = render(<ItemIcon item={itemById('iron-helm')} />)
    const icon = container.querySelector<HTMLImageElement>('[data-item="iron-helm"]')!

    expect(icon.getAttribute('src')).toBe('/avatar/icons/iron-helm.png')
    expect(icon.style.opacity).toBe('')

    rerender(<ItemIcon item={itemById('iron-helm')} faded />)
    expect(container.querySelector<HTMLElement>('[data-item="iron-helm"]')!.style.opacity).toBe('0.18')
  })

  it('hides an icon that was never rendered instead of showing a broken image', () => {
    const { container } = render(<ItemIcon item={itemById('iron-helm')} />)
    const icon = container.querySelector<HTMLImageElement>('[data-item="iron-helm"]')!

    fireEvent.error(icon)

    expect(icon.style.visibility).toBe('hidden')
  })

  it('draws nothing without an item', () => {
    const { container } = render(<ItemIcon />)

    expect(container).toBeEmptyDOMElement()
  })
})
