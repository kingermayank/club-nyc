import './carriage.css'
import { sfx } from '../audio'
import { el, stage, toStage } from '../engine/stage'
import { hold } from '../engine/ui'
import { play } from '../sound/library'
import { save } from '../state'
import type { Game } from '../types'

/**
 * The Central Park carriage ride, from the seat: Biscuit's ears in front of you, the reins, the park going by.
 * Three paintings (art/places/carriage-*.jpg) and a clip made from each one, so the horse really trots and the park
 * really passes (art/video/carriage-*.mp4). You set off down the drive; partway along two arrows come up over the
 * road and you pick the way, left along the Lake or right past Bethesda Fountain (no choice, and Biscuit picks).
 * Moving the mouse leans you a little to that side. Not a game: nothing to win, a stamp at the end.
 */
type Leg = 'drive' | 'lake' | 'terrace'
const PRICE = 4
const ARROW = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
/** small pictures of where each way goes: the bridge over the water, the fountain */
const LAKE = '<svg viewBox="0 0 40 28" aria-hidden="true"><path d="M3 20 Q20 2 37 20" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M4 25 q4 -3 8 0 t8 0 t8 0 t8 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>'
const FOUNT = '<svg viewBox="0 0 40 28" aria-hidden="true"><path d="M20 4 V14 M20 6 Q11 6 10 14 M20 6 Q29 6 30 14" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M8 16 H32 L28 22 H12 Z M5 25 H35" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'

let riding = false

export function carriageRide(g: Game) {
  if (riding) return
  riding = true
  const release = hold()
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
  const legs: Leg[] = ['drive', 'lake', 'terrace']
  const root = el('div', 'cr')
  root.innerHTML = `<div class="cr-view">${legs
    .map((l) => `<div class="cr-leg" data-leg="${l}"><img src="/art/places/carriage-${l}.jpg" alt="" draggable="false"><video src="/art/video/carriage-${l}.mp4" muted playsinline preload="auto" disablepictureinpicture></video></div>`)
    .join('')}</div>
    <button class="cr-go" type="button" aria-label="Start the ride, ${PRICE} coins"><img src="/art/icons/coin.png" alt=""><b>${PRICE}</b>${ARROW('M9 5 L16 12 L9 19')}</button>
    <div class="cr-fork" hidden>
      <button class="cr-way l" type="button" aria-label="Left, along the Lake">${ARROW('M14 5 L7 12 L14 19')}${LAKE}</button>
      <button class="cr-way r" type="button" aria-label="Right, past Bethesda Fountain">${FOUNT}${ARROW('M10 5 L17 12 L10 19')}</button>
    </div>
    <button class="cr-x" type="button" aria-label="Get down">${ARROW('M6 6 L18 18 M18 6 L6 18')}</button>`
  stage.root.append(root)
  const leg = (l: Leg) => root.querySelector<HTMLElement>(`.cr-leg[data-leg="${l}"]`)!
  const clip = (l: Leg) => leg(l).querySelector('video')!
  const goBtn = root.querySelector<HTMLButtonElement>('.cr-go')!
  const fork = root.querySelector<HTMLElement>('.cr-fork')!
  const view = root.querySelector<HTMLElement>('.cr-view')!
  leg('drive').classList.add('on')

  let alive = true
  let rode = false
  let stopHooves: (() => void) | null = null
  const timers: number[] = []
  const later = (f: () => void, ms: number) => void timers.push(window.setTimeout(() => alive && f(), ms))
  const leave = () => {
    if (!alive) return
    alive = false
    for (const t of timers) clearTimeout(t)
    stopHooves?.()
    for (const l of legs) clip(l).pause()
    window.removeEventListener('keydown', keys, true)
    root.classList.add('out')
    setTimeout(() => {
      root.remove()
      release()
      riding = false
      if (rode) {
        g.say('Biscuit is my best friend now. 🐴')
        g.stamp('carriage')
      }
    }, 500)
  }

  /** start a leg's clip; `done` runs when it ends */
  const run = (l: Leg, done: () => void) => {
    const v = clip(l)
    for (const k of legs) leg(k).classList.toggle('on', k === l)
    if (calm) return later(done, 2600)
    v.currentTime = 0
    v.addEventListener('playing', () => v.classList.add('on'), { once: true })
    v.addEventListener('ended', () => alive && done(), { once: true })
    // a clip that can't play still ends the leg (the painting stands in for it)
    void v.play().catch(() => later(done, 2600))
  }

  let way: Leg | null = null
  const choose = (l: Leg) => {
    if (way || fork.hidden) return
    way = l
    sfx.click()
    fork.classList.add(l === 'lake' ? 'went-l' : 'went-r')
  }
  root.querySelector<HTMLElement>('.cr-way.l')!.onclick = () => choose('lake')
  root.querySelector<HTMLElement>('.cr-way.r')!.onclick = () => choose('terrace')

  goBtn.onclick = () => {
    if (save.coins < PRICE) return void g.say('Four coins a ride. Biscuit doesn’t do credit.')
    if (!g.spend(PRICE, 'carriage-ride')) return
    rode = true
    sfx.coin()
    goBtn.hidden = true
    stopHooves = play('carriage.ride', { seconds: 16 })
    if (!stopHooves) for (let i = 0; i < 30; i++) later(() => sfx.tick(), i * 330)
    // the fork comes up while you're still moving, so the horse never stands waiting on you
    later(() => (fork.hidden = false), calm ? 300 : 2400)
    run('drive', () => {
      const pick = way ?? (Math.random() < 0.5 ? 'lake' : 'terrace')
      way = pick
      fork.hidden = true
      run(pick, () => later(leave, 500))
    })
  }

  // leaning: the view follows your head a little
  root.onpointermove = (e) => {
    const [x] = toStage(e)
    view.style.transform = `translateX(${(((500 - x) / 500) * 14).toFixed(1)}px) scale(1.04)`
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') leave()
    else if (e.key === 'ArrowLeft') choose('lake')
    else if (e.key === 'ArrowRight') choose('terrace')
    else if ((e.key === 'Enter' || e.key === ' ') && !goBtn.hidden) goBtn.click()
    else return
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('keydown', keys, true)
  root.querySelector<HTMLElement>('.cr-x')!.onclick = () => (sfx.click(), leave())
}
