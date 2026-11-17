// Lampadaires parisiens — d'après les candélabres Ville de Paris (modèles Davioud : borne, fût cannelé, chapiteau, lanterne)
// et les consoles murales des rues étroites. Peinture vert Paris usée (rouille au pied, éclats, coulures, taches),
// autocollants (serruriers, plombiers, stickers d'artistes inventés, étiquettes arrachées), flyers scotchés, plaque d'identification.
// API : const L = lampadaires(T) ; L.candelabre(R, x, z, {double}) ; L.console(R, x, y, z, dir) ; L.finir() → THREE.Group
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const NOISE = `
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return .5*vn(p)+.25*vn(p*2.03)+.125*vn(p*4.01)+.0625*vn(p*8.);}`;

function peintureUsee(T, usure) {
  const m = new T.MeshStandardMaterial({ color: 0x26332c, metalness: .35, roughness: .55 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vOP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz; vOP=transformed;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vOP;' + NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { float a=atan(vWP.z-floor(vWP.z), vWP.x-floor(vWP.x)); vec2 c=vec2(vWP.x*3.1+vWP.z*2.3+a*.6, vWP.y*3.);
        float u=${usure.toFixed(2)};
        // éclats de peinture : sous-couche grise puis métal
        float ec=fbm(c*14.+7.)*.6+fbm(c*3.)*.4; float eclat=smoothstep(.70-u*.05,.72-u*.05,ec);
        diffuseColor.rgb=mix(diffuseColor.rgb, mix(vec3(.36,.37,.35),vec3(.2,.12,.07),step(.5,vn(c*30.))), eclat*.7);
        // rouille et crasse au pied (urine, eau, sel), coulures verticales
        float pied=1.-smoothstep(.0,.55+u*.4,vWP.y);
        float rou=fbm(vec2(c.x*6.,vWP.y*9.)); diffuseColor.rgb=mix(diffuseColor.rgb, vec3(.24,.13,.07), pied*smoothstep(.35,.75,rou)*(.6+u*.4));
        diffuseColor.rgb*=1.-pied*.35;
        float coul=fbm(vec2(c.x*9.,vWP.y*.6)); diffuseColor.rgb=mix(diffuseColor.rgb, diffuseColor.rgb*vec3(.8,.78,.72), smoothstep(.55,.85,coul)*u);
        // rayures et poussière
        float ray=smoothstep(.97,1.,vn(vec2(c.x*40.,vWP.y*1.5))); diffuseColor.rgb=mix(diffuseColor.rgb, vec3(.55,.56,.52), ray*.5*u);
        diffuseColor.rgb=mix(diffuseColor.rgb, vec3(.33,.32,.29), fbm(c*.8)*.25*u); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+fbm(vec2(vWP.x*5.+vWP.z*5., vWP.y*5.))*.35,.2,1.);`);
  };
  m.customProgramCacheKey = () => 'lampadaire' + usure;
  return m;
}

// ------------------------------------------------------------------ planche d'autocollants (inventés, aucun logo réel)
const MOTS = ['SERRURIER', 'PLOMBIER', 'DÉPANNAGE', 'VITRIER', 'CHAUFFAGISTE', 'ÉLECTRICIEN'];
const STK = ['ZOOK', 'MIAOU', 'LE CHAT', 'OPEN EYES', 'K-RO', 'NÉON', 'BZZZ', 'PAPOU', 'LULU', 'RÊVE', 'HELLO', 'TOTEM', 'FRIPON', 'KIKO', 'OUPS'];
const COLS = ['#e8e4d8', '#f2c230', '#d22', '#1c6fd8', '#111', '#2bb24c', '#e14fb0', '#ff7a1a', '#f4f1e8', '#7b3fd1', '#18c7c7'];
function planche(T, R) {
  const N = 6, S = 1024, cs = S / N, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  const pick = a => a[Math.floor(R() * a.length)];
  const tel = () => '06 ' + [0, 0, 0, 0].map(() => String(10 + Math.floor(R() * 89))).join(' ');
  for (let i = 0; i < N * N; i++) {
    const x0 = (i % N) * cs, y0 = Math.floor(i / N) * cs, k = i % 9;
    g.save(); g.translate(x0 + cs / 2, y0 + cs / 2); g.rotate((R() - .5) * .25);
    const w = cs * (.62 + R() * .3), h = k === 1 || k === 7 ? w : cs * (.38 + R() * .3);
    g.beginPath();
    if (k === 1 || k === 6) g.arc(0, 0, w / 2, 0, 6.29); else g.rect(-w / 2, -h / 2, w, h);
    g.save(); g.clip();
    const fond = k === 0 || k === 5 ? '#f4f1e8' : pick(COLS); g.fillStyle = fond; g.fillRect(-cs / 2, -cs / 2, cs, cs);
    const enc = ['#f4f1e8', '#f2c230', '#e8e4d8'].includes(fond) ? '#1a1a1a' : '#fff';
    g.fillStyle = enc; g.strokeStyle = enc; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (k === 0 || k === 5) {   // carte de dépanneur : métier + téléphone
      g.fillStyle = pick(['#c62828', '#1c4fa0', '#111']); g.fillRect(-w / 2, -h / 2, w, h * .38);
      g.fillStyle = '#fff'; g.font = `bold ${h * .2}px Arial`; g.fillText(pick(MOTS), 0, -h * .3);
      g.fillStyle = '#111'; g.font = `bold ${h * .17}px Arial`; g.fillText(tel(), 0, h * .08); g.font = `${h * .12}px Arial`; g.fillText('24h/24 · 7j/7', 0, h * .32);
    } else if (k === 2) {   // code-barres
      g.fillStyle = '#fff'; g.fillRect(-w / 2, -h / 2, w, h); g.fillStyle = '#111'; for (let x = -w * .42; x < w * .42; x += 3 + R() * 6) g.fillRect(x, -h * .35, 1 + R() * 4, h * .5); g.font = `${h * .14}px monospace`; g.fillText(String(Math.floor(R() * 1e12)), 0, h * .32);
    } else if (k === 3) {   // étiquette « bonjour je m'appelle » avec tag au marqueur
      g.fillStyle = '#c62828'; g.fillRect(-w / 2, -h / 2, w, h); g.fillStyle = '#fff'; g.fillRect(-w * .45, -h * .12, w * .9, h * .55);
      g.font = `bold ${h * .14}px Arial`; g.fillText('BONJOUR', 0, -h * .3); g.fillStyle = '#111'; g.font = `italic bold ${h * .32}px "Comic Sans MS", cursive`; g.fillText(pick(STK), 0, h * .16);
    } else if (k === 4) {   // QR / damier
      g.fillStyle = '#fff'; g.fillRect(-w / 2, -h / 2, w, h); g.fillStyle = '#111'; const q = Math.min(w, h) * .8 / 12; for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) if (R() < .5) g.fillRect(-q * 6 + a * q, -q * 6 + b * q, q, q);
    } else if (k === 6) {   // rond d'artiste : visage, œil, chat
      g.lineWidth = w * .05; g.beginPath(); g.arc(-w * .14, -w * .08, w * .06, 0, 6.29); g.arc(w * .14, -w * .08, w * .06, 0, 6.29); g.fill(); g.beginPath(); g.arc(0, w * .05, w * .22, .3, 2.84); g.stroke();
    } else if (k === 7) {   // autocollant arraché : reste de papier blanc + traces de colle
      g.fillStyle = '#ece8de'; g.fillRect(-w / 2, -h / 2, w, h); g.fillStyle = 'rgba(180,170,150,.6)'; for (let j = 0; j < 30; j++) g.fillRect((R() - .5) * w, (R() - .5) * h, 4 + R() * 20, 2 + R() * 8);
    } else if (k === 8) {   // flyer A6 scotché
      g.fillStyle = '#f4f1e8'; g.fillRect(-w / 2, -h / 2, w, h); g.fillStyle = pick(COLS); g.fillRect(-w * .45, -h * .45, w * .9, h * .4); g.fillStyle = '#111'; g.font = `bold ${h * .12}px Arial`; g.fillText(pick(['COURS DE GUITARE', 'CHAT PERDU', 'VIDE-GRENIER', 'CONCERT', 'BABY-SITTING']), 0, h * .1); g.font = `${h * .1}px Arial`; g.fillText(tel(), 0, h * .3);
      g.fillStyle = 'rgba(230,230,220,.75)'; g.fillRect(-w * .1, -h / 2 - 4, w * .2, h * .12);
    } else {   // sticker texte gras
      g.font = `900 ${h * .42}px "Arial Black", Impact, sans-serif`; g.fillText(pick(STK), 0, 0);
    }
    // usure : décoloration et bords déchirés
    if (R() < .5) { g.fillStyle = `rgba(240,235,225,${.15 + R() * .35})`; g.fillRect(-cs / 2, -cs / 2, cs, cs); }
    g.globalCompositeOperation = 'destination-out'; for (let j = 0; j < 4 + R() * 10; j++) { g.beginPath(); const a = R() * 6.28, r = Math.max(w, h) * .5; g.arc(Math.cos(a) * r, Math.sin(a) * r * (h / w), 6 + R() * cs * .12, 0, 6.29); g.fill(); }
    g.restore(); g.restore();
  }
  const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return { tex: t, N };
}

export function lampadaires(T, opts = {}) {
  const usure = opts.usure ?? .5, densite = opts.stickers ?? 1;
  const A = { peint: [], verre: [], stk: [], plaque: [], blanc: [] };
  const R0 = (() => { let s = opts.seed || 77; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const PL = planche(T, R0);
  const lathe = (pts, seg = 16) => new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg);
  // fût cannelé : cannelures creusées dans un cylindre
  function fut(r0, r1, h, n = 16) {
    const g = new T.CylinderGeometry(r1, r0, h, n * 4, 6, true), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z), k = 1 - .09 * Math.max(0, Math.cos(a * n)) ** 2; p.setXYZ(i, x * k, p.getY(i), z * k); }
    return g;
  }
  // autocollant épousant un cylindre de rayon r
  function sticker(R, x, y, z, r, h, l, a0) {
    const c = Math.floor(R() * PL.N * PL.N), u0 = (c % PL.N) / PL.N, v0 = 1 - (Math.floor(c / PL.N) + 1) / PL.N;
    const g = new T.CylinderGeometry(r, r, h, 6, 1, true, a0, l / r), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (.08 + uv.getX(i) * .84) / PL.N, v0 + (.08 + uv.getY(i) * .84) / PL.N);
    A.stk.push(g.translate(x, y, z));
  }
  function lanterne(x, y, z, R, s = 1) {   // lanterne Paris : tronc de pyramide hexagonale vitrée, chapeau et couronne
    const P = A.peint;
    P.push(lathe([[.0, 0], [.07, 0], [.09, .05], [.06, .1], [.1, .14]].map(([r, h]) => [r * s, h * s]), 12).translate(x, y, z));   // coupelle
    A.verre.push(new T.CylinderGeometry(.25 * s, .12 * s, .5 * s, 6, 1, true).translate(x, y + .4 * s, z));
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; P.push(new T.BoxGeometry(.02 * s, .52 * s, .02 * s).rotateZ(-.26).translate(.185 * s, 0, 0).rotateY(a).translate(x, y + .4 * s, z)); }
    P.push(new T.CylinderGeometry(.27 * s, .25 * s, .05 * s, 6).translate(x, y + .67 * s, z));
    P.push(new T.ConeGeometry(.3 * s, .28 * s, 6).translate(x, y + .83 * s, z));
    P.push(new T.CylinderGeometry(.13 * s, .3 * s, .04 * s, 6).translate(x, y + .7 * s, z));
    P.push(new T.SphereGeometry(.05 * s, 8, 6).translate(x, y + 1.0 * s, z), new T.ConeGeometry(.025 * s, .12 * s, 6).translate(x, y + 1.1 * s, z));
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; P.push(new T.SphereGeometry(.025 * s, 5, 4).translate(Math.cos(a) * .27 * s + x, y + .72 * s, Math.sin(a) * .27 * s + z)); }
  }
  const api = {
    // candélabre sur trottoir : borne moulurée (trappe de visite), fût cannelé, bague, chapiteau à feuilles, lanterne (ou double crosse)
    candelabre(R, x, z, o = {}) {
      const P = A.peint, H = o.hauteur ?? 4.0;
      P.push(lathe([[.27, 0], [.27, .06], [.24, .08], [.23, .1], [.23, .32], [.25, .36], [.25, .4], [.2, .46], [.18, .58], [.15, .7], [.155, .76], [.12, .82], [.1, .9]], 20).translate(x, 0, z));
      P.push(new T.BoxGeometry(.14, .2, .02).translate(0, .22, .232).rotateY(R() * 6.28).translate(x, 0, z));   // trappe de visite
      const yf = .9, yc = H - .55;
      P.push(fut(.085, .065, yc - yf).translate(x, (yf + yc) / 2, z));
      P.push(new T.TorusGeometry(.085, .018, 6, 18).rotateX(Math.PI / 2).translate(x, yf + .05, z), new T.TorusGeometry(.075, .02, 6, 18).rotateX(Math.PI / 2).translate(x, yf + (yc - yf) * .42, z));
      P.push(lathe([[.065, 0], [.08, .05], [.075, .1], [.11, .25], [.14, .32], [.14, .36], [.06, .4]], 16).translate(x, yc, z));   // chapiteau
      for (let k = 0; k < 8; k++) P.push(new T.BoxGeometry(.03, .16, .05).rotateX(-.35).translate(0, .2, .1).rotateY(k * Math.PI / 4).translate(x, yc, z));   // feuilles d'acanthe
      if (o.double) {   // crosse double : deux bras en volute portant deux lanternes
        for (const sd of [-1, 1]) {
          const cu = new T.CubicBezierCurve3(new T.Vector3(x, yc + .35, z), new T.Vector3(x + sd * .15, yc + 1.0, z), new T.Vector3(x + sd * .65, yc + .9, z), new T.Vector3(x + sd * .7, yc + .55, z));
          P.push(new T.TubeGeometry(cu, 16, .03, 6, false));
          P.push(new T.TorusGeometry(.09, .018, 5, 14, Math.PI * 1.5).rotateZ(sd < 0 ? 0 : Math.PI / 2).translate(x + sd * .3, yc + .62, z));
          lanterne(x + sd * .7, yc + .45, z, R, .9);
        }
        P.push(new T.CylinderGeometry(.05, .06, .5, 10).translate(x, yc + .6, z), new T.SphereGeometry(.07, 8, 6).translate(x, yc + .9, z));
      } else lanterne(x, yc + .4, z, R);
      // plaque d'identification
      A.plaque.push(new T.PlaneGeometry(.1, .06).translate(0, 1.6, .078).rotateY(R() * 6.28).translate(x, 0, z));
      // autocollants (surtout entre 1 m et 2 m, à hauteur de main) et quelques-uns sur la borne
      const n = Math.round((4 + R() * 12) * densite);
      for (let i = 0; i < n; i++) { const y = .95 + R() * 1.45, r = .085 - (y - yf) / (yc - yf) * .02 + .004, l = .06 + R() * .1; sticker(R, x, y, z, r, l * (.6 + R() * .7), l, R() * 6.28); }
      for (let i = 0; i < Math.round(R() * 3 * densite); i++) { const l = .07 + R() * .08; sticker(R, x, .14 + R() * .14, z, .233, l * .7, l, R() * 6.28); }
      // vélo attaché (parfois)
      if (o.velo && R() < o.velo) velo(R, x, z);
    },
    // console murale des rues étroites : bras en volute scellé dans la façade, lanterne au bout
    console(R, x, y, z, dir) {
      const P = A.peint, d = dir;
      P.push(new T.BoxGeometry(.18, .5, .04).translate(x, y, z));   // platine
      const cu = new T.CubicBezierCurve3(new T.Vector3(x, y + .15, z), new T.Vector3(x, y + .35, z + d * .5), new T.Vector3(x, y + .3, z + d * .9), new T.Vector3(x, y + .1, z + d * 1.0));
      P.push(new T.TubeGeometry(cu, 16, .028, 6, false));
      P.push(new T.TubeGeometry(new T.QuadraticBezierCurve3(new T.Vector3(x, y - .2, z), new T.Vector3(x, y - .1, z + d * .5), new T.Vector3(x, y + .2, z + d * .7)), 12, .02, 6, false));
      P.push(new T.TorusGeometry(.08, .016, 5, 14, Math.PI * 1.6).rotateY(Math.PI / 2).translate(x, y, z + d * .35));
      lanterne(x, y - .55, z + d * 1.0, R, .85);
      P.push(new T.CylinderGeometry(.015, .015, .5, 6).translate(x, y - .2, z + d * 1.0));
    },
    finir() {
      const G = new T.Group(); G.name = 'lampadaires';
      const add = (arr, m, sh = true) => { if (!arr.length) return; const g = mergeGeometries(arr.map(a => a.index ? a.toNonIndexed() : a), false); g.computeVertexNormals(); const me = new T.Mesh(g, m); me.castShadow = sh; me.receiveShadow = true; G.add(me); };
      add(A.peint, peintureUsee(T, usure));
      add(A.verre, new T.MeshStandardMaterial({ color: 0xf3ead2, emissive: 0xffd9a0, emissiveIntensity: .35, roughness: .15, metalness: .1, transparent: true, opacity: .85, side: T.DoubleSide }), false);
      add(A.stk, new T.MeshStandardMaterial({ map: PL.tex, transparent: true, alphaTest: .4, roughness: .55, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }), false);
      if (A.plaque.length) { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 76; const g = cv.getContext('2d'); g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, 128, 76); g.fillStyle = '#111'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.fillText(String(Math.floor(R0() * 9000 + 1000)), 64, 50); const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; add(A.plaque, new T.MeshStandardMaterial({ map: t, roughness: .4, side: T.DoubleSide }), false); }
      add(A.blanc, new T.MeshStandardMaterial({ color: 0x8a8f94, metalness: .6, roughness: .4 }));
      return G;
    },
  };
  function velo(R, x, z) {   // vélo attaché au candélabre (cadre, roues, guidon)
    const B = A.blanc, a = R() * 6.28, m = new T.Matrix4().makeRotationY(a).setPosition(x + Math.cos(a) * .25, 0, z + Math.sin(a) * .25);
    for (const dx of [-.5, .5]) B.push(new T.TorusGeometry(.33, .02, 5, 20).translate(dx, .35, 0).applyMatrix4(m));
    const tube = (p, q) => { const d = new T.Vector3().subVectors(q, p); const g = new T.CylinderGeometry(.015, .015, d.length(), 5); g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize())); g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2); B.push(g.applyMatrix4(m)); };
    const V = (a, b) => new T.Vector3(a, b, 0);
    tube(V(-.5, .35), V(-.05, .35)); tube(V(-.05, .35), V(-.15, .78)); tube(V(-.5, .35), V(-.15, .78)); tube(V(-.15, .78), V(.4, .82)); tube(V(-.05, .35), V(.4, .82)); tube(V(.4, .82), V(.5, .35)); tube(V(.4, .82), V(.42, .98)); tube(V(-.18, .78), V(-.2, .9));
    B.push(new T.CylinderGeometry(.012, .012, .5, 5).rotateX(Math.PI / 2).translate(.42, .98, 0).applyMatrix4(m), new T.BoxGeometry(.22, .05, .09).translate(-.2, .92, 0).applyMatrix4(m));
  }
  return api;
}
