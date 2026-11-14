// Comparaison modèle ↔ références réelles : LiDAR (écarts de hauteur), emprise ↔ LiDAR, vue du ciel, photos.
import { pointInPolygon, median, percentile, bboxOf } from './geo.js';
import { sampleGrid } from './sources/ign.js';

// 1. Écart du toit modélisé au MNS LiDAR (pixel par pixel) + carte de chaleur
export function lidarDeviation(R) {
  const rf = R.roof; if (!rf || !rf.ok) return null;
  const W = rf.W, H = rf.H, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, dev = [];
  const inSuper = (x, y) => { for (const s of rf.supers) { const dx = x - s.cx, dy = y - s.cy, u = dx * Math.cos(s.ang) + dy * Math.sin(s.ang), v = -dx * Math.sin(s.ang) + dy * Math.cos(s.ang); if (Math.abs(u) <= s.w / 2 && Math.abs(v) <= s.d / 2) return s; } return null; };
  for (let i = 0; i < rf.pix.length; i++) {
    const p = rf.pix[i], x = rf.X[i], y = rf.Y[i], s = inSuper(x, y), zm = s ? s.base + s.h : rf.roofZ(x, y), e = rf.Z[i] - zm; dev.push(Math.abs(e));
    const t = Math.max(-1, Math.min(1, e / 1.0)), k = p * 4;
    d[k] = t > 0 ? 255 : 255 * (1 + t); d[k + 1] = 255 * (1 - Math.abs(t)); d[k + 2] = t < 0 ? 255 : 255 * (1 - t); d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, median: median(dev), p95: percentile(dev, 0.95), within30: dev.filter(v => v < 0.3).length / dev.length, n: dev.length };
}

// 2. Concordance de l'emprise (BD TOPO / OSM) avec ce que « voit » le LiDAR (sursol > 2,5 m)
export function footprintAgreement(R) {
  const mns = R.mns, mnt = R.mnt; if (!mns || !mnt) return null;
  let inter = 0, uni = 0, A = 0, B = 0;
  const bb = bboxOf(R.P, 3);
  for (let r = 0; r < mns.H; r++) for (let c = 0; c < mns.W; c++) {
    const x = mns.bb[0] + (c + 0.5) * mns.rx, y = mns.bb[3] - (r + 0.5) * mns.ry; if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) continue;
    const h = mns.data[r * mns.W + c] - mnt.data[r * mnt.W + c]; if (h !== h) continue;
    const a = pointInPolygon(x, y, R.P), b = h > 2.5;
    if (a) A++; if (b && a) inter++; if (a || b) uni++; if (b) B++;
  }
  return { insideHigh: inter / Math.max(1, A), iou: inter / Math.max(1, uni), note: 'la végétation qui touche le bâtiment fait baisser l\'IoU' };
}

// 3. Vue du ciel : rendu orthographique du modèle sur l'emprise exacte de l'orthophoto
export function renderTopView(viewer, R, THREE) {
  const ob = R.ortho.bb, O = R.origin, W = Math.min(1024, R.ortho.W), H = Math.round(W * R.ortho.H / R.ortho.W);
  const cam = new THREE.OrthographicCamera(ob[0] - O[0], ob[2] - O[0], ob[3] - O[1], ob[1] - O[1], 1, 3000);
  cam.position.set(0, 1500, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
  // avec up = −Z (nord), la caméra regarde vers le bas : x écran = est, y écran = nord
  cam.left = ob[0] - O[0]; cam.right = ob[2] - O[0]; cam.top = ob[3] - O[1]; cam.bottom = ob[1] - O[1]; cam.updateProjectionMatrix();
  return viewer.renderToCanvas(cam, W, H, { hideEnvironment: true });
}
