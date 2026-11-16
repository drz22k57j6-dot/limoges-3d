// Voirie réelle de Paris (Plan de voirie, Ville de Paris) : chaussées, trottoirs, bordures, passages piétons, pavés.
// Fichier par secteur : data/<ville>/secteurs/<i_j>/voirie.wasm (outils/voirie.py).
// Rendu : textures photo (Poly Haven, CC0) en 1k, sans répétition visible (échantillonnage décalé par zones,
// technique « texture no tile » d'Inigo Quilez), variations de couleur à grande échelle, usure et détails
// (caniveau pavé, salissures le long des bordures, taches d'huile, rustines, chewing-gums, peinture usée).
export function createVoirie(T, { base, v = '', sol = null }) {   // sol : moteur de sol (moteur_sol/moteur.js), facultatif
  const TL = new T.TextureLoader();
  const tex = (n, srgb) => { const t = TL.load(base + n + '.webp' + v); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = T.SRGBColorSpace; return t; };
  const set = n => ({ map: tex(n + '_c', true), normalMap: tex(n + '_n'), roughnessMap: tex(n + '_r') });
  const tGut = tex('pave_c', true);

  const NOISE = `varying vec3 vWP; varying vec2 vAux;
  float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){return .5*vn(p)+.25*vn(p*2.03)+.125*vn(p*4.01)+.0625*vn(p*8.);}
  vec4 ntex(sampler2D t,vec2 x){float k=vn(x*1.1);vec2 dx=dFdx(x),dy=dFdy(x);float l=k*8.,f=fract(l),ia=floor(l),ib=ia+1.;
    vec2 oa=sin(vec2(3.,7.)*ia),ob=sin(vec2(3.,7.)*ib);vec4 a=textureGrad(t,x+oa,dx,dy),b=textureGrad(t,x+ob,dx,dy);
    return mix(a,b,smoothstep(.2,.8,f-.1*dot(a.rgb-b.rgb,vec3(1))));}`;

  // détails propres à chaque matière, appliqués à la couleur (diffuseColor) et à la rugosité
  const DETAIL = {
    0: `{ float d=vAux.x;                                        // chaussée : distance à la bordure
         float gut=1.-smoothstep(.30,.40,d);                      // caniveau pavé de 35 cm
         vec3 g=texture2D(tGut,vWP.xz/1.1).rgb; diffuseColor.rgb=mix(diffuseColor.rgb,g*vec3(.78,.77,.75),gut);
         diffuseColor.rgb*=mix(.80,1.,smoothstep(.4,1.6,d));     // salissures le long du trottoir
         float oil=smoothstep(.70,.80,fbm(vWP.xz*.45+3.))*smoothstep(1.,2.5,d); diffuseColor.rgb*=1.-oil*.30;
         vec2 pc=floor(vWP.xz/vec2(2.4,3.6)); float rp=step(.965,h21(pc+11.))*smoothstep(1.,2.,d); diffuseColor.rgb*=1.-rp*.16;
         float cr=smoothstep(.92,.97,1.-abs(vn(vWP.xz*1.7)-.5)*2.)*.10; diffuseColor.rgb*=1.-cr; }`,
    1: `{ float gum=step(.9965,h21(floor(vWP.xz*7.)))*.35+step(.9985,h21(floor(vWP.xz*3.)+5.))*.25; diffuseColor.rgb*=1.-gum;
         float wet=smoothstep(.75,.85,fbm(vWP.xz*.25+9.)); diffuseColor.rgb*=1.-wet*.10; }`,
    2: `{ diffuseColor.rgb*=mix(.86,1.,fbm(vWP.xz*1.3));
         diffuseColor.rgb*=1.-smoothstep(.75,.95,fbm(vWP.xz*3.))*.18; }`,
    3: `{ float u=vAux.x, w=vAux.y;                              // passage piéton : bandes blanches de 50 cm
         float band=step(.5,fract(u+.25));
         float wear=smoothstep(.38,.72,fbm(vWP.xz*2.2+4.))*.85+smoothstep(.5,.95,fbm(vec2(u*1.3,w*.6)*1.7))*.6;
         float paint=band*clamp(1.-wear,0.,1.)*(.85+.15*vn(vWP.xz*9.));
         diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.82,.82,.79),paint); vPaint=paint; }`,
    4: `{ diffuseColor.rgb*=mix(.85,1.05,fbm(vWP.xz*.6)); }`,
  };
  const SCALE = { 0: 3.0, 1: 2.5, 2: 1.2, 3: 3.0, 4: 1.2 };   // taille réelle d'une répétition de texture (m)
  const MATS = {};
  function material(id) {
    if (MATS[id]) return MATS[id];
    const tset = set({ 0: 'chaussee', 1: 'trottoir', 2: 'bordure', 3: 'chaussee', 4: 'pave' }[id]);
    const m = new T.MeshStandardMaterial({ ...tset, color: id === 1 ? 0xb9b7b3 : (id === 2 ? 0xcac8c3 : 0xffffff), roughness: 1, metalness: 0, side: id === 2 ? T.DoubleSide : T.FrontSide });
    if (id === 3) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; }
    m.onBeforeCompile = sh => {
      sh.uniforms.tGut = { value: tGut }; sh.uniforms.uAbandon = sol ? sol.uniformes.uAbandon : { value: 0 };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aux; varying vec3 vWP; varying vec2 vAux;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz; vAux=aux;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tGut; uniform float uAbandon; float vPaint=0.;\n' + NOISE + (sol ? sol.glslCommun : ''))
        .replace('#include <map_fragment>', T.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'ntex( map, vMapUv )'))
        .replace('#include <normal_fragment_maps>', T.ShaderChunk.normal_fragment_maps.replaceAll('texture2D( normalMap, vNormalMapUv )', 'ntex( normalMap, vNormalMapUv )'))
        .replace('#include <color_fragment>', `#include <color_fragment>
          { float m1=fbm(vWP.xz*.03), m2=fbm(vWP.xz*.12+7.); diffuseColor.rgb*=mix(.80,1.10,m1)*mix(.94,1.04,m2); }
          ${DETAIL[id]}
          ${sol ? sol.glsl(id) : ''}`)
        .replace('#include <roughnessmap_fragment>', T.ShaderChunk.roughnessmap_fragment.replace('texture2D( roughnessMap, vRoughnessMapUv )', 'ntex( roughnessMap, vRoughnessMapUv )')
          + '\nroughnessFactor*=mix(.85,1.1,fbm(vWP.xz*.08+3.)); roughnessFactor=mix(roughnessFactor,.55,vPaint);');
    };
    m.customProgramCacheKey = () => 'voirie' + id + (sol ? 's' : '');
    m.name = 'voirie_' + id;
    return (MATS[id] = m);
  }

  function build(buf) {
    const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x31494F56) return [];
    const n = dv.getUint32(4, true); let o = 8; const out = [];
    for (let gi = 0; gi < n; gi++) {
      const id = dv.getUint8(o), big = dv.getUint8(o + 1), hasA = dv.getUint8(o + 2), nV = dv.getUint32(o + 4, true), nI = dv.getUint32(o + 8, true);
      const ox = dv.getFloat32(o + 12, true), oy = dv.getFloat32(o + 16, true), oz = dv.getFloat32(o + 20, true); o += 24;
      const q = new Uint16Array(buf.slice(o, o + nV * 6)); o += nV * 6;
      const a = hasA ? new Int16Array(buf.slice(o, o + nV * 4)) : null; if (hasA) o += nV * 4;
      const idx = big ? new Uint32Array(buf.slice(o, o + nI * 4)) : new Uint16Array(buf.slice(o, o + nI * 2)); o += nI * (big ? 4 : 2); while (o % 4) o++;
      const pos = new Float32Array(nV * 3), aux = new Float32Array(nV * 2), uv = new Float32Array(nV * 2), S = SCALE[id];
      for (let i = 0; i < nV; i++) {
        const x = ox + q[3 * i] * 0.02, y = oy + q[3 * i + 1] * 0.005, z = oz + q[3 * i + 2] * 0.02;
        pos[3 * i] = x; pos[3 * i + 1] = y; pos[3 * i + 2] = z;
        if (a) { aux[2 * i] = a[2 * i] / 100; aux[2 * i + 1] = a[2 * i + 1] / 100; }
        uv[2 * i] = x / S; uv[2 * i + 1] = -z / S;
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aux', new T.BufferAttribute(aux, 2)); g.setAttribute('uv', new T.BufferAttribute(uv, 2));
      g.setIndex(new T.BufferAttribute(idx, 1)); g.computeVertexNormals();
      const nr = g.attributes.normal;
      for (let i = 0; i < nV; i++) {
        if (Math.abs(nr.getY(i)) > 0.5) { if (nr.getY(i) < 0) nr.setXYZ(i, -nr.getX(i), -nr.getY(i), -nr.getZ(i)); }
        else if (a) { uv[2 * i] = aux[2 * i] / S; uv[2 * i + 1] = pos[3 * i + 1] / S; }   // face verticale de bordure
      }
      g.computeBoundingSphere();
      const mesh = new T.Mesh(g, material(id)); mesh.receiveShadow = true; mesh.name = 'voirie_' + id; out.push(mesh);
    }
    return out;
  }
  return { build, material, materials: MATS };
}
