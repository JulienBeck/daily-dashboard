export type Slot = 'head' | 'shoulders' | 'chest' | 'gloves' | 'legs' | 'boots' | 'mainHand' | 'offHand'

export type Quality = 'common' | 'uncommon' | 'rare' | 'epic'

export type ItemKind =
  | 'hood'
  | 'helm'
  | 'pads'
  | 'pauldrons'
  | 'tunic'
  | 'mail'
  | 'leather'
  | 'gauntlets'
  | 'trousers'
  | 'greaves'
  | 'boots'
  | 'sabatons'
  | 'sword'
  | 'mace'
  | 'shield'
  | 'dagger'

export interface ItemDef {
  id: string
  name: string
  slot: Slot
  quality: Quality
  kind: ItemKind
  primary: string
  secondary: string
}

export interface OwnedItem {
  id: string
  equipped: boolean
}

export interface EquipmentPayload {
  items: OwnedItem[]
}

export const SLOTS: readonly { slot: Slot; label: string; column: 'left' | 'right' | 'bottom' }[] = [
  { slot: 'head', label: 'Kopf', column: 'left' },
  { slot: 'shoulders', label: 'Schultern', column: 'left' },
  { slot: 'chest', label: 'Brust', column: 'left' },
  { slot: 'gloves', label: 'Hände', column: 'right' },
  { slot: 'legs', label: 'Beine', column: 'right' },
  { slot: 'boots', label: 'Füße', column: 'right' },
  { slot: 'mainHand', label: 'Waffe rechts', column: 'bottom' },
  { slot: 'offHand', label: 'Waffe links', column: 'bottom' },
]

export const QUALITY: Record<Quality, { label: string; colour: string }> = {
  common: { label: 'Gewöhnlich', colour: '#b8b0a0' },
  uncommon: { label: 'Ungewöhnlich', colour: '#4fbf4f' },
  rare: { label: 'Selten', colour: '#3d8fe0' },
  epic: { label: 'Episch', colour: '#a857e0' },
}

export const ITEMS: readonly ItemDef[] = [
  { id: 'wool-hood', name: 'Wollkapuze', slot: 'head', quality: 'common', kind: 'hood', primary: '#6b4f2e', secondary: '#4a3620' },
  { id: 'iron-helm', name: 'Eisenhelm', slot: 'head', quality: 'uncommon', kind: 'helm', primary: '#9aa3ab', secondary: '#c9a24a' },
  { id: 'leather-pads', name: 'Lederschulterstücke', slot: 'shoulders', quality: 'common', kind: 'pads', primary: '#7a5230', secondary: '#c9a46a' },
  { id: 'steel-pauldrons', name: 'Stahlschulterplatten', slot: 'shoulders', quality: 'uncommon', kind: 'pauldrons', primary: '#a7b0b8', secondary: '#8a2a1e' },
  { id: 'linen-tunic', name: 'Leinenwams', slot: 'chest', quality: 'common', kind: 'tunic', primary: '#8c7a55', secondary: '#5a3e24' },
  { id: 'chain-mail', name: 'Kettenhemd', slot: 'chest', quality: 'uncommon', kind: 'mail', primary: '#8f979e', secondary: '#5a3e24' },
  { id: 'leather-gloves', name: 'Lederhandschuhe', slot: 'gloves', quality: 'common', kind: 'leather', primary: '#6e4a2a', secondary: '#c9a46a' },
  { id: 'steel-gauntlets', name: 'Stahlhandschuhe', slot: 'gloves', quality: 'uncommon', kind: 'gauntlets', primary: '#a7b0b8', secondary: '#5f676e' },
  { id: 'wool-trousers', name: 'Wollhose', slot: 'legs', quality: 'common', kind: 'trousers', primary: '#4f4a3c', secondary: '#6b4f2e' },
  { id: 'iron-greaves', name: 'Beinschienen', slot: 'legs', quality: 'uncommon', kind: 'greaves', primary: '#a0a9b1', secondary: '#3e3a30' },
  { id: 'leather-boots', name: 'Lederstiefel', slot: 'boots', quality: 'common', kind: 'boots', primary: '#5a3c22', secondary: '#7a5230' },
  { id: 'iron-sabatons', name: 'Eisenstiefel', slot: 'boots', quality: 'uncommon', kind: 'sabatons', primary: '#9aa3ab', secondary: '#5a3c22' },
  { id: 'short-sword', name: 'Kurzschwert', slot: 'mainHand', quality: 'common', kind: 'sword', primary: '#c3cad0', secondary: '#8a6a34' },
  { id: 'flanged-mace', name: 'Streitkolben', slot: 'mainHand', quality: 'uncommon', kind: 'mace', primary: '#9aa3ab', secondary: '#5a3c22' },
  { id: 'wooden-shield', name: 'Holzschild', slot: 'offHand', quality: 'common', kind: 'shield', primary: '#7a5230', secondary: '#8f979e' },
  { id: 'parrying-dagger', name: 'Parierdolch', slot: 'offHand', quality: 'uncommon', kind: 'dagger', primary: '#c3cad0', secondary: '#c9a24a' },
]

export const STARTER: readonly OwnedItem[] = ITEMS.filter(
  (item) => item.quality === 'common' || item.quality === 'uncommon',
).map((item) => ({ id: item.id, equipped: item.quality === 'common' }))

export const itemById = (id: string): ItemDef | undefined => ITEMS.find((item) => item.id === id)

export const slotLabel = (slot: Slot): string => SLOTS.find((entry) => entry.slot === slot)!.label

export function worn(items: readonly OwnedItem[]): Partial<Record<Slot, ItemDef>> {
  const result: Partial<Record<Slot, ItemDef>> = {}
  for (const owned of items) {
    const item = owned.equipped ? itemById(owned.id) : undefined
    if (item) result[item.slot] = item
  }
  return result
}

export function sameSlot(id: string): string[] {
  const item = itemById(id)
  return item ? ITEMS.filter((entry) => entry.slot === item.slot).map((entry) => entry.id) : []
}
