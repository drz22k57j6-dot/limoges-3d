# Recette iPhone — Appart Studio phase 1

À effectuer sur iPhone Safari après déploiement de la branche de PR.

| # | Adresse | Étage | ID IGN | Hauteur calculée | Capture repère |
|---|---|---:|---|---:|---|
| 1 | 10 rue de Rivoli, 75004 Paris | 4 | À exécuter | À exécuter | À joindre |
| 2 | 1 boulevard Voltaire, 75011 Paris (angle) | 2 | À exécuter | À exécuter | À joindre |
| 3 | 15 rue des Écouffes, 75004 Paris | 1 | À exécuter | À exécuter | À joindre |
| 4 | 10 avenue Victor-Hugo, 75016 Paris | 5 | À exécuter | À exécuter | À joindre |
| 5 | 8 avenue de France, 75013 Paris | 10 | À exécuter | À exécuter | À joindre |

**Critères de réussite :** géocodage exact, rattachement BAN exact (ou secours clairement signalé), polygone BD TOPO présent, façade sélectionnée, repère rouge visible au bon étage, ±10 cm sans rechargement. Ne pas marquer cette recette comme validée tant que les cinq captures réelles n'ont pas été ajoutées.


## QA — correctif mémoire iPhone (PR séparée)

### Comment tester sur iPhone
1. Ouvrir Appart Studio au 38 rue Cler, 2e, dessiner un plan fermé et passer en 3D.
2. Alterner 10 fois **Maquette → Visite → Fenêtres**, en vérifiant que Safari conserve l'onglet et que les fenêtres restent accessibles.
3. Revenir à l'écran de l'immeuble, ouvrir **Détails** et comparer les compteurs WebGL : le nombre de programmes doit rester stable après le premier passage.

### Limites connues
- Les tuiles de bâtiments qui exposent `userData.ids` sont ciblées par identifiant IGN. Les meshes sans table d'identifiants utilisent l'intersection de leur bounding box avec la boîte locale ; un mesh agrégé sans identifiant peut donc inclure d'autres volumes proches.
- Le contrôle de stabilité GPU doit être confirmé sur un vrai iPhone Safari ; les tests automatisés du dépôt ne remplacent pas un essai sur appareil.
- La fusion est effectuée par matériau et type de plafond ; si deux géométries ne sont pas compatibles, elles restent séparées.
