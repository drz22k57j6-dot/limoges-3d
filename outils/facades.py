"""Real facade colours from Panoramax street photos (pilot area).
For every wall of every building: find photos that see it (distance, angle, no building or tree in between),
project the wall point into the photo, read the wall pixels (rejecting sky, vegetation, windows/shadows),
and combine all views into one colour per building, with the number of views as confidence."""
import json, math, os, sys
import numpy as np, tifffile
from PIL import Image
from shapely.geometry import shape, Polygon, MultiPolygon, LineString
from shapely.geometry.polygon import orient
from shapely import STRtree
from pyproj import Transformer

D = '/home/claude/dl'; IMG = '/home/claude/pano/img'
X0, Y0, R = 562924.0, 6528957.0, 3000.0
PILOT = 1000.0
XMIN, YMAX = X0-R, Y0+R

def mosaic(prefix):
    a = np.zeros((3000, 3000), np.float32)
    for i in range(3):
        for j in range(3):
            a[(2-j)*1000:(3-j)*1000, i*1000:(i+1)*1000] = tifffile.imread(f"{D}/{prefix}_{i}_{j}.tif")
    return a
MNT = mosaic('mnt'); MNH = mosaic('mnh')
def rh(A, x, y):
    c = np.clip(((np.asarray(x)-XMIN)/2).astype(int), 0, 2999); r = np.clip(((YMAX-np.asarray(y))/2).astype(int), 0, 2999)
    return A[r, c]

# ---- photos
tr = Transformer.from_crs(4326, 2154, always_xy=True)
photos = []
for f in json.load(open('/home/claude/pano/meta.json')):
    p = f'{IMG}/{f["id"]}.jpg'
    if not os.path.exists(p): continue
    lo, la = f['geometry']['coordinates'][:2]; x, y = tr.transform(lo, la)
    pr = f['properties']; fov = (pr.get('pers:interior_orientation') or {}).get('field_of_view')
    az = pr.get('view:azimuth')
    if az is None or fov is None: continue
    photos.append(dict(id=f['id'], path=p, x=x, y=y, z=float(rh(MNT, x, y))+2.4, az=float(az), fov=float(fov),
                       date=pr.get('datetime', '')[:10]))
PX = np.array([[p['x'], p['y']] for p in photos])
print('photos', len(photos))

# ---- buildings in pilot
B = json.load(open(f'{D}/bat.json'))['features']
polys, ids, heights = [], [], []
for f in B:
    g = shape(f['geometry'])
    for poly in (g.geoms if isinstance(g, MultiPolygon) else [g]):
        poly = Polygon([(x, y) for x, y, *_ in poly.exterior.coords])
        if not poly.is_valid or poly.area < 6: continue
        polys.append(orient(poly.simplify(0.25), 1.0)); ids.append(f['properties']['cleabs'])
        heights.append(float(f['properties'].get('hauteur') or 4.0))
tree = STRtree(polys)
sel = [i for i, p in enumerate(polys) if (p.centroid.x-X0)**2+(p.centroid.y-Y0)**2 < PILOT**2]
print('buildings in pilot', len(sel))

# ---- sample points on walls
samples = []  # (bidx, x, y, z, nx, ny)
for bi in sel:
    poly = polys[bi]; ex = np.asarray(poly.exterior.coords)
    ground = float(np.mean(rh(MNT, ex[:, 0], ex[:, 1]))); h = heights[bi]
    zs = [ground + min(max(0.38*h, 1.8), 7.0)]
    if h > 7: zs.append(ground + min(0.65*h, 14.0))
    for a, b in zip(ex[:-1], ex[1:]):
        L = math.hypot(*(b-a))
        if L < 2.5: continue
        d = (b-a)/L; n = np.array([d[1], -d[0]])  # outward normal for CCW ring (right side)
        for t in ((0.5,) if L < 8 else (0.25, 0.5, 0.75)):
            p = a+(b-a)*t
            for z in zs: samples.append((bi, p[0], p[1], z, n[0], n[1]))
S = np.array(samples)
print('samples', len(S))

# ---- candidate pairs
cell = 50.0
grid = {}
for k, (x, y) in enumerate(PX): grid.setdefault((int(x//cell), int(y//cell)), []).append(k)
pairs = []
for si, (bi, x, y, z, nx, ny) in enumerate(S):
    cx, cy = int(x//cell), int(y//cell)
    for i in range(cx-1, cx+2):
        for j in range(cy-1, cy+2):
            for k in grid.get((i, j), ()):
                dx, dy = PX[k, 0]-x, PX[k, 1]-y; d = math.hypot(dx, dy)
                if d < 4 or d > 60: continue
                if (dx*nx+dy*ny)/d < 0.35: continue  # photo must face the wall (< ~70°)
                pairs.append((si, k, d))
print('candidate pairs', len(pairs))

# occlusion by buildings (2D) and by trees (LiDAR canopy height along the ray)
keep = []
lines = []
for si, k, d in pairs:
    bi, x, y, z, nx, ny = S[si]
    lines.append(LineString([(PX[k, 0], PX[k, 1]), (x+nx*0.4, y+ny*0.4)]))
hit = tree.query(lines, predicate='intersects')
blocked = np.zeros(len(pairs), bool); blocked[np.unique(hit[0])] = True
for pi, (si, k, d) in enumerate(pairs):
    if blocked[pi]: continue
    bi, x, y, z, nx, ny = S[si]; ph = photos[k]
    ts = np.linspace(0.08, 0.92, 14)
    rx = ph['x']+(x-ph['x'])*ts; ry = ph['y']+(y-ph['y'])*ts; rz = ph['z']+(z-ph['z'])*ts
    gz = rh(MNT, rx, ry); top = gz+rh(MNH, rx, ry)
    if np.any((rh(MNH, rx, ry) > 2.0) & (top > rz)): continue
    if np.any(gz > rz): continue
    keep.append((si, k, d))
print('visible pairs', len(keep))

# ---- read pixels, grouped by photo
by_photo = {}
for si, k, d in keep: by_photo.setdefault(k, []).append((si, d))
obs = {}  # bidx -> list of (rgb, weight)
def wrap(a): return (a+180) % 360-180
for n_ph, (k, lst) in enumerate(by_photo.items()):
    ph = photos[k]
    try: im = np.asarray(Image.open(ph['path']).convert('RGB')).astype(np.float32)
    except Exception: continue
    H, W = im.shape[:2]
    for si, d in lst:
        bi, x, y, z, nx, ny = S[si]
        dx, dy, dz = x-ph['x'], y-ph['y'], z-ph['z']
        brg = math.degrees(math.atan2(dx, dy)); rel = wrap(brg-ph['az'])
        if ph['fov'] >= 359:
            px = W/2 + rel/360*W; el = math.atan2(dz, d); py = H/2 - el/math.pi*H
            half = max(2, min(22, 0.7/d*W/(2*math.pi)))
        else:
            if abs(rel) > ph['fov']/2-6: continue
            f = (W/2)/math.tan(math.radians(ph['fov']/2))
            fw = d*math.cos(math.radians(rel)); rt = d*math.sin(math.radians(rel))
            px = W/2 + f*rt/fw; py = H/2 - f*dz/fw
            half = max(2, min(22, f*0.7/fw))
        x0, x1 = int(px-half), int(px+half)+1; y0, y1 = int(py-half), int(py+half)+1
        if x0 < 0 or y0 < 0 or x1 > W or y1 > H: continue
        P = im[y0:y1, x0:x1].reshape(-1, 3)
        r, g, b = P[:, 0], P[:, 1], P[:, 2]; mx = P.max(1); mn = P.min(1); lum = P.mean(1)
        ok = (lum > 55) & (lum < 250)
        ok &= ~((g > r*1.04) & (g > b*1.04) & (mx-mn > 18))        # vegetation
        ok &= ~((b > r+6) & (lum > 150)) & ~((b > r+18) & (b > g+4))   # sky (bright bluish) / blue glass
        if ok.sum() < max(6, 0.25*len(P)): continue
        Q = P[ok]; ql = Q.mean(1); thr = np.percentile(ql, 35)
        Q = Q[ql >= thr]                                               # drop windows / dark joints
        col = np.median(Q, 0)
        if col[2] > col[0]+8 and col.mean() > 175: continue          # still sky
        w = (ok.mean()) * (1.0/(1.0+d/15.0)) * (1.2 if ph['date'] >= '2023' else 1.0)
        obs.setdefault(int(bi), []).append((col, w, ph['id']))
    if n_ph % 300 == 0: print('photo', n_ph, len(by_photo), flush=True)

# ---- aggregate per building
out = {}
for bi, lst in obs.items():
    C = np.array([c for c, w, i in lst]); Wt = np.array([w for c, w, i in lst])
    nviews = len(set(i for _, _, i in lst))
    if nviews < 1 or Wt.sum() < 0.08: continue
    # robust: weighted median per channel
    o = np.argsort(C.mean(1)); cw = np.cumsum(Wt[o]); m = o[np.searchsorted(cw, cw[-1]/2)]
    med = np.median(C[np.abs(C.mean(1)-C[m].mean()) < 35], 0) if len(C) > 2 else C[m]
    # photos of walls are usually in shade/overcast: lift brightness slightly, keep hue
    lum = med.mean(); gain = np.clip(185/lum, 1.0, 1.45) if lum < 185 else 1.0
    rgb = med*gain; mu = rgb.mean(); rgb = np.clip(mu + (rgb-mu)*1.45, 0, 255)  # photos are hazy/overcast: restore saturation
    out[ids[bi]] = {'rgb': [int(v) for v in rgb], 'src': f'photo Panoramax ({nviews} vue{"s" if nviews > 1 else ""})',
                    'vues': nviews, 'photos': sorted(set(i for _, _, i in lst))[:5]}
# ---- estimate unmeasured pilot buildings from measured neighbours of the same kind
def kind(bi):
    h = heights[bi]; a = polys[bi].area
    return 'tour' if h > 12 else ('maison' if a < 300 else 'autre')
meas = [(bi, np.array(out[ids[bi]]['rgb'], float)) for bi in sel if ids[bi] in out]
for bi in sel:
    if ids[bi] in out: continue
    c = polys[bi].centroid; k = kind(bi); near = []
    for bj, col in meas:
        if kind(bj) != k: continue
        dd = math.hypot(polys[bj].centroid.x-c.x, polys[bj].centroid.y-c.y)
        if dd < (650 if k == 'tour' else 200): near.append((dd, col))
    if len(near) >= 2:
        near.sort(key=lambda t: t[0]); cols = np.array([c_ for _, c_ in near[:6]])
        out[ids[bi]] = {'rgb': [int(v) for v in np.median(cols, 0)], 'src': f'estimation ({min(6, len(near))} voisins mesurés)', 'vues': 0}
json.dump(out, open(f'{D}/facades.json', 'w'))
print('with neighbour estimates', len(out))
print('buildings coloured from photos', len(out), 'of', len(sel))

if os.environ.get('DBG'):
    from PIL import ImageDraw
    import random; random.seed(3)
    picks = random.sample(list(by_photo.items()), 6)
    for n_, (k, lst) in enumerate(picks):
        ph = photos[k]; im = Image.open(ph['path']).convert('RGB'); W, H = im.size; dr = ImageDraw.Draw(im)
        for si, d in lst[:40]:
            bi, x, y, z, nx, ny = S[si]; dx, dy, dz = x-ph['x'], y-ph['y'], z-ph['z']
            rel = wrap(math.degrees(math.atan2(dx, dy))-ph['az'])
            if ph['fov'] >= 359: px = W/2+rel/360*W; py = H/2-math.atan2(dz, d)/math.pi*H
            else:
                f = (W/2)/math.tan(math.radians(ph['fov']/2)); fw = d*math.cos(math.radians(rel))
                if abs(rel) > ph['fov']/2: continue
                px = W/2+f*d*math.sin(math.radians(rel))/fw; py = H/2-f*dz/fw
            dr.rectangle([px-8, py-8, px+8, py+8], outline=(255, 0, 0), width=3)
        im.thumbnail((1024, 1024)); im.save(f'/home/claude/test/dbg{n_}.jpg'); print(n_, ph['fov'], ph['date'])
