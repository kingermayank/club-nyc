import './hotdog.css'
import { sfx } from '../../audio'
import { avatarMarkup } from '../../avatar/render'
import { randomLook } from '../../avatar/random'
import { SKINS, type Look } from '../../avatar/look'
import { el, toStage } from '../../engine/stage'
import { world } from '../../engine/world'
import { bump, save } from '../../state'
import type { Game } from '../../types'
import { openMoment } from './kit'

/**
 * A New York hot dog cart, first person, over a painting of the cart top (art/places/hotdog-cart.jpg).
 * Point at the steam well (a dog, or a jumbo) or the pretzel warmer: you pay, the vendor fishes it out and it lands
 * in a paper boat in front of you. Then it's yours to dress: pull a squeeze bottle out of the caddy and drag it
 * along the dog (or just click for the classic zigzag), dip a spoon in the relish, onion sauce or kraut and spoon
 * it on. Click the dog with empty hands to eat it, four bites, right to left.
 * Ask for ketchup and the vendor gives you a look. Mustard and onions and he respects you.
 */

/** each cart has its own street behind it; anywhere else gets the Midtown one */
const ART = (room: string) => (['wall-street', 'times-square', 'the-met'].includes(room) ? `/art/places/hotdog-cart-${room}.jpg` : '/art/places/hotdog-cart.jpg')
const SP = '/art/places/sprites/'
const NS = 'http://www.w3.org/2000/svg'

type Base = 'dog' | 'jumbo' | 'pretzel'
interface Food {
  id: Base
  name: string
  price: number
  /** the catalog item you leave holding if you walk off mid-meal */
  item: string
  sprite: string
  mask?: string
  /** sprite size (px) and how wide it's drawn on the 1000-wide stage */
  w: number
  h: number
  show: number
  /** the frank's centre line in sprite px (measured from the sprite): toppings and bites follow it */
  ax: { cx: number; cy: number; dx: number; dy: number; half: number; back: number; thick: number }
}
const FOODS: Record<Base, Food> = {
  dog: { id: 'dog', name: 'Hot Dog', price: 2, item: 'hotdog', sprite: 'cart-hotdog.png', mask: 'cart-hotdog-mask.png', w: 533, h: 367, show: 262, ax: { cx: 258.8, cy: 152.5, dx: 0.9434, dy: -0.3317, half: 263.7, back: 256.4, thick: 108 } },
  jumbo: { id: 'jumbo', name: 'Jumbo', price: 3, item: 'hotdog', sprite: 'cart-jumbo.png', mask: 'cart-jumbo-mask.png', w: 646, h: 408, show: 312, ax: { cx: 310.7, cy: 166.3, dx: 0.9505, dy: -0.3107, half: 325.2, back: 308.2, thick: 116 } },
  pretzel: { id: 'pretzel', name: 'Pretzel', price: 2, item: 'pretzel', sprite: 'cart-pretzel.png', w: 557, h: 423, show: 236, ax: { cx: 278, cy: 205, dx: 1, dy: 0, half: 255, back: 255, thick: 330 } },
}

type Top = 'mustard' | 'ketchup' | 'relish' | 'onions' | 'kraut'
const SAUCE: Record<'mustard' | 'ketchup', { main: string; edge: string }> = {
  mustard: { main: '#f6c514', edge: '#b9850a' },
  ketchup: { main: '#d92b25', edge: '#8e1612' },
}
const BITS: Record<'relish' | 'onions' | 'kraut', string[]> = {
  relish: ['#5cb83a', '#3f9a2a', '#7fd04f', '#2f7d22'],
  onions: ['#c9452a', '#e0683c', '#a83220', '#f08a5a'],
  kraut: ['#f3e6a6', '#e6d27c', '#fff6cf', '#d8c060'],
}

// ---------- the painting, in stage units (2000 × 1131 drawn at 1000 × 565.5) ----------
const WELL = { from: [150, 236] as [number, number] }
const WARMER = { from: [800, 190] as [number, number] }
type Pt2 = [number, number]
/** the things you can point at, traced from the painting (so the glow follows the real edge) and what they're called */
const SHAPES: { id: string; label: string; pts: Pt2[] }[] = [
  { id: 'well', label: 'Hot Dogs', pts: [[75, 222], [277, 222], [251, 265], [8, 265]] },
  { id: 'warmer', label: 'Pretzels', pts: [[664, 104], [700, 88], [931, 88], [931, 289], [700, 289], [664, 263]] },
  { id: 'relish', label: 'Relish', pts: [[734.5, 369], [808.5, 369], [840, 455], [747.5, 455]] },
  { id: 'onions', label: 'Onions', pts: [[811, 369], [889, 369], [926, 455], [837.5, 455]] },
  { id: 'kraut', label: 'Sauerkraut', pts: [[891, 369], [972.5, 369], [1000, 455], [927.5, 455]] },
]
const STACK: [number, number] = [160, 450]
const BOAT_AT: [number, number] = [452, 432]
const FOOD_AT: [number, number] = [452, 402]

export function hotDogCart(g: Game) {
  const m = openMoment('mo-cart')
  const room = world.room

  // the vendor: a random New Yorker in a cap, natural hair, nothing hiding the face
  const look: Look = (() => {
    const l = randomLook(0.2)
    l.hairColor = l.hairColor % 6
    if (['afro', 'puffs', 'long', 'locs', 'braids'].includes(l.hair)) l.hair = 'short'
    l.items = { head: 'nyc-cap', body: l.items.body ?? 'tee-blue', legs: l.items.legs, feet: l.items.feet }
    return l
  })()
  const skin = SKINS[look.skin] ?? SKINS[0]
  /** the look: half-shut eyes and one eyebrow way up (drawn over the face in the avatar's own units) */
  const stareMarks = (fx: number) => {
    const lid = (x: number) => `<path d="M ${x - 6.6} -94.2 A 6.6 8 0 0 1 ${x + 6.6} -94.2 Z" fill="${skin}"/><path d="M ${x - 6.4} -94.2 L ${x + 6.4} -94.2" stroke="#1d2140" stroke-width="2.4" stroke-linecap="round"/>`
    return `<g class="hc-stare">${lid(-11 + fx)}${lid(11 + fx)}<path d="M ${-17 + fx} -104.5 L ${-5 + fx} -104.5" stroke="${skin}" stroke-width="5.5" stroke-linecap="round"/><path d="M ${-17 + fx} -107 Q ${-11 + fx} -117 ${-5 + fx} -110" fill="none" stroke="#2a2030" stroke-width="3" stroke-linecap="round"/><path d="M ${5 + fx} -101.5 L ${17 + fx} -102.5" fill="none" stroke="#2a2030" stroke-width="3" stroke-linecap="round"/></g>`
  }
  const vendorSvg = (mood: 'smile' | 'grin' | 'o', stare = false) =>
    `<svg viewBox="-60 -185 120 192" aria-hidden="true">${avatarMarkup(look, { mood })}${stare ? stareMarks(3) : ''}</svg>`

  const root = el('div', 'hc')
  root.innerHTML = `
    <img class="hc-bg" src="${ART(room.id)}" alt="" draggable="false">
    <div class="hc-steam"><i></i><i></i><i></i></div>
    <div class="hc-guy"><div class="hc-guy-body">${vendorSvg('smile')}</div></div>
    <p class="hc-bubble" hidden></p>
    <svg class="hc-shapes" viewBox="0 0 1000 565.5" aria-hidden="true">${SHAPES.map((sh) => `<polygon class="hc-shape" data-id="${sh.id}" points="${sh.pts.map((p) => p.join(',')).join(' ')}"/>`).join('')}</svg>
    <div class="hc-menu" hidden><b>What’ll it be?</b><div class="hc-picks">${(['dog', 'jumbo', 'pretzel'] as const).map((b) => `<button class="hc-pick" type="button" data-b="${b}"><img src="${SP}${FOODS[b].sprite}" alt="" draggable="false"><span>${FOODS[b].name}</span><em><img src="/art/icons/coin.png" alt="">${FOODS[b].price}</em></button>`).join('')}</div></div>
    <div class="hc-plate"></div>
    <div class="hc-pay" hidden><button class="btn go hc-paybtn" type="button"></button></div>
    <div class="hc-after" hidden><button class="btn small go hc-eat" type="button">Eat here</button><button class="btn small ghost hc-togo" type="button">To go</button></div>
    <ol class="hc-steps"><li data-s="order">Order</li><li data-s="dress">Toppings</li><li data-s="pay">Pay</li><li data-s="eat">Eat</li></ol>
    <p class="hc-label" hidden></p>
    ${(['mustard', 'ketchup'] as const).map((b) => `<img class="hc-bottle" data-t="${b}" src="${SP}cart-${b}.png" alt="${b}" draggable="false">`).join('')}
    <div class="hc-spoon" hidden><img src="${SP}cart-spoon.png" alt="" draggable="false"><i></i></div>
    <div class="hc-caption"><b>Hot Dog Cart</b><span>${room.name}</span></div>
    <div class="hc-actions"><span class="hc-coins"><img src="/art/icons/coin.png" alt=""><b></b></span><button class="btn tiny ghost hc-leave" type="button">Leave</button></div>
    <p class="hc-hint" hidden><span></span></p>
    <p class="hc-shout" hidden></p>`
  m.root.append(root)
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as unknown as T
  const guy = q('.hc-guy')
  const guyBody = q('.hc-guy-body')
  const bubble = q('.hc-bubble')
  const plate = q('.hc-plate')
  const spoon = q('.hc-spoon')
  const hintEl = q('.hc-hint')
  const coinsEl = q('.hc-coins b')
  const shoutEl = q('.hc-shout')
  const bottles = Object.fromEntries([...root.querySelectorAll<HTMLImageElement>('.hc-bottle')].map((b) => [b.dataset.t, b])) as Record<'mustard' | 'ketchup', HTMLImageElement>
  coinsEl.textContent = String(save.coins)

  // ---------- small helpers ----------
  const face = (mood: 'smile' | 'grin' | 'o', stare = false) => (guyBody.innerHTML = vendorSvg(mood, stare))
  let bubbleT = 0
  const say = (text: string, ms = 1600) => {
    bubble.textContent = text
    bubble.hidden = false
    bubble.classList.remove('out')
    clearTimeout(bubbleT)
    bubbleT = window.setTimeout(() => bubble.classList.add('out'), ms)
  }
  const hint = (text: string | null, at?: [number, number]) => {
    if (!text) return void hintEl.classList.add('out')
    hintEl.querySelector('span')!.textContent = text
    if (at) hintEl.style.cssText = `left:${at[0]}px;top:${at[1]}px`
    hintEl.hidden = false
    hintEl.classList.remove('out')
  }
  const shout = (text: string, at: [number, number]) => {
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
  const fly = (src: string, from: [number, number], to: [number, number], w: number, ms = 620, lift = 90) =>
    new Promise<void>((done) => {
      const f = el('img', 'hc-fly') as HTMLImageElement
      f.src = src
      f.style.cssText = `left:${to[0] - w / 2}px;top:${to[1]}px;width:${w}px`
      root.append(f)
      const dx = from[0] - to[0]
      const dy = from[1] - to[1]
      const a = f.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.32) rotate(-18deg)`, offset: 0 },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(0.78) rotate(8deg)`, offset: 0.55 },
          { transform: 'translate(0, -8px) scale(1.04) rotate(0deg)', offset: 0.86 },
          { transform: 'translate(0, 0) scale(1) rotate(0deg)', offset: 1 },
        ],
        { duration: ms, easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)' },
      )
      a.onfinish = () => {
        f.remove()
        done()
      }
    })

  // ---------- state ----------
  let busy = false
  let food: Food | null = null
  let foodSvg: SVGSVGElement | null = null
  let tops: SVGGElement | null = null
  let biteMask: SVGMaskElement | null = null
  let bites = 0
  let held: Top | null = null
  let load = 0 // spoonfuls left on the spoon
  const added: Record<Top, number> = { mustard: 0, ketchup: 0, relish: 0, onions: 0, kraut: 0 }
  let staredThisVisit = false
  let paid = false
  let guided = false

  const k = () => food!.show / food!.w
  const foodBox = () => {
    const f = food!
    const s = k()
    return { x: FOOD_AT[0] - f.show / 2, y: FOOD_AT[1] - (f.h * s) / 2, w: f.show, h: f.h * s }
  }
  /** stage → sprite px */
  const toFood = ([x, y]: [number, number]): [number, number] => {
    const b = foodBox()
    return [(x - b.x) / k(), (y - b.y) / k()]
  }
  const overFood = (p: [number, number]) => {
    if (!food) return false
    const b = foodBox()
    return p[0] > b.x - 6 && p[0] < b.x + b.w + 6 && p[1] > b.y - 10 && p[1] < b.y + b.h + 6
  }

  // ---------- the steps along the bottom, the menu, the labels ----------
  type Step = 'order' | 'dress' | 'pay' | 'eat'
  const ORDER: Step[] = ['order', 'dress', 'pay', 'eat']
  const step = (st: Step) => {
    const n = ORDER.indexOf(st)
    for (const li of root.querySelectorAll<HTMLElement>('.hc-steps li')) {
      const k = ORDER.indexOf(li.dataset.s as Step)
      li.classList.toggle('done', k < n)
      li.classList.toggle('now', k === n)
    }
  }
  const menu = q('.hc-menu')
  const showMenu = (on: boolean) => {
    menu.hidden = !on
    if (on) bubble.classList.add('out')
  }
  for (const b of root.querySelectorAll<HTMLElement>('.hc-pick')) b.onclick = (e) => {
    e.stopPropagation()
    void order(b.dataset.b as Base)
  }

  // pointing at things on the cart: the glow follows the painted edge, a small label says what it is
  const label = q('.hc-label')
  const shapeOf = (id: string) => SHAPES.find((sh) => sh.id === id)!
  const showLabel = (text: string | null, at?: Pt2) => {
    if (!text) return void (label.hidden = true)
    label.textContent = text
    label.style.cssText = `left:${at![0]}px;top:${at![1]}px`
    label.hidden = false
  }
  for (const poly of root.querySelectorAll<SVGPolygonElement>('.hc-shape')) {
    const sh = shapeOf(poly.dataset.id!)
    const top: Pt2 = [sh.pts.reduce((a, p) => a + p[0], 0) / sh.pts.length, Math.min(...sh.pts.map((p) => p[1])) - 6]
    poly.onpointerenter = () => !held && showLabel(sh.id === 'well' || sh.id === 'warmer' ? (food ? null : sh.label) : sh.label, top)
    poly.onpointerleave = () => showLabel(null)
    poly.onpointerdown = (e) => {
      e.stopPropagation()
      showLabel(null)
      if (sh.id === 'well') return void order('dog')
      if (sh.id === 'warmer') return void order('pretzel')
      const t = sh.id as Top
      if (held === t) {
        // back in the pan for a fresh scoop
        load = 26
        spoon.querySelector('i')!.style.transform = 'scale(1)'
        return sfx.pop()
      }
      pickUp(t)
    }
  }
  for (const t of ['mustard', 'ketchup'] as const) {
    bottles[t].onpointerenter = () => !held && showLabel(t === 'mustard' ? 'Mustard' : 'Ketchup', [t === 'mustard' ? 637 : 699, 246])
    bottles[t].onpointerleave = () => showLabel(null)
  }

  async function order(b: Base) {
    if (busy) return
    if (food) {
      hop()
      return say(paid ? 'Finish that first!' : 'One at a time, boss.')
    }
    const f = FOODS[b]
    busy = true
    showMenu(false)
    hint(null)
    face('grin')
    say(b === 'pretzel' ? 'Fresh pretzel!' : b === 'jumbo' ? 'The big one!' : 'Comin’ right up!')
    root.classList.add('serving')
    // he turns to the well (or the warmer) and fishes it out
    guy.classList.add(b === 'pretzel' ? 'reach-r' : 'reach-l')
    // a paper boat off the stack first
    await fly(`${SP}cart-boat.png`, STACK, [BOAT_AT[0], BOAT_AT[1] - 84], 300, 420, 30)
    plate.innerHTML = `<img class="hc-boat" src="${SP}cart-boat.png" alt="" draggable="false" style="left:${BOAT_AT[0] - 150}px;top:${BOAT_AT[1] - 84}px;width:300px">`
    const from = b === 'pretzel' ? WARMER.from : WELL.from
    if (b !== 'pretzel') sfx.whoosh()
    await fly(`${SP}${f.sprite}`, from, [FOOD_AT[0], FOOD_AT[1] - (f.h * (f.show / f.w)) / 2], f.show, 680, 120)
    serve(f)
    guy.classList.remove('reach-l', 'reach-r')
    root.classList.remove('serving')
    face('smile')
    busy = false
    step('dress')
    // pay whenever you're happy with it
    const pay = q('.hc-pay')
    pay.querySelector('button')!.innerHTML = `Pay <img src="/art/icons/coin.png" alt="">${f.price}`
    pay.hidden = false
    hint(b === 'pretzel' ? 'Grab the mustard' : 'Add toppings', [668, 244])
  }

  /** paying: coins over the counter, then eat it here or take it with you */
  async function pay() {
    if (!food || paid || busy) return
    const f = food
    busy = true
    // the catalog price the first time (it puts the item in your wardrobe), plain coins after
    let ok: boolean
    if (!g.owns(f.item)) ok = (await g.buy(f.item)) && (f.price <= 2 || g.spend(f.price - 2, 'jumbo-dog'))
    else ok = g.spend(f.price, f.id === 'pretzel' ? 'pretzel-cart' : 'hotdog-cart')
    busy = false
    if (!ok) {
      face('o')
      hop()
      say('Short a coin, pal.')
      m.later(() => face('smile'), 1500)
      return
    }
    paid = true
    putBack()
    hint(null)
    q('.hc-pay').hidden = true
    // the coins go from your pile to his hand
    for (let i = 0; i < f.price; i++) m.later(() => void fly('/art/icons/coin.png', [930, 34], [560, 196], 26, 520, 40), i * 110)
    m.later(() => {
      sfx.register()
      coinsEl.textContent = String(save.coins)
      face('grin')
      say(pick2(['Enjoy!', 'Thanks, boss!', 'Have a good one!']))
      step('eat')
      q('.hc-after').hidden = false
    }, 520 + f.price * 110)
  }
  q('.hc-paybtn').onclick = (e) => {
    e.stopPropagation()
    void pay()
  }
  q('.hc-eat').onclick = (e) => {
    e.stopPropagation()
    q('.hc-after').hidden = true
    hint('Take a bite!', [FOOD_AT[0], foodBox().y - 6])
  }
  q('.hc-togo').onclick = (e) => {
    e.stopPropagation()
    sfx.click()
    m.close()
  }

  function serve(f: Food) {
    food = f
    bites = 0
    for (const t of Object.keys(added) as Top[]) added[t] = 0
    const id = 'hc' + Math.random().toString(36).slice(2, 7)
    const b = foodBox()
    const on = f.mask
      ? `<image href="${SP}${f.mask}" width="${f.w}" height="${f.h}"/>`
      : `<image href="${SP}${f.sprite}" width="${f.w}" height="${f.h}"/>`
    plate.insertAdjacentHTML(
      'beforeend',
      `<svg class="hc-food" viewBox="0 0 ${f.w} ${f.h}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px" overflow="visible">
        <defs>
          <mask id="${id}b" maskUnits="userSpaceOnUse" x="-80" y="-80" width="${f.w + 160}" height="${f.h + 160}"><rect x="-80" y="-80" width="${f.w + 160}" height="${f.h + 160}" fill="#fff"/></mask>
          <mask id="${id}o" maskUnits="userSpaceOnUse" x="0" y="0" width="${f.w}" height="${f.h}" style="mask-type:alpha">${on}</mask>
          <mask id="${id}s" maskUnits="userSpaceOnUse" x="0" y="0" width="${f.w}" height="${f.h}" style="mask-type:alpha"><image href="${SP}${f.sprite}" width="${f.w}" height="${f.h}"/></mask>
        </defs>
        <g mask="url(#${id}b)">
          <image href="${SP}${f.sprite}" width="${f.w}" height="${f.h}"/>
          <g class="hc-tops" mask="url(#${id}o)"></g>
          <g class="hc-rims" mask="url(#${id}s)"></g>
        </g>
      </svg>`,
    )
    foodSvg = plate.querySelector<SVGSVGElement>('.hc-food')
    tops = foodSvg!.querySelector('.hc-tops')
    biteMask = foodSvg!.querySelector(`#${id}b`)
    root.classList.add('served')
    root.classList.toggle('pretzel', f.id === 'pretzel')
    for (const t of ['ketchup'] as const) bottles[t].classList.toggle('off', f.id === 'pretzel')
    for (const p of root.querySelectorAll<SVGPolygonElement>('.hc-shape')) p.classList.toggle('off', f.id === 'pretzel' && !['well', 'warmer'].includes(p.dataset.id!))
  }

  // ---------- tools: pick up, put back ----------
  let pos: [number, number] = [500, 300]
  const placeTool = () => {
    if (!held) return
    const over = overFood(pos)
    if (held === 'mustard' || held === 'ketchup') {
      const bt = bottles[held]
      // upright while carried, tipped nozzle-down over the food (the nozzle tip is the point you squeeze from)
      bt.style.transform = `translate(${pos[0]}px, ${pos[1]}px) rotate(${over ? 164 : 132}deg)`
    } else spoon.style.transform = `translate(${pos[0]}px, ${pos[1]}px) rotate(${over ? -28 : -8}deg)`
  }
  function pickUp(t: Top) {
    if (!food) {
      hop()
      say(t === 'mustard' || t === 'ketchup' ? 'Order first, boss.' : 'Order first, boss.')
      return
    }
    if (food.id === 'pretzel' && t !== 'mustard') {
      hop()
      return say('Mustard only on a pretzel.')
    }
    putBack()
    held = t
    sfx.click()
    root.classList.add('holding')
    if (t === 'mustard' || t === 'ketchup') {
      bottles[t].classList.add('held')
    } else {
      load = 26
      spoon.hidden = false
      const blob = spoon.querySelector('i')!
      blob.style.background = `radial-gradient(circle at 40% 35%, ${BITS[t][2]}, ${BITS[t][0]} 60%, ${BITS[t][3]})`
      blob.style.transform = 'scale(1)'
      sfx.pop()
    }
    placeTool()
    showLabel(null)
    if (!guided) showGuide()
    else hint(null)
  }
  function putBack() {
    if (!held) return
    if (held === 'mustard' || held === 'ketchup') {
      const bt = bottles[held]
      bt.classList.remove('held')
      bt.style.transform = ''
    } else spoon.hidden = true
    held = null
    root.classList.remove('holding')
  }
  for (const t of ['mustard', 'ketchup'] as const) bottles[t].onpointerdown = (e) => {
    e.stopPropagation()
    if (held === t) return putBack()
    pickUp(t)
  }
  // ---------- squeezing and spooning ----------
  let stroke: { t: Top; pts: [number, number][]; lines: SVGPolylineElement[]; moved: boolean; last: [number, number]; sound: number } | null = null
  const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
    const n = document.createElementNS(NS, tag)
    for (const [a, v] of Object.entries(attrs)) n.setAttribute(a, String(v))
    return n
  }
  const W = () => (food!.id === 'jumbo' ? 1.1 : 1)

  function sauceStart(t: 'mustard' | 'ketchup', p: [number, number]) {
    const c = SAUCE[t]
    const w = W()
    const g2 = svgEl('g', { class: 'hc-sauce' })
    const mk = (stroke: string, sw: number, extra: Record<string, string | number> = {}) =>
      svgEl('polyline', { fill: 'none', stroke, 'stroke-width': sw * w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra })
    const lines = [mk(c.edge, 17), mk(c.main, 12), mk('#fff', 3.4, { opacity: 0.55, transform: 'translate(-2 -3)' })]
    for (const l of lines) g2.append(l)
    tops!.append(g2)
    stroke = { t, pts: [p], lines, moved: false, last: p, sound: 0 }
    drawSauce()
  }
  function drawSauce() {
    const pts = stroke!.pts.map((v) => v.map((n) => n.toFixed(1)).join(',')).join(' ')
    for (const l of stroke!.lines) l.setAttribute('points', pts.includes(' ') ? pts : `${pts} ${pts}`)
  }
  function spoonDrop(t: 'relish' | 'onions' | 'kraut', p: [number, number], n = 3) {
    if (load <= 0) {
      say('Scoop some more.', 1200)
      return
    }
    const cols = BITS[t]
    const ang = Math.atan2(food!.ax.dy, food!.ax.dx) * (180 / Math.PI)
    for (let i = 0; i < n && load > 0; i++, load--) {
      const x = p[0] + (Math.random() - 0.5) * 34
      const y = p[1] + (Math.random() - 0.5) * 22
      const col = cols[Math.floor(Math.random() * cols.length)]
      const rot = ang + (Math.random() - 0.5) * 70
      let bit: SVGElement
      if (t === 'relish') bit = svgEl('rect', { x: x - 6, y: y - 6, width: 12, height: 11, rx: 3, fill: col, stroke: '#1d3a1a', 'stroke-width': 1.6, transform: `rotate(${rot} ${x} ${y})` })
      else if (t === 'onions') bit = svgEl('path', { d: `M ${x - 11} ${y + 2} Q ${x} ${y - 9} ${x + 11} ${y + 2}`, fill: 'none', stroke: col, 'stroke-width': 7, 'stroke-linecap': 'round', transform: `rotate(${rot} ${x} ${y})` })
      else bit = svgEl('path', { d: `M ${x - 14} ${y} q 4 -6 9 0 t 9 0 t 9 0`, fill: 'none', stroke: col, 'stroke-width': 4.6, 'stroke-linecap': 'round', transform: `rotate(${rot} ${x} ${y})` })
      bit.setAttribute('class', 'hc-bit')
      tops!.append(bit)
      added[t] += 1
    }
    spoon.querySelector('i')!.style.transform = `scale(${Math.max(0, load / 26) * 0.7 + 0.3})`
    if (load <= 0) spoon.querySelector('i')!.style.transform = 'scale(0)'
  }

  /** first time you pick something up: a dashed zigzag to trace over the dog, with a dot running along it */
  function showGuide() {
    if (!food || !foodSvg) return
    guided = true
    const a = food.ax
    const amp = Math.min(a.thick * 0.2, 26)
    const pts: string[] = []
    for (let i = 0; i <= 8; i++) {
      const s2 = -a.back * 0.78 + ((a.half + a.back) * 0.78 * i) / 8
      const o = i % 2 ? -amp : amp
      pts.push(`${(a.cx + a.dx * s2 - a.dy * o).toFixed(1)},${(a.cy + a.dy * s2 + a.dx * o).toFixed(1)}`)
    }
    const d = 'M' + pts.join(' L')
    const g2 = svgEl('g', { class: 'hc-guide' })
    g2.innerHTML = `<path d="${d}" fill="none" stroke="#1d2140" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" opacity=".35"/><path class="hc-guide-dash" d="${d}" fill="none" stroke="#fff" stroke-width="7" stroke-dasharray="16 14" stroke-linecap="round" stroke-linejoin="round"/><circle r="12" fill="#ffd166" stroke="#1d2140" stroke-width="4"><animateMotion dur="1.6s" repeatCount="indefinite" path="${d}"/></circle>`
    foodSvg.append(g2)
    hint(food.id === 'pretzel' ? 'Drag across it' : 'Drag along the dog', [FOOD_AT[0], foodBox().y - 6])
  }
  const dropGuide = () => foodSvg?.querySelector('.hc-guide')?.remove()

  /** a plain click: the cart guy's zigzag, end to end along the dog */
  function zigzag(t: Top) {
    const a = food!.ax
    const n = 10
    const amp = Math.min(a.thick * 0.2, 26)
    const pts: [number, number][] = []
    for (let i = 0; i <= n; i++) {
      const s = -a.back * 0.82 + ((a.half + a.back) * 0.82 * i) / n
      const o = i % 2 ? -amp : amp
      pts.push([a.cx + a.dx * s - a.dy * o, a.cy + a.dy * s + a.dx * o])
    }
    if (t === 'mustard' || t === 'ketchup') {
      sauceStart(t, pts[0])
      let i = 1
      const step = () => {
        if (!stroke || i >= pts.length) return endStroke(true)
        stroke.pts.push(pts[i++])
        drawSauce()
        if (i % 3 === 0) sfx.squirt()
        m.later(step, 34)
      }
      sfx.squirt()
      step()
    } else {
      pts.forEach((p, i) => m.later(() => spoonDrop(t, p, 2), i * 30))
      m.later(() => endStroke(true), pts.length * 30)
    }
  }

  function endStroke(fromZig = false) {
    const t = stroke?.t ?? held
    if (stroke && (stroke.t === 'mustard' || stroke.t === 'ketchup')) {
      // a little blob where you let go
      const end = stroke.pts[stroke.pts.length - 1]
      tops!.append(svgEl('circle', { cx: end[0], cy: end[1], r: 7.5 * W(), fill: SAUCE[stroke.t].main, stroke: SAUCE[stroke.t].edge, 'stroke-width': 2.5 }))
      const len = stroke.pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - stroke!.pts[i - 1][0], p[1] - stroke!.pts[i - 1][1]) : 0), 0)
      added[stroke.t] += len
    }
    stroke = null
    void fromZig
    if (t) afterTopping(t)
  }

  function afterTopping(t: Top) {
    hint(null)
    if (t === 'ketchup' && added.ketchup > 20) stare()
    else if ((t === 'onions' || t === 'mustard') && added.mustard > 60 && added.onions > 12 && added.ketchup === 0 && !guy.classList.contains('nod')) {
      guy.classList.add('nod')
      face('grin')
      say('Now that’s New York.', 1700)
      m.later(() => face('smile'), 1700)
    }
  }

  /** ketchup on a New York dog: he stops and looks at you. For a while. */
  function stare() {
    if (guy.classList.contains('staring')) return
    guy.classList.add('staring')
    face('o', true)
    sfx.tick()
    say('…', 2200)
    if (!staredThisVisit) {
      staredThisVisit = true
      g.stamp('ketchup-stare')
    }
    m.later(() => {
      guy.classList.remove('staring')
      face('smile')
    }, 2400)
  }

  // ---------- eating ----------
  function bite(at: [number, number]) {
    if (!food || !biteMask || bites >= 4) return
    bites++
    hint(null)
    putBack()
    sfx.chomp()
    const a = food.ax
    const len = a.half + a.back
    const last = bites === 4
    // bites walk from the right end of the dog to the left
    const s = last ? (a.half - a.back) / 2 : a.half - (len * (bites - 0.5)) / 4 + len * 0.04
    const cx = a.cx + a.dx * s
    const cy = a.cy + a.dy * s
    const rx = last ? len * 0.62 : len / 7.2
    const ry = last ? food.h : a.thick * 1.25 + 40
    const ang = Math.atan2(a.dy, a.dx)
    const ca = Math.cos(ang)
    const sa = Math.sin(ang)
    const at2 = (lx: number, ly: number): [number, number] => [cx + lx * ca - ly * sa, cy + lx * sa + ly * ca]
    // a cartoon bite: one big oval and a row of round tooth scallops along its leading (left) edge
    const shapes: SVGElement[] = [svgEl('ellipse', { cx: cx.toFixed(1), cy: cy.toFixed(1), rx: rx.toFixed(1), ry: ry.toFixed(1), transform: `rotate(${(ang * 180) / Math.PI} ${cx.toFixed(1)} ${cy.toFixed(1)})` })]
    if (!last)
      for (const deg of [146, 163, 180, 197, 214]) {
        const t = (deg * Math.PI) / 180
        const [x, y] = at2(Math.cos(t) * rx, Math.sin(t) * ry)
        shapes.push(svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: (rx * 0.5).toFixed(1) }))
      }
    const rims = foodSvg!.querySelector('.hc-rims')!
    for (const [i, sh] of shapes.entries()) {
      const hole = sh.cloneNode() as SVGElement
      hole.setAttribute('fill', '#000')
      biteMask.append(hole)
      // only the tooth marks get a rim (the big oval's far side would show as a ghost line)
      if (i === 0) continue
      // the soft inside of the bun shows along the bite, with a thin crust line
      const soft = sh.cloneNode() as SVGElement
      soft.setAttribute('fill', 'none'); soft.setAttribute('stroke', '#f9e7b4'); soft.setAttribute('stroke-width', '16')
      const line = sh.cloneNode() as SVGElement
      line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#1d2140'); line.setAttribute('stroke-width', '3.5'); line.setAttribute('opacity', '0.8')
      rims.append(soft, line)
    }
    foodSvg?.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.95, 1.04) translateY(3px)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' })
    crumbs(at)
    guy.classList.remove('nod')
    if (last) finish(at)
    else if (bites === 1) hint(null)
  }

  function crumbs(at: [number, number]) {
    for (let i = 0; i < 9; i++) {
      const c = el('i', 'hc-crumb')
      const dx = (Math.random() - 0.5) * 90
      const up = 20 + Math.random() * 30
      const fall = 30 + Math.random() * 40
      c.style.cssText = `left:${at[0]}px;top:${at[1]}px;background:${i % 3 ? '#e9b35f' : '#c98a3a'};width:${4 + Math.random() * 4}px;height:${4 + Math.random() * 3}px`
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

  function finish(_at: [number, number]) {
    const f = food!
    const has = (t: Top) => added[t] > (t === 'mustard' || t === 'ketchup' ? 40 : 6)
    const all = (['mustard', 'ketchup', 'relish', 'onions', 'kraut'] as const).every(has)
    const purist = has('mustard') && has('onions') && !has('ketchup')
    const word = f.id === 'pretzel' ? 'Salty!' : all ? 'The Works!' : purist ? 'Real New Yorker' : has('ketchup') ? 'Bold.' : added.mustard + added.relish + added.onions + added.kraut === 0 ? 'Naked dog!' : 'Delicious!'
    shout(word, [FOOD_AT[0], FOOD_AT[1] - 150])
    sfx.levelUp()
    hop()
    face('grin')
    say(purist ? 'Respect.' : 'Come back tomorrow!', 1800)
    // the paper boat gets balled up and tossed
    m.later(() => {
      plate.classList.add('done')
      m.later(() => {
        plate.innerHTML = ''
        plate.classList.remove('done')
        root.classList.remove('served', 'pretzel')
        food = null
        paid = false
        face('smile')
        for (const b of root.querySelectorAll('.off')) b.classList.remove('off')
        // another one?
        step('order')
        showMenu(true)
      }, 480)
    }, 1100)
    bump('snacks')
    bump('hotdogs')
    const ate = `ate:${room.id}:${f.item}`
    if (!save.stats[ate]) bump(ate)
    if (Object.keys(save.stats).filter((s) => s.startsWith('ate:')).length >= 10) g.stamp('belly-10')
    if (f.id !== 'pretzel') {
      g.stamp('street-meat')
      if (all) g.stamp('the-works')
      if (purist) g.stamp('cart-purist')
      const cartKey = `hotdog-cart:${room.id}`
      if (!save.stats[cartKey]) bump(cartKey)
      if (['times-square', 'the-met', 'wall-street'].every((r) => save.stats[`hotdog-cart:${r}`])) g.stamp('cart-crawl')
    }
  }

  // ---------- the pointer ----------
  root.addEventListener('pointermove', (e) => {
    pos = toStage(e) as [number, number]
    placeTool()
    if (!stroke || !food) return
    const p = toFood(pos)
    if (Math.hypot(p[0] - stroke.last[0], p[1] - stroke.last[1]) < 7) return
    stroke.moved = true
    stroke.last = p
    if (stroke.t === 'mustard' || stroke.t === 'ketchup') {
      stroke.pts.push(p)
      drawSauce()
      const now = performance.now()
      if (now - stroke.sound > 140) {
        stroke.sound = now
        sfx.squirt()
      }
    } else spoonDrop(stroke.t as 'relish' | 'onions' | 'kraut', p, 2)
  })
  root.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement
    if (t.closest('.hc-actions, .hc-menu, .hc-pay, .hc-after, .hc-bottle, .hc-shape')) return
    pos = toStage(e) as [number, number]
    if (food && overFood(pos) && !busy) {
      if (!held) {
        if (paid) return bite(pos)
        hop()
        return say('Pay first, boss.')
      }
      root.setPointerCapture(e.pointerId)
      dropGuide()
      hint(null)
      const p = toFood(pos)
      const tool = held
      if (tool === 'mustard' || tool === 'ketchup') {
        sauceStart(tool, p)
        sfx.squirt()
      } else {
        stroke = { t: tool, pts: [p], lines: [], moved: false, last: p, sound: 0 }
        spoonDrop(tool, p, 3)
      }
      return
    }
    // anywhere else: put the tool down
    if (held) putBack()
  })
  const up = () => {
    if (!stroke) return
    if (!stroke.moved) {
      const t = stroke.t
      // undo the dot a click left, then do it properly
      if (t === 'mustard' || t === 'ketchup') stroke.lines[0]?.parentElement?.remove()
      stroke = null
      return zigzag(t)
    }
    endStroke()
  }
  root.addEventListener('pointerup', up)
  root.addEventListener('pointercancel', up)

  // ---------- leaving ----------
  q('.hc-leave').onclick = () => {
    sfx.click()
    m.close()
  }
  m.onClose(() => {
    // walking off with it (To go, or mid-meal): it comes with you. Unpaid, it stays on the cart.
    if (food && paid && bites < 4 && g.owns(food.item)) g.wear(food.item)
  })

  // hello
  m.later(() => {
    face('grin')
    hop()
    step('order')
    showMenu(true)
  }, 380)
  m.later(() => face('smile'), 1800)
}

const pick2 = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]
