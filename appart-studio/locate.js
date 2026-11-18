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
function polygonsOf(feature){const g=feature.geometry;if(!g)return [];if(g.type==='Polygon')return [g.coordinates];if(g.type==='MultiPolygon')return g.coordinates;return [];}
function ringsOf(feature){return polygonsOf(feature).flat();}
function insideGeometry(p,polys){return polys.some(poly=>poly.length&&pointInRing(p[0],p[1],poly[0])&&!poly.slice(1).some(r=>pointInRing(p[0],p[1],r)));}
function facadeFor(point,polygons){
  let best=null;for(let pi=0;pi<polygons.length;pi++)for(let ri=0;ri<polygons[pi].length;ri++){const ring=polygons[pi][ri];for(let i=0;i<ring.length-1;i++){const h=nearestOnSegment(point,ring[i],ring[i+1]);if(!best||h.d<best.d)best={...h,a:ring[i],b:ring[i+1],ring,polygonIndex:pi,ringIndex:ri};}}
  if(!best)throw new Error('Emprise IGN sans arête exploitable.');const inside=insideGeometry(point,polygons);let outward;
  if(!inside)outward=[point[0]-best.q[0],point[1]-best.q[1]];else{const c=best.ring.reduce((s,p)=>[s[0]+p[0]/best.ring.length,s[1]+p[1]/best.ring.length],[0,0]);outward=[best.q[0]-c[0],best.q[1]-c[1]];}
  let L=Math.hypot(...outward);if(L<0.01){outward=[best.b[1]-best.a[1],best.a[0]-best.b[0]];L=Math.hypot(...outward)||1;}outward=outward.map(v=>v/L);
  return {point:best.q,a:best.a,b:best.b,outward,edgeAngle:Math.atan2(best.b[1]-best.a[1],best.b[0]-best.a[0]),distance:best.d,inside,ringIndex:best.ringIndex,polygonIndex:best.polygonIndex};
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
function distToFeature(point,f){const polys=polygonsOf(f);if(!polys.length)return Infinity;if(insideGeometry(point,polys))return 0;let dd=Infinity;for(const poly of polys)for(const ring of poly)for(let i=0;i<ring.length-1;i++)dd=Math.min(dd,nearestOnSegment(point,ring[i],ring[i+1]).d);return dd;}
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
export function setApartmentFloor(res, floor) {
  const props = res.feature?.properties || {};
  res.floorData = floorModel(props, res.identity || {}, floor);
  res.snap = null;
  return res.floorData;
}

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
  const polygons=polygonsOf(feature);
  if(!polygons.length) throw new Error('Le bâtiment IGN ne contient pas de polygone exploitable.');
  const facade=facadeFor(point,polygons);
  const identity=exact?.record||{};
  const candidateIds=new Set(exacts.map(e=>e.id));for(const item of near)if(item.distance<15)candidateIds.add(item.feature.properties?.cleabs);
  const candidateCount=[...candidateIds].filter(Boolean).length;
  const floorData=floorModel(props,identity,floor);
  // repère local du jeu : x = Est, z = -Nord
  const toLocal=P=>[P[0]-CITY.X0,-(P[1]-CITY.Y0)];
  const F=toLocal(facade.point), A=toLocal(facade.a), B=toLocal(facade.b);
  const n=[facade.outward[0],-facade.outward[1]];               // normale sortante (vers la rue), repère local
  const bearing=((Math.atan2(facade.outward[0],facade.outward[1])*180/Math.PI)+360)%360;
  return {address:label,street:hit.properties?.street||'',housenumber:hit.properties?.housenumber||'',lon,lat,point,
    feature,identity,exact,matchMode,fallbackDistance,facade,floorData,adjust:0,
    local:{F,A,B,n,bearing,ring:polygons[0][0].map(toLocal),footprints:polygons.map(poly=>poly.map(ring=>ring.map(toLocal)))},candidateCount};
}
export function orientationName(b){
  return ['Nord','Nord-Est','Est','Sud-Est','Sud','Sud-Ouest','Ouest','Nord-Ouest'][Math.round(b/45)%8];
}
