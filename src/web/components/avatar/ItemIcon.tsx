import { type ItemDef, ITEMS } from '../../../shared/avatar.js'
import sheet from './assets/icons.png'

const COLUMNS = 4

export function iconPosition(id: string): string | null {
  const index = ITEMS.findIndex((item) => item.id === id)
  if (index < 0) return null
  const percent = (cell: number) => Number(((cell * 100) / (COLUMNS - 1)).toFixed(4))
  return `${percent(index % COLUMNS)}% ${percent(Math.floor(index / COLUMNS))}%`
}

export function ItemIcon({ item, faded = false }: { item?: ItemDef; faded?: boolean }) {
  if (!item) return null
  const position = iconPosition(item.id)
  if (!position) return null
  return (
    <span
      aria-hidden="true"
      data-item={item.id}
      className="block size-full bg-no-repeat"
      style={{
        backgroundImage: `url(${sheet})`,
        backgroundSize: `${COLUMNS * 100}% ${COLUMNS * 100}%`,
        backgroundPosition: position,
        opacity: faded ? 0.18 : undefined,
      }}
    />
  )
}
