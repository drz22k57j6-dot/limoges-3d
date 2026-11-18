// Appart Studio — vue d'arrivée : caméra posée dans la rue, face à l'immeuble, étage surligné.
// La caméra est imposée via window.__camOverride (hook de la boucle de rendu d'index.html).

export function createFacadeView({ THREE, scene, camera, drone, ground }) {
  const st = { group: null, cam: null, t: 0, res: null };

  function clear() {
    if (st.group) { scene.remove(st.group); st.group.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
    st.group = null;
  }

  // distance libre devant la façade (largeur de rue) : on avance jusqu'à toucher l'immeuble d'en face
  function freeDistance(F, n, y) {
    const inside = window.__TEST?.inside;
    if (!inside) return 18;
    for (let d = 2; d <= 60; d += 0.5) if (inside(F[0] + n[0] * d, y, F[1] + n[1] * d)) return d - 0.5;
    return 60;
  }

  // aimantage : si le moteur de façades a construit cet immeuble, on prend ses vraies hauteurs de niveaux
  function snapFromFacades(res) {
    const L = window.__facadeEtages?.get(res.feature.properties?.cleabs); if (!L?.length) return null;
    const F = res.local.F; let best = null, bd = Infinity;
    for (const e of L) {
      const ax = e.a[0], az = e.a[1], dx = e.b[0] - ax, dz = e.b[1] - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((F[0] - ax) * dx + (F[1] - az) * dz) / l2)), d = Math.hypot(F[0] - ax - dx * t, F[1] - az - dz * t);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best || bd > 6) return null;
    const f = res.floorData.floor, idx = best.ent && f >= 1 ? f + 1 : f;
    if (idx >= best.F.length) return null;
    const hh = best.ent && f === 0 ? best.F[0] + best.F[1] : best.F[idx];
    return { y: best.y0 + best.yF[idx], h: hh };
  }
  function floorY(res) {
    if (res.snap) return res.snap.y + res.adjust;
    const F = res.local.F;
    return ground(F[0], F[1]) + res.floorData.offset + res.adjust;
  }
  function floorH(res) { return res.snap ? res.snap.h : (res.floorData.floor === 0 ? res.floorData.hRDC : res.floorData.hEtage); }

  function build(res) {
    clear();
    const { F, A, B, n } = res.local, fd = res.floorData;
    const y0 = floorY(res), h = floorH(res);
    // bande sur toute la largeur de façade (limitée à ±18 m du point d'adresse)
    const ex = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(...ex) || 1, u = [ex[0] / L, ex[1] / L];
    const tF = (F[0] - A[0]) * u[0] + (F[1] - A[1]) * u[1];
    const t0 = Math.max(0, tF - 18), t1 = Math.min(L, tF + 18), w = Math.max(3, t1 - t0), tm = (t0 + t1) / 2;
    const cx = A[0] + u[0] * tm + n[0] * 0.18, cz = A[1] + u[1] * tm + n[1] * 0.18;
    const g = new THREE.Group(); g.name = 'appart-studio-etage';
    const band = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: 0xff2e4d, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
    for (const m of [band, edge]) { m.renderOrder = 10; g.add(m); }
    g.position.set(cx, y0 + h / 2, cz);
    g.rotation.y = Math.atan2(n[0], n[1]);           // le plan regarde la rue
    scene.add(g); st.group = g; st.band = band;

    // caméra : dans la rue, à hauteur de l'étage, légèrement de biais
    const gap = freeDistance(F, n, y0 + 1.5);
    const d = Math.max(5, Math.min(30, gap * 0.82));
    const side = Math.min(8, d * 0.45);
    const camY = Math.max(ground(F[0] + n[0] * d, F[1] + n[1] * d) + 1.7, y0 + h * 0.4);
    const pos = new THREE.Vector3(F[0] + n[0] * d + u[0] * side, camY, F[1] + n[1] * d + u[1] * side);
    const fovR = (gap < 14 ? 78 : 64) * Math.PI / 360;
    const look = new THREE.Vector3(F[0], y0 + h * 0.5 - Math.tan(fovR) * d * 0.42, F[1]);
    const from = new THREE.Vector3(F[0] + n[0] * (d + 70), y0 + 90, F[1] + n[1] * (d + 70));
    const fov = gap < 14 ? 78 : 64;
    st.cam = { pos, look, from, fov, gap, d, cur: from.clone(), lk: look.clone() };
    st.t0 = performance.now() / 1000; st.t = 0;
  }

  function hook(dt) {
    if (!st.cam) return false;
    const now = performance.now() / 1000; st.t = now - st.t0;
    const c = st.cam, k = Math.min(1, st.t / 2.6), e = 1 - Math.pow(1 - k, 3);
    c.cur.lerpVectors(c.from, c.pos, e);
    // très léger mouvement de respiration une fois arrivé
    const br = k >= 1 ? Math.sin(st.t * 0.5) * 0.25 : 0;
    camera.position.set(c.cur.x, c.cur.y + br * 0.3, c.cur.z);
    camera.lookAt(c.look);
    camera.fov += (c.fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
    if (!st.res.snap && (st.chk = (st.chk || 0) + dt) > 0.5) { st.chk = 0; const sn = snapFromFacades(st.res); if (sn) { st.res.snap = sn; const t0 = st.t0; build(st.res); st.t0 = t0; st.onSnap?.(sn); } }
    if (st.band) st.band.material.opacity = 0.24 + 0.14 * (0.5 + 0.5 * Math.sin(st.t * 3));
    const PL = drone.PL; if (PL) { PL.x = c.cur.x; PL.z = c.cur.z; PL.y = c.cur.y; }   // le streaming suit la caméra
    return true;
  }

  return {
    async show(res) {
      st.res = res;
      build(res);
      window.__camOverride = hook;
      drone.facades?.(res.local.F[0], res.local.F[1], true);
      return { gap: st.cam.gap };
    },
    refresh() { if (st.res) { build(st.res); st.t0 -= 3; } },
    setFloor(floorData) {
      if (!st.res || !st.group) return;
      st.res.floorData = floorData;
      st.res.snap = snapFromFacades(st.res);
      const y = floorY(st.res), h = floorH(st.res);
      st.group.scale.y = h / Math.max(0.1, st.baseBandHeight || h);
      st.group.position.y = y + h / 2;
    },
    onSnap(f) { st.onSnap = f; },
    suspend() { if (st.group) st.group.visible = false; if (window.__camOverride === hook) window.__camOverride = null; },
    resume() { if (st.group) st.group.visible = true; if (st.cam) { window.__camOverride = hook; st.t0 = performance.now() / 1000 - 3; } },
    debugSnap() { try { return { r: snapFromFacades(st.res), chk: st.chk, has: !!st.res?.snap }; } catch (e) { return { err: String(e) }; } },
    hide() { clear(); st.cam = null; if (window.__camOverride === hook) window.__camOverride = null; },
    floorY, floorH,
  };
}
