/**
 * NYCgram: shared gallery/post API. The UI lives inside iFruit (features/ifruit/apps/nycgram).
 */
import { sfx } from '../../audio'
import { toast } from '../../engine/ui'
import { link } from '../../net/link'
import { rest, HttpError, type PublicUser } from '../../net/server'
import { compressForNycgram } from './compress'

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

/** Open NYCgram inside the iFruit phone (home-grid app). Keeps the old entry point working. */
export async function openNycgram(tab: Tab = 'feed') {
  sfx.pop()
  const { openApp } = await import('../ifruit/phone')
  await openApp('nycgram', tab === 'gallery' ? 'gallery' : undefined)
}
