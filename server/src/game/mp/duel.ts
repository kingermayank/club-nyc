/**
 * A Carb-Jitsu duel, run entirely by the server: decks, hands, the clock, every reveal and the winner. Each player
 * only ever sees their own hand; spectators see the trays and the reveals. A player who doesn't pick in time gets a
 * card picked for them (so nobody can stall a table), and anyone who leaves or stays gone forfeits.
 */
import type { LookWire } from '../../../../app/src/net/protocol.ts'
import type { CardWire, DuelWire, MatchWire, MpC2S } from '../../../../app/src/mp/shared/protocol.ts'
import { CJ, makeDeck, resolveRound, winningSet, botPick, FOODS } from '../../../../app/src/mp/shared/carbs.ts'
import { seeded } from '../../../../app/src/mp/shared/rng.ts'
import type { Match, MatchHost, Standing } from './types.ts'
import type { Entrant } from './race.ts'

interface Duelist {
  id: string
  name: string
  look: LookWire
  bot: boolean
  skill: number
  deck: CardWire[]
  hand: CardWire[]
  tray: CardWire[]
  pick: number | null
  /** rounds in a row the clock picked for them */
  auto: number
  online: boolean
  offAt: number
  left: boolean
  botAt: number
}

const INTRO_MS = 3000

export class DuelMatch implements Match {
  readonly id: string
  readonly game = 'carbs' as const
  readonly mode = 'ffa' as const
  readonly startedAt: number
  readonly humans: string[]
  ended = false
  private readonly host: MatchHost
  private readonly seed: number
  private readonly p: [Duelist, Duelist]
  private readonly r: () => number
  private round = 0
  private phase: 'intro' | 'pick' | 'reveal' | 'over' = 'intro'
  private phaseEnd: number
  private fx: { low?: 1; hike?: [number, number] } = {}
  private nextFx: { low?: 1; hike?: [number, number] } = {}
  private rev: [CardWire, CardWire] | undefined
  private win: -1 | 0 | 1 | undefined
  private winner: 0 | 1 | undefined
  private set: number[] | undefined
  private why: DuelWire['why']

  constructor(host: MatchHost, o: { id: string; seed: number; a: Entrant; b: Entrant; now: number }) {
    this.host = host
    this.id = o.id
    this.seed = o.seed
    this.startedAt = o.now
    this.r = seeded(o.seed ^ 0xca4b)
    const mk = (e: Entrant, k: number): Duelist => {
      const deck = makeDeck(o.seed * 7 + k * 1013 + 1)
      return { id: e.id, name: e.name, look: e.look, bot: !!e.bot, skill: e.bot?.skill ?? 1, deck, hand: deck.splice(0, CJ.hand), tray: [], pick: null, auto: 0, online: true, offAt: 0, left: false, botAt: 0 }
    }
    this.p = [mk(o.a, 0), mk(o.b, 1)]
    this.humans = this.p.filter((x) => !x.bot).map((x) => x.id)
    this.phaseEnd = o.now + INTRO_MS
  }

  private idx(userId: string): 0 | 1 | -1 {
    return this.p[0].id === userId && !this.p[0].bot ? 0 : this.p[1].id === userId && !this.p[1].bot ? 1 : -1
  }

  wire(userId: string): MatchWire {
    const k = this.idx(userId)
    return {
      id: this.id,
      g: 'carbs',
      seed: this.seed,
      mode: 'ffa',
      startIn: this.phase === 'intro' ? this.phaseEnd - Date.now() : -1,
      players: this.p.map((x) => ({ i: x.id, n: x.name, l: x.look, ...(x.bot ? { bot: 1 as const } : {}) })),
      you: k !== -1 && !this.p[k].left ? k : -1,
    }
  }

  private state(userId: string): DuelWire {
    const k = this.idx(userId)
    const me = k !== -1 ? this.p[k] : null
    return {
      r: this.round,
      ph: this.phase === 'intro' ? 'pick' : this.phase,
      left: Math.max(0, this.phaseEnd - Date.now()),
      ...(me ? { hand: me.hand, ...(me.pick !== null ? { mine: me.pick } : {}) } : {}),
      picked: [this.p[0].pick !== null, this.p[1].pick !== null],
      ...(this.rev && this.phase !== 'pick' ? { rev: this.rev, win: this.win } : {}),
      trays: [this.p[0].tray, this.p[1].tray],
      ...(this.fx.low || this.fx.hike ? { fx: this.fx } : {}),
      ...(this.winner !== undefined ? { winner: this.winner, set: this.set } : {}),
      ...(this.why ? { why: this.why } : {}),
    }
  }

  resync(userId: string) {
    if (this.phase === 'intro') return
    this.host.send(userId, { t: 'mp', k: 'cj', s: this.state(userId) })
  }

  private push() {
    for (const u of this.host.audience()) this.host.send(u, { t: 'mp', k: 'cj', s: this.state(u) })
  }

  input(userId: string, msg: MpC2S) {
    if (msg.k !== 'pick' || this.phase !== 'pick' || this.ended) return
    const k = this.idx(userId)
    if (k === -1) return
    const me = this.p[k]
    const c = Number(msg.c)
    if (me.pick !== null || !Number.isInteger(c) || c < 0 || c >= me.hand.length) return
    me.pick = c
    me.auto = 0
    if (this.p[0].pick !== null && this.p[1].pick !== null) this.reveal(Date.now())
    else this.push()
  }

  leave(userId: string) {
    const k = this.idx(userId)
    if (k === -1 || this.ended) return
    this.p[k].left = true
    this.forfeit(k, 'left')
  }

  online(userId: string, on: boolean) {
    const k = this.idx(userId)
    if (k === -1) return
    this.p[k].online = on
    if (!on) this.p[k].offAt = Date.now()
  }

  tick(now: number) {
    if (this.ended) return
    for (const k of [0, 1] as const) {
      const x = this.p[k]
      if (!x.bot && !x.online && now - x.offAt > CJ.forfeitMs && this.phase !== 'over') return this.forfeit(k, 'forfeit')
    }
    if (this.phase === 'intro' && now >= this.phaseEnd) return this.beginRound(now)
    if (this.phase === 'pick') {
      for (const x of this.p) {
        if (x.bot && x.pick === null && now >= x.botAt) {
          const other = this.p[0] === x ? this.p[1] : this.p[0]
          x.pick = botPick(x.hand, x.tray, other.tray, x.skill, this.r)
          if (this.p[0].pick === null || this.p[1].pick === null) this.push()
        }
      }
      if ((this.p[0].pick !== null && this.p[1].pick !== null) || now >= this.phaseEnd) return this.reveal(now)
    }
    if (this.phase === 'reveal' && now >= this.phaseEnd) {
      if (this.winner !== undefined) return this.over(now)
      return this.beginRound(now)
    }
    if (this.phase === 'over' && now >= this.phaseEnd) return this.finish(now)
  }

  private beginRound(now: number) {
    this.round++
    this.fx = this.nextFx
    this.nextFx = {}
    this.rev = undefined
    this.win = undefined
    for (const x of this.p) {
      x.pick = null
      while (x.hand.length < CJ.hand) {
        if (!x.deck.length) x.deck = makeDeck(this.seed + this.round * 977 + (x === this.p[0] ? 1 : 2))
        x.hand.push(x.deck.shift()!)
      }
      // locals think for a moment (the good ones a little longer)
      x.botAt = now + 1100 + this.r() * 2600
    }
    this.phase = 'pick'
    this.phaseEnd = now + CJ.pickMs
    this.push()
  }

  private reveal(now: number) {
    for (const x of this.p) {
      if (x.pick === null) {
        // the clock picks for you
        x.pick = Math.floor(this.r() * x.hand.length)
        if (!x.bot) x.auto++
      }
    }
    const [a, b] = this.p
    const ca = a.hand.splice(a.pick!, 1)[0]
    const cb = b.hand.splice(b.pick!, 1)[0]
    this.rev = [ca, cb]
    const win = resolveRound(ca, cb, this.fx)
    this.win = win
    if (win !== -1) {
      const w = this.p[win]
      const l = this.p[1 - win]
      const card = win === 0 ? ca : cb
      w.tray.push(card)
      if (card.fx === 'low') this.nextFx.low = 1
      if (card.fx === 'hike') this.nextFx.hike = win === 0 ? [0, 3] : [3, 0]
      if (card.fx === 'tow') {
        // tow the newest card they have from this borough
        for (let i = l.tray.length - 1; i >= 0; i--) if (l.tray[i].c === card.c) {
          l.tray.splice(i, 1)
          break
        }
      }
      const set = winningSet(w.tray)
      if (set) {
        this.winner = win
        this.set = set
      }
    }
    if (this.winner === undefined && this.round >= CJ.maxRounds) {
      // a marathon: the bigger tray takes it
      this.winner = a.tray.length >= b.tray.length ? 0 : 1
      this.set = []
    }
    // someone who keeps letting the clock play for them has stepped away from the table
    for (const k of [0, 1] as const) if (this.winner === undefined && this.p[k].auto >= CJ.idleRounds) {
      this.winner = (1 - k) as 0 | 1
      this.set = []
      this.why = 'forfeit'
    }
    this.phase = 'reveal'
    this.phaseEnd = now + CJ.revealMs
    this.push()
  }

  private over(now: number) {
    this.phase = 'over'
    this.phaseEnd = now + CJ.overMs
    this.push()
  }

  private forfeit(k: 0 | 1, why: 'forfeit' | 'left') {
    // already decided (a set was made this round): the result stands, the leaver just doesn't get a prize
    if (this.ended || this.phase === 'over' || this.winner !== undefined) return
    this.winner = (1 - k) as 0 | 1
    this.set = []
    this.why = why
    this.over(Date.now())
  }

  private finish(now: number) {
    if (this.ended) return
    this.ended = true
    const w = this.winner ?? 0
    const standings: Standing[] = [w, 1 - w].map((k, place) => {
      const x = this.p[k]
      const top = [0, 1, 2].map((e) => x.tray.filter((c) => c.e === e).length)
      const most = top.indexOf(Math.max(...top))
      return {
        id: x.id,
        name: x.name,
        look: x.look,
        bot: x.bot,
        place: place + 1,
        score: place === 0 ? 1 : 0,
        won: place === 0,
        dnf: false,
        left: x.left,
        void: false,
        stat: x.tray.length ? `${x.tray.length} ${x.tray.length === 1 ? 'card' : 'cards'} won · mostly ${FOODS[most].name}` : 'No cards won',
      }
    })
    this.host.end({ standings, data: { rounds: this.round, why: this.why ?? null, ms: now - this.startedAt } })
  }
}
