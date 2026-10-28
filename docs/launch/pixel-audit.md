# Pixel audit

Generated 2026-10-28 01:09 by `tools/pixel_audit.py` against http://localhost:55179. Re-run: `.venv/bin/python tools/pixel_audit.py`.

**4** finding(s). Crops (2x) are in `tools/out/pixel-audit/`.

## Wrapped text with lines nearly touching (line-height as a multiple of the font size) (4)

| Screen | Element | Off by (px) | Text | Crop |
|---|---|---|---|---|
| landing 1280 01 | `section.hero > div.wrap > div.hero-copy > h1` | 1.07 | Waddle on over to New York. | tools/out/pixel-audit/000-landing-1280-01-cramped.png |
| waitlist landing 1280 01 | `section.hero > div.wrap > div.hero-copy > h1` | 1.06 | Waddle on over to New York. | tools/out/pixel-audit/001-waitlist-landing-1280-01-cramped.png |
| landing 390 01 | `section.hero > div.wrap > div.hero-copy > h1` | 1.02 | Waddle on over to New York. | tools/out/pixel-audit/002-landing-390-01-cramped.png |
| waitlist landing 390 01 | `section.hero > div.wrap > div.hero-copy > h1` | 1.02 | Waddle on over to New York. | tools/out/pixel-audit/003-waitlist-landing-390-01-cramped.png |

