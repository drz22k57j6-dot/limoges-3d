# Identité réelle des bâtiments (v21)

`data/identite_batiments.json` (outil `outils/identite.py`), une entrée par bâtiment IGN (identifiant `cleabs`, stable) :

- **Adresses officielles** — IGN BAN PLUS : lien officiel adresse ↔ bâtiment, sinon point d'adresse dans le bâtiment, sinon bâtiment le plus proche à moins de 8 m (marqué « à vérifier »). 25 700 bâtiments ont au moins une adresse.
- **Établissements** (commerces, restaurants, écoles, médecins, entreprises…) — Overture Maps (OpenStreetMap, Meta, Microsoft, Foursquare, BrightQuery) : nom, catégorie, marque, site, indice de confiance, source. Rattachés au bâtiment si le point est dedans, ou si leur adresse est l'adresse officielle du bâtiment, sinon au plus proche à moins de 12 m (« à vérifier »). 3 190 bâtiments ont au moins un établissement ; les établissements fermés sont exclus.
- **Zones** (école, stade, hôpital…) — IGN BD TOPO zones d'activité ou d'intérêt, avec leur nom.
- **Fonction** — usage IGN ; « mixte » seulement si un commerce avec vitrine est déclaré dans un immeuble d'habitation ; sinon « inconnu » ou « à vérifier ». Rien n'est inventé.

La fiche (appui long 3 s) affiche ces données. Les établissements viennent de bases déclaratives : ils ne sont pas vérifiés sur place.
Licences : Licence Ouverte 2.0 (IGN), CDLA-Permissive-2.0 / ODbL (Overture, © contributeurs OpenStreetMap).
