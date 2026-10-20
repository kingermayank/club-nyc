// Landing option F, "Bento city" (app/lab/bento.html, dev only).
//  - The big tile's loop and the trailer work like the live page's (media.ts).
//  - Every other tile's clip plays while you can see it and pauses when you can't (none for people who prefer less
//    motion: they keep the still).
//  - The Dance Jam tile counts down on the game's own clock (app/src/data/jam.ts).
import './bento.css'
import { heroVideos, trailerDialog } from '../src/landing/media'
import { jamState } from '../src/data/jam'

heroVideos()
trailerDialog()

const still = matchMedia('(prefers-reduced-motion: reduce)').matches
if (!still) {
  const watch = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement
        if (e.isIntersecting) {
          v.preload = 'auto'
          void v.play().catch(() => {})
        } else v.pause()
      }
    },
    { threshold: 0.35 },
  )
  document.querySelectorAll<HTMLVideoElement>('video[data-clip]').forEach((v) => watch.observe(v))
}

const count = document.querySelector<HTMLElement>('.jam-count')
const when = document.querySelector<HTMLElement>('.jam-when')
function tick() {
  if (!count || !when) return
  const j = jamState()
  const left = Math.max(0, Math.ceil(((j.on ? j.end : j.next) - Date.now()) / 1000))
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
  count.textContent = j.on ? 'On now!' : mmss
  when.textContent = j.on ? `${mmss} left in Times Square` : 'until the next one in Times Square'
}
tick()
setInterval(tick, 1000)

const header = document.querySelector('.bt-header')
const onScroll = () => header?.classList.toggle('scrolled', scrollY > 8)
addEventListener('scroll', onScroll, { passive: true })
onScroll()
