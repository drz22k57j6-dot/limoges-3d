// Le vrai Limoges comme niveau du moteur Saltline : relief LiDAR + orthophoto, bâtiments (3D Tiles), routes, arbres,
// bâtiments modélisés. Le joueur, les armes, les sons et l'interface sont ceux de Saltline.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createSaltlineRoads } from '../road_saltline.js';
import { createPlateauTrees } from '../plateau_trees.js';

const V = '?v=22', D = '../data/';
const Q = Object.fromEntries(new URLSearchParams(location.search));
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const bin = async u => { const r = await fetch(D + u + V); if (!r.ok) throw new Error(u); return r.arrayBuffer(); };
const glb = async u => loader.parseAsync(await bin(u), '');
const say = (t, p) => { const m = document.getElementById('boot-msg'), f = document.getElementById('boot-fill'); if (m) m.textContent = t; if (f && p != null) f.style.width = Math.round(p * 100) + '%'; };

window.__LIMOGES_LEVEL = async function (G) {
  const scene = G.scene, root = new THREE.Group(); root.name = 'limoges'; scene.add(root);
  const phys = G.physics;
  say('Relief et murs de Limoges', 0.36);
  await phys.ready;
  say('Orthophoto et terrain', 0.42);
  const [gT, gO] = await Promise.all([glb('terrain.wasm'), glb('objets.wasm').catch(() => null)]);
  // terrain : photo aérienne IGN sur le relief LiDAR
  gT.scene.traverse(o => {
    if (!o.isMesh) return; const old = o.material; o.geometry.computeVertexNormals();
    o.material = new THREE.MeshStandardMaterial({ map: old.map, roughness: 0.95, metalness: 0 }); o.material.color.setScalar(1.35);
    if (old.map) { old.map.colorSpace = THREE.SRGBColorSpace; old.map.anisotropy = 8; }
    o.receiveShadow = true; o.matrixAutoUpdate = false; o.updateMatrix();
  });
  root.add(gT.scene);
  // matériaux des façades + eau (objets.wasm)
  const BMAT = {};
  if (gO) {
    gO.scene.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return; o.receiveShadow = o.castShadow = true;
      if (/^(bitume|marquage|trottoir)$/.test(o.material.name)) { o.visible = false; return; }
      BMAT[o.material.name] = o.material; if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
      if (o.material.name === 'eau') { o.material.color.set(0x2c4a46); o.material.roughness = 0.06; o.material.map = null; o.material.needsUpdate = true; }
    });
    root.add(gO.scene);
  }
  // routes (même asphalte Saltline que dans le jeu)
  say('Asphalte et peinture', 0.5);
  try {
    const [v3, ponts, deco, kerb, signs] = await Promise.all([bin('routes_v3.wasm'), bin('routes_ponts.wasm').catch(() => null), bin('routes_deco.wasm').catch(() => null), bin('routes_bordures.wasm').catch(() => null), fetch(D + 'signalisation.json' + V).then(r => r.ok ? r.json() : null).catch(() => null)]);
    const SR = createSaltlineRoads(THREE);
    const ms = SR.buildV3(v3).concat(ponts ? SR.buildV3(ponts) : [], deco ? SR.buildDeco(deco) : [], signs ? SR.buildSignals(signs) : [], SR.buildKerbs(kerb));
    for (const m of ms) root.add(m);
  } catch (e) { console.warn('routes', e); }
  // arbres (niveau simplifié, instanciés par quartier)
  say('Arbres', 0.56);
  try {
    const buf = await bin('arbres.wasm'), dv = new DataView(buf), n = dv.getUint32(0, true);
    const f = new Float32Array(buf.slice(4, 4 + n * 24)), c = new Uint8Array(buf.slice(4 + n * 24, 4 + n * 28));
    const sun = G.render.sun, sunDir = (G.render.sunDir || new THREE.Vector3(0.4, 0.8, 0.3)).clone();
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g2 = cv.getContext('2d'); g2.fillStyle = '#6f5d4a'; g2.fillRect(0, 0, 64, 128);
    const P = createPlateauTrees(THREE, { sunDir, sunColor: sun ? sun.color : new THREE.Color(1, 1, 1), sunIntensity: () => (sun ? sun.intensity : 2), barkMap: new THREE.CanvasTexture(cv) });
    const KINDS = ['tree', 'pine', 'birch', 'sapling'], col = new THREE.Color(), hsl = {}, M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const x = f[6 * i], z = f[6 * i + 2], h = f[6 * i + 3], r = f[6 * i + 4];
      col.setRGB(c[4 * i] / 255, c[4 * i + 1] / 255, c[4 * i + 2] / 255, THREE.SRGBColorSpace); col.getHSL(hsl);
      const rr = Math.abs((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1);
      let k = 0; if (h < 4.5) k = 3; else if (hsl.l < 0.16 && hsl.h > 0.22 && h > 10 && rr < 0.35) k = 1; else if (h > 6 && h < 17 && rr < 0.16) k = 2;
      const Mo = P.models[KINDS[k]], s = Math.max(0.35, h / Mo.height), sx = s * THREE.MathUtils.clamp(r / (Mo.crown * s), 0.8, 1.3);
      q.setFromAxisAngle(Y, f[6 * i + 5]); M4.compose(pos.set(x, f[6 * i + 1] + 0.05, z), q, sc.set(sx, s, sx));
      col.setHSL(THREE.MathUtils.clamp(hsl.h, 0.17, 0.33), Math.min(1, hsl.s * 1.15 + 0.12), THREE.MathUtils.clamp(hsl.l * 1.35 + 0.05, 0.12, 0.42));
      const key = k + ':' + Math.floor(x / 400) + ':' + Math.floor(z / 400); let a = groups.get(key); if (!a) groups.set(key, a = { k, list: [] }); a.list.push([M4.clone(), col.clone()]);
    }
    for (const { k, list } of groups.values()) for (const part of P.models[KINDS[k]].lods[1].parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach(([m, cc], j) => { im.setMatrixAt(j, m); if (part.tint) im.setColorAt(j, cc); });
      im.castShadow = !!part.cast; im.receiveShadow = true; im.computeBoundingSphere(); root.add(im);
    }
    G.__trees = P;
  } catch (e) { console.warn('arbres', e); }
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
  const start = new THREE.Vector3(x, phys.surface(x, z) + 0.02, z);
  G.camera.far = 3000; G.camera.updateProjectionMatrix();
  const sunOff = new THREE.Vector3(); let tmp = new THREE.Vector3();
  const level = {
    root, playerStart: { pos: start, yaw: h + Math.PI }, objectives: [], enemySpawns: [], zones: [], interiorBoxes: [], coverPoints: [], explosives: [], skylights: [],
    cinematicPath: [{ pos: [x - 40, start.y + 30, z + 40], look: [x, start.y + 2, z] }, { pos: [x + 40, start.y + 18, z + 30], look: [x, start.y + 2, z] }],
    extraction: { pos: new THREE.Vector3(1e6, -1e4, 1e6), radius: 1 },
    groundSurfaceAt: () => 'concrete',
    update(dt) {
      const cam = G.camera; cam.updateMatrixWorld();
      if (tiles) { tiles.setResolutionFromRenderer(cam, G.renderer); tiles.update(); }
      if (G.__trees && G.__trees.WIND) G.__trees.WIND.time.value += dt;
      // l'ombre du soleil suit le joueur (le port tenait dans une seule boîte)
      const sun = G.render.sun; if (sun && sun.shadow) {
        const p = G.player && G.player.pos ? G.player.pos : cam.position, dir = G.render.sunDir || tmp.set(0.4, 0.8, 0.3).normalize();
        sunOff.copy(dir).normalize().multiplyScalar(220); sun.position.copy(p).add(sunOff); sun.target.position.copy(p); sun.target.updateMatrixWorld();
        const sc = sun.shadow.camera; if (sc.right !== 70) { sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 520; sc.updateProjectionMatrix(); }
      }
    },
  };
  say('Prêt', 0.7);
  return level;
};
