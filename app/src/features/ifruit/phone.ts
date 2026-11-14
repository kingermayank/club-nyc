/**
 * iFruit: the phone every New Yorker carries (docs/ifruit/SPEC.md). The shell lives here: the device, the lock screen,
 * the home screen with its widget, grid and dock, the status bar and its island, notification banners, app
 * navigation (a stack of screens per app), opening and closing, keys and touch gestures. Apps live in ./apps and are
 * loaded the first time they open.
 */
import './phone.css'
import './apps.css'
import { save } from '../../state'
import { el, stage } from '../../engine/stage'
import { hold, notify } from '../../engine/ui'
import { world, onRoomChange } from '../../engine/world'
import { sigColor } from '../../avatar/look'
import { headPortrait } from '../../avatar/render'
import { ROOMS } from '../../data/rooms'
import { isHomeRoom } from '../../data/homes'
import { ifr, on, emit, badges, totalBadge, onNotePresent, readNotes, clearNotes, syncRequestBadge, nycTime, nycDate, esc, isOnline, kvGet, type AppId, type Note } from './store'
import { tone } from './sound'
import { act } from './kit'

export interface Screen {
  el: HTMLElement
  /** runs each time it comes to the front (and the first time) */
  onShow?: () => void
  /** runs when it's popped or the phone closes for good */
  dispose?: () => void
  /** Escape / back: return true when the screen handled it (closed a sheet) */
  back?: () => boolean
}
export interface Ctx {
  push(s: Screen): void
  pop(): void
  home(): void
  open(app: AppId, arg?: string): void
  close(): void
  banner(text: string, icon?: string): void
  island(html: string, ms?: number, cls?: string): void
  landscape(on: boolean): Promise<void>
  /** the screen element (for sheets that cover the whole display) */
  display: HTMLElement
}
type AppModule = { open: (ctx: Ctx, arg?: string) => Screen }

export const APPS: Record<AppId, { name: string; icon: string; load: () => Promise<AppModule> }> = {
  contacts: { name: 'Contacts', icon: 'contacts', load: () => import('./apps/contacts') },
  messages: { name: 'Messages', icon: 'messages', load: () => import('./apps/messages') },
  phone: { name: 'Phone', icon: 'phone', load: () => import('./apps/calls') },
  camera: { name: 'Camera', icon: 'camera', load: () => import('./apps/camera') },
  photos: { name: 'Photos', icon: 'photos', load: () => import('./apps/photos') },
  bank: { name: 'Bank', icon: 'bank', load: () => import('./apps/bank') },
  stocks: { name: 'Stocks', icon: 'stocks', load: () => import('./apps/stocks') },
  map: { name: 'Map', icon: 'map', load: () => import('./apps/map') },
  settings: { name: 'Settings', icon: 'settings', load: () => import('./apps/settings') },
}
const GRID: AppId[] = ['contacts', 'photos', 'bank', 'stocks', 'settings']
const DOCK: AppId[] = ['phone', 'messages', 'camera', 'map']
export const appIcon = (id: AppId) => (id === 'settings' ? '/art/ifruit/icons/settings.svg' : `/art/ifruit/app/${APPS[id].icon}.png`)
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// ---------- the device ----------
const catcher = el('div', 'ifr-catch')
const root = el('div', 'ifr')
root.setAttribute('role', 'dialog')
root.setAttribute('aria-label', 'iFruit phone')
root.innerHTML = `
  <i class="ifr-btn ifr-vol"></i><i class="ifr-btn ifr-nub"></i><i class="ifr-btn ifr-power"></i>
  <div class="ifr-glass">
    <div class="ifr-screen">
      <div class="ifr-wall"><img alt="" draggable="false"></div>
      <div class="ifr-home">
        <button class="ifr-widget" type="button"></button>
        <div class="ifr-grid"></div>
        <div class="ifr-dock"></div>
      </div>
      <div class="ifr-apps"></div>
      <div class="ifr-lock">
        <div class="ifr-lock-top"><svg class="ifr-pad" viewBox="0 0 20 24" aria-hidden="true"><path class="ifr-shackle" d="M5 11 V7 a5 5 0 0 1 10 0 V11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><rect x="2" y="10" width="16" height="12" rx="3.5" fill="currentColor"/></svg><b class="ifr-clock"></b><span class="ifr-date"></span></div>
        <div class="ifr-notes"></div>
        <div class="ifr-unlock">Swipe up or click</div>
      </div>
      <div class="ifr-status"><span class="ifr-st-left"><b class="ifr-time"></b><button type="button" class="ifr-bell" aria-label="Notifications"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 a5 5 0 0 0 -5 5 v3.2 l-1.6 2.6 h13.2 l-1.6 -2.6 v-3.2 a5 5 0 0 0 -5 -5z" fill="currentColor"/><path d="M8 15.4 a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><i></i></button></span><span class="ifr-isle"></span><span class="ifr-sig"><i></i><i></i><i></i><i></i><em>NYC 5G</em><span class="ifr-batt"><i></i></span></span></div>
      <div class="ifr-banners"></div>
      <div class="ifr-shade" hidden><div class="ifr-shade-in"><div class="ifr-shade-head"><b>Notifications</b></div><div class="ifr-shade-list"></div></div><button type="button" class="ifr-shade-grip" aria-label="Close notifications"><i></i></button></div>
      <nav class="ifr-nav" aria-label="Phone navigation"><button type="button" class="ifr-nb back" data-nav="back" aria-label="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6 L4 11 L9 16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 11 H14 a5.5 5.5 0 0 1 0 11 H11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button><button type="button" class="ifr-nb home" data-nav="home" aria-label="Home"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2.6"/></svg></button><button type="button" class="ifr-nb apps" data-nav="apps" aria-label="Recent apps"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7.5" y="3.5" width="12" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2.2" opacity=".55"/><rect x="4.5" y="6.5" width="12" height="15" rx="3" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="2.4"/></svg></button></nav>
      <div class="ifr-recents" hidden></div>
      <div class="ifr-cover"></div>
    </div>
    <i class="ifr-punch"></i>
  </div>`
const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector(s) as T
const BELL_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 a5 5 0 0 0 -5 5 v3.2 l-1.6 2.6 h13.2 l-1.6 -2.6 v-3.2 a5 5 0 0 0 -5 -5z" fill="currentColor"/><path d="M8 15.4 a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
const screen = q('.ifr-screen')
const lockEl = q('.ifr-lock')
const appsEl = q('.ifr-apps')
const wallImg = q<HTMLImageElement>('.ifr-wall img')
const isle = q('.ifr-isle')
const banners = q('.ifr-banners')

let mounted = false
let opened = false
let locked = true
let closedAt = 0
let release: (() => void) | null = null
let phoneBtn: HTMLElement | null = null

/** the app that's open: its id and its screens, front last */
let current: { id: AppId; stack: Screen[]; layer: HTMLElement } | null = null

export const phoneIsOpen = () => opened

function mount() {
  if (mounted) return
  mounted = true
  stage.root.insertBefore(catcher, stage.overlay)
  stage.root.insertBefore(root, stage.overlay)
  catcher.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    closePhone()
  })
  for (const ev of ['click', 'pointerdown', 'wheel'] as const) root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true })
  buildHome()
  renderWallpaper()
  tickClock()
  setInterval(tickClock, 5000)
  on('wallpaper', renderWallpaper)
  on('notes', renderNotes)
  on('notes', renderBell)
  on('badges', () => shadeOpen() && renderShade())
  q('.ifr-bell').onclick = (e) => {
    e.stopPropagation()
    if (locked) return unlock()
    toggleShade()
  }
  q('.ifr-shade-grip').onclick = () => closeShade()
  renderBell()
  onRoomChange(() => opened && renderWidget())
  // the nav bar: Back, Home, Recent (like the buttons along the bottom of an Android phone)
  root.querySelectorAll<HTMLButtonElement>('.ifr-nb').forEach(
    (b) =>
      (b.onclick = () => {
        if (locked) return unlock()
        const n = b.dataset.nav
        b.animate([{ transform: 'scale(0.82)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(0.2, 1.6, 0.4, 1)' })
        if (n === 'back') return goBack()
        if (n === 'home') return void goHome()
        toggleRecents()
      }),
  )
  lockEl.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.ifr-note')) return
    unlock()
  })
  gestures()
}

// ---------- status bar ----------
function tickClock() {
  const t = nycTime()
  q('.ifr-time').textContent = t
  q('.ifr-clock').innerHTML = t.replace(':', '<i>:</i>')
  q('.ifr-date').textContent = nycDate()
  root.classList.toggle('offline', !isOnline())
}
let isleTimer = 0
/** the island grows to show something live (a call's timer, "+5" from a friend) */
export function island(html: string, ms = 2600, cls = '') {
  clearTimeout(isleTimer)
  isle.className = 'ifr-isle on ' + cls
  isle.innerHTML = html
  if (ms > 0) isleTimer = window.setTimeout(() => ((isle.className = 'ifr-isle'), (isle.innerHTML = '')), ms)
}
export const islandOff = () => ((isle.className = 'ifr-isle'), (isle.innerHTML = ''))

// ---------- wallpaper ----------
async function renderWallpaper() {
  const w = ifr().wallpaper
  if (w === 'photo') {
    const url = await kvGet<string>('wallpaper')
    if (url) return void (wallImg.src = url)
  }
  wallImg.src = `/art/ifruit/wall-${['skyline', 'subway', 'park'].includes(w) ? w : 'skyline'}.jpg`
}

// ---------- home ----------
function iconButton(id: AppId, dock = false) {
  const b = el('button', 'ifr-icon' + (dock ? ' dock' : ''), `<span class="ifr-tile"><img src="${appIcon(id)}" alt="" draggable="false"><i class="ifr-badge" data-app="${id}"></i></span>${dock ? '' : `<span class="ifr-label">${APPS[id].name}</span>`}`)
  b.dataset.app = id
  b.setAttribute('aria-label', APPS[id].name)
  b.type = 'button'
  b.onclick = () => openApp(id, undefined, b)
  return b
}
function buildHome() {
  const grid = q('.ifr-grid')
  const dock = q('.ifr-dock')
  for (const id of GRID) grid.append(iconButton(id))
  for (const id of DOCK) dock.append(iconButton(id, true))
  q('.ifr-widget').onclick = () => openApp('map', 'here', q('.ifr-widget'))
  renderBadges()
}
function renderWidget() {
  const r = world.room
  const name = world.plate?.name ?? r.name
  const home = isHomeRoom(r.id)
  let faces = ''
  // friends standing in this room with you
  void import('../../net/multiplayer').then(({ mp }) => {
    const here = [...mp.players.values()].filter((a) => a.remote && mp.friends.has(a.remote.id)).slice(0, 4)
    faces = here.map((a) => `<i>${headPortrait(a.look)}</i>`).join('')
    const w = q('.ifr-widget')
    w.innerHTML = `<span class="ifr-w-art" style="background-image:url(/art/rooms/${r.bg}.jpg)"></span><span class="ifr-w-text"><small>${home ? 'Home' : 'You’re at'}</small><b>${esc(name)}</b><span class="ifr-w-faces">${faces || `<em>${here.length ? '' : 'Just you'}</em>`}</span></span>`
  })
}
function renderBadges() {
  for (const b of root.querySelectorAll<HTMLElement>('.ifr-badge')) {
    const n = badges[b.dataset.app ?? ''] ?? 0
    b.textContent = n > 9 ? '9+' : n ? String(n) : ''
    b.classList.toggle('on', n > 0)
  }
  if (phoneBtn) {
    const n = totalBadge()
    let dot = phoneBtn.querySelector<HTMLElement>('.ifr-tb-badge')
    if (!dot) {
      dot = el('i', 'ifr-tb-badge')
      phoneBtn.append(dot)
    }
    dot.textContent = n > 9 ? '9+' : n ? String(n) : ''
    dot.classList.toggle('on', n > 0)
  }
}

// ---------- lock screen ----------
function renderNotes() {
  const list = q('.ifr-notes')
  const notes = ifr().notes.filter((n) => !n.read)
  list.innerHTML = ''
  for (const n of notes.slice(0, 4)) {
    const b = el('button', 'ifr-note', `<img src="${appIcon(n.app)}" alt=""><span><b>${esc(n.title)}</b><small>${esc(n.text)}</small></span><em>${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(n.at)}</em>`)
    b.type = 'button'
    b.onclick = (e) => {
      e.stopPropagation()
      unlock(false)
      openApp(n.app, n.arg)
    }
    list.append(b)
  }
  if (notes.length > 4) list.append(el('div', 'ifr-more', `+${notes.length - 4} more`))
}
// ---------- notification panel (pull down from the top, or the bell) ----------
const shade = q('.ifr-shade')
const shadeOpen = () => !shade.hidden
function renderBell() {
  const n = ifr().notes.filter((x) => !x.read).length
  const bell = q('.ifr-bell')
  bell.classList.toggle('on', n > 0)
  bell.querySelector('i')!.textContent = n > 9 ? '9+' : n ? String(n) : ''
  bell.setAttribute('aria-label', n ? `Notifications, ${n} new` : 'Notifications')
  if (shadeOpen()) renderShade()
}
const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  if (m < 60 * 24) return `${Math.round(m / 60)}h`
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(at)
}
/** a friend request in the panel can be answered there, while it's still waiting */
async function stillAsking(n: Note): Promise<boolean> {
  if (n.kind !== 'fr' || !n.arg?.startsWith('u:')) return false
  const id = n.arg.slice(2)
  const fa = await import('../../social/friendAsks')
  if (fa.askedYou(id)) return true
  if (!isOnline()) return false
  const { mp } = await import('../../net/multiplayer')
  return mp.incoming.has(id)
}
async function answerNote(n: Note, yes: boolean) {
  const id = n.arg!.slice(2)
  const fa = await import('../../social/friendAsks')
  const { RESIDENT } = await import('../../social/residents')
  if (RESIDENT[id]) return yes ? fa.acceptRequest(RESIDENT[id]) : fa.declineRequest(RESIDENT[id])
  const m = await import('../../net/multiplayer')
  return yes ? m.acceptFriend(id) : m.declineFriend(id)
}
let shadeDraw = 0
async function renderShade() {
  const draw = ++shadeDraw
  const list = q('.ifr-shade-list')
  const head = q('.ifr-shade-head')
  const all = ifr().notes
  const fresh = all.filter((n) => !n.read)
  const earlier = all.filter((n) => n.read).slice(0, 12)
  const asking = await Promise.all(all.map(stillAsking))
  if (draw !== shadeDraw) return
  const waiting = new Set(all.filter((_, i) => asking[i]).map((n) => n.id))
  head.querySelector('.ifr-act')?.remove()
  if (all.length) head.append(act('Clear', () => clearNotes(), 'ghost'))
  list.innerHTML = ''
  if (!all.length) {
    list.append(el('div', 'ifr-shade-empty', `${BELL_SVG}<b>All Caught Up</b>`))
    return
  }
  const row = (n: Note) => {
    const r = el('div', 'ifr-sn' + (n.read ? '' : ' new'), `<img src="${appIcon(n.app)}" alt=""><span class="ifr-sn-txt"><b>${esc(n.title)}</b><small>${esc(n.text)}</small></span><em>${ago(n.at)}</em>`)
    r.tabIndex = 0
    r.setAttribute('role', 'button')
    r.onclick = () => {
      closeShade(true)
      void openApp(n.app, n.arg)
    }
    r.onkeydown = (e) => e.key === 'Enter' && r.click()
    if (waiting.has(n.id)) {
      const two = el('span', 'ifr-sn-acts')
      two.append(
        act('Decline', () => void answerNote(n, false).then(() => renderShade()), 'ghost'),
        act('Accept', () => void answerNote(n, true).then(() => renderShade()), 'green'),
      )
      r.querySelector('.ifr-sn-txt')!.append(two)
    }
    return r
  }
  if (fresh.length) {
    list.append(el('div', 'ifr-sec', 'New'))
    fresh.forEach((n) => list.append(row(n)))
  }
  if (earlier.length) {
    list.append(el('div', 'ifr-sec', 'Earlier'))
    earlier.forEach((n) => list.append(row(n)))
  }
}
function openShade() {
  if (shadeOpen() || locked) return
  closeRecents()
  tone('tap')
  shade.hidden = false
  root.classList.add('shaded')
  void renderShade()
  if (!reduced()) shade.querySelector('.ifr-shade-in')!.animate([{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(0.2, 1, 0.35, 1)' })
  setTimeout(() => shade.querySelector<HTMLElement>('.ifr-sn, .ifr-shade-grip')?.focus({ preventScroll: true }), 60)
}
/** put the panel away; looking at it counts as reading what's new */
function closeShade(quick = false) {
  if (!shadeOpen()) return
  const done = () => {
    shade.hidden = true
    root.classList.remove('shaded')
    readNotes()
  }
  if (quick || reduced()) return done()
  shade.querySelector('.ifr-shade-in')!.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)' }).onfinish = done
}
const toggleShade = () => (shadeOpen() ? closeShade() : openShade())

function unlock(sound = true) {
  if (!locked) return
  locked = false
  if (sound) tone('unlock')
  root.classList.add('unlocked')
  lockEl.setAttribute('aria-hidden', 'true')
  renderWidget()
  focusFirst()
}
function lock() {
  locked = true
  root.classList.remove('unlocked')
  lockEl.removeAttribute('aria-hidden')
  renderNotes()
}

// ---------- opening apps ----------
const ctx: Ctx = {
  push: (s) => pushScreen(s),
  pop: () => popScreen(),
  home: () => goHome(),
  open: (app, arg) => openApp(app, arg),
  close: () => closePhone(),
  banner: (text, icon) => banner(text, icon),
  island,
  landscape: (on) => landscape(on),
  display: screen,
}

let opening = false
export async function openApp(id: AppId, arg?: string, from?: HTMLElement) {
  if (!opened) await openPhone({ unlock: true })
  if (locked) unlock(false)
  if (opening) return
  opening = true
  closeRecents()
  closeShade(true)
  try {
    const mod = await APPS[id].load()
    const wantLand = id === 'camera'
    const turning = wantLand !== root.classList.contains('land')
    // turning the phone: the screen goes dark first, the app changes underneath, then it turns
    if (turning) await cover(true)
    // the same app again: a fresh start on its root (an argument, like a thread, opens straight to it)
    if (current) disposeApp(current.id === id ? 'swap' : 'leave')
    recent.splice(0, recent.length, id, ...recent.filter((r) => r !== id))
    const layer = el('div', 'ifr-app')
    layer.dataset.app = id
    appsEl.append(layer)
    current = { id, stack: [], layer }
    root.classList.add('in-app')
    const s = mod.open(ctx, arg)
    pushScreen(s, false)
    tone('open')
    readNotes(id)
    if (turning) {
      await landscape(wantLand)
      return
    }
    // zoom out of the icon it came from
    const src = from ?? root.querySelector<HTMLElement>(`.ifr-icon[data-app="${id}"]`)
    if (src && !reduced()) {
      const a = src.getBoundingClientRect()
      const b = screen.getBoundingClientRect()
      const ox = ((a.left + a.width / 2 - b.left) / b.width) * 100
      const oy = ((a.top + a.height / 2 - b.top) / b.height) * 100
      layer.style.transformOrigin = `${ox}% ${oy}%`
      layer.animate([{ transform: 'scale(0.18)', opacity: 0, borderRadius: '40px' }, { transform: 'scale(1.015)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1, borderRadius: '0' }], { duration: 380, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' })
    } else layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 })
  } finally {
    opening = false
  }
}
function disposeApp(how: 'swap' | 'leave' | 'home') {
  if (!current) return
  const c = current
  current = null
  for (const s of c.stack) s.dispose?.()
  if (how === 'home' && !reduced()) {
    const icon = root.querySelector<HTMLElement>(`.ifr-icon[data-app="${c.id}"]`)
    if (icon) {
      const a = icon.getBoundingClientRect()
      const b = screen.getBoundingClientRect()
      c.layer.style.transformOrigin = `${((a.left + a.width / 2 - b.left) / b.width) * 100}% ${((a.top + a.height / 2 - b.top) / b.height) * 100}%`
    }
    c.layer.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.2)', opacity: 0 }], { duration: 240, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).onfinish = () => c.layer.remove()
  } else c.layer.remove()
}
export async function goHome() {
  closeRecents()
  closeShade(true)
  if (!current) return
  tone('home')
  // the camera turns the phone back upright on the way home
  if (root.classList.contains('land')) {
    await cover(true)
    disposeApp('leave')
    root.classList.remove('in-app')
    renderWidget()
    await landscape(false)
  } else {
    disposeApp('home')
    root.classList.remove('in-app')
    renderWidget()
  }
  focusFirst()
}
/** one step back: an open sheet, then the screen before, then the home screen */
export function goBack() {
  if (shadeOpen()) return closeShade()
  if (recentsOpen()) return closeRecents()
  if (!current) return void tone('tap')
  tone('tap')
  const sheetEl = screen.querySelector('.ifr-sheet:not(.out)')
  if (sheetEl) return void screen.querySelector<HTMLElement>('.ifr-scrim')?.click()
  const top = current.stack[current.stack.length - 1]
  if (top?.back?.()) return
  if (current.stack.length > 1) popScreen()
  else void goHome()
}

// ---------- recent apps ----------
const recent: AppId[] = []
const recentsEl = q('.ifr-recents')
const recentsOpen = () => !recentsEl.hidden
function closeRecents() {
  if (recentsEl.hidden) return
  recentsEl.classList.add('out')
  setTimeout(() => ((recentsEl.hidden = true), recentsEl.classList.remove('out')), 180)
}
function toggleRecents() {
  if (recentsOpen()) return closeRecents()
  tone('tap')
  const list = recent.slice(0, 6)
  recentsEl.innerHTML = list.length ? '<b class="ifr-rc-title">Recent</b>' : '<b class="ifr-rc-title">Recent</b><span class="ifr-rc-empty">Apps you open show up here</span>'
  const grid = el('div', 'ifr-rc-grid')
  list.forEach((id, i) => {
    const c = el('button', 'ifr-rc' + (id === current?.id ? ' now' : ''), `<img src="${appIcon(id)}" alt=""><span>${APPS[id].name}</span>`)
    c.type = 'button'
    c.style.animationDelay = `${i * 35}ms`
    c.onclick = () => {
      closeRecents()
      if (id !== current?.id) void openApp(id)
    }
    grid.append(c)
  })
  recentsEl.append(grid)
  recentsEl.hidden = false
}
function pushScreen(s: Screen, animate = true) {
  if (!current) return
  const stack = current.stack
  const prev = stack[stack.length - 1]
  s.el.classList.add('ifr-scr')
  current.layer.append(s.el)
  stack.push(s)
  s.onShow?.()
  if (animate && prev && !reduced()) {
    s.el.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], { duration: 340, easing: 'cubic-bezier(0.2, 1, 0.35, 1)' })
    prev.el.animate([{ transform: 'translateX(0)', filter: 'brightness(1)' }, { transform: 'translateX(-28%)', filter: 'brightness(0.85)' }], { duration: 340, easing: 'cubic-bezier(0.2, 1, 0.35, 1)', fill: 'forwards' }).onfinish = () => (prev.el.hidden = true)
  } else if (prev) prev.el.hidden = true
  focusIn(s.el)
}
function popScreen() {
  if (!current) return
  const stack = current.stack
  if (stack.length <= 1) return goHome()
  const top = stack.pop()!
  const prev = stack[stack.length - 1]
  prev.el.hidden = false
  prev.el.getAnimations().forEach((a) => a.cancel())
  prev.onShow?.()
  if (!reduced()) {
    top.el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], { duration: 260, easing: 'cubic-bezier(0.4, 0, 0.8, 1)', fill: 'forwards' }).onfinish = () => top.el.remove()
    prev.el.animate([{ transform: 'translateX(-28%)', filter: 'brightness(0.85)' }, { transform: 'translateX(0)', filter: 'brightness(1)' }], { duration: 260, easing: 'cubic-bezier(0.2, 1, 0.35, 1)' })
  } else top.el.remove()
  top.dispose?.()
  focusIn(prev.el)
}
function focusIn(node: HTMLElement) {
  setTimeout(() => {
    if (!node.isConnected) return
    // the screen itself takes focus (keys work, Tab goes on from here) without lighting up a button
    const f = node.querySelector<HTMLElement>('[autofocus]') ?? node
    if (f === node) node.tabIndex = -1
    f.focus({ preventScroll: true })
  }, 60)
}
const focusFirst = () => setTimeout(() => root.querySelector<HTMLElement>('.ifr-home .ifr-icon')?.focus({ preventScroll: true }), 80)

// ---------- banners ----------
export function banner(text: string, icon = '/art/ifruit/app/messages.png', act?: () => void) {
  const b = el('button', 'ifr-banner', `<img src="${icon}" alt=""><span>${text}</span>`)
  b.type = 'button'
  b.onclick = () => {
    b.remove()
    act?.()
  }
  banners.append(b)
  while (banners.children.length > 2) banners.firstElementChild?.remove()
  setTimeout(() => {
    b.classList.add('out')
    setTimeout(() => b.remove(), 300)
  }, 3600)
}

/** a notification arrived: a banner inside the open phone, otherwise the badge (and a notice for the urgent kinds) */
function present(n: Note) {
  renderNotes()
  if (opened && !locked) {
    // already looking at it: no banner
    if (current?.id === n.app && n.app !== 'bank') return
    tone('note')
    return banner(`<b>${esc(n.title)}</b> ${esc(n.text)}`, appIcon(n.app), () => openApp(n.app, n.arg))
  }
  if (n.app === 'bank' || n.app === 'contacts') notify(`<b>${esc(n.title)}</b> ${esc(n.text)}`, `<img src="${appIcon(n.app)}" alt="" width="22" height="22">`, [{ label: 'Open', act: () => void openApp(n.app, n.arg) }], 9000)
  else if (!save.notifyOff) tone('note')
  phoneBtn?.classList.remove('ifr-buzz')
  void phoneBtn?.offsetWidth
  phoneBtn?.classList.add('ifr-buzz')
}
onNotePresent(present)

// ---------- open / close ----------
export async function openPhone(o: { unlock?: boolean } = {}) {
  mount()
  if (opened) return
  opened = true
  release = hold()
  root.style.setProperty('--shell', sigColor(save.look))
  // a quick look back in (within two minutes) skips the lock screen
  if (Date.now() - closedAt > 120_000 && !o.unlock) lock()
  else if (locked && o.unlock) unlock(false)
  renderNotes()
  renderWidget()
  tickClock()
  root.classList.add('open')
  catcher.classList.add('open')
  phoneBtn?.classList.add('active')
  tone('raise')
  if (!reduced()) root.animate([{ transform: 'translateY(115%) rotate(4deg)' }, { transform: 'translateY(-3%) rotate(-1deg)', offset: 0.72 }, { transform: 'translateY(0) rotate(0)' }], { duration: 460, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' })
  else root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 })
  window.addEventListener('keydown', keys, true)
  if (locked) setTimeout(() => lockEl.focus?.(), 50)
  else focusFirst()
}
export function closePhone() {
  if (!opened) return
  // a call keeps going in the island; the camera puts itself away
  if (current?.id === 'camera') {
    disposeApp('leave')
    root.classList.remove('in-app', 'land')
  }
  opened = false
  closedAt = Date.now()
  window.removeEventListener('keydown', keys, true)
  catcher.classList.remove('open')
  phoneBtn?.classList.remove('active')
  const done = () => {
    root.classList.remove('open')
    release?.()
    release = null
  }
  if (!reduced()) root.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(115%) rotate(3deg)' }], { duration: 220, easing: 'cubic-bezier(0.5, 0, 1, 1)', fill: 'forwards' }).onfinish = (e) => ((e.target as Animation).cancel(), done())
  else done()
  tone('lower')
}
export const togglePhone = () => (opened ? closePhone() : void openPhone())
/** put it away locked (Settings' Lock Phone) */
export function lockPhone() {
  closePhone()
  closedAt = 0
}

/** close the phone, then do something in the city (go somewhere, open a big panel) */
export function thenCity(f: () => void) {
  closePhone()
  setTimeout(f, reduced() ? 0 : 200)
}

// ---------- the camera turns it sideways ----------
/** the screen goes dark (or lights back up), like the display between two apps */
const coverEl = q('.ifr-cover')
function cover(on: boolean): Promise<void> {
  coverEl.classList.toggle('on', on)
  return new Promise((r) => setTimeout(r, reduced() ? 0 : on ? 130 : 0))
}
/**
 * Turn the phone sideways (or back upright) in one continuous move: the new shape is laid out at once, then drawn
 * turned a quarter back and sized to sit exactly where the old one was, and eased into place (a FLIP). The screen
 * is dark while it turns and lights up when it lands.
 */
async function landscape(on: boolean) {
  if (root.classList.contains('land') !== on) {
    if (reduced()) root.classList.toggle('land', on)
    else {
      const a = root.getBoundingClientRect()
      root.classList.toggle('land', on)
      const b = root.getBoundingClientRect()
      const k = stage.scale
      const dx = (a.left + a.width / 2 - (b.left + b.width / 2)) / k
      const dy = (a.top + a.height / 2 - (b.top + b.height / 2)) / k
      const s = on ? a.height / b.width : a.width / b.height
      root.style.transformOrigin = '50% 50%'
      await root.animate([{ transform: `translate(${dx}px, ${dy}px) rotate(${on ? 90 : -90}deg) scale(${s})` }, { transform: 'translate(0, 0) rotate(0deg) scale(1)' }], { duration: 520, easing: 'cubic-bezier(0.32, 0.9, 0.24, 1)' }).finished
      root.style.transformOrigin = ''
    }
  }
  await cover(false)
}

// ---------- keys ----------
function keys(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    if (typing) return void t!.blur()
    if (shadeOpen()) return closeShade()
    if (recentsOpen()) return closeRecents()
    const top = current?.stack[current.stack.length - 1]
    if (top?.back?.()) return
    if (current) return current.stack.length > 1 ? popScreen() : void goHome()
    return closePhone()
  }
  if (typing) return
  if (locked && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp')) {
    e.preventDefault()
    e.stopPropagation()
    return unlock()
  }
  if (e.key.toLowerCase() === 'q') {
    e.preventDefault()
    e.stopPropagation()
    return closePhone()
  }
  // arrows walk the home screen's icons
  if (!current && !locked && e.key.startsWith('Arrow')) {
    const icons = [...root.querySelectorAll<HTMLElement>('.ifr-home .ifr-icon, .ifr-widget')]
    const i = icons.indexOf(document.activeElement as HTMLElement)
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? 4 : -4
    const next = icons[Math.max(0, Math.min(icons.length - 1, (i < 0 ? 0 : i) + step))]
    next?.focus()
    e.preventDefault()
    e.stopPropagation()
  }
  // the world's own keys stay quiet while the phone is up
  if (!e.ctrlKey && !e.metaKey && e.key !== 'Tab') e.stopPropagation()
}

// ---------- touch: swipe up from the corner to open, the home bar to go home, drag down to put it away ----------
function gestures() {
  let start: { x: number; y: number; on: 'bar' | 'top' | 'shade' | null } | null = null
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return
    const bar = (e.target as HTMLElement).closest('.ifr-nav, .ifr-lock')
    const top = (e.target as HTMLElement).closest('.ifr-status')
    const shade = (e.target as HTMLElement).closest('.ifr-shade-grip, .ifr-shade-head')
    start = { x: e.clientX, y: e.clientY, on: bar ? 'bar' : top ? 'top' : shade ? 'shade' : null }
  })
  root.addEventListener('pointerup', (e) => {
    if (!start || e.pointerType !== 'touch') return
    const dy = (e.clientY - start.y) / stage.scale
    if (start.on === 'bar' && dy < -40) locked ? unlock() : void goHome()
    if (start.on === 'top' && dy > 40) locked ? closePhone() : openShade()
    if (start.on === 'shade' && dy < -40) closeShade()
    start = null
  })
  let corner: { y: number } | null = null
  stage.root.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || opened) return
    const r = stage.root.getBoundingClientRect()
    const x = (e.clientX - r.left) / stage.scale
    const y = (e.clientY - r.top) / stage.scale
    corner = x > 860 && y > 480 ? { y: e.clientY } : null
  })
  stage.root.addEventListener('pointerup', (e) => {
    if (corner && (corner.y - e.clientY) / stage.scale > 50) void openPhone()
    corner = null
  })
}

// ---------- the toolbar button ----------
export function attachPhoneButton(b: HTMLElement) {
  phoneBtn = b
  b.classList.add('tb-phone')
  // unread counts show on the toolbar from the start, before the phone is ever opened
  on('badges', renderBadges)
  renderBadges()
  syncRequestBadge()
  // messages that came in while you were away (online: the server's unread counts)
  const check = () => void import('./net').then((m) => (isOnline() ? m.refreshBadge() : setTimeout(check, 5000)))
  setTimeout(check, 3000)
}

/** for the unboxing: where the phone lives on the toolbar */
export const phoneButton = () => phoneBtn

/** used by apps that show the city's rooms */
export const roomName = (id: string | null) => (id ? (isHomeRoom(id) ? 'Home' : ROOMS[id]?.name ?? id) : '')

export { emit }
