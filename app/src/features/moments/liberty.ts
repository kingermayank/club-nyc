import type { Game } from '../../types'
import { closeUp } from './closeup'
import { cu } from '../../sound/closeup'

/**
 * The Statue of Liberty, up close. The whole statue fills the stage; three rings (torch, crown, tablet) zoom into a
 * second painting of that part, where the one thing worth knowing is on a brass plate and the one thing worth doing
 * (climb to the crown, take the selfie) is a click. Replaces the statue's picture card and its two sub-cards.
 */
const ART = '/art/closeups/'

export function ladyLiberty(g: Game) {
  const c = closeUp('cu-liberty', ART + 'liberty.jpg')
  // the harbor: a gull, and the wind up by the torch
  c.m.later(() => g.sfx.gull(), 500)
  const selfie = c.plate([36, 500], 'Take a Selfie', 'go') as HTMLElement
  selfie.onclick = () => (c.m.close(), void import('./selfie').then((s) => s.libertySelfie(g)))
  c.pin([510, 40], 'Torch', () => {
    c.dive(ART + 'liberty-torch.jpg', [510, 40])
    cu.wind()
    c.plate([36, 478], '<b>24-karat gold</b>The flame, since 1986')
  })
  c.pin([592, 104], 'Crown', () => {
    c.dive(ART + 'liberty-crown.jpg', [592, 104])
    cu.wind()
    c.plate([36, 478], '<b>25 windows</b>Seven rays, seven seas')
    const climb = c.plate([36, 0], 'Climb 354 Steps', 'go') as HTMLElement
    climb.style.cssText = 'right:36px;bottom:36px;left:auto;top:auto'
    climb.onclick = () => void import('./crownClimb').then((s) => s.climbTheCrown(g))
  }, 'right')
  c.pin([590, 440], 'Pedestal', () => {
    c.dive(ART + 'liberty-pedestal.jpg', [590, 440])
    c.plate([36, 478], '<b>120,000 donors</b>Most gave under a dollar')
  }, 'right')
  c.pin([656, 204], 'Tablet', () => {
    c.dive(ART + 'liberty-tablet.jpg', [656, 204])
    c.plate([36, 478], '<b>July 4, 1776</b>The date she carries')
  }, 'right')
}
