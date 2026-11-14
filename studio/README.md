# Universal Building Studio

Outil de reconstruction automatique d'un bâtiment **réel** en 3D, à partir de données mesurées,
dans le navigateur (Safari iPhone compris). Page : `studio/index.html` → https://drz22k57j6-dot.github.io/limoges-3d/studio/

Aucun bâtiment n'est choisi dans une bibliothèque : tout est calculé à partir des sources ci-dessous.
Chaque caractéristique porte une **provenance** (mesurée / photographiée / déduite / générée) et une **confiance**.

## 1. Audit du dépôt (avant ce travail)

| Élément | Constat | Conséquence pour le studio |
|---|---|---|
| `index.html` (jeu, ~75 Ko) | Three.js 0.187 via jsDelivr, GLTFLoader + Meshopt/Draco, repère local X = est, Y = altitude − H0, Z = −nord, origine Lambert-93 (562924, 6528957) = 31 allée Le Gréco | Le studio utilise **la même version de Three.js** et **le même repère** : un modèle s'intègre par simple translation |
| `data/*.wasm` | GLB et binaires renommés (contournement d'hébergement), générés hors ligne par `outils/build.py` (Python, IGN) | Inchangés |
| Bâtiments du jeu | 2 110 bâtiments extrudés (BD TOPO), toits plats/2 pans **estimés**, façades : textures génériques teintées | Le studio remplace un bâtiment à la demande, sans toucher aux données existantes |
| `outils/facades.py`, `rapport/facades_panoramax.json` | Couleur de façade extraite de photos Panoramax (383 bâtiments) | Même source, mais le studio projette les **pixels** à l'échelle, pas seulement une couleur |
| Hébergement | GitHub Pages, sans serveur, sans PC (utilisation depuis iPhone) | Tout le pipeline tourne **côté navigateur** ; les services utilisés envoient `Access-Control-Allow-Origin: *` (vérifié) |

## 2. Étude des technologies proposées

| Projet | Licence | Techno | Verdict |
|---|---|---|---|
| [orthofacade](https://github.com/louis-e/orthofacade) | Apache-2.0 (sorties dérivées de Mapillary CC-BY-SA + OSM ODbL) | Python, OpenCV, CPU, jeton Mapillary | **Méthode reprise** (texture rectifiée par mur à échelle métrique + masque d'origine), **réécrite en JS** avec Panoramax et le LiDAR pour les occultations. Pas de dépendance Python possible sur iPhone. |
| [Roofer (3DBAG)](https://github.com/3DBAG/roofer) | **GPLv3** | C++ (CMake/Conan), sortie CityJSON LoD1.2–2.2 | **Non intégré** : GPL contaminante, pas de build WebAssembly, nuage de points brut requis. Le studio fait une version légère (RANSAC de pans sur le MNS IGN). Roofer reste une option hors ligne pour un futur LoD2.2 « pro ». |
| [Facades-3D](https://github.com/CTLab-ITMO/Facades-3D) | MIT | Stable Diffusion + TRELLIS, GPU 16 Go | **Refusé** : génère des façades **inventées** (contraire à l'exigence), impossible sur iPhone. |
| OpenDroneMap | AGPL-3.0 | Photogrammétrie serveur (Docker) | **Hors périmètre** : demande des dizaines de photos d'un même bâtiment et un serveur. Piste future pour des photos perso en série. |
| Three.js / glTF | MIT / Khronos | GLTFExporter, GLB | **Utilisé** : export GLB natif, relu par le GLTFLoader du jeu. |

## 3. Architecture

```
studio/
  index.html            interface (carte Leaflet + IGN, panneau, visionneuse 3D, comparaison)
  integration.js        chargement des modèles dans Limoges 3D (opt-in ?studio=1)
  js/app.js             interface et enchaînement
  js/geo.js             Lambert-93 ⇄ WGS84, polygones, Delaunay, rectangle minimal
  js/provenance.js      registre provenance + confiance
  js/sources/ign.js     BD TOPO (WFS), LiDAR HD MNS/MNT (WMS BIL float32), BD ORTHO 20 cm, géocodage
  js/sources/osm.js     secours mondial : OpenStreetMap (Overpass, Nominatim)
  js/sources/panoramax.js  photos de rue (API STAC)
  js/pipeline/pipeline.js  étapes 1 → 7 (indépendant de la ville)
  js/pipeline/roof.js      LiDAR : pans de toit (RANSAC), édicules, sol
  js/pipeline/facade.js    façades : découpage, projection photo, homographie, étages, fenêtres
  js/pipeline/model.js     étapes 8–9 : géométrie, atlas, PBR, intérieur généré, environnement
  js/pipeline/export.js    étape 10 : GLB + publication GitHub
  js/compare.js            écarts LiDAR, emprise, vue du ciel
  js/viewer.js             visionneuse (provenance, superposition photo 360°)
data/studio/            modèles publiés + manifest.json (lu par integration.js)
```

### Pipeline

1. **Identification** — clic carte (WFS `DWITHIN`) ou adresse (géoplateforme). « 1 à 31 rue X » : bâtiment bordant les deux adresses.
2. **Emprise** — polygone BD TOPO (ou OSM), surface, périmètre, rectangle orienté. *Mesurée*.
3. **LiDAR** — MNS/MNT 50 cm : pans de toit par RANSAC + moindres carrés, type de toit, hauteur des deux côtés d'un terrain en pente, édicules par composantes connexes. *Mesurée*.
4. **Orthophoto** — texture du toit à 20 cm, **recalée** (les bâtiments hauts penchent sur la photo : on cherche le décalage qui aligne les bords du toit), couleurs. *Photographiée*.
5. **Photos** — Panoramax dans un rayon réglable ; pour chaque pan de façade : orientation, distance, et **occultation testée dans le LiDAR** (arbres, autres bâtiments). Photos perso possibles.
6. **Rectification** — chaque pixel de façade (à échelle métrique, ≤ 12 px/m) est projeté dans la meilleure photo (équirectangulaire 360° ou perspective) ; photo perso = homographie sur 4 coins. Seuls ces pixels sont marqués *photographiés*.
7. **Ouvertures** — étages (fichiers fonciers + hauteur LiDAR), niveaux horizontaux communs (terrain en pente), fenêtres **détectées** (colonnes sombres par bande d'étage) là où il y a des photos, sinon **trame déduite** réglable ; portes au pied des cages d'escalier probables ; balcons activables par façade.
8. **PBR** — atlas de façades, normales calculées (Sobel), rugosité/métal types. *Générée*.
9. **Intérieur** — planchers + cages d'escalier, nœud `INTERIEUR_GENERE_FICTIF`, couleur rose, exclu de l'export par défaut, jamais présenté comme réel.
10. **Export** — GLB (extras = provenance complète, origine Lambert-93, photos et licences) ; publication directe dans le dépôt via l'API GitHub.

### Comparaison
- écart toit modèle ↔ MNS (médiane, p95, carte de chaleur) ;
- concordance emprise ↔ LiDAR (IoU) ;
- vue du ciel modèle ↔ orthophoto (curseur) ;
- superposition 3D sur une photo 360° Panoramax, à la position GPS de la prise de vue.

### Performance iPhone
Grilles LiDAR ≤ 2048², atlas ≤ 2048 × 4096, 8 photos « sd » maximum, visibilité calculée sur une grille d'1 m, géométrie fusionnée par matériau, pas de post-traitement.

## 4. Sources d'images (onglet « Images »)
- **Photo aérienne IGN 20 cm** (toit, couleurs) et **LiDAR HD** (volume) : automatiques.
- **Panoramax** : photos de rue posées automatiquement (GPS + cap).
- **Mapillary** : photos de rue CC-BY-SA, posées automatiquement (jeton gratuit à coller).
- **Wikimedia Commons** : photos libres géolocalisées, à aligner.
- **Mes photos** (galerie ou appareil, plusieurs à la fois) : position GPS, cap boussole et focale lus dans l'EXIF quand ils existent.
- **Image web** par adresse (si le site l'autorise).

**Aligneur** : pour chaque image, on règle position (plan), direction, inclinaison, champ et hauteur ; le modèle est rendu avec
exactement cette caméra par-dessus la photo (mode superposé ou différence). « Appliquer » projette la photo sur toutes les façades
visibles, puis le modèle est recalculé (couleur des murs, fenêtres détectées si la façade est assez couverte).

## 5. Intégration dans Limoges 3D
Le jeu **n'est pas modifié**. `studio/integration.js` est prêt pour plus tard (chargement de GLB + masquage de l'ancien bâtiment) mais n'est branché nulle part.

## 6. Limites connues (honnêtes)
- Position des photos = GPS (± quelques mètres) : la projection peut glisser d'un ou deux mètres ; pas encore de recalage automatique photo ↔ modèle.
- Le toit est triangulé sur les pans LiDAR : les marches entre deux niveaux de toit sont adoucies sur ~1,5 m.
- Balcons et loggias ne sont pas détectés automatiquement.
- Hors de France : pas de LiDAR ni d'orthophoto libres intégrés → hauteur OSM, toit plat, confiance faible.
- Fichiers fonciers (étages, matériaux) : données déclaratives, parfois fausses.
