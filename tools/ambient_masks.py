"""
Ambient layer assets (app/src/features/ambient.ts).

For each room with open water, finds the water in the room's painting by colour and writes a soft mask
(app/public/art/fx/water-<room>.png) that the shimmer is drawn through. For each small animal that moves (the park's
ducks, the pigeons, the gull), samples the ground colour around it, so the copy painted into the background can be
covered while the cutout flies or swims off. Writes app/src/data/ambient.json.

    .venv/bin/python tools/ambient_masks.py
"""
import json, os, colorsys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..', 'app')
W, H = 1000, 565
# room id -> (background file, the band of the picture the water is in: x1, y1, x2, y2 in stage px)
WATER = {
    'central-park': ('central-park', (270, 140, 730, 280)),
    'battery-park': ('battery-park', (0, 150, 1000, 345)),
    'liberty-island': ('liberty-island-v2', (0, 186, 960, 335)),
    'brooklyn-bridge': ('brooklyn-bridge-v2', (0, 212, 1000, 305)),
}
# room id -> the cutouts that move
CRITTERS = {
    'central-park': ['duck-1', 'duck-2', 'duck-3'],
    'times-square': ['pigeon-1', 'pigeon-2', 'pigeon-3'],
    'wall-street': ['pigeon-1', 'pigeon-2'],
    'battery-park': ['gull'],
}

def load(bg):
    return Image.open(os.path.join(ROOT, 'public/art/rooms', bg + '.jpg')).convert('RGB').resize((W, H), Image.LANCZOS)

def water_mask(img, band):
    a = np.asarray(img).astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    # blue-dominant, saturated, not too dark: the painted water (the sky is kept out by the band)
    m = (b > r * 1.45) & (b > g * 1.08) & (sat > 0.5) & (mx > 0.42)
    out = np.zeros((H, W), np.uint8)
    x1, y1, x2, y2 = band
    out[y1:y2, x1:x2] = m[y1:y2, x1:x2] * 255
    im = Image.fromarray(out).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(2.2))
    return im

def ground(img, rect):
    """the typical colour just outside a cutout's box"""
    x, y, w, h = [int(round(v)) for v in rect]
    a = np.asarray(img)
    pad = 5
    ring = []
    for yy in range(max(0, y - pad), min(H, y + h + pad)):
        for xx in range(max(0, x - pad), min(W, x + w + pad)):
            if x <= xx < x + w and y <= yy < y + h:
                continue
            ring.append(a[yy, xx])
    c = np.median(np.array(ring), axis=0).astype(int)
    return '#%02x%02x%02x' % tuple(c)

def main():
    os.makedirs(os.path.join(ROOT, 'public/art/fx'), exist_ok=True)
    data = {'water': [], 'ground': {}}
    for room, (bg, band) in WATER.items():
        m = water_mask(load(bg), band)
        rgba = Image.new('RGBA', (W, H), (255, 255, 255, 0))
        rgba.putalpha(m)
        rgba.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(ROOT, 'public/art/fx', f'water-{room}.png'), optimize=True)
        data['water'].append(room)
        print(room, 'water covers', round(float(np.asarray(m).mean()) / 255 * 100, 1), '% of the picture')
    for room, ids in CRITTERS.items():
        geo = json.load(open(os.path.join(ROOT, 'src/data/geo', room + '.json')))
        bg = WATER[room][0] if room in WATER else None
        if not bg:
            import re
            src = open(os.path.join(ROOT, 'src/data/rooms.ts')).read()
            bg = re.search(r"id: '%s',[^\n]*?bg: '([^']+)'" % re.escape(room), src).group(1)
        img = load(bg)
        data['ground'][room] = {i: ground(img, geo['cutouts'][i]['rect']) for i in ids if i in geo['cutouts']}
    json.dump(data, open(os.path.join(ROOT, 'src/data/ambient.json'), 'w'), indent=1)
    print(json.dumps(data['ground']))

main()
