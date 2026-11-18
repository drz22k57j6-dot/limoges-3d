# Appart Studio — phases 1, 2 et 3

## Parcours (iPhone)

1. Réglages du jeu lancé → bouton **APPART STUDIO** (en bas à gauche).
2. Écran unique : adresse (autocomplétion Géoplateforme dès 3 lettres) + étage (RDC → 15) → **Voir mon immeuble**.
3. Écran « On trouve votre immeuble… » pendant le chargement du quartier. L'utilisateur ne touche jamais la carte ni le drone (interface drone masquée).
4. Caméra posée dans la rue, face à la façade, l'étage surligné sur toute la largeur. Bandeau : adresse, étage, orientation, largeur de rue, ±10 cm.
5. **C'est bien mon étage → Dessiner mon plan** : éditeur 2D plein écran, façade verrouillée en haut, boussole réelle.

Adresses de test : appui long sur le titre « Appart Studio » (rue Cler en tête, là où le moteur de façades habille les vraies rues).

## Localisation (locate.js)

- Géocodage Géoplateforme (déjà utilisé par le jeu).
- Correspondance exacte numéro + voie dans `data/paris/identite/*.json`. Plusieurs bâtiments peuvent porter la même adresse (cour, annexes) : on garde celui dont l'emprise BD TOPO (WFS) est la plus proche du point BAN, donc celui qui touche la rue.
- Secours : bâtiment le plus proche dans 35 m (signalé à l'utilisateur).
- Étage estimé : 0 = RDC ; `nombre_d_etages` IGN inclut le RDC. Garde-fou si la donnée IGN est incohérente (ex. 7 niveaux pour 15 m) : nombre de niveaux recalculé à 3 m.

## Aimantage sur les fenêtres (view.js + moteur_facades)

`buildBuilding` expose désormais `userData.etages = { yF, F, ent }` (hauteurs réelles des niveaux générés) et `quartier.js` les range dans `window.__facadeEtages` par identifiant IGN et par façade. Dès que la façade de l'immeuble est construite, la bande d'étage se cale sur la vraie rangée de fenêtres (RDC double hauteur des commerces pris en compte). Sinon, estimation IGN + correction ±10 cm.

## Éditeur de plan (planEditor.js, roomDetect.js)

- Outils : Pièces (nommer, redimensionner par poignées), Mur, Fenêtre, Porte. Annuler / Rétablir. Sauvegarde automatique (localStorage, par adresse + étage).
- Murs : aimantation 10 cm, sur les nœuds et les murs existants, redressement automatique horizontal / vertical.
- Pièces détectées automatiquement : graphe planaire des murs, faces fermées, murs pendants ignorés.
- Fenêtres / portes : posées d'un toucher, glissables le long du mur, largeur ±10 cm, jamais superposées.
- `getPlan()` renvoie `{ murs, ouvertures, pieces }` en mètres (repère u = le long de la façade, v = vers l'intérieur) pour la phase 3.

## Appartement 3D (buildApartment.js, cam3d.js) — phase 3

- **Voir en 3D** (éditeur) : l'appartement est construit au plancher calé, dans le repère de la vraie façade.
- Murs avec vraies ouvertures (allège, linteau), façade en deux couches (peinture dedans / pierre dehors), plinthes, corniches, rosaces.
- Sols par pièce : parquet point de Hongrie (séjour, chambre), lames (bureau, dressing), carrelage (cuisine, entrée, SDB, WC) — textures procédurales, aucune image à charger.
- Fenêtres : châssis, battants, petits bois, vitre, appui. Portes : chambranle + battant ouvert + poignée.
- Le vrai bâtiment est découpé uniquement dans le volume de l'appartement (plans de coupe locaux en mode intersection, ombres comprises), les voisins restent intacts : la vue par les fenêtres est la vraie rue.
- Pas de lampe ajoutée (pas de recompilation des shaders de la ville) : lumière d'ambiance via un léger émissif.
- Caméras : **Maquette** (vue de dessus, l'immeuble est ouvert au-dessus de l'appartement, orbite + pincement), **Visite** (1re personne, joystick, collisions avec les murs, les portes se traversent), **Fenêtres** (vue depuis chaque fenêtre, ‹ › pour passer de l'une à l'autre, nom de la pièce).

## Moteur (index.html)

- `window.__camOverride` : caméra imposée par Appart Studio (le drone est garé sur la caméra pour que le streaming suive).
- `window.__drone.facades(x, z)` : active le moteur de façades autour d'un point.

## Testé (Chrome headless, format iPhone 390×780)

- 38 rue Cler, 2e : adresse exacte → BATIMENT0000000241927509, façade Est, rue de 13 m, bande calée sur les fenêtres.
- 3D : appartement de 42 m² (séjour, chambre, SDB, 3 fenêtres, 2 portes) au 38 rue Cler 2e — maquette, visite et vue fenêtre vérifiées par captures.
- Éditeur : agrandissement 7 × 5 m, 2 cloisons → Séjour 17,65 m² / Chambre 11,10 m² / Salle de bain 6,25 m², 3 fenêtres, 1 porte, annuler/rétablir.

## Limites

- Phase 4 (soleil réel, heures d'ensoleillement par pièce) non commencée.
- Pas encore de meubles.
- Hors des rues habillées par le moteur de façades, l'étage reste une estimation IGN (corrigeable ±10 cm).


## Correctif géométrie Appart Studio (PR séparée)

- Le moteur de façades expose désormais les travées par niveau : position, largeur, allège et hauteur.
- L'éditeur projette l'emprise IGN dans le repère u/v, l'affiche en gris et contraint les poignées dans le polygone.
- Les fenêtres réelles sont affichées en pointillé et les ouvertures reprennent leurs dimensions.
- Le plan peut être déplacé le long de la façade par travée.
- Le doublage intérieur est déplacé derrière le parement réel ; la découpe commence côté intérieur.


## Finitions 3D — BUG 3 (PR dédiée)

- Garde-corps réels conservés hors de la boîte de découpe ; garde-corps manquants générés via le helper et les matériaux du moteur de façades.
- Doublage extérieur supprimé : murs de contour rendus uniquement côté intérieur, après mesure du nu intérieur par raycast sur le proxy aligné à la façade générée.
- Fenêtres à deux battants pivotants, animation ease-out de 0,6 s, activation au toucher en Visite/Fenêtres et bouton Ouvrir/Fermer.
- Collisions rectangulaires tenant compte de l'épaisseur, sous-pas de 5 cm, obstacles des battants ouverts, garde-corps, allèges et chambranles ; retour à la dernière position valide hors des polygones de pièces.
