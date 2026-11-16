// Moteur de textures — module isolé, réutilisable par tous les jeux du projet (drone, à pied…).
// Il ne remplace pas les textures : il corrige ce qui trahit une image de synthèse.
//  1. répétition : la texture est lue avec un décalage qui change par zones (2 lectures fondues) → plus de motif en grille ;
//  2. nuances à grande échelle : taches et variations douces sur 10 à 50 m, calculées en coordonnées du monde ;
//  3. chaque bâtiment a sa teinte : légère variation par identifiant (_batchid des tuiles) ;
//  4. vieillissement : coulures verticales sur les murs, dessous et zones abritées plus sombres.
// Tout est calculé dans le shader : aucun fichier en plus, rien à précalculer, coût faible (1 lecture de bruit + 1 lecture de texture).
//
// Utilisation : import { createMoteurTextures } from './moteur_textures/moteur.js';
//   const MT = createMoteurTextures(THREE);
//   MT.appliquer(materiau, MT.PROFILS.facade);      // ou toit, monument, sol
//   MT.actif = false;                               // tout couper (ex. monde photo-réaliste)

export function createMoteurTextures(THREE) {
  // bruit de valeur lissé, répétable, 256×256 (R, G, B = trois bruits indépendants)
  const N = 256, data = new Uint8Array(N * N * 4);
  const grid = (cells, seed) => { const g = new Float32Array(cells * cells); let s = seed; for (let i = 0; i < g.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; g[i] = s / 4294967296; } return g; };
  const layers = [[8, 1], [16, 2], [32, 3], [8, 4], [16, 5], [64, 6], [4, 7], [16, 8], [32, 9]].map(([c, s]) => ({ c, g: grid(c, s * 7919) }));
  const sm = t => t * t * (3 - 2 * t);
  const sample = (L, x, y) => { const c = L.c, fx = x * c, fy = y * c, X = Math.floor(fx), Y = Math.floor(fy), tx = sm(fx - X), ty = sm(fy - Y), g = L.g, w = (a, b) => g[((b % c + c) % c) * c + ((a % c + c) % c)];
    return w(X, Y) * (1 - tx) * (1 - ty) + w(X + 1, Y) * tx * (1 - ty) + w(X, Y + 1) * (1 - tx) * ty + w(X + 1, Y + 1) * tx * ty; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = (y * N + x) * 4;
    data[i] = 255 * (0.5 * sample(layers[0], u, v) + 0.3 * sample(layers[1], u, v) + 0.2 * sample(layers[2], u, v));
    data[i + 1] = 255 * (0.5 * sample(layers[3], u, v) + 0.3 * sample(layers[4], u, v) + 0.2 * sample(layers[5], u, v));
    data[i + 2] = 255 * (0.6 * sample(layers[6], u, v) + 0.25 * sample(layers[7], u, v) + 0.15 * sample(layers[8], u, v));
    data[i + 3] = 255;
  }
  const bruit = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  bruit.wrapS = bruit.wrapT = THREE.RepeatWrapping; bruit.magFilter = THREE.LinearFilter; bruit.minFilter = THREE.LinearMipmapLinearFilter; bruit.generateMipmaps = true; bruit.needsUpdate = true;

  const reglages = { actif: true };
  const uActif = { value: 1 };
  // profils : anti = anti-répétition de la texture couleur ; macro = nuances à grande échelle ; teinte = variation par bâtiment ;
  // coulures = traînées verticales ; abri = dessous plus sombres ; echelle = taille des zones d'anti-répétition (en répétitions de texture)
  const PROFILS = {
    facade:   { anti: 0, macro: 0.12, teinte: 0.09, coulures: 0.10, abri: 0.25, echelle: 6 },
    toit:     { anti: 1, macro: 0.22, teinte: 0.06, coulures: 0.00, abri: 0.00, echelle: 5 },
    monument: { anti: 0, macro: 0.08, teinte: 0.00, coulures: 0.06, abri: 0.10, echelle: 6 },
    sol:      { anti: 1, macro: 0.12, teinte: 0.00, coulures: 0.00, abri: 0.00, echelle: 4 },
  };

  function appliquer(m, profil = PROFILS.facade) {
    if (!m || m.userData.moteurTextures) return m;
    const P = { ...profil }; m.userData.moteurTextures = P;
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
    const prevSrc = prev ? prev.toString() : '';
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(m, sh, r);
      sh.uniforms.mtBruit = { value: bruit }; sh.uniforms.mtActif = uActif;
      sh.uniforms.mtP = { value: new THREE.Vector4(P.macro, P.teinte, P.coulures, P.abri) };
      sh.vertexShader = 'attribute float _batchid;\nvarying vec3 vMtW;\nvarying vec3 vMtN;\nvarying float vMtId;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vec4 mtP4 = vec4(transformed, 1.0);
        vec3 mtN3 = objectNormal;
        #ifdef USE_INSTANCING
          mtP4 = instanceMatrix * mtP4; mtN3 = mat3(instanceMatrix) * mtN3;
        #endif
        vMtW = (modelMatrix * mtP4).xyz; vMtN = normalize(mat3(modelMatrix) * mtN3); vMtId = _batchid;`);
      let fs = 'uniform sampler2D mtBruit;\nuniform float mtActif;\nuniform vec4 mtP;\nvarying vec3 vMtW;\nvarying vec3 vMtN;\nvarying float vMtId;\n' + sh.fragmentShader;
      if (P.anti) fs = fs.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          // anti-répétition : l'index de zone vient d'un bruit lent ; deux décalages voisins fondus
          vec2 mtUv = vMapUv;
          float mtK = texture2D(mtBruit, mtUv / ${(+P.echelle).toFixed(2)}).b * 8.0 * mtActif;
          float mtI = floor(mtK), mtF = fract(mtK);
          vec2 mtOa = sin(vec2(3.0, 7.0) * mtI), mtOb = sin(vec2(3.0, 7.0) * (mtI + 1.0));
          vec2 mtDx = dFdx(mtUv), mtDy = dFdy(mtUv);
          vec4 mtCa = textureGrad(map, mtUv + mtOa, mtDx, mtDy), mtCb = textureGrad(map, mtUv + mtOb, mtDx, mtDy);
          vec4 sampledDiffuseColor = mix(mtCa, mtCb, smoothstep(0.2, 0.8, mtF - 0.1 * dot(mtCa.rgb - mtCb.rgb, vec3(1.0))));
          diffuseColor *= sampledDiffuseColor;
        #endif`);
      fs = fs.replace('#include <alphamap_fragment>', `
        if (mtActif > 0.5) {
          vec3 mtn = normalize(vMtN);
          vec2 mtq = abs(mtn.y) > 0.6 ? vMtW.xz : (abs(mtn.x) > abs(mtn.z) ? vec2(vMtW.z, vMtW.y) : vec2(vMtW.x, vMtW.y));
          float mtM = texture2D(mtBruit, mtq / 47.0).r * 0.6 + texture2D(mtBruit, mtq / 11.0 + 0.31).g * 0.4;
          float mtF = 1.0 + mtP.x * (mtM - 0.5) * 2.0;
          // teinte propre au bâtiment
          float mth = fract(sin(vMtId * 12.9898 + 4.1) * 43758.5453), mth2 = fract(sin(vMtId * 78.233 + 1.7) * 24634.6345);
          vec3 mtT = vec3(1.0) + mtP.y * vec3(mth - 0.5 + 0.25 * (mth2 - 0.5), mth - 0.5, mth - 0.5 - 0.25 * (mth2 - 0.5)) * 2.0;
          // coulures verticales (murs seulement) et dessous abrités
          float mtV = 1.0 - step(0.6, abs(mtn.y));
          float mtS = texture2D(mtBruit, vec2(mtq.x / 2.3, mtq.y / 60.0)).g;
          mtF *= 1.0 - mtP.z * mtV * smoothstep(0.52, 0.85, mtS);
          mtF *= 1.0 - mtP.w * smoothstep(-0.2, -0.6, mtn.y);
          diffuseColor.rgb *= mtF * mtT;
        }
        #include <alphamap_fragment>`);
      sh.fragmentShader = fs;
    };
    m.customProgramCacheKey = () => prevKey() + '|mt' + prevSrc.length + JSON.stringify(P);
    m.needsUpdate = true;
    return m;
  }
  return {
    PROFILS, appliquer, bruit,
    get reglages() { return reglages; },
    set actif(v) { reglages.actif = !!v; uActif.value = v ? 1 : 0; },
  };
}
