import type { SeasonKey } from '../shared/types.js'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type Sprite =
  | 'maple'
  | 'oak'
  | 'aspen'
  | 'blossom'
  | 'leaflet'
  | 'dragonfly'
  | 'butterfly'
  | 'sparkle'

export type Piece =
  | { kind: 'snow'; d: string }
  | { kind: 'ice'; d: string }
  | { kind: 'stem'; d: string }
  | { kind: 'frost'; box: Box }
  | { kind: 'glint'; x: number; y: number; w: number }
  | { kind: 'sun'; x: number; y: number; r: number }
  | { kind: 'sprite'; sprite: Sprite; x: number; y: number; size: number; rotate: number; colour: string }

export const REACH = 11
export const RIM = 8
export const ICICLE = 15
export const LEAF = 34
export const BLOOM = 17

type Rand = () => number

const SEED: Record<SeasonKey, number> = { winter: 11, spring: 23, summer: 37, autumn: 53 }

export function random(seed: number): Rand {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (r: Rand, lo: number, hi: number) => lo + r() * (hi - lo)
const pick = <T>(r: Rand, list: readonly T[]): T => list[Math.floor(r() * list.length)]
const f = (n: number) => Number(n.toFixed(1))

const AUTUMN = ['#c2410c', '#b45309', '#9a3412', '#a16207', '#7c2d12', '#d97706']
const BLOSSOM = ['#f7d6e0', '#ffffff', '#f3b7c9', '#fff2a8', '#d9c8f5']
const GREEN = ['#6aa84f', '#88b04b', '#4e8a3a']
const WINGS = ['#f4a62a', '#4aa3df', '#e8e2d0']

function sprite(sprite: Sprite, x: number, y: number, size: number, rotate: number, colour: string): Piece {
  return { kind: 'sprite', sprite, x: f(x), y: f(y), size: f(size), rotate: f(rotate), colour }
}

function snowCap({ x, y, w }: Box, r: Rand): Piece {
  const phase = between(r, 0, 6.3)
  const driftLeft = between(r, 2, 7)
  const driftRight = between(r, 2, 7)
  const mounds = Array.from({ length: Math.max(2, Math.round(w / 45)) }, () => ({
    at: x + between(r, 0, 1) * w,
    rise: between(r, 1, 4),
    width: between(r, 6, 20),
  }))
  const drips = Array.from({ length: Math.max(1, Math.round(w / 70)) }, () => x + between(r, 0.05, 0.95) * w)
  const height = (px: number) => {
    const t = px - x
    const wave = 0.8 * Math.sin(t / 17 + phase)
    const lumps = mounds.reduce((sum, m) => sum + m.rise * Math.exp(-(((px - m.at) / m.width) ** 2)), 0)
    const drift = driftLeft * Math.exp(-t / 35) + driftRight * Math.exp(-(w - t) / 35)
    return Math.min(REACH, Math.max(2.5, 4.5 + wave + lumps + drift))
  }
  const sag = (px: number) =>
    3.5 + Math.min(RIM - 3.5, drips.reduce((sum, at) => sum + 4 * Math.exp(-(((px - at) / 3.5) ** 2)), 0))
  const step = Math.max(3, w / 160)
  const xs: number[] = []
  for (let px = x; px < x + w; px += step) xs.push(px)
  xs.push(x + w)
  const top = xs.map((px) => `L${f(px)} ${f(y - height(px))}`).join('')
  const bottom = [...xs]
    .reverse()
    .map((px) => `L${f(px)} ${f(y + sag(px))}`)
    .join('')
  return { kind: 'snow', d: `M${f(x - 1.5)} ${f(y + 2)}${top}L${f(x + w + 1.5)} ${f(y + 2)}${bottom}Z` }
}

function icicles({ x, y, w, h }: Box, r: Rand): Piece[] {
  const base = y + h - 1
  return Array.from({ length: w > 260 ? 2 : 1 }, () => {
    const span = Math.min(w * 0.8, between(r, 50, 130))
    const start = x + between(r, 0.05, 0.95) * (w - span)
    let d = `M${f(start)} ${f(base - 1.5)}L${f(start + span)} ${f(base - 1.5)}Q${f(start + span)} ${f(base + 2.5)} ${f(start + span - 4)} ${f(base + 2)}L${f(start + 4)} ${f(base + 2)}Q${f(start)} ${f(base + 2.5)} ${f(start)} ${f(base - 1.5)}Z`
    for (let at = start + 4; at < start + span - 4; at += between(r, 5, 11)) {
      const centre = 1 - Math.abs((at - start) / span - 0.5) * 2
      const length = Math.min(ICICLE, 3 + between(r, 0.25, 1) * (4 + centre * 10))
      const half = between(r, 1.5, 3.2)
      d += `M${f(at - half)} ${f(base)}Q${f(at - half / 2)} ${f(base + length * 0.55)} ${f(at)} ${f(base + length)}Q${f(at + half / 2)} ${f(base + length * 0.55)} ${f(at + half)} ${f(base)}Z`
    }
    return { kind: 'ice', d } as Piece
  })
}

function snowPile({ w, h }: Box, r: Rand): Piece {
  const phase = between(r, 0, 6.3)
  const xs: number[] = []
  for (let px = 0; px < w; px += 6) xs.push(px)
  xs.push(w)
  const top = xs
    .map((px) => `L${f(px)} ${f(h - Math.max(2, 6 + 2.5 * Math.sin(px / 31 + phase) + 1.5 * Math.sin(px / 11)))}`)
    .join('')
  return { kind: 'snow', d: `M0 ${f(h)}${top}L${f(w)} ${f(h)}Z` }
}

function cornerOrEdge(box: Box, r: Rand): [number, number] {
  const { x, y, w, h } = box
  if (r() < 0.6) return pick(r, [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as [number, number][])
  return [x + between(r, 0.12, 0.88) * w, r() < 0.7 ? y : y + h]
}

function leaves(box: Box, r: Rand): Piece[] {
  const count = pick(r, [1, 2, 2, 3, 3])
  const pieces: Piece[] = []
  for (let i = 0; i < count; i++) {
    const [px, py] = cornerOrEdge(box, r)
    const kind = pick(r, ['maple', 'oak', 'aspen'] as const)
    const extra = pick(r, [0, 1, 2, 2])
    for (let j = 0; j < extra; j++) {
      pieces.push(sprite(pick(r, ['maple', 'oak', 'aspen'] as const), px + between(r, -9, 9), py + between(r, -4, 4), between(r, 18, 26), between(r, 0, 360), pick(r, AUTUMN)))
    }
    pieces.push(sprite(kind, px, py, between(r, 26, LEAF), between(r, 0, 360), pick(r, AUTUMN)))
  }
  return pieces
}

function vine(box: Box, r: Rand): Piece[] {
  const { x, y, w, h } = box
  const fromLeft = r() < 0.5
  const edge = r() < 0.75 ? y : y + h
  const length = Math.min(w * 0.6, between(r, 70, 160))
  const sign = fromLeft ? 1 : -1
  const start = fromLeft ? x : x + w
  const along = (t: number): [number, number] => [start + sign * t * length, edge + 2.4 * Math.sin(t * 11)]
  const steps = Array.from({ length: 25 }, (_, i) => along(i / 24))
  const pieces: Piece[] = [
    { kind: 'stem', d: `M${steps.map(([px, py]) => `${f(px)} ${f(py)}`).join('L')}` },
  ]
  for (let t = 0.06; t < 1; t += between(r, 0.07, 0.12)) {
    const [px, py] = along(t)
    const side = pieces.length % 2 ? -1 : 1
    pieces.push(sprite('leaflet', px, py + side * 4, between(r, 10, 14), side * between(r, 20, 50) + (fromLeft ? 0 : 180), pick(r, GREEN)))
  }
  const blossoms = Math.floor(between(r, 3, 7))
  for (let i = 0; i < blossoms; i++) {
    const [px, py] = along(between(r, 0, 1))
    pieces.push(sprite('blossom', px, py, between(r, 11, BLOOM), between(r, 0, 72), pick(r, BLOSSOM)))
  }
  return pieces
}

function springDecor(box: Box, r: Rand): Piece[] {
  if (r() < 0.7) return vine(box, r)
  const [px, py] = cornerOrEdge(box, r)
  return [
    sprite('leaflet', px + 5, py + 3, between(r, 11, 14), between(r, 0, 360), pick(r, GREEN)),
    sprite('leaflet', px - 5, py + 2, between(r, 10, 13), between(r, 0, 360), pick(r, GREEN)),
    sprite('blossom', px, py, between(r, 13, BLOOM), between(r, 0, 72), pick(r, BLOSSOM)),
  ]
}

function summerDecor(box: Box, r: Rand): Piece[] {
  const { x, y, w, h } = box
  const pieces: Piece[] = []
  pieces.push({ kind: 'glint', x: f(x), y: f(y + 1), w: f(w) })
  const sparkles = r() < 0.4 ? 2 : 1
  for (let i = 0; i < sparkles; i++) {
    const at = x + between(r, 0.08, 0.92) * w
    pieces.push(sprite('sparkle', at, y + 1, between(r, 14, 22), between(r, 0, 30), '#fff6d8'))
  }
  if (r() < 0.25) pieces.push(sprite('sparkle', r() < 0.5 ? x : x + w, r() < 0.5 ? y : y + h, between(r, 12, 18), 0, '#fff6d8'))
  if (r() < 0.45) {
    const insect = pick(r, ['dragonfly', 'butterfly'] as const)
    const onTop = r() < 0.7
    pieces.push(
      sprite(insect, x + between(r, 0.1, 0.9) * w, onTop ? y : y + h, between(r, 22, 28), between(r, -20, 20) + (onTop ? 0 : 180), insect === 'dragonfly' ? '#3fa7a0' : pick(r, WINGS)),
    )
  }
  return pieces
}

function framePieces(season: SeasonKey, frame: Box, r: Rand): Piece[] {
  const { w, h } = frame
  if (season === 'winter') {
    return [{ kind: 'frost', box: { x: 0, y: f(h - 40), w: f(w), h: 40 } }, snowPile(frame, r)]
  }
  if (season === 'summer') return [{ kind: 'sun', x: f(w), y: 0, r: f(Math.max(w, h) * 0.6) }]
  const count = Math.max(4, Math.round(w / 180))
  const pieces: Piece[] = []
  for (let i = 0; i < count; i++) {
    const px = between(r, 0.03, 0.97) * w
    if (season === 'autumn') {
      pieces.push(sprite(pick(r, ['maple', 'oak', 'aspen'] as const), px, h - 4, between(r, 20, 28), between(r, 0, 360), pick(r, AUTUMN)))
    } else {
      pieces.push(sprite('leaflet', px - 6, h - 4, between(r, 10, 13), between(r, -70, -30), pick(r, GREEN)))
      pieces.push(sprite('leaflet', px + 6, h - 4, between(r, 10, 13), between(r, -150, -110), pick(r, GREEN)))
      pieces.push(sprite('blossom', px, h - 6, between(r, 11, 14), between(r, 0, 72), pick(r, BLOSSOM)))
    }
  }
  return pieces
}

export function decorate(season: SeasonKey, frame: Box, panels: readonly Box[]): Piece[] {
  const pieces = framePieces(season, frame, random(SEED[season]))
  panels.forEach((box, index) => {
    const r = random(SEED[season] * 1000 + index + 1)
    if (season === 'winter') {
      pieces.push(snowCap(box, r))
      if (frame.h - (box.y + box.h) > 20 && r() < 0.7) pieces.push(...icicles(box, r))
    } else if (season === 'autumn') {
      pieces.push(...leaves(box, r))
    } else if (season === 'spring') {
      pieces.push(...springDecor(box, r))
    } else {
      pieces.push(...summerDecor(box, r))
    }
  })
  return pieces
}
