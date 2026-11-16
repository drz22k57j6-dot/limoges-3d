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

## Code

Tout le code du dépôt est original. Le 17/11/2026 ont été supprimés définitivement : le mode FPS à
pied, le métro, la carte et le système d'équipes, ainsi que le code repris d'autres jeux (asphalte,
arbres, herbe 3D, ciel). Ils sont remplacés par `commun/chaussee.js`, `commun/arbres.js` et
`commun/ciel.js`, écrits pour ce projet.

Reste à vérifier : la licence des modèles générés avec Meshy (dont la Tour Eiffel) selon le forfait
utilisé (les forfaits gratuits peuvent imposer une licence ouverte sur les créations).
