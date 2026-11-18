// Détection des pièces : graphe planaire des murs → faces fermées.
// Entrée : segments [[ [u,v], [u,v] ], ...] en mètres. Sortie : [{ poly:[[u,v]...], area }]

const EPS = 0.02;
const key = p => Math.round(p[0] * 100) + ',' + Math.round(p[1] * 100);

function segInter(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  const lt = EPS / Math.hypot(...r), lu = EPS / Math.hypot(...s);
  if (t < -lt || t > 1 + lt || u < -lu || u > 1 + lu) return null;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}
function paramOn(a, b, p) {
  const r = [b[0] - a[0], b[1] - a[1]], L2 = r[0] * r[0] + r[1] * r[1];
  const t = ((p[0] - a[0]) * r[0] + (p[1] - a[1]) * r[1]) / L2;
  const q = [a[0] + r[0] * t, a[1] + r[1] * t];
  return Math.hypot(p[0] - q[0], p[1] - q[1]) < EPS && t > -0.001 && t < 1.001 ? t : null;
}
export function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}
export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
// point garanti à l'intérieur (centroïde, sinon meilleur point d'une grille)
export function labelPoint(poly) {
  const A = signedArea(poly); let cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], f = a[0] * b[1] - b[0] * a[1]; cx += (a[0] + b[0]) * f; cy += (a[1] + b[1]) * f; }
  const c = [cx / (6 * A), cy / (6 * A)];
  if (pointInPoly(c, poly)) return c;
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  let best = poly[0], bd = -1;
  for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
    const p = [Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * i / 12, Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * j / 12];
    if (!pointInPoly(p, poly)) continue;
    let d = Infinity; for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length]; d = Math.min(d, distSeg(p, a, b)); }
    if (d > bd) { bd = d; best = p; }
  }
  return best;
}
export function distSeg(p, a, b) {
  const r = [b[0] - a[0], b[1] - a[1]], L2 = r[0] * r[0] + r[1] * r[1] || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * r[0] + (p[1] - a[1]) * r[1]) / L2));
  return Math.hypot(p[0] - a[0] - r[0] * t, p[1] - a[1] - r[1] * t);
}

export function detectRooms(segments) {
  // 1. points de coupe de chaque segment
  const cuts = segments.map(([a, b]) => [{ t: 0, p: a }, { t: 1, p: b }]);
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const [a, b] = segments[i], [c, d] = segments[j];
    const x = segInter(a, b, c, d);
    if (x) {
      const ti = paramOn(a, b, x), tj = paramOn(c, d, x);
      if (ti !== null) cuts[i].push({ t: ti, p: x });
      if (tj !== null) cuts[j].push({ t: tj, p: x });
    }
    for (const [p, k, s] of [[c, i, segments[i]], [d, i, segments[i]], [a, j, segments[j]], [b, j, segments[j]]]) {
      const t = paramOn(s[0], s[1], p); if (t !== null) cuts[k].push({ t, p });
    }
  }
  // 2. nœuds et arêtes
  const nodes = new Map(), adj = new Map(), edges = new Set();
  const node = p => { const k = key(p); if (!nodes.has(k)) { nodes.set(k, [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]); adj.set(k, new Set()); } return k; };
  for (const list of cuts) {
    list.sort((x, y) => x.t - y.t);
    for (let i = 0; i < list.length - 1; i++) {
      const ka = node(list[i].p), kb = node(list[i + 1].p);
      if (ka === kb) continue;
      const e = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      if (edges.has(e)) continue;
      edges.add(e); adj.get(ka).add(kb); adj.get(kb).add(ka);
    }
  }
  // 3. on retire les murs qui ne ferment rien (bouts pendants)
  let changed = true;
  while (changed) {
    changed = false;
    for (const [k, s] of adj) if (s.size === 1) { const o = [...s][0]; adj.get(o).delete(k); s.clear(); changed = true; }
  }
  // 4. voisins triés par angle
  const sorted = new Map();
  for (const [k, s] of adj) {
    if (!s.size) continue;
    const p = nodes.get(k);
    sorted.set(k, [...s].sort((x, y) => { const a = nodes.get(x), b = nodes.get(y); return Math.atan2(a[1] - p[1], a[0] - p[0]) - Math.atan2(b[1] - p[1], b[0] - p[0]); }));
  }
  // 5. parcours des faces
  const seen = new Set(), faces = [];
  for (const [u, list] of sorted) for (const v of list) {
    if (seen.has(u + '>' + v)) continue;
    const poly = []; let a = u, b = v, guard = 0;
    while (!seen.has(a + '>' + b) && guard++ < 500) {
      seen.add(a + '>' + b); poly.push(nodes.get(a));
      const nb = sorted.get(b), i = nb.indexOf(a);
      const c = nb[(i - 1 + nb.length) % nb.length];
      a = b; b = c;
    }
    if (poly.length >= 3) faces.push({ poly, area: signedArea(poly) });
  }
  if (!faces.length) return [];
  // 6. la face extérieure a la plus grande aire en valeur absolue : on garde les faces de signe opposé
  const outer = faces.reduce((m, f) => Math.abs(f.area) > Math.abs(m.area) ? f : m);
  const sign = -Math.sign(outer.area);
  return faces.filter(f => Math.sign(f.area) === sign && Math.abs(f.area) > 0.3)
    .map(f => ({ poly: sign < 0 ? f.poly.slice().reverse() : f.poly, area: Math.abs(f.area) }));
}
