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
 * House parties. Host one at home (the Billionaires' Row terrace was built for it): pick the music and the vibe,
 * invite friends or the whole city. Everyone in the room hears the same song from the same bar, the lights go up,
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
function updateParty(change: { track?: string; theme?: string; pub?: boolean }) {
  if (!party || !isHosting()) return
  if (link.online) link.send({ t: 'party', on: true, track: change.track ?? party.track, theme: change.theme ?? party.theme, pub: change.pub ?? party.pub })
  else applyParty({ ...party, ...change, since: change.track && change.track !== party.track ? Date.now() : party.since })
}
export function endParty() {
  if (!isHosting()) return
  if (link.online) link.send({ t: 'party', on: false })
  else applyParty(null)
}

/** The host's panel: music, vibe, guest list — or the DJ controls once it's going. */
export function openPartyPanel() {
  const going = isHosting()
  let track = party?.track ?? 'empire-state-of-mine'
  let theme = party?.theme ?? (world.room.id === 'penthouse' ? 'glow' : 'disco')
  let pub = party?.pub ?? false
  const p = el('div', 'panel wide party-panel')
  const draw = () => {
    p.innerHTML = `<h2>${going ? '🎧 You’re the DJ' : '🎉 Throw a party'}</h2>
      <p class="pp-sub">${going ? 'Switch the music or the vibe. Everyone hears it.' : world.room.id === 'penthouse' ? 'Ninety floors up, a terrace, a DJ booth. This is what the penthouse is for.' : 'Clear the floor. Your place, your playlist.'}</p>
      <h4>Music</h4><div class="pp-tracks"></div>
      <h4>Vibe</h4><div class="pp-themes"></div>
      ${link.account ? `<h4>Who’s invited</h4><div class="pp-who"><button class="pp-opt ${pub ? '' : 'on'}" data-pub="0">👯 Friends</button><button class="pp-opt ${pub ? 'on' : ''}" data-pub="1">🗽 Everyone in the city</button></div>` : ''}
      <div class="pp-actions"></div>`
    const list = p.querySelector('.pp-tracks')!
    for (const t of TRACKS) {
      const b = el('button', 'pp-track' + (t.id === track ? ' on' : ''), `<span class="pp-em">${t.emoji}</span><span><b>${t.title}</b><small>${t.by} · ${t.vibe}</small></span>`)
      b.onclick = () => {
        sfx.click()
        track = t.id
        if (going) updateParty({ track })
        else play(t.id) // preview
        draw()
      }
      list.append(b)
    }
    const themes = p.querySelector('.pp-themes')!
    for (const [id, th] of Object.entries(THEMES)) {
      if (id === 'spooky' && !partyOn() && theme !== 'spooky') continue // a Halloween vibe, only offered during the party
      const b = el('button', 'pp-opt' + (id === theme ? ' on' : ''), `${th.emoji} ${th.name}<small>${th.desc}</small>`)
      b.onclick = () => {
        sfx.click()
        theme = id
        if (going) updateParty({ theme })
        draw()
      }
      themes.append(b)
    }
    p.querySelectorAll<HTMLButtonElement>('.pp-who .pp-opt').forEach((b) => {
      b.onclick = () => {
        pub = b.dataset.pub === '1'
        if (going) updateParty({ pub })
        draw()
      }
    })
    const actions = p.querySelector('.pp-actions')!
    if (going) {
      const end = el('button', 'btn ghost', 'End the party')
      end.onclick = () => {
        closeOverlay()
        endParty()
      }
      const ok = el('button', 'btn go', 'Keep partying 🎶')
      ok.onclick = () => closeOverlay()
      // anyone who opens your link while the party's on comes straight to it
      const inv = el('button', 'btn ghost', '💌 Invite with a link')
      inv.onclick = () => void import('./invite').then((m) => m.openInvite())
      actions.append(end, inv, ok)
    } else {
      const go = el('button', 'btn go', '🎉 Start the party')
      go.onclick = () => {
        closeOverlay()
        startParty(track, theme, pub)
      }
      actions.append(go)
    }
    p.append(closeButton())
  }
  draw()
  openOverlay(p, {
    onClose: () => {
      // stop a preview that never turned into a party
      if (!isHosting()) stop()
    },
  })
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
  chip = el('button', 'party-chip', `<span class="pc-eq"><i></i><i></i><i></i></span><span><b>${t?.title ?? 'Music'}</b><small>${esc(party.h === ME() ? 'Your party' : `${party.n}’s party`)} · ${THEMES[party.theme]?.emoji ?? '🎉'} ${THEMES[party.theme]?.name ?? ''}</small></span>`)
  chip.title = isHosting() ? 'DJ controls' : 'Now playing'
  chip.onclick = (e) => {
    e.stopPropagation()
    if (isHosting()) openPartyPanel()
    else toast(`🎵 ${t?.title} · ${t?.by}`, '🎶')
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
