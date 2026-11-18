import { useEffect, useMemo, useState } from 'react'
import { formatNumber, splitCoins } from '../../shared/questlog/quest.js'
import { normalise, type Person, type RewardDraft, split, toCopper, type Weighted } from '../../shared/rewards.js'
import { distributeReward, getReward, searchUsers } from '../api.js'
import { Purse } from './Profile.js'
import { Window } from './Window.js'

const day = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })

export const SEARCH_DELAY_MS = 250

export function weightsOf(draft: RewardDraft): Weighted[] {
  return draft.shares.map(({ id, name, share }) => ({ id, name, share: Math.round(share * 100) }))
}

export function preview(draft: RewardDraft, rows: readonly Weighted[]) {
  const weights = rows.map((row) => row.share)
  const experience = split(draft.experience, weights)
  const copper = split(toCopper(draft.coins), weights)
  const shares = normalise(rows)
  return rows.map((row, index) => ({
    ...row,
    part: shares[index]!.share,
    experience: experience[index]!,
    coins: splitCoins(copper[index]!),
  }))
}

function status(draft: RewardDraft): string {
  if (draft.distributedAt) {
    const when = day.format(new Date(draft.distributedAt))
    if (draft.distributedBy === 'auto') return `Am ${when} automatisch nach Vorschlag verteilt`
    if (draft.distributedBy === 'legacy') return 'Vor dem Stichtag erledigt, ganz an den Bearbeiter'
    return `Am ${when} von ${draft.giver?.name ?? 'dem Questgeber'} verteilt`
  }
  const due = `Verteilt sich am ${day.format(new Date(draft.dueAt))} von selbst nach Vorschlag`
  return draft.mayDistribute ? due : `${due} · nur ${draft.giver?.name ?? 'der Questgeber'} kann verteilen`
}

export function RewardDialog({
  questKey,
  onClose,
  onDistributed,
}: {
  questKey: string
  onClose: () => void
  onDistributed: () => void
}) {
  const [draft, setDraft] = useState<RewardDraft | null>(null)
  const [rows, setRows] = useState<Weighted[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Person[]>([])

  useEffect(() => {
    let live = true
    getReward(questKey)
      .then((loaded) => {
        if (!live) return
        setDraft(loaded)
        setRows(weightsOf(loaded))
      })
      .catch((reason: unknown) => live && setError(reason instanceof Error ? reason.message : String(reason)))
    return () => {
      live = false
    }
  }, [questKey])

  useEffect(() => {
    if (query.trim().length < 2) {
      setFound([])
      return
    }
    let live = true
    const timer = setTimeout(() => {
      searchUsers(query)
        .then((people) => live && setFound(people))
        .catch(() => live && setFound([]))
    }, SEARCH_DELAY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query])

  const editable = Boolean(draft?.mayDistribute)
  const shown = useMemo(() => {
    if (!draft) return []
    if (draft.distributedAt) {
      return draft.shares.map((share) => ({
        id: share.id,
        name: share.name,
        share: share.share,
        part: share.share,
        experience: share.experience ?? 0,
        coins: share.coins ?? { gold: 0, silver: 0, copper: 0 },
      }))
    }
    return preview(draft, rows)
  }, [draft, rows])

  const setShare = (id: string, share: number) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, share } : row)))
  const remove = (id: string) => setRows((current) => current.filter((row) => row.id !== id))
  const add = (person: Person) => {
    setRows((current) => {
      if (current.some((row) => row.id === person.id)) return current
      const average = current.length > 0 ? current.reduce((sum, row) => sum + row.share, 0) / current.length : 100
      return [...current, { ...person, share: Math.round(average) || 1 }]
    })
    setQuery('')
    setFound([])
  }
  const even = () => setRows((current) => current.map((row) => ({ ...row, share: 50 })))

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await distributeReward(questKey, rows)
      setDraft(result)
      onDistributed()
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Window label="Belohnung" onClose={onClose} className="grid grid-rows-[auto_auto_1fr_auto] gap-4">
      <div>
        <h2 className="m-0 text-[22px] font-semibold">{draft?.title ?? questKey}</h2>
        {draft ? (
          <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-2">
            <a href={draft.webUrl} target="_blank" rel="noreferrer" className="text-ink-2">
              {draft.key}
            </a>
            <span className="num">· {formatNumber(draft.experience)} XP ·</span>
            <Purse coins={draft.coins} />
          </p>
        ) : null}
      </div>

      {draft ? <p className="m-0 text-[12px] text-muted">{status(draft)}</p> : <div />}

      {!draft ? (
        <p className="m-0 text-[12px] text-muted">{error ? '' : 'Belohnung wird geladen …'}</p>
      ) : (
        <div className="scroller grid min-h-0 content-start gap-1.5 pr-1">
          {shown.length === 0 ? (
            <p className="m-0 text-[12px] text-muted">Niemand eingetragen – füge Beteiligte hinzu.</p>
          ) : (
            <ul className="m-0 grid list-none gap-1.5 p-0" aria-label="Beteiligte">
              {shown.map((row) => (
                <li
                  key={row.id}
                  className="parchment grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_3.5rem_auto_auto] items-center gap-x-3 rounded-md border border-white/10 px-3 py-1.5 text-[12px]"
                >
                  <span className="truncate text-[13px] text-ink">{row.name}</span>
                  {editable ? (
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={row.share}
                      onChange={(event) => setShare(row.id, Number(event.target.value))}
                      aria-label={`Anteil ${row.name}`}
                      className="accent-[var(--accent)]"
                    />
                  ) : (
                    <span />
                  )}
                  <span className="num text-right text-ink-2">{Math.round(row.part * 100)} %</span>
                  <span className="flex flex-col items-end gap-0.5 text-[11px] text-ink-2">
                    <span className="num">{formatNumber(row.experience)} XP</span>
                    <Purse coins={row.coins} />
                  </span>
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => remove(row.id)}
                      aria-label={`${row.name} entfernen`}
                      className="cursor-pointer px-1 text-[16px] leading-none text-muted hover:text-critical"
                    >
                      ×
                    </button>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          )}

          {editable ? (
            <div className="relative mt-1">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Beteiligte hinzufügen …"
                aria-label="Beteiligte suchen"
                className="w-full rounded-md border border-rule bg-black/30 px-3 py-1.5 text-[12px] text-ink placeholder:text-muted"
              />
              {found.length > 0 ? (
                <ul className="m-0 mt-1 grid list-none gap-0.5 p-0" aria-label="Gefundene Personen">
                  {found.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => add(person)}
                        className="w-full cursor-pointer rounded px-3 py-1 text-left text-[12px] text-ink-2 hover:bg-white/10"
                      >
                        {person.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-3">
        {error ? <p className="m-0 flex-1 text-[12px] text-serious">{error}</p> : <span className="flex-1" />}
        {editable ? (
          <>
            <button
              type="button"
              onClick={even}
              disabled={rows.length === 0}
              className="metal-button h-9 px-3 text-[12px] text-ink-2 disabled:opacity-50"
            >
              Gleich verteilen
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || rows.length === 0}
              className="metal-button h-9 px-4 text-[13px] font-semibold disabled:opacity-50"
            >
              {saving ? 'Verteile …' : 'Verteilen'}
            </button>
          </>
        ) : null}
      </div>
    </Window>
  )
}
