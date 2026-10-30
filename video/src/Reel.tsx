import { Audio, Video } from '@remotion/media'
import type React from 'react'
import { AbsoluteFill, Easing, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { REELS, type ReelShot } from './reels'
import { DISPLAY, INK, PAPER } from './theme'
import { Plate, usePop } from './ui'
import { BEAT } from './timeline'

export const REEL_W = 1080
export const REEL_H = 1920

/** Taxi Yellow, the reel's highlight colour (the signature colour of the same name in the game) */
const YELLOW = '#ffc634'
/** where the 16:9 game window sits: full width with a margin, in the middle band (clear of the apps' buttons) */
const WIN = { x: 40, y: 660, w: 1000, h: 563 }
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** the footage twice: blurred and dimmed to fill the frame, and sharp in a game window */
const ShotView: React.FC<{ shot: ReelShot; len: number }> = ({ shot, len }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const src = staticFile(`footage/${shot.src}`)
  const trim = Math.round((shot.at ?? 0) * fps)
  const z = interpolate(frame, [0, len], shot.zoom ?? [1.02, 1.08], clamp)
  // the window lands with a little bounce on every cut
  const land = spring({ frame, fps, config: { damping: 13, stiffness: 220, mass: 0.6 } })
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: 'blur(38px) brightness(0.55) saturate(1.25)', scale: 1.35 }}>
        <Video src={src} trimBefore={trim} muted objectFit="cover" style={{ width: '100%', height: '100%' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(rgba(16,27,63,0.55), rgba(16,27,63,0) 30%, rgba(16,27,63,0) 70%, rgba(16,27,63,0.6))' }} />
      <div
        style={{
          position: 'absolute',
          left: WIN.x,
          top: WIN.y,
          width: WIN.w,
          height: WIN.h,
          borderRadius: 34,
          overflow: 'hidden',
          border: `8px solid ${PAPER}`,
          boxShadow: `0 18px 0 rgba(0,0,0,0.35), 0 0 0 4px ${INK}`,
          scale: interpolate(land, [0, 1], [0.94, 1]),
          rotate: `${interpolate(land, [0, 1], [-1.2, 0])}deg`,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, scale: z, transformOrigin: shot.origin ?? '50% 50%' }}>
          <Video src={src} trimBefore={trim} muted objectFit="cover" style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
    </AbsoluteFill>
  )
}

/** a 16:9 clip filling a `w` x `h` panel at full height, centred on `cx` (0 to 1 across the clip), drifting to `pan` */
export const Crop: React.FC<{ src: string; at?: number; w: number; h: number; cx: number; pan?: number; zoom: [number, number]; len: number }> = ({ src, at = 0, w, h, cx, pan, zoom, len }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const full = (h * 16) / 9
  const c = interpolate(frame, [0, len], [cx, pan ?? cx], { ...clamp, easing: Easing.inOut(Easing.quad) })
  const left = Math.min(0, Math.max(w - full, w / 2 - c * full))
  const z = interpolate(frame, [0, len], zoom, clamp)
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: INK }}>
      <div style={{ position: 'absolute', top: 0, left, width: full, height: h, scale: z, transformOrigin: `${c * 100}% 60%` }}>
        <Video src={staticFile(`footage/${src}`)} trimBefore={Math.round(at * fps)} muted objectFit="cover" style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}

/** portrait reels: the game fills the frame. A soft ink fade at the top keeps the hook readable */
const PortraitShot: React.FC<{ shot: ReelShot; len: number }> = ({ shot, len }) => {
  const zoom = shot.zoom ?? [1, 1.06]
  const land = usePop(0, 14)
  if (shot.mode === 'photo' && shot.photo) {
    return (
      <AbsoluteFill style={{ background: INK }}>
        <div style={{ position: 'absolute', inset: 0, filter: shot.photo.mono ? 'grayscale(1) contrast(1.08) brightness(0.82)' : undefined }}>
          <Still src={shot.photo.src} pos={shot.photo.pos} len={len} />
        </div>
        <AbsoluteFill style={{ background: `linear-gradient(rgba(16,27,63,0.72), rgba(16,27,63,0) 40%, rgba(16,27,63,0) 70%, rgba(16,27,63,0.5))` }} />
        <div style={{ position: 'absolute', right: 40, top: 1240, maxWidth: 420, textAlign: 'right', fontFamily: DISPLAY, fontSize: 21, lineHeight: 1.2, color: '#fff', opacity: 0.8, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{shot.photo.credit}</div>
      </AbsoluteFill>
    )
  }
  if (shot.mode === 'real' && shot.photo) {
    const H = (REEL_H - 20) / 2
    return (
      <AbsoluteFill style={{ background: INK }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: REEL_W, height: H, overflow: 'hidden' }}>
          <Still src={shot.photo.src} pos={shot.photo.pos} len={len} />
          {/* in the corner, clear of the coin on the seam (it spans the middle 160 px) */}
          <div style={{ position: 'absolute', right: 26, bottom: 16, maxWidth: 380, textAlign: 'right', fontFamily: DISPLAY, fontSize: 21, lineHeight: 1.2, color: '#fff', opacity: 0.85, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{shot.photo.credit}</div>
        </div>
        <div style={{ position: 'absolute', left: 0, top: H + 20, width: REEL_W, height: H, overflow: 'hidden', translate: `${interpolate(land, [0, 1], [REEL_W, 0])}px 0` }}>
          <Crop src={shot.src!} at={shot.at} w={REEL_W} h={H} cx={shot.cx ?? 0.5} pan={shot.pan} zoom={zoom} len={len} />
        </div>
        <AbsoluteFill style={{ background: `linear-gradient(rgba(16,27,63,0.7), rgba(16,27,63,0) 30%)` }} />
        <div style={{ position: 'absolute', left: REEL_W / 2 - 80, top: H + 10 - 80, width: 160, height: 160, borderRadius: '50%', background: YELLOW, border: `8px solid ${INK}`, boxShadow: `0 10px 0 ${INK}`, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontSize: 64, color: INK, scale: land }}>vs</div>
        <Tag text={shot.photo.label ?? 'Real New York'} y={H - 150} />
        <Tag text={shot.place ?? 'Club NYC'} y={REEL_H - 420} delay={4} tone="sun" />
      </AbsoluteFill>
    )
  }
  if (shot.mode === 'stack' && shot.b) {
    const H = (REEL_H - 20) / 2
    return (
      <AbsoluteFill style={{ background: INK }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: REEL_W, height: H, overflow: 'hidden' }}>
          <Crop src={shot.src!} at={shot.at} w={REEL_W} h={H} cx={shot.cx ?? 0.5} pan={shot.pan} zoom={zoom} len={len} />
        </div>
        <div style={{ position: 'absolute', left: 0, top: H + 20, width: REEL_W, height: H, overflow: 'hidden', translate: `${interpolate(land, [0, 1], [REEL_W, 0])}px 0` }}>
          <Crop src={shot.b.src} at={shot.b.at} w={REEL_W} h={H} cx={shot.b.cx ?? 0.5} zoom={zoom} len={len} />
        </div>
        <AbsoluteFill style={{ background: `linear-gradient(rgba(16,27,63,0.7), rgba(16,27,63,0) 30%)` }} />
        {/* the "or" coin on the seam */}
        <div style={{ position: 'absolute', left: REEL_W / 2 - 80, top: H + 10 - 80, width: 160, height: 160, borderRadius: '50%', background: YELLOW, border: `8px solid ${INK}`, boxShadow: `0 10px 0 ${INK}`, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontSize: 70, color: INK, scale: land }}>or</div>
        {shot.place ? <Tag text={shot.place} y={H - 150} /> : null}
        {shot.b.place ? <Tag text={shot.b.place} y={REEL_H - 420} delay={4} /> : null}
      </AbsoluteFill>
    )
  }
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Crop src={shot.src!} at={shot.at} w={REEL_W} h={REEL_H} cx={shot.cx ?? 0.5} pan={shot.pan} zoom={zoom} len={len} />
      <AbsoluteFill style={{ background: `linear-gradient(rgba(16,27,63,0.72), rgba(16,27,63,0) 36%, rgba(16,27,63,0) 70%, rgba(16,27,63,0.45))` }} />
      {/* above the New Yorker's head: they walk through the lower middle of every tall shot */}
      {shot.place ? <Tag text={shot.place} y={1090} /> : null}
    </AbsoluteFill>
  )
}

/** a place plate at height `y`, popping in just after the cut */
const Tag: React.FC<{ text: string; y: number; delay?: number; tone?: 'sun' }> = ({ text, y, delay = 0, tone }) => {
  const p = usePop(5 + delay)
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: y, display: 'flex', justifyContent: 'center', opacity: interpolate(p, [0, 0.3], [0, 1], clamp), scale: interpolate(p, [0, 1], [0.6, 1]) }}>
      <Plate size={58} tone={tone}>{text}</Plate>
    </div>
  )
}

/** a photo filling its panel, pushing in slowly (the real-New-York half of a `real` shot) */
const Still: React.FC<{ src: string; pos?: string; len: number }> = ({ src, pos = '50% 50%', len }) => {
  const frame = useCurrentFrame()
  return <Img src={staticFile(`posts/${src}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos, scale: interpolate(frame, [0, len], [1.04, 1.12], clamp), transformOrigin: pos }} />
}

/** a white chip with a clock time (or any short label), under the hook */
const Chip: React.FC<{ text: string }> = ({ text }) => {
  const p = usePop(2)
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 160, display: 'flex', justifyContent: 'center', scale: interpolate(p, [0, 1], [0.6, 1]), opacity: interpolate(p, [0, 0.3], [0, 1], clamp) }}>
      <Plate size={50} tone="sun">{text}</Plate>
    </div>
  )
}

/** the caption, popping in word by word (a word every 3 frames); *word* is yellow */
export const Hook: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const words = text.split(' ')
  return (
    <div
      style={{
        position: 'absolute',
        left: 70,
        right: 70,
        top: 250,
        height: 360,
        display: 'flex',
        flexWrap: 'wrap',
        alignContent: 'flex-end',
        justifyContent: 'center',
        columnGap: 26,
        rowGap: 6,
        fontFamily: DISPLAY,
        fontSize: words.length > 4 ? 92 : 124,
        lineHeight: 1.08,
        color: '#fff',
        textAlign: 'center',
        textShadow: `0 8px 0 ${INK}, 0 0 4px ${INK}`,
        WebkitTextStroke: `3px ${INK}`,
        paintOrder: 'stroke fill',
      }}
    >
      {words.map((w, i) => {
        const p = spring({ frame: frame - i * 3, fps, config: { damping: 11, stiffness: 240, mass: 0.5 } })
        // *two words* stay yellow from the opening star to the closing one
        const opened = words.slice(0, i + 1).join(' ').split('*').length - 1
        const hi = w.includes('*') || opened % 2 === 1
        return (
          <span key={i} style={{ display: 'inline-block', color: hi ? YELLOW : '#fff', opacity: interpolate(p, [0, 0.3], [0, 1], clamp), translate: `0 ${interpolate(p, [0, 1], [40, 0])}px`, scale: interpolate(p, [0, 1], [0.7, 1]) }}>
            {w.replace(/\*/g, '')}
          </span>
        )
      })}
    </div>
  )
}

/** a game-style plate under the window naming where we are, popping in just after the cut */
const PlaceTag: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = spring({ frame: frame - 5, fps, config: { damping: 11, stiffness: 220, mass: 0.6 } })
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: WIN.y + WIN.h + 64, display: 'flex', justifyContent: 'center', opacity: interpolate(p, [0, 0.3], [0, 1], clamp), scale: interpolate(p, [0, 1], [0.6, 1]) }}>
      <Plate size={58}>{text}</Plate>
    </div>
  )
}

/** the last beats: the logo, an optional line, then where to get it */
export const EndCard: React.FC<{ title?: string; line: string }> = ({ title, line }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const logo = spring({ frame, fps, config: { damping: 10, stiffness: 200, mass: 0.6 } })
  const txt = spring({ frame: frame - 6, fps, config: { damping: 12, stiffness: 220, mass: 0.6 } })
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 42%, #3d72d9, #1d2140 72%)', alignItems: 'center', justifyContent: 'center', gap: 34 }}>
      <Img src={staticFile('game/art/ui/logo.png')} style={{ width: 640, scale: interpolate(logo, [0, 1], [0.5, 1]), rotate: `${interpolate(logo, [0, 1], [-8, 0])}deg`, filter: 'drop-shadow(0 16px 0 rgba(0,0,0,0.3))' }} />
      {title ? <div style={{ fontFamily: DISPLAY, fontSize: 84, color: '#fff', textShadow: `0 7px 0 ${INK}`, opacity: txt, translate: `0 ${interpolate(txt, [0, 1], [30, 0])}px` }}>{title}</div> : null}
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 58,
          color: INK,
          background: YELLOW,
          border: `6px solid ${INK}`,
          borderRadius: 30,
          padding: '10px 40px 14px',
          boxShadow: `0 9px 0 ${INK}`,
          opacity: txt,
          scale: interpolate(txt, [0, 1], [0.8, 1]),
        }}
      >
        {line}
      </div>
    </AbsoluteFill>
  )
}

/**
 * A 9:16 reel from reels.ts: the game window in the middle band over its own blurred footage, word-by-word captions
 * in the top third, everything clear of the bottom fifth and right edge where Instagram and TikTok draw their buttons.
 * `audio`: 'music' (Sidewalk Shuffle plus sound effects) or 'sfx' (sound effects only, to lay a trending sound over).
 */
export const Reel: React.FC<{ id: string; audio: 'music' | 'sfx' }> = ({ id, audio }) => {
  const reel = REELS[id]
  let at = 0
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {reel.shots.map((s, i) => {
        const from = at
        const len = s.beats * BEAT
        at += len
        return (
          <Sequence key={i} from={from} durationInFrames={len} name={s.hook ?? 'End card'}>
            {(s.src || s.photo) && reel.layout === 'portrait' ? (
              <>
                <PortraitShot shot={s} len={len} />
                {s.hook ? <Hook text={s.hook} /> : null}
                {s.chip ? <Chip text={s.chip} /> : null}
              </>
            ) : s.src ? (
              <>
                <ShotView shot={s} len={len} />
                {s.hook ? <Hook text={s.hook} /> : null}
                {s.place ? <PlaceTag text={s.place} /> : null}
              </>
            ) : (
              <EndCard {...reel.end} />
            )}
          </Sequence>
        )
      })}
      <Audio src={staticFile(`audio/reel-${id}${audio === 'sfx' ? '-sfx' : ''}.wav`)} />
    </AbsoluteFill>
  )
}
