/**
 * NYCgram: funny photo-sharing app on the in-game phone.
 * Gallery (private) + friends feed with pizza likes and a doom-scroll stop card.
 */
import './nycgram.css'
import { sfx } from '../../audio'
import { el } from '../../engine/stage'
import { openOverlay, closeOverlay, closeButton, toast, ui } from '../../engine/ui'
import { headPortrait } from '../../avatar/render'
import { link } from '../../net/link'
import { rest, HttpError, type PublicUser } from '../../net/server'
import { compressForNycgram } from './compress'
import { world, walkTo } from '../../engine/world'
import { ROOMS } from '../../data/rooms'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const when = (at: number) => {
  const m = Math.max(0, Math.round((Date.now() - at) / 60_000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}
const roomName = (id: string) => ROOMS[id]?.name ?? id.replace(/-/g, ' ')

export interface GalleryPhoto {
  id: number
  image: string
  room: string
  kind: string
  at: number
}

export interface NycPost {
  id: number
  image: string
  room: string
  caption: string
  at: number
  likes: number
  liked: boolean
  mine: boolean
  by: PublicUser
}

const FEED_STOP = 8

/** Save a canvas/image to the player's private phone gallery (online). */
export async function saveToGallery(
  src: HTMLCanvasElement | HTMLImageElement | string,
  room: string,
  kind: 'selfie' | 'booth' = 'selfie',
): Promise<{ id: number } | null> {
  if (!link.account) {
    toast('Gallery needs online play', '📷')
    return null
  }
  try {
    const image = await compressForNycgram(src)
    const res = await rest<{ ok: boolean; id: number }>('/nycgram/gallery', {
      method: 'POST',
      json: { image, room, kind },
      timeout: 15000,
    })
    toast('Saved to Gallery 📷', '📷')
    return { id: res.id }
  } catch (e) {
    const err = e instanceof HttpError ? e.reason : 'error'
    if (err === 'too-soon') toast('Easy — one photo at a time', '📷')
    else toast('Couldn’t save to Gallery. Try again?', '📷')
    return null
  }
}

/** Post a gallery photo (or a fresh compressed image) to NYCgram. Caption is server-generated. */
export async function postToNycgram(opts: {
  galleryId?: number
  image?: string
  room?: string
  kind?: 'selfie' | 'booth'
}): Promise<{ id: number; caption: string } | null> {
  if (!link.account) {
    toast('NYCgram needs online play', '🍕')
    return null
  }
  try {
    const res = await rest<{ ok: boolean; id: number; caption: string }>('/nycgram/posts', {
      method: 'POST',
      json: opts,
      timeout: 15000,
    })
    toast(`Posted to NYCgram! “${res.caption}”`, '🍕')
    return { id: res.id, caption: res.caption }
  } catch (e) {
    const err = e instanceof HttpError ? e.reason : 'error'
    if (err === 'too-soon') toast('Give it a minute before the next post', '🍕')
    else if (err === 'not-found') toast('That photo isn’t in your Gallery anymore', '🍕')
    else toast('Couldn’t post. Try again?', '🍕')
    return null
  }
}

/** After a selfie/booth shot: save + optional post helpers from a canvas. */
export async function shareShot(
  canvas: HTMLCanvasElement,
  room: string,
  kind: 'selfie' | 'booth',
  mode: 'gallery' | 'post' | 'both',
) {
  if (mode === 'gallery' || mode === 'both') {
    const g = await saveToGallery(canvas, room, kind)
    if (mode === 'gallery') return g
    if (!g) return null
    return postToNycgram({ galleryId: g.id })
  }
  const image = await compressForNycgram(canvas)
  return postToNycgram({ image, room, kind })
}

type Tab = 'feed' | 'gallery'

/** Open the NYCgram phone app (feed + gallery). */
export async function openNycgram(tab: Tab = 'feed') {
  sfx.pop()
  const p = el('div', 'panel nycgram')
  p.append(closeButton())
  p.insertAdjacentHTML(
    'afterbegin',
    `<div class="nyc-head">
      <img src="/art/icons/nycgram-header.png.webp" alt="NYCgram" width="72" height="72" onerror="this.src='/art/icons/nycgram-header.png'">
      <div><h2>NYCgram</h2><p>Photos from you and your friends. Pizza likes only.</p></div>
    </div>
    <div class="nyc-tabs" role="tablist">
      <button type="button" data-tab="feed" class="${tab === 'feed' ? 'on' : ''}">Feed</button>
      <button type="button" data-tab="gallery" class="${tab === 'gallery' ? 'on' : ''}">Gallery</button>
    </div>
    <div class="nyc-body"></div>`,
  )
  openOverlay(p)
  const body = p.querySelector('.nyc-body') as HTMLElement
  const tabs = p.querySelectorAll<HTMLButtonElement>('.nyc-tabs button')
  let cur: Tab = tab

  const show = async (t: Tab) => {
    cur = t
    tabs.forEach((b) => b.classList.toggle('on', b.dataset.tab === t))
    body.innerHTML = '<div class="nyc-empty"><span>Loading…</span></div>'
    if (!link.account) {
      body.innerHTML =
        '<div class="nyc-empty"><b>Online Only</b><span>Sign in from the front door to use NYCgram and your Gallery.</span></div>'
      return
    }
    if (t === 'feed') await renderFeed(body)
    else await renderGallery(body, () => void show('feed'))
  }

  tabs.forEach((b) => {
    b.onclick = () => {
      sfx.click()
      void show((b.dataset.tab as Tab) || 'feed')
    }
  })
  await show(cur)
}

async function renderFeed(body: HTMLElement) {
  let posts: NycPost[] = []
  try {
    posts = (await rest<{ posts: NycPost[] }>('/nycgram/feed')).posts
  } catch {
    body.innerHTML = '<div class="nyc-empty"><b>Can’t Reach NYCgram</b><span>Try again in a moment.</span></div>'
    return
  }
  if (!body.isConnected) return
  if (!posts.length) {
    body.innerHTML = `<div class="nyc-empty"><b>Nothing Yet</b><span>Take a selfie or visit a photo booth, save it to your Gallery, then post it here. Friends’ posts show up too.</span></div>`
    const go = el('button', 'btn go', 'Open Gallery')
    go.onclick = () => {
      sfx.click()
      closeOverlay()
      void openNycgram('gallery')
    }
    body.querySelector('.nyc-empty')!.append(go)
    return
  }

  const feed = el('div', 'nyc-feed')
  const shown = posts.slice(0, FEED_STOP)
  for (const post of shown) feed.append(postCard(post))
  // doom-scroll stop: after ~8 posts (or whenever you've hit the end of a short feed)
  const end = el('div', 'nyc-end')
  end.innerHTML = `<b>You’ve seen it all.</b><span>Go outside. The game’s outside. Stop doom scrolling.</span>`
  const out = el('button', 'btn go', 'Close Phone & Go Outside')
  out.onclick = () => {
    sfx.pop()
    closeOverlay()
    if (!ui.busy && world.player) {
      const [x, y] = world.player.pos
      walkTo([x + (Math.random() > 0.5 ? 80 : -80), y + 20])
    }
  }
  end.append(out)
  feed.append(end)
  body.innerHTML = ''
  body.append(feed)
}

function postCard(post: NycPost): HTMLElement {
  const card = el('div', 'nyc-post')
  const face = post.by.look ? headPortrait(post.by.look) : ''
  card.innerHTML = `<div class="nyc-post-who"><span class="nyc-face">${face}</span><b translate="no">${esc(post.by.name)}</b><small>${when(post.at)}</small></div>
    <img class="nyc-shot" alt="" src="${post.image}">
    <div class="nyc-post-cap"><b translate="no">${esc(post.by.name)}</b> ${esc(post.caption)}</div>
    <div class="nyc-post-acts"></div>`
  const acts = card.querySelector('.nyc-post-acts')!
  const like = el('button', 'nyc-like' + (post.liked ? ' on' : ''), '') as HTMLButtonElement
  like.innerHTML = `<img src="/art/icons/e/pizza.png" alt=""> <span>${post.likes}</span>`
  like.disabled = post.mine
  like.title = post.mine ? 'Your post' : post.liked ? 'Liked' : 'Give a pizza'
  like.onclick = async () => {
    if (post.mine) return
    sfx.click()
    like.disabled = true
    try {
      if (post.liked) {
        const r = await rest<{ likes: number; liked: boolean }>(`/nycgram/posts/${post.id}/like`, { method: 'DELETE' })
        post.liked = r.liked
        post.likes = r.likes
      } else {
        const r = await rest<{ likes: number; liked: boolean }>(`/nycgram/posts/${post.id}/like`, { method: 'POST', json: {} })
        post.liked = r.liked
        post.likes = r.likes
        sfx.pop()
      }
      like.classList.toggle('on', post.liked)
      like.querySelector('span')!.textContent = String(post.likes)
    } catch {
      toast('Couldn’t pizza that post', '🍕')
    } finally {
      like.disabled = post.mine
    }
  }
  acts.append(like)
  const where = el('small', '', roomName(post.room))
  where.style.marginLeft = 'auto'
  where.style.opacity = '0.55'
  acts.append(where)
  return card
}

async function renderGallery(body: HTMLElement, onPosted: () => void) {
  let photos: GalleryPhoto[] = []
  try {
    photos = (await rest<{ photos: GalleryPhoto[] }>('/nycgram/gallery')).photos
  } catch {
    body.innerHTML = '<div class="nyc-empty"><b>Can’t Reach Gallery</b><span>Try again in a moment.</span></div>'
    return
  }
  if (!body.isConnected) return
  if (!photos.length) {
    body.innerHTML =
      '<div class="nyc-empty"><b>Empty Gallery</b><span>Take a selfie (phone menu or K at a landmark) or visit a photo booth, then hit Save to Gallery.</span></div>'
    return
  }
  const wrap = el('div', 'nyc-gallery')
  const grid = el('div', 'nyc-grid')
  for (const ph of photos) {
    const b = el('button', 'nyc-thumb', `<img alt="" src="${ph.image}">`) as HTMLButtonElement
    b.onclick = () => {
      sfx.click()
      openPhotoDetail(ph, onPosted)
    }
    grid.append(b)
  }
  wrap.append(grid)
  body.innerHTML = ''
  body.append(wrap)
}

function openPhotoDetail(ph: GalleryPhoto, onPosted: () => void) {
  const p = el('div', 'panel nycgram')
  p.append(closeButton())
  const box = el('div', 'nyc-detail')
  box.innerHTML = `<img alt="" src="${ph.image}"><p class="muted">${esc(roomName(ph.room))} · ${when(ph.at)}</p>`
  const acts = el('div', 'nyc-acts')
  const post = el('button', 'btn go', '🍕 Post to NYCgram')
  post.onclick = async () => {
    sfx.click()
    post.disabled = true
    const r = await postToNycgram({ galleryId: ph.id })
    if (r) {
      closeOverlay()
      onPosted()
      void openNycgram('feed')
    } else post.disabled = false
  }
  const del = el('button', 'btn ghost', 'Delete')
  del.onclick = async () => {
    sfx.click()
    try {
      await rest(`/nycgram/gallery/${ph.id}`, { method: 'DELETE' })
      toast('Removed from Gallery', '📷')
      closeOverlay()
      void openNycgram('gallery')
    } catch {
      toast('Couldn’t delete that one', '📷')
    }
  }
  acts.append(post, del)
  box.append(acts)
  p.append(box)
  openOverlay(p)
}
