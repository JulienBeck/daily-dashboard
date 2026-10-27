import { useCallback, useEffect, useMemo, useState } from 'react'
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
  getSprint,
  moveIssue,
} from './api.js'
import { usePolled } from './usePolled.js'
import { Ampel } from './components/Ampel.js'
import { Burndown } from './components/Burndown.js'
import { MergeRequests } from './components/MergeRequests.js'
import { People } from './components/People.js'
import { ReminderBand } from './components/ReminderBand.js'
import { SeasonHeader } from './components/SeasonHeader.js'
import { SprintTile } from './components/SprintTile.js'
import { Stories } from './components/Stories.js'
import { Timer } from './components/Timer.js'
import { IconStale } from './icons.js'

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

  const pipelines = usePolled(useCallback(() => getPipelines(), []), refresh)
  const mrs = usePolled(useCallback(() => getMergeRequests(), []), refresh)
  const sprint = usePolled(useCallback(() => getSprint(), []), refresh)
  const commits = usePolled(useCallback(() => getCommits(), []), refresh * 5)
  const calendar = usePolled(useCallback(() => getCalendar(), []), refresh * 5)
  const epics = usePolled(useCallback(() => getEpics(), []), refresh * 5)
  const burndown = usePolled(useCallback(() => getBurndown(), []), refresh * 5)

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
  const onMove = useCallback(
    async (key: string, lane: IssueRow['lane']) => {
      await moveIssue(key, lane)
      await reloadSprint()
    },
    [reloadSprint],
  )

  const onDismiss = () => {
    localStorage.setItem(dismissKey(start.toISOString()), todayStamp(clock))
    setDismissed(true)
  }

  return (
    <div className="relative z-1 flex h-full flex-col gap-3 p-3">
      <SeasonHeader
        season={season}
        next={upcoming}
        nextStart={start}
        daysLeft={daysLeft}
        preview={Boolean(forced)}
        clock={clock}
        epics={epics.value?.data.rows ?? []}
        epicsJql={epics.value?.data.jql ?? null}
        epicsError={epics.error}
      />

      {showReminder ? (
        <ReminderBand next={upcoming} daysLeft={daysLeft} onDismiss={onDismiss} />
      ) : null}

      <Timer />

      <main
        className="grid min-h-0 flex-1 gap-3"
        style={{ gridTemplateColumns: mrsCollapsed ? '4fr 8fr auto' : '3fr 6fr 3fr' }}
      >
        <div className="grid min-h-0 grid-rows-[auto_auto_1fr] gap-3">
          {sprint.value ? <SprintTile sprint={sprint.value.data.sprint} /> : null}
          {burndown.error ? (
            <Problem what="Burndown" message={burndown.error} />
          ) : burndown.value ? (
            <Burndown payload={burndown.value.data} />
          ) : null}
          <People
            team={board.value?.team ?? []}
            commits={commits.value?.data ?? {}}
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
              onMove={onMove}
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
        <Ampel rows={pipelines.value?.data ?? []} stale={pipelines.value?.stale ?? false} />
      )}
    </div>
  )
}

function todayStamp(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}
