import { useEffect, useRef } from 'react'
import { formatNumber } from '../../shared/questlog/quest.js'
import type { InboxMessage, InboxPayload } from '../../shared/rewards.js'
import { Purse } from './Profile.js'
import { Window } from './Window.js'

const day = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' })

export const openCount = (messages: readonly InboxMessage[]) =>
  messages.filter((message) => (message.kind === 'distribute' && !message.done) || !message.read).length

function Envelope() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="3" y="5.5" width="18" height="13" rx="1.5" fill="#e0cb9c" stroke="#6d5222" strokeWidth="1.2" />
      <path d="M3.6 6.4 12 13l8.4-6.6" fill="none" stroke="#6d5222" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="12" cy="13.6" r="2.2" fill="#9e1b1b" />
    </svg>
  )
}

export function InboxButton({
  count,
  error,
  onOpen,
}: {
  count: number
  error: string | null
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={count > 0 ? `Posteingang, ${count} neu` : 'Posteingang'}
      title={error ? `Posteingang: ${error}` : 'Posteingang'}
      className="metal-button relative size-12 shrink-0"
    >
      <Envelope />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="num absolute -top-2 -right-2 grid h-[18px] min-w-[18px] place-items-center rounded-full border border-black/60 bg-critical px-1 text-[10px] leading-none font-bold text-white"
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}

function Row({ message, onOpen }: { message: InboxMessage; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-unread={!message.read || undefined}
        className="parchment grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-x-4 rounded-md border border-white/10 border-l-[3px] px-3 py-1.5 text-left data-[unread]:border-l-accent"
      >
        <span className="min-w-0">
          <span className="block truncate text-[13px] text-ink">{message.quest.title}</span>
          <span className="block text-[10px] text-muted">
            {message.quest.key}
            {message.kind === 'distribute'
              ? ` · verteilt sich am ${day.format(new Date(message.quest.dueAt))} von selbst`
              : message.by
                ? ` · verteilt von ${message.by}`
                : ' · automatisch verteilt'}
          </span>
        </span>
        {message.kind === 'reward' ? (
          <span className="flex flex-col items-end gap-0.5 text-[11px] text-ink-2">
            <span className="num">+{formatNumber(message.experience)} XP</span>
            <Purse coins={message.coins} />
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-accent">Verteilen</span>
        )}
      </button>
    </li>
  )
}

export function InboxWindow({
  inbox,
  error,
  onClose,
  onOpenReward,
  onSeen,
}: {
  inbox: InboxPayload | null
  error: string | null
  onClose: () => void
  onOpenReward: (key: string) => void
  onSeen: (ids: number[]) => void
}) {
  const seen = useRef(false)
  const tasks = inbox?.messages.filter((message) => message.kind === 'distribute' && !message.done) ?? []
  const rewards = inbox?.messages.filter((message) => message.kind === 'reward') ?? []

  useEffect(() => {
    if (seen.current || !inbox) return
    seen.current = true
    const unread = inbox.messages.filter((message) => !message.read).map((message) => message.id)
    if (unread.length > 0) onSeen(unread)
  }, [inbox, onSeen])

  return (
    <Window label="Posteingang" onClose={onClose} className="grid grid-rows-[auto_1fr] gap-4">
      <h2 className="m-0 text-[22px] font-semibold">Posteingang</h2>
      {error ? (
        <p className="m-0 text-[12px] text-serious">Posteingang: {error}</p>
      ) : !inbox ? (
        <p className="m-0 text-[12px] text-muted">Posteingang wird geladen …</p>
      ) : (
        <div className="scroller grid min-h-0 content-start gap-4 pr-1">
          <section aria-label="Zu verteilen">
            <div className="panel-head">Zu verteilen</div>
            {tasks.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">Keine Belohnung wartet auf dich.</p>
            ) : (
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {tasks.map((message) => (
                  <Row key={message.id} message={message} onOpen={() => onOpenReward(message.quest.key)} />
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Erhalten">
            <div className="panel-head">Erhalten</div>
            {rewards.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">Noch keine Belohnung erhalten.</p>
            ) : (
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {rewards.map((message) => (
                  <Row key={message.id} message={message} onOpen={() => onOpenReward(message.quest.key)} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Window>
  )
}
