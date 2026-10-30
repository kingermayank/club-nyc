// Renders one still from the middle of every shot of a reel, side by side in one strip, to check the crops before a
// full render: out/frames/<id>.jpg
// usage: node video/scripts/reel-frames.mjs <reel-id> [<reel-id> …]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundle } from '@remotion/bundler'
import { renderStill, selectComposition } from '@remotion/renderer'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { REELS } = await import('../src/reels.ts')
const BEAT = 18
// the same headless Chrome the CLI uses (remotion.config.ts: macOS blocks Chrome's helpers under ~/Desktop)
const chrome = join(homedir(), 'Library/Caches/club-nyc-remotion/chrome-headless-shell-mac-arm64/chrome-headless-shell')
const browserExecutable = existsSync(chrome) ? chrome : null
const serveUrl = await bundle({ entryPoint: join(root, 'src/index.ts') })
const out = join(root, 'out/frames')
mkdirSync(out, { recursive: true })
for (const id of process.argv.slice(2)) {
  const reel = REELS[id]
  if (!reel) throw new Error(`no reel ${id}`)
  const inputProps = { id, audio: 'music' }
  const composition = await selectComposition({ serveUrl, id: `Reel-${id}`, inputProps, browserExecutable })
  const files = []
  let at = 0
  for (const [i, s] of reel.shots.entries()) {
    const frame = Math.round((at + s.beats * 0.6) * BEAT)
    at += s.beats
    const f = join(out, `${id}-${i}.jpg`)
    await renderStill({ composition, serveUrl, frame, output: f, inputProps, imageFormat: 'jpeg', jpegQuality: 80, browserExecutable })
    files.push(f)
  }
  // one strip, each frame scaled to 360 px wide
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}]scale=360:-1[s${i}]`).join(';')};${files.map((_, i) => `[s${i}]`).join('')}hstack=inputs=${files.length}`, join(out, `${id}.jpg`)])
  for (const f of files) rmSync(f)
  console.log('frames:', join(out, `${id}.jpg`))
}
