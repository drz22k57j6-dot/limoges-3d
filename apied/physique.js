// Physique de Limoges pour le moteur Saltline : même interface que la physique du port (boîtes AABB),
// mais avec le vrai relief (LiDAR), les murs des bâtiments (emprises IGN), les arbres et les routes.
(() => {
  const V = '?v=22', D = '../data/';
  const CELL = 16, key = (i, j) => i * 100000 + j;
  const STEP = 0.42;
  window.__LIMOGES_PHYS = function (G) {
    const K = G.THREE.Vector3;
    const boxes = [];
    let relief = [], H0 = 0;
    const segGrid = new Map(), treeGrid = new Map(), ringGrid = new Map(), roadGrid = new Map();
    let segs = new Float32Array(0), segRing = new Int32Array(0), rings = [], ringTop = [], roads = [];
    const add = (g, x, z, v) => { const k = key(Math.floor(x / CELL), Math.floor(z / CELL)); let a = g.get(k); if (!a) g.set(k, a = []); a.push(v); };
    const get = async u => { const r = await fetch(D + u + V); if (!r.ok) throw new Error(u); return r.arrayBuffer(); };
    const ready = (async () => {
      const [rel, bat, arb, ax] = await Promise.all([get('relief.wasm'), get('batiments_collision.wasm'), get('arbres.wasm').catch(() => null), get('routes_axes.wasm')]);
      { const dv = new DataView(rel); H0 = dv.getFloat32(0, true); const n = dv.getUint32(4, true); let o = 8;
        for (let i = 0; i < n; i++) { const x0 = dv.getFloat32(o, true), y0 = dv.getFloat32(o + 4, true), s = dv.getFloat32(o + 8, true), mn = dv.getFloat32(o + 12, true), N = dv.getUint32(o + 16, true); o += 20; const h = new Uint16Array(rel.slice(o, o + N * N * 2)); o += N * N * 2; relief.push({ x0, y0, s, mn, N, h }); } }
      { const dv = new DataView(bat); const n = dv.getUint32(0, true); let o = 4; const arr = [], sr = [];
        for (let i = 0; i < n; i++) {
          const m = dv.getUint32(o, true), top = dv.getFloat32(o + 4, true); o += 8; const r = new Float32Array(bat.slice(o, o + m * 8)); o += m * 8; rings.push(r); ringTop.push(top);
          let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let k = 0; k < m; k++) { x0 = Math.min(x0, r[2 * k]); x1 = Math.max(x1, r[2 * k]); z0 = Math.min(z0, r[2 * k + 1]); z1 = Math.max(z1, r[2 * k + 1]); }
          for (let a = Math.floor(x0 / CELL); a <= Math.floor(x1 / CELL); a++) for (let b = Math.floor(z0 / CELL); b <= Math.floor(z1 / CELL); b++) { const kk = key(a, b); let l = ringGrid.get(kk); if (!l) ringGrid.set(kk, l = []); l.push(i); }
          for (let k = 0; k < m - 1; k++) { arr.push(r[2 * k], r[2 * k + 1], r[2 * k + 2], r[2 * k + 3]); sr.push(i); }
        }
        segs = new Float32Array(arr); segRing = new Int32Array(sr);
        for (let s = 0; s < segs.length / 4; s++) {
          const xa = segs[4 * s], za = segs[4 * s + 1], xb = segs[4 * s + 2], zb = segs[4 * s + 3];
          for (let i = Math.floor(Math.min(xa, xb) / CELL); i <= Math.floor(Math.max(xa, xb) / CELL); i++) for (let j = Math.floor(Math.min(za, zb) / CELL); j <= Math.floor(Math.max(za, zb) / CELL); j++) { const k = key(i, j); let a = segGrid.get(k); if (!a) segGrid.set(k, a = []); a.push(s); }
        }
      }
      if (arb) { const dv = new DataView(arb), n = dv.getUint32(0, true), f = new Float32Array(arb.slice(4, 4 + n * 24)); for (let i = 0; i < n; i++) add(treeGrid, f[6 * i], f[6 * i + 2], [f[6 * i], f[6 * i + 2]]); }
      { const dv = new DataView(ax); const n = dv.getUint32(4, true); let o = 8;
        for (let i = 0; i < n; i++) { const w = dv.getFloat32(o + 4, true), m = dv.getUint32(o + 8, true); o += 12; const a = new Float32Array(ax.slice(o, o + m * 20)); o += m * 20;
          const p = new Float32Array(m * 2), h = new Float32Array(m); for (let k = 0; k < m; k++) { p[2 * k] = a[5 * k]; p[2 * k + 1] = a[5 * k + 1]; h[k] = a[5 * k + 2]; }
          const ri = roads.length; roads.push({ w, p, h }); for (let k = 0; k < m - 1; k++) add(roadGrid, (p[2 * k] + p[2 * k + 2]) / 2, (p[2 * k + 1] + p[2 * k + 3]) / 2, ri * 4096 + k); }
      }
    })();
    function terrain(x, z) {
      const Nn = -z;
      for (const t of relief) {
        if (x < t.x0 || x > t.x0 + 2000 || Nn < t.y0 || Nn > t.y0 + 2000) continue;
        const n = t.N - 1; let a = (x - t.x0) / t.s, b = (Nn - t.y0) / t.s; a = Math.min(Math.max(a, 0), n - 1e-6); b = Math.min(Math.max(b, 0), n - 1e-6);
        const a0 = a | 0, b0 = b | 0, fx = a - a0, fy = b - b0, N = t.N, H = t.h, h00 = H[b0 * N + a0], h10 = H[b0 * N + a0 + 1], h01 = H[(b0 + 1) * N + a0], h11 = H[(b0 + 1) * N + a0 + 1];
        const v = fx >= fy ? h00 + fx * (h10 - h00) + fy * (h11 - h10) : h00 + fy * (h01 - h00) + fx * (h11 - h01);
        return v * 0.01 + t.mn - H0;
      }
      return 0;
    }
    // sol praticable : chaussée lissée (et trottoirs à son niveau) sinon terrain
    function surface(x, z) {
      let best = -1e9; const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const v of roadGrid.get(key(i, j)) || []) {
        const r = roads[(v / 4096) | 0], k = v % 4096, p = r.p, ax = p[2 * k], az = p[2 * k + 1], dx = p[2 * k + 2] - ax, dz = p[2 * k + 3] - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(x - ax - t * dx, z - az - t * dz);
        if (d <= r.w / 2 + 3.5) { const hh = r.h[k] + (r.h[k + 1] - r.h[k]) * t; if (hh > best) best = hh; }
      }
      return best > -1e8 ? best : terrain(x, z);
    }
    function roofAt(x, z, below) { // toit d'un bâtiment sous le point (sinon -inf)
      let g = -1e9; for (const i of ringGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || []) {
        if (ringTop[i] > below + 0.05) continue; const r = rings[i]; let inside = false;
        for (let k = 0, j = r.length / 2 - 1; k < r.length / 2; j = k++) { const xi = r[2 * k], zi = r[2 * k + 1], xj = r[2 * j], zj = r[2 * j + 1]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside; }
        if (inside) g = Math.max(g, ringTop[i]);
      }
      return g;
    }
    function inBuilding(x, z, y) { for (const i of ringGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || []) { if (ringTop[i] < y) continue; const r = rings[i]; let inside = false; for (let k = 0, j = r.length / 2 - 1; k < r.length / 2; j = k++) { const xi = r[2 * k], zi = r[2 * k + 1], xj = r[2 * j], zj = r[2 * j + 1]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside; } if (inside) return i; } return -1; }
    function boxGround(x, z, below, A) { let F = -1e9, S = null; for (const W of boxes) { if (W.bulletOnly || x + A < W.min.x || x - A > W.max.x || z + A < W.min.z || z - A > W.max.z) continue; if (W.max.y <= below && W.max.y > F) { F = W.max.y; S = W.surface; } } return [F, S]; }
    const o = {
      boxes, ready, terrain, surface, H0: () => H0,
      bounds: { min: new K(-4000, -400, -4000), max: new K(4000, 600, 4000) },
      addBox(a, b, T = {}) { const w = a.isVector3 ? a.clone() : new K(...a), S = b.isVector3 ? b.clone() : new K(...b); const R = { min: new K(Math.min(w.x, S.x), Math.min(w.y, S.y), Math.min(w.z, S.z)), max: new K(Math.max(w.x, S.x), Math.max(w.y, S.y), Math.max(w.z, S.z)), surface: T.surface || 'concrete', tag: T.tag || '', noNav: !!T.noNav, bulletOnly: !!T.bulletOnly, playerOnly: !!T.playerOnly }; boxes.push(R); return R; },
      removeBox(b) { const i = boxes.indexOf(b); if (i >= 0) boxes.splice(i, 1); },
      build() {},
      groundHeight(x, z, maxY = 50) { let g = surface(x, z); g = Math.max(g, roofAt(x, z, maxY)); for (const R of boxes) if (!R.bulletOnly && x >= R.min.x && x <= R.max.x && z >= R.min.z && z <= R.max.z && R.max.y <= maxY && R.max.y > g) g = R.max.y; return g; },
      // rayon : boîtes (exact), sol et bâtiments (marche de 0,2 m puis affinage)
      raycast(M, d, T = 500) {
        let best = T, hit = null;
        for (const G2 of boxes) {
          if (G2.playerOnly) continue; let t0 = 0, t1 = best, ax = -1, sg = 0; let ok = true;
          for (let c = 0; c < 3; c++) { const oc = c === 0 ? M.x : c === 1 ? M.y : M.z, dc = c === 0 ? d.x : c === 1 ? d.y : d.z, mn = c === 0 ? G2.min.x : c === 1 ? G2.min.y : G2.min.z, mx = c === 0 ? G2.max.x : c === 1 ? G2.max.y : G2.max.z;
            if (Math.abs(dc) < 1e-9) { if (oc < mn || oc > mx) { ok = false; break; } continue; }
            let a = (mn - oc) / dc, b = (mx - oc) / dc, s = -1; if (a > b) { const q = a; a = b; b = q; s = 1; } if (a > t0) { t0 = a; ax = c; sg = s; } if (b < t1) t1 = b; if (t0 > t1) { ok = false; break; } }
          if (ok && ax >= 0 && t0 < best) { best = t0; const n = new K(); n.setComponent(ax, sg); hit = { dist: t0, normal: n, surface: G2.surface, box: G2 }; }
        }
        const step = 0.25; let prevT = 0, prevIn = false;
        const solid = (x, y, z) => { if (y <= surface(x, z)) return 'g'; const b = inBuilding(x, z, y); return b >= 0 ? b : null; };
        for (let t = step; t < best; t += t < 40 ? step : step * 3) {
          const x = M.x + d.x * t, y = M.y + d.y * t, z = M.z + d.z * t, s = solid(x, y, z);
          if (s !== null) {
            let lo = prevT, hi = t; for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2; if (solid(M.x + d.x * mid, M.y + d.y * mid, M.z + d.z * mid) !== null) hi = mid; else lo = mid; }
            const px = M.x + d.x * hi, py = M.y + d.y * hi, pz = M.z + d.z * hi; let n = new K(0, 1, 0), surf = 'concrete';
            if (s !== 'g') { // mur ou toit
              if (py > ringTop[s] - 0.15) n.set(0, 1, 0); else { let bd = 1e9; for (const si of segGrid.get(key(Math.floor(px / CELL), Math.floor(pz / CELL))) || []) { if (segRing[si] !== s) continue; const ax2 = segs[4 * si], az2 = segs[4 * si + 1], dx2 = segs[4 * si + 2] - ax2, dz2 = segs[4 * si + 3] - az2, L2 = dx2 * dx2 + dz2 * dz2 || 1, tt = Math.max(0, Math.min(1, ((px - ax2) * dx2 + (pz - az2) * dz2) / L2)), dd = Math.hypot(px - ax2 - tt * dx2, pz - az2 - tt * dz2); if (dd < bd) { bd = dd; const L = Math.sqrt(L2); n.set(-dz2 / L, 0, dx2 / L); if (n.x * d.x + n.z * d.z > 0) n.multiplyScalar(-1); } } }
            }
            best = hi; hit = { dist: hi, normal: n, surface: surf, box: null }; break;
          }
          prevT = t; prevIn = false;
        }
        void prevIn;
        if (!hit) return null;
        hit.point = new K(M.x + d.x * hit.dist, M.y + d.y * hit.dist, M.z + d.z * hit.dist); return hit;
      },
      lineOfSight(a, b) { const v = new K().subVectors(b, a), L = v.length(); if (L < 1e-4) return true; v.multiplyScalar(1 / L); return !o.raycast(a, v, L - 0.05); },
      moveCapsule(M, vel, dt, r = 0.32, h = 1.8, snap = true) {
        const z = { onGround: false, hitWall: false, hitCeil: false, surface: 'concrete' };
        const I = vel.x * dt, L = vel.z * dt, U = Math.max(1, Math.ceil(Math.hypot(I, L) / (r * 0.6))), y0 = M.y;
        const push = (nx, nz, pen) => { M.x += nx * pen; M.z += nz * pen; const vn = vel.x * nx + vel.z * nz; if (vn < 0) { vel.x -= nx * vn; vel.z -= nz * vn; } z.hitWall = true; };
        for (let q = 0; q < U; q++) {
          M.x += I / U; M.z += L / U;
          for (let it = 0; it < 3; it++) {
            const ci = Math.floor(M.x / CELL), cj = Math.floor(M.z / CELL);
            for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
              for (const s of segGrid.get(key(i, j)) || []) {
                if (ringTop[segRing[s]] <= M.y + STEP) continue;
                const ax = segs[4 * s], az = segs[4 * s + 1], dx = segs[4 * s + 2] - ax, dz = segs[4 * s + 3] - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((M.x - ax) * dx + (M.z - az) * dz) / L2));
                const px = ax + t * dx - M.x, pz = az + t * dz - M.z, dd = Math.hypot(px, pz); if (dd < r && dd > 1e-5) push(-px / dd, -pz / dd, r - dd);
              }
              for (const [tx, tz] of treeGrid.get(key(i, j)) || []) { const px = tx - M.x, pz = tz - M.z, dd = Math.hypot(px, pz), rr = r + 0.28; if (dd < rr && dd > 1e-5) push(-px / dd, -pz / dd, rr - dd); }
            }
            for (const te of boxes) {
              if (te.bulletOnly || te.max.y <= M.y + (snap ? STEP : 0.08) || te.min.y >= M.y + h) continue;
              const ox = Math.max(te.min.x, Math.min(te.max.x, M.x)), oz = Math.max(te.min.z, Math.min(te.max.z, M.z)); let le = M.x - ox, xe = M.z - oz; const j2 = le * le + xe * xe;
              if (j2 < r * r) { if (j2 > 1e-10) { const O = Math.sqrt(j2); push(le / O, xe / O, r - O); } else { M.x = te.max.x + r; } }
            }
          }
        }
        const C = M.y + vel.y * dt, A = r * 0.7;
        let F = surface(M.x, M.z), S = null; F = Math.max(F, roofAt(M.x, M.z, y0 + (snap ? STEP : 0.08)));
        const [bF, bS] = boxGround(M.x, M.z, y0 + (snap ? STEP : 0.08) + 1e-4, A); if (bF > F) { F = bF; S = bS; }
        if (C <= F) { M.y = F; if (vel.y < 0) vel.y = 0; z.onGround = true; }
        else if (snap && vel.y <= 0 && C - F < STEP) { M.y = F; vel.y = 0; z.onGround = true; }
        else M.y = C;
        if (z.onGround) z.surface = S || 'concrete';
        return z;
      },
      nav: { cell: 0.5, isWalkable: () => true, findPath: (a, b) => [new K(b.x, 0, b.z)], randomPoint: (p) => new K(p.x, 0, p.z), clearLine: () => true, _grid: () => ({ blocked: new Uint8Array(1), w: 1, h: 1, minX: 0, minZ: 0, cell: 0.5 }) },
    };
    return o;
  };
})();
