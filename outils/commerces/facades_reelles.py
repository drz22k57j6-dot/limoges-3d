# Rues test « réelles » : largeur de chaque immeuble = front de sa parcelle cadastrale sur la rue (cadastre Etalab),
# numéros BAN, et chaque commerce BDCOM 2023 placé à sa vraie position le long de la façade.
# Sortie : moteur_facades/data/commerces_rues_test.json  { k: { rue, L, cotes: [[{x0, w, nums, shops:[{t, nom, u}]}], …] } }
import json, gzip, os, sys
from pyproj import Transformer
from shapely.geometry import LineString, Point, shape
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rues_test import typ   # même classification que la version précédente
D = os.path.dirname(os.path.abspath(__file__))
L93 = Transformer.from_crs(4326, 2154, always_xy=True)
bd = json.load(gzip.open(f'{D}/bdcom_BDCOM_2023.json.gz'))
RUES = {'7e': ('RUE', 'CLER', 'Rue Cler'), '16e': ('AV', 'VICTOR HUGO', 'Avenue Victor-Hugo'), '19e': ('RUE', 'MEAUX', 'Rue de Meaux')}
LONG = 150
out = {}
for k, (tv, lv, nom) in RUES.items():
    g = json.load(gzip.open(f'{D}/rues/{k}.json.gz'))
    P = {p['id']: shape(p['g']) for p in g['parcelles']}
    ad = []
    for a in g['adresses']:
        x, y = L93.transform(a['lon'], a['lat']); ad.append({**a, 'x': x, 'y': y, 'n_': int(a['num'])})
    # axe de la rue : moyenne glissante des adresses ordonnées le long de l'axe principal
    import numpy as np
    A = np.array([[a['x'], a['y']] for a in ad]); m = A.mean(0); u, s_, vt = np.linalg.svd(A - m); d0 = vt[0]
    t = (A - m) @ d0; order = np.argsort(t); pts = []
    for c in np.arange(t.min(), t.max() + 1, 25):
        sel = np.abs(t - c) < 30
        if sel.sum() >= 2: pts.append(A[sel].mean(0))
    axe = LineString(pts)
    def sn(x, y):
        s = axe.project(Point(x, y)); p0 = axe.interpolate(max(0, s - 1)); p1 = axe.interpolate(min(axe.length, s + 1))
        tx, ty = p1.x - p0.x, p1.y - p0.y; nl = (tx * tx + ty * ty) ** .5
        return s, ((x - p0.x) * ty - (y - p0.y) * tx) / nl   # n > 0 : à droite de l'axe
    # commerces BDCOM de la rue
    shops = []
    for r in bd:
        if r['lib_voie'] == lv and r['typ_voie'] == tv and r['sit'] in ('R', 'A') and r['num']:
            s, n = sn(r['xbis'], r['ybis']); nm = (r['ens'] or '').strip()
            shops.append({'num': r['num'], 's': s, 'n': n, 't': typ(r['codact']), 'nom': '' if nm in ('SANS ENSEIGNE', 'NC') else nm})
    cotes = []
    for par in (0, 1):
        sid = [a for a in ad if a['n_'] % 2 == par]
        sgn = np.sign(np.median([sn(a['x'], a['y'])[1] for a in sid]))
        bat = {}
        for a in sid:
            pid = a['parcelle'].split('|')[0]
            if pid not in P: continue
            poly = P[pid]; geo = poly.geoms[0] if poly.geom_type == 'MultiPolygon' else poly
            V = [sn(*L93.transform(x, y)) for x, y in geo.exterior.coords]
            nmin = min(abs(n) for s, n in V)
            front = [s for s, n in V if n * sgn > 0 and abs(n) < nmin + 3]
            if len(front) < 2: continue
            b = bat.setdefault(pid, {'s0': min(front), 's1': max(front), 'nums': []})
            b['nums'].append(a['num'] + (a['rep'] or ''))
        L = sorted(bat.values(), key=lambda b: b['s0'])
        # recollage : pas de chevauchement, petits trous comblés (mitoyens)
        for i in range(1, len(L)):
            if L[i]['s0'] < L[i - 1]['s1']: m_ = (L[i]['s0'] + L[i - 1]['s1']) / 2; L[i]['s0'] = L[i - 1]['s1'] = m_
            elif L[i]['s0'] - L[i - 1]['s1'] < 1.5: m_ = (L[i]['s0'] + L[i - 1]['s1']) / 2; L[i]['s0'] = L[i - 1]['s1'] = m_
        M_ = []
        for b in L:   # un front de moins de 4 m (angle, passage) est fusionné avec son voisin
            if M_ and (b['s1'] - b['s0'] < 4 or M_[-1]['s1'] - M_[-1]['s0'] < 4) and b['s0'] - M_[-1]['s1'] < 1: M_[-1]['s1'] = b['s1']; M_[-1]['nums'] += b['nums']
            else: M_.append(b)
        L = [b for b in M_ if b['s1'] - b['s0'] > 3]
        for b in L:
            b['nums'] = sorted(set(b['nums']), key=lambda v: (int(''.join(c for c in v if c.isdigit()) or 0), v))
            b['shops'] = sorted([dict(t=x['t'], nom=x['nom'], s=x['s']) for x in shops if x['num'] % 2 == par and b['s0'] - 1 <= x['s'] <= b['s1'] + 1 and str(x['num']) in [''.join(c for c in v if c.isdigit()) for v in b['nums']]], key=lambda x: x['s'])
        cotes.append(L)
    # fenêtre de LONG mètres la plus commerçante (deux côtés)
    tot = lambda s0: sum(1 for L in cotes for b in L for x in b['shops'] if s0 <= x['s'] <= s0 + LONG)
    S0 = max(np.arange(0, axe.length - LONG, 5), key=tot)
    # sens : le côté 0 de la rue test est celui des numéros pairs ; on garde l'ordre des s croissants
    res = []
    for L in cotes:
        side = []
        for b in L:
            if b['s1'] < S0 or b['s0'] > S0 + LONG: continue
            a0, a1 = max(b['s0'], S0), min(b['s1'], S0 + LONG)
            side.append({'x0': round(float(a0 - S0), 2), 'w': round(float(a1 - a0), 2), 'nums': b['nums'], 'shops': [{'t': x['t'], 'nom': x['nom'], 'u': round(min(1, max(0, (x['s'] - a0) / max(.1, a1 - a0))), 3)} for x in b['shops']]})
        res.append(side)
    out[k] = {'rue': nom, 'L': LONG, 'cotes': res, 'source': 'APUR BDCOM 2023, cadastre Etalab, BAN (ODbL / Licence Ouverte)'}
    print(k, nom, 'S0=%.0f' % S0, [len(c) for c in res], [round(sum(b['w'] for b in c)) for c in res], 'm', sum(len(b['shops']) for c in res for b in c), 'commerces')
    for c in res: print('   ', [(b['nums'][0], b['w'], len(b['shops'])) for b in c][:14])
json.dump(out, open(f'{D}/../../moteur_facades/data/commerces_rues_test.json', 'w'), ensure_ascii=False, separators=(',', ':'))
