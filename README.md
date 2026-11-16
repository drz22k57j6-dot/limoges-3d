# Villes 3D — drone

Paris (et Limoges) en 3D dans le navigateur, construits automatiquement à partir des données publiques
(IGN BD TOPO, LiDAR HD, BD ORTHO, Plan de voirie de Paris, OpenStreetMap). On les survole au drone, sur
ordinateur comme sur iPhone.

**Démo :** https://drz22k57j6-dot.github.io/limoges-3d/?ville=paris

## Ce qu'il y a dedans

- **Drone** : vol jusqu'à 1 500 km/h, recherche d'adresse, 100 lieux en un clic, photos ultra HD,
  agent qui photographie les bâtiments.
- **Ville réelle** : ~51 900 bâtiments à Paris à leur hauteur mesurée, relief LiDAR, voirie réelle
  (trottoirs, passages piétons), arbres, 68 monuments à leur vraie position.
- **Fiche bâtiment** : appui long sur un immeuble pour afficher sa fiche (usage, adresse…).
- **Provenance** : chaque donnée est marquée mesurée, estimée ou générée (voir `rapport/`).
- **Générateur** (`studio/`) : reconstruit un bâtiment réel en 3D.

## Pipeline

Les scripts de `outils/` téléchargent les données et construisent les tuiles d'une ville.
Ajouter une ville : voir `VILLES.md`.

## Licence

Code : tous droits réservés (voir `LICENSE`). Données et composants de tiers : voir `SOURCES.md`.
