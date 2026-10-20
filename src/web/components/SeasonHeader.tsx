import type { Season } from '../../shared/season.js'
import type { EpicRow } from '../../shared/types.js'
import { SEASON_ART } from '../seasonArt.js'
import { Epics } from './Epics.js'

interface Props {
  season: Season
  next: Season
  nextStart: Date
  daysLeft: number
  preview: boolean
  clock: Date
  epics: EpicRow[]
  epicsJql: string | null
  epicsError: string | null
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
  preview,
  clock,
  epics,
  epicsJql,
  epicsError,
}: Props) {
  return (
    <header className="panel grid grid-cols-[auto_auto_1fr_auto] items-center gap-5 border-l-[3px] border-l-accent py-2.5">
      <div className="text-center">
        <img
          src={SEASON_ART[season.key]}
          alt={season.label}
          className="size-16 rounded-md"
          width={64}
          height={64}
        />
        <div className="mt-1 text-[10px] text-muted">{season.span}</div>
        {preview ? <div className="text-[10px] text-accent">Vorschau</div> : null}
      </div>

      <div className="border-r border-rule pr-5 text-center">
        <div className="num text-[28px] leading-none font-semibold tracking-tight">
          {timeFormat.format(clock)}
        </div>
        <div className="mt-1 text-[11px] text-ink-2">{dateFormat.format(clock)}</div>
      </div>

      <Epics rows={epics} jql={epicsJql} error={epicsError} />

      <div className="flex items-center gap-2.5 text-right text-[11px] text-muted">
        <div className="leading-snug">
          <div className="num">
            noch {daysLeft} {daysLeft === 1 ? 'Arbeitstag' : 'Arbeitstage'}
          </div>
          <div>ab {shortDate.format(nextStart)}</div>
        </div>
        <img
          src={SEASON_ART[next.key]}
          alt={next.label}
          title={`nächstes Theme: ${next.label}`}
          className="size-[42px] shrink-0 rounded-md"
          width={42}
          height={42}
        />
      </div>
    </header>
  )
}
