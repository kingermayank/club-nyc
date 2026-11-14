import './tacos.css'
import { sfx } from '../../audio'
import { avatarMarkup } from '../../avatar/render'
import { randomLook } from '../../avatar/random'
import { SKINS, type Look } from '../../avatar/look'
import { el, toStage } from '../../engine/stage'
import { mk } from '../../sound/market'
import { bump, save } from '../../state'
import type { Game } from '../../types'
import { openMoment } from './kit'

/**
 * Dos Tacos No. 2, the taqueria in Chelsea Market, first person over its painting (art/places/cm-tacos.jpg).
 * It runs the way the real counter does: you order and PAY first and get a paper ticket, you hand the ticket to
 * the taquero, corn tortillas come off the griddle, adobada is shaved off the spinning trompo with a long knife
 * (here you do the shaving), he asks "¿Con todo?", flicks a piece of pineapple off the top of the trompo at your
 * taco (catch it), you squeeze a lime and eat standing at the counter.
 */

const BG = '/art/places/cm-tacos.jpg'
const SP = '/art/places/sprites/'
const COIN = '/art/icons/coin.png'
const NS = 'http://www.w3.org/2000/svg'

type Pt2 = [number, number]
type Fill = 'adobada' | 'pollo' | 'nopal'
const FILLS: Record<Fill, { name: string; price: number; sprite: string; h: number }> = {
  adobada: { name: 'Adobada', price: 3, sprite: 'cm-adobada.png', h: 364 },
  pollo: { name: 'Pollo Asado', price: 3, sprite: 'cm-pollo.png', h: 361 },
  nopal: { name: 'Nopal', price: 2, sprite: 'cm-nopal.png', h: 352 },
}
/** the catalog item you buy the first time and walk off holding */
const ITEM = 'taco'

type Top = 'onion' | 'cilantro' | 'roja' | 'verde' | 'guac'
const TOPS: Record<Top, { label: string; from: Pt2; blob: [string, string] }> = {
  onion: { label: 'Onion', from: [578, 366], blob: ['#fffdf6', '#d9d2c2'] },
  cilantro: { label: 'Cilantro', from: [636, 366], blob: ['#57b53a', '#2f7d22'] },
  roja: { label: 'Salsa Roja', from: [697, 366], blob: ['#f0553f', '#a51f17'] },
  verde: { label: 'Salsa Verde', from: [757, 366], blob: ['#c3dc4a', '#6f8a17'] },
  guac: { label: 'Guacamole', from: [815, 368], blob: ['#b9dd6a', '#5f8f24'] },
}

// ---------- the painting, in stage units (2000 × 1131 drawn at 1000 × 565.5) ----------
/** the meat on the spit, traced */
const MEAT: Pt2[] = [[186, 219], [226, 218], [254, 228], [262, 242], [258, 262], [249, 290], [240, 318], [236, 346], [214, 352], [191, 347], [184, 318], [172, 290], [162, 262], [160, 240], [168, 227]]
const SHAPES: { id: string; label: string; pts: Pt2[] }[] = [
  { id: 'trompo', label: 'Trompo', pts: MEAT },
  { id: 'onion', label: TOPS.onion.label, pts: [[548, 346], [605, 346], [609, 390], [608, 414], [552, 414], [549, 390]] },
  { id: 'cilantro', label: TOPS.cilantro.label, pts: [[607, 346], [663, 346], [667, 390], [668, 414], [610, 414], [610, 390]] },
  { id: 'roja', label: TOPS.roja.label, pts: [[665, 346], [722, 346], [728, 390], [729, 414], [670, 414], [669, 390]] },
  { id: 'verde', label: TOPS.verde.label, pts: [[724, 346], [780, 346], [790, 390], [791, 414], [731, 414], [730, 390]] },
  { id: 'guac', label: TOPS.guac.label, pts: [[782, 346], [838, 346], [852, 390], [853, 414], [793, 414], [792, 390]] },
  { id: 'limes', label: 'Limes', pts: [[846, 362], [858, 350], [880, 343], [905, 344], [922, 352], [927, 366], [918, 388], [902, 400], [872, 400], [854, 388]] },
]
const PINE_TOP: Pt2 = [208, 198]
const GRIDDLE: Pt2 = [498, 336]
const STACK: Pt2 = [345, 360]
const LIMES: Pt2 = [885, 358]
/** the taquero's hands, more or less */
const HANDS: Pt2 = [432, 388]
const TICKET_AT: Pt2 = [650, 476]
const KNIFE_REST: Pt2 = [298, 300]

// ---------- the plate (sprite px: 460 × 395) ----------
const PL = { w: 460, h: 395, show: 176, at: [452, 468] as Pt2 }
const K = PL.show / PL.w
const PX = PL.at[0] - PL.show / 2
const PY = PL.at[1] - (PL.h * K) / 2
/** the two tortillas on the plate sprite, fitted: [cx, cy, rx, ry, degrees] */
const TORTS: [number, number, number, number, number][] = [[179, 177, 145, 116, -16], [275, 221, 159, 121, -16]]
/** where the filling sits on the front tortilla, and how wide the heap is drawn */
const HEAP = { cx: 275, cy: 210, w: 240 }
const toScreen = (x: number, y: number): Pt2 => [PX + x * K, PY + y * K]
const HEAP_AT = toScreen(HEAP.cx, HEAP.cy)

const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]
const svgEl = <T extends keyof SVGElementTagNameMap>(tag: T, attrs: Record<string, string | number>) => {
  const n = document.createElementNS(NS, tag)
  for (const [a, v] of Object.entries(attrs)) n.setAttribute(a, String(v))
  return n
}

export function tacoStand(g: Game) {
  const m = openMoment('mo-tacos')

  // the taquero: cap, apron, nothing hiding the face
  const look: Look = (() => {
    const l = randomLook(0.2)
    l.hairColor = l.hairColor % 6
    if (['afro', 'puffs', 'long', 'locs', 'braids'].includes(l.hair)) l.hair = 'short'
    l.items = { head: 'sig-cap', body: 'barista-apron', legs: l.items.legs, feet: l.items.feet }
    return l
  })()
  const skin = SKINS[look.skin] ?? SKINS[0]
  /** the long look: half-shut eyes, one eyebrow up */
  const stareMarks = (fx: number) => {
    const lid = (x: number) => `<path d="M ${x - 6.6} -94.2 A 6.6 8 0 0 1 ${x + 6.6} -94.2 Z" fill="${skin}"/><path d="M ${x - 6.4} -94.2 L ${x + 6.4} -94.2" stroke="#1d2140" stroke-width="2.4" stroke-linecap="round"/>`
    return `<g>${lid(-11 + fx)}${lid(11 + fx)}<path d="M ${-17 + fx} -104.5 L ${-5 + fx} -104.5" stroke="${skin}" stroke-width="5.5" stroke-linecap="round"/><path d="M ${-17 + fx} -107 Q ${-11 + fx} -117 ${-5 + fx} -110" fill="none" stroke="#2a2030" stroke-width="3" stroke-linecap="round"/><path d="M ${5 + fx} -101.5 L ${17 + fx} -102.5" fill="none" stroke="#2a2030" stroke-width="3" stroke-linecap="round"/></g>`
  }
  const vendorSvg = (mood: 'smile' | 'grin' | 'o', stare = false) =>
    `<svg viewBox="-60 -185 120 192" aria-hidden="true">${avatarMarkup(look, { mood })}${stare ? stareMarks(3) : ''}</svg>`

  const pickBtn = (f: Fill) =>
    `<button class="tc-pick" type="button" data-f="${f}"><img src="${SP}${FILLS[f].sprite}" alt="" draggable="false"><span>${FILLS[f].name}</span><em><img src="${COIN}" alt="">${FILLS[f].price}</em></button>`
  const root = el('div', 'tc')
  root.innerHTML = `
    <img class="tc-bg" src="${BG}" alt="" draggable="false">
    <div class="tc-heat"></div>
    <div class="tc-spin"><i></i></div>
    <div class="tc-steam"><i></i><i></i><i></i></div>
    <div class="tc-guy"><div class="tc-guy-body">${vendorSvg('smile')}</div></div>
    <p class="tc-bubble" hidden></p>
    <svg class="tc-shapes" viewBox="0 0 1000 565.5" aria-hidden="true">${SHAPES.map((sh) => `<polygon class="tc-shape" data-id="${sh.id}" points="${sh.pts.map((p) => p.join(',')).join(' ')}"/>`).join('')}</svg>
    <div class="tc-menu" hidden><b>What’ll it be?</b><div class="tc-picks">${(['adobada', 'pollo', 'nopal'] as const).map(pickBtn).join('')}</div><button class="btn go tc-paybtn" type="button" hidden></button></div>
    <div class="tc-ask" hidden><b>¿Con todo?</b><div><button class="btn small go tc-todo" type="button">Con todo</button><button class="btn small ghost tc-choose" type="button">I’ll pick</button></div></div>
    <button class="btn tiny ghost tc-done" type="button" hidden>That’s it</button>
    <div class="tc-plate"></div>
    <img class="tc-knife" src="${SP}cm-knife.png" alt="" draggable="false" hidden>
    <img class="tc-lime" src="${SP}cm-lime.png" alt="" draggable="false" hidden>
    <div class="tc-after" hidden><button class="btn small go tc-eat" type="button">Eat here</button><button class="btn small ghost tc-togo" type="button">To go</button></div>
    <ol class="tc-steps"><li data-s="order">Order</li><li data-s="ticket">Ticket</li><li data-s="todo">Con todo</li><li data-s="eat">Eat</li></ol>
    <p class="tc-label" hidden></p>
    <div class="tc-actions"><span class="tc-coins"><img src="${COIN}" alt=""><b></b></span><button class="btn tiny ghost tc-leave" type="button">Leave</button></div>
    <p class="tc-hint" hidden><span></span></p>
    <p class="tc-shout" hidden></p>`
  m.root.append(root)
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as unknown as T
  const guy = q('.tc-guy')
  const guyBody = q('.tc-guy-body')
  const bubble = q('.tc-bubble')
  const plate = q('.tc-plate')
  const shapes = q<SVGSVGElement>('.tc-shapes')
  const menu = q('.tc-menu')
  const payBtn = q<HTMLButtonElement>('.tc-paybtn')
  const askEl = q('.tc-ask')
  const doneBtn = q('.tc-done')
  const afterEl = q('.tc-after')
  const knife = q<HTMLImageElement>('.tc-knife')
  const limeEl = q<HTMLImageElement>('.tc-lime')
  const hintEl = q('.tc-hint')
  const label = q('.tc-label')
  const coinsEl = q('.tc-coins b')
  const shoutEl = q('.tc-shout')
  coinsEl.textContent = String(save.coins)

  // ---------- small helpers ----------
  const face = (mood: 'smile' | 'grin' | 'o', stare = false) => (guyBody.innerHTML = vendorSvg(mood, stare))
  let bubbleT = 0
  const say = (text: string, ms = 1600) => {
    bubble.textContent = text
    bubble.hidden = false
    bubble.classList.remove('out')
    bubble.style.animation = 'none'
    void bubble.offsetWidth
    bubble.style.animation = ''
    clearTimeout(bubbleT)
    bubbleT = window.setTimeout(() => bubble.classList.add('out'), ms)
  }
  const hint = (text: string | null, at?: Pt2) => {
    if (!text) return void hintEl.classList.add('out')
    hintEl.querySelector('span')!.textContent = text
    if (at) hintEl.style.cssText = `left:${at[0]}px;top:${at[1]}px`
    hintEl.hidden = false
    hintEl.classList.remove('out')
  }
  const shout = (text: string, at: Pt2) => {
    shoutEl.textContent = text
    shoutEl.style.cssText = `left:${at[0]}px;top:${at[1]}px`
    shoutEl.hidden = false
    shoutEl.classList.remove('go')
    void shoutEl.offsetWidth
    shoutEl.classList.add('go')
  }
  const hop = () => {
    guy.classList.remove('hop')
    void guy.offsetWidth
    guy.classList.add('hop')
  }
  const reach = (side: 'l' | 'r' | null) => {
    guy.classList.toggle('reach-l', side === 'l')
    guy.classList.toggle('reach-r', side === 'r')
  }
  const wait = (ms: number) => new Promise<void>((done) => m.later(done, ms))
  /** something tossed across the scene: it lands at `to` (its top centre) with a small overshoot */
  const toss = (node: HTMLElement, from: Pt2, to: Pt2, w: number, ms = 620, lift = 90, spin = -18) =>
    new Promise<void>((done) => {
      node.classList.add('tc-fly')
      node.style.left = `${to[0] - w / 2}px`
      node.style.top = `${to[1]}px`
      node.style.width = `${w}px`
      root.append(node)
      const dx = from[0] - to[0]
      const dy = from[1] - to[1]
      const a = node.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.32) rotate(${spin}deg)`, offset: 0 },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(0.78) rotate(${-spin / 2}deg)`, offset: 0.55 },
          { transform: 'translate(0, -6px) scale(1.04) rotate(0deg)', offset: 0.86 },
          { transform: 'translate(0, 0) scale(1) rotate(0deg)', offset: 1 },
        ],
        { duration: calm() ? 1 : ms, easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)' },
      )
      a.onfinish = () => {
        node.remove()
        done()
      }
    })
  const fly = (src: string, from: Pt2, to: Pt2, w: number, ms = 620, lift = 90) => {
    const f = el('img') as HTMLImageElement
    f.src = src
    f.draggable = false
    return toss(f, from, to, w, ms, lift)
  }

  // ---------- state ----------
  type Phase = 'order' | 'ticket' | 'busy' | 'shave' | 'ask' | 'pick' | 'pina' | 'ready' | 'eat'
  let phase: Phase = 'busy'
  let choice: Fill | null = null
  let fill: Fill | null = null
  let paid = false
  let paying = false
  let eaten = false
  let foodSvg: SVGSVGElement | null = null
  let tops: SVGGElement | null = null
  let biteMask: SVGMaskElement | null = null
  let bites = 0
  let strokes = 0
  let guided = false
  let limeHinted = false
  let held: 'knife' | 'lime' | null = null
  const on: Record<Top, boolean> = { onion: false, cilantro: false, roja: false, verde: false, guac: false }
  let pos: Pt2 = [500, 300]

  // ---------- the steps along the bottom ----------
  type Step = 'order' | 'ticket' | 'todo' | 'eat'
  const ORDER: Step[] = ['order', 'ticket', 'todo', 'eat']
  const step = (st: Step) => {
    const n = ORDER.indexOf(st)
    for (const li of root.querySelectorAll<HTMLElement>('.tc-steps li')) {
      const i = ORDER.indexOf(li.dataset.s as Step)
      li.classList.toggle('done', i < n)
      li.classList.toggle('now', i === n)
    }
  }

  // ---------- pointing at things: the glow follows the painted edge, a small pill says what it is ----------
  const showLabel = (text: string | null, at?: Pt2) => {
    if (!text) return void (label.hidden = true)
    label.textContent = text
    label.style.cssText = `left:${at![0]}px;top:${at![1]}px`
    label.hidden = false
  }
  for (const poly of root.querySelectorAll<SVGPolygonElement>('.tc-shape')) {
    const sh = SHAPES.find((s) => s.id === poly.dataset.id)!
    const top: Pt2 = [sh.pts.reduce((a, p) => a + p[0], 0) / sh.pts.length, Math.min(...sh.pts.map((p) => p[1])) - 6]
    if (sh.id === 'trompo') continue // the root's pointerdown does the shaving, and the hint already names it
    poly.onpointerenter = () => {
      if (held) return
      if (phase === 'pick') hint(null)
      showLabel(sh.label, top)
    }
    poly.onpointerleave = () => showLabel(null)
    poly.onpointerdown = (e) => {
      e.stopPropagation()
      showLabel(null)
      if (sh.id === 'limes') return grabLime()
      if (phase !== 'pick') return
      const t = sh.id as Top
      if (on[t]) {
        hop()
        return say('Enough.', 1100)
      }
      hint(null)
      void addTop(t)
    }
  }

  // ---------- 1. order, and pay ----------
  const showMenu = (title: string) => {
    menu.querySelector('b')!.textContent = title
    choice = null
    for (const b of root.querySelectorAll('.tc-pick')) b.classList.remove('on')
    payBtn.hidden = true
    menu.hidden = false
    bubble.classList.add('out')
    phase = 'order'
    step('order')
  }
  for (const b of root.querySelectorAll<HTMLElement>('.tc-pick')) b.onclick = (e) => {
    e.stopPropagation()
    if (phase !== 'order' || paying) return
    choice = b.dataset.f as Fill
    sfx.click()
    for (const o of root.querySelectorAll('.tc-pick')) o.classList.toggle('on', o === b)
    payBtn.innerHTML = `Pay <img src="${COIN}" alt="">${FILLS[choice].price}`
    payBtn.hidden = false
  }
  payBtn.onclick = (e) => {
    e.stopPropagation()
    void pay()
  }
  async function pay() {
    if (!choice || paying || phase !== 'order') return
    const f = FILLS[choice]
    paying = true
    // the catalog price the first time (it puts the taco in your wardrobe), plain coins after
    let ok: boolean
    if (!g.owns(ITEM) && f.price === 3) ok = await g.buy(ITEM)
    else ok = g.spend(f.price, 'cm-tacos')
    paying = false
    if (!m.alive) return
    if (!ok) {
      face('o')
      hop()
      // the menu steps aside so his answer can be read, then comes back
      menu.hidden = true
      say('Short a coin.', 1500)
      m.later(() => {
        face('smile')
        if (phase === 'order') menu.hidden = false
      }, 1700)
      return
    }
    paid = true
    eaten = false
    fill = choice
    phase = 'busy'
    menu.hidden = true
    for (let i = 0; i < f.price; i++) m.later(() => void fly(COIN, [930, 34], [HANDS[0], HANDS[1] - 30], 26, 520, 40), i * 110)
    await wait(520 + f.price * 110)
    sfx.register()
    coinsEl.textContent = String(save.coins)
    face('grin')
    hop()
    await ticketOut(f.name)
    face('smile')
    say('Ticket.', 2200)
    guy.classList.add('want')
    step('ticket')
    phase = 'ticket'
    hint('Hand it over', [TICKET_AT[0], TICKET_AT[1] - 58])
  }

  // ---------- 2. the paper ticket ----------
  let ticket: HTMLElement | null = null
  async function ticketOut(name: string) {
    const no = 20 + Math.floor(Math.random() * 70)
    const t = el('div', 'tc-ticket', `<img src="${SP}cm-ticket.png" alt="" draggable="false"><div><b>No. ${no}</b><i></i><span>1 ${name}</span></div>`)
    ticket = t
    t.style.left = `${TICKET_AT[0]}px`
    t.style.top = `${TICKET_AT[1]}px`
    root.append(t)
    mk.page()
    // it slides over the counter from his side
    const a = t.animate(
      [
        { translate: `${HANDS[0] - TICKET_AT[0]}px ${HANDS[1] - TICKET_AT[1]}px`, scale: '0.4', opacity: 0 },
        { translate: '-14px 0', scale: '1', opacity: 1, offset: 0.8 },
        { translate: '0 0', scale: '1', opacity: 1 },
      ],
      { duration: calm() ? 1 : 520, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    )
    let drag: { dx: number; dy: number; moved: boolean; from: Pt2 } | null = null
    t.onpointerdown = (e) => {
      e.stopPropagation()
      if (phase !== 'ticket') return
      const p = toStage(e) as Pt2
      const at: Pt2 = [parseFloat(t.style.left), parseFloat(t.style.top)]
      drag = { dx: at[0] - p[0], dy: at[1] - p[1], moved: false, from: p }
      t.setPointerCapture(e.pointerId)
      t.classList.add('drag')
      hint(null)
      sfx.click()
    }
    t.onpointermove = (e) => {
      if (!drag) return
      const p = toStage(e) as Pt2
      if (Math.hypot(p[0] - drag.from[0], p[1] - drag.from[1]) > 5) drag.moved = true
      t.style.left = `${p[0] + drag.dx}px`
      t.style.top = `${p[1] + drag.dy}px`
      guy.classList.toggle('near', nearGuy([p[0] + drag.dx, p[1] + drag.dy]))
    }
    const up = () => {
      if (!drag) return
      const d = drag
      drag = null
      t.classList.remove('drag')
      guy.classList.remove('near')
      const at: Pt2 = [parseFloat(t.style.left), parseFloat(t.style.top)]
      // a plain click hands it over too
      if (!d.moved || nearGuy(at)) return void handOver(at)
      t.style.left = `${TICKET_AT[0]}px`
      t.style.top = `${TICKET_AT[1]}px`
      hint('Hand it over', [TICKET_AT[0], TICKET_AT[1] - 58])
    }
    t.onpointerup = up
    t.onpointercancel = up
    await a.finished.catch(() => {})
  }
  const nearGuy = (p: Pt2) => p[0] > 330 && p[0] < 540 && p[1] > 240 && p[1] < 430
  async function handOver(from: Pt2) {
    if (!ticket || phase !== 'ticket') return
    const t = ticket
    ticket = null
    phase = 'busy'
    guy.classList.remove('want')
    hint(null)
    mk.page()
    t.style.pointerEvents = 'none'
    await t
      .animate([{ translate: '0 0', scale: '1', opacity: 1 }, { translate: `${HANDS[0] - from[0]}px ${HANDS[1] - 14 - from[1]}px`, scale: '0.45', opacity: 1, offset: 0.85 }, { translate: `${HANDS[0] - from[0]}px ${HANDS[1] - from[1]}px`, scale: '0.35', opacity: 0 }], { duration: calm() ? 1 : 340, easing: 'ease-in' })
      .finished.catch(() => {})
    t.remove()
    if (!m.alive) return
    hop()
    say(`${FILLS[fill!].name}.`, 1400)
    step('todo')
    void serve()
  }

  // ---------- 3. the plate, the filling ----------
  async function serve() {
    const f = FILLS[fill!]
    // two tortillas off the griddle, onto a paper plate, onto the counter
    reach('r')
    mk.sizzle()
    await wait(260)
    await fly(`${SP}cm-plate.png`, STACK, [PL.at[0], PY], PL.show, 640, 120)
    if (!m.alive) return
    sfx.thunk()
    buildPlate(f)
    reach(null)
    if (fill === 'adobada') {
      // the trompo is yours: he slides the knife over
      await wait(300)
      say('You shave.', 1800)
      reach('l')
      knife.hidden = false
      knife.classList.add('rest')
      knife.style.transform = ''
      knife.animate([{ translate: `${HANDS[0] - KNIFE_REST[0]}px ${HANDS[1] - KNIFE_REST[1]}px`, scale: '0.5', opacity: 0 }, { translate: '0 0', scale: '1', opacity: 1 }], { duration: calm() ? 1 : 420, easing: 'cubic-bezier(0.3, 1.3, 0.5, 1)' })
      await wait(440)
      reach(null)
      strokes = 0
      phase = 'shave'
      root.classList.add('shave')
      hint('Shave the trompo', [211, 212])
      if (!guided) showGuide()
    } else {
      await wait(250)
      reach('r')
      mk.sizzle()
      await wait(420)
      await fly(`${SP}${f.sprite}`, GRIDDLE, [HEAP_AT[0], HEAP_AT[1] - (HEAP.w * K * f.h) / 460 / 2], HEAP.w * K, 600, 110)
      if (!m.alive) return
      mk.plop()
      heap(3)
      reach(null)
      await wait(350)
      ask()
    }
  }

  function buildPlate(f: (typeof FILLS)[Fill]) {
    bites = 0
    for (const t of Object.keys(on) as Top[]) on[t] = false
    const id = 'tc' + Math.random().toString(36).slice(2, 7)
    const torts = TORTS.map(([cx, cy, rx, ry, deg]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${deg} ${cx} ${cy})"/>`).join('')
    const hh = (HEAP.w * f.h) / 460
    plate.innerHTML = `<i class="tc-shadow" style="left:${PX + 6}px;top:${PY + PL.h * K * 0.56}px;width:${PL.show - 12}px;height:${PL.h * K * 0.5}px"></i>
      <svg class="tc-food" viewBox="0 0 ${PL.w} ${PL.h}" style="left:${PX}px;top:${PY}px;width:${PL.show}px;height:${PL.h * K}px" overflow="visible">
        <defs>
          <clipPath id="${id}t">${torts}</clipPath>
          <mask id="${id}b" maskUnits="userSpaceOnUse" x="-80" y="-80" width="${PL.w + 160}" height="${PL.h + 160}"><rect x="-80" y="-80" width="${PL.w + 160}" height="${PL.h + 160}" fill="#fff"/></mask>
        </defs>
        <image href="${SP}cm-plate.png" width="${PL.w}" height="${PL.h}"/>
        <g clip-path="url(#${id}t)"><rect width="${PL.w}" height="${PL.h}" fill="#efe5df"/><ellipse cx="250" cy="215" rx="120" ry="80" fill="#c9a36a" opacity=".16"/><ellipse cx="205" cy="190" rx="26" ry="15" fill="#c9a36a" opacity=".2"/></g>
        <g class="tc-taco" mask="url(#${id}b)">
          <g clip-path="url(#${id}t)"><image href="${SP}cm-plate.png" width="${PL.w}" height="${PL.h}"/></g>
          <image class="tc-heap" href="${SP}${f.sprite}" x="${HEAP.cx - HEAP.w / 2}" y="${HEAP.cy - hh / 2}" width="${HEAP.w}" height="${hh}" style="transform:scale(0)"/>
          <g class="tc-tops"></g>
          <g class="tc-rims" clip-path="url(#${id}t)"></g>
        </g>
      </svg>`
    foodSvg = plate.querySelector<SVGSVGElement>('.tc-food')
    tops = foodSvg!.querySelector('.tc-tops')
    biteMask = foodSvg!.querySelector(`#${id}b`)
    root.classList.add('served')
  }
  /** how much filling is on the tortillas: 0 to 3 */
  const heap = (n: number) => {
    const h = foodSvg?.querySelector<SVGImageElement>('.tc-heap')
    if (h) h.style.transform = `scale(${[0, 0.56, 0.8, 1][n]})`
  }

  // ---------- adobada: you shave the trompo ----------
  function showGuide() {
    guided = true
    const d = 'M 213 228 L 213 338'
    const g2 = svgEl('g', { class: 'tc-guide' })
    g2.innerHTML = `<path d="${d}" fill="none" stroke="#1d2140" stroke-width="7" stroke-linecap="round" opacity=".4"/><path class="tc-guide-dash" d="${d}" fill="none" stroke="#fff" stroke-width="3.5" stroke-dasharray="8 7" stroke-linecap="round"/><circle r="6" fill="#ffd166" stroke="#1d2140" stroke-width="2.5"><animateMotion dur="1.3s" repeatCount="indefinite" path="${d}"/></circle>`
    shapes.append(g2)
  }
  const dropGuide = () => shapes.querySelector('.tc-guide')?.remove()
  const overTrompo = (p: Pt2) => p[0] > 148 && p[0] < 276 && p[1] > 204 && p[1] < 362
  const placeTool = () => {
    if (held === 'knife') knife.style.transform = `translate(${pos[0]}px, ${pos[1]}px) rotate(46deg)`
    else if (held === 'lime') limeEl.style.transform = `translate(${pos[0]}px, ${pos[1]}px) rotate(${overTaco(pos) ? 150 : 20}deg)`
  }
  function grabKnife() {
    held = 'knife'
    knife.classList.remove('rest')
    knife.classList.add('held')
    root.classList.add('holding')
    showLabel(null)
    sfx.click()
    placeTool()
  }
  let press: { y0: number; from: Pt2; counted: boolean } | null = null
  function shaveStroke(at: Pt2) {
    if (phase !== 'shave' || strokes >= 3) return
    strokes++
    const n = strokes
    mk.shave()
    dropGuide()
    hint(null)
    // the cut shows for a moment, and the shavings fall to your tortillas
    const x = Math.max(170, Math.min(250, at[0]))
    const cut = el('i', 'tc-cut')
    cut.style.cssText = `left:${x}px;top:${Math.max(222, at[1] - 70)}px`
    root.append(cut)
    setTimeout(() => cut.remove(), 520)
    for (let i = 0; i < 6; i++) {
      const s = el('i', 'tc-shaving')
      s.style.background = pick(['#c8431f', '#e2622c', '#a83418', '#ef8a4a'])
      s.style.height = `${5 + Math.random() * 3}px`
      m.later(() => void toss(s, [x + (Math.random() - 0.5) * 20, at[1] - 30 + Math.random() * 30], [HEAP_AT[0] + (Math.random() - 0.5) * 44, HEAP_AT[1] - 8 + (Math.random() - 0.5) * 18], 13 + Math.random() * 6, 430 + Math.random() * 120, 46, -200), i * 28)
    }
    m.later(() => {
      heap(n)
      mk.plop()
    }, 430)
    if (n < 3) return
    // enough for a taco: the knife goes back
    phase = 'busy'
    root.classList.remove('shave')
    m.later(() => {
      held = null
      root.classList.remove('holding')
      knife.classList.remove('held')
      knife.hidden = true
      face('grin')
      hop()
      say(pick(['Not bad.', 'You’re hired.']), 1300)
      m.later(() => {
        face('smile')
        ask()
      }, 1100)
    }, 560)
  }

  // ---------- "¿Con todo?" ----------
  function ask() {
    phase = 'ask'
    bubble.classList.add('out')
    askEl.hidden = false
    hop()
  }
  q('.tc-todo').onclick = async (e) => {
    e.stopPropagation()
    if (phase !== 'ask') return
    phase = 'busy'
    askEl.hidden = true
    sfx.click()
    reach('r')
    for (const t of ['onion', 'cilantro', 'roja', 'guac'] as const) {
      await addTop(t)
      await wait(90)
    }
    reach(null)
    afterTops()
  }
  q('.tc-choose').onclick = (e) => {
    e.stopPropagation()
    if (phase !== 'ask') return
    sfx.click()
    askEl.hidden = true
    phase = 'pick'
    root.classList.add('picking')
    doneBtn.hidden = false
    hint('Pick toppings', [697, 338])
  }
  doneBtn.onclick = (e) => {
    e.stopPropagation()
    if (phase !== 'pick') return
    sfx.click()
    afterTops()
  }

  /** a spoonful from its pan onto the taco */
  async function addTop(t: Top) {
    if (on[t] || !tops) return
    on[t] = true
    const b = el('i', 'tc-blob')
    b.style.background = `radial-gradient(circle at 38% 32%, ${TOPS[t].blob[0]}, ${TOPS[t].blob[1]})`
    await toss(b, TOPS[t].from, [HEAP_AT[0], HEAP_AT[1] - 10], 20, 360, 70, 0)
    if (!m.alive || !tops) return
    mk.plop()
    drawTop(t)
    foodSvg?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03, 0.97)' }, { transform: 'scale(1)' }], { duration: 180 })
  }
  function drawTop(t: Top) {
    const layer = svgEl('g', { class: `tc-top tc-top-${t}` })
    /** n spots spread evenly over the heap */
    const spots = (n: number, turn: number, rx = 76, ry = 50): Pt2[] =>
      Array.from({ length: n }, (_, i) => {
        const a = i * 2.4 + turn
        const r = Math.sqrt((i + 0.6) / n)
        return [HEAP.cx + Math.cos(a) * rx * r + (Math.random() - 0.5) * 8, HEAP.cy - 6 + Math.sin(a) * ry * r + (Math.random() - 0.5) * 8]
      })
    // each bit pops in inside its own wrapper, so the pop never fights the bit's own rotation
    const bit = (n: SVGElement) => {
      const w = svgEl('g', { class: 'tc-bit' })
      w.append(n)
      layer.append(w)
    }
    if (t === 'onion') {
      for (const [x, y] of spots(12, 0.4)) bit(svgEl('rect', { x: x - 8, y: y - 7, width: 16, height: 14, rx: 4, fill: Math.random() < 0.5 ? '#fffdf6' : '#f1ecdd', stroke: '#6f6152', 'stroke-width': 2.2, transform: `rotate(${Math.random() * 90} ${x} ${y})` }))
    } else if (t === 'cilantro') {
      for (const [x, y] of spots(11, 1.7)) {
        const leaf = svgEl('g', { transform: `rotate(${Math.random() * 360} ${x} ${y})` })
        leaf.innerHTML = `<path d="M ${x} ${y + 3} l 0 11" stroke="#2f7d22" stroke-width="2.4" stroke-linecap="round"/><circle cx="${x - 6}" cy="${y}" r="6" fill="#3f9a2a" stroke="#1d3a1a" stroke-width="1.8"/><circle cx="${x + 6}" cy="${y}" r="6" fill="#3f9a2a" stroke="#1d3a1a" stroke-width="1.8"/><circle cx="${x}" cy="${y - 6}" r="6.5" fill="#57b53a" stroke="#1d3a1a" stroke-width="1.8"/>`
        bit(leaf)
      }
    } else if (t === 'roja' || t === 'verde') {
      const c = t === 'roja' ? { main: '#d93a2b', edge: '#8e1612', speck: '#ffd9a8' } : { main: '#a8c62f', edge: '#5f7d14', speck: '#eef7b0' }
      for (const [x, y] of spots(6, t === 'roja' ? 3.1 : 5.2, 66, 42)) {
        const rx = 17 + Math.random() * 8
        const ry = 10 + Math.random() * 5
        const blob = svgEl('g', { transform: `rotate(${(Math.random() - 0.5) * 60} ${x} ${y})` })
        blob.innerHTML = `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c.main}" stroke="${c.edge}" stroke-width="2.6"/><ellipse cx="${x - rx * 0.3}" cy="${y - ry * 0.35}" rx="${rx * 0.34}" ry="${ry * 0.24}" fill="#fff" opacity=".5"/><circle cx="${x + rx * 0.35}" cy="${y + ry * 0.2}" r="2.6" fill="${c.speck}"/><circle cx="${x - rx * 0.1}" cy="${y + ry * 0.4}" r="2" fill="${c.speck}"/>`
        bit(blob)
      }
    } else {
      const [x, y] = [HEAP.cx + 52, HEAP.cy + 26]
      const dollop = svgEl('g', {})
      dollop.innerHTML = `<path d="M ${x - 38} ${y + 4} C ${x - 42} ${y - 20} ${x - 16} ${y - 32} ${x + 4} ${y - 26} C ${x + 28} ${y - 34} ${x + 46} ${y - 10} ${x + 38} ${y + 8} C ${x + 34} ${y + 28} ${x + 8} ${y + 32} ${x - 8} ${y + 26} C ${x - 26} ${y + 32} ${x - 36} ${y + 20} ${x - 38} ${y + 4} Z" fill="#a6d15a" stroke="#4f7a1e" stroke-width="3"/><path d="M ${x - 22} ${y - 8} q 10 -12 24 -8" fill="none" stroke="#d6ee98" stroke-width="5" stroke-linecap="round"/><path d="M ${x + 6} ${y + 12} q 12 4 20 -6" fill="none" stroke="#7fae3a" stroke-width="4" stroke-linecap="round"/><circle cx="${x - 12}" cy="${y + 10}" r="3" fill="#7fae3a"/><circle cx="${x + 18}" cy="${y - 10}" r="2.6" fill="#d6ee98"/>`
      bit(dollop)
    }
    tops!.append(layer)
  }
  const hasSalsa = () => on.roja || on.verde
  const conTodo = () => on.onion && on.cilantro && hasSalsa() && on.guac

  async function afterTops() {
    phase = 'busy'
    root.classList.remove('picking')
    doneBtn.hidden = true
    hint(null)
    showLabel(null)
    if (!Object.values(on).some(Boolean)) {
      // nothing on it at all: a long look
      face('o', true)
      guy.classList.add('staring')
      sfx.tick()
      say('…', 1700)
      await wait(1800)
      guy.classList.remove('staring')
      face('smile')
      say('Plain. OK.', 1300)
      await wait(900)
    } else await wait(250)
    if (!m.alive) return
    if (fill === 'adobada') void pina()
    else ready()
  }

  // ---------- the pineapple, flicked off the top of the trompo ----------
  async function pina() {
    phase = 'pina'
    reach('l')
    face('grin')
    say('Heads up.', 1200)
    await wait(calm() ? 900 : 620)
    if (!m.alive) return
    sfx.whoosh()
    mk.shave()
    const W = 54
    const p = el('button', 'tc-pine', `<img src="${SP}cm-pineapple.png" alt="" draggable="false">`) as HTMLButtonElement
    p.type = 'button'
    p.setAttribute('aria-label', 'Pineapple')
    root.append(p)
    const from = PINE_TOP
    const to: Pt2 = [786, 462]
    const dur = calm() ? 2 : 1.1
    let t = 0
    let live = true
    let at: Pt2 = from
    const put = (x: number, y: number, rot: number) => {
      at = [x, y]
      p.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`
    }
    put(from[0], from[1], 0)
    m.frame((dt) => {
      if (!live) return
      t += dt / dur
      if (t >= 1) {
        live = false
        return void missed()
      }
      put(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t - 4 * 190 * t * (1 - t), t * 420)
    })
    const end = () => {
      reach(null)
      m.later(() => face('smile'), 900)
      m.later(ready, 700)
    }
    p.onpointerdown = (e) => {
      e.stopPropagation()
      if (!live) return
      live = false
      p.style.pointerEvents = 'none'
      sfx.pop()
      // caught: it drops onto your taco
      const land = toScreen(HEAP.cx - 26, HEAP.cy - 44)
      const a = p.animate([{ transform: p.style.transform }, { transform: `translate(${(at[0] + land[0]) / 2}px, ${Math.min(at[1], land[1]) - 40}px) rotate(380deg) scale(0.9)`, offset: 0.5 }, { transform: `translate(${land[0]}px, ${land[1]}px) rotate(360deg) scale(${(74 * K) / W})` }], { duration: calm() ? 1 : 300, easing: 'ease-in' })
      a.onfinish = () => {
        p.remove()
        if (!m.alive || !tops) return
        const img = svgEl('image', { href: `${SP}cm-pineapple.png`, x: HEAP.cx - 63, y: HEAP.cy - 78, width: 74, height: 69, class: 'tc-bit tc-pina' })
        tops.append(img)
        mk.plop()
        g.stamp('pina-catch')
        hop()
        say('¡Eso!', 1400)
        end()
      }
    }
    function missed() {
      p.style.pointerEvents = 'none'
      sfx.thunk()
      // off the counter and away
      const a = p.animate([{ transform: p.style.transform, opacity: 1 }, { transform: `translate(${to[0] + 70}px, ${to[1] - 58}px) rotate(560deg)`, opacity: 1, offset: 0.45 }, { transform: `translate(${to[0] + 150}px, ${to[1] + 40}px) rotate(700deg)`, opacity: 0 }], { duration: 520, easing: 'ease-out' })
      a.onfinish = () => p.remove()
      face('o')
      guy.classList.remove('shrug')
      void guy.offsetWidth
      guy.classList.add('shrug')
      say('Happens.', 1300)
      end()
    }
  }

  // ---------- limes ----------
  function grabLime() {
    if (!root.classList.contains('served') || eaten || held === 'knife' || !['ask', 'pick', 'ready', 'eat'].includes(phase)) return
    if (held === 'lime') return dropLime()
    held = 'lime'
    limeEl.hidden = false
    root.classList.add('holding')
    sfx.pop()
    hint(null)
    placeTool()
  }
  function dropLime() {
    if (held !== 'lime') return
    held = null
    limeEl.hidden = true
    root.classList.remove('holding')
  }
  function squeeze() {
    mk.squeeze()
    limeEl.animate([{ scale: '1' }, { scale: '0.78 1.1' }, { scale: '1' }], { duration: 260 })
    for (let i = 0; i < 5; i++) {
      const d = el('i', 'tc-drop')
      d.style.cssText = `left:${pos[0] - 6 + Math.random() * 12}px;top:${pos[1] + 6}px`
      root.append(d)
      d.animate([{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 16}px, ${26 + Math.random() * 16}px) scale(0.7)`, opacity: 0 }], { duration: 300 + i * 50, delay: i * 45, easing: 'ease-in', fill: 'backwards' }).onfinish = () => d.remove()
    }
    if (tops) {
      const layer = svgEl('g', { class: 'tc-top' })
      const [fx, fy] = [(pos[0] - PX) / K, (pos[1] - PY) / K]
      for (let i = 0; i < 4; i++) {
        const x = Math.max(HEAP.cx - 80, Math.min(HEAP.cx + 80, fx)) + (Math.random() - 0.5) * 70
        const y = Math.max(HEAP.cy - 50, Math.min(HEAP.cy + 40, fy + 40)) + (Math.random() - 0.5) * 44
        const dot = svgEl('g', { class: 'tc-bit' })
        dot.innerHTML = `<ellipse cx="${x}" cy="${y}" rx="7" ry="5" fill="#eaf7a6" opacity=".85" stroke="#9fb93a" stroke-width="1.4"/><circle cx="${x - 2}" cy="${y - 1.5}" r="1.8" fill="#fff"/>`
        layer.append(dot)
      }
      tops.append(layer)
    }
    bump('cm:lime')
    m.later(dropLime, 420)
  }

  // ---------- 4. eat here, or to go ----------
  function ready() {
    if (!m.alive) return
    phase = 'ready'
    step('eat')
    root.classList.add('eating')
    afterEl.hidden = false
    if (!limeHinted) {
      limeHinted = true
      hint('Squeeze a lime', [LIMES[0], 340])
      m.later(() => held !== 'lime' && phase === 'ready' && hint(null), 4200)
    }
  }
  const eatHere = () => {
    afterEl.hidden = true
    phase = 'eat'
    root.classList.add('eating')
    hint('Take a bite!', [PL.at[0], PY + 14])
  }
  q('.tc-eat').onclick = (e) => {
    e.stopPropagation()
    if (phase !== 'ready') return
    sfx.click()
    dropLime()
    eatHere()
  }
  q('.tc-togo').onclick = (e) => {
    e.stopPropagation()
    sfx.click()
    m.close()
  }

  const overTaco = (p: Pt2) => {
    if (!foodSvg) return false
    const [cx, cy] = toScreen(235, 200)
    return ((p[0] - cx) / (200 * K)) ** 2 + ((p[1] - cy) / (150 * K)) ** 2 <= 1
  }
  function bite(at: Pt2) {
    if (!biteMask || !foodSvg || bites >= 3) return
    if (phase === 'ready') eatHere()
    bites++
    hint(null)
    mk.bite()
    const last = bites === 3
    const cy = 200
    const rims = foodSvg.querySelector('.tc-rims')!
    const shapesB: SVGElement[] = []
    if (last) shapesB.push(svgEl('rect', { x: -60, y: -60, width: PL.w + 120, height: PL.h + 120 }))
    else {
      // bites walk in from the right: an oval with a row of tooth scallops on its leading edge
      const edge = bites === 1 ? 300 : 172
      const rx = 64
      const ry = 180
      const cx = edge + rx
      shapesB.push(svgEl('rect', { x: cx, y: -60, width: PL.w, height: PL.h + 120 }), svgEl('ellipse', { cx, cy, rx, ry }))
      for (const deg of [128, 146, 163, 180, 197, 214, 232]) {
        const a = (deg * Math.PI) / 180
        shapesB.push(svgEl('circle', { cx: (cx + Math.cos(a) * rx).toFixed(1), cy: (cy + Math.sin(a) * ry).toFixed(1), r: 30 }))
      }
    }
    for (const sh of shapesB) {
      const hole = sh.cloneNode() as SVGElement
      hole.setAttribute('fill', '#000')
      biteMask.append(hole)
      if (sh.tagName !== 'circle') continue
      // the soft inside of the tortilla shows along the tooth marks
      const soft = sh.cloneNode() as SVGElement
      soft.setAttribute('fill', 'none'); soft.setAttribute('stroke', '#f7e3a4'); soft.setAttribute('stroke-width', '14')
      const line = sh.cloneNode() as SVGElement
      line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#1d2140'); line.setAttribute('stroke-width', '3.5'); line.setAttribute('opacity', '0.8')
      rims.append(soft, line)
    }
    foodSvg.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.96, 1.03) translateY(2px)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' })
    crumbs(at)
    if (last) finish()
  }
  function crumbs(at: Pt2) {
    for (let i = 0; i < 9; i++) {
      const c = el('i', 'tc-crumb')
      const dx = (Math.random() - 0.5) * 90
      const up = 18 + Math.random() * 26
      const fall = 20 + Math.random() * 30
      c.style.cssText = `left:${at[0]}px;top:${at[1]}px;background:${i % 3 ? '#e9b84f' : i % 2 ? '#c8431f' : '#c98a3a'};width:${4 + Math.random() * 4}px;height:${4 + Math.random() * 3}px`
      root.append(c)
      c.animate(
        [
          { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          { transform: `translate(${dx * 0.6}px, ${-up}px) rotate(120deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${dx}px, ${fall}px) rotate(260deg)`, opacity: 0 },
        ],
        { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
      ).onfinish = () => c.remove()
    }
  }

  function finish() {
    const all = conTodo()
    eaten = true
    phase = 'busy'
    dropLime()
    root.classList.remove('eating')
    shout(all ? '¡Con todo!' : '¡Rico!', [PL.at[0], 196])
    sfx.levelUp()
    hop()
    face('grin')
    bump('snacks')
    g.stamp('dos-tacos')
    if (all) g.stamp('con-todo')
    if (!save.stats['cm:tacos']) bump('cm:tacos')
    if (['cm:tacos', 'cm:oysters', 'cm:doughnuts', 'cm:books'].every((k) => save.stats[k])) g.stamp('market-crawl')
    // the plate goes, and he's already on the next one
    m.later(() => {
      plate.classList.add('done')
      say('Next!', 1300)
      m.later(() => {
        plate.innerHTML = ''
        plate.classList.remove('done')
        root.classList.remove('served')
        foodSvg = tops = biteMask = null
        fill = null
        paid = false
        face('smile')
        m.later(() => showMenu('Another?'), 900)
      }, 480)
    }, 1100)
  }

  // ---------- the pointer ----------
  root.addEventListener('pointermove', (e) => {
    pos = toStage(e) as Pt2
    placeTool()
    if (press && !press.counted && held === 'knife' && pos[1] - press.y0 > 46) {
      press.counted = true
      shaveStroke(pos)
    }
  })
  root.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement
    if (t.closest('.tc-actions, .tc-menu, .tc-ask, .tc-after, .tc-done, .tc-ticket, .tc-pine')) return
    pos = toStage(e) as Pt2
    if (phase === 'shave') {
      const onKnife = t === knife
      if (held !== 'knife' && (onKnife || overTrompo(pos))) grabKnife()
      if (held === 'knife' && overTrompo(pos) && !onKnife) {
        root.setPointerCapture(e.pointerId)
        press = { y0: pos[1], from: pos, counted: false }
      }
      return
    }
    if (held === 'lime') {
      if (overTaco(pos)) return squeeze()
      return dropLime()
    }
    if (overTaco(pos) && (phase === 'ready' || phase === 'eat')) bite(pos)
  })
  const up = () => {
    if (!press) return
    const p = press
    press = null
    if (p.counted || phase !== 'shave' || Math.hypot(pos[0] - p.from[0], pos[1] - p.from[1]) > 8) return
    // a plain click: the knife makes the stroke itself
    knife.animate([{ translate: '0 0' }, { translate: '0 64px' }, { translate: '0 0' }], { duration: calm() ? 1 : 340, easing: 'ease-in-out' })
    const at: Pt2 = [pos[0], Math.min(340, pos[1] + 60)]
    m.later(() => shaveStroke(at), calm() ? 0 : 150)
  }
  root.addEventListener('pointerup', up)
  root.addEventListener('pointercancel', up)

  // ---------- leaving ----------
  q('.tc-leave').onclick = () => {
    sfx.click()
    m.close()
  }
  m.onClose(() => {
    clearTimeout(bubbleT)
    // paid and not eaten (To go, or walking off mid-way): the taco comes with you
    if (paid && !eaten && g.owns(ITEM)) g.wear(ITEM)
  })

  // hello
  step('order')
  m.later(() => {
    face('grin')
    hop()
    showMenu('What’ll it be?')
  }, 380)
  m.later(() => face('smile'), 1800)
}
