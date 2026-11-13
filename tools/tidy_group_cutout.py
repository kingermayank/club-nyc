"""Give a cutout made of many small pieces (a row of flags) one clean hover shape.

SAM traces each flag separately and raggedly, so the white hover outline (a drop-shadow of the sprite's alpha) looks
torn. This replaces the sprite with a single smooth band around the whole group: the convex hull of the traced pieces,
grown a little and rounded, filled with the room's own pixels. The geo rect is updated to the new sprite.

usage: .venv/bin/python tools/tidy_group_cutout.py <room> <cutout> [<cutout> ...]      then tools/webp.py
"""
import json, os, sys
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PAD = 14   # px (sprite scale, 2 per stage unit) of room around the shape
GROW = 7   # how far the band stands off the flags
ROUND = 9  # corner rounding

room, names = sys.argv[1], sys.argv[2:]
geo_path = os.path.join(ROOT, 'app/src/data/geo', room + '.json')
geo = json.load(open(geo_path))
art = Image.open(os.path.join(ROOT, 'app/public/art/rooms', geo['image'] + '.jpg')).convert('RGB')
k = art.width / 1000
for name in names:
    p = os.path.join(ROOT, 'app/public/art/cutouts', room, name + '.png')
    x, y, w, h = geo['cutouts'][name]['rect']
    old = Image.open(p).convert('RGBA')
    px, py = round(x * k), round(y * k)
    W, H = old.width + PAD * 2, old.height + PAD * 2
    m = np.zeros((H, W), np.uint8)
    m[PAD:PAD + old.height, PAD:PAD + old.width] = (np.asarray(old)[:, :, 3] > 127) * 255
    hull = cv2.convexHull(cv2.findNonZero(m))
    S = 4
    big = np.zeros((H * S, W * S), np.uint8)
    cv2.fillPoly(big, [hull * S], 255)
    big = cv2.dilate(big, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (GROW * 2 * S + 1, GROW * 2 * S + 1)))
    # round the corners: blur and re-threshold, then a soft anti-aliased edge
    big = cv2.GaussianBlur(big, (0, 0), ROUND * S)
    big = ((big > 127) * 255).astype(np.uint8)
    alpha = cv2.resize(big, (W, H), interpolation=cv2.INTER_AREA)
    crop = art.crop((px - PAD, py - PAD, px - PAD + W, py - PAD + H)).convert('RGBA')
    crop.putalpha(Image.fromarray(alpha))
    box = crop.getbbox()
    crop = crop.crop(box)
    crop.save(p)
    geo['cutouts'][name]['rect'] = [round((px - PAD + box[0]) / k, 1), round((py - PAD + box[1]) / k, 1), round(crop.width / k, 1), round(crop.height / k, 1)]
    print(name, geo['cutouts'][name]['rect'])
json.dump(geo, open(geo_path, 'w'), indent=1)
