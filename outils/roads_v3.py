# Road network v3 (run inside build.py, which defines LINES, X0, Y0, H0, mesh_h, ortho_rgb, OUTD, L, earcut...).
# - one asphalt surface per area: union of every carriageway, inner corners rounded like real kerb lines
# - per vertex road coordinates for the road shader (commun/chaussee.js) (distance along, across, half width, lanes, line flags)
# - paint decals: give-way lines at minor entries, zebra crossings, one-way arrows
# - roundabout islands: raised grass with a kerb
import math
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box
from shapely.ops import unary_union, polygonize
from shapely import STRtree

R3 = {'fillet': 3.0, 'densify': 4.0, 'chunk': 500.0}
# ---------------- roads that exist in OpenStreetMap (Overture) but not in the IGN network: added, marked as OSM
import pyarrow.parquet as _pq, shapely.wkb as _swkb
from pyproj import Transformer as _Tr
from shapely import STRtree as _STR
_tr = _Tr.from_crs(4326, 2154, always_xy=True)
_ign = _STR([LineString(l['P']) for l in LINES])
_ign_l = [LineString(l['P']) for l in LINES]
OSMW = {'motorway': (9.0, 1), 'trunk': (8.0, 2), 'primary': (7.5, 2), 'secondary': (7.0, 3), 'tertiary': (6.5, 4), 'residential': (5.5, 5), 'unclassified': (5.0, 5), 'living_street': (4.5, 5), 'service': (3.5, 6)}
n_osm = 0
for r in _pq.read_table(f"{D}/overture_segments.parquet").to_pylist():
    if r['subtype'] != 'road' or r['class'] not in OSMW: continue
    fl = [v for f in (r['road_flags'] or []) for v in (f.get('values') or [])]
    if 'is_bridge' in fl or 'is_tunnel' in fl: continue
    g = _swkb.loads(r['geometry']); xs, ys = _tr.transform(*zip(*g.coords)); ln = LineString(list(zip(xs, ys)))
    if ln.length < 8 or abs(ln.centroid.x - X0) > 2950 or abs(ln.centroid.y - Y0) > 2950: continue
    pts = [ln.interpolate(t) for t in np.linspace(0, ln.length, max(2, int(ln.length / 5)))]
    if np.mean([_ign_l[_ign.nearest(p)].distance(p) < 7 for p in pts]) >= 0.5: continue
    w, imp = OSMW[r['class']]
    # snap both ends onto the network (IGN roads and OSM roads added before) when it is close: no gaps at junctions
    cs = list(ln.coords); att = []
    for end in (0, -1):
        p = Point(cs[end])
        j = _ign.nearest(p); best = _ign_l[j]; dd = best.distance(p); tgt = ('ign', j)
        for o in (LINES[len(LINES) - n_osm:] if n_osm else []):
            d2 = o['geom_tmp'].distance(p)
            if d2 < dd: dd, best, tgt = d2, o['geom_tmp'], ('osm', o['id_tmp'])
        if 0.05 < dd < 12:
            q = best.interpolate(best.project(p)); att.append((end, tgt, best.project(p)))
            if end == 0: cs.insert(0, (q.x, q.y))
            else: cs.append((q.x, q.y))
        elif dd <= 0.05: att.append((end, tgt, best.project(p)))
    ln = LineString(cs)
    nseg = max(1, int(ln.length / 3)); ds = np.linspace(0, ln.length, nseg + 1)
    P = np.array([ln.interpolate(t).coords[0] for t in ds])
    tg = np.gradient(P, axis=0); tg /= np.linalg.norm(tg, axis=1, keepdims=True) + 1e-9
    nr = np.stack([-tg[:, 1], tg[:, 0]], -1)
    zg = mesh_h(P[:, 0], P[:, 1])
    if np.isnan(zg).any(): continue
    zl = mesh_h(*(P + nr * w / 2).T); zr = mesh_h(*(P - nr * w / 2).T)
    zm = np.maximum(np.maximum(zl, zr), zg) + 0.22
    k = 7 if len(zm) >= 7 else max(1, len(zm) | 1)
    if k > 1:
        pad = np.r_[np.full(k // 2, zm[0]), zm, np.full(k // 2, zm[-1])]
        zm = np.maximum(np.convolve(pad, np.ones(k) / k, mode='valid'), zm - 0.15)
    LINES.append(dict(P=P, nr=nr, w=w, nat='OSM ' + r['class'], pos='0', z=zm, ds=ds, name=((r['names'] or {}).get('primary') or '').upper(), bridge=False,
                      imp=imp, sens='Double sens', voies=0, urbain=True, osm=True, attach=att, geom_tmp=ln, id_tmp=len(LINES)))
    n_osm += 1
print('roads added from OpenStreetMap', n_osm)
for l in LINES: l.setdefault('sw', np.zeros((len(l['P']), 2)))
print('roads v3: lines', len(LINES))
from PIL import Image
for i, l in enumerate(LINES):
    l['id'] = i
    l['geom'] = LineString(l['P'])
    l['len'] = l['geom'].length
    l['oneway'] = l['sens'] in ('Sens direct', 'Sens inverse')
    l['ring'] = l['nat'] == 'Rond-point'
    v = l['voies'] or (2 if l['w'] >= 5 and not l['oneway'] else 1)
    l['lanes'] = max(1, v)

# ---------------- junction nodes
nodes = {}
def nkey(p): return (round(p[0] * 2) / 2, round(p[1] * 2) / 2)
for l in LINES:
    if l['bridge']: continue
    for end, p in ((0, l['P'][0]), (1, l['P'][-1])):
        nodes.setdefault(nkey(p), []).append((l['id'], end))
JN = {k: v for k, v in nodes.items() if len(v) >= 3 or (len(v) == 2 and LINES[v[0][0]]['ring'] != LINES[v[1][0]]['ring'])}
print('junctions', len(JN))
for l in LINES: l['fade'] = [0.0, 0.0]
for k, ends in JN.items():
    rmax = max(LINES[i]['w'] / 2 for i, _ in ends)
    for i, e in ends: LINES[i]['fade'][e] = rmax + 2.5

# ---------------- measured width: asphalt runs across the road on the orthophoto (0.49 m)
OM = np.zeros((6144 * 2, 6144 * 2, 3), np.uint8) if False else None
_tiles = {}
def _ortho_tile(i, j):
    if (i, j) not in _tiles: _tiles[(i, j)] = np.asarray(Image.open(f"{D}/ortho_{i}_{j}.jpg").convert('RGB'))
    return _tiles[(i, j)]
def ortho_many(x, y):
    x = np.asarray(x, float); y = np.asarray(y, float); out = np.zeros((len(x), 3), np.int16)
    i = np.clip(((x - XMIN) // 2000).astype(int), 0, 2); j = np.clip(((y - (Y0 - R)) // 2000).astype(int), 0, 2)
    for ii in range(3):
        for jj in range(3):
            m = (i == ii) & (j == jj)
            if not m.any(): continue
            t = _ortho_tile(ii, jj)
            px_ = np.clip(((x[m] - (XMIN + ii * 2000)) / 2000 * 4096).astype(int), 0, 4095)
            py_ = np.clip(((Y0 - R + (jj + 1) * 2000 - y[m]) / 2000 * 4096).astype(int), 0, 4095)
            out[m] = t[py_, px_]
    return out
STEPS = np.arange(0.5, 11.01, 0.5)
def is_asph(c):
    lum = c.mean(-1); sat = c.max(-1) - c.min(-1)
    return ((sat <= 11) & (lum > 80) & (lum < 205)) | ((sat <= 8) & (lum > 30) & (lum <= 80))
n_meas = 0
for l in LINES:
    P, nr = l['P'], l['nr']
    ext = np.zeros((len(P), 2)); ok = np.zeros((len(P), 2), bool)
    for si, sg in enumerate((1, -1)):
        pts = P[:, None, :] + (nr * sg)[:, None, :] * STEPS[None, :, None]
        A = is_asph(ortho_many(pts[..., 0].ravel(), pts[..., 1].ravel())).reshape(len(P), len(STEPS))
        # run of asphalt from the axis, allowing one isolated gap (a marking, a car's edge)
        run = np.zeros(len(P))
        for k in range(len(P)):
            r_ = 0.0; gap = 0
            for t in range(len(STEPS)):
                if A[k, t]: r_ = STEPS[t]; gap = 0
                else:
                    gap += 1
                    if gap >= 2: break
            run[k] = r_
        ext[:, si] = run; ok[:, si] = A[:, 0] & A[:, 1]
    good = ok.all(1)
    # typical French carriageway for this kind of road (BD TOPO importance), the photo moves it within a range
    typ = {1: 9.0, 2: 8.0, 3: 7.5, 4: 7.0, 5: 6.0, 6: 3.5}.get(l['imp'], 6.0)
    if l['nat'] == 'Chemin' or l['imp'] >= 6: typ = 3.5
    if l['nat'] == 'Route à 2 chaussées': typ = 7.0
    if l['nat'] == 'Rond-point': typ = 7.5
    if l['nat'] == 'Bretelle': typ = 5.0
    typ = max(typ, l['w'] if l['w'] <= typ * 1.4 else typ)
    l['w_ign'] = l['w']; l['w'] = typ
    if good.mean() >= 0.3 and good.sum() >= 3:
        half = np.median(ext[good], 0) + 0.25
        wm = float(np.clip(half.sum(), 0.85 * typ, 1.25 * typ))
        l['w'] = wm; n_meas += 1
print('widths measured on the photo', n_meas, 'of', len(LINES))
# ---------------- asphalt surface
surf = []
for l in LINES:
    if l['bridge']: continue
    surf.append(l['geom'].buffer(l['w'] / 2, cap_style=2, join_style=2, mitre_limit=2.0))
U = unary_union(surf)
U = U.buffer(R3['fillet'], join_style=1, quad_segs=4).buffer(-R3['fillet'], join_style=1, quad_segs=4)  # rounded kerb corners
U = U.simplify(0.15)
polys = list(U.geoms) if isinstance(U, MultiPolygon) else [U]
print('asphalt polygons', len(polys), 'area m2', int(U.area))
import shapely.wkb as _w; open(OUTD + '/chaussee_v3.wkb', 'wb').write(_w.dumps(U))

# lookups
segs, segInfo = [], []
for l in LINES:
    if l['bridge']: continue
    segs.append(l['geom'])
stree = STRtree(segs)
segL = [l for l in LINES if not l['bridge']]

def road_attr(px, py):
    """nearest road: (line, s, signed lateral, z)"""
    pt = Point(px, py)
    j = stree.nearest(pt)
    l = segL[j]; g = l['geom']
    s = g.project(pt)
    q = g.interpolate(s)
    t2 = g.interpolate(min(l['len'], s + 0.5)); t1 = g.interpolate(max(0.0, s - 0.5))
    tx, ty = t2.x - t1.x, t2.y - t1.y; tl = math.hypot(tx, ty) or 1
    lat = ((px - q.x) * (-ty) + (py - q.y) * tx) / tl     # + on the left (+nr) side
    z = float(np.interp(s, l['ds'], l['z']))
    return l, s, lat, z

# ---------------- triangulate per chunk
CH3 = R3['chunk']
chunks3 = {}
gx0, gy0 = X0 - 3000, Y0 - 3000
for poly in polys:
    if poly.area < 3: continue
    minx, miny, maxx, maxy = poly.bounds
    for ci in range(int((minx - gx0) // CH3), int((maxx - gx0) // CH3) + 1):
        for cj in range(int((miny - gy0) // CH3), int((maxy - gy0) // CH3) + 1):
            b = box(gx0 + ci * CH3, gy0 + cj * CH3, gx0 + (ci + 1) * CH3, gy0 + (cj + 1) * CH3)
            part = poly.intersection(b)
            if part.is_empty: continue
            for pp in (part.geoms if hasattr(part, 'geoms') else [part]):
                if pp.geom_type != 'Polygon' or pp.area < 1: continue
                chunks3.setdefault((ci, cj), []).append(pp.segmentize(R3['densify']))

def tri_poly(pp):
    rings = [np.asarray(pp.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in pp.interiors]
    V = np.vstack(rings); ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
    T = np.asarray(earcut.triangulate_float64(V, ends)).reshape(-1, 3)
    return V, T

def add_interior(V, T, maxlen=14.0):
    """split long triangles so the surface follows the road profile: midpoints of long edges, a few rounds"""
    V = [tuple(v) for v in V]; T = [tuple(t) for t in T]
    for _ in range(3):
        out = []; mid = {}
        changed = False
        for a, b, c in T:
            pa, pb, pc = V[a], V[b], V[c]
            la, lb, lc = math.dist(pb, pc), math.dist(pa, pc), math.dist(pa, pb)
            m = max(la, lb, lc)
            if m <= maxlen: out.append((a, b, c)); continue
            changed = True
            if m == lc: e, o = (a, b), c
            elif m == la: e, o = (b, c), a
            else: e, o = (c, a), b
            k = (min(e), max(e))
            if k not in mid:
                mid[k] = len(V); V.append(((V[e[0]][0] + V[e[1]][0]) / 2, (V[e[0]][1] + V[e[1]][1]) / 2))
            m_ = mid[k]
            out.append((e[0], m_, o)); out.append((m_, e[1], o))
        T = out
        if not changed: break
    return np.array(V), np.array(T)

rb3 = bytearray(struct.pack('<II', 0x52445634, len(chunks3)))
nv_total = 0
for (ci, cj), parts in sorted(chunks3.items()):
    PV, RA_, LA_, IX = [], [], [], []
    base = 0
    for pp in parts:
        V, T = tri_poly(pp)
        if len(T) == 0: continue
        V, T = add_interior(V, T)
        a_, b_, c_ = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
        cr = (b_[:, 0] - a_[:, 0]) * (c_[:, 1] - a_[:, 1]) - (b_[:, 1] - a_[:, 1]) * (c_[:, 0] - a_[:, 0])
        T[cr < 0] = T[cr < 0][:, [0, 2, 1]]
        for (px, py) in V:
            l, s, lat, z = road_attr(px, py)
            hw = l['w'] / 2
            f0 = min(1.0, max(0.0, (s - l['fade'][0]) / 3.0)) if l['fade'][0] > 0 else 1.0
            f1 = min(1.0, max(0.0, (l['len'] - s - l['fade'][1]) / 3.0)) if l['fade'][1] > 0 else 1.0
            fade = f0 * f1 * (1.0 if abs(lat) <= hw + 0.3 else 0.0)
            edges = 1.0 if (l['w'] >= 6.5 or l['imp'] <= 3) and not l['ring'] else 0.0
            # lanes for the shader: 2 = centre line; one-way 2-lane roads get a lane line too (same dashes)
            lanes = 2 if (l['lanes'] >= 2 and l['w'] >= 5 and not l['ring']) else 1
            PV.append((px - X0, z - H0 + 0.0, -(py - Y0)))
            RA_.append((s, lat, hw, lanes))
            # continuous centre line on main roads (importance 1..3), dashed elsewhere: flag in aLine.y>1
            LA_.append((edges, edges + (1.0 if l['imp'] <= 2 else 0.0), fade))
        IX.append(T + base); base += len(V)
    if not PV: continue
    PV = np.asarray(PV, np.float64); RA_ = np.asarray(RA_, np.float64); LA_ = np.asarray(LA_, np.float64)
    IX = np.concatenate(IX).ravel()
    # compact: positions in 2 cm steps from the chunk origin (int16), s float32, lateral in cm (int16),
    # half width in dm + lanes (uint8 x2), line flags (uint8 x4); indices uint16 when they fit
    o = PV.min(0)
    q = np.round((PV - o) / 0.02).astype(np.int64)
    assert q.max() < 65535
    nV = len(PV); big = nV > 65535
    blob = struct.pack('<IIBfff', nV, len(IX), 1 if big else 0, *o) + b'\0\0\0'
    blob += q.astype(np.uint16).tobytes()
    blob += RA_[:, 0].astype(np.float32).tobytes()
    blob += np.round(RA_[:, 1] * 100).astype(np.int16).tobytes()
    blob += np.stack([np.round(RA_[:, 2] * 10), RA_[:, 3]], -1).astype(np.uint8).tobytes()
    blob += np.c_[np.round(np.clip(LA_, 0, 2) * 100), np.zeros(nV)].astype(np.uint8).tobytes()
    blob += IX.astype(np.uint32 if big else np.uint16).tobytes()
    while len(blob) % 4: blob += b'\0'
    rb3 += blob
    nv_total += len(PV)
open(OUTD + '/routes_v3.bin', 'wb').write(rb3)
print('road v3 vertices', nv_total, 'MB', len(rb3) / 1e6)

# ---------------- paint decals (white), roundabout islands
DP, DI = [], []
def paint_quad(c, ux, uy, half_len, half_w, z):
    """quad centred on c, long axis (ux,uy) of half length half_len, half width half_w"""
    vx, vy = -uy, ux
    pts = [(c[0] - ux * half_len - vx * half_w, c[1] - uy * half_len - vy * half_w), (c[0] + ux * half_len - vx * half_w, c[1] + uy * half_len - vy * half_w),
           (c[0] + ux * half_len + vx * half_w, c[1] + uy * half_len + vy * half_w), (c[0] - ux * half_len + vx * half_w, c[1] - uy * half_len + vy * half_w)]
    n = len(DP)
    for (x, y) in pts: DP.append((x - X0, z - H0 + 0.035, -(y - Y0)))
    DI.extend([n, n + 1, n + 2, n, n + 2, n + 3])
def paint_poly(pts, z):
    n = len(DP)
    V = np.asarray(pts); T = np.asarray(earcut.triangulate_float64(V, np.array([len(V)], np.uint32))).reshape(-1, 3)
    for (x, y) in V: DP.append((x - X0, z - H0 + 0.035, -(y - Y0)))
    for t in T: DI.extend([n + int(t[0]), n + int(t[1]), n + int(t[2])])

def frame(l, s):
    g = l['geom']; q = g.interpolate(s)
    a = g.interpolate(max(0, s - 0.6)); b = g.interpolate(min(l['len'], s + 0.6))
    tx, ty = b.x - a.x, b.y - a.y; tl = math.hypot(tx, ty) or 1
    return (q.x, q.y), tx / tl, ty / tl, float(np.interp(s, l['ds'], l['z']))

n_give = n_zebra = n_arrow = n_stop = 0
# real positions from OpenStreetMap (Overture): crossings, stop and give-way signs, traffic signals
import pyarrow.parquet as pq, shapely.wkb as swkb
from pyproj import Transformer
_tr = Transformer.from_crs(4326, 2154, always_xy=True)
OPOI = []
for r in pq.read_table(f"{D}/overture_infra.parquet").to_pylist():
    if r['subtype'] != 'transportation' or r['class'] not in ('crossing', 'stop', 'give_way', 'traffic_signals'): continue
    g = swkb.loads(r['geometry'])
    if g.geom_type != 'Point': continue
    x, y = _tr.transform(g.x, g.y)
    OPOI.append((r['class'], x, y))
print('overture road points', len(OPOI))
SIGNALS = []
for cls, x, y in OPOI:
    pt = Point(x, y)
    j = stree.nearest(pt); l = segL[j]
    if l['geom'].distance(pt) > 9 or l['bridge']: continue
    s0 = l['geom'].project(pt)
    c, tx, ty, z = frame(l, s0); hw = l['w'] / 2; nx_, ny_ = -ty, tx
    if cls == 'crossing':
        if hw < 2: continue
        x_ = -hw + 0.5
        while x_ + 0.5 <= hw - 0.3:
            cc = (c[0] + nx_ * (x_ + 0.25), c[1] + ny_ * (x_ + 0.25))
            paint_quad(cc, tx, ty, 1.25, 0.25, z); x_ += 1.0
        n_zebra += 1
    elif cls in ('stop', 'give_way'):
        # the line sits across the lane that arrives at the nearest junction end of this road
        e = 1 if (l['len'] - s0) < s0 else 0
        dirx, diry = (tx, ty) if e == 1 else (-tx, -ty)
        rx_, ry_ = diry, -dirx
        span0, span1 = (0.15, hw - 0.15) if not l['oneway'] else (-hw + 0.15, hw - 0.15)
        if cls == 'stop':
            mid = (span0 + span1) / 2
            paint_quad((c[0] + rx_ * mid, c[1] + ry_ * mid), rx_, ry_, (span1 - span0) / 2, 0.25, z); n_stop += 1
        else:
            x_ = span0
            while x_ + 0.5 <= span1 + 1e-6:
                paint_quad((c[0] + rx_ * (x_ + 0.25), c[1] + ry_ * (x_ + 0.25)), rx_, ry_, 0.25, 0.25, z); x_ += 1.0
            n_give += 1
        SIGNALS.append((cls, c[0] + rx_ * (hw + 1.2), c[1] + ry_ * (hw + 1.2), z, math.atan2(dirx, diry)))
    else:
        SIGNALS.append((cls, x, y, float(np.interp(s0, l['ds'], l['z'])), math.atan2(tx, ty)))
# one-way arrows every 60 m
for l in LINES:
    if not l['oneway'] or l['ring'] or l['bridge'] or l['len'] < 30: continue
    sgn = 1 if l['sens'] == 'Sens direct' else -1
    s = 15.0
    while s < l['len'] - 15:
        c, tx, ty, z = frame(l, s)
        tx, ty = tx * sgn, ty * sgn; nx_, ny_ = -ty, tx
        P_ = lambda a, b: (c[0] + tx * a + nx_ * b, c[1] + ty * a + ny_ * b)
        paint_poly([P_(-2.5, -0.15), P_(1.0, -0.15), P_(1.0, -0.45), P_(2.5, 0.0), P_(1.0, 0.45), P_(1.0, 0.15), P_(-2.5, 0.15)], z)
        n_arrow += 1; s += 60.0
print('give-way', n_give, 'stop', n_stop, 'zebra', n_zebra, 'arrows', n_arrow, 'signals', len(SIGNALS))
json.dump([[c, round(x - X0, 2), round(z - H0, 2), round(-(y - Y0), 2), round(h, 3)] for c, x, y, z, h in SIGNALS], open(OUTD + '/signalisation.json', 'w'))

# roundabout islands: holes of the asphalt enclosed by roundabout rings
ring_lines = [l['geom'] for l in LINES if l['ring']]
IP, II = [], []
n_isl = 0
if ring_lines:
    rp = list(polygonize(unary_union(ring_lines)))
    for poly in polys:
        for hole in poly.interiors:
            h = Polygon(hole)
            if h.area > 6000 or h.area < 3: continue
            if not any(h.intersects(r) for r in rp): continue
            V = np.asarray(h.exterior.coords)[:-1]
            if Polygon(V).exterior.is_ccw is False: V = V[::-1]
            zs_ = mesh_h(V[:, 0], V[:, 1])
            if np.isnan(zs_).any(): continue
            zr = []
            for (px, py) in V: zr.append(road_attr(px, py)[3])
            ztop = float(np.mean(zr)) + 0.16
            T = np.asarray(earcut.triangulate_float64(V, np.array([len(V)], np.uint32))).reshape(-1, 3)
            n = len(IP)
            for (px, py) in V: IP.append((px - X0, ztop - H0, -(py - Y0), 0.0))
            for t in T: II.extend([n + int(t[0]), n + int(t[1]), n + int(t[2])])
            # kerb face down to the road
            m = len(V); n2 = len(IP)
            for idx, (px, py) in enumerate(V):
                IP.append((px - X0, ztop - H0, -(py - Y0), 1.0)); IP.append((px - X0, zr[idx] - H0 - 0.05, -(py - Y0), 1.0))
            for k2 in range(m):
                a0, b0 = n2 + 2 * k2, n2 + 2 * ((k2 + 1) % m)
                II.extend([a0, a0 + 1, b0 + 1, a0, b0 + 1, b0])
            n_isl += 1
print('islands', n_isl)
db = bytearray(struct.pack('<II', len(DP), len(DI)))
db += np.asarray(DP, np.float32).tobytes() + np.asarray(DI, np.uint32).tobytes()
db += struct.pack('<II', len(IP), len(II)) + np.asarray(IP, np.float32).tobytes() + np.asarray(II, np.uint32).tobytes()
open(OUTD + '/routes_deco.bin', 'wb').write(db)
print('deco MB', len(db) / 1e6)

exec(open('/home/claude/scripts/roads_extra.py').read())
# axes for the game: widths now measured
CL[:] = [(NAMES.setdefault(l['name'], len(NAMES)), l['w'], l['P'], l['z'], l['sw']) for l in LINES]
