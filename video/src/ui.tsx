import type React from 'react'
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { BLUE, BLUE_DARK, BLUE_LIGHT, DISPLAY, INK, PAPER, SUN } from './theme'

/** 0 → 1 with a little overshoot, starting at local frame `at` (the game's pop-in) */
export function usePop(at: number, damping = 11) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - at, fps, config: { damping, stiffness: 190, mass: 0.6 } })
}

/** fades and shrinks something out over the 6 frames before `until` */
function useOut(until?: number) {
  const frame = useCurrentFrame()
  if (until === undefined) return 1
  return interpolate(frame, [until - 6, until], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
}

type Tone = 'blue' | 'sun' | 'green' | 'white'
const TONES: Record<Tone, { bg: string; fg: string; shade: string }> = {
  blue: { bg: `linear-gradient(${BLUE_LIGHT}, ${BLUE})`, fg: '#fff', shade: BLUE_DARK },
  sun: { bg: 'linear-gradient(#ffe39a, #ffc340)', fg: INK, shade: 'rgba(255,255,255,0.6)' },
  green: { bg: 'linear-gradient(#8be28b, #2fa54a)', fg: '#fff', shade: '#1b6b2e' },
  white: { bg: '#fff', fg: INK, shade: 'rgba(29,33,64,0.12)' },
}

/** the game's chunky plate (like the place sign in the corner of every room), scaled for video */
export const Plate: React.FC<{ children: React.ReactNode; size?: number; tone?: Tone; style?: React.CSSProperties }> = ({ children, size = 84, tone = 'blue', style }) => {
  const t = TONES[tone]
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.3,
        padding: `${size * 0.2}px ${size * 0.46}px ${size * 0.24}px`,
        background: t.bg,
        border: `${Math.round(size * 0.075)}px solid ${INK}`,
        borderRadius: size * 0.34,
        boxShadow: `inset 0 ${Math.round(size * 0.05)}px 0 rgba(255,255,255,0.5), 0 ${Math.round(size * 0.1)}px 0 ${INK}`,
        color: t.fg,
        fontFamily: DISPLAY,
        fontSize: size,
        lineHeight: 1.12,
        textShadow: `0 ${Math.round(size * 0.05)}px 0 ${t.shade}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** a plate that pops in on a beat; `x`/`y` are its centre */
export const Caption: React.FC<{ children: React.ReactNode; at?: number; until?: number; x?: number; y: number; size?: number; tone?: Tone }> = ({
  children,
  at = 0,
  until,
  x = 960,
  y,
  size = 92,
  tone = 'blue',
}) => {
  const p = usePop(at)
  const out = useOut(until)
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        translate: '-50% -50%',
        scale: (0.35 + 0.65 * p) * (0.9 + 0.1 * out),
        opacity: Math.min(1, p * 3) * out,
      }}
    >
      <Plate size={size} tone={tone}>
        {children}
      </Plate>
    </div>
  )
}

/** a room's sign: its name and neighborhood, like the plate in the corner of the game */
export const PlaceSign: React.FC<{ name: string; area?: string; at?: number }> = ({ name, area, at = 0 }) => {
  const p = usePop(at, 14)
  return (
    <div
      style={{
        position: 'absolute',
        left: 72,
        bottom: 76,
        translate: `${interpolate(p, [0, 1], [-60, 0])}px 0`,
        opacity: Math.min(1, p * 2.5),
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '16px 34px 20px',
        background: `linear-gradient(${BLUE_LIGHT}, ${BLUE})`,
        border: `6px solid ${INK}`,
        borderRadius: 30,
        boxShadow: `inset 0 4px 0 rgba(255,255,255,0.5), 0 7px 0 ${INK}`,
        color: '#fff',
      }}
    >
      <b style={{ fontFamily: DISPLAY, fontWeight: 400, fontSize: 64, lineHeight: 1.1, textShadow: `0 4px 0 ${BLUE_DARK}` }}>{name}</b>
      {area ? <span style={{ fontFamily: DISPLAY, fontSize: 30, opacity: 0.92 }}>{area}</span> : null}
    </div>
  )
}

/** an in-game chat bubble with the speaker's name tag under it; (x, y) is the tip of the tail */
export const Bubble: React.FC<{ children: React.ReactNode; name: string; at: number; until?: number; x: number; y: number }> = ({ children, name, at, until, x, y }) => {
  const p = usePop(at, 10)
  const out = useOut(until)
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: Math.min(1, p * 3) * out, scale: (0.4 + 0.6 * p) * (0.85 + 0.15 * out), transformOrigin: '0 0' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 22,
          translate: '-50% 0',
          padding: '18px 34px 20px',
          background: '#fff',
          border: `6px solid ${INK}`,
          borderRadius: 40,
          boxShadow: '0 6px 0 rgba(29,33,64,0.25)',
          fontFamily: DISPLAY,
          fontSize: 60,
          lineHeight: 1.15,
          color: INK,
          whiteSpace: 'nowrap',
        }}
      >
        {children}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: -19,
            width: 30,
            height: 30,
            translate: '-50% 0',
            rotate: '45deg',
            background: '#fff',
            borderRight: `6px solid ${INK}`,
            borderBottom: `6px solid ${INK}`,
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 18,
          translate: '-50% 0',
          padding: '5px 16px 7px',
          borderRadius: 14,
          background: 'rgba(255,255,255,0.96)',
          fontFamily: DISPLAY,
          fontSize: 30,
          color: INK,
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </div>
    </div>
  )
}

/** the game's illustrated emoji (app/public/art/icons/e): each sits in a square like a font's emoji, in its own shape */
export const Icon: React.FC<{ name: string; size?: number }> = ({ name, size = 64 }) => (
  <Img src={staticFile(`game/art/icons/e/${name}.png`)} style={{ width: size, height: size, objectFit: 'contain', verticalAlign: '-0.18em', marginLeft: size * 0.18 }} />
)

/** "+20" rising off a coin, like the game's coin float */
export const CoinPop: React.FC<{ at: number; x: number; y: number; amount: number }> = ({ at, x, y, amount }) => {
  const frame = useCurrentFrame()
  const p = usePop(at, 9)
  const t = frame - at
  const fade = interpolate(t, [14, 24], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  if (t < 0) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        translate: `-50% ${interpolate(t, [0, 24], [0, -90], { extrapolateRight: 'clamp' })}px`,
        scale: 0.5 + 0.5 * p,
        opacity: fade,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: DISPLAY,
        fontSize: 96,
        color: SUN,
        WebkitTextStroke: `10px ${INK}`,
        paintOrder: 'stroke fill',
        textShadow: `0 8px 0 ${INK}`,
      }}
    >
      <Img src={staticFile('game/art/icons/e/coin.png')} style={{ width: 96, height: 96, objectFit: 'contain' }} />+{amount}
    </div>
  )
}

/** the green "Play now" button */
export const PlayButton: React.FC<{ at: number; label?: string }> = ({ at, label = 'Play now' }) => {
  const p = usePop(at, 9)
  return (
    <div
      style={{
        scale: 0.3 + 0.7 * p,
        opacity: Math.min(1, p * 3),
        display: 'inline-flex',
        alignItems: 'center',
        gap: 26,
        padding: '22px 64px 28px',
        background: 'linear-gradient(#8be28b, #2fa54a)',
        border: `8px solid ${INK}`,
        borderRadius: 40,
        boxShadow: `inset 0 6px 0 rgba(255,255,255,0.45), 0 12px 0 ${INK}`,
        color: '#fff',
        fontFamily: DISPLAY,
        fontSize: 96,
        lineHeight: 1.1,
        textShadow: '0 5px 0 #1b6b2e',
      }}
    >
      {label}
      <svg width="76" height="76" viewBox="0 0 24 24" style={{ filter: 'drop-shadow(0 4px 0 #1b6b2e)' }}>
        <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------- the group chat that tells the story
/** three friends, with their faces from the New Yorker creator (video/public/footage/face-N.png, made by capture.py) */
export const FRIENDS = {
  ana: { name: 'Ana_NYC', face: 'face-3.png', tint: '#d63a74' },
  ben: { name: 'BenFromBK', face: 'face-6.png', tint: BLUE },
  cleo: { name: 'Cleo', face: 'face-5.png', tint: '#d0650f' },
} as const
export type Friend = keyof typeof FRIENDS

const Face: React.FC<{ who: Friend; size: number }> = ({ who, size }) => (
  <Img
    src={staticFile(`footage/${FRIENDS[who].face}`)}
    style={{ width: size, height: size, flex: 'none', boxSizing: 'border-box', borderRadius: '50%', border: `${Math.round(size * 0.07)}px solid ${INK}`, background: '#fff' }}
  />
)

/** one message: a face, then a bubble with the name over the words */
const Message: React.FC<{ who: Friend; children: React.ReactNode; size?: number }> = ({ who, children, size = 48 }) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: size * 0.3 }}>
    <Face who={who} size={Math.round(size * 1.75)} />
    <div
      style={{
        padding: `${size * 0.24}px ${size * 0.5}px ${size * 0.3}px`,
        background: '#fff',
        border: `${Math.round(size * 0.12)}px solid ${INK}`,
        borderRadius: `${size * 0.6}px ${size * 0.6}px ${size * 0.6}px ${size * 0.14}px`,
        boxShadow: `0 ${Math.round(size * 0.12)}px 0 rgba(29,33,64,0.22)`,
      }}
    >
      <div style={{ fontFamily: DISPLAY, fontSize: size * 0.52, lineHeight: 1.1, color: FRIENDS[who].tint }}>{FRIENDS[who].name}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: size, lineHeight: 1.15, color: INK, whiteSpace: 'nowrap' }}>{children}</div>
    </div>
  </div>
)

/** a message from the group chat popping up in a right-hand corner on a beat (the bottom one unless `top`) */
export const Msg: React.FC<{ who: Friend; at?: number; until: number; top?: boolean; children: React.ReactNode }> = ({ who, at = 0, until, top, children }) => {
  const p = usePop(at, 12)
  const out = useOut(until)
  if (useCurrentFrame() < at) return null
  return (
    <div
      style={{
        position: 'absolute',
        right: 72,
        ...(top ? { top: 72 } : { bottom: 80 }),
        transformOrigin: top ? '0% 0%' : '0% 100%',
        translate: `0 ${interpolate(p, [0, 1], [top ? -60 : 60, 0])}px`,
        scale: (0.55 + 0.45 * p) * (0.9 + 0.1 * out),
        opacity: Math.min(1, p * 3) * out,
      }}
    >
      <Message who={who} size={50}>
        {children}
      </Message>
    </div>
  )
}

/** the opening: the group chat filling up, one message per beat, until it flies off at `leave` */
export const ChatCard: React.FC<{ lines: { who: Friend; at: number; text: React.ReactNode }[]; leave: number }> = ({ lines, leave }) => {
  const frame = useCurrentFrame()
  const p = usePop(2, 13)
  const gone = interpolate(frame, [leave, leave + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) })
  return (
    <div
      style={{
        position: 'absolute',
        left: 960,
        top: 520,
        width: 1100,
        translate: `-50% calc(-50% + ${interpolate(p, [0, 1], [90, 0]) - gone * 1000}px)`,
        rotate: `${gone * -7}deg`,
        scale: 0.85 + 0.15 * p,
        opacity: Math.min(1, p * 3),
        overflow: 'hidden',
        background: PAPER,
        border: `8px solid ${INK}`,
        borderRadius: 48,
        boxShadow: `0 14px 0 ${INK}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '20px 34px 22px', background: `linear-gradient(${BLUE_LIGHT}, ${BLUE})`, borderBottom: `8px solid ${INK}` }}>
        <div style={{ display: 'flex' }}>
          {(Object.keys(FRIENDS) as Friend[]).map((w, i) => (
            <div key={w} style={{ marginLeft: i ? -24 : 0 }}>
              <Face who={w} size={80} />
            </div>
          ))}
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 58, color: '#fff', textShadow: `0 4px 0 ${BLUE_DARK}` }}>the crew</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '30px 38px 36px' }}>
        {lines.map((l) => (
          <ChatLine key={l.at} at={l.at} who={l.who}>
            {l.text}
          </ChatLine>
        ))}
      </div>
    </div>
  )
}
const ChatLine: React.FC<{ who: Friend; at: number; children: React.ReactNode }> = ({ who, at, children }) => {
  const p = usePop(at, 11)
  const shown = useCurrentFrame() >= at
  return (
    <div style={{ opacity: shown ? Math.min(1, p * 3) : 0, translate: `0 ${interpolate(p, [0, 1], [30, 0])}px`, scale: 0.7 + 0.3 * p, transformOrigin: '0% 100%' }}>
      <Message who={who} size={52}>
        {children}
      </Message>
    </div>
  )
}

// ---------------------------------------------------------------- the yellow cab
/** a New York cab from the side, in the game's chunky ink outlines, facing right; `spin` turns the wheels (degrees) */
export const Cab: React.FC<{ width: number; spin: number }> = ({ width, spin }) => {
  const wheel = (cx: number) => (
    <g transform={`translate(${cx} 238)`}>
      <circle r="44" fill={INK} />
      <g transform={`rotate(${spin})`}>
        <circle r="22" fill="#d7deec" stroke={INK} strokeWidth="6" />
        <path d="M-14 0H14M0 -14V14" stroke={INK} strokeWidth="6" strokeLinecap="round" />
      </g>
    </g>
  )
  return (
    <svg width={width} viewBox="0 0 620 300" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <pattern id="cab-check" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#fff" />
          <rect width="12" height="12" fill={INK} />
          <rect x="12" y="12" width="12" height="12" fill={INK} />
        </pattern>
      </defs>
      <ellipse cx="312" cy="284" rx="270" ry="14" fill="rgba(29,33,64,0.28)" />
      {/* the roof light */}
      <rect x="282" y="18" width="96" height="40" rx="12" fill="#fff6cf" stroke={INK} strokeWidth="7" />
      <text x="330" y="48" textAnchor="middle" fontFamily={DISPLAY} fontSize="27" fill={INK}>
        TAXI
      </text>
      {/* the body */}
      <path
        d="M40 172 Q40 140 74 136 L190 128 L242 70 Q252 58 272 58 L408 58 Q428 58 440 72 L492 128 L560 138 Q590 143 592 176 L594 214 Q594 240 568 240 L64 240 Q40 240 40 214 Z"
        fill="#ffc83a"
        stroke={INK}
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <path d="M78 146 L196 138 L248 80 Q256 70 272 70 L404 70" fill="none" stroke="#ffe39a" strokeWidth="9" strokeLinecap="round" />
      {/* the windows */}
      <path d="M258 80 L320 80 L320 128 L214 128 Z" fill="#9fd6ff" stroke={INK} strokeWidth="7" strokeLinejoin="round" />
      <path d="M336 80 L406 80 Q418 80 426 92 L462 128 L336 128 Z" fill="#9fd6ff" stroke={INK} strokeWidth="7" strokeLinejoin="round" />
      {/* the checker stripe, doors and lights */}
      <rect x="58" y="160" width="520" height="24" fill="url(#cab-check)" stroke={INK} strokeWidth="5" />
      <path d="M328 132 V234 M206 136 V234 M458 136 V234" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <rect x="282" y="196" width="30" height="9" rx="4" fill={INK} />
      <rect x="420" y="196" width="30" height="9" rx="4" fill={INK} />
      <ellipse cx="584" cy="190" rx="10" ry="15" fill="#fff6c8" stroke={INK} strokeWidth="5" />
      <rect x="34" y="176" width="16" height="26" rx="5" fill="#ff5d5d" stroke={INK} strokeWidth="5" />
      {wheel(150)}
      {wheel(470)}
    </svg>
  )
}

/**
 * The cab drives across the cut: the new scene (`children`) appears behind it, edged with a strip of taxi checker,
 * while the old scene is still under the road ahead. `frames` is how long the drive takes.
 */
export const TaxiReveal: React.FC<{ frames?: number; children: React.ReactNode }> = ({ frames = 16, children }) => {
  const frame = useCurrentFrame()
  if (frame >= frames) return <AbsoluteFill>{children}</AbsoluteFill>
  const CAB = 640
  const STRIP = 64
  // the edge of the new scene: from off the left (cab and all) to past the right
  const edge = interpolate(frame, [0, frames], [-(STRIP + CAB), 1920 + 4], { extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0.05, 0.7, 0.95) })
  const shown = Math.max(0, Math.min(1920, edge))
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(0 ${1920 - shown}px 0 0)` }}>{children}</AbsoluteFill>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: edge, width: STRIP, background: `repeating-conic-gradient(${INK} 0 25%, #fff 0 50%) 0 0 / ${STRIP}px ${STRIP}px`, borderLeft: `6px solid ${INK}`, borderRight: `6px solid ${INK}` }} />
      {/* speed lines over the new scene, and the cab pulling away */}
      {[470, 560, 650].map((y, i) => (
        <div key={y} style={{ position: 'absolute', left: edge - 260 + i * 40, top: y, width: 230 - i * 30, height: 12, borderRadius: 6, background: SUN, border: `4px solid ${INK}`, opacity: 0.9 }} />
      ))}
      <div style={{ position: 'absolute', left: edge + STRIP - 14, top: 392 + Math.sin(frame * 1.7) * 4 }}>
        <Cab width={CAB} spin={frame * 48} />
      </div>
    </AbsoluteFill>
  )
}
