import './vault.css'
import { sfx } from '../../audio'
import { avatarPortrait } from '../../avatar/render'
import { el } from '../../engine/stage'
import { persist, save } from '../../state'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { closeX, hash, hint, nycDay, openMoment, pointer, sparks } from './kit'
import { GRAILS, dropOf, grailArt, grailItemId, type Grail } from '../../avatar/grails'

/**
 * The Vault, Sneaker Vault SoHo: you crack it. Turn the dial (drag it, or the arrow keys); the rim warms up as you close in
 * on a number and the tumbler drops when you rest on it. Three numbers, new every New York day, the same for the
 * whole city. The door swings open and you walk into the grail room: one-of-a-kind sneakers under glass that you
 * can try on in the mirror, each up close in a spotlight. Three are the archive; the gold plinth holds today's Drop, the
 * one you can buy, today only (avatar/grails.ts).
 */

// the grails themselves live in avatar/grails.ts (they're wearable too)
const INK = '#1d2140'

/** you in the mirror, in the grails (bare feet underneath, the pair drawn over them) */
function mirrorSvg(g: Grail | null): string {
  if (!g) return avatarPortrait(save.look)
  const look = { ...save.look, items: { ...save.look.items, feet: undefined } }
  return avatarPortrait(look, 'o').replace(/<\/svg>\s*$/, `${g.draw(-9)}${g.draw(9)}</svg>`)
}

// ---------- today's combination ----------
const N = 40 // numbers on the dial
const STEP = 360 / N
function combo(day: number): number[] {
  const out: number[] = []
  for (let i = 0, salt = 0; out.length < 3; salt++) {
    const n = hash(`vault:${day}:${i}:${salt}`) % N
    // never on top of where the dial already sits, so each number takes a real turn to find
    if (circ(n, out.length ? out[out.length - 1] : 0) < 8) continue
    out.push(n)
    i++
  }
  return out
}
const circ = (a: number, b: number) => {
  const d = Math.abs(a - b) % N
  return Math.min(d, N - d)
}

const CX = 500
const CY = 284
const DIAL_R = 86

function doorSvg(): string {
  const bolts = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2
    return `<circle cx="${200 + Math.cos(a) * 177}" cy="${200 + Math.sin(a) * 177}" r="8" fill="url(#vt-bolt)" stroke="${INK}" stroke-width="3"/>`
  }).join('')
  return `<svg viewBox="0 0 400 400" aria-hidden="true">
    <defs>
      <linearGradient id="vt-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9d2e6"/><stop offset=".45" stop-color="#8f9bb8"/><stop offset="1" stop-color="#5a6788"/></linearGradient>
      <linearGradient id="vt-steel2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#aab5d0"/><stop offset=".5" stop-color="#7783a4"/><stop offset="1" stop-color="#4c5878"/></linearGradient>
      <radialGradient id="vt-bolt" cx=".35" cy=".3"><stop offset="0" stop-color="#eef2fb"/><stop offset="1" stop-color="#77839f"/></radialGradient>
    </defs>
    <circle cx="200" cy="200" r="196" fill="url(#vt-steel)" stroke="${INK}" stroke-width="6"/>
    <circle cx="200" cy="200" r="156" fill="url(#vt-steel2)" stroke="${INK}" stroke-width="4"/>
    <path d="M 62 150 A 148 148 0 0 1 150 62" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".4"/>
    <circle cx="200" cy="200" r="108" fill="none" stroke="${INK}" stroke-width="3" opacity=".45"/>
    ${bolts}
    <path d="M 188 96 L 212 96 L 200 116 Z" fill="#ff5a4d" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  </svg>`
}

function dialSvg(): string {
  let s = ''
  for (let i = 0; i < N; i++) {
    const big = i % 5 === 0
    s += `<path d="M 100 ${big ? 6 : 8} L 100 ${big ? 19 : 14}" stroke="#fff" stroke-width="${big ? 3.2 : 1.8}" stroke-linecap="round" transform="rotate(${i * STEP} 100 100)"/>`
    if (big) s += `<text x="100" y="35" text-anchor="middle" transform="rotate(${i * STEP} 100 100)">${i}</text>`
  }
  const grip = Array.from({ length: 12 }, (_, i) => `<path d="M 100 62 L 100 70" stroke="${INK}" stroke-width="3" stroke-linecap="round" transform="rotate(${i * 30} 100 100)"/>`).join('')
  return `<svg viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="96" fill="#1b2140" stroke="${INK}" stroke-width="5"/>
    <circle cx="100" cy="100" r="96" fill="none" stroke="#3b4a7c" stroke-width="2"/>
    ${s}
    <circle cx="100" cy="100" r="42" fill="url(#vt-steel)" stroke="${INK}" stroke-width="4"/>
    ${grip}
    <circle cx="100" cy="100" r="22" fill="url(#vt-steel2)" stroke="${INK}" stroke-width="3"/>
    <circle cx="92" cy="92" r="6" fill="#fff" opacity=".5"/>
  </svg>`
}

export function crackTheVault(g: Game) {
  const m = openMoment('mo-vault')
  const day = nycDay()
  const code = combo(day)
  const known = save.stats['vault:day'] === day // you opened it today: the windows remember

  // ----- the door, close up -----
  const front = el('div', 'vt-front')
  front.innerHTML = `<div class="vt-wall"><i class="vt-lamp"></i></div>
    <div class="vt-frame">
      <div class="vt-hole"><i></i><i></i><i></i></div>
      <div class="vt-door">${doorSvg()}
        <div class="vt-wins">${code.map((n) => `<b class="${known ? 'ghost' : ''}"><u></u><span>${known ? n : ''}</span></b>`).join('')}</div>
        <div class="vt-heat"></div>
        <div class="vt-dial" role="slider" aria-label="Vault dial" aria-valuemin="0" aria-valuemax="${N - 1}" aria-valuenow="0" tabindex="0">${dialSvg()}</div>
      </div>
      <i class="vt-hinge a"></i><i class="vt-hinge b"></i>
    </div>`
  m.root.append(front)
  const x = closeX(m)
  x.classList.add('vt-x')
  m.root.append(x)
  // the wall around the door is "away": click it to walk off
  front.querySelector<HTMLElement>('.vt-wall')!.onpointerdown = () => m.close()

  const door = front.querySelector<HTMLElement>('.vt-door')!
  const dial = front.querySelector<HTMLElement>('.vt-dial')!
  const heat = front.querySelector<HTMLElement>('.vt-heat')!
  const wins = [...front.querySelectorAll<HTMLElement>('.vt-wins b')]
  const tip = hint(m, 'Turn the dial', [CX, CY - DIAL_R - 62])

  let pos = 0 // where the dial sits, in numbers (a float while you turn it)
  let at = 0 // the number under the red mark
  let stage = 0 // which tumbler you're on
  let dwell = 0
  let grab: number | null = null // the pointer's last angle while dragging
  let started = 0
  let opened = false
  let lastTick = 0
  wins[0].classList.add('now')

  const angle = (p: Pt) => (Math.atan2(p[1] - CY, p[0] - CX) * 180) / Math.PI
  const turn = (by: number) => {
    if (opened) return
    if (!started) started = performance.now()
    if (tip.isConnected) tip.remove()
    pos = (((pos + by) % N) + N) % N
    dial.style.transform = `rotate(${-pos * STEP}deg)`
    const n = Math.round(pos) % N
    if (n === at) return
    at = n
    dwell = 0
    dial.setAttribute('aria-valuenow', String(at))
    const now = performance.now()
    if (at === code[stage]) {
      sfx.pop()
      dial.classList.remove('vt-nudge')
      void dial.offsetWidth
      dial.classList.add('vt-nudge')
    } else if (now - lastTick > 45) {
      lastTick = now
      sfx.tick()
    }
  }
  dial.onpointerdown = (e) => {
    if (opened) return
    grab = angle(pointer(e))
    dial.setPointerCapture(e.pointerId)
    dial.classList.add('held')
  }
  dial.onpointermove = (e) => {
    if (grab === null) return
    const a = angle(pointer(e))
    let d = a - grab
    if (d > 180) d -= 360
    if (d < -180) d += 360
    grab = a
    turn(-d / STEP)
  }
  dial.onpointerup = dial.onpointercancel = () => {
    grab = null
    dial.classList.remove('held')
    // settle on the nearest number
    turn(Math.round(pos) - pos)
  }
  m.onKey((e) => {
    if (opened) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') turn(Math.round(pos) - pos - 1)
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') turn(Math.round(pos) - pos + 1)
    else return
    return true
  })

  m.frame((dt) => {
    if (opened) return
    const d = circ(at, code[stage])
    const on = d === 0
    heat.style.setProperty('--heat', String(Math.max(0, 1 - d / 7)))
    heat.classList.toggle('on', on)
    const fill = wins[stage].querySelector<HTMLElement>('u')!
    if (!on) {
      dwell = 0
      fill.style.width = '0'
      return
    }
    // rest on the number and the tumbler drops
    dwell += dt
    fill.style.width = `${Math.min(1, dwell / 0.42) * 100}%`
    if (dwell >= 0.42) drop()
  })

  function drop() {
    const w = wins[stage]
    w.classList.remove('now', 'ghost')
    w.classList.add('set')
    w.querySelector('span')!.textContent = String(code[stage])
    sfx.ding()
    sparks(m, [CX + (stage - 1) * 58, CY - 134], 5, '#8dffb0')
    door.classList.remove('vt-thunk')
    void door.offsetWidth
    door.classList.add('vt-thunk')
    stage++
    dwell = 0
    if (stage < 3) return void wins[stage].classList.add('now')
    open()
  }

  function open() {
    opened = true
    stage = 2
    const secs = (performance.now() - started) / 1000
    heat.classList.remove('on')
    heat.style.setProperty('--heat', '0')
    dial.classList.add('spin')
    save.stats['vault:day'] = day
    persist()
    m.later(() => {
      sfx.register()
      front.classList.add('open')
    }, 520)
    m.later(() => {
      sfx.whoosh()
      front.classList.add('in')
      inside()
      g.stamp('vault-cracked')
      if (secs < 6) g.stamp('vault-speed')
    }, 1750)
    m.later(() => front.remove(), 2600)
  }

  // ----- inside: the grail room -----
  function inside() {
    // the archive's three and, on the gold plinth, today's Drop
    const drop = dropOf()
    const show = [GRAILS[0], GRAILS[1], drop, GRAILS[2]]
    const room = el('div', 'vt-room')
    room.innerHTML = `<div class="vt-shelves"></div><div class="vt-floor"></div>
      <div class="vt-mirror"><i class="vt-glass"></i><div class="vt-me">${mirrorSvg(null)}</div></div>`
    const mirror = room.querySelector<HTMLElement>('.vt-mirror')!
    const me = room.querySelector<HTMLElement>('.vt-me')!
    const peds: HTMLButtonElement[] = []
    let tried = save.stats['vault:tried'] ?? 0
    let tipIn: HTMLElement | null = null
    let look = 0
    const tryOn = (i: number) => {
      const gr = show[i]
      const p = peds[i]
      tipIn?.remove()
      peds.forEach((q) => q.classList.remove('picked'))
      p.classList.add('picked')
      sfx.pop()
      mirror.style.setProperty('--glow', gr.glow)
      mirror.classList.remove('flash')
      void mirror.offsetWidth
      mirror.classList.add('flash')
      m.later(() => {
        me.innerHTML = mirrorSvg(gr)
        me.classList.add('feet')
        sfx.chime()
        sparks(m, [822, 470], 8, gr.glow)
      }, 260)
      const n = ++look
      m.later(() => n === look && me.classList.remove('feet'), 2100)
      tried |= 1 << GRAILS.indexOf(gr)
      if (tried !== save.stats['vault:tried']) {
        save.stats['vault:tried'] = tried
        persist()
      }
      if (tried === (1 << GRAILS.length) - 1) {
        g.stamp('grail-fit')
        g.confetti(24)
      }
    }

    // ----- the spotlight: one pair up close, turning under your hand -----
    let spot: HTMLElement | null = null
    const closeSpot = () => {
      if (!spot) return
      const s = spot
      spot = null
      s.classList.add('out')
      m.later(() => s.remove(), 260)
    }
    const spotlight = (i: number) => {
      const gr = show[i]
      const isDrop = gr === drop
      const item = grailItemId(gr)
      tipIn?.remove()
      spot?.remove()
      sfx.whoosh()
      const s = el('div', 'vt-spot')
      s.style.setProperty('--glow', gr.glow)
      s.innerHTML = `<div class="vt-stage"><i class="vt-rays"></i><i class="vt-plinth"></i>
          <div class="vt-float"><div class="vt-turn"><img class="vt-big" src="${grailArt(gr)}" alt="" draggable="false"></div></div>
          <img class="vt-reflect" src="${grailArt(gr)}" alt="" draggable="false"></div>
        <div class="vt-info">
          <div class="vt-mark">${MARK}<span>${gr.line.toUpperCase()}</span>${gr.collab ? `<i>×</i><span class="collab">“${gr.collab}”</span>` : ''}</div>
          <h2>“${gr.nick}”</h2>
          <div class="vt-tags">${
            isDrop
              ? `<span class="vt-tag price"><img src="/art/icons/coin.png" alt="">${gr.price.toLocaleString('en-US')}</span><span class="vt-tag clock"><img src="/art/icons/e/hourglass.png" alt=""><b></b></span>`
              : '<span class="vt-tag lock"><img src="/art/icons/e/lock.png" alt="">Vault Only</span>'
          }</div>
          <div class="vt-acts"></div>
        </div>`
      const back = el('button', 'vt-back', '<svg viewBox="0 0 20 20"><path d="M12 4 L6 10 L12 16" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>') as HTMLButtonElement
      back.setAttribute('aria-label', 'Back to the vault')
      back.onclick = closeSpot
      s.append(back)
      // the pair turns toward your pointer, catching more light as it faces you
      const stage = s.querySelector<HTMLElement>('.vt-stage')!
      const turn = s.querySelector<HTMLElement>('.vt-turn')!
      stage.onpointermove = (e) => {
        const r = stage.getBoundingClientRect()
        const dx = (e.clientX - r.left) / r.width - 0.5
        const dy = (e.clientY - r.top) / r.height - 0.5
        turn.style.transform = `rotateY(${dx * 34}deg) rotateX(${-dy * 18}deg)`
        turn.style.setProperty('--lit', String(1.08 - Math.abs(dx) * 0.16))
      }
      stage.onpointerleave = () => (turn.style.transform = '')
      // today's drop is gone at midnight, New York time
      const left = s.querySelector<HTMLElement>('.vt-tag.clock b')
      const tick = () => {
        if (!left) return
        const min = minutesToMidnight()
        left.textContent = min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m left` : `${min}m left`
      }
      tick()
      const timer = window.setInterval(tick, 30_000)
      m.onClose(() => clearInterval(timer))
      const acts = s.querySelector<HTMLElement>('.vt-acts')!
      const paint = () => {
        acts.innerHTML = ''
        const owned = g.owns(item)
        const tryBtn = el('button', 'btn ghost', 'Try On') as HTMLButtonElement
        tryBtn.onclick = () => {
          closeSpot()
          m.later(() => tryOn(i), 200)
        }
        acts.append(tryBtn)
        if (!isDrop) return
        if (owned) {
          const wearing = save.look.items.feet === item
          const w = el('button', 'btn go', wearing ? 'Wearing' : 'Wear') as HTMLButtonElement
          w.disabled = wearing
          w.onclick = () => {
            g.wear(item)
            sfx.chime()
            paint()
          }
          acts.append(w)
          return
        }
        const cop = el('button', 'btn go', `Cop It<span class="vt-cost"><img src="/art/icons/coin.png" alt="">${gr.price.toLocaleString('en-US')}</span>`) as HTMLButtonElement
        cop.onclick = async () => {
          // short: say how short, right here (your New Yorker's "out of coins" line is behind the vault)
          if (save.coins < gr.price) {
            sfx.squawk()
            cop.classList.remove('vt-shake')
            void cop.offsetWidth
            cop.classList.add('vt-shake')
            s.querySelector('.vt-need')?.remove()
            s.querySelector('.vt-tags')!.insertAdjacentHTML('beforeend', `<span class="vt-tag vt-need"><img src="/art/icons/coin.png" alt="">Need ${(gr.price - save.coins).toLocaleString('en-US')} more</span>`)
            return
          }
          cop.disabled = true
          if (await g.buy(item)) {
            sfx.coin()
            g.confetti(40)
            sparks(m, [300, 300], 12, gr.glow)
            s.classList.add('copped')
          }
          paint()
        }
        acts.append(cop)
      }
      paint()
      spot = s
      m.root.insertBefore(s, x)
    }

    show.forEach((gr, i) => {
      const daily = gr === drop
      const p = el('button', 'vt-ped' + (daily ? ' daily' : ''), `<i class="vt-cone"></i><span class="vt-shoe"><img src="${grailArt(gr)}" alt="" draggable="false"></span><i class="vt-dome"></i><span class="vt-block">${daily ? '<b class="vt-drop">DROP</b>' : ''}<em>${gr.nick}</em></span>`) as HTMLButtonElement
      p.type = 'button'
      p.style.left = `${118 + i * 160}px`
      p.style.setProperty('--glow', gr.glow)
      p.style.animationDelay = `${0.25 + i * 0.09}s`
      p.setAttribute('aria-label', gr.nick.replace('&amp;', 'and'))
      p.onclick = () => spotlight(i)
      peds.push(p)
      room.append(p)
    })
    m.root.insertBefore(room, x)
    m.later(() => {
      if (!spot && !peds.some((p) => p.classList.contains('picked'))) tipIn = hint(m, 'Pick a pair', [118 + 2 * 160, 196])
    }, 1100)
    m.onKey((e) => {
      if (e.key === 'Escape' && spot) {
        closeSpot()
        return true
      }
      const i = '1234'.indexOf(e.key)
      if (i < 0) return
      spotlight(i)
      return true
    })
  }
}

/** the brand's mark: two quick slanted stripes */
const MARK = '<svg class="vt-stripes" viewBox="0 0 26 14" aria-hidden="true"><path d="M3 12 L9 2 M12 12 L18 2" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>'
/** minutes left in today, New York time */
function minutesToMidnight(): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  return Math.max(1, 24 * 60 - (Number(p.hour) * 60 + Number(p.minute)))
}
