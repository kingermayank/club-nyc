#!/usr/bin/env python3
"""
Build the game's sound library from tools/sfx_manifest.json.

  1. download each manifest id (Epidemic Sound; WAV, or MP3 for long ones) into tools/sfx_raw/<id>.wav|.mp3  (gitignored: licensed originals)
  2. python3 tools/sfx_build.py            -> app/public/sfx/*.mp3 + app/public/sfx/index.json

One-shots: leading silence cut, trimmed to `max` seconds, short fade-in, `fade` fade-out, average level evened out (-20 dBFS, peaks under -1 dBFS),
mono 96 kbps. Loops (`loop` on a sound, or any ambience): a `len`-second window from `start`, its tail crossfaded
into its head so it repeats without a click, loudness-normalized, stereo 112 kbps.
A key whose raw file is missing is left out of the index, so the game keeps that sound's synth.
Needs ffmpeg. Run with --list to print which raw files are missing.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'tools' / 'sfx_manifest.json'
RAW = Path(os.environ.get('SFX_RAW', ROOT / 'tools' / 'sfx_raw'))
OUT = Path(os.environ.get('SFX_OUT', ROOT / 'app' / 'public' / 'sfx'))
XFADE = 2.0  # seconds of crossfade at a loop's seam
MEAN_TARGET = -20.0  # one-shots' average level (dBFS) before the manifest's mix volume


def ff(*args: str) -> str:
    r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr.strip())
    return r.stderr


def levels(path: Path) -> tuple[float, float]:
    """(peak, mean) in dBFS"""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(path), '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    peak, mean = 0.0, -20.0
    for line in r.stderr.splitlines():
        if 'max_volume' in line:
            peak = float(line.split(':')[1].split('dB')[0])
        if 'mean_volume' in line:
            mean = float(line.split(':')[1].split('dB')[0])
    return peak, mean


def one_shot(src: Path, dst: Path, s: dict) -> None:
    start, mx, fade = s.get('start', 0), s.get('max', 2.0), s.get('fade', min(0.08, s.get('max', 2.0) / 4))
    tmp = dst.with_suffix('.tmp.wav')
    chain = [
        f'atrim=start={start}',
        'asetpts=PTS-STARTPTS',
        'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.005',
        f'atrim=end={mx}',
        'afade=t=in:d=0.004',
        f'afade=t=out:st={max(0, mx - fade)}:d={fade}',
    ]
    ff('-i', str(src), '-af', ','.join(chain), '-ac', '1', '-ar', '44100', str(tmp))
    # even out loudness: average level to -20 dBFS, but never past a -1 dBFS peak
    peak, mean = levels(tmp)
    gain = min(-1.0 - peak, MEAN_TARGET - mean)
    ff('-i', str(tmp), '-af', f'volume={gain}dB', '-ac', '1', '-b:a', '96k', str(dst))
    tmp.unlink()


def loop(src: Path, dst: Path, start: float, length: float, stereo: bool) -> None:
    """out[t] = seg[t]*fadein + seg[L+t]*fadeout for the first XFADE seconds, then seg[t]: the end flows into the start"""
    x = min(XFADE, length / 4)
    g = (
        f'[0:a]atrim=start={start}:end={start + length + x},asetpts=PTS-STARTPTS,asplit=3[a][b][c];'
        f'[a]atrim=end={x},asetpts=PTS-STARTPTS,afade=t=in:d={x}[head];'
        f'[b]atrim=start={length}:end={length + x},asetpts=PTS-STARTPTS,afade=t=out:d={x}[tail];'
        f'[c]atrim=start={x}:end={length},asetpts=PTS-STARTPTS[body];'
        f'[head][tail]amix=inputs=2:normalize=0[seam];'
        f'[seam][body]concat=n=2:v=0:a=1,loudnorm=I=-23:TP=-2:LRA=11[out]'
    )
    ff('-i', str(src), '-filter_complex', g, '-map', '[out]', '-ac', '2' if stereo else '1', '-ar', '44100', '-b:a', '112k' if stereo else '96k', str(dst))


def raw_file(i: str) -> Path | None:
    for ext in ('wav', 'mp3'):
        f = RAW / f'{i}.{ext}'
        if f.exists():
            return f
    return None


def main() -> None:
    m = json.loads(MANIFEST.read_text())
    if '--list' in sys.argv:
        ids = {s['id'] for e in m['sounds'].values() for s in e['src']} | {a['id'] for a in m['ambience'].values()}
        missing = sorted(i for i in ids if not raw_file(i))
        print(f'{len(ids) - len(missing)}/{len(ids)} raw files present')
        for i in missing:
            print('missing', i)
        return
    OUT.mkdir(parents=True, exist_ok=True)
    index: dict = {'v': 1, 'sounds': {}, 'ambience': {}}
    for key, e in m['sounds'].items():
        files = []
        for n, s in enumerate(e['src']):
            raw = raw_file(s['id'])
            if not raw:
                continue
            name = f"{key}{'-' + str(n + 1) if len(e['src']) > 1 else ''}.mp3"
            if 'loop' in s:
                loop(raw, OUT / name, s.get('start', 0), s['loop'], stereo=False)
            else:
                one_shot(raw, OUT / name, s)
            files.append(name)
        if files:
            index['sounds'][key] = {'files': files, **{k: e[k] for k in ('bus', 'vol', 'jitter', 'gap', 'layer') if k in e}}
            print('ok ', key, files)
        else:
            print('-- ', key, '(synth)')
    for name, a in m['ambience'].items():
        raw = raw_file(a['id'])
        if not raw:
            print('-- ', f'amb.{name}', '(none)')
            continue
        f = f'amb-{name}.mp3'
        loop(raw, OUT / f, a.get('start', 0), a['len'], stereo=True)
        index['ambience'][name] = {'file': f, 'vol': a.get('vol', 0.3)}
        print('ok ', f'amb.{name}')
    (OUT / 'index.json').write_text(json.dumps(index, indent=1) + '\n')
    total = sum(p.stat().st_size for p in OUT.glob('*.mp3'))
    print(f"{len(index['sounds'])} sounds, {len(index['ambience'])} ambiences, {total / 1e6:.1f} MB in {OUT}")


if __name__ == '__main__':
    main()
