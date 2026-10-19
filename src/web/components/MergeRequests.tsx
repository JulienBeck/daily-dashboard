import type { MergeRequestRow } from '../../shared/types.js'
import { IconMerge, StatusGood } from '../icons.js'

const OLD_DAYS = 5

interface Props {
  rows: MergeRequestRow[]
  collapsed: boolean
  onToggle: () => void
}

export function MergeRequests({ rows, collapsed, onToggle }: Props) {
  if (collapsed) {
    return (
      <section className="panel flex w-11 flex-col items-center gap-3 px-0 py-3">
        <button
          type="button"
          onClick={onToggle}
          title={`Merge Requests ausklappen (${rows.length})`}
          aria-expanded="false"
          className="flex flex-col items-center gap-2 text-muted hover:text-ink"
        >
          <IconMerge className="text-lg" />
          <span className="num rounded-full bg-card px-1.5 text-[11px] text-ink-2">{rows.length}</span>
          <span className="text-[10px] tracking-wider [writing-mode:vertical-rl]">
            Merge Requests
          </span>
        </button>
      </section>
    )
  }

  return (
    <section className="panel grid min-h-0 grid-rows-[auto_1fr]">
      <div className="panel-head">
        <IconMerge className="text-sm" />
        <span className="flex-1">Merge Requests</span>
        <button
          type="button"
          onClick={onToggle}
          title="Merge Requests einklappen"
          aria-expanded="true"
          className="num rounded px-1 normal-case hover:text-ink"
        >
          {rows.length} ›
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted">Nichts offen.</p>
      ) : (
        <ul className="grid content-start gap-1.5 overflow-hidden text-xs" role="list">
          {rows.map((row) => (
            <li key={row.webUrl} className="border-b border-rule pb-1.5 last:border-0">
              <a
                href={row.webUrl}
                target="_blank"
                rel="noreferrer"
                className="grid grid-cols-[1fr_auto] items-center gap-x-2.5 no-underline"
              >
                <span className="text-ink">{row.title}</span>
                <span
                  className={`num row-span-2 flex items-center gap-1 whitespace-nowrap ${
                    row.ageDays >= OLD_DAYS ? 'font-semibold text-serious' : 'text-muted'
                  }`}
                  title={`${row.ageDays} Tage offen`}
                >
                  {row.approvals > 0 ? (
                    <StatusGood className="text-sm text-good" title={`${row.approvals} Freigaben`} />
                  ) : null}
                  {row.ageDays} T
                </span>
                <span className="text-[11px] text-muted">
                  {row.project} · {row.author}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
