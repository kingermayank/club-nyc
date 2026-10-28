import './roomfun.css'
import { sfx } from '../audio'
import { save } from '../state'
import { el, stage } from '../engine/stage'
import { hold, toast } from '../engine/ui'
import { world, walkTo, sitPlayer } from '../engine/world'
import type { Game } from '../types'
import type { Pt } from '../geometry'
import { picCard, flash, type Pic, type CardAction } from './infocard'

/** Small things to DO all over the city: photos, sitting down with a snack, laps, rides, climbs. */

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]

/** "Take a Photo": a flash, a pose, a line. */
export function snap(g: Game, line: string) {
  flash()
  sfx.clapper()
  g.emote('cheer', 2)
  setTimeout(() => g.say(line), 350)
}

/** Sit on the nearest free seat in the room (with whatever you're holding), or the one nearest `near`. */
export function sitNearest(g: Game, line?: string, near?: Pt) {
  const p = near ?? world.player.pos
  const taken = (id: string) => [world.player, ...world.npcs].some((a) => a.seat?.id === id)
  const seat = world.seats.filter((s) => !taken(s.id)).sort((a, b) => Math.hypot(a.sit[0] - p[0], a.sit[1] - p[1]) - Math.hypot(b.sit[0] - p[0], b.sit[1] - p[1]))[0]
  if (!seat) return g.say('Every seat is taken. Peak New York. I’ll stand and look casual.')
  sitPlayer(seat)
  if (line) setTimeout(() => g.say(line), 1600)
}

/** Get down on one knee (or lie down on the glass floor): a sitting pose right where you stand. */
export function kneel(g: Game, line: string, hearts = false) {
  world.player.emote('sit', 3)
  if (hearts) setTimeout(() => g.confetti(20), 500)
  setTimeout(() => g.say(line), 600)
}

/** A place that isn't open yet: say so plainly, with a reason to come back. */
export function comingSoon(o: { name: string; text: string; joke?: string; pic?: Pic; kicker?: string; actions?: CardAction[] }) {
  sfx.ding()
  picCard({ title: `${o.name} (Coming Soon)`, kicker: o.kicker, pic: o.pic, text: o.text, joke: o.joke, actions: o.actions })
}

const FOOD = ['hotdog', 'pretzel', 'pizza-slice', 'bagel', 'donut', 'gelato', 'dumplings', 'cocoa']
/** Central Park squirrels fear nothing: hold a snack near one at your own risk. */
export function squirrel(g: Game) {
  sfx.squawk()
  const held = save.look.items.hand
  if (held && FOOD.includes(held)) {
    const items = { ...save.look.items }
    delete items.hand
    save.look = { ...save.look, items }
    world.player.setLook(save.look)
    g.say(pick(['The squirrel took my snack! It’s halfway up a tree already. 🐿️', 'A squirrel just mugged me. Politely. Then not politely.']))
    toast('You still own it: grab it again from your player card.', '🐿️')
  } else g.say(pick(['That squirrel is eyeing my hands. Nothing there, buddy.', 'Central Park squirrels fear nothing. This one fears nothing in particular.', 'It’s burying an acorn. It will never find it again. Relatable.']))
}

/** Rockefeller: a lap around the ice (click anywhere to stop). */
export function skateLap(g: Game) {
  const ice = world.geo?.ice
  if (!ice || world.room.id !== 'rockefeller') return
  const cx = ice.reduce((s, p) => s + p[0], 0) / ice.length
  const cy = ice.reduce((s, p) => s + p[1], 0) / ice.length
  const step = Math.max(1, Math.floor(ice.length / 8))
  const ring: Pt[] = []
  for (let i = 0; i < ice.length; i += step) ring.push([cx + (ice[i][0] - cx) * 0.74, cy + (ice[i][1] - cy) * 0.62])
  // start from the point nearest you, go all the way round
  const p = world.player.pos
  const k = ring.reduce((b, q, i) => (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(ring[b][0] - p[0], ring[b][1] - p[1]) ? i : b), 0)
  const path = [...ring.slice(k), ...ring.slice(0, k), ring[k]]
  if (save.look.items.feet !== 'skates') g.say('Skating in sneakers. Bold choice.')
  let i = 0
  const next = () => {
    if (world.room.id !== 'rockefeller') return
    if (i >= path.length) {
      g.emote('dance', 2)
      return g.say(pick(['Triple axel! (It was a single. Don’t tell anyone.)', 'Nailed the landing. Mostly.', 'One lap. My legs say that was ten.']))
    }
    walkTo(path[i++], next)
  }
  next()
}

/** the giant floor piano (from the Fifth Avenue toy-store days): walk it from end to end. */
export function playPiano(g: Game) {
  const pf = world.geo?.piano
  if (!pf) return
  const q = pf.corners
  const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  const at = (u: number, v: number) => lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v)
  walkTo(at(0.03, 0.8), () => walkTo(at(0.97, 0.8), () => g.say('Heart and soul. With feet. 🎹')))
}

/** Central Park: row past Bow Bridge. */
export async function rowboat(g: Game) {
  const v = await g.choose('🚣 Row on The Lake', 'A lap around The Lake in a rowboat. 3 coins. The ducks will judge your technique.', [
    { label: 'Row, Row, Row (3)', value: 'go' },
    { label: 'Maybe Later', value: 'no' },
  ])
  if (v !== 'go' || !g.spend(3, 'rowboat')) return
  const release = hold()
  const r = el('div', 'scene-card rowboat-ride', `<div class="sc-inner"><div class="sc-emoji">🦆</div><div class="sc-text">splash… splash…</div><small>Under Bow Bridge, past the willows, around a very rude duck…</small></div>`)
  stage.root.append(r)
  for (let i = 0; i < 6; i++) setTimeout(() => sfx.whoosh(), i * 420)
  setTimeout(() => sfx.quack(), 1300)
  setTimeout(() => {
    r.classList.add('out')
    release()
    g.say(pick(['My arms are tired. The ducks were faster.', 'I rowed in a circle. The view was great both times.']))
    setTimeout(() => r.remove(), 600)
  }, 2900)
}

/** Battery Park: practise the life-ring toss. */
export function ringToss(g: Game) {
  g.emote('cheer', 1.5)
  sfx.whoosh()
  setTimeout(() => {
    sfx.squawk()
    g.say(pick(['It landed on a seagull. Sorry, seagull.', 'Perfect toss! Nobody needed it. Good.', 'It went three feet. The harbor is safe from me.']))
  }, 700)
}

/** Liberty Island: 354 steps up to the crown, then the view. */
export function climbCrown(g: Game) {
  const release = hold()
  const r = el('div', 'scene-card crown-climb', `<div class="sc-inner"><div class="cc-count"><b>0</b><small>of 354 steps</small></div><div class="cc-line">Up the pedestal, then the spiral stairs…</div></div>`)
  stage.root.append(r)
  const count = r.querySelector<HTMLElement>('.cc-count b')!
  const line = r.querySelector<HTMLElement>('.cc-line')!
  const lines: [number, string][] = [
    [60, 'The pedestal stairs. So far so good.'],
    [192, 'The spiral starts here: 162 steps, one person wide.'],
    [260, 'A stranger says “almost there”. They lie.'],
    [330, 'Her copper skin is only 2.4 mm thick: thinner than two stacked pennies.'],
    [354, 'The crown! 25 windows, and the whole harbor.'],
  ]
  const t0 = performance.now()
  const total = 3600
  const tick = window.setInterval(() => {
    const n = Math.min(354, Math.round(((performance.now() - t0) / total) * 354))
    count.textContent = String(n)
    const l = [...lines].reverse().find(([at]) => n >= at)
    if (l && line.textContent !== l[1]) {
      line.textContent = l[1]
      sfx.tick()
    }
    if (n >= 354) {
      clearInterval(tick)
      setTimeout(() => {
        r.classList.add('out')
        setTimeout(() => r.remove(), 600)
        release()
        g.stamp('crown-climb')
        g.binoculars({ cx: 300, cy: 110, zoom: 3, labels: [
          { at: [300, 66], text: 'One World Trade' },
          { at: [262, 150], text: 'Lower Manhattan' },
          { at: [330, 182], text: 'Battery Park' },
        ] })
      }, 900)
    }
  }, 60)
}
