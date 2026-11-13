import './bridgeWalk.css'
import { audioCtx, onMute, sfx } from '../audio'
import { avatarMarkup } from '../avatar/render'
import { randomLook } from '../avatar/random'
import { el, stage } from '../engine/stage'
import { hold } from '../engine/ui'
import { world } from '../engine/world'

/**
 * Walk the Brooklyn Bridge. The room's painting already looks down the promenade toward the Manhattan tower, so the
 * walk starts on exactly that picture and moves you into it: past a tourist who stops dead for a selfie, through the
 * first tower, then along the second half (the painting that looks toward DUMBO, the clock tower and the carousel)
 * to the Brooklyn end, where a barricade says Brooklyn is locked. Turning back walks you home under the
 * "Leaving Brooklyn: Fuhgeddaboudit!" sign (the borough's real signs say that).
 *
 * True details only: the promenade is about a mile and walkers-only since 2021 (bikes moved to the roadway below);
 * Emily Warren Roebling was the first across in 1883, holding a rooster.
 */

// we walk toward where the promenade meets the tower in both paintings: (500, 236) in stage units, the CSS
// transform-origin of .bw-pic (bridgeWalk.css)
const A = '/art/rooms/brooklyn-bridge-v2.jpg' // toward the Manhattan tower (the room's own art)
const B = '/art/rooms/brooklyn-bridge-v3.jpg' // toward the Brooklyn tower, DUMBO behind it

/** the walk, in seconds: first half, through the tower, second half, the Brooklyn end */
const T_A = 9.5
const T_THROUGH = 1.1
const T_B = 7.5
const S_A: [number, number] = [1, 2.7]
const S_B: [number, number] = [2.3, 3.5] // starts past the painting's vendors, which belong to the Manhattan end

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function walkToBrooklyn(): Promise<void> {
  return new Promise((resolve) => {
    const release = hold()
    const look = randomLook(0.5)
    const tourist = `<svg viewBox="-60 -185 120 192" aria-hidden="true">${avatarMarkup(look, { mood: 'grin', d: -1 })}</svg>`
    const root = el('div', 'bw')
    root.innerHTML = `<div class="bw-view">
        <div class="bw-pic bw-a" style="background-image:url(${A})"><div class="bw-tourist">${tourist}</div></div>
        <div class="bw-pic bw-b" style="background-image:url(${B})"></div>
        <div class="bw-stone"></div>
      </div>
      <div class="bw-end" hidden>
        <div class="bw-dumbo" style="background-image:url(${B})"></div>
        <div class="bw-deck"></div>
        <div class="bw-sign"><b>Welcome to Brooklyn</b><span>How Sweet It Is!</span></div>
        <div class="bw-barricade"><i class="bw-leg l"></i><i class="bw-leg r"></i><i class="bw-board"></i>
          <div class="bw-plate"><b>Brooklyn is locked.</b><span>Coming soon to Club NYC</span></div></div>
        <button class="btn go bw-back" type="button">Go Back to Manhattan</button>
      </div>
      <div class="bw-leaving" hidden><b>Leaving Brooklyn</b><span>Fuhgeddaboudit!</span></div>
      <div class="bw-caption"><b>Brooklyn Bridge</b><span class="bw-where">Walking to Brooklyn</span></div>
      <p class="bw-bubble" hidden></p>
      <p class="bw-line" aria-live="polite"></p>
      <div class="bw-actions"><button class="btn tiny ghost bw-turn" type="button">Turn Back</button></div>`
    stage.root.append(root)
    const picA = root.querySelector<HTMLElement>('.bw-a')!
    const picB = root.querySelector<HTMLElement>('.bw-b')!
    const stone = root.querySelector<HTMLElement>('.bw-stone')!
    const who = root.querySelector<HTMLElement>('.bw-tourist')!
    const bubble = root.querySelector<HTMLElement>('.bw-bubble')!
    const line = root.querySelector<HTMLElement>('.bw-line')!
    const where = root.querySelector<HTMLElement>('.bw-where')!
    const end = root.querySelector<HTMLElement>('.bw-end')!
    const leaving = root.querySelector<HTMLElement>('.bw-leaving')!
    const turn = root.querySelector<HTMLElement>('.bw-turn')!

    const say = (text: string) => {
      line.classList.remove('on')
      setTimeout(() => {
        line.textContent = text
        line.classList.toggle('on', !!text)
      }, 250)
    }
    /** a picture zoomed `s` toward the promenade's end, with a walker's bob and sway */
    const place = (pic: HTMLElement, s: number, bob: number, sway: number) => {
      pic.style.transform = `translate(${sway.toFixed(1)}px, ${bob.toFixed(1)}px) scale(${s.toFixed(4)})`
    }

    // ---------- sound: footsteps on the boards, wind, traffic under you ----------
    let stopSound = () => {}
    let stepSound = () => {}
    const startSound = () => {
      const ctx = audioCtx()
      if (!ctx) return
      const noise = (secs: number, brown: boolean) => {
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate)
        const d = buf.getChannelData(0)
        let last = 0
        for (let i = 0; i < d.length; i++) {
          const w = Math.random() * 2 - 1
          d[i] = brown ? (last = (last + 0.02 * w) / 1.02) * 3.4 : w
        }
        return buf
      }
      const wind = ctx.createBufferSource()
      wind.buffer = noise(3, true)
      wind.loop = true
      const low = ctx.createBiquadFilter()
      low.type = 'lowpass'
      low.frequency.value = 520
      const bed = ctx.createGain()
      bed.gain.value = 0
      bed.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 1.5)
      wind.connect(low).connect(bed).connect(ctx.destination)
      wind.start()
      const tick = noise(0.09, false)
      let k = 0
      stepSound = () => {
        // a hollow knock on wood: a short noise burst through a low band, alternating feet
        const src = ctx.createBufferSource()
        src.buffer = tick
        const band = ctx.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = k++ % 2 ? 210 : 260
        band.Q.value = 3
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.5, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
        src.connect(band).connect(g).connect(ctx.destination)
        src.start()
      }
      stopSound = () => {
        bed.gain.cancelScheduledValues(ctx.currentTime)
        bed.gain.setValueAtTime(bed.gain.value, ctx.currentTime)
        bed.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5)
        setTimeout(() => wind.stop(), 600)
        stepSound = () => {}
        stopSound = () => {}
      }
    }
    startSound()
    onMute((m) => (m ? stopSound() : root.isConnected && startSound()))

    // ---------- the walk ----------
    type Phase = 'out' | 'end' | 'back' | 'done'
    let phase: Phase = 'out'
    let t0 = performance.now()
    let raf = 0
    let lastStep = 0
    const said = new Set<string>()
    const once = (k: string, f: () => void) => {
      if (said.has(k)) return
      said.add(k)
      f()
    }
    const walking = (t: number, speed = 1) => {
      // about two steps a second: the view rises and dips with each one
      const step = t * 1.9 * speed
      if (Math.floor(step) !== lastStep) {
        lastStep = Math.floor(step)
        stepSound()
      }
      return { bob: Math.abs(Math.sin(step * Math.PI)) * -5, sway: Math.sin(step * Math.PI * 0.5) * 3 }
    }

    const frame = (now: number) => {
      const t = (now - t0) / 1000
      if (phase === 'out') {
        const { bob, sway } = walking(t)
        if (t < T_A) {
          const k = ease(t / T_A)
          const s = lerp(S_A[0], S_A[1], k)
          // the tourist steps out ahead of you and stops dead for a selfie; you go around them
          const dodge = t > 4.6 && t < 6.6 ? Math.sin(((t - 4.6) / 2) * Math.PI) * 46 : 0
          place(picA, s, bob, sway + dodge)
          who.style.opacity = t < 1.2 ? '0' : t < 1.8 ? String((t - 1.2) / 0.6) : s > 2.15 ? String(Math.max(0, 1 - (s - 2.15) / 0.2)) : '1'
          if (t > 2.2 && t < 5.4) {
            const r = who.getBoundingClientRect()
            const box = stage.root.getBoundingClientRect()
            bubble.hidden = false
            bubble.style.left = `${((r.left + r.width / 2 - box.left) / box.width) * 1000}px`
            bubble.style.top = `${((r.top - box.top) / box.height) * 565 - 30}px`
            bubble.textContent = t < 4.2 ? 'Wait, one more!' : 'Sorry! Sorry.'
          } else bubble.hidden = true
          once('start', () => say('The walk across is about a mile. Walkers only up here.'))
          if (t > 4.6) once('excuse', () => say('“Excuse me.” Every New Yorker has said it on this bridge.'))
          if (t > 6.8) once('rooster', () => say('The first person across, in 1883, was Emily Warren Roebling. She held a rooster.'))
        } else if (t < T_A + T_THROUGH) {
          // through the tower: the stone goes by close, then the second half opens up
          const k = (t - T_A) / T_THROUGH
          place(picA, S_A[1] + k * 0.9, bob, sway)
          stone.style.opacity = String(k < 0.5 ? k * 2 : 2 - k * 2)
          picB.style.opacity = k > 0.5 ? '1' : '0'
          place(picB, S_B[0], bob, sway)
          if (k > 0.5) where.textContent = 'Brooklyn ahead'
        } else if (t < T_A + T_THROUGH + T_B) {
          const k = ease((t - T_A - T_THROUGH) / T_B)
          place(picB, lerp(S_B[0], S_B[1], k), bob, sway)
          stone.style.opacity = '0'
          once('below', () => say('Under the boards: the traffic. Since 2021 the bikes ride down there too.'))
          if (k > 0.45) once('gull', () => (sfx.gull(), say('Brooklyn, right there. The clock tower, the carousel, the Manhattan Bridge.')))
        } else arrive()
      } else if (phase === 'back') {
        // walking home along the Manhattan half (holding still while the goodbye sign shows)
        if (t < 0) {
          place(picA, 2.4, 0, 0)
          raf = requestAnimationFrame(frame)
          return
        }
        const { bob, sway } = walking(t, 1.15)
        const k = ease(Math.min(1, t / 3.2))
        place(picA, lerp(2.4, 1, k), bob, sway)
        if (t > 3.6) return finish()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    // ---------- the Brooklyn end ----------
    const arrive = () => {
      phase = 'end'
      bubble.hidden = true
      say('')
      where.textContent = 'The Brooklyn end'
      end.hidden = false
      requestAnimationFrame(() => end.classList.add('on'))
      turn.hidden = true
      world.api.stamp('bridge-walk')
      root.querySelector<HTMLElement>('.bw-back')!.focus()
    }

    // ---------- back to Manhattan ----------
    const goBack = () => {
      if (phase === 'back' || phase === 'done') return
      sfx.click()
      phase = 'back'
      bubble.hidden = true
      turn.hidden = true
      end.classList.remove('on')
      leaving.hidden = false
      where.textContent = 'Walking back to Manhattan'
      say('')
      picB.style.opacity = '0'
      who.style.opacity = '0'
      // turn around: the borough's own goodbye, then the walk home
      setTimeout(() => {
        end.hidden = true
        leaving.classList.add('on')
      }, 30)
      setTimeout(() => leaving.classList.remove('on'), 1700)
      setTimeout(() => {
        leaving.hidden = true
        t0 = performance.now()
      }, 2000)
      t0 = performance.now() + 1e9 // hold still while the sign shows
    }
    root.querySelector<HTMLElement>('.bw-back')!.onclick = goBack
    turn.onclick = goBack

    const keys = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      goBack()
    }
    window.addEventListener('keydown', keys, true)

    const finish = () => {
      if (phase === 'done') return
      phase = 'done'
      cancelAnimationFrame(raf)
      stopSound()
      window.removeEventListener('keydown', keys, true)
      root.classList.add('out')
      setTimeout(() => {
        root.remove()
        release()
        resolve()
      }, 500)
    }
  })
}
