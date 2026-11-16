// Générateur d'immeubles parisiens v2 — vrai relief, dimensions réelles, variantes par graine.
// Styles : 'riche' (16e : bow-windows, frontons, refends profonds), 'classique' (7e), 'modeste' (19e faubourien :
// enduit, persiennes), 'moderne' (années 70, béton). RDC : commerces ou habitation (fenêtres + porte d'entrée).
// Usure 0..1 (salissures verticales, encrassement du pied de façade, taches) appliquée dans le shader.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const NOISE = `
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return .5*vn(p)+.25*vn(p*2.03)+.125*vn(p*4.01)+.0625*vn(p*8.);}`;

export function createKit(T, base) {
  const TL = new T.TextureLoader(), cache = {};
  const tex = (n, srgb) => { if (cache[n]) return cache[n]; const t = TL.load(base + n + '.jpg'); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = T.SRGBColorSpace; return (cache[n] = t); };
  const set = n => ({ map: tex(n + '_c', true), normalMap: tex(n + '_n'), roughnessMap: tex(n + '_r') });
  const walls = new Map();
  // matériau de mur avec usure (une instance par immeuble : teinte + niveau d'usure)
  function wall(kind, tone, wear, key) {
    const k = kind + tone + ':' + wear.toFixed(2) + (key || ''); if (walls.has(k)) return walls.get(k);
    const m = new T.MeshStandardMaterial({ ...set(kind), color: tone, roughness: 1 });
    const U = { uWear: { value: wear } };
    m.onBeforeCompile = sh => {
      sh.uniforms.uWear = U.uWear;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform float uWear;' + NOISE)
        .replace('#include <color_fragment>', `#include <color_fragment>
        { vec2 c=vec2(vWP.x+vWP.z*.7, vWP.y);
          float patchy=fbm(c*.22);                                   // taches et reprises de ravalement
          diffuseColor.rgb*=mix(1., .80+.32*patchy, .25+uWear*.75);
          float st=fbm(vec2(c.x*2.2, c.y*.07+3.));                     // coulures verticales sous les appuis
          diffuseColor.rgb*=1.-uWear*.42*smoothstep(.42,.86,st);
          diffuseColor.rgb*=1.-uWear*.30*(1.-smoothstep(.2,3.8,vWP.y));// encrassement du pied de façade
          float soot=fbm(c*1.6+9.); diffuseColor.rgb*=1.-uWear*.18*smoothstep(.55,.9,soot);
          diffuseColor.rgb=mix(diffuseColor.rgb, diffuseColor.rgb*vec3(.84,.80,.73), uWear*.55); }`);
    };
    m.customProgramCacheKey = () => 'mur_usure';
    walls.set(k, m); return m;
  }
  const std = o => new T.MeshStandardMaterial(o);
  const M = {
    wall, set,
    zinc: new T.MeshStandardMaterial({ ...set('zinc'), color: 0x8a97a2, metalness: .6, roughness: .5 }),
    fonte: std({ color: 0x141619, metalness: .65, roughness: .42 }),
    zincTube: std({ color: 0x80878b, metalness: .35, roughness: .55 }),
    verres: [0x0a0e11, 0x0c1218, 0x10151a].map((c, i) => std({ color: c, metalness: .85, roughness: [.04, .08, .14][i], envMapIntensity: .62 })),
    vitre: std({ color: 0x9fb0b8, metalness: .2, roughness: .05, transparent: true, opacity: .28, envMapIntensity: .8, depthWrite: false }),
    menuiserie: std({ color: 0xefebe2, roughness: .5 }),
    menuiserieGris: std({ color: 0xbfc3c3, roughness: .5 }),
    rideau: std({ color: 0xe6dfd2, roughness: .95, side: T.DoubleSide }),
    rideauTire: std({ color: 0xd8cdb8, roughness: .95, side: T.DoubleSide }),
    interieur: std({ color: 0x2e2722, roughness: 1 }),
    interieurClair: std({ color: 0x6d5c4b, roughness: 1, emissive: 0x2a1a08 }),
    vitrineLum: std({ color: 0x8a6e4c, roughness: 1, emissive: 0x6a4a22, emissiveIntensity: .8 }),
    terre: std({ color: 0xa65a3a, roughness: .8 }),
    plaque: std({ color: 0x1b3f8f, roughness: .3 }),
    persienne: [0xd9d6cf, 0x8b9399, 0x5d6b5a].map(c => std({ color: c, roughness: .6 })),
    portes: [0x1f3a2e, 0x4a1c22, 0x1b2740, 0x3b2a1c, 0x2a2a2a].map(c => std({ color: c, roughness: .45, metalness: .05 })),
    vitrines: [0x1d3b2f, 0x5a1f24, 0x1e2a44, 0x2b2b2b, 0x6b5a3a, 0x24443f].map(c => std({ color: c, roughness: .4, metalness: .1 })),
  };
  return M;
}

// ------------------------------------------------------------------ outils géométriques
function uvWorld(g, S) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    uv.setXY(i, (ax > .5 ? p.getZ(i) : p.getX(i)) / S, (ay > .5 ? p.getZ(i) : p.getY(i)) / S);
  }
  return g;
}
const box = (T, w, h, d, x, y, z, S = 2.4) => uvWorld(new T.BoxGeometry(w, h, d).translate(x, y, z), S);
function extrudeX(T, shape, len, x0, y, z) {
  const g = new T.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 6 });
  g.rotateY(-Math.PI / 2); g.translate(x0 + len, y, z);
  const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2.4, (p.getY(i) + p.getZ(i)) / 2.4);
  return g;
}
const rng = s => () => (s = (s * 16807 + 11) % 2147483647) / 2147483647;
function moulure(T, d, h) {
  const s = new T.Shape(); s.moveTo(0, 0); s.lineTo(d * .22, 0); s.quadraticCurveTo(d * .3, h * .3, d * .52, h * .4);
  s.lineTo(d * .56, h * .55); s.lineTo(d * .62, h * .58); s.quadraticCurveTo(d * .95, h * .62, d, h * .88); s.lineTo(d, h); s.lineTo(0, h); s.closePath();
  return s;
}
function rail(T, arr, x0, x1, y, h, z, orne) {
  arr.push(box(T, x1 - x0, .055, .06, (x0 + x1) / 2, y + h, z));
  arr.push(box(T, x1 - x0, .04, .04, (x0 + x1) / 2, y + .07, z));
  arr.push(box(T, x1 - x0, .022, .022, (x0 + x1) / 2, y + h * .74, z));
  arr.push(box(T, x1 - x0, .022, .022, (x0 + x1) / 2, y + h * .5, z));
  for (let x = x0 + .055; x < x1; x += .105) arr.push(box(T, .015, h * .43, .015, x, y + .07 + h * .215, z));
  const step = orne ? .2 : .26;
  for (let x = x0 + .12; x < x1 - .05; x += step) {
    const t = new T.TorusGeometry(orne ? .072 : .08, .01, 5, 14); t.translate(x, y + h * .62, z); arr.push(t);
    if (orne) { const t2 = new T.TorusGeometry(.03, .008, 4, 10); t2.translate(x + step / 2, y + h * .62, z); arr.push(t2); }
  }
  const n = Math.max(1, Math.ceil((x1 - x0) / 1.4)); for (let k = 0; k <= n; k++) arr.push(box(T, .045, h, .045, x0 + (x1 - x0) * k / n, y + h / 2, z));
}
const M4 = (T, ang, x, y, z) => new T.Matrix4().makeRotationY(ang).setPosition(x, y, z);

// ------------------------------------------------------------------ fenêtre (vantaux ouvrables, verre réfléchissant, rideaux, intérieur)
function windowUnit(T, G, R, cx, ys, ww, wh, REC, o = {}) {
  const z = -REC + .07, fw = .055, open = R() < (o.pOpen ?? .12), ang = open ? (1.0 + R() * .7) : 0;
  const vi = Math.floor(R() * 3), deep = o.deep ?? 1.6;
  // intérieur : fond, plafond sombre, parfois lumière chaude
  (R() < .12 ? G.intC : G.inter).push(box(T, ww + .4, wh, .02, cx, ys + wh / 2, -REC - deep));
  G.inter.push(box(T, ww + .4, .02, deep, cx, ys + wh - .01, -REC - deep / 2));
  // rideaux : voilages de chaque côté, parfois tirés
  const cr = R();
  if (cr < .65) { const cw = ww * (.22 + R() * .12); G.rid.push(box(T, cw, wh * .95, .02, cx - ww / 2 + cw / 2 + .04, ys + wh * .5, -REC - .14)); G.rid.push(box(T, cw, wh * .95, .02, cx + ww / 2 - cw / 2 - .04, ys + wh * .5, -REC - .14)); }
  else if (cr < .8) G.ridT.push(box(T, ww - .1, wh * .95, .02, cx, ys + wh * .5, -REC - .14));
  // deux vantaux à petits bois (3 carreaux en hauteur) + imposte
  const imp = wh > 2 ? .45 : 0, lh = wh - imp, lw = ww / 2;
  for (const side of [-1, 1]) {
    const hx = cx + side * ww / 2, a = side < 0 ? ang : -ang;
    const parts = [], glass = [];
    const lx = side < 0 ? 0 : -lw;   // repère local du vantail : charnière en x=0
    parts.push(box(T, lw, fw, .05, lx + lw / 2, fw / 2, 0)); parts.push(box(T, lw, fw, .05, lx + lw / 2, lh - fw / 2, 0));
    parts.push(box(T, fw, lh, .05, lx + fw / 2, lh / 2, 0)); parts.push(box(T, fw, lh, .05, lx + lw - fw / 2, lh / 2, 0));
    for (let k = 1; k < 3; k++) parts.push(box(T, lw, .025, .035, lx + lw / 2, lh * k / 3, 0));
    glass.push(box(T, lw - fw, lh - fw, .008, lx + lw / 2, lh / 2, -.005));
    const mt = M4(T, a, hx, ys, z);
    for (const g of parts) G.menu.push(g.applyMatrix4(mt));
    for (const g of glass) G['verre' + vi].push(g.applyMatrix4(mt));
  }
  if (imp) { G.menu.push(box(T, ww, fw, .06, cx, ys + lh, z)); G['verre' + vi].push(box(T, ww - fw, imp - fw, .008, cx, ys + lh + imp / 2, z - .005)); G.menu.push(box(T, fw * .6, imp, .05, cx, ys + lh + imp / 2, z)); }
  G.menu.push(box(T, ww + .02, .05, .1, cx, ys + .02, z + .02));   // pièce d'appui
}

// ------------------------------------------------------------------ immeuble
export function buildBuilding(T, M, o) {
  const R = rng(o.seed || 7), style = o.style || 'classique';
  if (style === 'moderne') return buildModern(T, M, o, R);
  const W = o.width, D = o.depth || 12, wear = o.wear ?? .3;
  const B = o.bays || Math.max(3, Math.round(W / (style === 'modeste' ? 2.4 : 2.6))), bw = W / B;
  const commerce = o.rdc ? o.rdc === 'commerce' : R() < (o.pShop ?? .5);
  const jit = () => (R() - .5) * .3;
  let F;
  if (style === 'riche') F = commerce ? [4.3 + jit(), 2.6, 3.5 + jit(), 3.2, 3.1, 3.0, 2.8] : [4.6 + jit(), 3.5 + jit(), 3.2, 3.1, 3.0, 2.8];
  else if (style === 'modeste') { const n = 5 + Math.floor(R() * 2); F = [3.4 + jit()]; for (let i = 0; i < n; i++) F.push(2.75 + jit() * .5); }
  else F = commerce ? [4.0 + jit(), 2.7, 3.4 + jit(), 3.1, 3.0, 2.8] : [4.2 + jit(), 3.4 + jit(), 3.1, 3.0, 2.85];
  const ent = commerce && style !== 'modeste';   // entresol au-dessus des boutiques
  const nobleF = ent ? 2 : 1, lastF = F.length - 1;
  const tone = new T.Color(o.tone || 0xffffff);
  const kind = style === 'modeste' ? 'enduit' : 'pierre';
  const G = { mur: [], rdc: [], moul: [], zinc: [], fonte: [], menu: [], rid: [], ridT: [], inter: [], intC: [], terre: [], tube: [], plaque: [], verre0: [], verre1: [], verre2: [], lum: [], vit: [] };
  const extra = [];   // [géométrie, matériau] propres (portes, vitrines, enseignes, persiennes)
  const REC = style === 'riche' ? .34 : .28, winW = Math.min(1.3, bw * .48);
  const yF = []; let y = 0; for (const h of F) { yF.push(y); y += h; } const Htop = y;
  G.mur.push(box(T, W, Htop, D - REC, W / 2, Htop / 2, -REC - (D - REC) / 2));
  const shopName = ['BOULANGERIE', 'PHARMACIE', 'CAFÉ', 'TABAC', 'FLEURS', 'PRESSING', 'LIBRAIRIE', 'OPTIQUE', 'BOUCHERIE', 'FROMAGERIE', 'ÉPICERIE', 'RESTAURANT', 'CAVE À VINS', 'IMMOBILIER', 'COIFFURE', 'BISTROT'];
  const doorBay = Math.min(B - 1, Math.floor(B / 2) + (R() < .5 ? 0 : (R() < .5 ? -1 : 1)));
  const oriel = style === 'riche' && B >= 5 && R() < .75;
  const orielBays = oriel ? (B % 2 ? [Math.floor(B / 2)] : [B / 2 - 1, B / 2]) : [];

  for (let f = 0; f < F.length; f++) {
    const y0 = yF[f], h = F[f];
    const base = f === 0 || (ent && f === 1);
    if (ent && f === 1) continue;
    const hh = (ent && f === 0) ? F[0] + F[1] : h, gArr = base ? G.rdc : G.mur;
    for (let b = 0; b < B; b++) {
      const cx = (b + .5) * bw;
      let ww, wh, sill;
      if (base && commerce) { ww = bw * .8; wh = F[0] - .3; sill = .25; }
      else if (base) { ww = b === doorBay ? Math.min(1.9, bw * .7) : winW; wh = b === doorBay ? F[0] * .82 : F[0] * .6; sill = b === doorBay ? .12 : F[0] * .25; }
      else { ww = winW; wh = h * (f === nobleF ? .7 : .66) ; sill = h * .12; if (f === lastF && style !== 'modeste') wh = h * .62; }
      const pierW = (bw - ww) / 2, top = y0 + sill + wh;
      gArr.push(box(T, pierW, hh, REC, cx - ww / 2 - pierW / 2, y0 + hh / 2, -REC / 2));
      gArr.push(box(T, pierW, hh, REC, cx + ww / 2 + pierW / 2, y0 + hh / 2, -REC / 2));
      gArr.push(box(T, ww, sill, REC, cx, y0 + sill / 2, -REC / 2));
      if (ent && f === 0) {   // linteau de devanture + fenêtre d'entresol
        const e0 = F[0] + .35, e1 = F[0] + F[1] - .45, ew = ww * .62;
        gArr.push(box(T, ww, e0 - top, REC, cx, (top + e0) / 2, -REC / 2));
        gArr.push(box(T, ww, y0 + hh - e1, REC, cx, (e1 + y0 + hh) / 2, -REC / 2));
        gArr.push(box(T, (ww - ew) / 2, e1 - e0, REC, cx - ww / 2 + (ww - ew) / 4, (e0 + e1) / 2, -REC / 2));
        gArr.push(box(T, (ww - ew) / 2, e1 - e0, REC, cx + ww / 2 - (ww - ew) / 4, (e0 + e1) / 2, -REC / 2));
        windowUnit(T, G, R, cx, e0, ew, e1 - e0, REC, { pOpen: .05, deep: .8 });
      } else gArr.push(box(T, ww, y0 + hh - top, REC, cx, (top + y0 + hh) / 2, -REC / 2));
      if (base) {
        // refends profonds sur les trumeaux du rez-de-chaussée
        if (style !== 'modeste') for (let yy = .42; yy < hh - .15; yy += .42) { G.rdc.push(box(T, pierW + .002, .05, .03, cx - ww / 2 - pierW / 2, yy, .005)); G.rdc.push(box(T, pierW + .002, .05, .03, cx + ww / 2 + pierW / 2, yy, .005)); }
        if (commerce) shopFront(T, G, extra, M, R, cx, y0 + sill, ww, wh, REC, shopName[Math.floor(R() * shopName.length)], b === doorBay && R() < .5);
        else if (b === doorBay) entryDoor(T, G, extra, M, R, cx, y0 + sill, ww, wh, REC, o.numero ?? (2 + Math.floor(R() * 60)));
        else { windowUnit(T, G, R, cx, y0 + sill, ww, wh, REC, { pOpen: .03 }); for (let x = cx - ww / 2 + .08; x < cx + ww / 2; x += .14) G.fonte.push(box(T, .02, wh * .55, .02, x, y0 + sill + wh * .28, -.04)); G.fonte.push(box(T, ww, .03, .03, cx, y0 + sill + wh * .55, -.04)); }
        continue;
      }
      if (orielBays.includes(b) && f >= nobleF && f < lastF) continue;   // bow-window traité à part
      windowUnit(T, G, R, cx, y0 + sill, ww, wh, REC, { pOpen: o.pOpen ?? .1 });
      // encadrement
      const cw = style === 'modeste' ? .09 : .13, cz = style === 'modeste' ? .025 : .045;
      G.moul.push(box(T, cw, wh + cw, cz, cx - ww / 2 - cw / 2, y0 + sill + (wh + cw) / 2, cz / 2));
      G.moul.push(box(T, cw, wh + cw, cz, cx + ww / 2 + cw / 2, y0 + sill + (wh + cw) / 2, cz / 2));
      G.moul.push(box(T, ww + 2 * cw, cw, cz, cx, y0 + sill + wh + cw / 2, cz / 2));
      if (style === 'modeste') {   // persiennes ouvertes contre la façade (parfois fermées)
        const pm = M.persienne[Math.floor((o.seed || 1) % 3)], closed = R() < .12;
        for (const sd of [-1, 1]) {
          const pw = ww / 2, px = closed ? cx + sd * pw / 2 : cx + sd * (ww / 2 + cw + pw / 2 + .02), pz = closed ? -REC + .16 : .04;
          extra.push([box(T, pw - .02, wh, .035, px, y0 + sill + wh / 2, pz), pm]);
          for (let yy = y0 + sill + .1; yy < y0 + sill + wh - .05; yy += .09) extra.push([box(T, pw - .06, .018, .02, px, yy, pz + .025), pm]);
        }
        continue;
      }
      if (f === nobleF) {   // étage noble : frontons alternés, consoles
        const tri = b % 2 === 0, pw = ww / 2 + .3, s = new T.Shape();
        if (tri) { s.moveTo(-pw, 0); s.lineTo(pw, 0); s.lineTo(0, .45); s.closePath(); } else { s.moveTo(-pw, 0); s.lineTo(pw, 0); s.absarc(0, 0, pw, 0, Math.PI, false); s.closePath(); }
        const pg = new T.ExtrudeGeometry(s, { depth: .16, bevelEnabled: false, curveSegments: 12 }); if (!tri) pg.scale(1, .36, 1); pg.translate(cx, y0 + sill + wh + .22, -.02); G.moul.push(pg);
        G.moul.push(box(T, ww + .66, .13, .22, cx, y0 + sill + wh + .18, .07));
        for (const k of [-1, 1]) { const c = new T.Shape(); c.moveTo(0, 0); c.lineTo(.18, 0); c.quadraticCurveTo(.2, -.25, .06, -.45); c.lineTo(0, -.45); c.closePath(); const cg = new T.ExtrudeGeometry(c, { depth: .15, bevelEnabled: false, curveSegments: 5 }); cg.rotateY(-Math.PI / 2); cg.translate(cx + k * (ww / 2 + .22) + .075, y0 + sill + wh + .12, 0); G.moul.push(cg); }
      } else if (f < lastF && f !== lastF - 0) {
        if (style === 'riche' && f === nobleF + 1) G.moul.push(box(T, .22, .3, .08, cx, y0 + sill + wh + .1, .05));   // clef sculptée
        rail(T, G.fonte, cx - ww / 2 - .06, cx + ww / 2 + .06, y0 + sill, .95, .12, style === 'riche');
      }
    }
    if (!base && style !== 'modeste') G.moul.push(box(T, W + .1, .15, .13, W / 2, y0 + .07, .065));
    if (!base && style === 'modeste' && f === 1) G.moul.push(box(T, W, .2, .08, W / 2, y0 + .1, .04));
  }
  // bandeau au-dessus du rez-de-chaussée (et de l'entresol)
  const ys = ent ? F[0] + F[1] : F[0];
  G.moul.push(extrudeX(T, moulure(T, style === 'modeste' ? .14 : .34, .3), W + .3, -.15, ys - .3, 0));
  // bow-window (oriel) du 16e
  if (oriel) {
    const x0 = orielBays[0] * bw + .15, x1 = (orielBays[orielBays.length - 1] + 1) * bw - .15, od = .75;
    const ya = yF[nobleF], yb = yF[lastF];
    // flancs + cul-de-lampe ; la face avant est faite de trumeaux et d'allèges (vraies ouvertures)
    G.mur.push(box(T, .25, yb - ya, od + .04, x0 + .125, (ya + yb) / 2, od / 2));
    G.mur.push(box(T, .25, yb - ya, od + .04, x1 - .125, (ya + yb) / 2, od / 2));
    const cl = new T.Shape(); cl.moveTo(0, 0); cl.lineTo(od, 0); cl.quadraticCurveTo(od * .4, -.2, 0, -1.1); cl.closePath();
    G.moul.push(extrudeX(T, cl, x1 - x0, x0, ya, 0));
    for (let f = nobleF; f < lastF; f++) {
      const n = orielBays.length + 1, inner = x1 - x0 - .5, cw = inner / n, wh = F[f] * .62, sill = F[f] * .16, yy = yF[f], zf = od - .14;
      G.mur.push(box(T, inner, sill, .28, (x0 + x1) / 2, yy + sill / 2, zf));
      G.mur.push(box(T, inner, F[f] - sill - wh, .28, (x0 + x1) / 2, yy + sill + wh + (F[f] - sill - wh) / 2, zf));
      for (let k = 1; k < n; k++) G.mur.push(box(T, .22, wh, .28, x0 + .25 + cw * k, yy + sill + wh / 2, zf));
      for (let k = 0; k < n; k++) { const cx = x0 + .25 + cw * (k + .5); windowUnit(T, G, R, cx, yy + sill, cw - .26, wh, .37 - od, { pOpen: .04, deep: .5 }); }
      G.moul.push(box(T, x1 - x0 + .1, .16, od + .1, (x0 + x1) / 2, yy + .08, od / 2));
    }
  }
  // balcons filants : étage noble et dernier étage carré
  for (const f of style === 'modeste' ? [lastF] : [nobleF, lastF]) {
    const by = yF[f], dep = f === nobleF ? .85 : .7;
    G.moul.push(box(T, W + .1, .17, dep, W / 2, by + .02, dep / 2));
    G.moul.push(box(T, W + .14, .05, dep + .04, W / 2, by - .07, dep / 2));
    for (let b = 0; b <= B; b++) {
      const cx = Math.min(W - .15, Math.max(.15, b * bw)), c = new T.Shape();
      c.moveTo(0, 0); c.lineTo(dep * .9, 0); c.quadraticCurveTo(dep * .25, -.12, 0, -.6); c.closePath();
      const g = new T.ExtrudeGeometry(c, { depth: .2, bevelEnabled: false, curveSegments: 6 }); g.rotateY(-Math.PI / 2); g.translate(cx + .1, by - .06, 0); G.moul.push(g);
    }
    rail(T, G.fonte, 0, W, by + .1, 1.0, dep - .06, style === 'riche');
  }
  // corniche : doucine, larmier et denticules
  const cd = style === 'modeste' ? .35 : .6;
  G.moul.push(extrudeX(T, moulure(T, cd, .55), W + .4, -.2, Htop - .12, 0));
  if (style !== 'modeste') for (let x = .1; x < W; x += .19) G.moul.push(box(T, .09, .12, .14, x, Htop - .18, .1));
  G.zinc.push(box(T, W + .4, .14, .3, W / 2, Htop + .5, cd - .1, 1.6));   // chéneau
  // toit : mansarde zinc (riche/classique) ou toit à 45° (modeste)
  const mh = style === 'modeste' ? 2.8 : 3.6, mb = style === 'modeste' ? 2.8 : 1.35, mt = 2.6;
  const ms = new T.Shape(); ms.moveTo(.35, 0); ms.lineTo(-mb + .35, mh); ms.lineTo(-mb - mt, mh + .9); ms.lineTo(-D + .2, mh + .9); ms.lineTo(-D + .2, 0); ms.closePath();
  const roof = new T.ExtrudeGeometry(ms, { depth: W + .3, bevelEnabled: false }); roof.rotateY(-Math.PI / 2); roof.translate(W + .15, Htop + .1, 0);
  { const p = roof.attributes.position, uv = roof.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 1.6, (p.getY(i) - p.getZ(i)) / 1.6); }
  G.zinc.push(roof);
  const lucStep = style === 'modeste' ? 2 : 1;
  for (let b = 0; b < B; b += lucStep) {
    const cx = (b + .5) * bw, lw = Math.min(1.1, winW * .85), ly = Htop + .45, lh = 1.75, lz = style === 'modeste' ? -.4 : .32;
    G.zinc.push(box(T, lw + .3, lh, 1.8, cx, ly + lh / 2, lz - .9, 1.6));
    if (style !== 'modeste' && b % 2 === 0) { const s = new T.Shape(); s.moveTo(-(lw / 2 + .25), 0); s.lineTo(lw / 2 + .25, 0); s.absarc(0, 0, lw / 2 + .25, 0, Math.PI, false); s.closePath(); const g = new T.ExtrudeGeometry(s, { depth: .25, bevelEnabled: false, curveSegments: 10 }); g.scale(1, .5, 1); g.translate(cx, ly + lh, lz - .05); G.moul.push(g); }
    else { const s = new T.Shape(); s.moveTo(-(lw / 2 + .25), 0); s.lineTo(lw / 2 + .25, 0); s.lineTo(0, .5); s.closePath(); const g = new T.ExtrudeGeometry(s, { depth: .25, bevelEnabled: false }); g.translate(cx, ly + lh, lz - .05); (style === 'modeste' ? G.zinc : G.moul).push(g); }
    G.moul.push(box(T, lw + .28, lh, .12, cx, ly + lh / 2, lz - .02));
    windowUnit(T, G, R, cx, ly + .2, lw * .78, lh * .72, -lz + .2, { pOpen: .15, deep: .9 });
  }
  // cheminées (souches avec boisseaux), antennes, descentes d'eau
  const nC = Math.max(2, Math.round(W / 6));
  for (let k = 0; k < nC; k++) {
    const cx = (k + .5) * W / nC + (R() - .5), ch = 1.8 + R() * 1.2, cy = Htop + mh + .9, cz = -D * (.35 + R() * .3), cw2 = 1.2 + R() * 1.6;
    G.mur.push(box(T, cw2, ch, .7, cx, cy + ch / 2, cz));
    G.moul.push(box(T, cw2 + .14, .14, .84, cx, cy + ch, cz));
    for (let p = 0; p < Math.round(cw2 / .35); p++) G.terre.push(new T.CylinderGeometry(.09, .11, .4 + R() * .25, 10).translate(cx - cw2 / 2 + .2 + p * .35, cy + ch + .28, cz));
  }
  for (let k = 0; k < 1 + Math.floor(R() * 2); k++) {
    const ax = W * (.2 + R() * .6), az = -D * (.5 + R() * .3), ay = Htop + mh + .9;
    G.tube.push(new T.CylinderGeometry(.025, .03, 3.2, 6).translate(ax, ay + 1.6, az));
    for (let j = 0; j < 4; j++) G.tube.push(box(T, 1.4 - j * .2, .02, .02, ax, ay + 2.2 + j * .25, az));
  }
  for (const x of [.14, W - .14]) { G.tube.push(new T.CylinderGeometry(.055, .055, Htop + .3, 8).translate(x, (Htop + .3) / 2, .06)); G.tube.push(new T.CylinderGeometry(.14, .055, .3, 8).translate(x, Htop + .25, .06)); }
  // assemblage
  const wallM = M.wall(kind, tone.getHex(), wear), rdcM = M.wall(kind, tone.clone().multiplyScalar(.95).getHex(), Math.min(1, wear + .15)), moulM = M.wall(kind, tone.clone().lerp(new T.Color(0xffffff), .25).getHex(), wear * .9);
  const grp = new T.Group();
  const add = (arr, mat) => { if (!arr.length) return; const g = mergeGeometries(arr.map(a => a.index ? a.toNonIndexed() : a), false); g.computeVertexNormals(); const m = new T.Mesh(g, mat); m.castShadow = m.receiveShadow = true; grp.add(m); };
  add(G.mur, wallM); add(G.rdc, rdcM); add(G.moul, moulM); add(G.zinc, M.zinc); add(G.fonte, M.fonte); add(G.menu, M.menuiserie); add(G.rid, M.rideau); add(G.ridT, M.rideauTire);
  add(G.inter, M.interieur); add(G.intC, M.interieurClair); add(G.terre, M.terre); add(G.tube, M.zincTube); add(G.plaque, M.plaque); add(G.lum, M.vitrineLum);
  for (let i = 0; i < 3; i++) add(G['verre' + i], M.verres[i]);
  if (G.vit.length) { const g = mergeGeometries(G.vit.map(a => a.toNonIndexed()), false); g.computeVertexNormals(); grp.add(new T.Mesh(g, M.vitre)); }
  const byMat = new Map(); for (const [g, m] of extra) { if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(g); } for (const [m, a] of byMat) add(a, m);
  return grp;
}

function shopFront(T, G, extra, M, R, cx, y0, ww, wh, REC, name, auvent) {
  const mat = M.vitrines[Math.floor(R() * M.vitrines.length)], z = -REC + .1;
  for (const g of [box(T, ww, .5, .14, cx, y0 + wh - .25, z), box(T, .14, wh - .5, .14, cx - ww / 2 + .07, y0 + (wh - .5) / 2, z), box(T, .14, wh - .5, .14, cx + ww / 2 - .07, y0 + (wh - .5) / 2, z), box(T, ww, .45, .14, cx, y0 + .22, z), box(T, .07, wh - .95, .1, cx + ww * .18, y0 + .45 + (wh - .95) / 2, z)]) extra.push([g, mat]);
  G.vit.push(box(T, ww - .28, wh - .95, .01, cx, y0 + .45 + (wh - .95) / 2, z - .02));
  G.lum.push(box(T, ww + .3, wh, .02, cx, y0 + wh / 2, -REC - 2.2));
  // enseigne peinte
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#' + mat.color.getHexString(); g.fillRect(0, 0, 512, 64); g.fillStyle = '#e9dfc4'; g.font = 'bold 38px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 256, 34);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  extra.push([new T.PlaneGeometry(ww - .2, .36).translate(cx, y0 + wh - .25, z + .075), new T.MeshStandardMaterial({ map: t, roughness: .5 })]);
  if (auvent) {   // store banne rayé
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 16; const s = sc.getContext('2d'); const col = R() < .5 ? '#7a1f23' : '#1f4a3a';
    for (let i = 0; i < 16; i++) { s.fillStyle = i % 2 ? '#efe7d6' : col; s.fillRect(i * 16, 0, 16, 16); }
    const st = new T.CanvasTexture(sc); st.colorSpace = T.SRGBColorSpace;
    const aw = new T.PlaneGeometry(ww + .2, 1.6); aw.rotateX(-1.05); aw.translate(cx, y0 + wh + .05 - .6, .7);
    extra.push([aw, new T.MeshStandardMaterial({ map: st, roughness: .9, side: T.DoubleSide })]);
  }
}

function entryDoor(T, G, extra, M, R, cx, y0, ww, wh, REC, num) {
  const mat = M.portes[Math.floor(R() * M.portes.length)], z = -REC + .06, dh = wh * .74, imp = wh - dh;
  extra.push([box(T, ww * .49, dh, .1, cx - ww * .25, y0 + dh / 2, z), mat]);
  extra.push([box(T, ww * .49, dh, .1, cx + ww * .25, y0 + dh / 2, z), mat]);
  for (const k of [-1, 1]) for (const yy of [.3, .62]) extra.push([box(T, ww * .36, dh * .24, .04, cx + k * ww * .25, y0 + dh * yy, z + .06), mat]);   // panneaux moulurés
  G.fonte.push(box(T, .04, .18, .06, cx - .06, y0 + dh * .5, z + .09)); G.fonte.push(box(T, .04, .18, .06, cx + .06, y0 + dh * .5, z + .09));
  // imposte vitrée avec grille en fonte
  G['verre0'].push(box(T, ww, imp - .1, .01, cx, y0 + dh + imp / 2, z));
  for (let x = cx - ww / 2 + .1; x < cx + ww / 2; x += .16) G.fonte.push(box(T, .02, imp - .1, .02, x, y0 + dh + imp / 2, z + .03));
  extra.push([box(T, ww + .1, .12, .14, cx, y0 + dh + .02, z + .02), mat]);
  // plaque de numéro émaillée
  const c = document.createElement('canvas'); c.width = 96; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#1b3f8f'; g.fillRect(0, 0, 96, 64); g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(5, 5, 86, 54); g.fillStyle = '#fff'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(num), 48, 34);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  extra.push([new T.PlaneGeometry(.3, .2).translate(cx + ww / 2 + .35, y0 + wh + .1, .01), new T.MeshStandardMaterial({ map: t, roughness: .25 })]);
}

// ------------------------------------------------------------------ immeuble moderne (années 60-70)
function buildModern(T, M, o, R) {
  const W = o.width, D = o.depth || 12, n = o.levels || (8 + Math.floor(R() * 5)), fh = 2.75, H = 3.6 + n * fh, wear = o.wear ?? .5;
  const G = { mur: [], menu: [], inter: [], rid: [], ridT: [], intC: [], fonte: [], verre0: [], verre1: [], verre2: [], tube: [] };
  G.mur.push(box(T, W, H, D - .3, W / 2, H / 2, -.3 - (D - .3) / 2));
  // rez-de-chaussée en retrait sur pilotis
  for (let x = .3; x < W; x += 4) G.mur.push(box(T, .4, 3.6, .4, x, 1.8, -.2));
  G.verre0.push(box(T, W - .4, 3.2, .02, W / 2, 1.8, -1.6));
  for (let k = 0; k < n; k++) {
    const y0 = 3.6 + k * fh;
    G.mur.push(box(T, W, .35, .45, W / 2, y0 + .17, .0));                     // nez de dalle
    G.mur.push(box(T, W, .85, .3, W / 2, y0 + .35 + .42, -.15));               // allège
    const nw = Math.max(2, Math.round(W / 1.6)), cw = W / nw;
    for (let i = 0; i < nw; i++) {
      const cx = (i + .5) * cw;
      G.mur.push(box(T, .14, fh - 1.2, .3, i * cw + .07, y0 + 1.2 + (fh - 1.2) / 2, -.15));
      G.inter.push(box(T, cw, fh - 1.2, .02, cx, y0 + 1.2 + (fh - 1.2) / 2, -1.6));
      G['verre' + Math.floor(R() * 3)].push(box(T, cw - .16, fh - 1.35, .01, cx, y0 + 1.2 + (fh - 1.35) / 2, -.25));
      G.menu.push(box(T, cw - .16, .05, .06, cx, y0 + 1.22, -.24)); G.menu.push(box(T, .05, fh - 1.35, .06, cx, y0 + 1.2 + (fh - 1.35) / 2, -.24));
      if (R() < .5) G.rid.push(box(T, cw * .45, fh - 1.4, .02, cx - cw * .2, y0 + 1.2 + (fh - 1.4) / 2, -.4));
    }
    G.mur.push(box(T, W, .3, .3, W / 2, y0 + fh - .15, -.15));
  }
  G.mur.push(box(T, W + .2, .6, .5, W / 2, H + .3, 0));
  for (let x = .2; x < W; x += 3) G.fonte.push(box(T, .04, 1, .04, x, H + 1.1, -.2));
  G.fonte.push(box(T, W, .04, .04, W / 2, H + 1.6, -.2));
  const grp = new T.Group(), wm = M.wall('beton', (o.tone || 0xd8d4cc), wear);
  const add = (arr, mat) => { if (!arr.length) return; const g = mergeGeometries(arr.map(a => a.index ? a.toNonIndexed() : a), false); g.computeVertexNormals(); const m = new T.Mesh(g, mat); m.castShadow = m.receiveShadow = true; grp.add(m); };
  add(G.mur, wm); add(G.menu, M.menuiserieGris); add(G.inter, M.interieur); add(G.rid, M.rideau); add(G.fonte, M.fonte);
  for (let i = 0; i < 3; i++) add(G['verre' + i], M.verres[i]);
  return grp;
}
