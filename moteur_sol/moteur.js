// Moteur de sol urbain — module isolé, réutilisable par tous les jeux du projet.
// Calé sur les cotes réelles de la voirie parisienne (sources : moteur_sol/LISEZMOI.md) :
//  - trottoir en asphalte coulé, reprises rectangulaires, quadrillage des portes cochères ;
//  - bordure en granit, blocs de ~0,95 m, granit moucheté ;
//  - caniveau : 2 rangs de pavés échantillon 14 × 20 cm, 3 rangs de pavés mosaïque ~10 cm, ou bande d'asphalte de 40 cm ;
//  - bouche d'égout parisienne : fente dans la bordure + tampon de fonte sur le trottoir ;
//  - regards ronds en fonte Ø 64 cm, plaques de réseaux, grilles d'arbres rondes Ø 2 m (trou Ø 60 cm) ;
//  - bandes d'éveil de vigilance (dalles podotactiles de 40 cm) aux passages piétons ;
//  - herbes sauvages au pied des murs et dans les caniveaux, selon le niveau d'abandon.
// Tout est généré par le code ; les positions sont des règles appliquées à la voirie réelle, pas des relevés.
//
//   import { createMoteurSol } from './moteur_sol/moteur.js';
//   const MS = createMoteurSol(THREE);
//   scene.add(...MS.construire(arrayBuffer));   // sol_details.wasm d'un secteur
//   MS.majCamera(camera.position);              // chaque image
//   MS.abandon = 0.25;                          // 0 = rue entretenue … 1 = quartier à l'abandon
//   MS.glsl(id), MS.glslCommun                  // GLSL à ajouter aux matières de voirie (0 chaussée … 4 pavés)

export function createMoteurSol(T) {
  const etat = { abandon: 0.25, dist: 160 };
  const herbes = [];

  // ---------------------------------------------------------------- atlas des herbes sauvages (2 × 2 cases de 512 px, alpha)
  // flore spontanée des trottoirs parisiens : 0 pâturin annuel (touffe, vue de côté), 1 pissenlit (rosette vue de dessus),
  // 2 plantain (rosette vue de dessus), 3 touffe sèche mêlée de sagine (coussinets de mousse)
  const atlas = (() => {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S * 2; const g = c.getContext('2d');
    let sd = 11; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
    // brin effilé : base large, pointe fine, dégradé sombre en bas → clair en haut
    function brin(ox, oy, x, h, w, lean, hue, sat, l0, l1) {
      const x2 = ox + x + lean, y2 = oy + S - h, xm = ox + x + lean * 0.35, ym = oy + S - h * 0.55;
      const gr = g.createLinearGradient(0, oy + S, 0, y2); gr.addColorStop(0, hsl(hue, sat, l0)); gr.addColorStop(1, hsl(hue + 6, sat - 5, l1));
      g.fillStyle = gr; g.beginPath(); g.moveTo(ox + x - w, oy + S); g.quadraticCurveTo(xm - w * 0.6, ym, x2, y2); g.quadraticCurveTo(xm + w * 0.6, ym, ox + x + w, oy + S); g.closePath(); g.fill();
    }
    // 0 : pâturin annuel — touffe dense, brins fins et souples, quelques panicules claires
    for (let i = 0; i < 160; i++) { const x = S * 0.5 + (r() - 0.5) * S * 0.35, h = S * (0.25 + r() * 0.55); brin(0, 0, x, h, 2 + r() * 3.5, (x - S * 0.5) * (0.8 + r()) + (r() - 0.5) * 60, 78 + r() * 18, 45 + r() * 15, 18 + r() * 8, 36 + r() * 14); }
    for (let i = 0; i < 9; i++) { const x = S * 0.5 + (r() - 0.5) * S * 0.4, h = S * (0.6 + r() * 0.3), lean = (r() - 0.5) * 90; brin(0, 0, x, h, 1.6, lean, 70, 25, 40, 55);
      for (let k = 0; k < 14; k++) { g.fillStyle = hsl(60, 20, 62 + r() * 15); g.beginPath(); g.ellipse(x + lean + (r() - 0.5) * 22, S - h + k * 4 + r() * 8, 3, 6, r(), 0, 7); g.fill(); } }
    // rosette vue de dessus : feuilles rayonnantes depuis le centre
    function rosette(ox, oy, n, Lmin, Lmax, Wf, dent, hue) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.5, L = S * (Lmin + r() * (Lmax - Lmin)), W = L * Wf * (0.8 + r() * 0.4);
        g.save(); g.translate(ox + S / 2, oy + S / 2); g.rotate(a);
        const gr = g.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, hsl(hue - 4, 40, 18)); gr.addColorStop(0.35, hsl(hue, 45, 30 + r() * 6)); gr.addColorStop(1, hsl(hue + 6, 42, 36 + r() * 8));
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0);
        const steps = dent ? 7 : 1;
        for (let k = 1; k <= steps; k++) { const t = k / steps, w = W * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (dent && k % 2 ? 1.35 : 1); g.lineTo(L * t - (dent ? L * 0.04 : 0), -w); }
        g.lineTo(L, 0);
        for (let k = steps; k >= 1; k--) { const t = k / steps, w = W * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (dent && k % 2 ? 1.35 : 1); g.lineTo(L * t - (dent ? L * 0.04 : 0), w); }
        g.closePath(); g.fill();
        g.strokeStyle = hsl(hue + 10, 35, 52, 0.55); g.lineWidth = dent ? 2 : 1.4; g.beginPath(); g.moveTo(4, 0); g.lineTo(L * 0.92, 0); g.stroke();   // nervure centrale
        if (!dent) { g.strokeStyle = hsl(hue + 8, 30, 46, 0.35); g.lineWidth = 1; for (const f of [-0.45, 0.45]) { g.beginPath(); g.moveTo(6, 0); g.quadraticCurveTo(L * 0.5, f * W * 1.1, L * 0.9, f * W * 0.2); g.stroke(); } }
        g.restore();
      }
    }
    // 1 : pissenlit — feuilles dentées, deux capitules jaunes et un bouton
    rosette(S, 0, 13, 0.24, 0.44, 0.12, true, 92);
    for (const [dx, dy, rad, col] of [[30, -40, 15, 48], [-50, 20, 13, 46], [10, 55, 7, 90]]) { g.fillStyle = col > 80 ? hsl(95, 40, 30) : hsl(col, 92, 52); g.beginPath(); g.arc(S + S / 2 + dx, S / 2 + dy, rad, 0, 7); g.fill();
      if (col < 80) { g.fillStyle = hsl(44, 95, 62); for (let k = 0; k < 18; k++) { const a = k / 18 * 6.28; g.beginPath(); g.ellipse(S + S / 2 + dx + Math.cos(a) * rad * 0.6, S / 2 + dy + Math.sin(a) * rad * 0.6, rad * 0.45, 2.2, a, 0, 7); g.fill(); } } }
    // 2 : plantain lancéolé et grand plantain — feuilles larges à nervures parallèles
    rosette(0, S, 9, 0.2, 0.36, 0.3, false, 88);
    // 3 : touffe sèche + sagine (petits coussinets vert sombre au pied)
    for (let i = 0; i < 110; i++) { const x = S * 0.5 + (r() - 0.5) * S * 0.45, h = S * (0.15 + r() * 0.5); brin(S, S, x, h, 1.5 + r() * 3, (x - S * 0.5) * (0.6 + r()) + (r() - 0.5) * 80, 45 + r() * 15, 30 + r() * 15, 28 + r() * 8, 52 + r() * 12); }
    for (let i = 0; i < 26; i++) { g.fillStyle = hsl(95 + r() * 15, 45, 16 + r() * 10); g.beginPath(); g.ellipse(S + S * 0.5 + (r() - 0.5) * S * 0.6, S * 2 - 8 - r() * 16, 10 + r() * 18, 7 + r() * 8, 0, 0, 7); g.fill(); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t;
  })();

  // ---------------------------------------------------------------- matériaux
  const uAbandon = { value: etat.abandon };
  const NOISE = `float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}`;
  // motifs de fonte (vLoc = position locale en m) : relief 0 = creux encrassé, 1 = dessus poli
  const FONTE = {
    // regard d'égout Ø 64 cm : cadre, couronne lisse, plot central, quadrillage de pastilles carrées
    regard: `float r=length(vLoc.xz)/0.32; vec2 q=fract(vLoc.xz/0.045)-.5; float plot=step(max(abs(q.x),abs(q.y)),.28);
      relief = r>.93 ? .85 : (r>.86 ? .2 : (r>.78 ? .9 : (r<.12 ? .9 : plot)));`,
    // tampon de bouche d'égout sur le trottoir (≈ 0,50 × 1,00 m) : cadre, losanges en relief
    tampon: `vec2 q=vLoc.xz-vec2(0.66,0.); float cadre=max(step(.225,abs(q.x)),step(.47,abs(q.y)));
      vec2 d=fract(vec2(q.x+q.y,q.x-q.y)/0.05)-.5; float los=step(abs(d.x)+abs(d.y),.32);
      relief = cadre>0. ? .9 : los*.95;`,
    // plaque de réseau (eau, télécom) : cadre et stries
    plaque: `vec2 q=vLoc.xz; float cadre=max(step(.27,abs(q.x)),step(.19,abs(q.y)));
      float st=step(.5,fract(q.y/0.03)); relief = cadre>0. ? .9 : st*.8;`,
    // grille d'arbre ronde Ø 2 m, trou Ø 60 cm : anneaux concentriques et rayons ajourés
    grille: `float r=length(vLoc.xz); float a=atan(vLoc.z,vLoc.x);
      float ray=step(.38,fract(a*32./6.2832)); float ann=step(.4,fract((r-.3)/0.07));
      float plein = step(r,.36) + step(.95,r) + step(.62,r)*step(r,.66);
      relief = clamp(plein + ray*ann, 0., 1.);
      if (relief < .5) discard;`,
  };
  const withLoc = sh => sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying vec3 vWS;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWS = (modelMatrix * instanceMatrix * vec4(transformed,1.)).xyz;');
  function fonte(kind, color) {
    const m = new T.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.5 });
    m.onBeforeCompile = sh => {
      sh.vertexShader = withLoc(sh);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vLoc; varying vec3 vWS; float relief = 0.;\n${NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
        { ${FONTE[kind]}
          float sale = vn(vWS.xz*3.)*.6 + vn(vWS.xz*17.)*.4;
          diffuseColor.rgb *= mix(.42, 1.05, relief);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.24,.16,.10), smoothstep(.7,.95,sale)*.25*(1.-relief));
        }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(.9, .42, relief);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(.15, .6, relief);');
    };
    m.customProgramCacheKey = () => 'sol_fonte_' + kind; m.name = 'sol_' + kind;
    return m;
  }
  // quadrillage de porte cochère : asphalte de chaussée rainuré en losanges de ~7 cm, plus sombre
  const quadMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, name: 'sol_porte_cochere' });
  quadMat.onBeforeCompile = sh => {
    sh.vertexShader = withLoc(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vLoc; varying vec3 vWS;\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 q=vLoc.xz; vec2 g=fract(vec2(q.x+q.y,q.x-q.y)/0.10)-.5; float rainure=smoothstep(.36,.46,max(abs(g.x),abs(g.y)));
        float bord = smoothstep(0.,.05,-q.x)*smoothstep(0.,.05,2.2+q.x)*smoothstep(0.,.05,1.5-abs(q.y));
        diffuseColor.rgb = vec3(.21,.21,.22)*(.85+.3*vn(vWS.xz*4.))*mix(1.,.5,rainure);
        diffuseColor.a = bord*.95; }`);
  };
  quadMat.customProgramCacheKey = () => 'sol_porte_cochere';
  // dalle podotactile : béton clair, plots en quinconce
  const podoMat = new T.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.8, name: 'sol_podotactile' });
  podoMat.onBeforeCompile = sh => {
    sh.vertexShader = withLoc(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying vec3 vWS;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 q=vLoc.xz/0.05; q.x+=step(1.,mod(floor(q.y),2.))*.5; float d=length(fract(q)-.5);
        diffuseColor.rgb *= mix(.80, 1.06, smoothstep(.32,.22,d)); }`);
  };
  podoMat.customProgramCacheKey = () => 'sol_podo';
  const MAT = {
    regard: fonte('regard', 0x46433f), tampon: fonte('tampon', 0x4a4743), plaque: fonte('plaque', 0x55524d), grille: fonte('grille', 0x34322f),
    terre: new T.MeshStandardMaterial({ color: 0x3e3024, roughness: 1, name: 'sol_terre' }),
    fente: new T.MeshBasicMaterial({ color: 0x030303, name: 'sol_fente', side: T.DoubleSide }),
  };
  MAT.grille.side = T.DoubleSide;
  const uT = { value: 0 };
  // herbes : alpha testé avec dithering léger (bords moins durs), base assombrie (occlusion au pied), translucidité des pointes
  function matHerbe(rosette) {
    const m = new T.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: T.DoubleSide, roughness: 0.85, name: rosette ? 'sol_herbe_rosette' : 'sol_herbe' });
    m.onBeforeCompile = sh => {
      sh.uniforms.uT = uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aVar; uniform float uT; varying vec2 vLocUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvLocUv = uv; vMapUv = vMapUv*.5 + aVar*.5;')
        .replace('#include <begin_vertex>', rosette ? '#include <begin_vertex>'
          : `#include <begin_vertex>
          { vec4 w = instanceMatrix * vec4(0.,0.,0.,1.); float k = uv.y*uv.y; float ph = w.x*.7 + w.z*.5;
            transformed.x += (sin(uT*1.7 + ph)*.035 + sin(uT*4.3 + ph*2.)*.01)*k; transformed.z += cos(uT*1.3 + ph)*.02*k; }`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vLocUv;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(mat3(viewMatrix) * vec3(0., 1., 0.));   // même normale (vers le ciel) des deux côtés : pas de faces noires')
        .replace('#include <color_fragment>', rosette
          ? `#include <color_fragment>\n diffuseColor.rgb *= mix(.55, 1.05, smoothstep(.0, .35, length(vLocUv-.5)));`
          : `#include <color_fragment>\n diffuseColor.rgb *= mix(.45, 1.1, smoothstep(.0, .7, vLocUv.y));`)
        .replace('#include <emissivemap_fragment>', rosette ? '#include <emissivemap_fragment>'
          : '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * .12 * smoothstep(.4, 1., vLocUv.y);');
    };
    m.customProgramCacheKey = () => rosette ? 'sol_herbe_r3' : 'sol_herbe_t3';
    return m;
  }
  const herbeMat = matHerbe(false), rosetteMat = matHerbe(true);

  // ---------------------------------------------------------------- géométries (mètres ; x local vers la bordure / la façade, z le long)
  const box = (sx, sy, sz, dx = 0, dy = 0) => { const g = new T.BoxGeometry(sx, sy, sz); g.translate(dx, dy + sy / 2, 0); return g; };
  const G = {
    regard: (() => { const g = new T.CylinderGeometry(0.32, 0.32, 0.012, 40); g.translate(0, 0.006, 0); return g; })(),
    // fente de la bouche d'égout dans la face de la bordure (1,20 × 0,10 m), juste au-dessus du caniveau
    fente: (() => { const g = new T.PlaneGeometry(1.2, 0.10); g.rotateY(-Math.PI / 2); g.translate(0.13, 0.065, 0); return g; })(),
    // tampon de la bouche, sur le trottoir derrière la bordure : 0,50 × 1,00 m
    tampon: box(0.5, 0.01, 1.0, 0.66, 0.14),
    plaque: box(0.6, 0.008, 0.42),
    grille: (() => { const g = new T.RingGeometry(0.3, 1.0, 64, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0.012, 0); return g; })(),
    terre: (() => { const g = new T.CircleGeometry(1.0, 40); g.rotateX(-Math.PI / 2); g.translate(0, 0.004, 0); return g; })(),
    quad: (() => { const g = new T.PlaneGeometry(2.2, 3.0); g.rotateX(-Math.PI / 2); g.translate(-1.1, 0.004, 0); return g; })(),   // x local vers la façade : la zone part de la façade vers la rue
    podo: box(0.40, 0.006, 0.40),
    // touffe : 3 plans verticaux à 60°, normales vers le haut (éclairage doux, pas de faces noires)
    touffe: (() => {
      const P = [], N = [], U = [], I = [];
      for (let k = 0; k < 3; k++) { const a = new T.PlaneGeometry(0.5, 0.45); a.translate(0, 0.225, 0); a.rotateY(k * Math.PI / 3); const o = P.length / 3;
        P.push(...a.attributes.position.array); U.push(...a.attributes.uv.array); for (let i = 0; i < 4; i++) N.push(0, 1, 0); I.push(...a.index.array.map(i => i + o)); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(U, 2)); g.setIndex(I); return g;
    })(),
    // rosette : disque plat légèrement relevé au centre (feuilles posées au sol)
    rosette: (() => { const g = new T.PlaneGeometry(0.42, 0.42, 4, 4); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getZ(i)); p.setY(i, 0.012 + 0.02 * Math.max(0, 1 - d / 0.15)); }
      g.computeVertexNormals(); return g; })(),
  };

  // ---------------------------------------------------------------- lecture d'un secteur
  function construire(buf) {
    const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x444C4F53) return [];
    const nT = dv.getUint32(4, true), x0 = dv.getFloat32(8, true), z0 = dv.getFloat32(12, true), y0 = dv.getFloat32(16, true);
    let o = 20; const out = [], M = new T.Matrix4(), Q = new T.Quaternion(), Y = new T.Vector3(0, 1, 0), P = new T.Vector3(), S = new T.Vector3(), C = new T.Color();
    for (let t = 0; t < nT; t++) {
      const kind = dv.getUint32(o, true), n = dv.getUint32(o + 4, true); o += 8;
      const items = [];
      for (let i = 0; i < n; i++) { const b = o + i * 10; items.push({ x: x0 + dv.getUint16(b, true) / 65535 * 1000, z: z0 + dv.getUint16(b + 2, true) / 65535 * 1000, y: y0 + dv.getInt16(b + 4, true) / 100, a: dv.getUint8(b + 6) / 255 * Math.PI * 2, v: dv.getUint8(b + 7), t: dv.getUint8(b + 8), s: dv.getUint8(b + 9) / 100 }); }
      o += n * 10; if (!n) continue;
      const mat = (e, m, s = 1, dy = 0) => m.compose(P.set(e.x, e.y + dy, e.z), Q.setFromAxisAngle(Y, -e.a), S.set(s, s, s));
      const place = (geo, mt, list, f, tint) => {
        const im = new T.InstancedMesh(geo, mt, list.length);
        list.forEach((e, i) => { f(e, M); im.setMatrixAt(i, M); if (tint) im.setColorAt(i, tint(e, C)); });
        im.receiveShadow = true; im.computeBoundingSphere(); out.push(im); return im;
      };
      const usure = (e, c) => c.setScalar(0.88 + 0.24 * ((e.x * 0.37 + e.z * 0.11) % 1));
      if (kind === 0) { place(G.fente, MAT.fente, items, (e, m) => mat(e, m)); place(G.tampon, MAT.tampon, items, (e, m) => mat(e, m), usure); }
      else if (kind === 1) place(G.regard, MAT.regard, items, (e, m) => mat(e, m, 1, 0.002), usure);
      else if (kind === 2) place(G.plaque, MAT.plaque, items, (e, m) => mat(e, m, [1, 1.25, 0.8, 1.1][e.v & 3], 0.002), usure);
      else if (kind === 3) { place(G.terre, MAT.terre, items, (e, m) => mat(e, m)); place(G.grille, MAT.grille, items, (e, m) => mat(e, m), usure); }
      else if (kind === 6) place(G.quad, quadMat, items, (e, m) => { mat(e, m, 1, 0.002); return m; });
      else if (kind === 7) place(G.podo, podoMat, items, (e, m) => mat(e, m, 1, 0.001));
      else {   // herbes : triées par seuil ; chaque point donne une petite colonie (1 à 3 plantes), touffes et rosettes séparées
        const h = x => { const v = Math.sin(x * 12.9898) * 43758.5453; return v - Math.floor(v); };
        const lots = { t: [], r: [] };
        items.forEach((e, i) => {
          // espèce : pied de mur → surtout pâturin et pissenlit ; caniveau → pâturin, sagine, plantain
          const u = h(e.x * 3.1 + e.z), sp = kind === 4 ? (u < .45 ? 0 : u < .7 ? 1 : u < .85 ? 2 : 3) : (u < .5 ? 0 : u < .7 ? 3 : u < .85 ? 2 : 1);
          const n = 1 + Math.floor(h(e.z * 5.7 + i) * (kind === 4 ? 3 : 2));
          for (let k = 0; k < n; k++) {
            const a = h(e.x + k * 1.7) * 6.283, d = k ? 0.06 + h(e.z + k) * 0.14 : 0;
            const sp2 = k && h(e.x * 9 + k) < .35 ? (sp === 0 ? 3 : 0) : sp;
            lots[sp2 === 1 || sp2 === 2 ? 'r' : 't'].push({ x: e.x + Math.cos(a) * d, z: e.z + Math.sin(a) * d, y: e.y, t: e.t, s: e.s * (k ? 0.55 + h(e.x + k * 3) * 0.4 : 1), sp: sp2, a: e.a + h(e.z * 7 + k) * 6.283 });
          }
        });
        for (const [cle, liste] of Object.entries(lots)) {
          if (!liste.length) continue;
          liste.sort((p, q) => p.t - q.t);
          const ros = cle === 'r', im = new T.InstancedMesh((ros ? G.rosette : G.touffe).clone(), ros ? rosetteMat : herbeMat, liste.length), aVar = new Float32Array(liste.length * 2);
          let cx = 0, cz = 0;
          liste.forEach((e, i) => {
            const s = (kind === 4 ? 1 : 0.45) * e.s * (0.8 + 0.4 * h(e.x * 7.3)), sy = ros ? s : s * (0.75 + 0.6 * h(e.z * 3.1));
            M.compose(P.set(e.x, e.y + 0.004, e.z), Q.setFromAxisAngle(Y, e.a), S.set(s, sy, s)); im.setMatrixAt(i, M);
            aVar[2 * i] = e.sp & 1; aVar[2 * i + 1] = 1 - (e.sp >> 1);   // la case 0 du canevas est en haut à gauche (UV retournées)
            // teinte : vert plus ou moins jaune, plus terne si le quartier est négligé
            im.setColorAt(i, C.setHSL(0.21 + (h(e.x * 1.7) - 0.5) * 0.05, 0.25 + 0.2 * h(e.z * 2.9), 0.62 + 0.3 * h(e.z * 2.3)));
            cx += e.x; cz += e.z;
          });
          im.geometry.setAttribute('aVar', new T.InstancedBufferAttribute(aVar, 2));
          im.receiveShadow = true; im.computeBoundingSphere();
          im.name = (kind === 4 ? 'sol_herbe_mur' : 'sol_herbe_caniveau') + (ros ? '_rosettes' : '');
          herbes.push({ mesh: im, seuils: Uint8Array.from(liste.map(e => e.t)), x: cx / liste.length, z: cz / liste.length });
          majCompte(herbes[herbes.length - 1]); out.push(im);
        }
      }
    }
    for (const m of out) if (!m.name) m.name = 'sol_details';
    return out;
  }
  function majCompte(h) { const lim = etat.abandon * 255; let lo = 0, hi = h.seuils.length; while (lo < hi) { const m = (lo + hi) >> 1; if (h.seuils[m] < lim) lo = m + 1; else hi = m; } h.mesh.count = lo; }
  const t0 = performance.now();
  function majCamera(p) {
    for (let i = herbes.length - 1; i >= 0; i--) if (!herbes[i].mesh.parent) herbes.splice(i, 1);
    for (const h of herbes) { const bs = h.mesh.boundingSphere, r = bs ? bs.radius : 700; if (bs) { h.c = h.c || new T.Vector3(); h.c.copy(bs.center); h.mesh.localToWorld(h.c); } const cx = bs ? h.c.x : h.x, cz = bs ? h.c.z : h.z;
      h.mesh.visible = p.y < 120 + (bs ? h.c.y : 0) && Math.hypot(p.x - cx, p.z - cz) < r + etat.dist; }
    uT.value = (performance.now() - t0) / 1000;
  }

  // ---------------------------------------------------------------- matières du sol (GLSL ajouté aux matériaux de voirie)
  // disponibles : vWP (position monde), vAux (coordonnées de la matière), h21, vn, fbm, diffuseColor, uAbandon
  const COMMUN = `
    // pavés en rangs décalés : s le long, d en travers, W largeur d'un rang, L longueur d'un pavé
    vec2 pvCell(float s, float d, float W, float L, float seed, out float joint){
      float row=floor(d/W); float off=h21(vec2(row,seed))*L; float sl=(s+off)/L; float col=floor(sl);
      float fs=fract(sl)*L, fd=fract(d/W)*W; float jw=.012;
      joint = 1.-smoothstep(jw*.5,jw*1.6,min(min(fs,L-fs),min(fd,W-fd)));
      return vec2(row,col);
    }
    vec3 granit(vec2 id, vec2 p){ float k=h21(id+.7); vec3 c=mix(vec3(.30,.30,.32),vec3(.38,.36,.33),k);
      c*=.82+.3*h21(id*1.3); c*=.9+.2*vn(p*40.); c+=step(.88,h21(floor(p*180.)))*.06; return c; }`;
  const GLSL = {
    // chaussée : enrobé par zones, tranchées refaites, traces de roulement ; caniveau parisien selon le tronçon
    0: `{ float d=vAux.x; vec2 zc=floor(vWP.xz/45.); float var=h21(zc+3.);
         diffuseColor.rgb*=mix(1.,.86,step(var,.3))*mix(1.,1.08,step(.7,var));
         float tr=step(.985,h21(floor((vWP.xz+vec2(vn(vWP.xz*.05)*6.,0.))/vec2(1.,40.))+7.))*smoothstep(1.,1.6,d); diffuseColor.rgb*=1.-tr*.12;
         diffuseColor.rgb*=1.-smoothstep(.55,.8,vn(vec2(vWP.x*.6,vWP.z*.03)+11.))*smoothstep(1.2,2.5,d)*.06;
         // coordonnée le long de la bordure : perpendiculaire au gradient de d, calculé dans le plan du sol
         vec2 dx=dFdx(vWP.xz), dy=dFdy(vWP.xz); float ddx=dFdx(d), ddy=dFdy(d); float det=dx.x*dy.y-dx.y*dy.x;
         vec2 gd = abs(det)>1e-10 ? vec2(ddx*dy.y-ddy*dx.y, ddy*dx.x-ddx*dy.x)/det : vec2(1.,0.);
         vec2 al = normalize(vec2(-gd.y, gd.x)+1e-6); float s = dot(vWP.xz, al);
         float typ = h21(floor(vWP.xz/90.)+29.);                       // type de caniveau par tronçon
         float W = typ<.5 ? .15 : .10, L = typ<.5 ? .20 : .10, larg = typ<.8 ? .30 : .40;
         float inG = 1.-smoothstep(larg-.01, larg+.01, d);
         if (inG>0.) {
           vec3 g;
           if (typ<.8) { float j; vec2 id=pvCell(s, d, W, L, 5., j);
             g = granit(id, vWP.xz) * (1.-j*.62);
             g = mix(g, vec3(.17,.22,.09), j*uAbandon*smoothstep(.45,.75,vn(vWP.xz*1.1))); }
           else g = vec3(.115,.115,.12)*(.9+.2*vn(vWP.xz*6.));       // bande d'asphalte coulé AC1 de 40 cm
           g *= mix(.8, 1., smoothstep(0.,.12,d));
           diffuseColor.rgb = mix(diffuseColor.rgb, g, inG);
         } }`,
    // trottoir : asphalte coulé gris, reprises rectangulaires, taches
    1: `{ vec3 base = vec3(.33,.32,.31)*(.9+.2*vn(vWP.xz*.35))*(.92+.16*vn(vWP.xz*9.));
         diffuseColor.rgb = mix(diffuseColor.rgb, base*.85, .75);   // asphalte coulé parisien : gris moyen-foncé
         vec2 c1=floor(vWP.xz/vec2(1.6,3.2)), c2=floor((vWP.xz+vec2(.7,1.3))/vec2(2.7,1.2));
         float rep = max(step(.94,h21(c1+41.)), step(.965,h21(c2+77.)));
         diffuseColor.rgb *= mix(1., .78+.25*h21(c1+3.), rep);
         float tache=smoothstep(.72,.9,fbm(vWP.xz*.8+4.)); diffuseColor.rgb*=1.-tache*.12*(.5+uAbandon); }`,
    // bordure granit : blocs de ~0,95 m (face verticale : vAux.x = distance le long), granit moucheté, joints
    2: `{ bool face = vAux.x>0.001 || vAux.y>0.001; float al = vAux.x; float fj = fract(al/0.95)*0.95;
         float joint = face ? 1.-smoothstep(.004,.012,min(fj,.95-fj)) : 0.;
         vec2 id = face ? vec2(floor(al/0.95),1.) : floor(vWP.xz/.95);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62,.61,.59), .5);
         diffuseColor.rgb *= .86+.22*h21(id+2.);
         diffuseColor.rgb *= .88+.24*h21(floor(vWP.xz*160.)+floor(vWP.y*160.));
         diffuseColor.rgb *= 1.-joint*.5;
         if (face) diffuseColor.rgb *= mix(.72,1., smoothstep(0.,.05,vAux.y)); }`,
    3: ``,
    // aires pavées : pavés de granit 14 × 20 cm en rangs décalés
    4: `{ float j; vec2 id = pvCell(vWP.x, vWP.z, .14, .20, 3., j);
         diffuseColor.rgb = granit(id, vWP.xz)*(1.-j*.6);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.17,.22,.09), j*uAbandon*smoothstep(.5,.8,vn(vWP.xz*.9))); }`,
  };

  return {
    construire, majCamera, atlas,
    glsl: id => GLSL[id] || '', glslCommun: COMMUN,
    uniformes: { uAbandon },
    get abandon() { return etat.abandon; },
    set abandon(v) { etat.abandon = Math.max(0, Math.min(1, v)); uAbandon.value = etat.abandon; for (const h of herbes) majCompte(h); },
    set distance(v) { etat.dist = v; },
  };
}
