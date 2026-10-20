import { Video } from '@remotion/media'
import type React from 'react'
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { INK } from './theme'

/**
 * One shot of real footage (video/public/footage: a clip, or a still) with a slow camera move.
 * `at` is where in the clip to start (seconds); `len` is the shot's length in frames, for the move.
 * `offset` shifts the move, so a shot can continue exactly where an earlier piece of the same move left off.
 */
export const Shot: React.FC<{
  src: string
  at?: number
  len: number
  zoom?: [number, number]
  origin?: string
  offset?: number
  blur?: [number, number]
  dim?: [number, number]
  children?: React.ReactNode
}> = ({ src, at = 0, len, zoom = [1.02, 1.08], origin = '50% 50%', offset = 0, blur, dim, children }) => {
  const frame = useCurrentFrame() + offset
  const { fps } = useVideoConfig()
  const still = /\.(png|jpe?g|webp)$/.test(src)
  const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const b = blur ? interpolate(frame, [0, len], blur, clamp) : 0
  const d = dim ? interpolate(frame, [0, len], dim, clamp) : 1
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: INK }}>
      <AbsoluteFill
        style={{
          scale: interpolate(frame, [0, len], zoom, { ...clamp, output: 'perceptual-scale' }),
          transformOrigin: origin,
          filter: b > 0.05 || d < 0.999 ? `blur(${b}px) brightness(${d})` : undefined,
        }}
      >
        {still ? (
          <Img src={staticFile(`footage/${src}`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Video src={staticFile(`footage/${src}`)} trimBefore={Math.round(at * fps)} muted objectFit="cover" style={{ width: '100%', height: '100%' }} />
        )}
      </AbsoluteFill>
      {children}
    </AbsoluteFill>
  )
}

/** darkens the edges a little, so text over footage stays easy to read */
export const Vignette: React.FC<{ strength?: number; top?: number }> = ({ strength = 0.55, top = 0 }) => (
  <AbsoluteFill
    style={{
      background: [
        top ? `linear-gradient(rgba(16,27,63,${top}), rgba(16,27,63,0) 38%)` : '',
        `radial-gradient(ellipse 75% 70% at 50% 52%, rgba(16,27,63,0) 55%, rgba(16,27,63,${strength}) 100%)`,
      ]
        .filter(Boolean)
        .join(','),
    }}
  />
)

/** a quick white flash on a cut */
export const Flash: React.FC<{ at?: number; strength?: number }> = ({ at = 0, strength = 0.45 }) => {
  const frame = useCurrentFrame()
  if (frame < at) return null
  const o = interpolate(frame - at, [0, 6], [strength, 0], { extrapolateRight: 'clamp' })
  return o > 0.001 ? <AbsoluteFill style={{ backgroundColor: '#fff', opacity: o }} /> : null
}
