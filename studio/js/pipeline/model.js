// Étapes 8 et 9 — génération du modèle Three.js (murs, toit, édicules, ouvertures, matériaux PBR, intérieur généré).
// Repère : X = est, Y = haut (altitude − z0), Z = −nord : identique au moteur Limoges 3D (translation pure pour l'intégrer).
import * as THREE from 'three';
import { delaunay, pointInPolygon, distToPolygon, bboxOf } from '../geo.js';
import { facadePoint, profileAt } from './facade.js';
import { sampleGrid } from '../sources/ign.js';
import { KINDS } from '../provenance.js';

const tick = () => new Promise(r => setTimeout(r, 0));

export async function buildModel(R, opts = {}) {
  const pv = R.prov, z0 = Math.floor(R.ground.min - 1), O = R.origin; R.z0 = z0;
  const V = (x, y, z) => [x, z - z0, -y];
  const root = new THREE.Group(); root.name = 'Batiment_' + R.b.id;
  const mats = makeMaterials(R);
  const flatAt = (x, y) => { if (!R.roof.ok) return true; const z = R.roof.roofZ(x, y), e = 0.6; const gx = (R.roof.roofZ(x + e, y) - R.roof.roofZ(x - e, y)) / (2 * e), gy = (R.roof.roofZ(x, y + e) - R.roof.roofZ(x, y - e)) / (2 * e); return Math.hypot(gx, gy) < 0.1 && z === z; };
  const roofZ = (x, y) => R.roof.ok ? R.roof.roofZ(x, y) : R.ground.min + R.top;

  // ---------- 8a. atlas de façades (photo + enduit généré) ----------
  const atlas = await buildAtlas(R, opts.detail);
  mats.mur.map = atlas.tex; mats.mur.normalMap = atlas.normal; mats.mur.normalScale.set(0.6, 0.6);
  // ---------- murs + contour partagé avec le toit ----------
  const W = new Geo(), PAR = new Geo(), outline = [];
  for (const g of R.groups) for (const e of g.edges) {
    const n = Math.max(1, Math.ceil(e.L / 1.0));
    for (let k = 0; k < n; k++) {
      const s1 = e.s0 + e.L * k / n, s2 = e.s0 + e.L * (k + 1) / n;
      const p1 = facadePoint(g, Math.min(s1 + 1e-6, g.L)), p2 = facadePoint(g, Math.max(s2 - 1e-6, 0));
      const a = [e.a[0] + (e.b[0] - e.a[0]) * k / n, e.a[1] + (e.b[1] - e.a[1]) * k / n], b = [e.a[0] + (e.b[0] - e.a[0]) * (k + 1) / n, e.a[1] + (e.b[1] - e.a[1]) * (k + 1) / n];
      const nx = (e.b[1] - e.a[1]) / e.L, ny = -(e.b[0] - e.a[0]) / e.L;
      const ta = roofZ(a[0] - nx * 0.4, a[1] - ny * 0.4), tb = roofZ(b[0] - nx * 0.4, b[1] - ny * 0.4);
      const pa = R.parapet && flatAt(a[0] - nx * 0.6, a[1] - ny * 0.6) ? R.parapet : 0, pb = R.parapet && flatAt(b[0] - nx * 0.6, b[1] - ny * 0.6) ? R.parapet : 0;
      const ga = profileAt(g, s1, 'ground') - 0.5, gb = profileAt(g, s2, 'ground') - 0.5;
      const uv = (s, z) => [(g.ax + s * g.r) / atlas.W, (g.ay + (g.zTop - z) * g.r) / atlas.H];
      W.quad(V(a[0], a[1], ga), V(b[0], b[1], gb), V(b[0], b[1], tb + pb), V(a[0], a[1], ta + pa), uv(s1, ga), uv(s2, gb), uv(s2, tb + pb), uv(s1, ta + pa));
      outline.push({ x: a[0], y: a[1], nx, ny, z: ta, par: pa, ring: g.ring });
      if (pa || pb) { // acrotère : face intérieure + chaperon
        const ia = [a[0] - nx * 0.25, a[1] - ny * 0.25], ib = [b[0] - nx * 0.25, b[1] - ny * 0.25];
        PAR.quad(V(ib[0], ib[1], tb), V(ia[0], ia[1], ta), V(ia[0], ia[1], ta + pa), V(ib[0], ib[1], tb + pb));
        PAR.quad(V(a[0], a[1], ta + pa), V(b[0], b[1], tb + pb), V(ib[0], ib[1], tb + pb), V(ia[0], ia[1], ta + pa));
      }
    }
  }
  add(root, W.mesh(mats.mur, 'Murs'), 'murs');
  if (PAR.n) add(root, PAR.mesh(mats.acrotere, 'Acrotere'), 'acrotere');
  await tick();

  // ---------- toit (triangulation sur les plans LiDAR) ----------
  const pts = outline.map(p => { const ins = p.par ? 0.25 : 0; return [p.x - p.nx * ins, p.y - p.ny * ins]; });
  const nOut = pts.length; const bbL = bboxOf(R.Pl);
  for (let x = bbL[0] + 0.75; x < bbL[2]; x += 1.5) for (let y = bbL[1] + 0.75; y < bbL[3]; y += 1.5) if (pointInPolygon(x, y, R.Pl) && distToPolygon(x, y, R.Pl) > 0.9) pts.push([x, y]);
  const tris = delaunay(pts).filter(t => {
    const c = [(pts[t[0]][0] + pts[t[1]][0] + pts[t[2]][0]) / 3, (pts[t[0]][1] + pts[t[1]][1] + pts[t[2]][1]) / 3];
    if (!pointInPolygon(c[0], c[1], R.Pl)) return false;
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) { const m = [(pts[t[i]][0] + pts[t[j]][0]) / 2, (pts[t[i]][1] + pts[t[j]][1]) / 2]; if (!pointInPolygon(m[0], m[1], R.Pl) && distToPolygon(m[0], m[1], R.Pl) > 0.3) return false; }
    return true;
  });
  const RO = new Geo(), sh = R.orthoShift || [0, 0], ob = R.ortho ? R.ortho.bb : null;
  const zs = pts.map((p, i) => (i < nOut ? outline[i].z : roofZ(p[0], p[1])));
  const ouv = p => ob ? [(p[0] + O[0] + sh[0] - ob[0]) / (ob[2] - ob[0]), (ob[3] - (p[1] + O[1] + sh[1])) / (ob[3] - ob[1])] : [0, 0];
  for (const t of tris) { const [a, b, c] = t; RO.tri(V(pts[a][0], pts[a][1], zs[a]), V(pts[b][0], pts[b][1], zs[b]), V(pts[c][0], pts[c][1], zs[c]), ouv(pts[a]), ouv(pts[b]), ouv(pts[c]), true); }
  add(root, RO.mesh(mats.toit, 'Toit'), 'toit');
  await tick();

  // ---------- édicules, cheminées (LiDAR) ----------
  if (R.roof.ok && R.roof.supers.length) {
    const S = new Geo();
    for (const s of R.roof.supers) {
      const c = Math.cos(s.ang), si = Math.sin(s.ang), col = (s.color || R.roofColor || [150, 150, 150]).map(v => v / 255);
      S.box([s.cx, s.cy], [c, si], [-si, c], s.w, s.d, s.base - 0.1, s.base + s.h, V, col);
    }
    add(root, S.mesh(mats.edicule, 'Edicules'), 'superstructures');
  }

  // ---------- ouvertures ----------
  const GL = new Geo(), FR = new Geo(), DO = new Geo(), BA = new Geo(), RA = new Geo();
  const winCount = { photographiee: 0, deduite: 0 };
  for (const g of R.groups) {
    for (const w of g.windows) {
      const p = facadePoint(g, w.s), t = [-p.ny, p.nx], n = [p.nx, p.ny];
      const kindCol = new THREE.Color(KINDS[w.kind].color);
      winCount[w.kind]++;
      const o = 0.035, c = [p.x + n[0] * o, p.y + n[1] * o];
      GL.panel(c, t, w.w, w.z, w.z + w.h, V, [kindCol.r, kindCol.g, kindCol.b]);
      const fw = 0.07, fd = 0.09;
      FR.box([c[0] + t[0] * (w.w / 2), c[1] + t[1] * (w.w / 2)], t, n, fw, fd, w.z, w.z + w.h, V, null, true);
      FR.box([c[0] - t[0] * (w.w / 2), c[1] - t[1] * (w.w / 2)], t, n, fw, fd, w.z, w.z + w.h, V, null, true);
      FR.box(c, t, n, w.w + fw, fd, w.z + w.h - fw / 2, w.z + w.h + fw / 2, V, null, true);
      FR.box([c[0] + n[0] * 0.05, c[1] + n[1] * 0.05], t, n, w.w + 0.16, 0.2, w.z - 0.06, w.z, V, null, true); // appui
      if (w.w > 1.1) FR.box(c, t, n, 0.05, fd * 0.8, w.z, w.z + w.h, V, null, true); // meneau
      if (g.balcony && w.z > profileAt(g, w.s, 'ground') + 2) {
        const d = 1.2, bc = [p.x + n[0] * d / 2, p.y + n[1] * d / 2], bw = Math.min(w.w + 1.2, 3.2), bz = w.level ?? w.z - 0.95;
        BA.box(bc, t, n, bw, d, bz - 0.16, bz, V);
        const rc = [p.x + n[0] * (d - 0.03), p.y + n[1] * (d - 0.03)];
        RA.panel(rc, t, bw, bz, bz + 1.0, V); RA.panel(rc, t, bw, bz, bz + 1.0, V, null, true);
      }
    }
    for (const d of g.doors) {
      const p = facadePoint(g, d.s), t = [-p.ny, p.nx], n = [p.nx, p.ny], c = [p.x + n[0] * 0.03, p.y + n[1] * 0.03];
      DO.panel(c, t, d.w, d.z - 0.1, d.z + d.h, V);
      FR.box(c, t, n, d.w + 0.6, 0.6, d.z + d.h + 0.05, d.z + d.h + 0.2, V); // auvent
    }
  }
  if (GL.n) add(root, GL.mesh(mats.vitrage, 'Fenetres_vitrage'), 'fenetres');
  if (FR.n) add(root, FR.mesh(mats.menuiserie, 'Fenetres_cadres'), 'fenetres');
  if (DO.n) add(root, DO.mesh(mats.porte, 'Portes'), 'portes');
  if (BA.n) { add(root, BA.mesh(mats.balcon, 'Balcons_dalles'), 'balcons'); add(root, RA.mesh(mats.gardecorps, 'Balcons_gardecorps'), 'balcons'); }
  await tick();

  // ---------- 9. intérieur plausible — GÉNÉRÉ, jamais présenté comme réel ----------
  const inter = new THREE.Group(); inter.name = 'INTERIEUR_GENERE_FICTIF';
  inter.userData = { genere: true, avertissement: 'Intérieur inventé (aucune donnée intérieure). Ne représente pas le bâtiment réel.' };
  const shape = new THREE.Shape(R.Pl.outer.map(p => new THREE.Vector2(p[0], p[1]))); shape.holes = R.Pl.holes.map(h => new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))));
  const slabG = new THREE.ShapeGeometry(shape); slabG.rotateX(-Math.PI / 2);
  for (const lz of R.floors.levels) { const m = new THREE.Mesh(slabG, mats.interieur); m.position.y = lz - z0; m.name = 'Plancher_genere'; inter.add(m); }
  if (R.cores && R.cores.length) {
    const C = new Geo();
    for (const s of R.cores) { const c = Math.cos(s.ang), si = Math.sin(s.ang); C.box([s.cx, s.cy], [c, si], [-si, c], s.w * 0.9, s.d * 0.9, R.ground.min - 0.5, s.base, V); }
    inter.add(C.mesh(mats.interieurCore, 'Cages_escalier_deduites'));
  }
  inter.visible = !!opts.interior;
  root.add(inter);
  pv.set('interieur', 'Intérieur', `${R.floors.levels.length} planchers${R.cores?.length ? ' + ' + R.cores.length + ' cage(s)' : ''}`, 'generee', 0.1, '-', 'aucune donnée intérieure : planchers aux niveaux déduits et cages d\'escalier sous les édicules. Fictif.');

  // ---------- environnement immédiat (sol LiDAR + orthophoto) ----------
  if (R.ortho && R.mnt && opts.environment !== false) {
    const env = await buildEnvironment(R, V, mats); env.visible = true; root.add(env);
  }
  pv.set('materiaux', 'Matériaux PBR', 'albédo + normales dérivées', 'generee', 0.4, '-', 'cartes de normales calculées depuis les textures ; rugosité/métal = valeurs types par matériau');
  root.userData.studio = { version: 1, id: R.b.id, source: R.b.source, origine: { crs: R.b.crs, x: O[0], y: O[1], z0, lonlat: R.lonlat }, repere: 'X est, Y haut (altitude − z0), Z = −nord', provenance: pv.toJSON(), photos: (R.photos || []).map(p => ({ id: p.id, auteur: p.auteur, licence: p.licence, date: p.date, page: p.page })), genere_le: new Date().toISOString() };
  root.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  R.model = { root, mats, atlas, z0, winCount };
  return root;
}
function add(root, m, key) { m.userData.provenance = key; root.add(m); }

// ---------- matériaux ----------
function makeMaterials(R) {
  const c = a => new THREE.Color(a[0] / 255, a[1] / 255, a[2] / 255).convertSRGBToLinear();
  const wc = R.wallColor || [210, 205, 195];
  const M = {
    mur: new THREE.MeshStandardMaterial({ name: 'facade_studio', roughness: 0.88, metalness: 0 }),
    acrotere: new THREE.MeshStandardMaterial({ name: 'acrotere', color: c(wc), roughness: 0.9 }),
    toit: new THREE.MeshStandardMaterial({ name: 'toit_studio', color: R.ortho ? 0xffffff : c(R.roofColor || [120, 120, 120]), roughness: 0.92 }),
    edicule: new THREE.MeshStandardMaterial({ name: 'edicule', vertexColors: true, roughness: 0.9 }),
    vitrage: new THREE.MeshStandardMaterial({ name: 'vitrage', color: 0x26323a, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.4 }),
    menuiserie: new THREE.MeshStandardMaterial({ name: 'menuiserie', color: 0xe9e6df, roughness: 0.55 }),
    porte: new THREE.MeshStandardMaterial({ name: 'porte', color: 0x3b3430, roughness: 0.4, metalness: 0.2 }),
    balcon: new THREE.MeshStandardMaterial({ name: 'balcon', color: c(wc).multiplyScalar(0.92), roughness: 0.85 }),
    gardecorps: new THREE.MeshStandardMaterial({ name: 'garde_corps', color: 0x8ea0a8, roughness: 0.3, metalness: 0.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    interieur: new THREE.MeshStandardMaterial({ name: 'interieur_GENERE', color: 0xff6b8b, roughness: 0.8, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    interieurCore: new THREE.MeshStandardMaterial({ name: 'interieur_GENERE_cages', color: 0xff6b8b, roughness: 0.8, transparent: true, opacity: 0.5 }),
    sol: new THREE.MeshStandardMaterial({ name: 'environnement_sol', roughness: 0.95 }),
  };
  if (R.ortho) { const t = new THREE.CanvasTexture(R.ortho.canvas); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.userData.mimeType = 'image/jpeg'; M.toit.map = t; M.sol.map = t; M.toit.normalMap = normalFrom(R.ortho.canvas, 1.5, 1024); }
  return M;
}
// carte de normales calculée depuis la luminance (Sobel) — « générée »
function normalFrom(srcCanvas, strength = 2, max = 2048) {
  const k = Math.min(1, max / Math.max(srcCanvas.width, srcCanvas.height)), W = Math.max(2, Math.round(srcCanvas.width * k)), H = Math.max(2, Math.round(srcCanvas.height * k));
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(srcCanvas, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H), s = d.data, L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = (s[i * 4] + s[i * 4 + 1] + s[i * 4 + 2]) / 765;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = L[y * W + Math.max(0, x - 1)], r = L[y * W + Math.min(W - 1, x + 1)], u = L[Math.max(0, y - 1) * W + x], dn = L[Math.min(H - 1, y + 1) * W + x];
    let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1; const m = Math.hypot(nx, ny, nz); const i = (y * W + x) * 4;
    s[i] = (nx / m * 0.5 + 0.5) * 255; s[i + 1] = (ny / m * 0.5 + 0.5) * 255; s[i + 2] = (nz / m * 0.5 + 0.5) * 255; s[i + 3] = 255;
  }
  g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.flipY = false; t.userData.mimeType = 'image/jpeg'; return t;
}

// atlas des façades : chaque façade = un rectangle à l'échelle ; pixels sans photo = enduit généré teinté
async function buildAtlas(R, detailImg) {
  const gs = R.groups, AW = Math.min(2048, Math.max(...gs.map(g => g.tw + 2)));
  let x = 0, y = 0, rowH = 0;
  for (const g of [...gs].sort((a, b) => b.th - a.th)) { if (x + g.tw + 2 > AW) { x = 0; y += rowH; rowH = 0; } g.ax = x + 1; g.ay = y + 1; x += g.tw + 2; rowH = Math.max(rowH, g.th + 2); }
  const AH = Math.min(4096, 1 << Math.ceil(Math.log2(Math.max(4, y + rowH))));
  const c = document.createElement('canvas'); c.width = AW; c.height = AH; const ctx = c.getContext('2d', { willReadFrequently: true });
  const prov = document.createElement('canvas'); prov.width = AW; prov.height = AH; const pctx = prov.getContext('2d');
  let det = null; if (detailImg) { const dc = document.createElement('canvas'); dc.width = detailImg.width; dc.height = detailImg.height; const dg = dc.getContext('2d', { willReadFrequently: true }); dg.drawImage(detailImg, 0, 0); det = { d: dg.getImageData(0, 0, dc.width, dc.height).data, W: dc.width, H: dc.height }; }
  const wc = R.wallColor || [210, 205, 195], dCol = new THREE.Color(KINDS.deduite.color), pCol = new THREE.Color(KINDS.photographiee.color), gCol = new THREE.Color(KINDS.generee.color);
  for (const g of gs) {
    const img = ctx.createImageData(g.tw, g.th), pim = pctx.createImageData(g.tw, g.th), o = img.data, p = pim.data;
    for (let py = 0; py < g.th; py++) for (let px = 0; px < g.tw; px++) {
      const i = py * g.tw + px, k = i * 4;
      if (g.src[i]) { o[k] = g.rgba[k]; o[k + 1] = g.rgba[k + 1]; o[k + 2] = g.rgba[k + 2]; p[k] = pCol.r * 255; p[k + 1] = pCol.g * 255; p[k + 2] = pCol.b * 255; }
      else {
        let f = 1;
        if (det) { const sx = Math.floor(((px / g.r) * 160) % det.W), sy = Math.floor(((py / g.r) * 160) % det.H); f = det.d[(sy * det.W + sx) * 4] / 205; }
        o[k] = wc[0] * f; o[k + 1] = wc[1] * f; o[k + 2] = wc[2] * f;
        const pc = R.wallColorKind === 'generee' ? gCol : dCol; p[k] = pc.r * 255; p[k + 1] = pc.g * 255; p[k + 2] = pc.b * 255;
      }
      o[k + 3] = 255; p[k + 3] = 255;
    }
    ctx.putImageData(img, g.ax, g.ay); pctx.putImageData(pim, g.ax, g.ay);
    // bord de 1 px (évite les coutures au filtrage)
    ctx.drawImage(c, g.ax, g.ay, 1, g.th, g.ax - 1, g.ay, 1, g.th); ctx.drawImage(c, g.ax + g.tw - 1, g.ay, 1, g.th, g.ax + g.tw, g.ay, 1, g.th);
  }
  const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.userData.mimeType = 'image/jpeg';
  const ptex = new THREE.CanvasTexture(prov); ptex.flipY = false; ptex.colorSpace = THREE.SRGBColorSpace;
  const A = { W: AW, H: AH, canvas: c, tex, provTex: ptex, normal: normalFrom(c, 2.2) };
  return A;
}

async function buildEnvironment(R, V, mats) {
  const g = new THREE.Group(); g.name = 'Environnement_mesure';
  const ob = R.ortho.bb, O = R.origin, step = 1.5, nx = Math.ceil((ob[2] - ob[0]) / step) + 1, ny = Math.ceil((ob[3] - ob[1]) / step) + 1;
  const pos = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2), idx = [];
  const mnt = R.mntNear || R.mntEnv || R.mnt;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const X = ob[0] + i * step, Y = ob[3] - j * step; let z = sampleGrid(mnt, X, Y); if (z !== z) z = R.ground.min;
    const v = V(X - O[0], Y - O[1], z - 0.05), k = j * nx + i; pos.set(v, k * 3); uv.set([(X - ob[0]) / (ob[2] - ob[0]), (ob[3] - Y) / (ob[3] - ob[1])], k * 2);
    if (i < nx - 1 && j < ny - 1) idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mats.sol); m.name = 'Sol_LiDAR_orthophoto'; m.receiveShadow = true; m.userData.provenance = 'environnement'; g.add(m);
  return g;
}

// ---------- petit constructeur de géométrie ----------
class Geo {
  constructor() { this.p = []; this.u = []; this.c = []; this.n = 0; }
  tri(a, b, c, ua = [0, 0], ub = [0, 0], uc = [0, 0], up = false) {
    if (up) { const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]); if (ny < 0) { [b, c] = [c, b];[ub, uc] = [uc, ub]; } }
    this.p.push(...a, ...b, ...c); this.u.push(...ua, ...ub, ...uc); this.n++;
  }
  quad(a, b, c, d, ua = [0, 0], ub = [1, 0], uc = [1, 1], ud = [0, 1]) { this.tri(a, b, c, ua, ub, uc); this.tri(a, c, d, ua, uc, ud); }
  col(rgb, k) { for (let i = 0; i < k; i++) this.c.push(...rgb); }
  // panneau vertical centré en c, largeur w le long de t, de z1 à z2 ; face vers +n (n = perpendiculaire gauche de t)
  panel(c, t, w, z1, z2, V, rgb = null, back = false) {
    const a = [c[0] - t[0] * w / 2, c[1] - t[1] * w / 2], b = [c[0] + t[0] * w / 2, c[1] + t[1] * w / 2];
    if (back) this.quad(V(b[0], b[1], z1), V(a[0], a[1], z1), V(a[0], a[1], z2), V(b[0], b[1], z2));
    else this.quad(V(a[0], a[1], z1), V(b[0], b[1], z1), V(b[0], b[1], z2), V(a[0], a[1], z2), [0, 1], [1, 1], [1, 0], [0, 0]);
    if (rgb) this.col(rgb, 6);
  }
  box(c, t, n, w, d, z1, z2, V, rgb = null, noBack = false) {
    const P = (s, q, z) => V(c[0] + t[0] * s + n[0] * q, c[1] + t[1] * s + n[1] * q, z), hw = w / 2, hd = d / 2;
    const q = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    if (t[0] * n[1] - t[1] * n[0] < 0) q.reverse(); // repère indirect : on inverse le sens pour garder les normales vers l'extérieur
    let k = 0;
    for (let i = 0; i < 4; i++) { const A = q[i], B = q[(i + 1) % 4]; if (noBack && A[1] < 0 && B[1] < 0) continue; this.quad(P(A[0], A[1], z1), P(B[0], B[1], z1), P(B[0], B[1], z2), P(A[0], A[1], z2)); k++; }
    this.quad(P(...q[0], z2), P(...q[1], z2), P(...q[2], z2), P(...q[3], z2));
    if (rgb) this.col(rgb, (k + 1) * 6);
  }
  mesh(mat, name) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    if (mat.map) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); // pas d'UV inutiles (poids du GLB)
    if (this.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.name = name; return m;
  }
}

// ---------- vue « provenance » : couleurs par type de source ----------
export function provenanceMaterials(R) {
  const k = n => new THREE.MeshStandardMaterial({ color: KINDS[n].color, roughness: 0.8 });
  return {
    murs: new THREE.MeshStandardMaterial({ map: R.model.atlas.provTex, roughness: 0.8 }), acrotere: k('deduite'), toit: k('mesuree'), superstructures: k('mesuree'),
    fenetres: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), portes: k('deduite'), balcons: k('deduite'), environnement: k('mesuree'),
  };
}
