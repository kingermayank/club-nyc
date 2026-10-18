// Tiny WebAudio synth so the prototype has sound without any asset files.
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

function ac() {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, delay = 0, slideTo?: number) {
  if (muted) return
  const a = ac()
  const t = a.currentTime + delay
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015)
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
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(a.destination)
  src.start(t)
}

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12)

export const sfx = {
  click: () => tone(880, 0.06, 'triangle', 0.08),
  pop: () => tone(520, 0.12, 'sine', 0.12, 0, 1040),
  coin: () => {
    tone(NOTE(83), 0.08, 'square', 0.06)
    tone(NOTE(88), 0.25, 'square', 0.06, 0.08)
  },
  register: () => {
    tone(NOTE(84), 0.1, 'triangle', 0.1)
    tone(NOTE(91), 0.3, 'triangle', 0.1, 0.1)
    noise(0.15, 0.05, 3000, 0.05)
  },
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
  ding: () => tone(NOTE(84), 0.6, 'sine', 0.12),
  stamp: () => {
    tone(NOTE(72), 0.12, 'triangle', 0.1)
    tone(NOTE(76), 0.12, 'triangle', 0.1, 0.1)
    tone(NOTE(79), 0.12, 'triangle', 0.1, 0.2)
    tone(NOTE(84), 0.4, 'triangle', 0.12, 0.3)
  },
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
}

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
