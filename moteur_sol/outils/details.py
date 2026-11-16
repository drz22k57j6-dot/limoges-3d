"""Détails du sol urbain, générés à partir de la voirie réelle d'un secteur (voirie.wasm) et de ses arbres :
  - avaloirs (bouches d'égout) dans le caniveau, le long des bordures, loin des passages piétons ;
  - regards ronds en fonte sur la chaussée et sur les trottoirs ;
  - plaques rectangulaires de réseaux (eau, télécom, gaz) sur les trottoirs ;
  - grilles d'arbres en fonte autour des arbres plantés dans un trottoir ;
  - herbes sauvages au pied des murs (bord du trottoir qui ne touche pas la chaussée) et dans le joint caniveau/bordure.

Chaque herbe reçoit un seuil d'« abandon » (0-255) : le jeu n'affiche que celles dont le seuil est sous le niveau
réglé ; le seuil suit un bruit à grande échelle (quartiers plus ou moins entretenus) et un bruit fin.
Les positions sont générées (règles + hasard reproductible), pas relevées sur le terrain.

Sortie : data/<ville>/secteurs/<i_j>/sol_details.wasm
  en-tête  : 'SOLD' (u32), nombre de types (u32), x0 (f32), z0 (f32), y0 (f32)
  par type : type (u32), n (u32), puis n × [x u16 (1,6 cm), z u16, y i16 (cm, depuis y0), angle u8, variante u8,
             seuil u8, échelle u8] = 10 octets
Usage : python3 -I moteur_sol/outils/details.py <ville> <secteur> [<secteur> ...]   (ville : paris)
"""
import json, os, struct, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RES = 0.25                                  # m par pixel du raster de travail
KINDS = {'avaloir': 0, 'regard': 1, 'plaque': 2, 'grille_arbre': 3, 'herbe_mur': 4, 'herbe_caniveau': 5, 'porte_cochere': 6, 'podotactile': 7}
C_VIDE, C_ROUTE, C_TROTTOIR, C_BORDURE, C_PASSAGE, C_PAVE = 0, 1, 2, 3, 4, 5
MAT2C = {0: C_ROUTE, 1: C_TROTTOIR, 2: C_BORDURE, 3: C_PASSAGE, 4: C_PAVE}


def read_voirie(path):
    b = open(path, 'rb').read()
    mag, n = struct.unpack('<II', b[:8]); assert mag == 0x31494F56
    o, out = 8, []
    for _ in range(n):
        mat, big, hasA, _, nV, nI, ox, oy, oz = struct.unpack('<BBBBIIfff', b[o:o + 24]); o += 24
        q = np.frombuffer(b[o:o + nV * 6], '<u2').reshape(nV, 3).astype(np.float64); o += nV * 6
        if hasA: o += nV * 4
        idx = np.frombuffer(b[o:o + nI * (4 if big else 2)], '<u4' if big else '<u2').astype(np.int64); o += nI * (4 if big else 2)
        o += (4 - o % 4) % 4
        P = q * [0.02, 0.005, 0.02] + [ox, oy, oz]
        out.append((mat, P, idx.reshape(-1, 3)))
    return out


def read_trees(path):
    if not os.path.exists(path): return np.zeros((0, 6), np.float32)
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[:4])[0]
    return np.frombuffer(b[4:4 + n * 24], '<f4').reshape(n, 6)


def value_noise(x, z, scale, seed):
    """bruit de valeur lissé, vectorisé (x, z en m)."""
    gx, gz = x / scale, z / scale; ix, iz = np.floor(gx), np.floor(gz); fx, fz = gx - ix, gz - iz
    fx, fz = fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)
    def h(a, b):
        v = np.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453
        return v - np.floor(v)
    return (h(ix, iz) * (1 - fx) + h(ix + 1, iz) * fx) * (1 - fz) + (h(ix, iz + 1) * (1 - fx) + h(ix + 1, iz + 1) * fx) * fz


def poisson(cand_xy, spacing, rng, limit=None):
    """garde des candidats espacés d'au moins `spacing` m (ordre aléatoire reproductible)."""
    order = rng.permutation(len(cand_xy)); cell = spacing / 1.4142; grid = {}; keep = []
    for i in order:
        x, z = cand_xy[i]; cx, cz = int(x // cell), int(z // cell); ok = True
        for a in range(cx - 2, cx + 3):
            for b in range(cz - 2, cz + 3):
                j = grid.get((a, b))
                if j is not None and (cand_xy[j][0] - x) ** 2 + (cand_xy[j][1] - z) ** 2 < spacing * spacing: ok = False; break
            if not ok: break
        if ok:
            grid[(cx, cz)] = i; keep.append(i)
            if limit and len(keep) >= limit: break
    return np.array(keep, dtype=np.int64)


def build(ville, k):
    sec = os.path.join(ROOT, 'data', ville, 'secteurs', k)
    idx = json.load(open(os.path.join(ROOT, 'data', ville, 'secteurs', 'index.json')))
    i, j = map(int, k.split('_')); x0 = i * 1000 - idx['RX']; z0 = -((j + 1) * 1000 - idx['RY'])   # coin x min, z min (repère du jeu)
    N = int(1000 / RES)
    rng = np.random.default_rng(i * 7919 + j * 104729)

    # ---------------- raster : classe du sol et hauteur
    cls_img = Image.new('L', (N, N), C_VIDE); y_img = Image.new('F', (N, N), np.nan)
    dc, dy = ImageDraw.Draw(cls_img), ImageDraw.Draw(y_img)
    groups = read_voirie(os.path.join(sec, 'voirie.wasm'))
    for want in (1, 4, 0, 3, 2):                      # ordre de dessin : trottoir, pavés, chaussée, passages, bordures
        for mat, P, T in groups:
            if mat != want: continue
            A, B, C = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
            area = 0.5 * np.abs((B[:, 0] - A[:, 0]) * (C[:, 2] - A[:, 2]) - (C[:, 0] - A[:, 0]) * (B[:, 2] - A[:, 2]))
            ym = (A[:, 1] + B[:, 1] + C[:, 1]) / 3
            for t in np.nonzero(area > 1e-4)[0]:
                pts = [((v[0] - x0) / RES, (v[2] - z0) / RES) for v in (A[t], B[t], C[t])]
                dc.polygon(pts, fill=MAT2C[mat]); dy.polygon(pts, fill=float(ym[t]))
    cls = np.asarray(cls_img); Y = np.asarray(y_img).astype(np.float32)
    # trous de hauteur : valeur du voisin le plus proche
    nan = np.isnan(Y)
    if nan.all(): raise SystemExit(f'{k} : pas de voirie')
    _, (ri, ci) = ndimage.distance_transform_edt(nan, return_indices=True); Y = Y[ri, ci]

    road = (cls == C_ROUTE) | (cls == C_PASSAGE)
    side = cls == C_TROTTOIR
    kerb = cls == C_BORDURE
    walk = side | kerb | (cls == C_PAVE)
    empty = cls == C_VIDE
    # distance (m) à la bordure / au trottoir depuis la chaussée, avec l'indice du pixel le plus proche (orientation)
    d_k, (kr, kc) = ndimage.distance_transform_edt(~(kerb | side), return_indices=True); d_k *= RES
    d_pass = ndimage.distance_transform_edt(cls != C_PASSAGE) * RES
    d_empty, (er, ec) = ndimage.distance_transform_edt(~empty, return_indices=True); d_empty *= RES
    d_road, (rr_, rc_) = ndimage.distance_transform_edt(~road, return_indices=True); d_road *= RES
    d_walk_edge = ndimage.distance_transform_edt(walk) * RES            # 0 hors trottoir

    rows, cols = np.mgrid[0:N, 0:N]
    WX = x0 + (cols + 0.5) * RES; WZ = z0 + (rows + 0.5) * RES
    items = {v: [] for v in KINDS.values()}

    def add(kind, sel, ang, var, thr, scale):
        r, c = sel
        for a in zip(WX[r, c], WZ[r, c], Y[r, c], ang, var, thr, scale): items[kind].append(a)

    def pick(mask, spacing, limit=None):
        r, c = np.nonzero(mask)
        if len(r) == 0: return r, c
        keep = poisson(np.column_stack([WX[r, c], WZ[r, c]]), spacing, rng, limit)
        return r[keep], c[keep]

    def toward(r, c, tr, tc):                        # angle (rad) de la direction pixel -> pixel cible, dans le plan x/z
        return np.arctan2((tr[r, c] - r).astype(float), (tc[r, c] - c).astype(float))

    # bouches d'égout parisiennes : fente dans la bordure de granit + tampon sur le trottoir ; pied de bordure, loin des passages
    r, c = pick(road & (d_k > 0.0) & (d_k < 0.3) & (d_pass > 6), 36)
    if len(r): add(0, (r, c), toward(r, c, kr, kc), rng.integers(0, 3, len(r)), np.zeros(len(r), int), np.full(len(r), 100))
    # regards ronds : chaussée (milieu des voies) et trottoirs larges
    r, c = pick(road & (d_k > 2.5) & (cls != C_PASSAGE), 38)
    if len(r): add(1, (r, c), rng.uniform(0, 6.283, len(r)), rng.integers(0, 3, len(r)), np.zeros(len(r), int), np.full(len(r), 100))
    r, c = pick(side & (d_road > 1.2) & (d_empty > 0.8), 45)
    if len(r): add(1, (r, c), rng.uniform(0, 6.283, len(r)), rng.integers(0, 3, len(r)), np.zeros(len(r), int), np.full(len(r), 85))
    # plaques de réseaux : trottoirs, alignées sur la façade la plus proche
    r, c = pick(side & (d_road > 1.0) & (d_empty > 0.5) & (d_empty < 2.5), 24)
    if len(r): add(2, (r, c), toward(r, c, er, ec), rng.integers(0, 4, len(r)), np.zeros(len(r), int), np.full(len(r), 100))
    # grilles d'arbres : arbres plantés dans un trottoir
    T = read_trees(os.path.join(sec, 'arbres.wasm'))
    if len(T):
        tc_ = ((T[:, 0] - x0) / RES).astype(int); tr_ = ((T[:, 2] - z0) / RES).astype(int)
        ok = (tc_ >= 0) & (tc_ < N) & (tr_ >= 0) & (tr_ < N)
        tr_, tc_, TT = tr_[ok], tc_[ok], T[ok]
        on = side[tr_, tc_]
        for t, rr, cc in zip(TT[on], tr_[on], tc_[on]):
            items[3].append((t[0], t[2], Y[rr, cc], rng.uniform(0, 6.283), rng.integers(0, 3), 0, 100))
    # niveau d'abandon : quartiers (≈ 250 m) + rues (≈ 40 m) + hasard
    def threshold(x, z):
        q = value_noise(x, z, 260.0, 3) * 0.6 + value_noise(x, z, 45.0, 8) * 0.3 + rng.uniform(0, 0.1, len(x))
        return np.clip(q * 255, 0, 255).astype(int)
    # quadrillage des passages de porte cochère : contre la façade, un tous les ~30 m (positions générées)
    r, c = pick(side & (d_empty > 0) & (d_empty < 0.3) & (d_road > 2.2), 30)
    if len(r): add(6, (r, c), toward(r, c, er, ec), rng.integers(0, 3, len(r)), np.zeros(len(r), int), np.full(len(r), 100))
    # bandes d'éveil de vigilance : bord du trottoir au droit des passages piétons, dalles de 40 cm
    r, c = pick((side | kerb) & (d_road > 0.25) & (d_road < 0.75) & (d_pass < 1.6), 0.42)
    if len(r): add(7, (r, c), toward(r, c, rr_, rc_), np.zeros(len(r), int), np.zeros(len(r), int), np.full(len(r), 100))
    # herbes au pied des murs : bord du trottoir côté bâtiment (pas côté chaussée)
    r, c = pick(side & (d_empty > 0) & (d_empty < 0.45) & (d_road > 1.0), 0.8, 60000)
    if len(r): add(4, (r, c), toward(r, c, er, ec), rng.integers(0, 4, len(r)), threshold(WX[r, c], WZ[r, c]), rng.integers(60, 140, len(r)))
    # herbes dans le joint caniveau / bordure
    r, c = pick(road & (d_k > 0.0) & (d_k < 0.3) & (d_pass > 2), 1.3, 40000)
    if len(r): add(5, (r, c), toward(r, c, kr, kc), rng.integers(0, 4, len(r)), np.clip(threshold(WX[r, c], WZ[r, c]) + 30, 0, 255), rng.integers(40, 100, len(r)))

    # ---------------- écriture
    y0 = float(np.nanmin(Y)) - 1
    blob = struct.pack('<IIfff', 0x444C4F53, len(items), x0, z0, y0)
    for kind, lst in items.items():
        a = np.array(lst, dtype=np.float64).reshape(-1, 7)
        rec = np.zeros(len(a), dtype=[('x', '<u2'), ('z', '<u2'), ('y', '<i2'), ('a', 'u1'), ('v', 'u1'), ('t', 'u1'), ('s', 'u1')])
        if len(a):
            rec['x'] = np.clip(np.round((a[:, 0] - x0) / 1000 * 65535), 0, 65535); rec['z'] = np.clip(np.round((a[:, 1] - z0) / 1000 * 65535), 0, 65535)
            rec['y'] = np.clip(np.round((a[:, 2] - y0) * 100), -32767, 32767)
            rec['a'] = np.round((a[:, 3] % (2 * np.pi)) / (2 * np.pi) * 255); rec['v'] = a[:, 4]; rec['t'] = a[:, 5]; rec['s'] = np.clip(a[:, 6], 0, 255)
            if kind in (4, 5): rec = rec[np.argsort(rec['t'], kind='stable')]   # triées par seuil : le jeu n'affiche que le début de la liste
        blob += struct.pack('<II', kind, len(rec)) + rec.tobytes()
    open(os.path.join(sec, 'sol_details.wasm'), 'wb').write(blob)
    e = idx['secteurs'][k]
    if 'sol_details.wasm' not in e['fichiers']: e['fichiers'].append('sol_details.wasm')
    json.dump(idx, open(os.path.join(ROOT, 'data', ville, 'secteurs', 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print(k, f'{len(blob) / 1024:.0f} Ko', {n: len(items[v]) for n, v in KINDS.items()})


if __name__ == '__main__':
    for k in sys.argv[2:]: build(sys.argv[1], k)
