# Brief: make Club NYC unmistakably New York (Oct 2026 round)

The owner's direction: **stop being generic.** Every place should be a funny, affectionate parody of something real
New Yorkers know (the Starbucks on every corner, the Nike flagship, the LV trunk building on 57th, Saks' holiday
windows, the bodega cat, StreetEasy, Beli…). Funny, playful, worth coming back to. Real brands are parodied, never
copied: no real logos, no real wordmarks, no lookalike monograms.

## Parody names (use these exactly)

| Real thing | In Club NYC | Look & jokes |
|---|---|---|
| Starbucks | **Starducks Coffee** | Green round badge with a friendly crowned **duck** (not a siren). Green aprons, "Mobile Order Pickup" shelf crowded with cups, cups with names written on them **misspelled**. Menu: Pumpkin Spice Duckaccino (it's October), Venti Cold Brew, Frappaduckino. Tagline: "Ducking good coffee." |
| Nike (House of Innovation, Fifth Ave) | **NYKE** | Bold italic wordmark **NYKE** with a curved "swish" underneath (a taxi-yellow swish, not the Nike swoosh shape). Slogan **"JUST DO NY."** Glowing sneaker cubbies, a "NYKE By You" customization bar, a giant sneaker sculpture. |
| Louis Vuitton (the stacked-trunk building on 5th & 57th) | **Louis Vuittown** | Brown + gold monogram trunks. Monogram = interlocked **"LT"** with tiny gold stars and apples (NOT LV, NOT the LV quatrefoil flower). "Maison Vuittown · Fifth Avenue". |
| Saks Fifth Avenue | **Snacks Fifth Avenue** | Elegant limestone department store, black awnings reading SNACKS, famous **holiday windows** full of giant luxury snacks (gold-leaf pretzel, $40 cookie, caviar bagel) beside chic mannequins, a light-show facade. Inside: marble perfume counters, handbag salon, escalators, chandeliers, and "The Snack Hall". Tagline: "Luxury since 1924 (snacks since 1925)." |
| A classic bodega | **Papi's Deli & Grocery** | 24 HRS, ATM inside, hand-written menu board (CHOPPED CHEESE · BACON EGG & CHEESE · HERO · COFFEE), the orange bodega cat **Mango** asleep on the chips, glowing drinks fridges with 99¢ tall cans ("SUNSET TEA 99¢") and **Snappy** iced tea (caps have "Real NYC Facts"), blue Greek coffee cups "WE ARE HAPPY TO SERVE YOU". No lottery, no beer, no cigarettes. |
| TKTS booth + red steps | **TIX** booth under the red steps | Red glass steps for sitting, red booth with a vertical "TIX" sign. |
| StreetEasy | **StreetCheesy** | apartment listings (code only) |
| Beli | **Belly** | restaurant ranking app (code only) |

Existing parodies stay: Halal Bros, 99¢ Slice, THREAD, Golden Dumpling, Boba Bay, I ♥ NY Souvenirs.

## Art: Higgsfield `gpt_image_2_5`

Params: `{"model":"gpt_image_2_5","quality":"high","resolution":"2k","aspect_ratio":"16:9"}` (~2.75 credits each).
Style references (role `image_references`): `f6c93b29-943e-41dd-8584-05dcf7a13583` (CP Town Center — streets and
interiors), `e8390d19-5c42-485b-8a5d-29f985e1514f` (CP Lighthouse/Beach — waterfront), `159aee2a-92a7-412f-bddb-90e707d0ff52`
(CP Cove). Use `generate_image_batch` + `jobs_wait` (no widget).

**New room prompt template**
```
Match the exact art style of the reference images (Club Penguin room backgrounds): 2D vector cartoon game background,
fixed 3/4 elevated camera, thick dark navy outlines, flat cel shading with a single soft shadow tone, chunky rounded
exaggerated shapes, saturated friendly colours, big expressive storefront signage. Ignore any characters, chat bubbles
and UI in the references — draw an EMPTY room with NO people, NO characters, NO UI, no real brand logos.
Scene: <PLACE>, <hero landmark at the back center>, <props left/right that become hotspots, by position>,
<one tiny NYC joke prop>. Open <floor material> filling the lower half of the image for characters to walk on.
Blue arrow signs at the left and right edges (only where the room has street exits). <light>.
```

**Editing an existing room** (keeps the layout, so the traced hotspots mostly survive): upload the current
`app/public/art/raw/<image>.png` (`media_upload` → `curl -X PUT` the bytes → `media_confirm`), pass that media id as the
FIRST `image_references` entry (optionally the style ref second), and phrase the prompt as an edit:
`Edit this image. Keep the exact same camera, layout, floor, objects and art style. Change ONLY: … . Everything else
stays identical.` Then compare old/new side by side — if the edit drifted (moved objects, changed the floor, extra junk),
retry or fall back to a fresh generation.

Saving: the result URL → `app/public/art/raw/<name>.png` (full size) and `app/public/art/rooms/<name>.jpg`
(2000 px wide, JPEG quality 86 — `.venv/bin/python` has Pillow). Use a NEW file name for a new version
(`coffee-v2`, never overwrite the old file). Rooms reference their background via `bg: '<name>'` in
`app/src/data/rooms.ts` and the spec's `"image": "<name>"`.

Check every image before using it: no real logos/wordmarks, no readable gibberish text where it matters, signs spelled
right, open floor in the lower half, nothing cut in half at the edges, the scene makes physical sense (a statue stands
on land, a skyline is the right city).

## Geometry: SAM 2 tracing

Read `tools/MEASURING.md` (spec format, `tools/grid.py`, `tools/cutouts.py`, the overlay QA). Keep object ids that
already exist when the object still exists (code depends on some, e.g. `steamFrom: 'manhole'`). `cutouts.py` takes a
lock, so several agents can call it; it just waits its turn.

## Code conventions

Room entries live in `app/src/data/rooms.ts` (helpers at the top: `vend`, `shop`, `say`, `fact`, `exit`, `soon`,
`look`). Jokes go in `say`/`fact` lines and `chatter`. Shops sell avatar items from `app/src/avatar/items.ts`
(`shop: '<shopId>'`, names/taglines in `SHOPS`). Items are small SVG drawings — copy the style of neighbours.

**Shared files — stay inside your lane:**
- `rooms.ts`: edit ONLY the entries you own; add a new entry directly after one of your own entries.
- `items.ts`: put new items in your own file `app/src/avatar/items-<lane>.ts` (export `const <LANE>_ITEMS: ItemDef[]`)
  and add it to the `ITEMS` array line; edit only your shop's line in `SHOPS`.
- New CSS goes in your own `.css` file imported by your module — don't rewrite `style.css` sections you don't own.
- Don't touch: `game.ts`, `hud.ts`, `engine/*`, `net/*`, `server/*` (except where your task says), other lanes' rooms.
- Typecheck with `cd app && npx tsc --noEmit -p .` before you finish. Dev server: http://localhost:5173 (already
  running; `?profile=<anything>` = offline test slot that skips sign-in). Headless screenshots: `tools/shot.py`,
  `tools/sweep.py <room>` (run from the project root with `.venv/bin/python`).

## Report back

Images made (paths + what changed), object ids / seats / zones / screens per room, new items, anything you couldn't do,
credits used.
