# Tâche — Toits réels depuis le LiDAR HD (à lancer APRÈS prompts/SUIVANT.md)

> Écrit par Claude. Une PR, basée sur la dernière branche empilée. Remplir « Statut » à la fin.

**Repo** `drz22k57j6-dot/limoges-3d` · **Interdits** : modifier `appart-studio/sun.js` / `sun.test.mjs`, toucher au mode drone, inventer des résultats.

## Contexte
`outils/dl_ville.py` télécharge déjà les rasters LiDAR HD IGN **MNT** (sol) et **MNH** (hauteur au-dessus du sol), utilisés dans `outils/build.py` uniquement pour le relief et les arbres. Les bâtiments sont extrudés à une hauteur unique BD TOPO → toits simplifiés → ombres fausses dans les rues étroites (ce sont les toits d'en face qui décident du soleil au 2e étage).

## Objectif
Dans `outils/build.py`, reconstruire la **forme réelle des toits** de chaque bâtiment à partir du MNH, sans nouvelle donnée.

## Méthode attendue
1. Pour chaque emprise BD TOPO : échantillonner le MNH dans le polygone (résolution du raster, en excluant une bande de 0,5 m au bord et les pixels de végétation : MNH > hauteur bâtiment + 3 m isolés, ou masque arbres existant).
2. Hauteur d'égout = percentile 10–20 des pixels proches des façades ; faîtage = percentile 95. Garder la hauteur BD TOPO comme garde-fou (écart > 6 m → signaler, garder BD TOPO).
3. Toit : maillage en hauteur (grille 1 m simplifiée, ou décimation type quadtree / Douglas-Peucker 3D) découpé par l'emprise, fermé avec les murs jusqu'à l'égout. Détecter et conserver mansardes / terrasses / émergences > 1,5 m (cheminées, cages d'ascenseur).
4. Budget : triangles par bâtiment plafonnés (ex. 400), taille des tuiles 3D ≤ +30 % ; LOD éloigné inchangé (blocs).
5. Les nouveaux toits doivent servir AUSSI au BVH du calcul solaire (phase 4B) : vérifier que les obstacles du calcul = la géométrie affichée.

## Tests
- Script node ou python hors réseau sur un petit raster MNH synthétique : toit à deux pans, mansarde, terrasse avec émergence → hauteurs reconstruites à ±0,3 m.
- Rue Cler (7e) : comparer avant/après les heures de soleil du 38 rue Cler 2e (21 déc et 21 juin) et l'angle de masque de l'immeuble d'en face ; écrire les chiffres dans la PR (calculés, pas inventés).
- Taille totale des tuiles avant/après, temps de build.

## Validation externe (si possible)
Comparer, sur 20 bâtiments du 7e, le classement « toit bien / peu ensoleillé » obtenu avec le cadastre solaire APUR (open data, ODbL). Documenter la concordance.

## Statut
- [ ] PR : (lien)
- [ ] Taille tuiles avant/après :
- [ ] Soleil 38 rue Cler avant/après :
- [ ] Non testé :
