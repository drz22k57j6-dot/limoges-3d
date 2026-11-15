// Lumière de Larkhollow pour Limoges 3D : ciel physique (diffusion Rayleigh + Mie, LUT), couleur du soleil
// par transmittance atmosphérique, lumière ambiante tirée du ciel, et rendu AgX « look » + étalonnage du jeu.
const ATM = `
#ifndef PI
#define PI 3.141592653589793
#endif
const float ATM_RE = 6360e3;
const float ATM_RA = 6460e3;
const vec3  ATM_BR = vec3(5.802e-6, 13.558e-6, 33.1e-6);
const float ATM_BMS = 3.996e-6;
const float ATM_BME = 4.44e-6;
const vec3  ATM_BO = vec3(0.650e-6, 1.881e-6, 0.085e-6);
const float ATM_HR = 8000.0;
const float ATM_HM = 1200.0;

uniform float uTurbidity;
uniform float uMultiScatter;
uniform vec3 uMsTint;

vec3 atmDensity(float h) {
  // below the surface the exponentials blow up, which gives a soft earth shadow for free
  h = max(h, -60000.0);
  return vec3(exp(-h / ATM_HR), exp(-max(h, -8000.0) / ATM_HM) * uTurbidity, max(0.0, 1.0 - abs(h - 25000.0) / 15000.0));
}
vec2 atmRaySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return vec2(1e12, -1e12);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}
vec3 atmExtinction(vec3 od) { return ATM_BR * od.x + vec3(ATM_BME) * od.y + ATM_BO * od.z; }

vec3 atmLightDepth(vec3 p, vec3 l) {
  float tmax = atmRaySphere(p, l, ATM_RA).y;
  const int N = 6;
  float dt = tmax / float(N);
  vec3 od = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec3 q = p + l * ((float(i) + 0.5) * dt);
    od += atmDensity(length(q) - ATM_RE) * dt;
  }
  return od;
}
float atmPhaseR(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }
float atmPhaseM(float mu, float g) {
  float g2 = g * g;
  return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
}

// Single scattering (+ cheap isotropic multi-scatter fill) seen from 'alt' metres above ground.
// E is the light's irradiance above the atmosphere. Returns radiance; 'trans' is view transmittance.
vec3 atmScatter(vec3 rd, vec3 l, vec3 E, float alt, float g, out vec3 trans, out bool hitGround) {
  vec3 ro = vec3(0.0, ATM_RE + alt, 0.0);
  float tmax = atmRaySphere(ro, rd, ATM_RA).y;
  vec2 te = atmRaySphere(ro, rd, ATM_RE);
  hitGround = te.x > 0.0;
  if (hitGround) tmax = te.x;
  const int N = 24;
  vec3 od = vec3(0.0), sumR = vec3(0.0), sumM = vec3(0.0);
  float prevT = 0.0;
  for (int i = 0; i < N; i++) {
    float f = (float(i) + 1.0) / float(N);
    float t1 = tmax * f * f;
    float dt = t1 - prevT;
    vec3 p = ro + rd * (prevT + dt * 0.5);
    prevT = t1;
    vec3 d = atmDensity(length(p) - ATM_RE) * dt;
    vec3 T = exp(-atmExtinction(od + d * 0.5 + atmLightDepth(p, l)));
    sumR += T * d.x;
    sumM += T * d.y;
    od += d;
  }
  trans = exp(-atmExtinction(od));
  float mu = dot(rd, l);
  vec3 L = E * (sumR * ATM_BR * atmPhaseR(mu) + sumM * ATM_BMS * atmPhaseM(mu, g));
  L += E * (sumR * ATM_BR + sumM * ATM_BMS) * uMsTint * (uMultiScatter / (4.0 * PI));
  return L;
}

// Sky LUT parameterisation: u = azimuth, v = elevation with extra resolution at the horizon.
vec2 skyLutUv(vec3 d) {
  float az = atan(d.z, d.x);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float c = sign(el) * sqrt(abs(el) / (PI * 0.5));
  return vec2(az / (2.0 * PI) + 0.5, c * 0.5 + 0.5);
}
vec3 skyLutDir(vec2 uv) {
  float az = (uv.x - 0.5) * 2.0 * PI;
  float c = uv.y * 2.0 - 1.0;
  float el = sign(c) * c * c * PI * 0.5;
  return vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
}
`;
export function createLarkLight(T, renderer, opts = {}) {
  const K = opts.scale ?? 0.15;          // Larkhollow sun constant 20 → our scene units (sun ≈ 3)
  const SUN_E = 20;
  // ---------------- CPU atmosphere (same model) for the sun colour and the ambient light
  const RE = 6360e3, RA = 6460e3, BR = [5.802e-6, 13.558e-6, 33.1e-6], BMS = 3.996e-6, BME = 4.44e-6, BO = [0.65e-6, 1.881e-6, 0.085e-6], HR = 8000, HM = 1200;
  const dens = h => { h = Math.max(h, -60000); return [Math.exp(-h / HR), Math.exp(-Math.max(h, -8000) / HM), Math.max(0, 1 - Math.abs(h - 25000) / 15000)]; };
  const raySph = (ro, rd, r) => { const b = ro[0] * rd[0] + ro[1] * rd[1] + ro[2] * rd[2], c = ro[0] ** 2 + ro[1] ** 2 + ro[2] ** 2 - r * r, d = b * b - c; if (d < 0) return [1e12, -1e12]; const s = Math.sqrt(d); return [-b - s, -b + s]; };
  const ext = od => [0, 1, 2].map(i => BR[i] * od[0] + BME * od[1] + BO[i] * od[2]);
  const lightDepth = (p, l) => { const tm = raySph(p, l, RA)[1], N = 6, dt = tm / N, od = [0, 0, 0]; for (let i = 0; i < N; i++) { const q = p.map((v, k) => v + l[k] * (i + 0.5) * dt); const d = dens(Math.hypot(...q) - RE); od[0] += d[0] * dt; od[1] += d[1] * dt; od[2] += d[2] * dt; } return od; };
  const phR = mu => 3 / (16 * Math.PI) * (1 + mu * mu);
  const phM = (mu, g) => { const g2 = g * g; return 3 / (8 * Math.PI) * ((1 - g2) * (1 + mu * mu)) / ((2 + g2) * Math.pow(Math.max(1 + g2 - 2 * g * mu, 1e-4), 1.5)); };
  function scatter(rd, l, E, ms, msT) {
    const ro = [0, RE + 40, 0]; let tmax = raySph(ro, rd, RA)[1]; const te = raySph(ro, rd, RE); if (te[0] > 0) tmax = te[0];
    const N = 24, od = [0, 0, 0], sR = [0, 0, 0], sM = [0, 0, 0]; let prev = 0;
    for (let i = 0; i < N; i++) {
      const f = (i + 1) / N, t1 = tmax * f * f, dt = t1 - prev, p = ro.map((v, k) => v + rd[k] * (prev + dt * 0.5)); prev = t1;
      const d = dens(Math.hypot(...p) - RE).map(v => v * dt), ld = lightDepth(p, l);
      const tr = ext([od[0] + d[0] * 0.5 + ld[0], od[1] + d[1] * 0.5 + ld[1], od[2] + d[2] * 0.5 + ld[2]]).map(v => Math.exp(-v));
      for (let k = 0; k < 3; k++) { sR[k] += tr[k] * d[0]; sM[k] += tr[k] * d[1]; }
      od[0] += d[0]; od[1] += d[1]; od[2] += d[2];
    }
    const mu = rd[0] * l[0] + rd[1] * l[1] + rd[2] * l[2];
    return [0, 1, 2].map(k => E * (sR[k] * BR[k] * phR(mu) + sM[k] * BMS * phM(mu, 0.76)) + E * (sR[k] * BR[k] + sM[k] * BMS) * msT[k] * (ms / (4 * Math.PI)));
  }
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  // ---------------- GPU sky LUT + dome
  const lutRT = new T.WebGLRenderTarget(256, 144, { type: T.HalfFloatType, depthBuffer: false, magFilter: T.LinearFilter, minFilter: T.LinearFilter, wrapS: T.RepeatWrapping, wrapT: T.ClampToEdgeWrapping, generateMipmaps: false });
  const lutMat = new T.ShaderMaterial({
    glslVersion: T.GLSL3, depthTest: false, depthWrite: false,
    uniforms: { uTurbidity: { value: 1 }, uMultiScatter: { value: 0.55 }, uMsTint: { value: new T.Vector3(1, 1, 1) }, uSunDir: { value: new T.Vector3() }, uSunE: { value: new T.Vector3() }, uNightCol: { value: new T.Vector3() }, uGroundRad: { value: new T.Vector3() } },
    vertexShader: 'out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: ATM + `
in vec2 vUv; out vec4 outColor;
uniform vec3 uSunDir, uSunE, uNightCol, uGroundRad;
void main() {
  vec3 d = skyLutDir(vUv); vec3 Tr; bool hit;
  vec3 L = atmScatter(d, uSunDir, uSunE, 40.0, 0.76, Tr, hit);
  L += uNightCol * (0.55 + 0.45 * (1.0 - abs(d.y)));
  if (hit) L += Tr * uGroundRad;
  outColor = vec4(max(L, 0.0), 1.0);
}` });
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), lutMat), qScene = new T.Scene(), qCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1); qScene.add(quad);
  const domeMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: { uSkyLut: { value: lutRT.texture }, uIntensity: { value: K }, uSunDir: { value: new T.Vector3() }, uSunDisc: { value: new T.Vector3() }, uGround: { value: new T.Vector3() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position,1.0)).xyz, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `
#define PI 3.141592653589793
uniform sampler2D uSkyLut; uniform float uIntensity; uniform vec3 uSunDir, uSunDisc, uGround; varying vec3 vDir;
vec2 skyLutUv(vec3 d) { float az = atan(d.z, d.x); float el = asin(clamp(d.y, -1.0, 1.0)); float c = sign(el) * sqrt(abs(el) / (PI * 0.5)); return vec2(az / (2.0 * PI) + 0.5, c * 0.5 + 0.5); }
void main() {
  vec3 d = normalize(vDir);
  vec3 sky = texture2D(uSkyLut, skyLutUv(vec3(d.x, max(d.y, 0.004), d.z))).rgb;
  float sd = dot(d, uSunDir); float disc = smoothstep(0.99990, 0.99996, sd);
  sky += uSunDisc * disc;
  vec3 col = mix(sky, uGround, smoothstep(0.02, -0.12, d.y));
  gl_FragColor = vec4(col * uIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}` });
  const dome = new T.Mesh(new T.SphereGeometry(1, 48, 24), domeMat); dome.scale.setScalar(opts.radius || 4200); dome.frustumCulled = false; dome.renderOrder = -10; dome.name = 'ciel_lark';
  const envScene = new T.Scene(); const envDome = new T.Mesh(dome.geometry, domeMat); envDome.scale.setScalar(100); envScene.add(envDome);
  const pmrem = new T.PMREMGenerator(renderer); let envRT = null;
  // ---------------- tone mapping AgX + Larkhollow look and grade (custom tone mapping, used by OutputPass and materials)
  const grade = opts.grade || { slope: [1, 1, 1], power: [1.2, 1.2, 1.2], sat: 1.21, gain: [1.015, 1.0, 0.965], lift: [0.002, 0.003, 0], sh: [0.975, 0.995, 1.03], hi: [1.03, 1.01, 0.955] };
  const v3 = a => `vec3(${a.map(x => x.toFixed(4)).join(',')})`;
  T.ShaderChunk.tonemapping_pars_fragment = T.ShaderChunk.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }', `
const mat3 LK_R2S = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
const mat3 LK_S2R = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
vec3 lkContrast(vec3 x) { vec3 x2 = x * x; vec3 x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; }
vec3 CustomToneMapping( vec3 color ) {
  const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
  const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
  const float minEv = -12.47393, maxEv = 4.026069;
  color *= toneMappingExposure;
  color = LK_S2R * color; color = inset * color; color = max(color, 1e-10);
  color = clamp((log2(color) - minEv) / (maxEv - minEv), 0.0, 1.0);
  color = lkContrast(color);
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = pow(max(color * ${v3(grade.slope)}, 0.0), ${v3(grade.power)}); color = luma + ${grade.sat.toFixed(3)} * (color - luma);
  color = outset * color; color = pow(max(vec3(0.0), color), vec3(2.2)); color = LK_R2S * color; color = clamp(color, 0.0, 1.0);
  color = color * ${v3(grade.gain)} + ${v3(grade.lift)} * (1.0 - color);
  float l = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color *= mix(${v3(grade.sh)}, ${v3(grade.hi)}, smoothstep(0.08, 0.7, l));
  return clamp(color, 0.0, 1.0);
}`);
  renderer.toneMapping = T.CustomToneMapping;
  const res = { sunColor: new T.Color(), sunIntensity: 0, ambSky: new T.Color(), ambGround: new T.Color(), horizon: new T.Color(), zenith: new T.Color() };
  return {
    dome, envMap: () => envRT && envRT.texture,
    // sunDir: unit vector towards the sun (y up). Returns lighting for the scene.
    update(sunDir) {
      const sd = [sunDir.x, sunDir.y, sunDir.z];
      const g = ss(0.07, -0.06, sunDir.y);
      const msT = [lerp(1, 0.42, g), lerp(1, 0.72, g), lerp(1, 1.45, g)], ms = 0.55 + 2.4 * g;
      // sun colour = transmittance from the ground to the sun
      const tr = sunDir.y > -0.1 ? ext(lightDepth([0, RE + 40, 0], sd)).map(v => Math.exp(-v)) : [0, 0, 0];
      const fade = ss(-0.03, 0.02, sunDir.y);
      const sunRad = tr.map(v => v * SUN_E * fade);
      const mx = Math.max(...sunRad, 1e-6);
      res.sunColor.setRGB(sunRad[0] / mx, sunRad[1] / mx, sunRad[2] / mx, T.LinearSRGBColorSpace); res.sunIntensity = mx * K;
      // sky radiance (zenith / horizon) for the ambient light
      const z = scatter([0, 1, 0], sd, SUN_E * fade, ms, msT), hz = [0, 0, 0], ND = 6;
      for (let i = 0; i < ND; i++) { const a = i / ND * Math.PI * 2, h = scatter([Math.cos(a) * 0.996, 0.09, Math.sin(a) * 0.996], sd, SUN_E * fade, ms, msT); for (let k = 0; k < 3; k++) hz[k] += h[k] / ND; }
      const night = [0.0022, 0.0034, 0.0078].map(v => v * (0.3 + 0.7 * (1 - fade)));
      res.zenith.setRGB(z[0] + night[0], z[1] + night[1], z[2] + night[2], T.LinearSRGBColorSpace).multiplyScalar(K);
      res.horizon.setRGB(hz[0] + night[0], hz[1] + night[1], hz[2] + night[2], T.LinearSRGBColorSpace).multiplyScalar(K);
      res.ambSky.copy(res.zenith).multiplyScalar(0.55).add(res.horizon.clone().multiplyScalar(0.45));
      const a = Math.max(sunDir.y, 0), alb = [0.3, 0.3, 0.24];
      res.ambGround.setRGB(alb[0] * (res.sunColor.r * res.sunIntensity * a / Math.PI + 0.7 * res.zenith.r + 0.3 * res.horizon.r), alb[1] * (res.sunColor.g * res.sunIntensity * a / Math.PI + 0.7 * res.zenith.g + 0.3 * res.horizon.g), alb[2] * (res.sunColor.b * res.sunIntensity * a / Math.PI + 0.7 * res.zenith.b + 0.3 * res.horizon.b), T.LinearSRGBColorSpace);
      // GPU: LUT, dome, environment
      const U = lutMat.uniforms;
      U.uSunDir.value.copy(sunDir); U.uSunE.value.setScalar(SUN_E * fade); U.uMultiScatter.value = ms; U.uMsTint.value.set(...msT);
      U.uNightCol.value.set(...night);
      const x = res.sunColor, m = Math.max(sunDir.y, 0), sI = res.sunIntensity / K;
      U.uGroundRad.value.set(0.085 * (x.r * sI * m / Math.PI + 0.12 * fade), 0.105 * (x.g * sI * m / Math.PI + 0.16 * fade), 0.055 * (x.b * sI * m / Math.PI + 0.22 * fade));
      const prevRT = renderer.getRenderTarget(), prevTM = renderer.toneMapping; renderer.setRenderTarget(lutRT); renderer.render(qScene, qCam); renderer.setRenderTarget(prevRT);
      domeMat.uniforms.uSunDir.value.copy(sunDir); domeMat.uniforms.uSunDisc.value.set(sunRad[0], sunRad[1], sunRad[2]).multiplyScalar(260 / SUN_E * ss(-0.03, 0.02, sunDir.y));
      domeMat.uniforms.uGround.value.set(U.uGroundRad.value.x, U.uGroundRad.value.y, U.uGroundRad.value.z);
      if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene, 0, 1, 1000);
      renderer.toneMapping = prevTM;
      return res;
    }
  };
}
