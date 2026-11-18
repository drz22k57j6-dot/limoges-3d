# Tâche — Carte 2D des bâtiments (entrée par défaut) + photoréaliste masqué

> Écrit par Claude. À lancer APRÈS prompts/LIDAR_TOITS.md, en partant de la dernière branche empilée. Une PR par partie. Remplir « Statut ».

**Repo** `drz22k57j6-dot/limoges-3d` · **Interdits** : modifier `appart-studio/sun.js` / `sun.test.mjs`, toucher au mode drone, inventer des résultats.

## Partie 1 — Masquer le photoréaliste (payant en usage commercial)
- Retirer Cesium / Google Photorealistic du parcours client : il ne s'affiche plus nulle part par défaut.
- Le rendre accessible UNIQUEMENT dans Réglages → **Développement** (catégorie à créer si absente) : interrupteur « Carte photoréaliste (expérimental, Cesium ion) » + champ jeton, désactivé par défaut. Aucun appel réseau Cesium tant qu'il est désactivé.
- Le parcours client utilise la carte 2D de la partie 2.

## Partie 2 — Carte 2D ultra précise de tous les bâtiments (100 % open data, gratuit)
**Rendu** : MapLibre GL JS (licence BSD) en plein écran, mobile d'abord, sur le fond vectoriel **Plan IGN** (Géoplateforme, gratuit, attribution « © IGN »). Aucun service payant, aucune clé.

**Couches** :
1. **Bâtiments** : emprises BD TOPO (couche bâtiment des tuiles vectorielles Plan IGN si elle contient `cleabs`, sinon WFS Géoplateforme `BDTOPO_V3:batiment` chargé par bbox à partir du zoom 16, avec cache mémoire). Remplissage coloré par hauteur (dégradé discret), contour fin, surlignage au toucher.
2. **Parcelles cadastrales** (Etalab / Géoplateforme cadastre) à partir du zoom 17, contour pointillé, numéro de parcelle.
3. **Numéros d'adresse** (BAN) à partir du zoom 18.

**Toucher un bâtiment → fiche** (bottom sheet) :
- identifiant IGN (`cleabs`), adresses BAN rattachées (via `data/paris/identite` si disponible, sinon géocodage inverse), hauteur, nombre d'étages, usage, nature, matériaux si présents, référence de parcelle, surface d'emprise ;
- plus tard (prévoir l'emplacement, ne pas implémenter) : année de construction / matériaux BDNB ;
- bouton **« C'est mon immeuble → choisir l'étage »** → suite du parcours existant (slider d'étage, entrée dans l'appartement) avec CE bâtiment et cet `cleabs`, sans re-deviner l'immeuble.

**Recherche d'adresse** : barre en haut (autocomplétion Géoplateforme existante) → la carte vole à l'adresse et surligne le ou les bâtiments candidats ; si plusieurs : liste « Bâtiment A / B » avec surlignage.

**Choix de la façade** : après sélection, les arêtes de l'emprise qui longent une voie sont surlignées ; l'utilisateur touche la sienne (rue / cour / autre rue). Par défaut : l'arête qui fait face à la voie de l'adresse.

**Exigences** : fluide sur iPhone (aucune requête WFS hors écran, débounce au déplacement, limite d'objets), zones de toucher ≥ 44 px, attributions IGN / Etalab / BAN visibles, fonctionnement sans connexion impossible = message clair.

## Tests
- Hors réseau (node) : choix de l'arête de façade face à une voie fournie ; fiche bâtiment à partir d'un objet GeoJSON BD TOPO type ; sélection parmi plusieurs candidats.
- Recette documentée (valeurs réelles, pas inventées) : 38 rue Cler, 5 avenue de Choisy, un angle du 11e — `cleabs`, adresses, étages, parcelle.

## Statut
- [ ] Partie 1 PR : (lien)
- [ ] Partie 2 PR : (lien)
- [ ] Non testé :
