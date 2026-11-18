import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfilePayload } from '../../shared/questlog/types.js'
import * as api from '../api.js'
import { initialsOf, ProfileButton, ProfileWindow, Purse } from './Profile.js'

vi.mock('../api.js')

beforeEach(() => {
  vi.mocked(api.getEquipment).mockResolvedValue({ items: [{ id: 'wool-hood', equipped: true }] })
})

const profile = (over: Partial<ProfilePayload> = {}): ProfilePayload => ({
  name: 'Anna Berg',
  avatar: '/api/avatar?url=x',
  experience: 18450,
  coins: { gold: 12, silver: 37, copper: 40 },
  completed: 41,
  pending: { experience: 0, coins: { gold: 0, silver: 0, copper: 0 }, quests: 0 },
  quests: [
    {
      key: 'PRO-3990',
      title: 'Suche liefert bei Umlauten keine Treffer',
      difficulty: 'deadly',
      experience: 1650,
      coins: { gold: 0, silver: 94, copper: 0 },
      share: 1,
      resolved: '2026-11-17T10:00:00.000+0100',
      webUrl: 'https://jira.test/browse/PRO-3990',
    },
  ],
  ...over,
})

const windowWith = (value: ProfilePayload | null, error: string | null = null) => {
  const onClose = vi.fn()
  render(<ProfileWindow profile={value} error={error} onClose={onClose} />)
  return onClose
}

describe('Purse', () => {
  it('shows each coin with its amount and leaves out the empty ones', () => {
    const { container } = render(<Purse coins={{ gold: 0, silver: 1234, copper: 5 }} />)

    expect(screen.queryByRole('img', { name: 'Gold' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Silber' }).parentElement).toHaveTextContent('1.234')
    expect(screen.getByRole('img', { name: 'Kupfer' }).parentElement).toHaveTextContent('5')
    expect(container).toHaveTextContent(/^1\.2345$/)
  })

  it('still shows an empty purse as no copper', () => {
    render(<Purse coins={{ gold: 0, silver: 0, copper: 0 }} />)

    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'Kupfer' }).parentElement).toHaveTextContent('0')
  })
})

describe('initialsOf', () => {
  it('takes the first letters of the first two names', () => {
    expect(initialsOf('anna maria berg')).toBe('AM')
    expect(initialsOf('a.berg')).toBe('AB')
  })
})

describe('ProfileButton', () => {
  it('shows the Jira picture and opens the profile', () => {
    const onOpen = vi.fn()
    const { container } = render(<ProfileButton profile={profile()} error={null} onOpen={onOpen} />)

    const button = screen.getByRole('button', { name: 'Profil von Anna Berg' })
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/avatar?url=x')

    fireEvent.click(button)

    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('falls back to the initials without a picture', () => {
    render(<ProfileButton profile={profile({ avatar: null })} error={null} onOpen={() => undefined} />)

    expect(screen.getByRole('button', { name: 'Profil von Anna Berg' })).toHaveTextContent('AB')
  })

  it('stays clickable while the profile is missing and says why in the tooltip', () => {
    render(<ProfileButton profile={null} error="Jira 401" onOpen={() => undefined} />)

    const button = screen.getByRole('button', { name: 'Profil' })
    expect(button).toHaveTextContent('?')
    expect(button).toHaveAttribute('title', 'Profil: Jira 401')
  })
})

describe('ProfileWindow', () => {
  it('shows experience, purse and finished quests of the player', () => {
    windowWith(profile())

    const dialog = screen.getByRole('dialog', { name: 'Profil' })
    expect(within(dialog).getByRole('heading', { name: 'Anna Berg' })).toBeInTheDocument()
    expect(within(dialog).getByText('Erfahrung').parentElement).toHaveTextContent('18.450 XP')
    expect(within(dialog).getByText('Geldbeutel').parentElement).toHaveTextContent('123740')
    expect(within(dialog).getByText('Quests erledigt').parentElement).toHaveTextContent('41')
    expect(within(dialog).getByText('41 Quests erledigt')).toBeInTheDocument()
  })

  it('lists the recent quests with a link to Jira and the day they were finished', () => {
    windowWith(profile())

    const link = screen.getByRole('link', { name: /Suche liefert bei Umlauten/ })
    expect(link).toHaveAttribute('href', 'https://jira.test/browse/PRO-3990')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveTextContent('PRO-3990 · 17. Nov. 2026')
    expect(link).toHaveTextContent('1.650 XP')
    expect(link).toHaveStyle({ borderLeftColor: '#9e1b1b' })
  })

  it('shows what the giver still has to distribute', () => {
    windowWith(profile({ pending: { experience: 225, coins: { gold: 0, silver: 47, copper: 0 }, quests: 2 } }))

    expect(screen.getByText('Ausstehend:').parentElement).toHaveTextContent('Ausstehend:225 XP47aus 2 Quests')
  })

  it('says nothing about pending rewards when there are none', () => {
    windowWith(profile())

    expect(screen.queryByText('Ausstehend:')).not.toBeInTheDocument()
  })

  it('shows the player’s part of a shared quest', () => {
    windowWith(profile({ quests: [{ ...profile().quests[0]!, share: 0.5, experience: 825 }] }))

    expect(screen.getByRole('link', { name: /Suche liefert/ })).toHaveTextContent('50 %825 XP')
  })

  it('shows no part for a quest that was the player’s alone', () => {
    windowWith(profile())

    expect(screen.getByRole('link', { name: /Suche liefert/ })).not.toHaveTextContent('%')
  })

  it('uses the singular for a single quest and has a word for none', () => {
    windowWith(profile({ completed: 1, quests: [] }))

    expect(screen.getByText('1 Quest erledigt')).toBeInTheDocument()
    expect(screen.getByText('Noch keine Quest abgeschlossen.')).toBeInTheDocument()
  })

  it('puts the player’s figure with its equipment next to the numbers', async () => {
    windowWith(profile())

    expect(await screen.findByRole('button', { name: 'Kopf: Wollkapuze' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Spielfigur von Anna Berg' })).toBeInTheDocument()
  })

  it('says it is loading before the first answer', () => {
    windowWith(null)

    expect(screen.getByText('Profil wird geladen …')).toBeInTheDocument()
    expect(screen.queryByText('Erfahrung')).not.toBeInTheDocument()
  })

  it('shows why the profile is missing', () => {
    windowWith(null, 'Jira 401')

    expect(screen.getByText('Profil: Jira 401')).toBeInTheDocument()
  })

  it('closes with its corner button, escape and a click beside it, but not a click into it', () => {
    const onClose = windowWith(profile())

    fireEvent.click(screen.getByRole('heading', { name: 'Anna Berg' }))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Profil schließen' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('dialog').parentElement!)

    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
