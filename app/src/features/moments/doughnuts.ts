import './doughnuts.css'
import { sfx } from '../../audio'
import { avatarMarkup } from '../../avatar/render'
import { randomLook } from '../../avatar/random'
import type { Look } from '../../avatar/look'
import { el, toStage } from '../../engine/stage'
import { mk } from '../../sound/market'
import { bump, save } from '../../state'
import type { Game } from '../../types'
import { openMoment } from './kit'

/**
 * Doughnut Dept., Chelsea Market: the hot mini doughnut stand, first person over its painting
 * (art/places/cm-doughnuts.jpg). You pick a sugar (the picture buttons, or the jars on the shelf), pay, then run the
 * little robot yourself: every pull of the red lever drops a ring of batter in the oil, it floats down the channel,
 * a paddle flips it golden halfway, the conveyor carries it out and it drops in the steel tray. Six pulls, six minis.
 * They go in a paper bag with a scoop of the sugar, you shake the bag, and eat them hot off the paper.
 */

const ART = '/art/places/cm-doughnuts.jpg'
const SP = '/art/places/sprites/'
const ITEM = 'mini-donuts'
const PRICE = 3
const HALF_DOZEN = 6
const SHAKES = 8

type SugarId = 'cinnamon' | 'cocoa' | 'lavender' | 'raspberry'
interface Sugar {
  id: SugarId
  name: string
  /** what he says when you pick it */
  line: string
  cols: string[]
  /** sprite height at 360 wide */
  h: number
}
const SUGARS: Sugar[] = [
  { id: 'cinnamon', name: 'Cinnamon Sugar', line: 'The classic.', cols: ['#d9a05a', '#b8763a', '#f3d3a0'], h: 308 },
  { id: 'cocoa', name: 'Cocoa Sea Salt', line: 'Salt on chocolate. Trust it.', cols: ['#6a3a1c', '#3f2010', '#f4f0e8'], h: 302 },
  { id: 'lavender', name: 'Lavender', line: 'Fancy.', cols: ['#c9a8ec', '#9a6bd6', '#eee2ff'], h: 311 },
  { id: 'raspberry', name: 'Raspberry', line: 'Pink it is.', cols: ['#f488a8', '#d93a62', '#ffd0dc'], h: 310 },
]

// ---------- the painting, in stage units (2000 × 1131 drawn at 1000 × 565.5) ----------
type Pt2 = [number, number]
/** the four sugar jars on the shelf, traced lid knob to base */
const jar = (x0: number, x1: number): Pt2[] => {
  const c = (x0 + x1) / 2
  return [[c - 6, 134], [c + 6, 134], [c + 9, 143], [c + 21, 149], [x1 - 3, 158], [x1, 168], [x1, 216], [x1 - 4, 221], [x0 + 4, 221], [x0, 216], [x0, 168], [x0 + 3, 158], [c - 21, 149], [c - 9, 143]]
}
const JARS: Record<SugarId, Pt2[]> = { cinnamon: jar(644, 698.5), cocoa: jar(700.5, 753), lavender: jar(756, 809.5), raspberry: jar(811.5, 865) }
/** the oil: rings ride along y = OIL_Y from where the depositor drops them to the foot of the conveyor */
const OIL_Y = 320.5
const DROP_X = 282
const FLIP_X = 462
const END_X = 684
const RING_W = 38
const RING_H = (RING_W * 298) / 360
const GAP = 41
/** the conveyor: top of the belt by the oil, down to where it lets go over the tray (ring centres) */
const BELT_A: Pt2 = [716, 287]
const BELT_B: Pt2 = [790, 353]
/** where the six land in the steel tray: a back row, a front row and one on top (ring centres), with their stacking order */
const SLOTS: { at: Pt2; z: number }[] = [
  { at: [838, 380], z: 1 },
  { at: [874, 379], z: 1 },
  { at: [909, 380], z: 1 },
  { at: [856, 388], z: 3 },
  { at: [893, 388], z: 3 },
  { at: [875, 368], z: 2 },
]
const LEVER = { pivot: [454.5, 387] as Pt2, ball: [522, 351] as Pt2, swing: 52 }
const BAG = { x: 500, base: 536, w: 108 }
const BAG_H = (BAG.w * 360) / 328
const BAGS_AT: Pt2 = [906, 186]
const GUY_HAND: Pt2 = [347, 250]
/** the six on the paper, two rows of three (centres) */
const MINI_W = 60
const MINIS: Pt2[] = [[442, 461], [500, 458], [558, 461], [434, 495], [500, 497], [566, 495]]

export function doughnutDept(g: Game) {
  const m = openMoment('mo-doughnuts')
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const pace = calm ? 2.6 : 1

  // the doughnut maker: a random New Yorker in a paper hat and an apron
  const look: Look = (() => {
    const l = randomLook(0.2)
    l.hairColor = l.hairColor % 6
    if (['afro', 'puffs', 'long', 'locs', 'braids'].includes(l.hair)) l.hair = 'short'
    l.items = { body: 'barista-apron', legs: l.items.legs, feet: l.items.feet }
    return l
  })()
  /** the folded paper hat, drawn over the head in the avatar's own units */
  const HAT = `<g><path d="M -24 -112 L -21 -135 Q 0 -145 21 -135 L 24 -112 Z" fill="#fffdf6" stroke="#1d2140" stroke-width="2.8" stroke-linejoin="round"/><path d="M -23.2 -119 L 23.2 -119" stroke="#d8342c" stroke-width="3.4"/><path d="M -12 -138 Q 0 -133 12 -138" fill="none" stroke="#1d2140" stroke-width="1.6" stroke-linecap="round" opacity=".45"/></g>`
  const vendorSvg = (mood: 'smile' | 'grin' | 'o') => `<svg viewBox="-60 -185 120 192" aria-hidden="true">${avatarMarkup(look, { mood })}${HAT}</svg>`

  const poly = (pts: Pt2[]) => pts.map((p) => p.join(',')).join(' ')
  const [px, py] = LEVER.pivot
  const [bx, by] = LEVER.ball
  const root = el('div', 'dd')
  root.innerHTML = `
    <img class="dd-bg" src="${ART}" alt="" draggable="false">
    <i class="dd-brick"></i>
    <i class="dd-plunger"></i>
    <i class="dd-collar"></i>
    <i class="dd-jar-tint"></i>
    <div class="dd-guy"><div class="dd-guy-body">${vendorSvg('smile')}</div></div>
    <div class="dd-haze"><i></i><i></i><i></i><i></i></div>
    <div class="dd-shimmer"></div>
    <div class="dd-oil"></div>
    <svg class="dd-paddle" viewBox="0 0 40 40" aria-hidden="true"><g class="dd-paddle-arm"><path d="M 18.5 30 L 16 8 Q 20 4 24 8 L 21.5 30 Z" fill="#c9c2b6" stroke="#1c1614" stroke-width="1.6" stroke-linejoin="round"/><path d="M 18.8 10 L 19.6 27" stroke="#f4efe6" stroke-width="1.3" stroke-linecap="round"/></g><circle cx="20" cy="31" r="3.6" fill="#8d857a" stroke="#1c1614" stroke-width="1.5"/></svg>
    <i class="dd-steel"></i><i class="dd-steel2"></i>
    <svg class="dd-machine" viewBox="0 0 1000 565.5" aria-hidden="true">
      <defs>
        <linearGradient id="dd-plate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dccfb8"/><stop offset=".45" stop-color="#ab9a82"/><stop offset="1" stop-color="#7f6e59"/></linearGradient>
        <radialGradient id="dd-ball" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#ff8f7c"/><stop offset=".3" stop-color="#e2352a"/><stop offset="1" stop-color="#96140f"/></radialGradient>
      </defs>
      <path d="M 430 352.5 L 480 352.5 L 486 358.5 L 486 409 Q 486 412 483 412 L 426.5 412 Q 423.5 412 423.5 409 L 423.5 359 Z" fill="url(#dd-plate)" stroke="#1c1614" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M 431 356 L 479 356" stroke="#efe9de" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
      ${([[434, 364.5], [475.5, 364.5], [432.5, 403.5], [476.5, 403.5]] as Pt2[]).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="#b9b1a4" stroke="#1c1614" stroke-width="1.4"/><circle cx="${x - 0.9}" cy="${y - 1}" r="1.2" fill="#f6f1e8"/>`).join('')}
      <circle cx="${px}" cy="${py}" r="15.5" fill="#8f877c" stroke="#1c1614" stroke-width="2.2"/>
      <circle cx="${px}" cy="${py}" r="11" fill="#c3bbae" stroke="#1c1614" stroke-width="1.4"/>
      <g class="dd-lamps">${Array.from({ length: HALF_DOZEN }, (_, i) => `<circle class="dd-lamp" cx="${345 + i * 10.6}" cy="388" r="3.3"/>`).join('')}</g>
      <circle class="dd-pulse" cx="${bx}" cy="${by}" r="18"/>
      <g class="dd-lever">
        <path d="M ${px} ${py} L ${bx} ${by}" stroke="#1c1614" stroke-width="12.5" stroke-linecap="round"/>
        <path d="M ${px} ${py} L ${bx} ${by}" stroke="#c9231b" stroke-width="8.2" stroke-linecap="round"/>
        <path d="M ${px + 3} ${py - 4.2} L ${bx - 12} ${by + 3.6}" stroke="#f0786a" stroke-width="2" stroke-linecap="round" opacity=".85"/>
        <circle cx="${px}" cy="${py}" r="8.4" fill="#c9231b" stroke="#1c1614" stroke-width="2.2"/>
        <circle cx="${px}" cy="${py}" r="3.2" fill="#b9b1a4" stroke="#1c1614" stroke-width="1.3"/>
        <circle cx="${bx}" cy="${by}" r="14.4" fill="url(#dd-ball)" stroke="#1c1614" stroke-width="2.4"/>
        <ellipse cx="${bx - 4.6}" cy="${by - 5.6}" rx="3.6" ry="2.5" fill="#fff" opacity=".85" transform="rotate(-30 ${bx - 4.6} ${by - 5.6})"/>
        <path class="dd-lever-hit" d="M ${px} ${py} L ${bx} ${by}" stroke="transparent" stroke-width="34" stroke-linecap="round"/>
      </g>
      <path class="dd-belt-run" d="M 706 287 L 800 371"/>
    </svg>
    <div class="dd-belt"></div>
    <div class="dd-tray"></div>
    <i class="dd-tray-front"></i>
    <svg class="dd-shapes" viewBox="0 0 1000 565.5" aria-hidden="true">${SUGARS.map((s) => `<polygon class="dd-shape" data-id="${s.id}" points="${poly(JARS[s.id])}"/>`).join('')}</svg>
    <div class="dd-counter"></div>
    <p class="dd-bubble" hidden></p>
    <div class="dd-menu" hidden>${SUGARS.map((s) => `<button class="dd-pick" type="button" data-s="${s.id}"><img src="${SP}cm-dn-${s.id}.png" alt="" draggable="false"><span>${s.name}</span></button>`).join('')}</div>
    <div class="dd-pay" hidden><button class="btn go dd-paybtn" type="button">Pay <img src="/art/icons/coin.png" alt="">${PRICE}</button></div>
    <div class="dd-after" hidden><button class="btn small go dd-eat" type="button">Eat here</button><button class="btn small ghost dd-togo" type="button">To go</button></div>
    <ol class="dd-steps"><li data-s="sugar">Sugar</li><li data-s="pay">Pay</li><li data-s="fry">Fry</li><li data-s="shake">Shake</li></ol>
    <p class="dd-label" hidden></p>
    <div class="dd-actions"><span class="dd-coins"><img src="/art/icons/coin.png" alt=""><b></b></span><button class="btn tiny ghost dd-leave" type="button">Leave</button></div>
    <p class="dd-hint" hidden><span></span></p>`
  m.root.append(root)
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as unknown as T
  const guy = q('.dd-guy')
  const guyBody = q('.dd-guy-body')
  const bubble = q('.dd-bubble')
  const menu = q('.dd-menu')
  const payBox = q('.dd-pay')
  const after = q('.dd-after')
  const hintEl = q('.dd-hint')
  const label = q('.dd-label')
  const coinsEl = q('.dd-coins b')
  const oil = q('.dd-oil')
  const beltEl = q('.dd-belt')
  const trayEl = q('.dd-tray')
  const counter = q('.dd-counter')
  const plunger = q('.dd-plunger')
  const leverG = q<SVGGElement>('.dd-lever')
  const paddleArm = q<SVGGElement>('.dd-paddle-arm')
  const lamps = [...root.querySelectorAll<SVGCircleElement>('.dd-lamp')]
  coinsEl.textContent = String(save.coins)

  // ---------- small helpers ----------
  const face = (mood: 'smile' | 'grin' | 'o') => (guyBody.innerHTML = vendorSvg(mood))
  let bubbleT = 0
  /** ms = 0 keeps the bubble up until the next line */
  const say = (text: string, ms = 1700) => {
    bubble.textContent = text
    bubble.hidden = false
    bubble.classList.remove('out')
    clearTimeout(bubbleT)
    if (ms) bubbleT = window.setTimeout(() => bubble.classList.add('out'), ms)
  }
  const hint = (text: string | null, at?: Pt2) => {
    if (!text) return void hintEl.classList.add('out')
    hintEl.querySelector('span')!.textContent = text
    if (at) hintEl.style.cssText = `left:${at[0]}px;top:${at[1]}px`
    hintEl.hidden = false
    hintEl.classList.remove('out')
  }
  const hop = () => {
    guy.classList.remove('hop')
    void guy.offsetWidth
    guy.classList.add('hop')
  }
  /** an arc from one spot to another (centres); `into` shrinks and fades at the end, for things going in the bag */
  const fly = (src: string, from: Pt2, to: Pt2, w: number, h: number, o: { ms?: number; lift?: number; into?: boolean; spin?: number } = {}) =>
    new Promise<void>((done) => {
      const f = el('img', 'dd-fly') as HTMLImageElement
      f.src = src
      f.draggable = false
      f.style.cssText = `left:${to[0] - w / 2}px;top:${to[1] - h / 2}px;width:${w}px;height:${h}px`
      root.append(f)
      const dx = from[0] - to[0]
      const dy = from[1] - to[1]
      const lift = o.lift ?? 60
      const spin = o.spin ?? 0
      const a = f.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) rotate(${-spin}deg)`, opacity: 1, offset: 0 },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) rotate(${-spin * 0.3}deg)`, opacity: 1, offset: 0.55 },
          o.into ? { transform: 'translate(0, -6px) scale(0.86)', opacity: 1, offset: 0.86 } : { transform: 'translate(0, -5px) scale(1.04)', opacity: 1, offset: 0.86 },
          o.into ? { transform: 'translate(0, 10px) scale(0.6)', opacity: 0, offset: 1 } : { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 1 },
        ],
        { duration: (o.ms ?? 520) / (calm ? 2 : 1), easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)' },
      )
      a.onfinish = () => {
        f.remove()
        done()
      }
    })
  /** little grains (sugar, crumbs, oil) thrown from a point */
  const grains = (at: Pt2, cols: string[], n: number, o: { spread?: number; up?: number; fall?: number; size?: number; round?: boolean } = {}) => {
    for (let i = 0; i < n; i++) {
      const c = el('i', 'dd-grain')
      const dx = (Math.random() - 0.5) * (o.spread ?? 70)
      const up = (o.up ?? 22) * (0.5 + Math.random())
      const fall = (o.fall ?? 34) * (0.5 + Math.random())
      const s = (o.size ?? 4) * (0.7 + Math.random() * 0.6)
      c.style.cssText = `left:${at[0]}px;top:${at[1]}px;width:${s}px;height:${s}px;background:${cols[i % cols.length]};${o.round ? 'border-radius:50%;' : ''}`
      root.append(c)
      c.animate(
        [
          { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          { transform: `translate(${dx * 0.6}px, ${-up}px) rotate(120deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${dx}px, ${fall}px) rotate(260deg)`, opacity: 0 },
        ],
        { duration: 520 + Math.random() * 320, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
      ).onfinish = () => c.remove()
    }
  }

  // ---------- state ----------
  type Phase = 'sugar' | 'pay' | 'fry' | 'bag' | 'shake' | 'serve' | 'eat'
  let phase: Phase = 'sugar'
  let sugar: Sugar | null = null
  let busy = false
  let paid = false
  let pulls = 0
  let pending = 0
  let inTray = 0
  let eaten = 0
  let shakes = 0
  let quipped = false

  type Step = 'sugar' | 'pay' | 'fry' | 'shake'
  const ORDER: Step[] = ['sugar', 'pay', 'fry', 'shake']
  const step = (st: Step | 'done') => {
    const n = st === 'done' ? ORDER.length : ORDER.indexOf(st)
    for (const li of root.querySelectorAll<HTMLElement>('.dd-steps li')) {
      const k = ORDER.indexOf(li.dataset.s as Step)
      li.classList.toggle('done', k < n)
      li.classList.toggle('now', k === n)
    }
  }
  const setPhase = (p: Phase) => {
    phase = p
    root.dataset.phase = p
  }

  // ---------- 1. the sugar: four pictures, or the jars themselves ----------
  const showLabel = (text: string | null, at?: Pt2) => {
    if (!text) return void (label.hidden = true)
    label.textContent = text
    label.style.cssText = `left:${at![0]}px;top:${at![1]}px`
    label.hidden = false
  }
  const markJar = () => {
    for (const p of root.querySelectorAll<SVGPolygonElement>('.dd-shape')) p.classList.toggle('sel', p.dataset.id === sugar?.id)
  }
  function choose(id: SugarId) {
    if (busy) return
    if (phase !== 'sugar' && phase !== 'pay') {
      hop()
      return say(phase === 'eat' || phase === 'serve' ? 'Finish those first.' : 'One sugar a bag.')
    }
    sugar = SUGARS.find((s) => s.id === id)!
    sfx.click()
    mk.shake()
    markJar()
    menu.hidden = true
    face('grin')
    say(sugar.line)
    m.later(() => face('smile'), 1400)
    const top = JARS[id]
    grains([(top[0][0] + top[1][0]) / 2, 140], sugar.cols, 7, { spread: 40, up: 16, fall: 20, size: 3, round: true })
    setPhase('pay')
    step('pay')
    payBox.hidden = false
  }
  for (const b of root.querySelectorAll<HTMLElement>('.dd-pick')) b.onclick = (e) => {
    e.stopPropagation()
    choose(b.dataset.s as SugarId)
  }
  for (const p of root.querySelectorAll<SVGPolygonElement>('.dd-shape')) {
    const s = SUGARS.find((x) => x.id === p.dataset.id)!
    const pts = JARS[s.id]
    p.onpointerenter = () => showLabel(s.name, [(pts[0][0] + pts[1][0]) / 2, 129])
    p.onpointerleave = () => showLabel(null)
    p.onpointerdown = (e) => {
      e.stopPropagation()
      choose(s.id)
    }
  }
  function ask(first: boolean) {
    setPhase('sugar')
    step('sugar')
    menu.hidden = false
    say(first ? 'Which sugar?' : 'Another flavor?', 0)
  }

  // ---------- 2. paying ----------
  async function pay() {
    if (paid || busy || !sugar) return
    busy = true
    // the catalog price the first time (it puts the bag in your wardrobe), plain coins after
    const ok = !g.owns(ITEM) ? await g.buy(ITEM) : g.spend(PRICE, 'cm-doughnuts')
    busy = false
    if (!m.alive) return
    if (!ok) {
      face('o')
      hop()
      say('Three coins. Firm.')
      m.later(() => face('smile'), 1500)
      return
    }
    paid = true
    payBox.hidden = true
    for (let i = 0; i < PRICE; i++) m.later(() => void fly('/art/icons/coin.png', [930, 34], GUY_HAND, 24, 24, { ms: 520, lift: 40 }), i * 110)
    m.later(() => {
      sfx.register()
      coinsEl.textContent = String(save.coins)
      face('grin')
      hop()
      say('Pull the lever.', 2400)
      setPhase('fry')
      step('fry')
      root.classList.add('ready')
      hint('Pull the lever', [LEVER.ball[0], LEVER.ball[1] - 26])
      m.later(() => face('smile'), 1500)
    }, 520 + PRICE * 110)
  }
  q('.dd-paybtn').onclick = (e) => {
    e.stopPropagation()
    void pay()
  }

  // ---------- 3. the machine ----------
  interface Ring {
    el: HTMLElement
    img: HTMLImageElement
    inner: HTMLElement
    x: number
    st: 'fry1' | 'flip' | 'fry2' | 'belt' | 'tray'
    t: number
    ph: number
  }
  const rings: Ring[] = []
  let lever = 0
  let drag: { y0: number; fired: boolean; id: number } | null = null
  let beltFree = 0
  let fryAt = -9
  let paddleBusy = false
  const setLever = (a: number, snap = false) => {
    lever = Math.max(0, Math.min(1, a))
    leverG.classList.toggle('snap', snap)
    leverG.style.transform = `rotate(${lever * LEVER.swing}deg)`
  }

  function pull() {
    if (phase !== 'fry') {
      hop()
      if (phase === 'sugar') return say('Sugar first.')
      if (phase === 'pay') return say('Pay first.')
      if (!quipped) {
        quipped = true
        face('o')
        m.later(() => face('smile'), 1500)
        return say('Half dozen means six.')
      }
      return say('Six. That was six.')
    }
    if (pulls >= HALF_DOZEN) {
      hop()
      face('o')
      m.later(() => face('smile'), 1500)
      quipped = true
      return say('Half dozen means six.')
    }
    pulls++
    pending++
    mk.clunk()
    hint(null)
    root.classList.remove('ready')
    lamps[pulls - 1]?.classList.add('on')
    if (pulls === 3) say('Hot. Give them a second.', 2000)
  }

  const hit = q<SVGPathElement>('.dd-lever-hit')
  hit.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    if (drag) return
    hit.setPointerCapture(e.pointerId)
    drag = { y0: toStage(e)[1], fired: false, id: e.pointerId }
    sfx.click()
  })
  hit.addEventListener('pointermove', (e) => {
    if (!drag) return
    const a = (toStage(e)[1] - drag.y0) / 42
    setLever(a)
    if (a >= 0.85 && !drag.fired) {
      drag.fired = true
      pull()
    }
  })
  const letGo = () => {
    if (!drag) return
    const d = drag
    drag = null
    if (d.fired) return setLever(0, true)
    // a plain click: the lever swings down and back by itself
    setLever(1, true)
    m.later(() => {
      pull()
      setLever(0, true)
    }, 150)
  }
  hit.addEventListener('pointerup', letGo)
  hit.addEventListener('pointercancel', letGo)

  function spawn() {
    pending--
    const e = el('div', 'dd-ring drop')
    e.innerHTML = `<b class="dd-ripple"></b><div class="dd-ring-in"><img src="${SP}cm-dn-raw.png" alt="" draggable="false"><i class="dd-ring-oil"></i></div><u></u><u></u>`
    oil.append(e)
    const r: Ring = { el: e, img: e.querySelector('img')!, inner: e.querySelector('.dd-ring-in')!, x: DROP_X, st: 'fry1', t: 0, ph: Math.random() * 6 }
    rings.push(r)
    place(r, 0)
    // the plunger dips, the batter plops in
    plunger.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(9px)', offset: 0.35 }, { transform: 'translateY(0)' }], { duration: 300, easing: 'ease-out' })
    mk.plop()
    m.later(() => grains([DROP_X, OIL_Y + 2], ['#ffd76a', '#f6b62a', '#fff0b0'], 6, { spread: 34, up: 14, fall: 4, size: 3, round: true }), 150)
  }
  const place = (r: Ring, t: number, dy = 0) => {
    const bob = Math.sin(t * 2.6 + r.ph) * 1.1
    r.el.style.transform = `translate(${(r.x - RING_W / 2).toFixed(2)}px, ${(OIL_Y - RING_H / 2 + bob + dy).toFixed(2)}px)`
  }
  const SPEED = 54

  m.frame((dt, t) => {
    // the next ring drops as soon as the last one has floated clear
    if (pending > 0 && !rings.some((r) => (r.st === 'fry1' || r.st === 'flip') && r.x < DROP_X + GAP)) spawn()
    let frying = false
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i]
      if (r.st === 'belt' || r.st === 'tray') continue
      frying = true
      // never closer than GAP to the ring ahead of it in the oil
      const ahead = rings.slice(0, i).reverse().find((a) => a.st === 'fry1' || a.st === 'flip' || a.st === 'fry2')
      const cap = ahead ? ahead.x - GAP : Infinity
      if (r.st === 'fry1') {
        r.x = Math.min(r.x + SPEED * pace * dt, FLIP_X, cap)
        place(r, t)
        if (r.x >= FLIP_X && !paddleBusy && (!ahead || ahead.x > FLIP_X + 30 + GAP)) {
          r.st = 'flip'
          r.t = 0
          paddleBusy = true
          paddleArm.classList.remove('go')
          void paddleArm.getBoundingClientRect()
          paddleArm.classList.add('go')
          sfx.whoosh()
        }
      } else if (r.st === 'flip') {
        // the paddle kicks it up and over: it comes down golden side up
        r.t += dt * (calm ? 2 : 1)
        const p = Math.min(1, r.t / 0.5)
        r.x = FLIP_X + 30 * p
        const up = -Math.sin(p * Math.PI) * 15
        const sy = Math.abs(Math.cos(p * Math.PI))
        if (p >= 0.5 && !r.el.classList.contains('gold')) {
          r.el.classList.add('gold')
          r.img.src = `${SP}cm-dn-plain.png`
        }
        r.inner.style.transform = `scaleY(${(0.12 + sy * 0.88).toFixed(3)})`
        place(r, t, up)
        if (p >= 1) {
          r.st = 'fry2'
          r.inner.style.transform = ''
          paddleBusy = false
          mk.plop()
          grains([r.x, OIL_Y + 2], ['#ffd76a', '#f6b62a', '#fff0b0'], 5, { spread: 30, up: 12, fall: 4, size: 3, round: true })
        }
      } else {
        r.x = Math.min(r.x + SPEED * pace * dt, END_X, cap)
        place(r, t)
        if (r.x >= END_X && t > beltFree) {
          beltFree = t + 0.5 / pace
          void ride(r)
        }
      }
    }
    if (frying && t - fryAt > 2.1) {
      fryAt = t
      mk.fry()
    }
    root.classList.toggle('frying', frying)
  })

  /** out of the oil, down the conveyor, into the tray */
  async function ride(r: Ring) {
    r.st = 'belt'
    r.el.classList.remove('drop')
    r.el.classList.add('dry')
    beltEl.append(r.el)
    root.classList.add('belting')
    const at = (p: Pt2) => `translate(${p[0] - RING_W / 2}px, ${p[1] - RING_H / 2}px)`
    const k = calm ? 0.5 : 1
    await r.el.animate([{ transform: at([r.x, OIL_Y]) }, { transform: at([(r.x + BELT_A[0]) / 2 - 2, BELT_A[1] - 8]), offset: 0.6 }, { transform: at(BELT_A) }], { duration: 300 * k, easing: 'ease-out' }).finished
    if (!m.alive) return
    r.el.style.transform = at(BELT_A)
    await r.el.animate([{ transform: at(BELT_A) }, { transform: at(BELT_B) }], { duration: 760 * k, easing: 'linear' }).finished
    if (!m.alive) return
    const slot = SLOTS[inTray]
    trayEl.append(r.el)
    r.el.style.zIndex = String(slot.z)
    r.el.style.transform = at(slot.at)
    r.st = 'tray'
    await r.el.animate(
      [
        { transform: `${at(BELT_B)} rotate(0deg)` },
        { transform: `${at([(BELT_B[0] + slot.at[0]) / 2, Math.min(BELT_B[1], slot.at[1]) - 12])} rotate(40deg)`, offset: 0.45 },
        { transform: `${at([slot.at[0], slot.at[1] + 1.5])} rotate(0deg)`, offset: 0.82 },
        { transform: `${at([slot.at[0], slot.at[1] - 2])} rotate(0deg)`, offset: 0.92 },
        { transform: `${at(slot.at)} rotate(0deg)` },
      ],
      { duration: 320 * k, easing: 'ease-in' },
    ).finished
    if (!m.alive) return
    sfx.pop()
    inTray++
    if (!rings.some((x) => x.st === 'belt')) root.classList.remove('belting')
    if (inTray === HALF_DOZEN) m.later(() => void bagUp(), 650)
  }

  // ---------- 4. the bag ----------
  const bagTop = BAG.base - BAG_H
  let bag: HTMLElement | null = null
  let bagImg: HTMLImageElement | null = null
  let prog: SVGCircleElement | null = null
  const wait = (ms: number) => new Promise<void>((r) => m.later(r, calm ? ms / 2 : ms))

  async function bagUp() {
    if (phase !== 'fry') return
    setPhase('bag')
    step('shake')
    root.classList.remove('frying')
    const s = sugar!
    face('grin')
    guy.classList.add('reach-r')
    mk.bag()
    await fly(`${SP}cm-bag-open.png`, BAGS_AT, [BAG.x, BAG.base - BAG_H / 2], BAG.w, BAG_H, { ms: 560, lift: 40, spin: 14 })
    if (!m.alive) return
    counter.innerHTML = `<i class="dd-shadow" style="left:${BAG.x - 74}px;top:${BAG.base - 13}px;width:148px;height:24px"></i>
      <svg class="dd-prog" viewBox="-90 -90 180 180" style="left:${BAG.x - 90}px;top:${BAG.base - BAG_H / 2 - 92}px" hidden><circle r="80" class="dd-prog-track"/><circle r="80" class="dd-prog-fill" transform="rotate(-90)"/></svg>
      <div class="dd-bag" style="left:${BAG.x - 90}px;top:${bagTop - 40}px;width:180px;height:${BAG_H + 48}px"><img src="${SP}cm-bag-open.png" alt="" draggable="false" style="left:${90 - BAG.w / 2}px;top:40px;width:${BAG.w}px;height:${BAG_H}px"></div>`
    bag = counter.querySelector('.dd-bag')
    bagImg = bag!.querySelector('img')
    prog = counter.querySelector('.dd-prog-fill')
    sfx.thunk()
    await wait(220)
    // he tips the six in, one after the other
    const mouth: Pt2 = [BAG.x, bagTop + 16]
    const order = [5, 3, 4, 0, 1, 2]
    const trayRings = rings.filter((r) => r.st === 'tray')
    await Promise.all(
      order.map(async (si, i) => {
        await wait(i * 120)
        const r = trayRings[si]
        if (!r || !m.alive) return
        r.el.remove()
        await fly(`${SP}cm-dn-plain.png`, SLOTS[si].at, mouth, RING_W, RING_H, { ms: 460, lift: 70, into: true, spin: 60 })
        if (!m.alive) return
        mk.plop()
        bagImg?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03, 0.97)' }, { transform: 'scale(1)' }], { duration: 140 })
      }),
    )
    if (!m.alive) return
    rings.length = 0
    guy.classList.remove('reach-r')
    // a scoop of the sugar goes in after them
    const jarTop = JARS[s.id]
    const from: Pt2 = [(jarTop[0][0] + jarTop[1][0]) / 2, 150]
    const scoopAt: Pt2 = [BAG.x + 30, bagTop - 26]
    const scoop = el('div', 'dd-scoop')
    scoop.innerHTML = `<svg viewBox="0 0 60 40" aria-hidden="true"><path d="M 30 14 L 57 9 Q 60 12 57 15 L 31 21 Z" fill="#b9b1a4" stroke="#1c1614" stroke-width="2" stroke-linejoin="round"/><path d="M 4 10 L 32 8 L 34 26 Q 18 34 6 26 Z" fill="#d6cfc3" stroke="#1c1614" stroke-width="2.2" stroke-linejoin="round"/><path d="M 5 11 Q 17 -3 31 9 Z" fill="${s.cols[0]}" stroke="#1c1614" stroke-width="1.6" stroke-linejoin="round"/></svg>`
    scoop.style.cssText = `left:${scoopAt[0] - 30}px;top:${scoopAt[1] - 20}px`
    root.append(scoop)
    mk.shake()
    await scoop.animate(
      [
        { transform: `translate(${from[0] - scoopAt[0]}px, ${from[1] - scoopAt[1]}px) rotate(0deg) scale(0.7)` },
        { transform: `translate(${(from[0] - scoopAt[0]) * 0.4}px, ${(from[1] - scoopAt[1]) * 0.4 - 40}px) rotate(0deg) scale(0.9)`, offset: 0.6 },
        { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
      ],
      { duration: calm ? 300 : 600, easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)' },
    ).finished
    if (!m.alive) return
    scoop.classList.add('tip')
    mk.bag()
    for (let i = 0; i < 26; i++)
      m.later(() => {
        const c = el('i', 'dd-grain round')
        const sz = 2.6 + Math.random() * 2.2
        const x = scoopAt[0] - 30 + (Math.random() - 0.5) * 7
        c.style.cssText = `left:${x}px;top:${scoopAt[1] + 4}px;width:${sz}px;height:${sz}px;background:${s.cols[i % s.cols.length]}`
        root.append(c)
        c.animate([{ transform: 'translate(0, 0)', opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 8}px, ${42 + Math.random() * 8}px)`, opacity: 1, offset: 0.85 }, { transform: 'translate(0, 52px)', opacity: 0 }], { duration: 300, easing: 'ease-in' }).onfinish = () => c.remove()
      }, i * 22)
    await wait(760)
    if (!m.alive) return
    scoop.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(40px, -30px) rotate(-10deg)' }], { duration: 260, easing: 'ease-in' }).onfinish = () => scoop.remove()
    // folded shut
    mk.bag()
    const w2 = (BAG_H * 357) / 360
    bagImg!.src = `${SP}cm-bag-shut.png`
    bagImg!.style.left = `${90 - w2 / 2}px`
    bagImg!.style.width = `${w2}px`
    bagImg!.animate([{ transform: 'scale(1.02, 0.9)' }, { transform: 'scale(0.98, 1.04)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' })
    setPhase('shake')
    shakes = 0
    bag!.classList.add('live')
    counter.querySelector<SVGElement>('.dd-prog')!.removeAttribute('hidden')
    drawProg()
    face('smile')
    say('Shake it like you mean it.', 2400)
    hint('Shake it', [BAG.x, bagTop - 10])
    wireBag()
  }

  const drawProg = () => {
    if (!prog) return
    const c = 2 * Math.PI * 80
    prog.style.strokeDasharray = `${c}`
    prog.style.strokeDashoffset = `${c * (1 - shakes / SHAKES)}`
  }
  let shakeDir = 1
  function shakeOnce(wiggle: boolean) {
    if (phase !== 'shake' || !bag) return
    shakes++
    mk.shake()
    hint(null)
    drawProg()
    shakeDir = -shakeDir
    if (wiggle) bag.animate([{ transform: 'translateX(0) rotate(0deg)' }, { transform: `translateX(${shakeDir * 22}px) rotate(${shakeDir * 9}deg)`, offset: 0.4 }, { transform: 'translateX(0) rotate(0deg)' }], { duration: 170, easing: 'ease-out' })
    grains([BAG.x + (Math.random() - 0.5) * 50, bagTop + 8], sugar!.cols, 5, { spread: 60, up: 20, fall: 18, size: 3, round: true })
    if (shakes >= SHAKES) void serve()
  }
  function wireBag() {
    const b = bag!
    let s: { x0: number; last: number; dir: number; ext: number; counted: number } | null = null
    b.onpointerdown = (e) => {
      if (phase !== 'shake') return
      e.stopPropagation()
      b.setPointerCapture(e.pointerId)
      const x = toStage(e)[0]
      s = { x0: x, last: x, dir: 0, ext: x, counted: 0 }
      b.classList.add('held')
    }
    b.onpointermove = (e) => {
      if (!s || phase !== 'shake') return
      const x = toStage(e)[0]
      const off = Math.max(-52, Math.min(52, x - s.x0))
      b.style.transform = `translateX(${off}px) rotate(${off * 0.26}deg)`
      // a shake is a change of direction after a real swing
      const d = Math.sign(x - s.last)
      if (d && d !== s.dir) {
        if (s.dir && Math.abs(s.last - s.ext) > 12) {
          s.counted++
          s.ext = s.last
          shakeOnce(false)
        } else if (!s.dir) s.ext = s.last
        s.dir = d
      }
      if (d) s.last = x
    }
    const up = () => {
      if (!s) return
      const clicked = s.counted === 0
      s = null
      b.classList.remove('held')
      b.style.transform = ''
      if (clicked) shakeOnce(true)
    }
    b.onpointerup = up
    b.onpointercancel = up
  }
  m.onKey((e) => {
    if (e.key !== ' ' || phase !== 'shake') return false
    shakeOnce(true)
    return true
  })

  /** the bag comes open flat on the counter: six sugared minis on the paper, still steaming */
  async function serve() {
    setPhase('serve')
    step('done')
    bubble.classList.add('out')
    const s = sugar!
    const b = bag!
    b.classList.remove('live', 'held')
    b.style.transform = ''
    sfx.ding()
    await b.animate([{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-22px) scale(1.06, 0.96)', offset: 0.45 }, { transform: 'translateY(4px) scale(1.2, 0.5)', opacity: 1, offset: 0.85 }, { transform: 'translateY(8px) scale(1.3, 0.3)', opacity: 0 }], { duration: calm ? 240 : 460, easing: 'ease-in' }).finished
    if (!m.alive) return
    mk.bag()
    grains([BAG.x, 470], s.cols, 16, { spread: 190, up: 34, fall: 26, size: 3.4, round: true })
    const mh = (MINI_W * s.h) / 360
    // sugar that fell off, scattered on the paper (stable per bag)
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const specks = Array.from({ length: 34 }, () => `<circle cx="${(388 + rnd() * 224).toFixed(1)}" cy="${(446 + rnd() * 74).toFixed(1)}" r="${(0.8 + rnd() * 1).toFixed(1)}" fill="${s.cols[Math.floor(rnd() * 3)]}"/>`).join('')
    counter.innerHTML = `
      <svg class="dd-paper" viewBox="0 0 1000 565.5" aria-hidden="true">
        <ellipse cx="500" cy="494" rx="142" ry="46" fill="rgba(46, 22, 6, 0.3)" filter="blur(5px)"/>
        <path d="M 386 440 l 9 -5 9 5 9 -5 9 5 9 -5 9 5 9 -5 9 5 9 -5 9 5 9 -5 9 5 9 -5 9 5 9 -5 9 5 9 -5 9 5 9 -5 9 5 9 -5 9 5 9 -5 9 5 9 -5 L 636 528 l -10 5 -10.5 -5 -10.5 5 -10.5 -5 -10.5 5 -10.5 -5 -10.5 5 -10.5 -5 -10.5 5 -10.5 -5 -10.5 5 -10.5 -5 -10.5 5 -10.5 -5 -10.5 5 -10.5 -5 -10.5 5 -10.5 -5 -10.5 5 -10.5 -5 -10.5 5 -10.5 -5 -10.5 5 -10.5 -5 -10.5 5 -10 -5 Z" fill="#cf9d62" stroke="#2c1a0e" stroke-width="2" stroke-linejoin="round"/>
        <path d="M 458 437 L 446 531 M 546 437 L 560 531" stroke="#a87a45" stroke-width="1.6" opacity=".7"/>
        <path d="M 392 444 L 630 524" stroke="#e2b680" stroke-width="1.2" opacity=".5"/>
        <g fill="#a9773f" opacity=".55"><ellipse cx="420" cy="512" rx="9" ry="4.4"/><ellipse cx="436" cy="519" rx="4" ry="2"/><ellipse cx="598" cy="452" rx="7" ry="3.4"/><ellipse cx="528" cy="520" rx="5" ry="2.4"/></g>
        ${specks}
      </svg>
      ${MINIS.map(([x, y], i) => `<i class="dd-mini-shadow" style="left:${x - MINI_W / 2 - 3}px;top:${y + mh / 2 - 13}px;width:${MINI_W + 6}px;height:17px;z-index:${i < 3 ? 1 : 3}"></i><img class="dd-mini" data-i="${i}" src="${SP}cm-dn-${s.id}.png" alt="" draggable="false" style="left:${x - MINI_W / 2}px;top:${y - mh / 2}px;width:${MINI_W}px;height:${mh}px;z-index:${i < 3 ? 2 : 4};animation-delay:${i * 60}ms">`).join('')}
      <div class="dd-steam"><i></i><i></i><i></i></div>`
    bag = null
    bagImg = null
    prog = null
    face('grin')
    hop()
    m.later(() => face('smile'), 1400)
    after.hidden = false
    for (const mini of counter.querySelectorAll<HTMLImageElement>('.dd-mini')) mini.onpointerdown = (e) => {
      e.stopPropagation()
      eat(mini)
    }
  }

  // ---------- eating ----------
  function eat(mini: HTMLImageElement) {
    if (phase === 'serve') {
      // reaching for one is as good as saying Eat here
      after.hidden = true
      setPhase('eat')
    }
    if (phase !== 'eat' || mini.classList.contains('gone')) return
    mini.classList.add('gone')
    eaten++
    hint(null)
    mk.bite()
    const i = Number(mini.dataset.i)
    const [x, y] = MINIS[i]
    counter.querySelectorAll<HTMLElement>('.dd-mini-shadow')[i]?.classList.add('gone')
    mini.style.zIndex = '6'
    mini.animate([{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: 'translate(0, -16px) scale(1.25)', opacity: 1, offset: 0.35 }, { transform: `translate(${(500 - x) * 0.5}px, 46px) scale(2.3)`, opacity: 0 }], { duration: calm ? 180 : 330, easing: 'ease-in', fill: 'forwards' }).onfinish = () => mini.remove()
    grains([x, y], [...sugar!.cols, '#e0a85c'], 9, { spread: 80, up: 26, fall: 34, size: 3.6 })
    if (eaten === HALF_DOZEN) finish()
  }
  q('.dd-eat').onclick = (e) => {
    e.stopPropagation()
    sfx.click()
    after.hidden = true
    setPhase('eat')
    hint('Eat one', [MINIS[1][0], MINIS[1][1] - 34])
  }
  q('.dd-togo').onclick = (e) => {
    e.stopPropagation()
    sfx.click()
    m.close()
  }

  function finish() {
    const s = sugar!
    bump('snacks')
    g.stamp('hot-minis')
    bump(`cm:sugar:${s.id}`)
    if (SUGARS.every((x) => save.stats[`cm:sugar:${x.id}`])) g.stamp('sugar-flight')
    if (!save.stats['cm:doughnuts']) bump('cm:doughnuts')
    if (['cm:tacos', 'cm:oysters', 'cm:doughnuts', 'cm:books'].every((k) => save.stats[k])) g.stamp('market-crawl')
    sfx.levelUp()
    face('grin')
    hop()
    // the paper gets balled up, and he asks again
    m.later(() => {
      counter.classList.add('done')
      m.later(() => {
        counter.innerHTML = ''
        counter.classList.remove('done')
        reset()
        face('smile')
        ask(false)
      }, 460)
    }, 900)
  }
  function reset() {
    sugar = null
    paid = false
    pulls = 0
    pending = 0
    inTray = 0
    eaten = 0
    shakes = 0
    rings.length = 0
    trayEl.innerHTML = ''
    for (const l of lamps) l.classList.remove('on')
    markJar()
  }

  // ---------- leaving ----------
  q('.dd-leave').onclick = () => {
    sfx.click()
    m.close()
  }
  root.addEventListener('pointerdown', () => showLabel(null))
  m.onClose(() => {
    clearTimeout(bubbleT)
    // To go, or walking off once it's paid for: the bag comes with you
    if (paid && eaten < HALF_DOZEN && g.owns(ITEM)) g.wear(ITEM)
  })

  // hello
  step('sugar')
  setPhase('sugar')
  m.later(() => {
    face('grin')
    hop()
    ask(true)
  }, 380)
  m.later(() => face('smile'), 1800)
}
