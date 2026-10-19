import type { SprintInfo } from '../../shared/types.js'
import { IconSprint } from '../icons.js'

const SEGMENTS = [
  { key: 'done' as const, label: 'erledigt', color: 'var(--step-1)' },
  { key: 'doing' as const, label: 'in Arbeit', color: 'var(--step-2)' },
  { key: 'open' as const, label: 'offen', color: 'var(--step-3)' },
]

export function share(points: SprintInfo['points']) {
  const total = points.done + points.doing + points.open
  if (total === 0) return { done: 0, doing: 0, open: 0 }
  return {
    done: (points.done / total) * 100,
    doing: (points.doing / total) * 100,
    open: (points.open / total) * 100,
  }
}

export function timeLeftShare(sprint: SprintInfo): number | null {
  if (sprint.workdaysLeft == null || sprint.workdaysTotal == null || sprint.workdaysTotal <= 0) {
    return null
  }
  return Math.min(100, Math.max(0, (sprint.workdaysLeft / sprint.workdaysTotal) * 100))
}

export function SprintTile({ sprint }: { sprint: SprintInfo }) {
  const widths = share(sprint.points)
  const left = timeLeftShare(sprint)
  const total = sprint.points.done + sprint.points.doing + sprint.points.open

  return (
    <section className="panel border-t-2 border-t-accent">
      <div className="panel-head">
        <IconSprint className="text-sm" />
        <span className="flex-1">{sprint.name}</span>
        <span className="num normal-case">{total} P</span>
      </div>

      <div className="flex items-center gap-4">
        <div
          className="relative grid size-[88px] shrink-0 place-items-center rounded-full"
          style={{
            background:
              left == null
                ? 'var(--rule)'
                : `conic-gradient(var(--accent) ${left}%, var(--rule) 0)`,
          }}
          role="img"
          aria-label={
            left == null
              ? 'Restlaufzeit unbekannt'
              : `${sprint.workdaysLeft} von ${sprint.workdaysTotal} Arbeitstagen übrig`
          }
        >
          <span className="absolute inset-[9px] rounded-full bg-surface" />
          <span className="relative text-center leading-none">
            <span className="num block text-[26px] font-bold tracking-tight">
              {sprint.workdaysLeft ?? '—'}
            </span>
            <span className="mt-0.5 block text-[9px] tracking-wide text-muted uppercase">Tage</span>
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex h-3 gap-0.5" role="img" aria-label="Story Points nach Zustand">
            {SEGMENTS.map((segment, index) => (
              <div
                key={segment.key}
                style={{
                  background: segment.color,
                  width: `${widths[segment.key]}%`,
                  borderRadius:
                    index === 0 ? '4px 0 0 4px' : index === SEGMENTS.length - 1 ? '0 4px 4px 0' : '0',
                }}
              />
            ))}
          </div>

          <dl className="grid gap-1 text-xs">
            {SEGMENTS.map((segment) => (
              <div key={segment.key} className="flex items-center gap-2 text-ink-2">
                <i className="size-2.5 shrink-0 rounded-[3px]" style={{ background: segment.color }} />
                <dt>{segment.label}</dt>
                <dd className="num ml-auto text-ink">{sprint.points[segment.key]} P</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {total === 0 ? (
        <p className="mt-2.5 border-t border-rule pt-2 text-[11px] text-serious">
          Keine Story Points gefunden
          {sprint.pointsField ? ` (Feld ${sprint.pointsField})` : ' — kein Schätzfeld ermittelt'}
        </p>
      ) : null}
    </section>
  )
}
