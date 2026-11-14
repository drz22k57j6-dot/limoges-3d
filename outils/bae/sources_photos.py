"""Pour chaque bâtiment d'une zone : photos Panoramax (CC-BY-SA) qui le voient vraiment (champ, distance, occlusion 3D bâtiments + arbres).
Usage : python3 -I sources_photos.py <dl> <liste_ids.json> <sortie.json> <dossier_vignettes>"""
import json, math, os, sys, numpy as np, tifffile
from PIL import Image
from shapely.geometry import shape, Polygon, LineString, Point
from shapely import STRtree
from pyproj import Transformer
D, IDS, OUT, VIG = sys.argv[1:5]; os.makedirs(VIG, exist_ok=True)
X0, Y0, R = 562924.0, 6528957.0, 3000.0; XMIN, YMAX = X0 - R, Y0 + R
def mosaic(prefix):
    a = np.zeros((3000, 3000), np.float32)
    for i in range(3):
        for j in range(3): a[(2 - j) * 1000:(3 - j) * 1000, i * 1000:(i + 1) * 1000] = tifffile.imread(f"{D}/{prefix}_{i}_{j}.tif")
    return a
MNT = mosaic('mnt'); MNH = mosaic('mnh')
def rh(A, x, y):
    c = np.clip(((np.asarray(x) - XMIN) / 2).astype(int), 0, 2999); r = np.clip(((YMAX - np.asarray(y)) / 2).astype(int), 0, 2999); return A[r, c]
tr = Transformer.from_crs(4326, 2154, always_xy=True)
photos = []
for f in json.load(open('/home/claude/pano/meta.json')):
    p = f'/home/claude/pano/img/{f["id"]}.jpg'
    if not os.path.exists(p): continue
    pr = f['properties']; fov = (pr.get('pers:interior_orientation') or {}).get('field_of_view'); az = pr.get('view:azimuth')
    if fov is None or az is None: continue
    x, y = tr.transform(*f['geometry']['coordinates'][:2])
    photos.append(dict(id=f['id'], path=p, x=x, y=y, z=float(rh(MNT, x, y)) + 2.4, az=float(az), fov=float(fov), date=pr.get('datetime', '')[:10],
                       licence=pr.get('license'), auteur=(pr.get('geovisio:producer') or ''), coll=f.get('collection')))
want = set(json.load(open(IDS)))
B = json.load(open(f'{D}/bat.json'))['features']
polys, hs, bid = [], [], []
for f in B:
    g = shape(f['geometry']); g = max(g.geoms, key=lambda q: q.area) if g.geom_type == 'MultiPolygon' else g
    polys.append(Polygon(np.asarray(g.exterior.coords)[:, :2])); hs.append(float(f['properties'].get('hauteur') or 4)); bid.append(f['properties']['cleabs'])
tree = STRtree(polys)
def wrap(a): return (a + 180) % 360 - 180
res = {}
for bi, b in enumerate(bid):
    if b not in want: continue
    poly = polys[bi]; h = hs[bi]; c = poly.centroid; ground = float(rh(MNT, c.x, c.y)); zt = ground + 0.7 * h
    maxd = 60 + 6 * h
    cand = []
    for ph in photos:
        d = math.hypot(ph['x'] - c.x, ph['y'] - c.y)
        if d > maxd or d < 3: continue
        rel = wrap(math.degrees(math.atan2(c.x - ph['x'], c.y - ph['y'])) - ph['az'])
        if ph['fov'] < 359 and abs(rel) > ph['fov'] / 2 - 5: continue
        # ray to the nearest point of the outline at 70 % of the height
        q = poly.exterior.interpolate(poly.exterior.project(Point(ph['x'], ph['y'])))
        ray = LineString([(ph['x'], ph['y']), (q.x, q.y)]); L = ray.length or 1
        blocked = False
        for j in tree.query(ray, predicate='intersects'):
            if j == bi: continue
            ip = polys[j].intersection(ray)
            if ip.is_empty: continue
            t = Point(ph['x'], ph['y']).distance(ip) / L
            zr = ph['z'] + (zt - ph['z']) * t
            if float(rh(MNT, polys[j].centroid.x, polys[j].centroid.y)) + hs[j] > zr: blocked = True; break
        if blocked: continue
        ts = np.linspace(0.1, 0.9, 12); rx = ph['x'] + (q.x - ph['x']) * ts; ry = ph['y'] + (q.y - ph['y']) * ts; rz = ph['z'] + (zt - ph['z']) * ts
        veg = rh(MNH, rx, ry); gz = rh(MNT, rx, ry)
        if np.sum((veg > 3) & (gz + veg > rz)) > 2: continue
        cand.append((d, rel, ph))
    cand.sort(key=lambda t: t[0] * (0.7 if t[2]['date'] >= '2025' else 1.0))
    out = []
    for d, rel, ph in cand[:4]:
        out.append({'id': ph['id'], 'date': ph['date'], 'distance_m': round(d, 1), 'licence': ph['licence'], 'auteur': ph['auteur'],
                    'url': f"https://api.panoramax.xyz/#focus=pic&pic={ph['id']}"})
    if cand:   # thumbnail of the best view, centred on the building
        d, rel, ph = cand[0]
        im = Image.open(ph['path']).convert('RGB'); W, H = im.size
        if ph['fov'] >= 359: px = W / 2 + rel / 360 * W; span = max(0.06, min(0.4, (math.degrees(2 * math.atan2(max(poly.length / 4, 8), d)) / 360))) * W
        else:
            f_ = (W / 2) / math.tan(math.radians(ph['fov'] / 2)); px = W / 2 + f_ * math.tan(math.radians(rel)); span = min(W, f_ * 2 * max(poly.length / 4, 8) / d)
        x0 = int(max(0, px - span / 2 - 20)); x1 = int(min(W, px + span / 2 + 20))
        crop = im.crop((x0, int(H * 0.12), max(x1, x0 + 50), int(H * 0.62))); crop.thumbnail((420, 420)); crop.save(f'{VIG}/{b}.jpg')
    res[b] = {'hauteur_m': hs[bi], 'photos': out}
json.dump(res, open(OUT, 'w'), ensure_ascii=False)
print('bâtiments', len(res), 'avec photo', sum(1 for v in res.values() if v['photos']), 'hauts>=12 avec photo', sum(1 for v in res.values() if v['photos'] and v['hauteur_m'] >= 12), '/', sum(1 for v in res.values() if v['hauteur_m'] >= 12))
