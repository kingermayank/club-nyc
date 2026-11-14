/**
 * iFruit's link to the city: threads and messages (the server's online, a local copy for city locals and offline),
 * realtime events (a new message, a payment request, a call), and the unread badges they drive.
 */
import { rest } from '../../net/server'
import { link } from '../../net/link'
import { RESIDENT } from '../../social/residents'
import type { Look } from '../../avatar/look'
import { ifr, store, emit, setBadge, phoneNotify, isOnline } from './store'
import type { DmMessage, DmThread, DmKind } from './wire'
import { tone } from './sound'

/** a thread as the app shows it: a server thread, or a local one with a city local (or Rosa) */
export interface UThread {
  id: string
  kind: 'dm' | 'group' | 'local'
  name: string
  people: { id: string; name: string; look: Look | null; online: boolean; room: string | null; local?: boolean }[]
  last: { text: string; at: number; from: string; kind: DmKind } | null
  unread: number
  at: number
}
export interface UMsg {
  id: string | number
  from: string
  kind: DmKind
  text: string
  meta?: DmMessage['meta']
  at: number
  pending?: boolean
  failed?: boolean
}

export const ROSA = { id: 'rosa', name: 'Rosa', look: { skin: 3, hair: 'bun', hairColor: 5, color: 9, items: { body: 'tee-blue', legs: 'jeans', feet: 'sneakers' } } as unknown as Look }

const preview = (m: { kind: DmKind; text: string; meta?: DmMessage['meta'] }) =>
  m.kind === 'photo' ? '📷 Photo' : m.kind === 'place' ? `📍 ${m.meta?.name ?? 'A place'}` : m.kind === 'pay' ? `Sent $${m.meta?.amount ?? ''}` : m.kind === 'request' ? `Requested $${m.meta?.amount ?? ''}` : m.kind === 'call' ? (m.meta?.missed ? 'Missed call' : 'Call') : m.text

function localThreads(): UThread[] {
  const s = ifr()
  return Object.entries(s.local)
    .filter(([, msgs]) => msgs.length)
    .map(([key, msgs]) => {
      const r = key === 'rosa' ? null : RESIDENT[key]
      const last = msgs[msgs.length - 1]
      const unread = msgs.filter((m) => m.from !== 'me' && m.at > (s.read[key] ?? 0)).length
      return {
        id: `local:${key}`,
        kind: 'local' as const,
        name: r?.name ?? ROSA.name,
        people: [{ id: key, name: r?.name ?? ROSA.name, look: r?.look ?? ROSA.look, online: true, room: null, local: true }],
        last: { text: preview(last as never), at: last.at, from: last.from, kind: last.kind },
        unread,
        at: last.at,
      }
    })
}

let serverThreads: DmThread[] = []
export async function threads(): Promise<{ list: UThread[]; error?: boolean }> {
  let error = false
  if (isOnline()) {
    try {
      serverThreads = (await rest<{ threads: DmThread[] }>('/phone/threads')).threads
    } catch {
      error = true
    }
  }
  const list: UThread[] = [
    ...serverThreads.map((t) => ({
      id: t.id,
      kind: t.kind,
      name: t.kind === 'group' ? t.name || t.people.map((p) => p.name).slice(0, 3).join(', ') : t.people[0]?.name ?? '',
      people: t.people.map((p) => ({ id: p.id, name: p.name, look: p.look as Look | null, online: p.online, room: p.room })),
      last: t.last ? { text: preview(t.last), at: t.last.at, from: t.last.from, kind: t.last.kind } : null,
      unread: t.unread,
      at: t.at,
    })),
    ...localThreads(),
  ].sort((a, b) => b.at - a.at)
  updateBadge(list)
  return { list, error }
}
function updateBadge(list: UThread[]) {
  setBadge('messages', list.reduce((n, t) => n + (t.unread ? 1 : 0), 0))
}
export const refreshBadge = () => void threads().catch(() => {})

export async function messages(threadId: string, before?: number): Promise<UMsg[]> {
  if (threadId.startsWith('local:')) {
    const key = threadId.slice(6)
    return (ifr().local[key] ?? []).map((m, i) => ({ id: `${key}-${i}`, ...m, from: m.from === 'me' ? 'me' : m.from })) as UMsg[]
  }
  const r = await rest<{ messages: DmMessage[] }>(`/phone/threads/${encodeURIComponent(threadId)}${before ? `?before=${before}` : ''}`)
  return r.messages.map((m) => ({ ...m, from: m.from === myId() ? 'me' : m.from }))
}
export const myId = () => link.me

export async function markRead(threadId: string) {
  if (threadId.startsWith('local:')) {
    ifr().read[threadId.slice(6)] = Date.now()
    store()
  } else if (isOnline()) await rest(`/phone/threads/${encodeURIComponent(threadId)}/read`, { method: 'POST' }).catch(() => {})
  const t = serverThreads.find((x) => x.id === threadId)
  if (t) t.unread = 0
  refreshBadge()
}

/** open (or make) the 1:1 thread with a friend; city locals get a local thread */
export async function threadWith(personId: string): Promise<string> {
  if (RESIDENT[personId] || personId === 'rosa') return `local:${personId}`
  const r = await rest<{ thread: DmThread }>('/phone/threads', { json: { members: [personId] } })
  return r.thread.id
}
export async function newGroup(ids: string[], name: string): Promise<string> {
  const r = await rest<{ thread: DmThread }>('/phone/threads', { json: { members: ids, name } })
  return r.thread.id
}

export async function send(threadId: string, kind: 'text' | 'photo' | 'place', text: string, meta?: unknown): Promise<UMsg> {
  if (threadId.startsWith('local:')) {
    const key = threadId.slice(6)
    const m = { at: Date.now(), from: 'me', kind, text, meta: meta as Record<string, unknown> }
    const s = ifr()
    ;(s.local[key] ??= []).push(m)
    s.local[key] = s.local[key].slice(-80)
    s.read[key] = Date.now()
    store()
    localReply(key, kind, text)
    return { id: `${key}-${s.local[key].length - 1}`, ...m }
  }
  const r = await rest<{ message: DmMessage }>(`/phone/threads/${encodeURIComponent(threadId)}`, { json: { kind, text, meta } })
  return { ...r.message, from: 'me' }
}

// ---------- city locals answer (they're NPCs: a line of theirs after a little pause) ----------
const REPLIES = {
  text: ['Haha, classic New York.', 'Say less.', 'I’m around! Come find me.', 'Can’t talk, in line for a bagel.', 'Okay but have you tried the dumplings in Chinatown?', 'Meet you by the hot dog cart?', '🗽', 'Same, honestly.', 'The train is delayed. Again.'],
  photo: ['Great shot!! 📸', 'Okay photographer!', 'Frame it. Hang it in the Met.', 'Wait, I look amazing here.'],
  place: ['On my way! 🚕', 'Save me a spot!', 'Ooh, be there in a sec.'],
}
function localReply(key: string, kind: 'text' | 'photo' | 'place', _text: string) {
  if (key === 'rosa') return rosaReply()
  const r = RESIDENT[key]
  if (!r) return
  const pool = kind === 'text' ? [...REPLIES.text, ...r.lines.slice(0, 4)] : REPLIES[kind]
  const line = pool[Math.floor(Math.random() * pool.length)]
  setTimeout(() => receiveLocal(key, r.name, line), 1400 + Math.random() * 2200)
}
function rosaReply() {
  const lines = ['Elevator’s still out. Stairs build character.', 'You need anything, you text me.', 'Don’t feed the pigeons. They unionized.', 'Proud of you, kid. You’re a real New Yorker now.']
  setTimeout(() => receiveLocal('rosa', 'Rosa', lines[Math.floor(Math.random() * lines.length)]), 1800)
}
/** a city local (or Rosa) texts you */
export function receiveLocal(key: string, name: string, text: string, kind: 'text' | 'sys' = 'text') {
  const s = ifr()
  ;(s.local[key] ??= []).push({ at: Date.now(), from: key, kind, text })
  store()
  emit('threads', { th: `local:${key}` })
  if (!viewing(`local:${key}`)) phoneNotify({ app: 'messages', title: name, text, arg: `local:${key}` })
  else tone('recv')
  refreshBadge()
}

// ---------- which thread is on screen (no banner for it) ----------
let onScreen = ''
export const setViewing = (id: string) => (onScreen = id)
export const viewing = (id: string) => onScreen === id

// ---------- realtime from the server (net/multiplayer.ts forwards these) ----------
export function onDm(m: DmMessage, name: string) {
  const mine = m.from && m.from === myId()
  emit('threads', { th: m.th, m: { ...m, from: mine ? 'me' : m.from } })
  if (mine) return
  if (viewing(m.th)) {
    tone('recv')
    void markRead(m.th)
    return
  }
  if (m.kind !== 'sys') phoneNotify({ app: 'messages', title: name || 'Message', text: preview(m), arg: m.th })
  refreshBadge()
}
export function onPayRequest(id: number, from: string, name: string, amount: number, note: string) {
  phoneNotify({ app: 'bank', title: `${name} requested $${amount}`, text: note || 'Money request', arg: `req:${id}` })
  setBadge('bank', 1)
  emit('bank')
  void from
}
