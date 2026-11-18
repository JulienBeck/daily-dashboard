import { COPPER_PER_SILVER, SILVER_PER_GOLD } from './questlog/quest.js'
import type { Coins, Difficulty } from './questlog/types.js'

export interface Person {
  id: string
  name: string
}

export interface Weighted extends Person {
  share: number
}

export interface RewardDraft {
  key: string
  title: string
  webUrl: string
  difficulty: Difficulty
  experience: number
  coins: Coins
  giver: Person | null
  completedAt: string
  dueAt: string
  distributedAt: string | null
  distributedBy: string | null
  shares: (Weighted & { experience: number | null; coins: Coins | null })[]
  mayDistribute: boolean
}

export type InboxMessage =
  | {
      id: number
      kind: 'distribute'
      createdAt: string
      read: boolean
      done: boolean
      quest: { key: string; title: string; dueAt: string }
    }
  | {
      id: number
      kind: 'reward'
      createdAt: string
      read: boolean
      done: boolean
      quest: { key: string; title: string; dueAt: string }
      experience: number
      coins: Coins
      by: string | null
    }

export interface InboxPayload {
  me: Person
  messages: InboxMessage[]
}

export function normalise<T extends { share: number }>(entries: readonly T[]): T[] {
  const positive = entries.map((entry) => ({ ...entry, share: Math.max(0, entry.share) }))
  const total = positive.reduce((sum, entry) => sum + entry.share, 0)
  if (positive.length === 0) return []
  if (total <= 0) return positive.map((entry) => ({ ...entry, share: 1 / positive.length }))
  return positive.map((entry) => ({ ...entry, share: entry.share / total }))
}

export function split(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return []
  const shares = normalise(weights.map((share) => ({ share }))).map((entry) => entry.share)
  const whole = Math.max(0, Math.floor(total))
  const exact = shares.map((share) => share * whole)
  const parts = exact.map(Math.floor)
  let left = whole - parts.reduce((sum, part) => sum + part, 0)
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index)
  for (const { index } of order) {
    if (left <= 0) break
    parts[index]! += 1
    left -= 1
  }
  return parts
}

export const toCopper = ({ gold, silver, copper }: Coins) =>
  (gold * SILVER_PER_GOLD + silver) * COPPER_PER_SILVER + copper
