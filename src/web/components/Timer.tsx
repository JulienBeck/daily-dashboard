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

  const toggle = useCallback(() => setRunning((value) => !value), [])

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      setLeft((value) => {
        if (value <= 1) {
          setRunning(false)
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [running])

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
      <IconTimer className="text-base text-muted" />
      <div
        className="relative grid size-11 place-items-center rounded-full"
        style={{ background: `conic-gradient(var(--accent) ${progress}%, var(--rule) 0)` }}
        role="img"
        aria-label={`${formatClock(left)} verbleibend`}
      >
        <span className="absolute inset-[5px] rounded-full bg-surface" />
        <span className="num relative text-[12px] font-bold">{formatClock(left)}</span>
      </div>
      <button
        type="button"
        onClick={() => (left === 0 ? (setLeft(TOTAL), setRunning(false)) : toggle())}
        title="Leertaste startet und pausiert"
        className="rounded-md border border-white/10 bg-card px-3 py-1 text-xs text-ink-2 hover:border-accent hover:text-ink"
      >
        {label}
      </button>
    </section>
  )
}
