import { save, persist, persistHooks, adoptSave, freshSave, type SaveState } from '../state'
import { link } from './link'
import { rest, HttpError, type Me } from './server'
import { applyWallet, type WalletWire } from './wallet'
import { pendingInvite, clearInvite } from './invite'
import { POLICY_VERSION } from '../data/policy'

/**
 * Accounts with as little friction as possible:
 *   no session  → sign-in screen: "Play now" (instant guest account) or Google / X
 *   new account → the normal New Yorker creator, which claims a unique name on the server
 *   returning   → your cloud save loads before the city is built
 * If the server can't be reached the game simply runs single-player, exactly as before.
 */
export const account = {
  me: null as Me | null,
  /** set when this account was just made through a friend's invite link */
  invite: null as { by: string; friends: 'accepted' | 'pending'; welcome: number } | null,
}

interface Banned {
  until: number
  reason: string
  contact: string
}
type Probe = { state: 'in'; me: Me } | { state: 'out' } | { state: 'down' } | { state: 'banned'; ban: Banned }
async function probe(): Promise<Probe> {
  try {
    const r = await rest<{ user: Me | null; banned?: Banned }>('/me', { timeout: 3500 })
    if (r.banned) return { state: 'banned', ban: r.banned }
    return r.user ? { state: 'in', me: r.user } : { state: 'out' }
  } catch (e) {
    return e instanceof HttpError && e.status === 401 ? { state: 'out' } : { state: 'down' }
  }
}

/** Resolves 'online' once signed in (profile may still need creating), or 'offline'. */
export async function signIn(): Promise<'online' | 'offline'> {
  const q = new URLSearchParams(location.search)
  // ?profile=<slot> is a local test save (QA tools) — always single-player
  if (q.get('offline') === '1' || q.has('profile')) return 'offline'
  const login = q.get('login')
  if (login) history.replaceState(null, '', location.pathname + location.search.replace(/[?&]login=[^&]*/, '').replace(/^&/, '?'))
  let p = await probe()
  if (p.state === 'banned') return banScreen(p.ban)
  if (p.state === 'down') return 'offline'
  if (p.state === 'out') {
    // the landing page's "Play now" (/play?start=guest) was the front door: straight into making a New Yorker as a
    // guest. Otherwise the front door offers guest play or Google / X / Discord.
    const quick = q.get('start') === 'guest' && !login
    if (q.has('start')) history.replaceState(null, '', location.pathname + location.search.replace(/[?&]start=[^&]*/, '').replace(/^&/, '?'))
    const choice = quick ? 'guest' : await (await import('../features/signin')).signInScreen(login === 'failed' ? 'That sign-in didn’t work. Try again, or just hit Play Now.' : undefined)
    if (choice === 'offline') return 'offline'
    try {
      await rest('/auth/guest', { method: 'POST' })
    } catch {
      return 'offline'
    }
    p = await probe()
    if (p.state !== 'in') return 'offline'
  }
  // the Google / X / Discord account just used already has its own New Yorker: switch to it, or stay (asked first,
  // since a guest left behind can't be reached again)
  if (login === 'switch') {
    const info = await rest<import('../features/signin').SwitchInfo>('/auth/switch').catch(() => null)
    if (info) {
      const go = await (await import('../features/signin')).switchScreen(info)
      const r = await rest<{ switched: boolean }>('/auth/switch', { json: { go } }).catch(() => null)
      if (r?.switched) {
        const again = await probe()
        if (again.state === 'banned') return banScreen(again.ban)
        if (again.state === 'in') p = again
      }
    }
  }
  const me = p.me
  account.me = me
  link.account = true
  link.me = me.id
  if (me.profileDone) await loadCloud(me)
  else if (save.owner && save.owner !== me.id) adoptSave(freshSave(), me.id)
  return 'online'
}

async function loadCloud(me: Me) {
  let cloud: Partial<SaveState> | null = null
  try {
    cloud = (await rest<{ save: Partial<SaveState> | null }>('/save')).save
  } catch {
    /* fall through with what we have */
  }
  if (cloud) adoptSave(cloud, me.id)
  else if ((save.owner && save.owner !== me.id) || !save.created) adoptSave({ created: true }, me.id)
  // the server is the source of truth for who you are
  save.created = true
  save.name = me.name
  if (me.look) save.look = { ...me.look, items: { ...me.look.items } }
  save.team = me.team || save.team
  save.owner = me.id
  // XP is the server's too (levels can't be edited in a save)
  if (typeof me.xp === 'number') save.xp = me.xp
  persist()
}

/** Single-player progress from before you had an account comes with you. */
export const hasLocalProgress = () => save.created && !save.owner

/** Claim a profile (name, look, team) on the server. Returns an error message, or null. */
export async function claimProfile(
  name: string,
  look: SaveState['look'],
  team: string,
  extra: { birth?: { m: number; y: number }; consent?: string; local?: boolean } = {},
): Promise<string | null> {
  try {
    const invitedBy = pendingInvite() ?? undefined
    // progress made offline before this account existed comes along (the server caps the coins)
    const local = extra.local ? { coins: save.coins, owned: save.owned, homes: save.homes } : undefined
    const r = await rest<{ user: Me; wallet?: WalletWire; invite?: typeof account.invite }>('/profile', { json: { name, look, team, birth: extra.birth, consent: extra.consent, invitedBy, local } })
    account.me = r.user
    account.invite = r.invite ?? null
    if (invitedBy) clearInvite()
    save.owner = r.user.id
    save.name = r.user.name
    persist()
    if (r.wallet) applyWallet(r.wallet)
    return null
  } catch (e) {
    if (e instanceof HttpError) return e.reason === 'name' ? 'Please pick a different name.' : e.reason
    return 'Can’t reach the city right now. Check your connection.'
  }
}

/** Agree to the current Terms / Privacy Policy / Community Rules (returning players, after an update). */
export async function agreeToPolicy(): Promise<boolean> {
  try {
    const r = await rest<{ user: Me }>('/consent', { json: { version: POLICY_VERSION } })
    account.me = r.user
    return true
  } catch {
    return false
  }
}

/** Under 13: nothing from this visit is kept, so the guest account made for it is deleted. */
export async function forgetThisVisit() {
  try {
    await rest('/me', { method: 'DELETE' })
  } catch {
    /* already gone, or offline */
  }
  account.me = null
  link.account = false
}

/** Is this name free? (debounced by the caller) */
export async function nameAvailable(name: string): Promise<{ ok: boolean; reason: string | null }> {
  try {
    return await rest(`/name-available?name=${encodeURIComponent(name)}`)
  } catch {
    return { ok: true, reason: null }
  }
}

// ---------- cloud save: every change is uploaded a few seconds later ----------
let dirty = false
let timer = 0
let inflight = false
async function upload(keepalive = false) {
  if (!dirty || inflight || !link.account || !save.owner) return
  dirty = false
  inflight = true
  try {
    await rest('/save', { method: 'PUT', json: { save }, keepalive })
  } catch {
    dirty = true
    clearTimeout(timer)
    timer = window.setTimeout(() => void upload(), 15000)
  } finally {
    inflight = false
  }
}
/** Upload the save right away (e.g. before asking the server for a reward it checks against your save). */
export async function saveNow() {
  clearTimeout(timer)
  dirty = true
  for (let i = 0; i < 20 && inflight; i++) await new Promise((ok) => setTimeout(ok, 100))
  await upload()
}

export function startCloudSync() {
  persistHooks.push(() => {
    dirty = true
    clearTimeout(timer)
    timer = window.setTimeout(() => void upload(), 3000)
  })
  const now = () => {
    clearTimeout(timer)
    void upload(true)
  }
  window.addEventListener('pagehide', now)
  document.addEventListener('visibilitychange', () => document.hidden && now())
  dirty = true
  void upload()
}

export async function signOut() {
  await upload()
  await rest('/auth/logout', { method: 'POST' }).catch(() => {})
  location.reload()
}

/** A suspended or banned account sees why, until when, and how to appeal — and the city stays closed. */
function banScreen(ban: Banned): Promise<'online' | 'offline'> {
  const until = ban.until > 7_000_000_000_000 ? null : new Date(ban.until).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  const box = document.createElement('div')
  box.className = 'creator signin banned'
  box.innerHTML = `<div class="creator-bg"></div><img class="creator-logo" src="/art/ui/logo.png" alt="Club NYC">
    <div class="signin-card"><h2>${until ? 'Your account is suspended' : 'Your account has been banned'}</h2>
    <p class="si-sub">${until ? `You can come back on <b>${until}</b>.` : 'This account can’t play Club NYC anymore.'}</p>
    ${ban.reason ? `<div class="cr-err">Reason: ${esc(ban.reason)}</div>` : ''}
    <p class="si-fine">Read the <a href="/rules.html" target="_blank" rel="noopener">community rules</a>.${ban.contact ? ` Think this is a mistake? Email <a href="mailto:${esc(ban.contact)}">${esc(ban.contact)}</a> with your in-game name.` : ''}</p></div>`
  document.querySelector('.stage, #app')?.append(box)
  document.querySelector('.boot-splash')?.remove()
  return new Promise(() => {})
}
