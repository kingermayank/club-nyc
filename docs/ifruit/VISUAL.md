# iFruit: Visual Language (Phase 3)

iFruit has to look like it was drawn by the same hand as Club NYC: chunky navy outlines, saturated candy colours, warm top-left light, rounded everything. It must not look like an iPhone: no Apple logo, wordmark, three-lens triangle, Dynamic Island pill in the same place and proportion, or the Photos pinwheel / Messages green bubble shapes.

## Hardware

| Part | Rule |
| --- | --- |
| Silhouette | Portrait slab, 264 × 540 stage px, **corner radius 40** (rounder than a real phone: cartoon, toy-like). |
| Material | Matte candy shell in **your signature colour** (`sigColor(look)`, default `#2a7bd5`), a 4 px navy `#1d2140` outline like every object in the city, a 3 px lighter rim on the top-left edge (light), a darker rim bottom-right (shade). |
| Glass | Screen inset 10 px, radius 31, near-black `#14172b` bezel line. A faint diagonal glare band on the glass when locked. |
| Buttons | Left: one long **volume pill** + one round **shortcut nub**. Right: one **power pill**. All outlined navy, shell colour one step darker. |
| Front | A **round punch-hole camera** centred near the top (not a pill). The status bar "island" is a separate floating chip *below* it that only appears for live activity. |
| Back | **Camera bump**: a vertical rounded capsule top-left with **two stacked lenses** and a flash dot beside it (never a three-lens square). The **cherry mark** embossed centre, 20% darker than the shell. |
| Detail level | Cartoon: no screws, no antenna lines, no ports beyond one rounded slot at the bottom edge. |

## Software

- **Typography**: Burbank Display for time, titles, numbers, buttons; Burbank (Small Medium) for messages and lists. Sizes from the game's `--fs-*` scale; the lock clock is the one exception (64 px).
- **Colour**: the game tokens (ink, blue, sun, paper, red, green) plus app tints (below). Screens are **paper** (`#fffdf6`) with navy ink text; headers have a 2 px ink underline, never a hairline grey.
- **Wallpapers**: three originals drawn in SVG: **Skyline** (dusk gradient, sun, a navy skyline with lit windows), **Subway** (white tile with coloured line bullets), **Park** (rolling greens, trees, the lake). Any photo can be a wallpaper.
- **Grid**: 4 columns, 52 px icons, 14 px label (Burbank Display, white with a navy 2 px text shadow on wallpapers). Dock: a frosted glass shelf, radius 24.
- **Motion**: springs for things you summon (open, app launch, bubbles: stiffness ~260, damping ~22, about 4% overshoot), eases for things that leave (220 ms ease-in). Nothing loops forever except the "You" pin breath and a ringing call. `prefers-reduced-motion`: fades only, 160 ms.
- **Sound**: Web Audio blips in the game's sfx style: unlock "tock", app open "pop", send "whoosh-tick", coin, bell; all silent when muted.

## Icon rules (all 8 read as one set)

| Rule | Value |
| --- | --- |
| Shape | Squircle tile, 64 × 64 viewBox, corner radius 16. |
| Outline | 3 px navy `#1d2140` around the tile; glyph strokes 2.5 px navy. |
| Light | From the **top-left**: tile is a vertical gradient (tint +18% at top to the base colour at bottom), a white gloss crescent across the top-left (opacity .35), glyph has a 2 to 3 px darker shade on its bottom-right side. |
| Palette | One tile colour per app from the game palette; glyphs in paper `#fffdf6`, sun `#ffd166`, red `#e5483b` or ink. Max 3 colours per glyph. |
| Perspective | Straight-on, flat front view, no 3/4 angles inside icons. |
| Detail | One idea per icon, readable at 32 px: no text except the Bank's coin star. |
| Glyph size | Fits a 40 × 40 box centred, optically nudged up 1 px. |

| App | Tile | Glyph |
| --- | --- | --- |
| Phone | green `#3cb371` | paper handset, tilted 20°, with two sound arcs in sun |
| Messages | blue `#2a7bd5` | two overlapping bubbles: paper (back) and sun (front, tail bottom-right) |
| Camera | ink-blue `#2c3550` | paper camera body, sun shutter button, blue lens with a white glint |
| Map | sky `#6fb6ff` | a little green Manhattan island on blue water, red drop pin |
| Contacts | orange `#ff9f1c` | a paper ID card with a navy head-and-shoulders bust |
| Photos | pink `#ff8fc8` | a tilted paper Polaroid holding a sun and skyline |
| Bank | purple `#6a4c93` | the game's gold star coin, a second coin peeking behind |
| Stocks | navy `#1d2140` | rising zigzag in green with a sun dot at the top, faint grid |
| Settings (system) | grey `#8d96a6` | a paper gear with a navy hub |

The game uses the Higgsfield renders of this set (`app/public/art/ifruit/app/`); the hand-drawn SVGs in `app/public/art/ifruit/icons/` follow the same rules and stay as fallbacks (Settings uses its SVG).

## The iFruit mark

Three directions were drawn (SVG, `app/public/art/ifruit/logo-*.svg`):

1. **Pear Tower**: a pear whose leaf is a little spire. Distinctive, but the pear + spire reads "Empire State" more than "phone", and pears sit close to other tech marks.
2. **Citrus Wheel**: an orange slice whose segments are the five boroughs. Clever, but at 16 px it becomes a generic circle and loses the "fruit" read.
3. **Cherry Pair** (chosen): two cherries on stems that meet at one leaf. Two of a kind: the phone is about you and your friends. It is instantly a fruit, nothing like an apple's single bitten silhouette, holds up at 16 px, and works one-colour (embossed on the back) and in full colour (red, green leaf, navy outline, white highlight).

Wordmark: "iFruit" set in Burbank Display, lowercase i, the i's dot replaced by a tiny cherry.
