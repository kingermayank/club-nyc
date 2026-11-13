# City Sim: persona agents playtest Club NYC

A private city plus one headless browser per persona, driven by AI agents that role-play specific people
(docs/research/agent-playtest/personas) and write field journals and reports. First run: 2026-11-11, five personas.

## Files

| File | What it is |
|---|---|
| `citysim.py` | The harness: a frozen private stack (game server + Vite, throwaway database), Chromium with a 1280×720 context per agent, and a JSON control API on `127.0.0.1:8777` |
| `observe.js` | Runs in each page and describes the screen: room, people, world hotspots with click points, buttons/inputs, map landmarks, subway stations, panel text, chat, sounds. Hot-reloads while a run is going |
| `city.py`, `play` | The agents' controller (`tools/sim/play <agent> <command>`; `play` works from any folder) |
| `summarize.py` | Rolls a run up into `summary.json`: actions, rooms and minutes per room, coins, chat transcript, friendships, job runs, matches, ledger, XP, client errors |

## Run it

```bash
TMPDIR=/tmp/cnyc-sim/ .venv/bin/python tools/sim/citysim.py --blind --agents millie,jiwoo,gabi --soft 80 --hard 120 \
  --journals docs/research/agent-playtest/round2/journals
```

`--blind` is the mode to use for user research (round 2): players get no list of clickable things, icon buttons stay
unnamed until hovered, console errors go to `<run>/<agent>/errors.log` instead of the player, `leave <why>` closes
the tab and logs the reason, and sessions end after `--hard` active actions (looking is free). Add players to a
running city with `curl -X POST 127.0.0.1:8777/add -d '{"agents":["name"]}'` (rolling admission keeps about six
strangers online). Only port 8777 writes `current.json`; a side city on another port can't take over the players'
controller (that happened once and cut three sessions short). The harness snapshots its database every 3 minutes
and on shutdown.

Then spawn one agent per player with `docs/research/agent-playtest/round2/BRIEF.md` and that player's card from
`round2/panel.md` (cards only: no game knowledge, no missions). Stop with `curl -X POST http://127.0.0.1:8777/shutdown`,
then `.venv/bin/python tools/sim/summarize.py` (exit reasons, rooms, chat, jobs, matches) and `tools/sim/backlog.py`
(merges the design audits).

## How agents see and act

- Every command answers with a text description of the screen and saves a 960×540 screenshot; agents read the
  image when they need to see. All coordinates are in that 960×540 picture (the harness scales them to the real
  1280×720 window).
- Refs: `h:<id>` world objects, `p:<Name>` people, `c<N>` controls, `m:<id>` map landmarks, `s:<N>` subway stations.
- Sounds can't be heard, so the harness hooks `clubNyc.api.sfx` and lists the effects that fired.
- **Step mode** (`step on`) freezes a page between actions: the Playwright fake clock pauses JS timers and
  `requestAnimationFrame`, and CDP `Animation.setPlaybackRate(0)` pauses CSS animations (Slice Factory's conveyor is
  CSS). Each action then runs the page for 400 ms of real time. Drags run in real time, because games sample the
  pointer every frame. Python's clock API takes seconds, not milliseconds (a bare `Date.now()` jumps to year 58,000).
- Outside requests are blocked; only the private city's host is reachable.

## Gotchas found while building it

- Full-screen scenes (sign-in, consent, creator, arrival, tour) mount on `.stage`, not in `.overlay`.
- The MetroCard you stamp uses `cursor: none` (a custom stamp cursor), so clickables are found by cursor *or* a
  script `onclick`/`onpointerdown` handler.
- Map landmarks are image cutouts hit-tested by alpha, and subway stations are SVG groups with click listeners;
  both get their own lists.
- The chat log is closed most of the time, so its lines are read raw (not "visible" text).
