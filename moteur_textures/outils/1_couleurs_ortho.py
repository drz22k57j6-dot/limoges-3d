"""Couleur vue du ciel de chaque matériau d'un monument, mesurée sur la BD ORTHO IGN (faces tournées vers le haut et visibles)."""
import json, sys, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
X0, Y0, XMIN, YMIN = 652087.0, 6862038.0, 642087.0, 6856038.0
idx = {m['fichier']: m for m in json.load(open('/home/claude/limoges-3d/data/paris/modeles/index.json'))['modeles']}
T = {}
def ortho(i, j):
    if (i, j) not in T: T[(i, j)] = np.asarray(Image.open(f'/home/claude/dlp/ortho_{i}_{j}.jpg'))
    return T[(i, j)]
res = {}
for name in sys.argv[1:]:
    g = json.load(open(f'/home/claude/mtex/{name}.json')); m = idx[f'ol/{name}.glb']; cx, cz = m['centre_local']; a = np.radians(m.get('cap_deg', 0))
    tri = {}
    for mat, o in g.items():
        P = np.array(o['P']).reshape(-1, 3); I = np.array(o['I']).reshape(-1, 3); V = P[I]
        n = np.cross(V[:, 1] - V[:, 0], V[:, 2] - V[:, 0]); A = np.linalg.norm(n, axis=1) / 2; n /= np.maximum(2 * A, 1e-9)[:, None]
        c = V.mean(1); x = c[:, 0] * np.cos(a) + c[:, 2] * np.sin(a); z = -c[:, 0] * np.sin(a) + c[:, 2] * np.cos(a)
        tri[mat] = (x + cx + X0, -(z + cz) + Y0, c[:, 1], n[:, 1], A)
    # carte des hauteurs maximales (cellules de 1 m) pour ne garder que ce qui se voit du ciel
    allx = np.concatenate([t[0] for t in tri.values()]); ally = np.concatenate([t[1] for t in tri.values()]); allh = np.concatenate([t[2] for t in tri.values()])
    key = lambda X, Y: (np.floor(X).astype(np.int64) * 100003 + np.floor(Y).astype(np.int64))
    top = {}
    for k, h in zip(key(allx, ally), allh): top[k] = max(top.get(k, -1e9), h)
    out = {}
    for mat, (X, Y, H, ny, A) in tri.items():
        ks = key(X, Y); vis = (ny > 0.35) & (np.array([H[i] >= top[k] - 0.8 for i, k in enumerate(ks)]))
        if vis.sum() < 3: out[mat] = None; continue
        cols = []
        for x, y in zip(X[vis], Y[vis]):
            i, j = int((x - XMIN) // 2000), int((y - YMIN) // 2000); o = ortho(i, j); S = o.shape[0]
            cols.append(o[min(S - 1, int((YMIN + (j + 1) * 2000 - y) / 2000 * S)), min(S - 1, int((x - XMIN - i * 2000) / 2000 * S))])
        cols = np.array(cols, float); out[mat] = {'rgb': np.median(cols, 0).round().tolist(), 'n': int(vis.sum()), 'aire_m2': round(float(A[vis].sum()))}
    res[name] = out; print(name, out)
json.dump(res, open('/home/claude/mtex/ortho_couleurs.json', 'w'), indent=1)
