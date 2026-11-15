"""Identité de chaque bâtiment : adresses officielles, établissements (commerces, écoles, services…), zone d'intérêt.
Sources : IGN BD TOPO (bâtiments, zones d'activité), IGN BAN PLUS (adresses + lien adresse ↔ bâtiment), Overture Maps places (OSM, Meta, Microsoft, BrightQuery…).
Usage : python3 -I identite.py <dl> <sortie.json>"""
import sys, json, re, unicodedata, collections, numpy as np, pyarrow.parquet as pq, shapely
from shapely.geometry import shape, Point
from shapely import STRtree
from pyproj import Transformer
D, OUT = sys.argv[1:3]
tr = Transformer.from_crs(4326, 2154, always_xy=True)
def norm(s): return re.sub(r'[^a-z0-9 ]', ' ', unicodedata.normalize('NFKD', (s or '').lower()).encode('ascii', 'ignore').decode()).split()
VOIE = {'r': 'rue', 'av': 'avenue', 'bd': 'boulevard', 'pl': 'place', 'all': 'allee', 'imp': 'impasse', 'rte': 'route', 'ch': 'chemin', 'sq': 'square'}
def addr_key(num, voie): return (str(num), ' '.join(VOIE.get(w, w) for w in norm(voie)))
# ---- buildings
B = {}; geoms = []; ids = []
for f in json.load(open(f'{D}/bat.json'))['features']:
    p = f['properties']; g = shape(f['geometry'])
    B[p['cleabs']] = {'usage': p.get('usage_1'), 'usage2': p.get('usage_2'), 'hauteur_m': p.get('hauteur'), 'etages': p.get('nombre_d_etages'),
                      'logements': p.get('nombre_de_logements'), 'surface_m2': round(g.area, 1), 'adresses': [], 'lieux': []}
    geoms.append(g); ids.append(p['cleabs'])
tree = STRtree(geoms)
# ---- official addresses and their link to buildings (IGN BAN PLUS)
ADR = {}
for f in json.load(open(f'{D}/identite/ban_adresse.json'))['features']:
    p = f['properties']; x, y = f['geometry']['coordinates'][:2]
    lab = f"{p['numero']}{(' ' + p['rep']) if p.get('rep') else ''} {p['nom_voie']}, {p.get('nom_com') or ''}".strip(', ')
    ADR[p['id_adr']] = {'label': lab, 'id_ban': p['id_adr'], 'x': x, 'y': y, 'key': addr_key(f"{p['numero']}{p.get('rep') or ''}", p['nom_voie'])}
linked = collections.defaultdict(set)
for f in json.load(open(f'{D}/identite/ban_lien_bati.json'))['features']:
    p = f['properties']
    if p.get('id_bat') in B and p.get('id_adr') in ADR: linked[p['id_bat']].add(p['id_adr'])
for b, s in linked.items():
    for a in sorted(s, key=lambda a: ADR[a]['label']):
        B[b]['adresses'].append({'label': ADR[a]['label'], 'id_ban': a, 'source': 'IGN BAN PLUS (lien adresse-bâtiment)'})
# address points inside a building that has no link
for a in ADR.values():
    for j in tree.query(Point(a['x'], a['y']), predicate='intersects'):
        b = ids[j]
        if not any(x['id_ban'] == a['id_ban'] for x in B[b]['adresses']):
            B[b]['adresses'].append({'label': a['label'], 'id_ban': a['id_ban'], 'source': 'IGN BAN PLUS (point dans le bâtiment)'})
# official addresses linked to no building: nearest building within 8 m (BAN points often sit just outside the wall)
used = {a['id_ban'] for v in B.values() for a in v['adresses']}
for a in ADR.values():
    if a['id_ban'] in used: continue
    pt = Point(a['x'], a['y']); js = tree.query(pt.buffer(8), predicate='intersects')
    if len(js):
        j = min(js, key=lambda j: geoms[j].distance(pt))
        B[ids[j]]['adresses'].append({'label': a['label'], 'id_ban': a['id_ban'], 'source': 'IGN BAN PLUS (bâtiment le plus proche ≤ 8 m, à vérifier)'})
addr_index = collections.defaultdict(list)
for b, v in B.items():
    for a in v['adresses']: addr_index[ADR[a['id_ban']]['key']].append(b)
# ---- activity / interest zones (schools, hospitals, sports…) with their names
ZAI = []
for f in json.load(open(f'{D}/identite/zai.json'))['features']:
    p = f['properties']
    if f['geometry'] is None: continue
    ZAI.append((shape(f['geometry']), {'nom': p.get('toponyme'), 'nature': p.get('nature_detaillee') or p.get('nature'), 'categorie': p.get('categorie'), 'source': 'IGN BD TOPO zone d\'activité ou d\'intérêt'}))
for zg, z in ZAI:
    for j in tree.query(zg, predicate='intersects'):
        if geoms[j].representative_point().within(zg): B[ids[j]].setdefault('zones', []).append(z)
# ---- establishments (Overture Maps places)
CAT = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {}
t = pq.read_table(f'{D}/identite/overture_places.parquet').to_pylist()
stats = collections.Counter()
for r in t:
    if r.get('operating_status') == 'permanently_closed': stats['fermé'] += 1; continue
    g = shapely.from_wkb(r['geometry']); x, y = tr.transform(g.x, g.y); pt = Point(x, y)
    nm = (r.get('names') or {}).get('primary')
    if not nm: continue
    srcs = sorted({s.get('dataset') for s in (r.get('sources') or []) if s.get('dataset')})
    lic = sorted({s.get('license') for s in (r.get('sources') or []) if s.get('license')})
    ad = (r.get('addresses') or [{}])[0] or {}
    cat = r.get('basic_category') or ((r.get('taxonomy') or {}).get('primary'))
    brand = ((r.get('brand') or {}).get('names') or {}).get('primary')
    web = (r.get('websites') or [None])[0]
    lieu = {'nom': nm, 'categorie': CAT.get(cat, (cat or 'inconnu').replace('_', ' ')), 'marque': brand,
            'adresse': ad.get('freeform'), 'site': web, 'statut': r.get('operating_status') or 'inconnu',
            'confiance': round(float(r.get('confidence') or 0), 2), 'sources': srcs, '_vitrine': bool(re.search(r'store|restaurant|eatery|bar$|pharmacy|bank|beauty|bakery|cafe|coffee|market|shop|gas_station|fueling|hotel|optic|butcher|florist|laundry|auto_dealer|post_office', cat or ''))}
    # 1. the point lies in a building; 2. its address matches an official address of a building nearby; 3. nearest building ≤ 12 m
    hit = [ids[j] for j in tree.query(pt, predicate='intersects')]
    how = 'point dans le bâtiment'
    if not hit and ad.get('freeform'):
        m = re.match(r'\s*(\d+\s*(?:bis|ter)?)\s*,?\s*(.+)', ad['freeform'], re.I)
        if m:
            cand = [b for b in addr_index.get(addr_key(m.group(1).replace(' ', ''), m.group(2)), []) if geoms[ids.index(b)].distance(pt) < 80]
            if cand: hit = cand[:1]; how = 'adresse identique à l\'adresse officielle du bâtiment'
    if not hit:
        js = tree.query(pt.buffer(12), predicate='intersects')
        if len(js): j = min(js, key=lambda j: geoms[j].distance(pt)); hit = [ids[j]]; how = 'bâtiment le plus proche (≤ 12 m) — à vérifier'
    if not hit: stats['sans bâtiment'] += 1; continue
    lieu['rattachement'] = how
    B[hit[0]]['lieux'].append(lieu); stats[how] += 1
# ---- summary per building (usage category: never invented)
for b, v in B.items():
    v['lieux'].sort(key=lambda l: -l['confiance'])
    if not v['adresses']: v['adresses_statut'] = 'aucune adresse officielle liée'
    n_ok = sum(1 for l in v['lieux'] if l['confiance'] >= 0.6)
    vit = sum(1 for l in v['lieux'] if l['confiance'] >= 0.7 and l['_vitrine'])
    for l in v['lieux']: l['vitrine'] = l.pop('_vitrine')
    u = v['usage'] or 'Indifférencié'
    v['fonction'] = ('mixte' if (u == 'Résidentiel' and vit) or v.get('usage2') else
                     'inconnu' if u in ('Indifférencié', None) and not v['lieux'] else
                     'à vérifier' if v['lieux'] and n_ok == 0 else u)
def clean(o):
    if isinstance(o, dict): return {k: clean(v) for k, v in o.items() if v not in (None, [], '')}
    if isinstance(o, list): return [clean(x) for x in o]
    return o
out = {k: clean(v) for k, v in B.items()}
meta = {'_meta': {'version': 1, 'sources': {
    'batiments': 'IGN BD TOPO V3 (Licence Ouverte 2.0)', 'adresses': 'IGN BAN PLUS adresses + lien adresse-bâtiment (Licence Ouverte 2.0)',
    'zones': 'IGN BD TOPO zones d\'activité ou d\'intérêt (Licence Ouverte 2.0)',
    'lieux': 'Overture Maps Foundation, places 2026-10-21 (CDLA-Permissive-2.0 ; données OSM sous ODbL © contributeurs OpenStreetMap)'},
    'regle': 'aucune donnée inventée ; « inconnu », « mixte » et « à vérifier » quand les sources ne suffisent pas'}}
# one file per 1 km cell (cell of the building centroid), so a phone only loads the neighbourhood it needs
import os
X0c, Y0c = float(os.environ.get('CITY_X0', 562924.0)), float(os.environ.get('CITY_Y0', 6528957.0))
os.makedirs(OUT, exist_ok=True); cells = collections.defaultdict(dict)
cent = {ids[j]: geoms[j].centroid for j in range(len(ids))}
for k, v in out.items():
    c = cent[k]; cells[(int((c.x - X0c + 3000) // 1000), int((c.y - Y0c + 3000) // 1000))][k] = v
for (i, j), d in cells.items(): json.dump(d, open(f'{OUT}/{i}_{j}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(meta['_meta'], open(f'{OUT}/meta.json', 'w'), ensure_ascii=False)
print('bâtiments', len(out), 'avec adresse', sum(1 for v in out.values() if 'adresses' in v), 'avec établissement', sum(1 for v in out.values() if 'lieux' in v))
print(dict(stats))
