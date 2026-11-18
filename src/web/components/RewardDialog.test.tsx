import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RewardDraft } from '../../shared/rewards.js'
import * as api from '../api.js'
import { preview, RewardDialog, SEARCH_DELAY_MS, weightsOf } from './RewardDialog.js'

vi.mock('../api.js')

const draft = (over: Partial<RewardDraft> = {}): RewardDraft => ({
  key: 'PRO-1',
  title: 'Export als PDF bricht ab',
  webUrl: 'https://jira.test/browse/PRO-1',
  difficulty: 'difficult',
  experience: 1200,
  coins: { gold: 5, silver: 0, copper: 0 },
  giver: { id: 'u0', name: 'Anna Berg' },
  completedAt: '2026-11-11T09:00:00.000Z',
  dueAt: '2026-11-20T17:00:00.000Z',
  distributedAt: null,
  distributedBy: null,
  mayDistribute: true,
  shares: [
    { id: 'u1', name: 'Ben Cohn', share: 0.7, experience: null, coins: null },
    { id: 'u3', name: 'Dirk Elm', share: 0.3, experience: null, coins: null },
  ],
  ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

const dialog = async (value: RewardDraft = draft()) => {
  vi.mocked(api.getReward).mockResolvedValue(value)
  const handlers = { onClose: vi.fn(), onDistributed: vi.fn() }
  render(<RewardDialog questKey="PRO-1" {...handlers} />)
  await screen.findByRole('heading', { name: value.title })
  return handlers
}

const row = (name: string) => within(screen.getByRole('list', { name: 'Beteiligte' })).getByText(name).closest('li')!

describe('weightsOf', () => {
  it('turns the proposal into whole percent', () => {
    expect(weightsOf(draft()).map((entry) => entry.share)).toEqual([70, 30])
  })
})

describe('preview', () => {
  it('computes every part exactly as the server will', () => {
    expect(preview(draft(), [{ id: 'a', name: 'A', share: 1 }, { id: 'b', name: 'B', share: 2 }])).toEqual([
      { id: 'a', name: 'A', share: 1, part: 1 / 3, experience: 400, coins: { gold: 1, silver: 66, copper: 67 } },
      { id: 'b', name: 'B', share: 2, part: 2 / 3, experience: 800, coins: { gold: 3, silver: 33, copper: 33 } },
    ])
  })
})

describe('RewardDialog', () => {
  it('shows the proposal with each part for the giver', async () => {
    await dialog()

    expect(row('Ben Cohn')).toHaveTextContent('70 %840 XP350')
    expect(row('Dirk Elm')).toHaveTextContent('30 %360 XP150')
    expect(screen.getByText(/Verteilt sich am 20. November 2026 von selbst nach Vorschlag$/)).toBeInTheDocument()
  })

  it('moves the parts along with the sliders', async () => {
    await dialog()

    fireEvent.change(screen.getByRole('slider', { name: 'Anteil Dirk Elm' }), { target: { value: '70' } })

    expect(row('Dirk Elm')).toHaveTextContent('50 %600 XP')
    expect(row('Ben Cohn')).toHaveTextContent('50 %600 XP')
  })

  it('shares evenly on request and drops a person', async () => {
    await dialog()

    fireEvent.click(screen.getByRole('button', { name: 'Gleich verteilen' }))
    expect(row('Ben Cohn')).toHaveTextContent('50 %')

    fireEvent.click(screen.getByRole('button', { name: 'Ben Cohn entfernen' }))
    expect(screen.queryByText('Ben Cohn')).not.toBeInTheDocument()
    expect(row('Dirk Elm')).toHaveTextContent('100 %1.200 XP')
  })

  it('finds people in Jira and adds them with an average part', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(api.searchUsers).mockResolvedValue([
      { id: 'u2', name: 'Cara Dietz' },
      { id: 'u1', name: 'Ben Cohn' },
    ])
    await dialog()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Beteiligte suchen' }), { target: { value: 'ca' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS)
    })
    const results = await screen.findByRole('list', { name: 'Gefundene Personen' })
    expect(api.searchUsers).toHaveBeenCalledWith('ca')

    fireEvent.click(within(results).getByRole('button', { name: 'Cara Dietz' }))

    expect(row('Cara Dietz')).toHaveTextContent('33 %')
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.queryByRole('list', { name: 'Gefundene Personen' })).not.toBeInTheDocument()
  })

  it('does not add somebody twice', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(api.searchUsers).mockResolvedValue([{ id: 'u1', name: 'Ben Cohn' }])
    await dialog()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ben' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS)
    })
    fireEvent.click(within(await screen.findByRole('list', { name: 'Gefundene Personen' })).getByRole('button'))

    expect(screen.getAllByRole('slider')).toHaveLength(2)
  })

  it('does not search for a single letter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await dialog()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'c' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS * 2)
    })

    expect(api.searchUsers).not.toHaveBeenCalled()
  })

  it('sends the weights and shows the result', async () => {
    const handlers = await dialog()
    vi.mocked(api.distributeReward).mockResolvedValue(
      draft({
        distributedAt: '2026-11-12T10:00:00.000Z',
        distributedBy: 'u0',
        mayDistribute: false,
        shares: [
          { id: 'u1', name: 'Ben Cohn', share: 0.7, experience: 840, coins: { gold: 3, silver: 50, copper: 0 } },
          { id: 'u3', name: 'Dirk Elm', share: 0.3, experience: 360, coins: { gold: 1, silver: 50, copper: 0 } },
        ],
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Verteilen' }))

    await screen.findByText('Am 12. November 2026 von Anna Berg verteilt')
    expect(api.distributeReward).toHaveBeenCalledWith('PRO-1', [
      { id: 'u1', name: 'Ben Cohn', share: 70 },
      { id: 'u3', name: 'Dirk Elm', share: 30 },
    ])
    expect(handlers.onDistributed).toHaveBeenCalledOnce()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(row('Ben Cohn')).toHaveTextContent('70 %840 XP')
  })

  it('shows why the distribution failed and keeps the dialog editable', async () => {
    const handlers = await dialog()
    vi.mocked(api.distributeReward).mockRejectedValue(new Error('PRO-1 ist bereits verteilt'))

    fireEvent.click(screen.getByRole('button', { name: 'Verteilen' }))

    expect(await screen.findByText('PRO-1 ist bereits verteilt')).toBeInTheDocument()
    expect(handlers.onDistributed).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Verteilen' })).toBeEnabled()
  })

  it('cannot distribute without anybody', async () => {
    await dialog(draft({ shares: [] }))

    expect(screen.getByText('Niemand eingetragen – füge Beteiligte hinzu.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verteilen' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Gleich verteilen' })).toBeDisabled()
  })

  it('only shows the proposal to anybody but the giver', async () => {
    await dialog(draft({ mayDistribute: false }))

    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verteilen' })).not.toBeInTheDocument()
    expect(screen.getByText(/nur Anna Berg kann verteilen$/)).toBeInTheDocument()
  })

  it('names automatic and old distributions as such', async () => {
    await dialog(
      draft({
        distributedAt: '2026-11-21T00:00:00.000Z',
        distributedBy: 'auto',
        mayDistribute: false,
        shares: [{ id: 'u1', name: 'Ben Cohn', share: 1, experience: 1200, coins: { gold: 5, silver: 0, copper: 0 } }],
      }),
    )

    expect(screen.getByText('Am 21. November 2026 automatisch nach Vorschlag verteilt')).toBeInTheDocument()
  })

  it('names quests from before the cutoff', async () => {
    await dialog(draft({ distributedAt: '2026-10-01T00:00:00.000Z', distributedBy: 'legacy', mayDistribute: false }))

    expect(screen.getByText('Vor dem Stichtag erledigt, ganz an den Bearbeiter')).toBeInTheDocument()
  })

  it('says why the reward could not be loaded', async () => {
    vi.mocked(api.getReward).mockRejectedValue(new Error('Keine Belohnung zu PRO-1 hinterlegt'))
    render(<RewardDialog questKey="PRO-1" onClose={() => undefined} onDistributed={() => undefined} />)

    await waitFor(() => expect(screen.getByText('Keine Belohnung zu PRO-1 hinterlegt')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'PRO-1' })).toBeInTheDocument()
  })
})
