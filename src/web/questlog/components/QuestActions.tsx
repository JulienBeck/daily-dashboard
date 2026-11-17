import type { Quest } from '../../../shared/questlog/types'
import { useStrings } from '../strings'

export type QuestAction = 'accept' | 'complete'

interface Props {
  quest: Quest | null
  /** The write running on this quest; its button says so, the other one waits. */
  busy: QuestAction | null
  onAccept: (quest: Quest) => void
  onComplete: (quest: Quest) => void
}

/** Taking and handing in the quest on the sheet, in the bar right under it. */
export function QuestActions({ quest, busy, onAccept, onComplete }: Props) {
  const t = useStrings()

  return (
    <div className="quest-actions">
      <button
        type="button"
        className="btn"
        disabled={!quest || busy != null}
        onClick={() => quest && onAccept(quest)}
        title={t.acceptHint}
      >
        {busy === 'accept' ? t.accepting : t.accept}
      </button>
      <button
        type="button"
        className="btn"
        disabled={!quest || busy != null}
        onClick={() => quest && onComplete(quest)}
        title={t.completeHint}
      >
        {busy === 'complete' ? t.completing : t.complete}
      </button>
    </div>
  )
}
