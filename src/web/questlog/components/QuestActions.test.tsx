import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Quest } from '../../../shared/questlog/types'
import { QuestActions } from './QuestActions'

const quest = (over: Partial<Quest> = {}): Quest => ({
  key: 'PRO-42',
  title: 'Die Stunde der Abrechnung',
  project: 'PRO',
  projectName: 'Produkt',
  seriesKey: null,
  seriesName: null,
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
  description: '',
  labels: [],
  experience: 1650,
  coins: { gold: 12, silver: 50, copper: 0 },
  webUrl: 'https://jira.test/browse/PRO-42',
  ...over,
})

const noop = () => {}

describe('QuestActions', () => {
  it('hands the shown quest to both actions', async () => {
    const onAccept = vi.fn()
    const onComplete = vi.fn()
    render(<QuestActions quest={quest()} busy={null} onAccept={onAccept} onComplete={onComplete} />)

    await userEvent.click(screen.getByRole('button', { name: 'Quest annehmen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Quest abgeben' }))

    expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ key: 'PRO-42' }))
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ key: 'PRO-42' }))
  })

  it('blocks both buttons while the quest is being taken', () => {
    render(<QuestActions quest={quest()} busy="accept" onAccept={noop} onComplete={noop} />)

    expect(screen.getByRole('button', { name: 'Wird übernommen …' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Quest abgeben' })).toBeDisabled()
  })

  it('blocks both buttons while the quest is being handed in', () => {
    render(<QuestActions quest={quest()} busy="complete" onAccept={noop} onComplete={noop} />)

    expect(screen.getByRole('button', { name: 'Wird abgegeben …' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Quest annehmen' })).toBeDisabled()
  })

  it('stays in the bar but cannot be used without a quest', () => {
    render(<QuestActions quest={null} busy={null} onAccept={noop} onComplete={noop} />)

    expect(screen.getByRole('button', { name: 'Quest annehmen' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Quest abgeben' })).toBeDisabled()
  })
})
