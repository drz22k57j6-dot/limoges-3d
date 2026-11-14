"""Building Appearance Engine — étape 2 : profil d'apparence (mesures + observations + estimations, chacune étiquetée).
Usage : python3 -I profil.py <mesure.json> <observations.json> <sortie.json>
statut : 'mesuré' (donnée géographique), 'observé' (vu sur une image de référence), 'estimé' (valeur type, à vérifier), 'non observé' (défaut neutre)."""
import sys, json, math, numpy as np
M = json.load(open(sys.argv[1])); O = json.load(open(sys.argv[2]))
E = np.asarray(M['empreinte_local']); n = len(E)
# side split: the two shortest-across edges are the gables (longueur proche de la largeur mesurée)
L = np.hypot(*(np.roll(E, -1, 0) - E).T)
area2 = sum(E[i, 0] * E[(i + 1) % n, 1] - E[(i + 1) % n, 0] * E[i, 1] for i in range(n))
gables = [int(i) for i in O['pignons_aretes']] if 'pignons_aretes' in O else sorted(np.argsort(np.abs(L - O.get('largeur_m', 11.4)))[:2].tolist())
# facade chains between the gables
g0, g1 = sorted(gables)
chainA = list(range(g0 + 1, g1 + 1))            # vertices g0+1 .. g1
chainB = list(range(g1 + 1, n)) + list(range(0, g0 + 1))
def clen(ch): return float(sum(math.hypot(*(E[ch[k + 1]] - E[ch[k]])) for k in range(len(ch) - 1)))
# the facade carrying the BAN entrances is the main (observed) one
perim = np.r_[0, np.cumsum(L)]
def side_of(s):
    i = int(np.searchsorted(perim, s, 'right') - 1) % n
    return 'A' if i in chainA[:-1] else ('B' if i in chainB[:-1] else 'G')
sides = [side_of(e['s']) for e in M['entrees_ban']]
main = max(set(sides), key=sides.count)
chains = {'A': chainA, 'B': chainB}
fac = []
for k, ch in chains.items():
    fac.append({'sommets': [int(i) for i in ch], 'longueur_m': round(clen(ch), 1), 'role': 'entrees' if k == main else 'arriere',
                'statut': 'observé' if k == main else 'non observé (grammaire de la façade principale reprise)'})
fac.append({'sommets': [g0, (g0 + 1) % n], 'role': 'pignon', 'longueur_m': round(float(L[g0]), 1), 'statut': O['pignon']['statut']})
fac.append({'sommets': [g1, (g1 + 1) % n], 'role': 'pignon', 'longueur_m': round(float(L[g1]), 1), 'statut': O['pignon']['statut']})
# entrances as arc length along the main chain (from its first vertex)
ch = chains[main]; P = E[ch]; cum = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
ent = []
for e in M['entrees_ban']:
    p = np.array([e['x'], e['z']]); best = (1e9, 0)
    for k in range(len(P) - 1):
        a, b = P[k], P[k + 1]; d = b - a; t = np.clip(np.dot(p - a, d) / np.dot(d, d), 0, 1); q = a + t * d
        dist = np.hypot(*(p - q))
        if dist < best[0]: best = (dist, cum[k] + t * np.hypot(*d))
    ent.append({'numero': e['numero'], 's': round(float(best[1]), 2), 'statut': 'mesuré (adresse BAN projetée)'})
# levels: from the roof measured by LiDAR, floor-to-floor from the lowest ground and the level count
roof = M['toit_alt_lidar']; lowest = float(min(M['sol_alt_par_sommet']))
nv = O['niveaux']['valeur']
h = (roof - O['acrotere_dalle_m'] - lowest) / nv
prof = {
 'id': M['id'], 'version': 1, 'nom': O.get('nom'),
 'empreinte': M['empreinte_local'], 'sol_par_sommet': M['sol_alt_par_sommet'],
 'toit_alt': roof, 'niveaux': nv, 'hauteur_niveau': round(h, 3), 'base_alt': round(roof - O['acrotere_dalle_m'] - nv * h, 2),
 'facades': fac, 'entrees': ent,
 'grammaire': O['grammaire'], 'couleurs_depuis_fin': bool(np.hypot(*(E[ch[-1]] - np.asarray(O['couleurs_depart_xz']))) < np.hypot(*(E[ch[0]] - np.asarray(O['couleurs_depart_xz'])))), 'couleurs_modules': O['couleurs_modules'], 'pignon': O['pignon'], 'toit': {'rgb': M['toit_rgb_ortho'], 'statut': 'mesuré (BD ORTHO)'},
 'equipements': [e for e in M['equipements_toit_lidar'] if e['cellules'] >= 3],
 'provenance': {
   'empreinte': M['empreinte_source'] + ' — mesuré',
   'hauteur': f"{M['lidar_source']} : toit {roof} m, sol le plus bas {lowest} m — mesuré ; BD TOPO dit {M['bdtopo']['hauteur']} m, la fiche PSS ≈25,5 m (estimation)",
   'niveaux': O['niveaux']['source'], 'hauteur_niveau': 'calculée = (toit LiDAR − dalle/acrotère estimée − sol le plus bas) / niveaux — estimé',
   'equipements_toit': 'IGN LiDAR HD MNS 0,5 m, objets > 1 m au-dessus du toit — mesuré (forme = boîte englobante)',
   'entrees': M['ban_source'], 'facade': O['source_observation'], 'textures': O['textures']},
 'non_verifie': O['non_verifie']}
json.dump(prof, open(sys.argv[3], 'w'), ensure_ascii=False, indent=1)
print('main', main, 'gables', g0, g1, 'h niveau', round(h, 3), 'base', prof['base_alt'], [f['longueur_m'] for f in fac])
