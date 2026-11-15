// Herbe 3D — portage de l'herbe de Larkhollow (brins instanciés, 4 anneaux de détail autour de la caméra,
// vent, rétro-éclairage, ombres du soleil) adaptée à Limoges 3D :
//  - hauteur : le terrain du jeu (groundH), échantillonné autour de la caméra
//  - où pousse l'herbe : masque data/tex/herbe_masque.jpg (BD ORTHO + LiDAR MNH, sans bâtiments, eau ni chaussée)
//  - lumière : le soleil (DirectionalLight + sa carte d'ombre) et le ciel (HemisphereLight) du jeu
export function createLarkGrass(T, o) {
  const { renderer, scene, camera, sun, hemi, groundH } = o;
  const QUAL = o.quality || { density: 0.6, distance: 70 };
  // ---- noise texture (tileable value-noise fbm, one frequency per channel)
  function noiseTex(N = 256) {
    const d = new Uint8Array(N * N * 4), rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    for (let ch = 0; ch < 4; ch++) {
      const out = new Float32Array(N * N);
      for (let oct = 0, amp = 1, f = [4, 8, 16, 32][ch]; oct < 4; oct++, amp *= 0.5, f *= 2) {
        const g = new Float32Array(f * f).map(() => rnd());
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const fx = x / N * f, fy = y / N * f, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
          const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), x1 = (x0 + 1) % f, y1 = (y0 + 1) % f;
          const a = g[y0 * f + x0], b = g[y0 * f + x1], c = g[y1 * f + x0], e = g[y1 * f + x1];
          out[y * N + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + e * sx) * sy);
        }
      }
      let mn = 1e9, mx = -1e9; for (const v of out) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
      for (let i = 0; i < N * N; i++) d[i * 4 + ch] = Math.round((out[i] - mn) / (mx - mn) * 255);
    }
    const t = new T.DataTexture(d, N, N, T.RGBAFormat); t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter;
    t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
  }
  // ---- local height map around the camera (exact terrain height), refreshed when the camera moves
  const HN = 128, HS = 1.6, HW = HN * HS;   // 205 m window
  const hData = new Float32Array(HN * HN);
  const hTex = new T.DataTexture(hData, HN, HN, T.RedFormat, T.FloatType); hTex.magFilter = hTex.minFilter = T.NearestFilter; hTex.needsUpdate = true;
  const U = {
    uNoiseA: { value: noiseTex() }, uTime: { value: 0 }, uSeason: { value: o.season ?? 0.75 }, uSnow: { value: 0 }, uWet: { value: 0 }, uFrost: { value: 0 },
    uWind: { value: new T.Vector4(0.8, 0.6, 0.28, 0) }, uSwayAmp: { value: 0.16 }, uPlayer: { value: new T.Vector3(1e6, 0, 1e6) },
    uHeightMap: { value: hTex }, uHeightRect: { value: new T.Vector4(0, 0, HW, HW) },
    uGroundMap: { value: null }, uGroundRect: { value: new T.Vector4(-3000, -3000, 6000, 6000) },
    uSunDir: { value: new T.Vector3(0, 1, 0) }, uSunCol: { value: new T.Color(1, 1, 1) }, uAmbSky: { value: new T.Color() }, uAmbGround: { value: new T.Color() },
    uShadowMap: { value: null }, uShadowMat: { value: new T.Matrix4() }, uShadowOn: { value: 0 }, uGrassCam: { value: new T.Vector2() }, uGrassCamH: { value: 0 }
  };
  new T.TextureLoader().load(o.maskUrl, t => { t.colorSpace = T.NoColorSpace; t.flipY = false; t.minFilter = T.LinearMipmapLinearFilter; t.anisotropy = 4; U.uGroundMap.value = t; ready = true; });
  let ready = false, hx = 1e9, hz = 1e9;
  function refreshHeight(cx, cz) {
    hx = Math.round(cx / 16) * 16; hz = Math.round(cz / 16) * 16;
    const x0 = hx - HW / 2, z0 = hz - HW / 2;
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) hData[j * HN + i] = groundH(x0 + (i + 0.5) * HS, z0 + (j + 0.5) * HS);
    hTex.needsUpdate = true; U.uHeightRect.value.set(x0, z0, HW, HW);
  }
  const COMMON = /* glsl */`
uniform sampler2D uNoiseA; uniform float uTime, uSeason, uSnow, uWet, uFrost, uSwayAmp; uniform vec4 uWind; uniform vec3 uPlayer;
#define GTEX(s, uv) textureLod(s, uv, 0.0)
float gSeasonW(float s) { float d = abs(mod(uSeason - s + 2.0, 4.0) - 2.0); return clamp(1.0 - d, 0.0, 1.0); }
vec3 meadowTint(vec2 xz, out float lush) {
  float n0 = GTEX(uNoiseA, xz * 0.0023 + 0.71).b; float n1 = GTEX(uNoiseA, xz * 0.013).r;
  float n2 = GTEX(uNoiseA, xz * 0.061 + 0.37).g; float n3 = GTEX(uNoiseA, xz * 0.29 + 0.11).a;
  lush = smoothstep(0.25, 0.78, n1 * 0.42 + n2 * 0.33 + n3 * 0.15 + n0 * 0.1);
  float warm = smoothstep(0.35, 0.75, n2 * 0.6 + n0 * 0.4);
  vec3 spring = mix(vec3(0.118, 0.17, 0.034), vec3(0.058, 0.142, 0.026), lush);
  vec3 summer = mix(vec3(0.125, 0.14, 0.04), vec3(0.04, 0.105, 0.024), lush);
  vec3 autumn = mix(vec3(0.19, 0.15, 0.05), vec3(0.09, 0.11, 0.03), lush);
  vec3 winter = mix(vec3(0.17, 0.14, 0.08), vec3(0.105, 0.1, 0.05), lush);
  vec3 c = spring * gSeasonW(0.0) + summer * gSeasonW(1.0) + autumn * gSeasonW(2.0) + winter * gSeasonW(3.0);
  return mix(c, c * vec3(1.22, 1.06, 0.72), warm * 0.45);
}
vec3 windDisplace(vec3 wp, float sway, float seed) {
  vec2 dir = uWind.xy; float str = uWind.z; float t = uTime;
  float along = dot(wp.xz, dir), across = dot(wp.xz, vec2(-dir.y, dir.x));
  float ph = along * 0.12 - t * (0.55 + str * 1.5);
  float wave = sin(ph) * 0.5 + sin(ph * 2.17 + 1.3) * 0.28 + sin(across * 0.19 + t * 0.63) * 0.22;
  float gustN = textureLod(uNoiseA, wp.xz * 0.011 - dir * t * (0.02 + 0.05 * str), 0.0).r;
  float amp = str * (0.3 + 1.1 * gustN) + 0.03;
  float lean = (0.55 + 0.45 * wave) * amp;
  float fl = sin(t * (4.3 + seed * 5.0) + seed * 41.0 + wp.x * 2.7) * 0.6 + sin(t * 8.9 + seed * 17.0 + wp.z * 3.9) * 0.4;
  float s2 = sway * sway;
  vec3 d = vec3(dir.x, 0.0, dir.y) * (lean * s2);
  d += vec3(-dir.y, 0.35, dir.x) * (fl * 0.11 * amp * sway);
  d.y -= dot(d.xz, d.xz) * 0.35;
  return d * uSwayAmp;
}`;
  const VERT = /* glsl */`
attribute vec4 aBlade;
uniform vec2 uGrassCenter, uGrassCam; uniform float uGrassCamH; uniform vec4 uGrassLod, uGrassFade;
uniform sampler2D uHeightMap, uGroundMap; uniform vec4 uHeightRect, uGroundRect;
varying vec4 vGrass; varying vec3 vGrassCol; varying float vGrassDry; varying vec3 vWPos, vWNrm; varying float vViewZ;
${COMMON}
float heightAt(vec2 huv) {   // manual bilinear (float textures are not filterable on every iPhone)
  vec2 sz = vec2(textureSize(uHeightMap, 0)); vec2 p = huv * sz - 0.5; vec2 f = fract(p); ivec2 i = ivec2(floor(p));
  ivec2 m = ivec2(sz) - 1;
  float a = texelFetch(uHeightMap, clamp(i, ivec2(0), m), 0).r, b = texelFetch(uHeightMap, clamp(i + ivec2(1, 0), ivec2(0), m), 0).r;
  float c = texelFetch(uHeightMap, clamp(i + ivec2(0, 1), ivec2(0), m), 0).r, d = texelFetch(uHeightMap, clamp(i + ivec2(1, 1), ivec2(0), m), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  vec3 transformed = vec3(0.0); vec3 objectNormal = vec3(0.0, 1.0, 0.0);
  float win = uGrassLod.x;
  vec2 wxz = mod(aBlade.xy * win - uGrassCenter, win) - win * 0.5 + uGrassCenter;
  float r1 = aBlade.z, r2 = aBlade.w;
  float r3 = fract(r1 * 91.7 + r2 * 13.3), r4 = fract(r2 * 57.1 + r1 * 7.7);
  float dist = length(vec3(wxz - uGrassCam, uGrassCamH));
  float lodK = smoothstep(uGrassLod.y, uGrassLod.z, dist) * (1.0 - smoothstep(uGrassFade.x, uGrassFade.y, dist));
  float fadeR = fract(r2 * 13.7 + r3 * 3.1) * 0.82;
  float lodF = smoothstep(fadeR, fadeR + 0.18, lodK);
  vec2 huv = (wxz - uHeightRect.xy) / uHeightRect.zw;
  float inH = step(0.0, min(min(huv.x, huv.y), min(1.0 - huv.x, 1.0 - huv.y)));
  float gy = heightAt(huv);
  vec4 gclip = projectionMatrix * (viewMatrix * vec4(wxz.x, gy + 0.25, wxz.y, 1.0));
  if (lodF < 0.001 || inH < 0.5 || gclip.w < -0.6 || abs(gclip.x) > gclip.w + 1.3 || abs(gclip.y) > gclip.w + 1.6) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 guv = (wxz - uGroundRect.xy) / uGroundRect.zw;          // mask row 0 = north = local z -3000
  vec4 gm = textureLod(uGroundMap, guv, 0.0);
  float dens = gm.g;
  float lush; vec3 tint = meadowTint(wxz, lush);
  dens *= 0.62 + 0.38 * lush;
  float alive = step(fract(r1 * 7.13 + 0.17), dens * 1.25) * step(r3, 0.45 + 0.55 * dens) * inH * step(0.001, lodF) * mix(0.6, 1.0, lodF);
  if (alive < 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float sSpr = gSeasonW(0.0), sSum = gSeasonW(1.0), sAut = gSeasonW(2.0), sWin = gSeasonW(3.0);
  float hSeason = sSpr * 0.86 + sSum * 1.0 + sAut * 0.9 + sWin * 0.5;
  float dry = sSum * 0.25 + sAut * 0.7 + sWin * 0.95;
  float verge = mix(1.0, 0.45, smoothstep(0.1, 0.55, max(gm.r, gm.b)));
  float hgt = (0.11 + 0.29 * lush) * (0.5 + 0.75 * r1) * (0.7 + 0.6 * r2 * r2) * hSeason * verge * uGrassFade.w * alive;
  float wid = (0.0062 + 0.005 * r3) * uGrassFade.z;
  float flower = step(r4, 0.016 * (sSpr * 1.2 + sSum * 0.6) * lush) * step(0.5, alive);
  hgt *= 1.0 + flower * 0.35;
  float ang = r2 * 6.2832;
  vec2 face = vec2(cos(ang), sin(ang)); vec2 sideD = vec2(-face.y, face.x);
  vec3 root = vec3(wxz.x, gy, wxz.y);
  vec3 wd = windDisplace(root, 1.0, r2);
  vec2 pd = wxz - uPlayer.xz; float pl = length(pd);
  float push = (1.0 - smoothstep(1.0, 2.6, pl)) * step(abs(uPlayer.y - gy), 2.0);      // the car pushes the grass aside
  vec2 lean = face * (0.12 + 0.38 * r4 + dry * 0.25) + wd.xz * 2.4 + (pd / max(pl, 0.05)) * push * 1.1;
  float ll = length(lean); lean *= min(1.0, 0.97 / max(ll, 1e-4)); ll = min(ll, 0.97);
  float t = position.y, sx = position.x;
  vec2 tipXZ = lean * hgt; float tipY = sqrt(1.0 - ll * ll) * hgt;
  vec2 midXZ = tipXZ * 0.3; float midY = tipY * 0.66; float it = 1.0 - t;
  vec2 bxz = 2.0 * it * t * midXZ + t * t * tipXZ; float by = 2.0 * it * t * midY + t * t * tipY;
  vec2 dxz = 2.0 * (1.0 - 2.0 * t) * midXZ + 2.0 * t * tipXZ; float dy = 2.0 * (1.0 - 2.0 * t) * midY + 2.0 * t * tipY;
  float w = wid * (1.0 - t * t) * (0.55 + 0.45 * step(0.5, alive));
  w = mix(w, wid * 1.7, flower * smoothstep(0.78, 0.9, t));
  vec3 sideV = vec3(sideD.x, 0.0, sideD.y);
  vec3 wpos = root + vec3(bxz.x, by, bxz.y) + sideV * (sx * w);
  vec3 tang = normalize(vec3(dxz.x, dy + 1e-5, dxz.y));
  vec3 bn = normalize(cross(sideV, tang));
  objectNormal = normalize(bn + sideV * sx * 0.5);
  vGrass = vec4(t, fract(r1 * 3.7 + r2 * 0.31), flower, sx);
  vGrassCol = tint; vGrassDry = dry * (0.35 + 0.65 * r4) * (1.0 - lush * 0.4);
  vWPos = wpos; vWNrm = objectNormal;
  vec4 mv = viewMatrix * vec4(wpos, 1.0); vViewZ = -mv.z; gl_Position = projectionMatrix * mv;
}`;
  const FRAG = /* glsl */`
precision highp sampler2DShadow;
uniform float uWet, uSnow, uFrost; uniform vec3 uSunDir, uSunCol, uAmbSky, uAmbGround;
uniform sampler2DShadow uShadowMap; uniform mat4 uShadowMat; uniform float uShadowOn; uniform vec2 uGrassShade;
varying vec4 vGrass; varying vec3 vGrassCol; varying float vGrassDry; varying vec3 vWPos, vWNrm; varying float vViewZ;
float sunShadow(vec3 wp) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sc = uShadowMat * vec4(wp, 1.0); sc.xyz /= sc.w;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  return texture(uShadowMap, vec3(sc.xy, sc.z - 0.0008));
}
void main() {
  float t = vGrass.x, r = vGrass.y, flower = vGrass.z;
  vec3 tint = vGrassCol;
  vec3 root = tint * vec3(0.5, 0.58, 0.55);
  vec3 tip = tint * 1.45 + vec3(0.016, 0.022, 0.0);
  vec3 straw = vec3(0.4, 0.33, 0.16) * (0.75 + 0.5 * r);
  float dry = clamp(vGrassDry, 0.0, 1.0);
  tip = mix(tip, straw, dry); root = mix(root, straw * 0.45, dry * 0.6);
  vec3 c = mix(root, tip, smoothstep(0.0, 0.8, t));
  c *= 0.82 + 0.36 * r;
  c *= 1.0 - 0.14 * smoothstep(0.3, 0.0, abs(vGrass.w));
  vec3 fc = r < 0.4 ? vec3(0.85, 0.82, 0.7) : (r < 0.72 ? vec3(0.85, 0.62, 0.08) : vec3(0.45, 0.25, 0.62));
  float head = flower * smoothstep(0.76, 0.86, t);
  c = mix(c, fc, head);
  c *= 1.0 - 0.28 * uWet;
  float far = smoothstep(0.6, 0.9, uGrassShade.x);
  float rough = mix(mix(0.5 + 0.2 * r, 0.22, uWet * 0.8), 0.96, far);
  vec3 n = normalize(vWNrm); if (!gl_FrontFacing) n = -n;
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), uGrassShade.x));
  vec3 v = normalize(cameraPosition - vWPos);
  float ao = mix(uGrassShade.y, 1.0, smoothstep(0.0, 0.65, t));
  float sh = sunShadow(vWPos + vec3(0.0, 0.03, 0.0));
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 col = c * uSunCol * (ndl * sh * 0.3183);
  col += c * mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5) * (ao * 1.15);
  vec3 hv = normalize(v + uSunDir);
  float spec = pow(max(dot(n, hv), 0.0), mix(90.0, 6.0, rough)) * (1.0 - rough) * (1.0 - rough);
  col += uSunCol * (spec * 0.12 * sh * ndl);
  float through = pow(clamp(dot(v, -uSunDir), 0.0, 1.0), 2.2);
  col += c * vec3(1.35, 1.3, 0.55) * uSunCol * (through * 0.1 * (0.3 + 0.7 * t) * (1.0 - head) * mix(1.0, 0.45, far) * (0.35 + 0.65 * sh));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
  // blade geometry: seg segments, two vertices per row and a tip; instanced by aBlade (x, z in 0..1, two randoms)
  function bladeGeo(seg, count, seed, win, clump) {
    const g = new T.InstancedBufferGeometry(), p = [], idx = [];
    for (let k = 0; k < seg; k++) { const y = k / seg; p.push(-1, y, 0, 1, y, 0); }
    p.push(0, 1, 0);
    for (let k = 0; k < seg - 1; k++) { const x = k * 2; idx.push(x, x + 1, x + 2, x + 1, x + 3, x + 2); }
    const l = (seg - 1) * 2; idx.push(l, l + 1, l + 2);
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); g.setIndex(idx);
    let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const a = new Float32Array(count * 4);
    for (let f = 0; f < count;) {
      const cx = rnd(), cz = rnd(), cr = rnd(), n = Math.min(count - f, 2 + Math.floor(rnd() * 4)), rad = clump / win * (0.6 + rnd() * 0.9);
      for (let b = 0; b < n; b++, f++) {
        const an = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * rad; let x = cx + Math.cos(an) * rr, z = cz + Math.sin(an) * rr;
        x -= Math.floor(x); z -= Math.floor(z); a[f * 4] = x; a[f * 4 + 1] = z; a[f * 4 + 2] = cr; a[f * 4 + 3] = rnd();
      }
    }
    g.setAttribute('aBlade', new T.InstancedBufferAttribute(a, 4)); g.instanceCount = count;
    g.boundingSphere = new T.Sphere(new T.Vector3(), 1e5); return g;
  }
  const RINGS = [
    { win: 7.2, shift: 1.6, density: 520, seg: 3, in0: -1, in1: 0, out0: 3.8, out1: 5, width: 1, height: 1, clump: 0.06, up: 0.55, ao: 0.2 },
    { win: 18, shift: 4.5, density: 210, seg: 2, in0: 3.3, in1: 4.6, out0: 10, out1: 13, width: 1.9, height: 1, clump: 0.08, up: 0.65, ao: 0.26 },
    { win: 44, shift: 10.5, density: 36, seg: 1, in0: 8.5, in1: 12, out0: 26, out1: 32, width: 4.6, height: 1.08, clump: 0.14, up: 0.85, ao: 0.42 },
    { win: 104, shift: 25, density: 3.5, seg: 1, in0: 22, in1: 30, out0: 62, out1: 75, width: 11, height: 1.2, clump: 0.4, up: 0.95, ao: 0.55 }];
  const group = new T.Group(); group.name = 'herbe_lark'; const centers = [];
  RINGS.forEach((h, i) => {
    const out1 = Math.min(h.out1, QUAL.distance, h.win / 2 + h.shift), out0 = Math.min(h.out0, out1 * 0.82);
    const count = Math.round(h.win * h.win * h.density * QUAL.density); if (count < 100) return;
    const center = { value: new T.Vector2() }; centers.push({ u: center, shift: h.shift });
    const mat = new T.ShaderMaterial({
      name: 'herbe' + i, vertexShader: VERT, fragmentShader: FRAG, side: T.DoubleSide,
      uniforms: { ...U, uGrassCenter: center, uGrassLod: { value: new T.Vector4(h.win, h.in0, h.in1, 0) }, uGrassFade: { value: new T.Vector4(out0, out1, h.width, h.height) }, uGrassShade: { value: new T.Vector2(h.up, h.ao) } }
    });
    const m = new T.Mesh(bladeGeo(h.seg, count, 100 + i, h.win, h.clump), mat);
    m.frustumCulled = false; m.renderOrder = 1 + i; m.castShadow = false; m.receiveShadow = false; group.add(m);
  });
  scene.add(group);
  const tmpC = new T.Color(), fw = new T.Vector3();
  return {
    group,
    get blades() { return group.children.reduce((a, m) => a + m.geometry.instanceCount, 0); },
    update(dt, player) {
      group.visible = ready && (o.isVisible ? o.isVisible() : true); if (!group.visible) return;
      const p = camera.position;
      if (Math.abs(p.x - hx) > 24 || Math.abs(p.z - hz) > 24) refreshHeight(p.x, p.z);
      U.uTime.value += dt;
      if (player) U.uPlayer.value.copy(player);
      const gh = groundH(p.x, p.z); U.uGrassCam.value.set(p.x, p.z); U.uGrassCamH.value = Math.max(0, p.y - gh - 3) * 0.75;
      camera.getWorldDirection(fw); let fx = fw.x, fz = fw.z, L = Math.hypot(fx, fz); if (L < 1e-4) { fx = 0; fz = -1; L = 1; } fx /= L; fz /= L;
      const k = Math.min(1, Math.max(0, (p.y - (gh + 3)) / 12));
      for (const c of centers) { const v = c.shift * (1 - k * 0.6); c.u.value.set(p.x + fx * v, p.z + fz * v); }
      // lighting from the game's sun and sky
      U.uSunDir.value.copy(sun.position).sub(sun.target.position).normalize();
      U.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
      U.uAmbSky.value.copy(hemi.color).multiplyScalar(hemi.intensity / Math.PI);
      U.uAmbGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity / Math.PI);
      const sm = sun.castShadow && sun.shadow.map && sun.shadow.map.depthTexture;
      U.uShadowOn.value = sm ? 1 : 0; if (sm) { U.uShadowMap.value = sm; U.uShadowMat.value.copy(sun.shadow.matrix); }
    }
  };
}
