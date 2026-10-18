import type { C2S } from './protocol'

/**
 * The thin seam between the world and the network. It imports nothing from the engine, so the
 * world, actors and features can all report what the player does without import cycles — and
 * everything still works offline, where `send` is a no-op.
 */
export const link = {
  /** connected to the game server and in a room */
  online: false,
  /** signed in (cloud save, real friends, real leaderboards) — may be briefly disconnected */
  account: false,
  /** my user id */
  me: '',
  /** real friends' user ids */
  friends: new Set<string>(),
  send(_m: C2S) {},
}

let lookTimer = 0
let tagTimer = 0
/** Outfit changes come in bursts (clicking through the wardrobe) — send the last one. */
export function sendLook(look: { skin: number; hair: string; hairColor: number; items: Record<string, string | undefined> }) {
  clearTimeout(lookTimer)
  lookTimer = window.setTimeout(() => {
    const items: Record<string, string> = {}
    for (const [k, v] of Object.entries(look.items)) if (v) items[k] = v
    link.send({ t: 'l', l: { skin: look.skin, hair: look.hair, hairColor: look.hairColor, items } })
  }, 450)
}
export function sendTag(title: string, team: string) {
  clearTimeout(tagTimer)
  tagTimer = window.setTimeout(() => link.send({ t: 'tag', ti: title, tm: team }), 300)
}
