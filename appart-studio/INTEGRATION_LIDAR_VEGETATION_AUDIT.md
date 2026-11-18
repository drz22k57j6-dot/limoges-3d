# Audit d'intégration LiDAR, terrain et végétation — 2026-11-19

## Périmètre et méthode

Audit du code sur la tête de la PR #27 (`f2896d5ac30a925bbbe7b3382ab048f38b30121e`). Ce document distingue explicitement les données présentes, les chemins de chargement runtime et les fonctions réellement validées. Aucun build IGN réel ni test Safari iPhone n'a été exécuté pendant cet audit.

## État vérifié

### Toitures MNH LiDAR HD

- `outils/dl_ville.py` demande 36 dalles MNH HD de 1 km à 0,5 m.
- `outils/build.py` charge ces dalles dans une mosaïque 12 000 × 12 000, les utilise pour échantillonner les bâtiments et garde le MNH 2 m comme repli.
- Le workflow `.github/workflows/rebuild-paris-lidar-roofs.yml` est manuel et reconstruit les sorties sous `data/paris/tuiles`.
- Le code documente correctement le pas de grille de 50 cm et ne le confond pas avec la précision altimétrique annoncée de 10 cm.
- **Non démontré :** présence effective de toutes les dalles sur le secteur réel, nombre de toitures réellement maillées depuis le HD, publication de ces meshes dans les ressources runtime chargées par `index.html`.

### Terrain

- Le runtime Paris avec `data/paris/secteurs/index.json` charge `terrain_loin.wasm` au démarrage, puis les tuiles `data/paris/terrain/t_<i>_<j>.wasm` à proximité.
- Le builder `outils/build.py` construit actuellement `ville_terrain.glb` et `relief.bin` dans ses sorties de build, avec MNT 2 m. Ces sorties ne sont pas, à elles seules, les tuiles runtime `terrain/t_*.wasm`.
- L'arbre Git contient déjà des tuiles runtime `data/paris/terrain/t_*.wasm` et `data/paris/secteurs/relief/r_*.wasm`. Leur présence dans Git ne prouve pas qu'elles ont été régénérées depuis un MNT HD.
- **Non démontré :** disponibilité d'un MNT LiDAR HD adapté, intégration dans le générateur de tuiles runtime, gains de résolution réellement visibles. Aucun remplacement du terrain runtime n'est effectué dans cette branche.

### Végétation

- Le dépôt contient les données JSON `data/paris/vegetation/*.json` et un index, avec un rapport de génération indiquant 220 294 arbres, 5 951 haies, 4 671 massifs et 236 secteurs. 20 084 hauteurs d'arbres (9,1 %) sont estimées.
- Le runtime actuel charge les arbres depuis `data/paris/secteurs/<secteur>/arbres.wasm` (via `sectorPhys` et `STREAM.treeBufs`), puis les convertit en arbres procéduraux avec `buildTrees()`.
- Le runtime ne lit pas actuellement `data/paris/vegetation/<secteur>.json`. Les clés JSON `a`, `h`, `m` n'ont donc pas d'effet visuel dans le jeu.
- Le calcul solaire de `appart-studio/sun.js` dispose d'un contrat d'occlusion pour des obstacles et d'une transmission d'arbres facultative, mais l'audit n'a pas trouvé de raccordement des nouvelles haies/massifs à ce calcul.
- **Non démontré :** fusion/dédoublonnage des arbres d'inventaire et arbres détectés LiDAR, affichage des haies/massifs, occlusion solaire issue de ces nouvelles données.

## Correction de sécurité incluse dans cette branche

Le workflow `.github/workflows/vegetation.yml` pointait explicitement sur `main` pour le checkout et le push. Il pouvait donc publier des données sur `main` même lorsqu'il était lancé depuis une branche de travail. Il est maintenant limité à `feat/appart-studio-runtime-lidar-vegetation` (checkout, rebase et push).

## Ordre d'intégration recommandé

1. **Toitures :** exécuter le workflow LiDAR réel sur le secteur de test, contrôler les statistiques et les fichiers runtime effectivement servis, sans remplacer le fallback.
2. **Terrain :** identifier le générateur exact des `terrain/t_*.wasm` et du terrain lointain, confirmer la couche IGN MNT HD et son emprise, puis ajouter une génération par tuiles/LOD avec fallback MNT 2 m. Ne pas charger un raster 12k × 12k complet sur iPhone.
3. **Végétation :** définir un adaptateur versionné JSON → format runtime, charger seulement les secteurs proches, fusionner les arbres existants sans doublons, puis rendre haies et massifs sous budget GPU.
4. **Solaire :** partager les mêmes obstacles géoréférencés avec le moteur solaire, en modélisant explicitement la porosité saisonnière des houppiers et la hauteur/largeur des haies.
5. **Validation :** tests de schéma et de géoréférencement, contrôle des secteurs du 38 rue Cler et de quatre autres adresses, non-régression IGN, puis essai Safari iPhone réel avec mesures mémoire/FPS.

## Limites de validation

Cette branche contient l'audit et la correction du workflow végétation, pas l'intégration runtime complète. Les données sources et les scripts seuls ne permettent pas de déclarer que le monde affiché ou les résultats solaires utilisent déjà toutes ces données. Les étapes 1 à 5 restent à exécuter et à mesurer.
