# Measuring a room (geometry + traced cutouts)

Every room background is a 16:9 illustration. All coordinates use a **logical 1000 × 565 space** (x right, y down).
You produce one spec file per room, run the tracer, and check the QA overlay.

## Tools (run from the project root)

```bash
.venv/bin/python tools/grid.py <image>                 # full image with a labeled grid  -> tools/out/grid-<image>.jpg
.venv/bin/python tools/grid.py <image> x1 y1 x2 y2     # zoomed crop with a finer grid   -> tools/out/grid-<image>-crop.jpg
.venv/bin/python tools/cutouts.py <room>               # trace objects with SAM 2         -> tools/out/<room>-overlay.jpg
```

`<image>` is a file name in `app/public/art/raw/` without `.png`. Look at the grid images with the Read tool.
Use the zoomed crop whenever you need precision (box edges, seat points, piano corners).
Run the tracer ONE room at a time (it loads a 1 GB model; don't run several in parallel yourself).

## Spec file: `tools/rooms/<room>.json`

See `tools/rooms/brooklyn-bridge.json` for a finished example.

```jsonc
{
  "image": "brooklyn-bridge-v2",
  "walk":  [[x,y], ...],          // walkable FLOOR polygon (where feet can go). Follow the floor edge closely:
                                  // stay off walls, counters, railings, water, grass you shouldn't stand in.
                                  // Bottom edge at y≈548 (a toolbar covers the very bottom).
  "holes": [[[x,y],...], ...],    // FOOTPRINTS of floor-standing obstacles inside the walk area
                                  // (cart wheels/legs, tables, benches, planters) — the floor patch they occupy,
                                  // a flat quad around where they touch the ground, NOT their whole silhouette.
  "spawn": [x,y],                 // default arrival point, open floor near the middle-front
  "depth": [yFar, sFar, yNear, sNear],
                                  // avatar scale by feet-y. A person is 105 px tall at scale 1.0.
                                  // Estimate sFar from a door/person-sized object near the far edge of the floor:
                                  // a door is ~1.45 x a person. sNear is usually 1.0 at y≈540.
  "objects": {
    "<id>": {
      "box":  [x1,y1,x2,y2],      // TIGHT box around the whole object (include its outline)
      "at":   [x,y],              // floor point (inside walk) where the avatar stands to use it. Required unless
                                  // the object is far away/decorative (sky, building tops, wall signs out of reach).
      "fg":   true,               // set for objects that STAND ON THE FLOOR inside/at the edge of the walk area
                                  // (carts, benches, tables, statues, planters) so the avatar can walk behind them
      "points": [[x,y]], "neg": [[x,y]],  // optional SAM hints if the trace grabs too much/too little
      "whole": true               // optional: no tracing, keep the box (flat things like a sign painted on a wall)
    }
  },
  "seats":  { "<id>": {"sit": [x,y], "stand": [x,y]} },
                                  // sit  = point on the seat surface where the person's HIPS rest (seat top, centered)
                                  // stand = floor point (inside walk) right in front of the seat
  "zones":  { "<id>": [x1,y1,x2,y2] },
                                  // invisible click areas: exits with no visible object (an open edge of the street,
                                  // a hallway), or big flat areas. Prefer real objects when something is visible.
  "screens":{ "<id>": [[x,y],[x,y],[x,y],[x,y]] },
                                  // flat rectangular surfaces seen in perspective (billboards, a stage opening):
                                  // corners in order top-left, top-right, bottom-right, bottom-left
  "ice":    [[x,y], ...],         // (rink only) the ice surface polygon
  "piano":  {"corners": [[x,y]x4], "whiteKeys": n}   // (toy store only) the floor piano's 4 corners TL,TR,BR,BL
}
```

## What "good" looks like

- Each object id from your list exists, is traced as ONE clean shape matching the object's silhouette, and doesn't
  swallow neighbours (fix with a tighter box, `neg` points on the neighbour, or `points` on missed parts).
- Exit arrow signs and doors are objects. Their `at` point is right next to them, on the floor.
- The walk polygon matches the visible floor; holes sit exactly under floor objects.
- In the overlay (`tools/out/<room>-overlay.jpg`): green = walk, red = holes, colored fills = objects with labels,
  dots = `at` points, yellow dots = seats, white square = spawn, cyan = screens/piano, orange = zones.
  Open the overlay, check it carefully, fix and re-run until it's right.

Report back: for each room, the object ids you created (and any you couldn't), seats, zones, screens, and anything odd.
