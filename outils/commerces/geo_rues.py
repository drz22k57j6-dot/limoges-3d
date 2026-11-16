# (GitHub Actions) Adresses BAN + parcelles et bâtiments du cadastre autour des rues modèles -> outils/commerces/rues/<k>.json
import csv, gzip, json, io, urllib.request, os
RUES = {'7e': ('75107', 'Rue Cler'), '16e': ('75116', 'Avenue Victor Hugo'), '19e': ('75119', 'Rue de Meaux')}
def get(u):
    print('GET', u, flush=True)
    return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'limoges-3d'}), timeout=300).read()
ban = list(csv.DictReader(io.StringIO(gzip.decompress(get('https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-75.csv.gz')).decode()), delimiter=';'))
print(len(ban), 'adresses', list(ban[0].keys()))
os.makedirs('rues', exist_ok=True)
for k, (insee, voie) in RUES.items():
    ad = [a for a in ban if a['nom_voie'].lower().replace('-', ' ') == voie.lower()]
    lon = [float(a['lon']) for a in ad]; lat = [float(a['lat']) for a in ad]
    bb = (min(lon) - .0008, min(lat) - .0006, max(lon) + .0008, max(lat) + .0006)
    def keep(f):
        c = json.dumps(f['geometry']['coordinates']); xs = [float(v) for v in c.replace('[', ' ').replace(']', ' ').replace(',', ' ').split()]
        X, Y = xs[0::2], xs[1::2]
        return max(X) > bb[0] and min(X) < bb[2] and max(Y) > bb[1] and min(Y) < bb[3]
    out = {'voie': voie, 'adresses': [{'num': a['numero'], 'rep': a['rep'], 'lon': float(a['lon']), 'lat': float(a['lat']), 'parcelle': a.get('cad_parcelles', '')} for a in ad]}
    for couche in ('parcelles', 'batiments'):
        g = json.loads(gzip.decompress(get(f'https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/75/{insee}/cadastre-{insee}-{couche}.json.gz')))
        out[couche] = [{'id': f['properties'].get('id', ''), 'p': f['properties'], 'g': f['geometry']} for f in g['features'] if keep(f)]
        print(k, couche, len(out[couche]))
    json.dump(out, gzip.open(f'rues/{k}.json.gz', 'wt'), separators=(',', ':'))
