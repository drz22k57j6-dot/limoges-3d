// Test pur, hors réseau : node --test appart-studio/solarScore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSoleil } from './solarScore.js';

test('seuils A à G',()=>{
  const cases=[[4,'A'],[3,'B'],[2,'C'],[1,'D'],[0.5,'E'],[0.01,'F'],[0,'G']];
  for(const [hours,grade] of cases) assert.equal(scoreSoleil([{type:'sejour',hours:{winter:hours,summer:8}}]).grade,grade);
});

test('prend le meilleur séjour avant toute chambre',()=>{
  const score=scoreSoleil([
    {id:'sejour-1',type:'sejour',hours:{winter:1,summer:5}},
    {id:'sejour-2',type:'sejour',hours:{winter:3.2,summer:7}},
    {id:'chambre',type:'chambre',hours:{winter:6,summer:9}},
  ]);
  assert.equal(score.grade,'B');
  assert.equal(score.room,'sejour-2');
  assert.equal(score.summerHours,7);
});

test('utilise la meilleure chambre si aucun séjour n’existe',()=>{
  const score=scoreSoleil([
    {id:'ch1',type:'chambre',hours:{winter:0.4,summer:4}},
    {id:'ch2',type:'chambre',hours:{winter:2.1,summer:6}},
  ]);
  assert.equal(score.grade,'C');
  assert.equal(score.room,'ch2');
});

test('pas de séjour ni chambre : score indisponible',()=>{
  assert.equal(scoreSoleil([{type:'cuisine',hours:{winter:8}}]).grade,null);
});
