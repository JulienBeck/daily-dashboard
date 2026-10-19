import type { Season } from '../../shared/season.js'
import { IconBell, SEASON_ICON } from '../icons.js'

interface Props {
  next: Season
  daysLeft: number
  onDismiss: () => void
}

export function ReminderBand({ next, daysLeft, onDismiss }: Props) {
  const NextIcon = SEASON_ICON[next.key]

  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-[10px] border px-4 py-2.5 text-sm"
      style={{
        borderColor: 'color-mix(in oklab, var(--accent) 45%, transparent)',
        background: 'color-mix(in oklab, var(--accent) 12%, var(--surface))',
      }}
    >
      <IconBell className="text-[18px] text-accent" title="Erinnerung" />
      <span className="flex flex-1 items-center gap-2">
        Nächstes Theme planen —
        <NextIcon className="text-[24px] text-ink" title={next.label} />
        <span className="num font-semibold">
          in {daysLeft} {daysLeft === 1 ? 'Arbeitstag' : 'Arbeitstagen'}
        </span>
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-muted hover:border-muted hover:text-ink"
      >
        Heute ausblenden
      </button>
    </div>
  )
}
