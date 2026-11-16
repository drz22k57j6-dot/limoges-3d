# Voirie réelle de Paris (Plan de voirie de la Ville de Paris, open data, ODbL) → un fichier par secteur de 1 km :
#   data/paris/secteurs/<i_j>/voirie.wasm
# Chaussées, trottoirs (+14 cm, abaissés aux passages piétons), terre-pleins, îlots et séparateurs (surélevés),
# bordures en granit (dessus + face verticale côté chaussée), passages piétons (bandes peintes dans le jeu),
# aires mixtes (pavés). Les hauteurs suivent exactement le relief du jeu (LiDAR, mêmes tuiles que groundH).
#
# Usage : python3 outils/voirie.py <dossier des couches téléchargées> <secteur> [<secteur> ...]
#   couches : <dossier>/<secteur>/<couche>.geojson (outils/voirie_fetch.py)
import json, struct, sys, os, glob, math
import numpy as np, shapely
from shapely.geometry import shape, box, Polygon, MultiPolygon, LineString, MultiLineString, GeometryCollection
from shapely.ops import unary_union
from pyproj import Transformer
import mapbox_earcut as earcut

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data', 'paris')
IDX = json.load(open(os.path.join(DATA, 'secteurs', 'index.json')))
X0, Y0, RX, RY = 652087.0, 6862038.0, IDX['RX'], IDX['RY']
TR = Transformer.from_crs(4326, 2154, always_xy=True)
CELL = 12.0                   # maillage des surfaces (m) : suit le relief (grille LiDAR du jeu : 4 m)
H_ROAD, H_SIDE, H_LOW = 0.04, 0.14, 0.03   # chaussée, trottoir, trottoir abaissé (bateau) au droit des passages piétons
KERB_W = 0.22                 # largeur du dessus de bordure (granit)
MAT = {'chaussee': 0, 'trottoir': 1, 'bordure': 2, 'passage': 3, 'pave': 4}

# ------------------------------------------------------------------ relief (copie exacte de groundH du jeu)
REL = []
for f in glob.glob(os.path.join(DATA, 'secteurs', 'relief', 'r_*.wasm')):
    b = open(f, 'rb').read(); H0, n = struct.unpack('<fI', b[:8]); o = 8
    for _ in range(n):
        x0, y0, s, mn, N = struct.unpack('<ffffI', b[o:o + 20]); o += 20
        h = np.frombuffer(b[o:o + N * N * 2], dtype='<u2').reshape(N, N).astype(np.float64); o += N * N * 2
        REL.append((x0, y0, s, mn, N, h))
H0 = IDX['H0']

def ground(x, n):
    """x est, n nord (repère local) → hauteur du terrain du jeu (y), vectorisé."""
    x = np.asarray(x, float); n = np.asarray(n, float); out = np.zeros_like(x); done = np.zeros(x.shape, bool)
    for x0, y0, s, mn, N, h in REL:
        m = (~done) & (x >= x0) & (x <= x0 + 2000) & (n >= y0) & (n <= y0 + 2000)
        if not m.any(): continue
        a = np.clip((x[m] - x0) / s, 0, N - 1 - 1e-6); b = np.clip((n[m] - y0) / s, 0, N - 1 - 1e-6)
        a0 = a.astype(int); b0 = b.astype(int); fx = a - a0; fy = b - b0
        h00 = h[b0, a0]; h10 = h[b0, a0 + 1]; h01 = h[b0 + 1, a0]; h11 = h[b0 + 1, a0 + 1]
        v = np.where(fx >= fy, h00 + fx * (h10 - h00) + fy * (h11 - h10), h00 + fy * (h01 - h00) + fx * (h11 - h01))
        out[m] = v * 0.01 + mn - H0; done |= m
    return out

# ------------------------------------------------------------------ données
def load(d, k, name):
    f = os.path.join(d, k, name + '.geojson')
    if not os.path.exists(f): return []
    out = []
    for ft in json.load(open(f))['features']:
        g = shape(ft['geometry'])
        g = shapely.transform(g, lambda c: np.column_stack(TR.transform(c[:, 0], c[:, 1])) - [X0, Y0])
        g = g.simplify(0.06)
        if not g.is_valid: g = g.buffer(0)
        if not g.is_empty: out.append((g, ft['properties'].get('lib_classe')))
    return out

def polys(g):
    if g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    if isinstance(g, (MultiPolygon, GeometryCollection)): return [p for q in g.geoms for p in polys(q)]
    return []

def lines(g):
    if g.is_empty: return []
    if isinstance(g, LineString): return [g]
    if hasattr(g, 'geoms'): return [l for q in g.geoms for l in lines(q)]
    return []

# ------------------------------------------------------------------ maillage
class Group:
    def __init__(self): self.P = []; self.A = []; self.I = []
    def add_poly(self, poly, hfun, afun):
        """polygone découpé en carreaux de CELL m (suit le relief), triangulé, hauteur et attributs par sommet."""
        x0, n0, x1, n1 = poly.bounds
        cells = [box(a, b, a + CELL, b + CELL) for a in np.arange(math.floor(x0 / CELL) * CELL, x1, CELL) for b in np.arange(math.floor(n0 / CELL) * CELL, n1, CELL)]
        pieces = shapely.intersection(np.array(cells, dtype=object), poly) if len(cells) > 1 else [poly]
        for pc in pieces:
            for p in polys(pc):
                if p.area < 0.01: continue
                rings = [np.asarray(p.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in p.interiors]
                V = np.concatenate(rings); ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
                try: tri = earcut.triangulate_float64(V, ends)
                except Exception: continue
                if len(tri) == 0: continue
                base = len(self.P) and sum(len(q) for q in self.P)
                y = hfun(V[:, 0], V[:, 1]); a = afun(V[:, 0], V[:, 1])
                self.P.append(np.column_stack([V[:, 0], y, -V[:, 1]])); self.A.append(a)
                t = tri.reshape(-1, 3) + base        # sens trigo vu du dessus (le passage n → z = -n a déjà inversé l'orientation)
                self.I.append(t.ravel())
    def add_quads(self, P, A, I):
        base = sum(len(q) for q in self.P); self.P.append(P); self.A.append(A); self.I.append(I + base)
    def pack(self, mat):
        if not self.P: return b''
        P = np.concatenate(self.P); A = np.concatenate(self.A); I = np.concatenate(self.I).astype(np.uint32)
        o = P.min(0); q = np.round((P - o) / [0.02, 0.005, 0.02]).astype(np.uint16)
        hasA = mat in (0, 2, 3); a = np.clip(np.round(A * 100), -32767, 32767).astype(np.int16)
        nV, nI = len(P), len(I); big = nV > 65535
        b = struct.pack('<BBBBIIfff', mat, 1 if big else 0, 1 if hasA else 0, 0, nV, nI, *o) + q.tobytes() + (a.tobytes() if hasA else b'')
        b += (I.astype(np.uint32) if big else I.astype(np.uint16)).tobytes()
        b += b'\0' * ((4 - len(b) % 4) % 4)
        return b

def build(d, k):
    i, j = map(int, k.split('_')); x0 = i * 1000 - RX; n0 = j * 1000 - RY; SQ = box(x0, n0, x0 + 1000, n0 + 1000)
    clip = lambda gs: unary_union([g for g, _ in gs]).intersection(SQ) if gs else GeometryCollection()
    water = clip(load(d, k, 'voies-deau'))
    road = clip(load(d, k, 'chaussees') + load(d, k, 'pistes-cyclables-et-couloirs-de-bus'))
    side = clip(load(d, k, 'trottoirs-emprises') + load(d, k, 'terre-pleins') + load(d, k, 'ilots-directionnels') + load(d, k, 'separateurs-franchisssement-stationnement'))
    mixed = clip(load(d, k, 'aires-mixtes-vehicules-et-pietons'))
    cross = load(d, k, 'passages-pietons')
    if not water.is_empty: road = road.difference(water); side = side.difference(water)   # ponts : le tablier reste au modèle des ponts
    road = road.difference(side).difference(mixed)
    crossU = unary_union([g for g, _ in cross]).intersection(SQ) if cross else GeometryCollection()
    road_nc = road.difference(crossU)
    # bordures : contour des trottoirs qui longe la chaussée (ou un passage piéton)
    edge = unary_union([road, crossU]).buffer(0.8)
    kerbL = unary_union(lines(side.boundary.intersection(edge)))
    kerbBand = side.intersection(kerbL.buffer(KERB_W, cap_style=2)) if not kerbL.is_empty else GeometryCollection()
    sideTop = side.difference(kerbBand)
    # trottoir abaissé au droit des passages piétons
    crossP = crossU.buffer(0.3)
    def side_h(x, n):
        if crossP.is_empty: return np.full(len(x), H_SIDE)
        dd = shapely.distance(shapely.points(x, n), crossP)
        t = np.clip((dd - 0.4) / 1.4, 0, 1); t = t * t * (3 - 2 * t)
        return H_LOW + (H_SIDE - H_LOW) * t
    zero = lambda x, n: np.zeros((len(x), 2))
    # chaussée : distance au trottoir le plus proche (caniveau, salissures) dans aux.x
    sideB = side.boundary
    def road_aux(x, n):
        dd = shapely.distance(shapely.points(x, n), sideB) if not sideB.is_empty else np.full(len(x), 9.0)
        return np.column_stack([np.minimum(dd, 9.0), np.zeros(len(x))])
    G = {m: Group() for m in MAT}
    for p in polys(road_nc): G['chaussee'].add_poly(p, lambda x, n: ground(x, n) + H_ROAD, road_aux)
    for p in polys(mixed): G['pave'].add_poly(p, lambda x, n: ground(x, n) + H_ROAD, zero)
    for p in polys(sideTop): G['trottoir'].add_poly(p, lambda x, n: ground(x, n) + side_h(x, n), zero)
    for p in polys(kerbBand): G['bordure'].add_poly(p, lambda x, n: ground(x, n) + side_h(x, n) + 0.005, zero)
    # passages piétons : coordonnées (u le long du passage, v en travers) pour peindre les bandes de 50 cm
    for g, _ in cross:
        for p in polys(g.intersection(SQ)):
            r = p.minimum_rotated_rectangle; c = np.asarray(r.exterior.coords)[:4]
            e1 = c[1] - c[0]; e2 = c[2] - c[1]; L1, L2 = np.hypot(*e1), np.hypot(*e2)
            ax = e1 / L1 if L1 >= L2 else e2 / L2; ctr = np.asarray(p.centroid.coords[0])
            def aux(x, n, ax=ax, ctr=ctr):
                d = np.column_stack([x - ctr[0], n - ctr[1]]); return np.column_stack([d @ ax, d @ np.array([-ax[1], ax[0]])])
            G['passage'].add_poly(p, lambda x, n: ground(x, n) + H_ROAD + 0.006, aux)
    # face verticale des bordures (côté chaussée), découpée tous les 1,5 m
    FP, FA, FI = [], [], []
    for ln in lines(kerbL):
        L = ln.length
        if L < 0.3: continue
        ts = np.linspace(0, L, max(2, int(L / 4.0) + 1)); pts = np.array([ln.interpolate(t).coords[0] for t in ts])
        x, n = pts[:, 0], pts[:, 1]; g0 = ground(x, n); top = g0 + side_h(x, n) + 0.005; bot = g0 - 0.02
        m = len(pts); base = len(FP) and sum(len(q) for q in FP)
        P = np.zeros((2 * m, 3)); P[0::2] = np.column_stack([x, bot, -n]); P[1::2] = np.column_stack([x, top, -n])
        A = np.zeros((2 * m, 2)); A[0::2, 0] = ts; A[1::2, 0] = ts; A[1::2, 1] = top - bot
        I = []
        for q in range(m - 1):
            a, b, c, e = 2 * q, 2 * q + 1, 2 * q + 2, 2 * q + 3; I += [a, c, b, b, c, e]
        G['bordure'].add_quads(P, A, np.array(I))
    out = b''.join(G[m].pack(MAT[m]) for m in MAT if G[m].P)
    n = sum(1 for m in MAT if G[m].P)
    blob = struct.pack('<II', 0x31494F56, n) + out
    dst = os.path.join(DATA, 'secteurs', k, 'voirie.wasm'); open(dst, 'wb').write(blob)
    tri = sum(sum(len(q) for q in G[m].I) // 3 for m in MAT)
    print(k, f'{len(blob) / 1024:.0f} Ko', f'{tri} triangles', {m: len(G[m].P) for m in MAT})
    return k

if __name__ == '__main__':
    d = sys.argv[1]
    for k in sys.argv[2:]:
        build(d, k)
        e = IDX['secteurs'][k]
        if 'voirie.wasm' not in e['fichiers']: e['fichiers'].append('voirie.wasm')
        e['octets'] = sum(os.path.getsize(os.path.join(DATA, 'secteurs', k, f)) for f in e['fichiers'] if os.path.exists(os.path.join(DATA, 'secteurs', k, f)))
    json.dump(IDX, open(os.path.join(DATA, 'secteurs', 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
