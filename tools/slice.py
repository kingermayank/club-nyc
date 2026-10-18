"""Slice a transparent sprite sheet into components (reading order).
usage: slice.py sheet.png outdir name1 name2 ...  (names in reading order; extra comps ignored)"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage
src, outdir, names = sys.argv[1], sys.argv[2], sys.argv[3:]
os.makedirs(outdir, exist_ok=True)
im = Image.open(src).convert('RGBA'); a = np.array(im)[:, :, 3] > 24
# merge nearby bits (sparkles, sound waves) by dilating before labeling
lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=int(os.environ.get('DIL', 14))))
objs = ndimage.find_objects(lab)
boxes = [(s[1].start, s[0].start, s[1].stop, s[0].stop) for s in objs]
boxes = [b for b in boxes if (b[2]-b[0])*(b[3]-b[1]) > 900]
rowh = np.median([b[3]-b[1] for b in boxes])
boxes.sort(key=lambda b: (round(((b[1]+b[3])/2) / rowh), b[0]))
print(len(boxes), 'components')
for name, b in zip(names, boxes):
    pad = 4
    c = im.crop((max(0,b[0]-pad), max(0,b[1]-pad), min(im.width,b[2]+pad), min(im.height,b[3]+pad)))
    s = int(os.environ.get('SIZE', 160)); c.thumbnail((s, s), Image.LANCZOS)
    c.save(os.path.join(outdir, name + '.png'), optimize=True)
    print(name, c.size)
