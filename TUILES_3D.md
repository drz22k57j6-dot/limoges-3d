# Ville en 3D Tiles (v23)

Les bâtiments ne sont plus un gros fichier chargé d'un coup : ils sont en **3D Tiles 1.1** (le standard de Google / Cesium), dans `data/tuiles/`.

- `tileset.json` : arbre des tuiles. Racine → 36 tuiles de 1 km (version lointaine : prismes colorés, 1 matériau) → 514 tuiles de 250 m (version détaillée : façades, toits, pignons, matériaux du jeu).
- Le jeu charge seulement les tuiles visibles, détaillées près de la caméra (`3d-tiles-renderer`, déjà utilisé pour la ville photo). 23 Mo en tout, compressés (meshopt).
- Identité : chaque sommet porte `_BATCHID` ; `extras.ids[_BATCHID]` = identifiant IGN (`cleabs`). L'appui long sur un bâtiment donne donc l'identifiant exact, puis la fiche (`data/identite_batiments.json`).
- Modèles faits à la main / par IA (`data/modeles/`) : posés à part sur leur empreinte ; leur bloc générique est retiré des tuiles.
- Fabrication : `TILES_OUT=sortie/tuiles BAE_INDEX=liste_retires.json python3 -I outils/build.py dl sortie` (appelle `outils/tuiles.py`), puis compression meshopt de chaque tuile.
- Passage à l'échelle : même format pour tout Limoges ou d'autres villes (ajout de tuiles, sans changer le jeu). Si GitHub Pages (~1 Go) devient trop petit, les tuiles peuvent aller sur un 2e dépôt ou un stockage objet sans toucher au code.
