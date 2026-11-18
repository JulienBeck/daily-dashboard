import { describe, expect, it } from 'vitest'
import { normalise, split, toCopper } from './rewards.js'

describe('normalise', () => {
  it('scales the weights to one', () => {
    expect(normalise([{ share: 3 }, { share: 1 }]).map((entry) => entry.share)).toEqual([0.75, 0.25])
  })

  it('treats negative weights as nothing', () => {
    expect(normalise([{ share: -2 }, { share: 2 }]).map((entry) => entry.share)).toEqual([0, 1])
  })

  it('shares equally when nobody got any weight', () => {
    expect(normalise([{ share: 0 }, { share: 0 }]).map((entry) => entry.share)).toEqual([0.5, 0.5])
  })

  it('keeps the other fields', () => {
    expect(normalise([{ id: 'a', share: 2 }])).toEqual([{ id: 'a', share: 1 }])
  })

  it('has nothing to share without anybody', () => {
    expect(normalise([])).toEqual([])
  })
})

describe('split', () => {
  it('hands out every unit, the biggest remainders first', () => {
    expect(split(10, [1, 1, 1])).toEqual([4, 3, 3])
    expect(split(100, [0.335, 0.335, 0.33])).toEqual([34, 33, 33])
  })

  it('gives the leftover to the larger remainder, not the first in line', () => {
    expect(split(10, [0.24, 0.76])).toEqual([2, 8])
  })

  it('never loses or invents a unit', () => {
    const parts = split(9401, [0.2, 0.3, 0.5, 0.1])
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(9401)
  })

  it('gives everything to a single contributor and nothing to a zero weight', () => {
    expect(split(450, [1])).toEqual([450])
    expect(split(450, [0, 1])).toEqual([0, 450])
  })

  it('hands out whole units only, even for a fractional total', () => {
    expect(split(10.7, [1, 1])).toEqual([5, 5])
    expect(split(-3, [1])).toEqual([0])
  })

  it('splits nothing for nobody', () => {
    expect(split(450, [])).toEqual([])
    expect(split(0, [1, 1])).toEqual([0, 0])
  })
})

describe('toCopper', () => {
  it('counts a purse in copper', () => {
    expect(toCopper({ gold: 1, silver: 2, copper: 3 })).toBe(10203)
  })
})
