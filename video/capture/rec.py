"""Record a Playwright page to MP4 through Chrome's screencast (real-time, JPEG frames re-timed to a constant 30 fps)."""
import asyncio, base64, os, shutil, subprocess, tempfile

HIDE_HUD = """
.hud, .toolbar, .toasts, .notices, .quests, .help-btn, .tour, .tour-spot, .chat-log, .tb-tip, .jam-join,
.stamp-toast, .title-card, .boot-splash, .apt-controls { display: none !important; }
"""


class Recorder:
    def __init__(self, page, size=(1920, 1080), quality=92):
        self.page, self.size, self.quality = page, size, quality
        self.frames, self.cdp, self.dir = [], None, None

    async def start(self):
        self.dir = tempfile.mkdtemp(prefix='clubnyc-rec-')
        self.frames = []
        self.cdp = await self.page.context.new_cdp_session(self.page)

        async def on_frame(p):
            self.frames.append((p['metadata']['timestamp'], p['data']))
            try:
                await self.cdp.send('Page.screencastFrameAck', {'sessionId': p['sessionId']})
            except Exception:
                pass

        self.cdp.on('Page.screencastFrame', lambda p: asyncio.ensure_future(on_frame(p)))
        await self.cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': self.quality,
                                                     'maxWidth': self.size[0], 'maxHeight': self.size[1], 'everyNthFrame': 1})

    async def stop(self, out, fps=30, trim_start=0.0):
        await self.cdp.send('Page.stopScreencast')
        await asyncio.sleep(0.1)
        frames = sorted(self.frames)
        t0 = frames[0][0] + trim_start
        frames = [f for f in frames if f[0] >= t0] or frames[-1:]
        lines = []
        for i, (ts, data) in enumerate(frames):
            path = os.path.join(self.dir, f'f{i:05d}.jpg')
            with open(path, 'wb') as fh:
                fh.write(base64.b64decode(data))
            dur = (frames[i + 1][0] - ts) if i + 1 < len(frames) else 1 / fps
            lines.append(f"file '{path}'\nduration {max(dur, 0.001):.4f}")
        lines.append(f"file '{os.path.join(self.dir, f'f{len(frames) - 1:05d}.jpg')}'")
        listing = os.path.join(self.dir, 'list.txt')
        with open(listing, 'w') as fh:
            fh.write('\n'.join(lines))
        span = frames[-1][0] - frames[0][0]
        w, h = self.size
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listing,
                        '-vf', f'scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h},fps={fps}',
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
                       check=True)
        shutil.rmtree(self.dir, ignore_errors=True)
        rate = (len(frames) - 1) / span if span > 0 else 0
        print(f'  recorded {os.path.basename(out)}: {span:.1f} s, {len(frames)} frames ({rate:.0f} fps captured)', flush=True)
        return rate
