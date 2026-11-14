/** Contacts: your friends, where they are, and one click to reach them. */
import { el } from '../../../engine/stage'
import { toast } from '../../../engine/ui'
import { world } from '../../../engine/world'
import { levelOf } from '../../../data/levels'
import { isHomeRoom } from '../../../data/homes'
import { placePhrase } from '../../../data/placePhrase'
import { people, face, screenEl, act, shimmer, empty, esc, friendsOf, suggested, relOf, type Person, type Linked } from '../kit'
import { rest } from '../../../net/server'
import { RESIDENT, type Resident } from '../../../social/residents'
import { on, isOnline, isFav, toggleFav } from '../store'
import { thenCity, roomName, type Ctx, type Screen } from '../phone'
import { tone } from '../sound'

const where = (p: Person) => (!p.online ? 'Offline' : !p.room ? 'Online' : placePhrase(p.room, true))

export function open(ctx: Ctx, arg?: string): Screen {
  const s = screenEl(ctx, 'Contacts', { back: false, big: true, right: act('+ Add', () => thenCity(() => void import('../../invite').then((m) => m.openInvite())), 'ghost') })
  const search = document.createElement('input')
  search.className = 'ifr-search'
  search.placeholder = 'Search'
  search.setAttribute('aria-label', 'Search contacts')
  const favs = el('div', 'ifc-favs')
  const list = el('div', 'ifc-list', shimmer(5))
  s.body.append(search, favs, list)
  let all: Person[] = []
  let incoming: Person[] = []
  let sent: Person[] = []
  let maybe: Linked[] = []
  let error = false

  const render = () => {
    const f = search.value.trim().toLowerCase()
    const shown = all.filter((p) => !f || p.name.toLowerCase().includes(f))
    favs.innerHTML = ''
    const starred = all.filter((p) => isFav(p.id))
    if (starred.length && !f) {
      for (const p of starred.slice(0, 5)) {
        const b = el('button', 'ifc-fav', `${face(p.look, p.online)}<span>${esc(p.name)}</span>`)
        b.type = 'button'
        b.onclick = () => ctx.push(detail(ctx, p))
        favs.append(b)
      }
    }
    list.innerHTML = ''
    if (error) list.append(el('div', 'ifr-err', 'Can’t reach the city right now.'))
    // requests waiting on you, first: Accept or Decline right here
    if (incoming.length && !f) {
      list.append(el('div', 'ifr-sec', `Friend Requests <i class="ifc-count hot">${incoming.length}</i>`))
      for (const p of incoming) list.append(requestRow(ctx, p, load))
    }
    if (!all.length && !incoming.length && !maybe.length && !f) {
      list.append(
        empty('/art/ifruit/app/contacts.png', 'No Friends Yet', isOnline() ? 'Click anyone in the city and add them.' : 'Wave at a local, then add them.', act('Invite Friends', () => thenCity(() => void import('../../invite').then((m) => m.openInvite())), 'blue')),
      )
      return
    }
    const groups: [string, Person[]][] = [
      ['Online', shown.filter((p) => p.online && !p.local)],
      ['Offline', shown.filter((p) => !p.online && !p.local)],
      ['City Locals', shown.filter((p) => p.local)],
    ]
    for (const [title, ps] of groups) {
      if (!ps.length) continue
      list.append(el('div', 'ifr-sec', title))
      for (const p of ps) {
        const row = el('button', 'ifr-row', `${face(p.look, p.online)}<span class="ifr-txt"><b>${esc(p.name)}${isFav(p.id) ? ' <i class="ifc-star">★</i>' : ''}</b><small>${esc(where(p))}</small></span>`)
        row.type = 'button'
        row.onclick = () => ctx.push(detail(ctx, p))
        list.append(row)
      }
    }
    if (f && !shown.length) list.append(el('div', 'ifr-empty', `<span>No one called “${esc(search.value)}”.</span>`))
    if (f) return
    // friends of your friends you could add
    if (maybe.length) {
      list.append(el('div', 'ifr-sec', 'People You May Know'))
      for (const p of maybe) list.append(linkedRow(ctx, p, `${p.mutualCount} mutual`, load))
    }
    // requests you sent that are still out
    if (sent.length) {
      list.append(el('div', 'ifr-sec', 'Sent'))
      for (const p of sent) {
        const row = el('div', 'ifr-row ifc-req', `${face(p.look)}<span class="ifr-txt"><b>${esc(p.name)}</b><small>Waiting</small></span>`)
        row.append(
          act('Cancel', async () => {
            const m = await import('../../../net/multiplayer')
            await m.cancelRequest(p.id)
            void load()
          }, 'ghost'),
        )
        list.append(row)
      }
    }
  }
  async function load() {
    const r = await people()
    all = r.friends
    incoming = r.incoming
    error = !!r.error
    if (isOnline() && !r.error) {
      const { mp } = await import('../../../net/multiplayer')
      sent = [...mp.sent.values()].map((u) => ({ id: u.id, name: u.name, look: u.look, online: false, room: null }))
    } else sent = []
    render()
    // suggestions come a moment later (one more request), so the list never waits on them
    if (isOnline() && !r.error) {
      maybe = await suggested()
      render()
    }
  }
  search.oninput = render
  const offs: (() => unknown)[] = [on('friends', () => void load())]
  // friends moving around, requests arriving: keep the list current while it's open
  void import('../../../net/multiplayer').then((m) => offs.push(m.onPeopleChange(() => void load())))
  void load()
  // a notification or another app sent us to someone: `u:<id>` (anyone) or a friend's id
  if (arg) {
    const id = arg.startsWith('u:') ? arg.slice(2) : arg
    void openPerson(ctx, id)
  }
  return { el: s.el, dispose: () => offs.forEach((f) => f()) }
}

/** open anyone: a friend's page if you're friends, otherwise their profile */
export async function openPerson(ctx: Ctx, id: string, seed?: Partial<Person>) {
  const { friends } = await people()
  const f = friends.find((x) => x.id === id)
  if (f) return ctx.push(detail(ctx, f))
  if (RESIDENT[id]) return ctx.push(localProfile(ctx, RESIDENT[id]))
  if (!isOnline()) return
  ctx.push(profile(ctx, id, seed))
}

/** a request waiting on you: tap for their profile, or answer right here */
function requestRow(ctx: Ctx, p: Person, after: () => void) {
  const row = el('div', 'ifr-row ifc-req', `${face(p.look)}<span class="ifr-txt"><b>${esc(p.name)}</b>${p.local ? '<small>City local</small>' : ''}</span>`)
  row.querySelector('.ifr-txt')!.addEventListener('click', () => void openPerson(ctx, p.id, p))
  const no = act('✕', async () => {
    row.classList.add('gone')
    await answer(p, false)
    after()
  }, 'ghost ifc-no')
  no.setAttribute('aria-label', `Decline ${p.name}`)
  const yes = act('Accept', async () => {
    row.classList.add('gone')
    await answer(p, true)
    after()
  }, 'green')
  row.append(no, yes)
  return row
}
async function answer(p: Person, yes: boolean) {
  if (p.local) {
    const m = await import('../../../social/friendAsks')
    if (yes) m.acceptRequest(RESIDENT[p.id])
    else m.declineRequest(RESIDENT[p.id])
    return
  }
  const m = await import('../../../net/multiplayer')
  if (yes) await m.acceptFriend(p.id)
  else await m.declineFriend(p.id)
}

/** someone in a friend list or a suggestion: who they are to you, and one button to connect */
function linkedRow(ctx: Ctx, p: Linked, note: string, after?: () => void) {
  const row = el('div', 'ifr-row ifc-link', `${face(p.look, p.online)}<span class="ifr-txt"><b>${esc(p.name)}</b><small>${esc(note)}</small></span>`)
  if (p.rel !== 'me') {
    row.tabIndex = 0
    row.setAttribute('role', 'button')
    row.onclick = () => void openPerson(ctx, p.id, p)
    row.onkeydown = (e) => e.key === 'Enter' && row.click()
  }
  const btn = relButton(p, after)
  if (btn) row.append(btn)
  return row
}
function relButton(p: Linked, after?: () => void): HTMLElement | null {
  if (p.rel === 'none') {
    const b = act('+ Add', async () => {
      b.disabled = true
      b.textContent = 'Sent'
      const m = await import('../../../net/multiplayer')
      await m.addFriend(p.id, p.name)
      p.rel = 'requested'
      after?.()
    }, 'blue')
    return b
  }
  if (p.rel === 'requested') {
    const b = act('Sent', () => {}, 'ghost')
    b.disabled = true
    return b
  }
  if (p.rel === 'incoming')
    return act('Accept', async () => {
      const m = await import('../../../net/multiplayer')
      await m.acceptFriend(p.id)
      p.rel = 'friends'
      after?.()
    }, 'green')
  return null
}
const noteFor = (p: Linked) => (p.rel === 'me' ? 'You' : p.rel === 'friends' ? 'Your friend' : p.rel === 'incoming' ? 'Wants to be friends' : p.online ? 'Online' : 'Offline')

/** their friends, under their name: the list (you're friends) or the count and the friends you share (you're not) */
function friendsSection(ctx: Ctx, id: string, name: string) {
  const box = el('div', 'ifc-theirs', `<div class="ifr-sec">Friends</div>${shimmer(2)}`)
  const draw = async () => {
    let r: Awaited<ReturnType<typeof friendsOf>>
    try {
      r = await friendsOf(id)
    } catch {
      box.innerHTML = ''
      return
    }
    if (!box.isConnected && box.dataset.drawn) return
    box.dataset.drawn = '1'
    box.innerHTML = ''
    box.append(el('div', 'ifr-sec', `Friends <i class="ifc-count">${r.count}</i>`))
    if (r.visible) {
      if (!r.friends.length) box.append(el('div', 'ifc-none', 'No friends yet'))
      for (const p of r.friends) box.append(linkedRow(ctx, p, noteFor(p), draw))
      return
    }
    // the friends you share, by name; the rest stay with their friends
    for (const p of r.mutual) box.append(linkedRow(ctx, p, 'Mutual friend'))
    if (r.count > r.mutualCount) box.append(el('div', 'ifc-locked', `<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M5 11 V7 a5 5 0 0 1 10 0 V11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><rect x="2" y="10" width="16" height="12" rx="3.5" fill="currentColor"/></svg>Friends see ${esc(name)}’s friends`))
  }
  void draw()
  return box
}

/** someone you're not friends with (yet): who they are, the request between you, and your friends in common */
function profile(ctx: Ctx, id: string, seed?: Partial<Person>): Screen {
  const s = screenEl(ctx, '')
  const hero = el('div', 'ifc-hero', `${face(seed?.look ?? null, !!seed?.online, 'lg')}<b>${esc(seed?.name ?? '')}</b><small></small>`)
  const acts = el('div', 'ifc-more')
  s.body.append(hero, acts)
  let user: (Person & { xp?: number; team?: string; title?: string; founder?: boolean }) | null = null
  const paint = async () => {
    const rel = await relOf(id)
    if (rel === 'friends' && user) {
      // you just became friends: their friend page, in place of this one
      ctx.pop()
      void openPerson(ctx, id)
      return
    }
    acts.innerHTML = ''
    const say = (t: string) => acts.append(el('div', 'ifc-here', t))
    if (rel === 'none') acts.append(act('Add Friend', async () => {
      const m = await import('../../../net/multiplayer')
      await m.addFriend(id, user?.name ?? seed?.name ?? '')
      void paint()
    }, 'blue'))
    if (rel === 'requested') {
      say('Request sent')
      acts.append(act('Cancel Request', async () => {
        const m = await import('../../../net/multiplayer')
        await m.cancelRequest(id)
        void paint()
      }, 'ghost'))
    }
    if (rel === 'incoming') {
      say('Wants to be friends')
      const two = el('div', 'ifc-two')
      two.append(
        act('Decline', async () => {
          const m = await import('../../../net/multiplayer')
          await m.declineFriend(id)
          ctx.pop()
        }, 'ghost'),
        act('Accept', async () => {
          const m = await import('../../../net/multiplayer')
          await m.acceptFriend(id)
          void paint()
        }, 'green'),
      )
      acts.append(two)
    }
  }
  void (async () => {
    try {
      const r = await rest<{ user: Person & { xp?: number; team?: string; title?: string; founder?: boolean }; presence?: { online: boolean } }>(`/users/${encodeURIComponent(id)}`)
      user = { ...r.user, online: !!r.presence?.online, room: null }
      const lv = user.xp !== undefined ? levelOf(user.xp) : null
      hero.innerHTML = `${face(user.look, user.online, 'lg')}<b>${esc(user.name)}</b><small>${lv ? `<span class="ifr-tag lv">Level ${lv.level}</span> ${esc(lv.title)}` : ''}</small><span class="ifc-where ${user.online ? 'on' : ''}">${user.online ? 'Online' : 'Offline'}</span>`
      s.body.append(friendsSection(ctx, id, user.name))
    } catch {
      hero.querySelector('small')!.textContent = 'Can’t reach the city right now.'
    }
    void paint()
  })()
  const offs: (() => unknown)[] = []
  void import('../../../net/multiplayer').then((m) => offs.push(m.onPeopleChange(() => void paint())))
  return { el: s.el, dispose: () => offs.forEach((f) => f()) }
}

/** a city local you aren't friends with yet */
function localProfile(ctx: Ctx, r: Resident): Screen {
  const s = screenEl(ctx, '')
  s.body.innerHTML = `<div class="ifc-hero">${face(r.look, false, 'lg')}<b>${esc(r.name)}</b><small><span class="ifr-tag">City local</span> ${esc(r.title)}</small></div>`
  const acts = el('div', 'ifc-more')
  s.body.append(acts)
  void import('../../../social/friendAsks').then((m) => {
    if (m.askedYou(r.id)) {
      const two = el('div', 'ifc-two')
      two.append(
        act('Decline', () => (m.declineRequest(r), ctx.pop()), 'ghost'),
        act('Accept', () => (m.acceptRequest(r), ctx.pop()), 'green'),
      )
      acts.append(el('div', 'ifc-here', 'Wants to be friends'), two)
    } else if (m.askedThem(r.id)) acts.append(el('div', 'ifc-here', 'Request sent'))
    else acts.append(act('Add Friend', () => (m.sendRequest(r), ctx.pop()), 'blue'))
  })
  return { el: s.el }
}

/** one friend: big face, where they are, and everything you can do with them */
export function detail(ctx: Ctx, p: Person): Screen {
  const star = act(isFav(p.id) ? '★' : '☆', () => {
    toggleFav(p.id)
    star.textContent = isFav(p.id) ? '★' : '☆'
    star.animate([{ transform: 'scale(1.5) rotate(-20deg)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(0.2, 1.6, 0.4, 1)' })
  }, 'ghost ifc-starbtn')
  star.setAttribute('aria-label', 'Favourite')
  const s = screenEl(ctx, '', { right: star })
  const lv = p.xp !== undefined ? levelOf(p.xp) : null
  s.body.innerHTML = `<div class="ifc-hero">${face(p.look, p.online, 'lg')}<b>${esc(p.name)}</b><small>${p.local ? '<span class="ifr-tag">City local</span> ' : ''}${lv ? `<span class="ifr-tag lv">Level ${lv.level}</span> ${esc(lv.title)}` : ''}</small><span class="ifc-where ${p.online ? 'on' : ''}">${esc(where(p))}</span></div>`
  const acts = el('div', 'ifr-actions')
  const btn = (icon: string, label: string, f: () => void, disabled = false) => {
    const b = el('button', '', `<img src="${icon}" alt="">${label}`) as HTMLButtonElement
    b.type = 'button'
    b.disabled = disabled
    b.onclick = () => {
      tone('tap')
      f()
    }
    acts.append(b)
  }
  btn('/art/ifruit/app/messages.png', 'Message', () => ctx.open('messages', `to:${p.id}`))
  // voice calls: friends who are online in the city, never city locals
  btn('/art/ifruit/app/phone.png', 'Call', () => ctx.open('phone', `call:${p.id}`), !(!p.local && p.online && isOnline()))
  btn('/art/ifruit/app/bank.png', 'Pay', () => ctx.open('bank', `pay:${p.id}`), !!p.local || !isOnline())
  btn('/art/ifruit/app/map.png', 'Find', () => ctx.open('map', `friend:${p.id}`), !p.online)
  s.body.append(acts)
  const more = el('div', 'ifc-more')
  if (p.online && p.room && p.room !== world.room.id) {
    more.append(
      act(isHomeRoom(p.room) ? 'Visit Their Place' : `Go to ${roomName(p.room)}`, () =>
        thenCity(() => {
          if (p.local) void import('../../../social/community').then((m) => m.findFriend(m.RESIDENT[p.id]))
          else if (isHomeRoom(p.room!)) void import('../../apartment').then((m) => m.visitPlayerApartment(p.id))
          else void import('../../../net/multiplayer').then((m) => m.goToFriend(p.id))
        }),
      'blue'),
    )
  } else if (p.online && p.room === world.room.id) more.append(el('div', 'ifc-here', 'Right here with you'))
  if (!p.local && isOnline()) more.append(act('Visit Their Place', () => thenCity(() => void import('../../apartment').then((m) => m.visitPlayerApartment(p.id))), 'ghost'))
  if (p.local && !p.online) more.append(el('div', 'ifc-here', 'Back later'))
  s.body.append(more)
  if (!p.local && isOnline()) {
    const rm = act('Remove Friend', async () => {
      if (rm.dataset.sure !== '1') {
        rm.dataset.sure = '1'
        rm.textContent = 'Remove? Click again'
        return
      }
      const m = await import('../../../net/multiplayer')
      await m.removeFriend(p.id)
      toast(`Removed <b>${esc(p.name)}</b>`, '👋')
      ctx.pop()
    }, 'ghost ifc-remove')
    s.body.append(rm)
  }
  if (!p.local && isOnline()) s.body.insertBefore(friendsSection(ctx, p.id, p.name), s.body.querySelector('.ifc-remove'))
  return { el: s.el }
}
