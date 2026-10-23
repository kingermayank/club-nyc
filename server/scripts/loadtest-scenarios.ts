/**
 * Launch-readiness load-test suite for the Club NYC game server.
 *
 *   node --import tsx scripts/loadtest-scenarios.ts [scenario…] [--port 8899] [--out DIR] [--db FILE] [--quick]
 *     [--steady 100,1000] [--knee 5000,7000] [--ts 200] [--seconds 60] [--soak-minutes 15]
 *     [--storm-bots 2000] [--storm-outages 0,5000,term]   (ms of downtime after kill -9; term = graceful SIGTERM)
 *   (or: bash scripts/loadtest-all.sh — runs this against a frozen copy of the code)
 *
 * The suite starts its OWN server process from this server/ folder on --port with a throwaway --db (never your
 * dev server, never data/club-nyc.db), preloading scripts/loadtest-probe.mjs to record per-tick timings, event-loop
 * delay, CPU and memory. Bots come from scripts/loadtest-lib.ts (worker processes that behave like the real client).
 *
 * Scenarios (default: all, in this order):
 *   steady      mixed activity in 8 rooms: 100, 200, 500, 1000 bots
 *   knee        the same, past the design load: 1500, 2000, 3000 bots (finds where it bends)
 *   ts          everyone in Times Square (instances overflow at ROOM_CAP=60): 200, 500
 *   burst       200 / 500 new players sign up + connect within 10 s, with 100 players already online
 *   limits      production mode: per-IP REST limits with and without TRUST_PROXY (what Railway's proxy does)
 *   chat        500 bots chatting at the max allowed rate; 10% flooders; 20% of lines need filtering
 *   hop         500 bots changing rooms every 3–6 s (incl. apartments)
 *   storm       300 connected bots: kill -9 + restart (immediately / after 5 s), and a graceful SIGTERM restart (a deploy):
 *               time until 95% are back in a room
 *   rest        REST under concurrency (leaderboard, city, friends, 20 KB cloud saves) with 300 players online
 *   robustness  malformed input that should be rejected, not crash or bloat the server
 *   apartments  apartment instances: made-up owners, then real ones — instance count, idle tick, heap before/after
 *   browser     one real browser (tools/mp_perf.py, Playwright) in Times Square with 200 bots: frame times
 *   soak        300 bots for 15 minutes: memory growth, tick creep
 * Output in --out: results.json, summary.md, server.log, probe.jsonl.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { connect as tcpConnect } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { Cluster, dist, makeSave, r1, r2, sleep, type Behavior, type RestCall, type Stats } from './loadtest-lib.ts'
import { POLICY_VERSION } from '../../app/src/data/policy.ts'
import { weekId } from '../src/game/rules.ts'

// ---------- options ----------
const HERE = dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = resolve(HERE, '..')
const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string', default: '8899' },
    out: { type: 'string' },
    db: { type: 'string' },
    quick: { type: 'boolean', default: false },
    python: { type: 'string' },
    tools: { type: 'string' },
    'soak-minutes': { type: 'string' },
    // override the bot counts per level, e.g. --knee 5000,7000 --steady 100,1000
    steady: { type: 'string' },
    knee: { type: 'string' },
    ts: { type: 'string' },
    seconds: { type: 'string' },
    'storm-bots': { type: 'string' },
    'storm-outages': { type: 'string' },
  },
})
const list = (s: string | undefined, def: number[]) => (s ? s.split(',').map(Number).filter((n) => n > 0) : def)
const PORT = Number(opt.port)
if (PORT === 8787) throw new Error('refusing to use port 8787 — that is the dev server; pick another --port')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT = resolve(opt.out ?? join(tmpdir(), `club-nyc-loadtest-${STAMP}`))
mkdirSync(OUT, { recursive: true })
const DB = resolve(opt.db ?? join(OUT, 'load.db'))
if (basename(DB) === 'club-nyc.db') throw new Error('refusing to load-test the real database (data/club-nyc.db); pass a throwaway --db')
const PROBE = join(OUT, 'probe.jsonl')
const LOG = join(OUT, 'server.log')
const BASE = `http://localhost:${PORT}`
const QUICK = !!opt.quick
const PYTHON = resolve(opt.python ?? join(SERVER_DIR, '../.venv/bin/python'))
const TOOLS = resolve(opt.tools ?? join(SERVER_DIR, '../tools'))
const ALL = ['steady', 'knee', 'ts', 'burst', 'limits', 'chat', 'hop', 'storm', 'rest', 'robustness', 'apartments', 'browser', 'soak']
const chosen = positionals.length ? positionals : ALL
for (const s of chosen) if (!ALL.includes(s)) throw new Error(`unknown scenario ${s} (one of ${ALL.join(' ')})`)

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)

// ---------- the server under test ----------
const healthy = async () => {
  try {
    return (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) })).ok
  } catch {
    return false
  }
}

class GameServer {
  proc: ChildProcess | null = null
  errors: string[] = []
  crashes: { at: number; code: number | null; signal: string | null; tail: string }[] = []
  private tail = ''
  private expectExit = false
  get alive() {
    return !!this.proc && this.proc.exitCode === null && this.proc.signalCode === null
  }
  async start(extra: Record<string, string> = {}): Promise<number> {
    if (this.alive) throw new Error('server already running')
    if (await healthy()) throw new Error(`something else is already listening on ${PORT}`)
    const t0 = Date.now()
    // LAUNCH_MODE=open: production defaults to the launch waitlist, where only testers can make guests
    const env: Record<string, string | undefined> = { ...process.env, PORT: String(PORT), DB_PATH: DB, LOADTEST_PROBE_OUT: PROBE, LAUNCH_MODE: 'open', ...extra }
    if (!extra.NODE_ENV) delete env.NODE_ENV
    appendFileSync(LOG, `\n===== start ${new Date().toISOString()} ${JSON.stringify(extra)}\n`)
    const p = spawn(process.execPath, ['--import', 'tsx', '--import', pathToFileURL(join(HERE, 'loadtest-probe.mjs')).href, 'src/index.ts'], { cwd: SERVER_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] })
    this.proc = p
    this.expectExit = false
    const onData = (d: Buffer) => {
      const s = String(d)
      appendFileSync(LOG, s)
      this.tail = (this.tail + s).slice(-3000)
      for (const line of s.split('\n')) if (/error|exception|unhandled/i.test(line) && !/ExperimentalWarning/.test(line)) this.errors.push(line.trim().slice(0, 240))
    }
    p.stdout!.on('data', onData)
    p.stderr!.on('data', onData)
    p.on('exit', (code, signal) => {
      appendFileSync(LOG, `===== exit code=${code} signal=${signal}\n`)
      if (!this.expectExit) this.crashes.push({ at: Date.now(), code, signal, tail: this.tail.slice(-1500) })
    })
    while (Date.now() - t0 < 30000) {
      if (await healthy()) return Date.now() - t0
      if (p.exitCode !== null) throw new Error(`server exited during start: ${this.tail.slice(-500)}`)
      await sleep(25)
    }
    throw new Error('server did not become healthy in 30 s')
  }
  async kill(signal: NodeJS.Signals = 'SIGKILL') {
    const p = this.proc
    if (!p || !this.alive) return
    this.expectExit = true
    const gone = new Promise((r) => p.once('exit', r))
    p.kill(signal)
    await Promise.race([gone, sleep(signal === 'SIGKILL' ? 5000 : 12000)])
    if (this.alive) {
      p.kill('SIGKILL')
      await gone
    }
  }
  stop() {
    return this.kill('SIGTERM')
  }
}
const server = new GameServer()

// ---------- measurements ----------
type Metrics = { online: number; msgsIn: number; msgsOut: number; bytesOut: number; flushes: number; flushMs: number; dropped: number; rssMB: number; heapMB: number; rooms: Record<string, number> }
async function metrics(): Promise<Metrics | null> {
  try {
    const r = await fetch(`${BASE}/api/metrics`, { signal: AbortSignal.timeout(3000) })
    return r.ok ? ((await r.json()) as Metrics) : null
  } catch {
    return null
  }
}

interface ProbeRec {
  t: number
  pid: number
  ticks: number[]
  gaps: number[]
  eld: { p50: number; p99: number; max: number }
  elu: number
  cpuPct: number
  rssMB: number
  heapMB: number
  heapTotalMB: number
  extMB: number
  gc: { n: number; ms: number; max: number }
  sockets: number
  inst?: { keys: number; total: number; homes: number } | null
}
function probeRecs(from: number, to: number): ProbeRec[] {
  if (!existsSync(PROBE)) return []
  const out: ProbeRec[] = []
  for (const line of readFileSync(PROBE, 'utf8').split('\n')) {
    if (!line) continue
    try {
      const r = JSON.parse(line) as ProbeRec
      if (r.t > from && r.t <= to + 500) out.push(r)
    } catch {
      /* partial line */
    }
  }
  return out
}
const ELD_RES = 5 // the probe samples the event loop every 5 ms; report delay beyond that
function probeSummary(recs: ProbeRec[]) {
  const ticks: number[] = []
  const gaps: number[] = []
  for (const r of recs) {
    for (const x of r.ticks) ticks.push(x)
    for (const x of r.gaps) gaps.push(x)
  }
  const max = (f: (r: ProbeRec) => number) => (recs.length ? r1(Math.max(...recs.map(f))) : null)
  const avg = (f: (r: ProbeRec) => number) => (recs.length ? r2(recs.reduce((a, r) => a + f(r), 0) / recs.length) : null)
  const td = dist(ticks)
  const tickAvg = ticks.length ? Math.round((ticks.reduce((a, b) => a + b, 0) / ticks.length) * 1000) / 1000 : null
  return {
    samples: recs.length,
    tick: { n: ticks.length, avg: tickAvg, p50: td.p50, p95: td.p95, p99: td.p99, max: td.max },
    gap: { p99: dist(gaps).p99, max: dist(gaps).max, late100: gaps.filter((g) => g > 100).length, late250: gaps.filter((g) => g > 250).length },
    eldP99: recs.length ? r1(Math.max(0, Math.max(...recs.map((r) => r.eld.p99)) - ELD_RES)) : null,
    eldMax: recs.length ? r1(Math.max(0, Math.max(...recs.map((r) => r.eld.max)) - ELD_RES)) : null,
    elu: { avg: avg((r) => r.elu), max: max((r) => r.elu) },
    cpuPct: { avg: avg((r) => r.cpuPct), max: max((r) => r.cpuPct) },
    rssMB: { start: recs[0]?.rssMB ?? null, end: recs.at(-1)?.rssMB ?? null, max: max((r) => r.rssMB) },
    heapMB: { min: recs.length ? r1(Math.min(...recs.map((r) => r.heapMB))) : null, max: max((r) => r.heapMB), end: recs.at(-1)?.heapMB ?? null },
    gc: { n: recs.reduce((a, r) => a + r.gc.n, 0), ms: r1(recs.reduce((a, r) => a + r.gc.ms, 0)), max: max((r) => r.gc.max) },
    sockets: max((r) => r.sockets),
    instances: instSummary(recs),
  }
}
/** room instances alive (from the probe): at the start / end of the window and the most at any time */
function instSummary(recs: ProbeRec[]) {
  const xs = recs.map((r) => r.inst).filter((x): x is { keys: number; total: number; homes: number } => !!x)
  if (!xs.length) return null
  const top = (k: 'keys' | 'total' | 'homes') => Math.max(...xs.map((x) => x[k]))
  return { start: xs[0], end: xs.at(-1)!, max: { keys: top('keys'), total: top('total'), homes: top('homes') } }
}

function restSummary(rest: Stats['rest'], secs: number) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rest)) {
    const d = dist(v.lat)
    const n = v.lat.length + Object.values(v.errs).reduce((a, b) => a + b, 0)
    out[k] = { n, perSec: r1(n / secs), p50: d.p50, p95: d.p95, p99: d.p99, max: d.max, codes: v.codes, errs: v.errs }
  }
  return out
}

/** Run `during` while measuring the server (probe + /api/metrics) and the bots. */
async function measure(cl: Cluster | null, label: string, during: () => Promise<unknown>) {
  const m0 = await metrics()
  if (cl) await cl.stats(true)
  const errs0 = server.errors.length
  const crashes0 = server.crashes.length
  const t0 = Date.now()
  await during()
  const t1 = Date.now()
  const m1 = await metrics()
  const s = cl ? await cl.stats(false) : null
  const secs = (t1 - t0) / 1000
  const pr = probeSummary(probeRecs(t0, t1))
  const d = (k: keyof Metrics) => (m0 && m1 ? (m1[k] as number) - (m0[k] as number) : null)
  const flushes = d('flushes')
  const sent = s ? Object.values(s.sent).reduce((a, b) => a + b, 0) : 0
  return {
    label,
    t0,
    t1,
    seconds: r1(secs),
    bots: s?.bots ?? 0,
    inRoom: s?.inRoom ?? 0,
    online: m1?.online ?? null,
    tick: { ...pr.tick, avgFromMetrics: flushes ? Math.round((d('flushMs')! / flushes) * 1000) / 1000 : null },
    tickGap: pr.gap,
    eldP99: pr.eldP99,
    eldMax: pr.eldMax,
    elu: pr.elu,
    cpuPct: pr.cpuPct,
    rssMB: pr.rssMB,
    heapMB: pr.heapMB,
    gc: pr.gc,
    sockets: pr.sockets,
    instances: pr.instances,
    sentPerSec: r1(sent / secs),
    msgsInPerSec: d('msgsIn') !== null ? Math.round(d('msgsIn')! / secs) : null,
    eventsPerSec: s ? Math.round(s.recvEvents / secs) : null,
    wsMsgsOutPerSec: d('msgsOut') !== null ? Math.round(d('msgsOut')! / secs) : null,
    kbOutPerSec: d('bytesOut') !== null ? Math.round(d('bytesOut')! / secs / 1024) : null,
    botKbInPerSec: s ? Math.round(s.recvBytes / secs / 1024) : null,
    ping: s ? dist(s.ping) : null,
    echoMove: s ? dist(s.echoMove) : null,
    echoChat: s ? dist(s.echoChat) : null,
    joinWelcome: s ? dist(s.joinWelcome) : null,
    dropped: d('dropped'),
    closes: s?.closes ?? {},
    wsErrors: s?.wsErrors ?? {},
    kicks: s?.kicks ?? 0,
    sysTexts: s?.sysTexts ?? {},
    rest: s ? restSummary(s.rest, secs) : {},
    serverErrors: server.errors.slice(errs0, errs0 + 10),
    serverErrorCount: server.errors.length - errs0,
    crashed: server.crashes.length > crashes0,
    botEventLoop: s ? { p99: r1(s.eldP99), max: r1(s.eldMax) } : null,
    stats: s,
  }
}
type Window = Awaited<ReturnType<typeof measure>>
/** keep results.json readable: drop raw samples */
const slim = (w: Window) => {
  const { stats, ...rest } = w
  void stats
  return rest
}

async function crowd(n: number, o: { room: string; behavior: Behavior; flooders?: number; badRatio?: number; spreadMs?: number; workers?: number; xff?: boolean; realIp?: string }) {
  const cl = await Cluster.start({ base: BASE, bots: n, workers: o.workers, xff: o.xff, realIp: o.realIp })
  const t0 = Date.now()
  await cl.stats(true)
  const su = await cl.signup(n, { concurrency: 25 })
  const sus = await cl.stats(true)
  const t1 = Date.now()
  const co = await cl.connect(o.room, o.spreadMs ?? Math.min(10000, n * 8))
  const cos = await cl.stats(true)
  await cl.behave(o.behavior, { flooders: o.flooders, badRatio: o.badRatio })
  log(`  ${n} bots: signed up ${su.ok} (${su.fail} failed) in ${((t1 - t0) / 1000).toFixed(1)}s, connected ${co.ok} (${co.fail} failed) in ${((Date.now() - t1) / 1000).toFixed(1)}s, ${cl.size} workers`)
  return {
    cl,
    setup: {
      signupOk: su.ok,
      signupFail: su.fail,
      signupErrs: sus.signup.errs,
      signupLat: dist(sus.signup.lat),
      signupSecs: r1((t1 - t0) / 1000),
      connectOk: co.ok,
      connectFail: co.fail,
      connectSecs: r1((Date.now() - t1) / 1000),
      connectWsErrors: cos.wsErrors,
      welcome: dist(cos.joinWelcome),
    },
  }
}

const results: Record<string, unknown> = { startedAt: new Date().toISOString(), base: BASE, quick: QUICK, scenarios: {} }
const scenarioResults = results.scenarios as Record<string, unknown>
function save() {
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1))
}

/** Every scenario gets a fresh server and always cleans up its bots and server. */
async function fresh<T>(fn: () => Promise<T>, env: Record<string, string> = {}): Promise<T> {
  await server.start(env)
  try {
    return await fn()
  } finally {
    await server.stop()
  }
}

// ---------- 1. steady state / knee / Times Square ----------
async function levels(name: string, ns: number[], room: string, secs: number) {
  const out: unknown[] = []
  for (const n of ns) {
    log(`${name}: ${n} bots in ${room === 'random' ? '8 rooms' : room} for ${secs}s`)
    const r = await fresh(async () => {
      const { cl, setup } = await crowd(n, { room, behavior: 'mixed' })
      try {
        await sleep(QUICK ? 3000 : 10000)
        const w = await measure(cl, `${name} ${n}`, () => sleep(secs * 1000))
        const m = await metrics()
        return { n, setup, rooms: m?.rooms ?? null, ...slim(w) }
      } finally {
        await cl.close()
      }
    })
    log(`  tick avg ${r.tick.avg} p95 ${r.tick.p95} max ${r.tick.max} ms · ELU ${r.elu.avg} · ${r.eventsPerSec} ev/s · ${r.kbOutPerSec} KB/s · ping p95 ${r.ping?.p95} · echo p95 ${r.echoMove?.p95} · RSS ${r.rssMB.end} MB · errors ${r.serverErrorCount} · dropped ${r.dropped}`)
    out.push(r)
    scenarioResults[name] = out
    save()
  }
}

// ---------- 3. join burst ----------
async function burst(ns: number[]) {
  const out: unknown[] = []
  for (const n of ns) {
    log(`burst: ${n} new players within 10 s (100 already online)`)
    const r = await fresh(async () => {
      const bg = await crowd(100, { room: 'random', behavior: 'mixed' })
      const cl = await Cluster.start({ base: BASE, bots: n })
      try {
        await sleep(5000)
        await cl.stats(true)
        let res = { ok: 0, fail: 0 }
        const w = await measure(bg.cl, `burst ${n}`, async () => {
          res = await cl.signup(n, { flow: 'full', spreadMs: 10000, timeoutMs: 30000 })
        })
        const s = await cl.stats(false)
        const st = await cl.status()
        return {
          n,
          joined: res.ok,
          failed: res.fail,
          inRoomAfter: st.inRoom,
          seconds: w.seconds,
          signupLat: dist(s.signup.lat),
          signupErrs: s.signup.errs,
          timeToRoom: dist(s.timeToRoom),
          welcome: dist(s.joinWelcome),
          rest: restSummary(s.rest, w.seconds),
          wsErrors: s.wsErrors,
          closes: s.closes,
          server: { tick: w.tick, tickGap: w.tickGap, elu: w.elu, cpuPct: w.cpuPct, eldMax: w.eldMax, rssMB: w.rssMB, errors: w.serverErrors, errorCount: w.serverErrorCount, crashed: w.crashed },
          onlinePlayers: { ping: w.ping, echoMove: w.echoMove },
          botEventLoop: { p99: r1(s.eldP99), max: r1(s.eldMax) },
        }
      } finally {
        await cl.close()
        await bg.cl.close()
      }
    })
    log(`  ${r.joined}/${n} in a room, sign-up p95 ${r.signupLat.p95} ms (max ${r.signupLat.max}), time-to-room p95 ${r.timeToRoom.p95} ms, tick max ${r.server.tick.max} ms, errors ${JSON.stringify(r.signupErrs)}`)
    out.push(r)
    scenarioResults.burst = out
    save()
  }
}

// ---------- 3b. production rate limits (what a reverse proxy in front of the server does to them) ----------
async function limits() {
  const n = 50
  const run = async (label: string, env: Record<string, string>, xff: boolean, realIp?: string) =>
    fresh(async () => {
      const cl = await Cluster.start({ base: BASE, bots: n, workers: 1, xff, realIp })
      try {
        await cl.stats(true)
        const t0 = Date.now()
        const su = await cl.signup(n, { concurrency: 5 })
        const signupSecs = (Date.now() - t0) / 1000
        const s1 = await cl.stats(true)
        // every player that got in saves its game about once a second for 10 s (the client saves 3 s after a change)
        await cl.all({ cmd: 'rest', ownBot: true, thinkMs: 1000, ms: 10000, mix: [['save', 1]] })
        const s2 = await cl.stats(true)
        const saves = s2.rest['PUT /api/save']
        return {
          label,
          env,
          perPlayerForwardedFor: xff,
          realIp: realIp ?? null,
          signups: { attempted: n, ok: su.ok, failed: su.fail, seconds: r1(signupSecs), errs: s1.signup.errs },
          saves: saves ? { attempts: saves.lat.length, codes: saves.codes } : null,
        }
      } finally {
        await cl.close()
      }
    }, env)
  log('limits: production mode, every player behind one proxy address (TRUST_PROXY unset)')
  const a = await run('NODE_ENV=production, TRUST_PROXY unset — all players share the proxy IP', { NODE_ENV: 'production' }, false)
  log(`  sign-ups ok ${a.signups.ok}/${n}; saves ${JSON.stringify(a.saves?.codes)}`)
  log('limits: production mode with TRUST_PROXY=true, each player has its own X-Forwarded-For')
  const b = await run('NODE_ENV=production, TRUST_PROXY=true, distinct X-Forwarded-For per player', { NODE_ENV: 'production', TRUST_PROXY: 'true' }, true)
  log(`  sign-ups ok ${b.signups.ok}/${n}; saves ${JSON.stringify(b.saves?.codes)}`)
  log('limits: TRUST_PROXY=true, one client behind Railway (fixed X-Real-IP) sending made-up X-Forwarded-For values')
  const c = await run('NODE_ENV=production, TRUST_PROXY=true, one client: fixed X-Real-IP + made-up X-Forwarded-For', { NODE_ENV: 'production', TRUST_PROXY: 'true' }, true, '203.0.113.7')
  log(`  sign-ups ok ${c.signups.ok}/${n}; saves ${JSON.stringify(c.saves?.codes)}`)
  scenarioResults.limits = [a, b, c]
  save()
}

// ---------- 4. chat at the limit ----------
async function chat(n: number, secs: number) {
  log(`chat: ${n} bots chatting at ~0.65/s (limit 0.7/s), 10% flooders at ~3.3/s, 20% of lines need filtering, ${secs}s`)
  const r = await fresh(async () => {
    const { cl, setup } = await crowd(n, { room: 'random', behavior: 'chat', flooders: 0.1, badRatio: 0.2 })
    try {
      await sleep(QUICK ? 3000 : 10000)
      const w = await measure(cl, `chat ${n}`, () => sleep(secs * 1000))
      const s = w.stats!
      const normalSent = (s.sent.s ?? 0) - s.floodSent
      return {
        n,
        setup,
        ...slim(w),
        chat: {
          normalSent,
          normalAccepted: s.ownChats,
          normalAcceptedPct: normalSent ? r1((100 * s.ownChats) / normalSent) : null,
          flooderSent: s.floodSent,
          flooderAccepted: s.floodChats,
          flooderAcceptedPerSecEach: r2(s.floodChats / Math.max(1, Math.round(n * 0.1)) / w.seconds),
          muteStarts: s.muteStarts,
          mutedNotices: s.mutes,
          linesSeen: s.chatSeen,
          linesFiltered: s.chatFiltered,
          leaks: s.chatLeaks,
          leakSamples: s.chatLeakSamples,
          chatsDeliveredPerSec: Math.round(s.chatSeen / w.seconds),
        },
      }
    } finally {
      await cl.close()
    }
  })
  log(`  accepted ${r.chat.normalAcceptedPct}% of normal chat, flooders ${r.chat.flooderAcceptedPerSecEach}/s each, ${r.chat.muteStarts} mutes, leaks ${r.chat.leaks}, tick p95 ${r.tick.p95} max ${r.tick.max} ms, ping p95 ${r.ping?.p95}`)
  scenarioResults.chat = r
  save()
}

// ---------- 5. room hopping ----------
async function hop(n: number, secs: number) {
  log(`hop: ${n} bots changing rooms every 3–6 s (15% to apartments), ${secs}s`)
  const r = await fresh(async () => {
    const { cl, setup } = await crowd(n, { room: 'random', behavior: 'hop' })
    try {
      await sleep(QUICK ? 3000 : 10000)
      const w = await measure(cl, `hop ${n}`, () => sleep(secs * 1000))
      return { n, setup, joinsPerSec: r1((w.stats!.sent.j ?? 0) / w.seconds), ...slim(w) }
    } finally {
      await cl.close()
    }
  })
  log(`  ${r.joinsPerSec} joins/s, join→welcome p95 ${r.joinWelcome?.p95} ms, tick p95 ${r.tick.p95} max ${r.tick.max} ms, RSS ${r.rssMB.end} MB`)
  scenarioResults.hop = r
  save()
}

// ---------- 6. reconnect storm ----------
async function storm(n: number, modes: string[]) {
  const out: unknown[] = []
  for (const mode of modes) {
    // a number = kill -9 (a crash) and restart after that many ms; 'term' = SIGTERM (a deploy), restart once it has exited
    const graceful = mode === 'term'
    const outage = graceful ? 0 : Number(mode)
    log(`storm: ${n} bots, ${graceful ? 'SIGTERM (graceful), restart when it exits' : `kill -9, restart after ${outage / 1000}s`}`)
    await server.start()
    const { cl, setup } = await crowd(n, { room: 'random', behavior: 'mixed' })
    try {
      await cl.all({ cmd: 'reconnect', on: true })
      await sleep(QUICK ? 3000 : 10000)
      const before = await measure(cl, 'before', () => sleep(5000))
      await cl.stats(true)
      const tKill = Date.now()
      await cl.all({ cmd: 'mark', at: tKill })
      await server.kill(graceful ? 'SIGTERM' : 'SIGKILL')
      const exitedMs = Date.now() - tKill
      await sleep(outage)
      const startMs = await server.start()
      const tReady = Date.now()
      const timeline: [number, number][] = []
      let st = await cl.status()
      while (Date.now() - tKill < 90000) {
        st = await cl.status()
        timeline.push([Date.now() - tKill, st.back])
        if (st.back >= st.bots) break
        await sleep(250)
      }
      await sleep(3000) // let the REST calls of the last arrivals finish
      const s = await cl.stats(true)
      const after = await measure(cl, 'after', () => sleep(5000))
      const total = st.bots
      const back = [...s.back].sort((a, b) => a - b)
      const at = (f: number) => (back.length >= Math.ceil(f * total) ? back[Math.ceil(f * total) - 1] : null)
      const restoredProbe = probeSummary(probeRecs(tReady, tReady + 15000))
      const r = {
        n,
        setup,
        mode: graceful ? 'SIGTERM (graceful shutdown), restart on exit' : `kill -9, restart after ${outage / 1000} s`,
        oldProcessExitMs: exitedMs,
        outageMs: outage,
        serverStartMs: startMs,
        downMs: tReady - tKill,
        bots: total,
        back: back.length,
        msFromKill: { p50: at(0.5), p95: at(0.95), p100: at(1) },
        msFromReady: { p50: at(0.5) === null ? null : at(0.5)! - (tReady - tKill), p95: at(0.95) === null ? null : at(0.95)! - (tReady - tKill), p100: at(1) === null ? null : at(1)! - (tReady - tKill) },
        reconnectAttempts: s.reconnects,
        failedAttempts: s.connectFails,
        closes: s.closes,
        wsErrors: s.wsErrors,
        rest: restSummary(s.rest, (Date.now() - tKill) / 1000),
        serverAfterRestart: { tick: restoredProbe.tick, elu: restoredProbe.elu, eldMax: restoredProbe.eldMax, cpuPct: restoredProbe.cpuPct },
        serverErrors: server.errors.slice(-5),
        timeline: timeline.filter((_, i) => i % 4 === 0),
        before: { tickP95: before.tick.p95, pingP95: before.ping?.p95 },
        after: { tickP95: after.tick.p95, pingP95: after.ping?.p95, inRoom: after.inRoom },
      }
      log(`  server back in ${startMs} ms (down ${r.downMs} ms); 95% back ${r.msFromKill.p95} ms after kill (${r.msFromReady.p95} ms after ready), 100% ${r.msFromKill.p100} ms; ${s.reconnects} attempts; errors ${JSON.stringify(s.wsErrors)}`)
      out.push(r)
      scenarioResults.storm = out
      save()
    } finally {
      await cl.close()
      await server.stop()
    }
  }
}

// ---------- 8. REST under concurrency ----------
async function seedLeaderboard(users: number) {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(DB)
  db.exec('PRAGMA busy_timeout = 5000')
  const week = weekId()
  const now = Date.now()
  const rows = Array.from({ length: users }, (_, i) => ({ i, id: randomUUID(), best: 1 + Math.floor(119 * Math.random() ** 2) })).sort((a, b) => b.best - a.best)
  const insU = db.prepare('INSERT INTO users (id, name, created_at, last_seen, is_guest, profile_done, look, team, title, save, save_updated) VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)')
  const insS = db.prepare('INSERT OR REPLACE INTO scores (game, week, user_id, best, updated_at) VALUES (?, ?, ?, ?, ?)')
  db.exec('BEGIN')
  rows.forEach((r, rank) => {
    const save = makeSave(r.i, rank < 500 ? 20 : 1)
    insU.run(r.id, `seed_${r.i}`, now - r.i * 1000, now, JSON.stringify(save.look), String(save.team), String(save.title), JSON.stringify(save), now)
    insS.run('ferry-captain', week, r.id, r.best, now)
    insS.run('ferry-captain', 'all', r.id, r.best, now)
  })
  db.exec('COMMIT')
  const size = (db.prepare('SELECT page_count * page_size AS b FROM pragma_page_count(), pragma_page_size()').get() as { b: number }).b
  db.close()
  return { users, week, dbMB: r1(size / 1048576) }
}

async function restScenario(players: number) {
  log(`rest: seeding a ${QUICK ? 2000 : 20000}-player leaderboard, then ${players} players online + REST load`)
  // the schema comes from the server's own migrations
  await server.start()
  await server.stop()
  const seeded = await seedLeaderboard(QUICK ? 2000 : 20000)
  const r = await fresh(async () => {
    const { cl, setup } = await crowd(players, { room: 'random', behavior: 'mixed' })
    try {
      const fr = await cl.all<{ made: number }>({ cmd: 'befriend', k: 5 })
      const friendships = fr.reduce((a, f) => a + f.made, 0)
      await sleep(5000)
      const baseline = await measure(cl, 'players only', () => sleep(QUICK ? 5000 : 15000))
      const runs: unknown[] = []
      const shot = async (label: string, concurrency: number, ms: number, mix: [RestCall, number][]) => {
        const per = Math.max(1, Math.round(concurrency / cl.size))
        const w = await measure(cl, label, () => cl.all({ cmd: 'rest', concurrency: per, ms, mix }))
        runs.push({ label, concurrency: per * cl.size, rest: w.rest, tick: w.tick, tickGap: w.tickGap, elu: w.elu, cpuPct: w.cpuPct, ping: w.ping, echoMove: w.echoMove, rssMB: w.rssMB, serverErrorCount: w.serverErrorCount, serverErrors: w.serverErrors })
        log(`  ${label}: ${JSON.stringify(Object.fromEntries(Object.entries(w.rest).filter(([k]) => !/blocks|online/.test(k)).map(([k, v]) => [k, { perSec: (v as { perSec: number }).perSec, p95: (v as { p95: number }).p95 }])))} · tick p95 ${w.tick.p95} max ${w.tick.max} · ping p95 ${w.ping?.p95}`)
      }
      const secs = QUICK ? 4000 : 10000
      for (const ep of ['leaderboard', 'city', 'friends', 'save'] as RestCall[]) await shot(`${ep} alone, 50 concurrent`, 50, secs, [[ep, 1]])
      await shot('mix, 200 concurrent', 200, QUICK ? 8000 : 30000, [
        ['leaderboard', 20],
        ['leaderboard-all', 5],
        ['leaderboard-friends', 5],
        ['city', 30],
        ['friends', 25],
        ['save', 15],
      ])
      return { players, setup, seeded, friendships, baseline: { tick: baseline.tick, ping: baseline.ping, elu: baseline.elu }, runs }
    } finally {
      await cl.close()
    }
  })
  scenarioResults.rest = r
  save()
}

// ---------- robustness: bad input should be refused, not crash or bloat the server ----------
async function guestCookie() {
  const g = await fetch(`${BASE}/api/auth/guest`, { method: 'POST' })
  const cookie = (g.headers.get('set-cookie') ?? '').split(';')[0]
  const name = 'bot_' + Array.from({ length: 9 }, () => 'jmqvx269'[Math.floor(Math.random() * 8)]).join('')
  const p = await fetch(`${BASE}/api/profile`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ name, team: 'midtown', look: { skin: 1, hair: 'short', hairColor: 1, items: {} }, birth: { m: 1, y: 2000 }, consent: POLICY_VERSION }) })
  // the signed-in probes below mean nothing without a real profile (the socket would just answer 401)
  if (!p.ok) throw new Error(`robustness: couldn't create a test player (POST /api/profile → ${p.status})`)
  return cookie
}
function rawUpgrade(path: string, cookie: string, after?: (s: import('node:net').Socket) => void, waitMs = 1500): Promise<{ response: string; stillOpenAfterMs: number | null }> {
  return new Promise((done) => {
    const s = tcpConnect(PORT, '127.0.0.1')
    let response = ''
    let finished = false
    const t0 = Date.now()
    const end = (open: boolean) => {
      if (finished) return
      finished = true
      s.destroy()
      done({ response: response.split('\r\n')[0] ?? '', stillOpenAfterMs: open ? Date.now() - t0 : null })
    }
    s.on('connect', () => s.write(`GET ${path} HTTP/1.1\r\nHost: localhost:${PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n${cookie ? `Cookie: ${cookie}\r\n` : ''}\r\n`))
    s.on('data', (d) => {
      const first = !response
      response += String(d)
      if (first && response.startsWith('HTTP/1.1 101') && after) after(s)
    })
    s.on('close', () => end(false))
    s.on('error', () => end(false))
    setTimeout(() => end(true), waitMs)
  })
}

async function robustness() {
  const probes: Record<string, unknown>[] = []
  const check = async (name: string, fn: () => Promise<Record<string, unknown>>) => {
    if (!server.alive) await server.start()
    const crashes0 = server.crashes.length
    const detail = await fn()
    await sleep(800)
    const crashed = server.crashes.length > crashes0
    const crash = crashed ? server.crashes.at(-1)!.tail.split('\n').filter((l) => /Error|at |code:/.test(l)).slice(0, 4).join(' | ') : null
    probes.push({ name, crashed, ...detail, crash })
    log(`  ${crashed ? 'CRASHED' : 'survived'} — ${name} ${JSON.stringify(detail)}`)
  }
  log('robustness: malformed input')
  await server.start()
  try {
    await check('WS upgrade with a malformed club_sid cookie (no account needed)', async () => ({ response: (await rawUpgrade('/ws', 'club_sid=%E0%A4%A')).response }))
    await check('signed-in WebSocket message over the 4 KB limit', async () => {
      const cookie = await guestCookie()
      const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws`, { headers: { cookie } })
      const code = await new Promise<number>((res) => {
        ws.on('open', () => ws.send(JSON.stringify({ t: 's', m: 'x'.repeat(5000) })))
        ws.on('close', (c: number) => res(c))
        ws.on('error', () => {})
        setTimeout(() => res(-1), 3000)
      })
      return { closeCode: code }
    })
    await check('signed-in WebSocket text frame with invalid UTF-8', async () => {
      const cookie = await guestCookie()
      const r = await rawUpgrade('/ws', cookie, (s) => {
        const payload = Buffer.from([0x7b, 0xff, 0xfe, 0x7d])
        s.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length, 0, 0, 0, 0]), payload]))
      })
      return { response: r.response }
    })
    await check('WebSocket upgrade to a path other than /ws', async () => {
      const r = await rawUpgrade('/not-ws', '', undefined, 5000)
      return { response: r.response || '(no response)', socketStillOpenAfterMs: r.stillOpenAfterMs }
    })
    await check('POST with Origin: null (sandboxed iframe, some privacy modes)', async () => {
      const r = await fetch(`${BASE}/api/auth/guest`, { method: 'POST', headers: { origin: 'null' } })
      return { status: r.status }
    })
    await check('50 MB PUT /api/save body from a signed-in player', async () => {
      const cookie = await guestCookie()
      await sleep(1500)
      const before = probeRecs(Date.now() - 1500, Date.now()).at(-1)
      const t0 = Date.now()
      const r = await fetch(`${BASE}/api/save`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: '{"save":{"x":"' + 'a'.repeat(50 * 1048576) + '"}}' }).catch((e: Error) => ({ status: e.message }))
      const ms = Date.now() - t0
      await sleep(1500)
      const after = probeRecs(t0, Date.now())
      return { status: (r as { status: number | string }).status, ms, rssBeforeMB: before?.rssMB ?? null, rssPeakMB: after.length ? Math.max(...after.map((x) => x.rssMB)) : null }
    })
  } finally {
    await server.stop()
  }

  scenarioResults.robustness = { probes }
  save()
}

// ---------- apartments: instances for made-up owners, and whether visited apartments are freed ----------
async function apartments() {
  log('apartments: 200 players in Times Square; 20 of them join made-up apartments as fast as the socket allows, then everyone visits real apartments')
  const r = await fresh(async () => {
    const { cl } = await crowd(200, { room: 'times-square', behavior: 'idle', workers: 1 })
    try {
      await sleep(3000)
      const snap = (w: Window) => ({ instances: w.instances?.end ?? null, maxDuring: w.instances?.max ?? null, idleTickAvgMs: w.tick.avg, idleTickP95Ms: w.tick.p95, heapMinMB: w.heapMB.min, rssMB: w.rssMB.end })
      const idle = async (label: string) => snap(await measure(cl, label, () => sleep(10000)))
      const before = await idle('before')
      // 1. made-up owner ids, 25 joins/s per connection (under the 30 msg/s cap) from 20 connections
      let fakeSent = 0
      const fake = await measure(cl, 'made-up owners', async () => {
        const per = await cl.all<{ sent: number }>({ cmd: 'leak', owners: 'fake', perSec: 25, ms: (QUICK ? 8 : 20) * 1000, limit: 20 })
        fakeSent = per.reduce((a, x) => a + x.sent, 0)
      })
      await sleep(5000) // join tokens refill; emptied instances are retired
      await cl.all({ cmd: 'join', room: 'times-square' })
      await sleep(3000)
      const afterFake = await idle('after made-up owners')
      // 2. real apartments: everyone visits other players' homes once a second (the join limit) — mostly nobody home
      let realSent = 0
      const real = await measure(cl, 'real apartments', async () => {
        const per = await cl.all<{ sent: number }>({ cmd: 'leak', owners: 'real', perSec: 1, ms: (QUICK ? 8 : 30) * 1000 })
        realSent = per.reduce((a, x) => a + x.sent, 0)
      })
      await sleep(5000)
      await cl.all({ cmd: 'join', room: 'times-square' })
      await sleep(3000)
      const afterReal = await idle('after real apartments')
      return {
        players: 200,
        before,
        madeUpOwners: { joinsSent: fakeSent, from: '20 connections × 25 joins/s', replies: fake.sysTexts, ...snap(fake) },
        afterMadeUp: afterFake,
        realApartments: { joinsSent: realSent, from: '200 connections × 1 join/s', replies: real.sysTexts, ...snap(real) },
        afterReal,
      }
    } finally {
      await cl.close()
    }
  })
  log(`  ${JSON.stringify(r)}`)
  scenarioResults.apartments = r
  save()
}

// ---------- 9. a real browser in a crowd ----------
async function runPerf(args: string[], onReady?: () => Promise<void>): Promise<Record<string, unknown> | { error: string }> {
  return new Promise((done) => {
    const p = spawn(PYTHON, [join(TOOLS, 'mp_perf.py'), ...args], { cwd: TOOLS, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d: Buffer) => {
      out += String(d)
      if (onReady && out.includes('READY')) {
        const f = onReady
        onReady = undefined
        void f()
      }
    })
    p.stderr.on('data', (d: Buffer) => (err += String(d)))
    p.on('exit', () => {
      const line = out.split('\n').find((l) => l.startsWith('RESULT '))
      done(line ? (JSON.parse(line.slice(7)) as Record<string, unknown>) : { error: (err || out).slice(-800) })
    })
  })
}

async function browser(bots: number) {
  if (!existsSync(PYTHON) || !existsSync(join(TOOLS, 'mp_perf.py'))) {
    scenarioResults.browser = { skipped: `needs ${PYTHON} and ${join(TOOLS, 'mp_perf.py')}` }
    return log('browser: skipped (no Python/Playwright)')
  }
  if (!existsSync(join(SERVER_DIR, '../app/dist/index.html'))) {
    scenarioResults.browser = { skipped: 'needs a built client: npm --prefix app run build' }
    return log('browser: skipped (no app/dist)')
  }
  log(`browser: one Chromium in Times Square, alone and then with ${bots} bots`)
  const r = await fresh(async () => {
    const alone = await runPerf(['--base', BASE, '--min-remote', '0', '--seconds', '10', '--shot', 'mp-perf-alone.png'])
    log(`  alone: ${JSON.stringify(alone)}`)
    let cl: Cluster | null = null
    let t0 = 0
    const crowded = await runPerf(['--base', BASE, '--min-remote', '55', '--seconds', '10', '--wait', '90', '--shot', 'mp-perf-crowd.png'], async () => {
      // the browser is in Times Square 1 first; bots fill it to 60 and spill into Times Square 2, 3, 4
      t0 = Date.now()
      cl = (await crowd(bots, { room: 'times-square', behavior: 'mixed', spreadMs: 5000 })).cl
    })
    const server = probeSummary(probeRecs(t0, Date.now()))
    const m = await metrics()
    if (cl) await (cl as Cluster).close()
    log(`  with ${bots} bots: ${JSON.stringify(crowded)}`)
    return { bots, alone, crowded, rooms: m?.rooms ?? null, server: { tick: server.tick, elu: server.elu } }
  })
  scenarioResults.browser = r
  save()
}

// ---------- 7. soak ----------
async function soak(n: number, minutes: number) {
  log(`soak: ${n} bots for ${minutes} min (mixed + hops + cloud saves + /api/online polling)`)
  const r = await fresh(async () => {
    const { cl, setup } = await crowd(n, { room: 'random', behavior: 'soak' })
    try {
      await sleep(10000)
      const perMinute: unknown[] = []
      const t0 = Date.now()
      for (let i = 1; i <= minutes; i++) {
        const w = await measure(cl, `minute ${i}`, () => sleep(60000))
        const sv = (w.rest as Record<string, { p95: number; n: number; codes: Record<string, number> }>)['PUT /api/save']
        perMinute.push({ minute: i, tickAvg: w.tick.avg, tickP95: w.tick.p95, tickMax: w.tick.max, elu: w.elu.avg, cpu: w.cpuPct.avg, rssMB: w.rssMB.end, heapMinMB: w.heapMB.min, heapMaxMB: w.heapMB.max, eventsPerSec: w.eventsPerSec, pingP95: w.ping?.p95, echoP95: w.echoMove?.p95, savesP95: sv?.p95 ?? null, saves: sv?.n ?? 0, gcMs: w.gc.ms, errors: w.serverErrorCount, dropped: w.dropped, inRoom: w.inRoom, closes: w.closes })
        log(`  min ${i}: tick avg ${w.tick.avg} p95 ${w.tick.p95} max ${w.tick.max} · RSS ${w.rssMB.end} · heap min ${w.heapMB.min} · ping p95 ${w.ping?.p95} · in room ${w.inRoom}/${n} · errors ${w.serverErrorCount}`)
        scenarioResults.soak = { n, minutes, setup, perMinute }
        save()
      }
      const all = probeSummary(probeRecs(t0, Date.now()))
      // linear trend of per-minute heap minimum (live heap after GC) and RSS, skipping 2 warm-up minutes
      const pm = perMinute as { minute: number; heapMinMB: number; rssMB: number; tickAvg: number }[]
      const slope = (k: 'heapMinMB' | 'rssMB' | 'tickAvg') => {
        const pts = pm.filter((p) => p.minute > 2).map((p) => [p.minute, p[k]] as const)
        if (pts.length < 2) return null
        const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length
        const my = pts.reduce((a, p) => a + p[1], 0) / pts.length
        const num = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0)
        const den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0)
        return Math.round((num / den) * 1000) / 1000
      }
      return { n, minutes, setup, overall: all, trendPerMinute: { heapMinMB: slope('heapMinMB'), rssMB: slope('rssMB'), tickAvgMs: slope('tickAvg') }, perMinute }
    } finally {
      await cl.close()
    }
  })
  log(`  trend per minute: ${JSON.stringify(r.trendPerMinute)}`)
  scenarioResults.soak = r
  save()
}

// ---------- summary.md ----------
function fmt(x: unknown) {
  return x === null || x === undefined ? '–' : String(x)
}
function summaryMd() {
  const S = scenarioResults as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const L: string[] = [`# Load test results ${results.startedAt as string}`, '', `Server: ${BASE} · quick: ${QUICK}`, '']
  const levelTable = (title: string, rows: any[]) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    L.push(`## ${title}`, '', '| Bots | Tick avg / p95 / max (ms) | ELU avg | CPU avg | Late ticks >100 ms | Events/s | WS msgs/s | KB/s out | Ping p50 / p95 (ms) | Echo p50 / p95 (ms) | RSS end (MB) | Server errors | Dropped | Sign-up / connect fails | Bot ELD p99 |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for (const r of rows) L.push(`| ${r.n} | ${fmt(r.tick.avg)} / ${fmt(r.tick.p95)} / ${fmt(r.tick.max)} | ${fmt(r.elu.avg)} | ${fmt(r.cpuPct.avg)}% | ${fmt(r.tickGap.late100)} | ${fmt(r.eventsPerSec)} | ${fmt(r.wsMsgsOutPerSec)} | ${fmt(r.kbOutPerSec)} | ${fmt(r.ping?.p50)} / ${fmt(r.ping?.p95)} | ${fmt(r.echoMove?.p50)} / ${fmt(r.echoMove?.p95)} | ${fmt(r.rssMB.end)} | ${fmt(r.serverErrorCount)} | ${fmt(r.dropped)} | ${r.setup.signupFail} / ${r.setup.connectFail} | ${fmt(r.botEventLoop?.p99)} |`)
    L.push('')
  }
  if (S.steady) levelTable('Steady state, mixed activity, 8 rooms', S.steady)
  if (S.knee) levelTable('Past the design load', S.knee)
  if (S.ts) levelTable('Everyone in Times Square', S.ts)
  if (S.burst) {
    L.push('## Join burst (10 s, 100 already online)', '', '| New players | In a room | Sign-up p50 / p95 / max (ms) | Time to room p50 / p95 / max (ms) | Tick p95 / max (ms) | ELU max | Online players ping p95 | Errors |', '|---|---|---|---|---|---|---|---|')
    for (const r of S.burst) L.push(`| ${r.n} | ${r.joined} | ${fmt(r.signupLat.p50)} / ${fmt(r.signupLat.p95)} / ${fmt(r.signupLat.max)} | ${fmt(r.timeToRoom.p50)} / ${fmt(r.timeToRoom.p95)} / ${fmt(r.timeToRoom.max)} | ${fmt(r.server.tick.p95)} / ${fmt(r.server.tick.max)} | ${fmt(r.server.elu.max)} | ${fmt(r.onlinePlayers.ping?.p95)} | ${JSON.stringify(r.signupErrs)} ${JSON.stringify(r.wsErrors)} |`)
    L.push('')
  }
  if (S.limits) {
    L.push('## Production rate limits', '', '| Setup | Sign-ups OK | Sign-up errors | Saves, ~1/s per player for 10 s (status counts) |', '|---|---|---|---|')
    for (const r of S.limits) L.push(`| ${r.label} | ${r.signups.ok}/${r.signups.attempted} | ${JSON.stringify(r.signups.errs)} | ${JSON.stringify(r.saves?.codes)} |`)
    L.push('')
  }
  if (S.chat) {
    const c = S.chat
    L.push('## Chat at the limit', '', '| Bots | Chats delivered/s | Normal accepted | Flooder accepted/s each | Mutes | Lines filtered | Leaks | Tick p95 / max | Ping p95 |', '|---|---|---|---|---|---|---|---|---|')
    L.push(`| ${c.n} | ${c.chat.chatsDeliveredPerSec} | ${c.chat.normalAcceptedPct}% | ${c.chat.flooderAcceptedPerSecEach} | ${c.chat.muteStarts} | ${c.chat.linesFiltered} | ${c.chat.leaks} | ${fmt(c.tick.p95)} / ${fmt(c.tick.max)} | ${fmt(c.ping?.p95)} |`, '')
  }
  if (S.hop) {
    const h = S.hop
    L.push('## Room hopping', '', '| Bots | Joins/s | Join→welcome p50 / p95 / max | Tick avg / p95 / max | Events/s | RSS end | Errors |', '|---|---|---|---|---|---|---|')
    L.push(`| ${h.n} | ${h.joinsPerSec} | ${fmt(h.joinWelcome?.p50)} / ${fmt(h.joinWelcome?.p95)} / ${fmt(h.joinWelcome?.max)} | ${fmt(h.tick.avg)} / ${fmt(h.tick.p95)} / ${fmt(h.tick.max)} | ${h.eventsPerSec} | ${h.rssMB.end} | ${h.serverErrorCount} |`, '', `Server notices to hopping players: ${JSON.stringify(h.sysTexts ?? {})}`, '')
  }
  if (S.storm) {
    L.push('## Reconnect storm', '', '| Bots | Mode | Server start (ms) | 50% / 95% / 100% back after kill (ms) | 95% after ready (ms) | Attempts | WS errors | REST codes |', '|---|---|---|---|---|---|---|---|')
    for (const r of S.storm) L.push(`| ${r.n} | ${r.mode ?? `${r.outageMs / 1000}s`} | ${r.serverStartMs} | ${fmt(r.msFromKill.p50)} / ${fmt(r.msFromKill.p95)} / ${fmt(r.msFromKill.p100)} | ${fmt(r.msFromReady.p95)} | ${r.reconnectAttempts} | ${JSON.stringify(r.wsErrors)} | ${JSON.stringify(Object.fromEntries(Object.entries(r.rest).map(([k, v]: [string, any]) => [k, v.codes])))} |`) // eslint-disable-line @typescript-eslint/no-explicit-any
    L.push('')
  }
  if (S.rest) {
    L.push(`## REST under concurrency (${S.rest.players} players online, ${S.rest.seeded.users}-player leaderboard)`, '', '| Run | Endpoint | req/s | p50 / p95 / p99 / max (ms) | Status codes | Tick p95 / max | Ping p95 |', '|---|---|---|---|---|---|---|')
    for (const run of S.rest.runs) for (const [ep, v] of Object.entries(run.rest as Record<string, any>)) if (!/blocks|online/.test(ep)) L.push(`| ${run.label} | ${ep} | ${v.perSec} | ${fmt(v.p50)} / ${fmt(v.p95)} / ${fmt(v.p99)} / ${fmt(v.max)} | ${JSON.stringify(v.codes)}${Object.keys(v.errs).length ? ' ' + JSON.stringify(v.errs) : ''} | ${fmt(run.tick.p95)} / ${fmt(run.tick.max)} | ${fmt(run.ping?.p95)} |`) // eslint-disable-line @typescript-eslint/no-explicit-any
    L.push('')
  }
  if (S.robustness) {
    L.push('## Robustness', '', '| Probe | Server crashed? | Detail |', '|---|---|---|')
    for (const p of S.robustness.probes) {
      const { name, crashed, crash, ...rest } = p
      L.push(`| ${name} | ${crashed ? '**yes**' : 'no'} | ${JSON.stringify(rest)}${crash ? ' — ' + String(crash).replace(/\|/g, '/') : ''} |`)
    }
    L.push('')
  }
  if (S.apartments) {
    const a = S.apartments
    L.push('## Apartment instances', '', '| Phase | Joins sent | Instances (keys / total / apartments) at end | Max during | Idle tick avg / p95 (ms) | Heap min (MB) | Server replies |', '|---|---|---|---|---|---|---|')
    const row = (label: string, x: any, sent = '', replies: unknown = '') => L.push(`| ${label} | ${sent} | ${x.instances ? `${x.instances.keys} / ${x.instances.total} / ${x.instances.homes}` : '–'} | ${x.maxDuring ? `${x.maxDuring.keys} / ${x.maxDuring.total} / ${x.maxDuring.homes}` : ''} | ${fmt(x.idleTickAvgMs)} / ${fmt(x.idleTickP95Ms)} | ${fmt(x.heapMinMB)} | ${replies ? JSON.stringify(replies) : ''} |`) // eslint-disable-line @typescript-eslint/no-explicit-any
    row('before', a.before)
    row('made-up owners (during)', a.madeUpOwners, String(a.madeUpOwners.joinsSent), a.madeUpOwners.replies)
    row('after made-up owners', a.afterMadeUp)
    row('real apartments (during)', a.realApartments, String(a.realApartments.joinsSent), a.realApartments.replies)
    row('after real apartments', a.afterReal)
    L.push('')
  }
  if (S.browser) L.push('## Browser in a crowd', '', '```', JSON.stringify(S.browser, null, 1), '```', '')
  if (S.soak?.perMinute) {
    L.push(`## Soak (${S.soak.n} bots, ${S.soak.minutes} min)`, '', `Trend per minute (after 2 warm-up minutes): ${JSON.stringify(S.soak.trendPerMinute ?? {})}`, '', '| Minute | Tick avg / p95 / max | ELU | RSS | Heap min | Events/s | Ping p95 | Echo p95 | Save p95 | Errors |', '|---|---|---|---|---|---|---|---|---|---|')
    for (const m of S.soak.perMinute) L.push(`| ${m.minute} | ${fmt(m.tickAvg)} / ${fmt(m.tickP95)} / ${fmt(m.tickMax)} | ${fmt(m.elu)} | ${m.rssMB} | ${m.heapMinMB} | ${m.eventsPerSec} | ${fmt(m.pingP95)} | ${fmt(m.echoP95)} | ${fmt(m.savesP95)} | ${m.errors} |`)
    L.push('')
  }
  if (server.crashes.length) L.push('## Unexpected server exits', '', ...server.crashes.map((c) => `- ${new Date(c.at).toISOString()} code=${c.code} signal=${c.signal}: ${c.tail.split('\n').filter((l) => /Error|code:/.test(l)).slice(0, 3).join(' / ')}`), '')
  writeFileSync(join(OUT, 'summary.md'), L.join('\n'))
}

// ---------- main ----------
async function main() {
  log(`load-test suite → ${OUT}`)
  log(`server dir ${SERVER_DIR}, port ${PORT}, db ${DB}, scenarios: ${chosen.join(' ')}${QUICK ? ' (quick)' : ''}`)
  const secs = opt.seconds ? Number(opt.seconds) : QUICK ? 15 : 90
  const short = opt.seconds ? Number(opt.seconds) : QUICK ? 15 : 45
  for (const name of chosen) {
    const t0 = Date.now()
    try {
      if (name === 'steady') await levels('steady', list(opt.steady, QUICK ? [100, 200] : [100, 200, 500, 1000]), 'random', secs)
      if (name === 'knee') await levels('knee', list(opt.knee, QUICK ? [1500] : [1500, 2000, 3000]), 'random', short)
      if (name === 'ts') await levels('ts', list(opt.ts, QUICK ? [200] : [200, 500]), 'times-square', opt.seconds ? short : QUICK ? 15 : 60)
      if (name === 'burst') await burst(QUICK ? [200] : [200, 500])
      if (name === 'limits') await limits()
      if (name === 'chat') await chat(QUICK ? 200 : 500, QUICK ? 15 : 60)
      if (name === 'hop') await hop(QUICK ? 200 : 500, QUICK ? 15 : 60)
      if (name === 'storm') await storm(Number(opt['storm-bots'] ?? 300), opt['storm-outages'] ? opt['storm-outages'].split(',') : QUICK ? ['0'] : ['0', '5000', 'term'])
      if (name === 'rest') await restScenario(300)
      if (name === 'robustness') await robustness()
      if (name === 'apartments') await apartments()
      if (name === 'browser') await browser(200)
      if (name === 'soak') await soak(300, Number(opt['soak-minutes'] ?? (QUICK ? 2 : 15)))
    } catch (e) {
      log(`${name} FAILED: ${(e as Error).stack}`)
      scenarioResults[`${name}Error`] = String((e as Error).stack)
      if (server.alive) await server.stop()
    }
    log(`${name} done in ${Math.round((Date.now() - t0) / 1000)}s`)
    save()
    summaryMd()
  }
  results.finishedAt = new Date().toISOString()
  results.unexpectedServerExits = server.crashes.map((c) => ({ at: new Date(c.at).toISOString(), code: c.code, signal: c.signal, tail: c.tail.slice(-600) }))
  save()
  summaryMd()
  log(`done → ${join(OUT, 'summary.md')}`)
  process.exit(0)
}
process.on('SIGINT', () => {
  void server.stop().then(() => process.exit(130))
})
main().catch(async (e) => {
  console.error(e)
  await server.stop()
  process.exit(1)
})
