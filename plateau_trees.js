// Trees taken from the "Plateau" game (Blacktop engine, scenery-models-nature.js): pine, tree, birch, sapling.
// Ported to stand alone: the engine's helpers (rand, bark material, wind, sun) are given by createPlateauTrees().
// Leaves are cards cut out of one generated atlas; the green of a copy is its instance colour.
export function createPlateauTrees(T, env) {
  // env: { sunDir: Vector3 (world, towards the sun), sunColor: Color, sunIntensity: () => number, barkMap: Texture }
  const DIST = { treeNear: 45, treeMid: 170, smallTree: 200 };
  const LOOK = { alphaTest: 0.5, alphaFar: 0.55, roughness: 0.88, backlight: 0.06, bend: 0.0005, sway: 0.1, flutter: 0.035 };
  const ATLAS = { cols: 4, rows: 2, cell: 256, margin: 7 };
  const CELL = { leaf: 0, needle: 1, grass: 2, reed: 3, fern: 4, solid: 5, spruce: 6, broad: 7 };
  const TRUNK = { conifer: [1.0, 0.42, 0.5], broad: [0.5, 0.24, 0.42], birch: [1.5, 0.95, 2.3] };

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const mad = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mix = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const grey = (k) => [k, k, k];
  const UP = [0, 1, 0];
  const perp = (d) => norm(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : UP));
  const anyDir = (rnd) => { const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z); return [r * Math.cos(a), z, r * Math.sin(a)]; };
  const rand = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  function uvOf(cell) {
    const col = cell % ATLAS.cols, row = Math.floor(cell / ATLAS.cols);
    const iu = 3 / (ATLAS.cols * ATLAS.cell), iv = 3 / (ATLAS.rows * ATLAS.cell);
    return [col / ATLAS.cols + iu, 1 - (row + 1) / ATLAS.rows + iv, (col + 1) / ATLAS.cols - iu, 1 - row / ATLAS.rows - iv];
  }
  const UV = {}; for (const name in CELL) UV[name] = uvOf(CELL[name]);
  const SOLID = [(UV.solid[0] + UV.solid[2]) / 2, (UV.solid[1] + UV.solid[3]) / 2, (UV.solid[0] + UV.solid[2]) / 2, (UV.solid[1] + UV.solid[3]) / 2];

  // ---------------- the atlas
  const shade = (v) => `rgb(${Math.round(104 + 136 * v)},${Math.round(114 + 132 * v)},${Math.round(84 + 118 * v)})`;
  function paintLeaf(g, x, y, length, width, angle, v) {
    g.save(); g.translate(x, y); g.rotate(angle);
    g.fillStyle = shade(v); g.beginPath(); g.ellipse(0, 0, length / 2, width / 2, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = shade(Math.min(1, v + 0.18)); g.lineWidth = 1; g.beginPath(); g.moveTo(-length / 2, 0); g.lineTo(length / 2, 0); g.stroke();
    g.restore();
  }
  function paintLeaves(g, blobs, perBlob, rnd, size = 1) {
    for (const [share, r, lo, hi] of [[0.36, 1, 0.0, 0.32], [0.36, 0.9, 0.25, 0.6], [0.28, 0.78, 0.5, 0.9]])
      for (const [bx, by, br] of blobs)
        for (let i = 0; i < perBlob * share * (br / blobs[0][2]) * (br / blobs[0][2]); i++) {
          const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), 0.6) * br * r;
          paintLeaf(g, bx + Math.cos(a) * d, by + Math.sin(a) * d - (hi - 0.45) * br * 0.25, (12 + rnd() * 6) * size, (5.5 + rnd() * 3) * size, rnd() * Math.PI, lo + (hi - lo) * rnd());
        }
  }
  const PAINT = {
    leaf(g, x0, y0, S, rnd) {
      const blobs = [[x0 + S * 0.5, y0 + S * 0.5, S * 0.2]];
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + rnd() * 0.6, d = S * (0.2 + 0.1 * rnd()); blobs.push([x0 + S * 0.5 + Math.cos(a) * d, y0 + S * 0.5 + Math.sin(a) * d, S * (0.1 + 0.075 * rnd())]); }
      paintLeaves(g, blobs, 150, rnd);
    },
    needle(g, x0, y0, S, rnd) {
      const cx = x0 + S / 2, bottom = y0 + S - 9, reach = S - 26;
      const twig = (ax, ay, bx, by, wide) => {
        const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
        g.strokeStyle = "rgb(92,84,66)"; g.lineWidth = wide; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        for (let d = 2; d < l + 3; d += 3.1)
          for (const side of [-1, 1]) {
            const nl = 9 + rnd() * 6, a = 0.75 + rnd() * 0.35;
            const nx = ux * Math.cos(a) - side * uy * Math.sin(a), ny = uy * Math.cos(a) + side * ux * Math.sin(a);
            g.strokeStyle = shade(0.05 + 0.8 * rnd()); g.lineWidth = 2; g.beginPath(); g.moveTo(ax + ux * d, ay + uy * d); g.lineTo(ax + ux * d + nx * nl, ay + uy * d + ny * nl); g.stroke();
          }
      };
      const n = 10;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.3) / n, y = bottom - t * reach;
        const L = S * 0.37 * (t < 0.3 ? 0.55 + 1.5 * t : 1 - ((t - 0.3) / 0.7) * 0.85) * (0.9 + 0.2 * rnd());
        for (const side of [-1, 1]) { const a = 0.82 + (rnd() - 0.5) * 0.2; twig(cx, y, cx + side * L * Math.sin(a), Math.max(y0 + 12, y - L * Math.cos(a)), 2); }
      }
      twig(cx, bottom, cx, y0 + 14, 3);
    },
    solid(g, x0, y0, S, rnd) {
      const m = S * 0.16; g.fillStyle = "rgb(198,201,190)"; g.fillRect(x0 + m, y0 + m, S - 2 * m, S - 2 * m);
      for (let i = 0; i < 160; i++) { const k = 184 + Math.round(rnd() * 30), w = 6 + rnd() * 12, hh = 4 + rnd() * 10; g.fillStyle = `rgb(${k},${k + 3},${k - 8})`; g.fillRect(x0 + m + rnd() * (S - 2 * m - w), y0 + m + rnd() * (S - 2 * m - hh), w, hh); }
    },
    spruce(g, x0, y0, S, rnd) {
      const cx = x0 + S / 2, top = y0 + 10, bottom = y0 + S - 8, body = bottom - top;
      g.fillStyle = "rgb(84,72,60)"; g.fillRect(cx - 3.5, bottom - body * 0.17, 7, body * 0.17);
      g.fillStyle = shade(0.02); g.beginPath(); g.moveTo(cx, top + 12); g.lineTo(cx + S * 0.26, bottom - body * 0.16); g.lineTo(cx - S * 0.26, bottom - body * 0.16); g.fill();
      const n = 12;
      for (let i = n; i >= 0; i--) {
        const t = i / n, y = top + 10 + t * body * 0.74, hw = (5 + S * 0.4 * Math.pow(t, 0.85)) * (0.86 + 0.26 * rnd()), drop = 8 + 15 * t;
        const teeth = Math.max(3, Math.round(hw / 8)), lean = (rnd() - 0.5) * 5;
        g.fillStyle = shade(0.12 + 0.3 * rnd() + 0.2 * (1 - t)); g.beginPath(); g.moveTo(cx, y - 16 - 6 * t); g.lineTo(cx + hw + lean, y + drop);
        for (let k = 0; k <= teeth * 2; k++) { const u = 1 - k / teeth; g.lineTo(cx + hw * u + lean * u, y + drop * Math.abs(u) + (k % 2 ? -6 - rnd() * 5 : 4 + rnd() * 8) - 3); }
        g.closePath(); g.fill();
        for (let k = 0; k < hw * 0.5; k++) { const u = rnd() * 2 - 1, px = cx + hw * u * 0.94, py = y + drop * Math.abs(u) - 10 * (1 - Math.abs(u)) - rnd() * 6; g.strokeStyle = shade(0.45 + 0.4 * rnd()); g.lineWidth = 2.4; g.beginPath(); g.moveTo(px, py); g.lineTo(px + u * 7, py + 4 + rnd() * 5); g.stroke(); }
      }
    },
  };
  function makeAtlas() {
    const S = ATLAS.cell, W = ATLAS.cols * S, H = ATLAS.rows * S;
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    for (const name in PAINT) {
      const x0 = (CELL[name] % ATLAS.cols) * S, y0 = Math.floor(CELL[name] / ATLAS.cols) * S;
      g.save(); g.beginPath(); g.rect(x0 + ATLAS.margin, y0 + ATLAS.margin, S - 2 * ATLAS.margin, S - 2 * ATLAS.margin); g.clip();
      PAINT[name](g, x0, y0, S, rand(1000 + CELL[name] * 77)); g.restore();
    }
    const src = g.getImageData(0, 0, W, H).data, data = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, o = ((H - 1 - y) * W + x) * 4, a = src[i + 3];
      if (a < 10) (data[o] = 176), (data[o + 1] = 184), (data[o + 2] = 150); else (data[o] = src[i]), (data[o + 1] = src[i + 1]), (data[o + 2] = src[i + 2]);
      data[o + 3] = a;
    }
    const tex = new T.DataTexture(data, W, H, T.RGBAFormat);
    tex.colorSpace = T.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = T.LinearMipmapLinearFilter; tex.magFilter = T.LinearFilter; tex.anisotropy = 4; tex.needsUpdate = true;
    return tex;
  }

  // ---------------- the leaf material (wind, cut-out that thins less far away, crown shading, backlight)
  const WIND = { time: { value: 0 }, strength: { value: 1 } };
  const uniforms = { uBtTime: WIND.time, uBtWind: WIND.strength, uBtSunDir: { value: env.sunDir }, uBtSun: { value: new T.Color(1, 1, 1) } };
  const leafMat = new T.MeshStandardMaterial({ map: makeAtlas(), alphaTest: LOOK.alphaTest, side: T.DoubleSide, vertexColors: true, roughness: LOOK.roughness, metalness: 0 });
  leafMat.name = "plateau-foliage";
  leafMat.onBeforeRender = () => uniforms.uBtSun.value.copy(env.sunColor).multiplyScalar(env.sunIntensity());
  leafMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSway;\nuniform float uBtTime, uBtWind;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    vec3 btRoot = instanceMatrix[3].xyz;
  #else
    vec3 btRoot = modelMatrix[3].xyz;
  #endif
  float btPh = dot(btRoot.xz, vec2(0.37, 0.23));
  float btH = max(position.y, 0.0);
  float btLean = uBtWind * ${LOOK.bend.toFixed(5)} * btH * btH;
  transformed.x += (sin(uBtTime * 1.1 + btPh) * 0.6 + sin(uBtTime * 2.3 + btPh * 1.7) * 0.4) * btLean;
  transformed.z += cos(uBtTime * 0.9 + btPh * 1.3) * btLean * 0.5;
  float btS = aSway * uBtWind;
  float btSlow = sin(uBtTime * 1.7 + btPh + position.y * 0.6 + position.x * 0.4);
  transformed.x += (btSlow * ${LOOK.sway.toFixed(3)} + sin(uBtTime * 4.7 + position.z * 2.1 + position.y * 1.3 + btPh) * ${LOOK.flutter.toFixed(3)}) * btS;
  transformed.y += sin(uBtTime * 5.9 + position.x * 2.7 + btPh * 2.0) * ${LOOK.flutter.toFixed(3)} * btS;
  transformed.z += (cos(uBtTime * 1.3 + btPh * 0.7 + position.y * 0.5) * ${LOOK.sway.toFixed(3)} * 0.6 + sin(uBtTime * 3.9 + position.x * 1.9 + btPh * 0.7) * ${LOOK.flutter.toFixed(3)}) * btS;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uBtSunDir;\nuniform vec3 uBtSun;")
      .replace("#include <alphatest_fragment>", `{
  vec2 btFw = fwidth(vMapUv) * vec2(${(ATLAS.cols * ATLAS.cell).toFixed(1)}, ${(ATLAS.rows * ATLAS.cell).toFixed(1)});
  float btLod = clamp(log2(max(max(btFw.x, btFw.y), 1.0)), 0.0, 4.0);
  if (diffuseColor.a < ${LOOK.alphaTest.toFixed(3)} * exp2(-btLod * ${LOOK.alphaFar.toFixed(3)})) discard;
}`)
      .replace("#include <normal_fragment_begin>", "float faceDirection = gl_FrontFacing ? 1.0 : -1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;")
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
{
  vec3 btL = normalize((viewMatrix * vec4(uBtSunDir, 0.0)).xyz);
  reflectedLight.directDiffuse += diffuseColor.rgb * uBtSun * (${LOOK.backlight.toFixed(3)} * saturate(dot(-normal, btL)));
}`);
  };
  leafMat.customProgramCacheKey = () => "bt-foliage";
  // the engine's bark material is a triplanar bark texture; here: the same brown with vertex colours (birch bark goes pale through them)
  const barkMat = new T.MeshStandardMaterial({ color: 0x8a7056, map: env.barkMap || null, vertexColors: true, roughness: 0.95, metalness: 0 });
  if (barkMat.map) barkMat.onBeforeCompile = (sh) => { // world-space triplanar-ish bark
    sh.vertexShader = 'varying vec3 vBtW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vec4 btw = vec4(transformed,1.0);\n #ifdef USE_INSTANCING\n btw = instanceMatrix * btw;\n #endif\n vBtW = (modelMatrix * btw).xyz;');
    sh.fragmentShader = 'varying vec3 vBtW;\n' + sh.fragmentShader.replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = texture2D(map, vec2((vBtW.x + vBtW.z) * 0.9, vBtW.y * 0.45)); diffuseColor *= sampledDiffuseColor;');
  };

  // ---------------- geometry collector (from the original)
  function collect() {
    const P = [], N = [], U = [], C = [], S = [];
    const put = (p, n, u, v, c, s) => { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); U.push(u, v); C.push(c[0], c[1], c[2]); S.push(s); };
    const api = {
      quad(a, b, c, d, uv, c0, c1, s0 = 0, s1 = 0, nrm = null) {
        const flat = nrm ? null : norm(cross(sub(b, a), sub(d, a))); const n = (p) => (nrm ? nrm(p) : flat);
        put(a, n(a), uv[0], uv[1], c0, s0); put(b, n(b), uv[2], uv[1], c0, s0); put(c, n(c), uv[2], uv[3], c1, s1);
        put(a, n(a), uv[0], uv[1], c0, s0); put(c, n(c), uv[2], uv[3], c1, s1); put(d, n(d), uv[0], uv[3], c1, s1);
        return api;
      },
      tri(a, b, c, uv, ca, cb, cc, s = 0, nrm = null) {
        const flat = nrm ? null : norm(cross(sub(b, a), sub(c, a))); const n = (p) => (nrm ? nrm(p) : flat);
        put(a, n(a), uv[0], uv[1], ca, s); put(b, n(b), uv[2], uv[1], cb, s); put(c, n(c), (uv[0] + uv[2]) / 2, uv[3], cc, s);
        return api;
      },
      strip(base, dir, side, length, hw, seg, bend, uv, c0, c1, s0, s1, nrm) {
        let p = base;
        for (let k = 0; k < seg; k++) {
          const t0 = k / seg, t1 = (k + 1) / seg, a = bend * ((k + 0.5) / seg);
          const d = norm([dir[0] * Math.cos(a), dir[1] * Math.cos(a) - Math.sin(a), dir[2] * Math.cos(a)]);
          const q = mad(p, d, length / seg), v0 = mix(uv[1], uv[3], t0), v1 = mix(uv[1], uv[3], t1);
          api.quad(mad(p, side, -hw), mad(p, side, hw), mad(q, side, hw), mad(q, side, -hw), [uv[0], v0, uv[2], v1], lerp3(c0, c1, t0), lerp3(c0, c1, t1), mix(s0, s1, t0), mix(s0, s1, t1), nrm);
          p = q;
        }
        return p;
      },
      card(center, face, size, turn, uv, c0, c1, s0, s1, nrm) {
        const r0 = perp(face), u0 = cross(face, r0), cs = Math.cos(turn), sn = Math.sin(turn);
        const right = add(mul(r0, cs), mul(u0, sn)), up = add(mul(u0, cs), mul(r0, -sn)), hs = size / 2;
        const a = add(center, add(mul(right, -hs), mul(up, -hs))), b = add(center, add(mul(right, hs), mul(up, -hs)));
        const c = add(center, add(mul(right, hs), mul(up, hs))), d = add(center, add(mul(right, -hs), mul(up, hs)));
        return api.quad(a, b, c, d, uv, c0, c1, s0, s1, nrm);
      },
      blade(foot, turn, width, height, lean, uv, c0, c1, s1, nrm) {
        const right = [Math.cos(turn), 0, Math.sin(turn)], out = [-Math.sin(turn), 0, Math.cos(turn)];
        const up = [out[0] * Math.sin(lean), Math.cos(lean), out[2] * Math.sin(lean)];
        const a = mad(foot, right, -width / 2), b = mad(foot, right, width / 2);
        return api.quad(a, b, mad(b, up, height), mad(a, up, height), uv, c0, c1, 0, s1, nrm);
      },
      limb(a, b, r0, r1, sides, c0, c1, uv = [0, 0, 0, 0], cap = false, s0 = 0, s1 = 0) {
        const d = norm(sub(b, a)), u = perp(d), w = cross(d, u);
        const ring = (i) => { const t = (i / sides) * Math.PI * 2; return add(mul(u, Math.cos(t)), mul(w, Math.sin(t))); };
        for (let i = 0; i < sides; i++) {
          const n0 = ring(i), n1 = ring(i + 1);
          const a0 = mad(a, n0, r0), a1 = mad(a, n1, r0), b0 = mad(b, n0, r1), b1 = mad(b, n1, r1);
          put(a0, n0, uv[0], uv[1], c0, s0), put(a1, n1, uv[2], uv[1], c0, s0), put(b1, n1, uv[2], uv[3], c1, s1);
          put(a0, n0, uv[0], uv[1], c0, s0), put(b1, n1, uv[2], uv[3], c1, s1), put(b0, n0, uv[0], uv[3], c1, s1);
          if (cap) put(b, d, uv[0], uv[3], c1, s1), put(b0, d, uv[0], uv[3], c1, s1), put(b1, d, uv[2], uv[3], c1, s1);
        }
        return api;
      },
      cone(cx, y, cz, radius, height, sides, uv, c0, c1, nrm) {
        const tip = [cx, y + height, cz];
        for (let i = 0; i < sides; i++) {
          const t0 = (i / sides) * Math.PI * 2, t1 = ((i + 1) / sides) * Math.PI * 2;
          api.tri([cx + Math.cos(t0) * radius, y, cz + Math.sin(t0) * radius], [cx + Math.cos(t1) * radius, y, cz + Math.sin(t1) * radius], tip, uv, c0, c0, c1, 0, nrm);
        }
        return api;
      },
      build(sway = true) {
        const g = new T.BufferGeometry();
        g.setAttribute("position", new T.BufferAttribute(new Float32Array(P), 3));
        g.setAttribute("normal", new T.BufferAttribute(new Float32Array(N), 3));
        g.setAttribute("uv", new T.BufferAttribute(new Float32Array(U), 2));
        g.setAttribute("color", new T.BufferAttribute(new Float32Array(C), 3));
        g.setAttribute("aSway", new T.BufferAttribute(new Float32Array(sway ? S : S.map(() => 0)), 1));
        g.computeBoundingSphere();
        return g;
      },
    };
    return api;
  }
  const outOf = (c, lift = 0.35) => (p) => { const d = sub(p, c), l = len(d) || 1; return norm([d[0] / l, d[1] / l + lift, d[2] / l]); };
  const coneOut = (cx = 0, cz = 0) => (p) => { const x = p[0] - cx, z = p[2] - cz, r = Math.hypot(x, z) + 1e-3; return norm([(x / r) * 0.8, 0.75, (z / r) * 0.8]); };

  // ---------------- conifer (pine)
  function farSpruce(H, R, first, planes, sides, m = collect(), x = 0, z = 0, turn = 0, shadeK = 1) {
    const nrm = coneOut(x, z), hw = R / 0.84;
    for (let k = 0; k < planes; k++) {
      const a = turn + (k / planes) * Math.PI, c = Math.cos(a) * hw, s = Math.sin(a) * hw;
      m.quad([x - c, -0.25, z - s], [x + c, -0.25, z + s], [x + c, H, z + s], [x - c, H, z - s], UV.spruce, grey(0.5 * shadeK), grey(0.86 * shadeK), 0, 0.5, nrm);
    }
    if (sides) m.cone(x, first * 0.8, z, R * 0.42, (H - first) * 0.8, sides, SOLID, grey(0.16 * shadeK), grey(0.26 * shadeK), nrm);
    return m;
  }
  function conifer(o) {
    const H = o.height, R = o.radius, nrm = coneOut(), rnd0 = rand(o.seed), tiers = [];
    for (let i = 0; i < o.tiers; i++) {
      const t = i / (o.tiers - 1);
      tiers.push({ t, y: o.first + (H - 1.1 - o.first) * Math.pow(t, 0.92), r: R * Math.pow(1 - t, 0.8) * (0.9 + 0.2 * rnd0()) + 0.32, n: Math.round(mix(o.cards[0], o.cards[1], t)), turn: rnd0() * 6.28 });
    }
    const trunkR = (y) => o.trunk * Math.pow(Math.max(0, 1 - y / H), 0.8) + 0.02;
    function branches(m, step, share, grow, seg, cross2) {
      const rnd = rand(o.seed + 7);
      for (let i = 0; i < tiers.length; i += step) {
        const tier = tiers[i], t = tier.t, n = Math.max(4, Math.round(tier.n * share));
        for (let j = 0; j < n; j++) {
          const a = tier.turn + ((j + (rnd() - 0.5) * 0.5) / n) * Math.PI * 2;
          const out = [Math.cos(a), 0, Math.sin(a)], tang = [-Math.sin(a), 0, Math.cos(a)];
          const pitch = mix(-0.1, 0.4, t) + (rnd() - 0.5) * 0.14, bend = mix(0.62, 0.22, t);
          const dir0 = norm([out[0] * Math.cos(pitch), Math.sin(pitch), out[2] * Math.cos(pitch)]);
          const dir = seg > 1 ? dir0 : norm([dir0[0], dir0[1] - Math.sin(bend * 0.5), dir0[2]]);
          const roll = (rnd() - 0.5) * 0.7;
          const side = norm(add(mul(tang, Math.cos(roll)), mul(cross(dir, tang), Math.sin(roll))));
          const length = tier.r * (0.85 + 0.3 * rnd()) * grow, hw = (0.24 * length + 0.22) * (seg > 1 ? 1 : 1.12);
          const base = [out[0] * 0.04, tier.y + (rnd() - 0.5) * 0.3, out[2] * 0.04], lit = 0.9 + 0.15 * t;
          const flat = seg > 1 || j % 2 === 0;
          m.strip(base, dir, flat ? side : norm(cross(side, dir)), length, hw, seg, seg > 1 ? bend : 0, UV.needle, grey(0.4), grey(lit), 0, 1.1, nrm);
          if (cross2 && j % 2 === 0) m.strip(base, dir, norm(cross(side, dir)), length * 0.92, hw * 0.8, 1, 0, UV.needle, grey(0.36), grey(lit * 0.9), 0, 1.0, nrm);
        }
      }
    }
    function core(m, count, sides) {
      for (let k = 0; k < count; k++) { const t = k / count, y = mix(o.first - 0.4, H - 2.2, t), hh = ((H - o.first) / count) * 1.7; m.cone(0, y, 0, 0.36 * R * Math.pow(1 - t, 0.8) + 0.14, hh, sides, SOLID, grey(0.16), grey(0.26), nrm); }
    }
    function leader(m) { for (const a of [0.3, 1.87]) m.blade([0, H - 1.5, 0], a, 0.85, 1.6, 0, UV.needle, grey(0.6), grey(1.05), 1.2, nrm); }
    const bark = collect(), near = collect(), ys = [-0.25, o.first, H * 0.62, H - 0.7];
    for (let k = 0; k < ys.length - 1; k++) bark.limb([0, ys[k], 0], [0, ys[k + 1], 0], trunkR(Math.max(0, ys[k])) * (k === 0 ? 1.25 : 1), trunkR(ys[k + 1]), 7, grey(1), grey(1));
    const rs = rand(o.seed + 3);
    for (let k = 0; k < 5; k++) { const a = rs() * 6.28, y = mix(0.7, o.first - 0.1, rs()), l = 0.45 + rs() * 0.5; bark.limb([0, y, 0], [Math.cos(a) * l, y + 0.1 - rs() * 0.3, Math.sin(a) * l], 0.035, 0.012, 4, grey(0.8), grey(0.7)); }
    core(near, 4, 6); branches(near, 1, 1, 1, 2, true); leader(near);
    const mid = collect();
    mid.limb([0, -0.25, 0], [0, o.first + 1.2, 0], trunkR(0) * 1.2, trunkR(o.first + 1.2), 4, mul(TRUNK.conifer, 0.9), mul(TRUNK.conifer, 0.8), SOLID);
    core(mid, 3, 5); branches(mid, 1, 0.78, 1.08, 1, false); leader(mid);
    const far = farSpruce(H, R, o.first, 3, 5);
    return { height: H, crown: R, lods: [
      { to: DIST.treeNear, parts: [{ geometry: bark.build(false), material: barkMat, cast: true, tint: false }, { geometry: near.build(), material: leafMat, cast: true, tint: true }] },
      { to: DIST.treeMid, parts: [{ geometry: mid.build(), material: leafMat, cast: false, tint: true }] },
      { to: Infinity, parts: [{ geometry: far.build(), material: leafMat, cast: false, tint: true }] },
    ] };
  }

  // ---------------- broadleaf (tree, birch, sapling)
  function broadleaf(o) {
    const rnd = rand(o.seed), C0 = o.crown.c, CR = o.crown.r, barkCol = o.bark || (() => grey(1)), nrm = outOf(C0, 0.4);
    const fork = [o.lean[0], o.trunkH, o.lean[1]], foot = [0, -0.25, 0], knee = [o.lean[0] * 0.35, o.trunkH * 0.5, o.lean[1] * 0.35];
    const crownAt = (d, k) => [C0[0] + d[0] * CR[0] * k, C0[1] + d[1] * CR[1] * k, C0[2] + d[2] * CR[2] * k];
    const depth = (p) => Math.hypot((p[0] - C0[0]) / CR[0], (p[1] - C0[1]) / CR[1], (p[2] - C0[2]) / CR[2]);
    const mains = [], subs = [], anchors = [];
    for (let j = 0; j <= o.mains; j++) {
      const leaderBranch = j === o.mains, a = (j / o.mains) * Math.PI * 2 + rnd() * 0.8;
      const d = leaderBranch ? [0.05, 1, 0.05] : [Math.cos(a), (rnd() - 0.25) * 0.8, Math.sin(a)];
      const end = crownAt(norm(d), leaderBranch ? 0.5 : 0.52);
      const midp = add(lerp3(fork, end, 0.5), [Math.cos(a) * 0.14 * len(sub(end, fork)) * (leaderBranch ? 0 : 1), -0.05, Math.sin(a) * 0.14 * len(sub(end, fork)) * (leaderBranch ? 0 : 1)]);
      mains.push([fork, midp, end]); anchors.push(end);
      for (let k = 0; k < 2; k++) { const tip = crownAt(norm(add(norm(sub(end, C0)), mul(anyDir(rnd), 0.75))), 0.84); subs.push([end, tip]); anchors.push(tip, lerp3(end, tip, 0.5)); }
    }
    const colour = (p, k = 1) => { const dp = clamp01(depth(p)), hi = clamp01((p[1] - C0[1]) / (2 * CR[1]) + 0.5); return grey(k * (0.46 + 0.56 * dp * dp) * (0.8 + 0.32 * hi)); };
    function leaves(m, per, shell, size, seed) {
      const r = rand(seed);
      const one = (p, spread, facing) => {
        const c = add(p, mul(anyDir(r), spread * r())), s = size * (0.8 + 0.45 * r());
        const face = norm(add(mul(facing, 0.7), mul(anyDir(r), 0.9))), sway = 0.5 + 0.7 * r() + (o.droop || 0);
        m.card(c, face, s, r() * 6.28, UV.leaf, colour(c, 0.92), colour(add(c, [0, s * 0.4, 0]), 1.06), sway * 0.8, sway, nrm);
      };
      for (const p of anchors) for (let k = 0; k < per; k++) one(p, size * 0.55, norm(sub(p, C0)));
      for (let k = 0; k < shell; k++) { const d = anyDir(r); if (d[1] < -0.55) d[1] = -d[1] * 0.3; one(crownAt(norm(d), 0.8 + 0.2 * r()), size * 0.2, norm(d)); }
    }
    const bark = collect(), near = collect(), r0 = o.trunkR;
    bark.limb(foot, [knee[0] * 0.4, 0.5, knee[2] * 0.4], r0 * 1.5, r0 * 1.05, 8, barkCol(0), barkCol(0.5));
    bark.limb([knee[0] * 0.4, 0.5, knee[2] * 0.4], knee, r0 * 1.05, r0 * 0.9, 8, barkCol(0.5), barkCol(knee[1]));
    bark.limb(knee, fork, r0 * 0.9, r0 * 0.74, 8, barkCol(knee[1]), barkCol(fork[1]));
    for (const [a, b, c] of mains) { bark.limb(a, b, r0 * 0.5, r0 * 0.36, 6, barkCol(a[1]), barkCol(b[1])); bark.limb(b, c, r0 * 0.36, r0 * 0.22, 6, barkCol(b[1]), barkCol(c[1])); }
    for (const [a, b] of subs) bark.limb(a, b, r0 * 0.2, r0 * 0.06, 5, barkCol(a[1]), barkCol(b[1]));
    leaves(near, o.perAnchor, o.shell, o.card, o.seed + 1);
    const mid = collect(), ft = o.farTrunk || TRUNK.broad;
    mid.limb(foot, knee, r0 * 1.2, r0 * 0.9, 4, ft, ft, SOLID); mid.limb(knee, fork, r0 * 0.9, r0 * 0.74, 4, ft, ft, SOLID);
    for (const [a, , c] of mains) mid.limb(a, c, r0 * 0.45, r0 * 0.2, 3, ft, mul(ft, 0.8), SOLID);
    leaves(mid, 1, Math.round(o.shell * 0.3), o.card * 1.75, o.seed + 2);
    const far = collect();
    far.limb(foot, fork, r0 * 1.2, r0 * 0.8, 3, ft, ft, SOLID); far.limb(fork, C0, r0 * 0.8, r0 * 0.3, 3, ft, mul(ft, 0.7), SOLID);
    {
      const r = rand(o.seed + 3), big = Math.max(CR[0], CR[1], CR[2]) * 1.5;
      const spots = [[0, 0.7, 0], [0.65, 0, 0.2], [-0.6, 0.05, 0.4], [-0.25, 0, -0.65], [0.4, 0.1, -0.5], [0, -0.4, 0.1], [0.45, -0.3, 0.4], [-0.45, -0.3, -0.3], [0.1, 0.3, 0.6]];
      for (const s of spots.slice(0, o.farCards || 9)) { const p = crownAt(s, 1); far.card(p, norm(add(norm([s[0], 0.15, s[2] + 0.01]), mul(anyDir(r), 0.3))), big * (0.85 + 0.3 * r()), r() * 6.28, UV.leaf, colour(p, 0.95), colour(add(p, [0, big * 0.4, 0]), 1.08), 0.4, 0.6, nrm); }
    }
    return { height: o.height, crown: Math.max(CR[0], CR[2]), lods: [
      { to: o.near || DIST.treeNear, parts: [{ geometry: bark.build(false), material: barkMat, cast: true, tint: false }, { geometry: near.build(), material: leafMat, cast: true, tint: true }] },
      { to: o.mid || DIST.treeMid, parts: [{ geometry: mid.build(), material: leafMat, cast: false, tint: true }] },
      { to: o.far || Infinity, parts: [{ geometry: far.build(), material: leafMat, cast: false, tint: true }] },
    ] };
  }

  const models = {
    pine: conifer({ seed: 11, height: 13, radius: 2.9, first: 2.1, tiers: 15, cards: [10, 5], trunk: 0.24 }),
    tree: broadleaf({ seed: 21, height: 8.6, trunkH: 2.7, trunkR: 0.3, lean: [0.15, -0.1], crown: { c: [0.1, 5.5, 0], r: [3.3, 2.9, 3.3] }, mains: 4, card: 1.25, perAnchor: 5, shell: 150 }),
    birch: broadleaf({
      seed: 25, height: 9.8, trunkH: 4.6, trunkR: 0.16, lean: [0.25, 0.1], crown: { c: [0.25, 6.9, 0.1], r: [1.9, 2.9, 1.9] }, mains: 4, card: 0.9, perAnchor: 4, shell: 110, droop: 0.4,
      bark: (y) => { const band = Math.sin(y * 5.1) * Math.sin(y * 2.3 + 1) > 0.55 ? 0.3 : 1; const k = (y < 0.6 ? 1.6 : 6.5) * band; return [k, k * 1.08, k * 1.22]; },
      farTrunk: TRUNK.birch,
    }),
    sapling: broadleaf({ seed: 27, height: 2.9, trunkH: 1.1, trunkR: 0.05, lean: [0.08, 0.05], crown: { c: [0.08, 1.95, 0.05], r: [0.85, 0.95, 0.85] }, mains: 2, card: 0.62, perAnchor: 2, shell: 22, near: 35, mid: 110, far: DIST.smallTree, farCards: 4 }),
  };
  return { models, WIND, leafMat, barkMat };
}
