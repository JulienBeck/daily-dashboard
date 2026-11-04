import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { IssueRow } from '../../shared/types.js'
import { applyMoves, bandsOf, openBand, Stories } from './Stories.js'

const issue = (over: Partial<IssueRow> = {}): IssueRow => ({
  key: 'KI-1',
  summary: 'Etwas tun',
  assignee: 'J. Beck',
  initials: 'JB',
  avatar: null,
  points: 3,
  flagged: false,
  lane: 'todo',
  week: 'Woche 1',
  webUrl: 'https://jira.example.com/browse/KI-1',
  ...over,
})

const WEEKS = ['Woche 1', 'Woche 2']

describe('bandsOf', () => {
  it('keeps the configured week order, not the order of the issues', () => {
    const bands = bandsOf(
      [issue({ key: 'a', week: 'Woche 2' }), issue({ key: 'b', week: 'Woche 1' })],
      WEEKS,
    )
    expect(bands.map((band) => band.label)).toEqual(['Woche 1', 'Woche 2'])
  })

  it('drops a week that holds nothing, so an empty band costs no height', () => {
    const bands = bandsOf([issue({ week: 'Woche 1' })], WEEKS)
    expect(bands.map((band) => band.label)).toEqual(['Woche 1'])
  })

  it('collects issues without a week in their own band at the end', () => {
    const bands = bandsOf([issue({ key: 'a', week: null }), issue({ key: 'b' })], WEEKS)
    expect(bands.map((band) => band.label)).toEqual(['Woche 1', 'ohne Woche'])
  })

  it('shows no band at all when there are no issues', () => {
    expect(bandsOf([], WEEKS)).toEqual([])
  })

  it('never loses an issue between the bands', () => {
    const issues = [
      issue({ key: 'a', week: 'Woche 1' }),
      issue({ key: 'b', week: 'Woche 2' }),
      issue({ key: 'c', week: null }),
    ]
    const counted = bandsOf(issues, WEEKS).reduce((total, band) => total + band.issues.length, 0)
    expect(counted).toBe(3)
  })
})

describe('openBand', () => {
  const bands = bandsOf([issue({ key: 'a' }), issue({ key: 'b', week: 'Woche 2' })], WEEKS)

  it('opens the first week while more than a week of the sprint is left', () => {
    expect(openBand(bands, WEEKS, 6)).toBe('Woche 1')
  })

  it('opens the second week once a week or less is left', () => {
    expect(openBand(bands, WEEKS, 5)).toBe('Woche 2')
  })

  it('opens the first week when the sprint says nothing about its length', () => {
    expect(openBand(bands, WEEKS, null)).toBe('Woche 1')
  })

  it('falls back to the first band when the wanted week holds nothing', () => {
    const only = bandsOf([issue({ key: 'a', week: 'Woche 1' })], WEEKS)
    expect(openBand(only, WEEKS, 1)).toBe('Woche 1')
  })

  it('opens nothing when the board is empty', () => {
    expect(openBand([], WEEKS, 3)).toBeNull()
  })
})

describe('Stories', () => {
  it('splits the board horizontally by week', () => {
    render(
      <Stories
        issues={[
          issue({ key: 'KI-1', week: 'Woche 1' }),
          issue({ key: 'KI-2', week: 'Woche 2', lane: 'doing' }),
        ]}
        weeks={WEEKS}
      />,
    )
    expect(screen.getByText('Woche 1')).toBeInTheDocument()
    expect(screen.getByText('Woche 2')).toBeInTheDocument()
  })

  it('counts the points of each band separately', () => {
    render(
      <Stories
        issues={[
          issue({ key: 'KI-1', week: 'Woche 1', points: 8 }),
          issue({ key: 'KI-2', week: 'Woche 1', points: 5 }),
          issue({ key: 'KI-3', week: 'Woche 2', points: 3 }),
        ]}
        weeks={WEEKS}
      />,
    )
    const bandTotal = (label: string) =>
      screen.getByText(label).parentElement!.querySelector('.num')!.textContent
    expect(bandTotal('Woche 1')).toBe('13 P')
    expect(bandTotal('Woche 2')).toBe('3 P')
  })

  it('counts a lane across both weeks in the column header', () => {
    render(
      <Stories
        issues={[
          issue({ key: 'KI-1', week: 'Woche 1', lane: 'todo' }),
          issue({ key: 'KI-2', week: 'Woche 2', lane: 'todo' }),
        ]}
        weeks={WEEKS}
      />,
    )
    const heading = screen.getByRole('heading', { name: /To Do/ })
    expect(within(heading).getByText('2')).toBeInTheDocument()
  })

  it('puts a flagged issue in the critical colour, not the season accent', () => {
    render(<Stories issues={[issue({ flagged: true })]} weeks={WEEKS} />)
    expect(screen.getByTitle('blockiert')).toBeInTheDocument()
  })

  it('shows the jira avatar when there is one', () => {
    render(<Stories issues={[issue({ avatar: '/api/avatar?url=x' })]} weeks={WEEKS} />)
    expect(screen.getByRole('img', { name: 'J. Beck' })).toHaveAttribute(
      'src',
      '/api/avatar?url=x',
    )
  })

  it('falls back to the initials when jira has no avatar', () => {
    render(<Stories issues={[issue({ avatar: null })]} weeks={WEEKS} />)
    expect(screen.queryByRole('img', { name: 'J. Beck' })).not.toBeInTheDocument()
    expect(screen.getByText('JB')).toBeInTheDocument()
  })
})

describe('Stories accordion', () => {
  const both = [
    issue({ key: 'KI-1', week: 'Woche 1' }),
    issue({ key: 'KI-2', week: 'Woche 2' }),
  ]

  it('shows the cards of one week only, so they fit the panel', () => {
    render(<Stories issues={both} weeks={WEEKS} workdaysLeft={8} />)
    expect(screen.getByText('KI-1')).toBeInTheDocument()
    expect(screen.queryByText('KI-2')).not.toBeInTheDocument()
  })

  it('opens the week the sprint is actually in', () => {
    render(<Stories issues={both} weeks={WEEKS} workdaysLeft={3} />)
    expect(screen.queryByText('KI-1')).not.toBeInTheDocument()
    expect(screen.getByText('KI-2')).toBeInTheDocument()
  })

  it('swaps the open week when the other chip is clicked', () => {
    render(<Stories issues={both} weeks={WEEKS} workdaysLeft={8} />)

    fireEvent.click(screen.getByText('Woche 2'))

    expect(screen.getByText('KI-2')).toBeInTheDocument()
    expect(screen.queryByText('KI-1')).not.toBeInTheDocument()
    expect(screen.getByText('Woche 1')).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the open week when its own chip is clicked', () => {
    render(<Stories issues={both} weeks={WEEKS} workdaysLeft={8} />)

    fireEvent.click(screen.getByText('Woche 1'))

    expect(screen.queryByText('KI-1')).not.toBeInTheDocument()
    expect(screen.queryByText('KI-2')).not.toBeInTheDocument()
  })

  it('says how many issues a closed week hides', () => {
    render(
      <Stories
        issues={[...both, issue({ key: 'KI-3', week: 'Woche 2' })]}
        weeks={WEEKS}
        workdaysLeft={8}
      />,
    )
    expect(screen.getByText('2 Vorgänge')).toBeInTheDocument()
  })

  it('keeps counting the points of a closed week in its chip row', () => {
    render(<Stories issues={both} weeks={WEEKS} workdaysLeft={8} />)
    const row = screen.getByText('Woche 2').parentElement!
    expect(within(row).getByText('3 P')).toBeInTheDocument()
  })
})

describe('applyMoves', () => {
  it('shows an issue in the column it was dropped into', () => {
    const moved = applyMoves([issue({ key: 'KI-1', lane: 'todo' })], { 'KI-1': 'done' })
    expect(moved[0]!.lane).toBe('done')
  })

  it('leaves every other issue untouched', () => {
    const rows = [issue({ key: 'KI-1' }), issue({ key: 'KI-2', lane: 'doing' })]
    expect(applyMoves(rows, { 'KI-1': 'done' })[1]!.lane).toBe('doing')
  })

  it('ignores a move for an issue that is no longer on the board', () => {
    const rows = [issue({ key: 'KI-1', lane: 'todo' })]
    expect(applyMoves(rows, { 'KI-9': 'done' })).toEqual(rows)
  })
})

describe('Stories drag and drop', () => {
  const dataTransfer = () => {
    const store: Record<string, string> = {}
    return {
      setData: (type: string, value: string) => void (store[type] = value),
      getData: (type: string) => store[type] ?? '',
      effectAllowed: '',
      dropEffect: '',
    }
  }

  const dragTo = (key: string, lane: string, band = 'Woche 1') => {
    const transfer = dataTransfer()
    const card = screen.getByText(key).closest('a')!
    fireEvent.dragStart(card, { dataTransfer: transfer })
    const target = screen.getByRole('list', { name: `${lane} · ${band}` })
    fireEvent.dragOver(target, { dataTransfer: transfer })
    fireEvent.drop(target, { dataTransfer: transfer })
  }

  const laneOf = (key: string) =>
    screen.getByText(key).closest('ul')!.getAttribute('aria-label')

  it('tells jira which column the card was dropped into', () => {
    const onMove = vi.fn().mockResolvedValue(undefined)
    render(<Stories issues={[issue({ key: 'KI-1', lane: 'todo' })]} weeks={WEEKS} onMove={onMove} />)

    dragTo('KI-1', 'Erledigt')

    expect(onMove).toHaveBeenCalledWith('KI-1', 'done')
  })

  it('moves the card over before jira has answered', () => {
    let settle = () => {}
    const onMove = vi.fn().mockReturnValue(new Promise<void>((resolve) => (settle = resolve)))
    render(<Stories issues={[issue({ key: 'KI-1', lane: 'todo' })]} weeks={WEEKS} onMove={onMove} />)

    dragTo('KI-1', 'In Arbeit')

    expect(laneOf('KI-1')).toBe('In Arbeit · Woche 1')
    settle()
  })

  it('does not bother jira when the card lands in its own column', () => {
    const onMove = vi.fn().mockResolvedValue(undefined)
    render(<Stories issues={[issue({ key: 'KI-1', lane: 'todo' })]} weeks={WEEKS} onMove={onMove} />)

    dragTo('KI-1', 'To Do')

    expect(onMove).not.toHaveBeenCalled()
  })

  it('puts the card back and says so when jira refuses', async () => {
    const onMove = vi.fn().mockRejectedValue(new Error('Jira 403 Forbidden'))
    render(<Stories issues={[issue({ key: 'KI-1', lane: 'todo' })]} weeks={WEEKS} onMove={onMove} />)

    dragTo('KI-1', 'Erledigt')

    await waitFor(() => expect(laneOf('KI-1')).toBe('To Do · Woche 1'))
    expect(screen.getByTitle('Jira 403 Forbidden')).toBeInTheDocument()
  })

  it('moves the dragged card even when the browser hands over no payload', () => {
    const onMove = vi.fn().mockResolvedValue(undefined)
    render(<Stories issues={[issue({ key: 'KI-1', lane: 'todo' })]} weeks={WEEKS} onMove={onMove} />)

    const empty = { ...dataTransfer(), getData: () => '' }
    fireEvent.dragStart(screen.getByText('KI-1').closest('a')!, { dataTransfer: empty })
    const target = screen.getByRole('list', { name: 'Erledigt · Woche 1' })
    fireEvent.dragOver(target, { dataTransfer: empty })
    fireEvent.drop(target, { dataTransfer: empty })

    expect(onMove).toHaveBeenCalledWith('KI-1', 'done')
  })

  it('stays a read-only board when no handler is given', () => {
    render(<Stories issues={[issue({ key: 'KI-1' })]} weeks={WEEKS} />)
    expect(screen.getByText('KI-1').closest('a')).toHaveAttribute('draggable', 'false')
  })
})
