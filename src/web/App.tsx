import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { IssueRow } from '../shared/types.js'
import {
  nextSeason,
  nextSeasonStart,
  reminderActive,
  seasonByKey,
  seasonFor,
  workdaysBetween,
} from '../shared/season.js'
import {
  getBoard,
  getBurndown,
  getCalendar,
  getCommits,
  getEpics,
  getMergeRequests,
  getPipelines,
  getInbox,
  getMe,
  getProfile,
  markRead,
  getSprint,
  moveIssue,
  moveIssueToWeek,
} from './api.js'
import { usePolled } from './usePolled.js'
import { Ampel } from './components/Ampel.js'
import { MergeRequests } from './components/MergeRequests.js'
import { People } from './components/People.js'
import { InboxWindow, openCount } from './components/Inbox.js'
import { ProfileWindow } from './components/Profile.js'
import { RewardDialog } from './components/RewardDialog.js'
import { SeasonDecor } from './components/SeasonDecor.js'
import { SeasonHeader } from './components/SeasonHeader.js'
import { SprintTile } from './components/SprintTile.js'
import { Stories } from './components/Stories.js'
import { Timer } from './components/Timer.js'
import { IconStale } from './icons.js'

const QuestlogOverlay = lazy(() => import('./questlog/QuestlogOverlay.js'))

const dismissKey = (iso: string) => `theme-reminder-dismissed-${iso}`

function Problem({ what, message }: { what: string; message: string }) {
  return (
    <section className="panel flex shrink-0 items-center gap-2.5 text-xs text-serious">
      <IconStale className="text-base shrink-0" />
      <span>
        {what}: {message}
      </span>
    </section>
  )
}

export function App() {
  const [clock, setClock] = useState(() => new Date())
  const [dismissed, setDismissed] = useState(false)
  const [questKey, setQuestKey] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [rewardKey, setRewardKey] = useState<string | null>(null)
  const [mrsCollapsed, setMrsCollapsed] = useState(
    () => localStorage.getItem('mrs-collapsed') === 'true',
  )

  useEffect(() => {
    localStorage.setItem('mrs-collapsed', String(mrsCollapsed))
  }, [mrsCollapsed])

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 15_000)
    return () => clearInterval(timer)
  }, [])

  const forced = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get('season')
    return requested ? seasonByKey(requested) : undefined
  }, [])

  const board = usePolled(useCallback(() => getBoard(), []), 600)
  const refresh = board.value?.refreshSeconds ?? 60

  const pipelines = usePolled(useCallback((fresh: boolean) => getPipelines(fresh), []), refresh)
  const mrs = usePolled(useCallback(() => getMergeRequests(), []), refresh)
  const sprint = usePolled(useCallback(() => getSprint(), []), refresh)
  const commits = usePolled(useCallback(() => getCommits(), []), refresh * 5)
  const calendar = usePolled(useCallback(() => getCalendar(), []), refresh * 5)
  const epics = usePolled(useCallback(() => getEpics(), []), refresh * 5)
  const burndown = usePolled(useCallback(() => getBurndown(), []), refresh * 5)
  const profile = usePolled(useCallback(() => getProfile(), []), refresh * 5)
  const me = usePolled(useCallback(() => getMe(), []), 600)
  const inbox = usePolled(useCallback(() => getInbox(), []), refresh)

  const season = forced ?? seasonFor(clock)
  const start = nextSeasonStart(clock)
  const upcoming = nextSeason(clock)
  const daysLeft = workdaysBetween(clock, start)
  const lead = board.value?.reminderLeadMonths ?? 1

  useEffect(() => {
    document.documentElement.dataset.season = season.key
  }, [season.key])

  useEffect(() => {
    setDismissed(localStorage.getItem(dismissKey(start.toISOString())) === todayStamp(clock))
  }, [start, clock])

  const showReminder = reminderActive(clock, lead) && !dismissed

  const reloadSprint = sprint.reload
  const reloadProfile = profile.reload
  const openProfile = useCallback(() => {
    setProfileOpen(true)
    void reloadProfile()
  }, [reloadProfile])
  const closeProfile = useCallback(() => setProfileOpen(false), [])

  const reloadInbox = inbox.reload
  const openInbox = useCallback(() => {
    setInboxOpen(true)
    void reloadInbox()
  }, [reloadInbox])
  const closeInbox = useCallback(() => setInboxOpen(false), [])
  const seen = useCallback(
    (ids: number[]) => {
      void markRead(ids)
        .catch(() => undefined)
        .then(() => reloadInbox())
    },
    [reloadInbox],
  )
  const closeReward = useCallback(() => setRewardKey(null), [])
  const distributed = useCallback(() => {
    void reloadInbox()
    void reloadProfile()
  }, [reloadInbox, reloadProfile])

  const onMove = useCallback(
    async (key: string, lane: IssueRow['lane']) => {
      await moveIssue(key, lane)
      await reloadSprint()
    },
    [reloadSprint],
  )

  const onWeek = useCallback(
    async (key: string, week: string | null) => {
      await moveIssueToWeek(key, week)
      await reloadSprint()
    },
    [reloadSprint],
  )

  const closeQuestlog = useCallback(() => {
    setQuestKey(null)
    void reloadSprint()
    void reloadProfile()
  }, [reloadSprint, reloadProfile])

  const onDismiss = () => {
    localStorage.setItem(dismissKey(start.toISOString()), todayStamp(clock))
    setDismissed(true)
  }

  return (
    <div className="app-frame relative z-1 flex h-full flex-col gap-3 p-3">
      <SeasonHeader
        season={season}
        next={upcoming}
        nextStart={start}
        daysLeft={daysLeft}
        reminder={showReminder}
        onDismiss={onDismiss}
        preview={Boolean(forced)}
        clock={clock}
        epics={epics.value?.data.rows ?? []}
        epicsJql={epics.value?.data.jql ?? null}
        epicsError={epics.error}
        profile={profile.value?.data ?? null}
        profileError={profile.error}
        onOpenProfile={openProfile}
        inboxCount={openCount(inbox.value?.messages ?? [])}
        inboxError={inbox.error}
        onOpenInbox={openInbox}
      />

      <Timer ask />

      <main
        className="grid min-h-0 flex-1 gap-3"
        style={{ gridTemplateColumns: mrsCollapsed ? '4fr 8fr auto' : '3fr 6fr 3fr' }}
      >
        <div className="grid min-h-0 grid-rows-[auto_1fr] gap-3">
          {sprint.value ? (
            <SprintTile
              sprint={sprint.value.data.sprint}
              burndown={burndown.value?.data ?? null}
              burndownError={burndown.error}
            />
          ) : null}
          <People
            team={board.value?.team ?? []}
            commits={commits.value?.data.byMember ?? {}}
            commitProblems={commits.value?.data.problems ?? {}}
            calendar={calendar.value?.data ?? {}}
            commitsError={commits.error}
            calendarError={calendar.error}
          />
        </div>

        <div className="grid min-h-0">
          {sprint.error ? (
            <Problem what="Sprint" message={sprint.error} />
          ) : (
            <Stories
              issues={sprint.value?.data.issues ?? []}
              weeks={board.value?.weekComponents ?? []}
              workdaysLeft={sprint.value?.data.sprint.workdaysLeft ?? null}
              onMove={onMove}
              onWeek={onWeek}
              onOpen={setQuestKey}
            />
          )}
        </div>

        {mrs.error ? (
          <Problem what="Merge Requests" message={mrs.error} />
        ) : (
          <MergeRequests
            rows={mrs.value?.data ?? []}
            collapsed={mrsCollapsed}
            onToggle={() => setMrsCollapsed((value) => !value)}
          />
        )}
      </main>

      {pipelines.error ? (
        <Problem what="Pipelines" message={pipelines.error} />
      ) : (
        <Ampel
          rows={pipelines.value?.data ?? []}
          stale={pipelines.value?.stale ?? false}
          onRefresh={pipelines.reload}
        />
      )}

      <SeasonDecor season={season.key} />

      {profileOpen ? (
        <ProfileWindow
          profile={profile.value?.data ?? null}
          error={profile.error}
          viewer={me.value?.viewer ?? null}
          onClose={closeProfile}
        />
      ) : null}

      {inboxOpen ? (
        <InboxWindow
          inbox={inbox.value ?? null}
          error={inbox.error}
          onClose={closeInbox}
          onOpenReward={setRewardKey}
          onSeen={seen}
        />
      ) : null}

      {rewardKey ? (
        <RewardDialog questKey={rewardKey} onClose={closeReward} onDistributed={distributed} />
      ) : null}

      {questKey ? (
        <Suspense fallback={null}>
          <QuestlogOverlay issueKey={questKey} onClose={closeQuestlog} />
        </Suspense>
      ) : null}
    </div>
  )
}

function todayStamp(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}
