import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainToFootprint, floorFitsBuilding, findSafeRectangle, rectangleInsideFootprint } from './footprint.js';

const block=[[[[0,0],[10,0],[10,10],[0,10],[0,0]]]];
const courtyard=[[[[0,0],[12,0],[12,12],[0,12],[0,0]],[[4,4],[8,4],[8,8],[4,8],[4,4]]]];
const apartment=()=>({
  murs:[
    {id:'F',a:[0,0],b:[10,0],facade:true},
    {id:'E',a:[10,0],b:[10,8],ext:true},
    {id:'S',a:[10,8],b:[0,8],ext:true},
    {id:'W',a:[0,8],b:[0,0],ext:true},
  ],
  ouvertures:[{id:'w1',murId:'F',type:'fenetre',centre:[5,0],largeur:1.2}],
  pieces:[{id:'r0',type:'sejour',polygone:[[0,0],[10,0],[10,8],[0,8]]}],
});

test('non-régression : appartement rectangulaire valide conserve murs, pièce et fenêtre',()=>{
  const out=constrainToFootprint(apartment(),block);
  assert.equal(out.murs.length,4);
  assert.equal(out.pieces.length,1);
  assert.equal(out.ouvertures.length,1);
  assert.deepEqual(out.murs[0].a,[0,0]);
  assert.deepEqual(out.murs[0].b,[10,0]);
});
test('non-régression : un mur qui déborde est coupé à l’emprise',()=>{
  const out=constrainToFootprint({murs:[{id:'m',a:[-2,5],b:[12,5]}],ouvertures:[],pieces:[]},block);
  assert.deepEqual(out.murs[0].a,[0,5]);
  assert.deepEqual(out.murs[0].b,[10,5]);
});
test('non-régression : une ouverture coupée par le bord est refusée',()=>{
  const plan={murs:[{id:'F',a:[-2,5],b:[12,5]}],ouvertures:[{id:'w',murId:'F',centre:[-1,5],largeur:1}],pieces:[]};
  assert.throws(()=>constrainToFootprint(plan,block),/ouverture sort/);
});
test('non-régression : une pièce ne peut pas englober une cour IGN',()=>{
  const plan={murs:[],ouvertures:[],pieces:[{polygone:[[2,2],[10,2],[10,10],[2,10]]}]};
  assert.throws(()=>constrainToFootprint(plan,courtyard),/cour/);
});
test('non-régression : un plancher trop haut reste bloqué',()=>{
  assert.equal(floorFitsBuilding({offset:8,height:20},3),true);
  assert.equal(floorFitsBuilding({offset:17.2,height:20},3),false);
});
test('non-régression : enveloppe en L reste intégralement contenue',()=>{
  const L=[[[[0,0],[10,0],[10,4],[4,4],[4,10],[0,10],[0,0]]]];
  const r=findSafeRectangle(L,[0,10],{step:0.1,maxDepth:9});
  assert.ok(r);
  assert.equal(rectangleInsideFootprint(r,L),true);
});
