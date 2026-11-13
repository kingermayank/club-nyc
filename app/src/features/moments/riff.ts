import './riff.css'
import { sfx } from '../../audio'
import { el } from '../../engine/stage'
import { world } from '../../engine/world'
import { save, persist } from '../../state'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { clickAwayCloses, hint, openMoment, pointer, shout, sparks } from './kit'

/**
 * The busker's guitar case, Times Sq-42 St: tip a coin and the guitar comes up out of the case. It plays a riff
 * (the strings light up one by one, each the colour of a subway line), you pluck it back. Four riffs, each a note
 * longer; one sour note and the set is over. Keys 1 to 6 pluck too.
 */

const LINES = ['#e5483b', '#ffd166', '#3cb371', '#2a7bd5', '#ff8a3c', '#b05ad6']
const NOTES = [52, 57, 62, 67, 71, 76] // E A D G B E
const ROUNDS = [3, 4, 5, 6]
const TILT = -13 // degrees
const SIZE = 0.85
// the guitar in its own flat coordinates: strings run from the bridge to the nut
const X0 = 70
const X1 = 392
const GAP = 15
const stringY = (i: number) => (i - 2.5) * GAP

export function playTheRiff(g: Game) {
  const c = world.geo?.cutouts['guitar-case']
  if (!c) return
  // the old case took a coin for the music; so does this
  if (!g.spend(1, 'busker-tip')) return
  const [cx, cy, cw, ch] = c.rect
  const caseAt: Pt = [cx + cw * 0.5, cy + ch * 0.62]
  const origin: Pt = [cx + 34, cy - 44] // middle of the guitar's body

  const m = openMoment('mo-riff')
  clickAwayCloses(m)

  const tipCoin = el('i', 'rf-coin')
  tipCoin.style.cssText = `left:${caseAt[0]}px;top:${caseAt[1]}px;--fx:${world.player.pos[0] - caseAt[0]}px;--fy:${world.player.pos[1] - 70 - caseAt[1]}px`
  m.root.append(tipCoin)
  setTimeout(() => tipCoin.remove(), 700)
  m.later(() => sfx.coin(), 420)

  const guitar = el('div', 'rf-guitar', `<svg viewBox="-90 -90 560 180"><path class="rf-neck" d="M120 -46 H400 V46 H120Z"/><path class="rf-head" d="M400 -50 H452 Q466 -50 466 -36 V36 Q466 50 452 50 H400Z"/><path class="rf-body" d="M-78 0 C-78 -58 -40 -80 0 -72 C24 -66 40 -58 62 -58 C100 -58 128 -40 128 0 C128 40 100 58 62 58 C40 58 24 66 0 72 C-40 80 -78 58 -78 0Z"/><circle class="rf-hole" cx="52" cy="0" r="30"/><path class="rf-bridge" d="M-34 -48 H-22 V48 H-34Z"/>${[190, 250, 310, 360].map((x) => `<path class="rf-fret" d="M${x} -46 V46"/>`).join('')}</svg>`)
  guitar.style.cssText = `left:${origin[0]}px;top:${origin[1]}px;transform:rotate(${TILT}deg) scale(${SIZE})`
  const strings = LINES.map((col, i) => {
    const s = el('i', 'rf-string')
    s.style.cssText = `left:${X0 - 98}px;width:${X1 - X0 + 98}px;top:${stringY(i)}px;--c:${col}`
    const peg = el('b', 'rf-peg')
    peg.style.cssText = `left:${418 + (i % 2) * 22}px;top:${stringY(i)}px;--c:${col}`
    guitar.append(s, peg)
    return s
  })
  // the riff as dots on the body: hollow until you've played them
  const dots = el('div', 'rf-dots')
  guitar.append(dots)
  const pad = el('div', 'rf-pad')
  guitar.append(pad)
  m.root.append(guitar)
  const rad = (TILT * Math.PI) / 180
  const toStageAt = (x: number, y: number): Pt => [origin[0] + (x * Math.cos(rad) - y * Math.sin(rad)) * SIZE, origin[1] + (x * Math.sin(rad) + y * Math.cos(rad)) * SIZE]
  const tip = hint(m, 'Play it back!', toStageAt(230, -62))

  let round = 0
  let riff: number[] = []
  let at = 0
  let listening = false
  let over = false

  function twang(i: number, lit = false) {
    const s = strings[i]
    s.classList.remove('twang', 'lit')
    void s.offsetWidth
    s.classList.add('twang')
    if (lit) s.classList.add('lit')
    sfx.piano(NOTES[i])
    setTimeout(() => s.classList.remove('lit'), 330)
  }

  function start(r: number) {
    round = r
    listening = false
    at = 0
    guitar.classList.remove('yours')
    riff = []
    for (let k = 0; k < ROUNDS[r]; k++) {
      let n = Math.floor(Math.random() * 6)
      if (n === riff[k - 1]) n = (n + 1 + Math.floor(Math.random() * 4)) % 6
      riff.push(n)
    }
    dots.innerHTML = riff.map(() => '<i></i>').join('')
    const beat = 520 - r * 40
    riff.forEach((n, k) => m.later(() => twang(n, true), 500 + k * beat))
    m.later(() => {
      listening = true
      guitar.classList.add('yours')
    }, 500 + riff.length * beat)
  }

  function pluck(i: number) {
    if (!listening || over) return
    tip.remove()
    const want = riff[at]
    if (i !== want) return sour(i)
    twang(i)
    dots.children[at]?.classList.add('on')
    dots.children[at]?.setAttribute('style', `--c:${LINES[i]}`)
    note(toStageAt(110 + Math.random() * 240, stringY(i) - 10), LINES[i])
    at++
    if (at < riff.length) return
    listening = false
    guitar.classList.remove('yours')
    g.stamp('busker-riff')
    if (round + 1 > (save.stats['riff:best'] ?? 0)) {
      save.stats['riff:best'] = round + 1
      persist()
    }
    if (round + 1 < ROUNDS.length) {
      m.later(() => sfx.chime(), 250)
      sparks(m, toStageAt(52, 0), 8)
      m.later(() => start(round + 1), 1000)
    } else encore()
  }

  function sour(i: number) {
    listening = false
    over = true
    guitar.classList.remove('yours')
    guitar.classList.add('sour')
    strings[i].classList.add('twang')
    sfx.squawk()
    shout(m, 'TWANG', toStageAt(230, -40), 'bad')
    g.say(round === 0 && at === 0 ? 'Tough crowd. It was one note.' : 'A pigeon just covered its ears.')
    if (round === 0 && at === 0) g.stamp('tough-crowd')
    // dust yourself off: a new set from the top
    m.later(() => {
      over = false
      guitar.classList.remove('sour')
      start(0)
    }, 1900)
  }

  function encore() {
    over = true
    sfx.chime()
    shout(m, 'ENCORE!', toStageAt(230, -40), 'gold')
    g.confetti(36)
    g.emote('cheer', 3)
    g.say('Showtime. Next stop, Carnegie Hall.')
    g.stamp('encore')
    // the platform tips: coins rain into the case (for show, the busker keeps them)
    for (let k = 0; k < 7; k++) {
      m.later(() => {
        const coin = el('i', 'rf-coin')
        coin.style.cssText = `left:${caseAt[0] + (Math.random() - 0.5) * 50}px;top:${caseAt[1]}px;--fx:${(Math.random() - 0.3) * 520}px;--fy:${60 + Math.random() * 160}px`
        m.root.append(coin)
        setTimeout(() => coin.remove(), 700)
        m.later(() => sfx.coin(), 420)
      }, 300 + k * 170)
    }
    riff.forEach((n, k) => m.later(() => twang(n, true), 400 + k * 150))
    m.later(() => {
      over = false
      start(0)
    }, 3600)
  }

  /** a music note floating up off a string */
  function note(p: Pt, col: string) {
    const n = el('i', 'rf-note')
    n.style.cssText = `left:${p[0]}px;top:${p[1]}px;--c:${col}`
    m.root.append(n)
    setTimeout(() => n.remove(), 900)
  }

  // which string is under the pointer: turn the click back into the guitar's flat coordinates
  pad.onpointerdown = (e) => {
    e.stopPropagation()
    const p = pointer(e)
    const dx = p[0] - origin[0]
    const dy = p[1] - origin[1]
    const ly = -dx * Math.sin(rad) + dy * Math.cos(rad)
    const i = Math.max(0, Math.min(5, Math.round(ly / (GAP * SIZE) + 2.5)))
    pluck(i)
  }
  m.onKey((e) => {
    const i = '123456'.indexOf(e.key)
    if (i < 0) return
    if (!e.repeat) pluck(i)
    return true
  })

  m.later(() => start(0), 650)
}
