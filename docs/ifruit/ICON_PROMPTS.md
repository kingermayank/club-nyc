# iFruit: Image Generation Prompts

**Status (Nov 13, 2026):** all of these were generated and are in the game: icons and the mark in `app/public/art/ifruit/app/` (trimmed to 192 px + webp), wallpapers and the two unboxing frames in `app/public/art/ifruit/`, full-size originals and the hardware sheets in `raw/ifruit/`. The closed-box frame was an edit of the open one (same framing), prompt below.

Run on Higgsfield, model `gpt_image_2_6`, quality `medium`, resolution `1k` (2k for wallpapers and the unboxing scene). Icons and the logo use `background: transparent`. Outputs go to `app/public/art/ifruit/gen/` and replace the hand-drawn SVGs in `app/public/art/ifruit/` once approved (then run `tools/webp.py`).

## Shared style prefix

Paste this before every prompt:

> Club NYC game art style: a cheerful cartoon world like a modern Club Penguin set in Manhattan. Thick, even dark navy outlines (#1d2140) around every shape, flat saturated colours with one soft shade band on the bottom-right and a glossy white highlight on the top-left, light coming from the upper left, rounded chunky toy-like forms, clean vector-like rendering, no gradients beyond a gentle top-to-bottom tint, no photorealism, no text unless asked. Original design: no Apple logo, no bitten apple, no iPhone, no real brand marks or trademarks.

## Logo

**iFruit mark (chosen direction: Cherry Pair)**
> A logo mark for a phone brand called iFruit: two round glossy red cherries (#e5483b) hanging from two thin dark stems that meet at the top under a single bright green leaf (#3cb371). The left cherry slightly higher than the right. Thick navy outline, white highlight crescent on each cherry, centered on a transparent background, square composition with generous padding, iconic and readable at 16 pixels. Not an apple.

Alternates kept for the record: *Pear Tower* (a green pear whose leaf is a tiny spire) and *Citrus Wheel* (an orange slice with five segments).

## App icons (one per prompt, transparent background, square 1:1)

Each: "A single app icon, rounded squircle tile with corner radius about a quarter of its width, thick navy outline, tile colour as given with a lighter top and a white gloss crescent across the top-left, one glyph centred, front view, no text."

1. **Phone**: tile green #3cb371; glyph: a cream telephone handset tilted 20 degrees with two small yellow sound arcs.
2. **Messages**: tile blue #2a7bd5; glyph: two overlapping speech bubbles, cream behind, sunny yellow #ffd166 in front with its tail at the bottom-right.
3. **Camera**: tile deep ink blue #2c3550; glyph: a chunky cream camera body with a yellow shutter button and a big blue lens with a white glint.
4. **Map**: tile sky blue #6fb6ff; glyph: a small green island shaped like Manhattan on blue water with a red drop-shaped map pin.
5. **Contacts**: tile orange #ff9f1c; glyph: a cream ID card showing a navy head-and-shoulders silhouette and two short lines.
6. **Photos**: tile pink #ff8fc8; glyph: a slightly tilted cream instant photo print showing a yellow sun over a little navy skyline.
7. **Bank**: tile purple #6a4c93; glyph: a big gold coin with a raised five-point star, a second coin peeking behind it.
8. **Stocks**: tile navy #1d2140; glyph: a bright green zigzag line rising to the upper right ending in a yellow dot, a faint grid behind.
9. **Settings** (system): tile cool grey #8d96a6; glyph: a cream gear with a navy hub.

## Phone hardware

- **Front**: "A cartoon smartphone called iFruit, front view, portrait, very rounded corners, a matte candy-blue shell (#2a7bd5) with a thick navy outline, a lighter rim along the top-left edge, a black glass screen inset with a small round punch-hole camera centred at the top, the screen showing a 4-column grid of colourful rounded app icons over a dusk New York skyline wallpaper, one volume pill and one round nub on the left side, one power pill on the right. Transparent background. Not an iPhone."
- **Back**: "The same cartoon iFruit phone seen from the back: matte candy-blue shell, a vertical rounded capsule camera bump in the top-left corner with two stacked round lenses and a small flash dot beside it, a cherry-pair logo (two cherries, one leaf) embossed in the centre in a slightly darker blue. Thick navy outline, transparent background. No apple logo."
- **3/4 view**: "The same cartoon iFruit phone in a three-quarter view, tilted, showing the screen and the left edge with the volume pill and round nub, a soft glossy highlight on the shell, transparent background."

## Wallpapers (portrait 9:16, 2k)

- **Skyline**: "Phone wallpaper: a Manhattan skyline at dusk seen across the river, peach-to-violet sky, a big soft sun low behind the towers, navy building silhouettes with warm lit windows reflected in the water, a few stars near the top. Pure landscape: no people, no animals, no characters, no benches. Lots of calm empty sky in the top third. No text, no logos." (The first run drew penguin characters on a bench, too close to Club Penguin; always say "no characters" in scene prompts.)
- **Subway**: "Phone wallpaper: white subway tile wall with navy grout lines, a row of round colourful subway line bullets (red, green, yellow, blue, orange) with no letters or numbers, cartoon style, calm and graphic. No text."
- **Park (lock screen)**: "Phone wallpaper: Central Park in spring in the Club NYC cartoon style, rolling green lawns, round trees, the lake with a tiny rowboat, the skyline peeking over the trees, soft morning sky. No text."

## Unboxing scene (16:9, 2k)

> "A cardboard delivery box on a wooden apartment table in a cosy New York walk-up, box lid open with crinkled pink tissue paper, a candy-blue cartoon iFruit phone rising out of it with a soft warm glow, a small handwritten tag on the box (blank, no text), window behind with a fire escape and a sunny street, Club NYC cartoon style with thick navy outlines. No logos except a small cherry-pair mark on the box. No text."

**Closed box (edit of the scene above, so the two frames line up):**
> "Edit this exact scene, keeping the room, table, mug, notebook, window, lighting, style and camera framing identical: the cardboard box is now CLOSED, its top flaps folded shut and sealed with a strip of tape across the middle, the twine bow and blank paper tag still tied on, the cherry mark still on the side. No phone visible, no tissue paper, no glow. Everything else unchanged."
