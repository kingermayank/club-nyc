// Hero options (app/lab/hero.html, dev only): ?v=a shows option A on its own, and so on.
import './hero.css'
import { heroVideos, trailerDialog } from '../src/landing/media'

const v = new URLSearchParams(location.search).get('v')
if (v) {
  document.body.dataset.v = v
  for (const el of document.querySelectorAll<HTMLElement>('.hero-v, .lab-label')) el.hidden = el.dataset.v !== v
  if (v === 'b') document.body.classList.add('hero-light')
}
const header = document.querySelector('.site-header')
const onScroll = () => header?.classList.toggle('scrolled', scrollY > 8)
addEventListener('scroll', onScroll, { passive: true })
onScroll()
heroVideos()
trailerDialog()
