import { sfx } from '../../audio'
import type { Game } from '../../types'
import { closeUp } from './closeup'
import { cu } from '../../sound/closeup'

/**
 * Climbing the Vessel, Hudson Yards. You walk in at the bottom and look up through it, climb to a landing halfway,
 * then to the top, where there are two views: west over the Hudson and the rail yard, east to Midtown. Each stage is
 * its own painting made from the plaza's, so the sunset is the same one you left downstairs.
 *
 * True details: 154 flights of stairs, almost 2,500 steps and 80 landings, 16 stories; designed by Thomas
 * Heatherwick's studio; opened in 2019.
 */
const ART = '/art/closeups/'

/** feet on a metal stair, a flight's worth */
function flight() {
  for (let i = 0; i < 6; i++) setTimeout(() => sfx.tick(), i * 190)
}

export function climbTheVessel(g: Game) {
  const c = closeUp('cu-vessel', ART + 'vessel-up.jpg')
  c.plate([36, 478], '<b>2,500 steps</b>154 flights, 80 landings')
  const top = () => {
    flight()
    c.dive(ART + 'vessel-west.jpg', [500, 120])
    c.m.later(() => cu.wind(), 500)
    c.plate([36, 478], '<b>16 stories up</b>The Hudson, looking west')
    g.stamp('vessel-top')
    const east = c.plate([0, 0], 'Look East', 'go') as HTMLElement
    east.style.cssText = 'right:36px;bottom:36px;left:auto;top:auto'
    east.onclick = () => {
      sfx.click()
      c.dive(ART + 'vessel-east.jpg', [900, 300])
      c.plate([36, 478], '<b>Midtown</b>The Empire State, dead ahead')
    }
  }
  const climb = c.plate([0, 0], 'Climb', 'go') as HTMLElement
  climb.style.cssText = 'right:36px;bottom:36px;left:auto;top:auto'
  climb.onclick = () => {
    sfx.click()
    flight()
    c.dive(ART + 'vessel-mid.jpg', [500, 200])
    c.plate([36, 478], '<b>Halfway</b>Eight stories of stairs to go')
    const up = c.plate([0, 0], 'Keep Climbing', 'go') as HTMLElement
    up.style.cssText = 'right:36px;bottom:36px;left:auto;top:auto'
    up.onclick = () => (sfx.click(), top())
  }
}
