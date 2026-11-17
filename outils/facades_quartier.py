# Prépare l'habillage des vrais bâtiments d'un arrondissement par le moteur de façades.
# Entrées : BD TOPO (batiment, troncon_de_route) via WFS IGN, contour d'arrondissement, BDCOM 2023 (commerces).
# Sortie : data/paris/facades/<secteur>.json (coordonnées locales du jeu) + index.json
#   bâtiment : { id (cleabs IGN), y (sol), h (hauteur gouttière), et (étages), st (style), ton, f: [façades sur rue], c: [noyau(x) à extruder] }
#   façade   : { a:[x,z], b:[x,z], tr (largeur trottoir), s: [commerces {t, nom, u}] }   — la normale extérieure est (-dz, dx)
# Usage : python3 outils/facades_quartier.py /tmp/q7 75107 7e
import json, gzip, math, os, sys, collections
from shapely.geometry import shape, LineString, Point, Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely.strtree import STRtree
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'commerces'))
from rues_test import typ

SRC, INSEE, NOM = sys.argv[1], sys.argv[2], sys.argv[3]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get('SORTIE') or os.path.join(ROOT, 'data', 'paris', 'facades')
E0, N0, RX, RY = 652087, 6862038, 10000, 6000
loc = lambda x, y: (round(x - E0, 1), round(-(y - N0), 1))
secteur = lambda x, z: f'{math.floor((x + RX) / 1000)}_{math.floor((-z + RY) / 1000)}'

arr = shape(json.load(open(f'{SRC}/arr.json' if os.path.exists(f'{SRC}/arr.json') else f'{SRC}/arr7.json'))['geometry'])
bats = json.load(open(f'{SRC}/bat.json'))
routes = json.load(open(f'{SRC}/routes.json'))
mods = set()
try:
    for m in json.load(open(os.path.join(ROOT, 'data/paris/modeles/index.json')))['modeles']: mods.update(m.get('ids') or [m.get('id')])
except Exception: pass

# --- bâtiments
B = []
for f in bats:
    p = f['properties']; g = shape(f['geometry'])
    if g.geom_type == 'MultiPolygon': g = max(g.geoms, key=lambda q: q.area)
    g = Polygon([(x, y) for x, y, *_ in g.exterior.coords], [[(x, y) for x, y, *_ in r.coords] for r in g.interiors]).buffer(0)
    if g.is_empty or g.area < 8: continue
    if g.geom_type == 'MultiPolygon': g = max(g.geoms, key=lambda q: q.area)
    B.append({'id': p['cleabs'], 'g': g, 'p': p})
tree = STRtree([b['g'] for b in B])
print(len(B), 'bâtiments')

# --- routes (axes + largeur de chaussée)
R = []
for f in routes:
    p = f['properties']
    if p.get('position_par_rapport_au_sol') not in (None, '0', 0): continue
    if p.get('nature') in ('Sentier', 'Escalier', 'Chemin', 'Piste cyclable', 'Bac ou liaison maritime'): continue
    g = shape(f['geometry'])
    lines = g.geoms if g.geom_type == 'MultiLineString' else [g]
    for l in lines: R.append((LineString([(x, y) for x, y, *_ in l.coords]), float(p.get('largeur_de_chaussee') or 7), p.get('nom_1_gauche') or p.get('nom_1_droite') or ''))
rtree = STRtree([r[0] for r in R])

# --- commerces BDCOM de l'arrondissement
bd = json.load(gzip.open(os.path.join(ROOT, 'outils/commerces/bdcom_BDCOM_2023.json.gz')))
arro = int(INSEE[-2:])
shops = [r for r in bd if r['arro'] == arro and r['sit'] in ('R', 'A')]
print(len(shops), 'commerces')

def route_proche(pt, dirv):
    best = None
    for i in rtree.query(pt.buffer(30)):
        l, w, nom = R[i]; d = l.distance(pt)
        s = l.project(pt); a = l.interpolate(max(0, s - 2)); b = l.interpolate(min(l.length, s + 2))
        tx, ty = b.x - a.x, b.y - a.y; tn = math.hypot(tx, ty) or 1
        par = abs((tx * dirv[0] + ty * dirv[1]) / tn)
        if par < .8: continue
        if best is None or d < best[0]: best = (d, w, nom)
    return best

def style_de(h, w_route, area, p):
    if p.get('nature') not in (None, 'Indifférenciée'): return None
    if h > 34 or area > 4000: return None          # monuments, grands équipements : on garde le modèle IGN
    if h > 27: return 'moderne'
    if h < 8.5: return 'modeste'
    if w_route >= 11: return 'riche'
    return 'classique'

out = collections.defaultdict(list); nF = nS = 0; place = set()
for bi, b in enumerate(B):
    g, p = b['g'], b['p']
    if b['id'] in mods: continue
    if not arr.contains(g.representative_point()): continue
    h = float(p.get('hauteur') or 0)
    if h < 3: continue
    ext = list(g.exterior.coords)
    if not g.exterior.is_ccw: ext = ext[::-1]   # sens trigonométrique (Lambert) : extérieur à droite de chaque arête
    # arêtes exposées sur rue
    fac = []
    for k in range(len(ext) - 1):
        (x1, y1), (x2, y2) = ext[k], ext[k + 1]; L = math.hypot(x2 - x1, y2 - y1)
        if L < 1: continue
        dx, dy = (x2 - x1) / L, (y2 - y1) / L; nx, ny = dy, -dx   # normale extérieure (polygone CCW)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        p1 = Point(mx + nx * 1.2, my + ny * 1.2)
        if any(B[j]['g'].contains(p1) for j in tree.query(p1) if j != bi): continue   # mitoyen
        rp = route_proche(Point(mx + nx * 1.5, my + ny * 1.5), (dx, dy))
        if not rp or rp[0] > rp[1] / 2 + 14: continue
        fac.append([x1, y1, x2, y2, rp[0] - rp[1] / 2, rp[1]])
    # fusion des arêtes presque alignées
    M = []
    for f in fac:
        if M:
            a = M[-1]; d1 = math.atan2(a[3] - a[1], a[2] - a[0]); d2 = math.atan2(f[3] - f[1], f[2] - f[0])
            if abs((d1 - d2 + math.pi) % (2 * math.pi) - math.pi) < .2 and math.hypot(f[0] - a[2], f[1] - a[3]) < .5:
                a[2], a[3] = f[2], f[3]; a[4] = min(a[4], f[4]); continue
        M.append(list(f))
    M = [f for f in M if math.hypot(f[2] - f[0], f[3] - f[1]) >= 5]
    wr = max([f[5] for f in M], default=0)
    if not M: continue   # bâtiment sans façade sur rue (cœur d'îlot) : on garde le volume IGN
    st = style_de(h, wr, g.area, p)
    if st is None: continue
    et = p.get('nombre_d_etages')
    et = int(et) if et else max(1, round((h - 1) / 3.05))
    # noyau : emprise moins une bande de 6 m derrière chaque façade sur rue (la façade du moteur occupe cette bande)
    core = g
    for f in M:
        x1, y1, x2, y2 = f[:4]; L = math.hypot(x2 - x1, y2 - y1); dx, dy = (x2 - x1) / L, (y2 - y1) / L; nx, ny = dy, -dx
        strip = Polygon([(x1 + nx * .3, y1 + ny * .3), (x2 + nx * .3, y2 + ny * .3), (x2 - nx * 6, y2 - ny * 6), (x1 - nx * 6, y1 - ny * 6)])
        core = core.difference(strip)
    core = core.buffer(-.05, join_style=2).buffer(.05, join_style=2).simplify(.3)
    cores = [] if core.is_empty else (list(core.geoms) if core.geom_type == 'MultiPolygon' else [core])
    def ring(c):
        r = []
        for x, y in c.exterior.coords[:-1]:
            q = loc(x, y)
            if not r or q != r[-1]: r.append(q)
        return r
    cores = [ring(c) for c in cores if c.area > 4]
    cores = [r for r in cores if len(r) >= 3]
    # façades en coordonnées du jeu ; sens choisi pour que la normale extérieure soit (-dz, dx)
    F = []
    for x1, y1, x2, y2, tr, w in M:
        a, b2 = loc(x1, y1), loc(x2, y2)
        F.append({'a': a, 'b': b2, 'tr': round(max(1.5, min(8, tr)), 1), 'w': round(w, 1), 's': [], '_l': LineString([(x1, y1), (x2, y2)])})
    c = g.centroid; cx, cz = loc(c.x, c.y)
    out[secteur(cx, cz)].append({'id': b['id'], 'cx': cx, 'cz': cz, 'h': round(h, 1), 'et': et, 'st': st, 'f': F, 'c': cores})
    nF += len(F)
# commerces → façade la plus proche (< 9 m)
allF = [f for L in out.values() for b in L for f in b['f']]
ftree = STRtree([f['_l'] for f in allF])
for r in shops:
    pt = Point(r['xbis'], r['ybis']); best = None
    for i in ftree.query(pt.buffer(9)):
        d = allF[i]['_l'].distance(pt)
        if d < 9 and (best is None or d < best[0]): best = (d, i)
    if best:
        f = allF[best[1]]; u = f['_l'].project(pt) / f['_l'].length; nm = (r['ens'] or '').strip()
        f['s'].append({'t': typ(r['codact']), 'nom': '' if nm in ('SANS ENSEIGNE', 'NC') else nm, 'u': round(u, 3)}); nS += 1
for f in allF:
    del f['_l']; f['s'].sort(key=lambda s: s['u'])
os.makedirs(OUT, exist_ok=True)
idx = {}
try: idx = json.load(open(f'{OUT}/index.json'))
except Exception: pass
idx.setdefault('secteurs', {}); idx['source'] = 'IGN BD TOPO, APUR BDCOM 2023'
for k, L in out.items():
    old = []
    try: old = [b for b in json.load(open(f'{OUT}/{k}.json'))['b'] if b.get('ar') != NOM]
    except Exception: pass
    for b in L: b['ar'] = NOM
    json.dump({'b': old + L}, open(f'{OUT}/{k}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    idx['secteurs'][k] = len(old) + len(L)
json.dump(idx, open(f'{OUT}/index.json', 'w'), separators=(',', ':'))
print(sum(len(L) for L in out.values()), 'bâtiments habillés,', nF, 'façades,', nS, 'commerces placés, secteurs', sorted(out))
