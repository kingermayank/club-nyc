/**
 * Phone → Text a Friend: send a friend who's online a preset text ("Meet me here!", "Hi!", "Want to play a game?").
 * They get it as a notice with a button that brings them to you. Presets only: no free text to moderate, and the
 * server only delivers between friends, at most one text every few seconds per friend.
 */
import { sfx } from '../audio'
import { el } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton, toast } from '../engine/ui'
import { headPortrait } from '../avatar/render'
import { ROOMS } from '../data/rooms'
import { isHomeRoom } from '../data/homes'
import { link } from '../net/link'
import { rest, type PublicUser, type Presence } from '../net/server'
import type { TextKind } from '../net/protocol'
import './textFriend.css'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const where = (room: string | null) => (!room ? '' : isHomeRoom(room) ? 'at home' : `in ${ROOMS[room]?.name ?? room}`)

export const TEXTS: Record<TextKind, { label: string; icon: string }> = {
  meet: { label: 'Meet Me Here', icon: '📍' },
  hi: { label: 'Say Hi', icon: '👋' },
  game: { label: 'Play a Game?', icon: '🎮' },
}

export async function openTextFriend() {
  sfx.pop()
  const p = el('div', 'panel text-friend', '<h2>Text a Friend</h2><p>Pick a message. They get a button to come find you.</p>')
  const list = el('div', 'tf-list', '<div class="tf-empty">Looking for your friends…</div>')
  p.append(list, closeButton())
  openOverlay(p)
  if (!link.account) {
    list.innerHTML = '<div class="tf-empty">Texting friends works when you’re playing online.</div>'
    return
  }
  let friends: (PublicUser & Presence)[] = []
  try {
    friends = (await rest<{ friends: (PublicUser & Presence)[] }>('/friends')).friends
  } catch {
    list.innerHTML = '<div class="tf-empty">Can’t reach your friends right now. Try again in a moment.</div>'
    return
  }
  if (!p.isConnected) return
  if (!friends.length) {
    list.innerHTML = '<div class="tf-empty"><b>No Friends Yet</b><span>Click anyone in the city and hit Add Friend, or bring someone you know.</span></div>'
    const inv = el('button', 'btn small go', '💌 Invite Friends')
    inv.onclick = () => {
      sfx.click()
      closeOverlay()
      void import('./invite').then((m) => m.openInvite())
    }
    list.querySelector('.tf-empty')!.append(inv)
    return
  }
  friends.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
  list.innerHTML = ''
  for (const f of friends) {
    const row = el('div', 'tf-row' + (f.online ? ' on' : ''))
    row.innerHTML = `<span class="tf-face">${f.look ? headPortrait(f.look) : ''}</span><span class="tf-who"><b>${esc(f.name)}</b><small>${f.online ? `● Online ${where(f.room)}` : 'Offline'}</small></span>`
    const acts = el('span', 'tf-acts')
    for (const k of Object.keys(TEXTS) as TextKind[]) {
      const b = el('button', 'btn tiny ghost', `${TEXTS[k].icon} ${TEXTS[k].label}`) as HTMLButtonElement
      b.disabled = !f.online
      b.onclick = () => {
        sfx.click()
        link.send({ t: 'txt', i: f.id, k })
        toast(`Sent to <b>${esc(f.name)}</b>: “${TEXTS[k].label}” 📨`, '💬')
        // one text at a time per friend (the server says the same)
        acts.querySelectorAll('button').forEach((x) => ((x as HTMLButtonElement).disabled = true))
        setTimeout(() => acts.querySelectorAll('button').forEach((x) => ((x as HTMLButtonElement).disabled = !f.online)), 8000)
      }
      acts.append(b)
    }
    row.append(acts)
    list.append(row)
  }
}

/** a friend texted you: a notice with a way to answer (Go to them, or say hi back) */
export function gotText(from: string, name: string, k: TextKind, room: string | null) {
  void import('../engine/ui').then(({ notify }) => {
    const who = `<b>${esc(name)}</b>`
    const go = { label: 'Go', act: () => void import('../net/multiplayer').then((m) => m.goToFriend(from)) }
    if (k === 'meet') return notify(`${who}: Meet me ${where(room) || 'here'}! 📍`, '💬', [go], 12000)
    if (k === 'game') return notify(`${who}: Want to play a game? 🎮`, '💬', [go], 12000)
    notify(`${who} says hi! 👋`, '💬', [{ label: 'Say Hi Back', act: () => link.send({ t: 'txt', i: from, k: 'hi' }) }], 9000)
  })
}
