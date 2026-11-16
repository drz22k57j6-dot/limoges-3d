// Système routier éditable — Limoges 3D (cahier des charges v1).
// Modèle : routes IGN/OSM du jeu (axes) + graphe routier + modifications (officielles + locales).
// Rendu : les anciennes surfaces sont masquées (shader) sous chaque modification, la nouvelle route est régénérée.
// Logique : sens, voies, panneaux avec effet, contrôles de cohérence. Contributions : issues GitHub [ROUTE] + vote.
import * as THREE from 'three';

const ready = () => new Promise(r => { const f = () => (window.__dbg && window.__SR && window.__groundH && window.__roadsReady) ? r() : setTimeout(f, 400); f(); });
await ready();
const { scene, renderer, camera } = window.__dbg; const SR = window.__SR; const groundH = window.__groundH;
const REPO = 'drz22k57j6-dot/limoges-3d', OWNER = 'drz22k57j6-dot', V = '?v=17';
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- données
const [axBuf, graph, NAMES] = await Promise.all([
  fetch((window.CITY ? CITY.data : 'data/') + 'routes_axes.wasm' + V).then(r => r.ok ? r.arrayBuffer() : new ArrayBuffer(8)),   // Paris entier : axes par secteurs, éditeur inactif
  fetch((window.CITY ? CITY.data : 'data/') + 'graphe_routier.json' + V).then(r => r.json()).catch(() => ({ nodes: [], edges: [] })),
  fetch((window.CITY ? CITY.data : 'data/') + 'routes_noms.json' + V).then(r => r.json()).catch(() => [])]);
const ROADS = [];
{
  const dv = new DataView(axBuf); const n = dv.getUint32(4, true); let o = 8;
  for (let i = 0; i < n; i++) {
    const nid = dv.getUint32(o, true), w = dv.getFloat32(o + 4, true), m = dv.getUint32(o + 8, true); o += 12;
    const a = new Float32Array(axBuf.slice(o, o + m * 20)); o += m * 20;
    const p = new Float32Array(m * 2), h = new Float32Array(m), sl = [], sr = [];
    for (let k = 0; k < m; k++) { p[2 * k] = a[5 * k]; p[2 * k + 1] = a[5 * k + 1]; h[k] = a[5 * k + 2]; sl.push(a[5 * k + 3]); sr.push(a[5 * k + 4]); }
    const med = v => { const s = v.slice().sort((x, y) => x - y); return s[s.length >> 1] || 0; };
    ROADS.push({ id: i, name: NAMES[nid] || '', w, p, h, m, tl: med(sl), tr: med(sr), dir: 0, imp: 5, src: 'IGN', bridge: false });
  }
}
for (const e of graph.edges) { const r = ROADS[e.id]; if (!r) continue; r.dir = e.dir; r.imp = e.imp; r.src = e.source; r.bridge = r.bridge || e.pont; }
// grille de recherche (cellules de 20 m) sur les segments
const CELL = 20, grid = new Map(), gk = (i, j) => i * 100003 + j;
for (const r of ROADS) for (let k = 0; k < r.m - 1; k++) {
  const x = (r.p[2 * k] + r.p[2 * k + 2]) / 2, z = (r.p[2 * k + 1] + r.p[2 * k + 3]) / 2, key = gk(Math.floor(x / CELL), Math.floor(z / CELL));
  let a = grid.get(key); if (!a) grid.set(key, a = []); a.push(r.id * 4096 + k);
}
function nearest(x, z, rad = 14, skip = -1) {
  let best = null, bd = rad * rad; const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), R = Math.ceil(rad / CELL) + 1;
  for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) {
    const a = grid.get(gk(i, j)); if (!a) continue;
    for (const v of a) {
      const r = ROADS[(v / 4096) | 0], k = v % 4096; if (r.id === skip) continue; const p = r.p;
      const ax = p[2 * k], az = p[2 * k + 1], dx = p[2 * k + 2] - ax, dz = p[2 * k + 3] - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + t * dx, pz = az + t * dz, d = (x - px) ** 2 + (z - pz) ** 2;
      if (d < bd) { bd = d; const L = Math.sqrt(L2); best = { r, k, t, x: px, z: pz, y: r.h[k] + t * (r.h[k + 1] - r.h[k]), tx: dx / L, tz: dz / L, d: Math.sqrt(d), lat: ((x - px) * (dz / L) - (z - pz) * (dx / L)) }; }
    }
  }
  return best;
}
// nœuds du graphe (carrefours) — degré
const NODES = graph.nodes.map(([x, z]) => ({ x, z, deg: 0 }));
for (const e of graph.edges) { if (NODES[e.a]) NODES[e.a].deg++; if (NODES[e.b]) NODES[e.b].deg++; }
const ngrid = new Map();
NODES.forEach((n, i) => { const k = gk(Math.floor(n.x / CELL), Math.floor(n.z / CELL)); let a = ngrid.get(k); if (!a) ngrid.set(k, a = []); a.push(i); });
function nearestNode(x, z, rad, minDeg = 3) {
  let best = -1, bd = rad * rad; const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), R = Math.ceil(rad / CELL);
  for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) for (const v of ngrid.get(gk(i, j)) || []) {
    const n = NODES[v]; if (n.deg < minDeg) continue; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = v; }
  }
  return best < 0 ? null : NODES[best];
}

// ---------------------------------------------------------------- modifications
// { roads: { id: { w, lf, lb, sens, tg, td, cl, v } }, rings: [{ id, x, z, R, a }], signs: [{ id, t, x, z, y, hd, road, dir }] }
const empty = () => ({ v: 1, roads: {}, rings: [], signs: [] });
let OFF = empty();          // officielles (validées, data/routes_modifs.json)
let LOC = load();           // mes propositions locales
let PREVIEW = null;         // une proposition d'un autre joueur, en aperçu
function load() { try { return Object.assign(empty(), JSON.parse(localStorage.getItem('routes_modifs_local') || '{}')); } catch (e) { return empty(); } }
function save() { try { localStorage.setItem('routes_modifs_local', JSON.stringify(LOC)); } catch (e) {} }
function merged() {
  const M = empty(); const layers = [OFF, LOC, PREVIEW].filter(Boolean);
  for (const L of layers) {
    for (const [id, o] of Object.entries(L.roads || {})) M.roads[id] = Object.assign({}, M.roads[id], o);
    for (const g of L.rings || []) { M.rings = M.rings.filter(x => x.id !== g.id); if (!g.del) M.rings.push(g); }
    for (const s of L.signs || []) { M.signs = M.signs.filter(x => x.id !== s.id); if (!s.del) M.signs.push(s); }
  }
  return M;
}
let MOD = merged();
const isLocal = (kind, id) => kind === 'road' ? !!LOC.roads[id] : !!(LOC[kind === 'ring' ? 'rings' : 'signs'] || []).find(x => x.id === id);

// attributs courants d'une route (base + modifications) avec provenance
const SPEED = imp => imp <= 2 ? 70 : 50;
function base(r) {
  const lanes = r.dir ? Math.max(1, Math.round(r.w / 3.25)) : (r.w >= 5 ? 1 : 0);
  return { w: r.w, sens: r.dir, lf: r.dir === -1 ? 0 : (r.dir ? lanes : Math.max(1, lanes)), lb: r.dir === 1 ? 0 : (r.dir ? lanes : lanes), tg: r.tl, td: r.tr, cl: 'tirets', v: SPEED(r.imp) };
}
function cur(r) { const b = base(r), o = MOD.roads[r.id]; return o ? Object.assign(b, o) : b; }
function source(r, key) {
  const o = MOD.roads[r.id];
  if (o && key in o) return isLocal('road', r.id) && LOC.roads[r.id] && key in LOC.roads[r.id] ? ['Joueur', 'proposé', 'p'] : ['Joueur', 'validé', 'v'];
  if (key === 'w') return r.src === 'OSM' ? ['OSM + ortho', 'estimé', 'e'] : ['IGN + ortho', 'estimé', 'e'];
  if (key === 'sens') return [r.src === 'OSM' ? 'OSM' : 'IGN BD TOPO', 'mesuré', 'm'];
  if (key === 'tg' || key === 'td') return ['Calculé (v17)', 'estimé', 'e'];
  return ['Valeur par défaut', 'défaut', 'd'];
}

// ---------------------------------------------------------------- masque des anciennes surfaces (shader)
const ROADMAT = SR.material.clone(); { const ob = SR.material.onBeforeCompile; ROADMAT.onBeforeCompile = function (sh, r) { ob.call(this, sh, r); }; ROADMAT.customProgramCacheKey = () => 'chaussee_edit'; ROADMAT.name = 'route_editee'; }
const MAXS = 512;
const maskData = new Float32Array(MAXS * 2 * 4);
const maskTex = new THREE.DataTexture(maskData, MAXS, 2, THREE.RGBAFormat, THREE.FloatType);
maskTex.internalFormat = 'RGBA32F'; maskTex.minFilter = maskTex.magFilter = THREE.NearestFilter; maskTex.needsUpdate = true;
const uN = { value: 0 }, uBox = { value: new THREE.Vector4(0, 0, 0, 0) };
function hook(mat, wide) {
  if (!mat || mat.userData.rdHook) return; mat.userData.rdHook = 1;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.uniforms.uEdMask = { value: maskTex }; sh.uniforms.uEdN = uN; sh.uniforms.uEdBox = uBox;
    sh.vertexShader = 'varying vec3 vEdW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec4 ep = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nep = instanceMatrix * ep;\n#endif\nvEdW = (modelMatrix * ep).xyz; }');
    sh.fragmentShader = 'uniform sampler2D uEdMask; uniform int uEdN; uniform vec4 uEdBox; varying vec3 vEdW;\n' + sh.fragmentShader.replace('void main() {', `void main() {
if (uEdN > 0 && vEdW.x > uEdBox.x && vEdW.z > uEdBox.y && vEdW.x < uEdBox.z && vEdW.z < uEdBox.w) {
  for (int i = 0; i < ${MAXS}; i++) { if (i >= uEdN) break;
    vec4 sg = texelFetch(uEdMask, ivec2(i, 0), 0); vec4 pr = texelFetch(uEdMask, ivec2(i, 1), 0);
    vec2 a = sg.xy, ab = sg.zw - sg.xy; float L2 = dot(ab, ab); float t = L2 > 1e-6 ? dot(vEdW.xz - a, ab) / L2 : 0.0;
    if ((pr.y < 0.5 && t < 0.0) || (pr.z < 0.5 && t > 1.0)) continue;
    if (abs(vEdW.y - pr.w) > 4.0) continue;
    if (length(vEdW.xz - a - ab * clamp(t, 0.0, 1.0)) < pr.x + ${wide ? '1.1' : '0.0'}) discard; } }`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|rdmask' + (wide ? 'w' : '');
  mat.needsUpdate = true;
}
// matériaux des anciennes routes (asphalte, peinture, îlots, bordures, panneaux OSM)
const OLD = new Set(['route_v3', 'route_saltline', 'bordures']);
function hookScene() {
  scene.traverse(o => {
    if (!o.isMesh || o.userData.rdOwn) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (OLD.has(o.name) || m === SR.material || m.name === 'peinture' || m.name === 'ilots') hook(m, false);
      else if (o.isInstancedMesh && o.count < 5000 && o.userData.rdSign !== false && /signal|panneau|feu/i.test(o.name + m.name)) hook(m, true);
    }
  });
}
hookScene();
// les panneaux OSM sont des InstancedMesh sans nom : on les repère à leur hauteur de poteau
scene.traverse(o => { if (o.isInstancedMesh && !o.userData.rdOwn && o.count > 0 && o.count < 3000 && o.geometry && o.geometry.boundingBox == null) o.geometry.computeBoundingBox(); });
scene.traverse(o => { if (o.isInstancedMesh && !o.userData.rdOwn && o.geometry.boundingBox && o.geometry.boundingBox.max.y < 4 && o.geometry.boundingBox.max.y > 0.05 && !/arbre|tree|car|voiture/i.test(o.name)) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m.isMeshStandardMaterial || m.isMeshBasicMaterial) hook(m, true); } });

// ---------------------------------------------------------------- géométrie
const root = new THREE.Group(); root.name = 'routes_editees'; root.userData.rdOwn = true; scene.add(root);
const own = o => { o.userData.rdOwn = true; return o; };
function noiseTex(c0, c1, scale = 1) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const im = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const n = Math.random(), k = n * n; for (let j = 0; j < 3; j++) im.data[4 * i + j] = c0[j] + (c1[j] - c0[j]) * k; im.data[4 * i + 3] = 255; }
  g.putImageData(im, 0, 0);
  // joints de dalles
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; for (let i = 0; i <= 256; i += 128 / scale) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const MAT = {
  road: ROADMAT,
  side: new THREE.MeshStandardMaterial({ map: noiseTex([150, 148, 142], [190, 188, 182]), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  kerb: new THREE.MeshStandardMaterial({ color: 0x9c9a95, roughness: 0.8 }),
  grass: new THREE.MeshStandardMaterial({ map: noiseTex([52, 82, 30], [96, 128, 52], 0.01), roughness: 1 }),
  apron: new THREE.MeshStandardMaterial({ map: noiseTex([120, 100, 88], [160, 138, 120], 4), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  paint: new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
  sel: new THREE.MeshBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10 }),
  hover: new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -9, polygonOffsetUnits: -9 }),
};
MAT.side.map.repeat.set(1, 1); MAT.grass.map.repeat.set(1, 1); for (const m of Object.values(MAT)) if (m !== ROADMAT) m.side = THREE.DoubleSide;
for (const k of ['side', 'grass', 'apron']) { const m = MAT[k]; m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (modelMatrix * vec4(position, 1.0)).xz * ' + (k === 'grass' ? '0.25' : k === 'apron' ? '0.5' : '0.35') + ';\n#endif'); }; m.customProgramCacheKey = () => 'rdw' + k; }

class Builder {
  constructor() { this.pos = []; this.idx = []; this.road = []; this.line = []; this.isRoad = false; }
  v(x, y, z, s = 0, lat = 0, hw = 1) { this.pos.push(x, y, z); if (this.isRoad) { this.road.push(s, lat, hw, 1); this.line.push(0, 0, 0); } return this.pos.length / 3 - 1; }
  q(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  t(a, b, c) { this.idx.push(a, b, c); }
  mesh(mat, up = true) {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    if (this.isRoad) { g.setAttribute('aRoad', new THREE.Float32BufferAttribute(this.road, 4)); g.setAttribute('aLine', new THREE.Float32BufferAttribute(this.line, 3)); }
    g.setIndex(this.idx); g.computeVertexNormals();
    if (up) { const n = g.attributes.normal; for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); }
    g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return own(m);
  }
}
// polyligne : tableau {x, z, y} ; normales gauches par sommet ; abscisses
function frame(P) {
  const n = P.length, s = new Float32Array(n), N = [];
  for (let k = 1; k < n; k++) s[k] = s[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].z - P[k - 1].z);
  for (let k = 0; k < n; k++) {
    const a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)]; let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    N.push({ x: tz, z: -tx, tx, tz }); // +latéral = gauche du sens A→B
  }
  return { s, N, L: s[n - 1] };
}
function at(P, F, s) {
  s = Math.max(0, Math.min(F.L, s)); let k = 0; while (k < P.length - 2 && F.s[k + 1] < s) k++;
  const d = (F.s[k + 1] - F.s[k]) || 1, t = (s - F.s[k]) / d, a = P[k], b = P[k + 1];
  const tx = (b.x - a.x) / d, tz = (b.z - a.z) / d;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, tx, tz, nx: tz, nz: -tx };
}
// bande entre deux décalages latéraux, à la hauteur dy
function band(B, P, F, l0, l1, dy, road = false, hw = 1) {
  const i0 = B.pos.length / 3;
  for (let k = 0; k < P.length; k++) {
    const p = P[k], n = F.N[k];
    B.v(p.x + n.x * l0, p.y + dy, p.z + n.z * l0, F.s[k], l0, hw); B.v(p.x + n.x * l1, p.y + dy, p.z + n.z * l1, F.s[k], l1, hw);
  }
  for (let k = 0; k < P.length - 1; k++) { const i = i0 + 2 * k; B.q(i, i + 1, i + 3, i + 2); }
}
function wall(B, P, F, l, y0, y1) { // paroi verticale au décalage l
  const i0 = B.pos.length / 3;
  for (let k = 0; k < P.length; k++) { const p = P[k], n = F.N[k]; B.v(p.x + n.x * l, p.y + y0, p.z + n.z * l); B.v(p.x + n.x * l, p.y + y1, p.z + n.z * l); }
  for (let k = 0; k < P.length - 1; k++) { const i = i0 + 2 * k; B.q(i, i + 2, i + 3, i + 1); }
}
// trait de peinture le long de la route : décalage l, largeur w, de s0 à s1, tirets (on, off) ou continu
function stroke(B, P, F, l, w, s0, s1, on = 0, off = 0) {
  const seg = (a, b) => {
    if (b - a < 0.05) return; const step = 1.5, n = Math.max(1, Math.ceil((b - a) / step)), i0 = B.pos.length / 3;
    for (let j = 0; j <= n; j++) { const q = at(P, F, a + (b - a) * j / n); B.v(q.x + q.nx * (l - w / 2), q.y + 0.015, q.z + q.nz * (l - w / 2)); B.v(q.x + q.nx * (l + w / 2), q.y + 0.015, q.z + q.nz * (l + w / 2)); }
    for (let j = 0; j < n; j++) { const i = i0 + 2 * j; B.q(i, i + 1, i + 3, i + 2); }
  };
  if (!on) return seg(s0, s1);
  for (let s = s0; s < s1; s += on + off) seg(s, Math.min(s1, s + on));
}
// forme posée à plat (flèche…) : points locaux (u le long, v latéral) triangulés en éventail convexe par morceaux
function decal(B, q, pieces, flip) {
  for (const poly of pieces) {
    const i0 = B.pos.length / 3;
    for (const [u, v] of poly) { const uu = flip ? -u : u, vv = flip ? -v : v; B.v(q.x + q.tx * uu + q.nx * vv, q.y + 0.016, q.z + q.tz * uu + q.nz * vv); }
    for (let j = 1; j < poly.length - 1; j++) B.t(i0, i0 + j, i0 + j + 1);
  }
}
const ARROW = [[[-2.5, -0.08], [1.0, -0.08], [1.0, 0.08], [-2.5, 0.08]], [[1.0, -0.38], [2.5, 0], [1.0, 0.38]]];
const TRI = [[[0, -0.45], [0.9, 0], [0, 0.45]]];

// découpe d'une polyligne par un cercle (on garde l'extérieur), renvoie des morceaux
function clipCircle(P, cx, cz, R) {
  const out = []; let curp = [];
  const inside = p => (p.x - cx) ** 2 + (p.z - cz) ** 2 < R * R;
  const cut = (a, b) => { // point d'entrée/sortie sur le cercle entre a (dehors) et b
    const dx = b.x - a.x, dz = b.z - a.z, fx = a.x - cx, fz = a.z - cz, A = dx * dx + dz * dz, Bq = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - R * R;
    const D = Math.max(0, Bq * Bq - 4 * A * C), t1 = (-Bq - Math.sqrt(D)) / (2 * A), t2 = (-Bq + Math.sqrt(D)) / (2 * A);
    const t = inside(a) ? t2 : t1; return { x: a.x + dx * t, z: a.z + dz * t, y: a.y + (b.y - a.y) * t };
  };
  for (let k = 0; k < P.length; k++) {
    const p = P[k], inP = inside(p);
    if (k > 0) { const q = P[k - 1], inQ = inside(q); if (inQ !== inP) { const c = cut(q, p); if (inP) { curp.push(c); if (curp.length > 1) out.push(curp); curp = []; } else curp.push(c); } }
    if (!inP) curp.push(p);
  }
  if (curp.length > 1) out.push(curp);
  return out;
}

// ---------------------------------------------------------------- panneaux (faces dessinées)
const signTex = {};
function face(t) {
  if (signTex[t]) return signTex[t];
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.lineJoin = 'round';
  const red = '#d0141c', blue = '#1f5fbf';
  const circle = (r, f) => { g.beginPath(); g.arc(128, 128, r, 0, 7); g.fillStyle = f; g.fill(); };
  const tri = (up, r, f) => { g.beginPath(); for (let i = 0; i < 3; i++) { const a = (up ? -Math.PI / 2 : Math.PI / 2) + i * 2 * Math.PI / 3; g.lineTo(128 + r * Math.cos(a), 140 - (up ? 0 : 24) + r * Math.sin(a)); } g.closePath(); g.fillStyle = f; g.fill(); };
  if (t === 'stop') { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(128 + 124 * Math.cos(a), 128 + 124 * Math.sin(a)); } g.closePath(); g.fillStyle = '#fff'; g.fill(); g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(128 + 112 * Math.cos(a), 128 + 112 * Math.sin(a)); } g.closePath(); g.fillStyle = red; g.fill(); g.fillStyle = '#fff'; g.font = '900 74px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 128, 132); }
  else if (t === 'cedez') { tri(false, 126, red); tri(false, 88, '#fff'); }
  else if (t === 'giratoire') { tri(true, 126, red); tri(true, 92, '#fff'); g.strokeStyle = '#111'; g.lineWidth = 9; for (let i = 0; i < 3; i++) { const a = i * 2 * Math.PI / 3; g.beginPath(); g.arc(128, 160, 30, a, a + 1.5); g.stroke(); const ex = 128 + 30 * Math.cos(a + 1.5), ey = 160 + 30 * Math.sin(a + 1.5); g.beginPath(); g.moveTo(ex - 9, ey - 9); g.lineTo(ex + 9, ey); g.lineTo(ex - 6, ey + 10); g.fillStyle = '#111'; g.fill(); } }
  else if (t === 'interdit') { circle(124, '#fff'); circle(116, red); g.fillStyle = '#fff'; g.fillRect(44, 108, 168, 40); }
  else if (/^v\d+$/.test(t)) { circle(124, '#fff'); circle(118, red); circle(92, '#fff'); g.fillStyle = '#111'; g.font = '900 96px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t.slice(1), 128, 136); }
  else if (t === 'sensunique') { g.fillStyle = '#fff'; g.fillRect(4, 4, 248, 248); g.fillStyle = blue; g.fillRect(14, 14, 228, 228); g.fillStyle = '#fff'; g.fillRect(112, 92, 32, 130); g.beginPath(); g.moveTo(72, 100); g.lineTo(128, 34); g.lineTo(184, 100); g.fill(); }
  else if (t === 'pieton') { g.fillStyle = '#fff'; g.fillRect(4, 4, 248, 248); g.fillStyle = blue; g.fillRect(14, 14, 228, 228); g.beginPath(); g.moveTo(128, 34); g.lineTo(226, 214); g.lineTo(30, 214); g.closePath(); g.fillStyle = '#fff'; g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(132, 104, 13, 0, 7); g.fill(); g.lineWidth = 11; g.strokeStyle = '#111'; g.lineCap = 'round'; g.beginPath(); g.moveTo(130, 122); g.lineTo(124, 160); g.lineTo(104, 196); g.moveTo(124, 160); g.lineTo(148, 196); g.moveTo(108, 140); g.lineTo(152, 146); g.stroke(); }
  else if (t === 'feu') { g.fillStyle = '#16191c'; g.fillRect(78, 8, 100, 240); for (const [y, col] of [[52, '#ff3b30'], [128, '#ffb300'], [204, '#30d158']]) { g.beginPath(); g.arc(128, y, 30, 0, 7); g.fillStyle = col; g.fill(); } }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; signTex[t] = tex; return tex;
}
const SIGNS = {
  stop: { nom: 'Stop', code: 'AB4', h: 0.8 }, cedez: { nom: 'Cédez le passage', code: 'AB3a', h: 1.0 }, interdit: { nom: 'Sens interdit', code: 'B1', h: 0.85 },
  v30: { nom: 'Limite 30', code: 'B14', h: 0.8 }, v50: { nom: 'Limite 50', code: 'B14', h: 0.8 }, v70: { nom: 'Limite 70', code: 'B14', h: 0.8 },
  sensunique: { nom: 'Sens unique', code: 'C12', h: 0.8 }, pieton: { nom: 'Passage piéton', code: 'C20a', h: 0.8 }, giratoire: { nom: 'Giratoire', code: 'AB25', h: 1.0 }, feu: { nom: 'Feu tricolore', code: 'R11v', h: 0.9 },
};
const poleGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 8); poleGeo.translate(0, 0.5, 0);
const poleMat = new THREE.MeshStandardMaterial({ color: 0x8d9296, metalness: 0.6, roughness: 0.45 });
const backMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.4, roughness: 0.55 });
const lampGeo = new THREE.SphereGeometry(0.09, 12, 8);
const LIGHTS = [];
function signMesh(s) {
  const g = new THREE.Group(); own(g); const d = SIGNS[s.t] || SIGNS.stop;
  if (s.t === 'feu') {
    const pole = new THREE.Mesh(poleGeo, poleMat); pole.scale.y = 2.4; g.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.26), new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.5 })); box.position.set(0, 2.85, 0); g.add(box);
    const L = [];
    [0xff3b30, 0xffb300, 0x30d158].forEach((c, i) => { const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0.05 }); const l = new THREE.Mesh(lampGeo, m); l.position.set(0, 3.15 - i * 0.29, 0.12); g.add(l); L.push(m); });
    LIGHTS.push({ L, ph: (s.dir > 0 ? 0 : 0.5) });
  } else {
    const H = 2.3; const pole = new THREE.Mesh(poleGeo, poleMat); pole.scale.y = H + d.h / 2; g.add(pole);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(d.h, d.h), new THREE.MeshStandardMaterial({ map: face(s.t), transparent: true, alphaTest: 0.4, roughness: 0.45, side: THREE.FrontSide }));
    plate.position.set(0, H + d.h / 2, 0.045); g.add(plate);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(d.h, d.h), new THREE.MeshStandardMaterial({ map: face(s.t), color: 0x9aa0a4, transparent: true, alphaTest: 0.4, metalness: 0.4, roughness: 0.55, side: THREE.BackSide }));
    back.position.copy(plate.position); back.position.z = 0.04; g.add(back);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; own(o); } });
  g.position.set(s.x, s.y, s.z); g.rotation.y = s.hd; g.userData.sign = s.id; return g;
}

// ---------------------------------------------------------------- reconstruction
let built = { roads: new Map(), rings: [], alerts: [] };
function roadPoly(r) { const P = []; for (let k = 0; k < r.m; k++) P.push({ x: r.p[2 * k], z: r.p[2 * k + 1], y: r.h[k] }); return P; }
function endTrim(r, P, end) { // recul au carrefour : largeur des routes qui touchent ce bout
  const p = end ? P[P.length - 1] : P[0]; let t = 0;
  const ci = Math.floor(p.x / CELL), cj = Math.floor(p.z / CELL);
  const seen = new Set();
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const v of grid.get(gk(i, j)) || []) {
    const o = ROADS[(v / 4096) | 0]; if (o.id === r.id || seen.has(o.id)) continue;
    const q = nearestOn(o, p.x, p.z); if (q < 2.5) { seen.add(o.id); t = Math.max(t, cur(o).w / 2 + 0.6); }
  }
  return t;
}
function nearestOn(o, x, z) { let bd = 1e9; for (let k = 0; k < o.m - 1; k++) { const ax = o.p[2 * k], az = o.p[2 * k + 1], dx = o.p[2 * k + 2] - ax, dz = o.p[2 * k + 3] - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); bd = Math.min(bd, Math.hypot(x - ax - t * dx, z - az - t * dz)); } return bd; }
function trimPoly(P, a, b) { // retire a mètres au début et b à la fin
  const F = frame(P); if (F.L - a - b < 2) return null; const out = [at(P, F, a)].map(q => ({ x: q.x, z: q.z, y: q.y }));
  for (let k = 0; k < P.length; k++) if (F.s[k] > a && F.s[k] < F.L - b) out.push(P[k]);
  const e = at(P, F, F.L - b); out.push({ x: e.x, z: e.z, y: e.y }); return out;
}
const SEG = []; // segments du masque : [ax, az, bx, bz, r, capA, capB, y]
function maskPoly(P, r, capA, capB) { for (let k = 0; k < P.length - 1; k++) SEG.push([P[k].x, P[k].z, P[k + 1].x, P[k + 1].z, r, k === 0 ? capA : 1, k === P.length - 2 ? capB : 1, (P[k].y + P[k + 1].y) / 2]); }
function flushMask() {
  const n = Math.min(MAXS, SEG.length); let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let i = 0; i < n; i++) {
    const [ax, az, bx, bz, r, ca, cb, y] = SEG[i];
    maskData.set([ax, az, bx, bz], 4 * i); maskData.set([r, ca, cb, y], 4 * (MAXS + i));
    x0 = Math.min(x0, ax - r - 2, bx - r - 2); z0 = Math.min(z0, az - r - 2, bz - r - 2); x1 = Math.max(x1, ax + r + 2, bx + r + 2); z1 = Math.max(z1, az + r + 2, bz + r + 2);
  }
  uN.value = n; uBox.value.set(x0, z0, x1, z1); maskTex.needsUpdate = true;
}

function buildRoad(r, c, rings, B) {
  let P = roadPoly(r);
  // bouts : recul aux carrefours (pas de recul si un giratoire coupe ce bout)
  const inRing = p => rings.some(g => Math.hypot(p.x - g.x, p.z - g.z) < g.R + 0.4);
  const ta = inRing(P[0]) ? 0 : endTrim(r, P, false), tb = inRing(P[P.length - 1]) ? 0 : endTrim(r, P, true);
  const T = trimPoly(P, ta, tb); if (!T) return; let parts = [T];
  for (const g of rings) parts = parts.flatMap(q => clipCircle(q, g.x, g.z, g.R + 0.2));
  const hw = c.w / 2, oldHw = r.w / 2, side = Math.max(r.tl, r.tr, c.tg, c.td);
  for (const Q of parts) {
    if (Q.length < 2) continue; const F = frame(Q);
    // masque : chaussée + bordures anciennes et nouvelles
    maskPoly(Q, Math.max(hw, oldHw) + 0.5 + (c.tg || c.td ? 0.2 : 0), ta || inRing(Q[0]) ? 0 : 1, tb || inRing(Q[Q.length - 1]) ? 0 : 1);
    // chaussée (matériau asphalte du jeu)
    band(B.road, Q, F, -hw, hw, 0, true, hw);
    // bordures + trottoirs (gauche = +, droite = −)
    for (const [sg, tw] of [[1, c.tg], [-1, c.td]]) {
      const outer = Math.max(hw + 0.16 + (tw || 0), oldHw + 0.6);
      if (tw > 0.05) {
        wall(B.kerb, Q, F, sg * hw, -0.02, 0.14); band(B.kerb, Q, F, sg * hw, sg * (hw + 0.16), 0.14);
        band(B.side, Q, F, sg * (hw + 0.16), sg * outer, 0.145); wall(B.kerb, Q, F, sg * outer, -0.6, 0.145);
      } else if (outer > hw + 0.3) { band(B.side, Q, F, sg * hw, sg * outer, 0.01); }
    }
    // marquages
    const n = c.lf + c.lb, lw = 2 * hw / Math.max(1, n), s0 = 2, s1 = F.L - 2;
    if (F.L > 6) {
      if (c.lf && c.lb) { const l = -hw + c.lf * lw; c.cl === 'continue' ? stroke(B.paint, Q, F, l, 0.13, s0, s1) : stroke(B.paint, Q, F, l, 0.13, s0, s1, 3, 3.5); }
      for (let i = 1; i < c.lf; i++) stroke(B.paint, Q, F, -hw + i * lw, 0.13, s0, s1, 3, 10);
      for (let i = 1; i < c.lb; i++) stroke(B.paint, Q, F, -hw + (c.lf + i) * lw, 0.13, s0, s1, 3, 10);
      if (hw >= 3.25 && r.imp <= 3) { stroke(B.paint, Q, F, -hw + 0.35, 0.13, s0, s1); stroke(B.paint, Q, F, hw - 0.35, 0.13, s0, s1); }
      // flèches de sens unique
      if (!c.lf || !c.lb) for (let s = 8; s < F.L - 8; s += 35) for (let i = 0; i < n; i++) decal(B.paint, at(Q, F, s), ARROW.map(p => p.map(([u, v]) => [u, v + (-hw + (i + 0.5) * lw) * (c.lb ? -1 : 1)])), !!c.lb);
    }
  }
}
function buildRing(g, B, M) {
  const R = g.R, a = g.a || 7, Ri = Math.max(2.5, R - a), cx = g.x, cz = g.z;
  const y = g.y != null ? g.y : (nearest(cx, cz, 30)?.y ?? groundH(cx, cz) + 0.22);
  SEG.push([cx, cz, cx, cz, R + 0.3, 1, 1, y]);
  const N = 72, Rm = (R + Ri) / 2, hw = (R - Ri) / 2;
  const H = (x, z) => { const q = nearest(x, z, 6); return Math.max(groundH(x, z) + 0.22, q ? q.y : -1e9, y - 3); };
  // anneau
  const i0 = B.road.pos.length / 3;
  for (let i = 0; i <= N; i++) { const t = i / N * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); const xo = cx + c * (R + 0.5), zo = cz + s * (R + 0.5), xi = cx + c * Ri, zi = cz + s * Ri, hy = Math.max(H(xo, zo), H(xi, zi)); B.road.v(xo, hy, zo, t * Rm, R + 0.5 - Rm, hw); B.road.v(xi, hy, zi, t * Rm, Ri - Rm, hw); }
  for (let i = 0; i < N; i++) { const j = i0 + 2 * i; B.road.q(j, j + 1, j + 3, j + 2); }
  // anneau franchissable (pavés) + bordure + îlot central engazonné
  const Ra = Math.max(1.5, Ri - 1.6), ring = (Bm, r0, r1, dy0, dy1) => { const k0 = Bm.pos.length / 3; for (let i = 0; i <= N; i++) { const t = i / N * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), hy = Math.max(H(cx + c * (R + 0.5), cz + s * (R + 0.5)), H(cx + c * Ri, cz + s * Ri)); Bm.v(cx + c * r0, hy + dy0, cz + s * r0); Bm.v(cx + c * r1, hy + dy1, cz + s * r1); } for (let i = 0; i < N; i++) { const j = k0 + 2 * i; Bm.q(j, j + 1, j + 3, j + 2); } };
  ring(B.kerb, Ri, Ri, -0.02, 0.05); ring(B.apron, Ri, Ra, 0.05, 0.05); ring(B.kerb, Ra, Ra, 0.05, 0.2); ring(B.kerb, Ra, Ra - 0.2, 0.2, 0.2);
  const k0 = B.grass.pos.length / 3; let ym = 0; const yy = []; for (let i = 0; i <= N; i++) { const t = i / N * Math.PI * 2; yy.push(Math.max(H(cx + Math.cos(t) * (R + 0.5), cz + Math.sin(t) * (R + 0.5)), H(cx + Math.cos(t) * Ri, cz + Math.sin(t) * Ri))); ym += yy[i] / (N + 1); } B.grass.v(cx, ym + 0.32, cz); for (let i = 0; i <= N; i++) { const t = i / N * Math.PI * 2; B.grass.v(cx + Math.cos(t) * (Ra - 0.2), yy[i] + 0.2, cz + Math.sin(t) * (Ra - 0.2)); } for (let i = 0; i < N; i++) B.grass.t(k0, k0 + 1 + i, k0 + 2 + i);
  // massifs
  for (let i = 0; i < 3 && Ra > 3; i++) { const t = i * 2.1 + 0.4, rr = Ra * 0.45; const m = own(new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 7), new THREE.MeshStandardMaterial({ color: 0x3f6b2a, roughness: 1 }))); m.scale.set(1, 0.7, 1); m.position.set(cx + Math.cos(t) * rr, H(cx, cz) + 0.6, cz + Math.sin(t) * rr); m.castShadow = true; M.push(m); }
  // ligne de rive intérieure (tirets) + branches : cédez-le-passage, îlots séparateurs, panneaux AB25 + AB3a
  for (let i = 0; i < 48; i += 2) { const t0 = i / 48 * Math.PI * 2, t1 = (i + 1) / 48 * Math.PI * 2, r0 = Ri + 0.25, r1 = Ri + 0.4, kk = B.paint.pos.length / 3, hy = Math.max(H(cx + Math.cos(t0) * (R + 0.5), cz + Math.sin(t0) * (R + 0.5)), H(cx + Math.cos(t0) * Ri, cz + Math.sin(t0) * Ri)) + 0.015; B.paint.v(cx + Math.cos(t0) * r0, hy, cz + Math.sin(t0) * r0); B.paint.v(cx + Math.cos(t0) * r1, hy, cz + Math.sin(t0) * r1); B.paint.v(cx + Math.cos(t1) * r1, hy, cz + Math.sin(t1) * r1); B.paint.v(cx + Math.cos(t1) * r0, hy, cz + Math.sin(t1) * r0); B.paint.q(kk, kk + 1, kk + 2, kk + 3); }
  const br = branches(g); g._br = br.length;
  for (const b of br) {
    const { dx, dz, hw: bw, enter } = b; const px = -dz, pz = dx; // px,pz = gauche en sortant
    if (enter) { // ligne de cédez-le-passage sur la moitié entrante (droite en entrant = gauche en sortant)
      const d0 = R + 0.6, l0 = 0.15, l1 = b.exit ? bw - 0.1 : bw - 0.1, lstart = b.exit ? l0 : -bw + 0.1;
      for (let l = lstart; l < l1; l += 1.0) { const kk = B.paint.pos.length / 3, la = l, lb = Math.min(l1, l + 0.5); for (const [u, v] of [[d0, la], [d0 + 0.5, la], [d0 + 0.5, lb], [d0, lb]]) B.paint.v(cx + dx * u + px * v, y + 0.016, cz + dz * u + pz * v); B.paint.q(kk, kk + 1, kk + 2, kk + 3); }
      const sp = { x: cx + dx * (R + 3) + px * (bw + 0.9), z: cz + dz * (R + 3) + pz * (bw + 0.9) };
      const sy = nearest(sp.x, sp.z, 6)?.y ?? y; const hd = Math.atan2(dx, dz);
      M.push(signMesh({ id: g.id + 'a', t: 'giratoire', x: sp.x, y: sy, z: sp.z, hd })); const s2 = signMesh({ id: g.id + 'b', t: 'cedez', x: sp.x, y: sy - 1.15, z: sp.z, hd }); s2.children[0].visible = false; M.push(s2);
    }
    if (b.enter && b.exit && bw >= 2.4) { // îlot séparateur en goutte
      const L = Math.min(9, R * 0.6), kk = B.kerb.pos.length / 3, pts = [];
      for (let i = 0; i <= 12; i++) { const u = R + 0.8 + L * i / 12, v = 0.75 * Math.sin(Math.PI * i / 12) ** 0.6; pts.push([u, v]); }
      for (let i = 12; i >= 0; i--) pts.push([pts[i][0], -pts[i][1]]);
      const k1 = B.kerb.pos.length / 3; B.kerb.v(cx + dx * (R + 0.8 + L / 2), y + 0.15, cz + dz * (R + 0.8 + L / 2));
      for (const [u, v] of pts) B.kerb.v(cx + dx * u + px * v, y + 0.15, cz + dz * u + pz * v);
      for (let i = 0; i < pts.length - 1; i++) B.kerb.t(k1, k1 + 1 + i, k1 + 2 + i);
      const k2 = B.kerb.pos.length / 3; for (const [u, v] of pts) { B.kerb.v(cx + dx * u + px * v, y - 0.02, cz + dz * u + pz * v); B.kerb.v(cx + dx * u + px * v, y + 0.15, cz + dz * u + pz * v); }
      for (let i = 0; i < pts.length - 1; i++) { const j = k2 + 2 * i; B.kerb.q(j, j + 2, j + 3, j + 1); }
      void kk;
    }
  }
}
// branches d'un giratoire : routes qui traversent le cercle
function branches(g) {
  const out = [], seen = new Set();
  const ci = Math.floor(g.x / CELL), cj = Math.floor(g.z / CELL), Rr = Math.ceil((g.R + 4) / CELL) + 1;
  for (let i = ci - Rr; i <= ci + Rr; i++) for (let j = cj - Rr; j <= cj + Rr; j++) for (const v of grid.get(gk(i, j)) || []) {
    const r = ROADS[(v / 4096) | 0]; if (seen.has(r.id)) continue; seen.add(r.id);
    const c = cur(r), P = roadPoly(r);
    for (let k = 0; k < P.length - 1; k++) {
      const a = P[k], b = P[k + 1], da = Math.hypot(a.x - g.x, a.z - g.z), db = Math.hypot(b.x - g.x, b.z - g.z), R = g.R + 0.6;
      if ((da < R) === (db < R)) continue;
      const out1 = da < R ? b : a, dx0 = out1.x - g.x, dz0 = out1.z - g.z, l = Math.hypot(dx0, dz0) || 1;
      const outward = da < R; // le sens A→B sort du giratoire
      const enter = c.sens === 0 || (c.sens === 1) !== outward, exit = c.sens === 0 || (c.sens === 1) === outward;
      if (!out.some(o => Math.abs(Math.atan2(o.dz, o.dx) - Math.atan2(dz0 / l, dx0 / l)) < 0.25)) out.push({ road: r.id, dx: dx0 / l, dz: dz0 / l, hw: c.w / 2, enter, exit });
    }
  }
  return out;
}
let selObj = null, built3 = [];
function rebuild() {
  for (const o of built3) { root.remove(o); o.traverse?.(c => { if (c.geometry && !c.geometry.userData?.shared) c.geometry.dispose(); }); }
  built3 = []; SEG.length = 0; LIGHTS.length = 0;
  MOD = merged();
  const B = { road: new Builder(), side: new Builder(), kerb: new Builder(), grass: new Builder(), apron: new Builder(), paint: new Builder() }; B.road.isRoad = true;
  const M = [];
  const rings = MOD.rings.map(g => Object.assign({}, g));
  for (const g of rings) buildRing(g, B, M);
  // routes modifiées + routes coupées par un giratoire
  const todo = new Set(Object.keys(MOD.roads).map(Number));
  for (const g of rings) for (const b of branchesRoads(g)) todo.add(b);
  for (const id of todo) { const r = ROADS[id]; if (r) buildRoad(r, cur(r), rings.filter(g => near(r, g)), B); }
  // panneaux + marquages associés (ligne d'effet)
  for (const s of MOD.signs) { M.push(signMesh(s)); signPaint(s, B); }
  flushMask();
  for (const [k, b] of Object.entries(B)) { const m = b.mesh(MAT[k]); if (m) { if (k === 'kerb') m.castShadow = true; M.push(m); } }
  for (const m of M) { root.add(m); built3.push(m); }
  built.rings = rings; built.alerts = check(rings);
  drawSel(); UI.refresh();
}
function near(r, g) { const R = g.R + 30; for (let k = 0; k < r.m; k += 3) if (Math.hypot(r.p[2 * k] - g.x, r.p[2 * k + 1] - g.z) < R) return true; return Math.hypot(r.p[2 * r.m - 2] - g.x, r.p[2 * r.m - 1] - g.z) < R; }
function branchesRoads(g) { const s = new Set(); for (const b of branches(g)) s.add(b.road); return s; }
function signPaint(s, B) {
  if (s.t !== 'stop' && s.t !== 'cedez' && s.t !== 'pieton') return;
  const r = ROADS[s.road]; if (!r) return; const c = cur(r); const q0 = nearest(s.x, s.z, 12); if (!q0 || q0.r.id !== r.id) return;
  const P = roadPoly(r), F = frame(P);
  let sAt = F.s[q0.k] + q0.t * (F.s[q0.k + 1] - F.s[q0.k]); const hw = c.w / 2;
  if (s.t === 'pieton') { for (let l = -hw + 0.3; l < hw - 0.3; l += 1.1) { const q = at(P, F, sAt), kk = B.paint.pos.length / 3; for (const [u, v] of [[-2, l], [2, l], [2, l + 0.5], [-2, l + 0.5]]) B.paint.v(q.x + q.tx * u + q.nx * v, q.y + 0.016, q.z + q.tz * u + q.nz * v); B.paint.q(kk, kk + 1, kk + 2, kk + 3); } return; }
  // la ligne d'effet est 2 m en aval du panneau, sur la moitié de chaussée de son sens
  sAt += s.dir * 2.5; const q = at(P, F, sAt); const right = s.dir > 0 ? [-hw, 0] : [0, hw];
  if (s.t === 'stop') { const kk = B.paint.pos.length / 3; for (const [u, v] of [[0, right[0]], [0.5, right[0]], [0.5, right[1]], [0, right[1]]]) B.paint.v(q.x + q.tx * u + q.nx * v, q.y + 0.016, q.z + q.tz * u + q.nz * v); B.paint.q(kk, kk + 1, kk + 2, kk + 3); }
  else for (let l = right[0] + 0.1; l < right[1] - 0.1; l += 1) { const kk = B.paint.pos.length / 3; for (const [u, v] of [[0, l], [0.5, l], [0.5, Math.min(right[1], l + 0.5)], [0, Math.min(right[1], l + 0.5)]]) B.paint.v(q.x + q.tx * u + q.nx * v, q.y + 0.016, q.z + q.tz * u + q.nz * v); B.paint.q(kk, kk + 1, kk + 2, kk + 3); }
}

// ---------------------------------------------------------------- logique et contrôles
function check(rings) {
  const A = [];
  const add = (lvl, txt, x, z, ref) => A.push({ lvl, txt, x, z, ref });
  for (const [id, o] of Object.entries(MOD.roads)) {
    const r = ROADS[id]; if (!r) continue; const c = cur(r), n = c.lf + c.lb, mid = { x: r.p[r.m & ~1], z: r.p[(r.m & ~1) + 1] };
    if (n > 0) { const lw = c.w / n; if (lw < 2.5) add('o', `${r.name || 'Route'} : voies de ${lw.toFixed(2)} m (< 2,50 m)`, mid.x, mid.z, { road: r.id }); if (lw > 3.75 && n > 1) add('o', `${r.name || 'Route'} : voies de ${lw.toFixed(2)} m (> 3,75 m)`, mid.x, mid.z, { road: r.id }); }
    if (n === 0 && c.w > 0) add('r', `${r.name || 'Route'} : aucune voie de circulation`, mid.x, mid.z, { road: r.id });
    // sens unique qui mène à une impasse
    if (c.sens) { const P = roadPoly(r), e = c.sens === 1 ? P[P.length - 1] : P[0]; const t = endTrim(r, P, c.sens === 1); if (t === 0 && !rings.some(g => Math.hypot(e.x - g.x, e.z - g.z) < g.R + 2)) add('r', `${r.name || 'Route'} : sens unique vers une impasse`, e.x, e.z, { road: r.id }); }
  }
  for (const s of MOD.signs) {
    const r = ROADS[s.road]; if (!r) continue; const c = cur(r);
    if (s.t === 'interdit' && c.sens === s.dir) add('r', `Sens interdit contredit le sens unique de ${r.name || 'la route'}`, s.x, s.z, { sign: s.id });
    if (s.t === 'sensunique' && c.sens === -s.dir) add('r', `Sens unique à contresens sur ${r.name || 'la route'}`, s.x, s.z, { sign: s.id });
    if (s.t === 'stop' || s.t === 'cedez') { const P = roadPoly(r), e = s.dir > 0 ? P[P.length - 1] : P[0]; if (Math.hypot(e.x - s.x, e.z - s.z) > 25) add('o', `${SIGNS[s.t].nom} à ${Math.round(Math.hypot(e.x - s.x, e.z - s.z))} m du carrefour : sans effet`, s.x, s.z, { sign: s.id }); }
  }
  for (const g of rings) if ((g._br || 0) < 3) add('o', `Giratoire à ${g._br || 0} branche(s) : il en faut au moins 3`, g.x, g.z, { ring: g.id });
  return A;
}
// effets logiques d'un panneau posé
function applySign(s) {
  const r = ROADS[s.road]; if (!r) return '';
  const c = cur(r); const set = o => { LOC.roads[r.id] = Object.assign({}, LOC.roads[r.id], o); };
  const lanes = Math.max(1, c.lf + c.lb);
  if (s.t === 'interdit' && c.sens === 0) { set({ sens: -s.dir, lf: -s.dir === 1 ? lanes : 0, lb: -s.dir === -1 ? lanes : 0 }); return 'Rue passée en sens unique'; }
  if (s.t === 'sensunique' && c.sens === 0) { set({ sens: s.dir, lf: s.dir === 1 ? lanes : 0, lb: s.dir === -1 ? lanes : 0 }); return 'Rue passée en sens unique'; }
  if (/^v\d+$/.test(s.t)) { set({ v: +s.t.slice(1) }); return 'Vitesse limitée à ' + s.t.slice(1) + ' km/h'; }
  return '';
}

// ---------------------------------------------------------------- sélection : surbrillance
const selGroup = own(new THREE.Group()); root.add(selGroup);
function drawSel() {
  for (const o of selGroup.children.slice()) { selGroup.remove(o); o.geometry?.dispose(); }
  if (!selObj) return; const B = new Builder();
  if (selObj.kind === 'road') { const r = ROADS[selObj.id], c = cur(r), P = roadPoly(r), F = frame(P), hw = c.w / 2; band(B, P, F, hw - 0.12, hw + 0.25, 0.03); band(B, P, F, -hw - 0.25, -hw + 0.12, 0.03); }
  if (selObj.kind === 'ring') { const g = MOD.rings.find(x => x.id === selObj.id); if (g) { const y = (nearest(g.x, g.z, 30)?.y ?? 0) + 0.05; const k0 = 0; for (let i = 0; i <= 72; i++) { const t = i / 72 * Math.PI * 2; B.v(g.x + Math.cos(t) * (g.R + 0.4), y, g.z + Math.sin(t) * (g.R + 0.4)); B.v(g.x + Math.cos(t) * (g.R + 0.9), y, g.z + Math.sin(t) * (g.R + 0.9)); } for (let i = 0; i < 72; i++) B.q(k0 + 2 * i, k0 + 2 * i + 1, k0 + 2 * i + 3, k0 + 2 * i + 2); } }
  if (selObj.kind === 'sign') { const s = MOD.signs.find(x => x.id === selObj.id); if (s) { for (let i = 0; i <= 32; i++) { const t = i / 32 * Math.PI * 2; B.v(s.x + Math.cos(t) * 0.7, s.y + 0.05, s.z + Math.sin(t) * 0.7); B.v(s.x + Math.cos(t) * 1.0, s.y + 0.05, s.z + Math.sin(t) * 1.0); } for (let i = 0; i < 32; i++) B.q(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2); } }
  const m = B.mesh(MAT.sel, false); if (m) { m.renderOrder = 10; m.receiveShadow = false; selGroup.add(m); }
}

// ---------------------------------------------------------------- caméra d'édition
const ED = { on: false, tool: 'select', signType: 'stop', cam: { x: 0, y: 0, z: 0, dist: 70, yaw: 0, pitch: 0.95 } };
const origRender = renderer.render.bind(renderer);
renderer.render = function (sc, cam) {
  if (ED.on && cam === camera) {
    const c = ED.cam, cp = Math.cos(c.pitch);
    camera.position.set(c.x + Math.sin(c.yaw) * cp * c.dist, c.y + Math.sin(c.pitch) * c.dist, c.z + Math.cos(c.yaw) * cp * c.dist);
    camera.lookAt(c.x, c.y, c.z); camera.updateMatrixWorld();
  }
  return origRender(sc, cam);
};
function groundAt(cx, cy) {
  const rect = renderer.domElement.getBoundingClientRect();
  const v = new THREE.Vector3(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
  let y = ED.cam.y, p = null;
  for (let i = 0; i < 4; i++) { if (v.y > -0.02) return null; const t = (y - camera.position.y) / v.y; p = camera.position.clone().addScaledVector(v, t); const q = nearest(p.x, p.z, 8); y = q ? q.y : groundH(p.x, p.z) + 0.22; }
  return p;
}
function pick(p) {
  for (const s of MOD.signs) if (Math.hypot(s.x - p.x, s.z - p.z) < 2.2) return { kind: 'sign', id: s.id };
  for (const g of MOD.rings) if (Math.hypot(g.x - p.x, g.z - p.z) < g.R + 1.5) return { kind: 'ring', id: g.id };
  const q = nearest(p.x, p.z, 10); return q ? { kind: 'road', id: q.r.id, q } : null;
}

// ---------------------------------------------------------------- interface (style jeu mobile)
const css = document.createElement('style');
css.textContent = `
:root{--rd-acc:#ffb547;--rd-cy:#38e8ff;--rd-bg:rgba(14,17,24,.78);--rd-line:rgba(255,255,255,.12)}
#rdBtn{position:fixed;right:calc(10px + env(safe-area-inset-right));top:calc(50% + 36px);z-index:99999;width:52px;height:52px;border-radius:50%;border:2px solid #ffffff55;background:rgba(15,20,28,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:0;box-shadow:0 4px 14px #0007;cursor:pointer}
#rdBtn svg{width:26px;height:26px}
body.rd-on #touch,body.rd-on #speedo,body.rd-on .btns,body.rd-on #mapwrap,body.rd-on #street,body.rd-on #eqBtn,body.rd-on #rdBtn,body.rd-on #mswitch,body.rd-on #credits{display:none!important}
#rdLayer{position:fixed;inset:0;z-index:100000;display:none;touch-action:none;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif;color:#fff;-webkit-user-select:none;user-select:none}
body.rd-on #rdLayer{display:block}
#rdTop{position:absolute;left:calc(12px + env(safe-area-inset-left));right:calc(12px + env(safe-area-inset-right));top:calc(10px + env(safe-area-inset-top));display:flex;gap:8px;align-items:center;pointer-events:none}
#rdTop>*{pointer-events:auto}
.rdChip{height:44px;padding:0 14px;border-radius:22px;background:var(--rd-bg);backdrop-filter:blur(16px) saturate(1.4);-webkit-backdrop-filter:blur(16px) saturate(1.4);border:1px solid var(--rd-line);display:flex;align-items:center;gap:8px;font:700 13px/1 inherit;letter-spacing:.6px;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.35)}
.rdTitle{font:800 12px/1 inherit;letter-spacing:2px;text-transform:uppercase}
.rdTitle b{color:var(--rd-acc)}
#rdTools{display:flex;padding:4px;gap:2px}
#rdTools button,.rdIcon{height:36px;min-width:36px;padding:0 12px;border:0;border-radius:18px;background:transparent;color:#cfd6e4;font:700 12.5px inherit;letter-spacing:.4px;display:flex;align-items:center;gap:6px;cursor:pointer;transition:background .15s,color .15s}
#rdTools button.on{background:linear-gradient(180deg,#ffc56b,#ff9f1c);color:#1a1206;box-shadow:0 4px 14px rgba(255,159,28,.45)}
#rdTools svg,.rdIcon svg{width:18px;height:18px}
.rdSp{flex:1}
.rdBadge{min-width:18px;height:18px;border-radius:9px;background:#ff453a;color:#fff;font:800 11px/18px inherit;text-align:center;padding:0 5px}
.rdBadge.o{background:#ff9f0a;color:#1a1206}
#rdSheet{position:absolute;left:50%;bottom:calc(10px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(0);width:min(560px,calc(100vw - 24px));max-height:min(62vh,520px);overflow:auto;border-radius:24px;background:var(--rd-bg);backdrop-filter:blur(22px) saturate(1.5);-webkit-backdrop-filter:blur(22px) saturate(1.5);border:1px solid var(--rd-line);box-shadow:0 18px 50px rgba(0,0,0,.5);padding:14px 16px 16px;transition:transform .28s cubic-bezier(.2,.9,.2,1.05),opacity .2s;-webkit-overflow-scrolling:touch;touch-action:pan-y}
#rdSheet.hide{transform:translateX(-50%) translateY(120%);opacity:0;pointer-events:none}
@media (orientation:landscape) and (max-height:500px){#rdSheet{left:auto;right:calc(12px + env(safe-area-inset-right));transform:none;width:min(380px,46vw);top:calc(64px + env(safe-area-inset-top));bottom:calc(10px + env(safe-area-inset-bottom));max-height:none}#rdSheet.hide{transform:translateX(120%)}}
.rdGrab{width:38px;height:5px;border-radius:3px;background:rgba(255,255,255,.25);margin:-4px auto 10px}
.rdH{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.rdH h3{margin:0;font:800 18px/1.15 inherit;letter-spacing:.2px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rdTag{font:800 10px/1 inherit;letter-spacing:1px;text-transform:uppercase;padding:5px 8px;border-radius:8px;background:rgba(56,232,255,.14);color:var(--rd-cy);white-space:nowrap}
.rdTag.p{background:rgba(255,181,71,.16);color:var(--rd-acc)}.rdTag.v{background:rgba(48,209,88,.16);color:#30d158}
.rdStats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.rdStat{background:rgba(255,255,255,.06);border-radius:14px;padding:9px 8px;text-align:center}
.rdStat b{display:block;white-space:nowrap;font:800 17px/1.1 inherit;font-variant-numeric:tabular-nums}
.rdStat span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:600 9.5px/1.2 inherit;letter-spacing:.8px;text-transform:uppercase;color:#9aa6ba}
.rdRow{display:flex;align-items:center;gap:10px;margin:10px 0}
.rdRow label{flex:0 0 96px;font:700 12px inherit;letter-spacing:.6px;text-transform:uppercase;color:#aeb8c9}
.rdRow .val{flex:0 0 64px;text-align:right;font:800 15px inherit;font-variant-numeric:tabular-nums}
.rdRange{flex:1;-webkit-appearance:none;appearance:none;height:30px;background:transparent}
.rdRange::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,var(--rd-acc) var(--p,50%),rgba(255,255,255,.14) var(--p,50%))}
.rdRange::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:#fff;margin-top:-10px;box-shadow:0 2px 10px rgba(0,0,0,.45),0 0 0 4px rgba(255,181,71,.25)}
.rdStep{display:flex;align-items:center;background:rgba(255,255,255,.07);border-radius:14px;overflow:hidden}
.rdStep button{width:40px;height:38px;border:0;background:transparent;color:#fff;font:800 20px inherit;cursor:pointer}
.rdStep b{min-width:30px;text-align:center;font:800 16px inherit}
.rdSeg{display:flex;flex:1;background:rgba(255,255,255,.07);border-radius:14px;padding:3px;gap:3px}
.rdSeg button{flex:1;height:34px;border:0;border-radius:11px;background:transparent;color:#cfd6e4;font:800 13px inherit;cursor:pointer}
.rdSeg button.on{background:#fff;color:#111}
.rdBtns{display:flex;gap:8px;margin-top:14px}
.rdB{flex:1;height:46px;border:0;border-radius:15px;font:800 14px inherit;letter-spacing:.4px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
.rdB.p{background:linear-gradient(180deg,#ffc56b,#ff9f1c);color:#1a1206;box-shadow:0 6px 18px rgba(255,159,28,.35)}
.rdB.s{background:rgba(255,255,255,.09);color:#fff}
.rdB.d{background:rgba(255,69,58,.16);color:#ff6961}
.rdSrc{margin-top:12px;border-top:1px solid var(--rd-line);padding-top:10px;display:grid;grid-template-columns:auto 1fr auto;gap:5px 10px;font:600 12px inherit;color:#aeb8c9}
.rdSrc i{font-style:normal;color:#fff}
.rdDot{width:8px;height:8px;border-radius:50%;margin-top:3px}.rdDot.m{background:#30d158}.rdDot.e{background:#ff9f0a}.rdDot.d{background:#8e8e93}.rdDot.p{background:var(--rd-acc)}.rdDot.v{background:var(--rd-cy)}
.rdPal{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.rdPal button{aspect-ratio:1;border-radius:16px;border:2px solid transparent;background:rgba(255,255,255,.06);padding:8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#cfd6e4;font:700 9.5px inherit}
.rdPal button.on{border-color:var(--rd-acc);background:rgba(255,181,71,.12)}
.rdPal img{width:70%;height:auto}
.rdHint{font:600 13px/1.4 inherit;color:#aeb8c9;margin:2px 0 4px}
.rdList{display:flex;flex-direction:column;gap:6px}
.rdItem{display:flex;gap:10px;align-items:center;background:rgba(255,255,255,.06);border-radius:14px;padding:10px 12px;font:600 13px/1.35 inherit;cursor:pointer}
.rdItem .lv{width:10px;height:10px;border-radius:50%;flex:none}.rdItem .lv.r{background:#ff453a}.rdItem .lv.o{background:#ff9f0a}
#rdToast{position:absolute;left:50%;top:calc(66px + env(safe-area-inset-top));transform:translateX(-50%) translateY(-10px);opacity:0;transition:.25s;padding:10px 16px;border-radius:16px;background:rgba(14,17,24,.88);border:1px solid var(--rd-line);font:700 13px inherit;pointer-events:none;white-space:nowrap}
#rdToast.on{opacity:1;transform:translateX(-50%) translateY(0)}
#rdCross{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;pointer-events:none;opacity:.55}
`;
document.head.appendChild(css);
const ICON = {
  road: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 3 4 21M17 3l3 18M12 4v3M12 11v3M12 18v2"/></svg>',
  select: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 3l14 8-6 2-2 6z"/></svg>',
  ring: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
  sign: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2 21 18H3z"/><path d="M12 18v4"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
  vote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 11v9H4v-9zM7 11l4-8c1.6 0 2.6 1.2 2.2 2.8L12.6 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>',
};
const rdBtn = document.createElement('button'); rdBtn.id = 'rdBtn'; rdBtn.title = 'Éditeur routier'; rdBtn.setAttribute('aria-label', 'Éditeur routier'); rdBtn.innerHTML = ICON.road.replace('currentColor', '#ffb547'); document.body.appendChild(rdBtn);
const layer = document.createElement('div'); layer.id = 'rdLayer';
layer.innerHTML = `<div id="rdTop">
  <div class="rdChip rdTitle">Éditeur <b>routier</b></div>
  <div class="rdChip" id="rdTools">
    <button data-t="select" class="on">${ICON.select}<span>Sélection</span></button>
    <button data-t="ring">${ICON.ring}<span>Rond-point</span></button>
    <button data-t="sign">${ICON.sign}<span>Panneaux</span></button>
    <button data-t="alerts">${ICON.alert}<span>Alertes</span><i class="rdBadge" id="rdNA" style="display:none"></i></button>
    <button data-t="votes">${ICON.vote}<span>Votes</span></button>
  </div>
  <div class="rdSp"></div>
  <div class="rdChip" style="padding:0 4px"><button class="rdIcon" id="rdUndo" aria-label="Annuler">${ICON.undo}</button><button class="rdIcon" id="rdRedo" aria-label="Rétablir">${ICON.redo}</button></div>
  <button class="rdChip" id="rdSend" style="background:linear-gradient(180deg,#ffc56b,#ff9f1c);color:#1a1206;border:0">${ICON.send}<span id="rdSendT">Proposer</span></button>
  <button class="rdChip" id="rdClose" aria-label="Quitter l'éditeur" style="padding:0 12px">${ICON.close}</button>
</div>
<svg id="rdCross" viewBox="0 0 26 26"><path d="M13 3v7M13 16v7M3 13h7M16 13h7" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
<div id="rdSheet" class="hide"></div><div id="rdToast"></div>`;
document.body.appendChild(layer);
const sheet = $('rdSheet');
// les icônes du haut se réduisent sur petit écran
const st2 = document.createElement('style'); st2.textContent = '@media (max-width:1100px){#rdTools span,.rdTitle{display:none}#rdTools button{padding:0 10px}}@media (max-width:900px){#rdSendT{display:none}.rdChip{height:40px;padding:0 10px}#rdTools{padding:2px}#rdTools button{height:34px;min-width:34px}}'; document.head.appendChild(st2);
let toastT = 0; function toast(t) { const e = $('rdToast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 2200); }
const fmt = (v, d = 2) => Number(v).toFixed(d).replace('.', ',');
const sensTxt = s => s === 0 ? 'Double' : s === 1 ? 'Unique →' : 'Unique ←';

// historique (annuler / rétablir)
const HIST = [], FUT = [];
function commit(mut, msg) { HIST.push(JSON.stringify(LOC)); if (HIST.length > 80) HIST.shift(); FUT.length = 0; mut(); save(); rebuild(); if (msg) toast(msg); }
$('rdUndo').onclick = () => { if (!HIST.length) return; FUT.push(JSON.stringify(LOC)); LOC = JSON.parse(HIST.pop()); save(); rebuild(); toast('Annulé'); };
$('rdRedo').onclick = () => { if (!FUT.length) return; HIST.push(JSON.stringify(LOC)); LOC = JSON.parse(FUT.pop()); save(); rebuild(); toast('Rétabli'); };

function setRoad(id, o) { LOC.roads[id] = Object.assign({}, LOC.roads[id], o); }
function range(key, label, val, min, max, step, unit, on) {
  const p = ((val - min) / (max - min) * 100).toFixed(1);
  return `<div class="rdRow"><label>${label}</label><input class="rdRange" type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${val}" style="--p:${p}%"><span class="val" id="v_${key}">${fmt(val, step < 0.1 ? 2 : 1)} ${unit}</span></div>`;
}
const UI = {
  refresh() {
    const A = built.alerts || [], na = A.length, e = $('rdNA'); e.style.display = na ? '' : 'none'; e.textContent = na; e.className = 'rdBadge' + (A.some(a => a.lvl === 'r') ? '' : ' o');
    const n = Object.keys(LOC.roads).length + LOC.rings.length + LOC.signs.length; $('rdSendT').textContent = n ? `Proposer (${n})` : 'Proposer';
    if (ED.on) this.sheet();
  },
  sheet() {
    const t = ED.tool;
    if (t === 'alerts') return this.alerts();
    if (t === 'votes') return this.votes();
    if (t === 'sign' && !(selObj && selObj.kind === 'sign')) return this.palette();
    if (t === 'ring' && !(selObj && selObj.kind === 'ring')) { sheet.innerHTML = `<div class="rdGrab"></div><div class="rdH"><h3>Rond-point</h3><span class="rdTag">Outil</span></div><p class="rdHint">Touche un carrefour : le giratoire s'y pose, se raccorde à toutes les routes qui le traversent (une branche par route) et génère anneau, îlots, cédez-le-passage et panneaux AB25.</p>`; return sheet.classList.remove('hide'); }
    if (!selObj) { sheet.innerHTML = `<div class="rdGrab"></div><div class="rdH"><h3>Touche une route</h3></div><p class="rdHint">Un doigt : déplacer · Deux doigts : zoomer et tourner · Touche une route, un rond-point ou un panneau pour le modifier.</p>`; return sheet.classList.remove('hide'); }
    if (selObj.kind === 'road') return this.road(ROADS[selObj.id]);
    if (selObj.kind === 'ring') return this.ring(MOD.rings.find(g => g.id === selObj.id));
    if (selObj.kind === 'sign') return this.sign(MOD.signs.find(s => s.id === selObj.id));
  },
  road(r) {
    if (!r) return; const c = cur(r), n = c.lf + c.lb, lw = n ? c.w / n : 0, o = MOD.roads[r.id];
    const tag = o ? (isLocal('road', r.id) ? '<span class="rdTag p">Proposé</span>' : '<span class="rdTag v">Validé</span>') : `<span class="rdTag">${r.src === 'OSM' ? 'OSM' : 'IGN'}</span>`;
    const src = k => { const [s, st, cl] = source(r, k); return `<span class="rdDot ${cl}"></span><i>${s}</i><span>${st}</span>`; };
    sheet.innerHTML = `<div class="rdGrab"></div><div class="rdH"><h3>${r.name || 'Route sans nom'}</h3>${tag}</div>
    <div class="rdStats"><div class="rdStat"><b>${fmt(c.w)}</b><span>m largeur</span></div><div class="rdStat"><b>${c.lf}+${c.lb}</b><span>voies</span></div><div class="rdStat"><b>${fmt(lw)}</b><span>m / voie</span></div><div class="rdStat"><b>${c.v}</b><span>km/h</span></div></div>
    ${range('w', 'Largeur', c.w, 3, 20, 0.05, 'm')}
    <div class="rdRow"><label>Sens</label><div class="rdSeg" data-k="sens"><button data-v="0" class="${c.sens === 0 ? 'on' : ''}">⇄ Double</button><button data-v="1" class="${c.sens === 1 ? 'on' : ''}">→ A→B</button><button data-v="-1" class="${c.sens === -1 ? 'on' : ''}">← B→A</button></div></div>
    <div class="rdRow"><label>Voies A→B</label><div class="rdStep" data-k="lf"><button data-d="-1">−</button><b>${c.lf}</b><button data-d="1">+</button></div><div class="rdSp"></div><label style="flex:0 0 auto">B→A</label><div class="rdStep" data-k="lb"><button data-d="-1">−</button><b>${c.lb}</b><button data-d="1">+</button></div></div>
    ${range('tg', 'Trottoir G', c.tg, 0, 6, 0.1, 'm')}${range('td', 'Trottoir D', c.td, 0, 6, 0.1, 'm')}
    <div class="rdRow"><label>Ligne axe</label><div class="rdSeg" data-k="cl"><button data-v="tirets" class="${c.cl !== 'continue' ? 'on' : ''}">Tirets T1</button><button data-v="continue" class="${c.cl === 'continue' ? 'on' : ''}">Continue</button></div></div>
    <div class="rdRow"><label>Vitesse</label><div class="rdSeg" data-k="v">${[30, 50, 70, 90].map(v => `<button data-v="${v}" class="${c.v === v ? 'on' : ''}">${v}</button>`).join('')}</div></div>
    <div class="rdBtns">${isLocal('road', r.id) ? '<button class="rdB d" id="rdReset">Annuler mes modifs</button>' : ''}<button class="rdB s" id="rdRing">Rond-point au bout</button></div>
    <div class="rdSrc">${src('w')}${src('sens')}${src('tg')}<span class="rdDot m"></span><i>Tracé IGN BD TOPO</i><span>mesuré</span></div>`;
    sheet.classList.remove('hide');
    let live = 0;
    sheet.querySelectorAll('.rdRange').forEach(inp => {
      inp.oninput = () => { const k = inp.dataset.k, v = +inp.value; inp.style.setProperty('--p', ((v - inp.min) / (inp.max - inp.min) * 100) + '%'); $('v_' + k).textContent = fmt(v, inp.step < 0.1 ? 2 : 1) + ' m'; if (!live) { HIST.push(JSON.stringify(LOC)); FUT.length = 0; live = 1; } setRoad(r.id, { [k]: v }); clearTimeout(UI._t); UI._t = setTimeout(() => { save(); MOD = merged(); rebuildKeep(); }, 60); };
      inp.onchange = () => { live = 0; save(); rebuild(); };
    });
    sheet.querySelectorAll('.rdSeg').forEach(sg => sg.querySelectorAll('button').forEach(b => b.onclick = () => {
      const k = sg.dataset.k, v = k === 'cl' ? b.dataset.v : +b.dataset.v;
      commit(() => { const o = { [k]: v }; if (k === 'sens') { const tot = Math.max(1, c.lf + c.lb); o.lf = v === -1 ? 0 : (v === 1 ? tot : Math.max(1, Math.ceil(tot / 2))); o.lb = v === 1 ? 0 : (v === -1 ? tot : Math.max(1, Math.floor(tot / 2))); } setRoad(r.id, o); }, k === 'sens' ? 'Sens : ' + sensTxt(v) : '');
    }));
    sheet.querySelectorAll('.rdStep').forEach(sp => sp.querySelectorAll('button').forEach(b => b.onclick = () => {
      const k = sp.dataset.k, v = Math.max(0, Math.min(4, c[k] + +b.dataset.d)); const o = { [k]: v }; const lf = k === 'lf' ? v : c.lf, lb = k === 'lb' ? v : c.lb; o.sens = lf && lb ? 0 : lf ? 1 : lb ? -1 : c.sens;
      commit(() => setRoad(r.id, o));
    }));
    const rs = $('rdReset'); if (rs) rs.onclick = () => commit(() => { delete LOC.roads[r.id]; }, 'Modifications retirées');
    $('rdRing').onclick = () => { const P = roadPoly(r); const q = ED.lastTap ? (Math.hypot(P[0].x - ED.lastTap.x, P[0].z - ED.lastTap.z) < Math.hypot(P[P.length - 1].x - ED.lastTap.x, P[P.length - 1].z - ED.lastTap.z) ? P[0] : P[P.length - 1]) : P[0]; placeRing(q.x, q.z); };
  },
  ring(g) {
    if (!g) return; const loc = isLocal('ring', g.id);
    sheet.innerHTML = `<div class="rdGrab"></div><div class="rdH"><h3>Giratoire</h3><span class="rdTag ${loc ? 'p' : 'v'}">${loc ? 'Proposé' : 'Validé'}</span></div>
    <div class="rdStats"><div class="rdStat"><b>${fmt(g.R, 1)}</b><span>m rayon</span></div><div class="rdStat"><b>${fmt(g.a || 7, 1)}</b><span>m anneau</span></div><div class="rdStat"><b>${g._br ?? branches(g).length}</b><span>branches</span></div><div class="rdStat"><b>AB25</b><span>régime</span></div></div>
    ${range('R', 'Rayon ext.', g.R, 7.5, 35, 0.5, 'm')}${range('a', 'Anneau', g.a || 7, 4.5, 10, 0.5, 'm')}
    <p class="rdHint">Les entrées cèdent le passage aux véhicules sur l'anneau ; sens anti-horaire. Les branches suivent les routes qui traversent le cercle.</p>
    <div class="rdBtns"><button class="rdB d" id="rdDel">Supprimer le giratoire</button></div>`;
    sheet.classList.remove('hide');
    sheet.querySelectorAll('.rdRange').forEach(inp => {
      inp.oninput = () => { const k = inp.dataset.k, v = +inp.value; inp.style.setProperty('--p', ((v - inp.min) / (inp.max - inp.min) * 100) + '%'); $('v_' + k).textContent = fmt(v, 1) + ' m'; editRing(g.id, { [k]: v }, true); };
      inp.onchange = () => { save(); rebuild(); };
    });
    $('rdDel').onclick = () => commit(() => { LOC.rings = LOC.rings.filter(x => x.id !== g.id); if (!loc) LOC.rings.push({ id: g.id, del: 1 }); selObj = null; }, 'Giratoire supprimé');
  },
  sign(s) {
    if (!s) return; const d = SIGNS[s.t], r = ROADS[s.road], loc = isLocal('sign', s.id);
    sheet.innerHTML = `<div class="rdGrab"></div><div class="rdH"><img src="${face(s.t).image.toDataURL()}" style="width:40px;height:40px"><h3>${d.nom}</h3><span class="rdTag ${loc ? 'p' : 'v'}">${d.code}</span></div>
    <p class="rdHint">Sur ${r ? (r.name || 'route sans nom') : 'route'} · pour le sens ${s.dir > 0 ? 'A→B' : 'B→A'}. ${s.t === 'stop' || s.t === 'cedez' ? 'Ligne d\'effet peinte au sol.' : s.t === 'interdit' || s.t === 'sensunique' ? 'Change le sens de la rue.' : /^v/.test(s.t) ? 'Fixe la vitesse de la rue.' : ''}</p>
    <div class="rdBtns"><button class="rdB s" id="rdFlip">⇄ Autre sens</button><button class="rdB d" id="rdDel">Retirer</button></div>`;
    sheet.classList.remove('hide');
    $('rdFlip').onclick = () => commit(() => { const n = flipSign(s); upsert('signs', n); }, 'Panneau retourné');
    $('rdDel').onclick = () => commit(() => { LOC.signs = LOC.signs.filter(x => x.id !== s.id); if (!loc) LOC.signs.push({ id: s.id, del: 1 }); selObj = null; }, 'Panneau retiré');
  },
  palette() {
    sheet.innerHTML = `<div class="rdGrab"></div><div class="rdH"><h3>Panneaux</h3><span class="rdTag">IISR</span></div><p class="rdHint">Choisis un panneau puis touche le bord de la route où il doit se dresser : il s'adresse aux véhicules qui roulent de ce côté.</p>
    <div class="rdPal">${Object.entries(SIGNS).map(([k, d]) => `<button data-s="${k}" class="${ED.signType === k ? 'on' : ''}"><img src="${face(k).image.toDataURL()}" alt=""><span>${d.nom}</span></button>`).join('')}</div>`;
    sheet.classList.remove('hide');
    sheet.querySelectorAll('.rdPal button').forEach(b => b.onclick = () => { ED.signType = b.dataset.s; UI.palette(); });
  },
  alerts() {
    const A = built.alerts || [];
    sheet.innerHTML = `<div class="rdGrab"></div><div class="rdH"><h3>Contrôle de cohérence</h3><span class="rdTag">${A.length} alerte${A.length > 1 ? 's' : ''}</span></div>
    ${A.length ? '<div class="rdList">' + A.map((a, i) => `<div class="rdItem" data-i="${i}"><span class="lv ${a.lvl}"></span><span>${a.txt}</span></div>`).join('') + '</div>' : '<p class="rdHint">✅ Aucune incohérence : sens, voies, panneaux et giratoires sont logiques.</p>'}
    <p class="rdHint" style="margin-top:10px">Rouge = bloquant (impossible de proposer) · Orange = à vérifier.</p>`;
    sheet.classList.remove('hide');
    sheet.querySelectorAll('.rdItem').forEach(el => el.onclick = () => { const a = A[+el.dataset.i]; ED.cam.x = a.x; ED.cam.z = a.z; ED.cam.dist = 45; if (a.ref.road != null) selObj = { kind: 'road', id: a.ref.road }; else if (a.ref.ring) selObj = { kind: 'ring', id: a.ref.ring }; else if (a.ref.sign) selObj = { kind: 'sign', id: a.ref.sign }; setTool('select'); drawSel(); });
  },
  async votes() {
    sheet.innerHTML = `<div class="rdGrab"></div><div class="rdH"><h3>Propositions des joueurs</h3><span class="rdTag">Vote</span></div><p class="rdHint">Chargement…</p>`; sheet.classList.remove('hide');
    let list = [];
    try { list = await (await fetch(`https://api.github.com/repos/${REPO}/issues?state=open&per_page=30`)).json(); list = (Array.isArray(list) ? list : []).filter(i => /^\[ROUTE\]/.test(i.title)); } catch (e) {}
    if (ED.tool !== 'votes') return;
    sheet.innerHTML = `<div class="rdGrab"></div><div class="rdH"><h3>Propositions des joueurs</h3><span class="rdTag">${list.length}</span></div>
    <p class="rdHint">Une proposition est appliquée à toute la ville quand elle atteint 5 👍 sur GitHub.</p>
    ${list.length ? '<div class="rdList">' + list.map((i, k) => `<div class="rdItem" data-k="${k}"><span style="font-size:18px">🛣️</span><span style="flex:1">${i.title.replace(/^\[ROUTE\]\s*/, '')}<br><small style="color:#9aa6ba">par ${i.user.login} · ${i.reactions?.['+1'] || 0} 👍</small></span><button class="rdB s" style="flex:0 0 auto;height:36px;padding:0 12px" data-a="voir">Voir</button><button class="rdB p" style="flex:0 0 auto;height:36px;padding:0 12px" data-a="vote">👍</button></div>`).join('') + '</div>' : '<p class="rdHint">Aucune proposition en attente.</p>'}
    ${PREVIEW ? '<div class="rdBtns"><button class="rdB s" id="rdNoPrev">Fermer l\'aperçu</button></div>' : ''}`;
    sheet.querySelectorAll('.rdItem button').forEach(b => b.onclick = ev => {
      ev.stopPropagation(); const i = list[+b.closest('.rdItem').dataset.k];
      if (b.dataset.a === 'vote') window.open(i.html_url, '_blank');
      else { const m = /```json\s*([\s\S]*?)```/.exec(i.body || ''); try { PREVIEW = JSON.parse(m[1]); rebuild(); const g = (PREVIEW.rings || [])[0] || (PREVIEW.signs || [])[0]; if (g) { ED.cam.x = g.x; ED.cam.z = g.z; } else { const id = Object.keys(PREVIEW.roads || {})[0]; if (id) { const r = ROADS[id]; ED.cam.x = r.p[r.m & ~1]; ED.cam.z = r.p[(r.m & ~1) + 1]; } } toast('Aperçu de la proposition'); } catch (e) { toast('Proposition illisible'); } }
    });
    const np = $('rdNoPrev'); if (np) np.onclick = () => { PREVIEW = null; rebuild(); UI.votes(); };
  },
};
// reconstruction légère pendant un glissement de curseur
let kt = 0; function rebuildKeep() { const now = performance.now(); if (now - kt < 50) return; kt = now; const s = selObj; rebuild(); selObj = s; }
function upsert(kind, o) { LOC[kind] = (LOC[kind] || []).filter(x => x.id !== o.id); LOC[kind].push(o); }
function editRing(id, o, live) {
  const g = MOD.rings.find(x => x.id === id); if (!g) return;
  const n = Object.assign({}, g, o); delete n._br; upsert('rings', n);
  if (live) { clearTimeout(UI._r); UI._r = setTimeout(() => { MOD = merged(); rebuildKeep(); }, 40); }
}
function flipSign(s) {
  const r = ROADS[s.road], q = nearest(s.x, s.z, 12); if (!r || !q) return s;
  const c = cur(r), hw = c.w / 2 + 0.9, dir = -s.dir, sg = dir > 0 ? -1 : 1; // le panneau se tient à droite du sens servi
  const nx = q.tz, nz = -q.tx; return Object.assign({}, s, { dir, x: q.x + nx * hw * sg, z: q.z + nz * hw * sg, hd: Math.atan2(-q.tx * dir, -q.tz * dir) });
}
function placeRing(x, z) {
  const n = nearestNode(x, z, 25); const cx = n ? n.x : x, cz = n ? n.z : z;
  let maxW = 6; const q = nearest(cx, cz, 25); for (const b of branches({ x: cx, z: cz, R: 14 })) maxW = Math.max(maxW, b.hw * 2);
  const g = { id: 'g' + Date.now().toString(36), x: +cx.toFixed(2), z: +cz.toFixed(2), y: q ? +q.y.toFixed(2) : undefined, R: Math.min(22, Math.max(12, Math.round(maxW + 6))), a: 7 };
  commit(() => upsert('rings', g), 'Rond-point posé'); selObj = { kind: 'ring', id: g.id }; setTool('select'); drawSel();
}
function placeSign(p) {
  const q = nearest(p.x, p.z, 12); if (!q) return toast('Touche le bord d\'une route');
  const r = q.r, c = cur(r), dir = q.lat < 0 ? 1 : -1, hw = c.w / 2 + 0.9, sg = dir > 0 ? -1 : 1, nx = q.tz, nz = -q.tx;
  const s = { id: 's' + Date.now().toString(36), t: ED.signType, road: r.id, dir, x: +(q.x + nx * hw * sg).toFixed(2), z: +(q.z + nz * hw * sg).toFixed(2), y: +q.y.toFixed(2), hd: Math.atan2(-q.tx * dir, -q.tz * dir) };
  let msg = SIGNS[s.t].nom + ' posé';
  commit(() => { upsert('signs', s); const m = applySign(s); if (m) msg += ' · ' + m; }, msg);
  selObj = { kind: 'sign', id: s.id }; drawSel(); UI.sheet();
}
function setTool(t) { ED.tool = t; layer.querySelectorAll('#rdTools button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); if (t === 'ring' || (t === 'sign')) { selObj = null; drawSel(); } UI.sheet(); }
layer.querySelectorAll('#rdTools button').forEach(b => b.onclick = e => { e.stopPropagation(); setTool(b.dataset.t); });

// propositions → issue GitHub [ROUTE] (le propriétaire est appliqué tout de suite, les autres au vote)
$('rdSend').onclick = () => {
  const n = Object.keys(LOC.roads).length + LOC.rings.length + LOC.signs.length; if (!n) return toast('Aucune modification à proposer');
  if ((built.alerts || []).some(a => a.lvl === 'r')) { setTool('alerts'); return toast('Corrige les alertes rouges d\'abord'); }
  const clean = JSON.parse(JSON.stringify(LOC)); for (const g of clean.rings) delete g._br;
  const names = [...new Set(Object.keys(clean.roads).map(id => ROADS[id]?.name).filter(Boolean))].slice(0, 3);
  const title = `[ROUTE] ${names.join(', ') || 'Modifications'}${clean.rings.length ? ' + ' + clean.rings.length + ' giratoire(s)' : ''}${clean.signs.length ? ' + ' + clean.signs.length + ' panneau(x)' : ''}`;
  const body = 'Proposition faite depuis l\'éditeur routier du jeu. Votez 👍 pour l\'appliquer à toute la ville (5 votes).\n\n```json\n' + JSON.stringify(clean) + '\n```';
  window.open(`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, '_blank');
  toast('Valide la proposition sur GitHub');
};
$('rdClose').onclick = () => setEdit(false);
rdBtn.onclick = e => { e.stopPropagation(); setEdit(true); };

// ---------------------------------------------------------------- gestes
function setEdit(on) {
  ED.on = on; document.body.classList.toggle('rd-on', on);
  if (on) { const S = window.__S || { x: 0, y: 0, z: 0 }; Object.assign(ED.cam, { x: S.x, y: S.y, z: S.z, dist: 70, yaw: Math.atan2(camera.position.x - S.x, camera.position.z - S.z), pitch: 0.95 }); setTool('select'); }
  else { selObj = null; drawSel(); PREVIEW = null; rebuild(); }
}
const ptr = new Map(); let g0 = null, moved = 0, downT = 0;
layer.addEventListener('pointerdown', e => {
  if (e.target.closest('#rdTop,#rdSheet')) return; layer.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptr.size === 1) { moved = 0; downT = performance.now(); } g0 = snapshot();
});
function snapshot() { const p = [...ptr.values()]; const c = { x: ED.cam.x, z: ED.cam.z, dist: ED.cam.dist, yaw: ED.cam.yaw, pitch: ED.cam.pitch }; if (p.length >= 2) { c.d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); c.a = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x); c.my = (p[0].y + p[1].y) / 2; } else if (p.length) { c.px = p[0].x; c.py = p[0].y; } return c; }
layer.addEventListener('pointermove', e => {
  if (!ptr.has(e.pointerId)) return; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); const p = [...ptr.values()];
  if (p.length === 1 && g0.px != null) {
    const dx = p[0].x - g0.px, dy = p[0].y - g0.py; if (Math.hypot(dx, dy) > 8) moved = 1; if (!moved) return;
    const k = ED.cam.dist / renderer.domElement.clientHeight * 1.6, cy = Math.cos(ED.cam.yaw), sy = Math.sin(ED.cam.yaw);
    ED.cam.x = g0.x - (dx * cy + dy * sy / Math.sin(ED.cam.pitch)) * k; ED.cam.z = g0.z - (-dx * sy + dy * cy / Math.sin(ED.cam.pitch)) * k;
  } else if (p.length >= 2 && g0.d) {
    moved = 1; const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), a = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x), my = (p[0].y + p[1].y) / 2;
    ED.cam.dist = Math.max(12, Math.min(600, g0.dist * g0.d / Math.max(10, d))); ED.cam.yaw = g0.yaw - (a - g0.a); ED.cam.pitch = Math.max(0.35, Math.min(1.45, g0.pitch + (my - g0.my) * 0.006));
  }
  const q = nearest(ED.cam.x, ED.cam.z, 40); ED.cam.y += ((q ? q.y : groundH(ED.cam.x, ED.cam.z)) - ED.cam.y) * 0.3;
});
const up = e => {
  if (!ptr.has(e.pointerId)) return; ptr.delete(e.pointerId);
  if (!ptr.size && !moved && performance.now() - downT < 450) tap(e.clientX, e.clientY);
  g0 = snapshot();
};
layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up);
layer.addEventListener('wheel', e => { e.preventDefault(); ED.cam.dist = Math.max(12, Math.min(600, ED.cam.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
function tap(x, y) {
  const p = groundAt(x, y); if (!p) return; ED.lastTap = p;
  if (ED.tool === 'ring') return placeRing(p.x, p.z);
  if (ED.tool === 'sign') return placeSign(p);
  if (ED.tool === 'alerts' || ED.tool === 'votes') setTool('select');
  selObj = pick(p); drawSel(); UI.sheet();
}
// feux tricolores : cycle 20 s vert, 3 s orange, 22 s rouge
(function anim() { const t = performance.now() / 1000; for (const l of LIGHTS) { const c = ((t / 45 + l.ph) % 1) * 45; const s = c < 20 ? 2 : c < 23 ? 1 : 0; l.L.forEach((m, i) => { m.emissiveIntensity = i === s ? 2.2 : 0.04; }); } requestAnimationFrame(anim); })();

// ---------------------------------------------------------------- modifications officielles
async function loadOfficial() {
  const _cd = window.CITY ? CITY.data : 'data/';
  for (const u of [`https://raw.githubusercontent.com/${REPO}/main/${_cd}routes_modifs.json?t=${Date.now()}`, _cd + 'routes_modifs.json' + V]) {
    try { const r = await fetch(u); if (r.ok) { OFF = Object.assign(empty(), await r.json()); break; } } catch (e) {}
  }
  // une proposition locale déjà validée (même id / même valeur) n'est plus « proposée »
  for (const g of OFF.rings) LOC.rings = LOC.rings.filter(x => x.id !== g.id);
  for (const s of OFF.signs) LOC.signs = LOC.signs.filter(x => x.id !== s.id);
  for (const [id, o] of Object.entries(OFF.roads)) if (LOC.roads[id] && JSON.stringify(LOC.roads[id]) === JSON.stringify(o)) delete LOC.roads[id];
  save(); rebuild();
}
rebuild(); loadOfficial();
window.__ROUTES = { ROADS, cur, rebuild, setEdit, ED, get LOC() { return LOC; }, get MOD() { return MOD; }, placeRing, placeSign: p => placeSign(p), nearest, built, setTool, pick: p => { selObj = pick(p); drawSel(); UI.sheet(); return selObj; } };
