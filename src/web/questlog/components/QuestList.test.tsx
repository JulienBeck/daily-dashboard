import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Quest, Series } from '../../../shared/questlog/types'
import { en, StringsContext } from '../strings'
import { QuestList } from './QuestList'

const quest = (over: Partial<Quest>): Quest => ({
  key: 'PRO-1',
  title: 'Die Stunde der Abrechnung',
  project: 'PRO',
  projectName: 'Produkt',
  seriesKey: 'PRO-100',
  seriesName: 'Krieg der Dornen',
  level: 110,
  difficulty: 'deadly',
  state: 'available',
  points: 11,
  priority: 'Major',
  issueType: 'Story',
  status: 'Open',
  assignee: null,
  giver: null,
  objective: '',
  description: '',
  labels: [],
  experience: 1650,
  coins: { gold: 0, silver: 0, copper: 0 },
  webUrl: 'https://jira.test/browse/PRO-1',
  ...over,
})

const series: Series[] = [
  {
    key: 'PRO-100',
    name: 'Krieg der Dornen',
    webUrl: 'https://jira.test/browse/PRO-100',
    epic: null,
    quests: [quest({}), quest({ key: 'PRO-2', title: 'Der Seelenjäger', level: 30 })],
  },
]

const noop = () => {}

describe('QuestList', () => {
  it('prints level and title like the game does', () => {
    render(
      <QuestList
        series={series}
        selected={null}
        collapsed={new Set()}
        onSelect={noop}
        onToggleSeries={noop}
        emptyText=""
      />,
    )
    expect(screen.getByText('[110]')).toBeInTheDocument()
    expect(screen.getByText('Die Stunde der Abrechnung')).toBeInTheDocument()
  })

  it('colours a quest by its difficulty', () => {
    render(
      <QuestList
        series={[{ ...series[0]!, quests: [quest({ difficulty: 'easy' })] }]}
        selected={null}
        collapsed={new Set()}
        onSelect={noop}
        onToggleSeries={noop}
        emptyText=""
      />,
    )
    expect(screen.getByRole('button', { name: /Stunde der Abrechnung/ })).toHaveAttribute(
      'data-difficulty',
      'easy',
    )
  })

  it('marks the selected quest', () => {
    render(
      <QuestList
        series={series}
        selected="PRO-2"
        collapsed={new Set()}
        onSelect={noop}
        onToggleSeries={noop}
        emptyText=""
      />,
    )
    expect(screen.getByRole('button', { name: /Seelenjäger/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('hides the quests of a collapsed series', () => {
    render(
      <QuestList
        series={series}
        selected={null}
        collapsed={new Set(['PRO-100'])}
        onSelect={noop}
        onToggleSeries={noop}
        emptyText=""
      />,
    )
    expect(screen.queryByText('Die Stunde der Abrechnung')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Krieg der Dornen/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('reports a click on a quest and on a series', async () => {
    const onSelect = vi.fn()
    const onToggleSeries = vi.fn()
    render(
      <QuestList
        series={series}
        selected={null}
        collapsed={new Set()}
        onSelect={onSelect}
        onToggleSeries={onToggleSeries}
        emptyText=""
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /Seelenjäger/ }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: 'PRO-2' }))

    await userEvent.click(screen.getByRole('button', { name: /Krieg der Dornen/ }))
    expect(onToggleSeries).toHaveBeenCalledWith('PRO-100')
  })

  const epic = quest({ key: 'PRO-100', title: 'Krieg der Dornen', issueType: 'Epic' })
  const withEpic: Series[] = [{ ...series[0]!, epic }]

  it('puts the epic on the sheet instead of sending it to Jira', async () => {
    const onSelect = vi.fn()
    render(
      <QuestList
        series={withEpic}
        selected={null}
        collapsed={new Set()}
        onSelect={onSelect}
        onToggleSeries={noop}
        emptyText=""
      />,
    )

    expect(screen.queryByRole('link', { name: 'Krieg der Dornen' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Krieg der Dornen' }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: 'PRO-100' }))
  })

  it('marks the series as the chosen one while its epic is on the sheet', () => {
    render(
      <QuestList
        series={withEpic}
        selected="PRO-100"
        collapsed={new Set()}
        onSelect={noop}
        onToggleSeries={noop}
        emptyText=""
      />,
    )
    expect(screen.getByRole('button', { name: 'Krieg der Dornen' })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('leaves the name plain when no epic came back, rather than a dead knob', () => {
    render(
      <QuestList
        series={series}
        selected={null}
        collapsed={new Set()}
        onSelect={noop}
        onToggleSeries={noop}
        emptyText=""
      />,
    )
    expect(screen.queryByRole('button', { name: 'Krieg der Dornen' })).not.toBeInTheDocument()
    expect(screen.getByText('Krieg der Dornen')).toBeInTheDocument()
  })

  it('leaves the bucket without an epic unlinked and names it itself', () => {
    render(
      <QuestList
        series={[{ key: '', name: null, webUrl: null, epic: null, quests: [quest({})] }]}
        selected={null}
        collapsed={new Set()}
        onSelect={noop}
        onToggleSeries={noop}
        emptyText=""
      />,
    )
    // The server sends no name for it; the wording belongs to the interface.
    expect(screen.getByText('Ohne Questreihe')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('names that bucket in English too', () => {
    render(
      <StringsContext value={en}>
        <QuestList
          series={[{ key: '', name: null, webUrl: null, epic: null, quests: [quest({})] }]}
          selected={null}
          collapsed={new Set()}
          onSelect={noop}
          onToggleSeries={noop}
          emptyText=""
        />
      </StringsContext>,
    )
    expect(screen.getByText('No quest series')).toBeInTheDocument()
  })

  it('folds with a button of its own, so the link stays clickable', async () => {
    const onToggleSeries = vi.fn()
    render(
      <QuestList
        series={series}
        selected={null}
        collapsed={new Set()}
        onSelect={noop}
        onToggleSeries={onToggleSeries}
        emptyText=""
      />,
    )

    const fold = screen.getByRole('button', { name: 'Krieg der Dornen zuklappen' })
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(fold)
    expect(onToggleSeries).toHaveBeenCalledWith('PRO-100')
  })

  it('names the fold button after what it will do next', () => {
    render(
      <QuestList
        series={series}
        selected={null}
        collapsed={new Set(['PRO-100'])}
        onSelect={noop}
        onToggleSeries={noop}
        emptyText=""
      />,
    )
    expect(screen.getByRole('button', { name: 'Krieg der Dornen aufklappen' })).toBeInTheDocument()
  })

  it('shows the empty text instead of an empty book', () => {
    render(
      <QuestList
        series={[]}
        selected={null}
        collapsed={new Set()}
        onSelect={noop}
        onToggleSeries={noop}
        emptyText="Auf dieser Seite steht nichts."
      />,
    )
    expect(screen.getByText('Auf dieser Seite steht nichts.')).toBeInTheDocument()
  })

  it('names the quest marker so the status is readable', () => {
    render(
      <QuestList
        series={[{ ...series[0]!, quests: [quest({ state: 'active', status: 'In Progress' })] }]}
        selected={null}
        collapsed={new Set()}
        onSelect={noop}
        onToggleSeries={noop}
        emptyText=""
      />,
    )
    expect(screen.getByRole('img', { name: 'Angenommen (In Progress)' })).toBeInTheDocument()
  })
})
