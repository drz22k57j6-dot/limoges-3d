// Le vrai Limoges comme niveau du moteur Saltline : relief LiDAR + orthophoto, bâtiments (3D Tiles), routes, arbres,
// bâtiments modélisés. Le joueur, les armes, les sons et l'interface sont ceux de Saltline.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createSaltlineRoads } from '../road_saltline.js';
import { createPlateauTrees } from '../plateau_trees.js';
import { createTeams } from './equipes.js';

const _ville = (() => { let v = new URLSearchParams(location.search).get('ville'); try { v = v || localStorage.getItem('ville'); } catch (e) {} return v; })();
const V = '?v=26', D = '../data/paris/'; void _ville;   // projet : Paris uniquement
const Q = Object.fromEntries(new URLSearchParams(location.search));
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); const tex = new THREE.TextureLoader();
const bin = async u => { const r = await fetch(D + u + V); if (!r.ok) throw new Error(u); return r.arrayBuffer(); };
const glb = async u => loader.parseAsync(await bin(u), '');
const say = (t, p) => { const m = document.getElementById('boot-msg'), f = document.getElementById('boot-fill'); if (m) m.textContent = t; if (f && p != null) f.style.width = Math.round(p * 100) + '%'; };

window.__LIMOGES_LEVEL = async function (G) {
  const scene = G.scene, root = new THREE.Group(); root.name = 'limoges'; scene.add(root);
  const phys = G.physics;
  say('Relief et murs de Limoges', 0.36);
  await phys.ready;
  say('Orthophoto et terrain', 0.42);
  const STREAM = phys.streamed, IDX = phys.index();
  const [gT, gO] = await Promise.all([STREAM ? null : glb('terrain.wasm'), (STREAM ? glb('objets_ville.wasm').catch(() => glb('objets.wasm')) : glb('objets.wasm')).catch(() => null)]);
  // terrain : photo aérienne IGN sur le relief LiDAR
  const prepTerrain = g => g.scene.traverse(o => {
    if (!o.isMesh) return; const old = o.material; o.geometry.computeVertexNormals();
    o.material = new THREE.MeshStandardMaterial({ map: old.map, roughness: 0.95, metalness: 0 }); o.material.color.setScalar(1.35);
    if (old.map) { old.map.colorSpace = THREE.SRGBColorSpace; old.map.anisotropy = 8; }
    o.receiveShadow = true; o.matrixAutoUpdate = false; o.updateMatrix();
  });
  if (gT) { prepTerrain(gT); root.add(gT.scene); }
  // matériaux des façades + eau (objets.wasm)
  const BMAT = {};
  if (gO) {
    gO.scene.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return; o.receiveShadow = o.castShadow = true;
      if (/^(bitume|marquage|trottoir)$/.test(o.material.name)) { o.visible = false; return; }
      const m = o.material; BMAT[m.name] = m; if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.map.anisotropy = 8; }
      const PBR = { toit_tuiles: 'tuiles', toit_ardoise: 'ardoise', toit_plat: 'toit_plat', facade_logements: 'enduit', facade_activites: 'enduit', mur_simple: 'enduit', facade_barre: 'enduit', facade_tour: 'enduit', pignon: 'enduit' }, tn = PBR[m.name];
      if (tn && !m.userData.pbr) { m.userData.pbr = 1; const ref = m.map, fix = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (ref) { t.offset.copy(ref.offset); t.repeat.copy(ref.repeat); t.rotation = ref.rotation; t.center.copy(ref.center); } return t; };
        m.normalMap = fix(tex.load('../data/tex/' + tn + '_n.jpg' + V)); m.normalScale.set(0.9, 0.9); m.roughnessMap = fix(tex.load('../data/tex/' + tn + '_r.jpg' + V)); m.needsUpdate = true; }
      if (o.material.name === 'eau') { o.material.color.set(0x2c4a46); o.material.roughness = 0.06; o.material.map = null; o.material.needsUpdate = true; }
    });
    root.add(gO.scene);
  }
  // routes (même asphalte Saltline que dans le jeu)
  say('Asphalte et peinture', 0.5);
  const SR = createSaltlineRoads(THREE);
  async function buildRoads(pre, has) {
    const opt = f => has(f) ? bin(pre + f).catch(() => null) : Promise.resolve(null);
    const [v3, ponts, deco, kerb, signs] = await Promise.all([opt('routes_v3.wasm'), opt('routes_ponts.wasm'), opt('routes_deco.wasm'), opt('routes_bordures.wasm'), has('signalisation.json') ? fetch(D + pre + 'signalisation.json' + V).then(r => r.ok ? r.json() : null).catch(() => null) : null]);
    return [].concat(v3 ? SR.buildV3(v3) : [], ponts ? SR.buildV3(ponts) : [], deco ? SR.buildDeco(deco) : [], signs && signs.length ? SR.buildSignals(signs) : [], kerb ? SR.buildKerbs(kerb) : []);
  }
  if (!STREAM) try { for (const m of await buildRoads('', () => true)) root.add(m); } catch (e) { console.warn('routes', e); }
  // arbres (niveau simplifié, instanciés par quartier)
  say('Arbres', 0.56);
  let P = null;
  function treeMeshes(buf) {
    const dv = new DataView(buf), n = dv.getUint32(0, true), out = [];
    const f = new Float32Array(buf.slice(4, 4 + n * 24)), c = new Uint8Array(buf.slice(4 + n * 24, 4 + n * 28));
    if (!P) { const sun = G.render.sun, sunDir = (G.render.sunDir || new THREE.Vector3(0.4, 0.8, 0.3)).clone();
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g2 = cv.getContext('2d'); g2.fillStyle = '#6f5d4a'; g2.fillRect(0, 0, 64, 128);
      P = createPlateauTrees(THREE, { sunDir, sunColor: sun ? sun.color : new THREE.Color(1, 1, 1), sunIntensity: () => (sun ? sun.intensity : 2), barkMap: new THREE.CanvasTexture(cv) }); G.__trees = P; }
    const KINDS = ['tree', 'pine', 'birch', 'sapling'], col = new THREE.Color(), hsl = {}, M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const x = f[6 * i], z = f[6 * i + 2], h = f[6 * i + 3], r = f[6 * i + 4];
      col.setRGB(c[4 * i] / 255, c[4 * i + 1] / 255, c[4 * i + 2] / 255, THREE.SRGBColorSpace); col.getHSL(hsl);
      const rr = Math.abs((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1);
      let k = 0; const gen = c[4 * i + 3];   // 255 = arbre LiDAR ; sinon genre de l'inventaire de la Ville de Paris (Pinus = 10)
      if (gen !== 255) k = gen === 10 ? 1 : h < 4.5 ? 3 : 0;
      else if (h < 4.5) k = 3; else if (hsl.l < 0.16 && hsl.h > 0.22 && h > 10 && rr < 0.35) k = 1; else if (h > 6 && h < 17 && rr < 0.16) k = 2;
      const Mo = P.models[KINDS[k]], s = Math.max(0.35, h / Mo.height), sx = s * THREE.MathUtils.clamp(r / (Mo.crown * s), 0.8, 1.3);
      q.setFromAxisAngle(Y, f[6 * i + 5]); M4.compose(pos.set(x, f[6 * i + 1] + 0.05, z), q, sc.set(sx, s, sx));
      col.setHSL(THREE.MathUtils.clamp(hsl.h, 0.17, 0.33), Math.min(1, hsl.s * 1.15 + 0.12), THREE.MathUtils.clamp(hsl.l * 1.35 + 0.05, 0.12, 0.42));
      const key = k + ':' + Math.floor(x / 400) + ':' + Math.floor(z / 400); let a = groups.get(key); if (!a) groups.set(key, a = { k, list: [] }); a.list.push([M4.clone(), col.clone()]);
    }
    for (const { k, list } of groups.values()) for (const part of P.models[KINDS[k]].lods[1].parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach(([m, cc], j) => { im.setMatrixAt(j, m); if (part.tint) im.setColorAt(j, cc); });
      im.castShadow = !!part.cast; im.receiveShadow = true; im.computeBoundingSphere(); out.push(im);
    }
    return out;
  }
  if (!STREAM) try { for (const m of treeMeshes(await bin('arbres.wasm'))) root.add(m); } catch (e) { console.warn('arbres', e); }
  // bâtiments : 3D Tiles (comme le jeu)
  say('Immeubles', 0.62);
  let tiles = null;
  try {
    const [{ TilesRenderer }, TP] = await Promise.all([import('https://cdn.jsdelivr.net/npm/3d-tiles-renderer@0.5.4/build/index.js'), import('https://cdn.jsdelivr.net/npm/3d-tiles-renderer@0.5.4/build/index.plugins.js')]);
    tiles = new TilesRenderer(D + 'tuiles/tileset.json' + V);
    tiles.registerPlugin(new TP.GLTFExtensionsPlugin({ meshoptDecoder: MeshoptDecoder }));
    tiles.errorTarget = 8; tiles.lruCache.minSize = 300; tiles.lruCache.maxSize = 900;
    const far = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    tiles.addEventListener('load-model', ({ scene: sc }) => sc.traverse(o => { if (!o.isMesh) return; const m = o.material.name === 'lointain' ? far : BMAT[o.material.name]; if (m) o.material = m; o.castShadow = o.receiveShadow = true; }));
    tiles.setCamera(G.camera); tiles.setResolutionFromRenderer(G.camera, G.renderer); root.add(tiles.group);
  } catch (e) { console.warn('tuiles', e); }
  // bâtiments modélisés un par un (tour Émile Kahn…)
  fetch(D + 'modeles/index.json' + V).then(r => r.ok ? r.json() : null).then(idx => { if (idx) for (const m of idx.modeles) loader.loadAsync(D + 'modeles/' + m.fichier + V).then(g => {
    const o = g.scene, bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const inner = new THREE.Group(); inner.add(o); o.position.set(-c.x, -bb.min.y, -c.z); inner.scale.set(m.longueur_m / sz.x, (m.toit_alt - m.sol_alt) / sz.y, m.largeur_m / sz.z);
    const r = new THREE.Group(); r.add(inner); r.rotation.y = THREE.MathUtils.degToRad(m.rotation_deg); r.position.set(m.centre_local[0], m.sol_alt - phys.H0(), m.centre_local[1]);
    o.traverse(n => { if (n.isMesh) n.castShadow = n.receiveShadow = true; }); root.add(r);
  }).catch(() => {}); }).catch(() => {});

  // départ : là où la voiture s'est arrêtée (?x=&z=&h=), sinon allée Le Gréco
  const x = +(Q.x ?? 3), z = +(Q.z ?? 1.6), h = +(Q.h ?? 0);
  // ville entière : secteurs de 1 km (murs, routes, arbres) et tuiles de terrain de 2 km autour du joueur
  const stream = STREAM ? (() => {
    const live = new Map(), terr = new Map(), RX = IDX.RX, RY = IDX.RY;
    let busy = false, last = '';
    const free = list => { for (const m of list) { root.remove(m); m.traverse(n => { if (n.isInstancedMesh) n.dispose(); else if (n.isMesh) { n.geometry.dispose(); for (const mt of [].concat(n.material)) if (mt !== SR.material) mt.dispose(); } }); } };
    async function sectorUp(k) {
      const S = await phys.loadSector(k); if (!S || live.has(k)) return;
      const ent = { meshes: [] }; live.set(k, ent);
      const info = IDX.secteurs[k], has = f => info.fichiers.includes(f);
      try { ent.meshes.push(...await buildRoads('secteurs/' + k + '/', has)); } catch (e) { console.warn('routes', k, e); }
      try { if (S.arbresBuf) ent.meshes.push(...treeMeshes(S.arbresBuf)); } catch (e) { console.warn('arbres', k, e); }
      if (!live.has(k)) { free(ent.meshes); return; }
      for (const m of ent.meshes) root.add(m);
    }
    async function terrainUp(k) {
      if (terr.has(k)) return; terr.set(k, null);
      try { const g = await glb('terrain/t_' + k + '.wasm'); prepTerrain(g); if (!terr.has(k)) return; terr.set(k, g.scene); root.add(g.scene); } catch (e) { terr.delete(k); }
    }
    async function update(px, pz, R = 1) {
      const si = Math.floor((px + RX) / 1000), sj = Math.floor((-pz + RY) / 1000), id = si + '_' + sj + ':' + R;
      if (busy || id === last) return; busy = true; last = id;
      try {
        const want = new Set(), wantT = new Set();
        for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { const k = (si + a) + '_' + (sj + b); if (IDX.secteurs[k]) want.add(k); }
        // tuiles de terrain : celles qui touchent un rayon de 1,2 km
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ti = Math.floor((px + RX + a * 1200) / 2000), tj = Math.floor((-pz + RY + b * 1200) / 2000); wantT.add(ti + '_' + tj); }
        for (const [k, ent] of live) if (!want.has(k)) { const [i, j] = k.split('_').map(Number); if (Math.max(Math.abs(i - si), Math.abs(j - sj)) > R + 1) { free(ent.meshes); live.delete(k); phys.dropSector(k); } }
        for (const [k, sc] of terr) if (!wantT.has(k)) { if (sc) free([sc]); terr.delete(k); }
        const near = [...want].sort((p, q) => { const d = k => { const [i, j] = k.split('_').map(Number); return Math.hypot(i - si, j - sj); }; return d(p) - d(q); });
        await Promise.all([...wantT].map(terrainUp));
        for (const k of near) await sectorUp(k);
      } finally { busy = false; }
    }
    return { update, live, terr };
  })() : null;
  if (stream) { say('Quartier autour de vous', 0.66); await stream.update(x, z); }
  const start = new THREE.Vector3(x, phys.surface(x, z) + 0.02, z);
  G.camera.far = 3000; G.camera.updateProjectionMatrix();
  const sunOff = new THREE.Vector3(); let tmp = new THREE.Vector3(), teams = null;
  const level = {
    root, playerStart: { pos: start, yaw: h + Math.PI }, objectives: [], enemySpawns: [], zones: [], interiorBoxes: [], coverPoints: [], explosives: [], skylights: [],
    cinematicPath: [{ pos: [x - 40, start.y + 30, z + 40], look: [x, start.y + 2, z] }, { pos: [x + 40, start.y + 18, z + 30], look: [x, start.y + 2, z] }],
    extraction: { pos: new THREE.Vector3(1e6, -1e4, 1e6), radius: 1 },
    groundSurfaceAt: () => 'concrete',
    update(dt) {
      const cam = G.camera; cam.updateMatrixWorld();
      if (tiles) { tiles.setResolutionFromRenderer(cam, G.renderer); tiles.update(); }
      // match Bleu contre Rouge (sauf ?mode=libre) : démarre quand le joueur est posé dans la ville
      if (!teams && Q.mode !== 'libre' && G.player && G.player.pos && G.enemies && G.props && G.player.pos.lengthSq() > 0) { try { teams = createTeams(G, phys, root, { parEquipe: +(Q.equipe || 10) }); window.__TEAMS = teams; } catch (e) { console.warn('équipes', e); teams = false; } }
      if (teams) teams.update(dt);
      if (stream) { const p = G.player && G.player.pos ? G.player.pos : cam.position; stream.update(p.x, p.z, window.__AP && window.__AP.SET.qual >= 2 ? 2 : 1); }
      if (G.__trees && G.__trees.WIND) G.__trees.WIND.time.value += dt;
      // l'ombre du soleil suit le joueur (le port tenait dans une seule boîte)
      const sun = G.render.sun; if (sun && sun.shadow) {
        const p = G.player && G.player.pos ? G.player.pos : cam.position, dir = G.render.sunDir || tmp.set(0.4, 0.8, 0.3).normalize();
        sunOff.copy(dir).normalize().multiplyScalar(220); sun.position.copy(p).add(sunOff); sun.target.position.copy(p); sun.target.updateMatrixWorld();
        const sc = sun.shadow.camera; if (sc.right !== 70) { sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 520; sc.updateProjectionMatrix(); }
      }
    },
  };
  const sun = G.render.sun, base = { sun: sun ? sun.intensity : 1, env: G.scene.environmentIntensity ?? 1 };
  const SET = Object.assign({ soleil: 0.6, lum: 0.85, qual: 1 }, JSON.parse(localStorage.getItem('apied_reglages') || '{}'));
  window.__AP = {
    SET, apply() {
      if (sun) sun.intensity = base.sun * SET.soleil;
      G.scene.environmentIntensity = base.env * (0.5 + 0.5 * SET.soleil);
      G.render.exposure = SET.lum;
      if (tiles) { tiles.errorTarget = [10, 6, 3, 1.5][SET.qual]; tiles.lruCache.minSize = [200, 300, 600, 900][SET.qual]; tiles.lruCache.maxSize = [600, 900, 1600, 2400][SET.qual]; }
      localStorage.setItem('apied_reglages', JSON.stringify(SET));
    },
  };
  window.__AP.apply();
  say('Prêt', 0.7);
  return level;
};
