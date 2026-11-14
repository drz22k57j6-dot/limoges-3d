"""Environnement proche d'un bâtiment pilote : haies (LiDAR), cheminements (OSM), mobilier (OSM), lampadaires probables (LiDAR).
Usage : python3 -I environnement.py <dl> <profil.json> <rayon_m> <sortie.json>"""
import sys, json, glob, numpy as np, tifffile, pyarrow.parquet as pq, shapely
from shapely.geometry import Point, Polygon, shape
from shapely import contains_xy
from scipy import ndimage
from pyproj import Transformer
D, PR, RAD, OUT = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
X0, Y0 = 562924, 6528957
P = json.load(open(PR)); E = np.asarray(P['empreinte'])
cx, cy = X0 + E[:, 0].mean(), Y0 - E[:, 1].mean()
area = Point(cx, cy).buffer(RAD)
t = Transformer.from_crs(4326, 2154, always_xy=True)
loc = lambda x, y: [round(x - X0, 2), round(-(y - Y0), 2)]
# buildings and roads to exclude vegetation / furniture
bats = [shape(f['geometry']) for f in json.load(open(f'{D}/bat.json'))['features']]
bats = [b for b in bats if b.distance(Point(cx, cy)) < RAD + 50]
road = shapely.from_wkb(open('/tmp/b4/chaussee_v3.wkb', 'rb').read()) if len(sys.argv) < 6 else None
def tiles(prefix):
    T = []
    for fn in glob.glob(f'{D}/mns/{prefix}_*.tif'):
        tf = tifffile.TiffFile(fn); tags = {k.name: k.value for k in tf.pages[0].tags.values()}
        T.append((tags['ModelTiepointTag'][3], tags['ModelTiepointTag'][4], tags['ModelPixelScaleTag'][0], tf.pages[0].asarray()))
    return T
def sample(T, x, y):
    out = np.full(x.shape, np.nan)
    for (tx, ty, s, A) in T:
        c = ((x - tx) / s).astype(int); r = ((ty - y) / s).astype(int)
        ok = (c >= 0) & (r >= 0) & (c < A.shape[1]) & (r < A.shape[0]); out[ok] = A[r[ok], c[ok]]
    return out
xs = np.arange(cx - RAD, cx + RAD, 0.5); ys = np.arange(cy + RAD, cy - RAD, -0.5)
GX, GY = np.meshgrid(xs, ys)
H = sample(tiles('mns'), GX, GY) - sample(tiles('mnt'), GX, GY)
free = contains_xy(area, GX, GY)
for b in bats: free &= ~contains_xy(b.buffer(1.0), GX, GY)
if road is not None: free &= ~contains_xy(road.buffer(0.5), GX, GY)
# hedges: low dense vegetation 0.6–2.6 m forming elongated groups (a tree crown is higher)
low = free & (H > 0.6) & (H < 2.6)
lab, n = ndimage.label(low)
hedges = []
for k, sl in enumerate(ndimage.find_objects(lab), 1):
    m = lab[sl] == k; c = m.sum()
    if c < 12: continue
    px = GX[sl][m]; py = GY[sl][m]; pts = np.c_[px, py]; mu = pts.mean(0)
    u, s_, vt = np.linalg.svd(pts - mu, full_matrices=False); pr = (pts - mu) @ vt.T
    L, W = np.ptp(pr[:, 0]) + 0.5, np.ptp(pr[:, 1]) + 0.5
    if W > 3.5 or L / W < 2.5: continue        # not hedge-shaped (bushes, parked cars...)
    hedges.append({'x': loc(*mu)[0], 'z': loc(*mu)[1], 'long_m': round(L, 2), 'larg_m': round(min(W, 1.6), 2), 'haut_m': round(float(np.percentile(H[sl][m], 80)), 2),
                   'angle': round(float(np.arctan2(vt[0, 1], vt[0, 0])), 3)})
# probable street lamps: thin isolated objects 4–12 m high with nothing high around
tall = free & (H > 4) & (H < 12)
lab, n = ndimage.label(tall)
lamps = []
for k, sl in enumerate(ndimage.find_objects(lab), 1):
    m = lab[sl] == k
    if m.sum() > 4: continue
    r0, c0 = sl[0].start, sl[1].start; R_ = 6
    win = H[max(0, r0 - R_):r0 + R_ + 1, max(0, c0 - R_):c0 + R_ + 1]
    if np.nansum(win > 2.5) > 6: continue      # part of a tree
    px = GX[sl][m].mean(); py = GY[sl][m].mean()
    lamps.append({'x': loc(px, py)[0], 'z': loc(px, py)[1], 'haut_m': round(float(np.nanmax(H[sl][m])), 2)})
# OSM / Overture: paths and furniture
seg = pq.read_table(f'{D}/overture_segments.parquet').to_pandas()
paths = []
for _, r in seg.iterrows():
    if r['class'] not in ('footway', 'path', 'steps', 'pedestrian', 'cycleway'): continue
    g = shapely.from_wkb(r['geometry']); C = np.array([t.transform(*c[:2]) for c in g.coords])
    if not area.intersects(shapely.LineString(C)): continue
    w = 1.5 if r['class'] == 'path' else 2.0
    if str(r['subclass']) == 'sidewalk': w = 1.8
    paths.append({'classe': r['class'], 'sous_classe': None if str(r['subclass']) == 'nan' else str(r['subclass']), 'largeur_m': w, 'points': [loc(x, y) for x, y in C]})
inf = pq.read_table(f'{D}/overture_infra.parquet').to_pandas()
furn = []
KEEP = {'recycling', 'waste_disposal', 'waste_basket', 'bench', 'bus_stop', 'bicycle_parking', 'street_lamp', 'bollard', 'post_box'}
for _, r in inf.iterrows():
    if r['class'] not in KEEP: continue
    g = shapely.from_wkb(r['geometry']).centroid; x, y = t.transform(g.x, g.y)
    if area.contains(Point(x, y)): furn.append({'classe': r['class'], 'x': loc(x, y)[0], 'z': loc(x, y)[1]})
out = {'batiment': P['id'], 'rayon_m': RAD,
       'haies': hedges, 'lampadaires_probables': lamps, 'cheminements': paths, 'mobilier': furn,
       'provenance': {'haies': 'IGN LiDAR HD MNS−MNT 0,5 m : végétation 0,6–2,6 m de forme allongée — mesuré (forme = boîte englobante)',
                      'lampadaires_probables': 'IGN LiDAR HD : objets fins isolés de 4 à 12 m — DÉTECTION PROBABLE, non confirmée',
                      'cheminements': 'OpenStreetMap via Overture 2026-10-21 (ODbL) — tracé mesuré, largeur estimée par classe',
                      'mobilier': 'OpenStreetMap via Overture (ODbL) — position mesurée, modèle générique'}}
json.dump(out, open(OUT, 'w'), ensure_ascii=False)
print('haies', len(hedges), 'lampes', len(lamps), 'chemins', len(paths), 'mobilier', len(furn))
