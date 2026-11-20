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

- [x] PR : https://github.com/drz22k57j6-dot/limoges-3d/pull/27 (ouverte, empilée sur `feat/appart-studio-next-c-auto-first-person`, non fusionnée).
- [ ] Taille tuiles avant/après : non mesurée ; plafond de 400 triangles/toit, tailles détaillées/LOD et durée totale du build enregistrés dans les métriques après build, mais aucun build Paris comparatif exécuté.
- [ ] Soleil 38 rue Cler avant/après : non mesuré ; aucun nombre d'heures (21 décembre / 21 juin) ni angle de masque annoncé.
- [x] Tests synthétiques hors réseau : 6/6 réussis sur GitHub Actions (toit à deux pans, mansarde, terrasse + émergence, garde-fou >6 m, cour intérieure/budget, filtre des points hauts isolés). Compilation Python réussie.
- [ ] Non testé : build complet sur les rasters Paris, métriques tuiles avant/après et temps de build, recette 38 rue Cler, BVH en runtime sur la scène chargée, validation des 20 bâtiments APUR.
- [ ] Limites : résolution MNH 2 m ; émergences inférieures à cette résolution ou pixels isolés > BD TOPO +3 m non garantis. Le masque arboré global n'est pas disponible au moment du calcul des toits ; seuls les points hauts isolés sont filtrés.
