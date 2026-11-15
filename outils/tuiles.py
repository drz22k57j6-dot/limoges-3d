# Exécuté depuis build.py (TILES_OUT=<dossier>) : bâtiments en 3D Tiles 1.1 (tileset.json + GLB par tuile).
#  - tuiles de 250 m (détail complet, matériaux du jeu par nom) sous des tuiles de 1 km (version lointaine : prismes colorés)
#  - chaque sommet porte _BATCHID → mesh.extras.ids[_BATCHID] = identifiant IGN du bâtiment (fiche, futur jeu)
#  - repère = repère du jeu (Y vers le haut, X est, Z = −nord), asset.gltfUpAxis = 'Z' pour que le lecteur ne tourne rien
import json as _json, os as _os, numpy as _np
_TD = TILES; _os.makedirs(_TD + '/b', exist_ok=True)
_MATNAME = {m: G.g['materials'][m]['name'] for k, m in BMATS}
_MATNAME[-1] = 'lointain'
def _write_tile(path, groups):
    T = GLB(); mats = {}; ids_all = []
    fids = _np.unique(_np.concatenate([_np.concatenate(a['f']) for _, a in groups]))
    remap = {int(f): i for i, f in enumerate(fids)}
    prims = []; lo = _np.full(3, 1e9); hi = _np.full(3, -1e9)
    for mname, a in groups:
        if mname not in mats: mats[mname] = T.material(mname, rough=0.9)
        P = _np.vstack(a['p']).astype(_np.float32); I = _np.concatenate(a['i']); UV = _np.vstack(a['uv']); C = _np.vstack(a['c'])
        F = _np.array([remap[int(x)] for x in _np.concatenate(a['f'])], _np.uint16)
        pr = T.prim(P, I, mats[mname], uv=UV, col=C)
        pr['attributes']['_BATCHID'] = T.acc(F, 'SCALAR', 5123, 34962)
        prims.append(pr); lo = _np.minimum(lo, P.min(0)); hi = _np.maximum(hi, P.max(0))
    T.node('tuile', prims, extra={'extras': {'ids': [BIDS[int(f)] for f in fids]}})
    T.g['meshes'][-1]['extras'] = {'ids': [BIDS[int(f)] for f in fids]}
    T.write(path)
    return lo, hi, len(fids)
def _box(lo, hi):
    c = (lo + hi) / 2; h = _np.maximum((hi - lo) / 2, 0.5)
    return [float(c[0]), float(c[1]), float(c[2]), float(h[0]), 0, 0, 0, float(h[1]), 0, 0, 0, float(h[2])]
_kids = {}
_n = 0
for cell in sorted(set(c for c, k in ACC)):
    groups = [(_MATNAME[m], ACC[(cell, k)]) for k, m in BMATS if (cell, k) in ACC]
    name = f'b/d_{cell[0]}_{cell[1]}.glb'
    lo, hi, nb_ = _write_tile(_TD + '/' + name, groups); _n += 1
    km = (int(cell[0] * 250 // 1000), int(cell[1] * 250 // 1000))
    _kids.setdefault(km, []).append({'boundingVolume': {'box': _box(lo, hi)}, 'geometricError': 0, 'content': {'uri': name}})
_root_kids = []; _LO = _np.full(3, 1e9); _HI = _np.full(3, -1e9)
for km, kids in sorted(_kids.items()):
    t = {'geometricError': 3.5, 'refine': 'REPLACE', 'children': kids}
    if (km, 'lod1') in ACC1:
        name = f'b/l_{km[0]}_{km[1]}.glb'
        lo, hi, _ = _write_tile(_TD + '/' + name, [('lointain', ACC1[(km, 'lod1')])]); t['content'] = {'uri': name}
    bx = _np.array([k['boundingVolume']['box'] for k in kids])
    lo = (bx[:, :3] - bx[:, [3, 7, 11]]).min(0); hi = (bx[:, :3] + bx[:, [3, 7, 11]]).max(0)
    t['boundingVolume'] = {'box': _box(lo, hi)}; _LO = _np.minimum(_LO, lo); _HI = _np.maximum(_HI, hi)
    _root_kids.append(t)
_ts = {'asset': {'version': '1.1', 'gltfUpAxis': 'Z', 'generator': 'Limoges 3D — outils/tuiles.py'},
       'properties': {}, 'geometricError': 200,
       'extras': {'sources': 'IGN BD TOPO (bâtiments), LiDAR HD (sol), BD ORTHO (toits) — Licence Ouverte 2.0', 'repere': 'local jeu : X est, Y haut, Z = -nord, origine Lambert-93 (562924, 6528957)',
                  'batiments': len(BIDS), 'identifiant': 'mesh.extras.ids[_BATCHID] = cleabs IGN'},
       'root': {'boundingVolume': {'box': _box(_LO, _HI)}, 'geometricError': 60, 'refine': 'REPLACE', 'children': _root_kids}}
_json.dump(_ts, open(_TD + '/tileset.json', 'w'))
print('tuiles', _n, 'km', len(_root_kids), 'batiments', len(BIDS))
