# Avatar and creator redesign

**Problem (from you, confirmed by playing it):** the avatars don't look good, the creator is confusing, and people may drop off before they ever reach the city.
**Goal:** human avatars with the charm and consistency of Club Penguin's penguin and player card, plus a creator that gets someone into Manhattan in under 45 seconds.

Built on:
- My playtest of Club Penguin's signup ([detail-spec.md §7](detail-spec.md)).
- A survey of 20 avatar creators: Toontown, Mii, Roblox, Animal Crossing, Bitmoji, Stardew, Among Us, Fall Guys, Habbo, Zepeto and others ([avatar-research.md](avatar-research.md), with sources).
- A walk-through of our creator on the QA stack today.

---

## 1. What's wrong today

### The creator (`app/src/features/creator.ts`)
Six steps: **welcome → look → style → name → team → MetroCard**, with a 6-dot progress bar.

| Problem | Evidence | Why it hurts |
|---|---|---|
| Too many steps before any fun | 6 screens; the city is only visible behind a frosted card | Every extra step costs players. One indie team measured 8% then 29% drop-offs at successive onboarding steps. |
| **A silent dead end** | On "Your style", Next does nothing until you pick a welcome gift. The only feedback is a shake and a squawk, with no message (`creator.ts:181`). | People think it's broken. This is the likeliest single drop-off point. |
| It reads like a form | Text-heavy welcome card; rows of small square swatches with tiny headings ("Skin", "Hair", "Hair color", "Top", "Bottoms", "Shoes", "Welcome gift") | Club Penguin's whole signup is one big penguin you click to colour. |
| Hair choices look alike | 9 hair icons at about 28 px, drawn under the same cap, so they differ only in small details | You can't tell what you're choosing. |
| The avatar is small and off to the side | About 140 px tall in a narrow left column, with a tall empty gradient above it | The star of the screen looks like a sidebar. |
| Team choice is a big decision with no context | "Pick your neighborhood": 4 cards of small text before you've seen the city | Asks for commitment before curiosity. |
| The MetroCard reveal is a gate | You must press "Start exploring" on a card screen | A good reward, placed at the wrong moment. |

### The avatar (`app/src/avatar/render.ts`, `look.ts`)
Seen at in-world size (about 55 px tall on the 1000×565 stage) next to Club Penguin:

| Problem | Detail |
|---|---|
| **Stick limbs** | Legs and arms are thin rounded rectangles that swing on a sine wave, so the body reads as a post with sticks. A penguin is one solid shape. |
| **No single colour identity** | The penguin *is* its colour, so you can spot your friend across the room. Our avatars mix 4–6 small coloured areas (cap, hair, top, jeans, shoes) and none dominates. |
| **One navy outline for everything** | `OUTLINE = '#1d2140'` on skin, hair and clothes alike, so small parts turn into dark clutter at 55 px. |
| **Muddy shading on deep skin** | `shade()` multiplies RGB down evenly, so deep tones get greyish shadows instead of warm ones. |
| **Thin inclusive range** | 6 skin tones with uneven spacing (three light, two mid, one deep); 2 of 9 hairstyles are textured (curly, braids). |
| **Faces are fine but small** | Big eyes with highlights and blush read well up close. At 55 px they become a smudge under a cap brim. |
| **Clothing detail is lost** | Shirt logos, laces and patterns are drawn at sizes that disappear in the world. |

---

## 2. Direction: "the penguin, but human"

Club Penguin works because **everyone shares one chunky silhouette and one colour is your identity**. Clothes go on top and always fit. Among Us and Fall Guys use the same idea. For human avatars:

1. **One shared chunky base body**, gender-neutral, about **2.2 heads tall**, with a big rounded head. The torso and legs are one soft **"jellybean" shape** (a short body flowing into stubby legs) with mitten hands and rounded sneakers. Limbs are thick and soft, never sticks. Everyone has the same outline, so every item fits everyone.
2. **A signature colour is your penguin colour.** Pick one of about 14 named NYC colours (Taxi Yellow, Subway Green, Brooklyn Brick, Liberty Teal, Hydrant Red, Pretzel Brown, Bodega Blue, Lox Pink, Midnight, Pigeon Grey, Pizza Orange, Broadway Purple, Snow White, Bagel Gold). It always fills **the biggest area**: the hoodie or jacket by default, which takes over half the body. Starter clothes are cut to show it. From across Times Square, you're "the Subway Green one".
3. **Hair is the second identity: the silhouette.** About 12 styles that differ by **outline**, not texture lines. At least 5 are textured: afro puff, coils, box braids, locs, twists, high-top fade. Each has a hat-compatible variant so caps don't clip.
4. **Simple faces:** two tall oval eyes with one highlight, a small mouth, optional blush, no nose. Emotes swap the whole face (happy, wink, surprised, sleepy).
5. **Colour-matched outlines:** 2 px at 1×, a darker shade of the fill in each region (not one navy line), with a slightly heavier outer silhouette line so the figure separates from busy backgrounds.
6. **Fixed palettes with hand-picked 3-step ramps** (base, shadow, highlight). Skin is **10 tones evenly spaced** in lightness with **warm, saturated shadows**. No free RGB anywhere.
7. **A clear scale rule:** the head stays wide enough to read at the smallest in-world size. Smaller depth range (0.8 at the horizon, [detail-spec §2](detail-spec.md)) so avatars never shrink below about 48 px.
8. **More bounce.** A walk with a little body sway and squash, a 2-frame idle breathe, and a hop on arrival.

Moodboard words: *soft vinyl toy, chunky, sticker-outline, one bold colour, big friendly head.*

---

## 3. New creator flow: 2 screens, about 40 seconds

### Screen 1: "Who's walking into Manhattan?"
```
┌───────────────────────────────────────────────────────────┐
│  CLUB NYC              Who's walking into Manhattan?      │
│                                                           │
│   [look][look][look][look]   ←  8 ready-made looks         │
│   [look][look][look][look]      (diverse skin & hair)      │
│                                                           │
│           ╭──────────╮        🎲  Surprise me              │
│           │  BIG     │                                    │
│           │  LIVE    │        Skin   ● ● ● ● ● ● ● ● ● ●  │
│           │  AVATAR  │        Hair   ◐ ◑ ◒ ◓ ◔ ◕ … (shapes)│
│           │ (reacts) │        Colour ● ● ● ● ● ● ● … (NYC) │
│           ╰──────────╯                                    │
│        on a Times Square kerb    You can change all of     │
│                                  this later at any mirror. │
│                                         [ That's me → ]   │
└───────────────────────────────────────────────────────────┘
```
- **The avatar is the hero:** centred, about 2.5× today's size, standing on a little kerb against the real Times Square art, with an idle bounce. **Every change gets a reaction**: a hop with a sparkle on the changed part, a happy face for a second (Toontown and Memoji).
- **Start from a look:** 8 complete, coordinated looks across skin tones and hair textures (Mii look-alikes, Roblox presets). One tap applies a whole look, and many people will stop there.
- **🎲 Surprise me** rerolls a *curated* coordinated look (never an ugly mix).
- **Three tweak rows**, each shown as a real choice:
  - **Skin:** 10 tones, as round dots.
  - **Hair:** shape icons drawn as silhouettes; hair colour opens on long-press or a second row.
  - **Colour:** the signature colour, as large named swatches with the name on hover ("Subway Green").
- **The colour ring idea from Club Penguin:** on wide screens the Colour row can be a ring of dots around the avatar, the way New Club Penguin's signup does it.
- **No gates.** "That's me →" is always enabled, because a look is always selected.
- **The age check moves to screen 2**, next to the name, where it belongs with account stuff.

### Screen 2: "What do New Yorkers call you?"
- **A three-part pre-approved name picker** (Toontown, Wizard101), with each part a scrolling wheel or chip row plus 🎲:
  - Titles: Captain, Lil, Big, Doc, Chef, DJ…
  - First names: Ziggy, Lulu, Mo, Rosa, Tito…
  - Last names built from two halves: Bagel + stoop, Pretzel + wagon, Pigeon + feather…
  - Examples: "DJ Lulu Pretzelwagon", "Chef Mo Bagelstoop". They're funny, safe, and need no moderation queue.
- **"Type my own"** keeps today's checked input, 2–14 characters, with live availability (`checkName`). Online, a typed name that needs review shows as an automatic name until approved (our version of Club Penguin's `P12345`).
- The **13+ checkbox and rules link** go here.
- **[ Walk into the city → ]** spawns you straight into Times Square.

### What moves out of the creator
| Today's step | Where it goes |
|---|---|
| Welcome copy | Becomes the screen 1 headline plus one line. The bullet list goes. |
| Starter outfit plus welcome gift | **First quest, about 30 s in:** a street vendor near spawn waves you over and gives you a free hat; you equip it on your player card. It teaches walking, NPCs and the card in one go. Starter clothes come with the chosen look. |
| Neighborhood team | **Asked in the world** the first time you finish a job ("Which neighborhood are you repping?"), or auto-picked from your first job, changeable once. |
| MetroCard reveal | **Flips in at the corner of the screen 2 s after spawn**, then lives as your player card: the "card" Club Penguin made iconic. Save-as-PNG moves to the card. |

### Measure it
Log events: `creator_open`, `look_preset`, `look_shuffle`, `look_tweak:<row>`, `name_wheel`, `name_typed`, `creator_done`, `first_walk`, plus time to spawn. Targets: **≥90% of creator_open reach spawn; median under 45 s.** Log the same events on the current creator first, to get a baseline.

---

## 4. Player card (keep and grow)

Club Penguin's card is loved because it is **your avatar, big, on a background you chose**, with your badge and the things you wear. Ours already exists (`features/playerCard.ts`). With the new avatar:
- **The background is an item slot** (Club Penguin's 60-coin backgrounds). NYC backdrops: a Brooklyn Bridge sunset, a subway tile wall, a pizza shop counter.
- **The MetroCard frame wraps the card** (member number, team badge, "since Oct 2026"), so the reveal and the card are the same object.
- **Click any worn item on the card to take it off**, and drag from the inventory onto the avatar.

---

## 5. How we'd build it

| Phase | What | Notes |
|---|---|---|
| **0. Concept art** (1 day) | Generate 6–8 concept sheets of the new base body with Higgsfield, using the art-pipeline template and the CP references: front, side and back views, 3 skin tones, 3 hairstyles, 3 signature colours. Pick one direction with you. | About 2.75 credits per image, roughly 30 credits in all. **Needs your OK on budget.** |
| **1. New base body** | Redraw the body in `avatar/render.ts`: the jellybean torso and legs, thick mitten arms, a bigger head. Region-coloured outlines; palette ramps in `look.ts`; 10 skin tones with warm shadow ramps; signature colour added to `Look`. | Keep the SVG paper-doll approach. It already supports per-region colour and animation. |
| **2. Hair set** | 12 silhouettes (5+ textured), each with a back layer, a front layer and an under-hat variant. | Test each as a black silhouette at 50% scale. |
| **3. Re-fit items** | The ~100 items across 7 slots must fit the new body. Tops become signature-colour-aware: the hoodie or jacket takes `look.color`. | The biggest chunk of work. Start with starter clothes and shop staples; flag the rest. |
| **4. Motion** | Walk sway and squash, idle breathe, arrival hop, reactions in the creator. Optionally a front-3/4 view as well as side and back. | `render.ts` poses. |
| **5. New creator** | Rewrite `features/creator.ts` as the 2-screen flow; add the name wheels; move gift, team and card into the world (vendor quest, team prompt, card flip). | Keep `CreatorOpts` (checkName / claim / memberNo) as is. |
| **6. Migration** | Map old looks to new ones: skin index to the nearest new tone, hair to its nearest silhouette, signature colour from the current top's colour. | Saves and the server wallet stay valid; items keep their IDs. |
| **7. QA** | A headless creator test (time to spawn, no dead ends); render every item on 3 skin tones and 3 hairstyles at in-world size against real backdrops (contact sheet via `tools/sheet.py`). | |

**Open questions for you:**
1. Is "signature colour = your identity" the right core idea? The alternative is to let clothing do all the work, as today.
2. Should we spend about 30 Higgsfield credits on concept sheets before redrawing, or go straight to SVG?
3. Should the team pick move out of the creator entirely, into the first job?
4. Should the three-part name picker be the default, with "type my own" as the secondary option?

---

## 6. Status (2026-10-17): built in SVG

| Piece | What shipped | Where |
|---|---|---|
| Signature colour | 14 named NYC colours (`SIG_COLORS`), `Look.color`, accepted by the server (`validLook`) and the wire type | `avatar/look.ts`, `server/src/game/rules.ts`, `net/protocol.ts` |
| Signature Hoodie | Free starter top (`sig-hoodie`, `top.signature`) that wears your colour; the default for every preset | `avatar/items.ts`, `avatar/render.ts` |
| Chunkier base body | Head drawn 14% bigger from the neck (hats, glasses and hair scale with it, so every item still fits); fuller torso; thicker limbs; warm skin shading; 8 skin tones | `avatar/render.ts` (`HEAD_SCALE`) |
| Hair | 14 styles, 6 textured: afro, puffs, locs, twists, high-top fade, braids (plus curly); each has back, front and under-hat versions | `avatar/render.ts` `hair()` |
| Creator, screen 1 | "Who's walking into Manhattan?": 8 ready-made looks, Surprise me (curated reroll), skin / hair / hair colour rows, **a colour ring around the avatar** (Club Penguin's signup idea), sparkle and hop on every change | `features/creator.ts` |
| Creator, screen 2 | "What do New Yorkers call you?": two-wheel NYC name picker (every pair fits 14 characters) or type your own with live availability, 13+ box, "Walk into the city" | `features/creator.ts` |
| Moved into the world | Team pick → after your first job (or next visit); MetroCard → flips in at the corner after the tour (click to save the PNG); outfit and gift → come with the look | `game.ts`, `games/host.ts`, `features/creator.ts` `flipMetroCard` |
| Player card | "Edit look" has the colour row too | `features/playerCard.ts` |
| Tests | `tools/mp_test.py`, `tools/launch_test.py` and `tools/tour_test.py` drive the new 2-screen creator | |

**Since then (also built):**
- Colour-matched outlines: each region uses a deep shade of its own fill (`ink()` in `avatar/items.ts`); facial features stay navy.
- Colour Cap, Colour Beanie (I ♥ NY), Colour Tee and Colour Puffer (THREAD) wear your signature colour. Catalog and wardrobe icons show them in your colour.
- Welcome gift: Sal's hot dog cart in Times Square offers one free welcome gift. A "Pick up your welcome gift" quest with Show me and the arrow leads there. The server allows exactly one.
- Creator funnel: anonymous per-session events (`net/events.ts` → `POST /api/events`, `events` table) feed a "New Yorker creator · last 7 days" card in `/admin.html` with step counts, finish rate and median seconds.

**Still open:** 4-direction walk sprites. The current side and back views with flipping cover it; a true front-3/4 walk would mean redrawing every item.
