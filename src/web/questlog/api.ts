import type { PagePayload, Payload, QuestlogInfo } from '../../shared/questlog/types'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

export const getQuestlog = () =>
  fetch(`${base}/api/questlog`, { headers: { accept: 'application/json' } }).then(
    unwrap<QuestlogInfo>,
  )

export const getPage = (id: string) =>
  fetch(`${base}/api/questlog/pages/${encodeURIComponent(id)}`, {
    headers: { accept: 'application/json' },
  }).then(unwrap<Payload<PagePayload>>)

export interface NewQuestInput {
  title: string
  description: string
  points: number | null
  priority: string | null
}

export const createQuest = (id: string, quest: NewQuestInput) =>
  fetch(`${base}/api/questlog/pages/${encodeURIComponent(id)}/quests`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(quest),
  }).then(unwrap<{ key: string; webUrl: string }>)

export const acceptQuest = (id: string, key: string) =>
  fetch(
    `${base}/api/questlog/pages/${encodeURIComponent(id)}/quests/${encodeURIComponent(key)}/accept`,
    { method: 'POST', headers: { accept: 'application/json' } },
  ).then(unwrap<{ key: string; status: string | null; assignee: string }>)

export const completeQuest = (id: string, key: string) =>
  fetch(
    `${base}/api/questlog/pages/${encodeURIComponent(id)}/quests/${encodeURIComponent(key)}/complete`,
    { method: 'POST', headers: { accept: 'application/json' } },
  ).then(unwrap<{ key: string; status: string }>)

export const abandonQuest = (id: string, key: string) =>
  fetch(
    `${base}/api/questlog/pages/${encodeURIComponent(id)}/quests/${encodeURIComponent(key)}/abandon`,
    { method: 'POST', headers: { accept: 'application/json' } },
  ).then(unwrap<{ key: string; status: string }>)
