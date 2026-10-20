"""Contact sheet of the captured footage (one frame from the middle of each clip, plus stills) for a quick look."""
import glob, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw

FOOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'footage')
out = sys.argv[1]
pattern = sys.argv[2] if len(sys.argv) > 2 else '*'
items = sorted(glob.glob(os.path.join(FOOT, pattern + '.mp4'))) + sorted(glob.glob(os.path.join(FOOT, pattern + '.png')))
W, H = 480, 270
cols = 3
rows = (len(items) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W, rows * (H + 22)), (20, 20, 30))
tmp = tempfile.mkdtemp()
for i, path in enumerate(items):
    if path.endswith('.mp4'):
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout or 1)
        fr = os.path.join(tmp, f'{i}.jpg')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(dur * 0.6), '-i', path, '-frames:v', '1', fr], check=True)
        im = Image.open(fr)
    else:
        im = Image.open(path)
    im = im.convert('RGB').resize((W, H))
    x, y = (i % cols) * W, (i // cols) * (H + 22)
    sheet.paste(im, (x, y + 22))
    ImageDraw.Draw(sheet).text((x + 6, y + 5), os.path.basename(path), fill=(255, 255, 255))
sheet.save(out, quality=85)
print(out, len(items), 'items')
