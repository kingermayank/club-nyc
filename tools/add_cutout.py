"""Trace ONE more object in a room that is already traced, leaving the room's other cutouts (and any hand fixes to
them) alone. Add the object to tools/rooms/<room>.json first, then:

    .venv/bin/python tools/add_cutout.py <room> <id> [<id> ...]

Writes app/public/art/cutouts/<room>/<id>.png (+ .webp) and adds the rect to app/src/data/geo/<room>.json."""
import json, os, sys
import numpy as np
from PIL import Image
import cutouts as C

room, ids = sys.argv[1], sys.argv[2:]
spec = json.load(open(os.path.join(C.HERE, 'rooms', room + '.json')))
src = Image.open(os.path.join(C.RAW, spec['image'] + '.png')).convert('RGB')
img = np.array(src)
k = src.width / C.LOGICAL_W
ek = C.EXPORT_W / src.width
geo_path = os.path.join(C.GEO, room + '.json')
geo = json.load(open(geo_path))
for oid in ids:
    o = spec['objects'][oid]
    alpha, _ = C.smooth(C.segment(img, k, o))
    ys, xs = np.nonzero(alpha > 0.02)
    x1, y1, x2, y2 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    sprite = Image.fromarray(np.dstack([img, (alpha * 255).round().astype(np.uint8)])[y1:y2, x1:x2], 'RGBA')
    sprite = sprite.resize((max(1, round(sprite.width * ek)), max(1, round(sprite.height * ek))), Image.LANCZOS)
    out = os.path.join(C.OUT_ART, room, oid + '.png')
    sprite.save(out, optimize=True)
    sprite.save(out + '.webp', 'WEBP', quality=90)
    e = {'rect': [round(float(x1) / k, 1), round(float(y1) / k, 1), round(sprite.width / ek / k, 2), round(sprite.height / ek / k, 2)]}
    e.update({a: b for a, b in o.items() if a in ('at', 'fg', 'base')})
    geo['cutouts'][oid] = e
    print(oid, e)
json.dump(geo, open(geo_path, 'w'), indent=1)
