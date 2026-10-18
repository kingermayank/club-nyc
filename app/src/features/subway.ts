import { sfx } from '../audio'
import { save, persist, bump } from '../state'
import { el, stage } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton, hold, toast } from '../engine/ui'
import { world, goto } from '../engine/world'
import { AvatarView } from '../avatar/render'
import { randomLook } from '../avatar/random'
import { api } from '../game'
import * as geo from '../data/manhattan'

type Pt = [number, number]
const { project } = geo

interface Station {
  room: string
  name: string
  place: string
  /** Map position: the station's real lat/lon through the map projection (src/data/manhattan.ts). */
  at: Pt
  lines: string[]
  /** Which side of the dot the label goes, plus an optional nudge (map px) — nudged labels get a leader line. */
  label: { side: 'l' | 'r'; dx?: number; dy?: number }
}

const LINES: Record<string, { color: string; dark?: boolean }> = {
  '1': { color: '#EE352E' }, '2': { color: '#EE352E' }, '3': { color: '#EE352E' },
  '4': { color: '#00933C' }, '5': { color: '#00933C' }, '6': { color: '#00933C' },
  '7': { color: '#B933AD' },
  A: { color: '#0039A6' }, C: { color: '#0039A6' }, E: { color: '#0039A6' },
  B: { color: '#FF6319' }, D: { color: '#FF6319' }, F: { color: '#FF6319' }, M: { color: '#FF6319' },
  N: { color: '#FCCC0A', dark: true }, Q: { color: '#FCCC0A', dark: true }, R: { color: '#FCCC0A', dark: true }, W: { color: '#FCCC0A', dark: true },
  S: { color: '#808183' }, J: { color: '#996633' }, Z: { color: '#996633' }, L: { color: '#A7A9AC' },
}

// Real station positions (lat/lon), so the dots sit where they are in Manhattan.
const STATIONS: Station[] = [
  { room: 'the-met', name: '86 St', place: 'The Met', at: project(40.7795, -73.9555), lines: ['4', '5', '6'], label: { side: 'r' } },
  { room: 'central-park', name: '59 St–Columbus Circle', place: 'Central Park', at: project(40.7681, -73.9819), lines: ['1', 'A', 'C', 'B', 'D'], label: { side: 'l' } },
  { room: 'fifth-ave', name: '5 Av/59 St', place: 'Fifth Avenue', at: project(40.7648, -73.9732), lines: ['N', 'R', 'W'], label: { side: 'r', dx: 18 } },
  { room: 'rockefeller', name: '47–50 Sts–Rockefeller Ctr', place: 'Rockefeller Center', at: project(40.7586, -73.9813), lines: ['B', 'D', 'F', 'M'], label: { side: 'l', dx: -24, dy: -4 } },
  { room: 'subway', name: 'Times Sq–42 St', place: 'Times Square', at: project(40.7553, -73.9869), lines: ['1', '2', '3', '7', 'N', 'Q', 'R', 'W', 'S'], label: { side: 'l', dx: -10, dy: 6 } },
  { room: 'grand-central', name: 'Grand Central–42 St', place: 'Grand Central', at: project(40.7527, -73.9772), lines: ['4', '5', '6', '7', 'S'], label: { side: 'r' } },
  { room: 'empire-deck', name: '34 St–Herald Sq', place: 'Empire State Building', at: project(40.7497, -73.9879), lines: ['B', 'D', 'F', 'M', 'N', 'Q', 'R', 'W'], label: { side: 'l', dx: -24, dy: 16 } },
  { room: 'high-line', name: '14 St', place: 'The High Line', at: project(40.74, -74.0021), lines: ['1', '2', '3', 'A', 'C', 'E', 'L'], label: { side: 'l' } },
  { room: 'soho', name: 'Prince St', place: 'SoHo', at: project(40.7243, -73.9977), lines: ['N', 'R', 'W', '6'], label: { side: 'r', dy: -5 } },
  { room: 'chinatown', name: 'Canal St', place: 'Chinatown', at: project(40.719, -74.0002), lines: ['J', 'Z', 'N', 'Q', 'R', 'W', '6'], label: { side: 'r', dy: 3 } },
  { room: 'brooklyn-bridge', name: 'Brooklyn Bridge–City Hall', place: 'Brooklyn Bridge', at: project(40.7132, -74.0042), lines: ['4', '5', '6', 'J', 'Z'], label: { side: 'r', dx: 14, dy: 40 } },
  { room: 'battery-park', name: 'South Ferry', place: 'Battery Park', at: project(40.7019, -74.0131), lines: ['1', 'R', 'W'], label: { side: 'l', dx: -2, dy: 3 } },
]
const byRoom = (r: string) => STATIONS.find((s) => s.room === r)!

/** Real places where a line bends between stops (no stop drawn there). */
const BENDS: Record<string, Pt> = {
  '57 St–7 Av': project(40.7647, -73.9807), // N/R/W run west under 60 St, then down 7 Av
  'Church St': project(40.7152, -74.0092), // R/W swing west of City Hall
  'Rector St': project(40.7073, -74.0134), // 1 and R/W run side by side down to the ferry
}
const pos = (id: string) => BENDS[id] ?? byRoom(id).at

/** Each route: station rooms (stops) and BENDS names, uptown to downtown. */
const ROUTES: { line: string; via: string[]; shift?: number }[] = [
  { line: '1', via: ['central-park', 'subway', 'high-line', 'Rector St', 'battery-park'] },
  { line: 'N', via: ['fifth-ave', '57 St–7 Av', 'subway', 'empire-deck', 'soho', 'chinatown', 'Church St', 'Rector St', 'battery-park'] },
  { line: '6', via: ['the-met', 'grand-central', 'soho', 'chinatown', 'brooklyn-bridge'] },
  // 6 Av line runs one avenue east of Times Sq: nudge it a hair east so it clears that dot.
  { line: 'B', via: ['central-park', 'rockefeller', 'empire-deck'], shift: 3 },
  { line: 'S', via: ['subway', 'grand-central'] },
]

const bullet = (l: string, size = 18) => {
  const c = LINES[l]
  return `<span class="bullet" style="background:${c.color};color:${c.dark ? '#1d2140' : '#fff'};width:${size}px;height:${size}px;font-size:${size * 0.62}px">${l}</span>`
}

/** Which station you're "at" for the current room (shops map to their neighborhood station). */
function hereRoom(): string {
  const r = world.room
  const exact = STATIONS.find((s) => s.room === r.id)
  if (exact) return exact.room
  const bySpot: Record<string, string> = {
    'times-square': 'subway', 'fifth-ave': 'fifth-ave', soho: 'soho', chinatown: 'chinatown', 'high-line': 'high-line',
    'central-park': 'central-park', 'the-met': 'the-met', rockefeller: 'rockefeller', 'grand-central': 'grand-central',
    'empire-state': 'empire-deck', 'brooklyn-bridge': 'brooklyn-bridge', 'battery-park': 'battery-park', liberty: 'battery-park',
  }
  return bySpot[r.mapSpot ?? ''] ?? 'subway'
}

const f1 = (n: number) => Math.round(n * 10) / 10
const fp = (p: Pt) => `${f1(p[0])},${f1(p[1])}`
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** Where two (offset) segments meet; falls back to the gap's midpoint when they're parallel. */
function meet(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt {
  const mid = lerp(a2, b1, 0.5)
  const d1: Pt = [a2[0] - a1[0], a2[1] - a1[1]]
  const d2: Pt = [b2[0] - b1[0], b2[1] - b1[1]]
  const den = d1[0] * d2[1] - d1[1] * d2[0]
  if (Math.abs(den) < 1e-6) return mid
  const t = ((b1[0] - a1[0]) * d2[1] - (b1[1] - a1[1]) * d2[0]) / den
  const p: Pt = [a1[0] + d1[0] * t, a1[1] + d1[1] * t]
  return dist(p, mid) > 12 ? mid : p
}

/**
 * Each route as one smooth path: lines sharing a stop-to-stop segment run side by side
 * (the one coming from further west takes the west track), and every bend is rounded.
 */
function routePaths(): { line: string; d: string }[] {
  const GAP = 6.5
  const pts = ROUTES.map((r) => r.via.map(pos))
  const key = (a: string, b: string) => [a, b].sort().join('|')
  const users = new Map<string, number[]>()
  ROUTES.forEach((r, ri) => r.via.slice(1).forEach((v, i) => {
    const k = key(r.via[i], v)
    users.set(k, [...(users.get(k) ?? []), ri])
  }))
  const meanX = pts.map((p) => p.reduce((s, q) => s + q[0], 0) / p.length)
  return ROUTES.map((r, ri) => {
    const p = pts[ri]
    const segs = p.slice(1).map((b, i) => {
      const a = p[i]
      const order = [...(users.get(key(r.via[i], r.via[i + 1])) ?? [ri])].sort((x, y) => meanX[x] - meanX[y])
      const east = (order.indexOf(ri) - (order.length - 1) / 2) * GAP + (r.shift ?? 0)
      const len = dist(a, b) || 1
      const n: Pt = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len] // points east when heading downtown
      const o = b[1] >= a[1] ? east : -east
      return [[a[0] + n[0] * o, a[1] + n[1] * o], [b[0] + n[0] * o, b[1] + n[1] * o]] as [Pt, Pt]
    })
    const corners: Pt[] = [segs[0][0]]
    for (let i = 1; i < segs.length; i++) corners.push(meet(segs[i - 1][0], segs[i - 1][1], segs[i][0], segs[i][1]))
    corners.push(segs[segs.length - 1][1])
    let d = `M${fp(corners[0])}`
    for (let i = 1; i < corners.length - 1; i++) {
      const [a, c, b] = [corners[i - 1], corners[i], corners[i + 1]]
      const rad = Math.min(14, dist(a, c) * 0.45, dist(c, b) * 0.45)
      d += `L${fp(lerp(c, a, rad / (dist(a, c) || 1)))}Q${fp(c)} ${fp(lerp(c, b, rad / (dist(c, b) || 1)))}`
    }
    return { line: r.line, d: d + `L${fp(corners[corners.length - 1])}` }
  })
}

/** The Brooklyn Bridge, anchorage to anchorage, as a little cartoon span. */
function bridge(): string {
  const a = project(40.71, -73.999)
  const b = project(40.7022, -73.9913)
  const [t1, t2] = [lerp(a, b, 0.27), lerp(a, b, 0.73)]
  const up = (p: Pt, h: number): Pt => [p[0], p[1] - h]
  const sag = lerp(up(t1, 8), up(t2, 8), 0.5)
  return `<g class="sw-bridge">
    <path class="sw-bridge-deck" d="M${fp(a)}L${fp(b)}"/>
    <path class="sw-bridge-cable" d="M${fp(a)}L${fp(up(t1, 8))}Q${fp([sag[0], sag[1] + 7])} ${fp(up(t2, 8))}L${fp(b)}"/>
    ${[t1, t2].map((t) => `<rect class="sw-bridge-tower" x="${f1(t[0] - 2.5)}" y="${f1(t[1] - 10)}" width="5" height="12" rx="1.5"/>`).join('')}
  </g>`
}

export function openSubway() {
  const here = hereRoom()
  const p = el('div', 'subway-board')
  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  const W = geo.MAP_W, H = geo.MAP_H
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.classList.add('subway-map')
  const isles = geo.MANHATTAN + geo.ROOSEVELT + geo.GOVERNORS + geo.LIBERTY + geo.ELLIS
  const cp = [project(40.7681, -73.9819), project(40.7644, -73.973), project(40.7968, -73.9493), project(40.8005, -73.958)]
  const cpLabel = lerp(lerp(cp[1], cp[2], 0.5), lerp(cp[0], cp[3], 0.5), 0.5)
  const [lx, ly] = geo.LIBERTY_AT
  const gov = project(40.6886, -74.0176)
  const routes = routePaths()
  let leaders = ''
  svg.innerHTML = `
    <defs>
      <pattern id="sw-water" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0 8 Q4 4 8 8 T16 8" fill="none" stroke="#9fd2ef" stroke-width="1.6"/></pattern>
      <clipPath id="sw-frame"><rect width="${W}" height="${H}" rx="18"/></clipPath>
      <path id="sw-hudson" d="${geo.HUDSON_GUIDE}"/><path id="sw-east" d="${geo.EAST_GUIDE}"/>
    </defs>
    <g clip-path="url(#sw-frame)">
      <rect width="${W}" height="${H}" fill="#bfe3f7"/><rect width="${W}" height="${H}" fill="url(#sw-water)"/>
      <path class="sw-far" d="${geo.NEW_JERSEY}${geo.BROOKLYN_QUEENS}${geo.BRONX}${geo.RANDALLS}"/>
      <path class="sw-ground" d="${isles}" transform="translate(0 4)"/>
      <path class="sw-land" d="${isles}"/>
      <path class="sw-cp" d="${geo.CENTRAL_PARK}"/>
      <path class="sw-pond" d="${geo.CP_WATER}"/>
      <text class="sw-park" x="${f1(cpLabel[0])}" y="${f1(cpLabel[1])}" text-anchor="middle" dominant-baseline="central" transform="rotate(-90 ${f1(cpLabel[0])} ${f1(cpLabel[1])})">CENTRAL PARK</text>
      <text class="sw-river"><textPath href="#sw-hudson" startOffset="50%" text-anchor="middle">HUDSON RIVER</textPath></text>
      <text class="sw-river"><textPath href="#sw-east" startOffset="50%" text-anchor="middle">EAST RIVER</textPath></text>
      <text class="sw-boro" x="24" y="380" text-anchor="middle" transform="rotate(-90 24 380)">NEW JERSEY</text>
      <text class="sw-boro" x="420" y="150" text-anchor="middle">QUEENS</text>
      <text class="sw-boro" x="402" y="500" text-anchor="middle">BROOKLYN</text><image href="/art/icons/e/construction.png" x="440" y="486" width="18" height="18"><title>Coming soon</title></image>
      <text class="sw-small" x="${f1(gov[0] + 20)}" y="${f1(gov[1] + 36)}" text-anchor="middle">Governors Is.</text>
      ${bridge()}
      <image href="/art/icons/e/liberty.png" x="${lx - 12}" y="${ly - 20}" width="24" height="24"/>
      <text class="sw-boro sw-liberty" x="${lx}" y="${ly + 17}" text-anchor="middle">LIBERTY</text>
    </g>`
  const leaderPath = document.createElementNS(svgNS, 'path')
  leaderPath.classList.add('sw-leader')
  svg.append(leaderPath)
  for (const r of routes) {
    const casing = document.createElementNS(svgNS, 'path')
    casing.setAttribute('d', r.d)
    casing.classList.add('sw-casing')
    svg.append(casing)
  }
  for (const r of routes) {
    const path = document.createElementNS(svgNS, 'path')
    path.setAttribute('d', r.d)
    path.setAttribute('stroke', LINES[r.line].color)
    path.classList.add('sw-line')
    svg.append(path)
  }
  for (const s of STATIONS) {
    const g = document.createElementNS(svgNS, 'g')
    g.classList.add('stop')
    if (s.room === here) g.classList.add('here')
    const [x, y] = s.at.map(f1)
    const { side, dx = 0, dy = 0 } = s.label
    const left = side === 'l'
    const tx = f1(x + (left ? -13 : 13) + dx)
    const ty = f1(y + dy)
    if (Math.hypot(dx, dy) > 4) {
      const end: Pt = [tx + (left ? 3 : -3), ty + 1]
      const a = Math.atan2(end[1] - y, end[0] - x)
      leaders += `M${fp([x + Math.cos(a) * 9, y + Math.sin(a) * 9])}L${fp(end)}`
    }
    const anchor = left ? 'end' : 'start'
    g.innerHTML = `<circle class="sw-hit" cx="${x}" cy="${y}" r="14"/>${s.room === here ? `<circle class="sw-ring" cx="${x}" cy="${y}" r="9"/>` : ''}
      <circle class="sw-dot" cx="${x}" cy="${y}" r="8"/>
      <text x="${tx}" y="${ty - 1}" text-anchor="${anchor}" class="stop-name">${s.place}</text>
      <text x="${tx}" y="${ty + 11}" text-anchor="${anchor}" class="stop-sub">${s.name}</text>`
    g.addEventListener('click', () => {
      sfx.click()
      if (s.room === here) return toast('You’re already at this station!', '📍')
      closeOverlay()
      ride(s)
    })
    g.addEventListener('mouseenter', () => {
      sfx.tick()
      info.innerHTML = `<b>${s.place}</b><span>${s.name}</span><div class="sw-bullets">${s.lines.map((l) => bullet(l)).join('')}</div>`
    })
    svg.append(g)
  }
  leaderPath.setAttribute('d', leaders)
  const side = el('div', 'sw-side')
  side.innerHTML = `<div class="sw-title"><span class="mta">M</span><div><b>Club NYC Subway</b><small>Uptown · Downtown · All Night</small></div></div>`
  const info = el('div', 'sw-info', `<b>Where to?</b><span>Hover a station, click to ride.</span>`)
  const legend = el('div', 'sw-legend', ['1', 'N', '6', 'B', 'S'].map((l) => `<div>${bullet(l, 20)}<span>${{ 1: 'Broadway–7 Av Local', N: 'Broadway Express', 6: 'Lexington Av Local', B: '6 Av Express', S: '42 St Shuttle' }[l]}</span></div>`).join(''))
  side.append(info, legend, el('div', 'sw-tip', '🎵 Tip: board the train at Times Sq for <b>Showtime</b> and dance for tips!'))
  p.append(svg, side, closeButton())
  openOverlay(p)
}

// ---------- the ride ----------
const WINDOWS: [number, number, number, number][] = [
  [46, 172, 334, 298],
  [416, 184, 486, 294],
  [517, 184, 587, 294],
  [666, 172, 955, 298],
]
const SEATS: [number, number][] = [[72, 392], [158, 392], [238, 392], [318, 392], [690, 392], [776, 392], [866, 392], [948, 392]]

export function ride(s: Station) {
  const release = hold()
  const from = byRoom(hereRoom())
  const line = s.lines.find((l) => from.lines.includes(l)) ?? s.lines[0]
  const firstRide = !save.stats['rides']
  bump('rides')
  const car = el('div', 'ride-car')
  car.innerHTML = `<img src="/art/rooms/subway-car.jpg" class="ride-bg" alt="">
    ${WINDOWS.map(([x1, y1, x2, y2]) => `<div class="ride-window" style="left:${x1}px;top:${y1}px;width:${x2 - x1}px;height:${y2 - y1}px"><i class="streaks"></i><i class="station-wall"><span>${s.name}</span></i></div>`).join('')}
    <div class="ride-led"><span class="led-text">${bullet(line, 18)} ${line} train · Next stop: ${s.name}</span></div>
    <div class="ride-people"></div>
    <div class="ride-caption"></div>`
  stage.root.append(car)
  const people = car.querySelector<HTMLElement>('.ride-people')!
  const views: AvatarView[] = []
  const seats = [...SEATS].sort(() => Math.random() - 0.5)
  const addRider = (look: ReturnType<typeof randomLook>, i: number, isMe = false) => {
    const v = new AvatarView(look, 0.66)
    v.setPose('sit')
    const [x, y] = seats[i]
    const w = el('div', 'ride-rider' + (isMe ? ' me' : ''))
    w.style.cssText = `left:${x}px;top:${y + 22}px`
    w.append(v.el)
    people.append(w)
    views.push(v)
  }
  addRider(save.look, 0, true)
  for (let i = 1; i < 4 + Math.floor(Math.random() * 3); i++) addRider(randomLook(0.7), i)
  let raf = 0
  let last = performance.now()
  const loop = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000)
    last = t
    views.forEach((v) => v.update(dt))
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  const caption = car.querySelector<HTMLElement>('.ride-caption')!
  const say = (t: string) => {
    caption.innerHTML = t
    caption.classList.remove('show')
    void caption.offsetWidth
    caption.classList.add('show')
  }

  const steps: [number, () => void][] = [
    [0, () => {
      sfx.chime()
      say(firstRide ? '“Please swipe again… at this turnstile.” <small>Classic. You made it on.</small>' : '“Stand clear of the closing doors, please.”')
    }],
    [900, () => {
      car.classList.add('moving')
      sfx.train()
    }],
    [2000, () => say(`🚇 ${bullet(line, 16)} to <b>${s.place}</b>`)],
    [3600, () => {
      car.classList.remove('moving')
      car.classList.add('arriving')
      sfx.ding()
      say(`“This is <b>${s.name}</b>.”`)
    }],
    [4700, () => {
      car.classList.add('out')
      api.stamp('straphanger')
      bump('rides')
      goto(s.room)
      persist()
    }],
    [5300, () => {
      cancelAnimationFrame(raf)
      car.remove()
      release()
    }],
  ]
  for (const [t, f] of steps) setTimeout(f, t)
}
