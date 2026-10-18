"""Render a room image with a labeled coordinate grid (logical 1000-wide space) for measuring.
usage: grid.py <image-name> [x1 y1 x2 y2]   -> tools/out/grid-<image>[-crop].jpg
Grid lines every 25 units (labels every 50). With a crop region the view is zoomed."""
import sys, os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
name = sys.argv[1]
src = Image.open(os.path.join(HERE, '..', 'app', 'public', 'art', 'raw', name + '.png')).convert('RGB')
k = src.width / 1000
H = src.height / k
x1, y1, x2, y2 = (map(float, sys.argv[2:6]) if len(sys.argv) >= 6 else (0, 0, 1000, H))
crop = src.crop((int(x1 * k), int(y1 * k), int(x2 * k), int(y2 * k)))
outw = 1400
s = outw / (x2 - x1)
im = crop.resize((outw, round((y2 - y1) * s)), Image.LANCZOS)
d = ImageDraw.Draw(im, 'RGBA')
try:
    f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 15)
except Exception:
    f = ImageFont.load_default()
step = 25 if (x2 - x1) > 300 else 10
lab = 50 if step == 25 else 20
v = (int(x1) // step) * step
while v <= x2:
    X = (v - x1) * s
    if X >= 0:
        d.line([(X, 0), (X, im.height)], fill=(255, 255, 255, 150 if v % lab == 0 else 60), width=1)
        if v % lab == 0:
            d.rectangle([X + 2, 2, X + 34, 18], fill=(0, 0, 0, 170)); d.text((X + 4, 2), str(v), fill=(255, 255, 0), font=f)
    v += step
v = (int(y1) // step) * step
while v <= y2:
    Y = (v - y1) * s
    if Y >= 0:
        d.line([(0, Y), (im.width, Y)], fill=(255, 255, 255, 150 if v % lab == 0 else 60), width=1)
        if v % lab == 0:
            d.rectangle([2, Y + 2, 34, Y + 18], fill=(0, 0, 0, 170)); d.text((4, Y + 2), str(v), fill=(0, 255, 255), font=f)
    v += step
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
suffix = '' if len(sys.argv) < 6 else '-crop'
out = os.path.join(HERE, 'out', f'grid-{name}{suffix}.jpg')
im.save(out, quality=85)
print(out)
