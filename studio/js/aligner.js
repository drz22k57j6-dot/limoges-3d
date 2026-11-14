// Aligneur : on indique d'où et dans quelle direction la photo a été prise ; le modèle est rendu
// avec exactement cette caméra par-dessus la photo. Quand ça colle, on applique : la photo est projetée sur les façades.
import * as THREE from 'three';
import { toL93, fromL93 } from './geo.js';

const $ = id => document.getElementById(id);

// pose : { x, y (locaux, m), h (m au-dessus du sol), az (°), pitch (°), fov (° horizontal) }
export function openAligner({ viewer, R, pix, init, label, onApply }) {
  const ui = $('alignUI'); ui.style.display = 'flex';
  const P = { ...init };
  const W = Math.min(960, pix.W), H = Math.round(W * pix.H / pix.W);
  const cv = $('alC'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const groundAt = (x, y) => { const m = R.mntEnv || R.mntNear || R.mnt; if (!m) return R.ground.min; const s = m.data ? sampleL(m, x + R.origin[0], y + R.origin[1]) : NaN; return s === s ? s : R.ground.min; };
  const cam = new THREE.PerspectiveCamera(50, W / H, 0.5, 4000);
  let raf = 0;
  const render = () => {
    cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const z = groundAt(P.x, P.y) + P.h, az = P.az * Math.PI / 180, pt = P.pitch * Math.PI / 180;
      cam.position.set(P.x, z - R.z0, -P.y);
      cam.fov = 2 * Math.atan(Math.tan(P.fov * Math.PI / 360) * H / W) * 180 / Math.PI; cam.updateProjectionMatrix();
      cam.up.set(0, 1, 0); cam.lookAt(P.x + Math.sin(az) * Math.cos(pt), z - R.z0 + Math.sin(pt), -(P.y + Math.cos(az) * Math.cos(pt)));
      const m = viewer.renderToCanvas(cam, W, H, { hideEnvironment: true });
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.drawImage(pix.canvas, 0, 0, W, H);
      g.globalAlpha = +$('alOp').value; g.globalCompositeOperation = $('alBlend').value; g.drawImage(m, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      drawMap(); syncLabels();
    });
  };
  // mini-plan : orthophoto + emprise + caméra ; toucher = placer la caméra, glisser = viser
  const mc = $('alMap'), mg = mc.getContext('2d'); let span = Math.max(120, Math.hypot(P.x, P.y) * 1.3 + 40);
  const toPx = (x, y) => [mc.width / 2 + x / span * mc.width / 2, mc.height / 2 - y / span * mc.width / 2];
  const toM = (u, v) => [(u - mc.width / 2) / (mc.width / 2) * span, -(v - mc.height / 2) / (mc.width / 2) * span];
  function drawMap() {
    mg.fillStyle = '#1b1f26'; mg.fillRect(0, 0, mc.width, mc.height);
    if (R.ortho) { const ob = R.ortho.bb, a = toPx(ob[0] - R.origin[0], ob[3] - R.origin[1]), b = toPx(ob[2] - R.origin[0], ob[1] - R.origin[1]); mg.drawImage(R.ortho.canvas, a[0], a[1], b[0] - a[0], b[1] - a[1]); }
    mg.strokeStyle = '#ffb547'; mg.lineWidth = 2; for (const r of [R.Pl.outer, ...R.Pl.holes]) { mg.beginPath(); r.forEach((p, i) => { const q = toPx(p[0], p[1]); i ? mg.lineTo(...q) : mg.moveTo(...q); }); mg.closePath(); mg.stroke(); }
    const c = toPx(P.x, P.y), az = P.az * Math.PI / 180, f = P.fov * Math.PI / 360, L = 60;
    mg.fillStyle = 'rgba(78,168,255,.25)'; mg.beginPath(); mg.moveTo(...c); mg.lineTo(c[0] + Math.sin(az - f) * L, c[1] - Math.cos(az - f) * L); mg.lineTo(c[0] + Math.sin(az + f) * L, c[1] - Math.cos(az + f) * L); mg.closePath(); mg.fill();
    mg.fillStyle = '#4ea8ff'; mg.beginPath(); mg.arc(c[0], c[1], 6, 0, 7); mg.fill();
  }
  let drag = null;
  mc.onpointerdown = e => { const r = mc.getBoundingClientRect(), u = (e.clientX - r.left) * mc.width / r.width, v = (e.clientY - r.top) * mc.height / r.height, c = toPx(P.x, P.y);
    drag = Math.hypot(u - c[0], v - c[1]) < 22 ? 'move' : 'aim'; if (drag === 'move') { mc.setPointerCapture(e.pointerId); } else { const [x, y] = toM(u, v); if (e.shiftKey || $('alTapMode').value === 'pos') { P.x = x; P.y = y; } else P.az = (Math.atan2(x - P.x, y - P.y) * 180 / Math.PI + 360) % 360; render(); } };
  mc.onpointermove = e => { if (drag !== 'move') return; const r = mc.getBoundingClientRect(), [x, y] = toM((e.clientX - r.left) * mc.width / r.width, (e.clientY - r.top) * mc.height / r.height); P.x = x; P.y = y; render(); };
  mc.onpointerup = () => (drag = null);
  $('alZoom').oninput = e => { span = +e.target.value; render(); };
  $('alZoom').value = span;
  // curseurs
  const sl = { alAz: 'az', alPitch: 'pitch', alFov: 'fov', alH: 'h' };
  for (const [id, k] of Object.entries(sl)) { $(id).value = P[k]; $(id).oninput = e => { P[k] = +e.target.value; render(); }; }
  function syncLabels() { for (const [id, k] of Object.entries(sl)) { $(id).value = P[k]; $(id + 'V').textContent = (+P[k]).toFixed(k === 'h' ? 1 : 0); } const [lon, lat] = R.b.crs === 'EPSG:2154' ? fromL93(P.x + R.origin[0], P.y + R.origin[1]) : [0, 0]; $('alPos').textContent = `${Math.round(Math.hypot(P.x, P.y))} m du centre · ${lat.toFixed(6)}, ${lon.toFixed(6)}`; }
  document.querySelectorAll('[data-nudge]').forEach(b => (b.onclick = () => { const [k, d] = b.dataset.nudge.split(':'); if (k === 'fwd' || k === 'side') { const a = P.az * Math.PI / 180, s = +d; if (k === 'fwd') { P.x += Math.sin(a) * s; P.y += Math.cos(a) * s; } else { P.x += Math.cos(a) * s; P.y -= Math.sin(a) * s; } } else P[k] = +P[k] + +d; render(); }));
  $('alAim').onclick = () => { P.az = (Math.atan2(-P.x, -P.y) * 180 / Math.PI + 360) % 360; render(); };
  $('alOp').oninput = render; $('alBlend').onchange = render;
  $('alTitle').textContent = label;
  const close = () => { ui.style.display = 'none'; cancelAnimationFrame(raf); };
  $('alCancel').onclick = close;
  $('alApply').onclick = async () => { $('alApply').disabled = true; $('alApply').textContent = 'Projection…'; try { await onApply({ ...P, z: groundAt(P.x, P.y) + P.h }); } finally { $('alApply').disabled = false; $('alApply').textContent = 'Appliquer au modèle'; close(); } };
  render();
}
function sampleL(g, x, y) { const c = Math.floor((x - g.bb[0]) / g.rx), r = Math.floor((g.bb[3] - y) / g.ry); if (c < 0 || r < 0 || c >= g.W || r >= g.H) return NaN; return g.data[r * g.W + c]; }

// pose initiale à partir des métadonnées (GPS, cap, focale) ou, à défaut, devant la façade principale
export function initialPose(R, meta) {
  let x, y, az = meta.azimuth, fov = meta.fov || 65, src = [];
  if (meta.lon != null && meta.lat != null && R.b.crs === 'EPSG:2154') { const [X, Y] = toL93(meta.lon, meta.lat); x = X - R.origin[0]; y = Y - R.origin[1]; src.push('position GPS'); }
  if (x == null || Math.hypot(x, y) > 1500) { const g = [...R.groups].sort((a, b) => b.L - a.L)[0], a = g.az * Math.PI / 180, d = Math.max(30, Math.min(80, g.L * 0.6)); x = Math.sin(a) * d; y = Math.cos(a) * d; src = ['position par défaut (devant la plus longue façade)']; }
  if (az == null) az = (Math.atan2(-x, -y) * 180 / Math.PI + 360) % 360; else src.push('cap boussole');
  if (meta.fov) src.push('focale EXIF');
  return { pose: { x, y, h: meta.h ?? 1.6, az, pitch: meta.pitch ?? 8, fov: Math.round(fov) }, src };
}
