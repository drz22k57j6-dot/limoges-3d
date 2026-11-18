# Tâche en cours — Fiabilité de la localisation et de l'interface (tout Paris)

> Écrit par Claude. Exécuter dans l'ordre, une PR par lot (0, 1, 2), puis remplir « Statut ».

**Repo** `drz22k57j6-dot/limoges-3d` · **Base** `feat/appart-studio-window-settings-floor-slider-v2` (PR #20)
**Interdits** : modifier `appart-studio/sun.js` ou `sun.test.mjs`, toucher au mode drone, inventer un résultat de test ou une capture.
**Obligatoire** : chaque PR liste ce qui a été testé, comment, et ce qui ne l'a pas été.

---

## Lot 0 — Contrôles non cliquables sur iPhone (bloquant)
**Symptôme** : plusieurs paramètres (fenêtres, épaisseur de mur, hauteur sous plafond, slider d'étage, boutons − / +) ne réagissent pas au doigt.

**Diagnostic attendu (écrire le résultat dans la PR)** :
1. Lister chaque contrôle et l'élément réellement touché à son centre : `document.elementFromPoint(x, y)` en simulation mobile (390×844, `hasTouch`). Tout résultat ≠ le contrôle = calque parasite.
2. Suspects : `#as3-touch`, `#as-3d`, `#as3-bottom`, panneau soleil, bandeau, feuille d'éditeur ; `z-index`, `pointer-events` hérité, `touch-action:none` sur un parent, `preventDefault()` dans les gestes caméra (`pointerdown`/`touchstart`), `setPointerCapture` qui vole les événements, contrôles sous la barre Safari (safe-area).

**Correction** :
- Règle unique : calque de gestes caméra **sous** toute l'UI ; l'UI en `pointer-events:auto` uniquement sur ses blocs, jamais sur des conteneurs plein écran.
- Zones de toucher ≥ 44×44 px, champs numériques en `inputmode="decimal"`, panneaux défilables (`overflow:auto`, `-webkit-overflow-scrolling:touch`) s'ils dépassent l'écran, respect de `env(safe-area-inset-*)`.
- Ajouter un test automatisé (Playwright si disponible, sinon script documenté) qui touche chaque contrôle et vérifie que sa valeur change.

---

## Lot 1 — L'appartement dépasse de l'immeuble (5 av. de Choisy, et partout dans Paris)
**Objectif** : sur **n'importe quelle adresse parisienne**, l'appartement est toujours entièrement **dans le bon bâtiment**, sur **la bonne façade**, **sous le toit**. Pas de correctif au cas par cas.

### 1.1 Rendre l'erreur visible (mode Détails, 3D et vue façade)
Au niveau du plancher : emprise IGN retenue en **vert** (+ `cleabs`), contour de l'appartement en **rouge**, façade retenue en **orange** (flèche vers la rue), autres bâtiments candidats en **gris**. Afficher : mode de correspondance, nb de candidats, surface d'emprise, profondeur disponible, écart volume affiché / emprise (m), hauteur du bâtiment vs plancher.

### 1.2 Corriger la chaîne adresse → bâtiment → façade (cas génériques)
- **Plusieurs bâtiments pour une adresse** (grands ensembles, cours, annexes, tours du 13e) : ne jamais choisir en silence. Si > 1 candidat crédible (distance au point BAN < 15 m ou même adresse dans l'identité IGN) → demander « Votre immeuble » avec surlignage 3D de chaque candidat.
- **Point BAN dans une cour, sur une dalle ou loin de la voie** : retenir la façade qui donne sur **la voie de l'adresse** (géométrie de la rue via la BD TOPO « troncon_de_route » ou le géocodeur inverse), pas simplement l'arête la plus proche.
- **Immeuble d'angle / plusieurs voies** : proposer le choix de la rue.
- **Emprises complexes** (polygones en L, U, avec trous, multipolygones) : utiliser le polygone complet, gérer les anneaux intérieurs (cours).
- **Bâtiment hors des rues habillées par moteur_facades** : vérifier que le volume affiché (tuiles 3D, `_BATCHID`) et le polygone WFS coïncident (même `cleabs`, même projection Lambert-93, même origine X0/Y0) ; si l'écart > 1 m, le signaler en Détails et utiliser la géométrie des tuiles comme référence d'affichage.

### 1.3 Contrainte d'emprise appliquée PARTOUT (défense en profondeur)
- Une seule fonction `constrainToFootprint(plan, footprint, facade)` utilisée par : l'éditeur de plan, l'appartement par défaut (paramètres fenêtres), `buildApartment.js` (dernier rempart : tout mur hors emprise est coupé à l'emprise, tolérance 5 cm).
- Profondeur max = distance façade → limite opposée de l'emprise **le long de la normale**, largeur max = portion de l'arête de façade, jamais au-delà d'un mur mitoyen.
- **Étage** : plancher + hauteur sous plafond ≤ hauteur du bâtiment affiché ; sinon bloquer avec un message clair.

### 1.4 Tests hors réseau (node --test, dans `appart-studio/`)
- Emprise rectangulaire, en L, en U, avec cour intérieure, multipolygone ; appartement plus grand que l'emprise → après contrainte, 100 % des murs dans l'emprise (tolérance 5 cm).
- Point d'adresse dans une cour → la façade retenue est celle qui fait face à la voie fournie.
- Étage au-dessus du toit → refusé.

### 1.5 Recette sur adresses réelles (dans la PR : capture du mode Détails si possible, sinon valeurs)
38 rue Cler (7e) · **5 avenue de Choisy (13e)** · une tour des Olympiades (13e) · un immeuble d'angle du 11e · une adresse en fond de cour du Marais.
Pour chacune : `cleabs`, nb de candidats, façade retenue, profondeur disponible, résultat OK/KO.

---

## Lot 2 — Non-régression
- `node --test appart-studio/*.test.mjs` : tous verts (dont `sun.test.mjs`, inchangé).
- Le parcours complet (adresse → étage → plan → 3D → soleil) fonctionne toujours au 38 rue Cler.

---

## Statut
- [x] Lot 0 — PR : https://github.com/drz22k57j6-dot/limoges-3d/pull/21 · contrôles corrigés : calque caméra sous l’UI, zones pointer-events limitées aux blocs UI, cibles ≥ 44 px, champs décimaux, feuilles/panneaux défilables, script touch-qa.js ajouté (exécution navigateur/iPhone encore à faire)
- [ ] Lot 1 — PR : (lien) · cause réelle au 5 av. de Choisy : (…)
- [ ] Lot 2 — tests : (résultat)
- [ ] Non testé : (liste)
