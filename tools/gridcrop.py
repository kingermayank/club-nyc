"""Split an image laid out as a rows x cols grid with white gutters.
usage: gridcrop.py <raw-name> rows cols outdir name1 name2 ...   (names in reading order)"""
import sys, os
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
name, rows, cols, outdir, names = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5:]
im = Image.open(os.path.join(HERE, '..', 'app', 'public', 'art', 'raw', name + '.png')).convert('RGB')
a = np.asarray(im).astype(np.float32).mean(axis=2)
H, W = a.shape
def cuts(profile, n, size):
    out = [0]
    for k in range(1, n):
        c = size * k / n
        lo, hi = int(c - size * 0.08), int(c + size * 0.08)
        out.append(lo + int(np.argmax(profile[lo:hi])))
    out.append(size)
    return out
xs = cuts(a.mean(axis=0), cols, W)
ys = cuts(a.mean(axis=1), rows, H)
os.makedirs(outdir, exist_ok=True)
i = 0
for r in range(rows):
    for c in range(cols):
        if i >= len(names): break
        cell = np.asarray(im)[ys[r]:ys[r+1], xs[c]:xs[c+1]]
        g = cell.astype(np.float32).mean(axis=2)
        mask = g < 238
        yy, xx = np.nonzero(mask)
        crop = Image.fromarray(cell[yy.min():yy.max()+1, xx.min():xx.max()+1])
        crop.thumbnail((900, 900), Image.LANCZOS)
        crop.save(os.path.join(outdir, names[i] + '.jpg'), quality=86)
        print(names[i], crop.size)
        i += 1
