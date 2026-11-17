# Boîte noire (diagnostic des crashs)

Fichiers : `commun/boite_noire.js`, `commun/version_moteur.js`, onglet ⚙ → **Crashs** (`drone/reglages.js`).

## Fonctionnement
- Une session n'est **jamais** considérée comme terminée proprement sans le bouton « Quitter proprement ».
  Au relancement, toute session non terminée est classée :
  - `crash` : dernier état connu au premier plan, sans `pagehide` → crash probable (cas typique iPhone) ;
  - `arriere` : interrompue en arrière-plan → iOS a pu libérer l'onglet, ou fermeture par l'utilisateur (indéterminable) ;
  - `quitte` : `pagehide` reçu (rechargement, navigation, fermeture d'onglet) → probablement volontaire ;
  - `gpu` : contexte WebGL perdu (le jeu recharge alors la page).
- Instantané toutes les 2 s : images/s, pire image, triangles et appels de l'image complète, compteurs three.js,
  mémoire séparée (voir ci-dessous), étapes en cours des moteurs, état des façades et du streaming.
- Pics : variation brutale entre deux instantanés (GPU estimé +40 Mo, JS +60 Mo, triangles ×1,8, image > 400 ms) ; maxima conservés.
- Étapes des moteurs avec durée : chargement des bâtiments (secteur), génération des façades, fusion des cellules (copie, paquets),
  déchargement, masquage / réaffichage des volumes IGN, chargement / déchargement des tuiles, chargement des textures,
  images de rendu lentes (> 150 ms). Une étape commencée et jamais finie reste « en cours » dans le rapport.
- Événements : erreurs JS, promesses rejetées, console.error/warn (répétitions regroupées), WebGL perdu / restauré, cycle de vie.
  Les événements critiques (WebGL, erreurs, pics) sont gardés à part et ne sont jamais chassés par un flot de messages.
- Sauvegarde double : localStorage (synchrone) + IndexedDB (écriture « strict », forcée sur disque). Au relancement, la copie la plus récente est utilisée.
- Version du moteur (`MOTEUR`) dans chaque session ; comparaison par version (sessions, crashs, durée médiane, GPU max médian) et historique des changements.

## Mémoire : mesuré ou estimé
| champ | nature |
|---|---|
| `js_mo` | **mesuré**, Chrome uniquement (`performance.memory`) ; **indisponible sur Safari** |
| `geo_mo` | **mesuré** : octets des tableaux de géométrie présents en mémoire JS |
| `tex_est_mo` | estimation : largeur × hauteur × 4 × 1,33 (mipmaps) |
| `rt_est_mo` | estimation : cibles de rendu (post-traitement, ombres, identifiants, mini-caméra) |
| `toile_est_mo` | estimation : tampons de l'écran |
| `gpu_est_mo` | somme estimée — **jamais une mesure de la VRAM réelle** (inaccessible depuis une page web) |

## Envoi des rapports
- Copier, Partager (feuille de partage iOS), Envoyer sur GitHub.
- GitHub : aucun jeton dans le jeu ; ouvre le formulaire d'issue pré-rempli avec le compte GitHub de l'utilisateur (connexion requise),
  après confirmation car l'issue est **publique**. Contenu : appareil (navigateur), position du drone, mémoire, étapes ; aucune donnée de compte.
  URL limitée à 7 600 caractères (rapport tronqué si besoin ; « Copier » donne le rapport complet). Les issues `[CRASH]` ne déclenchent aucun workflow.

## Tests réalisés (Chrome sans écran, profil persistant, `kill -9` du navigateur)
1. Premier plan + erreur JS + pic de texture 64 Mo + étape façades non terminée → `crash`, erreur, pics et étape « en cours » présents.
2. Passage en arrière-plan puis mort → `arriere`.
3. Navigation hors de la page → `quitte`.
4. « Quitter proprement » puis mort → aucun nouveau rapport.
5. Perte du contexte WebGL (WEBGL_lose_context) → rechargement automatique du jeu → `gpu`, diagnostic « contexte perdu ».
6. localStorage effacé et écritures bloquées → rapport relu depuis IndexedDB.

## Limites connues (Safari / iPhone)
- Un crash d'onglet iOS ne déclenche aucun événement : on ne voit que le **dernier instantané écrit** (≤ 2 s avant).
- Les écritures des toutes dernières secondes avant une mort brutale peuvent être perdues (constaté sous Chrome avec `kill -9` : jusqu'à ~2 s).
- Safari ne donne ni la mémoire JS, ni la mémoire GPU : seules des estimations sont possibles.
- iOS peut tuer un onglet en arrière-plan sans crash du jeu : classé `arriere`, cause indéterminable.
- Après un crash, Safari recharge parfois la page lui-même : la session peut alors apparaître `quitte`.
- Navigation privée / stockage plein : les sauvegardes peuvent échouer (le jeu continue).
- Safari efface le stockage d'un site non visité pendant 7 jours (ITP).
- Un crash pendant le rendu d'une image n'est pas « vu » en cours : seules les images lentes (> 150 ms) sont notées.
