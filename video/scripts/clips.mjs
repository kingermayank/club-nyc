// Short, seamless gameplay loops, cut from the trailer footage (video/public/footage, see
// docs/marketing/launch-video.md). Each loop crossfades its end into its own start, so it never visibly jumps.
//   npm --prefix video run clips            the landing page's tiles -> app/public/video/clips/<name>.mp4 + .webp poster
//   npm --prefix video run clips -- --lab   the design lab's loops   -> app/lab/clips/ (dev only, git-ignored)
//   npm --prefix video run clips -- flashmob jam   just those
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const footage = resolve(here, '../public/footage')
const lab = process.argv.includes('--lab')
const out = resolve(here, lab ? '../../app/lab/clips' : '../../app/public/video/clips')
const python = resolve(here, '../../.venv/bin/python')
mkdirSync(out, { recursive: true })

const PLACES = ['central-park', 'brooklyn-bridge', 'liberty-island', 'grand-central', 'the-met', 'chinatown', 'rockefeller', 'high-line', 'soho']
// name, footage file, start (s), length (s), width, and an optional framing: a zoom (framed on the bottom-left, like
// the Dance Jam) or an ffmpeg crop (w:h:x:y)
const SITE = [
  ...PLACES.map((p) => [p, `place-${p}.mp4`, 0.2, 3.2, 960]),
  ['creator', 'creator.mp4', 0.4, 5.4, 960],
  ['stamps', 'stampbook.mp4', 0.2, 2.6, 960],
  ['ferry', 'job-ferry-captain.mp4', 1.0, 4.6, 960],
  ['party', 'party.mp4', 0.4, 5.4, 960],
  // the flash mob at its peak (confetti), framed in close on the dancers in the 2560 px footage
  ['flashmob', 'flashmob.mp4', 9.9, 6.0, 960, 'iw*0.66:ih*0.54:iw*0.19:ih*0.44'],
  // framed on the crowd, below Times Square's shop signs (the bottom-left 1/1.36 of the picture)
  ['jam', 'jam.mp4', 3.0, 6.0, 960, 1.36],
]
const LAB = [
  ['crowd', 'crowd.mp4', 7.4, 8, 1920],
  ['crowd-arrive', 'crowd.mp4', 3.4, 6, 1920],
  ['jam', 'jam.mp4', 3.0, 8, 1920],
  ['party', 'party.mp4', 0.4, 5.4, 1280],
  ['creator', 'creator.mp4', 0.4, 5.4, 960],
  ['stamps', 'stampbook.mp4', 0.2, 2.6, 960],
  ['ferry', 'job-ferry-captain.mp4', 1.0, 4.6, 960],
  ['showtime', 'job-showtime.mp4', 2.0, 5.0, 960],
  ['halal', 'job-halal-rush.mp4', 2.0, 5.0, 960],
  ['flashmob', 'flashmob.mp4', 9.9, 6.0, 960, 'iw*0.66:ih*0.54:iw*0.19:ih*0.44'],
  ...PLACES.map((p) => [p, `place-${p}.mp4`, 0.2, 3.2, 960]),
]
const FADE = 0.6
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })

let total = 0
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const CLIPS = (lab ? LAB : SITE).filter(([name]) => !only.length || only.includes(name))
for (const [name, file, start, len, width, frame] of CLIPS) {
  const crop = typeof frame === 'string' ? `crop=${frame},` : frame ? `crop=iw/${frame}:ih/${frame}:(iw-iw/${frame})*0.16:ih-ih/${frame},` : ''
  // the loop's last FADE seconds dissolve into its first FADE seconds: it starts and ends on the same frame
  const loop =
    `[0:v]trim=start=${start}:duration=${len},setpts=PTS-STARTPTS,${crop}scale=${width}:-2:flags=lanczos,fps=30,format=yuv420p,split=2[a][b];` +
    `[a]trim=start=${FADE},setpts=PTS-STARTPTS[body];[b]trim=duration=${FADE},setpts=PTS-STARTPTS[head];` +
    `[body][head]xfade=transition=fade:duration=${FADE}:offset=${(len - 2 * FADE).toFixed(3)}[v]`
  const src = join(footage, file)
  const webm = join(out, `${name}.webm`)
  const mp4 = join(out, `${name}.mp4`)
  if (lab) ffmpeg('-i', src, '-filter_complex', loop, '-map', '[v]', '-an', '-c:v', 'libvpx-vp9', '-crf', width > 1280 ? '40' : '38', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', webm)
  ffmpeg('-i', src, '-filter_complex', loop, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4)
  // the poster: the loop's first frame (the same frame it ends on)
  const png = join(out, `${name}.png`)
  ffmpeg('-i', mp4, '-frames:v', '1', png)
  execFileSync(python, ['-c', 'import os, sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2], "WEBP", quality=78, method=6); os.remove(sys.argv[1])', png, join(out, `${name}.webp`)])
  const kb = (f) => Math.round(statSync(f).size / 1024)
  total += (lab ? kb(webm) : 0) + kb(mp4) + kb(join(out, `${name}.webp`))
  console.log(`${name.padEnd(16)} ${width}w  mp4 ${kb(mp4)} KB${lab ? `  webm ${kb(webm)} KB` : ''}  poster ${kb(join(out, `${name}.webp`))} KB`)
}
console.log(`${CLIPS.length} loops, ${(total / 1024).toFixed(1)} MB in ${out}`)
