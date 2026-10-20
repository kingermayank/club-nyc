import type React from 'react'
import { AbsoluteFill, Img, staticFile } from 'remotion'
import { Shot } from './Shot'
import { DISPLAY, INK, SUN } from './theme'

/**
 * The link-preview images (1200 x 630, app/public/og/): a landmark from the sharp footage, the logo and a line.
 * club-nyc.jpg is the landing page's, invite.jpg is what an invite link (/join/<name>) unfurls into.
 */
export const ShareCard: React.FC<{ src: string; at: number; origin: string; title: string; sub: string }> = ({ src, at, origin, title, sub }) => (
  <AbsoluteFill style={{ backgroundColor: INK }}>
    <Shot src={src} at={at} len={1} zoom={[1.0, 1.0]} origin={origin} />
    <AbsoluteFill style={{ background: 'linear-gradient(rgba(16,27,63,0) 38%, rgba(16,27,63,0.86) 92%)' }} />
    <Img src={staticFile('game/art/ui/logo.png')} style={{ position: 'absolute', left: 40, top: 28, width: 250, filter: 'drop-shadow(0 6px 0 rgba(16,27,63,0.55))' }} />
    <div style={{ position: 'absolute', left: 50, right: 50, bottom: 44 }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 80, lineHeight: 1.1, color: '#fff', textShadow: `0 6px 0 ${INK}` }}>{title}</div>
      <div style={{ marginTop: 10, fontFamily: DISPLAY, fontSize: 36, lineHeight: 1.2, color: SUN, textShadow: `0 3px 0 ${INK}` }}>{sub}</div>
    </div>
  </AbsoluteFill>
)
