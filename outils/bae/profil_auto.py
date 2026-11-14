"""Cahier des charges par bâtiment + profil d'apparence pour le moteur (bâtiments collectifs à toit plat).
Chaque valeur porte un statut : mesuré / observé / estimé / non observé.
Usage : python3 -I profil_auto.py <dl> <ids.json> <sources_photos.json> <adresses.json> <dossier_observations> <sortie_cahiers> <sortie_profils>"""
import sys, os, json, math, subprocess, numpy as np
from shapely.geometry import shape, Polygon
D, IDS, SRC, ADR, OBS, OUTC, OUTP = sys.argv[1:8]
os.makedirs(OUTC, exist_ok=True); os.makedirs(OUTP, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
ids = json.load(open(IDS)); SRCS = json.load(open(SRC)); ADRS = json.load(open(ADR))
FAC = json.load(open(f'{D}/facades.json'))
INFO = {b['id']: b for b in json.load(open(sys.argv[8] if len(sys.argv) > 8 else '/home/claude/limoges-3d/rapport/batiments_info.json'))}
FEAT = {f['properties']['cleabs']: f for f in json.load(open(f'{D}/bat.json'))['features']}
SKIP_DETAIL = {'BATIMENT0000000224596718'}   # already has its hand-checked profile
TYPO = {
 'collectif_haut': dict(baie=2.7, fen=(1.2, 1.35, 0.95), h_niv=2.7, texture='panneaux béton peints / enduit lisse', menuiseries='PVC blanc, volets roulants'),
 'collectif_bas': dict(baie=2.6, fen=(1.1, 1.3, 0.95), h_niv=2.8, texture='enduit gratté', menuiseries='PVC blanc'),
 'maison': dict(baie=3.0, fen=(1.0, 1.25, 0.95), h_niv=2.7, texture='enduit gratté (crépi)', menuiseries='PVC ou bois, volets battants ou roulants'),
 'commerce': dict(baie=4.0, fen=(3.0, 2.4, 0.3), h_niv=3.5, texture='bardage métallique / enduit', menuiseries='vitrines aluminium'),
 'annexe': dict(baie=0, fen=None, h_niv=2.5, texture='enduit / parpaing / tôle', menuiseries='porte de garage')}
def typo(p, h, area):
    u = p.get('usage_1') or ''
    if u == 'Annexe' or area < 25: return 'annexe'
    if u.startswith('Commercial'): return 'commerce'
    if h >= 12: return 'collectif_haut'
    if area > 250 or h >= 8: return 'collectif_bas'
    return 'maison'
def S(v, s, src=None):
    d = {'valeur': v, 'statut': s}
    if src: d['source'] = src
    return d
def chains(E):
    """merge consecutive edges that turn less than 20° into one facade"""
    n = len(E); d = [(E[(i + 1) % n] - E[i]) for i in range(n)]
    ang = [math.atan2(v[1], v[0]) for v in d]
    turn = [abs((ang[i] - ang[i - 1] + math.pi) % (2 * math.pi) - math.pi) for i in range(n)]
    starts = [i for i in range(n) if turn[i] > math.radians(20)] or [0]
    out = []
    for k, s0 in enumerate(starts):
        s1 = starts[(k + 1) % len(starts)]; ch = [s0]; i = s0
        while True:
            i = (i + 1) % n; ch.append(i)
            if i == s1: break
        out.append(ch)
    return out
index = []
for b in ids:
    f = FEAT[b]; p = f['properties']; inf = INFO.get(b, {})
    g = shape(f['geometry']); g = max(g.geoms, key=lambda q: q.area) if g.geom_type == 'MultiPolygon' else g
    area = g.area; h = float(p.get('hauteur') or 4); ty = typo(p, h, area); T = TYPO[ty]
    o_path = f'{OBS}/{b}.observations.json'; O = json.load(open(o_path)) if os.path.exists(o_path) else None
    fac = FAC.get(b); photos = SRCS.get(b, {}).get('photos', [])
    if O and 'mur_rgb' in O: wall, wall_st = O['mur_rgb'], 'observé — ' + O.get('source_observation', '')
    elif inf.get('mur_source', '').startswith('référence photo'): wall, wall_st = inf['mur_rgb'], 'observé (capture fournie par l\'utilisateur)'
    elif fac and fac.get('vues', 0) > 0: wall, wall_st = fac['rgb'], f"mesuré (pixels de {fac['vues']} photo(s) Panoramax)"
    elif fac: wall, wall_st = fac['rgb'], 'estimé (' + fac['src'] + ')'
    else: wall, wall_st = inf.get('mur_rgb', [226, 220, 208]), 'estimé (couleur type selon l\'usage)'
    detail = ty == 'collectif_haut' and inf.get('toit') == 'plat' and b not in SKIP_DETAIL and area >= 120
    cdc = {
     'id': b, 'adresse_proche': S(ADRS.get(b, {}).get('adresse_proche'), f"adresse BAN la plus proche ({ADRS.get(b, {}).get('distance_adresse_m')} m)"),
     'typologie': S(ty, 'estimé (usage BD TOPO, hauteur, surface)'), 'usage_bdtopo': S(p.get('usage_1'), 'mesuré', 'BD TOPO'),
     'emprise_m2': S(round(area, 1), 'mesuré', 'BD TOPO'),
     'hauteur_m': S(h, 'mesuré', 'BD TOPO'),
     'niveaux': S(p.get('nombre_d_etages') or max(1, round(h / T['h_niv'])), 'mesuré' if p.get('nombre_d_etages') else 'estimé (hauteur / hauteur d\'étage type)', 'BD TOPO' if p.get('nombre_d_etages') else None),
     'hauteur_niveau_m': S(T['h_niv'], 'estimé (valeur type)'),
     'couleur_mur_rgb': S(wall, wall_st), 'texture_mur': S(T['texture'], 'estimé (typologie)'),
     'couleur_toit_rgb': S(inf.get('toit_rgb'), 'mesuré', 'BD ORTHO'), 'type_toit': S(inf.get('toit'), 'estimé (couleur et forme vues sur l\'orthophoto)'),
     'fenetres': S(None if not T['fen'] else {'largeur_m': T['fen'][0], 'hauteur_m': T['fen'][1], 'allege_m': T['fen'][2], 'travee_m': T['baie']}, 'estimé (valeur type)'),
     'menuiseries': S(T['menuiseries'], 'estimé (typologie)'),
     'balcons_loggias': S(None, 'non observé'),
     'sources_images': photos, 'sources_images_statut': 'aucune photo libre ne montre ce bâtiment' if not photos else 'photos Panoramax (CC-BY-SA 4.0) dont le champ couvre le bâtiment — à confirmer visuellement',
     'rendu': 'moteur détaillé (building_engine.js)' if detail or b in SKIP_DETAIL else 'maillage générique coloré (build.py)'}
    if O:   # observations override the estimates
        for k, v in O.get('cahier', {}).items(): cdc[k] = v
    json.dump(cdc, open(f'{OUTC}/{b}.json', 'w'), ensure_ascii=False, indent=1)
    index.append({'id': b, 'adresse': cdc['adresse_proche']['valeur'], 'typologie': ty, 'h': h, 'niveaux': cdc['niveaux']['valeur'], 'mur': wall, 'mur_statut': wall_st.split(' ')[0],
                  'photos': len(photos), 'rendu': 'détaillé' if detail or b in SKIP_DETAIL else 'générique'})
    if not detail: continue
    # ---- engine profile (LiDAR measures)
    mpath = f'{OUTP}/{b}.mesures.json'
    if not os.path.exists(mpath): subprocess.run([sys.executable, '-I', f'{HERE}/mesure.py', D, b, mpath], check=True, capture_output=True)
    M = json.load(open(mpath)); E = np.asarray(M['empreinte_local'])
    if not (np.isfinite(M['toit_alt_lidar']) and np.all(np.isfinite(M['sol_alt_par_sommet']))):
        cdc['rendu'] = 'maillage générique coloré (LiDAR incomplet)'; json.dump(cdc, open(f'{OUTC}/{b}.json', 'w'), ensure_ascii=False, indent=1); index[-1]['rendu'] = 'générique'; continue
    roof = M['toit_alt_lidar']; lowest = float(min(M['sol_alt_par_sommet']))
    nv = int(cdc['niveaux']['valeur']); hv = (roof - 0.6 - lowest) / nv
    if hv < 2.35 or hv > 3.4: nv = max(1, round((roof - 0.6 - lowest) / 2.75)); hv = (roof - 0.6 - lowest) / nv
    gr = (O or {}).get('grammaire') or {
        'module': [{'type': 'panneau', 'baies': 1, 'largeur_baie_m': T['baie'], 'statut': 'estimé : trame de fenêtres régulière type'}],
        'fenetre': {'largeur_m': T['fen'][0], 'hauteur_m': T['fen'][1], 'allege_m': T['fen'][2], 'profondeur_tableau_m': 0.16, 'volet_roulant': True, 'statut': 'estimé'},
        'loggia': {'retrait_m': 0.35, 'allege_opaque_m': 1.0, 'meneaux_m': 0.7},
        'bandeau_haut': {'hauteur_m': 0.5, 'rgb': [min(255, int(c * 1.05) + 6) for c in wall], 'statut': 'estimé'},
        'rdc': {'porche_largeur_m': 3.0, 'profondeur_m': 1.2}, 'joints_niveau': True}
    cc = (O or {}).get('couleurs_modules') or {'observes': [wall], 'defaut': wall, 'repeter': True, 'loggia_menuiserie': [140, 148, 154], 'loggia_allege': [150, 156, 160]}
    facs = []
    for ch in chains(E):
        L = sum(float(np.hypot(*(E[ch[k + 1]] - E[ch[k]]))) for k in range(len(ch) - 1))
        if L >= max(4.0, gr['module'][0]['largeur_baie_m'] * 1.4): facs.append({'sommets': [int(i) for i in ch], 'longueur_m': round(L, 1), 'role': 'facade', 'statut': 'mesuré (tracé) / estimé (trame)'})
        else:
            for k in range(len(ch) - 1): facs.append({'sommets': [int(ch[k]), int(ch[k + 1])], 'role': 'pignon', 'longueur_m': round(L, 1)})
    prof = {'id': b, 'version': 1, 'nom': cdc['adresse_proche']['valeur'], 'empreinte': M['empreinte_local'], 'sol_par_sommet': M['sol_alt_par_sommet'],
            'toit_alt': roof, 'niveaux': nv, 'hauteur_niveau': round(hv, 3), 'base_alt': round(roof - 0.6 - nv * hv, 2),
            'facades': facs, 'entrees': [], 'grammaire': gr, 'couleurs_modules': cc, 'couleurs_depuis_fin': False,
            'pignon': (O or {}).get('pignon') or {'rgb': wall, 'joints_m': 0, 'grilles': False},
            'toit': {'rgb': M['toit_rgb_ortho'], 'statut': 'mesuré (BD ORTHO)'}, 'equipements': [e for e in M['equipements_toit_lidar'] if e['cellules'] >= 3],
            'provenance': {'empreinte': M['empreinte_source'], 'hauteur': M['lidar_source'], 'couleur': wall_st, 'trame': 'estimé (valeurs types) sauf observations'}}
    json.dump(prof, open(f'{OUTP}/{b}.json', 'w'), ensure_ascii=False)
json.dump(index, open(f'{OUTC}/index.json', 'w'), ensure_ascii=False)
print('cahiers', len(index), 'détaillés', sum(1 for i in index if i['rendu'] == 'détaillé'))
