// Tiny WebAudio synth: every sound has a synthesized version, and sound/library.ts swaps in a real recording
// for any name that has one (public/sfx/index.json), so this is also the fallback while recordings load.
import { cafe } from './foley'
import { withSamples, warmSamples, setMasterVolume, masterVolume } from './sound/library'
let ctx: AudioContext | null = null
let muted = false

export function setMuted(m: boolean) {
  muted = m
  muteListeners.forEach((f) => f(m))
}
export const isMuted = () => muted
const muteListeners: ((m: boolean) => void)[] = []
/** e.g. music follows the mute toggle */
export const onMute = (f: (m: boolean) => void) => void muteListeners.push(f)

/** Player volume 0..1 (persisted as save.volume). Mute is separate. */
export function setVolume(v: number) {
  setMasterVolume(v)
  volListeners.forEach((f) => f(masterVolume()))
}
export const getVolume = () => masterVolume()
const volListeners: ((v: number) => void)[] = []
export const onVolume = (f: (v: number) => void) => void volListeners.push(f)

function ac() {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}
/** The one shared AudioContext, for the other sound modules (foley.ts, the theater show); null while muted. */
export const audioCtx = (): AudioContext | null => (muted ? null : ac())

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, delay = 0, slideTo?: number) {
  if (muted) return
  const a = ac()
  const t = a.currentTime + delay
  const o = a.createOscillator()
  const g = a.createGain()
  const v = vol * masterVolume()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(v, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function noise(dur: number, vol = 0.1, freq = 800, delay = 0) {
  if (muted) return
  const a = ac()
  const t = a.currentTime + delay
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = a.createBufferSource()
  src.buffer = buf
  const f = a.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  const g = a.createGain()
  g.gain.setValueAtTime(vol * masterVolume(), t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(a.destination)
  src.start(t)
}

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12)

export const sfx = withSamples('sfx', {
  click: () => tone(880, 0.06, 'triangle', 0.08),
  pop: () => tone(520, 0.12, 'sine', 0.12, 0, 1040),
  coin: () => {
    tone(NOTE(83), 0.08, 'square', 0.06)
    tone(NOTE(88), 0.25, 'square', 0.06, 0.08)
  },
  /** a purchase: the cash drawer's clunk, the register bell, a couple of coins landing */
  register: () => {
    noise(0.06, 0.07, 240)
    tone(120, 0.1, 'sine', 0.1, 0, 70)
    noise(0.04, 0.035, 2600, 0.05)
    tone(NOTE(96), 0.55, 'sine', 0.07, 0.07)
    tone(NOTE(100), 0.45, 'sine', 0.04, 0.07)
    tone(NOTE(103), 0.06, 'triangle', 0.035, 0.22)
    tone(NOTE(98), 0.07, 'triangle', 0.03, 0.27)
  },
  /** the café's espresso machine (see foley.ts) */
  espresso: () => cafe.espresso(),
  honk: () => {
    tone(392, 0.28, 'square', 0.07)
    tone(494, 0.28, 'square', 0.05)
    tone(392, 0.4, 'square', 0.07, 0.35)
    tone(494, 0.4, 'square', 0.05, 0.35)
  },
  coo: () => {
    tone(330, 0.18, 'sine', 0.15, 0, 260)
    tone(300, 0.3, 'sine', 0.15, 0.22, 220)
  },
  quack: () => {
    tone(420, 0.12, 'sawtooth', 0.06, 0, 300)
    tone(420, 0.14, 'sawtooth', 0.06, 0.18, 280)
  },
  purr: () => {
    for (let i = 0; i < 10; i++) noise(0.09, 0.08, 120, i * 0.11)
  },
  // The "stand clear of the closing doors" two-tone chime
  chime: () => {
    tone(NOTE(76), 0.5, 'sine', 0.15)
    tone(NOTE(72), 0.8, 'sine', 0.15, 0.45)
  },
  train: () => {
    for (let i = 0; i < 8; i++) noise(0.12, 0.12, 200 + (i % 2) * 80, i * 0.16)
  },
  whoosh: () => noise(0.5, 0.12, 600),
  /** a squeeze bottle: a short wet hiss with a little pitch drop */
  squirt: () => {
    noise(0.16, 0.07, 1400)
    tone(330, 0.1, 'sine', 0.035, 0, 180)
  },
  /** one bite: a soft crunch of bun */
  chomp: () => {
    noise(0.06, 0.16, 520)
    noise(0.05, 0.11, 300, 0.07)
  },
  /** a rubber stamp hitting paper: a low thump and a short slap */
  thunk: () => {
    tone(120, 0.12, 'sine', 0.22, 0, 60)
    noise(0.05, 0.16, 1800)
  },
  ding: () => tone(NOTE(84), 0.6, 'sine', 0.12),
  stamp: () => {
    tone(NOTE(72), 0.12, 'triangle', 0.1)
    tone(NOTE(76), 0.12, 'triangle', 0.1, 0.1)
    tone(NOTE(79), 0.12, 'triangle', 0.1, 0.2)
    tone(NOTE(84), 0.4, 'triangle', 0.12, 0.3)
  },
  /** a new level: a quick rising arpeggio, then a bright held chord */
  levelUp: () => {
    ;[60, 64, 67, 72, 76].forEach((n, i) => tone(NOTE(n), 0.14, 'triangle', 0.09, i * 0.08))
    ;[72, 76, 79].forEach((n) => tone(NOTE(n), 0.8, 'sine', 0.05, 0.45))
  },
  /** a little XP: one soft sparkle */
  xp: () => tone(NOTE(91), 0.12, 'sine', 0.04, 0, NOTE(96)),
  toot: () => tone(180, 0.7, 'sawtooth', 0.06),
  squawk: () => tone(1200, 0.2, 'sawtooth', 0.05, 0, 700),
  piano: (midi: number) => {
    tone(NOTE(midi), 0.9, 'triangle', 0.18)
    tone(NOTE(midi + 12), 0.5, 'sine', 0.04)
  },
  clapper: () => {
    noise(0.05, 0.3, 2500)
  },
  tick: () => tone(1000, 0.05, 'square', 0.05),
  /** a gull over the water (squawk is the "nope" sound) */
  gull: () => tone(1200, 0.2, 'sawtooth', 0.05, 0, 700),
})

// start fetching the recordings once the player has clicked something (browsers need a gesture for audio anyway)
if (typeof window !== 'undefined') addEventListener('pointerdown', () => warmSamples(), { once: true, capture: true })

/** A simple dance beat (kick, clap, hats, bass) for flash mobs. Returns a stop function. */
export function startBeat(bpm = 118): () => void {
  const beat = 60 / bpm
  const bass = [40, 40, 43, 45, 40, 40, 47, 45]
  let step = 0
  const tick = () => {
    if (muted) return void step++
    const s = step % 16
    if (s % 4 === 0) {
      tone(110, 0.18, 'sine', 0.35, 0, 45)
    }
    if (s % 8 === 4) noise(0.12, 0.18, 1600)
    if (s % 2 === 1) noise(0.03, 0.05, 7000)
    if (s % 2 === 0) tone(NOTE(bass[(s / 2) % 8]), beat * 0.45, 'square', 0.05)
    step++
  }
  const id = window.setInterval(tick, (beat / 2) * 1000)
  tick()
  return () => window.clearInterval(id)
}
