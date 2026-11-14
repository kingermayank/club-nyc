/** Shared pieces for iFruit's apps: people (real friends and city locals), headers, sheets, faces. */
import { sfx } from '../../audio'
import { save } from '../../state'
import { el } from '../../engine/stage'
import { headPortrait } from '../../avatar/render'
import type { Look } from '../../avatar/look'
import { RESIDENT, locationOf } from '../../social/residents'
import { rest } from '../../net/server'
import { link } from '../../net/link'
import { isOnline, esc, isFav } from './store'
import { tone } from './sound'
import type { Ctx } from './phone'

export interface Person {
  id: string
  name: string
  look: Look | null
  online: boolean
  room: string | null
  /** a city resident (an NPC), not a real player */
  local?: boolean
  title?: string
  team?: string
  xp?: number
  memberSince?: string
}

/** your friends: real players online (with presence), city locals you befriended offline (or as well) */
export async function people(): Promise<{ friends: Person[]; incoming: Person[]; error?: boolean }> {
  const locals: Person[] = save.friends
    .map((id) => RESIDENT[id])
    .filter(Boolean)
    .map((r) => {
      const room = locationOf(r)
      return { id: r.id, name: r.name, look: r.look, online: !!room, room, local: true, title: r.title, team: r.team }
    })
  if (!isOnline()) return { friends: sortPeople(locals), incoming: localAsks() }
  try {
    const { mp, refreshFriends } = await import('../../net/multiplayer')
    if (!mp.friends.size && !mp.incoming.size) await refreshFriends()
    const real = [...mp.friends.values()].map((f) => ({ id: f.id, name: f.name, look: f.look, online: f.online, room: f.room, title: f.title, team: f.team, xp: f.xp, memberSince: f.memberSince }))
    const incoming = [...mp.incoming.values()].map((f) => ({ id: f.id, name: f.name, look: f.look, online: false, room: null }))
    return { friends: sortPeople([...real, ...locals]), incoming: [...localAsks(), ...incoming] }
  } catch {
    return { friends: sortPeople(locals), incoming: localAsks(), error: true }
  }
}
/** city locals who asked to be friends and are waiting on you (social/friendAsks.ts) */
const localAsks = (): Person[] =>
  Object.entries(save.friendAsks ?? {})
    .filter(([id, a]) => a.from === 'them' && RESIDENT[id])
    .map(([id]) => ({ id, name: RESIDENT[id].name, look: RESIDENT[id].look, online: false, room: null, local: true }))
const sortPeople = (l: Person[]) => l.sort((a, b) => Number(isFav(b.id)) - Number(isFav(a.id)) || Number(b.online) - Number(a.online) || Number(!!a.local) - Number(!!b.local) || a.name.localeCompare(b.name))

// ---------- friends of friends ----------
export type Rel = 'me' | 'friends' | 'requested' | 'incoming' | 'none'
/** someone in another person's friend list, or a suggestion: who they are to you */
export interface Linked extends Person {
  rel: Rel
  /** they're your friend too */
  mutual?: boolean
  /** how many friends you have in common (suggestions) */
  mutualCount?: number
}
export interface FriendsOf {
  count: number
  /** their whole list is shown to them and their friends; everyone else sees the count and the friends you share */
  visible: boolean
  mutual: Linked[]
  mutualCount: number
  friends: Linked[]
}
export const friendsOf = (id: string) => rest<FriendsOf>(`/users/${encodeURIComponent(id)}/friends`)
export const suggested = () => rest<{ people: Linked[] }>('/friends/suggested').then((r) => r.people).catch(() => [] as Linked[])
/** where you stand with someone right now (the city's live lists, so it's current after a click) */
export async function relOf(id: string): Promise<Rel> {
  if (id === myId()) return 'me'
  const { mp } = await import('../../net/multiplayer')
  return mp.friends.has(id) ? 'friends' : mp.outgoing.has(id) ? 'requested' : mp.incoming.has(id) ? 'incoming' : 'none'
}
const myId = () => link.me

export async function personById(id: string): Promise<Person | null> {
  const { friends } = await people()
  const f = friends.find((p) => p.id === id)
  if (f) return f
  if (RESIDENT[id]) {
    const r = RESIDENT[id]
    return { id, name: r.name, look: r.look, online: !!locationOf(r), room: locationOf(r), local: true }
  }
  if (!isOnline()) return null
  try {
    const u = await rest<{ user: Person }>(`/users/${encodeURIComponent(id)}`)
    return { ...u.user, online: false, room: null }
  } catch {
    return null
  }
}

// ---------- markup ----------
export const face = (look: Look | null, online = false, cls = '') =>
  `<span class="ifr-face-wrap"><span class="ifr-face ${cls}">${look ? headPortrait(look) : ''}</span>${online ? '<i class="ifr-dot"></i>' : ''}</span>`

const BACK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13 3 L6 10 L13 17" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/** a screen with a header: back (when `back`), the title, an optional action on the right */
export function screenEl(ctx: Ctx, title: string, o: { back?: boolean; right?: HTMLElement | null; big?: boolean; cls?: string } = {}) {
  const s = el('div', 'ifr-s ' + (o.cls ?? ''))
  const head = el('div', 'ifr-head' + (o.big ? ' big' : ''))
  // always a way back: the arrow alone (Back inside an app, Home on an app's first screen)
  const atRoot = o.back === false
  const b = el('button', 'ifr-back', BACK)
  b.title = atRoot ? 'Home' : 'Back'
  b.type = 'button'
  b.setAttribute('aria-label', atRoot ? 'Home screen' : 'Back')
  b.onclick = () => {
    tone('tap')
    if (atRoot) ctx.home()
    else ctx.pop()
  }
  head.append(b)
  const h = el('h3', '', esc(title))
  if (o.right) head.append(el('i', 'ifr-head-gap'), o.right)
  if (o.big) {
    head.classList.add('two')
    head.append(h)
  } else head.insertBefore(h, head.children[1] ?? null)
  const body = el('div', 'ifr-body')
  s.append(head, body)
  return { el: s, head, body, title: h }
}

export function act(label: string, f: () => void, cls = '') {
  const b = el('button', 'ifr-act ' + cls, label)
  b.type = 'button'
  b.onclick = (e) => {
    e.stopPropagation()
    tone('tap')
    f()
  }
  return b
}

/** a bottom sheet over the whole display; returns its body and a closer */
export function sheet(ctx: Ctx, html = '', onClose?: () => void) {
  const scrim = el('div', 'ifr-scrim')
  const s = el('div', 'ifr-sheet', html)
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    s.classList.add('out')
    scrim.style.opacity = '0'
    setTimeout(() => (s.remove(), scrim.remove()), 220)
    onClose?.()
  }
  scrim.onclick = close
  ctx.display.append(scrim, s)
  setTimeout(() => s.querySelector<HTMLElement>('[autofocus], input, button')?.focus({ preventScroll: true }), 60)
  return { el: s, close, isOpen: () => !closed }
}

export function shimmer(n = 4) {
  return Array.from({ length: n }, () => '<div class="ifr-shimmer"></div>').join('')
}
export function empty(icon: string, title: string, text: string, action?: HTMLElement) {
  const e = el('div', 'ifr-empty', `${icon ? `<img src="${icon}" alt="">` : ''}<b>${title}</b><span>${text}</span>`)
  if (action) e.append(action)
  return e
}
export const click = () => sfx.click()
export { esc }
