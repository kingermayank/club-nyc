"""Render the trailer soundtrack -> video/public/audio/trailer.wav

usage: .venv/bin/python video/capture/music.py
Bundles video/capture/music-entry.ts (an acoustic arrangement of the game's own song, plus its sound effects, on the
beat grid in video/src/timeline.ts) with esbuild and renders it in headless Chromium with an OfflineAudioContext. No servers needed."""
import asyncio, base64, os, re, subprocess
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.dirname(HERE)
OUT = os.path.join(VIDEO, 'public', 'audio', 'trailer.wav')


async def main():
    bundle = subprocess.run([os.path.join(VIDEO, 'node_modules', '.bin', 'esbuild'), os.path.join(HERE, 'music-entry.ts'),
                             '--bundle', '--format=iife', '--target=es2022', '--log-level=warning'],
                            capture_output=True, text=True, check=True).stdout
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        await pg.set_content('<!doctype html><title>trailer audio</title>')
        await pg.add_script_tag(content=bundle)
        data = await pg.evaluate('renderTrailerAudio()')
        await b.close()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    raw = OUT.replace('.wav', '.raw.wav')
    with open(raw, 'wb') as f:
        f.write(base64.b64decode(data))
    # loudness for the web: -14 LUFS (what YouTube and the socials normalize to), peaks under -1 dB. One gain for the
    # whole song plus a peak limiter (not loudnorm's dynamic mode, which would flatten the quiet piano opening)
    gain = -14 - lufs(raw)
    for _ in range(3):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af', f'volume={gain:.2f}dB,alimiter=limit=0.8:attack=2:release=60:level=0',
                        '-ar', '48000', OUT], check=True)
        miss = -14 - lufs(OUT)
        if abs(miss) < 0.15:
            break
        gain += miss
    os.remove(raw)
    print('wrote', OUT, f'{os.path.getsize(OUT) / 1048576:.1f} MB, {lufs(OUT):.1f} LUFS')


def lufs(path):
    out = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', out)[-1])


asyncio.run(main())
