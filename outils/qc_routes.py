"""Quality control of the road network: OSM (Overture) vs IGN BD TOPO vs the 3D result."""
import json, struct, math, numpy as np, tifffile, collections
import pyarrow.parquet as pq, shapely.wkb as swkb
from shapely.geometry import LineString, Point, shape
from shapely import STRtree
from pyproj import Transformer
from PIL import Image, ImageDraw
D, B = '/home/claude/dl', '/tmp/b4'
X0, Y0, R = 562924.0, 6528957.0, 3000.0
tr = Transformer.from_crs(4326, 2154, always_xy=True)
# --- 3D result: road axes as exported to the game (x, z local, surface height, widths)
b = open(f'{B}/routes_axes.bin', 'rb').read(); n = struct.unpack('<I', b[4:8])[0]; o = 8
H0 = struct.unpack('<f', open(f'{B}/relief.bin', 'rb').read()[:4])[0]
axes = []
for i in range(n):
    nid, w, m = struct.unpack('<IfI', b[o:o + 12]); o += 12
    a = np.frombuffer(b[o:o + m * 20], np.float32).reshape(m, 5); o += m * 20
    axes.append((w, a))
graph = json.load(open(f'{B}/graphe_routier.json'))
lines = [LineString(np.c_[a[:, 0] + X0, -a[:, 1] + Y0]) for w, a in axes]
tree = STRtree(lines)
surf = swkb.loads(open(f'{B}/chaussee_v3.wkb', 'rb').read())
rep = {}
# 1. roads in OpenStreetMap that the IGN network (and so the 3D) lacks
DRIVE = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service'}
miss, tot_len, miss_len = [], 0.0, collections.Counter()
for r in pq.read_table(f'{D}/overture_segments.parquet').to_pylist():
    if r['subtype'] != 'road' or r['class'] not in DRIVE: continue
    g = swkb.loads(r['geometry']); xs, ys = tr.transform(*zip(*g.coords)); ln = LineString(list(zip(xs, ys)))
    if abs(ln.centroid.x - X0) > R or abs(ln.centroid.y - Y0) > R: continue
    tot_len += ln.length
    pts = [ln.interpolate(t) for t in np.linspace(0, ln.length, max(2, int(ln.length / 5)))]
    near = np.array([lines[tree.nearest(p)].distance(p) < 7 for p in pts])
    if near.mean() < 0.5:
        miss_len[r['class']] += ln.length
        miss.append({'classe': r['class'], 'nom': (r['names'] or {}).get('primary'), 'longueur_m': round(ln.length, 1), 'x': round(ln.centroid.x - X0, 1), 'z': round(-(ln.centroid.y - Y0), 1)})
rep['osm_absentes'] = {'longueur_osm_m': round(tot_len), 'longueur_absente_m': {k: round(v) for k, v in miss_len.items()}, 'nombre': len(miss), 'liste': sorted(miss, key=lambda m: -m['longueur_m'])[:300]}
# 2. altitude of the driving surface vs LiDAR HD ground model (2 m)
MNT = np.zeros((3000, 3000), np.float32)
for i in range(3):
    for j in range(3): MNT[(2 - j) * 1000:(3 - j) * 1000, i * 1000:(i + 1) * 1000] = tifffile.imread(f'{D}/mnt_{i}_{j}.tif')
bad, dzs = [], []
bridges = {e['id'] for e in graph['edges'] if e['pont']}
for li, (w, a) in enumerate(axes):
    if li in bridges: continue
    X = a[:, 0] + X0; Y = -a[:, 1] + Y0
    c = np.clip(((X - (X0 - R)) / 2).astype(int), 0, 2999); rr = np.clip((((Y0 + R) - Y) / 2).astype(int), 0, 2999)
    dz = (a[:, 2] + H0) - MNT[rr, c] - 0.22
    dzs.append(dz)
    k = np.argmax(np.abs(dz))
    if abs(dz[k]) > 1.0: bad.append({'route': li, 'ecart_m': round(float(dz[k]), 2), 'x': round(float(a[k, 0]), 1), 'z': round(float(a[k, 1]), 1)})
dz = np.concatenate(dzs)
rep['altitude'] = {'ecart_median_m': round(float(np.median(np.abs(dz))), 3), 'ecart_p95_m': round(float(np.percentile(np.abs(dz), 95)), 3), 'points_hors_1m': int((np.abs(dz) > 1).sum()), 'routes_signalees': len(bad), 'liste': sorted(bad, key=lambda b: -abs(b['ecart_m']))[:200]}
# 3. connectivity of the graph, dangling ends close to another road
par = list(range(len(graph['nodes'])))
def f(x):
    while par[x] != x: par[x] = par[par[x]]; x = par[x]
    return x
deg = collections.Counter()
for e in graph['edges']:
    par[f(e['a'])] = f(e['b']); deg[e['a']] += 1; deg[e['b']] += 1
comp = collections.Counter(f(i) for i in range(len(graph['nodes'])))
sizes = sorted(comp.values(), reverse=True)
dangling = []
for i, (x, z) in enumerate(graph['nodes']):
    if deg[i] != 1: continue
    p = Point(x + X0, -z + Y0)
    ds = sorted(lines[j].distance(p) for j in tree.query(p.buffer(8)))
    if len(ds) >= 2 and 0.6 < ds[1] < 8: dangling.append({'x': x, 'z': z, 'distance_m': round(ds[1], 2)})
rep['connexions'] = {'noeuds': len(graph['nodes']), 'troncons': len(graph['edges']), 'composantes': len(sizes), 'plus_grande': sizes[0], 'petites_composantes': sum(1 for s in sizes if s < 5), 'impasses_proches_d_une_route': len(dangling), 'liste_impasses': dangling[:200]}
# 4. geometry: axes covered by the asphalt surface, widths
cov = []
for li, l in enumerate(lines):
    if li in bridges or l.length < 5: continue
    pts = [l.interpolate(t) for t in np.linspace(0, l.length, max(2, int(l.length / 4)))]
    cov.append(np.mean([surf.contains(p) for p in pts]))
cov = np.array(cov)
rep['geometrie'] = {'axes_couverts_par_la_chaussee_moyenne': round(float(cov.mean()), 3), 'axes_couverts_a_moins_de_90pc': int((cov < 0.9).sum()), 'largeur_mediane_m': round(float(np.median([w for w, a in axes])), 2)}
json.dump(rep, open(f'{B}/qc_routes.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps({k: {kk: vv for kk, vv in v.items() if not kk.startswith('liste')} for k, v in rep.items()}, ensure_ascii=False, indent=1))
# map: missing OSM roads (red), altitude problems (blue), dangling ends (orange)
img = Image.new('RGB', (1500, 1500), (30, 32, 36)); d = ImageDraw.Draw(img)
P = lambda x, z: ((x + R) / 4, (z + R) / 4)
for w, a in axes: d.line([P(x, z) for x, z in a[:, :2]], fill=(150, 150, 150), width=1)
for m in rep['osm_absentes']['liste']: d.ellipse([*(np.array(P(m['x'], m['z'])) - 3), *(np.array(P(m['x'], m['z'])) + 3)], fill=(230, 50, 50))
for m in rep['altitude']['liste']: d.ellipse([*(np.array(P(m['x'], m['z'])) - 3), *(np.array(P(m['x'], m['z'])) + 3)], fill=(60, 120, 255))
for m in rep['connexions']['liste_impasses']: d.ellipse([*(np.array(P(m['x'], m['z'])) - 2), *(np.array(P(m['x'], m['z'])) + 2)], fill=(255, 160, 40))
img.save(f'{B}/qc_routes.png')
