/** Photos: everything the Camera took (and selfies, and photos friends sent), grouped by place and day. */
import { el } from '../../../engine/stage'
import { save } from '../../../state'
import { link } from '../../../net/link'
import { screenEl, act, empty, sheet, face, esc } from '../kit'
import { allPhotos, deletePhoto, on, ifr, store, emit, kvSet, type Photo } from '../store'
import { polaroid } from '../photo'
import type { Ctx, Screen } from '../phone'
import { tone } from '../sound'

const dayLabel = (t: number) => {
  const d = new Date(t)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

export function open(ctx: Ctx, arg?: string): Screen {
  const s = screenEl(ctx, 'Photos', { back: false, big: true })
  const grid = el('div', 'ifg')
  grid.innerHTML = Array.from({ length: 9 }, () => '<i class="ifg-tile ifr-shimmer"></i>').join('')
  s.body.append(grid)
  let photos: Photo[] = []
  const render = async (first = false) => {
    photos = await allPhotos()
    grid.innerHTML = ''
    if (!photos.length) {
      grid.append(empty('/art/ifruit/app/photos.png', 'No Photos Yet', 'Snap the city with the Camera.', act('Open Camera', () => ctx.open('camera'), 'blue')))
      return
    }
    let lastKey = ''
    photos.forEach((p, i) => {
      const key = `${dayLabel(p.at)}|${p.title}`
      if (key !== lastKey) {
        grid.append(el('div', 'ifg-sec', `<b>${esc(p.title)}</b><span>${dayLabel(p.at)}</span>`))
        lastKey = key
      }
      const b = el('button', 'ifg-tile', `<img src="${p.jpeg}" alt="${esc(p.title)}" loading="lazy">${p.kind === 'received' ? '<i class="ifg-badge">💬</i>' : p.kind === 'selfie' ? '<i class="ifg-badge">🤳</i>' : ''}`)
      b.type = 'button'
      b.style.animationDelay = first ? `${Math.min(i, 12) * 30}ms` : '0ms'
      b.onclick = () => ctx.push(viewer(ctx, photos, i, b))
      grid.append(b)
    })
  }
  const off = on('photos', () => void render())
  void render(true).then(() => {
    if (!arg) return
    const i = photos.findIndex((p) => p.id === arg)
    if (i >= 0) ctx.push(viewer(ctx, photos, i))
  })
  return { el: s.el, dispose: off }
}

function viewer(ctx: Ctx, photos: Photo[], start: number, from?: HTMLElement): Screen {
  let i = start
  const s = screenEl(ctx, '', { cls: 'ifg-view' })
  const stage = el('div', 'ifg-stage')
  const img = document.createElement('img')
  img.alt = ''
  const prev = el('button', 'ifg-nav l', '‹')
  const next = el('button', 'ifg-nav r', '›')
  prev.setAttribute('aria-label', 'Previous photo')
  next.setAttribute('aria-label', 'Next photo')
  const cap = el('div', 'ifg-cap')
  stage.append(img, prev, next)
  const bar = el('div', 'ifr-actions ifg-bar')
  s.body.append(stage, cap, bar)

  const show = (dir = 0) => {
    const p = photos[i]
    if (!p) return ctx.pop()
    img.src = p.jpeg
    s.title.textContent = p.title
    cap.innerHTML = `<b>${esc(p.title)}</b><span>${new Date(p.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}${p.from ? `, from ${esc(p.from)}` : ''}</span>`
    prev.hidden = i <= 0
    next.hidden = i >= photos.length - 1
    if (dir) img.animate([{ transform: `translateX(${dir * 40}px)`, opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(0.2, 1, 0.3, 1)' })
  }
  prev.onclick = () => i > 0 && ((i--), tone('tap'), show(-1))
  next.onclick = () => i < photos.length - 1 && ((i++), tone('tap'), show(1))
  // swipe between photos
  let sx = 0
  stage.addEventListener('pointerdown', (e) => (sx = e.clientX))
  stage.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx
    if (dx > 40) prev.click()
    else if (dx < -40) next.click()
  })
  stage.tabIndex = 0
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') prev.click()
    if (e.key === 'ArrowRight') next.click()
  })

  const btn = (icon: string, label: string, f: (b: HTMLButtonElement) => void) => {
    const b = el('button', '', `<img src="${icon}" alt="">${label}`) as HTMLButtonElement
    b.type = 'button'
    b.onclick = () => (tone('tap'), f(b))
    bar.append(b)
    return b
  }
  btn('/art/ifruit/app/messages.png', 'Send', () => void sendTo(ctx, photos[i]))
  btn('/art/ifruit/app/nycgram.png', 'NYCgram', async (b) => {
    const p = photos[i]
    if (!p?.jpeg) return
    b.disabled = true
    const { postJpeg } = await import('./nycgram')
    const r = await postJpeg(p.jpeg, p.room, p.kind === 'selfie' ? 'selfie' : 'camera')
    b.disabled = false
    if (r) {
      ctx.banner(`Posted: ${r.caption}`)
      ctx.open('nycgram')
    }
  })
  btn('/art/icons/e/sunset-city.png', 'Wallpaper', async () => {
    await kvSet('wallpaper', photos[i].jpeg)
    ifr().wallpaper = 'photo'
    store()
    emit('wallpaper')
    ctx.banner('Wallpaper set')
  })
  btn('/art/ifruit/app/photos.png', 'Save', async () => {
    const p = photos[i]
    const url = await polaroid(p.jpeg, p.title, p.at, link.account && save.name ? `${location.host}/join/${save.name}` : 'CLUB NYC')
    const a = document.createElement('a')
    a.href = url
    a.download = `club-nyc-${p.room}-${p.at}.png`
    a.click()
  })
  btn('/art/icons/e/trash.png', 'Delete', async (b) => {
    if (b.dataset.sure !== '1') {
      b.dataset.sure = '1'
      b.classList.add('ifg-sure')
      b.lastChild!.textContent = 'Delete?'
      setTimeout(() => {
        b.dataset.sure = ''
        b.classList.remove('ifg-sure')
        b.lastChild!.textContent = 'Delete'
      }, 3000)
      return
    }
    const p = photos[i]
    await img.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(0.6) rotate(-8deg)', opacity: 0 }], { duration: 260, easing: 'ease-in' }).finished
    await deletePhoto(p.id)
    photos.splice(i, 1)
    i = Math.min(i, photos.length - 1)
    b.dataset.sure = ''
    b.classList.remove('ifg-sure')
    b.lastChild!.textContent = 'Delete'
    show()
  })
  show()
  if (from && !matchMedia('(prefers-reduced-motion: reduce)').matches) img.animate([{ transform: 'scale(0.4)', opacity: 0.2 }, { transform: 'scale(1)', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(0.2, 1.1, 0.3, 1)' })
  return { el: s.el }
}

/** send a photo: pick a chat */
async function sendTo(ctx: Ctx, p: Photo) {
  if (!p.recipe) return ctx.banner('This one can’t be sent.')
  const sh = sheet(ctx, '<div class="ifr-sec">Send to</div>')
  const list = el('div', 'ifg-sendlist')
  sh.el.append(list)
  const { people } = await import('../kit')
  const { threadWith, send } = await import('../net')
  const { friends } = await people()
  if (!friends.length) return list.append(empty('', 'No Friends Yet', 'Add friends in the city first.'))
  for (const f of friends.slice(0, 12)) {
    const row = el('button', 'ifr-row', `${face(f.look, f.online)}<span class="ifr-txt"><b>${esc(f.name)}</b><small>${f.local ? 'City local' : f.online ? 'Online' : 'Offline'}</small></span>`)
    row.onclick = async () => {
      sh.close()
      try {
        const th = await threadWith(f.id)
        await send(th, 'photo', '', p.recipe)
        tone('send')
        ctx.banner(`Sent to ${esc(f.name)}`)
      } catch {
        ctx.banner('Didn’t send. Try again.')
      }
    }
    list.append(row)
  }
}
