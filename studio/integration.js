// Intégration des modèles du studio dans Limoges 3D (activée seulement avec ?studio=1 dans l'URL du jeu).
// - charge data/studio/manifest.json et les GLB listés ;
// - les place par simple translation (même repère que le moteur) ;
// - masque l'ancien bâtiment générique au même endroit (discard dans les matériaux de façade/toit du jeu).
// Rien n'est supprimé : sans ?studio=1, le jeu est strictement identique.
export async function integrateStudio({ THREE, scene, loader, root, X0, Y0, H0, base = 'data/studio/' }) {
  const r = await fetch(base + 'manifest.json', { cache: 'no-store' }); if (!r.ok) return [];
  const man = await r.json(), items = man.batiments || []; if (!items.length) return [];
  const loaded = [];
  for (const it of items) {
    try {
      const g = await loader.loadAsync(base + it.fichier);
      const o = g.scene; const s = (g.scene.userData && g.scene.userData.studio) || (g.scene.children[0] && g.scene.children[0].userData.studio) || {};
      const org = s.origine || it.origine; if (!org || org.crs !== 'EPSG:2154') { console.warn('studio : origine absente', it.id); continue; }
      o.position.set(org.x - X0, org.z0 - H0, -(org.y - Y0));
      o.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } if (/INTERIEUR_GENERE|Environnement/.test(m.name)) m.visible = false; });
      scene.add(o); loaded.push({ it, o, org, emprise: it.emprise });
    } catch (e) { console.warn('studio : échec', it.id, e); }
  }
  if (!loaded.length || !root) return loaded;
  // ---- masque des anciens bâtiments : raster 0,5 m des emprises (dilatées de 0,8 m), dans le repère du jeu ----
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const rings = loaded.filter(l => l.emprise).map(l => l.emprise.map(p => [p[0] - X0, -(p[1] - Y0)]));
  for (const rg of rings) for (const [x, z] of rg) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  if (!rings.length) return loaded;
  x0 -= 3; z0 -= 3; x1 += 3; z1 += 3;
  const res = Math.max(0.5, (x1 - x0) / 2048, (z1 - z0) / 2048), W = Math.ceil((x1 - x0) / res), H = Math.ceil((z1 - z0) / res);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = g.strokeStyle = '#fff'; g.lineWidth = 1.6 / res; g.lineJoin = 'round';
  for (const rg of rings) { g.beginPath(); rg.forEach(([x, z], i) => (i ? g.lineTo : g.moveTo).call(g, (x - x0) / res, (z - z0) / res)); g.closePath(); g.fill(); g.stroke(); }
  const mask = new THREE.CanvasTexture(c); mask.flipY = false; mask.magFilter = mask.minFilter = THREE.NearestFilter; mask.generateMipmaps = false;
  const box = new THREE.Vector4(x0, z0, x1, z1), done = new Set();
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return; const m = o.material;
    if (done.has(m) || !/facade|mur|pignon|toit/.test(m.name)) return; done.add(m);
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, rr) => {
      if (prev) prev(sh, rr);
      sh.uniforms.uStudioMask = { value: mask }; sh.uniforms.uStudioBox = { value: box };
      sh.vertexShader = 'varying vec3 vStudioW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vStudioW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vStudioW;\nuniform sampler2D uStudioMask;\nuniform vec4 uStudioBox;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
         { vec2 sm = (vStudioW.xz - uStudioBox.xy) / (uStudioBox.zw - uStudioBox.xy);
           if (sm.x > 0.0 && sm.y > 0.0 && sm.x < 1.0 && sm.y < 1.0 && texture2D(uStudioMask, sm).r > 0.5) discard; }`);
    };
    const prevKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
    m.customProgramCacheKey = () => prevKey() + '|studio';
    m.needsUpdate = true;
  });
  console.info('studio : ' + loaded.length + ' bâtiment(s) reconstruit(s) intégré(s)');
  return loaded;
}
