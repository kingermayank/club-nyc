"""
The subway station's moving train (app/src/features/subwayTrain.ts).

1. The platform with no train: the room's picture, with the track side taken from art/raw/subway-empty.png (a
   Higgsfield edit of the same picture with the train removed) -> art/rooms/subway-empty.jpg
2. The train, as one continuous clip of the train side of the room (art/video/subway-train.mp4): arriving, doors
   opening, doors closing, departing. It is built from Higgsfield first-frame/last-frame animations (wan3_0) between
   our own pictures (art/raw/train): frame-empty -> frame-closed (arrive.mp4), frame-closed -> frame-open
   (open.mp4), frame-closed -> frame-empty (depart.mp4). frame-open is frame-closed with only the open doorway taken
   from the room's original painting, so every window keeps its clean glass. See build_cycle for how they are joined so no join shows.

    .venv/bin/python tools/subway_train.py
"""
import os, json
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..', 'app')
W, H = 1000, 565

# the train's side plane in stage px: its top and bottom edges are straight lines that meet at the vanishing point
def top(x): return 55 + 0.21875 * (x - 780)
def bottom(x): return 270 + 1.25 * (x - 850)
# a little more above (the roof) and below (the skirt), so the whole silhouette rides on the one plane
def edge(x):
    t, b = top(x), bottom(x)
    return t - 0.24 * (b - t), b + 0.10 * (b - t)
FAR_X, NEAR_X = 742, 1070
QUAD = [(FAR_X, edge(FAR_X)[0]), (NEAR_X, edge(NEAR_X)[0]), (NEAR_X, edge(NEAR_X)[1]), (FAR_X, edge(FAR_X)[1])]  # TL TR BR BL
FLAT_W, FLAT_H = 6000, 560
# the joints between cars in the picture (stage x along the bottom edge): one whole car lies between them
JOINT_A, JOINT_B = 790, 937

def homography(src, dst):
    """3x3 H with H @ src = dst (4 point pairs)"""
    A, b = [], []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    h = np.linalg.solve(np.array(A, float), np.array(b, float))
    return np.append(h, 1).reshape(3, 3)

def main():
    raw = Image.open(os.path.join(ROOT, 'public/art/raw/subway.png')).convert('RGB')
    k = raw.size[0] / W
    # ---- 1. the empty platform
    # The platform (floor, yellow strip, pillar, everything on it) stays the room's ORIGINAL painting. Only the track
    # side comes from the Higgsfield edit with the train removed. The cut runs along the outer side of the original
    # yellow strip, and above the platform along the right side of the last pillar. (An earlier version took the
    # whole right part of the picture from the edit, whose yellow strip was drawn a little differently: near the
    # pillar it bulged out toward the track, in front of the train.)
    old = Image.open(os.path.join(ROOT, 'public/art/rooms/subway.jpg')).convert('RGB')
    new = Image.open(os.path.join(ROOT, 'public/art/raw/subway-empty.png')).convert('RGB').resize(old.size, Image.LANCZOS)
    s = old.size[0] / W
    o, n = np.asarray(old).astype(np.float32), np.asarray(new).astype(np.float32)
    PH, PW = o.shape[:2]
    x0 = int(STRIP_X * s)
    bound = platform_edge(o[:, x0:], n[:, x0:], s) + x0
    track = np.arange(PW)[None, :] > bound[:, None]
    m = np.asarray(Image.fromarray((track * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32)[..., None] / 255
    plate = o * (1 - m) + n * m
    # the edit's own yellow strip reached a little past the real edge near the pillar: on the track side that whole
    # band is painted over with the dark track bed from just beyond it
    band, shift = overshoot(plate[:, x0:], bound - x0, s)
    for y in np.where(band.any(1))[0]:
        xs = np.where(band[y])[0] + x0
        plate[y, xs] = plate[y, np.minimum(xs + shift[y], PW - 1)]
    # and any stray yellow pixel left on the track side there
    reach = int(20 * s)
    for y in range(int(TIP[0] * s), int(TIP[1] * s)):
        bx = int(bound[y]) + 2
        for x in range(bx, min(PW - 2 * reach, bx + reach)):
            if YELLOWISH(plate[y, x]):
                src = x + reach
                while src < PW - 1 and YELLOWISH(plate[y, src]): src += 1
                plate[y, x] = plate[y, src]
    out = Image.fromarray(np.clip(plate + 0.5, 0, 255).astype(np.uint8))
    out.save(os.path.join(ROOT, 'public/art/rooms/subway-empty.jpg'), quality=92)
    # ---- 2. the train, as ONE continuous clip of the train side of the room (stage x >= STRIP_X)
    build_cycle(Image.open(os.path.join(ROOT, 'public/art/rooms/subway-empty.jpg')).convert('RGB'))


STRIP_X = 690
VW, VH, FPS = 596, 1080, 30
# stage y of the stretch by the pillar where the Higgsfield edit's yellow strip overshot the real platform edge
TIP = (126, 218)


def platform_edge(orig, empty, scale):
    """
    For each row of the train side of the room (arrays cut at STRIP_X; `scale` is their pixels per stage px): the x of
    the last pixel that belongs to the platform. Rows that have the yellow warning strip: its outer side, read from
    the ORIGINAL painting. Rows above it: a little inside the right side of the last pillar (the same in both
    pictures). Everything to the right of this line is track.
    """
    lum = lambda a: a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
    h, w = orig.shape[:2]
    yel = (orig[..., 0] > 190) & (orig[..., 1] > 140) & (orig[..., 2] < 110) & (orig[..., 0] - orig[..., 2] > 110)
    le = lum(empty)
    green = (empty[..., 1] > empty[..., 0] + 6) & (empty[..., 1] > empty[..., 2] - 6) & (le > 28) & (le < 150)
    edge = np.full(h, np.nan)
    strip_rows = np.zeros(h, bool)
    bridge, least = int(round(7 * scale)), int(round(6 * scale))
    for y in range(h):
        start, end, gap = -1, -1, 0
        for x in range(w):
            if yel[y, x]:
                if start < 0: start = x
                end, gap = x, 0
            elif start >= 0:
                gap += 1
                if gap > bridge: break
        if start >= 0 and end - start >= least:
            # the strip's dark outline stays with the platform
            edge[y], strip_rows[y] = end + round(1 * scale), True
            continue
        end, gap = -1, 0
        for x in range(int(4 * scale), w // 2):
            if green[y, x]:
                end, gap = x, 0
            elif end >= 0:
                gap += 1
                if gap > round(4.5 * scale): break
        if end >= 0: edge[y] = end - round(2 * scale)
    idx = np.where(~np.isnan(edge))[0]
    edge = np.interp(np.arange(h), idx, edge[idx])
    # smooth each stretch on its own, so the corner where the pillar meets the platform stays a corner
    k = int(round(8 * scale)) | 1
    out = edge.copy()
    for rows in (np.where(strip_rows)[0], np.where(~strip_rows)[0]):
        if len(rows) < k: continue
        v = edge[rows]
        pad = np.pad(v, k // 2, mode='edge')
        out[rows] = [np.median(pad[i:i + k]) for i in range(len(v))]
    return out


YELLOWISH = lambda a: (a[..., 0] > 150) & (a[..., 1] > 100) & (a[..., 2] < 125) & (a[..., 0] - a[..., 2] > 70)


def overshoot(empty, edge, scale):
    """
    Where the Higgsfield edit's yellow strip reaches past the real platform edge, by the pillar: for each row there, the
    whole run from its first yellow pixel on the track side to a little past its last (a solid band, so no speckled
    fringe is left). Returns a mask and, per row, how far to the right clean track bed begins.
    """
    h, w = empty.shape[:2]
    band = np.zeros((h, w), bool)
    shift = np.zeros(h, int)
    reach = int(round(16 * scale))
    y0, y1 = int(TIP[0] * h / H), int(TIP[1] * h / H)
    for y in range(y0, y1):
        bx = int(edge[y]) + 1
        xs = [x for x in range(bx, min(w - 1, bx + reach)) if YELLOWISH(empty[y, x])]
        if len(xs) < 2: continue
        a, b = xs[0] - round(1 * scale), xs[-1] + round(2 * scale)
        a = max(a, bx)
        band[y, a:b + 1] = True
        shift[y] = b - a + round(3 * scale)
    return band, shift


def read_clip(name):
    """a source animation's frames, cut to the strip and laid on the room's own height (uint8, n x VH x VW x 3)"""
    import subprocess
    raw = os.path.join(ROOT, 'public/art/raw/train', name + '.mp4')
    x = 1920 - VW
    # the 1920 x 1080 frames given to the model were the picture resized to 1920 x 1086 with 3 rows cut top and bottom,
    # so the clip is put back at that height: without this the train sits about a pixel off the room behind it
    inner = round(VH * 1080 / 1086)
    cmd = ['ffmpeg', '-loglevel', 'error', '-i', raw, '-vf', f'crop={VW}:1080:{x}:0,scale={VW}:{inner}:flags=lanczos', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    buf = subprocess.run(cmd, check=True, capture_output=True).stdout
    fr = np.frombuffer(buf, np.uint8).reshape(-1, inner, VW, 3)
    return fr, (VH - inner) // 2


def build_cycle(room_img):
    """
    arrive + doors open + doors close (open, reversed) + depart, joined into art/video/subway-train.mp4 so that
    nobody can see a join:
      - everything the train never covers is the room's own picture, pixel for pixel, in every frame;
      - each source animation is nudged to the room's colours (the model drifts a little);
      - the clips meet on two fixed pictures: E, the empty track (the first and last frame), and K, the train standing
        with its doors shut (where arrive ends, where the doors start and finish, where depart starts).
    """
    import subprocess
    lum = lambda a: a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
    s = room_img.size[0] / W
    # E: the room's picture itself, exactly as the game shows it behind the clip
    E = np.asarray(room_img.crop((int(STRIP_X * s), 0, room_img.size[0], room_img.size[1])).resize((VW, VH), Image.LANCZOS)).astype(np.float32)
    clips = {}
    for name in ('arrive', 'open', 'depart'):
        fr, pad = read_clip(os.environ.get(name.upper(), name))  # e.g. DEPART=depart-b to try another take
        full = np.repeat(E[None], len(fr), 0)
        full[:, pad:pad + fr.shape[1]] = fr
        clips[name] = full
        print(name, len(fr), 'frames')
    A, O, D = clips['arrive'], clips['open'], clips['depart']

    def match(clip, ref_frame, target, where):
        """per-channel gain and offset so `ref_frame` looks like `target` over the pixels in `where`"""
        out = clip.copy()
        for c in range(3):
            x, y = ref_frame[..., c][where].astype(np.float64), target[..., c][where].astype(np.float64)
            g, o = np.polyfit(x, y, 1)
            out[..., c] = clip[..., c] * g + o
        return np.clip(out, 0, 255)

    # where the train ever is: anything that differs from the empty track in the arrival and door clips
    def swept(clip, base):
        d = np.zeros((VH, VW), np.float32)
        for f in clip[::2]:
            d = np.maximum(d, np.abs(lum(f) - lum(base)))
        return d
    A = match(A, A[0], E, np.ones((VH, VW), bool))
    sw = swept(A, E)
    # The clip is only trusted on the track side of the room. The model also shifts light and shadow a little on the
    # pillar, the wall, the yellow strip and the rat as the train comes in, and that is exactly what reads as a
    # flicker, so none of it is kept: on the platform side every frame is the room. The line between the two is the
    # same one the room's picture was cut along (platform_edge): it sits ON the pillar and on the strip's outer edge,
    # never beside them, so the train runs right up to both.
    orig_img = Image.open(os.path.join(ROOT, 'public/art/rooms/subway.jpg')).convert('RGB')
    Og = np.asarray(orig_img.crop((int(STRIP_X * s), 0, orig_img.size[0], orig_img.size[1])).resize((VW, VH), Image.LANCZOS)).astype(np.float32)
    edge = platform_edge(Og, E, VW / (W - STRIP_X))
    hard = np.arange(VW)[None, :] > edge[:, None]
    M = np.asarray(Image.fromarray((hard * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32)[..., None] / 255
    print('the track side is', round(float(hard.mean()) * 100, 1), '% of the strip; the edge is at x =', [int(edge[y]) for y in (10, 60, 150, 250, 400, 700, 1000)])
    # by the pillar the animations still draw the old, overshooting yellow strip whenever the track is empty there:
    # in that band, a row that shows yellow is replaced with the room (the train has no yellow there)
    raw_empty = Image.open(os.path.join(ROOT, 'public/art/raw/subway-empty.png')).convert('RGB')
    ke = raw_empty.size[0] / W
    Ne = np.asarray(raw_empty.crop((int(STRIP_X * ke), 0, raw_empty.size[0], raw_empty.size[1])).resize((VW, VH), Image.LANCZOS)).astype(np.float32)
    band, _ = overshoot(Ne, edge, VW / (W - STRIP_X))
    band = np.asarray(Image.fromarray((band * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 127
    band &= hard
    near = np.zeros((VH, VW), bool)
    near[int(TIP[0] * VH / H):int(TIP[1] * VH / H)] = True
    near &= (np.arange(VW)[None, :] > edge[:, None] + 1) & (np.arange(VW)[None, :] < edge[:, None] + 20 * VW / (W - STRIP_X))
    # (it is replaced with the room's own pixels, not with pixels from elsewhere in the frame: copying from the frame
    # dragged bits of the train into the gap)
    def clean(f):
        yl = YELLOWISH(f)
        rows = (band & yl).sum(1) >= 2
        bad = (band & rows[:, None]) | (near & yl)
        if not bad.any(): return f
        g = f.copy()
        g[bad] = E[bad]
        return g
    outside = ~hard
    # K: the standing train, doors shut, from the end of the arrival
    K = A[-6:].mean(0)
    O = match(O, O[0], K, outside)
    O = match(O, O[0], K, np.ones_like(outside))
    D = match(D, D[0], K, np.ones_like(outside))

    def ease(a, b, n, i):
        t = (i + 1) / (n + 1)
        t = t * t * (3 - 2 * t)
        return a * (1 - t) + b * t
    HEAD, TAIL = 8, 12
    # the clip starts and ends on E itself (the game holds the last frame while there is no train, then jumps to the first)
    seq = [E]
    # arrive: out of E, into K
    for i, f in enumerate(A):
        if i < HEAD: f = ease(E, f, HEAD, i)
        j = i - (len(A) - TAIL)
        if j >= 0: f = ease(f, K, TAIL, j)
        seq.append(f)
    n_arrive = len(seq)
    # doors open: out of K
    # (the model snaps its last two frames onto the exact end picture, a visible tick: those two are dropped and the
    # frames before them are eased into the end picture instead, slowly. Played backwards for the closing, the same.)
    body, target = O[:-2], O[-1]
    op = []
    SETTLE_IN, SETTLE_OUT = 14, 24   # frames: both while the doors are not moving
    for i, f in enumerate(body):
        if i < SETTLE_IN: f = ease(K, f, SETTLE_IN, i)
        j = i - (len(body) - SETTLE_OUT)
        if j >= 0: f = ease(f, target, SETTLE_OUT, j)
        op.append(f)
    op.append(target)
    seq += op
    n_open = len(seq)
    # doors close: the same frames backwards, so it starts on the last open frame and ends on K
    seq += op[::-1] + [K]
    n_close = len(seq)
    # depart: out of K, and cut once the track is empty again, into E
    gone = len(D) - 1
    for i in range(len(D)):
        if np.abs(lum(D[i]) - lum(D[-1]))[hard].mean() < 2.5:
            gone = i
            break
    dep = D[:min(len(D), gone + TAIL + 2)]
    for i, f in enumerate(dep):
        if i < HEAD: f = ease(K, f, HEAD, i)
        j = i - (len(dep) - TAIL)
        if j >= 0: f = ease(f, E, TAIL, j)
        seq.append(f)
    seq.append(E)
    print('depart: the track is clear at frame', gone, 'of', len(D))

    vid = os.path.join(ROOT, 'public/art/video')
    os.makedirs(vid, exist_ok=True)
    out = os.path.join(vid, 'subway-train.mp4')
    # Keyframes. A keyframe is coded on its own, so it never looks quite like the frames just before it: on a still
    # picture that shows as a faint tick. So there is no regular keyframe rhythm here. Keyframes sit only at the very
    # first frame and at moments when the train is moving fast (a tick is lost in the motion), which is also enough
    # for the game to jump into the middle of the clip. The game never jumps while the train is standing: it stops
    # the clip where it is and starts it again from the same frame.
    moving = [1.9, 2.7, 3.5, 4.2]
    keys = [0] + [round(x * FPS) for x in moving] + [n_close + round(x * FPS) for x in (1.4, 2.2, 3.0)]
    enc = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{VW}x{VH}', '-r', str(FPS), '-i', '-',
                            '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int', '-c:v', 'libx264', '-profile:v', 'high', '-bf', '0',
                            '-force_key_frames', ','.join(f'{k / FPS:.5f}' for k in keys), '-x264-params', 'keyint=infinite:min-keyint=1:scenecut=0',
                            '-preset', 'slow', '-qp', os.environ.get('QP', '22'), '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                            '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for f in seq:
        # outside the train's path: the room, untouched
        frame = E * (1 - M) + clean(f) * M
        enc.stdin.write(np.clip(frame + 0.5, 0, 255).astype(np.uint8).tobytes())
    enc.stdin.close()
    enc.wait()
    t = lambda n: round(n / FPS, 3)
    # holdOpen / holdEmpty: the middle of the frame to stop on (the middle, so a rounding error can't land on its neighbour)
    info = {'fps': FPS, 'arrive': [0, t(n_arrive)], 'open': [t(n_arrive), t(n_open)], 'close': [t(n_open), t(n_close)], 'depart': [t(n_close), t(len(seq) - 1)], 'length': t(len(seq)),
            'holdOpen': t(n_open - 0.5), 'holdEmpty': t(len(seq) - 0.5)}
    json.dump(info, open(os.path.join(ROOT, 'src/data/subway-train.json'), 'w'), indent=1)
    print(info, os.path.getsize(out) // 1024, 'KB')
    # what the game shows before the clip has loaded, and with reduced motion: the standing train, doors open
    Image.fromarray(np.clip(E * (1 - M) + clean(op[-1]) * M, 0, 255).astype(np.uint8)).save(os.path.join(ROOT, 'public/art/fx/subway-train-open.jpg'), quality=92)
    for stale in ('subway-arrive.mp4', 'subway-open.mp4', 'subway-close.mp4', 'subway-depart.mp4'):
        if os.path.exists(os.path.join(vid, stale)): os.remove(os.path.join(vid, stale))
    if os.path.exists(os.path.join(ROOT, 'public/art/fx/subway-train-shut.jpg')): os.remove(os.path.join(ROOT, 'public/art/fx/subway-train-shut.jpg'))
    debug = os.environ.get('PREVIEW')
    if debug:
        Image.fromarray((M[..., 0] * 255).astype(np.uint8)).save(debug + '/train-mask.png')
        for name, i in (('E', 0), ('K', n_arrive - 1), ('open', n_open - 1), ('dep-mid', n_close + max(1, (len(seq) - n_close) // 2))):
            Image.fromarray(np.clip(E * (1 - M) + clean(seq[i]) * M, 0, 255).astype(np.uint8)).save(f'{debug}/cycle-{name}.png')

main()
