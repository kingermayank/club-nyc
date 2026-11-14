/**
 * The iFruit unboxing: Rosa's welcome gift. A box on your table; click and the tape tears, the flaps open, the phone
 * rises out of the tissue paper, turns to face you and wakes ("Hello" in the game's five languages). Pick a
 * wallpaper, then it flies into your toolbar and Rosa's first message arrives. New New Yorkers get it in the
 * arrival, right after their subway card is stamped (first the card, then the phone); anyone who skipped the intro,
 * and everyone from before the phone, gets it once on their next visit. Skip and Escape always work.
 */
import './unboxing.css'
import { el, stage } from '../../engine/stage'
import { hold } from '../../engine/ui'
import { save } from '../../state'
import { sigColor } from '../../avatar/look'
import { ifr, store, emit } from './store'
import { reduced, phoneButton } from './phone'
import { receiveLocal } from './net'
import { tone } from './sound'

const WALLS = ['skyline', 'subway', 'park'] as const
const HELLOS = ['Hello', 'Hola', 'Bonjour', 'नमस्ते', '你好']
const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced() ? Math.min(ms, 120) : ms))

/** once, for players who don't have one yet */
export function unboxIfNew() {
  if (ifr().unboxed || !save.created) return
  // not while something else owns the screen (a tour card, a panel): try again in a bit
  if (stage.root.querySelector('.tour, .creator, .ifu, .arrival, .game-shell, .payout') || stage.overlay.classList.contains('open')) return void setTimeout(unboxIfNew, 4000)
  void unboxPhone()
}

let running = false
/** resolves once the phone is in your pocket (or skipped) */
export function unboxPhone(replay = false, o: { arrival?: boolean } = {}): Promise<void> {
  if (running || (ifr().unboxed && !replay)) return Promise.resolve()
  running = true
  let resolveDone: () => void = () => {}
  const done = new Promise<void>((r) => (resolveDone = r))
  const release = hold()
  const root = el('div', 'ifu' + (o.arrival ? ' in-arrival' : ''))
  root.innerHTML = `<img class="ifu-bg closed" src="/art/ifruit/unboxing-closed.jpg" alt=""><img class="ifu-bg open" src="/art/ifruit/unboxing.jpg" alt="">
    <i class="ifu-rays"></i><button class="ifu-box" type="button" aria-label="Open the box"></button>
    <div class="ifu-tag"><b>${o.arrival ? 'One More Thing' : 'From Rosa'}</b><span>Every New Yorker needs one.</span></div>
    <div class="ifu-hint">Click to open</div>
    <div class="ifu-phone" style="--shell:${sigColor(save.look)}"><div class="ifu-flip"><div class="ifu-back"><img src="/art/ifruit/logo-mono.svg" alt=""><i class="ifu-cam"></i></div><div class="ifu-front"><div class="ifu-scr"><img class="ifu-logo" src="/art/ifruit/logo-cherry.svg" alt=""><b class="ifu-hello"></b><div class="ifu-pick" hidden><small>Pick a wallpaper</small><div class="ifu-walls">${WALLS.map((w, i) => `<button type="button" data-w="${w}" class="${i === 0 ? 'on' : ''}"><img src="/art/ifruit/wall-${w}.jpg" alt="${w}"></button>`).join('')}</div><button class="ifu-done btn small go" type="button">Done</button></div></div></div></div></div>
    <button class="ifu-skip btn tiny ghost" type="button">Skip</button>`
  stage.root.append(root)
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector(s) as T
  const phone = q('.ifu-phone')
  let wall: string = WALLS[0]
  let finished = false

  const finish = async (skipped = false) => {
    if (finished) return
    finished = true
    window.removeEventListener('keydown', keys, true)
    const s = ifr()
    s.unboxed = Date.now()
    s.wallpaper = wall
    store()
    emit('wallpaper')
    // into your pocket: the phone flies to its toolbar button
    const btn = phoneButton()
    if (!skipped && btn && !reduced()) {
      const a = phone.getBoundingClientRect()
      const b = btn.getBoundingClientRect()
      const k = stage.scale
      const dx = (b.left + b.width / 2 - (a.left + a.width / 2)) / k
      const dy = (b.top + b.height / 2 - (a.top + a.height / 2)) / k
      root.classList.add('leaving')
      tone('lower')
      await phone.animate([{ transform: 'translate(-50%, -50%) scale(1)' }, { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.3 - 60}px)) scale(0.5) rotate(-12deg)`, offset: 0.45 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.08) rotate(-30deg)`, opacity: 0.6 }], { duration: 760, easing: 'cubic-bezier(0.5, 0, 0.3, 1)', fill: 'forwards' }).finished
      btn.classList.add('ifu-got')
      setTimeout(() => btn.classList.remove('ifu-got'), 1400)
    }
    root.classList.add('out')
    setTimeout(() => {
      root.remove()
      release()
      running = false
      resolveDone()
    }, 380)
    // Rosa's welcome note, now her first message
    if (!replay || !s.local['rosa']?.length)
      setTimeout(() => receiveLocal('rosa', 'Rosa', `Welcome to the building! Your subway card has ${save.coins} coins on it. THREAD in SoHo has outfits, the I ♥ NY shop in Times Square has souvenirs, and a job pays when you want more. Text me if you need anything. (The elevator’s out again. Take the stairs.)`), 900)
  }

  const open = async () => {
    if (root.classList.contains('opening')) return
    root.classList.add('opening')
    tone('tap')
    q('.ifu-hint').remove()
    // the tape tears, the box shakes, the flaps fly
    q('.ifu-box').classList.add('shake')
    tearSound()
    await wait(520)
    root.classList.add('opened')
    tone('raise')
    await wait(650)
    // up out of the tissue paper, then it turns around to face you
    root.classList.add('rise')
    await wait(900)
    root.classList.add('turn')
    tone('unlock')
    await wait(700)
    root.classList.add('wake')
    const hello = q('.ifu-hello')
    for (const h of HELLOS) {
      if (finished) return
      hello.textContent = h
      hello.classList.remove('in')
      void hello.offsetWidth
      hello.classList.add('in')
      await wait(520)
    }
    if (finished) return
    root.classList.add('setup')
    q('.ifu-pick').hidden = false
    tone('note')
    setTimeout(() => q<HTMLButtonElement>('.ifu-done').focus({ preventScroll: true }), 100)
  }

  q('.ifu-box').onclick = () => void open()
  root.querySelectorAll<HTMLButtonElement>('.ifu-walls button').forEach(
    (b) =>
      (b.onclick = () => {
        tone('tap')
        wall = b.dataset.w!
        root.querySelectorAll('.ifu-walls button').forEach((x) => x.classList.toggle('on', x === b))
        q('.ifu-scr').style.setProperty('--wall', `url(/art/ifruit/wall-${wall}.jpg)`)
      }),
  )
  q('.ifu-scr').style.setProperty('--wall', `url(/art/ifruit/wall-${wall}.jpg)`)
  q('.ifu-done').onclick = () => void finish()
  q('.ifu-skip').onclick = () => void finish(true)
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return e.preventDefault(), e.stopPropagation(), void finish(true)
    if ((e.key === 'Enter' || e.key === ' ') && !root.classList.contains('opening')) return e.preventDefault(), e.stopPropagation(), void open()
    if (root.classList.contains('setup') && e.key.startsWith('Arrow')) {
      e.preventDefault()
      const i = WALLS.indexOf(wall as (typeof WALLS)[number]) + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0)
      root.querySelectorAll<HTMLButtonElement>('.ifu-walls button')[(i + 3) % 3]?.click()
    }
    e.stopPropagation()
  }
  window.addEventListener('keydown', keys, true)
  setTimeout(() => q('.ifu-box').focus({ preventScroll: true }), 300)
  return done
}

/** tape tearing: a quick burst of filtered noise */
function tearSound() {
  void import('../../audio').then(({ audioCtx }) => {
    const a = audioCtx()
    if (!a) return
    const len = Math.floor(a.sampleRate * 0.35)
    const buf = a.createBuffer(1, len, a.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * (Math.random() < 0.3 ? 1 : 0.4)
    const src = a.createBufferSource()
    src.buffer = buf
    const f = a.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 2400
    f.Q.value = 0.8
    const g = a.createGain()
    g.gain.value = 0.18
    src.connect(f).connect(g).connect(a.destination)
    src.start()
  })
}
