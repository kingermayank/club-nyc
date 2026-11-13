// Dev sheet for the photo matcher (open /lab/match.html): runs every test photo in lab/_faces through it.
import { measure, toCanvas, dim } from '../src/avatar/match/measure'
import { pickLook, skinLevel } from '../src/avatar/match/pick'
import { headPortrait } from '../src/avatar/render'
import { BEARDS, SPECS, FACE_SHAPES, EYE_COLOR_NAMES } from '../src/avatar/look'

const ids = (new URLSearchParams(location.search).get('ids') ?? '1,2,3,4,5,6,7,8,11,12,13,14,15,16').split(',')
const out = document.getElementById('out')!
out.textContent = ''
const results: Record<string, unknown> = {}
;(window as unknown as { results: unknown }).results = results
for (const id of ids) {
  const img = new Image()
  img.src = `/lab/_faces/f${id}.jpg`
  await img.decode()
  const c = toCanvas(img, img.naturalWidth, img.naturalHeight)
  const k = Number(new URLSearchParams(location.search).get('dim') ?? 1)
  if (k !== 1) dim(c, k)
  const t0 = performance.now()
  const r = await measure(c)
  const ms = Math.round(performance.now() - t0)
  results[id] = typeof r === 'string' ? r : { ...r, level: skinLevel(r), pick: pickLook(r).look }
  const row = document.createElement('div')
  row.className = 'row'
  row.append(c)
  if (typeof r !== 'string') {
    const m = pickLook(r)
    const d = document.createElement('div')
    d.innerHTML = headPortrait({ color: 5, items: { body: 'sig-hoodie' }, ...m.look }) + `<br>${m.look.hair} · ${BEARDS[m.look.beard ?? 0]} · specs ${SPECS[m.look.specs ?? 0]}<br>${FACE_SHAPES[m.look.shape ?? 0]} · ${EYE_COLOR_NAMES[m.look.eyes ?? 0]}<br>near: ${m.near.hair.join(', ')}<br>skin ${m.look.skin} · L ${Math.round(r.skin.L)} → ${Math.round(skinLevel(r))} (frame ${Math.round(r.frame)})`
    row.append(d)
  }
  const pre = document.createElement('pre')
  pre.textContent = `f${id} (${ms} ms)\n` + (typeof r === 'string' ? r : JSON.stringify(r, (_k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)).replace(/,"/g, ', "'))
  row.append(pre)
  out.append(row)
}
document.title = 'done'
