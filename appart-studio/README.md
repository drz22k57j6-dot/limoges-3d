# Appart Studio — phases 1 et 2

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

## Moteur (index.html)

- `window.__camOverride` : caméra imposée par Appart Studio (le drone est garé sur la caméra pour que le streaming suive).
- `window.__drone.facades(x, z)` : active le moteur de façades autour d'un point.

## Testé (Chrome headless, format iPhone 390×780)

- 38 rue Cler, 2e : adresse exacte → BATIMENT0000000241927509, façade Est, rue de 13 m, bande calée sur les fenêtres.
- Éditeur : agrandissement 7 × 5 m, 2 cloisons → Séjour 17,65 m² / Chambre 11,10 m² / Salle de bain 6,25 m², 3 fenêtres, 1 porte, annuler/rétablir.

## Limites

- Phase 3 (appartement 3D dans l'immeuble) et phase 4 (soleil) non commencées : bouton « Voir en 3D » désactivé.
- Hors des rues habillées par le moteur de façades, l'étage reste une estimation IGN (corrigeable ±10 cm).
