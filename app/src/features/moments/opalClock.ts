import './opalClock.css'
import { el } from '../../engine/stage'
import type { Game } from '../../types'
import { closeUp } from './closeup'
import { cu } from '../../sound/closeup'

/**
 * The opal clock over Grand Central's information booth, up close, and it tells the time: the hands are drawn live
 * on the painted face, set to New York. "Meet me at the clock" is the one thing to do, on a brass plate.
 */
/** the painted face (stage px): centre and radius */
const C: [number, number] = [497, 268]
const R = 118

function nyTime(): [number, number, number] {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }).formatToParts(new Date())
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0)
  return [n('hour') % 12, n('minute'), n('second')]
}

export function opalClock(g: Game) {
  const c = closeUp('cu-clock', '/art/closeups/opal-clock.jpg')
  const hands = el('div', 'oc-hands', `<svg viewBox="-100 -100 200 200"><line class="oc-h" y2="-48"/><line class="oc-m" y2="-74"/><line class="oc-s" y1="14" y2="-80"/><circle r="6"/></svg>`)
  hands.style.cssText = `left:${C[0] - R}px;top:${C[1] - R}px;width:${R * 2}px;height:${R * 2}px`
  c.layer.append(hands)
  const [hh, mm, ss] = ['.oc-h', '.oc-m', '.oc-s'].map((q) => hands.querySelector<SVGLineElement>(q)!)
  let lastS = -1
  const set = () => {
    const [h, m, s] = nyTime()
    if (s !== lastS) (lastS = s), cu.tick()
    hh.style.transform = `rotate(${(h + m / 60) * 30}deg)`
    mm.style.transform = `rotate(${(m + s / 60) * 6}deg)`
    ss.style.transform = `rotate(${s * 6}deg)`
  }
  set()
  let acc = 0
  c.m.frame((dt) => {
    acc += dt
    if (acc > 0.25) (acc = 0), set()
  })
  c.plate([36, 478], '<b>$20 million</b>Four opal faces')
  const meet = c.plate([0, 0], 'Meet Me at the Clock', 'go') as HTMLElement
  meet.style.cssText = 'right:36px;bottom:36px;left:auto;top:auto'
  meet.onclick = () => {
    c.m.close()
    g.emote('wave', 2)
    g.say('Meet me at the clock! (Which side? All of them.)')
  }
}
