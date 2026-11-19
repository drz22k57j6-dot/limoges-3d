// Appart Studio — analyse solaire par fenêtre et par pièce.
// BVH AABB local au voisinage de l'appartement ; aucun appel réseau hors fetchTrees().
import { daySamples, windowSunHours, fetchTrees, leafTransmission, rayHitsCrown, sunPosition, sunDirection } from './sun.js';

const DAY_KEYS = ['winter', 'spring', 'summer', 'today'];

export function makeApertureBlocker(win, thickness = win.aperture?.thickness ?? 0.35) {
  const a = win.aperture;
  if (!a) return () => false;
  const tWall = Math.max(0, Number(thickness) || 0);
  return (origin, dir) => {
    const facing = dir[0] * a.normal[0] + dir[2] * a.normal[1];
    if (facing <= 1e-6) return true;
    const t = tWall / facing;
    const x = origin[0] + dir[0] * t, y = origin[1] + dir[1] * t, z = origin[2] + dir[2] * t;
    const along = (x - a.center[0]) * a.axis[0] + (z - a.center[1]) * a.axis[1];
    return Math.abs(along) > a.width / 2 + 1e-6 || y < a.bottom - 1e-6 || y > a.top + 1e-6;
  };
}

function makeWindows(plan, fr) {
  const walls = plan.murs, center = walls.reduce((s, w) => [s[0] + w.a[0] + w.b[0], s[1] + w.a[1] + w.b[1]], [0, 0]).map(v => v / Math.max(1, walls.length * 2));
  const W = (u, v) => [fr.F[0] + fr.u[0] * u + fr.v[0] * v, fr.F[1] + fr.u[1] * u + fr.v[1] * v];
  return plan.ouvertures.filter(o => o.type === 'fenetre' && o.centre).map((o, index) => {
    const w = walls.find(x => x.id === o.murId); if (!w) return null;
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz) || 1, e = [dx / L, dz / L];
    let n = [-e[1], e[0]];
    const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    if ((center[0] - mid[0]) * n[0] + (center[1] - mid[1]) * n[1] > 0) n = [-n[0], -n[1]];
    const width = Number(o.largeur) || 1.2, sill = Number(o.allege ?? 0.9), requestedHeight = Number(o.hauteur) || 2.1;
    const height = Math.max(0.1, Math.min(requestedHeight, (Number(plan.settings?.ceilingHeight) || fr.H) - sill - 0.18));
    const thickness = Math.max(0.15, Number(plan.settings?.facadeThickness ?? w.epaisseur) || 0.35);
    const along = (o.centre[0] - w.a[0]) * e[0] + (o.centre[1] - w.a[1]) * e[1];
    // Les points de départ sont sur le nu intérieur ; chaque rayon doit traverser toute l'embrasure.
    const base = [w.a[0] + e[0] * along - n[0] * thickness, w.a[1] + e[1] * along - n[1] * thickness];
    const q = W(base[0], base[1]), axis = [e[0] * fr.u[0] + e[1] * fr.v[0], e[0] * fr.u[1] + e[1] * fr.v[1]];
    const normal = [n[0] * fr.u[0] + n[1] * fr.v[0], n[0] * fr.u[1] + n[1] * fr.v[1]];
    const bottom = fr.floorY + sill, top = bottom + height, y = (bottom + top) / 2;
    const points = [[0,0],[-.36,-.3],[.36,-.3],[-.36,.3],[.36,.3]].map(([a,b]) =>
      [q[0] + axis[0] * a * width, y + b * height, q[1] + axis[1] * a * width]);
    const room = plan.pieces.find(p => p.polygone && pointInPoly(o.centre, p.polygone));
    return { id:o.id || 'window-'+index, index, points, normal:[normal[0],0,normal[1]],
      aperture:{center:q,axis,normal,width,bottom,top,thickness}, roomId:room?.id||null, roomType:room?.type||'inconnue' };
  }).filter(Boolean);
}
function pointInPoly(p, poly) {
  for (const [du,dv] of [[0,0.45],[0,-0.45],[0.45,0],[-0.45,0]]) {
    const q=[p[0]+du,p[1]+dv]; let inside=false;
    for (let i=0,j=poly.length-1;i<poly.length;j=i++) {
      const a=poly[i],b=poly[j];
      if ((a[1]>q[1])!==(b[1]>q[1]) && q[0]<(b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    if(inside) return true;
  }
  return false;
}
function makeBvh(THREE, scene, center, radius = 250) {
  const entries = [];
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (!o.isMesh || !o.geometry || o.userData?.appartStudioOwn || ['appart-studio-3d','appart-studio-solar-trees','appart-studio-express-windows'].includes(o.parent?.name)) return;
    const materials=Array.isArray(o.material)?o.material:[o.material];
    if(materials.length&&materials.every(m=>m?.transparent)) return;
    let visible=true; for(let p=o;p;p=p.parent) if(!p.visible){visible=false;break;} if(!visible) return;
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
export function makeBlocker(THREE, bvh) {
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

// Priorité aux données végétation Paris déjà versionnées dans le dépôt (même repère
// Lambert-93 local que le moteur 3D). L'API live reste un fallback si le secteur manque.
export async function fetchInventoryGreenery(lon, lat, drone, radiusM = 180) {
  const [cx, cz] = drone.ll(lon, lat), si = Math.floor((cx + 10000) / 1000), sj = Math.floor((-cz + 6000) / 1000);
  const jobs = [];
  for (let i = si - 1; i <= si + 1; i++) for (let j = sj - 1; j <= sj + 1; j++) {
    const url = new URL('../data/paris/vegetation/' + i + '_' + j + '.json', import.meta.url);
    jobs.push(fetch(url).then(r => r.ok ? r.json() : null).catch(() => null));
  }
  const sectors = await Promise.all(jobs), hedges = [], massifs = [];
  const near = (x,z) => Math.hypot(x-cx,z-cz) <= radiusM;
  for (const data of sectors) {
    for (const h of data?.h || []) {
      const pts=h[0]||[]; if(pts.length<2) continue;
      const mx=pts.reduce((s,p)=>s+p[0],0)/pts.length, mz=pts.reduce((s,p)=>s+p[1],0)/pts.length;
      if(near(mx,mz)) hedges.push(h);
    }
    for (const m of data?.m || []) {
      const pts=m[0]||[]; if(pts.length<3) continue;
      const mx=pts.reduce((s,p)=>s+p[0],0)/pts.length, mz=pts.reduce((s,p)=>s+p[1],0)/pts.length;
      if(near(mx,mz)) massifs.push(m);
    }
  }
  return { hedges, massifs };
}
function makeGreeneryVisuals(THREE, greenery, ground) {
  const group=new THREE.Group(); group.name='appart-studio-solar-greenery';
  const hedgeMat=new THREE.MeshLambertMaterial({color:0x426b35}), massifMat=new THREE.MeshLambertMaterial({color:0x355c32});
  const box=new THREE.BoxGeometry(1,1,1);
  for(const h of greenery.hedges||[]) {
    const pts=h[0], width=THREE.MathUtils.clamp(Number(h[1])||0.8,0.3,3.5), height=THREE.MathUtils.clamp(Number(h[2])||1.5,0.5,3.5);
    for(let i=1;i<pts.length;i++) {
      const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz); if(len<0.25) continue;
      const mesh=new THREE.Mesh(box,hedgeMat); mesh.position.set((a[0]+b[0])/2,ground((a[0]+b[0])/2,(a[1]+b[1])/2)+height/2,(a[1]+b[1])/2);
      mesh.rotation.y=-Math.atan2(dz,dx); mesh.scale.set(len,height,width); mesh.castShadow=false; mesh.receiveShadow=true; group.add(mesh);
    }
  }
  for(const m of greenery.massifs||[]) {
    const pts=m[0],height=THREE.MathUtils.clamp(Number(m[1])||1.2,0.4,14); if(pts.length<3) continue;
    const shape=new THREE.Shape(); shape.moveTo(pts[0][0],-pts[0][1]); for(let i=1;i<pts.length;i++) shape.lineTo(pts[i][0],-pts[i][1]); shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:1}); geo.rotateX(-Math.PI/2);
    const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length; geo.translate(0,ground(cx,cz),0);
    const mesh=new THREE.Mesh(geo,massifMat); mesh.castShadow=false; mesh.receiveShadow=true; group.add(mesh);
  }
  return group;
}

export async function fetchInventoryTrees(lon, lat, drone, radiusM = 150) {
  const [cx, cz] = drone.ll(lon, lat);
  const si = Math.floor((cx + 10000) / 1000), sj = Math.floor((-cz + 6000) / 1000);
  const jobs = [];
  for (let i = si - 1; i <= si + 1; i++) for (let j = sj - 1; j <= sj + 1; j++) {
    const key = i + '_' + j;
    const url = new URL('../data/paris/vegetation/' + key + '.json', import.meta.url);
    jobs.push(fetch(url).then(r => r.ok ? r.json() : null).catch(() => null));
  }
  const sectors = await Promise.all(jobs), out = [], seen = new Set();
  for (const data of sectors) for (const row of data?.a || []) {
    if (!Array.isArray(row) || row.length < 8) continue;
    const [x,z,species,h,crown,trunk,stage,seed] = row;
    if (![x,z,h,crown].every(Number.isFinite) || h <= 0 || h > 45 || crown <= 0 || Math.hypot(x-cx,z-cz) > radiusM) continue;
    const id = String(seed) + ':' + x + ':' + z;
    if (seen.has(id)) continue; seen.add(id);
    const y0 = 0; // ground() est appliqué au moment du calcul pour respecter le terrain de l'adresse
    out.push({ x, z, h, r: Math.max(1.5, crown), espece: String(species), caduc: species !== 13 && species !== 14, y0, seed });
  }
  return out;
}
function makeLocalTreeModel(trees, ground) {
  return trees.map(t => {
    const y0 = ground(t.x, t.z);
    return { ...t, y0, c:[t.x,y0+t.h*0.72,t.z], r:Math.max(1.5,t.r) };
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

export async function calculateSolarReport({ THREE, scene, drone, ground, res, plan, fr, windowsOverride = null, onProgress = () => {} }) {
  const windows = windowsOverride || makeWindows(plan,fr), year = new Date().getUTCFullYear(), now = new Date();
  const paris=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const dates = {
    winter:new Date(Date.UTC(year,11,21)),
    spring:new Date(Date.UTC(year,2,21)),
    summer:new Date(Date.UTC(year,5,21)),
    today:new Date(Date.UTC(+paris.year,+paris.month-1,+paris.day)),
  };
  onProgress({ stage:'arbres', done:0, total:windows.length });
  let trees=[];
  try {
    const inventory=await fetchInventoryTrees(res.lon,res.lat,drone,150);
    trees=inventory.length ? makeLocalTreeModel(inventory,ground) : makeTreeModel(await fetchTrees(res.lon,res.lat,150),drone,ground);
  } catch(e) { console.warn('[Appart Studio] inventaire arbres indisponible, fallback API',e); try { trees=makeTreeModel(await fetchTrees(res.lon,res.lat,150),drone,ground); } catch(apiError) { console.warn('[Appart Studio] arbres indisponibles',apiError); } }
  const treeGroup=makeTreeVisuals(THREE,trees);
  let greeneryGroup=null;
  try { greeneryGroup=makeGreeneryVisuals(THREE,await fetchInventoryGreenery(res.lon,res.lat,drone,180),ground); scene.add(greeneryGroup); }
  catch(e) { console.warn('[Appart Studio] haies et massifs indisponibles',e); }
  const bvh=makeBvh(THREE,scene,[fr.F[0],fr.floorY+fr.H/2,fr.F[1]],250);
  scene.add(treeGroup);
  const baseBlocked=makeBlocker(THREE,bvh);
  const treeTransmission=(origin,dir,date)=>{
    let transmission=1;
    for(const t of trees) if(rayHitsCrown(origin,dir,t.c,t.r)) transmission*=leafTransmission(t,date);
    return transmission;
  };
  const samples=Object.fromEntries(Object.entries(dates).map(([k,d])=>[k,daySamples(d,res.lat,res.lon,15)]));
  const results=[];
  const total=windows.length*DAY_KEYS.length; let done=0, sliceStart=performance.now();
  for(const win of windows){
    const byDate={};
    for(const key of DAY_KEYS){
      const apertureBlocked=makeApertureBlocker(win);
      const r=windowSunHours(win,samples[key],(origin,dir)=>apertureBlocked(origin,dir)||baseBlocked(origin,dir),treeTransmission,15);
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
  return {windows:results,rooms,trees:trees.length,treeGroup,greeneryGroup,dates:Object.fromEntries(Object.entries(dates).map(([k,d])=>[k,d.toISOString().slice(0,10)]))};
}


// Vérification instantanée : même géométrie de fenêtre, BVH, obstacles et transmission des arbres
// que le rapport 4B ; seul l'échantillon temporel est remplacé par l'heure affichée.
export async function verifySolarAt({ THREE, scene, drone, ground, res, plan, fr, date }) {
  const windows = makeWindows(plan, fr);
  const position = sunPosition(date, res.lat, res.lon);
  if (position.el <= 0) return { windows: windows.map(w => ({ id: w.id, index: w.index, fraction: 0, sun: false })), trees: 0, treeGroup: null };
  let trees = [];
  try {
    const inventory = await fetchInventoryTrees(res.lon, res.lat, drone, 150);
    trees = inventory.length ? makeLocalTreeModel(inventory, ground) : makeTreeModel(await fetchTrees(res.lon, res.lat, 150), drone, ground);
  } catch (e) {
    console.warn('[Appart Studio] inventaire arbres indisponible pour Vérifier, fallback API', e);
    try { trees = makeTreeModel(await fetchTrees(res.lon, res.lat, 150), drone, ground); }
    catch (apiError) { console.warn('[Appart Studio] arbres indisponibles pour Vérifier', apiError); }
  }
  const treeGroup = makeTreeVisuals(THREE, trees);
  let greeneryGroup = null;
  try { greeneryGroup = makeGreeneryVisuals(THREE, await fetchInventoryGreenery(res.lon, res.lat, drone, 180), ground); scene.add(greeneryGroup); }
  catch (e) { console.warn('[Appart Studio] haies et massifs indisponibles pour Vérifier', e); }
  const bvh = makeBvh(THREE, scene, [fr.F[0], fr.floorY + fr.H / 2, fr.F[1]], 250);
  scene.add(treeGroup);
  const baseBlocked = makeBlocker(THREE, bvh);
  const treeTransmission = (origin, dir, when) => {
    let transmission = 1;
    for (const t of trees) if (rayHitsCrown(origin, dir, t.c, t.r)) transmission *= leafTransmission(t, when);
    return transmission;
  };
  const sample = { date, ...position, dir: sunDirection(position.az, position.el) };
  const results = windows.map(win => {
    const apertureBlocked = makeApertureBlocker(win);
    const fraction = windowSunHours(win, [sample], (origin,dir)=>apertureBlocked(origin,dir)||baseBlocked(origin,dir), treeTransmission, 15).minutes[0]?.frac || 0;
    return { id: win.id, index: win.index, fraction, sun: fraction > 0.2 };
  });
  return { windows: results, trees: trees.length, treeGroup, greeneryGroup };
}
