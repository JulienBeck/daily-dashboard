export type QuestState = 'available' | 'active' | 'complete'

export type Difficulty = 'trivial' | 'easy' | 'standard' | 'difficult' | 'deadly'

export interface Coins {
  gold: number
  silver: number
  copper: number
}

export interface Quest {
  key: string
  title: string
  /** Project key, still shown on the parchment; no longer the grouping. */
  project: string
  projectName: string
  /** The epic this story belongs to — the series it is filed under. */
  seriesKey: string | null
  seriesName: string | null
  level: number | null
  difficulty: Difficulty
  state: QuestState
  points: number | null
  priority: string | null
  issueType: string | null
  /** Jira's own status name, shown on hover over the quest marker. */
  status: string
  assignee: string | null
  /** The reporter — whoever handed this quest out. */
  giver: string | null
  objective: string
  description: string
  labels: string[]
  experience: number
  coins: Coins
  webUrl: string
}

/** A quest series: one epic and the stories filed under it. */
export interface Series {
  /** Epic key, empty for the stories without one. */
  key: string
  /** Null for that bucket — only the interface knows what to call it. */
  name: string | null
  /** The epic in Jira; null for the bucket without one. */
  webUrl: string | null
  /**
   * The epic itself, shaped like a quest so the right-hand sheet can print it
   * unchanged. Null for the bucket without one and whenever Jira did not hand
   * the epic over — the series then still reads, it just cannot be opened.
   */
  epic: Quest | null
  quests: Quest[]
}

export interface PageInfo {
  id: string
  title: string
  /** Set when this page may hand out quests of its own. */
  canCreate: boolean
}

export interface QuestlogInfo {
  pages: PageInfo[]
  refreshSeconds: number
  jiraBaseUrl: string
}

export type RewardState = 'pending' | 'paid'

export interface PagePayload {
  page: PageInfo
  /** The JQL actually sent to Jira — shown in the UI so it can be checked. */
  jql: string
  /** Sprint or filter name, printed on the page header. */
  chapter: string
  series: Series[]
  total: number
  complete: number
  rewards: Record<string, RewardState>
}

export interface Payload<T> {
  data: T
  fetchedAt: string
  stale: boolean
  error: string | null
}

export interface ProfileQuest {
  key: string
  title: string
  difficulty: Difficulty
  experience: number
  coins: Coins
  share: number
  resolved: string | null
  webUrl: string
}

export interface ProfilePayload {
  name: string
  avatar: string | null
  experience: number
  coins: Coins
  completed: number
  pending: { experience: number; coins: Coins; quests: number }
  quests: ProfileQuest[]
}
