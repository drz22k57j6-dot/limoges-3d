# Herbe et lumière de Larkhollow (v20)

Repris du jeu Larkhollow (copie de Sid), adapté à Limoges 3D :

- `herbe_lark.js` : brins d'herbe 3D instanciés en 4 anneaux autour de la caméra (jusqu'à 85 m, 55 m en qualité PERF), vent, rétro-éclairage, fleurs, ombres du soleil, la voiture couche l'herbe.
- `data/tex/herbe_masque.jpg` (outil `outils/herbe_masque.py`) : où pousse l'herbe, 2 m/pixel — BD ORTHO (couleur verte ou herbe sèche), LiDAR HD MNH (clairsemée sous les arbres), sans bâtiments, eau ni chaussée ; herbe courte en bord de route. Mesuré, pas inventé.
- `lumiere_lark.js` : ciel physique (diffusion Rayleigh/Mie, même modèle que Larkhollow), couleur du soleil = transmittance de l'atmosphère, lumière ambiante tirée du ciel, reflets (PMREM du ciel), tone mapping AgX avec le « look » et l'étalonnage de Larkhollow.

Retour arrière : revenir au commit précédent (v17).
