import test from 'node:test';import assert from 'node:assert/strict';import {floorBandTransform} from './floorBand.js';
test('le changement d’étage déplace la bande sans reconstruire sa géométrie',()=>{
 const first=floorBandTransform(4,3,3),next=floorBandTransform(7.2,2.7,3);
 assert.equal(first.scaleY,1);assert.equal(first.centerY,5.5);
 assert.ok(Math.abs(next.scaleY-0.9)<1e-10);assert.equal(next.centerY,8.55);
});
test('les hauteurs invalides restent bornées',()=>{
 const t=floorBandTransform(0,0,0);assert.equal(t.scaleY,0);assert.equal(t.centerY,0);
});
