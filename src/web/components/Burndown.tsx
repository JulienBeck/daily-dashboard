import type { BurndownPayload, BurndownPoint } from '../../shared/types.js'
import { IconBurndown } from '../icons.js'

const BOX = { width: 400, height: 116 }
const PAD = { left: 26, right: 10, top: 10, bottom: 16 }

const PLOT = {
  left: PAD.left,
  right: BOX.width - PAD.right,
  top: PAD.top,
  bottom: BOX.height - PAD.bottom,
}

const day = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })

export function maxScope(payload: BurndownPayload): number {
  const highest = payload.points.reduce((top, point) => Math.max(top, point.remaining), 0)
  return Math.max(1, highest, payload.startScope)
}

export function idealRemaining(payload: BurndownPayload, at: string): number | null {
  const start = Date.parse(payload.start)
  const end = Date.parse(payload.end)
  const when = Date.parse(at)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  const share = Math.min(1, Math.max(0, (when - start) / (end - start)))
  return payload.startScope * (1 - share)
}

/**
 * Jira's own line is a step, not a slope: between two changes nothing burns
 * down. Interpolating would invent progress on days when none happened.
 */
export function stepPath(
  points: readonly BurndownPoint[],
  x: (at: string) => number,
  y: (value: number) => number,
): string {
  if (points.length === 0) return ''
  const parts = [`M ${x(points[0]!.at)} ${y(points[0]!.remaining)}`]
  for (const point of points.slice(1)) {
    parts.push(`H ${x(point.at)}`, `V ${y(point.remaining)}`)
  }
  return parts.join(' ')
}

/** The step has to reach today, otherwise the line stops at the last change. */
export function withNow(payload: BurndownPayload): BurndownPoint[] {
  const last = payload.points[payload.points.length - 1]
  if (!last) return []
  if (Date.parse(payload.now) <= Date.parse(last.at)) return [...payload.points]
  return [...payload.points, { at: payload.now, remaining: last.remaining }]
}

export function Burndown({ payload }: { payload: BurndownPayload }) {
  const start = Date.parse(payload.start)
  const end = Date.parse(payload.end)
  const span = end > start ? end - start : 1
  const top = maxScope(payload)
  const unit = payload.unit === 'issues' ? '' : ' P'

  const x = (at: string) => {
    const share = Math.min(1, Math.max(0, (Date.parse(at) - start) / span))
    return PLOT.left + share * (PLOT.right - PLOT.left)
  }
  const y = (value: number) =>
    PLOT.bottom - Math.min(1, Math.max(0, value / top)) * (PLOT.bottom - PLOT.top)

  const series = withNow(payload)
  const last = series[series.length - 1]
  const ideal = idealRemaining(payload, payload.now)
  const behind = ideal != null && last ? last.remaining - ideal : null

  return (
    <section className="panel">
      <div className="panel-head">
        <IconBurndown className="text-sm" />
        <span className="flex-1">Burndown</span>
        {behind != null ? (
          <span
            className={`num normal-case ${behind > 0 ? 'text-serious' : 'text-good'}`}
            title={`Ideallinie bei ${ideal!.toFixed(1)}${unit}`}
          >
            {behind > 0 ? '+' : '−'}
            {Math.abs(behind).toFixed(1)}
            {unit}
          </span>
        ) : null}
      </div>

      {series.length === 0 ? (
        <p className="text-[11px] text-serious">Keine Sprint-Historie von Jira bekommen</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${BOX.width} ${BOX.height}`}
            className="h-auto w-full"
            role="img"
            aria-label={`Burndown: noch ${last!.remaining}${unit} von ${payload.startScope}${unit}${
              behind == null
                ? ''
                : behind > 0
                  ? `, ${behind.toFixed(1)}${unit} hinter der Ideallinie`
                  : `, ${Math.abs(behind).toFixed(1)}${unit} vor der Ideallinie`
            }`}
          >
            <line
              x1={PLOT.left}
              y1={PLOT.bottom}
              x2={PLOT.right}
              y2={PLOT.bottom}
              stroke="var(--rule)"
              strokeWidth={1}
            />
            <line
              x1={x(payload.start)}
              y1={y(payload.startScope)}
              x2={x(payload.end)}
              y2={y(0)}
              stroke="var(--step-2)"
              strokeWidth={1.6}
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
            <path
              d={stepPath(series, x, y)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={x(last!.at)} cy={y(last!.remaining)} r={3.5} fill="var(--accent)" />

            <text x={2} y={PLOT.top + 4} className="fill-muted text-[9px]">
              {top}
            </text>
            <text x={2} y={PLOT.bottom + 3} className="fill-muted text-[9px]">
              0
            </text>
            <text x={PLOT.left} y={BOX.height - 3} className="fill-muted text-[9px]">
              {day.format(new Date(payload.start))}
            </text>
            <text x={PLOT.right} y={BOX.height - 3} textAnchor="end" className="fill-muted text-[9px]">
              {day.format(new Date(payload.end))}
            </text>
          </svg>

          <div className="mt-1 flex items-center gap-3 text-[10px] text-muted">
            <span className="flex items-center gap-1.5">
              <i className="h-0.5 w-4 shrink-0 rounded-full bg-accent" />
              Rest {last!.remaining}
              {unit}
            </span>
            <span className="flex items-center gap-1.5">
              <i
                className="h-0.5 w-4 shrink-0"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(to right, var(--step-2) 0 5px, transparent 5px 9px)',
                }}
              />
              Ideal
            </span>
            {payload.scope !== payload.startScope ? (
              <span className="num ml-auto" title="Sprint-Umfang hat sich geändert">
                Scope {payload.startScope} → {payload.scope}
                {unit}
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}
