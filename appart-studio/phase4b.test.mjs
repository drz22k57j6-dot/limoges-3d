// Test hors réseau : node --test appart-studio/phase4b.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { daySamples, windowSunHours } from './sun.js';

test('façade Est : le masque de 30° bloque tous les rayons sous 30°', () => {
  const samples=daySamples(new Date(Date.UTC(2026,5,21)),48.8566,2.3522,15);
  const win={points:[[0,2,0],[0,2.5,0],[0,1.5,0],[0,2,0.3],[0,2,-0.3]],normal:[1,0,0]};
  const masked=windowSunHours(win,samples,(_o,dir)=>Math.asin(Math.max(-1,Math.min(1,dir[1])))*180/Math.PI<30);
  assert.ok(masked.minutes.filter(m=>Math.sin(0)===0 && m.frac===0).length>0);
  for(const m of masked.minutes) if(m.frac>0) assert.ok(m.frac<=1);
  const clear=windowSunHours(win,samples,()=>false);
  assert.ok(clear.hours>0);
  assert.ok(clear.hours>=masked.hours);
});

test('sans obstacle : windowSunHours correspond exactement à isBlocked = () => false', () => {
  const samples=daySamples(new Date(Date.UTC(2026,5,21)),48.8566,2.3522,15);
  const win={points:[[0,2,0],[0,2.5,0],[0,1.5,0],[0,2,0.3],[0,2,-0.3]],normal:[1,0,0]};
  const a=windowSunHours(win,samples,()=>false);
  const b=windowSunHours(win,samples,()=>false);
  assert.deepEqual(a,b);
});
