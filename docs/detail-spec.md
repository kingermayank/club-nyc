# Detail spec: Club Penguin's micro-interactions vs Club NYC

How Club Penguin handles hover, motion, chat, the map and news, loading and welcome, measured frame by frame. Each moment is set against what Club NYC does today and what we could change. The goal is not to copy it, but to hit the same level of craft.

**How this was measured (2026-10-17).** I played New Club Penguin, a fan rebuild of the 2013–16 client that plays the original art at the original 760×480 stage. I filmed the game canvas at 50–90 ms per frame at full 1520×960 resolution and laid the frames out as contact sheets. Club NYC was captured headlessly on the private QA stack (localhost:5197) with a fresh offline profile. Related docs:
- [club-penguin-playtest.md](club-penguin-playtest.md): the first-session walkthrough.
- [avatar-redesign.md](avatar-redesign.md): the character work.

---

## 0. The idea in one line

**Club Penguin's hovers change the object itself; Club NYC's hovers highlight it.** A Club Penguin door *opens* when you point at it. A Club NYC door gets a white outline and a pulsing yellow glow. Both say "clickable", but only the first says *what will happen* and makes the world feel alive. Most items below follow from that idea.

---

## 1. Hover states

| Moment | Club Penguin (measured) | Club NYC today | Change |
|---|---|---|---|
| **Doors** | Swapped in **one frame (≤45 ms), no tween**. The Coffee Shop door swings inward and warm yellow light spills out. The Dance Club's grey door slides away to a purple-lit doorway, and its canopy stars get white highlights so they look switched on. The Clothes Shop door opens too. | Every cutout gets the same treatment: a 2.2 px white outline, a yellow glow pulsing over 0.9 s, brightness ×1.1 (`app/src/style.css:45`). A pill label springs in (`style.css:51`). | **Add a hover art state for doors and shopfronts.** Use a second cutout image per hotspot (`hover` image in the room's geo JSON) showing the door ajar with interior light. Swap it in on hover and keep the label. Drop the glow pulse for objects that have a hover image, and keep the glow for plain props. Start with the ~10 most-used doors: Broadway Theater, Souvenirs, Bean There, Slice shop, apartment door, subway stairs. |
| **Map icon (HUD)** | The tilted, folded **MAP** pamphlet swaps instantly to an *unfolded* square map with a red ✕ "you are here". The hover shows what you'll get. | The map button is one of 13 toolbar icons with a generic button hover. | Give the map, newspaper and phone **hover sprites that preview their contents**: the map unfolds, the paper opens to its front page, the phone lights up. |
| **News icon** | **Grey and white at rest, full orange on hover.** The mail icon next to it stays grey until hovered. Idle chrome stays quiet; colour means "you're pointing here". | All toolbar icons are fully coloured at all times. | Try **muted-at-rest** HUD icons (about 60% saturation) that go full colour plus 1.06 scale on hover. The room art then stays the most colourful thing on screen. |
| **Places on the map** | The hovered place gets a **thicker white outline that hugs its silhouette** and a cream label with a dark border. No glow, no motion. | White outline plus a yellow glow, a 2 px lift and 1.03 scale (`style.css:325`). Already close. | Keep it. Optionally drop the yellow glow so the map matches the calmer room hovers. |
| **Edge arrows** | Blue arrow signposts don't change on hover. The walk-off zone itself is the target. | Arrows exist in rooms. | No change needed. |
| **People** | Hover a player: nothing changes until you click (the card opens). | White outline plus glow on the avatar, and a name pill with "★ friend" (`style.css:590`, `world.ts:476`). | Ours is better. Keep it. |
| **Cursor** | The cursor becomes a **crosshair reticle** while aiming a snowball. | Check what `armSnowball` sets. | Add a reticle cursor while aiming, plus a pointing-hand cursor over hotspots (`.pointing` exists; confirm it shows on every hotspot). |

**Spec for the hover image swap** (to add to the room spec in `tools/rooms/<id>.json` → geo JSON):

```json
{ "id": "bean-there-door", "label": "Bean There", "image": "cutouts/times-square/bean-door.png",
  "hover": "cutouts/times-square/bean-door-open.png", "hoverMode": "swap" }
```

`hoverMode: "swap"` swaps the image instantly, the way Club Penguin does. `"glow"` is today's outline and glow. A hotspot without `hover` keeps the glow, so nothing breaks. Generate the open-door art with the existing Higgsfield pipeline: same prompt, with "door ajar, warm light spilling out". Then trace it with `tools/cutouts.py` against the *same* room image so it lines up.

---

## 2. Walking and motion

| | Club Penguin (measured) | Club NYC today (`engine/world.ts:568`, `avatar/render.ts:305`) |
|---|---|---|
| **Speed** | **97 px/s on a 760 px stage**, about 13% of the stage width per second. A full crossing takes about 8 s. Speed is **constant** with no ease-in or ease-out. | 235 px/s on a 1000 px stage (about 23% per second, **~1.8× faster** relative to the screen), scaled by depth (0.4 + 0.6 × depthScale). |
| **Turning** | Faces the new heading on the **first frame** and keeps facing that way after stopping. **8 directions.** | Left/right flip plus a back view. |
| **Gait** | A whole-body **waddle**: the body tilts about ±8° side to side, flippers swing, feet alternate. About 270 ms per step, so one full cycle is about 0.55 s. | Legs swing ±22° and arms ±24° on a sine wave, the torso bobs 2.4 units, the head tilts ±1.5°. Cycle about 0.57 s. Only the limbs move, so the body reads as a stiff post. |
| **Grounding** | Under *your own* penguin: a **pale-blue ring with a grey shadow disc**, so you can always find yourself in a crowd. Others get only a shadow. | A soft shadow ellipse, and your name tag is highlighted yellow. |
| **Size with depth** | **No scaling.** A penguin is the same size everywhere; depth comes from draw order only. | Avatars scale down toward the back (`depthScale`, 0.62 at the horizon). |

**Changes:**
1. **Slow the player to about 160 px/s**, about 16% of the stage per second. It still feels brisk, but a walk across Times Square becomes a moment rather than a blink, and other players can see where you're going. Playtest at 150, 165 and 180.
2. **Add whole-body sway to the walk cycle.** Rotate the root about ±4° in sync with the steps, and bounce the head and torso a little more (about 4 units). Humans can't waddle like penguins, but a light bounce and sway makes avatars read as springy toys instead of puppets on sticks.
3. **Add a "this is me" ring** under the local player: a thin ring in your signature colour that fades out after about 3 s of standing still and returns when you move or when the room has 5+ people.
4. **A smaller depth range.** Try 0.8 instead of 0.62 at the horizon so people at the back stay readable. Avatars at the back of Times Square are currently close to unreadable.

---

## 3. Actions (dance, wave, sit) and emotes

| | Club Penguin | Club NYC |
|---|---|---|
| **Where they live** | Emotes and actions are each a small popup anchored to its own toolbar button. Actions show **penguin pictograms**: dance, wave, sit. | A "Moves" popup with text labels and key hints (`hud.ts:90`). |
| **Dance** | A loop of about 2 s: a hop with flipper waves facing front, a **turn to the back**, then back to the front. It runs until you move. | Dance pose with a rotating root ±7° and arm swings (`render.ts:325`). |
| **Interruptions** | **Sending chat stops the dance**, and so does walking. | Check: dancing while chatting may be fine for us. |
| **Unavailable features** | The puffle button with no puffle opens a dimmed modal: "Adopt a puffle and walk it to perform tricks! [Go to Pet Shop]". The feature explains itself and gives you a route. | Disabled states vary. |

**Changes:**
1. **Pictograms in the Moves menu.** Show a tiny avatar doing each move, rendered with `AvatarView` in your own look, instead of text-only rows. Club Penguin's menus are almost entirely pictures.
2. **Give the dance a turn.** Add a 0.5 s back-view beat into the loop so it reads as a dance and not as flailing.
3. **Every unavailable thing gets a "here's how" modal**, following the puffle pattern. For example, "Get a phone at the Bodega to take group photos [Show me]".

---

## 4. Typing chat

| | Club Penguin (measured) | Club NYC (`engine/actor.ts:88`, `style.css:63`) |
|---|---|---|
| **Input** | A real text field in the toolbar, **48-character limit**, Enter to send. | A text field in the toolbar, Enter to open and Enter to send. |
| **Bubble appears** | About **0.5 s after Enter**, because it waits for the server. | Instantly, with a springy pop from scale 0.4 to 1 over 0.25 s. **Ours is better.** |
| **Bubble look** | A white rounded rectangle with a tail and a **minimum width** (even "hi" gets a wide bubble), small dark text, directly above the head. | A white rounded bubble with a 3 px ink border and a tail, Burbank 15 px, max 220 px wide. |
| **Lifetime** | About **4 s**, then gone **instantly**, with no fade. | 3.6 s with a 0.18 s fade. |
| **Others' messages** | Same bubble. When several people talk, the bubbles overlap a little. | Same, plus a chat log. |

**Changes:**
1. **Scale the lifetime with length:** 2.5 s plus 60 ms per character, between 3 and 7 s. Short hellos clear fast and long sentences stay readable.
2. **Stack your own consecutive bubbles** (the old one slides up and fades) instead of replacing them, so a quick two-line thought reads as two lines.
3. Keep our pop-in; it's nicer than Club Penguin's.

---

## 5. Map, newspaper and other big panels

| | Club Penguin | Club NYC |
|---|---|---|
| **Map open** | Full-stage postcard, Places / Games / Shops / Pets filter tabs, remembers the last tab. Choosing a game **places a yellow arrow in the destination room** pointing at it. | Lovely tilted-map postcard with "You are here" and a "Click where you want to go!" note. No filters and no arrow handoff. |
| **Newspaper** | (On this server it's a link to their blog.) The original was a full-stage paper with Secrets and Upcoming Events. | The Club NYC Times: a full newspaper (`features/newspaper.ts`). |
| **Catalog** | A magazine with page curls, a seasonal cover, a coin tab, and **hover try-on**. | Hover try-on already exists (`features/catalog.ts:63`). |
| **Mail** | A desk scene: postcard, pen, REMOVE stamp, Recycle bin. | None. Notifications are toasts. |

**Changes:**
1. **Map filters plus an arrow handoff.** Add Places / Jobs / Shops tabs. Choosing a job travels to its room and drops a **bouncing yellow arrow** over the entrance (the job lobby door) for about 6 s, or until you reach it.
2. **Use the arrow everywhere a quest says "go to X".** Rosa's "Show me" and first-day quests should all end with that arrow, so it becomes the game's single "go here" signal.
3. **A postcard inbox** for system mail (welcome coins, friend invites, Open House invitations, job paychecks), with a "Go there!" button on invites. It's a calmer home for things that are toasts today.

---

## 6. Loading and transitions

| | Club Penguin | Club NYC |
|---|---|---|
| **Between rooms** | A **themed loading screen** for the destination (a pizza-tossing chef for the Pizza Parlor) with a progress bar. | A quick fade between rooms. |
| **Into games** | A Yes/No modal ("Would you like to play Pizzatron 3000?"), then a title card, then a comic of instructions. | A job lobby with leaderboards. |
| **Out of games** | A themed loader, then a payout card with grey stamps you haven't earned and "Use your coins to…". | A payout card with Play again / Leaderboard / Collect. |

**Changes:**
1. **A themed travel card for each neighbourhood** (subway car, taxi, ferry) shown only when a load takes more than ~300 ms. Fast loads stay instant.
2. **Show your unearned stamps on the payout card**, and add "Use your coins at…" with three buttons (wardrobe, apartment, shop).

---

## 7. Welcome and first spawn

| | Club Penguin | Club NYC today |
|---|---|---|
| **Signup** | One page: a **big penguin inside a ring of ~20 colour dots** (click to recolour it live), then name, password, parent's email, rules, a picture check, then "Create your penguin". | 6 steps: welcome → look → style (blocked until you pick a gift) → name → team → MetroCard. See [avatar-redesign.md](avatar-redesign.md). |
| **First spawn** | A clean, crowded welcome room. **Only the HUD**, no dialogs. A welcome postcard waits quietly in the mail ("we've added 500 coins"). | At once: the New in Town quest list, a "Stamp earned" toast, the daily refill toast, the Dance Jam chip, and Rosa's tour dialog over the centre of the room. |
| **Toolbar** | About 10 icons, plus the map and news as separate corner objects. | 13 buttons plus the chat field. |

**Changes:**
1. **Stagger the first spawn.**
   - **0 s:** only the room, HUD and your avatar doing a little "arrive" hop.
   - **~1.5 s:** Rosa walks in from the edge and *talks in a speech bubble* instead of a modal. Click her to start the tour.
   - **After the tour or the first walk:** the quest list slides in.
   - The stamp and daily-refill toasts move to the postcard inbox.
2. **Arrive with people around.** Spawn new players next to the most populated spot in Times Square, near real players or the busiest group of locals, so the first impression is a crowd, as in Club Penguin's welcome room.

---

## 8. Priority list

| # | Item | Effort | Why first |
|---|---|---|---|
| 1 | Avatar and creator redesign ([avatar-redesign.md](avatar-redesign.md)) | L | Biggest drop-off risk; avatars are on screen every second. |
| 2 | Stagger the first spawn and let Rosa talk in bubbles | S | The first 10 seconds decide whether people stay. |
| 3 | Yellow "go here" arrow used by map filters, quests and Rosa | M | One clear guidance signal across the game. |
| 4 | Door hover art swap for the top ~10 doors | M (art) | The craft detail people notice most. |
| 5 | Walk at ~160 px/s plus body sway, "this is me" ring, smaller depth range | S | Motion feel, readability in crowds. |
| 6 | Muted-at-rest HUD icons and preview hover sprites for map, news, phone | S–M | Calmer HUD; the room is the star. |
| 7 | Moves menu pictograms, dance turn, "here's how" modals | S | Polish. |
| 8 | Bubble lifetime by length plus stacking | S | Polish. |
| 9 | Postcard inbox for system mail | M | Moves toasts out of the way. |
| 10 | Themed travel cards for slow loads | S–M | Delight while waiting. |

---

## 9. Status (2026-10-17): what's built

| Item | Where | Notes |
|---|---|---|
| Calmer first spawn: hop and hello, Rosa after ~2 s; stamp and daily refill wait until after the tour | `game.ts` (creator `done`) | |
| "Go here" arrow (`guideTo(objId)`) | `engine/world.ts`, `.go-arrow` in `style.css` | Stays at least 2.5 s; clears when you arrive, click, leave or after 9 s |
| Map **Places / Jobs** tabs, job badges, arrow after the trip; remembers the last tab | `features/map.ts` (`JOBS`) | Add new jobs to `JOBS` |
| Settle-in hover glow (no endless pulse); warm "lights on" glow and 🚪 label for doors and exits | `style.css` `.cutout.hover(.door)`, `engine/world.ts` `setHover` | Art-swap hovers (door-open images) not done yet |
| Toolbar icons muted at rest, full colour on hover | `style.css` `.tb-btn img` | |
| Walk at 170 px/s (locals ×0.75), body sway and bounce, "this is me" ring, depth floor 0.74 | `engine/world.ts`, `avatar/render.ts`, `style.css` | |
| Bubble lifetime scales with length (3–7 s) | `engine/actor.ts` `say()` | |
| Chunkier limbs, warm skin shading, 2 new skin tones (`SKIN_ORDER` for pickers) | `avatar/render.ts`, `avatar/look.ts`, `features/playerCard.ts` | Server reads the same list; restart it to accept the new tones |
| Creator: gift pre-chosen ("tap to swap"), no dead end; bigger avatar | `features/creator.ts` | The 2-screen redesign is still a proposal ([avatar-redesign.md](avatar-redesign.md)) |
| Payout card: two columns, job stamp (lit, earned, or to get), "Spend your coins" shortcuts | `games/host.ts`, `style.css` | Dev-only `window.payoutPreview(id, score, coins)` for QA |
| Toasts move top-left during lobby, game and payout screens | `style.css` | |

**Built since:**
- Hover previews on the Map, Subway and News buttons.
- Moves menu pictograms (a little you doing each move), and a back-view spin in the dance.
- Themed travel card on slow room loads (`travelCard` in `engine/world.ts`).
- Postcard inbox: the envelope in the top-left HUD (`features/mail.ts`). It holds the welcome, first-paycheck and Dance Jam postcards, and invites have a Go there! button.

**Still open:** door-open hover *art* (a second image per door, which needs new generated art). The warm "lights on" glow stands in for now.
