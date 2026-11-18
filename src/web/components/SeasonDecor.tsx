import { type RefObject, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SeasonKey } from '../../shared/types.js'
import { type Box, decorate, type Piece } from '../seasonDecor.js'

interface Layout {
  frame: Box
  panels: Box[]
}

export function panelsIn(frame: Element): HTMLElement[] {
  return [...frame.querySelectorAll<HTMLElement>('.panel')].filter(
    (panel) => !panel.parentElement?.closest('.panel') && !panel.closest('[role="dialog"]'),
  )
}

export function measure(frame: HTMLElement): Layout {
  const outer = frame.getBoundingClientRect()
  const left = outer.left + frame.clientLeft
  const top = outer.top + frame.clientTop
  const panels = panelsIn(frame)
    .map((panel) => panel.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({ x: rect.left - left, y: rect.top - top, w: rect.width, h: rect.height }))
  return { frame: { x: 0, y: 0, w: frame.clientWidth, h: frame.clientHeight }, panels }
}

const same = (a: Layout | null, b: Layout) => JSON.stringify(a) === JSON.stringify(b)

function useFrameLayout(svg: RefObject<SVGSVGElement | null>): Layout | null {
  const [layout, setLayout] = useState<Layout | null>(null)

  useLayoutEffect(() => {
    const frame = svg.current?.parentElement
    if (!frame) return
    let frameId = 0
    const update = () => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        const next = measure(frame)
        setLayout((previous) => (same(previous, next) ? previous : next))
      })
    }
    const resize = new ResizeObserver(update)
    const observe = () => {
      resize.disconnect()
      resize.observe(frame)
      for (const panel of panelsIn(frame)) resize.observe(panel)
    }
    const mutation = new MutationObserver((records) => {
      if (records.every((record) => svg.current?.contains(record.target))) return
      observe()
      update()
    })
    mutation.observe(frame, { childList: true, subtree: true })
    observe()
    update()
    return () => {
      cancelAnimationFrame(frameId)
      resize.disconnect()
      mutation.disconnect()
    }
  }, [svg])

  return layout
}

function PieceView({ piece }: { piece: Piece }) {
  switch (piece.kind) {
    case 'snow':
      return <path d={piece.d} fill="url(#decor-snow)" stroke="rgba(160,190,215,0.8)" strokeWidth={0.6} filter="url(#decor-shadow)" />
    case 'ice':
      return <path d={piece.d} fill="url(#decor-ice)" stroke="rgba(255,255,255,0.7)" strokeWidth={0.5} />
    case 'stem':
      return <path d={piece.d} fill="none" stroke="#4e7a32" strokeWidth={1.4} strokeLinecap="round" />
    case 'frost':
      return <rect x={piece.box.x} y={piece.box.y} width={piece.box.w} height={piece.box.h} fill="url(#decor-frost)" />
    case 'glint':
      return <rect x={piece.x} y={piece.y - 2} width={piece.w} height={4} rx={2} fill="url(#decor-glint)" />
    case 'sun':
      return <circle cx={piece.x} cy={piece.y} r={piece.r} fill="url(#decor-sun)" />
    case 'sprite':
      return (
        <use
          href={`#decor-${piece.sprite}`}
          data-sprite={piece.sprite}
          x={piece.x - piece.size / 2}
          y={piece.y - piece.size / 2}
          width={piece.size}
          height={piece.size}
          color={piece.colour}
          transform={`rotate(${piece.rotate} ${piece.x} ${piece.y})`}
          filter="url(#decor-shadow)"
        />
      )
  }
}

const vein = { fill: 'none', stroke: 'rgba(40,20,5,0.45)', strokeWidth: 0.7, strokeLinecap: 'round' } as const

function Defs() {
  return (
    <defs>
      <linearGradient id="decor-snow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#d6e5f2" />
      </linearGradient>
      <linearGradient id="decor-ice" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="rgba(240,248,255,0.95)" />
        <stop offset="1" stopColor="rgba(150,200,235,0.55)" />
      </linearGradient>
      <linearGradient id="decor-frost" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="rgba(214,232,248,0)" />
        <stop offset="1" stopColor="rgba(214,232,248,0.4)" />
      </linearGradient>
      <linearGradient id="decor-glint" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="rgba(255,226,150,0.15)" />
        <stop offset="0.35" stopColor="rgba(255,240,200,0.9)" />
        <stop offset="0.6" stopColor="rgba(255,226,150,0.45)" />
        <stop offset="1" stopColor="rgba(255,226,150,0.1)" />
      </linearGradient>
      <radialGradient id="decor-sun">
        <stop offset="0" stopColor="rgba(255,214,130,0.14)" />
        <stop offset="1" stopColor="rgba(255,214,130,0)" />
      </radialGradient>
      <filter id="decor-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#000" floodOpacity="0.55" />
      </filter>
      <symbol id="decor-maple" viewBox="0 0 24 24">
        <path
          d="M12 2l1.6 4.4 2.8-1.2-.8 4.2 4.8-1.2-1.8 3.4L22 13l-5 2.6.8 2.4-4.8-1-.4 5h-1.2l-.4-5-4.8 1 .8-2.4L2 13l3.4-1.4-1.8-3.4 4.8 1.2-.8-4.2 2.8 1.2z"
          fill="currentColor"
        />
        <path d="M12 23V5M12 15l6-5M12 15l-6-5" {...vein} />
      </symbol>
      <symbol id="decor-oak" viewBox="0 0 24 24">
        <path
          d="M12 2.5c2 .2 1.4 2.4 2.8 2.8 1.4.4 2.8-.6 3.2.8.4 1.4-1.8 1.8-1.2 3 .6 1.2 2.8.6 2.8 2.2s-2.6 1.4-2.4 2.8c.2 1.4 1.6 1.8.6 2.8-1 1-2.6-.2-3.4.8-.6.8-.4 2.6-1.6 3.4h-1.6c-1.2-.8-1-2.6-1.6-3.4-.8-1-2.4.2-3.4-.8s.4-1.4.6-2.8c.2-1.4-2.4-1.2-2.4-2.8s2.2-1 2.8-2.2c.6-1.2-1.6-1.6-1.2-3 .4-1.4 1.8-.4 3.2-.8C10.6 4.9 10 2.7 12 2.5z"
          fill="currentColor"
        />
        <path d="M12 23V5" {...vein} />
      </symbol>
      <symbol id="decor-aspen" viewBox="0 0 24 24">
        <path d="M12 2.5C17.5 6.5 18 14.5 12 20.5 6 14.5 6.5 6.5 12 2.5z" fill="currentColor" />
        <path d="M12 23V5M12 12l3-3M12 15l-3-3" {...vein} />
      </symbol>
      <symbol id="decor-leaflet" viewBox="0 0 24 24">
        <path d="M2 12C7 5 15 5 22 12 15 19 7 19 2 12z" fill="currentColor" />
        <path d="M3 12h17" {...vein} stroke="rgba(20,40,10,0.45)" />
      </symbol>
      <symbol id="decor-blossom" viewBox="0 0 24 24">
        {[0, 72, 144, 216, 288].map((angle) => (
          <ellipse
            key={angle}
            cx="12"
            cy="6.6"
            rx="3.9"
            ry="5"
            fill="currentColor"
            stroke="rgba(120,60,80,0.35)"
            strokeWidth="0.5"
            transform={`rotate(${angle} 12 12)`}
          />
        ))}
        <circle cx="12" cy="12" r="2.6" fill="#f2c14c" />
      </symbol>
      <symbol id="decor-dragonfly" viewBox="0 0 24 24">
        <g fill="rgba(220,240,255,0.6)" stroke="rgba(255,255,255,0.8)" strokeWidth="0.4">
          <ellipse cx="6.5" cy="8.5" rx="5.5" ry="1.7" transform="rotate(-12 6.5 8.5)" />
          <ellipse cx="17.5" cy="8.5" rx="5.5" ry="1.7" transform="rotate(12 17.5 8.5)" />
          <ellipse cx="7" cy="11.5" rx="5" ry="1.5" transform="rotate(14 7 11.5)" />
          <ellipse cx="17" cy="11.5" rx="5" ry="1.5" transform="rotate(-14 17 11.5)" />
        </g>
        <path d="M12 6v16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="12" cy="5" r="1.8" fill="currentColor" />
      </symbol>
      <symbol id="decor-butterfly" viewBox="0 0 24 24">
        <g fill="currentColor" stroke="rgba(40,25,10,0.6)" strokeWidth="0.5">
          <path d="M12 11C9 4 3 3 3 8s4 5 9 3z" />
          <path d="M12 11c3-7 9-8 9-3s-4 5-9 3z" />
          <path d="M12 12c-4 1-7 4-5 7s4-2 5-7z" />
          <path d="M12 12c4 1 7 4 5 7s-4-2-5-7z" />
        </g>
        <path d="M12 7.5v10" stroke="#2b2116" strokeWidth="1.3" strokeLinecap="round" />
      </symbol>
      <symbol id="decor-sparkle" viewBox="0 0 24 24">
        <path d="M12 2l1.4 8.6L22 12l-8.6 1.4L12 22l-1.4-8.6L2 12l8.6-1.4z" fill="currentColor" />
      </symbol>
    </defs>
  )
}

export function SeasonDecor({ season }: { season: SeasonKey }) {
  const svg = useRef<SVGSVGElement>(null)
  const layout = useFrameLayout(svg)
  const pieces = useMemo(
    () => (layout ? decorate(season, layout.frame, layout.panels) : []),
    [season, layout],
  )

  return (
    <svg
      ref={svg}
      className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible"
      aria-hidden="true"
      data-season-decor={season}
    >
      <Defs />
      {pieces.map((piece, index) => (
        <PieceView key={index} piece={piece} />
      ))}
    </svg>
  )
}
