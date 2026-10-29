"""Cut the Club NYC logo into layers for the animated logo (app/src/ui/logoMotion.ts).

usage: .venv/bin/python tools/logo_layers.py
in:    app/public/art/raw/logo.png (the 2688 px original)
out:   app/public/art/ui/logo/<layer>.webp + layers.json (positions as % of the logo's box)

The logo is one flat picture: seven puffy letters on a navy "sticker" outline, the Empire State Building behind
it, a taxi in front of the last C, three sparkles. To move a piece, whatever it hid has to exist, so:
  - the sticker is rebuilt as one solid navy shape, an offset of the letters (complete behind the taxi and tower),
  - each letter is its own layer (they never touch: the navy runs between them),
  - the C's tip under the taxi is rebuilt (the C's own shape continued, painted in by inpainting).
Stacked at rest, the layers reproduce the original (the script prints the difference).
"""
import json, os
import numpy as np, cv2
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = os.path.join(ROOT, 'app/public/art/raw/logo.png')
OUT = os.path.join(ROOT, 'app/public/art/ui/logo')
SCALE = 0.6  # layers ship at 60% of the original: the logo box is ~1150 px wide, sharp up to ~575 px on 2x screens
NAVY = np.array([1, 15, 58])

im = np.array(Image.open(SRC).convert('RGBA')).astype(np.int32)
rgb, a = im[..., :3], im[..., 3]
H, W = a.shape
lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
solid = a > 16
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
bright = solid & (lum >= 70)
blue = bright & (b > 150) & (b > r + 40)
yellow = bright & (r > 170) & (g > 50) & (b < 120)  # down to the deep orange shading at the letters' bottoms


def disk(rad):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * rad + 1, 2 * rad + 1))


def dilate(m, rad):
    return cv2.dilate(m.astype(np.uint8), disk(rad)) > 0


def fill_holes(m):
    """fill enclosed holes (flood the outside from a border pixel)"""
    m8 = m.astype(np.uint8) * 255
    pad = cv2.copyMakeBorder(m8, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    flood = pad.copy()
    cv2.floodFill(flood, None, (0, 0), 255)
    return m | ((flood[1:-1, 1:-1] == 0))


def hull(m):
    pts = cv2.findNonZero(m.astype(np.uint8))
    out = np.zeros(m.shape, np.uint8)
    cv2.fillConvexPoly(out, cv2.convexHull(pts), 1)
    return out > 0


# ---- the colour blobs: letters, sparkles, taxi body
n, lab, stats, cent = cv2.connectedComponentsWithStats((blue | yellow).astype(np.uint8), 8)
blobs = [(i, stats[i], cent[i]) for i in range(1, n) if stats[i][4] > 3000]


def blob_at(x, y):
    return min(blobs, key=lambda t: (t[2][0] - x) ** 2 + (t[2][1] - y) ** 2)[0]


LETTERS = {'c1': (941, 505), 'l': (1215, 451), 'u': (1515, 431), 'b': (1819, 505), 'n': (965, 950), 'y': (1424, 854), 'c2': (1795, 958)}
STARS = {'star-top': (2003, 369), 'star-right': (2168, 901), 'star-left': (558, 940)}
letter = {}
for k, (x, y) in LETTERS.items():
    m = lab == blob_at(x, y)
    # the glossy highlights are white, so they are holes in the colour blob: fill them, but not the navy counters (B, C)
    holes = fill_holes(m) & ~m
    m = m | (holes & ~(solid & (lum < 70)))
    letter[k] = dilate(m, 3) & solid  # take in the anti-aliased rim
letters = np.any(list(letter.values()), axis=0)

taxi_paint = np.zeros_like(solid)
for i, s, c in blobs:
    if 1850 < c[0] < 2300 and c[1] > 960:
        taxi_paint |= lab == i
taxi_region = hull(dilate(taxi_paint, 34)) & ~letter['c2']
taxi = taxi_region & solid

star = {}
for k, (x, y) in STARS.items():
    m = fill_holes(lab == blob_at(x, y))
    star[k] = dilate(m, 26) & solid & ~letters

# ---- the tower: everything that isn't letter/sticker on the left, with its own outline
tower_paint = bright & ~letters & ~np.any(list(star.values()), axis=0)
tower_paint[:, 800:] = False
tower_paint[900:, :] = False
tower_region = hull(dilate(tower_paint, 30))

# ---- the sticker: the letters' navy outline. Thickness: how far the visible outline reaches past the letters
dist = cv2.distanceTransform((~letters).astype(np.uint8), cv2.DIST_L2, 5)
edge = solid & ~cv2.erode(solid.astype(np.uint8), disk(2)).astype(bool)
outer = edge & ~tower_region & ~taxi_region & ~dilate(np.any(list(star.values()), axis=0), 10)
R = int(np.median(dist[outer]))
visible = solid & ~tower_region & ~taxi & ~np.any(list(star.values()), axis=0)
sticker = fill_holes(cv2.morphologyEx((visible | letters).astype(np.uint8), cv2.MORPH_CLOSE, disk(12)) > 0)
# complete it behind the tower and the taxi with the same offset of the letters, smoothed
behind = dilate(letters, R) & (tower_region | taxi_region)
sticker = sticker | behind
# what's left under the taxi past the letters' own outline is the taxi's (its wheels' outline): hand it over
yy, xx = np.mgrid[0:H, 0:W]
leftover = visible & ~dilate(letters, R + 6) & (xx > 1850) & (yy > 1000)
taxi = taxi | leftover
sticker = (sticker & ~leftover) | behind
sticker = cv2.GaussianBlur(sticker.astype(np.float32), (0, 0), 2.0) > 0.5
print('sticker outline thickness R =', R)

# ---- the C's tip under the taxi: continue the C, then paint it in
c2 = letter['c2']
ys, xs = np.nonzero(c2)
# the C's lower lobe, continued: its hull, only where the taxi sits and below the C's opening
lobe = hull(c2 & (np.arange(H)[:, None] > 1040)) & taxi_region & ~c2
c2_full = c2 | lobe
paint = rgb.copy().astype(np.uint8)
mask = (lobe | (taxi_region & dilate(lobe, 6))).astype(np.uint8) * 255
c2_rgb = cv2.inpaint(paint, mask, 12, cv2.INPAINT_TELEA)

# ---- compose the layer images (RGBA, full canvas), back to front
def layer(m, colour=None, alpha=None):
    out = np.zeros((H, W, 4), np.uint8)
    src = rgb if colour is None else colour
    out[..., :3] = src
    out[..., 3] = np.where(m, a if alpha is None else alpha, 0)
    return out


sticker_rgb = np.where((solid & (lum < 70) & sticker)[..., None], rgb, NAVY).astype(np.uint8)
sticker_alpha = np.where(visible & sticker, a, 255)
layers = [('tower', layer(tower_region & solid & ~dilate(letters, R))),
          ('sticker', layer(sticker, sticker_rgb, sticker_alpha))]
for k in ['c1', 'l', 'u', 'b', 'n', 'y']:
    layers.append((k, layer(letter[k])))
c2_layer = layer(c2_full, np.where(lobe[..., None], c2_rgb, rgb).astype(np.uint8), np.where(lobe, 255, a))
layers.append(('c2', c2_layer))
layers.append(('taxi', layer(taxi)))
for k in STARS:
    layers.append((k, layer(star[k])))

# ---- check: stacked at rest they should be the original
comp = np.zeros((H, W, 4), np.float32)  # premultiplied colour, alpha 0-1
for _, L in layers:
    al = L[..., 3:4] / 255.0
    comp[..., :3] = L[..., :3] * al + comp[..., :3] * (1 - al)
    comp[..., 3:4] = al + comp[..., 3:4] * (1 - al)
diff = np.abs(comp[..., :3] - rgb * (a[..., None] / 255.0))
print('mean difference from the original (0-255):', round(float(diff.mean()), 2), '· pixels off by >40:', int((diff.max(axis=2) > 40).sum()))

# ---- export: crop each layer to its content, positions relative to the logo's box
box = cv2.boundingRect(cv2.findNonZero(np.any([L[..., 3] > 0 for _, L in layers], axis=0).astype(np.uint8)))
bx, by, bw, bh = box
os.makedirs(OUT, exist_ok=True)
meta = {'width': round(bw * SCALE), 'height': round(bh * SCALE), 'layers': []}
for name, L in layers:
    x, y, w, h = cv2.boundingRect(cv2.findNonZero((L[..., 3] > 0).astype(np.uint8)))
    crop = Image.fromarray(L[y:y + h, x:x + w], 'RGBA').resize((max(1, round(w * SCALE)), max(1, round(h * SCALE))), Image.LANCZOS)
    crop.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=92, method=6)
    meta['layers'].append({'id': name, 'x': round((x - bx) / bw * 100, 3), 'y': round((y - by) / bh * 100, 3), 'w': round(w / bw * 100, 3), 'h': round(h / bh * 100, 3)})
# pivots the motion uses (as % of the box): the tower's base (it grows from behind the N), the taxi's rear wheel
meta['pivots'] = {'tower': [round((700 - bx) / bw * 100, 2), round((860 - by) / bh * 100, 2)], 'taxi': [round((1990 - bx) / bw * 100, 2), round((1330 - by) / bh * 100, 2)]}
# the whole logo, flat and cropped to the same box: shown until the layers load, and the mask for the hover shine
al = comp[by:by + bh, bx:bx + bw, 3:4]
flat = Image.fromarray(np.dstack([(comp[by:by + bh, bx:bx + bw, :3] / np.maximum(al, 1e-3)).clip(0, 255), al * 255]).astype(np.uint8), 'RGBA')
flat.resize((meta['width'], meta['height']), Image.LANCZOS).save(os.path.join(OUT, 'full.webp'), 'WEBP', quality=92, method=6)
json.dump(meta, open(os.path.join(OUT, 'layers.json'), 'w'), indent=1)
print('box', box, '→', meta['width'], 'x', meta['height'], '·', len(layers), 'layers')
