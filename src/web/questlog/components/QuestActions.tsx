import type { Quest, RewardState } from '../../../shared/questlog/types'
import { type Strings, useStrings } from '../strings'

export type QuestAction = 'accept' | 'complete' | 'abandon'

interface Props {
  quest: Quest | null
  reward: RewardState | null
  busy: QuestAction | null
  onAccept: (quest: Quest) => void
  onComplete: (quest: Quest) => void
  onAbandon: (quest: Quest) => void
}

function abandonHint(t: Strings, quest: Quest | null, reward: RewardState | null): string {
  if (reward === 'paid') return t.abandonRewarded
  if (!quest || quest.state === 'available') return t.abandonUntaken
  return t.abandonHint
}

export function QuestActions({ quest, reward, busy, onAccept, onComplete, onAbandon }: Props) {
  const t = useStrings()
  const idle = quest != null && busy == null
  const state = quest?.state ?? 'available'

  const main =
    state === 'available'
      ? { label: busy === 'accept' ? t.accepting : t.accept, hint: t.acceptHint, run: onAccept, open: idle }
      : state === 'active'
        ? {
            label: busy === 'complete' ? t.completing : t.complete,
            hint: reward ? t.rewardedHint : t.completeHint,
            run: onComplete,
            open: idle && reward == null,
          }
        : { label: t.handedInLabel, hint: t.handedInHint, run: onComplete, open: false }

  return (
    <div className="quest-actions">
      <button
        type="button"
        className="btn"
        disabled={!idle || state === 'available' || reward === 'paid'}
        onClick={() => quest && onAbandon(quest)}
        title={abandonHint(t, quest, reward)}
      >
        {busy === 'abandon' ? t.abandoning : t.abandon}
      </button>
      <button
        type="button"
        className="btn"
        disabled={!main.open}
        onClick={() => quest && main.run(quest)}
        title={main.hint}
      >
        {main.label}
      </button>
    </div>
  )
}
