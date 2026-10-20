/**
 * The landing page's moving pictures.
 *  - The hero's gameplay loop (video[data-hero-video]) is silent and small. It starts after the page has loaded, so
 *    the page itself stays fast, and pauses while it's off screen. People who prefer less motion, or who asked their
 *    browser to save data, keep the still poster instead.
 *  - It runs longer than 5 seconds, so it has a pause button ([data-video-toggle], WCAG 2.2.2). A pause sticks: the
 *    loop doesn't start again by itself when you scroll back.
 *  - "Watch the trailer" ([data-trailer]) opens the 45-second trailer, sound on, in a dialog.
 */
export function heroVideos() {
  const videos = [...document.querySelectorAll<HTMLVideoElement>('video[data-hero-video]')]
  if (!videos.length) return
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || saveData) return
  const paused = new WeakSet<HTMLVideoElement>()
  const watch = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement
        if (e.isIntersecting && !paused.has(v)) void v.play().catch(() => {})
        else if (!e.isIntersecting) v.pause()
      }
    },
    { threshold: 0.2 },
  )
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-video-toggle]')) {
    const v = b.parentElement?.querySelector<HTMLVideoElement>('video[data-hero-video]')
    if (!v) continue
    b.hidden = false
    b.addEventListener('click', () => {
      const stop = !paused.has(v)
      if (stop) {
        paused.add(v)
        v.pause()
      } else {
        paused.delete(v)
        void v.play().catch(() => {})
      }
      b.classList.toggle('paused', stop)
      b.setAttribute('aria-label', stop ? 'Play the gameplay video' : 'Pause the gameplay video')
    })
  }
  const start = () =>
    videos.forEach((v) => {
      v.preload = 'auto'
      watch.observe(v)
    })
  if (document.readyState === 'complete') start()
  else addEventListener('load', start, { once: true })
}

export function trailerDialog(onOpen?: (from: string) => void) {
  const dialog = document.querySelector<HTMLDialogElement>('dialog.trailer')
  const video = dialog?.querySelector('video')
  if (!dialog || !video) return
  for (const b of document.querySelectorAll<HTMLElement>('[data-trailer]'))
    b.addEventListener('click', (e) => {
      e.preventDefault()
      dialog.showModal()
      video.currentTime = 0
      void video.play().catch(() => {})
      onOpen?.(b.dataset.trailer || 'button')
    })
  dialog.querySelector('.trailer-x')?.addEventListener('click', () => dialog.close())
  // a click on the dimmed page around the video closes it too
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close()
  })
  dialog.addEventListener('close', () => video.pause())
}
