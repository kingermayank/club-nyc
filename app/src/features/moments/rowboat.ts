import './rowboat.css'
import { sfx } from '../../audio'
import { persist, save } from '../../state'
import { el } from '../../engine/stage'
import { world } from '../../engine/world'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { SKINS } from '../../avatar/look'
import { closeX, cutoutImg, hint, openMoment, pick, pointer, shout, sparks } from './kit'

/**
 * The Rowboats, Central Park: you actually row. A boat pushes off the dock on the real lake in the room; click the
 * water on either side of it and that oar pulls (left, right, left keeps you straight, the same side twice turns you
 * away from it). Go under Bow Bridge, come back to the dock, mind the ducks. The clock is the only score.
 * Keys: Left / Right (or A / D) are the two oars. 3 coins a trip, as the old card charged.
 */

/** the water, traced off the room painting (stage px) */
const LAKE: Pt[] = [[304, 166], [372, 152], [400, 146], [600, 147], [640, 160], [652, 178], [652, 224], [690, 236], [698, 262], [596, 262], [586, 238], [540, 229], [500, 238], [490, 257], [438, 257], [406, 238], [384, 214], [362, 200], [304, 186]]
/** the three ducks painted on the lake: they do not move for anyone */
const PAINTED: { id: string; at: Pt }[] = [{ id: 'duck-1', at: [488, 186] }, { id: 'duck-2', at: [432, 203] }, { id: 'duck-3', at: [458, 213] }]
const ARCH: [number, number] = [430, 578] // the opening under the bridge, x range
const DOCK: Pt = [598, 238]
const START: Pt = [545, 206]
const SQUASH = 0.62 // the lake is seen from a low angle: circles are ellipses

const inside = (p: Pt, poly: Pt[]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const depth = (y: number) => 0.74 + ((Math.min(262, Math.max(140, y)) - 140) / 122) * 0.36

export function rowTheLake(g: Game) {
  if (world.room.id !== 'central-park') return
  if (!g.spend(3, 'rowboat')) return
  const m = openMoment('mo-row')
  const bridge = cutoutImg('bridge')
  const skin = SKINS[save.look.skin] ?? SKINS[2]

  const boat = el('div', 'rw-boat', `<svg viewBox="0 0 64 34" width="64" height="34">
    <g class="rw-oar" data-side="-1"><path d="M30 5 L30 -19" stroke="#1d2140" stroke-width="5.5" stroke-linecap="round"/><path d="M30 5 L30 -19" stroke="#d9a35a" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="30" cy="-22" rx="4.5" ry="7" fill="#f0c27a" stroke="#1d2140" stroke-width="2.5"/></g>
    <g class="rw-oar" data-side="1"><path d="M30 29 L30 53" stroke="#1d2140" stroke-width="5.5" stroke-linecap="round"/><path d="M30 29 L30 53" stroke="#d9a35a" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="30" cy="56" rx="4.5" ry="7" fill="#f0c27a" stroke="#1d2140" stroke-width="2.5"/></g>
    <path d="M3 9 Q3 3 9 3 L38 3 Q57 6 62 17 Q57 28 38 31 L9 31 Q3 31 3 25 Z" fill="#d8402f" stroke="#1d2140" stroke-width="3" stroke-linejoin="round"/>
    <path d="M9 9 L37 8 Q50 10 54 17 Q50 24 37 26 L9 25 Z" fill="#8f4a2b" stroke="#1d2140" stroke-width="2"/>
    <rect x="13" y="8" width="6" height="18" fill="#e0b070" stroke="#1d2140" stroke-width="1.6"/><rect x="40" y="10" width="5" height="14" fill="#e0b070" stroke="#1d2140" stroke-width="1.6"/>
    <ellipse cx="29" cy="17" rx="5.5" ry="9.5" fill="#e5483b" stroke="#1d2140" stroke-width="2"/>
    <circle cx="29" cy="17" r="6.2" fill="${skin}" stroke="#1d2140" stroke-width="2"/><path d="M23.4 15 A6 6 0 0 1 34.6 15 Q29 11.5 23.4 15 Z" fill="#6b3d1e" transform="rotate(-90 29 17)"/>
  </svg>`)
  const oars = [...boat.querySelectorAll<SVGGElement>('.rw-oar')]
  const guides = [el('i', 'rw-guide'), el('i', 'rw-guide')]
  const goal = el('i', 'rw-goal')
  const clock = el('div', 'rw-clock', '<b>0.0</b>')
  const time = clock.querySelector<HTMLElement>('b')!
  clock.append(closeX(m))
  m.root.append(goal, ...guides, boat, clock)
  const tip = hint(m, 'Left, right, left!', [START[0], START[1] - 34])

  // two ducks with somewhere to be, across your way out and your way back
  interface Duck { n: HTMLImageElement; x: number; y: number; vx: number; lo: number; hi: number; hop: number }
  const ducks: Duck[] = [
    { x: 420, y: 168, vx: 13 + Math.random() * 9, lo: 408, hi: 592 },
    { x: 660, y: 250, vx: -(8 + Math.random() * 6), lo: 640, hi: 688 },
  ].map((d) => {
    const n = el('img', 'rw-duck') as HTMLImageElement
    n.src = '/art/cutouts/central-park/duck-1.png'
    n.alt = ''
    n.draggable = false
    m.root.append(n)
    return { ...d, n, hop: 0 }
  })

  let x = START[0]
  let y = START[1]
  let th = Math.PI // heading west, away from the dock
  let v = 0
  let w = 0
  let swing = [0, 0] // each oar's pull, 1 → 0
  let last = 0 // -1 port, 1 starboard: which oar pulled last
  let started = false
  let secs = 0
  let leg: 'out' | 'under' | 'back' | 'done' = 'out'
  let under = 0
  let bumps = 0
  let thud = 0
  const hitPainted = new Set<string>()

  const place = (n: HTMLElement, at: Pt, extra = '') => (n.style.transform = `translate(${at[0]}px, ${at[1]}px) ${extra}`)
  const setGoal = (at: Pt, s: number) => place(goal, at, `scale(${s})`)
  setGoal([(ARCH[0] + ARCH[1]) / 2, 154], 0.8)

  function stroke(side: -1 | 1) {
    if (leg === 'under' || leg === 'done') return
    const i = side === -1 ? 0 : 1
    if (swing[i] > 0.35) return
    if (!started) {
      started = true
      tip.remove()
    }
    swing[i] = 1
    // alternating is a clean pull; the same oar twice mostly turns you
    const clean = last !== side
    v = Math.min(38, v + (clean ? 15 : 8))
    w += -side * (clean ? 1.55 : 2.5)
    last = side
    sfx.whoosh()
    const nx = -Math.sin(th) * side
    const ny = Math.cos(th) * side
    ripple([x + nx * 27 * depth(y), y + ny * 27 * SQUASH * depth(y)])
  }

  function ripple(at: Pt) {
    const r = el('i', 'rw-ripple')
    place(r, at, `scale(${depth(at[1])})`)
    r.style.setProperty('--s', String(depth(at[1])))
    m.root.append(r)
    setTimeout(() => r.remove(), 700)
  }

  function bumpDuck(at: Pt) {
    bumps++
    v = -18
    sfx.quack()
    shout(m, 'QUACK!', [at[0], at[1] - 26], 'bad')
    for (let i = 0; i < 5; i++) ripple([at[0] + (Math.random() - 0.5) * 22, at[1] + (Math.random() - 0.5) * 8])
  }

  m.frame((dt) => {
    if (started && leg !== 'done') {
      secs += dt
      time.textContent = secs.toFixed(1)
    }
    // ducks paddle back and forth
    for (const d of ducks) {
      d.x += d.vx * dt
      if (d.x < d.lo || d.x > d.hi) d.vx = -d.vx
      d.hop = Math.max(0, d.hop - dt * 2.2)
      const s = depth(d.y) * 0.6
      place(d.n, [d.x, d.y - Math.sin(d.hop * Math.PI) * 16], `translate(-50%, -70%) scale(${d.vx > 0 ? -s : s}, ${s})`)
      if (leg !== 'under' && leg !== 'done' && d.hop === 0 && Math.hypot(d.x - x, (d.y - y) / SQUASH) < 21 * depth(y)) {
        d.hop = 1
        d.vx = -d.vx
        bumpDuck([d.x, d.y])
      }
    }
    if (leg === 'out' || leg === 'back') {
      for (const p of PAINTED) {
        if (Math.hypot(p.at[0] - x, (p.at[1] - y) / SQUASH) < 19 * depth(y) && v > 0) {
          hitPainted.add(p.id)
          bumpDuck(p.at)
          const img = cutoutImg(p.id)
          if (img) {
            img.classList.remove('rw-flap')
            void img.offsetWidth
            img.classList.add('rw-flap')
          }
          if (hitPainted.size === PAINTED.length) g.stamp('duck-bowling')
        }
      }
    }

    // the boat
    for (let i = 0; i < 2; i++) swing[i] = Math.max(0, swing[i] - dt * 2.6)
    if (leg === 'under') {
      // gliding through the arch on its own, then it comes back out pointing home
      under += dt
      if (under < 0.7) y -= 14 * dt
      else if (under < 1.1) {
        th = -Math.PI / 2 + ((under - 0.7) / 0.4) * Math.PI
        y = Math.min(151, y + 30 * dt)
      }
      else {
        th = Math.PI / 2
        y = 151
        v = 26
        leg = 'back'
        setGoal(DOCK, 1)
      }
      boat.style.opacity = String(under < 0.7 ? 1 - under / 0.9 : 0.25 + (under - 0.7) * 1.9)
    } else if (leg !== 'done') {
      th += w * dt
      w *= Math.exp(-5.5 * dt)
      v *= Math.exp(-0.85 * dt)
      const nx = x + Math.cos(th) * v * dt
      const ny = y + Math.sin(th) * v * SQUASH * dt
      if (inside([nx, ny], LAKE)) {
        x = nx
        y = ny
      } else if (inside([nx, y], LAKE)) x = nx
      else if (inside([x, ny], LAKE)) y = ny
      else if (Math.abs(v) > 6) {
        v = -v * 0.4
        if (thud <= 0) {
          sfx.tick()
          thud = 0.4
        }
      }
      thud -= dt
      if (leg === 'out' && y < 151 && x > ARCH[0] && x < ARCH[1]) {
        leg = 'under'
        under = 0
        w = 0
        th = -Math.PI / 2
        sfx.chime()
        sparks(m, [x, 146], 12, '#fff2a8')
        bridge?.classList.add('rw-glow')
        m.later(() => bridge?.classList.remove('rw-glow'), 1200)
      }
      if (leg === 'back' && Math.hypot(x - DOCK[0], (y - DOCK[1]) / SQUASH) < 20) finish()
    }
    const s = depth(y)
    boat.style.transform = `translate(${x}px, ${y}px) scale(${s}, ${s * SQUASH}) rotate(${th}rad)`
    oars[0].setAttribute('transform', `rotate(${-38 + swing[0] * 76} 30 5)`)
    oars[1].setAttribute('transform', `rotate(${38 - swing[1] * 76} 30 29)`)
    // the two spots of water to hit: the one that's next glows
    guides.forEach((n, i) => {
      const side = i === 0 ? -1 : 1
      place(n, [x - Math.sin(th) * side * 27 * s, y + Math.cos(th) * side * 27 * SQUASH * s], `scale(${s})`)
      n.classList.toggle('on', last !== side)
      n.style.display = leg === 'under' || leg === 'done' ? 'none' : ''
    })
  })

  function finish() {
    leg = 'done'
    v = 0
    goal.remove()
    const tenths = Math.round(secs * 10)
    const old = save.stats['row-best'] ?? 0
    const record = !old || tenths < old
    if (record) {
      save.stats['row-best'] = tenths
      persist()
    }
    sfx.ding()
    g.confetti(record ? 40 : 16)
    clock.classList.add(record ? 'best' : 'end')
    shout(m, secs.toFixed(1), [DOCK[0] - 40, DOCK[1] - 58], record ? 'gold' : '')
    g.stamp('row-lake')
    if (!bumps && secs <= 18) g.stamp('row-clean')
    g.say(bumps ? pick(['The ducks are filing a complaint.', 'I rowed. The ducks have notes.']) : pick(['Olympic form. Nobody saw it.', 'My arms are done for the week.']))
    m.later(() => m.close(), 2600)
  }

  m.onClose(() => {
    bridge?.classList.remove('rw-glow')
    for (const p of PAINTED) cutoutImg(p.id)?.classList.remove('rw-flap')
  })
  m.root.addEventListener('pointerdown', (e) => {
    const p = pointer(e)
    const cross = Math.cos(th) * ((p[1] - y) / SQUASH) - Math.sin(th) * (p[0] - x)
    stroke(cross >= 0 ? 1 : -1)
  })
  m.onKey((e) => {
    const k = e.key.toLowerCase()
    if (k === 'arrowleft' || k === 'a') return stroke(-1), true
    if (k === 'arrowright' || k === 'd') return stroke(1), true
    if (k === ' ' || k === 'enter') return stroke(last === -1 ? 1 : -1), true
  })
}
