import { linearTiming, TransitionSeries } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import type React from 'react'
import { Shot } from './Shot'

/**
 * The landing page's hero: a silent, seamless loop of real gameplay, at 2560 x 1440 so it stays sharp on big and
 * high-density screens. Only the landmarks anyone recognizes, filmed sharp (capture.py hero).
 * Each shot crossfades into the next; the last fade goes into the first shot's opening frames, and the first shot
 * starts FADE frames in, so the end meets the start.
 */
export const HERO_W = 2560
export const HERO_H = 1440
const LEN = 72
const FADE = 12
const SHOTS: { src: string; at: number; zoom?: [number, number]; origin?: string }[] = [
  { src: 'hero-liberty-island.mp4', at: 0.3 },
  // Times Square mid Dance Jam, framed on the dancers (below the shop signs)
  { src: 'hero-times-square.mp4', at: 1.2, zoom: [1.42, 1.46], origin: '48% 100%' },
  { src: 'hero-brooklyn-bridge.mp4', at: 0.3 },
  { src: 'hero-central-park.mp4', at: 0.3 },
  { src: 'hero-grand-central.mp4', at: 0.3 },
  { src: 'hero-empire-deck.mp4', at: 0.3 },
  { src: 'hero-rockefeller.mp4', at: 0.3 },
]
export const HERO_FRAMES = SHOTS.length * LEN + FADE - SHOTS.length * FADE

export const HeroLoop: React.FC = () => {
  const first = SHOTS[0]
  return (
    <TransitionSeries>
      {SHOTS.map((s, i) => [
        <TransitionSeries.Sequence key={s.src} name={s.src} durationInFrames={LEN}>
          <Shot src={s.src} at={s.at + (i === 0 ? FADE / 30 : 0)} offset={i === 0 ? FADE : 0} len={LEN + FADE} zoom={s.zoom ?? [1.0, 1.04]} origin={s.origin} />
        </TransitionSeries.Sequence>,
        <TransitionSeries.Transition key={s.src + '-fade'} presentation={fade()} timing={linearTiming({ durationInFrames: FADE })} />,
      ])}
      <TransitionSeries.Sequence name="back to the start" durationInFrames={FADE}>
        <Shot src={first.src} at={first.at} len={LEN + FADE} zoom={first.zoom ?? [1.0, 1.04]} origin={first.origin} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  )
}
