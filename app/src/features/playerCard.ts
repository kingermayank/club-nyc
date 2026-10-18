import { sfx } from '../audio'
import { save, persist, resetSave } from '../state'
import { ITEM, SHOPS } from '../avatar/items'
import { SLOTS, SLOT_LABEL, SKINS, SKIN_ORDER, SIG_COLORS, HAIR_COLORS, HAIR_STYLES, type Look, type Slot } from '../avatar/look'
import { avatarPortrait, itemIcon } from '../avatar/render'
import { el } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton } from '../engine/ui'
import { world } from '../engine/world'
import type { Actor } from '../engine/actor'
import { TEAMS, teamText, type TeamId } from '../social/teams'
import { isFriend } from '../social/friends'
import { refreshTag, titleName } from '../engine/world'
import { STAMPS } from '../data/stamps'
import { nycDay, weekStart } from '../data/economy'
import { link } from '../net/link'
import { rest } from '../net/server'
import type { PlayerPlace } from './apartment'

/** Club Penguin–style player card: you on the left, your stuff on the right. */
export function openPlayerCard(tab: 'items' | 'look' = 'items') {
  const card = el('div', 'player-card')
  const left = el('div', 'pc-left')
  const right = el('div', 'pc-right')
  card.append(left, right, closeButton())

  const drawLeft = () => {
    const team = save.team ? TEAMS[save.team as TeamId] : null
    left.innerHTML = `<div class="pc-portrait">${avatarPortrait(save.look)}</div>
      <div class="pc-name">${save.name}</div>
      ${team ? `<span class="pc-team" style="background:${team.color};color:${teamText(team)}">${team.emoji} ${team.name}</span>` : ''}
      <div class="pc-stats"><span><img src="/art/icons/coin.png" alt="">${save.coins}</span><span><img src="/art/icons/stamps.png" alt="">${save.stamps.filter((id) => STAMPS[id]).length}/${Object.keys(STAMPS).length}</span><span><img src="/art/icons/wave.png" alt="">${save.friends.length}</span></div>`
    // pick a title from the stamps you’ve earned — other players see it on your card when they click you
    const pickWrap = el('label', 'pc-title-pick', '<span>Title</span>')
    const sel = document.createElement('select')
    sel.innerHTML = `<option value="">None</option>` + save.stamps.filter((id) => STAMPS[id]).map((id) => `<option value="${id}" ${save.title === id ? 'selected' : ''}>${STAMPS[id].name}</option>`).join('')
    sel.onchange = () => {
      save.title = sel.value
      persist()
      refreshTag(world.player)
      sfx.pop()
    }
    pickWrap.append(sel)
    left.append(pickWrap)
    // (your account, invites and sign-in live in their own tab on the right: the left side is just you)
  }
  const setLook = (look: Look) => {
    save.look = look
    persist()
    world.player.setLook(look)
    drawLeft()
  }

  let slot: Slot | 'all' = 'all'
  const drawItems = () => {
    right.innerHTML = ''
    const tabs = el('div', 'pc-tabs')
    const mk = (id: Slot | 'all', label: string) => {
      const b = el('button', 'pc-tab' + (slot === id ? ' on' : ''), label)
      b.onclick = () => {
        sfx.click()
        slot = id
        drawItems()
      }
      tabs.append(b)
    }
    mk('all', 'All')
    SLOTS.forEach((s) => mk(s, SLOT_LABEL[s]))
    const lookBtn = el('button', 'pc-tab look', 'Edit look ✂️')
    lookBtn.onclick = () => {
      sfx.click()
      drawLook()
    }
    tabs.append(lookBtn)
    if (link.account) {
      const acctBtn = el('button', 'pc-tab acct', 'Account')
      acctBtn.onclick = () => {
        sfx.click()
        drawAccount()
      }
      tabs.append(acctBtn)
    }
    right.append(tabs)
    const grid = el('div', 'pc-grid')
    const owned = save.owned.filter((id) => ITEM[id] && (slot === 'all' || ITEM[id].slot === slot))
    owned.sort((a, b) => SLOTS.indexOf(ITEM[a].slot) - SLOTS.indexOf(ITEM[b].slot))
    for (const id of owned) {
      const def = ITEM[id]
      const worn = save.look.items[def.slot] === id
      const b = el('button', 'pc-item' + (worn ? ' worn' : ''), `${itemIcon(id, save.look.color)}<span>${def.name}</span>`)
      b.title = worn ? 'Click to take off' : 'Click to wear'
      b.onclick = () => {
        sfx.pop()
        const items = { ...save.look.items }
        // you always keep something on (no undressing to the void) for tops/bottoms/shoes
        if (worn && !['body', 'legs', 'feet'].includes(def.slot)) delete items[def.slot]
        else items[def.slot] = id
        setLook({ ...save.look, items })
        drawItems()
      }
      grid.append(b)
    }
    if (!owned.length) grid.append(el('p', 'muted', 'Nothing here yet. The shops around town have plenty.'))
    right.append(grid)
  }

  const drawLook = () => {
    right.innerHTML = ''
    const back = el('button', 'pc-tab', '← Back to items')
    back.onclick = () => {
      sfx.click()
      drawItems()
    }
    right.append(back, lookEditor(() => save.look, setLook))
  }
  const drawAccount = () => {
    right.innerHTML = ''
    const back = el('button', 'pc-tab', '← Back to items')
    back.onclick = () => {
      sfx.click()
      drawItems()
    }
    const pane = el('div', 'pc-acct-pane', '<h3>Your account</h3>')
    pane.append(accountRow())
    right.append(back, pane)
  }
  drawLeft()
  if (tab === 'look') drawLook()
  else drawItems()
  openOverlay(card)
}

export const openWardrobe = () => openPlayerCard('items')

/** skin / hair / hair colour pickers (shared with the creator) */
export function lookEditor(get: () => Look, set: (l: Look) => void, o: { colour?: boolean } = {}): HTMLElement {
  const box = el('div', 'look-editor')
  const row = (title: string, opts: string[], cur: () => number, pick: (i: number) => void, swatch: (i: number) => string, order = opts.map((_, i) => i)) => {
    const r = el('div', 'le-row', `<h4>${title}</h4>`)
    const list = el('div', 'le-opts')
    order.forEach((i) => {
      const b = el('button', 'le-opt' + (cur() === i ? ' on' : ''), swatch(i))
      b.dataset.i = String(i)
      b.onclick = () => {
        sfx.pop()
        pick(i)
        list.querySelectorAll<HTMLElement>('.le-opt').forEach((x) => x.classList.toggle('on', x.dataset.i === String(i)))
      }
      list.append(b)
    })
    r.append(list)
    box.append(r)
  }
  row('Skin', SKINS, () => get().skin, (i) => set({ ...get(), skin: i }), (i) => `<i style="background:${SKINS[i]}"></i>`, SKIN_ORDER)
  row('Hair', HAIR_STYLES, () => HAIR_STYLES.indexOf(get().hair), (i) => set({ ...get(), hair: HAIR_STYLES[i] }), (i) =>
    `<span class="hair-thumb">${avatarPortraitHead({ ...get(), hair: HAIR_STYLES[i], items: {} })}</span>`)
  row('Hair color', HAIR_COLORS, () => get().hairColor, (i) => set({ ...get(), hairColor: i }), (i) => `<i style="background:${HAIR_COLORS[i]}"></i>`)
  if (o.colour === false) return box
  // your signature colour: the Signature Hoodie (and anything else marked `signature`) wears it
  const sigName = () => SIG_COLORS[get().color ?? 5]?.name ?? ''
  row('Your color', SIG_COLORS.map((c) => c.hex), () => get().color ?? 5, (i) => {
    set({ ...get(), color: i })
    const h = box.querySelector('.le-row.sig h4')
    if (h) h.innerHTML = `Your color <b>${SIG_COLORS[i].name}</b>`
  }, (i) => `<i class="sig" style="background:${SIG_COLORS[i].hex}" title="${SIG_COLORS[i].name}"></i>`)
  const last = box.lastElementChild as HTMLElement
  last.classList.add('sig')
  last.querySelector('h4')!.innerHTML = `Your color <b>${sigName()}</b>`
  return box
}

function avatarPortraitHead(look: Look) {
  // reuse the portrait, cropped to the head
  return avatarPortrait(look, 'smile').replace(/viewBox="[^"]+"/, 'viewBox="-42 -150 84 84"')
}

/** Click anyone: real players get the multiplayer card, city locals the classic one. */
export function playerCardFor(a: Actor) {
  return a.remote ? remoteCard(a) : npcCard(a)
}

/** Other people's cards: who they are, their style, and what you can do together. */
export function npcCard(a: Actor) {
  if (a.remote) return remoteCard(a)
  sfx.click()
  const r = a.resident
  const card = el('div', 'player-card npc')
  const items = Object.values(a.look.items).filter(Boolean) as string[]
  const team = r ? TEAMS[r.team] : null
  const friend = r ? isFriend(r.id) : false
  card.innerHTML = `<div class="pc-left"><div class="pc-portrait">${avatarPortrait(a.look)}</div><div class="pc-name">${a.name}${friend ? ' ★' : ''}</div>
      ${team ? `<span class="pc-team" style="background:${team.color};color:${teamText(team)}">${team.emoji} ${team.name}</span>` : ''}
      ${r ? `<div class="pc-bio">${r.title ? `<b>${r.title}</b> · ` : ''}${r.bio}</div>` : ''}
      ${link.account ? '<span class="pc-local">City local · computer-run</span>' : ''}</div>
    <div class="pc-right"><h3>Their style</h3><div class="pc-grid small">${items
      .map((id) => {
        const d = ITEM[id]
        if (!d) return ''
        const where = d.shop ? SHOPS[d.shop]?.name ?? 'around town' : d.reward ? 'earned, not bought' : 'a classic'
        return `<div class="pc-item ${save.owned.includes(id) ? 'worn' : ''}">${itemIcon(id, save.look.color)}<span>${d.name}</span><small>${save.owned.includes(id) ? 'You own this' : where}</small></div>`
      })
      .join('')}</div></div>`
  const actions = el('div', 'pc-actions')
  const btn = (html: string, cls: string, fn: () => void) => {
    const b = el('button', 'btn small ' + cls, html)
    b.onclick = fn
    actions.append(b)
  }
  btn('👋 Wave', 'ghost', () => {
    world.player.emote('wave', 2)
    a.emote('wave', 2)
    a.say(['Hey!', 'Hi there! 👋', 'Love your outfit!', 'Welcome to the city!'][Math.floor(Math.random() * 4)])
    if (r) import('../social/friends').then((m) => m.bond(r.id, 1))
  })
  if (r && !friend)
    btn('➕ Add Friend', 'go', () =>
      import('../social/community').then((m) => {
        closeOverlay()
        m.addFriendFlow(r)
      }),
    )
  if (r)
    btn('🏠 Visit their place', 'ghost', () => {
      closeOverlay()
      import('./apartment').then((m) => m.visitApartment(r.id))
    })
  if (r && friend)
    btn('⚔️ Challenge', 'ghost', () => {
      closeOverlay()
      import('../social/community').then((m) => m.openCommunity('boards'))
    })
  card.querySelector('.pc-right')!.append(actions)
  card.append(closeButton())
  openOverlay(card)
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function styleGrid(look: Look) {
  const items = Object.values(look.items).filter(Boolean) as string[]
  return items
    .map((id) => {
      const d = ITEM[id]
      if (!d) return ''
      const where = d.shop ? SHOPS[d.shop]?.name ?? 'around town' : d.reward ? 'earned, not bought' : 'a classic'
      return `<div class="pc-item ${save.owned.includes(id) ? 'worn' : ''}">${itemIcon(id, save.look.color)}<span>${d.name}</span><small>${save.owned.includes(id) ? 'You own this' : where}</small></div>`
    })
    .join('')
}

/** A real player's card: friend them, visit their place, or mute / block / report. */
export function remoteCard(a: Actor) {
  const rem = a.remote!
  const id = rem.id
  sfx.click()
  const team = TEAMS[rem.team as TeamId]
  const title = titleName(rem.title)
  const card = el('div', 'player-card npc remote')
  card.innerHTML = `<div class="pc-left"><div class="pc-portrait">${avatarPortrait(a.look)}</div><div class="pc-name">${esc(a.name)}${link.friends.has(id) ? ' ★' : ''}</div>
      ${team ? `<span class="pc-team" style="background:${team.color};color:${teamText(team)}">${team.emoji} ${team.name}</span>` : ''}
      ${title ? `<div class="pc-bio"><b>${title}</b></div>` : ''}
      <div class="pc-meta"><span class="pc-live">● Here now</span></div></div>
    <div class="pc-right"><h3>Their style</h3><div class="pc-grid small">${styleGrid(a.look)}</div></div>`
  const actions = el('div', 'pc-actions')
  const safety = el('div', 'pc-safety')
  card.querySelector('.pc-right')!.append(actions, safety)
  card.append(closeButton())
  openOverlay(card)

  const btn = (where: HTMLElement, html: string, cls: string, fn: () => void, disabled = false) => {
    const b = el('button', 'btn small ' + cls, html)
    b.disabled = disabled
    b.onclick = () => {
      sfx.click()
      fn()
    }
    where.append(b)
    return b
  }
  const draw = async () => {
    const mp = await import('../net/multiplayer')
    let info: PlayerPlace | null = null
    try {
      info = await rest<PlayerPlace>(`/users/${id}`)
    } catch {
      /* still show the basics */
    }
    if (!card.isConnected) return
    if (info) {
      const since = new Date(info.user.memberSince + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      card.querySelector('.pc-meta')!.innerHTML = `<span class="pc-live">● Here now</span><span>New Yorker since ${since}</span><span>❤️ ${info.likes} · 🏠 ${info.furniture.length} things</span>`
    }
    actions.innerHTML = ''
    safety.innerHTML = ''
    btn(actions, '👋 Wave', 'ghost', () => {
      world.player.emote('wave', 2)
      void import('./chat').then((m) => m.emoteBubble('👋'))
    })
    const rel = info?.friend ?? (link.friends.has(id) ? 'friends' : 'none')
    if (rel === 'none') btn(actions, '➕ Add Friend', 'go', () => void mp.addFriend(id, a.name).then(draw))
    if (rel === 'requested') actions.append(el('span', 'pc-status', '⏳ Friend request sent'))
    if (rel === 'incoming') btn(actions, '✓ Accept friend request', 'go', () => void mp.acceptFriend(id).then(draw))
    if (rel === 'friends') actions.append(el('span', 'pc-status', '★ You’re friends'))
    // always offered: friends (or anyone during an open house) go in; otherwise the door explains why it's closed
    btn(actions, '🏠 Visit their place', 'ghost', () => {
      closeOverlay()
      void import('./apartment').then((m) => m.visitPlayerApartment(id))
    })
    const muted = mp.mp.muted.has(id)
    btn(safety, muted ? '🔈 Unmute' : '🔇 Mute', 'tiny', () => {
      mp.toggleMute(id, a.name)
      void draw()
    })
    btn(safety, '🚫 Block', 'tiny', async () => {
      const { choose } = await import('../engine/ui')
      const yes = await choose(`Block ${esc(a.name)}?`, 'You won’t see them, their chat, or friend requests from them. They won’t be told.', [
        { label: 'Block', value: true },
        { label: 'Cancel', value: false },
      ])
      if (yes) void mp.block(id, a.name)
    })
    btn(safety, '🚩 Report', 'tiny', async () => {
      const { choose } = await import('../engine/ui')
      const reason = await choose(`Report ${esc(a.name)}`, 'What’s going on? Moderators see this report and their recent chat.', [
        { label: 'Mean or bullying', value: 'bullying' },
        { label: 'Inappropriate chat', value: 'chat' },
        { label: 'Inappropriate name or outfit', value: 'name' },
        { label: 'Asking for personal info', value: 'personal-info' },
        { label: 'Something else', value: 'other' },
      ])
      if (reason) void mp.report(id, a.name, reason)
    })
    if (rel === 'friends')
      btn(safety, 'Unfriend', 'tiny', () => {
        void mp.removeFriend(id).then(() => {
          refreshTag(a)
          void draw()
        })
      })
  }
  void draw()
}

/** Your account: guests can attach Google / X so their New Yorker follows them anywhere. */
function accountRow(): HTMLElement {
  const box = el('div', 'pc-account')
  void (async () => {
    const { account, signOut } = await import('../net/session')
    const me = account.me
    if (!me) return
    const linked = me.providers.filter((p) => p !== 'guest')
    const label = (p: string) => (p === 'google' ? 'Google' : p === 'x' ? 'X' : p === 'discord' ? 'Discord' : p)
    const week = Math.max(me.week ?? 0, save.week?.start === weekStart(nycDay()) ? save.week.days : 0)
    if (me.memberNo)
      box.append(
        el('div', 'pc-member', `New Yorker <b>No. ${String(me.memberNo).padStart(4, '0')}</b>${week >= 2 ? ` · <em>📅 ${week} of 7 days this week</em>` : ''}`),
      )
    const row = el('div', 'pc-acct-row')
    box.append(row)
    if (linked.length) {
      row.append(el('span', 'pc-acct-ok', `✓ Saved with ${linked.map(label).join(' & ')}`))
      const out = el('button', 'btn tiny', 'Sign out')
      out.onclick = () => void signOut()
      row.append(out)
    } else {
      const note = el('span', 'pc-acct-guest', 'Guest account. Link one to keep your New Yorker on any device:')
      row.append(note)
      let providers = { google: false, x: false, discord: false }
      try {
        providers = await rest('/auth/providers')
      } catch {
        /* buttons stay disabled */
      }
      // no sign-in switched on (or unreachable): say what a guest account means instead of offering nothing
      if (!import.meta.env.DEV && !providers.google && !providers.x && !providers.discord)
        note.textContent = 'Guest account: your New Yorker is saved to this browser. Sign-in options are coming soon.'
      for (const p of ['google', 'x', 'discord'] as const) {
        if (!providers[p] && !import.meta.env.DEV) continue
        const b = el('button', 'btn tiny link-' + p, `Link ${label(p)}`)
        b.disabled = !providers[p]
        if (!providers[p]) b.title = 'Not set up on this server yet'
        b.onclick = () => (location.href = `/api/auth/${p}`)
        row.append(b)
      }
    }
    const extras = el('div', 'pc-acct-row')
    const inv = el('button', 'btn tiny go', '💌 Invite friends')
    inv.onclick = () => void import('./invite').then((m) => m.openInvite())
    const del = el('button', 'btn tiny ghost pc-delete', 'Delete account…')
    del.onclick = () => void deleteAccount(me.name)
    extras.append(inv, del)
    box.append(extras)
  })()
  return box
}

/** Leaving for good: type your name to confirm, and everything is removed. */
async function deleteAccount(name: string) {
  const p = el('div', 'panel', `<div class="panel-art">🗑️</div><h2>Delete your account?</h2>
    <p>This permanently removes <b>${esc(name)}</b>: your New Yorker, coins, wardrobe, apartment, friends and scores. It can’t be undone.</p>
    <p class="muted">Type your name to confirm.</p>`)
  const input = document.createElement('input')
  input.className = 'name-input'
  input.placeholder = name
  input.onkeydown = (e) => e.stopPropagation()
  const go = el('button', 'btn danger', 'Delete forever')
  go.disabled = true
  input.oninput = () => (go.disabled = input.value.trim() !== name)
  go.onclick = async () => {
    go.disabled = true
    go.textContent = 'Deleting…'
    try {
      await rest('/me', { method: 'DELETE' })
      resetSave()
    } catch {
      go.textContent = 'Couldn’t reach the city. Try again'
      go.disabled = false
    }
  }
  const keep = el('button', 'btn ghost', 'Keep my account')
  keep.onclick = () => closeOverlay()
  p.append(input, go, keep, closeButton())
  openOverlay(p)
  setTimeout(() => input.focus({ preventScroll: true }), 200)
}
