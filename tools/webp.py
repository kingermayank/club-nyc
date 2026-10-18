"""WebP copies of the game's art, for browsers that take them (all current ones). About a third of the bytes.

usage: .venv/bin/python tools/webp.py            (re-run after adding or changing art; it skips what's up to date)

For every JPEG/PNG under app/public/art (not the art-pipeline sources in art/raw and art/preview), writes
"<file>.webp" next to it, e.g. art/rooms/soho.jpg -> art/rooms/soho.jpg.webp. The game still asks for soho.jpg:
the production server (server/src/index.ts) answers with the .webp when the browser's Accept header allows it, so
nothing in the game changes. Transparency is kept exactly (lossless alpha), so click areas on cutouts don't move.
A copy that wouldn't save at least 10% isn't kept.
"""
import os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(os.path.dirname(HERE), 'app', 'public', 'art')
SKIP = {os.path.join(ART, 'raw'), os.path.join(ART, 'preview'), os.path.join(ART, 'landing')}
MIN_BYTES = 12 * 1024

made = kept_src = kept_out = skipped = 0
for dirpath, dirnames, files in os.walk(ART):
    if any(dirpath == s or dirpath.startswith(s + os.sep) for s in SKIP):
        dirnames[:] = []
        continue
    for f in files:
        if not f.lower().endswith(('.jpg', '.jpeg', '.png')):
            continue
        src = os.path.join(dirpath, f)
        out = src + '.webp'
        size = os.path.getsize(src)
        if size < MIN_BYTES:
            continue
        if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src):
            kept_src += size
            kept_out += os.path.getsize(out)
            continue
        im = Image.open(src)
        im.load()
        if im.mode in ('P', 'LA', 'RGBA') and ('transparency' in im.info or im.mode in ('LA', 'RGBA')):
            im = im.convert('RGBA')
            im.save(out, 'WEBP', quality=86, method=6, alpha_quality=100, exact=True)
        else:
            im = im.convert('RGB')
            im.save(out, 'WEBP', quality=82, method=6)
        if os.path.getsize(out) > size * 0.9:
            os.remove(out)
            skipped += 1
            continue
        made += 1
        kept_src += size
        kept_out += os.path.getsize(out)

print(f'{made} new WebP copies; {kept_src / 1048576:.1f} MB of art served as {kept_out / 1048576:.1f} MB ({skipped} not worth it)')
sys.exit(0)
