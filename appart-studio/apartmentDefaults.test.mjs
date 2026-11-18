import test from 'node:test';import assert from 'node:assert/strict';import {automaticWindowCount,automaticWindowPositions,requireMinimumDepth,fractionWithinDay} from './apartmentDefaults.js';
test('nombre de fenêtres adapté aux travées de façade',()=>{assert.equal(automaticWindowCount(10),3);assert.equal(automaticWindowCount(4),1);assert.equal(automaticWindowCount(40),8);});
test('fenêtres réparties aux centres des travées avec marge latérale',()=>{const p=automaticWindowPositions(10,3);assert.equal(p.length,3);assert.ok(Math.abs(p[0]-1.8)<1e-9);assert.ok(Math.abs(p[1]-5)<1e-9);assert.ok(Math.abs(p[2]-8.2)<1e-9);});
test('profondeur automatique minimale de 8 mètres',()=>{assert.equal(requireMinimumDepth(8),8);assert.equal(requireMinimumDepth(12),12);assert.throws(()=>requireMinimumDepth(7.99),/8 m/);});

test('le soleil démarre à l’heure réelle du jour courant',()=>{
 assert.equal(fractionWithinDay(150,100,200,true),0.5);
 assert.equal(fractionWithinDay(50,100,200,true),0);
 assert.equal(fractionWithinDay(250,100,200,true),1);
 assert.equal(fractionWithinDay(150,100,200,false),0.5);
});
