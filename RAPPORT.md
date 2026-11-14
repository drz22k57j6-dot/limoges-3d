# Limoges 3D — rapport du quartier pilote (rayon 1 km autour du 31 allée Le Gréco)

## Ce qui est mesuré / estimé
| Élément | Source | Statut |
|---|---|---|
| Emprise et hauteur des bâtiments | IGN BD TOPO (WFS data.geopf.fr) | **mesuré** |
| Relief | IGN LiDAR HD (MNT 2 m) | **mesuré** |
| Couleur du sol | IGN BD ORTHO (≈0,5 m/px) | **mesuré** |
| Couleur des toits | BD ORTHO, échantillonnée sur chaque toit | **mesuré** (vue du ciel) |
| Forme des toits | Toits 2 pentes déduits de la forme de la maison | **estimation** |
| Couleur des façades | Photos de rue Panoramax (383 bâtiments) | **mesuré** sur photo |
| Couleur des façades | Voisins mesurés du même type (1117 bâtiments) | **estimation** |
| Couleur des façades | Palette par usage (610 bâtiments) | **estimation** |
| Routes : tracé, largeur | IGN BD TOPO | **mesuré** |
| Routes : couleur | BD ORTHO le long de l'axe | **mesuré** |
| Arbres : position, hauteur | LiDAR HD (MNH) | **mesuré** |
| Arbres : couleur | BD ORTHO | **mesuré** |
| Eau | BD TOPO surface hydrographique | **mesuré** (niveau estimé) |
| Trottoirs, passages piétons | OpenStreetMap — accès pas encore disponible | **manquant** |

Bâtiments dans le pilote : 2110 · toits : {'plat': 1280, 'deux pentes ardoise/zinc': 311, 'deux pentes tuiles': 519}

Aucune photo de rue n'existe à moins de 280 m de l'adresse : les façades proches sont estimées.

## Sources et licences
- IGN Géoplateforme (BD TOPO, BD ORTHO, LiDAR HD) — Licence Ouverte 2.0 (Etalab), usage commercial autorisé.
- Panoramax (api.panoramax.xyz) — photos sous Licence Ouverte 2.0 ou CC-BY-SA 4.0 selon l'auteur ; seules des couleurs en sont extraites.
- Textures Poly Haven (asphalt_02, clay_roof_tiles_02, roof_slates_02, concrete_floor_02, beige_wall_001, concrete_pavement) — CC0.
- Voiture « Car Concept » — Khronos Group, CC-BY 4.0.
- three.js — MIT.

## Fichiers
- `rapport/batiments_info.json` : chaque bâtiment (identifiant BD TOPO, hauteur, couleur mur/toit, source).
- `rapport/facades_panoramax.json` : couleurs mesurées et photos utilisées.
- `outils/` : scripts de génération (téléchargement IGN, photos, construction des GLB).
