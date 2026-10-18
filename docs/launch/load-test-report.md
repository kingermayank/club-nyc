# Club NYC load test

Measured on 17 October 2026 on a MacBook (Apple silicon) against the game server in production mode with a throwaway database. The simulated players ("bots") do what the real game does — sign up, connect, walk, chat, dance, change rooms, visit apartments, save — only several times busier than a person. Railway's hardware and real internet latency are **not** included, so read the numbers as the server's own headroom rather than a promise.

## The short version

- **One server holds a big launch.** With 1,000 players online, each round of updates took **5 ms** on average (the budget is 66 ms), with **0 errors** and **0 players dropped**, in about **170 MB** of memory. Even at **3,000** players it took 12 ms, still with 0 errors. So one Railway service should handle **1,000+ players at once**; the game loop isn't the first limit.
- **Crowds in one place are fine.** 500 players all in Times Square (split into copies of 60): 3.4 ms per update on average.
- **Rushes are fine.** 500 new players signing up within 10 seconds all got in, each in under 7 ms (95th percentile).
- **Chat floods are contained.** 500 players chatting at the maximum rate: 99.9% of normal messages delivered, spammers throttled to about one line every 7 seconds and auto-muted, no blocked words leaked.
- **Recovery is fast.** Killing the server outright: 300 players were back in a room about **1 second** after it restarted.
- **No slow leaks.** 300 players for 15 minutes: memory and update times stayed flat.
- **The game stays smooth.** A real browser in a crowd of 200: a steady **60 fps**.

**What to watch on Railway**

- **Network egress.** About 1.3 KB per second per player online (≈ 4.7 MB per player-hour), so 1,000 players online for an hour is ~4.7 GB, about $0.25 at $0.05/GB. Art downloads come on top; Railway's CDN removes most of those.
- **`TRUST_PROXY=true`.** Without it, Railway's proxy makes every player look like one address: in the test, 40 of 50 sign-ups were refused. The server now logs a warning at start-up if it's missing.

## What broke, and what was fixed

| Problem the test found | Before | After |
|---|---|---|
| A malformed session cookie on the live connection (no account needed) | **server crashed** | refused (401), server fine |
| A chat message over the 4 KB limit | **server crashed** | that connection is closed (1009), server fine |
| Invalid text (bad UTF-8) on the live connection | **server crashed** | that connection is closed, server fine |
| A request from an `Origin: null` page | server error (500) | refused (403) |
| A 50 MB upload | read into memory first (RAM 107 → 254 MB), then refused | refused before reading (RAM 125.3 → 125.5 MB, 44 ms) |
| A connection request to a path other than `/ws` | left hanging open | answered 404 and closed |
| "Visiting" made-up apartments | one connection could create ~25 empty rooms a second (≈ 90,000 an hour) | refused ("That apartment doesn’t exist"), room changes limited to about one a second; 9,900 attempts from 20 connections created **0** rooms |
| Empty apartments | stayed in memory forever | removed once empty (182 open at the peak of 200 visitors → 0 afterwards) |

Any of the three crashes would have disconnected everyone in the city, and anyone could repeat them. All three are now also checked by `tools/launch_test.py` on every run.

## Sizing the Railway service

- **Memory:** ~130 MB with 300 players, ~170 MB with 1,000, ~245 MB with 3,000. A 512 MB–1 GB service is plenty.
- **CPU:** about 9% of one core with 1,000 players on this Mac. Railway's virtual CPUs are usually slower than an Apple-silicon core, so allow 2–3× that; it's still well under one core.
- **One replica.** The live world lives in one process's memory, so don't add replicas. If it ever gets crowded, the runbook's knobs are `ROOM_CAP` (smaller room copies) and `TICK_MS` (fewer, larger updates).

## How to run it again

The suite runs against a frozen copy of the code, on port 8899, with a throwaway database, so it never touches your dev server or real data. Results (`summary.md`, `results.json`, `server.log`) go to a folder printed at the end.

```bash
bash server/scripts/loadtest-all.sh --quick
```
A quick smoke run (~8 minutes).

```bash
bash server/scripts/loadtest-all.sh
```
Everything (~40 minutes), including the 15-minute soak.

```bash
bash server/scripts/loadtest-all.sh robustness apartments hop
```
Only some scenarios: `steady`, `knee`, `ts`, `burst`, `limits`, `chat`, `hop`, `storm`, `rest`, `robustness`, `apartments`, `browser`, `soak`.

## Reading the tables

- **Tick:** how long the server takes to send one round of updates to everyone. The budget is 66 ms, about 15 rounds a second.
- **ELU:** the share of time the server's main thread is busy (1.0 = flat out).
- **Ping:** the round trip of a tiny message.
- **Echo:** how long until other players see your move. It includes waiting for the next round, so ~66 ms is by design.
- **RSS:** the server's memory.
- **Bot ELD:** the load generator's own delay. A low number means the bots weren't the bottleneck.

## Full results

The steady-state through soak tables come from the full run, before the fixes above (none of them touched the update loop). Room hopping, robustness and apartments were re-run on the fixed code.

### Steady state, mixed activity, 8 rooms

| Bots | Tick avg / p95 / max (ms) | ELU avg | CPU avg | Late ticks >100 ms | Events/s | WS msgs/s | KB/s out | Ping p50 / p95 (ms) | Echo p50 / p95 (ms) | RSS end (MB) | Server errors | Dropped | Sign-up / connect fails | Bot ELD p99 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 0.246 / 0.5 / 1.7 | 0.01 | 1.14% | 0 | 413 | 366 | 29 | 0.2 / 0.4 | 33.8 / 63.8 | 103.5 | 0 | 0 | 0 / 0 | 6.6 |
| 200 | 0.788 / 1.5 / 2.6 | 0.03 | 2.44% | 0 | 1670 | 1281 | 116 | 0.3 / 0.5 | 34.7 / 64.4 | 123.2 | 0 | 0 | 0 / 0 | 6.1 |
| 500 | 2.965 / 4.8 / 7.4 | 0.06 | 5.88% | 0 | 9443 | 5358 | 656 | 0.2 / 1.6 | 36 / 65.7 | 134.2 | 0 | 0 | 0 / 0 | 6.2 |
| 1000 | 5.063 / 6.9 / 10.5 | 0.09 | 9.21% | 0 | 18907 | 10696 | 1313 | 0.1 / 3.8 | 37 / 67.3 | 168.2 | 0 | 0 | 0 / 0 | 6.2 |

### Past the design load

| Bots | Tick avg / p95 / max (ms) | ELU avg | CPU avg | Late ticks >100 ms | Events/s | WS msgs/s | KB/s out | Ping p50 / p95 (ms) | Echo p50 / p95 (ms) | RSS end (MB) | Server errors | Dropped | Sign-up / connect fails | Bot ELD p99 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1500 | 6.746 / 8.5 / 10 | 0.12 | 12.07% | 0 | 28418 | 16082 | 1975 | 0.1 / 6.1 | 37.5 / 68.8 | 175.7 | 0 | 0 | 0 / 0 | 6.2 |
| 2000 | 8.461 / 10.1 / 11.6 | 0.15 | 14.96% | 0 | 37951 | 21557 | 2637 | 0.1 / 8.9 | 39.4 / 70.4 | 229.5 | 0 | 0 | 0 / 0 | 6.2 |
| 3000 | 11.612 / 13.4 / 16.4 | 0.21 | 20.16% | 0 | 57329 | 32408 | 3981 | 0.1 / 14 | 42.2 / 73.8 | 243.2 | 0 | 0 | 0 / 0 | 6.2 |

### Everyone in Times Square

| Bots | Tick avg / p95 / max (ms) | ELU avg | CPU avg | Late ticks >100 ms | Events/s | WS msgs/s | KB/s out | Ping p50 / p95 (ms) | Echo p50 / p95 (ms) | RSS end (MB) | Server errors | Dropped | Sign-up / connect fails | Bot ELD p99 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 200 | 1.349 / 2.2 / 2.8 | 0.03 | 3.13% | 0 | 3672 | 2097 | 255 | 0.2 / 0.5 | 34 / 64.5 | 125.1 | 0 | 0 | 0 / 0 | 6.1 |
| 500 | 3.436 / 5.3 / 6.3 | 0.07 | 6.72% | 0 | 9541 | 5401 | 663 | 0.2 / 1.6 | 36.2 / 65.9 | 133.4 | 0 | 0 | 0 / 0 | 6.2 |

### Join burst (10 s, 100 already online)

| New players | In a room | Sign-up p50 / p95 / max (ms) | Time to room p50 / p95 / max (ms) | Tick p95 / max (ms) | ELU max | Online players ping p95 | Errors |
|---|---|---|---|---|---|---|---|
| 200 | 200 | 1.4 / 2.3 / 8.7 | 5.7 / 8.7 / 40 | 1.8 / 2.5 | 0.1 | 0.4 | {} {} |
| 500 | 500 | 0.8 / 1.7 / 8.1 | 3.3 / 6.5 / 45.4 | 1.3 / 4.8 | 0.1 | 0.3 | {} {} |

### Production rate limits

Railway puts every player behind its proxy: with `TRUST_PROXY=true` the server sees each player’s real address.

| Setup | Sign-ups OK | Sign-up errors | Saves (status counts) |
|---|---|---|---|
| NODE_ENV=production, TRUST_PROXY unset — all players share the proxy IP | 10/50 | {"guest 429":40} | {"200":59,"429":47} |
| NODE_ENV=production, TRUST_PROXY=true, distinct X-Forwarded-For per player | 50/50 | {} | {"200":520} |

### Chat at the limit

| Bots | Chats delivered/s | Normal accepted | Flooder accepted/s each | Mutes | Lines filtered | Leaks | Tick p95 / max | Ping p95 |
|---|---|---|---|---|---|---|---|---|
| 500 | 16658 | 99.9% | 0.14 | 108 | 189070 | 0 | 6 / 20.4 | 2.4 |

### Room hopping (re-run on the fixed code)

| Bots | Joins/s | Join→welcome p50 / p95 / max | Tick avg / p95 / max | Events/s | RSS end | Errors |
|---|---|---|---|---|---|---|
| 500 | 111.1 | 0.2 / 0.8 / 8.4 | 2.019 / 3.8 / 5 | 6109 | 172.4 | 0 |

No player hopping at a normal pace (every 3–6 s) hit the new room-change limit.

### Reconnect storm

The 5 s outage row simulates a slow restart: players retry until the server is back.

| Bots | Outage | Server start (ms) | 50% / 95% / 100% back after kill (ms) | 95% after ready (ms) | Attempts | WS errors | REST codes |
|---|---|---|---|---|---|---|---|
| 300 | 0s | 141 | 808 / 1025 / 1049 | 875 | 300 | {} | {"GET /api/friends":{"200":300},"GET /api/blocks":{"200":300}} |
| 300 | 5s | 136 | 6078 / 12615 / 13360 | 7472 | 975 | {"":675} | {"GET /api/me":{},"GET /api/friends":{"200":300},"GET /api/blocks":{"200":300}} |

### REST under concurrency (300 players online, 20000-player leaderboard)

| Run | Endpoint | req/s | p50 / p95 / p99 / max (ms) | Status codes | Tick p95 / max | Ping p95 |
|---|---|---|---|---|---|---|
| leaderboard alone, 50 concurrent | GET /api/leaderboard/:game | 1972.1 | 23.8 / 44.6 / 49.3 / 655 | {"200":19768} | 1.6 / 2.9 | 48.7 |
| city alone, 50 concurrent | GET /api/city | 28858.9 | 1.5 / 3.1 / 5.8 / 26.4 | {"200":288618} | 1.2 / 1.7 | 3.5 |
| friends alone, 50 concurrent | GET /api/friends | 16554.3 | 2.8 / 5.3 / 6.8 / 15.9 | {"200":165609} | 1.4 / 1.7 | 6.2 |
| save alone, 50 concurrent | PUT /api/save | 7433.8 | 6.1 / 11.8 / 13.4 / 31.3 | {"200":74383} | 1 / 1.4 | 14.1 |
| mix, 200 concurrent | GET /api/city | 737.5 | 75.6 / 101 / 141.9 / 6813.3 | {"200":22186} | 1.4 / 2 | 159.1 |
| mix, 200 concurrent | GET /api/leaderboard/:game?scope=friends | 122 | 79.8 / 105.7 / 151.6 / 3333.5 | {"200":3669} | 1.4 / 2 | 159.1 |
| mix, 200 concurrent | GET /api/friends | 614.7 | 75.5 / 101.6 / 142.5 / 6683.3 | {"200":18491} | 1.4 / 2 | 159.1 |
| mix, 200 concurrent | GET /api/leaderboard/:game?period=all | 124.2 | 76.8 / 101.5 / 134.5 / 6757.9 | {"200":3735} | 1.4 / 2 | 159.1 |
| mix, 200 concurrent | GET /api/leaderboard/:game | 494 | 75.9 / 101.7 / 147.1 / 6172.4 | {"200":14862} | 1.4 / 2 | 159.1 |
| mix, 200 concurrent | PUT /api/save | 374.6 | 75.4 / 101.3 / 143.8 / 6569 | {"200":11269} | 1.4 / 2 | 159.1 |

### Robustness (re-run on the fixed code)

| Probe | Server crashed? | Detail |
|---|---|---|
| WS upgrade with a malformed club_sid cookie (no account needed) | no | {"response":"HTTP/1.1 401 Unauthorized"} |
| signed-in WebSocket message over the 4 KB limit | no | {"closeCode":1009} |
| signed-in WebSocket text frame with invalid UTF-8 | no | {"response":"HTTP/1.1 101 Switching Protocols"} |
| WebSocket upgrade to a path other than /ws | no | {"response":"HTTP/1.1 404 Not Found","socketStillOpenAfterMs":null} |
| POST with Origin: null (sandboxed iframe, some privacy modes) | no | {"status":403} |
| 50 MB PUT /api/save body from a signed-in player | no | {"status":413,"ms":44,"rssBeforeMB":125.3,"rssPeakMB":125.5} |

### Apartments (re-run on the fixed code)

200 players in Times Square. First, 20 of them try to "visit" made-up apartments 25 times a second; then all 200 visit real players’ apartments once a second.

| Phase | Joins sent | Instances (keys / total / apartments) at end | Max during | Idle tick avg / p95 (ms) | Heap min (MB) | Server replies |
|---|---|---|---|---|---|---|
| before |  | 1 / 4 / 0 | 1 / 4 / 0 | 0.015 / 0 | 23.6 |  |
| made-up owners (during) | 9900 | 1 / 4 / 0 | 1 / 4 / 0 | 0.011 / 0 | 21.8 | {"That apartment doesn’t exist.":460,"Whoa, slow down — one place at a time!":9440} |
| after made-up owners |  | 1 / 4 / 0 | 1 / 4 / 0 | 0.011 / 0 | 32.9 |  |
| real apartments (during) | 6000 | 177 / 177 / 176 | 183 / 183 / 182 | 0.203 / 1.7 | 19.6 | {} |
| after real apartments |  | 1 / 4 / 0 | 1 / 4 / 0 | 0.019 / 0 | 21.5 |  |

### A real browser in the crowd

```
{
 "bots": 200,
 "alone": {
  "profileStatus": 200,
  "room": "times-square",
  "instance": "Room 1",
  "remotePlayers": 0,
  "crowdWaitS": 0,
  "frames": 601,
  "fps": 60.1,
  "p50": 16.7,
  "p95": 16.7,
  "p99": 16.8,
  "worst": 16.8,
  "longTasks": 0,
  "longTaskMs": 0,
  "mainThreadBusyPct": 6.2,
  "scriptPct": 0.7,
  "layoutPct": 0.3,
  "stylePct": 0.8,
  "jsHeapMB": 3.9,
  "domNodes": 766,
  "pageErrors": []
 },
 "crowded": {
  "profileStatus": 200,
  "room": "times-square",
  "instance": "Room 1",
  "remotePlayers": 59,
  "crowdWaitS": 3.3,
  "frames": 601,
  "fps": 60.1,
  "p50": 16.7,
  "p95": 16.7,
  "p99": 16.8,
  "worst": 16.8,
  "longTasks": 0,
  "longTaskMs": 0,
  "mainThreadBusyPct": 15.5,
  "scriptPct": 1.9,
  "layoutPct": 1.3,
  "stylePct": 2.1,
  "jsHeapMB": 4.5,
  "domNodes": 4346,
  "pageErrors": []
 },
 "rooms": {
  "times-square": 200
 },
 "server": {
  "tick": {
   "n": 211,
   "avg": 0.617,
   "p50": 0.6,
   "p95": 1.3,
   "p99": 1.5,
   "max": 1.8
  },
  "elu": {
   "avg": 0.03,
   "max": 0.1
  }
 }
}
```

### Soak (300 players, 15 minutes)

Trend per minute (after 2 warm-up minutes): {"heapMinMB":-0.069,"rssMB":-2.429,"tickAvgMs":-0.012}

| Minute | Tick avg / p95 / max | ELU | RSS | Heap min | Events/s | Ping p95 | Echo p95 | Save p95 | Errors |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1.238 / 2.5 / 3.4 | 0.04 | 130.7 | 19.7 | 2176 | 0.5 | 64 | 3.2 | 0 |
| 2 | 0.58 / 1 / 2.5 | 0.03 | 131.2 | 19.8 | 1325 | 0.3 | 63.7 | 3.2 | 0 |
| 3 | 0.686 / 1.4 / 12.6 | 0.03 | 112.6 | 19.1 | 1125 | 0.4 | 64.4 | 3.3 | 0 |
| 4 | 0.822 / 1.5 / 2.8 | 0.04 | 120.5 | 19.1 | 1117 | 0.5 | 64.1 | 3 | 0 |
| 5 | 0.918 / 1.6 / 2.8 | 0.04 | 120.6 | 19.9 | 1082 | 0.5 | 64.6 | 3.4 | 0 |
| 6 | 0.943 / 1.7 / 2.7 | 0.04 | 114.5 | 19.2 | 1084 | 0.6 | 64.6 | 3.6 | 0 |
| 7 | 0.926 / 1.6 / 2.5 | 0.04 | 121.3 | 17.9 | 1105 | 0.5 | 64.3 | 3.4 | 0 |
| 8 | 0.747 / 1.5 / 2.4 | 0.03 | 121.5 | 18.9 | 1068 | 0.4 | 64.4 | 3.5 | 0 |
| 9 | 0.769 / 1.4 / 2.2 | 0.04 | 121.5 | 19.1 | 997 | 0.4 | 64.6 | 3.3 | 0 |
| 10 | 0.791 / 1.5 / 2.8 | 0.04 | 132.7 | 17.8 | 1049 | 0.4 | 63.8 | 3.2 | 0 |
| 11 | 0.803 / 1.6 / 2.7 | 0.04 | 112.3 | 17.8 | 1062 | 0.4 | 63.6 | 4.2 | 0 |
| 12 | 0.732 / 1.5 / 6.3 | 0.04 | 112.2 | 18.2 | 1022 | 0.4 | 64 | 3.5 | 0 |
| 13 | 0.588 / 1.3 / 2 | 0.03 | 111.7 | 18.4 | 1048 | 0.3 | 64.1 | 3.2 | 0 |
| 14 | 0.665 / 1.3 / 2 | 0.03 | 111.9 | 18.9 | 1034 | 0.4 | 64 | 3.2 | 0 |
| 15 | 0.825 / 1.5 / 3.8 | 0.04 | 54.3 | 18.9 | 1022 | 0.5 | 64.3 | 3.2 | 0 |

