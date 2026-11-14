/**
 * iFruit state: the phone's part of your save (optional, so older saves load untouched), its notifications and badges,
 * the photo library (IndexedDB: photos are too big for the save) and the offline bank ledger.
 */
import { save, persist } from '../../state'
import { link } from '../../net/link'
import type { PhotoRecipe } from './wire'

export interface IFruitSave {
  unboxed: number
  wallpaper: string
  favorites: string[]
  calls: { id: string; who: string; name: string; dir: 'in' | 'out'; missed: boolean; at: number; secs: number }[]
  ledger: { delta: number; reason: string; at: number; balance: number }[]
  holdings: Record<string, { shares: number; cost: number }>
  trades: { day: string; n: number }
  local: Record<string, { at: number; from: string; kind: 'text' | 'photo' | 'place' | 'sys'; text: string; meta?: Record<string, unknown> }[]>
  read: Record<string, number>
  notes: Note[]
  /** a local seed for the offline market */
  seed: string
}
export interface Note {
  id: string
  app: AppId
  title: string
  text: string
  at: number
  read?: boolean
  /** a friend request (the panel shows Accept / Decline on it while it's still waiting) */
  kind?: 'fr'
  /** what opening it does: an app and an argument (a thread id, a friend id…) */
  arg?: string
}
export type AppId = 'contacts' | 'messages' | 'phone' | 'camera' | 'photos' | 'bank' | 'stocks' | 'map' | 'settings'

const fresh = (): IFruitSave => ({
  unboxed: 0,
  wallpaper: 'skyline',
  favorites: [],
  calls: [],
  ledger: [],
  holdings: {},
  trades: { day: '', n: 0 },
  local: {},
  read: {},
  notes: [],
  seed: Math.random().toString(36).slice(2),
})

/** the phone's save, filled in with defaults (migration-safe: new fields appear on old saves) */
export function ifr(): IFruitSave {
  const cur = save.ifruit as Partial<IFruitSave> | undefined
  if (!cur || typeof cur !== 'object') save.ifruit = fresh()
  else {
    const f = fresh()
    for (const k of Object.keys(f) as (keyof IFruitSave)[]) if (cur[k] === undefined) (cur as Record<string, unknown>)[k] = f[k]
  }
  return save.ifruit!
}
export const store = () => {
  persist()
}

export const isOnline = () => link.account && !!save.owner

// ---------- a tiny event bus ----------
type Ev = 'notes' | 'badges' | 'threads' | 'bank' | 'friends' | 'photos' | 'wallpaper' | 'call'
const subs = new Map<Ev, Set<(arg?: unknown) => void>>()
export function on(ev: Ev, f: (arg?: unknown) => void) {
  if (!subs.has(ev)) subs.set(ev, new Set())
  subs.get(ev)!.add(f)
  return () => subs.get(ev)!.delete(f)
}
export const emit = (ev: Ev, arg?: unknown) => subs.get(ev)?.forEach((f) => f(arg))

// ---------- badges ----------
export const badges: Record<string, number> = { messages: 0, phone: 0, bank: 0 }
export function setBadge(app: string, n: number) {
  if (badges[app] === n) return
  badges[app] = n
  emit('badges')
}
export const totalBadge = () => Object.values(badges).reduce((a, b) => a + b, 0)
/** Contacts' badge: friend requests waiting on you, real players' (from the server) plus city locals' (in the save) */
let realAsks = 0
export function syncRequestBadge(real?: number) {
  if (real !== undefined) realAsks = real
  const locals = Object.values(save.friendAsks ?? {}).filter((a) => a.from === 'them').length
  setBadge('contacts', realAsks + locals)
}

// ---------- notifications ----------
/** the phone shell shows a banner when it's open; otherwise the shell decides (badge, or a notice for calls) */
let presenter: ((n: Note) => void) | null = null
export const onNotePresent = (f: (n: Note) => void) => (presenter = f)

export function phoneNotify(n: Omit<Note, 'id' | 'at'>) {
  const s = ifr()
  const note: Note = { ...n, id: Math.random().toString(36).slice(2, 9), at: Date.now() }
  s.notes.unshift(note)
  s.notes = s.notes.slice(0, 30)
  store()
  emit('notes')
  presenter?.(note)
  return note
}
export function readNotes(app?: AppId, arg?: string) {
  const s = ifr()
  let changed = false
  for (const n of s.notes) if (!n.read && (!app || (n.app === app && (!arg || n.arg === arg)))) ((n.read = true), (changed = true))
  if (changed) {
    store()
    emit('notes')
  }
}

/** the panel's Clear: everything goes */
export function clearNotes() {
  const s = ifr()
  if (!s.notes.length) return
  s.notes = []
  store()
  emit('notes')
}

// ---------- offline bank ledger (online the server's ledger is the record) ----------
export function recordLocal(delta: number, reason: string) {
  if (isOnline() || !delta) return
  const s = ifr()
  s.ledger.unshift({ delta, reason, at: Date.now(), balance: save.coins })
  s.ledger = s.ledger.slice(0, 120)
  store()
  emit('bank')
}

// ---------- photos (IndexedDB) ----------
export interface Photo {
  id: string
  at: number
  room: string
  title: string
  /** a JPEG data URL */
  jpeg: string
  recipe?: PhotoRecipe
  /** a selfie from a landmark, or a photo a friend sent */
  kind?: 'camera' | 'selfie' | 'received'
  from?: string
}
const DB = 'club-nyc-ifruit' + (new URLSearchParams(location.search).get('profile') ? ':' + new URLSearchParams(location.search).get('profile') : '')
let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('photos', { keyPath: 'id' })
      r.result.createObjectStore('kv')
    }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => no(r.error)
  })
  return dbp
}
const req = <T>(r: IDBRequest<T>) => new Promise<T>((ok, no) => ((r.onsuccess = () => ok(r.result)), (r.onerror = () => no(r.error))))
export const MAX_PHOTOS = 120

export async function allPhotos(): Promise<Photo[]> {
  try {
    const d = await db()
    const list = await req(d.transaction('photos').objectStore('photos').getAll() as IDBRequest<Photo[]>)
    return list.sort((a, b) => b.at - a.at)
  } catch {
    return []
  }
}
export async function addPhoto(p: Omit<Photo, 'id' | 'at'> & { at?: number }): Promise<Photo> {
  const photo: Photo = { id: Math.random().toString(36).slice(2, 10), at: Date.now(), ...p }
  try {
    const d = await db()
    const all = await allPhotos()
    const t = d.transaction('photos', 'readwrite')
    // a full library lets go of the oldest
    for (const old of all.slice(MAX_PHOTOS - 1)) t.objectStore('photos').delete(old.id)
    t.objectStore('photos').put(photo)
    await new Promise((ok) => (t.oncomplete = ok))
  } catch {
    /* storage unavailable: the photo lives until the page closes */
  }
  emit('photos', photo)
  return photo
}
export async function deletePhoto(id: string) {
  try {
    const d = await db()
    await req(d.transaction('photos', 'readwrite').objectStore('photos').delete(id))
  } catch {
    /* ignore */
  }
  emit('photos')
}
export async function kvGet<T>(k: string): Promise<T | undefined> {
  try {
    return (await req((await db()).transaction('kv').objectStore('kv').get(k))) as T | undefined
  } catch {
    return undefined
  }
}
export async function kvSet(k: string, v: unknown) {
  try {
    await req((await db()).transaction('kv', 'readwrite').objectStore('kv').put(v, k))
  } catch {
    /* ignore */
  }
}

// ---------- favourites ----------
export const isFav = (id: string) => ifr().favorites.includes(id)
export function toggleFav(id: string) {
  const s = ifr()
  s.favorites = isFav(id) ? s.favorites.filter((f) => f !== id) : [id, ...s.favorites].slice(0, 12)
  store()
  emit('friends')
}

// ---------- time ----------
export const nycTime = (t = Date.now()) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(t).replace(/\s?[AP]M$/, '')
export const nycDate = (t = Date.now()) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' }).format(t)
export function ago(t: number) {
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 7 * 86400) return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(t)
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).format(t)
}
export const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
