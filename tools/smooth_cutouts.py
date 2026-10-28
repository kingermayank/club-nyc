"""Smooth the edges of a room's existing cutout sprites in place (same idea as tools/cutouts.py's smooth(), for rooms
whose tracing spec no longer matches the art in use, e.g. the café). Colors come from the room image, so filled-in
notches show the right pixels.
usage: .venv/bin/python tools/smooth_cutouts.py <room> [<room> ...]"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
for room in sys.argv[1:]:
    geo = json.load(open(os.path.join(ROOT, 'app/src/data/geo', room + '.json')))
    bg = Image.open(os.path.join(ROOT, 'app/public/art/rooms', geo['image'] + '.jpg')).convert('RGB')
    k = bg.width / 1000
    for oid, c in geo['cutouts'].items():
        p = os.path.join(ROOT, 'app/public/art/cutouts', room, oid + '.png')
        if not os.path.exists(p): continue
        sp = Image.open(p).convert('RGBA')
        x, y, w, h = c['rect']
        rgb = bg.crop((round(x * k), round(y * k), round((x + w) * k), round((y + h) * k))).resize(sp.size, Image.LANCZOS)
        m = np.array(sp.getchannel('A')) > 127
        s = 0.75  # these sprites are 2000-wide scale; the tracer works at 2688
        m = ndimage.binary_closing(m, structure=ndimage.generate_binary_structure(2, 1), iterations=3)
        m = ndimage.binary_fill_holes(m)
        hard = ndimage.gaussian_filter(m.astype(np.float32), 6.0 * s) > 0.5
        thick = ndimage.binary_opening(m, structure=ndimage.generate_binary_structure(2, 1), iterations=5)
        thin = m & ~ndimage.binary_dilation(thick, iterations=2)
        hard |= ndimage.gaussian_filter(thin.astype(np.float32), 1.6 * s) > 0.5
        alpha = np.clip(ndimage.gaussian_filter(hard.astype(np.float32), 0.9 * s) * 1.15 - 0.075, 0, 1)
        out = np.dstack([np.array(rgb), (alpha * 255).round().astype(np.uint8)])
        Image.fromarray(out, 'RGBA').save(p, optimize=True)
    print(room, 'smoothed', len(geo['cutouts']), 'sprites')
