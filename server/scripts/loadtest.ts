/**
 * Load test / smoke test for the realtime server.
 *   npx tsx scripts/loadtest.ts [bots=50] [seconds=20] [room=times-square|random] [behavior=mixed|chat|hop|soak|idle]
 *   BASE=http://localhost:8899 WORKERS=4 npx tsx scripts/loadtest.ts 500 60 random
 * Creates guest accounts with profiles, connects them over WebSocket, joins rooms, walks, chats and dances
 * like real players (bots act every 1.5–4 s — several times busier than a person), then reports throughput,
 * server-side flush cost, ping round-trips and errors. Bots run in worker processes (one per 250 bots) so the
 * load generator isn't the bottleneck. The full launch suite (bursts, reconnect storms, soak, REST…) is
 * scripts/loadtest-scenarios.ts.
 */
import { Cluster, dist, r1, r2, sleep, type Behavior } from './loadtest-lib.ts'

const BASE = process.env.BASE ?? 'http://localhost:8787'
const N = Number(process.argv[2] ?? 50)
const SECONDS = Number(process.argv[3] ?? 20)
const ROOM_ARG = process.argv[4] ?? 'random'
const BEHAVIOR = (process.argv[5] ?? 'mixed') as Behavior
const WORKERS = process.env.WORKERS ? Number(process.env.WORKERS) : undefined

type Metrics = { msgsIn: number; msgsOut: number; bytesOut: number; flushMs: number; flushes: number; dropped: number; rssMB: number; heapMB: number; online: number; rooms: Record<string, number> }
const metrics = async (): Promise<Metrics | null> => {
  try {
    const r = await fetch(`${BASE}/api/metrics`)
    return r.ok ? ((await r.json()) as Metrics) : null
  } catch {
    return null
  }
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null)
  if (!health?.ok) throw new Error(`no game server at ${BASE} (start one, or set BASE=…)`)
  const cluster = await Cluster.start({ base: BASE, bots: N, workers: WORKERS })
  console.log(`creating ${N} bots in ${cluster.size} worker process(es)…`)
  const t0 = Date.now()
  const su = await cluster.signup(N, { concurrency: 25 })
  const signupStats = await cluster.stats(false)
  const conn = await cluster.connect(ROOM_ARG, Math.min(10000, 20 * N))
  console.log(`signed up ${su.ok} (${su.fail} failed), connected ${conn.ok} (${conn.fail} failed) in ${((Date.now() - t0) / 1000).toFixed(1)}s; simulating ${SECONDS}s of '${BEHAVIOR}'…`)
  await cluster.behave(BEHAVIOR, BEHAVIOR === 'chat' ? { flooders: 0.1, badRatio: 0.2 } : {})
  await sleep(3000) // settle
  const before = await metrics()
  await cluster.stats(true)
  const w0 = Date.now()
  await sleep(SECONDS * 1000)
  const secs = (Date.now() - w0) / 1000
  const after = await metrics()
  const s = await cluster.stats(false)
  const sent = Object.values(s.sent).reduce((a, b) => a + b, 0)
  const d = (k: keyof Metrics) => (before && after ? (after[k] as number) - (before[k] as number) : null)
  const flushes = d('flushes')
  const ping = dist(s.ping)
  const echo = dist(s.echoMove)
  console.log(
    JSON.stringify(
      {
        bots: N,
        seconds: SECONDS,
        signupFailed: su.fail,
        signupP95: dist(signupStats.signup.lat).p95,
        connectFailed: conn.fail,
        sentPerSec: r1(sent / secs),
        eventsDeliveredPerSec: Math.round(s.recvEvents / secs),
        serverMsgsOutPerSec: before && after ? Math.round(d('msgsOut')! / secs) : null,
        serverKBOutPerSec: before && after ? Math.round(d('bytesOut')! / secs / 1024) : null,
        avgFlushMs: flushes ? +(d('flushMs')! / flushes).toFixed(3) : null,
        pingP50: ping.p50,
        pingP95: ping.p95,
        pingMax: ping.max,
        echoP50: echo.p50,
        echoP95: echo.p95,
        chatsSeenByAll: s.chatSeen,
        chatLeaks: s.chatLeaks,
        dropped: d('dropped'),
        unexpectedCloses: s.closes,
        wsErrors: s.wsErrors,
        botEventLoopP99: r2(s.eldP99),
        rssMB: after?.rssMB ?? null,
        heapMB: after?.heapMB ?? null,
        online: after?.online ?? null,
        rooms: after?.rooms ?? null,
      },
      null,
      1,
    ),
  )
  await cluster.close()
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
