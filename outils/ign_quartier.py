# Télécharge (WFS IGN) le contour d'un arrondissement, ses bâtiments et ses tronçons de route.
# Usage : python3 outils/ign_quartier.py <INSEE> <dossier>
import json, urllib.request, urllib.parse, time, sys, os
INSEE, D = sys.argv[1], sys.argv[2]; os.makedirs(D, exist_ok=True)
from shapely.geometry import shape
def wfs(layer, bbox, extra=None):
    feats, start = [], 0
    while True:
        q = dict(SERVICE='WFS', VERSION='2.0.0', REQUEST='GetFeature', TYPENAMES=layer, COUNT='5000', STARTINDEX=str(start), OUTPUTFORMAT='application/json', SRSNAME='EPSG:2154', BBOX=','.join(map(str, bbox)) + ',EPSG:2154', SORTBY='cleabs')
        u = 'https://data.geopf.fr/wfs/ows?' + urllib.parse.urlencode(q)
        for a in range(5):
            try: d = json.load(urllib.request.urlopen(u, timeout=180)); break
            except Exception as e: print('retry', e, flush=True); time.sleep(3)
        f = d['features']; feats += f; print(layer, start, len(f), flush=True)
        if len(f) < 5000: break
        start += 5000
    return feats
arr = [f for f in wfs('BDTOPO_V3:arrondissement_municipal', (640000, 6855000, 660000, 6870000)) if f['properties']['code_insee'] == INSEE][0]
g = shape(arr['geometry']); b = g.bounds; print(b)
json.dump(arr, open(f'{D}/arr.json', 'w'))
B = (b[0] - 60, b[1] - 60, b[2] + 60, b[3] + 60)
json.dump(wfs('BDTOPO_V3:batiment', B), open(f'{D}/bat.json', 'w'))
json.dump(wfs('BDTOPO_V3:troncon_de_route', B), open(f'{D}/routes.json', 'w'))
