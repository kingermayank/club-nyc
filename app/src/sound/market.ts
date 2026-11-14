import { audioCtx } from '../audio'
import { withSamples } from './library'

/**
 * Chelsea Market's shop sounds (features/moments/tacos.ts, oysterBar.ts, bookshop.ts, doughnuts.ts): a recording
 * from the library when public/sfx/index.json has one (tools/sfx_manifest.json, keys "mk.*"), otherwise these synths.
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

export const mk = withSamples('mk', {
  /** meat or a tortilla hitting the hot griddle */
  sizzle: () => hiss(1.1, 0.07, 5200),
  /** the long knife down the trompo, one stroke */
  shave: () => hiss(0.22, 0.09, 2400, 2),
  /** a spoonful of topping landing */
  plop: () => blip(320, 0.09, 0.08, 'sine', 180),
  /** the oyster knife popping the hinge */
  shuck: () => (hiss(0.05, 0.16, 1800, 3), blip(240, 0.07, 0.07, 'triangle', 120)),
  /** an oyster going down */
  slurp: () => (hiss(0.32, 0.06, 900, 4), blip(300, 0.3, 0.05, 'sine', 620)),
  /** a lemon wedge or a bottle squeezed */
  squeeze: () => hiss(0.18, 0.06, 3200, 2),
  /** an empty shell dropped back on the ice */
  shell: () => (hiss(0.04, 0.12, 3000, 2), blip(900, 0.05, 0.03, 'triangle')),
  /** the doughnut machine's lever and plunger */
  clunk: () => (blip(140, 0.12, 0.12, 'square', 70), hiss(0.06, 0.1, 700)),
  /** batter dropping into hot oil, a few seconds of frying */
  fry: () => hiss(2.4, 0.06, 4200),
  /** sugar and doughnuts shaken in a paper bag, one shake */
  shake: () => hiss(0.12, 0.1, 3600, 1.5),
  /** a paper bag opened or folded shut */
  bag: () => hiss(0.25, 0.07, 2600),
  /** a book set down or pulled off its stand */
  thump: () => (blip(110, 0.12, 0.12, 'sine', 70), hiss(0.05, 0.05, 500)),
  /** one page turning */
  page: () => hiss(0.28, 0.07, 3400, 1.2),
  /** the shop's till */
  till: () => (blip(1568, 0.25, 0.06), setTimeout(() => blip(2093, 0.4, 0.05), 90)),
  /** a bite */
  bite: () => (hiss(0.09, 0.12, 1400, 2), blip(180, 0.08, 0.05, 'triangle', 110)),
})
