# Appart Studio — phases 1 à 4

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

## Phase 4A — soleil réel dans la scène

- Le panneau solaire apparaît dans les vues 3D (maquette, visite, fenêtres) : date, raccourcis 21 décembre / 21 mars / 21 juin / aujourd'hui, heure entre lever et coucher, journée accélérée en 12 secondes.
- La position et la direction sont importées directement depuis `sun.js` ; les algorithmes de référence ne sont pas recopiés.
- La DirectionalLight existante du jeu est pilotée temporairement autour du centre de l'appartement. Aucune seconde lumière n'est créée.
- La caméra d'ombre est resserrée à 150 × 150 m ; résolution plafonnée à 1024 sur mobile. Le suivi du soleil, la couleur, l'intensité et le cadrage d'ombre du jeu sont restaurés à la fermeture.
- Le panneau est repliable (une ligne compacte par défaut) ; en mode Visite il se replie automatiquement. Le joystick se place au-dessus du bloc inférieur à partir de sa hauteur mesurée par `ResizeObserver`. L'aide de déplacement disparaît après 4 secondes.
- « Détails » expose azimut, élévation, incidence sur la façade et présence du soleil sur la façade.
- Les vitres de l'appartement ont `castShadow = false` ; aucune modification de géométrie n'a été nécessaire pour ce point.
- **Non validé sur iPhone à ce stade** : le positionnement réel, les ombres visibles au sol, les performances et les captures restent à vérifier sur appareil.

## Phase 4B — heures de soleil par fenêtre et par pièce

- `solarAnalysis.js` échantillonne les 4 dates (21 décembre, 21 mars, 21 juin, aujourd'hui) à 15 minutes avec `daySamples`.
- Chaque fenêtre du plan est représentée par 5 points extérieurs ; le calcul appelle `windowSunHours`.
- Les obstacles de scène dans un rayon de 250 m sont préfiltrés par un BVH AABB hiérarchique puis testés avec le raycaster Three.js.
- Les arbres sont chargés par `fetchTrees(lon, lat, 150)`, représentés par des troncs et des sphères de houppier instanciés, puis pris en compte via `rayHitsCrown` et `leafTransmission`.
- Les résultats sont affichés par fenêtre et par pièce. Le total d'une pièce prend le maximum des fractions de fenêtres à chaque pas de 15 minutes : plusieurs fenêtres simultanément éclairées ne doublent pas le temps.
- Le calcul cède la main après des tranches d'environ 30 ms via `requestIdleCallback` (ou `setTimeout` sur Safari), avec progression visible.
- Test hors réseau ajouté : `node --test appart-studio/phase4b.test.mjs`. Il couvre le masque de 30° sur une façade Est et le résultat sans obstacle.

## Phase 4C — mode express sur la façade réelle

- Après confirmation de l'étage, deux actions sont proposées : **Résultat express (30 s)** ou **Dessiner mon plan (effet wouah)**.
- Le générateur de façades publie les baies réellement construites dans `userData.etages.windows` (travée, niveau, position, largeur et hauteur). Le mode express filtre les baies du niveau demandé.
- Les fenêtres sont surlignées sur la façade en place ; toucher une baie l'ajoute/retire de la sélection. Le calcul réutilise `calculateSolarReport()` / `windowSunHours()`, les obstacles, les arbres et les quatre dates de la phase B, sans construire la géométrie intérieure de l'appartement.
- Le résultat présente chaque fenêtre sélectionnée et un total multi-fenêtres sans double comptage des pas de 15 minutes.
- Si les métadonnées de façade ne sont pas encore chargées ou si le générateur ne publie pas de baies pour le niveau, le mode express explique pourquoi il ne peut pas démarrer.

## Phase 4D — Score Soleil A→G

- Le score utilise les heures directes du 21 décembre du meilleur séjour (séjour prioritaire) ; si aucun séjour n'est défini, il prend la meilleure chambre.
- Seuils : A ≥ 4 h ; B ≥ 3 h ; C ≥ 2 h ; D ≥ 1 h ; E ≥ 0,5 h ; F > 0 h ; G = 0 h.
- Les heures d'été du même local sont affichées à côté du score.
- Le libellé exact **« Score Soleil »** et l'avertissement **« soleil direct simulé, hors météo »** sont présents dans Détails et le rapport d'analyse.
- En mode express sans plan, le score A→G est volontairement indiqué comme indisponible : aucune pièce séjour/chambre n'est connue.
- Test pur hors réseau : `node --test appart-studio/solarScore.test.mjs` (seuils, priorité séjour, secours chambre).

## Limites

- Le calcul express n'a pas été chronométré sur iPhone ; l'objectif inférieur à 5 secondes reste à mesurer.
- Le mode express dépend des métadonnées des façades classiques ; les immeubles modernes ou les façades non encore générées peuvent ne pas exposer de fenêtres sélectionnables.
- Les tests B n'ont pas été exécutés dans cette session ; le script est livré pour exécution locale/CI.
- Le BVH porte sur les meshes actuellement chargés dans la scène : les bâtiments encore non streamés ne peuvent pas bloquer les rayons.
- Les résultats arbres dépendent des données Open Data disponibles ; en cas d'échec réseau, le calcul continue sans arbres et le signale dans la console.
- Le calcul d'angle de masque de l'immeuble opposé au 38 rue Cler n'est pas documenté ici : il manque une hauteur IGN vérifiée du bâtiment en face et l'altitude exacte de la fenêtre du logement de démonstration. Aucune hauteur ne doit être supposée. Une fois ces deux valeurs établies, appliquer `atan((H_{face}-altitude_{fenêtre})/13)` et calculer les minutes où l'élévation solaire dépasse cet angle, avec azimut dans [−21°, 159°].
- Phase 4B (heures d'ensoleillement par fenêtre et par pièce, BVH et arbres) à venir.
- Pas encore de meubles.
- Hors des rues habillées par le moteur de façades, l'étage reste une estimation IGN (corrigeable ±10 cm).


## Phase 5.1 — stabilité du passage en 3D

- Les six plans de coupe sont créés à la construction ; le passage Maquette/Visite/Fenêtres ne modifie que la constante du plan supérieur.
- Le moteur de façades conserve l'identifiant IGN du bâtiment cible jusque dans les meshes fusionnés. La découpe ne s'applique qu'à cet identifiant ; les matériaux sont clonés pour éviter de modifier les matériaux partagés de la ville.
- Les murs pleins de l'appartement sont fusionnés par matériau. Les textures procédurales de sol sont limitées à 512 × 512 px.
- La boucle de rescannage périodique des meshes de ville est supprimée. Détails affiche désormais `renderer.info.programs.length` pour surveiller la stabilité des programmes WebGL.
- **Comment tester sur iPhone (3 étapes)** :
  1. Ouvrir une adresse de test et choisir **Dessiner mon plan**, puis **Voir en 3D**.
  2. Passer dix fois de suite Maquette → Visite → Fenêtres → Maquette.
  3. Ouvrir **Détails** avant et après : comparer « Programmes WebGL » et vérifier l'absence de fermeture Safari.
- **Limites connues / non testé** : les dix allers-retours et la stabilité mémoire n'ont pas été exécutés sur iPhone ; aucun nombre de programmes ni capture n'est revendiqué. Le ciblage de la découpe dépend du maintien de l'identifiant IGN par le moteur de façades. La stabilité devra être vérifiée sur une adresse dont les façades sont effectivement chargées.


## Phase 5.2 — ombres cohérentes dans l'appartement

- Les murs de l'appartement ont une épaisseur minimale de 15 cm.
- Les sols et plafonds sont des dalles extrudées de 15 cm ; ils projettent et reçoivent les ombres.
- Le plafond reste masqué en Maquette et redevient visible en Visite : sa dalle bloque donc le soleil venant du dessus.
- Les meshes du bâtiment cible hors volume découpé conservent leur capacité à projeter des ombres. Le clipping d'ombre reste actif sur les matériaux clonés du bâtiment cible.
- Le bias et le normalBias du soleil sont ajustés pendant l'override Appart Studio puis restaurés à la sortie.
- **Comment tester sur iPhone (3 étapes)** :
  1. Ouvrir le 38 rue Cler, choisir le 2e étage, dessiner le plan puis entrer en **Visite**.
  2. Régler le panneau solaire sur **21 juin**, puis placer l'heure à **13:00** (heure de Paris).
  3. Regarder le sol : seules les taches de lumière passant par les fenêtres doivent être visibles ; le plafond doit empêcher la lumière zénithale.
- **Limites connues / non testé** : le scénario du 21 juin à 13:00 n'a pas été exécuté sur iPhone ; la concordance visuelle des ombres, le bias réel sur le GPU mobile et la géométrie d'extrusion doivent être vérifiés dans Safari. Aucun résultat ni capture n'est revendiqué.


## Phase 5.3 — emprise IGN et fenêtres de façade

- Le plan est borné par l'emprise polygonale IGN projetée dans le repère local : les poignées et les points manipulés sont limités à cette emprise. Les plans sauvegardés sont recadrés à leur réouverture.
- Les fenêtres ajoutées sur la façade avant sont aimantées aux fenêtres générées par le moteur de façades pour le niveau sélectionné ; leur largeur, hauteur et allège proviennent des métadonnées de la baie.
- Le plan de découpe commence derrière l'épaisseur de façade (0,45 m) afin de conserver la peau extérieure réelle.
- **Comment tester sur iPhone (3 étapes)** :
  1. Ouvrir un immeuble de test dont les données IGN et les façades sont chargées, puis **Dessiner mon plan**.
  2. Essayer d'agrandir le contour au-delà des limites IGN ; vérifier qu'il reste contenu dans l'emprise.
  3. Ajouter une fenêtre sur la façade : elle doit se caler sur une baie réelle, puis revenir en vue Maquette et regarder depuis la rue.
- **Limites connues / non testé** : aucun test iPhone ni rendu depuis la rue n'a été exécuté. Les emprises très étroites ou concaves sont refusées si un rectangle intérieur sûr ne peut pas être calculé. Le choix explicite du nom de rue pour un immeuble d'angle n'est pas encore implémenté : la façade initiale reste celle retenue par la BAN/IGN.


## Phase 5.4 — collisions non traversables

- Chaque segment solide de collision transporte désormais l'épaisseur réelle du mur.
- La caméra est traitée comme une capsule de rayon 32 cm ; la collision teste la distance au segment augmentée de la demi-épaisseur du mur.
- Chaque déplacement est découpé en sous-pas de 5 cm. Au premier sous-pas invalide, la caméra revient à la dernière position valide et le mouvement s'arrête.
- Les ouvertures de portes restent des passages : seules les portions de mur pleines alimentent les segments de collision.
- **Comment tester sur iPhone (3 étapes)** :
  1. Entrer dans **Visite** dans un appartement avec plusieurs cloisons et portes.
  2. Pousser le joystick contre chaque mur, puis essayer de longer les angles et les encadrements.
  3. Essayer de traverser les portes : les murs doivent bloquer, les ouvertures de porte doivent rester franchissables.
- **Limites connues / non testé** : aucune session iPhone n'a été réalisée. Les collisions sont calculées sur les segments de murs fournis par le plan ; les meubles et objets décoratifs ne sont pas des obstacles. Le rayon caméra de 32 cm reste à valider en situation réelle.


## Phase 5.5 — Vérifier le soleil à l'heure affichée

- Un panneau **Détails** est accessible dans la vue 3D.
- Son bouton **Vérifier à l'heure affichée** reprend les cinq points de chaque vitre, le BVH des obstacles, les arbres et la transmission foliaire du calcul 4B.
- L'heure utilisée est exactement celle du panneau solaire (date + fraction entre lever et coucher, fuseau Europe/Paris). Une fenêtre est déclarée au soleil si plus de 20 % de ses cinq points reçoivent un rayon direct, comme le seuil d'affichage des périodes 4B.
- Le résultat indique pour chaque fenêtre oui/non et le pourcentage de vitre éclairée.
- **Comment tester sur iPhone (3 étapes)** :
  1. Entrer dans la vue 3D, choisir une date et une heure dans le panneau solaire.
  2. Ouvrir **Détails**, appuyer sur **Vérifier à l'heure affichée**.
  3. Comparer chaque « soleil : oui/non » aux taches visibles sur le sol à la même heure ; déplacer l'heure et relancer Vérifier.
- **Limites connues / non testé** : aucune comparaison iPhone n'a été exécutée. Le calcul est une estimation à cinq points par vitre ; les taches peuvent être plus fines que l'échantillonnage. Les données d'arbres peuvent manquer si le réseau Open Data est indisponible. La cohérence visuelle finale doit être validée sur Safari iOS.


## Retour iPhone — slider d'étage et fenêtres paramétriques

- Avant validation de l'adresse, le slider d'étage reste borné à 0–15. Après identification de l'immeuble, son maximum devient `niveaux IGN - 1` (RDC = 0). Le même slider du bandeau déplace la bande de façade sans rappeler le géocodage ni recharger le quartier.
- Le mode « toucher les fenêtres de façade » est supprimé. Les fenêtres côté rue sont générées depuis les paramètres utilisateur, pas depuis les baies décoratives du moteur de façades.
- Valeurs proposées : fenêtre 1,20 × 2,10 m, allège 0,90 m, mur de façade 0,35 m, plafond 2,80 m ; immeuble haussmannien : 2,40 m, allège 0,50 m, mur 0,50 m, plafond 3,00 m.
- Le formulaire accepte 1 à 8 fenêtres. Les paramètres communs sont appliqués à toutes ; **Personnaliser** ouvre des fiches repliées avec largeur, hauteur, allège et position (gauche, centre, droite ou distance depuis le bord gauche).
- Les réglages du mur de façade et du plafond sont aussi disponibles dans l'éditeur de plan. La feuille de chaque fenêtre permet de modifier largeur, hauteur, allège et position.
- Le calcul 4B commence sur le nu intérieur de la façade et vérifie que chaque rayon traverse l'embrasure complète. La hauteur effective d'une fenêtre est limitée à la hauteur sous plafond avec une garde de 18 cm ; un avertissement apparaît si les valeurs saisies dépassent cette limite.

### Comment tester sur iPhone

1. Saisir **38 rue Cler, Paris**, puis **Voir mon immeuble**. Vérifier que le slider passe de son maximum provisoire 15 au maximum `niveaux IGN - 1` et qu'il s'arrête au dernier étage publié par l'IGN. Dans le bandeau, faire glisser le slider : la bande d'étage doit se déplacer en direct, sans rechargement.
2. Garder une fenêtre identique, lancer **Calculer** avec un mur de façade de **0,30 m**, noter ses heures de soleil, puis passer à **0,70 m** et recalculer. Le résultat à 0,70 m doit être inférieur ou égal à celui à 0,30 m.
3. Ouvrir l'éditeur, sélectionner une fenêtre pour modifier ses dimensions/position, ouvrir **Réglages appartement** pour modifier l'épaisseur et la hauteur sous plafond, puis passer en 3D. Vérifier que les paramètres sont repris par la géométrie et le calcul.

### Test Node hors réseau

```sh
node --test appart-studio/phase4b.test.mjs
```

Le test ajouté compare la même ouverture et les mêmes échantillons solaires avec des embrasures de 0,30 m et 0,70 m ; il échoue si le mur de 0,70 m transmet davantage d'heures de soleil.

### Limites et validations restantes

- Le test Node est ajouté mais **n'a pas été exécuté dans cette session**.
- Le scénario iPhone du 38 rue Cler n'a pas été exécuté ici ; le nombre exact d'étages et le maximum affiché doivent être confirmés sur les données IGN effectivement renvoyées à l'adresse.
- Aucune capture d'écran ni résultat de calcul n'est revendiqué.
- Les données de nombre d'étages peuvent être estimées par `floorModel` si la donnée IGN est absente ; dans ce cas, le maximum n'est pas une valeur IGN garantie.
- Si la somme allège + hauteur dépasse le plafond moins 18 cm, la hauteur effective de l'ouverture est réduite pour que le calcul solaire et la 3D restent cohérents.
- Les résultats de soleil restent une simulation géométrique, hors météo et hors incertitudes des bâtiments voisins/arbres chargés.
- `sun.js`, `sun.test.mjs` et le mode drone restent hors modification.


## Lot 0 — fiabilité des contrôles tactiles iPhone

### Diagnostic du code

- **Calque caméra 3D** : `cam3.js` insère `#as3-touch` en plein écran avec `pointer-events:auto` et capture le pointeur sur ce calque. Avant ce correctif, sa priorité de peinture par rapport aux contrôles reposait sur l'ordre DOM, sans `z-index` explicite. La barre basse 3D était elle-même une grande zone `pointer-events:auto`. C'était le principal risque de capture d'un toucher destiné à un contrôle.
- **Écran de l'appartement** : `#as3-touch` est maintenant au niveau 0 ; les blocs d'interface haut et bas sont au niveau 2, le joystick au niveau 3 et les détails au niveau 4. Les conteneurs haut/bas ne capturent plus les gestes dans leurs espaces vides ; seuls leurs contrôles enfants reçoivent les événements.
- **Éditeur** : le pointeur est capturé uniquement par le canvas de dessin. La feuille de réglages passe au-dessus du canvas, avec son propre défilement et une hauteur maximale tenant compte des zones sûres. Les champs et boutons de la feuille ne sont donc pas sous le canvas.
- **Événements** : aucun `preventDefault()` global ni capture de pointeur sur un parent de formulaire n'a été trouvé. Le `preventDefault()` de l'éditeur est limité au canvas pendant le dessin ; `setPointerCapture()` est limité au canvas, au calque de caméra et au joystick.
- **Cibles tactiles** : boutons et champs ont une hauteur minimale de 44 px ; les sliders ont 44 px de hauteur. Les champs numériques demandent le clavier décimal iOS (`inputmode="decimal"`).
- **Défilement / safe area** : écran adresse, bandeau de paramètres et feuille d'éditeur ont un défilement tactile natif ; le bandeau et la feuille ont des limites de hauteur. Les positions haut/bas conservent les marges `safe-area-inset`.

### Test de hit-testing mobile

Le dépôt ne contient pas de dépendance Playwright, de configuration Playwright ou de manifeste npm à la racine. Un script navigateur de remplacement est ajouté : `appart-studio/touch-qa.js`.

1. Ouvrir la démo et afficher les contrôles de l'écran à tester.
2. Dans Chrome DevTools, activer l'émulation mobile **390 × 844** avec **hasTouch** activé ; ouvrir la console et exécuter le contenu de `appart-studio/touch-qa.js`.
3. Lire `[Appart Studio Touch QA]` : pour chaque contrôle visible, le script enregistre le centre, le résultat de `document.elementFromPoint(x, y)` et les cinq éléments de la pile. Il vérifie aussi les changements de valeur des sliders et champs numériques, des boutons − / + et de Personnaliser ; les valeurs modifiées sont restaurées.

**Résultat du test dans cette session : non exécuté.** Le script est livré, mais aucune mesure réelle `elementFromPoint` en viewport 390 × 844 n'est revendiquée. Le script utilise des événements DOM synthétiques pour les valeurs ; il ne remplace pas les vrais appuis du doigt sur Safari iOS.

### Contrôles inclus dans le diagnostic

- Sliders d'étage de l'écran adresse et du bandeau.
- Nombre de fenêtres (− / +), personnalisation.
- Largeur, hauteur, allège, épaisseur du mur, hauteur sous plafond et champs individuels des fenêtres.
- Boutons et champs visibles de l'éditeur (dont réglages appartement et feuille de fenêtre).
- Contrôles visibles de la vue 3D et du panneau soleil.

### Limites / non testé

- Pas de test manuel sur iPhone physique ni de capture d'écran.
- Pas de résultat de hit-test 390 × 844 disponible tant que le script n'a pas été exécuté dans un navigateur avec émulation tactile.
- Les événements synthétiques ne reproduisent pas toutes les particularités du moteur tactile de Safari iOS.
- Aucun changement de logique caméra ou du mode drone ; le correctif porte sur la superposition CSS et l'accessibilité des contrôles.
- `sun.js` et `sun.test.mjs` restent inchangés.
