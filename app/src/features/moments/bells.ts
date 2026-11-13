import './bells.css'
import { sfx } from '../../audio'
import { el } from '../../engine/stage'
import { world } from '../../engine/world'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { clickAwayCloses, cutoutImg, hint, openMoment, shout, sparks } from './kit'

/**
 * St. Patrick's Cathedral, Fifth Avenue: ring the bells. Four bells swing down on a beam over the avenue, each with
 * its own rope. They play a short tune; you pull the ropes to ring it back. Four rounds, a note longer and a touch
 * quicker each time, and a new tune every visit. Three pigeons sit on the beam: a wrong bell scares one off, and
 * when the beam is empty the concert is over.
 */

const NOTES = [60, 64, 67, 72] // C E G C: any order sounds like a peal
const COLORS = ['#e5483b', '#ffd166', '#3cb371', '#2a7bd5']
const XS = [433, 537, 641, 745]
const SIZES = [80, 72, 64, 56]
const BEAM_Y = 44
const ROUNDS = 4
const HANDLE_Y = 262

const bellSvg = (i: number) => `<svg viewBox="0 0 80 96"><defs><linearGradient id="be-g${i}" x1="0" x2="1"><stop offset="0" stop-color="#b8791c"/><stop offset="0.35" stop-color="#ffe08a"/><stop offset="0.7" stop-color="#e0a52c"/><stop offset="1" stop-color="#9a6212"/></linearGradient></defs>
<rect x="33" y="0" width="14" height="14" rx="3" fill="#7d8597" stroke="#1d2140" stroke-width="3"/>
<circle cx="40" cy="84" r="8" fill="#6b4a12" stroke="#1d2140" stroke-width="3"/>
<path d="M40 10 C22 10 19 30 17 50 C15 62 8 68 5 76 H75 C72 68 65 62 63 50 C61 30 58 10 40 10 Z" fill="url(#be-g${i})" stroke="#1d2140" stroke-width="3.5" stroke-linejoin="round"/>
<path d="M16 56 Q40 64 64 56" fill="none" stroke="${COLORS[i]}" stroke-width="7"/><path d="M16 56 Q40 64 64 56" fill="none" stroke="#1d2140" stroke-width="2" transform="translate(0 -4.5)"/><path d="M15 56 Q40 64 65 56" fill="none" stroke="#1d2140" stroke-width="2" transform="translate(0 4.5)"/>
<path d="M27 22 C24 30 23 38 22 46" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.75"/></svg>`
const PIGEON = `<svg viewBox="0 0 40 34"><path d="M8 20 C8 10 16 6 24 8 C26 3 34 3 34 10 L39 12 L34 14 C34 24 26 29 18 28 L6 30 Z" fill="#9aa3b5" stroke="#1d2140" stroke-width="3" stroke-linejoin="round"/><path d="M12 19 C16 15 22 15 25 19 C22 24 16 25 12 19 Z" fill="#6f7a90" stroke="#1d2140" stroke-width="2.5" stroke-linejoin="round"/><circle cx="30" cy="9" r="2" fill="#1d2140"/><path d="M18 28 V33 M23 27 V33" stroke="#e5483b" stroke-width="2.5" stroke-linecap="round"/></svg>`

export function ringTheBells(g: Game) {
  const church = cutoutImg('cathedral')
  const cr = world.geo?.cutouts.cathedral?.rect
  const m = openMoment('mo-bells')
  clickAwayCloses(m)

  const rig = el('div', 'be-rig')
  const beam = el('div', 'be-beam')
  beam.style.cssText = `left:${XS[0] - 66}px;top:${BEAM_Y}px;width:${XS[3] - XS[0] + 132}px`
  rig.append(beam)
  const studs = XS.map((x) => {
    const s = el('i', 'be-stud')
    s.style.left = `${x - (XS[0] - 66)}px`
    beam.append(s)
    return s
  })
  const birds = [0, 1, 2].map((k) => {
    const b = el('i', 'be-bird', PIGEON)
    b.style.cssText = `left:${(XS[k] + XS[k + 1]) / 2}px;top:${BEAM_Y}px;animation-delay:${-k * 0.7}s`
    rig.append(b)
    return b
  })
  const cols = XS.map((x, i) => {
    const w = SIZES[i]
    const bellH = w * 1.2
    const col = el('div', 'be-col')
    col.style.cssText = `left:${x}px;top:${BEAM_Y + 16}px;height:${HANDLE_Y + 62 - BEAM_Y - 16}px;--c:${COLORS[i]}`
    const bell = el('div', 'be-bell', bellSvg(i))
    bell.style.cssText = `width:${w}px;height:${bellH}px;margin-left:${-w / 2}px`
    const rope = el('div', 'be-rope', '<i></i><b></b>')
    rope.style.cssText = `top:${bellH - 8}px;height:${HANDLE_Y - BEAM_Y - 16 - bellH + 8 + 54}px`
    col.append(rope, bell)
    col.onpointerdown = (e) => {
      e.stopPropagation()
      pull(i)
    }
    rig.append(col)
    return { col, bell, at: [x, BEAM_Y + 16 + bellH * 0.6] as Pt }
  })
  m.root.append(el('div', 'be-veil'), rig)

  const rand = () => Math.floor(Math.random() * 4)
  const seq: number[] = []
  while (seq.length < 3) {
    const n = rand()
    // never the same bell three times running: that is not a tune
    if (seq.length >= 1 && seq[seq.length - 1] === n) continue
    seq.push(n)
  }
  let phase: 'watch' | 'play' | 'wait' = 'wait'
  let idx = 0
  let round = 0
  let lives = birds.length
  let tip: HTMLElement | null = null
  let hinted = false

  const again = (n: HTMLElement, cls: string) => {
    n.classList.remove(cls)
    void n.offsetWidth
    n.classList.add(cls)
  }

  function ring(i: number, pulled: boolean) {
    const c = cols[i]
    sfx.piano(NOTES[i])
    again(c.bell, 'ring')
    if (pulled) again(c.col, 'pull')
    const note = el('i', 'be-note', i % 2 ? '♪' : '♫')
    note.style.cssText = `left:${c.at[0] + (Math.random() - 0.5) * 30}px;top:${c.at[1] - 20}px;color:${COLORS[i]}`
    m.root.append(note)
    setTimeout(() => note.remove(), 900)
    if (church) again(church, 'be-toll')
  }

  function demo() {
    phase = 'watch'
    rig.classList.add('watch')
    const gap = 580 - round * 45
    seq.forEach((b, k) => m.later(() => ring(b, false), 450 + k * gap))
    m.later(() => {
      phase = 'play'
      idx = 0
      rig.classList.remove('watch')
      if (!hinted) {
        hinted = true
        tip = hint(m, 'Ring it back!', [(XS[1] + XS[2]) / 2, HANDLE_Y - 8])
      }
    }, 450 + seq.length * gap + 80)
  }

  function pull(i: number) {
    if (phase !== 'play') return
    tip?.remove()
    ring(i, true)
    if (i !== seq[idx]) return miss(i)
    idx++
    sparks(m, cols[i].at, 4)
    if (idx === seq.length) done()
  }

  function miss(i: number) {
    phase = 'wait'
    lives--
    const b = birds[lives]
    b.classList.add('off')
    m.later(() => sfx.coo(), 120)
    cols[i].bell.classList.add('sour')
    m.later(() => cols[i].bell.classList.remove('sour'), 600)
    if (lives > 0) return m.later(demo, 1300)
    m.later(() => {
      sfx.squawk()
      shout(m, 'CLONK', [(XS[1] + XS[2]) / 2, 200], 'bad')
      rig.classList.add('watch')
      g.say('Even the pigeons walked out.')
    }, 500)
    m.later(() => m.close(), 2400)
  }

  function done() {
    phase = 'wait'
    studs[round].classList.add('on')
    round++
    g.stamp('bell-ringer')
    if (round < ROUNDS) {
      sfx.ding()
      seq.push(rand())
      return m.later(demo, 1100)
    }
    // the full peal: every bell, the cathedral shaking, the avenue covered in confetti
    rig.classList.add('peal')
    const run = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 3, 3]
    run.forEach((b, k) => m.later(() => ring(b, true), 250 + k * 150))
    m.later(() => {
      shout(m, 'BRAVO!', [(XS[1] + XS[2]) / 2, 200], 'gold')
      g.confetti(44)
      g.emote('cheer', 2.5)
      if (cr) sparks(m, [cr[0] + cr[2] / 2, cr[1] + 70], 12)
      g.stamp('carillon')
      if (lives === birds.length) g.stamp('pigeon-whisperer')
    }, 500)
    m.later(() => m.close(), 3600)
  }

  // 1 to 4 pull the ropes, left to right
  m.onKey((e) => {
    const n = Number(e.key)
    if (!(n >= 1 && n <= 4)) return
    pull(n - 1)
    return true
  })
  m.onClose(() => church?.classList.remove('be-toll'))
  m.later(demo, 750)
}
