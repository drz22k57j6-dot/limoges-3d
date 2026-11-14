# Bâtiment pilote — 1-31 allée Le Gréco (v18)

## 1. Identification (audit)
| Élément | Valeur | Source |
|---|---|---|
| Identifiant | `BATIMENT0000000224596718` | IGN BD TOPO `batiment` |
| Empreinte | barre incurvée, 41 sommets, 3 290 m², façades 288 m et 292 m, pignons 11,4 m | BD TOPO (mesuré) |
| Position | centre ≈ (−95 ; +95) m du 31 allée Le Gréco | BD TOPO |
| Entrées | 16 adresses BAN n° 1 à 31 (impairs), espacées de 14 à 20 m, côté est (concave) | BAN via géocodeur Géoplateforme (mesuré, position d'adresse) |
| Hauteur | toit **310,73 m** (LiDAR), sol 286,2 → 296,6 m : le terrain monte de 10 m du sud-ouest au nord-est | LiDAR HD 0,5 m (mesuré). BD TOPO : 22,8 m ; fiche PSS : ≈25,5 m (estimation) |
| Niveaux | 9 (R+8), hauteur d'étage calculée 2,66 m | BD TOPO + PSS (concordants) ; hauteur d'étage = calcul |
| Toit | plat, couleur RGB 202/201/200 ; 57 édicules (≈ 4 × 3,3 × 2,5 m par cage + conduits ≈ 1,5 × 1 × 2,8 m) | BD ORTHO + LiDAR MNS (mesuré, boîtes englobantes) |
| Ancienne génération | boîte extrudée, texture « barre » répétée, couleur unique | `outils/build.py` (STYLE) |
| Fichiers | `outils/build.py` (maillage générique), `index.html` (chargement), `building_engine.js` (nouveau moteur) | |

## 2. Observations (non mesurées)
Source : capture fournie par l'utilisateur (rue Trésaguet, mars 2025) — **uniquement regardée**, aucun pixel réutilisé.
Panneaux colorés à 3 fenêtres alternant avec des loggias fermées vitrées (menuiseries grises), bandeau blanc en tête,
pignon blanc à joints horizontaux, porches d'entrée entre poteaux blancs. Couleurs des 6 premiers modules depuis la rue Trésaguet : beige, beige clair, vert, blanc.
Panoramax : **aucune photo** à moins de 45 m. Photo PSS-archi : licence CC BY-NC → non utilisable (et domaine bloqué).

## 3. Ce qui n'est PAS vérifié
- Façade arrière (ouest) : jamais vue → grammaire de la façade principale reprise, blanc par défaut.
- Couleurs au-delà du 6e module ; dimensions exactes des fenêtres/loggias ; positions des volets (générées).
- Intérieurs (fond sombre neutre). Lampadaires : 1 seul détecté (« probable ») — aucun lampadaire dans OSM ici.
- Places de stationnement : non dessinées (aucune donnée de marquage).

## 4. Building Appearance Engine (réutilisable)
1. `outils/bae/mesure.py dl <cleabs> sortie.json [ban.json]` → empreinte, sol par sommet, toit/acrotère LiDAR, édicules, couleur ortho, entrées BAN.
2. `batiments/<cleabs>.observations.json` → grammaire de façade (modules de baies), couleurs observées, statut de chaque donnée.
3. `outils/bae/profil.py mesure.json observations.json profil.json` → profil d'apparence avec provenance.
4. `outils/bae/environnement.py dl profil.json 220 env.json` → haies (LiDAR), cheminements et mobilier (OSM), lampadaires probables.
5. `building_engine.js` → géométrie au chargement : LOD0 (tableaux de fenêtres, cadres, vitrages, volets roulants, appuis, loggias vitrées, porches, bandeau, acrotère, édicules) / LOD1 à 260 m (façade peinte depuis la même grammaire).
6. `BAE_INDEX=data/batiments_detail/index.json python3 -I outils/build.py dl OUT` retire le bâtiment du maillage générique (collision conservée).

**Retour arrière** : vider `data/batiments_detail/index.json` et reconstruire, ou revenir au commit v17.
Textures : Poly Haven « concrete_slab_wall » (CC0) pour relief/rugosité, teintées par les couleurs observées.
