import './squirrel.css'
import { sfx } from '../../audio'
import { el } from '../../engine/stage'
import { world } from '../../engine/world'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { closeX, hint, openMoment, pick, pointer, shout, sparks } from './kit'

/**
 * The Squirrel, Central Park: hold the mouse down to hold a pretzel out where the pointer is; let go and it's back
 * against your chest. A squirrel hops over and takes a nibble at a time (the pretzel really loses the bite). Now and
 * then it goes for the whole thing: it crouches with a "!" and then dashes. Let go in time and it skids past; too
 * slow and it's up a tree with your pretzel. It also bluffs (a crouch with no "!"). Five nibbles and you're friends.
 * Space is the same hold.
 */

const BITES = 5
const REACH = 96
const PRETZEL = `<svg viewBox="0 0 44 44"><defs><mask id="sq-bites"><rect width="44" height="44" fill="#fff"/></mask></defs><g mask="url(#sq-bites)">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22 38 C2 32 2 9 14 8 C26 7 27 22 20 31 M22 38 C42 32 42 9 30 8 C18 7 17 22 24 31" stroke="#1d2140" stroke-width="10.5"/><path d="M22 38 C2 32 2 9 14 8 C26 7 27 22 20 31 M22 38 C42 32 42 9 30 8 C18 7 17 22 24 31" stroke="#c9792e" stroke-width="5.5"/></g>
  <g fill="#fff"><circle cx="8" cy="20" r="1.4"/><circle cx="36" cy="20" r="1.4"/><circle cx="22" cy="37" r="1.4"/><circle cx="14" cy="9" r="1.3"/><circle cx="30" cy="9" r="1.3"/><circle cx="22" cy="20" r="1.3"/></g></g></svg>`
/** where each nibble comes out of the pretzel */
const HOLES: [number, number, number][] = [[4, 30, 10], [40, 12, 11], [8, 8, 11], [38, 32, 11], [22, 20, 10]]

type Mode = 'in' | 'idle' | 'hop' | 'nibble' | 'tell' | 'bluff' | 'dash' | 'skid' | 'away' | 'full'

export function feedTheSquirrel(g: Game) {
  if (world.room.id !== 'central-park') return
  const pp = world.player.pos
  const hand: Pt = [pp[0], pp[1] - 38]
  const fromRight = pp[0] < 560
  const m = openMoment('mo-squirrel')

  const sq = el('div', 'sq-squirrel', '<img src="/art/cutouts/central-park/squirrel-2.png" alt="" draggable="false"><b>!</b>')
  const snack = el('div', 'sq-snack', PRETZEL)
  const mask = snack.querySelector('mask')!
  const x = closeX(m)
  x.classList.add('sq-x')
  x.style.cssText = `left:${Math.min(940, Math.max(40, pp[0] + (fromRight ? -70 : 70)))}px;top:${Math.min(470, pp[1] - 34)}px`
  m.root.append(sq, snack, x)
  const tip = hint(m, 'Hold it out!', [pp[0] + (fromRight ? 70 : -70), pp[1] - 78])

  let out = false // the pretzel is held out
  let aim: Pt = [hand[0] + (fromRight ? 70 : -70), pp[1] - 8]
  let sn: Pt = [...hand] as Pt // where the pretzel is drawn
  let s: Pt = [fromRight ? 1040 : -40, Math.min(470, Math.max(320, pp[1] + 6))]
  let face = fromRight ? -1 : 1
  let mode: Mode = 'in'
  let clock = 0 // seconds left in this mode
  let hopFrom: Pt = s
  let hopTo: Pt = s
  let dashDir: Pt = [0, 0]
  let bites = 0
  let flinches = 0
  let dodges = 0
  let grabs = 0 // times it has gone for the lot
  let sinceGrab = 0 // nibbles since it last went for the lot
  let over = false

  const clampAim = (p: Pt): Pt => {
    const dx = p[0] - hand[0]
    const dy = p[1] - hand[1]
    const d = Math.hypot(dx, dy)
    const k = d > REACH ? REACH / d : 1
    return [hand[0] + dx * k, Math.min(pp[1] + 14, hand[1] + dy * k)]
  }
  const set = (mo: Mode, secs: number) => {
    mode = mo
    clock = secs
    sq.dataset.mode = mo
  }
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])
  /** the spot on the grass from which it can reach the pretzel */
  const spot = (): Pt => [sn[0] + (s[0] > sn[0] ? 20 : -20), Math.min(480, sn[1] + 16)]

  function hopTowards(to: Pt, len: number) {
    const d = dist(s, to)
    const k = Math.min(1, len / Math.max(1, d))
    hopFrom = s
    hopTo = [s[0] + (to[0] - s[0]) * k, s[1] + (to[1] - s[1]) * k]
    if (Math.abs(to[0] - s[0]) > 3) face = to[0] > s[0] ? 1 : -1
    set('hop', 0.22)
  }

  function hold(on: boolean) {
    if (over || on === out) return
    out = on
    if (on) tip.remove()
    else if (mode === 'bluff' || mode === 'hop' || mode === 'nibble' || mode === 'idle') {
      // pulled it away when nothing was coming: it backs off, a little hurt
      if (dist(s, sn) < 90 && mode !== 'idle') flinches++
      if (dist(s, sn) < 70) hopTowards([s[0] + (s[0] > hand[0] ? 60 : -60), s[1]], 46)
    }
  }

  function nibbled() {
    bites++
    sinceGrab++
    const [hx, hy, r] = HOLES[bites - 1]
    const hole = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    hole.setAttribute('cx', String(hx))
    hole.setAttribute('cy', String(hy))
    hole.setAttribute('r', String(r))
    hole.setAttribute('fill', '#000')
    mask.append(hole)
    sfx.pop()
    sparks(m, sn, 5, '#e9b872')
    if (bites >= BITES) return friends()
    hopTowards([s[0] + (s[0] > sn[0] ? 50 : -50), s[1] + 4], 34)
  }

  function friends() {
    over = true
    out = false
    snack.classList.add('gone')
    set('full', 9)
    sfx.chime()
    g.confetti(30)
    for (let i = 0; i < 4; i++) m.later(() => heart([s[0] + (Math.random() - 0.5) * 26, s[1] - 40]), i * 220)
    g.stamp('squirrel-friend')
    if (!flinches) g.stamp('steady-hand')
    g.say(pick(['We’re friends now. It has my address.', 'It ate five bites. I got zero.']))
    m.later(() => m.close(), 3000)
  }

  function robbed() {
    over = true
    snack.classList.add('taken')
    sq.append(snack)
    snack.style.transform = ''
    sfx.squawk()
    shout(m, 'ROBBED!', [sn[0], sn[1] - 44], 'bad')
    g.stamp('park-mugging')
    g.say(pick(['Mugged by a squirrel. Classic Tuesday.', 'It didn’t even say thanks.']))
    face = fromRight ? 1 : -1
    set('away', 3)
    m.later(() => m.close(), 2200)
  }

  function heart(at: Pt) {
    const h = el('i', 'sq-heart', '<svg viewBox="0 0 20 18"><path d="M10 16 C2 10 1 6 3 3.5 C5 1 8.5 2 10 5 C11.500 2 15 1 17 3.500 C19 6 18 10 10 16 Z" fill="#ff6f91" stroke="#1d2140" stroke-width="2" stroke-linejoin="round"/></svg>')
    h.style.cssText = `left:${at[0]}px;top:${at[1]}px`
    m.root.append(h)
    setTimeout(() => h.remove(), 1100)
  }

  m.frame((dt, t) => {
    // the pretzel eases to where it's held (or back to your chest)
    const want = out ? aim : hand
    const e = 1 - Math.exp(-(out ? 16 : 26) * dt)
    if (!over || mode === 'full') sn = [sn[0] + (want[0] - sn[0]) * e, sn[1] + (want[1] - sn[1]) * e]
    const safe = !out || dist(sn, hand) < 26

    clock -= dt
    let lift = 0
    if (mode === 'in') {
      // scampers in from the bushes
      const home: Pt = [hand[0] + (fromRight ? 170 : -170), s[1]]
      s = [s[0] + Math.sign(home[0] - s[0]) * 260 * dt, s[1]]
      lift = Math.abs(Math.sin(t * 16)) * 9
      if (Math.abs(home[0] - s[0]) < 8) set('idle', 0.5)
    } else if (mode === 'hop') {
      const k = 1 - Math.max(0, clock) / 0.22
      s = [hopFrom[0] + (hopTo[0] - hopFrom[0]) * k, hopFrom[1] + (hopTo[1] - hopFrom[1]) * k]
      lift = Math.sin(k * Math.PI) * 12
      if (clock <= 0) set('idle', 0.22 + Math.random() * 0.4)
    } else if (mode === 'idle') {
      if (clock <= 0) {
        const to = spot()
        const d = dist(s, to)
        if (safe) {
          // nothing on offer: it keeps its distance and watches
          if (d < 110) hopTowards([s[0] + (s[0] > hand[0] ? 60 : -60), s[1]], 30)
          else set('idle', 0.5)
        } else if (d < 9) set('nibble', 0.62)
        else if (d < 120 && sinceGrab >= 1 && (Math.random() < 0.3 + bites * 0.08 || (bites >= 2 && !grabs))) {
          face = sn[0] > s[0] ? 1 : -1
          // the real thing has a "!"; from the second bite on it also bluffs
          if (bites >= 2 && grabs && Math.random() < 0.34) set('bluff', 0.55)
          else {
            set('tell', Math.max(0.36, 0.6 - bites * 0.05))
            sfx.tick()
          }
        } else hopTowards(to, 26 + Math.random() * 14)
      }
    } else if (mode === 'nibble') {
      face = sn[0] > s[0] ? 1 : -1
      if (safe || dist(s, spot()) > 26) set('idle', 0.15)
      else if (clock <= 0) nibbled()
    } else if (mode === 'bluff') {
      if (clock <= 0) set('idle', 0.3)
    } else if (mode === 'tell') {
      if (clock <= 0) {
        const d = Math.max(1, dist(s, sn))
        dashDir = [(sn[0] - s[0]) / d, (sn[1] + 10 - s[1]) / d]
        sinceGrab = 0
        grabs++
        sfx.whoosh()
        set('dash', Math.min(0.5, d / 520 + 0.16))
      }
    } else if (mode === 'dash') {
      s = [s[0] + dashDir[0] * 520 * dt, s[1] + dashDir[1] * 520 * dt]
      lift = 6
      if (!safe && dist(s, [sn[0], sn[1] + 10]) < 24) robbed()
      else if (clock <= 0) {
        if (safe) {
          dodges++
          shout(m, 'HA!', [s[0], s[1] - 60])
          sfx.squawk()
        }
        set('skid', 0.8)
      }
    } else if (mode === 'skid') {
      s = [s[0] + dashDir[0] * 150 * Math.max(0, clock) * dt, s[1]]
      if (clock <= 0) set('idle', 0.4)
    } else if (mode === 'away') {
      s = [s[0] + face * 330 * dt, s[1] - 40 * dt]
      lift = Math.abs(Math.sin(t * 18)) * 10
    } else if (mode === 'full') {
      lift = Math.abs(Math.sin(t * 7)) * 8
    }
    s = [Math.max(mode === 'away' || mode === 'in' ? -80 : 30, Math.min(mode === 'away' || mode === 'in' ? 1080 : 970, s[0])), Math.max(300, Math.min(486, s[1]))]
    // the traced squirrel faces right
    sq.style.transform = `translate(${s[0]}px, ${s[1] - lift}px)`
    sq.style.setProperty('--face', String(face))
    sq.style.zIndex = String(s[1] > sn[1] + 16 ? 9 : 7)
    if (!snack.classList.contains('taken')) snack.style.transform = `translate(${sn[0]}px, ${sn[1]}px) rotate(${out ? Math.sin(t * 5) * 5 : 0}deg) scale(${out ? 1 : 0.62})`
    void dodges
  })

  m.root.addEventListener('pointerdown', (e) => {
    aim = clampAim(pointer(e))
    m.root.setPointerCapture(e.pointerId)
    hold(true)
  })
  m.root.addEventListener('pointermove', (e) => {
    aim = clampAim(pointer(e))
  })
  const up = () => hold(false)
  m.root.addEventListener('pointerup', up)
  m.root.addEventListener('pointercancel', up)
  m.onKey((e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    if (!e.repeat) hold(true)
    return true
  })
  const keyup = (e: KeyboardEvent) => (e.key === ' ' || e.key === 'Enter') && hold(false)
  window.addEventListener('keyup', keyup, true)
  m.onClose(() => window.removeEventListener('keyup', keyup, true))
}
