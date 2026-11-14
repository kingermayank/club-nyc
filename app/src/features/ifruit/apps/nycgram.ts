/**
 * NYCgram inside iFruit: friends photo feed + private gallery, pizza likes, doom-scroll stop.
 * Opens as a real phone app (home grid icon); not a floating modal.
 */
import { el } from '../../../engine/stage'
import { toast } from '../../../engine/ui'
import { link } from '../../../net/link'
import { rest } from '../../../net/server'
import { ROOMS } from '../../../data/rooms'
import { world, walkTo } from '../../../engine/world'
import { screenEl, act, empty, face, esc, shimmer } from '../kit'
import { isOnline } from '../store'
import { tone } from '../sound'
import type { Ctx, Screen } from '../phone'
import { compressForNycgram } from '../../nycgram/compress'
import { saveToGallery, postToNycgram, type GalleryPhoto, type NycPost } from '../../nycgram'

const FEED_STOP = 8
const when = (at: number) => {
  const m = Math.max(0, Math.round((Date.now() - at) / 60_000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}
const roomName = (id: string) => ROOMS[id]?.name ?? id.replace(/-/g, ' ')

export function open(ctx: Ctx, arg?: string): Screen {
  const s = screenEl(ctx, 'NYCgram', { back: false, big: true, cls: 'ify' })
  const tabs = el('div', 'ifp-tabs', '<button class="on" data-t="feed" type="button">Feed</button><button data-t="gallery" type="button">Gallery</button>')
  const body = el('div', 'ify-body', shimmer(4))
  s.body.append(tabs, body)
  let tab: 'feed' | 'gallery' = arg === 'gallery' ? 'gallery' : 'feed'

  const setTab = (t: 'feed' | 'gallery') => {
    tab = t
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.t === t))
    void render()
  }
  tabs.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.onclick = () => {
      tone('tap')
      setTab((b.dataset.t as 'feed' | 'gallery') || 'feed')
    }
  })

  const render = async () => {
    if (!isOnline()) {
      body.innerHTML = ''
      body.append(empty('/art/ifruit/app/nycgram.png', 'Online Only', 'Sign in to use NYCgram.'))
      return
    }
    body.innerHTML = shimmer(4)
    if (tab === 'feed') await renderFeed(ctx, body, () => setTab('gallery'))
    else await renderGallery(ctx, body, () => setTab('feed'))
  }

  void render()
  return { el: s.el, onShow: () => void render() }
}

async function renderFeed(_ctx: Ctx, body: HTMLElement, toGallery: () => void) {
  let posts: NycPost[] = []
  try {
    posts = (await rest<{ posts: NycPost[] }>('/nycgram/feed')).posts
  } catch {
    body.innerHTML = ''
    body.append(empty('/art/ifruit/app/nycgram.png', 'Can’t Reach NYCgram', 'Try again in a moment.'))
    return
  }
  if (!body.isConnected) return
  body.innerHTML = ''
  if (!posts.length) {
    body.append(
      empty(
        '/art/ifruit/app/nycgram.png',
        'Nothing Yet',
        'Take a selfie or open Photos, then post here.',
        act('Open Gallery', toGallery, 'blue'),
      ),
    )
    return
  }
  const feed = el('div', 'ify-feed')
  for (const post of posts.slice(0, FEED_STOP)) feed.append(postCard(post))
  const end = el('div', 'ify-end')
  end.innerHTML = `<b>You’ve seen it all.</b><span>Go outside. The game’s outside. Stop doom scrolling.</span>`
  const out = act('Close Phone & Go Outside', () => {
    void import('../phone').then((m) => m.closePhone())
    if (world.player) {
      const [x, y] = world.player.pos
      walkTo([x + (Math.random() > 0.5 ? 80 : -80), y + 20])
    }
  }, 'blue')
  end.append(out)
  feed.append(end)
  body.append(feed)
}

function postCard(post: NycPost): HTMLElement {
  const card = el('div', 'ify-post')
  card.innerHTML = `<div class="ify-who">${face(post.by.look, false)}<b translate="no">${esc(post.by.name)}</b><small>${when(post.at)}</small></div>
    <img class="ify-shot" alt="" src="${post.image}" loading="lazy">
    <div class="ify-cap"><b translate="no">${esc(post.by.name)}</b> ${esc(post.caption)}</div>
    <div class="ify-acts"></div>`
  const acts = card.querySelector('.ify-acts')!
  const like = el('button', 'ify-like' + (post.liked ? ' on' : ''), `<img src="/art/icons/e/pizza.png" alt=""> <span>${post.likes}</span>`) as HTMLButtonElement
  like.type = 'button'
  like.disabled = post.mine
  like.title = post.mine ? 'Your post' : post.liked ? 'Liked' : 'Give a pizza'
  like.onclick = async () => {
    if (post.mine) return
    tone('tap')
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
        tone('coin')
      }
      like.classList.toggle('on', post.liked)
      like.querySelector('span')!.textContent = String(post.likes)
    } catch {
      toast('Couldn’t pizza that post', '🍕')
    } finally {
      like.disabled = post.mine
    }
  }
  acts.append(like, el('small', 'ify-where', roomName(post.room)))
  return card
}

async function renderGallery(ctx: Ctx, body: HTMLElement, toFeed: () => void) {
  let photos: GalleryPhoto[] = []
  try {
    photos = (await rest<{ photos: GalleryPhoto[] }>('/nycgram/gallery')).photos
  } catch {
    body.innerHTML = ''
    body.append(empty('/art/ifruit/app/photos.png', 'Can’t Reach Gallery', 'Try again in a moment.'))
    return
  }
  if (!body.isConnected) return
  body.innerHTML = ''
  if (!photos.length) {
    body.append(
      empty(
        '/art/ifruit/app/camera.png',
        'Empty Gallery',
        'Snap a selfie or use Camera, then post.',
        act('Open Camera', () => ctx.open('camera'), 'blue'),
      ),
    )
    return
  }
  const grid = el('div', 'ify-grid')
  photos.forEach((ph, i) => {
    const b = el('button', 'ify-thumb', `<img alt="" src="${ph.image}" loading="lazy">`) as HTMLButtonElement
    b.type = 'button'
    b.style.animationDelay = `${Math.min(i, 12) * 25}ms`
    b.onclick = () => {
      tone('tap')
      ctx.push(photoDetail(ctx, ph, toFeed))
    }
    grid.append(b)
  })
  body.append(grid)
}

function photoDetail(ctx: Ctx, ph: GalleryPhoto, toFeed: () => void): Screen {
  const s = screenEl(ctx, roomName(ph.room), { cls: 'ify-detail' })
  const img = document.createElement('img')
  img.className = 'ify-detail-img'
  img.src = ph.image
  img.alt = ''
  const meta = el('div', 'ify-cap', `<span>${when(ph.at)}</span>`)
  const bar = el('div', 'ifr-actions')
  const postBtn = act('🍕 Post', async () => {
    postBtn.disabled = true
    const r = await postToNycgram({ galleryId: ph.id })
    if (r) {
      ctx.banner(`Posted: ${r.caption}`)
      ctx.pop()
      toFeed()
    } else postBtn.disabled = false
  }, 'blue')
  const delBtn = act('Delete', async () => {
    try {
      await rest(`/nycgram/gallery/${ph.id}`, { method: 'DELETE' })
      ctx.banner('Removed from Gallery')
      ctx.pop()
    } catch {
      toast('Couldn’t delete that one', '📷')
    }
  })
  bar.append(postBtn, delBtn)
  s.body.append(img, meta, bar)
  return { el: s.el }
}

/** Post a real photo JPEG (from Camera / Photos / selfie) to NYCgram — the actual pixels, not a placeholder. */
export async function postJpeg(jpeg: string, room: string, kind: 'selfie' | 'booth' | 'camera' = 'selfie') {
  if (!link.account) {
    toast('NYCgram needs online play', '🍕')
    return null
  }
  const image = await compressForNycgram(jpeg)
  // keep a gallery copy when we can; if rate-limited, still post the image
  const g = await saveToGallery(image, room, kind === 'booth' ? 'booth' : 'selfie')
  if (g) return postToNycgram({ galleryId: g.id })
  return postToNycgram({ image, room, kind: kind === 'booth' ? 'booth' : 'selfie' })
}
