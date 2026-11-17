import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PagePayload, Payload, Quest, QuestlogInfo } from '../../shared/questlog/types'
import { Questlog } from './Questlog'
import * as api from './api'
import { en, StringsContext } from './strings'

vi.mock('./api')

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
  giver: 'Anduin Wrynn',
  objective: 'Sprich mit Mathias Shaw.',
  description: '',
  labels: [],
  experience: 1650,
  coins: { gold: 12, silver: 50, copper: 0 },
  webUrl: 'https://jira.test/browse/PRO-1',
  ...over,
})

const info: QuestlogInfo = {
  pages: [
    { id: 'ki', title: 'KI', canCreate: true },
    { id: 'lesen', title: 'Chronik', canCreate: false },
  ],
  refreshSeconds: 0,
  jiraBaseUrl: 'https://jira.test',
}

const payload = (quests: Quest[], over: Partial<PagePayload> = {}): Payload<PagePayload> => ({
  data: {
    page: { id: 'ki', title: 'KI', canCreate: true },
    jql: 'sprint = 99',
    chapter: 'Sprint 12',
    series: [{ key: 'PRO-100', name: 'Krieg der Dornen', webUrl: 'https://jira.test/browse/PRO-100', epic: null, quests }],
    total: quests.length,
    complete: quests.filter((entry) => entry.state === 'complete').length,
    ...over,
  },
  fetchedAt: '2026-10-26T08:00:00.000Z',
  stale: false,
  error: null,
})

const quests = [quest({}), quest({ key: 'PRO-2', title: 'Der Seelenjäger', state: 'complete' })]

beforeEach(() => {
  // Without the reset the call counts add up across the whole file.
  vi.resetAllMocks()
  vi.mocked(api.getQuestlog).mockResolvedValue(info)
  vi.mocked(api.getPage).mockResolvedValue(payload(quests))
})

describe('Questlog in English', () => {
  const inEnglish = () =>
    render(
      <StringsContext value={en}>
        <Questlog />
      </StringsContext>,
    )

  it('labels the whole frame in English', async () => {
    inEnglish()

    expect(await screen.findByText('Quests: 1/2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create quest' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Show Map/ })).toBeInTheDocument()
  })

  it('labels the parchment and its actions in English', async () => {
    inEnglish()
    await screen.findByText('Quests: 1/2')

    expect(await screen.findByText('Quest giver')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rewards' })).toBeInTheDocument()
    expect(screen.getByText('Experience')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Accept quest' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete quest' })).toBeInTheDocument()
  })

  it('leaves the ticket text alone — only the frame is translated', async () => {
    inEnglish()

    expect(await screen.findByRole('heading', { name: 'Die Stunde der Abrechnung' })).toBeInTheDocument()
    expect(screen.getByText('Sprich mit Mathias Shaw.')).toBeInTheDocument()
    expect(screen.getAllByText('Krieg der Dornen').length).toBeGreaterThan(0)
  })

  it('says it in English when taking a quest fails', async () => {
    vi.mocked(api.acceptQuest).mockResolvedValue({
      key: 'PRO-1',
      status: null,
      assignee: 'Julien',
    })
    inEnglish()
    await screen.findByText('Quests: 1/2')

    await userEvent.click(await screen.findByRole('button', { name: 'Accept quest' }))

    expect(await screen.findByText('Julien took PRO-1')).toBeInTheDocument()
  })
})

describe('Questlog', () => {
  it('opens the first page and selects the first quest', async () => {
    render(<Questlog />)

    expect(await screen.findByText('Quests: 1/2')).toBeInTheDocument()
    // The quest is picked in a follow-up render, so this has to be awaited too.
    expect(
      await screen.findByRole('heading', { name: 'Die Stunde der Abrechnung' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Sprich mit Mathias Shaw.')).toBeInTheDocument()
  })

  it('keeps the banner to the plain word, sprint and all out of it', async () => {
    render(<Questlog />)
    const banner = await screen.findByRole('heading', { level: 1 })
    expect(banner).toHaveTextContent(/^Questlog$/)
    // The sprint is not lost, it only moved out of the way.
    expect(await screen.findByTitle('Sprint 12')).toHaveTextContent('Quests: 1/2')
  })

  it('switches the book to another page', async () => {
    render(<Questlog />)
    await screen.findByText('Quests: 1/2')

    await userEvent.click(screen.getByRole('tab', { name: /Chronik/ }))

    expect(screen.getByRole('tab', { name: /Chronik/ })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(api.getPage).toHaveBeenCalledWith('lesen'))
  })

  it('cycles the filter and hides what does not match', async () => {
    render(<Questlog />)
    await screen.findByText('Quests: 1/2')

    // Only "Alle" is ticked; every narrower filter leaves the box empty.
    expect(screen.getByRole('button', { name: /Alle/ })).toHaveTextContent('−')

    await userEvent.click(screen.getByRole('button', { name: /Alle/ }))

    expect(screen.getByRole('button', { name: /Offen/ })).not.toHaveTextContent('−')
    expect(screen.queryByRole('button', { name: /Seelenjäger/ })).not.toBeInTheDocument()
  })

  it('is the whole app — there is no control to close the book', async () => {
    render(<Questlog />)
    await screen.findByText('Quests: 1/2')

    const banner = screen.getByRole('heading', { level: 1 })
    expect(banner.parentElement!.querySelector('button')).toBeNull()
  })

  it('hands out a quest and makes the giver its reporter', async () => {
    vi.mocked(api.createQuest).mockResolvedValue({
      key: 'PRO-77',
      webUrl: 'https://jira.test/browse/PRO-77',
    })
    render(<Questlog />)
    await screen.findByText('Quests: 1/2')

    await userEvent.click(screen.getByRole('button', { name: 'Quest erstellen' }))
    await userEvent.type(screen.getByLabelText('Titel'), 'Hilf mir')
    await userEvent.type(screen.getByLabelText('Auftrag'), 'Sprich mit Shaw.')
    await userEvent.type(screen.getByLabelText('Story Points'), '5')
    await userEvent.selectOptions(screen.getByLabelText('Priorität'), 'Blocker')
    await userEvent.click(screen.getByRole('button', { name: 'Aushändigen' }))

    await waitFor(() =>
      expect(api.createQuest).toHaveBeenCalledWith('ki', {
        title: 'Hilf mir',
        description: 'Sprich mit Shaw.',
        points: 5,
        priority: 'Blocker',
      }),
    )
    expect(await screen.findByText(/PRO-77 ist vergeben/)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open')
    // Without the reload the new quest would not show up until the next poll.
    await waitFor(() => expect(api.getPage).toHaveBeenCalledTimes(2))
  })

  it('keeps the form open and shows what Jira complained about', async () => {
    vi.mocked(api.createQuest).mockRejectedValue(new Error('Jira 403 Forbidden'))
    render(<Questlog />)
    await screen.findByText('Quests: 1/2')

    await userEvent.click(screen.getByRole('button', { name: 'Quest erstellen' }))
    await userEvent.type(screen.getByLabelText('Titel'), 'Hilf mir')
    await userEvent.click(screen.getByRole('button', { name: 'Aushändigen' }))

    expect(await screen.findByText('Jira 403 Forbidden')).toBeInTheDocument()
    expect(screen.getByLabelText('Titel')).toBeInTheDocument()
  })

  it('starts the form blank when it is opened again', async () => {
    render(<Questlog />)
    await screen.findByText('Quests: 1/2')

    await userEvent.click(screen.getByRole('button', { name: 'Quest erstellen' }))
    await userEvent.type(screen.getByLabelText('Titel'), 'Verworfen')
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Quest erstellen' }))

    expect(screen.getByLabelText('Titel')).toHaveValue('')
  })

  it('takes a quest and reloads the page', async () => {
    vi.mocked(api.acceptQuest).mockResolvedValue({
      key: 'PRO-1',
      status: 'In Progress',
      assignee: 'Julien',
    })
    render(<Questlog />)
    await screen.findByText('Quests: 1/2')

    await userEvent.click(await screen.findByRole('button', { name: 'Quest annehmen' }))

    await waitFor(() => expect(api.acceptQuest).toHaveBeenCalledWith('ki', 'PRO-1'))
    expect(await screen.findByText(/PRO-1 übernimmt Julien, Status In Progress/)).toBeInTheDocument()
    // The assignee and the status changed; the cached page still shows the old one.
    await waitFor(() => expect(api.getPage).toHaveBeenCalledTimes(2))
  })

  it('leaves the status out of the notice when no transition fitted', async () => {
    vi.mocked(api.acceptQuest).mockResolvedValue({ key: 'PRO-1', status: null, assignee: 'Julien' })
    render(<Questlog />)
    await screen.findByText('Quests: 1/2')

    await userEvent.click(await screen.findByRole('button', { name: 'Quest annehmen' }))

    expect(await screen.findByText('PRO-1 übernimmt Julien')).toBeInTheDocument()
  })

  it('says why taking a quest failed', async () => {
    vi.mocked(api.acceptQuest).mockRejectedValue(new Error('Jira 403 Forbidden'))
    render(<Questlog />)
    await screen.findByText('Quests: 1/2')

    await userEvent.click(await screen.findByRole('button', { name: 'Quest annehmen' }))

    expect(await screen.findByText('Jira 403 Forbidden')).toBeInTheDocument()
  })

  it('hands a quest in and reloads the page', async () => {
    vi.mocked(api.completeQuest).mockResolvedValue({ key: 'PRO-1', status: 'Done' })
    render(<Questlog />)
    await screen.findByText('Quests: 1/2')

    await userEvent.click(await screen.findByRole('button', { name: 'Quest abgeben' }))

    await waitFor(() => expect(api.completeQuest).toHaveBeenCalledWith('ki', 'PRO-1'))
    expect(await screen.findByText('PRO-1 ist abgegeben, Status Done')).toBeInTheDocument()
    // The status changed; the cached page still shows the old one.
    await waitFor(() => expect(api.getPage).toHaveBeenCalledTimes(2))
  })

  it('says why handing a quest in failed', async () => {
    vi.mocked(api.completeQuest).mockRejectedValue(
      new Error('PRO-1 has no transition into a done status'),
    )
    render(<Questlog />)
    await screen.findByText('Quests: 1/2')

    await userEvent.click(await screen.findByRole('button', { name: 'Quest abgeben' }))

    expect(
      await screen.findByText('PRO-1 has no transition into a done status'),
    ).toBeInTheDocument()
    // A failed hand-in must not be mistaken for a done quest.
    expect(api.getPage).toHaveBeenCalledTimes(1)
  })

  describe('an epic on the sheet', () => {
    const epic = quest({
      key: 'PRO-100',
      title: 'Krieg der Dornen',
      issueType: 'Epic',
      status: 'In Progress',
      objective: 'Die Horde marschiert.',
      description: 'Halte die Linie.',
      seriesKey: null,
      seriesName: null,
    })

    const withEpic = () =>
      vi.mocked(api.getPage).mockResolvedValue(
        payload(quests, {
          series: [
            {
              key: 'PRO-100',
              name: 'Krieg der Dornen',
              webUrl: 'https://jira.test/browse/PRO-100',
              epic,
              quests,
            },
          ],
        }),
      )

    it('reads the epic on the parchment instead of opening Jira', async () => {
      withEpic()
      render(<Questlog />)
      await screen.findByText('Quests: 1/2')

      await userEvent.click(screen.getByRole('button', { name: 'Krieg der Dornen' }))

      expect(await screen.findByRole('heading', { name: 'Krieg der Dornen' })).toBeInTheDocument()
      expect(screen.getByText('Die Horde marschiert.')).toBeInTheDocument()
      expect(screen.getByText('Halte die Linie.')).toBeInTheDocument()
    })

    it('greys both actions out, because an epic is read and not taken', async () => {
      withEpic()
      render(<Questlog />)
      await screen.findByText('Quests: 1/2')

      await userEvent.click(screen.getByRole('button', { name: 'Krieg der Dornen' }))

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Quest annehmen' })).toBeDisabled(),
      )
      expect(screen.getByRole('button', { name: 'Quest abgeben' })).toBeDisabled()
    })

    it('goes back to a story and hands the buttons back', async () => {
      withEpic()
      render(<Questlog />)
      await screen.findByText('Quests: 1/2')

      await userEvent.click(screen.getByRole('button', { name: 'Krieg der Dornen' }))
      await userEvent.click(screen.getByRole('button', { name: /Seelenjäger/ }))

      expect(await screen.findByRole('heading', { name: 'Der Seelenjäger' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Quest annehmen' })).toBeEnabled()
    })
  })

  it('does not offer to create quests on a read-only page', async () => {
    render(<Questlog />)
    await screen.findByText('Quests: 1/2')

    await userEvent.click(screen.getByRole('tab', { name: /Chronik/ }))

    expect(screen.getByRole('button', { name: 'Quest erstellen' })).toBeDisabled()
  })

  it('says why a page stayed empty', async () => {
    vi.mocked(api.getPage).mockRejectedValue(new Error('Jira 502 Bad Gateway'))
    render(<Questlog />)
    expect(await screen.findByText(/Jira 502 Bad Gateway/)).toBeInTheDocument()
  })

  it('warns that a stale page is being shown', async () => {
    vi.mocked(api.getPage).mockResolvedValue({
      ...payload(quests),
      stale: true,
      error: 'Jira 502 Bad Gateway',
    })
    render(<Questlog />)
    expect(await screen.findByText(/Stand ist älter: Jira 502/)).toBeInTheDocument()
  })
})

describe('Questlog opened on a quest', () => {
  const chronicle = payload(
    [quest({ key: 'LES-4', title: 'Das Vorwort' }), quest({ key: 'LES-5', title: 'Die Chronik der Zeit' })],
    { page: { id: 'lesen', title: 'Chronik', canCreate: false } },
  )

  beforeEach(() => {
    vi.mocked(api.getPage).mockImplementation(async (id) => (id === 'lesen' ? chronicle : payload(quests)))
  })

  it('selects the given quest instead of the first one', async () => {
    render(<Questlog initialKey="PRO-2" />)

    expect(await screen.findByRole('heading', { name: 'Der Seelenjäger' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Die Stunde der Abrechnung' })).not.toBeInTheDocument()
  })

  it('turns to the page that holds the quest', async () => {
    render(<Questlog initialKey="LES-5" />)

    expect(await screen.findByRole('heading', { name: 'Die Chronik der Zeit' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Chronik' })).toHaveAttribute('aria-selected', 'true')
  })

  it('falls back to the first quest of the last page when no page holds it', async () => {
    render(<Questlog initialKey="XYZ-9" />)

    expect(await screen.findByRole('heading', { name: 'Das Vorwort' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Chronik' })).toHaveAttribute('aria-selected', 'true')
  })

  it('stops looking once a page is picked by hand', async () => {
    vi.mocked(api.getQuestlog).mockResolvedValue({
      ...info,
      pages: [...info.pages, { id: 'anhang', title: 'Anhang', canCreate: false }],
    })
    vi.mocked(api.getPage).mockImplementation((id) =>
      id === 'ki'
        ? new Promise(() => undefined)
        : Promise.resolve(
            id === 'lesen'
              ? chronicle
              : payload([quest({ key: 'PRO-2', title: 'Der Seelenjäger' })], {
                  page: { id: 'anhang', title: 'Anhang', canCreate: false },
                }),
          ),
    )
    render(<Questlog initialKey="PRO-2" />)

    await userEvent.click(await screen.findByRole('tab', { name: 'Chronik' }))

    expect(await screen.findByRole('heading', { name: 'Das Vorwort' })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByRole('tab', { name: 'Chronik' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('heading', { name: 'Der Seelenjäger' })).not.toBeInTheDocument()
  })
})
