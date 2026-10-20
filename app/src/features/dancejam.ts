import './dancejam.css'
import { sfx } from '../audio'
import { save, bump } from '../state'
import { el, stage } from '../engine/stage'
import { toast, confetti, openOverlay, closeOverlay, closeButton, floatText } from '../engine/ui'
import { world, onRoom, onFrame, walkTo, depthScale, goto, spawnResident, chatterOk } from '../engine/world'
import type { Actor } from '../engine/actor'
import { quadTransform, type Pt } from '../geometry'
import { AvatarView } from '../avatar/render'
import type { Look } from '../avatar/look'
import { RESIDENTS } from '../social/residents'
import { api } from '../game'
import { jamState, JAM_PERIOD } from '../data/jam'

/**
 * Dance Jam — the Times Square stage comes alive on a city-wide schedule (everyone online sees the same show,
 * no server needed): the LED wall lights up, a DJ takes the decks, the crowd floods the plaza. No music: a song
 * playing on its own in the background was too much (the owner's call, 19 October 2026).
 * Dance on the floor in front of the stage to earn tips.
 */
const PERIOD = JAM_PERIOD
export { jamState }
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ---------- in Times Square ----------
let led: HTMLElement | null = null
let joinBtn: HTMLElement | null = null
let dj: { view: AvatarView; el: HTMLElement } | null = null
let floor: [number, number, number, number] = [330, 400, 670, 520]
let wasOn: boolean | null = null
let danced = 0
let rewardedJam = -1
const crew = new Set<Actor>()

const DJ_LOOK: Look = { skin: 3, hair: 'short', hairColor: 0, items: { head: 'headphones', body: 'varsity', legs: 'jeans', feet: 'hightops', face: 'shades' } }

function floorSpot(): Pt {
  const [x1, y1, x2, y2] = floor
  return world.nav!.nearest([x1 + Math.random() * (x2 - x1), y1 + Math.random() * (y2 - y1)])
}

onRoom('times-square', ({ geo, scene }) => {
  wasOn = null
  danced = 0
  const z = geo.zones?.dancefloor
  if (z && typeof z[0] === 'number') floor = z as [number, number, number, number]
  // the LED wall
  const quad = geo.screens?.stage as Pt[] | undefined
  if (quad) {
    led = el('div', 'jam-led')
    led.innerHTML = '<div class="jl-bg"></div><div class="jl-eq">' + '<i></i>'.repeat(14) + '</div><div class="jl-text"></div>'
    led.style.transform = quadTransform(400, 225, quad)
    scene.append(led)
  }
  // the DJ, behind the decks
  const booth = geo.cutouts['dj-booth']
  if (booth) {
    const [x, y, w, h] = booth.rect
    const view = new AvatarView(DJ_LOOK, 0.72)
    const holder = el('div', 'jam-dj')
    holder.append(view.el)
    const fx = x + w / 2
    const fy = y + h * 0.42
    const s = depthScale(fy) * 0.95
    holder.style.cssText = `transform:translate(${fx}px, ${fy}px) scale(${s});z-index:${Math.max(1, Math.round((booth.base ?? y + h) * 10) - 2)}`
    scene.append(holder)
    dj = { view, el: holder }
  }
  joinBtn = el('button', 'jam-join')
  joinBtn.onclick = (e) => {
    e.stopPropagation()
    joinJam()
  }
  stage.root.append(joinBtn)
  tick(0)
  return () => {
    led = null
    dj = null
    joinBtn?.remove()
    joinBtn = null
    for (const a of crew) a.mob = false
    crew.clear()
  }
})

function tick(dt: number) {
  if (world.room.id !== 'times-square') return
  const j = jamState()
  const now = Date.now()
  if (j.on !== wasOn) {
    wasOn = j.on
    led?.classList.toggle('on', j.on)
    dj?.el.classList.toggle('on', j.on)
    if (j.on) {
      confetti(40)
      sfx.stamp()
      if (save.created) toast('🪩 DANCE JAM! Get to the middle of the plaza and dance (D)', '🪩')
      fillCrowd()
    } else {
      for (const a of crew) {
        a.mob = false
        a.held = null
      }
      crew.clear()
    }
  }
  if (j.on && led) led.querySelector('.jl-text')!.textContent = 'DANCE JAM · ON NOW'
  if (!j.on && led) led.querySelector('.jl-text')!.textContent = `DANCE JAM · NEXT SHOW ${mmss(j.next - now)}`
  const p = world.player
  const [x1, y1, x2, y2] = floor
  const dancingHere = p.held === 'dance' && !p.moving && p.pos[0] > x1 && p.pos[0] < x2 && p.pos[1] > y1 - 30 && p.pos[1] < y2 + 30
  if (joinBtn) {
    // once you're on the floor the button would only hide the crowd
    joinBtn.classList.toggle('show', j.on && !dancingHere)
    if (j.on) joinBtn.innerHTML = `🪩 Join the Dance Jam <small>${mmss(j.end - now)} left</small>`
  }
  if (dj) {
    dj.view.setPose(j.on ? 'dance' : 'idle')
    dj.view.update(dt)
  }
  if (!j.on) return
  // keep the crowd dancing
  for (const a of crew) {
    if (!a.wrap.isConnected || a.leaving) crew.delete(a)
    else if (!a.moving) a.held = 'dance'
  }
  // tips for dancing on the floor
  if (dancingHere) {
    danced += dt
    if (danced >= 20 && rewardedJam !== j.n) {
      rewardedJam = j.n
      api.earn(20, 'Dance Jam tips!', 'dance-jam', String(j.n))
      api.stamp('dance-jam')
      bump('jams')
      floatText('+20', p.pos[0], p.pos[1] - 130 * depthScale(p.pos[1]), 'coin-float')
    }
  }
}

/** City locals pour onto the plaza when the music starts (real players dance for themselves). */
function fillCrowd() {
  const locals = world.npcs.filter((a) => a.resident && !a.remote && !a.leaving)
  for (const a of locals) recruit(a)
  const real = world.npcs.filter((a) => a.remote).length
  const want = Math.max(0, 7 - real - locals.length)
  const here = new Set(world.npcs.map((a) => a.resident?.id))
  const pool = RESIDENTS.filter((r) => !here.has(r.id))
  for (let i = 0; i < want && pool.length; i++)
    setTimeout(() => {
      if (!jamState().on || world.room.id !== 'times-square') return
      const r = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]
      recruit(spawnResident(r, { enter: true }))
    }, 400 + i * 900)
}
function recruit(a: Actor) {
  a.mob = true
  if (a.seat) a.standUp()
  crew.add(a)
  a.path = world.nav!.path(a.pos, floorSpot())
  a.onArrive = () => {
    a.held = 'dance'
    if (Math.random() < 0.4 && chatterOk(3000)) a.say(['THIS SONG! 🎶', 'Dance Jam!! 🪩', 'Let’s gooo', '💃', '🕺'][Math.floor(Math.random() * 5)])
  }
}

function joinJam(): void {
  if (!jamState().on) return void openDanceJam()
  sfx.pop()
  walkTo(floorSpot(), () => world.player.emote('dance', 0))
}

onFrame((dt) => tick(dt))

// The Dance Jam lives in Times Square: the stage's LED wall counts down to the next show, and the Join button shows
// while one is on. Nothing about it follows you around the rest of the city (no countdown chip, no "it started" pings).

// ---------- clicking the stage or the DJ ----------
export function openDanceJam(): void {
  const j = jamState()
  if (j.on) {
    if (world.room.id !== 'times-square') return void goto('times-square')
    return joinJam()
  }
  const p = el('div', 'panel', `<div class="panel-art">🎧</div><h2>Dance Jam</h2>
    <p>The DJ is setting up. The next show starts in <b class="jam-count">${mmss(j.next - Date.now())}</b>, then every ${PERIOD / 60000} minutes after that.</p>
    <p class="muted">When the music starts, dance in the middle of the plaza to earn tips. Bring friends: the bigger the crowd, the bigger the show.</p>`)
  const ok = el('button', 'btn go', 'I’ll be here 🪩')
  ok.onclick = () => closeOverlay()
  p.append(ok, closeButton())
  openOverlay(p)
  const t = window.setInterval(() => {
    const c = p.querySelector('.jam-count')
    if (!c?.isConnected) return clearInterval(t)
    c.textContent = mmss(jamState().next - Date.now())
  }, 500)
}
