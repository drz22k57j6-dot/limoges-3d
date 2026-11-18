// Appart Studio — analyse solaire par fenêtre et par pièce.
// BVH AABB local au voisinage de l'appartement ; aucun appel réseau hors fetchTrees().
import { daySamples, windowSunHours, fetchTrees, leafTransmission, rayHitsCrown } from './sun.js';

const DAY_KEYS = ['winter', 'spring', 'summer', 'today'];

function makeWindows(plan, fr) {
  const walls = plan.murs, center = walls.reduce((s, w) => [s[0] + w.a[0] + w.b[0], s[1] + w.a[1] + w.b[1]], [0, 0]).map(v => v / Math.max(1, walls.length * 2));
  const W = (u, v) => [fr.F[0] + fr.u[0] * u + fr.v[0] * v, fr.F[1] + fr.u[1] * u + fr.v[1] * v];
  return plan.ouvertures.filter(o => o.type === 'fenetre' && o.centre).map((o, index) => {
    const w = walls.find(x => x.id === o.murId); if (!w) return null;
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz) || 1, e = [dx / L, dz / L];
    let n = [-e[1], e[0]];
    const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    if ((center[0] - mid[0]) * n[0] + (center[1] - mid[1]) * n[1] > 0) n = [-n[0], -n[1]];
    const width = o.largeur || 1.2, along = (o.centre[0] - w.a[0]) * e[0] + (o.centre[1] - w.a[1]) * e[1];
    const y = fr.floorY + (o.allege || 0.9) + (o.hauteur || 1.3) * 0.55;
    const points2 = [[0,0],[-.38,-.32],[.38,-.32],[-.38,.32],[.38,.32]].map(([a,b]) => {
      const p = [w.a[0] + e[0] * (along + a * width) + n[0] * 0.05, w.a[1] + e[1] * (along + a * width) + n[1] * 0.05];
      const q = W(p[0], p[1]); return [q[0], y + b * Math.min(0.35, (o.hauteur || 1.3) * 0.22), q[1]];
    });
    const normal2 = [n[0] * fr.u[0] + n[1] * fr.v[0], n[0] * fr.u[1] + n[1] * fr.v[1]];
    const room = plan.pieces.find(p => p.polygone && pointInPoly(o.centre, p.polygone));
    return { id: o.id || 'window-' + index, index, points: points2, normal: [normal2[0], 0, normal2[1]], roomId: room?.id || null, roomType: room?.type || 'inconnue' };
  }).filter(Boolean);
}
function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function makeBvh(THREE, scene, center, radius = 250) {
  const entries = [];
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (!o.isMesh || !o.geometry || o.userData?.appartStudioOwn || o.parent?.name === 'appart-studio-solar-trees') return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (!o.geometry.boundingBox) return;
    const box = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    const c = box.getCenter(new THREE.Vector3());
    if (Math.hypot(c.x - center[0], c.z - center[2]) > radius + box.getSize(new THREE.Vector3()).length() / 2) return;
    entries.push({ mesh: o, box, c: [c.x, c.y, c.z] });
  });
  function build(items) {
    if (!items.length) return null;
    const box = items.reduce((b, e) => b.union(e.box.clone()), new THREE.Box3());
    if (items.length <= 8) return { box, items };
    const size = box.getSize(new THREE.Vector3()), axis = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
    const key = ['x','y','z'][axis]; items.sort((a,b) => a.c[axis] - b.c[axis]);
    const m = items.length >> 1;
    return { box, left: build(items.slice(0,m)), right: build(items.slice(m)) };
  }
  return build(entries);
}
function queryBvh(THREE, node, ray, out) {
  if (!node || !ray.intersectsBox(node.box)) return;
  if (node.items) { for (const e of node.items) if (ray.intersectsBox(e.box)) out.push(e.mesh); return; }
  queryBvh(THREE,node.left,ray,out); queryBvh(THREE,node.right,ray,out);
}
function makeBlocker(THREE, bvh) {
  const raycaster = new THREE.Raycaster(), ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
  return (origin, dir) => {
    ray.origin.set(origin[0],origin[1],origin[2]); ray.direction.set(dir[0],dir[1],dir[2]).normalize();
    const candidates=[]; queryBvh(THREE,bvh,ray,candidates);
    if (!candidates.length) return false;
    raycaster.set(ray.origin,ray.direction); raycaster.near=0.08; raycaster.far=250;
    return raycaster.intersectObjects(candidates,false).length>0;
  };
}
function makeTreeModel(trees, drone, ground) {
  return trees.map(t => {
    const [x,z] = drone.ll(t.lon,t.lat), y0 = ground(x,z);
    return { ...t, y0, c:[x,y0+t.h*0.72,z], r:Math.max(1.5,t.r) };
  });
}
function makeTreeVisuals(THREE, trees) {
  const group=new THREE.Group(); group.name='appart-studio-solar-trees';
  if(!trees.length) return group;
  const crownGeo=new THREE.SphereGeometry(1,8,6), trunkGeo=new THREE.CylinderGeometry(0.12,0.2,1,6);
  const crownMat=new THREE.MeshStandardMaterial({color:0x477344,roughness:1});
  const trunkMat=new THREE.MeshStandardMaterial({color:0x765238,roughness:1});
  const crowns=new THREE.InstancedMesh(crownGeo,crownMat,trees.length), trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,trees.length);
  const matrix=new THREE.Matrix4(), pos=new THREE.Vector3(), scale=new THREE.Vector3(), quat=new THREE.Quaternion();
  trees.forEach((t,i)=>{
    pos.set(t.c[0],t.c[1],t.c[2]); scale.set(t.r,t.r,t.r); matrix.compose(pos,quat,scale); crowns.setMatrixAt(i,matrix);
    pos.set(t.c[0],t.y0+t.h*0.2,t.c[2]); scale.set(1,t.h*0.4,1); matrix.compose(pos,quat,scale); trunks.setMatrixAt(i,matrix);
  });
  crowns.instanceMatrix.needsUpdate=true; trunks.instanceMatrix.needsUpdate=true;
  group.add(trunks,crowns); return group;
}

export async function calculateSolarReport({ THREE, scene, drone, ground, res, plan, fr, onProgress = () => {} }) {
  const windows = makeWindows(plan,fr), year = new Date().getUTCFullYear(), now = new Date();
  const paris=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const dates = {
    winter:new Date(Date.UTC(year,11,21)),
    spring:new Date(Date.UTC(year,2,21)),
    summer:new Date(Date.UTC(year,5,21)),
    today:new Date(Date.UTC(+paris.year,+paris.month-1,+paris.day)),
  };
  onProgress({ stage:'arbres', done:0, total:windows.length });
  let trees=[];
  try { trees=makeTreeModel(await fetchTrees(res.lon,res.lat,150),drone,ground); } catch(e) { console.warn('[Appart Studio] arbres indisponibles',e); }
  const treeGroup=makeTreeVisuals(THREE,trees);
  const bvh=makeBvh(THREE,scene,[fr.F[0],fr.floorY+fr.H/2,fr.F[1]],250);
  scene.add(treeGroup);
  const isBlocked=makeBlocker(THREE,bvh);
  const treeTransmission=(origin,dir,date)=>{
    let transmission=1;
    for(const t of trees) if(rayHitsCrown(origin,dir,t.c,t.r)) transmission=Math.min(transmission,leafTransmission(t,date));
    return transmission;
  };
  const samples=Object.fromEntries(Object.entries(dates).map(([k,d])=>[k,daySamples(d,res.lat,res.lon,15)]));
  const results=[];
  const total=windows.length*DAY_KEYS.length; let done=0, sliceStart=performance.now();
  for(const win of windows){
    const byDate={};
    for(const key of DAY_KEYS){
      const r=windowSunHours(win,samples[key],isBlocked,treeTransmission,15);
      byDate[key]={hours:r.hours,first:r.first?.toISOString()||null,last:r.last?.toISOString()||null,minutes:r.minutes};
      done++; onProgress({stage:'calcul',done,total,window:win.id,date:key});
      if(performance.now()-sliceStart>=30){ await new Promise(resolve=>('requestIdleCallback' in window)?requestIdleCallback(()=>resolve(),{timeout:50}):setTimeout(resolve,0)); sliceStart=performance.now(); }
    }
    results.push({...win,byDate});
  }
  const rooms=plan.pieces.map(room=>{
    const ws=results.filter(w=>w.roomId===room.id);
    const sums={}; for(const key of DAY_KEYS) {
      const series=ws.map(w=>w.byDate[key]?.minutes||[]);
      const steps=series[0]?.length||0; let totalMinutes=0;
      for(let i=0;i<steps;i++) totalMinutes+=Math.max(0,...series.map(a=>a[i]?.frac||0))*15;
      sums[key]=totalMinutes/60;
    }
    return {id:room.id,type:room.type,windows:ws.map(w=>w.id),hours:sums};
  });
  onProgress({stage:'termine',done:total,total,trees:trees.length});
  return {windows:results,rooms,trees:trees.length,treeGroup,dates:Object.fromEntries(Object.entries(dates).map(([k,d])=>[k,d.toISOString().slice(0,10)]))};
}
