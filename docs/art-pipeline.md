# Art pipeline

All art is generated with **Higgsfield → `gpt_image_2_5`** (quality `high`, resolution `2k`). One image at those settings costs about 2.75 credits.

## Style references

Your four screenshots were uploaded once and reused as `image_references`:

| media id | what |
|---|---|
| `bd543992-…` | CP island map (postcard) |
| `f6c93b29-…` | CP Town Center (Coffee / Dance Club / Clothes) |
| `159aee2a-…` | CP Cove (surf hut) |
| `e8390d19-…` | CP Lighthouse / Beach |

Use 2 references per prompt: one for overall style and one close to the room type (outdoor street → Town Center, waterfront → Beach, interior → Town Center).

## Room prompt template

```
Match the exact art style of the reference images (Club Penguin room backgrounds):
2D vector cartoon game background, fixed 3/4 elevated camera, thick dark outlines,
flat cel shading with a single soft shadow tone, chunky rounded exaggerated shapes,
saturated friendly colours, big expressive storefront signage. Ignore the penguins,
chat bubbles and UI in the references — draw an EMPTY room with NO characters,
NO people, NO penguins, NO UI.
Scene: <PLACE>, <the hero landmark at the back center>, <2–4 props left/right that
will become hotspots>, <one tiny NYC joke prop>. Open <floor material> filling the
lower half of the image for characters to walk on. Blue arrow signs at left and right
edges as room exits. <time of day / light>.
```

Aspect ratio is `16:9`. After generating, run `app/public/art` → `rooms/*.jpg` (2000 px wide, q86). The resize snippet is in the session history. Any Pillow resize works.

What makes it work:
- **"Open floor filling the lower half"** gives the avatar room to walk.
- **Store names** (updated 2026-10-23): the user decided the game uses the real New York names (Louis Vuitton, Saks Fifth Avenue, Adel's Famous Halal Food, Supreme, Nike, Ralph's Coffee, Joe's Shanghai, Ten Ren Tea, Joe's Pizza) in copy and painted signs. Other art still avoids real logos. ⚠️ The bodega image has real cereal and candy logos (Cheerios, Twix, etc.). Regenerate it before anything public.
- Ask for **specific props by position** ("hot dog cart at the right") so hotspots are easy to place. Then open the room with `` ` `` debug mode and click to read coordinates.

## Avatar

`pigeon.png` came from a CP-penguin-style prompt with `background: transparent`, cropped to 360 px tall. To make outfits later, generate items (hat, scarf, foam Liberty crown…) as separate transparent PNGs from the same reference so they layer like CP's paper-doll clothing.

## Generated so far

`map-a` (in use), `map-b` (alternate), `times-square`, `fifth-ave`, `central-park`, `empire-deck`, `brooklyn-bridge`, `battery-park`, `subway`, `pizza`, `bodega`, `pigeon-a` (in use), `pigeon-b`.
