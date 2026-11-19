import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Quest, RewardState } from '../../../shared/questlog/types'
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

interface Setup {
  quest?: Quest | null
  reward?: RewardState | null
  busy?: 'accept' | 'complete' | 'abandon' | null
  onAccept?: (quest: Quest) => void
  onComplete?: (quest: Quest) => void
  onAbandon?: (quest: Quest) => void
}

const actions = (over: Setup = {}) =>
  render(
    <QuestActions
      quest={over.quest === undefined ? quest() : over.quest}
      reward={over.reward ?? null}
      busy={over.busy ?? null}
      onAccept={over.onAccept ?? noop}
      onComplete={over.onComplete ?? noop}
      onAbandon={over.onAbandon ?? noop}
    />,
  )

const button = (name: string) => screen.getByRole('button', { name })

describe('QuestActions', () => {
  describe('an open quest', () => {
    it('offers to accept it', async () => {
      const onAccept = vi.fn()
      actions({ quest: quest({ state: 'available' }), onAccept })

      await userEvent.click(button('Quest annehmen'))

      expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ key: 'PRO-42' }))
      expect(screen.queryByRole('button', { name: 'Quest abgeben' })).not.toBeInTheDocument()
    })

    it('greys out abandoning, there is nothing to give back yet', () => {
      actions({ quest: quest({ state: 'available' }) })

      expect(button('Quest abbrechen')).toBeDisabled()
      expect(button('Quest abbrechen')).toHaveAttribute('title', 'Erst eine angenommene Quest lässt sich abbrechen')
    })
  })

  describe('an accepted quest', () => {
    it('turns the accept button into handing in', async () => {
      const onComplete = vi.fn()
      actions({ onComplete })

      await userEvent.click(button('Quest abgeben'))

      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ key: 'PRO-42' }))
      expect(screen.queryByRole('button', { name: 'Quest annehmen' })).not.toBeInTheDocument()
    })

    it('can be abandoned next to it', async () => {
      const onAbandon = vi.fn()
      actions({ onAbandon })

      await userEvent.click(button('Quest abbrechen'))

      expect(onAbandon).toHaveBeenCalledWith(expect.objectContaining({ key: 'PRO-42' }))
    })

    it('cannot be handed in again once it was rewarded', () => {
      actions({ reward: 'paid' })

      expect(button('Quest abgeben')).toBeDisabled()
      expect(button('Quest abgeben')).toHaveAttribute('title', expect.stringContaining('schon eine Belohnung'))
    })

    it('cannot be handed in again while the reward waits for its giver', () => {
      actions({ reward: 'pending' })

      expect(button('Quest abgeben')).toBeDisabled()
    })
  })

  describe('a handed in quest', () => {
    it('says so and offers no second hand-in', () => {
      actions({ quest: quest({ state: 'complete' }) })

      expect(button('Abgegeben')).toBeDisabled()
    })

    it('can still be abandoned while the reward is pending', async () => {
      const onAbandon = vi.fn()
      actions({ quest: quest({ state: 'complete' }), reward: 'pending', onAbandon })

      await userEvent.click(button('Quest abbrechen'))

      expect(onAbandon).toHaveBeenCalledOnce()
    })

    it('stays closed once the reward is paid out', () => {
      actions({ quest: quest({ state: 'complete' }), reward: 'paid' })

      expect(button('Quest abbrechen')).toBeDisabled()
      expect(button('Quest abbrechen')).toHaveAttribute('title', expect.stringContaining('ausgeschüttet'))
    })
  })

  it('blocks both buttons while the quest is being taken', () => {
    actions({ quest: quest({ state: 'available' }), busy: 'accept' })

    expect(button('Wird übernommen …')).toBeDisabled()
    expect(button('Quest abbrechen')).toBeDisabled()
  })

  it('blocks both buttons while the quest is being handed in', () => {
    actions({ busy: 'complete' })

    expect(button('Wird abgegeben …')).toBeDisabled()
    expect(button('Quest abbrechen')).toBeDisabled()
  })

  it('blocks both buttons while the quest is being abandoned', () => {
    actions({ busy: 'abandon' })

    expect(button('Wird abgebrochen …')).toBeDisabled()
    expect(button('Quest abgeben')).toBeDisabled()
  })

  it('stays in the bar but cannot be used without a quest', () => {
    actions({ quest: null })

    expect(button('Quest annehmen')).toBeDisabled()
    expect(button('Quest abbrechen')).toBeDisabled()
  })
})
