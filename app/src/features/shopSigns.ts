import './shopSigns.css'
import { el } from '../engine/stage'
import { onRoom } from '../engine/world'

/**
 * Shop signs drawn over the painted ones. The sneaker store's art has a real brand's neon logo painted into it;
 * this covers that sign with our own parody mark (a neon pigeon and a fat rounded wordmark), so the logo artwork
 * on screen is ours. The room hook registers on import (game.ts imports this before the first room is built).
 */
/** change the parody wordmark here */
const WORD = 'VAULT'

const SIGN = `<svg viewBox="0 0 184 186" aria-hidden="true">
  <rect x="5" y="5" width="174" height="176" rx="26" fill="#0b1a78" stroke="#0a1030" stroke-width="5"/>
  <rect x="5" y="5" width="174" height="176" rx="26" fill="url(#ss-glow)"/>
  <defs><radialGradient id="ss-glow" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#2a5cff" stop-opacity=".85"/><stop offset="1" stop-color="#0b1a78" stop-opacity="0"/></radialGradient></defs>
  <rect class="ss-tube" x="14" y="14" width="156" height="158" rx="19" fill="none" stroke="#7fe9ff" stroke-width="4"/>
  <g transform="rotate(-5 92 93)">
    <g class="ss-bird" fill="none" stroke="#ffc2ef" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 44 88 L 28 78 L 34 96 Q 50 108 74 104 L 104 104 Q 130 100 134 74 L 146 68 L 135 62 Q 134 46 120 46 Q 106 46 104 62 Q 78 56 44 88 Z"/>
      <path d="M 64 84 Q 80 70 98 82 Q 84 96 64 84 Z"/>
      <path d="M 82 105 L 82 116 M 75 116 L 89 116 M 100 105 L 100 116 M 93 116 L 107 116"/>
      <circle cx="121" cy="59" r="2" fill="#ffc2ef" stroke-width="3"/>
    </g>
    <text class="ss-word" x="92" y="161" text-anchor="middle" textLength="132" lengthAdjust="spacingAndGlyphs">${WORD}</text>
  </g>
</svg>`

onRoom('sneaker-vault', ({ geo, scene }) => {
  const r = geo.cutouts.neon?.rect ?? [742.6, 16.7, 164.1, 174.5]
  const sign = el('div', 'shop-sign', SIGN)
  // a little bigger than the painted sign, so none of it shows around the edge
  sign.style.cssText = `left:${r[0] - 10}px;top:${r[1] - 8}px;width:${r[2] + 20}px;height:${r[3] + 12}px`
  scene.append(sign)
  return () => sign.remove()
})
