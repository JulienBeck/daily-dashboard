import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PipelineRow } from '../../shared/types.js'
import { Ampel } from './Ampel.js'

const row = (over: Partial<PipelineRow> = {}): PipelineRow => ({
  fullPath: 'fe/ki/ki-backend',
  name: 'ki-backend',
  ref: 'master',
  state: 'good',
  rawStatus: 'success',
  detail: null,
  waiting: false,
  finishedAt: null,
  author: 'A. Hartmann',
  webUrl: 'https://git.example.com/p/1',
  ...over,
})

const noRefresh = () => Promise.resolve()

describe('Ampel', () => {
  it('sorts problems to the front and healthy projects to the back', () => {
    render(
      <Ampel
        rows={[
          row({ fullPath: 'a/gut', state: 'good' }),
          row({ fullPath: 'b/rot', state: 'critical' }),
          row({ fullPath: 'c/gelb', state: 'warning' }),
        ]}
        stale={false}
        onRefresh={noRefresh}
      />,
    )
    expect(screen.getAllByRole('link').map((link) => link.dataset.state)).toEqual([
      'critical',
      'warning',
      'good',
    ])
  })

  it('writes the project name on every chip, healthy ones included', () => {
    render(
      <Ampel
        rows={[row({ fullPath: 'a/gut', state: 'good' }), row({ fullPath: 'b/rot', state: 'critical' })]}
        stale={false}
        onRefresh={noRefresh}
      />,
    )
    const [kritisch, gut] = screen.getAllByRole('link')
    expect(kritisch).toHaveTextContent('rot')
    expect(gut).toHaveTextContent('gut')
    expect(gut!.querySelector('.sr-only')).toBeNull()
  })

  it('shows a count per state and leaves empty states out', () => {
    render(
      <Ampel
        rows={[row({ fullPath: 'a', state: 'good' }), row({ fullPath: 'b', state: 'good' })]}
        stale={false}
        onRefresh={noRefresh}
      />,
    )
    expect(screen.getByTitle('2 grün')).toBeInTheDocument()
    expect(screen.queryByTitle(/^\d+ rot$/)).not.toBeInTheDocument()
  })

  it('gives every chip an icon, so the colour never carries the state alone', () => {
    render(
      <Ampel
        rows={[row({ fullPath: 'a', state: 'good' }), row({ fullPath: 'b', state: 'critical' })]}
        stale={false}
        onRefresh={noRefresh}
      />,
    )
    for (const link of screen.getAllByRole('link')) {
      expect(link.querySelector('svg title')).not.toBeNull()
    }
  })

  it('carries no legend, because icon and name already say it', () => {
    render(<Ampel rows={[row()]} stale={false} onRefresh={noRefresh} />)
    expect(screen.queryByRole('list', { name: 'Legende' })).not.toBeInTheDocument()
  })

  it('puts the detail of a pipeline into the hover title', () => {
    render(<Ampel rows={[row({ state: 'critical' })]} stale={false} onRefresh={noRefresh} />)
    expect(screen.getByRole('link')).toHaveAttribute(
      'title',
      'fe/ki/ki-backend · rot · master · success · A. Hartmann',
    )
  })

  it('puts the time of the run into the title, so a stale status is visible', () => {
    render(
      <Ampel
        rows={[row({ state: 'good', finishedAt: new Date(2026, 9, 19, 14, 5).toISOString() })]}
        stale={false}
        onRefresh={noRefresh}
      />,
    )
    expect(screen.getByRole('link').getAttribute('title')).toMatch(/19\.10\., \d\d:\d\d/)
  })

  it('says so in the title when a project has no pipeline at all', () => {
    render(
      <Ampel
        rows={[row({ state: 'idle', rawStatus: '', author: null })]}
        stale={false}
        onRefresh={noRefresh}
      />,
    )
    expect(screen.getByRole('link').getAttribute('title')).toContain('keine Pipeline')
  })

  it('marks the whole strip when the data is stale', () => {
    const { rerender } = render(<Ampel rows={[]} stale={false} onRefresh={noRefresh} />)
    expect(screen.getByLabelText('Pipeline-Ampel')).not.toHaveAttribute('data-stale')
    rerender(<Ampel rows={[]} stale onRefresh={noRefresh} />)
    expect(screen.getByLabelText('Pipeline-Ampel')).toHaveAttribute('data-stale', 'true')
  })

  it('shows a pause icon for a run that only waits on a button', () => {
    render(<Ampel rows={[row({ state: 'good', waiting: true })]} stale={false} onRefresh={noRefresh} />)
    const chip = screen.getByRole('link')
    expect(chip.querySelector('svg[data-icon="waiting"]')).not.toBeNull()
    expect(chip.querySelector('svg[data-icon="good"]')).toBeNull()
    expect(within(chip).getByTitle('wartet auf Freigabe')).toBeInTheDocument()
  })

  it('counts a waiting run as green, because nothing is broken', () => {
    render(
      <Ampel
        rows={[row({ fullPath: 'a', state: 'good', waiting: true }), row({ fullPath: 'b' })]}
        stale={false}
        onRefresh={noRefresh}
      />,
    )
    expect(screen.getByTitle('2 grün')).toBeInTheDocument()
  })

  it('keeps the check for an ordinary green run', () => {
    render(<Ampel rows={[row({ state: 'good', waiting: false })]} stale={false} onRefresh={noRefresh} />)
    const chip = screen.getByRole('link')
    expect(chip.querySelector('svg[data-icon="good"]')).not.toBeNull()
    expect(chip.querySelector('svg[data-icon="waiting"]')).toBeNull()
  })

  it('marks a running pipeline with motion rather than a fourth colour', () => {
    render(<Ampel rows={[row({ state: 'running' })]} stale={false} onRefresh={noRefresh} />)
    expect(screen.getByRole('link').querySelector('.pulse')).not.toBeNull()
  })

  it('fetches again when the reload button is pressed', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Ampel rows={[row()]} stale={false} onRefresh={onRefresh} />)

    await userEvent.click(screen.getByRole('button', { name: 'Pipelines neu laden' }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('blocks the button while the reload is still running, so nobody hammers GitLab', async () => {
    let finish = () => {}
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    render(<Ampel rows={[row()]} stale={false} onRefresh={onRefresh} />)
    const button = screen.getByRole('button', { name: 'Pipelines neu laden' })

    await userEvent.click(button)
    expect(button).toBeDisabled()
    expect(button.querySelector('.spin')).not.toBeNull()

    await userEvent.click(button)
    expect(onRefresh).toHaveBeenCalledTimes(1)

    finish()
    await waitFor(() => expect(button).toBeEnabled())
    expect(button.querySelector('.spin')).toBeNull()
  })

  it('frees the button again when the reload fails', async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error('GitLab weg'))
    render(<Ampel rows={[row()]} stale={false} onRefresh={onRefresh} />)
    const button = screen.getByRole('button', { name: 'Pipelines neu laden' })

    await userEvent.click(button)

    await waitFor(() => expect(button).toBeEnabled())
  })
})
