# Mettre un GLB Meshy à l'échelle réelle

Petit outil de préparation des bâtiments de Paris 3D. Il ne reconstruit pas la géométrie : il mesure le GLB généré par Meshy, applique une échelle, pose le bâtiment au sol et exporte un nouveau GLB avec un rapport JSON.

## Convention des axes

- **X** = longueur de façade
- **Y** = hauteur (axe vertical, vers le haut)
- **Z** = profondeur
- Les dimensions saisies sont en **mètres**.
- Le bas du modèle est replacé à **Y = 0**.

> Important : un GLB ne contient pas toujours une unité physique fiable. L'outil considère ses coordonnées comme des unités arbitraires et les convertit vers les dimensions demandées.

## Utilisation avec Claude Code

1. Place le GLB téléchargé depuis Meshy dans le dépôt (ou indique son chemin local).
2. Ouvre Claude Code à la racine du dépôt.
3. Demande-lui d'exécuter la commande ci-dessous en remplaçant les chemins et mesures.
4. Récupère le fichier `*_real_scale.glb` et le rapport JSON.

Installation (une seule fois) :

```bash
python -m pip install -r tools/glb-scale/requirements.txt
```

Exemple :

```bash
python tools/glb-scale/scale_glb.py \
  assets/meshy/building.glb \
  assets/meshy/building_real_scale.glb \
  --length 42 --height 19 --depth 16 --mode exact
```

## Deux modes

### `--mode exact` (par défaut)
Force les trois dimensions exactement. Si le modèle Meshy a de mauvaises proportions, il sera étiré ou comprimé différemment sur chaque axe. À utiliser quand l'emprise et la hauteur doivent correspondre exactement aux mesures.

### `--mode uniform`
Conserve les proportions du modèle. Une seule dimension est garantie; les deux autres sont calculées proportionnellement. Choisir l'axe de référence :

```bash
--mode uniform --uniform-reference height
```

Valeurs possibles : `length`, `height`, `depth`.

## Contrôles et limites

- Le script vérifie que le fichier contient une scène 3D et que ses dimensions sont valides.
- Il réouvre le GLB exporté et inscrit les dimensions réellement obtenues dans un rapport JSON.
- Il ne peut pas deviner l'orientation réelle d'un GLB mal orienté. Avant le traitement, vérifier que X correspond à la longueur, Y à la hauteur et Z à la profondeur. Si Meshy produit un autre repère, il faut réorienter le modèle en amont ou ajouter une option d'orientation.
- Une seule photo ne suffit pas à reconstruire les façades cachées ni à garantir la géométrie réelle.
- La mise à l'échelle ne corrige pas les fenêtres, balcons, textures ou détails inventés par Meshy.

## Prompt à donner à Claude Code

« Utilise l'outil `tools/glb-scale/scale_glb.py` du dépôt. Identifie le GLB Meshy que je viens d'ajouter, confirme son orientation (X longueur, Y vertical, Z profondeur), puis demande-moi les dimensions réelles si elles ne sont pas déjà fournies. Exécute le mode uniform si je privilégie les proportions; utilise exact si je demande de respecter les trois dimensions. Ne remplace jamais le GLB original : crée un nouveau fichier suffixé `_real_scale.glb`. Lis le rapport JSON après export et vérifie les dimensions. Ne prétends pas que la reconstruction architecturale est exacte : cet outil corrige uniquement l'échelle et le niveau du sol. »

## Intégration dans Three.js

Le GLB exporté utilise Y comme axe vertical et son pied est à Y=0. Dans un projet Three.js configuré en Y-up, il peut être chargé directement. Vérifier néanmoins la convention d'axes et les unités de la scène avant de le positionner sur la carte.
