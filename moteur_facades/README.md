# Moteur de façades parisiennes

Générateur procédural d'immeubles parisiens en vrai relief, aux dimensions réelles :
trumeaux, fenêtres en creux (vantaux ouvrables, verre réfléchissant, rideaux, intérieur),
balcons filants en fonte, frontons, consoles, corniche à denticules, toit mansardé en zinc,
lucarnes, cheminées, antennes, descentes d'eau. Usure réglable 0 → 1 dans le shader.

- `facades.js` : `createKit(THREE, dossierTextures)` puis `buildBuilding(THREE, kit, options)`
  - `width` (m), `depth`, `seed`, `style` : `riche` (16e, bow-windows) · `classique` (7e) · `modeste` (19e, enduit + persiennes) · `moderne` (années 70)
  - `rdc` : `commerce` | `habitation` (sinon tiré au sort avec `pShop`), `wear` 0..1, `tone` (teinte de pierre), `pOpen` (fenêtres ouvertes)
- `apercu.html?c=7e|16e|19e&v=pieton|drone` : rue d'exemple de 150 m, deux côtés.
- `tex/` : pierre, zinc, enduit, béton (Poly Haven, CC0), 1k.

État : aperçu validé par Sid (16/11/2026). Pas encore branché sur les vrais immeubles du jeu.
Suite : lire emprises/hauteurs IGN + bord de trottoir du Plan de voirie (même base que `outils/voirie.py`), angles arrondis, quartier test = 7e.
