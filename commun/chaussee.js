// Chaussées (code original du projet) : surface d'asphalte et marquages calculés dans le shader à partir
// des coordonnées de chaque route, fournies par sommet (outils/roads_v3.py) :
//   aRoad = (distance le long, distance au centre, demi-largeur, nombre de voies)
//   aLine = (ligne de rive gauche, ligne de rive droite, peinture autorisée)
// Le reste du fichier construit les maillages (routes, ponts, décor, bordures, feux) à partir des données.
export function createRoads(T) {
  const C = {
    asphalt: [0.095, 0.095, 0.1],      // enrobé sec
    paint: [0.46, 0.46, 0.43],         // peinture routière blanche, un peu salie
    edge: [0.12, 0.075],               // ligne de rive : retrait du bord, demi-largeur (m)
    centre: [0.06, 13, 3],             // axe : demi-largeur, période, longueur du tiret (m) — tirets 3 m / 13 m
  };

  // texture de bruit périodique (256²) : R grain fin, G variations moyennes, B taches, A gravillons
  const N = 256, data = new Uint8Array(N * N * 4);
  const rnd = (x, y, s) => { let h = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791); h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const smooth = t => t * t * (3 - 2 * t);
  function noise(u, v, P, s) {               // bruit de valeur périodique de période P cellules
    const x = u * P, y = v * P, x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
    const g = (a, b) => rnd(((a % P) + P) % P, ((b % P) + P) % P, s);
    return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
  }
  const octaves = (u, v, P, s, n) => { let t = 0, a = 1, w = 0; for (let o = 0; o < n; o++) { t += a * noise(u, v, P << o, s + o); w += a; a *= 0.5; } return t / w; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = 4 * (y * N + x);
    data[i] = octaves(u, v, 32, 1, 3) * 255;
    data[i + 1] = octaves(u, v, 4, 9, 4) * 255;
    data[i + 2] = octaves(u, v, 2, 17, 3) * 255;
    data[i + 3] = (rnd(x, y, 5) > 0.9 ? 0.7 + 0.3 * rnd(x, y, 6) : 0.25 * rnd(x, y, 7)) * 255;
  }
  const noiseTex = new T.DataTexture(data, N, N, T.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = T.RepeatWrapping; noiseTex.generateMipmaps = true;
  noiseTex.minFilter = T.LinearMipmapLinearFilter; noiseTex.magFilter = T.LinearFilter; noiseTex.anisotropy = 8; noiseTex.needsUpdate = true;

  const uniforms = {
    uNoise: { value: noiseTex },
    uAsphalt: { value: new T.Vector3(...C.asphalt) }, uPaint: { value: new T.Vector3(...C.paint) },
    uEdge: { value: new T.Vector2(...C.edge) }, uCentre: { value: new T.Vector3(...C.centre) },
  };
  const DECL = `
uniform sampler2D uNoise; uniform vec3 uAsphalt, uPaint, uCentre; uniform vec2 uEdge;
varying vec3 vRW; varying vec4 vRoad; varying vec3 vLine;
float rdRough;
// bande anti-crénelée centrée sur 0, de demi-largeur w
float rdStripe(float d, float w){ float aa = fwidth(d) + 1e-4; return clamp((w - abs(d)) / aa + 0.5, 0.0, 1.0); }
// tirets le long de la route : 1 sur [0, len] de chaque période
float rdDash(float s, float period, float len){ float aa = fwidth(s) + 1e-4; float m = mod(s, period); return clamp(m / aa, 0.0, 1.0) * clamp((len - m) / aa, 0.0, 1.0); }
`;
  const BODY = `
{
  float s = vRoad.x, x = vRoad.y, hw = vRoad.z, lanes = vRoad.w;
  vec4 nA = texture2D(uNoise, vRW.xz * 0.9);
  vec4 nB = texture2D(uNoise, vRW.xz * 0.05 + 0.31);
  float dist = length(cameraPosition - vRW);
  // enrobé : grain, variations de teinte à grande échelle, gravillons clairs
  vec3 col = uAsphalt * (0.75 + 0.5 * nA.r) * (0.85 + 0.3 * nB.g);
  col = mix(col, col * 0.7, smoothstep(0.62, 0.8, nB.b) * 0.6);          // taches plus sombres
  col += vec3(0.05) * smoothstep(0.6, 0.85, nA.a) * (1.0 - smoothstep(20.0, 60.0, dist));
  // marquages : lignes de rive et axe discontinu (si au moins 2 voies)
  float side = x > 0.0 ? vLine.x : vLine.y;
  float paint = rdStripe(abs(x) - (hw - uEdge.x), uEdge.y) * step(0.5, side);
  paint = max(paint, rdStripe(x, uCentre.x) * rdDash(s, uCentre.y, uCentre.z) * step(1.5, lanes));
  paint *= vLine.z * smoothstep(0.25, 0.45, nA.g * 0.6 + nA.r * 0.4);   // peinture usée par endroits
  col = mix(col, uPaint * (0.8 + 0.2 * nB.g), paint);
  diffuseColor.rgb *= col;
  rdRough = clamp(0.8 + (nA.r - 0.5) * 0.2 - paint * 0.1, 0.3, 1.0);
}
`;
  const material = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.name = 'chaussee'; material.userData.partage = true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'attribute vec4 aRoad; attribute vec3 aLine;\nvarying vec3 vRW; varying vec4 vRoad; varying vec3 vLine;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz; vRoad = aRoad; vLine = aLine;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DECL)
      .replace('#include <map_fragment>', BODY)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rdRough;');
  };
  material.customProgramCacheKey = () => 'chaussee';

  /** roads: [{ p: Float32Array x,z…, h: Float32Array, w }] -> array of meshes (chunks of 500 m). */
  function build(roads) {
    const chunks = new Map();
    for (const r of roads) {
      if (!r.h) continue;
      const p = r.p, m = p.length / 2, hw = r.w / 2, lanes = r.w >= 5 ? 2 : 1;
      if (m < 2) continue;
      const cx = p[2 * (m >> 1)], cz = p[2 * (m >> 1) + 1];
      const ck = Math.floor(cx / 500) * 100000 + Math.floor(cz / 500);
      let c = chunks.get(ck); if (!c) chunks.set(ck, c = { pos: [], road: [], line: [], idx: [], n: 0 });
      // distance along
      const s = new Float32Array(m); for (let k = 1; k < m; k++) s[k] = s[k - 1] + Math.hypot(p[2 * k] - p[2 * k - 2], p[2 * k + 1] - p[2 * k - 1]);
      const total = s[m - 1], edges = r.w >= 6.5 ? 1 : 0, endFade = hw + 4;
      for (let k = 0; k < m; k++) {
        const a = Math.max(0, k - 1), b = Math.min(m - 1, k + 1);
        let tx = p[2 * b] - p[2 * a], tz = p[2 * b + 1] - p[2 * a + 1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const ox = tz, oz = -tx; // the +side (the same side as the pavement list sl)
        const y = r.h[k];
        // paint keeps clear of the ends of a street: its junctions
        const fadeEnds = Math.min(1, Math.max(0, (Math.min(s[k], total - s[k]) - endFade) / 3));
        for (const sg of [1, -1]) {
          c.pos.push(p[2 * k] + ox * hw * sg, y, p[2 * k + 1] + oz * hw * sg);
          c.road.push(s[k], hw * sg, hw, lanes);
          c.line.push(edges, edges, fadeEnds);
        }
      }
      for (let k = 0; k < m - 1; k++) { const i = c.n + 2 * k; c.idx.push(i, i + 1, i + 3, i, i + 3, i + 2); }
      c.n += 2 * m;
    }
    const out = [];
    for (const c of chunks.values()) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(c.pos, 3));
      g.setAttribute('aRoad', new T.Float32BufferAttribute(c.road, 4));
      g.setAttribute('aLine', new T.Float32BufferAttribute(c.line, 3));
      g.setIndex(c.idx);
      g.computeVertexNormals();
      // the strip winds either way: make every normal point up
      const nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) if (nr.getY(i) < 0) nr.setXYZ(i, -nr.getX(i), -nr.getY(i), -nr.getZ(i));
      g.computeBoundingSphere();
      const mesh = new T.Mesh(g, material); mesh.receiveShadow = true; mesh.name = 'route_saltline';
      out.push(mesh);
    }
    return out;
  }
  /** routes_v3 (compact): chunks of the merged asphalt with road coordinates per vertex. */
  function buildV3(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x52445634) return [];
    const n = dv.getUint32(4, true); let o = 8; const out = [];
    for (let c = 0; c < n; c++) {
      const nV = dv.getUint32(o, true), nI = dv.getUint32(o + 4, true), big = dv.getUint8(o + 8);
      const ox = dv.getFloat32(o + 9, true), oy = dv.getFloat32(o + 13, true), oz = dv.getFloat32(o + 17, true); o += 24;
      const q = new Uint16Array(buf.slice(o, o + nV * 6)); o += nV * 6;
      const s = new Float32Array(buf.slice(o, o + nV * 4)); o += nV * 4;
      const lat = new Int16Array(buf.slice(o, o + nV * 2)); o += nV * 2;
      const hl = new Uint8Array(buf.slice(o, o + nV * 2)); o += nV * 2;
      const ln = new Uint8Array(buf.slice(o, o + nV * 4)); o += nV * 4;
      const idx = big ? new Uint32Array(buf.slice(o, o + nI * 4)) : new Uint16Array(buf.slice(o, o + nI * 2)); o += nI * (big ? 4 : 2);
      while (o % 4) o++;
      const pos = new Float32Array(nV * 3), road = new Float32Array(nV * 4), line = new Float32Array(nV * 3);
      for (let i = 0; i < nV; i++) {
        pos[3 * i] = ox + q[3 * i] * 0.02; pos[3 * i + 1] = oy + q[3 * i + 1] * 0.02; pos[3 * i + 2] = oz + q[3 * i + 2] * 0.02;
        road[4 * i] = s[i]; road[4 * i + 1] = lat[i] / 100; road[4 * i + 2] = hl[2 * i] / 10; road[4 * i + 3] = hl[2 * i + 1];
        line[3 * i] = ln[4 * i] / 100; line[3 * i + 1] = Math.min(1, ln[4 * i + 1] / 100); line[3 * i + 2] = ln[4 * i + 2] / 100;
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('aRoad', new T.BufferAttribute(road, 4));
      g.setAttribute('aLine', new T.BufferAttribute(line, 3));
      g.setIndex(new T.BufferAttribute(idx, 1));
      g.computeVertexNormals();
      const nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) if (nr.getY(i) < 0) nr.setXYZ(i, -nr.getX(i), -nr.getY(i), -nr.getZ(i));
      g.computeBoundingSphere();
      const mesh = new T.Mesh(g, material); mesh.receiveShadow = true; mesh.name = 'route_v3'; out.push(mesh);
    }
    return out;
  }
  /** paint decals (give-way, zebras, arrows) and roundabout islands. */
  function buildDeco(buf) {
    const dv = new DataView(buf); let o = 0; const out = [];
    const nP = dv.getUint32(o, true), nI = dv.getUint32(o + 4, true); o += 8;
    const P = new Float32Array(buf.slice(o, o + nP * 12)); o += nP * 12;
    const I = new Uint32Array(buf.slice(o, o + nI * 4)); o += nI * 4;
    if (nP) {
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setIndex(new T.BufferAttribute(I, 1));
      const nrm = new Float32Array(nP * 3); for (let i = 0; i < nP; i++) nrm[3 * i + 1] = 1; g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
      g.computeBoundingSphere();
      const m = new T.MeshStandardMaterial({ color: new T.Color().setRGB(0.47, 0.47, 0.44), roughness: 0.62, metalness: 0, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      m.name = 'peinture'; const mesh = new T.Mesh(g, m); mesh.receiveShadow = true; out.push(mesh);
    }
    const nQ = dv.getUint32(o, true), nJ = dv.getUint32(o + 4, true); o += 8;
    if (nQ) {
      const A = new Float32Array(buf.slice(o, o + nQ * 16)); o += nQ * 16;
      const J = new Uint32Array(buf.slice(o, o + nJ * 4));
      const pos = new Float32Array(nQ * 3), col = new Float32Array(nQ * 3);
      for (let i = 0; i < nQ; i++) {
        pos[3 * i] = A[4 * i]; pos[3 * i + 1] = A[4 * i + 1]; pos[3 * i + 2] = A[4 * i + 2];
        const kerb = A[4 * i + 3] > 0.5; const c = kerb ? [0.55, 0.55, 0.53] : [0.2, 0.32, 0.1];
        col[3 * i] = c[0]; col[3 * i + 1] = c[1]; col[3 * i + 2] = c[2];
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setIndex(new T.BufferAttribute(J, 1));
      g.computeVertexNormals(); g.computeBoundingSphere();
      const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: T.DoubleSide, flatShading: true }); m.name = 'ilots';
      const mesh = new T.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true; out.push(mesh);
    }
    return out;
  }
  /** Road signs and traffic lights at their OpenStreetMap places: [[kind, x, y, z, heading], ...]. */
  /** kerbs (granite grey), gutters (smooth concrete) and bridge parapets, one merged mesh. */
  function buildKerbs(buf) {
    if (!buf || buf.byteLength < 8) return [];
    const dv = new DataView(buf); let nP = dv.getUint32(0, true), nI = dv.getUint32(4, true), P, I;
    if (nP === 0x4B425232) { // compact (secteurs) : positions 2 cm en uint16 depuis l'origine du secteur, type en uint8
      nP = dv.getUint32(4, true); nI = dv.getUint32(8, true); if (!nP) return [];
      const ox = dv.getFloat32(12, true), oy = dv.getFloat32(16, true), oz = dv.getFloat32(20, true), q = new Uint16Array(buf, 24, nP * 3), k = new Uint8Array(buf, 24 + nP * 6, nP);
      let o = 24 + nP * 7; o += (4 - o % 4) % 4; I = nP > 65535 ? new Uint32Array(buf, o, nI) : new Uint16Array(buf, o, nI);
      P = new Float32Array(nP * 4); for (let i = 0; i < nP; i++) { P[4 * i] = ox + q[3 * i] * 0.02; P[4 * i + 1] = oy + q[3 * i + 1] * 0.02; P[4 * i + 2] = oz + q[3 * i + 2] * 0.02; P[4 * i + 3] = k[i]; }
    } else {
      if (!nP) return [];
      P = new Float32Array(buf.slice(8, 8 + nP * 16)); I = new Uint32Array(buf.slice(8 + nP * 16, 8 + nP * 16 + nI * 4));
    }
    const pos = new Float32Array(nP * 3), col = new Float32Array(nP * 3);
    const C = [[0.62, 0.61, 0.58], [0.50, 0.49, 0.47], [0.66, 0.65, 0.62], [0.40, 0.40, 0.39], [0.55, 0.53, 0.49]];   // bordure, caniveau, parapet, trottoir (Paris : asphalte), terre-plein / îlot
    for (let i = 0; i < nP; i++) {
      pos[3 * i] = P[4 * i]; pos[3 * i + 1] = P[4 * i + 1]; pos[3 * i + 2] = P[4 * i + 2];
      const c = C[P[4 * i + 3] | 0] || C[0], n = 0.94 + 0.06 * Math.sin(P[4 * i] * 1.7 + P[4 * i + 2] * 2.3);
      col[3 * i] = c[0] * n; col[3 * i + 1] = c[1] * n; col[3 * i + 2] = c[2] * n;
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setIndex(new T.BufferAttribute(I, 1)); g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: T.DoubleSide }));
    m.receiveShadow = true; m.castShadow = false; m.name = 'bordures'; return [m];
  }
  function buildSignals(list) {
    const out = [], M = new T.Matrix4(), Q = new T.Quaternion(), Y = new T.Vector3(0, 1, 0), P = new T.Vector3(), S1 = new T.Vector3(1, 1, 1);
    const mkFace = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; };
    const stopTex = mkFace((g) => {
      g.fillStyle = '#fff'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; g.lineTo(64 + 63 * Math.cos(a), 64 + 63 * Math.sin(a)); } g.fill();
      g.fillStyle = '#c4161c'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; g.lineTo(64 + 57 * Math.cos(a), 64 + 57 * Math.sin(a)); } g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 64, 66);
    });
    const giveTex = mkFace((g) => {
      g.fillStyle = '#c4161c'; g.beginPath(); g.moveTo(4, 14); g.lineTo(124, 14); g.lineTo(64, 118); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(26, 26); g.lineTo(102, 26); g.lineTo(64, 92); g.fill();
    });
    const pole = new T.CylinderGeometry(0.035, 0.035, 2.6, 8); pole.translate(0, 1.3, 0);
    const poleMat = new T.MeshStandardMaterial({ color: 0x8d9296, metalness: 0.6, roughness: 0.45 });
    const plate = new T.PlaneGeometry(0.8, 0.8); plate.translate(0, 2.25, 0.045);
    const back = new T.CircleGeometry(0.42, 8); back.rotateY(Math.PI); back.translate(0, 2.25, 0.04);
    const kinds = { stop: [], give_way: [], traffic_signals: [] };
    for (const [k, x, y, z, h] of list) if (kinds[k]) kinds[k].push([x, y, z, h]);
    const inst = (geo, mat, items, cast = true) => {
      if (!items.length) return;
      const im = new T.InstancedMesh(geo, mat, items.length);
      items.forEach(([x, y, z, h], i) => { Q.setFromAxisAngle(Y, -h); im.setMatrixAt(i, M.compose(P.set(x, y, z), Q, S1)); });
      im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); out.push(im);
    };
    const backMat = new T.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.5, roughness: 0.5 });
    for (const [k, tex] of [['stop', stopTex], ['give_way', giveTex]]) {
      inst(pole, poleMat, kinds[k]);
      inst(plate, new T.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.5 }), kinds[k]);
      inst(back, backMat, kinds[k]);
    }
    // traffic light: pole, dark housing with three lenses (red lit), on the kerb
    const tlPole = new T.CylinderGeometry(0.05, 0.06, 3.0, 8); tlPole.translate(0, 1.5, 0);
    const box = new T.BoxGeometry(0.32, 0.9, 0.22); box.translate(0, 2.75, 0.12);
    const hood = [];
    const lens = (y, col) => { const g = new T.CircleGeometry(0.09, 16); g.translate(0, y, 0.235); return g; };
    const houseMat = new T.MeshStandardMaterial({ color: 0x1d2124, roughness: 0.6 });
    const ts = kinds.traffic_signals.map(([x, y, z, h]) => [x, y, z, h]);
    inst(tlPole, poleMat, ts); inst(box, houseMat, ts);
    inst(lens(3.02, 0), new T.MeshBasicMaterial({ color: 0xff2a1a }), ts, false);
    inst(lens(2.75, 0), new T.MeshStandardMaterial({ color: 0x3a2a08, roughness: 0.3 }), ts, false);
    inst(lens(2.48, 0), new T.MeshStandardMaterial({ color: 0x0b2a14, roughness: 0.3 }), ts, false);
    return out;
  }
  return { material, build, buildV3, buildDeco, buildSignals, buildKerbs, uniforms };
}
