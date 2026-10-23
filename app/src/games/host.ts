import { sfx } from '../audio'
import { save, persist, best, bump } from '../state'
import { el, stage, W, H } from '../engine/stage'
import { hold, toast, confetti } from '../engine/ui'
import { AvatarView, avatarPortrait, itemIcon } from '../avatar/render'
import { randomLook } from '../avatar/random'
import { ITEM } from '../avatar/items'
import { GAMES } from './registry'
import type { GameResult, MiniGameContext } from './types'
import { api } from '../game'
import { world } from '../engine/world'
import { submit, fmt, BOARD, rematchWins, board } from '../social/leaderboard'
import { headPortrait } from '../avatar/render'
import { contribute, myTeam } from '../social/teams'
import { bond } from '../social/friends'
import { link } from '../net/link'
import { rest } from '../net/server'
import { inviteLink } from '../net/invite'
import { applyWallet } from '../net/wallet'
import { STAMPS } from '../data/stamps'
import { iconHtml } from '../engine/iconize'

/** what the server says after a validated run */
interface Finish {
  accepted: boolean
  /** shift pay the server actually put in your wallet (less than you earned once today's ceiling is reached) */
  paid?: number
  /** your balance afterwards */
  coins?: number
  best: number
  rank: number
  total: number
  next: { name: string; score: number } | null
}
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Unlockable outfits for playing (Club Penguin gave out game items too). */
const REWARDS: Record<string, string[]> = {
  'slice-factory': ['chef-hat', 'chef-coat'],
  'halal-rush': ['halal-apron'],
  'ferry-captain': ['captain-hat'],
  'bagel-counters': ['barista-apron'],
}

/** each job's stamp, shown on the payout card (earned or still to get) */
const JOB_STAMP: Record<string, string> = { 'slice-factory': 'slice-pro', 'halal-rush': 'halal-hero', 'ferry-captain': 'captain', 'bagel-counters': 'bagel-boss', showtime: 'showtime' }
/** Stamps for great runs. */
function stampsFor(id: string, r: GameResult) {
  const s = r.score ?? 0
  if (id === 'slice-factory' && s >= 15) api.stamp('slice-pro')
  if (id === 'halal-rush' && s >= 10) api.stamp('halal-hero')
  if (id === 'ferry-captain' && r.flags?.includes('arrived')) api.stamp('captain')
  if (id === 'bagel-counters' && s >= 40) api.stamp('bagel-boss')
  if (id === 'showtime') api.stamp('showtime')
}

/** ends the game that's running (dev builds only: tools/pixel_audit.py uses it to reach the payout card) */
let endRunning: ((r: GameResult) => void) | null = null
export const endRunningGame = (r: GameResult) => import.meta.env.DEV && endRunning?.(r)

export async function playGame(id: string) {
  const entry = GAMES[id]
  if (!entry) return
  const release = hold()
  const shell = el('div', 'game-shell')
  const root = el('div', 'game-root')
  const loading = el('div', 'game-loading', `<div class="spinner"></div><b>${entry.title}</b><small>${entry.blurb}</small>`)
  shell.append(root, loading)
  stage.root.append(shell)
  sfx.whoosh()
  // a "Show me" card pointing at something in the city would sit on top of the game and keep its keys: it's done now
  void import('../features/tour').then((m) => m.closeTour())
  const exits: (() => void)[] = []
  let ended = false
  const close = () => {
    exits.forEach((f) => {
      try {
        f()
      } catch (e) {
        console.error(e)
      }
    })
    exits.length = 0
  }
  const quit = el('button', 'game-quit', '✕')
  quit.title = 'Leave Game (Esc)'
  // Escape always gets you out. In a game it asks first (a stray key never costs a shift) and a second Escape leaves;
  // on the results card it's Back to the City. A game that uses Escape itself (Showtime's pause, putting a Slice
  // Factory tool down) calls preventDefault, so the check waits until every listener has run.
  let asking: HTMLElement | null = null
  const unask = () => {
    asking?.remove()
    asking = null
  }
  const ask = () => {
    sfx.click()
    asking = el('div', 'game-leave', `<div class="game-leave-card" role="alertdialog" aria-label="Leave ${entry.title}?"><b>Leave ${entry.title}?</b><small>Press <kbd>Esc</kbd> again to leave.</small><div class="game-leave-btns"><button class="btn ghost stay">Keep Playing</button><button class="btn danger go">Leave</button></div></div>`)
    asking.querySelector<HTMLButtonElement>('.stay')!.onclick = (e) => (e.stopPropagation(), unask())
    asking.querySelector<HTMLButtonElement>('.go')!.onclick = (e) => (e.stopPropagation(), quit.click())
    asking.onclick = (e) => e.target === asking && unask()
    shell.append(asking)
  }
  const onEsc = (e: KeyboardEvent) => {
    // while the question is up, keys answer it and never reach the game: Escape leaves, Enter stays
    if (asking) {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Escape' && !e.repeat) quit.click()
      else if (e.key === 'Enter') unask()
      return
    }
    if (e.key !== 'Escape' || e.repeat) return
    setTimeout(() => {
      if (e.defaultPrevented || asking) return
      if (!ended) ask()
      else stage.root.querySelector<HTMLButtonElement>('.payout:not(.out) .go')?.click()
    })
  }
  // (capture, so it hears keys before the game does)
  addEventListener('keydown', onEsc, true)
  const unEsc = () => removeEventListener('keydown', onEsc, true)
  quit.onclick = () => {
    if (ended) return
    ended = true
    unEsc()
    unask()
    close()
    shell.classList.add('out')
    setTimeout(() => shell.remove(), 400)
    release()
  }
  shell.append(quit)
  // the game opens straight on its own how-to-play screen; the leaderboard comes after the run, on the results card
  const loadingMod = entry.load()
  loadingMod.catch(() => {})
  let mod
  try {
    mod = (await loadingMod).default
  } catch (e) {
    console.error(e)
    toast('That game didn’t load. Check your connection and try again.', '🚧')
    ended = true
    unEsc()
    shell.remove()
    release()
    return
  }
  if (ended) return // left while it was loading
  loading.remove()
  // online: the server issues a run token now and checks the score against the clock at the end
  const run = link.account && BOARD[id] ? rest<{ run: string }>(`/games/${id}/start`, { method: 'POST' }).then((x) => x.run).catch(() => null) : null
  const ctx: MiniGameContext = {
    root,
    sfx,
    look: save.look,
    avatar: (look, unit) => new AvatarView(look ?? save.look, unit),
    randomLook: () => randomLook(0.7),
    onExit: (cb) => exits.push(cb),
    toLocal: (e) => {
      const b = root.getBoundingClientRect()
      return { x: ((e.clientX - b.left) / b.width) * W, y: ((e.clientY - b.top) / b.height) * H }
    },
    end: (r) => {
      if (ended) return
      ended = true
      unask()
      endRunning = null
      close()
      payout(id, entry.title, r, run, () => {
        unEsc()
        shell.classList.add('out')
        setTimeout(() => shell.remove(), 400)
        release()
        if (id === 'ferry-captain' && r.flags?.includes('arrived')) api.goto('liberty-island', 'battery-park')
      })
    },
  }
  bump(`played:${id}`)
  if (import.meta.env.DEV) endRunning = ctx.end
  try {
    mod.start(ctx)
  } catch (e) {
    console.error(e)
    toast('Oops! The game tripped over a pigeon.', '🐦')
    quit.click()
  }
}

interface LobbyRow {
  id: string
  name: string
  look?: unknown
  score: number
  you?: boolean
}

/**
 * A job's leaderboard (this week / all time / friends): the top five with faces, and where you stand. It sits on the
 * results card, so you see the board with your new score in it. `load()` (re)fetches it.
 */
function leaderboard(id: string): { box: HTMLElement; me: HTMLElement; load: () => Promise<void> } {
  const g = BOARD[id]
  const online = !!link.account
  let period: 'week' | 'all' | 'friends' = 'week'
  const box = el('div', 'lobby-board payout-board')
  box.innerHTML = `<div class="lobby-tabs"><button data-p="week" class="on">This Week</button>${online ? '<button data-p="all">All Time</button>' : ''}<button data-p="friends">Friends</button></div>
    <ol class="lobby-rows"><li class="lobby-empty">Loading scores…</li></ol>
    <div class="lobby-me"></div>`
  const rowsEl = box.querySelector<HTMLOListElement>('.lobby-rows')!
  const meEl = box.querySelector<HTMLElement>('.lobby-me')!
  const show = (rows: LobbyRow[], me: { rank: number; total: number; next: { name: string; score: number } | null } | null) => {
    const top = rows.slice(0, 5)
    const mine = rows.find((r) => r.you)
    rowsEl.innerHTML = top.length
      ? top
          .map((r, i) => `<li class="${r.you ? 'you' : ''}"><span class="lb-rank">${i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`}</span><span class="lb-face">${r.look ? headPortrait(r.look as never) : r.you ? headPortrait(save.look) : ''}</span><b>${esc(r.name)}${r.you ? ' (you)' : ''}</b><span class="lb-score">${fmt(id, r.score)} <small>${g.unit}</small></span></li>`)
          .join('')
      : `<li class="lobby-empty">${period === 'friends' ? 'None of your friends have a score yet. Be the first!' : 'Nobody has a score yet. First place is wide open!'}</li>`
    meEl.innerHTML = me && me.rank
      ? `You’re <b>#${me.rank}</b> of ${me.total}${me.next ? ` · beat <b>${esc(me.next.name)}</b>’s ${fmt(id, me.next.score)} to climb` : ' · 👑 top of the board!'}`
      : mine
        ? ''
        : `No score yet${period === 'all' ? '' : ' this week'}.`
  }
  const load = async () => {
    rowsEl.innerHTML = '<li class="lobby-empty">Loading scores…</li>'
    if (online) {
      try {
        const qs = period === 'all' ? '?period=all' : period === 'friends' ? '?scope=friends' : ''
        const r = await rest<{ rows: (LobbyRow & { look: unknown })[]; me: { rank: number; best: number; total: number; next: { name: string; score: number } | null } }>(`/leaderboard/${id}${qs}`)
        if (box.isConnected) show(r.rows, r.me)
      } catch {
        if (box.isConnected) rowsEl.innerHTML = '<li class="lobby-empty">Couldn’t load the leaderboard right now.</li>'
      }
      return
    }
    // offline: this week's board against the city locals
    const rows = board(id, period === 'friends').map((r) => ({ id: r.id, name: r.name, score: r.score, you: r.you, look: r.resident?.look }))
    show(rows, null)
  }
  box.querySelectorAll<HTMLButtonElement>('.lobby-tabs button').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation()
      sfx.click()
      period = b.dataset.p as typeof period
      box.querySelectorAll('.lobby-tabs button').forEach((x) => x.classList.toggle('on', x === b))
      void load()
    }
  })
  return { box, me: meEl, load }
}

/** the job's stamp: lit if you have it, "earned!" if this run gets it, otherwise greyed with what it takes */
function stampLine(id: string, r: GameResult) {
  const sid = JOB_STAMP[id]
  const st = sid && STAMPS[sid]
  if (!st) return ''
  const s = r.score ?? 0
  const now = !save.stamps.includes(sid) && ((id === 'slice-factory' && s >= 15) || (id === 'halal-rush' && s >= 10) || (id === 'ferry-captain' && !!r.flags?.includes('arrived')) || (id === 'bagel-counters' && s >= 40) || id === 'showtime')
  const has = save.stamps.includes(sid)
  return `<div class="payout-stamp ${has || now ? 'lit' : ''}"><span class="ps-icon">${iconHtml(st.icon)}</span><span><b>${st.name}</b>${now ? ' <em>Stamp earned!</em>' : has ? ' <small>· collected</small>' : ''}<small>${st.desc}</small></span></div>`
}

function payout(id: string, title: string, r: GameResult, run: Promise<string | null> | null, done: () => void) {
  const coins = Math.max(0, Math.round(r.coins))
  const isBest = best(`best:${id}`, r.score ?? coins)
  // weekly leaderboard + Neighborhood Wars (online: real players, validated by the server)
  const g = BOARD[id]
  const online = !!run && r.score !== undefined
  // offline, the run goes on the local board (against the city locals) straight away
  if (g && r.score !== undefined && !online) submit(id, r.score)
  const beaten = g && r.score !== undefined ? rematchWins(id, r.score) : []
  const team = myTeam()
  const newItems = (REWARDS[id] ?? []).filter((i) => !save.owned.includes(i))
  const card = el('div', 'payout')
  card.innerHTML = `<div class="payout-card">
      <div class="payout-title">${title}</div>
      <div class="payout-avatar">${avatarPortrait(save.look, 'grin')}</div>
      <div class="payout-coins"><img src="/art/icons/coin.png" alt=""><b>0</b><span>coins earned</span></div>
      ${r.score !== undefined ? `<div class="payout-score">Score <b>${g ? fmt(id, r.score) : r.score}</b>${isBest ? ' <em>New best!</em>' : ''}</div>` : ''}
      ${g ? '<div class="payout-board-slot"></div>' : ''}
      ${beaten.length ? `<div class="payout-team">⚔️ You won the rematch vs <b>${beaten.map((b) => b.name).join(', ')}</b>!</div>` : ''}
      ${team && coins ? `<div class="payout-team pts">+${coins} points for ${team.emoji} <b>${team.name}</b></div>` : ''}
      <ul class="payout-lines">${(r.lines ?? []).map((l) => `<li>${l}</li>`).join('')}</ul>
      ${newItems.length ? `<div class="payout-reward"><small>Unlocked!</small><div class="payout-items">${newItems.map((i) => `<span>${itemIcon(i)}${ITEM[i]?.name ?? i}</span>`).join('')}</div></div>` : ''}
      ${stampLine(id, r)}
      ${coins + save.coins > 0 ? `<div class="payout-spend"><small>Spend your coins</small><button class="spend" data-go="thread">${iconHtml('🛍')}<span>THREAD</span></button><button class="spend" data-go="iloveny">${iconHtml('🗽')}<span>Souvenirs</span></button><button class="spend" data-go="furniture">${iconHtml('🛋')}<span>Flatbush Flea</span></button></div>` : ''}
      <div class="payout-btns"><button class="btn ghost rematch">↻ Play Again</button><button class="btn go">Back to the City</button></div>
    </div>`
  stage.root.append(card)
  // the leaderboard, after the run (with this score in it): this week / all time / friends
  const boardUi = g ? leaderboard(id) : null
  if (boardUi) card.querySelector('.payout-board-slot')!.replaceWith(boardUi.box)
  if (boardUi && !online) void boardUi.load()
  const num = card.querySelector('.payout-coins b')!
  /** what the card shows (and Collect adds): the run's coins, or less if the server hit today's ceiling */
  let shown = coins
  /** false once the server turned the run down: it paid nothing and added nothing to the neighborhood */
  let counted = true
  if (online && g && run && boardUi) {
    boardUi.me.textContent = 'Posting your score…'
    void (async () => {
      try {
        const runId = await run
        if (!runId) throw new Error('no run')
        const f = await rest<Finish>(`/games/${id}/finish`, { json: { run: runId, score: Math.max(0, Math.round(r.score!)), coins } })
        if (typeof f.coins === 'number') applyWallet({ coins: f.coins })
        if (!f.accepted) {
          // the server paid nothing for it, so the card doesn't count up coins that never arrive
          shown = 0
          counted = false
          num.textContent = '0'
          card.querySelector('.payout-team.pts')?.remove()
          card.querySelector('.payout-score em')?.remove()
          await boardUi.load()
          boardUi.me.textContent = 'That run didn’t count, so no coins this time.'
          return
        }
        if (typeof f.paid === 'number' && f.paid < coins) {
          // today's ceiling on shift pay (anti-farming) — say so instead of showing coins that never arrive
          shown = f.paid
          num.textContent = String(f.paid)
          card.querySelector('.payout-lines')!.insertAdjacentHTML('beforeend', `<li>That’s all the shift pay for today: paid <b>${f.paid}</b>. New shifts pay again tomorrow! Your score still counts.</li>`)
        }
        // the board with your new score in it, and where you stand
        await boardUi.load()
        // a top-3 week is worth bragging about, with your invite link, so the brag brings friends
        if (f.rank <= 3 && f.total > 1) {
          const brag = el('button', 'btn tiny go payout-brag', '📣 Tell Your Friends')
          brag.onclick = async (e) => {
            e.stopPropagation()
            const text = `I’m #${f.rank} at ${g.title} this week in Club NYC ${g.emoji}: ${fmt(id, f.best)} ${g.unit}. Come beat me: ${inviteLink(save.name)}`
            try {
              await navigator.clipboard.writeText(text)
              toast('Copied! Paste it in the group chat 📣', '📋')
            } catch {
              toast(text, '📣')
            }
            bump('shares')
          }
          boardUi.me.append(brag)
        }
      } catch {
        boardUi.me.textContent = 'Couldn’t reach the leaderboard, but your coins still count.'
      }
    })()
  }
  // count-up
  const t0 = performance.now()
  const tick = (t: number) => {
    const k = Math.min(1, (t - t0) / 900)
    num.textContent = String(Math.round(shown * (1 - (1 - k) ** 3)))
    if (k < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  if (coins > 0) for (let i = 0; i < Math.min(12, coins); i++) setTimeout(() => sfx.coin(), i * 70)
  if (isBest || newItems.length) confetti(60)
  const collect = () => {
    sfx.click()
    api.earn(shown, undefined, 'job')
    if (counted) contribute(coins)
    if ((save.stats['team:lifetime'] ?? 0) >= 100) api.stamp('team-player')
    for (const b of beaten) bond(b.id, 1)
    // each rematch you win pays on its own (the server caps these per day)
    beaten.forEach((_, i) => api.earn(10, i === beaten.length - 1 ? `Rematch won${beaten.length > 1 ? ` ×${beaten.length}` : ''}!` : undefined, 'challenge'))
    newItems.forEach((i) => api.give(i))
    if (newItems.length) toast(`New outfit unlocked: ${newItems.map((i) => ITEM[i]?.name).join(', ')}`, '🎁')
    stampsFor(id, r)
    persist()
    card.classList.add('out')
    setTimeout(() => card.remove(), 350)
    world.player.emote('cheer', 2)
    done()
    if (shown > 0) void import('../features/mail').then((m) => m.sendPostcard({ id: 'first-paycheck', from: `${title} crew`, art: '🪙', title: 'Your first paycheck!', text: `Nice shift! <b>${shown}</b> coins went straight onto your MetroCard. Not rent money yet, but it’s a start. Every job has a weekly leaderboard and a stamp to collect.` }))
    // first shift without a neighborhood: now the team choice means something (every coin counts for it). If Rosa is
    // talking (a first shift often finishes the first-day list), her card goes first.
    if (!save.team) {
      const pickTeam = async () => {
        if ((await import('../features/tour')).tourOpen()) return void setTimeout(pickTeam, 1200)
        if (save.team) return
        toast('Every coin you earn at a job counts for a neighborhood. Pick yours!', '🏙️')
        void import('../social/community').then((m) => m.openCommunity('teams'))
      }
      setTimeout(pickTeam, 1400)
    }
  }
  card.querySelector<HTMLButtonElement>('.go')!.onclick = collect
  card.querySelector<HTMLButtonElement>('.rematch')!.onclick = () => {
    collect()
    setTimeout(() => playGame(id), 450)
  }
  card.querySelectorAll<HTMLButtonElement>('.spend').forEach((b) => {
    b.onclick = () => {
      collect()
      const where = b.dataset.go!
      setTimeout(() => (where === 'furniture' ? void import('../features/apartment').then((m) => m.openFurnitureCatalog()) : api.catalog(where)), 450)
    }
  })
}

// dev-only QA hook: render a payout card without playing a whole shift (tools/*.py screenshot it)
if (import.meta.env.DEV) {
  ;(window as unknown as { payoutPreview: unknown }).payoutPreview = (id = 'slice-factory', score = 16, coins = 40) =>
    payout(id, GAMES[id]?.title ?? id, { score, coins, lines: ['QA preview'] } as GameResult, null, () => {})
}
