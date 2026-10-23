import { sfx } from '../audio'
import { save } from '../state'
import { Actor } from '../engine/actor'
import { world, onRoomBuilt, refreshTag, trimLocals, removeActor, goto, walkTo } from '../engine/world'
import { el, stage } from '../engine/stage'
import { toast, notify, openOverlay, closeOverlay } from '../engine/ui'
import { ROOMS } from '../data/rooms'
import type { Look } from '../avatar/look'
import type { Pose } from '../avatar/render'
import { logLine, onChatName } from '../features/chat'
import { apartmentHost, visitPlayerApartment } from '../features/apartment'
import { applyParty, invited } from '../features/houseparty'
import { isHomeRoom } from '../data/homes'
import { sock } from './socket'
import { link } from './link'
import { rest, HttpError, type PublicUser, type Presence } from './server'
import { applyWallet } from './wallet'
import { account } from './session'
import type { PlayerWire, S2C } from './protocol'

/**
 * Multiplayer glue: server events become people in the room, and the people in the room become
 * friends, chats and visits. Remote players are ordinary Actors (so hover, click, depth sorting,
 * seats and snowballs all just work) whose walks are driven by the network instead of npcThink.
 */
export interface Friend extends PublicUser, Presence {}

export const mp = {
  players: new Map<string, Actor>(),
  friends: new Map<string, Friend>(),
  incoming: new Map<string, PublicUser>(),
  outgoing: new Set<string>(),
  blocked: new Set<string>(),
  /** muted for this session: their bubbles and chat lines are hidden */
  muted: new Set<string>(),
  /** which copy of the room we're in ("Times Square 2" when the first is full) */
  inst: 0,
  online: 0,
  /** UI that lists people re-renders when this fires */
  listeners: [] as (() => void)[],
}
const changed = () => mp.listeners.forEach((f) => f())
export const onPeopleChange = (f: () => void) => {
  mp.listeners.push(f)
  return () => {
    const i = mp.listeners.indexOf(f)
    if (i >= 0) mp.listeners.splice(i, 1)
  }
}

const roomName = (id: string | null) => (id ? ROOMS[id]?.name ?? id : '')
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// ---------- the "who's online" pill ----------
const pill = el('button', 'online-pill')
pill.title = 'Who’s in the city'
pill.onclick = (e) => {
  e.stopPropagation()
  sfx.click()
  void import('../social/community').then((m) => m.openCommunity('city'))
}
function renderPill(state: 'on' | 'connecting' | 'off') {
  pill.className = 'online-pill ' + state
  pill.innerHTML =
    state === 'on'
      ? `<i></i><b>${mp.online}</b>&nbsp;${mp.online === 1 ? 'New Yorker' : 'New Yorkers'} online${mp.inst > 1 ? `<em>Room ${mp.inst}</em>` : ''}`
      : state === 'connecting'
        ? '<i></i>Reconnecting…'
        : '<i></i>Offline'
}

// ---------- remote people ----------
/** how long a pose holds when someone else does it (matches the toolbar) */
const HOLD: Record<string, number> = { dance: 0, wave: 3, cheer: 3, jump: 0, sit: 6 }

function applyPose(a: Actor, p: string) {
  if (p === 'idle') return void (a.held = null)
  if (!(p in HOLD) || a.seat) return
  // our copy of their walk can be a beat behind theirs: dance once we've arrived too
  if (a.moving) {
    const then = a.onArrive
    a.onArrive = () => {
      then?.()
      a.emote(p as Pose, HOLD[p])
    }
  } else a.emote(p as Pose, HOLD[p])
}

function sitRemote(a: Actor, id: string | null, retry = true) {
  if (!id) return void (a.seat && a.standUp())
  const seat = world.seats.find((s) => s.id === id)
  if (!seat) {
    // apartment furniture seats appear once the furniture images load
    if (retry) setTimeout(() => a.wrap.isConnected && sitRemote(a, id, false), 800)
    return
  }
  const sit = () => {
    if (world.player.seat?.id === id) return
    const taken = world.npcs.find((o) => o !== a && o.seat?.id === id)
    if (taken?.remote) return
    if (taken) {
      // a city local scoots over for a real person
      taken.standUp()
      taken.next = 0
    }
    a.sitOn(seat)
  }
  if (a.moving) a.onArrive = sit
  else sit()
}

function spawn(p: PlayerWire, arriving = false) {
  if (p.i === link.me || mp.blocked.has(p.i) || !world.nav) return
  const old = mp.players.get(p.i)
  if (old) removeActor(old)
  const a = new Actor(p.l as Look, p.n, world.nav.nearest([p.x, p.y]))
  a.remote = { id: p.i, team: p.t, title: p.ti }
  a.wrap.classList.add('remote')
  if (arriving) a.wrap.classList.add('arrive')
  refreshTag(a)
  world.npcs.push(a)
  stage.scene.append(a.wrap)
  mp.players.set(p.i, a)
  if (p.s) sitRemote(a, p.s)
  else if (p.p && p.p !== 'idle') applyPose(a, p.p)
}

function despawn(id: string, animate = true) {
  const a = mp.players.get(id)
  if (!a) return
  mp.players.delete(id)
  if (!animate) return removeActor(a)
  world.npcs = world.npcs.filter((n) => n !== a)
  a.wrap.classList.add('depart')
  a.overhead.classList.add('depart') // their name tag fades out with them
  setTimeout(() => (a.wrap.remove(), a.overhead.remove()), 380)
}

function clearPlayers() {
  for (const id of [...mp.players.keys()]) despawn(id, false)
}

// ---------- joining rooms ----------
let expect: { room: string; key: string } | null = null

function join() {
  if (!sock.connected) return
  const room = world.room.id
  const o = isHomeRoom(room) ? apartmentHost() : undefined
  expect = { room, key: isHomeRoom(room) ? `${room}@${o ?? link.me}` : room }
  clearPlayers()
  const [x, y] = world.player.pos
  sock.send({ t: 'j', r: room, x: Math.round(x), y: Math.round(y), o })
}

/** Arrived standing on someone? Take a couple of steps aside, like a person would. */
function makeRoom() {
  const me = world.player
  if (me.seat || me.moving || !world.nav) return
  const crowded = [...mp.players.values()].some((a) => Math.abs(a.pos[0] - me.pos[0]) < 34 && Math.abs(a.pos[1] - me.pos[1]) < 20)
  if (!crowded) return
  const dir = Math.random() < 0.5 ? -1 : 1
  setTimeout(() => !me.moving && walkTo(world.nav!.nearest([me.pos[0] + dir * (50 + Math.random() * 40), me.pos[1] + (Math.random() - 0.5) * 30])), 500)
}

/** Hop into whichever copy of this room your friend is in. */
export function rejoin() {
  join()
}

// ---------- chat ----------
function chatFrom(id: string, text: string) {
  if (id === link.me) {
    // our own line, exactly as everyone else received it (after the server's filter)
    if (world.player.said !== text) world.player.say(text)
    logLine({ name: save.name, text, kind: 'me', team: save.team })
    return
  }
  if (mp.muted.has(id)) return
  const a = mp.players.get(id)
  if (!a) return
  a.say(text)
  logLine({ name: a.name, text, id, team: a.remote?.team, kind: 'chat' })
}

// ---------- friends ----------
export async function refreshFriends() {
  try {
    const r = await rest<{ friends: Friend[]; incoming: Friend[]; outgoing: Friend[] }>('/friends')
    mp.friends = new Map(r.friends.map((f) => [f.id, f]))
    mp.incoming = new Map(r.incoming.map((f) => [f.id, f]))
    mp.outgoing = new Set(r.outgoing.map((f) => f.id))
    link.friends = new Set(mp.friends.keys())
    for (const a of mp.players.values()) refreshTag(a)
    changed()
  } catch {
    /* keep what we had */
  }
}

export async function addFriend(id: string, name: string) {
  try {
    const r = await rest<{ status: string }>(`/friends/${id}`, { method: 'POST' })
    if (r.status === 'friends') {
      sfx.stamp()
      toast(`<b>${esc(name)}</b> is now your friend!`, '🤝')
      void import('../game').then((m) => m.api.stamp('new-friend'))
    } else toast(`Friend request sent to <b>${esc(name)}</b>`, '💌')
    await refreshFriends()
  } catch (e) {
    toast(e instanceof HttpError && e.status === 403 ? 'You can’t add this player.' : 'Couldn’t send that request. Try again.', '🤝')
  }
}

export async function acceptFriend(id: string) {
  const who = mp.incoming.get(id)
  try {
    await rest(`/friends/${id}/accept`, { method: 'POST' })
    sfx.stamp()
    toast(`You and <b>${esc(who?.name ?? 'them')}</b> are friends!`, '🤝')
    void import('../game').then((m) => {
      m.api.stamp('new-friend')
      if (mp.friends.size + 1 >= 5) m.api.stamp('social-butterfly')
    })
  } catch {
    toast('That request expired.', '🤝')
  }
  await refreshFriends()
}

export async function removeFriend(id: string) {
  await rest(`/friends/${id}`, { method: 'DELETE' }).catch(() => {})
  await refreshFriends()
}

export async function block(id: string, name: string) {
  try {
    await rest(`/blocks/${id}`, { method: 'POST' })
  } catch {
    return toast('Couldn’t block right now. Try again.', '🚫')
  }
  mp.blocked.add(id)
  despawn(id, false)
  toast(`Blocked <b>${esc(name)}</b>. You won’t see them or their messages.`, '🚫')
  await refreshFriends()
}

export async function unblock(id: string, name: string) {
  try {
    await rest(`/blocks/${id}`, { method: 'DELETE' })
  } catch {
    return toast('Couldn’t unblock right now. Try again.', '🚫')
  }
  mp.blocked.delete(id)
  toast(`Unblocked <b>${esc(name)}</b>. You’ll see them around the city again.`, '👋')
}

export function toggleMute(id: string, name: string) {
  if (mp.muted.has(id)) {
    mp.muted.delete(id)
    toast(`Unmuted ${esc(name)}`, '🔈')
  } else {
    mp.muted.add(id)
    toast(`Muted ${esc(name)}. You won’t see their chat`, '🔇')
  }
  changed()
}

export async function report(id: string, name: string, reason: string) {
  // include what they said recently so moderators have context
  const { chatHistory } = await import('../features/chat')
  const context = chatHistory()
    .filter((l) => l.id === id)
    .slice(-6)
    .map((l) => l.text)
    .join(' | ')
    .slice(0, 480)
  try {
    await rest('/reports', { json: { target: id, reason, context } })
    toast(`Thanks! We’ll take a look at ${esc(name)}.`, '🚩')
  } catch {
    toast('Couldn’t send the report. Try again.', '🚩')
  }
}

/** Travel to a friend: same room (and the same copy of it) wherever possible. */
export function goToFriend(id: string) {
  const f = mp.friends.get(id)
  if (!f?.online || !f.room) return toast(`${esc(f?.name ?? 'They')} ${f ? 'is' : 'are'} offline right now.`, '💤')
  closeOverlay()
  if (isHomeRoom(f.room)) return void visitPlayerApartment(id)
  if (world.room.id === f.room) {
    if (mp.players.has(id)) return toast(`${esc(f.name)} is right here! 👋`, '📍')
    toast(`Hopping over to ${esc(f.name)}’s side of ${roomName(f.room)}…`, '🚕')
    return rejoin()
  }
  toast(`Heading to ${roomName(f.room)} to find ${esc(f.name)}…`, '🚕')
  goto(f.room)
}

function friendPresence(e: Extract<S2C, { t: 'f' }>) {
  const f = mp.friends.get(e.i)
  const wasOnline = f?.online
  if (f) Object.assign(f, { name: e.n, online: e.on, room: e.r })
  else void refreshFriends()
  if (e.on && !wasOnline && f && !save.notifyOff && !document.hidden)
    notify(`<b>${esc(e.n)}</b> is online${e.r ? ` at <b>${roomName(e.r)}</b>` : ''}`, '🟢', [{ label: 'Go', act: () => goToFriend(e.i) }])
  changed()
}

// ---------- the big switch ----------
function onEvent(e: S2C) {
  switch (e.t) {
    case 'w': {
      if (!expect || e.r !== expect.room || e.k !== expect.key) return
      expect = null
      link.me = e.me
      mp.inst = e.inst
      mp.online = e.online
      clearPlayers()
      for (const p of e.players) spawn(p)
      trimLocals()
      renderPill('on')
      changed()
      makeRoom()
      if (e.party) applyParty(e.party)
      return
    }
    case 'inv':
      if (!mp.blocked.has(e.i)) invited(e.i, e.n, e.r)
      return
    case 'f':
      return friendPresence(e)
    case 'fr':
      if (mp.blocked.has(e.i)) return
      mp.incoming.set(e.i, { id: e.i, name: e.n, look: null, team: '', title: '', memberSince: '' })
      changed()
      notify(`<b>${esc(e.n)}</b> wants to be friends!`, '🤝', [{ label: 'Accept', act: () => void acceptFriend(e.i) }, { label: 'Later', act: () => {} }], 16000)
      return
    case 'fa':
      sfx.stamp()
      toast(`<b>${esc(e.n)}</b> accepted your friend request!`, '🤝', { keep: true })
      void import('../game').then((m) => m.api.stamp('new-friend'))
      void refreshFriends()
      return
    case 'n':
      if (e.k === 'gb') notify(`<b>${esc(e.n)}</b> signed your guestbook: “${esc(e.m ?? '')}”`, '📬', [], 10000)
      else if (e.k === 'like') toast(`<b>${esc(e.n)}</b> liked your apartment!`, '❤️', { keep: true })
      else if (e.k === 'ref') {
        // someone just made a New Yorker through your invite link
        sfx.stamp()
        notify(`<b>${esc(e.n)}</b> just joined Club NYC through your invite! They’re on their way to you.`, '💌', [], 12000)
        void refreshFriends()
        void import('../game').then((m) => m.api.stamp('invite-1'))
        bumpInvites()
      } else if (e.k === 'refpaid') {
        if (e.c) toast(`<b>${esc(e.n)}</b> is a real New Yorker now: <b>+${e.c}</b> for the invite!`, '💌')
      }
      return
    case '$':
      // the server changed your wallet (a payout, a purchase on another device, a moderator)
      applyWallet({ coins: e.c, owned: e.owned, homes: e.homes })
      if (e.why) toast(esc(e.why), '🪙')
      return
    case 'txt':
      // a friend texted you from their phone ("Meet me here!"): a notice with a Go button
      void import('../features/textFriend').then((m) => m.gotText(e.i, e.n, e.k, e.r))
      return
    case 'xp':
      // you earned XP somewhere (the HUD chip shows it; a new level gets a celebration)
      void import('../social/levels').then((m) => m.setXp(e.x, e.g, e.why, e.b))
      return
    case 'ann':
      announcement(e.m)
      return
    case 'mod':
      return modNotice(e)
    case 'sys':
      toast(esc(e.m), '📢')
      logLine({ name: '', text: e.m, kind: 'sys' })
      return
    case 'kick':
      return kicked(e.m, e.k)
    case 'o':
      mp.online = e.n
      renderPill('on')
      return
    case 'pong':
      return
  }
  // events below belong to a room; while a join is in flight they're from the room we just left
  if (expect) return
  if ('i' in e && mp.blocked.has(e.i)) return
  switch (e.t) {
    case '+':
      if (e.p.i === link.me) return
      spawn(e.p, true)
      trimLocals()
      changed()
      return
    case '-':
      despawn(e.i)
      changed()
      return
    case 'm': {
      const a = mp.players.get(e.i)
      if (!a || !world.nav) return
      if (a.seat) a.standUp()
      a.held = null
      a.onArrive = null
      a.path = world.nav.path(a.pos, [e.x, e.y])
      return
    }
    case 's':
      return chatFrom(e.i, e.m)
    case 'e': {
      const a = mp.players.get(e.i)
      if (a && !mp.muted.has(e.i)) a.say(e.e)
      return
    }
    case 'p': {
      const a = mp.players.get(e.i)
      if (a) applyPose(a, e.p)
      return
    }
    case 'st': {
      const a = mp.players.get(e.i)
      if (a) sitRemote(a, e.s)
      return
    }
    case 'l': {
      const a = mp.players.get(e.i)
      if (a) a.setLook(e.l as Look)
      return
    }
    case 'tag': {
      const a = mp.players.get(e.i)
      if (!a?.remote) return
      a.remote.title = e.ti
      a.remote.team = e.tm
      refreshTag(a)
      return
    }
    case 'sb': {
      const a = mp.players.get(e.i)
      if (a) void import('../features/snowball').then((m) => m.throwFrom(a, [e.x, e.y]))
      return
    }
    case 'party':
      return applyParty(e.p)
  }
}

function kicked(m: string, k: 'replaced' | 'banned' | 'deleted' | 'maintenance' = 'replaced') {
  sock.stop()
  link.online = false
  expect = null
  clearPlayers()
  renderPill('off')
  if (k === 'banned' || k === 'deleted') {
    // the front door explains (ban screen) or starts fresh (deleted account)
    const p = el('div', 'panel', `<div class="panel-art">${k === 'banned' ? '🚫' : '👋'}</div><h2>${k === 'banned' ? 'You’ve been removed from the city' : 'Account deleted'}</h2><p>${esc(m)}</p>`)
    const b = el('button', 'btn go', 'OK')
    b.onclick = () => location.reload()
    p.append(b)
    return openOverlay(p, { backdrop: false })
  }
  if (k === 'maintenance') {
    const p = el('div', 'panel', `<div class="panel-art">🚧</div><h2>Back in a Bit!</h2><p>${esc(m)}</p><p class="muted">We’ll reconnect you automatically.</p>`)
    openOverlay(p, { backdrop: false })
    const retry = () =>
      void rest('/me')
        .then(() => {
          closeOverlay()
          renderPill('connecting')
          sock.start()
        })
        .catch(() => setTimeout(retry, 20000))
    setTimeout(retry, 30000)
    return
  }
  const p = el('div', 'panel', `<div class="panel-art">🪟</div><h2>Playing Somewhere Else?</h2><p>${esc(m)} Only one window can be in the city at a time.</p>`)
  const b = el('button', 'btn go', 'Play Here Instead')
  b.onclick = () => {
    closeOverlay()
    renderPill('connecting')
    sock.start()
  }
  p.append(b)
  openOverlay(p, { backdrop: false })
}

async function checkSession() {
  const r = await rest<{ user: unknown }>('/me').catch(() => ({ user: true }))
  if (r.user) return
  sock.stop()
  link.account = false
  renderPill('off')
  notify('You were signed out. Reload to sign back in.', '🔑', [{ label: 'Reload', act: () => location.reload() }], 30000)
}

// ---------- start ----------
let started = false
export function startMultiplayer() {
  if (started) return
  started = true
  // to the left of the coins, in the HUD's top row
  ;(stage.hud.querySelector('.hud-right') ?? stage.root).prepend(pill)
  renderPill('connecting')
  link.send = (m) => sock.send(m)
  sock.on(onEvent)
  sock.onOpen(() => {
    link.online = true
    join()
    void refreshFriends()
    void rest<{ blocked: string[] }>('/blocks').then((r) => (mp.blocked = new Set(r.blocked))).catch(() => {})
  })
  sock.onClose((why) => {
    link.online = false
    expect = null
    if (why === 'replaced') return
    renderPill('connecting')
    for (const a of mp.players.values()) a.wrap.classList.add('stale')
    if (sock.failures === 3) void checkSession()
  })
  onRoomBuilt(() => join())
  onChatName((id) => {
    const a = mp.players.get(id)
    if (a) void import('../features/playerCard').then((m) => m.playerCardFor(a))
  })
  // the server pushes headcount changes; this is just a slow fallback
  setInterval(() => {
    if (!link.online || document.hidden) return
    void rest<{ count: number }>('/online')
      .then((r) => {
        mp.online = r.count
        renderPill('on')
      })
      .catch(() => {})
  }, 60000)
  sock.start()
  if (import.meta.env.DEV) Object.assign((window as unknown as { clubNyc: object }).clubNyc ?? {}, { mp, link, sock })
}

// ---------- messages from the team & the moderators ----------
/** A banner across the top of the city (events, incidents, "back in 5"). */
function announcement(m: string) {
  sfx.stamp()
  stage.root.querySelector('.announce')?.remove()
  const b = el('div', 'announce', `<span>📣</span><p>${esc(m)}</p>`)
  const x = el('button', 'announce-x', '×')
  x.setAttribute('aria-label', 'Dismiss')
  x.onclick = () => b.remove()
  b.append(x)
  stage.root.append(b)
  setTimeout(() => b.classList.add('out'), 14000)
  setTimeout(() => b.remove(), 14600)
  logLine({ name: '', text: m, kind: 'sys' })
}

function modNotice(e: Extract<S2C, { t: 'mod' }>) {
  if (e.k === 'warn') {
    const p = el('div', 'panel', `<div class="panel-art">🧑‍⚖️</div><h2>A Note from the Moderators</h2><p>${esc(e.m)}</p><p class="muted">Club NYC works because everyone’s a good neighbor. <a href="/rules.html" target="_blank" rel="noopener">Community rules</a></p>`)
    const ok = el('button', 'btn go', 'Got It')
    ok.onclick = () => closeOverlay()
    p.append(ok)
    return openOverlay(p)
  }
  if (e.k === 'mute') {
    const t = e.until ? new Date(e.until).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
    return notify(`Your chat is paused${t ? ` until <b>${t}</b>` : ''}.${e.m ? ` ${esc(e.m)}` : ''}`, '🔇', [], 12000)
  }
  toast('Your chat is back on. Be kind out there!', '💬')
}

/** Invite milestones turn into stamps as friends arrive. */
function bumpInvites() {
  const me = account.me
  if (!me) return
  me.invites = (me.invites ?? 0) + 1
  void import('../game').then((m) => {
    if ((me.invites ?? 0) >= 3) m.api.stamp('invite-3')
    if ((me.invites ?? 0) >= 10) m.api.stamp('invite-10')
  })
}
