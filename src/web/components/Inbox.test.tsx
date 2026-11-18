import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { InboxMessage, InboxPayload } from '../../shared/rewards.js'
import { InboxButton, InboxWindow, openCount } from './Inbox.js'

const task = (over: Partial<InboxMessage> = {}): InboxMessage => ({
  id: 1,
  kind: 'distribute',
  createdAt: '2026-11-12T09:00:00.000Z',
  read: false,
  done: false,
  quest: { key: 'PRO-1', title: 'Export als PDF bricht ab', dueAt: '2026-11-20T17:00:00.000Z' },
  ...over,
} as InboxMessage)

const reward = (over: Record<string, unknown> = {}): InboxMessage =>
  ({
    id: 2,
    kind: 'reward',
    createdAt: '2026-11-12T09:00:00.000Z',
    read: false,
    done: false,
    quest: { key: 'PRO-2', title: 'Caching im Proxy', dueAt: '2026-11-20T17:00:00.000Z' },
    experience: 338,
    coins: { gold: 0, silver: 70, copper: 50 },
    by: 'Ben Cohn',
    ...over,
  }) as InboxMessage

const payload = (messages: InboxMessage[]): InboxPayload => ({ me: { id: 'u0', name: 'Anna Berg' }, messages })

const open = (inbox: InboxPayload | null, error: string | null = null) => {
  const handlers = { onClose: vi.fn(), onOpenReward: vi.fn(), onSeen: vi.fn() }
  const view = render(<InboxWindow inbox={inbox} error={error} {...handlers} />)
  return { ...handlers, ...view }
}

describe('openCount', () => {
  it('counts open tasks, read or not, and unread rewards', () => {
    expect(
      openCount([
        task({ id: 1, read: true }),
        task({ id: 2, read: true, done: true }),
        reward({ id: 3 }),
        reward({ id: 4, read: true }),
      ]),
    ).toBe(2)
  })
})

describe('InboxButton', () => {
  it('shows how much is new and opens the inbox', () => {
    const onOpen = vi.fn()
    render(<InboxButton count={3} error={null} onOpen={onOpen} />)

    const button = screen.getByRole('button', { name: 'Posteingang, 3 neu' })
    expect(button).toHaveTextContent('3')

    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('shows no badge when nothing is new and says why the inbox is missing', () => {
    render(<InboxButton count={0} error="DATABASE_URL ist nicht gesetzt" onOpen={() => undefined} />)

    const button = screen.getByRole('button', { name: 'Posteingang' })
    expect(button).toHaveTextContent('')
    expect(button).toHaveAttribute('title', 'Posteingang: DATABASE_URL ist nicht gesetzt')
  })
})

describe('InboxWindow', () => {
  it('lists the rewards to distribute and opens one', () => {
    const { onOpenReward } = open(payload([task(), task({ id: 3, done: true, quest: { key: 'PRO-3', title: 'Erledigt', dueAt: '2026-11-20T17:00:00.000Z' } })]))

    const tasks = screen.getByRole('region', { name: 'Zu verteilen' })
    expect(within(tasks).getAllByRole('listitem')).toHaveLength(1)
    const row = within(tasks).getByRole('button', { name: /Export als PDF/ })
    expect(row).toHaveTextContent('PRO-1 · verteilt sich am 20. Nov. von selbst')

    fireEvent.click(row)
    expect(onOpenReward).toHaveBeenCalledWith('PRO-1')
  })

  it('lists the rewards received, with who distributed them', () => {
    open(payload([reward(), reward({ id: 4, by: null, quest: { key: 'PRO-4', title: 'Index', dueAt: '2026-11-20T17:00:00.000Z' } })]))

    const received = screen.getByRole('region', { name: 'Erhalten' })
    expect(within(received).getByRole('button', { name: /Caching/ })).toHaveTextContent('PRO-2 · verteilt von Ben Cohn')
    expect(within(received).getByRole('button', { name: /Caching/ })).toHaveTextContent('+338 XP')
    expect(within(received).getByRole('button', { name: /Index/ })).toHaveTextContent('automatisch verteilt')
  })

  it('marks what is unread and reports it as seen once', () => {
    const { onSeen, rerender } = open(payload([task(), reward({ read: true }), reward({ id: 5 })]))

    expect(screen.getByRole('button', { name: /Export als PDF/ })).toHaveAttribute('data-unread', 'true')
    expect(onSeen).toHaveBeenCalledWith([1, 5])

    rerender(<InboxWindow inbox={payload([task()])} error={null} onClose={() => undefined} onOpenReward={() => undefined} onSeen={onSeen} />)
    expect(onSeen).toHaveBeenCalledOnce()
  })

  it('reports nothing as seen when everything was read', () => {
    const { onSeen } = open(payload([reward({ read: true })]))

    expect(onSeen).not.toHaveBeenCalled()
  })

  it('has a word for an empty inbox', () => {
    open(payload([]))

    expect(screen.getByText('Keine Belohnung wartet auf dich.')).toBeInTheDocument()
    expect(screen.getByText('Noch keine Belohnung erhalten.')).toBeInTheDocument()
  })

  it('says it is loading', () => {
    open(null)
    expect(screen.getByText('Posteingang wird geladen …')).toBeInTheDocument()
  })

  it('shows the error instead of the list', () => {
    open(null, 'Jira 401')
    expect(screen.getByText('Posteingang: Jira 401')).toBeInTheDocument()
  })

  it('closes with its corner button', () => {
    const { onClose } = open(payload([]))

    fireEvent.click(screen.getByRole('button', { name: 'Posteingang schließen' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
