// Sol complet d'une rue droite (moteur de sol) : trottoirs, bordures granit (dessus + face), chaussée avec caniveau,
// passage piéton, et détails parisiens (bouches d'égout, regards, plaques, portes cochères, bandes d'éveil, herbes).
// Repère local : x le long de la rue (−L/2 … L/2), z en travers : façade côté 0 à z = 0, trottoir jusqu'à z = S,
// chaussée de S à S + RD, trottoir d'en face jusqu'à 2S + RD (façade d'en face). y = 0 au pied des façades.
//
//   import { solRue } from './moteur_sol/rue.js';
//   const g = solRue(THREE, MS, VO, { L: 150, S: 3.8, RD: 11, abandon: 0.2, seed: 1, passages: [18] });
//   (MS = createMoteurSol, VO = createVoirie(…, { sol: MS }))

const H_T = 0.14, H_C = 0.02, KW = 0.22;   // hauteur du trottoir, de la chaussée ; largeur de la bordure (m)

export function solRue(T, MS, VO, o) {
  const { L, S, RD } = o, zOpp = 2 * S + RD, passages = o.passages || [];
  let seed = (o.seed || 1) * 7919 + 13; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const G = new T.Group(); G.name = 'sol_rue';
  const SC = { 0: 3, 1: 2.5, 2: 1.2, 3: 3, 4: 1.2 };
  // surface horizontale découpée finement (le shader calcule les détails), aux = coordonnées propres à la matière
  function plan(id, x0, x1, z0, z1, y, auxf, segX = 1, segZ = 1) {
    const g = new T.PlaneGeometry(x1 - x0, z1 - z0, segX, segZ); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    const p = g.attributes.position, uv = g.attributes.uv, aux = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); uv.setXY(i, x / SC[id], -z / SC[id]); if (auxf) { const a = auxf(x, z); aux[2 * i] = a[0]; aux[2 * i + 1] = a[1]; } }
    g.setAttribute('aux', new T.BufferAttribute(aux, 2));
    const m = new T.Mesh(g, VO.material(id)); m.receiveShadow = true; G.add(m); return m;
  }
  // face verticale de bordure côté chaussée (aux = distance le long, hauteur au-dessus du caniveau)
  function face(z, versPlus) {
    const g = new T.PlaneGeometry(L, H_T + 0.01 - H_C, Math.ceil(L), 1); if (!versPlus) g.rotateY(Math.PI); g.translate(0, (H_T + H_C) / 2, z);
    const p = g.attributes.position, uv = g.attributes.uv, aux = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { const a = p.getX(i) + L / 2, h = p.getY(i) - H_C; aux[2 * i] = a; aux[2 * i + 1] = h; uv.setXY(i, a / SC[2], h / SC[2]); }
    g.setAttribute('aux', new T.BufferAttribute(aux, 2));
    const m = new T.Mesh(g, VO.material(2)); m.receiveShadow = true; G.add(m);
  }
  const X0 = -L / 2, X1 = L / 2;
  // trottoirs et bordures
  plan(1, X0, X1, 0, S - KW, H_T); plan(1, X0, X1, S + RD + KW, zOpp, H_T);
  plan(2, X0, X1, S - KW, S, H_T + 0.005); plan(2, X0, X1, S + RD, S + RD + KW, H_T + 0.005);
  face(S, true); face(S + RD, false);
  // chaussée (aux.x = distance à la bordure la plus proche) ; découpée en travers pour un caniveau net
  plan(0, X0, X1, S, S + RD, H_C, (x, z) => [Math.min(z - S, S + RD - z), 0], 1, Math.ceil(RD * 4));
  // passages piétons : bandes de 50 cm parallèles à la rue, sur 4 m
  for (const px of passages) plan(3, px - 2, px + 2, S, S + RD, H_C + 0.006, (x, z) => [z - S, x - px], 1, 1);

  // détails (même format que sol_details.wasm)
  const items = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  const A = a => Math.round(((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * 255);
  const add = (k, x, y, z, a, v = 0, t = 0, s = 100) => items[k].push([x, z, y, A(a), v, t, s]);
  const loin = x => passages.every(p => Math.abs(x - p) > 6);
  const cotes = [{ zk: S, dir: -Math.PI / 2, zf: 0, zfDir: -Math.PI / 2, sgn: 1 }, { zk: S + RD, dir: Math.PI / 2, zf: zOpp, zfDir: Math.PI / 2, sgn: -1 }];
  for (const c of cotes) {
    // bouches d'égout : environ tous les 36 m, au pied de la bordure
    for (let x = X0 + 10 + R() * 12; x < X1 - 3; x += 32 + R() * 10) if (loin(x)) add(0, x, H_C, c.zk + c.sgn * 0.13, c.dir, 0);
    // plaques de réseaux sur le trottoir
    for (let x = X0 + 5 + R() * 15; x < X1 - 3; x += 18 + R() * 16) add(2, x, H_T, c.zf - c.sgn * (0.8 + R() * (S - 1.6)), c.zfDir, Math.floor(R() * 4));
    // regards ronds sur le trottoir (de temps en temps)
    for (let x = X0 + 20 + R() * 30; x < X1 - 3; x += 40 + R() * 20) add(1, x, H_T, c.zf - c.sgn * (S * 0.5 + (R() - 0.5)), R() * 6.3);
    // passages de porte cochère : contre la façade, un tous les ~25 m
    for (let x = X0 + 8 + R() * 10; x < X1 - 3; x += 20 + R() * 14) if (loin(x)) add(6, x, H_T, c.zf - c.sgn * 0.02, c.zfDir, 0);
    // bandes d'éveil de vigilance au droit des passages piétons (dalles de 40 cm, à 50 cm du bord)
    for (const px of passages) for (let x = px - 1.8; x <= px + 1.81; x += 0.4) add(7, x, H_T, c.zk - c.sgn * (KW + 0.5 + 0.2), c.dir);
    // herbes sauvages : pied des murs et joint caniveau / bordure (seuil d'abandon tiré au sort)
    const seuil = () => Math.floor(Math.min(255, (R() * 0.85 + 0.15 * Math.sin(seed)) * 255));
    for (let x = X0 + R(); x < X1; x += 0.5 + R() * 0.7) add(4, x, H_T, c.zf - c.sgn * (0.05 + R() * 0.12), c.zfDir, Math.floor(R() * 4), seuil(), 60 + R() * 80);
    for (let x = X0 + R(); x < X1; x += 0.9 + R() * 1.4) if (loin(x)) add(5, x, H_C, c.zk + c.sgn * (0.03 + R() * 0.08), c.dir, Math.floor(R() * 4), Math.min(255, seuil() + 25), 40 + R() * 60);
  }
  // regards sur la chaussée
  for (let x = X0 + 15 + R() * 20; x < X1 - 3; x += 36 + R() * 16) if (loin(x)) add(1, x, H_C, S + RD * (0.35 + R() * 0.3), R() * 6.3);

  const x0 = -500, z0 = -500, y0 = -10, parts = [];
  for (const k in items) {
    const Lk = items[k].sort((a, b) => a[5] - b[5]), b = new ArrayBuffer(8 + Lk.length * 10), dv = new DataView(b);
    dv.setUint32(0, +k, true); dv.setUint32(4, Lk.length, true);
    Lk.forEach((e, i) => { const q = 8 + i * 10; dv.setUint16(q, Math.round((e[0] - x0) / 1000 * 65535), true); dv.setUint16(q + 2, Math.round((e[1] - z0) / 1000 * 65535), true); dv.setInt16(q + 4, Math.round((e[2] - y0) * 100), true); dv.setUint8(q + 6, e[3]); dv.setUint8(q + 7, e[4]); dv.setUint8(q + 8, e[5]); dv.setUint8(q + 9, Math.min(255, Math.round(e[6]))); });
    parts.push(new Uint8Array(b));
  }
  const all = new Uint8Array(20 + parts.reduce((s, p) => s + p.length, 0)), hv = new DataView(all.buffer);
  hv.setUint32(0, 0x444C4F53, true); hv.setUint32(4, parts.length, true); hv.setFloat32(8, x0, true); hv.setFloat32(12, z0, true); hv.setFloat32(16, y0, true);
  let q = 20; for (const p of parts) { all.set(p, q); q += p.length; }
  for (const m of MS.construire(all.buffer)) G.add(m);
  return G;
}
