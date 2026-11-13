import './ceiling.css'
import { sfx } from '../../audio'
import { el } from '../../engine/stage'
import { persist, save } from '../../state'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { closeX, hint, openMoment, pointer, shout, sparks } from './kit'

/**
 * The Ceiling, Grand Central: look up and gild a constellation yourself. The camera tips back to the painted sky;
 * one figure is only faint dots. Drag from star to star and the gold line follows your hand. A comet crosses the
 * vault while you draw: finish before it lands. Seven figures to collect, a different one every time, then the next.
 */

interface Figure { id: string; name: string; stars: Pt[]; path: number[] }
// stars in a 0..1 box; the path is the order you join them (a star can be visited twice)
const FIGURES: Figure[] = [
  { id: 'cassiopeia', name: 'CASSIOPEIA', stars: [[0.05, 0.3], [0.28, 0.72], [0.5, 0.36], [0.74, 0.8], [0.95, 0.25]], path: [0, 1, 2, 3, 4] },
  { id: 'dipper', name: 'BIG DIPPER', stars: [[0.02, 0.2], [0.2, 0.3], [0.36, 0.42], [0.54, 0.56], [0.6, 0.86], [0.92, 0.84], [0.96, 0.5]], path: [0, 1, 2, 3, 4, 5, 6, 3] },
  { id: 'orion', name: 'ORION', stars: [[0.26, 0.08], [0.72, 0.14], [0.6, 0.47], [0.5, 0.51], [0.4, 0.55], [0.3, 0.94], [0.76, 0.88]], path: [4, 0, 1, 2, 3, 4, 5, 6, 2] },
  { id: 'cygnus', name: 'CYGNUS', stars: [[0.5, 0.04], [0.5, 0.36], [0.5, 0.96], [0.08, 0.5], [0.92, 0.22]], path: [0, 1, 3, 1, 4, 1, 2] },
  { id: 'leo', name: 'LEO', stars: [[0.2, 0.3], [0.1, 0.12], [0.24, 0.02], [0.4, 0.14], [0.36, 0.44], [0.28, 0.62], [0.78, 0.6], [0.96, 0.78], [0.76, 0.4]], path: [0, 1, 2, 3, 4, 5, 6, 7, 8, 4] },
  { id: 'taurus', name: 'TAURUS', stars: [[0.02, 0.04], [0.3, 0.34], [0.5, 0.56], [0.36, 0.26], [0.1, 0.5], [0.72, 0.7], [0.96, 0.92]], path: [0, 1, 2, 3, 4, 3, 2, 5, 6] },
  { id: 'scorpius', name: 'SCORPIUS', stars: [[0.9, 0.04], [0.84, 0.2], [0.94, 0.3], [0.68, 0.34], [0.54, 0.5], [0.44, 0.72], [0.3, 0.88], [0.1, 0.84], [0.04, 0.62], [0.16, 0.54]], path: [0, 1, 2, 1, 3, 4, 5, 6, 7, 8, 9] },
]

const BOX = { x: 290, y: 118, w: 420, h: 300 }
const SNAP = 24
const have = () => FIGURES.filter((f) => save.stats[`sky:${f.id}`]).length

export function connectTheStars(g: Game) {
  const m = openMoment('mo-ceiling')
  m.root.innerHTML = `<div class="ce-sky"></div><div class="ce-arch"></div>
    <svg class="ce-lines" viewBox="0 0 1000 565"><path class="ce-ghost"/><path class="ce-gold"/><line class="ce-live"/></svg>
    <div class="ce-comet"><i></i></div><div class="ce-pips"></div>`
  const sky = m.root.querySelector<HTMLElement>('.ce-sky')!
  const ghost = m.root.querySelector<SVGPathElement>('.ce-ghost')!
  const gold = m.root.querySelector<SVGPathElement>('.ce-gold')!
  const live = m.root.querySelector<SVGLineElement>('.ce-live')!
  const comet = m.root.querySelector<HTMLElement>('.ce-comet')!
  const pips = m.root.querySelector<HTMLElement>('.ce-pips')!
  m.root.append(Object.assign(closeX(m), { className: 'mo-x ce-x' }))
  // the painted sky behind: a scatter of small stars that never move
  for (let i = 0; i < 70; i++) {
    const s = el('i', 'ce-dust')
    s.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 82}%;--s:${2 + Math.random() * 3}px;animation-delay:${-Math.random() * 4}s`
    sky.append(s)
  }
  const drawPips = () => (pips.innerHTML = FIGURES.map((f) => `<i class="${save.stats[`sky:${f.id}`] ? 'on' : ''}"></i>`).join(''))
  drawPips()

  let fig: Figure
  let pts: Pt[] = []
  let dots: HTMLElement[] = []
  let step = 0 // how many stars of the path are joined
  let dragging = false
  let busy = true
  let left = 0
  let total = 1
  let lastId = ''
  let tip: HTMLElement | null = null
  let first = true

  const d = (n: number) => fig.path.slice(0, n).map((k, i) => `${i ? 'L' : 'M'}${pts[k][0]} ${pts[k][1]}`).join(' ')
  const here = () => pts[fig.path[step - 1]]
  const next = () => pts[fig.path[step]]

  function deal() {
    for (const o of dots) o.remove()
    // one you have not drawn yet, if there is one; never the same figure twice running
    const fresh = FIGURES.filter((f) => !save.stats[`sky:${f.id}`] && f.id !== lastId)
    const pool = fresh.length ? fresh : FIGURES.filter((f) => f.id !== lastId)
    fig = pool[Math.floor(Math.random() * pool.length)]
    lastId = fig.id
    // painted backwards, like the real ceiling: some days it is mirrored
    const flip = Math.random() < 0.5
    pts = fig.stars.map(([x, y]) => [BOX.x + (flip ? 1 - x : x) * BOX.w, BOX.y + y * BOX.h] as Pt)
    dots = pts.map((p, i) => {
      const o = el('i', 'ce-star')
      o.style.cssText = `left:${p[0]}px;top:${p[1]}px;animation-delay:${i * 0.06}s`
      m.root.append(o)
      return o
    })
    ghost.setAttribute('d', d(fig.path.length))
    gold.setAttribute('d', '')
    gold.classList.remove('lit')
    step = 1
    total = left = 4 + fig.path.length * 1.5
    comet.classList.remove('fizz')
    busy = false
    mark()
    if (first) {
      first = false
      tip = hint(m, 'Join the stars!', [here()[0], here()[1] - 26])
    }
  }

  function mark() {
    dots.forEach((o, i) => {
      o.classList.toggle('done', fig.path.slice(0, step).includes(i))
      o.classList.toggle('now', !busy && fig.path[step - 1] === i)
      o.classList.toggle('next', fig.path[step] === i)
    })
  }

  function join() {
    step++
    gold.setAttribute('d', d(step))
    sfx.piano(60 + [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24][Math.min(10, step - 2)])
    sparks(m, here(), 5)
    tip?.remove()
    if (step >= fig.path.length) return finish()
    mark()
  }

  function finish() {
    busy = true
    dragging = false
    live.setAttribute('visibility', 'hidden')
    mark()
    gold.classList.add('lit')
    for (const o of dots) o.classList.add('lit')
    const quick = left > 0
    sfx.chime()
    shout(m, fig.name, [500, 426], 'gold')
    if (!save.stats[`sky:${fig.id}`]) {
      save.stats[`sky:${fig.id}`] = 1
      persist()
    }
    drawPips()
    g.stamp('stargazer')
    g.stamp('backwards-sky')
    if (quick) {
      comet.classList.add('caught')
      g.stamp('comet-chaser')
    }
    if (have() >= FIGURES.length) {
      g.confetti(40)
      g.stamp('whole-sky')
    }
    m.later(() => {
      comet.classList.remove('caught')
      deal()
    }, 2100)
  }

  m.root.addEventListener('pointerdown', (e) => {
    if (busy) return
    const q = pointer(e)
    if (Math.hypot(q[0] - here()[0], q[1] - here()[1]) > 34) return
    dragging = true
    m.root.setPointerCapture(e.pointerId)
    tip?.remove()
    move(q)
  })
  const move = (q: Pt) => {
    const a = here()
    live.setAttribute('x1', String(a[0]))
    live.setAttribute('y1', String(a[1]))
    live.setAttribute('x2', String(q[0]))
    live.setAttribute('y2', String(q[1]))
    live.setAttribute('visibility', 'visible')
    const b = next()
    if (Math.hypot(q[0] - b[0], q[1] - b[1]) < SNAP) {
      join()
      if (!busy) move(q)
    }
  }
  m.root.addEventListener('pointermove', (e) => dragging && !busy && move(pointer(e)))
  const drop = () => {
    dragging = false
    live.setAttribute('visibility', 'hidden')
  }
  m.root.addEventListener('pointerup', drop)
  m.root.addEventListener('pointercancel', drop)
  // no mouse: Space or Enter joins the next star
  m.onKey((e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    if (!busy) join()
    return true
  })

  // the comet is the clock: it crosses the vault on an arc and fizzles if you are not done
  m.frame((dt) => {
    if (busy) return
    left -= dt
    const k = Math.max(0, Math.min(1, 1 - left / total))
    const x = 120 + k * 760
    const y = 92 - Math.sin(k * Math.PI) * 54
    comet.style.transform = `translate(${x}px, ${y}px) rotate(${(k - 0.5) * 40}deg)`
    if (left <= 0 && !comet.classList.contains('fizz')) {
      comet.classList.add('fizz')
      sfx.tick()
    }
  })

  m.later(deal, 500)
}
