// Physique du métro pour le moteur Saltline : uniquement des boîtes (quais, couloirs, marches, murs, rames).
// Même interface que la physique de Saltline. Grille spatiale pour rester rapide avec des milliers de boîtes.
(() => {
  const STEP = 0.42, CELL = 8, key = (i, j) => i * 100003 + j;
  window.__LIMOGES_PHYS = function (G) {
    const K = G.THREE.Vector3, boxes = [], grid = new Map();
    const cells = b => { const o = []; for (let i = Math.floor(b.min.x / CELL); i <= Math.floor(b.max.x / CELL); i++) for (let j = Math.floor(b.min.z / CELL); j <= Math.floor(b.max.z / CELL); j++) o.push(key(i, j)); return o; };
    const near = (x, z, r) => { const out = new Set(); for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) for (const b of grid.get(key(i, j)) || []) out.add(b); return out; };
    const o = {
      boxes, ready: Promise.resolve(), surface: () => -1e9, H0: () => 0,
      bounds: { min: new K(-60, -60, -60), max: new K(60, 20, 60) },
      addBox(a, b, T = {}) {
        const w = a.isVector3 ? a : new K(...a), S = b.isVector3 ? b : new K(...b);
        const R = { min: new K(Math.min(w.x, S.x), Math.min(w.y, S.y), Math.min(w.z, S.z)), max: new K(Math.max(w.x, S.x), Math.max(w.y, S.y), Math.max(w.z, S.z)), surface: T.surface || 'concrete', tag: T.tag || '', noNav: true, bulletOnly: !!T.bulletOnly, playerOnly: !!T.playerOnly };
        R._c = cells(R); for (const k of R._c) { let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(R); } boxes.push(R); return R;
      },
      removeBox(b) { const i = boxes.indexOf(b); if (i < 0) return; boxes.splice(i, 1); for (const k of b._c) { const l = grid.get(k); if (l) { const j = l.indexOf(b); if (j >= 0) l.splice(j, 1); } } },
      clear(tag) { for (const b of boxes.slice()) if (!tag || b.tag === tag) o.removeBox(b); },
      build() {},
      groundHeight(x, z, maxY = 50) { let g = -1e9; for (const R of near(x, z, 0.1)) if (!R.bulletOnly && x >= R.min.x && x <= R.max.x && z >= R.min.z && z <= R.max.z && R.max.y <= maxY && R.max.y > g) g = R.max.y; return g; },
      raycast(M, d, T = 500) {
        let best = Math.min(T, 200), hit = null;
        // parcours des cellules le long du rayon
        const seen = new Set(), stepL = CELL * 0.5;
        for (let t = 0; t <= best + CELL; t += stepL) {
          const x = M.x + d.x * t, z = M.z + d.z * t;
          for (const G2 of grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || []) {
            if (seen.has(G2) || G2.playerOnly) continue; seen.add(G2);
            let t0 = 0, t1 = best, ax = -1, sg = 0, ok = true;
            for (let c = 0; c < 3; c++) {
              const oc = c === 0 ? M.x : c === 1 ? M.y : M.z, dc = c === 0 ? d.x : c === 1 ? d.y : d.z, mn = c === 0 ? G2.min.x : c === 1 ? G2.min.y : G2.min.z, mx = c === 0 ? G2.max.x : c === 1 ? G2.max.y : G2.max.z;
              if (Math.abs(dc) < 1e-9) { if (oc < mn || oc > mx) { ok = false; break; } continue; }
              let a = (mn - oc) / dc, b = (mx - oc) / dc, s = -1; if (a > b) { const q = a; a = b; b = q; s = 1; }
              if (a > t0) { t0 = a; ax = c; sg = s; } if (b < t1) t1 = b; if (t0 > t1) { ok = false; break; }
            }
            if (ok && ax >= 0 && t0 < best) { best = t0; const n = new K(); n.setComponent(ax, sg); hit = { dist: t0, normal: n, surface: G2.surface, box: G2 }; }
          }
          if (hit && t > best + CELL) break;
        }
        if (!hit) return null; hit.point = new K(M.x + d.x * hit.dist, M.y + d.y * hit.dist, M.z + d.z * hit.dist); return hit;
      },
      lineOfSight(a, b) { const v = new K().subVectors(b, a), L = v.length(); if (L < 1e-4) return true; v.multiplyScalar(1 / L); return !o.raycast(a, v, L - 0.05); },
      moveCapsule(M, vel, dt, r = 0.32, h = 1.8, snap = true) {
        const z = { onGround: false, hitWall: false, hitCeil: false, surface: 'concrete' };
        const I = vel.x * dt, L = vel.z * dt, U = Math.max(1, Math.ceil(Math.hypot(I, L) / (r * 0.6))), y0 = M.y;
        for (let q = 0; q < U; q++) {
          M.x += I / U; M.z += L / U;
          for (let it = 0; it < 3; it++) {
            let moved = false;
            for (const te of near(M.x, M.z, r + 0.5)) {
              if (te.bulletOnly || te.max.y <= M.y + (snap ? STEP : 0.08) || te.min.y >= M.y + h) continue;
              const ox = Math.max(te.min.x, Math.min(te.max.x, M.x)), oz = Math.max(te.min.z, Math.min(te.max.z, M.z)); let le = M.x - ox, xe = M.z - oz; const j2 = le * le + xe * xe;
              if (j2 >= r * r) continue;
              if (j2 > 1e-10) { const O = Math.sqrt(j2), p = r - O; le /= O; xe /= O; M.x += le * p; M.z += xe * p; const vn = vel.x * le + vel.z * xe; if (vn < 0) { vel.x -= le * vn; vel.z -= xe * vn; } }
              else { const a = M.x - te.min.x, b = te.max.x - M.x, c = M.z - te.min.z, e = te.max.z - M.z, m = Math.min(a, b, c, e); if (m === a) M.x = te.min.x - r; else if (m === b) M.x = te.max.x + r; else if (m === c) M.z = te.min.z - r; else M.z = te.max.z + r; }
              z.hitWall = moved = true;
            }
            if (!moved) break;
          }
        }
        const C = M.y + vel.y * dt, A = r * 0.7, lim = y0 + (snap ? STEP : 0.08) + 1e-4;
        let F = -1e9, S = null, N = Infinity;
        for (const W of near(M.x, M.z, A + 0.2)) {
          if (W.bulletOnly || M.x + A < W.min.x || M.x - A > W.max.x || M.z + A < W.min.z || M.z - A > W.max.z) continue;
          if (W.max.y <= lim && W.max.y > F) { F = W.max.y; S = W.surface; }
          if (W.min.y >= y0 + h - 0.05 && W.min.y < N) N = W.min.y;
        }
        if (vel.y > 0 && C + h > N) { M.y = N - h; vel.y = 0; z.hitCeil = true; }
        else if (C <= F) { M.y = F; if (vel.y < 0) vel.y = 0; z.onGround = true; }
        else if (snap && vel.y <= 0 && C - F < STEP) { M.y = F; vel.y = 0; z.onGround = true; }
        else M.y = C;
        if (M.y < -200) { M.y = 5; vel.y = 0; }
        if (z.onGround) z.surface = S || 'concrete';
        return z;
      },
      nav: { cell: 0.5, isWalkable: () => true, findPath: (a, b) => [new K(b.x, 0, b.z)], randomPoint: p => new K(p.x, 0, p.z), clearLine: () => true, _grid: () => ({ blocked: new Uint8Array(1), w: 1, h: 1, minX: 0, minZ: 0, cell: 0.5 }) },
    };
    return o;
  };
})();
