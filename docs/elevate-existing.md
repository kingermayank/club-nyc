# Elevate What Exists
*Research pass · November 12, 2026*

**Thesis:** Club NYC’s biggest fun gains are not new rooms or new jobs. They are unfinished promises — places that already have art, stamps, and copy, but still open a modal or play a one-line emote.

---

## The Pattern

| Layer | Feels like | Examples |
|---|---|---|
| **Deep** | A committed multi-beat moment | 5 jobs, Broadway show, photo booth, Dance Jam, flash mob, Climb the Crown |
| **Half-built** | Systems exist; payoff fails | **Rockefeller rink**, rowboat, carriage, ring toss |
| **Shallow** | Modal + 1–2 buttons → emote + line | Do a Spin (before), Salute Flags, Wave at Box, many “Take a Photo” cards |
| **Coming soon** | Honest, but dead ends | Brooklyn, Harlem, Met galleries |

**Rule of thumb:** If the help page says you can do it, and the code has a pose/stamp/geo for it, finish that loop before inventing a new mini-game.

---

## Audit: Rockefeller Rink (worked first)

### What players saw
- Click rink → info modal with cropped plaza art
- **Skate a Lap** → avatar walked the *plaza rim* (or seemed to do nothing)
- **Do a Spin** → dance emote in place
- **Rink Rat** stamp almost unreachable

### Root cause (measured)
- `geo.ice` exists and drives skate pose + speed in `world.ts`
- Plaza `walk` mesh and `ice` had **zero overlap**
- ~40px void at the front gate between walk and ice
- `skateLap()` path points snapped off-ice via `nav.nearest()`
- Result: lap never set `player.skating`, never used skate pose

### Elevation shipped (this PR)
1. **Ice is walkable** — `NavGrid` accepts extra polygons; Rockefeller passes `ice` + a gate `bridges` poly
2. **Free skate works** — click open ice → glide with skate pose / speed; stamp can fire
3. **Skate a Lap** is a held in-world ritual (HUD + Step Off), enters via gate, mid-lap spin/wobble, finish cheer + confetti
4. **Do a Spin** walks onto ice first; sneakers sit-spin; skates show off
5. **Locals use the ice** — Rockefeller NPCs often path across the rink so it feels busy
6. Card copy shortened; rental booth offers lap + spin

**Not done (later, still elevate-not-add):** timed “Rink Rush” pickup game, couples skate, seasonal tree event — only after the ice loop feels great.

---

## Ranked elevation backlog (reuse existing places)

| Rank | Experience | Today | Elevate to | Effort |
|---|---|---|---|---|
| 1 | **Rockefeller rink** | Broken / modal | In-world skate + lap ritual | Done (this PR) |
| 2 | **Central Park rowboat** | Paid emoji splash card (~3s) | In-world boat path on the lake, duck jokes, stamp | Med |
| 3 | **Carriage ride** | Same shallow scene-card pattern | Clip-clop path through park + photo moment | Med |
| 4 | **Battery Park ring toss** | Emote + line | Aim mini-moment (power meter) or harbor target | Low–med |
| 5 | **Prometheus / flags** | Emote cards beside the rink | Tie into rink ritual (pose after lap, tourist photo) | Low |
| 6 | **Ferry passenger** | Scene card then room change | Deck walk / wave at Liberty before arrival | Med |
| 7 | **Bow Bridge propose** | Kneel + hearts | Photo strip / shared pose / stamp | Low–med |
| 8 | **On Air TV studio** | Wave + overlay + stamp | Short “segment” prompts (“Say hi Mom”) | Low–med |

**Jobs (already deep):** polish loops (leaderboards visibility, job-hopping) rather than adding job #6 first.

---

## Design checklist for the next elevation

When touching a shallow hotspot:

1. **Can the player do it in the room?** Prefer walk/glide/climb over a full-screen card.
2. **Is there already a pose, stamp, or geo?** Wire those before new art.
3. **Does the button match the result?** If it says skate, `skating` must become true.
4. **Hold the moment** (`hold()`, progress HUD) so clicks don’t cancel silently.
5. **Pay off** with stamp, confetti, or a joke line — not only a toast.
6. **Keep the card as a menu**, not the experience.

---

## Files touched for the rink elevation

- `app/src/geometry.ts` — `NavGrid` extras
- `app/src/engine/world.ts` — ice/bridges into nav; NPC ice paths
- `app/src/data/geo/rockefeller.json` + `tools/rooms/rockefeller.json` — gate bridge
- `app/src/data/geo.ts` — `bridges` field
- `app/src/features/roomfun.ts` + `.css` — `skateLap` / `skateSpin`
- `app/src/data/rooms.ts` — rink / rental actions + copy
- `app/help/content/places/rockefeller-center.md` — skating section
