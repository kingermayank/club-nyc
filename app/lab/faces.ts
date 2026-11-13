// Dev sheet: every face option on a few heads (open /lab/faces.html). Add ?full for whole bodies.
import { headPortrait, avatarPortrait } from '../src/avatar/render'
import { BEARDS, BROWS, FACE_SHAPES, NOSES, SPECS, EYE_COLOR_NAMES, HAIR_STYLES, type Look } from '../src/avatar/look'
import { ITEMS } from '../src/avatar/items'

const base: Look = { skin: 2, hair: 'short', hairColor: 1, color: 5, nose: 1, items: { body: 'sig-hoodie', legs: 'jeans', feet: 'sneakers' } }
const cells: [string, Look][] = []
FACE_SHAPES.forEach((n, i) => cells.push([`shape ${n}`, { ...base, shape: i, skin: [0, 3, 5, 1][i] }]))
FACE_SHAPES.forEach((n, i) => cells.push([`${n} + beard`, { ...base, shape: i, beard: 4, hairColor: 0, skin: [2, 6, 4, 7][i] }]))
BEARDS.forEach((n, i) => cells.push([`beard ${n}`, { ...base, beard: i, hair: 'fade', hairColor: 0, skin: 3 }]))
BROWS.forEach((n, i) => cells.push([`brows ${n}`, { ...base, brows: i, hair: 'bob', hairColor: 4, lashes: 1 }]))
NOSES.forEach((n, i) => cells.push([`nose ${n}`, { ...base, nose: i, hair: 'curly' }]))
SPECS.forEach((n, i) => cells.push([`specs ${n}`, { ...base, specs: i, hair: 'long', hairColor: 3, skin: 1, lashes: 1 }]))
EYE_COLOR_NAMES.forEach((n, i) => cells.push([`eyes ${n}`, { ...base, eyes: i, skin: 0, hair: 'ponytail', hairColor: 3, freckles: i % 2, lashes: 1 }]))
cells.push(['bald', { ...base, hair: 'bald', beard: 4, specs: 2, shape: 2, hairColor: 5, skin: 1 }], ['classic (old save)', { skin: 1, hair: 'short', hairColor: 1, items: { body: 'tee-blue' } }], ['hat + specs', { ...base, specs: 1, items: { ...base.items, head: 'nyc-cap' } }], ['shop shades over specs', { ...base, specs: 1, items: { ...base.items, face: 'shades' } }])
const q = new URLSearchParams(location.search)
const sheet = q.get('sheet')
if (sheet) {
  cells.length = 0
  const hats = ITEMS.filter((i) => i.slot === 'head').map((i) => i.id)
  const you: Look = { ...base, skin: 6, hairColor: 0, shape: 2, specs: 2, eyes: 1 }
  if (sheet === 'hair') HAIR_STYLES.forEach((h) => cells.push([h, { ...you, hair: h, specs: 0 }], [h + ' 2', { ...base, skin: 1, hair: h, hairColor: 3, lashes: 1, shape: 1 }]))
  if (sheet === 'hats') for (const hat of hats) for (const h of (q.get('hair') ?? 'short,long,afro').split(',')) cells.push([`${hat} / ${h}`, { ...you, hair: h as Look['hair'], items: { ...you.items, head: hat } }])
  if (sheet === 'faces') for (let i = 0; i < 24; i++) cells.push([`#${i}`, { ...base, skin: i % 8, hair: HAIR_STYLES[i % HAIR_STYLES.length], hairColor: i % 6, shape: i % 4, eyes: i % 6, brows: i % 4, nose: i % 3, beard: i % 7 === 3 ? (i % 5) + 1 : 0, specs: i % 4 === 1 ? 1 + (i % 2) : 0, lashes: i % 2 }])
  document.getElementById('grid')!.style.gridTemplateColumns = `repeat(${q.get('cols') ?? 6}, 200px)`
  document.head.insertAdjacentHTML('beforeend', '<style>.cell svg{width:190px;height:198px}</style>')
}
const full = q.has('full')
document.getElementById('grid')!.innerHTML = cells.map(([n, l]) => `<div class="cell">${full ? avatarPortrait(l) : headPortrait(l, 'smile')}${n}</div>`).join('')
