import type { MiniGame, MiniGameContext } from '../types'
import type { AvatarView, Pose } from '../../avatar/render'
import type { Look } from '../../avatar/look'
import { save } from '../../state'
import { BAR, SPB, SONG_BARS, Song, Synth, buildChart, sectionOf, type ChartNote, type Difficulty } from './music'
import { World } from './world'
import { LANES, bulletSVG, hatPile, hatSVG, keyTile, noteSVG, receptorSVG, sparkSVG } from './art'
import './style.css'

// ---------- assets & layout (logical 1000 × 565, measured on subway-car.jpg) ----------
const BG = '/art/rooms/subway-car.jpg'
const COIN = '/art/icons/coin.png'
const PIGEON = '/art/sprites/pigeon.png'

const HIT_Y = 318
const LANE_X = [413, 471, 529, 587]
const LANE_W = 58
const NOTES_X = 380 // the notes window (clips missed notes under the hit line)
const NOTES_H = 372
const TILE = 54
const SPAWN_Y = -44

const PLAYER = { x: 500, y: 530, unit: 1 }
const HAT = { x: 592, y: 556 }
const HAT_MOUTH = { x: 592, y: 516 }
const POLES = [372, 627]
const SEATS = [64, 134, 222, 310, 690, 778, 866, 936]
const RIDER_U = 0.82
const SEAT_Y = 401 // where a rider's hips rest

const DIFF = {
  easy: { label: 'Easy', sub: 'Local', look: 1.25, perfect: 0.06, good: 0.12, boo: 0.18, tipP: 0.12, tipG: 0.06 },
  hard: { label: 'Hard', sub: 'Express', look: 0.9, perfect: 0.045, good: 0.1, boo: 0.15, tipP: 0.09, tipG: 0.045 },
} as const

// intro timeline, seconds after Start
const T_DOORS = 1.3
const T_DOORS_LEN = 0.6
const T_DEPART = 2.3
const T_COUNTIN = 3.4 // "WHAT TIME IS IT?" — one bar later: "SHOWTIME!"
// the ride
const V_MAX = 1000
const ACC_T = 5
const DEC_T = 6
const DEC_BAR = 38
// arrival
const T_OPEN = 0.75
const T_OPEN_LEN = 0.6

const KEYS: Record<string, number> = {
  ArrowLeft: 0, ArrowUp: 1, ArrowDown: 2, ArrowRight: 3,
  a: 0, w: 1, s: 2, d: 3, A: 0, W: 1, S: 2, D: 3,
}

const CHEERS = ['WOO!', 'AYY!', 'YERRR!', "LET'S GO!", 'SHEESH!', 'BRAVO!', 'GO OFF!', 'OK OK!', 'Showtime!']
const BOOS = ['Meh.', 'Ugh.', 'Not today.', '...', '*yawn*', 'Watch the pole!', 'Mind the gap.']
const COMEBACKS = ['OK, I see you!', 'Aight, aight!', 'Respect!', 'Now we talkin!']
const CALLOUTS: Record<number, string> = { 10: 'NICE!', 20: 'FRESH!', 30: 'ON FIRE!', 50: 'UNSTOPPABLE!', 75: 'LEGENDARY!', 100: 'SUBWAY ROYALTY!' }
const TRICKS = [
  { kind: 'spin', name: 'SPIN!' },
  { kind: 'flip', name: 'BACKFLIP!' },
  { kind: 'pole', name: 'POLE TRICK!' },
] as const
type TrickKind = (typeof TRICKS)[number]['kind']

type Phase = 'title' | 'intro' | 'play' | 'outro' | 'results' | 'done'
type Judgement = 'perfect' | 'good' | 'miss'
type RiderState = 'idle' | 'watch' | 'cheer' | 'away' | 'toss'

interface Note extends ChartNote {
  el: HTMLElement | null
  done: boolean
  res: Judgement | null
}

interface Rider {
  view: AvatarView
  wrap: HTMLDivElement
  x: number
  y: number
  d: 1 | -1
  state: RiderState
  stateT: number
  hold: number
  winBack: number
  bubble: HTMLDivElement | null
}

interface Coin {
  el: HTMLImageElement
  x0: number
  y0: number
  x1: number
  y1: number
  t0: number
  dur: number
  arc: number
}

/** seconds per pose-cycle so the avatar's built-in dances land on the beat */
const POSE_RATE: Partial<Record<Pose, number>> = { dance: Math.PI / 8, cheer: Math.PI / 6, skate: Math.PI / 6.4, wave: Math.PI / 7 }

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const ease = (p: number) => 1 - (1 - clamp(p)) ** 3
const easeIO = (p: number) => {
  const x = clamp(p)
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

class Showtime {
  private ctx: MiniGameContext
  private root: HTMLDivElement
  private car: HTMLDivElement
  private bg: HTMLImageElement
  private world: World
  private led: HTMLDivElement
  private ledText: HTMLSpanElement
  private ledW = 0
  private ledAt = 0
  private ridersLayer: HTMLDivElement
  private bubbles: HTMLDivElement
  private coinLayer: HTMLDivElement
  private hat: HTMLDivElement
  private hatPileG: SVGGElement | null
  private pw: HTMLDivElement
  private pr: HTMLDivElement
  private ps: HTMLDivElement
  private player: AvatarView
  private dark: HTMLDivElement
  private spot: HTMLDivElement
  private flash: HTMLDivElement
  private party: HTMLDivElement
  private hw: HTMLDivElement
  private notesEl: HTMLDivElement
  private linesEl: HTMLDivElement
  private beatLines: HTMLDivElement[] = []
  private recs: HTMLDivElement[] = []
  private recInner: HTMLDivElement[] = []
  private fxEl: HTMLDivElement
  private hud: HTMLDivElement
  private scoreEl: HTMLElement
  private tipsEl: HTMLElement
  private tripTrain: HTMLElement
  private tripFill: HTMLElement
  private judgeEl: HTMLDivElement
  private comboEl: HTMLDivElement
  private comboNum: HTMLElement
  private calloutEl: HTMLDivElement
  private banner: HTMLDivElement
  private lanesEl: HTMLDivElement
  private cardWrap: HTMLDivElement

  private phase: Phase = 'title'
  private diff: Difficulty = 'easy'
  private syn: Synth | null = null
  private song: Song | null = null
  private T0 = 0
  private songStart = 0
  private arriveAt = 0
  private endX = 0
  private clockOff = 0
  private clockReady = false
  private paused = false
  private pausedNow = 0
  private now = 0
  private lastTs = 0
  private raf = 0
  private timer = 0
  private lastRumble = 0
  private muted = false
  private cues: { at: number; fn: () => void; done: boolean }[] = []

  private notes: Note[] = []
  private pending = 0
  private pool: HTMLElement[][] = [[], [], [], []]
  private down = [false, false, false, false]
  private pointerLane = new Map<number, number>()

  private score = 0
  private combo = 0
  private maxCombo = 0
  private streak = 0
  private counts = { perfect: 0, good: 0, miss: 0 }
  private tips = 0
  private tipAcc = 0
  private pendingTips = 0
  private lastToss = 0
  private lastCoinSfx = 0
  private coins: Coin[] = []
  private hatShown = -1
  private riders: Rider[] = []

  private trick: { kind: TrickKind; start: number; dur: number; pole: number } | null = null
  private trickCount = 0
  private stumbleUntil = 0
  private squash = 0
  private playerD: 1 | -1 = 1
  private flashAt = -99
  private shakeAt = -99
  private resultsAt = Infinity
  private finaleDone = false
  private lastCombo = 0
  private grade = 'C'
  private ended = false
  private cleanup: (() => void)[] = []

  constructor(ctx: MiniGameContext) {
    this.ctx = ctx
    ctx.root.innerHTML = ''
    this.root = el('div', 'showtime')
    ctx.root.append(this.root)

    // ----- the car (everything that rocks) -----
    this.car = el('div', 'showtime-car')
    this.bg = el('img', 'showtime-bg')
    this.bg.src = BG
    this.bg.alt = ''
    this.bg.draggable = false
    const pigeon = new Image()
    pigeon.src = PIGEON
    this.world = new World(this.bg, pigeon)
    pigeon.onload = () => this.world.refreshPlatforms(pigeon)
    this.led = el('div', 'showtime-led')
    this.ledText = el('span', 'showtime-led-text')
    this.led.append(this.ledText)
    this.ridersLayer = el('div', 'showtime-layer')
    this.pw = el('div', 'showtime-av')
    this.pr = el('div', 'showtime-av-rot')
    this.ps = el('div', 'showtime-av-squash')
    this.player = ctx.avatar(ctx.look, PLAYER.unit)
    this.ps.append(this.player.el)
    this.pr.append(this.ps)
    this.pw.append(this.pr)
    this.hat = el('div', 'showtime-hat', hatSVG())
    this.hatPileG = this.hat.querySelector('.showtime-hat-pile')
    this.coinLayer = el('div', 'showtime-layer')
    this.bubbles = el('div', 'showtime-layer')
    this.car.append(this.bg, this.world.canvas, this.led, this.ridersLayer, this.pw, this.hat, this.coinLayer, this.bubbles)

    // ----- lighting -----
    this.dark = el('div', 'showtime-dark')
    this.spot = el('div', 'showtime-spot')
    this.party = el('div', 'showtime-party')
    this.flash = el('div', 'showtime-flash')

    // ----- the note highway -----
    this.hw = el('div', 'showtime-hw')
    const back = el('div', 'showtime-hw-back')
    this.linesEl = el('div', 'showtime-hw-lines')
    this.notesEl = el('div', 'showtime-hw-notes')
    for (let i = 0; i < 8; i++) {
      const l = el('div', 'showtime-beatline')
      this.linesEl.append(l)
      this.beatLines.push(l)
    }
    this.notesEl.append(this.linesEl)
    const recRow = el('div', 'showtime-recs')
    for (let i = 0; i < 4; i++) {
      const r = el('div', 'showtime-rec')
      r.style.left = `${LANE_X[i] - TILE / 2}px`
      r.style.top = `${HIT_Y - TILE / 2}px`
      const inner = el('div', 'showtime-rec-inner', receptorSVG(i))
      r.append(inner)
      recRow.append(r)
      this.recs.push(r)
      this.recInner.push(inner)
    }
    this.fxEl = el('div', 'showtime-layer')
    this.hw.append(back, this.notesEl, recRow, this.fxEl)

    // ----- HUD -----
    this.hud = el('div', 'showtime-hud')
    const scoreP = el(
      'div',
      'showtime-panel showtime-scorep',
      `<div class="showtime-scorerow"><small>SCORE</small><b class="showtime-score">0</b></div>
       <div class="showtime-trip"><span>34 St</span><div class="showtime-trip-line"><i class="showtime-trip-fill"></i><i class="showtime-trip-train"></i></div><span>Times Sq</span></div>`,
    )
    this.scoreEl = scoreP.querySelector('.showtime-score')!
    this.tripFill = scoreP.querySelector('.showtime-trip-fill')!
    this.tripTrain = scoreP.querySelector('.showtime-trip-train')!
    const tipsP = el('div', 'showtime-panel showtime-tipsp', `<img src="${COIN}" alt=""><div><small>TIPS</small><b class="showtime-tips">0</b></div>`)
    this.tipsEl = tipsP.querySelector('.showtime-tips')!
    const pauseBtn = el('button', 'showtime-pause', '<i></i><i></i>')
    pauseBtn.setAttribute('aria-label', 'Pause')
    pauseBtn.addEventListener('click', () => (this.paused ? this.resume() : this.pause()))
    this.judgeEl = el('div', 'showtime-judge')
    this.comboEl = el('div', 'showtime-combo', '<b>0</b><small>COMBO</small>')
    this.comboNum = this.comboEl.querySelector('b')!
    this.calloutEl = el('div', 'showtime-callout')
    this.hud.append(scoreP, tipsP, pauseBtn, this.judgeEl, this.comboEl, this.calloutEl)

    // ----- touch / click lanes -----
    this.lanesEl = el('div', 'showtime-lanes')
    for (let i = 0; i < 4; i++) {
      const z = el('div', 'showtime-lane')
      z.style.left = `${LANE_X[i] - LANE_W / 2}px`
      z.setAttribute('aria-label', `${LANES[i].name} lane`)
      z.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        try {
          z.setPointerCapture(e.pointerId)
        } catch {
          /* synthetic pointer */
        }
        this.pointerLane.set(e.pointerId, i)
        this.press(i, e.timeStamp)
      })
      const up = (e: PointerEvent) => {
        if (this.pointerLane.get(e.pointerId) === i) {
          this.pointerLane.delete(e.pointerId)
          this.release(i)
        }
      }
      z.addEventListener('pointerup', up)
      z.addEventListener('pointercancel', up)
      this.lanesEl.append(z)
    }

    this.banner = el('div', 'showtime-banner')
    this.cardWrap = el('div', 'showtime-cardwrap')
    this.root.append(this.car, this.dark, this.spot, this.party, this.flash, this.hw, this.hud, this.lanesEl, this.banner, this.cardWrap)

    // ----- people -----
    this.placeRiders()
    this.layoutPlayer(0, 0, 0, 1, 1)

    // ----- input & lifecycle -----
    const onKey = (e: KeyboardEvent) => this.onKey(e, true)
    const onKeyUp = (e: KeyboardEvent) => this.onKey(e, false)
    const onVis = () => {
      if (document.hidden) this.pause()
    }
    const onResize = () => this.fit()
    addEventListener('keydown', onKey)
    addEventListener('keyup', onKeyUp)
    document.addEventListener('visibilitychange', onVis)
    addEventListener('resize', onResize)
    this.cleanup.push(() => {
      removeEventListener('keydown', onKey)
      removeEventListener('keyup', onKeyUp)
      document.removeEventListener('visibilitychange', onVis)
      removeEventListener('resize', onResize)
    })
    ctx.onExit(() => this.dispose())

    this.fit()
    this.showTitle()
    this.raf = requestAnimationFrame(this.frame)
  }

  // =====================================================================
  // setup
  // =====================================================================
  private fit() {
    const w = this.root.getBoundingClientRect().width || 1000
    this.world.resize((w / 1000) * (devicePixelRatio || 1))
  }

  private placeRiders() {
    const n = 4 + Math.floor(Math.random() * 3) // 4–6 riders
    const left = [0, 1, 2, 3].sort(() => Math.random() - 0.5)
    const right = [4, 5, 6, 7].sort(() => Math.random() - 0.5)
    const nl = Math.max(2, Math.min(n - 2, Math.round(n / 2 + (Math.random() - 0.5))))
    const chosen = [...left.slice(0, nl), ...right.slice(0, n - nl)].sort((a, b) => a - b)
    for (const s of chosen) {
      const look: Look = this.ctx.randomLook()
      const view = this.ctx.avatar(look, RIDER_U)
      const wrap = el('div', 'showtime-av')
      wrap.append(view.el)
      this.ridersLayer.append(wrap)
      const d: 1 | -1 = s < 4 ? 1 : -1
      const r: Rider = { view, wrap, x: SEATS[s], y: SEAT_Y + 35 * RIDER_U, d, state: 'idle', stateT: 0, hold: 0, winBack: 0, bubble: null }
      view.face(d, false)
      view.setPose('sit')
      wrap.style.transform = `translate(${r.x}px, ${r.y}px)`
      this.riders.push(r)
    }
  }

  // =====================================================================
  // cards
  // =====================================================================
  private showCard(card: HTMLElement, top = false) {
    this.cardWrap.innerHTML = ''
    this.cardWrap.append(card)
    this.cardWrap.classList.toggle('is-top', top)
    this.cardWrap.classList.add('is-on')
  }
  private hideCard() {
    this.cardWrap.classList.remove('is-on', 'is-top')
    this.cardWrap.innerHTML = ''
  }

  private showTitle() {
    this.root.classList.add('is-title')
    const card = el(
      'div',
      'showtime-card',
      `<div class="showtime-logo"><span class="showtime-logo-q">What time is it?</span><span class="showtime-logo-main">SHOWTIME!</span></div>
       <div class="showtime-keys">${[0, 1, 2, 3].map((i) => keyTile(i)).join('')}</div>
       <p>Press <b>← ↑ ↓ →</b> (or tap the lanes) as arrows hit the line.<br>Keep the combo going and riders tip. Miss, and they look away.</p>
       <div class="showtime-diffs">
         <button class="showtime-diff is-on" data-d="easy"><span class="showtime-diff-bullet">${bulletSVG('7', '#b933ad')}</span><span><b>Easy</b><small>Local · all stops</small></span></button>
         <button class="showtime-diff" data-d="hard"><span class="showtime-diff-bullet">${bulletSVG('7', '#b933ad', true)}</span><span><b>Hard</b><small>Express · hold on!</small></span></button>
       </div>
       <button class="btn showtime-go">Start the show</button>`,
    )
    const diffs = [...card.querySelectorAll<HTMLButtonElement>('.showtime-diff')]
    for (const b of diffs) {
      b.addEventListener('click', () => {
        this.ctx.sfx.click()
        this.diff = b.dataset.d === 'hard' ? 'hard' : 'easy'
        for (const o of diffs) o.classList.toggle('is-on', o === b)
      })
    }
    card.querySelector('.showtime-go')!.addEventListener('click', () => this.begin())
    this.showCard(card)
  }

  private showPauseCard() {
    const card = el(
      'div',
      'showtime-card showtime-card-sm',
      `<h2 class="showtime-h2">Paused</h2><p>Hold onto the pole!</p>
       <div class="showtime-row"><button class="btn showtime-resume">Resume</button><button class="btn showtime-btn-red showtime-quit">End show</button></div>`,
    )
    card.querySelector('.showtime-resume')!.addEventListener('click', () => this.resume())
    card.querySelector('.showtime-quit')!.addEventListener('click', () => this.finish())
    this.showCard(card)
  }

  // =====================================================================
  // flow
  // =====================================================================
  private async begin() {
    if (this.phase !== 'title') return
    this.phase = 'intro'
    this.ctx.sfx.click()
    this.hideCard()
    this.root.classList.remove('is-title')
    const syn = new Synth()
    this.syn = syn
    this.muted = save.muted
    syn.setMuted(this.muted)
    try {
      await syn.ac.resume()
    } catch {
      /* will retry on the next gesture */
    }
    if (this.ended) {
      syn.close()
      return
    }
    const ac = syn.ac
    this.T0 = ac.currentTime + 0.15
    this.songStart = this.T0 + T_COUNTIN + BAR
    const decAt = this.songStart + DEC_BAR * BAR
    this.arriveAt = decAt + DEC_T
    this.endX = this.trainAt(decAt).x + (V_MAX * DEC_T) / 2
    this.song = new Song(syn, this.songStart)
    this.notes = buildChart(this.diff).map((n) => ({ ...n, el: null, done: false, res: null }))
    this.root.classList.add('is-' + this.diff)

    const T0 = this.T0
    syn.startRumble()
    syn.doorSlide(T0 + T_DOORS, T_DOORS_LEN)
    syn.thunk(T0 + T_DOORS + T_DOORS_LEN)
    syn.hiss(T0 + T_DOORS + T_DOORS_LEN + 0.05)
    syn.clack(T0 + T_DEPART + 1.4, 0.5)
    syn.clack(T0 + T_DEPART + 2.4, 0.7)
    syn.clack(this.arriveAt - 2.2, 0.6)
    syn.clack(this.arriveAt - 1.1, 0.45)
    syn.thunk(this.arriveAt)
    syn.hiss(this.arriveAt + T_OPEN)
    syn.doorSlide(this.arriveAt + T_OPEN, T_OPEN_LEN)

    this.cue(T0, () => {
      this.ctx.sfx.chime()
      this.setLed('STAND CLEAR OF THE CLOSING DOORS, PLEASE')
    })
    this.cue(T0 + T_COUNTIN, () => this.whatTime())
    this.cue(this.songStart, () => this.showtime())
    this.cue(this.songStart + 22 * BAR, () => (this.flashAt = this.now))
    this.cue(this.songStart + 30 * BAR, () => (this.flashAt = this.now))
    this.cue(this.songStart + 39 * BAR, () => (this.flashAt = this.now))
    this.cue(this.songStart + DEC_BAR * BAR, () => this.setLed('NOW ARRIVING:  42 ST - TIMES SQUARE'))
    this.cue(this.arriveAt + 0.25, () => this.ctx.sfx.ding())
    this.cue(this.arriveAt + T_OPEN + 0.3, () => this.finale())

    this.timer = window.setInterval(() => {
      if (!this.paused) this.song?.pump()
    }, 40)
    this.song.pump()
  }

  private cue(at: number, fn: () => void) {
    this.cues.push({ at, fn, done: false })
  }

  private whatTime() {
    this.popBanner('WHAT TIME IS IT?', 'showtime-banner-q')
    this.hw.classList.add('is-on')
    this.hud.classList.add('is-on')
    let jaded = false
    for (const r of this.riders) {
      if (!jaded && Math.random() < 0.45) {
        jaded = true
        this.setRider(r, 'away', 0, 12 + Math.floor(Math.random() * 6))
        this.say(r, 'Not again...')
      } else this.setRider(r, 'watch')
    }
  }

  private showtime() {
    this.phase = 'play'
    this.popBanner('SHOWTIME!', 'showtime-banner-go', true)
    this.flashAt = this.now
    this.ledText.textContent = ''
    this.led.classList.remove('is-on')
    for (const r of this.riders) if (r.state === 'watch') this.setRider(r, 'cheer', 1.2)
    const r = this.riders.find((x) => x.state === 'cheer')
    if (r) this.say(r, 'SHOWTIME!')
  }

  private finale() {
    if (this.finaleDone || this.ended) return
    this.finaleDone = true
    this.phase = 'outro'
    this.hw.classList.remove('is-on')
    const acc = this.accuracy()
    this.grade = acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.7 ? 'B' : acc >= 0.5 ? 'C' : 'D'
    const bonus = { S: 5, A: 4, B: 3, C: 2, D: 1 }[this.grade] ?? 1
    // everyone who's watching applauds; a good show wins back the holdouts
    for (const r of this.riders) {
      if (r.state !== 'away' || acc >= 0.7) this.setRider(r, 'cheer', 2.6)
    }
    const fans = this.riders.filter((r) => r.state === 'cheer')
    if (fans.length) this.say(pick(fans), acc >= 0.85 ? 'ENCORE!' : pick(CHEERS))
    if (this.syn) this.syn.crowd(this.syn.ac.currentTime + 0.05, 2.2, 1.2)
    let gift = bonus + Math.round(this.tipAcc)
    this.tipAcc = 0
    const total = this.tips + this.pendingTips + this.coins.length + gift
    if (total < 3) {
      gift += 3 - total
      const kind = this.riders[Math.floor(Math.random() * this.riders.length)]
      if (kind) this.say(kind, 'Here, kid.')
    }
    this.pendingTips += gift
    this.resultsAt = this.now + 2.4
  }

  private showResults() {
    this.phase = 'results'
    const acc = this.accuracy()
    const g = this.grade
    const color = g === 'S' ? '#808183' : g === 'A' || g === 'C' ? '#0039a6' : '#ff6319'
    const blurb: Record<string, string> = {
      S: 'Like the 42 St Shuttle: legendary.',
      A: 'The whole car is talking about you.',
      B: 'Solid show. Somebody filmed it.',
      C: 'Not bad for a Tuesday.',
      D: 'Tough crowd. Practice on the local.',
    }
    const d = DIFF[this.diff]
    const card = el(
      'div',
      'showtime-card showtime-results',
      `<div class="showtime-results-head">SHOW'S OVER!</div>
       <div class="showtime-rank${g === 'S' || g === 'A' ? ' is-shiny' : ''}"><span class="showtime-rank-bullet">${bulletSVG(g, color)}</span>
         <div><b>Rank ${g}</b><small>${blurb[g]}</small></div></div>
       <div class="showtime-stats">
         <div><b>${Math.round(acc * 100)}%</b><small>accuracy</small></div>
         <div><b>${this.maxCombo}</b><small>best combo</small></div>
         <div><b>${this.counts.perfect}/${this.counts.good}/${this.counts.miss}</b><small>perfect/good/miss</small></div>
       </div>
       <div class="showtime-results-tips"><img src="${COIN}" alt=""><b>${this.tips}</b> tips in the hat <small>· ${d.label} (${d.sub})</small></div>
       <button class="btn showtime-go showtime-collect">Collect tips<i class="showtime-collect-bar"></i></button>`,
    )
    card.querySelector('.showtime-collect')!.addEventListener('click', () => this.finish())
    this.showCard(card, true)
    this.ctx.sfx.stamp()
  }

  private finish() {
    if (this.ended) return
    const acc = this.accuracy()
    const total = this.tips + this.pendingTips + this.coins.length
    const d = DIFF[this.diff]
    const lines = [
      `Rank ${this.phase === 'results' ? this.grade : '?'} · ${Math.round(acc * 100)}% on ${d.label} (${d.sub})`,
      `Best combo: ${this.maxCombo}`,
      `Perfect ${this.counts.perfect} · Good ${this.counts.good} · Miss ${this.counts.miss}`,
    ]
    const flags: string[] = []
    if (this.phase === 'results') {
      flags.push('arrived', `showtime-${this.grade.toLowerCase()}`)
      if (this.counts.miss === 0 && this.counts.perfect + this.counts.good === this.notes.length) flags.push('full-combo')
    }
    this.dispose()
    this.ctx.end({ coins: total, score: this.score, lines, flags })
  }

  private dispose() {
    if (this.ended) return
    this.ended = true
    cancelAnimationFrame(this.raf)
    clearInterval(this.timer)
    for (const f of this.cleanup) f()
    this.syn?.close()
  }

  // =====================================================================
  // pause
  // =====================================================================
  private pause() {
    if (this.paused || !this.syn || this.ended || this.phase === 'title' || this.phase === 'results' || this.phase === 'done') return
    this.paused = true
    this.pausedNow = this.now
    this.syn.ac.suspend().catch(() => {})
    for (let i = 0; i < 4; i++) this.release(i)
    this.showPauseCard()
  }

  private resume() {
    if (!this.paused || !this.syn) return
    this.hideCard()
    this.ctx.sfx.click()
    this.syn.ac
      .resume()
      .catch(() => {})
      .then(() => {
        this.clockReady = false
        this.paused = false
      })
  }

  // =====================================================================
  // clock
  // =====================================================================
  /** keeps a smoothed map from performance.now() to "audio time as heard" */
  private syncClock() {
    const ac = this.syn!.ac
    let est = 0
    const ts = typeof ac.getOutputTimestamp === 'function' ? ac.getOutputTimestamp() : null
    if (ts && ts.contextTime && ts.performanceTime) est = ts.contextTime - ts.performanceTime / 1000
    else est = ac.currentTime - (ac.outputLatency || ac.baseLatency || 0) - performance.now() / 1000
    if (!this.clockReady || Math.abs(est - this.clockOff) > 0.06) {
      this.clockOff = est
      this.clockReady = true
    } else this.clockOff += (est - this.clockOff) * 0.04
  }

  private audioAt(perfMs: number) {
    if (!this.syn) return perfMs / 1000
    if (this.paused) return this.pausedNow
    return perfMs / 1000 + this.clockOff
  }

  /** where the train is (logical px along the line) and how fast it's going */
  private trainAt(now: number): { x: number; v: number } {
    if (!this.syn) return { x: 0, v: 0 }
    const tau = now - (this.T0 + T_DEPART)
    if (tau <= 0) return { x: 0, v: 0 }
    const a = V_MAX / ACC_T
    const xAt = (u: number) => (u < ACC_T ? 0.5 * a * u * u : 0.5 * a * ACC_T * ACC_T + V_MAX * (u - ACC_T))
    const tD = this.songStart + DEC_BAR * BAR - (this.T0 + T_DEPART)
    if (tau < tD) return { x: xAt(tau), v: tau < ACC_T ? a * tau : V_MAX }
    const u = Math.min(tau - tD, DEC_T)
    const b = V_MAX / DEC_T
    return { x: xAt(tD) + V_MAX * u - 0.5 * b * u * u, v: Math.max(0, V_MAX - b * u) }
  }

  // =====================================================================
  // frame
  // =====================================================================
  private frame = (ts: number) => {
    if (this.ended) return
    this.raf = requestAnimationFrame(this.frame)
    const realDt = this.lastTs ? Math.min(0.05, Math.max(0, (ts - this.lastTs) / 1000)) : 0.016
    this.lastTs = ts
    const dt = this.paused ? 0 : realDt
    if (this.syn && !this.paused) this.syncClock()
    this.now = this.syn ? this.audioAt(ts) : ts / 1000
    const now = this.now
    if (this.syn && !this.paused) {
      this.song?.pump()
      if (save.muted !== this.muted) {
        this.muted = save.muted
        this.syn.setMuted(this.muted)
      }
      for (const c of this.cues) {
        if (!c.done && now >= c.at) {
          c.done = true
          c.fn()
        }
      }
    }
    const st = now - this.songStart
    const beats = this.syn ? st / SPB : now * 1.5
    const beatPulse = this.syn && this.phase !== 'title' ? Math.exp(-(((beats % 1) + 1) % 1) * 6) : 0

    // ----- train & world -----
    const tr = this.trainAt(now)
    const door = this.doorAt(now)
    this.world.draw({ camX: tr.x, speed: tr.v, endX: now >= this.songStart + DEC_BAR * BAR - 1 ? this.endX : null, door })
    if (this.syn && !this.paused && now - this.lastRumble > 0.2) {
      this.lastRumble = now
      this.syn.setRumble(tr.v / V_MAX, this.phase === 'play')
    }
    this.rock(now, tr)
    this.lighting(now, st, beatPulse)
    this.updateLed(now)

    // ----- gameplay -----
    if (this.syn && !this.paused) {
      if (this.phase === 'play' || this.phase === 'intro') this.updateNotes(st)
      this.updateTips(now)
    }
    this.renderHighway(st, beatPulse)
    this.updateHud(now)

    // ----- people -----
    this.updateRiders(dt, beats, beatPulse)
    this.updatePlayer(now, dt, beats, beatPulse, st)
    this.updateCoins(now)

    if (this.phase === 'outro' && this.finaleDone && now >= this.resultsAt && this.pendingTips === 0 && this.coins.length === 0) this.showResults()
    if (this.phase === 'results' && !this.paused && now >= this.resultsAt + 9) this.finish()
  }

  private doorAt(now: number) {
    if (!this.syn) return 1
    const close = this.T0 + T_DOORS
    if (now < close) return 1
    if (now < close + T_DOORS_LEN) return 1 - easeIO((now - close) / T_DOORS_LEN)
    const open = this.arriveAt + T_OPEN
    if (now < open) return 0
    return easeIO((now - open) / T_OPEN_LEN)
  }

  private rock(now: number, tr: { x: number; v: number }) {
    const amp = reduceMotion ? 0 : clamp(tr.v / V_MAX)
    const ph = tr.x % 900
    const bump = amp * (1.4 * Math.exp(-ph / 40) + (ph > 75 ? 1.1 * Math.exp(-(ph - 75) / 40) : 0))
    const r = amp * (0.22 * Math.sin(now * 1.3) + 0.08 * Math.sin(now * 3.1))
    const dy = amp * (1.1 * Math.sin(now * 2.3) + 0.5 * Math.sin(now * 5.2)) + bump
    const dx = amp * 1.4 * Math.sin(now * 0.7)
    // a light shake on misses
    const sk = this.now - this.shakeAt
    const shake = !reduceMotion && sk < 0.28 ? (1 - sk / 0.28) * 4 : 0
    const sx = shake * Math.sin(now * 90)
    const sy = shake * 0.5 * Math.cos(now * 70)
    this.car.style.transform = `translate(${(dx + sx).toFixed(2)}px, ${(dy + sy).toFixed(2)}px) rotate(${r.toFixed(3)}deg) scale(1.025)`
  }

  private lighting(now: number, st: number, beatPulse: number) {
    let dark = 0
    let spot = 0
    if (this.syn) {
      // flicker as the train pulls out
      const f = now - (this.T0 + T_DEPART + 0.15)
      if (f >= 0 && f < 1.2) {
        const FLICK = [0.78, 0.78, 0, 0.12, 0.82, 0, 0, 0.7, 0.66, 0, 0.3, 0]
        dark = FLICK[Math.floor(f / 0.1)] ?? 0
      }
      // the break: lights down, spotlight on the dancer
      const bar = st / BAR
      spot = clamp((bar - 17.8) * 3) * clamp((22 - bar) * 6)
    }
    this.dark.style.opacity = dark.toFixed(3)
    this.spot.style.opacity = spot.toFixed(3)
    const fl = now - this.flashAt
    this.flash.style.opacity = fl >= 0 && fl < 0.45 ? (0.6 * (1 - fl / 0.45)).toFixed(3) : '0'
    const hype = this.phase === 'play' ? clamp((this.combo - 15) / 25) : this.phase === 'outro' ? 0.8 : 0
    this.party.style.opacity = (hype * (0.35 + 0.65 * beatPulse)).toFixed(3)
  }

  // =====================================================================
  // LED sign
  // =====================================================================
  private setLed(text: string) {
    this.ledText.textContent = text
    this.led.classList.add('is-on')
    this.ledW = this.ledText.offsetWidth
    this.ledAt = this.now
  }
  private updateLed(now: number) {
    if (!this.led.classList.contains('is-on')) return
    const w = this.ledW + 296
    const x = 296 - (((now - this.ledAt) * 80) % w)
    this.ledText.style.transform = `translateX(${x.toFixed(1)}px)`
  }

  // =====================================================================
  // notes & judging
  // =====================================================================
  private onKey(e: KeyboardEvent, isDown: boolean) {
    if (isDown && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) {
      if (this.paused) this.resume()
      else this.pause()
      return
    }
    const lane = KEYS[e.key]
    if (lane === undefined) {
      if (isDown && e.key === 'Enter' && this.phase === 'title') this.begin()
      return
    }
    if (this.phase !== 'title') e.preventDefault()
    if (!isDown) return this.release(lane)
    if (e.repeat) return
    this.press(lane, e.timeStamp)
  }

  private press(lane: number, perfMs: number) {
    if (this.paused || this.ended) return
    this.down[lane] = true
    this.recs[lane].classList.add('is-down')
    if (this.phase !== 'play') return
    const d = DIFF[this.diff]
    const st = this.audioAt(perfMs) - this.songStart
    let best: Note | null = null
    let bestAbs = Infinity
    for (let i = this.pending; i < this.notes.length; i++) {
      const n = this.notes[i]
      if (n.t - st > d.boo) break
      if (n.done || n.lane !== lane) continue
      const a = Math.abs(n.t - st)
      if (a < bestAbs) {
        best = n
        bestAbs = a
      }
    }
    if (!best) return
    if (bestAbs <= d.perfect) this.judge(best, 'perfect')
    else if (bestAbs <= d.good) this.judge(best, 'good')
    else if (st < best.t) this.judge(best, 'miss') // way too early
  }

  private release(lane: number) {
    this.down[lane] = false
    this.recs[lane]?.classList.remove('is-down')
  }

  private updateNotes(st: number) {
    const d = DIFF[this.diff]
    while (this.pending < this.notes.length && this.notes[this.pending].done) this.pending++
    for (let i = this.pending; i < this.notes.length; i++) {
      const n = this.notes[i]
      if (st - n.t <= d.good) break
      if (!n.done) this.judge(n, 'miss')
    }
    // the last note is gone → wrap the show
    const last = this.notes[this.notes.length - 1]
    if (this.phase === 'play' && last && last.done && st > last.t + 0.6) {
      this.hw.classList.remove('is-on')
      this.phase = 'outro'
    }
  }

  private judge(n: Note, res: Judgement) {
    n.done = true
    n.res = res
    const d = DIFF[this.diff]
    if (res === 'miss') {
      this.counts.miss++
      this.combo = 0
      this.streak = 0
      if (n.el) n.el.classList.add('is-missed')
      this.shakeAt = this.now
      this.stumbleUntil = this.now + 0.4
      this.player.setMood('o')
      this.syn?.muffle()
      this.loseRider()
    } else {
      this.counts[res]++
      this.combo++
      this.streak++
      this.maxCombo = Math.max(this.maxCombo, this.combo)
      const mult = this.combo >= 50 ? 4 : this.combo >= 25 ? 3 : this.combo >= 10 ? 2 : 1
      this.score += (res === 'perfect' ? 100 : 50) * mult
      if (n.el) {
        this.recycle(n)
      }
      this.burst(n.lane, res)
      this.squash = 1
      if (this.player.pose !== 'jump') this.player.setMood(this.combo >= 10 ? 'grin' : 'smile')
      // tips: better hits, longer combos and more eyes on you → more coins
      const watchers = this.riders.filter((r) => r.state !== 'away').length
      const crowd = this.riders.length ? 0.5 + (0.5 * watchers) / this.riders.length : 1
      const cm = this.combo >= 50 ? 1.75 : this.combo >= 25 ? 1.5 : this.combo >= 10 ? 1.25 : 1
      this.tipAcc += (res === 'perfect' ? d.tipP : d.tipG) * cm * crowd
      while (this.tipAcc >= 1) {
        this.tipAcc -= 1
        this.pendingTips++
      }
      if (this.combo % 10 === 0) this.milestone()
    }
    this.showJudge(res)
  }

  private accuracy() {
    const total = this.notes.length || 1
    return (this.counts.perfect + 0.5 * this.counts.good) / total
  }

  private milestone() {
    const c = this.combo
    for (const r of this.riders) if (r.state === 'watch' || r.state === 'idle') this.setRider(r, 'cheer', 1.4)
    const fans = this.riders.filter((r) => r.state === 'cheer')
    if (fans.length) this.say(pick(fans), pick(CHEERS))
    if (c % 20 === 0 && this.syn) this.syn.crowd(this.syn.ac.currentTime + 0.02, 1.4, 0.8)
    const t = TRICKS[this.trickCount++ % TRICKS.length]
    this.startTrick(t.kind)
    const word = CALLOUTS[c] ?? (c >= 100 && c % 50 === 0 ? 'SUBWAY ROYALTY!' : '')
    this.callout(word ? `${word}<small>${t.name}</small>` : t.name)
  }

  private loseRider() {
    const fans = this.riders.filter((r) => r.state === 'watch' || r.state === 'cheer')
    if (!fans.length) return
    const r = pick(fans)
    this.setRider(r, 'away', 2, 5 + Math.floor(Math.random() * 6))
    if (Math.random() < 0.6) this.say(r, pick(BOOS))
  }

  private recycle(n: Note) {
    if (!n.el) return
    n.el.classList.remove('is-missed')
    n.el.style.display = 'none'
    this.pool[n.lane].push(n.el)
    n.el = null
  }

  private renderHighway(st: number, beatPulse: number) {
    const look = DIFF[this.diff].look
    const speed = (HIT_Y - SPAWN_Y) / look
    if (this.syn && (this.phase === 'intro' || this.phase === 'play' || this.phase === 'outro')) {
      for (let i = this.pending; i < this.notes.length; i++) {
        const n = this.notes[i]
        const dt = n.t - st
        if (dt > look + 0.05) break
        if (n.done && n.res !== 'miss') continue
        const y = HIT_Y - dt * speed
        if (y > NOTES_H + TILE) {
          this.recycle(n)
          continue
        }
        if (!n.el) {
          const e = this.pool[n.lane].pop() ?? this.makeNote(n.lane)
          e.style.display = ''
          n.el = e
        }
        n.el.style.transform = `translate(${LANE_X[n.lane] - NOTES_X - TILE / 2}px, ${(y - TILE / 2).toFixed(1)}px)`
      }
      // missed notes that already left the pending window keep falling until they're off the bottom
      for (let i = Math.max(0, this.pending - 12); i < this.pending; i++) {
        const n = this.notes[i]
        if (!n.el) continue
        const y = HIT_Y - (n.t - st) * speed
        if (y > NOTES_H + TILE) this.recycle(n)
        else n.el.style.transform = `translate(${LANE_X[n.lane] - NOTES_X - TILE / 2}px, ${(y - TILE / 2).toFixed(1)}px)`
      }
      // beat lines (stronger on the bar)
      const first = Math.ceil((st - 0.3) / SPB)
      for (let k = 0; k < this.beatLines.length; k++) {
        const b = first + k
        const l = this.beatLines[k]
        const dt = b * SPB - st
        const y = HIT_Y - dt * speed
        if (b < 0 || b > SONG_BARS * 4 - 4 || dt > look || y > HIT_Y + 20) {
          l.style.display = 'none'
          continue
        }
        l.style.display = ''
        l.classList.toggle('is-bar', b % 4 === 0)
        l.style.transform = `translateY(${y.toFixed(1)}px)`
      }
    }
    // receptors breathe with the beat
    for (let i = 0; i < 4; i++) {
      const s = this.down[i] ? 0.9 : 1 + 0.05 * beatPulse
      this.recs[i].style.transform = `scale(${s.toFixed(3)})`
    }
  }

  private makeNote(lane: number) {
    const e = el('div', 'showtime-note', noteSVG(lane))
    this.notesEl.append(e)
    return e
  }

  private burst(lane: number, res: Judgement) {
    const x = LANE_X[lane]
    const ring = el('div', `showtime-ring ${res === 'perfect' ? 'is-perfect' : ''}`)
    ring.style.left = `${x}px`
    ring.style.top = `${HIT_Y}px`
    ring.style.setProperty('--c', res === 'perfect' ? '#ffd23f' : LANES[lane].glow)
    this.fxEl.append(ring)
    ring.addEventListener('animationend', () => ring.remove())
    if (res === 'perfect') {
      for (let i = 0; i < 5; i++) {
        const sp = el('div', 'showtime-spark', sparkSVG(i % 2 ? '#fff6c2' : '#ffd23f'))
        const a = -Math.PI / 2 + (i - 2) * 0.62 + (Math.random() - 0.5) * 0.3
        const dist = 38 + Math.random() * 22
        sp.style.left = `${x}px`
        sp.style.top = `${HIT_Y}px`
        sp.style.setProperty('--dx', `${(Math.cos(a) * dist).toFixed(1)}px`)
        sp.style.setProperty('--dy', `${(Math.sin(a) * dist).toFixed(1)}px`)
        this.fxEl.append(sp)
        sp.addEventListener('animationend', () => sp.remove())
      }
    }
    this.recInner[lane].animate([{ transform: 'scale(1.2)', filter: 'brightness(1.8)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], {
      duration: 180,
      easing: 'ease-out',
    })
  }

  // =====================================================================
  // HUD
  // =====================================================================
  private showJudge(res: Judgement) {
    const j = this.judgeEl
    j.className = `showtime-judge is-${res}`
    j.textContent = res === 'perfect' ? 'PERFECT!' : res === 'good' ? 'GOOD' : 'MISS'
    j.getAnimations().forEach((a) => a.cancel())
    j.animate(
      [
        { transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.12)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.55 },
        { transform: 'translate(-50%, -70%) scale(1)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out', fill: 'forwards' },
    )
    if (this.combo >= 4) {
      this.comboNum.textContent = String(this.combo)
      this.comboEl.classList.add('is-on')
      this.comboEl.classList.toggle('is-hot', this.combo >= 25)
      this.comboNum.getAnimations().forEach((a) => a.cancel())
      this.comboNum.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' })
    } else if (res === 'miss') {
      if (this.lastCombo >= 4) this.comboEl.animate([{ transform: 'rotate(-8deg) translateY(6px)', opacity: 0.4 }, { opacity: 0 }], { duration: 300 })
      this.comboEl.classList.remove('is-on')
    }
    this.lastCombo = this.combo
  }

  private callout(html: string) {
    const c = this.calloutEl
    c.innerHTML = html
    c.getAnimations().forEach((a) => a.cancel())
    c.animate(
      [
        { transform: 'translate(-50%, -50%) rotate(-14deg) scale(.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) rotate(-6deg) scale(1.15)', opacity: 1, offset: 0.18 },
        { transform: 'translate(-50%, -50%) rotate(-6deg) scale(1)', opacity: 1, offset: 0.75 },
        { transform: 'translate(-50%, -80%) rotate(-6deg) scale(1)', opacity: 0 },
      ],
      { duration: 1300, easing: 'ease-out', fill: 'forwards' },
    )
  }

  private popBanner(text: string, cls: string, burst = false) {
    const b = el('div', `showtime-big ${cls}`)
    b.innerHTML = (burst ? '<i class="showtime-burst"></i>' : '') + `<span>${text}</span>`
    this.banner.append(b)
    b.addEventListener('animationend', (e) => {
      if (e.target === b) b.remove()
    })
  }

  private updateHud(now: number) {
    this.scoreEl.textContent = this.score.toLocaleString('en-US')
    this.tipsEl.textContent = String(this.tips)
    let p = 0
    if (this.syn) p = clamp((now - (this.T0 + T_DEPART)) / (this.arriveAt - (this.T0 + T_DEPART)))
    this.tripFill.style.width = `${(p * 100).toFixed(2)}%`
    this.tripTrain.style.left = `${(p * 100).toFixed(2)}%`
  }

  // =====================================================================
  // riders
  // =====================================================================
  private setRider(r: Rider, state: RiderState, hold = 0, winBack = 0) {
    r.state = state
    r.stateT = 0
    r.hold = hold
    if (state === 'away') {
      r.winBack = winBack
      r.view.face(1, true)
    } else r.view.face(r.d, false)
    r.view.setMood(state === 'cheer' || state === 'toss' ? 'grin' : 'smile')
  }

  private say(r: Rider, text: string) {
    r.bubble?.remove()
    const b = el('div', 'showtime-bubble')
    b.textContent = text
    b.style.left = `${r.x}px`
    b.style.top = `${r.y - 150 * RIDER_U}px`
    if (r.x < 120) b.classList.add('is-left')
    if (r.x > 880) b.classList.add('is-right')
    this.bubbles.append(b)
    r.bubble = b
    b.addEventListener('animationend', () => {
      b.remove()
      if (r.bubble === b) r.bubble = null
    })
  }

  private updateRiders(dt: number, beats: number, beatPulse: number) {
    for (const r of this.riders) {
      r.stateT += dt
      if ((r.state === 'cheer' || r.state === 'toss') && r.stateT > r.hold) this.setRider(r, 'watch')
      if (r.state === 'away' && r.stateT > r.hold && this.streak >= r.winBack && this.phase === 'play') {
        this.setRider(r, 'watch')
        this.say(r, pick(COMEBACKS))
      }
      const pose: Pose = r.state === 'cheer' ? 'cheer' : r.state === 'toss' ? 'wave' : r.state === 'away' ? 'idle' : 'sit'
      this.animate(r.view, pose, beats, dt)
      // keep them seated whatever their arms are doing
      for (const leg of r.view.el.querySelectorAll('.av-legL, .av-legR')) leg.setAttribute('transform', 'translate(0 -13)')
      const bob = r.state === 'watch' && this.combo >= 8 && this.phase === 'play' ? 2.2 * beatPulse : 0
      r.wrap.style.transform = `translate(${r.x}px, ${(r.y + bob).toFixed(1)}px)`
    }
  }

  // =====================================================================
  // tips & coins
  // =====================================================================
  private updateTips(now: number) {
    if (this.pendingTips <= 0 || now - this.lastToss < 0.16) return
    const fans = this.riders.filter((r) => r.state === 'watch' || r.state === 'cheer' || (this.phase === 'outro' && r.state !== 'toss'))
    if (!fans.length) return
    const r = pick(fans)
    this.pendingTips--
    this.lastToss = now
    this.setRider(r, 'toss', 0.45)
    const coin = el('img', 'showtime-coin')
    coin.src = COIN
    coin.alt = ''
    this.coinLayer.append(coin)
    const x0 = r.x + 24 * RIDER_U
    const y0 = r.y - 96 * RIDER_U
    const x1 = HAT_MOUTH.x + (Math.random() - 0.5) * 34
    const y1 = HAT_MOUTH.y + (Math.random() - 0.5) * 6
    this.coins.push({ el: coin, x0, y0, x1, y1, t0: now, dur: 0.62 + Math.abs(x1 - x0) / 1600, arc: 70 + Math.abs(x1 - x0) * 0.22 })
  }

  private updateCoins(now: number) {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i]
      const p = (now - c.t0) / c.dur
      if (p >= 1) {
        c.el.remove()
        this.coins.splice(i, 1)
        this.tips++
        this.landCoin(now)
        continue
      }
      const x = c.x0 + (c.x1 - c.x0) * p
      const y = c.y0 + (c.y1 - c.y0) * p - c.arc * 4 * p * (1 - p)
      const spin = Math.cos(p * Math.PI * 6)
      c.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scaleX(${spin.toFixed(2)})`
    }
  }

  private landCoin(now: number) {
    if (now - this.lastCoinSfx > 0.07) {
      this.ctx.sfx.coin()
      this.lastCoinSfx = now
    }
    if (this.tips !== this.hatShown && this.hatPileG) {
      this.hatShown = this.tips
      this.hatPileG.innerHTML = hatPile(this.tips)
    }
    this.hat.animate([{ transform: 'translate(-50%, -100%) scale(1.08, .92)' }, { transform: 'translate(-50%, -100%) scale(1)' }], { duration: 180, easing: 'ease-out' })
    const f = el('div', 'showtime-float', '+1')
    f.style.left = `${HAT.x + (Math.random() - 0.5) * 30}px`
    f.style.top = `${HAT.y - 64}px`
    this.coinLayer.append(f)
    f.addEventListener('animationend', () => f.remove())
    this.tipsEl.parentElement?.parentElement?.animate([{ transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 160 })
  }

  // =====================================================================
  // the performer
  // =====================================================================
  private startTrick(kind: TrickKind) {
    if (reduceMotion) return
    const pole = POLES[this.trickCount % 2]
    this.trick = { kind, start: this.now, dur: kind === 'spin' ? 0.55 : kind === 'flip' ? 0.8 : 1.7, pole }
    if (kind !== 'pole') this.player.setPose('jump')
  }

  private basePose(st: number): Pose {
    const bar = Math.floor(st / BAR)
    switch (this.phase) {
      case 'title':
        return 'idle'
      case 'intro':
        return this.now >= this.T0 + T_COUNTIN ? 'wave' : 'idle'
      case 'play': {
        if (this.combo < 5) return 'idle'
        if (sectionOf(bar) === 'break') return 'skate'
        if (this.combo < 20) return 'dance'
        if (this.combo < 40) return Math.floor(bar / 2) % 2 ? 'skate' : 'dance'
        return (['dance', 'cheer', 'skate', 'dance', 'wave'] as const)[Math.floor(bar / 2) % 5]
      }
      case 'outro':
        return this.finaleDone ? 'cheer' : 'dance'
      default:
        return 'wave'
    }
  }

  private updatePlayer(now: number, dt: number, beats: number, beatPulse: number, st: number) {
    let pose = this.basePose(st)
    let dx = 0
    let dy = 0
    let rot = 0
    let sx = 1
    let sy = 1
    const t = this.trick
    if (t) {
      const p = (now - t.start) / t.dur
      if (p >= 1 || p < 0) this.trick = null
      else if (t.kind === 'spin') {
        const c = Math.cos(p * Math.PI * 2)
        sx = Math.sign(c || 1) * Math.max(0.08, Math.abs(c))
        dy = -16 * Math.sin(Math.PI * p)
        pose = 'jump'
      } else if (t.kind === 'flip') {
        dy = -78 * Math.sin(Math.PI * p)
        rot = -360 * easeIO(p)
        pose = 'jump'
      } else {
        const target = t.pole - PLAYER.x + (t.pole < PLAYER.x ? 8 : -8)
        if (p < 0.18) {
          dx = target * ease(p / 0.18)
          dy = -22 * Math.sin((Math.PI * p) / 0.18)
          pose = 'jump'
        } else if (p < 0.82) {
          const q = (p - 0.18) / 0.64
          const th = q * Math.PI * 4
          dx = target + Math.sin(th) * 24
          sx = Math.sign(Math.cos(th) || 1) * Math.max(0.12, Math.abs(Math.cos(th)))
          dy = -34 * Math.sin(Math.PI * q) - 8
          pose = 'cheer'
        } else {
          const q = (p - 0.82) / 0.18
          dx = target * (1 - ease(q))
          dy = -18 * Math.sin(Math.PI * q)
          pose = 'jump'
        }
      }
    }
    // stumble on a miss
    if (now < this.stumbleUntil && !t) {
      pose = 'idle'
      dx += Math.sin(now * 55) * 3.5 * ((this.stumbleUntil - now) / 0.4)
    } else if (this.player.pose !== 'jump' && now >= this.stumbleUntil && this.stumbleUntil > 0) {
      this.stumbleUntil = 0
      this.player.setMood(this.combo >= 10 ? 'grin' : 'smile')
    }
    // turn to the other side of the car every couple of bars once the crowd is into it
    if (this.phase === 'play' && this.combo >= 20) {
      const want: 1 | -1 = Math.floor(st / (BAR * 2)) % 2 ? -1 : 1
      if (want !== this.playerD) {
        this.playerD = want
        this.player.face(want, false)
      }
    }
    this.squash = Math.max(0, this.squash - dt * 7)
    sx *= 1 + 0.07 * this.squash
    sy *= 1 - 0.07 * this.squash
    const bob = pose === 'idle' && (this.phase === 'play' || this.phase === 'intro') ? 3 * beatPulse : 0
    if (pose === 'jump') {
      if (this.player.pose !== 'jump' && (!t || now - t.start < 0.05)) this.player.setPose('jump')
      this.player.update(dt)
    } else this.animate(this.player, pose, beats, dt)
    this.layoutPlayer(dx, dy + bob, rot, sx, sy)
  }

  private layoutPlayer(dx: number, dy: number, rot: number, sx: number, sy: number) {
    this.pw.style.transform = `translate(${PLAYER.x}px, ${PLAYER.y}px)`
    this.pr.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`
    this.ps.style.transform = `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
  }

  /** play a pose, phase-locked to the beat when the pose has a rhythm */
  private animate(view: AvatarView, pose: Pose, beats: number, dt: number) {
    view.setPose(pose)
    const k = POSE_RATE[pose]
    if (k !== undefined && this.syn && this.phase !== 'title') (view as unknown as { t: number }).t = k * beats - dt
    view.update(dt)
  }
}

const game: MiniGame = {
  id: 'showtime',
  title: 'Showtime!',
  start(ctx) {
    new Showtime(ctx)
  },
}
export default game
