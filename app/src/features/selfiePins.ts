import './selfiePins.css'
import { sfx } from '../audio'
import { el } from '../engine/stage'
import { onRoom } from '../engine/world'
import { SELFIE_SPOTS } from '../data/selfieSpots'

/**
 * A small camera by each famous landmark: click it for a selfie with the thing behind you (features/moments/selfie.ts).
 * The same as the phone menu's Selfie entry and the K key, just where your eyes already are.
 */
for (const [room, spot] of Object.entries(SELFIE_SPOTS)) {
  onRoom(room, ({ scene }) => {
    const [x, y, w] = spot.box
    const b = el('button', 'selfie-pin', '<img src="/art/icons/e/camera.png" alt="" draggable="false">')
    b.setAttribute('aria-label', `Take a selfie at ${spot.title}`)
    b.title = 'Selfie'
    // right over the landmark's top, so it's plainly that thing's photo
    b.style.cssText = `left:${x + w / 2}px;top:${Math.max(24, y - 8)}px`
    b.onpointerdown = (e) => e.stopPropagation()
    b.onclick = (e) => {
      e.stopPropagation()
      sfx.click()
      // the same camera as everywhere else: your iFruit, already framed on the landmark (Selfie is one tap away)
      void import('./ifruit/phone').then((m) => m.openApp('camera', 'spot'))
    }
    scene.append(b)
  })
}
