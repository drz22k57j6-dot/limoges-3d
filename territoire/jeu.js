// TERRITOIRE — Paper.io dans la vraie ville (Limoges 3D).
// Tu roules, ta trace suit ta voiture ; boucle-la en revenant chez ton équipe : tout ce qui est entouré devient à vous.
// Si un rival coupe ta trace avant que tu rentres, tu perds ta trace et tu repars de chez toi.
import * as THREE from 'three';
import { connect } from './net.js';

const $ = id => document.getElementById(id);
const X0 = 562924, Y0 = 6528957;           // origine Limoges 3D (31 allée Le Gréco)
const HALF = 700, CELL = 4, G = (2 * HALF) / CELL; // zone 1,4 km × 1,4 km, cases de 4 m
const MINX = -HALF, MINZ = -HALF;
const TEAM_COLORS = ['#ff3b30', '#0a84ff', '#30d158', '#ffd60a', '#bf5af2', '#ff9f0a', '#64d2ff', '#ff375f', '#a2845e', '#5e5ce6', '#ffffff', '#00c7be'];

// ---------------- données du jeu Limoges 3D (relief + emprises des bâtiments) ----------------
let relief, H0;
function parseRelief(buf) {
  const dv = new DataView(buf); H0 = dv.getFloat32(0, true); const n = dv.getUint32(4, true); let o = 8; const t = [];
  for (let i = 0; i < n; i++) { const x0 = dv.getFloat32(o, true), y0 = dv.getFloat32(o + 4, true), s = dv.getFloat32(o + 8, true), mn = dv.getFloat32(o + 12, true), N = dv.getUint32(o + 16, true); o += 20; const h = new Uint16Array(buf.slice(o, o + N * N * 2)); o += N * N * 2; t.push({ x0, y0, s, mn, N, h }); }
  return t;
}
function groundH(x, z) {
  const Nn = -z;
  for (const t of relief) {
    if (x < t.x0 || x > t.x0 + 2000 || Nn < t.y0 || Nn > t.y0 + 2000) continue;
    const n = t.N - 1; let a = (x - t.x0) / t.s, b = (Nn - t.y0) / t.s; a = Math.min(Math.max(a, 0), n - 1e-6); b = Math.min(Math.max(b, 0), n - 1e-6);
    const a0 = a | 0, b0 = b | 0, fx = a - a0, fy = b - b0, N = t.N, H = t.h;
    const h00 = H[b0 * N + a0], h10 = H[b0 * N + a0 + 1], h01 = H[(b0 + 1) * N + a0], h11 = H[(b0 + 1) * N + a0 + 1];
    return (fx >= fy ? h00 + fx * (h10 - h00) + fy * (h11 - h10) : h00 + fy * (h01 - h00) + fx * (h11 - h01)) * 0.01 + t.mn - H0;
  }
  return 0;
}
const BLD = []; const bGrid = new Map(); const BG = 32;
function parseBuildings(buf) {
  const dv = new DataView(buf), n = dv.getUint32(0, true); let o = 4;
  for (let i = 0; i < n; i++) {
    const m = dv.getUint32(o, true), top = dv.getFloat32(o + 4, true); o += 8; const r = new Float32Array(buf.slice(o, o + m * 8)); o += m * 8;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let k = 0; k < m; k++) { x0 = Math.min(x0, r[2 * k]); x1 = Math.max(x1, r[2 * k]); z0 = Math.min(z0, r[2 * k + 1]); z1 = Math.max(z1, r[2 * k + 1]); }
    if (x1 < MINX || x0 > -MINX || z1 < MINZ || z0 > -MINZ) continue;
    const b = { r, top, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, owner: 0 }; const id = BLD.length; BLD.push(b);
    for (let a = Math.floor(x0 / BG); a <= Math.floor(x1 / BG); a++) for (let c = Math.floor(z0 / BG); c <= Math.floor(z1 / BG); c++) { const k = a * 10000 + c; let l = bGrid.get(k); if (!l) bGrid.set(k, l = []); l.push(id); }
  }
}
function inRing(x, z, r) { let ins = false; const m = r.length / 2; for (let i = 0, j = m - 1; i < m; j = i++) { const xi = r[2 * i], zi = r[2 * i + 1], xj = r[2 * j], zj = r[2 * j + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; } return ins; }
function hitBuilding(x, z) { const l = bGrid.get(Math.floor(x / BG) * 10000 + Math.floor(z / BG)); if (!l) return false; for (const id of l) { const b = BLD[id]; if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue; if (inRing(x, z, b.r)) return true; } return false; }

// ---------------- état du territoire ----------------
const own = new Uint8Array(G * G);          // 0 = libre, sinon index d'équipe + 1
const trailOf = new Int32Array(G * G).fill(-1); // index de joueur qui a une trace sur la case
const teams = [];                           // { name, color, cells, three: Color }
const teamIdx = new Map();
function team(name, color) {
  if (teamIdx.has(name)) return teamIdx.get(name);
  const i = teams.length; teams.push({ name, color: color || TEAM_COLORS[i % TEAM_COLORS.length], cells: 0, c3: new THREE.Color(color || TEAM_COLORS[i % TEAM_COLORS.length]) }); teamIdx.set(name, i); return i;
}
const cellOf = (x, z) => { const i = Math.floor((x - MINX) / CELL), j = Math.floor((z - MINZ) / CELL); return i < 0 || j < 0 || i >= G || j >= G ? -1 : j * G + i; };
const cellCenter = c => [MINX + (c % G + 0.5) * CELL, MINZ + (Math.floor(c / G) + 0.5) * CELL];

// joueurs (le local, les autres, les robots)
const players = new Map(); // id -> { id, name, team, x, z, h, speed, trail: [], car, local, bot, slot }
let slotN = 0; const slotToId = [];
function addPlayer(id, name, teamName, color, opts = {}) {
  let p = players.get(id); if (p) return p;
  p = { id, name, team: team(teamName, color), x: 0, z: 0, h: 0, speed: 0, steer: 0, trail: [], slot: slotN++, lastSeen: performance.now(), ...opts };
  slotToId[p.slot] = id; p.car = makeCar(teams[p.team].c3); scene.add(p.car); p.label = makeLabel(name, teams[p.team].color); scene.add(p.label);
  players.set(id, p); return p;
}

// ---------------- rendu ----------------
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa9c6e6); scene.fog = new THREE.Fog(0xa9c6e6, 300, 1100);
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 3000);
scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x6a6050, 1.1));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2); sun.position.set(-200, 400, 150); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 900 }); scene.add(sun, sun.target);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

let terrTex, terrData, bMesh, bColors, bRanges = [];
function buildWorld(orthoImg) {
  // sol : maillage 4 m suivant le relief, photo aérienne IGN
  const geo = new THREE.PlaneGeometry(2 * HALF, 2 * HALF, G, G); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, groundH(x, z)); uv.setXY(i, (x - MINX) / (2 * HALF), (z - MINZ) / (2 * HALF)); }
  geo.computeVertexNormals();
  const ot = new THREE.Texture(orthoImg); ot.flipY = false; ot.colorSpace = THREE.SRGBColorSpace; ot.anisotropy = 8; ot.needsUpdate = true;
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: orthoImg ? ot : null, color: orthoImg ? 0xffffff : 0x7c8f6a, roughness: 1 })); ground.receiveShadow = true; scene.add(ground);
  // calque du territoire (même maillage, texture d'une case par pixel)
  terrData = new Uint8Array(G * G * 4); terrTex = new THREE.DataTexture(terrData, G, G); terrTex.flipY = false; terrTex.magFilter = THREE.NearestFilter; terrTex.needsUpdate = true;
  const ov = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: terrTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  ov.renderOrder = 1; scene.add(ov);
  // bâtiments : extrusions simples, couleur par vertex (devient la couleur de l'équipe propriétaire)
  const pos = [], col = [], idx = [];
  for (const [id, b] of BLD.entries()) {
    const m = b.r.length / 2 - 1, start = pos.length / 3; let gmin = Infinity;
    for (let k = 0; k < m; k++) gmin = Math.min(gmin, groundH(b.r[2 * k], b.r[2 * k + 1]));
    const top = Math.max(gmin + 2.5, b.top), base = gmin - 1;
    for (let k = 0; k < m; k++) { const ax = b.r[2 * k], az = b.r[2 * k + 1], bx = b.r[2 * k + 2], bz = b.r[2 * k + 3], v = pos.length / 3;
      pos.push(ax, base, az, bx, base, bz, bx, top, bz, ax, top, az); idx.push(v, v + 2, v + 1, v, v + 3, v + 2); }
    const flat = []; for (let k = 0; k < m; k++) flat.push(b.r[2 * k], b.r[2 * k + 1]);
    const tri = THREE.ShapeUtils.triangulateShape(Array.from({ length: m }, (_, k) => new THREE.Vector2(flat[2 * k], flat[2 * k + 1])), []), rv = pos.length / 3;
    for (let k = 0; k < m; k++) pos.push(flat[2 * k], top, flat[2 * k + 1]);
    for (const t of tri) idx.push(rv + t[0], rv + t[2], rv + t[1]);
    const n = pos.length / 3 - start; for (let k = 0; k < n; k++) col.push(0.83, 0.8, 0.75);
    bRanges[id] = [start, n];
  }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bColors = new THREE.Float32BufferAttribute(col, 3); bg.setAttribute('color', bColors); bg.setIndex(idx); bg.computeVertexNormals();
  bMesh = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })); bMesh.castShadow = bMesh.receiveShadow = true; scene.add(bMesh);
}
// une voiture « simple mais réaliste » : carrosserie profilée, vitres, roues, phares
function makeCar(color) {
  const g = new THREE.Group();
  const s = new THREE.Shape(); s.moveTo(-2.1, 0.35); s.lineTo(2.15, 0.35); s.quadraticCurveTo(2.3, 0.4, 2.3, 0.75); s.lineTo(2.1, 0.95); s.lineTo(0.9, 1.05); s.lineTo(0.35, 1.45); s.lineTo(-1.2, 1.45); s.lineTo(-1.85, 1.05); s.lineTo(-2.15, 0.98); s.quadraticCurveTo(-2.25, 0.6, -2.1, 0.35);
  const body = new THREE.ExtrudeGeometry(s, { depth: 1.72, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }); body.translate(0, 0, -0.86); body.rotateY(Math.PI / 2);
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15 });
  const b = new THREE.Mesh(body, paint); b.castShadow = true; g.add(b);
  const glass = new THREE.MeshStandardMaterial({ color: 0x15202a, metalness: 0.6, roughness: 0.08 });
  const w = new THREE.Shape(); w.moveTo(0.82, 1.08); w.lineTo(0.33, 1.4); w.lineTo(-1.15, 1.4); w.lineTo(-1.75, 1.08);
  const wg = new THREE.ExtrudeGeometry(w, { depth: 1.76, bevelEnabled: false }); wg.translate(0, 0.005, -0.88); wg.rotateY(Math.PI / 2); g.add(new THREE.Mesh(wg, glass));
  const wheelG = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16); wheelG.rotateZ(Math.PI / 2); const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  for (const [x, z] of [[0.82, 1.38], [-0.82, 1.38], [0.82, -1.35], [-0.82, -1.35]]) { const wh = new THREE.Mesh(wheelG, tyre); wh.position.set(x, 0.36, z); wh.castShadow = true; g.add(wh); }
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6d0 }), tail = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  for (const x of [0.6, -0.6]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.05), lamp); l.position.set(x, 0.78, 2.28); g.add(l); const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.05), tail); t.position.set(x, 0.85, -2.2); g.add(t); }
  return g;
}
function makeLabel(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = 'bold 30px -apple-system,sans-serif'; x.textAlign = 'center'; x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.roundRect(8, 8, 240, 48, 20); x.fill(); x.fillStyle = color; x.fillText(text.slice(0, 14), 128, 43);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); sp.scale.set(6, 1.5, 1); sp.renderOrder = 5; return sp;
}

// ---------------- territoire : peinture, capture, scores ----------------
const dirtyBld = new Set(); let texDirty = true;
function paint(c) {
  const o = own[c], t = trailOf[c], k = c * 4;
  if (t >= 0) { const p = players.get(slotToId[t]); const col = p ? teams[p.team].c3 : null; if (col) { terrData[k] = col.r * 255; terrData[k + 1] = col.g * 255; terrData[k + 2] = col.b * 255; terrData[k + 3] = 235; texDirty = true; return; } }
  if (o) { const col = teams[o - 1].c3; terrData[k] = col.r * 255; terrData[k + 1] = col.g * 255; terrData[k + 2] = col.b * 255; terrData[k + 3] = 120; } else terrData[k + 3] = 0;
  texDirty = true;
}
function setOwner(c, t1) { // t1 = équipe + 1
  const o = own[c]; if (o === t1) return; if (o) teams[o - 1].cells--; if (t1) teams[t1 - 1].cells++; own[c] = t1; paint(c);
  const [x, z] = cellCenter(c); const l = bGrid.get(Math.floor(x / BG) * 10000 + Math.floor(z / BG)); if (l) for (const id of l) dirtyBld.add(id);
}
function refreshBuildings() {
  if (!dirtyBld.size || !bColors) return;
  for (const id of dirtyBld) {
    const b = BLD[id]; let best = 0, cnt = new Map(), tot = 0;
    for (let x = b.x0 + 1; x < b.x1; x += CELL) for (let z = b.z0 + 1; z < b.z1; z += CELL) { if (!inRing(x, z, b.r)) continue; const c = cellOf(x, z); if (c < 0) continue; tot++; const o = own[c]; if (o) cnt.set(o, (cnt.get(o) || 0) + 1); }
    if (!tot) { const c = cellOf(b.cx, b.cz); if (c >= 0 && own[c]) cnt.set(own[c], 1), tot = 1; }
    for (const [o, n] of cnt) if (n > tot / 2) best = o;
    if (best === b.owner) continue; b.owner = best;
    const [s, n] = bRanges[id]; const col = best ? teams[best - 1].c3.clone().lerp(new THREE.Color(1, 1, 1), 0.18) : new THREE.Color(0.83, 0.8, 0.75);
    for (let k = 0; k < n; k++) bColors.setXYZ(s + k, col.r, col.g, col.b);
  }
  dirtyBld.clear(); bColors.needsUpdate = true;
}
function startZone(p, x, z, r = 14) {
  const out = [];
  for (let dx = -r; dx <= r; dx += CELL) for (let dz = -r; dz <= r; dz += CELL) if (dx * dx + dz * dz <= r * r) { const c = cellOf(x + dx, z + dz); if (c >= 0) out.push(c); }
  return out;
}
// remplissage façon Paper.io : la trace devient à l'équipe, puis tout ce qui ne touche plus l'extérieur est conquis
function capture(t1, trail) {
  for (const c of trail) own[c] = own[c]; // (no-op : lisibilité)
  const isMine = new Uint8Array(G * G); for (let c = 0; c < G * G; c++) if (own[c] === t1) isMine[c] = 1; for (const c of trail) isMine[c] = 1;
  let i0 = G, i1 = 0, j0 = G, j1 = 0; for (const c of trail) { const i = c % G, j = (c / G) | 0; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
  for (let c = 0; c < G * G; c++) if (isMine[c]) { const i = c % G, j = (c / G) | 0; if (i >= i0 - 60 && i <= i1 + 60 && j >= j0 - 60 && j <= j1 + 60) { i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); } }
  i0 = Math.max(0, i0 - 1); j0 = Math.max(0, j0 - 1); i1 = Math.min(G - 1, i1 + 1); j1 = Math.min(G - 1, j1 + 1);
  const W = i1 - i0 + 1, H = j1 - j0 + 1, seen = new Uint8Array(W * H), q = [];
  const push = (i, j) => { const l = (j - j0) * W + (i - i0); if (seen[l] || isMine[j * G + i]) return; seen[l] = 1; q.push(l); };
  for (let i = i0; i <= i1; i++) { push(i, j0); push(i, j1); } for (let j = j0; j <= j1; j++) { push(i0, j); push(i1, j); }
  while (q.length) { const l = q.pop(), i = i0 + l % W, j = j0 + ((l / W) | 0); if (i > i0) push(i - 1, j); if (i < i1) push(i + 1, j); if (j > j0) push(i, j - 1); if (j < j1) push(i, j + 1); }
  const won = [...trail];
  for (let l = 0; l < W * H; l++) if (!seen[l]) { const c = (j0 + ((l / W) | 0)) * G + i0 + l % W; if (!isMine[c] || own[c] !== t1) won.push(c); }
  return [...new Set(won)];
}
const rle = a => { a = [...a].sort((x, y) => x - y); const o = []; for (let i = 0; i < a.length;) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; o.push(a[i], j - i + 1); i = j + 1; } return o; };
const unrle = r => { const o = []; for (let i = 0; i < r.length; i += 2) for (let k = 0; k < r[i + 1]; k++) o.push(r[i] + k); return o; };
function applyCapture(teamName, color, cells) { const t1 = team(teamName, color) + 1; for (const c of cells) setOwner(c, t1); }
function clearTrail(p) { for (const c of p.trail) if (trailOf[c] === p.slot) { trailOf[c] = -1; paint(c); } p.trail = []; }

// ---------------- partie ----------------
let net = null, me = null, myId = Math.random().toString(36).slice(2, 10), started = false;
const keys = {}; addEventListener('keydown', e => (keys[e.key] = true)); addEventListener('keyup', e => (keys[e.key] = false));
const touch = { l: false, r: false, b: false };
for (const [id, k] of [['tL', 'l'], ['tR', 'r'], ['tB', 'b']]) { const el = $(id); el.addEventListener('pointerdown', e => { touch[k] = true; e.preventDefault(); }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => (touch[k] = false)); }

function spawnPoint(p) {
  // dans le territoire de l'équipe s'il existe, sinon un endroit libre sur la zone
  const mine = []; for (let c = 0; c < G * G; c += 7) if (own[c] === p.team + 1) mine.push(c);
  for (let tries = 0; tries < 400; tries++) {
    let x, z;
    if (mine.length) [x, z] = cellCenter(mine[(Math.random() * mine.length) | 0]); else { x = (Math.random() * 2 - 1) * (HALF - 120); z = (Math.random() * 2 - 1) * (HALF - 120); }
    if (!hitBuilding(x, z) && !hitBuilding(x + 3, z) && !hitBuilding(x - 3, z) && !hitBuilding(x, z + 3) && !hitBuilding(x, z - 3)) return [x, z];
  }
  return [0, 0];
}
function respawn(p, announce = true) {
  clearTrail(p); const [x, z] = spawnPoint(p); p.x = x; p.z = z; p.speed = 0; p.yaw = Math.random() * Math.PI * 2;
  if (teams[p.team].cells === 0) { const cells = startZone(p, x, z); for (const c of cells) setOwner(c, p.team + 1); if (announce && net && !p.bot) net.send('cap', { tn: teams[p.team].name, tc: teams[p.team].color, c: rle(cells) }); }
  if (p.local && net) net.send('tc', { id: p.id });
}

function drive(p, dt, input) {
  const max = 21, acc = 8, steerMax = 0.55;
  p.steer += ((input.l ? 1 : 0) - (input.r ? 1 : 0)) * steerMax - p.steer; // braquage direct (arcade)
  const target = input.b ? 4 : max; p.speed += Math.sign(target - p.speed) * Math.min(Math.abs(target - p.speed), (target < p.speed ? 16 : acc) * dt);
  const wheelbase = 2.7, yawRate = p.speed / wheelbase * Math.tan(p.steer * (1 - Math.min(0.55, p.speed / 60)));
  p.yaw += yawRate * dt;
  const nx = p.x + Math.sin(p.yaw) * p.speed * dt, nz = p.z + Math.cos(p.yaw) * p.speed * dt;
  const fx = nx + Math.sin(p.yaw) * 2.2, fz = nz + Math.cos(p.yaw) * 2.2;
  if (hitBuilding(fx, fz) || hitBuilding(nx, nz) || Math.abs(nx) > HALF - 3 || Math.abs(nz) > HALF - 3) { p.speed *= -0.25; p.yaw += (Math.random() - 0.5) * 0.6; return; }
  p.x = nx; p.z = nz;
}
function placeCar(p, dt) {
  const h = groundH(p.x, p.z), hf = groundH(p.x + Math.sin(p.yaw) * 2, p.z + Math.cos(p.yaw) * 2), hr = groundH(p.x + Math.cos(p.yaw), p.z - Math.sin(p.yaw));
  p.h = h; p.car.position.set(p.x, h, p.z); p.car.rotation.set(0, 0, 0); p.car.rotation.y = p.yaw;
  p.car.rotateX(-Math.atan2(hf - h, 2)); p.car.rotateZ(Math.atan2(hr - h, 1) * 0.5);
  p.label.position.set(p.x, h + 3.8, p.z);
}
// trace et capture pour un joueur simulé ici (le joueur local ou un robot)
function stepTerritory(p) {
  const c = cellOf(p.x, p.z); if (c < 0) return;
  const t1 = p.team + 1;
  if (own[c] === t1) {
    if (p.trail.length) {
      const won = capture(t1, p.trail); clearTrail(p); for (const k of won) setOwner(k, t1);
      if (net && !p.bot) net.send('cap', { tn: teams[p.team].name, tc: teams[p.team].color, c: rle(won) });
      if (p.local) flash(`+${won.length * CELL * CELL} m² pour ${teams[p.team].name}`);
    }
  } else if (trailOf[c] !== p.slot) {
    // couper la trace d'un rival = il perd sa trace
    const v = trailOf[c]; if (v >= 0) { const vp = players.get(slotToId[v]); if (vp && vp.team !== p.team) { kill(vp, p); } }
    if (trailOf[c] < 0) { trailOf[c] = p.slot; p.trail.push(c); paint(c); if (net && p.local) p.pend.push(c); }
  }
}
function kill(victim, by) {
  if (by.local && net) net.send('kill', { v: victim.id, by: by.name });
  if (victim.local) flash(`Trace coupée par ${by.name} !`, true);
  else if (by.local) flash(`Tu as coupé ${victim.name} !`);
  if (victim.local || victim.bot) respawn(victim); else clearTrail(victim);
}

// robots (partie solo) : sortent de chez eux, dessinent un rectangle, reviennent
function botInput(p, dt) {
  p.ai ||= { phase: 0, t: 0, turn: 1, stuck: 0 }; const a = p.ai; a.t -= dt;
  a.stuck = Math.abs(p.speed) < 2 ? a.stuck + dt : 0;
  if (a.stuck > 0.7) { a.unstick = 1.1; a.stuck = 0; a.turn = Math.random() < 0.5 ? 1 : -1; }
  if (a.unstick > 0) { a.unstick -= dt; return a.turn > 0 ? { l: true } : { r: true }; }
  const c = cellOf(p.x, p.z), home = c >= 0 && own[c] === p.team + 1;
  if (a.phase === 0) { if (!home) { a.phase = 1; a.t = 2.5 + Math.random() * 3; a.turn = Math.random() < 0.5 ? 1 : -1; } return { l: Math.random() < 0.02, r: false }; }
  if (a.t <= 0 && a.phase < 4) { a.phase++; a.t = a.phase === 3 ? 6 : 2.5 + Math.random() * 3; a.turning = 0.9; }
  if (a.turning > 0) { a.turning -= dt; return a.turn > 0 ? { l: true } : { r: true }; }
  if (a.phase >= 3) { // rentre : vise la case de l'équipe la plus proche
    if (home) { a.phase = 0; return {}; }
    let best = null, bd = 1e9; for (let r = 1; r < 40 && !best; r++) for (let k = 0; k < 16; k++) { const ang = k / 16 * Math.PI * 2, x = p.x + Math.sin(ang) * r * 6, z = p.z + Math.cos(ang) * r * 6, cc = cellOf(x, z); if (cc >= 0 && own[cc] === p.team + 1) { const d = r; if (d < bd) { bd = d; best = ang; } } }
    if (best == null) return {}; let d = best - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); return { l: d > 0.08, r: d < -0.08 };
  }
  if (Math.abs(p.speed) < 2) a.turning = 0.6;
  return {};
}

// ---------------- réseau ----------------
function setupNet() {
  net.on('hello', d => { if (d.id === myId) return; if (d.n) { const p = addPlayer(d.id, d.n, d.tn, d.tc); p.lastSeen = performance.now(); } if (d.need && me) { sendHello(false); sendSnap(d.id); } });
  net.on('st', d => { if (d.id === myId) return; let p = players.get(d.id); if (!p) p = addPlayer(d.id, d.n, d.tn, d.tc); p.tx = d.x; p.tz = d.z; p.yaw = d.y; p.speed = d.s; p.lastSeen = performance.now(); if (p.x === 0 && p.z === 0) { p.x = d.x; p.z = d.z; } });
  net.on('tr', d => { const p = players.get(d.id); if (!p) return; for (const c of d.c) if (trailOf[c] < 0) { trailOf[c] = p.slot; p.trail.push(c); paint(c); }
    // si un rival passe sur ma trace, c'est lui qui le signale (kill) ; ici on vérifie qu'il ne passe pas sur la trace d'un 3e (rien à faire)
  });
  net.on('tc', d => { const p = players.get(d.id); if (p) clearTrail(p); });
  net.on('cap', d => applyCapture(d.tn, d.tc, unrle(d.c)));
  net.on('kill', d => { const v = players.get(d.v); if (!v) return; if (v.local) { flash(`Trace coupée par ${d.by} !`, true); respawn(v); } else clearTrail(v); });
  net.on('snap', d => { if (d.to !== myId || snapDone) return; snapDone = true; for (const [tn, tc] of d.teams || []) team(tn, tc); for (const [tn, tc, cells] of d.t) applyCapture(tn, tc, unrle(cells)); });
  net.on('peer', n => { $('peers').textContent = n; if (me) sendHello(false); });
}
let snapDone = false;
function sendHello(need) { net.send('hello', { id: myId, n: me.name, tn: teams[me.team].name, tc: teams[me.team].color, need }); }
let lastSnap = 0;
function sendSnap(to) {
  if (performance.now() - lastSnap < 800) return; lastSnap = performance.now();
  const byTeam = teams.map(() => []); for (let c = 0; c < G * G; c++) if (own[c]) byTeam[own[c] - 1].push(c);
  const t = teams.map((t, i) => [t.name, t.color, rle(byTeam[i])]).filter(x => x[2].length);
  net.send('snap', { to: to || '*', t, teams: teams.map(t => [t.name, t.color]) });
}

// ---------------- HUD ----------------
let flashT = 0; function flash(t, bad) { const f = $('flash'); f.textContent = t; f.style.background = bad ? '#ff3b30cc' : '#000a'; f.style.opacity = 1; flashT = 2.2; }
function hud() {
  $('peers').textContent = [...players.values()].filter(p => !p.bot).length;
  const tot = G * G, list = teams.map(t => ({ ...t, pct: (t.cells / tot) * 100, n: [...players.values()].filter(p => p.team === teams.indexOf(t)).length })).filter(t => t.cells || t.n).sort((a, b) => b.cells - a.cells).slice(0, 8);
  $('board').innerHTML = list.map((t, i) => `<div class="row${me && teams[me.team].name === t.name ? ' me' : ''}"><i style="background:${t.color}"></i><span>${i + 1}. ${esc(t.name)}</span><b>${t.pct.toFixed(1)} %</b><small>${t.n}👤</small></div>`).join('');
  const mc = $('mini'), g = mc.getContext('2d'); g.clearRect(0, 0, mc.width, mc.height);
  if (!hud.img) { hud.img = g.createImageData(G, G); }
  const im = hud.img.data; for (let c = 0; c < G * G; c++) { const k = c * 4; im[k] = terrData[k]; im[k + 1] = terrData[k + 1]; im[k + 2] = terrData[k + 2]; im[k + 3] = terrData[k + 3] ? 230 : 70; }
  const oc = hud.oc ||= Object.assign(document.createElement('canvas'), { width: G, height: G }); oc.getContext('2d').putImageData(hud.img, 0, 0);
  g.fillStyle = '#1b2430'; g.fillRect(0, 0, mc.width, mc.height); g.drawImage(oc, 0, 0, mc.width, mc.height);
  for (const p of players.values()) { const x = (p.x - MINX) / (2 * HALF) * mc.width, y = (p.z - MINZ) / (2 * HALF) * mc.height; g.fillStyle = teams[p.team].color; g.strokeStyle = p.local ? '#fff' : '#000'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, p.local ? 5 : 3.5, 0, 7); g.fill(); g.stroke(); }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- boucle ----------------
let last = performance.now(), sendT = 0, hudT = 0, camPos = new THREE.Vector3(), camInit = false;
function loop() {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt, now);
  renderer.render(scene, camera); requestAnimationFrame(loop);
}
function update(dt, now) {
  if (started) {
    for (const p of players.values()) {
      if (p.local) { drive(p, dt, { l: keys.ArrowLeft || keys.a || keys.q || touch.l, r: keys.ArrowRight || keys.d || touch.r, b: keys.ArrowDown || keys.s || touch.b }); stepTerritory(p); }
      else if (p.bot) { drive(p, dt, botInput(p, dt)); stepTerritory(p); }
      else if (p.tx != null) { // joueur distant : interpolation
        p.x += (p.tx - p.x) * Math.min(1, dt * 8); p.z += (p.tz - p.z) * Math.min(1, dt * 8); p.tx += Math.sin(p.yaw) * p.speed * dt; p.tz += Math.cos(p.yaw) * p.speed * dt;
        if (now - p.lastSeen > 8000) { clearTrail(p); scene.remove(p.car, p.label); players.delete(p.id); continue; }
        // collision avec ma trace : c'est moi qui le détecte aussi (au cas où son message se perd)
        const c = cellOf(p.x, p.z); if (c >= 0 && trailOf[c] === me.slot && p.team !== me.team) kill(me, p);
      }
      placeCar(p, dt);
    }
    if (net && (sendT -= dt) <= 0) { sendT = 0.12; net.send('st', { id: myId, n: me.name, tn: teams[me.team].name, tc: teams[me.team].color, x: +me.x.toFixed(2), z: +me.z.toFixed(2), y: +me.yaw.toFixed(3), s: +me.speed.toFixed(2) }); if (me.pend.length) { net.send('tr', { id: myId, c: me.pend }); me.pend = []; } }
    // caméra de poursuite
    const back = new THREE.Vector3(me.x - Math.sin(me.yaw) * 13, me.h + 6.5, me.z - Math.cos(me.yaw) * 13);
    if (!camInit) { camPos.copy(back); camInit = true; } camPos.lerp(back, Math.min(1, dt * 4)); camera.position.copy(camPos); camera.lookAt(me.x + Math.sin(me.yaw) * 6, me.h + 1.5, me.z + Math.cos(me.yaw) * 6);
    sun.position.set(me.x - 120, me.h + 260, me.z + 90); sun.target.position.set(me.x, me.h, me.z);
    if ((hudT -= dt) <= 0) { hudT = 0.25; refreshBuildings(); hud(); }
    if (texDirty && terrTex) { terrTex.needsUpdate = true; texDirty = false; }
    if (flashT > 0 && (flashT -= dt) <= 0) $('flash').style.opacity = 0;
    $('spd').textContent = Math.round(Math.abs(me.speed) * 3.6) + ' km/h';
  }
}

// ---------------- lobby ----------------
async function loadData() {
  $('status').textContent = 'Chargement de Limoges…';
  const [rel, bat] = await Promise.all([fetch('../data/relief.wasm').then(r => r.arrayBuffer()), fetch('../data/batiments_collision.wasm').then(r => r.arrayBuffer())]);
  relief = parseRelief(rel); parseBuildings(bat);
  // photo aérienne IGN de la zone (Licence Ouverte) — une seule image, chargée une fois
  const bb = [X0 + MINX, Y0 - HALF, X0 + HALF, Y0 + HALF].join(',');
  const img = await new Promise(ok => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = `https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=HR.ORTHOIMAGERY.ORTHOPHOTOS&STYLES=&CRS=EPSG:2154&BBOX=${bb}&WIDTH=2048&HEIGHT=2048&FORMAT=image/jpeg`; });
  buildWorld(img); $('status').textContent = '';
}
const dataReady = loadData();
renderTeamPick(); requestAnimationFrame(loop);
function renderTeamPick() {
  const sel = $('teamColor'); sel.innerHTML = TEAM_COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}"></button>`).join('');
  sel.querySelectorAll('button').forEach(b => (b.onclick = () => { sel.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); sel.dataset.c = b.dataset.c; }));
  sel.firstElementChild.click();
  try { const s = JSON.parse(localStorage.getItem('territoire') || '{}'); if (s.n && !$('pseudo').value) $('pseudo').value = s.n; if (s.t && !$('teamName').value) $('teamName').value = s.t; if (s.r && $('room').value === 'limoges') $('room').value = s.r; } catch (e) {}
  const u = new URLSearchParams(location.search); if (u.get('partie')) $('room').value = u.get('partie'); if (u.get('equipe')) $('teamName').value = u.get('equipe');
}
$('play').onclick = async () => {
  const name = ($('pseudo').value.trim() || 'Joueur').slice(0, 14), tn = ($('teamName').value.trim() || name).slice(0, 18), room = ($('room').value.trim() || 'limoges').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'limoges';
  const solo = $('mode').value === 'solo';
  try { localStorage.setItem('territoire', JSON.stringify({ n: name, t: tn, r: room })); } catch (e) {}
  $('lobby').style.display = 'none'; $('hud').style.display = 'block';
  await dataReady;
  if (!solo) {
    $('status').textContent = 'Connexion à la partie « ' + room + ' »…';
    try {
      net = await connect(new URLSearchParams(location.search).get('net') === 'local' ? 'local' : 'online', room); setupNet();
      net.send('hello', { id: myId, need: true, ping: true }); // on écoute d'abord : couleurs d'équipes et territoire existants
      await new Promise(r => setTimeout(r, 2500)); $('status').textContent = '';
    } catch (e) { net = null; $('status').textContent = 'Multijoueur indisponible (' + e.message + ') : partie solo'; }
  }
  me = addPlayer(myId, name, tn, $('teamColor').dataset.c, { local: true, pend: [] });
  if (net) { sendHello(true); setInterval(() => sendHello(false), 3000);
    $('roomName').textContent = room; $('share').onclick = () => { const url = location.origin + location.pathname + '?partie=' + room + '&equipe=' + encodeURIComponent(teams[me.team].name); navigator.clipboard?.writeText(url).then(() => flash('Lien copié : envoie-le à ton équipe !')).catch(() => prompt('Lien de la partie', url)); };
  } else { $('roomName').textContent = 'solo'; $('share').style.display = 'none'; }
  respawn(me);
  if (solo) { const used = new Set([teams[me.team].color]); const free = TEAM_COLORS.filter(c => !used.has(c) && c !== '#ffffff');
    ['Robots A', 'Robots B', 'Robots C'].forEach((n, i) => { const b = addPlayer('bot-' + i, 'Robot ' + (i + 1), n, free[i * 2 % free.length], { bot: true }); respawn(b, false); }); }
  started = true;
};
window.__T = { players, teams, own, G, stepTerritory, sim: (sec) => { let t = performance.now(); for (let k = 0; k < sec * 20; k++) { t += 50; update(0.05, t); } }, get me() { return me; }, get started() { return started; } };
