// exporte la géométrie (repère du modèle, transformations appliquées) par matériau
import {NodeIO} from '@gltf-transform/core';
import fs from 'fs';
const io=new NodeIO(); const d=await io.read(process.argv[2]); const out={};
for(const n of d.getRoot().listNodes()){const m=n.getMesh(); if(!m) continue; const M=n.getWorldMatrix();
  for(const p of m.listPrimitives()){const name=p.getMaterial().getName(); const P=p.getAttribute('POSITION').getArray(), I=p.getIndices().getArray();
    const o=out[name]||(out[name]={P:[],I:[]}); const base=o.P.length/3;
    for(let i=0;i<P.length;i+=3){const x=P[i],y=P[i+1],z=P[i+2]; o.P.push(M[0]*x+M[4]*y+M[8]*z+M[12], M[1]*x+M[5]*y+M[9]*z+M[13], M[2]*x+M[6]*y+M[10]*z+M[14]);}
    for(const i of I) o.I.push(i+base);}}
fs.writeFileSync(process.argv[3],JSON.stringify(out));
