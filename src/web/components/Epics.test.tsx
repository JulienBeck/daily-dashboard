import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { EpicRow } from '../../shared/types.js'
import { Epics, Headline } from './Epics.js'

const epic = (over: Partial<EpicRow> = {}): EpicRow => ({
  key: 'KI-100',
  summary: 'Mandantenfähigkeit',
  status: 'In Progress',
  lane: 'doing',
  colour: null,
  webUrl: 'https://jira.example.com/browse/KI-100',
  ...over,
})

beforeEach(() => localStorage.clear())

describe('Headline', () => {
  it('starts with a placeholder, because no source exists yet', () => {
    render(<Headline />)
    expect(screen.getByRole('button')).toHaveTextContent('Theme dieses Quartals')
  })

  it('can be edited and keeps the new text', () => {
    render(<Headline />)
    fireEvent.click(screen.getByRole('button'))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Herbst: Mehrmandantenfähigkeit' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('button')).toHaveTextContent('Herbst: Mehrmandantenfähigkeit')
  })

  it('survives a reload', () => {
    const { unmount } = render(<Headline />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.blur(screen.getByRole('textbox'), { target: { value: 'Winterthema' } })
    unmount()

    render(<Headline />)
    expect(screen.getByRole('button')).toHaveTextContent('Winterthema')
  })

  it('discards the change on escape', () => {
    render(<Headline />)
    fireEvent.click(screen.getByRole('button'))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Verworfen' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.getByRole('button')).toHaveTextContent('Theme dieses Quartals')
  })

  it('falls back to the placeholder when emptied', () => {
    render(<Headline />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.blur(screen.getByRole('textbox'), { target: { value: '   ' } })
    expect(screen.getByRole('button')).toHaveTextContent('Theme dieses Quartals')
  })
})

describe('Epics', () => {
  it('lists key and summary', () => {
    render(<Epics rows={[epic()]} jql={null} error={null} />)
    expect(screen.getByText('KI-100')).toBeInTheDocument()
    expect(screen.getByText('Mandantenfähigkeit')).toBeInTheDocument()
  })

  it('links to the epic in jira', () => {
    render(<Epics rows={[epic()]} jql={null} error={null} />)
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://jira.example.com/browse/KI-100',
    )
  })

  it('lays the epics out side by side, not stacked', () => {
    render(
      <Epics
        rows={[epic(), epic({ key: 'KI-101' }), epic({ key: 'KI-102' })]}
        jql={null}
        error={null}
      />,
    )
    const list = screen.getByRole('list')
    expect(list.className).toContain('flex')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('gives every epic its own box with a link', () => {
    render(<Epics rows={[epic(), epic({ key: 'KI-101' })]} jql={null} error={null} />)
    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toContain('rounded-md')
      expect(link).toHaveAttribute('href')
    }
  })

  it('opens jira in a new tab, so the board stays up', () => {
    render(<Epics rows={[epic()]} jql={null} error={null} />)
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank')
  })

  it('shows the query behind a badge, so it can be checked', () => {
    render(<Epics rows={[epic()]} jql="project = PRO AND issuetype = Epic" error={null} />)
    expect(screen.getByTitle('project = PRO AND issuetype = Epic')).toBeInTheDocument()
  })

  it('hides the badge when there is no query to show', () => {
    render(<Epics rows={[epic()]} jql={null} error={null} />)
    expect(screen.queryByText('JQL')).not.toBeInTheDocument()
  })

  it('says so when the query found nothing', () => {
    render(<Epics rows={[]} jql={null} error={null} />)
    expect(screen.getByText('Keine Epics gefunden.')).toBeInTheDocument()
  })

  it('shows the error instead of pretending to be empty', () => {
    render(<Epics rows={[]} jql={null} error="Jira 400 Bad Request" />)
    expect(screen.getByText('Jira 400 Bad Request')).toBeInTheDocument()
    expect(screen.queryByText('Keine Epics gefunden.')).not.toBeInTheDocument()
  })

  it('keeps the headline editable even when the query failed', () => {
    render(<Epics rows={[]} jql={null} error="kaputt" />)
    expect(screen.getByRole('button', { name: /Theme dieses Quartals/ })).toBeInTheDocument()
  })
})
