import type { Season } from '../../shared/season.js'
import type { ProfilePayload } from '../../shared/questlog/types.js'
import type { EpicRow } from '../../shared/types.js'
import { IconWarning } from '../icons.js'
import { Epics } from './Epics.js'
import { ProfileButton } from './Profile.js'

interface Props {
  season: Season
  next: Season
  nextStart: Date
  daysLeft: number
  reminder: boolean
  onDismiss: () => void
  preview: boolean
  clock: Date
  epics: EpicRow[]
  epicsJql: string | null
  epicsError: string | null
  profile: ProfilePayload | null
  profileError: string | null
  onOpenProfile: () => void
}

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })
const shortDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' })

export function SeasonHeader({
  season,
  next,
  nextStart,
  daysLeft,
  reminder,
  onDismiss,
  preview,
  clock,
  epics,
  epicsJql,
  epicsError,
  profile,
  profileError,
  onOpenProfile,
}: Props) {
  return (
    <header className="panel grid grid-cols-[auto_1fr_auto] items-center gap-5 border-l-[3px] border-l-accent py-2.5">
      <div className="border-r border-rule pr-5 text-center">
        <div className="num text-[28px] leading-none font-semibold tracking-tight">
          {timeFormat.format(clock)}
        </div>
        <div className="mt-1 text-[11px] text-ink-2">{dateFormat.format(clock)}</div>
        {preview ? (
          <div className="text-[10px] text-accent">Vorschau: {season.label}</div>
        ) : null}
      </div>

      <Epics rows={epics} jql={epicsJql} error={epicsError} />

      <div className="flex items-center gap-4 text-right text-[11px] text-muted">
        <div className="leading-snug" title={`nächstes Theme: ${next.label}`}>
          <div className={`num flex items-center justify-end gap-1${reminder ? ' text-warning' : ''}`}>
            {reminder ? (
              <button
                type="button"
                onClick={onDismiss}
                title={`Nächstes Theme planen: ${next.label} – klicken blendet die Warnung heute aus`}
                aria-label="Nächstes Theme planen, heute ausblenden"
                className="rounded p-0.5 text-[14px] leading-none hover:bg-white/10"
              >
                <IconWarning />
              </button>
            ) : null}
            <span className={reminder ? 'font-semibold' : undefined}>
              noch {daysLeft} {daysLeft === 1 ? 'Arbeitstag' : 'Arbeitstage'}
            </span>
          </div>
          <div>ab {shortDate.format(nextStart)}</div>
        </div>
        <ProfileButton profile={profile} error={profileError} onOpen={onOpenProfile} />
      </div>
    </header>
  )
}
