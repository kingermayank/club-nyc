# Parks, water and downtown: from cards to moments

Round 2 design pass, 2026-11-11. District: `central-park`, `the-met`, `high-line`, `chelsea-market`,
`brooklyn-bridge`, `battery-park`, `liberty-island`, `wall-street`, `one-world-trade`, `sky-deck`, plus the ferry
and the binocular views.

**How I checked.** Read every room entry in `app/src/data/rooms.ts` and the modules they call (`roomfun.ts`,
`extras.ts`, `downtown.ts`, `souvenirs.ts`, `binoculars.ts`, `infocard.ts`, `features/moments/*`), the geo JSONs
(to find traced things with no object), the room art, and the round 2 playtest journals. Then I ran the dev build
headless on an offline `?profile=` slot, opened each built moment with `playMoment()`, and clicked through the
cards, the ferry ride, the crown climb, the elevator and the memorial rose.

**Reading the tables.** "Today" is the current working copy (uncommitted edits included). Words in quotes are
proposed in-game copy. Effort: **S** about a day (one moment file or room hook, one line in `rooms.ts`); **M** a
few days (new mechanics, a little art or light server work); **L** a week or more (new room art, a shared room,
new persistence).

## The district today

About 80 clickable things across ten rooms. Roughly half open the same picture card (photo left, history right, a
pigeon's joke, a button or two). Six real moments are already built for this district in `features/moments/`
(rowboat, squirrel, love locks, life ring, opening bell, Washington's pose) but only the Bull is wired; the other
five landmarks still open their old card or a 3-second emoji card. Three things are traced in the art but click
through to nothing: the Met's doors, the Met's right arrow, the bridge's right arrow. The things that are alive and
work: the Bull, the One World Trade elevator, the subway stairs (they lead into the turnstile swipe), the Sky Deck
photo booth, Ferry Captain, the Citi Bike Dash, BullMarketBrad and the Wall Street ticker.

What round 2 players said here:

- Lukas, at the Met: "Clicking the Met's door just opens my own player card." He left: "the Big Board is fake, the Met has no inside."
- Darnell left from the Brooklyn Bridge: "no brooklyn ... nothing to actually play yet."
- Gabi, at the Liberty viewer: "just a picture to move mouse over." She also skipped the "July IV, MDCCLXXVI" label.
- Maya left the Met "not sure what to actually do besides walk around."
- Angie, at the memorial: "respectful, no jokes. That got me." (Keep it that way.)
- In round 1, another player's tip, "free Staten Island Ferry at sunset", was the best thing Gabi learned all session.

## Do first (not ranked: these are fixes, not ideas)

1. **Wire the six built moments** in `rooms.ts` with the existing `mo()` helper: rowboat (Rowboat and the Boathouse's
   "Rent a Rowboat"), squirrel (both squirrels and "Share with a Squirrel"), `loveLocks` (plus `paintLocks` on room
   enter), `tossTheRing` (Life Ring), `ringTheBell` (the Exchange), `strikeThePose` (Washington). Add their 18 stamps
   to `data/stamps.ts`: until then `g.stamp()` silently drops `row-lake`, `row-clean`, `duck-bowling`,
   `squirrel-friend`, `steady-hand`, `park-mugging`, `love-lock`, `locksmith`, `tugboat-key`, `ring-toss`,
   `ring-liberty`, `harbor-hero`, `opening-bell`, `clean-open`, `on-the-dot`, `oath`, `spitting-image`,
   `touchdown-george`.
2. **Kill the dead clicks:** the Met `doors` and `exit-right`, the bridge `exit-right` (designs below).
3. **Big Board vs its docs:** the committed build had "SLICE Goes Up / Down" buttons, this working copy removed them,
   and `app/help/content/places/wall-street.md` still says "Call the market". `docs/landmark-moments.md` calls it
   "already a call-the-market toy". Pick one (design below).
4. **Quiet the memorial:** the pool card awards Never Forget the moment it opens, with the normal chime, a "+25 XP"
   pop and possibly the 5-stamp coin bonus. Make that one stamp silent. Drop the two jokes on the plaza (tower card,
   coffee cart); they sit a few steps from the pools.

## Central Park

| Object or moment | Today | Alive version | Why it's fun | NYC truth | Social hook | Effort | Reuses |
|---|---|---|---|---|---|---|---|
| Ducks (3 on the Lake) | Click a duck: a quack and one line ("Quack yourself."). Nothing moves. | 1) Click a duck: a 1-coin paper bag of duck pellets appears in your hand (offer your pretzel instead and a little "Please don't feed the wildlife" sign pops up on the shore). 2) Click the water to toss a pinch: plinks and rings. 3) The painted ducks paddle to the plinks; the big mallard shoulders in first. 4) The small duck only comes if you toss away from the mallard: lead it. 5) Feed it three times and it follows your side of the lake and quacks when you arrive, all day. | Verb: toss and herd. Feedback: plinks, ripples, a pecking order. Payoff: a duck that knows you; "Duck Diplomat" stamp. | Park signs ask you not to feed the wildlife (bread is junk food for ducks). Everyone still brings a bag. | Two players tossing pull the ducks back and forth: a polite duck tug-of-war. | M | `rowboat.ts` lake polygon and duck motion, `cutoutImg('duck-1..3')`, kit `openMoment`, `sfx.quack` |
| Bow Bridge | Picture card (1862, cast iron) with "Pop the Question" (kneel, confetti, a line to the bridge) and "Take a Photo" (flash, cheer, a line). | 1) Click the bridge: your New Yorker walks to the lake edge and drops to one knee. 2) A proposal photographer rises out of the shrubs and counts down on his fingers. 3) Click when a duck glides into frame for the lucky shot. 4) Flash: a postcard of you, the bridge and the duck. 5) A friend within a few steps is framed too and answers with one of two icons (thumbs up, laughing); it becomes a sticker on the shared photo ("Best friends since today"). Nearby locals clap. | Verb: kneel, time the shot. Feedback: the hidden photographer, the clap. Payoff: a photo worth sending. | Bow Bridge is one of the city's top proposal spots, and hired photographers really do hide in the bushes. | Two-player photo; anyone nearby is squeezed in and claps. | M | `roomfun.kneel`, `flash()`, the photo booth's SVG to PNG pipeline (one frame), an `Actor` photographer, `sendPostcard` |
| Park benches (2) | Sit. Nothing else. | 1) Sit; after three seconds a small brass plaque on the backrest glints. 2) Click it to read one line ("For Pat, who knew every squirrel." "Sit. You walked here." "In memory of a perfect bagel."). 3) Once a day, adopt the bench: build a line from three rows of word chips (who, why, sign-off); a press stamps it into brass. 4) Your plaque stays on that bench for a week for everyone; a friend who sits there gets "You're on AuditAl's bench." | Verb: read, then engrave. Feedback: the glint, the stamp-press thunk. Payoff: a story per bench and a trace you leave. | Central Park's Adopt-a-Bench plaques: thousands of engraved dedications, and reading them is a real way to spend an afternoon. | Strangers read plaques players wrote; friends find your bench. | S (seeded), M (player plaques) | seats and `sitPlayer`, preset chips like the phone's `TEXT_KINDS` (no free text), a guestbook-style endpoint, `toast` |
| Horse carriage | A 4-coin confirm, then a 2.8 s emoji card ("clip-clop... clip-clop...") over a dimmed room, a line and the Clip-Clop stamp. You never move. | 1) Click the carriage: climb into the red seat. 2) It really rolls: down the left path, past the lamp, around the lawn and back, the horse's head bobbing. 3) Press W to wave at people on the path; players and locals wave back. 4) Biscuit stops dead for a squirrel crossing; you wait. 5) Back at the curb: "Same time next year." A friend who clicks within 5 s takes the second seat. | Verb: ride, wave. Feedback: the room going by, the squirrel standoff. Payoff: a real lap, the stamp, a seat for two. | Carriages wait at the park's south end and loop the drives; the horses have the right of way and act like it. | Two seats; waving at everyone you pass. | M | the `carriage` cutout as a moving sprite, path walking from `roomfun.skateLap`, `sitPlayer`, emote wave; replaces `extras.carriageRide` |
| NEW: the chess hustler | Nothing; the left bench is just a bench. | 1) A stone chess table and clock appear by the left bench, with a local: "Five minutes. Free for you." 2) Sit: a small board slides up with a mate-in-one. 3) Click a piece, click a square. His clock ticks, but running out only gets "Again?" and a new puzzle. 4) Three in a row: he slaps the clock, "Okay. Okay." Stamp. 5) On a two-streak, locals drift over and stand behind you to watch. | Verb: find the move. Feedback: the clock, the trash talk, the crowd forming. Payoff: beating the guy who's "had this table since 1987." | Speed-chess hustlers are a park institution (Washington Square, Union Square, and Central Park's own Chess and Checkers House). | A crowd gathers on streaks; later, two players can take the table against each other. | M | an SVG prop placed like the `mp/spots.ts` signs, an `Actor` local like `spawnBrad`, seats, kit, `chatterOk` |

**Already alive.** *Rowboats:* built in `moments/rowboat.ts` (alternate oars, under Bow Bridge and back, ducks to
dodge, a best time), not wired: both the Rowboat and the Boathouse still open the 3-second emoji card. Headless, it
opened, took 3 coins and rowed on Left/Right. Polish: hide the painted boat at the dock while you're out, put your
own avatar in the seat (today it's a tiny head and you stay on the lawn), and charge on push-off rather than before.
*Squirrels:* built in `moments/squirrel.ts` (hold the pretzel out, let go when it dashes), not wired; the squirrels
still run the old instant snack theft. Opens fine headless.
**Fold.** Boathouse: drop its four-button card; the window becomes a cart counter (cocoa: blow before you sip) and
the dock starts the rowboat. Exits are fine.

## The Met

| Object or moment | Today | Alive version | Why it's fun | NYC truth | Social hook | Effort | Reuses |
|---|---|---|---|---|---|---|---|
| The doors (traced, dead) | Traced in the geo but never wired: clicks fall through. A playtester got his own player card and no museum. | 1) Click the doors: you climb the steps and the center door opens a crack. 2) A guard's hand holds out today's sticker (its color follows the New York date). 3) Peel it (drag the corner) and press it onto your jacket; it stays all day. 4) "Galleries open soon." The door shuts. 5) Collect seven colors on any seven days (no streak) for a stamp. | Verb: peel and stick. Feedback: the peel, the pat on the chest. Payoff: a daily wearable that says you went. | For decades the Met's admission was a little tin button that changed color daily (stickers since 2013). New Yorkers kept jars of them. | Everyone who went today wears the same color: you can spot fellow museumgoers anywhere in the city. | S | the `doors` cutout, a neck-slot badge in `avatar/items.ts`, `g.give`/`g.wear`, `nycDay()` from kit |
| The steps | Sit, and the Meet Me on the Steps stamp. | 1) Click the top step's center: a red carpet rolls down the stairs, velvet ropes pop up, local photographers line both sides. 2) Walk the carpet; each photographer flashes a pose icon (wave, cheer, dance, jump). 3) Hit it (W, C, D, J) before the flash: a bigger flash, more heads turn. 4) At the top, a magazine cover of your outfit ("BEST DRESSED") goes to your mail. 5) On the first Monday in May the carpet stays out all day with extra photographers. | Verb: pose on cue. Feedback: flashes, crowd noise. Payoff: a cover of your look and a reason to dress up. | The Met Gala turns these steps into one of the most photographed carpets anywhere; the rest of the year they're for sitting with a hot dog. | Up to six walk at once; photographers turn to whoever matches best; the steps cheer. | M | `flash()`, emote poses and their relay, `avatarPortrait` and the photo booth PNG, `sendPostcard`, NPC locals |
| The banners | Picture card ("Hot Dogs Through the Ages" joke) with "Take a Photo". | 1) Click a banner: it rolls up and a new one unrolls with your New Yorker in poster style, titled from your outfit ("AuditAl: The Denim Years"). 2) Locals on the steps stop and look up: "Bold use of beige." 3) It hangs for a minute; a postcard of it lands in your mail. | Verb: unveil. Feedback: the roll, the crowd. Payoff: your face on the Met for a minute. | The banners announce the big shows; New Yorkers judge the season by them. | With a room fx relay everyone on the steps sees your show; friends can "visit" it. | S (you), M (shared) | `extras.onAir` (a portrait fitted over a cutout), the `banners` cutout, NPC say, `sendPostcard` |
| Taxi | A honk and "TAXI!", then the map opens 0.65 s later: a teleport with a sound. | 1) Stand at the curb and hold your arm up (hold T or the mouse). 2) Cabs roll by: roof light dark, they're taken and don't stop. 3) A lit one slows; drop your arm too early and it drives on. 4) Hop in: the meter ticks and the back-seat screen blares; find its off button (it moves). 5) Pick a place on the map; the cab pulls up at that curb. | Verb: hail, then hunt the off button. Feedback: near-misses, the meter. Payoff: an arrival, and the "Off Button" stamp. | A lit roof number means the cab is free; every passenger's first move is jabbing the back-seat TV off. | A friend at the curb within 5 s shares the cab. | M | the `taxi` cutout, `g.openMap`, `sfx.honk`, kit hold input, the in-car framing from `subway.ts` |

**Already alive.** Nothing yet. **Flags.** The right arrow sign is traced (`exit-right`) but goes nowhere: wire it or
paint it out. The fountains run the same 1-coin wish dialog as Chelsea Market; fine to leave for now.

## The High Line

| Object or moment | Today | Alive version | Why it's fun | NYC truth | Social hook | Effort | Reuses |
|---|---|---|---|---|---|---|---|
| Water tower | Picture card (why tanks exist) and a joke; "Got It" is the only button. | 1) Click the tank: the brick building's lower six floors light up, the top floors stay dark. 2) Grab the pump handle on the roof and pump (drag down, up, down). 3) A water line climbs the tank; the wood darkens as it fills. 4) The top floors light window by window; at the top, a shower window starts singing (a music-note bubble). 5) Full: an overflow splash, "Water Pressure" stamp. | Verb: pump. Feedback: the rising line, windows lighting. Payoff: the shower singer. | City pressure only lifts water about six floors; taller buildings keep a rooftop tank, many still wooden, built by a few family firms. | Two people pumping fill it twice as fast, and the singer goes for a duet. | S | the `water-tower` cutout, kit (`openMoment`, `shout`, `sparks`), CSS window overlays |
| Gelato cart | One click: 3 coins, a cone in your hand, a line. | 1) Click: the case slides open; tap two tubs. 2) The scoops stack on a cone in your hand. 3) For ten seconds drips run down the cone: click each before it reaches your hand. 4) Clean cone: "No Drips" stamp. Miss one and a pigeon gets the last bite. 5) The cart's chalkboard shows today's most-ordered combo across the city. "Gelato in November. Bold." | Verb: lick (click). Feedback: drips racing your clicks. Payoff: a stamp and a board everyone shapes. | High Line gelato melts faster than you can find a napkin. | The chalkboard combo is everyone's orders today. | S (cone), M (shared board) | `vend('gelato')`, kit, the cart's own chalkboard art, a small server counter |

**Already alive.** The Citi Bike Dash signpost (`mp/spots.ts`, a multiplayer race; not replayed in this pass). The
river view is a binocular (see Binocular views). **Leave.** Loungers and bench (sitting works; later, drag a lounger
along its old rail before you sit), the stairs (see the stair note under Across the district).

## Chelsea Market

| Object or moment | Today | Alive version | Why it's fun | NYC truth | Social hook | Effort | Reuses |
|---|---|---|---|---|---|---|---|
| Taco Loco | Click: 3 coins and a line. No taco in hand, and it never counts toward Belly Full (it skips `tasted()`). | 1) Click: you join a short line of locals that shuffles forward. 2) At the front: "NEXT!" 3) Three seconds to tap your order from pictures (up to three tacos, salsa or not). 4) Fast: "Extra salsa" (a bigger taco). Slow: "Step aside. Think about it." and you're back at the front a second later, no coins lost. 5) Eat standing; there are no seats. | Verb: order fast. Feedback: the line moving, the shout. Payoff: a taco in hand and a little NYC skill. | The Chelsea Market taco line wraps the corridor, moves fast, and expects you to know your order by the front. | Real players queue in the same line; whoever's behind you can sigh if you dither. | M | Halal Rush's picture orders (`games/halal-rush/orders.ts`), an `Actor` queue on `nav.path`, `vend`/`tasted` |
| Donut Drop, Bagel Bros, Lobster Pot | Donuts and bagels: one click, 2 coins, held. Lobster: a line ("A lobster roll costs 30 coins. I'll... just smell it."); you can't buy one. | Donut: dip it in the glaze (drag down, hold, lift: it drips), shake the sprinkle jar (wiggle the mouse); you hold your color. Bagel: drag the knife across both halves until the schmear covers; ask for it scooped and the counter man just looks at you. Lobster: 30 coins alone, or tap "Split it" and anyone at the counter has 10 s to tap too: 15 each, a half roll each. | Verbs: dip, shake, spread, split. Feedback: drips, coverage, the look. Payoff: a snack that's yours; lunch with a stranger. | Scooping a bagel gets a look here; a Chelsea Market lobster roll costs about a week of subway rides; "we'll split it" is how New Yorkers eat anything over twenty dollars. | Split needs two people (a local offers if nobody's there). | M | `vend`, items `donut`/`bagel` with a color tint, the drag tools in `games/slice-factory`, kit |
| The waterfall | The same 1-coin wish dialog as the Met fountains: a random fortune line, confetti, the Make a Wish stamp. | 1) Pick a wish from six pictures (a rent-stabilized key, a subway seat, a perfect bagel, a marquee, a rooftop, a quiet street). 2) Fold it into a paper boat: three quick drags along the dotted lines. 3) Set it on the pool; it bobs under the falls and drifts. 4) Everyone's boats float there all day: click one to see its wish and tap "Me too" (a splash, it bobs higher). 5) The day's most-seconded wish runs in tomorrow's Club NYC Times. | Verb: fold, float, second. Feedback: a pool filling with everyone's boats. Payoff: a trace, and your wish in the paper. | The water pours out of an old pipe, a nod to the building's factory past. Every New Yorker's wish is the same apartment. | Shared boats and "Me too"; the newspaper line. | M | the `waterfall` cutout, `newspaper.ts` and `data/news.ts`, the traces table, kit |
| Menu board | Picture card (the biscuit factory, the cookie invented here in 1912, the food hall since 1997); "Got It". | 1) Every quarter hour on the New York clock (and when you click the board): a low rumble. 2) The hanging lamps sway; dust sifts off the steel beams. 3) A long freight-train shadow slides across the brick wall with a far-off whistle. 4) The waterfall stutters; a local looks up: "Again with the train." 5) First time: "Ghost Freight" stamp. | Verb: look up. Feedback: the whole room shudders. Payoff: a secret you feel instead of read. | The High Line's freight trains ran right through the old Nabisco buildings, now Chelsea Market, so the bakery loaded straight off the tracks. | Clock-aligned, so everyone in the market feels the same train at once. | S | `onRoom`, CSS keyframes on the lamp cutouts, `sfx.train`, NPC say |

**Already alive.** Nothing. **Leave.** Bench, stairs.

## Brooklyn Bridge

| Object or moment | Today | Alive version | Why it's fun | NYC truth | Social hook | Effort | Reuses |
|---|---|---|---|---|---|---|---|
| NEW: "Bike lane!" | Nothing; the bike symbol on the boards is just paint. | 1) Stand on the bike half of the boards for a second. 2) Two bell dings from the tower end. 3) A cyclist grows out of the distance, straight down your lane: "BIKE LANE!" 4) Step left in time: they pass with a nod, "Thank you." Stay: they swerve with a whoosh and your New Yorker spins. 5) The first yelling earns "Bike Lane!" | Verb: dodge. Feedback: bell, yell, whoosh. Payoff: a laugh, a stamp, and you learn the lanes. | For years the promenade was split and "BIKE LANE!" was its anthem (bikes got their own roadway lane in 2021, so this is a classic). | Anyone in the lane sets it off; more people in the lane bring more bikes, up to a peloton. | S | `/art/mp/bike-citibike.png`, the bell synth in `moments/bikeBells.ts`, `onRoom('brooklyn-bridge')` in `downtown.ts`, `depthScale`, emote jump |
| The right arrow (traced, dead) | The sign is traced (`exit-right`) but goes nowhere. A playtester left from right here: "no brooklyn". | 1) Click the sign: you start walking; the boards scroll and the arch comes at you, then passes overhead. 2) Tourists stop dead for photos in your path: sidestep (Left/Right). 3) A vendor: "Water! One dollar!" 4) Mid-span, turn around: the whole skyline; one click takes the photo. 5) The Brooklyn end: a "Welcome to Brooklyn" sign; snap it, walk back or take the subway home. | Verb: walk, weave, look back. Feedback: the tower growing, near-misses. Payoff: the crossing itself, a photo, a stamp. | The walk is about a mile; people stop dead in the middle for photos; Emily Warren Roebling crossed first in 1883, holding a rooster. | Players who start together walk side by side (a small bridge-walk room). | M | the dead `exit-right` cutout, kit, the room art scaled toward the arch, `Actor` tourists, `flash()` |
| Souvenir stand | Picture card with a grid of nine magnets (3 to 5 coins), "See My Fridge", "Shirts & Hats". | 1) The stand's own pegboard comes up close: the magnets on it are the ones for sale. 2) Pluck one off (drag it into the paper bag on the table). 3) Third one in the bag: the vendor holds up fingers: "Three for ten." 4) Drop coins in his palm. 5) The bag goes home to your fridge, or "Send to a friend": it lands on their fridge with a postcard. | Verb: pluck and pay. Feedback: the bag filling, the deal. Payoff: magnets on your fridge or a friend's. | Every street souvenir stand in the city runs on "three for ten". | Gift a magnet to a friend's fridge. | M | `MAGNETS` in `data/souvenirs.ts`, `openFridge`, `g.spend`, `sendPostcard`, kit |
| Tugboat (and the gulls) | Click the tug: one "TOOOOT" and a bubble. Gulls: a squawk and a line. | 1) Pump your arm (hold and pull down, like a horn cord). 2) The tug answers with as many toots as you pumped. 3) Every 40 seconds something else comes down the East River (a tug, a ferry, a barge, a sailboat that only has a bell). 4) Get all four to answer: "Harbor Chorus" stamp. | Verb: pump. Feedback: an answer from the water. Payoff: a stamp and a reason to watch the river. | Kids on the bridge pump their arms at every boat on the East River; the tug captains have heard it all. | Two people pumping in sync get the long double blast. | S | the `tugboat` cutout, `sfx.toot`, `ferrySfx.horn`, Ferry Captain's boat sprites |
| Skyline painter | Picture-card gallery of six paintings (10 to 15 coins) for your apartment. | 1) Sit on the painter's stool beside the easel. 2) He squints and measures you with his thumb. 3) Eight seconds of scratching: your caricature draws itself on the canvas, big head, tiny body, holding whatever you hold. 4) 6 coins and it's framed for your wall (plus a postcard copy). The paintings stay for sale. | Verb: sit still. Feedback: lines appearing. Payoff: a funny portrait to hang. | Caricaturists set up wherever tourists stand still long enough. | Two friends sit together for a double caricature. | M | `avatarMarkup`/`headPortrait` with a big-head transform, `giveFurniture`, `souvenirs.openGallery` |

**Already alive.** *Love Locks:* built in `moments/locks.ts` (drag a lock onto the mesh, fling the key into the
river, the bolt cutters take the oldest), not wired; the locks still open a picture card. Opens fine headless. The
locks live only in your own save, so nobody else ever sees them: move them to the traces table so the railing fills
with everyone's. The "Wall St" sign zone works. **Fold.** The tower card's facts become the halfway beat of the
walk (no card).

## Battery Park

| Object or moment | Today | Alive version | Why it's fun | NYC truth | Social hook | Effort | Reuses |
|---|---|---|---|---|---|---|---|
| NEW: the living Statue of Liberty | Nothing. | 1) A performer painted copper green, foam crown and torch, stands on a crate by the ticket booth, perfectly still. 2) Drop a coin in her bucket: she snaps to a new pose and freezes. 3) Try to make her laugh: emote in front of her (wave, cheer, dance, jump). 4) Wrong ones get a slow blink. Today's funny combo (it changes daily) cracks her: a stifled giggle, a wink, back to stone. "Cracked Her Up" stamp. | Verb: perform. Feedback: her tiny reactions. Payoff: a crack in the stone. | Living statues of Lady Liberty, green head to toe, pose for tips along the Battery. | She reacts to everyone's emotes, so a crowd trying combos together is the point. | M | an `Actor` like `spawnBrad`, items `foam-crown` and `torch`, a CSS green filter, the pose relay `{ t: 'p' }`, `hash(nycDay())` |
| The statue on the horizon | Picture card ("size 879 sandal" joke) with "Take the Ferry". | 1) Click her: a viewfinder over the harbor. 2) Your hand appears in the foreground. 3) Pinch: drag thumb and finger together until she sits between them, fingertips on crown and toes. 4) Aligned: the frame glows, snap. 5) Postcard: "Pinched her." Stamp. | Verb: pinch. Feedback: the glow when it lines up. Payoff: the classic photo, yours. | From the Battery she's small enough to pinch, and everybody tries. | Friends nearby are squeezed into the bottom of the shot. | S (shares the line-up code) | the `lineUp` moment (Top 7 #6), the `statue` cutout, the photo booth PNG pipeline |
| Seagull (and the lamp post) | Click the gull: if you hold food it's gone instantly (a toast says you still own it); otherwise a line. The lamp is a history card. | 1) Walk the railing holding a snack: the gull on the lamp post (its lookout) turns its head. 2) Its shadow grows on the paving. 3) Duck (S) or hold the snack high at the right moment: it overshoots into the trash-can lid (clang) and stalks off. 4) Too slow: it's gone with your pretzel (you still own it). Three dodges in a row: "Not Today, Gull". | Verb: duck. Feedback: the growing shadow, the clang. Payoff: keeping your lunch. | Harbor gulls work the waterfront in shifts; locals eat with one arm up. | Two snack-holders split its attention; it goes for the slower one. | S | `extras.seagull` (snack removal), the tell-and-dash timing in `squirrel.ts`, the `gull` and `lamp` cutouts, `sfx.squawk` |

**Already alive.** *Life Ring:* built in `moments/lifeRing.ts` (slingshot the ring at a drifting buoy, rubber duck
and beach ball; ring the statue for a secret), not wired: "Practice a Toss" still says one line. Opens fine
headless. The ferry and Ferry Captain: see The ferry.

## Liberty Island

| Object or moment | Today | Alive version | Why it's fun | NYC truth | Social hook | Effort | Reuses |
|---|---|---|---|---|---|---|---|
| The statue: the crown climb | Picture card, then "Climb to the Crown": a counter runs 0 to 354 by itself in 3.6 s with captions, then a zoom of the same room picture and the Crown Jewel stamp. You press nothing. | 1) Click the statue: the view tilts up the pedestal. 2) Climb: alternate Left and Right in a steady rhythm; go too fast and you lean on the rail to catch your breath (no fail). 3) In the spiral, duck (Down) under Eiffel's iron braces or bonk: "Ow. Iron." 4) At the top, pick one of the 25 crown windows. 5) For 20 seconds your face shows in that window to everyone on the island, and their waves float up to you as little hearts. | Verb: climb in rhythm, duck. Feedback: pace, the bonk, the summit. Payoff: being seen up there by people below. | Crown tickets sell out months ahead; the last 162 steps are a tight double-helix spiral inside the iron frame. | People on the ground see you in the crown and wave; you see their waves. | M | `roomfun.climbCrown` (replace), kit, `extras.onAir` (a portrait over a cutout), the room fx relay |
| Kiosk pose and the torch card | Kiosk card: "Foam Crowns & Torches" (shop) and "Strike the Liberty Pose" (wear the torch if owned, flash, a line). The torch is a separate history card. | 1) Hold your foam torch up (hold the mouse). 2) A viewfinder: drag your New Yorker sideways and back until your flame sits exactly on hers. 3) Aligned: snap; the postcard shows you holding her torch. 4) Keep holding: at 10 s your arm shakes, at 20 s a gull lands on your torch. 5) "Torchbearer" stamp. | Verb: line up, hold. Feedback: the glow, the shaking arm, the gull. Payoff: the island's classic photo. | The forced-perspective torch shot is the island's classic tourist photo; the real torch has been closed to visitors since 1916. | Two friends line up on both sides for a "Liberty sandwich". | M (shared with the pinch) | the `lineUp` moment, item `torch`, the `statue` cutout, the photo booth PNG pipeline |
| The pedestal | A history card behind the statue card's "Read the Pedestal". | 1) A donation box sits at the base of the pedestal. 2) Drag 1 to 5 coins into the slot. 3) A newsboy shouts "Extra! Extra!" while your name is set in type, letter by letter. 4) Tomorrow's Club NYC Times prints a "Pedestal Fund" box with yesterday's donors ("and 41 others"). "Every Penny Counts" stamp. | Verb: give. Feedback: type clacking into place. Payoff: your name in the paper. | France gave the statue; Americans paid for the pedestal, and Pulitzer's World printed every donor's name, 120,000 of them, most under a dollar. | Your name in a paper everyone reads. | M | `newspaper.ts` and `data/news.ts`, `g.spend`, the traces table for yesterday's names, CSS type animation |

**Already alive.** Arrival confetti and the Lady Liberty stamp (works; confetti on every arrival may wear thin).
**Leave.** Fort Wood (the climb starts inside its star), the skyline card (the viewers cover it), the bench, the
gulls (feet system below). **Flag.** The second viewer's "July IV, MDCCLXXVI" label lost a non-native player:
viewers should point with pictures, not Roman numerals.

## Wall Street

| Object or moment | Today | Alive version | Why it's fun | NYC truth | Social hook | Effort | Reuses |
|---|---|---|---|---|---|---|---|
| The Big Board | A live picture card: ten rows tick, a news crawl, nothing to press (see Do first, item 3). A playtester called it "fake". | 1) Step up to the board: BullMarketBrad turns: "You? In the pit?" 2) The in-room LED board (not a card) flashes one row at a time, green up or red down. 3) Flash the signal first: Left = palm in (buy), Right = palm out (sell). 4) Ten flashes, faster each time; a wrong signal costs nothing but Brad's smirk. 5) Beat Brad: "Respect." and the board scrolls your name past the whole street. "Open Outcry" stamp. | Verb: signal. Feedback: a race against a rival with lines. Payoff: your name on the board. | Before screens, the floor ran on shouting and hand signals (palm in to buy, palm out to sell). | Two players race each other with Brad refereeing; the winner scrolls for everyone. | M | `mountTicker` and `quadMatrix` in `downtown.ts`, `market()`, `spawnBrad`, kit, emote poses |
| Hot dog cart | Picture card with "Buy a Hot Dog (2)" and "Ask for Ketchup" (a line about the vendor staring). | 1) Hand over 2 coins; the dog comes out of the steam. 2) Dress it: mustard zigzag (drag), onions (tap), or ketchup (see 4). 3) Eat in four bites (four clicks) while the ticker moves; under four seconds is "Power Lunch". 4) Choose ketchup and the whole street stops: every local and Brad turn and look at you in silence for two seconds, a pigeon drops its crumb, then life resumes. 5) From noon to one, New York time, a line of suits forms first. | Verb: dress, bite. Feedback: the silent stare. Payoff: a stamp and the best two seconds of silence in the game. | Downtown lunch is eaten standing up in about four bites; ketchup on a hot dog gets looks, though the vendor will still hand it over. | Players line up together; everyone nearby sees the stare. | S | `vend`, the cart counter (Across the district), `world.npcs` turning to face you, `spawnBrad` |

**Already alive.** *The Bull* (wired, `moments/bull.ts`: rub his nose, the luck meter fills, he snorts, the ticker
prints your luck): works. *The Opening Bell* (`moments/bell.ts`: tug the rope in time with the swing until six
columns light), not wired; opens fine headless. Bonus: let it ring by itself at 9:30 and 4:00 New York time.
*Washington's pose* (`moments/pose.ts`: drag a wooden dummy's arms to match him, cast in bronze, a score out of 100),
not wired; opens fine headless. BullMarketBrad and the in-room ticker work. The subway stairs lead into the
turnstile swipe. **Leave.** Federal Hall, Trinity Church.

## One World Trade (quiet)

The rule for this room: quiet and reflective. No games, no jokes, no counts.

| Object or moment | Today | Alive version | Why it's fun | NYC truth | Social hook | Effort | Reuses |
|---|---|---|---|---|---|---|---|
| 9/11 Memorial pool | A quiet picture card that awards Never Forget on opening (chime, "+25 XP"), with "Place a White Rose" (a rose appears beside you on the parapet, a toast) and "Visit the Memorial Exhibit" (four quiet pages). Roses live in page memory: gone on reload, and nobody else sees them. | 1) Walk to the parapet: the bronze names come up close, the waterfall's sound rises, the HUD fades. 2) Hold to lay a white rose in a name; let go. 3) Nothing else happens: no confetti, no toast, no count; the stamp is recorded silently. 4) Roses laid today are seen by everyone who comes, and fade at New York midnight. 5) Step back (Escape or click away). The exhibit stays a small link in the corner. | Verb: lay a rose. Feedback: sound and stillness. Payoff: presence, and a quiet trace for others. Not a game. | Memorial staff place a white rose on each name on that person's birthday; visitors leave flowers in the names. | Visitors see that others have been here, with no names and no numbers. | S (quiet), M (shared roses) | `placeRose`, `drawRoses`, `rimY`, `memorialExhibit` in `downtown.ts`, kit with a quiet style, the traces table |
| The Survivor Tree | A quiet card (its story) with "Sit a While" (sits you on the nearest seat). | 1) Click the tree: you walk to its railing and sit on the planter's edge. 2) After a few seconds of stillness, a few white petals drift down (in spring the tree blooms; other seasons, a leaf). 3) Nearby chat bubbles soften while you sit. 4) Stand up to leave. The story stays one tap away. | Verb: sit, be still. Feedback: petals. Payoff: a moment of calm. | Found burned in the rubble with one living branch; it blooms white every spring, and its seedlings go to places that have lived through hard times. | People sitting by the tree see each other sitting quietly; no prompts. | S | seats and `sitPlayer`, CSS petals, the existing quiet card |
| Subway stairs and the Oculus | The stairs open a picture card (the Oculus, with a joke) offering "Ride the Subway" (then the turnstile) or "Walk Through to Wall Street" (a teleport). The Oculus itself is a teleport. | 1) Click the stairs: you walk down behind the railing straight into the turnstile swipe (already alive), no card. 2) Click the Oculus: walk in under the white ribs; four seconds of echoing footsteps; you come out on Wall Street. 3) On September 11 mornings, New York time, the skylight shows open (a quiet visual only). | Verb: walk. Feedback: the descent, the echo. Payoff: travel that feels like a place. | The Oculus skylight opens every September 11 morning; the subway and the PATH run beneath it. | Friends see you go down the stairs instead of vanishing. | S | `openSubway` and `swipeIn` (`turnstile.ts`), the stair walk (Across the district), the `oculus` and `subway` cutouts |

**Already alive.** The elevator up (`elevatorUp`: 500 years of skyline in the window, a floor counter, Skip Ride):
works, and the tone is right. **Flags.** See Do first, item 4. Keep the coffee cart a plain purchase.

## Sky Deck 102 (calm)

| Object or moment | Today | Alive version | Why it's fun | NYC truth | Social hook | Effort | Reuses |
|---|---|---|---|---|---|---|---|
| The Sky Portal | Picture card with "Jump on It" (a jump, the disc wobbles, a height joke) and "Lie Down and Look" (sit, a line). | 1) Step onto the disc: the street view in it slowly zooms in. 2) Tiny taxis crawl along the avenue; tap one and it honks, faintly. 3) The plaza shows a dot for each friend at One World Trade right now; tap a dot to wave. 4) They get "A wave from floor 102." and can wave back: a small heart floats up into the disc. 5) Step off to leave. | Verb: look down, wave down. Feedback: the zoom, the answering heart. Payoff: a connection across 1,250 feet. | The real Sky Portal is a 14-foot disc showing live video of the streets below: a screen, not a hole, which your knees won't believe. | Waves between the deck and the plaza. | M | `skyPortalJump`, the `portal` cutout, friends' rooms from `{ t: 'f' }` presence, `toast`, emote wave |
| The window landmarks (Liberty, Empire State, Bridge) | Three picture cards: "Wave at Her", "Visit the Empire State", "Go to the Bridge". | 1) Click a landmark in the glass: your New Yorker walks to the window and points. 2) A soft outline traces it. 3) Click again to frame a "Postcard from 102" (flash; it goes to your mail). 4) A small arrow under the frame takes you there (the ferry, for Liberty). | Verb: point, frame. Feedback: the outline, the flash. Payoff: a postcard and a next stop. | On a clear day you can see all five boroughs and New Jersey from up here. | Send the postcard to a friend. | S | the `view-*` cutouts, `flash()`, `sendPostcard`, `g.goto` |

**Already alive.** The photo booth (`photobooth.ts`: four poses, everyone nearby squeezes in, a downloadable strip;
code read, not replayed) and the elevator down (works). **Flags.** The deck can stay warm and light (it's a view,
not the memorial), but keep gags away from falling, breaking glass or anything in the air in this building; the
café and portal one-liners are borderline under the brief's rule, your call. The window art seems to include a One
World Trade lookalike on the skyline: you can't see the building you're standing in.

## The ferry

| Object or moment | Today | Alive version | Why it's fun | NYC truth | Social hook | Effort | Reuses |
|---|---|---|---|---|---|---|---|
| Tickets, Board the Ferry, gangway (Battery Park) | All three open one dialog: "Ride as a Passenger (2)" or "Captain the Ferry". The ride is a 3.2 s card (an orange boat on blue stripes, "Next stop: Liberty Island"), then you're there. | 1) Buy a paper ticket at the window (2 coins); it's in your hand. 2) Security: drop your hand item and hat in a gray bin, step through the arch (the foam torch always beeps), take them back. 3) Walk the gangway. 4) The horn: everyone on the dock jumps. 5) A 20-second crossing: the Battery slides away and she grows; a gull paces the rail (keep your snack down); the orange Staten Island ferry passes (wave, its deck waves back); click when she's centered for the postcard. 6) The deckhand throws the rope; step off on Liberty Island. Boats leave on the half minute by the New York clock, so friends who board together ride together. | Verb: queue, board, wave, snap. Feedback: the horn, the statue growing. Payoff: arriving, and a postcard. | The Liberty boat costs about $25 and has airport-style security; the free orange boat is the Staten Island Ferry, which passes her without stopping. | Shared departures; the dock sees you board and waves you off. | M (solo), L (shared deck room) | `games/ferry-captain/art.ts` (`drawSky`, `drawWater`, `drawLiberty`, sprites), `ferrySfx.horn`, `extras.ferry` (replace the card), `extras.seagull`, `flash()`, `sendPostcard` |
| Ferry Back to Manhattan (Liberty Island) | A dialog with one button, "All Aboard!", then an instant, free teleport (going cost 2 coins and had a ride; coming back has neither). | 1) The horn sounds from the pier; the deckhand calls "Last boat!" and then, deadpan, "Next one's in thirty seconds." 2) Walk aboard: the same crossing, reversed; the skyline grows and One World Trade rises ahead. 3) Optional skyline photo. 4) Dock at Battery Park. | Verb: board, look back. Feedback: the skyline growing. Payoff: a homecoming instead of a cut. | The last boat off the island leaves late afternoon, and everyone runs for it. | Same shared departures. | S (once the crossing exists) | the crossing moment, mirrored |
| NEW: the Staten Island Ferry | Nothing. A dock local says "The ferry is free, you know." while the game charges 2 coins for a boat to Liberty Island. | 1) At the ticket booth, a second choice with no price: the orange boat. 2) Board (no security line). 3) The crossing passes Lady Liberty up close: snap her. 4) "Staten Island. Everybody back on." 5) Ride back to Battery Park. "Free Ride" stamp. | Verb: ride, snap. Feedback: the statue sliding by. Payoff: the locals' secret, a postcard. | The Staten Island Ferry is free, runs day and night, and is the classic tip for a free Statue of Liberty view. | A natural "meet me on the boat". | S (once the crossing exists) | the crossing moment, Ferry Captain art |

**Already alive.** *Ferry Captain* (`games/ferry-captain`): a 100-second side-scroller with three life rings, coins,
gulls dropping slices and Space for the horn; arriving drops you on Liberty Island with the Captain! stamp. Code
read, not replayed in this pass. Next for it: let players on the dock ride as passengers on your shift (they cheer
your saves), and send your horn to the dock through the fx relay.

## Binocular views

| Object or moment | Today | Alive version | Why it's fun | NYC truth | Social hook | Effort | Reuses |
|---|---|---|---|---|---|---|---|
| Tower viewers (Liberty Island x2, the High Line's river view) | A free, pannable 3x zoom of the room's own picture with three or four labels. It plays a coin sound but charges nothing, and there's nothing to find. A playtester: "just a picture to move mouse over". | 1) Drop the coin (a gesture and the clunk; keep it free). 2) The shutter clacks open; a thin ring runs down around the lens (25 s). 3) Above the lens: three small pictures of things to find (Liberty: a gull on the torch, the ferry, a kayak; High Line: the sailboat, Little Island, a taxi on the West Side Highway). 4) Pan; hold the crosshair on one for half a second: a ring snaps on, ding. 5) The shutter snaps shut on time; whatever you found stays found. All six per viewer, over any visits: stamp. | Verb: search. Feedback: the snap ring, the shutter. Payoff: a collection per viewer. | Coin-op viewers always snap shut just as you find the thing. | Two players on the two Liberty viewers race for the same three. | S | `binoculars.ts` (add `finds` and `calm` to `BinocularView`), the `binoc()` label data in `rooms.ts`, `sfx.coin`, `sfx.ding`, stamps |
| Sky Deck viewers and the crown's view | The same free zoom; the crown climb ends in the same zoom of the room picture. | Calm mode (no timer, no score): 1) Pan across the city; pins mark where your online friends are right now (a heart on the Brooklyn Bridge for BagelQueen). 2) Hold on a pin to send a wave. In the crown: a frame of the crown's windows instead of a round lens, looking down at the harbor. | Verb: look for your people. Feedback: hearts over the city. Payoff: a sense of who's out there. | Up top, everyone points out their own neighborhood first. | Waves to friends across the map. | M | `binoculars.ts` calm mode, friends' rooms from presence, room positions in `data/geo/map.json` |

## Across the district

| Object or moment | Today | Alive version | Why it's fun | NYC truth | Social hook | Effort | Reuses |
|---|---|---|---|---|---|---|---|
| Pigeons (Wall Street), gulls (Battery Park, Liberty's railing), leaf piles (Central Park lawn) | Pigeons coo when clicked (three coos give Flock Together, whose text still says Times Square); gulls squawk or steal snacks when clicked; the leaves are paint. | 1) Walk through the pigeons: they burst up in a flap, circle and land again a few seconds later. 2) Run through with friends: the whole flock goes at once. 3) On the Central Park lawn, raked leaf piles: walk in and it bursts; jump (J) and a squirrel pops out one time in five. 4) Gulls on the railing lift off as you pass and settle behind you. 5) A small stamp for scattering ten flocks. | Verb: walk. That's it. Feedback: instant, physical, funny. Payoff: the city noticing you. | Pigeons only move for you at the last possible second; Parks crews rake leaves into piles every November. | Reacts to every player's position, so crowds make bigger bursts, with no new networking. | S | `onRoom` and `onFrame`, `cutoutImg`, `world.npcs` positions (remote players included), `sfx.coo`, `sfx.squawk`, SVG props placed like `mp/spots.ts` |
| Every cart (Met hot dog and pretzel, Central Park pretzel, Boathouse cocoa, One World Trade coffee and pretzel, Sky Deck café) | One click buys and hands you the treat with a line, or a picture card with buy buttons. | 1) Click the cart: its front opens; drag coins to the vendor's palm. 2) The vendor's hands make it. 3) Finish it yourself, one verb per food: mustard zigzag (drag), shake salt on a pretzel (wiggle), blow on cocoa before you sip (hold) or burn your tongue. 4) Coffee: tap "Regular" (milk, two sugars) and the vendor nods: that's The Usual stamp. 5) It lands in your hand; Belly Full counts it. | Verb: one small finishing touch per food. Feedback: the zigzag, salt flying. Payoff: a snack that feels made, and the vocabulary. | "Regular" from a cart means milk and two sugars, served in the blue Greek cup everyone pictures. | A friend at the cart can buy yours. | M | `vend` and `tasted`, the cart cutouts, kit, `sfx.register` |

**Stairs.** The High Line and Chelsea Market stairs and the Wall Street and One World Trade subway stairs should be
walked, not cut: the avatar steps down behind the railing for half a second before the room changes (S; `walkTo` plus
the stair cutout as a mask).

## Three pieces of plumbing behind the social hooks

1. **A room fx relay.** Copy the snowball's path (`snowball.ts` sends `{ t: 'sb', x, y }`, `server/src/game/realtime.ts`
   relays it to the room with a token bucket, `net/multiplayer.ts` draws it) into one `{ t: 'fx', k, x, y }` message
   with a whitelist of kinds. It carries the crown-window face, the Met banner, the Gala carpet, the opening bell, and
   the ferry horn on the dock.
2. **One traces table** (migration v16: room, kind, x, y, small JSON of preset ids, author, created_at, expires_at),
   read on room enter and written through a guestbook-style endpoint in `server/src/api.ts` with the same rate limit.
   It carries shared love locks, bench plaques, memorial roses, wish boats, the gelato combo and the pedestal donors.
   Preset ids only, so there's no free text to moderate.
3. **Free sync.** Clock-aligned events (ferry departures on the half minute, the ghost train on the quarter hour,
   the bell at 9:30 and 4:00) and position-driven reactions (pigeons, the bike lane) need no networking at all:
   every client shares the New York clock and the synced player positions.

## Top 7 for parks and downtown

Ranked by fun per day of work, after the Do first list. Nothing at One World Trade is here on purpose: its changes
are about restraint, and they're in Do first.

**1. The city reacts to your feet (S).** Pigeons burst off Wall Street when you walk through them, leaf piles explode
on the Central Park lawn, gulls lift off the Battery railing. Build it as a new `app/src/features/footfall.ts`,
imported by `game.ts` the way `downtown.ts` is, so its room hooks register on import. Each room lists its skittish
things (`{ obj: 'pigeon-1', r: 36 }`, the gull on the rock, and leaf piles drawn as inline SVG props placed like the
signs in `mp/spots.ts`). An `onRoom(room, ...)` hook runs an `onFrame` check of `world.player.pos` and every actor in
`world.npcs` (remote players included, because their positions are already synced) against each spot. On entry it
hides the painted cutout with `cutoutImg()` from `moments/kit.ts`, spawns two to four CSS-animated flyers or leaves,
plays `sfx.coo` or `sfx.squawk` (add a wing-flap noise burst to `audio.ts`), and restores the cutout after six to nine
seconds. Scale the burst with how many actors arrived in the last second. Every client sees the same scatter with no
new messages. Optional stamp in `data/stamps.ts`, counted with `bump()`.

**2. "Bike lane!" on the Brooklyn Bridge (S).** Put it in the existing `onRoom('brooklyn-bridge')` hook in
`downtown.ts` (it already hangs the Wall St sign there) or in a small `moments/bikeLane.ts`. Define the bike half of
the boards as a polygon in stage units (center stripe to the right railing, narrowing to the arch), and track in
`onFrame` how long each actor stands in it. When anyone lingers 1.2 s, ring twice (the struck-bell synth from
`moments/bikeBells.ts`) and send a rider down the lane: `/art/mp/bike-citibike.png` under a rider drawn with
`avatarMarkup`, scaled with `depthScale` as it comes from the arch. A clear lane gets a nod; an occupied one gets a
whoosh, `emote('jump')` on whoever is in the way and a "BIKE LANE!" bubble. More people in the lane spawns more riders
(cap four). Add the "Bike Lane!" stamp to `data/stamps.ts`.

**3. Coin-op viewers you actually use (S).** Extend `features/binoculars.ts`: `BinocularView` gains
`finds?: { at: Pt; icon: string; r: number }[]` and `calm?: boolean`. Keep it free (the coin is a gesture and the
existing `sfx.coin`). Two half-disc shutters slide open in CSS and a ring timer runs 25 s around the lens; a strip
above it shows three icons from `/art/icons/e` or tiny crops of the room art, never words. Each frame, the room point
under the lens center comes from the pan offset the module already computes; hold it within `r` of a find for 0.4 s
and a ring snaps on with `sfx.ding`. Found things persist in `save.stats` per viewer, with a stamp per completed
viewer. The finds sit next to the existing labels in the `binoc()` calls in `rooms.ts` (Liberty x2 and the High
Line here, the Empire State deck too). `calm: true` (Sky Deck) skips the shutter and the timer.

**4. The ferry crossing (M).** Replace the 3.2-second card in `extras.ferry` with `features/moments/ferryRide.ts`: a
canvas inside `openMoment` that reuses `games/ferry-captain/art.ts` (`loadArt`, `drawSky`, `drawWater`,
`drawLiberty`, `drawPier`, the tug, sailboat, barge and gull sprites) and `ferrySfx.horn`. The sequence: the ticket
(`g.spend(2, 'ferry-ticket')` as today), the security bin (drag your hand item into a gray tray, walk the arch, take
it back), `walkTo` along the gangway cutout, the horn (dock locals `emote('jump')`), then 20 seconds of scrolling water
with Liberty growing, a rail gull that reuses `extras.seagull`, a passing Staten Island ferry that waves back, and a
photo window (`flash()` and `sendPostcard`), ending with the rope throw and `g.goto('liberty-island', 'battery-park')`.
Departures on the half minute by the New York clock let friends who board together arrive together without server
work. Skip appears after your first ride. Mirror it for the trip back, and add the free Staten Island round trip as
a second, priceless choice at the booth.

**5. The living Statue of Liberty (M).** Spawn her in an `onRoom('battery-park')` hook following `spawnBrad()` in
`downtown.ts`: an `Actor` wearing `foam-crown` and `torch` from `avatar/items.ts`, `mob = true`, on a small crate prop,
with a CSS filter on her `wrap` (`sepia(1) hue-rotate(110deg) saturate(1.6)`) for the copper green. Clicking her
opens a light `openMoment('mo-statue')`: a coin in her bucket (`g.spend(1, 'statue-tip')`) snaps her into one of four
held poses. The day's "funny combo" is picked with `hash(nycDay())` from `kit.ts` over the poses everyone already has
(wave, cheer, dance, jump). Wrong emotes get a slow blink; the right sequence makes her crack (a stifled giggle bubble,
a wink) and return to stone. Because poses are already relayed (`{ t: 'p' }`), she can watch remote players too, so a
crowd trying combos together is the whole joke. Add "Cracked Her Up" to `data/stamps.ts`.

**6. Line-up photos: pinch her, hold the torch (M).** One file, `features/moments/lineUp.ts`, with two entry points
wired in `rooms.ts`: `pinchHer` on Battery Park's `statue`, and `holdTheTorch` on Liberty Island's kiosk pose and
statue. It opens a viewfinder over the room. For the pinch, an SVG hand sits in the foreground and two drags close
the fingers around the distant statue; for the torch, your New Yorker (drawn with `avatarMarkup`, holding the `torch`
item) is dragged sideways and in depth until the foam flame sits on her real one (the target comes from the `statue`
cutout rect). A ring closes when aligned, like the cast ring in `moments/pose.ts`, and `flash()` fires. The output is
a postcard PNG built the way `photobooth.ts` builds its strip (SVG to PNG, nearby players squeezed in), sent with
`sendPostcard` and downloadable. Stamps "Pinched Her" and "Torchbearer"; the arm shake and the gull landing on your
torch are CSS on the held pose.

**7. Adopt-a-Bench plaques (S, then M).** Version one: `data/plaques.ts` with 40 short dedications, and an
`onRoom('central-park')` hook that pins a tiny brass plaque prop to each bench (positions from the geo seats). It
glints after `world.player.seat` has been that bench for three seconds; click to read it as a small brass label, no
panel. The line is `hash(bench + nycDay())` into the list. Version two: "Adopt this bench", once a day, built from
three rows of preset chips (the pattern of the phone's `TEXT_KINDS`, so there's no free text), engraved with a
stamp-press animation and stored for seven days in the traces table through a guestbook-style endpoint. Friends who
sit on your bench get a `toast`. The same table then carries locks, roses and wish boats.

**Runners-up:** Walk to Brooklyn (M, it fixes Darnell's exit), the Met sticker of the day (S, it fixes Lukas's dead
door), fill the water tower (S), the Big Board pit (M), the Staten Island round trip (S once the crossing exists).
