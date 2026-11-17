import type { QuestState } from '../../shared/questlog/types'
import { useStrings } from './strings'

export function MapIcon() {
  return (
    <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true">
      <path d="M1 3 6.5 1.5 13 3.8 19 2v11l-6 1.8-6.5-2.3L1 14z" fill="#c08a3c" stroke="#3a2608" />
      <path d="M6.5 1.5v11M13 3.8v11" stroke="#3a2608" strokeWidth="0.8" />
      <path d="M3 6.5 5 9l2-1.5" stroke="#f0d79a" strokeWidth="0.8" fill="none" />
      <circle cx="15.5" cy="7.5" r="1.4" fill="#e03a22" />
    </svg>
  )
}

/*
 * A thin dark contour, nothing else. The glyph is barely three units wide at
 * fifteen pixels; a fat outline and a bright rim on top swallowed the shape and
 * left a white blob.
 */
function Glyph({ d, gold }: { d: string; gold: boolean }) {
  return (
    <>
      <path d={d} stroke="#140d02" strokeWidth="1.7" strokeLinejoin="round" fill="none" />
      <path d={d} fill={gold ? '#ffd100' : '#b4b0a8'} stroke="none" />
    </>
  )
}

const BANG = 'M10 3.2h2.6l-.6 9.4h-1.4z'
const BANG_DOT = 'M9.9 14.6h2.8v2.8H9.9z'
const HOOK =
  'M7.2 7.3c0-2.3 1.7-4.1 4.1-4.1 2.3 0 4 1.5 4 3.6 0 1.8-1 2.6-2.2 3.5-.9.7-1.2 1.1-1.2 2.1v.3h-2.4v-.6c0-1.6.5-2.4 1.7-3.3.9-.7 1.3-1.1 1.3-1.9 0-.8-.6-1.4-1.5-1.4s-1.5.7-1.5 1.8z'
const HOOK_DOT = 'M9.6 14.6h2.8v2.8H9.6z'

/**
 * The game's own language: a quest you may take carries an exclamation mark, a
 * quest you already took a question mark — grey while it runs, gold once it can
 * be handed in.
 */
export function QuestMarker({ state, status }: { state: QuestState; status: string }) {
  const t = useStrings()
  const label = `${t.marker[state]}${status ? ` (${status})` : ''}`
  const gold = state !== 'active'

  return (
    <svg width="17" height="19" viewBox="4 1 15 18" role="img" aria-label={label}>
      <title>{label}</title>
      {state === 'available' ? (
        <>
          <Glyph d={BANG} gold />
          <Glyph d={BANG_DOT} gold />
        </>
      ) : (
        <>
          <Glyph d={HOOK} gold={gold} />
          <Glyph d={HOOK_DOT} gold={gold} />
        </>
      )}
    </svg>
  )
}

function Coin({ kind, amount }: { kind: 'gold' | 'silver' | 'copper'; amount: number }) {
  const colours = {
    gold: ['#fff0a8', '#e0b020', '#6b4a06'],
    silver: ['#ffffff', '#c8d0d8', '#60686e'],
    copper: ['#ffd0a8', '#c87a40', '#6b3a14'],
  }[kind]
  const label = useStrings().coins[kind]

  return (
    <b title={`${amount} ${label}`}>
      {amount}
      <svg width="14" height="14" viewBox="0 0 16 16" role="img" aria-label={label}>
        <circle cx="8" cy="8" r="7" fill={colours[1]} stroke={colours[2]} />
        <ellipse cx="6.2" cy="5.6" rx="3.4" ry="2.4" fill={colours[0]} opacity="0.75" />
      </svg>
    </b>
  )
}

export function CoinRow({ gold, silver, copper }: { gold: number; silver: number; copper: number }) {
  // A purse of zero is still a purse: without this the row would vanish.
  const empty = gold === 0 && silver === 0 && copper === 0
  return (
    <span className="coins">
      {gold > 0 && <Coin kind="gold" amount={gold} />}
      {silver > 0 && <Coin kind="silver" amount={silver} />}
      {(copper > 0 || empty) && <Coin kind="copper" amount={copper} />}
    </span>
  )
}

export function ScrollIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5z" fill="#e0cb9c" stroke="#6d5222" />
      <path d="M8 7h8M8 11h8M8 15h5" stroke="#8a6a34" />
    </svg>
  )
}
