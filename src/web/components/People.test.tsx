import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  CalendarByMember,
  CalendarEntry,
  CommitRow,
  TeamMember,
} from '../../shared/types.js'
import { awayOf, isOver, leadOf, People } from './People.js'

const member = (over: Partial<TeamMember> = {}): TeamMember => ({
  name: 'J. Beck',
  initials: 'JB',
  away: null,
  gitlabUser: null,
  self: false,
  avatar: null,
  ...over,
})

const commit = (over: Partial<CommitRow> = {}): CommitRow => ({
  title: 'Ampel laut machen',
  project: 'daily-dashboard',
  ref: 'master',
  count: 1,
  at: '2026-10-18T17:00:00.000Z',
  ...over,
})

const entry = (over: Partial<CalendarEntry> = {}): CalendarEntry => ({
  summary: 'Daily',
  start: '2026-10-19T07:00:00.000Z',
  end: '2026-10-19T07:15:00.000Z',
  allDay: false,
  ...over,
})

const day = (over: Partial<CalendarByMember[string]> = {}): CalendarByMember[string] => ({
  yesterday: [],
  today: [],
  away: null,
  ...over,
})

const render0 = (
  team: TeamMember[],
  commits: Record<string, CommitRow[]> = {},
  calendar: CalendarByMember = {},
) => render(<People team={team} commits={commits} calendar={calendar} />)

const openAll = () => {
  for (const button of screen.getAllByRole('button')) {
    if (button.getAttribute('aria-expanded') === 'false') fireEvent.click(button)
  }
}

beforeEach(() => localStorage.clear())

describe('awayOf', () => {
  it('lets the calendar overrule the handwritten list', () => {
    const calendar = { 'J. Beck': day({ away: 'Urlaub' }) }
    expect(awayOf(member({ away: null }), calendar)).toBe('Urlaub')
  })

  it('falls back to the handwritten list when no calendar is connected', () => {
    expect(awayOf(member({ away: 'Schulung' }), {})).toBe('Schulung')
  })

  it('reports present when neither source says otherwise', () => {
    expect(awayOf(member(), { 'J. Beck': day() })).toBeNull()
  })
})

describe('isOver', () => {
  it('is true once the end time has passed', () => {
    expect(isOver(entry(), new Date('2026-10-19T08:00:00.000Z'))).toBe(true)
  })

  it('is false while the appointment still runs', () => {
    expect(isOver(entry(), new Date('2026-10-19T07:05:00.000Z'))).toBe(false)
  })
})

describe('leadOf', () => {
  it('prefixes an entry from yesterday', () => {
    expect(leadOf(entry(), true)).toMatch(/^gestern \d\d:\d\d$/)
  })

  it('leaves today bare', () => {
    expect(leadOf(entry(), false)).toMatch(/^\d\d:\d\d$/)
  })

  it('says ganztägig instead of a time, on both days', () => {
    expect(leadOf(entry({ allDay: true }), false)).toBe('ganztägig')
    expect(leadOf(entry({ allDay: true }), true)).toBe('gestern ganztägig')
  })
})

describe('People', () => {
  it('counts only the present members in the header', () => {
    render0([member(), member({ name: 'T. Weber', away: 'Urlaub' })])
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('counts an absence that only the calendar knows about', () => {
    render0([member()], {}, { 'J. Beck': day({ away: 'Urlaub' }) })
    expect(screen.getByText('0 / 1')).toBeInTheDocument()
  })

  it('shows the jira picture instead of the initials', () => {
    render0([member({ avatar: '/api/avatar?url=x' })])
    expect(screen.getByRole('img', { name: 'J. Beck' })).toHaveAttribute(
      'src',
      '/api/avatar?url=x',
    )
    expect(screen.queryByText('JB')).not.toBeInTheDocument()
  })

  it('falls back to the initials when jira has no picture for someone', () => {
    render0([member({ avatar: null })])
    expect(screen.queryByRole('img', { name: 'J. Beck' })).not.toBeInTheDocument()
    expect(screen.getByText('JB')).toBeInTheDocument()
  })

  it('dims the picture of an absent member, as it dims the initials', () => {
    render0([member({ avatar: '/api/avatar?url=x', away: 'Urlaub' })])
    expect(screen.getByRole('img', { name: 'J. Beck' }).className).toContain('opacity-45')
  })

  it('names the repository next to the commit, not only in the tooltip', () => {
    render0([member()], { 'J. Beck': [commit({ project: 'ki-backend' })] })
    openAll()
    expect(screen.getByText('ki-backend')).toBeInTheDocument()
  })

  it('lists the commits under the matching developer', () => {
    render0([member()], { 'J. Beck': [commit()] })
    openAll()
    expect(screen.getByText('Ampel laut machen')).toBeInTheDocument()
  })

  it('shows nothing extra for a developer without commits', () => {
    render0([member()], { 'A. Hartmann': [commit()] })
    expect(screen.queryByText('Ampel laut machen')).not.toBeInTheDocument()
  })

  it('marks a push that carried several commits', () => {
    render0([member()], { 'J. Beck': [commit({ count: 7 })] })
    openAll()
    expect(screen.getByText('×7')).toBeInTheDocument()
  })

  it('stays quiet about the count for a single commit', () => {
    render0([member()], { 'J. Beck': [commit({ count: 1 })] })
    expect(screen.queryByText('×1')).not.toBeInTheDocument()
  })

  it('puts the appointments of the same person underneath', () => {
    render0([member()], {}, { 'J. Beck': day({ today: [entry({ summary: 'Refinement' })] }) })
    openAll()
    expect(screen.getByText('Refinement')).toBeInTheDocument()
  })

  it('shows yesterday before today, so the day reads in order', () => {
    render0(
      [member()],
      {},
      {
        'J. Beck': day({
          yesterday: [entry({ summary: 'Retro' })],
          today: [entry({ summary: 'Daily' })],
        }),
      },
    )
    openAll()
    const detail = screen.getAllByRole('list')[1]!
    const texts = within(detail)
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '')
    expect(texts.findIndex((text) => text.includes('Retro'))).toBeLessThan(
      texts.findIndex((text) => text.includes('Daily')),
    )
  })

  it('writes ganztägig instead of a time for an all-day entry', () => {
    render0([member()], {}, { 'J. Beck': day({ today: [entry({ allDay: true })] }) })
    openAll()
    expect(screen.getByText('ganztägig')).toBeInTheDocument()
  })

  it('marks an entry from yesterday, so the two days never blur', () => {
    render0([member()], {}, { 'J. Beck': day({ yesterday: [entry({ summary: 'Retro' })] }) })
    openAll()
    expect(screen.getByText(/^gestern /)).toBeInTheDocument()
  })

  it('starts collapsed, so a full team stays readable', () => {
    render0([member()], { 'J. Beck': [commit()] })
    expect(screen.queryByText('Ampel laut machen')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens and closes again on click', () => {
    render0([member()], { 'J. Beck': [commit()] })
    const button = screen.getByRole('button')

    fireEvent.click(button)
    expect(screen.getByText('Ampel laut machen')).toBeInTheDocument()

    fireEvent.click(button)
    expect(screen.queryByText('Ampel laut machen')).not.toBeInTheDocument()
  })

  it('shows how much is hidden behind a collapsed name', () => {
    render0(
      [member()],
      { 'J. Beck': [commit(), commit({ at: '2026-10-18T18:00:00.000Z' })] },
      { 'J. Beck': day({ today: [entry()] }) },
    )
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('offers no toggle for someone with nothing to show', () => {
    render0([member()])
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('remembers which names were open', () => {
    const { unmount } = render0([member()], { 'J. Beck': [commit()] })
    fireEvent.click(screen.getByRole('button'))
    unmount()

    render0([member()], { 'J. Beck': [commit()] })
    expect(screen.getByText('Ampel laut machen')).toBeInTheDocument()
  })

  it('keeps an absent member visible, with the reason', () => {
    render0([member({ name: 'T. Weber', away: 'Urlaub bis 24.10.' })])
    const row = screen.getAllByRole('listitem')[0]!
    expect(within(row).getByText('Urlaub bis 24.10.')).toBeInTheDocument()
  })
})
