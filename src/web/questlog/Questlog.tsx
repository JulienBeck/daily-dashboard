import { useEffect, useMemo, useState } from 'react'
import { applyFilter, type Filter } from '../../shared/questlog/quest'
import type { Quest } from '../../shared/questlog/types'
import {
  abandonQuest,
  acceptQuest,
  completeQuest,
  createQuest,
  getPage,
  getQuestlog,
  type NewQuestInput,
} from './api'
import { AbandonDialog } from './components/AbandonDialog'
import { NewQuestForm } from './components/NewQuestForm'
import { QuestActions, type QuestAction } from './components/QuestActions'
import { QuestDetail } from './components/QuestDetail'
import { QuestList } from './components/QuestList'
import { MapIcon } from './icons'
import { useStrings } from './strings'
import { usePolled } from './usePolled'

const FILTERS: Filter[] = ['all', 'available', 'active', 'complete']

interface Props {
  initialKey?: string | null
  onClose?: () => void
}

export function Questlog({ initialKey = null, onClose }: Props) {
  const t = useStrings()
  const log = usePolled(getQuestlog, 0, [])
  const [pageId, setPageId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey)
  const [seeking, setSeeking] = useState<string | null>(initialKey)
  const [notice, setNotice] = useState<{ text: string; kind: 'info' | 'error' } | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<{ key: string; action: QuestAction } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Quest | null>(null)

  const pages = useMemo(() => log.data?.pages ?? [], [log.data])
  const active = pageId ?? pages[0]?.id ?? null

  useEffect(() => {
    if (!pageId && pages[0]) setPageId(pages[0].id)
  }, [pageId, pages])

  const page = usePolled(
    () => (active ? getPage(active) : Promise.resolve(null)),
    log.data?.refreshSeconds ?? 0,
    [active],
  )

  const payload = page.data?.data ?? null
  const series = useMemo(() => applyFilter(payload?.series ?? [], filter), [payload, filter])
  const quests = useMemo(() => series.flatMap((entry) => entry.quests), [series])
  const epics = useMemo(
    () => series.map((entry) => entry.epic).filter((epic) => epic != null),
    [series],
  )

  // One key for both: epic keys and story keys cannot collide in Jira. The
  // story is looked up first, because only a story may be taken or handed in.
  const story = quests.find((quest) => quest.key === selectedKey) ?? null
  const shown = story ?? epics.find((epic) => epic.key === selectedKey) ?? null

  useEffect(() => {
    if (!seeking || !payload || payload.page.id !== active) return
    const found = payload.series.some((entry) =>
      entry.quests.some((quest) => quest.key === seeking),
    )
    if (found) {
      setSeeking(null)
      return
    }
    const next = pages[pages.findIndex((entry) => entry.id === active) + 1]
    if (next) setPageId(next.id)
    else setSeeking(null)
  }, [seeking, payload, active, pages])

  useEffect(() => {
    if (!seeking && !shown && quests[0]) setSelectedKey(quests[0].key)
  }, [seeking, shown, quests])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  const pageInfo = pages.find((entry) => entry.id === active) ?? null
  const error = log.error ?? page.error ?? page.data?.error ?? null

  const toggleSeries = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })

  const writeQuest = async (
    quest: Quest,
    action: QuestAction,
    run: (pageId: string) => Promise<string>,
  ) => {
    if (!active) return
    setBusy({ key: quest.key, action })
    try {
      setNotice({ text: await run(active), kind: 'info' })
      page.reload()
    } catch (reason: unknown) {
      setNotice({
        text: reason instanceof Error ? reason.message : String(reason),
        kind: 'error',
      })
    } finally {
      setBusy(null)
    }
  }

  const accept = (quest: Quest) =>
    writeQuest(quest, 'accept', async (pageId) => {
      const taken = await acceptQuest(pageId, quest.key)
      return t.taken(taken.key, taken.assignee, taken.status)
    })

  const complete = (quest: Quest) =>
    writeQuest(quest, 'complete', async (pageId) => {
      const handed = await completeQuest(pageId, quest.key)
      return t.handedIn(handed.key, handed.status)
    })

  const dropQuest = (quest: Quest) =>
    writeQuest(quest, 'abandon', async (pageId) => {
      const dropped = await abandonQuest(pageId, quest.key)
      return t.abandoned(dropped.key, dropped.status)
    })

  const abandon = (quest: Quest) => {
    if (quest.state === 'complete') setConfirming(quest)
    else void dropQuest(quest)
  }

  const submit = async (quest: NewQuestInput) => {
    if (!active) return
    setSaving(true)
    setFormError(null)
    try {
      const created = await createQuest(active, quest)
      setFormOpen(false)
      setSelectedKey(created.key)
      setNotice({ text: t.created(created.key), kind: 'info' })
      page.reload()
    } catch (reason: unknown) {
      setFormError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  const nextFilter = () => {
    setFilter(FILTERS[(FILTERS.indexOf(filter) + 1) % FILTERS.length]!)
  }

  return (
    <div className="frame">
      <div className="portrait" aria-hidden="true" />

      {onClose ? (
        <button type="button" className="btn ql-close" aria-label={t.close} onClick={onClose}>
          ×
        </button>
      ) : null}

      <div className="titlebar">
        <h1>{t.title}</h1>
      </div>

      <div className="tabs" role="tablist" aria-label={t.pages}>
        {pages.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={entry.id === active}
            onClick={() => {
              setPageId(entry.id)
              setSelectedKey(null)
              setSeeking(null)
            }}
          >
            {entry.title}
          </button>
        ))}
      </div>

      <div className="list-header">
        <div className="half">
          <button type="button" className="filter" onClick={nextFilter} title={payload?.jql ?? ''}>
            <span className="checkbox" aria-hidden="true">
              {filter === 'all' ? '−' : ''}
            </span>
            {/* Every label is laid out and only the current one shown, so the
                button is as wide as the longest and does not jump. */}
            <span className="filter-label">
              {FILTERS.map((entry) => (
                <span key={entry} data-current={entry === filter || undefined} aria-hidden={entry !== filter || undefined}>
                  {t.filters[entry]}
                </span>
              ))}
            </span>
          </button>

          <span className="counter" title={payload?.chapter ?? ''}>
            {t.counter(payload ? payload.complete : 0, payload ? payload.total : 0)}
          </span>
        </div>

        <div className="half right">
          {log.data?.jiraBaseUrl && (
            <a
              className="jira-link"
              href={log.data.jiraBaseUrl}
              target="_blank"
              rel="noreferrer"
              title={t.openJira}
            >
              {t.showMap}
              <span className="thumb">
                <MapIcon />
              </span>
            </a>
          )}
        </div>
      </div>

      <div className="body">
        <div className="page page-left">
          <QuestList
            series={series}
            selected={selectedKey}
            collapsed={collapsed}
            onSelect={(quest) => setSelectedKey(quest.key)}
            onToggleSeries={toggleSeries}
            emptyText={
              page.loading && !payload
                ? t.loading
                : error
                  ? t.pageFailed(error)
                  : t.pageEmpty
            }
          />
        </div>

        <div className="page page-right">
          <QuestDetail quest={shown} />
        </div>
      </div>

      {notice && (
        <div className="notice" data-kind={notice.kind} role="status">
          {notice.text}
        </div>
      )}
      {!notice && error && payload && (
        <div className="notice" data-kind="error" role="status">
          {t.stale(error)}
        </div>
      )}

      {/* Split like the body, so each page has its buttons right under it. */}
      <div className="footer">
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!pageInfo?.canCreate}
            onClick={() => {
              setFormError(null)
              setFormOpen(true)
            }}
            title={
              pageInfo?.canCreate
                ? t.createHint
                : t.createForbidden
            }
          >
            {t.create}
          </button>
        </div>
        <QuestActions
          quest={story}
          reward={story ? (payload?.rewards[story.key] ?? null) : null}
          busy={story != null && busy?.key === story.key ? busy.action : null}
          onAccept={accept}
          onComplete={complete}
          onAbandon={abandon}
        />
      </div>

      <AbandonDialog
        questKey={confirming?.key ?? null}
        onConfirm={() => {
          if (confirming) void dropQuest(confirming)
          setConfirming(null)
        }}
        onClose={() => setConfirming(null)}
      />

      <NewQuestForm
        open={formOpen}
        pageTitle={pageInfo?.title ?? ''}
        busy={saving}
        error={formError}
        onSubmit={submit}
        onClose={() => setFormOpen(false)}
      />
    </div>
  )
}
