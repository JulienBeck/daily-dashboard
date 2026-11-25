import { describe, expect, it } from 'vitest'
import { itemById, worn } from '../../../shared/avatar.js'
import { holding, tint, visibleParts } from './wardrobe.js'

describe('visibleParts', () => {
  it('shows the figure in its underwear with hair when nothing is worn', () => {
    expect(visibleParts({})).toEqual(new Set(['body', 'eyes', 'eyebrows', 'eyelashes', 'hair', 'undershirt', 'shorts']))
  })

  it('takes off the undershirt under a chest piece and the shorts under trousers', () => {
    expect(visibleParts({ chest: itemById('chain-mail') })).not.toContain('undershirt')
    expect(visibleParts({ chest: itemById('chain-mail') })).toContain('shorts')
    expect(visibleParts({ legs: itemById('wool-trousers') })).not.toContain('shorts')
    expect(visibleParts({ legs: itemById('wool-trousers') })).toContain('undershirt')
  })

  it('adds every worn item and hides the hair under a head piece', () => {
    const parts = visibleParts(worn([{ id: 'iron-helm', equipped: true }, { id: 'short-sword', equipped: true }]))

    expect(parts).toEqual(
      new Set(['body', 'eyes', 'eyebrows', 'eyelashes', 'undershirt', 'shorts', 'item_iron-helm', 'item_short-sword']),
    )
  })

  it('keeps the hair when only other slots are filled', () => {
    expect(visibleParts({ chest: itemById('linen-tunic') })).toContain('hair')
  })
})

describe('holding', () => {
  it('closes the right hand around the main weapon and the left around the off hand', () => {
    expect(holding({ mainHand: itemById('short-sword') })).toEqual(new Set(['r']))
    expect(holding({ offHand: itemById('wooden-shield') })).toEqual(new Set(['l']))
    expect(holding(worn([{ id: 'flanged-mace', equipped: true }, { id: 'parrying-dagger', equipped: true }]))).toEqual(new Set(['l', 'r']))
  })

  it('leaves both hands open without weapons', () => {
    expect(holding({ gloves: itemById('leather-gloves'), chest: itemById('chain-mail') })).toEqual(new Set())
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
