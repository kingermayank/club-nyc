// Renders the trailer and the landing page's hero loop.
//   video/out/            masters (best quality, git-ignored): upload these to YouTube, X, TikTok…
//   app/public/video/     the web copies the landing page serves (smaller, start playing sooner)
// usage: npm run render                       (the end card shows no web address)
//        npm run render -- --url=clubnyc.com    (the end card shows it)
//        npm run render -- --only=hero          (or --only=trailer, or --only=cards: the link-preview images)
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const masters = join(root, 'out')
const web = resolve(root, '../app/public/video')
mkdirSync(masters, { recursive: true })
mkdirSync(web, { recursive: true })
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const url = arg('url') ?? ''
const only = arg('only')

const remotion = (...args) => execFileSync('npx', ['remotion', ...args, '--log=warn'], { cwd: root, stdio: 'inherit' })
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
const mb = (f) => `${(statSync(f).size / 1048576).toFixed(1)} MB`

if (!only || only === 'trailer') {
  const master = join(masters, 'club-nyc-trailer.mp4')
  remotion('render', 'Trailer', master, '--codec=h264', '--crf=16', '--audio-bitrate=320k', `--props=${JSON.stringify({ url })}`)
  // the web copy: same picture, about a third of the size
  ffmpeg('-i', master, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', join(web, 'club-nyc-trailer.mp4'))
  remotion('still', 'Trailer', join(web, 'club-nyc-trailer.jpg'), '--frame=215', '--image-format=jpeg', '--jpeg-quality=84')
  console.log('trailer: master', mb(master), '· web', mb(join(web, 'club-nyc-trailer.mp4')))
}
if (!only || only === 'hero') {
  const master = join(masters, 'hero-loop.mp4')
  remotion('render', 'HeroLoop', master, '--codec=h264', '--crf=14', '--muted')
  // a silent background loop in three sizes; index.html picks one with <source media>: 2560 x 1440 for high-density
  // and very wide screens, 1920 x 1080 for other big screens, 1280 x 720 for the rest
  for (const [w, h, suffix, x264, vp9] of [
    [1280, 720, '', 26, 44],
    [1920, 1080, '-1080', 26, 42],
    [2560, 1440, '-1440', 27, 41],
  ]) {
    const scale = ['-vf', `scale=${w}:${h}:flags=lanczos`, '-an']
    ffmpeg('-i', master, ...scale, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(x264), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(web, `hero-loop${suffix}.mp4`))
    ffmpeg('-i', master, ...scale, '-c:v', 'libvpx-vp9', '-crf', String(vp9), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', join(web, `hero-loop${suffix}.webm`))
  }
  // the poster: what shows before the loop starts (and all the time for people who prefer less motion).
  // WebP through the repo's Python (Pillow), the same as tools/webp.py: ffmpeg builds often lack a WebP encoder.
  const still = join(masters, 'hero-loop-poster.png')
  ffmpeg('-i', master, '-frames:v', '1', '-vf', 'scale=1920:1080:flags=lanczos', still)
  execFileSync(resolve(root, '../.venv/bin/python'), ['-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2], "WEBP", quality=80, method=6)', still, join(web, 'hero-loop.webp')], { stdio: 'inherit' })
  console.log('hero loop (webm): 720p', mb(join(web, 'hero-loop.webm')), '· 1080p', mb(join(web, 'hero-loop-1080.webm')), '· 1440p', mb(join(web, 'hero-loop-1440.webm')))
}
if (!only || only === 'cards') {
  // the link-preview images: the landing page's, and the one invite links (/join/<name>) unfurl into
  const og = resolve(root, '../app/public/og')
  const cards = {
    // landmarks with no "I ♥ NY" in the art (a New York State trademark, see docs/launch/legal-callouts.md)
    'club-nyc.jpg': { src: 'hero-liberty-island.mp4', at: 1.6, origin: '50% 50%', title: 'Waddle on over to New York.', sub: 'A cozy online hangout · Free in your browser' },
    'invite.jpg': { src: 'hero-empire-deck.mp4', at: 1.6, origin: '50% 50%', title: 'You’re invited to Club NYC!', sub: 'Your friend is in the city. You’ll land right next to them.' },
  }
  for (const [file, props] of Object.entries(cards)) remotion('still', 'ShareCard', join(og, file), '--image-format=jpeg', '--jpeg-quality=86', `--props=${JSON.stringify(props)}`)
  console.log('share cards:', Object.keys(cards).map((f) => `${f} ${Math.round(statSync(join(og, f)).size / 1024)} KB`).join(' · '))
}
