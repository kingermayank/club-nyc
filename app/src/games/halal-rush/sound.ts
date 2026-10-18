// A few extra cart noises (squeeze bottles, scoops, foil) on top of the shared sfx.
import { save } from '../../state'

let ac: AudioContext | null = null

function audio(): AudioContext | null {
  if (save.muted) return null
  try {
    ac ??= new AudioContext()
    if (ac.state === 'suspended') void ac.resume()
    return ac
  } catch {
    return null
  }
}

function gain(a: AudioContext, t: number, vol: number, attack: number, dur: number) {
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  g.connect(a.destination)
  return g
}

function noise(a: AudioContext, t: number, dur: number, out: AudioNode) {
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const s = a.createBufferSource()
  s.buffer = buf
  s.connect(out)
  s.start(t)
  s.stop(t + dur)
}

function tone(a: AudioContext, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
  const o = a.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  o.connect(gain(a, t, vol, 0.008, dur))
  o.start(t)
  o.stop(t + dur + 0.05)
}

export const snd = {
  /** squeeze bottle: a wet "pfffrt" */
  squirt(pitch = 1) {
    const a = audio()
    if (!a) return
    const t = a.currentTime
    const f = a.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 2.2
    f.frequency.setValueAtTime(1500 * pitch, t)
    f.frequency.exponentialRampToValueAtTime(420 * pitch, t + 0.2)
    f.connect(gain(a, t, 0.35, 0.02, 0.22))
    noise(a, t, 0.24, f)
    // the little sputter at the end
    const f2 = a.createBiquadFilter()
    f2.type = 'lowpass'
    f2.frequency.value = 500
    f2.connect(gain(a, t + 0.17, 0.25, 0.01, 0.07))
    noise(a, t + 0.17, 0.08, f2)
  },
  /** spoon of food landing */
  scoop() {
    const a = audio()
    if (!a) return
    const t = a.currentTime
    tone(a, t, 'sine', 210, 80, 0.13, 0.28)
    const f = a.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 900
    f.connect(gain(a, t, 0.12, 0.005, 0.09))
    noise(a, t, 0.1, f)
  },
  /** foil container on steel */
  clunk() {
    const a = audio()
    if (!a) return
    const t = a.currentTime
    tone(a, t, 'triangle', 680, 520, 0.09, 0.09)
    tone(a, t + 0.01, 'square', 1450, 1300, 0.05, 0.025)
    const f = a.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 2500
    f.connect(gain(a, t, 0.12, 0.003, 0.08))
    noise(a, t, 0.08, f)
  },
  /** soft paper flop for a pita */
  flop() {
    const a = audio()
    if (!a) return
    const t = a.currentTime
    const f = a.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(1400, t)
    f.frequency.exponentialRampToValueAtTime(300, t + 0.12)
    f.connect(gain(a, t, 0.3, 0.01, 0.14))
    noise(a, t, 0.15, f)
  },
  /** into the bin */
  trash() {
    const a = audio()
    if (!a) return
    const t = a.currentTime
    const f = a.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 700
    f.connect(gain(a, t + 0.05, 0.3, 0.01, 0.25))
    noise(a, t + 0.05, 0.26, f)
    tone(a, t + 0.05, 'triangle', 300, 120, 0.2, 0.12)
  },
  /** the "closing time" bell */
  bell() {
    const a = audio()
    if (!a) return
    const t = a.currentTime
    for (let i = 0; i < 3; i++) {
      tone(a, t + i * 0.22, 'sine', 1568, 1560, 0.9, 0.12)
      tone(a, t + i * 0.22, 'sine', 3136, 3120, 0.4, 0.03)
    }
  },
  stop() {
    const a = ac
    ac = null
    if (a) void a.close().catch(() => undefined)
  },
}
