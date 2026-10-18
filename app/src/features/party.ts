import { sfx } from '../audio'
import { save, persist } from '../state'
import { stage, el } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton, toast, confetti, floatText } from '../engine/ui'
import { world, onRoomChange, onFrame, depthScale } from '../engine/world'
import { itemIcon } from '../avatar/render'
import { ITEM } from '../avatar/items'
import type { Pt } from '../geometry'
import { api } from '../game'

import { PARTY, partyOn } from '../data/party'
export { PARTY, partyOn }

const CANDY_ROOMS = ['times-square', 'soho', 'chinatown', 'central-park', 'the-met', 'brooklyn-bridge', 'high-line', 'rockefeller']
const candyKey = (room: string) => `candy:${room}`
const found = () => CANDY_ROOMS.filter((r) => save.stats[candyKey(r)]).length

// deterministic "random" spot per room so the hunt is fair across visits
function seeded(room: string) {
  let h = 2166136261
  for (const ch of room) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

const badge = el('button', 'party-badge')

function renderBadge() {
  badge.innerHTML = `<span class="pb-pumpkin">🎃</span><span><b>Halloween Party</b><small>🍬 Candy ${found()}/${CANDY_ROOMS.length}</small></span>`
}

export function openPartyPanel() {
  sfx.whoosh()
  const p = el('div', 'panel party-panel')
  const n = found()
  p.innerHTML = `<div class="party-hero">🎃🦇👻</div><h2>The Village Halloween Party</h2>
    <p>The parade is staging on Sixth Avenue! Grab a <b>free costume</b> at the candy stand, then hunt for <b>8 hidden candy corns</b> around Manhattan.</p>
    <div class="candy-track">${CANDY_ROOMS.map((r) => `<span class="${save.stats[candyKey(r)] ? 'got' : ''}" title="${save.stats[candyKey(r)] ? r : '???'}">🍬</span>`).join('')}</div>
    <p class="muted">${n >= CANDY_ROOMS.length ? 'You found them all! Golden Pumpkin Crown unlocked 👑' : 'Find all 8 for the Golden Pumpkin Crown.'}</p>`
  const go = el('button', 'btn go', 'Go to the Parade →')
  go.onclick = () => {
    closeOverlay()
    api.goto(PARTY.room)
  }
  p.append(go, closeButton())
  openOverlay(p)
}

/** Free costume claim (the party's "free item"). */
export function openCostumeStand() {
  const p = el('div', 'panel party-panel wide-items')
  p.innerHTML = `<h2>🍬 Free Costumes!</h2><p>Take one of each. It’s Halloween.</p>`
  const grid = el('div', 'party-items')
  for (const id of PARTY.freebies) {
    const def = ITEM[id]
    if (!def) continue
    const owned = save.owned.includes(id)
    const b = el('button', 'pc-item' + (owned ? ' worn' : ''), `${itemIcon(id)}<span>${def.name}</span><small>${owned ? 'Claimed: click to wear' : 'Free!'}</small>`)
    b.onclick = () => {
      sfx.register()
      if (!owned) {
        api.give(id)
        toast(`Got the ${def.name}!`, '🎁')
      }
      api.wear(id)
      closeOverlay()
      openCostumeStand()
    }
    grid.append(b)
  }
  p.append(grid, closeButton())
  openOverlay(p)
}

// ---------- decorations + candy in rooms ----------
const DECOR = ['jack', 'jack-stack', 'pumpkin', 'haybale', 'cauldron', 'tombstone', 'cat']

function decorate() {
  stage.scene.querySelectorAll('.party-decor, .candy-corn').forEach((n) => n.remove())
  stage.fx.querySelectorAll('.party-bat').forEach((n) => n.remove())
  if (!partyOn()) return
  const room = world.room
  const geo = world.geo
  if (!geo || room.indoor || room.id === PARTY.room) return
  const rnd = seeded(room.id + ':decor')
  const ys = geo.walk.map((p) => p[1])
  const minY = Math.min(...ys)
  // two decorations along the far edge of the walkable floor, left and right
  for (const fx of [0.12 + rnd() * 0.12, 0.76 + rnd() * 0.12]) {
    const p = world.nav!.nearest([fx * 1000, minY + 10])
    const kind = DECOR[Math.floor(rnd() * DECOR.length)]
    const img = el('img', 'party-decor') as HTMLImageElement
    img.src = `/art/party/${kind}.png`
    img.alt = ''
    const s = depthScale(p[1]) * (kind === 'haybale' ? 92 : kind === 'jack-stack' ? 60 : 54)
    img.style.cssText = `left:${p[0] - s / 2}px;top:${p[1] - s}px;width:${s}px;z-index:${Math.round(p[1] * 10) - 2}`
    stage.scene.append(img)
  }
  for (let i = 0; i < 2; i++) {
    const b = el('img', 'party-bat') as HTMLImageElement
    b.src = '/art/party/bat.png'
    b.style.cssText = `top:${40 + rnd() * 90}px;animation-delay:${-rnd() * 12}s;animation-duration:${10 + rnd() * 6}s`
    stage.fx.append(b)
  }
  // the candy corn hunt
  if (CANDY_ROOMS.includes(room.id) && !save.stats[candyKey(room.id)]) {
    const r2 = seeded(room.id + ':candy')
    let p: Pt = world.nav!.randomPoint()
    for (let k = 0; k < 30; k++) {
      const q: Pt = [80 + r2() * 840, minY + 20 + r2() * 200]
      if (world.nav!.walkable(q)) {
        p = q
        break
      }
    }
    const c = el('button', 'candy-corn', '<img src="/art/party/candy-corn.png" alt="">')
    c.setAttribute('aria-label', 'Candy corn')
    c.style.cssText = `left:${p[0]}px;top:${p[1]}px;--s:${depthScale(p[1])};z-index:${Math.round(p[1] * 10) - 1}`
    c.dataset.x = String(p[0])
    c.dataset.y = String(p[1])
    c.onclick = (e) => {
      e.stopPropagation()
      import('../engine/world').then((m) => m.walkTo(p))
    }
    stage.scene.append(c)
  }
}

function collectCandy(c: HTMLElement) {
  const room = world.room.id
  if (save.stats[candyKey(room)]) return
  save.stats[candyKey(room)] = 1
  persist()
  c.classList.add('got')
  setTimeout(() => c.remove(), 600)
  sfx.stamp()
  floatText('🍬', +c.dataset.x!, +c.dataset.y! - 40)
  const n = found()
  toast(`Candy corn ${n}/${CANDY_ROOMS.length}!`, '🍬')
  renderBadge()
  if (n === CANDY_ROOMS.length) {
    setTimeout(() => {
      confetti(120)
      api.give('golden-pumpkin')
      api.wear('golden-pumpkin')
      api.earn(50, 'Candy hunt complete!', 'candy-hunt')
      api.stamp('candy-hunter')
      toast('You found every candy corn! Golden Pumpkin Crown unlocked 👑', '🎃')
    }, 600)
  }
}

export function initParty() {
  if (!partyOn()) return
  stage.hud.append(badge)
  renderBadge()
  badge.onclick = (e) => {
    e.stopPropagation()
    openPartyPanel()
  }
  onRoomChange(() => {
    decorate()
    if (world.room.id === PARTY.room) api.stamp('party-animal')
  })
  decorate()
  onFrame(() => {
    const c = stage.scene.querySelector<HTMLElement>('.candy-corn:not(.got)')
    if (!c) return
    const p = world.player.pos
    if (Math.hypot(+c.dataset.x! - p[0], +c.dataset.y! - p[1]) < 26) collectCandy(c)
  })
  if (!save.stats['party-intro'] && save.created) {
    save.stats['party-intro'] = 1
    persist()
    setTimeout(() => {
      toast('🎃 The Halloween Party has started! Click the pumpkin badge.', '🎉')
    }, 4500)
  }
}
