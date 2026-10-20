import { sfx } from '../audio'
import { el } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton, toast } from '../engine/ui'
import { world, goto, guideTo } from '../engine/world'
import { GEO } from '../data/geo'
import { partyOn, PARTY } from '../data/party'

const MAP_W = 1000
const MAP_H = 664

/** Landmarks on the island map. Shapes come from tools/rooms/map.json (traced with SAM). */
const SPOTS: { id: string; label: string; room?: string; soon?: boolean; note?: 'subway' | 'ferry' | 'snack' }[] = [
  { id: 'central-park', label: 'Central Park', room: 'central-park' },
  { id: 'the-met', label: 'The Met', room: 'the-met' },
  { id: 'times-square', label: 'Times Square', room: 'times-square' },
  { id: 'empire-state', label: 'Empire State Building', room: 'empire-deck' },
  { id: 'rockefeller', label: 'Rockefeller Center', room: 'rockefeller' },
  { id: 'grand-central', label: 'Grand Central', room: 'grand-central' },
  { id: 'fifth-ave', label: 'Fifth Avenue', room: 'fifth-ave' },
  { id: 'high-line', label: 'The High Line', room: 'high-line' },
  { id: 'chelsea', label: 'Chelsea Market', room: 'chelsea-market' },
  { id: 'soho', label: 'SoHo', room: 'soho' },
  { id: 'wtc', label: 'One World Trade', soon: true },
  { id: 'chinatown', label: 'Chinatown & Little Italy', room: 'chinatown' },
  { id: 'hotdog', label: 'Hot Dog Cart', note: 'snack' },
  { id: 'brooklyn-bridge', label: 'Brooklyn Bridge', room: 'brooklyn-bridge' },
  { id: 'brooklyn', label: 'Brooklyn', soon: true },
  { id: 'liberty', label: 'Statue of Liberty', note: 'ferry' },
  { id: 'battery-park', label: 'Battery Park Ferry', room: 'battery-park' },
  { id: 'subway-1', label: 'Subway', note: 'subway' },
  { id: 'subway-2', label: 'Subway', note: 'subway' },
  { id: 'subway-3', label: 'Subway', note: 'subway' },
  { id: 'subway-4', label: 'Subway', note: 'subway' },
  { id: 'subway-5', label: 'Subway', note: 'subway' },
]

/** Where each job lives: the map's Jobs tab drops a badge on its neighborhood and, after the trip, an arrow on the spot. */
const JOBS: { title: string; icon: string; spot: string; room: string; obj: string; dx?: number; dy?: number }[] = [
  { title: 'Slice Factory', icon: 'pizza', spot: 'chinatown', room: 'pizza', obj: 'counter' },
  { title: 'Halal Rush', icon: 'gyro', spot: 'fifth-ave', room: 'fifth-ave', obj: 'halal-cart' },
  { title: 'Bagel Counters', icon: 'bagel', spot: 'soho', room: 'coffee', obj: 'counter' },
  { title: 'Showtime!', icon: 'dancer', spot: 'times-square', room: 'subway', obj: 'train' },
  { title: 'Ferry Captain', icon: 'ferry', spot: 'battery-park', room: 'battery-park', obj: 'ferry' },
]
/** the map remembers the last tab you used (Club Penguin's map did) */
let mapTab: 'places' | 'jobs' = 'places'
const ico = (name: string) => `<img class="ji" src="/art/icons/e/${name}.png" alt="" draggable="false">`

interface Shape {
  spot: (typeof SPOTS)[number]
  rect: [number, number, number, number]
  img: HTMLImageElement
  alpha?: { data: Uint8ClampedArray; w: number; h: number }
}

function alphaOf(s: Shape) {
  const run = () => {
    const w = Math.max(1, Math.round(s.img.naturalWidth / 2))
    const h = Math.max(1, Math.round(s.img.naturalHeight / 2))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(s.img, 0, 0, w, h)
    s.alpha = { data: g.getImageData(0, 0, w, h).data, w, h }
  }
  if (s.img.complete && s.img.naturalWidth) run()
  else s.img.addEventListener('load', run, { once: true })
}

export function openMap() {
  const here = world.room.mapSpot ?? world.room.id
  const cut = GEO.map?.cutouts ?? {}
  const card = el('div', 'postcard')
  const art = el('div', 'postcard-art')
  art.innerHTML = '<img src="/art/rooms/map.jpg" alt="Map of Manhattan" draggable="false">'
  const tip = el('div', 'map-tip')
  const shapes: Shape[] = []
  for (const spot of SPOTS) {
    const c = cut[spot.id]
    if (!c) continue
    const [x, y, w, h] = c.rect
    const img = el('img', 'map-cut') as HTMLImageElement
    img.src = `/art/cutouts/map/${spot.id}.png`
    img.alt = ''
    img.draggable = false
    img.style.cssText = `left:${(x / MAP_W) * 100}%;top:${(y / MAP_H) * 100}%;width:${(w / MAP_W) * 100}%;height:${(h / MAP_H) * 100}%`
    art.append(img)
    const s: Shape = { spot, rect: c.rect, img }
    alphaOf(s)
    shapes.push(s)
    if (spot.id === here || (spot.room && spot.room === here)) {
      const pin = el('div', 'you-are-here', '<span>You are here</span>')
      pin.style.cssText = `left:${((x + w / 2) / MAP_W) * 100}%;top:${((y + h * 0.3) / MAP_H) * 100}%`
      art.append(pin)
    }
  }
  // smallest shapes first so kiosks win over the big neighborhoods around them
  shapes.sort((a, b) => a.rect[2] * a.rect[3] - b.rect[2] * b.rect[3])

  const hitAt = (e: PointerEvent | MouseEvent): Shape | null => {
    const b = art.getBoundingClientRect()
    const px = ((e.clientX - b.left) / b.width) * MAP_W
    const py = ((e.clientY - b.top) / b.height) * MAP_H
    for (const s of shapes) {
      const [x, y, w, h] = s.rect
      if (px < x || py < y || px > x + w || py > y + h || !s.alpha) continue
      const ax = Math.floor(((px - x) / w) * s.alpha.w)
      const ay = Math.floor(((py - y) / h) * s.alpha.h)
      if (s.alpha.data[(ay * s.alpha.w + ax) * 4 + 3] > 60) return s
    }
    return null
  }
  let hovered: Shape | null = null
  art.onpointermove = (e) => {
    const s = hitAt(e)
    if (s === hovered) return
    hovered?.img.classList.remove('hover')
    hovered = s
    art.classList.toggle('pointing', !!s)
    if (!s) return tip.classList.remove('show')
    s.img.classList.add('hover')
    const [x, y, w] = s.rect
    tip.textContent = s.spot.soon ? `${s.spot.label} · coming soon 🚧` : s.spot.label
    tip.style.left = `${((x + w / 2) / MAP_W) * 100}%`
    tip.style.top = `${(y / MAP_H) * 100}%`
    tip.classList.add('show')
    sfx.tick()
  }
  art.onpointerleave = () => {
    hovered?.img.classList.remove('hover')
    hovered = null
    tip.classList.remove('show')
  }
  art.onclick = (e) => {
    const s = hitAt(e)
    if (!s) return
    const spot = s.spot
    sfx.click()
    if (spot.soon) return toast(`${spot.label} is still under construction. Very New York of it. 🚧`, '🚧')
    if (spot.note === 'subway') {
      closeOverlay()
      return void import('./subway').then((m) => m.openSubway())
    }
    if (spot.note === 'ferry') {
      closeOverlay()
      toast('Liberty Island is ferry-only. Heading to the dock!', '⛴️')
      return goto('battery-park')
    }
    if (spot.note === 'snack') return toast('A hot dog cart on every corner. Mustard? Obviously.', '🌭')
    // already standing there: say so (the subway does the same) instead of just closing the map
    if (spot.room && spot.room === world.room.id) return toast(`You’re already at ${spot.label}! Fastest commute in New York history. Pick somewhere else to go.`, '📍')
    closeOverlay()
    if (spot.room) goto(spot.room)
  }
  art.append(tip)

  // Places / Jobs tabs: Jobs drops a badge for every job; picking one travels there and points at it
  const jobs = JOBS.filter((j) => cut[j.spot]).map((j) => {
    const [x, y, w, h] = cut[j.spot].rect
    const b = el('button', 'map-job', ico(j.icon)) as HTMLButtonElement
    b.setAttribute('aria-label', `${j.title} · earn coins`)
    b.style.left = `${((x + w / 2) / MAP_W) * 100}%`
    b.style.top = `${((y + h * 0.42) / MAP_H) * 100}%`
    b.onpointerenter = () => {
      hovered?.img.classList.remove('hover')
      hovered = null
      tip.textContent = `${j.title} · earn coins`
      tip.style.left = b.style.left
      tip.style.top = `calc(${b.style.top} - 30px)`
      tip.classList.add('show')
      sfx.tick()
    }
    b.onpointerleave = () => tip.classList.remove('show')
    // keep the map's own place-hover from replacing the job's tip while you're on a badge
    b.onpointermove = (e) => e.stopPropagation()
    b.onclick = (e) => {
      e.stopPropagation()
      sfx.click()
      closeOverlay()
      const point = () => setTimeout(() => guideTo(j.obj), 700)
      if (world.room.id === j.room) point()
      else void goto(j.room).then(point)
    }
    return b
  })
  const tabs = el('div', 'map-tabs')
  const setTab = (t: typeof mapTab) => {
    mapTab = t
    tabs.querySelectorAll('.map-tab').forEach((n) => n.classList.toggle('on', (n as HTMLElement).dataset.tab === t))
    art.classList.toggle('jobs', t === 'jobs')
    jobs.forEach((b) => (t === 'jobs' ? art.append(b) : b.remove()))
  }
  for (const [id, label, icon] of [['places', 'Places', 'liberty'], ['jobs', 'Jobs', 'chef-hat']] as const) {
    const t = el('button', 'map-tab', `${ico(icon)}<span>${label}</span>`)
    t.dataset.tab = id
    t.onclick = (e) => {
      e.stopPropagation()
      sfx.tick()
      setTab(id)
    }
    tabs.append(t)
  }
  art.append(tabs)
  setTab(mapTab)

  if (partyOn()) {
    const party = el('button', 'map-party', '<span>🎃</span><b>Halloween Parade</b><small>Sixth Ave · now!</small>')
    party.onclick = (e) => {
      e.stopPropagation()
      sfx.click()
      closeOverlay()
      goto(PARTY.room)
    }
    art.append(party)
  }

  const home = el('button', 'map-home', '<img src="/art/icons/home.png" alt=""><span>My Place</span>')
  home.onclick = () => {
    sfx.click()
    closeOverlay()
    void import('./apartment').then((m) => m.goHome())
  }
  const note = el('div', 'sticky-note', 'Click where you want to go!')
  card.append(art, note, home, closeButton())
  sfx.whoosh()
  openOverlay(card)
}
