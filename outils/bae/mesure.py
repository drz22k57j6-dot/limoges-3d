"""Building Appearance Engine — étape 1 : mesures d'un bâtiment à partir des données du projet.
Usage : python3 -I mesure.py <dossier dl> <cleabs BD TOPO> <sortie.json> [ban.json]
Tout ce qui sort d'ici est MESURÉ (avec sa source) ; rien n'est inventé."""
import sys, json, glob, numpy as np, tifffile
from PIL import Image
from shapely.geometry import shape, Point, Polygon, LineString
from scipy import ndimage
Image.MAX_IMAGE_PIXELS = None
D, BID, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
BAN = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else []
X0, Y0, R = 562924, 6528957, 3000

feat = next(f for f in json.load(open(f'{D}/bat.json'))['features'] if f['properties']['cleabs'] == BID)
P = feat['properties']; poly = shape(feat['geometry'])
poly = max(poly.geoms, key=lambda p: p.area) if poly.geom_type == 'MultiPolygon' else poly
poly = Polygon(np.asarray(poly.exterior.coords)[:, :2]).simplify(0.3)
if not poly.exterior.is_ccw: poly = Polygon(list(poly.exterior.coords)[::-1])
ring = np.asarray(poly.exterior.coords)[:-1]

# LiDAR HD 0.5 m tiles (MNS / MNT), 1100 m each
def tiles(prefix):
    T = []
    for fn in glob.glob(f'{D}/mns/{prefix}_*.tif'):
        t = tifffile.TiffFile(fn); tags = {k.name: k.value for k in t.pages[0].tags.values()}
        T.append((tags['ModelTiepointTag'][3], tags['ModelTiepointTag'][4], tags['ModelPixelScaleTag'][0], t.pages[0].asarray()))
    return T
def sample(T, x, y):
    out = np.full(len(x), np.nan)
    for (tx, ty, s, A) in T:
        c = ((x - tx) / s).astype(int); r = ((ty - y) / s).astype(int)
        ok = (c >= 0) & (r >= 0) & (c < A.shape[1]) & (r < A.shape[0])
        out[ok] = A[r[ok], c[ok]]
    return out
MNS, MNT05 = tiles('mns'), tiles('mnt')
minx, miny, maxx, maxy = poly.bounds
gx, gy = np.meshgrid(np.arange(minx - 6, maxx + 6, 0.5), np.arange(miny - 6, maxy + 6, 0.5))
gx = gx.ravel(); gy = gy.ravel()
from shapely import contains_xy
inner = contains_xy(poly.buffer(-1.5), gx, gy); inside = contains_xy(poly, gx, gy)
ns = sample(MNS, gx, gy); nt = sample(MNT05, gx, gy)
roof = float(np.nanmedian(ns[inner]))
# parapet: highest values in the 1 m band inside the outline
band = inside & ~contains_xy(poly.buffer(-1.0), gx, gy)
acro = float(np.nanpercentile(ns[band], 90))
# ground all around: MNT 0.5 m sampled 1.5 m outside each vertex
def ground_at(px, py):
    return float(np.nanmedian(sample(MNT05, np.array([px]), np.array([py]))))
ring_out = poly.buffer(1.5, join_style=2)
gr = []
for (x, y) in ring:
    q = ring_out.exterior.interpolate(ring_out.exterior.project(Point(x, y)))
    gr.append(round(ground_at(q.x, q.y), 2))
# roof equipment: connected cells > roof + 1 m inside the outline
H = np.where(inner, ns, np.nan).reshape(-1)
nx = int(round((maxx + 6 - (minx - 6)) / 0.5)); grid = (ns.reshape(-1, len(np.arange(minx - 6, maxx + 6, 0.5))))
gin = inner.reshape(grid.shape)
mask = gin & (grid > roof + 1.0)
lab, n = ndimage.label(mask)
equip = []
X2 = gx.reshape(grid.shape); Y2 = gy.reshape(grid.shape)
for k in range(1, n + 1):
    m = lab == k
    if m.sum() < 3: continue
    xs, ys = X2[m], Y2[m]
    pts = np.c_[xs, ys]; c = pts.mean(0); u, s_, vt = np.linalg.svd(pts - c)
    a = np.arctan2(vt[0, 1], vt[0, 0]); pr = (pts - c) @ vt.T
    equip.append({'x': round(c[0] - X0, 2), 'z': round(-(c[1] - Y0), 2), 'long_m': round(np.ptp(pr[:, 0]) + 0.5, 2), 'larg_m': round(np.ptp(pr[:, 1]) + 0.5, 2),
                  'haut_m': round(float(np.nanpercentile(grid[m], 90) - roof), 2), 'angle': round(float(a), 3), 'cellules': int(m.sum())})
# roof colour from BD ORTHO
def ortho_rgb(xs, ys):
    out = []
    for x, y in zip(xs, ys):
        i = int((x - (X0 - R)) // 2000); j = int((y - (Y0 - R)) // 2000)
        im = Image.open(f'{D}/ortho_{i}_{j}.jpg') if (i, j) not in _oc else _oc[(i, j)]
        _oc[(i, j)] = im; s = 2000 / im.size[0]
        px = int((x - (X0 - R + 2000 * i)) / s); py = int((Y0 - R + 2000 * (j + 1) - y) / s)
        out.append(im.getpixel((min(px, im.size[0] - 1), min(py, im.size[1] - 1))))
    return np.asarray(out)
_oc = {}
sel = np.flatnonzero(inner)[::7]
rgb = np.median(ortho_rgb(gx[sel], gy[sel]), 0).astype(int).tolist()
# entrances: BAN address points projected on the outline
ent = []
L = poly.exterior
for (num, x, y, bid) in BAN:
    p = Point(x, y); s = L.project(p); q = L.interpolate(s)
    ent.append({'numero': num, 'ban_id': bid, 's': round(s, 2), 'distance_ban_m': round(p.distance(q), 2), 'x': round(q.x - X0, 2), 'z': round(-(q.y - Y0), 2)})
sol = float(np.median(gr))
out = {
  'id': BID, 'bdtopo': {k: P.get(k) for k in ('nature', 'usage_1', 'nombre_d_etages', 'hauteur', 'altitude_minimale_sol', 'altitude_maximale_toit')},
  'empreinte_local': [[round(x - X0, 2), round(-(y - Y0), 2)] for (x, y) in ring],
  'empreinte_source': 'IGN BD TOPO batiment (Licence Ouverte 2.0), simplifiée 0,3 m',
  'sol_alt_par_sommet': gr, 'sol_alt_median': round(sol, 2),
  'toit_alt_lidar': round(roof, 2), 'acrotere_alt_lidar': round(acro, 2),
  'hauteur_toit_lidar_m': round(roof - sol, 2), 'hauteur_acrotere_lidar_m': round(acro - sol, 2),
  'lidar_source': 'IGN LiDAR HD MNS/MNT 0,5 m (Licence Ouverte 2.0)',
  'equipements_toit_lidar': equip,
  'toit_rgb_ortho': rgb, 'ortho_source': 'IGN BD ORTHO HR (Licence Ouverte 2.0), médiane des pixels du toit',
  'entrees_ban': ent, 'ban_source': 'Base Adresse Nationale via géocodeur Géoplateforme (Licence Ouverte 2.0) — position de l\'adresse, pas forcément la porte',
  'perimetre_m': round(L.length, 1), 'surface_m2': round(poly.area, 1)}
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in out.items() if k not in ('empreinte_local', 'sol_alt_par_sommet', 'entrees_ban')}, ensure_ascii=False)[:2500])
print('entrées', [(e['numero'], e['s'], e['distance_ban_m']) for e in ent])
