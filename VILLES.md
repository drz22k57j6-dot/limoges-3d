# Plusieurs villes (v24)

Le jeu propose **Limoges** et **Paris** (choix sur l'écran de chargement, ou `?ville=paris`, mémorisé sur le téléphone ; aussi dans la page des maps).

| | Limoges | Paris |
|---|---|---|
| Zone | Val de l'Aurence, 6 × 6 km | centre, 6 × 6 km autour de l'Hôtel de Ville (Louvre – Bastille, Montmartre – Panthéon) |
| Bâtiments (IGN BD TOPO) | 32 500 | 51 900 |
| Données | `data/` | `data/paris/` |

Mêmes sources et même chaîne pour les deux : relief LiDAR HD, orthophoto, bâtiments en tuiles 3D, routes (BD TOPO + OpenStreetMap), arbres LiDAR, herbe, adresses officielles et établissements (`identite/`, un fichier par km²).

Paris : façade « pierre de Paris » générique (fenêtres hautes, garde-corps) sur les immeubles de 3 étages et plus — style type, pas un relevé de chaque immeuble ; couleurs estimées (pas de mesure photo pour Paris).

Ajouter une ville : `python3 -I outils/dl_ville.py X0 Y0 dl_ville`, Overture avec `CITY_X0/CITY_Y0`, puis `CITY_NAME=… CITY_X0=… CITY_Y0=… TILES_OUT=… python3 -I outils/build.py dl_ville sortie`, `herbe_masque.py`, `identite.py`, et une entrée dans `CITIES` (index.html).
