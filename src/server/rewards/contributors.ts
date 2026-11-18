import type { Person, Weighted } from '../../shared/rewards.js'

export interface JiraUserRef {
  accountId?: string
  key?: string
  name?: string
  displayName?: string
}

export type ChangelogItem = Record<string, unknown>

export interface ChangelogHistory {
  created: string
  items?: ChangelogItem[]
}

export interface AssigneeChange {
  at: string
  from: Person | null
  to: Person | null
}

export function personOf(user: JiraUserRef | null | undefined): Person | null {
  const id = user?.accountId ?? user?.key ?? user?.name
  if (!id) return null
  return { id, name: user?.displayName ?? user?.name ?? id }
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : null)

const side = (id: unknown, name: unknown): Person | null => {
  const key = text(id)
  return key ? { id: key, name: text(name) ?? key } : null
}

export function assigneeChanges(histories: readonly ChangelogHistory[]): AssigneeChange[] {
  return histories
    .flatMap((history) =>
      (history.items ?? [])
        .filter((item) => (item['fieldId'] ?? item['field']) === 'assignee')
        .map((item) => ({
          at: history.created,
          from: side(item['from'], item['fromString']),
          to: side(item['to'], item['toString']),
        })),
    )
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

export function contributors(
  created: string,
  resolved: string,
  current: Person | null,
  changes: readonly AssigneeChange[],
): Weighted[] {
  const start = Date.parse(created)
  const end = Math.max(start, Date.parse(resolved))
  const relevant = changes.filter((change) => Date.parse(change.at) <= end)
  const time = new Map<string, Weighted>()
  const add = (person: Person | null, from: number, to: number) => {
    if (!person) return
    const entry = time.get(person.id) ?? { ...person, share: 0 }
    entry.share += Math.max(0, to - from)
    time.set(person.id, entry)
  }

  let holder = changes.length > 0 ? changes[0]!.from : current
  let since = start
  for (const change of relevant) {
    const at = Math.min(end, Math.max(start, Date.parse(change.at)))
    add(holder, since, at)
    holder = change.to
    since = at
  }
  add(holder, since, end)

  const entries = [...time.values()].filter((entry) => entry.share > 0)
  const total = entries.reduce((sum, entry) => sum + entry.share, 0)
  if (total === 0) {
    const last = holder ?? current
    return last ? [{ ...last, share: 1 }] : []
  }
  return entries
    .map((entry) => ({ ...entry, share: entry.share / total }))
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name, 'de'))
}
