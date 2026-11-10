import { useCallback, useEffect, useRef, useState } from 'react'
import { IconTimer } from '../icons.js'
import { TimerDial } from './TimerDial.js'

const DEFAULT_TOTAL = 15 * 60

export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  return `${String(minutes).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function Timer({ ask = false }: { ask?: boolean }) {
  const [asking, setAsking] = useState(ask)
  const [total, setTotal] = useState(DEFAULT_TOTAL)
  const [left, setLeft] = useState(DEFAULT_TOTAL)
  const [setting, setSetting] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const [running, setRunning] = useState(false)
  const [alarm, setAlarm] = useState(false)

  const toggle = useCallback(() => setRunning((value) => !value), [])

  const reset = useCallback(() => {
    setLeft(total)
    setRunning(false)
    setAlarm(false)
  }, [total])

  const apply = useCallback((minutes: number) => {
    setTotal(minutes * 60)
    setLeft(minutes * 60)
    setAlarm(false)
    setSetting(false)
  }, [])

  const cancel = useCallback(() => setSetting(false), [])

  useEffect(() => {
    if (!setting) return
    const onOutside = (event: PointerEvent) => {
      if (anchor.current && !anchor.current.contains(event.target as Node)) cancel()
    }
    document.addEventListener('pointerdown', onOutside)
    return () => document.removeEventListener('pointerdown', onOutside)
  }, [setting, cancel])

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

  const answer = useCallback((start: boolean) => {
    setAsking(false)
    if (start) setRunning(true)
  }, [])

  useEffect(() => {
    if (!asking) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') answer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [asking, answer])

  useEffect(() => {
    if (asking || setting) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [asking, setting, toggle])

  const progress = ((total - left) / total) * 100
  const label = running ? 'Pause' : left === total ? 'Start' : left === 0 ? 'Zurücksetzen' : 'Weiter'

  return (
    <section className="panel flex shrink-0 items-center gap-3 py-2" aria-label="Daily-Timer">
      <IconTimer className="text-base shrink-0 text-muted" />

      <div
        className={`h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-rule${alarm ? ' timer-alarm' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={total - left}
        aria-valuetext={`${formatClock(left)} verbleibend`}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div ref={anchor} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setSetting((value) => !value)}
          disabled={running}
          aria-label={`Timebox einstellen, ${formatClock(left)}`}
          title={running ? 'Pausieren, um die Timebox zu ändern' : 'Timebox einstellen'}
          className={`num rounded px-1 text-sm font-bold enabled:cursor-pointer enabled:hover:bg-white/10${alarm ? ' text-critical' : ''}`}
        >
          {formatClock(left)}
        </button>

        {setting ? (
          <TimerDial initial={Math.round(total / 60)} onApply={apply} onCancel={cancel} />
        ) : null}
      </div>

      {alarm ? (
        <div
          className="alarm-frame"
          role="alert"
          aria-label="Timebox abgelaufen"
          onAnimationEnd={() => setAlarm(false)}
        />
      ) : null}

      {asking ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/55">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="timer-ask-title"
            className="panel flex flex-col items-center gap-4 border-t-[3px] border-t-accent px-8 py-6 shadow-2xl"
          >
            <IconTimer className="text-[28px] text-accent" />
            <div id="timer-ask-title" className="text-base font-semibold">
              Daily-Timer starten?
            </div>
            <div className="text-xs text-muted">{formatClock(total)} Timebox</div>
            <div className="flex gap-2.5">
              <button
                type="button"
                autoFocus
                onClick={() => answer(true)}
                className="rounded-md border border-accent bg-accent px-4 py-1.5 text-sm font-semibold text-plane hover:brightness-110"
              >
                Starten
              </button>
              <button
                type="button"
                onClick={() => answer(false)}
                className="rounded-md border border-white/10 bg-card px-4 py-1.5 text-sm text-ink-2 hover:border-muted hover:text-ink"
              >
                Nicht jetzt
              </button>
            </div>
          </div>
        </div>
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
