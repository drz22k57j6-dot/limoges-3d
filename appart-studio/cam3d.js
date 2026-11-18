// Appart Studio — caméras de l'appartement 3D : Maquette (orbite), Visite (1re personne), Fenêtres.
// Pilotage tactile ; la caméra est imposée via window.__camOverride.

export function createCam3d({ THREE, camera, drone }) {
  const st = { mode: 'maquette', info: null, plan: null, yaw: 0, pitch: 0, pos: null, orbit: { az: 0, pol: 0.95, r: 14 },
    cur: new THREE.Vector3(), look: new THREE.Vector3(), tgtPos: new THREE.Vector3(), tgtLook: new THREE.Vector3(), joy: [0, 0], blend: 1, win: 0, fov: 60 };
  let layer = null, joyEl = null, knob = null;

  const fwdOf = (yaw, pitch) => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const yawOf = (dx, dz) => Math.atan2(dx, -dz);

  // collision : cercle de 25 cm contre les segments de murs
  function collide(p) {
    for (let it = 0; it < 3; it++) for (const [a, b] of st.info.solids) {
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
      const qx = a[0] + dx * t, qz = a[1] + dz * t, ex = p[0] - qx, ez = p[1] - qz, d = Math.hypot(ex, ez), R = 0.32;
      if (d < R && d > 1e-6) { p[0] = qx + ex / d * R; p[1] = qz + ez / d * R; }
    }
    return p;
  }

  function biggestRoom() {
    const r = st.plan.pieces.slice().sort((a, b) => b.surface - a.surface)[0]; if (!r) return [0, 1];
    return r.polygone.reduce((s, p) => [s[0] + p[0] / r.polygone.length, s[1] + p[1] / r.polygone.length], [0, 0]);
  }

  function setMode(mode, k) {
    st.mode = mode; st.blend = 0;
    const I = st.info, fr = I.fr, n = [-fr.v[0], -fr.v[1]];
    if (mode === 'maquette') {
      st.orbit.az = yawOf(n[0], n[1]) + 0.35; st.orbit.pol = 0.5; st.orbit.r = Math.max(10, I.size * 2.1 + 5); st.fov = 50;
    } else if (mode === 'visite') {
      const c = biggestRoom(), w = I.W(c[0], c[1]);
      st.pos = [w[0], w[1]]; st.yaw = yawOf(n[0], n[1]); st.pitch = -0.05; st.fov = 72;
    } else if (mode === 'fenetre') {
      const wins = windows(); if (!wins.length) return setMode('visite');
      st.win = ((k ?? st.win) + wins.length) % wins.length;
      const o = wins[st.win], wall = st.plan.murs.find(m => m.id === o.murId);
      const d = [wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]], L = Math.hypot(...d), nrm = [-d[1] / L, d[0] / L];
      const ctr = I.W((wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2), room = I.W(...biggestRoom());
      // vers l'extérieur = côté opposé au centre de l'appartement
      const inC = st.info.center, outS = ((inC.x - ctr[0]) * (I.W(o.centre[0] + nrm[0], o.centre[1] + nrm[1])[0] - I.W(...o.centre)[0]) + (inC.z - ctr[1]) * (I.W(o.centre[0] + nrm[0], o.centre[1] + nrm[1])[1] - I.W(...o.centre)[1])) > 0 ? -1 : 1;
      const c = I.W(o.centre[0] - nrm[0] * outS * 1.5, o.centre[1] - nrm[1] * outS * 1.5), out = I.W(o.centre[0] + nrm[0] * outS * 5, o.centre[1] + nrm[1] * outS * 5);
      st.pos = [c[0], c[1]]; st.yaw = yawOf(out[0] - c[0], out[1] - c[1]); st.pitch = -0.04; st.fov = 74; void room;
    }
  }
  const windows = () => st.plan.ouvertures.filter(o => o.type === 'fenetre' && o.centre);

  function hook(dt) {
    if (!st.info) return false;
    const I = st.info;
    if (st.mode === 'maquette') {
      const o = st.orbit, c = I.center;
      st.tgtPos.set(c.x + Math.sin(o.az) * Math.sin(o.pol) * o.r, c.y + Math.cos(o.pol) * o.r, c.z - Math.cos(o.az) * Math.sin(o.pol) * o.r);
      st.tgtLook.copy(c);
    } else {
      if (st.mode === 'visite' && (st.joy[0] || st.joy[1])) {
        const sp = 1.6 * dt, f = [Math.sin(st.yaw), -Math.cos(st.yaw)], r = [Math.cos(st.yaw), Math.sin(st.yaw)];
        st.pos[0] += (f[0] * -st.joy[1] + r[0] * st.joy[0]) * sp; st.pos[1] += (f[1] * -st.joy[1] + r[1] * st.joy[0]) * sp;
        collide(st.pos);
      }
      const y = I.fr.floorY + (st.mode === 'fenetre' ? 1.5 : 1.62);
      st.tgtPos.set(st.pos[0], y, st.pos[1]);
      st.tgtLook.copy(st.tgtPos).add(fwdOf(st.yaw, st.pitch));
    }
    st.blend = Math.min(1, st.blend + dt / 0.9);
    const k = st.blend >= 1 ? 1 : 1 - Math.pow(1 - st.blend, 3);
    if (k >= 1) { st.cur.copy(st.tgtPos); st.look.copy(st.tgtLook); }
    else { st.cur.lerp(st.tgtPos, Math.min(1, k * 0.35 + dt * 4)); st.look.lerp(st.tgtLook, Math.min(1, k * 0.35 + dt * 4)); }
    camera.position.copy(st.cur); camera.lookAt(st.look);
    camera.near = st.mode === 'maquette' ? 0.3 : 0.05;
    camera.fov += (st.fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
    // drone garé devant la façade (dehors) : le streaming et le moteur de façades restent centrés ici
    const PL = drone.PL; if (PL) { const n = [-I.fr.v[0], -I.fr.v[1]]; PL.x = I.fr.F[0] + n[0] * 4; PL.z = I.fr.F[1] + n[1] * 4; PL.y = I.fr.floorY + 1; }
    return true;
  }

  // ---------- gestes ----------
  function mountGestures(root) {
    layer = document.createElement('div'); layer.id = 'as3-touch'; root.prepend(layer);
    joyEl = document.createElement('div'); joyEl.id = 'as3-joy'; joyEl.innerHTML = '<div></div>'; root.appendChild(joyEl); knob = joyEl.firstChild;
    const pts = new Map(); let pinch0 = 0, r0 = 0;
    layer.addEventListener('pointerdown', e => { layer.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); r0 = st.orbit.r; } });
    layer.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p[0], dy = e.clientY - p[1]; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && st.mode === 'maquette') { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); st.orbit.r = Math.max(4, Math.min(60, r0 * pinch0 / Math.max(20, d))); return; }
      if (st.mode === 'maquette') { st.orbit.az += dx * 0.008; st.orbit.pol = Math.max(0.15, Math.min(1.45, st.orbit.pol - dy * 0.006)); }
      else { st.yaw += dx * 0.006; st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch - dy * 0.005)); }
      st.blend = 1;
    });
    const up = e => pts.delete(e.pointerId);
    layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up);
    layer.addEventListener('wheel', e => { st.orbit.r = Math.max(4, Math.min(60, st.orbit.r * (1 + e.deltaY * 0.001))); }, { passive: true });
    // joystick (visite)
    let jid = null, jc = null;
    joyEl.addEventListener('pointerdown', e => { jid = e.pointerId; joyEl.setPointerCapture(jid); const r = joyEl.getBoundingClientRect(); jc = [r.left + r.width / 2, r.top + r.height / 2]; move(e); });
    const move = e => { if (e.pointerId !== jid) return; let dx = (e.clientX - jc[0]) / 46, dy = (e.clientY - jc[1]) / 46; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } st.joy = [dx, dy]; knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`; };
    joyEl.addEventListener('pointermove', move);
    const jup = e => { if (e.pointerId !== jid) return; jid = null; st.joy = [0, 0]; knob.style.transform = ''; };
    joyEl.addEventListener('pointerup', jup); joyEl.addEventListener('pointercancel', jup);
  }

  return {
    mount: mountGestures,
    start(info, plan, mode = 'maquette') {
      st.info = info; st.plan = plan;
      st.cur.copy(camera.position); st.look.copy(info.center);
      setMode(mode); window.__camOverride = hook;
    },
    setMode(m, k) { setMode(m, k); joyEl?.classList.toggle('on', m === 'visite'); },
    nextWindow(d) { setMode('fenetre', st.win + d); },
    windows,
    get mode() { return st.mode; }, get win() { return st.win; },
    stop() { if (window.__camOverride === hook) window.__camOverride = null; st.info = null; camera.near = 0.3; camera.updateProjectionMatrix(); },
  };
}
