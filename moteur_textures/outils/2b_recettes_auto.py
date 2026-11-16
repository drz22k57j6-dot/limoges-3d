"""Recettes automatiques pour tous les monuments (noms de matériaux Open Landmarks) puis génération des textures.
Teintes : couleur vue du ciel mesurée sur la BD ORTHO IGN (1_couleurs_ortho.py) quand elle existe, sinon couleur du modèle.
Usage : python3 2b_recettes_auto.py <dossier_mtex> <glb_originaux> <index.json> nom1 nom2 ..."""
import json, os, sys, zlib, struct, numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
OUT, ORIG, IDX = sys.argv[1], sys.argv[2], sys.argv[3]; NOMS = sys.argv[4:]
src = open(f'{HERE}/2_textures.py').read(); src = src[:src.index('O = ORTHO')]
ns = {'__file__': f'{HERE}/2_textures.py'}; exec(src, ns)          # fonctions de 2_textures.py (photo, gold, verdigris, zinc, glass…)
ORTHO = json.load(open(f'{OUT}/ortho_couleurs.json')); idx = {m['fichier']: m for m in json.load(open(IDX))['modeles']}
lum = ns['lum']
def srgb(c): c = np.clip(np.asarray(c[:3], float), 0, 1); return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055) * 255
def at_L(c, L): c = np.asarray(c, float); return np.clip(c / max(lum(c), 1) * L, 0, 255)
def facteurs(nom):
    b = open(f'{ORIG}/{nom}.glb', 'rb').read(); j = json.loads(b[20:20 + struct.unpack_from('<I', b, 12)[0]])
    return {m['name']: m.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1, 1, 1, 1]) for m in j['materials']}
def paint(tint, rough=0.45, metal=0.2):
    W = ns['W']; n = ns['noise'](10, 9); c = np.array(tint, float)[None, None] * (0.94 + 0.12 * n[..., None])
    return Image.fromarray(c.clip(0, 255).astype(np.uint8)), ns['flat_normal'](n, 0.5), ns['orm'](1, rough + 0.1 * n, metal)
def iron_t(tint):
    W = ns['W']; n = ns['noise'](8, 6); c = np.array(tint, float)[None, None] * (0.85 + 0.3 * n[..., None])
    return Image.fromarray(c.clip(0, 255).astype(np.uint8)), ns['flat_normal'](n, 1.0), ns['orm'](1, 0.5, 0.75)

# bâtiments modernes ou non en pierre : la façade n'est pas en pierre de taille
OVR = {
 ('tour-montparnasse', 'stone'): ('glass', None, (42, 38, 36), 2.0),          # mur-rideau sombre
 ('tour-super-italie', 'stone'): ('glass', None, (48, 54, 60), 2.0),
 ('tour-mirabeau', 'stone'): lambda p: ('paint', None, at_L(p, 150), 2.0),     # béton / panneaux
 ('hyatt-regency-paris-etoile', 'stone'): lambda p: ('paint', None, at_L(p, 155), 2.0),
 ('cite-des-sciences', 'stone'): lambda p: ('paint', None, at_L(p, 165), 2.0),
 ('maison-de-la-radio', 'stone'): lambda p: ('paint', None, at_L(p, 175), 2.0),   # aluminium
 ('la-canopee-des-halles', 'stone'): lambda p: ('paint', None, at_L(p, 160), 2.0),
 ('grande-halle-de-la-villette', 'stone'): lambda p: ('paint', None, at_L(p, 150), 2.0),
 ('obelisque-de-louxor', 'stone'): ('paint', None, (168, 140, 128), 2.0),     # granit rose d'Assouan
 ('colonne-de-juillet', 'stone'): ('verdigris', None, (72, 98, 84), 3.0),     # colonne en bronze
 ('colonne-de-juillet', 'metal'): ('gold', None, None, 1.5),                  # Génie de la Liberté doré
 ('obelisque-de-louxor', 'metal'): ('gold', None, None, 1.5),                 # pyramidion doré (1998)
}
recettes = json.load(open(f'{OUT}/recettes.json')) if os.path.exists(f'{OUT}/recettes.json') else {}
for nom in NOMS:
    m = idx[f'ol/{nom}.glb']; big = max(m.get('longueur_m', 0), m.get('largeur_m', 0)) >= 80
    ns['W'] = 1024 if big else 512
    O = ORTHO.get(nom, {}); F = facteurs(nom); h = zlib.crc32(nom.encode())
    oc = lambda k: (O.get(k) or {}).get('rgb')
    pierre = np.asarray(oc('stone') or srgb(F.get('stone', [0.86, 0.78, 0.65])), float)
    # l'orthophoto peut verdir la pierre (reflets du toit, végétation) : une pierre calcaire n'est jamais verte
    if pierre[1] > pierre[0] - 4: pierre = np.array([pierre[1] + 6, pierre[1], min(pierre[2], pierre[1] - 6)])
    rec = {}
    for mat, f in F.items():
        fs = srgb(f); o = oc(mat)
        if mat == 'stone': r = ('photo', ['white_sandstone_blocks_02', 'white_sandstone_bricks_03'][h % 2], at_L(pierre, 172), 10.0)
        elif mat in ('trim', 'entrance'): r = ('photo', 'white_plaster_02', at_L(pierre if mat == 'trim' else fs, 178), 4.0)
        elif mat in ('roof', 'copper', 'patina'):
            c = np.asarray(o if o else fs, float)
            if c[1] - c[0] > 6 and c[1] >= c[2] - 4: r = ('verdigris', None, at_L(c * 0.75 + np.array([110, 170, 140]) * 0.25 * lum(c) / 150, 145), 3.0)
            elif c[0] - c[2] > 25: r = ('photo', 'roof_slates_02', at_L(c, 120), 6.0)
            elif mat == 'patina' and lum(c) > 150: r = ('photo', 'white_plaster_02', at_L(c, 200), 4.0)    # mesuré clair : pierre
            elif lum(c) >= 125: r = ('zinc', None, at_L(c, 140), 4.0)
            else: r = ('photo', 'roof_slates_03', at_L(c, 105), 6.0)
        elif mat == 'metal': r = ('iron_t', None, at_L(fs, max(40, min(90, lum(fs)))), 2.0)
        elif mat == 'terracotta': r = ('photo', 'white_plaster_02', at_L(fs, 120), 4.0)
        elif mat == 'invalides-gold': r = ('gold', None, None, 1.5)
        elif mat == 'window': r = ('glass', None, (26, 35, 47), 2.0)
        elif mat == 'glass': r = ('glass', None, tuple(np.clip(fs * 0.55, 0, 255)), 2.0)
        elif mat.startswith('pompidou') or mat.startswith('eiffel'): r = ('paint', None, fs, 2.0)
        else: r = ('photo', 'white_plaster_02', at_L(fs, 170), 4.0)
        rec[mat] = r
    for (n2, m2), r2 in OVR.items():
        if n2 == nom and m2 in rec: rec[m2] = r2(pierre) if callable(r2) else r2
    os.makedirs(f'{OUT}/{nom}', exist_ok=True); recettes[nom] = {}
    for mat, (kind, s, tgt, scale) in rec.items():
        if kind == 'photo': c, n, o = ns['photo'](s, tgt, contrast=0.85, seed=zlib.crc32((nom + mat).encode()) % 997, streaks=0.2)
        elif kind == 'gold': c, n, o = ns['gold']()
        elif kind == 'verdigris': c, n, o = ns['verdigris'](tgt)
        elif kind == 'zinc': c, n, o = ns['zinc'](tgt, tile_m=scale)
        elif kind == 'iron_t': c, n, o = iron_t(tgt)
        elif kind == 'paint': c, n, o = paint(tgt)
        else: c, n, o = ns['glass'](tgt)
        for sfx, im in (('c', c), ('n', n), ('orm', o)): im.save(f'{OUT}/{nom}/{mat}_{sfx}.jpg', quality=86)
        recettes[nom][mat] = {'type': 'photo' if kind == 'photo' else kind, 'source': s, 'teinte': None if tgt is None else [round(float(v)) for v in tgt],
                              'echelle_m': scale, 'mesure_ortho': bool(oc(mat))}
    json.dump(recettes[nom], open(f'{OUT}/{nom}/recette.json', 'w'))
    print(nom, {k: v[0] for k, v in rec.items()}, flush=True)
json.dump(recettes, open(f'{OUT}/recettes.json', 'w'), indent=1, ensure_ascii=False)
