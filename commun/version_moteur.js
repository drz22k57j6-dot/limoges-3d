// Identifiant de version du moteur + historique des changements (pour comparer les crashs avant / après chaque optimisation).
// Règle : chaque changement qui touche la mémoire, le rendu ou le streaming ajoute une entrée EN TÊTE et change MOTEUR.
export const MOTEUR = 'M-2026.11.17-c';
export const HISTORIQUE = [
  { v: 'M-2026.11.17-c', date: '2026-11-17', changements: ['Correction : le terrain chargé après l\'écran de démarrage échouait (barre de progression supprimée) → sol bleu dans le 7e ; le streaming abandonne l\'ancienne zone après une téléportation', 'Identifiants IGN masqués à l\'écran par défaut (toujours calculés)', 'Boîte noire v2 : sessions jamais considérées propres sans fin explicite, mémoire séparée (JS / géométries / textures / cibles de rendu / estimation GPU), pics et maxima, étapes des moteurs avec durées, double sauvegarde localStorage + IndexedDB, version du moteur dans chaque rapport, partage iOS + GitHub sécurisé'] },
  { v: 'M-2026.11.17-b', date: '2026-11-17', changements: ['Téléphone : façades détaillées jusqu\'à 70 m (détail complet 30 m), textures dessinées à mi-résolution, façades sans ombres, rayon réduit automatiquement si ça rame', 'Boîte noire v1'] },
  { v: 'M-2026.11.17-a', date: '2026-11-17', changements: ['Moteur de façades sur les vrais bâtiments du 7e (2 922 bâtiments, 2 000 commerces), deux niveaux de détail, fusion par cellule de 64 m, masquage réversible des volumes IGN', 'Garde-corps en texture ajourée, plaques en atlas, teintes en couleur de sommet'] },
];
