"""Straighten the hover outlines of a room's cutout sprites (the user, 2026-11-11: "very wavy… keep them more straight…
a more clear line rather than this broken, curvy thing").

The sprites' edges come from SAM 2 masks, which follow the painting's texture, so the white hover outline (a drop-shadow
of the sprite's alpha) wobbles. This redraws each sprite's edge as a clean polygon:
  1. close small notches and fill holes (the outline goes around the object, not into every crack),
  2. trace the outer edge and simplify it (Douglas-Peucker): jitter becomes straight runs with crisp corners, while the
     object's real shape (a roofline, a lamp, a tree's crown) stays,
  3. fill it again with the room's own pixels (so anything newly inside the shape looks exactly like the room).
The sprite keeps its size and position; only its alpha (and the colours under it) change.

usage: .venv/bin/python tools/straighten_cutouts.py [--dry <outdir>] <room> [<room> ...] | --all
  --dry writes before/after outline previews to <outdir> instead of touching the sprites.
Afterwards run tools/webp.py for the rooms' cutouts (the game loads the .png.webp twins)."""
import json, os, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SS = 4  # supersampling for smooth polygon edges


def straight_alpha(alpha: np.ndarray) -> np.ndarray:
    m = alpha > 127
    h, w = m.shape
    size = max(w, h)
    # 1. close notches and channels (scaled to the sprite: thin gaps the tracer left, like around a sign or between
    #    lamps, fold into one clean shape) and fill holes
    r = max(3, round(size * 0.045))
    m = ndimage.binary_closing(np.pad(m, r + 1), structure=np.ones((3, 3)), iterations=r)[r + 1:-r - 1, r + 1:-r - 1]
    m = ndimage.binary_fill_holes(m)
    # drop specks: keep pieces at least 3% of the biggest
    lab, n = ndimage.label(m)
    if n > 1:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= 0.03 * sizes.max()]
        m = np.isin(lab, keep)
    # 2. trace each piece's outer edge and simplify it
    cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    canvas = Image.new('L', (w * SS, h * SS), 0)
    d = ImageDraw.Draw(canvas)
    for c in cs:
        peri = cv2.arcLength(c, True)
        eps = min(max(peri * 0.006, 2.0), size * 0.02)
        poly = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        if len(poly) < 3:
            continue
        d.polygon([((x + 0.5) * SS, (y + 0.5) * SS) for x, y in poly], fill=255)
    # 3. back to sprite size: an anti-aliased, straight edge
    return np.array(canvas.resize((w, h), Image.LANCZOS))


def outline_preview(rgba: Image.Image, bg: Image.Image) -> Image.Image:
    """the sprite over its room crop with a 2px white outline + glow, like .cutout.hover"""
    a = np.array(rgba.getchannel('A')) > 127
    ring = ndimage.binary_dilation(a, iterations=3) & ~a
    out = np.array(bg.convert('RGB')).copy()
    out[ring] = [255, 255, 255]
    return Image.fromarray(out)


def run(room: str, dry: str | None):
    geo = json.load(open(os.path.join(ROOT, 'app/src/data/geo', room + '.json')))
    bg = Image.open(os.path.join(ROOT, 'app/public/art/rooms', geo['image'] + '.jpg')).convert('RGB')
    k = bg.width / 1000
    done = 0
    for oid, c in geo['cutouts'].items():
        p = os.path.join(ROOT, 'app/public/art/cutouts', room, oid + '.png')
        if not os.path.exists(p):
            continue
        sp = Image.open(p).convert('RGBA')
        x, y, w, h = c['rect']
        rgb = bg.crop((round(x * k), round(y * k), round((x + w) * k), round((y + h) * k))).resize(sp.size, Image.LANCZOS)
        alpha = straight_alpha(np.array(sp.getchannel('A')))
        new = Image.fromarray(np.dstack([np.array(rgb), alpha]), 'RGBA')
        if dry:
            os.makedirs(dry, exist_ok=True)
            a, b = outline_preview(sp, rgb), outline_preview(new, rgb)
            pair = Image.new('RGB', (a.width * 2 + 10, a.height), 'black')
            pair.paste(a, (0, 0))
            pair.paste(b, (a.width + 10, 0))
            pair.save(os.path.join(dry, f'{room}--{oid}.png'))
        else:
            new.save(p, optimize=True)
        done += 1
    print(room, 'straightened' if not dry else 'previewed', done, 'sprites')


if __name__ == '__main__':
    args = sys.argv[1:]
    dry = None
    if args and args[0] == '--dry':
        dry, args = args[1], args[2:]
    if args == ['--all']:
        args = sorted(r for r in os.listdir(os.path.join(ROOT, 'app/public/art/cutouts')) if os.path.exists(os.path.join(ROOT, 'app/src/data/geo', r + '.json')))
    for room in args:
        run(room, dry)
