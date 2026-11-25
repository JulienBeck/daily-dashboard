import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { itemById } from '../../../shared/avatar.js'
import { createStage } from './scene.js'
import { Stage } from './Stage.js'

vi.mock('./scene.js', () => ({ createStage: vi.fn() }))

const handle = () => ({ show: vi.fn(), dispose: vi.fn() })

beforeEach(() => {
  vi.resetAllMocks()
})

describe('Stage', () => {
  it('loads the model of the chosen body and shows what is worn', async () => {
    const stage = handle()
    vi.mocked(createStage).mockResolvedValue(stage)

    render(<Stage body="female" worn={{ head: itemById('iron-helm') }} title="Spielfigur von Anna" />)

    expect(screen.getByRole('img', { name: 'Spielfigur von Anna' })).toHaveTextContent('Figur wird geladen …')
    await waitFor(() => expect(stage.show).toHaveBeenCalled())
    expect(vi.mocked(createStage).mock.calls[0]![1]).toBe('/avatar/female.glb')
    expect(vi.mocked(createStage).mock.calls[0]![2]).toBe(false)
    expect(stage.show).toHaveBeenLastCalledWith(new Set(['body', 'eyes', 'eyebrows', 'eyelashes', 'undershirt', 'shorts', 'item_iron-helm']), new Set())
    expect(screen.queryByText('Figur wird geladen …')).not.toBeInTheDocument()
  })

  it('stands still for people who asked for less motion', async () => {
    const matchMedia = vi.fn(() => ({ matches: true }))
    vi.stubGlobal('matchMedia', matchMedia)
    vi.mocked(createStage).mockResolvedValue(handle())

    render(<Stage body="male" worn={{}} title="x" />)

    await waitFor(() => expect(createStage).toHaveBeenCalled())
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(vi.mocked(createStage).mock.calls[0]![2]).toBe(true)
    vi.unstubAllGlobals()
  })

  it('dresses the loaded figure again when the equipment changes', async () => {
    const stage = handle()
    vi.mocked(createStage).mockResolvedValue(stage)
    const { rerender } = render(<Stage body="male" worn={{}} title="x" />)
    await waitFor(() => expect(stage.show).toHaveBeenCalledTimes(1))

    rerender(<Stage body="male" worn={{ chest: itemById('chain-mail') }} title="x" />)

    await waitFor(() => expect(stage.show).toHaveBeenCalledTimes(2))
    expect(stage.show).toHaveBeenLastCalledWith(new Set(['body', 'eyes', 'eyebrows', 'eyelashes', 'hair', 'shorts', 'item_chain-mail']), new Set())
    expect(createStage).toHaveBeenCalledTimes(1)
  })

  it('closes the hands that take up a weapon', async () => {
    const stage = handle()
    vi.mocked(createStage).mockResolvedValue(stage)
    const { rerender } = render(<Stage body="male" worn={{}} title="x" />)
    await waitFor(() => expect(stage.show).toHaveBeenCalledTimes(1))

    rerender(<Stage body="male" worn={{ mainHand: itemById('short-sword'), offHand: itemById('wooden-shield') }} title="x" />)

    await waitFor(() => expect(stage.show).toHaveBeenCalledTimes(2))
    expect(stage.show.mock.lastCall![1]).toEqual(new Set(['l', 'r']))
  })

  it('swaps the model when the body changes and lets go of the old one', async () => {
    const first = handle()
    const second = handle()
    vi.mocked(createStage).mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const { rerender, unmount } = render(<Stage body="male" worn={{}} title="x" />)
    await waitFor(() => expect(first.show).toHaveBeenCalled())

    rerender(<Stage body="female" worn={{}} title="x" />)

    await waitFor(() => expect(second.show).toHaveBeenCalled())
    expect(first.dispose).toHaveBeenCalled()
    expect(vi.mocked(createStage).mock.calls[0]![1]).toBe('/avatar/male.glb')
    expect(vi.mocked(createStage).mock.calls[1]![1]).toBe('/avatar/female.glb')
    unmount()
    expect(second.dispose).toHaveBeenCalled()
  })

  it('throws away a model that arrives after the figure is gone', async () => {
    const stage = handle()
    let arrive: (value: typeof stage) => void = () => undefined
    vi.mocked(createStage).mockReturnValue(new Promise((resolve) => (arrive = resolve)))
    const { unmount } = render(<Stage body="male" worn={{}} title="x" />)
    await waitFor(() => expect(createStage).toHaveBeenCalled())

    unmount()
    await act(async () => arrive(stage))

    expect(stage.dispose).toHaveBeenCalled()
    expect(stage.show).not.toHaveBeenCalled()
  })

  it('says so when the browser cannot draw it', async () => {
    vi.mocked(createStage).mockRejectedValue(new Error('WebGL fehlt'))

    render(<Stage body="male" worn={{}} title="x" />)

    expect(await screen.findByText('3D-Ansicht nicht verfügbar')).toBeInTheDocument()
  })
})
