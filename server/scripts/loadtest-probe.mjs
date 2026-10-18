/**
 * Load-test probe: a preload that measures the game server from the inside without changing its code.
 *
 *   LOADTEST_PROBE_OUT=/tmp/probe.jsonl node --import tsx --import ./scripts/loadtest-probe.mjs src/index.ts
 *
 * Once a second it appends one JSON line to $LOADTEST_PROBE_OUT:
 *   ticks  – how long each broadcast tick (realtime.ts flush(), the setInterval with TICK_MS) took, ms
 *   gaps   – time between consecutive tick starts (ideal: TICK_MS; bigger = the event loop was busy)
 *   eld    – event-loop delay p50/p99/max (ms), elu – event-loop utilisation (0..1)
 *   cpuPct – process CPU (100 = one full core), rssMB/heapMB/…, gc – collections and pause time
 *   sockets – open TCP sockets (WebSockets + HTTP keep-alives)
 *   inst   – room instances alive in realtime.ts: { keys, total, homes } (apartments are "homes")
 * Without LOADTEST_PROBE_OUT it does nothing. scripts/loadtest-scenarios.ts starts the server with it.
 */
import { appendFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { monitorEventLoopDelay, PerformanceObserver, performance } from 'node:perf_hooks'

const OUT = process.env.LOADTEST_PROBE_OUT
if (OUT) {
  const TICK = Number(process.env.TICK_MS ?? 66)

  // Find realtime.ts's `instances` map (room key → Instance[]) without touching its code: the first Map that gets
  // a string key whose room part is a real room id (app/src/data/geo/*.json) and an array value. Reported as
  // inst: { keys, total, homes } — homes = apartment instances ("apartment@<owner>").
  let rooms = new Set()
  try {
    rooms = new Set(readdirSync(resolve(process.cwd(), '../app/src/data/geo')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)))
  } catch {
    /* no geometry folder: instance counts just stay null */
  }
  let instancesRef = null
  const realMapSet = Map.prototype.set
  Map.prototype.set = function (k, v) {
    if (!instancesRef && Array.isArray(v) && typeof k === 'string' && rooms.has(k.split('@')[0])) instancesRef = new WeakRef(this)
    return realMapSet.call(this, k, v)
  }
  const instanceCounts = () => {
    const m = instancesRef?.deref()
    if (!m) return null
    let total = 0
    let homes = 0
    for (const [k, list] of m) {
      total += list.length
      if (k.includes('@')) homes++
    }
    return { keys: m.size, total, homes }
  }
  const realSetInterval = globalThis.setInterval
  let ticks = []
  let gaps = []
  let lastStart = 0
  // wrap only the broadcast tick (the one interval that runs every TICK_MS)
  globalThis.setInterval = function (fn, ms, ...args) {
    if (ms === TICK && typeof fn === 'function') {
      const timed = function (...a) {
        const t0 = performance.now()
        if (lastStart) gaps.push(t0 - lastStart)
        lastStart = t0
        try {
          return fn.apply(this, a)
        } finally {
          ticks.push(performance.now() - t0)
        }
      }
      return realSetInterval(timed, ms, ...args)
    }
    return realSetInterval(fn, ms, ...args)
  }

  const eld = monitorEventLoopDelay({ resolution: 5 })
  eld.enable()
  let gcN = 0
  let gcMs = 0
  let gcMax = 0
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      gcN++
      gcMs += e.duration
      if (e.duration > gcMax) gcMax = e.duration
    }
  }).observe({ entryTypes: ['gc'] })

  const r3 = (x) => Math.round(x * 1000) / 1000
  const mb = (x) => Math.round((x / 1048576) * 10) / 10
  let cpu = process.cpuUsage()
  let elu = performance.eventLoopUtilization()
  let at = performance.now()
  const timer = realSetInterval(() => {
    const now = performance.now()
    const c = process.cpuUsage(cpu)
    cpu = process.cpuUsage()
    const u = performance.eventLoopUtilization(elu)
    elu = performance.eventLoopUtilization()
    const m = process.memoryUsage()
    let sockets = 0
    for (const r of process.getActiveResourcesInfo()) if (r === 'TCPSocketWrap') sockets++
    const rec = {
      t: Date.now(),
      pid: process.pid,
      dt: r3(now - at),
      ticks: ticks.map(r3),
      gaps: gaps.map(r3),
      eld: { p50: r3(eld.percentile(50) / 1e6), p99: r3(eld.percentile(99) / 1e6), max: r3(eld.max / 1e6) },
      elu: r3(u.utilization),
      cpuPct: Math.round(((c.user + c.system) / 1000 / (now - at)) * 1000) / 10,
      rssMB: mb(m.rss),
      heapMB: mb(m.heapUsed),
      heapTotalMB: mb(m.heapTotal),
      extMB: mb(m.external),
      gc: { n: gcN, ms: r3(gcMs), max: r3(gcMax) },
      sockets,
      inst: instanceCounts(),
    }
    ticks = []
    gaps = []
    eld.reset()
    gcN = 0
    gcMs = 0
    gcMax = 0
    at = now
    try {
      appendFileSync(OUT, JSON.stringify(rec) + '\n')
    } catch {
      /* the probe must never take the server down */
    }
  }, 1000)
  timer.unref()
}
