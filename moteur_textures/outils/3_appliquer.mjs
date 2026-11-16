// textures v2 : UV projection boîte (échelle réelle) + décalage aléatoire par plan (casse l'alignement des répétitions)
// + couleurs de sommets : nuances à grande échelle (bruit 3D), salissure en bas, zones abritées plus sombres
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {unweld, weld} from '@gltf-transform/functions';
import fs from 'fs';
const [src, dir, rec, out, grimeJ] = process.argv.slice(2);
const R = JSON.parse(fs.readFileSync(rec, 'utf8')), G = JSON.parse(grimeJ || '{}');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); const d = await io.read(src);
await d.transform(unweld());
const root = d.getRoot(), buf = root.listBuffers()[0], tex = {};
const T = f => { if (!tex[f]) tex[f] = d.createTexture(f).setImage(fs.readFileSync(`${dir}/${f}`)).setMimeType('image/jpeg').setURI(f); return tex[f]; };
for (const mt of root.listMaterials()) {
  const r = R[mt.getName()]; if (!r) continue; const n = mt.getName();
  mt.setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(T(n + '_c.jpg')).setNormalTexture(T(n + '_n.jpg'))
    .setMetallicRoughnessTexture(T(n + '_orm.jpg')).setOcclusionTexture(T(n + '_orm.jpg')).setMetallicFactor(1).setRoughnessFactor(1).setNormalScale(r.type === 'photo' ? 1.0 : 0.6);
}
// bruit de valeur 3D lissé
const hsh = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sm = t => t * t * (3 - 2 * t);
const vn = (x, y, z) => { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = sm(x - X), fy = sm(y - Y), fz = sm(z - Z); let v = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) v += hsh(X + i, Y + j, Z + k) * (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * (k ? fz : 1 - fz); return v; };
let ymin = Infinity, ymax = -Infinity;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) { const P = p.getAttribute('POSITION').getArray(); for (let i = 1; i < P.length; i += 3) { ymin = Math.min(ymin, P[i]); ymax = Math.max(ymax, P[i]); } }
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  const r = R[p.getMaterial().getName()] || { echelle_m: 2, type: 'x' }, s = r.echelle_m, tint = r.type === 'photo' || r.type === 'verdigris' || r.type === 'zinc';
  const P = p.getAttribute('POSITION').getArray(), nv = P.length / 3, UV = new Float32Array(nv * 2), C = new Float32Array(nv * 4).fill(1);
  const I = p.getIndices() ? p.getIndices().getArray() : null, nt = I ? I.length / 3 : nv / 3;
  for (let t = 0; t < nt; t++) {
    const a = I ? I[3 * t] : 3 * t, b = I ? I[3 * t + 1] : 3 * t + 1, c = I ? I[3 * t + 2] : 3 * t + 2;
    const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2], vx = P[3 * c] - P[3 * a], vy = P[3 * c + 1] - P[3 * a + 1], vz = P[3 * c + 2] - P[3 * a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    // plan de la face → décalage UV propre à ce plan (continu sur le plan, différent d'un plan à l'autre)
    const dist = nx * P[3 * a] + ny * P[3 * a + 1] + nz * P[3 * a + 2];
    const key = [Math.round(nx * 8), Math.round(ny * 8), Math.round(nz * 8), Math.round(dist / 1.5)];
    const ou = hsh(key[0] + 17, key[1] * 31 + key[3], key[2] + 7), ov = hsh(key[3] + 3, key[0] * 13 + 5, key[1] + key[2] * 11);
    for (const v of [a, b, c]) { const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
      let u, w; if (ay >= ax && ay >= az) { u = x; w = z; } else if (ax >= az) { u = z; w = y; } else { u = x; w = y; }
      UV[2 * v] = u / s + ou; UV[2 * v + 1] = -w / s + ov;
      if (tint) {
        const h = (y - ymin) / Math.max(1, ymax - ymin);
        let f = 0.9 + 0.14 * vn(x / 9, y / 9, z / 9) + 0.06 * vn(x / 2.5 + 50, y / 2.5, z / 2.5);   // nuances sur plusieurs mètres
        f *= 1 - (G.bas || 0) * Math.max(0, 1 - (y - ymin) / 9);                                     // salissure des 9 premiers mètres
        if (ny < -0.25) f *= 1 - (G.abri || 0);                                                         // dessous et zones abritées de la pluie
        f *= 1 - (G.haut || 0) * h * (ay > 0.6 ? 0 : 1);
        const warm = 1 + (G.chaud || 0) * (vn(x / 6 + 9, y / 6, z / 6) - 0.5);
        C[4 * v] = Math.min(1, f * warm); C[4 * v + 1] = Math.min(1, f); C[4 * v + 2] = Math.min(1, f / warm);
      }
    }
  }
  p.setAttribute('TEXCOORD_0', d.createAccessor().setType('VEC2').setArray(UV).setBuffer(buf));
  p.setAttribute('COLOR_0', d.createAccessor().setType('VEC4').setArray(C).setBuffer(buf));
}
await d.transform(weld());
await io.write(out, d);
console.log('ok', out);
