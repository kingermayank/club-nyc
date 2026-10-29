import { Audio, Video } from '@remotion/media'
import type React from 'react'
import { AbsoluteFill, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { HOSTS, type HostDef } from './host'
import { Crop, EndCard, Hook, REEL_H, REEL_W } from './Reel'
import { DISPLAY, INK, PAPER } from './theme'

const FPS = 30
const f = (s: number) => Math.round(s * FPS)
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
/** the corner bubble the host sits in while the gameplay plays: above Instagram's bottom fifth, clear of its right-side buttons */
const PIP = { x: 56, y: 1100, d: 380 }

export const hostFrames = (h: HostDef) => f(h.talk + h.endSeconds)

/**
 * A creator-style reel with a disclosed AI host (host.ts): the host talks to camera, and while they describe the game
 * our full-screen gameplay takes over and they shrink into a bubble in the corner, then come back for the reaction.
 * Their own voice runs the whole reel; captions follow it; an "AI host" label stays on screen the whole time.
 */
export const HostReel: React.FC<{ id: string }> = ({ id }) => {
  const h = HOSTS[id]
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const talk = f(h.talk)
  // which cut are we in, and how far into it (for the bubble's pop)
  const cut = h.cuts.find((c) => frame >= f(c.from) && frame < f(c.to)) ?? h.cuts[h.cuts.length - 1]
  const inBroll = frame < talk && !!cut.broll
  const pop = spring({ frame: frame - f(cut.from), fps, config: { damping: 12, stiffness: 220, mass: 0.6 } })
  const hostStyle: React.CSSProperties = inBroll
    ? { left: PIP.x, top: PIP.y, width: PIP.d, height: PIP.d, borderRadius: '50%', border: `9px solid ${PAPER}`, boxShadow: `0 0 0 5px ${INK}, 0 14px 0 rgba(0,0,0,0.35)`, scale: interpolate(pop, [0, 1], [0.6, 1]), zIndex: 3 }
    : { left: 0, top: 0, width: REEL_W, height: REEL_H, zIndex: 1 }
  return (
    <AbsoluteFill style={{ background: INK }}>
      {/* the gameplay, one Sequence per B-roll cut */}
      {h.cuts.map((c, i) =>
        c.broll ? (
          <Sequence key={i} from={f(c.from)} durationInFrames={f(c.to) - f(c.from)} layout="none">
            <AbsoluteFill style={{ zIndex: 2 }}>
              <Crop src={c.broll.src} at={c.broll.at} w={REEL_W} h={REEL_H} cx={c.broll.cx} pan={c.broll.pan} zoom={c.broll.zoom ?? [1.02, 1.08]} len={f(c.to) - f(c.from)} />
              <AbsoluteFill style={{ background: 'linear-gradient(rgba(16,27,63,0.65), rgba(16,27,63,0) 34%)' }} />
            </AbsoluteFill>
          </Sequence>
        ) : null,
      )}
      {/* the host: one video for the whole talk (so the voice never skips), full screen or in the bubble */}
      {frame < talk ? (
        <div style={{ position: 'absolute', overflow: 'hidden', ...hostStyle }}>
          <Video src={staticFile(h.clip)} muted={false} objectFit="cover" style={{ width: '100%', height: '100%', objectPosition: inBroll ? '50% 28%' : '50% 50%' }} />
        </div>
      ) : (
        // the clip's audio stops with the talk; the end card follows
        <Sequence from={talk} layout="none">
          <AbsoluteFill style={{ zIndex: 4 }}>
            <EndCard {...h.end} />
          </AbsoluteFill>
        </Sequence>
      )}
      {/* captions, phrase by phrase, word by word */}
      {h.captions.map((c, i) => (
        <Sequence key={i} from={f(c.from)} durationInFrames={f(c.to) - f(c.from)} layout="none">
          <AbsoluteFill style={{ zIndex: 5 }}>
            <Hook text={c.text} />
          </AbsoluteFill>
        </Sequence>
      ))}
      {/* always on screen: who this is */}
      {frame < talk ? (
        <div style={{ position: 'absolute', zIndex: 6, left: 56, top: 120, display: 'flex', alignItems: 'center', gap: 14, padding: '10px 22px 12px', background: 'rgba(16,20,48,0.72)', border: `3px solid ${PAPER}`, borderRadius: 999, color: PAPER, fontFamily: DISPLAY, fontSize: 36, lineHeight: 1 }}>
          <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#ffc634', display: 'inline-block' }} />
          {h.name} · AI host
        </div>
      ) : null}
      {/* a quiet bed of our own tune under the voice, full volume on the end card */}
      <Audio src={staticFile(h.music)} volume={(fr) => interpolate(fr, [talk - 6, talk + 6], [0.1, 0.8], clamp)} />
    </AbsoluteFill>
  )
}
