// Ciel (code original du projet) : dôme en dégradé zénith → horizon, halo et disque du soleil.
// Les couleurs viennent de la table des heures du jeu (index.html, TIMES) ; l'horizon est la couleur
// du brouillard, pour que le lointain se fonde dans le ciel. Sert aussi de carte d'environnement.
//
// API : createSky(THREE, renderer) -> { dome, envMap(), set({ zenith, horizon, sunDir, sunColor, glow }) }

export function createSky(T, renderer) {
  const mat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: new T.Color() }, uHorizon: { value: new T.Color() }, uGround: { value: new T.Color() },
      uSunDir: { value: new T.Vector3(0, 1, 0) }, uSun: { value: new T.Color() }, uGlow: { value: 0.3 },
    },
    vertexShader: `varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uZenith, uHorizon, uGround, uSun, uSunDir; uniform float uGlow; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(up, 0.45));                 // dégradé
  c = mix(c, uGround, smoothstep(0.0, -0.08, d.y));                // sous l'horizon
  float mu = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSun * (uGlow * pow(mu, 8.0) + 0.6 * pow(mu, 64.0));        // halo autour du soleil
  c += uSun * 40.0 * smoothstep(0.9996, 0.99985, mu);              // disque
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  mat.name = 'ciel';
  const dome = new T.Mesh(new T.SphereGeometry(4000, 48, 24), mat);
  dome.name = 'ciel'; dome.frustumCulled = false; dome.renderOrder = -1;

  // environnement (reflets) : le même dôme, rendu dans un PMREM
  const pmrem = new T.PMREMGenerator(renderer);
  const envScene = new T.Scene(); const envDome = new T.Mesh(new T.SphereGeometry(100, 32, 16), mat); envScene.add(envDome);
  let envRT = null;

  return {
    dome,
    envMap: () => envRT && envRT.texture,
    set({ zenith, horizon, sunDir, sunColor, glow = 0.3 }) {
      const U = mat.uniforms;
      U.uZenith.value.copy(zenith); U.uHorizon.value.copy(horizon); U.uGround.value.copy(horizon).multiplyScalar(0.6);
      U.uSunDir.value.copy(sunDir); U.uSun.value.copy(sunColor).multiplyScalar(sunDir.y > -0.05 ? 1 : 0); U.uGlow.value = glow;
      const tm = renderer.toneMapping; renderer.toneMapping = T.NoToneMapping;
      if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene, 0, 0.1, 1000);
      renderer.toneMapping = tm;
    },
  };
}
