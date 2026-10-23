import { sfx } from '../audio'
import { el } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton, toast } from '../engine/ui'
import { world, goto } from '../engine/world'
import { GEO } from '../data/geo'
import { partyOn, PARTY } from '../data/party'
import { ROOMS } from '../data/rooms'

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
  { id: 'wtc', label: 'One World Trade', room: 'one-world-trade' },
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

/** Places the map art doesn't draw (newer parts of the city): a round pin on the spot, in map coordinates. */
const PINS: { id: string; label: string; room: string; at: [number, number]; icon: string }[] = [
  { id: 'wall-street', label: 'Wall Street', room: 'wall-street', at: [562, 498], icon: '🐂' },
]
/** a place opens on the map as soon as its room exists; until then it's Coming Soon */
const open = (room?: string) => !!room && !!ROOMS[room]

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
      // the pill hangs above this point: keep it inside the frame for landmarks on the top edge (Central Park, the Met)
      pin.style.cssText = `left:${(Math.min(Math.max(x + w / 2, 70), MAP_W - 70) / MAP_W) * 100}%;top:${(Math.max(y + h * 0.3, 52) / MAP_H) * 100}%`
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
  /** a landmark is Coming Soon if it's marked so, or its room doesn't exist yet */
  const soonOf = (spot: (typeof SPOTS)[number]) => !!spot.soon || (!!spot.room && !open(spot.room))
  /**
   * The hover label goes above its landmark, or below it when there's no room above (Central Park and the Met sit at
   * the top edge), and slides sideways to stay inside the map: it's never cut off by the frame.
   */
  const showTip = (text: string, [x, y, w, h]: [number, number, number, number]) => {
    tip.textContent = text
    const aw = art.offsetWidth
    const ah = art.offsetHeight
    const sx = aw / MAP_W
    const sy = ah / MAP_H
    const tw = tip.offsetWidth
    const th = tip.offsetHeight
    const pad = 6
    let top = y * sy - th - pad
    if (top < pad) top = (y + h) * sy + pad
    if (top + th > ah - pad) top = Math.max(pad, (y + h / 2) * sy - th / 2)
    const left = Math.min(Math.max((x + w / 2) * sx - tw / 2, pad), aw - tw - pad)
    tip.style.left = `${left}px`
    tip.style.top = `${top}px`
    tip.classList.add('show')
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
    showTip(soonOf(s.spot) ? `${s.spot.label} (Coming Soon)` : s.spot.label, s.rect)
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
    if (spot.id === 'brooklyn') return toast('Brooklyn is Coming Soon. Club NYC is Manhattan only for now (Brooklyn says it was cool first anyway).', '🚧')
    if (soonOf(spot)) return toast(`${spot.label} is Coming Soon. Still under construction. Very New York of it.`, '🚧')
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

  // newer places as round pins (same hover label and click as the landmarks drawn on the map)
  for (const pin of PINS) {
    if (!open(pin.room)) continue
    const [px, py] = pin.at
    const b = el('button', 'map-pin', `<span>${pin.icon}</span>`) as HTMLButtonElement
    b.setAttribute('aria-label', pin.label)
    b.style.left = `${(px / MAP_W) * 100}%`
    b.style.top = `${(py / MAP_H) * 100}%`
    if (pin.room === here) {
      const you = el('div', 'you-are-here', '<span>You are here</span>')
      you.style.cssText = `left:${(px / MAP_W) * 100}%;top:${((py - 22) / MAP_H) * 100}%`
      art.append(you)
    }
    b.onpointerenter = () => {
      hovered?.img.classList.remove('hover')
      hovered = null
      showTip(pin.label, [px - 22, py - 22, 44, 44])
      sfx.tick()
    }
    b.onpointerleave = () => tip.classList.remove('show')
    b.onpointermove = (e) => e.stopPropagation()
    b.onclick = (e) => {
      e.stopPropagation()
      sfx.click()
      if (pin.room === world.room.id) return toast(`You’re already at ${pin.label}! Fastest commute in New York history. Pick somewhere else to go.`, '📍')
      closeOverlay()
      goto(pin.room)
    }
    art.append(b)
  }

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
