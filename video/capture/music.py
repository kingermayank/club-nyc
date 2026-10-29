"""Render the trailer soundtrack -> video/public/audio/trailer.wav

usage: .venv/bin/python video/capture/music.py               (the trailer)
       .venv/bin/python video/capture/music.py --reel=grew-up  (a reel: reel-<id>.wav, and reel-<id>-sfx.wav with only the sound effects)
       .venv/bin/python video/capture/music.py --epic          (the mock-epic reel: epic-shuffle.wav, and epic-hits.wav for a bought track)
Bundles video/capture/music-entry.ts (an acoustic arrangement of the game's own song, plus its sound effects, on the
beat grid in video/src/timeline.ts) with esbuild and renders it in headless Chromium with an OfflineAudioContext. No servers needed."""
import asyncio, base64, os, re, subprocess, sys
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.dirname(HERE)
OUT = os.path.join(VIDEO, 'public', 'audio', 'trailer.wav')


BAND = ['lead', 'marimba', 'bass', 'stabs', 'drums']


async def main():
    reel = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--reel=')), None)
    bundle = subprocess.run([os.path.join(VIDEO, 'node_modules', '.bin', 'esbuild'), os.path.join(HERE, 'music-entry.ts'),
                             '--bundle', '--format=iife', '--target=es2022', '--log-level=warning'],
                            capture_output=True, text=True, check=True).stdout
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        await pg.set_content('<!doctype html><title>trailer audio</title>')
        await pg.add_script_tag(content=bundle)
        if '--epic' in sys.argv:
            full = await pg.evaluate("renderEpicAudio('shuffle')")
            hits = await pg.evaluate("renderEpicAudio('hits')")
            await b.close()
            gain = write(full, OUT.replace('trailer.wav', 'epic-shuffle.wav'))
            write(hits, OUT.replace('trailer.wav', 'epic-hits.wav'), gain)
            return
        if reel:
            full = await pg.evaluate('(id) => renderReelAudio(id)', reel)
            sfx = await pg.evaluate('([id, mute]) => renderReelAudio(id, mute)', [reel, BAND])
            await b.close()
            out = OUT.replace('trailer.wav', f'reel-{reel}.wav')
            gain = write(full, out)
            # the sound effects alone keep the same gain, so they sit at the level they had in the mix
            write(sfx, out.replace('.wav', '-sfx.wav'), gain)
            return
        data = await pg.evaluate('renderTrailerAudio()')
        await b.close()
    write(data, OUT)


def write(data, out, gain=None):
    """decode, then -14 LUFS (one gain + a peak limiter); with `gain` given, apply exactly that instead"""
    OUT_ = out
    os.makedirs(os.path.dirname(OUT_), exist_ok=True)
    raw = OUT_.replace('.wav', '.raw.wav')
    with open(raw, 'wb') as f:
        f.write(base64.b64decode(data))
    fixed = gain is not None
    if gain is None:
        # loudness for the web: -14 LUFS (what YouTube and the socials normalize to), peaks under -1 dB. One gain for the
        # whole song plus a peak limiter (not loudnorm's dynamic mode, which would flatten the quiet piano opening)
        gain = -14 - lufs(raw)
    for _ in range(1 if fixed else 3):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af', f'volume={gain:.2f}dB,alimiter=limit=0.8:attack=2:release=60:level=0',
                        '-ar', '48000', OUT_], check=True)
        if fixed:
            break
        miss = -14 - lufs(OUT_)
        if abs(miss) < 0.15:
            break
        gain += miss
    os.remove(raw)
    print('wrote', OUT_, f'{os.path.getsize(OUT_) / 1048576:.1f} MB, {lufs(OUT_):.1f} LUFS')
    return gain


def lufs(path):
    out = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', out)[-1])


asyncio.run(main())
