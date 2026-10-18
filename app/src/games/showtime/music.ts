// Showtime! — a bouncy hip-hop/house loop synthesized with WebAudio, plus the note chart that rides on it.
// Everything is timed in AudioContext seconds: the song is scheduled ahead with a lookahead pump and the
// chart is expressed in the same 16th-note grid, so notes and music can't drift apart.

export const BPM = 116
export const SPB = 60 / BPM // seconds per beat
export const STEP = SPB / 4 // one 16th note
export const BAR = SPB * 4
export const SONG_BARS = 40 // ≈ 82.8 s
export const SONG_STEPS = SONG_BARS * 16

export type Difficulty = 'easy' | 'hard'
export type Section = 'countin' | 'intro' | 'verse' | 'hook' | 'break' | 'build' | 'verse2' | 'hook2' | 'outro' | 'end'

/** Song form (bar -1 is the count-in under "WHAT TIME IS IT?"). */
export function sectionOf(bar: number): Section {
  if (bar < 0) return 'countin'
  if (bar < 2) return 'intro'
  if (bar < 10) return 'verse'
  if (bar < 18) return 'hook'
  if (bar < 21) return 'break'
  if (bar < 22) return 'build'
  if (bar < 30) return 'verse2'
  if (bar < 38) return 'hook2'
  if (bar < 39) return 'outro'
  return 'end'
}

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12)

// ---------- harmony: Am | F | C | G ----------
interface Chord {
  root: number
  tones: number[]
}
const CH: Record<string, Chord> = {
  Am: { root: 45, tones: [57, 60, 64] },
  F: { root: 41, tones: [57, 60, 65] },
  C: { root: 48, tones: [55, 60, 64] },
  G: { root: 43, tones: [55, 59, 62] },
}
const PROG = ['Am', 'F', 'C', 'G']
function chordAt(bar: number, s: number): Chord {
  if (bar < 2) return CH.Am
  if (bar === 38) return s < 8 ? CH.F : CH.G
  if (bar >= 39) return CH.Am
  return CH[PROG[(bar - 2) % 4]]
}

/** [step, interval or midi, length in steps] */
type Pat = [number, number, number][]
const BASS_VERSE: Pat = [[0, 0, 2], [3, 0, 1], [6, 12, 1], [8, 0, 2], [10, 7, 1], [11, 12, 1], [14, 7, 2]]
const BASS_HOOK: Pat = [[0, 0, 1.5], [2, 12, 1], [4, 0, 1.5], [6, 12, 1], [8, 0, 1.5], [10, 12, 1], [12, 0, 1.5], [14, 12, 1]]
const BASS_BREAK: Pat = [[0, 0, 7], [8, 0, 5], [14, 7, 2]]
const BASS_BUILD: Pat = [[0, 0, 2], [4, 0, 2], [8, 0, 1], [10, 0, 1], [12, 0, 1], [13, 0, 1], [14, 0, 1], [15, 12, 1]]

// The hook: a 3-3-2 "tresillo" riff climbing E → F → G, answered on the G bar.
const HOOK: Pat[] = [
  [[0, 76, 2], [3, 74, 2], [6, 72, 3], [10, 74, 2], [12, 76, 3]],
  [[0, 77, 2], [3, 76, 2], [6, 72, 3], [10, 76, 2], [12, 77, 3]],
  [[0, 79, 2], [3, 76, 2], [6, 72, 3], [10, 76, 2], [12, 79, 3]],
  [[0, 74, 3], [3, 71, 3], [6, 74, 2], [8, 79, 6]],
  [[0, 81, 2], [3, 79, 2], [6, 76, 3], [10, 79, 2], [12, 81, 3]],
  [[0, 81, 2], [3, 79, 2], [6, 77, 3], [10, 79, 2], [12, 81, 3]],
  [[0, 79, 2], [3, 76, 2], [6, 72, 3], [10, 74, 2], [12, 76, 3]],
  [[0, 74, 3], [3, 76, 3], [6, 74, 2], [8, 71, 6]],
]
const BREAK_MEL: Pat[] = [
  [[0, 76, 7], [8, 72, 7]],
  [[0, 77, 7], [8, 72, 7]],
  [[0, 79, 7], [8, 76, 7]],
]

/** a chord tone 3–7 semitones under the melody note, for the second-time-through harmony */
function harmony(m: number, ch: Chord): number {
  const pcs = ch.tones.map((t) => t % 12)
  for (let d = 3; d <= 7; d++) if (pcs.includes((((m - d) % 12) + 12) % 12)) return m - d
  return m - 4
}

function melodyAt(bar: number): Pat | undefined {
  const sec = sectionOf(bar)
  if (sec === 'hook') return HOOK[bar - 10]
  if (sec === 'hook2') return HOOK[bar - 30]
  if (sec === 'break') return BREAK_MEL[bar - 18]
  return undefined
}

// ---------- the synth ----------
export class Synth {
  readonly ac: AudioContext
  /** music bus (goes through the "miss" muffle filter) */
  readonly music: GainNode
  /** train / crowd / door sounds */
  readonly fx: GainNode
  private master: GainNode
  private muffleF: BiquadFilterNode
  private noise: AudioBuffer
  private send: GainNode
  private rumble: GainNode | null = null
  private air: GainNode | null = null
  private loops: AudioBufferSourceNode[] = []
  private closed = false

  constructor() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ac = new AC({ latencyHint: 'interactive' })
    this.ac = ac
    this.master = ac.createGain()
    this.master.gain.value = 0.85
    this.master.connect(ac.destination)
    const comp = ac.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 10
    comp.ratio.value = 4
    comp.attack.value = 0.004
    comp.release.value = 0.2
    comp.connect(this.master)
    this.muffleF = this.filt('lowpass', 20000, 0.7)
    this.muffleF.connect(comp)
    this.music = ac.createGain()
    this.music.gain.value = 0.8
    this.music.connect(this.muffleF)
    this.fx = ac.createGain()
    this.fx.gain.value = 0.9
    this.fx.connect(comp)
    // white noise, 3 s
    const len = Math.floor(ac.sampleRate * 3)
    this.noise = ac.createBuffer(1, len, ac.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    // dotted-8th echo for the lead
    this.send = ac.createGain()
    this.send.gain.value = 0.2
    const dl = ac.createDelay(1)
    dl.delayTime.value = STEP * 3
    const fb = ac.createGain()
    fb.gain.value = 0.28
    const dlf = this.filt('lowpass', 2300)
    this.send.connect(dl)
    dl.connect(dlf)
    dlf.connect(fb)
    fb.connect(dl)
    dlf.connect(this.music)
  }

  setMuted(m: boolean) {
    if (this.closed) return
    this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ac.currentTime, 0.05)
  }

  close() {
    if (this.closed) return
    this.closed = true
    for (const l of this.loops) {
      try {
        l.stop()
      } catch {
        /* already stopped */
      }
    }
    this.ac.close().catch(() => {})
  }

  // ---------- helpers ----------
  private osc(type: OscillatorType, f: number, t: number) {
    const o = this.ac.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    return o
  }
  private filt(type: BiquadFilterType, f: number, q = 0.7) {
    const b = this.ac.createBiquadFilter()
    b.type = type
    b.frequency.value = f
    b.Q.value = q
    return b
  }
  private gain(v: number) {
    const g = this.ac.createGain()
    g.gain.value = v
    return g
  }
  /** filtered noise hit with an exponential decay */
  private burst(t: number, dur: number, vol: number, type: BiquadFilterType, f: number, q = 0.8, dest: AudioNode = this.music) {
    const src = this.ac.createBufferSource()
    src.buffer = this.noise
    const fl = this.filt(type, f, q)
    const g = this.ac.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(fl).connect(g).connect(dest)
    src.start(t, Math.random() * 2, dur + 0.05)
  }
  /** pitched blip with an exponential decay */
  private blip(t: number, type: OscillatorType, f0: number, f1: number, glide: number, vol: number, dur: number, dest: AudioNode = this.music) {
    const o = this.osc(type, f0, t)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glide)
    const g = this.ac.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(dest)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  // ---------- drums ----------
  kick(t: number, v = 1) {
    const o = this.osc('sine', 155, t)
    o.frequency.exponentialRampToValueAtTime(55, t + 0.1)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.35)
    const g = this.ac.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.9 * v, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42)
    o.connect(g).connect(this.music)
    o.start(t)
    o.stop(t + 0.45)
    this.blip(t, 'triangle', 240, 90, 0.05, 0.3 * v, 0.08) // knock for laptop speakers
    this.burst(t, 0.015, 0.12 * v, 'highpass', 3000)
  }
  clap(t: number, v = 1) {
    this.burst(t, 0.012, 0.42 * v, 'bandpass', 1250, 1.4)
    this.burst(t + 0.011, 0.012, 0.38 * v, 'bandpass', 1350, 1.4)
    this.burst(t + 0.022, 0.014, 0.36 * v, 'bandpass', 1200, 1.4)
    this.burst(t + 0.03, 0.18, 0.3 * v, 'bandpass', 1100, 0.9)
    this.blip(t, 'triangle', 215, 160, 0.08, 0.2 * v, 0.11)
  }
  snare(t: number, v = 1) {
    this.burst(t, 0.09, 0.3 * v, 'bandpass', 1800, 0.7)
    this.burst(t, 0.04, 0.18 * v, 'highpass', 5000)
    this.blip(t, 'triangle', 200, 170, 0.05, 0.16 * v, 0.07)
  }
  hat(t: number, v = 1, open = false) {
    this.burst(t, open ? 0.26 : 0.04, (open ? 0.09 : 0.08) * v, 'highpass', open ? 6800 : 8200)
  }
  crash(t: number, v = 1) {
    this.burst(t, 1.5, 0.14 * v, 'highpass', 4800)
    this.burst(t, 0.5, 0.07 * v, 'bandpass', 3200, 0.6)
  }
  stick(t: number, v = 1) {
    this.blip(t, 'sine', 1750, 1650, 0.03, 0.22 * v, 0.06)
    this.burst(t, 0.01, 0.12 * v, 'highpass', 4000)
  }

  // ---------- tonal ----------
  bass(t: number, m: number, dur: number, v = 1) {
    const f = mtof(m)
    const o1 = this.osc('sawtooth', f, t)
    const o2 = this.osc('square', f / 2, t)
    const sub = this.gain(0.45)
    const lp = this.filt('lowpass', 260, 6)
    lp.frequency.setValueAtTime(260, t)
    lp.frequency.exponentialRampToValueAtTime(300 + 1300 * v, t + 0.012)
    lp.frequency.exponentialRampToValueAtTime(420, t + 0.2)
    const g = this.ac.createGain()
    const pk = 0.26 * v
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(pk, t + 0.006)
    g.gain.setTargetAtTime(pk * 0.7, t + 0.01, 0.1)
    g.gain.setTargetAtTime(0, t + dur, 0.025)
    o1.connect(lp)
    o2.connect(sub).connect(lp)
    lp.connect(g).connect(this.music)
    o1.start(t)
    o2.start(t)
    o1.stop(t + dur + 0.2)
    o2.stop(t + dur + 0.2)
  }
  lead(t: number, m: number, dur: number, v = 1, cutoff = 3400) {
    const f = mtof(m)
    const o1 = this.osc('square', f, t)
    const o2 = this.osc('sawtooth', f, t)
    o2.detune.value = 9
    const lfo = this.osc('sine', 5.6, t)
    const depth = this.ac.createGain()
    depth.gain.setValueAtTime(0, t)
    depth.gain.linearRampToValueAtTime(14, t + Math.min(0.3, dur))
    lfo.connect(depth)
    depth.connect(o1.detune)
    depth.connect(o2.detune)
    const half = this.gain(0.5)
    const lp = this.filt('lowpass', cutoff, 1.2)
    const g = this.ac.createGain()
    const pk = 0.11 * v
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(pk, t + 0.012)
    g.gain.setTargetAtTime(pk * 0.72, t + 0.02, 0.09)
    g.gain.setTargetAtTime(0, t + dur, 0.04)
    o1.connect(lp)
    o2.connect(half).connect(lp)
    lp.connect(g)
    g.connect(this.music)
    g.connect(this.send)
    for (const o of [o1, o2, lfo]) {
      o.start(t)
      o.stop(t + dur + 0.3)
    }
  }
  /** short "house piano" chord */
  stab(t: number, notes: number[], v = 1, dur = 0.22) {
    const g = this.ac.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.065 * v, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    const hp = this.filt('highpass', 180)
    hp.connect(g).connect(this.music)
    for (const m of notes) {
      const f = mtof(m)
      const o = this.osc('triangle', f, t)
      const o2 = this.osc('sine', f * 2, t)
      const g2 = this.gain(0.3)
      o.connect(hp)
      o2.connect(g2).connect(hp)
      o.start(t)
      o2.start(t)
      o.stop(t + dur + 0.05)
      o2.stop(t + dur + 0.05)
    }
  }
  pad(t: number, notes: number[], dur: number, v = 1) {
    const lp = this.filt('lowpass', 1100, 0.5)
    const g = this.ac.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.setTargetAtTime(0.045 * v, t, 0.12)
    g.gain.setTargetAtTime(0, t + dur, 0.2)
    lp.connect(g).connect(this.music)
    for (const m of notes) {
      for (const det of [-7, 7]) {
        const o = this.osc('sawtooth', mtof(m), t)
        o.detune.value = det
        o.connect(lp)
        o.start(t)
        o.stop(t + dur + 1.2)
      }
    }
  }
  /** the classic hip-hop air horn: BWAP BWAP BWAP BWAAAAP */
  horn(t: number, v = 1) {
    const blasts: [number, number][] = [[0, 0.1], [0.15, 0.1], [0.3, 0.1], [0.45, 0.62]]
    for (const [dt, len] of blasts) {
      const t0 = t + dt
      const hp = this.filt('highpass', 280)
      const lp = this.filt('lowpass', 2400, 1.4)
      const g = this.ac.createGain()
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(0.085 * v, t0 + 0.012)
      g.gain.setTargetAtTime(0, t0 + len, 0.03)
      hp.connect(lp).connect(g).connect(this.music)
      for (const [mul, det] of [[1, -14], [1, 6], [1.5, 0], [2, 9]]) {
        const o = this.osc('sawtooth', 440 * mul * 0.94, t0)
        o.frequency.exponentialRampToValueAtTime(440 * mul, t0 + 0.05)
        o.detune.value = det
        o.connect(hp)
        o.start(t0)
        o.stop(t0 + len + 0.25)
      }
    }
  }
  riser(t: number, dur: number, v = 1) {
    const src = this.ac.createBufferSource()
    src.buffer = this.noise
    const bp = this.filt('bandpass', 350, 2.5)
    bp.frequency.setValueAtTime(350, t)
    bp.frequency.exponentialRampToValueAtTime(6000, t + dur)
    const g = this.ac.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.14 * v, t + dur * 0.95)
    g.gain.linearRampToValueAtTime(0, t + dur)
    src.connect(bp).connect(g).connect(this.music)
    src.start(t, 0, dur + 0.02)
  }

  // ---------- world sounds ----------
  /** riders cheering: a jittery wash of voices plus a couple of "woo"s */
  crowd(t: number, dur = 1.6, v = 1) {
    const layers: [number, number, number][] = [[750, 0.9, 0.07], [1450, 1.2, 0.05], [2600, 1.5, 0.028]]
    for (const [f, q, vol] of layers) {
      const src = this.ac.createBufferSource()
      src.buffer = this.noise
      const bp = this.filt('bandpass', f, q)
      const am = this.gain(0.6)
      const lfo = this.osc('sine', 6 + Math.random() * 5, t)
      const lg = this.gain(0.4)
      lfo.connect(lg).connect(am.gain)
      const g = this.ac.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.setTargetAtTime(vol * v, t, 0.08)
      g.gain.setTargetAtTime(0, t + dur * 0.55, dur * 0.22)
      src.connect(bp).connect(am).connect(g).connect(this.fx)
      src.start(t, Math.random(), dur + 0.6)
      lfo.start(t)
      lfo.stop(t + dur + 0.6)
    }
    for (let i = 0; i < 3; i++) {
      const t0 = t + 0.08 + Math.random() * 0.7
      const o = this.osc('sine', 900 + Math.random() * 300, t0)
      o.frequency.linearRampToValueAtTime(1500 + Math.random() * 400, t0 + 0.16)
      o.frequency.linearRampToValueAtTime(1150, t0 + 0.42)
      const g = this.ac.createGain()
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(0.022 * v, t0 + 0.05)
      g.gain.linearRampToValueAtTime(0, t0 + 0.45)
      o.connect(g).connect(this.fx)
      o.start(t0)
      o.stop(t0 + 0.5)
    }
  }
  doorSlide(t: number, dur = 0.55) {
    const src = this.ac.createBufferSource()
    src.buffer = this.noise
    const lp = this.filt('lowpass', 1100, 0.8)
    const g = this.ac.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.07, t + dur * 0.3)
    g.gain.linearRampToValueAtTime(0, t + dur)
    src.connect(lp).connect(g).connect(this.fx)
    src.start(t, Math.random(), dur + 0.05)
    this.blip(t, 'sawtooth', 110, 95, dur, 0.025, dur, this.fx)
  }
  thunk(t: number) {
    this.blip(t, 'sine', 95, 48, 0.2, 0.35, 0.28, this.fx)
    this.burst(t, 0.09, 0.22, 'lowpass', 500, 0.8, this.fx)
  }
  hiss(t: number) {
    this.burst(t, 0.75, 0.05, 'highpass', 2600, 0.7, this.fx)
  }
  clack(t: number, v = 1) {
    for (const dt of [0, 0.11]) {
      this.burst(t + dt, 0.06, 0.2 * v, 'lowpass', 280, 1, this.fx)
      this.blip(t + dt, 'sine', 80, 60, 0.06, 0.12 * v, 0.09, this.fx)
    }
  }
  /** continuous rail rumble + air rush; loudness follows the train speed */
  startRumble() {
    if (this.rumble) return
    const mk = (type: BiquadFilterType, f: number, q: number) => {
      const src = this.ac.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      const fl = this.filt(type, f, q)
      const g = this.gain(0)
      src.connect(fl).connect(g).connect(this.fx)
      src.start()
      this.loops.push(src)
      return g
    }
    this.rumble = mk('lowpass', 140, 0.8)
    this.air = mk('bandpass', 520, 0.6)
  }
  setRumble(speed01: number, quiet: boolean) {
    if (!this.rumble || !this.air || this.closed) return
    const t = this.ac.currentTime
    this.rumble.gain.setTargetAtTime(0.012 + speed01 * (quiet ? 0.09 : 0.2), t, 0.25)
    this.air.gain.setTargetAtTime(speed01 * (quiet ? 0.01 : 0.028), t, 0.25)
  }
  /** a quick lowpass dip on the music — the "you lost them" womp on a miss */
  muffle() {
    const f = this.muffleF.frequency
    const t = this.ac.currentTime
    f.cancelScheduledValues(t)
    f.setValueAtTime(Math.max(1500, Math.min(20000, f.value)), t)
    f.exponentialRampToValueAtTime(1500, t + 0.03)
    f.exponentialRampToValueAtTime(20000, t + 0.5)
  }
}

// ---------- the arrangement ----------
const has = (a: readonly number[], s: number) => a.includes(s)

/** Schedule everything that sounds on global 16th step `g` (step 0 = bar 0, beat 1) at audio time `t`. */
function playStep(syn: Synth, g: number, t: number) {
  const bar = Math.floor(g / 16)
  const s = g - bar * 16
  const ch = chordAt(bar, s)
  const bass = (pat: Pat, v = 1) => {
    for (const [st, iv, len] of pat) if (st === s) syn.bass(t, ch.root + iv, len * STEP * 0.9, v)
  }
  const lead = (mel: Pat | undefined, harm: boolean, cutoff = 3400, v = 1) => {
    if (!mel) return
    for (const [st, m, len] of mel) {
      if (st !== s) continue
      syn.lead(t, m, len * STEP * 0.95, v, cutoff)
      if (harm) syn.lead(t, harmony(m, ch), len * STEP * 0.95, v * 0.62, cutoff * 0.8)
    }
  }
  switch (sectionOf(bar)) {
    case 'countin':
      if (s % 4 === 0) syn.stick(t, s === 0 ? 1 : 0.75)
      if (s === 0) syn.riser(t, BAR - 0.02, 0.7)
      if (s >= 12) syn.snare(t, 0.3 + (s - 12) * 0.18)
      return
    case 'intro':
      if (s === 0 && bar === 0) {
        syn.crash(t, 1.1)
        syn.horn(t)
      }
      if (has([0, 8, 10], s)) syn.kick(t)
      if (s === 4 || s === 12) syn.clap(t)
      if (s % 2 === 0) syn.hat(t, s % 4 === 2 ? 1 : 0.55)
      if (bar === 1) bass(BASS_VERSE)
      return
    case 'verse':
      if (s === 0 && bar === 2) syn.crash(t)
      if (has([0, 8, 10], s)) syn.kick(t)
      if (s === 4 || s === 12) syn.clap(t)
      if (s % 2 === 0) syn.hat(t, s % 4 === 2 ? 1 : 0.55)
      if (s === 7 || s === 15) syn.hat(t, 0.32)
      bass(BASS_VERSE)
      if (s === 6 || s === 14) syn.stab(t, ch.tones, 0.9)
      return
    case 'hook':
      if (s === 0 && (bar === 10 || bar === 14)) syn.crash(t)
      if (s % 4 === 0) syn.kick(t)
      if (s === 4 || s === 12) syn.clap(t)
      if (s % 4 === 2) syn.hat(t, 0.9, true)
      else if (s % 4 === 0) syn.hat(t, 0.5)
      bass(BASS_HOOK, 0.9)
      if (s === 0) syn.pad(t, ch.tones, BAR * 0.95, 0.8)
      lead(melodyAt(bar), false)
      return
    case 'break':
      if (s === 4 || s === 12) syn.clap(t, 0.9)
      if (s === 0) syn.pad(t, ch.tones, BAR, 1)
      bass(BASS_BREAK, 0.8)
      lead(melodyAt(bar), false, 1000, 0.9)
      return
    case 'build':
      if (s === 0 || s === 8) syn.kick(t, 0.9)
      if (has([0, 2, 4, 6, 8, 10, 12, 13, 14, 15], s)) syn.snare(t, 0.35 + s * 0.04)
      if (s === 0) syn.riser(t, BAR, 1)
      bass(BASS_BUILD, 0.85)
      return
    case 'verse2':
      if (s === 0 && (bar === 22 || bar === 26)) syn.crash(t)
      if (s === 0 && bar === 22) syn.horn(t)
      if (has([0, 3, 8, 10], s)) syn.kick(t)
      if (s === 4 || s === 12) syn.clap(t)
      if (s === 7 || s === 15) syn.snare(t, 0.16)
      syn.hat(t, s % 2 === 0 ? (s % 4 === 2 ? 1 : 0.6) : 0.3)
      bass(BASS_VERSE)
      if (s % 4 === 2) syn.stab(t, ch.tones, 0.85)
      return
    case 'hook2':
      if (s === 0 && (bar === 30 || bar === 34)) syn.crash(t)
      if (s % 4 === 0) syn.kick(t)
      if (s === 4 || s === 12) syn.clap(t)
      if (s % 4 === 2) syn.hat(t, 0.9, true)
      else syn.hat(t, s % 2 ? 0.3 : 0.5)
      bass(BASS_HOOK)
      if (s === 0) syn.pad(t, ch.tones, BAR * 0.95, 0.9)
      lead(melodyAt(bar), true)
      if (s === 6 || s === 14) syn.stab(t, ch.tones, 0.6)
      return
    case 'outro': {
      const hit = has([0, 3, 6, 8, 11, 14], s)
      if (hit) {
        syn.kick(t)
        syn.stab(t, ch.tones, 1.2, 0.3)
        syn.bass(t, ch.root, STEP * 1.6)
        if (s === 0) syn.crash(t)
      }
      if (s === 4 || s === 12) syn.clap(t)
      if (!hit && s % 2 === 0) syn.hat(t, 0.6)
      return
    }
    case 'end':
      if (s === 0) {
        syn.kick(t, 1.1)
        syn.crash(t, 1.2)
        syn.horn(t, 0.9)
        syn.stab(t, [...ch.tones, 69, 72], 1.3, 1.6)
        syn.bass(t, ch.root, BAR * 0.8)
        syn.pad(t, ch.tones, BAR * 0.7, 1.2)
      }
      return
  }
}

/** Lookahead scheduler: call `pump()` often (every frame + a timer); it schedules the next ~0.35 s of steps. */
export class Song {
  /** global step to schedule next (starts at the count-in bar) */
  private next = -16
  readonly syn: Synth
  /** AudioContext time of bar 0, beat 1 */
  readonly start: number
  constructor(syn: Synth, start: number) {
    this.syn = syn
    this.start = start
  }
  pump(lookahead = 0.35) {
    const now = this.syn.ac.currentTime
    while (this.next < SONG_STEPS) {
      const t = this.start + this.next * STEP
      if (t > now + lookahead) break
      if (t > now - 0.04) playStep(this.syn, this.next, t) // skip anything we fell behind on (no flams)
      this.next++
    }
  }
}

// ---------- the chart ----------
export interface ChartNote {
  /** seconds after bar 0 */
  t: number
  /** global 16th step */
  step: number
  lane: number
  jump: boolean
}

function easySteps(bar: number): number[] {
  switch (sectionOf(bar)) {
    case 'intro':
      return bar === 1 ? [0, 8] : []
    case 'verse':
      return (bar - 2) % 4 === 3 ? [0, 8] : [0, 4, 8, 12]
    case 'hook':
      return (bar - 10) % 4 === 3 ? [0, 8] : [0, 6, 12]
    case 'break':
      return [4, 12]
    case 'build':
      return [0, 4, 8, 12, 14]
    case 'verse2':
      return (bar - 22) % 2 === 1 ? [0, 4, 8, 10, 12] : [0, 4, 8, 12]
    case 'hook2':
      return (bar - 30) % 4 === 3 ? [0, 8, 12] : [0, 6, 8, 12]
    case 'outro':
      return [0, 6, 8, 14]
    case 'end':
      return [0]
    default:
      return []
  }
}

function hardSteps(bar: number): number[] {
  switch (sectionOf(bar)) {
    case 'intro':
      return bar === 1 ? [0, 4, 8, 10, 12] : []
    case 'verse':
      return (bar - 2) % 4 === 3 ? [0, 3, 6, 8, 10, 12, 14] : [0, 3, 6, 8, 10, 12]
    case 'hook':
      return (bar - 10) % 4 === 3 ? [0, 3, 6, 8, 12, 14] : [0, 3, 6, 8, 10, 12]
    case 'break':
      return [0, 4, 8, 12]
    case 'build':
      return [0, 2, 4, 6, 8, 10, 12, 13, 14, 15]
    case 'verse2':
      return [0, 3, 6, 8, 10, 12, 14]
    case 'hook2':
      return (bar - 30) % 4 === 3 ? [0, 3, 6, 8, 12, 14] : [0, 3, 6, 8, 10, 12, 14]
    case 'outro':
      return [0, 3, 6, 8, 11, 14]
    case 'end':
      return [0]
    default:
      return []
  }
}

const JUMP_BARS: Record<Difficulty, number[]> = { easy: [22, 39], hard: [2, 10, 22, 26, 30, 34, 38, 39] }

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Build the (deterministic) chart. Lanes follow the melody's contour in the hooks, alternate sides elsewhere. */
export function buildChart(diff: Difficulty): ChartNote[] {
  const rnd = mulberry32(diff === 'easy' ? 0x51ee7 : 0x5a0e7)
  const jumps = new Set(JUMP_BARS[diff].map((b) => b * 16))
  const out: ChartNote[] = []
  let prev = 1
  let prevStep = -99
  let prevPitch: number | undefined
  let same = 0
  let flip = false
  let sweepRev = false
  for (let bar = 0; bar < SONG_BARS; bar++) {
    const mel = melodyAt(bar)
    for (const s of diff === 'easy' ? easySteps(bar) : hardSteps(bar)) {
      const g = bar * 16 + s
      const t = g * STEP
      if (jumps.has(g)) {
        const pair = flip ? [1, 2] : [0, 3]
        flip = !flip
        for (const lane of pair) out.push({ t, step: g, lane, jump: true })
        prev = pair[rnd() < 0.5 ? 0 : 1]
        prevStep = g
        prevPitch = undefined
        same = 0
        continue
      }
      const pitch = mel?.find(([st]) => st === s)?.[1]
      const gap = g - prevStep
      const sweep = diff === 'hard' && sectionOf(bar) === 'build' && s >= 12 // a ←↑↓→ run into the drop
      let lane: number
      if (sweep) {
        if (s === 12) sweepRev = prev === 0
        lane = sweepRev ? 15 - s : s - 12
      } else if (pitch !== undefined && prevPitch !== undefined && gap <= 8) {
        const d = pitch - prevPitch
        lane = d > 0 ? prev + (d >= 5 ? 2 : 1) : d < 0 ? prev - (d <= -5 ? 2 : 1) : 3 - prev
        if (lane > 3) lane = 6 - lane
        if (lane < 0) lane = -lane
      } else {
        lane = (prev <= 1 ? 2 : 0) + (rnd() < 0.5 ? 0 : 1)
      }
      if (sweep) same = 0
      else if (lane === prev) {
        if (gap <= 2 || same >= 1) {
          lane = (lane + 1 + Math.floor(rnd() * 3)) % 4
          same = 0
        } else same++
      } else same = 0
      out.push({ t, step: g, lane, jump: false })
      prev = lane
      prevStep = g
      prevPitch = pitch
    }
  }
  return out
}
