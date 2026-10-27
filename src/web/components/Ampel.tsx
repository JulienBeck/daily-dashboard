import { AMPEL_ORDER, tally } from '../../shared/pipeline.js'
import type { AmpelState, PipelineRow } from '../../shared/types.js'
import { STATUS_ICON, StatusWaiting } from '../icons.js'

const LABEL: Record<AmpelState, string> = {
  good: 'grün',
  warning: 'gelb',
  critical: 'rot',
  running: 'läuft',
  idle: 'ruhend',
}

const COLOR: Record<AmpelState, string> = {
  good: 'var(--good)',
  warning: 'var(--warning)',
  critical: 'var(--critical)',
  running: 'var(--running)',
  idle: 'var(--idle)',
}

const shortName = (fullPath: string) => fullPath.split('/').pop() ?? fullPath

const stamp = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const tooltip = (row: PipelineRow) =>
  [
    row.fullPath,
    `${LABEL[row.state]} · ${row.ref}`,
    row.detail ?? (row.rawStatus || 'keine Pipeline'),
    row.detail ? row.rawStatus : null,
    row.finishedAt ? stamp.format(new Date(row.finishedAt)) : null,
    row.author,
  ]
    .filter(Boolean)
    .join(' · ')

export function Ampel({ rows, stale }: { rows: PipelineRow[]; stale: boolean }) {
  const counts = tally(rows.map((row) => row.state))
  const sorted = [...rows].sort(
    (a, b) => AMPEL_ORDER.indexOf(a.state) - AMPEL_ORDER.indexOf(b.state),
  )

  return (
    <section
      className="panel flex shrink-0 items-center gap-5 py-2"
      aria-label="Pipeline-Ampel"
      data-stale={stale ? 'true' : undefined}
    >
      <div className="flex items-center gap-3.5">
        {AMPEL_ORDER.filter((state) => counts[state] > 0).map((state) => {
          const Icon = STATUS_ICON[state]
          return (
            <div
              key={state}
              className="num flex items-baseline gap-1.5 text-[22px] font-bold"
              style={{ color: COLOR[state] }}
              title={`${counts[state]} ${LABEL[state]}`}
            >
              {counts[state]}
              <Icon className="text-[13px]" title={LABEL[state]} />
            </div>
          )
        })}
      </div>

      <ul className="flex flex-1 flex-wrap gap-1.5" role="list">
        {sorted.map((row) => {
          const Icon = row.waiting ? StatusWaiting : STATUS_ICON[row.state]
          return (
            <li key={row.fullPath}>
              <a
                href={row.webUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                title={tooltip(row)}
                data-state={row.state}
                className={[
                  'flex items-center gap-1.5 rounded-full border bg-card px-2 py-1.5',
                  'text-[11px] leading-none text-ink no-underline',
                  row.state === 'critical' ? 'border-critical/60' : 'border-white/10',
                  row.state === 'running' ? 'border-dashed' : '',
                ].join(' ')}
              >
                <span
                  className={`grid size-3.5 shrink-0 place-items-center rounded-full text-[9px] text-plane ${
                    row.state === 'running' ? 'pulse' : ''
                  }`}
                  style={{ background: COLOR[row.state] }}
                >
                  <Icon title={row.waiting ? 'wartet auf Freigabe' : LABEL[row.state]} />
                </span>
                {shortName(row.fullPath)}
              </a>
            </li>
          )
        })}
      </ul>

    </section>
  )
}
