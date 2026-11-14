// Étape 3 — Volume et toiture à partir du LiDAR HD (MNS = surface, MNT = sol).
// Détection de pans par RANSAC + moindres carrés, puis superstructures (édicules, cheminées) par composantes connexes.
import { pointInPolygon, distToPolygon, minAreaRect, median, percentile, densify } from '../geo.js';
import { sampleGrid } from '../sources/ign.js';

function fitPlane(X, Y, Z, idx) { // moindres carrés z = a x + b y + c
  let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, n = 0, sxz = 0, syz = 0, sz = 0;
  for (const i of idx) { const x = X[i], y = Y[i], z = Z[i]; sxx += x * x; sxy += x * y; sx += x; syy += y * y; sy += y; sxz += x * z; syz += y * z; sz += z; n++; }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], v = [sxz, syz, sz];
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M); if (Math.abs(D) < 1e-9) return null;
  const col = k => M.map((r, i) => r.map((c, j) => (j === k ? v[i] : c)));
  return { a: det(col(0)) / D, b: det(col(1)) / D, c: det(col(2)) / D };
}

export function analyseRoof(P, mns, mnt, opts = {}) {
  const thr = opts.threshold ?? 0.18, maxPlanes = opts.maxPlanes ?? 8;
  const W = mns.W, H = mns.H, rx = mns.rx, ry = mns.ry, bb = mns.bb;
  const [ox, oy] = opts.origin; // origine locale (pour la stabilité numérique)
  // 1. pixels de toit : dans l'emprise, à plus de 0,6 m des murs (évite le mélange mur/sol)
  const pix = [], X = [], Y = [], Z = [];
  const lab = new Int16Array(W * H).fill(-2); // -2 hors toit, -1 non attribué, >=0 pan, 100 superstructure
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const x = bb[0] + (c + 0.5) * rx, y = bb[3] - (r + 0.5) * ry, z = mns.data[r * W + c];
    if (z !== z || !pointInPolygon(x, y, P) || distToPolygon(x, y, P) < 0.6) continue;
    lab[r * W + c] = -1; pix.push(r * W + c); X.push(x - ox); Y.push(y - oy); Z.push(z);
  }
  const n = pix.length;
  if (n < 12) return { ok: false, reason: 'trop peu de points LiDAR sur le toit (' + n + ')' };
  const pixIndex = new Int32Array(W * H).fill(-1); pix.forEach((p, i) => (pixIndex[p] = i));
  // 2. RANSAC séquentiel, échantillons tirés dans un voisinage (pans petits ou nombreux)
  const planes = []; let remaining = [...Array(n).keys()];
  const minSize = Math.max(20, Math.round(n * 0.02));
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let p = 0; p < maxPlanes && remaining.length >= minSize; p++) {
    const alive = new Uint8Array(n); for (const i of remaining) alive[i] = 1;
    let best = null, bestCount = 0;
    for (let it = 0; it < 350; it++) {
      const i0 = remaining[(rnd() * remaining.length) | 0], r0 = (pix[i0] / W) | 0, c0 = pix[i0] % W, s = [i0];
      for (let t = 0; t < 30 && s.length < 3; t++) {
        const rr = r0 + Math.round((rnd() * 2 - 1) * 10), cc = c0 + Math.round((rnd() * 2 - 1) * 10);
        if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue; const j = pixIndex[rr * W + cc];
        if (j >= 0 && alive[j] && !s.includes(j)) s.push(j);
      }
      if (s.length < 3) continue;
      const pl = fitPlane(X, Y, Z, s); if (!pl || Math.hypot(pl.a, pl.b) > 3) continue; // > 72° : mur, pas toit
      let cnt = 0; for (const i of remaining) if (Math.abs(Z[i] - (pl.a * X[i] + pl.b * Y[i] + pl.c)) < thr) cnt++;
      if (cnt > bestCount) { bestCount = cnt; best = pl; }
    }
    if (!best || bestCount < minSize) break;
    let inl = remaining.filter(i => Math.abs(Z[i] - (best.a * X[i] + best.b * Y[i] + best.c)) < thr);
    const ref = fitPlane(X, Y, Z, inl) || best;
    inl = remaining.filter(i => Math.abs(Z[i] - (ref.a * X[i] + ref.b * Y[i] + ref.c)) < thr);
    const slope = Math.atan(Math.hypot(ref.a, ref.b)) * 180 / Math.PI;
    const azimuth = (Math.atan2(-ref.a, -ref.b) * 180 / Math.PI + 360) % 360; // direction de la descente
    planes.push({ ...ref, slope, azimuth, count: inl.length });
    const set = new Set(inl); remaining = remaining.filter(i => !set.has(i));
  }
  if (!planes.length) return { ok: false, reason: 'aucun pan de toit détecté' };
  // 3. attribution finale de chaque pixel au pan le plus proche ; au-dessus = superstructure
  const resid = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let bk = -1, bd = Infinity, bs = 0;
    for (let k = 0; k < planes.length; k++) { const d = Z[i] - (planes[k].a * X[i] + planes[k].b * Y[i] + planes[k].c); if (Math.abs(d) < Math.abs(bd)) { bd = d; bk = k; } }
    resid[i] = bd;
    lab[pix[i]] = Math.abs(bd) < 0.35 ? bk : bd > 0.5 ? 100 : -1;
  }
  // pixels « superstructure » : plus haut que le pan le plus proche *en dessous*
  // 4. superstructures = composantes connexes de pixels 100
  const seen = new Uint8Array(W * H), supers = [];
  for (const p0 of pix) {
    if (lab[p0] !== 100 || seen[p0]) continue;
    const comp = [p0]; seen[p0] = 1;
    for (let q = 0; q < comp.length; q++) {
      const p = comp[q], r = (p / W) | 0, c = p % W;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
        const pp = rr * W + cc; if (!seen[pp] && lab[pp] === 100) { seen[pp] = 1; comp.push(pp); }
      }
    }
    const area = comp.length * rx * ry; if (area < 1.2) continue;
    const pts = comp.map(p => [bb[0] + (p % W + 0.5) * rx - ox, bb[3] - (((p / W) | 0) + 0.5) * ry - oy]);
    const rect = minAreaRect(pts); rect.w += rx; rect.d += ry;
    const rs = comp.map(p => resid[pixIndex[p]]);
    // base = pan sous le centre
    const k = nearestPlane(planes, rect.cx, rect.cy, median(comp.map(p => Z[pixIndex[p]])) - percentile(rs, 0.9));
    const base = planes[k].a * rect.cx + planes[k].b * rect.cy + planes[k].c;
    supers.push({ ...rect, area, base, h: Math.max(0.4, percentile(rs, 0.85)), plane: k });
    if (supers.length >= 400) break;
  }
  // 5. classification du toit
  const tot = planes.reduce((s, p) => s + p.count, 0);
  const main = planes.filter(p => p.count > tot * 0.05);
  const flat = main.filter(p => p.slope < 6), pitched = main.filter(p => p.slope >= 6);
  let type;
  if (!pitched.length) type = flat.length > 1 ? `terrasse à ${flat.length} niveaux` : 'toit-terrasse (plat)';
  else if (pitched.length === 1 && !flat.length) type = 'monopente';
  else if (pitched.length === 2 && Math.abs(((pitched[0].azimuth - pitched[1].azimuth + 540) % 360) - 180) < 25) type = 'deux pans';
  else if (pitched.length === 4) type = 'quatre pans (croupe)';
  else type = `complexe (${pitched.length} pans${flat.length ? ' + ' + flat.length + ' terrasse(s)' : ''})`;
  const assigned = pix.filter(p => lab[p] >= 0 && lab[p] < 100).length;
  const rms = Math.sqrt(pix.reduce((s, p, i) => (lab[p] >= 0 && lab[p] < 100 ? s + resid[i] ** 2 : s), 0) / Math.max(1, assigned));
  // hauteur du toit en (x,y) locaux : pan du pixel le plus proche
  function roofZ(x, y) {
    const c = Math.floor((x + ox - bb[0]) / rx), r = Math.floor((bb[3] - (y + oy)) / ry);
    for (let rad = 0; rad <= 8; rad++) {
      let bk = -1, bd = Infinity;
      for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
        const L = lab[rr * W + cc]; if (L >= 0 && L < 100) { const d = dr * dr + dc * dc; if (d < bd) { bd = d; bk = L; } }
      }
      if (bk >= 0) return planes[bk].a * x + planes[bk].b * y + planes[bk].c;
    }
    return planes[0].a * x + planes[0].b * y + planes[0].c;
  }
  return {
    ok: true, planes, supers, type, roofZ, lab, pix, resid, X, Y, Z, W, H, bb, rx, ry,
    coverage: assigned / n, rms, nPix: n, density: mns.valid,
    zMedian: median(Z), zMax: percentile(Z, 0.98), zMin: percentile(Z, 0.02),
  };
}
function nearestPlane(planes, x, y, z) {
  let bk = 0, bd = Infinity;
  for (let k = 0; k < planes.length; k++) { const d = Math.abs(z - (planes[k].a * x + planes[k].b * y + planes[k].c)); if (d < bd) { bd = d; bk = k; } }
  return bk;
}

// Sol au pied des murs : MNT échantillonné 1,5 m à l'extérieur de chaque point du contour
export function groundAlongOutline(P, mnt, origin, step = 1) {
  const res = [];
  for (const ring of [P.outer, ...P.holes]) {
    const d = densify(ring, step);
    for (let i = 0; i < d.length; i++) {
      const a = ring[d[i].edge], b = ring[(d[i].edge + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L; // normale extérieure
      let z = sampleGrid(mnt, d[i].x + nx * 1.5, d[i].y + ny * 1.5);
      if (z !== z) z = sampleGrid(mnt, d[i].x, d[i].y);
      res.push(z);
    }
  }
  const v = res.filter(z => z === z);
  return { min: Math.min(...v), max: Math.max(...v), median: median(v) };
}
