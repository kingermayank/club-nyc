// Copies the game art and fonts the trailer uses from app/public into video/public/game (generated, git-ignored), so
// the game stays the one source of truth: change the logo or a font there and the next render picks it up.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const from = resolve(here, '../../app/public')
const to = resolve(here, '../public/game')
const FILES = [
  'fonts/BurbankSmall-Bold.otf',
  'fonts/BurbankSmall-Medium.otf',
  'art/ui/logo.png',
  // the group chat's emoji
  ...['pizza', 'coin', 'taxi', 'sunglasses', 'liberty', 'disco-ball', 'dancer', 'party-popper'].map((e) => `art/icons/e/${e}.png`),
  'art/rooms/apartment.jpg',
  ...['rug', 'sofa', 'lamp', 'record-player', 'jukebox', 'plant'].map((f) => `art/furniture/${f}.png`),
]
for (const f of FILES) {
  mkdirSync(dirname(join(to, f)), { recursive: true })
  copyFileSync(join(from, f), join(to, f))
}
console.log(`copied ${FILES.length} game files into public/game`)
