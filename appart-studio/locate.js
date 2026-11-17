// Localisation appartement — phase 1.
// Repère jeu : X = Est, Z = -Nord ; données IGN et BAN en Lambert-93 EPSG:2154.
const WFS = 'https://data.geopf.fr/wfs/ows';
const ID_CACHE = new Map();
const $ = id => document.getElementById(id);

const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\b750\d{2}\b/g, ' ').replace(/\bparis(?:\s+\d{1,2}(?:e|er|eme|ème)?\s+arrondissement)?\b/g, ' ')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function addressKey(s) {
  const n = normalize(s).replace(/\b(france)\b/g, '').trim();
  const m = n.match(/^(\d+\s*(?:bis|ter)?)\s+(.+)$/);
  return m ? m[1].replace(/\s/g, '') + '|' + m[2].replace(/\b(r)\b/g, 'rue').replace(/\b(av)\b/g, 'avenue') : n;
}
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
function pointInRing(x,y,r) {
  let inside=false;
  for(let i=0,j=r.length-1;i<r.length;j=i++){
    const a=r[i],b=r[j];
    if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
function nearestOnSegment(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;
  const t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;
  const q=[a[0]+dx*t,a[1]+dy*t];
  return {q,d:distance(p,q)};
}
function ringsOf(feature) {
  const g=feature.geometry;
  if(!g) return [];
  if(g.type==='Polygon') return [g.coordinates[0]];
  if(g.type==='MultiPolygon') return g.coordinates.map(p=>p[0]);
  return [];
}
function facadeFor(point, rings) {
  let best=null;
  for(const ring of rings) for(let i=0;i<ring.length-1;i++){
    const hit=nearestOnSegment(point,ring[i],ring[i+1]);
    if(!best || hit.d<best.d) best={...hit,a:ring[i],b:ring[i+1],ring};
  }
  if(!best) throw new Error('Emprise IGN sans arête exploitable.');
  const inside=rings.some(r=>pointInRing(point[0],point[1],r));
  let outward;
  if(inside){
    const c=best.ring.reduce((s,p)=>[s[0]+p[0]/best.ring.length,s[1]+p[1]/best.ring.length],[0,0]);
    outward=[best.q[0]-c[0],best.q[1]-c[1]];
  } else outward=[point[0]-best.q[0],point[1]-best.q[1]];
  let L=Math.hypot(...outward);
  if(L<0.01){outward=[best.b[1]-best.a[1],best.a[0]-best.b[0]];L=Math.hypot(...outward)||1;}
  outward=outward.map(v=>v/L);
  const edgeAngle=Math.atan2(best.b[1]-best.a[1],best.b[0]-best.a[0]);
  return {point:best.q,outward,edgeAngle,distance:best.d,inside};
}
async function identityCell(i,j) {
  const key=i+'_'+j;
  if(!ID_CACHE.has(key)){
    const url=(window.CITY?.data || 'data/paris/')+'identite/'+key+'.json';
    ID_CACHE.set(key,fetch(url).then(async r=>{if(!r.ok) return {}; return r.json();}).catch(()=>({})));
  }
  return ID_CACHE.get(key);
}
async function exactIdentity(label, X, Y, CITY) {
  const wanted=addressKey(label);
  const i=Math.floor((X-CITY.X0+3000)/1000),j=Math.floor((Y-CITY.Y0+3000)/1000);
  const offsets=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
  for(const [di,dj] of offsets){
    const records=await identityCell(i+di,j+dj);
    for(const [id,record] of Object.entries(records)){
      const addresses=record.adresses || [];
      const match=addresses.find(a=>addressKey(a.label)===wanted);
      if(match) return {id,record,address:match,cell:(i+di)+'_'+(j+dj)};
    }
  }
  return null;
}
function wfsUrl(params) {
  return WFS+'?'+new URLSearchParams({SERVICE:'WFS',VERSION:'2.0.0',REQUEST:'GetFeature',
    TYPENAMES:'BDTOPO_V3:batiment',OUTPUTFORMAT:'application/json',SRSNAME:'EPSG:2154',
    PROPERTYNAME:'cleabs,hauteur,nombre_d_etages,nature,geometrie,altitude_minimale_sol,altitude_maximale_sol,materiaux_de_la_toiture',
    COUNT:'30',...params});
}
async function fetchFeatureById(id) {
  const u=wfsUrl({CQL_FILTER:"cleabs='"+String(id).replace(/[^a-zA-Z0-9_-]/g,'')+"'"});
  const r=await fetch(u); if(!r.ok) throw new Error('WFS IGN : HTTP '+r.status);
  const d=await r.json(); return d.features?.[0] || null;
}
async function fetchNearby(point) {
  const pad=35;
  const u=wfsUrl({BBOX:[point[0]-pad,point[1]-pad,point[0]+pad,point[1]+pad,'EPSG:2154'].join(',')});
  const r=await fetch(u); if(!r.ok) throw new Error('WFS IGN : HTTP '+r.status);
  const d=await r.json();
  let best=null,bd=Infinity;
  for(const f of d.features||[]){
    const rs=ringsOf(f); if(!rs.length) continue;
    const inside=rs.some(r=>pointInRing(point[0],point[1],r));
    let dd=inside?0:Infinity;
    if(!inside) for(const ring of rs) for(let i=0;i<ring.length-1;i++) dd=Math.min(dd,nearestOnSegment(point,ring[i],ring[i+1]).d);
    if(dd<bd){bd=dd;best=f;}
  }
  return best ? {feature:best,distance:bd} : null;
}
function isHaussmann(props, identity, floors, height) {
  const s=[props.nature,identity.usage,identity.usage2].join(' ').toLowerCase();
  return /haussmann/.test(s) || (floors>=5 && height>=18 && height/floors>=3.15);
}
function floorModel(props, identity, floor) {
  // BD TOPO : nombre_d_etages est le total des niveaux hors-sol, RDC compris.
  // Source : Descriptif de contenu BD TOPO v3.5, IGN, juillet 2025.
  const raw=Number(identity.etages ?? props.nombre_d_etages);
  const height=Number(identity.hauteur_m ?? props.hauteur);
  const floors=Number.isFinite(raw)&&raw>0?raw:Math.max(2,Math.round((height||15)/3.2));
  const h=Number.isFinite(height)&&height>0?height:floors*3.1;
  const haus=isHaussmann(props,identity,floors,h);
  const hRDC=haus?4:3;
  const roofText=[props.type_toit,props.nature,identity.toiture].join(' ').toLowerCase();
  const hToit=/mansard|mansarde/.test(roofText)?3:0;
  const above=Math.max(1,floors-1);
  let hEtage=(h-hRDC-hToit)/above;
  if(!Number.isFinite(hEtage)||hEtage<2||hEtage>5) hEtage=(h-hRDC-hToit)/above;
  const f=Math.max(0,Math.floor(Number(floor)||0));
  return {floor:f,hRDC,hEtage,hToit,height:h,floors,above,haussmann:haus,
    offset:f===0?0:hRDC+(f-1)*hEtage,confidence:Number.isFinite(raw)&&Number.isFinite(height)?'IGN':'estimée'};
}

export async function locateApartment(address, floor, ctx) {
  const {CITY,drone,ground,THREE,scene}=ctx;
  if(CITY?.id!=='paris') throw new Error('Appart Studio est actuellement limité au secteur Paris.');
  const q=address.trim();
  if(!q) throw new Error('Saisis une adresse parisienne.');
  const url='https://data.geopf.fr/geocodage/search?'+new URLSearchParams({q:q+', Paris',limit:'5',lat:String(CITY.lat),lon:String(CITY.lon)});
  const gr=await fetch(url); if(!gr.ok) throw new Error('Géocodage Géoplateforme : HTTP '+gr.status);
  const gd=await gr.json();
  const candidates=(gd.features||[]).filter(f=>f.geometry?.coordinates?.length>=2).sort((a,b)=>(b.properties?.score||0)-(a.properties?.score||0));
  const hit=candidates[0]; if(!hit) throw new Error('Adresse introuvable par le géocodeur Géoplateforme.');
  const [lon,lat]=hit.geometry.coordinates;
  const [lx,lz]=drone.ll(lon,lat), point=[lx+CITY.X0,CITY.Y0-lz];
  const exact=await exactIdentity(hit.properties?.label||q,point[0],point[1],CITY);
  let feature=null,matchMode='proximité';
  if(exact){feature=await fetchFeatureById(exact.id); if(feature) matchMode='adresse exacte BAN ↔ bâtiment'; else exact=null;}
  let fallbackDistance=0;
  if(!feature){
    const near=await fetchNearby(point); if(!near) throw new Error('Aucun bâtiment BD TOPO trouvé dans un rayon de 35 m.');
    feature=near.feature;fallbackDistance=near.distance;
  }
  const props=feature.properties||{};
  const rings=ringsOf(feature);
  if(!rings.length) throw new Error('Le bâtiment IGN ne contient pas de polygone exploitable.');
  const facade=facadeFor(point,rings);
  const inward=[-facade.outward[0],-facade.outward[1]];
  const insideL93=[facade.point[0]+inward[0]*1.0,facade.point[1]+inward[1]*1.0];
  const localX=insideL93[0]-CITY.X0,localZ=-(insideL93[1]-CITY.Y0);
  const identity=exact?.record||{};
  const floorData=floorModel(props,identity,floor);
  const floorY=ground(localX,localZ)+floorData.offset;
  const marker=new THREE.Group(); marker.name='appart-studio-marker';
  const disc=new THREE.Mesh(new THREE.CircleGeometry(.52,32),new THREE.MeshBasicMaterial({color:0xff2638,transparent:true,opacity:.9,side:THREE.DoubleSide,depthTest:false}));
  disc.rotation.x=-Math.PI/2; disc.position.y=.035; marker.add(disc);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.62,.045,8,40),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false}));
  ring.rotation.x=-Math.PI/2; ring.position.y=.06; marker.add(ring);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.55,8),new THREE.MeshBasicMaterial({color:0xff2638,depthTest:false}));
  stem.position.y=.31; marker.add(stem);
  marker.position.set(localX,floorY,localZ); scene.add(marker);
  marker.userData.floorOffset=floorData.offset;
  const result={address:hit.properties?.label||q,lon,lat,point,localX,localZ,floorY,feature,identity,exact,
    matchMode,fallbackDistance,facade,floorData,marker,adjust:0};
  window.__appartStudio.current=result;
  await drone.teleport(localX,localZ,{nom:'Appartement · '+result.address,dist:20,ang:.85,alt:floorData.offset+3});
  return result;
}
export function updateFloor(result, delta, ground) {
  result.adjust=Math.round((result.adjust+delta)*100)/100;
  result.floorY=ground(result.localX,result.localZ)+result.floorData.offset+result.adjust;
  result.marker.position.y=result.floorY;
  return result;
}
