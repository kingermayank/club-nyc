// Ferry Captain: the harbor's own sounds (the horn, a bump, splashes, grabbing a life ring, tying up at the dock).
// Synthesized on the shared context (foley.ts), silent while sound is off.
import { kit } from '../../foley'

const { ctx, tone, noise, swell, rand, NOTE } = kit

export const ferrySfx = {
  /** the ferry's horn: a deep, warm two-note blast */
  horn() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    const g = swell(a, [[t, 0], [t + 0.14, 0.085], [t + 0.85, 0.075], [t + 1.2, 0]])
    const body = a.createBiquadFilter()
    body.type = 'lowpass'
    body.frequency.value = 820
    body.Q.value = 0.8
    body.connect(g)
    for (const [f, d] of [[110, 0], [138.6, 5], [110.4, -6]]) {
      const o = a.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(f * 0.97, t)
      o.frequency.linearRampToValueAtTime(f, t + 0.12)
      o.detune.value = d
      o.connect(body)
      o.start(t)
      o.stop(t + 1.25)
    }
  },
  /** water slapping up around the hull */
  splash() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    noise(a, t, 0.36, 0.08, { f: 1500, to: 620, q: 0.6, attack: 0.01 })
    noise(a, t + 0.04, 0.24, 0.045, { type: 'highpass', f: 3200 })
    for (let i = 0; i < 3; i++) tone(a, rand(900, 1300), t + 0.18 + i * rand(0.06, 0.1), 0.05, 0.02, 'sine', { to: rand(1400, 1900) })
  },
  /** a bump: the hull thunks into something, then the splash */
  bump() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    tone(a, 88, t, 0.28, 0.15, 'sine', { to: 48 })
    noise(a, t, 0.09, 0.08, { type: 'lowpass', f: 520 })
    tone(a, 240, t + 0.01, 0.12, 0.03, 'triangle', { to: 180 })
    ferrySfx.splash()
  },
  /** scooping a life ring out of the water: a splashy grab and a bright little buoy bell */
  lifeRing() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.005
    noise(a, t, 0.2, 0.05, { f: 1100, to: 2200, q: 0.7, attack: 0.01 })
    tone(a, NOTE(88), t + 0.1, 0.55, 0.05, 'sine')
    tone(a, NOTE(88) * 2.76, t + 0.1, 0.18, 0.008, 'sine')
  },
  /** tying up at the dock: a rope creak and the bump of the fenders */
  dock() {
    const a = ctx()
    if (!a) return
    const t = a.currentTime + 0.01
    tone(a, 310, t, 0.35, 0.018, 'sawtooth', { to: 240, attack: 0.08, vibrato: [14, 12] })
    tone(a, 95, t + 0.32, 0.22, 0.12, 'sine', { to: 55 })
    noise(a, t + 0.32, 0.12, 0.05, { type: 'lowpass', f: 400 })
  },
}
