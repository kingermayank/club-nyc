/**
 * Friends inside the games: who's already a friend, Add Friend / Accept buttons on seats and results rows, and the
 * list of online friends to invite. Uses the city's friend list (net/multiplayer.ts, loaded on demand).
 */
import { el } from '../engine/stage'
import { link } from '../net/link'
import { esc } from './store'

type MpModule = typeof import('../net/multiplayer')
let mod: MpModule | null = null
let loading: Promise<MpModule> | null = null
/** the city's friend list, loaded the first time a game screen needs it */
function load(): Promise<MpModule> {
  loading ??= import('../net/multiplayer').then((m) => (mod = m))
  return loading
}
export const friendsReady = () => load()

export type Rel = 'me' | 'friend' | 'requested' | 'incoming' | 'none'
export function relation(id: string): Rel {
  if (id === link.me) return 'me'
  if (!mod) return link.friends.has(id) ? 'friend' : 'none'
  if (mod.mp.friends.has(id)) return 'friend'
  if (mod.mp.outgoing.has(id)) return 'requested'
  if (mod.mp.incoming.has(id)) return 'incoming'
  return 'none'
}
export const isFriend = (id: string) => relation(id) === 'friend'

/** the button for someone in a lobby or on a results screen ('' for yourself and city locals) */
export function friendButton(id: string, name: string, onChange?: () => void, small = true): HTMLElement | null {
  const r = relation(id)
  if (r === 'me' || id.startsWith('local:')) return null
  const cls = small ? 'btn tiny' : 'btn small'
  if (r === 'friend') {
    const b = el('span', 'mp-pill ready', '★ Friends')
    b.title = `You and ${name} are friends`
    return b
  }
  if (r === 'requested') {
    const b = el('button', cls + ' ghost', 'Requested') as HTMLButtonElement
    b.disabled = true
    return b
  }
  const b = el('button', cls + ' go', r === 'incoming' ? 'Accept Friend' : '+ Add Friend') as HTMLButtonElement
  b.onclick = async (e) => {
    e.stopPropagation()
    b.disabled = true
    await load()
    if (relation(id) === 'incoming') await mod!.acceptFriend(id)
    else await mod!.addFriend(id, name)
    onChange?.()
  }
  return b
}

export interface OnlineFriend {
  id: string
  name: string
  look: unknown
  online: boolean
  room: string | null
}
export async function friendList(): Promise<OnlineFriend[]> {
  await load()
  await mod!.refreshFriends().catch(() => {})
  return [...mod!.mp.friends.values()].map((f) => ({ id: f.id, name: f.name, look: f.look, online: f.online, room: f.room })).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
}
/** people in the room you're standing in (real players), for "invite who's here" */
export async function peopleHere(): Promise<{ id: string; name: string }[]> {
  await load()
  return [...mod!.mp.players.values()].filter((a) => a.remote).map((a) => ({ id: a.remote!.id, name: a.name }))
}
export const safe = esc
