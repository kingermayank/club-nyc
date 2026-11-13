import './arrival.css'
import { sfx } from '../audio'
import { arrival as fx } from '../foley'
import { save } from '../state'
import { el, stage, toStage } from '../engine/stage'
import { confetti } from '../engine/ui'
import { world, walkTo } from '../engine/world'
import { AvatarView, avatarMarkup } from '../avatar/render'
import { track } from '../net/events'
import { downloadCard } from './creator'
import type { Pt } from '../geometry'

/**
 * The arrival: the little movie between making your New Yorker and standing in Times Square.
 *  1. The MetroCard booth at Times Sq–42 St: pick a face, Snap (3, 2, 1, flash), your photo flies onto a card the
 *     machine prints, your name types on, your member number rolls up, and you stamp it NEW YORKER.
 *  2. The turnstile: drag the card through the reader. The first swipe always gets "please swipe again" (tradition),
 *     too fast or too slow gets told off, then GO and the arm turns.
 *  3. The train (the subway ride scene, in its intro mode), then you walk up the subway stairs into Times Square
 *     under a "Welcome to New York" title. Rosa's tour takes it from there.
 * Skip Intro (top right) goes straight to the stairs. Resolves once you're up on the street.
 */

type Face = 'smile' | 'grin' | 'o'
const FACES: { id: Face; label: string }[] = [
  { id: 'smile', label: 'Smile' },
  { id: 'grin', label: 'Big Grin' },
  { id: 'o', label: 'Surprised' },
]
/** the Times Square subway stairs, and where you come up to */
const STAIRS: Pt = [252, 528]
const UP: Pt = [500, 470]

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
/** an element's box in stage units */
function box(e: Element) {
  const r = e.getBoundingClientRect()
  const s = stage.root.getBoundingClientRect()
  return { x: (r.left - s.left) / stage.scale, y: (r.top - s.top) / stage.scale, w: r.width / stage.scale, h: r.height / stage.scale }
}
const restart = (e: Element, cls: string) => {
  e.classList.remove(cls)
  void (e as HTMLElement).offsetWidth
  e.classList.add(cls)
}

export function playArrival(o: { memberNo: number }): Promise<void> {
  return new Promise((resolve) => {
    const look = save.look
    const name = save.name
    const no = o.memberNo ? String(o.memberNo).padStart(4, '0') : 'OFFLINE'
    const since = new Date(save.memberSince || Date.now()).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    let face: Face = 'grin'
    let closed = false

    const root = el('div', 'arrival')
    root.innerHTML = `<div class="ar-bg"></div>
      <div class="ar-top"><span class="ar-place"><i>1</i><i class="r">2</i><i class="r">3</i><i class="p">7</i><i class="y">N</i> Times Sq–42 St</span><button class="btn tiny ghost ar-skip">Skip Intro</button></div>
      <div class="ar-scene"></div><div class="ar-flash"></div>`
    stage.root.append(root)
    const scene = root.querySelector<HTMLElement>('.ar-scene')!
    const flash = root.querySelector<HTMLElement>('.ar-flash')!

    // live avatars in the scene need ticking
    const views: AvatarView[] = []
    let raf = 0
    let last = performance.now()
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      views.forEach((v) => v.update(dt))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    // one key handler for the whole intro (capture, so the city's own keys stay quiet); each step sets its own
    let onKey: ((e: KeyboardEvent) => boolean) | null = null
    const keys = (e: KeyboardEvent) => {
      if (closed) return
      if (onKey?.(e)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('keydown', keys, true)
    const isGo = (e: KeyboardEvent) => e.key === 'Enter' || e.key === ' '

    const close = () => {
      if (closed) return
      closed = true
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', keys, true)
      root.classList.add('out')
      setTimeout(() => root.remove(), 500)
    }

    /** up the subway stairs into Times Square, under the title */
    const emerge = () => {
      track('arrival_done')
      const p = world.player
      if (world.room.id === 'times-square' && p) {
        p.placeAt(STAIRS)
        walkTo(UP)
      }
      const title = el('div', 'ar-title', `<small>Times Square</small><b>Welcome to New York</b>`)
      stage.root.append(title)
      setTimeout(() => title.classList.add('out'), 2600)
      setTimeout(() => title.remove(), 3200)
      setTimeout(resolve, 2400)
    }

    root.querySelector<HTMLButtonElement>('.ar-skip')!.onclick = () => {
      sfx.click()
      track('arrival_skip')
      close()
      emerge()
    }

    const head = (title: string, text: string) => `<header class="ar-head"><h2>${title}</h2><p>${text}</p></header>`
    const say = (title: string, text: string) => {
      const h = scene.querySelector<HTMLElement>('.ar-head')!
      h.querySelector('h2')!.textContent = title
      h.querySelector('p')!.textContent = text
      restart(h, 'pop')
    }

    // ---------- 1. the MetroCard booth ----------
    const booth = () => {
      scene.innerHTML = `${head('First Stop: Your MetroCard', 'Every New Yorker needs one. Pick a face, then press Snap.')}
        <div class="ar-row">
          <div class="ar-cam">
            <div class="ar-cam-top"><i class="ar-lens"></i><b>Photo Booth</b><i class="ar-bulb"></i></div>
            <div class="ar-view"><div class="ar-valance"></div><div class="ar-me"></div><div class="ar-count"></div></div>
            <div class="ar-faces">${FACES.map((f) => `<button class="ar-face${f.id === face ? ' on' : ''}" data-f="${f.id}">${f.label}</button>`).join('')}</div>
            <button class="btn go ar-snap">Snap!</button>
            <small class="ar-sign">No refunds for blinking.</small>
          </div>
          <div class="ar-machine">
            <div class="ar-machine-top"><b>MetroCard</b><span>Member cards printed here</span></div>
            <div class="ar-screen">READY</div>
            <div class="ar-slot"></div>
            <div class="ar-out">
              <div class="metrocard-id ar-card">
                <div class="mc-strip"><span>NYC</span><span>MetroCard</span></div>
                <div class="mc-body"><div class="mc-photo ar-photo"><span>PHOTO</span></div>
                  <div class="mc-info"><b class="ar-name"></b><span>🗽 New Yorker</span><small>Member since ${since}</small><small class="ar-no">No. ----</small></div></div>
                <div class="mc-mag"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="ar-actions"></div>`
      const me = scene.querySelector<HTMLElement>('.ar-me')!
      const view = new AvatarView(look, 2)
      view.setMood(face)
      view.setPose('wave')
      me.append(view.el)
      views.push(view)
      setTimeout(() => view.setPose('idle'), 1400)

      const faces = [...scene.querySelectorAll<HTMLButtonElement>('.ar-face')]
      const pick = (f: Face) => {
        face = f
        view.setMood(f)
        faces.forEach((b) => b.classList.toggle('on', b.dataset.f === f))
      }
      faces.forEach((b) => (b.onclick = () => (sfx.pop(), pick(b.dataset.f as Face))))
      const snap = scene.querySelector<HTMLButtonElement>('.ar-snap')!
      const count = scene.querySelector<HTMLElement>('.ar-count')!
      const screen = scene.querySelector<HTMLElement>('.ar-screen')!
      const out = scene.querySelector<HTMLElement>('.ar-out')!
      const card = scene.querySelector<HTMLElement>('.ar-card')!
      const slot = scene.querySelector<HTMLElement>('.ar-photo')!
      const bulb = scene.querySelector<HTMLElement>('.ar-bulb')!
      let busy = false
      onKey = (e) => {
        if (busy) return false
        const n = ['1', '2', '3'].indexOf(e.key)
        if (n >= 0) return pick(FACES[n].id), true
        if (isGo(e)) return snap.click(), true
        return false
      }

      snap.onclick = async () => {
        if (busy) return
        busy = true
        snap.disabled = true
        faces.forEach((b) => (b.disabled = true))
        track('arrival_snap', { detail: face })
        // 3, 2, 1…
        for (const n of ['3', '2', '1']) {
          count.textContent = n
          restart(count, 'pop')
          sfx.tick()
          await wait(560)
          if (closed) return
        }
        count.textContent = ''
        bulb.classList.add('lit')
        fx.shutter()
        restart(flash, 'go')
        view.setPose('cheer')
        await wait(300)
        bulb.classList.remove('lit')

        // the print drops out of the camera…
        const photoSvg = `<svg viewBox="-52 -174 104 122">${avatarMarkup(look, { mood: face })}</svg>`
        const v = box(scene.querySelector('.ar-view')!)
        const print = el('div', 'ar-polaroid', photoSvg)
        print.style.left = `${v.x + v.w / 2 - 50}px`
        print.style.top = `${v.y + v.h - 70}px`
        root.append(print)
        print.animate([{ transform: 'translateY(-40px) scale(0.6)', opacity: 0 }, { transform: 'translateY(0) rotate(-6deg)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)', fill: 'forwards' })
        setTimeout(() => view.setPose('idle'), 700)

        // …while the machine prints the card
        screen.textContent = 'PRINTING…'
        fx.print(1.3)
        out.classList.add('printing')
        await wait(1450)
        if (closed) return

        // the photo flies onto the card
        const a = box(print)
        const b = box(slot)
        const dx = b.x + b.w / 2 - (a.x + a.w / 2)
        const dy = b.y + b.h / 2 - (a.y + a.h / 2)
        const k = b.w / a.w
        await print.animate([{ transform: 'translateY(0) rotate(-6deg)' }, { transform: `translate(${dx}px, ${dy}px) rotate(2deg) scale(${k})` }], { duration: 620, easing: 'cubic-bezier(0.5, 0, 0.3, 1.15)', fill: 'forwards' }).finished
        if (closed) return
        slot.innerHTML = photoSvg
        slot.classList.add('in')
        print.remove()
        sfx.pop()

        // your name types on, your number rolls up
        const nameEl = card.querySelector<HTMLElement>('.ar-name')!
        for (const ch of name) {
          nameEl.textContent += ch
          sfx.tick()
          await wait(55)
        }
        const noEl = card.querySelector<HTMLElement>('.ar-no')!
        if (o.memberNo) {
          const t0 = performance.now()
          await new Promise<void>((done) => {
            const roll = (t: number) => {
              const f = Math.min(1, (t - t0) / 700)
              noEl.textContent = `No. ${String(Math.round(o.memberNo * f * f)).padStart(4, '0')}`
              if (f < 1) requestAnimationFrame(roll)
              else done()
            }
            requestAnimationFrame(roll)
          })
          sfx.ding()
        } else noEl.textContent = `No. ${no}`
        screen.textContent = 'STAMP IT'
        stampIt(card)
      }
    }

    /** a rubber stamp follows your pointer over the card: click to make it official */
    const stampIt = (card: HTMLElement) => {
      say('Make It Official', 'Click your card to stamp it.')
      card.classList.add('stampable')
      const stamp = el('div', 'ar-stamp', `<div class="ar-st"><i class="knob"></i><i class="neck"></i><i class="base">NYC</i></div>`)
      root.append(stamp)
      const c = box(card)
      const put = (x: number, y: number) => {
        stamp.style.left = `${x}px`
        stamp.style.top = `${y}px`
      }
      // it waits just off the card's right edge (clear of your name and photo) until your pointer comes over
      put(c.x + c.w + 46, c.y + c.h * 0.75)
      let done = false
      card.onpointermove = (e) => {
        const [x, y] = toStage(e)
        put(x, y)
      }
      const slam = async (x: number, y: number) => {
        if (done) return
        done = true
        onKey = null
        put(x, y)
        stamp.classList.add('down')
        await wait(110)
        sfx.stamp()
        restart(card, 'thud')
        const cb = box(card)
        const ink = el('div', 'ar-ink', '<b>NEW YORKER</b><small>★ CLUB NYC ★</small>')
        ink.style.left = `${Math.max(56, Math.min(cb.w - 56, x - cb.x))}px`
        ink.style.top = `${Math.max(56, Math.min(cb.h - 40, y - cb.y))}px`
        ink.style.setProperty('--r', `${Math.round(Math.random() * 24 - 16)}deg`)
        card.append(ink)
        root.querySelector('.ar-screen')!.textContent = 'WELCOME'
        card.classList.remove('stampable')
        card.onpointermove = null
        card.onclick = null
        confetti(50)
        track('arrival_stamp')
        await wait(220)
        stamp.classList.add('up')
        setTimeout(() => stamp.remove(), 400)
        say(`Official. Welcome, ${name}!`, o.memberNo ? `New Yorker No. ${no}. Your train is waiting.` : 'Your train is waiting.')
        const actions = scene.querySelector<HTMLElement>('.ar-actions')!
        const keep = el('button', 'btn ghost', 'Save My Card')
        keep.onclick = () => {
          sfx.click()
          downloadCard(look, name, 'New Yorker', '#3d72d9', since, no)
        }
        const go = el('button', 'btn go', 'To the Train →')
        go.onclick = () => {
          sfx.pop()
          turnstile()
        }
        actions.append(keep, go)
        onKey = (e) => (isGo(e) ? (go.click(), true) : false)
      }
      card.onclick = (e) => {
        const [x, y] = toStage(e)
        void slam(x, y)
      }
      onKey = (e) => {
        if (!isGo(e)) return false
        const b = box(card)
        void slam(b.x + b.w * 0.8, b.y + b.h * 0.68)
        return true
      }
    }

    // ---------- 2. the turnstile, in first person (features/turnstile.ts) ----------
    // the card you just stamped, in your hand at the real reader: the first swipe always gets "please swipe again"
    const turnstile = async () => {
      onKey = null
      root.querySelectorAll('.ar-stamp').forEach((n) => n.remove())
      const [{ swipeIn }, { stationSign }] = await Promise.all([import('./turnstile'), import('./subway')])
      const through = await swipeIn({ intro: true, station: stationSign('subway'), onSwipe: (n, verdict) => track('arrival_swipe', { detail: `${n} ${verdict}` }) })
      if (through === 'skip') {
        track('arrival_skip')
        close()
        return emerge()
      }
      void board()
    }

    // ---------- 3. the train ----------
    const board = async () => {
      onKey = null
      const { introRide } = await import('./subway')
      close()
      introRide(emerge)
    }

    booth()
  })
}
