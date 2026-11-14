"""Végétation mesurée au LiDAR HD (IGN) pour Limoges 3D — mode « mixte ».

- Arbres isolés, alignements, parcs : un arbre par couronne détectée, avec sa vraie position, sa vraie hauteur
  et la vraie largeur de sa couronne (segmentation par bassins versants sur le modèle de hauteur MNH 1 m,
  limitée aux pixels classés « végétation moyenne/haute » par l'IGN).
- Bois denses : un volume de canopée qui suit exactement la surface mesurée (MNH), coloré par l'orthophoto,
  avec des troncs sous la canopée. Les routes qui traversent les bois en sont retirées (arbres individuels).

Entrées : services IGN (Licence Ouverte) + data/relief.wasm et data/routes_axes.wasm du dépôt.
Sorties : data/arbres.wasm (même format qu'avant) et data/forets.wasm (nouveau).
Usage : python3 outils/vegetation.py [dossier_cache]
"""
import io, os, struct, sys, time, math
import numpy as np, requests
from PIL import Image, ImageDraw
from pyproj import Transformer
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from skimage.segmentation import watershed

X0, Y0, R = 562924.0, 6528957.0, 3000.0
XMIN, YMIN = X0 - R, Y0 - R
TILE, MARGIN, RES = 1000, 40, 1.0
CACHE = sys.argv[1] if len(sys.argv) > 1 else '/tmp/veg_cache'
os.makedirs(CACHE, exist_ok=True)
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WMS = 'https://data.geopf.fr/wms-r/wms'
S = requests.Session()
if os.path.exists(os.path.expanduser('~/.ccr/ca-bundle.crt')): S.verify = os.path.expanduser('~/.ccr/ca-bundle.crt')
to3857 = Transformer.from_crs(2154, 3857, always_xy=True)

def get(params, name):
    p = os.path.join(CACHE, name)
    if os.path.exists(p): return open(p, 'rb').read()
    for k in range(5):
        try:
            r = S.get(WMS, params=params, timeout=180)
            if r.ok and len(r.content) > 1000: open(p, 'wb').write(r.content); return r.content
        except Exception as e: print('  retry', name, e)
        time.sleep(3 * (k + 1))
    raise RuntimeError(name)

def wms(layer, bb, W, H, fmt, crs='EPSG:2154', name=''):
    return get({'SERVICE': 'WMS', 'VERSION': '1.3.0', 'REQUEST': 'GetMap', 'LAYERS': layer, 'STYLES': '', 'CRS': crs, 'BBOX': ','.join(f'{v:.3f}' for v in bb), 'WIDTH': W, 'HEIGHT': H, 'FORMAT': fmt}, name)

# ---------- relief du jeu (pour poser exactement au sol du maillage rendu) ----------
def load_relief():
    b = open(os.path.join(REPO, 'data/relief.wasm'), 'rb').read()
    H0, n = struct.unpack_from('<fI', b, 0); o = 8; tiles = []
    for _ in range(n):
        x0, y0, s, mn, N = struct.unpack_from('<ffffI', b, o); o += 20
        h = np.frombuffer(b, np.uint16, N * N, o).reshape(N, N).astype(np.float64); o += N * N * 2
        tiles.append((x0, y0, s, mn, N, h))
    return H0, tiles
H0, RELIEF = load_relief()
def ground(x, y):
    """x, y Lambert-93 -> hauteur du sol du jeu (repère du jeu, y = altitude - H0)"""
    lx, ly = np.asarray(x, float) - X0, np.asarray(y, float) - Y0
    out = np.zeros(lx.shape)
    for (x0, y0, s, mn, N, h) in RELIEF:
        m = (lx >= x0) & (lx <= x0 + 2000) & (ly >= y0) & (ly <= y0 + 2000)
        if not m.any(): continue
        n = N - 1; a = np.clip((lx[m] - x0) / s, 0, n - 1e-6); bb = np.clip((ly[m] - y0) / s, 0, n - 1e-6)
        a0 = a.astype(int); b0 = bb.astype(int); fx = a - a0; fy = bb - b0
        h00 = h[b0, a0]; h10 = h[b0, a0 + 1]; h01 = h[b0 + 1, a0]; h11 = h[b0 + 1, a0 + 1]
        v = np.where(fx >= fy, h00 + fx * (h10 - h00) + fy * (h11 - h10), h00 + fy * (h01 - h00) + fx * (h11 - h01))
        out[m] = v * 0.01 + mn - H0
    return out

# ---------- routes (couloirs retirés des bois) ----------
def load_roads():
    b = open(os.path.join(REPO, 'data/routes_axes.wasm'), 'rb').read()
    v2 = struct.unpack_from('<I', b, 0)[0] == 0x52445632; n = struct.unpack_from('<I', b, 4 if v2 else 0)[0]; o = 8 if v2 else 4; out = []
    for _ in range(n):
        nid, w, m = struct.unpack_from('<IfI', b, o); o += 12
        a = np.frombuffer(b, np.float32, m * 5, o).reshape(m, 5); o += m * 20
        out.append((a[:, 0] + X0, Y0 - a[:, 1], float(w)))
    return out
ROADS = load_roads()

def tile_data(i, j):
    x0, y0 = XMIN + i * TILE - MARGIN, YMIN + j * TILE - MARGIN
    x1, y1 = x0 + TILE + 2 * MARGIN, y0 + TILE + 2 * MARGIN
    N = int((x1 - x0) / RES)
    mnh = np.frombuffer(wms('IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93', (x0, y0, x1, y1), N, N, 'image/x-bil;bits=32', name=f'mnh_{i}_{j}.bil'), np.float32).reshape(N, N).copy()
    mnh[(mnh < -50) | (mnh > 80) | ~np.isfinite(mnh)] = 0
    ortho = np.asarray(Image.open(io.BytesIO(wms('HR.ORTHOIMAGERY.ORTHOPHOTOS', (x0, y0, x1, y1), N, N, 'image/jpeg', name=f'ortho_{i}_{j}.jpg'))).convert('RGB')).astype(np.float32)
    # classification LiDAR (servie en Web Mercator) -> rééchantillonnée sur la grille Lambert-93
    ax, ay = to3857.transform([x0, x1, x0, x1], [y0, y0, y1, y1]); bx = (min(ax), min(ay), max(ax), max(ay))
    CW = int(round((bx[2] - bx[0]) / 1.0)); CH = int(round((bx[3] - bx[1]) / 1.0))
    cls = np.asarray(Image.open(io.BytesIO(wms('IGNF_LIDAR-HD_CLASS', bx, CW, CH, 'image/png', crs='EPSG:3857', name=f'class_{i}_{j}.png'))).convert('RGB')).astype(np.int16)
    gx, gy = np.meshgrid(x0 + (np.arange(N) + 0.5) * RES, y1 - (np.arange(N) + 0.5) * RES)
    mx, my = to3857.transform(gx, gy)
    ci = np.clip(((mx - bx[0]) / (bx[2] - bx[0]) * CW).astype(int), 0, CW - 1); ri = np.clip(((bx[3] - my) / (bx[3] - bx[1]) * CH).astype(int), 0, CH - 1)
    c = cls[ri, ci]
    veg = (c[..., 1] > c[..., 0] + 40) & (c[..., 1] > c[..., 2] + 40)   # végétation moyenne + haute (vert)
    return dict(x0=x0, y0=y0, x1=x1, y1=y1, N=N, mnh=mnh, ortho=ortho, veg=veg)

def process(i, j):
    T = tile_data(i, j); N = T['N']; mnh = T['mnh']; veg = T['veg'] & (mnh > 1.5)
    if veg.sum() < 50: return [], None, []
    sm = ndi.gaussian_filter(np.where(veg, mnh, 0), 1.0)
    # 1) sommets : maxima locaux, puis suppression des sommets trop proches d'un plus haut (rayon ∝ hauteur)
    mx = ndi.maximum_filter(sm, size=5)
    pk = np.argwhere((sm == mx) & (sm > 3.0) & veg)
    hts = sm[pk[:, 0], pk[:, 1]]; order = np.argsort(-hts); pk = pk[order]; hts = hts[order]
    keep = np.ones(len(pk), bool); tree = cKDTree(pk)
    for k in range(len(pk)):
        if not keep[k]: continue
        for q in tree.query_ball_point(pk[k], max(2.0, 0.09 * hts[k] + 1.4) / RES):
            if q != k and hts[q] <= hts[k]: keep[q] = False
    pk = pk[keep]
    markers = np.zeros((N, N), np.int32); markers[pk[:, 0], pk[:, 1]] = np.arange(1, len(pk) + 1)
    # 2) couronnes : bassins versants sur la surface inversée, limités à la végétation > 2 m
    lab = watershed(-sm, markers, mask=veg & (mnh > 2.0))
    n = len(pk); idx = np.arange(1, n + 1)
    area = ndi.sum(np.ones_like(lab), lab, idx) * RES * RES
    hmax = ndi.maximum(mnh, lab, idx)
    cyx = np.array(ndi.center_of_mass(np.ones_like(lab), lab, idx))
    col = np.stack([ndi.mean(T['ortho'][..., k], lab, idx) for k in range(3)], -1)
    # 3) bois denses : couvert fermé, à plus de 7 m de la lisière, surface > 3000 m², hors couloirs routiers
    cover = ndi.binary_closing(veg & (mnh > 3), structure=np.ones((5, 5)))
    cl, nc = ndi.label(cover); sizes = ndi.sum(np.ones_like(cl), cl, np.arange(1, nc + 1))
    big = np.isin(cl, 1 + np.nonzero(sizes * RES * RES > 3000)[0])
    core = big & (ndi.distance_transform_edt(big) * RES > 7)
    rm = Image.new('L', (N, N), 0); dr = ImageDraw.Draw(rm)
    for (xs, ys, w) in ROADS:
        if xs.max() < T['x0'] or xs.min() > T['x1'] or ys.max() < T['y0'] or ys.min() > T['y1']: continue
        pts = [((x - T['x0']) / RES, (T['y1'] - y) / RES) for x, y in zip(xs, ys)]
        dr.line(pts, fill=255, width=max(3, int((w + 8) / RES)))
    core &= ~(np.asarray(rm) > 0)
    core = ndi.binary_opening(core, structure=np.ones((5, 5)))
    # 4) arbres : on garde ceux dont le sommet est dans la tuile (hors marge) ; hors cœur de bois -> arbre individuel
    trees, trunks = [], []
    for k in range(n):
        r_, c_ = pk[k]
        x = T['x0'] + (c_ + 0.5) * RES; y = T['y1'] - (r_ + 0.5) * RES
        if not (XMIN + i * TILE <= x < XMIN + (i + 1) * TILE and YMIN + j * TILE <= y < YMIN + (j + 1) * TILE): continue
        if area[k] < 3: continue
        h = float(hmax[k]); rad = float(np.clip(math.sqrt(area[k] / math.pi), 0.8, 14))
        if core[r_, c_]: trunks.append((x, y, h, rad)); continue
        # centre de la couronne (souvent décalé du sommet) : on pose l'arbre au centre
        cx = T['x0'] + (cyx[k, 1] + 0.5) * RES; cy = T['y1'] - (cyx[k, 0] + 0.5) * RES
        trees.append((cx, cy, h, rad, *col[k]))
    # 5) canopée des bois : grille 3 m sur le cœur
    mesh = None
    if core[MARGIN:-MARGIN, MARGIN:-MARGIN].sum() > 200:
        mesh = canopy(T, core, ndi.gaussian_filter(mnh, 1.6), i, j)
    return trees, mesh, trunks

def canopy(T, core, smh, i, j, step=3):
    # cellules de 3 m à l'intérieur de la tuile (sans marge) dont le centre est dans le cœur
    s = int(step / RES); nC = TILE // step
    cells = np.zeros((nC, nC), bool)
    for a in range(nC):
        for b in range(nC):
            r = MARGIN + a * s + s // 2; c = MARGIN + b * s + s // 2
            cells[a, b] = core[r, c]
    if cells.sum() < 20: return None
    vid = -np.ones((nC + 1, nC + 1), np.int64); pos, col = [], []
    edge = np.zeros((nC + 1, nC + 1), bool)
    pad = np.pad(cells, 1)
    # un sommet est « de lisière » si une des 4 cellules voisines manque
    for a in range(nC + 1):
        for b in range(nC + 1):
            around = pad[a:a + 2, b:b + 2]
            if around.any(): edge[a, b] = not around.all()
    xs = T['x0'] + MARGIN * RES + np.arange(nC + 1) * step; ys = T['y1'] - MARGIN * RES - np.arange(nC + 1) * step
    tris = []
    for a in range(nC):
        for b in range(nC):
            if not cells[a, b]: continue
            q = []
            for (da, db) in ((0, 0), (0, 1), (1, 1), (1, 0)):
                A, B = a + da, b + db
                if vid[A, B] < 0:
                    x, y = xs[B], ys[A]
                    r = min(T['N'] - 1, int((T['y1'] - y) / RES)); c = min(T['N'] - 1, int((x - T['x0']) / RES))
                    h = float(smh[r, c]) * (0.6 if edge[A, B] else 1.0)
                    g = float(ground(np.array([x]), np.array([y]))[0])
                    vid[A, B] = len(pos); pos.append((x - X0, g + h, -(y - Y0)))
                    o = T['ortho'][max(0, r - 1):r + 2, max(0, c - 1):c + 2].reshape(-1, 3).mean(0)
                    col.append(np.clip(o * 1.12, 0, 255))
                q.append(vid[A, B])
            tris += [(q[0], q[3], q[1]), (q[1], q[3], q[2])]
    return np.array(pos, np.float32), np.array(col, np.uint8), np.array(tris, np.uint32 if len(pos) > 65535 else np.uint16)

def main():
    allt, meshes, allk = [], [], []
    t0 = time.time()
    for i in range(6):
        for j in range(6):
            tr, m, tk = process(i, j); allt += tr; allk += tk
            if m is not None: meshes.append(m)
            print(f'tuile {i},{j} : {len(tr)} arbres, {len(tk)} troncs de bois, canopée {0 if m is None else len(m[0])} sommets  ({time.time() - t0:.0f} s)', flush=True)
    A = np.array(allt, np.float64)
    gz = ground(A[:, 0], A[:, 1])
    rng = np.random.default_rng(7)
    arr = np.stack([A[:, 0] - X0, gz - 0.2, -(A[:, 1] - Y0), A[:, 2], A[:, 3], rng.uniform(0, 2 * np.pi, len(A))], -1).astype(np.float32)
    cols = np.c_[np.clip(A[:, 4:7] * 1.15, 0, 255), np.full(len(A), 255)].astype(np.uint8)
    open(os.path.join(REPO, 'data/arbres.wasm'), 'wb').write(struct.pack('<I', len(A)) + arr.tobytes() + cols.tobytes())
    K = np.array(allk, np.float64) if allk else np.zeros((0, 4))
    kz = ground(K[:, 0], K[:, 1]) if len(K) else np.zeros(0)
    fb = bytearray(struct.pack('<4sII', b'FOR1', len(meshes), len(K)))
    for (p, c, t) in meshes:
        cb = c.tobytes(); cb += b'\0' * (-len(cb) % 4); tb = t.tobytes(); tb += b'\0' * (-len(tb) % 4)
        fb += struct.pack('<III', len(p), len(t) * 3, t.dtype.itemsize) + p.tobytes() + cb + tb
    fb += np.stack([K[:, 0] - X0, kz - 0.2, -(K[:, 1] - Y0), K[:, 2], K[:, 3]], -1).astype(np.float32).tobytes() if len(K) else b''
    open(os.path.join(REPO, 'data/forets.wasm'), 'wb').write(fb)
    print(f'TOTAL : {len(A)} arbres individuels, {len(K)} arbres dans {len(meshes)} morceaux de canopée ({sum(len(m[0]) for m in meshes)} sommets, {sum(len(m[2]) for m in meshes)} triangles)')
    print('rayon couronne médian', np.median(A[:, 3]), 'hauteur médiane', np.median(A[:, 2]))

if __name__ == '__main__':
    main()
