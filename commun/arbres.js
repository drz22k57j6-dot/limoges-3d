// Arbres procéduraux (code original du projet).
// 4 espèces types : feuillu, conifère, bouleau, jeune arbre. Chaque modèle a 3 niveaux de détail
// (proche, moyen, lointain). Le feuillage est blanc : la teinte vient de la couleur de chaque instance
// (mesurée sur l'orthophoto). Un léger vent fait osciller la cime.
//
// API : createTrees(THREE, env) -> { models: { tree, pine, birch, sapling }, WIND, leafMat, barkMat }
//   models[k] = { height, crown, lods: [{ to, parts: [{ geometry, material, cast, tint }] }, …] }

export function createTrees(T, env = {}) {
  const WIND = { time: { value: 0 } };

  // pseudo-aléatoire déterministe
  const rng = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // ---------- matériaux ----------
  const windChunk = `
    #include <begin_vertex>
    {
      vec4 wp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
      #endif
      wp = modelMatrix * wp;
      float k = clamp(transformed.y / 8.0, 0.0, 1.0); k *= k;
      float ph = wp.x * 0.13 + wp.z * 0.11;
      transformed.x += sin(uWindT * 1.3 + ph) * 0.12 * k;
      transformed.z += cos(uWindT * 1.1 + ph * 1.3) * 0.09 * k;
    }`;
  function withWind(m, key) {
    m.onBeforeCompile = sh => {
      sh.uniforms.uWindT = WIND.time;
      sh.vertexShader = 'uniform float uWindT;\n' + sh.vertexShader.replace('#include <begin_vertex>', windChunk);
    };
    m.customProgramCacheKey = () => key;
    return m;
  }
  const leafMat = withWind(new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, flatShading: true }), 'arbres_feuilles');
  leafMat.name = 'arbre_feuillage';
  const barkMat = new T.MeshStandardMaterial({ color: 0xffffff, map: env.barkMap || null, roughness: 0.95, metalness: 0 });
  barkMat.name = 'arbre_tronc';

  // ---------- géométrie ----------
  const merge = geos => {
    const out = [];
    for (const g of geos) out.push(g.index ? g.toNonIndexed() : g);
    let n = 0; for (const g of out) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of out) {
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    }
    const r = new T.BufferGeometry();
    r.setAttribute('position', new T.BufferAttribute(pos, 3));
    r.setAttribute('normal', new T.BufferAttribute(nor, 3));
    r.setAttribute('uv', new T.BufferAttribute(uv, 2));
    r.computeBoundingSphere();
    return r;
  };
  const trunk = (h, r, seg) => {
    const g = new T.CylinderGeometry(r * 0.65, r, h, seg, 1, true); g.translate(0, h / 2, 0);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * h / 2);
    return g;
  };
  // boule de feuillage bosselée
  const blob = (cx, cy, cz, rx, ry, rz, detail, rand) => {
    const g = new T.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new T.Vector3(), seedOff = rand() * 100;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const j = 0.84 + 0.28 * (Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + seedOff) * 43758.5453 % 1 + 1) % 1;
      p.setXYZ(i, cx + v.x * rx * j, cy + v.y * ry * j, cz + v.z * rz * j);
    }
    g.computeVertexNormals();
    return g;
  };
  const cone = (y, r, h, seg, rand) => {
    const g = new T.ConeGeometry(r, h, seg, 1, true), p = g.attributes.position;
    const so = rand() * 100; for (let i = 0; i < p.count; i++) { const k = 0.88 + 0.2 * ((Math.sin(Math.round(p.getX(i) * 1e3) * 0.0129898 + Math.round(p.getZ(i) * 1e3) * 0.078233 + so) * 43758.5453 % 1 + 1) % 1); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    g.translate(0, y + h / 2, 0); g.computeVertexNormals(); return g;
  };

  // feuillu : tronc + plusieurs masses de feuillage autour d'une cime ellipsoïdale
  function broadleaf(o) {
    const lod = (detail, lumps, trunkSeg) => {
      const rand = rng(o.seed), parts = [];
      const cy = o.trunkH + o.crownH * 0.5;
      parts.push(blob(0, cy, 0, o.crownR, o.crownH * 0.5, o.crownR, detail, rand));
      for (let i = 0; i < lumps; i++) {
        const a = (i / lumps) * Math.PI * 2 + rand() * 0.6, h = (rand() - 0.35) * o.crownH * 0.45;
        const d = o.crownR * (0.55 + 0.25 * rand()), r = o.crownR * (0.45 + 0.2 * rand());
        parts.push(blob(Math.cos(a) * d, cy + h, Math.sin(a) * d, r, r * 0.85, r, detail, rand));
      }
      return { leaves: merge(parts), bark: trunkSeg ? trunk(o.trunkH + o.crownH * 0.3, o.trunkR, trunkSeg) : null };
    };
    const near = lod(1, o.lumps, 7), mid = lod(1, Math.ceil(o.lumps / 2), 0), far = lod(0, 0, 0);
    return model(o.trunkH + o.crownH, o.crownR, near, mid, far, o);
  }
  // conifère : tronc + étages de cônes
  function conifer(o) {
    const lod = (tiers, seg, trunkSeg) => {
      const rand = rng(o.seed), parts = [], span = o.height - o.first;
      for (let i = 0; i < tiers; i++) {
        const t = i / tiers, r = o.radius * (1 - t * 0.85), h = span / tiers * 2.2;
        parts.push(cone(o.first + t * span * 0.92, r, h, seg, rand));
      }
      return { leaves: merge(parts), bark: trunkSeg ? trunk(o.height * 0.9, o.trunk, trunkSeg) : null };
    };
    const near = lod(o.tiers, 8, 6), mid = lod(Math.ceil(o.tiers / 2), 6, 0), far = lod(2, 5, 0);
    return model(o.height, o.radius, near, mid, far, o);
  }
  function model(height, crown, near, mid, far, o) {
    const leafPart = g => ({ geometry: g, material: leafMat, cast: false, tint: true });
    return {
      height, crown,
      lods: [
        { to: o.near || 60, parts: [{ geometry: near.bark, material: barkMat, cast: true, tint: false }, { geometry: near.leaves, material: leafMat, cast: true, tint: true }] },
        { to: o.mid || 150, parts: [leafPart(mid.leaves)] },
        { to: Infinity, parts: [leafPart(far.leaves)] },
      ],
    };
  }

  const models = {
    tree: broadleaf({ seed: 21, trunkH: 2.6, trunkR: 0.28, crownH: 6.0, crownR: 3.2, lumps: 6 }),
    pine: conifer({ seed: 11, height: 13, radius: 2.8, first: 2.0, tiers: 7, trunk: 0.24 }),
    birch: broadleaf({ seed: 25, trunkH: 4.4, trunkR: 0.16, crownH: 5.4, crownR: 1.9, lumps: 5 }),
    sapling: broadleaf({ seed: 27, trunkH: 1.0, trunkR: 0.06, crownH: 1.9, crownR: 0.9, lumps: 3 }),
  };
  return { models, WIND, leafMat, barkMat };
}
