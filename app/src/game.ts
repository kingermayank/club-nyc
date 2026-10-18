import { sfx, setMuted } from './audio'
import { save, persist } from './state'
import { ITEM } from './avatar/items'
import { mountStage, stage, el } from './engine/stage'
import { toast, showToast, choose, info, confetti, hold, openOverlay, closeOverlay, notify } from './engine/ui'
import { Actor } from './engine/actor'
import { world, startWorld, goto, walkTo } from './engine/world'
import { STAMPS } from './data/stamps'
import type { Game } from './types'
import type { GameResult } from './games/types'
import { buildHud, renderCoins, bumpCoins } from './hud'
// features that decorate specific rooms register themselves on import (must happen before the first room builds)
import './features/billboards'
import './features/dancejam'
import './features/theater'
import './features/piano'
import './features/apartment'
import './features/extras'
import './social/flashmob'
import { startCommunity } from './social/community'
import { initParty } from './features/party'
import { startQuests } from './social/quests'
import { signIn, account, claimProfile, nameAvailable, hasLocalProgress, startCloudSync, agreeToPolicy, forgetThisVisit } from './net/session'
import { POLICY_VERSION } from './data/policy'
import { consentPanel, tooYoungScreen } from './features/consent'
import { walletOnline, syncWallet, claimCoins, spendCoins, buyOnline, grantOnline, onWalletChange } from './net/wallet'
import { rest } from './net/server'
import { ROOMS } from './data/rooms'
import { isHomeRoom } from './data/homes'
import { nycDay, weekStart, visitReward, WELCOME_GIFTS } from './data/economy'

export const coinIcon = `<img src="/art/icons/coin.png" alt="" width="20" height="20">`

/** The server's daily ceiling on earned coins (anti-farming) — tell the player once a day instead of silently not paying. */
let capNoted = ''
function dailyCapNote() {
  const day = new Date().toDateString()
  if (capNoted === day) return
  capNoted = day
  toast('That’s all the coins the city hands out today. More tomorrow! Jobs, photos and friends are still fun. 🌙', '🪙')
}

/** The API rooms, features and games use to talk to the world. */
export const api: Game = {
  goto: (room, from) => goto(room, from),
  say: (text, ms) => world.player.say(text, ms),
  toast,
  earn(n, why, reason, ref) {
    if (walletOnline()) {
      // shift pay was already put in the wallet by the server when the run was validated
      if (reason === 'job') void syncWallet()
      else {
        save.coins += n
        renderCoins()
        void claimCoins(reason, n, ref).then((r) => {
          if (r?.error === 'daily-cap') dailyCapNote()
        })
      }
    } else {
      save.coins += n
      persist()
      renderCoins()
    }
    if (n > 0) {
      bumpCoins()
      sfx.coin()
      save.stats.earned = (save.stats.earned ?? 0) + n
    }
    if (why) toast(`${why} <b>+${n}</b>`, coinIcon)
  },
  spend(n, reason) {
    if (save.coins < n) {
      world.player.say('I’m out of coins! Time to earn some. 🪙')
      sfx.squawk()
      return false
    }
    save.coins -= n
    persist()
    renderCoins()
    if (walletOnline()) void spendCoins(n, reason)
    return true
  },
  async buy(item) {
    const def = ITEM[item]
    if (!def) return false
    if (save.owned.includes(item)) return true
    if (save.coins < def.price) {
      world.player.say('I’m out of coins! Time to earn some. 🪙')
      sfx.squawk()
      return false
    }
    if (!walletOnline()) {
      save.coins -= def.price
      api.give(item)
      renderCoins()
      return true
    }
    const r = await buyOnline('item', item)
    if (!r?.ok) {
      toast(r?.error === 'poor' ? 'Not enough coins for that one.' : 'The register’s jammed. Try again in a sec.', '🪙')
      return false
    }
    api.give(item)
    return true
  },
  stamp(id) {
    if (save.stamps.includes(id) || !STAMPS[id]) return
    save.stamps.push(id)
    persist()
    const s = STAMPS[id]
    setTimeout(() => {
      sfx.stamp()
      showToast(el('div', 'stamp-toast', `<div class="stamp-badge t${s.tier}">${s.icon}</div><div><small>Stamp earned</small><b>${s.name}</b></div>`), 3200)
      const n = save.stamps.length
      if (n % 5 === 0) {
        setTimeout(() => api.earn(25, `${n} stamps bonus!`, 'stamp-bonus', n), 900)
        if (n === 5) {
          // the server checks your 5 stamps against your cloud save, so upload it before asking for the hat
          void import('./net/session').then((m) => m.saveNow()).finally(() => {
            api.give('party-hat')
            setTimeout(() => toast('Unlocked: Paper Party Hat 🎉', '🎁'), 1800)
          })
        }
      }
    }, 350)
  },
  give(item) {
    if (!save.owned.includes(item)) {
      save.owned.push(item)
      persist()
      // free rewards are checked by the server (a purchase already put the item in the wallet)
      if (walletOnline() && (ITEM[item]?.reward || WELCOME_GIFTS.includes(item))) void grantOnline(item)
      const clothes = save.owned.filter((i) => ITEM[i] && ITEM[i].price > 0).length
      if (clothes >= 20) api.stamp('fashionista')
    }
  },
  owns: (item) => save.owned.includes(item),
  wear(item) {
    const def = ITEM[item]
    if (!def) return
    save.look = { ...save.look, items: { ...save.look.items, [def.slot]: item } }
    persist()
    world.player.setLook(save.look)
  },
  choose,
  info,
  openMap: () => void import('./features/map').then((m) => m.openMap()),
  openSubway: () => void import('./features/subway').then((m) => m.openSubway()),
  newspaper: () => void import('./features/newspaper').then((m) => m.openNewspaper()),
  catalog: (shop, section) => void import('./features/catalog').then((m) => m.openCatalog(shop, section)),
  playGame: (id) => void import('./games/host').then((m) => m.playGame(id)),
  binoculars: (v) => void import('./features/binoculars').then((m) => m.binoculars(v)),
  confetti,
  emote: (pose, seconds = 3) => world.player.emote(pose, seconds),
  watchShow: () => void import('./features/theater').then((m) => m.watchShow()),
  ferry: () => void import('./features/extras').then((m) => m.ferry(api)),
  furniture: () => void import('./features/apartment').then((m) => m.openFurniture()),
  sfx,
  flags: world.flags,
  get room() {
    return world.room
  },
}

export async function startGame(host: HTMLElement) {
  mountStage(host)
  setMuted(save.muted)
  onWalletChange(() => renderCoins())
  // sign in (or play offline) before the city is built: your cloud save decides where you wake up
  const splash = el('div', 'boot-splash', `<img src="/art/ui/logo.png" alt="Club NYC"><span>Opening the city…</span>`)
  stage.root.append(splash)
  const mode = await signIn()
  splash.remove()
  const online = mode === 'online'
  const goLive = () => {
    if (!online) return
    startCloudSync()
    void import('./net/multiplayer').then((m) => m.startMultiplayer())
  }

  const player = new Actor(save.look, save.name || 'You', [500, 460], true)
  startWorld(player, api)
  buildHud()
  startCommunity()
  initParty()

  if (!save.created) {
    const release = hold()
    void import('./features/creator').then((m) =>
      m.openCreator(
        () => {
          release()
          player.setLook(save.look)
          player.setName(save.name)
          import('./engine/world').then((m) => m.refreshTag(player))
          goLive()
          // Arrive like Club Penguin's welcome room: first just you, the street and the people on it.
          // A hop and a hello, a beat to look around, then Rosa. Rewards and toasts wait until the tour is done,
          // so nothing piles up on top of the city in the first seconds.
          void import('./net/events').then((m) => m.track('spawned'))
          setTimeout(async () => {
            player.emote('jump')
            player.say(`Hi! I’m ${save.name}. Let’s explore New York! 🗽`)
            startQuests()
            if (online) {
              // came through a friend's invite: land next to them first, then the tour
              await welcomeInvited().catch(() => {})
            }
            await new Promise((ok) => setTimeout(ok, 2200))
            const { startTour } = await import('./features/tour')
            await startTour()
            api.stamp('welcome')
            if (online) accountStamps()
            // the MetroCard is earned in the city now: it flips in at the corner once the tour is done
            setTimeout(() => void import('./features/creator').then((m) => m.flipMetroCard(account.me?.memberNo ?? 0)), 900)
            setTimeout(() => void import('./features/mail').then((m) => m.sendPostcard({ id: 'welcome', from: 'Rosa, your building’s super', art: '🗽', title: 'Welcome to the city!', text: `Your MetroCard came loaded with ${save.coins} coins. THREAD in SoHo has outfits, and the I ♥ NY shop in Times Square has souvenirs. Work a job when you want more. See you around the building!`, go: { label: 'Take me to SoHo', room: 'soho' } })), 6000)
            setTimeout(dailyBonus, 3200)
          }, 500)
        },
        online
          ? {
              checkName: nameAvailable,
              claim: (name, look, team, birth) => claimProfile(name, look, team, { birth, consent: POLICY_VERSION }),
              tooYoung: () => void forgetThisVisit(),
              memberNo: () => account.me?.memberNo ?? 0,
            }
          : {},
      ),
    )
  } else if (online && !account.me?.profileDone && hasLocalProgress()) {
    // you played offline before: bring that New Yorker online under the same name if it's free
    // (first, like any new New Yorker online: a birthday and "I agree")
    const release = hold()
    const agreed = await consentPanel('new')
    if (agreed === 'too-young') {
      void forgetThisVisit()
      return tooYoungScreen()
    }
    const claimWith = { birth: agreed.birth ?? undefined, consent: POLICY_VERSION, local: true }
    let problem = await claimProfile(save.name, save.look, save.team, claimWith)
    while (problem) problem = await pickOnlineName(problem, claimWith)
    release()
    player.setName(save.name)
    import('./engine/world').then((m) => m.refreshTag(player))
    toast(`Welcome online, <b>${save.name}</b>! Your progress came with you.`, '🗽')
    goLive()
    dailyBonus()
    startQuests()
  } else {
    // a returning New Yorker who hasn't agreed to the current Terms / Privacy Policy / Rules: once, before heading in
    if (online && account.me && account.me.consentVersion !== POLICY_VERSION) {
      const release = hold()
      await consentPanel('update')
      await agreeToPolicy()
      release()
    }
    if (online && account.me?.nameReset) {
      // a moderator reset your name: pick a new one before heading out
      const release = hold()
      let problem: string | null = 'A moderator reset your name, so you get to pick a new one.'
      while (problem) problem = await pickOnlineName(problem)
      release()
      player.setName(save.name)
      import('./engine/world').then((m) => m.refreshTag(player))
    }
    goLive()
    if (online) accountStamps()
    void import('./features/creator').then((m) => m.titleCard())
    dailyBonus()
    startQuests()
    // came back through a friend's invite link?
    if (online) setTimeout(() => void inviteForReturning(), 700)
    // New Yorkers from before the tour existed get offered it once
    if (!save.tour) {
      save.tour = 'offered'
      persist()
      setTimeout(
        () => notify('New in the city? Rosa, your building’s super, can show you how everything works.', '🗽', [{ label: 'Show me around', act: () => void import('./features/tour').then((m) => m.startTour()) }], 12000),
        4500,
      )
    }
    // players from before Neighborhood Wars existed pick a team once
    if (!save.team) setTimeout(() => void import('./social/community').then((m) => m.openCommunity('teams')), 2600)
  }
  // debug / QA handle (tools/*.py drive the game through this)
  ;(window as unknown as { clubNyc: unknown }).clubNyc = {
    api,
    world,
    save,
    walkTo,
    card: (a: Actor) => void import('./features/playerCard').then((m) => m.playerCardFor(a)),
    visit: (userId: string) => void import('./features/apartment').then((m) => m.visitPlayerApartment(userId)),
    photo: (where?: string) => void import('./features/photobooth').then((m) => m.openPhotoBooth(where)),
    party: () => void import('./features/houseparty').then((m) => m.openPartyPanel()),
    listings: () => void import('./features/streetcheesy').then((m) => m.openListings()),
    jam: () => void import('./features/dancejam').then((m) => m.openDanceJam()),
    /** dev builds: finish the running mini-game now (to look at the payout card) */
    endGame: (r?: GameResult) => void import('./games/host').then((m) => m.endRunningGame(r ?? { coins: 14, score: 9, lines: ['9 pizzas served', 'Best streak: 4'] })),
  }
}

/** Your offline name is taken (or not allowed) online: pick another. Resolves with an error or null. */
function pickOnlineName(problem: string, claimWith: Parameters<typeof claimProfile>[3] = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const p = el('div', 'panel', `<div class="panel-art">🏷️</div><h2>Pick your online name</h2><p>${problem} Names are 2–14 letters, numbers or underscores. This is what everyone in the city sees.</p>`)
    const input = document.createElement('input')
    input.className = 'name-input'
    input.maxLength = 14
    input.value = save.name.replace(/[^A-Za-z0-9_]/g, '').slice(0, 14)
    input.oninput = () => (input.value = input.value.replace(/[^A-Za-z0-9_]/g, ''))
    const ok = el('button', 'btn go', 'Claim it')
    const submit = async () => {
      ok.disabled = true
      const err = await claimProfile(input.value, save.look, save.team, claimWith)
      closeOverlay()
      resolve(err)
    }
    ok.onclick = () => void submit()
    input.onkeydown = (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') void submit()
    }
    p.append(input, ok)
    openOverlay(p, { backdrop: false })
    setTimeout(() => input.focus({ preventScroll: true }), 200)
  })
}

/** The daily MetroCard refill: once per New York day, a little bigger for each day you drop by this week. */
function dailyBonus() {
  const today = nycDay()
  if (save.lastDaily === today) return
  const start = weekStart(today)
  const week = save.week?.start === start ? save.week.days + 1 : 1
  save.lastDaily = today
  save.week = { start, days: week }
  persist()
  setTimeout(async () => {
    if (!walletOnline()) {
      const n = visitReward(week)
      save.coins += n
      save.stats.daysVisited = (save.stats.daysVisited ?? 0) + 1
      persist()
      renderCoins()
      return celebrateDaily(n, week, save.stats.daysVisited)
    }
    // online the server counts the days from its ledger and pays accordingly
    const r = await claimCoins('daily', 0)
    if (r?.ok) {
      save.week = { start, days: r.week ?? week }
      save.stats.daysVisited = Math.max(save.stats.daysVisited ?? 0, r.days ?? 0)
      persist()
      celebrateDaily(r.paid ?? 0, save.week.days, save.stats.daysVisited)
    } else if (r?.error === 'cap' && account.me?.week) {
      // already refilled today on another device
      save.week = { start, days: account.me.week }
      persist()
    }
  }, 2200)
}

function celebrateDaily(n: number, week: number, days: number) {
  bumpCoins()
  sfx.coin()
  save.stats.earned = (save.stats.earned ?? 0) + n
  // plain feedback, never "come back or lose it"
  const note = week >= 7 ? ' · all seven days this week!' : week > 1 ? ` · day ${week} this week` : ''
  toast(`Daily MetroCard refill <b>+${n}</b>${note}`, coinIcon)
  if (week >= 7) {
    api.stamp('week-7')
    confetti(50)
  }
  if (days >= 30) api.stamp('days-30')
  persist()
}

/** Invite milestones become stamps (titles you can show off under your name). */
function accountStamps() {
  const me = account.me
  if (!me) return
  const n = me.invites ?? 0
  if (n >= 1) api.stamp('invite-1')
  if (n >= 3) api.stamp('invite-3')
  if (n >= 10) api.stamp('invite-10')
}

/** You came through a friend's invite: say so, and take you to them if they're out in the city. */
async function welcomeInvited() {
  const inv = account.invite
  if (!inv) return
  account.invite = null
  toast(`${inv.friends === 'accepted' ? `You and <b>${inv.by}</b> are friends now!` : `We sent <b>${inv.by}</b> a friend request.`}${inv.welcome ? ` Here’s <b>${inv.welcome}</b> welcome coins.` : ''}`, '💌')
  try {
    // you're friends now, so the friends list says where they are
    const { friends } = await rest<{ friends: { id: string; name: string; online: boolean; room: string | null }[] }>('/friends')
    const f = friends.find((x) => x.name === inv.by)
    if (f?.online && f.room && isHomeRoom(f.room)) {
      // they're at home — probably throwing a party: go knock
      setTimeout(() => {
        toast(`<b>${inv.by}</b> is at home. Heading over! 🎉`, '🚕')
        void import('./features/apartment').then((m) => m.visitPlayerApartment(f.id))
      }, 2500)
    } else if (f?.online && f.room && ROOMS[f.room] && f.room !== world.room.id) {
      setTimeout(() => {
        toast(`Heading to <b>${ROOMS[f.room!].name}</b> to find ${inv.by}…`, '🚕')
        api.goto(f.room!)
      }, 2500)
    }
  } catch {
    /* they'll find each other on the City tab */
  }
}

/** A returning player who opens a friend's invite link: offer to add them, or take them to their friend. */
async function inviteForReturning() {
  const { pendingInvite, clearInvite } = await import('./net/invite')
  const name = pendingInvite()
  if (!name) return
  clearInvite()
  if (name.toLowerCase() === save.name.toLowerCase()) return toast('That’s your own invite link. Send it to a friend! 💌', '💌')
  let who: { user: { id: string; name: string }; online: boolean }
  try {
    who = await rest(`/invite/${encodeURIComponent(name)}`)
  } catch {
    return toast(`We couldn’t find a New Yorker called “${name}”. The link may be mistyped.`, '💌')
  }
  const { goToFriend, addFriend } = await import('./net/multiplayer')
  const them = who.user
  // ask the server (the live friends list may not have arrived yet)
  const friends = await rest<{ friends: { id: string }[] }>('/friends').then((r) => r.friends).catch(() => [] as { id: string }[])
  if (friends.some((f) => f.id === them.id)) {
    if (who.online) return notify(`You opened <b>${them.name}</b>’s invite link. They’re in the city right now.`, '💌', [{ label: 'Go', act: () => goToFriend(them.id) }], 12000)
    return toast(`You and <b>${them.name}</b> are already friends. They’re offline right now.`, '💌')
  }
  notify(`You opened <b>${them.name}</b>’s invite link.${who.online ? ' They’re in the city right now!' : ''}`, '💌', [{ label: 'Add friend', act: () => void addFriend(them.id, them.name) }], 14000)
}

/** Players who made a New Yorker offline confirm they're 13+ before going online. */

