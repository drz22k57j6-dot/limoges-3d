# Moteur de textures

Module isolé, utilisé par le jeu drone (et réutilisable par les autres modes).

## 1. Dans le jeu : `moteur.js` (temps réel, tous les bâtiments)
Appliqué aux façades, pignons et toits des 144 000 bâtiments de Paris, et aux monuments :
- **anti-répétition** : la texture est relue avec un décalage qui change par zones (deux lectures fondues), plus de motif en grille ;
- **nuances à grande échelle** (10 à 50 m), en coordonnées du monde ;
- **teinte propre à chaque bâtiment** (identifiant `_batchid` des tuiles) ;
- **vieillissement** : coulures verticales sur les murs, dessous abrités plus sombres.

```js
import { createMoteurTextures } from './moteur_textures/moteur.js';
const MT = createMoteurTextures(THREE);
MT.appliquer(materiau, MT.PROFILS.facade); // facade | toit | monument | sol
MT.actif = false;                          // tout couper
```
Les nuances, coulures et teintes sont générées : ce ne sont pas des mesures.

## 2. Hors jeu : `outils/` (texturage d'un monument GLB sans texture)
0. `0_geometrie.mjs` : géométrie par matériau ;
1. `1_couleurs_ortho.py` : couleur vue du ciel de chaque matériau, **mesurée** sur la BD ORTHO IGN ;
2. `2_textures.py` : textures PBR (pierre, enduit, ardoise Poly Haven CC0 teintées ; or, vert-de-gris, zinc, fer, verre générés) ;
3. `3_appliquer.mjs` : UV à l'échelle réelle, décalage par plan, couleurs de sommets (salissure, zones abritées).
