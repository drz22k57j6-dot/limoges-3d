# Run inside roads_v3.py: bridges at their own height, kerbs and gutters along the asphalt edge, navigation graph.
import math, collections

# ---------------- bridges: a deck strip at the road's own altitude (BD TOPO z), with low parapets
def chunk_blob(PV, RA_, LA_, IX):
    PV = np.asarray(PV, np.float64); RA_ = np.asarray(RA_, np.float64); LA_ = np.asarray(LA_, np.float64); IX = np.asarray(IX).ravel()
    o = PV.min(0); q = np.round((PV - o) / 0.02).astype(np.int64)
    nV = len(PV); big = nV > 65535
    blob = struct.pack('<IIBfff', nV, len(IX), 1 if big else 0, *o) + b'\0\0\0'
    blob += q.astype(np.uint16).tobytes() + RA_[:, 0].astype(np.float32).tobytes() + np.round(RA_[:, 1] * 100).astype(np.int16).tobytes()
    blob += np.stack([np.round(RA_[:, 2] * 10), RA_[:, 3]], -1).astype(np.uint8).tobytes()
    blob += np.c_[np.round(np.clip(LA_, 0, 2) * 100), np.zeros(nV)].astype(np.uint8).tobytes()
    blob += IX.astype(np.uint32 if big else np.uint16).tobytes()
    while len(blob) % 4: blob += b'\0'
    return blob
BPV, BRA, BLA, BIX, PAR = [], [], [], [], []
n_br = 0
for l in LINES:
    if not l['bridge']: continue
    P, nr, z, ds = l['P'], l['nr'], l['z'], l['ds']; hw = l['w'] / 2; n = len(P); b0 = len(BPV)
    for k in range(n):
        for sg in (1, -1):
            x, y = P[k] + nr[k] * sg * hw
            BPV.append((x - X0, z[k] - H0, -(y - Y0))); BRA.append((ds[k], sg * hw, hw, 2 if l['w'] >= 5 else 1)); BLA.append((1, 1, 1))
    for k in range(n - 1):
        i = b0 + 2 * k; BIX.extend([i, i + 1, i + 3, i, i + 3, i + 2])
    for sg in (1, -1):   # parapets 1 m high, 0.25 m thick
        for k in range(n - 1):
            a = P[k] + nr[k] * sg * (hw + 0.15); b = P[k + 1] + nr[k + 1] * sg * (hw + 0.15)
            PAR.append(((a[0] - X0, z[k] - H0, -(a[1] - Y0)), (b[0] - X0, z[k + 1] - H0, -(b[1] - Y0))))
    n_br += 1
br = bytearray(struct.pack('<II', 0x52445634, 1 if BPV else 0))
if BPV: br += chunk_blob(BPV, BRA, BLA, BIX)
open(OUTD + '/routes_ponts.bin', 'wb').write(br)
print('bridges', n_br)

# ---------------- kerbs and gutters along the edge of the asphalt (inside 1.5 km of the start)
KR = 1000.0
KP, KI = [], []
def kv(x, y, z, kind): KP.append((x - X0, z - H0, -(y - Y0), kind)); return len(KP) - 1
n_k = 0
for poly in polys:
    for ring in [poly.exterior] + list(poly.interiors):
        r = LineString(ring.coords).simplify(0.3).segmentize(4.0)
        C = np.asarray(r.coords)
        if len(C) < 3: continue
        dmin = np.hypot(C[:, 0] - X0, C[:, 1] - Y0).min()
        if dmin > KR: continue
        # inward direction: towards the asphalt (polygon interior)
        zs, ins = [], []
        for (px, py) in C: zs.append(road_attr(px, py)[3])
        for k in range(len(C) - 1):
            a, b = C[k], C[k + 1]
            if math.hypot(a[0] - X0, a[1] - Y0) > KR: continue
            tx, ty = b - a; L_ = math.hypot(tx, ty) or 1; tx /= L_; ty /= L_
            nx, ny = -ty, tx   # left of the ring direction
            mid = ((a[0] + b[0]) / 2 + nx * 0.2, (a[1] + b[1]) / 2 + ny * 0.2)
            inside = poly.contains(Point(mid))
            if not inside: nx, ny = -nx, -ny   # (nx, ny) points into the road
            za, zb = zs[k], zs[k + 1]
            # gutter: 0.35 m of smooth concrete inside the edge (kind 1), kerb: 0.15 m face + 0.15 m top (kind 0), skirt
            g0 = kv(a[0] + nx * 0.35, a[1] + ny * 0.35, za + 0.012, 1); g1 = kv(b[0] + nx * 0.35, b[1] + ny * 0.35, zb + 0.012, 1)
            g2 = kv(b[0], b[1], zb + 0.012, 1); g3 = kv(a[0], a[1], za + 0.012, 1)
            KI.extend([g0, g1, g2, g0, g2, g3])
            f0 = kv(a[0], a[1], za + 0.0, 0); f1 = kv(b[0], b[1], zb + 0.0, 0); f2 = kv(b[0], b[1], zb + 0.14, 0); f3 = kv(a[0], a[1], za + 0.14, 0)
            KI.extend([f0, f1, f2, f0, f2, f3])
            t0 = kv(a[0] - nx * 0.16, a[1] - ny * 0.16, za + 0.14, 0); t1 = kv(b[0] - nx * 0.16, b[1] - ny * 0.16, zb + 0.14, 0)
            KI.extend([f3, f2, t1, f3, t1, t0])
            s0 = kv(a[0] - nx * 0.16, a[1] - ny * 0.16, za - 0.6, 0); s1 = kv(b[0] - nx * 0.16, b[1] - ny * 0.16, zb - 0.6, 0)
            KI.extend([t0, t1, s1, t0, s1, s0])
            n_k += 1
# bridge parapets (kind 2): 0.25 m thick, 0.9 m high concrete walls along the bridge decks
for (a3, b3) in PAR:
    ax, ay, az = a3; bx, by, bz = b3
    if math.hypot(bx - ax, bz - az) < 0.05: continue
    q = [len(KP) + i for i in range(4)]
    KP.extend([(ax, ay - 0.3, az, 2), (bx, by - 0.3, bz, 2), (bx, by + 0.9, bz, 2), (ax, ay + 0.9, az, 2)])
    KI.extend([q[0], q[1], q[2], q[0], q[2], q[3]])
print('parapets', len(PAR))
kb = bytearray(struct.pack('<II', len(KP), len(KI))) + np.asarray(KP, np.float32).tobytes() + np.asarray(KI, np.uint32).tobytes()
open(OUTD + '/routes_bordures.bin', 'wb').write(kb)
print('kerb segments', n_k, 'MB', len(kb) / 1e6)

# ---------------- navigation graph (BD TOPO + OSM topology, one-way directions)
# OSM roads joined to the middle of another road split it there, so every junction is a node.
cuts = collections.defaultdict(set)
for l in LINES:
    for end, (kind, j), s_ in l.get('attach', []):
        tgt = j if kind == 'ign' else j
        L_ = LINES[tgt]
        if 0.5 < s_ < L_['len'] - 0.5: cuts[tgt].add(round(s_, 1))
NODES = {}
def node_id(p):
    k = nkey(p)
    if k not in NODES: NODES[k] = len(NODES)
    return NODES[k]
EDGES = []
for l in LINES:
    pts = [0.0] + sorted(cuts.get(l['id'], [])) + [l['len']]
    d = 0 if not l['oneway'] else (1 if l['sens'] == 'Sens direct' else -1)
    for s0, s1 in zip(pts[:-1], pts[1:]):
        if s1 - s0 < 0.2: continue
        p0 = l['geom'].interpolate(s0); p1 = l['geom'].interpolate(s1)
        EDGES.append({'id': l['id'], 's0': round(s0, 1), 's1': round(s1, 1), 'a': node_id((p0.x, p0.y)), 'b': node_id((p1.x, p1.y)), 'len': round(s1 - s0, 1), 'dir': d,
                      'w': round(l['w'], 2), 'imp': l['imp'], 'pont': l['bridge'], 'source': 'OSM' if l.get('osm') else 'IGN'})
NODE_XY = [None] * len(NODES)
for k, i in NODES.items(): NODE_XY[i] = [round(k[0] - X0, 1), round(-(k[1] - Y0), 1)]
json.dump({'nodes': NODE_XY, 'edges': EDGES}, open(OUTD + '/graphe_routier.json', 'w'))
print('graph nodes', len(NODES), 'edges', len(EDGES))
