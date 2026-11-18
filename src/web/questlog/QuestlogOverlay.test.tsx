import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './api'
import { Questlog } from './Questlog'
import QuestlogOverlay from './QuestlogOverlay'

vi.mock('./api')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getQuestlog).mockReturnValue(new Promise(() => undefined))
})

const overlay = () => {
  const onClose = vi.fn()
  render(<QuestlogOverlay issueKey="PRO-1" onClose={onClose} />)
  return onClose
}

describe('QuestlogOverlay', () => {
  it('lays the questlog over the board as a modal', () => {
    overlay()

    expect(screen.getByRole('dialog', { name: 'Questlog' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Questlog' })).toBeInTheDocument()
  })

  it('closes with its own button', () => {
    const onClose = overlay()

    fireEvent.click(screen.getByRole('button', { name: 'Questlog schließen' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('hangs the close button on the window corner, not on the backdrop', () => {
    overlay()

    const close = screen.getByRole('button', { name: 'Questlog schließen' })
    expect(close.parentElement).toHaveClass('frame')
    expect(close).toHaveClass('btn', 'ql-close')
    expect(close).not.toHaveClass('collapse')
  })

  it('shows no close button when the questlog stands alone', () => {
    render(<Questlog />)

    expect(screen.queryByRole('button', { name: 'Questlog schließen' })).not.toBeInTheDocument()
  })

  it('closes with escape', () => {
    const onClose = overlay()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('leaves escape to the quest form while that is open', () => {
    const onClose = overlay()
    const form = document.querySelector('.ql dialog') as HTMLDialogElement
    form.open = true

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on a click beside the window', () => {
    const onClose = overlay()

    fireEvent.click(screen.getByRole('dialog', { name: 'Questlog' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('stays open on a click into the window', () => {
    const onClose = overlay()

    fireEvent.click(screen.getByRole('heading', { name: 'Questlog' }))

    expect(onClose).not.toHaveBeenCalled()
  })
})
