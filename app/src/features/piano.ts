import { inPoly, type Pt } from '../geometry'
import { onRoom, onFrame, world } from '../engine/world'
import { sfx } from '../audio'
import { api } from '../game'

const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11]
const HAS_BLACK = [true, true, false, true, true, true, false] // after C D (no E) F G A (no B)

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
/** point on the piano surface: u across (0..1 left→right), v depth (0 = far/top edge, 1 = near/bottom edge) */
const at = (q: Pt[], u: number, v: number) => lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v)

/** Toy Palace: walk on the giant floor piano and it plays. */
onRoom('toy-palace', ({ geo, scene }) => {
  const pf = geo.piano
  if (!pf) return
  const q = pf.corners
  const n = pf.whiteKeys
  const keys: { poly: Pt[]; note: number; black: boolean }[] = []
  for (let i = 0; i < n; i++) {
    const u0 = i / n, u1 = (i + 1) / n
    keys.push({ poly: [at(q, u0, 0), at(q, u1, 0), at(q, u1, 1), at(q, u0, 1)], note: 60 + WHITE_STEPS[i % 7] + 12 * Math.floor(i / 7), black: false })
  }
  for (let i = 0; i < n - 1; i++) {
    if (!HAS_BLACK[i % 7]) continue
    const c = (i + 1) / n, w = 0.32 / n
    keys.push({ poly: [at(q, c - w, 0), at(q, c + w, 0), at(q, c + w, 0.56), at(q, c - w, 0.56)], note: 61 + WHITE_STEPS[i % 7] + 12 * Math.floor(i / 7), black: true })
  }
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 1000 565')
  svg.setAttribute('class', 'piano-overlay')
  const polys = keys.map((k) => {
    const p = document.createElementNS(ns, 'polygon')
    p.setAttribute('points', k.poly.map((x) => x.join(',')).join(' '))
    p.setAttribute('class', k.black ? 'pk black' : 'pk')
    svg.append(p)
    return p
  })
  scene.append(svg)
  let current = -1
  let played = 0
  const off = onFrame(() => {
    const pos = world.player.pos
    // black keys sit on top of the whites, so test them first
    let idx = -1
    for (let i = keys.length - 1; i >= 0; i--)
      if (inPoly(pos, keys[i].poly)) {
        idx = i
        break
      }
    if (idx !== current) {
      current = idx
      if (idx >= 0) {
        sfx.piano(keys[idx].note)
        const p = polys[idx]
        p.classList.remove('lit')
        void (p as unknown as HTMLElement).getBoundingClientRect()
        p.classList.add('lit')
        played++
        if (played === 8) api.stamp('piano-man')
      }
    }
  })
  return off
})
