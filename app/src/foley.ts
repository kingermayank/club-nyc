/**
 * Foley: short, specific sound effects for real things that happen in the city (the train pulling in, its doors,
 * the espresso machine, a ticket being torn, an audience clapping). Synthesized on the shared WebAudio context
 * (audio.ts), so there are no sound files, and silent while the player has sound off.
 *
 * Levels sit with the rest of audio.ts (peaks around 0.05–0.15) and everything goes through one soft limiter, so a
 * pile of claps can't get loud. Nothing here loops on its own: anything long (the ride, applause) is scheduled for a
 * set length and hands back a stop().
 */
import { audioCtx } from './audio'
import { withSamples } from './sound/library'

let out: GainNode | null = null
let white: AudioBuffer | null = null

/** the shared context and our bus (null while muted) */
function ctx(): AudioContext | null {
  let a: AudioContext | null = null
  try {
    a = audioCtx()
  } catch {
    return null
  }
  if (!a) return null
  if (!out || out.context !== a) {
    const limit = a.createDynamicsCompressor()
    limit.threshold.value = -16
    limit.knee.value = 12
    limit.ratio.value = 6
    limit.attack.value = 0.003
    limit.release.value = 0.25
    out = a.createGain()
    out.gain.value = 1
    out.connect(limit).connect(a.destination)
    const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    white = buf
  }
  return a
}

type ToneOpts = { to?: number; attack?: number; dest?: AudioNode; detune?: number; vibrato?: [rate: number, depth: number] }
/** one pitched note with a quick attack and an exponential fade */
function tone(a: AudioContext, f: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine', o: ToneOpts = {}) {
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(f, at)
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + dur)
  if (o.detune) osc.detune.value = o.detune
  if (o.vibrato) {
    const lfo = a.createOscillator()
    const depth = a.createGain()
    lfo.frequency.value = o.vibrato[0]
    depth.gain.value = o.vibrato[1]
    lfo.connect(depth).connect(osc.frequency)
    lfo.start(at)
    lfo.stop(at + dur + 0.05)
  }
  const atk = o.attack ?? 0.008
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(vol, at + atk)
  g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(dur, atk + 0.01))
  osc.connect(g).connect(o.dest ?? out!)
  osc.start(at)
  osc.stop(at + dur + 0.06)
}

type NoiseOpts = { type?: BiquadFilterType; f?: number; to?: number; q?: number; attack?: number; dest?: AudioNode; pan?: number }
/** filtered noise: hisses, swishes, thumps and claps */
function noise(a: AudioContext, at: number, dur: number, vol: number, o: NoiseOpts = {}) {
  const src = a.createBufferSource()
  src.buffer = white
  const f = a.createBiquadFilter()
  f.type = o.type ?? 'bandpass'
  f.frequency.setValueAtTime(o.f ?? 1000, at)
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, at + dur)
  f.Q.value = o.q ?? 0.9
  const g = a.createGain()
  const atk = o.attack ?? 0.004
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(vol, at + atk)
  g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(dur, atk + 0.01))
  let tail: AudioNode = g
  if (o.pan) {
    const p = a.createStereoPanner()
    p.pan.value = o.pan
    g.connect(p)
    tail = p
  }
  src.connect(f).connect(g)
  tail.connect(o.dest ?? out!)
  src.start(at, Math.random() * 1.6)
  src.stop(at + dur + 0.06)
}

/** a gain stage whose level can be ramped (for sounds that swell and fade) */
function swell(a: AudioContext, points: [t: number, v: number][], dest: AudioNode = out!) {
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, points[0][0])
  for (const [t, v] of points) g.gain.linearRampToValueAtTime(Math.max(0.0001, v), t)
  g.connect(dest)
  return g
}

/** a long bed of filtered noise into `dest` (rumbles, steam) */
function bed(a: AudioContext, at: number, dur: number, dest: AudioNode, o: { type?: BiquadFilterType; f: number; to?: number; q?: number }) {
  const src = a.createBufferSource()
  src.buffer = white
  src.loop = true
  const f = a.createBiquadFilter()
  f.type = o.type ?? 'lowpass'
  f.frequency.setValueAtTime(o.f, at)
  if (o.to) f.frequency.linearRampToValueAtTime(o.to, at + dur)
  f.Q.value = o.q ?? 0.7
  src.connect(f).connect(dest)
  src.start(at, Math.random() * 1.6)
  src.stop(at + dur + 0.1)
  return { src, f }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12)

// ---------- the newspaper ----------
export const paper = withSamples('paper', {
  /** turning to another edition: a crisp swish and a little crinkle */
  flip() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    noise(a, t, 0.24, 0.08, { f: 2200, to: 900, q: 0.7, attack: 0.03 })
    for (let i = 0; i < 6; i++) noise(a, t + rand(0, 0.2), 0.014, rand(0.03, 0.06), { type: 'highpass', f: 4200 })
    noise(a, t + 0.2, 0.08, 0.05, { type: 'lowpass', f: 700 })
  },
  /** unfolding the paper */
  open() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    noise(a, t, 0.2, 0.07, { f: 1500, to: 2600, q: 0.6, attack: 0.04 })
    noise(a, t + 0.17, 0.26, 0.08, { f: 2400, to: 1000, q: 0.6, attack: 0.03 })
    for (let i = 0; i < 9; i++) noise(a, t + rand(0, 0.42), 0.012, rand(0.025, 0.055), { type: 'highpass', f: 4500 })
    noise(a, t + 0.42, 0.09, 0.05, { type: 'lowpass', f: 600 })
  },
})

// ---------- the subway ----------
/** one rail-joint "clack" (two hits as a truck's wheels pass the joint) */
function clack(a: AudioContext, at: number, vol: number, dest?: AudioNode) {
  for (const dt of [0, 0.075]) {
    noise(a, at + dt, 0.05, vol, { f: 650, q: 1.6, dest })
    tone(a, 95, at + dt, 0.07, vol * 0.8, 'sine', { to: 60, dest })
  }
}

export const subway = withSamples('subway', {
  /** a train pulling into the station: rumble growing, wheels slowing over the joints, brakes, a sigh of air */
  arrive() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    const g = swell(a, [[t, 0], [t + 1.5, 0.16], [t + 2.1, 0.12], [t + 2.6, 0]])
    bed(a, t, 2.6, g, { f: 130, to: 280 })
    ;[0.25, 0.6, 0.92, 1.2, 1.45, 1.68, 1.9].forEach((dt, i) => clack(a, t + dt, 0.05 + i * 0.008))
    tone(a, 2350, t + 1.45, 0.9, 0.018, 'sine', { attack: 0.25, vibrato: [7, 22] })
    tone(a, 3120, t + 1.6, 0.6, 0.008, 'sine', { attack: 0.2, vibrato: [6, 18] })
    noise(a, t + 2.15, 0.55, 0.06, { type: 'highpass', f: 2800, attack: 0.03 })
  },
  /** the two-tone chime before the doors close ("Stand clear of the closing doors, please") */
  chime() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    for (const [n, at, len] of [[76, 0, 0.6], [72, 0.42, 0.95]] as const) {
      tone(a, NOTE(n), t + at, len, 0.11, 'sine', { attack: 0.01 })
      tone(a, NOTE(n + 12), t + at, len * 0.5, 0.022, 'sine')
      tone(a, NOTE(n) * 2.76, t + at, 0.18, 0.006, 'sine')
    }
  },
  /** the doors: a hiss of air, the slide, a rubbery thump */
  doorsClose() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    noise(a, t, 0.34, 0.06, { f: 2600, q: 0.7, attack: 0.02 })
    noise(a, t + 0.04, 0.3, 0.05, { f: 900, to: 480, q: 1 })
    tone(a, 110, t + 0.34, 0.16, 0.15, 'sine', { to: 52 })
    noise(a, t + 0.34, 0.08, 0.07, { type: 'lowpass', f: 320 })
    tone(a, 290, t + 0.36, 0.04, 0.018, 'square')
  },
  doorsOpen() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    noise(a, t, 0.3, 0.06, { f: 2400, q: 0.7, attack: 0.015 })
    noise(a, t + 0.03, 0.3, 0.05, { f: 480, to: 950, q: 1 })
    tone(a, 160, t + 0.3, 0.08, 0.05, 'sine', { to: 90 })
  },
  /**
   * The ride itself: a low rumble and the clickety-clack of the wheels over the rail joints, for `seconds`.
   * Fades in, fades out on its own; stop() ends it early.
   */
  ride(seconds: number): () => void {
    const a = ctx()
    if (!a) return () => {}
    const t = a.currentTime + 0.02
    const end = t + seconds
    const g = swell(a, [[t, 0], [t + 0.7, 0.11], [end - 0.6, 0.11], [end, 0]])
    const rumble = bed(a, t, seconds, g, { f: 170, to: 210 })
    // the car sways: the rumble's tone breathes a little
    const lfo = a.createOscillator()
    const depth = a.createGain()
    lfo.frequency.value = 0.35
    depth.gain.value = 35
    lfo.connect(depth).connect(rumble.f.frequency)
    lfo.start(t)
    lfo.stop(end + 0.1)
    // motor whine winding up as the train leaves
    tone(a, 180, t, 1.6, 0.014, 'sawtooth', { to: 330, attack: 0.3, dest: g })
    // clickety-clack: a pair of joints every ~0.48 s, a little faster once the train is up to speed
    const clacks = a.createGain()
    clacks.gain.value = 1
    clacks.connect(g)
    let at = t + 0.5
    for (let i = 0; at < end - 0.35; i++) {
      clack(a, at, 0.32, clacks)
      clack(a, at + 0.21, 0.26, clacks)
      at += i < 2 ? 0.62 - i * 0.07 : rand(0.44, 0.5)
    }
    return () => {
      const now = a.currentTime
      g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(g.gain.value, now)
      g.gain.linearRampToValueAtTime(0.0001, now + 0.25)
      setTimeout(() => g.disconnect(), 400)
    }
  },
  /**
   * The ride as it happens, played live from the ride scene (features/subway.ts): speed(v) every frame with the
   * train's speed from 0 to 1, joint() as the wheels cross each rail joint, squeal() on a curve, stop() at the end.
   * The rumble and the tunnel roar swell with speed, and the traction motors whine up through their notes as the
   * train pulls out and back down as it brakes. Null while sound is off.
   */
  run() {
    const a = ctx()
    if (!a) return null
    const t = a.currentTime + 0.01
    const bus = a.createGain()
    bus.gain.setValueAtTime(0.0001, t)
    bus.gain.linearRampToValueAtTime(1, t + 0.3)
    bus.connect(out!)
    const level = (g: number) => {
      const n = a.createGain()
      n.gain.value = g
      n.connect(bus)
      return n
    }
    // the car's own rumble, under everything, and the roar of the tunnel going by
    const rumbleG = level(0.04)
    const rumble = bed(a, t, 60, rumbleG, { f: 110 })
    const roarG = level(0.0001)
    const roar = bed(a, t, 60, roarG, { type: 'bandpass', f: 420, q: 0.5 })
    // the motors: two detuned saws through a soft filter, an octave apart
    const motorF = a.createBiquadFilter()
    motorF.type = 'lowpass'
    motorF.frequency.value = 1400
    const motorG = level(0.0001)
    motorF.connect(motorG)
    const motors = [0, 1].map((i) => {
      const o = a.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = 60
      o.detune.value = i ? 9 : -9
      const g = a.createGain()
      g.gain.value = i ? 0.45 : 1
      o.connect(g).connect(motorF)
      o.start(t)
      return o
    })
    let prev = 0
    return {
      speed(v: number) {
        const n = a.currentTime
        const pulling = Math.max(0, Math.min(1, Math.abs(v - prev) * 60))
        prev = v
        rumbleG.gain.setTargetAtTime(0.04 + 0.08 * v, n, 0.12)
        rumble.f.frequency.setTargetAtTime(100 + 150 * v, n, 0.15)
        roarG.gain.setTargetAtTime(0.0001 + 0.06 * v * v, n, 0.2)
        roar.f.frequency.setTargetAtTime(320 + 620 * v, n, 0.2)
        // the whine climbs in steps, like the inverter changing gear, and is loudest while it's pulling or braking
        const step = Math.floor(v * 6) / 6
        motors[0].frequency.setTargetAtTime(70 + 380 * step + 60 * v, n, 0.06)
        motors[1].frequency.setTargetAtTime(2 * (70 + 380 * step + 60 * v), n, 0.06)
        motorG.gain.setTargetAtTime(v > 0.01 ? 0.002 + 0.01 * pulling + 0.002 * v : 0.0001, n, 0.15)
      },
      /** both trucks of the car over one joint: clack-clack ... clack-clack */
      joint(v: number) {
        const n = a.currentTime + 0.005
        const gap = 0.07 + (1 - v) * 0.06
        clack(a, n, 0.03 + 0.05 * v, bus)
        clack(a, n + gap * 3, 0.025 + 0.04 * v, bus)
      },
      /** steel on steel round a bend */
      squeal() {
        const n = a.currentTime + 0.05
        tone(a, rand(1900, 2300), n, 1.1, 0.012, 'sine', { attack: 0.3, vibrato: [9, 30], dest: bus })
        tone(a, rand(2900, 3300), n + 0.15, 0.8, 0.005, 'sine', { attack: 0.25, vibrato: [7, 24], dest: bus })
      },
      stop() {
        const n = a.currentTime
        bus.gain.cancelScheduledValues(n)
        bus.gain.setValueAtTime(bus.gain.value, n)
        bus.gain.linearRampToValueAtTime(0.0001, n + 0.4)
        setTimeout(() => {
          for (const o of motors) o.stop()
          rumble.src.stop()
          roar.src.stop()
          bus.disconnect()
        }, 500)
      },
    }
  },
  /** the turnstile's bar going round one notch: a dry ratchet click */
  ratchet() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    noise(a, t, 0.025, 0.07, { type: 'highpass', f: 2600 })
    tone(a, rand(820, 900), t, 0.03, 0.025, 'square', { to: 500 })
  },
  /** slowing into the station: a brake squeal and the air sigh */
  brake() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    tone(a, 2280, t, 0.75, 0.02, 'sine', { attack: 0.2, vibrato: [8, 26] })
    tone(a, 2960, t + 0.12, 0.5, 0.009, 'sine', { attack: 0.15, vibrato: [7, 20] })
    noise(a, t + 0.7, 0.45, 0.05, { type: 'highpass', f: 2800, attack: 0.03 })
  },
})

// ---------- the café ----------
export const cafe = withSamples('cafe', {
  /** the espresso machine: pump buzz, gurgles, a long hiss of steam, two drips */
  espresso() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    // the pump: a low buzz through a muffled body
    const body = a.createBiquadFilter()
    body.type = 'lowpass'
    body.frequency.value = 520
    const pump = swell(a, [[t, 0], [t + 0.08, 0.05], [t + 1.1, 0.05], [t + 1.35, 0]], body)
    body.connect(out!)
    const o = a.createOscillator()
    o.type = 'square'
    o.frequency.value = 52
    o.connect(pump)
    o.start(t)
    o.stop(t + 1.4)
    for (let i = 0; i < 7; i++) tone(a, rand(280, 520), t + rand(0.25, 1.1), 0.05, 0.03, 'sine', { to: rand(500, 800) })
    // steam: a hiss that flutters
    const steam = swell(a, [[t + 0.35, 0], [t + 0.6, 0.07], [t + 1.45, 0.06], [t + 1.8, 0]])
    const flutter = a.createGain()
    flutter.gain.value = 0.75
    const lfo = a.createOscillator()
    const lg = a.createGain()
    lfo.frequency.value = 21
    lg.gain.value = 0.25
    lfo.connect(lg).connect(flutter.gain)
    lfo.start(t + 0.3)
    lfo.stop(t + 1.9)
    flutter.connect(steam)
    bed(a, t + 0.3, 1.55, flutter, { type: 'highpass', f: 2600, q: 0.5 })
    tone(a, 1450, t + 1.55, 0.05, 0.045, 'sine', { to: 880 })
    tone(a, 1300, t + 1.74, 0.05, 0.035, 'sine', { to: 820 })
  },
})

// ---------- the theater ----------
export const theater = withSamples('theater', {
  /** an usher tearing your ticket */
  ticket() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    for (let i = 0; i < 10; i++) noise(a, t + i * 0.016, 0.014, 0.05 + i * 0.002, { f: 2400 + i * 240, q: 1.4 })
    noise(a, t + 0.17, 0.06, 0.035, { type: 'highpass', f: 3800 })
  },
  /** the big velvet curtain sweeping open or shut */
  curtain() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    const g = swell(a, [[t, 0], [t + 0.35, 0.09], [t + 0.9, 0.07], [t + 1.5, 0]])
    bed(a, t, 1.5, g, { f: 420, to: 1100, q: 0.5 })
    noise(a, t + 0.05, 1.2, 0.025, { f: 260, q: 0.8, attack: 0.3 })
  },
  /** a follow spot thunking on */
  spotlight() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    tone(a, 74, t, 0.16, 0.12, 'sine', { to: 50 })
    noise(a, t, 0.06, 0.06, { type: 'lowpass', f: 420 })
    tone(a, 120, t + 0.02, 0.5, 0.012, 'sine', { attack: 0.05 })
  },
  /** a snare roll that builds (for the big finish) */
  drumroll(seconds = 1.6) {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    const n = Math.floor(seconds * 26)
    for (let i = 0; i < n; i++) noise(a, t + i / 26 + rand(-0.004, 0.004), 0.045, 0.015 + (i / n) * 0.05, { f: 1900, q: 0.8 })
  },
  /** one cymbal crash */
  crash() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    noise(a, t, 1.3, 0.06, { type: 'highpass', f: 5200 })
    noise(a, t, 0.6, 0.04, { f: 8200, q: 0.6 })
    tone(a, 410, t, 0.3, 0.012, 'triangle', { to: 380 })
  },
  /** a two-finger whistle from the balcony */
  whistle() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    const o = a.createOscillator()
    const g = a.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(1900, t)
    o.frequency.exponentialRampToValueAtTime(2700, t + 0.16)
    o.frequency.exponentialRampToValueAtTime(2350, t + 0.55)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.028, t + 0.06)
    g.gain.setValueAtTime(0.028, t + 0.4)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    o.connect(g).connect(out!)
    o.start(t)
    o.stop(t + 0.65)
  },
  /**
   * An audience clapping for `seconds` (size 0..1 = how full the house is): it swells, holds and dies down,
   * with a few cheers and whistles on top. Returns stop().
   */
  applause(seconds = 4, size = 1): () => void {
    const a = ctx()
    if (!a) return () => {}
    const t = a.currentTime + 0.02
    const end = t + seconds
    const g = swell(a, [[t, 0.0001], [t + 0.5, 1], [end - 1.1, 1], [end, 0.0001]])
    const peak = 12 + 26 * size
    let at = t
    while (at < end) {
      const k = Math.min(1, (at - t) / 0.6, (end - at) / 1.2)
      noise(a, at, rand(0.03, 0.06), rand(0.018, 0.045), { f: rand(900, 2600), q: 1.3, dest: g, pan: rand(-0.8, 0.8) })
      at += 1 / Math.max(3, peak * Math.max(0.15, k))
    }
    // the room: a soft wash under the claps
    const wash = swell(a, [[t, 0], [t + 0.6, 0.025 * (0.5 + size / 2)], [end - 1, 0.02], [end, 0]], g)
    bed(a, t, seconds, wash, { type: 'bandpass', f: 1500, q: 0.4 })
    // a few "woo!"s (a voice-ish glide) and a whistle
    const woos = Math.round(1 + size * 3)
    for (let i = 0; i < woos; i++) {
      const w = t + rand(0.3, Math.max(0.6, seconds * 0.6))
      tone(a, rand(480, 620), w, 0.5, 0.016, 'triangle', { to: rand(820, 1050), attack: 0.06, vibrato: [6, 14], dest: g })
    }
    if (size > 0.5) setTimeout(() => theater.whistle(), rand(500, Math.max(600, seconds * 500)))
    return () => {
      const now = a.currentTime
      g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now)
      g.gain.linearRampToValueAtTime(0.0001, now + 0.4)
      setTimeout(() => g.disconnect(), 600)
    }
  },
})

/** the arrival: a station photo booth, the MetroCard machine and the turnstile (features/arrival.ts) */
export const arrival = withSamples('arrival', {
  /** a booth camera: the shutter's two clicks and a little flash whine */
  shutter() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    noise(a, t, 0.03, 0.12, { type: 'highpass', f: 3200 })
    tone(a, 180, t, 0.05, 0.06, 'square', { to: 90 })
    noise(a, t + 0.09, 0.05, 0.09, { f: 1800, q: 1.2 })
    tone(a, 2600, t + 0.02, 0.35, 0.012, 'sine', { to: 5200, attack: 0.05 })
  },
  /** the machine printing your card: a motor and the card stepping out */
  print(seconds = 1.4) {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    tone(a, 92, t, seconds, 0.035, 'sawtooth', { to: 110, attack: 0.08 })
    for (let i = 0; i < seconds / 0.09; i++) noise(a, t + i * 0.09, 0.03, 0.035, { f: 1900 + rand(-200, 200), q: 2 })
    noise(a, t + seconds, 0.07, 0.06, { type: 'lowpass', f: 900 })
  },
  /** the card sliding through the reader */
  swipe() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    noise(a, t, 0.22, 0.07, { f: 900, to: 2600, q: 0.8, attack: 0.02 })
  },
  /** "GO": the reader's happy beep */
  beep() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    tone(a, 1568, t, 0.12, 0.08, 'square')
    tone(a, 2093, t + 0.13, 0.18, 0.07, 'square')
  },
  /** "PLEASE SWIPE AGAIN": the reader's grumpy buzz */
  buzz() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    tone(a, 150, t, 0.32, 0.07, 'square', { to: 120 })
    tone(a, 153, t, 0.32, 0.05, 'sawtooth', { to: 122 })
  },
  /** the turnstile arm turning over */
  clack() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    tone(a, 120, t, 0.14, 0.14, 'sine', { to: 60 })
    noise(a, t, 0.07, 0.08, { type: 'lowpass', f: 500 })
    noise(a, t + 0.18, 0.05, 0.05, { f: 1400, q: 1.5 })
  },
})

/** the Exchange floor (features/exchange.ts): the opening bell and the floor going up */
export const exchange = withSamples('exchange', {
  /** the opening bell: an electric bell, ringing for as long as the button is held. Returns stop(). */
  bell(): () => void {
    const a = ctx()
    if (!a) return () => {}
    const t = a.currentTime + 0.01
    const g = a.createGain()
    g.gain.value = 0
    g.connect(out!)
    // a hammer striking a gong about 22 times a second: two bright partials, chopped
    const lfo = a.createOscillator()
    const depth = a.createGain()
    lfo.frequency.value = 22
    depth.gain.value = 0.05
    lfo.connect(depth).connect(g.gain)
    const oscs = [1180, 2830, 4350].map((f, i) => {
      const o = a.createOscillator()
      const v = a.createGain()
      o.frequency.value = f
      v.gain.value = [1, 0.45, 0.2][i]
      o.connect(v).connect(g)
      o.start(t)
      return o
    })
    g.gain.setValueAtTime(0.05, t)
    lfo.start(t)
    const stop = () => {
      const n = a.currentTime
      g.gain.cancelScheduledValues(n)
      depth.gain.setTargetAtTime(0, n, 0.08)
      g.gain.setTargetAtTime(0, n, 0.25)
      for (const o of [...oscs, lfo]) o.stop(n + 1.4)
    }
    const auto = setTimeout(stop, 9600)
    return () => {
      clearTimeout(auto)
      stop()
    }
  },
  /** the floor cheering */
  cheer() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    for (let i = 0; i < 40; i++) noise(a, t + rand(0, 3), 0.04, 0.03, { f: rand(900, 2400), q: 2 })
    noise(a, t, 3.4, 0.05, { type: 'bandpass', f: 1100, q: 0.6, attack: 0.3 })
  },
})

/** the building blocks, for the jobs' own sound modules (one shared context and limiter for everything) */
export const kit = { ctx, tone, noise, swell, bed, rand, NOTE }

/** everything above, by name (the dev sound board and QA scripts play them from here) */
export const FOLEY: Record<string, () => unknown> = {
  'paper.flip': paper.flip,
  'paper.open': paper.open,
  'subway.arrive': subway.arrive,
  'subway.chime': subway.chime,
  'subway.doorsClose': subway.doorsClose,
  'subway.doorsOpen': subway.doorsOpen,
  'subway.ride': () => subway.ride(4),
  'subway.brake': subway.brake,
  'cafe.espresso': cafe.espresso,
  'theater.ticket': theater.ticket,
  'theater.curtain': theater.curtain,
  'theater.spotlight': theater.spotlight,
  'theater.drumroll': () => theater.drumroll(1.6),
  'theater.crash': theater.crash,
  'theater.whistle': theater.whistle,
  'theater.applause': () => theater.applause(4, 1),
  'arrival.shutter': arrival.shutter,
  'arrival.print': () => arrival.print(1.4),
  'arrival.swipe': arrival.swipe,
  'arrival.beep': arrival.beep,
  'arrival.buzz': arrival.buzz,
  'arrival.clack': arrival.clack,
  'exchange.bell': () => setTimeout(exchange.bell(), 2500),
  'exchange.cheer': exchange.cheer,
}

// dev builds: play any sound by name from the console or a QA script, or open the sound board
if (import.meta.env.DEV) {
  ;(window as unknown as { clubNycSounds: unknown }).clubNycSounds = {
    open: () => void import('./dev/soundboard').then((m) => m.openSoundboard()),
    list: () => import('./dev/soundboard').then((m) => m.soundNames()),
    play: (name: string) => import('./dev/soundboard').then((m) => m.playSound(name)),
    /** which recordings are listed and loaded, and the room ambience playing */
    state: () => import('./sound/library').then((m) => m.libraryState()),
  }
}
