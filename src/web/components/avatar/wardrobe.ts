import { itemById, type ItemDef, type Slot } from '../../../shared/avatar.js'

export type Worn = Partial<Record<Slot, ItemDef>>

const BARE = ['body', 'eyes', 'eyebrows', 'eyelashes']

export function visibleParts(worn: Worn): Set<string> {
  const parts = new Set(BARE)
  if (!worn.head) parts.add('hair')
  for (const item of Object.values(worn)) {
    if (item) parts.add(`item_${item.id}`)
  }
  return parts
}

export type Hand = 'l' | 'r'

export function holding(worn: Worn): Set<Hand> {
  const hands = new Set<Hand>()
  if (worn.mainHand) hands.add('r')
  if (worn.offHand) hands.add('l')
  return hands
}

export function tint(material: string): string | undefined {
  const match = /^(.+)\.(primary|secondary)$/.exec(material)
  if (!match) return undefined
  const item = itemById(match[1]!)
  return item?.[match[2] as 'primary' | 'secondary']
}
