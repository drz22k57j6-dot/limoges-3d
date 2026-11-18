// Test de référence du module soleil : node appart-studio/sun.test.mjs (Node 18+, accès réseau pour les arbres)
import { sunPosition, sunDirection, daySamples, windowSunHours, fetchTrees, leafTransmission, rayHitsCrown } from './sun.js';
const lat=48.8566, lon=2.3522, f=x=>x.toFixed(1);
// 1. midi solaire (≈ 11:58 UTC le 21 juin, 11:49 UTC le 21 déc à Paris)
let best={el:-99}; for(let m=600;m<=780;m++){const d=new Date(Date.UTC(2026,5,21,0,m));const p=sunPosition(d,lat,lon);if(p.el>best.el)best={...p,m};}
console.log('21 juin max élévation', f(best.el), '° (attendu ≈ 64,6) à', Math.floor(best.m/60)+'h'+(best.m%60), 'UTC, azimut', f(best.az),'(attendu ≈180)');
best={el:-99}; for(let m=600;m<=780;m++){const d=new Date(Date.UTC(2026,11,21,0,m));const p=sunPosition(d,lat,lon);if(p.el>best.el)best={...p,m};}
console.log('21 déc max élévation', f(best.el), '° (attendu ≈ 17,8)');
// 2. lever / coucher 21 juin (attendu ≈ 03:47 et 19:58 UTC)
const s=daySamples(new Date(Date.UTC(2026,5,21)),lat,lon,1); const hh=d=>d.toISOString().slice(11,16);
console.log('21 juin lever', hh(s[0].date), 'coucher', hh(s.at(-1).date), 'UTC (attendu ≈ 03:47 / 19:58)');
// 3. directions : matin = soleil à l'Est => x>0 ; midi = Sud => z>0 (−Z = Nord)
const m9=sunPosition(new Date(Date.UTC(2026,5,21,5)),lat,lon); console.log('7h locale az', f(m9.az), 'dir', sunDirection(m9.az,m9.el).map(f).join(','), '(x>0 attendu)');
const noon=sunDirection(180,30); console.log('plein sud dir', noon.map(f).join(','), '(z>0 attendu)');
// 4. fenêtre plein sud sans obstacle vs plein nord
const S=daySamples(new Date(Date.UTC(2026,11,21)),lat,lon,15), J=daySamples(new Date(Date.UTC(2026,5,21)),lat,lon,15);
const pts=[[0,10,0]], none=()=>false;
console.log('Sud 21 déc', f(windowSunHours({points:pts,normal:[0,0,1]},S,none).hours),'h · Nord 21 déc', f(windowSunHours({points:pts,normal:[0,0,-1]},S,none).hours),'h · Sud 21 juin', f(windowSunHours({points:pts,normal:[0,0,1]},J,none).hours),'h');
// 5. immeuble en face (masque horizon 30°) : fenêtre sud en décembre => 0 h
console.log('Sud 21 déc avec masque 30°', f(windowSunHours({points:pts,normal:[0,0,1]},S,(o,d)=>d[1]<Math.sin(30*Math.PI/180)).hours),'h (attendu 0)');
console.log('crown hit', rayHitsCrown([0,0,0],[0,0,1],[0,0,10],2), rayHitsCrown([0,0,0],[0,0,-1],[0,0,10],2), 'transm. juillet/janvier', leafTransmission({caduc:true},new Date(Date.UTC(2026,6,1))), leafTransmission({caduc:true},new Date(Date.UTC(2026,0,1))));
// 6. arbres autour de la rue Cler
const t=await fetchTrees(2.3067,48.8568,150); console.log('arbres à 150 m de la rue Cler :', t.length, t.slice(0,3).map(x=>x.espece+' '+f(x.h)+'m r'+f(x.r)+(x.caduc?' caduc':'')).join(' | '));
