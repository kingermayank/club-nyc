// Showtime!: the dancer's own sounds on top of the song and the train (music.ts): the tricks, a sneaker squeak on a
// missed step, coins landing in the hat, a rider snapping their newspaper shut. Shared context (foley.ts), silent
// while sound is off.
import { kit } from '../../foley'

const { ctx, tone, noise, rand } = kit

export const showSfx = {
  /** a spin: one quick whoosh */
  spin() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    noise(a, t, 0.32, 0.06, { f: 600, to: 2600, q: 0.8, attack: 0.06 })
  },
  /** a backflip: a rising swoosh up, a beat in the air, a sneaker landing */
  flip() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    noise(a, t, 0.4, 0.06, { f: 500, to: 3000, q: 0.9, attack: 0.08 })
    noise(a, t + 0.62, 0.08, 0.08, { type: 'lowpass', f: 380 })
    tone(a, 120, t + 0.62, 0.1, 0.09, 'sine', { to: 70 })
  },
  /** a pole trick: a hand squeaking around the steel pole, and the pole's ring */
  pole() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    tone(a, 1250, t, 0.5, 0.012, 'sawtooth', { to: 1700, attack: 0.06, vibrato: [9, 40] })
    tone(a, 2093, t + 0.05, 1.2, 0.03, 'sine')
    tone(a, 2093 * 2.76, t + 0.05, 0.4, 0.006, 'sine')
    noise(a, t, 0.5, 0.018, { f: 2800, q: 2 })
  },
  /** a missed step: a sneaker squeaks on the subway floor */
  squeak() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    tone(a, rand(1500, 1800), t, 0.12, 0.022, 'square', { to: rand(2300, 2600), attack: 0.01, vibrato: [30, 60] })
  },
  /** a tip lands in the hat: a clink and a soft felt thump */
  hatCoin() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    tone(a, 2637, t, 0.18, 0.035, 'sine')
    tone(a, 3951, t + 0.02, 0.12, 0.018, 'sine')
    noise(a, t + 0.01, 0.05, 0.04, { type: 'lowpass', f: 600 })
  },
  /** a rider gives up on you and snaps their newspaper open */
  snub() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    noise(a, t, 0.14, 0.045, { f: 2400, to: 1200, q: 0.7, attack: 0.02 })
    noise(a, t + 0.12, 0.05, 0.035, { type: 'lowpass', f: 700 })
  },
}
