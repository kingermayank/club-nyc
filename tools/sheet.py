"""Contact sheet: sheet.py out.jpg cols name1 name2 ..."""
import sys, os
from PIL import Image, ImageDraw
ROOT = os.path.join(os.path.dirname(__file__), '..', 'app', 'public', 'art', 'preview')
out, cols, names = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
tw = 640
ims = [Image.open(os.path.join(ROOT, n + '.jpg')) for n in names]
ims = [i.resize((tw, round(i.height * tw / i.width))) for i in ims]
th = max(i.height for i in ims)
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * tw + (cols + 1) * 8, rows * (th + 26) + 8), 'white')
d = ImageDraw.Draw(S)
for k, (n, i) in enumerate(zip(names, ims)):
    x = 8 + (k % cols) * (tw + 8); y = 8 + (k // cols) * (th + 26)
    S.paste(i, (x, y + 18)); d.text((x, y + 2), n, fill='black')
S.save(out, quality=82)
