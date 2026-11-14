import './oysterBar.css'
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
 * The Lobster Spot, Chelsea Market's fish market and raw bar, first person at the marble bar
 * (art/places/cm-oysters.jpg). Order a half dozen: you pay, the fishmonger sets a tray of ice with six closed
 * oysters in front of you and you shuck them yourself: knife in at the hinge, twist, the lid pops off. Dress one
 * (lemon, mignonette, hot sauce) or don't, tip it back, and leave the shell upside down on the ice.
 * Or pay market price for the lobster roll. One oyster in fourteen has a pearl in it.
 */

const ART = '/art/places/cm-oysters.jpg'
const SP = '/art/places/sprites/'
const NS = 'http://www.w3.org/2000/svg'
type Pt2 = [number, number]

// ---------- the painting, in stage units (2000 × 1131 drawn at 1000 × 565.5) ----------
/** the lobster tank, traced from the painting (lid, glass front and side, down to where the ice and a flag cover it) */
const TANK: Pt2[] = [[25, 166.5], [241, 166.5], [334, 188], [331, 290], [252, 300], [252, 287], [195, 287], [195, 306], [25, 306]]
/** the three blank flags stuck in the ice: centre, tilt, and what's written on them */
const FLAGS: { at: Pt2; rot: number; name: string }[] = [
  { at: [222, 304], rot: -3, name: 'Blue Point' },
  { at: [497, 282], rot: 0, name: 'Wellfleet' },
  { at: [690, 294], rot: 6, name: 'Montauk' },
]
const STEAMER: Pt2 = [800, 250]
const HAND: Pt2 = [596, 268]
const PILE: Pt2 = [168, 478]
const ROLL = { w: 420, h: 306, show: 192, at: [440, 444] as Pt2, ax: { cx: 212, cy: 148, dx: 0.98, dy: -0.2, half: 196, back: 196, thick: 150 } }
/** six oysters round the lemon, back row first so the front ones overlap them */
const SPOTS: Pt2[] = [[380, 437], [500, 437], [322, 461], [558, 461], [380, 487], [500, 487]]
const OW = 60
const OH = 58

type ToolId = 'knife' | 'lemon' | 'mig' | 'hot'
const TOOLS: Record<ToolId, { name: string; sprite: string; rot: number; over: number }> = {
  knife: { name: 'Shucking Knife', sprite: 'cm-shucker.png', rot: 150, over: 138 },
  lemon: { name: 'Lemon', sprite: 'cm-lemon.png', rot: -12, over: 24 },
  mig: { name: 'Mignonette', sprite: 'cm-mignonette.png', rot: 128, over: 152 },
  hot: { name: 'Hot Sauce', sprite: 'cm-hotsauce.png', rot: 128, over: 158 },
}

interface Oyster {
  i: number
  at: Pt2
  box: HTMLElement
  img: HTMLImageElement
  state: 'closed' | 'open' | 'done'
  pearl: HTMLImageElement | null
  hot: number
  mig: number
  lemon: boolean
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** the round steel platter of crushed ice, drawn to sit on the painted marble (viewBox 380 × 150, centre 190, 70) */
function traySvg(): string {
  let s = 7
  const r = () => ((s = (s * 16807) % 2147483647), (s & 0xffff) / 0xffff)
  const cols = ['#ffffff', '#ffffff', '#f6f9fd', '#e9f0f8', '#d6e2f0']
  const chunks: { x: number; y: number; d: string; c: string }[] = []
  for (let n = 0; n < 330; n++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r())
    const x = 190 + Math.cos(a) * d * 151
    // heaped: the middle of the ice sits a little higher than the rim
    const y = 71 + Math.sin(a) * d * 38 - (1 - d * d) * 5
    const rad = 3.6 + r() * 3.6
    const k = 6 + Math.floor(r() * 3)
    const rot = r() * 6
    const pts: string[] = []
    for (let j = 0; j < k; j++) {
      const t = rot + (j / k) * Math.PI * 2
      const rr = rad * (0.78 + r() * 0.4)
      pts.push(`${(x + Math.cos(t) * rr).toFixed(1)},${(y + Math.sin(t) * rr * 0.8).toFixed(1)}`)
    }
    chunks.push({ x, y, d: pts.join(' '), c: cols[Math.floor(r() * cols.length)] })
  }
  chunks.sort((a, b) => a.y - b.y)
  return `<svg class="ob-platter" viewBox="0 0 380 150" aria-hidden="true">
    <defs>
      <linearGradient id="ob-steel" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#aeb5c0"/><stop offset=".18" stop-color="#f3f5f7"/><stop offset=".42" stop-color="#b9c0ca"/><stop offset=".68" stop-color="#eef1f4"/><stop offset="1" stop-color="#9aa2ae"/></linearGradient>
      <linearGradient id="ob-steel2" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7e8693"/><stop offset="1" stop-color="#565d6b"/></linearGradient>
    </defs>
    <ellipse cx="190" cy="81" rx="172" ry="52" fill="url(#ob-steel2)" stroke="#23283a" stroke-width="2.6"/>
    <ellipse cx="190" cy="70" rx="172" ry="52" fill="url(#ob-steel)" stroke="#23283a" stroke-width="2.6"/>
    <path d="M 36 90 A 172 52 0 0 0 150 120" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>
    <path d="M 262 117 A 172 52 0 0 0 330 99" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>
    <ellipse cx="190" cy="70" rx="161" ry="45" fill="#6f7887" stroke="#3c4353" stroke-width="1.6"/>
    <ellipse cx="190" cy="72" rx="157" ry="42" fill="#b4c4d8"/>
    ${chunks.map((c) => `<polygon points="${c.d}" fill="${c.c}" stroke="#8498b6" stroke-width=".9" stroke-linejoin="round"/>`).join('')}
  </svg>`
}

export function oysterBar(g: Game) {
  const m = openMoment('mo-oysters')

  // the fishmonger: beanie, apron, nothing hiding the face
  const look: Look = (() => {
    const l = randomLook(0.2)
    l.hairColor = l.hairColor % 6
    if (['afro', 'puffs', 'long', 'locs', 'braids'].includes(l.hair)) l.hair = 'short'
    l.items = { head: 'nyc-beanie', body: 'barista-apron', legs: l.items.legs, feet: l.items.feet }
    return l
  })()
  const vendorSvg = (mood: 'smile' | 'grin' | 'o') => `<svg viewBox="-60 -185 120 192" aria-hidden="true">${avatarMarkup(look, { mood })}</svg>`
  const coin = '<img src="/art/icons/coin.png" alt="">'

  const root = el('div', 'ob')
  root.innerHTML = `
    <img class="ob-bg" src="${ART}" alt="" draggable="false">
    <div class="ob-tank"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="ob-claw"></div>
    <div class="ob-lift"></div>
    <div class="ob-guy"><div class="ob-guy-body">${vendorSvg('smile')}</div></div>
    <div class="ob-mist"><i></i><i></i><i></i><i></i></div>
    ${FLAGS.map((f) => `<span class="ob-flag" style="left:${f.at[0]}px;top:${f.at[1]}px;rotate:${f.rot}deg">${f.name}</span>`).join('')}
    <svg class="ob-shapes" viewBox="0 0 1000 565.5" aria-hidden="true"><polygon class="ob-shape" points="${TANK.map((p) => p.join(',')).join(' ')}"/></svg>
    <div class="ob-pile"></div>
    <div class="ob-tray" hidden></div>
    <div class="ob-plate"></div>
    <svg class="ob-guide" viewBox="0 0 1000 565.5" aria-hidden="true"></svg>
    ${(Object.keys(TOOLS) as ToolId[]).map((t) => `<img class="ob-tool" data-t="${t}" src="${SP}${TOOLS[t].sprite}" alt="${TOOLS[t].name}" draggable="false"${t === 'knife' || t === 'lemon' ? ' hidden' : ''}>`).join('')}
    <div class="ob-menu" hidden>
      <button class="ob-pick" type="button" data-k="oysters"><img src="${SP}cm-oyster-open.png" alt="" draggable="false"><span>Half Dozen</span><em>${coin}6</em></button>
      <button class="ob-pick" type="button" data-k="roll"><img src="${SP}cm-lobster-roll.png" alt="" draggable="false"><span>Lobster Roll</span><em>${coin}30</em></button>
    </div>
    <div class="ob-pay" hidden><img class="ob-pay-pic" src="" alt="" draggable="false"><div><button class="btn go ob-paybtn" type="button"></button><button class="btn tiny ghost ob-back" type="button">Back</button></div></div>
    <div class="ob-after" hidden><button class="btn small go ob-eat" type="button">Eat here</button><button class="btn small ghost ob-togo" type="button">To go</button></div>
    <p class="ob-bubble" hidden></p>
    <ol class="ob-steps"><li data-s="order">Order</li><li data-s="pay">Pay</li><li data-s="shuck">Shuck</li><li data-s="slurp">Slurp</li><li data-s="eat">Eat</li></ol>
    <p class="ob-label" hidden></p>
    <div class="ob-actions"><span class="ob-coins">${coin}<b></b></span><button class="btn tiny ghost ob-leave" type="button">Leave</button></div>
    <p class="ob-hint" hidden><span></span></p>`
  m.root.append(root)
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as unknown as T
  const guy = q('.ob-guy')
  const guyBody = q('.ob-guy-body')
  const bubble = q('.ob-bubble')
  const trayEl = q('.ob-tray')
  const plate = q('.ob-plate')
  const pileEl = q('.ob-pile')
  const guide = q<SVGSVGElement>('.ob-guide')
  const hintEl = q('.ob-hint')
  const label = q('.ob-label')
  const menu = q('.ob-menu')
  const payEl = q('.ob-pay')
  const afterEl = q('.ob-after')
  const coinsEl = q('.ob-coins b')
  const tankEl = q('.ob-tank')
  const tools = Object.fromEntries([...root.querySelectorAll<HTMLImageElement>('.ob-tool')].map((t) => [t.dataset.t, t])) as Record<ToolId, HTMLImageElement>
  coinsEl.textContent = String(save.coins)

  // ---------- small helpers ----------
  const face = (mood: 'smile' | 'grin' | 'o') => (guyBody.innerHTML = vendorSvg(mood))
  let bubbleT = 0
  const say = (text: string, ms = 1700) => {
    bubble.textContent = text
    bubble.hidden = false
    bubble.classList.remove('out')
    bubble.style.animation = 'none'
    void bubble.offsetWidth
    bubble.style.animation = ''
    clearTimeout(bubbleT)
    if (ms > 0) bubbleT = window.setTimeout(() => bubble.classList.add('out'), ms)
  }
  const hint = (text: string | null, at?: Pt2) => {
    if (!text) return void hintEl.classList.add('out')
    hintEl.querySelector('span')!.textContent = text
    if (at) hintEl.style.cssText = `left:${at[0]}px;top:${at[1]}px`
    hintEl.hidden = false
    hintEl.classList.remove('out')
  }
  const showLabel = (text: string | null, at?: Pt2) => {
    if (!text) return void (label.hidden = true)
    label.textContent = text
    label.style.cssText = `left:${at![0]}px;top:${at![1]}px`
    label.hidden = false
  }
  const hop = () => {
    guy.classList.remove('hop')
    void guy.offsetWidth
    guy.classList.add('hop')
  }
  const fly = (src: string, from: Pt2, to: Pt2, w: number, ms = 620, lift = 90) =>
    new Promise<void>((done) => {
      const f = el('img', 'ob-fly') as HTMLImageElement
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
        { duration: reduced() ? 1 : ms, easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)' },
      )
      a.onfinish = () => {
        f.remove()
        done()
      }
    })
  const wait = (ms: number) => new Promise<void>((done) => m.later(done, reduced() ? Math.min(ms, 30) : ms))
  /** little things flying off a point: ice chips, juice, crumbs */
  const bits = (at: Pt2, n: number, cols: string[], spread = 70, round = false) => {
    for (let i = 0; i < n; i++) {
      const c = el('i', 'ob-bit')
      const dx = (Math.random() - 0.5) * spread
      const up = 14 + Math.random() * 24
      const fall = 18 + Math.random() * 26
      const sz = 3 + Math.random() * 4
      c.style.cssText = `left:${at[0]}px;top:${at[1]}px;background:${cols[i % cols.length]};width:${sz}px;height:${sz}px;${round ? 'border-radius:50%' : ''}`
      root.append(c)
      c.animate(
        [
          { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          { transform: `translate(${dx * 0.6}px, ${-up}px) rotate(120deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${dx}px, ${fall}px) rotate(260deg)`, opacity: 0 },
        ],
        { duration: 560 + Math.random() * 260, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
      ).onfinish = () => c.remove()
    }
  }
  const sparkle = (at: Pt2, n = 10) => {
    for (let i = 0; i < n; i++) {
      const s = el('i', 'ob-spark')
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5
      const d = 26 + Math.random() * 34
      s.style.cssText = `left:${at[0]}px;top:${at[1]}px`
      root.append(s)
      s.animate(
        [
          { transform: 'translate(-50%,-50%) scale(0.2) rotate(0)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1) rotate(90deg)`, opacity: 1, offset: 0.6 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d * 1.25}px), calc(-50% + ${Math.sin(a) * d * 1.25}px)) scale(0) rotate(160deg)`, opacity: 0 },
        ],
        { duration: 700 + Math.random() * 300, easing: 'ease-out' },
      ).onfinish = () => s.remove()
    }
  }

  // ---------- state ----------
  type Kind = 'oysters' | 'roll'
  type Step = 'order' | 'pay' | 'shuck' | 'slurp' | 'eat'
  let busy = false
  let pending: Kind | null = null
  let oysters: Oyster[] = []
  let served = false
  let shucked = 0 // this visit: after the first, a plain click opens one
  let slurped = 0
  let held: ToolId | null = null
  let pos: Pt2 = [500, 300]
  let twist: { o: Oyster; from: Pt2; d: number } | null = null
  let guided = false
  let roll: { svg: SVGSVGElement; mask: SVGMaskElement; bites: number; eating: boolean } | null = null
  let pearlSaid = false

  const step = (st: Step) => {
    const order: Step[] = root.classList.contains('roll') ? ['order', 'pay', 'eat'] : ['order', 'pay', 'shuck', 'slurp']
    const n = order.indexOf(st)
    for (const li of root.querySelectorAll<HTMLElement>('.ob-steps li')) {
      const k = order.indexOf(li.dataset.s as Step)
      li.classList.toggle('done', k >= 0 && k < n)
      li.classList.toggle('now', k === n)
    }
  }
  const showMenu = (line: string) => {
    root.classList.remove('roll')
    step('order')
    menu.hidden = false
    say(line, 0)
  }

  // ---------- order, pay ----------
  for (const b of root.querySelectorAll<HTMLElement>('.ob-pick')) b.onclick = (e) => {
    e.stopPropagation()
    choose(b.dataset.k as Kind)
  }
  function choose(k: Kind) {
    if (busy || pending) return
    sfx.click()
    if (k === 'roll' && save.coins < 30) {
      // he can see what you've got
      face('o')
      hop()
      say('Market price.', 0)
      m.later(() => face('smile'), 1400)
      return
    }
    pending = k
    menu.hidden = true
    root.classList.toggle('roll', k === 'roll')
    step('pay')
    q<HTMLImageElement>('.ob-pay-pic').src = `${SP}${k === 'roll' ? 'cm-lobster-roll.png' : 'cm-oyster-open.png'}`
    q('.ob-paybtn').innerHTML = `Pay ${coin}${k === 'roll' ? 30 : 6}`
    payEl.hidden = false
    if (k === 'roll') say('Market price.', 2200)
    else bubble.classList.add('out')
  }
  q('.ob-back').onclick = (e) => {
    e.stopPropagation()
    if (busy) return
    sfx.click()
    pending = null
    payEl.hidden = true
    showMenu('What’ll it be?')
  }
  q('.ob-paybtn').onclick = (e) => {
    e.stopPropagation()
    void pay()
  }
  async function pay() {
    if (busy || !pending) return
    const k = pending
    busy = true
    let ok: boolean
    if (k === 'oysters') ok = g.spend(6, 'cm-oysters')
    else if (!g.owns('lobster-roll')) ok = await g.buy('lobster-roll')
    else ok = g.spend(30, 'cm-lobster-roll')
    if (!m.alive) return
    if (!ok) {
      busy = false
      pending = null
      payEl.hidden = true
      face('o')
      hop()
      showMenu(k === 'roll' ? 'Market price.' : 'Six coins, pal.')
      m.later(() => face('smile'), 1500)
      return
    }
    payEl.hidden = true
    const n = k === 'roll' ? 8 : 6
    for (let i = 0; i < n; i++) m.later(() => void fly('/art/icons/coin.png', [930, 34], HAND, 24, 500, 40), i * 80)
    await wait(500 + n * 80)
    sfx.register()
    coinsEl.textContent = String(save.coins)
    face('grin')
    pending = null
    if (k === 'oysters') await serveOysters()
    else await serveRoll()
    face('smile')
    busy = false
  }

  // ---------- the half dozen ----------
  async function serveOysters() {
    say('Half dozen, coming up.')
    guy.classList.add('reach-l')
    mk.shave()
    oysters = []
    served = false
    slurped = 0
    trayEl.innerHTML = `<i class="ob-tray-shadow"></i>${traySvg()}<img class="ob-tray-lemon" src="${SP}cm-lemon.png" alt="" draggable="false">`
    SPOTS.forEach((at, i) => {
      const box = el('div', 'ob-oy')
      box.style.cssText = `left:${at[0] - OW / 2}px;top:${at[1] - OH / 2}px`
      box.innerHTML = `<img src="${SP}cm-oyster-closed.png" alt="" draggable="false">`
      trayEl.append(box)
      oysters.push({ i, at, box, img: box.querySelector('img')!, state: 'closed', pearl: null, hot: 0, mig: 0, lemon: false })
    })
    await wait(420)
    trayEl.hidden = false
    trayEl.classList.remove('gone')
    if (!reduced())
      await trayEl.animate(
        [
          { transform: 'translate(150px, -150px) scale(0.42)', opacity: 0 },
          { transform: 'translate(90px, -120px) scale(0.6)', opacity: 1, offset: 0.25 },
          { transform: 'translate(0, 5px) scale(1.03)', offset: 0.82 },
          { transform: 'translate(0, 0) scale(1)' },
        ],
        { duration: 720, easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)' },
      ).finished
    if (!m.alive) return
    mk.clunk()
    guy.classList.remove('reach-l')
    // the lemon on the tray becomes the one you can pick up; the knife lands beside the bottles
    trayEl.querySelector('.ob-tray-lemon')?.remove()
    tools.lemon.hidden = false
    tools.knife.hidden = false
    tools.knife.classList.add('drop')
    m.later(() => (tools.knife.classList.remove('drop'), mk.clunk()), 260)
    served = true
    root.classList.add('served')
    step('shuck')
    hint('Grab the knife', [785, 438])
  }

  const hingeOf = (o: Oyster): Pt2 => [o.at[0] - 21, o.at[1] + 17]
  const oysterAt = (p: Pt2): Oyster | null => {
    let best: Oyster | null = null
    let bd = 34
    for (const o of oysters) {
      if (o.state === 'done') continue
      const d = Math.hypot(p[0] - o.at[0], (p[1] - o.at[1]) * 1.15)
      if (d < bd) (bd = d), (best = o)
    }
    return best
  }

  /** the first time you hold the knife: a ring on the hinge and a short dashed arc to twist along */
  function showGuide() {
    const o = oysters.find((x) => x.state === 'closed')
    if (!o) return
    guided = true
    const [hx, hy] = hingeOf(o)
    const d = `M ${hx} ${hy} q 6 -30 40 -34`
    guide.innerHTML = `<circle class="ob-ring" cx="${hx}" cy="${hy}" r="9"/><circle cx="${hx}" cy="${hy}" r="4" fill="#ffd166" stroke="#1d2140" stroke-width="2"/>
      <path d="${d}" fill="none" stroke="#1d2140" stroke-width="7" stroke-linecap="round" opacity=".4"/><path class="ob-dash" d="${d}" fill="none" stroke="#fff" stroke-width="3.5" stroke-dasharray="7 6" stroke-linecap="round"/>
      <circle r="5.5" fill="#ffd166" stroke="#1d2140" stroke-width="2.4"><animateMotion dur="1.1s" repeatCount="indefinite" path="${d}"/></circle>`
    hint('Press and twist', [o.at[0], o.at[1] - 34])
  }
  const dropGuide = () => (guide.innerHTML = '')

  function shuck(o: Oyster) {
    if (o.state !== 'closed') return
    twist = null
    o.state = 'open'
    o.box.style.rotate = ''
    o.img.src = `${SP}cm-oyster-open.png`
    o.box.classList.add('open')
    o.box.animate([{ scale: '1.16 0.9' }, { scale: '0.96 1.06' }, { scale: '1' }], { duration: 260, easing: 'ease-out' })
    mk.shuck()
    sfx.pop()
    dropGuide()
    hint(null)
    bits([o.at[0], o.at[1]], 7, ['#fff', '#dbe6f2', '#c9d6e6'], 60)
    // the top shell pops off and lands on the pile
    const n = pileEl.children.length
    const to: Pt2 = [PILE[0] + ((n % 3) - 1) * 17 + (Math.random() - 0.5) * 5, PILE[1] - Math.floor(n / 3) * 8 + (n % 3 === 1 ? 5 : 0)]
    const lid = el('img', 'ob-lid') as HTMLImageElement
    lid.src = `${SP}cm-oyster-lid.png`
    const rot = (Math.random() - 0.5) * 50
    lid.style.cssText = `left:${to[0] - 28}px;top:${to[1] - 23}px;rotate:${rot}deg`
    pileEl.append(lid)
    const dx = o.at[0] - to[0]
    const dy = o.at[1] - 6 - to[1]
    if (!reduced())
      lid.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) rotate(${-rot}deg) scale(1.06)`, offset: 0 },
          { transform: `translate(${dx * 0.8}px, ${dy - 52}px) rotate(${-rot - 80}deg) scale(1.12)`, offset: 0.3 },
          { transform: `translate(${dx * 0.2}px, ${dy * 0.2 - 44}px) rotate(-150deg) scale(1.05)`, offset: 0.72 },
          { transform: 'translate(0, 3px) rotate(-352deg) scale(1.02, 0.92)', offset: 0.93 },
          { transform: 'translate(0, 0) rotate(-360deg) scale(1)', offset: 1 },
        ],
        { duration: 620, easing: 'cubic-bezier(0.3, 0.5, 0.5, 1)' },
      )
    m.later(() => mk.shell(), reduced() ? 0 : 580)
    shucked++
    bump('cm:oysters-opened')
    // one in fourteen has a pearl; the eighteenth you ever open has one for sure if you never found any
    if (!save.stats['cm:pearl'] && !oysters.some((x) => x.pearl) && ((save.stats['cm:oysters-opened'] ?? 0) >= 18 || Math.random() < 1 / 14)) {
      const p = el('img', 'ob-pearl') as HTMLImageElement
      p.src = `${SP}cm-pearl.png`
      p.draggable = false
      o.box.append(p)
      o.pearl = p
    }
    if (shucked === 1) {
      m.later(() => {
        if (o.state === 'open') hint('Slurp it', [o.at[0], o.at[1] - 30])
        for (const t of ['lemon', 'mig', 'hot'] as const) {
          tools[t].classList.remove('nudge')
          void tools[t].offsetWidth
          tools[t].classList.add('nudge')
        }
      }, 700)
    }
    if (oysters.every((x) => x.state !== 'closed')) step('slurp')
    placeTool()
  }

  function dress(o: Oyster, t: 'lemon' | 'mig' | 'hot') {
    hint(null)
    const mx = 27 + (Math.random() - 0.5) * 12
    const my = 36 + (Math.random() - 0.5) * 7
    if (t === 'lemon') {
      mk.squeeze()
      tools.lemon.animate([{ scale: '1' }, { scale: '0.74 1.1' }, { scale: '1' }], { duration: 300, easing: 'ease-out' })
      for (let i = 0; i < 4; i++) {
        const d = el('i', 'ob-drop')
        d.style.cssText = `left:${pos[0] - 4 + (Math.random() - 0.5) * 16}px;top:${pos[1] - 4}px`
        root.append(d)
        d.animate([{ transform: 'translateY(0) scaleY(1)', opacity: 1 }, { transform: `translateY(${o.at[1] + 6 - pos[1] + 4}px) scaleY(1.5)`, opacity: 0.9, offset: 0.85 }, { transform: `translateY(${o.at[1] + 8 - pos[1] + 4}px) scale(1.6, 0.3)`, opacity: 0 }], { duration: 300 + i * 70, delay: i * 55, easing: 'ease-in', fill: 'backwards' }).onfinish = () => d.remove()
      }
      if (!o.lemon) {
        o.lemon = true
        o.box.insertAdjacentHTML('beforeend', '<i class="ob-juice"></i>')
      }
    } else if (t === 'mig') {
      mk.plop()
      if (o.mig < 3) o.box.insertAdjacentHTML('beforeend', `<i class="ob-mig" style="left:${mx - 6}px;top:${my - 4}px;rotate:${Math.random() * 60 - 30}deg"></i>`)
      o.mig++
    } else {
      sfx.squirt()
      if (o.hot < 7) o.box.insertAdjacentHTML('beforeend', `<i class="ob-hot" style="left:${mx - 3}px;top:${my - 3}px"></i>`)
      o.hot++
      if (o.hot === 3) {
        face('o')
        hop()
        say('It’s an oyster, not a wing.', 2200)
        m.later(() => face('smile'), 1800)
      }
    }
    o.box.animate([{ translate: '0 0' }, { translate: '0 2px' }, { translate: '0 0' }], { duration: 180 })
  }

  function takePearl(o: Oyster) {
    const p = o.pearl
    if (!p) return
    o.pearl = null
    p.remove()
    hint(null)
    const at: Pt2 = [o.at[0] + 2, o.at[1] + 6]
    const big = el('img', 'ob-pearl-up') as HTMLImageElement
    big.src = `${SP}cm-pearl.png`
    big.style.cssText = `left:${at[0] - 32}px;top:${at[1] - 32}px`
    root.append(big)
    sfx.ding()
    sparkle(at, 8)
    const dx = 440 - at[0]
    const dy = 330 - at[1]
    big.animate(
      [
        { transform: 'translate(0,0) scale(0.2)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy - 14}px) scale(1.12)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${dx}px, ${dy - 6}px) scale(1)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${dx}px, ${dy - 40}px) scale(0.8)`, opacity: 0 },
      ],
      { duration: reduced() ? 900 : 2400, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
    ).onfinish = () => big.remove()
    m.later(() => sparkle([440, 330], 12), reduced() ? 0 : 700)
    if (!save.stats['cm:pearl']) bump('cm:pearl')
    g.stamp('oyster-pearl')
    face('o')
    if (!pearlSaid) {
      pearlSaid = true
      m.later(() => say('That never happens.', 2400), 500)
    }
    m.later(() => face('smile'), 2600)
  }

  /** tip it back: the shell comes up to you, tilts, and goes back on the ice empty and upside down */
  async function slurp(o: Oyster) {
    if (busy || o.state !== 'open') return
    busy = true
    hint(null)
    const tx = 440 - o.at[0]
    const ty = 318 - o.at[1]
    const up = `translate(${tx}px, ${ty}px)`
    const empty = () => {
      o.img.src = `${SP}cm-oyster-empty.png`
      for (const x of o.box.querySelectorAll('.ob-juice, .ob-mig, .ob-hot')) x.remove()
    }
    const flipped = () => (o.img.src = `${SP}cm-oyster-lid.png`)
    const rest = 'translate(0px, 3px) rotate(180deg) scale(0.92, 0.92)'
    o.box.classList.add('lifted')
    if (reduced()) {
      mk.slurp()
      empty()
      await wait(30)
      flipped()
    } else {
      sfx.whoosh()
      await o.box.animate([{ transform: 'translate(0px, 0px) rotate(0deg) scale(1, 1)' }, { transform: `${up} rotate(-8deg) scale(3.1, 3.1)` }], { duration: 360, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)', fill: 'forwards' }).finished
      if (!m.alive) return
      mk.slurp()
      m.later(empty, 210)
      await o.box.animate(
        [
          { transform: `${up} rotate(-8deg) scale(3.1, 3.1)` },
          { transform: `translate(${tx}px, ${ty + 34}px) rotate(34deg) scale(3.5, 2.5)`, offset: 0.45 },
          { transform: `translate(${tx}px, ${ty + 34}px) rotate(34deg) scale(3.5, 2.5)`, offset: 0.7 },
          { transform: `${up} rotate(-4deg) scale(3, 3)` },
        ],
        { duration: 620, easing: 'ease-in-out', fill: 'forwards' },
      ).finished
      if (!m.alive) return
      m.later(flipped, 190)
      await o.box.animate(
        [
          { transform: `${up} rotate(-4deg) scale(3, 3)` },
          { transform: `translate(${tx * 0.5}px, ${ty * 0.5 - 18}px) rotate(84deg) scale(2, 0.14)`, offset: 0.45 },
          { transform: 'translate(0px, -5px) rotate(176deg) scale(0.98, 0.98)', offset: 0.86 },
          { transform: rest },
        ],
        { duration: 440, easing: 'cubic-bezier(0.4, 0.2, 0.4, 1)', fill: 'forwards' },
      ).finished
      if (!m.alive) return
    }
    for (const a of o.box.getAnimations()) a.cancel()
    o.box.style.transform = rest
    o.box.classList.remove('lifted', 'open')
    o.box.classList.add('done')
    o.state = 'done'
    mk.shell()
    bits([o.at[0], o.at[1] + 6], 5, ['#fff', '#dbe6f2'], 44)
    slurped++
    busy = false
    if (slurped === 6) void finishOysters()
  }

  async function finishOysters() {
    busy = true
    putBack()
    bump('snacks')
    g.stamp('half-dozen')
    crawl()
    sfx.levelUp()
    face('grin')
    hop()
    await wait(1100)
    // he takes the tray and the shells away
    served = false
    root.classList.remove('served')
    tools.knife.hidden = true
    tools.lemon.hidden = true
    trayEl.classList.add('gone')
    pileEl.classList.add('gone')
    mk.clunk()
    await wait(460)
    trayEl.hidden = true
    trayEl.innerHTML = ''
    pileEl.innerHTML = ''
    pileEl.classList.remove('gone')
    oysters = []
    face('smile')
    busy = false
    showMenu('Another half dozen?')
  }
  /** the market crawl: one meal at each of the four shops */
  function crawl() {
    if (!save.stats['cm:oysters']) bump('cm:oysters')
    if (['cm:tacos', 'cm:oysters', 'cm:doughnuts', 'cm:books'].every((k) => save.stats[k])) g.stamp('market-crawl')
  }

  // ---------- the lobster roll ----------
  async function serveRoll() {
    guy.classList.add('reach-r')
    // one comes up out of the steamer
    const lift = q('.ob-lift')
    lift.classList.remove('go')
    void lift.offsetWidth
    lift.classList.add('go')
    sfx.whoosh()
    mk.sizzle()
    await wait(620)
    const r = ROLL
    const hh = (r.h * r.show) / r.w
    await fly(`${SP}cm-lobster-roll.png`, STEAMER, [r.at[0], r.at[1] - hh / 2], r.show, 680, 110)
    if (!m.alive) return
    mk.thump()
    guy.classList.remove('reach-r')
    const id = 'ob' + Math.random().toString(36).slice(2, 7)
    const src = `${SP}cm-lobster-roll.png`
    plate.innerHTML = `<i class="ob-roll-shadow"></i><svg class="ob-roll" viewBox="0 0 ${r.w} ${r.h}" style="left:${r.at[0] - r.show / 2}px;top:${r.at[1] - hh / 2}px;width:${r.show}px;height:${hh}px" overflow="visible">
      <defs>
        <mask id="${id}b" maskUnits="userSpaceOnUse" x="-80" y="-80" width="${r.w + 160}" height="${r.h + 160}"><rect x="-80" y="-80" width="${r.w + 160}" height="${r.h + 160}" fill="#fff"/></mask>
        <mask id="${id}s" maskUnits="userSpaceOnUse" x="0" y="0" width="${r.w}" height="${r.h}" style="mask-type:alpha"><image href="${src}" width="${r.w}" height="${r.h}"/></mask>
        <clipPath id="${id}t"><polygon points="6,184 60,206 92,222 126,247 392,127 414,110 388,172 380,224 132,300 118,297 28,224"/></clipPath>
      </defs>
      <polygon points="16,190 300,78 408,116 126,250" fill="#eadfca" stroke="#1d2140" stroke-width="4" stroke-linejoin="round"/>
      <polygon points="74,206 292,116 376,134 132,240" fill="#d6c8ad"/>
      <path d="M 16 190 L 74 206 M 300 78 L 292 116 M 408 116 L 376 134" fill="none" stroke="#b5a486" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M 170 190 l 7 -2 M 230 168 l 5 3 M 268 150 l 6 -1 M 205 205 l 4 2" stroke="#c98a3a" stroke-width="4" stroke-linecap="round"/>
      <image href="${src}" width="${r.w}" height="${r.h}" clip-path="url(#${id}t)"/>
      <g mask="url(#${id}b)"><image href="${src}" width="${r.w}" height="${r.h}"/><g class="ob-rims" mask="url(#${id}s)"></g></g>
    </svg>`
    const svg = plate.querySelector<SVGSVGElement>('.ob-roll')!
    roll = { svg, mask: svg.querySelector(`#${id}b`)!, bites: 0, eating: false }
    step('eat')
    afterEl.hidden = false
  }
  q('.ob-eat').onclick = (e) => {
    e.stopPropagation()
    if (!roll) return
    sfx.click()
    afterEl.hidden = true
    roll.eating = true
    root.classList.add('eating')
    hint('Take a bite', [ROLL.at[0], ROLL.at[1] - 74])
  }
  q('.ob-togo').onclick = (e) => {
    e.stopPropagation()
    sfx.click()
    mk.bag()
    m.close()
  }
  const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
    const n = document.createElementNS(NS, tag)
    for (const [a, v] of Object.entries(attrs)) n.setAttribute(a, String(v))
    return n
  }
  const overRoll = (p: Pt2) => {
    const hh = (ROLL.h * ROLL.show) / ROLL.w
    return Math.abs(p[0] - ROLL.at[0]) < ROLL.show / 2 + 6 && Math.abs(p[1] - ROLL.at[1]) < hh / 2 + 6
  }
  function bite(at: Pt2) {
    if (!roll || roll.bites >= 4 || busy) return
    roll.bites++
    hint(null)
    mk.bite()
    sfx.chomp()
    const a = ROLL.ax
    const len = a.half + a.back
    const last = roll.bites === 4
    const s = last ? 0 : a.half - (len * (roll.bites - 0.5)) / 4 + len * 0.04
    const cx = a.cx + a.dx * s
    const cy = a.cy + a.dy * s
    const rx = last ? len * 0.7 : len / 7
    const ry = last ? ROLL.h : a.thick * 1.2 + 40
    const ang = Math.atan2(a.dy, a.dx)
    const ca = Math.cos(ang)
    const sa = Math.sin(ang)
    const shapes: SVGElement[] = [svgEl('ellipse', { cx: cx.toFixed(1), cy: cy.toFixed(1), rx: rx.toFixed(1), ry: ry.toFixed(1), transform: `rotate(${(ang * 180) / Math.PI} ${cx.toFixed(1)} ${cy.toFixed(1)})` })]
    if (!last)
      for (const deg of [150, 165, 180, 195, 210]) {
        const t = (deg * Math.PI) / 180
        const lx = Math.cos(t) * rx
        const ly = Math.sin(t) * ry * 0.62
        shapes.push(svgEl('circle', { cx: (cx + lx * ca - ly * sa).toFixed(1), cy: (cy + lx * sa + ly * ca).toFixed(1), r: (rx * 0.52).toFixed(1) }))
      }
    const rims = roll.svg.querySelector('.ob-rims')!
    for (const [i, sh] of shapes.entries()) {
      const hole = sh.cloneNode() as SVGElement
      hole.setAttribute('fill', '#000')
      roll.mask.append(hole)
      if (i === 0) continue
      const soft = sh.cloneNode() as SVGElement
      soft.setAttribute('fill', 'none'); soft.setAttribute('stroke', '#f9e7b4'); soft.setAttribute('stroke-width', '14')
      const line = sh.cloneNode() as SVGElement
      line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#1d2140'); line.setAttribute('stroke-width', '3.5'); line.setAttribute('opacity', '0.8')
      rims.append(soft, line)
    }
    roll.svg.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.95, 1.04) translateY(3px)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' })
    bits(at, 8, ['#e9b35f', '#c98a3a', '#f3d9c9', '#e8503a'], 90)
    if (last) void finishRoll()
  }
  async function finishRoll() {
    busy = true
    bump('snacks')
    g.stamp('market-price')
    crawl()
    sfx.levelUp()
    face('grin')
    hop()
    say('Thirty coins. Gone.', 2000)
    await wait(1300)
    plate.classList.add('done')
    mk.bag()
    await wait(480)
    plate.innerHTML = ''
    plate.classList.remove('done')
    root.classList.remove('eating')
    roll = null
    face('smile')
    busy = false
    showMenu('What’ll it be?')
  }

  // ---------- tools: pick up, put back ----------
  function placeTool() {
    if (!held) return
    const t = TOOLS[held]
    const o = oysterAt(pos)
    let rot = t.rot
    if (o && (held === 'knife' ? o.state === 'closed' : o.state === 'open')) rot = t.over
    if (twist) rot = t.over - Math.min(52, twist.d * 1.2)
    tools[held].style.transform = `translate(${pos[0]}px, ${pos[1]}px) rotate(${rot}deg)`
  }
  function pickUp(t: ToolId) {
    if (busy) return
    if (!served) {
      if (roll || pending) return
      hop()
      return say('Order first.')
    }
    putBack()
    held = t
    sfx.click()
    if (t === 'knife') mk.clunk()
    else sfx.pop()
    root.classList.add('holding')
    tools[t].classList.remove('nudge')
    tools[t].classList.add('held')
    placeTool()
    showLabel(null)
    if (t === 'knife') {
      if (!guided) {
        say('Hinge first.', 2000)
        showGuide()
      } else if (shucked === 0) showGuide()
      else hint(null)
    } else if (!oysters.some((o) => o.state === 'open')) {
      hint('Shuck one first', [785, 438])
    } else hint(null)
  }
  function putBack() {
    if (!held) return
    const tl = tools[held]
    tl.classList.remove('held')
    tl.style.transform = ''
    if (held === 'knife') dropGuide()
    held = null
    twist = null
    root.classList.remove('holding')
  }
  const LABEL_AT: Record<ToolId, Pt2> = { knife: [785, 436], lemon: [440, 438], mig: [670, 432], hot: [715, 432] }
  for (const t of Object.keys(TOOLS) as ToolId[]) {
    tools[t].onpointerenter = () => !held && showLabel(TOOLS[t].name, LABEL_AT[t])
    tools[t].onpointerleave = () => showLabel(null)
    tools[t].onpointerdown = (e) => {
      e.stopPropagation()
      if (held === t) return putBack()
      pickUp(t)
    }
  }

  // ---------- the lobster tank: tap the glass ----------
  const tank = q<SVGPolygonElement>('.ob-shape')
  tank.onpointerenter = () => !held && showLabel('Lobster Tank', [150, 162])
  tank.onpointerleave = () => showLabel(null)
  tank.onpointerdown = (e) => {
    e.stopPropagation()
    if (held) return putBack()
    const p = toStage(e) as Pt2
    sfx.thunk()
    const ring = el('i', 'ob-tap')
    ring.style.cssText = `left:${p[0]}px;top:${p[1]}px`
    root.append(ring)
    setTimeout(() => ring.remove(), 520)
    // bubbles come off the bottom under your finger, and one lobster's claw twitches
    const bx = Math.max(12, Math.min(288, p[0] - 30))
    for (let i = 0; i < 12; i++) {
      const b = el('i', 'ob-burst')
      const sz = 3 + Math.random() * 5
      b.style.cssText = `left:${bx + (Math.random() - 0.5) * 46}px;bottom:${4 + Math.random() * 30}px;width:${sz}px;height:${sz}px;animation-delay:${i * 45}ms;animation-duration:${900 + Math.random() * 600}ms`
      tankEl.append(b)
      setTimeout(() => b.remove(), 2200)
    }
    m.later(() => mk.plop(), 160)
    const claw = q('.ob-claw')
    claw.classList.remove('go')
    void claw.offsetWidth
    claw.classList.add('go')
  }

  // ---------- the pointer ----------
  root.addEventListener('pointermove', (e) => {
    pos = toStage(e) as Pt2
    if (twist) {
      twist.d = Math.hypot(pos[0] - twist.from[0], pos[1] - twist.from[1])
      twist.o.box.style.rotate = `${Math.sin(twist.d / 5) * 5}deg`
      if (twist.d >= 36) shuck(twist.o)
    }
    placeTool()
    if (!held && !busy) {
      const o = oysterAt(pos)
      root.classList.toggle('point', !!o || (!!roll?.eating && overRoll(pos)))
    }
  })
  root.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement
    if (t.closest('.ob-actions, .ob-menu, .ob-pay, .ob-after, .ob-tool, .ob-shape')) return
    pos = toStage(e) as Pt2
    if (busy) return
    if (roll) {
      if (roll.eating && overRoll(pos)) bite(pos)
      return
    }
    const o = served ? oysterAt(pos) : null
    if (!o) return putBack()
    if (o.state === 'closed') {
      if (held === 'knife') {
        root.setPointerCapture(e.pointerId)
        twist = { o, from: pos, d: 0 }
        mk.shave()
        placeTool()
        return
      }
      putBack()
      tools.knife.classList.remove('nudge')
      void tools.knife.offsetWidth
      tools.knife.classList.add('nudge')
      return hint('Grab the knife', [785, 438])
    }
    // an open one
    if (o.pearl) return takePearl(o)
    if (held && held !== 'knife') return dress(o, held)
    putBack()
    void slurp(o)
  })
  const up = () => {
    if (!twist) return
    const tw = twist
    twist = null
    tw.o.box.style.rotate = ''
    if (shucked > 0 && tw.d < 10) return shuck(tw.o)
    // pressed but never twisted
    hop()
    say('Now twist.', 1500)
    placeTool()
  }
  root.addEventListener('pointerup', up)
  root.addEventListener('pointercancel', up)

  // ---------- leaving ----------
  q('.ob-leave').onclick = () => {
    sfx.click()
    m.close()
  }
  m.onClose(() => {
    clearTimeout(bubbleT)
    // the roll goes with you (To go, or walking off mid-roll); oysters are eaten at the bar
    if (roll && roll.bites < 4 && g.owns('lobster-roll')) g.wear('lobster-roll')
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
