import { sfx } from '../../audio'
import { bump, save } from '../../state'
import { el, stage } from '../../engine/stage'
import { world } from '../../engine/world'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { cutoutImg, hash, hint, nycDay, openMoment, clickAwayCloses, pointer, shout, sparks } from './kit'

/**
 * The Bull, Wall Street: you actually rub his nose. Drag back and forth on it (or tap Space) and the bronze shines up
 * while the luck meter fills; at the top he snorts and the ticker prints today's luck. One fortune per New York day,
 * a stamp for coming back three days, and a secret for rubbing the wrong end.
 */

interface Luck { sym: string; move: string; line: string }
// the slip is a ticker symbol, an arrow and three or four words. Nothing else.
const LUCK: Luck[] = [
  { sym: 'BAGL', move: '▲ 12.5', line: 'Warm bagel incoming' },
  { sym: 'SEAT', move: '▲ 8.0', line: 'A seat on the train' },
  { sym: 'SLCE', move: '▲ 3.14', line: 'The perfect fold' },
  { sym: 'RENT', move: '▬ 0.0', line: 'Rent stays put' },
  { sym: 'TAXI', move: '▲ 5.5', line: 'First cab stops' },
  { sym: 'XPRS', move: '▲ 9.9', line: 'Express, right on time' },
  { sym: 'ELEV', move: '▲ 2.0', line: 'The elevator works' },
  { sym: 'UMBR', move: '▲ 4.4', line: 'Dry all day' },
  { sym: 'PIGN', move: '▲ 7.7', line: 'Every pigeon misses' },
  { sym: 'LINE', move: '▼ 6.0', line: 'Short lines today' },
  { sym: 'COIN', move: '▲ 1.0', line: 'A coin on the sidewalk' },
  { sym: 'DELI', move: '▲ 11.0', line: 'They know your order' },
]

/** the nose and the far end, as a share of the bull's traced picture (he faces left) */
const NOSE: Pt = [0.225, 0.29]
const TAIL: Pt = [0.86, 0.34]

export function rubTheBull(g: Game) {
  const found = cutoutImg('bull')
  const c = world.geo?.cutouts.bull
  if (!found || !c) return
  const bull: HTMLImageElement = found
  const [bx, by, bw, bh] = c.rect
  const nose: Pt = [bx + bw * NOSE[0], by + bh * NOSE[1]]
  const tail: Pt = [bx + bw * TAIL[0], by + bh * TAIL[1]]

  const m = openMoment('mo-bull')
  // the camera walks up to him: the room zooms in until his head fills the left of the screen
  const K = 2.2
  const FOCUS: Pt = [390, 300]
  const T: Pt = [FOCUS[0] - K * nose[0], FOCUS[1] - K * nose[1]]
  /** a point on the bull (room coords) where it now is on screen */
  const S = (q: Pt): Pt => [T[0] + K * q[0], T[1] + K * q[1]]
  // names and speech bubbles would blow up with the zoom: they step aside while you're up close
  const layers = [stage.bg, stage.scene, stage.fx]
  stage.root.classList.add('bm-zoom')
  for (const l of layers) {
    l.style.transformOrigin = '0 0'
    l.style.transition = 'transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1)'
    l.style.transform = `translate(${T[0]}px, ${T[1]}px) scale(${K})`
  }
  m.onClose(() => {
    for (const l of layers) l.style.transform = ''
    stage.root.classList.remove('bm-zoom')
    setTimeout(() => layers.forEach((l) => l.style.transform || (l.style.transition = '')), 750)
  })
  const N = S(nose)
  // one thing on the bull: a glowing ring on his nose that fills with gold as you rub (it IS the luck meter),
  // with a hand in it showing the motion until you start
  const ring = el('i', 'bm-ring', `<svg viewBox="0 0 80 80"><circle class="bm-glow" cx="40" cy="40" r="34"/><circle class="bm-track" cx="40" cy="40" r="34"/><circle class="bm-fill" cx="40" cy="40" r="34"/></svg><svg class="bm-hand" viewBox="0 0 40 48" aria-hidden="true"><path d="M15 26 V8 a4 4 0 0 1 8 0 V22 M23 20 a4 4 0 0 1 8 0 v4 M31 22 a4 4 0 0 1 7 1 v9 c0 9 -6 14 -14 14 h-3 c-6 0 -9 -3 -12 -8 l-6 -10 a3.5 3.5 0 0 1 6 -3.5 L15 28" fill="#fff" stroke="#1d2140" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg>`)
  ring.style.cssText = `left:${N[0]}px;top:${N[1]}px`
  const fillArc = ring.querySelector<SVGCircleElement>('.bm-fill')!
  const setLuck = () => (fillArc.style.strokeDashoffset = String(214 * (1 - p)))
  // the hint sits right above the ring, pointing down at it
  const tip = hint(m, 'Rub his nose!', [N[0], N[1] - 84])
  // the pad you rub on: the whole bull, so the far end can be found too
  const [px0, py0] = S([bx - 16, by - 16])
  const pad = el('div', 'bm-pad')
  pad.style.cssText = `left:${px0}px;top:${py0}px;width:${(bw + 32) * K}px;height:${(bh + 20) * K}px`
  m.root.append(pad, ring)
  clickAwayCloses(m)

  let p = 0 // 0..1 luck
  let rubbing = false
  let lastPt: Pt | null = null
  let sinceSpark = 0
  let lastTick = 0
  let wrong = 0
  let done = false
  const shine = () => (bull.style.filter = `brightness(${1 + p * 0.42}) saturate(${1 + p * 0.45}) drop-shadow(0 0 ${Math.round(p * 14)}px rgba(255, 226, 122, ${0.9 * p}))`)
  m.onClose(() => {
    bull.style.filter = ''
    bull.classList.remove('bm-snort')
  })

  const add = (amount: number, at: Pt) => {
    if (done) return
    p = Math.min(1, p + amount)
    setLuck()
    shine()
    sinceSpark += amount
    if (sinceSpark > 0.05) {
      sinceSpark = 0
      sparks(m, at, 3)
    }
    const now = performance.now()
    if (now - lastTick > 130) {
      lastTick = now
      sfx.tick()
    }
    if (tip.isConnected && p > 0.15) {
      tip.remove()
      ring.classList.add('going')
    }
    if (p >= 1) finish()
  }

  pad.onpointerdown = (e) => {
    rubbing = true
    lastPt = pointer(e)
    pad.setPointerCapture(e.pointerId)
  }
  pad.onpointerup = pad.onpointercancel = () => {
    rubbing = false
    lastPt = null
  }
  pad.onpointermove = (e) => {
    if (!rubbing || done) return
    const q = pointer(e)
    const moved = lastPt ? Math.hypot(q[0] - lastPt[0], q[1] - lastPt[1]) : 0
    lastPt = q
    if (Math.hypot(q[0] - N[0], q[1] - N[1]) < 90) add(moved / 700, q)
    else if (Math.hypot(q[0] - S(tail)[0], q[1] - S(tail)[1]) < 80) {
      wrong += moved
      if (wrong > 500) wrongEnd()
    }
  }
  // no mouse? Space or Enter rubs too
  m.onKey((e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    if (!done) add(0.2, N)
    return true
  })
  // luck fades if you stop: keep rubbing
  let idle = 0
  m.frame((dt) => {
    if (done || rubbing || p <= 0) return (idle = 0), undefined
    // a short pause is fine; only a long one lets the shine fade
    idle += dt
    if (idle < 1.2) return
    p = Math.max(0, p - dt * 0.03)
    setLuck()
    shine()
  })

  function wrongEnd() {
    wrong = -1e9
    sfx.squawk()
    shout(m, 'WRONG END', [S(tail)[0], S(tail)[1] - 60], 'bad')
    g.say('That was not the nose. The market just dipped two points. Coincidence.')
    g.stamp('wrong-end')
  }

  function finish() {
    done = true
    ring.remove()
    tip.remove()
    pad.style.pointerEvents = 'none'
    sfx.coin()
    bull.classList.add('bm-snort')
    // two puffs out of the nostrils
    for (const dx of [-10, 6]) {
      const puff = el('i', 'bm-puff')
      puff.style.cssText = `left:${N[0] + dx * K}px;top:${N[1] + 18}px;--dx:${dx < 0 ? -70 : -40}px`
      m.root.append(puff)
      setTimeout(() => puff.remove(), 900)
    }
    g.emote('cheer', 2.5)
    g.confetti(22)

    // one fortune per New York day
    const day = nycDay()
    const luck = LUCK[hash(`${save.name}:${day}`) % LUCK.length]
    if (save.stats['bull:last'] !== day) {
      save.stats['bull:last'] = day
      bump('bull:days')
    }
    g.stamp('bull-luck')
    if ((save.stats['bull:days'] ?? 0) >= 3) g.stamp('bull-regular')

    m.later(() => {
      const slip = el('div', 'bm-slip', `<div class="bm-slip-top"><b>${luck.sym}</b><em class="${luck.move.startsWith('▼') ? 'down' : ''}">${luck.move}</em></div><p>${luck.line}</p>`)
      slip.style.cssText = `left:${N[0] + 250}px;top:${N[1] - 120}px`
      m.root.append(slip)
      sfx.register()
      // the slip is the whole reward: click anywhere (or wait) and you're back in the street
      m.root.addEventListener('pointerdown', () => m.close())
      m.later(() => m.close(), 9000)
    }, 650)
  }
}
