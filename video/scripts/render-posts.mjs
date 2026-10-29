// Renders the Instagram feed posts (src/posts.ts) as 1080 x 1350 JPEGs: out/posts/<post>/<nn>.jpg
// usage: node video/scripts/render-posts.mjs [post-id ...]   (bundles once, then one still per slide)
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundle } from '@remotion/bundler'
import { renderStill, selectComposition } from '@remotion/renderer'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { POSTS } = await import('../src/posts.ts')
const only = process.argv.slice(2)
// the same headless Chrome the CLI uses (remotion.config.ts: macOS blocks Chrome's helpers under ~/Desktop)
const chrome = join(homedir(), 'Library/Caches/club-nyc-remotion/chrome-headless-shell-mac-arm64/chrome-headless-shell')
const browserExecutable = existsSync(chrome) ? chrome : null
const serveUrl = await bundle({ entryPoint: join(root, 'src/index.ts') })
let n = 0
for (const p of POSTS.filter((x) => !only.length || only.includes(x.id))) {
  mkdirSync(join(root, 'out/posts', p.id), { recursive: true })
  for (let index = 0; index < p.slides.length; index++) {
    const inputProps = { post: p.id, index }
    const composition = await selectComposition({ serveUrl, id: 'Post', inputProps, browserExecutable })
    await renderStill({ composition, serveUrl, output: join(root, 'out/posts', p.id, `${String(index + 1).padStart(2, '0')}.jpg`), inputProps, imageFormat: 'jpeg', jpegQuality: 90, browserExecutable })
    n++
  }
  console.log('post:', p.id, p.slides.length)
}
console.log(n, 'images')
