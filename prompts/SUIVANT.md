# Tâche suivante (à lancer APRÈS prompts/A_FAIRE.md — bug d'emprise corrigé)

Repo drz22k57j6-dot/limoges-3d. Règles : ne pas modifier `appart-studio/sun.js` ni `sun.test.mjs`, ne pas toucher au mode drone, une PR par étape, dire ce qui n'a pas été testé.

## Nouveau parcours Appart Studio (refonte de l'entrée)

### Étape A — Trouver son immeuble sur une carte photoréaliste
- Écran d'accueil : vue 3D photoréaliste (Google Photorealistic 3D Tiles via Cesium ion — compte existant ; clé à lire depuis les Réglages, jamais en dur dans le code) + barre de recherche d'adresse (autocomplétion Géoplateforme existante).
- Après recherche : la caméra vole jusqu'à l'adresse ; l'utilisateur peut aussi toucher un immeuble. Surligner le bâtiment IGN correspondant (emprise projetée au sol) et demander « C'est bien cet immeuble ? ». Si plusieurs bâtiments IGN pour l'adresse : choix A / B.
- Puis toucher la façade de son logement (côté rue / côté cour / autre rue pour un angle).
- Ce mode sert UNIQUEMENT à la sélection : aucune simulation de soleil sur le photoréaliste (ombres déjà dans les photos). Vérifier et résumer dans la PR les conditions d'utilisation de Google Map Tiles (attribution, cache, quota, coût) et ce qu'elles autorisent ; ne rien extraire de leur géométrie.
- Si la clé ou le quota manque : repli automatique sur la vue actuelle (moteur IGN).

### Étape B — Choisir l'étage
- Le slider d'étage (PR #20) s'affiche sur la vue photoréaliste, la bande d'étage surlignée sur la façade choisie.

### Étape C — On est déjà dans l'appartement
- Validation de l'étage → transition vers le moteur IGN (le nôtre) et ouverture DIRECTE en vue 1re personne, face à la fenêtre principale, soleil réel à l'heure actuelle.
- Appartement standard généré automatiquement, dans l'emprise : profondeur = min(8 m, profondeur disponible), largeur = travée(s) de la façade choisie, un séjour côté façade, fenêtres placées automatiquement sur les travées de l'étage (ou paramètres par défaut si pas de travées), épaisseur de mur et hauteur sous plafond selon le type d'immeuble.
- Bouton « Modifier mon appartement » → éditeur de plan (existant) + paramètres des fenêtres (PR #20). Les modifications reconstruisent la 3D sur place.

### Étape D — Rapports (plus tard, ne pas faire maintenant)

## Critère de réussite
De la recherche d'adresse à « je suis dans l'appartement face à ma fenêtre » : moins de 60 s et 4 touchers maximum, sur iPhone.

 
## Statut (18/11/2026)

- [ ] Étape A — PR : https://github.com/drz22k57j6-dot/limoges-3d/pull/24 · entrée photo translucide, jeton Cesium ion dans Réglages, repli IGN sans clé/si échec, attributions dynamiques, candidats IGN A/B et confirmation. Restent le toucher direct du bâtiment et le choix interactif de façade rue/cour/autre rue. Aucun essai navigateur/iPhone.
- [ ] Étape B — PR : https://github.com/drz22k57j6-dot/limoges-3d/pull/25 · slider après confirmation et transformation de la bande sans reconstruire sa géométrie. Rendu tactile réel et Safari iPhone non testés.
- [ ] Étape C — PR : https://github.com/drz22k57j6-dot/limoges-3d/pull/26 · plan standard automatique, profondeur plafonnée à min(8 m, disponible), fenêtres estimées sur travées régulières, passage à la ville IGN, ouverture en première personne face à la fenêtre centrale et soleil à l'heure actuelle de Paris. La trame de travées reste approximative ; génération 3D et vue réelle non testées.
- [ ] Étape D — non commencée, hors périmètre demandé.
- [ ] Non testé globalement : suite `node --test`, navigateur réel, iPhone Safari, clés/quota Cesium, captures et recette sur adresses réelles.
