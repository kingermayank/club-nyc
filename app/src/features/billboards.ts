import { quadTransform, type Pt } from '../geometry'
import { onRoom } from '../engine/world'
import { el } from '../engine/stage'
import { save } from '../state'
import { avatarPortrait } from '../avatar/render'
import { link } from '../net/link'
import { rest } from '../net/server'
import { BOARD, fmt } from '../social/leaderboard'
import { TEAMS, type TeamId } from '../social/teams'

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const ADS = ['cola', 'halal', 'phantom', 'sneakers', 'times', 'slice', 'ferry', 'maison', 'bean'].map((n) => `/art/ads/${n}.jpg`)
const LED = [
  ['CLUB NYC', 'led-rainbow'],
  ['BREAKING: PIZZA RAT SPOTTED ON THE 1 TRAIN ★', 'led-ticker'],
  ['♥ NEW YORK', 'led-pulse'],
  ['NOW PLAYING · PHANTOM OF THE SUBWAY', 'led-ticker'],
  ['HALAL BROS · 5 AV & 57 ST', 'led-pulse'],
  ['62°F ☀ PARTLY PIGEONY', 'led-pulse'],
] as const

const BW = 320
const BH = 200

/** Real city news for the LED boards: new members by number, this week's #1s, the leading team. */
let shouts: string[] = []
async function loadShouts() {
  if (!link.account) return
  try {
    const h = await rest<{ newcomers: { name: string; member_no: number }[]; leaders: { game: string; name: string; score: number }[]; team: { team: string; points: number } | null }>('/highlights')
    const out: string[] = []
    for (const n of h.newcomers.slice(0, 5)) out.push(`WELCOME TO NEW YORK, ${n.name.toUpperCase()}! · NEW YORKER #${String(n.member_no).padStart(4, '0')} ★`)
    for (const l of h.leaders) {
      const g = BOARD[l.game]
      if (g) out.push(`${g.emoji} THIS WEEK’S TOP ${g.title.toUpperCase()}: ${l.name.toUpperCase()} · ${fmt(l.game, l.score)} ${g.unit.toUpperCase()}`)
    }
    if (h.team && TEAMS[h.team.team as TeamId]) out.push(`${TEAMS[h.team.team as TeamId].emoji} ${TEAMS[h.team.team as TeamId].name.toUpperCase()} LEAD THE NEIGHBORHOOD WARS`)
    shouts = out
  } catch {
    /* the regular ads carry on */
  }
}

/** Times Square: real billboards in the art come alive with rotating ads. */
onRoom('times-square', ({ geo, scene }) => {
  const quads = Object.entries(geo.screens ?? {}) as [string, Pt[]][]
  if (!quads.length) return
  void loadShouts()
  // biggest screen occasionally shows the player
  const area = (q: Pt[]) => Math.abs((q[1][0] - q[0][0]) * (q[3][1] - q[0][1]))
  const biggest = quads.reduce((a, b) => (area(b[1]) > area(a[1]) ? b : a))[0]
  const timers: number[] = []
  let adIndex = Math.floor(Math.random() * ADS.length)
  for (const [id, quad] of quads) {
    const screen = el('div', 'billboard')
    screen.style.cssText = `width:${BW}px;height:${BH}px;transform:${quadTransform(BW, BH, quad)}`
    scene.append(screen)
    let n = Math.floor(Math.random() * 4)
    const show = () => {
      const slide = el('div', 'bb-slide')
      const r = Math.random()
      if (shouts.length && r > 0.55 && r < 0.8) {
        // a shout-out on the Times Square boards: new New Yorkers and this week's #1s
        slide.classList.add('bb-led', 'led-ticker', 'led-shout')
        slide.innerHTML = `<span>${esc(shouts[Math.floor(Math.random() * shouts.length)])}</span>`
      } else if (id === biggest && r < 0.18) {
        slide.classList.add('bb-cam')
        slide.innerHTML = `<div class="bb-cam-inner">${avatarPortrait(save.look)}</div><span class="bb-live">● LIVE</span><span class="bb-caption">SMILE, ${save.name.toUpperCase() || 'NEW YORK'}!</span>`
      } else if (r < 0.3) {
        const [text, cls] = LED[Math.floor(Math.random() * LED.length)]
        slide.classList.add('bb-led', cls)
        slide.innerHTML = `<span>${text}</span>`
      } else {
        adIndex = (adIndex + 1) % ADS.length
        slide.innerHTML = `<img src="${ADS[adIndex]}" alt="">`
      }
      screen.append(slide)
      requestAnimationFrame(() => slide.classList.add('in'))
      const old = screen.querySelectorAll('.bb-slide')
      if (old.length > 1) setTimeout(() => old[0].remove(), 700)
      n++
      timers.push(window.setTimeout(show, 3800 + Math.random() * 4200))
    }
    timers.push(window.setTimeout(show, 200 + Math.random() * 1500))
  }
  // flash mobs take over the screens
  const onMob = (e: Event) => {
    const n = (e as CustomEvent).detail.count as number
    scene.querySelectorAll('.billboard').forEach((b, i) => {
      b.classList.toggle('dance', n >= 4 && i < n)
    })
  }
  document.addEventListener('flashmob', onMob)
  return () => {
    timers.forEach(clearTimeout)
    document.removeEventListener('flashmob', onMob)
  }
})
