import './pizzaSlice.css'
import { audioCtx, onMute, sfx } from '../../audio'
import { avatarMarkup } from '../../avatar/render'
import { randomLook } from '../../avatar/random'
import type { Look } from '../../avatar/look'
import { el, stage, toStage } from '../../engine/stage'
import { hold } from '../../engine/ui'
import { bump, save } from '../../state'
import type { Game } from '../../types'

/**
 * 99¢ Slice, at the counter, first person. Four pies sit in the glass case (plain, pepperoni, white, square
 * grandma). Point at one to order ("One plain."); the counter guy takes a slice off it and slides it back into the
 * deck oven to reheat, then it lands on a paper plate in front of you. Shake the jars on (garlic powder, red pepper,
 * oregano, parmesan), fold it down the middle (drag the two edges together; the grandma is square and stays flat),
 * then eat it in a few bites. A fork and knife lie on the counter for anyone who wants to find out what happens.
 *
 * True details: a slice shop reheats slices to order in the deck oven; paper plates; the four shakers; New Yorkers
 * fold; in January 2014 Mayor de Blasio ate a slice
 * with a fork and knife on Staten Island and the city has not let it go.
 */

const ART = '/art/places/pizza-counter.jpg'
const SPRITES = '/art/places/sprites/'
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

type Kind = 'plain' | 'pepperoni' | 'white' | 'grandma'
interface Pie {
  kind: Kind
  name: string
  price: number
  /** the pie's center in the case, and its ellipse (stage units over the painting) */
  at: [number, number]
  rx: number
  ry: number
  sprite: string
  w: number
  h: number
}
const PIES: Pie[] = [
  { kind: 'plain', name: 'Plain', price: 1, at: [185, 312], rx: 100, ry: 40, sprite: 'slice-plain.png', w: 376, h: 520 },
  { kind: 'pepperoni', name: 'Pepperoni', price: 2, at: [387, 311], rx: 94, ry: 41, sprite: 'slice-pepperoni.png', w: 377, h: 520 },
  { kind: 'white', name: 'White', price: 2, at: [582, 312], rx: 90, ry: 40, sprite: 'slice-white.png', w: 365, h: 520 },
  { kind: 'grandma', name: 'Grandma', price: 2, at: [778, 310], rx: 110, ry: 38, sprite: 'slice-grandma.png', w: 504, h: 520 },
]
const FOLDED = { sprite: 'slice-folded.png', w: 346, h: 520 }

// ---------- the counter, in stage units over the painting (2000 × 1131 drawn at 1000 × 565.5) ----------
const PLATE: [number, number] = [436, 476]
const GUY_HOME = 300
const GUY_OVEN = 392
const JAR_Y = 395
const JAR_H = 103
const JARS = [
  { id: 'garlic', name: 'Garlic Powder', x: 595, w: 61, colors: ['#f6edd3', '#ece0bd', '#fff8e4'] },
  { id: 'pepper', name: 'Red Pepper', x: 656, w: 61, colors: ['#c8321f', '#e04a26', '#a8241a', '#f2d27a'] },
  { id: 'oregano', name: 'Oregano', x: 718, w: 61, colors: ['#4d6a28', '#62803a', '#3b5520'] },
  { id: 'parm', name: 'Parmesan', x: 781, w: 61, colors: ['#fbf3d4', '#f1e2ae', '#fffaf0'] },
]

// ---------- the camera: the whole counter, the oven, or down at your plate ----------
type CamName = 'wide' | 'oven' | 'plate'
const CAMS: Record<CamName, { z: number; x: number; y: number }> = {
  wide: { z: 1, x: 0, y: 0 },
  oven: { z: 1.7, x: -425, y: -51 }, // x 250..838, y 30..362
  plate: { z: 1.6, x: -344, y: -339 }, // x 215..840, y 212..565
}

/** a slice in the cam's space: where, how big, how far it's tipped back (flat on a plate is about 58°) */
interface Pose {
  x: number
  y: number
  s: number
  tilt: number
  rot?: number
}
const tf = (p: Pose) => `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%) rotate(${p.rot ?? 0}deg) scale(${p.s.toFixed(3)}) perspective(1100px) rotateX(${p.tilt.toFixed(1)}deg)`

/**
 * Bites, as circles (x, y, r) in the sprite's pixels. Each bite is a row of overlapping circles (its edge is the
 * scallop you see) plus a filler row tucked below it, so nothing is left between this bite and the last one.
 */
function foldedBites(): [number, number, number][][] {
  // from the tip (bottom left of the folded drawing) toward the crust (top right)
  const T = [45, 455]
  const C = [250, 75]
  const len = Math.hypot(C[0] - T[0], C[1] - T[1])
  const u = [(C[0] - T[0]) / len, (C[1] - T[1]) / len]
  const v = [-u[1], u[0]]
  const R = 66
  const row = (f: number, ks: number[], r = R) =>
    ks.map((k) => {
      const px = T[0] + (C[0] - T[0]) * f - u[0] * R * 0.78 + v[0] * k * R * 1.08
      const py = T[1] + (C[1] - T[1]) * f - u[1] * R * 0.78 + v[1] * k * R * 1.08
      return [Math.round(px), Math.round(py), r] as [number, number, number]
    })
  const edge = [-1.5, -0.5, 0.5, 1.5]
  const fill = [-2, -1, 0, 1, 2]
  const fs = [0.25, 0.5, 0.74]
  return fs.map((f, i) => [...row(f, edge), ...row(i ? (f + fs[i - 1]) / 2 : f - 0.12, fill, R + 6), ...(i ? [] : [[62, 488, 56], [112, 470, 48]] as [number, number, number][])])
}
function squareBites(): [number, number, number][][] {
  const R = 78
  const xs = [44, 162, 280, 398, 516]
  const yOf = (f: number) => Math.round(520 - f * 520 + R * 0.8)
  const fs = [0.26, 0.52, 0.77]
  return fs.map((f, i) => {
    const y = yOf(f)
    const mid = Math.round((y + (i ? yOf(fs[i - 1]) : 600)) / 2)
    return [...xs.map((x) => [x, y, R] as [number, number, number]), ...[-15, ...xs].map((x) => [x + 59, mid, R + 4] as [number, number, number])]
  })
}

export function orderASlice(g: Game) {
  const release = hold()
  const root = el('div', 'pz')

  // the counter guy, in Chef Whites like the Slice Factory crew; a passerby at the window for the fork
  const tidy = (l: Look): Look => {
    // natural hair, nothing that hides the face behind the counter
    l.hairColor = l.hairColor % 6
    if (['afro', 'puffs', 'long', 'locs', 'braids'].includes(l.hair)) l.hair = (['short', 'fade', 'curly', 'buzz', 'spiky'] as const)[Math.floor(Math.random() * 5)]
    return l
  }
  const guyLook: Look = (() => {
    const l = tidy(randomLook(0.2))
    const { face } = l.items
    l.items = { body: 'chef-coat', legs: l.items.legs, feet: l.items.feet, ...(face ? { face } : {}) }
    return l
  })()
  const passerLook = tidy(randomLook(0.7))
  delete passerLook.items.face
  const avatar = (look: Look, mood: 'smile' | 'grin' | 'o', back = false, d: 1 | -1 = 1) =>
    `<svg viewBox="-60 -185 120 192" aria-hidden="true">${avatarMarkup(look, { mood, d, back })}</svg>`

  const gaps = PIES.map((p, i) => {
    if (p.kind === 'grandma') return `<polygon class="pz-gap" data-i="${i}" points="679,280 731,280 731,311 677,311"/>`
    const [cx, cy] = p.at
    const r = (a: number) => [cx + p.rx * 0.9 * Math.sin((a * Math.PI) / 180), cy - p.ry * 0.9 * Math.cos((a * Math.PI) / 180)].map((n) => n.toFixed(1)).join(' ')
    return `<path class="pz-gap" data-i="${i}" d="M ${cx} ${cy + 2} L ${r(-21)} A ${p.rx * 0.9} ${p.ry * 0.9} 0 0 1 ${r(21)} Z"/>`
  }).join('')
  const pies = PIES.map(
    (p, i) =>
      `<button class="pz-pie${p.kind === 'grandma' ? ' sq' : ''}" type="button" data-i="${i}" aria-label="${p.name} slice, ${p.price} coin${p.price > 1 ? 's' : ''}" style="left:${p.at[0] - p.rx}px;top:${p.at[1] - p.ry}px;width:${p.rx * 2}px;height:${p.ry * 2}px"><i class="pz-ring"></i></button>
      <span class="pz-tag" data-i="${i}" style="left:${p.at[0]}px"><b>${p.name}</b><img src="/art/icons/coin.png" alt="">${p.price}</span>`,
  ).join('')
  const jars = JARS.map((j, i) => `<button class="pz-jar" type="button" data-i="${i}" aria-label="${j.name}" style="left:${j.x}px;top:${JAR_Y}px;width:${j.w}px;height:${JAR_H}px"></button>`).join('')

  root.innerHTML = `<div class="pz-cam">
      <img class="pz-bg" src="${ART}" alt="" draggable="false">
      <svg class="pz-gaps" viewBox="0 0 1000 565.5" aria-hidden="true">${gaps}</svg>
      <div class="pz-window"><div class="pz-passer">${avatar(passerLook, 'o', false, -1)}</div></div>
      <div class="pz-guy"><div class="pz-guy-body">${avatar(guyLook, 'smile')}</div></div>
      <div class="pz-mouth"><i class="pz-deck"></i><i class="pz-fire"></i></div>
      <i class="pz-lip"></i>
      ${pies}
      <i class="pz-grease"></i>
      <button class="pz-cutlery" type="button" aria-label="Fork and knife">${CUTLERY}</button>
      ${jars}
    </div>
    <div class="pz-caption"><b>99¢ Slice</b><span>Little Italy</span></div>
    <div class="pz-actions"><span class="pz-coins"><img src="/art/icons/coin.png" alt=""><b></b></span><button class="btn tiny ghost pz-leave" type="button">Step Out</button></div>
    <p class="pz-bubble" hidden></p>
    <p class="pz-say" hidden></p>
    <p class="pz-line" aria-live="polite"></p>`
  stage.root.append(root)
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as unknown as T
  const cam = q('.pz-cam')
  const guy = q('.pz-guy')
  const guyBody = q('.pz-guy-body')
  const passer = q('.pz-passer')
  const mouth = q('.pz-mouth')
  const bubble = q('.pz-bubble')
  const sayEl = q('.pz-say')
  const lineEl = q('.pz-line')
  const coins = q('.pz-coins b')
  const cutlery = q<HTMLButtonElement>('.pz-cutlery')
  const grease = q('.pz-grease')
  coins.textContent = String(save.coins)

  // ---------- plumbing: timers that die with the scene ----------
  let closed = false
  const timers = new Set<number>()
  const later = (f: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.delete(t)
      if (!closed) f()
    }, ms)
    timers.add(t)
  }
  const wait = (ms: number) => new Promise<void>((r) => later(r, reduced() ? Math.min(ms, 250) : ms))

  // ---------- the camera ----------
  let camName: CamName = 'wide'
  const setCam = (n: CamName) => {
    camName = n
    const c = CAMS[n]
    cam.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.z})`
  }
  /** a point in the painting, on the stage (with the camera where it's going) */
  const toScreen = (x: number, y: number): [number, number] => {
    const c = CAMS[camName]
    return [x * c.z + c.x, y * c.z + c.y]
  }
  const screenOf = (node: Element): [number, number, number, number] => {
    const r = node.getBoundingClientRect()
    const [x, y] = toStage({ clientX: r.left, clientY: r.top })
    return [x, y, r.width / stage.scale, r.height / stage.scale]
  }

  // ---------- sound ----------
  let bedStop = () => {}
  let sizzleStop = () => {}
  const noiseBuf = (ctx: AudioContext, secs: number, kind: 'white' | 'brown' | 'crackle') => {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate)
    const d = b.getChannelData(0)
    let last = 0
    let pop = 0
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1
      if (kind === 'brown') d[i] = (last = (last + 0.02 * w) / 1.02) * 3.4
      else if (kind === 'crackle') {
        if (pop <= 0 && Math.random() < 0.0016) pop = 30 + Math.random() * 90
        d[i] = pop > 0 ? w * Math.min(1, pop / 40) : w * 0.05
        pop--
      } else d[i] = w
    }
    return b
  }
  /** a short burst of filtered noise */
  const burst = (secs: number, freq: number, vol: number, delay = 0, q = 1.2, type: BiquadFilterType = 'bandpass') => {
    const ctx = audioCtx()
    if (!ctx) return
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf(ctx, secs, 'white')
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const gn = ctx.createGain()
    gn.gain.setValueAtTime(vol, t)
    gn.gain.exponentialRampToValueAtTime(0.001, t + secs)
    src.connect(f).connect(gn).connect(ctx.destination)
    src.start(t)
  }
  const ping = (freq: number, secs: number, vol: number, delay = 0, type: OscillatorType = 'sine', to?: number) => {
    const ctx = audioCtx()
    if (!ctx) return
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + secs)
    const gn = ctx.createGain()
    gn.gain.setValueAtTime(0.0001, t)
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    gn.gain.exponentialRampToValueAtTime(0.0001, t + secs)
    o.connect(gn).connect(ctx.destination)
    o.start(t)
    o.stop(t + secs + 0.05)
  }
  const snd = {
    shake: () => [0, 0.09, 0.18].forEach((d) => burst(0.05, 5200, 0.22, d, 2)),
    flap: () => (burst(0.09, 700, 0.5, 0, 1), ping(150, 0.09, 0.12)),
    fold: () => {
      burst(0.16, 900, 0.35, 0, 0.8, 'lowpass')
      ping(320, 0.14, 0.05, 0.02, 'triangle', 180)
    },
    crunch: () => {
      ;[0, 0.05, 0.11, 0.16].forEach((d, i) => burst(0.045, 1500 + i * 400, 0.42, d, 1))
      ping(110, 0.12, 0.12, 0, 'sine', 70)
    },
    clink: () => (ping(2900, 0.35, 0.05), ping(4150, 0.25, 0.035, 0.03)),
    gasp: () => {
      const ctx = audioCtx()
      if (!ctx) return
      // a few people drawing breath at once: rising breathy noise, each voice a little different
      ;[1250, 1600, 1050].forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.035
        const src = ctx.createBufferSource()
        src.buffer = noiseBuf(ctx, 0.45, 'white')
        const f = ctx.createBiquadFilter()
        f.type = 'bandpass'
        f.frequency.setValueAtTime(freq * 0.7, t)
        f.frequency.linearRampToValueAtTime(freq, t + 0.22)
        f.Q.value = 2.2
        const gn = ctx.createGain()
        gn.gain.setValueAtTime(0.0001, t)
        gn.gain.exponentialRampToValueAtTime(0.32, t + 0.2)
        gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.34)
        src.connect(f).connect(gn).connect(ctx.destination)
        src.start(t)
      })
    },
    door: () => (burst(0.4, 500, 0.12, 0, 0.7), ping(140, 0.12, 0.08, 0, 'triangle', 90)),
  }
  const startBed = () => {
    const ctx = audioCtx()
    if (!ctx) return
    // the shop: the oven's low roar and the room
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf(ctx, 3, 'brown')
    src.loop = true
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 340
    const gn = ctx.createGain()
    gn.gain.value = 0
    gn.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 1.2)
    src.connect(low).connect(gn).connect(ctx.destination)
    src.start()
    bedStop = () => {
      gn.gain.cancelScheduledValues(ctx.currentTime)
      gn.gain.setValueAtTime(gn.gain.value, ctx.currentTime)
      gn.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4)
      setTimeout(() => src.stop(), 500)
      bedStop = () => {}
    }
  }
  const startSizzle = () => {
    const ctx = audioCtx()
    if (!ctx) return
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf(ctx, 2, 'crackle')
    src.loop = true
    const hi = ctx.createBiquadFilter()
    hi.type = 'highpass'
    hi.frequency.value = 2400
    const gn = ctx.createGain()
    gn.gain.value = 0
    gn.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.4)
    src.connect(hi).connect(gn).connect(ctx.destination)
    src.start()
    sizzleStop = () => {
      gn.gain.cancelScheduledValues(ctx.currentTime)
      gn.gain.setValueAtTime(gn.gain.value, ctx.currentTime)
      gn.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8)
      setTimeout(() => src.stop(), 900)
      sizzleStop = () => {}
    }
  }
  let sizzling = false
  startBed()
  onMute((m) => {
    if (m) {
      bedStop()
      sizzleStop()
    } else if (root.isConnected && !closed) {
      startBed()
      if (sizzling) startSizzle()
    }
  })

  // ---------- words: a quiet line, one at a time; speech bubbles ----------
  const queue: string[] = []
  let lineBusy = false
  const line = (text: string) => {
    queue.push(text)
    if (!lineBusy) nextLine()
  }
  const nextLine = () => {
    const text = queue.shift()
    if (!text) return void (lineBusy = false)
    lineBusy = true
    lineEl.textContent = text
    lineEl.classList.add('on')
    later(() => lineEl.classList.remove('on'), 4600)
    later(nextLine, 5400)
  }
  let bubbleT = 0
  /** the counter guy talks: a bubble beside his head (wherever the camera is) */
  const guySays = (text: string, ms = 2200) => {
    const [x, y] = toScreen(guyX + 44, 138)
    bubble.textContent = text
    bubble.style.left = `${Math.max(20, Math.min(840, x))}px`
    bubble.style.top = `${Math.max(14, y)}px`
    bubble.hidden = false
    bubble.classList.remove('pop')
    void bubble.offsetWidth
    bubble.classList.add('pop')
    clearTimeout(bubbleT)
    bubbleT = window.setTimeout(() => (bubble.hidden = true), ms)
  }
  /** you talk: a bubble from the bottom of the screen */
  const youSay = (text: string, ms = 1800) => {
    sayEl.textContent = text
    sayEl.hidden = false
    sayEl.classList.remove('pop')
    void sayEl.offsetWidth
    sayEl.classList.add('pop')
    later(() => (sayEl.hidden = true), ms)
  }
  /** a small pointing hint (2 to 4 words) at a spot on the stage */
  const hints: HTMLElement[] = []
  const hint = (text: string, at: [number, number], cls = '') => {
    const h = el('div', 'pz-hint ' + cls, `<span>${text}</span>`)
    h.style.left = `${at[0]}px`
    h.style.top = `${at[1]}px`
    root.append(h)
    hints.push(h)
    return h
  }
  const dropHint = (h: HTMLElement | null) => {
    if (!h) return
    h.classList.add('out')
    setTimeout(() => h.remove(), 300)
  }

  // ---------- the counter guy ----------
  let guyX = GUY_HOME
  const placeGuy = (x: number) => {
    guyX = x
    guy.style.transform = `translateX(${x - GUY_HOME}px)`
  }
  const guyFace = (mood: 'smile' | 'grin' | 'o', back = false) => {
    guyBody.innerHTML = avatar(guyLook, mood, back)
  }
  const guyArm = (deg: number) => guyBody.querySelector('.av-armR')?.setAttribute('transform', `rotate(${deg} 17 -67)`)

  // ---------- state ----------
  type Phase = 'order' | 'making' | 'plate' | 'busy' | 'held' | 'eating'
  let phase: Phase = 'order'
  let pie: Pie = PIES[0]
  let slice: HTMLElement | null = null
  let flat: HTMLElement | null = null
  let halves: HTMLElement[] = []
  let pose: Pose = { x: 0, y: 0, s: 1, tilt: 0 }
  let ordered = false // a slice is paid for and not eaten yet
  let foldedOnce = false
  let shaken = 0
  const dust: { u: number; v: number; html: string }[] = []

  /** two real halves (each its own box: a clipped full-size layer confuses the browser's 3D sorting) */
  const sliceHtml = (p: Pie) => {
    const hw = p.w / 2 + 1
    const inner = (dx: number) => `<div class="pz-full" style="left:${dx}px;width:${p.w}px"><img src="${SPRITES}${p.sprite}" alt="" draggable="false"><div class="pz-dust"></div></div>`
    return `<div class="pz-flat"><div class="pz-half l" style="width:${hw}px">${inner(0)}</div><div class="pz-half r" style="left:${p.w - hw}px;width:${hw}px">${inner(hw - p.w)}</div><div class="pz-fizz"></div></div>`
  }

  /** move the slice to a pose; resolves when it gets there */
  const moveSlice = (to: Pose, ms: number, via?: Pose, easing = 'cubic-bezier(.45,.05,.3,1)') =>
    new Promise<void>((resolve) => {
      if (!slice) return resolve()
      const node = slice
      const from = pose
      pose = to
      if (reduced() || ms <= 0) {
        node.style.transform = tf(to)
        return resolve()
      }
      const frames = via ? [{ transform: tf(from) }, { transform: tf(via), offset: 0.5 }, { transform: tf(to) }] : [{ transform: tf(from) }, { transform: tf(to) }]
      const a = node.animate(frames, { duration: ms, easing })
      a.onfinish = a.oncancel = () => {
        node.style.transform = tf(to)
        resolve()
      }
    })

  /** cheese bubbling: little blisters swell and pop on the slice */
  let fizzOn = false
  const fizz = (ms: number) => {
    fizzOn = true
    const box = slice?.querySelector<HTMLElement>('.pz-fizz')
    if (!box) return
    const t0 = performance.now()
    const blow = () => {
      if (closed || !fizzOn || !box.isConnected || performance.now() - t0 > ms) return
      const [u, v] = spot()
      const b = el('i')
      const r = 9 + Math.random() * 12
      b.style.cssText = `left:${u}px;top:${v}px;width:${r * 2}px;height:${r * 2}px;margin:${-r}px`
      box.append(b)
      setTimeout(() => b.remove(), 900)
      later(blow, 70 + Math.random() * 90)
    }
    blow()
  }
  /** a random spot on the slice's cheese, in the sprite's pixels */
  const spot = (): [number, number] => {
    if (pie.kind === 'grandma') return [60 + Math.random() * (pie.w - 120), 60 + Math.random() * (pie.h - 120)]
    const v = 105 + Math.random() * 330
    const hw = (150 * (482 - v)) / 380
    return [pie.w / 2 + (Math.random() * 2 - 1) * hw * 0.88, v]
  }

  // ---------- 1. order ----------
  const pieButtons = [...root.querySelectorAll<HTMLButtonElement>('.pz-pie')]
  let orderHint: HTMLElement | null = hint('Pick a slice', [480, 236], 'up')
  const order = async (i: number) => {
    if (phase !== 'order') return
    const p = PIES[i]
    if (save.coins < p.price) {
      sfx.squawk()
      guySays(`That’s ${p.price} coin${p.price > 1 ? 's' : ''}.`)
      return
    }
    if (!g.spend(p.price, 'slice')) return
    coins.textContent = String(save.coins)
    sfx.register()
    phase = 'making'
    root.classList.add('making')
    dropHint(orderHint)
    orderHint = null
    pie = p
    foldP = 0
    ordered = true
    shaken = 0
    dust.length = 0
    grease.classList.remove('on')
    bump('snacks')
    // "Belly Full" counts every place you've eaten at (data/rooms.ts tasted())
    const k = `ate:${g.room?.id ?? 'pizza'}:pizza-slice`
    if (!save.stats[k]) bump(k)
    if (Object.keys(save.stats).filter((s) => s.startsWith('ate:')).length >= 10) g.stamp('belly-10')

    youSay(`One ${p.name.toLowerCase()}.`)
    await wait(900)
    guySays('Two minutes.', 1800)
    await wait(700)
    if (closed) return
    // he takes a slice off the pie
    guyArm(-42)
    const gap = root.querySelector<SVGElement>(`.pz-gap[data-i="${i}"]`)
    slice = el('div', 'pz-slice' + (p.kind === 'grandma' ? ' sq' : ''), sliceHtml(p))
    slice.style.width = `${p.w}px`
    slice.style.height = `${p.h}px`
    flat = slice.querySelector('.pz-flat')
    halves = [...slice.querySelectorAll<HTMLElement>('.pz-half')]
    cam.querySelector('.pz-lip')!.before(slice)
    const [cx, cy] = p.at
    pose = p.kind === 'grandma' ? { x: 726, y: 294, s: 0.11, tilt: 62 } : { x: cx, y: cy - p.ry * 0.5, s: 0.17, tilt: 62 }
    slice.style.transform = tf(pose)
    gap?.classList.add('on')
    sfx.pop()
    await moveSlice({ x: GUY_HOME + 26, y: 196, s: 0.2, tilt: 30 }, 700, { x: (cx + GUY_HOME) / 2, y: 220, s: 0.2, tilt: 45 })
    if (closed) return
    // into the oven: the camera follows, he turns his back to slide it in
    setCam('oven')
    guyFace('smile', true)
    placeGuy(GUY_OVEN)
    await wait(500)
    snd.door()
    mouth.classList.add('open')
    await moveSlice({ x: 560, y: 174, s: 0.2, tilt: 60 }, 500)
    await moveSlice({ x: 560, y: 145, s: p.kind === 'grandma' ? 0.19 : 0.24, tilt: 72 }, 520)
    if (closed) return
    mouth.classList.add('hot')
    sizzling = true
    startSizzle()
    fizz(3400)
    await wait(700)
    guyFace('smile')
    placeGuy(GUY_HOME)
    line('Ninety-nine cents since forever.')
    await wait(2700)
    if (closed) return
    // out, onto a paper plate
    guyFace('smile', true)
    placeGuy(GUY_OVEN)
    await wait(450)
    sizzling = false
    sizzleStop()
    await moveSlice({ x: 560, y: 176, s: 0.2, tilt: 60 }, 420)
    mouth.classList.remove('hot', 'open')
    snd.door()
    setCam('plate')
    guyFace('grin')
    placeGuy(GUY_HOME)
    const flatPose: Pose = p.kind === 'grandma' ? { x: PLATE[0], y: PLATE[1] + 4, s: 0.38, tilt: 58 } : { x: PLATE[0], y: PLATE[1], s: 0.42, tilt: 60 }
    await moveSlice(flatPose, 900, { x: 500, y: 330, s: 0.36, tilt: 36 }, 'cubic-bezier(.4,0,.3,1)')
    if (closed) return
    snd.flap()
    if (p.kind === 'plain') g.stamp('slice-of-life')
    slice.classList.add('landed')
    steam()
    fizz(2600)
    guyArm(0)
    await wait(500)
    toPlate()
  }
  pieButtons.forEach((b) => {
    const i = Number(b.dataset.i)
    b.onclick = () => void order(i)
    b.onpointerenter = b.onfocus = () => root.querySelector(`.pz-tag[data-i="${i}"]`)?.classList.add('hot')
    b.onpointerleave = b.onblur = () => root.querySelector(`.pz-tag[data-i="${i}"]`)?.classList.remove('hot')
  })

  /** steam rising off a hot slice */
  const steam = () => {
    if (reduced()) return
    for (let k = 0; k < 4; k++) {
      const s = el('i', 'pz-steam')
      s.style.left = `${PLATE[0] - 40 + k * 26}px`
      s.style.top = `${PLATE[1] - 30}px`
      s.style.animationDelay = `${k * 0.45}s`
      cam.append(s)
      later(() => s.remove(), 5200)
    }
  }

  // ---------- 2. on the plate: shake, fold ----------
  let jarHint: HTMLElement | null = null
  let foldHint: HTMLElement | null = null
  const grips: HTMLElement[] = []
  const toPlate = () => {
    phase = 'plate'
    root.classList.remove('making')
    root.classList.add('plating')
    jarHint = hint('Shake a jar', toScreen(718, 388))
    if (pie.kind === 'grandma') {
      foldHint = hint('Pick it up', [toScreen(PLATE[0], 0)[0], 330])
      slice!.classList.add('grab')
      return
    }
    // two grips on the slice's edges: drag them together
    const [x, y, w, h] = screenOf(flat!)
    const mid = y + h * 0.42
    for (const side of [-1, 1] as const) {
      const grip = el('button', 'pz-grip ' + (side < 0 ? 'l' : 'r'), '<i></i>')
      grip.type = 'button'
      grip.setAttribute('aria-label', 'Fold the slice')
      grip.style.left = `${x + w / 2 + side * w * 0.36}px`
      grip.style.top = `${mid}px`
      grip.dataset.x = String(x + w / 2 + side * w * 0.36)
      root.append(grip)
      grips.push(grip)
      dragFold(grip, side, w * 0.36)
    }
    foldHint = hint('Fold it', [x + w / 2, y - 4])
  }

  // the fold: both halves rise off the plate until the edges meet
  let foldP = 0
  const setFold = (p: number) => {
    foldP = p
    const a = p * 86
    if (halves[0]) halves[0].style.transform = `rotateY(${a}deg)`
    if (halves[1]) halves[1].style.transform = `rotateY(${-a}deg)`
    if (grips.length === 2) {
      const c = (Number(grips[0].dataset.x) + Number(grips[1].dataset.x)) / 2
      for (const gr of grips) {
        const x0 = Number(gr.dataset.x)
        gr.style.left = `${x0 + (c - x0) * p * 0.9}px`
        gr.classList.toggle('near', p > 0.5)
      }
    }
  }
  const dragFold = (grip: HTMLElement, side: -1 | 1, reach: number) => {
    let startX = 0
    let dragging = false
    grip.onpointerdown = (e) => {
      if (phase !== 'plate') return
      e.preventDefault()
      grip.setPointerCapture(e.pointerId)
      startX = toStage(e)[0] - foldP * reach * -side
      dragging = true
      flat?.classList.add('bending')
      dropHint(foldHint)
      foldHint = null
    }
    grip.onpointermove = (e) => {
      if (!dragging) return
      const dx = (toStage(e)[0] - startX) * -side
      setFold(Math.max(0, Math.min(1, dx / reach)))
    }
    const up = () => {
      if (!dragging) return
      dragging = false
      flat?.classList.remove('bending')
      if (foldP > 0.35) void finishFold()
      else springBack()
    }
    grip.onpointerup = grip.onpointercancel = up
    grip.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (phase === 'plate') void finishFold()
      }
    }
  }
  const springBack = () => {
    const from = foldP
    const t0 = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 260)
      setFold(from * (1 - k) * (1 - k))
      if (k < 1 && !closed) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  const finishFold = async () => {
    if (phase !== 'plate' || pie.kind === 'grandma') return
    phase = 'busy'
    const from = foldP
    const t0 = performance.now()
    await new Promise<void>((done) => {
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 200)
        setFold(from + (1 - from) * k)
        if (k < 1 && !closed) requestAnimationFrame(step)
        else done()
      }
      requestAnimationFrame(step)
    })
    if (closed) return
    snd.fold()
    for (const gr of grips) gr.remove()
    grips.length = 0
    g.stamp('the-fold')
    if (!foldedOnce) {
      foldedOnce = true
      line('The fold: the tip stays up, the toppings stay on.')
    }
    pickUp()
  }

  // clicking the slice: the grandma lifts; a flat triangle flops (that's why you fold)
  let flopped = false
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (phase !== 'plate' || !slice || !slice.contains(t)) return
    if (pie.kind === 'grandma') return void pickUp()
    flat?.classList.remove('flop')
    void flat?.offsetWidth
    flat?.classList.add('flop')
    snd.flap()
    if (!flopped) {
      flopped = true
      line('Unfolded, the tip flops. That’s why New York folds.')
    }
  })

  // ---------- the jars ----------
  const patch = el('i', 'pz-patch')
  let jarBusy = false
  root.querySelectorAll<HTMLButtonElement>('.pz-jar').forEach((b) => {
    b.onclick = () => void shakeJar(Number(b.dataset.i), b)
  })
  const shakeJar = async (i: number, b: HTMLElement) => {
    if (phase !== 'plate' || jarBusy || !slice) {
      if (phase === 'order') {
        b.classList.remove('nope')
        void b.offsetWidth
        b.classList.add('nope')
      }
      return
    }
    jarBusy = true
    dropHint(jarHint)
    jarHint = null
    const j = JARS[i]
    // lift a copy of the jar off the painting (a patch of empty counter where it stood) and tip it over the slice
    const copy = el('i', 'pz-jarcopy')
    copy.style.cssText = `left:${j.x}px;top:${JAR_Y}px;width:${j.w}px;height:${JAR_H}px;background-position:${-j.x}px ${-JAR_Y}px`
    patch.style.cssText = `left:${j.x - 1}px;top:${JAR_Y}px;width:${j.w + 2}px;height:${JAR_H + 9}px;background-position:${-111}px ${-JAR_Y}px`
    cam.append(patch, copy)
    b.classList.add('away')
    const cx = j.x + j.w / 2
    const cy = JAR_Y + JAR_H / 2
    const over = { x: PLATE[0] + 48 - cx, y: PLATE[1] - 96 - cy }
    const lift = copy.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: `translate(${over.x * 0.5}px, ${over.y - 30}px) rotate(-70deg)`, offset: 0.5 },
        { transform: `translate(${over.x}px, ${over.y}px) rotate(-148deg)` },
      ],
      { duration: reduced() ? 1 : 480, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'forwards' },
    )
    await lift.finished.catch(() => {})
    if (closed) return
    // three good shakes
    for (let k = 0; k < 3; k++) {
      snd.shake()
      const a = copy.animate(
        [
          { transform: `translate(${over.x}px, ${over.y}px) rotate(-148deg)` },
          { transform: `translate(${over.x - 4}px, ${over.y + 9}px) rotate(-160deg)` },
          { transform: `translate(${over.x}px, ${over.y}px) rotate(-148deg)` },
        ],
        { duration: 190, easing: 'ease-in-out', fill: 'forwards' },
      )
      sprinkle(j.colors, j.id, PLATE[0] + 48 - 30, PLATE[1] - 96 + 44)
      await a.finished.catch(() => {})
      if (closed) return
    }
    const back = copy.animate(
      [{ transform: `translate(${over.x}px, ${over.y}px) rotate(-148deg)` }, { transform: `translate(${over.x * 0.5}px, ${over.y - 30}px) rotate(-60deg)`, offset: 0.5 }, { transform: 'translate(0, 0) rotate(0deg)' }],
      { duration: reduced() ? 1 : 460, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'forwards' },
    )
    await back.finished.catch(() => {})
    copy.remove()
    patch.remove()
    b.classList.remove('away')
    jarBusy = false
    shaken++
  }
  /** a pinch from the jar: a few bits fall from the lid, and land (and stay) on the slice */
  const sprinkle = (colors: string[], kind: string, lx: number, ly: number) => {
    if (!slice) return
    for (let k = 0; k < 7; k++) {
      const f = el('i', 'pz-fall')
      f.style.cssText = `left:${lx + (Math.random() - 0.5) * 16}px;top:${ly}px;background:${colors[k % colors.length]};--dx:${(Math.random() - 0.5) * 70}px;--dy:${30 + Math.random() * 30}px;animation-delay:${k * 18}ms`
      cam.append(f)
      setTimeout(() => f.remove(), 700)
    }
    if (dust.length > 260) return
    for (let k = 0; k < 13; k++) {
      const [u, v] = spot()
      const c = colors[Math.floor(Math.random() * colors.length)]
      const seed = kind === 'pepper' && c === '#f2d27a'
      const w = kind === 'garlic' ? 7 + Math.random() * 4 : seed ? 8 : 11 + Math.random() * 8
      const h = kind === 'garlic' ? w : seed ? 5 : 7 + Math.random() * 5
      const r = kind === 'garlic' || seed ? '50%' : `${30 + Math.random() * 40}% ${40 + Math.random() * 40}% ${30 + Math.random() * 50}% ${40 + Math.random() * 30}%`
      const html = `<i style="left:${u.toFixed(0)}px;top:${v.toFixed(0)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;background:${c};border-radius:${r};transform:rotate(${Math.floor(Math.random() * 180)}deg);animation-delay:${(120 + k * 22).toFixed(0)}ms"></i>`
      dust.push({ u, v, html })
      const half = u < pie.w / 2 ? 0 : 1
      halves[half]?.querySelector('.pz-dust')?.insertAdjacentHTML('beforeend', html)
    }
  }

  // ---------- 3. pick it up and eat it ----------
  let held: HTMLElement | null = null
  let mask: HTMLElement | null = null
  let bites = 0
  let biteHint: HTMLElement | null = null
  const BITES = { folded: foldedBites(), square: squareBites() }
  const heldAt = { x: 470, y: 300 }
  const pickUp = () => {
    if (!slice) return
    phase = 'held'
    root.classList.remove('plating')
    root.classList.add('eating')
    dropHint(foldHint)
    dropHint(jarHint)
    foldHint = jarHint = null
    const sq = pie.kind === 'grandma'
    const spr = sq ? pie : FOLDED
    const [sx, sy, sw, sh] = screenOf(flat!)
    // the folded drawing is a plain slice: a pepperoni or a white one gets its own top, bent onto the cheese you can see
    const face = !sq && pie.kind !== 'plain' ? `<div class="pz-face" style="clip-path:polygon(${FACE_CLIP})"><img src="${SPRITES}${pie.sprite}" alt="" draggable="false" style="width:${pie.w}px;height:${pie.h}px;transform:${affine(FLAT_TRI, FACE_TRI)}"></div>` : ''
    held = el('div', 'pz-held' + (sq ? ' sq' : ' ' + pie.kind), `<div class="pz-ink"><div class="pz-bitten"><img src="${SPRITES}${spr.sprite}" alt="" draggable="false">${face}<div class="pz-dust"></div></div></div>`)
    held.style.width = `${spr.w}px`
    held.style.height = `${spr.h}px`
    mask = held.querySelector('.pz-bitten')
    // the toppings come along: folded, they sit on the cheese face you can see
    const box = held.querySelector('.pz-dust')!
    for (const d of dust) {
      if (sq) box.insertAdjacentHTML('beforeend', d.html)
      else {
        // flat triangle (tip 188,500; corners 20,70 and 356,70) onto the folded slice's cheese face
        const b = bary(d.u, d.v, FLAT_TRI[0], FLAT_TRI[1], FLAT_TRI[2])
        const x = b[0] * FACE_TRI[0][0] + b[1] * FACE_TRI[1][0] + b[2] * FACE_TRI[2][0]
        const y = b[0] * FACE_TRI[0][1] + b[1] * FACE_TRI[1][1] + b[2] * FACE_TRI[2][1]
        box.insertAdjacentHTML('beforeend', d.html.replace(/left:[\d.]+px;top:[\d.]+px/, `left:${x.toFixed(0)}px;top:${y.toFixed(0)}px`))
      }
    }
    root.append(held)
    const s0 = sq ? sw / spr.w : (sh / spr.h) * 1.6
    const start = `translate(${sx + sw / 2}px, ${sy + sh / 2}px) translate(-50%, -50%) rotate(0deg) scale(${s0.toFixed(3)})`
    const end = heldTf(0)
    slice.style.opacity = '0'
    foldP = 0
    grease.classList.add('on')
    held.style.transform = end
    if (!reduced()) held.animate([{ transform: start, opacity: 0.4 }, { transform: end, opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.3,.9,.3,1.05)' })
    later(() => {
      slice?.remove()
      slice = null
      phase = 'eating'
      biteHint = hint('Take a bite', [heldAt.x, sq ? 120 : 92])
    }, 500)
    held.onclick = () => void bite()
  }
  const heldTf = (dip: number) => {
    const sq = pie.kind === 'grandma'
    const s = (sq ? 0.62 : 0.78) * (1 + dip * 0.08)
    return `translate(${heldAt.x}px, ${heldAt.y + dip * 70}px) translate(-50%, -50%) rotate(${sq ? -6 : -14}deg) scale(${s.toFixed(3)})`
  }
  let biting = false
  const bite = async () => {
    if (phase !== 'eating' || !held || !mask || biting) return
    biting = true
    dropHint(biteHint)
    biteHint = null
    const sq = pie.kind === 'grandma'
    const list = sq ? BITES.square : BITES.folded
    if (!reduced()) await held.animate([{ transform: heldTf(0) }, { transform: heldTf(1) }], { duration: 170, easing: 'ease-in' }).finished.catch(() => {})
    if (closed) return
    snd.crunch()
    crumbs()
    bites++
    if (bites > list.length) {
      // the last bite: the crust goes too
      held.classList.add('gone')
      await wait(450)
      held?.remove()
      held = mask = null
      finish()
      biting = false
      return
    }
    const circles = list.slice(0, bites).flat()
    const m = circles.map(([x, y, r]) => `radial-gradient(circle ${r}px at ${x}px ${y}px, transparent ${r - 1}px, #000 ${r + 0.5}px)`).join(', ')
    mask.style.setProperty('mask-image', m)
    mask.style.setProperty('-webkit-mask-image', m)
    if (!reduced()) await held.animate([{ transform: heldTf(1) }, { transform: heldTf(0) }], { duration: 260, easing: 'cubic-bezier(.3,1.4,.5,1)' }).finished.catch(() => {})
    biting = false
  }
  const crumbs = () => {
    for (let k = 0; k < 6; k++) {
      const c = el('i', 'pz-crumb')
      c.style.cssText = `left:${heldAt.x - 60 + Math.random() * 120}px;top:${heldAt.y + 150}px;--dx:${(Math.random() - 0.5) * 80}px;--dy:${120 + Math.random() * 80}px;animation-delay:${k * 25}ms`
      root.append(c)
      setTimeout(() => c.remove(), 900)
    }
  }
  const finish = async () => {
    phase = 'busy'
    ordered = false
    line('The grease spot on the plate is the receipt.')
    await wait(1200)
    if (closed) return
    setCam('wide')
    await wait(900)
    guySays('Next!', 1600)
    phase = 'order'
    root.classList.remove('plating', 'eating')
    for (const gp of root.querySelectorAll('.pz-gap')) gp.classList.remove('on')
  }

  // ---------- the fork and knife ----------
  let forkDone = false
  cutlery.onclick = async () => {
    if (forkDone || (phase !== 'order' && phase !== 'plate')) return
    if (jarBusy || foldP > 0) return
    forkDone = true
    const was = phase
    const wasCam = camName
    phase = 'busy'
    root.classList.add('gag')
    snd.clink()
    cutlery.classList.add('up')
    await wait(650)
    if (closed) return
    // the whole shop stops
    if (camName !== 'wide') setCam('wide')
    await wait(camName === wasCam ? 0 : 700)
    snd.gasp()
    guyFace('o')
    guy.classList.add('hop')
    passer.classList.add('in')
    root.classList.add('frozen')
    later(() => root.classList.remove('frozen'), 3300)
    bubble.hidden = true
    await wait(700)
    if (closed) return
    line('In 2014 a mayor ate his slice with a fork and knife. New York still brings it up.')
    g.stamp('fork-and-knife')
    await wait(2600)
    if (closed) return
    guyFace('smile')
    guy.classList.remove('hop')
    guySays('Not in here.', 1800)
    guyArm(-50)
    cutlery.classList.add('taken')
    snd.clink()
    await wait(900)
    if (closed) return
    guyArm(0)
    passer.classList.remove('in')
    await wait(900)
    if (closed) return
    if (was === 'plate') {
      setCam('plate')
      await wait(900)
    }
    root.classList.remove('gag')
    phase = was
  }

  // ---------- leaving ----------
  const leave = () => {
    if (closed) return
    closed = true
    for (const t of timers) clearTimeout(t)
    clearTimeout(bubbleT)
    fizzOn = false
    bedStop()
    sizzleStop()
    window.removeEventListener('keydown', keys, true)
    // walked out mid-slice: take it with you (if it's in your wardrobe, it goes in your hand)
    if (ordered && g.owns('pizza-slice')) g.wear('pizza-slice')
    root.classList.add('out')
    setTimeout(() => {
      root.remove()
      release()
    }, 450)
  }
  const keys = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      sfx.click()
      leave()
    } else if ((e.key === ' ' || e.key === 'Enter') && phase === 'eating' && !(t instanceof HTMLButtonElement)) {
      e.preventDefault()
      e.stopPropagation()
      void bite()
    }
  }
  window.addEventListener('keydown', keys, true)
  q('.pz-leave').onclick = () => (sfx.click(), leave())
  setCam('wide')
}

/** the flat slice's cheese (tip, left corner, right corner, under the crust), and the cheese face you can see on the
 *  folded drawing (its tip, top left under the crust, the right corner where the crust meets the fold), in sprite px */
const FLAT_TRI: number[][] = [[188, 496], [36, 92], [340, 92]]
const FACE_TRI: number[][] = [[38, 404], [74, 76], [256, 204]]
const FACE_CLIP = '44px 398px, 78px 82px, 250px 202px'

/** the CSS matrix that carries triangle a onto triangle b */
function affine(a: number[][], b: number[][]): string {
  const [[x1, y1], [x2, y2], [x3, y3]] = a
  const det = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2)
  const solve = (r1: number, r2: number, r3: number) => [
    (r1 * (y2 - y3) - y1 * (r2 - r3) + (r2 * y3 - r3 * y2)) / det,
    (x1 * (r2 - r3) - r1 * (x2 - x3) + (x2 * r3 - x3 * r2)) / det,
    (x1 * (y2 * r3 - y3 * r2) - y1 * (x2 * r3 - x3 * r2) + r1 * (x2 * y3 - x3 * y2)) / det,
  ]
  const [a1, c1, e1] = solve(b[0][0], b[1][0], b[2][0])
  const [b1, d1, f1] = solve(b[0][1], b[1][1], b[2][1])
  return `matrix(${[a1, b1, c1, d1, e1, f1].map((n) => n.toFixed(4)).join(',')})`
}

/** barycentric coordinates of (x, y) in the triangle a, b, c */
function bary(x: number, y: number, a: number[], b: number[], c: number[]): [number, number, number] {
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
  const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d
  const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d
  const l3 = 1 - l1 - l2
  const cl = (n: number) => Math.max(0.03, n)
  const s = cl(l1) + cl(l2) + cl(l3)
  return [cl(l1) / s, cl(l2) / s, cl(l3) / s]
}

/** a folded paper napkin with a fork and knife on it, lying on the counter (drawn in the counter's perspective) */
const CUTLERY = `<svg viewBox="0 0 130 84" aria-hidden="true">
  <path d="M10 46 L74 18 L124 40 L58 72 Z" fill="#fbfaf6" stroke="#1d2140" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M34 58 L98 30" stroke="#d8d4c8" stroke-width="2" fill="none"/>
  <g stroke="#1d2140" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M22 52 L80 27 L84 30 L27 56 Z" fill="#dfe4ea"/>
    <path d="M80 27 C 90 22, 100 22, 104 26 C 98 30, 92 32, 84 30 Z" fill="#eef1f5"/>
    <path d="M40 64 L88 43 L91 46 L44 68 Z" fill="#dfe4ea"/>
    <path d="M88 43 L97 39 L100 38 L103 40 L100 42 L104 43 L101 45 L105 46 L101 48 L94 50 L91 46 Z" fill="#eef1f5"/>
  </g>
  <path d="M30 52 L76 32" stroke="#fff" stroke-width="1.4" opacity=".8"/>
  <path d="M48 63 L84 47" stroke="#fff" stroke-width="1.4" opacity=".8"/>
</svg>`
