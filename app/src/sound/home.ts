import { audioCtx } from '../audio'
import { withSamples } from './library'

/**
 * Things you switch and touch at home (features/apartment.ts): a recording from the library when
 * public/sfx/index.json has one (tools/sfx_manifest.json, keys "hm.*"), otherwise these synths.
 */
function blip(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slide?: number, at = 0) {
  const a = audioCtx()
  if (!a) return
  const t = a.currentTime + at
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}
function hiss(dur: number, vol: number, freq: number, q = 1) {
  const a = audioCtx()
  if (!a) return
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / d.length)
  const src = a.createBufferSource()
  src.buffer = buf
  const f = a.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  const g = a.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(a.destination)
  src.start()
}

export const hm = withSamples('hm', {
  /** a lamp's pull chain */
  chain: () => (blip(1900, 0.03, 0.08, 'square'), blip(1300, 0.04, 0.07, 'square', undefined, 0.07)),
  /** a neon tube catching */
  neon: () => (blip(120, 0.5, 0.04, 'sawtooth'), hiss(0.5, 0.03, 6000, 3)),
  /** an old tube TV warming up */
  tvOn: () => (blip(1400, 0.03, 0.06, 'square'), hiss(0.5, 0.05, 4200), blip(9000, 0.4, 0.012, 'sine', 15000)),
  /** and its picture collapsing to a dot */
  tvOff: () => (blip(1400, 0.03, 0.06, 'square'), blip(6000, 0.2, 0.02, 'sine', 300)),
  /** a match, then the kindling catching */
  fire: () => (hiss(0.12, 0.12, 5200, 2), hiss(1.2, 0.05, 1400, 0.7)),
  /** a fire put out */
  fireOut: () => hiss(0.7, 0.06, 2600, 0.6),
  /** a hand through the leaves */
  rustle: () => hiss(0.45, 0.07, 3600, 0.8),
})
