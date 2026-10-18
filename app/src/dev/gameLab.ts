import { GAMES } from '../games/registry'
import { sfx } from '../audio'
import { AvatarView } from '../avatar/render'
import { randomLook } from '../avatar/random'
import type { MiniGameContext } from '../games/types'

/** ?game=<id> — run one mini-game on its own (for development). */
export async function gameLab(root: HTMLElement, id: string) {
  const entry = GAMES[id]
  root.innerHTML = '<div class="viewport"><div class="stage" id="lab-stage"></div></div>'
  const stage = root.querySelector<HTMLElement>('#lab-stage')!
  let scale = 1
  const fit = () => {
    scale = Math.min(innerWidth / 1000, innerHeight / 565)
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`
  }
  addEventListener('resize', fit)
  fit()
  if (!entry) {
    stage.innerHTML = `<p style="padding:20px">Unknown game "${id}". Known: ${Object.keys(GAMES).join(', ')}</p>`
    return
  }
  const game = (await entry.load()).default
  const exits: (() => void)[] = []
  const gameRoot = document.createElement('div')
  gameRoot.style.cssText = 'position:absolute;inset:0;overflow:hidden'
  stage.append(gameRoot)
  const ctx: MiniGameContext = {
    root: gameRoot,
    sfx,
    look: randomLook(0.8),
    avatar: (look, unit) => new AvatarView(look ?? randomLook(0.8), unit),
    randomLook: () => randomLook(0.8),
    end: (r) => {
      exits.forEach((f) => f())
      console.log('[gameLab] end', r)
      const card = document.createElement('div')
      card.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.5);color:#fff;font:28px sans-serif;z-index:99'
      card.innerHTML = `<div>Game over: ${r.coins} coins<br><small>${(r.lines ?? []).join(' · ')}</small><br><button onclick="location.reload()">Again</button></div>`
      stage.append(card)
    },
    onExit: (cb) => exits.push(cb),
    toLocal: (e) => {
      const b = gameRoot.getBoundingClientRect()
      return { x: (e.clientX - b.left) / scale, y: (e.clientY - b.top) / scale }
    },
  }
  game.start(ctx)
}
