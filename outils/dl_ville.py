"""Télécharge toutes les données d'une ville (zone carrée de 6 km centrée sur X0, Y0 en Lambert-93) pour le pipeline Limoges 3D.
Usage : python3 -I dl_ville.py <X0> <Y0> <dossier>"""
import sys, os, json, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
X0, Y0, OUT = float(sys.argv[1]), float(sys.argv[2]), sys.argv[3]
R = 3000.0; XMIN, YMIN = X0 - R, Y0 - R
os.makedirs(OUT, exist_ok=True)
def get(url, path, tries=5):
    if os.path.exists(path) and os.path.getsize(path) > 1000: return
    for a in range(tries):
        try:
            d = urllib.request.urlopen(url, timeout=300).read()
            if len(d) < 1000: raise Exception('short ' + d[:200].decode(errors='ignore'))
            open(path, 'wb').write(d); return
        except Exception as e: print('retry', path, e, flush=True); time.sleep(4 + 4 * a)
    raise SystemExit('failed ' + path)
def wms_box(layer, fmt, x0, y0, size, px):
    b = f'{x0},{y0},{x0 + size},{y0 + size}'
    return 'https://data.geopf.fr/wms-r?' + urllib.parse.urlencode(dict(
        SERVICE='WMS', VERSION='1.3.0', REQUEST='GetMap', LAYERS=layer,
        CRS='EPSG:2154', BBOX=b, WIDTH=px, HEIGHT=px, FORMAT=fmt, STYLES=''))

def wms(layer, fmt, i, j, px):
    return wms_box(layer, fmt, XMIN + i * 2000, YMIN + j * 2000, 2000, px)

jobs = []
for i in range(3):
    for j in range(3):
        for k in ('MNT', 'MNH'):
            jobs.append((wms(f'IGNF_LIDAR-HD_{k}_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93', 'image/geotiff', i, j, 1000), f'{OUT}/{k.lower()}_{i}_{j}.tif'))
        jobs.append((wms('HR.ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg', i, j, 4096), f'{OUT}/ortho_{i}_{j}.jpg'))

# MNT et MNH LiDAR HD : dalles 1 km à 2 000 px, soit 0,5 m/pixel.
# Le MNT HD sert au terrain runtime ; le MNH HD sert aux toitures.
for i in range(6):
    for j in range(6):
        x0, y0 = XMIN + i * 1000, YMIN + j * 1000
        jobs.append((wms_box('IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93',
                             'image/geotiff', x0, y0, 1000, 2000),
                     f'{OUT}/mnt_hd_{i}_{j}.tif'))
        jobs.append((wms_box('IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93',
                             'image/geotiff', x0, y0, 1000, 2000),
                     f'{OUT}/mnh_hd_{i}_{j}.tif'))
def wfs(layer, props, out, sortby='cleabs'):
    if os.path.exists(out): return
    feats = []; start = 0
    while True:
        q = dict(SERVICE='WFS', VERSION='2.0.0', REQUEST='GetFeature', TYPENAMES=layer, COUNT='5000', STARTINDEX=str(start), OUTPUTFORMAT='application/json',
                 SRSNAME='EPSG:2154', BBOX=f'{XMIN},{YMIN},{X0 + R},{Y0 + R},EPSG:2154', SORTBY=sortby)
        if props: q['PROPERTYNAME'] = props
        url = 'https://data.geopf.fr/wfs/ows?' + urllib.parse.urlencode(q)
        for a in range(6):
            try: d = json.load(urllib.request.urlopen(url, timeout=300)); break
            except Exception as e: print('retry', layer, start, e, flush=True); time.sleep(5 + 5 * a)
        f = d['features']; feats += f; print(layer, start, len(f), flush=True)
        if len(f) < 5000: break
        start += 5000
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(out, 'w'))
W = [('BDTOPO_V3:batiment', 'cleabs,nature,usage_1,usage_2,nombre_de_logements,nombre_d_etages,hauteur,altitude_minimale_sol,altitude_maximale_toit,geometrie', 'bat.json', 'cleabs'),
     ('BDTOPO_V3:troncon_de_route', 'cleabs,nature,nom_collaboratif_gauche,importance,position_par_rapport_au_sol,nombre_de_voies,largeur_de_chaussee,sens_de_circulation,urbain,vitesse_moyenne_vl,geometrie', 'routes.json', 'cleabs'),
     ('BDTOPO_V3:surface_hydrographique', 'cleabs,nature,geometrie', 'eau.json', 'cleabs'),
     ('BDTOPO_V3:troncon_de_voie_ferree', 'cleabs,nature,geometrie', 'rail.json', 'cleabs')]
os.makedirs(OUT + '/identite', exist_ok=True)
W2 = [('BAN-PLUS:adresse', None, 'identite/ban_adresse.json', 'id'), ('BAN-PLUS:lien_adresse_bati', None, 'identite/ban_lien_bati.json', 'id_adr'),
      ('BDTOPO_V3:zone_d_activite_ou_d_interet', None, 'identite/zai.json', 'cleabs')]
with ThreadPoolExecutor(6) as ex:
    fs = [ex.submit(get, u, p) for u, p in jobs] + [ex.submit(wfs, l, pr, f'{OUT}/{o}', s) for l, pr, o, s in W + W2]
    for f in fs: f.result()
print('ok', OUT)
