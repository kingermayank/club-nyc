// Hand-drawn (well, hand-typed) SVG bits for Showtime!: arrow tiles, receptors, the tip hat, grade bullets.
export const INK = '#1d2140'

/** Lane order matches the keys: ← ↑ ↓ →. Colors borrowed from subway lines (7, 4/5/6, A/C/E, 1/2/3). */
export const LANES = [
  { name: 'left', glyph: '←', rot: -90, fill: '#b85ce6', shade: '#8838bd', glow: '#e7b6ff' },
  { name: 'up', glyph: '↑', rot: 0, fill: '#36c65a', shade: '#1f923c', glow: '#a6f2b4' },
  { name: 'down', glyph: '↓', rot: 180, fill: '#2f8af3', shade: '#1b5fc6', glow: '#a5ceff' },
  { name: 'right', glyph: '→', rot: 90, fill: '#f5483f', shade: '#c22922', glow: '#ffaba5' },
] as const

const ARROW = 'M32 9.5 L52.5 31 L41 31 L41 51.5 L23 51.5 L23 31 L11.5 31 Z'

/** A chunky Club Penguin–style arrow tile (note). */
export function noteSVG(lane: number): string {
  const L = LANES[lane]
  return `<svg viewBox="0 0 64 64" class="showtime-tile" aria-hidden="true">
<rect x="4" y="5" width="56" height="56" rx="16" fill="${L.shade}"/>
<rect x="4" y="4" width="56" height="49" rx="16" fill="${L.fill}"/>
<rect x="4" y="4" width="56" height="57" rx="16" fill="none" stroke="${INK}" stroke-width="3.6"/>
<ellipse cx="18" cy="13.5" rx="7.5" ry="4" fill="#fff" opacity=".55" transform="rotate(-24 18 13.5)"/>
<g transform="translate(0 3.2)"><g transform="rotate(${L.rot} 32 32)"><path d="${ARROW}" fill="${L.shade}" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/></g></g>
<g transform="rotate(${L.rot} 32 32)"><path d="${ARROW}" fill="#fff" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/></g>
</svg>`
}

/** The target slot at the hit line (also the clickable lane button). */
export function receptorSVG(lane: number): string {
  const L = LANES[lane]
  return `<svg viewBox="0 0 64 64" class="showtime-tile" aria-hidden="true">
<rect x="4" y="4" width="56" height="57" rx="16" fill="#141a3c" fill-opacity=".62" stroke="${INK}" stroke-width="3.6"/>
<rect class="showtime-rec-rim" x="8.5" y="8.5" width="47" height="48" rx="12" fill="none" stroke="${L.glow}" stroke-width="2.2" opacity=".5"/>
<g transform="rotate(${L.rot} 32 32)"><path class="showtime-rec-arrow" d="${ARROW}" fill="${L.fill}" fill-opacity=".3" stroke="${L.glow}" stroke-width="3.2" stroke-linejoin="round"/></g>
</svg>`
}

/** Small inline tile for the how-to card. */
export function keyTile(lane: number): string {
  return `<span class="showtime-keytile">${noteSVG(lane)}</span>`
}

/** An upside-down hat on the floor — the tip jar. Coins go in `.showtime-hat-pile`. */
export function hatSVG(): string {
  return `<svg viewBox="0 0 120 74" class="showtime-hat-svg" aria-hidden="true">
<ellipse cx="60" cy="66" rx="50" ry="7" fill="rgba(8,12,34,.35)"/>
<path d="M28 30 C 28 54 36 64 60 64 C 84 64 92 54 92 30 Z" fill="#3b3168" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>
<path d="M78 36 C 86 38 88 46 84 54" fill="none" stroke="#574a92" stroke-width="5" stroke-linecap="round"/>
<path d="M30.5 37 C 42 44 78 44 89.5 37 L 90.5 31 C 78 37 42 37 29.5 31 Z" fill="#ef4a3e" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
<ellipse cx="60" cy="28" rx="53" ry="13" fill="#4b4082" stroke="${INK}" stroke-width="3.6"/>
<ellipse cx="60" cy="26.5" rx="33" ry="7.6" fill="#18122e" stroke="${INK}" stroke-width="2.6"/>
<g class="showtime-hat-pile"></g>
</svg>`
}

/** Pile of coins inside the hat, growing with the tips. */
export function hatPile(n: number): string {
  if (n <= 0) return ''
  const h = Math.min(13, 2 + n * 0.45)
  const w = Math.min(31, 14 + n * 1.2)
  let s = `<path d="M${60 - w} 27.5 Q 60 ${27.5 - h * 2} ${60 + w} 27.5 Z" fill="#ffc62b" stroke="${INK}" stroke-width="2"/>`
  const spots: [number, number][] = [[-14, 1], [10, 0], [-2, -1], [18, 2], [-22, 2], [4, 1], [-8, -2], [14, -1], [24, 3], [-26, 3], [0, -3], [-17, -1]]
  const count = Math.min(spots.length, Math.ceil(n / 2))
  for (let i = 0; i < count; i++) {
    const [dx, dy] = spots[i]
    const x = 60 + dx * (w / 31)
    const lift = h * (1 - Math.abs(dx) / 31) * 0.9
    s += `<ellipse cx="${x.toFixed(1)}" cy="${(25 + dy - lift).toFixed(1)}" rx="5.4" ry="2.6" fill="#ffd84d" stroke="${INK}" stroke-width="1.6"/>`
  }
  return s
}

/** A subway route bullet — used for the rank letter (A/B/C/D trains, and the S — the 42 St Shuttle!). */
export function bulletSVG(letter: string, color: string, diamond = false): string {
  const shape = diamond
    ? `<rect x="14" y="14" width="72" height="72" rx="8" transform="rotate(45 50 50)" fill="${color}" stroke="${INK}" stroke-width="5"/>`
    : `<circle cx="50" cy="50" r="44" fill="${color}" stroke="${INK}" stroke-width="5"/>`
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${shape}<ellipse cx="34" cy="26" rx="14" ry="7" fill="#fff" opacity=".35" transform="rotate(-25 34 26)"/>
<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-family="Helvetica Neue, Arial, sans-serif" font-weight="700" font-size="${diamond ? 46 : 58}" fill="#fff">${letter}</text></svg>`
}

/** A 5-point star sparkle (for hit bursts). */
export function sparkSVG(color: string): string {
  return `<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0 -10 L2.6 -2.6 L10 0 L2.6 2.6 L0 10 L-2.6 2.6 L-10 0 L-2.6 -2.6 Z" fill="${color}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/></svg>`
}
