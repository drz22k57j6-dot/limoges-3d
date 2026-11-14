// Road surface from Saltline: Blacktop ("wet-surface.js", the dry part of its asphalt shader), fitted to the
// city's road network: every road gets its own coordinates (distance along, distance across, half width,
// lanes), so the paint follows each street, and the asphalt is the same worn, cracked, patched surface.
// The engine's tiling detail maps are minified in Plateau; they are re-made here with the same channels:
//   detail: R fine grain, G medium fbm, B crack network, A aggregate speckle; detailN: RG fine slope, BA broad slope.
export function createSaltlineRoads(T) {
  const TUNE = {
    poolTile: 96,
    asphalt: [0.1, 0.1, 0.105],
    patch: [0.082, 0.082, 0.088],
    aggregate: [0.11, 0.105, 0.095],
    white: [0.47, 0.47, 0.44],
    edgeLine: [0.12, 0.075],
    centreLine: [0.06, 13, 3], // French town roads: white dashes 3 m every 13 m
    rutAt: 0.82, rutWidth: 0.36,
  };

  // ---------------- tiling maps (value noise / fbm / cell edges), all periodic
  function hash(x, y, s) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y, s, P) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), m = (a) => ((a % P) + P) % P;
    const a = hash(m(xi), m(yi), s), b = hash(m(xi + 1), m(yi), s), c = hash(m(xi), m(yi + 1), s), d = hash(m(xi + 1), m(yi + 1), s);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, y, s, oct, P) { let t = 0, a = 0.5, n = 0; for (let o = 0; o < oct; o++) { t += a * vnoise(x, y, s + o * 17, P); n += a; x *= 2; y *= 2; P *= 2; a *= 0.5; } return t / n; }
  function cellEdge(x, y, s, P) { // distance between the two nearest feature points: small on the crack lines
    const xi = Math.floor(x), yi = Math.floor(y); let d1 = 9, d2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, mx = ((cx % P) + P) % P, my = ((cy % P) + P) % P;
      const px = cx + hash(mx, my, s), py = cy + hash(mx, my, s + 9), d = Math.hypot(px - x, py - y);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return d2 - d1;
  }
  function tex(data, size, srgb = false) {
    const t = new T.DataTexture(data, size, size, T.RGBAFormat);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter; t.anisotropy = 8;
    if (srgb) t.colorSpace = T.SRGBColorSpace; t.needsUpdate = true; return t;
  }
  const N = 256, det = new Uint8Array(N * N * 4), nrm = new Uint8Array(N * N * 4), pool = new Uint8Array(N * N * 4);
  const hGrain = new Float32Array(N * N), hBroad = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const grain = fbm(u * 64, v * 64, 3, 3, 64);
    const mid = fbm(u * 6, v * 6, 7, 4, 6);
    const e = cellEdge(u * 7 + (fbm(u * 20, v * 20, 31, 2, 20) - 0.5) * 0.35, v * 7 + (fbm(u * 20, v * 20, 37, 2, 20) - 0.5) * 0.35, 13, 7);
    const crack = Math.max(0, 1 - e / 0.05);
    const agg = hash(x, y, 51) > 0.86 ? 0.65 + 0.35 * hash(x, y, 52) : 0.35 * hash(x, y, 53);
    det[4 * i] = grain * 255; det[4 * i + 1] = mid * 255; det[4 * i + 2] = (0.55 + 0.45 * crack) * 255 * (crack > 0 ? 1 : 0.6 + 0.4 * mid); det[4 * i + 3] = agg * 255;
    hGrain[i] = grain + agg * 0.35; hBroad[i] = mid;
    const W = (a, g) => Math.round(Math.min(1, Math.max(0, 0.5 + (a - 0.5) * g)) * 255);
    pool[4 * i] = W(fbm(u * 4, v * 4, 11, 4, 4), 2.3); pool[4 * i + 1] = W(fbm(u * 14, v * 14, 23, 3, 14), 2.2);
    pool[4 * i + 2] = W(fbm(u * 40, v * 40, 41, 2, 40), 2); pool[4 * i + 3] = W(fbm(u * 3, v * 3, 63, 3, 3) * 0.6 + fbm(u * 9, v * 9, 57, 3, 9) * 0.4, 2.4);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, xp = y * N + ((x + 1) % N), yp = ((y + 1) % N) * N + x;
    nrm[4 * i] = Math.max(0, Math.min(255, 128 + (hGrain[xp] - hGrain[i]) * 600)); nrm[4 * i + 1] = Math.max(0, Math.min(255, 128 + (hGrain[yp] - hGrain[i]) * 600));
    nrm[4 * i + 2] = Math.max(0, Math.min(255, 128 + (hBroad[xp] - hBroad[i]) * 2500)); nrm[4 * i + 3] = Math.max(0, Math.min(255, 128 + (hBroad[yp] - hBroad[i]) * 2500));
  }
  const uniforms = {
    uDetail: { value: tex(det, N) }, uDetailN: { value: tex(nrm, N) }, uPool: { value: tex(pool, N) },
    uPoolScale: { value: 1 / TUNE.poolTile },
    uAsphalt: { value: new T.Vector3(...TUNE.asphalt) }, uPatch: { value: new T.Vector3(...TUNE.patch) }, uAggregate: { value: new T.Vector3(...TUNE.aggregate) },
    uWhite: { value: new T.Vector3(...TUNE.white) }, uEdgeLine: { value: new T.Vector2(...TUNE.edgeLine) }, uCentreLine: { value: new T.Vector3(...TUNE.centreLine) },
    uRutShape: { value: new T.Vector2(TUNE.rutAt, TUNE.rutWidth) },
  };
  const HEADER = `
uniform sampler2D uDetail, uDetailN, uPool; uniform float uPoolScale;
uniform vec3 uAsphalt, uPatch, uAggregate, uWhite, uCentreLine; uniform vec2 uEdgeLine, uRutShape;
varying vec3 vGWorld; varying vec4 vRoad; varying vec3 vLine;
vec2 gNxz; float gRough;
vec3 gHash3(vec2 p){ vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9))); return fract(sin(q) * 43758.5453); }
float gH1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float gVN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gH1(i), gH1(i + vec2(1.0, 0.0)), f.x), mix(gH1(i + vec2(0.0, 1.0)), gH1(i + vec2(1.0, 1.0)), f.x), f.y); }
float bkDash(float u, float period, float len, float w){
  float a = u - 0.5 * w, b = u + 0.5 * w;
  float fa = floor(a / period) * len + min(a - floor(a / period) * period, len);
  float fb = floor(b / period) * len + min(b - floor(b / period) * period, len);
  return clamp((fb - fa) / max(w, 1e-4), 0.0, 1.0);
}
float bkBand(float d, float hw, float aa){ return clamp(0.5 + (hw - abs(d)) / aa, 0.0, 1.0) * min(1.0, 2.8 * hw / aa); }
`;
  const SURFACE = `
{
vec2 gxz = vGWorld.xz;
float gDist = length(cameraPosition - vGWorld);
float rs = vRoad.x, rx = vRoad.y, hw = vRoad.z, lanes = vRoad.w;
float lw = lanes > 1.5 ? hw : 2.0 * hw;
float lx = abs(rx);
vec4 pk = texture2D(uPool, gxz * uPoolScale);
vec4 d1 = texture2D(uDetail, gxz * 0.21);
vec4 d2 = texture2D(uDetail, gxz * 1.37 + 0.37);
vec4 n1 = texture2D(uDetailN, gxz * 1.37 + 0.37);
vec4 n0 = texture2D(uDetailN, gxz * 0.21);
float grain = d2.r;
// where the wheels run: two paths in every lane, an oily strip between them
float lane = lanes > 1.5 ? lx - lw * (floor(lx / lw) + 0.5) : rx;
float onLanes = 1.0 - smoothstep(hw - 0.15, hw + 0.25, lx);
float wq = (abs(lane) - uRutShape.x) / uRutShape.y;
float wpath = exp(-wq * wq) * onLanes;
float laneMid = exp(-lane * lane / 0.09) * onLanes;
// repairs: now and then a lane has a rectangle of newer asphalt with a tar seam round it
float pc = floor(rs / 37.0);
vec3 ph = gHash3(vec2(pc, 7.0) + vLine.yz * 0.0 + vec2(floor(hw * 10.0), 0.0));
float pLen = 5.0 + 12.0 * ph.y, pMid = pc * 37.0 + 4.0 + 0.5 * pLen + ph.z * (27.0 - pLen);
float pSide = ph.x < 0.5 ? 1.0 : -1.0;
vec2 pd = abs(vec2(rs - pMid, rx - pSide * 0.5 * hw)) - vec2(0.5 * pLen, 0.5 * hw - 0.32);
float pdist = max(pd.x, pd.y) + (d1.a - 0.5) * 0.05;
float pOn = step(fract(ph.x * 3.7), 0.3);
float pAA = fwidth(pdist) + 1e-4;
float repair = (1.0 - smoothstep(-pAA, pAA, pdist)) * pOn;
float tar = (1.0 - smoothstep(0.018, 0.05 + pAA, abs(pdist))) * pOn * clamp(0.07 / pAA, 0.0, 1.0);
// cracks, some sealed with tar
float sh2 = gH1(vec2(floor(rs / 23.0), 3.0));
float crArea = smoothstep(0.56, 0.74, pk.a + sh2 * 0.12) * (1.0 - repair);
float cfw = fwidth(d1.b) * 1.5 + 0.004;
float crack = smoothstep(0.955 - cfw, 0.975, d1.b) * crArea;
float seal = smoothstep(0.915 - cfw, 0.94, d1.b) * crArea * step(0.6, sh2);
// base albedo: worn asphalt
vec3 alb = mix(uAsphalt, uPatch, repair);
alb *= (0.84 + 0.32 * pk.g) * (0.8 + 0.4 * d1.g) * (0.62 + 0.76 * grain);
alb += uAggregate * smoothstep(0.58, 0.78, d2.a) * (1.0 - 0.6 * repair);
float polish = wpath * (0.5 + 0.5 * pk.a);
alb *= mix(1.0, 0.78, polish);
alb = mix(alb, vec3(0.018, 0.018, 0.02), max(max(tar, seal * 0.4) * 0.94, crack * 0.9));
float oil = laneMid * smoothstep(0.5, 0.85, d1.g * 0.55 + pk.b * 0.65) * 0.55;
alb *= 1.0 - 0.6 * oil;
// painted markings, worked out from the road's own coordinates (sharp at any distance, worn and chipped)
float aaX = fwidth(rx) + 1e-4, aaS = fwidth(rs) + 1e-4;
float on = rx > 0.0 ? vLine.x : vLine.y;
float pW = bkBand(lx - (hw - uEdgeLine.x), uEdgeLine.y, aaX) * smoothstep(0.35, 0.65, on) * vLine.z;
pW = max(pW, bkBand(rx, uCentreLine.x, aaX) * bkDash(rs, uCentreLine.y, uCentreLine.z, aaS) * step(1.5, lanes) * vLine.z);
float chipN = 0.5;
if (pW > 0.02) {
  float cf1 = 1.0 - smoothstep(30.0, 80.0, gDist), cf2 = 1.0 - smoothstep(6.0, 18.0, gDist), cf3 = 1.0 - smoothstep(2.5, 7.0, gDist);
  chipN = mix(0.5, gVN(gxz * 17.0), cf1) * 0.45 + mix(0.5, gVN(gxz * 57.0 + 11.0), cf2) * 0.33 + mix(0.5, gVN(gxz * 181.0 + 5.0), cf3) * 0.22;
}
float chip = chipN * 0.62 + d1.a * 0.38;
float wear = clamp(pk.a * 0.9 - 0.1 + wpath * 0.4, 0.0, 1.0);
float wt = mix(0.24, 0.46, wear);
float keep = smoothstep(wt - 0.045, wt + 0.045, chip) * (1.0 - max(tar, crack));
pW *= keep;
float fade = 0.72 + 0.28 * d1.g;
alb = mix(alb, uWhite * fade, pW * 0.94);
diffuseColor.rgb *= alb;
float rough = 0.74 + (grain - 0.5) * 0.24 + (d1.g - 0.5) * 0.16 - pW * 0.05;
rough -= polish * 0.07 + oil * 0.16 + max(tar, seal) * 0.1;
rough += smoothstep(10.0, 80.0, gDist) * 0.06;
gRough = clamp(rough, 0.1, 1.0);
gNxz = (n1.rg - 0.5) * 1.5 * (1.0 - smoothstep(12.0, 60.0, gDist)) + (n0.ba - 0.5) * 0.08;
}
`;
  const NORMAL = `
{
vec3 nW = inverseTransformDirection(normal, viewMatrix);
normal = normalize(mat3(viewMatrix) * normalize(nW + vec3(-gNxz.x, 0.0, -gNxz.y)));
}
`;
  const material = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.name = 'road_saltline';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'attribute vec4 aRoad; attribute vec3 aLine;\nvarying vec3 vGWorld; varying vec4 vRoad; varying vec3 vLine;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vRoad = aRoad; vLine = aLine;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HEADER)
      .replace('#include <map_fragment>', SURFACE)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + NORMAL);
  };
  material.customProgramCacheKey = () => 'road_saltline';

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
  return { material, build, buildV3, buildDeco, buildSignals, uniforms };
}
