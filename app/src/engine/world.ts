import { NavGrid, inPoly, inRect, dist, type Pt, type Rect } from '../geometry'
import { sfx } from '../audio'
import { save, persist, bump } from '../state'
import { residentsIn, RESIDENT, type Resident } from '../social/residents'
import { STAMPS } from '../data/stamps'
import { Actor, type Seat } from './actor'
import { stage, el, toStage, W } from './stage'
import { ui, toast, showLabel, hideLabel, fadeOut, fadeIn, floatText } from './ui'
import type { Game, ObjDef, RoomDef } from '../types'
import { ROOMS } from '../data/rooms'
import { link, sendTag } from '../net/link'
import { isHomeRoom } from '../data/homes'
import { PARTY, partyOn } from '../data/party'

import { GEO, type Geo } from '../data/geo'
export type { Geo }
export const geoFor = (id: string): Geo | undefined => GEO[id]

// ---------- interactive things in the current room ----------
interface Hit {
  kind: 'cutout' | 'zone' | 'seat' | 'npc'
  id: string
  def?: ObjDef
  rect: Rect
  poly?: Pt[]
  img?: HTMLImageElement
  alpha?: { data: Uint8ClampedArray; w: number; h: number }
  at?: Pt
  z: number
  seat?: Seat
  npc?: Actor
}

type Hook = (ctx: { room: RoomDef; geo: Geo; scene: HTMLElement }) => (() => void) | void
const enterHooks: Record<string, Hook[]> = {}
/** features register per-room extras (billboards, the theater stage, the piano…) */
export function onRoom(id: string, hook: Hook) {
  ;(enterHooks[id] ??= []).push(hook)
}

/** where the toolbar starts (stage y): anything below is under it */
const TOOLBAR_TOP = 500

export const world = {
  room: ROOMS['times-square'] as RoomDef,
  geo: undefined as Geo | undefined,
  nav: undefined as NavGrid | undefined,
  player: undefined as unknown as Actor,
  npcs: [] as Actor[],
  hits: [] as Hit[],
  seats: [] as Seat[],
  flags: {} as Record<string, number>,
  hovered: null as Hit | null,
  cleanup: [] as (() => void)[],
  debug: false,
  api: undefined as unknown as Game,
  /** room hooks can rename the place plate (e.g. "BagelQueen's Apartment") */
  plate: null as null | { name: string; area: string },
}

const PHRASES = [
  'Anyone seen my MetroCard?', 'Best slice in the city. No contest.', 'I’m walkin’ here!', 'Bacon, egg & cheese o’clock.',
  'Who’s going to the Dance Jam?', 'Let’s get halal.', 'Stand clear of the closing doors!', 'This city never sleeps. Neither do the pigeons.',
  'Is that a celebrity?!', 'Fuggedaboutit!', 'My feet hurt. Worth it.', 'Coffee first. Then sightseeing.', 'That pigeon just judged my outfit.',
  'Walking fast counts as cardio.', 'Just saw a rat carry a whole slice. Respect.', '🍕', '🗽', '😎',
]

// ---------- depth & speed ----------
export function depthScale(y: number) {
  const [y0, s0, y1, s1] = world.geo?.depth ?? [300, 0.62, 545, 1]
  const t = Math.max(-0.1, Math.min(1.15, (y - y0) / (y1 - y0)))
  // never shrink people below ~3/4 size: at the back of a room they still need to read as someone
  return Math.max(0.74, s0 + (s1 - s0) * t)
}

// ---------- movement ----------
export function walkTo(p: Pt, then?: () => void) {
  const pl = world.player
  if (!world.nav) return
  if (pl.seat) pl.standUp()
  pl.path = world.nav.path(pl.pos, p)
  pl.onArrive = then ?? null
  if (!pl.path.length) then?.()
  else {
    // other players walk us there with their own copy of the nav grid: one message per click
    const [x, y] = pl.path[pl.path.length - 1]
    link.send({ t: 'm', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })
  }
}

function seatFree(s: Seat) {
  return ![world.player, ...world.npcs].some((a) => a.seat?.id === s.id)
}

export function sitPlayer(seat: Seat) {
  walkTo(seat.stand, () => {
    if (!seatFree(seat)) return world.player.say('Taken! 😅')
    world.player.sitOn(seat)
    link.send({ t: 'st', s: seat.id })
    sfx.pop()
  })
}

// ---------- room building ----------
function loadAlpha(hit: Hit) {
  const img = hit.img!
  const run = () => {
    const w = Math.max(1, Math.round(img.naturalWidth / 2))
    const h = Math.max(1, Math.round(img.naturalHeight / 2))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(img, 0, 0, w, h)
    hit.alpha = { data: g.getImageData(0, 0, w, h).data, w, h }
  }
  if (img.complete && img.naturalWidth) run()
  else img.addEventListener('load', run, { once: true })
}

function zoneRect(z: Rect | Pt[]): { rect: Rect; poly?: Pt[] } {
  if (typeof z[0] === 'number') return { rect: z as Rect }
  const poly = z as Pt[]
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  return { rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], poly }
}

function buildRoom(from?: string) {
  const room = world.room
  const geo = geoFor(room.geo ?? room.id)
  world.geo = geo
  world.cleanup.forEach((f) => f())
  world.cleanup = []
  world.hits = []
  world.seats = []
  world.hovered = null
  stage.scene.innerHTML = ''
  stage.fx.innerHTML = ''
  stage.bg.src = `/art/rooms/${room.bg}.jpg`
  if (!geo) {
    console.warn('no geo for room', room.id)
    world.nav = new NavGrid([[0, 300], [1000, 300], [1000, 548], [0, 548]])
  } else world.nav = new NavGrid(geo.walk, geo.holes ?? [])

  // cutouts (pixel-traced objects)
  const standing: { rect: Rect; z: number }[] = []
  for (const [id, c] of Object.entries(geo?.cutouts ?? {})) {
    const def = room.objects[id]
    const [x, y, w, h] = c.rect
    const img = el('img', 'cutout') as HTMLImageElement
    img.src = `/art/cutouts/${room.geo ?? room.id}/${id}.png`
    img.alt = ''
    img.draggable = false
    img.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`
    const base = c.base ?? y + h
    const z = c.fg ? Math.round(base * 10) : 5
    img.style.zIndex = String(z)
    if (c.fg) standing.push({ rect: [x, y, x + w, y + h], z })
    stage.scene.append(img)
    if (!def && !c.fg) continue
    const hit: Hit = { kind: 'cutout', id, def, rect: [x, y, x + w, y + h], img, at: c.at, z: c.fg ? z : 6 }
    if (def && !def.decor) {
      loadAlpha(hit)
      world.hits.push(hit)
    }
  }
  // invisible zones
  for (const [id, z] of Object.entries(geo?.zones ?? {})) {
    const def = room.zones?.[id] ?? room.objects[id]
    if (!def) continue
    const { rect, poly } = zoneRect(z)
    world.hits.push({ kind: 'zone', id, def, rect, poly, z: 4 })
  }
  // seats
  for (const [id, s] of Object.entries(geo?.seats ?? {})) {
    const stand = s.stand ?? [s.sit[0], s.sit[1] + 18]
    const seat: Seat = { id, sit: s.sit, stand: world.nav.nearest(stand) }
    // a sitter is always drawn in front of the bench/chair/table they're sitting on
    const under = standing.filter(({ rect: [x1, y1, x2, y2] }) => s.sit[0] >= x1 - 4 && s.sit[0] <= x2 + 4 && s.sit[1] >= y1 - 4 && s.sit[1] <= y2 + 4)
    if (under.length) seat.z = Math.max(Math.round((seat.stand[1] - 1) * 10), ...under.map((u) => u.z + 1))
    world.seats.push(seat)
    const r = 24 * depthScale(stand[1])
    // a seat tucked under the toolbar can't be clicked, so it isn't offered as a click target (S still sits you there)
    if (s.sit[1] >= TOOLBAR_TOP - 8) continue
    world.hits.push({ kind: 'seat', id, rect: [s.sit[0] - r, s.sit[1] - r * 1.4, s.sit[0] + r, s.sit[1] + r * 0.6], seat, z: 3, def: { label: 'Sit' } })
  }
  // front-most first; at the same depth the smaller thing wins, so a sailboat on the river or a gate in the rink
  // can still be clicked instead of being swallowed by the big hotspot around it
  const area = (h: Hit) => (h.rect[2] - h.rect[0]) * (h.rect[3] - h.rect[1])
  world.hits.sort((a, b) => b.z - a.z || area(a) - area(b))

  // steam vents
  const vents = [...(room.steam ?? [])]
  const m = room.steamFrom && geo?.cutouts[room.steamFrom]
  if (m) vents.push([m.rect[0] + m.rect[2] / 2, m.rect[1] + m.rect[3] / 2])
  for (const [x, y] of vents) {
    const s = el('div', 'steam', '<i></i><i></i><i></i><i></i>')
    s.style.cssText = `left:${x}px;top:${y}px`
    stage.fx.append(s)
  }

  // player
  const pl = world.player
  pl.seat = null
  pl.path = []
  pl.held = null
  // arrive near the door, not on the exact pixel everyone else arrived on
  const door = arrivalPoint(from)
  pl.pos = world.nav.nearest([door[0] + (Math.random() - 0.5) * 150, door[1] + (Math.random() - 0.5) * 50])
  stage.scene.append(pl.wrap)

  // the people who are actually here right now
  world.npcs = []
  if (!isHomeRoom(room.id)) for (const r of residentsIn(room.id, roomCap(), save.friends)) spawnResident(r)
  refreshTag(pl)

  scatterCoins()
  world.plate = null
  for (const hook of enterHooks[room.id] ?? []) {
    const off = hook({ room, geo: geo ?? { image: room.bg, walk: [[0, 300], [1000, 300], [1000, 548], [0, 548]], cutouts: {} }, scene: stage.scene })
    if (off) world.cleanup.push(off)
  }
  drawDebug()
  builtListeners.forEach((f) => f(room))
}
const builtListeners: ((r: RoomDef) => void)[] = []
/** Fires right after a room's scene is built (before the fade-in) — multiplayer joins here. */
export function onRoomBuilt(f: (r: RoomDef) => void) {
  builtListeners.push(f)
}

function arrivalPoint(from?: string): Pt {
  const geo = world.geo
  const nav = world.nav!
  if (from && geo) {
    // arrive next to whatever leads back to where we came from
    for (const [id, def] of [...Object.entries(world.room.objects), ...Object.entries(world.room.zones ?? {})]) {
      if (def.go !== from) continue
      const c = geo.cutouts[id]
      if (c?.at) return nav.nearest(c.at)
      if (c) return nav.nearest([c.rect[0] + c.rect[2] / 2, c.rect[1] + c.rect[3] + 10])
      const z = geo.zones?.[id]
      if (z) {
        const { rect } = zoneRect(z)
        return nav.nearest([(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2])
      }
    }
  }
  return nav.nearest(geo?.spawn ?? [500, 460])
}

const roomCap = () => world.room.npcs ?? (world.room.indoor ? 2 : 4)
const realPlayers = () => world.npcs.filter((a) => a.remote).length
/** City locals step aside as real players fill a room (but a busy room keeps one or two around). */
const localsCap = () => {
  const real = realPlayers()
  return real ? Math.max(real >= 6 ? 0 : 1, roomCap() - real) : roomCap()
}
/** Real players just arrived: extra locals head for the exits. */
export function trimLocals() {
  if (isHomeRoom(world.room.id)) return
  const locals = world.npcs.filter((a) => a.resident && !a.leaving && !a.mob)
  const extra = locals.length - localsCap()
  if (extra <= 0) return
  locals
    .sort((a, b) => (save.friends.includes(a.resident!.id) ? 1 : 0) - (save.friends.includes(b.resident!.id) ? 1 : 0))
    .slice(0, extra)
    .forEach((a, i) => setTimeout(() => leave(a), 400 + i * 700))
}
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]

/** Where people come and go: exits, doors and stairs in the current room. */
export function exitPoints(): Pt[] {
  const geo = world.geo
  const nav = world.nav!
  const pts: Pt[] = []
  for (const [id, def] of [...Object.entries(world.room.objects), ...Object.entries(world.room.zones ?? {})]) {
    if (!def.go && !/exit|leave/i.test(def.label)) continue
    const c = geo?.cutouts[id]
    if (c?.at) pts.push(nav.nearest(c.at))
    else if (c) pts.push(nav.nearest([c.rect[0] + c.rect[2] / 2, c.rect[1] + c.rect[3] + 10]))
    else {
      const z = geo?.zones?.[id]
      if (z) {
        const { rect } = zoneRect(z)
        pts.push(nav.nearest([(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2]))
      }
    }
  }
  if (!pts.length) pts.push(nav.nearest(geo?.spawn ?? [500, 460]))
  return pts
}

export const titleName = (stampId: string) => STAMPS[stampId]?.name ?? ''

/** name tags show just the name; titles, jobs and teams are on the player card (which also says who's a computer-run local) */
export function refreshTag(a: Actor) {
  if (a.isPlayer) {
    sendTag(save.title, save.team)
    return a.setTag(save.name || 'You')
  }
  if (a.remote) return a.setTag(a.name)
  if (a.resident) a.setTag(a.resident.name)
}

export function spawnResident(r: Resident, opts: { at?: Pt; enter?: boolean; sit?: boolean } = {}): Actor {
  const nav = world.nav!
  const start = opts.enter ? pick(exitPoints()) : (opts.at ?? nav.randomPoint())
  const a = new Actor(r.look, r.name, start)
  a.resident = r
  refreshTag(a)
  world.npcs.push(a)
  stage.scene.append(a.wrap)
  if (opts.enter) {
    a.path = nav.path(a.pos, nav.randomPoint())
    a.next = 3 + Math.random() * 3
  } else if (opts.sit !== false && Math.random() < 0.4) {
    const free = world.seats.filter(seatFree)
    if (free.length) a.sitOn(pick(free))
  }
  return a
}

/** Make sure a resident is in the room (e.g. you came to find a friend). */
export function ensureResident(id: string): Actor | null {
  const have = world.npcs.find((a) => a.resident?.id === id && !a.leaving)
  if (have) return have
  const r = RESIDENT[id]
  return r ? spawnResident(r, { enter: true }) : null
}

export function removeActor(a: Actor) {
  a.wrap.remove()
  world.npcs = world.npcs.filter((n) => n !== a)
}

export function leave(a: Actor) {
  if (a.leaving) return
  a.leaving = true
  a.mob = false
  if (a.seat) a.standUp()
  a.held = null
  a.path = world.nav!.path(a.pos, pick(exitPoints()))
  a.onArrive = () => removeActor(a)
  if (!a.path.length) removeActor(a)
}

/** The city keeps moving: every few seconds people leave and arrive based on their routines. */
function cityTick() {
  if (changing || isHomeRoom(world.room.id) || !world.nav) return
  const want = residentsIn(world.room.id, localsCap(), save.friends)
  const wantIds = new Set(want.map((r) => r.id))
  for (const a of world.npcs) if (a.resident && !wantIds.has(a.resident.id) && !a.mob && !a.leaving && Math.random() < 0.5) leave(a)
  const present = new Set(world.npcs.map((a) => a.resident?.id))
  for (const r of want) {
    if (present.has(r.id) || world.npcs.filter((a) => a.resident && !a.leaving).length >= localsCap() + 1) continue
    if (Math.random() < 0.6) {
      const a = spawnResident(r, { enter: true })
      if (save.friends.includes(r.id)) setTimeout(() => greet(a), 1500)
    }
  }
}

function greet(a: Actor) {
  if (!a.wrap.isConnected) return
  a.emote('wave', 2)
  a.say(pick([`Hey ${save.name}! 👋`, `Oh hi ${save.name}!`, `${save.name}! Fancy seeing you here 😄`]))
}

/** Locals chat one at a time, with a breather between lines: the room murmurs instead of shouting over itself.
 * (Quiet while Rosa's tour is on screen: she's the one talking.) */
let lastChatter = 0
export function chatterOk(gap = 9000) {
  const now = performance.now()
  if (now - lastChatter < gap || stage.root.querySelector('.tour')) return false
  if (world.npcs.some((n) => n.resident && n.bubble.classList.contains('show'))) return false
  lastChatter = now
  return true
}

function npcThink(a: Actor, dt: number) {
  if (a.leaving || a.mob || a.remote) return
  a.next -= dt
  if (a.next > 0 || a.moving) return
  const r = Math.random()
  const nav = world.nav!
  if (a.seat && r < 0.5) {
    a.next = 4 + Math.random() * 6
    return
  }
  if (a.seat) a.standUp()
  if (r < 0.48) {
    a.path = nav.path(a.pos, nav.randomPoint())
    a.next = 2 + Math.random() * 4
  } else if (r < 0.64 && world.seats.some(seatFree)) {
    const s = pick(world.seats.filter(seatFree))
    a.path = nav.path(a.pos, s.stand)
    a.onArrive = () => {
      if (seatFree(s)) a.sitOn(s)
    }
    a.next = 10 + Math.random() * 10
  } else if (r < 0.76) {
    a.emote(pick(['dance', 'wave', 'cheer'] as const), 2.5)
    a.next = 3 + Math.random() * 3
  } else if (r < 0.93 && chatterOk()) {
    const lines = [...PHRASES, ...(world.room.chatter ?? []), ...(a.resident?.lines ?? [])]
    const friend = a.resident && save.friends.includes(a.resident.id)
    a.say(friend && Math.random() < 0.3 ? pick([`${save.name}! Over here! 👋`, 'Want to hang out later?', 'Race you to the subway!']) : pick(lines))
    a.next = 4 + Math.random() * 4
  } else a.next = 2 + Math.random() * 3
}

// ---------- coins on the ground ----------
function scatterCoins() {
  if (isHomeRoom(world.room.id)) return
  const n = Math.random() < 0.7 ? 1 + Math.floor(Math.random() * 2) : 0
  for (let i = 0; i < n; i++) {
    const p = world.nav!.randomPoint()
    if (dist(p, world.player.pos) < 90) continue
    const c = el('button', 'coin', COIN_SVG)
    c.setAttribute('aria-label', 'Coin')
    c.style.cssText = `left:${p[0]}px;top:${p[1]}px;--s:${depthScale(p[1])};z-index:${Math.round(p[1] * 10) - 1}`
    c.dataset.x = String(p[0])
    c.dataset.y = String(p[1])
    c.onclick = (e) => {
      e.stopPropagation()
      if (!ui.busy) walkTo(p)
    }
    stage.scene.append(c)
  }
}
export const COIN_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="#ffd166" stroke="#1d2140" stroke-width="3.5"/><circle cx="20" cy="20" r="10" fill="none" stroke="#e8a317" stroke-width="3"/><path d="M14 13 L18 11" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`

function coinPickup() {
  const p = world.player.pos
  stage.scene.querySelectorAll<HTMLElement>('.coin:not(.got)').forEach((c) => {
    if (Math.hypot(+c.dataset.x! - p[0], +c.dataset.y! - p[1]) < 24) {
      c.classList.add('got')
      setTimeout(() => c.remove(), 500)
      world.api.earn(1, undefined, 'coin')
      floatText('+1', +c.dataset.x!, +c.dataset.y! - 40, 'coin-float')
    }
  })
}

// ---------- hit testing ----------
function hitAt(p: Pt): Hit | null {
  // people first — they're what you most want to click
  let best: Actor | null = null
  for (const a of world.npcs) {
    if (a.leaving) continue
    const s = depthScale(a.pos[1])
    const yy = a.seat ? a.pos[1] + 24 * s : a.pos[1]
    if (p[0] > a.pos[0] - 22 * s && p[0] < a.pos[0] + 22 * s && p[1] > yy - 112 * s && p[1] < yy && (!best || a.pos[1] > best.pos[1])) best = a
  }
  if (best) return { kind: 'npc', id: best.name, rect: [0, 0, 0, 0], z: 0, npc: best }
  for (const h of world.hits) {
    if (!inRect(p, h.rect)) continue
    if (h.kind === 'cutout') {
      const a = h.alpha
      if (!a) continue
      const [x1, y1, x2, y2] = h.rect
      const ax = Math.floor(((p[0] - x1) / (x2 - x1)) * a.w)
      const ay = Math.floor(((p[1] - y1) / (y2 - y1)) * a.h)
      if (a.data[(ay * a.w + ax) * 4 + 3] > 60) return h
    } else if (h.poly) {
      if (inPoly(p, h.poly)) return h
    } else return h
  }
  return null
}

function setHover(h: Hit | null, p: Pt) {
  if (world.hovered?.img) world.hovered.img.classList.remove('hover')
  if (world.hovered?.npc) world.hovered.npc.wrap.classList.remove('hover')
  world.hovered = h
  if (!h) {
    hideLabel()
    stage.root.classList.remove('pointing')
    return
  }
  stage.root.classList.add('pointing')
  if (h.img) h.img.classList.toggle('door', !!h.def?.go)
  if (h.img) h.img.classList.add('hover')
  if (h.npc) h.npc.wrap.classList.add('hover')
  const label = h.kind === 'npc' ? personLabel(h.npc!) : h.def ? (h.def.go ? '🚪 ' : '') + h.def.label + (h.def.soon ? ' · coming soon' : '') : ''
  const top = h.kind === 'npc' ? h.npc!.pos[1] - 120 * depthScale(h.npc!.pos[1]) : h.rect[1]
  if (label) showLabel(label, h.kind === 'npc' ? h.npc!.pos[0] : h.kind === 'seat' ? p[0] : (h.rect[0] + h.rect[2]) / 2, top)
}

function personLabel(a: Actor) {
  if (a.remote) return `${a.name}${link.friends.has(a.remote.id) ? ' ★ friend' : ''}`
  const friend = a.resident && save.friends.includes(a.resident.id)
  return `${a.name}${friend ? ' ★' : ''}${link.account ? ' · city local' : friend ? ' friend' : ''}`
}

function activate(h: Hit, p: Pt) {
  const room = world.room
  if (h.kind === 'npc') return import('../features/playerCard').then((m) => m.npcCard(h.npc!))
  if (h.kind === 'seat') return sitPlayer(h.seat!)
  const def = h.def!
  sfx.click()
  if (def.soon) return toast(`${def.label}: under construction. Very New York of it.`, '🚧')
  if (def.sit) {
    const seats = world.seats.filter(seatFree).sort((a, b) => dist(a.sit, p) - dist(b.sit, p))
    if (seats.length) return sitPlayer(seats[0])
    // every seat is taken: say so instead of doing nothing
    if (!def.act && !def.go) return world.player.say(`Every seat on the ${def.label.toLowerCase()} is taken. I’ll wait my turn.`)
  }
  const fire = () => {
    if (world.room !== room) return
    if (def.go) goto(def.go, room.id)
    else def.act?.(world.api)
  }
  if (def.instant) return fire()
  let at = h.at
  if (!at) {
    const [x1, , x2, y2] = h.rect
    at = [(x1 + x2) / 2, y2 + 10]
  }
  walkTo(at, fire)
}

// ---------- room change ----------
let changing = false
export async function goto(id: string, from?: string) {
  const next = ROOMS[id]
  if (!next || changing) return
  changing = true
  setHover(null, [0, 0])
  sfx.whoosh()
  await fadeOut()
  world.room = next
  save.room = id
  if (!save.visited.includes(id)) save.visited.push(id)
  persist()
  buildRoom(from)
  let finished = false
  let card: HTMLElement | null = null
  const done = () => {
    if (finished) return
    finished = true
    card?.classList.add('out')
    setTimeout(() => card?.remove(), 250)
    fadeIn()
    changing = false
    const f = world.npcs.find((a) => a.resident && save.friends.includes(a.resident.id))
    if (f) setTimeout(() => greet(f), 900)
    roomListeners.forEach((f) => f(next))
    next.onEnter?.(world.api)
  }
  if (stage.bg.complete && stage.bg.naturalWidth) setTimeout(done, 60)
  else {
    stage.bg.onload = stage.bg.onerror = () => {
      stage.bg.onload = stage.bg.onerror = null
      done()
    }
    // a slow load gets a little themed travel card instead of a blank screen (fast loads never see it)
    setTimeout(() => {
      if (finished) return
      card = travelCard(next)
      stage.fade.append(card)
    }, 300)
    setTimeout(done, 4000)
  }
}

/** "Heading to SoHo…" with a taxi, subway car, ferry or door, depending on where you're going */
function travelCard(room: RoomDef): HTMLElement {
  const how = room.indoor ? { icon: '🚪', verb: 'Stepping into' } : room.id === 'subway' ? { icon: '🚇', verb: 'Taking the stairs down to' } : /battery|liberty/.test(room.id) ? { icon: '⛴️', verb: 'Sailing to' } : { icon: '🚕', verb: 'Heading to' }
  return el('div', 'travel-card', `<div class="tc-road"><span class="tc-ride">${how.icon}</span></div><b>${how.verb} ${room.name}…</b><small>${room.area}</small>`)
}
const roomListeners: ((r: RoomDef) => void)[] = []
export function onRoomChange(f: (r: RoomDef) => void) {
  roomListeners.push(f)
}

/**
 * The game's one "go here" signal: a bouncing yellow arrow over a room object (by its id in room.objects)
 * until you walk up to it, click it, leave the room, or it times out. The map's Jobs tab and quests use it.
 */
export function guideTo(objId: string, ms = 9000) {
  const h = world.hits.find((x) => x.id === objId && x.kind !== 'seat')
  if (!h) return
  stage.fx.querySelector('.go-arrow')?.remove()
  const a = el('div', 'go-arrow', '<svg viewBox="0 0 40 48" aria-hidden="true"><path d="M13 3 h14 a3 3 0 0 1 3 3 v15 h7 a2 2 0 0 1 1.4 3.4 L21.4 42.6 a2 2 0 0 1 -2.8 0 L1.6 24.4 A2 2 0 0 1 3 21 h7 V6 a3 3 0 0 1 3 -3 z"/></svg>')
  const [x1, y1, x2, y2] = h.rect
  a.style.left = `${(x1 + x2) / 2}px`
  a.style.top = `${Math.max(56, y1 - 6)}px`
  stage.fx.append(a)
  sfx.pop()
  const stop = () => {
    clearInterval(near)
    clearTimeout(timer)
    a.classList.add('out')
    setTimeout(() => a.remove(), 260)
  }
  const t0 = performance.now()
  const near = window.setInterval(() => {
    if (!a.isConnected) return stop()
    // stays up at least 2.5 s (rooms often drop you right next to it), then clears once you're standing at it
    const p = world.player?.pos
    if (performance.now() - t0 > 2500 && p && !world.player.moving && p[0] > x1 - 20 && p[0] < x2 + 20 && p[1] > y2 - 40 && p[1] < y2 + 60) stop()
  }, 250)
  const timer = window.setTimeout(stop, ms)
  stage.root.addEventListener('pointerdown', () => world.hovered?.id === objId && stop(), { once: true })
}

// ---------- debug overlay ----------
const debugSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
function drawDebug() {
  const geo = world.geo
  debugSvg.setAttribute('viewBox', `0 0 ${W} 565`)
  debugSvg.setAttribute('class', 'debug-layer')
  if (!geo) return (debugSvg.innerHTML = '')
  const poly = (pts: Pt[], fill: string, stroke: string) => `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
  debugSvg.innerHTML =
    poly(geo.walk, 'rgba(0,255,120,.15)', '#0f6') +
    (geo.holes ?? []).map((h) => poly(h, 'rgba(255,0,0,.2)', '#f33')).join('') +
    world.hits.map((h) => `<rect x="${h.rect[0]}" y="${h.rect[1]}" width="${h.rect[2] - h.rect[0]}" height="${h.rect[3] - h.rect[1]}" fill="none" stroke="#f0c" stroke-width="1.2"/>`).join('')
}

// ---------- name tags + bubbles ----------
/** the tag's offset below the feet, in the body's own (unscaled) units — matches .name-tag { top } */
const TAG_TOP = 8
// tags measured before Burbank finished loading were sized in the fallback font: measure again once it's in
document.fonts?.addEventListener('loadingdone', () => [world.player, ...world.npcs].forEach((a) => a && ((a.tagSize = null), (a.bubbleW = 0))))
/**
 * Everyone in the room gets their overhead (name tag + speech bubble) in the overhead layer, stacked by depth like
 * the bodies. Tags that would sit on top of each other slide apart (yours stays put), easing so names don't jump
 * around as people walk past each other.
 */
function placeOverheads(dt: number) {
  const live = new Set<Element>()
  const tags: { a: Actor; l: number; r: number; top: number; h: number }[] = []
  for (const a of [world.player, ...world.npcs]) {
    if (!a?.wrap.isConnected) continue
    live.add(a.overhead)
    if (!a.overhead.isConnected) stage.overhead.append(a.overhead)
    a.overhead.style.zIndex = a.wrap.style.zIndex
    keepBubbleOnStage(a)
    a.tagSize ??= a.tag.offsetWidth ? [a.tag.offsetWidth, a.tag.offsetHeight] : null
    if (!a.tagSize) continue
    const { x, y, s } = a.drawn
    const [w, h] = a.tagSize
    // someone standing at the very front keeps their tag above the toolbar (it rides up onto their shoes)
    tags.push({ a, l: x - (w * s) / 2, r: x + (w * s) / 2, top: Math.min(y + TAG_TOP * s, TOOLBAR_TOP - 3 - h * s), h: h * s })
  }
  for (const n of [...stage.overhead.children]) if (!live.has(n) && !n.classList.contains('depart')) n.remove()
  // yours first, then front to back by where each tag would sit
  tags.sort((p, q) => (p.a === world.player ? -1 : q.a === world.player ? 1 : p.top - q.top))
  const placed: { l: number; r: number; top: number; bottom: number }[] = []
  const floor = TOOLBAR_TOP - 3
  for (const t of tags) {
    // the nearest free spot: where it belongs, or just under / just over a tag already placed beside it
    const clash = (top: number) => placed.some((o) => t.r > o.l - 2 && t.l < o.r + 2 && top < o.bottom + 1 && top + t.h > o.top - 1)
    const spots = [t.top, ...placed.flatMap((o) => [o.bottom + 1, o.top - t.h - 1])].filter((y) => y >= 0 && y + t.h <= floor)
    spots.sort((p, q) => Math.abs(p - t.top) - Math.abs(q - t.top))
    const top = spots.find((y) => !clash(y)) ?? t.top
    placed.push({ l: t.l, r: t.r, top, bottom: top + t.h })
    const s = t.a.drawn.s
    const want = (top - (t.a.drawn.y + TAG_TOP * s)) / s
    const now = t.a.tagNudge + (want - t.a.tagNudge) * Math.min(1, dt * 12)
    if (Math.abs(now - t.a.tagNudge) > 0.02 || (want === 0 && t.a.tagNudge !== 0)) {
      t.a.tagNudge = Math.abs(now - want) < 0.05 ? want : now
      t.a.tag.style.transform = t.a.tagNudge ? `translate(-50%, ${t.a.tagNudge.toFixed(2)}px)` : ''
    }
  }
}

/** a speech bubble near the edge of the stage slides inward (its tail still points at the speaker) */
function keepBubbleOnStage(a: Actor) {
  if (!a.bubble.classList.contains('show')) return
  a.bubbleW ||= a.bubble.offsetWidth
  const { x, s } = a.drawn
  const half = (a.bubbleW * s) / 2
  const m = 6
  const shift = Math.max(0, m - (x - half)) - Math.max(0, x + half - (W - m))
  const v = shift ? `${(shift / s).toFixed(1)}px` : ''
  if (a.bubble.style.getPropertyValue('--bx') !== v) a.bubble.style.setProperty('--bx', v)
}

// ---------- main loop ----------
let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  const ice = world.geo?.ice
  for (const a of [world.player, ...world.npcs]) {
    if (!a) continue
    if (a !== world.player) npcThink(a, dt)
    a.skating = !!ice && !a.seat && inPoly(a.pos, ice)
    const s = depthScale(a.pos[1])
    // ~17% of the stage a second: brisk, but a walk across Times Square is a moment others can watch (Club Penguin: ~13%)
    const speed = (a.skating ? 260 : 170) * (0.4 + 0.6 * s) * (a.isPlayer || a.remote ? 1 : 0.75)
    a.update(dt, speed, s)
    a.wrap.style.zIndex = String(a.seat?.z ?? Math.round(a.depthY * 10))
  }
  placeOverheads(dt)
  if (world.player?.moving) coinPickup()
  frameListeners.forEach((f) => f(dt))
  requestAnimationFrame(frame)
}
const frameListeners: ((dt: number) => void)[] = []
export function onFrame(f: (dt: number) => void) {
  frameListeners.push(f)
  return () => {
    const i = frameListeners.indexOf(f)
    if (i >= 0) frameListeners.splice(i, 1)
  }
}

// ---------- boot ----------
export function startWorld(player: Actor, api: Game) {
  world.player = player
  world.api = api
  // the parade room only exists while the Halloween party is on
  if (save.room === PARTY.room && !partyOn()) save.room = 'times-square'
  world.room = ROOMS[save.room] ?? ROOMS['times-square']
  stage.root.append(debugSvg)
  buildRoom()

  stage.root.addEventListener('pointermove', (e) => {
    if (ui.busy) return setHover(null, [0, 0])
    const p = toStage(e)
    const h = hitAt(p)
    if (h !== world.hovered) setHover(h, p)
  })
  stage.root.addEventListener('pointerleave', () => setHover(null, [0, 0]))
  stage.scene.addEventListener('click', (e) => {
    if (ui.busy) return
    const p = toStage(e)
    // Rosa's walking step: every click on the ground walks (a local standing near the glowing spot shouldn't
    // turn "try walking" into opening their card)
    const h = stage.root.querySelector('.tour-spot') ? null : hitAt(p)
    if (!save.stats.walks || !save.stats.clicks) bump(h ? 'clicks' : 'walks')
    if (world.debug) {
      console.log(`[${Math.round(p[0])}, ${Math.round(p[1])}]`)
      toast(`[${Math.round(p[0])}, ${Math.round(p[1])}]`, '📐')
    }
    if (h) activate(h, p)
    else walkTo(p)
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === '`') {
      world.debug = !world.debug
      stage.root.classList.toggle('debug', world.debug)
    }
  })
  requestAnimationFrame(frame)
  setInterval(cityTick, 6000)
}

export { buildRoom }
