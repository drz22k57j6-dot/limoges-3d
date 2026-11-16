// Branche la fiche bâtiment dans le jeu :
// - appui long de 3 s sur un bâtiment (raycast sur les bâtiments 3D) -> même fiche que la carte ;
import * as THREE from 'three';

const X0 = window.CITY ? CITY.X0 : 562924, Y0 = window.CITY ? CITY.Y0 : 6528957; // origine du jeu (Lambert-93) — ville choisie
const BUILDING_MAT = /facade|mur|pignon|toit/;  // matériaux des bâtiments du jeu
const ready = () => new Promise(r => { const t = setInterval(() => { if (window.__dbg && window.BAT && buildings().length) { clearInterval(t); r(); } }, 400); });
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

window.__QG3D = { buildings };
