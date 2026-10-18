"""Trace interactive objects in a room background with SAM 2 and export cutout sprites.

usage: .venv/bin/python tools/cutouts.py <room> [<room> ...]

Reads   tools/rooms/<room>.json
Writes  app/public/art/cutouts/<room>/<id>.png      (RGBA, 2000px-wide scale)
        app/src/data/geo/<room>.json                 (spec geometry + traced cutout rects, logical coords)
        tools/out/<room>-overlay.jpg                 (QA image: masks tinted + labels + walk polygon)

Room spec format (all coords in the 1000 x 565 logical space):
{
  "image": "times-square-v2",            # file in app/public/art/raw/<image>.png
  "walk": [[x, y], ...],                  # walkable floor polygon
  "holes": [[[x, y], ...], ...],          # optional: obstacle footprints inside the floor
  "objects": {
    "<id>": {"box": [x1, y1, x2, y2],     # tight box around the object
             "points": [[x, y], ...],     # optional: extra clicks ON the object
             "neg": [[x, y], ...],        # optional: clicks on things to EXCLUDE
             "whole": true}               # optional: skip SAM, keep the full box (for flat signs)
  },
  "seats": {"<id>": [x, y]}               # optional: where an avatar sits
}
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
RAW = os.path.join(ROOT, 'app', 'public', 'art', 'raw')
OUT_ART = os.path.join(ROOT, 'app', 'public', 'art', 'cutouts')
GEO = os.path.join(ROOT, 'app', 'src', 'data', 'geo')
QA = os.path.join(HERE, 'out')
LOGICAL_W = 1000
EXPORT_W = 2000  # matches app/public/art/rooms/*.jpg

_model = None


def model():
    global _model
    if _model is None:
        from ultralytics import SAM
        _model = SAM(os.path.join(ROOT, 'scratch', 'sam2.1_l.pt'))
    return _model


def segment(img_np, k, spec):
    x1, y1, x2, y2 = spec['box']
    box = [x1 * k, y1 * k, x2 * k, y2 * k]
    H, W = img_np.shape[:2]
    if spec.get('whole'):
        m = np.zeros((H, W), bool)
        m[int(box[1]):int(box[3]), int(box[0]):int(box[2])] = True
        return m
    kwargs = {'bboxes': [box], 'verbose': False}
    pts = [[px * k, py * k] for px, py in spec.get('points', [])]
    neg = [[px * k, py * k] for px, py in spec.get('neg', [])]
    if pts or neg:
        kwargs['points'] = [pts + neg]
        kwargs['labels'] = [[1] * len(pts) + [0] * len(neg)]
    r = model()(img_np, **kwargs)[0]
    m = r.masks.data[0].cpu().numpy() > 0.5
    if m.shape != (H, W):
        m = np.array(Image.fromarray(m.astype(np.uint8) * 255).resize((W, H))) > 127
    # keep only inside a slightly padded box
    pad = 6 * k
    clip = np.zeros_like(m)
    clip[max(0, int(box[1] - pad)):int(box[3] + pad), max(0, int(box[0] - pad)):int(box[2] + pad)] = True
    m &= clip
    # drop specks: keep components >= 3% of the largest
    lab, n = ndimage.label(m)
    if n > 1:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= 0.03 * sizes.max()]
        m = np.isin(lab, keep)
    m = ndimage.binary_fill_holes(m)
    m = ndimage.binary_dilation(m, iterations=max(1, int(1.5 * k)))  # include the dark outline
    return m


def run(room):
    spec = json.load(open(os.path.join(HERE, 'rooms', room + '.json')))
    src = Image.open(os.path.join(RAW, spec['image'] + '.png')).convert('RGB')
    img_np = np.array(src)
    k = src.width / LOGICAL_W
    export_k = EXPORT_W / src.width
    os.makedirs(os.path.join(OUT_ART, room), exist_ok=True)
    entries = {}
    overlay = src.copy().convert('RGBA')
    tint_layer = Image.new('RGBA', src.size, (0, 0, 0, 0))
    colors = [(255, 64, 160), (64, 200, 255), (255, 200, 40), (90, 230, 120), (180, 120, 255), (255, 120, 60)]
    labels = []
    for i, (oid, ospec) in enumerate(spec.get('objects', {}).items()):
        m = segment(img_np, k, ospec)
        ys, xs = np.nonzero(m)
        if len(xs) == 0:
            print(f'  ! {oid}: empty mask')
            continue
        bx1, by1, bx2, by2 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        rgba = np.dstack([img_np, (m * 255).astype(np.uint8)])[by1:by2, bx1:bx2]
        sprite = Image.fromarray(rgba, 'RGBA')
        sprite = sprite.resize((max(1, round(sprite.width * export_k)), max(1, round(sprite.height * export_k))), Image.LANCZOS)
        sprite.save(os.path.join(OUT_ART, room, oid + '.png'), optimize=True)
        entries[oid] = {'rect': [round(float(bx1) / k, 1), round(float(by1) / k, 1), round(float(bx2 - bx1) / k, 1), round(float(by2 - by1) / k, 1)]}
        entries[oid].update({kk: vv for kk, vv in ospec.items() if kk in ('at', 'fg', 'base')})
        c = colors[i % len(colors)]
        t = np.zeros((src.height, src.width, 4), np.uint8)
        t[m] = (*c, 110)
        edge = m ^ ndimage.binary_erosion(m, iterations=3)
        t[edge] = (*c, 255)
        tint_layer = Image.alpha_composite(tint_layer, Image.fromarray(t, 'RGBA'))
        labels.append((oid, (bx1 + bx2) / 2, by1, c))
        if 'at' in ospec:
            ax, ay = ospec['at']
            tint_layer_draw = ImageDraw.Draw(tint_layer)
            tint_layer_draw.ellipse([ax * k - 9, ay * k - 9, ax * k + 9, ay * k + 9], fill=(*c, 255), outline=(255, 255, 255, 255), width=3)
        print(f'  {oid}: {entries[oid]}')
    geo = {k2: v for k2, v in spec.items() if k2 != 'objects'}
    geo['cutouts'] = entries
    os.makedirs(GEO, exist_ok=True)
    with open(os.path.join(GEO, room + '.json'), 'w') as f:
        json.dump(geo, f, indent=1)

    overlay = Image.alpha_composite(overlay, tint_layer)
    d = ImageDraw.Draw(overlay)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 30)
    except Exception:
        font = ImageFont.load_default()
    if spec.get('walk'):
        d.line([(x * k, y * k) for x, y in spec['walk'] + spec['walk'][:1]], fill=(0, 255, 120, 255), width=5)
    for hole in spec.get('holes', []):
        d.line([(x * k, y * k) for x, y in hole + hole[:1]], fill=(255, 40, 40, 255), width=5)
    for quad in list(spec.get('screens', {}).values()) + ([spec['piano']['corners']] if 'piano' in spec else []):
        d.line([(x * k, y * k) for x, y in quad + quad[:1]], fill=(0, 200, 255, 255), width=5)
    if spec.get('ice'):
        d.line([(x * k, y * k) for x, y in spec['ice'] + spec['ice'][:1]], fill=(160, 220, 255, 255), width=5)
    for zone in spec.get('zones', {}).values():
        z = zone if isinstance(zone[0], list) else [[zone[0], zone[1]], [zone[2], zone[1]], [zone[2], zone[3]], [zone[0], zone[3]]]
        d.line([(x * k, y * k) for x, y in z + z[:1]], fill=(255, 140, 0, 255), width=5)
    for sid, seat in spec.get('seats', {}).items():
        sx, sy = seat['sit']
        d.ellipse([sx * k - 10, sy * k - 10, sx * k + 10, sy * k + 10], fill=(255, 255, 0, 255), outline=(0, 0, 0, 255), width=3)
        if 'stand' in seat:
            tx, ty = seat['stand']
            d.line([(sx * k, sy * k), (tx * k, ty * k)], fill=(255, 255, 0, 255), width=3)
    if spec.get('spawn'):
        px, py = spec['spawn']
        d.rectangle([px * k - 9, py * k - 9, px * k + 9, py * k + 9], fill=(255, 255, 255, 255), outline=(0, 0, 0, 255), width=3)
    for oid, cx, top, c in labels:
        tw = d.textlength(oid, font=font)
        d.rectangle([cx - tw / 2 - 6, top - 38, cx + tw / 2 + 6, top - 4], fill=(0, 0, 0, 200))
        d.text((cx - tw / 2, top - 37), oid, fill=c, font=font)
    os.makedirs(QA, exist_ok=True)
    overlay.convert('RGB').resize((1400, round(src.height * 1400 / src.width))).save(os.path.join(QA, room + '-overlay.jpg'), quality=82)
    print(f'{room}: {len(entries)} cutouts -> tools/out/{room}-overlay.jpg')


if __name__ == '__main__':
    # several agents may trace rooms at once: queue up for the (1 GB) model instead of loading it N times
    import fcntl
    os.makedirs(QA, exist_ok=True)
    with open(os.path.join(QA, '.sam.lock'), 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        for r in sys.argv[1:]:
            run(r)
