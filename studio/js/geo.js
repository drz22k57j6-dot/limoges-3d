// Géométrie et projections — aucun code dépendant d'une ville.
// Lambert-93 (EPSG:2154, ellipsoïde GRS80) <-> WGS84. RGF93 et WGS84 coïncident au centimètre près.

const A = 6378137, F = 1 / 298.257222101, E = Math.sqrt(2 * F - F * F);
const LON0 = 3 * Math.PI / 180, PHI0 = 46.5 * Math.PI / 180, PHI1 = 44 * Math.PI / 180, PHI2 = 49 * Math.PI / 180;
const X0 = 700000, Y0 = 6600000;
const mF = p => Math.cos(p) / Math.sqrt(1 - E * E * Math.sin(p) ** 2);
const tF = p => Math.tan(Math.PI / 4 - p / 2) / ((1 - E * Math.sin(p)) / (1 + E * Math.sin(p))) ** (E / 2);
const m1 = mF(PHI1), m2 = mF(PHI2), t0 = tF(PHI0), t1 = tF(PHI1), t2 = tF(PHI2);
const N = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
const FF = m1 / (N * t1 ** N), R0 = A * FF * t0 ** N;

export function toL93(lon, lat) {
  const p = lat * Math.PI / 180, r = A * FF * tF(p) ** N, th = N * (lon * Math.PI / 180 - LON0);
  return [X0 + r * Math.sin(th), Y0 + R0 - r * Math.cos(th)];
}
export function fromL93(x, y) {
  const dx = x - X0, dy = R0 - (y - Y0), r = Math.sign(N) * Math.hypot(dx, dy), t = (r / (A * FF)) ** (1 / N);
  const th = Math.atan2(dx, dy);
  let p = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 8; i++) p = Math.PI / 2 - 2 * Math.atan(t * ((1 - E * Math.sin(p)) / (1 + E * Math.sin(p))) ** (E / 2));
  return [(th / N + LON0) * 180 / Math.PI, p * 180 / Math.PI];
}
// Hors de France : projection locale (plan tangent) autour d'un point, en mètres.
export function localProjection(lon0, lat0) {
  const k = 111320, c = Math.cos(lat0 * Math.PI / 180);
  return { fwd: (lon, lat) => [(lon - lon0) * k * c, (lat - lat0) * 110574], inv: (x, y) => [lon0 + x / (k * c), lat0 + y / 110574] };
}

// ---------- polygones (anneaux [[x,y],...], non fermés) ----------
export function ringArea(r) { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const a = r[i], b = r[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export function cleanRing(r) {
  const o = [];
  for (const p of r) { const q = o[o.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05) o.push([p[0], p[1], p[2]]); }
  if (o.length > 1 && Math.hypot(o[0][0] - o.at(-1)[0], o[0][1] - o.at(-1)[1]) < 0.05) o.pop();
  return o;
}
// polygone = { outer: ring CCW, holes: [ring CW] }
export function normalizePolygon(outer, holes = []) {
  outer = cleanRing(outer); if (ringArea(outer) < 0) outer.reverse();
  holes = holes.map(cleanRing).filter(h => h.length >= 3).map(h => (ringArea(h) > 0 ? h.reverse() : h));
  return { outer, holes };
}
export function pointInRing(x, y, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function pointInPolygon(x, y, P) { if (!pointInRing(x, y, P.outer)) return false; for (const h of P.holes) if (pointInRing(x, y, h)) return false; return true; }
export function bboxOf(P, m = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of P.outer) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return [x0 - m, y0 - m, x1 + m, y1 + m];
}
export function centroid(P) {
  const r = P.outer; let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length], c = p[0] * q[1] - q[0] * p[1]; a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; }
  return [cx / (3 * a), cy / (3 * a)];
}
export function perimeter(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); } return s; }
// distance d'un point à un segment
export function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
export function distToPolygon(x, y, P) {
  let d = Infinity;
  for (const r of [P.outer, ...P.holes]) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; d = Math.min(d, distSeg(x, y, a[0], a[1], b[0], b[1])); }
  return d;
}
// Rectangle orienté d'aire minimale (calipers) d'un nuage de points [[x,y]]
export function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}
export function minAreaRect(pts) {
  const h = convexHull(pts); let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of h) { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const ar = (u1 - u0) * (v1 - v0);
    if (!best || ar < best.area) { const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2; best = { area: ar, cx: uc * c - vc * s, cy: uc * s + vc * c, w: u1 - u0, d: v1 - v0, ang }; }
  }
  return best || { area: 0, cx: pts[0][0], cy: pts[0][1], w: 0.5, d: 0.5, ang: 0 };
}
// Densifie un anneau : points tous les `step` m, en gardant les sommets d'origine (flag corner)
export function densify(r, step) {
  const o = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) o.push({ x: a[0] + (b[0] - a[0]) * k / n, y: a[1] + (b[1] - a[1]) * k / n, corner: k === 0, edge: i, t: k / n });
  }
  return o;
}

// ---------- triangulation de Delaunay (Bowyer–Watson, suffisant pour quelques milliers de points) ----------
export function delaunay(pts) {
  const n = pts.length; if (n < 3) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const d = Math.max(x1 - x0, y1 - y0) * 20, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const P = pts.map(p => [p[0], p[1]]).concat([[mx - d, my - d], [mx, my + d], [mx + d, my - d]]);
  const cc = (a, b, c) => {
    const ax = P[a][0], ay = P[a][1], bx = P[b][0], by = P[b][1], cx = P[c][0], cy = P[c][1];
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
    return [ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2];
  };
  let tris = [[n, n + 1, n + 2, ...cc(n, n + 1, n + 2)]];
  const order = [...Array(n).keys()].sort((a, b) => P[a][0] - P[b][0]);
  for (const i of order) {
    const [px, py] = P[i], bad = [], keep = [];
    for (const t of tris) ((px - t[3]) ** 2 + (py - t[4]) ** 2 < t[5] * (1 - 1e-12) ? bad : keep).push(t);
    const edges = new Map();
    for (const t of bad) for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) { const k = a < b ? a + ',' + b : b + ',' + a; edges.set(k, edges.has(k) ? null : [a, b]); }
    for (const e of edges.values()) if (e) keep.push([e[0], e[1], i, ...cc(e[0], e[1], i)]);
    tris = keep;
  }
  return tris.filter(t => t[0] < n && t[1] < n && t[2] < n).map(t => [t[0], t[1], t[2]]);
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const median = a => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const percentile = (a, q) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
