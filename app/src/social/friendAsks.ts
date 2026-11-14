/**
 * Friend requests with city locals, the way they work with real people: you send one, and the answer comes later,
 * on your phone. Locals who've been hanging out with you sometimes ask first; their request waits in Contacts (and a
 * notice) until you accept it. Invites over work the same way: they get a text, they answer, and if it's a yes they
 * come by the next time you're home.
 *
 * Everything pending lives in save.friendAsks / save.guestsComing, so it survives a reload.
 */
import { sfx } from '../audio'
import { save, persist } from '../state'
import { toast, notify } from '../engine/ui'
import { world, refreshTag } from '../engine/world'
import { RESIDENT, RESIDENTS, type Resident } from './residents'
import { bond, isFriend } from './friends'

const ACCEPT_TEXT = ['Yes!! Friends! 🤝', 'Of course! Let’s hang out!', 'Took you long enough 😄', 'Finally! 🎉']
const COMING_TEXT = ['On my way! 🛋️', 'Be there in 20. NYC 20.', 'Yes! Bringing nothing, as is tradition.', 'Say less. Coming over.']
const BUSY_TEXT = ['Can’t tonight, rain check? 🌧️', 'Stuck at work. Next time!', 'My train is delayed. Again. Another day!']
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

/** waiting on their answer (you asked) */
export const askedThem = (id: string) => save.friendAsks?.[id]?.from === 'me'
/** waiting on yours (they asked) */
export const askedYou = (id: string) => save.friendAsks?.[id]?.from === 'them'

const phone = (title: string, text: string, id: string, kind?: 'fr') =>
  void import('../features/ifruit/store').then((m) => {
    m.phoneNotify({ app: 'contacts', title, text, arg: `u:${id}`, kind })
    m.syncRequestBadge()
  })
/** a request answered or gone: its notification is read and Contacts' count catches up */
const settled = (id: string) =>
  void import('../features/ifruit/store').then((m) => {
    m.readNotes('contacts', `u:${id}`)
    m.syncRequestBadge()
  })

function stampFriends() {
  void import('../game').then((m) => {
    m.api.stamp('new-friend')
    if (save.friends.length >= 5) m.api.stamp('social-butterfly')
  })
}
function makeFriends(r: Resident) {
  if (!isFriend(r.id)) save.friends.push(r.id)
  delete save.friendAsks[r.id]
  bond(r.id, 1)
  persist()
  const a = world.npcs.find((n) => n.resident?.id === r.id)
  if (a) refreshTag(a)
  stampFriends()
  settled(r.id)
}

/** You say no to a local's request (they don't mind; maybe they'll ask again some day). */
export function declineRequest(r: Resident) {
  delete save.friendAsks[r.id]
  persist()
  settled(r.id)
}

/** You ask a local. Your very first friend says yes quickly; after that it depends how well they know you. */
export function sendRequest(r: Resident) {
  if (isFriend(r.id) || askedThem(r.id)) return
  // they'd already asked you: that's a yes from both sides
  if (askedYou(r.id)) return acceptRequest(r)
  save.friendAsks[r.id] = { at: Date.now(), from: 'me' }
  persist()
  bond(r.id, 1)
  toast(`Friend request sent to <b>${r.name}</b>`, '🤝')
}

/** You accept a local's request. */
export function acceptRequest(r: Resident) {
  sfx.stamp()
  makeFriends(r)
  toast(`You and <b>${r.name}</b> are friends!`, '🤝')
}

/** Invite a local friend over: a text goes out, the answer comes back a little later. */
export function inviteOver(r: Resident) {
  toast(`Invite sent to <b>${r.name}</b>`, '🛋️')
  setTimeout(() => {
    const yes = Math.random() < 0.8
    if (yes && !save.guestsComing.includes(r.id)) {
      save.guestsComing.push(r.id)
      persist()
    }
    // the answer lands in your thread with them, like any text
    void import('../features/ifruit/net').then((m) => m.receiveLocal(r.id, r.name, yes ? pick(COMING_TEXT) : pick(BUSY_TEXT)))
  }, 6000 + Math.random() * 8000)
}

/** every so often: answers to your requests, and locals who'd like to be friends */
function tick() {
  const now = Date.now()
  for (const [id, ask] of Object.entries(save.friendAsks)) {
    const r = RESIDENT[id]
    if (!r || isFriend(id)) {
      delete save.friendAsks[id]
      continue
    }
    if (ask.from !== 'me' || now - ask.at < 25_000) continue
    // the better they know you, the likelier the yes; the first friend always says yes
    const aff = save.affinity[id] ?? 0
    const chance = save.friends.length === 0 ? 1 : 0.35 + (save.team === r.team ? 0.2 : 0) + Math.min(aff, 4) * 0.12
    if (Math.random() < chance) {
      makeFriends(r)
      sfx.stamp()
      phone(r.name, `Accepted your friend request. ${pick(ACCEPT_TEXT)}`, r.id)
    }
  }
  // a local you've spent time with asks you (one at a time, not too often)
  const waiting = Object.values(save.friendAsks).some((a) => a.from === 'them')
  if (!waiting && Math.random() < 0.08) {
    const keen = RESIDENTS.filter((r) => !isFriend(r.id) && !save.friendAsks[r.id] && (save.affinity[r.id] ?? 0) >= 2)
    const r = keen.length ? pick(keen) : null
    if (r) {
      save.friendAsks[r.id] = { at: now, from: 'them' }
      phone(r.name, 'Wants to be friends', r.id, 'fr')
      notify(`<b>${r.name}</b> wants to be friends`, '🤝', [{ label: 'Accept', act: () => acceptRequest(r) }, { label: 'Later', act: () => {} }], 12000)
    }
  }
  persist()
}

let started = false
export function startFriendAsks() {
  if (started) return
  started = true
  save.friendAsks ??= {}
  save.guestsComing ??= []
  setInterval(tick, 20_000)
}
