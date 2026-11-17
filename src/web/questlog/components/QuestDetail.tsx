import type { ReactNode } from 'react'
import { formatNumber } from '../../../shared/questlog/quest'
import type { Quest } from '../../../shared/questlog/types'
import sealUrl from '../../assets/questlog/seal.webp'
import { CoinRow, ScrollIcon } from '../icons'
import { useStrings } from '../strings'
import { useOverflowMark } from '../useOverflowMark'

interface Props {
  quest: Quest | null
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export function QuestDetail({ quest }: Props) {
  const t = useStrings()
  const ref = useOverflowMark<HTMLDivElement>([quest])

  if (!quest) {
    return (
      <div className="parchment" ref={ref}>
        <p className="placeholder">{t.pickAQuest}</p>
      </div>
    )
  }

  // Without a description the proxy falls back to the title; saying it twice
  // only pushes the rest of the sheet down.
  const objective = quest.objective.trim() === quest.title.trim() ? null : quest.objective

  return (
    <div className="parchment" ref={ref}>
      <header className="quest-head">
        <div className="quest-kicker">
          <span>{quest.key}</span>
          <span>{quest.projectName}</span>
        </div>
        <h2>{quest.title}</h2>
      </header>

      <dl className="quest-facts">
        {quest.issueType && <Fact label={t.issueType}>{quest.issueType}</Fact>}
        {quest.priority && <Fact label={t.priority}>{quest.priority}</Fact>}
        <Fact label={t.status}>{quest.status}</Fact>
        <Fact label={t.hero}>
          {quest.assignee ?? <span className="unclaimed">{t.unclaimed}</span>}
        </Fact>
      </dl>

      {quest.labels.length > 0 && (
        <ul className="quest-labels">
          {quest.labels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      )}

      {(objective || quest.description) && (
        <section className="quest-text">
          {objective && <p className="objective">{objective}</p>}
          {quest.description && (
            <>
              <h3>{t.description}</h3>
              <p>{quest.description}</p>
            </>
          )}
        </section>
      )}

      <section className="quest-reward">
        <h3>{t.reward}</h3>

        <dl className="purse">
          {quest.seriesName && (
            <div className="series">
              <dt>{t.series}</dt>
              <dd>
                <a href={quest.webUrl} target="_blank" rel="noreferrer">
                  <ScrollIcon />
                  {quest.seriesName}
                </a>
              </dd>
            </div>
          )}
          <Fact label={t.purse}>
            <CoinRow {...quest.coins} />
          </Fact>
          <Fact label={t.experience}>
            <strong>{formatNumber(quest.experience, t.locale)}</strong>
            {quest.points != null && <small>{t.storyPoints(quest.points)}</small>}
          </Fact>
        </dl>
      </section>

      <footer className="giver">
        <div className="signature">
          {/* The flourish is for the eye; the printed name below is what is read out. */}
          <div className="name" aria-hidden="true">
            {quest.giver ?? t.unknownGiver}
          </div>
          <div className="printed">{quest.giver ?? t.unknownGiver}</div>
          <div className="role">{t.questGiver}</div>
        </div>
        <img className="seal" src={sealUrl} alt="" />
      </footer>
    </div>
  )
}
