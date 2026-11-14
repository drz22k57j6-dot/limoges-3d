# Migration du réseau routier — v17

## Avant (v16)
- Axes IGN BD TOPO (`troncon_de_route`) seulement, largeurs typées, surface `routes_v3`.
- Panneaux / passages piétons Overture, pas de bordures, ponts posés sur le terrain, pas de graphe.

## Après (v17)
| Élément | Source | Statut |
|---|---|---|
| Tracé des axes | IGN BD TOPO (Licence Ouverte 2.0) | **mesuré** (données IGN) |
| Routes absentes d'IGN (1 065 tronçons) | OpenStreetMap via Overture 2026-10-21 (ODbL) | **mesuré** (OSM), largeur **estimée** par classe |
| Altitude des routes | z BD TOPO lissé | comparé au LiDAR HD MNT (voir QC) |
| Largeur de chaussée | mesurée sur BD ORTHO pour 5 824 / 7 690 tronçons, bornée à 0,85–1,25 × largeur type | **estimée** (mesure photo, pas de relevé terrain) |
| Ponts (68) | `position_par_rapport_au_sol` IGN + z BD TOPO | tablier à l'altitude IGN, garde-corps 0,9 m **estimés** |
| Bordures + caniveaux (< 1 km du départ) | bord de la chaussée v3 | position **dérivée**, hauteur 14 cm **standard estimé** |
| Passages piétons, stop, cédez-le-passage, feux | Overture `infrastructure` (OSM) | position **OSM**, dessin **standard** |
| Flèches de sens unique | `sens_de_circulation` IGN | **mesuré** (attribut IGN) |
| Graphe de navigation `data/graphe_routier.json` | IGN + OSM, raccords OSM projetés < 12 m | topologie **calculée** |

Pas encore fait : marquages jaunes, places de stationnement, plaques d'égout, trottoirs en dalles (refusés précédemment), tunnels.

## Contrôle qualité (`outils/qc_routes.py` → `rapport/qc_routes.json`, `rapport/qc_routes.png`)
- Écart altitude route / LiDAR MNT : médiane **0,12 m**, p95 **0,53 m**, 1 849 points > 1 m (352 routes, liste dans le JSON — surtout ponts/échangeurs et talus).
- Connexité : 7 191 nœuds, 8 774 tronçons, **93 %** des nœuds dans la composante principale (215 composantes, contre 940 avant raccordement). 114 impasses à moins de 8 m d'une autre route = raccords probablement manquants.
- Routes OSM toujours absentes du jeu : 145 segments (≈ 19 km, dont 8 km de voies de service).
- Couverture des axes par la chaussée : 98,9 % en moyenne, 287 axes < 90 %.

**Aucune route n'est déclarée exacte** : seules les valeurs comparées ci-dessus ont été vérifiées contre IGN/OSM/LiDAR.

## Régénérer
`python3 -I outils/build.py dl OUT` puis `python3 -I outils/qc_routes.py`. Retour arrière : commit précédent (v16).
