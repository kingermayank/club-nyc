import { sfx } from '../audio'
import { save } from '../state'
import { el, stage } from '../engine/stage'
import { hold, toast, confetti } from '../engine/ui'
import { world, onRoom, onFrame } from '../engine/world'
import { avatarPortrait } from '../avatar/render'
import type { Game } from '../types'

/** Rockefeller: wave at the studio window and you're on morning TV. */
export function onAir(g: Game) {
  const studio = world.geo?.cutouts['tv-studio']
  g.emote('wave', 3)
  g.sfx.ding()
  g.say('Hi Mom!! 📺')
  if (studio) {
    const [x, y, w, h] = studio.rect
    const tv = el('div', 'on-air', `<div class="on-air-inner">${avatarPortrait(save.look)}</div><span class="bb-live">● ON AIR</span>`)
    tv.style.cssText = `left:${x + w * 0.2}px;top:${y + h * 0.28}px;width:${w * 0.6}px;height:${h * 0.42}px`
    stage.scene.append(tv)
    setTimeout(() => tv.classList.add('out'), 4200)
    setTimeout(() => tv.remove(), 4800)
  }
  g.stamp('on-air')
}

/** Central Park carriage ride. */
export async function carriageRide(g: Game) {
  const v = await g.choose('🐴 Carriage Ride', 'A lap around the park. 4 coins. The horse is named Biscuit.', [
    { label: 'Giddy-up (4)', value: 'go' },
    { label: 'I’ll Walk', value: 'no' },
  ])
  if (v !== 'go' || !g.spend(4, 'carriage-ride')) return
  const release = hold()
  const r = el('div', 'scene-card carriage-ride', `<div class="sc-inner"><div class="sc-emoji">🐴</div><div class="sc-text">clip-clop… clip-clop…</div><small>Past Bethesda Fountain, under the elms, around Sheep Meadow…</small></div>`)
  stage.root.append(r)
  for (let i = 0; i < 8; i++) setTimeout(() => sfx.tick(), i * 330)
  setTimeout(() => {
    r.classList.add('out')
    release()
    g.say('Biscuit is my best friend now. 🐴')
    g.stamp('carriage')
    setTimeout(() => r.remove(), 600)
  }, 2800)
}

/** Grand Central's Whispering Gallery: whisper into one corner, it echoes across the arch. */
export function whisper(g: Game) {
  g.say('(whispers) …hello?')
  const echoes = ['…hello?', '…hello…', '…lo…']
  echoes.forEach((e, i) =>
    setTimeout(() => {
      sfx.tick()
      toast(`<i>${e}</i>`, '🤫')
    }, 900 + i * 700),
  )
  setTimeout(() => {
    g.say('The walls whispered back! 😮')
    g.stamp('whisper')
  }, 3200)
}

/** Battery Park seagull: will absolutely steal your food. */
export function seagull(g: Game) {
  g.sfx.squawk()
  const food = ['hotdog', 'pretzel', 'pizza-slice', 'bagel', 'donut', 'gelato', 'dumplings']
  const held = save.look.items.hand
  if (held && food.includes(held)) {
    const items = { ...save.look.items }
    delete items.hand
    save.look = { ...save.look, items }
    world.player.setLook(save.look)
    g.say('HEY! That seagull snatched my snack! 😤')
    toast('Don’t worry, you still own it. Grab it from your player card.', '🐦')
  } else g.say('The seagull checks my hands. Nothing. It leaves, disappointed.')
}

/** Battery Park ferry: ride as a passenger, or captain it yourself. */
export async function ferry(g: Game) {
  const v = await g.choose('⛴️ Liberty Island Ferry', 'The ferry to the Statue of Liberty is boarding.', [
    { label: 'Ride as a Passenger (2)', value: 'ride', note: 'sit back, wave at Lady Liberty' },
    { label: 'Captain the Ferry', value: 'captain', note: 'mini-game · earn coins' },
  ])
  if (v === 'captain') return g.playGame('ferry-captain')
  if (v !== 'ride' || !g.spend(2, 'ferry-ticket')) return
  const release = hold()
  g.sfx.toot()
  const r = el('div', 'scene-card ferry-ride', `<div class="sea"></div><img class="ferry-sprite" src="/art/games/harbor/ferry.png" alt=""><div class="sc-inner"><div class="sc-text">Next stop: Liberty Island 🗽</div><small>Wave at the tourists on the Staten Island ferry…</small></div>`)
  stage.root.append(r)
  setTimeout(() => {
    r.classList.add('out')
    g.goto('liberty-island', 'battery-park')
    setTimeout(() => {
      r.remove()
      release()
    }, 700)
  }, 3200)
}

// ---------- ambient room extras ----------
onRoom('rockefeller', () =>
  onFrame(() => {
    if (world.player.skating && !save.stamps.includes('skater')) {
      import('../game').then((m) => m.api.stamp('skater'))
    }
  }),
)

onRoom('liberty-island', () => {
  setTimeout(() => confetti(30), 400)
})
