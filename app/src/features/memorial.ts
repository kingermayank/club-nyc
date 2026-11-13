import './memorial.css'
import { audioCtx, onMute, sfx } from '../audio'
import { el, stage, toStage } from '../engine/stage'
import { hold } from '../engine/ui'
import { world } from '../engine/world'

/**
 * The 9/11 Memorial, up close. You stand at the bronze parapet of the North Pool: the water falls down the walls,
 * runs across the pool and drops away into the center void (a painting, with the water itself moving in a clip made
 * from that same painting), and the inscriptions are cut into the bronze in front of you. Move along the parapet
 * with the mouse; take a white rose from the ledge and set it on a name (the memorial leaves one on each person's
 * name on their birthday). The story of the place is an exhibit panel that opens right here, over the pool.
 *
 * Nothing here is a game: no coins, no confetti, no chime. The stamp is recorded silently and the HUD stays out of
 * sight. The inscriptions are invented names, a few dozen, softened so they read as inscriptions and not as anyone:
 * never the real names (the founder's call, 2026-11-11), and nothing here should make anyone feel worse for visiting.
 */

/** the parapet's inscriptions: a few rows of names, wider than the screen, so you can walk along them */
const NAMES_W = 2600
const ROWS = 4
/** where the roses wait on the ledge (stage units): the middle of the bundle */
const BUNDLE = { x: 750, y: 402 }

/** an invented name, put together from syllables (never a real person's), shown softened so it reads as a name and
 *  can't be read as one */
const OPEN = ['Ma', 'Ro', 'Le', 'An', 'Da', 'Ni', 'Jo', 'Ca', 'El', 'Sa', 'Te', 'Mi', 'Lu', 'Ra', 'Vi', 'Ke', 'Bre', 'To']
const MID = ['ri', 'na', 'lo', 'ren', 'vi', 'sa', 'del', 'mo', 'li', 'ta', 'ne', 'ro', 'ba', 'gan']
const CLOSE = ['a', 'o', 'el', 'en', 'ie', 'is', 'an', 'y', 'on', 'e', 'er', 'ez']
function fakeName(seed: number): string {
  let s = seed
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const of = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const word = (mids: number) => of(OPEN) + Array.from({ length: mids }, () => of(MID)).join('') + of(CLOSE)
  return `${word(rnd() < 0.5 ? 0 : 1)} ${word(1 + Math.round(rnd()))}`
}

const ROSE = '<img src="/art/memorial/rose.png" alt="" draggable="false">'

/** The exhibit's four stops, in the order they happened. */
const STORY = [
  { img: 'towers', when: '1973', title: 'The Twin Towers', kicker: '1973 to 2001', text: 'For nearly 30 years the Twin Towers of the World Trade Center stood here, 110 stories each. On September 11, 2001, terrorist attacks destroyed them. 2,977 people were killed that day in New York, at the Pentagon and in Pennsylvania, including more than 400 first responders.' },
  { img: 'survivor', when: '2010', title: 'The Survivor Tree', kicker: 'Replanted 2010', text: 'A Callery pear found in the rubble in October 2001, burned, with one living branch. It was nursed back to health in the Bronx and replanted here. It blooms white every spring, and its seedlings go to communities around the world that have lived through hard times.' },
  { img: 'today', when: '2011', title: 'The Memorial', kicker: 'Opened 2011', text: 'Two reflecting pools sit in the towers’ footprints, each nearly an acre, with the largest man-made waterfalls in North America. The names of the 2,983 people killed in the attacks of 2001 and 1993 are inscribed in bronze around them.' },
  { img: 'tribute', when: 'Each year', title: 'Tribute in Light', kicker: 'Every September 11', text: 'Every year on the evening of September 11, two beams of light shine about four miles into the sky from Lower Manhattan, one for each tower.' },
]
const ARROW = (d: 1 | -1) => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${d > 0 ? 'M7 4 L13 10 L7 16' : 'M13 4 L7 10 L13 16'}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const CROSS = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>'
const BOOK = '<svg viewBox="0 0 24 20" aria-hidden="true"><path d="M12 4 C9 2 5 2 2 3 V17 C5 16 9 16 12 18 C15 16 19 16 22 17 V3 C19 2 15 2 12 4 Z M12 4 V18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>'

/**
 * The story of the place: an exhibit panel like the ones on the plaza, a picture, a few sentences and a timeline
 * along the bottom. Everything sits in a fixed place (the arrows, the timeline, the x), whatever the text's length.
 * It opens over whatever `host` is showing (the parapet scene, or the room) and closes back to it.
 */
export function memorialStory(host: HTMLElement = stage.root, start = 0): { close: () => void; open: () => boolean } {
  const release = host === stage.root ? hold() : () => {}
  let i = start
  let alive = true
  const root = el('div', 'mem-story-layer')
  root.innerHTML = `<div class="mem-story" role="dialog" aria-label="The story of this place">
      <figure class="ms-pic"><img alt="" draggable="false"></figure>
      <div class="ms-body"><div class="ms-kicker"></div><h2></h2><p></p></div>
      <button class="ms-nav prev" type="button" aria-label="Earlier">${ARROW(-1)}</button>
      <button class="ms-nav next" type="button" aria-label="Later">${ARROW(1)}</button>
      <div class="ms-rail" role="tablist">${STORY.map((p, k) => `<button class="ms-stop" type="button" role="tab" data-i="${k}"><i></i><span>${p.when}</span></button>`).join('')}</div>
      <button class="mem-x ms-x" type="button" aria-label="Close">${CROSS}</button>
    </div>`
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!
  const img = q<HTMLImageElement>('.ms-pic img')
  const stops = [...root.querySelectorAll<HTMLButtonElement>('.ms-stop')]
  const prev = q<HTMLButtonElement>('.ms-nav.prev')
  const next = q<HTMLButtonElement>('.ms-nav.next')
  const show = (n: number) => {
    i = Math.max(0, Math.min(STORY.length - 1, n))
    const page = STORY[i]
    img.src = `/art/memorial/${page.img}.jpg`
    q('.ms-kicker').textContent = page.kicker
    q('h2').textContent = page.title
    q('.ms-body p').textContent = page.text
    stops.forEach((s, k) => {
      s.classList.toggle('on', k === i)
      s.classList.toggle('past', k < i)
      s.setAttribute('aria-selected', String(k === i))
    })
    prev.disabled = i === 0
    next.disabled = i === STORY.length - 1
  }
  const close = () => {
    if (!alive) return
    alive = false
    window.removeEventListener('keydown', keys, true)
    root.classList.add('out')
    setTimeout(() => root.remove(), 300)
    release()
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') show(i + (e.key === 'ArrowRight' ? 1 : -1))
    else if (e.key === 'Escape') close()
    else return
    e.preventDefault()
    e.stopImmediatePropagation()
  }
  window.addEventListener('keydown', keys, true)
  prev.onclick = () => (sfx.click(), show(i - 1))
  next.onclick = () => (sfx.click(), show(i + 1))
  stops.forEach((s, k) => (s.onclick = () => (sfx.click(), show(k))))
  q('.ms-x').onclick = () => (sfx.click(), close())
  root.onpointerdown = (e) => {
    e.stopPropagation()
    if (e.target === root) close()
  }
  root.onpointermove = (e) => e.stopPropagation()
  show(i)
  host.append(root)
  world.api.stamp('remember', { quiet: true })
  return { close, open: () => alive }
}

export function visitMemorial(): Promise<void> {
  return new Promise((resolve) => {
    const release = hold()
    // recorded, quietly: no chime, no XP, no toast at a memorial
    world.api.stamp('remember', { quiet: true })

    const root = el('div', 'mem')
    let names = ''
    let seed = 7
    for (let r = 0; r < ROWS; r++) {
      let row = ''
      let x = 24 + (r % 2) * 70
      while (x < NAMES_W - 160) {
        seed += 13
        row += `<button class="mem-name" type="button" aria-label="An inscribed name. Leave a white rose" style="left:${x}px"><span class="mem-text" aria-hidden="true">${fakeName(seed)}</span></button>`
        x += 200 + (seed % 7) * 14
      }
      names += `<div class="mem-row" style="top:${14 + r * 30}px">${row}</div>`
    }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    root.innerHTML = `<div class="mem-view">
        <img class="mem-art" src="/art/memorial/pool.jpg" alt="" draggable="false">
        <video class="mem-water" src="/art/video/memorial-pool.mp4" muted loop playsinline preload="auto" disablepictureinpicture aria-hidden="true"></video>
        <div class="mem-face"><div class="mem-names">${names}</div></div>
      </div>
      <div class="mem-sign"><b>9/11 Memorial</b><span>North Pool</span></div>
      <button class="mem-bundle" type="button" aria-label="Take a white rose">${ROSE}${ROSE}${ROSE}</button>
      <div class="mem-card" aria-live="polite"><span>Leave a white rose</span></div>
      <div class="mem-actions"><button class="mem-story-btn" type="button">${BOOK}<span>The Story</span></button><button class="mem-x mem-leave" type="button" aria-label="Step back">${CROSS}</button></div>`
    stage.root.append(root)
    const strip = root.querySelector<HTMLElement>('.mem-names')!
    const card = root.querySelector<HTMLElement>('.mem-card span')!
    const bundle = root.querySelector<HTMLButtonElement>('.mem-bundle')!
    const water = root.querySelector<HTMLVideoElement>('.mem-water')!
    // the water only shows once it's really playing; until then (and with motion turned down) the painting stands
    water.addEventListener('playing', () => water.classList.add('on'), { once: true })
    if (!still) void water.play().catch(() => {})

    // ---------- walking along the parapet: ease toward where the pointer points ----------
    let pan = (NAMES_W - 1000) / 2
    let aim = pan
    let raf = 0
    let carry: HTMLElement | null = null
    const frame = () => {
      pan += (aim - pan) * 0.08
      strip.style.transform = `translateX(${(-pan).toFixed(1)}px)`
      raf = requestAnimationFrame(frame)
    }
    root.onpointermove = (e) => {
      const [x, y] = toStage(e)
      aim = Math.max(0, Math.min(1, x / 1000)) * (NAMES_W - 1000)
      if (carry) carry.style.transform = `translate(${x}px, ${y}px)`
    }
    raf = requestAnimationFrame(frame)

    // ---------- the sound of the water ----------
    let stopWater = () => {}
    const startWater = () => {
      const ctx = audioCtx()
      if (!ctx) return
      const len = ctx.sampleRate * 3
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = buf.getChannelData(0)
      let last = 0
      for (let i = 0; i < len; i++) {
        // brown-ish noise: a deep, steady rush
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
        d[i] = last * 3.2
      }
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const low = ctx.createBiquadFilter()
      low.type = 'lowpass'
      low.frequency.value = 900
      const gain = ctx.createGain()
      gain.gain.value = 0
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.5)
      src.connect(low).connect(gain).connect(ctx.destination)
      src.start()
      stopWater = () => {
        gain.gain.cancelScheduledValues(ctx.currentTime)
        gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6)
        setTimeout(() => src.stop(), 700)
        stopWater = () => {}
      }
    }
    startWater()
    onMute((m) => (m ? stopWater() : root.isConnected && startWater()))

    // ---------- a white rose: take one from the ledge (or just touch a name) and it's set into the letters ----------
    let roses = 0
    /** a point of the page in stage units, inside the scene */
    const at = (r: DOMRect): [number, number] => {
      const s = stage.root.getBoundingClientRect()
      return [(r.left + r.width / 2 - s.left) / stage.scale, (r.top + r.height / 2 - s.top) / stage.scale]
    }
    const drop = () => {
      carry?.remove()
      carry = null
      root.classList.remove('carrying')
    }
    bundle.onclick = (e) => {
      e.stopPropagation()
      if (carry) return drop()
      const [x, y] = toStage(e)
      carry = el('i', 'mem-carry', ROSE)
      carry.style.transform = `translate(${x || BUNDLE.x}px, ${y || BUNDLE.y}px)`
      root.append(carry)
      root.classList.add('carrying')
    }
    const place = (name: HTMLElement) => {
      if (name.querySelector('.mem-rose') || name.dataset.busy) return
      name.dataset.busy = '1'
      // the rose travels from your hand (or from the ledge) to the name, then stays in it
      const from: [number, number] = carry ? at(carry.getBoundingClientRect()) : [BUNDLE.x, BUNDLE.y]
      const to = at(name.getBoundingClientRect())
      drop()
      const fly = el('i', 'mem-fly', ROSE)
      fly.style.transform = `translate(${from[0]}px, ${from[1]}px) rotate(20deg)`
      root.append(fly)
      void fly.offsetWidth
      fly.style.transform = `translate(${to[0]}px, ${to[1] - 4}px) rotate(-34deg)`
      setTimeout(() => {
        fly.remove()
        name.append(el('span', 'mem-rose', ROSE))
        delete name.dataset.busy
        roses++
        if (roses === 1) card.textContent = 'One on every birthday'
        // the rose stays on the parapet in the plaza, too
        void import('./downtown').then((m) => m.placeRose(world.api, true))
      }, still ? 0 : 620)
    }
    root.querySelectorAll<HTMLElement>('.mem-name').forEach((name) => {
      name.onclick = (e) => {
        e.stopPropagation()
        place(name)
      }
    })

    // ---------- the story of the place, right here ----------
    let story: ReturnType<typeof memorialStory> | null = null
    root.querySelector<HTMLElement>('.mem-story-btn')!.onclick = (e) => {
      e.stopPropagation()
      sfx.click()
      drop()
      story = memorialStory(root)
    }

    // ---------- leaving ----------
    let closed = false
    const leave = () => {
      if (closed) return
      closed = true
      cancelAnimationFrame(raf)
      stopWater()
      story?.close()
      window.removeEventListener('keydown', keys, true)
      root.classList.add('out')
      setTimeout(() => {
        root.remove()
        release()
        resolve()
      }, 600)
    }
    const keys = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || story?.open()) return
      e.preventDefault()
      e.stopPropagation()
      if (carry) return drop()
      leave()
    }
    window.addEventListener('keydown', keys, true)
    root.querySelector<HTMLElement>('.mem-leave')!.onclick = leave
  })
}
