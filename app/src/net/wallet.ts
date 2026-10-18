import { save, persist } from '../state'
import { STARTER_ITEMS } from '../avatar/items'
import { link } from './link'
import { rest } from './server'

/**
 * Online, the server owns your coins, wardrobe and homes (see server/src/economy.ts).
 * Earning and small spends update the screen immediately and settle with the server a moment later;
 * purchases that give you something wait for the server's yes.
 */
export interface WalletWire {
  coins: number
  owned: string[]
  homes: string[]
}
export interface WalletResult {
  ok: boolean
  coins: number
  paid?: number
  error?: string
  wallet?: WalletWire
  /** daily refills: days you've dropped by this week (today included) and in all */
  week?: number
  days?: number
}

let redraw: () => void = () => {}
/** game.ts hands us the coin counter's redraw (avoids an import cycle with the HUD) */
export function onWalletChange(f: () => void) {
  redraw = f
}

export const walletOnline = () => link.account && !!save.owner

/** optimistic changes still waiting for the server, so a reply never "un-counts" one that's in flight */
let pending = 0

export function applyWallet(w: Partial<WalletWire>) {
  if (typeof w.coins === 'number') save.coins = Math.max(0, w.coins + pending)
  if (w.owned) save.owned = [...new Set([...STARTER_ITEMS, ...w.owned])]
  if (w.homes) {
    save.homes = w.homes.length ? w.homes : ['walkup']
    if (!save.homes.includes(save.home)) save.home = 'walkup'
  }
  persist()
  redraw()
}

export async function syncWallet() {
  if (!walletOnline()) return
  try {
    applyWallet(await rest<WalletWire>('/wallet'))
  } catch {
    /* next action will settle it */
  }
}

async function settle(path: string, body: unknown, delta: number): Promise<WalletResult | null> {
  pending += delta
  try {
    const r = await rest<WalletResult>(path, { json: body })
    pending -= delta
    applyWallet(r.wallet ?? { coins: r.coins })
    return r
  } catch {
    pending -= delta
    setTimeout(() => void syncWallet(), 2000)
    return null
  }
}

/** Ask to be paid for something (the server may say no: a cap, a duplicate). */
export const claimCoins = (reason: string, delta: number, ref?: string | number) => settle('/wallet/earn', { reason, ref }, delta)
/** A small spend (a soda, a ticket, furniture). */
export const spendCoins = (amount: number, reason: string) => settle('/wallet/spend', { amount, reason }, -amount)
/** Buy clothing / a treat you'll hold, or a home — waits for the server. */
export const buyOnline = (kind: 'item' | 'home', id: string) => settle('/wallet/buy', { kind, id }, 0)
/** A free reward item (a uniform from a job, the party hat…). A job's reward can race its score to the server, so retry once. */
export async function grantOnline(item: string) {
  const r = await settle('/wallet/grant', { item }, 0)
  if (r && !r.ok && r.error === 'not-earned') {
    await new Promise((ok) => setTimeout(ok, 2500))
    return settle('/wallet/grant', { item }, 0)
  }
  return r
}
