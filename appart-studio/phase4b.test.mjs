// Test hors réseau : node --test appart-studio/phase4b.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { daySamples, windowSunHours } from './sun.js';
import { makeBlocker } from './solarAnalysis.js';

test('façade Est : le masque de 30° bloque tous les rayons sous 30°', () => {
  const samples=daySamples(new Date(Date.UTC(2026,5,21)),48.8566,2.3522,15);
  const win={points:[[0,2,0],[0,2.5,0],[0,1.5,0],[0,2,0.3],[0,2,-0.3]],normal:[1,0,0]};
  const masked=windowSunHours(win,samples,(_o,dir)=>Math.asin(Math.max(-1,Math.min(1,dir[1])))*180/Math.PI<30);
  const expectedHours=samples.filter(s=>s.el>=30 && s.dir[0]>0.02).length*15/60;
  assert.equal(masked.hours,expectedHours);
  for(let i=0;i<samples.length;i++) if(samples[i].el<30) assert.equal(masked.minutes[i].frac,0);
  const clear=windowSunHours(win,samples,()=>false);
  assert.ok(clear.hours>masked.hours);
});

test('21 décembre : façade Est et masque de 30° donnent exactement zéro heure', () => {
  const samples=daySamples(new Date(Date.UTC(2026,11,21)),48.8566,2.3522,15);
  const win={points:[[0,2,0],[0,2.5,0],[0,1.5,0],[0,2,0.3],[0,2,-0.3]],normal:[1,0,0]};
  const masked=windowSunHours(win,samples,(_o,dir)=>Math.asin(Math.max(-1,Math.min(1,dir[1])))*180/Math.PI<30);
  assert.equal(masked.hours,0);
});

test('sans obstacle : windowSunHours correspond exactement à isBlocked = () => false', () => {
  const samples=daySamples(new Date(Date.UTC(2026,5,21)),48.8566,2.3522,15);
  const win={points:[[0,2,0],[0,2.5,0],[0,1.5,0],[0,2,0.3],[0,2,-0.3]],normal:[1,0,0]};
  class V3 { set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} normalize(){return this;} }
  class Ray { constructor(origin,direction){this.origin=origin;this.direction=direction;} }
  class Raycaster {}
  const emptyBvh=makeBlocker({Vector3:V3,Ray,Raycaster},null);
  const noWall=windowSunHours(win,samples,emptyBvh);
  const reference=windowSunHours(win,samples,()=>false);
  assert.deepEqual(noWall,reference);
});
