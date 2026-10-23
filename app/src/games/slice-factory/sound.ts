// Slice Factory's own WebAudio: kitchen foley + a little tarantella loop that speeds up with the belt.
// (The shared ctx.sfx covers dings, coins and the register; these are the sounds it doesn't have.)

const NOTE = (m: number) => 440 * 2 ** ((m - 69) / 12)

// 6/8 tarantella in A minor, two 8-bar phrases. step = eighth note; [midi, length in eighths]
const MELODY: Record<number, [number, number]> = {
  // A: Am Am E7 E7 Am Dm E7 Am
  0: [69, 2], 2: [72, 1], 3: [76, 2], 5: [72, 1],
  6: [81, 2], 8: [80, 1], 9: [81, 1], 10: [76, 1], 11: [72, 1],
  12: [71, 2], 14: [74, 1], 15: [80, 2], 17: [76, 1],
  18: [83, 2], 20: [81, 1], 21: [80, 1], 22: [76, 1], 23: [74, 1],
  24: [72, 2], 26: [76, 1], 27: [81, 2], 29: [76, 1],
  30: [77, 2], 32: [76, 1], 33: [74, 1], 34: [72, 1], 35: [74, 1],
  36: [76, 2], 38: [71, 1], 39: [68, 2], 41: [71, 1],
  42: [69, 2], 44: [64, 1], 45: [69, 1], 46: [71, 1], 47: [68, 1],
  // B: C G7 C Am Dm Am E7 Am
  48: [76, 2], 50: [79, 1], 51: [84, 2], 53: [79, 1],
  54: [83, 2], 56: [79, 1], 57: [77, 1], 58: [74, 1], 59: [71, 1],
  60: [72, 2], 62: [76, 1], 63: [79, 2], 65: [76, 1],
  66: [81, 3], 69: [76, 3],
  72: [77, 2], 74: [81, 1], 75: [77, 2], 77: [74, 1],
  78: [76, 2], 80: [72, 1], 81: [69, 2], 83: [72, 1],
  84: [71, 2], 86: [74, 1], 87: [80, 1], 88: [76, 1], 89: [71, 1],
  90: [69, 3], 93: [71, 1], 94: [72, 1], 95: [68, 1],
}
const STEPS = 96
const BARS = ['Am', 'Am', 'E7', 'E7', 'Am', 'Dm', 'E7', 'Am', 'C', 'G7', 'C', 'Am', 'Dm', 'Am', 'E7', 'Am']
const CHORD: Record<string, { bass: [number, number]; stab: number[] }> = {
  Am: { bass: [45, 40], stab: [57, 60, 64] },
  E7: { bass: [40, 47], stab: [56, 59, 62] },
  Dm: { bass: [38, 45], stab: [57, 62, 65] },
  C: { bass: [36, 43], stab: [55, 60, 64] },
  G7: { bass: [43, 38], stab: [55, 59, 65] },
}

export class SliceSound {
  private ac: AudioContext | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private step = 0
  private nextT = 0
  private eighth = 60 / 112 / 3
  private music = false
  /** false when the player muted the game */
  readonly enabled: boolean
  musicWanted = true

  constructor(enabled: boolean) {
    this.enabled = enabled
  }

  /** Create / resume the context. Call from a user gesture. */
  wake() {
    if (!this.enabled) return
    if (!this.ac) {
      const ac = new AudioContext()
      this.ac = ac
      this.master = ac.createGain()
      this.master.gain.value = 0.9
      this.master.connect(ac.destination)
      this.musicBus = ac.createGain()
      this.musicBus.gain.value = 0.5
      this.musicBus.connect(this.master)
      const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      this.noiseBuf = buf
    }
    if (this.ac.state === 'suspended') this.ac.resume()
  }

  pause() {
    if (this.ac && this.ac.state === 'running') this.ac.suspend()
  }

  dispose() {
    this.music = false
    const ac = this.ac
    this.ac = null
    if (ac) ac.close().catch(() => {})
  }

  // ---------- building blocks ----------
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number, dest?: AudioNode) {
    const ac = this.ac
    if (!ac) return
    const t = ac.currentTime + delay
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(dest ?? this.master!)
    o.start(t)
    o.stop(t + dur + 0.03)
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, freq: number, delay = 0, q = 1, sweepTo?: number) {
    const ac = this.ac
    if (!ac || !this.noiseBuf) return
    const t = ac.currentTime + delay
    const src = ac.createBufferSource()
    src.buffer = this.noiseBuf
    const f = ac.createBiquadFilter()
    f.type = filter
    f.frequency.setValueAtTime(freq, t)
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
    f.Q.value = q
    const g = ac.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.master!)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.03)
  }

  // ---------- kitchen foley ----------
  /** a wet little "splurt" from a squeeze bottle */
  squirt() {
    this.noise(0.08, 0.07, 'bandpass', 700 + Math.random() * 500, 0, 1.4)
    this.tone(240 + Math.random() * 60, 0.07, 'sine', 0.05, 0, 110)
  }
  /** topping lands on the pie; pitch differs per topping */
  plop(pitch = 1) {
    this.tone(560 * pitch, 0.09, 'sine', 0.11, 0, 230 * pitch)
    this.noise(0.04, 0.03, 'lowpass', 1200)
  }
  /** grabbing something from a bin */
  pickup() {
    this.tone(660, 0.05, 'triangle', 0.05, 0, 990)
  }
  /** dough slaps onto the belt */
  flop() {
    this.noise(0.13, 0.16, 'lowpass', 420)
    this.tone(150, 0.16, 'sine', 0.14, 0, 55)
  }
  /** shredded cheese raining down */
  sprinkle() {
    for (let i = 0; i < 8; i++) this.noise(0.035, 0.035, 'highpass', 3500 + Math.random() * 2500, i * 0.028)
  }
  /** a pie whooshing into the oven */
  whoosh() {
    this.noise(0.35, 0.07, 'bandpass', 300, 0, 0.9, 1500)
  }
  sizzle() {
    this.noise(0.55, 0.05, 'highpass', 2600)
    this.noise(0.3, 0.03, 'bandpass', 5000, 0.12, 2)
  }
  /** sauce coverage complete */
  smear() {
    this.tone(392, 0.09, 'triangle', 0.07)
    this.tone(523, 0.14, 'triangle', 0.07, 0.07)
  }
  /** sad trombone: wah, wah, wah, waaah */
  sad() {
    const ac = this.ac
    if (!ac) return
    const notes: [number, number][] = [
      [311, 0.26],
      [294, 0.26],
      [277, 0.26],
      [262, 0.9],
    ]
    let t = ac.currentTime + 0.02
    for (let i = 0; i < notes.length; i++) {
      const [f, d] = notes[i]
      const o = ac.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(f, t)
      o.frequency.linearRampToValueAtTime(f * 0.97, t + d)
      if (i === notes.length - 1) {
        const lfo = ac.createOscillator()
        const lg = ac.createGain()
        lfo.frequency.value = 6
        lg.gain.value = 7
        lfo.connect(lg).connect(o.frequency)
        lfo.start(t + 0.2)
        lfo.stop(t + d)
      }
      const filt = ac.createBiquadFilter()
      filt.type = 'lowpass'
      filt.frequency.setValueAtTime(500, t)
      filt.frequency.linearRampToValueAtTime(1500, t + 0.08)
      filt.frequency.linearRampToValueAtTime(700, t + d)
      const g = ac.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.04)
      g.gain.setValueAtTime(0.09, t + d * 0.7)
      g.gain.exponentialRampToValueAtTime(0.0001, t + d)
      o.connect(filt).connect(g).connect(this.master!)
      o.start(t)
      o.stop(t + d + 0.05)
      t += d + 0.04
    }
  }
  /** sparkly arpeggio for dessert time */
  sparkle() {
    ;[76, 79, 83, 88, 91].forEach((m, i) => this.tone(NOTE(m), 0.25, 'triangle', 0.06, i * 0.06))
  }
  /** the pie's done: the oven's bell (two strikes of a little brass bell, with its metallic overtone) */
  ovenDing() {
    for (const [at, f] of [[0, 1568], [0.16, 2093]] as const) {
      this.tone(f, 0.7, 'sine', 0.075, at)
      this.tone(f * 2.76, 0.25, 'sine', 0.012, at)
      this.tone(f * 5.4, 0.12, 'sine', 0.005, at)
    }
  }
  /** a burnt pie: the crust crackles and the smoke alarm chirps twice (every New York kitchen's smoke alarm) */
  burnt() {
    for (let i = 0; i < 10; i++) this.noise(0.02, 0.05 + Math.random() * 0.03, 'highpass', 2200 + Math.random() * 2400, Math.random() * 0.3)
    this.tone(3150, 0.07, 'square', 0.018, 0.34)
    this.tone(3150, 0.07, 'square', 0.018, 0.5)
  }
  /** the pie lands in its box: a cardboard thunk */
  box() {
    this.tone(190, 0.1, 'triangle', 0.08, 0, 140)
    this.noise(0.06, 0.05, 'bandpass', 850, 0, 1.2)
  }

  // ---------- music ----------
  startMusic() {
    if (!this.ac || this.music || !this.musicWanted) return
    this.music = true
    this.step = 0
    this.nextT = this.ac.currentTime + 0.1
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(0.5, this.ac.currentTime, 0.05)
  }

  stopMusic(fade = 0.3) {
    if (!this.music) return
    this.music = false
    if (this.ac && this.musicBus) {
      const t = this.ac.currentTime
      this.musicBus.gain.cancelScheduledValues(t)
      this.musicBus.gain.setTargetAtTime(0.0001, t, fade / 3)
      // restore the bus after the tail has faded so a later start is audible
      const bus = this.musicBus
      setTimeout(() => {
        if (!this.music && this.ac) bus.gain.setValueAtTime(0.5, this.ac.currentTime)
      }, fade * 1000 + 600)
    }
  }

  get musicPlaying() {
    return this.music
  }

  /** dotted-quarter beats per minute */
  setTempo(bpm: number) {
    this.eighth = 60 / bpm / 3
  }

  /** schedule notes a little ahead; call every frame */
  tick() {
    const ac = this.ac
    if (!ac || !this.music || ac.state !== 'running') return
    if (this.nextT < ac.currentTime - 0.2) this.nextT = ac.currentTime + 0.05 // fell behind (tab was hidden)
    const until = ac.currentTime + 0.18
    while (this.nextT < until) {
      this.playStep(this.step, this.nextT)
      this.nextT += this.eighth
      this.step = (this.step + 1) % STEPS
    }
  }

  private playStep(step: number, t: number) {
    const ac = this.ac!
    const bus = this.musicBus!
    const e = this.eighth
    const chord = CHORD[BARS[Math.floor(step / 6)]]
    const inBar = step % 6
    const note = (m: number, at: number, dur: number, type: OscillatorType, vol: number, detune = 0) => {
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.type = type
      o.frequency.value = NOTE(m)
      o.detune.value = detune
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(vol, at + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      o.connect(g).connect(bus)
      o.start(at)
      o.stop(at + dur + 0.02)
    }
    // oom-pah-pah
    if (inBar === 0 || inBar === 3) note(chord.bass[inBar === 0 ? 0 : 1], t, e * 2.2, 'triangle', 0.11)
    else for (const m of chord.stab) note(m, t, e * 0.55, 'square', 0.011)
    // mandolin-ish melody: two slightly detuned plucks
    const mel = MELODY[step]
    if (mel) {
      const [m, len] = mel
      const dur = Math.max(0.12, len * e * 0.92)
      note(m, t, dur, 'square', 0.022, -7)
      note(m, t, dur, 'triangle', 0.05, 6)
      if (len >= 2) note(m, t + e, Math.min(dur, e * 0.9), 'triangle', 0.025, 4) // tremolo re-pluck
    }
  }
}
