import type { IssueRow } from '../../shared/types.js'
import { IconBoard, IconFlag } from '../icons.js'

const LANES = [
  { key: 'todo' as const, label: 'To Do' },
  { key: 'doing' as const, label: 'In Arbeit' },
  { key: 'done' as const, label: 'Erledigt' },
]

export interface Band {
  label: string
  issues: IssueRow[]
}

export function bandsOf(issues: readonly IssueRow[], weeks: readonly string[]): Band[] {
  const bands = weeks.map((label) => ({
    label,
    issues: issues.filter((issue) => issue.week === label),
  }))
  const rest = issues.filter((issue) => issue.week === null)
  if (rest.length > 0) bands.push({ label: 'ohne Woche', issues: rest })
  return bands.filter((band) => band.issues.length > 0)
}

export function bandWeight(band: Band): number {
  const perLane = LANES.map(
    (lane) => band.issues.filter((issue) => issue.lane === lane.key).length,
  )
  return Math.max(1, ...perLane)
}

function Card({ issue }: { issue: IssueRow }) {
  const done = issue.lane === 'done'
  const accent = done ? 'var(--ink-muted)' : issue.flagged ? 'var(--critical)' : 'var(--accent)'

  return (
    <a
      href={issue.webUrl}
      target="_blank"
      rel="noreferrer"
      className={`block rounded-lg border border-white/10 border-l-2 bg-card px-2.5 py-1.5 no-underline ${
        done ? 'opacity-55' : ''
      }`}
      style={{ borderLeftColor: done ? 'var(--rule)' : accent }}
    >
      <div
        className="num flex items-center gap-1 text-[10px] font-bold tracking-wide"
        style={{ color: accent }}
      >
        {issue.key}
        {issue.flagged ? <IconFlag className="text-xs" title="blockiert" /> : null}
      </div>
      <p className="my-1 text-[13px] leading-snug text-ink">{issue.summary}</p>
      <div className="flex items-center gap-2 text-[11px] text-muted">
        {issue.avatar ? (
          <img
            src={issue.avatar}
            alt={issue.assignee ?? 'nicht zugewiesen'}
            title={issue.assignee ?? 'nicht zugewiesen'}
            className="size-5 shrink-0 rounded-full border border-white/10"
            width={20}
            height={20}
          />
        ) : (
          <span
            className="grid size-5 place-items-center rounded-full border border-white/10 bg-surface text-[9px] font-bold text-ink-2"
            title={issue.assignee ?? 'nicht zugewiesen'}
          >
            {issue.initials}
          </span>
        )}
        {issue.points != null ? <span className="num ml-auto text-ink-2">{issue.points} P</span> : null}
      </div>
    </a>
  )
}

export function Stories({ issues, weeks }: { issues: IssueRow[]; weeks: string[] }) {
  const points = issues.reduce((total, issue) => total + (issue.points ?? 0), 0)
  const bands = bandsOf(issues, weeks)

  return (
    <section className="panel grid min-h-0 grid-rows-[auto_auto_1fr] border-t-2 border-t-accent">
      <div className="panel-head">
        <IconBoard className="text-sm" />
        <span className="flex-1">Stories im Sprint</span>
        <span className="num normal-case">
          {issues.length} Vorgänge · {points} P
        </span>
      </div>

      <div className="mb-2 grid grid-cols-3 gap-2.5">
        {LANES.map((lane) => (
          <h3
            key={lane.key}
            className="flex items-center gap-2 border-b border-rule pb-1.5 text-[11px] tracking-wider text-muted uppercase"
          >
            {lane.label}
            <span className="num ml-auto rounded-full bg-card px-1.5 text-[11px] text-ink-2">
              {issues.filter((issue) => issue.lane === lane.key).length}
            </span>
          </h3>
        ))}
      </div>

      <div
        className="grid min-h-0 gap-2.5 overflow-hidden"
        style={{
          gridTemplateRows: bands.map((band) => `minmax(0, ${bandWeight(band)}fr)`).join(' '),
        }}
      >
        {bands.map((band) => (
          <div key={band.label} className="grid min-h-0 grid-rows-[auto_1fr]">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="rounded bg-card px-1.5 py-0.5 text-[10px] tracking-wider text-ink-2 uppercase">
                {band.label}
              </span>
              <span className="num text-[10px] text-muted">
                {band.issues.reduce((total, issue) => total + (issue.points ?? 0), 0)} P
              </span>
              <span className="h-px flex-1 bg-rule" />
            </div>
            <div className="grid min-h-0 grid-cols-3 gap-2.5">
              {LANES.map((lane) => (
                <ul key={lane.key} className="grid content-start gap-1.5 overflow-hidden" role="list">
                  {band.issues
                    .filter((issue) => issue.lane === lane.key)
                    .map((issue) => (
                      <li key={issue.key}>
                        <Card issue={issue} />
                      </li>
                    ))}
                </ul>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
