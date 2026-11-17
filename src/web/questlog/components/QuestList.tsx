import { formatLevel } from '../../../shared/questlog/quest'
import type { Quest, Series } from '../../../shared/questlog/types'
import { QuestMarker } from '../icons'
import { useStrings } from '../strings'

interface Props {
  series: Series[]
  selected: string | null
  collapsed: ReadonlySet<string>
  onSelect: (quest: Quest) => void
  onToggleSeries: (key: string) => void
  emptyText: string
}

export function QuestList({
  series,
  selected,
  collapsed,
  onSelect,
  onToggleSeries,
  emptyText,
}: Props) {
  const t = useStrings()

  if (series.length === 0) {
    return <div className="empty">{emptyText}</div>
  }

  return (
    <div className="quest-list">
      {series.map((entry) => {
        const open = !collapsed.has(entry.key)
        const name = entry.name ?? t.noSeries
        const epic = entry.epic
        return (
          <div className="series" key={entry.key || 'none'}>
            <div className="series-head">
              {/* Two controls, not one: the box folds the series, the name puts
                  the epic on the sheet. A link inside a button would be neither. */}
              <button
                type="button"
                className="collapse"
                aria-expanded={open}
                aria-label={open ? t.foldSeriesIn(name) : t.foldSeriesOut(name)}
                onClick={() => onToggleSeries(entry.key)}
              >
                {open ? '−' : '+'}
              </button>

              {/* No epic came back — the series still reads, it just has no
                  sheet to open, so it stays plain text instead of a dead knob. */}
              {epic ? (
                <button
                  type="button"
                  className="series-name"
                  aria-current={entry.key === selected}
                  title={t.openSeries(name)}
                  onClick={() => onSelect(epic)}
                >
                  {name}
                </button>
              ) : (
                <span className="series-name">{name}</span>
              )}

              <span className="series-count">{entry.quests.length}</span>
            </div>

            {open &&
              entry.quests.map((quest) => (
                <button
                  type="button"
                  key={quest.key}
                  className="quest-row"
                  data-difficulty={quest.difficulty}
                  aria-current={quest.key === selected}
                  title={t.questTitle(quest.key, quest.status)}
                  onClick={() => onSelect(quest)}
                >
                  <span className="key">{quest.key}</span>
                  <span className="headline">
                    <span className="level">{formatLevel(quest.level)}</span> {quest.title}
                  </span>
                  <span className="marker">
                    <QuestMarker state={quest.state} status={quest.status} />
                  </span>
                </button>
              ))}
          </div>
        )
      })}
    </div>
  )
}
