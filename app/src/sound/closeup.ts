import { audioCtx } from '../audio'
import { withSamples } from './library'

/**
 * The close-up scenes' own sounds (features/moments/closeup.ts and friends): a recording from the library when
 * public/sfx/index.json has one (tools/sfx_manifest.json, keys "cu.*"), otherwise these small synths.
 */
function blip(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slide?: number) {
  const a = audioCtx()
  if (!a) return
  const t = a.currentTime
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}
function hiss(dur: number, vol: number, freq: number) {
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
  const g = a.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(a.destination)
  src.start()
}

export const cu = withSamples('cu', {
  /** the departures board turning over */
  flap: () => {
    for (let i = 0; i < 7; i++) setTimeout(() => hiss(0.03, 0.12, 2600), i * 55)
  },
  /** one tick of the opal clock */
  tick: () => blip(1900, 0.03, 0.04, 'square'),
  /** chalk on the market's board */
  chalk: () => hiss(0.5, 0.08, 4200),
  /** the pastry shop's door */
  bell: () => (blip(2100, 0.9, 0.06), blip(3150, 0.7, 0.03)),
  /** Trinity's bell, once */
  toll: () => (blip(196, 3.2, 0.09), blip(392, 2.4, 0.04), blip(587, 1.6, 0.02)),
  /** wind up high */
  wind: () => hiss(2.4, 0.07, 500),
})
