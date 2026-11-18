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


## QA — emprise IGN et fenêtres réelles (PR dédiée)

### Comment tester sur iPhone
1. Ouvrir **38 rue Cler, 2e** : vérifier l'emprise grise, les côtés hachurés et les fenêtres en pointillé.
2. Tirer les poignées au-delà du polygone ; poser une fenêtre sur la façade et vérifier ses dimensions verrouillées.
3. Glisser le long de la façade, passer en Maquette et vérifier que le parement extérieur reste visible.

### Limites connues
- La contrainte échantillonne les côtés du contour rectangulaire ; les empreintes concaves complexes nécessitent un test manuel renforcé.
- Les travées sont disponibles uniquement si le moteur de façades a généré l'immeuble.
- Si le géocodeur inverse ne renvoie pas de nom de rue exploitable, la façade la plus proche de l'adresse BAN reste utilisée.
- La validation visuelle sur iPhone reste à effectuer.


## QA — BUG 3 : finitions 3D, fenêtres et collisions

### Comment tester sur iPhone
1. Ouvrir **38 rue Cler, 2e**, passer en Maquette et vérifier depuis la rue que seul le parement réel est visible, sans bord blanc de l'appartement.
2. Passer en Visite, toucher une fenêtre à faible allège : vérifier les deux battants, l'ouverture vers l'intérieur en 0,6 s, puis le garde-corps et son blocage ; répéter avec le bouton Ouvrir/Fermer en vue Fenêtres.
3. En Visite, pousser le joystick contre les quatre côtés d'une pièce, un angle, une cloison, un chambranle et une fenêtre pendant 2 minutes ; vérifier qu'aucune traversée n'est possible.

### Captures requises avant validation
- `captures/bug3-rue.png` — vue Maquette depuis la rue.
- `captures/bug3-fenetre-ouverte.png` — deux battants ouverts et garde-corps visible.
- `captures/bug3-collision-angle.png` — joueur arrêté à 30 cm d'un angle.

**État : captures iPhone physiques à joindre.** Aucune capture simulée n'est présentée comme preuve.

### Limites connues
- Les garde-corps réels sont identifiés à partir des travées et des niveaux de balcon exposés par le générateur ; les baies d'oriel ne disposent pas encore d'un attribut garde-corps dédié.
- Le fallback de collision des battants ouverts utilise leur boîte englobante monde, volontairement conservatrice.
- Le départ à plus de 0,5 m est garanti lorsque la pièce contient un point échantillonné avec ce dégagement ; les pièces plus étroites nécessitent un traitement spécifique.
- Le raycast du nu intérieur utilise un proxy de plan placé à la profondeur réelle publiée par le moteur de façades ; il ne mesure pas les irrégularités locales de moulures et d'oriels.
- Les tests de 2 minutes et les captures doivent être réalisés sur Safari iPhone physique avant fusion.
