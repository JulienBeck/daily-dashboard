import { describe, expect, it } from 'vitest'
import { ITEMS, itemById, sameSlot, SLOTS, slotLabel, STARTER, worn } from './avatar.js'

describe('catalogue', () => {
  it('has every slot covered, with unique ids', () => {
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length)
    for (const { slot } of SLOTS) expect(ITEMS.some((item) => item.slot === slot)).toBe(true)
  })

  it('lays the slots out three left, three right and both weapons below', () => {
    expect(SLOTS.filter((entry) => entry.column === 'left').map((entry) => entry.slot)).toEqual(['head', 'shoulders', 'chest'])
    expect(SLOTS.filter((entry) => entry.column === 'right').map((entry) => entry.slot)).toEqual(['gloves', 'legs', 'boots'])
    expect(SLOTS.filter((entry) => entry.column === 'bottom').map((entry) => entry.slot)).toEqual(['mainHand', 'offHand'])
  })

  it('names slots and finds items by id', () => {
    expect(slotLabel('offHand')).toBe('Waffe links')
    expect(itemById('iron-helm')?.name).toBe('Eisenhelm')
    expect(itemById('nope')).toBeUndefined()
  })
})

describe('STARTER', () => {
  it('dresses a new player in the common set and packs the rest', () => {
    const equipped = STARTER.filter((item) => item.equipped).map((item) => itemById(item.id)!)
    const packed = STARTER.filter((item) => !item.equipped).map((item) => itemById(item.id)!)

    expect(equipped.map((item) => item.quality)).toEqual(SLOTS.map(() => 'common'))
    expect(new Set(equipped.map((item) => item.slot)).size).toBe(SLOTS.length)
    expect(packed.length).toBeGreaterThan(0)
    expect(packed.every((item) => item.quality === 'uncommon')).toBe(true)
  })
})

describe('worn', () => {
  it('maps the equipped items to their slots and ignores the rest', () => {
    expect(worn([
      { id: 'iron-helm', equipped: true },
      { id: 'wool-hood', equipped: false },
      { id: 'nope', equipped: true },
    ])).toEqual({ head: itemById('iron-helm') })
  })
})

describe('sameSlot', () => {
  it('lists every item that competes for the same slot', () => {
    expect(sameSlot('wool-hood').sort()).toEqual(['iron-helm', 'wool-hood'])
    expect(sameSlot('nope')).toEqual([])
  })
})
