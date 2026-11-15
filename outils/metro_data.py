# Télécharge les vraies données du métro parisien (lancé par GitHub Actions, qui a accès à Internet) :
#  - GTFS d'Île-de-France Mobilités : lignes, ordre des stations, quais, accès, correspondances, cheminements (pathways)
#  - Tracés du réseau ferré IDFM : géométrie réelle des tunnels
#  - Gares et stations par ligne IDFM
#  - OpenStreetMap : bouches de métro, quais avec niveau / altitude
# et écrit des fichiers compacts dans data/metro/. Chaque source est facultative : une erreur est notée dans sources.json.
import csv, io, json, os, sys, time, zipfile, urllib.request, urllib.parse

OUT = 'data/metro'; os.makedirs(OUT, exist_ok=True)
LOG = {'date': time.strftime('%Y-%m-%d %H:%M'), 'sources': {}}
API = 'https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/'
UA = {'User-Agent': 'limoges-3d metro (github actions)'}

def get(url, timeout=300):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r: return r.read()

def jget(url): return json.loads(get(url))

def note(k, **v): LOG['sources'][k] = v; print(k, v, flush=True)

# ---------------------------------------------------------------- GTFS IDFM
def gtfs():
    rec = jget(API + 'offre-horaires-tc-gtfs-idfm/records?limit=20')
    url = None
    for r in rec.get('results', []):
        for k, v in r.items():
            if isinstance(v, str) and v.startswith('http') and ('zip' in v.lower() or 'gtfs' in v.lower()): url = url or v
            if isinstance(v, dict) and str(v.get('url', '')).startswith('http'): url = url or v['url']
    if not url: raise RuntimeError('lien GTFS introuvable: ' + json.dumps(rec)[:500])
    print('GTFS', url, flush=True)
    z = zipfile.ZipFile(io.BytesIO(get(url, 900)))
    def rows(name):
        if name not in z.namelist(): return []
        return list(csv.DictReader(io.TextIOWrapper(z.open(name), 'utf-8-sig')))
    routes = [r for r in rows('routes.txt') if r.get('route_type') == '1']
    rid = {r['route_id']: r for r in routes}
    trips = [t for t in rows('trips.txt') if t['route_id'] in rid]
    tid = {t['trip_id']: t for t in trips}
    seqs = {}
    with z.open('stop_times.txt') as f:
        for st in csv.DictReader(io.TextIOWrapper(f, 'utf-8-sig')):
            if st['trip_id'] in tid: seqs.setdefault(st['trip_id'], []).append((int(st['stop_sequence']), st['stop_id'], st.get('arrival_time', '')))
    stops = {s['stop_id']: s for s in rows('stops.txt')}
    parent = lambda sid: stops.get(sid, {}).get('parent_station') or sid
    lines = {}
    for t_id, s in seqs.items():
        s.sort(); t = tid[t_id]; r = rid[t['route_id']]
        L = lines.setdefault(r['route_id'], {'id': r['route_id'], 'nom': r.get('route_short_name', ''), 'long': r.get('route_long_name', ''), 'couleur': '#' + (r.get('route_color') or '888888'), 'texte': '#' + (r.get('route_text_color') or 'FFFFFF'), 'branches': {}, 'temps': {}})
        key = tuple(parent(x[1]) for x in s)
        L['branches'][key] = L['branches'].get(key, 0) + 1
        # temps de parcours entre stations (secondes), première course de chaque branche
        def sec(h):
            try: a, b, c = map(int, h.split(':')); return a * 3600 + b * 60 + c
            except Exception: return None
        for (q1, a, ta), (q2, b, tb) in zip(s, s[1:]):
            x, y = sec(ta), sec(tb)
            if x is not None and y is not None and 0 < y - x < 1200:
                k2 = parent(a) + '>' + parent(b); L['temps'].setdefault(k2, y - x)
    for L in lines.values():
        br = sorted(L['branches'].items(), key=lambda kv: -kv[1])
        keep = []
        for seq, n in br:  # branches distinctes (un sens suffit, l'autre est l'inverse)
            if any(set(seq) <= set(k) for k in keep): continue
            keep.append(list(seq))
        L['branches'] = keep
    used = set(x for L in lines.values() for b in L['branches'] for x in b)
    st_out = {}
    for sid in used:
        s = stops.get(sid, {})
        st_out[sid] = {'nom': s.get('stop_name', sid), 'lat': float(s.get('stop_lat') or 0), 'lon': float(s.get('stop_lon') or 0), 'lignes': [], 'quais': [], 'acces': []}
    for L in lines.values():
        for b in L['branches']:
            for x in b:
                if L['nom'] not in st_out[x]['lignes']: st_out[x]['lignes'].append(L['nom'])
    children = {}
    for s in stops.values():
        p = s.get('parent_station')
        if p in st_out:
            e = {'id': s['stop_id'], 'nom': s.get('stop_name', ''), 'lat': float(s.get('stop_lat') or 0), 'lon': float(s.get('stop_lon') or 0), 'type': s.get('location_type', '0'), 'niveau': s.get('level_id', '')}
            (st_out[p]['acces'] if s.get('location_type') == '2' else st_out[p]['quais']).append(e); children[s['stop_id']] = p
    # correspondances (temps à pied) et cheminements à l'intérieur des stations
    tr = [{'de': r['from_stop_id'], 'vers': r['to_stop_id'], 's': r.get('min_transfer_time', '')} for r in rows('transfers.txt') if (children.get(r['from_stop_id']) or r['from_stop_id']) in st_out and (children.get(r['to_stop_id']) or r['to_stop_id']) in st_out]
    pw = [{k: r.get(k, '') for k in ('pathway_id', 'from_stop_id', 'to_stop_id', 'pathway_mode', 'is_bidirectional', 'length', 'traversal_time', 'stair_count', 'max_slope', 'min_width', 'signposted_as')} for r in rows('pathways.txt') if children.get(r['from_stop_id']) or children.get(r['to_stop_id'])]
    lv = rows('levels.txt')
    json.dump({'lignes': list(lines.values()), 'stations': st_out}, open(OUT + '/reseau.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'correspondances': tr, 'cheminements': pw, 'niveaux': lv}, open(OUT + '/cheminements.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    note('gtfs_idfm', ok=True, url=url, lignes=len(lines), stations=len(st_out), cheminements=len(pw), correspondances=len(tr), fichiers=z.namelist())

# ---------------------------------------------------------------- jeux IDFM (géographie)
def find_dataset(words):
    q = urllib.parse.quote(' '.join(words))
    d = jget(API.rstrip('/') + '?limit=20&where=' + urllib.parse.quote('search("' + ' '.join(words) + '")'))
    return [x['dataset_id'] for x in d.get('results', [])]

def geo(ids, name, filt):
    for did in ids:
        try:
            g = jget(API + did + '/exports/geojson')
            feats = [f for f in g.get('features', []) if filt(f.get('properties', {}))]
            if not feats: continue
            for f in feats:  # coordonnées arrondies (~10 cm)
                def rnd(c): return [round(c[0], 6), round(c[1], 6)] if isinstance(c[0], (int, float)) else [rnd(x) for x in c]
                if f.get('geometry'): f['geometry']['coordinates'] = rnd(f['geometry']['coordinates'])
            json.dump({'type': 'FeatureCollection', 'features': feats}, open(OUT + '/' + name, 'w'), ensure_ascii=False, separators=(',', ':'))
            note(name, ok=True, dataset=did, objets=len(feats), champs=sorted(feats[0]['properties'].keys())); return
        except Exception as e: print('échec', did, e, flush=True)
    note(name, ok=False, essais=ids)

is_metro = lambda p: any('METRO' in str(v).upper() or 'MÉTRO' in str(v).upper() for v in p.values())

# ---------------------------------------------------------------- OpenStreetMap
def osm():
    q = '[out:json][timeout:180];area["name"="Paris"]["admin_level"="8"]->.a;(node["railway"="subway_entrance"](48.80,2.20,48.92,2.48);way["railway"="platform"]["subway"="yes"](48.80,2.20,48.92,2.48);node["railway"="station"]["station"="subway"](48.80,2.20,48.92,2.48););out tags center;'
    d = jget('https://overpass-api.de/api/interpreter?data=' + urllib.parse.quote(q))
    out = []
    for e in d.get('elements', []):
        c = e.get('center') or {'lat': e.get('lat'), 'lon': e.get('lon')}
        out.append({'t': e['type'][0], 'id': e['id'], 'lat': c['lat'], 'lon': c['lon'], 'tags': {k: v for k, v in e.get('tags', {}).items() if k in ('name', 'ref', 'railway', 'level', 'layer', 'ele', 'wheelchair', 'escalator', 'colour', 'line', 'route_ref', 'local_ref', 'subway', 'station', 'entrance', 'depth')}})
    json.dump(out, open(OUT + '/osm.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    note('osm', ok=True, objets=len(out))

for name, fn in [('gtfs_idfm', gtfs), ('osm', osm)]:
    try: fn()
    except Exception as e: note(name, ok=False, erreur=str(e)[:400])
try: geo(['traces-du-reseau-ferre-idf'] + find_dataset(['traces', 'reseau', 'ferre']), 'traces.geojson', is_metro)
except Exception as e: note('traces.geojson', ok=False, erreur=str(e)[:300])
try: geo(['emplacement-des-gares-idf'] + find_dataset(['emplacement', 'gares']), 'gares.geojson', is_metro)
except Exception as e: note('gares.geojson', ok=False, erreur=str(e)[:300])
json.dump(LOG, open(OUT + '/sources.json', 'w'), ensure_ascii=False, indent=1)
print('fini')
