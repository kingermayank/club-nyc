import './exchange.css'
import { sfx } from '../audio'
import { exchange as foley, arrival } from '../foley'
import { el } from '../engine/stage'
import { world, onRoom } from '../engine/world'
import { save, persist } from '../state'
import { companyLogo } from '../data/logos'
import { ipoFor, nycDay, fmt, todaysIpo, loadMarket, liveMarket, type Ipo } from '../data/ipos'
import { quadMatrix, passersBy } from './downtown'
import { openMoment, hint, shout, sparks } from './moments/kit'
import { avatarMarkup } from '../avatar/render'
import type { Game } from '../types'
import type { Pt } from '../geometry'

/**
 * Inside the Exchange: the trading floor. Every day one New York company goes public (data/ipos.ts) and somebody
 * has to ring the opening bell. Walk up the stairs to the podium: the big screen counts down to 9:30:00, you press
 * the red button on the dot and hold it while the bell rings (the real one is an electric bell, about ten seconds),
 * the floor goes up, and the new stock pops on the screen. The wall tickers carry the week's IPO class, the trading
 * posts' monitors never stop moving, and the stock keeps trading for the rest of the New York day.
 */

const RUNG = 'exchange:rung'
const rungToday = () => save.stats[RUNG] === nycDay()

/** the board over the flag, in the room art (logical coords). The screen is laid out at twice its size and drawn
 *  at half, so the same layouts serve the room's slim band and the close-up's big jumbotron. */
const BAND = { x: 377, y: 56, w: 235, h: 26 }
/** the close-up at the podium (art/places/exchange-podium.jpg): the jumbotron, the strike block, the bell */
const JUMBO = { x: 360, y: 6, w: 280, h: 54, k: 0.8 }
const BLOCK: Pt = [500, 238]
const DOME: Pt = [497, 360]
/** your New Yorker behind the podium: where the avatar's (0, 0) lands, and its scale */
const YOU = { x: 500, top: 52, k: 1.35 }

/** the screen over the podium: today's listing, the countdown, then the stock trading */
interface Screen {
  listing(): void
  clock(left: number): void
  notYet(): void
  open(): void
  trade(pop: boolean): void
  stop(): void
  remove(): void
}
let screen: Screen | null = null

/** the company's badge: our emblem for the city's own companies, the ticker's first letters for real ones */
// a real listing has no artwork of ours: it gets an original logo for the day (data/logos.ts), never initials
const emblem = (ipo: Ipo) =>
  ipo.logo
    ? `<i class="ex-logo tile"><img src="${ipo.logo}" alt="" draggable="false"></i>`
    : ipo.icon
    ? `<i class="ex-logo" style="--c:${ipo.color}"><img src="/art/icons/e/${ipo.icon}.png" alt="" draggable="false"></i>`
    : `<i class="ex-logo made">${companyLogo(ipo.sym, ipo.name, nycDay())}</i>`
/** one line of the tape */
const tick = (sym: string, price: number, pct: number, tag = '') => `<span class="${pct >= 0 ? 'up' : 'down'}"><b>${sym}</b> ${tag}${fmt(price)} ${pct >= 0 ? '▲' : '▼'}${Math.abs(pct).toFixed(1)}%</span>`
/** the floor's tape: real quotes and the month's IPO class when the feed is up, the city's own listings when not */
function tapeItems(ipo: Ipo): string {
  const m = liveMarket()
  const today = rungToday() || ipo.live ? tick(ipo.sym, ipo.live?.now ?? ipo.price * (1 + ipo.pop / 100), ipo.pop, 'IPO ') : `<span class="up"><b>${ipo.sym}</b> IPO ${fmt(ipo.price)}</span>`
  if (m?.listing) {
    const recent = (m.recent ?? []).filter((r) => r.quote).map((r) => tick(r.sym, r.quote!.price, ((r.quote!.price - r.offer) / r.offer) * 100, 'IPO '))
    const big = (m.tape ?? []).map((q) => tick(q.sym, q.price, ((q.price - q.prev) / q.prev) * 100))
    const next = m.next ? `<span class="note">COMING ${m.next.date ? new Date(m.next.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase() : 'SOON'}: ${m.next.sym}</span>` : ''
    // the real listing of the day rides the tape (the bell belongs to the city's own company)
    const l = m.listing
    const real = l.quote && l.sym !== ipo.sym ? tick(l.sym, l.quote.price, ((l.quote.price - l.offer) / l.offer) * 100, 'IPO ') : ''
    return today + real + next + big.slice(0, 5).join('') + recent.join('') + big.slice(5).join('')
  }
  return (
    today +
    [1, 2, 3, 4, 5, 6]
      .map((d) => ipoFor(d))
      .map((p, i) => {
        // last week's class has had time to settle: some held the pop, some gave it back
        const move = Math.round(p.pop * (0.9 - ((i * 37 + p.sym.length * 13) % 10) / 6))
        return tick(p.sym, p.price * (1 + move / 100), move)
      })
      .join('')
  )
}

function mountScreen(scene: HTMLElement, ipo: Ipo, at: { x: number; y: number; w: number; h: number; k?: number }): Screen {
  const s = el('div', 'ex-screen')
  const k = at.k ?? 0.5
  s.style.cssText = `left:${at.x}px;top:${at.y}px;width:${at.w / k}px;height:${at.h / k}px;transform:scale(${k});transform-origin:0 0`
  scene.append(s)
  const opened = ipo.live?.now ?? ipo.price * (1 + ipo.pop / 100)
  let timer = 0
  let raf = 0
  const clear = () => {
    clearInterval(timer)
    cancelAnimationFrame(raf)
  }

  const listing = () => {
    clear()
    s.className = 'ex-screen listing'
    s.innerHTML = `${emblem(ipo)}<div class="ex-id"><b>${ipo.sym}</b><span>${ipo.name}</span></div><div class="ex-ipo"><em>IPO</em><b>${fmt(ipo.price)}</b></div>`
  }

  const clock = (left: number) => {
    // 9:29:55 … 9:30:00 … and on, if nobody presses
    const t = Math.max(0, Math.floor(-left))
    const secs = left > 0 ? 60 - Math.ceil(left) : t
    const txt = left > 0 ? `9:29:${String(secs).padStart(2, '0')}` : `9:30:${String(t).padStart(2, '0')}`
    if (!s.classList.contains('clock')) {
      clear()
      s.className = 'ex-screen clock'
      s.innerHTML = `${emblem(ipo)}<b class="ex-time"></b><span class="ex-bellic"><img src="/art/icons/e/bell.png" alt="" draggable="false"></span>`
    }
    s.classList.toggle('now', left <= 0)
    s.querySelector('.ex-time')!.textContent = txt
  }

  const notYet = () => {
    s.classList.remove('nope')
    void s.offsetWidth
    s.classList.add('nope')
  }

  const open = () => {
    clear()
    s.className = 'ex-screen opened'
    s.innerHTML = `<b class="ex-big">${ipo.sym}</b><span class="ex-flash">OPEN</span>`
  }

  /** the stock trading: a line that grows across the screen, the price and the day's move */
  const trade = (pop: boolean) => {
    clear()
    s.className = 'ex-screen trading'
    s.innerHTML = `${emblem(ipo)}<b class="ex-sym">${ipo.sym}</b><svg class="ex-chart" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline/></svg><div class="ex-px"><b></b><span></span></div>`
    const line = s.querySelector('polyline')!
    const px = s.querySelector<HTMLElement>('.ex-px b')!
    const chg = s.querySelector<HTMLElement>('.ex-px span')!
    const hist: number[] = []
    let price = ipo.price
    const draw = () => {
      const lo = Math.min(ipo.price, ...hist)
      const hi = Math.max(...hist, ipo.price * 1.05)
      const span = hi - lo || 1
      line.setAttribute('points', hist.map((v, i) => `${((i / Math.max(1, hist.length - 1)) * 100).toFixed(1)},${(37 - ((v - lo) / span) * 33).toFixed(1)}`).join(' '))
      px.textContent = fmt(price)
      const p = ((price - ipo.price) / ipo.price) * 100
      chg.textContent = `${p >= 0 ? '▲' : '▼'}${Math.abs(p).toFixed(1)}%`
      s.classList.toggle('down', p < 0)
    }
    // a real stock: today's real prices, nothing invented (the feed is delayed, so it just holds between refreshes)
    const real = ipo.live && ipo.live.series.length > 1 ? ipo.live.series : null
    const walk = () => {
      if (real) return
      price = Math.max(ipo.price * 0.8, price * (1 + (Math.random() - 0.48) * 0.012))
      hist.push(price)
      if (hist.length > 48) hist.shift()
      draw()
    }
    if (pop) {
      // the first trade: up from the offer price to the pop in about four seconds, wobbling on the way
      const t0 = performance.now()
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 4000)
        const ease = 1 - (1 - k) ** 3
        if (real) {
          // replay the real day: from the offer price through today's prices, in four seconds
          const n = Math.max(1, Math.round(ease * real.length))
          hist.length = 1
          hist.push(...real.slice(0, n))
          price = k < 1 ? hist[hist.length - 1] : opened
        } else {
          price = ipo.price + (opened - ipo.price) * ease * (1 + (Math.random() - 0.5) * 0.04 * (1 - k))
          if (!hist.length || now - t0 > hist.length * 90) hist.push(price)
        }
        draw()
        if (k < 1) raf = requestAnimationFrame(step)
        else timer = window.setInterval(walk, 1100)
      }
      hist.push(ipo.price)
      raf = requestAnimationFrame(step)
    } else {
      // it's been trading since this morning
      if (real) {
        hist.push(...real)
        price = opened
        draw()
        return
      }
      for (let i = 0; i < 30; i++) hist.push(ipo.price + (opened - ipo.price) * (1 - (1 - i / 29) ** 3) * (1 + (Math.random() - 0.5) * 0.05))
      price = hist[hist.length - 1]
      draw()
      timer = window.setInterval(walk, 1100)
    }
  }

  if (rungToday()) trade(false)
  else listing()
  return { listing, clock, notYet, open, trade, stop: clear, remove: () => (clear(), s.remove()) }
}

/** the two LED strips along the balconies: the week's IPO class and how each one did */
function mountStrips(scene: HTMLElement, ipo: Ipo) {
  const W = 600
  const H = 110
  const items = () => tapeItems(ipo)
  const notes = `<span class="note">IPO WEEK</span><span class="note dim">${liveMarket()?.listing ? 'QUOTES DELAYED 15 MIN' : 'PRICES IN CLUB NYC COINS'}</span><span class="note">THE BELL RINGS AT 9:30</span><span class="note dim">NO PIGEONS ON THE FLOOR</span>`
  const strips = ([
    [[0, 82], [222, 146], [0, 126], [222, 171]],
    [[762, 146], [1000, 82], [762, 171], [1000, 126]],
  ] as [Pt, Pt, Pt, Pt][]).map((q, i) => {
    const b = el('div', 'ws-ticker ex-strip')
    b.style.width = `${W}px`
    b.style.height = `${H}px`
    b.style.transform = quadMatrix(W, H, q)
    const row = (cls: string, html: string) => `<div class="ws-row ${cls}"><div class="ws-run">${html}${html}</div></div>`
    b.innerHTML = i === 0 ? row('top', items()) + row('bottom', notes) : row('bottom', notes) + row('top', items())
    scene.append(b)
    return b
  })
  return {
    refresh() {
      for (const b of strips) b.querySelector('.ws-row.top .ws-run')!.innerHTML = items() + items()
    },
    remove: () => strips.forEach((b) => b.remove()),
  }
}

/** the trading pods' big middle monitors: live candlestick charts, a new candle every second or so */
const POD_SCREENS: [x: number, y: number, w: number, h: number][] = [
  [54, 171, 69, 38], [54, 236, 63, 37], [868, 170, 66, 39], [876, 235, 64, 36],
]
function mountPodScreens(scene: HTMLElement) {
  const N = 11
  const charts = POD_SCREENS.map(([x, y, w, h], i) => {
    const m = el('div', 'ex-pod', `<svg viewBox="0 0 ${N * 10} 40" preserveAspectRatio="none"></svg>`)
    m.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`
    scene.append(m)
    let v = 20 + (i % 3) * 3
    const candles: [o: number, c: number, hi: number, lo: number][] = []
    const next = () => {
      const o = v
      v = Math.max(6, Math.min(34, v + (Math.random() - 0.47) * 7))
      candles.push([o, v, Math.max(o, v) + Math.random() * 3, Math.min(o, v) - Math.random() * 3])
      if (candles.length > N) candles.shift()
    }
    for (let k = 0; k < N; k++) next()
    const draw = () => {
      m.firstElementChild!.innerHTML = candles
        .map(([o, c, hi, lo], k) => {
          const up = c >= o
          const cx = k * 10 + 5
          const top = 40 - Math.max(o, c)
          const ht = Math.max(1.5, Math.abs(c - o))
          return `<g class="${up ? 'up' : 'dn'}"><line x1="${cx}" x2="${cx}" y1="${40 - hi}" y2="${40 - lo}"/><rect x="${cx - 3}" y="${top}" width="6" height="${ht}"/></g>`
        })
        .join('')
    }
    draw()
    return { next, draw }
  })
  let k = 0
  const t = window.setInterval(() => {
    // one pod at a time, so the floor flickers rather than ticking in lockstep
    const c = charts[k++ % charts.length]
    c.next()
    c.draw()
  }, 320)
  return () => clearInterval(t)
}

let strips: { refresh(): void } | null = null

onRoom('exchange-floor', ({ scene }) => {
  let unbuild = () => {}
  const build = () => {
    const ipo = todaysIpo()
    screen = mountScreen(scene, ipo, BAND)
    const st = mountStrips(scene, ipo)
    strips = st
    unbuild = () => {
      screen?.remove()
      st.remove()
    }
  }
  build()
  // the real listing (Nasdaq's calendar, delayed quotes): swap it in when it arrives, unless the bell is mid-ring
  let here = true
  if (!liveMarket()) {
    void loadMarket().then((m) => {
      if (!here || !m?.listing || document.querySelector('.mo-ipo')) return
      unbuild()
      build()
    })
  }
  const offMon = mountPodScreens(scene)
  // a few New Yorkers on the floor, so somebody cheers when the bell goes
  const offLocals = passersBy('exchange-floor', 3)
  return () => {
    here = false
    offLocals()
    screen?.stop()
    screen = null
    strips = null
    offMon()
  }
})

/** something true and a little funny about today's company */
const sayLine = (ipo: Ipo) => (ipo.live?.facts.length ? ipo.live.facts[Math.floor(Math.random() * ipo.live.facts.length)] : ipo.line)

/** clicking the big screen: what's listing today */
export function readScreen(g: Game) {
  const ipo = todaysIpo()
  if (rungToday()) g.say(sayLine(ipo))
  else g.say(`${ipo.name} goes public today. Somebody has to ring the bell.`)
}

/**
 * The bell ceremony, up close: you stand at the podium on the balcony, a giant flag behind you, the brass dome bell
 * on the podium's front and a gavel in your hand. The jumbotron over the flag counts down from 9:29:55. Bang the
 * gavel on the block at 9:30:00 and the bell rings out over the floor, the stock opens and pops. Bang early and you
 * get a dull thud and a "Not yet!" from the floor. You can keep banging while it rings (everybody does).
 */
export function ringOpeningBell(g: Game) {
  const ipo = todaysIpo()
  const again = rungToday()
  const m = openMoment('mo-ipo')
  const LEAD = 5 // seconds of countdown before 9:30:00
  const RING = 4.2 // how long the bell rings after the bang

  // you, behind the podium (nothing in your hand but the gavel), cut off at the podium's top edge
  const look = { ...save.look, items: { ...save.look.items } }
  delete look.items.hand
  const GAVEL = `<image class="ex-gavel" href="/art/places/sprites/gavel.png" x="-11.5" y="-50.5" width="38" height="20.2" preserveAspectRatio="none"/>`
  const you = el('div', 'ex-you')
  you.innerHTML = `<svg viewBox="-60 -185 120 192">${avatarMarkup(look, { mood: 'smile' })}</svg>`
  const arm = you.querySelector<SVGGElement>('.av-armR')!
  arm.insertAdjacentHTML('beforeend', GAVEL)
  const setArm = (deg: number) => arm.setAttribute('transform', `rotate(${deg} 17 -67)`)
  const setMood = (mood: 'smile' | 'grin' | 'o') => {
    const deg = arm.getAttribute('transform')
    you.innerHTML = `<svg viewBox="-60 -185 120 192">${avatarMarkup(look, { mood })}</svg>`
    const a = you.querySelector<SVGGElement>('.av-armR')!
    a.insertAdjacentHTML('beforeend', GAVEL)
    if (deg) a.setAttribute('transform', deg)
    armEl = a
  }
  let armEl = arm
  setArm(-120)

  const root = el('div', 'ex-podium')
  root.innerHTML = `<img class="ex-podium-bg" src="/art/places/exchange-podium.jpg" alt="" draggable="false">
    <div class="ex-you-clip"></div>
    <i class="ex-dome-glow" style="left:${DOME[0]}px;top:${DOME[1]}px"></i>
    <div class="ex-jumbo-frame" style="left:${JUMBO.x - 8}px;top:${JUMBO.y - 4}px;width:${JUMBO.w + 16}px;height:${JUMBO.h + 12}px"><i></i><i></i></div>
    <div class="ex-floor-say" hidden></div>
    <div class="ex-actions"><button class="btn tiny ghost ex-leave" type="button">Step Down</button></div>`
  root.querySelector('.ex-you-clip')!.append(you)
  you.style.cssText = `left:${YOU.x - 60 * YOU.k}px;top:${YOU.top}px;width:${120 * YOU.k}px;height:${192 * YOU.k}px`
  m.root.append(root)
  const jumbo = mountScreen(root, ipo, JUMBO)
  if (again) jumbo.trade(false)
  const floorSay = root.querySelector<HTMLElement>('.ex-floor-say')!
  const shoutFloor = (t: string) => {
    floorSay.textContent = t
    floorSay.hidden = false
    floorSay.classList.remove('go')
    void floorSay.offsetWidth
    floorSay.classList.add('go')
  }
  let tip: HTMLElement | null = hint(m, 'Bang it at 9:30', [BLOCK[0] + 116, BLOCK[1] - 34])

  let state: 'wait' | 'ringing' | 'done' = 'wait'
  let now = 0
  let ringAt = 0
  let lastSec = LEAD + 1
  let offBy = 0
  let stopBell: (() => void) | null = null
  let waveAt = 0
  let swinging = false

  /** the swing: arm back, then down hard onto the block (the arm group rotates about the shoulder) */
  const swing = (onHit: () => void) => {
    if (swinging) return
    swinging = true
    const t0 = performance.now()
    const from = -120
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 150)
      // a fast ease-in down to the block, a little bounce off it, then back up ready for the next one
      armEl.setAttribute('transform', `rotate(${from + (2 - from) * k * k} 17 -67)`)
      if (k < 1) return void requestAnimationFrame(step)
      onHit()
      setTimeout(() => armEl.setAttribute('transform', 'rotate(-14 17 -67)'), 70)
      setTimeout(() => {
        armEl.setAttribute('transform', `rotate(${from} 17 -67)`)
        swinging = false
      }, 260)
    }
    requestAnimationFrame(step)
  }
  const thud = () => {
    sfx.thunk()
    root.classList.remove('jolt')
    void root.offsetWidth
    root.classList.add('jolt')
    sparks(m, BLOCK, 5, '#e9c38a')
  }

  const bang = () => {
    if (state === 'done') return
    swing(() => {
      thud()
      if (state === 'ringing') {
        wave()
        return
      }
      const left = LEAD - now
      if (left > 0.35) {
        // too early: a dull thud, the screen shakes its head, the floor lets you know
        arrival.buzz()
        jumbo.notYet()
        shoutFloor(left > 3 ? 'Easy. It’s 9:29.' : 'Not yet!')
        return
      }
      offBy = -left
      state = 'ringing'
      ringAt = now
      tip?.remove()
      tip = null
      stopBell = foley.bell()
      jumbo.open()
      root.classList.add('ringing')
      setMood('grin')
      sparks(m, DOME, 10, '#fff2a8')
    })
  }
  const wave = () => {
    const w = el('i', 'ex-wave')
    w.style.cssText = `left:${DOME[0]}px;top:${DOME[1]}px`
    root.append(w)
    setTimeout(() => w.remove(), 900)
  }

  root.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.ex-actions')) return
    bang()
  })
  m.onKey((e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    if (!e.repeat) bang()
    return true
  })
  root.querySelector<HTMLButtonElement>('.ex-leave')!.onclick = () => {
    sfx.click()
    m.close()
  }
  m.onClose(() => {
    stopBell?.()
    jumbo.remove()
    // the room's own board catches up
    if (rungToday()) screen?.trade(false)
    else screen?.listing()
  })

  m.frame((_dt, t) => {
    now = t
    if (state === 'wait') {
      const left = LEAD - t
      jumbo.clock(left)
      const sec = Math.ceil(left)
      if (sec !== lastSec && sec >= 0) {
        lastSec = sec
        if (sec > 0) sfx.tick()
        if (sec === 0 && tip) {
          tip.remove()
          tip = hint(m, 'Now!', [BLOCK[0] + 90, BLOCK[1] - 34])
        }
      }
      return
    }
    if (state === 'ringing') {
      const rung = t - ringAt
      if (t - waveAt > 0.22) {
        waveAt = t
        wave()
      }
      if (rung >= RING) finish()
    }
  })

  function finish() {
    state = 'done'
    stopBell?.()
    stopBell = null
    root.classList.remove('ringing')
    root.classList.add('done')
    foley.cheer()
    g.confetti(46)
    jumbo.trade(true)
    m.later(() => shout(m, `${ipo.pop >= 0 ? '+' : ''}${ipo.pop}%`, [JUMBO.x + JUMBO.w / 2, JUMBO.y + JUMBO.h + 46], ipo.pop >= 0 ? 'gold' : 'bad'), 3600)
    const clean = Math.abs(offBy) <= 0.6
    shoutFloor(clean ? 'On the dot!' : 'And we’re open!')
    m.later(() => setMood('smile'), 1400)

    g.stamp('opening-bell')
    if (clean) g.stamp('clean-open')
    // the real bell rings at 9:30 in the morning, New York time
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
    const [hh, mm] = hm.split(':').map(Number)
    if (hh === 9 && mm >= 30) g.stamp('on-the-dot')
    if (!again) {
      save.stats[RUNG] = nycDay()
      persist()
      strips?.refresh()
    }
    setTimeout(() => {
      g.emote('cheer', 3)
      for (const a of world.npcs) if (!a.remote) a.emote('cheer', 2.5)
      g.say(sayLine(ipo))
    }, 7700)
    m.later(() => m.close(), 7400)
  }
}
