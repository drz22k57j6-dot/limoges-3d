// Rue d'essai du moteur de façades, posée dans le jeu (pelouse du Champ de Mars, dans l'axe Tour Eiffel → École militaire).
// Mêmes paramètres de quartier que moteur_facades/apercu.html. Une seule rue d'essai à la fois.
// v3 : teintes générées par quartier (16e homogène crème, 7e pierre variée, 19e enduits colorés), commerces fermés tagués.
let createKit, buildBuilding;
import { solRue } from '../moteur_sol/rue.js';

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

// Plaque de rue parisienne en émail bleu et vert, inspirée du modèle historique.
function plaqueRue(T) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const path = (x, y, w, h) => {
    g.beginPath(); g.moveTo(x + 12, y + h); g.lineTo(x + 12, y + 42);
    g.quadraticCurveTo(x + 12, y + 8, x + w / 2, y + 8);
    g.quadraticCurveTo(x + w - 12, y + 8, x + w - 12, y + 42);
    g.lineTo(x + w - 12, y + h); g.closePath();
  };
  path(8, 4, 496, 248); g.fillStyle = '#2E5E3E'; g.fill();
  path(17, 13, 478, 230); g.fillStyle = '#1F3A6B'; g.fill();
  path(23, 19, 466, 218); g.strokeStyle = '#f4f1e8'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '600 38px Arial'; g.fillText('7e Arrt.', 256, 66);
  g.font = '700 58px Arial'; g.fillText('RUE CLER', 256, 158);
  g.fillStyle = '#2E5E3E';
  for (const [x, y] of [[35, 35], [477, 35], [35, 225], [477, 225]]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new T.MeshStandardMaterial({ map: tex, roughness: .24, metalness: .12, side: T.DoubleSide });
  return new T.Mesh(new T.PlaneGeometry(.76, .38), mat);
}

let KIT = null;
// sol : { MS, VO } (moteur_sol) facultatif — s'il est fourni, le sol de la rue vient du moteur de sol
const ABANDON = { '7e': 0.18, '16e': 0.04, '19e': 0.75 };
export async function buildTestStreet(T, ctx, voirieTex, sol) {
  const qv = new URL(import.meta.url).search;
  if (!buildBuilding) ({ createKit, buildBuilding } = await import('./facades.js' + qv));
  // commerces réels (APUR BDCOM 2023) de la rue modèle du quartier : chaque immeuble reprend une adresse réelle, dans l'ordre
  const [{ buildShop }, { H }, REEL] = await Promise.all([import('./commerces.js' + qv), import('./facades.js' + qv), fetch(new URL('./data/commerces_rues_test.json' + qv, import.meta.url)).then(r => r.json()).catch(() => null)]);
  const rue = REEL?.[ctx];
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
  if (sol) { sol.MS.abandon = ABANDON[ctx] ?? 0.2; const g = solRue(T, sol.MS, sol.VO, { L, S, RD, seed: C.seed, passages: [18] }); g.traverse(n => { if (n.isMesh) n.castShadow = false; }); G.add(g); }
  else {
    add(new T.BoxGeometry(L, .14, S), vt('trottoir', [L / 2.5, S / 2.5], 0xb9b7b3), 0, .07, S / 2);
    add(new T.BoxGeometry(L, .16, .24), vt('bordure', [L / 1.2, .2], 0xcac8c3), 0, .08, S + .12);
    const rd = new T.Mesh(new T.PlaneGeometry(L, RD), vt('chaussee', [L / 3, RD / 3])); rd.rotation.x = -Math.PI / 2; rd.position.set(0, .02, S + RD / 2); rd.receiveShadow = true; G.add(rd);
    add(new T.BoxGeometry(L, .16, .24), vt('bordure', [L / 1.2, .2], 0xcac8c3), 0, .08, S + RD - .12);
    add(new T.BoxGeometry(L, .14, S), vt('trottoir', [L / 2.5, S / 2.5], 0xb9b7b3), 0, .07, S + RD + S / 2);
    const zp = new T.MeshStandardMaterial({ color: 0xd9d8d2, roughness: .6 });
    for (let k = 0; k < Math.floor(RD); k++) { const g = new T.Mesh(new T.PlaneGeometry(4, .5), zp); g.rotation.x = -Math.PI / 2; g.position.set(18, .03, S + .6 + k); G.add(g); }
  }
  // lampadaires et potelets
  const fer = new T.MeshStandardMaterial({ color: 0x22302a, metalness: .5, roughness: .5 }), lan = new T.MeshStandardMaterial({ color: 0xf0e6c8, emissive: 0x221a08, roughness: .3 }), pot = new T.MeshStandardMaterial({ color: 0x3b3326, metalness: .4, roughness: .5 });
  {   // lampadaires parisiens détaillés : candélabres (7e), doubles crosses (16e), consoles murales (19e)
    const { lampadaires } = await import('./lampadaires.js' + qv);
    const LP = lampadaires(T, { usure: { '7e': .45, '16e': .25, '19e': .8 }[ctx] ?? .5, stickers: { '7e': 1.1, '16e': .5, '19e': 1.5 }[ctx] ?? 1, seed: C.seed + 7 });
    if (ctx === '19e') for (const [zz, d] of [[0, 1], [zOpp, -1]]) for (let x = -L / 2 + 10 + (d < 0 ? 11 : 0); x < L / 2; x += 22) LP.console(R, x, 5.6, zz + d * .05, d);
    else for (const [zz, o] of [[S - .5, 0], [S + RD + .5, 12]]) for (let x = -L / 2 + 6 + o; x < L / 2; x += 24) LP.candelabre(R, x, zz, { double: ctx === '16e', hauteur: ctx === '16e' ? 4.6 : 4.0, velo: .2 });
    G.add(LP.finir());
  }
  for (const zz of [S - .3, S + RD + .3]) for (let x = -L / 2; x < L / 2; x += 1.7) { if (Math.abs(x - 18) < 3) continue; add(new T.CylinderGeometry(.05, .06, .9, 10), pot, x, .55, zz); }
  // immeubles mitoyens des deux côtés
  const bati = (side, x, w, extra) => {
    const st0 = pick(C.styles);
    const b = buildBuilding(T, KIT, { width: w, seed: 1 + Math.floor(R() * 1e6), style: st0, trottoir: S, wear: C.wear[0] + R() * (C.wear[1] - C.wear[0]), tone: teinte(T, C, R), pShop: C.pShop, pClosed: C.pClosed, tagP: C.tagP, verdure: C.verdure, depth: 14, ...extra });
    if (side === 0) b.position.set(x, 0, 0); else { b.rotation.y = Math.PI; b.position.set(x + w, 0, zOpp); }
    G.add(b);
  };
  if (rue?.cotes?.[0]?.[0]?.x0 !== undefined) {
    // façades réelles : largeur = front de parcelle cadastrale, commerces à leur position réelle, trous = rues transversales
    const chaus = vt('chaussee', [4, 4], 0x9a9a9a);
    for (const side of [0, 1]) {
      let fin = 0;
      for (const e of rue.cotes[side]) {
        const shops = e.shops.map((s, k) => ({ type: s.t, nom: s.nom, u: s.u, id: e.nums[0] + '-' + k }));
        const st = shops.length && C.styles.some(([v]) => v === 'moderne') && R() < .2 ? 'modeste' : undefined;
        bati(side, -L / 2 + e.x0, e.w, { shops, shopBuilder: buildShop, numero: e.nums.join('-'), ...(st ? { style: st } : {}), ...(e.w > 35 && !shops.length ? { style: "moderne" } : {}) });
        if (e.x0 - fin > 4) {   // rue transversale : chaussée qui s'enfonce dans l'îlot
          const gw = e.x0 - fin, gx = -L / 2 + fin + gw / 2;
          add(new T.PlaneGeometry(gw, 40).rotateX(-Math.PI / 2), chaus, gx, .02, side === 0 ? -20 : zOpp + 20);
          // immeubles qui bordent la rue transversale (vue en profondeur, pas de vide)
          const xa = -L / 2 + fin, xb = -L / 2 + e.x0, sg = side === 0 ? -1 : 1, z0 = side === 0 ? 0 : zOpp;
          for (const [px, rot] of [[xa, Math.PI / 2], [xb, -Math.PI / 2]]) {
            const b = buildBuilding(T, KIT, { width: 22, seed: 1 + Math.floor(R() * 1e6), style: pick(C.styles), wear: C.wear[0] + R() * (C.wear[1] - C.wear[0]), tone: teinte(T, C, R), shops: [], verdure: C.verdure, depth: 12 });
            const zs = z0 + sg * 2.6, ze = z0 + sg * 24.6;
            b.rotation.y = rot === Math.PI / 2 ? (side === 0 ? Math.PI / 2 : Math.PI / 2) : -Math.PI / 2;
            // rot +π/2 : façade vers +x, longueur vers -z ; rot -π/2 : façade vers -x, longueur vers +z
            b.position.set(px + (rot > 0 ? .06 : -.06), 0, rot > 0 ? Math.max(zs, ze) : Math.min(zs, ze));
            G.add(b);
          }
        }
        fin = e.x0 + e.w;
      }
    }
  } else for (const side of [0, 1]) {
    let x = -L / 2; const file = rue ? rue.cotes[side].slice() : null;
    while (x < L / 2 - 6) {
      const w = Math.min(L / 2 - x, C.wid[0] + R() * (C.wid[1] - C.wid[0]));
      const adr = file?.shift(), shops = adr ? adr.shops.map((s, k) => ({ type: s.t, nom: s.nom, id: adr.num + '-' + k })) : undefined;
      bati(side, x, w, { shops, shopBuilder: rue ? buildShop : undefined, numero: adr?.num });
      x += w;
    }
  }
  // Plaques « Rue Cler » aux deux extrémités, à hauteur de regard depuis la rue.
  for (const side of [0, 1]) {
    const z = side === 0 ? .07 : zOpp - .07;
    for (const x of [-L / 2 + 3.2, L / 2 - 3.2]) {
      const back = new T.Mesh(new T.BoxGeometry(.8, .42, .035), new T.MeshStandardMaterial({ color: 0x2E5E3E, metalness: .2, roughness: .35 }));
      back.position.set(x, 3.0, z); if (side === 1) back.rotation.y = Math.PI; G.add(back);
      const sign = plaqueRue(T); sign.position.set(x, 3.0, z + (side === 0 ? .021 : -.021));
      if (side === 1) sign.rotation.y = Math.PI; G.add(sign);
    }
  }
  G.userData = { zMid: S + RD / 2, L };
  return G;
}
