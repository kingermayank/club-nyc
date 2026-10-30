# Pixel audit

Generated 2026-10-30 01:34 by `tools/pixel_audit.py` against http://localhost:5197. Re-run: `.venv/bin/python tools/pixel_audit.py`.

**6** finding(s). Crops (2x) are in `tools/out/pixel-audit/`.

## HUD pieces overlap (2)

| Screen | Element | Off by (px) | Text | Crop |
|---|---|---|---|---|
| landing 1280 01 | `main > section.hero > button.hero-pause  ×  section.cookie-banner` | 38 |  / Cookies on Club NY | tools/out/pixel-audit/001-landing-1280-01-overlap.png |
| landing 1280 03 | `div.wrap > div.bento.places-bento > article.tile.clip > div.clip-text  ×  section.cookie-banner` | 106 | Grand Central

Loo / Cookies on Club NY | tools/out/pixel-audit/002-landing-1280-03-overlap.png |

## Wrapped text with lines nearly touching (line-height as a multiple of the font size) (4)

| Screen | Element | Off by (px) | Text | Crop |
|---|---|---|---|---|
| landing 1280 01 | `section.hero > div.wrap > div.hero-copy > h1` | 1.07 | Waddle on over to New York. | tools/out/pixel-audit/000-landing-1280-01-cramped.png |
| waitlist landing 1280 01 | `section.hero > div.wrap > div.hero-copy > h1` | 1.07 | Waddle on over to New York. | tools/out/pixel-audit/003-waitlist-landing-1280-01-cramped.png |
| landing 390 01 | `section.hero > div.wrap > div.hero-copy > h1` | 1.02 | Waddle on over to New York. | tools/out/pixel-audit/004-landing-390-01-cramped.png |
| waitlist landing 390 01 | `section.hero > div.wrap > div.hero-copy > h1` | 1.02 | Waddle on over to New York. | tools/out/pixel-audit/005-waitlist-landing-390-01-cramped.png |

