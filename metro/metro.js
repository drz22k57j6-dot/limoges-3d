// Métro parisien à taille réelle dans le moteur Saltline.
// Données réelles : stations, lignes, ordre, positions des quais par ligne, accès, temps entre stations (GTFS IDFM),
// dates d'ouverture (IDFM), profondeurs publiées. Ce qui manque est reconstitué par des règles (voir outils/metro_jeu.py
// et REGLES ci-dessous) : station voûtée RATP type, couloirs à angle droit, escaliers, salle des billets.
import * as THREE from 'three';

const D = '../data/metro/', V = '?v=1';
const say = (t, p) => { const m = document.getElementById('boot-msg'), f = document.getElementById('boot-fill'); if (m) m.textContent = t; if (f && p != null) f.style.width = Math.round(p * 100) + '%'; };

// ------------------------------------------------------------------ règles d'architecture (station voûtée RATP type)
const R = {
  voute: 7.2,          // demi-largeur intérieure de la voûte (station de 14,4 m)
  quai: 3.05,          // bord du quai à 3,05 m de l'axe (2 voies au centre)
  voie: 1.75,          // axe de chaque voie
  hQuai: 1.0,          // hauteur du quai au-dessus du rail
  hVoute: 6.0,         // clé de voûte au-dessus du rail
  tunnelH: 4.6, tunnelW: 6.1,
  esc: { mont: 0.16, pas: 0.30 },   // marche : 16 cm de haut, 30 cm de giron
  couloirH: 2.7,
  voiture: 15,         // longueur d'une voiture
  attente: 20,         // portes ouvertes (s)
  frequence: 150,      // un train toutes les 2 min 30 sur chaque voie
};

// ------------------------------------------------------------------ textures dessinées
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const TEX = {
  // carreaux blancs biseautés 15 × 7,5 cm (la texture couvre 0,6 × 0,6 m)
  carreaux: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d9d6cc'; g.fillRect(0, 0, w, h);
    const cw = w / 4, ch = h / 8;
    for (let r = 0; r < 8; r++) for (let k = 0; k < 4; k++) {
      const x = k * cw + (r % 2 ? cw / 2 : 0), y = r * ch;
      for (const xx of [x, x - w]) {
        const gr = g.createLinearGradient(xx, y, xx + cw, y + ch); gr.addColorStop(0, '#fffefa'); gr.addColorStop(0.5, '#f1efe8'); gr.addColorStop(1, '#d8d4c8');
        g.fillStyle = gr; g.fillRect(xx + 2, y + 2, cw - 4, ch - 4);
      }
    }
  }),
  sol: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#6f6a62'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }),
  ballast: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#3a3733'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { const v = 40 + Math.random() * 60 | 0; g.fillStyle = `rgb(${v},${v - 4},${v - 8})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 0, 7); g.fill(); } }),
  beton: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#2b2a28'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); } }),
};
const MAT = {
  carreaux: new THREE.MeshStandardMaterial({ map: TEX.carreaux, roughness: 0.25, metalness: 0, side: THREE.DoubleSide }),
  sol: new THREE.MeshStandardMaterial({ map: TEX.sol, roughness: 0.8 }),
  bord: new THREE.MeshStandardMaterial({ color: 0xe8e2cf, roughness: 0.7 }),
  ballast: new THREE.MeshStandardMaterial({ map: TEX.ballast, roughness: 1 }),
  beton: new THREE.MeshStandardMaterial({ map: TEX.beton, roughness: 0.95, side: THREE.DoubleSide }),
  rail: new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.8, roughness: 0.35 }),
  noir: new THREE.MeshBasicMaterial({ color: 0x050505 }),
  lumiere: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dc, emissiveIntensity: 1.6 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.35 }),
  caisse: new THREE.MeshStandardMaterial({ color: 0xe9ebee, metalness: 0.3, roughness: 0.4 }),
  vitre: new THREE.MeshStandardMaterial({ color: 0x1b2228, metalness: 0.2, roughness: 0.08, transparent: true, opacity: 0.55 }),
  siege: new THREE.MeshStandardMaterial({ color: 0x2d4f9e, roughness: 0.9 }),
  porte: new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.4, roughness: 0.35 }),
  bleu: new THREE.MeshStandardMaterial({ color: 0x24366b, roughness: 0.5 }),
  vert: new THREE.MeshStandardMaterial({ color: 0x2fae4f, emissive: 0x2fae4f, emissiveIntensity: 1.4 }),
};

// ------------------------------------------------------------------ assemblage : boîtes fusionnées par matériau (UV en mètres)
class Batch {
  constructor() { this.m = new Map(); }
  arr(mat) { let a = this.m.get(mat); if (!a) this.m.set(mat, a = { p: [], n: [], u: [], i: [] }); return a; }
  quad(mat, a, b, c, d, n, uvs) { const A = this.arr(mat), o = A.p.length / 3; for (const v of [a, b, c, d]) A.p.push(...v); for (let k = 0; k < 4; k++) A.n.push(...n); A.u.push(...uvs); A.i.push(o, o + 1, o + 2, o, o + 2, o + 3); }
  box(mat, x0, y0, z0, x1, y1, z1, s = 1 / 0.6, faces = 63) {
    const P = (x, y, z) => [x, y, z];
    if (faces & 1) this.quad(mat, P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), [0, 1, 0], [x0 * s, z0 * s, x0 * s, z1 * s, x1 * s, z1 * s, x1 * s, z0 * s]);
    if (faces & 2) this.quad(mat, P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), [0, -1, 0], [x0 * s, z0 * s, x1 * s, z0 * s, x1 * s, z1 * s, x0 * s, z1 * s]);
    if (faces & 4) this.quad(mat, P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), [1, 0, 0], [z0 * s, y0 * s, z0 * s, y1 * s, z1 * s, y1 * s, z1 * s, y0 * s]);
    if (faces & 8) this.quad(mat, P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), P(x0, y0, z0), [-1, 0, 0], [z1 * s, y0 * s, z1 * s, y1 * s, z0 * s, y1 * s, z0 * s, y0 * s]);
    if (faces & 16) this.quad(mat, P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), P(x0, y0, z1), [0, 0, 1], [x1 * s, y0 * s, x1 * s, y1 * s, x0 * s, y1 * s, x0 * s, y0 * s]);
    if (faces & 32) this.quad(mat, P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0), [0, 0, -1], [x0 * s, y0 * s, x0 * s, y1 * s, x1 * s, y1 * s, x1 * s, y0 * s]);
  }
  meshes() {
    const out = [];
    for (const [mat, A] of this.m) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(A.u, 2)); g.setIndex(A.i); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; out.push(m);
    }
    return out;
  }
}

// ------------------------------------------------------------------ repère d'une « visite » : rotation multiple de 90° + translation
const Xf = (k = 0, tx = 0, ty = 0, tz = 0) => ({ k: ((k % 4) + 4) % 4, tx, ty, tz });
const rot = (k, x, z) => [[x, z], [z, -x], [-x, -z], [-z, x]][k];   // rotation de k × 90° autour de Y (sens three.js)
const apply = (X, x, y, z) => { const [a, b] = rot(X.k, x, z); return [a + X.tx, y + X.ty, b + X.tz]; };
const matrixOf = X => new THREE.Matrix4().makeRotationY(X.k * Math.PI / 2).setPosition(X.tx, X.ty, X.tz);

// ------------------------------------------------------------------ panneaux (émail bleu RATP, pastilles de lignes)
const LINES = {};
function badge(g, x, y, r, L) {
  const l = LINES[L] || { couleur: '#888', texte: '#fff' }; g.fillStyle = l.couleur; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.fillStyle = l.texte; g.font = `700 ${r * (L.length > 1 ? 1.05 : 1.3)}px 'Barlow Condensed', Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L.replace('B', 'b'), x, y + r * 0.06);
}
function plaque(text, opts = {}) {
  const W = 1024, H = opts.h || 160, lines = opts.lignes || [];
  const t = canvasTex(W, H, (g) => {
    g.fillStyle = opts.fond || '#1f2f63'; g.fillRect(0, 0, W, H); g.strokeStyle = '#e9e4d6'; g.lineWidth = 8; g.strokeRect(10, 10, W - 20, H - 20);
    let x = 40; for (const L of lines) { badge(g, x + H * 0.3, H / 2, H * 0.3, L); x += H * 0.66; }
    g.fillStyle = '#f4f0e4'; g.textBaseline = 'middle'; g.textAlign = lines.length ? 'left' : 'center';
    let fs = opts.fs || 92; g.font = `600 ${fs}px 'Barlow Condensed', Arial, sans-serif`; while (g.measureText(text).width > W - x - 50 && fs > 30) { fs -= 4; g.font = `600 ${fs}px 'Barlow Condensed', Arial, sans-serif`; }
    g.fillText(text, lines.length ? x + 10 : W / 2, H / 2 + 4);
  }, false);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(opts.w || 3.2, (opts.w || 3.2) * H / W), new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25, side: THREE.DoubleSide }));
  return m;
}
function signAt(group, mesh, x, y, z, faceK) { mesh.position.set(x, y, z); mesh.rotation.y = faceK * Math.PI / 2; group.add(mesh); }

// ------------------------------------------------------------------ rame (voitures de 15 m)
function buildTrain(L, nCars) {
  const g = new THREE.Group(), len = nCars * R.voiture, col = new THREE.Color((LINES[L] || {}).couleur || '#888');
  const stripe = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 });
  const B = new Batch();
  for (let c = 0; c < nCars; c++) {
    const x0 = -len / 2 + c * R.voiture + 0.15, x1 = x0 + R.voiture - 0.3;
    B.box(MAT.caisse, x0, 0.55, -1.25, x1, 0.95, 1.25, 1);                       // châssis
    B.box(MAT.caisse, x0, 3.2, -1.25, x1, 3.45, 1.25, 1);                         // toit
    for (const s of [-1, 1]) {
      B.box(MAT.caisse, x0, 0.95, s * 1.25 - 0.04, x1, 1.75, s * 1.25 + 0.04, 1);   // bas de caisse
      B.box(stripe, x0, 1.75, s * 1.25 - 0.045, x1, 1.88, s * 1.25 + 0.045, 1);      // bande à la couleur de la ligne
      B.box(MAT.caisse, x0, 2.85, s * 1.25 - 0.04, x1, 3.2, s * 1.25 + 0.04, 1);
    }
    B.box(MAT.caisse, x0, 0.95, -1.25, x0 + 0.08, 3.2, 1.25, 1); B.box(MAT.caisse, x1 - 0.08, 0.95, -1.25, x1, 3.2, 1.25, 1);
    B.box(MAT.sol, x0, 0.95, -1.2, x1, 1.0, 1.2, 1);                             // plancher
    B.box(MAT.lumiere, x0 + 0.5, 3.12, -0.12, x1 - 0.5, 3.18, 0.12, 1);           // rampe lumineuse
    // sièges en vis-à-vis entre les portes
    for (const xs of [x0 + 2.2, x0 + 6.8, x0 + 11.4]) for (const s of [-1, 1]) { B.box(MAT.siege, xs, 1.0, s * 1.2 - s * 0.5 - 0.25, xs + 1.4, 1.45, s * 1.2 - s * 0.5 + 0.25, 1); B.box(MAT.siege, xs, 1.45, s * 1.12 - 0.06, xs + 1.4, 2.05, s * 1.12 + 0.06, 1); }
  }
  for (const m of B.meshes()) g.add(m);
  // vitres et portes (3 portes par côté et par voiture)
  const doors = [];
  for (let c = 0; c < nCars; c++) {
    const x0 = -len / 2 + c * R.voiture + 0.15;
    for (const s of [-1, 1]) {
      const glass = new THREE.Mesh(new THREE.BoxGeometry(R.voiture - 0.4, 1.0, 0.03), MAT.vitre); glass.position.set(x0 + (R.voiture - 0.3) / 2, 2.35, s * 1.26); g.add(glass);
      for (const dx of [2.05, 6.3, 10.55]) {
        for (const h of [0, 1]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.95, 0.05), MAT.porte); d.position.set(x0 + dx + (h ? 0.33 : -0.33) + 0.65, 1.95, s * 1.28); d.userData = { base: d.position.x, h, s }; g.add(d); doors.push(d); }
      }
    }
  }
  for (let x = -len / 2 + 2; x < len / 2; x += 3.2) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.15, 6), MAT.metal); p.position.set(x, 2.08, 0); g.add(p); }
  // nez de la rame (pare-brise) aux deux bouts
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 2.2), MAT.vitre); f.position.set(s * (len / 2 - 0.12), 2.4, 0); g.add(f); }
  g.userData = { doors, len };
  return g;
}
function setDoors(train, open) { for (const d of train.userData.doors) d.position.x = d.userData.base + (d.userData.h ? 1 : -1) * 0.62 * open; }

// ------------------------------------------------------------------ niveau
window.__LIMOGES_LEVEL = async function (G) {
  say('Plan du réseau', 0.4);
  const J = await (await fetch(D + 'jeu.json' + V)).json();
  for (const l of J.lignes) LINES[l.nom] = l;
  const ST = J.stations, byName = {}; for (const s of Object.values(ST)) byName[s.nom] = s;
  const scene = G.scene, phys = G.physics;
  // éclairage souterrain : pas de soleil, lumière des rampes
  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x5a5248, 0.75); scene.add(hemi);
  const lamps = []; for (let i = 0; i < 10; i++) { const p = new THREE.PointLight(0xfff0d8, 900, 90, 2); p.visible = false; scene.add(p); lamps.push(p); }
  const killSun = () => { if (G.render.sun) G.render.sun.intensity = 0; G.render.autoExposure = false; G.render.exposure = 1.1; scene.environmentIntensity = 0.35; if (scene.background && scene.background.isColor) scene.background.set(0x000000); };
  killSun();

  // --------- réseau : voisins, directions
  function branchesOf(L, sid) { return (LINES[L]?.branches || []).filter(b => b.stations.includes(sid)); }
  function dirsAt(L, sid) { // directions groupées par station suivante (= une voie)
    const groups = new Map();
    for (const b of branchesOf(L, sid)) {
      const i = b.stations.indexOf(sid), n = b.stations.length;
      for (const [term, next, t] of [[b.stations[n - 1], b.stations[i + 1], b.temps[i]], [b.stations[0], b.stations[i - 1], b.temps[i - 1]]]) {
        if (!next) continue; let g = groups.get(next); if (!g) groups.set(next, g = { next, termini: new Set(), t }); g.termini.add(term);
      }
    }
    return [...groups.values()].map(g => ({ next: g.next, termini: [...g.termini], t: g.t || 90 }));
  }
  const nom = id => ST[id]?.nom || id;
  const geo = id => [ST[id].halls ? ST[id].x : 0, ST[id].z];
  function hallPos(sid, L) { const h = ST[sid].halls[L]; return h ? [h.x, h.z] : [ST[sid].x, ST[sid].z]; }
  function axisToward(sid, L, next) { // vecteur unitaire de la station vers la suivante (repère géo)
    const [x0, z0] = hallPos(sid, L), [x1, z1] = hallPos(next, L); const l = Math.hypot(x1 - x0, z1 - z0) || 1; return [(x1 - x0) / l, (z1 - z0) / l];
  }

  // --------- état
  const root = new THREE.Group(); root.name = 'metro'; scene.add(root);
  let visit = null;          // { sid, L, dir, X, group, halls:[], trains:[], hub }
  let ride = null;           // trajet en cours
  const ui = makeUI();

  // --------- construction d'une station (repère local : quai principal à l'origine, x = sens du train vers dir, z = droite)
  function buildVisit(sid, L, dirNext, X) {
    const S = ST[sid], group = new THREE.Group(); group.matrixAutoUpdate = false; group.matrix.copy(matrixOf(X)); root.add(group);
    const B = new Batch(), boxes = [], extras = [];
    const addBox = (x0, y0, z0, x1, y1, z1, mat, opt = {}) => {
      if (mat) B.box(mat, Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), opt.s, opt.faces);
      if (!opt.visual) boxes.push([x0, y0, z0, x1, y1, z1, opt.surface || 'concrete']);
    };
    // repère géo -> local
    const dirs0 = dirsAt(L, sid); const d0 = dirs0.find(d => d.next === dirNext) || dirs0[0];
    const [ax, az] = d0 ? axisToward(sid, L, d0.next) : [1, 0], rx = -az, rz = ax;
    const [ox, oz] = hallPos(sid, L), mainDepth = S.halls[L]?.prof ?? 10;
    const toLocal = (x, z) => [(x - ox) * ax + (z - oz) * az, (x - ox) * rx + (z - oz) * rz];
    const snap = v => { const [vx, vz] = v; return Math.abs(vx) >= Math.abs(vz) ? [Math.sign(vx) || 1, 0] : [0, Math.sign(vz) || 1]; };
    const yStreet = mainDepth, yHall = mainDepth - 4.0; // rue et salle des billets (local, rail principal = 0)
    // salle d'échanges / billets : au barycentre des accès
    let hx = 0, hz = 0; if (S.sorties.length) { for (const s of S.sorties) { const [a, b] = toLocal(s.x, s.z); hx += a; hz += b; } hx /= S.sorties.length; hz /= S.sorties.length; } else { for (const L2 of Object.keys(S.halls)) { const [a, b] = toLocal(...hallPos(sid, L2)); hx += a; hz += b; } hx /= Object.keys(S.halls).length; hz /= Object.keys(S.halls).length; }
    hx = Math.round(hx); hz = Math.round(hz);
    const big = S.lignes.length >= 3, cw = big ? J.regles.couloir_largeur_hub : J.regles.couloir_largeur;
    const halls = [];
    // ---- quais de chaque ligne
    for (const L2 of S.lignes) {
      const h = S.halls[L2]; if (!h) continue;
      const ds = dirsAt(L2, sid); if (!ds.length) continue;
      let c = toLocal(h.x, h.z); if (L2 === L) c = [0, 0];
      const v0 = ds[0] ? axisToward(sid, L2, ds[0].next) : [1, 0];
      let a = L2 === L ? [1, 0] : snap([v0[0] * ax + v0[1] * az, v0[0] * rx + v0[1] * rz]);
      // la direction choisie roule vers +u sur la voie +w
      let dPlus = ds[0], dMinus = ds[1] || null;
      if (L2 === L) { dPlus = d0; dMinus = ds.find(d => d !== d0) || null; }
      const r = [-a[1], a[0]], y = mainDepth - (h.prof ?? 10), len = h.longueur || 75;
      const H = { L: L2, c, a, r, y, len, dPlus, dMinus, trains: [] };
      // conversion repère du quai -> repère de visite
      H.p = (u, w) => [c[0] + u * a[0] + w * r[0], c[1] + u * a[1] + w * r[1]];
      H.box = (u0, y0, w0, u1, y1, w1, mat, opt) => { const [x0, z0] = H.p(u0, w0), [x1, z1] = H.p(u1, w1); addBox(x0, y + y0, z0, x1, y + y1, z1, mat, opt); };
      const k = a[0] === 1 ? 0 : a[1] === 1 ? 3 : a[0] === -1 ? 2 : 1; H.k = k; // rotation du quai
      buildHall(H, S, extras, group);
      halls.push(H);
      // couloirs : escalier en bout de chaque quai puis couloir (à angle droit) vers la salle des billets
      for (const s of [1, -1]) {
        const wq = s * (R.quai + (R.voute - R.quai) / 2), hl = len / 2;
        const hu = (hx - c[0]) * a[0] + (hz - c[1]) * a[1], hw = (hx - c[0]) * r[0] + (hz - c[1]) * r[1];
        const cross = Math.sign(hw || 1) !== s;           // il faut passer au-dessus des voies
        let top = Math.min(yHall, y + R.hQuai + 4.4); if (cross) top = Math.max(top, y + 5.6);
        const rise = top - (y + R.hQuai), run = Math.max(2, Math.round(rise / R.esc.mont) * R.esc.pas);
        stairs(H, hl, R.hQuai, wq, run, rise, 2.6);
        // murs de fin de quai de part et d'autre de l'escalier
        H.box(hl, 0, s * R.quai, hl + 0.3, R.hVoute, wq - s * 1.5, null); H.box(hl, 0, wq + s * 1.5, hl + 0.3, R.hVoute, s * R.voute, null);
        const uA = hl + run + 1.5, wout = Math.sign(hw || 1) * (R.voute + 3.5), uT = uA + 3;
        const way = hu > uT ? [[uA, wq], [hu, wq], [hu, hw]] : [[uA, wq], [uT, wq], [uT, wout], [hu, wout], [hu, hw]];
        corridor(way.map(([u, w]) => H.p(u, w)), top, yHall, cw);
      }
    }
    // ---- salle des billets, portiques, sortie
    hub(hx, yHall, hz, S, cw);
    for (const m of B.meshes()) group.add(m);
    for (const e of extras) group.add(e);
    // physique (en coordonnées de scène)
    const phBoxes = boxes.map(([x0, y0, z0, x1, y1, z1, sf]) => { const a = apply(X, x0, y0, z0), b = apply(X, x1, y1, z1); return phys.addBox(a, b, { surface: sf, tag: 'st' }); });
    return { sid, L, dirNext: d0 && d0.next, X, group, halls, boxes: phBoxes, yHall, hub: [hx, hz] };

    // -------- éléments
    function buildHall(H, S, extras, group) {
      const { len } = H, hl = len / 2;
      H.box(-hl, -0.3, -R.quai, hl, 0, R.quai, MAT.ballast, { s: 1 });                        // fond de voie
      for (const w of [-R.voie, R.voie]) for (const g of [-0.72, 0.72]) H.box(-hl - 30, 0, w + g - 0.04, hl + 30, 0.16, w + g + 0.04, MAT.rail, { visual: true, s: 1 });
      for (const s of [1, -1]) {
        H.box(-hl, 0, s * R.quai, hl, R.hQuai, s * R.voute, MAT.sol, { s: 0.5 });             // quai
        H.box(-hl, R.hQuai, s * R.quai, hl, R.hQuai + 0.01, s * (R.quai + 0.35), MAT.bord, { visual: true, s: 1 }); // bande blanche
        H.box(-hl, 0, s * R.voute, hl, R.hVoute + 0.5, s * (R.voute + 0.4), null);           // mur (physique)
        // murs verticaux carrelés + voûte
        H.box(-hl, R.hQuai, s * R.voute, hl, 2.2, s * (R.voute + 0.02), MAT.carreaux, { visual: true });
        // bancs « assis-debout »
        for (let u = -hl + 8; u < hl - 6; u += 16) H.box(u, R.hQuai + 0.45, s * (R.voute - 0.45), u + 3, R.hQuai + 0.5, s * (R.voute - 0.05), MAT.bleu, { visual: true, s: 1 });
        // murs de bout de quai (sauf l'escalier côté +u)
        H.box(-hl - 0.4, 0, s * R.quai, -hl, R.hVoute, s * R.voute, MAT.carreaux);
        H.box(hl, R.hQuai + 3.0, s * R.quai, hl + 0.4, R.hVoute, s * R.voute, MAT.carreaux, { visual: true });
      }
      // voûte elliptique (maillage)
      const seg = 18, prof = [];
      for (let i = 0; i <= seg; i++) { const t = Math.PI * i / seg; prof.push([-Math.cos(t) * R.voute, 2.2 + Math.sin(t) * (R.hVoute - 2.2)]); }
      const pos = [], uv = [], idx = [], n = [];
      for (const u of [-hl, hl]) for (let i = 0; i <= seg; i++) { const [w, yy] = prof[i], [x, z] = H.p(u, w); pos.push(x, H.y + yy, z); uv.push(u / 0.6, i * 1.1 / 0.6); n.push(0, -1, 0); }
      for (let i = 0; i < seg; i++) idx.push(i, i + 1, seg + 2 + i, i + 1, seg + 2 + i + 1, seg + 2 + i);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      extras.push(new THREE.Mesh(g, MAT.carreaux));
      // tunnels aux deux bouts (noirs) et rampes lumineuses
      for (const s of [-1, 1]) { H.box(s * hl, 0, -R.quai, s * (hl + 40), R.tunnelH, -R.quai - 0.2, MAT.beton, { visual: true }); H.box(s * hl, 0, R.quai, s * (hl + 40), R.tunnelH, R.quai + 0.2, MAT.beton, { visual: true }); H.box(s * hl, R.tunnelH, -R.quai, s * (hl + 40), R.tunnelH + 0.2, R.quai, MAT.beton, { visual: true }); H.box(s * (hl + 40), 0, -R.quai, s * (hl + 40.2), R.tunnelH, R.quai, MAT.noir, { visual: true }); }
      for (const s of [1, -1]) H.box(-hl + 2, 3.6, s * (R.voute - 1.3), hl - 2, 3.7, s * (R.voute - 1.0), MAT.lumiere, { visual: true, s: 1 });
      // plaques émaillées du nom, tous les ~18 m, des deux côtés (visibles depuis le quai d'en face et depuis les rames)
      for (const s of [1, -1]) for (let u = -hl + 10; u <= hl - 10; u += 18) {
        const m = plaque(S.nom, { w: 3.4 }); const [x, z] = H.p(u, s * (R.voute - 0.03)); m.position.set(x, H.y + 1.85, z);
        m.rotation.y = (H.k * Math.PI / 2) + (s > 0 ? Math.PI : 0); extras.push(m);
      }
      // directions au-dessus des quais
      for (const [s, d] of [[1, H.dPlus], [-1, H.dMinus]]) {
        if (!d) continue; const txt = 'Direction ' + d.termini.map(nom).join(' / ');
        for (const u of [-H.len / 4, H.len / 4]) { const m = plaque(txt, { w: 3.0, lignes: [H.L], fond: '#1a1a1a', fs: 70 }); const [x, z] = H.p(u, s * (R.quai + 1.8)); m.position.set(x, H.y + 3.4, z); m.rotation.y = H.k * Math.PI / 2 + Math.PI / 2; extras.push(m); const m2 = m.clone(); m2.rotation.y += Math.PI; extras.push(m2); }
      }
      // lampes (lumière réelle)
      H.lamp = H.p(0, 0);
    }
    function stairs(H, u0, y0, w, run, rise, width) {
      const n = Math.max(1, Math.round(rise / R.esc.mont)), mr = rise / n, mp = run / n;
      for (let i = 0; i < n; i++) H.box(u0 + i * mp, y0 - 0.2, w - width / 2, u0 + (i + 1) * mp, y0 + (i + 1) * mr, w + width / 2, MAT.sol, { s: 1 });
      for (const s of [-1, 1]) H.box(u0, y0, w + s * (width / 2 + 0.2), u0 + run + 3, y0 + rise + R.couloirH, w + s * width / 2, MAT.carreaux);
      H.box(u0, y0 + rise + R.couloirH, w - width / 2, u0 + run + 3, y0 + rise + R.couloirH + 0.2, w + width / 2, MAT.carreaux, { visual: true });
      H.box(u0 + run, y0 + rise - 0.2, w - width / 2, u0 + run + 3, y0 + rise, w + width / 2, MAT.sol, { s: 1 });
      H.box(u0 + run + 3, y0 + rise, w - width / 2, u0 + run + 3.3, y0 + rise + R.couloirH, w + width / 2, null);
      H.box(u0 + 0.5, y0 + rise + R.couloirH - 0.12, w - 0.2, u0 + run + 2.5, y0 + rise + R.couloirH - 0.05, w + 0.2, MAT.lumiere, { visual: true, s: 1 });
    }
    // couloir à angle droit le long des points (x, z) ; monte / descend de yA à yB au début du dernier tronçon
    function corridor(pts, yA, yB, w) {
      const inHub = (x, z) => Math.abs(x - hx) < 11 && Math.abs(z - hz) < 9;
      let yCur = yA;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1]; const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.3) continue;
        const along = Math.abs(x1 - x0) > Math.abs(z1 - z0), sgn = Math.sign(along ? x1 - x0 : z1 - z0), c0 = along ? x0 : z0, cst = along ? z0 : x0;
        const last = i === pts.length - 2, dy = last ? yB - yCur : 0, n = Math.round(Math.abs(dy) / R.esc.mont), run = Math.min(n * R.esc.pas, Math.max(0, L - 1));
        const box = (a0, a1, y0, y1, w0, w1, mat, opt) => { const lo = Math.min(a0, a1), hi = Math.max(a0, a1); if (along) addBox(lo, y0, cst + w0, hi, y1, cst + w1, mat, opt); else addBox(cst + w0, y0, lo, cst + w1, y1, hi, mat, opt); };
        const walls = (a0, a1, yy) => { // murs + plafond + éclairage, sauf dans la salle des billets
          const lo = Math.min(a0, a1), hi = Math.max(a0, a1); let s0 = lo;
          const step = 0.5; for (let t = lo; t <= hi + 1e-6; t += step) { const ins = along ? inHub(t, cst) : inHub(cst, t); if (ins || t >= hi) { const e = Math.min(t, hi); if (e - s0 > 0.2) { for (const sd of [-1, 1]) box(s0, e, yy, yy + R.couloirH + 0.3, sd * w / 2, sd * (w / 2 + 0.2), MAT.carreaux); box(s0, e, yy + R.couloirH, yy + R.couloirH + 0.2, -w / 2, w / 2, MAT.carreaux, { visual: true }); box(s0 + 0.2, e - 0.2, yy + R.couloirH - 0.08, yy + R.couloirH - 0.02, -0.15, 0.15, MAT.lumiere, { visual: true, s: 1 }); } s0 = t + step; } }
        };
        // escalier d'abord (dernier tronçon), puis palier
        for (let k = 0; k < n; k++) { const a0 = c0 + sgn * k * (run / n), a1 = a0 + sgn * (run / n), yy = yCur + Math.sign(dy) * (k + 1) * (Math.abs(dy) / n); box(a0, a1, yy - 0.25, yy, -w / 2, w / 2, MAT.sol, { s: 1 }); walls(a0, a1, Math.min(yy, yCur + dy * (k / n))); }
        yCur += dy;
        box(c0 + sgn * run, c0 + sgn * L, yCur - 0.2, yCur, -w / 2, w / 2, MAT.sol, { s: 1 }); walls(c0 + sgn * run, c0 + sgn * L, yCur);
        if (i === 0) { const ux = along ? sgn : 0, uz = along ? 0 : sgn; const m = plaque(S.lignes.length > 1 ? 'Correspondance · Sortie' : 'Sortie', { w: Math.min(w - 0.4, 2.8), lignes: S.lignes, fond: '#1a1a1a', fs: 64 }); m.position.set(x0 + ux * 1.5, yCur + R.couloirH - 0.45, z0 + uz * 1.5); m.rotation.y = Math.atan2(-ux, -uz); extras.push(m); }
      }
    }
    function H0line() { return null; }
    function hub(x, y, z, S, w) {
      const W2 = 11, D2 = 9;
      addBox(x - W2, y - 0.2, z - D2, x + W2, y, z + D2, MAT.sol, { s: 0.5 });
      addBox(x - W2, y + 3.4, z - D2, x + W2, y + 3.6, z + D2, MAT.carreaux, { visual: true });
      for (const s of [-1, 1]) addBox(x - W2, y + 2.6, z + s * D2, x + W2, y + 3.6, z + s * (D2 + 0.2), MAT.carreaux, { visual: true });
      for (let i = -2; i <= 2; i++) addBox(x - W2 + 3 + i * 4, y + 3.3, z - 0.25, x - W2 + 5 + i * 4, y + 3.38, z + 0.25, MAT.lumiere, { visual: true, s: 1 });
      // ligne de contrôle : portiques (tourniquets)
      for (let k = -3; k <= 3; k++) { const zz = z + k * 1.0; addBox(x + 3, y, zz - 0.12, x + 4.2, y + 1.05, zz + 0.12, MAT.metal); addBox(x + 3.5, y + 1.05, zz - 0.05, x + 3.7, y + 1.12, zz + 0.05, MAT.vert, { visual: true, s: 1 }); }
      addBox(x + 3, y, z - D2, x + 4.2, y + 1.1, z - 3.6, MAT.metal); addBox(x + 3, y, z + 3.6, x + 4.2, y + 1.1, z + D2, MAT.metal);
      // escalier de sortie vers la rue (fermé par une grille : Paris en surface n'est pas encore modélisé)
      const rise = yStreet - y, n = Math.max(1, Math.round(rise / R.esc.mont));
      for (let k = 0; k < n; k++) addBox(x + 6 + k * R.esc.pas, y + (k + 1) * R.esc.mont - 0.25, z - 1.6, x + 6 + (k + 1) * R.esc.pas, y + (k + 1) * R.esc.mont, z + 1.6, MAT.sol, { s: 1 });
      addBox(x + 6 + n * R.esc.pas, y + rise - 0.2, z - 1.8, x + 6.2 + n * R.esc.pas, y + rise + 2.6, z + 1.8, MAT.metal);
      const names = S.sorties.slice(0, 4).map(s => s.nom).join(' · ') || S.nom;
      const m = plaque('Sortie · ' + names, { w: 4.2, fond: '#1a1a1a', fs: 58 }); m.position.set(x + 4.6, y + 2.8, z); m.rotation.y = -Math.PI / 2; extras.push(m);
      const m2 = plaque(S.nom, { w: 4.6, lignes: S.lignes }); m2.position.set(x, y + 2.6, z - D2 + 0.05); extras.push(m2);
    }
  }

  // --------- rames : une file par voie de chaque quai
  function trainsFor(v) {
    for (const H of v.halls) for (const [side, d] of [[1, H.dPlus], [-1, H.dMinus]]) {
      if (!d) continue;
      const n = Math.round(H.len / R.voiture), tr = buildTrain(H.L, n);
      tr.visible = false; v.group.add(tr);
      H.trains.push({ H, side, d, mesh: tr, state: 'absent', t: 6 + Math.random() * 40, boxes: [], pos: 0 });
    }
  }
  function trainLocal(T, u) { // place la rame sur sa voie (u le long du quai, sens de marche = side)
    const H = T.H, [x, z] = H.p(u, T.side * R.voie); T.mesh.position.set(x, H.y, z); T.mesh.rotation.y = H.k * Math.PI / 2 + (T.side > 0 ? 0 : Math.PI);
  }
  function trainBoxes(T, open) {
    for (const b of T.boxes) phys.removeBox(b); T.boxes = [];
    const H = T.H, L = T.mesh.userData.len / 2, w0 = T.side * R.voie, X = visit.X;
    const add = (u0, y0, w1, u1, y1, w2) => { const [x0, z0] = H.p(u0, w0 + w1), [x1, z1] = H.p(u1, w0 + w2); T.boxes.push(phys.addBox(apply(X, x0, H.y + y0, z0), apply(X, x1, H.y + y1, z1), { tag: 'train', surface: 'metal' })); };
    add(-L, 0.5, -1.25, L, 1.0, 1.25);          // plancher
    add(-L, 3.2, -1.25, L, 3.5, 1.25);          // toit
    add(-L - 0.1, 1.0, -1.25, -L, 3.2, 1.25); add(L, 1.0, -1.25, L + 0.1, 3.2, 1.25);
    // parois avec portes (ouvertes côté quai = à droite du sens de marche)
    const right = T.side;
    for (const s of [-1, 1]) {
      const doorSide = open && s === right;
      if (!doorSide) { add(-L, 1.0, s * 1.2 - 0.06, L, 3.2, s * 1.2 + 0.06); continue; }
      let u = -L; const nC = Math.round(2 * L / R.voiture);
      for (let c = 0; c < nC; c++) { const x0 = -L + c * R.voiture + 0.15; for (const dx of [2.05, 6.3, 10.55]) { const a = (x0 + dx) * (T.side), b = (x0 + dx + 1.3) * (T.side); const lo = Math.min(a, b), hi = Math.max(a, b); if (lo > u) add(u, 1.0, s * 1.2 - 0.06, lo, 3.2, s * 1.2 + 0.06); u = hi; } }
      if (u < L) add(u, 1.0, s * 1.2 - 0.06, L, 3.2, s * 1.2 + 0.06);
    }
  }
  const playerIn = T => { // le joueur est-il dans la rame ?
    const p = G.player.pos, H = T.H, inv = invApply(visit.X, p.x, p.y, p.z), dx = inv[0] - H.p(0, T.side * R.voie)[0], dz = inv[2] - H.p(0, T.side * R.voie)[1];
    const u = dx * H.a[0] + dz * H.a[1], w = dx * H.r[0] + dz * H.r[1];
    return Math.abs(u) < T.mesh.userData.len / 2 && Math.abs(w) < 1.25 && Math.abs(inv[1] - (H.y + 1.0)) < 1.2;
  };
  function invApply(X, x, y, z) { const a = x - X.tx, b = z - X.tz, [u, w] = rot((4 - X.k) % 4, a, b); return [u, y - X.ty, w]; }

  // --------- sons (synthèse)
  let AC = null, rumbleG = null;
  function audio() {
    if (AC) return AC; try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    const b = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { l = 0.97 * l + 0.03 * (Math.random() * 2 - 1); d[i] = l * 5; }
    const s = AC.createBufferSource(); s.buffer = b; s.loop = true; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; rumbleG = AC.createGain(); rumbleG.gain.value = 0; s.connect(f); f.connect(rumbleG); rumbleG.connect(AC.destination); s.start();
    return AC;
  }
  function rumble(v) { if (AC && rumbleG) rumbleG.gain.setTargetAtTime(v, AC.currentTime, 0.3); }
  function chime() { if (!AC) return; const t = AC.currentTime; for (let i = 0; i < 3; i++) { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'square'; o.frequency.value = 880; g.gain.setValueAtTime(0, t + i * 0.35); g.gain.linearRampToValueAtTime(0.06, t + i * 0.35 + 0.02); g.gain.linearRampToValueAtTime(0, t + i * 0.35 + 0.25); o.connect(g); g.connect(AC.destination); o.start(t + i * 0.35); o.stop(t + i * 0.35 + 0.3); } }
  window.__metroAudio = audio;

  // --------- visite / téléportation
  function clearVisit() { if (!visit) return; for (const b of visit.boxes) phys.removeBox(b); for (const H of visit.halls) for (const T of H.trains) for (const b of T.boxes) phys.removeBox(b); root.remove(visit.group); visit.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); visit = null; }
  function goTo(sid, L, dirNext, X = Xf()) {
    clearVisit(); visit = buildVisit(sid, L, dirNext, X); trainsFor(visit);
    const H = visit.halls.find(h => h.L === L) || visit.halls[0];
    lamps.forEach((p, i) => { const h = visit.halls[i >> 1]; if (!h) { p.visible = false; return; } const [lx, lz] = h.p((i & 1 ? 1 : -1) * h.len / 4, 0); const [x, y, z] = apply(visit.X, lx, h.y + 4.5, lz); p.position.set(x, y, z); p.visible = true; });
    ui.station(ST[sid], L);
    return H;
  }
  function teleport(sid, L) {
    if (ride) { scene.remove(ride.tunnel); scene.remove(ride.rideTrain); for (const b of ride.rb) phys.removeBox(b); if (ride.old && ride.old.group.parent) root.remove(ride.old.group); ride = null; rumble(0); document.getElementById('mRide').classList.remove('on'); }
    const ds = dirsAt(L, sid); const H = goTo(sid, L, ds[0] && ds[0].next);
    const [x, z] = H.p(-H.len / 4, R.quai + 1.4), P = apply(visit.X, x, H.y + R.hQuai + 0.02, z);
    const yaw = Math.atan2(-H.a[0], -H.a[1]);
    G.player.reset({ pos: new THREE.Vector3(...P), yaw });
  }
  window.__metro = { teleport, get visit() { return visit; }, get ride() { return ride; }, J };

  // --------- trajets
  function startRide(T) {
    const H = T.H, d = T.d, from = visit.sid, term = d.termini[Math.floor(Math.random() * d.termini.length)];
    // repère de la rame dans la scène
    const [cx, cz] = H.p(0, T.side * R.voie), P = apply(visit.X, cx, H.y, cz);
    const ta = rot(visit.X.k, H.a[0] * T.side, H.a[1] * T.side); // sens de marche (scène)
    const k = ta[0] === 1 ? 0 : ta[1] === 1 ? 3 : ta[0] === -1 ? 2 : 1;
    // rame du trajet (copie fixe dans la scène) ; l'ancienne station part derrière
    const rideTrain = buildTrain(H.L, Math.round(H.len / R.voiture)); rideTrain.position.set(...P); rideTrain.rotation.y = k * Math.PI / 2; scene.add(rideTrain); setDoors(rideTrain, 0);
    const old = visit; for (const b of old.boxes) phys.removeBox(b); for (const H2 of old.halls) for (const T2 of H2.trains) { for (const b of T2.boxes) phys.removeBox(b); T2.boxes = []; } T.mesh.visible = false;
    const rb = []; const addR = (u0, y0, w0, u1, y1, w1) => { const A = rot(k, u0, w0), B2 = rot(k, u1, w1); rb.push(phys.addBox([P[0] + A[0], P[1] + y0, P[2] + A[1]], [P[0] + B2[0], P[1] + y1, P[2] + B2[1]], { tag: 'ride', surface: 'metal' })); };
    const Lh = rideTrain.userData.len / 2; addR(-Lh, 0.5, -1.25, Lh, 1.0, 1.25); addR(-Lh, 3.2, -1.25, Lh, 3.5, 1.25); addR(-Lh - 0.1, 1, -1.25, -Lh, 3.2, 1.25); addR(Lh, 1, -1.25, Lh + 0.1, 3.2, 1.25); addR(-Lh, 1, -1.26, Lh, 3.2, -1.14); addR(-Lh, 1, 1.14, Lh, 3.2, 1.26);
    // tunnel qui défile
    const tunnel = new THREE.Group(); const TB = new Batch();
    for (let u = -200; u < 200; u += 20) { TB.box(MAT.beton, u, 0, -2.6, u + 20, 4.6, -2.4); TB.box(MAT.beton, u, 0, 2.4, u + 20, 4.6, 2.6); TB.box(MAT.beton, u, 4.6, -2.6, u + 20, 4.8, 2.6); TB.box(MAT.ballast, u, -0.3, -2.4, u + 20, 0, 2.4, 1); TB.box(MAT.lumiere, u + 9, 3.6, -2.38, u + 9.4, 3.8, -2.3, 1); }
    for (const m of TB.meshes()) tunnel.add(m); tunnel.position.set(...P); tunnel.rotation.y = k * Math.PI / 2; tunnel.visible = false; scene.add(tunnel);
    const next = d.next, dist = Math.hypot(...[0, 1].map(i => hallPos(next, H.L)[i] - hallPos(from, H.L)[i])), dur = Math.max(30, d.t || 90);
    ride = { T, H, L: H.L, from, next, term, P, k, rideTrain, rb, tunnel, old, dist, dur, t: 0, phase: 'depart', speed: 1 };
    ui.ride(ride);
    rumble(0.18);
  }
  function rideStep(dt) {
    const r = ride; r.t += dt * r.speed;
    const vmax = Math.max(8, r.dist / (r.dur - 18)), acc = 1.1;
    const sc = (s) => { const ang = r.k * Math.PI / 2; return [Math.cos(ang) * s, -Math.sin(ang) * s]; }; // déplacement le long du sens de marche (scène)
    if (r.phase === 'depart') {
      const s = 0.5 * acc * r.t * r.t; const [dx, dz] = sc(-s); r.old.group.matrix.copy(matrixOf(r.old.X)).premultiply(new THREE.Matrix4().makeTranslation(dx, 0, dz));
      r.tunnel.visible = s > 60;
      if (s > 160) { root.remove(r.old.group); r.old.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); visit = null; r.phase = 'tunnel'; r.t0 = r.t; }
    } else if (r.phase === 'tunnel') {
      const left = r.dur - r.t; ui.rideTime(left);
      // défilement du tunnel
      r.off = ((r.off || 0) + vmax * dt * r.speed) % 20; const [dx, dz] = sc(-r.off); r.tunnel.position.set(r.P[0] + dx, r.P[1], r.P[2] + dz);
      if (left < 14 && !r.built) { // la station suivante se prépare dans le noir
        const ds = dirsAt(r.L, r.next), dn = ds.find(dd => dd.termini.includes(r.term)) || ds.find(dd => dd.next !== r.from) || ds[0];
        // repère : rame (0,0,+voie) de la nouvelle station = rame actuelle
        const ang = -r.k; const X = Xf(r.k, 0, r.P[1], 0); const [ox, oz] = rot(r.k, 0, R.voie); X.tx = r.P[0] - ox; X.tz = r.P[2] - oz; void ang;
        r.terminus = !dn || dn.next === r.from;
        goTo(r.next, r.L, dn ? dn.next : null, X); r.built = true; visit.group.visible = false;
      }
      if (left <= 12) { r.phase = 'arrive'; r.t1 = r.t; }
    } else if (r.phase === 'arrive') {
      const T = 12, q = Math.min(1, (r.t - r.t1) / T), s = 0.5 * acc * (T * (1 - q)) ** 2; // décélération jusqu'à l'arrêt
      visit.group.visible = true; const [dx, dz] = sc(s); visit.group.matrix.copy(matrixOf(visit.X)).premultiply(new THREE.Matrix4().makeTranslation(dx, 0, dz));
      r.tunnel.visible = s > 60;
      if (q >= 1) arrive();
    }
    rumble(r.phase === 'tunnel' ? 0.22 : 0.12);
  }
  function arrive() {
    const r = ride; scene.remove(r.tunnel); visit.group.matrix.copy(matrixOf(visit.X));
    // la rame du trajet devient la rame à quai de la nouvelle station
    const H = visit.halls.find(h => h.L === r.L); const T = H && H.trains.find(t => t.side === 1);
    for (const b of r.rb) phys.removeBox(b); scene.remove(r.rideTrain);
    if (T) { T.state = 'stopped'; T.t = R.attente; T.mesh.visible = true; trainLocal(T, 0); setDoors(T.mesh, 1); trainBoxes(T, true); if (r.terminus) { T.terminus = true; T.t = 9999; } }
    ui.arrived(ST[visit.sid], r.L, r.terminus);
    ride = null; rumble(0); chime();
  }

  // --------- horaires des rames à quai
  function trainsStep(dt) {
    if (!visit) return;
    for (const H of visit.halls) for (const T of H.trains) {
      T.t -= dt; const L2 = T.mesh.userData.len;
      if (T.state === 'absent' && T.t <= 0) { T.state = 'arriving'; T.t = 14; T.mesh.visible = true; setDoors(T.mesh, 0); }
      if (T.state === 'arriving') { const q = 1 - Math.max(0, T.t) / 14; trainLocal(T, -T.side * 0 - (1 - q) ** 2 * (L2 + 90)); if (T.t <= 0) { T.state = 'stopped'; T.t = R.attente; trainLocal(T, 0); setDoors(T.mesh, 1); trainBoxes(T, true); } }
      if (T.state === 'stopped') {
        if (T.t < 3 && !T.chimed) { T.chimed = true; if (playerNear(T)) chime(); }
        if (T.t <= 0) {
          setDoors(T.mesh, 0); T.chimed = false;
          if (!ride && playerIn(T) && !T.terminus) { trainBoxes(T, false); startRide(T); return; }
          T.state = 'leaving'; T.t = 14; for (const b of T.boxes) phys.removeBox(b); T.boxes = [];
        }
      }
      if (T.state === 'leaving') { const q = 1 - Math.max(0, T.t) / 14; trainLocal(T, q * q * (L2 + 90)); if (T.t <= 0) { T.state = 'absent'; T.t = R.frequence - 28; T.mesh.visible = false; } }
    }
  }
  const playerNear = T => { const p = G.player.pos; const [x, , z] = apply(visit.X, ...(() => { const [a, b] = T.H.p(0, 0); return [a, T.H.y, b]; })()); return Math.hypot(p.x - x, p.z - z) < 90; };
  ui.onTeleport = teleport; ui.onSpeed = v => { if (ride) ride.speed = v; };

  // départ : station demandée (?station=...&ligne=...) sinon Châtelet ligne 1
  const Q = Object.fromEntries(new URLSearchParams(location.search));
  let sid0 = Object.keys(ST).find(k => ST[k].nom === (Q.station || 'Châtelet')) || Object.keys(ST)[0];
  let L0 = Q.ligne && ST[sid0].lignes.includes(Q.ligne) ? Q.ligne : ST[sid0].lignes.includes('1') ? '1' : ST[sid0].lignes[0];
  const ds0 = dirsAt(L0, sid0); const H0 = goTo(sid0, L0, ds0[0] && ds0[0].next);
  const [sx, sz] = H0.p(-H0.len / 4, R.quai + 1.4), P0 = apply(visit.X, sx, H0.y + R.hQuai + 0.02, sz);
  say('Prêt', 0.7);
  return {
    root, playerStart: { pos: new THREE.Vector3(...P0), yaw: Math.atan2(-H0.a[0], -H0.a[1]) }, objectives: [], enemySpawns: [], zones: [], interiorBoxes: [], coverPoints: [], explosives: [], skylights: [],
    cinematicPath: [{ pos: [P0[0] - 10, P0[1] + 3, P0[2]], look: [P0[0] + 10, P0[1] + 1.5, P0[2]] }, { pos: [P0[0] + 10, P0[1] + 3, P0[2]], look: [P0[0] + 20, P0[1] + 1.5, P0[2]] }],
    extraction: { pos: new THREE.Vector3(1e6, -1e4, 1e6), radius: 1 }, groundSurfaceAt: () => 'concrete',
    update(dt) { killSun(); if (ride) rideStep(dt); else trainsStep(dt); },
  };

  // ------------------------------------------------------------------ interface (style Saltline)
  function makeUI() {
    const css = document.createElement('style');
    css.textContent = `#mHead{position:fixed;left:calc(12px + env(safe-area-inset-left));top:calc(12px + env(safe-area-inset-top));z-index:40;display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(11,13,15,.6);border-left:3px solid #ffb347;color:#e8e4da;font:600 18px 'Barlow Condensed',sans-serif;letter-spacing:.12em;text-transform:uppercase;pointer-events:none}
    .mB{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;border-radius:13px;font:700 15px 'Barlow Condensed',sans-serif;letter-spacing:0;padding:0 5px}
    #mPlanBtn{position:fixed;left:calc(12px + env(safe-area-inset-left));top:calc(62px + env(safe-area-inset-top));z-index:40;height:40px;padding:0 14px;font:600 13px 'Barlow Condensed',sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#e8e4da;background:rgba(11,13,15,.55);border:1px solid rgba(232,228,218,.42)}
    #mPlan{position:fixed;inset:0;z-index:80;background:rgba(8,10,12,.94);color:#e8e4da;display:none;overflow:auto;padding:calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 30px calc(16px + env(safe-area-inset-left));font-family:'Barlow Condensed',sans-serif}
    #mPlan.on{display:block}#mPlan h2{font:900 34px 'Big Shoulders Display',Impact,sans-serif;letter-spacing:.1em;margin:0 0 12px}
    #mPlan .ls{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}#mPlan .ls button{border:0;cursor:pointer}
    #mPlan .st{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px}
    #mPlan .st button{text-align:left;padding:10px 12px;background:rgba(255,255,255,.06);border:0;color:#e8e4da;font:600 16px 'Barlow Condensed',sans-serif;letter-spacing:.06em;cursor:pointer;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    #mPlan .x{position:sticky;top:0;float:right;width:44px;height:44px;font-size:24px;background:#ffb347;border:0;color:#111}
    #mRide{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top));transform:translateX(-50%);z-index:41;display:none;padding:10px 16px;background:rgba(11,13,15,.75);border-top:3px solid #ffb347;color:#e8e4da;font:600 16px 'Barlow Condensed',sans-serif;letter-spacing:.14em;text-transform:uppercase;text-align:center}
    #mRide.on{display:block}#mRide b{font-size:22px;letter-spacing:.06em}#mRide button{margin-left:10px;height:34px;padding:0 12px;background:#ffb347;border:0;font:700 13px 'Barlow Condensed',sans-serif;letter-spacing:.2em}
    #mMsg{position:fixed;left:50%;bottom:calc(26% + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:41;padding:8px 14px;background:rgba(11,13,15,.75);color:#e8e4da;font:500 17px 'Barlow Condensed',sans-serif;letter-spacing:.06em;opacity:0;transition:opacity .4s;pointer-events:none;text-align:center;max-width:90vw}#mMsg.on{opacity:1}`;
    document.head.appendChild(css);
    document.body.insertAdjacentHTML('beforeend', `<div id="mHead"></div><button id="mPlanBtn">🗺 Plan du métro</button><div id="mPlan"><button class="x" id="mPlanX">✕</button><h2>MÉTRO DE PARIS</h2><div class="ls" id="mLs"></div><div class="st" id="mSt"></div><p style="font:400 12px 'IBM Plex Mono',monospace;color:#8d9aa3;margin-top:18px">Stations, lignes, ordre, positions des quais, accès et temps de parcours réels (GTFS Île-de-France Mobilités). Profondeurs publiées ou déduites de l'année d'ouverture ; couloirs reconstitués.</p></div><div id="mRide"></div><div id="mMsg"></div>`);
    const $ = id => document.getElementById(id), B = L => `<span class="mB" style="background:${LINES[L]?.couleur};color:${LINES[L]?.texte}">${L.replace('B', 'b')}</span>`;
    let msgT = 0; const msg = (t, s = 4) => { const e = $('mMsg'); e.innerHTML = t; e.classList.add('on'); clearTimeout(msgT); msgT = setTimeout(() => e.classList.remove('on'), s * 1000); };
    const api = {
      station(S, L) { $('mHead').innerHTML = S.lignes.map(B).join('') + '<span>' + S.nom + '</span>'; },
      ride(r) { const e = $('mRide'); e.classList.add('on'); e.innerHTML = `${B(r.L)} Direction ${nom(r.term)}<br>Prochain arrêt <b>${nom(r.next)}</b> <span id="mT"></span><button id="mFast">⏩ ×4</button>`; $('mFast').onclick = () => { r.speed = r.speed > 1 ? 1 : 4; $('mFast').textContent = r.speed > 1 ? '▶ ×1' : '⏩ ×4'; }; msg('Attention à la fermeture des portes'); },
      rideTime(s) { const e = $('mT'); if (e) e.textContent = Math.max(0, Math.round(s)) + ' s'; },
      arrived(S, L, term) { $('mRide').classList.remove('on'); msg(term ? `<b>${S.nom}</b> — Terminus. Tout le monde descend.` : `<b>${S.nom}</b>` + (S.lignes.length > 1 ? ' — correspondance ' + S.lignes.filter(l => l !== L).map(B).join(' ') : ''), 5); },
    };
    // plan : lignes puis stations
    const ls = $('mLs');
    const showLine = L => { const l = LINES[L]; const seen = new Set(); const order = []; for (const b of l.branches) for (const s of b.stations) if (!seen.has(s)) { seen.add(s); order.push(s); }
      $('mSt').innerHTML = order.map(s => `<button data-s="${s}">${ST[s].lignes.map(B).join('')} ${ST[s].nom}</button>`).join('');
      $('mSt').querySelectorAll('button').forEach(b => b.onclick = () => { $('mPlan').classList.remove('on'); say('', null); api.onTeleport(b.dataset.s, L); msg('<b>' + ST[b.dataset.s].nom + '</b>', 3); }); };
    setTimeout(() => { ls.innerHTML = Object.keys(LINES).map(L => `<button data-l="${L}">${B(L)}</button>`).join(''); ls.querySelectorAll('button').forEach(b => b.onclick = () => showLine(b.dataset.l)); showLine('1'); }, 0);
    $('mPlanBtn').onclick = () => $('mPlan').classList.add('on'); $('mPlanX').onclick = () => $('mPlan').classList.remove('on');
    for (const id of ['mPlan', 'mPlanBtn', 'mRide']) for (const ev of ['pointerdown', 'touchstart', 'mousedown']) $(id).addEventListener(ev, e => e.stopPropagation(), { passive: true });
    return api;
  }
};
