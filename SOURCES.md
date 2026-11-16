# Sources, licences et points à régler

## Données (libres, usage commercial autorisé sous conditions)

| Donnée | Source | Licence | Condition |
|---|---|---|---|
| Bâtiments, routes, hydrographie | IGN BD TOPO | Licence Ouverte 2.0 (Etalab) | Citer « IGN » |
| Relief, hauteur des arbres | IGN LiDAR HD | Licence Ouverte 2.0 | Citer « IGN » |
| Couleur du sol et des toits | IGN BD ORTHO | Licence Ouverte 2.0 | Citer « IGN » |
| Voirie, arbres de Paris | Ville de Paris (opendata.paris.fr) | ODbL | Citer + base dérivée partagée sous ODbL |
| Routes complémentaires | OpenStreetMap | ODbL | « © contributeurs OpenStreetMap » + partage à l'identique de la base dérivée |
| Bâtiments (complément) | Overture Maps | ODbL / CDLA selon la couche | Citer |
| Monuments | Open Landmarks | CC BY / ODbL | Citer |
| Couleurs de façades (Limoges) | Panoramax | Licence Ouverte 2.0 ou CC BY-SA 4.0 | Seules des couleurs sont extraites |
| Textures | Poly Haven | CC0 | Aucune |
| Mobilier de Montmartre, poubelles | Sketchfab, bryanvanderlinden | CC BY | Citer l'auteur |
| Voiture « Car Concept » (Limoges) | Khronos Group | CC BY 4.0 | Citer |
| Moteur 3D | three.js | MIT | Garder la notice |

ODbL : les fichiers de données dérivés d'OSM / Ville de Paris doivent rester publiables sous ODbL.
Le code, lui, peut rester propriétaire.

## À régler avant toute vente, licence ou levée de fonds

Ces fichiers reprennent du code d'autres jeux, sans licence connue. Ils doivent être réécrits ou
remplacés :

- `road_saltline.js` : shader d'asphalte repris de « Saltline: Blacktop »
- `plateau_trees.js` : arbres repris du jeu « Plateau » (moteur Blacktop)
- `herbe_lark.js` : herbe reprise de « Larkhollow »
- `lumiere_lark.js` : ciel et lumière repris de « Larkhollow »

Modèles générés avec Meshy (dont la Tour Eiffel) : vérifier la licence du forfait utilisé
(les forfaits gratuits peuvent imposer une licence ouverte sur les créations).

Supprimé le 17/11/2026 (conservé sur la branche `jeu-complet`) : mode FPS à pied (`apied/`, copie
de « Saltline : Cargo »), métro, carte et système d'équipes.
