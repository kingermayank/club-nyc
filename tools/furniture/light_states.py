"""Second state of the furniture that switches (features/apartment.ts + homeLights.ts): lamps get an unlit copy
(<id>-off.png; the neon sign and the TV are done in CSS). Made from the lit painting itself, pixel
for pixel, so the two states never shift against each other. Run: .venv/bin/python tools/furniture/light_states.py"""
import colorsys
from PIL import Image

D = 'app/public/art/furniture/'

def remap(src, dst, fn, box=None):
    im = Image.open(D + src).convert('RGBA')
    px = im.load()
    x0, y0, x1, y1 = box or (0, 0, im.width, im.height)
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            out = fn(h * 360, s, v, x, y)
            if out:
                r, g, b = colorsys.hsv_to_rgb(out[0] / 360, out[1], out[2])
                px[x, y] = (round(r * 255), round(g * 255), round(b * 255), a)
    im.save(D + dst)
    im.save(D + dst + '.webp', 'WEBP', quality=92)
    return im

# a lit shade or flame (warm, bright) goes to cold parchment: the bulb is out
def bulb_out(h, s, v, x, y):
    if 22 <= h <= 68 and v > 0.5 and s > 0.12:
        return (h * 0.5 + 215 * 0.5 if s < 0.3 else 38, s * 0.3, v * 0.58)
remap('lamp.png', 'lamp-off.png', bulb_out, (0, 0, 173, 130))
remap('torch-lamp.png', 'torch-lamp-off.png', bulb_out, (0, 0, 130, 120))
remap('street-lamp.png', 'street-lamp-off.png', bulb_out, (0, 0, 137, 190))
