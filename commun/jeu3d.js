// Branche la fiche bâtiment et les équipes dans le jeu Limoges 3D :
// - appui long de 3 s sur un bâtiment (raycast sur les bâtiments 3D) -> même fiche que la carte ;
// - QG des équipes visibles : bâtiment enveloppé à la couleur de l'équipe, colonne de lumière, emblème et nom.
import * as THREE from 'three';

const X0 = 562924, Y0 = 6528957;               // origine du jeu (Lambert-93)
const BUILDING_MAT = /facade|mur|pignon|toit/;  // matériaux des bâtiments du jeu
const ready = () => new Promise(r => { const t = setInterval(() => { if (window.__dbg && window.BAT && window.EQ && buildings().length) { clearInterval(t); r(); } }, 400); });
let cache = null;
function buildings() {
  if (window.__cityTiles) { const a = []; window.__dbg?.scene.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.visible !== false && o.material && BUILDING_MAT.test(o.material.name || '')) a.push(o); }); return a; } // streamed tiles: always fresh
  if (cache && cache.length) return cache;
  const a = []; window.__dbg?.scene.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.material && BUILDING_MAT.test(o.material.name || '')) a.push(o); });
  return (cache = a);
}
const toGame = (lon, lat) => { const [x, y] = BAT.toL93(lon, lat); return [x - X0, -(y - Y0)]; };
const toLonLat = (x, z) => BAT.fromL93(x + X0, Y0 - z);

await ready();
const { scene, camera, renderer } = window.__dbg;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

// ---------- appui long de 3 s sur un bâtiment ----------
const canvas = renderer.domElement;
// iOS : pas de loupe, de sélection ni de menu pendant l'appui long (sinon Safari annule le geste)
Object.assign(canvas.style, { webkitTouchCallout: 'none', webkitUserSelect: 'none', userSelect: 'none', touchAction: 'none' });
BAT.longPress(canvas, e => {
  const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(buildings(), false)[0];
  if (!hit) return null;
  const p = hit.point.clone().addScaledVector(ray.ray.direction, 0.6); // un peu à l'intérieur du mur
  const ll = toLonLat(p.x, p.z);
  // 3D tiles: every vertex carries the building number -> exact IGN identifier, no guessing from the position
  const bid = hit.object.geometry.getAttribute('_batchid'), ids = hit.object.userData.ids;
  if (bid && ids && hit.face) { const id = ids[bid.getX(hit.face.a)]; if (id) return { id, ll }; }
  return { ll };
}, r => r.id ? BAT.featureById(r.id).then(f => f || BAT.featureAt(r.ll[0], r.ll[1], 3)).catch(() => BAT.featureAt(r.ll[0], r.ll[1], 3)) : BAT.featureAt(r.ll[0], r.ll[1], 3), { onMiss: () => {} });

// ---------- QG des équipes en 3D ----------
const hqGroup = new THREE.Group(); hqGroup.name = 'QG_equipes'; scene.add(hqGroup);
const geomCache = new Map();
function roofAt(x, z) { ray.set(new THREE.Vector3(x, 2000, z), new THREE.Vector3(0, -1, 0)); const h = ray.intersectObjects(buildings(), false)[0]; return h ? h.point.y : null; }
function label(t) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 360; const g = c.getContext('2d');
  g.fillStyle = t.couleur; g.strokeStyle = '#fff'; g.lineWidth = 14; g.beginPath(); g.arc(256, 140, 120, 0, 7); g.fill(); g.stroke();
  g.font = '150px "Apple Color Emoji","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t.embleme || '⭐', 256, 150);
  g.font = 'bold 54px -apple-system,sans-serif'; g.fillStyle = 'rgba(0,0,0,.6)'; const w = Math.min(500, g.measureText(t.nom).width + 40), x0 = 256 - w / 2, y0 = 278, h = 72, r = 30; g.beginPath(); g.moveTo(x0 + r, y0); g.arcTo(x0 + w, y0, x0 + w, y0 + h, r); g.arcTo(x0 + w, y0 + h, x0, y0 + h, r); g.arcTo(x0, y0 + h, x0, y0, r); g.arcTo(x0, y0, x0 + w, y0, r); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.fillText(t.nom, 256, 316);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); sp.scale.set(22, 15.5, 1); sp.renderOrder = 10; return sp;
}
async function drawTeam(t) {
  let f = geomCache.get(t.qg.id);
  if (f === undefined) { try { f = await BAT.featureById(t.qg.id); } catch (e) { f = null; } geomCache.set(t.qg.id, f); }
  const g = new THREE.Group(), col = new THREE.Color(t.couleur);
  let ring, cx, cz;
  if (f) { ring = f.geometry.coordinates[0][0].map(([lon, lat]) => toGame(lon, lat)); cx = ring.reduce((s, p) => s + p[0], 0) / ring.length; cz = ring.reduce((s, p) => s + p[1], 0) / ring.length; }
  else { [cx, cz] = toGame(t.qg.lon, t.qg.lat); }
  // hauteur du toit mesurée sur le bâtiment 3D lui-même (plusieurs essais si la cour est vide)
  let top = null; for (const p of [[cx, cz], ...(ring || []).slice(0, 8)]) { const y = roofAt(p[0] * 0.9 + cx * 0.1, p[1] * 0.9 + cz * 0.1); if (y != null) { top = Math.max(top ?? -1e9, y); } }
  if (top == null) top = (f?.properties.hauteur || 10);
  const base = top - (f?.properties.hauteur || 12) - 2;
  if (ring) {
    // enveloppe translucide légèrement gonflée + contour du toit
    const infl = ring.map(([x, z]) => { const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1; return [x + dx / d * 0.5, z + dz / d * 0.5]; });
    const pos = []; for (let i = 0; i < infl.length - 1; i++) { const [ax, az] = infl[i], [bx, bz] = infl[i + 1]; pos.push(ax, base, az, bx, base, bz, bx, top + 0.6, bz, ax, base, az, bx, top + 0.6, bz, ax, top + 0.6, az); }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.add(new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide })));
    const lp = infl.map(([x, z]) => new THREE.Vector3(x, top + 0.7, z));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(lp), new THREE.LineBasicMaterial({ color: col })));
    const shape = new THREE.Shape(infl.map(([x, z]) => new THREE.Vector2(x, -z)));
    const cap = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    cap.rotation.x = -Math.PI / 2; cap.position.y = top + 0.65; g.add(cap);
  }
  // colonne de lumière visible de loin + emblème
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 160, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.set(cx, top + 80, cz); g.add(beam);
  const sp = label(t); sp.position.set(cx, top + 14, cz); g.add(sp);
  g.name = 'QG_' + t.nom; return g;
}
let drawing = 0;
window.EQ_HOST = {
  async drawHQ(teams) {
    const my = ++drawing, groups = [];
    for (const t of teams) if (t.qg) { try { groups.push(await drawTeam(t)); } catch (e) { console.warn('QG', t.nom, e); } }
    if (my !== drawing) return;
    hqGroup.clear(); for (const g of groups) hqGroup.add(g);
  },
  goTo(t) { const [x, z] = toGame(t.qg.lon, t.qg.lat); window.__S && Object.assign(window.__S, {}); console.info('QG', t.nom, x.toFixed(0), z.toFixed(0)); },
};
// bouton « Équipes » rond, au milieu du bord droit (les boutons du jeu occupent le haut, les pédales le bas)
const st = document.createElement('style');
st.textContent = '#eqBtn{right:calc(10px + env(safe-area-inset-right))!important;left:auto!important;top:calc(50% - 26px)!important;transform:none!important;width:52px;height:52px;padding:0!important;border-radius:50%!important;border:2px solid #ffffff55!important;font-size:24px!important;z-index:99999!important}#eqPick{z-index:100002!important}';
document.head.appendChild(st);
const b = document.getElementById('eqBtn'); if (b) { b.textContent = '👥'; b.title = 'Équipes'; }
EQ.redraw();
window.__QG3D = { hqGroup, buildings };
