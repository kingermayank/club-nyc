import { sfx, startBeat } from '../audio'
import { save, persist, bump, type PlacedFurniture } from '../state'
import { NavGrid, inPoly, type Pt } from '../geometry'
import { el, stage, toStage } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton, toast, hold, confetti } from '../engine/ui'
import { world, onRoom, onFrame, depthScale, sitPlayer, spawnResident, leave } from '../engine/world'
import type { Seat } from '../engine/actor'
import { RESIDENT, RESIDENTS, type Resident } from '../social/residents'
import { rng, hash } from '../social/rng'
import { bond } from '../social/friends'
import { api } from '../game'
import { link } from '../net/link'
import { rest, HttpError, type PublicUser } from '../net/server'
import { HOME, HOME_ROOMS, isHomeRoom, homeOfRoom } from '../data/homes'
import { ART_FURNITURE } from '../data/souvenirs'

interface FurnitureDef {
  id: string
  name: string
  price: number
  /** width in px at depth scale 1 */
  w: number
  src: string
  flat?: boolean
  /** can be sat on: hip height as a fraction of the sprite height */
  seat?: number
  /** clicking it does something */
  use?: 'music' | 'screen' | 'light' | 'cat' | 'game'
  cat: 'Seating' | 'Tables & Storage' | 'Lights' | 'Fun' | 'Decor' | 'Beds'
  /** sold in the catalog (vs. earned) */
  shop?: boolean
}

export const FURNITURE: FurnitureDef[] = [
  { id: 'rug', name: 'Woven Rug', price: 30, w: 230, src: '/art/furniture/rug.png', flat: true, cat: 'Decor', shop: true },
  { id: 'pizza-rug', name: 'Pepperoni Rug', price: 45, w: 220, src: '/art/furniture/pizza-rug.png', flat: true, cat: 'Decor', shop: true },
  { id: 'sofa', name: 'Teal Sofa', price: 90, w: 200, src: '/art/furniture/sofa.png', seat: 0.42, cat: 'Seating', shop: true },
  { id: 'armchair', name: 'Cozy Armchair', price: 45, w: 108, src: '/art/furniture/armchair.png', seat: 0.42, cat: 'Seating', shop: true },
  { id: 'beanbag', name: 'Bean Bag', price: 25, w: 96, src: '/art/furniture/beanbag.png', seat: 0.36, cat: 'Seating', shop: true },
  { id: 'bagel-bag', name: 'Everything Bagel Bag', price: 60, w: 112, src: '/art/furniture/bagel-bag.png', seat: 0.4, cat: 'Seating', shop: true },
  { id: 'subway-bench', name: 'Subway Bench', price: 70, w: 190, src: '/art/furniture/subway-bench.png', seat: 0.44, cat: 'Seating', shop: true },
  { id: 'bed', name: 'Patchwork Bed', price: 80, w: 210, src: '/art/furniture/bed.png', seat: 0.4, cat: 'Beds', shop: true },
  { id: 'taxi-bed', name: 'Taxi Bed', price: 150, w: 220, src: '/art/furniture/taxi-bed.png', seat: 0.42, cat: 'Beds', shop: true },
  { id: 'cat-bed', name: 'Bodega Cat Bed', price: 55, w: 110, src: '/art/furniture/cat-bed.png', use: 'cat', cat: 'Fun', shop: true },
  { id: 'bistro', name: 'Bistro Set', price: 40, w: 132, src: '/art/furniture/bistro.png', cat: 'Tables & Storage', shop: true },
  { id: 'hydrant-table', name: 'Hydrant Side Table', price: 35, w: 66, src: '/art/furniture/hydrant-table.png', cat: 'Tables & Storage', shop: true },
  { id: 'pizza-boxes', name: 'Pizza Box Table', price: 20, w: 78, src: '/art/furniture/pizza-boxes.png', cat: 'Tables & Storage', shop: true },
  { id: 'bookshelf', name: 'Bookshelf', price: 60, w: 118, src: '/art/furniture/bookshelf.png', cat: 'Tables & Storage', shop: true },
  { id: 'record-player', name: 'Record Player', price: 55, w: 84, src: '/art/furniture/record-player.png', use: 'music', cat: 'Fun', shop: true },
  { id: 'jukebox', name: 'Jukebox', price: 120, w: 96, src: '/art/furniture/jukebox.png', use: 'music', cat: 'Fun', shop: true },
  { id: 'tv', name: 'Retro TV', price: 50, w: 112, src: '/art/furniture/tv.png', use: 'screen', cat: 'Fun', shop: true },
  { id: 'arcade', name: 'Arcade Cabinet', price: 140, w: 92, src: '/art/furniture/arcade.png', use: 'game', cat: 'Fun', shop: true },
  { id: 'lamp', name: 'Floor Lamp', price: 20, w: 56, src: '/art/furniture/lamp.png', use: 'light', cat: 'Lights', shop: true },
  { id: 'torch-lamp', name: 'Liberty Torch Lamp', price: 65, w: 52, src: '/art/furniture/torch-lamp.png', use: 'light', cat: 'Lights', shop: true },
  { id: 'street-lamp', name: 'Street Lamp', price: 50, w: 50, src: '/art/furniture/street-lamp.png', use: 'light', cat: 'Lights', shop: true },
  { id: 'neon', name: 'NYC Neon Sign', price: 65, w: 120, src: '/art/furniture/neon.png', use: 'light', cat: 'Lights', shop: true },
  { id: 'plant', name: 'Monstera', price: 20, w: 78, src: '/art/furniture/plant.png', cat: 'Decor', shop: true },
  { id: 'water-tower', name: 'Water Tower Planter', price: 75, w: 104, src: '/art/furniture/water-tower.png', cat: 'Decor', shop: true },
  { id: 'painting', name: 'Skyline Painting', price: 0, w: 100, src: '/art/cutouts/brooklyn-bridge/easel.png', cat: 'Decor' },
  // the Brooklyn Bridge painter's gallery (data/souvenirs.ts): sold on the bridge, not in the catalog
  ...ART_FURNITURE,
]
const FDEF = Object.fromEntries(FURNITURE.map((f) => [f.id, f]))

export function giveFurniture(id: string) {
  save.storage.push(id)
  persist()
  toast(`${FDEF[id]?.name ?? 'Furniture'} delivered to your apartment!`, '📦')
}

// ---------- whose apartment is this? ----------
/** A real player's place, as the server shares it. */
export interface PlayerPlace {
  user: PublicUser
  furniture: PlacedFurniture[]
  openHouse: boolean
  likes: number
  liked: boolean
  friend: 'friends' | 'requested' | 'incoming' | 'none'
  /** which room their current home is ('apartment', 'loft', 'penthouse') */
  home?: string
  /** a party they're hosting right now */
  party?: { pub: boolean; track: string; theme: string } | null
}
type Owner = { kind: 'resident'; r: Resident } | { kind: 'player'; place: PlayerPlace }
let owner: Owner | null = null
/** Go to a resident's apartment (Club Penguin's "visit igloo"). */
export function visitApartment(id: string) {
  const r = RESIDENT[id]
  if (!r) return
  owner = { kind: 'resident', r }
  api.goto(residentHome(r))
}
/** City locals live all over: mostly walk-ups, some lofts, a lucky few on Billionaires' Row. */
export function residentHome(r: Resident): string {
  const x = rng('home:' + r.id)()
  return x < 0.06 ? 'penthouse' : x < 0.3 ? 'loft' : 'apartment'
}
/** Back to your own place (whichever home you live in now). */
export function goHome() {
  owner = null
  api.goto(HOME[save.home]?.room ?? 'apartment')
}
/** Visit a real player's apartment — friends any time, everyone else during an open house. */
export async function visitPlayerApartment(id: string) {
  let place: PlayerPlace
  try {
    place = await rest<PlayerPlace>(`/users/${id}`)
  } catch {
    return toast('Couldn’t find that apartment right now.', '🏚️')
  }
  const invited = place.party && (place.party.pub || place.friend === 'friends')
  if (place.friend !== 'friends' && !place.openHouse && !invited) return toast(`${place.user.name}’s door is closed. Add them as a friend, or wait for an open house.`, '🚪')
  owner = { kind: 'player', place }
  api.goto(place.home && isHomeRoom(place.home) ? place.home : 'apartment')
}
export const visiting = () => (owner?.kind === 'resident' ? owner.r : null)
/** Which apartment instance the server should put us in (undefined = my own). */
export const apartmentHost = () => (!owner ? undefined : owner.kind === 'resident' ? `npc-${owner.r.id}` : owner.place.user.id)

/** A resident's apartment: same building, their taste. Deterministic so it's the same every visit. */
function residentLayout(r: Resident): PlacedFurniture[] {
  const g = rng('apt:' + r.id)
  const pool = FURNITURE.filter((f) => f.shop)
  const n = 4 + Math.floor(g() * 4)
  const out: PlacedFurniture[] = []
  const rug = pool.filter((f) => f.flat)[Math.floor(g() * 2)]
  out.push({ id: rug.id, x: 420 + g() * 200, y: 470 + g() * 40 })
  const used = new Set<string>()
  for (let i = 0; i < n * 3 && out.length < n + 1; i++) {
    const f = pool[Math.floor(g() * pool.length)]
    if (f.flat || used.has(f.id)) continue
    used.add(f.id)
    out.push({ id: f.id, x: 170 + g() * 660, y: 360 + g() * 170, flip: g() < 0.4 })
  }
  return out
}

const onFloor = (items: PlacedFurniture[]) =>
  items.map((p) => {
    const walk = world.geo?.walk
    if (!walk || !world.nav || inPoly([p.x, p.y], walk)) return p
    const [x, y] = world.nav.nearest([p.x, p.y])
    return { ...p, x, y }
  })
let residentCache: { id: string; room: string; items: PlacedFurniture[] } | null = null
const layout = (): PlacedFurniture[] => {
  if (!owner) return save.furniture
  if (owner.kind === 'player') return owner.place.furniture
  if (residentCache?.id !== owner.r.id || residentCache.room !== world.room.id) residentCache = { id: owner.r.id, room: world.room.id, items: onFloor(residentLayout(owner.r)) }
  return residentCache.items
}
const isMine = () => !owner

// ---------- rendering ----------
let editing = false
let layer: HTMLElement | null = null
const aspectOf = new Map<string, number>()

function aspect(f: FurnitureDef, img: HTMLImageElement) {
  const r = img.naturalWidth ? img.naturalHeight / img.naturalWidth : aspectOf.get(f.id) ?? 0.8
  aspectOf.set(f.id, r)
  return r
}

function placeEl(node: HTMLImageElement, f: FurnitureDef, x: number, y: number, flip?: boolean) {
  const s = depthScale(y)
  const w = f.w * s
  const h = w * aspect(f, node)
  node.style.cssText = `left:${x - w / 2}px;top:${y - h}px;width:${w}px;height:${h}px;z-index:${f.flat ? 4 : Math.round(y * 10)};transform:${flip ? 'scaleX(-1)' : 'none'}`
}

function footprint(f: FurnitureDef, x: number, y: number): Pt[] {
  const s = depthScale(y)
  const hw = f.w * s * 0.42
  const d = 16 * s
  return [[x - hw, y - d], [x + hw, y - d], [x + hw, y + 3], [x - hw, y + 3]]
}

function rebuildNav() {
  const geo = world.geo
  if (!geo) return
  const holes = [...(geo.holes ?? [])]
  for (const p of layout()) {
    const f = FDEF[p.id]
    if (f && !f.flat) holes.push(footprint(f, p.x, p.y))
  }
  world.nav = new NavGrid(geo.walk, holes)
  // furniture you can sit on becomes a seat everyone can use
  world.seats = world.seats.filter((s) => !s.id.startsWith('furn-'))
  layout().forEach((_, i) => {
    const s = seatFor(i)
    if (s) world.seats.push(s)
  })
}

function seatFor(i: number): Seat | null {
  const p = layout()[i]
  const f = FDEF[p?.id]
  if (!f?.seat) return null
  const s = depthScale(p.y)
  const h = f.w * s * (aspectOf.get(f.id) ?? 0.7)
  return { id: `furn-${i}`, sit: [p.x, p.y - h * f.seat], stand: world.nav!.nearest([p.x, p.y + 14]) }
}

// furniture that does things
let music: (() => void) | null = null
const lit = new Set<number>()
function useFurniture(i: number, img: HTMLImageElement) {
  const f = FDEF[layout()[i].id]
  if (!f?.use) return false
  if (f.use === 'music') {
    if (music) {
      music()
      music = null
      img.classList.remove('playing')
      toast('Music off', '🎵')
    } else {
      music = startBeat(f.id === 'jukebox' ? 104 : 92)
      img.classList.add('playing')
      toast(f.id === 'jukebox' ? 'The jukebox kicks in 🎶 (press D to dance!)' : 'Dropping the needle… 🎵', '🎶')
    }
  }
  if (f.use === 'light') {
    lit.has(i) ? lit.delete(i) : lit.add(i)
    img.classList.toggle('lit', lit.has(i))
    sfx.tick()
  }
  if (f.use === 'screen') {
    img.classList.toggle('on')
    sfx.ding()
    world.player.say(img.classList.contains('on') ? pick(['Ooh, Broadway highlights 📺', 'The news! Pizza Rat again?', 'Cartoons! 📺']) : 'Off it goes.')
  }
  if (f.use === 'cat') {
    sfx.purr()
    world.player.say(pick(['Prrrrr… 🐈', 'The bodega cat approves.', 'It’s a very good cat.']))
  }
  if (f.use === 'game') {
    world.player.say('One more game… 🕹️')
    setTimeout(() => api.playGame(pick(['slice-factory', 'ferry-captain', 'bagel-counters'])), 500)
  }
  return true
}
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]

function render() {
  if (!layer) return
  layer.innerHTML = ''
  layout().forEach((p, i) => {
    const f = FDEF[p.id]
    if (!f) return
    const interactive = !!(f.seat || f.use)
    const img = el('img', 'furniture' + (editing ? ' editable' : '') + (interactive && !editing ? ' sittable' : '') + (lit.has(i) ? ' lit' : '')) as HTMLImageElement
    img.src = f.src
    img.alt = f.name
    img.draggable = false
    img.onload = () => {
      placeEl(img, f, p.x, p.y, p.flip)
      rebuildNav()
    }
    placeEl(img, f, p.x, p.y, p.flip)
    img.title = editing ? `${f.name}: drag to move, double-click to flip` : f.use ? `${f.name}: click to use` : f.seat ? `${f.name}: click to sit` : f.name
    img.onpointerdown = (e) => {
      if (!editing) return
      e.stopPropagation()
      e.preventDefault()
      startDrag(i, img)
    }
    img.onclick = (e) => {
      if (editing) return
      if (useFurniture(i, img)) return e.stopPropagation()
      const seat = seatFor(i)
      if (!seat) return
      e.stopPropagation()
      sitPlayer(seat)
    }
    img.ondblclick = (e) => {
      if (!editing) return
      e.stopPropagation()
      p.flip = !p.flip
      persist()
      sfx.pop()
      render()
    }
    layer!.append(img)
  })
}

function startDrag(i: number, img: HTMLImageElement) {
  const p = save.furniture[i]
  const f = FDEF[p.id]
  img.classList.add('dragging')
  sfx.pop()
  const move = (e: PointerEvent) => {
    const [x, y] = toStage(e)
    p.x = Math.max(20, Math.min(980, x))
    p.y = Math.max(200, Math.min(550, y))
    placeEl(img, f, p.x, p.y, p.flip)
    img.classList.toggle('to-storage', tray ? e.clientY > tray.getBoundingClientRect().top : false)
  }
  const up = (e: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    img.classList.remove('dragging')
    const inTray = tray ? e.clientY > tray.getBoundingClientRect().top : false
    const walk = world.geo?.walk
    if (inTray || (walk && !inPoly([p.x, p.y], walk) && !f.flat)) {
      save.furniture.splice(i, 1)
      save.storage.push(f.id)
      sfx.whoosh()
      if (!inTray) toast('That doesn’t fit there. Classic New York apartment. Back to storage it goes.', '📦')
    } else sfx.pop()
    persist()
    render()
    renderTray()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// ---------- decorating ----------
let tray: HTMLElement | null = null
let releaseHold: (() => void) | null = null

function renderTray() {
  if (!tray) return
  const counts = save.storage.reduce<Record<string, number>>((a, id) => ((a[id] = (a[id] ?? 0) + 1), a), {})
  tray.innerHTML = `<div class="tray-head"><b>Decorating</b><span>Click an item to place it · drag to move · double-click to flip · drag down here to put away</span></div>`
  const row = el('div', 'tray-row')
  for (const [id, n] of Object.entries(counts)) {
    const f = FDEF[id]
    if (!f) continue
    const b = el('button', 'tray-item', `<img src="${f.src}" alt=""><span>${f.name}</span>${n > 1 ? `<i>×${n}</i>` : ''}`)
    b.onclick = () => {
      const idx = save.storage.indexOf(id)
      if (idx < 0) return
      save.storage.splice(idx, 1)
      const spot = world.nav?.randomPoint() ?? [500, 430]
      save.furniture.push({ id, x: spot[0], y: Math.max(380, spot[1]) })
      persist()
      sfx.pop()
      render()
      renderTray()
      if (save.furniture.length >= 5) api.stamp('homebody')
    }
    row.append(b)
  }
  if (!Object.keys(counts).length) row.append(el('div', 'tray-empty', 'Storage is empty. Get more from the Furniture Catalog →'))
  const shop = el('button', 'btn small', '📖 Furniture Catalog')
  shop.onclick = () => openFurnitureCatalog()
  const done = el('button', 'btn small go', 'Done ✓')
  done.onclick = () => setEditing(false)
  const actions = el('div', 'tray-actions')
  actions.append(shop, done)
  tray.append(row, actions)
}

function setEditing(on: boolean) {
  if (!isHomeRoom(world.room.id) || !isMine()) return
  editing = on
  stage.root.classList.toggle('decorating', on)
  if (on) {
    releaseHold = hold()
    tray = el('div', 'decor-tray')
    stage.root.append(tray)
    renderTray()
    controls?.classList.add('hidden')
  } else {
    tray?.remove()
    tray = null
    releaseHold?.()
    releaseHold = null
    rebuildNav()
    controls?.classList.remove('hidden')
    renderControls()
  }
  render()
}

// ---------- on-screen controls ----------
let controls: HTMLElement | null = null
function renderControls() {
  if (!controls) return
  controls.innerHTML = ''
  const btn = (html: string, title: string, act: () => void, cls = '') => {
    const b = el('button', 'apt-btn ' + cls, html)
    b.title = title
    b.onclick = (e) => {
      e.stopPropagation()
      sfx.click()
      act()
    }
    controls!.append(b)
  }
  if (isMine()) {
    const unread = save.guestbook.filter((g) => !g.read).length + (cloudBook?.entries.filter((g) => !g.read).length ?? 0)
    btn('🛋️<span>Decorate</span>', 'Move & place furniture', () => setEditing(true), 'primary')
    btn('📖<span>Catalog</span>', 'Buy furniture', () => openFurnitureCatalog())
    btn(`📬<span>Guestbook</span>${unread ? `<i>${unread}</i>` : ''}`, 'Notes from visitors', () => openGuestbook())
    btn(`${save.openHouse ? '🎉' : '🚪'}<span>${save.openHouse ? 'Open house: ON' : 'Open house'}</span>`, 'Let friends drop by while you’re home', () => toggleOpenHouse(), save.openHouse ? 'on' : '')
    const likes = save.likes + (cloudBook?.likes ?? 0)
    btn(`❤️<span>${likes}</span>`, 'Likes from visitors', () => toast(`${likes} people have liked your place ❤️`, '❤️'), 'likes')
    btn('🎉<span>Party</span>', 'Throw a party: pick the music, invite friends', () => void import('./houseparty').then((m) => m.openPartyPanel()), 'party')
    btn('🔑<span>Listings</span>', 'StreetCheesy: buy a new place', () => void import('./streetcheesy').then((m) => m.openListings()))
  } else if (owner?.kind === 'resident') {
    const o = owner.r
    const liked = !!save.liked[o.id]
    btn('✍️<span>Sign guestbook</span>', `Leave ${o.name} a note`, () => signGuestbook(o), 'primary')
    btn(`${liked ? '💖' : '🤍'}<span>${likesFor(o)}</span>`, liked ? 'You liked this place' : 'Like this place', () => likePlace(o), liked ? 'on' : '')
    btn('🏠<span>Go home</span>', 'Back to your apartment', () => goHome())
  } else if (owner?.kind === 'player') {
    const pl = owner.place
    btn('✍️<span>Sign guestbook</span>', `Leave ${pl.user.name} a note`, () => signPlayerGuestbook(pl), 'primary')
    btn(`${pl.liked ? '💖' : '🤍'}<span>${pl.likes}</span>`, pl.liked ? 'You liked this place' : 'Like this place', () => likePlayerPlace(pl), pl.liked ? 'on' : '')
    btn('🏠<span>Go home</span>', 'Back to your apartment', () => goHome())
  }
}

// ---------- real players' guestbooks & likes (stored on the server) ----------
function signPlayerGuestbook(pl: PlayerPlace) {
  const p = el('div', 'panel', `<h2>✍️ ${pl.user.name}’s Guestbook</h2><p>Leave a note they’ll see next time they’re home:</p>`)
  const list = el('div', 'choices two')
  const post = async (text: string) => {
    try {
      await rest(`/users/${pl.user.id}/guestbook`, { json: { text } })
      closeOverlay()
      sfx.stamp()
      api.stamp('guestbook')
      bump('signs')
      toast(`Signed ${pl.user.name}’s guestbook`, '✍️')
    } catch (e) {
      toast(e instanceof HttpError && e.status === 429 ? 'You already left a note here recently 💌' : 'Couldn’t sign the guestbook. Try again.', '✍️')
    }
  }
  for (const n of NOTES) {
    const b = el('button', 'btn ghost', n)
    b.onclick = () => void post(n)
    list.append(b)
  }
  const own = el('label', 'gb-write', '<span>Or write your own</span>')
  const input = document.createElement('input')
  input.maxLength = 120
  input.placeholder = 'Your place is…'
  input.onkeydown = (e) => {
    e.stopPropagation()
    if (e.key === 'Enter' && input.value.trim()) void post(input.value.trim())
  }
  const go = el('button', 'btn small go', 'Sign')
  go.onclick = () => input.value.trim() && void post(input.value.trim())
  own.append(input, go)
  p.append(list, own, closeButton())
  openOverlay(p)
}

async function likePlayerPlace(pl: PlayerPlace) {
  if (pl.liked) return toast('You already liked this place 💖', '💖')
  try {
    const r = await rest<{ likes: number }>(`/users/${pl.user.id}/like`, { method: 'POST' })
    pl.liked = true
    pl.likes = r.likes
    sfx.pop()
    confetti(20)
    renderControls()
  } catch {
    toast('Couldn’t like it right now.', '💔')
  }
}

/** Notes and likes from real visitors (online), merged into your guestbook. */
let cloudBook: { entries: { from: PublicUser; text: string; at: number; read: boolean }[]; likes: number } | null = null
async function loadCloudBook() {
  if (!link.account) return
  try {
    cloudBook = await rest('/guestbook')
    renderControls()
  } catch {
    /* offline */
  }
}

const likesFor = (r: Resident) => 4 + (hash('likes' + r.id) % 40) + (save.liked[r.id] ? 1 : 0)

// ---------- guestbooks ----------
const NOTES = ['Love your place! 💖', 'Cozy vibes only ✨', 'Thanks for having me!', '10/10 would visit again', 'Best apartment in Manhattan 🏙️', 'That view though 😍', 'Can I move in? 😂', 'Your taste is impeccable 👌']

function signGuestbook(r: Resident) {
  const p = el('div', 'panel', `<h2>✍️ ${r.name}’s Guestbook</h2><p>Leave a note:</p>`)
  const list = el('div', 'choices two')
  for (const n of NOTES) {
    const b = el('button', 'btn ghost', n)
    b.onclick = () => {
      save.signed[r.id] = Date.now()
      save.stats.signs = (save.stats.signs ?? 0) + 1
      bond(r.id, 1)
      persist()
      closeOverlay()
      sfx.stamp()
      api.stamp('guestbook')
      const host = world.npcs.find((a) => a.resident?.id === r.id)
      host?.emote('cheer', 2)
      host?.say(pick(['Aww, thank you!! 🥹', 'You’re the best!', 'Come back anytime!']))
      toast(`Signed ${r.name}’s guestbook`, '✍️')
    }
    list.append(b)
  }
  p.append(list, closeButton())
  openOverlay(p)
}

function likePlace(r: Resident) {
  if (save.liked[r.id]) return toast('You already liked this place 💖', '💖')
  save.liked[r.id] = Date.now()
  bond(r.id, 0.5)
  persist()
  sfx.pop()
  confetti(20)
  renderControls()
}

function openGuestbook() {
  const p = el('div', 'panel guestbook', `<h2>📬 Your Guestbook</h2>`)
  const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  const entries = [
    ...save.guestbook.map((g) => ({ name: RESIDENT[g.from]?.name ?? 'A visitor', text: g.text, at: g.at, read: !!g.read, real: false })),
    ...(cloudBook?.entries ?? []).map((g) => ({ name: g.from.name, text: esc(g.text), at: g.at, read: g.read, real: true })),
  ].sort((a, b) => b.at - a.at)
  if (!entries.length) p.insertAdjacentHTML('beforeend', '<p class="muted">No notes yet. Turn on <b>Open House</b> and friends will drop by!</p>')
  const list = el('div', 'gb-list')
  for (const g of entries.slice(0, 40)) list.append(el('div', 'gb-entry' + (g.read ? '' : ' new') + (g.real ? ' real' : ''), `<b>${g.name}</b><span>${g.text}</span><small>${timeAgo(g.at)}</small>`))
  save.guestbook.forEach((g) => (g.read = true))
  if (cloudBook?.entries.some((g) => !g.read)) {
    cloudBook.entries.forEach((g) => (g.read = true))
    void rest('/guestbook/read', { method: 'POST' }).catch(() => {})
  }
  persist()
  p.append(list, closeButton())
  openOverlay(p, { onClose: renderControls })
}

function timeAgo(t: number) {
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}

/** While you were out, people stopped by. */
function visitorsWhileAway() {
  const away = Date.now() - (save.lastHome || Date.now())
  save.lastHome = Date.now()
  if (away < 3 * 60 * 1000 || !save.furniture.length) return persist()
  const pool = save.friends.length ? save.friends.map((id) => RESIDENT[id]).filter(Boolean) : RESIDENTS.slice(0, 12)
  const n = Math.min(3, 1 + Math.floor(Math.random() * Math.min(3, away / (10 * 60 * 1000) + 1)))
  for (let i = 0; i < n; i++) {
    const r = pick(pool)
    const f = FDEF[pick(save.furniture).id]
    const text = pick([`Love the ${f?.name.toLowerCase()}!`, `Stopped by. Your ${f?.name.toLowerCase()} is iconic.`, ...NOTES])
    save.guestbook.push({ from: r.id, text, at: Date.now() - Math.random() * away })
    save.likes += Math.random() < 0.6 ? 1 : 0
  }
  persist()
  setTimeout(() => toast(`${n} new guestbook ${n > 1 ? 'notes' : 'note'} while you were out! 📬`, '📬'), 1200)
}

// ---------- open house ----------
let guestTimer = 0
function toggleOpenHouse() {
  save.openHouse = !save.openHouse
  persist()
  renderControls()
  toast(save.openHouse ? 'Open house! Friends will drop by while you’re home 🎉' : 'Open house closed', '🚪')
  guestTimer = 4
}

const GUEST_LINES = ['Nice place!! 😍', 'Is that a {f}?! I need one.', 'So cozy in here.', 'The view from your window!', 'Love what you did with the place ✨', 'Can we put on some music? 🎶']

function guestArrives() {
  const here = new Set(world.npcs.map((a) => a.resident?.id))
  const pool = (save.friends.length ? save.friends : RESIDENTS.map((r) => r.id)).filter((id) => !here.has(id))
  if (!pool.length) return
  const r = RESIDENT[pick(pool)]
  const a = spawnResident(r, { enter: true })
  a.say(`Hi ${save.name}! 👋`)
  setTimeout(() => {
    if (!a.wrap.isConnected) return
    const f = FDEF[save.furniture.length ? pick(save.furniture).id : 'rug']
    a.say(pick(GUEST_LINES).replace('{f}', f?.name.toLowerCase() ?? 'rug'))
    const seats = world.seats.filter((s) => s.id.startsWith('furn-') && ![world.player, ...world.npcs].some((x) => x.seat?.id === s.id))
    if (seats.length && Math.random() < 0.7) {
      const s = pick(seats)
      a.path = world.nav!.path(a.pos, s.stand)
      a.onArrive = () => a.sitOn(s)
    }
  }, 5000)
  setTimeout(() => {
    if (!a.wrap.isConnected) return
    if (Math.random() < 0.8) {
      save.guestbook.push({ from: r.id, text: pick(NOTES), at: Date.now() })
      save.likes += 1
      persist()
      renderControls()
    }
    a.say('Thanks for having me! 👋')
    bond(r.id, 0.5)
    leave(a)
  }, 40000 + Math.random() * 40000)
}

// ---------- room hook (every kind of home shares it) ----------
const homeWord = (room: string) => (room === 'penthouse' ? 'Penthouse' : room === 'loft' ? 'Loft' : 'Apartment')
for (const room of HOME_ROOMS) onRoom(room, homeHook)
function homeHook({ scene }: { scene: HTMLElement }) {
  layer = el('div', 'furniture-layer')
  scene.append(layer)
  lit.clear()
  render()
  setTimeout(() => {
    render()
    rebuildNav()
  }, 400)
  controls = el('div', 'apt-controls')
  stage.root.append(controls)
  renderControls()
  if (owner?.kind === 'resident') {
    const r = owner.r
    world.plate = { name: `${r.name}’s ${homeWord(world.room.id)}`, area: r.bio }
    // the host is home, maybe with a friend
    const host = spawnResident(r, { at: world.nav!.nearest([560, 460]), sit: false })
    host.mob = true
    setTimeout(() => {
      host.emote('wave', 2)
      host.say(pick([`Welcome to my place, ${save.name}! 🏠`, 'Make yourself at home!', 'Oh hi! Come in, come in!']))
      host.mob = false
    }, 900)
    api.stamp('house-call')
    if (Math.random() < 0.5) {
      const pal = RESIDENTS[(hash(r.id) + 7) % RESIDENTS.length]
      if (pal.id !== r.id) spawnResident(pal, { at: world.nav!.nearest([380, 470]) })
    }
  } else if (owner?.kind === 'player') {
    // a real player's place: if they're home, multiplayer brings them in
    world.plate = { name: `${owner.place.user.name}’s ${homeWord(world.room.id)}`, area: owner.place.party ? 'Party! 🎉' : owner.place.openHouse ? 'Open house 🎉' : 'Visiting a friend' }
    api.stamp('house-call')
  } else {
    void loadCloudBook()
    const h = homeOfRoom(world.room.id) ?? HOME.walkup
    world.plate = { name: `My ${h.name}`, area: save.openHouse ? 'Open house 🎉' : h.hood }
    visitorsWhileAway()
    renderControls()
    if (!save.furniture.length && !save.storage.length) {
      save.storage.push('beanbag', 'plant', 'lamp')
      persist()
      setTimeout(() => toast('Housewarming gifts are in storage. Hit <b>Decorate</b> to place them!', '🎁'), 900)
    }
    guestTimer = 6
  }
  const offFrame = onFrame((dt) => {
    if (!isMine() || !save.openHouse || editing) return
    guestTimer -= dt
    if (guestTimer > 0) return
    guestTimer = 18 + Math.random() * 22
    if (world.npcs.filter((a) => !a.leaving).length < 4) guestArrives()
  })
  return () => {
    offFrame()
    if (editing) setEditing(false)
    music?.()
    music = null
    controls?.remove()
    controls = null
    layer = null
    // leaving someone's place takes you back out into the city next time
    if (!isHomeRoom(world.room.id)) owner = null
  }
}

// ---------- catalog ----------
export function openFurniture() {
  if (!isHomeRoom(world.room.id) || !isMine()) return goHome()
  setEditing(!editing)
}

const CATS = ['All', 'Seating', 'Beds', 'Tables & Storage', 'Lights', 'Fun', 'Decor'] as const
let catTab: (typeof CATS)[number] = 'All'

export function openFurnitureCatalog() {
  const mag = el('div', 'catalog furniture-cat')
  const draw = () => {
    const items = FURNITURE.filter((f) => f.shop && (catTab === 'All' || f.cat === catTab))
    mag.innerHTML = `<div class="cat-cover"><div class="cat-masthead">Flatbush Flea</div><div class="cat-tag">Furniture for tiny NYC apartments</div>
      <div class="cat-model furn-hero"><img src="/art/furniture/taxi-bed.png" alt=""></div>
      <div class="cat-wallet"><img src="/art/icons/coin.png" alt=""> ${save.coins}</div><div class="cat-trying">Delivered straight to your storage</div></div>
      <div class="cat-page"><div class="cat-tabs"></div><div class="cat-grid furn"></div></div>`
    const tabs = mag.querySelector('.cat-tabs')!
    for (const c of CATS) {
      const b = el('button', 'cat-tab' + (c === catTab ? ' on' : ''), c)
      b.onclick = () => {
        sfx.click()
        catTab = c
        draw()
      }
      tabs.append(b)
    }
    const grid = mag.querySelector('.cat-grid')!
    for (const f of items) {
      const owned = save.storage.filter((x) => x === f.id).length + save.furniture.filter((x) => x.id === f.id).length
      const card = el('div', 'cat-item', `<div class="cat-icon"><img src="${f.src}" alt=""></div><b>${f.name}</b>${owned ? `<small>You have ${owned}</small>` : ''}`)
      const btn = el('button', 'btn small', `<img src="/art/icons/coin.png" alt=""> ${f.price}`)
      btn.onclick = () => {
        if (!api.spend(f.price, `furniture:${f.id}`)) return toast('Not enough coins. Try a job around town!', '🪙')
        sfx.register()
        save.storage.push(f.id)
        persist()
        toast(`${f.name} is in your storage! Hit Decorate to place it.`, '📦')
        draw()
        renderTray()
      }
      card.append(btn)
      grid.append(card)
    }
    mag.append(closeButton())
  }
  draw()
  openOverlay(mag)
}

