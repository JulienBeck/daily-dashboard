import { describe, expect, it } from 'vitest'
import { itemById, worn } from '../../../shared/avatar.js'
import { tint, visibleParts } from './wardrobe.js'

describe('visibleParts', () => {
  it('shows the bare figure with hair when nothing is worn', () => {
    expect(visibleParts({})).toEqual(new Set(['body', 'eyes', 'eyebrows', 'eyelashes', 'hair']))
  })

  it('adds every worn item and hides the hair under a head piece', () => {
    const parts = visibleParts(worn([{ id: 'iron-helm', equipped: true }, { id: 'short-sword', equipped: true }]))

    expect(parts).toEqual(new Set(['body', 'eyes', 'eyebrows', 'eyelashes', 'item_iron-helm', 'item_short-sword']))
  })

  it('keeps the hair when only other slots are filled', () => {
    expect(visibleParts({ chest: itemById('linen-tunic') })).toContain('hair')
  })
})

describe('tint', () => {
  it('takes the colours of the item a material belongs to', () => {
    expect(tint('wool-hood.primary')).toBe('#6b4f2e')
    expect(tint('wool-hood.secondary')).toBe('#4a3620')
  })

  it('leaves fixed and unknown materials alone', () => {
    expect(tint('short-sword.c9a24a')).toBeUndefined()
    expect(tint('Human.body')).toBeUndefined()
    expect(tint('ghost-item.primary')).toBeUndefined()
    expect(tint('wool-hood.name')).toBeUndefined()
  })
})
