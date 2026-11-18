// Générateur d'immeubles parisiens v3 — vrai relief, dimensions réelles, variantes par graine.
// Styles : 'riche' (16e), 'classique' (7e), 'modeste' (19e faubourien, enduit, persiennes), 'moderne' (années 70).
// v3 : vraies pièces derrière les fenêtres (murs, parquet, meubles, lampes), verre teinté brillant (Fresnel),
// ~12 % de fenêtres ouvertes, lucarnes variées (fronton, cintrée, zinc, œil-de-bœuf, ornée, chien-assis, tabatière),
// balcons garnis (pots, jardinières sur supports, chaises), descentes d'eau variées (boîte à eau, colliers, dauphin),
// portes cochères variées (plein cintre / anse de panier / linteau droit, panneaux, clous, vitrée, portillon,
// bornes chasse-roue, rénovées ou non), commerces fermés : rideaux métalliques ou grilles, souvent tagués.
// Options : width, depth, seed, style, rdc, wear 0..1, reno 0..1, tone, pShop, pOpen, pClosed, tagP, doorPal.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const NOISE = `
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return .5*vn(p)+.25*vn(p*2.03)+.125*vn(p*4.01)+.0625*vn(p*8.);}`;
const DEEP = 2.0;
// téléphone : textures dessinées (enseignes, rideaux, tags) à moitié de résolution → 4× moins de mémoire
export const TQ = (typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches) ? .5 : 1;   // profondeur des pièces visibles derrière la façade

export function createKit(T, base) {
  const TL = new T.TextureLoader(), cache = {};
  const tex = (n, srgb) => { if (cache[n]) return cache[n]; const t = TL.load(base + n + '.jpg'); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = T.SRGBColorSpace; return (cache[n] = t); };
  const set = n => ({ map: tex(n + '_c', true), normalMap: tex(n + '_n'), roughnessMap: tex(n + '_r') });
  const walls = new Map();
  function wall(kind, tone, wear, key) {
    const k = kind + tone + ':' + wear.toFixed(2) + (key || ''); if (walls.has(k)) return walls.get(k);
    const m = new T.MeshStandardMaterial({ ...set(kind), color: key === 'vc' ? 0xffffff : tone, vertexColors: key === 'vc', roughness: 1 });
    const U = { uWear: { value: wear } };
    m.onBeforeCompile = sh => {
      sh.uniforms.uWear = U.uWear;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform float uWear;' + NOISE)
        .replace('#include <color_fragment>', `#include <color_fragment>
        { vec2 c=vec2(vWP.x+vWP.z*.7, vWP.y);
          float patchy=fbm(c*.22);
          diffuseColor.rgb*=mix(1., .80+.32*patchy, .25+uWear*.75);
          float st=fbm(vec2(c.x*2.2, c.y*.07+3.));
          diffuseColor.rgb*=1.-uWear*.42*smoothstep(.42,.86,st);
          diffuseColor.rgb*=1.-uWear*.30*(1.-smoothstep(.2,3.8,vWP.y));
          float soot=fbm(c*1.6+9.); diffuseColor.rgb*=1.-uWear*.18*smoothstep(.55,.9,soot);
          diffuseColor.rgb=mix(diffuseColor.rgb, diffuseColor.rgb*vec3(.84,.80,.73), uWear*.55); }`);
    };
    m.customProgramCacheKey = () => 'mur_usure' + (key === 'vc' ? 'vc' : '');
    walls.set(k, m); return m;
  }
  const std = o => new T.MeshStandardMaterial(o);
  // verre teinté brillant : reflet fort en incidence rasante, on voit l'intérieur de face (Fresnel sur l'opacité)
  const glass = (c, rough, a0, aMax = .85) => {
    const m = std({ color: c, metalness: .25, roughness: rough, envMapIntensity: 1.25, transparent: true, opacity: 1, depthWrite: false });
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `{ float fr=pow(1.-clamp(abs(dot(normalize(-vViewPosition), normal)),0.,1.),3.5);
        diffuseColor.a=mix(${a0.toFixed(2)},${aMax.toFixed(2)},fr); outgoingLight+=vec3(.012,.016,.02); }
        #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'verre' + a0.toFixed(2) + aMax;
    return m;
  };
  const paints = new Map();
  const M = {
    wall, set,
    paint(hex, rough, metal = .05) { const k = hex + ':' + rough.toFixed(2); if (!paints.has(k)) paints.set(k, std({ color: hex, roughness: rough, metalness: metal })); return paints.get(k); },
    zinc: new T.MeshStandardMaterial({ ...set('zinc'), color: 0x8a97a2, metalness: .6, roughness: .5 }),
    fonte: std({ color: 0x141619, metalness: .65, roughness: .42 }),
    zincTube: std({ color: 0x80878b, metalness: .35, roughness: .55 }),
    verres: [glass(0x33444c, .03, .22), glass(0x34453c, .05, .28), glass(0x48463f, .08, .34)],
    vitre: glass(0x2f3a3e, .02, .06, .55),
    menuiserie: std({ color: 0xefebe2, roughness: .5 }),
    menuiserieGris: std({ color: 0xbfc3c3, roughness: .5 }),
    rideau: std({ color: 0xe6dfd2, roughness: .95, side: T.DoubleSide }),
    rideauTire: std({ color: 0xd8cdb8, roughness: .95, side: T.DoubleSide }),
    vc: std({ vertexColors: true, roughness: .82, emissive: 0x15120e }),   // intérieurs + décor (couleurs par sommet)
    lampe: std({ color: 0xfff2d6, emissive: 0xffc77a, emissiveIntensity: 1.6, roughness: .6 }),
    terre: std({ color: 0xa65a3a, roughness: .8 }),
    laiton: std({ color: 0xc9a24a, metalness: .9, roughness: .3 }),
    vitrineLum: std({ color: 0x8a6e4c, roughness: 1, emissive: 0x6a4a22, emissiveIntensity: .8 }),
    persienne: [0xd9d6cf, 0x8b9399, 0x5d6b5a, 0x6f4f3a, 0xb7b9a6].map(c => std({ color: c, roughness: .6 })),
    descentes: [std({ color: 0x80878b, metalness: .35, roughness: .55 }), std({ color: 0x1a1c1e, metalness: .5, roughness: .5 }), std({ color: 0x2f4a3a, roughness: .5 }), std({ color: 0x5c5a55, metalness: .2, roughness: .7 })],
    vitrines: [0x1d3b2f, 0x5a1f24, 0x1e2a44, 0x2b2b2b, 0x6b5a3a, 0x24443f].map(c => std({ color: c, roughness: .4, metalness: .1 })),
    ribs: null,
  };
  // motifs de garde-corps (texture ajourée répétée) : classique (barreaux + anneaux), riche (anneaux doubles, volutes)
  M.garde = [0, 1].map(orne => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'); g.strokeStyle = g.fillStyle = '#fff'; g.lineCap = 'round';
    const W = 256, Hh = 256, yb = Hh * .62;
    g.lineWidth = 7; for (const yy of [Hh * .26, Hh * .5]) { g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke(); }
    g.lineWidth = 5; for (let x = 6; x < W; x += orne ? 21.3 : 25.6) { g.beginPath(); g.moveTo(x, Hh * .5); g.lineTo(x, Hh); g.stroke(); }
    if (orne) { g.lineWidth = 6; for (let x = 32; x < W; x += 64) { g.beginPath(); g.arc(x, Hh * .38, 26, 0, 6.29); g.stroke(); g.beginPath(); g.arc(x + 32, Hh * .38, 10, 0, 6.29); g.stroke(); g.beginPath(); g.moveTo(x - 26, Hh * .38); g.quadraticCurveTo(x, Hh * .18, x + 26, Hh * .38); g.stroke(); } }
    else { g.lineWidth = 6; for (let x = 32; x < W; x += 64) { g.beginPath(); g.arc(x, Hh * .38, 27, 0, 6.29); g.stroke(); } }
    g.lineWidth = 9; g.beginPath(); g.moveTo(0, 4); g.lineTo(W, 4); g.stroke();
    const t = new T.CanvasTexture(c); t.wrapS = T.RepeatWrapping; t.anisotropy = 4; void yb;
    return new T.MeshStandardMaterial({ color: 0x15171a, metalness: .6, roughness: .45, alphaMap: t, alphaTest: .5, transparent: false, side: T.DoubleSide });
  });
  // plaques de numéros émaillées bleues : un seul atlas (1 à 256) pour toute la ville
  { const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
    for (let i = 0; i < 256; i++) {
      const x = (i % 16) * 64, y = Math.floor(i / 16) * 64;
      g.fillStyle = '#2E5E3E'; g.fillRect(x, y + 10, 64, 44);
      g.fillStyle = '#1F3A6B'; g.fillRect(x + 3, y + 13, 58, 38);
      g.strokeStyle = '#f4f1e8'; g.lineWidth = 1.4; g.strokeRect(x + 5, y + 15, 54, 34);
      g.fillStyle = '#fff'; g.font = `bold ${i + 1 > 99 ? 21 : 27}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(i + 1), x + 32, y + 33);
    }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; M.plaques = new T.MeshStandardMaterial({ map: t, roughness: .22, metalness: .12 }); }
  // nervures du rideau métallique (relief partagé)
  const rc = document.createElement('canvas'); rc.width = 4; rc.height = 32; const rg = rc.getContext('2d');
  const gr = rg.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, '#000'); gr.addColorStop(.35, '#fff'); gr.addColorStop(.65, '#ddd'); gr.addColorStop(1, '#000'); rg.fillStyle = gr; rg.fillRect(0, 0, 4, 32);
  M.ribs = new T.CanvasTexture(rc); M.ribs.wrapS = M.ribs.wrapT = T.RepeatWrapping;
  M.partages = () => { const S = new Set(); for (const v of Object.values(M)) { if (v && v.isMaterial) S.add(v); else if (Array.isArray(v)) v.forEach(x => x && x.isMaterial && S.add(x)); } walls.forEach(m => S.add(m)); paints.forEach(m => S.add(m)); return S; };
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
const ext = (T, s, d, seg = 10) => new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: seg });
const rng = s => () => (s = (s * 16807 + 11) % 2147483647) / 2147483647;
const pickW = (R, a) => { let x = R() * a.reduce((t, e) => t + e[1], 0); for (const [v, w] of a) { if ((x -= w) <= 0) return v; } return a[0][0]; };
const _c = { r: 0, g: 0, b: 0 };
// couleur par sommet (matériau partagé M.vc) — teinte hex sRGB
function vc(T, g, hex, jit = 0, R, dim = 1) {
  if (g.index) g = g.toNonIndexed();
  const c = new T.Color(hex).multiplyScalar(dim); if (jit && R) c.offsetHSL((R() - .5) * jit * .2, 0, (R() - .5) * jit);
  const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new T.BufferAttribute(a, 3)); return g;
}
function tubeAB(T, a, b, r, seg = 8) {
  const d = new T.Vector3().subVectors(b, a), L = d.length();
  const g = new T.CylinderGeometry(r, r, L, seg); g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
function moulure(T, d, h) {
  const s = new T.Shape(); s.moveTo(0, 0); s.lineTo(d * .22, 0); s.quadraticCurveTo(d * .3, h * .3, d * .52, h * .4);
  s.lineTo(d * .56, h * .55); s.lineTo(d * .62, h * .58); s.quadraticCurveTo(d * .95, h * .62, d, h * .88); s.lineTo(d, h); s.lineTo(0, h); s.closePath();
  return s;
}
// garde-corps en fonte : main courante et lisse basse en volume, motif (barreaux, anneaux) en texture ajourée — très léger
function rail(T, G, x0, x1, y, h, z, orne) {
  G.fonte.push(box(T, x1 - x0, .055, .06, (x0 + x1) / 2, y + h, z));
  G.fonte.push(box(T, x1 - x0, .04, .04, (x0 + x1) / 2, y + .07, z));
  const n = Math.max(1, Math.ceil((x1 - x0) / 1.4)); for (let k = 0; k <= n; k++) G.fonte.push(box(T, .04, h, .04, x0 + (x1 - x0) * k / n, y + h / 2, z));
  const g = new T.PlaneGeometry(x1 - x0, h - .1).translate((x0 + x1) / 2, y + .09 + (h - .1) / 2, z), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (x1 - x0) / (orne ? .8 : 1.04));
  G[orne ? 'garde1' : 'garde0'].push(g);
}
const M4 = (T, ang, x, y, z) => new T.Matrix4().makeRotationY(ang).setPosition(x, y, z);

// ------------------------------------------------------------------ tags (graffitis) dessinés sur canvas
const TAG_COLS = ['#e8e8e8', '#111', '#d22', '#1c6fd8', '#f2c230', '#2bb24c', '#e14fb0', '#ff7a1a', '#7b3fd1', '#18c7c7'];
function tagWord(R) { const L = 'AEKORSTZNMWBDXVHLY'; let s = ''; const n = 3 + Math.floor(R() * 3); for (let i = 0; i < n; i++) s += L[Math.floor(R() * L.length)]; return s; }
function drawTags(g, R, W, H, n, big = 1) {
  for (let k = 0; k < n; k++) {
    const kind = R(), x = W * (.08 + R() * .84), y = H * (.25 + R() * .6), sz = H * (.12 + R() * .22) * big;
    g.save(); g.translate(x, y); g.rotate((R() - .5) * .5); g.transform(1, 0, (R() - .5) * .6, 1, 0, 0);
    const word = tagWord(R), c1 = TAG_COLS[Math.floor(R() * TAG_COLS.length)], c2 = TAG_COLS[Math.floor(R() * TAG_COLS.length)];
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (kind < .4) {   // throw-up : lettres bulles remplies + contour épais
      g.font = `900 ${sz * 1.2}px "Arial Black", Impact, sans-serif`; g.lineWidth = sz * .22; g.strokeStyle = c2 === c1 ? '#111' : c2; g.strokeText(word, 0, 0); g.fillStyle = c1; g.fillText(word, 0, 0);
      g.lineWidth = sz * .05; g.strokeStyle = '#111'; g.strokeText(word, 0, 0);
    } else if (kind < .85) {   // tag au marqueur : trait simple, penché, soulignement et coulures
      g.font = `italic bold ${sz}px "Brush Script MT", "Comic Sans MS", cursive`; g.lineWidth = Math.max(2, sz * .07); g.strokeStyle = c1; g.strokeText(word, 0, 0);
      const tw = g.measureText(word).width; g.beginPath(); g.moveTo(-tw / 2, sz * .45); g.bezierCurveTo(-tw / 4, sz * .7, tw / 3, sz * .2, tw * .6, sz * .55); g.stroke();
      for (let d = 0; d < 3; d++) { const dx = (R() - .5) * tw; g.fillStyle = c1; g.fillRect(dx, sz * .2, 2, sz * (.3 + R() * .8)); }
    } else {   // gribouillis
      g.strokeStyle = c1; g.lineWidth = 3 + R() * 4; g.beginPath(); g.moveTo(-sz, 0);
      for (let i = 0; i < 6; i++) g.bezierCurveTo((R() - .5) * sz * 3, (R() - .5) * sz, (R() - .5) * sz * 3, (R() - .5) * sz, (R() - .5) * sz * 2, (R() - .5) * sz * .8);
      g.stroke();
    }
    g.restore();
  }
}
function tagTexture(T, R, n, w = 512, h = 256) {
  const c = document.createElement('canvas'); c.width = w * TQ; c.height = h * TQ; const g = c.getContext('2d'); g.scale(TQ, TQ); drawTags(g, R, w, h, n, 1.9);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

// ------------------------------------------------------------------ pièce derrière une fenêtre (murs, sol, plafond, meubles)
const MURS_INT = [0xece6d8, 0xf3f0ea, 0xdcd6c8, 0xc9d1c2, 0xe6d2c4, 0xd3dbe0, 0xefe2c4, 0xbfc5c6, 0xa9b5a0, 0xe9dccb, 0x9fb1bd];
const SOLS = [0x7a5534, 0x8d6a45, 0x5e4330, 0x9a7a55, 0x6b4a2e];
const BOIS = [0x6b4a2e, 0x3d2a1c, 0xd9cbb4, 0x8a6a48, 0xefe9de, 0x2b2b2b];
const TISSUS = [0x6d7f8a, 0x8a3b32, 0x3f5a46, 0xb7a58a, 0x2f3a52, 0xc9b9a0, 0x555555];
function room(T, G, R, cx, y0, w, h, zf, deep, o = {}) {
  if (G.lod && !o.shop) { G.vc.push(vc(T, new T.PlaneGeometry(w, h).translate(cx, y0 + h / 2, zf - Math.min(deep, .6)), o.pal ?? MURS_INT[Math.floor(R() * MURS_INT.length)], .1, R, .35)); return; }   // version simple : fond sombre
  const pal = o.pal ?? MURS_INT[Math.floor(R() * MURS_INT.length)];
  const zb = zf - deep, xm = cx;
  G.vc.push(vc(T, new T.PlaneGeometry(w, h).translate(xm, y0 + h / 2, zb), pal, .06, R, .55));
  G.vc.push(vc(T, new T.PlaneGeometry(deep, h).rotateY(Math.PI / 2).translate(xm - w / 2, y0 + h / 2, zf - deep / 2), pal, .1, R, .5));
  G.vc.push(vc(T, new T.PlaneGeometry(deep, h).rotateY(-Math.PI / 2).translate(xm + w / 2, y0 + h / 2, zf - deep / 2), pal, .1, R, .5));
  G.vc.push(vc(T, new T.PlaneGeometry(w, deep).rotateX(-Math.PI / 2).translate(xm, y0, zf - deep / 2), o.sol ?? SOLS[Math.floor(R() * SOLS.length)], 0, R, .6));
  G.vc.push(vc(T, new T.PlaneGeometry(w, deep).rotateX(Math.PI / 2).translate(xm, y0 + h, zf - deep / 2), 0xf4f1ea, 0, R, .45));
  if (o.shop) return;
  if (deep < .9) return;
  // mobilier simple (adossé au mur du fond)
  const r = R(), bw = BOIS[Math.floor(R() * BOIS.length)];
  if (r < .3) {   // bibliothèque avec rangées de livres
    const lw = Math.min(w * .7, 1.2), lx = xm + (R() - .5) * (w - lw) * .6;
    G.vc.push(vc(T, new T.BoxGeometry(lw, Math.min(h * .85, 2), .32).translate(lx, y0 + Math.min(h * .85, 2) / 2, zb + .17), bw));
    for (let s = 0; s < 4; s++) { let x = lx - lw / 2 + .06; while (x < lx + lw / 2 - .08) { const bk = .12 + R() * .18, bh = .2 + R() * .1; G.vc.push(vc(T, new T.BoxGeometry(bk, bh, .2).translate(x + bk / 2, y0 + .15 + s * .45 + bh / 2, zb + .2), TISSUS[Math.floor(R() * TISSUS.length)], .2, R)); x += bk + .005; } }
  } else if (r < .55) {   // canapé / commode
    const cw = Math.min(w * .8, 1.8), col = TISSUS[Math.floor(R() * TISSUS.length)];
    G.vc.push(vc(T, new T.BoxGeometry(cw, .42, .8).translate(xm, y0 + .21, zb + .45), col));
    G.vc.push(vc(T, new T.BoxGeometry(cw, .45, .2).translate(xm, y0 + .62, zb + .12), col, .1, R));
  } else if (r < .75) {   // armoire
    G.vc.push(vc(T, new T.BoxGeometry(Math.min(w * .6, 1.1), 2.0, .5).translate(xm + (R() - .5) * .4, y0 + 1, zb + .26), bw));
  }
  if (R() < .55) {   // tableau ou miroir
    const fw = .35 + R() * .5, fh = .3 + R() * .4, fy = y0 + 1.45 + R() * .3;
    G.vc.push(vc(T, new T.BoxGeometry(fw, fh, .03).translate(xm + (R() - .5) * w * .3, fy, zb + .02), R() < .5 ? 0x2a2420 : 0xb58f4a));
    G.vc.push(vc(T, new T.PlaneGeometry(fw * .8, fh * .8).translate(xm + 0, fy, zb + .036), TISSUS[Math.floor(R() * TISSUS.length)], .4, R));
  }
  if (R() < (o.pLamp ?? .18)) {   // suspension allumée
    G.lampe.push(new T.CylinderGeometry(.12, .2, .2, 10).translate(xm, y0 + h - .45, zf - deep * .5));
    G.fonte.push(box(T, .01, .35, .01, xm, y0 + h - .18, zf - deep * .5));
  }
  if (R() < .2) {   // plante d'intérieur près de la fenêtre
    const px = xm + (R() < .5 ? -1 : 1) * w * .3;
    G.vc.push(vc(T, new T.CylinderGeometry(.13, .1, .3, 8).translate(px, y0 + .15, zf - .35), 0xe9e4da));
    G.vc.push(vc(T, new T.IcosahedronGeometry(.32, 0).scale(.8, 1.3, .8).translate(px, y0 + .7, zf - .35), 0x3f6a33, .2, R));
  }
}

// ------------------------------------------------------------------ fenêtre (vantaux ouvrables, verre teinté, rideaux, pièce)
function windowUnit(T, G, R, cx, ys, ww, wh, REC, o = {}) {
  const z = -REC + .07, fw = .055, open = R() < (o.pOpen ?? .12), ang = open ? (1.1 + R() * .9) : 0;
  const vi = Math.floor(R() * 3), deep = o.deep ?? (DEEP - .05);
  if (o.backing) G.vc.push(vc(T, new T.PlaneGeometry(ww + .1, wh + .1).translate(cx, ys + wh / 2, z - .12), 0x2a2622, .3, R));
  else room(T, G, R, cx, ys - (o.floorDrop ?? .9), ww + .5, wh + (o.floorDrop ?? .9) + .35, -REC, deep, o);
  // rideaux : voilages de chaque côté, parfois tirés, parfois rien
  const cr = R();
  if (cr < .38) { const cw = ww * (.2 + R() * .14); G.rid.push(box(T, cw, wh * .95, .02, cx - ww / 2 + cw / 2 + .04, ys + wh * .5, -REC - .14)); G.rid.push(box(T, cw, wh * .95, .02, cx + ww / 2 - cw / 2 - .04, ys + wh * .5, -REC - .14)); }
  else if (cr < (open ? .4 : .5)) G.ridT.push(box(T, ww - .1, wh * .95, .02, cx, ys + wh * .5, -REC - .14));
  const imp = wh > 2 ? .45 : 0, lh = wh - imp, lw = ww / 2;
  for (const side of [-1, 1]) {
    const hx = cx + side * ww / 2, a = side < 0 ? ang * (.8 + R() * .3) : -ang * (.8 + R() * .3);
    const parts = [], gl = [];
    const lx = side < 0 ? 0 : -lw;
    // vantail fermé : faces avant seulement (6× moins de triangles) ; ouvert : vrais volumes
    const bx = open ? (w, h, d, x, y, z) => box(T, w, h, d, x, y, z) : (w, h, d, x, y, z) => new T.PlaneGeometry(w, h).translate(x, y, z + d / 2);
    parts.push(bx(lw, fw, .05, lx + lw / 2, fw / 2, 0)); parts.push(bx(lw, fw, .05, lx + lw / 2, lh - fw / 2, 0));
    parts.push(bx(fw, lh, .05, lx + fw / 2, lh / 2, 0)); parts.push(bx(fw, lh, .05, lx + lw - fw / 2, lh / 2, 0));
    if (!G.lod) for (let k = 1; k < 3; k++) parts.push(bx(lw, .025, .035, lx + lw / 2, lh * k / 3, 0));
    gl.push(new T.PlaneGeometry(lw - fw, lh - fw).translate(lx + lw / 2, lh / 2, -.005));
    const mt = M4(T, a, hx, ys, z);
    for (const g of parts) G.menu.push(g.applyMatrix4(mt));
    for (const g of gl) G['verre' + vi].push(g.applyMatrix4(mt));
  }
  if (imp) { G.menu.push(box(T, ww, fw, .06, cx, ys + lh, z)); G['verre' + vi].push(box(T, ww - fw, imp - fw, .008, cx, ys + lh + imp / 2, z - .005)); G.menu.push(box(T, fw * .6, imp, .05, cx, ys + lh + imp / 2, z)); }
  G.menu.push(box(T, ww + .02, .05, .1, cx, ys + .02, z + .02));
  if (open && o.garde !== false && !o.backing && R() < .5) G.fonte.push(box(T, ww, .03, .03, cx, ys + .95, z + .1));   // barre d'appui
}

// ------------------------------------------------------------------ végétation et objets de balcon
const FLEURS = [0xd8263b, 0xf07fa8, 0xf4f1e8, 0x8b5fbf, 0xf2c230, 0xe8662a, 0xc2185b];
const FEUILLES = [0x3f5e2c, 0x4f6e33, 0x2f4a26, 0x5b7a3a];
const BACS = [0xa65a3a, 0x9b4f30, 0x2f4a3a, 0xeeeae2, 0x6f7376, 0x3a3a3a];
function plante(T, G, R, x, y, z, s, fleur) {
  const fc = FLEURS[Math.floor(R() * FLEURS.length)];
  G.vc.push(vc(T, new T.IcosahedronGeometry(s, 0).scale(1, .8 + R() * .5, 1).translate(x, y + s * .6, z), FEUILLES[Math.floor(R() * FEUILLES.length)], .15, R));
  if (fleur) for (let i = 0; i < 3 + Math.floor(R() * 4); i++) { const a = R() * 6.28, rr = s * (.5 + R() * .5); G.vc.push(vc(T, new T.OctahedronGeometry(.035 + R() * .02, 0).translate(x + Math.cos(a) * rr, y + s * (.8 + R() * .7), z + Math.sin(a) * rr * .7), fc, .1, R)); }
}
function pot(T, G, R, x, y, z, fleur) {
  if (G.lod) return;
  const s = .1 + R() * .1, col = R() < .7 ? 0xa65a3a : BACS[Math.floor(R() * BACS.length)];
  G.vc.push(vc(T, new T.CylinderGeometry(s, s * .75, s * 1.6, 8).translate(x, y + s * .8, z), col, .1, R));
  plante(T, G, R, x, y + s * 1.6, z, s * 1.3, fleur);
}
function jardiniere(T, G, R, x0, x1, y, z, fleur, supports) {
  if (G.lod) return;
  const col = BACS[Math.floor(R() * BACS.length)], w = x1 - x0;
  G.vc.push(vc(T, new T.BoxGeometry(w, .18, .2).translate((x0 + x1) / 2, y + .09, z), col, .1, R));
  for (let x = x0 + .12; x < x1 - .05; x += .2 + R() * .1) plante(T, G, R, x, y + .16, z, .1 + R() * .06, fleur);
  if (supports) for (const sx of [x0 + .1, x1 - .1]) { G.fonte.push(box(T, .02, .02, .26, sx, y - .01, z - .02)); G.fonte.push(box(T, .02, .22, .02, sx, y + .1, z + .1)); }   // porte-jardinière
}
function chaise(T, G, R, x, y, z, col, rot) {
  const parts = [new T.BoxGeometry(.4, .03, .38).translate(0, .45, 0), new T.BoxGeometry(.4, .4, .03).translate(0, .67, -.18)];
  for (const [a, b] of [[-.18, -.17], [.18, -.17], [-.18, .17], [.18, .17]]) parts.push(new T.BoxGeometry(.025, .45, .025).translate(a, .225, b));
  for (const p of parts) { p.rotateY(rot); p.translate(x, y, z); G.vc.push(vc(T, p, col)); }
}
// garniture d'un balcon filant entre x0 et x1, sol à y, profondeur utile z0..z1
function decoBalcon(T, G, R, x0, x1, y, z0, z1, style, vert) {
  if (G.lod) return;
  const col = [0x2f4a3a, 0x1a1a1a, 0xe8e4dc, 0x8a2a2a, 0x3a5a7a][Math.floor(R() * 5)];
  let x = x0 + .3;
  while (x < x1 - .3) {
    const r = R(), seg = 1.2 + R() * 2.2;
    if (r < vert * .55) { const n = 1 + Math.floor(R() * 3); for (let i = 0; i < n; i++) pot(T, G, R, x + i * .32, y, z0 + .15 + R() * (z1 - z0 - .3), R() < .7); }
    else if (r < vert * .85) jardiniere(T, G, R, x, Math.min(x1 - .2, x + .8 + R() * .6), y, z1 - .2, R() < .75, false);
    else if (r < vert * .85 + .08 && style !== 'modeste') { chaise(T, G, R, x, y, (z0 + z1) / 2, col, (R() - .5) * .8); chaise(T, G, R, x + .7, y, (z0 + z1) / 2, col, (R() - .5) * .8); G.vc.push(vc(T, new T.CylinderGeometry(.25, .25, .03, 12).translate(x + .35, y + .7, (z0 + z1) / 2), col)); G.vc.push(vc(T, new T.CylinderGeometry(.03, .03, .7, 6).translate(x + .35, y + .35, (z0 + z1) / 2), col)); }
    else if (r < vert + .1 && style === 'riche') { const s = .3; G.vc.push(vc(T, new T.BoxGeometry(s, s, s).translate(x, y + s / 2, (z0 + z1) / 2), 0x3a3a3a)); G.vc.push(vc(T, new T.SphereGeometry(.26, 8, 6).translate(x, y + s + .2, (z0 + z1) / 2), 0x2e4d26, .1, R)); }   // buis taillé
    x += seg;
  }
}

// ------------------------------------------------------------------ lucarnes
function lucarne(T, G, R, type, cx, Htop, lw, lhw, lz, roof) {
  const ly = Htop + .55, sill = .22, top = ly + sill + lhw;
  const stone = G.moul, zn = G.zinc;
  if (type === 'tabatiere') {   // châssis de toit dans le versant (toit à 45°)
    const yl = Htop + .1 + roof.mh * (.35 + R() * .3), zl = .35 - (yl - Htop - .1) * roof.mb / roof.mh + .04, a = Math.atan2(roof.mb, roof.mh);
    const tilt = g => g.rotateX(-a).translate(cx, yl, zl);
    zn.push(tilt(new T.BoxGeometry(lw * .85, 1.1, .08)));
    G['verre' + Math.floor(R() * 3)].push(tilt(new T.BoxGeometry(lw * .72, .95, .02).translate(0, 0, .05)));
    return;
  }
  if (type === 'oeil') {   // œil-de-bœuf : disque en pierre percé, verre rond, dôme de zinc
    const r = Math.min(.42, lw * .42), cy = ly + .25 + r + .1;
    const s = new T.Shape(); s.moveTo(-r - .2, ly + .05 - cy); s.lineTo(r + .2, ly + .05 - cy); s.lineTo(r + .2, 0); s.absarc(0, 0, r + .2, 0, Math.PI, false); s.lineTo(-r - .2, ly + .05 - cy);
    const h = new T.Path(); h.absarc(0, 0, r, 0, Math.PI * 2, true); s.holes.push(h);
    stone.push(ext(T, s, .18, 20).translate(cx, cy, lz - .14));
    G.moul.push(new T.TorusGeometry(r + .02, .05, 6, 24).translate(cx, cy, lz + .04));
    G['verre' + Math.floor(R() * 3)].push(new T.CircleGeometry(r, 24).translate(cx, cy, lz - .1));
    G.menu.push(box(T, r * 2, .04, .04, cx, cy, lz - .08)); G.menu.push(box(T, .04, r * 2, .04, cx, cy, lz - .08));
    G.vc.push(vc(T, new T.CircleGeometry(r, 16).translate(cx, cy, lz - .2), 0x2a2622));
    zn.push(new T.SphereGeometry(r + .25, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .75, 1.2).translate(cx, cy + .02, lz - .9));
    G.moul.push(box(T, .14, .24, .2, cx, cy + r + .14, lz + .02));   // clef
    return;
  }
  for (const k of [-1, 1]) zn.push(box(T, .08, top - ly + .1, 1.5, cx + k * (lw / 2 + .12), (ly + top) / 2, lz - .78, 1.6));   // joues
  windowUnit(T, G, R, cx, ly + sill, lw, lhw, -lz + .17, { pOpen: .1, backing: true });
  const pz = lz - .02, pw = .15;
  if (type === 'zinc') {   // lucarne capucine tout zinc, toit cintré
    for (const k of [-1, 1]) zn.push(box(T, pw, top - ly + .05, .14, cx + k * (lw / 2 + pw / 2), (ly + top) / 2, pz, 1.6));
    zn.push(box(T, lw + .3, sill, .16, cx, ly + sill / 2, pz, 1.6)); zn.push(box(T, lw + .3, .12, .16, cx, top + .06, pz, 1.6));
    const rr = lw / 2 + .2; zn.push(new T.CylinderGeometry(rr, rr, 1.6, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, .55, 1).translate(cx, top + .12, lz - .7));
    G.zinc.push(new T.SphereGeometry(.05, 6, 4).translate(cx, top + .12 + rr * .55 + .03, lz + .05));   // épi de faîtage
    return;
  }
  if (type === 'chien') {   // chien-assis faubourien, front enduit, toit en appentis
    stone.push(box(T, lw + .36, sill, .14, cx, ly + sill / 2, pz)); for (const k of [-1, 1]) stone.push(box(T, .18, top - ly, .14, cx + k * (lw / 2 + .09), (ly + top) / 2, pz));
    stone.push(box(T, lw + .36, .14, .14, cx, top + .07, pz));
    zn.push(new T.BoxGeometry(lw + .5, .06, 1.9).rotateX(.22).translate(cx, top + .22, lz - .8));
    return;
  }
  // lucarnes de pierre : jambages, appui, entablement
  for (const k of [-1, 1]) stone.push(box(T, pw, top - ly, .16, cx + k * (lw / 2 + pw / 2), (ly + top) / 2, pz));
  stone.push(box(T, lw + .34, sill, .18, cx, ly + sill / 2, pz + .01));
  stone.push(box(T, lw + .42, .14, .22, cx, top + .07, pz + .02));
  const pwid = lw / 2 + .26;
  if (type === 'fronton') {
    const s = new T.Shape(); s.moveTo(-pwid, 0); s.lineTo(pwid, 0); s.lineTo(0, .42 + R() * .12); s.closePath();
    stone.push(ext(T, s, .2).translate(cx, top + .14, pz - .1));
  } else if (type === 'cintre') {
    const s = new T.Shape(); s.moveTo(-pwid, 0); s.lineTo(pwid, 0); s.absarc(0, 0, pwid, 0, Math.PI, false); s.closePath();
    stone.push(ext(T, s, .2, 14).scale(1, .42, 1).translate(cx, top + .14, pz - .1));
    stone.push(box(T, .16, .26, .24, cx, top + .2, pz + .03));
  } else {   // 'orne' : ailerons à volutes, fronton cintré, pot à feu
    const s = new T.Shape(); s.moveTo(-pwid, 0); s.lineTo(pwid, 0); s.absarc(0, 0, pwid, 0, Math.PI, false); s.closePath();
    stone.push(ext(T, s, .22, 14).scale(1, .55, 1).translate(cx, top + .14, pz - .11));
    for (const k of [-1, 1]) {
      const a = new T.Shape(); a.moveTo(0, 0); a.lineTo(.32, 0); a.quadraticCurveTo(.05, .1, 0, .7); a.closePath();
      const g = ext(T, a, .14, 8); if (k < 0) g.rotateY(Math.PI).translate(0, 0, .14); stone.push(g.translate(cx + k * (lw / 2 + pw), ly + .1, pz - .07));
      stone.push(new T.CylinderGeometry(.05, .05, .14, 10).rotateX(Math.PI / 2).translate(cx + k * (lw / 2 + pw + .3), ly + .1, pz));
    }
    for (const k of [-1, 1]) stone.push(box(T, .06, top - ly - .3, .05, cx + k * (lw / 2 + pw / 2), (ly + top) / 2, pz + .1));   // cannelures
    stone.push(new T.CylinderGeometry(.06, .1, .22, 10).translate(cx, top + .14 + pwid * .55 + .12, pz));
    stone.push(new T.SphereGeometry(.1, 10, 6).translate(cx, top + .14 + pwid * .55 + .3, pz));
  }
}

// ------------------------------------------------------------------ descentes d'eau pluviale
function descente(T, extra, M, R, x, Htop, cd, mat) {
  const r = .045 + R() * .015, z = .08, cast = M.fonte, arr = [];
  arr.push(tubeAB(T, new T.Vector3(x, Htop + .45, cd - .12), new T.Vector3(x, Htop + .05, z + .05), r * .8));   // naissance depuis le chéneau
  arr.push(new T.CylinderGeometry(.15, .07, .28, 4).rotateY(Math.PI / 4).translate(x, Htop - .06, z + .05));   // boîte à eau
  const yb = 1.1 + R() * .4;
  arr.push(new T.CylinderGeometry(r, r, Htop - .2 - yb, 10).translate(x, yb + (Htop - .2 - yb) / 2, z));
  for (let y = yb + .6; y < Htop - .3; y += 1.8 + R() * .5) arr.push(new T.CylinderGeometry(r + .014, r + .014, .05, 10).translate(x, y, z), box(T, .03, .03, .1, x, y, z - .06));   // colliers
  if (R() < .35) arr.push(new T.CylinderGeometry(r + .02, r + .01, .12, 10).translate(x, (yb + Htop) * .5, z));   // manchon de reprise
  for (const g of arr) extra.push([g, mat]);
  // dauphin en fonte au pied, coudé vers le caniveau
  extra.push([new T.CylinderGeometry(r * 1.35, r * 1.3, yb - .25, 10).translate(x, .25 + (yb - .25) / 2, z), cast]);
  extra.push([tubeAB(T, new T.Vector3(x, .3, z), new T.Vector3(x, .05, z + .22), r * 1.3), cast]);
  extra.push([new T.CylinderGeometry(r * 1.6, r * 1.6, .1, 10).translate(x, yb, z), cast]);
}

// outils partagés avec le moteur de commerces
export const H = { box: (...a) => box(...a), vc: (...a) => vc(...a), room: (...a) => room(...a), drawTags: (...a) => drawTags(...a), tagTexture: (...a) => tagTexture(...a), chaise: (...a) => chaise(...a), pot: (...a) => pot(...a), plante: (...a) => plante(...a), shopFront: (...a) => shopFront(...a), DEEP };

// ------------------------------------------------------------------ immeuble
export function buildBuilding(T, M, o) {
  const R = rng(o.seed || 7), style = o.style || 'classique';
  if (style === 'moderne') return buildModern(T, M, o, R);
  const W = o.width, D = o.depth || 12, wear = o.wear ?? .3, reno = o.reno ?? Math.max(0, 1 - wear * 1.2 + (R() - .5) * .3);
  const B = o.bays || Math.max(3, Math.round(W / (style === 'modeste' ? 2.4 : 2.6))), bw = W / B;
  const commerce = o.shops ? o.shops.length > 0 : (o.rdc ? o.rdc === 'commerce' : R() < (o.pShop ?? .5));
  const jit = () => (R() - .5) * .3;
  let F;
  if (style === 'riche') F = commerce ? [4.3 + jit(), 2.6, 3.5 + jit(), 3.2, 3.1, 3.0, 2.8] : [4.6 + jit(), 3.5 + jit(), 3.2, 3.1, 3.0, 2.8];
  else if (style === 'modeste') { const n = 4 + Math.floor(R() * 3); F = [3.4 + jit()]; for (let i = 0; i < n; i++) F.push(2.75 + jit() * .5); }
  else F = commerce ? [4.0 + jit(), 2.7, 3.4 + jit(), 3.1, 3.0, 2.8] : [4.2 + jit(), 3.4 + jit(), 3.1, 3.0, 2.85];
  // hauteur réelle (BD TOPO) : nombre d'étages déduit, puis mise à l'échelle exacte jusqu'à la gouttière
  if (o.hGout) {
    const n = Math.max(style === 'modeste' ? 1 : 2, Math.min(11, Math.round(o.hGout / (style === 'modeste' ? 2.85 : 3.05))));
    while (F.length > n) F.pop(); while (F.length < n) F.push(F[F.length - 1] ?? 2.9);
    const k = o.hGout / F.reduce((a, b) => a + b, 0); for (let i = 0; i < F.length; i++) F[i] *= k;
  }
  const ent = commerce && style !== 'modeste' && F.length >= 4;
  const lastF = F.length - 1, nobleF = Math.min(ent ? 2 : 1, lastF);
  const tone = new T.Color(o.tone || 0xffffff);
  if (o.toneJit !== 0) tone.offsetHSL((R() - .5) * .012, (R() - .5) * .06, (R() - .5) * .04);
  const kind = style === 'modeste' ? 'enduit' : 'pierre';
  const G = { lod: o.lod || 0, mur: [], rdc: [], moul: [], zinc: [], fonte: [], garde0: [], garde1: [], menu: [], rid: [], ridT: [], vc: [], lampe: [], terre: [], tube: [], verre0: [], verre1: [], verre2: [], lum: [], vit: [] };
  const extra = [];
  const REC = style === 'riche' ? .34 : .28, winW = Math.min(1.3, bw * .48);
  const yF = []; let y = 0; for (const h of F) { yF.push(y); y += h; } const Htop = y;
  // Métadonnées exactes des baies générées, conservées pour le mode express sans plan intérieur.
  const facadeWindows = [];
  // masse de l'immeuble en retrait (les pièces visibles occupent les DEEP premiers mètres) + joues latérales
  G.mur.push(box(T, W, Htop, D - REC - DEEP, W / 2, Htop / 2, -REC - DEEP - (D - REC - DEEP) / 2));
  for (const x of [.06, W - .06]) G.mur.push(box(T, .12, Htop, DEEP, x, Htop / 2, -REC - DEEP / 2));
  const shopName = ['BOULANGERIE', 'PHARMACIE', 'CAFÉ', 'TABAC', 'FLEURS', 'PRESSING', 'LIBRAIRIE', 'OPTIQUE', 'BOUCHERIE', 'FROMAGERIE', 'ÉPICERIE', 'RESTAURANT', 'CAVE À VINS', 'IMMOBILIER', 'COIFFURE', 'BISTROT', 'LAVERIE', 'TRAITEUR'];
  let doorBay = Math.min(B - 1, Math.floor(B / 2) + (R() < .5 ? 0 : (R() < .5 ? -1 : 1)));
  // commerces positionnés (u = position réelle le long de la façade, 0..1) : la porte d'immeuble va dans la travée la plus éloignée des commerces
  const posees = o.shops && o.shops.length && o.shops.every(s => s.u !== undefined);
  if (posees && B > o.shops.length) { let best = -1; for (let b = 0; b < B; b++) { const c = (b + .5) / B, dmin = Math.min(...o.shops.map(s => Math.abs(s.u - c))) - Math.abs(c - .5) * .15; if (dmin > best) { best = dmin; doorBay = b; } } }
  const oriel = style === 'riche' && B >= 5 && R() < .75;
  const orielBays = oriel ? (B % 2 ? [Math.floor(B / 2)] : [B / 2 - 1, B / 2]) : [];
  const cochere = R() < ({ riche: .9, classique: .75, modeste: .3 }[style] ?? .6);
  const verdure = (o.verdure ?? (style === 'riche' ? .55 : style === 'modeste' ? .45 : .5)) * (.5 + R());
  const palApp = R() < .5 ? MURS_INT[Math.floor(R() * MURS_INT.length)] : undefined;   // parfois un même ton d'appartement par immeuble
  const pOpen = o.pOpen ?? .12;
  let tagsRdc = 0;
  // commerces réels : chaque commerce occupe une suite de travées (hors porte d'immeuble)
  const bayShop = [];
  if (commerce && o.shops && o.shopBuilder) {
    const bays = []; for (let b = 0; b < B; b++) if (b !== doorBay) bays.push(b);
    const n = Math.min(o.shops.length, bays.length);
    if (posees) bays.forEach(b => { const c = (b + .5) / B; let k = 0; o.shops.slice(0, n).forEach((s, i) => { if (Math.abs(s.u - c) < Math.abs(o.shops[k].u - c)) k = i; }); bayShop[b] = { shop: o.shops[k], k }; });
    else bays.forEach((b, i) => { const k = Math.min(n - 1, Math.floor(i * n / bays.length)); bayShop[b] = { shop: o.shops[k], k }; });
    // un commerce sans travée (trop de commerces pour la façade) est ignoré ; les groupes restent contigus
    for (const b of bays) { const k = bayShop[b].k; let grp = [b]; for (let x = b - 1; x >= 0 && bayShop[x]?.k === k; x--) grp.unshift(x); for (let x = b + 1; x < B && bayShop[x]?.k === k; x++) grp.push(x); Object.assign(bayShop[b], { first: b === grp[0], last: b === grp[grp.length - 1], gx0: grp[0] * bw, gx1: (grp[grp.length - 1] + 1) * bw }); }
  }

  for (let f = 0; f < F.length; f++) {
    const y0 = yF[f], h = F[f];
    const base = f === 0 || (ent && f === 1);
    if (ent && f === 1) continue;
    const hh = (ent && f === 0) ? F[0] + F[1] : h, gArr = base ? G.rdc : G.mur;
    const palF = palApp ?? (R() < .6 ? MURS_INT[Math.floor(R() * MURS_INT.length)] : undefined);
    for (let b = 0; b < B; b++) {
      const cx = (b + .5) * bw, isDoor = base && b === doorBay && (!commerce || !!o.shopBuilder);
      let ww, wh, sill;
      if (base && commerce && !isDoor) { ww = bw * .8; wh = F[0] - .3; sill = .25; }
      else if (isDoor && commerce) { ww = Math.min(1.5, bw * .58); wh = Math.min(F[0] - .3, 3.3); sill = .1; }
      else if (isDoor) { ww = cochere ? Math.min(3.0, bw * .88) : Math.min(1.5, bw * .6); wh = cochere ? Math.min(F[0] - .3, 3.9) : F[0] * .78; sill = .1; }
      else if (base) { ww = winW; wh = F[0] * .6; sill = F[0] * .25; }
      else { ww = winW; wh = h * (f === nobleF ? .7 : .66); sill = h * .12; if (f === lastF && style !== 'modeste') wh = h * .62; }
      const pierW = (bw - ww) / 2, top = y0 + sill + wh;
      gArr.push(box(T, pierW, hh, REC, cx - ww / 2 - pierW / 2, y0 + hh / 2, -REC / 2));
      gArr.push(box(T, pierW, hh, REC, cx + ww / 2 + pierW / 2, y0 + hh / 2, -REC / 2));
      gArr.push(box(T, ww, sill, REC, cx, y0 + sill / 2, -REC / 2));
      if (ent && f === 0) {
        const e0 = F[0] + .35, e1 = F[0] + F[1] - .45, ew = ww * .62;
        gArr.push(box(T, ww, e0 - top, REC, cx, (top + e0) / 2, -REC / 2));
        gArr.push(box(T, ww, y0 + hh - e1, REC, cx, (e1 + y0 + hh) / 2, -REC / 2));
        gArr.push(box(T, (ww - ew) / 2, e1 - e0, REC, cx - ww / 2 + (ww - ew) / 4, (e0 + e1) / 2, -REC / 2));
        gArr.push(box(T, (ww - ew) / 2, e1 - e0, REC, cx + ww / 2 - (ww - ew) / 4, (e0 + e1) / 2, -REC / 2));
        windowUnit(T, G, R, cx, e0, ew, e1 - e0, REC, { pOpen: .04, deep: .9, floorDrop: .3 });
      } else gArr.push(box(T, ww, y0 + hh - top, REC, cx, (top + y0 + hh) / 2, -REC / 2));
      if (base) {
        if (style !== 'modeste' && !G.lod) for (let yy = .42, i = 0; yy < hh - .15; yy += .42, i++) for (const sx of [-1, 1]) {   // refends : assises en relief, joints verticaux décalés
          const px = cx + sx * (ww / 2 + pierW / 2); G.rdc.push(box(T, pierW + .002, .36, .035, px, yy - .21, .017));
          if (pierW > .5) G.rdc.push(box(T, .03, .36, .05, px + (i % 2 ? .2 : -.2) * pierW, yy - .21, .01));
        }
        if (commerce && !isDoor && o.shopBuilder) {
          const sh = bayShop[b]; o.shopBuilder({ T, G, extra, M, R, H, cx, y0: y0 + sill, ww, wh, REC, bw, shop: sh.shop, first: sh.first, last: sh.last, gx0: sh.gx0, gx1: sh.gx1, style, wear, reno, tagP: o.tagP ?? .5, trottoir: o.trottoir ?? 3.5, hh, ent });
        } else if (commerce && !isDoor) {
          const closed = R() < (o.pClosed ?? .3);
          shopFront(T, G, extra, M, R, cx, y0 + sill, ww, wh, REC, shopName[Math.floor(R() * shopName.length)], !closed && b === doorBay && R() < .5, closed, o.tagP ?? .6);
        } else if (isDoor) entryDoor(T, G, extra, M, R, cx, y0 + sill, ww, wh, REC, o.numero ?? (2 + Math.floor(R() * 60)), { cochere: cochere && !commerce, style, reno, pal: o.doorPal, tagP: (o.tagP ?? .3) * .5 });
        else { windowUnit(T, G, R, cx, y0 + sill, ww, wh, REC, { pOpen: .02, floorDrop: sill });
          facadeWindows.push({ floor:f, bay:b, x:cx, y:y0+sill+wh/2, z:-REC+.07, surfaceZ:.06, width:ww, height:wh }); if (!G.lod) for (let x = cx - ww / 2 + .08; x < cx + ww / 2; x += .14) G.fonte.push(box(T, .02, wh * .55, .02, x, y0 + sill + wh * .28, -.04)); G.fonte.push(box(T, ww, .03, .03, cx, y0 + sill + wh * .55, -.04)); }
        // tag sur un trumeau du rez-de-chaussée (quartiers usés)
        if (wear > .45 && tagsRdc < 2 && R() < (o.tagP ?? .3) * .35) { tagsRdc++; const tw = Math.max(1.2, pierW * 2 + .4); extra.push([new T.PlaneGeometry(tw, tw * .5).translate(cx + ww / 2 + pierW, .9 + R() * .5, .012), new T.MeshStandardMaterial({ map: tagTexture(T, R, 1 + Math.floor(R() * 2)), transparent: true, roughness: .8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })]); }
        continue;
      }
      if (orielBays.includes(b) && f >= nobleF && f < lastF) continue;
      windowUnit(T, G, R, cx, y0 + sill, ww, wh, REC, { pOpen, pal: palF, floorDrop: sill + .05 });
      facadeWindows.push({ floor:f, bay:b, x:cx, y:y0+sill+wh/2, z:-REC+.07, width:ww, height:wh });
      const cw = style === 'modeste' ? .09 : .13, cz = style === 'modeste' ? .025 : .045;
      G.moul.push(box(T, cw, wh + cw, cz, cx - ww / 2 - cw / 2, y0 + sill + (wh + cw) / 2, cz / 2));
      G.moul.push(box(T, cw, wh + cw, cz, cx + ww / 2 + cw / 2, y0 + sill + (wh + cw) / 2, cz / 2));
      G.moul.push(box(T, ww + 2 * cw, cw, cz, cx, y0 + sill + wh + cw / 2, cz / 2));
      if (style !== 'modeste' && f !== nobleF && !G.lod) {   // agrafe (clé sculptée) au-dessus de chaque fenêtre
        const k = new T.Shape(); k.moveTo(-.09, 0); k.lineTo(.09, 0); k.lineTo(.13, .32); k.lineTo(-.13, .32); k.closePath();
        G.moul.push(ext(T, k, .09, 1).translate(cx, y0 + sill + wh - .06, 0));
        if (style === 'riche' && f === nobleF + 1) G.moul.push(new T.SphereGeometry(.09, 8, 6).scale(1, 1.2, .6).translate(cx, y0 + sill + wh + .12, .09));   // mascaron
      }
      if (style === 'modeste') {
        const pm = M.persienne[Math.floor((o.seed || 1) % M.persienne.length)], closed = R() < .14;
        for (const sd of [-1, 1]) {
          const pw = ww / 2, px = closed ? cx + sd * pw / 2 : cx + sd * (ww / 2 + cw + pw / 2 + .02), pz = closed ? -REC + .16 : .04;
          extra.push([box(T, pw - .02, wh, .035, px, y0 + sill + wh / 2, pz), pm]);
          for (let yy = y0 + sill + .1; yy < y0 + sill + wh - .05; yy += .09) extra.push([box(T, pw - .06, .018, .02, px, yy, pz + .025), pm]);
        }
        // garde-corps simple + jardinière sur support
        if (f !== lastF) { G.fonte.push(box(T, ww, .03, .03, cx, y0 + sill + .95, .03)); for (let x = cx - ww / 2 + .1; x < cx + ww / 2; x += .12) G.fonte.push(box(T, .015, .9, .015, x, y0 + sill + .5, .03)); }
        if (R() < verdure * .5) jardiniere(T, G, R, cx - ww / 2 + .05, cx + ww / 2 - .05, y0 + sill + .02, .2, R() < .7, true);
        continue;
      }
      if (f === nobleF) {
        const tri = b % 2 === 0, pw = ww / 2 + .3, s = new T.Shape();
        if (tri) { s.moveTo(-pw, 0); s.lineTo(pw, 0); s.lineTo(0, .45); s.closePath(); } else { s.moveTo(-pw, 0); s.lineTo(pw, 0); s.absarc(0, 0, pw, 0, Math.PI, false); s.closePath(); }
        const pg = new T.ExtrudeGeometry(s, { depth: .16, bevelEnabled: false, curveSegments: 12 }); if (!tri) pg.scale(1, .36, 1); pg.translate(cx, y0 + sill + wh + .22, -.02); G.moul.push(pg);
        G.moul.push(box(T, ww + .66, .13, .22, cx, y0 + sill + wh + .18, .07));
        if (!G.lod) for (const k of [-1, 1]) { const c = new T.Shape(); c.moveTo(0, 0); c.lineTo(.18, 0); c.quadraticCurveTo(.2, -.25, .06, -.45); c.lineTo(0, -.45); c.closePath(); const cg = new T.ExtrudeGeometry(c, { depth: .15, bevelEnabled: false, curveSegments: 5 }); cg.rotateY(-Math.PI / 2); cg.translate(cx + k * (ww / 2 + .22) + .075, y0 + sill + wh + .12, 0); G.moul.push(cg); }
      } else if (f < lastF) {
        if (style === 'riche' && f === nobleF + 1) G.moul.push(box(T, .22, .3, .08, cx, y0 + sill + wh + .1, .05));
        rail(T, G, cx - ww / 2 - .06, cx + ww / 2 + .06, y0 + sill, .95, .12, style === 'riche');
        // jardinière posée sur l'appui, tenue par des supports derrière le garde-corps
        if (R() < verdure * .45) jardiniere(T, G, R, cx - ww / 2 + .02, cx + ww / 2 - .02, y0 + sill + .02, .02, R() < .8, true);
      }
    }
    if (!base && style !== 'modeste') G.moul.push(box(T, W + .1, .15, .13, W / 2, y0 + .07, .065));
    if (!base && style === 'modeste' && f === 1) G.moul.push(box(T, W, .2, .08, W / 2, y0 + .1, .04));
  }
  const ys = ent ? F[0] + F[1] : F[0];
  G.moul.push(extrudeX(T, moulure(T, style === 'modeste' ? .14 : .34, .3), W + .3, -.15, ys - .3, 0));
  if (oriel) {
    const x0 = orielBays[0] * bw + .15, x1 = (orielBays[orielBays.length - 1] + 1) * bw - .15, od = .75;
    const ya = yF[nobleF], yb = yF[lastF];
    G.mur.push(box(T, .25, yb - ya, od + .04, x0 + .125, (ya + yb) / 2, od / 2));
    G.mur.push(box(T, .25, yb - ya, od + .04, x1 - .125, (ya + yb) / 2, od / 2));
    const cl = new T.Shape(); cl.moveTo(0, 0); cl.lineTo(od, 0); cl.quadraticCurveTo(od * .4, -.2, 0, -1.1); cl.closePath();
    G.moul.push(extrudeX(T, cl, x1 - x0, x0, ya, 0));
    for (let f = nobleF; f < lastF; f++) {
      const n = orielBays.length + 1, inner = x1 - x0 - .5, cw = inner / n, wh = F[f] * .62, sill = F[f] * .16, yy = yF[f], zf = od - .14;
      G.mur.push(box(T, inner, sill, .28, (x0 + x1) / 2, yy + sill / 2, zf));
      G.mur.push(box(T, inner, F[f] - sill - wh, .28, (x0 + x1) / 2, yy + sill + wh + (F[f] - sill - wh) / 2, zf));
      for (let k = 1; k < n; k++) G.mur.push(box(T, .22, wh, .28, x0 + .25 + cw * k, yy + sill + wh / 2, zf));
      for (let k = 0; k < n; k++) { const cx = x0 + .25 + cw * (k + .5); windowUnit(T, G, R, cx, yy + sill, cw - .26, wh, .37 - od, { pOpen: .05, deep: REC + DEEP - .1 - (.37 - od), floorDrop: sill }); facadeWindows.push({ floor:f, bay:'oriel-'+k, x:cx, y:yy+sill+wh/2, z:od-.14, surfaceZ:od+.06, width:cw-.26, height:wh }); }
      G.moul.push(box(T, x1 - x0 + .1, .16, od + .1, (x0 + x1) / 2, yy + .08, od / 2));
    }
  }
  // balcons filants : étage noble et dernier étage carré, garnis
  for (const f of style === 'modeste' ? [lastF] : [...new Set([nobleF, lastF])]) {
    if (f < 1) continue;
    const by = yF[f], dep = f === nobleF ? .85 : .7;
    G.moul.push(box(T, W + .1, .17, dep, W / 2, by + .02, dep / 2));
    G.moul.push(box(T, W + .14, .05, dep + .04, W / 2, by - .07, dep / 2));
    for (let b = 0; b <= B; b++) {
      const cx = Math.min(W - .15, Math.max(.15, b * bw)), c = new T.Shape();
      c.moveTo(0, 0); c.lineTo(dep * .9, 0); c.quadraticCurveTo(dep * .25, -.12, 0, -.6); c.closePath();
      const g = new T.ExtrudeGeometry(c, { depth: .2, bevelEnabled: false, curveSegments: 6 }); g.rotateY(-Math.PI / 2); g.translate(cx + .1, by - .06, 0); G.moul.push(g);
    }
    rail(T, G, 0, W, by + .1, 1.0, dep - .06, style === 'riche');
    decoBalcon(T, G, R, 0, W, by + .105, 0, dep - .1, style, verdure * (f === lastF ? 1.2 : 1));
    if (R() < verdure * .4) for (let x = .4; x < W - .9; x += 1.3 + R() * 2.5) if (R() < .5) jardiniere(T, G, R, x, x + .9, by + .62, dep + .06, R() < .8, true);   // bacs accrochés côté rue
  }
  // corniche
  const cd = style === 'modeste' ? .35 : .6;
  G.moul.push(extrudeX(T, moulure(T, cd, .55), W + .4, -.2, Htop - .12, 0));
  if (style !== 'modeste' && !G.lod) for (let x = .1; x < W; x += .19) G.moul.push(box(T, .09, .12, .14, x, Htop - .18, .1));
  G.zinc.push(box(T, W + .4, .14, .3, W / 2, Htop + .5, cd - .1, 1.6));
  // toit : mansarde zinc (riche/classique) ou toit à 45° (modeste)
  const mh = style === 'modeste' ? 2.8 : 3.6, mb = style === 'modeste' ? 2.8 : 1.35, mt = 2.6;
  const ms = new T.Shape(); ms.moveTo(.35, 0); ms.lineTo(-mb + .35, mh); ms.lineTo(-mb - mt, mh + .9); ms.lineTo(-D + .2, mh + .9); ms.lineTo(-D + .2, 0); ms.closePath();
  const roof = new T.ExtrudeGeometry(ms, { depth: W + .3, bevelEnabled: false }); roof.rotateY(-Math.PI / 2); roof.translate(W + .15, Htop + .1, 0);
  { const p = roof.attributes.position, uv = roof.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 1.6, (p.getY(i) - p.getZ(i)) / 1.6); }
  G.zinc.push(roof);
  // lucarnes : type propre à chaque immeuble (parfois deux types alternés), tailles variées
  const types = style === 'riche' ? [['orne', 3], ['fronton', 2], ['cintre', 2], ['oeil', .6]]
    : style === 'modeste' ? [['chien', 3], ['tabatiere', 3], ['zinc', 1.5], ['oeil', .5]]
    : [['fronton', 2], ['cintre', 2], ['zinc', 2.5], ['oeil', 1.2], ['orne', .4]];
  const t1 = pickW(R, types), t2 = R() < .3 ? pickW(R, types) : t1;
  const lw = Math.min(1.15, winW * (.68 + R() * .25)), lhw = 1.0 + R() * .45, lz = .32;
  const lucStep = style === 'modeste' ? (R() < .5 ? 1 : 2) : 1, roofI = { mh, mb };
  for (let b = 0; b < B; b += lucStep) {
    if (R() < .06) continue;   // lucarne supprimée / remplacée
    const cx = (b + .5) * bw, t = b % 2 ? t2 : t1;
    lucarne(T, G, R, t, cx, Htop, t === 'oeil' ? lw * .9 : lw, lhw, style === 'modeste' && t !== 'tabatiere' ? -.05 : lz, roofI);
  }
  // cheminées, antennes
  const nC = Math.max(1, Math.round(W / 9));
  for (let k = 0; k < nC; k++) {
    const cx = (k + .5) * W / nC + (R() - .5), ch = 1.2 + R() * .9, cy = Htop + mh + .9, cz = -D * (.35 + R() * .3), cw2 = .9 + R() * 1.1;
    G.mur.push(box(T, cw2, ch, .7, cx, cy + ch / 2, cz));
    G.moul.push(box(T, cw2 + .14, .14, .84, cx, cy + ch, cz));
    for (let p = 0; p < Math.round(cw2 / .35); p++) G.terre.push(new T.CylinderGeometry(.08, .1, .3 + R() * .2, 8).translate(cx - cw2 / 2 + .2 + p * .35, cy + ch + .28, cz));
  }
  for (let k = 0; k < (R() < .5 ? 1 : 0); k++) {
    const ax = W * (.2 + R() * .6), az = -D * (.5 + R() * .3), ay = Htop + mh + .9;
    G.tube.push(new T.CylinderGeometry(.025, .03, 3.2, 6).translate(ax, ay + 1.6, az));
    for (let j = 0; j < 4; j++) G.tube.push(box(T, 1.4 - j * .2, .02, .02, ax, ay + 2.2 + j * .25, az));
  }
  // descentes d'eau : 1 à 3, matière propre à l'immeuble (zinc, fonte noire, peinte en vert ou ton façade)
  {
    const dm = R() < .15 ? M.paint(tone.clone().multiplyScalar(.82).getHex(), .6) : M.descentes[Math.floor(R() * M.descentes.length)];
    const cands = [.14, W - .14]; for (let b = 1; b < B; b++) if (!orielBays.includes(b) && !orielBays.includes(b - 1) && b !== doorBay && b !== doorBay + 1) cands.push(b * bw);
    const n = W < 11 ? 1 : 1 + Math.floor(R() * 2.5);
    const used = new Set(); for (let k = 0; k < n; k++) { const i = k === 0 ? (R() < .5 ? 0 : 1) : Math.floor(R() * cands.length); if (used.has(i)) continue; used.add(i); descente(T, extra, M, R, cands[i], Htop, cd, dm); }
  }
  // assemblage
  const wq = v => Math.round(v * 8) / 8;
  const wallM = M.wall(kind, 0, wq(wear), 'vc'), rdcM = M.wall(kind, 0, wq(Math.min(1, wear + .15)), 'vc'), moulM = M.wall(kind, 0, wq(wear * .9), 'vc');
  const teint = (arr, c) => { for (let i = 0; i < arr.length; i++) arr[i] = vc(T, arr[i], c.getHex()); };
  teint(G.mur, tone); teint(G.rdc, tone.clone().multiplyScalar(.95)); teint(G.moul, tone.clone().lerp(new T.Color(0xffffff), .25));
  const grp = new T.Group();
  const add = (arr, mat, shadow = true) => { if (!arr.length) return; const g = mergeGeometries(arr.map(a => a.index ? a.toNonIndexed() : a), false); g.computeVertexNormals(); const m = new T.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; grp.add(m); };
  add(G.mur, wallM); add(G.rdc, rdcM); add(G.moul, moulM); add(G.zinc, M.zinc); add(G.fonte, M.fonte); add(G.menu, M.menuiserie); add(G.rid, M.rideau); add(G.ridT, M.rideauTire);
  add(G.vc, M.vc); add(G.garde0, M.garde[0]); add(G.garde1, M.garde[1]); add(G.lampe, M.lampe, false); add(G.terre, M.terre); add(G.tube, M.zincTube); add(G.lum, M.vitrineLum, false);
  for (let i = 0; i < 3; i++) add(G['verre' + i], M.verres[i], false);
  add(G.vit, M.vitre, false);
  const byMat = new Map(); for (const [g, m] of extra) { if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(g); } for (const [m, a] of byMat) add(a, m);
  grp.userData.etages = { yF: yF.slice(), F: F.slice(), ent, windows: facadeWindows };   // hauteurs réelles des niveaux (Appart Studio : aimantage de l'étage)
  return grp;
}

// ------------------------------------------------------------------ devanture (ouverte, ou fermée par rideau / grille tagués)
function shopFront(T, G, extra, M, R, cx, y0, ww, wh, REC, name, auvent, closed, tagP) {
  const mat = M.vitrines[Math.floor(R() * M.vitrines.length)], z = -REC + .1;
  for (const g of [box(T, ww, .5, .14, cx, y0 + wh - .25, z), box(T, .14, wh - .5, .14, cx - ww / 2 + .07, y0 + (wh - .5) / 2, z), box(T, .14, wh - .5, .14, cx + ww / 2 - .07, y0 + (wh - .5) / 2, z), box(T, ww, .45, .14, cx, y0 + .22, z), box(T, .07, wh - .95, .1, cx + ww * .18, y0 + .45 + (wh - .95) / 2, z)]) extra.push([g, mat]);
  G.vit.push(box(T, ww - .28, wh - .95, .01, cx, y0 + .45 + (wh - .95) / 2, z - .02));
  room(T, G, R, cx, y0 - .25, ww + .3, wh + .25, -REC, DEEP - .05, { shop: true, pal: closed ? 0x5a5650 : 0xd9cdb8 });
  if (!closed) {
    G.lum.push(box(T, ww * .9, wh * .7, .02, cx, y0 + wh * .4, -REC - DEEP + .1));
    for (let s = 0; s < 3; s++) G.vc.push(vc(T, new T.BoxGeometry(ww * .8, .04, .35).translate(cx, y0 + .5 + s * .55, -REC - DEEP + .3), 0xe9e2d4));   // étagères
    G.vc.push(vc(T, new T.BoxGeometry(ww * .5, .95, .5).translate(cx - ww * .1, y0 + .47, -REC - .9), 0x6b4a2e));   // comptoir
  }
  // enseigne peinte (délavée quand le commerce est fermé)
  const c = document.createElement('canvas'); c.width = 512 * TQ; c.height = 64 * TQ; const g = c.getContext('2d'); g.scale(TQ, TQ);
  g.fillStyle = '#' + mat.color.getHexString(); g.fillRect(0, 0, 512, 64); g.fillStyle = closed ? '#9d978a' : '#e9dfc4'; g.font = 'bold 38px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 256, 34);
  if (closed && R() < .5) { g.fillStyle = 'rgba(40,40,40,.5)'; g.fillRect(0, 0, 512, 64); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  extra.push([new T.PlaneGeometry(ww - .2, .36).translate(cx, y0 + wh - .25, z + .075), new T.MeshStandardMaterial({ map: t, roughness: .5 })]);
  if (closed) {
    const sh = wh - .5, sw = ww - .1, zz = z + .09, tags = R() < tagP;
    extra.push([box(T, ww + .06, .32, .22, cx, y0 + wh - .5 + .16, zz - .02), M.paint(0x6c6f70, .55, .4)]);   // coffre du rideau
    for (const k of [-1, 1]) extra.push([box(T, .06, sh, .08, cx + k * (sw / 2 + .02), y0 + sh / 2, zz), M.paint(0x55585a, .5, .5)]);   // coulisses
    const cv = document.createElement('canvas'); cv.width = 512 * TQ; cv.height = 384 * TQ; const q = cv.getContext('2d'); q.scale(TQ, TQ);
    const grille = R() < .25;
    if (grille) {   // grille articulée : losanges ajourés
      q.clearRect(0, 0, 512, 384); q.strokeStyle = '#8e9294'; q.lineWidth = 5;
      for (let x = -384; x < 512; x += 32) { q.beginPath(); q.moveTo(x, 0); q.lineTo(x + 384, 384); q.stroke(); q.beginPath(); q.moveTo(x + 384, 0); q.lineTo(x, 384); q.stroke(); }
      q.lineWidth = 7; for (let y = 0; y < 384; y += 48) { q.beginPath(); q.moveTo(0, y); q.lineTo(512, y); q.stroke(); }
    } else {   // rideau à lames : teinte de base + crasse en bas + éventuelle ancienne peinture
      const base = R() < .7 ? [150, 154, 156] : [[70, 90, 110], [120, 40, 40], [60, 90, 70]][Math.floor(R() * 3)];
      q.fillStyle = `rgb(${base})`; q.fillRect(0, 0, 512, 384);
      for (let y = 0; y < 384; y += 9) { q.fillStyle = 'rgba(0,0,0,.18)'; q.fillRect(0, y, 512, 2); q.fillStyle = 'rgba(255,255,255,.08)'; q.fillRect(0, y + 3, 512, 2); }
      const gd = q.createLinearGradient(0, 230, 0, 384); gd.addColorStop(0, 'rgba(40,35,30,0)'); gd.addColorStop(1, 'rgba(40,35,30,.45)'); q.fillStyle = gd; q.fillRect(0, 0, 512, 384);
      for (let i = 0; i < 25; i++) { q.fillStyle = `rgba(${R() < .5 ? '90,60,40' : '30,30,30'},${.05 + R() * .12})`; q.fillRect(R() * 512, R() * 384, 3 + R() * 40, 3 + R() * 20); }
      if (R() < .3) { q.fillStyle = '#f4f1e8'; q.fillRect(150, 120, 212, 90); q.fillStyle = '#c62828'; q.font = 'bold 44px Arial'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText('À LOUER', 256, 152); q.font = '22px Arial'; q.fillStyle = '#333'; q.fillText('01 4' + Math.floor(R() * 9) + ' ' + (10 + Math.floor(R() * 89)) + ' ' + (10 + Math.floor(R() * 89)) + ' ' + (10 + Math.floor(R() * 89)), 256, 188); }
    }
    if (tags) drawTags(q, R, 512, 384, 2 + Math.floor(R() * 5));
    const tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace;
    const bump = M.ribs.clone(); bump.needsUpdate = true; bump.repeat.set(1, sh / .09);
    const mm = new T.MeshStandardMaterial({ map: tx, metalness: grille ? .6 : .45, roughness: .55, bumpMap: grille ? null : bump, bumpScale: 1.5, transparent: grille, alphaTest: grille ? .4 : 0, side: grille ? T.DoubleSide : T.FrontSide });
    extra.push([new T.PlaneGeometry(sw, sh).translate(cx, y0 + sh / 2, zz), mm]);
  }
  if (auvent) {
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 16; const s = sc.getContext('2d'); const col = ['#7a1f23', '#1f4a3a', '#1e2a44', '#8a6a2a'][Math.floor(R() * 4)];
    for (let i = 0; i < 16; i++) { s.fillStyle = i % 2 ? '#efe7d6' : col; s.fillRect(i * 16, 0, 16, 16); }
    const st = new T.CanvasTexture(sc); st.colorSpace = T.SRGBColorSpace;
    const aw = new T.PlaneGeometry(ww + .2, 1.6); aw.rotateX(-1.05); aw.translate(cx, y0 + wh + .05 - .6, .7);
    extra.push([aw, new T.MeshStandardMaterial({ map: st, roughness: .9, side: T.DoubleSide })]);
  }
}

// ------------------------------------------------------------------ porte d'entrée / porte cochère
const DOOR_PAL = { riche: [0x14261d, 0x0f0f10, 0x3a1418, 0x1b2436, 0x6b4a2b, 0x2a2a2a], classique: [0x1f3a2e, 0x4a1c22, 0x1b2740, 0x3b2a1c, 0x2a2a2a, 0x5a4632, 0x26332d], modeste: [0x5b5f60, 0x3d3a36, 0x4d5a50, 0x6e5a44, 0x2f3d4f, 0x7a3a2a, 0x8a8a85] };
function entryDoor(T, G, extra, M, R, cx, y0, ww, wh, REC, num, o) {
  const pal = o.pal || DOOR_PAL[o.style] || DOOR_PAL.classique, reno = o.reno;
  const c = new T.Color(pal[Math.floor(R() * pal.length)]); if (reno < .5) c.lerp(new T.Color(0xa9a49a), (.5 - reno) * .6);
  const mat = M.paint(c.getHex(), .18 + (1 - reno) * .7, .06), z = -REC + .07;
  const arch = o.cochere ? pickW(R, [[1, 3], [.55, 3], [0, 2]]) : (R() < .3 ? 1 : 0);   // plein cintre / anse de panier / linteau droit
  const r = ww / 2, rise = r * arch, spring = y0 + wh - rise;
  if (arch) {   // écoinçons en pierre au-dessus de l'arc
    for (const k of [-1, 1]) {
      const s = new T.Shape(); s.moveTo(k * r, 0); s.lineTo(k * r, r); s.lineTo(0, r); s.absarc(0, 0, r, Math.PI / 2, k < 0 ? Math.PI : 0, k > 0); s.closePath();
      G.rdc.push(ext(T, s, REC, 12).scale(1, arch, 1).translate(cx, spring, -REC));
    }
    G.rdc.push(box(T, .3, .42, REC + .06, cx, y0 + wh - .12, -REC / 2 + .03));   // clef d'arc
  }
  const imp = arch ? 0 : (o.cochere ? .7 : .5), dh = spring - y0 - imp, lw = ww / 2;
  const typ = o.style === 'modeste' && reno < .6 ? pickW(R, [['moderne', 3], ['panneaux', 2], ['vitree', 1]]) : pickW(R, [['panneaux', 4], ['clous', o.style === 'riche' ? 2 : .7], ['vitree', 2]]);
  for (const k of [-1, 1]) {
    const lx = cx + k * lw / 2;
    extra.push([box(T, lw - .02, dh, .1, lx, y0 + dh / 2, z), mat]);
    if (typ === 'moderne') { for (let x = lx - lw / 2 + .12; x < lx + lw / 2 - .05; x += .12) extra.push([box(T, .015, dh - .2, .02, x, y0 + dh / 2, z + .055), M.paint(c.clone().multiplyScalar(.8).getHex(), .6)]); continue; }
    if (typ === 'vitree') {   // partie haute vitrée avec grille en fer forgé
      const gy0 = y0 + dh * .38, gh = dh * .55;
      G['verre' + Math.floor(R() * 3)].push(box(T, lw - .3, gh, .01, lx, gy0 + gh / 2, z + .06));
      for (let x = lx - lw / 2 + .2; x < lx + lw / 2 - .15; x += .11) G.fonte.push(box(T, .02, gh, .025, x, gy0 + gh / 2, z + .075));
      for (const yy of [.25, .75]) G.fonte.push(box(T, lw - .3, .025, .025, lx, gy0 + gh * yy, z + .075));
      for (let x = lx - lw / 2 + .26; x < lx + lw / 2 - .2; x += .22) G.fonte.push(new T.TorusGeometry(.05, .008, 4, 10).translate(x, gy0 + gh * .5, z + .08));
      extra.push([box(T, lw - .3, dh * .26, .04, lx, y0 + dh * .19, z + .06), mat]);
    } else {
      const rows = o.cochere ? 3 : 2;
      for (let i = 0; i < rows; i++) {
        const ph = dh / rows * .74, py = y0 + dh * (i + .5) / rows;
        extra.push([box(T, lw * .72, ph, .04, lx, py, z + .065), mat]);
        extra.push([box(T, lw * .6, ph * .82, .03, lx, py, z + .09), mat]);
        if (typ === 'clous') for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) G.fonte.push(new T.SphereGeometry(.018, 5, 4).translate(lx - lw * .25 + a * lw * .5 / 3, py - ph * .3 + b * ph * .3, z + .11));
      }
    }
  }
  // portillon découpé dans un vantail (porte cochère)
  if (o.cochere && R() < .6) { const px = cx + lw / 2, pw = lw * .78, ph = Math.min(2.1, dh - .25); for (const g of [box(T, .03, ph, .03, px - pw / 2, y0 + ph / 2, z + .12), box(T, .03, ph, .03, px + pw / 2, y0 + ph / 2, z + .12), box(T, pw, .03, .03, px, y0 + ph, z + .12)]) extra.push([g, M.paint(c.clone().multiplyScalar(.6).getHex(), .5)]); extra.push([box(T, .04, .14, .05, px - pw / 2 + .1, y0 + 1.05, z + .14), M.laiton]); }
  // poignées, heurtoir
  for (const k of [-1, 1]) extra.push([box(T, .035, .2, .05, cx + k * .07, y0 + Math.min(1.1, dh * .45), z + .11), reno > .5 ? M.laiton : M.fonte]);
  if (o.style !== 'modeste' && R() < .4) extra.push([new T.TorusGeometry(.07, .014, 6, 16).translate(cx - lw / 2, y0 + 1.5, z + .13), M.laiton]);
  extra.push([box(T, ww + .02, .1, .14, cx, spring + (arch ? 0 : 0), z + .02), mat]);   // traverse
  if (arch) {   // imposte en éventail
    const vi = Math.floor(R() * 3); G['verre' + vi].push(new T.CircleGeometry(r - .05, 24, 0, Math.PI).scale(1, arch, 1).translate(cx, spring + .05, z));
    for (let k = 1; k < 8; k++) { const a = Math.PI * k / 8, len = r * Math.sqrt(Math.cos(a) ** 2 + (arch * Math.sin(a)) ** 2); G.fonte.push(new T.BoxGeometry(.025, len, .03).translate(0, len / 2, 0).rotateZ(Math.atan2(Math.cos(a), arch * Math.sin(a)) * -1).translate(cx, spring + .05, z + .02)); }
    G.fonte.push(new T.TorusGeometry(r * .3, .02, 4, 16, Math.PI).scale(1, arch, 1).translate(cx, spring + .05, z + .03));
  } else {
    G['verre' + Math.floor(R() * 3)].push(box(T, ww, imp - .1, .01, cx, y0 + dh + imp / 2, z));
    for (let x = cx - ww / 2 + .1; x < cx + ww / 2; x += .16) G.fonte.push(box(T, .02, imp - .1, .02, x, y0 + dh + imp / 2, z + .03));
  }
  G.vc.push(vc(T, new T.PlaneGeometry(ww, wh).translate(cx, y0 + wh / 2, z - .2), 0x1d1a17));   // fond du porche
  // bornes chasse-roue
  if (o.cochere && R() < .65) for (const k of [-1, 1]) G.rdc.push(new T.CylinderGeometry(.1, .2, .6, 10).translate(cx + k * (ww / 2 + .08), .3, .12));
  // digicode / interphone (portes rénovées et faubourgs)
  if (reno > .4 || o.style === 'modeste') extra.push([box(T, .16, .26, .04, cx + ww / 2 + .28, y0 + 1.35, .02), M.paint(0x8c9196, .3, .6)]);
  // plaque de numéro émaillée (atlas partagé)
  { const n = Math.max(1, Math.min(256, parseInt(String(num)) || 1)) - 1, u0 = (n % 16) / 16, v0 = 1 - (Math.floor(n / 16) + 1) / 16, g = new T.PlaneGeometry(.17, .13).translate(cx + ww / 2 + .22, y0 + 2.52, .025), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (3 + uv.getX(i) * 58) / 1024, v0 + (13 + uv.getY(i) * 38) / 1024);
    extra.push([g, M.plaques]); }
  // tag sur la porte (portes non rénovées)
  if (reno < .4 && R() < o.tagP) extra.push([new T.PlaneGeometry(lw * .9, lw * .45).translate(cx - lw / 2, y0 + .9, z + .16), new T.MeshStandardMaterial({ map: tagTexture(T, R, 1), transparent: true, roughness: .7, depthWrite: false })]);
}

// ------------------------------------------------------------------ immeuble moderne (années 60-70)
function buildModern(T, M, o, R) {
  const W = o.width, D = Math.max(o.depth || 12, 2.9), fh = 2.75, n = o.levels || (o.hGout ? Math.max(1, Math.round((o.hGout - 3.6) / fh)) : 8 + Math.floor(R() * 5)), H = 3.6 + n * fh, wear = o.wear ?? .5;
  const G = { lod: o.lod || 0, mur: [], menu: [], vc: [], lampe: [], rid: [], ridT: [], fonte: [], verre0: [], verre1: [], verre2: [], tube: [], lum: [] };
  G.mur.push(box(T, W, H, D - .3 - DEEP, W / 2, H / 2, -.3 - DEEP - (D - .3 - DEEP) / 2));
  for (const x of [.1, W - .1]) G.mur.push(box(T, .2, H, DEEP, x, H / 2, -.3 - DEEP / 2));
  for (let x = .3; x < W; x += 4) G.mur.push(box(T, .4, 3.6, .4, x, 1.8, -.2));
  G.verre0.push(box(T, W - .4, 3.2, .02, W / 2, 1.8, -1.6));
  G.vc.push(vc(T, new T.PlaneGeometry(W - .6, 3.2).translate(W / 2, 1.6, -.3 - DEEP + .1), 0x6d675e));
  G.mur.push(box(T, W, .4, DEEP, W / 2, 3.4, -.3 - DEEP / 2));
  for (let k = 0; k < n; k++) {
    const y0 = 3.6 + k * fh;
    G.mur.push(box(T, W, .35, .45, W / 2, y0 + .17, .0));
    G.mur.push(box(T, W, .85, .3, W / 2, y0 + .35 + .42, -.15));
    const nw = Math.max(2, Math.round(W / 1.6)), cw = W / nw, pal = MURS_INT[Math.floor(R() * MURS_INT.length)];
    for (let i = 0; i < nw; i++) {
      const cx = (i + .5) * cw;
      G.mur.push(box(T, .14, fh - 1.2, .3, i * cw + .07, y0 + 1.2 + (fh - 1.2) / 2, -.15));
      room(T, G, R, cx, y0 + .35, cw - .14, fh - .65, -.3, DEEP - .05, { pal: R() < .5 ? pal : undefined, pLamp: .12 });
      G['verre' + Math.floor(R() * 3)].push(box(T, cw - .16, fh - 1.35, .01, cx, y0 + 1.2 + (fh - 1.35) / 2, -.25));
      G.menu.push(box(T, cw - .16, .05, .06, cx, y0 + 1.22, -.24)); G.menu.push(box(T, .05, fh - 1.35, .06, cx, y0 + 1.2 + (fh - 1.35) / 2, -.24));
      if (R() < .45) G.rid.push(box(T, cw * .45, fh - 1.4, .02, cx - cw * .2, y0 + 1.2 + (fh - 1.4) / 2, -.4));
      if (R() < .12) pot(T, G, R, cx + (R() - .5) * cw * .5, y0 + 1.2, -.08, R() < .6);
    }
    G.mur.push(box(T, W, .3, .3, W / 2, y0 + fh - .15, -.15));
  }
  G.mur.push(box(T, W + .2, .6, .5, W / 2, H + .3, 0));
  for (let x = .2; x < W; x += 3) G.fonte.push(box(T, .04, 1, .04, x, H + 1.1, -.2));
  G.fonte.push(box(T, W, .04, .04, W / 2, H + 1.6, -.2));
  const grp = new T.Group(), tone = new T.Color(o.tone || 0xd8d4cc); tone.lerp(new T.Color(0xd8d4cc), .6);
  const wm = M.wall('beton', tone.getHex(), wear);
  const add = (arr, mat, sh = true) => { if (!arr.length) return; const g = mergeGeometries(arr.map(a => a.index ? a.toNonIndexed() : a), false); g.computeVertexNormals(); const m = new T.Mesh(g, mat); m.castShadow = sh; m.receiveShadow = true; grp.add(m); };
  add(G.mur, wm); add(G.menu, M.menuiserieGris); add(G.vc, M.vc); add(G.lampe, M.lampe, false); add(G.rid, M.rideau); add(G.fonte, M.fonte); add(G.lum, M.vitrineLum, false);
  for (let i = 0; i < 3; i++) add(G['verre' + i], M.verres[i], false);
  return grp;
}
