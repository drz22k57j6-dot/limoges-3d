# Prépare data/metro/jeu.json pour le jeu à partir des vraies données (data/metro/*.json, *.geojson).
# Coordonnées locales en mètres (x = est, z = sud) autour de Châtelet. Règles quand l'info manque : voir REGLES ci-dessous.
import json, math, re, unicodedata
from collections import defaultdict

D = 'data/metro/'
R = json.load(open(D + 'reseau.json')); C = json.load(open(D + 'cheminements.json'))
G = json.load(open(D + 'gares.geojson')); T = json.load(open(D + 'traces.geojson'))
LAT0, LON0 = 48.8584, 2.3470
KX, KZ = math.cos(math.radians(LAT0)) * 111320.0, 110540.0
xy = lambda lat, lon: (round((lon - LON0) * KX, 2), round(-(lat - LAT0) * KZ, 2))
norm = lambda s: re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', s.lower()).encode('ascii', 'ignore').decode())

REGLES = {
  # profondeur du rail sous la rue selon l'époque d'ouverture de la ligne à cette station (métro de 1900 à « ciel ouvert » puis plus profond)
  'profondeur_par_epoque': [(1915, 7.0), (1940, 10.0), (1990, 13.0), (9999, 22.0)],
  # profondeurs publiées (articles) — remplacent la règle
  'profondeurs_connues': {'abbesses': (36.0, 'Paris ZigZag : quais à 36 m sous terre')},
  # deux lignes qui se croisent dans une même station : au moins 5 m d'écart vertical (la plus récente passe dessous)
  'ecart_min_correspondance': 5.0,
  # longueur des quais (m) : standard RATP 75 m ; lignes à rames de 6 voitures 90 m ; ligne 14 : 120 m
  'longueur_quai': {'1': 90, '4': 90, '14': 120, 'defaut': 75},
  # couloirs : 3,2 m ; 4,5 m dans les grandes stations (3 lignes ou plus) ; hauteur 2,6 m ; salle des billets à 4 m sous la rue
  'couloir_largeur': 3.2, 'couloir_largeur_hub': 4.5, 'salle_billets_profondeur': 4.0,
}

dates = {}  # (station normalisée, ligne) -> année
for f in G['features']:
    p = f['properties']; L = str(p.get('indice_lig') or '').upper().replace('BIS', 'B')
    y = int(str(p.get('date_mise') or '1950')[:4]); dates[(norm(p.get('nom_gares') or ''), L)] = y

def depth_for(name, line):
    k = norm(name)
    for key, (d, src) in REGLES['profondeurs_connues'].items():
        if k.startswith(key): return d, 'publiée', src
    y = dates.get((k, line))
    if y is None:
        for (n2, l2), yy in dates.items():
            if l2 == line and (n2.startswith(k[:8]) or k.startswith(n2[:8])): y = yy; break
    y = y or 1930
    for lim, d in REGLES['profondeur_par_epoque']:
        if y < lim: return d, 'règle (ouverture %d)' % y, ''
    return 13.0, 'règle', ''

# longueurs réelles accès -> quai (cheminements IDFM)
plen = defaultdict(list)
for p in C['cheminements']:
    try: plen[p['to_stop_id']].append(float(p['length']))
    except Exception: pass

stations, lines = {}, []
sid_of = {}
for sid, s in R['stations'].items():
    x, z = xy(s['lat'], s['lon'])
    st = {'id': sid, 'nom': s['nom'], 'x': x, 'z': z, 'lignes': sorted(set(s['lignes']), key=lambda l: (len(l), l)), 'halls': {}, 'sorties': []}
    byline = defaultdict(list)
    for q in s['quais']:
        for L in q.get('lignes', []): byline[L].append(q)
    for L, qs in byline.items():
        qx = sum(xy(q['lat'], q['lon'])[0] for q in qs) / len(qs); qz = sum(xy(q['lat'], q['lon'])[1] for q in qs) / len(qs)
        d, how, src = depth_for(s['nom'], L)
        acc = [l for q in qs for l in plen.get(q['id'], [])]
        st['halls'][L] = {'x': round(qx, 2), 'z': round(qz, 2), 'prof': d, 'source_prof': how + ((' — ' + src) if src else ''), 'longueur': REGLES['longueur_quai'].get(L, REGLES['longueur_quai']['defaut']),
                          'acces_m': round(sorted(acc)[len(acc) // 2], 1) if acc else None, 'annee': dates.get((norm(s['nom']), L))}
    for a in s['acces']:
        ax, az = xy(a['lat'], a['lon']); st['sorties'].append({'nom': a['nom'], 'x': ax, 'z': az})
    # correspondances : la plus récente passe dessous, avec au moins 5 m d'écart si les quais sont proches
    hs = sorted(st['halls'].items(), key=lambda kv: (kv[1]['annee'] or 1930, kv[1]['prof']))
    for i, (L, h) in enumerate(hs):
        for L2, h2 in hs[:i]:
            if math.hypot(h['x'] - h2['x'], h['z'] - h2['z']) < 120 and h['prof'] < h2['prof'] + REGLES['ecart_min_correspondance']:
                h['prof'] = h2['prof'] + REGLES['ecart_min_correspondance']; h['source_prof'] += ' + écart correspondance'
    stations[sid] = st

for L in R['lignes']:
    br = []
    for b in L['branches']:
        tt = [L['temps'].get(a + '>' + c) or L['temps'].get(c + '>' + a) for a, c in zip(b, b[1:])]
        br.append({'stations': b, 'temps': [t if t else 90 for t in tt]})
    lines.append({'nom': L['nom'], 'couleur': L['couleur'], 'texte': L['texte'], 'long': L['long'], 'branches': br})
lines.sort(key=lambda l: (len(l['nom']) > 2, int(re.sub(r'\D', '', l['nom']) or 0), l['nom']))

# tracés réels des tunnels (pour la courbure pendant le trajet)
traces = defaultdict(list)
for f in T['features']:
    p = f['properties']; L = str(p.get('indice_lig') or '').upper().replace('BIS', 'B'); g = f.get('geometry') or {}
    parts = [g['coordinates']] if g.get('type') == 'LineString' else g.get('coordinates', [])
    for part in parts: traces[L].append([xy(c[1], c[0]) for c in part])

json.dump({'origine': {'lat': LAT0, 'lon': LON0}, 'regles': REGLES, 'lignes': lines, 'stations': stations, 'traces': traces,
           'sources': ['GTFS Île-de-France Mobilités (lignes, ordre, quais, accès, temps, cheminements)', 'IDFM — Emplacement des gares (dates de mise en service)', 'IDFM — Tracés du réseau ferré', 'OpenStreetMap (bouches)', 'Articles de presse (profondeurs publiées)']},
          open(D + 'jeu.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('stations', len(stations), 'lignes', len(lines))
