// Draws the iFruit logo directions and the app icon set as SVG (app/public/art/ifruit). One tile template keeps the
// set consistent: squircle r16, 3px navy outline, top-lit gradient, a white gloss crescent top-left, glyph centred.
//   node tools/ifruit_icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'public', 'art', 'ifruit')
mkdirSync(join(OUT, 'icons'), { recursive: true })
const INK = '#1d2140'
const PAPER = '#fffdf6'
const SUN = '#ffd166'

const mix = (hex, to, amt) => {
  const a = parseInt(hex.slice(1), 16)
  const b = parseInt(to.slice(1), 16)
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - amt) + ((b >> s) & 255) * amt)
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')
}
const star = (cx, cy, R, r, n = 5) => {
  const pts = []
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n
    const rad = i % 2 ? r : R
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}
const gear = (cx, cy, R, r, teeth = 8) => {
  let d = ''
  const step = (Math.PI * 2) / teeth
  for (let i = 0; i < teeth; i++) {
    const a = i * step
    const p = (ang, rad) => `${(cx + rad * Math.cos(ang)).toFixed(2)} ${(cy + rad * Math.sin(ang)).toFixed(2)}`
    d += `${i ? 'L' : 'M'}${p(a - step * 0.32, r)} L${p(a - step * 0.2, R)} L${p(a + step * 0.2, R)} L${p(a + step * 0.32, r)} `
  }
  return d + 'Z'
}

const tile = (base, glyph, { light = 0.22, gloss = 0.35, outline = INK } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(base, '#ffffff', light)}"/><stop offset=".65" stop-color="${base}"/><stop offset="1" stop-color="${mix(base, INK, 0.12)}"/></linearGradient></defs>
<rect x="2" y="2" width="60" height="60" rx="16" fill="url(#t)" stroke="${outline}" stroke-width="3"/>
<path d="M6.5 24 C7 12 12 6.5 24 6.5 L34 6.5 C20 8.5 11 14 6.5 24 Z" fill="#fff" opacity="${gloss}"/>
${glyph}
</svg>
`
const S = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`

const ICONS = {
  phone: tile('#3cb371', `
<path d="M36 13 a12 12 0 0 1 13 13 M36 19 a6.5 6.5 0 0 1 7 7" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
<path d="M36 13 a12 12 0 0 1 13 13 M36 19 a6.5 6.5 0 0 1 7 7" fill="none" stroke="${SUN}" stroke-width="2.8" stroke-linecap="round"/>
<path d="M19 15 c2.4-1.8 5.2-1.3 6.4 1.3 l2.4 5.1 c.9 2 .2 4-1.6 5.1 l-2.2 1.3 c2 4.9 5.2 8.2 10 10.3 l1.4-2.1 c1.1-1.8 3.2-2.4 5.1-1.5 l5 2.4 c2.6 1.3 3.1 4.1 1.3 6.5 l-2 2.6 c-2.1 2.6-5.6 3.5-8.7 2.3 C25.3 47.6 17.7 40 13.9 28.8 c-1.1-3.1-.2-6.6 2.3-8.6 z" fill="${PAPER}" ${S}/>
<path d="M17 27 c3 9 9 16 17 19.5" fill="none" stroke="#d9d3c2" stroke-width="2" stroke-linecap="round"/>`),
  messages: tile('#2a7bd5', `
<path d="M12 23 c0-6 4.5-10 11-10 h10 c6.5 0 11 4 11 10 s-4.5 10-11 10 h-8 l-7 5 1.5-6 c-4.5-1.6-7.5-4.8-7.5-9 z" fill="${PAPER}" ${S}/>
<path d="M52 37 c0-5.5-4-9-10-9 h-9 c-6 0-10 3.5-10 9 s4 9 10 9 h7 l6.5 4.5 -1.3-5.6 c4-1.5 6.8-4.3 6.8-7.9 z" fill="${SUN}" ${S}/>
<path d="M28 41 c3 2 8 2.4 13 2" fill="none" stroke="#e8a317" stroke-width="2" stroke-linecap="round"/>`),
  camera: tile('#2c3550', `
<rect x="23" y="16" width="14" height="8" rx="3" fill="${PAPER}" ${S}/>
<rect x="11" y="21" width="42" height="28" rx="7" fill="${PAPER}" ${S}/>
<rect x="42" y="25" width="6" height="4" rx="1.5" fill="${SUN}" stroke="${INK}" stroke-width="2"/>
<path d="M13 43 h38" stroke="#d9d3c2" stroke-width="2.5" stroke-linecap="round"/>
<circle cx="31" cy="35" r="10" fill="#2a7bd5" ${S}/>
<circle cx="31" cy="35" r="5.2" fill="#134a96"/>
<circle cx="28" cy="32" r="2.2" fill="#fff"/>`),
  map: tile('#6fb6ff', `
<path d="M11 44 q6-3 12 0 t12 0 t12 0 t8 0 M11 51 q6-3 12 0 t12 0 t12 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".55"/>
<path d="M19 51 C16 45 21 38 25 32 C29 25 34 18 40 12.5 C43.5 10 47 12.5 45 16.5 C42 23 38 30 34 37 C31 43 27.5 49 23.5 52 C21.5 53.5 19.8 53 19 51 Z" fill="#3cb371" ${S}/>
<path d="M24 46 c3-6 7-12 10-17" stroke="#2c8f58" stroke-width="2" stroke-linecap="round" fill="none"/>
<path d="M39 14 c-6.4 0-10.6 4.6-10.6 10.4 0 7.5 10.6 16.6 10.6 16.6 s10.6-9.1 10.6-16.6 C49.6 18.6 45.4 14 39 14 z" fill="#e5483b" ${S}/>
<circle cx="39" cy="24.5" r="3.8" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>`),
  contacts: tile('#ff9f1c', `
<rect x="10" y="15" width="44" height="34" rx="6" fill="${PAPER}" ${S}/>
<rect x="15" y="20" width="20" height="24" rx="4" fill="#ffe3b3"/>
<circle cx="25" cy="29" r="5.6" fill="${INK}"/>
<path d="M16.5 44 c.8-5.8 4.2-8 8.5-8 s7.7 2.2 8.5 8 z" fill="${INK}"/>
<rect x="38" y="24" width="11" height="3.4" rx="1.7" fill="${INK}" opacity=".7"/>
<rect x="38" y="31" width="8" height="3.4" rx="1.7" fill="${INK}" opacity=".4"/>
<rect x="38" y="38" width="10" height="3.4" rx="1.7" fill="#ff9f1c"/>`),
  photos: tile('#ff8fc8', `
<g transform="rotate(-8 32 33)">
<rect x="14" y="12" width="36" height="42" rx="3.5" fill="${PAPER}" ${S}/>
<rect x="18.5" y="16.5" width="27" height="25" rx="1.5" fill="#6fb6ff" stroke="${INK}" stroke-width="2"/>
<circle cx="37" cy="24" r="4.3" fill="${SUN}" stroke="${INK}" stroke-width="1.8"/>
<path d="M18.5 41.5 V34 h4 v-4 h4 v6 h3 v-8.5 h4.5 v8.5 h3.5 v-3 h4 v3 h4 v5.5 Z" fill="${INK}"/>
</g>`),
  bank: tile('#6a4c93', `
<circle cx="41" cy="25" r="11.5" fill="#d98a0b" ${S}/>
<circle cx="41" cy="25" r="7.5" fill="none" stroke="#ffc933" stroke-width="2"/>
<circle cx="28" cy="38" r="15" fill="#ffc933" ${S}/>
<path d="M28 53 a15 15 0 0 0 15 -15" fill="none" stroke="#d98a0b" stroke-width="3" opacity=".8"/>
<circle cx="28" cy="37.5" r="10.5" fill="#ffdf6b" stroke="#e8a317" stroke-width="2"/>
<polygon points="${star(28, 38, 7.4, 3.2)}" fill="#fff6c9" stroke="#e8a317" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M17 32 a11.5 11.5 0 0 1 6-6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>`),
  stocks: tile('#1d2140', `
<path d="M12 20 H52 M12 30 H52 M12 40 H52 M22 12 V52 M32 12 V52 M42 12 V52" stroke="#fff" stroke-width="1.2" opacity=".12"/>
<polyline points="12,45 22,35 29,40 40,25 49,19" fill="none" stroke="#0e1124" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
<polyline points="12,45 22,35 29,40 40,25 49,19" fill="none" stroke="#4fd27e" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="49.5" cy="18.5" r="4.6" fill="${SUN}" stroke="#0e1124" stroke-width="2.2"/>`, { light: 0.16, gloss: 0.22, outline: '#0e1124' }),
  settings: tile('#8d96a6', `
<path d="${gear(32, 33, 18, 13.5, 8)}" fill="${PAPER}" ${S}/>
<circle cx="32" cy="33" r="7" fill="${INK}"/>
<circle cx="32" cy="33" r="2.8" fill="${PAPER}"/>`),
}
for (const [k, v] of Object.entries(ICONS)) writeFileSync(join(OUT, 'icons', `${k}.svg`), v)

// ---------- the mark: three directions, the cherry pair chosen ----------
const cherry = (mono) => {
  const red = mono ? 'currentColor' : '#e5483b'
  const shade = mono ? 'none' : '#b8322a'
  const leaf = mono ? 'currentColor' : '#3cb371'
  const line = mono ? 'currentColor' : INK
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<path d="M23 40 C24 28 29 18 36 12 M43 44 C42 32 39 21 36 12" fill="none" stroke="${line}" stroke-width="3" stroke-linecap="round"/>
<path d="M36 12 C40 6 49 5 54 8 C51 14 43 16 36 12 Z" fill="${leaf}" stroke="${line}" stroke-width="${mono ? 0 : 2.6}" stroke-linejoin="round"/>
${mono ? '' : `<path d="M38 11.5 C43 10 48 9 52 8.6" fill="none" stroke="#2c8f58" stroke-width="1.6" stroke-linecap="round"/>`}
<circle cx="22" cy="44" r="11.5" fill="${red}" stroke="${line}" stroke-width="${mono ? 0 : 3}"/>
<circle cx="43" cy="47" r="11.5" fill="${red}" stroke="${line}" stroke-width="${mono ? 0 : 3}"/>
${mono ? '' : `<clipPath id="c1"><circle cx="22" cy="44" r="10"/></clipPath><clipPath id="c2"><circle cx="43" cy="47" r="10"/></clipPath>
<circle cx="25.5" cy="47.5" r="10" fill="${shade}" clip-path="url(#c1)" opacity=".55"/><circle cx="20" cy="42" r="10" fill="${red}" clip-path="url(#c1)"/>
<circle cx="46.5" cy="50.5" r="10" fill="${shade}" clip-path="url(#c2)" opacity=".55"/><circle cx="41" cy="45" r="10" fill="${red}" clip-path="url(#c2)"/>
<path d="M15.5 41 a7 7 0 0 1 4.5-4.6" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>
<path d="M36.5 44 a7 7 0 0 1 4.5-4.6" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>`}
</svg>
`
}
writeFileSync(join(OUT, 'logo-cherry.svg'), cherry(false))
writeFileSync(join(OUT, 'logo-mono.svg'), cherry(true))
writeFileSync(
  join(OUT, 'logo-pear.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<path d="M32 4 L34 14 L30 14 Z" fill="#c9c8d2" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
<rect x="29" y="13" width="6" height="5" rx="1" fill="#c9c8d2" stroke="${INK}" stroke-width="2"/>
<path d="M32 18 C26 18 25 25 25 29 C25 33 15 37 15 46 C15 54 22 60 32 60 C42 60 49 54 49 46 C49 37 39 33 39 29 C39 25 38 18 32 18 Z" fill="#8ac926" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<path d="M21 42 a10 10 0 0 1 5-6" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>
<path d="M32 60 C42 60 49 54 49 46" fill="none" stroke="#5e9a1a" stroke-width="3"/>
</svg>
`,
)
writeFileSync(
  join(OUT, 'logo-citrus.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<circle cx="32" cy="32" r="27" fill="#ff9f1c" stroke="${INK}" stroke-width="3"/>
<circle cx="32" cy="32" r="21" fill="#ffd166" stroke="#fff3d0" stroke-width="2"/>
${[0, 1, 2, 3, 4].map((i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; return `<path d="M32 32 L${(32 + 20 * Math.cos(a)).toFixed(1)} ${(32 + 20 * Math.sin(a)).toFixed(1)}" stroke="#fff3d0" stroke-width="3" stroke-linecap="round"/>` }).join('')}
<circle cx="32" cy="32" r="3" fill="#fff3d0"/>
</svg>
`,
)
console.log('wrote', Object.keys(ICONS).length, 'icons and 4 marks to', OUT)
