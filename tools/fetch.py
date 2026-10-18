"""Download generated images and produce web + preview versions.
usage: fetch.py name=url [name=url ...]   (env KIND=room|sprite|raw)"""
import sys, os, subprocess
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..', 'app', 'public', 'art')
kind = os.environ.get('KIND', 'room')
for arg in sys.argv[1:]:
    name, url = arg.split('=', 1)
    raw = os.path.join(ROOT, 'raw', name + '.png')
    if not os.path.exists(raw):
        subprocess.run(['curl', '-s', '-o', raw, url], check=True)
    im = Image.open(raw)
    if kind == 'room':
        rgb = im.convert('RGB')
        w = 2000
        web = rgb.resize((w, round(rgb.height * w / rgb.width)), Image.LANCZOS)
        web.save(os.path.join(ROOT, 'rooms', name + '.jpg'), quality=86, optimize=True, progressive=True)
    pw = 1000
    prev = im.convert('RGBA')
    bg = Image.new('RGBA', prev.size, (255, 0, 255, 255) if kind != 'room' else (0, 0, 0, 255))
    bg.alpha_composite(prev)
    bg = bg.convert('RGB').resize((pw, round(im.height * pw / im.width)), Image.LANCZOS)
    bg.save(os.path.join(ROOT, 'preview', name + '.jpg'), quality=80)
    print(name, im.size)
