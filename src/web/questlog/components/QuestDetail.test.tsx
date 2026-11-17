import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Quest } from '../../../shared/questlog/types'
import { en, StringsContext } from '../strings'
import { QuestDetail } from './QuestDetail'

const quest = (over: Partial<Quest> = {}): Quest => ({
  key: 'PRO-42',
  title: 'Die Stunde der Abrechnung',
  project: 'PRO',
  projectName: 'Produkt',
  seriesKey: 'PRO-100',
  seriesName: 'Krieg der Dornen',
  level: 110,
  difficulty: 'deadly',
  state: 'active',
  points: 11,
  priority: 'Major',
  issueType: 'Story',
  status: 'In Progress',
  assignee: 'Timo',
  giver: 'Anduin Wrynn',
  objective: 'Sprich mit Mathias Shaw.',
  description: 'Die Allianz braucht dich.',
  labels: ['allianz'],
  experience: 1650,
  coins: { gold: 12, silver: 50, copper: 0 },
  webUrl: 'https://jira.test/browse/PRO-42',
  ...over,
})

describe('QuestDetail', () => {
  it('writes objective, description and quest giver on the parchment', () => {
    render(<QuestDetail quest={quest()} />)

    expect(screen.getByRole('heading', { name: 'Die Stunde der Abrechnung' })).toBeInTheDocument()
    expect(screen.getByText('Sprich mit Mathias Shaw.')).toBeInTheDocument()
    expect(screen.getByText('Die Allianz braucht dich.')).toBeInTheDocument()
    // Once as a flourish, once printed under the line.
    expect(screen.getAllByText('Anduin Wrynn')).toHaveLength(2)
  })

  it('names the project, which is no longer a list heading', () => {
    render(<QuestDetail quest={quest()} />)
    expect(screen.getByText('Produkt')).toBeInTheDocument()
  })

  it('shows the experience in German thousands separators', () => {
    render(<QuestDetail quest={quest()} />)
    expect(screen.getByText('1.650')).toBeInTheDocument()
  })

  it('groups the experience the way the language does', () => {
    render(
      <StringsContext value={en}>
        <QuestDetail quest={quest()} />
      </StringsContext>,
    )
    // 1.650 in German, 1,650 in English - the separator is not decoration.
    expect(screen.getByText('1,650')).toBeInTheDocument()
    expect(screen.queryByText('1.650')).not.toBeInTheDocument()
  })

  it('counts out the purse', () => {
    render(<QuestDetail quest={quest()} />)
    expect(screen.getByTitle('12 Gold')).toBeInTheDocument()
    expect(screen.getByTitle('50 Silber')).toBeInTheDocument()
  })

  it('shows a copper coin even when the purse is empty', () => {
    render(<QuestDetail quest={quest({ coins: { gold: 0, silver: 0, copper: 0 } })} />)
    expect(screen.getByTitle('0 Kupfer')).toBeInTheDocument()
  })

  it('names the series the quest belongs to', () => {
    render(<QuestDetail quest={quest()} />)
    expect(screen.getByRole('link', { name: /Krieg der Dornen/ })).toHaveAttribute(
      'href',
      'https://jira.test/browse/PRO-42',
    )
  })

  it('leaves out the series when the issue has no parent', () => {
    render(<QuestDetail quest={quest({ seriesKey: null, seriesName: null })} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText('Questreihe')).not.toBeInTheDocument()
  })

  it('does not repeat the title when the objective is only the title again', () => {
    const title = 'Die Stunde der Abrechnung'
    render(<QuestDetail quest={quest({ objective: title, description: '' })} />)
    expect(screen.getAllByText(title)).toHaveLength(1)
  })

  it('lists type, priority, status and hero as labelled facts', () => {
    render(<QuestDetail quest={quest()} />)
    const facts = screen.getByText('Status').closest('dl')!
    expect(facts).toHaveTextContent('ArtStory')
    expect(facts).toHaveTextContent('PrioritätMajor')
    expect(facts).toHaveTextContent('StatusIn Progress')
    expect(facts).toHaveTextContent('HeldTimo')
  })

  it('marks a quest nobody has taken yet', () => {
    render(<QuestDetail quest={quest({ assignee: null })} />)
    expect(screen.getByText('noch frei')).toBeInTheDocument()
  })

  it('counts a single story point in the singular', () => {
    render(<QuestDetail quest={quest({ points: 1 })} />)
    expect(screen.getByText('1 Story Point')).toBeInTheDocument()
  })

  it('names an unknown reporter rather than leaving the seal blank', () => {
    render(<QuestDetail quest={quest({ giver: null })} />)
    expect(screen.getAllByText('Unbekannter Auftraggeber')).toHaveLength(2)
  })

  it('asks for a quest when none is chosen', () => {
    render(<QuestDetail quest={null} />)
    expect(screen.getByText(/Wähle links eine Quest/)).toBeInTheDocument()
  })

  it('leaves the actions to the bar under the sheet', () => {
    render(<QuestDetail quest={quest()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
