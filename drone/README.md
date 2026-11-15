# Paris Drone Capture

Page : https://drz22k57j6-dot.github.io/limoges-3d/drone/

## Ce que fait cette première version
- Charge les bâtiments autour d'une adresse parisienne depuis le WFS IGN BD TOPO V3.
- Affiche chaque emprise en volume 3D simplifié.
- Au toucher d'un bâtiment, affiche son identifiant IGN `cleabs` et son ID-RNB `identifiant_rnb` lorsqu'il est renseigné.
- Permet une orbite automatique ou un pilotage de caméra par glissement tactile.
- Enregistre le canvas 3D en vidéo (MediaRecorder, 30 images/s) et exporte une fiche JSON avec identifiants, géométrie et métadonnées de source.

## Identifiants à conserver
- `cleabs` : identifiant technique stable du bâtiment dans la BD TOPO IGN.
- `identifiant_rnb` : ID-RNB national quand la correspondance existe. Il n'est pas encore renseigné pour absolument tous les bâtiments BD TOPO.
- Les fichiers `data/paris/identite/*.json` du projet sont indexés par `cleabs` et enrichissent les bâtiments avec les adresses officielles BAN PLUS, les zones IGN et les établissements Overture Maps.

## Sources et licences
- Géométries et attributs bâtimentaires : IGN BD TOPO V3, Licence Ouverte 2.0.
- Référentiel National des Bâtiments : ID-RNB, référentiel public national.
- Le RNB et la BD TOPO ne découpent pas toujours les bâtiments de façon identique ; un bâtiment BD TOPO peut donc ne pas avoir de correspondance ID-RNB unique.

## Limites importantes
Cette page est un outil de repérage et de capture vidéo d'une maquette volumétrique simplifiée. **La vidéo enregistrée n'est pas une prise de vue photographique réelle** : les façades, fenêtres, matériaux et détails architecturaux ne sont pas reconstruits fidèlement dans cette version. Elle sert à repérer/identifier les bâtiments, préparer les parcours caméra et archiver les identifiants. Pour reconstruire des façades réelles, il faut ensuite associer des photos réelles autorisées (par exemple Panoramax ou des prises de vue personnelles), bâtiment par bâtiment.

La page est optimisée pour les navigateurs récents. Sur iPhone, le comportement d'enregistrement et l'enregistrement du fichier dépendent des capacités de Safari/iOS ; après l'arrêt, toucher le lien de vidéo qui apparaît.
