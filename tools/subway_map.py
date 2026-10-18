"""Build the subway map's real geography -> app/src/data/manhattan.ts

Sources (public domain, downloaded into scratch/geo/ and treated as data only):
  boroughs.geojson     NYC Open Data "Borough Boundaries" (clipped to shoreline), dataset gthc-hcne
                       https://data.cityofnewyork.us/api/geospatial/gthc-hcne?method=export&format=GeoJSON
  tiger_water.geojson  US Census TIGERweb Areal Hydrography (AREAWATER > 3000 m2) inside the map's bbox
                       https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Hydro/MapServer/1/query
                         ?where=AREAWATER>3000&geometry=-74.12,40.64,-73.86,40.85&geometryType=esriGeometryEnvelope
                         &inSR=4326&outSR=4326&outFields=NAME,MTFCC,AREAWATER&maxAllowableOffset=0.00001&f=geojson
                       (New Jersey = not-water west of the Hudson; also the Central Park reservoir and lakes)

Projection: equirectangular (cos-lat scaled) -> rotated 29 deg so Manhattan's street grid runs
vertically, like the MTA map -> x stretched around the island (schematic; keeps Midtown readable)
-> fitted into the 460x590 viewBox. Harlem runs off the top edge on purpose.

Land is rasterised at 8x, cleaned (piers removed, coast smoothed a touch), traced and simplified
with Douglas-Peucker (cv2.approxPolyDP) so the whole module stays ~20 KB.

usage: .venv/bin/python -I tools/subway_map.py [preview.png]
"""
import json
import math
import os
import sys

import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
GEO = os.path.join(ROOT, 'scratch', 'geo')
OUT = os.path.join(ROOT, 'app', 'src', 'data', 'manhattan.ts')

W, H = 460, 590
THETA = math.radians(29.0)          # bearing of Manhattan's avenues east of true north
LAT0, LON0 = 40.758, -73.985        # projection origin (Times Sq)
KX = 111.320 * math.cos(math.radians(LAT0))   # km per degree of longitude
KY = 110.950                                  # km per degree of latitude
SCALE = 38.0                        # px per km up/down the island
STRETCH = 1.5                       # schematic x exaggeration (MTA-map style fat Manhattan)
TOP_ALONG = 5.60                    # km up the island (from the origin) that sits at y = 0
CENTER_CROSS = 0.62                 # km across the island that lands on X_CENTER
X_CENTER = 228.0
SS = 8                              # raster supersampling
PAD = 16                            # raster margin around the viewBox so cut edges stay off-screen

CP_CORNERS = [(40.7681, -73.9819), (40.7644, -73.9730), (40.7968, -73.9493), (40.8005, -73.9580)]
LIBERTY_LL = (40.6892, -74.0445)


def rot(lat, lon):
    """lat/lon -> (cross, along) km in the grid-aligned frame (along = uptown)."""
    x = (lon - LON0) * KX
    y = (lat - LAT0) * KY
    c, s = math.cos(THETA), math.sin(THETA)
    return x * c - y * s, x * s + y * c


def project(lat, lon):
    u, v = rot(lat, lon)
    return X_CENTER + (u - CENTER_CROSS) * SCALE * STRETCH, (TOP_ALONG - v) * SCALE


def affine():
    """project() is affine: x = x0 + a*(lon-LON0) + b*(lat-LAT0), y = y0 + c*(lon-LON0) + d*(lat-LAT0)."""
    x0, y0 = project(LAT0, LON0)
    x1, y1 = project(LAT0, LON0 + 1)
    x2, y2 = project(LAT0 + 1, LON0)
    return x0, y0, x1 - x0, x2 - x0, y1 - y0, y2 - y0


# ---------- raster helpers ----------

def blank():
    return np.zeros(((H + 2 * PAD) * SS, (W + 2 * PAD) * SS), np.uint8)


def ring_xy(ring):
    return np.array([project(lat, lon) for lon, lat in ring], dtype=np.float64)


def fill(mask, rings_xy, value=1):
    pts = [np.round((r + PAD) * SS * 4).astype(np.int32) for r in rings_xy]   # shift=2: quarter-px precision
    cv2.fillPoly(mask, pts, value, lineType=cv2.LINE_8, shift=2)


def fill_polygon(mask, poly):
    """Union one GeoJSON polygon (exterior + holes) into mask."""
    rings = [ring_xy(r) for r in poly]
    ext = rings[0]
    if ext[:, 0].max() < -PAD or ext[:, 0].min() > W + PAD or ext[:, 1].max() < -PAD or ext[:, 1].min() > H + PAD:
        return
    if len(rings) == 1:
        fill(mask, rings)
        return
    tmp = blank()
    fill(tmp, rings[:1])
    fill(tmp, rings[1:], 0)
    mask |= tmp


def polys_of(geom):
    return geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]


def centroid_ll(poly):
    ring = poly[0]
    return sum(p[1] for p in ring) / len(ring), sum(p[0] for p in ring) / len(ring)


def disk(r_px):
    k = max(1, int(round(r_px * SS))) * 2 + 1
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))


def clean(mask, open_px=0.0, smooth_px=0.0):
    """Remove features thinner than ~2*open_px (piers) and round the coast a little."""
    m = mask.copy()
    if open_px:
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, disk(open_px))
    if smooth_px:
        s = smooth_px * SS
        b = cv2.GaussianBlur(m.astype(np.float32), (0, 0), s)
        m = (b > 0.5).astype(np.uint8)
    return m


def trace(mask, eps, min_area=1.0):
    """mask -> simplified outer rings in viewBox units (holes dropped: none matter at this scale)."""
    cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    rings = []
    for c in cs:
        if cv2.contourArea(c) < min_area * SS * SS:
            continue
        a = cv2.approxPolyDP(c, eps * SS, True)[:, 0, :].astype(np.float64)
        rings.append((a + 0.5) / SS - PAD)
    return rings


def path_d(rings):
    out = []
    for r in rings:
        if len(r) >= 3:
            out.append('M' + ' '.join(f'{x:.1f},{y:.1f}' for x, y in r) + 'Z')
    return ''.join(out)


def row_of(mask, y):
    return mask[int(round((y + PAD) * SS))]


def col_x(i):
    return i / SS - PAD


# ---------- build ----------

def main():
    boroughs = json.load(open(os.path.join(GEO, 'boroughs.geojson')))
    water = json.load(open(os.path.join(GEO, 'tiger_water.geojson')))
    by = {f['properties']['boroname']: polys_of(f['geometry']) for f in boroughs['features']}

    # Manhattan borough = the island + separate islands (+ a few Brooklyn piers, which are legally
    # New York County but physically Brooklyn -> treated as Brooklyn land).
    named = {
        'roosevelt': (40.7613, -73.9508), 'governors': (40.6881, -74.0192),
        'liberty': (40.6898, -74.0451), 'ellis': (40.6987, -74.0407), 'randalls': (40.7915, -73.9249),
    }
    man_polys = sorted(by['Manhattan'], key=lambda p: -len(p[0]))
    island_poly = man_polys[0]
    islands, stray = {}, []
    for p in man_polys[1:]:
        la, lo = centroid_ll(p)
        hit = [k for k, (a, b) in named.items() if abs(a - la) < 0.004 and abs(b - lo) < 0.006]
        (islands.__setitem__(hit[0], p) if hit else stray.append(p))

    shapes = {}

    # Manhattan itself: piers off, coast slightly rounded.
    man_raw = blank()
    fill_polygon(man_raw, island_poly)
    man = clean(man_raw, open_px=2.3, smooth_px=0.8)
    shapes['MANHATTAN'] = path_d(trace(man, 0.42, 50))

    wet = blank()
    for f in water['features']:
        for p in polys_of(f['geometry']):
            fill_polygon(wet, p)

    def land_component_at(lat, lon):
        """The TIGER not-water blob under a point (e.g. all of Ellis Island, NJ half included)."""
        _, lab = cv2.connectedComponents((wet == 0).astype(np.uint8), connectivity=8)
        x, y = project(lat, lon)
        i = lab[int((y + PAD) * SS), int((x + PAD) * SS)]
        return (lab == i).astype(np.uint8) if i else blank()

    small = {}
    for k in ('roosevelt', 'governors', 'liberty', 'ellis'):
        m = blank()
        fill_polygon(m, islands[k])
        if k == 'ellis':
            m |= land_component_at(40.6990, -74.0400)
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, disk(1.2))
        small[k] = clean(m, open_px=0.5, smooth_px=0.4)
        rings = trace(small[k], 0.3, 4)
        shapes[k.upper()] = path_d(sorted(rings, key=lambda r: -cv2.contourArea(r.astype(np.float32)))[:1])

    # Neighbours (faded land). NYC data for Brooklyn/Queens/Bronx; New Jersey = not-water that
    # isn't NYC, west of the island.
    nyc_other = blank()
    for name in ('Brooklyn', 'Queens', 'Staten Island'):
        for p in by[name]:
            fill_polygon(nyc_other, p)
    for p in stray:
        fill_polygon(nyc_other, p)
    bronx = blank()
    for p in by['Bronx']:
        fill_polygon(bronx, p)
    randalls = blank()
    fill_polygon(randalls, islands['randalls'])

    nyc_all = nyc_other | bronx | randalls | man_raw
    for m in small.values():
        nyc_all |= m
    nj =((wet == 0) & (cv2.dilate(nyc_all, disk(2.0)) == 0)).astype(np.uint8)
    nj = cv2.morphologyEx(nj, cv2.MORPH_OPEN, disk(1.5))
    n, lab, stats, cent = cv2.connectedComponentsWithStats(nj, 8)
    keep = np.zeros(n, bool)
    man_cx = X_CENTER
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > 400 * SS * SS and col_x(cent[i][0]) < man_cx:
            keep[i] = True
    nj = keep[lab].astype(np.uint8)

    bq = clean(nyc_other, open_px=2.8, smooth_px=1.1)
    nj = clean(nj, open_px=2.8, smooth_px=1.1)
    bx = clean(bronx, open_px=1.8, smooth_px=0.9)
    rd = clean(randalls, open_px=1.0, smooth_px=0.6)
    shapes['BROOKLYN_QUEENS'] = path_d(trace(bq, 0.55, 6))
    shapes['BRONX'] = path_d(trace(bx, 0.55, 6))
    shapes['NEW_JERSEY'] = path_d(trace(nj, 0.55, 30))
    shapes['RANDALLS'] = path_d(trace(rd, 0.4, 2))

    # Central Park (+ reservoir and lakes from TIGER).
    cp = np.array([project(*ll) for ll in CP_CORNERS])
    shapes['CENTRAL_PARK'] = path_d([cp])
    cp_mask = blank()
    fill(cp_mask, [cp])
    cp_water = blank()
    for f in water['features']:
        nm = f['properties'].get('NAME') or ''
        if any(s in nm for s in ('Onassis', 'The Lake', 'Meer')):
            for p in polys_of(f['geometry']):
                fill_polygon(cp_water, p)
    cp_water = clean(cp_water & cv2.erode(cp_mask, disk(1.8)), smooth_px=0.5)
    shapes['CP_WATER'] = path_d(trace(cp_water, 0.4, 2))

    # River-label guides: mid-channel lines sampled bottom -> top, each fitted with one quadratic.
    def channel(y0, y1, left, right, seed):
        pts = []
        for y in np.arange(y0, y1 - 0.1, -3.0):
            lrow, rrow = row_of(left, y), row_of(right, y)
            s = int((seed(y) + PAD) * SS)
            li = np.nonzero(lrow[:s])[0]
            ri = np.nonzero(rrow[s:])[0]
            if len(li) and len(ri):
                pts.append(((li[-1] + s + ri[0]) / 2 / SS - PAD, y))
        return np.array(pts)

    def west_shore(mask):
        return lambda y: col_x(np.nonzero(row_of(mask, y))[0][0]) - 3

    def east_shore(mask):
        return lambda y: col_x(np.nonzero(row_of(mask, y))[0][-1]) + 3

    hud = channel(150, 30, nj, man, west_shore(man))
    east = channel(345, 228, man, bq, east_shore(man))

    def quad(pts):
        a, m, b = pts[0], pts[len(pts) // 2], pts[-1]
        c = 2 * m - (a + b) / 2
        return f'M{a[0]:.1f},{a[1]:.1f}Q{c[0]:.1f},{c[1]:.1f} {b[0]:.1f},{b[1]:.1f}'

    shapes['HUDSON_GUIDE'] = quad(hud)
    shapes['EAST_GUIDE'] = quad(east[::-1])   # top -> bottom so the slanted label reads upright

    lib = project(*LIBERTY_LL)
    x0, y0, a, b, c, d = affine()

    def term(k, v):
        return f'{"-" if k < 0 else "+"} {abs(k):.4f} * {v}'

    docs = {
        'MANHATTAN': 'Manhattan island (Harlem runs off the top edge).',
        'ROOSEVELT': 'Roosevelt Island.',
        'GOVERNORS': 'Governors Island.',
        'LIBERTY': 'Liberty Island.',
        'ELLIS': 'Ellis Island (both the New York and New Jersey parts).',
        'RANDALLS': "Randall's / Wards Island (mostly off the top edge; drawn as faded land).",
        'BROOKLYN_QUEENS': 'Brooklyn + Queens, merged (faded land on the right).',
        'BRONX': 'The Bronx (empty: it is above the top edge at this crop).',
        'NEW_JERSEY': 'New Jersey waterfront (faded land on the left).',
        'CENTRAL_PARK': 'Central Park (real corners: 59 St / 110 St x 5 Av / Central Park West).',
        'CP_WATER': 'Reservoir, the Lake and Harlem Meer inside Central Park.',
        'HUDSON_GUIDE': 'Mid-channel guide for the HUDSON RIVER label (bottom -> top).',
        'EAST_GUIDE': 'Mid-channel guide for the EAST RIVER label (top -> bottom).',
    }
    out = [
        '// Generated by tools/subway_map.py - do not edit by hand (re-run the script instead).',
        '// Real shorelines: NYC Open Data "Borough Boundaries" (clipped to shoreline) + US Census TIGER',
        '// area hydrography (New Jersey waterfront, Central Park reservoir). Piers removed, coast smoothed.',
        f'// Projection: equirectangular, rotated {math.degrees(THETA):.0f} deg so the street grid runs vertically,',
        f'// x stretched x{STRETCH} around the island (schematic, like the MTA map), {SCALE:g} px/km, viewBox {W}x{H}.',
        '',
        f'export const MAP_W = {W}',
        f'export const MAP_H = {H}',
        '',
        '/** Real lat/lon -> map coordinates (the projection the shapes below were built with). */',
        'export function project(lat: number, lon: number): [number, number] {',
        f'  const dLon = lon - ({LON0})',
        f'  const dLat = lat - {LAT0}',
        f'  return [{x0:.3f} {term(a, "dLon")} {term(b, "dLat")}, {y0:.3f} {term(c, "dLon")} {term(d, "dLat")}]',
        '}',
        '',
    ]
    total = 0
    for k, doc in docs.items():
        out.append(f'/** {doc} */')
        out.append(f"export const {k} = '{shapes[k]}'")
        total += len(shapes[k])
    out += ['', '/** Statue of Liberty (map coords). */', f'export const LIBERTY_AT: [number, number] = [{lib[0]:.1f}, {lib[1]:.1f}]', '']
    src = '\n'.join(out)
    with open(OUT, 'w') as fh:
        fh.write(src)
    print(f'wrote {OUT}  ({len(src) / 1024:.1f} KB, paths {total / 1024:.1f} KB)')
    for k in docs:
        print(f'  {k:16s} {len(shapes[k]):6d} chars')
    if len(sys.argv) > 1:
        preview(sys.argv[1], shapes, [hud, east])


def preview(path, shapes, guides):
    s = 2
    img = np.full((H * s, W * s, 3), (247, 227, 191), np.uint8)   # water (BGR)

    def draw(d, color, outline=None, thick=2):
        for part in d.split('M')[1:]:
            pts = np.array([[float(v) for v in p.split(',')] for p in part.rstrip('Z').split(' ')]) * s
            pts = np.round(pts * 4).astype(np.int32)
            cv2.fillPoly(img, [pts], color, cv2.LINE_AA, shift=2)
            if outline:
                cv2.polylines(img, [pts], True, outline, thick * s, cv2.LINE_AA, shift=2)

    for k in ('NEW_JERSEY', 'BROOKLYN_QUEENS', 'BRONX', 'RANDALLS'):
        if shapes[k]:
            draw(shapes[k], (215, 232, 240), (170, 180, 190), 1)
    for k in ('MANHATTAN', 'ROOSEVELT', 'GOVERNORS', 'LIBERTY', 'ELLIS'):
        draw(shapes[k], (231, 248, 255), (64, 33, 29), 2)
    draw(shapes['CENTRAL_PARK'], (138, 220, 168), (64, 33, 29), 1)
    draw(shapes['CP_WATER'], (239, 210, 159))
    for g in guides:
        pts = np.round(g * s * 4).astype(np.int32)
        cv2.polylines(img, [pts], False, (184, 141, 79), 1, cv2.LINE_AA, shift=2)
    stations = {
        '86': (40.7795, -73.9555), 'CC': (40.7681, -73.9819), '5Av': (40.7648, -73.9732),
        'Rock': (40.7586, -73.9813), 'TSq': (40.7553, -73.9869), 'GCT': (40.7527, -73.9772),
        'Herald': (40.7497, -73.9879), '14': (40.7400, -74.0021), 'Prince': (40.7243, -73.9977),
        'Canal': (40.7190, -74.0002), 'BBCH': (40.7132, -74.0042), 'SF': (40.7019, -74.0131),
    }
    for k, ll in stations.items():
        x, y = project(*ll)
        cv2.circle(img, (int(x * s), int(y * s)), 8 * s, (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(img, (int(x * s), int(y * s)), 8 * s, (64, 33, 29), 3, cv2.LINE_AA)
        cv2.putText(img, k, (int(x * s) + 20, int(y * s) + 8), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (64, 33, 29), 2, cv2.LINE_AA)
        print(f'  {k:7s} {x:6.1f} {y:6.1f}')
    cv2.imwrite(path, img)
    print('preview ->', path)


if __name__ == '__main__':
    main()
