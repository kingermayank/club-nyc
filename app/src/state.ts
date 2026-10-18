import type { Look } from './avatar/look'
import { STARTER_ITEMS } from './avatar/items'

const profile = new URLSearchParams(location.search).get('profile')
/** ?profile=name keeps a separate save slot (handy for testing without touching your real save) */
const KEY = 'club-nyc:v2' + (profile ? ':' + profile : '')

export interface PlacedFurniture {
  id: string
  x: number
  y: number
  flip?: boolean
}

export interface SaveState {
  created: boolean
  name: string
  look: Look
  owned: string[]
  coins: number
  stamps: string[]
  visited: string[]
  room: string
  muted: boolean
  /** furniture placed in your apartment */
  furniture: PlacedFurniture[]
  /** furniture bought but not placed */
  storage: string[]
  stats: Record<string, number>
  /** the New York day of your last daily refill (YYYY-MM-DD) */
  lastDaily: string
  /** days you've dropped by this week (the daily refill grows with it; never a punishing streak) */
  week: { start: string; days: number }
  /** the first-day tour with Rosa: '' not yet, 'offered' (returning players were offered it), 'done', 'skipped' */
  tour: string
  seenNews: number
  // ---- social ----
  /** neighborhood team id ('' until chosen) */
  team: string
  /** a stamp id shown under your name tag */
  title: string
  friends: string[]
  /** how well you know each resident (waves, dances, visits…) */
  affinity: Record<string, number>
  guestbook: { from: string; text: string; at: number; read?: boolean }[]
  likes: number
  openHouse: boolean
  lastHome: number
  /** residents' guestbooks you signed / apartments you liked (id -> time) */
  signed: Record<string, number>
  liked: Record<string, number>
  challenges: { id: string; game: string; target: number; due: number; done?: boolean; theirs?: number }[]
  notifyOff: boolean
  /** New-in-Town quests claimed (id -> time) */
  quests: Record<string, number>
  memberSince: string
  /** the account this local copy belongs to (online play) */
  owner?: string
  /** homes you own (see data/homes.ts) and the one you live in now */
  homes: string[]
  home: string
  /** furniture placed in your OTHER homes (the current home's is `furniture`) */
  homeFurniture: Record<string, PlacedFurniture[]>
  /** today's three city challenges (see social/quests.ts) */
  daily: { day: string; picks: string[]; base: Record<string, number>; places: string[]; done: string[]; bonus: boolean }
  /** postcard inbox (features/mail.ts) */
  mail?: import('./features/mail').Postcard[]
}

export const freshSave = (): SaveState => ({
  created: false,
  name: '',
  look: { skin: 1, hair: 'short', hairColor: 1, items: { body: 'tee-blue', legs: 'jeans', feet: 'sneakers' } },
  owned: [...STARTER_ITEMS],
  coins: 50,
  stamps: [],
  visited: [],
  room: 'times-square',
  muted: false,
  furniture: [],
  storage: [],
  stats: {},
  lastDaily: '',
  week: { start: '', days: 0 },
  tour: '',
  seenNews: 0,
  team: '',
  title: '',
  friends: [],
  affinity: {},
  guestbook: [],
  likes: 0,
  openHouse: false,
  lastHome: 0,
  signed: {},
  liked: {},
  challenges: [],
  notifyOff: false,
  quests: {},
  memberSince: new Date().toISOString().slice(0, 10),
  homes: ['walkup'],
  home: 'walkup',
  homeFurniture: {},
  daily: { day: '', picks: [], base: {}, places: [], done: [], bonus: false },
})

function load(): SaveState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = { ...freshSave(), ...JSON.parse(raw) } as SaveState
      for (const id of STARTER_ITEMS) if (!s.owned.includes(id)) s.owned.push(id)
      return s
    }
  } catch {
    /* storage unavailable — play without saving */
  }
  return freshSave()
}

export const save: SaveState = load()

/** Called after every save (online play uploads to the cloud, debounced). */
export const persistHooks: (() => void)[] = []

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    /* ignore */
  }
  for (const f of persistHooks) f()
}

/** Replace the whole save in place (e.g. with your cloud save after signing in). */
export function adoptSave(data: Partial<SaveState>, owner: string) {
  const next = { ...freshSave(), ...data, owner } as SaveState
  for (const id of STARTER_ITEMS) if (!next.owned.includes(id)) next.owned.push(id)
  for (const k of Object.keys(save) as (keyof SaveState)[]) delete save[k]
  Object.assign(save, next)
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    /* ignore */
  }
}

export function resetSave() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  location.reload()
}

export function bump(stat: string, by = 1) {
  save.stats[stat] = (save.stats[stat] ?? 0) + by
  persist()
}

export function best(stat: string, value: number) {
  if (value > (save.stats[stat] ?? 0)) {
    save.stats[stat] = value
    persist()
    return true
  }
  return false
}
