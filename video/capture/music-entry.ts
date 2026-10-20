/**
 * The trailer soundtrack, rendered offline in a browser (OfflineAudioContext): "Sidewalk Shuffle", an original bouncy
 * theme in the spirit of Club Penguin's music (cheerful cartoon pop; none of its melodies), on the trailer's beat grid
 * (video/src/timeline.ts), plus the game's own sound effects where things land on screen.
 *
 * The band, all synthesized here (no samples):
 *  - the tune on a soft, plucky square-wave lead, doubled by a marimba an octave up
 *  - a bass that hops between octaves, and little chord stabs on the offbeats (that's the bounce)
 *  - kick, claps and shuffled hi-hats, a tick-tock woodblock in the intro, a tambourine in the last chorus
 *  - a slide whistle up into each drop, and a "ta-da" on the end card
 * Bundled with esbuild and run by video/capture/music.py, which writes video/public/audio/trailer.wav.
 */
import { BPM, FPS, SFX, SONG_BARS, TOTAL, type SfxKind } from '../src/timeline'

const RATE = 48000
const BEAT_S = 60 / BPM
const BAR_S = 4 * BEAT_S
/** where an offbeat eighth lands within its beat: 0.5 is straight, more is a shuffle (the skip in the step) */
const SWING = 0.62
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12)

// the same "random" every render
let seed = 0x2f6b3a1
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
const jitter = (ms: number) => ((rnd() * 2 - 1) * ms) / 1000

// ---------------------------------------------------------------- the song
type Section = 'intro' | 'chorus' | 'break' | 'final'
type Chord = 'C' | 'Am' | 'F' | 'G'
/** each bar of the trailer: its part of the song and its chord (one chorus bar changes chord halfway, `then`) */
const BARS: { sec: Section; i: number; chord: Chord; then?: Chord }[] = [
  // 0:00 the group chat: marimba and a tick-tock woodblock, then a slide whistle up into...
  { sec: 'intro', i: 0, chord: 'F' },
  { sec: 'intro', i: 1, chord: 'G' },
  // 0:05 ...the logo: the whole band and the tune
  ...(['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'C'] as Chord[]).map((chord, i) => ({ sec: 'chorus' as Section, i, chord, then: i === 6 ? ('G' as Chord) : undefined })),
  // 0:24 the breakdown (the apartment): bass, marimba and claps, building back up
  { sec: 'break', i: 0, chord: 'Am' },
  { sec: 'break', i: 1, chord: 'G' },
  // 0:29 the last chorus, ending on G so the C under the end card feels like home
  ...(['C', 'Am', 'F', 'G'] as Chord[]).map((chord, i) => ({ sec: 'final' as Section, i, chord })),
]
if (BARS.length !== SONG_BARS) throw new Error('the song and timeline.ts disagree')

const ROOT: Record<Chord, number> = { C: 36, Am: 33, F: 41, G: 43 } // C2 A1 F2 G2
const STAB: Record<Chord, number[]> = { C: [64, 67, 72], Am: [64, 69, 72], F: [65, 69, 72], G: [62, 67, 71] }

/** the tune, one bar per chorus bar: [eighth-note position in the bar, MIDI note, length in eighths] */
const TUNE: [number, number, number][][] = [
  [[0, 64, 1], [1, 67, 1], [2, 72, 2], [4, 67, 1], [5, 64, 1], [6, 67, 2]], // C
  [[0, 69, 1], [1, 72, 1], [2, 76, 2], [4, 74, 1], [5, 72, 1], [6, 69, 2]], // Am
  [[0, 65, 1], [1, 69, 1], [2, 72, 1], [3, 74, 1], [4, 72, 2], [6, 69, 2]], // F
  [[0, 67, 1], [1, 71, 1], [2, 74, 2], [4, 72, 1], [5, 71, 1], [6, 67, 1]], // G
  [[0, 64, 1], [1, 67, 1], [2, 72, 2], [4, 67, 1], [5, 64, 1], [6, 67, 2]], // C again
  [[0, 69, 1], [1, 72, 1], [2, 76, 2], [4, 79, 2], [6, 76, 2]], // Am, reaching up
  [[0, 77, 1], [1, 76, 1], [2, 74, 1], [3, 72, 1], [4, 74, 1], [5, 72, 1], [6, 71, 1], [7, 67, 1]], // F then G, running down
  [[0, 72, 2], [2, 67, 1], [3, 64, 1], [4, 60, 2]], // C, home
]
/** the intro's two bars on the marimba (F, then G before the slide whistle takes over) */
const INTRO: [number, number, number][][] = [
  [[0, 65, 1], [1, 69, 1], [2, 72, 2], [5, 69, 1], [6, 72, 2]],
  [[0, 67, 1], [1, 71, 1], [2, 74, 2]],
]
/** a diatonic third above, in C major (the last chorus sings in harmony) */
const SCALE = [0, 2, 4, 5, 7, 9, 11]
function third(m: number) {
  const pc = ((m % 12) + 12) % 12
  const i = SCALE.indexOf(pc)
  if (i < 0) return m + 4
  const j = i + 2
  return m - pc + SCALE[j % 7] + (j >= 7 ? 12 : 0)
}

// ---------------------------------------------------------------- instruments (sample-accurate, in plain JS)
/** a damped sine, added into `out` (a cheap rotation instead of Math.sin per sample) */
function partial(out: Float32Array, f: number, amp: number, tau: number, phase = 0) {
  if (f >= RATE / 2 - 200) return
  const w = (2 * Math.PI * f) / RATE
  const c = 2 * Math.cos(w)
  let s1 = Math.sin(phase - w)
  let s2 = Math.sin(phase - 2 * w)
  let e = amp
  const decay = Math.exp(-1 / (tau * RATE))
  for (let i = 0; i < out.length && e > 1e-6; i++) {
    const s = c * s1 - s2
    s2 = s1
    s1 = s
    out[i] += s * e
    e *= decay
  }
}

/** white noise shaped by an envelope (attack, then exponential decay) */
function burst(secs: number, attack: number, tau: number): Float32Array {
  const n = Math.round(secs * RATE)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    out[i] = (rnd() * 2 - 1) * (t < attack ? t / attack : Math.exp(-(t - attack) / tau))
  }
  return out
}

/** a marimba: a wooden bar's fundamental, its 4th and 10th-ish overtones dying fast, and the mallet's knock */
const marimbaCache = new Map<number, Float32Array>()
function marimba(midi: number): Float32Array {
  const hit = marimbaCache.get(midi)
  if (hit) return hit
  const f0 = hz(midi)
  const out = new Float32Array(Math.round(1.8 * RATE))
  const reg = Math.pow(440 / f0, 0.5) // low bars ring longer
  for (const [r, amp, t60] of [
    [1, 1, 1.1],
    [3.98, 0.3, 0.22],
    [9.3, 0.06, 0.07],
  ])
    partial(out, f0 * r, amp, (t60 * reg) / 6.91, rnd() * 6.283)
  let lp = 0
  for (let i = 0; i < 0.006 * RATE; i++) {
    lp += 0.35 * (rnd() * 2 - 1 - lp)
    out[i] += lp * 0.22 * (1 - i / (0.006 * RATE))
  }
  for (let i = 0; i < 48; i++) out[i] *= i / 48
  marimbaCache.set(midi, out)
  return out
}

/** a woodblock "tok" (two pitches make the tick-tock) */
function woodblock(f: number): Float32Array {
  const out = burst(0.1, 0.0004, 0.003)
  for (let i = 0; i < out.length; i++) out[i] *= 0.45
  partial(out, f, 0.8, 0.02)
  partial(out, f * 2.71, 0.22, 0.008)
  return out
}

/** a round, short kick */
function kick(): Float32Array {
  const n = Math.round(0.35 * RATE)
  const out = new Float32Array(n)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    ph += (2 * Math.PI * (50 + 115 * Math.exp(-t / 0.032))) / RATE
    out[i] = Math.sin(ph) * Math.exp(-t / 0.11) + (t < 0.003 ? (rnd() * 2 - 1) * 0.25 * (1 - t / 0.003) : 0)
  }
  return out
}

/** a snare for the build: a crack of noise and a little body */
function snare(): Float32Array {
  const out = burst(0.22, 0.001, 0.07)
  partial(out, 190, 0.5, 0.05)
  return out
}

/** one person's clap: three fast bursts as the hands meet, then the room */
function clap(): Float32Array {
  const n = Math.round(0.25 * RATE)
  const out = new Float32Array(n)
  const hits = [0, 0.0085 + jitter(1), 0.0175 + jitter(1.5)]
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    let e = 0
    for (const h of hits) if (t >= h) e += Math.exp(-(t - h) / 0.0019)
    if (t >= 0.02) e += 0.5 * Math.exp(-(t - 0.02) / 0.04)
    out[i] = (rnd() * 2 - 1) * e
  }
  return out
}

// ---------------------------------------------------------------- the mix
function render(mute: string[] = []): Promise<AudioBuffer> {
  const seconds = TOTAL / FPS
  const a = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE)
  const buffers = new WeakMap<Float32Array, AudioBuffer>()
  const buffer = (data: Float32Array) => {
    let b = buffers.get(data)
    if (!b) {
      b = a.createBuffer(1, data.length, RATE)
      b.getChannelData(0).set(data)
      buffers.set(data, b)
    }
    return b
  }

  const master = a.createGain()
  master.gain.value = 0.7
  const hp = a.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 38
  const air = a.createBiquadFilter()
  air.type = 'highshelf'
  air.frequency.value = 4500
  air.gain.value = 2.5
  const comp = a.createDynamicsCompressor()
  comp.threshold.value = -15
  comp.knee.value = 8
  comp.ratio.value = 2.5
  comp.attack.value = 0.01
  comp.release.value = 0.15
  master.connect(hp).connect(air).connect(comp).connect(a.destination)

  // a small, bright room
  const verb = a.createConvolver()
  const len = Math.round(1.4 * RATE)
  const ir = a.createBuffer(2, len, RATE)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / RATE
      lp += (0.9 * Math.exp(-t / 0.6) + 0.08) * (rnd() * 2 - 1 - lp)
      d[i] = t < 0.008 ? 0 : lp * Math.exp(-t / 0.22)
    }
    for (const [ms, gn] of [[7, 0.45], [12, 0.35], [19, 0.28], [26, 0.2]]) d[Math.round(((ms + ch * 2) / 1000) * RATE)] += gn * (ch ? -1 : 1)
  }
  verb.buffer = ir
  const verbIn = a.createGain()
  verbIn.gain.value = 0.3
  verbIn.connect(verb).connect(master)

  const filter = (type: BiquadFilterType, freq: number, gain = 0, Q = 0.8) => {
    const f = a.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.gain.value = gain
    f.Q.value = Q
    return f
  }
  const bus = (name: string, vol: number, send: number, ...chain: AudioNode[]) => {
    const g = a.createGain()
    g.gain.value = mute.includes(name) ? 0 : vol
    let head: AudioNode = g
    for (const node of chain) head = head.connect(node) as AudioNode
    head.connect(master)
    if (send) {
      const s = a.createGain()
      s.gain.value = send
      head.connect(s).connect(verbIn)
    }
    return g
  }
  const leadBus = bus('lead', 1.6, 0.2, filter('highpass', 180), filter('lowpass', 7000, 0, 0.5))
  const marimbaBus = bus('marimba', 0.6, 0.28, filter('highpass', 200))
  const bassBus = bus('bass', 0.63, 0.03, filter('highpass', 45), filter('lowpass', 1500, 0, 0.6))
  const stabBus = bus('stabs', 1, 0.15, filter('highpass', 300), filter('lowpass', 3500, 0, 0.6))
  const drumBus = bus('drums', 0.71, 0.08)
  const fxBus = bus('fx', 0.54, 0.3)

  /** play a mono buffer at time t through `dest`, panned */
  const play = (data: Float32Array, t: number, dest: AudioNode, vol: number, pan = 0, ...chain: AudioNode[]) => {
    const s = a.createBufferSource()
    s.buffer = buffer(data)
    const g = a.createGain()
    g.gain.value = vol
    const p = a.createStereoPanner()
    p.pan.value = pan
    let head: AudioNode = s
    for (const node of chain) head = head.connect(node) as AudioNode
    head.connect(g).connect(p).connect(dest)
    s.start(Math.max(0, t))
  }

  /** one oscillator note: a quick attack, a pluck down to a held level, a short release; optionally a closing filter */
  function tone(
    dest: AudioNode,
    t: number,
    midi: number,
    dur: number,
    o: { type: OscillatorType; vol: number; hold?: number; release?: number; cutoff?: number; cutoffEnd?: number; vibrato?: boolean; pan?: number },
  ) {
    const osc = a.createOscillator()
    osc.type = o.type
    osc.frequency.setValueAtTime(hz(midi), t)
    const rel = o.release ?? 0.06
    const peak = o.vol
    const held = peak * (o.hold ?? 0.6)
    const decayEnd = t + Math.max(0.015, Math.min(0.12, dur * 0.7))
    const off = Math.max(decayEnd, t + dur)
    const g = a.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005)
    g.gain.exponentialRampToValueAtTime(held, decayEnd)
    g.gain.setValueAtTime(held, off)
    g.gain.exponentialRampToValueAtTime(0.0001, off + rel)
    let head: AudioNode = osc
    if (o.cutoff) {
      const f = filter('lowpass', o.cutoff, 0, 0.7)
      f.frequency.setValueAtTime(o.cutoff, t)
      if (o.cutoffEnd) f.frequency.exponentialRampToValueAtTime(o.cutoffEnd, t + 0.25)
      osc.connect(f)
      head = f
    }
    if (o.vibrato && dur > 0.3) {
      const lfo = a.createOscillator()
      lfo.frequency.value = 5.5
      const depth = a.createGain()
      depth.gain.setValueAtTime(0, t)
      depth.gain.linearRampToValueAtTime(14, t + 0.3)
      lfo.connect(depth).connect(osc.detune)
      lfo.start(t)
      lfo.stop(off + rel + 0.05)
    }
    const p = a.createStereoPanner()
    p.pan.value = o.pan ?? 0
    head.connect(g).connect(p).connect(dest)
    osc.start(t)
    osc.stop(off + rel + 0.05)
  }

  // ---------- the players ----------
  /** the lead: a soft square for the pluck and a triangle for the body */
  function lead(midi: number, t: number, dur: number, vel = 1, pan = 0) {
    tone(leadBus, t, midi, dur, { type: 'square', vol: 0.06 * vel, cutoff: 6000, cutoffEnd: 2800, vibrato: true, pan })
    tone(leadBus, t, midi, dur, { type: 'triangle', vol: 0.05 * vel, vibrato: true, pan })
  }
  const marimbaNote = (midi: number, t: number, vel: number, pan = 0.2) => play(marimba(midi), t + jitter(2), marimbaBus, 0.5 * vel, pan)
  /** the bass: a round triangle with a little square bite, plucked */
  function bassNote(midi: number, t: number, dur: number, vel = 1) {
    tone(bassBus, t, midi, dur, { type: 'triangle', vol: 0.32 * vel, hold: 0.75, release: 0.04 })
    tone(bassBus, t, midi, dur, { type: 'square', vol: 0.05 * vel, hold: 0.5, release: 0.04, cutoff: 1100, cutoffEnd: 320 })
  }
  /** an offbeat chord stab, short and light */
  const stab = (chord: Chord, t: number, pan: number) =>
    STAB[chord].forEach((m) => tone(stabBus, t + jitter(2), m, 0.09, { type: 'square', vol: 0.08, hold: 0.5, release: 0.05, cutoff: 2600, cutoffEnd: 1000, pan }))
  const kickAt = (t: number, vel = 1) => play(kick(), t, drumBus, 0.75 * vel)
  function claps(t: number, vel = 1) {
    ;[
      [-0.4, 1100],
      [0, 1400],
      [0.45, 1700],
    ].forEach(([pan, f]) => play(clap(), t + jitter(5), drumBus, 0.3 * vel, pan, filter('bandpass', f, 0, 0.9), filter('highpass', 500)))
  }
  const hat = (t: number, vel: number) => play(burst(0.06, 0.0005, 0.012), t + jitter(2), drumBus, 0.15 * vel, 0.3, filter('highpass', 7200))
  const openHat = (t: number) => play(burst(0.3, 0.001, 0.08), t, drumBus, 0.06, 0.3, filter('highpass', 6400))
  const tamb = (t: number, vel: number) => {
    const b = burst(0.3, 0.002, 0.07)
    play(b, t + jitter(3), drumBus, 0.08 * vel, -0.4, filter('bandpass', 7400, 0, 3))
    play(b, t + jitter(3), drumBus, 0.06 * vel, -0.4, filter('bandpass', 10200, 0, 3))
  }
  const snareAt = (t: number, vel: number) => play(snare(), t, drumBus, 0.35 * vel, 0.05, filter('highpass', 400))
  const tok = (t: number, high: boolean, vel = 1) => play(woodblock(high ? 1250 : 900), t + jitter(2), drumBus, 0.32 * vel, high ? 0.25 : -0.25)
  function crash(t: number, vol = 0.24) {
    play(burst(2.6, 0.003, 0.6), t, fxBus, vol, 0.1, filter('highpass', 4200))
    play(burst(0.5, 0.002, 0.12), t, fxBus, vol * 0.5, 0.1, filter('bandpass', 2800, 0, 1))
  }
  /** a slide whistle, up into a drop */
  function slideWhistle(t: number, dur: number, from = 540, to = 1560) {
    const o = a.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(from, t)
    o.frequency.exponentialRampToValueAtTime(to, t + dur)
    const lfo = a.createOscillator()
    lfo.frequency.value = 6.5
    const depth = a.createGain()
    depth.gain.value = 16
    lfo.connect(depth).connect(o.detune)
    const g = a.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.07)
    g.gain.setValueAtTime(0.09, t + dur - 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05)
    o.connect(g).connect(fxBus)
    for (const n of [o, lfo]) {
      n.start(t)
      n.stop(t + dur + 0.1)
    }
    // the breath through it
    play(burst(dur, dur * 0.4, dur), t, fxBus, 0.02, 0, filter('bandpass', 1400, 0, 1.2))
  }

  // ---------- the song, bar by bar ----------
  BARS.forEach(({ sec, i, chord, then }, bar) => {
    const t0 = bar * BAR_S
    /** an eighth-note position in this bar → seconds, offbeats shuffled */
    const T = (pos: number) => t0 + (Math.floor(pos / 2) + (pos % 2 ? SWING : 0)) * BEAT_S
    const eighths = (n: number) => (n * BEAT_S) / 2
    const chordAt = (pos: number) => (then && pos >= 4 ? then : chord)

    // the tune
    if (sec === 'chorus' || sec === 'final') {
      for (const [pos, m, l] of TUNE[i]) {
        const t = T(pos) + jitter(2)
        const dur = eighths(l) * 0.8
        lead(m, t, dur, sec === 'final' ? 1.05 : 1)
        marimbaNote(m + 12, t, sec === 'final' ? 0.7 : 0.55)
        // the last chorus sings in thirds
        if (sec === 'final') lead(third(m), t, dur, 0.5, 0.25)
      }
    } else if (sec === 'intro') {
      for (const [pos, m] of INTRO[i]) marimbaNote(m + 12, T(pos), 0.7, 0)
    } else {
      // the breakdown: the chord, spelled out on the marimba
      const [r, m3, m5] = chord === 'Am' ? [69, 72, 76] : [67, 71, 74]
      ;[r, m3, m5, m3, r, m3, m5, m3].forEach((m, pos) => marimbaNote(m, T(pos), pos % 2 ? 0.55 : 0.75, 0))
    }

    // the bass: hopping between octaves (the fifth for a lift near the end of the bar)
    if (sec === 'chorus' || sec === 'final') {
      for (let pos = 0; pos < 8; pos++) {
        const r = ROOT[chordAt(pos)]
        const m = pos === 6 ? r + 7 : pos % 2 ? r + 12 : r
        bassNote(m, T(pos), eighths(1) * 0.7, pos % 2 ? 0.8 : 1)
      }
    } else if (sec === 'intro' && i === 1) {
      // a pickup into the drop: G, then B, walking up to the C
      bassNote(43, T(4), eighths(1) * 0.9, 0.8)
      bassNote(47, T(6), eighths(1) * 0.9, 0.9)
    } else if (sec === 'break') {
      const r = ROOT[chord]
      bassNote(r, T(0), eighths(3), 0.6)
      bassNote(r + 12, T(4), eighths(2), 0.5)
      if (i === 1) bassNote(r + 4, T(6), eighths(2), 0.6)
    }

    // the offbeat stabs
    if (sec === 'chorus' || sec === 'final') for (const pos of [1, 3, 5, 7]) stab(chordAt(pos), T(pos), pos % 4 === 1 ? -0.3 : 0.3)

    // drums
    if (sec === 'intro') {
      // tick-tock
      for (let pos = 0; pos < 8; pos += 2) tok(T(pos), pos % 4 === 2, i === 0 ? 0.7 : 0.85)
      if (i === 1) slideWhistle(T(4), BEAT_S * 2 - 0.02)
    }
    if (sec === 'chorus' || sec === 'final') {
      kickAt(T(0))
      kickAt(T(4), 0.95)
      if (sec === 'final' || i % 2 === 1) kickAt(T(5), 0.55)
      claps(T(2))
      claps(T(6))
      for (let pos = 0; pos < 8; pos++) hat(T(pos), pos % 2 ? 1 : 0.6)
      if (i % 2 === 1) openHat(T(7))
      if (sec === 'final') for (const pos of [1, 3, 5, 7]) tamb(T(pos), 0.9)
    }
    if (sec === 'break') {
      claps(T(2), 0.6)
      claps(T(6), 0.6)
      if (i === 0) kickAt(T(0), 0.8)
      else {
        // building back up: snare on eighths, then sixteenths, louder and louder, and the whistle again
        for (let k = 0; k < 4; k++) snareAt(T(0) + (k * BEAT_S) / 2, 0.35 + 0.05 * k)
        for (let k = 0; k < 8; k++) snareAt(T(4) + (k * BEAT_S) / 4, 0.6 + 0.05 * k)
        slideWhistle(T(4), BEAT_S * 2 - 0.02)
      }
    }
  })
  // the drops: the logo, the last chorus
  crash(2 * BAR_S)
  crash(12 * BAR_S, 0.22)

  // ---------- the end card: ta-da, on C ----------
  const fin = SONG_BARS * BAR_S
  kickAt(fin, 1.1)
  claps(fin)
  crash(fin, 0.28)
  bassNote(36, fin, 1.6, 1)
  for (const m of [60, 64, 67, 72]) tone(leadBus, fin, m, 0.6, { type: 'square', vol: 0.03, hold: 0.7, release: 0.5, cutoff: 3000, cutoffEnd: 1200 })
  ;[72, 76, 79, 84].forEach((m, k) => marimbaNote(m, fin + k * 0.05, 0.8, 0))
  // and a little sparkle as the Play now button appears
  ;[79, 84, 88, 91].forEach((m, k) => marimbaNote(m, fin + 2 * BEAT_S + k * (BEAT_S / 2), 0.6 - 0.08 * k, 0.15))

  // ---------- sound effects (the recipes from app/src/audio.ts, in the song's key) ----------
  const beep = (t: number, freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) => {
    const o = a.createOscillator()
    const g = a.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(fxBus)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
  /** a city cab's horn: two blasts of two slightly rough tones */
  const honk = (t: number, [m1, m2]: [number, number]) => {
    for (const [start, dur] of [
      [0, 0.12],
      [0.2, 0.2],
    ]) {
      const g = a.createGain()
      g.gain.setValueAtTime(0.0001, t + start)
      g.gain.exponentialRampToValueAtTime(0.09, t + start + 0.012)
      g.gain.setValueAtTime(0.09, t + start + dur - 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur)
      g.connect(filter('bandpass', 1100, 0, 0.7)).connect(fxBus)
      for (const m of [m1, m2]) {
        const o = a.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = hz(m)
        o.connect(g)
        o.start(t + start)
        o.stop(t + start + dur + 0.05)
      }
    }
  }
  const fx: Record<SfxKind, (t: number, notes?: [number, number]) => void> = {
    pop: (t) => beep(t, 523, 0.12, 'sine', 0.2, 1046),
    click: (t) => beep(t, 880, 0.06, 'triangle', 0.12),
    coin: (t) => {
      beep(t, hz(83), 0.08, 'square', 0.07)
      beep(t + 0.08, hz(88), 0.25, 'square', 0.07)
    },
    stamp: (t) => [72, 76, 79, 84].forEach((m, k) => beep(t + k * 0.09, hz(m), k === 3 ? 0.4 : 0.12, 'triangle', 0.13)),
    thud: (t) => {
      beep(t, 170, 0.14, 'sine', 0.3, 60)
      play(burst(0.08, 0.001, 0.02), t, fxBus, 0.12, 0, filter('lowpass', 900))
    },
    whoosh: (t) => {
      const f = filter('bandpass', 500, 0, 1.2)
      f.frequency.setValueAtTime(500, t)
      f.frequency.exponentialRampToValueAtTime(2400, t + 0.3)
      f.frequency.exponentialRampToValueAtTime(700, t + 0.5)
      play(burst(0.55, 0.22, 0.09), t, fxBus, 0.3, 0, f)
    },
    honk: (t, notes) => honk(t, notes ?? [69, 72]),
  }
  for (const c of SFX) fx[c.kind]((c.beat * 60) / BPM, c.notes)

  // the very end fades out
  master.gain.setValueAtTime(0.7, seconds - 1.4)
  master.gain.linearRampToValueAtTime(0, seconds)
  return a.startRendering()
}

/** 16-bit PCM WAV, base64 */
function wav(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels
  const n = buf.length
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2))
  const str = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  data.setUint32(4, 36 + n * ch * 2, true)
  str(8, 'WAVEfmt ')
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true)
  data.setUint16(22, ch, true)
  data.setUint32(24, buf.sampleRate, true)
  data.setUint32(28, buf.sampleRate * ch * 2, true)
  data.setUint16(32, ch * 2, true)
  data.setUint16(34, 16, true)
  str(36, 'data')
  data.setUint32(40, n * ch * 2, true)
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i))
  let o = 44
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]))
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      o += 2
    }
  const bytes = new Uint8Array(data.buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** `mute`: buses to leave out (lead, marimba, bass, stabs, drums, fx), for listening to (or measuring) parts alone */
;(window as unknown as { renderTrailerAudio: (mute?: string[]) => Promise<string> }).renderTrailerAudio = async (mute) => wav(await render(mute))
