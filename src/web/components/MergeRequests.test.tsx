import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MergeRequestRow } from '../../shared/types.js'
import { MergeRequests } from './MergeRequests.js'

const row = (over: Partial<MergeRequestRow> = {}): MergeRequestRow => ({
  title: 'Etwas reparieren',
  project: 'ki-backend',
  author: 'J. Beck',
  ageDays: 2,
  draft: false,
  approvals: 0,
  webUrl: 'https://git.example.com/mr/1',
  ...over,
})

describe('MergeRequests', () => {
  it('lists the requests when expanded', () => {
    render(<MergeRequests rows={[row()]} collapsed={false} onToggle={() => {}} />)
    expect(screen.getByText('Etwas reparieren')).toBeInTheDocument()
  })

  it('hides the list when collapsed but keeps the count visible', () => {
    render(<MergeRequests rows={[row(), row({ webUrl: 'x' })]} collapsed onToggle={() => {}} />)
    expect(screen.queryByText('Etwas reparieren')).not.toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('reports its state to assistive technology', () => {
    const { rerender } = render(<MergeRequests rows={[]} collapsed={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    rerender(<MergeRequests rows={[]} collapsed onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('toggles from both states', () => {
    const onToggle = vi.fn()
    const { rerender } = render(
      <MergeRequests rows={[]} collapsed={false} onToggle={onToggle} />,
    )
    fireEvent.click(screen.getByRole('button'))
    rerender(<MergeRequests rows={[]} collapsed onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(2)
  })

  it('says it is empty rather than showing a bare panel', () => {
    render(<MergeRequests rows={[]} collapsed={false} onToggle={() => {}} />)
    expect(screen.getByText('Nichts offen.')).toBeInTheDocument()
  })

  it('marks an old request, because that is the one worth talking about', () => {
    render(<MergeRequests rows={[row({ ageDays: 12 })]} collapsed={false} onToggle={() => {}} />)
    expect(screen.getByTitle('12 Tage offen')).toHaveClass('text-serious')
  })

  it('leaves a fresh request unmarked', () => {
    render(<MergeRequests rows={[row({ ageDays: 1 })]} collapsed={false} onToggle={() => {}} />)
    expect(screen.getByTitle('1 Tage offen')).not.toHaveClass('text-serious')
  })
})
