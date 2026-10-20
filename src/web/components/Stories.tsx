import { useState } from 'react'
import type { IssueRow } from '../../shared/types.js'
import { IconBoard, IconFlag } from '../icons.js'

type Lane = IssueRow['lane']

const LANES = [
  { key: 'todo' as const, label: 'To Do' },
  { key: 'doing' as const, label: 'In Arbeit' },
  { key: 'done' as const, label: 'Erledigt' },
]

export interface Band {
  label: string
  issues: IssueRow[]
}

export type Moves = Record<string, Lane>

export function applyMoves(issues: readonly IssueRow[], moves: Moves): IssueRow[] {
  return issues.map((issue) => {
    const lane = moves[issue.key]
    return lane && lane !== issue.lane ? { ...issue, lane } : issue
  })
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

function Card({
  issue,
  draggable,
  busy,
  onDragStart,
  onDragEnd,
}: {
  issue: IssueRow
  draggable: boolean
  busy: boolean
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const done = issue.lane === 'done'
  const accent = done ? 'var(--ink-muted)' : issue.flagged ? 'var(--critical)' : 'var(--accent)'

  return (
    <a
      href={issue.webUrl}
      target="_blank"
      rel="noreferrer"
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer?.setData('text/plain', issue.key)
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={`block rounded-lg border border-white/10 border-l-2 bg-card px-2.5 py-1.5 no-underline ${
        done ? 'opacity-55' : ''
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${busy ? 'animate-pulse' : ''}`}
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

export function Stories({
  issues,
  weeks,
  onMove,
}: {
  issues: IssueRow[]
  weeks: string[]
  onMove?: (key: string, lane: Lane) => Promise<unknown>
}) {
  const [moves, setMoves] = useState<Moves>({})
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const shown = applyMoves(issues, moves)
  const points = shown.reduce((total, issue) => total + (issue.points ?? 0), 0)
  const bands = bandsOf(shown, weeks)

  const forget = (key: string) =>
    setMoves((previous) => {
      const rest = { ...previous }
      delete rest[key]
      return rest
    })

  const drop = (lane: Lane, key: string) => {
    setOver(null)
    setDragging(null)
    const issue = shown.find((row) => row.key === key)
    if (!onMove || !issue || issue.lane === lane) return
    setError(null)
    setMoves((previous) => ({ ...previous, [key]: lane }))
    void onMove(key, lane).then(
      () => forget(key),
      (reason: unknown) => {
        forget(key)
        setError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }

  return (
    <section className="panel grid min-h-0 grid-rows-[auto_auto_1fr] border-t-2 border-t-accent">
      <div className="panel-head">
        <IconBoard className="text-sm" />
        <span className="flex-1">Stories im Sprint</span>
        {error ? (
          <span className="normal-case text-serious" title={error}>
            Jira: Verschieben fehlgeschlagen
          </span>
        ) : null}
        <span className="num normal-case">
          {shown.length} Vorgänge · {points} P
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
              {shown.filter((issue) => issue.lane === lane.key).length}
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
              {LANES.map((lane) => {
                const zone = `${band.label}:${lane.key}`
                return (
                  <ul
                    key={lane.key}
                    role="list"
                    aria-label={`${lane.label} · ${band.label}`}
                    onDragOver={(event) => {
                      if (!onMove || !dragging) return
                      event.preventDefault()
                      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
                      setOver(zone)
                    }}
                    onDragLeave={() => setOver((current) => (current === zone ? null : current))}
                    onDrop={(event) => {
                      event.preventDefault()
                      const key = event.dataTransfer?.getData('text/plain') || dragging
                      if (key) drop(lane.key, key)
                    }}
                    className={`grid content-start gap-1.5 overflow-hidden rounded-lg border border-dashed ${
                      over === zone
                        ? 'border-accent bg-accent/5'
                        : dragging
                          ? 'border-rule'
                          : 'border-transparent'
                    } ${onMove ? 'min-h-8' : ''}`}
                  >
                    {band.issues
                      .filter((issue) => issue.lane === lane.key)
                      .map((issue) => (
                        <li key={issue.key}>
                          <Card
                            issue={issue}
                            draggable={Boolean(onMove)}
                            busy={issue.key in moves}
                            onDragStart={() => setDragging(issue.key)}
                            onDragEnd={() => {
                              setDragging(null)
                              setOver(null)
                            }}
                          />
                        </li>
                      ))}
                  </ul>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
