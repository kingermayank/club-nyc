import { audioCtx } from '../audio'
import { el, stage } from '../engine/stage'
import { ui, openOverlay, closeOverlay } from '../engine/ui'
import { world, onRoom, chatterOk } from '../engine/world'
import { Actor } from '../engine/actor'
import { sfx } from '../audio'
import type { Look } from '../avatar/look'
import type { Game } from '../types'
import { closeUp } from './moments/closeup'
import { gameCard, tile, key, me, icon } from './gamecard'

/**
 * The Times Sq–42 St platform, alive: Lou the busker by his guitar case (click it and he plays you a song: real plucked
 * strings made in the browser), the Pizza Rat who bolts for the tracks when you get too
 * close, and two games with no signs, found by playing: dance on the platform for Showtime, and pester the Pizza Rat
 * until he challenges you to Rush Hour Run. "Board the Train" is only ever a train ride. Room hooks register on import (game.ts).
 */
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

// ---------- the guitar: Karplus-Strong plucked strings ----------
const strings = new Map<number, AudioBuffer>()
/** one plucked note, made once per pitch: a burst of noise fed through a short delay line loses its fizz and rings */
function pluck(ctx: BaseAudioContext, midi: number): AudioBuffer {
  const hit = strings.get(midi)
  if (hit && hit.sampleRate === ctx.sampleRate) return hit
  const rate = ctx.sampleRate
  const buf = ctx.createBuffer(1, Math.round(rate * 1.8), rate)
  const out = buf.getChannelData(0)
  const period = Math.round(rate / (440 * 2 ** ((midi - 69) / 12)))
  const line = new Float32Array(period).map(() => Math.random() * 2 - 1)
  for (let i = 0; i < out.length; i++) {
    const j = i % period
    const next = line[(j + 1) % period]
    out[i] = line[j]
    line[j] = (line[j] + next) * 0.5 * 0.996
  }
  strings.set(midi, buf)
  return buf
}
function playNote(ctx: AudioContext, bus: AudioNode, midi: number, at: number, vol: number) {
  const src = ctx.createBufferSource()
  src.buffer = pluck(ctx, midi)
  const g = ctx.createGain()
  g.gain.value = vol
  src.connect(g).connect(bus)
  src.start(at)
}
/** Lou's songs (his own, he'll tell you): chords as five strings, low to high, fingerpicked in `pattern` */
const C = [48, 55, 60, 64, 67]
const G = [43, 55, 59, 62, 67]
const Am = [45, 57, 60, 64, 69]
const F = [41, 57, 60, 65, 69]
const SETLIST = [
  { title: 'Uptown Lullaby', note: 'Slow and soft', bpm: 84, chords: [C, G, Am, F], pattern: [0, 2, 3, 4, 3, 2, 3, 4], bars: 8 },
  { title: 'The Express Rag', note: 'Fast, with a swing', bpm: 132, chords: [C, [45, 57, 61, 64, 67], [50, 57, 60, 66, 69], [43, 55, 59, 62, 65]], pattern: [0, 3, 1, 4, 0, 3, 2, 4], bars: 8 },
  { title: 'Last Train Home', note: 'A little blue', bpm: 76, chords: [Am, F, C, [40, 52, 56, 62, 64]], pattern: [0, 2, 3, 4, 3, 2, 3, 4], bars: 6 },
]
type Song = (typeof SETLIST)[number]

/** Lou plays one song through, then stops. Returns a stop function; `done` runs when the song ends on its own. */
function perform(song: Song, onBeat: (downbeat: boolean) => void, done: () => void): () => void {
  const eighth = 60 / song.bpm / 2
  const total = song.bars * 8
  let bus: GainNode | null = null
  let step = 0
  let next = 0
  let ctx = audioCtx()
  if (ctx) {
    // a little room: soften the top, keep it under the city
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 2800
    bus = ctx.createGain()
    bus.gain.value = 0.6
    bus.connect(tone).connect(ctx.destination)
    next = ctx.currentTime + 0.15
  }
  const started = performance.now()
  const timer = window.setInterval(() => {
    ctx = audioCtx()
    // muted: the show goes on (the beat keeps time), just silently
    const now = ctx ? ctx.currentTime : (performance.now() - started) / 1000
    if (!ctx) next = Math.max(next, now)
    while (step < total && next < now + 0.35) {
      const chord = song.chords[Math.floor(step / 8) % song.chords.length]
      if (ctx && bus) playNote(ctx, bus, chord[song.pattern[step % 8]], next, step % 8 === 0 ? 0.12 : 0.075)
      const downbeat = step % 4 === 0
      const lead = Math.max(0, (next - now) * 1000)
      window.setTimeout(() => onBeat(downbeat), lead)
      next += eighth
      step++
    }
    if (step >= total) {
      clearInterval(timer)
      // the last chord, strummed
      if (ctx && bus) song.chords[0].forEach((n, i) => playNote(ctx!, bus!, n, next + i * 0.03, 0.1))
      window.setTimeout(done, Math.max(0, (next - now) * 1000) + 1400)
    }
  }, 120)
  return () => {
    clearInterval(timer)
    const b = bus
    bus = null
    if (b && ctx) {
      b.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15)
      window.setTimeout(() => b.disconnect(), 600)
    }
  }
}

/**
 * Lou's guitar case. Quiet until you ask: pick a song and he picks up the guitar and plays it for you, notes
 * floating off the strings. While he plays, the case takes tips.
 */
export function busker(g: Game) {
  if (!lou) return
  if (playing) return tip(g)
  // the open case, up close: his setlist is taped inside the lid. Click a song and he plays it.
  const c = closeUp('cu-setlist', '/art/closeups/setlist.jpg')
  c.m.later(() => sfx.coin(), 450)
  const list = el('div', 'lou-setlist', `<h3>Tonight</h3>` + SETLIST.map((song, i) => `<button type="button" data-i="${i}"><b>${song.title}</b><span>${song.note}</span></button>`).join(''))
  list.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => (c.m.close(), play(g, SETLIST[Number(b.dataset.i)]))))
  c.layer.append(list)
  c.pin([330, 398], 'Tip a Coin', () => void import('./moments/riff').then((m) => m.playTheRiff(g)))
}

let playing: (() => void) | null = null
function play(g: Game, song: Song) {
  const a = lou
  if (!a || playing) return
  const guitar = el('img', 'lou-guitar') as HTMLImageElement
  guitar.src = '/art/icons/e/guitar.png'
  guitar.alt = ''
  a.wrap.append(guitar)
  a.wrap.classList.add('busking')
  a.say(`This one’s called “${song.title}”. 🎸`, 2600)
  const note = () => {
    const n = el('img', 'lou-note') as HTMLImageElement
    n.src = '/art/icons/e/music-notes.png'
    n.alt = ''
    n.style.setProperty('--drift', `${Math.round((Math.random() - 0.3) * 60)}px`)
    a.wrap.append(n)
    n.addEventListener('animationend', () => n.remove())
  }
  const stop = perform(
    song,
    (downbeat) => {
      guitar.classList.remove('strum')
      void guitar.offsetWidth
      guitar.classList.add('strum')
      if (downbeat && Math.random() < 0.7) note()
    },
    () => {
      end()
      a.say(pick(['Thank you, thank you. I’m here all week. And all next week.', 'That one never gets old. Unlike me.', 'You’ve been a lovely platform.']))
      g.sfx.coin()
    },
  )
  const end = () => {
    stop()
    guitar.remove()
    a.wrap.classList.remove('busking')
    playing = null
  }
  playing = end
}

/** a coin in the case while he plays: a little run up the neck */
function tip(g: Game) {
  if (!g.spend(1, 'busker-tip')) return
  g.sfx.coin()
  const ctx = audioCtx()
  if (ctx) [72, 76, 79, 84].forEach((n, i) => playNote(ctx, ctx.destination, n, ctx.currentTime + 0.05 + i * 0.09, 0.08))
  lou?.say(pick(['Thank you kindly!', 'A patron of the arts!', 'That’s a MetroCard swipe and a half. Thanks!']), 2400)
  g.say('A coin for the music. 🎸')
}

// ---------- Lou, the busker ----------
const LOU: Look = { skin: 4, hair: 'short', hairColor: 0, items: { head: 'beret', body: 'denim-jacket', legs: 'black-jeans', feet: 'boots' } }
const SONGS = [
  '🎶 Took the A train, missed my stop again 🎶',
  '🎶 Two dollars ninety, worth every cent 🎶',
  '🎶 This one’s for the rat with the slice 🎶',
  '🎶 Showtime’s at nine and I’m on at ten 🎶',
  'Requests? I know four chords. Pick a song from the case.',
  '🎶 Stand clear of the closing doors, my love 🎶',
]
let lou: Actor | null = null
function spawnLou(): () => void {
  const nav = world.nav
  if (!nav) return () => {}
  // by his guitar case, facing the platform
  const a = new Actor({ ...LOU, items: { ...LOU.items } }, 'Lou the Busker', nav.nearest([238, 330]))
  a.mob = true
  a.setTag('Lou the Busker')
  world.npcs.push(a)
  stage.scene.append(a.wrap)
  lou = a
  let alive = true
  const step = () => {
    if (!alive || !a.wrap.isConnected) return
    // (mid-request he's busy playing)
    if (!playing) {
      if (chatterOk(6000)) a.say(pick(SONGS))
      else a.emote(pick(['dance', 'wave'] as const), 2)
    }
    timer = window.setTimeout(step, 7000 + Math.random() * 6000)
  }
  let timer = window.setTimeout(step, 1800)
  return () => {
    alive = false
    clearTimeout(timer)
    playing?.()
    if (lou === a) lou = null
  }
}

// ---------- the Pizza Rat ----------
/**
 * Click him and he does the Pizza Rat scramble: quick nervous hops and a head bob with the slice. He stays on his
 * spot (the platform art has him painted underneath; if the cutout ran off you'd see two rats).
 */
export function pizzaRat(g: Game) {
  g.sfx.squawk()
  g.say(pick(['PIZZA RAT. A legend. Bigger in person.', 'He’s not running from me. He’s running TO something.', 'That slice is bigger than him. Respect.']))
  g.stamp('pizza-rat')
  // the third time you bother him in one visit, he's had enough: a race to the end of the platform
  ratPokes++
  if (ratPokes === 3) {
    window.setTimeout(() => g.say('He just looked at me. He wants a race. Of course he does.'), 1200)
    window.setTimeout(() => world.room.id === 'subway' && void import('../mp/hub').then((m) => m.openGameCard('runner')), 2600)
  }
  const rat = [...stage.scene.querySelectorAll<HTMLImageElement>('.cutout')].find((i) => i.src.includes('/subway/rat.'))
  if (!rat || rat.dataset.running) return
  rat.dataset.running = '1'
  rat.style.transformOrigin = '30% 100%'
  const hop = (y: number, r: number) => ({ transform: `translateY(${y}px) rotate(${r}deg)` })
  const run = rat.animate(
    [hop(0, 0), hop(-7, -5), hop(0, 2), hop(-9, 6), hop(0, -3), hop(-6, -6), hop(0, 4), hop(-4, 3), hop(0, 0)],
    { duration: 1100, easing: 'ease-in-out' },
  )
  run.onfinish = () => delete rat.dataset.running
}
let ratPokes = 0

// ---------- Showtime, hidden ----------
/**
 * No sign: dance on the platform for a couple of seconds and the riders call it ("What time is it?" "SHOWTIME!"),
 * then the Showtime card opens. Once per visit, so it stays a surprise.
 */
function showtimeEgg(): () => void {
  let since = 0
  let called = false
  const timer = window.setInterval(() => {
    if (called || ui.busy || world.room.id !== 'subway') return
    if (world.player.view.pose !== 'dance') return void (since = 0)
    since ||= performance.now()
    if (performance.now() - since < 1800) return
    called = true
    const riders = world.npcs.filter((a) => a !== lou && !a.leaving)
    const caller = riders[0]
    caller?.say('What time is it?!', 2200)
    sfx.whoosh()
    window.setTimeout(() => {
      riders.slice(1, 3).forEach((a) => (a.say('SHOWTIME!', 2000), a.emote('dance', 3)))
      if (riders.length < 2) caller?.say('SHOWTIME!', 2000)
    }, 900)
    window.setTimeout(() => world.room.id === 'subway' && showtimeCard(), 2100)
  }, 300)
  return () => clearInterval(timer)
}

function showtimeCard() {
  const arrow = (k: string, color: string, lane: number, delay: number) =>
    `<span class="gc-arrow" style="left:${20 + lane * 20}%;background:${color};animation-delay:${delay}s">${k}</span>`
  const card = gameCard({
    art: '/art/rooms/subway-car.jpg',
    place: 'Times Sq–42 St',
    title: 'Showtime!',
    tagline: 'What time is it? Your time.',
    tiles: [
      tile(arrow('←', '#b36bff', 0, 0) + arrow('↑', '#3ed27c', 1, 0.5) + arrow('↓', '#3f8ff2', 2, 1) + arrow('→', '#ff5c5c', 3, 0.25), 'Hit the Beat', key('←') + key('↑') + key('↓') + key('→'), 'gc-arrows gc-stage'),
      tile(me('dance', 0.4), 'Keep the Combo', '', 'gc-groove gc-stage'),
      tile([0, 0.5, 1].map((d, i) => icon('coin', 'gc-coin', `left:${26 + i * 24}px;animation-delay:${d}s`)).join('') + me('cheer', 0.3), 'Riders Tip', '', 'gc-tips gc-stage'),
    ],
    primary: { label: 'Start the Show', sub: 'One song, one car, one chance', icon: 'dancer', act: () => {
      closeOverlay()
      void import('../game').then((m) => m.api.playGame('showtime'))
    } },
  })
  openOverlay(card.el)
}

onRoom('subway', () => {
  ratPokes = 0
  const offLou = spawnLou()
  const offShowtime = showtimeEgg()
  return () => {
    offShowtime()
    offLou()
  }
})
