import { useEffect, useRef, useState } from 'react'
import type { EpicRow } from '../../shared/types.js'
import { IconEpic, IconPencil } from '../icons.js'

const STORAGE_KEY = 'epic-headline'
const FALLBACK = 'Theme dieses Quartals'

const LANE_COLOUR: Record<EpicRow['lane'], string> = {
  done: 'var(--step-2)',
  doing: 'var(--accent)',
  todo: 'var(--ink-muted)',
}

export function Headline() {
  const [text, setText] = useState(() => localStorage.getItem(STORAGE_KEY) ?? FALLBACK)
  const [editing, setEditing] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const commit = (value: string) => {
    const trimmed = value.trim() || FALLBACK
    setText(trimmed)
    localStorage.setItem(STORAGE_KEY, trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={input}
        defaultValue={text}
        aria-label="Überschrift der Epics"
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(event.currentTarget.value)
          if (event.key === 'Escape') setEditing(false)
        }}
        className="w-full rounded border border-accent/60 bg-card px-1.5 py-0.5 text-[13px] font-semibold text-ink outline-none"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Überschrift ändern"
      className="group flex items-center justify-center gap-2 text-[17px] font-semibold tracking-tight text-ink"
    >
      {text}
      <IconPencil className="text-sm text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

interface Props {
  rows: EpicRow[]
  jql: string | null
  error: string | null
}

export function Epics({ rows, jql, error }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative flex items-center justify-center">
        <Headline />
        {jql ? (
          <span
            title={jql}
            className="num absolute right-0 cursor-help rounded border border-white/10 px-1 text-[9px] text-muted"
          >
            JQL
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="text-[11px] text-serious">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-muted">Keine Epics gefunden.</p>
      ) : (
        <ul className="flex flex-wrap items-stretch gap-2" role="list">
          {rows.map((epic) => (
            <li key={epic.key} className="min-w-0 flex-1 basis-0">
              <a
                href={epic.webUrl}
                target="_blank"
                rel="noreferrer"
                title={`${epic.key} · ${epic.status}`}
                className="flex h-full min-w-0 items-start gap-2 rounded-md border border-white/10 border-l-2 bg-card px-2.5 py-1.5 no-underline hover:border-white/25"
                style={{ borderLeftColor: LANE_COLOUR[epic.lane] }}
              >
                <IconEpic
                  className="shrink-0 translate-y-0.5 text-[13px]"
                  style={{ color: LANE_COLOUR[epic.lane] }}
                />
                <span className="min-w-0">
                  <span className="num block text-[9px] tracking-wide text-muted">{epic.key}</span>
                  <span
                    className={`block text-[12px] leading-snug ${
                      epic.lane === 'done' ? 'text-muted' : 'text-ink'
                    }`}
                  >
                    {epic.summary}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
