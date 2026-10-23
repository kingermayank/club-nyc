/**
 * The Broadway Theater's pit orchestra: a tiny synth that plays one show's song on the shared WebAudio clock.
 * Every song is an original composition (written for Club NYC, in the style of a musical-theater number).
 *
 * Songs are written as text so they're easy to read and change:
 *   melody "A4:2 C5:2 E5:3 D5:1 | C5:2 B4:2 A4:4"  (note:length in eighth notes, r = rest, | = bar line)
 *   chords "Am F Dm E7"                             (one chord per bar; "F/E7" splits a bar in half)
 * The song only plays while the show is on screen (never in the background), follows the sound toggle, and
 * can be stopped or jumped past at any moment.
 */
import { audioCtx, onMute, isMuted } from '../../audio'

export type Style = 'organ' | 'safari' | 'swing'

export interface Song {
  bpm: number
  style: Style
  /** one chord per bar, the whole song */
  chords: string
  /** the tune, the whole song */
  melody: string
  /** swing the off-beat eighths (0 = straight, 0.33 = triplet swing) */
  swing?: number
}

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const midiOf = (n: string): number => {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n)
  if (!m) throw new Error(`bad note ${n}`)
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
}
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12)

interface Note {
  /** in eighth notes from the top of the song */
  at: number
  midi: number
  len: number
}
export function parseMelody(src: string): Note[] {
  const out: Note[] = []
  let bar = 0
  for (const b of src.split('|')) {
    let pos = 0
    for (const tok of b.trim().split(/\s+/).filter(Boolean)) {
      const [n, l] = tok.split(':')
      const len = Number(l)
      if (n !== 'r') out.push({ at: bar * 8 + pos, midi: midiOf(n), len })
      pos += len
    }
    bar++
  }
  return out
}

interface Chord {
  at: number
  len: number
  root: number
  tones: number[]
}
const QUALITY: Record<string, number[]> = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6], sus: [0, 5, 7], '6': [0, 4, 7, 9] }
export function parseChords(src: string): Chord[] {
  const out: Chord[] = []
  src
    .trim()
    .split(/\s+/)
    .forEach((bar, i) => {
      const parts = bar.split('/')
      parts.forEach((c, j) => {
        const m = /^([A-G][#b]?)(.*)$/.exec(c)!
        const root = midiOf(m[1] + '3')
        const len = 8 / parts.length
        out.push({ at: i * 8 + j * len, len, root, tones: (QUALITY[m[2]] ?? QUALITY['']).map((x) => x) })
      })
    })
  return out
}

/** seconds per eighth note */
export const eighth = (s: Song) => 60 / s.bpm / 2
export const songBars = (s: Song) => s.chords.trim().split(/\s+/).length
export const songSeconds = (s: Song) => songBars(s) * 8 * eighth(s)

// ---------- instruments ----------
let white: AudioBuffer | null = null
function noiseBuf(a: AudioContext) {
  if (!white || white.sampleRate !== a.sampleRate) {
    white = a.createBuffer(1, a.sampleRate, a.sampleRate)
    const d = white.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return white
}
let organWave: PeriodicWave | null = null
function organ(a: AudioContext) {
  if (!organWave || (organWave as unknown as { ctx?: AudioContext }).ctx !== a) {
    // drawbars: fundamental, octave, twelfth, two octaves (a soft theater organ)
    const real = new Float32Array([0, 1, 0.55, 0.32, 0.25, 0, 0.12, 0, 0.08])
    organWave = a.createPeriodicWave(real, new Float32Array(real.length))
    ;(organWave as unknown as { ctx?: AudioContext }).ctx = a
  }
  return organWave
}

type Env = { a: number; d: number; s?: number; r?: number }
function voice(a: AudioContext, dest: AudioNode, f: number, t: number, len: number, vol: number, kind: OscillatorType | 'organ', env: Env, o: { detune?: number; vibrato?: number; lp?: number; lpEnv?: number } = {}) {
  const osc = a.createOscillator()
  if (kind === 'organ') osc.setPeriodicWave(organ(a))
  else osc.type = kind
  osc.frequency.setValueAtTime(f, t)
  if (o.detune) osc.detune.value = o.detune
  let node: AudioNode = osc
  if (o.vibrato) {
    const lfo = a.createOscillator()
    const g = a.createGain()
    lfo.frequency.value = 5.2
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(f * o.vibrato, t + Math.min(0.35, len * 0.5))
    lfo.connect(g).connect(osc.frequency)
    lfo.start(t)
    lfo.stop(t + len + (env.r ?? 0.1) + 0.05)
  }
  if (o.lp) {
    const flt = a.createBiquadFilter()
    flt.type = 'lowpass'
    flt.Q.value = 0.8
    flt.frequency.setValueAtTime(o.lp + (o.lpEnv ?? 0), t)
    if (o.lpEnv) flt.frequency.exponentialRampToValueAtTime(o.lp, t + 0.18)
    node.connect(flt)
    node = flt
  }
  const g = a.createGain()
  const sus = env.s ?? 0.7
  const r = env.r ?? 0.1
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + env.a)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * sus), t + env.a + env.d)
  g.gain.setValueAtTime(Math.max(0.0001, vol * sus), t + Math.max(env.a + env.d, len))
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(env.a + env.d, len) + r)
  node.connect(g).connect(dest)
  osc.start(t)
  osc.stop(t + Math.max(env.a + env.d, len) + r + 0.05)
}
function hit(a: AudioContext, dest: AudioNode, t: number, vol: number, o: { type?: BiquadFilterType; f: number; q?: number; dur: number }) {
  const src = a.createBufferSource()
  src.buffer = noiseBuf(a)
  const flt = a.createBiquadFilter()
  flt.type = o.type ?? 'bandpass'
  flt.frequency.value = o.f
  flt.Q.value = o.q ?? 0.8
  const g = a.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  src.connect(flt).connect(g).connect(dest)
  src.start(t, Math.random() * 0.5)
  src.stop(t + o.dur + 0.05)
}
function drum(a: AudioContext, dest: AudioNode, t: number, vol: number, from: number, to: number, dur: number) {
  const o = a.createOscillator()
  const g = a.createGain()
  o.frequency.setValueAtTime(from, t)
  o.frequency.exponentialRampToValueAtTime(to, t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(dest)
  o.start(t)
  o.stop(t + dur + 0.05)
}

// ---------- the player ----------
/** the sound toggle reaches whichever song is playing (one listener for the whole module) */
let muteHook: ((m: boolean) => void) | null = null
onMute((m) => muteHook?.(m))

export interface SongPlayer {
  /** call every frame with the song position (seconds) */
  tick(pos: number): void
  /** fade out and stop for good */
  stop(fade?: number): void
}

/**
 * Plays `song` following an outside clock (the show's): every frame `tick(pos)` schedules the next ~0.25 s.
 * Jumping the clock forward simply skips what's in between. Silent (but still keeping time) while muted.
 */
export function songPlayer(song: Song): SongPlayer {
  const melody = parseMelody(song.melody)
  const chords = parseChords(song.chords)
  const e = eighth(song)
  const total = songBars(song) * 8
  let done = 0 // eighths already scheduled
  let bus: GainNode | null = null
  let ctx: AudioContext | null = null
  let stopped = false
  const swingAt = (step: number) => (step % 2 === 1 ? (song.swing ?? 0) * e : 0)

  const ensureBus = (a: AudioContext) => {
    if (bus && ctx === a) return bus
    ctx = a
    bus = a.createGain()
    bus.gain.value = 0.62
    const comp = a.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 3
    bus.connect(comp).connect(a.destination)
    return bus
  }
  const offMute = (m: boolean) => {
    if (m && bus && ctx) {
      bus.gain.cancelScheduledValues(ctx.currentTime)
      bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05)
      bus = null // a fresh bus when the sound comes back
    }
  }
  muteHook = offMute

  /** everything that sounds at eighth `step`, at audio time `t` */
  const play = (a: AudioContext, out: AudioNode, step: number, t: number) => {
    const bar = Math.floor(step / 8)
    const inBar = step % 8
    const chord = chords.find((c) => step >= c.at && step < c.at + c.len)
    // melody (the "singer")
    for (const n of melody)
      if (n.at === step) {
        const len = n.len * e * 0.95
        if (song.style === 'organ') {
          voice(a, out, hz(n.midi), t, len, 0.075, 'triangle', { a: 0.04, d: 0.2, s: 0.8, r: 0.22 }, { vibrato: 0.012 })
          voice(a, out, hz(n.midi), t, len, 0.025, 'sawtooth', { a: 0.06, d: 0.2, s: 0.7, r: 0.2 }, { lp: 1600, detune: 6 })
        } else if (song.style === 'safari') {
          voice(a, out, hz(n.midi), t, len, 0.07, 'triangle', { a: 0.03, d: 0.15, s: 0.75, r: 0.18 }, { vibrato: 0.01 })
          voice(a, out, hz(n.midi + 12), t, Math.min(len, 0.25), 0.02, 'sine', { a: 0.005, d: 0.2, s: 0.2, r: 0.1 })
        } else {
          voice(a, out, hz(n.midi), t, len, 0.065, 'square', { a: 0.02, d: 0.12, s: 0.6, r: 0.12 }, { lp: 2200, lpEnv: 1500, vibrato: 0.008 })
          voice(a, out, hz(n.midi), t, len, 0.04, 'triangle', { a: 0.02, d: 0.1, s: 0.8, r: 0.12 })
        }
      }
    if (!chord) return
    const first = step === chord.at
    const tones = chord.tones.map((x) => chord.root + 12 + x)
    if (song.style === 'organ') {
      // a held organ chord, a low bass note, a timpani on the downbeat
      if (first) {
        const len = chord.len * e
        tones.forEach((m) => voice(a, out, hz(m), t, len, 0.022, 'organ', { a: 0.12, d: 0.4, s: 0.85, r: 0.3 }))
        voice(a, out, hz(chord.root - 12), t, len, 0.06, 'sine', { a: 0.02, d: 0.3, s: 0.8, r: 0.2 })
        if (inBar === 0 && bar % 2 === 0) drum(a, out, t, 0.16, 95, 52, 0.7)
      }
      // a soft tremolo pulse on the off-beats
      if (inBar % 2 === 1) tones.slice(1, 3).forEach((m) => voice(a, out, hz(m + 12), t, e * 0.7, 0.008, 'sawtooth', { a: 0.01, d: 0.1, s: 0.5, r: 0.06 }, { lp: 1800 }))
    } else if (song.style === 'safari') {
      // a bright held pad, plucked marimba on the beat, hand drums and a shaker
      if (first) tones.forEach((m) => voice(a, out, hz(m), t, chord.len * e, 0.016, 'sawtooth', { a: 0.25, d: 0.4, s: 0.8, r: 0.4 }, { lp: 1500, detune: (m % 2) * 9 - 4 }))
      if (inBar % 2 === 0) voice(a, out, hz(tones[(inBar / 2) % tones.length] + 12), t, 0.2, 0.05, 'sine', { a: 0.004, d: 0.18, s: 0.05, r: 0.08 })
      if (inBar === 0 || inBar === 3 || inBar === 6) voice(a, out, hz(chord.root - 12), t, e * 1.6, 0.075, 'triangle', { a: 0.01, d: 0.25, s: 0.5, r: 0.1 })
      if (inBar === 0 || inBar === 4) drum(a, out, t, 0.14, 150, 70, 0.28)
      if (inBar === 3 || inBar === 6) drum(a, out, t, 0.08, 230, 140, 0.16)
      if (inBar === 7) drum(a, out, t, 0.06, 300, 200, 0.1)
      hit(a, out, t, inBar % 2 ? 0.016 : 0.025, { type: 'highpass', f: 6500, dur: 0.05 })
    } else {
      // swing: walking bass, piano comping, brass hits on 2 and 4, ride cymbal and a soft backbeat
      if (inBar % 2 === 0) {
        const walk = [0, 4, 7, 9][(inBar / 2) % 4]
        voice(a, out, hz(chord.root - 12 + walk), t, e * 1.8, 0.07, 'triangle', { a: 0.01, d: 0.2, s: 0.6, r: 0.08 })
        hit(a, out, t, 0.02, { type: 'highpass', f: 7000, q: 0.5, dur: 0.12 })
      } else hit(a, out, t, 0.012, { type: 'highpass', f: 8000, q: 0.5, dur: 0.06 })
      if (inBar === 2 || inBar === 6) {
        tones.forEach((m) => voice(a, out, hz(m), t, e * 0.9, 0.022, 'sawtooth', { a: 0.01, d: 0.12, s: 0.4, r: 0.1 }, { lp: 1400, lpEnv: 2200 }))
        hit(a, out, t, 0.05, { f: 1800, dur: 0.12 })
      }
      if (inBar === 0) drum(a, out, t, 0.12, 120, 50, 0.22)
      if (inBar === 5) tones.forEach((m) => voice(a, out, hz(m + 12), t, e * 0.6, 0.012, 'triangle', { a: 0.005, d: 0.1, s: 0.3, r: 0.05 }))
    }
  }

  return {
    tick(pos: number) {
      if (stopped) return
      const upTo = Math.min(total, Math.floor((pos + 0.25) / e) + 1)
      // jumped ahead (Skip) or the tab slept: don't play the backlog
      if (pos / e - done > 3) done = Math.max(done, Math.floor(pos / e))
      const a = !isMuted() ? audioCtx() : null
      while (done < upTo) {
        const step = done++
        if (!a) continue
        const at = a.currentTime + (step * e + swingAt(step) - pos)
        if (at < a.currentTime - 0.02) continue
        play(a, ensureBus(a), step, Math.max(a.currentTime, at))
      }
    },
    stop(fade = 0.6) {
      if (stopped) return
      stopped = true
      if (muteHook === offMute) muteHook = null
      if (bus && ctx) {
        bus.gain.cancelScheduledValues(ctx.currentTime)
        bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime)
        bus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fade)
        const b = bus
        setTimeout(() => b.disconnect(), fade * 1000 + 200)
      }
    },
  }
}
