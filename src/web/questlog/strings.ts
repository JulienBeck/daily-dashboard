import { createContext, useContext } from 'react'
import type { Filter } from '../../shared/questlog/quest'
import type { QuestState } from '../../shared/questlog/types'

export type Lang = 'de' | 'en'

export interface Strings {
  lang: Lang
  /** Drives toLocaleString for the experience figure. */
  locale: string

  title: string
  close: string
  pages: string

  filters: Record<Filter, string>
  counter: (done: number, total: number) => string
  showMap: string
  openJira: string

  loading: string
  pageFailed: (reason: string) => string
  pageEmpty: string
  stale: (reason: string) => string

  noSeries: string
  foldSeriesIn: (name: string) => string
  foldSeriesOut: (name: string) => string
  openSeries: (name: string) => string
  questTitle: (key: string, status: string) => string
  marker: Record<QuestState, string>

  issueType: string
  priority: string
  status: string
  hero: string
  unclaimed: string
  description: string
  questGiver: string
  unknownGiver: string
  reward: string
  series: string
  purse: string
  experience: string
  storyPoints: (points: number) => string
  pickAQuest: string
  coins: { gold: string; silver: string; copper: string }

  accept: string
  accepting: string
  acceptHint: string
  complete: string
  completing: string
  completeHint: string
  create: string
  createHint: string
  createForbidden: string

  taken: (key: string, who: string, status: string | null) => string
  handedIn: (key: string, status: string) => string
  created: (key: string) => string

  formTitle: (page: string) => string
  fieldTitle: string
  fieldBrief: string
  fieldPoints: string
  fieldPriority: string
  submit: string
  submitting: string
  cancel: string
}

export const de: Strings = {
  lang: 'de',
  locale: 'de-DE',

  title: 'Questlog',
  close: 'Questlog schließen',
  pages: 'Seiten',

  filters: { all: 'Alle', available: 'Offen', active: 'In Arbeit', complete: 'Erledigt' },
  counter: (done, total) => `Quests: ${done}/${total}`,
  showMap: 'Karte zeigen',
  openJira: 'Jira öffnen',

  loading: 'Das Buch wird aufgeschlagen …',
  pageFailed: (reason) => `Diese Seite blieb leer: ${reason}`,
  pageEmpty: 'Auf dieser Seite steht nichts.',
  stale: (reason) => `Stand ist älter: ${reason}`,

  noSeries: 'Ohne Questreihe',
  foldSeriesIn: (name) => `${name} zuklappen`,
  foldSeriesOut: (name) => `${name} aufklappen`,
  openSeries: (name) => `Questreihe „${name}“ aufschlagen`,
  questTitle: (key, status) => `${key} — ${status}`,
  marker: { available: 'Anzunehmen', active: 'Angenommen', complete: 'Abzugeben' },

  issueType: 'Art',
  priority: 'Priorität',
  status: 'Status',
  hero: 'Held',
  unclaimed: 'noch frei',
  description: 'Beschreibung',
  questGiver: 'Questgeber',
  unknownGiver: 'Unbekannter Auftraggeber',
  reward: 'Belohnung',
  series: 'Questreihe',
  purse: 'Münzen',
  experience: 'Erfahrung',
  storyPoints: (points) => `${points} Story ${points === 1 ? 'Point' : 'Points'}`,
  pickAQuest: 'Wähle links eine Quest, um ihren Auftrag zu lesen.',
  coins: { gold: 'Gold', silver: 'Silber', copper: 'Kupfer' },

  accept: 'Quest annehmen',
  accepting: 'Wird übernommen …',
  acceptHint: 'Die Quest übernehmen und in Arbeit setzen',
  complete: 'Quest abgeben',
  completing: 'Wird abgegeben …',
  completeHint: 'Die Quest abgeben und den Vorgang auf erledigt ziehen',
  create: 'Quest erstellen',
  createHint: 'Eine eigene Quest erstellen',
  createForbidden: 'Auf dieser Seite werden keine Quests erstellt',

  taken: (key, who, status) => `${key} übernimmt ${who}${status ? `, Status ${status}` : ''}`,
  handedIn: (key, status) => `${key} ist abgegeben, Status ${status}`,
  created: (key) => `${key} ist vergeben — du bist der Questgeber`,

  formTitle: (page) => `Neue Quest auf der Seite „${page}“`,
  fieldTitle: 'Titel',
  fieldBrief: 'Auftrag',
  fieldPoints: 'Story Points',
  fieldPriority: 'Priorität',
  submit: 'Aushändigen',
  submitting: 'Wird ausgehändigt …',
  cancel: 'Abbrechen',
}

export const en: Strings = {
  lang: 'en',
  locale: 'en-GB',

  title: 'Questlog',
  close: 'Close questlog',
  pages: 'Pages',

  filters: { all: 'All', available: 'Open', active: 'In progress', complete: 'Done' },
  counter: (done, total) => `Quests: ${done}/${total}`,
  showMap: 'Show Map',
  openJira: 'Open Jira',

  loading: 'Opening the book …',
  pageFailed: (reason) => `This page stayed empty: ${reason}`,
  pageEmpty: 'Nothing is written on this page.',
  stale: (reason) => `Showing an older state: ${reason}`,

  noSeries: 'No quest series',
  foldSeriesIn: (name) => `Collapse ${name}`,
  foldSeriesOut: (name) => `Expand ${name}`,
  openSeries: (name) => `Open the “${name}” quest series`,
  questTitle: (key, status) => `${key} — ${status}`,
  marker: { available: 'Available', active: 'Accepted', complete: 'Ready to hand in' },

  issueType: 'Type',
  priority: 'Priority',
  status: 'Status',
  hero: 'Hero',
  unclaimed: 'unclaimed',
  description: 'Description',
  questGiver: 'Quest giver',
  unknownGiver: 'Unknown quest giver',
  reward: 'Rewards',
  series: 'Quest series',
  purse: 'Coins',
  experience: 'Experience',
  storyPoints: (points) => `${points} story ${points === 1 ? 'point' : 'points'}`,
  pickAQuest: 'Pick a quest on the left to read its orders.',
  coins: { gold: 'Gold', silver: 'Silver', copper: 'Copper' },

  accept: 'Accept quest',
  accepting: 'Accepting …',
  acceptHint: 'Take the quest and move it into progress',
  complete: 'Complete quest',
  completing: 'Handing in …',
  completeHint: 'Hand the quest in and move it to done',
  create: 'Create quest',
  createHint: 'Hand out a quest of your own',
  createForbidden: 'This page hands out no quests',

  taken: (key, who, status) => `${who} took ${key}${status ? `, status ${status}` : ''}`,
  handedIn: (key, status) => `${key} is handed in, status ${status}`,
  created: (key) => `${key} is handed out — you are its quest giver`,

  formTitle: (page) => `New quest on the “${page}” page`,
  fieldTitle: 'Title',
  fieldBrief: 'Orders',
  fieldPoints: 'Story points',
  fieldPriority: 'Priority',
  submit: 'Hand out',
  submitting: 'Handing out …',
  cancel: 'Cancel',
}

const BY_LANG: Record<Lang, Strings> = { de, en }

export function isLang(value: unknown): value is Lang {
  return value === 'de' || value === 'en'
}

/**
 * The address wins, otherwise the browser decides. Anything that is not German
 * lands on English: the book is shared across teams and a visitor should not
 * have to know a URL trick to read it. Pinning one instance to a language is a
 * bookmark with ?lang=, not a setting - the choice belongs to the reader.
 */
export function pickLang(search: string, browser: string | undefined): Lang {
  const asked = new URLSearchParams(search).get('lang')
  if (isLang(asked)) return asked
  return (browser ?? '').toLowerCase().startsWith('de') ? 'de' : 'en'
}

export function stringsFor(lang: Lang): Strings {
  return BY_LANG[lang]
}

/** German by default, so a component rendered without a provider still reads. */
export const StringsContext = createContext<Strings>(de)

export const useStrings = () => useContext(StringsContext)
