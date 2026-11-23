import type { ItemDef } from '../../../shared/avatar.js'
import { iconUrl } from './urls.js'

export function ItemIcon({ item, faded = false }: { item?: ItemDef; faded?: boolean }) {
  if (!item) return null
  return (
    <img
      alt=""
      aria-hidden="true"
      data-item={item.id}
      src={iconUrl(item.id)}
      draggable={false}
      className="block size-full object-contain"
      style={{ opacity: faded ? 0.18 : undefined }}
      onError={(event) => (event.currentTarget.style.visibility = 'hidden')}
    />
  )
}
