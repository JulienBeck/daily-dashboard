import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

export const MIN_MINUTES = 1
export const MAX_MINUTES = 60

const SIZE = 200
const CENTER = SIZE / 2
const RADIUS = 78
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function minutesAt(dx: number, dy: number): number {
  const degrees = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
  return Math.round(degrees / 6) % 60
}

export function nextMinutes(previous: number, raw: number): number {
  if (previous >= 45 && raw < 15) return MAX_MINUTES
  if (previous <= 15 && raw >= 45) return MIN_MINUTES
  return Math.max(MIN_MINUTES, raw)
}

const clamp = (value: number) => Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, value))

const point = (minutes: number, radius: number) => {
  const angle = (minutes / 60) * 2 * Math.PI
  return { x: CENTER + radius * Math.sin(angle), y: CENTER - radius * Math.cos(angle) }
}

interface Props {
  initial: number
  onApply: (minutes: number) => void
  onCancel: () => void
}

export function TimerDial({ initial, onApply, onCancel }: Props) {
  const [minutes, setMinutes] = useState(clamp(initial))
  const dragging = useRef(false)
  const slider = useRef<HTMLDivElement>(null)

  useEffect(() => {
    slider.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const follow = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const raw = minutesAt(
      event.clientX - (box.left + box.width / 2),
      event.clientY - (box.top + box.height / 2),
    )
    setMinutes((previous) => nextMinutes(previous, raw))
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 5,
      PageDown: -5,
    }
    if (event.key in step) setMinutes((value) => clamp(value + step[event.key]))
    else if (event.key === 'Home') setMinutes(MIN_MINUTES)
    else if (event.key === 'End') setMinutes(MAX_MINUTES)
    else if (event.key === 'Enter') onApply(minutes)
    else return
    event.preventDefault()
    event.stopPropagation()
  }

  const handle = point(minutes, RADIUS)
  const ticks = Array.from({ length: 12 }, (_, index) => index * 5)

  return (
    <div
      role="dialog"
      aria-label="Timebox einstellen"
      className="panel absolute top-full right-0 z-30 mt-2 flex flex-col items-center gap-3 shadow-2xl"
    >
      <div
        ref={slider}
        role="slider"
        tabIndex={0}
        aria-label="Minuten"
        aria-valuemin={MIN_MINUTES}
        aria-valuemax={MAX_MINUTES}
        aria-valuenow={minutes}
        aria-valuetext={`${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`}
        onKeyDown={onKeyDown}
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          className="cursor-pointer touch-none select-none"
          onPointerDown={(event) => {
            dragging.current = true
            event.currentTarget.setPointerCapture?.(event.pointerId)
            follow(event)
          }}
          onPointerMove={(event) => {
            if (dragging.current) follow(event)
          }}
          onPointerUp={() => {
            dragging.current = false
          }}
        >
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="var(--rule)" strokeWidth={4} />
          {ticks.map((tick) => {
            const inner = point(tick, RADIUS - 16)
            const label = point(tick, RADIUS - 28)
            return (
              <g key={tick}>
                <circle cx={inner.x} cy={inner.y} r={1.4} fill="var(--ink-muted)" />
                {tick % 15 === 0 ? (
                  <text
                    x={label.x}
                    y={label.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={10}
                    fill="var(--ink-muted)"
                  >
                    {String(tick).padStart(2, '0')}
                  </text>
                ) : null}
              </g>
            )
          })}
          <circle
            data-testid="dial-arc"
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${(minutes / 60) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
          />
          <circle data-testid="dial-handle" cx={handle.x} cy={handle.y} r={9} fill="var(--accent)" />
          <circle cx={handle.x} cy={handle.y} r={3} fill="var(--plane)" />
          <text
            x={CENTER}
            y={CENTER - 4}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={30}
            fontWeight={600}
            fill="var(--ink)"
            className="num"
          >
            {minutes}
          </text>
          <text x={CENTER} y={CENTER + 20} textAnchor="middle" fontSize={11} fill="var(--ink-muted)">
            {minutes === 1 ? 'Minute' : 'Minuten'}
          </text>
        </svg>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-white/10 bg-card px-3 py-1 text-xs text-ink-2 hover:border-muted hover:text-ink"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={() => onApply(minutes)}
          className="rounded-md border border-accent bg-accent px-3 py-1 text-xs font-semibold text-plane hover:brightness-110"
        >
          Übernehmen
        </button>
      </div>
    </div>
  )
}
