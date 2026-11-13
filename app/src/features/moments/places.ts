import './places.css'
import { sfx } from '../../audio'
import { avatarMarkup } from '../../avatar/render'
import { el } from '../../engine/stage'
import { save } from '../../state'
import type { Game } from '../../types'
import { closeUp, type CloseUp } from './closeup'
import { cu } from '../../sound/closeup'
import { paper } from '../../foley'

/**
 * The simpler close-ups, one painting each (see closeup.ts): a brass plate with the one thing worth knowing and, where
 * there is something to do, a green button or two. What a button does is handed in by data/rooms.ts (`acts`, by
 * label), so tickets, seats and doors stay where the rest of the room's rules are.
 */
type Snd = () => void
interface Dive { name: string; at: [number, number]; art: string; plate: string; right?: boolean; sound?: Snd }
interface Place { art: string; plate?: string; museum?: boolean; dives?: Dive[]; /** heard as the scene opens (the room's own background keeps playing under it) */ sound?: Snd; quiet?: boolean; buttons?: string[]; build?: (c: CloseUp, g: Game, acts: Acts) => void }
type Acts = Record<string, () => void>

const PLACES: Record<string, Place> = {
  'bow-bridge': { art: 'bow-bridge', sound: () => setTimeout(() => sfx.quack(), 700), plate: '<b>1862</b>Cast iron, shaped like a bow', buttons: ['Feed the Ducks', 'Pop the Question', 'Take a Photo'] },
  'lobby-mural': { art: 'lobby-mural', plate: '<b>410 days</b>Start to finish, 1931' },
  'owt-tower': { art: 'owt-tower', sound: () => cu.wind(), museum: true, plate: '<b>One World Trade Center</b><i>2014. Glass and steel, 1,776 feet</i>Its base is the size of each Twin Tower’s footprint.', buttons: ['Ride to the Top'] },
  'survivor-tree': { art: 'survivor-tree', quiet: true, museum: true, plate: '<b>The Survivor Tree</b><i>Callery pear</i>Found in the rubble in October 2001, nursed back in the Bronx. It blooms every spring.', buttons: ['Sit a While'] },
  oculus: { art: 'oculus', museum: true, plate: '<b>The Oculus</b><i>Santiago Calatrava, 2016. Steel and marble</i>Shaped like a bird being set free. Eleven subway lines meet under it.', buttons: ['Ride the Subway', 'Walk to Wall Street'] },
  'bridge-tower': { art: 'bridge-tower', sound: () => (sfx.gull(), setTimeout(() => sfx.toot(), 1200)), plate: '<b>1883</b>Stone, steel and a long walk', buttons: ['Walk the Bridge', 'Hang a Lock'] },
  trinity: { art: 'trinity', sound: () => cu.toll(), plate: '<b>281 feet</b>New York’s tallest until 1890', dives: [{ name: 'Churchyard', at: [690, 452], art: 'trinity-hamilton', plate: '<b>Alexander Hamilton</b>Buried here in 1804', sound: () => sfx.coo() }] },
  chrysler: { art: 'chrysler', sound: () => cu.wind(), plate: '<b>11 months</b>The world’s tallest, 1930', dives: [{ name: 'Eagle', at: [366, 392], art: 'chrysler-eagle', plate: '<b>Steel eagles</b>Copied from a 1929 hood ornament', sound: () => (cu.wind(), setTimeout(() => sfx.coo(), 900)) }] },
  'little-italy': { art: 'little-italy', plate: '<b>Mulberry Street</b>San Gennaro, every September', dives: [{ name: 'Pastry Shop', at: [900, 330], art: 'little-italy-pastry', plate: '<b>Cannoli</b>Filled to order', sound: () => cu.bell() }] },
  'scale-model': { art: 'scale-model', plate: '<b>102 floors</b>73 elevators' },
  // the old biscuit factory's chalkboard: what the hall sells, written on it; click a line to get it
  'chelsea-board': {
    art: 'chelsea-board',
    sound: () => cu.chalk(),
    plate: '<b>1912</b>A famous cookie was born here',
    build(c, _g, acts) {
      const rows: [string, string, string][] = [['Taco Loco', 'Al pastor', '3'], ['Bagel Bros', 'Scallion cream cheese', '2'], ['Donut Drop', 'With sprinkles', '2'], ['Lobster Pot', 'One roll', '30']]
      const b = el('div', 'pl-chalk', `<h3>Chelsea Market</h3>` + rows.map(([n, what, p]) => `<button type="button" data-n="${n}"><b>${n}</b><span>${what}</span><i>${p}</i></button>`).join(''))
      b.querySelectorAll<HTMLButtonElement>('button').forEach((r) => (r.onclick = () => (cu.chalk(), c.m.close(), acts[r.dataset.n!]?.())))
      c.layer.append(b)
    },
  },
  // the slice shop's wall: your own signed photo hangs in the big frame
  'wall-of-fame': {
    art: 'wall-of-fame',
    sound: () => paper.flip(),
    buttons: ['Pose for the Wall'],
    build(c) {
      c.layer.append(el('div', 'pl-frame', `<div class="pl-me"><svg viewBox="-60 -185 120 192" aria-hidden="true">${avatarMarkup(save.look)}</svg></div><em>${save.name}</em>`))
    },
  },
}

export function openPlace(g: Game, id: string, acts: Acts = {}) {
  const p = PLACES[id]
  if (!p) return
  const c = closeUp('cu-place cu-' + id + (p.quiet ? ' quiet' : ''), `/art/closeups/${p.art}.jpg`)
  if (p.sound) c.m.later(p.sound, 350)
  if (p.plate) c.plate([36, 0], p.plate, 'cu-info' + (p.museum ? ' museum' : ''))
  p.build?.(c, g, acts)
  for (const d of p.dives ?? [])
    c.pin(d.at, d.name, () => {
      c.dive(`/art/closeups/${d.art}.jpg`, d.at)
      if (d.sound) c.m.later(d.sound, 400)
      c.plate([36, 0], d.plate, 'cu-info')
    }, d.right ? 'right' : '')
  if (p.buttons?.length) {
    const bar = el('div', 'cu-go')
    for (const label of p.buttons) {
      const b = el('button', 'cu-plate go', label) as HTMLButtonElement
      b.onclick = () => (sfx.click(), c.m.close(), acts[label]?.())
      bar.append(b)
    }
    c.layer.append(bar)
  }
}
