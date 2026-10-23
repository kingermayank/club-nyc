// Bagel Counters: the specific sounds of the coffee delivery, on top of the game's own catch scale, thuds and chomps
// (index.ts). Synthesized on the shared context (foley.ts), silent while sound is off.
import { kit } from '../../foley'

const { ctx, tone, noise, rand } = kit

export const bagelSfx = {
  /** a coffee sack lands on your stack: a soft burlap flump and the beans shifting inside */
  catchSack() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    noise(a, t, 0.13, 0.09, { type: 'lowpass', f: 420 })
    tone(a, 118, t, 0.13, 0.08, 'sine', { to: 68 })
    for (let i = 0; i < 9; i++) noise(a, t + 0.03 + rand(0, 0.17), 0.012, rand(0.014, 0.032), { type: 'highpass', f: rand(3500, 6000) })
  },
  /** a bagel box lands on your stack: a hollow cardboard knock */
  catchBox() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    tone(a, 205, t, 0.1, 0.09, 'triangle', { to: 148 })
    tone(a, 410, t, 0.05, 0.025, 'square', { to: 300 })
    noise(a, t, 0.06, 0.06, { f: 900, q: 1.4 })
  },
  /** one item unloaded onto the pallet: a thump on wood */
  unload() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    tone(a, 150, t, 0.11, 0.09, 'sine', { to: 85 })
    noise(a, t, 0.05, 0.05, { type: 'lowpass', f: 700 })
    tone(a, 540, t + 0.01, 0.05, 0.022, 'triangle', { to: 450 })
  },
  /** a pigeon flapping in from the right: quick wingbeats that fade */
  wings() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    for (let i = 0; i < 9; i++) {
      const k = i / 9
      noise(a, t + i * 0.066, 0.05, 0.05 * (1 - k * 0.6), { f: 1300 - k * 420, q: 0.8, attack: 0.012 })
    }
  },
  /** a sack hits the sidewalk and splits: beans skittering everywhere */
  beans() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.02
    for (let i = 0; i < 18; i++) noise(a, t + rand(0, 0.4) * rand(0.4, 1), 0.01, rand(0.018, 0.045), { type: 'highpass', f: rand(2600, 5800) })
  },
  /** a full pallet wheeled into the shop: a hand truck rumbling over the sidewalk, one squeaky wheel */
  cart() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    for (let i = 0; i < 7; i++) noise(a, t + i * 0.07, 0.06, 0.035, { type: 'lowpass', f: 240 + i * 10 })
    tone(a, 1650, t + 0.12, 0.16, 0.012, 'sine', { to: 1900, vibrato: [11, 30] })
    tone(a, 1700, t + 0.34, 0.14, 0.01, 'sine', { to: 1500, vibrato: [11, 30] })
  },
}
