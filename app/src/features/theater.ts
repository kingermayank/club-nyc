import { quadTransform, type Pt } from '../geometry'
import { onRoom, world, sitPlayer } from '../engine/world'
import { el, stage } from '../engine/stage'
import { hold, confetti, toast } from '../engine/ui'
import { sfx } from '../audio'
import { api } from '../game'
import { save } from '../state'

const SHOWS = [
  { id: 'phantom', title: 'Phantom of the Subway', img: '/art/shows/phantom.jpg', song: [64, 67, 71, 72, 71, 67, 64, 63, 64, 67, 71, 76], tagline: 'The music of the night shift.' },
  { id: 'pizza-king', title: 'The Pizza King', img: '/art/shows/pizza-king.jpg', song: [60, 64, 67, 72, 67, 69, 67, 64, 65, 64, 62, 60], tagline: 'The circle of slice.' },
  { id: 'bagels', title: 'Bagels!', img: '/art/shows/bagels.jpg', song: [67, 67, 69, 67, 72, 71, 67, 67, 69, 67, 74, 72], tagline: 'Everything, with a schmear.' },
]
const tonight = () => SHOWS[new Date().getDate() % SHOWS.length]

let stageQuad: Pt[] | null = null
let stageEl: HTMLElement | null = null

onRoom('broadway', ({ geo, scene }) => {
  stageQuad = (geo.screens?.stage as Pt[]) ?? null
  if (!stageQuad) {
    const c = geo.cutouts.curtain ?? geo.cutouts.stage
    if (c) {
      const [x, y, w, h] = c.rect
      stageQuad = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    }
  }
  if (!stageQuad) return
  stageEl = el('div', 'stage-show')
  stageEl.style.transform = quadTransform(800, 450, stageQuad)
  stageEl.innerHTML = `<div class="show-art"></div><div class="curtain left"></div><div class="curtain right"></div><div class="valance"></div>`
  scene.append(stageEl)
  return () => {
    stageEl = null
  }
})

export async function watchShow() {
  if (world.room.id !== 'broadway' || !stageEl) return
  const show = tonight()
  const v = await api.choose(`🎭 Tonight: ${show.title}`, `“${show.tagline}” Orchestra seats are 5 coins.`, [
    { label: 'Buy a ticket (5)', value: 'buy' },
    { label: 'Maybe later', value: 'no' },
  ], `<img class="show-thumb" src="${show.img}" alt="">`)
  if (v !== 'buy' || !api.spend(5, 'theater-ticket')) return
  sfx.register()
  // grab a seat if there's one free
  const free = world.seats.filter((s) => ![world.player, ...world.npcs].some((a) => a.seat?.id === s.id))
  if (!world.player.seat && free.length) {
    const p = world.player.pos
    free.sort((a, b) => Math.hypot(a.sit[0] - p[0], a.sit[1] - p[1]) - Math.hypot(b.sit[0] - p[0], b.sit[1] - p[1]))
    sitPlayer(free[0])
    await new Promise((r) => setTimeout(r, 1600))
  }
  const release = hold()
  const s = stageEl
  const art = s.querySelector<HTMLElement>('.show-art')!
  art.style.backgroundImage = `url(${show.img})`
  stage.root.classList.add('house-dark')
  const lights = el('div', 'house-lights')
  stage.root.append(lights)
  sfx.tick()
  setTimeout(() => {
    s.classList.add('open')
    sfx.whoosh()
  }, 900)
  // overture
  show.song.forEach((n, i) => setTimeout(() => sfx.piano(n), 1500 + i * 420))
  show.song.forEach((n, i) => setTimeout(() => sfx.piano(n - 12), 1500 + i * 420 + 210))
  setTimeout(() => s.classList.add('pan'), 1300)
  setTimeout(() => {
    s.classList.remove('open')
    sfx.whoosh()
  }, 1500 + show.song.length * 420 + 600)
  setTimeout(() => {
    // applause
    for (let i = 0; i < 14; i++) setTimeout(() => sfx.clapper(), i * 90 + Math.random() * 60)
    world.npcs.forEach((a) => !a.remote && a.emote('cheer', 3))
    world.player.emote('cheer', 3)
    confetti(80)
    toast('Bravo! 👏 What a show.', '🎭')
    stage.root.classList.remove('house-dark')
    lights.remove()
    s.classList.remove('pan')
    api.stamp('curtain-call')
    if (!save.owned.includes('playbill')) {
      api.give('playbill')
      setTimeout(() => toast('You got a Playbill! Hold it from your player card.', '🎁'), 1200)
    }
    release()
  }, 1500 + show.song.length * 420 + 1700)
}
