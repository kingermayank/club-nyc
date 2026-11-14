/**
 * Phone: voice calls with friends who are in the city right now. The audio goes straight between the two browsers
 * (WebRTC, peer to peer); the game server only passes the ring, the answer and the connection details between
 * accepted friends. City locals and friends who are offline can't be called.
 */
import { el } from '../../../engine/stage'
import { world } from '../../../engine/world'
import { save } from '../../../state'
import { RESIDENT } from '../../../social/residents'
import { link } from '../../../net/link'
import type { Look } from '../../../avatar/look'
import { headPortrait } from '../../../avatar/render'
import { isHomeRoom } from '../../../data/homes'
import { face, screenEl, act, empty, people, esc, personById } from '../kit'
import { ifr, store, setBadge, phoneNotify, ago, isOnline } from '../store'
import type { CallKind } from '../wire'
import { openApp, island, islandOff, thenCity, roomName, phoneIsOpen, banner, type Ctx, type Screen } from '../phone'
import { tone, ring } from '../sound'

interface Call {
  id: string
  who: string
  name: string
  look: Look | null
  dir: 'in' | 'out'
  state: 'ringing' | 'connecting' | 'live' | 'ended'
  start: number
  room: string | null
}
let call: Call | null = null
let stopRing: (() => void) | null = null
let timers: number[] = []
let view: { set: (c: Call | null) => void; level: (who: 'me' | 'them', v: number) => void } | null = null

const clearTimers = () => (timers.forEach(clearTimeout), (timers = []))
const later = (f: () => void, ms: number) => timers.push(window.setTimeout(f, ms))
const sendSig = (k: CallKind, d?: unknown) => call && link.send({ t: 'call', k, i: call.who, c: call.id, d: d === undefined ? undefined : JSON.stringify(d) })

/** can this person be called right now: a real friend, online, and you're online too */
export const callable = (p: { local?: boolean; online: boolean }) => !p.local && p.online && isOnline()

// ---------- the audio: microphone, the peer connection, the speaker, the meters ----------
const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
let mic: MediaStream | null = null
let pc: RTCPeerConnection | null = null
let speaker: HTMLAudioElement | null = null
let meterCtx: AudioContext | null = null
let meterRaf = 0
let muted = false
let pendingIce: RTCIceCandidateInit[] = []

async function getMic(): Promise<boolean> {
  if (mic) return true
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
    meter(mic, 'me')
    return true
  } catch {
    banner('Allow the microphone to make calls')
    return false
  }
}

function meter(stream: MediaStream, who: 'me' | 'them') {
  try {
    meterCtx ??= new AudioContext()
    const src = meterCtx.createMediaStreamSource(stream)
    const an = meterCtx.createAnalyser()
    an.fftSize = 256
    src.connect(an)
    const buf = new Uint8Array(an.frequencyBinCount)
    const tick = () => {
      if (!call) return
      an.getByteTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
      view?.level(who, who === 'me' && muted ? 0 : Math.min(1, peak / 40))
      meterRaf = requestAnimationFrame(tick)
    }
    tick()
  } catch {
    /* no meter: the call still works */
  }
}

function makePeer() {
  pc = new RTCPeerConnection({ iceServers: ICE })
  for (const t of mic?.getTracks() ?? []) pc.addTrack(t, mic!)
  pc.onicecandidate = (e) => e.candidate && sendSig('sig', { ice: e.candidate.toJSON() })
  pc.ontrack = (e) => {
    speaker ??= new Audio()
    speaker.autoplay = true
    speaker.srcObject = e.streams[0]
    void speaker.play().catch(() => {})
    meter(e.streams[0], 'them')
  }
  pc.onconnectionstatechange = () => {
    if (!pc || !call) return
    if (pc.connectionState === 'connected' && call.state !== 'live') live()
    if (pc.connectionState === 'failed') {
      banner('Couldn’t connect the call')
      endCall()
    }
  }
}

async function onSig(d: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }) {
  if (!call) return
  if (d.sdp) {
    if (!pc) makePeer()
    await pc!.setRemoteDescription(d.sdp)
    for (const c of pendingIce.splice(0)) await pc!.addIceCandidate(c).catch(() => {})
    if (d.sdp.type === 'offer') {
      const answer = await pc!.createAnswer()
      await pc!.setLocalDescription(answer)
      sendSig('sig', { sdp: pc!.localDescription!.toJSON() })
    }
  } else if (d.ice) {
    if (pc?.remoteDescription) await pc.addIceCandidate(d.ice).catch(() => {})
    else pendingIce.push(d.ice)
  }
}

function hangUpAudio() {
  cancelAnimationFrame(meterRaf)
  pc?.close()
  pc = null
  for (const t of mic?.getTracks() ?? []) t.stop()
  mic = null
  if (speaker) {
    speaker.pause()
    speaker.srcObject = null
  }
  pendingIce = []
  muted = false
}

export function toggleMute() {
  muted = !muted
  for (const t of mic?.getAudioTracks() ?? []) t.enabled = !muted
  if (call) view?.set(call)
}

// ---------- the call's life ----------
function logCall(c: Call, missed: boolean) {
  const s = ifr()
  s.calls.unshift({ id: c.id, who: c.who, name: c.name, dir: c.dir, missed, at: c.start, secs: missed ? 0 : Math.round((Date.now() - c.start) / 1000) })
  s.calls = s.calls.slice(0, 40)
  store()
  if (missed && c.dir === 'in') setBadge('phone', s.calls.filter((x) => x.missed && x.dir === 'in' && x.at > (s.read['calls'] ?? 0)).length)
}

export async function startCall(id: string) {
  if (call) return
  let p = await personById(id)
  // presence can lag a moment behind (they just arrived): ask the server once before saying they're away
  if (p && !p.local && !callable(p) && isOnline()) {
    await import('../../../net/multiplayer').then((m) => m.refreshFriends())
    p = await personById(id)
  }
  if (!p || !callable(p)) return banner(p?.local ? 'City locals don’t take calls' : 'They need to be online to call')
  if (!(await getMic())) return
  call = { id: Math.random().toString(36).slice(2, 10), who: id, name: p.name, look: p.look, dir: 'out', state: 'ringing', start: Date.now(), room: p.room }
  view?.set(call)
  stopRing = ring()
  sendSig('ring')
  later(() => {
    if (call?.state === 'ringing') {
      sendSig('end')
      void missedNote()
      endCall(true)
    }
  }, 30000)
}

/** an unanswered call leaves a missed-call line in your chat with them */
async function missedNote() {
  if (!call) return
  try {
    const { threadWith } = await import('../net')
    const { rest } = await import('../../../net/server')
    const th = await threadWith(call.who)
    await rest(`/phone/threads/${encodeURIComponent(th)}`, { json: { kind: 'call', meta: { missed: true } } })
  } catch {
    /* Recents has it */
  }
}

/** they picked up (or you did): connect the audio */
async function connect(asCaller: boolean) {
  if (!call) return
  stopRing?.()
  stopRing = null
  call.state = 'connecting'
  view?.set(call)
  makePeer()
  if (asCaller) {
    const offer = await pc!.createOffer()
    await pc!.setLocalDescription(offer)
    sendSig('sig', { sdp: pc!.localDescription!.toJSON() })
  }
  // still not through after a while: the network won't allow it
  later(() => {
    if (call && call.state === 'connecting') {
      banner('Couldn’t connect the call')
      endCall()
    }
  }, 15000)
}
function live() {
  if (!call) return
  call.state = 'live'
  call.start = Date.now()
  tone('unlock')
  view?.set(call)
  tickIsland()
}
async function answer() {
  if (!call || call.state !== 'ringing' || call.dir !== 'in') return
  stopRing?.()
  stopRing = null
  if (!(await getMic())) return endCall()
  sendSig('answer')
  await connect(false)
}

let isleTick = 0
function tickIsland() {
  clearInterval(isleTick)
  isleTick = window.setInterval(() => {
    if (!call || call.state !== 'live') return clearInterval(isleTick)
    const s = Math.round((Date.now() - call.start) / 1000)
    island(`📞 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 0, 'call')
  }, 1000)
}

export function endCall(missed = false, remote = false) {
  if (!call) return
  const c = call
  if (!remote) sendSig(c.state === 'ringing' && c.dir === 'in' ? 'decline' : 'end')
  stopRing?.()
  stopRing = null
  clearTimers()
  clearInterval(isleTick)
  hangUpAudio()
  logCall(c, missed || c.state === 'ringing')
  const wasLive = c.state === 'live'
  c.state = 'ended'
  view?.set(c)
  tone('lower')
  island(wasLive ? 'Call ended' : 'No answer', 1600)
  call = null
  setTimeout(() => view?.set(null), 1200)
}

// ---------- from the server (net/multiplayer.ts forwards these) ----------
export function onCallEvent(e: { k: CallKind; i: string; n: string; c: string; d?: string; r?: string | null; look?: Look }) {
  if (e.k === 'ring') {
    if (call) return link.send({ t: 'call', k: 'busy', i: e.i, c: e.c })
    call = { id: e.c, who: e.i, name: e.n, look: e.look ?? null, dir: 'in', state: 'ringing', start: Date.now(), room: e.r ?? null }
    stopRing = ring()
    // the phone comes up by itself, ringing
    void openApp('phone', 'incoming')
    later(() => {
      if (call?.id === e.c && call.state === 'ringing') {
        phoneNotify({ app: 'phone', title: e.n, text: 'Missed call', arg: e.i })
        endCall(true, true)
      }
    }, 31000)
    return
  }
  if (!call || call.id !== e.c) return
  if (e.k === 'answer' && call.dir === 'out') void connect(true)
  else if (e.k === 'sig' && e.d) {
    try {
      void onSig(JSON.parse(e.d))
    } catch {
      /* ignore a bad packet */
    }
  } else if (e.k === 'decline' || e.k === 'busy') {
    banner(e.k === 'busy' ? `${esc(call.name)} is on another call` : `${esc(call.name)} can’t talk right now`)
    endCall(true, true)
  } else if (e.k === 'end') endCall(false, true)
}

// ---------- the app ----------
export function open(ctx: Ctx, arg?: string): Screen {
  const s = screenEl(ctx, 'Phone', { back: false, big: true })
  const tabs = el('div', 'ifp-tabs', '<button class="on" data-t="recent">Recents</button><button data-t="contacts">Friends</button>')
  const list = el('div', 'ifp-list')
  s.body.append(tabs, list)
  let tab = 'recent'
  const scr = el('div', 'ifp-call')
  scr.hidden = true
  s.el.append(scr)

  const renderList = async () => {
    list.innerHTML = ''
    if (tab === 'recent') {
      const calls = ifr().calls.filter((c) => !RESIDENT[c.who])
      ifr().read['calls'] = Date.now()
      store()
      setBadge('phone', 0)
      if (!calls.length) return list.append(empty('/art/ifruit/app/phone.png', 'No Calls Yet', 'Ring a friend who’s online.'))
      for (const c of calls) {
        const row = el('button', 'ifr-row' + (c.missed ? ' ifp-missed' : ''), `<span class="ifp-dir">${c.dir === 'out' ? '↗' : '↙'}</span><span class="ifr-txt"><b>${esc(c.name)}</b><small>${c.missed ? (c.dir === 'in' ? 'Missed' : 'No answer') : `${Math.max(1, Math.round(c.secs / 60))} min`}</small></span><em>${ago(c.at)}</em>`)
        row.onclick = () => void startCall(c.who)
        list.append(row)
      }
    } else {
      const real = (await people()).friends.filter((f) => !f.local)
      if (!real.length) return list.append(empty('/art/ifruit/app/contacts.png', 'No Friends Yet', isOnline() ? 'Add friends in the city first.' : 'Calls work when you play online.'))
      for (const f of real) {
        const can = callable(f)
        const row = el('button', 'ifr-row' + (can ? '' : ' ifp-off'), `${face(f.look, f.online)}<span class="ifr-txt"><b>${esc(f.name)}</b><small>${f.online ? 'Online' : 'Offline'}</small></span><span class="ifp-ring">📞</span>`) as HTMLButtonElement
        row.disabled = !can
        row.onclick = () => void startCall(f.id)
        list.append(row)
      }
    }
  }
  for (const b of tabs.querySelectorAll<HTMLButtonElement>('button'))
    b.onclick = () => {
      tone('tap')
      tab = b.dataset.t!
      tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
      void renderList()
    }

  // the call screen sits over the app while a call is on
  const level = (who: 'me' | 'them', v: number) => {
    const ring = scr.querySelector<HTMLElement>(`.ifp-side.${who} .ifp-big`)
    ring?.style.setProperty('--lvl', v.toFixed(2))
  }
  const set = (c: Call | null) => {
    if (!c) {
      scr.hidden = true
      scr.innerHTML = ''
      void renderList()
      return
    }
    scr.hidden = false
    const status = c.state === 'ringing' ? (c.dir === 'in' ? 'Incoming call' : 'Calling…') : c.state === 'connecting' ? 'Connecting…' : c.state === 'live' ? (muted ? 'Muted' : 'On a call') : 'Call ended'
    scr.className = `ifp-call ${c.state} ${c.dir}`
    scr.innerHTML = `<div class="ifp-top"><small>${status}</small><b>${esc(c.name)}</b></div>
      <div class="ifp-faces"><div class="ifp-side them"><span class="ifp-big">${c.look ? headPortrait(c.look, 'grin') : ''}<i class="ifp-rings"></i></span></div>${c.state === 'live' ? `<div class="ifp-side me"><span class="ifp-big sm">${headPortrait(save.look, 'grin')}</span></div>` : ''}</div>
      <div class="ifp-lines"></div><div class="ifp-btns"></div>`
    const btns = scr.querySelector('.ifp-btns')!
    const extra = scr.querySelector('.ifp-lines')!
    if (c.state === 'ringing' && c.dir === 'in') {
      btns.append(act('Decline', () => endCall(false), 'red ifp-round'), act('Answer', () => void answer(), 'green ifp-round'))
    } else if (c.state !== 'ended') {
      if (c.state === 'live') {
        if (c.room && c.room !== world.room.id) extra.append(act(isHomeRoom(c.room) ? 'Go to Their Place' : `Go to ${roomName(c.room)}`, () => thenCity(() => void import('../../../net/multiplayer').then((m) => m.goToFriend(c.who))), 'blue'))
        extra.append(
          act('Report', async () => {
            const m = await import('../../../net/multiplayer')
            await m.report(c.who, c.name, 'Voice call')
            ctx.banner('Thanks. A moderator will look at it.')
          }, 'ghost ifp-report'),
        )
        btns.append(act(muted ? 'Unmute' : 'Mute', () => toggleMute(), (muted ? 'blue' : 'ghost') + ' ifp-round'))
      }
      btns.append(act('End', () => endCall(false), 'red ifp-round'))
    }
  }
  view = { set, level }
  void renderList()
  if (call) set(call)
  if (arg?.startsWith('call:')) void startCall(arg.slice(5))
  return {
    el: s.el,
    onShow: () => void renderList(),
    dispose: () => {
      view = null
      // a call keeps going in the island when you leave the app
      if (call?.state === 'live') tickIsland()
      if (!phoneIsOpen() && !call) islandOff()
    },
  }
}

export const inCall = () => !!call
