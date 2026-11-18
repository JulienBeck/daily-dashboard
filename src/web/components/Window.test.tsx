import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Window } from './Window.js'

describe('Window', () => {
  it('closes with the red button on its corner, the same as the questlog’s', () => {
    const onClose = vi.fn()
    render(
      <Window label="Profil" onClose={onClose}>
        <p>Inhalt</p>
      </Window>,
    )

    const close = screen.getByRole('button', { name: 'Profil schließen' })
    expect(close).toHaveClass('red-button')
    expect(close).not.toHaveClass('metal-button')

    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
