import { sfx } from '../audio'
import { save, persist, resetSave } from '../state'
import { ITEM, SHOPS } from '../avatar/items'
import { SLOTS, SLOT_LABEL, SKINS, SKIN_ORDER, SIG_COLORS, HAIR_COLORS, HAIR_STYLES, FACE_SHAPES, EYE_COLORS, EYE_COLOR_NAMES, BROWS, NOSES, BEARDS, SPECS, type Look, type Slot } from '../avatar/look'
import { avatarPortrait, itemIcon, partThumb, type Part } from '../avatar/render'
import { el } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton } from '../engine/ui'
import { world } from '../engine/world'
import type { Actor } from '../engine/actor'
import { TEAMS, teamText, type TeamId } from '../social/teams'
import { isFriend } from '../social/friends'
import { refreshTag } from '../engine/world'
import { myLevel } from '../social/levels'
import { levelOf } from '../data/levels'
import { STAMPS } from '../data/stamps'
import { nycDay, weekStart } from '../data/economy'
import { link } from '../net/link'
import { rest } from '../net/server'
import type { PlayerPlace } from './apartment'

/** Club Penguin–style player card: you on the left, your stuff on the right. */
export function openPlayerCard(tab: 'items' | 'look' | 'account' = 'items') {
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
    // your level and title come from XP (everything you do in the city earns it); titles aren't picked any more
    const l = myLevel()
    left.append(
      el(
        'div',
        'pc-level',
        `<div class="pc-level-head"><b>${l.title}</b><span>Level ${l.level}</span></div>` +
          `<div class="pc-level-bar" role="progressbar" aria-valuemin="${l.floor}" aria-valuemax="${l.next}" aria-valuenow="${l.xp}"><i style="width:${Math.round(l.progress * 100)}%"></i></div>` +
          `<small>${(l.next - l.xp).toLocaleString('en-US')} XP to Level ${l.level + 1}: ${l.nextTitle}</small>`,
      ),
    )
    // (your account, invites and sign-in live in the Account tab on the right: the left side is just you)
  }
  const setLook = (look: Look) => {
    save.look = look
    persist()
    world.player.setLook(look)
    drawLeft()
  }

  // the right side: three tabs (your wardrobe, your look, your account) over whichever one is open
  let view = tab
  let slot: Slot | 'all' = 'all'
  const drawRight = () => {
    right.innerHTML = ''
    const views = el('div', 'pc-views')
    const mkView = (id: typeof view, label: string) => {
      const b = el('button', 'pc-view' + (view === id ? ' on' : ''), label)
      b.onclick = () => {
        sfx.click()
        view = id
        drawRight()
      }
      views.append(b)
    }
    mkView('items', 'Wardrobe')
    mkView('look', 'Look')
    if (link.account) mkView('account', 'Account')
    right.append(views)
    if (view === 'look') right.append(lookEditor(() => save.look, setLook))
    else if (view === 'account') {
      const pane = el('div', 'pc-acct-pane')
      pane.append(accountRow())
      right.append(pane)
    } else drawItems()
  }
  const drawItems = () => {
    const tabs = el('div', 'pc-tabs')
    const mk = (id: Slot | 'all', label: string) => {
      const b = el('button', 'pc-tab' + (slot === id ? ' on' : ''), label)
      b.onclick = () => {
        sfx.click()
        slot = id
        drawRight()
      }
      tabs.append(b)
    }
    mk('all', 'All')
    SLOTS.forEach((s) => mk(s, SLOT_LABEL[s]))
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
        drawRight()
      }
      grid.append(b)
    }
    if (!owned.length) grid.append(el('p', 'muted', 'Nothing here yet. Very minimalist. The shops around town can fix that.'))
    right.append(grid)
  }
  drawLeft()
  drawRight()
  openOverlay(card)
  // the left side can change while the card is open (a level-up, coins from a quest, a new stamp): keep it current
  const shown = () => `${save.coins}|${save.stamps.length}|${save.friends.length}|${save.xp ?? 0}|${save.team}`
  let last = shown()
  const live = window.setInterval(() => {
    if (!card.isConnected) return clearInterval(live)
    if (shown() === last) return
    last = shown()
    drawLeft()
  }, 800)
}

export const openWardrobe = () => openPlayerCard('items')

/**
 * The look pickers (shared with the creator), in tabs so no screen is a wall of options:
 * Basics (skin, hair colour, your colour), Hair, Face (shape, eyes, brows, nose), Extras (glasses, facial hair,
 * freckles, lashes). Each tile shows only the thing you're choosing (a hairstyle, a pair of glasses), drawn big.
 * After a photo, a first Quick Fix tab gathers what a camera most often gets wrong, with the reader's guesses.
 */
const NONE = '<svg viewBox="0 0 40 40" class="part-thumb none"><circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12.5 27.5 L27.5 12.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'
export function lookEditor(get: () => Look, set: (l: Look) => void, o: { colour?: boolean; near?: { skin: number[]; hair: string[]; hairColor: number[] } } = {}): HTMLElement {
  const TABS = [...(o.near ? ['Quick Fix'] : []), 'Basics', 'Hair', 'Face', 'Extras']
  const box = el('div', 'look-editor')
  const tabs = el('div', 'le-tabs')
  const body = el('div', 'le-body')
  box.append(tabs, body)
  let tab = TABS[0]
  const row = (title: string, n: number, cur: number, pick: (i: number) => void, draw: (i: number) => string, order = Array.from({ length: n }, (_, i) => i), cls = ''): void => {
    const r = el('div', 'le-row', `<h4>${title}</h4>`)
    const list = el('div', 'le-opts')
    order.forEach((i) => {
      const b = el('button', `le-opt ${cls}` + (cur === i ? ' on' : ''), draw(i))
      b.dataset.i = String(i)
      b.onclick = () => {
        sfx.pop()
        pick(i)
        // tiles are drawn in your colours, so one change redraws them (the scroll stays where it was)
        paint()
      }
      list.append(b)
    })
    r.append(list)
    body.append(r)
  }
  const swatch = (hex: string, cls = '', title = '') => `<i class="${cls}" style="background:${hex};--c:${hex}"${title ? ` title="${title}"` : ''}></i>`
  /** a row of tiles that each show one part (the first choice of an on/off or "None" row is a plain "none" mark) */
  const partRow = (title: string, key: 'shape' | 'brows' | 'nose' | 'beard' | 'specs' | 'freckles' | 'lashes', names: readonly string[], none = false) =>
    row(
      title,
      names.length,
      // your own glasses and a shop pair don't stack: with a shop pair on, neither tile is lit
      key === 'specs' && get().items.face ? -1 : (get()[key] ?? 0),
      // choosing glasses here (even None) takes a shop pair off
      (i) => set(key === 'specs' ? { ...get(), specs: i, items: { ...get().items, face: undefined } } : { ...get(), [key]: i }),
      (i) => (none && i === 0 ? NONE : partThumb({ ...get(), [key]: i, items: {} }, key as Part)),
      undefined,
      'part',
    )
  const skinRow = () => row('Skin', SKINS.length, get().skin, (i) => set({ ...get(), skin: i }), (i) => swatch(SKINS[i], 'big'), SKIN_ORDER)
  const hairRow = (only?: number[]) => row('Hair', HAIR_STYLES.length, HAIR_STYLES.indexOf(get().hair), (i) => set({ ...get(), hair: HAIR_STYLES[i] }), (i) => partThumb({ ...get(), hair: HAIR_STYLES[i] }, 'hair'), only, 'part')
  const paint = () => {
    const l = get()
    const top = body.scrollTop
    body.innerHTML = ''
    // short rows sit side by side
    body.classList.toggle('flow', tab !== 'Basics' && tab !== 'Hair')
    tabs.querySelectorAll('.le-tab').forEach((t) => t.classList.toggle('on', t.textContent === tab))
    if (tab === 'Quick Fix' && o.near) {
      skinRow()
      hairRow([...new Set([...o.near.hair, l.hair])].map((h) => HAIR_STYLES.indexOf(h as Look['hair'])))
      partRow('Glasses', 'specs', SPECS, true)
      partRow('Facial hair', 'beard', BEARDS, true)
    } else if (tab === 'Basics') {
      skinRow()
      row('Hair color', HAIR_COLORS.length, l.hairColor, (i) => set({ ...get(), hairColor: i }), (i) => swatch(HAIR_COLORS[i], 'big'))
      // your signature colour: the Signature Hoodie (and anything else marked `signature`) wears it
      if (o.colour !== false) row('Your color', SIG_COLORS.length, l.color ?? 5, (i) => set({ ...get(), color: i }), (i) => swatch(SIG_COLORS[i].hex, 'big sig', SIG_COLORS[i].name))
    } else if (tab === 'Hair') {
      hairRow()
    } else if (tab === 'Face') {
      partRow('Face shape', 'shape', FACE_SHAPES)
      partRow('Nose', 'nose', NOSES)
      row('Eyes', EYE_COLORS.length, l.eyes ?? 0, (i) => set({ ...get(), eyes: i }), (i) => swatch(EYE_COLORS[i], 'big eye', EYE_COLOR_NAMES[i]))
      partRow('Brows', 'brows', BROWS)
    } else {
      partRow('Facial hair', 'beard', BEARDS, true)
      partRow('Glasses', 'specs', SPECS, true)
      partRow('Freckles', 'freckles', ['Off', 'On'], true)
      partRow('Lashes', 'lashes', ['Off', 'On'], true)
    }
    body.scrollTop = top
  }
  TABS.forEach((name) => {
    const t = el('button', 'le-tab', name)
    t.onclick = () => {
      if (tab === name) return
      sfx.click()
      tab = name
      paint()
      body.scrollTop = 0
    }
    tabs.append(t)
  })
  paint()
  return box
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
      ${r ? `<div class="pc-bio">${r.title ? `<b>${r.title}</b><br>` : ''}${r.bio}</div>` : ''}
      ${link.account ? '<span class="pc-local">Computer-run local</span>' : ''}</div>
    <div class="pc-right"><h3>Their Style</h3><div class="pc-grid small">${items
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
  const card = el('div', 'player-card npc remote')
  card.innerHTML = `<div class="pc-left"><div class="pc-portrait">${avatarPortrait(a.look)}</div><div class="pc-name">${esc(a.name)}${link.friends.has(id) ? ' ★' : ''}</div>
      ${team ? `<span class="pc-team" style="background:${team.color};color:${teamText(team)}">${team.emoji} ${team.name}</span>` : ''}
      <span class="pc-level-chip" hidden></span>
      <div class="pc-meta"><span class="pc-live">● Here now</span></div></div>
    <div class="pc-right"><h3>Their Style</h3><div class="pc-grid small">${styleGrid(a.look)}</div></div>`
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
      // their level and title (from their XP, which the server keeps)
      const l = levelOf(info.user.xp ?? 0)
      const chip = card.querySelector<HTMLElement>('.pc-level-chip')!
      chip.innerHTML = `<b>${l.level}</b>${l.title}`
      chip.title = `Level ${l.level}`
      chip.hidden = false
      const since = new Date(info.user.memberSince + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      card.querySelector('.pc-meta')!.innerHTML = `<span class="pc-live">● Here now</span>${info.user.founder ? '<span class="pc-founder" title="Here before the city opened">Founder</span>' : ''}<span>New Yorker since ${since}</span><span>❤️ ${info.likes}</span><span>🏠 ${info.furniture.length}</span>`
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
        { label: 'Mean or Bullying', value: 'bullying' },
        { label: 'Inappropriate Chat', value: 'chat' },
        { label: 'Inappropriate Name or Outfit', value: 'name' },
        { label: 'Asking for Personal Info', value: 'personal-info' },
        { label: 'Something Else', value: 'other' },
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

/** Your account: guests can attach Google / X / Discord / their email so their New Yorker follows them anywhere. */
function accountRow(): HTMLElement {
  const box = el('div', 'pc-account')
  void (async () => {
    const { account, signOut } = await import('../net/session')
    const me = account.me
    if (!me) return
    const linked = me.providers.filter((p) => p !== 'guest')
    const label = (p: string) => (p === 'google' ? 'Google' : p === 'x' ? 'X' : p === 'discord' ? 'Discord' : p === 'email' ? 'Email' : p)
    const week = Math.max(me.week ?? 0, save.week?.start === weekStart(nycDay()) ? save.week.days : 0)
    if (me.memberNo)
      box.append(
        el('div', 'pc-member', `New Yorker <b>No. ${String(me.memberNo).padStart(4, '0')}</b>${me.founder ? ' <span class="pc-founder" title="Here before the city opened">Founder</span>' : ''}${week >= 2 ? ` <em>📅 ${week}/7</em>` : ''}`),
      )
    const row = el('div', 'pc-acct-row')
    box.append(row)
    if (linked.length) {
      row.append(el('span', 'pc-acct-ok', `✓ Saved with ${linked.map(label).join(' & ')}`))
      const out = el('button', 'btn tiny', 'Sign Out')
      out.onclick = () => void signOut()
      row.append(out)
    } else {
      const note = el('span', 'pc-acct-guest', 'Guest account. Link one to keep your New Yorker on any device:')
      row.append(note)
      let providers = { google: false, x: false, discord: false, email: false }
      try {
        providers = await rest('/auth/providers')
      } catch {
        /* buttons stay disabled */
      }
      // no sign-in switched on (or unreachable): say what a guest account means instead of offering nothing
      if (!import.meta.env.DEV && !providers.google && !providers.x && !providers.discord && !providers.email)
        note.textContent = 'Guest account: your New Yorker is saved to this browser.'
      for (const p of ['google', 'x', 'discord'] as const) {
        if (!providers[p] && !import.meta.env.DEV) continue
        const b = el('button', 'btn tiny link-' + p, `Link ${label(p)}`)
        b.disabled = !providers[p]
        if (!providers[p]) b.title = 'Not set up on this server yet'
        b.onclick = () => (location.href = `/api/auth/${p}`)
        row.append(b)
      }
      // email: a one-time link to your inbox links it to this New Yorker (features/accountEmail.ts)
      if (providers.email) {
        const b = el('button', 'btn tiny link-email', 'Link Email')
        b.onclick = () => void import('./accountEmail').then((m) => m.openLinkEmail(box, row, me.name))
        row.append(b)
      }
    }
    const extras = el('div', 'pc-acct-row')
    const inv = el('button', 'btn tiny go', '💌 Invite Friends')
    inv.onclick = () => void import('./invite').then((m) => m.openInvite())
    const del = el('button', 'btn tiny ghost pc-delete', 'Delete Account…')
    del.onclick = () => void deleteAccount(me.name)
    extras.append(inv, del)
    box.append(extras)
  })()
  return box
}

/** Leaving for good: type your name to confirm, and everything is removed. */
async function deleteAccount(name: string) {
  const p = el('div', 'panel', `<div class="panel-art">🗑️</div><h2>Delete Your Account?</h2>
    <p>This permanently removes <b>${esc(name)}</b>: your New Yorker, coins, wardrobe, apartment, friends and scores. It can’t be undone.</p>
    <p class="muted">Type your name to confirm.</p>`)
  const input = document.createElement('input')
  input.className = 'name-input'
  input.placeholder = name
  input.onkeydown = (e) => e.stopPropagation()
  const go = el('button', 'btn danger', 'Delete Forever')
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
  const keep = el('button', 'btn ghost', 'Keep My Account')
  keep.onclick = () => closeOverlay()
  p.append(input, go, keep, closeButton())
  openOverlay(p)
  setTimeout(() => input.focus({ preventScroll: true }), 200)
}
