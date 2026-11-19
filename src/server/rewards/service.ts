import { type Body, type EquipmentPayload, isBody, itemById, sameSlot, STARTER } from '../../shared/avatar.js'
import type { PagePayload, ProfilePayload, Quest, RewardState } from '../../shared/questlog/types.js'
import type { InboxPayload, Person, RewardDraft, Weighted } from '../../shared/rewards.js'
import type { Db } from '../db.js'
import type { JiraConfig } from '../questlog/config.js'
import type { JiraCredentials, JiraDeps } from '../questlog/jira.js'
import { bodyOf, inventory, outfit, setBody, setEquipped } from './equipment.js'
import { fetchMe, fetchQuestRecord, type Me, searchUsers } from './jira.js'
import {
  distribute,
  distributeDue,
  draft,
  inbox,
  markRead,
  profile,
  recordQuest,
  rewardStates,
  withdraw,
} from './store.js'

export const ME_SECONDS = 600
export const SYNC_SECONDS = 60
export const FALLBACK_DUE_DAYS = 14
const DAY = 86_400_000

export interface SprintWindow {
  start: string | null
  end: string | null
}

export interface RewardsSetup {
  db: Db
  jira: JiraConfig
  credentials: JiraCredentials
  deps: JiraDeps & { now: () => Date }
  sprint: () => Promise<SprintWindow | null>
}

export function questKeys(page: PagePayload): string[] {
  return page.series.flatMap((series) => series.quests.map((quest) => quest.key))
}

export function questOn(page: PagePayload, key: string): Quest | null {
  for (const series of page.series) {
    const found = series.quests.find((quest) => quest.key === key)
    if (found) return found
  }
  return null
}

export function dueDate(sprint: SprintWindow | null, now: Date): Date {
  const end = sprint?.end ? new Date(sprint.end) : null
  return end && end.getTime() > now.getTime() ? end : new Date(now.getTime() + FALLBACK_DUE_DAYS * DAY)
}

export function createRewards(setup: RewardsSetup) {
  const { db, jira, credentials, deps } = setup
  let me: { value: Me; at: number } | null = null
  let lastSync = 0
  let running: Promise<void> | null = null

  async function currentUser(): Promise<Me> {
    const now = deps.now().getTime()
    if (!me || now - me.at > ME_SECONDS * 1000) {
      me = { value: await fetchMe(jira, credentials, deps), at: now }
    }
    return me.value
  }

  async function sync(): Promise<void> {
    await distributeDue(db, deps.now())
  }

  function syncSoon(force = false): Promise<void> {
    if (running) return running
    if (!force && deps.now().getTime() - lastSync < SYNC_SECONDS * 1000) return Promise.resolve()
    running = sync()
      .then(() => {
        lastSync = deps.now().getTime()
      })
      .finally(() => {
        running = null
      })
    return running
  }

  async function dressed(playerId: string): Promise<EquipmentPayload> {
    return { body: await bodyOf(db, playerId), items: await inventory(db, playerId) }
  }

  async function stateOf(key: string): Promise<RewardState | undefined> {
    return (await rewardStates(db, [key]))[key]
  }

  return {
    sync: syncSoon,

    async stamp(page: PagePayload): Promise<PagePayload> {
      return { ...page, rewards: await rewardStates(db, questKeys(page)) }
    },

    async assertHandable(key: string): Promise<void> {
      const state = await stateOf(key)
      if (state === 'paid') throw new Error(`${key} ist schon abgegeben und belohnt`)
      if (state === 'pending') throw new Error(`${key} ist schon abgegeben, die Belohnung verteilt der Questgeber`)
    },

    async assertAbandonable(key: string): Promise<void> {
      if ((await stateOf(key)) === 'paid') throw new Error(`${key} ist schon belohnt und lässt sich nicht mehr abbrechen`)
    },

    async handIn(quest: Quest): Promise<void> {
      const now = deps.now()
      const sprint = await setup.sprint().catch(() => null)
      await recordQuest(db, await fetchQuestRecord(jira, credentials, deps, quest, dueDate(sprint, now), now))
    },

    withdraw(key: string): Promise<boolean> {
      return withdraw(db, key)
    },

    async profile(): Promise<ProfilePayload> {
      const user = await currentUser()
      await syncSoon()
      return profile(db, user, user.avatar)
    },

    async inbox(): Promise<InboxPayload> {
      const user = await currentUser()
      await syncSoon()
      return { me: { id: user.id, name: user.name }, messages: await inbox(db, user) }
    },

    async draft(key: string): Promise<RewardDraft> {
      const found = await draft(db, key, await currentUser())
      if (!found) throw new Error(`Keine Belohnung zu ${key} hinterlegt`)
      return found
    },

    async distribute(key: string, shares: readonly Weighted[]): Promise<RewardDraft> {
      const user = await currentUser()
      const found = await draft(db, key, user)
      if (!found) throw new Error(`Keine Belohnung zu ${key} hinterlegt`)
      if (!found.mayDistribute) {
        throw new Error(
          found.distributedAt ? `${key} ist bereits verteilt` : `Nur ${found.giver?.name ?? 'der Questgeber'} verteilt ${key}`,
        )
      }
      if (shares.length === 0) throw new Error('Niemand zum Verteilen angegeben')
      await distribute(db, key, shares, user.id, deps.now())
      return (await draft(db, key, user))!
    },

    async markRead(ids: readonly number[]): Promise<void> {
      await markRead(db, await currentUser(), ids, deps.now())
    },

    async equipment(): Promise<EquipmentPayload> {
      const user = await currentUser()
      await outfit(db, user, STARTER, deps.now())
      return dressed(user.id)
    },

    async chooseBody(body: Body): Promise<EquipmentPayload> {
      const user = await currentUser()
      await outfit(db, user, STARTER, deps.now())
      await setBody(db, user.id, body)
      return dressed(user.id)
    },

    async equip(itemId: string, equipped: boolean): Promise<EquipmentPayload> {
      if (!itemById(itemId)) throw new Error(`Unbekannter Gegenstand: ${itemId}`)
      const user = await currentUser()
      await outfit(db, user, STARTER, deps.now())
      await setEquipped(db, user.id, itemId, sameSlot(itemId), equipped)
      return dressed(user.id)
    },

    users(query: string): Promise<Person[]> {
      return searchUsers(jira, credentials, deps, query)
    },
  }
}

export type Rewards = ReturnType<typeof createRewards>

export function parseShares(raw: unknown): Weighted[] {
  if (!Array.isArray(raw)) throw new Error('Verteilung: Liste der Beteiligten fehlt')
  return raw.map((entry: unknown) => {
    const { id, name, share } = (entry ?? {}) as Record<string, unknown>
    if (typeof id !== 'string' || !id.trim()) throw new Error('Verteilung: Beteiligter ohne Kennung')
    if (typeof share !== 'number' || !Number.isFinite(share) || share < 0) {
      throw new Error(`Verteilung: ungültiger Anteil für ${id}`)
    }
    return { id, name: typeof name === 'string' && name.trim() ? name : id, share }
  })
}

export function parseIds(raw: unknown): number[] {
  return Array.isArray(raw) ? raw.filter((id): id is number => Number.isInteger(id)) : []
}

export function parseEquip(raw: unknown): { item: string; equipped: boolean } {
  const { item, equipped } = (raw ?? {}) as Record<string, unknown>
  if (typeof item !== 'string' || !item) throw new Error('Ausrüstung: Gegenstand fehlt')
  if (typeof equipped !== 'boolean') throw new Error('Ausrüstung: anlegen oder ablegen?')
  return { item, equipped }
}

export function parseBody(raw: unknown): Body {
  const { body } = (raw ?? {}) as Record<string, unknown>
  if (!isBody(body)) throw new Error('Körperbau: Mann oder Frau?')
  return body
}
