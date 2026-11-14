/** Shrink a canvas/image to a JPEG data URL small enough for the NYCgram API (≤ ~80KB). */

const MAX_W = 480
const QUALITIES = [0.7, 0.58, 0.48, 0.38]

function drawScaled(src: HTMLCanvasElement | HTMLImageElement, maxW: number): HTMLCanvasElement {
  const sw = 'width' in src && typeof (src as HTMLCanvasElement).getContext === 'function'
    ? (src as HTMLCanvasElement).width
    : (src as HTMLImageElement).naturalWidth || (src as HTMLImageElement).width
  const sh = 'height' in src && typeof (src as HTMLCanvasElement).getContext === 'function'
    ? (src as HTMLCanvasElement).height
    : (src as HTMLImageElement).naturalHeight || (src as HTMLImageElement).height
  const scale = Math.min(1, maxW / Math.max(1, sw))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(sw * scale))
  c.height = Math.max(1, Math.round(sh * scale))
  const x = c.getContext('2d')!
  x.fillStyle = '#fff'
  x.fillRect(0, 0, c.width, c.height)
  x.drawImage(src, 0, 0, c.width, c.height)
  return c
}

/** Compress to `data:image/jpeg;base64,…` under maxChars (default 78_000). */
export async function compressForNycgram(
  src: HTMLCanvasElement | HTMLImageElement | string,
  maxChars = 78_000,
): Promise<string> {
  let img: HTMLCanvasElement | HTMLImageElement
  if (typeof src === 'string') {
    img = await loadImg(src)
  } else {
    img = src
  }
  let canvas = drawScaled(img, MAX_W)
  for (const q of QUALITIES) {
    const url = canvas.toDataURL('image/jpeg', q)
    if (url.length <= maxChars) return url
  }
  // last resort: shrink further
  canvas = drawScaled(canvas, 320)
  for (const q of QUALITIES) {
    const url = canvas.toDataURL('image/jpeg', q)
    if (url.length <= maxChars) return url
  }
  return canvas.toDataURL('image/jpeg', 0.28)
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('image-load'))
    i.src = src
  })
}
