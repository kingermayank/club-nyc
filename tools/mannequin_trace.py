"""Trace every piece a boutique mannequin wears (SAM 2), so the hover glow follows the painted outline.

usage: .venv/bin/python tools/mannequin_trace.py
Reads   app/public/art/closeups/<art>.jpg and the prompts below (1000 x 565.5 logical coords)
Writes  app/src/data/mannequins.json   { look: { art, pieces: [{ item, d, box }] } }  (d = an SVG path, evenodd)
        tools/out/mannequin-<look>.jpg  (QA overlay)
A piece's prompt: box around it, points ON it, neg = points on what to leave out. holes=True keeps see-through gaps
(the loop of a bag handle).
"""
import json, os, sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
sys.path.insert(0, HERE)
from cutouts import model  # noqa: E402

LOOKS = {
    'maison-1': ('maison-mannequin-1', [
        ('midnight-gown', dict(box=[368, 158, 614, 522], points=[[490, 250], [490, 420], [400, 250], [575, 250], [430, 480], [560, 480]], neg=[[382, 338], [566, 318], [592, 332], [490, 538], [480, 185]])),
        ('wide-brim', dict(box=[338, 0, 624, 138], points=[[480, 22], [380, 95], [590, 70], [430, 125]], neg=[[490, 122], [455, 92], [512, 92]])),
        ('cat-eye', dict(box=[427, 75, 536, 113], points=[[455, 93], [511, 92], [483, 86]])),
        ('diamond-choker', dict(box=[453, 149, 503, 169], points=[[478, 160], [462, 158], [494, 158]])),
        ('gold-clutch', dict(box=[558, 301, 629, 358], points=[[596, 334]], neg=[[571, 316]])),
    ]),
    'maison-2': ('maison-mannequin-2', [
        ('camel-coat', dict(box=[345, 138, 622, 502], points=[[400, 300], [560, 250], [420, 440], [540, 440], [372, 312], [585, 300], [430, 180], [530, 180]], neg=[[480, 220], [480, 400], [490, 180], [590, 400], [612, 328], [370, 356], [562, 330]])),
        ('fedora', dict(box=[390, 0, 574, 92], points=[[480, 25], [415, 66], [548, 66], [480, 45]], neg=[[460, 82], [512, 80], [480, 105]])),
        ('aviators', dict(box=[431, 66, 536, 103], points=[[460, 82], [512, 80], [486, 72]])),
        ('silk-scarf', dict(box=[446, 124, 526, 248], points=[[470, 140], [500, 200], [505, 140], [492, 230]], neg=[[462, 215], [520, 160]])),
        ('monogram-tote', dict(box=[535, 262, 650, 474], points=[[590, 410], [565, 290], [555, 320], [592, 350]], neg=[[612, 325], [572, 318]], holes=True)),
    ]),
    'maison-3': ('maison-mannequin-3', [
        ('tweed-jacket', dict(box=[357, 138, 618, 324], points=[[420, 200], [560, 200], [380, 290], [592, 290], [440, 270], [540, 270], [487, 220]], neg=[[487, 150], [480, 340], [366, 335], [608, 330], [487, 300]])),
        ('pillbox', dict(box=[428, 0, 534, 62], points=[[480, 30]], neg=[[480, 80]])),
        ('pearls', dict(box=[449, 130, 523, 167], points=[[462, 148], [512, 148], [487, 160], [472, 157], [502, 157]], neg=[[487, 138]])),
        ('mini-trunk', dict(box=[558, 336, 656, 442], points=[[606, 400], [585, 348]], neg=[[604, 328]], holes=True)),
    ]),
    'thread': ('thread-mannequin', [
        ('windbreaker', dict(box=[330, 116, 642, 372], points=[[400, 220], [560, 220], [420, 320], [360, 300], [612, 300], [520, 260], [440, 150], [530, 150], [452, 134], [524, 134]], neg=[[468, 262], [550, 330], [487, 168], [487, 140], [350, 395], [628, 395]])),
        ('bucket-hat', dict(box=[412, 0, 566, 104], points=[[485, 35], [428, 86], [552, 86]], neg=[[487, 78], [487, 110]])),
        ('sport-shades', dict(box=[435, 62, 543, 93], points=[[487, 77], [460, 76], [515, 76]])),
        ('silver-chain', dict(box=[452, 138, 524, 181], points=[[459, 150], [517, 150], [487, 171], [470, 165], [505, 165]], neg=[[487, 150]], holes=True)),
        ('sling-bag', dict(box=[422, 152, 598, 380], points=[[550, 330], [450, 205], [480, 255], [432, 172]], neg=[[500, 190], [430, 300], [600, 250]])),
    ]),
}
W = 1000


def trace(img, k, spec):
    x1, y1, x2, y2 = spec['box']
    box = [x1 * k, y1 * k, x2 * k, y2 * k]
    pts = [[x * k, y * k] for x, y in spec.get('points', [])]
    neg = [[x * k, y * k] for x, y in spec.get('neg', [])]
    r = model()(img, bboxes=[box], points=[pts + neg], labels=[[1] * len(pts) + [0] * len(neg)], verbose=False)[0]
    m = r.masks.data[0].cpu().numpy() > 0.5
    H, Wp = img.shape[:2]
    if m.shape != (H, Wp):
        m = np.array(Image.fromarray(m.astype(np.uint8) * 255).resize((Wp, H))) > 127
    pad = int(4 * k)
    clip = np.zeros_like(m)
    clip[max(0, int(box[1]) - pad):int(box[3]) + pad, max(0, int(box[0]) - pad):int(box[2]) + pad] = True
    m &= clip
    lab, n = ndimage.label(m)
    if n > 1:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 0.04 * sizes.max()])
    m = ndimage.binary_closing(m, iterations=int(1.5 * k))
    if not spec.get('holes'):
        m = ndimage.binary_fill_holes(m)
    else:
        # keep only real gaps, not pinholes
        holes = ndimage.binary_fill_holes(m) & ~m
        hl, hn = ndimage.label(holes)
        for i in range(1, hn + 1):
            if (hl == i).sum() < (14 * k) ** 2 / 4:
                m |= hl == i
    return ndimage.binary_dilation(m, iterations=max(1, int(1.2 * k)))  # out to the ink line


def path(m, k):
    cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    d = []
    for c in cs:
        if cv2.contourArea(c) < (5 * k) ** 2:
            continue
        c = cv2.approxPolyDP(c, 0.45 * k, True)[:, 0, :] / k
        d.append('M' + ' '.join(f'{x:.1f},{y:.1f}' for x, y in c) + 'Z')
    return ''.join(d)


def main():
    out = {}
    for look, (art, pieces) in LOOKS.items():
        im = Image.open(os.path.join(ROOT, 'app/public/art/closeups', art + '.jpg')).convert('RGB')
        img = np.array(im)
        k = im.width / W
        qa = img.copy().astype(float)
        rows = []
        cols = [(255, 60, 60), (60, 200, 255), (255, 220, 0), (120, 255, 120), (255, 120, 255)]
        for i, (item, spec) in enumerate(pieces):
            m = trace(img, k, spec)
            ys, xs = np.where(m)
            rows.append({'item': item, 'd': path(m, k), 'box': [round(float(v) / k, 1) for v in (xs.min(), ys.min(), xs.max(), ys.max())]})
            edge = m ^ ndimage.binary_erosion(m, iterations=3)
            qa[m] = qa[m] * 0.6 + np.array(cols[i % 5]) * 0.4
            qa[edge] = cols[i % 5]
            print(look, item, int(m.sum() / k / k), 'px²', len(rows[-1]['d']), 'chars')
        out[look] = {'art': art, 'pieces': rows}
        os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
        Image.fromarray(qa.astype(np.uint8)).crop((int(300 * k), 0, int(700 * k), im.height)).save(os.path.join(HERE, 'out', f'mannequin-{look}.jpg'), quality=88)
    with open(os.path.join(ROOT, 'app/src/data/mannequins.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))


main()
