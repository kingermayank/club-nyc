/** iFruit's little sounds, synthesized in the game's sfx style (silent while the game is muted). */
import { audioCtx } from '../../audio'

function blip(freq: number, dur: number, o: { type?: OscillatorType; vol?: number; at?: number; to?: number } = {}) {
  const a = audioCtx()
  if (!a) return
  const t = a.currentTime + (o.at ?? 0)
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.08, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(a.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

export type Tone = 'raise' | 'lower' | 'unlock' | 'open' | 'home' | 'note' | 'send' | 'recv' | 'shutter' | 'coin' | 'bell' | 'tap' | 'error'
export function tone(k: Tone) {
  switch (k) {
    case 'raise':
      return blip(420, 0.12, { to: 620, vol: 0.05 })
    case 'lower':
      return blip(560, 0.1, { to: 380, vol: 0.04 })
    case 'unlock':
      blip(1200, 0.04, { type: 'square', vol: 0.03 })
      return blip(800, 0.06, { type: 'triangle', vol: 0.06, at: 0.04 })
    case 'open':
      return blip(660, 0.08, { type: 'triangle', vol: 0.06, to: 990 })
    case 'home':
      return blip(740, 0.07, { type: 'triangle', vol: 0.05, to: 520 })
    case 'note':
      blip(1046, 0.12, { vol: 0.07 })
      return blip(1568, 0.18, { vol: 0.06, at: 0.09 })
    case 'send':
      blip(300, 0.16, { type: 'sawtooth', vol: 0.02, to: 1400 })
      return blip(1760, 0.05, { vol: 0.05, at: 0.16 })
    case 'recv':
      return blip(1318, 0.1, { vol: 0.06 })
    case 'shutter':
      blip(2400, 0.02, { type: 'square', vol: 0.05 })
      return blip(900, 0.05, { type: 'square', vol: 0.04, at: 0.05 })
    case 'coin':
      blip(988, 0.08, { type: 'square', vol: 0.04 })
      return blip(1319, 0.22, { type: 'square', vol: 0.04, at: 0.08 })
    case 'bell':
      blip(1568, 0.9, { vol: 0.08 })
      return blip(2093, 0.6, { vol: 0.04, at: 0.01 })
    case 'tap':
      return blip(1500, 0.025, { type: 'triangle', vol: 0.04 })
    case 'error':
      return blip(220, 0.18, { type: 'square', vol: 0.04, to: 160 })
  }
}

/** a phone ringing: two-tone burbles every 2 s; returns a stopper */
export function ring(): () => void {
  const play = () => {
    for (let i = 0; i < 6; i++) {
      blip(880, 0.05, { vol: 0.05, at: i * 0.06 })
      blip(1108, 0.05, { vol: 0.04, at: i * 0.06 + 0.03 })
    }
  }
  play()
  const t = setInterval(play, 2000)
  return () => clearInterval(t)
}
