// Rue d'essai du moteur de façades, posée dans le jeu (pelouse du Champ de Mars, dans l'axe Tour Eiffel → École militaire).
// Mêmes paramètres de quartier que moteur_facades/apercu.html. Une seule rue d'essai à la fois.
// v3 : teintes générées par quartier (16e homogène crème, 7e pierre variée, 19e enduits colorés), commerces fermés tagués.
let createKit, buildBuilding;

const QUARTIERS = {
  '7e': { road: 11, side: 3.8, styles: [['classique', 1]], pShop: .45, pClosed: .22, tagP: .45, wear: [.15, .4], wid: [12, 20], seed: 100, verdure: .5,
    teintes: [[0xf6ead2, 5, .04], [0xfbf3e4, 3, .03], [0xe9e2d6, 2, .04], [0xf0dcb8, 1.5, .04], [0xdcd8d0, 1, .03]] },
  '16e': { road: 14, side: 5.5, styles: [['riche', .85], ['classique', .15]], pShop: .18, pClosed: .12, tagP: .15, wear: [.03, .18], wid: [16, 24], seed: 300, verdure: .65,
    teintes: [[0xfaf2e3, 4, .02], [0xf6eddb, 3, .02], [0xfdf8ef, 2, .015]] },
  '19e': { road: 10, side: 3.0, styles: [['modeste', .6], ['classique', .15], ['moderne', .25]], pShop: .65, pClosed: .45, tagP: .85, wear: [.45, .9], wid: [9, 16], seed: 500, verdure: .4,
    teintes: [[0xeee6d6, 3, .05], [0xd9c39e, 2, .06], [0xe2c08e, 1.5, .06], [0xe6c2b6, 1.5, .05], [0xe8da9e, 1.2, .05], [0xbdb9b0, 1.5, .05], [0xe8bfa8, 1, .05], [0xbcc4ae, .8, .05], [0xb9c2c9, .8, .05], [0xf4f1ea, 1.5, .03]] },
};
// teinte d'un immeuble : base pondérée + variation teinte / saturation / clarté
function teinte(T, C, R) {
  let x = R() * C.teintes.reduce((t, e) => t + e[1], 0), e = C.teintes[0]; for (const t of C.teintes) { if ((x -= t[1]) <= 0) { e = t; break; } }
  const c = new T.Color(e[0]); c.offsetHSL((R() - .5) * e[2] * .5, (R() - .5) * e[2] * 2, (R() - .5) * e[2]); return c.getHex();
}

let KIT = null;
export async function buildTestStreet(T, ctx, voirieTex) {
  if (!buildBuilding) ({ createKit, buildBuilding } = await import('./facades.js' + new URL(import.meta.url).search));
  const C = QUARTIERS[ctx] || QUARTIERS['7e'];
  if (!KIT) KIT = createKit(T, new URL('./tex/', import.meta.url).href);
  let seed = C.seed; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => { let x = R(), t = 0; for (const [v, w] of a) { t += w; if (x <= t) return v; } return a[0][0]; };
  const TL = new T.TextureLoader();
  const vt = (n, rep, c = 0xffffff) => { const t = k => { const x = TL.load(voirieTex + n + '_' + k + '.webp'); x.wrapS = x.wrapT = T.RepeatWrapping; x.repeat.set(...rep); x.anisotropy = 8; if (k === 'c') x.colorSpace = T.SRGBColorSpace; return x; }; return new T.MeshStandardMaterial({ map: t('c'), normalMap: t('n'), roughnessMap: t('r'), color: c }); };
  const G = new T.Group(); G.name = 'rue_test';
  const add = (g, m, x, y, z) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); o.receiveShadow = o.castShadow = true; G.add(o); return o; };
  const L = 150, S = C.side, RD = C.road, zOpp = S * 2 + RD;
  // socle (cache la pelouse sous la rue), trottoirs, bordures, chaussée, passage piéton
  add(new T.BoxGeometry(L + 10, .6, zOpp + 30), new T.MeshStandardMaterial({ color: 0x6f6b64, roughness: 1 }), 0, -.31, zOpp / 2);
  add(new T.BoxGeometry(L, .14, S), vt('trottoir', [L / 2.5, S / 2.5], 0xb9b7b3), 0, .07, S / 2);
  add(new T.BoxGeometry(L, .16, .24), vt('bordure', [L / 1.2, .2], 0xcac8c3), 0, .08, S + .12);
  const rd = new T.Mesh(new T.PlaneGeometry(L, RD), vt('chaussee', [L / 3, RD / 3])); rd.rotation.x = -Math.PI / 2; rd.position.set(0, .02, S + RD / 2); rd.receiveShadow = true; G.add(rd);
  add(new T.BoxGeometry(L, .16, .24), vt('bordure', [L / 1.2, .2], 0xcac8c3), 0, .08, S + RD - .12);
  add(new T.BoxGeometry(L, .14, S), vt('trottoir', [L / 2.5, S / 2.5], 0xb9b7b3), 0, .07, S + RD + S / 2);
  const zp = new T.MeshStandardMaterial({ color: 0xd9d8d2, roughness: .6 });
  for (let k = 0; k < Math.floor(RD); k++) { const g = new T.Mesh(new T.PlaneGeometry(4, .5), zp); g.rotation.x = -Math.PI / 2; g.position.set(18, .03, S + .6 + k); G.add(g); }
  // lampadaires et potelets
  const fer = new T.MeshStandardMaterial({ color: 0x22302a, metalness: .5, roughness: .5 }), lan = new T.MeshStandardMaterial({ color: 0xf0e6c8, emissive: 0x221a08, roughness: .3 }), pot = new T.MeshStandardMaterial({ color: 0x3b3326, metalness: .4, roughness: .5 });
  for (const zz of [S - .4, S + RD + .4]) for (let x = -L / 2 + 8; x < L / 2; x += 26) { add(new T.CylinderGeometry(.07, .13, 6.5, 12), fer, x, 3.25, zz); add(new T.CylinderGeometry(.16, .28, .6, 6), lan, x, 6.6, zz); add(new T.ConeGeometry(.32, .3, 6), fer, x, 7.05, zz); }
  for (const zz of [S - .3, S + RD + .3]) for (let x = -L / 2; x < L / 2; x += 1.7) { if (Math.abs(x - 18) < 3) continue; add(new T.CylinderGeometry(.05, .06, .9, 10), pot, x, .55, zz); }
  // immeubles mitoyens des deux côtés
  for (const side of [0, 1]) {
    let x = -L / 2;
    while (x < L / 2 - 6) {
      const w = Math.min(L / 2 - x, C.wid[0] + R() * (C.wid[1] - C.wid[0]));
      const b = buildBuilding(T, KIT, { width: w, seed: 1 + Math.floor(R() * 1e6), style: pick(C.styles), wear: C.wear[0] + R() * (C.wear[1] - C.wear[0]), tone: teinte(T, C, R), pShop: C.pShop, pClosed: C.pClosed, tagP: C.tagP, verdure: C.verdure, depth: 14 });
      if (side === 0) b.position.set(x, 0, 0); else { b.rotation.y = Math.PI; b.position.set(x + w, 0, zOpp); }
      G.add(b); x += w;
    }
  }
  G.userData = { zMid: S + RD / 2, L };
  return G;
}
