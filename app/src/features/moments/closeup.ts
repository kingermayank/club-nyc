import './closeup.css'
import { sfx } from '../../audio'
import { paper } from '../../foley'
import { el } from '../../engine/stage'
import { closeX, openMoment, type Moment } from './kit'

/**
 * A close-up: clicking a landmark fills the stage with a painting of the thing itself (art/closeups), and whatever
 * there is to know or do lives ON the picture: a ring to click, a small brass plate, a live clock hand. No card, no
 * paragraph. Close with the x, Escape, or by stepping back out of the deepest layer.
 *
 *   const c = closeUp('cu-clock', '/art/closeups/opal-clock.jpg')
 *   c.pin([500, 250], 'Meet here', () => …)        a glowing ring with a 1 to 3 word name
 *   c.plate([40, 500], '24-karat gold')            a brass plate fixed on the picture
 *   c.dive('/art/closeups/liberty-torch.jpg', [640, 80])   zoom into a spot and land on a second painting
 */
export interface CloseUp {
  m: Moment
  /** the layer on top (the first painting, or the one you zoomed into) */
  layer: HTMLElement
  pin(at: [number, number], name: string, act: () => void, cls?: string): HTMLButtonElement
  plate(at: [number, number], html: string, cls?: string): HTMLElement
  /** zoom into `from` on the current painting and land on `art`; returns the new layer (Back steps out again) */
  dive(art: string, from: [number, number]): HTMLElement
}

export function closeUp(cls: string, art: string): CloseUp {
  const m = openMoment('cu ' + cls)
  const mk = (src: string) => {
    const l = el('div', 'cu-layer', `<img class="cu-art" src="${src}" alt="" draggable="false">`)
    m.root.append(l)
    return l
  }
  const stack: HTMLElement[] = [mk(art)]
  // the camera moving in
  sfx.whoosh()
  const x = closeX(m)
  x.classList.add('cu-x')
  m.root.append(x)
  const back = el('button', 'cu-back', '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4 L6 10 L12 16" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>') as HTMLButtonElement
  back.setAttribute('aria-label', 'Back')
  back.hidden = true
  m.root.append(back)
  const stepOut = () => {
    if (stack.length < 2) return false
    const top = stack.pop()!
    const under = stack[stack.length - 1]
    top.classList.add('leaving')
    paper.flip()
    under.style.transform = ''
    under.classList.remove('under')
    setTimeout(() => top.remove(), 420)
    back.hidden = stack.length < 2
    c.layer = under
    return true
  }
  back.onclick = () => (sfx.click(), void stepOut())
  // Escape steps out of a zoom before it closes the close-up
  m.onKey((e) => (e.key === 'Backspace' ? stepOut() : false))
  const c: CloseUp = {
    m,
    layer: stack[0],
    pin(at, name, act, pcls = '') {
      const b = el('button', 'cu-pin ' + pcls, `<i></i><span>${name}</span>`) as HTMLButtonElement
      b.style.left = `${at[0]}px`
      b.style.top = `${at[1]}px`
      b.onclick = () => (sfx.click(), act())
      c.layer.append(b)
      return b
    },
    plate(at, html, pcls = '') {
      const p = el('div', 'cu-plate ' + pcls, html)
      p.style.left = `${at[0]}px`
      p.style.top = `${at[1]}px`
      c.layer.append(p)
      return p
    },
    dive(src, from) {
      const under = c.layer
      sfx.whoosh()
      under.style.transformOrigin = `${from[0]}px ${from[1]}px`
      under.style.transform = 'scale(2.6)'
      under.classList.add('under')
      const l = mk(src)
      l.classList.add('arriving')
      l.style.transformOrigin = `${from[0]}px ${from[1]}px`
      stack.push(l)
      c.layer = l
      back.hidden = false
      m.root.append(x, back)
      return l
    },
  }
  return c
}
