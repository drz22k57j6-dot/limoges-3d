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

- Le runtime Paris charge `terrain_loin.wasm`, puis les tuiles `data/paris/terrain/t_<i>_<j>.wasm` de 2 km autour du joueur.
- `outils/build.py` produit toujours un GLB de terrain distinct, qui n'est pas consommé par le streamer. Pour éviter ce décalage, cette branche ajoute un générateur dédié : `outils/terrain_runtime.py`.
- `outils/dl_ville.py` télécharge maintenant les dalles brutes MNT LiDAR HD en EPSG:2154, couche `IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93`, à 0,5 m/pixel (36 dalles 1 km).
- Le générateur produit `data/paris/terrain_hd/t_<i>_<j>.wasm`, directement au format GLB attendu par `loadGLB()`, aligné sur `RX`, `RY` et `H0` du runtime. Le maillage est échantillonné tous les **4 m** depuis le raster MNT 50 cm, avec texture orthophoto IGN.
- `terrainTile()` tente désormais `terrain_hd` en premier, puis revient automatiquement à `terrain` si la tuile HD n'existe pas ou échoue. Seules les tuiles entièrement couvertes par le carré téléchargé de 6 × 6 km sont générées ; le reste de Paris conserve l'ancien terrain.
- Tests synthétiques ajoutés pour les limites de dalles, l'écriture GLB et un maillage complet de 501 × 501 sommets / 500 000 triangles.
- **Non démontré à ce stade :** génération avec les vrais rasters IGN et contrôle visuel du terrain HD dans Safari. Le workflow manuel doit encore être lancé pour créer et publier les fichiers `terrain_hd`.

### Végétation

- Le dépôt contient les données JSON `data/paris/vegetation/*.json` et un index, avec un rapport de génération indiquant 220 294 arbres, 5 951 haies, 4 671 massifs et 236 secteurs. 20 084 hauteurs d'arbres (9,1 %) sont estimées.
- Le runtime actuel charge les arbres depuis `data/paris/secteurs/<secteur>/arbres.wasm` (via `sectorPhys` et `STREAM.treeBufs`), puis les convertit en arbres procéduraux avec `buildTrees()`.
- Le runtime ne lit pas actuellement `data/paris/vegetation/<secteur>.json`. Les clés JSON `a`, `h`, `m` n'ont donc pas d'effet visuel dans le jeu.
- Le calcul solaire de `appart-studio/sun.js` dispose d'un contrat d'occlusion pour des obstacles et d'une transmission d'arbres facultative, mais l'audit n'a pas trouvé de raccordement des nouvelles haies/massifs à ce calcul.
- **Non démontré :** fusion/dédoublonnage des arbres d'inventaire et arbres détectés LiDAR, affichage des haies/massifs, occlusion solaire issue de ces nouvelles données.

## Intégration végétation ajoutée depuis l'audit

- `index.html` charge l'index et les JSON de végétation uniquement pour les secteurs visibles autour du joueur.
- Les arbres Ville de Paris sont convertis vers le format binaire historique attendu par `buildTrees()`, avec hauteur, rayon de houppier, orientation et couleur de famille botanique.
- Les arbres sont fusionnés aux arbres LiDAR historiques ; un dédoublonnage spatial de 2,25 m évite la majorité des doubles placements.
- Les haies sont rendues comme volumes 3D segmentés ; les massifs comme volumes extrudés. Le rendu est libéré lorsque le secteur sort de la zone visible.
- `appart-studio/solarAnalysis.js` lit désormais en priorité l'inventaire local pour les arbres et utilise les haies/massifs comme obstacles opaques du BVH solaire. Les houppiers d'arbres utilisent le modèle saisonnier simplifié existant (caduc/conifère). L'API live des arbres reste un fallback si l'inventaire local est indisponible.
- **Limite scientifique :** les haies/massifs sont actuellement opaques et les houppiers utilisent une transmission simplifiée ; ce n'est pas une modélisation radiative calibrée ni un résultat juridiquement opposable. Il faudra mesurer/calibrer porosité, dimensions et saisonnalité avant tout usage contractuel.
- Tests ajoutés : `appart-studio/vegetation.test.mjs` et `outils/test_vegetation_runtime.py`. Le workflow `.github/workflows/vegetation-runtime.yml` valide la syntaxe du module navigateur, le module solaire, les tests de chargement et les 236 secteurs de données.

## Correction de sécurité incluse dans cette branche

Le workflow `.github/workflows/vegetation.yml` pointait explicitement sur `main` pour le checkout et le push. Il pouvait donc publier des données sur `main` même lorsqu'il était lancé depuis une branche de travail. Il est maintenant limité à `feat/appart-studio-runtime-lidar-vegetation` (checkout, rebase et push).

## Ordre d'intégration recommandé

1. **Toitures :** exécuter le workflow LiDAR réel sur le secteur de test, contrôler les statistiques et les fichiers runtime effectivement servis, sans remplacer le fallback.
2. **Terrain :** identifier le générateur exact des `terrain/t_*.wasm` et du terrain lointain, confirmer la couche IGN MNT HD et son emprise, puis ajouter une génération par tuiles/LOD avec fallback MNT 2 m. Ne pas charger un raster 12k × 12k complet sur iPhone.
3. **Végétation :** définir un adaptateur versionné JSON → format runtime, charger seulement les secteurs proches, fusionner les arbres existants sans doublons, puis rendre haies et massifs sous budget GPU.
4. **Solaire :** partager les mêmes obstacles géoréférencés avec le moteur solaire, en modélisant explicitement la porosité saisonnière des houppiers et la hauteur/largeur des haies.
5. **Validation :** tests de schéma et de géoréférencement, contrôle des secteurs du 38 rue Cler et de quatre autres adresses, non-régression IGN, puis essai Safari iPhone réel avec mesures mémoire/FPS.

## Limites de validation

La végétation est maintenant raccordée au code runtime et au calcul solaire, et les tests GitHub Actions du commit `b3d2fd12ae583e735d37c996b627c2e34ef882b1` ont réussi (syntaxe navigateur, syntaxe solaire, tests Node, validation des données).

Les étapes terrain et reconstruction réelle des toitures restent à exécuter. Le workflow de toitures a été réorienté vers cette branche et la PR #28, mais il est manuel : aucun build IGN réel ni test Safari iPhone n'est déclaré terminé. Le générateur terrain actuellement présent dans le dépôt ne produit pas les tuiles runtime `terrain/t_*.wasm`; les sorties terrain GLB de `outils/build.py` ne sont pas automatiquement chargées par le jeu. Le terrain haute résolution n'est donc pas encore intégré.

Aucune validation visuelle réelle sur iPhone n'a été possible depuis les outils GitHub seuls. Les données et le code sont en place, mais il faut encore exécuter le workflow LiDAR réel et contrôler le rendu en Safari avant de déclarer l'ensemble terminé.
