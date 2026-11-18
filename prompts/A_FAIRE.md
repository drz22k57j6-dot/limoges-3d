# Tâche en cours pour ChatGPT / Codex

> Fichier écrit par Claude. Exécuter la tâche ci-dessous, puis mettre à jour la section « Statut » en bas de ce fichier dans la PR.

Repo drz22k57j6-dot/limoges-3d, base : `feat/appart-studio-phase5-5-sun-verify`. Règles : ne pas modifier `appart-studio/sun.js` ni `sun.test.mjs`, ne pas toucher au mode drone, une PR, dire ce qui n'a pas été testé, aucune capture inventée.

## 1. Sélection de l'étage : slider jusqu'au vrai nombre d'étages
- Écran adresse : remplacer les boutons RDC…15 par un slider large RDC → dernier étage. Max = niveaux IGN hors-sol − 1 (RDC compris dans les niveaux). Avant validation de l'adresse : max 15.
- Après « Voir mon immeuble », le même slider reste dans le bandeau du bas : le glisser déplace la bande d'étage sur la façade en direct, sans rechargement.
- Afficher en grand « 4e étage / 6 ».

## 2. Retirer « toucher ses fenêtres » → paramètres simples
Les fenêtres générées ne correspondent pas aux vraies : le mode express par toucher est supprimé. À la place, un formulaire court :
- Nombre de fenêtres côté rue (1 à 8, − / +).
- Par fenêtre (mêmes valeurs pour toutes, sauf « Personnaliser ») : largeur (1,20 m), hauteur (2,10 m ; 2,40 m si haussmannien), allège = hauteur du bas de la fenêtre au-dessus du sol (0,90 m ; 0,50 m si haussmannien), position le long de la façade (gauche / centre / droite ou distance en m depuis le bord gauche).
- Épaisseur du mur de façade (0,50 m si haussmannien, sinon 0,35 m). Dans le calcul 4B, le rayon doit traverser l'embrasure sur toute l'épaisseur du mur (un mur épais coupe le soleil rasant).
- Hauteur sous plafond (2,80 m ; 3,00 m si haussmannien).
- Mêmes paramètres éditables dans l'éditeur de plan, utilisés par la 3D et par le calcul.
- Bouton « Calculer » → résultats par fenêtre + score.

## Tests à décrire dans la PR
- 38 rue Cler : le slider s'arrête au dernier étage IGN.
- Même fenêtre, mur de 0,30 m puis 0,70 m : le mur épais donne moins ou autant d'heures, jamais plus. Ajouter ce cas au test node hors réseau.

## Statut
- [ ] PR créée : (lien)
- [ ] Non testé : (liste)
