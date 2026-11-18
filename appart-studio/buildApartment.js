// Appart Studio — phase 3 : l'appartement 3D, construit DANS le vrai immeuble, au bon étage.
// Entrée : plan de l'éditeur (repère u/v en mètres) + cadre monde { F, u, v, floorY, H }.
// Le volume de l'appartement est découpé dans le bâtiment réel (plans de coupe locaux, mode intersection),
// donc on voit l'intérieur et, par les fenêtres, la vraie rue et les vrais immeubles d'en face.

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TEX = {};
function canvasTex(THREE, key, size, draw, repeatMeters) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.repeat.set(1 / repeatMeters, 1 / repeatMeters);
  return (TEX[key] = t);
}
const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(42);
function plank(g, x, y, w, h, ang, base) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const v = rnd(), col = `hsl(${30 + v * 8},${42 + v * 14}%,${base + v * 12}%)`;
  g.fillStyle = col; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.18; g.strokeStyle = '#3b2412';
  for (let i = 0; i < 5; i++) { g.beginPath(); const yy = h * (0.15 + 0.7 * rnd()); g.moveTo(0, yy); g.bezierCurveTo(w * .3, yy + 2, w * .6, yy - 2, w, yy + 1); g.stroke(); }
  g.globalAlpha = 0.55; g.strokeStyle = '#2a1a0c'; g.lineWidth = 1.2; g.strokeRect(0, 0, w, h);
  g.restore(); g.globalAlpha = 1;
}
const texHerringbone = THREE => canvasTex(THREE, 'hb', 512, (g, S) => {
  g.fillStyle = '#7a5130'; g.fillRect(0, 0, S, S);
  const w = S / 16, L = w * 5;                         // lattes ~ 8 x 40 cm sur 1,6 m
  for (let row = -6; row < 22; row++) for (let col = -2; col < 10; col++) {
    const x = col * L * 0.7071 * 2, y = row * w * 1.4142 + col * 0;
    plank(g, x, y, L, w, Math.PI / 4, 36);
    plank(g, x + L * 0.7071 + w * 0.7071, y + L * 0.7071 - w * 0.7071, L, w, -Math.PI / 4, 34);
  }
}, 1.6);
const texPlanks = THREE => canvasTex(THREE, 'pl', 512, (g, S) => {
  const w = S / 8;
  for (let r = 0; r < 8; r++) { let x = -rnd() * S * 0.6; while (x < S) { const L = S * (0.35 + rnd() * 0.4); plank(g, x, r * w, L, w, 0, 40); x += L; } }
}, 1.6);
const texTiles = (THREE, key, c1, c2, n) => canvasTex(THREE, key, 512, (g, S) => {
  const s = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 && c2 ? c2 : c1; g.fillRect(i * s, j * s, s, s); g.fillStyle = `rgba(0,0,0,${rnd() * 0.04})`; g.fillRect(i * s, j * s, s, s); }
  g.strokeStyle = '#9a9a96'; g.lineWidth = 2; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, S); g.moveTo(0, i * s); g.lineTo(S, i * s); g.stroke(); }
}, n * 0.3);

function materials(THREE) {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  const glow = c => new THREE.Color(c).multiplyScalar(0.16);   // lumière d'ambiance intérieure (évite d'ajouter des lampes → pas de recompilation de la ville)
  // Matériaux de sol partagés : les pièces de même famille fusionnent en un seul draw call.
  const solParquet = std({ map: texHerringbone(THREE), roughness: 0.58, emissive: glow(0x8a6040) });
  const solLames = std({ map: texPlanks(THREE), roughness: 0.6, emissive: glow(0x8a6040) });
  const solSdb = std({ map: texTiles(THREE, 'sdb', '#f2f2ef', null, 6), roughness: 0.3, emissive: glow(0x888888) });
  return {
    wall: std({ color: 0xf1ede4, emissive: glow(0xf1ede4) }),
    facadeOut: std({ color: 0xd9ccb3, roughness: 0.95 }),
    ceiling: std({ color: 0xf7f5f0, emissive: glow(0xf7f5f0), side: THREE.DoubleSide }),
    trim: std({ color: 0xfbfaf6, emissive: glow(0xfbfaf6), roughness: 0.6 }),
    frame: std({ color: 0xf4f3ee, roughness: 0.45 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfd8e6, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.14, depthWrite: false }),
    door: std({ color: 0xece8de, emissive: glow(0xece8de), roughness: 0.55 }),
    knob: std({ color: 0xc9a54b, metalness: 0.9, roughness: 0.3 }),
    floor: {
      sejour: solParquet, chambre: solParquet,
      bureau: solLames, dressing: solLames,
      entree: std({ map: texTiles(THREE, 'ent', '#efece6', '#26272b', 8), roughness: 0.4, emissive: glow(0x777777) }),
      cuisine: std({ map: texTiles(THREE, 'cui', '#ecebe7', '#3a3b40', 8), roughness: 0.35, emissive: glow(0x777777) }),
      sdb: solSdb, wc: solSdb, _: solLames,
    },
  };
}

export function createApartment({ THREE, scene, renderer }) {
  let M = null, group = null, clip = null, clipped = new Map(), scanT = 0, info = null;

  function dispose() {
    if (!group) return;
    scene.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    group = null;
  }

  // ---------- découpe du bâtiment réel ----------
  function makeClip(fr, box, top) {
    const { F, u, v, floorY } = fr, U = new THREE.Vector3(u[0], 0, u[1]), V = new THREE.Vector3(v[0], 0, v[1]);
    const P = (pu, pv, y) => new THREE.Vector3(F[0] + u[0] * pu + v[0] * pv, y, F[1] + u[1] * pu + v[1] * pv);
    const pl = (n, p) => new THREE.Plane(n.clone(), -n.dot(p));
    return [
      pl(U, P(box.u1, 0, 0)), pl(U.clone().negate(), P(box.u0, 0, 0)),
      pl(V, P(0, box.v1, 0)), pl(V.clone().negate(), P(0, box.v0, 0)),
      pl(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, floorY + top, 0)), pl(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, floorY - 0.06, 0)),
    ];
  }
  function clipBounds() {
    const { fr, box } = info, { F, u, v, floorY } = fr;
    const b = new THREE.Box3();
    for (const pu of [box.u0, box.u1]) for (const pv of [box.v0, box.v1])
      b.expandByPoint(new THREE.Vector3(F[0] + u[0] * pu + v[0] * pv, floorY - 0.06, F[1] + u[1] * pu + v[1] * pv)),
      b.expandByPoint(new THREE.Vector3(F[0] + u[0] * pu + v[0] * pv, floorY + info.H + 0.32, F[1] + u[1] * pu + v[1] * pv));
    return b;
  }
  function isOurs(o) { for (let p = o; p; p = p.parent) if (p === group) return true; return false; }
  function isTargetMesh(o, bounds) {
    const id = info?.fr?.buildingId;
    if (!id || !o.isMesh || !o.geometry || o.userData?.appartClipTarget || isOurs(o)) return false;
    // Les tuiles porteuses d'identifiants sont retenues uniquement si elles contiennent l'ID BAN/IGN cible.
    const ids = o.userData?.ids;
    if (Array.isArray(ids)) return ids.includes(id);
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox?.();
    if (!o.geometry.boundingBox) return false;
    o.updateWorldMatrix(true, false);
    const world = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    return world.intersectsBox(bounds);
  }
  function clippedMaterial(material) {
    const one = m => { const c = m.clone(); c.clippingPlanes = clip; c.clipIntersection = true; c.clipShadows = false; c.needsUpdate = true; return c; };
    return Array.isArray(material) ? material.map(one) : one(material);
  }
  function isolateBatch(o, id) {
    const g = o.geometry, ids = o.userData?.ids, ba = g.getAttribute('_batchid') || g.getAttribute('_BATCHID');
    const batch = Array.isArray(ids) ? ids.indexOf(id) : -1;
    if (!ba || batch < 0 || Array.isArray(o.material)) return null;
    const ix = g.index, count = ix ? ix.count : g.getAttribute('position').count, at = n => ix ? ix.getX(n) : n;
    const target = [], rest = [];
    for (let i = 0; i + 2 < count; i += 3) {
      const a=at(i), b=at(i+1), c=at(i+2);
      const hit=Math.round(ba.getX(a))===batch && Math.round(ba.getX(b))===batch && Math.round(ba.getX(c))===batch;
      (hit ? target : rest).push(a,b,c);
    }
    if (!target.length) return null;
    const originalGeometry = g, restGeometry = g.clone(), targetGeometry = g.clone();
    restGeometry.setIndex(rest); targetGeometry.setIndex(target);
    restGeometry.clearGroups(); targetGeometry.clearGroups();
    const boundsFor = (geo, indices) => {
      const p=geo.getAttribute('position'), box=new THREE.Box3().makeEmpty();
      for(const v of indices) box.expandByPoint(new THREE.Vector3(p.getX(v),p.getY(v),p.getZ(v)));
      geo.boundingBox=box; geo.boundingSphere=box.getBoundingSphere(new THREE.Sphere());
    };
    boundsFor(restGeometry,rest); boundsFor(targetGeometry,target);
    // Le moteur de façades masque déjà parfois le volume IGN en déplaçant ses sommets.
    // On rétablit les positions d'origine dans le sous-maillage cible isolé.
    const vertices=o.userData?.idVerts?.get(id), saved=o.userData?.orig?.get(id), pos=targetGeometry.getAttribute('position');
    if (vertices && saved) {
      for (let i=0;i<vertices.length;i++) { const v=vertices[i]; pos.setXYZ(v,saved[i*3],saved[i*3+1],saved[i*3+2]); }
      pos.needsUpdate=true;
    }
    boundsFor(targetGeometry,target);
    o.updateMatrix();
    const targetMesh = new THREE.Mesh(targetGeometry, clippedMaterial(o.material));
    targetMesh.name = 'appart-clip-target:' + id; targetMesh.userData.appartClipTarget = true;
    targetMesh.position.copy(o.position); targetMesh.quaternion.copy(o.quaternion); targetMesh.scale.copy(o.scale);
    targetMesh.matrixAutoUpdate = o.matrixAutoUpdate; if (o.matrixAutoUpdate) targetMesh.updateMatrix(); else targetMesh.matrix.copy(o.matrix);
    targetMesh.castShadow = false; targetMesh.receiveShadow = o.receiveShadow; targetMesh.renderOrder = o.renderOrder;
    o.geometry = restGeometry; o.parent?.add(targetMesh);
    return { isolated:true, originalGeometry, targetMesh };
  }
  function applyClip() {
    if (!clip || !group || !info) return;
    const bounds = clipBounds(), id = info.fr?.buildingId;
    scene.updateMatrixWorld(true);
    scene.traverse(o => {
      if (!o.isMesh || !o.material || clipped.has(o) || !isTargetMesh(o, bounds)) return;
      const ids = o.userData?.ids;
      if (Array.isArray(ids) && ids.includes(id)) {
        const isolated = isolateBatch(o, id);
        if (isolated) { clipped.set(o, isolated); return; }
      }
      const original = o.material;
      o.material = clippedMaterial(original);
      clipped.set(o, { material: original, castShadow: o.castShadow });
      // Pour les meshes agrégés sans identifiant, la boîte locale sert de repli.
      o.castShadow = false;
    });
  }
  function unclip() {
    for (const [o, saved] of clipped) {
      if (saved.isolated) {
        saved.targetMesh.parent?.remove(saved.targetMesh);
        saved.targetMesh.geometry.dispose();
        (Array.isArray(saved.targetMesh.material) ? saved.targetMesh.material : [saved.targetMesh.material]).forEach(m => m.dispose());
        o.geometry.dispose(); o.geometry = saved.originalGeometry;
      } else {
        const current = Array.isArray(o.material) ? o.material : [o.material];
        current.forEach(m => m.dispose());
        o.material = saved.material; o.castShadow = saved.castShadow;
      }
    }
    clipped.clear(); clip = null;
  }
  function mergeApartmentMeshes() {
    const buckets = new Map();
    group.updateMatrixWorld(true);
    for (const o of [...group.children]) {
      if (!o.isMesh || !o.geometry || Array.isArray(o.material)) continue;
      o.updateMatrix();
      const key = o.material.uuid + ':' + (o.userData.ceiling ? 'ceiling' : 'body');
      if (!buckets.has(key)) buckets.set(key, { material: o.material, items: [], ceiling: !!o.userData.ceiling });
      const g = o.geometry.clone(); g.applyMatrix4(o.matrix);
      buckets.get(key).items.push({ mesh: o, geometry: g });
    }
    for (const b of buckets.values()) {
      if (b.items.length < 2) { b.items.forEach(x => x.geometry.dispose()); continue; }
      let merged = null;
      try { merged = mergeGeometries(b.items.map(x => x.geometry), false); } catch (_) {}
      if (!merged) { b.items.forEach(x => x.geometry.dispose()); continue; }
      for (const x of b.items) { group.remove(x.mesh); x.mesh.geometry.dispose(); x.geometry.dispose(); }
      const m = new THREE.Mesh(merged, b.material);
      m.castShadow = b.items.some(x => x.mesh.castShadow);
      m.receiveShadow = true; if (b.ceiling) m.userData.ceiling = true;
      group.add(m);
    }
  }

  // ---------- construction ----------
  function build(plan, fr, opts = {}) {
    unclip(); dispose(); M ||= materials(THREE);
    const { F, u, v, floorY } = fr, H = fr.H;
    const W = (pu, pv) => [F[0] + u[0] * pu + v[0] * pv, F[1] + u[1] * pu + v[1] * pv];
    group = new THREE.Group(); group.name = 'appart-studio-3d';
    const solids = [];                                      // segments de collision (monde 2D)
    const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; group.add(m); return m; };

    // pièce de mur : boîte orientée entre deux points du plan (centre de la ligne), de y0 à y1
    function slab(a, b, t, y0, y1, mat, offset = 0) {
      const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...d); if (L < 0.01 || y1 - y0 < 0.01) return null;
      const nrm = [-d[1] / L, d[0] / L];
      const ca = W(a[0] + nrm[0] * offset, a[1] + nrm[1] * offset), cb = W(b[0] + nrm[0] * offset, b[1] + nrm[1] * offset);
      const g = new THREE.BoxGeometry(L, y1 - y0, t);
      const m = add(g, mat);
      m.position.set((ca[0] + cb[0]) / 2, floorY + (y0 + y1) / 2, (ca[1] + cb[1]) / 2);
      m.rotation.y = Math.atan2(-(cb[1] - ca[1]), cb[0] - ca[0]);
      return m;
    }

    const walls = plan.murs, byId = Object.fromEntries(walls.map(w => [w.id, w]));
    const center = plan.murs.reduce((s, w) => [s[0] + w.a[0] + w.b[0], s[1] + w.a[1] + w.b[1]], [0, 0]).map(x => x / (2 * walls.length));
    const inwardOffset = w => {                           // murs extérieurs : face extérieure sur le contour
      if (!w.ext && !w.facade && !['F', 'E', 'S', 'W'].includes(w.id)) return 0;
      const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L = Math.hypot(...d), nrm = [-d[1] / L, d[0] / L];
      const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], toC = [center[0] - mid[0], center[1] - mid[1]];
      return Math.sign(nrm[0] * toC[0] + nrm[1] * toC[1]) * w.epaisseur / 2;
    };

    for (const w of walls) {
      const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L = Math.hypot(...d), e = [d[0] / L, d[1] / L];
      const off = inwardOffset(w), t = w.epaisseur;
      const P = s => [w.a[0] + e[0] * s, w.a[1] + e[1] * s];
      const ops = plan.ouvertures.filter(o => o.murId === w.id && o.centre).map(o => {
        const s = (o.centre[0] - w.a[0]) * e[0] + (o.centre[1] - w.a[1]) * e[1];
        return { ...o, s0: Math.max(0, s - o.largeur / 2), s1: Math.min(L, s + o.largeur / 2) };
      }).sort((x, y) => x.s0 - y.s0);
      const mat = M.wall, matOut = w.facade ? M.facadeOut : M.wall;
      const piece = (s0, s1, y0, y1, solid) => {
        if (s1 - s0 < 0.005) return;
        // mur extérieur : deux couches (intérieur peint / extérieur pierre)
        if (w.facade) { slab(P(s0), P(s1), t * 0.25, y0, y1, mat, off + Math.sign(off) * t * 0.375); slab(P(s0), P(s1), t * 0.75, y0, y1, matOut, off - Math.sign(off) * t * 0.125); }
        else slab(P(s0), P(s1), t, y0, y1, mat, off);
        if (solid) { const nrm = [-e[1], e[0]]; solids.push([W(P(s0)[0] + nrm[0] * off, P(s0)[1] + nrm[1] * off), W(P(s1)[0] + nrm[0] * off, P(s1)[1] + nrm[1] * off)]); }
      };
      let s = 0;
      for (const o of ops) {
        piece(s, o.s0, 0, H, true);
        if (o.type === 'fenetre') { piece(o.s0, o.s1, 0, o.allege, true); piece(o.s0, o.s1, Math.min(H - 0.18, o.allege + o.hauteur), H, false); buildWindow(w, e, off, t, o); }
        else { piece(o.s0, o.s1, Math.min(H, o.hauteur), H, false); buildDoor(w, e, off, t, o); }
        s = o.s1;
      }
      piece(s, L, 0, H, true);
      // plinthes + corniches (intérieur), hors portes
      const nrmIn = (() => { const nrm = [-e[1], e[0]]; return off ? Math.sign(off) : 0; })();
      const skirtSides = off ? [Math.sign(off)] : [1, -1];
      let k = 0;
      const gaps = ops.filter(o => o.type === 'porte');
      for (const side of skirtSides) {
        const so = off + side * (t / 2 + 0.008);
        let s0 = 0;
        for (const gp of gaps.concat([{ s0: L, s1: L }])) { if (gp.s0 - s0 > 0.05) slab(P(s0), P(gp.s0), 0.016, 0, 0.12, M.trim, so); s0 = gp.s1; }
        slab(P(0), P(L), 0.06, H - 0.1, H, M.trim, off + side * (t / 2 + 0.03));
        slab(P(0), P(L), 0.03, H - 0.16, H - 0.1, M.trim, off + side * (t / 2 + 0.015));
      }
      void nrmIn; void k;
    }

    function buildWindow(w, e, off, t, o) {
      const nrm = [-e[1], e[0]], so = off + (off ? -Math.sign(off) * t * 0.1 : 0);
      const P = s => [w.a[0] + e[0] * s, w.a[1] + e[1] * s];
      const y0 = o.allege, y1 = Math.min(H - 0.18, o.allege + o.hauteur), f = 0.06;
      slab(P(o.s0), P(o.s0 + f), 0.08, y0, y1, M.frame, so); slab(P(o.s1 - f), P(o.s1), 0.08, y0, y1, M.frame, so);
      slab(P(o.s0), P(o.s1), 0.08, y0, y0 + f, M.frame, so); slab(P(o.s0), P(o.s1), 0.08, y1 - f, y1, M.frame, so);
      const mid = (o.s0 + o.s1) / 2;
      slab(P(mid - 0.025), P(mid + 0.025), 0.06, y0, y1, M.frame, so);                       // battants
      for (const k of [0.33, 0.66]) slab(P(o.s0), P(o.s1), 0.05, y0 + (y1 - y0) * k - 0.012, y0 + (y1 - y0) * k + 0.012, M.frame, so);  // petits bois
      const g = slab(P(o.s0 + f), P(o.s1 - f), 0.01, y0 + f, y1 - f, M.glass, so); if (g) { g.castShadow = false; g.renderOrder = 5; }
      // appui intérieur
      if (off) slab(P(o.s0 - 0.05), P(o.s1 + 0.05), 0.22, y0 - 0.04, y0, M.trim, off + Math.sign(off) * (t / 2 - 0.05));
      void nrm;
    }
    function buildDoor(w, e, off, t, o) {
      const P = s => [w.a[0] + e[0] * s, w.a[1] + e[1] * s];
      const y1 = Math.min(H, o.hauteur);
      slab(P(o.s0 - 0.06), P(o.s0), t + 0.03, 0, y1 + 0.06, M.trim, off); slab(P(o.s1), P(o.s1 + 0.06), t + 0.03, 0, y1 + 0.06, M.trim, off);
      slab(P(o.s0 - 0.06), P(o.s1 + 0.06), t + 0.03, y1, y1 + 0.06, M.trim, off);
      // battant ouvert à ~75°, pivot sur s0
      const nrm = [-e[1], e[0]], side = off ? Math.sign(off) : 1, ang = 1.3;
      const hinge = P(o.s0), wdt = o.s1 - o.s0;
      const dir = [e[0] * Math.cos(ang) + nrm[0] * side * Math.sin(ang), e[1] * Math.cos(ang) + nrm[1] * side * Math.sin(ang)];
      const tip = [hinge[0] + dir[0] * wdt, hinge[1] + dir[1] * wdt];
      const leaf = slab(hinge, tip, 0.04, 0.01, y1 - 0.01, M.door, off + side * t / 2);
      if (leaf) { const kn = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), M.knob); const kp = W(hinge[0] + dir[0] * (wdt - 0.07), hinge[1] + dir[1] * (wdt - 0.07)); kn.position.set(kp[0], floorY + 1.0, kp[1]); group.add(kn); }
    }

    // sols par pièce + plafond
    for (const r of plan.pieces) {
      const pts = r.polygone.map(p => W(p[0], p[1]));
      const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));
      const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2);
      const fl = add(g, M.floor[r.type] || M.floor._, false); fl.position.y = floorY + 0.005;
      const cg = new THREE.ShapeGeometry(shape); cg.rotateX(-Math.PI / 2);
      const ce = add(cg, M.ceiling, false); ce.position.y = floorY + H; ce.userData.ceiling = true;
      // rosace au plafond (séjour / chambre)
      if (r.type === 'sejour' || r.type === 'chambre') {
        const lp = r.polygone.reduce((s, p) => [s[0] + p[0] / r.polygone.length, s[1] + p[1] / r.polygone.length], [0, 0]), c = W(lp[0], lp[1]);
        const ro = add(new THREE.CylinderGeometry(0.32, 0.36, 0.04, 32), M.trim, false); ro.position.set(c[0], floorY + H - 0.02, c[1]); ro.userData.ceiling = true;
      }
    }
    scene.add(group);
    mergeApartmentMeshes();

    // boîte de découpe (contour + marge) : on retire le vrai bâtiment là où se trouve l'appartement
    const us = walls.flatMap(w => [w.a[0], w.b[0]]), vs = walls.flatMap(w => [w.a[1], w.b[1]]);
    const box = { u0: Math.min(...us) - 0.15, u1: Math.max(...us) + 0.15, v0: -0.45, v1: Math.max(...vs) + 0.15 };
    const c3 = W((box.u0 + box.u1) / 2, (box.v0 + box.v1) / 2);
    info = { fr, box, solids, center: new THREE.Vector3(c3[0], floorY + 1.3, c3[1]), size: Math.max(box.u1 - box.u0, box.v1 - box.v0), H, W, drawCalls: group.children.filter(o => o.isMesh).length };
    renderer.localClippingEnabled = true;
    clip = makeClip(fr, box, opts.dollhouse ? 400 : H + 0.32); // six plans créés une seule fois pour toute la session 3D
    applyClip();
    setDollhouse(!!opts.dollhouse);
    return info;
  }

  function setDollhouse(on) {
    if (!info || !clip) return;
    // Le même plan supérieur est déplacé : aucune mutation de matériau ni recompilation de shader.
    clip[4].constant = -(info.fr.floorY + (on ? 400 : info.H + 0.32));
    group.traverse(o => { if (o.userData.ceiling) o.visible = !on; });
  }

  return {
    build,
    setDollhouse,
    tick(dt) { if (!clip) return; scanT += dt; if (scanT > 1) { scanT = 0; applyClip(); } }, // attache une seule fois les éventuelles tuiles nouvellement chargées
    hide() {
      unclip(); dispose();
      if (M) {
        const mats = new Set([...Object.values(M).filter(v => v?.isMaterial), ...Object.values(M.floor || {})]);
        mats.forEach(m => m.dispose()); M = null;
      }
      Object.values(TEX).forEach(t => t.dispose());
      for (const k of Object.keys(TEX)) delete TEX[k];
      info = null;
    },
    get info() { return info; },
  };
}
