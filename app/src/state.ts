import type { Look } from './avatar/look'
import { NEVER_OWNED, STARTER_ITEMS } from './avatar/items'

const profile = new URLSearchParams(location.search).get('profile')
/** ?profile=name keeps a separate save slot (handy for testing without touching your real save) */
const KEY = 'club-nyc:v2' + (profile ? ':' + profile : '')

export interface PlacedFurniture {
  id: string
  x: number
  y: number
  flip?: boolean
  /** a lamp or the neon sign, switched off (they come lit) */
  off?: boolean
  /** the TV, switched on */
  on?: boolean
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
  /** master volume 0..1 (mute is separate); default sits below the old full-blast mix */
  volume: number
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
  /** friend requests with city locals still waiting for an answer: sent by you, or asked by them */
  friendAsks: Record<string, { at: number; from: 'me' | 'them' }>
  /** locals you've invited over who said yes: they come by the next time you're home */
  guestsComing: string[]
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
  /** the New in Town / Today in the City card is tucked away to just its title bar */
  questsHidden?: boolean
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
  /** total XP (data/levels.ts turns it into a level and title); online it mirrors the server's */
  xp?: number
  /** offline XP bookkeeping (social/levels.ts): things that pay once, and today's counts */
  xpLog?: { refs: string[]; day: string; counts: Record<string, number>; today: number }
  /** fridge magnets from the Brooklyn Bridge souvenir stand (data/souvenirs.ts), shown on your apartment fridge */
  magnets?: string[]
  /** where you've put each magnet on the fridge door, as a share of the door's width and height (features/fridge.ts) */
  magnetAt?: Record<string, [number, number]>
  /** love locks while playing offline (online the server keeps them, features/moments/lovelocks.ts): locks and keys in
   * your pocket and the locks you've hung on the Brooklyn Bridge railing */
  /** the iFruit phone (features/ifruit/store.ts fills in defaults, so older saves load untouched) */
  ifruit?: import('./features/ifruit/store').IFruitSave
  loveLocks?: { locks: number; keys: number; hung: { x: number; y: number; body: number; shape: string; initials: string; paint: string | null; at: number; kept: boolean }[] }
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
  volume: 0.7,
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
  friendAsks: {},
  guestsComing: [],
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

/** the Vault's archive pairs were never anyone's: off the owned list, and off your feet */
function shelve(s: SaveState) {
  s.owned = s.owned.filter((id) => !NEVER_OWNED.includes(id))
  if (s.look?.items?.feet && NEVER_OWNED.includes(s.look.items.feet)) s.look = { ...s.look, items: { ...s.look.items, feet: 'sneakers' } }
}

function load(): SaveState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = { ...freshSave(), ...JSON.parse(raw) } as SaveState
      for (const id of STARTER_ITEMS) if (!s.owned.includes(id)) s.owned.push(id)
      if (typeof s.volume !== 'number' || Number.isNaN(s.volume)) s.volume = 0.7
      s.volume = Math.max(0, Math.min(1, s.volume))
      shelve(s)
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
  shelve(next)
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
