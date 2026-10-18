import { onFrame, onRoomChange, world, depthScale, spawnResident, chatterOk } from '../engine/world'
import { stage, el } from '../engine/stage'
import { toast, confetti, floatText, ui } from '../engine/ui'
import { sfx, startBeat } from '../audio'
import { save, bump } from '../state'
import { bond } from './friends'
import { RESIDENTS } from './residents'
import type { Actor } from '../engine/actor'
import type { Pt } from '../geometry'
import { api } from '../game'

/**
 * Flash mobs (the "start an action, others opt in" experiment): dance and nearby New Yorkers
 * join in. More dancers → more people stream in → the city reacts. Works anywhere; Times Square goes big.
 */
let active = false
let dancers: Actor[] = []
let recruitIn = 1
let streamIn = 2
let stopBeat: (() => void) | null = null
let peak = 1
let hinted = false
const badge = el('div', 'mob-badge')
const MAX = 10

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const CHEERS = ['Let’s gooo! 🕺', 'Flash mob!!', 'I know this one!', 'Showtime! 💃', 'Wooo!', '🎶', 'Everybody dance!']

/** real players dancing near you count too (we never steer them — they're people) */
function remoteDancers() {
  const p = world.player.pos
  return world.npcs.filter((a) => a.remote && a.held === 'dance' && Math.hypot(a.pos[0] - p[0], a.pos[1] - p[1]) < 420).length
}
function count() {
  return dancers.length + 1 + remoteDancers()
}

function setEvent(n: number) {
  document.dispatchEvent(new CustomEvent('flashmob', { detail: { count: n, room: world.room.id } }))
}

function start() {
  active = true
  dancers = []
  peak = 1
  recruitIn = 0.6
  streamIn = 2.5
  stage.fx.append(badge)
}

function stop() {
  active = false
  stopBeat?.()
  stopBeat = null
  badge.remove()
  const n = count()
  const crew = dancers
  dancers = []
  setEvent(0)
  setTimeout(() => {
    for (const a of crew) {
      a.mob = false
      if (!a.wrap.isConnected) continue
      a.emote('cheer', 1.6)
      a.next = 2 + Math.random() * 3
    }
  }, 900)
  if (n >= 3) toast(`What a flash mob: ${peak} dancers! 🎉`, '🕺')
}

function ringSpot(i: number): Pt {
  const p = world.player.pos
  const s = depthScale(p[1])
  const ang = (i * 2.399) % (Math.PI * 2) // golden-angle spread
  const r = (70 + (i % 3) * 34) * s
  return world.nav!.nearest([p[0] + Math.cos(ang) * r * 1.4, p[1] + Math.sin(ang) * r * 0.55])
}

function recruit(a: Actor) {
  a.mob = true
  if (a.seat) a.standUp()
  dancers.push(a)
  const spot = ringSpot(dancers.length)
  a.path = world.nav!.path(a.pos, spot)
  a.onArrive = () => {
    if (!active) return
    a.held = 'dance'
    if (Math.random() < 0.5) a.say(pick(CHEERS), 2200)
  }
  if (!a.path.length) a.onArrive()
  if (a.resident) bond(a.resident.id, 0.5)
  milestone()
}

function milestone() {
  const n = count()
  if (n <= peak) return
  peak = n
  floatText(`🕺×${n}`, world.player.pos[0], world.player.pos[1] - 130 * depthScale(world.player.pos[1]))
  sfx.pop()
  const ts = world.room.id === 'times-square'
  if (n === 3) {
    stopBeat = startBeat(ts ? 124 : 116)
    toast('A flash mob is forming! Keep dancing… 🕺', '🎶')
    api.stamp('flash-mob')
    bump('mobs')
  }
  if (n >= 3) setEvent(n)
  if (n === (ts ? 6 : 7)) {
    confetti(140)
    sfx.stamp()
    toast(ts ? 'TIMES SQUARE TAKEOVER! The whole square is dancing! 🎆' : 'The whole block is dancing! 🎆', '🎆')
    if (ts) api.stamp('big-mob')
    // the city tips the performers
    for (let i = 0; i < 6; i++) setTimeout(() => dropCoin(), 200 + i * 160)
  }
}

function dropCoin() {
  const p = ringSpot(Math.floor(Math.random() * 12) + 1)
  const c = el('button', 'coin rain', `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#ffd166" stroke="#1d2140" stroke-width="3.5"/><circle cx="20" cy="20" r="10" fill="none" stroke="#e8a317" stroke-width="3"/></svg>`)
  c.style.cssText = `left:${p[0]}px;top:${p[1]}px;--s:${depthScale(p[1])};z-index:${Math.round(p[1] * 10) - 1}`
  c.dataset.x = String(p[0])
  c.dataset.y = String(p[1])
  stage.scene.append(c)
}

onRoomChange(() => {
  if (active) stop()
})

onFrame((dt) => {
  const p = world.player
  if (!p) return
  const dancing = p.held === 'dance' && !p.moving && !p.seat
  if (!dancing) {
    if (active) stop()
    // gentle discoverability, once a visit: a local dancing nearby invites you in their own speech bubble
    // (not while a panel is open: you couldn't press D for it anyway)
    if (!hinted && !ui.busy && save.created && !save.stamps.includes('flash-mob')) {
      const d = world.npcs.find((a) => a.held === 'dance' && !a.remote && Math.hypot(a.pos[0] - p.pos[0], a.pos[1] - p.pos[1]) < 320)
      if (d && chatterOk(3000)) {
        hinted = true
        d.say('Dance with me! Press D 💃', 4500)
      }
    }
    return
  }
  if (!active) start()
  // keep the crew dancing
  dancers = dancers.filter((a) => a.wrap.isConnected && !a.leaving)
  for (const a of dancers) if (!a.moving) a.held = 'dance'
  const s = depthScale(p.pos[1])
  badge.textContent = count() >= 2 ? `🕺 ×${count()}` : 'Dancing…'
  badge.style.transform = `translate(${p.pos[0]}px, ${p.pos[1] - 150 * s}px)`
  badge.classList.toggle('hot', count() >= 3)

  recruitIn -= dt
  if (recruitIn <= 0) {
    recruitIn = 0.7 + Math.random() * 0.9
    const cands = world.npcs.filter((a) => !a.remote && !a.mob && !a.leaving && Math.hypot(a.pos[0] - p.pos[0], a.pos[1] - p.pos[1]) < 420)
    // social proof: the bigger the crowd, the likelier the next person joins
    const chance = Math.min(0.92, 0.4 + 0.14 * dancers.length)
    if (cands.length && Math.random() < chance) recruit(pick(cands))
  }
  // a real crowd draws more people in from the street
  if (count() >= 4 && !world.room.indoor) {
    streamIn -= dt
    if (streamIn <= 0 && world.npcs.length < MAX) {
      streamIn = 1.4 + Math.random() * 1.6
      const here = new Set(world.npcs.map((a) => a.resident?.id))
      const r = pick(RESIDENTS.filter((x) => !here.has(x.id)))
      if (r) recruit(spawnResident(r, { enter: true }))
    }
  }
})

export const flashMobActive = () => active
