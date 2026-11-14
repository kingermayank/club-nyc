import './homes.css'
import { sfx } from '../audio'
import { save } from '../state'
import { el, stage } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton, toast, notify, confetti } from '../engine/ui'
import { world, onRoomBuilt, onFrame, spawnResident, leave } from '../engine/world'
import type { Actor } from '../engine/actor'
import { TRACKS, TRACK, play, stop } from '../music'
import { link } from '../net/link'
import { isHomeRoom } from '../data/homes'
import { partyOn } from '../data/party'
import { RESIDENTS } from '../social/residents'
import type { PartyWire } from '../net/protocol'
import { api } from '../game'

/**
 * House parties. Host one at home (the Billionaires' Row terrace was built for it): pick the vibe, invite friends
 * or the whole city. There's one party song (music.ts, TRACKS[0]). Everyone in the room hears the same song from the same bar, the lights go up,
 * and city locals drop by to dance when the guest list is thin.
 */
export const THEMES: Record<string, { name: string; emoji: string; desc: string }> = {
  glow: { name: 'Rooftop Glow', emoji: '✨', desc: 'string lights, golden hour' },
  disco: { name: 'Disco Fever', emoji: '🪩', desc: 'mirror ball & colored spots' },
  spooky: { name: 'Spooky Season', emoji: '🎃', desc: 'fog, bats, purple light' },
  bodega: { name: 'Bodega Rave', emoji: '🥪', desc: 'neon green & pink' },
}

let party: PartyWire | null = null
let fx: HTMLElement | null = null
let chip: HTMLElement | null = null
const guests = new Set<Actor>()
let guestTimer = 0
let hostedFor = 0
let rewarded = false

const ME = () => link.me || 'me'
export const currentParty = () => party
export const isHosting = () => !!party && party.h === ME()
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// ---------- state from the host / the server ----------
export function applyParty(p: PartyWire | null) {
  const was = party
  party = p
  if (!p) {
    if (was) {
      teardown()
      toast(was.h === ME() ? 'Party’s over. Great hosting! 🎈' : 'The party’s winding down. 🎈', '🎈')
    }
    return
  }
  play(p.track, p.since)
  renderFx(p.theme)
  renderChip()
  if (!was) {
    confetti(50)
    sfx.stamp()
    if (p.h !== ME()) {
      api.stamp('party-guest')
      setTimeout(() => world.player.say(['This party is 🔥', 'Who picked this song?! 🎶', 'Best view in the city!'][Math.floor(Math.random() * 3)]), 900)
    }
  } else if (was.track !== p.track) toast(`Now playing: <b>${TRACK[p.track]?.title ?? p.track}</b>`, '🎵')
}

function teardown() {
  stop()
  fx?.remove()
  fx = null
  chip?.remove()
  chip = null
  for (const g of guests) if (g.wrap.isConnected) leave(g)
  guests.clear()
  hostedFor = 0
  rewarded = false
}

// a new room means a new party (or none); the server re-sends it if there is one
onRoomBuilt(() => {
  if (!party) return
  party = null
  teardown()
})

// ---------- hosting ----------
export function startParty(track: string, theme: string, pub: boolean) {
  if (!isHomeRoom(world.room.id)) return toast('Parties happen at your place. Head home first!', '🏠')
  if (link.online) link.send({ t: 'party', on: true, track, theme, pub })
  else applyParty({ h: ME(), n: save.name, track, theme, since: Date.now(), pub })
  guestTimer = 2
}
function updateParty(change: { theme?: string; pub?: boolean }) {
  if (!party || !isHosting()) return
  if (link.online) link.send({ t: 'party', on: true, track: party.track, theme: change.theme ?? party.theme, pub: change.pub ?? party.pub })
  else applyParty({ ...party, ...change })
}
export function endParty() {
  if (!isHosting()) return
  if (link.online) link.send({ t: 'party', on: false })
  else applyParty(null)
}

/**
 * The host's panel: the vibe and who's invited, or the DJ controls once it's going. There's one party song
 * (TRACKS[0], Empire State of Mind), so there's nothing to pick there: a small now-playing tag shows it.
 */
export function openPartyPanel() {
  const going = isHosting()
  const song = TRACKS[0]
  let theme = party?.theme ?? (world.room.id === 'penthouse' ? 'glow' : 'disco')
  let pub = party?.pub ?? false
  const p = el('div', 'panel party-panel pp-compact')
  const draw = () => {
    p.innerHTML = `<h2>${going ? '🎧 You’re the DJ' : '🎉 Throw a party'}</h2>
      <p class="pp-song"><span class="pc-eq"><i></i><i></i><i></i></span><b>${song.title}</b><small>${song.by}</small></p>
      <h4>Vibe</h4><div class="pp-themes"></div>
      ${link.account ? `<h4>Who’s Invited</h4><div class="pp-who" role="radiogroup"><button class="pp-seg ${pub ? '' : 'on'}" data-pub="0" role="radio" aria-checked="${!pub}">👯 Friends</button><button class="pp-seg ${pub ? 'on' : ''}" data-pub="1" role="radio" aria-checked="${pub}">🗽 Everyone in the City</button></div>` : ''}
      <div class="pp-actions"></div>`
    const themes = p.querySelector('.pp-themes')!
    for (const [id, th] of Object.entries(THEMES)) {
      if (id === 'spooky' && !partyOn() && theme !== 'spooky') continue // a Halloween vibe, only offered during the party
      const b = el('button', 'pp-vibe' + (id === theme ? ' on' : ''), `<span class="pp-vibe-em">${th.emoji}</span><b>${th.name}</b>`)
      b.title = th.desc
      b.setAttribute('aria-pressed', String(id === theme))
      b.onclick = () => {
        sfx.click()
        theme = id
        if (going) updateParty({ theme })
        draw()
      }
      themes.append(b)
    }
    p.querySelectorAll<HTMLButtonElement>('.pp-who .pp-seg').forEach((b) => {
      b.onclick = () => {
        sfx.click()
        pub = b.dataset.pub === '1'
        if (going) updateParty({ pub })
        draw()
      }
    })
    const actions = p.querySelector('.pp-actions')!
    if (going) {
      // the party keeps going when you close the panel, so there's no "keep partying" button: inviting is the
      // thing to do here, and ending it is a small power switch off to the side
      const end = el('button', 'btn ghost pp-end', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v8" /><path d="M7.2 6.6a7.5 7.5 0 1 0 9.6 0" /></svg>')
      end.title = 'End the Party'
      end.setAttribute('aria-label', 'End the Party')
      end.onclick = () => {
        closeOverlay()
        endParty()
      }
      // anyone who opens your link while the party's on comes straight to it
      const inv = el('button', 'btn go pp-invite', '💌 Invite')
      inv.onclick = () => void import('./invite').then((m) => m.openInvite())
      actions.append(end, inv)
    } else {
      const go = el('button', 'btn go', '🎉 Start the Party')
      go.onclick = () => {
        closeOverlay()
        startParty(song.id, theme, pub)
      }
      actions.append(go)
    }
    p.append(closeButton())
  }
  draw()
  openOverlay(p)
}

// ---------- invitations ----------
export function invited(host: string, name: string, room: string) {
  if (save.notifyOff && room === '') return
  const where = room === 'penthouse' ? 'Billionaires’ Row penthouse' : room === 'loft' ? 'SoHo loft' : 'apartment'
  notify(`<b>${esc(name)}</b> is throwing a party at their ${where}! 🎉`, '🎉', [{ label: 'Go', act: () => void import('./apartment').then((m) => m.visitPlayerApartment(host)) }], 20000)
}

// ---------- the look ----------
function renderFx(theme: string) {
  fx?.remove()
  fx = el('div', `party-fx theme-${theme}`)
  if (theme === 'disco') fx.innerHTML = '<div class="pf-ball"></div><i class="pf-beam b1"></i><i class="pf-beam b2"></i><i class="pf-beam b3"></i><i class="pf-beam b4"></i>'
  if (theme === 'glow') fx.innerHTML = Array.from({ length: 26 }, (_, i) => `<i class="pf-bulb" style="left:${2 + i * 3.8}%;top:${6 + Math.sin(i * 0.9) * 3}%;animation-delay:${(i % 5) * 0.3}s"></i>`).join('')
  if (theme === 'spooky') fx.innerHTML = '<div class="pf-fog"></div>' + Array.from({ length: 5 }, (_, i) => `<i class="pf-bat" style="top:${10 + i * 9}%;animation-delay:${i * 1.7}s">🦇</i>`).join('')
  if (theme === 'bodega') fx.innerHTML = '<div class="pf-neon">OPEN 24 HRS ♥ PARTY</div><i class="pf-beam b1 green"></i><i class="pf-beam b3 pink"></i>'
  stage.root.append(fx)
}

function renderChip() {
  if (!party) return
  chip?.remove()
  const t = TRACK[party.track]
  chip = el('button', 'party-chip', `<span class="pc-eq"><i></i><i></i><i></i></span><span><b>${t?.title ?? 'Music'}</b><small>${esc(t?.by ?? (party.h === ME() ? 'Your party' : `${party.n}’s party`))}</small></span>`)
  chip.title = isHosting() ? 'DJ controls' : 'Now playing'
  chip.onclick = (e) => {
    e.stopPropagation()
    if (isHosting()) openPartyPanel()
    else toast(`🎵 ${t?.title}`, '🎶')
  }
  stage.root.append(chip)
}

// ---------- city locals come to dance (and the host gets credit) ----------
const LINES = ['This song!! 🎶', 'Best party on the block', 'Who’s the DJ?', 'I can see my building from here!', 'Shoes off? Shoes on? 👟', 'Is there more of that dip?', '🕺', '💃', '🎉']
onFrame((dt) => {
  if (!party || !isHomeRoom(world.room.id)) return
  // everyone dances while the music is on
  for (const g of guests) {
    if (!g.wrap.isConnected) {
      guests.delete(g)
      continue
    }
    if (!g.moving && g.held !== 'dance' && !g.leaving) g.emote('dance', 0)
    if (Math.random() < dt * 0.04) g.say(LINES[Math.floor(Math.random() * LINES.length)])
  }
  if (!isHosting()) return
  const real = world.npcs.filter((a) => a.remote).length
  guestTimer -= dt
  if (guestTimer <= 0 && guests.size + real < 5) {
    guestTimer = 5 + Math.random() * 6
    const here = new Set(world.npcs.map((a) => a.resident?.id))
    const pool = [...save.friends.map((id) => RESIDENTS.find((r) => r.id === id)!).filter(Boolean), ...RESIDENTS].filter((r) => !here.has(r.id))
    const r = pool[Math.floor(Math.random() * Math.min(pool.length, 20))]
    if (r) {
      const a = spawnResident(r, { enter: true })
      a.mob = true
      a.say(`Heard there’s a party! 🎉`)
      guests.add(a)
    }
  }
  hostedFor += dt
  if (!rewarded && hostedFor > 90 && guests.size + real >= 3) {
    rewarded = true
    api.stamp('party-host')
    api.earn(30, 'Party host tips', 'party-host')
  }
})
