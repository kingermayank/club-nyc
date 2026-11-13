import { sfx } from '../../audio'
import { persist, save } from '../../state'
import { el } from '../../engine/stage'
import type { Game } from '../../types'
import { closeX, openMoment, pick } from './kit'

/**
 * The Flags, Rockefeller Plaza: Flag Roll Call. The camera looks up a flagpole, a flag runs up it, and you name the
 * country before the rope burns down. Five flags a round, weighted toward ones you haven't named yet, and every flag
 * you get right goes in your collection (32 to find). Stamps for a round, a perfect round, and the whole set.
 */

type Kind = 'h' | 'v' | 'disc' | 'cross'
interface Flag { id: string; name: string; kind: Kind; svg: string }

const W = 300
const H = 200
const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${inner}</svg>`
/** horizontal stripes, top to bottom ([colour, weight]) */
function h(...stripes: (string | [string, number])[]): string {
  const s = stripes.map((x) => (typeof x === 'string' ? ([x, 1] as [string, number]) : x))
  const total = s.reduce((n, [, w]) => n + w, 0)
  let y = 0
  return wrap(s.map(([c, w]) => {
    const r = `<rect x="0" y="${y}" width="${W}" height="${(H * w) / total + 0.5}" fill="${c}"/>`
    y += (H * w) / total
    return r
  }).join(''))
}
/** vertical stripes, left to right */
const v = (...c: string[]) => wrap(c.map((col, i) => `<rect x="${(W * i) / c.length}" y="0" width="${W / c.length + 0.5}" height="${H}" fill="${col}"/>`).join(''))
/** a disc on a field */
const disc = (bg: string, col: string, cx = 150, r = 60) => wrap(`<rect width="${W}" height="${H}" fill="${bg}"/><circle cx="${cx}" cy="100" r="${r}" fill="${col}"/>`)
/** a Nordic cross (optionally a thinner cross inside it) */
const cross = (bg: string, col: string, inner?: string) =>
  wrap(`<rect width="${W}" height="${H}" fill="${bg}"/><rect x="82" y="0" width="40" height="${H}" fill="${col}"/><rect x="0" y="80" width="${W}" height="40" fill="${col}"/>${inner ? `<rect x="92" y="0" width="20" height="${H}" fill="${inner}"/><rect x="0" y="90" width="${W}" height="20" fill="${inner}"/>` : ''}`)

const f = (id: string, name: string, kind: Kind, svg: string): Flag => ({ id, name, kind, svg })
export const FLAGS: Flag[] = [
  f('fr', 'France', 'v', v('#0055A4', '#ffffff', '#EF4135')),
  f('it', 'Italy', 'v', v('#009246', '#ffffff', '#CE2B37')),
  f('ie', 'Ireland', 'v', v('#169B62', '#ffffff', '#FF883E')),
  f('be', 'Belgium', 'v', v('#111111', '#FAE042', '#ED2939')),
  f('ro', 'Romania', 'v', v('#002B7F', '#FCD116', '#CE1126')),
  f('ng', 'Nigeria', 'v', v('#008751', '#ffffff', '#008751')),
  f('ml', 'Mali', 'v', v('#14B53A', '#FCD116', '#CE1126')),
  f('pe', 'Peru', 'v', v('#D91023', '#ffffff', '#D91023')),
  f('de', 'Germany', 'h', h('#111111', '#DD0000', '#FFCE00')),
  f('nl', 'Netherlands', 'h', h('#AE1C28', '#ffffff', '#21468B')),
  f('hu', 'Hungary', 'h', h('#CE2939', '#ffffff', '#477050')),
  f('bg', 'Bulgaria', 'h', h('#ffffff', '#00966E', '#D62612')),
  f('ee', 'Estonia', 'h', h('#0072CE', '#111111', '#ffffff')),
  f('lt', 'Lithuania', 'h', h('#FDB913', '#006A44', '#C1272D')),
  f('at', 'Austria', 'h', h('#ED2939', '#ffffff', '#ED2939')),
  f('co', 'Colombia', 'h', h(['#FCD116', 2], '#003893', '#CE1126')),
  f('am', 'Armenia', 'h', h('#D90012', '#0033A0', '#F2A800')),
  f('ga', 'Gabon', 'h', h('#009E60', '#FCD116', '#3A75C4')),
  f('sl', 'Sierra Leone', 'h', h('#1EB53A', '#ffffff', '#0072C6')),
  f('pl', 'Poland', 'h', h('#ffffff', '#DC143C')),
  f('id', 'Indonesia', 'h', h('#CE1126', '#ffffff')),
  f('ua', 'Ukraine', 'h', h('#0057B7', '#FFD700')),
  f('th', 'Thailand', 'h', h('#A51931', '#F4F5F8', ['#2D2A4A', 2], '#F4F5F8', '#A51931')),
  f('mu', 'Mauritius', 'h', h('#EA2839', '#1A206D', '#FFD500', '#00A551')),
  f('jp', 'Japan', 'disc', disc('#ffffff', '#BC002D')),
  f('bd', 'Bangladesh', 'disc', disc('#006A4E', '#F42A41', 135)),
  f('pw', 'Palau', 'disc', disc('#4AADD6', '#FFDE00', 130, 52)),
  f('se', 'Sweden', 'cross', cross('#006AA7', '#FECC00')),
  f('dk', 'Denmark', 'cross', cross('#C8102E', '#ffffff')),
  f('fi', 'Finland', 'cross', cross('#ffffff', '#003580')),
  f('no', 'Norway', 'cross', cross('#BA0C2F', '#ffffff', '#00205B')),
  f('is', 'Iceland', 'cross', cross('#02529C', '#ffffff', '#DC1E35')),
]

const named = () => FLAGS.filter((x) => save.stats[`flag:${x.id}`]).length
const shuffle = <T>(a: T[]): T[] => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

const ROUND = 5
const SECONDS = 7
/** the cloth, in CSS px: the flag itself, plus room above and below for it to ripple */
const CW = 315
const CH = 210
const PAD = 14
const DPR = 2

export function flagRollCall(g: Game) {
  const m = openMoment('mo-flags')
  m.root.innerHTML = `<div class="fl-bg"></div>
    <div class="fl-pole"><i class="fl-ball"></i></div>
    <div class="fl-flag"><canvas class="fl-cloth" width="${CW * DPR}" height="${(CH + PAD * 2) * DPR}"></canvas></div>
    <div class="fl-side"></div>`
  const flagEl = m.root.querySelector<HTMLElement>('.fl-flag')!
  const side = m.root.querySelector<HTMLElement>('.fl-side')!

  // One piece of cloth, drawn a column at a time: each column rides a travelling wave that grows away from the pole,
  // shaded by its slope, with a single ink outline round the rippled edge (smooth at any size, no strips or seams).
  const cloth = m.root.querySelector<HTMLCanvasElement>('.fl-cloth')!
  const ctx = cloth.getContext('2d')!
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  let art: HTMLImageElement | null = null
  let speed = 1
  let phase = 0
  const lift = (x: number) => (still ? 0 : (2 + (x / CW) * 9) * Math.sin(phase - x * 0.032))
  const drawCloth = () => {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    ctx.clearRect(0, 0, CW, CH + PAD * 2)
    if (!art?.complete || !art.naturalWidth) return
    const sw = art.naturalWidth / CW
    for (let x = 0; x < CW; x++) {
      const y = PAD + lift(x)
      ctx.drawImage(art, x * sw, 0, sw, art.naturalHeight, x, y, 1.05, CH)
      // a fold catches the light on one side and falls into shadow on the other
      const slope = lift(x + 1) - lift(x)
      ctx.fillStyle = slope > 0 ? `rgba(0, 0, 0, ${Math.min(0.28, slope * 0.22)})` : `rgba(255, 255, 255, ${Math.min(0.2, -slope * 0.16)})`
      ctx.fillRect(x, y, 1.05, CH)
    }
    ctx.beginPath()
    ctx.moveTo(0, PAD + lift(0))
    for (let x = 1; x <= CW; x++) ctx.lineTo(x, PAD + lift(x))
    for (let x = CW; x >= 0; x--) ctx.lineTo(x, PAD + CH + lift(x))
    ctx.closePath()
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    ctx.strokeStyle = '#1d2140'
    ctx.stroke()
  }
  m.frame((dt) => {
    phase += (dt / 1000) * Math.PI * 2 * 0.9 * speed
    drawCloth()
  })
  const show = (fl: Flag | null) => {
    flagEl.classList.remove('up')
    if (!fl) return
    // the flag's picture at twice the cloth's size, so it stays crisp
    const img = new Image()
    img.onload = drawCloth
    img.src = 'data:image/svg+xml,' + encodeURIComponent(fl.svg.replace('<svg ', `<svg width="${CW * DPR}" height="${CH * DPR}" `))
    art = img
    void flagEl.offsetWidth
    flagEl.classList.add('up')
    sfx.whoosh()
  }
  m.root.append(Object.assign(closeX(m), { className: 'mo-x fl-x' }))

  let keys: ((e: KeyboardEvent) => boolean | void) | null = null
  m.onKey((e) => keys?.(e))

  intro()

  function intro() {
    show(pick(FLAGS))
    side.innerHTML = `<h2>Flag Roll Call</h2>
      <div class="fl-count">${named()} of ${FLAGS.length} named</div>`
    const b = el('button', 'btn go', 'Start')
    b.onclick = () => (sfx.click(), play())
    side.append(b)
    keys = (e) => (e.key === 'Enter' || e.key === ' ' ? (play(), true) : undefined)
  }

  function play() {
    // mostly flags you haven't named yet, so the collection keeps moving
    const fresh = shuffle(FLAGS.filter((x) => !save.stats[`flag:${x.id}`]))
    const seen = shuffle(FLAGS.filter((x) => save.stats[`flag:${x.id}`]))
    const deck = shuffle([...fresh.slice(0, 3), ...seen, ...fresh.slice(3)].slice(0, ROUND))
    let i = 0
    let right = 0
    let left = SECONDS
    let answered = true
    const marks: boolean[] = []

    m.frame((dt) => {
      if (answered || !side.isConnected) return
      left -= dt
      const rope = side.querySelector<HTMLElement>('.fl-rope i')
      if (rope) rope.style.width = `${Math.max(0, left / SECONDS) * 100}%`
      if (left <= 0) answer(null)
    })

    const next = () => {
      if (i >= deck.length) return results(right, marks)
      const fl = deck[i]
      show(fl)
      const same = shuffle(FLAGS.filter((x) => x.kind === fl.kind && x.id !== fl.id))
      const options = shuffle([fl, ...same.slice(0, 2)])
      side.innerHTML = `<div class="fl-pips">${deck.map((_, k) => `<i class="${k < i ? (marks[k] ? 'ok' : 'no') : k === i ? 'now' : ''}"></i>`).join('')}</div>
        <h2>Whose flag is this?</h2>
        <div class="fl-rope"><i></i></div>
        <div class="fl-opts"></div>`
      const box = side.querySelector<HTMLElement>('.fl-opts')!
      options.forEach((o, k) => {
        const b = el('button', 'btn ghost fl-opt', `<kbd>${k + 1}</kbd>${o.name}`)
        b.dataset.id = o.id
        b.onclick = () => answer(o.id)
        box.append(b)
      })
      left = SECONDS
      answered = false
      keys = (e) => {
        const n = Number(e.key)
        if (n >= 1 && n <= options.length) return answer(options[n - 1].id), true
      }
    }

    const answer = (id: string | null) => {
      if (answered) return
      answered = true
      keys = null
      const fl = deck[i]
      const ok = id === fl.id
      marks.push(ok)
      for (const b of side.querySelectorAll<HTMLButtonElement>('.fl-opt')) {
        b.disabled = true
        if (b.dataset.id === fl.id) b.classList.add('right')
        else if (b.dataset.id === id) b.classList.add('wrong')
      }
      if (ok) {
        right++
        sfx.ding()
        speed = 2.6
        if (!save.stats[`flag:${fl.id}`]) {
          save.stats[`flag:${fl.id}`] = 1
          persist()
        }
      } else {
        sfx.squawk()
        if (id === null) side.querySelector('h2')!.textContent = fl.name
      }
      i++
      m.later(() => {
        speed = 1
        next()
      }, ok ? 800 : 1500)
    }

    next()
  }

  function results(right: number, marks: boolean[]) {
    show(null)
    const total = named()
    side.innerHTML = `<div class="fl-pips">${marks.map((ok) => `<i class="${ok ? 'ok' : 'no'}"></i>`).join('')}</div>
      <h2>${right} of ${ROUND}</h2>
      <div class="fl-count">${total} of ${FLAGS.length} named</div>
      <div class="fl-row"></div>`
    const row = side.querySelector<HTMLElement>('.fl-row')!
    const again = el('button', 'btn small go', 'Go Again')
    again.onclick = () => (sfx.click(), play())
    const done = el('button', 'btn small ghost', 'Back to the Plaza')
    done.onclick = () => (sfx.click(), m.close())
    row.append(again, done)
    keys = (e) => (e.key === 'Enter' ? (play(), true) : undefined)

    g.stamp('flag-roll')
    if (right === ROUND) {
      g.confetti(40)
      g.stamp('diplomat')
    }
    if (total >= FLAGS.length) g.stamp('flag-collector')
  }
}
