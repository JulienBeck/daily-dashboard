import { useCallback, useEffect, useState } from 'react'
import { IconTimer } from '../icons.js'

const TOTAL = 15 * 60

export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  return `${String(minutes).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function Timer() {
  const [left, setLeft] = useState(TOTAL)
  const [running, setRunning] = useState(false)
  const [alarm, setAlarm] = useState(false)

  const toggle = useCallback(() => setRunning((value) => !value), [])

  const reset = useCallback(() => {
    setLeft(TOTAL)
    setRunning(false)
    setAlarm(false)
  }, [])

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [running])

  useEffect(() => {
    if (left > 0) return
    setRunning(false)
    setAlarm(true)
  }, [left])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const progress = ((TOTAL - left) / TOTAL) * 100
  const label = running ? 'Pause' : left === TOTAL ? 'Start' : left === 0 ? 'Zurücksetzen' : 'Weiter'

  return (
    <section className="panel flex shrink-0 items-center gap-3 py-2" aria-label="Daily-Timer">
      <IconTimer className="text-base shrink-0 text-muted" />

      <div
        className={`h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-rule${alarm ? ' timer-alarm' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={TOTAL}
        aria-valuenow={TOTAL - left}
        aria-valuetext={`${formatClock(left)} verbleibend`}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      <span className={`num shrink-0 text-sm font-bold${alarm ? ' text-critical' : ''}`}>
        {formatClock(left)}
      </span>

      {alarm ? (
        <div
          className="alarm-frame"
          role="alert"
          aria-label="Timebox abgelaufen"
          onAnimationEnd={() => setAlarm(false)}
        />
      ) : null}

      <button
        type="button"
        onClick={() => (left === 0 ? reset() : toggle())}
        title="Leertaste startet und pausiert"
        className="shrink-0 rounded-md border border-white/10 bg-card px-3 py-1 text-xs text-ink-2 hover:border-accent hover:text-ink"
      >
        {label}
      </button>
    </section>
  )
}
