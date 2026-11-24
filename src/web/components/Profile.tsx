import type { ReactNode } from 'react'
import { formatNumber } from '../../shared/questlog/quest.js'
import type { Coins, Difficulty, ProfilePayload } from '../../shared/questlog/types.js'
import type { Viewer } from '../../shared/types.js'
import { signOutUrl } from '../api.js'
import { CharacterSheet } from './avatar/CharacterSheet.js'
import { Window } from './Window.js'

const COIN: Record<keyof Coins, { label: string; colour: string }> = {
  gold: { label: 'Gold', colour: '#e2b33c' },
  silver: { label: 'Silber', colour: '#c9ced3' },
  copper: { label: 'Kupfer', colour: '#c27a43' },
}

const DIFFICULTY: Record<Difficulty, string> = {
  trivial: '#6b5a45',
  easy: '#2f6b1f',
  standard: '#8a6a00',
  difficult: '#a3520f',
  deadly: '#9e1b1b',
}

const day = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })

export function Purse({ coins }: { coins: Coins }) {
  const filled = (['gold', 'silver', 'copper'] as const).filter((kind) => coins[kind] > 0)
  const shown = filled.length > 0 ? filled : (['copper'] as const)
  return (
    <span className="inline-flex items-center gap-2.5">
      {shown.map((kind) => (
        <span key={kind} className="num inline-flex items-center gap-1" title={COIN[kind].label}>
          {formatNumber(coins[kind])}
          <span
            role="img"
            aria-label={COIN[kind].label}
            className="inline-block size-3 rounded-full border border-black/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)]"
            style={{ background: COIN[kind].colour }}
          />
        </span>
      ))}
    </span>
  )
}

export const initialsOf = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .slice(0, 2)
    .join('')

function Avatar({ profile, size }: { profile: ProfilePayload | null; size: string }) {
  return profile?.avatar ? (
    <img src={profile.avatar} alt="" className={`${size} object-cover`} />
  ) : (
    <span className={`${size} grid place-items-center text-[13px] font-semibold`}>
      {profile ? initialsOf(profile.name) : '?'}
    </span>
  )
}

export function ProfileButton({
  profile,
  error,
  onOpen,
}: {
  profile: ProfilePayload | null
  error: string | null
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={profile ? `Profil von ${profile.name}` : 'Profil'}
      title={error ? `Profil: ${error}` : (profile?.name ?? 'Profil')}
      className="metal-button size-12 shrink-0 overflow-hidden"
    >
      <Avatar profile={profile} size="size-[38px]" />
    </button>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="parchment flex flex-col items-center gap-1 rounded-md border border-white/10 px-3 py-2.5">
      <div className="text-[10px] tracking-[0.09em] text-muted uppercase">{label}</div>
      <div className="text-[20px] leading-none font-semibold">{children}</div>
    </div>
  )
}

export function ProfileWindow({
  profile,
  error,
  viewer = null,
  onClose,
}: {
  profile: ProfilePayload | null
  error: string | null
  viewer?: Viewer | null
  onClose: () => void
}) {
  return (
    <Window label="Profil" onClose={onClose} wide className="grid grid-cols-[minmax(0,400px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-6">
      <CharacterSheet name={profile?.name ?? 'dir'} />
      <div className="grid min-h-0 grid-rows-[auto_auto_auto_1fr] gap-4">
        <div className="grid grid-cols-[auto_1fr] items-center gap-4">
          <div className="metal-button size-[64px] cursor-default overflow-hidden hover:filter-none active:transform-none">
            <Avatar profile={profile} size="size-[54px]" />
          </div>
          <div className="min-w-0">
            <h2 className="m-0 truncate text-[24px] font-semibold">{profile?.name ?? 'Profil'}</h2>
            {error ? (
              <p className="m-0 mt-1 text-[12px] text-serious">Profil: {error}</p>
            ) : profile ? (
              <p className="m-0 mt-1 text-[12px] text-ink-2">
                {formatNumber(profile.completed)} {profile.completed === 1 ? 'Quest' : 'Quests'} erledigt
              </p>
            ) : (
              <p className="m-0 mt-1 text-[12px] text-muted">Profil wird geladen …</p>
            )}
            {viewer ? (
              <p className="m-0 mt-1 text-[11px] text-muted">
                Angemeldet als <span className="text-ink-2">{viewer.name}</span>
                {viewer.member ? null : ' (nicht im Team)'} ·{' '}
                <a href={signOutUrl} className="text-ink-2 underline">
                  Abmelden
                </a>
              </p>
            ) : null}
          </div>
        </div>

        {profile ? (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Erfahrung">
              <span className="num">{formatNumber(profile.experience)}</span>{' '}
              <span className="text-[12px] font-normal text-ink-2">XP</span>
            </Stat>
            <Stat label="Geldbeutel">
              <Purse coins={profile.coins} />
            </Stat>
            <Stat label="Quests erledigt">
              <span className="num">{formatNumber(profile.completed)}</span>
            </Stat>
          </div>
        ) : (
          <div />
        )}

        {profile && profile.pending.quests > 0 ? (
          <p className="m-0 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-2" title="Der Questgeber hat noch nicht verteilt">
            <span>Ausstehend:</span>
            <span className="num">{formatNumber(profile.pending.experience)} XP</span>
            <Purse coins={profile.pending.coins} />
            <span className="text-muted">
              aus {formatNumber(profile.pending.quests)} {profile.pending.quests === 1 ? 'Quest' : 'Quests'}
            </span>
          </p>
        ) : (
          <div />
        )}

        {profile ? (
          <div className="grid min-h-0 grid-rows-[auto_1fr]">
            <div className="panel-head">Zuletzt erledigt</div>
            {profile.quests.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">Noch keine Quest abgeschlossen.</p>
            ) : (
              <ul className="scroller m-0 grid list-none content-start gap-1.5 p-0 pr-1">
                {profile.quests.map((quest) => (
                  <li key={quest.key}>
                    <a
                      href={quest.webUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="parchment grid grid-cols-[1fr_auto] items-center gap-x-4 rounded-md border border-white/10 border-l-[3px] px-3 py-1.5 no-underline"
                      style={{ borderLeftColor: DIFFICULTY[quest.difficulty] }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-ink">{quest.title}</span>
                        <span className="block text-[10px] text-muted">
                          {quest.key}
                          {quest.resolved ? ` · ${day.format(new Date(quest.resolved))}` : ''}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-0.5 text-[11px] text-ink-2">
                        <span className="num">
                          {quest.share < 1 ? (
                            <span className="mr-1.5 text-muted">{Math.round(quest.share * 100)} %</span>
                          ) : null}
                          {formatNumber(quest.experience)} XP
                        </span>
                        <Purse coins={quest.coins} />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </Window>
  )
}
