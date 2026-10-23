/**
 * The screen the multiplayer games live in: lobby, game and results all happen inside one full-stage shell with a
 * top bar (title, lobby code, Hide, sound, Leave). Leave is always visible and Escape always does something sensible
 * (closes a sub-panel, asks before leaving a race, leaves a lobby). A lobby can be hidden down to a small chip so
 * you can keep walking around the city while you wait; it pops back up when your round starts.
 */
import { stage, el } from '../engine/stage'
import { hold } from '../engine/ui'
import { setMuted, isMuted, sfx } from '../audio'
import { save, persist } from '../state'
import { MP_GAMES, type MpGameId } from './shared/games'
import { esc } from './store'
import './mp.css'

type KeyFn = (e: KeyboardEvent) => boolean | void

const S = {
  root: null as HTMLElement | null,
  bar: null as HTMLElement | null,
  body: null as HTMLElement | null,
  release: null as (() => void) | null,
  keys: null as KeyFn | null,
  /** a sub-panel open on top of the view (leaderboard, invites): Escape closes it first */
  sub: null as HTMLElement | null,
  chip: null as HTMLElement | null,
  hidden: false,
  /** a "Leave?" question is up: Escape leaves, Enter stays */
  confirm: null as (() => void) | null,
  tourWatch: 0,
}

/** Rosa's first-day tour steps aside for a game: going to play is exploring on your own ("?" replays it) */
function skipTour() {
  const skip = document.querySelector<HTMLButtonElement>('.tour .tour-skip')
  if (skip && S.root && !S.hidden) skip.click()
}

function onKey(e: KeyboardEvent) {
  if (!S.root || S.hidden) return
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    if (e.key === 'Escape') (e.target as HTMLElement).blur()
    return
  }
  if (S.sub && S.confirm) {
    e.preventDefault()
    e.stopPropagation()
    const leave = S.confirm
    if (e.key === 'Escape') {
      closeSub()
      leave()
    } else if (e.key === 'Enter' || e.key === ' ') closeSub()
    return
  }
  if (e.key === 'Escape' && S.sub) {
    e.preventDefault()
    e.stopPropagation()
    closeSub()
    return
  }
  // a panel is open on top (Invite, Leaderboard): Enter belongs to it, not to the Start button underneath
  if (S.sub && e.key === 'Enter') return
  if (S.keys?.(e)) {
    e.preventDefault()
    e.stopPropagation()
  }
}

export const shellOpen = () => !!S.root && !S.hidden
export const shellBody = () => S.body

/** open (or reuse) the shell; the world stops taking clicks and keys while it's up */
export function openShell(): HTMLElement {
  if (S.root) {
    if (S.hidden) restore()
    return S.body!
  }
  const root = el('div', 'mp-shell')
  const bar = el('div', 'mp-bar')
  const body = el('div', 'mp-body')
  root.append(body, bar)
  stage.root.append(root)
  S.root = root
  S.bar = bar
  S.body = body
  S.release = hold()
  S.hidden = false
  window.addEventListener('keydown', onKey, true)
  skipTour()
  clearInterval(S.tourWatch)
  S.tourWatch = window.setInterval(skipTour, 600)
  return body
}

export function closeShell() {
  closeSub()
  if (!S.root) return
  const r = S.root
  r.classList.add('out')
  setTimeout(() => r.remove(), 280)
  S.root = S.bar = S.body = null
  S.keys = null
  S.release?.()
  S.release = null
  S.hidden = false
  window.removeEventListener('keydown', onKey, true)
  clearInterval(S.tourWatch)
  hideChip()
}

/** the view's keys (return true when you used the key) */
export function setKeys(fn: KeyFn | null) {
  S.keys = fn
}

export interface BarOpts {
  game: MpGameId
  title?: string
  code?: string
  onCopy?: () => void
  onHide?: () => void
  onLeave: () => void
  leaveLabel?: string
  /** the in-game bar is just a corner (the game draws its own HUD) */
  slim?: boolean
}
/** the top bar: what you're in, the lobby code, and the ways out */
export function setBar(o: BarOpts) {
  const bar = S.bar
  if (!bar) return
  const def = MP_GAMES[o.game]
  bar.className = 'mp-bar' + (o.slim ? ' slim' : '')
  bar.innerHTML = o.slim
    ? ''
    : `<span class="mp-bar-title"><span class="mp-bar-icon">${def.icon}</span><b>${esc(o.title ?? def.title)}</b></span>${o.code ? `<span class="mp-code" title="Friends can join with this code">Code <b>${o.code}</b></span>` : ''}`
  const acts = el('span', 'mp-bar-acts')
  if (o.code && o.onCopy && !o.slim) {
    const copy = el('button', 'btn tiny ghost mp-copy', '🔗 Copy Link')
    copy.onclick = () => o.onCopy!()
    bar.querySelector('.mp-code')?.after(copy)
  }
  if (o.onHide && !o.slim) {
    const hide = el('button', 'btn tiny ghost', 'Hide')
    hide.title = 'Keep your seat and walk around the city'
    hide.onclick = () => {
      sfx.click()
      o.onHide!()
    }
    acts.append(hide)
  }
  const snd = el('button', 'mp-snd' + (isMuted() ? ' off' : ''), `<img src="/art/icons/sound.png" alt="">`)
  snd.setAttribute('aria-label', 'Sound On/Off')
  snd.title = 'Sound On/Off'
  snd.onclick = () => {
    save.muted = !save.muted
    setMuted(save.muted)
    persist()
    snd.classList.toggle('off', save.muted)
  }
  const leave = el('button', 'btn tiny mp-leave', `${o.leaveLabel ?? 'Leave'}<kbd>Esc</kbd>`)
  leave.onclick = () => {
    sfx.click()
    o.onLeave()
  }
  acts.append(snd, leave)
  bar.append(acts)
}

/** swap what's on screen (keepSub: the same screen redrawn, so a panel open on top of it stays open) */
export function setView(node: HTMLElement, cls = '', keepSub = false) {
  if (!S.body) return
  if (!keepSub) closeSub()
  S.body.className = 'mp-body' + (cls ? ' ' + cls : '')
  S.body.innerHTML = ''
  S.body.append(node)
}

/** a panel on top of the view (leaderboard, invite list); ✕ or Escape closes it */
export function openSub(node: HTMLElement, onClose?: () => void) {
  closeSub()
  if (!S.root) return
  const wrap = el('div', 'mp-sub')
  const x = el('button', 'x-btn', '<svg viewBox="0 0 20 20"><path d="M5 5 L15 15 M15 5 L5 15" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>')
  x.setAttribute('aria-label', 'Close')
  x.onclick = () => {
    sfx.click()
    closeSub()
  }
  node.classList.add('mp-sub-card')
  node.append(x)
  wrap.append(node)
  wrap.onclick = (e) => e.target === wrap && closeSub()
  S.root.append(wrap)
  S.sub = wrap
  ;(wrap as HTMLElement & { _close?: () => void })._close = onClose
}
export function closeSub() {
  const w = S.sub as (HTMLElement & { _close?: () => void }) | null
  if (!w) return
  S.sub = null
  S.confirm = null
  w.remove()
  w._close?.()
}

/** a question that keeps you in by default ("Leave the Race?"): Escape again leaves, Enter stays */
export function confirmLeave(text: string, sub: string, onLeave: () => void, stay = 'Keep Playing') {
  const card = el('div', 'mp-confirm', `<b>${text}</b><p>${sub}</p>`)
  const row = el('div', 'mp-confirm-btns')
  const keep = el('button', 'btn go', stay)
  const go = el('button', 'btn ghost', 'Leave<kbd>Esc</kbd>')
  keep.onclick = () => closeSub()
  go.onclick = () => {
    closeSub()
    onLeave()
  }
  row.append(keep, go)
  card.append(row)
  openSub(card, () => (S.confirm = null))
  S.confirm = onLeave
  setTimeout(() => keep.focus({ preventScroll: true }), 30)
}

// ---------- hiding the lobby (a chip in the HUD) ----------
export function hideShell(chipText: string, onOpen: () => void) {
  if (!S.root) return
  S.hidden = true
  S.root.classList.add('hidden')
  S.release?.()
  S.release = null
  showChip(chipText, onOpen)
}
export function restore() {
  if (!S.root || !S.hidden) return
  S.hidden = false
  S.root.classList.remove('hidden')
  S.release = hold()
  hideChip()
}
export const isHidden = () => S.hidden

export function showChip(html: string, onOpen: () => void) {
  if (!S.chip) {
    S.chip = el('button', 'mp-chip')
    stage.root.append(S.chip)
  }
  S.chip.innerHTML = html
  S.chip.onclick = (e) => {
    e.stopPropagation()
    sfx.click()
    onOpen()
  }
}
export function updateChip(html: string) {
  if (S.chip) S.chip.innerHTML = html
}
export function hideChip() {
  S.chip?.remove()
  S.chip = null
}
