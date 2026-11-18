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
