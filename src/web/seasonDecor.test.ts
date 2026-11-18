import { describe, expect, it } from 'vitest'
import type { SeasonKey } from '../shared/types.js'
import { BLOOM, type Box, decorate, ICICLE, LEAF, type Piece, REACH, random, RIM } from './seasonDecor.js'

const frame: Box = { x: 0, y: 0, w: 1600, h: 900 }
const panels: Box[] = [
  { x: 12, y: 12, w: 1576, h: 110 },
  { x: 12, y: 134, w: 1576, h: 50 },
  { x: 12, y: 196, w: 380, h: 240 },
  { x: 404, y: 196, w: 780, h: 610 },
  { x: 12, y: 818, w: 1576, h: 70 },
]

const ys = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 1)
const ofKind = <K extends Piece['kind']>(pieces: Piece[], kind: K) =>
  pieces.filter((piece): piece is Extract<Piece, { kind: K }> => piece.kind === kind)
const within = (box: Box, x: number, y: number, slack: number) =>
  x >= box.x - slack && x <= box.x + box.w + slack && y >= box.y - slack && y <= box.y + box.h + slack
const onEdge = (box: Box, x: number, y: number, slack: number) =>
  within(box, x, y, slack) &&
  (Math.abs(y - box.y) <= slack ||
    Math.abs(y - box.y - box.h) <= slack ||
    Math.abs(x - box.x) <= slack ||
    Math.abs(x - box.x - box.w) <= slack)

describe('random', () => {
  it('repeats the same sequence for the same seed and another one for another seed', () => {
    const a = random(7)
    const b = random(7)
    const c = random(8)
    const first = [a(), a(), a()]

    expect([b(), b(), b()]).toEqual(first)
    expect([c(), c(), c()]).not.toEqual(first)
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true)
  })
})

describe('decorate', () => {
  it('draws the same frame twice for the same layout, so a re-render does not reshuffle it', () => {
    expect(decorate('autumn', frame, panels)).toEqual(decorate('autumn', frame, panels))
  })

  it('gives every season its own look', () => {
    const looks = (['winter', 'spring', 'summer', 'autumn'] as SeasonKey[]).map((season) =>
      JSON.stringify(decorate(season, frame, panels)),
    )

    expect(new Set(looks).size).toBe(4)
  })

  it('decorates only the frame while no panel is measured', () => {
    const pieces = decorate('autumn', frame, [])

    expect(pieces.length).toBeGreaterThan(0)
    for (const piece of ofKind(pieces, 'sprite')) expect(piece.y).toBeGreaterThan(frame.h - 20)
  })
})

describe('winter', () => {
  const pieces = decorate('winter', frame, panels)

  it('lays a cap of snow on every panel that stays in the gap and the rim', () => {
    const caps = ofKind(pieces, 'snow').slice(1)

    expect(caps).toHaveLength(panels.length)
    caps.forEach((cap, index) => {
      const top = panels[index].y
      const heights = ys(cap.d)
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(top - REACH)
      expect(Math.min(...heights)).toBeLessThan(top - 2)
      expect(Math.max(...heights)).toBeLessThanOrEqual(top + RIM)
    })
  })

  it('hangs icicles below panels, never longer than the gap allows', () => {
    const ice = ofKind(pieces, 'ice')

    expect(ice.length).toBeGreaterThan(0)
    for (const piece of ice) {
      const tips = ys(piece.d)
      const panel = panels.find((box) => Math.abs(box.y + box.h - 1 - Math.min(...tips) - 1.5) < 0.2)
      expect(panel).toBeDefined()
      expect(Math.max(...tips)).toBeLessThanOrEqual(panel!.y + panel!.h - 1 + ICICLE)
    }
  })

  it('leaves the panel on the bottom rim without icicles, the frozen rim takes over there', () => {
    const bottom = panels[panels.length - 1]

    for (const piece of ofKind(pieces, 'ice')) expect(Math.max(...ys(piece.d))).toBeLessThan(bottom.y)
    expect(ofKind(pieces, 'frost')).toEqual([{ kind: 'frost', box: { x: 0, y: frame.h - 40, w: frame.w, h: 40 } }])
    expect(Math.max(...ys(ofKind(pieces, 'snow')[0].d))).toBe(frame.h)
  })
})

describe('autumn', () => {
  const pieces = decorate('autumn', frame, panels)
  const leaves = ofKind(pieces, 'sprite')

  it('drops leaves on every panel, each on an edge or a corner', () => {
    for (const box of panels) {
      expect(leaves.some((leaf) => onEdge(box, leaf.x, leaf.y, 10))).toBe(true)
    }
    for (const leaf of leaves) {
      expect(['maple', 'oak', 'aspen']).toContain(leaf.sprite)
      expect(leaf.size).toBeLessThanOrEqual(LEAF)
    }
  })

  it('does not put the leaves at the same spot on every panel', () => {
    const spots = panels.map((box) => {
      const leaf = leaves.find((l) => onEdge(box, l.x, l.y, 10))!
      return `${Math.round(((leaf.x - box.x) / box.w) * 10)}:${Math.round(((leaf.y - box.y) / box.h) * 10)}`
    })

    expect(new Set(spots).size).toBeGreaterThan(1)
  })
})

describe('spring', () => {
  const pieces = decorate('spring', frame, panels)

  it('lets blossoms and leaves grow along the edges only', () => {
    const sprites = ofKind(pieces, 'sprite')

    expect(sprites.some((s) => s.sprite === 'blossom')).toBe(true)
    for (const s of sprites) {
      expect(['blossom', 'leaflet']).toContain(s.sprite)
      expect(s.size).toBeLessThanOrEqual(BLOOM)
      expect(onEdge(frame, s.x, s.y, 10) || panels.some((box) => onEdge(box, s.x, s.y, 10))).toBe(true)
    }
  })

  it('runs the vines along an edge, not across a panel', () => {
    const stems = ofKind(pieces, 'stem')

    expect(stems.length).toBeGreaterThan(0)
    for (const stem of stems) {
      const heights = ys(stem.d)
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(5)
    }
  })
})

describe('summer', () => {
  const pieces = decorate('summer', frame, panels)

  it('lets the sun shine on the top edge of every panel', () => {
    expect(ofKind(pieces, 'glint').map(({ x, w }) => ({ x, w }))).toEqual(panels.map(({ x, w }) => ({ x, w })))
  })

  it('puts the sun in the upper right corner, where the light comes from', () => {
    expect(ofKind(pieces, 'sun')).toEqual([{ kind: 'sun', x: frame.w, y: 0, r: 960 }])
  })

  it('keeps sparkles and insects on the edges', () => {
    const sprites = ofKind(pieces, 'sprite')

    expect(sprites.some((s) => s.sprite === 'sparkle')).toBe(true)
    for (const s of sprites) {
      expect(['sparkle', 'dragonfly', 'butterfly']).toContain(s.sprite)
      expect(panels.some((box) => onEdge(box, s.x, s.y, 2))).toBe(true)
    }
  })
})
