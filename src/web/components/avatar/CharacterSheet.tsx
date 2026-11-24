import { useEffect, useState } from 'react'
import {
  type Body,
  BODIES,
  type ItemDef,
  itemById,
  ITEMS,
  type OwnedItem,
  QUALITY,
  type Slot,
  SLOTS,
  slotLabel,
  worn,
} from '../../../shared/avatar.js'
import { getEquipment, setBody, setEquipped } from '../../api.js'
import { ItemIcon } from './ItemIcon.js'
import { Stage } from './Stage.js'

function SlotButton({
  slot,
  item,
  selected,
  onSelect,
}: {
  slot: Slot
  item?: ItemDef
  selected: boolean
  onSelect: () => void
}) {
  const label = `${slotLabel(slot)}: ${item?.name ?? 'leer'}`
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className="metal-button size-[54px] p-0.5 aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-accent"
      style={item ? { boxShadow: `inset 0 0 0 2px ${QUALITY[item.quality].colour}, 0 2px 4px rgba(0,0,0,0.8)` } : undefined}
    >
      <ItemIcon item={item ?? ghost(slot)} faded={!item} />
    </button>
  )
}

const ghost = (slot: Slot) => ITEMS.find((item) => item.slot === slot)

export function CharacterSheet({ name }: { name: string }) {
  const [items, setItems] = useState<OwnedItem[] | null>(null)
  const [body, setBodyState] = useState<Body>('male')
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    getEquipment()
      .then((payload) => {
        if (!live) return
        setItems(payload.items)
        setBodyState(payload.body)
      })
      .catch((reason: unknown) => live && setError(reason instanceof Error ? reason.message : String(reason)))
    return () => {
      live = false
    }
  }, [])

  const wearing = worn(items ?? [])
  const choices = selected
    ? (items ?? [])
        .map((owned) => ({ owned, item: itemById(owned.id) }))
        .filter((entry): entry is { owned: OwnedItem; item: ItemDef } => entry.item?.slot === selected)
    : []

  const save = async (request: () => Promise<{ body: Body; items: OwnedItem[] }>) => {
    setBusy(true)
    setError(null)
    try {
      const payload = await request()
      setItems(payload.items)
      setBodyState(payload.body)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  const change = (id: string, equipped: boolean) => save(() => setEquipped(id, equipped))

  const column = (side: 'left' | 'right' | 'bottom') =>
    SLOTS.filter((entry) => entry.column === side).map(({ slot }) => (
      <SlotButton
        key={slot}
        slot={slot}
        item={wearing[slot]}
        selected={selected === slot}
        onSelect={() => setSelected((current) => (current === slot ? null : slot))}
      />
    ))

  return (
    <section aria-label="Ausrüstung" className="scroller grid min-h-0 content-start gap-3 pr-1">
      <div role="radiogroup" aria-label="Körperbau" className="flex justify-center gap-2">
        {BODIES.map((entry) => (
          <button
            key={entry.body}
            type="button"
            role="radio"
            aria-checked={body === entry.body}
            disabled={busy || !items}
            onClick={() => body !== entry.body && void save(() => setBody(entry.body))}
            className="metal-button h-7 px-3 text-[12px] disabled:opacity-50 aria-checked:outline-2 aria-checked:outline-offset-1 aria-checked:outline-accent"
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[auto_minmax(0,240px)_auto] items-center justify-center gap-2">
        <div className="grid gap-2.5">{column('left')}</div>
        <div className="h-[340px] min-w-0">
          <Stage body={body} worn={wearing} title={`Spielfigur von ${name}`} />
        </div>
        <div className="grid gap-2.5">{column('right')}</div>
      </div>
      <div className="flex justify-center gap-2.5">{column('bottom')}</div>

      {error ? <p className="m-0 text-[12px] text-serious">Ausrüstung: {error}</p> : null}
      {!items && !error ? <p className="m-0 text-[12px] text-muted">Ausrüstung wird geladen …</p> : null}

      {selected && items ? (
        <div role="region" aria-label={slotLabel(selected)} className="grid gap-1.5">
          <div className="panel-head m-0">{slotLabel(selected)}</div>
          {choices.length === 0 ? (
            <p className="m-0 text-[12px] text-muted">Nichts für diesen Platz im Gepäck.</p>
          ) : (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {choices.map(({ owned, item }) => (
                <li
                  key={item.id}
                  className="parchment grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 rounded-md border border-white/10 px-2 py-1"
                >
                  <span className="size-9">
                    <ItemIcon item={item} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px]" style={{ color: 'var(--ink)' }}>
                      {item.name}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-ink-2">
                      <span
                        aria-hidden="true"
                        className="inline-block size-2 rounded-full border border-black/40"
                        style={{ background: QUALITY[item.quality].colour }}
                      />
                      {QUALITY[item.quality].label}
                      {owned.equipped ? ' · angelegt' : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void change(item.id, !owned.equipped)}
                    className="metal-button h-8 px-3 text-[12px] disabled:opacity-50"
                  >
                    {owned.equipped ? 'Ablegen' : 'Anlegen'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}
