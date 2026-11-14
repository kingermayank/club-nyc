import './flea.css'
import { sfx, startBeat } from '../audio'
import { save, persist, bump, type PlacedFurniture } from '../state'
import { NavGrid, inPoly, clampToPoly, type Pt } from '../geometry'
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
import { avatarMarkup } from '../avatar/render'
import { ART_FURNITURE } from '../data/souvenirs'
import { mountLights, setLights, type Light } from './homeLights'
import { hm } from '../sound/home'

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
  use?: 'music' | 'screen' | 'light' | 'cat' | 'game' | 'plant'
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
  { id: 'plant', name: 'Monstera', price: 20, w: 78, src: '/art/furniture/plant.png', use: 'plant', cat: 'Decor', shop: true },
  { id: 'water-tower', name: 'Water Tower Planter', price: 75, w: 104, src: '/art/furniture/water-tower.png', use: 'plant', cat: 'Decor', shop: true },
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
  // friends' doors are open to each other; everyone else's is closed
  if (!save.friends.includes(r.id)) return toast(`${r.name}’s door is closed. Be friends first!`, '🚪')
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
/**
 * Furniture was drawn small next to the room's own fridge, stove and people (the user, 2026-11-13: "proportionally
 * very small"): everything placed in a home is this much bigger than its listed width. Rugs grow a little less.
 */
const FURN_SCALE = 1.4
const fw = (f: FurnitureDef) => f.w * (f.flat ? 1.2 : FURN_SCALE)

const aspectOf = new Map<string, number>()

function aspect(f: FurnitureDef, img: HTMLImageElement) {
  const r = img.naturalWidth ? img.naturalHeight / img.naturalWidth : aspectOf.get(f.id) ?? 0.8
  aspectOf.set(f.id, r)
  return r
}

function placeEl(node: HTMLImageElement, f: FurnitureDef, x: number, y: number, flip?: boolean) {
  const s = depthScale(y)
  const w = fw(f) * s
  const h = w * aspect(f, node)
  node.style.cssText = `left:${x - w / 2}px;top:${y - h}px;width:${w}px;height:${h}px;z-index:${f.flat ? 4 : Math.round(y * 10)};transform:${flip ? 'scaleX(-1)' : 'none'}`
}

function footprint(f: FurnitureDef, x: number, y: number): Pt[] {
  const s = depthScale(y)
  const hw = fw(f) * s * 0.42
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
  const h = fw(f) * s * (aspectOf.get(f.id) ?? 0.7)
  return { id: `furn-${i}`, sit: [p.x, p.y - h * f.seat], stand: world.nav!.nearest([p.x, p.y + 14]) }
}

// ---------- furniture that does things ----------
/**
 * Lamps. Each has a pull chain: off, its shade goes cold (art/furniture/<id>-off.png, tools/furniture/light_states.py)
 * and the room goes to evening around whatever is still lit (homeLights.ts). `head` is how far up the piece the
 * bulb is; `tint` the colour of its light.
 */
const LAMPS: Record<string, { head: number; tint: string }> = {
  lamp: { head: 0.85, tint: '255, 204, 118' },
  'torch-lamp': { head: 0.9, tint: '255, 172, 80' },
  'street-lamp': { head: 0.74, tint: '255, 226, 164' },
}
/** light through the glass, by home: sunset over the East Village, daylight on a SoHo street, dusk up high */
const WINDOW_TINT: Record<string, string> = { apartment: '255, 168, 110', loft: '214, 226, 255', brownstone: '255, 214, 150', penthouse: '176, 204, 255', 'sky-residence': '255, 170, 120' }
const sizeOf = (p: PlacedFurniture) => {
  const f = FDEF[p.id]
  const s = depthScale(p.y)
  const w = fw(f) * s
  return { s, w, h: w * (aspectOf.get(f.id) ?? 1) }
}
/**
 * Lights painted into the rooms themselves (traced out of the painting like any other cutout): they switch like a
 * lamp. `at` is where the bulbs are, `floor` how far down the room the light lands.
 */
const FIXTURES: Record<string, Record<string, { at: Pt; reach: number; floor: number; tint: string }>> = {
  brownstone: { chandelier: { at: [500, 76], reach: 300, floor: 440, tint: '255, 216, 156' } },
  loft: { pendants: { at: [835, 126], reach: 270, floor: 400, tint: '255, 222, 170' } },
  'sky-residence': { pendants: { at: [935, 100], reach: 250, floor: 330, tint: '255, 200, 130' } },
}
/** the brownstone's hearth: where the fire sits in the grate */
const HEARTH: Record<string, Pt> = { brownstone: [229.5, 367] }
/**
 * What is switched in this home: your own is kept with your save (stats `off:<room>:<light>`, `fire:<room>`),
 * someone else's only for the visit.
 */
let visitSwitches: Record<string, number> = {}
const switches = () => (isMine() ? save.stats : visitSwitches)
const fixtureOff = (id: string) => !!switches()[`off:${world.room.id}:${id}`]
const fireLit = () => !!switches()[`fire:${world.room.id}`]
const cutoutEl = (id: string) => stage.scene.querySelector<HTMLElement>(`img.cutout[src$="/${id}.png"]`)

/** Click a ceiling light: it switches, like a lamp. */
export function switchFixture(id: string) {
  if (!FIXTURES[world.room.id]?.[id]) return
  const key = `off:${world.room.id}:${id}`
  switches()[key] = switches()[key] ? 0 : 1
  if (isMine()) persist()
  hm.chain()
  refreshLights()
}
/** Click the fireplace: light the fire, or put it out. */
export function lightFire() {
  if (!HEARTH[world.room.id]) return
  const key = `fire:${world.room.id}`
  switches()[key] = switches()[key] ? 0 : 1
  if (isMine()) persist()
  switches()[key] ? hm.fire() : hm.fireOut()
  refreshLights()
}
let fireEl: HTMLElement | null = null
function drawFire() {
  const at = HEARTH[world.room.id]
  const lit = !!at && fireLit()
  if (!lit) {
    fireEl?.remove()
    fireEl = null
    return
  }
  if (fireEl?.isConnected) return
  // the fire, then the grate's own brass bars back over it so it sits IN the basket
  fireEl = el('div', 'home-fire', `<i></i><img src="/art/cutouts/${world.room.id}/grate.png" alt="" draggable="false">`)
  fireEl.style.cssText = `left:${at[0] - 27}px;top:${at[1] - 52}px`
  stage.scene.append(fireEl)
}

/** the neon sign that was switched on a moment ago (it stutters as it catches) */
let struck: PlacedFurniture | null = null

/** Work out what is giving light in this home right now and hand it to the lighting layer. */
function refreshLights() {
  const items = layout()
  const out: Light[] = []
  for (const p of items) {
    if (!FDEF[p.id]) continue
    const { s, w, h } = sizeOf(p)
    const side = p.flip ? 1 : -1
    const lamp = LAMPS[p.id]
    if (lamp && !p.off) {
      out.push({ x: p.x, y: p.y - h * lamp.head, rx: 235 * s, tint: lamp.tint, glow: 0.62 })
      // and its pool on the floor
      out.push({ x: p.x, y: p.y + 4, rx: 215 * s, ry: 66 * s, tint: lamp.tint, power: 0.85, glow: 0.4 })
    }
    if (p.id === 'neon' && !p.off) out.push({ x: p.x, y: p.y - h * 0.5, rx: 175 * s, ry: 145 * s, tint: '255, 84, 214', power: 0.8, glow: 0.6, strike: p === struck })
    if (p.id === 'tv' && p.on) out.push({ x: p.x + side * w * 0.2, y: p.y - h * 0.66, rx: 190 * s, ry: 150 * s, tint: '120, 204, 255', power: 0.78, glow: 0.55, flicker: 'tv' })
    if (p.id === 'arcade') out.push({ x: p.x, y: p.y - h * 0.62, rx: 80 * s, tint: '130, 160, 255', power: 0.6, glow: 0.25 })
    if (p.id === 'jukebox') out.push({ x: p.x, y: p.y - h * 0.55, rx: 115 * s, tint: '255, 190, 96', power: 0.7, glow: 0.3 })
  }
  // what the room itself has: the window, and what it throws on the floor
  const cut = world.geo?.cutouts ?? {}
  const tint = WINDOW_TINT[world.room.id] ?? '255, 200, 150'
  for (const key of ['window', 'view']) {
    const r = cut[key]?.rect
    if (!r) continue
    out.push({ x: r[0] + r[2] / 2, y: r[1] + r[3] / 2, rx: r[2] * 0.7, ry: r[3] * 0.74, tint, power: 1 })
    out.push({ x: r[0] + r[2] / 2, y: r[1] + r[3] + 95, rx: r[2] * 0.62, ry: 80, tint, power: 0.5, glow: 0.3 })
  }
  // the lights painted into the room, and the fire
  let fixtureDark = false
  for (const [id, f] of Object.entries(FIXTURES[world.room.id] ?? {})) {
    const off = fixtureOff(id)
    cutoutEl(id)?.classList.toggle('unlit', off)
    if (off) {
      fixtureDark = true
      continue
    }
    out.push({ x: f.at[0], y: f.at[1], rx: f.reach, ry: f.reach * 0.8, tint: f.tint, glow: 0.45 })
    out.push({ x: f.at[0], y: f.floor, rx: f.reach * 0.95, ry: 90, tint: f.tint, power: 0.8, glow: 0.3 })
  }
  drawFire()
  const hearth = HEARTH[world.room.id]
  if (hearth && fireLit()) {
    out.push({ x: hearth[0], y: hearth[1] - 22, rx: 150, ry: 130, tint: '255, 150, 70', power: 0.95, glow: 0.6, flicker: 'fire' })
    out.push({ x: hearth[0], y: hearth[1] + 62, rx: 190, ry: 62, tint: '255, 150, 70', power: 0.7, glow: 0.45, flicker: 'fire' })
  }
  // decorating is done with the lights up
  setLights(!editing && (fixtureDark || items.some((p) => LAMPS[p.id] && p.off)), out)
}

/** A heart off the cat, a note off the record: one glyph that rises from a piece and is gone. */
function puff(p: PlacedFurniture, glyph: string, cls = '') {
  if (!layer) return
  const { w, h } = sizeOf(p)
  const n = el('span', 'furn-puff ' + cls, glyph)
  n.style.left = `${p.x + (Math.random() - 0.5) * w * 0.4 - 8}px`
  n.style.top = `${p.y - h - 14}px`
  n.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 40)}px`)
  // beside the furniture, not in with it: switching a lamp redraws the pieces and would take the heart with them
  layer.parentElement?.append(n)
  setTimeout(() => n.remove(), 1600)
}
const again = (img: HTMLElement, cls: string) => {
  img.classList.remove(cls)
  void img.offsetWidth
  img.classList.add(cls)
}

let music: (() => void) | null = null
/** the piece the music is coming from */
let playing: PlacedFurniture | null = null
function useFurniture(i: number, img: HTMLImageElement) {
  const p = layout()[i]
  const f = FDEF[p.id]
  if (!f?.use) return false
  again(img, 'tapped')
  const keep = () => isMine() && persist()
  if (f.use === 'music') {
    if (music) {
      music()
      music = null
      render()
    } else {
      const stop = startBeat(f.id === 'jukebox' ? 104 : 92)
      const notes = window.setInterval(() => puff(p, Math.random() < 0.5 ? '♪' : '♫'), 650)
      puff(p, '♪')
      music = () => (stop(), window.clearInterval(notes))
      playing = p
      img.classList.add('playing')
    }
  }
  if (f.use === 'light') {
    p.off = !p.off
    keep()
    if (p.id === 'neon') {
      p.off ? sfx.tick() : hm.neon()
      struck = p.off ? null : p
    } else hm.chain()
    render()
    if (struck) layer?.querySelectorAll<HTMLElement>('img.furniture')[i]?.classList.add('striking')
    struck = null
  }
  if (f.use === 'screen') {
    p.on = !p.on
    keep()
    p.on ? hm.tvOn() : hm.tvOff()
    render()
    if (p.on) world.player.say(pick(['Ooh, Broadway highlights 📺', 'The news! Pizza Rat again?', 'Cartoons! 📺']))
  }
  if (f.use === 'cat') {
    sfx.purr()
    puff(p, '♥', 'heart')
    world.player.say(pick(['Prrrrr… 🐈', 'The bodega cat approves.', 'It’s a very good cat.']))
  }
  if (f.use === 'plant') {
    hm.rustle()
    again(img, 'rustle')
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
    const img = el('img', 'furniture' + (editing ? ' editable' : '') + (interactive && !editing ? ' sittable' : '') + (p.id === 'neon' && p.off ? ' unlit' : '') + (music && playing === p ? ' playing' : '')) as HTMLImageElement
    img.src = LAMPS[p.id] && p.off ? f.src.replace('.png', '-off.png') : f.src
    img.alt = f.name
    img.draggable = false
    // the TV's tube, lit, lies over the glass of the painted set and goes wherever the set goes
    const tube = p.id === 'tv' && p.on ? el('div', 'furn-fx', '<i class="furn-tube"></i>') : null
    const seat = () => {
      placeEl(img, f, p.x, p.y, p.flip)
      if (tube) tube.style.cssText = img.style.cssText.replace(/z-index:\s*(\d+)/, (_, z) => `z-index:${+z + 1}`)
    }
    img.onload = () => {
      seat()
      rebuildNav()
      refreshLights()
    }
    seat()
    img.title = editing ? `${f.name}: drag to move, double-click to flip` : f.use ? `${f.name}: click to use` : f.seat ? `${f.name}: click to sit` : f.name
    img.onpointerdown = (e) => {
      if (!editing) return
      e.stopPropagation()
      e.preventDefault()
      startDrag(i, img, e)
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
    if (tube) layer!.append(tube)
  })
  refreshLights()
}

/**
 * Drag a placed piece. It stays under the cursor where you took hold of it (it used to jump so that you were holding
 * its feet), it slides along the edge of the floor instead of being rejected when you go past it, and letting go
 * over the strip at the bottom puts it back in storage. `grab` overrides where on the piece you're holding it, as a
 * share of its height above its feet (pieces pulled out of the strip are held by the middle).
 */
function startDrag(i: number, img: HTMLImageElement, e0: PointerEvent, grab?: number) {
  const p = save.furniture[i]
  const f = FDEF[p.id]
  const [sx, sy] = toStage(e0)
  // where the cursor is relative to the piece's feet, kept for the whole drag
  const h0 = fw(f) * depthScale(p.y) * (aspectOf.get(f.id) ?? 0.7)
  const off: Pt = grab === undefined ? [p.x - sx, p.y - sy] : [0, h0 * grab]
  const walk = world.geo?.walk
  img.classList.add('dragging')
  stage.root.classList.add('furn-dragging')
  sfx.pop()
  const overTray = (e: PointerEvent) => (tray ? e.clientY > tray.getBoundingClientRect().top : false)
  const move = (e: PointerEvent) => {
    const [x, y] = toStage(e)
    let at: Pt = [Math.max(20, Math.min(980, x + off[0])), Math.max(200, Math.min(550, y + off[1]))]
    // things that stand on the floor stay on the floor; rugs can go anywhere
    if (walk && !f.flat && !inPoly(at, walk)) at = clampToPoly(at, walk)
    p.x = at[0]
    p.y = at[1]
    placeEl(img, f, p.x, p.y, p.flip)
    img.classList.toggle('to-storage', overTray(e))
  }
  const up = (e: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    img.classList.remove('dragging')
    stage.root.classList.remove('furn-dragging')
    if (overTray(e)) {
      save.furniture.splice(i, 1)
      save.storage.push(f.id)
      sfx.whoosh()
    } else sfx.pop()
    persist()
    render()
    renderTray()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  move(e0)
}

// ---------- decorating ----------
let tray: HTMLElement | null = null
let releaseHold: (() => void) | null = null

function renderTray() {
  if (!tray) return
  const counts = save.storage.reduce<Record<string, number>>((a, id) => ((a[id] = (a[id] ?? 0) + 1), a), {})
  // one slim strip along the bottom, so the floor stays free to arrange things on
  tray.innerHTML = ''
  tray.title = 'Click to place, drag to move, double-click to flip'
  const row = el('div', 'tray-row')
  for (const [id, n] of Object.entries(counts)) {
    const f = FDEF[id]
    if (!f) continue
    const b = el('button', 'tray-item', `<img src="${f.src}" alt="" draggable="false">${n > 1 ? `<i>×${n}</i>` : ''}`)
    b.title = f.name
    b.setAttribute('aria-label', f.name)
    // take it out of storage and onto the floor at `at`; returns its place in the room's list
    const takeOut = (at: Pt): number => {
      const idx = save.storage.indexOf(id)
      if (idx < 0) return -1
      save.storage.splice(idx, 1)
      save.furniture.push({ id, x: at[0], y: at[1] })
      persist()
      render()
      if (save.furniture.length >= 5) api.stamp('homebody')
      return save.furniture.length - 1
    }
    // press and pull it out into the room, or just click to have it set down for you
    b.onpointerdown = (e0) => {
      if (e0.button !== 0) return
      // (without this the browser starts its own drag of the little picture and the pointer events stop coming)
      e0.preventDefault()
      let pulled = false
      const pull = (e: PointerEvent) => {
        if (pulled || Math.hypot(e.clientX - e0.clientX, e.clientY - e0.clientY) < 7) return
        pulled = true
        stop()
        const [x, y] = toStage(e)
        const i = takeOut([x, Math.max(210, y)])
        const img = layer?.lastElementChild as HTMLImageElement | null
        if (i < 0 || !img) return
        b.classList.add('gone')
        startDrag(i, img, e, 0.5)
      }
      const stop = () => {
        window.removeEventListener('pointermove', pull)
        window.removeEventListener('pointerup', stop)
      }
      window.addEventListener('pointermove', pull)
      window.addEventListener('pointerup', stop)
      b.onclick = () => {
        if (pulled) return
        const spot = world.nav?.randomPoint() ?? [500, 430]
        if (takeOut([spot[0], Math.max(380, spot[1])]) < 0) return
        sfx.pop()
        renderTray()
      }
    }
    row.append(b)
  }
  if (!Object.keys(counts).length) row.append(el('div', 'tray-empty', 'Storage is empty'))
  const shop = el('button', 'btn small', '📖 Catalog')
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
  const btn = (html: string, title: string, act: () => void, cls = '', name = '') => {
    const b = el('button', 'apt-btn ' + cls, html)
    b.title = title
    // its name for screen readers: the small label under the icon (or what the count means)
    const label = b.querySelector('span')?.textContent ?? ''
    b.setAttribute('aria-label', name || (/^\d*$/.test(label) ? title : label))
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
    // the door, always (the party popper is Party's): open shows as a lit button with a green dot
    btn('🚪<span>Open House</span>', 'Let friends drop by while you’re home', () => toggleOpenHouse(), save.openHouse ? 'on open' : '')
    controls.lastElementChild!.setAttribute('aria-pressed', String(save.openHouse))
    const likes = save.likes + (cloudBook?.likes ?? 0)
    btn(`❤️<span>${likes}</span>`, 'Likes from visitors', () => toast(`${likes} ${likes === 1 ? 'person likes' : 'people like'} your place`, '❤️'), 'likes', `${likes} ${likes === 1 ? 'like' : 'likes'}`)
    btn('🎉<span>Party</span>', 'Throw a party: pick the music, invite friends', () => void import('./houseparty').then((m) => m.openPartyPanel()), 'party')
    btn('🔑<span>Listings</span>', 'StreetCheesy: buy a new place', () => void import('./streetcheesy').then((m) => m.openListings()))
  } else if (owner?.kind === 'resident') {
    const o = owner.r
    const liked = !!save.liked[o.id]
    btn('✍️<span>Sign Guestbook</span>', `Leave ${o.name} a note`, () => signGuestbook(o), 'primary')
    btn(`${liked ? '💖' : '🤍'}<span>${likesFor(o)}</span>`, liked ? 'You liked this place' : 'Like this place', () => likePlace(o), liked ? 'on' : '')
    btn('🏠<span>Go Home</span>', 'Back to your apartment', () => goHome())
  } else if (owner?.kind === 'player') {
    const pl = owner.place
    btn('✍️<span>Sign Guestbook</span>', `Leave ${pl.user.name} a note`, () => signPlayerGuestbook(pl), 'primary')
    btn(`${pl.liked ? '💖' : '🤍'}<span>${pl.likes}</span>`, pl.liked ? 'You liked this place' : 'Like this place', () => likePlayerPlace(pl), pl.liked ? 'on' : '')
    btn('🏠<span>Go Home</span>', 'Back to your apartment', () => goHome())
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
const homeWord = (room: string) => (room === 'penthouse' ? 'Penthouse' : room === 'loft' ? 'Loft' : room === 'brownstone' ? 'Brownstone' : room === 'sky-residence' ? 'Sky Residence' : 'Apartment')
for (const room of HOME_ROOMS) onRoom(room, homeHook)
/** Invite a local friend over: they get a text and answer; a yes means they come by next time you're home. */
export function inviteOver(r: Resident) {
  void import('../social/friendAsks').then((m) => m.inviteOver(r))
}
function homeHook({ scene }: { scene: HTMLElement }) {
  layer = el('div', 'furniture-layer')
  scene.append(layer)
  const lightsOut = mountLights()
  if (owner) visitSwitches = {}
  fireEl = null
  render()
  setTimeout(() => {
    render()
    rebuildNav()
  }, 400)
  controls = el('div', 'apt-controls')
  stage.root.append(controls)
  renderControls()
  // your place: anyone you invited over comes in the door and says hi
  if (!owner && save.guestsComing?.length) {
    const list = save.guestsComing.map((id) => RESIDENT[id]).filter(Boolean)
    save.guestsComing = []
    persist()
    list.forEach((r, i) =>
      setTimeout(() => {
        const g = spawnResident(r, { enter: true })
        setTimeout(() => (g.emote('wave', 2), g.say(pick([`Thanks for having me, ${save.name}!`, 'Nice place! 🏠', 'I brought snacks. Kidding. 🥨']))), 1800)
      }, 700 + i * 900),
    )
  }
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
    lightsOut()
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

/** what a piece does, in two or three words (shown on its tag in the showroom) */
const does = (f: FurnitureDef) =>
  f.use === 'music' ? 'Plays music' : f.use === 'screen' ? 'Turns on' : f.use === 'light' ? 'Lights up' : f.use === 'cat' ? 'Cats love it' : f.use === 'game' ? 'Playable' : f.seat ? 'You can sit on it' : f.flat ? 'Goes on the floor' : ''
const CAT_ICON: Record<(typeof CATS)[number], string> = { All: '🏷️', Seating: '🛋️', Beds: '🛏️', 'Tables & Storage': '🗄️', Lights: '💡', Fun: '🕹️', Decor: '🪴' }
let catPick = ''

/**
 * Flatbush Flea, the furniture stall. The left side is the showroom floor: the piece you've picked stands there at
 * its real size next to you, with its tag (what it does, what it costs, how many you own) and the Buy button. The
 * right side is the stall's tables: everything for sale, each with a price tag hanging off it.
 */
export function openFurnitureCatalog() {
  const mag = el('div', 'catalog furniture-cat flea')
  const draw = () => {
    const items = FURNITURE.filter((f) => f.shop && (catTab === 'All' || f.cat === catTab))
    const pick = items.find((f) => f.id === catPick) ?? items[0]
    catPick = pick?.id ?? ''
    const have = (f: FurnitureDef) => save.storage.filter((x) => x === f.id).length + save.furniture.filter((x) => x.id === f.id).length
    const me = `<svg viewBox="-60 -185 120 192" aria-hidden="true">${avatarMarkup(save.look)}</svg>`
    // the showroom shows the piece at the size it will be in your room (stage px, before the room's depth)
    const showW = pick ? Math.min(210, fw(pick) * 0.92) : 0
    mag.innerHTML = `<div class="cat-cover fl-stall">
        <div class="fl-awning"></div>
        <div class="cat-masthead">Flatbush Flea</div>
        <div class="cat-wallet"><img src="/art/icons/coin.png" alt=""> ${save.coins}</div>
        <div class="fl-floor"><div class="fl-me">${me}</div>${pick ? `<img class="fl-piece${pick.flat ? ' flat' : ''}" src="${pick.src}" alt="" style="width:${showW}px">` : ''}</div>
        ${pick ? `<div class="fl-tag"><b>${pick.name}</b><small>${[does(pick), have(pick) ? `You have ${have(pick)}` : ''].filter(Boolean).join('<i></i>') || pick.cat}</small></div>
        <button class="btn go fl-buy" type="button"><img src="/art/icons/coin.png" alt=""> ${pick.price}<span>Buy</span></button>` : ''}
      </div>
      <div class="cat-page"><div class="cat-tabs fl-tabs"></div><div class="cat-grid furn fl-grid"></div></div>`
    const tabs = mag.querySelector('.cat-tabs')!
    for (const c of CATS) {
      const b = el('button', 'cat-tab' + (c === catTab ? ' on' : ''), `<i>${CAT_ICON[c]}</i>${c}`)
      b.onclick = () => {
        sfx.click()
        catTab = c
        draw()
      }
      tabs.append(b)
    }
    const grid = mag.querySelector('.cat-grid')!
    const buy = (f: FurnitureDef) => {
      if (!api.spend(f.price, `furniture:${f.id}`)) return toast('Not enough coins. Try a job around town!', '🪙')
      sfx.register()
      save.storage.push(f.id)
      persist()
      toast(`${f.name} is in your storage`, '📦')
      draw()
      renderTray()
    }
    for (const f of items) {
      const owned = have(f)
      const card = el('button', 'fl-item' + (f.id === catPick ? ' on' : ''), `<span class="fl-pic"><img src="${f.src}" alt=""></span><b>${f.name}</b><span class="fl-price"><img src="/art/icons/coin.png" alt="">${f.price}</span>${owned ? `<em>×${owned}</em>` : ''}`) as HTMLButtonElement
      card.type = 'button'
      card.onclick = () => {
        sfx.click()
        catPick = f.id
        draw()
      }
      card.ondblclick = () => buy(f)
      grid.append(card)
    }
    const buyBtn = mag.querySelector<HTMLButtonElement>('.fl-buy')
    if (buyBtn && pick) buyBtn.onclick = () => buy(pick)
    // keep the picked piece in view after a redraw
    grid.querySelector('.fl-item.on')?.scrollIntoView({ block: 'nearest' })
    mag.append(closeButton())
  }
  draw()
  openOverlay(mag)
}
