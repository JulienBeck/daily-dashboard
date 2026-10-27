import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  CalendarByMember,
  CalendarEntry,
  CommitRow,
  TeamMember,
} from '../../shared/types.js'
import { awayOf, isOver, leadOf, nextAwayOf, People } from './People.js'

const member = (over: Partial<TeamMember> = {}): TeamMember => ({
  name: 'J. Beck',
  initials: 'JB',
  away: null,
  gitlabUser: null,
  self: false,
  avatar: null,
  nextAway: null,
  ...over,
})

const soon = (inDays: number, over: Partial<TeamMember['nextAway'] & object> = {}) => ({
  label: 'Urlaub',
  from: '2026-11-03',
  to: '2026-11-06',
  inDays,
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
  errors: { commitsError?: string | null; calendarError?: string | null } = {},
) => render(<People team={team} commits={commits} calendar={calendar} {...errors} />)

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

describe('nextAwayOf', () => {
  it('says nothing when no absence is coming', () => {
    expect(nextAwayOf(null)).toBeNull()
  })

  it('says morgen instead of naming the weekday', () => {
    expect(nextAwayOf(soon(1))).toBe('Urlaub ab morgen')
  })

  it('names the weekday while it is still this week', () => {
    expect(nextAwayOf(soon(5))).toBe('Urlaub ab Di')
  })

  it('switches to a date once the weekday would be ambiguous', () => {
    expect(nextAwayOf(soon(7))).toMatch(/^Urlaub ab 03\.11\.?$/)
    expect(nextAwayOf(soon(12))).toMatch(/^Urlaub ab 03\.11\.?$/)
  })

  it('carries the label, so a course is not called a holiday', () => {
    expect(nextAwayOf(soon(3, { label: 'Fortbildung' }))).toBe('Fortbildung ab Di')
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
    expect(screen.getByText('ki-backend')).toBeInTheDocument()
  })

  it('lists the commits under the matching developer', () => {
    render0([member()], { 'J. Beck': [commit()] })
    expect(screen.getByText('Ampel laut machen')).toBeInTheDocument()
  })

  it('shows nothing extra for a developer without commits', () => {
    render0([member()], { 'A. Hartmann': [commit()] })
    expect(screen.queryByText('Ampel laut machen')).not.toBeInTheDocument()
  })

  it('marks a push that carried several commits', () => {
    render0([member()], { 'J. Beck': [commit({ count: 7 })] })
    expect(screen.getByText('×7')).toBeInTheDocument()
  })

  it('stays quiet about the count for a single commit', () => {
    render0([member()], { 'J. Beck': [commit({ count: 1 })] })
    expect(screen.queryByText('×1')).not.toBeInTheDocument()
  })

  it('puts the appointments of the same person underneath', () => {
    render0([member()], {}, { 'J. Beck': day({ today: [entry({ summary: 'Refinement' })] }) })
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
    expect(screen.getByText('ganztägig')).toBeInTheDocument()
  })

  it('marks an entry from yesterday, so the two days never blur', () => {
    render0([member()], {}, { 'J. Beck': day({ yesterday: [entry({ summary: 'Retro' })] }) })
    expect(screen.getByText(/^gestern /)).toBeInTheDocument()
  })

  it('starts open, so the commit tree is there without a click', () => {
    render0([member()], { 'J. Beck': [commit()] })
    expect(screen.getByText('Ampel laut machen')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes and opens again on click', () => {
    render0([member()], { 'J. Beck': [commit()] })
    const button = screen.getByRole('button')

    fireEvent.click(button)
    expect(screen.queryByText('Ampel laut machen')).not.toBeInTheDocument()

    fireEvent.click(button)
    expect(screen.getByText('Ampel laut machen')).toBeInTheDocument()
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

  it('remembers which names were folded away by hand', () => {
    const { unmount } = render0([member()], { 'J. Beck': [commit()] })
    fireEvent.click(screen.getByRole('button'))
    unmount()

    render0([member()], { 'J. Beck': [commit()] })
    expect(screen.queryByText('Ampel laut machen')).not.toBeInTheDocument()
  })

  it('opens a name the stored state has never heard of', () => {
    localStorage.setItem('people-open', JSON.stringify({ Timo: false }))
    render0([member()], { 'J. Beck': [commit()] })
    expect(screen.getByText('Ampel laut machen')).toBeInTheDocument()
  })

  it('keeps a stored open state open', () => {
    localStorage.setItem('people-open', JSON.stringify({ 'J. Beck': true }))
    render0([member()], { 'J. Beck': [commit()] })
    expect(screen.getByText('Ampel laut machen')).toBeInTheDocument()
  })

  it('keeps an absent member visible, with the reason', () => {
    render0([member({ name: 'T. Weber', away: 'Urlaub bis 24.10.' })])
    const row = screen.getAllByRole('listitem')[0]!
    expect(within(row).getByText('Urlaub bis 24.10.')).toBeInTheDocument()
  })

  it('announces an absence that has not started yet', () => {
    render0([member({ nextAway: soon(5) })])
    expect(screen.getByText('Urlaub ab Di')).toBeInTheDocument()
  })

  it('counts someone with a coming absence as present today', () => {
    render0([member({ nextAway: soon(5) })])
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
  })

  it('shows today before the outlook when both apply', () => {
    render0([member({ away: 'Krank', nextAway: soon(5) })])
    expect(screen.getByText('Krank')).toBeInTheDocument()
    expect(screen.queryByText('Urlaub ab Di')).not.toBeInTheDocument()
  })

  it('lets the calendar absence of today silence the outlook too', () => {
    render0([member({ nextAway: soon(5) })], {}, { 'J. Beck': day({ away: 'Urlaub' }) })
    expect(screen.queryByText('Urlaub ab Di')).not.toBeInTheDocument()
  })

  it('stays bare for a member with nothing coming', () => {
    render0([member()])
    expect(screen.queryByText(/ ab /)).not.toBeInTheDocument()
  })

  it('says why the commits are missing instead of looking like a quiet day', () => {
    render0([member()], {}, {}, { commitsError: 'GitLab 403 Forbidden' })
    expect(screen.getByText('Commits: GitLab 403 Forbidden')).toBeInTheDocument()
  })

  it('names the calendar separately, so one broken source is not blamed on both', () => {
    render0([member()], {}, {}, { calendarError: 'ICS 404' })
    expect(screen.getByText('Kalender: ICS 404')).toBeInTheDocument()
    expect(screen.queryByText(/^Commits:/)).not.toBeInTheDocument()
  })

  it('lists both sources when both are down', () => {
    render0([member()], {}, {}, { commitsError: 'GitLab 403', calendarError: 'ICS 404' })
    expect(screen.getByText('Commits: GitLab 403')).toBeInTheDocument()
    expect(screen.getByText('Kalender: ICS 404')).toBeInTheDocument()
  })

  it('stays quiet while both sources answer', () => {
    render0([member()], { 'J. Beck': [commit()] })
    expect(screen.queryByText(/^Commits:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Kalender:/)).not.toBeInTheDocument()
  })
})
