# Each place does its real New York thing

2026-11-11. The founder's direction after the upgrade list: think like the swipe-in, the Big Board and the memorial.
At every place, do what people actually do there (eat it, buy it, walk it, see it), with true details, and show a
before/after for each. No filler mini-games. This replaces the generic items in `upgrades.md`.

## Built 2026-11-11 (before/after: `before-after-2.jpg`)

- **Brooklyn Bridge walk** (`features/bridgeWalk.ts`): the far arrow walks you across in first person on the room's
  own painting: a tourist stops dead for a selfie, the first tower, the second half toward DUMBO (the second painting,
  `brooklyn-bridge-v3`), the Brooklyn end: "Welcome to Brooklyn, How Sweet It Is!", a barricade, "Brooklyn is locked.",
  **Go Back to Manhattan** under "Leaving Brooklyn: Fuhgeddaboudit!" (the borough's real signs). Stamp: Walked the Bridge.
- **Rockefeller rink**: the ice is floor now (`NavGrid.openPoly` for the ice and the rink gate). Click it, walk out,
  glide. No card, nothing interactive until a winter event.
- **Grand Central subway**: the stairs go through the Grand Central–42 St turnstile, then straight to the subway map.

## The plan

### SoHo: real shopping
- **Nike, the Jordan wall.** Every cubby is one real pair: Air Jordan 1 Chicago, Bred, Royal; Jordan 4 Military Black;
  Jordan 11 Concord; Jordan 3 White Cement; Dunk Low Panda; all-white Air Force 1s, which New Yorkers call Uptowns.
  Click a pair: it slides out of its light and spins, name and price on a hang tag. Sit on the bench to try them on,
  pay at the counter, the orange box goes in a bag, you walk out wearing them. 110 to 300 coins.
- **Supreme, very expensive.** Box Logo hoodie (the grail, about 800), Box Logo tee, the 2017 Supreme MetroCard (own it
  and the card in your hand at every turnstile is Supreme red), the 2016 brick (a real Supreme product; it goes in your
  apartment), Supreme Oreos (2020), a skate deck for your wall. Hold a piece up in the mirror, pay, red bag in hand.
  Later: the Thursday drop line outside.
- **Ralph's Coffee.** Order at the counter: Ralph's coffee in the green cup, an oat latte (your name misspelled on
  it), cold brew, hot chocolate; a giant chocolate chip cookie, a black and white cookie, a croissant. The barista calls
  your (wrong) name, the cup lands on the pickup shelf, you take it and sit at the window. Dunk the cookie.

### Little Italy: pizza at Joe's
The case shows the pies (plain, pepperoni, white, a grandma square). "One plain": the counter guy slides it back in
the oven on the peel, four seconds of bubbling, a paper plate. The shaker bar: garlic powder, red pepper flakes,
oregano, parm. Fold it, eat it at a table, bite by bite, grease on the plate. Ask for a fork and knife and the whole
shop gasps (New York still remembers a mayor doing that). Out on Mulberry: a cannoli from the host under the arch.

### Chinatown: dim sum
A banquet hall up a flight of stairs off Mott Street: round tables, a lazy Susan, chandeliers, a stage for weddings.
Carts roll past; the cart lady lifts the lids: har gow, siu mai, char siu bao, rice rolls, turnip cake, chicken feet,
egg tarts. Point at a basket, she stamps your card, one stamp per dish. Pick each one up with chopsticks to eat. Flip
the teapot lid for more hot water; tap two fingers on the table when someone pours for you. The stamped card goes to the
cashier at the end. Joe's Shanghai soup dumplings and Ten Ren boba stay as quick buys on the street.

### Liberty Island: the selfie
A camera button by the railing. The view flips to selfie mode: you big in front, arm out; Lady Liberty behind you.
Pick a pose: torch arm up like hers, your foam crown, a peace sign, or the forced-perspective trick where she stands on
your palm. Snap: flash, a Polaroid slides out and develops. It goes to your mail and your fridge; friends standing
nearby squeeze in (the photo booth already does group shots).

### The Met: go inside
Click the doors: up the steps, the doors open, you get today's sticker ("pay what you wish" if you live in New York
State, which is the real rule). The Great Hall: the info desk and its giant flowers, the grand stairs. Galleries you walk
through, every painting clickable: it fills the screen with a proper Met wall label. Funny takes on paintings that really
hang at the Met: *Washington Crossing the East River* (on the Staten Island Ferry), *Madame X Waits for the L*,
*Wheat Field with Cypresses and One Rat*, *Aristotle with a Bust of a Bodega Cat*, *Young Woman with a Water Pitcher
(Rent Is Due)*, *The Harvesters (Sunday Brunch)*. Credit lines like "Gift of your landlord, 2026." The Temple of Dendur
by its pool, the knights on horseback, the gift shop on the way out. A guard says "No flash" when you take a photo.

### The observatories: zoom into the city (Empire State and One World Trade, the same tool)
Click the glass, not a coin machine: the view goes full screen. Scroll to zoom, drag to pan. Zoomed in, the city is
alive: taxis moving on the avenues, people on the Great Lawn, a rooftop party, a cat on a water tower, the Chrysler's
eagles. Names appear as you zoom (Central Park, the Chrysler, Hudson Yards, the Statue of Liberty), each with one true
line and a **Go There** button. The Empire State looks up Midtown to the Park; One World looks over the harbor.

### Central Park: the walk
Like the bridge: click along the path and walk from view to view. The Mall under the elms, Bethesda Terrace and the
Angel of the Waters, Bow Bridge, then down to the edge of the Lake: a low, angled view of the water with ducks paddling
up and quacking, ripples, rowboats, and the San Remo's twin towers over the trees (the real view). A bag of duck food
(a sign says no bread).

### Same idea, places not mentioned yet
- **Times Square, Sal's cart:** a dirty-water dog with onions in red sauce and mustard; eat it on the red steps.
- **Fifth Avenue, Adel's cart:** chicken over rice, white sauce, the hot sauce (Adel warns you); eat on the bench.
- **Battery Park:** the ferry ride out, the statue growing in the window; ends at the Liberty selfie.
- **Chelsea Market:** tacos and a donut you actually eat.
- **High Line:** as is.

## What needs new paintings
New art (the Higgsfield pipeline, then `tools/cutouts.py`): the dim sum hall, the Met's Great Hall and 2 or 3
galleries plus about 10 parody paintings, the observatory panoramas at high resolution, and 2 or 3 Central Park
viewpoints. SoHo shopping, the pizza, Ralph's, the Liberty selfie and the carts can use the art that exists.
