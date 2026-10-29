import { Audio, Video } from '@remotion/media'
import type React from 'react'
import { AbsoluteFill, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { EPIC_BEATS, EPIC_BPM, EPIC_SHOTS, TRACK, type EpicShot } from './epic'
import { BODY, DISPLAY, INK } from './theme'
import { Plate } from './ui'

/** frames per beat at the trailer's tempo (18 at 100 BPM) */
export const EPIC_FPB = 1800 / EPIC_BPM
/** the title holds for 1.2 s after the last beat, while the last hit rings out */
export const EPIC_FRAMES = Math.round(EPIC_BEATS * EPIC_FPB) + 36
const f = (beats: number) => Math.round(beats * EPIC_FPB)

// trailer type is Burbank too (the brand's one typeface): Bold, capitals, tracked wide. The joke is the trailer
// grammar (bars, booms, slow motion, dead air), not a borrowed serif
const SERIF = DISPLAY
/** the picture between the letterbox bars */
const BAR = 330
const PIC = { w: 1080, h: 1920 - 2 * BAR }
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** a hit shakes the camera for a moment */
function useShake(strength = 14) {
  const frame = useCurrentFrame()
  const k = Math.max(0, 1 - frame / 10)
  return { x: Math.sin(frame * 2.7) * strength * k, y: Math.cos(frame * 3.1) * strength * 0.6 * k }
}

const Flash: React.FC<{ frames?: number }> = ({ frames = 5 }) => {
  const frame = useCurrentFrame()
  const o = interpolate(frame, [0, frames], [0.75, 0], clamp)
  return o > 0.01 ? <AbsoluteFill style={{ background: '#fff', opacity: o }} /> : null
}

/** 16:9 footage cropped into the tall picture, aimed with `origin` (x picks the slice, y where the push-in goes) */
const Footage: React.FC<{ shot: EpicShot; len: number }> = ({ shot, len }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const [ox, oy] = (shot.origin ?? '50% 50%').split(' ').map((v) => parseFloat(v) / 100)
  const w = (PIC.h * 16) / 9
  const z = interpolate(frame, [0, len], shot.zoom ?? [1.05, 1.12], clamp)
  const shake = useShake()
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#000' }}>
      <div style={{ position: 'absolute', inset: 0, scale: z, transformOrigin: `50% ${oy * 100}%`, translate: `${shake.x}px ${shake.y}px` }}>
        <div style={{ position: 'absolute', top: 0, left: -(w - PIC.w) * ox, width: w, height: PIC.h }}>
          <Video
            src={staticFile(`footage/${shot.src}`)}
            trimBefore={Math.round((shot.from ?? 0) * fps)}
            playbackRate={shot.rate ?? 1}
            muted
            style={{ width: '100%', height: '100%', filter: 'contrast(1.14) saturate(0.82) brightness(0.9)' }}
          />
        </div>
      </div>
      {/* the blockbuster grade: teal shadows, warm highlights, heavy vignette */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,70,90,0.55), rgba(0,0,0,0) 45%, rgba(255,120,30,0.35))', mixBlendMode: 'soft-light' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 70% at 50% 50%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.7) 100%)' }} />
    </AbsoluteFill>
  )
}

/** trailer type: wide-tracked serif, slammed in big and settling */
const Slam: React.FC<{ text: string; at: number; size?: number; index: number; count: number }> = ({ text, at, size = 96, index, count }) => {
  const frame = useCurrentFrame() - at
  if (frame < 0) return null
  const p = interpolate(frame, [0, 5], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
  const y = (index - (count - 1) / 2) * size * 1.25
  return (
    <div
      style={{
        position: 'absolute',
        left: 40,
        right: 40,
        top: PIC.h / 2 - size * 0.6 + y,
        textAlign: 'center',
        fontFamily: SERIF,
        fontSize: size,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        lineHeight: 1.05,
        color: '#f4efe4',
        textShadow: '0 4px 24px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)',
        opacity: p,
        scale: interpolate(p, [0, 1], [1.35, 1]),
        filter: `blur(${interpolate(p, [0, 1], [10, 0])}px)`,
      }}
    >
      {text}
    </div>
  )
}

/** the money the cart has taken, counting up through a shot (in the bottom bar) */
const Money: React.FC<{ from: number; to: number; len: number }> = ({ from, to, len }) => {
  const frame = useCurrentFrame()
  const v = Math.round(interpolate(frame, [0, len * 0.7], [from, to], clamp))
  const bump = spring({ frame, fps: 30, config: { damping: 9, stiffness: 300, mass: 0.5 } })
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: PIC.h + BAR + 70, display: 'flex', justifyContent: 'center', scale: from === to ? 1 : interpolate(bump, [0, 1], [1.25, 1]) }}>
      <Plate size={70} tone="green">${v}</Plate>
    </div>
  )
}

const Shot: React.FC<{ shot: EpicShot }> = ({ shot }) => {
  const len = f(shot.beats)
  const slams = shot.slams ?? []
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, top: BAR, width: PIC.w, height: PIC.h, overflow: 'hidden', background: '#000' }}>
        {shot.src ? <Footage shot={shot} len={len} /> : null}
        {slams.map((s, i) => (
          <Slam key={i} text={s.text} at={f(s.beat)} size={s.size} index={i} count={slams.length} />
        ))}
        {shot.cute ? (
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 90px', textAlign: 'center', fontFamily: BODY, fontSize: 72, lineHeight: 1.25, color: '#fff' }}>{shot.cute}</AbsoluteFill>
        ) : null}
        {slams.length || shot.at === 0 ? <Flash /> : null}
      </div>
      {shot.money ? <Money from={shot.money[0]} to={shot.money[1]} len={len} /> : null}
    </AbsoluteFill>
  )
}

/** the last six beats: the title slams in, then where to play */
const Title: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = interpolate(frame, [0, 6], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
  const sub = interpolate(frame, [f(1), f(1) + 10], [0, 1], clamp)
  const cta = spring({ frame: frame - f(3), fps, config: { damping: 11, stiffness: 200, mass: 0.6 } })
  const shake = useShake(22)
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 40% at 50% 47%, #3a2a12, #000 70%)' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 720, textAlign: 'center', translate: `${shake.x}px ${shake.y}px` }}>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 150,
            letterSpacing: '0.06em',
            lineHeight: 1,
            background: 'linear-gradient(180deg, #fff6d8 0%, #f2c45a 45%, #9a6418 55%, #f6d27a 100%)',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
            filter: 'drop-shadow(0 6px 18px rgba(255,170,60,0.35))',
            opacity: p,
            scale: interpolate(p, [0, 1], [1.5, 1]),
          }}
        >
          HALAL
          <br />
          RUSH
        </div>
        <div style={{ marginTop: 36, fontFamily: SERIF, fontSize: 40, letterSpacing: '0.45em', color: '#e9dcc0', opacity: sub }}>A CLUB NYC JOB</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1300, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, opacity: interpolate(cta, [0, 0.4], [0, 1], clamp), scale: interpolate(cta, [0, 1], [0.8, 1]) }}>
        <Img src={staticFile('game/art/ui/logo.png')} style={{ width: 300 }} />
        <div style={{ fontFamily: DISPLAY, fontSize: 56, color: '#fff' }}>Now hiring.</div>
      </div>
      {/* the parody rating card, bottom left, like a real trailer's */}
      <div style={{ position: 'absolute', left: 60, bottom: 120, border: '3px solid #e9dcc0', padding: '10px 16px', fontFamily: SERIF, fontSize: 24, letterSpacing: '0.08em', color: '#e9dcc0', opacity: sub, lineHeight: 1.3 }}>
        RATED E
        <br />
        <span style={{ fontFamily: BODY, fontSize: 18 }}>FOR EXTRA WHITE SAUCE</span>
      </div>
      <Flash frames={7} />
    </AbsoluteFill>
  )
}

/**
 * The mock-epic reel (epic.ts): a blockbuster trailer about a halal cart's lunch rush. 1080 x 1920 with letterbox
 * bars, so the bars carry the counter and the picture keeps the middle, clear of the apps' buttons.
 * `music`: 'shuffle' = the Sidewalk Shuffle prototype; 'track' = the bought trailer track (epic.ts TRACK) + the hits.
 */
export const EpicReel: React.FC<{ music: 'shuffle' | 'track' }> = ({ music }) => (
  <AbsoluteFill style={{ background: '#000', color: INK }}>
    {EPIC_SHOTS.map((s, i) => (
      <Sequence key={i} from={f(s.at)} durationInFrames={i === EPIC_SHOTS.length - 1 ? EPIC_FRAMES - f(s.at) : f(s.beats)} name={s.slams?.map((x) => x.text).join(' ') || s.cute || (s.src ? s.src : 'Title')}>
        {i === EPIC_SHOTS.length - 1 ? <Title /> : <Shot shot={s} />}
      </Sequence>
    ))}
    {music === 'track' && TRACK ? (
      <>
        <Audio src={staticFile(`audio/${TRACK.file}`)} trimBefore={Math.round(TRACK.offset * 30)} />
        <Audio src={staticFile('audio/epic-hits.wav')} />
      </>
    ) : (
      <Audio src={staticFile('audio/epic-shuffle.wav')} />
    )}
  </AbsoluteFill>
)
