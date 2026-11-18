# Tâche en cours pour ChatGPT / Codex

> Fichier écrit par Claude. Exécuter la tâche, puis remplir « Statut » en bas dans la PR.

Repo drz22k57j6-dot/limoges-3d, base : `feat/appart-studio-window-settings-floor-slider-v2` (PR #20). Règles : ne pas modifier `appart-studio/sun.js` ni `sun.test.mjs`, ne pas toucher au mode drone, une PR, dire ce qui n'a pas été testé.

## Bug signalé sur iPhone
**5 avenue de Choisy, 75013** : l'appartement 3D dépasse de l'immeuble.


## 0. URGENT — Les paramètres ne répondent pas au toucher (iPhone)
Signalé par l'utilisateur : certains boutons / champs des paramètres (fenêtres, épaisseur de mur, hauteur sous plafond, slider d'étage, − / +) ne sont pas cliquables sur iPhone.
Causes probables à vérifier : un calque transparent par-dessus (ex. `#as3-touch`, `#as-3d` en `pointer-events:auto`, bandeau, panneau soleil), z-index, `pointer-events:none` hérité d'un parent, `touch-action`, `preventDefault()` sur `pointerdown`/`touchstart` dans les gestes de caméra, zones de toucher < 44 px, éléments hors écran sous la barre Safari.
Correction : tous les contrôles des paramètres cliquables au doigt, zones ≥ 44 px, aucun calque invisible au-dessus, défilement possible si le panneau est plus haut que l'écran. Lister dans la PR chaque contrôle testé (même en simulation tactile Chrome mobile).

## 1. D'abord rendre le problème VISIBLE (mode Détails)
En 3D, quand « Détails » est ouvert, dessiner au niveau du plancher :
- en **vert** : le polygone de l'emprise IGN du bâtiment retenu (cleabs affiché) ;
- en **rouge** : le contour de l'appartement (murs extérieurs) ;
- en **orange** : la façade retenue (arête + flèche vers la rue).
Afficher aussi : surface de l'emprise, profondeur disponible depuis la façade, nombre de bâtiments IGN portant cette adresse, mode de correspondance (adresse exacte / proximité).

## 2. Causes probables à vérifier une par une (écrire le résultat dans la PR)
a) **Mauvais bâtiment** : grands ensembles = plusieurs bâtiments IGN pour une adresse. Vérifier lequel est retenu. Si plusieurs candidats, proposer un choix à l'utilisateur (« Votre immeuble : A / B », avec surlignage 3D) au lieu de choisir seul.
b) **Contrainte d'emprise absente d'un chemin** : la contrainte de la PR #17 doit s'appliquer PARTOUT où l'appartement est construit : éditeur de plan, mode paramètres fenêtres (PR #20, appartement par défaut), et `buildApartment.js` lui-même en dernier rempart (couper tout mur hors de l'emprise, profondeur max = distance façade → fond de l'emprise, largeur max = longueur de l'arête de façade).
c) **Écart entre le volume affiché et l'emprise** : hors des rues habillées par moteur_facades, le bâtiment affiché vient des tuiles 3D ; vérifier que son contour au sol coïncide avec le polygone WFS utilisé (même cleabs, même projection, même origine X0/Y0). Mesurer l'écart en mètres et l'afficher.
d) **Étage au-dessus du toit** : si le plancher dépasse la hauteur du bâtiment affiché, bloquer et avertir.

## 3. Correction + test hors réseau
- Ajouter à `phase4b.test.mjs` (ou un nouveau test node) : un polygone d'emprise en L et un appartement plus grand que l'emprise → après contrainte, tous les murs sont dans l'emprise (tolérance 5 cm).
- Décrire le comportement attendu au 5 avenue de Choisy et au 38 rue Cler.

## Statut
- [ ] PR créée : (lien)
- [ ] Cause réelle trouvée au 5 av. de Choisy : (a / b / c / d)
- [ ] Non testé : (liste)
