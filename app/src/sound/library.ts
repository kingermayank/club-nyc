/**
 * The sound library: real recordings for real things (a taxi horn, a turnstile, the espresso machine), with the
 * synthesized sound as the fallback. Every sound in the game keeps its name (`sfx.click`, `subway.arrive`,
 * `ferry.horn`…); when public/sfx/index.json lists a recording for that name, the recording plays instead.
 *
 * - Recordings are prepared by tools/sfx_build.py (trimmed, faded, loudness-matched, room loops made seamless)
 *   from the list in tools/sfx_manifest.json. Until a file exists, the synth plays, so nothing ever goes silent.
 * - Small one-shots load in the background after the first click; room ambiences load when you walk in.
 * - Three buses (ui, fx, amb) under one soft limiter, so a pile of sounds can't get loud.
 * - Each play gets a little pitch and level variation, and rapid repeats of the same sound are thinned.
 * - Silent while sound is off (audioCtx() is null), like everything else.
 */
import { audioCtx, onMute } from '../audio'

type Bus = 'ui' | 'fx' | 'amb'
interface Entry {
  /** published file names under /sfx/ (several = pick one at random) */
  files: string[]
  bus?: Bus
  /** level, 0..1 (files are loudness-matched, so this is the mix) */
  vol?: number
  /** ± playback-rate variation, e.g. 0.06 */
  jitter?: number
  /** ms: a repeat sooner than this is dropped (and the synth stays quiet too) */
  gap?: number
  /** play the recording AND the synth (e.g. the stamp's thud under its little jingle) */
  layer?: boolean
}
interface Index {
  v: number
  sounds: Record<string, Entry>
  ambience: Record<string, { file: string; vol?: number }>
}

let index: Index | null = null
let indexP: Promise<Index | null> | null = null
const buffers = new Map<string, AudioBuffer>()
const loading = new Map<string, Promise<AudioBuffer | null>>()
const lastAt = new Map<string, number>()
let buses: Record<Bus, GainNode> | null = null

/** Quieter defaults: ambient and SFX were too loud out of the box. */
const BUS_LEVEL: Record<Bus, number> = { ui: 0.55, fx: 0.5, amb: 0.28 }
/** 0..1 master from the player volume slider (audio.ts). */
let master = 0.7

export function setMasterVolume(v: number) {
  master = Math.max(0, Math.min(1, v))
  if (!buses) return
  const a = buses.ui.context
  const t = a.currentTime
  for (const b of ['ui', 'fx', 'amb'] as Bus[]) {
    buses[b].gain.cancelScheduledValues(t)
    buses[b].gain.setValueAtTime(BUS_LEVEL[b] * master, t)
  }
}
export const masterVolume = () => master

function ctx(): AudioContext | null {
  try {
    return audioCtx()
  } catch {
    return null
  }
}

function getBuses(a: AudioContext) {
  if (buses && buses.ui.context === a) return buses
  const limit = a.createDynamicsCompressor()
  limit.threshold.value = -10
  limit.knee.value = 8
  limit.ratio.value = 8
  limit.attack.value = 0.002
  limit.release.value = 0.2
  limit.connect(a.destination)
  const mk = (b: Bus) => {
    const g = a.createGain()
    g.gain.value = BUS_LEVEL[b] * master
    g.connect(limit)
    return g
  }
  buses = { ui: mk('ui'), fx: mk('fx'), amb: mk('amb') }
  return buses
}

/** the list of recordings that exist (fetched once; a missing index just means "all synth") */
function loadIndex(): Promise<Index | null> {
  indexP ??= fetch('/sfx/index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<Index>) : null))
    .catch(() => null)
    .then((i) => (index = i && i.v === 1 ? i : null))
  return indexP
}

function loadFile(file: string): Promise<AudioBuffer | null> {
  const have = buffers.get(file)
  if (have) return Promise.resolve(have)
  let p = loading.get(file)
  if (!p) {
    const a = ctx()
    if (!a) return Promise.resolve(null)
    p = fetch(`/sfx/${file}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => a.decodeAudioData(b))
      .then((buf) => (buffers.set(file, buf), buf))
      .catch(() => null)
    loading.set(file, p)
  }
  return p
}

/** fetch every one-shot in the background (they're small); runs once, after the first click */
let warmed = false
export function warmSamples() {
  if (warmed) return
  warmed = true
  void loadIndex().then((i) => {
    if (!i) return
    const files = [...new Set(Object.values(i.sounds).flatMap((e) => e.files))]
    // a few at a time, so the first room's art isn't fighting for the network
    let n = 0
    const next = () => {
      const f = files[n++]
      if (f) void loadFile(f).finally(next)
    }
    for (let k = 0; k < 4; k++) next()
  })
}

type Stop = () => void
/**
 * Play the recording for `key` if it's ready. Returns a stop() when it played (or was deliberately thinned out),
 * null when the caller should play its synth instead. `seconds` loops the recording for that long (rides, applause).
 */
export function play(key: string, o: { seconds?: number; rate?: number; vol?: number } = {}): Stop | null {
  if (!index) return null
  const e = index.sounds[key]
  if (!e) return null
  const a = ctx()
  if (!a) return null
  const now = performance.now()
  if (e.gap && now - (lastAt.get(key) ?? -1e9) < e.gap) return e.layer ? null : () => {}
  const file = e.files[Math.floor(Math.random() * e.files.length)]
  const buf = buffers.get(file)
  if (!buf) {
    void loadFile(file)
    return null
  }
  lastAt.set(key, now)
  const t = a.currentTime + 0.005
  const src = a.createBufferSource()
  src.buffer = buf
  const j = e.jitter ?? 0.04
  src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * j)
  const g = a.createGain()
  const vol = (e.vol ?? 1) * (o.vol ?? 1) * (1 + (Math.random() * 2 - 1) * 0.08)
  g.gain.value = vol
  src.connect(g).connect(getBuses(a)[e.bus ?? 'fx'])
  let end = t + buf.duration / src.playbackRate.value
  if (o.seconds && o.seconds > buf.duration) {
    src.loop = true
    end = t + o.seconds
  }
  if (o.seconds) {
    const fade = Math.min(0.4, o.seconds / 4)
    g.gain.setValueAtTime(vol, Math.max(t, end - fade))
    g.gain.linearRampToValueAtTime(0.0001, end)
  }
  src.start(t)
  src.stop(end + 0.05)
  const stop = () => {
    const n = a.currentTime
    g.gain.cancelScheduledValues(n)
    g.gain.setValueAtTime(g.gain.value, n)
    g.gain.linearRampToValueAtTime(0.0001, n + 0.15)
    try {
      src.stop(n + 0.2)
    } catch {
      /* already stopped */
    }
  }
  return e.layer ? null : stop
}

/**
 * Wrap a module's synth sounds so each one tries its recording first: `withSamples('ferry', { horn() {…} })`.
 * Same names and signatures; a sound that returns a stop() gets the recording's stop() instead.
 */
export function withSamples<T extends Record<string, unknown>>(prefix: string, synth: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, f] of Object.entries(synth)) {
    if (typeof f !== 'function') {
      out[k] = f
      continue
    }
    const key = `${prefix}.${k}`
    out[k] = function (this: unknown, ...args: unknown[]) {
      const seconds = typeof args[0] === 'number' && f.length > 0 && LOOPING.has(key) ? (args[0] as number) : undefined
      const stop = play(key, { seconds })
      if (stop) return stop
      return (f as (...a: unknown[]) => unknown).apply(this, args)
    }
  }
  return out as T
}
/** sounds whose first argument is a length in seconds */
const LOOPING = new Set(['subway.ride', 'theater.applause'])

// ---------- room ambience ----------
let amb: { name: string; src: AudioBufferSourceNode; g: GainNode } | null = null
let wantAmb: string | null = null

/** crossfade to a room's background (or to silence with null) */
export function setAmbience(name: string | null) {
  hookMute()
  wantAmb = name
  if (amb?.name === name) return
  const a = ctx()
  fadeOut(a)
  if (!name || !a) return
  void loadIndex().then(async (i) => {
    const def = i?.ambience[name]
    if (!def) return
    const buf = await loadFile(def.file)
    const a2 = ctx()
    if (!buf || !a2 || wantAmb !== name || amb?.name === name) return
    fadeOut(a2)
    const src = a2.createBufferSource()
    src.buffer = buf
    src.loop = true
    const g = a2.createGain()
    const t = a2.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(def.vol ?? 0.5, t + 2)
    src.connect(g).connect(getBuses(a2).amb)
    // start somewhere in the loop, so walking back in doesn't replay the same horn
    src.start(t, Math.random() * buf.duration)
    amb = { name, src, g }
  })
}
function fadeOut(a: AudioContext | null) {
  if (!amb) return
  const { src, g } = amb
  amb = null
  if (!a) {
    try {
      src.stop()
    } catch {
      /* gone */
    }
    return
  }
  const t = a.currentTime
  g.gain.cancelScheduledValues(t)
  g.gain.setValueAtTime(g.gain.value, t)
  g.gain.linearRampToValueAtTime(0.0001, t + 1.2)
  src.stop(t + 1.3)
}
/** turn the room's background down while something else needs the space (a job, a show), then back */
export function duckAmbience(on: boolean) {
  const a = ctx()
  if (!a || !buses) return
  const t = a.currentTime
  buses.amb.gain.cancelScheduledValues(t)
  buses.amb.gain.setValueAtTime(buses.amb.gain.value, t)
  buses.amb.gain.linearRampToValueAtTime(on ? BUS_LEVEL.amb * master * 0.25 : BUS_LEVEL.amb * master, t + 0.6)
}

/** follow the mute toggle (registered lazily: audio.ts imports this module, so nothing here runs at load) */
let hooked = false
function hookMute() {
  if (hooked) return
  hooked = true
  onMute((m) => {
    if (m) fadeOut(null)
    else if (wantAmb) {
      const w = wantAmb
      wantAmb = null
      setAmbience(w)
    }
  })
}

/** for the dev sound board */
export const libraryState = () => ({ index, loaded: [...buffers.keys()], ambience: amb?.name ?? null })
