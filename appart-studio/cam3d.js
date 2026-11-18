// Appart Studio — caméras de l'appartement 3D : Maquette (orbite), Visite (1re personne), Fenêtres.
// Pilotage tactile ; la caméra est imposée via window.__camOverride.

export function createCam3d({ THREE, camera, drone, renderer }) {
  const st = { mode: 'maquette', info: null, plan: null, yaw: 0, pitch: 0, pos: null, orbit: { az: 0, pol: 0.95, r: 14 },
    cur: new THREE.Vector3(), look: new THREE.Vector3(), tgtPos: new THREE.Vector3(), tgtLook: new THREE.Vector3(), joy: [0, 0], blend: 1, win: 0, fov: 60, lastValid: null, animations: [] };
  let layer = null, joyEl = null, knob = null;
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();

  const fwdOf = (yaw, pitch) => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const yawOf = (dx, dz) => Math.atan2(dx, -dz);

  const pointInPoly = (p, poly) => {
    let inside = false;
    for (let i=0,j=poly.length-1;i<poly.length;j=i++) { const a=poly[i],b=poly[j]; if ((a[1]>p[1]) !== (b[1]>p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside; }
    return inside;
  };
  const segDistance = (p,a,b) => { const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)); return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t); };
  function insideRoom(world) { const p=st.info.toPlan(world); return st.plan.pieces.some(r=>pointInPoly(p,r.polygone)); }
  function safeStart() {
    const rooms=st.plan.pieces.slice().sort((a,b)=>(b.surface||0)-(a.surface||0));
    for (const room of rooms) {
      const xs=room.polygone.map(p=>p[0]),ys=room.polygone.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
      let best=null,score=-1;
      for(let x=x0+.5;x<x1;x+=.12) for(let y=y0+.5;y<y1;y+=.12) {
        const p=[x,y]; if(!pointInPoly(p,room.polygone)) continue;
        let d=Infinity; for(let i=0,j=room.polygone.length-1;i<room.polygone.length;j=i++) d=Math.min(d,segDistance(p,room.polygone[i],room.polygone[j]));
        if(d>score){score=d;best=p;}
      }
      if(best && score>=.5) return st.info.W(best[0],best[1]);
    }
    const c=rooms[0]?.polygone?.reduce((a,p)=>[a[0]+p[0]/rooms[0].polygone.length,a[1]+p[1]/rooms[0].polygone.length],[0,0]) || [0,1];
    return st.info.W(c[0],c[1]);
  }
  function collide(p) {
    const R=.30, solids=st.info.solids||[];
    for(let it=0;it<4;it++) for(const item of solids) {
      const a=Array.isArray(item)?item[0]:item.a,b=Array.isArray(item)?item[1]:item.b,half=Array.isArray(item)?0:(item.halfWidth||0);
      const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l));
      const qx=a[0]+dx*t,qz=a[1]+dz*t,ex=p[0]-qx,ez=p[1]-qz,d=Math.hypot(ex,ez),min=R+half;
      if(d<min) { const nx=d>1e-7?ex/d:-dz/Math.sqrt(l),nz=d>1e-7?ez/d:dx/Math.sqrt(l); p[0]=qx+nx*min;p[1]=qz+nz*min; }
    }
    // Battants ouverts : leur boîte monde devient un obstacle mobile.
    for(let wi=0;wi<(st.info.windowLeaves||[]).length;wi++) { if(!st.info.windowStates?.[wi]) continue; const win=st.info.windowLeaves[wi]; for(const pivot of [win.left,win.right]) {
      pivot.updateMatrixWorld(true); const box=new THREE.Box3().setFromObject(pivot);
      if(!box.isEmpty() && p[0]>box.min.x-R && p[0]<box.max.x+R && p[1]>box.min.z-R && p[1]<box.max.z+R) {
        const candidates=[[box.min.x-R,p[1]],[box.max.x+R,p[1]],[p[0],box.min.z-R],[p[0],box.max.z+R]];
        candidates.sort((a,b)=>Math.hypot(a[0]-p[0],a[1]-p[1])-Math.hypot(b[0]-p[0],b[1]-p[1])); p[0]=candidates[0][0];p[1]=candidates[0][1];
      }
    }}
    return p;
  }
  function moveSafely(dx,dz) {
    const dist=Math.hypot(dx,dz),steps=Math.max(1,Math.ceil(dist/.05)),sx=dx/steps,sz=dz/steps;
    for(let i=0;i<steps;i++) {
      const next=[st.pos[0]+sx,st.pos[1]+sz]; collide(next);
      if(!insideRoom(next)) { if(st.lastValid) st.pos=st.lastValid.slice(); break; }
      st.pos=next; st.lastValid=next.slice();
    }
  }
  function toggleWindow(index) {
    const I=st.info, win=I?.windowLeaves?.[index]; if(!win) return false;
    const opening=!I.windowStates[index]; I.windowStates[index]=opening;
    st.animations=st.animations.filter(a=>a.index!==index);
    st.animations.push({index,elapsed:0,from:[win.left.rotation.y,win.right.rotation.y],to:opening?[win.baseAngle-win.inwardSign*Math.PI/2,win.baseAngle+win.inwardSign*Math.PI/2]:[win.baseAngle,win.baseAngle]});
    return true;
  }
  function animateWindows(dt) {
    for(const a of st.animations) {
      a.elapsed=Math.min(.6,a.elapsed+dt); const t=a.elapsed/.6,e=1-Math.pow(1-t,3),w=st.info.windowLeaves[a.index];
      w.left.rotation.y=a.from[0]+(a.to[0]-a.from[0])*e; w.right.rotation.y=a.from[1]+(a.to[1]-a.from[1])*e;
    }
    st.animations=st.animations.filter(a=>a.elapsed<.6);
  }
  function tapWindow(x,y) {
    if(!renderer?.domElement || !st.info?.windowMeshes?.length) return;
    const rect=renderer.domElement.getBoundingClientRect(); pointer.set((x-rect.left)/rect.width*2-1,-((y-rect.top)/rect.height)*2+1);
    st.info.windowLeaves.forEach(w=>{w.left.updateMatrixWorld(true);w.right.updateMatrixWorld(true);});
    raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(st.info.windowMeshes,false)[0];
    if(hit) toggleWindow(hit.object.userData.windowIndex);
  }
  function biggestRoom() {
    const r=st.plan.pieces.slice().sort((a,b)=>(b.surface||0)-(a.surface||0))[0]; if(!r) return [0,1];
    return r.polygone.reduce((s,p)=>[s[0]+p[0]/r.polygone.length,s[1]+p[1]/r.polygone.length],[0,0]);
  }

  function setMode(mode, k) {
    st.mode = mode; st.blend = 0;
    const I = st.info, fr = I.fr, n = [-fr.v[0], -fr.v[1]];
    if (mode === 'maquette') {
      st.orbit.az = yawOf(n[0], n[1]) + 0.35; st.orbit.pol = 0.5; st.orbit.r = Math.max(10, I.size * 2.1 + 5); st.fov = 50;
    } else if (mode === 'visite') {
      const w = safeStart();
      st.pos = [w[0], w[1]]; st.lastValid = st.pos.slice(); st.yaw = yawOf(n[0], n[1]); st.pitch = -0.05; st.fov = 72;
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
    animateWindows(dt);
    if (st.mode === 'maquette') {
      const o = st.orbit, c = I.center;
      st.tgtPos.set(c.x + Math.sin(o.az) * Math.sin(o.pol) * o.r, c.y + Math.cos(o.pol) * o.r, c.z - Math.cos(o.az) * Math.sin(o.pol) * o.r);
      st.tgtLook.copy(c);
    } else {
      if (st.mode === 'visite' && (st.joy[0] || st.joy[1])) {
        const sp = 1.6 * dt, f = [Math.sin(st.yaw), -Math.cos(st.yaw)], r = [Math.cos(st.yaw), Math.sin(st.yaw)];
        moveSafely((f[0] * -st.joy[1] + r[0] * st.joy[0]) * sp,(f[1] * -st.joy[1] + r[1] * st.joy[0]) * sp);
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
    const pts = new Map(); let pinch0 = 0, r0 = 0, tapStart = null;
    layer.addEventListener('pointerdown', e => { layer.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) tapStart = { id:e.pointerId,x:e.clientX,y:e.clientY,moved:false }; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); r0 = st.orbit.r; } });
    layer.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p[0], dy = e.clientY - p[1]; if(tapStart?.id===e.pointerId && Math.hypot(e.clientX-tapStart.x,e.clientY-tapStart.y)>8) tapStart.moved=true; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && st.mode === 'maquette') { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); st.orbit.r = Math.max(4, Math.min(60, r0 * pinch0 / Math.max(20, d))); return; }
      if (st.mode === 'maquette') { st.orbit.az += dx * 0.008; st.orbit.pol = Math.max(0.15, Math.min(1.45, st.orbit.pol - dy * 0.006)); }
      else { st.yaw += dx * 0.006; st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch - dy * 0.005)); }
      st.blend = 1;
    });
    const up = e => { const multi=pts.size>1; pts.delete(e.pointerId); if(!multi && tapStart?.id===e.pointerId && !tapStart.moved && (st.mode==='visite'||st.mode==='fenetre')) tapWindow(e.clientX,e.clientY); tapStart=null; };
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
    toggleCurrentWindow() { return toggleWindow(st.win); },
    windowOpen(i) { return !!st.info?.windowStates?.[i]; },
    windows,
    get mode() { return st.mode; }, get win() { return st.win; },
    stop() { if (window.__camOverride === hook) window.__camOverride = null; st.info = null; camera.near = 0.3; camera.updateProjectionMatrix(); },
  };
}
