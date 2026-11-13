import './bikeBells.css'
import { audioCtx, sfx } from '../../audio'
import { el } from '../../engine/stage'
import { world } from '../../engine/world'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { clickAwayCloses, hint, openMoment, shout, sparks } from './kit'

/**
 * The Bike Rack, SoHo: four bells on a handlebar over the rack. The rack rings a little tune, you ring it back
 * (click the bells, or keys 1 to 4). Four tunes, each one note longer and a touch quicker, never the same twice.
 * After the encore the bells are yours to play. Lean on one bell long enough and the block lets you know.
 */

const NOTES = [72, 76, 79, 84] // C E G C: any order sounds like a tune
const LENGTHS = [3, 4, 5, 6]
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** a struck bike bell: a bright partial over the note, gone in under a second */
function ding(midi: number, vol = 0.16) {
  const a = audioCtx()
  if (!a) return
  const t = a.currentTime
  for (const [mult, v, dur] of [[1, vol, 0.9], [2.76, vol * 0.35, 0.45], [5.4, vol * 0.12, 0.2]] as const) {
    const o = a.createOscillator()
    const g = a.createGain()
    o.frequency.value = hz(midi) * mult
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(v, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(a.destination)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
}

export function ringTheBells(g: Game) {
  const c = world.geo?.cutouts.bikes
  if (!c) return
  const [bx, by, bw] = c.rect
  // the handlebar floats over the rack, kept inside the stage
  const cx = Math.min(Math.max(bx + bw / 2, 150), 850)
  const top = Math.max(110, by - 96)

  const m = openMoment('mo-bells')
  const bar = el('div', 'mbk-bar')
  bar.style.cssText = `left:${cx}px;top:${top}px`
  const pips = el('div', 'mbk-pips')
  const bells = NOTES.map((_, i) => {
    const b = el('button', `mbk-bell mbk-b${i}`, '<i class="mbk-dome"></i><i class="mbk-lever"></i>')
    b.setAttribute('aria-label', `Bell ${i + 1}`)
    b.onpointerdown = (e) => {
      e.stopPropagation()
      press(i)
    }
    bar.append(b)
    return b
  })
  bar.append(pips)
  m.root.append(bar)
  clickAwayCloses(m)
  const at = (i: number): Pt => [cx - 96 + i * 64, top - 4]

  let round = 0
  let seq: number[] = []
  let idx = 0
  let state: 'listen' | 'play' | 'wait' | 'free' = 'wait'
  let clean = true
  let tip: HTMLElement | null = null
  let tipShown = false
  let mashBell = -1
  let mash = 0
  let heard = false

  function ring(i: number, soft = false) {
    ding(NOTES[i], soft ? 0.07 : 0.16)
    const b = bells[i]
    b.classList.remove('ring')
    void b.offsetWidth
    b.classList.add('ring')
  }

  function drawPips(n: number, lit: number, cls = '') {
    pips.className = 'mbk-pips ' + cls
    pips.innerHTML = Array.from({ length: n }, (_, k) => `<i class="${k < lit ? 'on' : ''}"></i>`).join('')
  }

  function newTune() {
    seq = []
    while (seq.length < LENGTHS[round]) {
      const n = Math.floor(Math.random() * NOTES.length)
      // no bell three times running: it has to be a tune
      if (seq.length >= 2 && seq[seq.length - 1] === n && seq[seq.length - 2] === n) continue
      seq.push(n)
    }
  }

  function demo() {
    state = 'listen'
    idx = 0
    bar.classList.add('listen')
    drawPips(seq.length, 0)
    const gap = 470 - round * 45
    seq.forEach((n, k) =>
      m.later(() => {
        ring(n)
        drawPips(seq.length, k + 1, 'demo')
      }, 350 + k * gap),
    )
    m.later(() => {
      state = 'play'
      bar.classList.remove('listen')
      drawPips(seq.length, 0)
      if (!tipShown) {
        tipShown = true
        tip = hint(m, 'Ring it back!', [cx, top - 66])
      }
    }, 350 + seq.length * gap + 150)
  }

  function press(i: number) {
    tip?.remove()
    tip = null
    // the secret: one bell, over and over
    if (i === mashBell) mash++
    else {
      mashBell = i
      mash = 1
    }
    if (mash === 12 && !heard) {
      heard = true
      g.stamp('ding-ding')
      g.say('Okay. We heard you.')
    }
    if (state === 'free') {
      ring(i)
      sparks(m, at(i), 2)
      return
    }
    if (state !== 'play') return ring(i, true)
    if (i !== seq[idx]) return miss(i)
    ring(i)
    idx++
    drawPips(seq.length, idx)
    if (idx < seq.length) return
    // the whole tune, right
    state = 'wait'
    sparks(m, at(i), 8)
    g.stamp('bike-bells')
    round++
    if (round >= LENGTHS.length) return m.later(encore, 500)
    m.later(() => sfx.coin(), 250)
    m.later(() => {
      newTune()
      demo()
    }, 1100)
  }

  function miss(i: number) {
    state = 'wait'
    clean = false
    ding(NOTES[i] - 6.5, 0.1)
    sfx.squawk()
    bar.classList.add('clunk')
    drawPips(seq.length, idx, 'bad')
    m.later(() => {
      bar.classList.remove('clunk')
      newTune()
      demo()
    }, 1100)
  }

  function encore() {
    // every bell, up and back down
    const run = [0, 1, 2, 3, 2, 1, 0, 3]
    run.forEach((n, k) => m.later(() => {
      ring(n)
      sparks(m, at(n), 4)
    }, k * 110))
    m.later(() => {
      shout(m, 'ENCORE!', [cx, top - 70], 'gold')
      g.confetti(clean ? 40 : 18)
      g.emote('cheer', 2.5)
      if (clean) g.stamp('bell-choir')
      g.say(clean ? 'Not one wrong note. On this street.' : 'Close enough for Greene Street.')
      pips.innerHTML = ''
      bar.classList.add('free')
      state = 'free'
    }, run.length * 110 + 100)
  }

  m.onKey((e) => {
    const n = '1234'.indexOf(e.key)
    if (n >= 0 && e.key.length === 1) {
      press(n)
      return true
    }
    if (e.key === ' ' || e.key === 'Enter') {
      // hear it again
      if (state === 'play' && idx === 0) demo()
      return true
    }
  })

  newTune()
  m.later(demo, 450)
}
