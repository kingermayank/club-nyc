/**
 * Little synthesized sounds for the multiplayer games (no audio files). Short, soft, and silent when the game is
 * muted (the toolbar's sound button, or the one in the game's corner).
 */
import { isMuted } from '../audio'

let ac: AudioContext | null = null
let master: GainNode | null = null
function audio(): AudioContext | null {
  if (isMuted()) return null
  try {
    if (!ac) {
      ac = new AudioContext()
      master = ac.createGain()
      master.gain.value = 0.8
      master.connect(ac.destination)
    }
    if (ac.state === 'suspended') void ac.resume()
    return ac
  } catch {
    return null
  }
}
const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12)

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, delay = 0, slideTo?: number) {
  const a = audio()
  if (!a || !master) return
  const t = a.currentTime + delay
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.05)
}
function noise(dur: number, vol = 0.08, freq = 900, delay = 0, q = 1) {
  const a = audio()
  if (!a || !master) return
  const t = a.currentTime + delay
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = a.createBufferSource()
  src.buffer = buf
  const f = a.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  const g = a.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(master)
  src.start(t)
}

/** a looping "shhhh" whose loudness follows a speed (the sled on snow, the runner's footsteps) */
export function slideLoop() {
  const a = audio()
  if (!a || !master) return { set: (_v: number) => {}, stop: () => {} }
  const len = a.sampleRate * 2
  const buf = a.createBuffer(1, len, a.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    last = last * 0.96 + (Math.random() * 2 - 1) * 0.04
    d[i] = last * 6
  }
  const src = a.createBufferSource()
  src.buffer = buf
  src.loop = true
  const f = a.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 700
  const g = a.createGain()
  g.gain.value = 0
  src.connect(f).connect(g).connect(master)
  src.start()
  return {
    set(v: number) {
      if (isMuted()) return void (g.gain.value = 0)
      g.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.09, a.currentTime, 0.12)
      f.frequency.setTargetAtTime(500 + v * 900, a.currentTime, 0.2)
    },
    stop() {
      g.gain.setTargetAtTime(0, a.currentTime, 0.08)
      setTimeout(() => src.stop(), 400)
    },
  }
}

export const msfx = {
  /** 3, 2, 1… */
  count: () => tone(NOTE(72), 0.14, 'triangle', 0.1),
  go: () => {
    tone(NOTE(79), 0.12, 'triangle', 0.12)
    tone(NOTE(84), 0.32, 'triangle', 0.12, 0.1)
  },
  hop: () => tone(330, 0.16, 'sine', 0.09, 0, 620),
  land: () => noise(0.12, 0.06, 500),
  bump: () => {
    tone(140, 0.12, 'sine', 0.12, 0, 90)
    noise(0.08, 0.05, 400)
  },
  crash: () => {
    noise(0.35, 0.12, 300, 0, 0.7)
    tone(220, 0.25, 'square', 0.04, 0.02, 90)
    tone(NOTE(88), 0.08, 'sine', 0.05, 0.25)
    tone(NOTE(91), 0.08, 'sine', 0.05, 0.33)
  },
  poof: () => noise(0.25, 0.08, 1800, 0, 0.6),
  boost: () => {
    tone(NOTE(76), 0.08, 'square', 0.04)
    tone(NOTE(81), 0.08, 'square', 0.04, 0.07)
    tone(NOTE(88), 0.16, 'square', 0.04, 0.14)
  },
  whoosh: () => noise(0.5, 0.07, 1200, 0, 0.5),
  card: () => {
    noise(0.05, 0.06, 3000)
    tone(NOTE(84), 0.05, 'triangle', 0.05, 0.02)
  },
  swipe: () => tone(NOTE(93), 0.07, 'square', 0.035),
  meow: () => {
    tone(700, 0.18, 'sawtooth', 0.03, 0, 1000)
    tone(950, 0.22, 'sawtooth', 0.025, 0.16, 600)
  },
  horn: () => {
    tone(NOTE(62), 0.25, 'sawtooth', 0.045)
    tone(NOTE(66), 0.25, 'sawtooth', 0.035)
  },
  station: () => {
    tone(NOTE(76), 0.32, 'sine', 0.07)
    tone(NOTE(72), 0.5, 'sine', 0.07, 0.3)
  },
  finish: () => [72, 76, 79, 84].forEach((n, i) => tone(NOTE(n), 0.22, 'triangle', 0.1, i * 0.11)),
  win: () => [72, 76, 79, 84, 88].forEach((n, i) => tone(NOTE(n), 0.25, 'triangle', 0.1, i * 0.1)),
  lose: () => [67, 64, 60].forEach((n, i) => tone(NOTE(n), 0.24, 'triangle', 0.07, i * 0.14)),
  flip: () => noise(0.09, 0.07, 2600),
  roundWin: () => {
    tone(NOTE(79), 0.1, 'triangle', 0.09)
    tone(NOTE(86), 0.22, 'triangle', 0.09, 0.08)
  },
  roundLose: () => tone(NOTE(64), 0.22, 'triangle', 0.07, 0, NOTE(60)),
  tie: () => tone(NOTE(70), 0.18, 'triangle', 0.06),
  tick: () => tone(1100, 0.04, 'square', 0.025),
  pop: () => tone(520, 0.1, 'sine', 0.08, 0, 900),
  join: () => {
    tone(NOTE(76), 0.1, 'sine', 0.07)
    tone(NOTE(83), 0.16, 'sine', 0.07, 0.08)
  },
  ready: () => tone(NOTE(81), 0.12, 'triangle', 0.08),
}
