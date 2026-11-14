// Étapes 5 à 7 — façades : découpage, projection de photos réelles (rectification), ouvertures.
// Méthode inspirée d'orthofacade (Apache-2.0, L. E.) : une texture rectifiée par façade à échelle métrique,
// avec un masque indiquant d'où vient chaque pixel. Réécrit en JS pour tourner dans Safari, avec Panoramax.
import { sampleGrid } from '../sources/ign.js';
import { clamp, median } from '../geo.js';

// ---------- 1. découpage du contour en façades (suites d'arêtes de même orientation) ----------
export function facadeGroups(P, origin, maxTurn = 22) {
  const groups = [];
  [P.outer, ...P.holes].forEach((ringAbs, ri) => {
    const ring = ringAbs.map(p => [p[0] - origin[0], p[1] - origin[1]]), n = ring.length;
    const edges = ring.map((a, i) => { const b = ring[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return { i, a, b, L, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }; });
    const turn = i => { let d = edges[i].ang - edges[(i - 1 + n) % n].ang; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d) * 180 / Math.PI; };
    let start = 0, bt = -1; for (let i = 0; i < n; i++) if (turn(i) > bt) { bt = turn(i); start = i; }
    let cur = null;
    for (let k = 0; k < n; k++) {
      const e = edges[(start + k) % n];
      // angle moyen pondéré du groupe courant
      if (cur) {
        let d = e.ang - cur.ref; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * 180 / Math.PI;
        if (d > maxTurn || turn(e.i) > maxTurn * 0.8) { groups.push(cur); cur = null; }
      }
      if (!cur) cur = { ring: ri, edges: [], L: 0, ref: e.ang };
      e.s0 = cur.L; cur.edges.push(e); cur.L += e.L;
    }
    if (cur) groups.push(cur);
  });
  // orientation (azimut de la normale extérieure) et nom lisible
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  groups.forEach((g, k) => {
    let nx = 0, ny = 0; for (const e of g.edges) { nx += (e.b[1] - e.a[1]); ny += -(e.b[0] - e.a[0]); }
    g.az = (Math.atan2(nx, ny) * 180 / Math.PI + 360) % 360; g.id = k;
    g.name = `${g.ring ? 'Cour' : 'Façade'} ${dirs[Math.round(g.az / 45) % 8]} · ${g.L.toFixed(1)} m`;
  });
  return groups.filter(g => g.L > 0.3);
}
// point (x,y) local + normale d'une abscisse s le long d'une façade
export function facadePoint(g, s) {
  let e = g.edges[g.edges.length - 1];
  for (const f of g.edges) if (s <= f.s0 + f.L) { e = f; break; }
  const t = clamp((s - e.s0) / (e.L || 1), 0, 1);
  return { x: e.a[0] + (e.b[0] - e.a[0]) * t, y: e.a[1] + (e.b[1] - e.a[1]) * t, nx: (e.b[1] - e.a[1]) / e.L, ny: -(e.b[0] - e.a[0]) / e.L, edge: e };
}

// ---------- 2. profil vertical de chaque façade (sol, égout) ----------
export function facadeProfiles(groups, ctx) {
  const { mnt, roof, origin, fallbackGround, fallbackTop } = ctx;
  for (const g of groups) {
    g.samples = [];
    const n = Math.max(2, Math.ceil(g.L / 1) + 1);
    for (let k = 0; k < n; k++) {
      const s = g.L * k / (n - 1), p = facadePoint(g, s);
      let gz = mnt ? sampleGrid(mnt, p.x + origin[0] + p.nx * 1.5, p.y + origin[1] + p.ny * 1.5) : NaN; if (gz !== gz) gz = fallbackGround;
      let tz = roof && roof.ok ? roof.roofZ(p.x - p.nx * 0.4, p.y - p.ny * 0.4) : fallbackTop; if (tz !== tz) tz = fallbackTop;
      g.samples.push({ s, ground: gz, eave: tz });
    }
    g.zBot = Math.min(...g.samples.map(q => q.ground)) - 0.6;
    g.zTop = Math.max(...g.samples.map(q => q.eave)) + (ctx.parapet || 0);
  }
}
export function profileAt(g, s, key) {
  const a = g.samples, f = clamp(s / g.L, 0, 1) * (a.length - 1), i = Math.min(a.length - 2, Math.floor(f)), t = f - i;
  return a[i][key] * (1 - t) + a[i + 1][key] * t;
}

// ---------- 3. textures de façade (canvas à l'échelle : r px / m) ----------
export function allocTextures(groups, budget = 2048 * 2048 * 0.85) {
  let k = 1;
  for (let it = 0; it < 2; it++) {
    let tot = 0;
    for (const g of groups) {
      const hz = g.zTop - g.zBot;
      g.r = clamp(Math.min(12, 2048 / g.L, 1024 / hz) * k, 1, 12);
      g.tw = Math.max(4, Math.ceil(g.L * g.r)); g.th = Math.max(4, Math.ceil(hz * g.r)); tot += (g.tw + 2) * (g.th + 2);
    }
    if (tot <= budget) break; k *= Math.sqrt(budget / tot) * 0.97;
  }
  for (const g of groups) {
    g.rgba = new Uint8ClampedArray(g.tw * g.th * 4); // couleur
    g.src = new Uint8Array(g.tw * g.th); // 0 rien, 1 photo Panoramax, 2 photo utilisateur
    g.photoIds = new Set();
  }
}

// ---------- 4. projection des photos Panoramax ----------
// position caméra : (x,y) locaux + z ; projection d'un point 3D dans l'image
export function projector(ph) {
  const az = ph.azimuth * Math.PI / 180, pitch = (ph.pitch || 0) * Math.PI / 180;
  if (ph.spherical) {
    return (dx, dy, dz) => {
      let rel = Math.atan2(dx, dy) - az; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const el = Math.atan2(dz, Math.hypot(dx, dy)) - pitch;
      return [(0.5 + rel / (2 * Math.PI)) * ph.W, (0.5 - el / Math.PI) * ph.H];
    };
  }
  // perspective : repère caméra exact (azimut + inclinaison), identique à la caméra Three.js de l'aligneur
  const f = (ph.W / 2) / Math.tan(ph.fov * Math.PI / 360), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const F = [Math.sin(az) * cp, Math.cos(az) * cp, sp], Rv = [Math.cos(az), -Math.sin(az), 0], U = [Rv[1] * F[2] - Rv[2] * F[1], Rv[2] * F[0] - Rv[0] * F[2], Rv[0] * F[1] - Rv[1] * F[0]];
  return (dx, dy, dz) => {
    const zf = dx * F[0] + dy * F[1] + dz * F[2]; if (zf < 0.5) return null;
    const u = ph.W / 2 + f * (dx * Rv[0] + dy * Rv[1] + dz * Rv[2]) / zf, v = ph.H / 2 - f * (dx * U[0] + dy * U[1] + dz * U[2]) / zf;
    return u < 0 || v < 0 || u >= ph.W - 1 || v >= ph.H - 1 ? null : [u, v];
  };
}
// visibilité d'un point de façade depuis une caméra : orientation, distance, occultation LiDAR (arbres, bâtiments)
export function visible(P3, n, cam, mnsEnv, origin, maxDist) {
  const dx = cam.x - P3.x, dy = cam.y - P3.y, dz = cam.z - P3.z, d = Math.hypot(dx, dy);
  if (d > maxDist || d < 2) return 0;
  const cosA = (dx * n.nx + dy * n.ny) / d; if (cosA < 0.2) return 0;
  if (mnsEnv) {
    const steps = Math.floor(d / 1.0);
    for (let k = 2; k < steps; k++) {
      const t = k / steps, x = P3.x + dx * t, y = P3.y + dy * t, z = P3.z + dz * t;
      const h = sampleGrid(mnsEnv, x + origin[0], y + origin[1]);
      if (h === h && h > z + 0.7) return 0;
    }
  }
  return cosA / Math.max(6, d); // score : face à la façade et proche = mieux
}

export function scorePhotos(groups, photos, ctx) {
  const { origin, mnsEnv, maxDist } = ctx;
  for (const g of groups) {
    g.cands = [];
    for (const ph of photos) {
      let sc = 0, vis = 0; const N = Math.max(4, Math.min(24, Math.ceil(g.L / 4)));
      for (let k = 0; k < N; k++) {
        const s = g.L * (k + 0.5) / N, p = facadePoint(g, s), ground = profileAt(g, s, 'ground'), top = profileAt(g, s, 'eave');
        for (const fz of [0.35, 0.7]) {
          const v = visible({ x: p.x + p.nx * 0.6, y: p.y + p.ny * 0.6, z: ground + (top - ground) * fz }, p, ph.cam, mnsEnv, origin, maxDist);
          if (v > 0) { vis++; sc += v; }
        }
      }
      if (vis) g.cands.push({ ph, score: sc, vis: vis / (2 * N) });
    }
    g.cands.sort((a, b) => b.score - a.score);
  }
}

// remplit les pixels de façade à partir des photos chargées (ph.pix)
export function projectPhotos(g, ctx, cands = null, srcVal = 1) {
  const { origin, mnsEnv, maxDist } = ctx; cands = (cands || g.cands).filter(c => c.ph.pix).slice(0, 4);
  if (!cands.length) return 0;
  const projs = cands.map(c => { c.ph.W = c.ph.pix.W; c.ph.H = c.ph.pix.H; return projector(c.ph); });
  // visibilité sur une grille grossière (1 m) pour rester rapide sur iPhone
  const cw = Math.max(1, Math.ceil(g.L)), ch = Math.max(1, Math.ceil(g.zTop - g.zBot));
  const vis = cands.map(() => new Float32Array(cw * ch));
  for (let i = 0; i < cw; i++) {
    const s = Math.min(g.L, i + 0.5), p = facadePoint(g, s), ground = profileAt(g, s, 'ground'), top = profileAt(g, s, 'eave') + 0.6;
    for (let j = 0; j < ch; j++) {
      const z = g.zTop - (j + 0.5); if (z < ground - 0.2 || z > top) continue;
      cands.forEach((c, k) => { vis[k][j * cw + i] = visible({ x: p.x + p.nx * 0.5, y: p.y + p.ny * 0.5, z }, p, c.ph.cam, mnsEnv, origin, maxDist); });
    }
  }
  let filled = 0; const { tw, th, r, rgba, src } = g;
  for (let px = 0; px < tw; px++) {
    const s = (px + 0.5) / r, p = facadePoint(g, s), ci = Math.min(cw - 1, Math.floor(s));
    for (let py = 0; py < th; py++) {
      if (src[py * tw + px] === 2 && srcVal === 1) continue; // une photo posée à la main est prioritaire
      const z = g.zTop - (py + 0.5) / r, cj = Math.min(ch - 1, Math.floor(g.zTop - z));
      let bk = -1, bs = 0; for (let k = 0; k < cands.length; k++) { const v = vis[k][cj * cw + ci]; if (v > bs) { bs = v; bk = k; } }
      if (bk < 0) continue;
      const ph = cands[bk].ph, uv = projs[bk](p.x - ph.cam.x, p.y - ph.cam.y, z - ph.cam.z); if (!uv) continue;
      const col = bilinear(ph.pix, uv[0], uv[1]); const o = (py * tw + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 255; src[py * tw + px] = srcVal; filled++;
      g.photoIds.add(ph.id);
    }
  }
  return filled;
}
function bilinear(pix, u, v) {
  const W = pix.W, H = pix.H; u = ((u % W) + W) % W; v = clamp(v, 0, H - 1.001);
  const x0 = Math.floor(u), y0 = Math.floor(v), x1 = (x0 + 1) % W, y1 = y0 + 1, fx = u - x0, fy = v - y0, d = pix.data, o = [0, 0, 0];
  for (let c = 0; c < 3; c++) o[c] = d[(y0 * W + x0) * 4 + c] * (1 - fx) * (1 - fy) + d[(y0 * W + x1) * 4 + c] * fx * (1 - fy) + d[(y1 * W + x0) * 4 + c] * (1 - fx) * fy + d[(y1 * W + x1) * 4 + c] * fx * fy;
  return o;
}

// ---------- 5. photo fournie par l'utilisateur : rectification par homographie (4 coins touchés) ----------
export function homography(src, dst) { // src[i] -> dst[i], 4 points
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) { // Gauss avec pivot
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]); h.push(1); return h;
}
const applyH = (h, x, y) => { const w = h[6] * x + h[7] * y + h[8]; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
// corners = [bas-gauche, bas-droite, haut-droite, haut-gauche] dans l'image, pour la façade vue de face
export function applyUserPhoto(g, pix, corners) {
  const q = [[0, profileAt(g, 0, 'ground')], [g.L, profileAt(g, g.L, 'ground')], [g.L, profileAt(g, g.L, 'eave')], [0, profileAt(g, 0, 'eave')]];
  const H = homography(q, corners); let n = 0; const { tw, th, r, rgba, src } = g;
  for (let px = 0; px < tw; px++) {
    const s = (px + 0.5) / r, gz = profileAt(g, s, 'ground') - 0.3, ez = profileAt(g, s, 'eave') + 0.3;
    for (let py = 0; py < th; py++) {
      const z = g.zTop - (py + 0.5) / r; if (z < gz || z > ez) continue;
      const [u, v] = applyH(H, s, z); if (u < 0 || v < 0 || u >= pix.W - 1 || v >= pix.H - 1) continue;
      const c = bilinear(pix, u, v), o = (py * tw + px) * 4; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255; src[py * tw + px] = 2; n++;
    }
  }
  return n;
}

// ---------- 6. étages ----------
export function floorModel(attrs, eaveRef, groundMin, parapet, usage) {
  const res = usage === 'Résidentiel' || /habit|resid|house|apartment/i.test(usage || '');
  const Href = eaveRef - parapet - groundMin;
  let n = attrs.etages, h, kind = 'deduite', conf = 0.5, note;
  if (n && n > 0) { h = clamp(Href / n, 2.45, 5); note = `${n} étages (fichiers fonciers) répartis sur ${Href.toFixed(1)} m mesurés`; conf = Href / n >= 2.45 && Href / n <= 3.6 ? 0.7 : 0.4; }
  else { h = res ? 2.8 : 3.6; n = Math.max(1, Math.round(Href / h)); note = `aucun nombre d'étages connu : hauteur type ${res ? 'logement' : 'activité'} ${h} m`; conf = 0.3; }
  // niveaux de plancher : du haut vers le bas, horizontaux sur tout le bâtiment (le sol en pente coupe les niveaux bas)
  const levels = []; for (let k = 0; k < 60; k++) { const z = eaveRef - parapet - (k + 1) * h; if (z < groundMin - h * 0.5) break; levels.push(z); }
  return { n, h, levels: levels.reverse(), kind, conf, note, residential: res };
}

// ---------- 7. ouvertures ----------
// a) détection sur les pixels photographiés : colonnes sombres dans la bande de chaque étage
export function detectWindows(g, floors) {
  const { tw, th, r, rgba, src } = g, out = [];
  const lum = new Float32Array(tw * th);
  for (let i = 0; i < tw * th; i++) lum[i] = src[i] ? 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2] : NaN;
  let photoPx = 0;
  for (const z0 of floors.levels) {
    const zA = z0 + 0.95, zB = z0 + Math.min(floors.h - 0.35, 2.3);
    const pyA = Math.floor((g.zTop - zB) * r), pyB = Math.ceil((g.zTop - zA) * r); if (pyA < 0 || pyB >= th) continue;
    const col = new Float32Array(tw).fill(NaN), cov = new Float32Array(tw);
    for (let px = 0; px < tw; px++) { let s = 0, c = 0; for (let py = pyA; py <= pyB; py++) { const v = lum[py * tw + px]; if (v === v) { s += v; c++; } } if (c > (pyB - pyA + 1) * 0.6) { col[px] = s / c; cov[px] = 1; photoPx++; } }
    const vals = [...col].filter(v => v === v); if (vals.length < tw * 0.25) continue;
    const med = median(vals), thr = med * 0.78; let run = -1;
    for (let px = 0; px <= tw; px++) {
      const dark = px < tw && col[px] === col[px] && col[px] < thr;
      if (dark && run < 0) run = px;
      if (!dark && run >= 0) {
        const w = (px - run) / r;
        if (w >= 0.5 && w <= 3.6) out.push({ s: (run + px) / 2 / r, w, z: zA, h: zB - zA, level: z0, kind: 'photographiee' });
        run = -1;
      }
    }
  }
  return { windows: out, coverage: photoPx / Math.max(1, tw * floors.levels.length) };
}
// b) ouvertures déduites : trame régulière selon l'usage (aucune observation)
export function deduceWindows(g, floors, prm) {
  const out = [], spacing = prm.spacing, w = prm.width, margin = Math.max(0.9, (spacing - w) / 2 + 0.3);
  if (g.L < w + 1) return out;
  const n = Math.max(1, Math.floor((g.L - 2 * margin) / spacing) + 1), used = (n - 1) * spacing, s0 = (g.L - used) / 2;
  for (const z0 of floors.levels) for (let i = 0; i < n; i++) {
    const s = s0 + i * spacing, ground = profileAt(g, s, 'ground'), eave = profileAt(g, s, 'eave');
    const zA = z0 + prm.sill, zB = zA + prm.height;
    if (zA < ground + 0.4 || zB > eave - 0.25) continue;
    out.push({ s, w, z: zA, h: prm.height, level: z0, kind: 'deduite' });
  }
  return out;
}
