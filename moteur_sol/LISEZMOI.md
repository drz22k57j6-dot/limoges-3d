# Moteur de sol urbain

Module isolé (comme `moteur_textures/` et `moteur_facades/`), calé sur les cotes réelles de la voirie parisienne.

- `moteur.js` : `createMoteurSol(THREE)` → `construire(buffer)` (détails d'un secteur), `majCamera(pos)`,
  `abandon` (0 entretenu → 1 abandonné), `glsl(id)` / `glslCommun` (matières de voirie enrichies, via `commun/voirie.js`).
- `rue.js` : `solRue(THREE, MS, VO, { L, S, RD, passages })` : sol complet d'une rue droite (utilisé par les rues test du moteur de façades).
- `outils/details.py` : génère `data/paris/secteurs/<i_j>/sol_details.wasm` depuis la voirie réelle (`voirie.wasm`) et les arbres.
- `apercu.html?el=0..10` : chaque élément seul, en gros plan.

## Cotes utilisées
| Élément | Valeur | Source |
|---|---|---|
| Trottoir | asphalte coulé ; porte cochère : asphalte AC1 quadrillé | CCTP Ville de Paris (entretien chaussées et trottoirs) |
| Bordure | granit, ~17 cm × 25/35 cm, blocs de 0,70 à 1,20 m ; hauteur 10–15 cm | Noblema (bordures de Paris) ; « La rue parisienne » |
| Caniveau | bande d'asphalte AC1 de 40 cm, ou 2 rangs de pavés 14 × 20, ou 3 rangs de pavés mosaïque (~30 cm) | CCTP Ville de Paris ; CCTP Yvelines livre 4 |
| Pavés | granit, 20–27 × 14–15 × 14 cm | BCA matériaux anciens (pavé de Paris) |
| Bouche d'égout | ouverture dans la bordure + tampon de fonte sur le trottoir | Wikisource, « Paris, ses organes… » (égouts) |
| Regard | fonte Ø 60–64 cm | catalogues tampons de voirie |
| Grille d'arbre | modèle Ville de Paris, ronde Ø 2 000 mm, trou 600 mm | HelloPro (grille Lutetia) |
| Passage piéton | bandes de 50 cm, espacées de 50 cm, largeur ≥ 2,50 m | Grand Lyon, fiche passages piétons |
| Bande d'éveil | 40 cm (ou 58,7 cm) au droit des traversées | norme NF P98-351 |

Ce qui est généré (pas relevé) : la position exacte de chaque bouche, regard, plaque, porte cochère et herbe ;
le type de caniveau par tronçon ; les teintes et l'usure. Textures entièrement calculées (aucune photo).
