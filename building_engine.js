// Building Appearance Engine (runtime) — turns a building appearance profile (JSON, see outils/bae/) into detailed geometry.
// Generic: footprint + levels + facade grammar (modules of bays) + colours + roof equipment. Nothing here is specific to one address.
// LOD0: real recesses (window reveals, frames, glass, roller shutters, enclosed loggias, porches, parapet, roof equipment).
// LOD1: same envelope with a painted facade texture generated from the same grammar (far views, aerial).
export function createBuildingEngine(T, opts = {}) {
  const loader = new T.TextureLoader();
  const tex = (u, srgb) => { const t = loader.load(u); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = T.SRGBColorSpace; return t; };
  const base = opts.texBase || 'data/tex/';
  const V = opts.V || '';
  const nWall = tex(base + 'facade_n.jpg' + V), rWall = tex(base + 'facade_r.jpg' + V);
  const M = {
    wall: new T.MeshStandardMaterial({ vertexColors: true, normalMap: nWall, normalScale: new T.Vector2(0.6, 0.6), roughnessMap: rWall, roughness: 0.92, metalness: 0 }),
    trim: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }),
    metal: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.6 }),
    glass: new T.MeshStandardMaterial({ color: 0x5f6f7c, roughness: 0.07, metalness: 0.35, envMapIntensity: 3.0 }),
    dark: new T.MeshStandardMaterial({ color: 0x15171a, roughness: 0.95 }),
    roof: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, normalMap: nWall, normalScale: new T.Vector2(0.4, 0.4) })
  };
  // deterministic noise so the same building always looks the same
  const hash = (a, b, c) => { let h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return h - Math.floor(h); };

  function Builder() {
    const B = { wall: [], trim: [], metal: [], glass: [], dark: [], roof: [], path: [], hedge: [] };
    // quad p0..p3 (counter-clockwise seen from the front), colour, uv scale (world metres)
    function quad(k, p0, p1, p2, p3, col, uv) {
      const a = B[k]; const c = col || [1, 1, 1];
      const u = uv || [0, 0, 1, 0, 1, 1, 0, 1];
      a.push([p0, p1, p2, c, [u[0], u[1]], [u[2], u[3]], [u[4], u[5]]], [p0, p2, p3, c, [u[0], u[1]], [u[4], u[5]], [u[6], u[7]]]);
    }
    function tri(k, p0, p1, p2, col) { B[k].push([p0, p1, p2, col || [1, 1, 1], [p0[0] * 0.5, p0[2] * 0.5], [p1[0] * 0.5, p1[2] * 0.5], [p2[0] * 0.5, p2[2] * 0.5]]); }
    function mesh(k, mat) {
      const L = B[k]; if (!L.length) return null;
      const pos = new Float32Array(L.length * 9), col = new Float32Array(L.length * 9), uv = new Float32Array(L.length * 6);
      L.forEach((t, i) => {
        for (let v = 0; v < 3; v++) { pos.set(t[v], i * 9 + v * 3); col.set(t[3], i * 9 + v * 3); uv.set(t[4 + v], i * 6 + v * 2); }
      });
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2));
      g.computeVertexNormals(); g.computeBoundingSphere();
      const m = new T.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
    }
    return { quad, tri, mesh, B };
  }
  for (const m of Object.values(M)) m.side = T.DoubleSide;
  const lin = c => c.map(v => Math.pow(v / 255, 2.2));

  // frame of a facade bay: a (start) and b (end) on the outline, outward normal n, wall from y0 to y1
  // local point: along u (0..w), height y, depth d (positive = into the building)
  function frame(a, b, n) {
    if ((-(b[1] - a[1])) * n[0] + (b[0] - a[0]) * n[1] < 0) { const t = a; a = b; b = t; }
    const dx = b[0] - a[0], dz = b[1] - a[1], w = Math.hypot(dx, dz) || 1, tx = dx / w, tz = dz / w;
    return { w, P: (u, y, d) => [a[0] + tx * u - n[0] * d, y, a[1] + tz * u - n[1] * d] };
  }
  // flat wall piece facing out
  function wallRect(G, k, F, u0, u1, y0, y1, d, col, uvBase) {
    if (u1 - u0 < 1e-3 || y1 - y0 < 1e-3) return;
    const s0 = (uvBase || 0) + u0, s1 = (uvBase || 0) + u1;
    G.quad(k, F.P(u0, y0, d), F.P(u1, y0, d), F.P(u1, y1, d), F.P(u0, y1, d), col, [s0 / 2.5, y0 / 2.5, s1 / 2.5, y0 / 2.5, s1 / 2.5, y1 / 2.5, s0 / 2.5, y1 / 2.5]);
  }
  // reveal: 4 faces of a rectangular hole from depth d0 to d1
  function reveal(G, k, F, u0, u1, y0, y1, d0, d1, col) {
    G.quad(k, F.P(u0, y0, d0), F.P(u0, y0, d1), F.P(u0, y1, d1), F.P(u0, y1, d0), col);      // left
    G.quad(k, F.P(u1, y0, d1), F.P(u1, y0, d0), F.P(u1, y1, d0), F.P(u1, y1, d1), col);      // right
    G.quad(k, F.P(u0, y1, d0), F.P(u0, y1, d1), F.P(u1, y1, d1), F.P(u1, y1, d0), col);      // top (soffit)
    G.quad(k, F.P(u0, y0, d1), F.P(u0, y0, d0), F.P(u1, y0, d0), F.P(u1, y0, d1), col);      // sill
  }
  function box(G, k, F, u0, u1, y0, y1, d0, d1, col) {
    wallRect(G, k, F, u0, u1, y0, y1, d0, col); reveal(G, k, F, u0, u1, y0, y1, d1, d0, col);
  }

  function window_(G, F, u0, u1, y0, y1, gr, wallCol, seed) {
    const fw = gr.fenetre, ww = Math.min(fw.largeur_m, (u1 - u0) - 0.4), cu = (u0 + u1) / 2;
    const wu0 = cu - ww / 2, wu1 = cu + ww / 2, wy0 = y0 + fw.allege_m, wy1 = Math.min(y1 - 0.25, wy0 + fw.hauteur_m), dp = fw.profondeur_tableau_m;
    wallRect(G, 'wall', F, u0, wu0, y0, y1, 0, wallCol, 0); wallRect(G, 'wall', F, wu1, u1, y0, y1, 0, wallCol, 0);
    wallRect(G, 'wall', F, wu0, wu1, y0, wy0, 0, wallCol, 0); wallRect(G, 'wall', F, wu0, wu1, wy1, y1, 0, wallCol, 0);
    reveal(G, 'trim', F, wu0, wu1, wy0, wy1, 0, dp, wallCol.map(v => v * 0.92));
    const white = lin([236, 236, 234]);
    // sill (appui) slightly proud
    box(G, 'metal', F, wu0 - 0.04, wu1 + 0.04, wy0 - 0.04, wy0, -0.05, 0.02, lin([200, 200, 198]));
    // frame + glass (2 casements), roller shutter partly down
    const f = 0.06;
    wallRect(G, 'trim', F, wu0, wu1, wy0, wy0 + f, dp, white); wallRect(G, 'trim', F, wu0, wu1, wy1 - f, wy1, dp, white);
    wallRect(G, 'trim', F, wu0, wu0 + f, wy0, wy1, dp, white); wallRect(G, 'trim', F, wu1 - f, wu1, wy0, wy1, dp, white);
    wallRect(G, 'trim', F, cu - f / 2, cu + f / 2, wy0, wy1, dp, white);
    const shut = fw.volet_roulant ? [0, 0, 0.15, 0.3, 0.5, 0.95, 0.2, 0][Math.floor(hash(seed, 3, 7) * 8)] : 0;
    const sy = wy1 - f - (wy1 - wy0 - 2 * f) * shut;
    wallRect(G, 'glass', F, wu0 + f, wu1 - f, wy0 + f, sy, dp + 0.02);
    if (shut > 0) {
      wallRect(G, 'trim', F, wu0 + f, wu1 - f, sy, wy1 - f, dp - 0.04, lin([214, 213, 210]));
      wallRect(G, 'trim', F, wu0 + f, wu1 - f, sy - 0.04, sy, dp - 0.06, lin([190, 190, 188]));   // shutter bottom bar
    }
  }

  function loggia(G, F, u0, u1, y0, y1, gr, cc, seed, slabCol) {
    const lg = gr.loggia, d = lg.retrait_m, fr = lin(cc.loggia_menuiserie), al = lin(cc.loggia_allege);
    // slab edges and side returns flush with the facade
    wallRect(G, 'wall', F, u0, u1, y0, y0 + 0.22, 0, slabCol); reveal(G, 'trim', F, u0 + 0.12, u1 - 0.12, y0 + 0.22, y1, 0, d, slabCol.map(v => v * 0.9));
    wallRect(G, 'wall', F, u0, u0 + 0.12, y0 + 0.22, y1, 0, slabCol); wallRect(G, 'wall', F, u1 - 0.12, u1, y0 + 0.22, y1, 0, slabCol);
    const a = u0 + 0.12, b = u1 - 0.12, ya = y0 + 0.22, yb = y1, yAl = ya + lg.allege_opaque_m;
    const opaque = hash(seed, 1, 9) < 0.35;   // some loggias show opaque grey panels higher up (observed)
    wallRect(G, 'metal', F, a, b, ya, yAl, d, al);
    wallRect(G, opaque ? 'metal' : 'glass', F, a, b, yAl, yb, d + 0.02, al);
    // aluminium grid
    const nM = Math.max(1, Math.round((b - a) / lg.meneaux_m));
    for (let i = 0; i <= nM; i++) { const u = a + (b - a) * i / nM; wallRect(G, 'metal', F, u - 0.025, u + 0.025, ya, yb, d - 0.03, fr); }
    for (const y of [yAl, (yAl + yb) / 2 + 0.25, yb - 0.05]) wallRect(G, 'metal', F, a, b, y - 0.025, y + 0.025, d - 0.03, fr);
    if (!opaque) wallRect(G, 'dark', F, a, b, yAl, yb, d + 1.4, null);   // depth behind the glass (neutral dark interior)
  }

  // recessed balcony: coloured back wall + door/window, slab edge, metal railing
  function balcon(G, F, u0, u1, y0, y1, gr, seed) {
    const bc = gr.balcon, d = bc.retrait_m, acc = lin(bc.rgb), slab = lin(bc.dalle_rgb || [236, 236, 234]), rail = lin(bc.garde_corps_rgb || [70, 74, 78]);
    wallRect(G, 'wall', F, u0, u1, y0, y0 + 0.2, 0, acc); wallRect(G, 'wall', F, u0, u0 + 0.15, y0 + 0.2, y1, 0, acc); wallRect(G, 'wall', F, u1 - 0.15, u1, y0 + 0.2, y1, 0, acc);
    reveal(G, 'wall', F, u0 + 0.15, u1 - 0.15, y0 + 0.2, y1, 0, d, acc.map(v => v * 0.9));
    const a = u0 + 0.15, b = u1 - 0.15, m = (a + b) / 2;
    wallRect(G, 'wall', F, a, b, y0 + 0.2, y1, d, acc.map(v => v * 0.95));
    wallRect(G, 'glass', F, m - 0.45, m + 0.45, y0 + 0.2, y0 + 2.25, d - 0.01);           // French window
    wallRect(G, 'trim', F, m - 0.5, m + 0.5, y0 + 2.25, y0 + 2.3, d - 0.02, lin([236, 236, 234]));
    // railing at the facade line
    wallRect(G, 'metal', F, a, b, y0 + 1.0, y0 + 1.05, 0.02, rail);
    for (let u = a + 0.06; u < b; u += 0.12) wallRect(G, 'metal', F, u, u + 0.018, y0 + 0.2, y0 + 1.0, 0.02, rail);
  }
  function porch(G, F, u0, u1, y0, y1, gr, slabCol) {
    const d = gr.rdc.profondeur_m, white = lin([238, 238, 236]);
    wallRect(G, 'trim', F, u0 - 0.25, u0, y0, y1, 0, white); wallRect(G, 'trim', F, u1, u1 + 0.25, y0, y1, 0, white);
    reveal(G, 'trim', F, u0, u1, y0, y1, 0, d, white);
    wallRect(G, 'glass', F, u0 + 0.3, u1 - 0.3, y0, y1 - 0.4, d);
    wallRect(G, 'metal', F, u0 + 0.3, u1 - 0.3, y1 - 0.4, y1, d, lin([90, 94, 98]));
    const c = (u0 + u1) / 2; wallRect(G, 'metal', F, c - 0.03, c + 0.03, y0, y1 - 0.4, d - 0.02, lin([70, 72, 76]));
  }

  const NOOP = { quad() {}, tri() {}, mesh() { return null; }, B: {} };
  // level: 'near' (detailed geometry), 'far' (envelope + painted facades) or undefined (THREE.LOD with both)
  function build(P, H0, level) {
    const G = level === 'far' ? NOOP : Builder(), Gf = level === 'near' ? NOOP : Builder();
    const E = P.empreinte, n = E.length, gr = P.grammaire, cc = P.couleurs_modules;
    const ground = P.sol_par_sommet.map(v => v - H0);
    const base = P.base_alt - H0, h = P.hauteur_niveau, top = base + P.niveaux * h, roofY = P.toit_alt - H0, parY = top + 0.7;
    // orientation of the outline in (x,z)
    let A2 = 0; for (let i = 0; i < n; i++) { const a = E[i], b = E[(i + 1) % n]; A2 += a[0] * b[1] - b[0] * a[1]; }
    const sgn = A2 > 0 ? -1 : 1;
    const outN = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; return [sgn * -dz / L, sgn * dx / L]; };
    const gAt = (i, j, t) => ground[i] + (ground[j] - ground[i]) * t;
    const band = lin(gr.bandeau_haut.rgb);
    // facade chain → list of points with arc length
    function chain(ids) { const pts = ids.map(i => E[i]); const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])); return { ids, pts, cum, L: cum[cum.length - 1] }; }
    function at(C, s) {
      let k = 1; while (k < C.cum.length - 1 && C.cum[k] < s) k++;
      const t = (s - C.cum[k - 1]) / ((C.cum[k] - C.cum[k - 1]) || 1), a = C.pts[k - 1], b = C.pts[k];
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], g: gAt(C.ids[k - 1], C.ids[k], t) };
    }
    const modW = gr.module.reduce((a, m) => a + m.baies * m.largeur_baie_m, 0);
    for (const fac of P.facades) {
      if (fac.role === 'pignon') continue;
      const C = chain(fac.sommets), nMod = Math.max(1, Math.round(C.L / modW)), k = C.L / (nMod * modW);
      // module colours are listed from the observed end
      const rev = P.couleurs_depuis_fin && fac.role === 'entrees', colOf = m => { const i = rev ? nMod - 1 - m : m; return lin((cc.repeter ? cc.observes[i % cc.observes.length] : cc.observes[i]) || cc.defaut); };
      const entS = fac.role === 'entrees' ? P.entrees.map(e => e.s) : [];
      let s = 0;
      for (let m = 0; m < nMod; m++) {
        const wc = colOf(m);
        for (const part of gr.module) for (let bi = 0; bi < part.baies; bi++) {
          const s0 = s, s1 = s + part.largeur_baie_m * k; s = s1;
          const A = at(C, s0), Bp = at(C, s1), F = frame(A.p, Bp.p, outN(A.p, Bp.p)), w = F.w, gmin = Math.min(A.g, Bp.g);
          const isEnt = entS.some(e => e >= s0 - 0.5 && e < s1 + 0.5) && part.type === 'panneau';
          const Ff = F;
          // far LOD: plain wall with the painted texture coordinates (u = s, v = y)
          Gf.quad('wall', Ff.P(0, gmin - 1, 0), Ff.P(w, gmin - 1, 0), Ff.P(w, top, 0), Ff.P(0, top, 0), part.type === 'loggia' ? lin(cc.loggia_allege) : wc,
            [s0, gmin - 1 - base, s1, gmin - 1 - base, s1, top - base, s0, top - base]);
          // foundations down to the ground, under the lowest level
          if (gmin < base) wallRect(G, 'wall', F, 0, w, gmin - 0.5, base, 0, lin([150, 150, 148]));
          for (let L = 0; L < P.niveaux; L++) {
            const y0 = base + L * h, y1 = y0 + h, seed = m * 97 + bi * 13 + L * 7 + s0;
            if (y1 < gmin + 0.3) { continue; }                          // level fully below the terrain
            if (y0 < gmin - 0.05) { wallRect(G, 'wall', F, 0, w, y0, y1, 0, wc.map(v => v * 0.85)); continue; } // half-buried level: blind wall
            if (L === 0 && isEnt) { porch(G, F, 0.15, w - 0.15, y0, y1, gr, wc); continue; }
            if (part.type === 'balcon' && L > 0) balcon(G, F, 0, w, y0, y1, gr, seed);
            else if (L === 0 && gr.rdc && gr.rdc.rgb) { wallRect(G, 'wall', F, 0, w, y0, y1, 0, lin(gr.rdc.rgb)); if (part.type !== 'balcon') window_(G, F, 0, w, y0, y1, gr, lin(gr.rdc.rgb), seed); }
            else if (part.type === 'loggia') loggia(G, F, 0, w, y0, y1, gr, cc, seed, lin([236, 236, 234]));
            else if (part.type === 'balcon') window_(G, F, 0, w, y0, y1, gr, wc, seed);
            else window_(G, F, 0, w, y0, y1, gr, wc, seed);
            if (gr.bandeau_niveau && L > 0) wallRect(G, 'trim', F, 0, w, y0 - gr.bandeau_niveau.hauteur_m / 2, y0 + gr.bandeau_niveau.hauteur_m / 2, -0.01, lin(gr.bandeau_niveau.rgb));
            else if (gr.joints_niveau && part.type === 'panneau') wallRect(G, 'trim', F, 0, w, y0 - 0.008, y0 + 0.008, -0.004, wc.map(v => v * 0.72));
          }
          // white crown band + parapet with metal coping
          wallRect(G, 'trim', F, 0, w, top, parY, 0, band);
          box(G, 'metal', F, -0.02, w + 0.02, parY, parY + 0.06, -0.05, 0.3, lin([170, 172, 174]));
          wallRect(Gf, 'trim', F, 0, w, top, parY, 0, band);
        }
      }
    }
    // gables: white cladding with horizontal joints and a column of vent grilles (observed)
    for (const fac of P.facades) {
      if (fac.role !== 'pignon') continue;
      const i = fac.sommets[0], j = fac.sommets[1], a = E[i], b = E[j], F = frame(a, b, outN(a, b)), g = Math.min(ground[i], ground[j]);
      const col = lin(P.pignon.rgb);
      for (const B of [G, Gf]) { wallRect(B, 'wall', F, 0, F.w, g - 0.5, top, 0, col); wallRect(B, 'trim', F, 0, F.w, top, parY, 0, band); }
      if (P.pignon.joints_m > 0.1) for (let y = base + P.pignon.joints_m; y < top; y += P.pignon.joints_m) wallRect(G, 'trim', F, 0, F.w, y - 0.005, y + 0.005, -0.003, col.map(v => v * 0.75));
      if (gr.bandeau_niveau) for (let L = 1; L < P.niveaux; L++) { const y = base + L * h; if (y > g) wallRect(G, 'trim', F, 0, F.w, y - gr.bandeau_niveau.hauteur_m / 2, y + gr.bandeau_niveau.hauteur_m / 2, -0.01, lin(gr.bandeau_niveau.rgb)); }
      if (P.pignon.grilles) for (let L = 0; L < P.niveaux; L++) { const y = base + L * h + 1.8; if (y > g) box(G, 'metal', F, F.w * 0.2, F.w * 0.2 + 0.3, y, y + 0.2, -0.02, 0.0, lin([180, 180, 178])); }
      box(G, 'metal', F, -0.02, F.w + 0.02, parY, parY + 0.06, -0.05, 0.3, lin([170, 172, 174]));
    }
    // roof: flat, colour from the orthophoto; parapet inner faces; equipment measured by LiDAR
    const shape = new T.Shape(E.map(p => new T.Vector2(p[0], p[1])));
    const tris = T.ShapeUtils.triangulateShape(shape.getPoints().map(p => p), []);
    const rc = lin(P.toit.rgb), ry = top + 0.05;
    for (const t of tris) for (const B of [G, Gf]) {
      const p = t.map(k => [E[k][0], ry, E[k][1]]);
      B.tri('roof', p[0], sgn > 0 ? p[2] : p[1], sgn > 0 ? p[1] : p[2], rc);
    }
    for (let i = 0; i < n; i++) {
      const a = E[i], b = E[(i + 1) % n], F = frame(a, b, outN(a, b));
      G.quad('trim', F.P(F.w, ry, 0.3), F.P(0, ry, 0.3), F.P(0, parY, 0.3), F.P(F.w, parY, 0.3), band.map(v => v * 0.85));
    }
    for (const q of P.equipements) {
      const c = Math.cos(q.angle), s_ = Math.sin(q.angle), hx = q.long_m / 2, hz = q.larg_m / 2, y0 = ry, y1 = ry + q.haut_m;
      // angle was measured in Lambert (x east, y north); local z = -y
      const P4 = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([u, v]) => [q.x + u * c - v * s_, q.z - (u * s_ + v * c)]);
      const col = lin(q.long_m > 3 ? [196, 194, 190] : [170, 168, 165]);
      for (let e = 0; e < 4; e++) {
        const a = P4[e], b = P4[(e + 1) % 4], F = frame(a, b, outN(a, b)); wallRect(G, 'wall', F, 0, F.w, y0, y1, 0, col);
      }
      const t4 = P4.map(p => [p[0], y1, p[1]]); G.tri('roof', t4[0], t4[2], t4[1], col); G.tri('roof', t4[0], t4[3], t4[2], col);
    }
    // assemble LODs
    const lod0 = new T.Group(), lod1 = new T.Group();
    for (const [k, mat] of Object.entries(M)) { const m0 = G.mesh(k, mat); if (m0) lod0.add(m0); }
    const farMat = new T.MeshStandardMaterial({ vertexColors: true, map: paintedFacade(P), roughness: 0.9 });
    for (const k of ['wall', 'trim', 'roof']) { const m1 = Gf.mesh(k, k === 'wall' ? farMat : M[k]); if (m1) { m1.castShadow = true; lod1.add(m1); } }
    // the LOD switch distance is measured from the object position: put it at the building centre
    let cx = 0, cz = 0; for (const p of E) { cx += p[0]; cz += p[1]; } cx /= n; cz /= n;
    const lod = new T.LOD(); lod.position.set(cx, (base + top) / 2, cz);
    for (const g of [lod0, lod1]) g.position.set(-cx, -(base + top) / 2, -cz);
    if (level) { const g = level === 'near' ? lod0 : lod1; g.position.set(0, 0, 0); g.name = 'bae_' + level + '_' + P.id; g.userData.centre = [cx, cz]; return g; }
    lod.addLevel(lod0, 0); lod.addLevel(lod1, opts.lodDistance || 260);
    lod.name = 'bae_' + P.id; lod.userData.profil = P;
    return lod;
  }
  // texture for the far LOD painted from the same grammar: one tile = one module wide (metres → pixels)
  function paintedFacade(P) {
    const gr = P.grammaire, h = P.hauteur_niveau, nv = P.niveaux, modW = gr.module.reduce((a, m) => a + m.baies * m.largeur_baie_m, 0);
    const px = 24, W = Math.ceil(modW * px), H = Math.ceil((nv * h + 1) * px), c = document.createElement('canvas');
    c.width = 256; c.height = 256; const x = c.getContext('2d'); x.scale(256 / W, 256 / H);
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    let u = 0;
    for (const part of gr.module) for (let b = 0; b < part.baies; b++) {
      const w = part.largeur_baie_m * px;
      for (let L = 0; L < nv; L++) {
        const yb = H - (1 + L * h) * px, yt = yb - h * px;
        if (part.type === 'loggia') { x.fillStyle = '#3a4650'; x.fillRect(u + 3, yt + 0.22 * px + (gr.loggia.allege_opaque_m * px * 0) , w - 6, h * px - 0.22 * px - gr.loggia.allege_opaque_m * px); x.fillStyle = '#8d949a'; x.fillRect(u + w / 2 - 1, yt, 2, h * px); }
        else { const fw = gr.fenetre, ww = fw.largeur_m * px; x.fillStyle = '#2a3138'; x.fillRect(u + (w - ww) / 2, yb - (fw.allege_m + fw.hauteur_m) * px, ww, fw.hauteur_m * px); x.fillStyle = '#e4e4e2'; x.fillRect(u + (w - ww) / 2, yb - (fw.allege_m + fw.hauteur_m) * px, ww, fw.hauteur_m * px * 0.3); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(u, yb - 1, w, 2); }
      }
      u += w;
    }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(1 / modW, 1 / (nv * h + 1)); t.offset.set(0, 1 / (nv * h + 1)); t.anisotropy = 4;
    return t;
  }
  // surroundings of a pilot building (hedges + probable lamps from LiDAR, paths and furniture from OSM)
  function buildEnv(env, groundH) {
    const G = Builder(), grp = new T.Group(); grp.name = 'bae_env_' + env.batiment;
    const yAt = (x, z) => groundH(x, z);
    const boxW = (k, x, z, y0, hx, hz, hy, ang, col) => {   // oriented box (ang measured in Lambert, z = -north)
      const c = Math.cos(ang), s_ = Math.sin(ang);
      const P4 = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([u, v]) => [x + u * c - v * s_, z - (u * s_ + v * c)]);
      for (let e = 0; e < 4; e++) { const a = P4[e], b = P4[(e + 1) % 4]; G.quad(k, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y0 + hy, b[1]], [a[0], y0 + hy, a[1]], col, [0, 0, 1, 0, 1, hy, 0, hy]); }
      const t = P4.map(p => [p[0], y0 + hy, p[1]]); G.tri(k, t[0], t[2], t[1], col); G.tri(k, t[0], t[3], t[2], col);
    };
    // paths: ribbons following the terrain
    for (const p of env.cheminements) {
      const w = p.largeur_m / 2, col = lin(p.classe === 'path' ? [168, 156, 136] : [176, 172, 166]);
      for (let i = 0; i + 1 < p.points.length; i++) {
        const a = p.points[i], b = p.points[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.05) continue;
        const nx = -dz / L * w, nz = dx / L * w, st = Math.max(1, Math.ceil(L / 2));
        for (let k = 0; k < st; k++) {
          const t0 = k / st, t1 = (k + 1) / st, x0 = a[0] + dx * t0, z0 = a[1] + dz * t0, x1 = a[0] + dx * t1, z1 = a[1] + dz * t1;
          const y0 = yAt(x0, z0) + 0.05, y1 = yAt(x1, z1) + 0.05;
          G.quad('path', [x0 - nx, y0, z0 - nz], [x1 - nx, y1, z1 - nz], [x1 + nx, y1, z1 + nz], [x0 + nx, y0, z0 + nz], col, [0, t0 * L / 2, 1, t1 * L / 2, 1, t1 * L / 2, 0, t0 * L / 2]);
        }
      }
    }
    for (const h of env.haies) boxW('hedge', h.x, h.z, yAt(h.x, h.z) - 0.1, h.long_m / 2, h.larg_m / 2, h.haut_m + 0.1, h.angle, lin([62, 92, 48]));
    const furn = { recycling: [1.0, 0.8, 1.6, [70, 110, 80]], waste_disposal: [0.7, 0.6, 1.2, [60, 64, 66]], waste_basket: [0.25, 0.25, 0.9, [50, 70, 60]], bench: [0.9, 0.3, 0.45, [120, 90, 60]],
                   bicycle_parking: [1.5, 0.05, 0.8, [150, 152, 155]], bollard: [0.1, 0.1, 0.9, [60, 60, 62]], post_box: [0.25, 0.2, 1.3, [220, 190, 40]] };
    for (const f of env.mobilier) {
      const y = yAt(f.x, f.z);
      if (f.classe === 'bus_stop') { boxW('metal', f.x, f.z, y, 1.6, 0.04, 2.3, 0, lin([120, 125, 130])); boxW('metal', f.x, f.z - 0.6, y + 2.3, 1.7, 0.75, 0.08, 0, lin([90, 95, 100])); continue; }
      const d = furn[f.classe]; if (d) boxW('metal', f.x, f.z, y, d[0], d[1], d[2], 0, lin(d[3]));
    }
    for (const l of env.lampadaires_probables) { const y = yAt(l.x, l.z); boxW('metal', l.x, l.z, y, 0.07, 0.07, l.haut_m, 0, lin([80, 84, 88])); boxW('metal', l.x, l.z, y + l.haut_m - 0.2, 0.3, 0.15, 0.2, 0, lin([200, 200, 196])); }
    const mats = { path: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, normalMap: nWall, normalScale: new T.Vector2(0.3, 0.3) }),
                   hedge: new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, normalMap: nWall, normalScale: new T.Vector2(1.5, 1.5) }), metal: M.metal };
    for (const k of Object.keys(mats)) { G.B[k] = G.B[k] || []; }
    for (const [k, m] of Object.entries(mats)) { const me = G.mesh(k, m); if (me) { if (k === 'path') { me.castShadow = false; me.material.polygonOffset = true; me.material.polygonOffsetFactor = -2; } grp.add(me); } }
    return grp;
  }
  return { build, buildEnv, materials: M };
}
