# Appart Studio — phase 1

## Démo

- Ouvrir le site Paris en monde 3D.
- Appuyer sur **APPART STUDIO** en bas à gauche.
- Choisir une adresse de démonstration ou saisir une adresse.
- Vérifier l'étage (convention française : 0 = RDC), puis localiser.
- Le repère rouge est posé au niveau du plancher, à l'intérieur de la façade retenue.
- Les boutons ±10 cm corrigent immédiatement la hauteur.

## Adresses de recette

1. 10 rue de Rivoli, 75004 Paris — 4e.
2. 1 boulevard Voltaire, 75011 Paris — 2e (immeuble d'angle à vérifier à l'exécution).
3. 12 rue de la Ferronnerie, 75001 Paris — 1er (rue étroite, secteur central).
4. 10 avenue Victor-Hugo, 75016 Paris — 5e.
5. 8 avenue de France, 75013 Paris — 10e.

## Données et calcul

- Géocodage : service Géoplateforme déjà utilisé par le jeu.
- Correspondance exacte : fichiers `data/paris/identite/i_j.json`, comparaison normalisée du numéro + nom de voie dans `adresses[].label`.
- Secours : recherche WFS BD TOPO dans une bbox de 35 m autour du point BAN, choix du polygone le plus proche.
- Emprise et arête de façade : géométrie BD TOPO EPSG:2154, segment le plus proche du point BAN ; normale orientée vers le point BAN (ou vers l'extérieur si le point est dans l'emprise).
- Repère du moteur : `x = X - CITY.X0`, `z = -(Y - CITY.Y0)`.

### Nombre d'étages

L'attribut IGN BD TOPO `nombre_d_etages` est le **nombre total de niveaux hors-sol, rez-de-chaussée compris** ; les sous-sols ne sont pas comptés. Source : Descriptif de contenu BD TOPO v3.5 (juillet 2025), fiche « Nombre d'étages ».

Calcul appliqué :
- `nbNiveauxAuDessusRDC = max(1, etages - 1)`
- `hRDC = 4 m` pour un haussmannien probable, sinon `3 m`
- `hEtage = (hauteur_m - hRDC - hToit) / nbNiveauxAuDessusRDC`
- `hToit = 3 m` uniquement si une information explicite de toiture mansardée est présente ; sinon 0.
- `plancher(0) = sol`; pour `etage > 0`, `sol + hRDC + (etage - 1) × hEtage`.

Le caractère haussmannien est une heuristique provisoire (nature/usage ou hauteur et nombre de niveaux) : l'utilisateur peut corriger la hauteur par pas de 10 cm.

## Limites honnêtes de cette PR

- La rangée de fenêtres du générateur de façades n'est pas exposée sous forme de métadonnées consommables ; l'aimantage automatique aux fenêtres attendra une API de rangées côté générateur. Le réglage ±10 cm est disponible immédiatement.
- Cette phase ne réalise pas encore le patch shader d'ouverture du volume cible, la maquette découpée, ni le calcul du soleil : ces éléments sont respectivement prévus dans les phases 3 et 4.
- Les 5 adresses sont des scénarios de recette, pas des résultats de test certifiés. Une exécution réelle sur iPhone est nécessaire pour joindre les captures d'écran et confirmer chaque ID IGN/hauteur avant fusion.
