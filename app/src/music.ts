/**
 * Club NYC Radio — a tiny step sequencer on WebAudio, so parties and the Times Square stage have real songs
 * without shipping audio files. Every track is an original composition.
 *
 * Tracks loop and can be started "as of" a wall-clock time, so everyone in the same party hears the same bar.
 * A track can also point at an audio file (`src`) — drop a licensed MP3 in public/music/ and it plays instead.
 */
import { isMuted } from './audio'

type Drum = 'kick' | 'snare' | 'clap' | 'hat' | 'open' | 'rim' | 'shaker'
interface Note {
  step: number
  midi: number
  len: number
}
export interface Track {
  id: string
  title: string
  /** fictional artist */
  by: string
  vibe: string
  emoji: string
  bpm: number
  /** 16th-note swing, 0..0.3 */
  swing?: number
  /** licensed audio drop-in (plays instead of the synth) */
  src?: string
  steps: number
  drums: Partial<Record<Drum, string>>
  bass: Note[]
  chords: Note[]
  lead: Note[]
  bassType: OscillatorType
  chordType: OscillatorType
  leadType: OscillatorType
  /** chord voice: short piano stabs or held pads */
  chordStyle: 'stab' | 'pad' | 'keys'
  crackle?: boolean
}

// ---------- a tiny notation ----------
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const midiOf = (n: string) => {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n)
  if (!m) throw new Error('bad note ' + n)
  return 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
}
/** "A4:4 C5:2 .:2 F4+A4+C5:8 |" — note(s):length in 16ths, '.' rests, '|' is decoration */
function seq(src: string): Note[] {
  const out: Note[] = []
  let step = 0
  for (const tok of src.split(/\s+/).filter((t) => t && t !== '|')) {
    const [name, len = '1'] = tok.split(':')
    const l = Number(len)
    if (name !== '.') for (const n of name.split('+')) out.push({ step, midi: midiOf(n), len: l })
    step += l
  }
  return out
}
/** drum lane: one char per 16th; x = hit, o = soft */
const lane = (bars: string[]) => bars.join('')
const rep = (s: string, n: number) => Array.from({ length: n }, () => s).join(' ')

// ---------- the tracks (all original) ----------
export const TRACKS: Track[] = [
  {
    id: 'empire-state-of-mine',
    title: 'Empire State of Mine',
    by: 'The Concrete Jungle Gym',
    vibe: 'big-city anthem',
    emoji: '🗽',
    bpm: 88,
    swing: 0.12,
    steps: 128,
    drums: {
      kick: lane(Array(8).fill('x......x..x.....')),
      snare: lane(Array(8).fill('....x.......x...')),
      hat: lane(Array(8).fill('x.x.x.x.x.x.x.xo')),
      open: lane(Array(8).fill('..............x.')),
    },
    bass: seq('F2:6 F2:2 F2:4 C3:4 | E2:6 E2:2 E2:4 G2:4 | D2:6 D2:2 D2:4 A2:4 | Bb1:6 Bb1:2 Bb1:4 F2:4 | F2:6 F2:2 F2:4 C3:4 | E2:6 E2:2 E2:4 G2:4 | Bb1:6 Bb1:2 Bb1:4 D2:4 | C2:6 C2:2 C2:4 E2:4'),
    chords: seq(
      'F3+A3+C4+F4:4 F3+A3+C4+F4:4 F3+A3+C4+F4:2 F3+A3+C4+F4:6 | E3+G3+C4+E4:4 E3+G3+C4+E4:4 E3+G3+C4+E4:2 E3+G3+C4+E4:6 | ' +
        'D3+A3+D4+F4:4 D3+A3+D4+F4:4 D3+A3+D4+F4:2 D3+A3+D4+F4:6 | Bb2+F3+Bb3+D4:4 Bb2+F3+Bb3+D4:4 Bb2+F3+Bb3+D4:2 Bb2+F3+Bb3+D4:6 | ' +
        'F3+A3+C4+F4:4 F3+A3+C4+F4:4 F3+A3+C4+F4:2 F3+A3+C4+F4:6 | E3+G3+C4+E4:4 E3+G3+C4+E4:4 E3+G3+C4+E4:2 E3+G3+C4+E4:6 | ' +
        'Bb2+F3+Bb3+D4:4 Bb2+F3+Bb3+D4:4 Bb2+F3+Bb3+D4:2 Bb2+F3+Bb3+D4:6 | C3+G3+C4+E4:4 C3+G3+C4+E4:4 C3+G3+C4+E4:2 C3+G3+C4+E4:6',
    ),
    lead: seq(
      'A4:4 C5:2 A4:2 G4:4 F4:4 | E4:2 G4:2 C5:6 .:2 G4:4 | A4:2 D5:4 C5:2 A4:4 F4:2 G4:2 | F4:6 D4:2 F4:2 G4:2 A4:4 | ' +
        'C5:4 A4:2 C5:2 F5:6 .:2 | E5:2 D5:2 C5:4 G4:4 C5:4 | D5:4 C5:2 Bb4:2 A4:2 G4:2 F4:4 | G4:4 A4:2 C5:2 E5:4 C5:4',
    ),
    bassType: 'triangle',
    chordType: 'triangle',
    leadType: 'square',
    chordStyle: 'keys',
  },
  {
    id: 'bodega-boogie',
    title: 'Bodega Boogie',
    by: 'Mango & the Chopped Cheeses',
    vibe: 'deli-counter funk',
    emoji: '🥪',
    bpm: 104,
    swing: 0.08,
    steps: 64,
    drums: {
      kick: lane(Array(4).fill('x..x....x..x....')),
      snare: lane(Array(4).fill('....x..o....x..o')),
      hat: lane(Array(4).fill('xoxoxoxoxoxoxoxo')),
    },
    bass: seq(rep('E2:3 E2:1 G2:2 A2:2 B2:2 A2:2 G2:2 D2:2 | A1:3 A1:1 C#2:2 E2:2 G2:2 E2:2 C#2:2 B1:2', 2)),
    chords: seq(rep('.:2 E3+G3+B3+D4:1 .:3 E3+G3+B3+D4:1 .:3 E3+G3+B3+D4:1 .:3 E3+G3+B3+D4:1 .:1 | .:2 A3+C#4+E4+G4:1 .:3 A3+C#4+E4+G4:1 .:3 A3+C#4+E4+G4:1 .:3 A3+C#4+E4+G4:1 .:1', 2)),
    lead: seq('B4:2 D5:2 E5:4 D5:2 B4:2 A4:4 | .:8 G4:2 A4:2 B4:4 | B4:2 D5:2 E5:4 G5:2 E5:2 D5:4 | E5:6 D5:2 B4:8'),
    bassType: 'sawtooth',
    chordType: 'square',
    leadType: 'square',
    chordStyle: 'stab',
  },
  {
    id: 'rooftop-sunset',
    title: 'Rooftop Sunset',
    by: 'Water Tower Lo-Fi',
    vibe: 'chill terrace hang',
    emoji: '🌇',
    bpm: 76,
    swing: 0.22,
    steps: 64,
    crackle: true,
    drums: {
      kick: lane(Array(4).fill('x.....x...x.....')),
      rim: lane(Array(4).fill('....x.......x...')),
      shaker: lane(Array(4).fill('..o...o...o...o.')),
    },
    bass: seq('F2:10 F2:6 | E2:10 E2:6 | D2:10 D2:6 | C2:10 C2:6'),
    chords: seq('F3+A3+C4+E4:16 | E3+G3+B3+D4:16 | D3+F3+A3+C4:16 | C3+E3+G3+B3:16'),
    lead: seq('.:2 A4:4 C5:4 E5:6 | .:4 D5:4 B4:8 | A4:6 .:2 F4:8 | .:2 E4:4 G4:4 B4:6'),
    bassType: 'sine',
    chordType: 'triangle',
    leadType: 'sine',
    chordStyle: 'pad',
  },
  {
    id: 'disco-54',
    title: 'Disco on 54th',
    by: 'The Mirrorball Pigeons',
    vibe: 'four-on-the-floor disco',
    emoji: '🪩',
    bpm: 120,
    steps: 64,
    drums: {
      kick: lane(Array(4).fill('x...x...x...x...')),
      clap: lane(Array(4).fill('....x.......x...')),
      open: lane(Array(4).fill('..x...x...x...x.')),
      hat: lane(Array(4).fill('x.x.x.x.x.x.x.x.')),
    },
    bass: seq(rep('A1:2 A2:2 A1:2 A2:2 A1:2 A2:2 A1:2 A2:2', 2) + ' ' + 'F1:2 F2:2 F1:2 F2:2 F1:2 F2:2 F1:2 F2:2 G1:2 G2:2 G1:2 G2:2 G1:2 G2:2 G1:2 G2:2'),
    chords: seq('A3+C4+E4:16 | A3+C4+E4:16 | F3+A3+C4:16 | G3+B3+D4:16'),
    lead: seq('E5:2 .:2 E5:2 D5:2 C5:4 A4:4 | C5:2 D5:2 E5:2 G5:2 E5:8 | F5:2 .:2 F5:2 E5:2 C5:4 A4:4 | B4:2 D5:2 G5:4 F5:4 D5:4'),
    bassType: 'square',
    chordType: 'sawtooth',
    leadType: 'triangle',
    chordStyle: 'pad',
  },
  {
    id: 'uptown-bounce',
    title: 'Uptown Bounce',
    by: 'MC Pretzel',
    vibe: 'subway-car hip-hop',
    emoji: '🚇',
    bpm: 94,
    swing: 0.16,
    steps: 64,
    drums: {
      kick: lane(Array(4).fill('x.....x.x.......')),
      snare: lane(Array(4).fill('....x.......x...')),
      hat: lane(Array(4).fill('x.xxx.x.x.xxx.x.')),
    },
    bass: seq('C2:6 C2:2 .:4 Eb2:4 | C2:6 C2:2 .:4 G1:4 | Ab1:6 Ab1:2 .:4 C2:4 | G1:6 G1:2 .:4 Bb1:4'),
    chords: seq('C4+Eb4+G4:2 .:6 C4+Eb4+G4:2 .:6 | C4+Eb4+G4:2 .:6 C4+Eb4+G4:2 .:6 | Ab3+C4+Eb4:2 .:6 Ab3+C4+Eb4:2 .:6 | G3+B3+D4:2 .:6 G3+B3+D4:2 .:6'),
    lead: seq('G5:2 G5:2 .:2 Eb5:2 .:2 C5:2 D5:4 | .:8 G5:2 F5:2 Eb5:4 | C5:2 C5:2 .:2 Eb5:2 .:2 F5:2 G5:4 | .:4 D5:4 B4:8'),
    bassType: 'sine',
    chordType: 'square',
    leadType: 'square',
    chordStyle: 'stab',
  },
]
export const TRACK: Record<string, Track> = Object.fromEntries(TRACKS.map((t) => [t.id, t]))

// ---------- synth ----------
let ac: AudioContext | null = null
let out: GainNode | null = null
function audio() {
  if (!ac) {
    ac = new AudioContext()
    const comp = ac.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.ratio.value = 3
    out = ac.createGain()
    out.gain.value = 0.55
    out.connect(comp).connect(ac.destination)
  }
  if (ac.state === 'suspended') void ac.resume()
  return { a: ac, o: out! }
}
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12)

function voice(a: AudioContext, dest: AudioNode, t: number, freq: number, dur: number, type: OscillatorType, vol: number, attack = 0.008, cutoff = 0) {
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + attack)
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur * 0.6))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  let node: AudioNode = o
  if (cutoff) {
    const f = a.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cutoff
    o.connect(f)
    node = f
  }
  node.connect(g).connect(dest)
  o.start(t)
  o.stop(t + dur + 0.05)
}

let noiseBuf: AudioBuffer | null = null
function noise(a: AudioContext, dest: AudioNode, t: number, dur: number, vol: number, type: BiquadFilterType, freq: number) {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const s = a.createBufferSource()
  s.buffer = noiseBuf
  const f = a.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  const g = a.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(dest)
  s.start(t, Math.random() * 0.5)
  s.stop(t + dur + 0.02)
}

function drum(a: AudioContext, d: AudioNode, kind: Drum, t: number, soft: boolean) {
  const v = soft ? 0.45 : 1
  if (kind === 'kick') {
    const o = a.createOscillator()
    const g = a.createGain()
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.16)
    g.gain.setValueAtTime(0.9 * v, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
    o.connect(g).connect(d)
    o.start(t)
    o.stop(t + 0.35)
  }
  if (kind === 'snare') {
    noise(a, d, t, 0.16, 0.38 * v, 'bandpass', 1900)
    voice(a, d, t, 190, 0.09, 'triangle', 0.2 * v)
  }
  if (kind === 'clap') for (let i = 0; i < 3; i++) noise(a, d, t + i * 0.012, 0.11, 0.3 * v, 'bandpass', 1500)
  if (kind === 'hat') noise(a, d, t, 0.035, 0.11 * v, 'highpass', 7500)
  if (kind === 'open') noise(a, d, t, 0.22, 0.09 * v, 'highpass', 6800)
  if (kind === 'rim') voice(a, d, t, 820, 0.05, 'square', 0.07 * v)
  if (kind === 'shaker') noise(a, d, t, 0.06, 0.07 * v, 'highpass', 5200)
}

// ---------- the player ----------
interface Playing {
  track: Track
  /** wall-clock ms the track is considered to have started (shared by everyone at a party) */
  since: number
  /** AudioContext time of step 0 of the current loop */
  t0: number
  next: number
  timer: number
  el?: HTMLAudioElement
  crackle?: AudioBufferSourceNode
}
let now: Playing | null = null
const listeners: ((id: string | null) => void)[] = []

const stepDur = (tr: Track) => 60 / tr.bpm / 4

function schedule() {
  const p = now
  if (!p || !ac || !out) return
  const tr = p.track
  const sd = stepDur(tr)
  const horizon = ac.currentTime + 0.15
  while (true) {
    const loop = Math.floor(p.next / tr.steps)
    const s = p.next % tr.steps
    let t = p.t0 + p.next * sd
    if (s % 2 === 1) t += sd * (tr.swing ?? 0)
    if (t > horizon) break
    if (t >= ac.currentTime - 0.01 && !isMuted()) playStep(tr, s, t, loop)
    p.next++
  }
}

function playStep(tr: Track, s: number, t: number, loop: number) {
  const a = ac!
  const d = out!
  const sd = stepDur(tr)
  for (const [kind, pattern] of Object.entries(tr.drums) as [Drum, string][]) {
    const ch = pattern[s % pattern.length]
    if (ch === 'x' || ch === 'o') drum(a, d, kind, t, ch === 'o')
  }
  for (const n of tr.bass) if (n.step === s) voice(a, d, t, hz(n.midi), n.len * sd * 0.9, tr.bassType, 0.2, 0.01, 900)
  for (const n of tr.chords) {
    if (n.step !== s) continue
    const len = tr.chordStyle === 'stab' ? Math.min(n.len, 2) * sd : n.len * sd * 0.95
    const vol = tr.chordStyle === 'pad' ? 0.045 : tr.chordStyle === 'stab' ? 0.06 : 0.07
    voice(a, d, t, hz(n.midi), len, tr.chordType, vol, tr.chordStyle === 'pad' ? 0.12 : 0.006, tr.chordStyle === 'pad' ? 2200 : 3200)
  }
  // the hook sits out every other pass of long songs so it doesn't get old
  if (tr.steps >= 128 || loop % 2 === 0 || tr.id === 'rooftop-sunset')
    for (const n of tr.lead) if (n.step === s) voice(a, d, t, hz(n.midi), n.len * sd * 0.92, tr.leadType, tr.leadType === 'square' ? 0.055 : 0.09, 0.01, tr.leadType === 'square' ? 2600 : 0)
}

/**
 * Play a track. `since` (epoch ms) starts it as if it began then — everyone at a party passes the
 * same `since` and lands on the same bar. Re-playing the current track is a no-op.
 */
export function play(id: string, since = Date.now()) {
  const tr = TRACK[id] ?? TRACKS[0]
  if (now?.track.id === tr.id && now.since === since) return
  stop(false)
  const { a } = audio()
  if (tr.src) {
    const el = new Audio(tr.src)
    el.loop = true
    el.volume = isMuted() ? 0 : 0.6
    el.currentTime = Math.max(0, (Date.now() - since) / 1000) % 600
    void el.play().catch(() => {})
    now = { track: tr, since, t0: 0, next: 0, timer: 0, el }
  } else {
    const loopLen = tr.steps * stepDur(tr)
    const elapsed = Math.max(0, (Date.now() - since) / 1000)
    const into = elapsed % loopLen
    const t0 = a.currentTime + 0.05 - into
    const p: Playing = { track: tr, since, t0, next: Math.ceil(into / stepDur(tr)), timer: 0 }
    now = p
    if (tr.crackle) p.crackle = startCrackle(a)
    p.timer = window.setInterval(schedule, 25)
    schedule()
  }
  listeners.forEach((f) => f(tr.id))
}

export function stop(notify = true) {
  if (!now) return
  clearInterval(now.timer)
  now.el?.pause()
  now.crackle?.stop()
  now = null
  if (notify) listeners.forEach((f) => f(null))
}

export const playing = () => now?.track ?? null
export const onMusic = (f: (id: string | null) => void) => void listeners.push(f)

/** follow the global mute toggle */
export function refreshMute() {
  if (now?.el) now.el.volume = isMuted() ? 0 : 0.6
}

function startCrackle(a: AudioContext) {
  const len = a.sampleRate * 2
  const buf = a.createBuffer(1, len, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() < 0.0012 ? (Math.random() * 2 - 1) * 0.6 : (Math.random() * 2 - 1) * 0.012
  const s = a.createBufferSource()
  s.buffer = buf
  s.loop = true
  const g = a.createGain()
  g.gain.value = isMuted() ? 0 : 0.5
  s.connect(g).connect(out!)
  s.start()
  return s
}
