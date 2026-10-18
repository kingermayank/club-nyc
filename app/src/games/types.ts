import type { Look } from '../avatar/look'
import type { AvatarView } from '../avatar/render'
import type { sfx } from '../audio'

export interface GameResult {
  /** coins to pay out (the host adds them to the wallet) */
  coins: number
  /** big number shown on the payout card, e.g. pizzas made */
  score?: number
  /** short lines for the payout card ("12 pizzas", "Best combo: 5") */
  lines?: string[]
  /** outcomes the world reacts to, e.g. 'arrived' (ferry reached Liberty Island) */
  flags?: string[]
}

/** What a mini-game gets from the host. The game renders inside `root`. */
export interface MiniGameContext {
  /** a 1000 × 565 element (logical px; the stage handles scaling). Render everything inside it. */
  root: HTMLElement
  /** shared WebAudio synth (see src/audio.ts) */
  sfx: typeof sfx
  /** the player's avatar look */
  look: Look
  /** make an animated avatar (append `.el` somewhere, call `.update(dt)` every frame, `.setPose()`, `.face()`) */
  avatar(look?: Look, unit?: number): AvatarView
  /** a random New Yorker (customers, crowds) */
  randomLook(): Look
  /** game over: the host shows the payout card and returns to the world */
  end(result: GameResult): void
  /** register cleanup (cancel RAF, remove window listeners). Called when the game is closed for any reason. */
  onExit(cb: () => void): void
  /** convert a pointer event to root-local logical coordinates */
  toLocal(e: { clientX: number; clientY: number }): { x: number; y: number }
}

export interface MiniGame {
  id: string
  title: string
  start(ctx: MiniGameContext): void
}
