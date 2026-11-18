// Localisation appartement — phase 1.
// Repère jeu : X = Est, Z = -Nord ; données IGN et BAN en Lambert-93 EPSG:2154.
const WFS = 'https://data.geopf.fr/wfs/ows';
const ID_CACHE = new Map();

const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\b750\d{2}\b/g, ' ').replace(/\bparis(?:\s+\d{1,2}(?:e|er|eme|ème)?(?:\s+arrondissement)?)?\b/g, ' ')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function addressKey(s) {
  const n = normalize(s).replace(/\b(france)\b/g, '').trim();
  const m = n.match(/^(\d+\s*(?:bis|ter|[a-z])?)\s+(.+)$/);
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
  return facadeFromEdge(point,best.a,best.b,best.ring,best.d);
}
function facadeFromEdge(point,a,b,ring,distance0) {
  const hit=nearestOnSegment(point,a,b), c=ring.reduce((s,p)=>[s[0]+p[0]/ring.length,s[1]+p[1]/ring.length],[0,0]);
  let outward=[hit.q[0]-c[0],hit.q[1]-c[1]], L=Math.hypot(...outward);
  if(L<0.01){outward=[b[1]-a[1],a[0]-b[0]];L=Math.hypot(...outward)||1;}
  outward=outward.map(v=>v/L);
  return {point:hit.q,a,b,outward,edgeAngle:Math.atan2(b[1]-a[1],b[0]-a[0]),distance:distance0 ?? hit.d,inside:true};
}
function lambert93ToLonLat(x,y) {
  const n=.725607765053267, C=11754255.426096, xs=700000, ys=12655612.049876, e=.0818191910428158, lon0=3*Math.PI/180;
  const dx=x-xs, dy=ys-y, R=Math.hypot(dx,dy), gamma=Math.atan2(dx,dy);
  const iso=Math.log(C/R)/n; let lat=2*Math.atan(Math.exp(iso))-Math.PI/2;
  for(let i=0;i<6;i++) lat=2*Math.atan(Math.exp(iso)*Math.pow((1+e*Math.sin(lat))/(1-e*Math.sin(lat)),e/2))-Math.PI/2;
  return [(lon0+gamma/n)*180/Math.PI,lat*180/Math.PI];
}
async function reverseStreet(x,y) {
  try {
    const [lon,lat]=lambert93ToLonLat(x,y), url='https://data.geopf.fr/geocodage/reverse?'+new URLSearchParams({lon:String(lon),lat:String(lat),index:'address'});
    const r=await fetch(url); if(!r.ok) return '';
    const d=await r.json(), p=d.features?.[0]?.properties || {};
    const label=String(p.label || '').replace(/^\s*\d+\s*(?:bis|ter)?\s*/i,'').split(',')[0];
    return String(p.street || p.name || label || '').trim();
  } catch (_) { return ''; }
}
async function facadeRoadChoices(point,rings) {
  const ring=rings[0] || [], c=ring.reduce((s,p)=>[s[0]+p[0]/ring.length,s[1]+p[1]/ring.length],[0,0]);
  const raw=await Promise.all(ring.slice(0,-1).map(async (a,i)=>{
    const b=ring[i+1], L=distance(a,b); if(L<4) return null;
    const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2], out=[mid[0]-c[0],mid[1]-c[1]], n=Math.hypot(...out)||1;
    const street=await reverseStreet(mid[0]+out[0]/n*3,mid[1]+out[1]/n*3);
    if(!street) return null;
    return {street,facade:facadeFromEdge(point,a,b,ring),edgeIndex:i};
  }));
  const candidates=raw.filter(Boolean), seen=new Set(), unique=[];
  for(const x of candidates) { const key=x.street.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); if(seen.has(key)) continue; seen.add(key); unique.push(x); }
  const bestDistance=Math.min(...unique.map(x=>x.facade.distance),Infinity);
  return unique.filter(x=>x.facade.distance<=bestDistance+18);
}
async function identityCell(i,j) {
  const key=i+'_'+j;
  if(!ID_CACHE.has(key)){
    const url=(window.CITY?.data || 'data/paris/')+'identite/'+key+'.json';
    ID_CACHE.set(key,fetch(url).then(async r=>{if(!r.ok) return {}; return r.json();}).catch(()=>({})));
  }
  return ID_CACHE.get(key);
}
async function exactIdentities(label, X, Y, CITY) {
  const wanted=addressKey(label);
  const i=Math.floor((X-CITY.X0+3000)/1000),j=Math.floor((Y-CITY.Y0+3000)/1000);
  const offsets=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
  const out=[];
  for(const [di,dj] of offsets){
    const records=await identityCell(i+di,j+dj);
    for(const [id,record] of Object.entries(records)){
      const match=(record.adresses || []).find(a=>addressKey(a.label)===wanted);
      if(match) out.push({id,record,address:match,cell:(i+di)+'_'+(j+dj)});
    }
    if(out.length && di===0 && dj===0) break;
  }
  return out;
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
function distToFeature(point,f){
  const rs=ringsOf(f); if(!rs.length) return Infinity;
  if(rs.some(r=>pointInRing(point[0],point[1],r))) return 0;
  let dd=Infinity;
  for(const ring of rs) for(let i=0;i<ring.length-1;i++) dd=Math.min(dd,nearestOnSegment(point,ring[i],ring[i+1]).d);
  return dd;
}
async function fetchNearby(point,pad=35) {
  const u=wfsUrl({BBOX:[point[0]-pad,point[1]-pad,point[0]+pad,point[1]+pad,'EPSG:2154'].join(',')});
  const r=await fetch(u); if(!r.ok) throw new Error('WFS IGN : HTTP '+r.status);
  const d=await r.json();
  return (d.features||[]).map(f=>({feature:f,distance:distToFeature(point,f)})).filter(x=>Number.isFinite(x.distance)).sort((a,b)=>a.distance-b.distance);
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
  let above2=above;
  if(!Number.isFinite(hEtage)||hEtage<2.5||hEtage>4.5){ above2=Math.max(1,Math.round((h-hRDC-hToit)/3.0)); hEtage=(h-hRDC-hToit)/above2; }
  if(!Number.isFinite(hEtage)||hEtage<2.4) hEtage=3.0;
  const f=Math.max(0,Math.floor(Number(floor)||0));
  return {floor:f,hRDC,hEtage,hToit,height:h,floors,above:above2,topFloor:above2,haussmann:haus,
    offset:f===0?0:hRDC+(f-1)*hEtage,confidence:Number.isFinite(raw)&&Number.isFinite(height)?'IGN':'estimée'};
}

export async function geocode(q, CITY, limit=5) {
  const url='https://data.geopf.fr/geocodage/search?'+new URLSearchParams({q:/paris/i.test(q)?q:q+', Paris',limit:String(limit),lat:String(CITY.lat),lon:String(CITY.lon),index:'address'});
  const gr=await fetch(url); if(!gr.ok) throw new Error('Géocodage Géoplateforme : HTTP '+gr.status);
  const gd=await gr.json();
  return (gd.features||[]).filter(f=>f.geometry?.coordinates?.length>=2 && /^75/.test(f.properties?.postcode||'75'));
}

// adresse → bâtiment IGN → façade côté rue → étage. Ne touche ni à la caméra ni à la scène.
export async function locateApartment(address, floor, ctx, picked=null) {
  const {CITY,drone}=ctx;
  if(CITY?.id!=='paris') throw new Error('Appart Studio est actuellement limité à Paris.');
  const q=address.trim();
  if(!q) throw new Error('Saisis une adresse parisienne.');
  const hit=picked || (await geocode(q,CITY,1))[0];
  if(!hit) throw new Error('Adresse introuvable. Vérifie le numéro et le nom de la rue.');
  const [lon,lat]=hit.geometry.coordinates;
  const [lx,lz]=drone.ll(lon,lat), point=[lx+CITY.X0,CITY.Y0-lz];
  const label=hit.properties?.label||q;
  const [exacts,near]=await Promise.all([exactIdentities(label,point[0],point[1],CITY),fetchNearby(point)]);
  let feature=null,matchMode='bâtiment le plus proche',exact=null,fallbackDistance=0;
  if(exacts.length){
    // plusieurs bâtiments peuvent porter la même adresse (cour, annexes) : on garde celui qui touche la rue au point BAN
    const ids=new Map(exacts.map(e=>[e.id,e]));
    const cand=near.filter(n=>ids.has(n.feature.properties?.cleabs));
    if(cand.length){ feature=cand[0].feature; exact=ids.get(feature.properties.cleabs); fallbackDistance=cand[0].distance; }
    else { exact=exacts.slice().sort((a,b)=>(Number(b.record.etages)||0)-(Number(a.record.etages)||0))[0]; feature=await fetchFeatureById(exact.id); }
    if(feature) matchMode='adresse exacte';
  }
  if(!feature){
    if(!near.length) throw new Error('Aucun bâtiment IGN trouvé à moins de 35 m de cette adresse.');
    feature=near[0].feature; fallbackDistance=near[0].distance; exact=null;
  }
  const props=feature.properties||{};
  const rings=ringsOf(feature);
  if(!rings.length) throw new Error('Le bâtiment IGN ne contient pas de polygone exploitable.');
  const facade=facadeFor(point,rings);
  const identity=exact?.record||{};
  const floorData=floorModel(props,identity,floor);
  // repère local du jeu : x = Est, z = -Nord
  const toLocal=P=>[P[0]-CITY.X0,-(P[1]-CITY.Y0)];
  const localFor = f => {
    const F=toLocal(f.point), A=toLocal(f.a), B=toLocal(f.b), n=[f.outward[0],-f.outward[1]];
    const bearing=((Math.atan2(f.outward[0],f.outward[1])*180/Math.PI)+360)%360;
    return {F,A,B,n,bearing,ring:rings[0].map(toLocal)};
  };
  const choices = await facadeRoadChoices(point,rings);
  const facadeChoices = choices.map(c => ({street:c.street,facade:c.facade,local:localFor(c.facade)}));
  return {address:label,street:hit.properties?.street||'',housenumber:hit.properties?.housenumber||'',lon,lat,point,
    feature,identity,exact,matchMode,fallbackDistance,facade,floorData,adjust:0,facadeChoices,
    local:localFor(facade)};
}
export function orientationName(b){
  return ['Nord','Nord-Est','Est','Sud-Est','Sud','Sud-Ouest','Ouest','Nord-Ouest'][Math.round(b/45)%8];
}
