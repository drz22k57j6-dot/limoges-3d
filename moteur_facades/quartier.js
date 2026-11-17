// Habillage des vrais bâtiments IGN par le moteur de façades, à la volée autour du drone.
// Données : data/paris/facades/<secteur>.json (outils/facades_quartier.py) — façades sur rue, hauteur réelle, commerces BDCOM.
// Fonctionnement : la ville est découpée en cellules de 64 m. Quand une cellule entre dans le rayon de détail, ses
// bâtiments sont fabriqués un par un (une façade par image, pour éviter les saccades), puis fusionnés par matériau
// (peu d'appels de dessin). Le volume IGN des bâtiments habillés est masqué dans les tuiles ; il réapparaît quand la
// cellule sort du rayon (version simple au loin). Les cœurs d'îlot gardent le modèle IGN.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CELLM = 64;
const TEINTES = {   // [teinte, poids, variation] — même logique que les rues test
  pierre: [[0xf6ead2, 5, .04], [0xfbf3e4, 3, .03], [0xe9e2d6, 2, .04], [0xf0dcb8, 1.5, .04], [0xdcd8d0, 1, .03]],
  riche: [[0xfaf2e3, 4, .02], [0xf6eddb, 3, .02], [0xfdf8ef, 2, .015]],
  enduit: [[0xeee6d6, 3, .05], [0xe2c08e, 1.2, .06], [0xe6c2b6, 1, .05], [0xe8da9e, 1, .05], [0xbdb9b0, 1.5, .05], [0xf4f1ea, 1.5, .03]],
};
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rngOf = s => { let x = hash(s) % 2147483646 + 1; return () => (x = x * 16807 % 2147483647) / 2147483647; };

export async function createQuartier(T, opt) {
  const qv = opt.v || '', base = opt.base;
  const [{ createKit, buildBuilding }, { buildShop, materiauxPartages }, { H }] = await Promise.all([
    import('./facades.js' + qv), import('./commerces.js' + qv), import('./facades.js' + qv)]);
  const KIT = createKit(T, new URL('./tex/', import.meta.url).href);
  const idx = await fetch(base + 'index.json' + qv).then(r => r.json()).catch(() => ({ secteurs: {} }));
  const secteurs = new Map();   // k -> 'charge' | liste de bâtiments
  const cells = new Map();      // cellKey -> { batis, etat: 'attente'|'construit', groupe, ids }
  const root = new T.Group(); root.name = 'quartier_facades'; opt.scene.add(root);
  let R_IN = opt.rayon ?? 150, R_OUT = R_IN + 60, R_FULL = opt.rayonDetail ?? 75;   // détail complet près du drone, version simple jusqu'à R_IN
  let file = [];   // tâches : { cell, bat }
  const stats = { cellules: 0, batiments: 0, ms: 0, appels: 0 };
  // boîte noire : étapes avec durée (si l'onglet meurt pendant l'une d'elles, elle reste « en cours » dans le rapport)
  const E = (action, detail) => { const b = opt.bn && opt.bn(); return b ? b.debut('façades', action, detail) : () => {}; };

  // matériau des murs de cour / noyau : enduit avec fenêtres (texture répétée, coordonnées monde)
  const cour = (() => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 192; const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 192); g.fillStyle = '#ebe6dc'; for (let i = 0; i < 300; i++) g.fillRect(Math.random() * 128, Math.random() * 192, 2, 2);
    g.fillStyle = '#3a3f44'; g.fillRect(40, 50, 48, 92); g.fillStyle = '#e8e4da'; g.fillRect(40, 50, 48, 4); g.fillRect(62, 50, 4, 92); g.fillRect(36, 140, 56, 6);
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping;
    return new T.MeshStandardMaterial({ map: t, roughness: .9, side: T.DoubleSide, vertexColors: true });
  })();
  const toitCour = new T.MeshStandardMaterial({ color: 0x4f565d, metalness: .3, roughness: .7, side: T.DoubleSide });

  function teinte(R, st) {
    const L = st === 'riche' ? TEINTES.riche : st === 'modeste' ? TEINTES.enduit : TEINTES.pierre;
    let x = R() * L.reduce((t, e) => t + e[1], 0), e = L[0]; for (const t of L) { if ((x -= t[1]) <= 0) { e = t; break; } }
    // teintes quantifiées : moins de matériaux différents → moins d'appels de dessin
    const c = new T.Color(e[0]); c.offsetHSL(Math.round((R() - .5) * 2) * e[2] * .25, 0, Math.round((R() - .5) * 2) * e[2] * .5); return c.getHex();
  }

  // prisme du noyau (murs de cour + toit plat), coordonnées monde
  function noyau(ring, y0, h, ton) {
    const n = ring.length, pos = [], uv = [];
    let per = 0;
    for (let i = 0; i < n; i++) {
      const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % n], L = Math.hypot(x2 - x1, z2 - z1);
      pos.push(x1, y0, z1, x2, y0, z2, x2, y0 + h, z2, x1, y0, z1, x2, y0 + h, z2, x1, y0 + h, z1);
      const u0 = per / 2.8, u1 = (per + L) / 2.8, v0 = 0, v1 = h / 3.0; per += L;
      uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    const c = new T.Color(ton).multiplyScalar(.7), col = new Float32Array(pos.length); for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; } g.setAttribute('color', new T.BufferAttribute(col, 3));
    // normales vers l'extérieur quel que soit le sens de l'anneau
    const shape = new T.Shape(ring.map(([x, z]) => new T.Vector2(x, -z)));
    const top = new T.ShapeGeometry(shape); top.rotateX(-Math.PI / 2); top.translate(0, y0 + h, 0);
    return { murs: g, toit: top };
  }

  // fabrique un bâtiment (toutes ses façades + noyau) dans le groupe de la cellule
  function fabriquer(bat, grp, lod) {
    const R = rngOf(bat.id), st = bat.st, tone = teinte(R, st), wear = Math.round((.12 + R() * .3) * 4) / 4;
    let yMin = Infinity;
    bat.f.forEach((f, k) => {
      const [ax, az] = f.a, [bx, bz] = f.b, W = Math.hypot(bx - ax, bz - az); if (W < 4) return;
      const dx = (bx - ax) / W, dz = (bz - az) / W, mx = (ax + bx) / 2, mz = (az + bz) / 2, y = opt.groundH(mx, mz);
      yMin = Math.min(yMin, y);
      const shops = f.s.map((s, i) => ({ type: s.t, nom: s.nom, u: s.u, id: bat.id + k + '-' + i }));
      const b = buildBuilding(T, KIT, { width: W, depth: 6, seed: hash(bat.id) + k * 7919, style: st, hGout: bat.h, wear, tone, shops, shopBuilder: buildShop, trottoir: f.tr, verdure: .5, tagP: .35, pClosed: .15, toneJit: 0, lod });
      const M = new T.Matrix4().makeBasis(new T.Vector3(dx, 0, dz), new T.Vector3(0, 1, 0), new T.Vector3(-dz, 0, dx)).setPosition(ax, y, az);
      b.applyMatrix4(M); grp.add(b);
    });
    if (!isFinite(yMin)) yMin = opt.groundH(bat.cx, bat.cz);
    const hc = bat.h + (st === 'moderne' ? .6 : st === 'modeste' ? 2.6 : 3.6);
    const murs = [], toits = [];
    for (const r of bat.c) { const { murs: m, toit: t } = noyau(r, yMin - 1, hc + 1, tone); murs.push(m); toits.push(t); }
    if (murs.length) { const a = new T.Mesh(mergeGeometries(murs), cour), b = new T.Mesh(mergeGeometries(toits), toitCour); a.castShadow = a.receiveShadow = b.receiveShadow = true; grp.add(a, b); }
  }

  // fusion par matériau du contenu d'une cellule, découpée en petites étapes (pas de saccade)
  function preparerFusion(grp) {
    grp.updateMatrixWorld(true); const meshes = []; grp.traverse(o => { if (o.isMesh) meshes.push(o); });
    return { meshes, i: 0, par: new Map(), paquets: null, out: new T.Group() };
  }
  // étape 1 : copie en coordonnées monde par lots ; étape 2 : fusion par matériau, par paquets de taille bornée
  function etapePrep(F, budget, t0) {
    while (F.i < F.meshes.length && performance.now() - t0 < budget) {
      const o = F.meshes[F.i++], g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      const sig = Object.keys(g.attributes).sort().join(','), key = o.material.uuid + sig;
      if (!F.par.has(key)) F.par.set(key, { m: o.material, L: [], n: 0 }); const p = F.par.get(key); p.L.push(g); p.n += g.attributes.position.count;
    }
    if (F.i < F.meshes.length) return false;
    F.paquets = []; for (const p of F.par.values()) { let cur = []; let n = 0; for (const g of p.L) { cur.push(g); n += g.attributes.position.count; if (n > 60000) { F.paquets.push({ m: p.m, L: cur }); cur = []; n = 0; } } if (cur.length) F.paquets.push({ m: p.m, L: cur }); }
    return true;
  }
  function etapeFusion(F) {
    const p = F.paquets.pop(); if (!p) return true;
    let g = null; try { g = p.L.length > 1 ? mergeGeometries(p.L, false) : p.L[0]; } catch (e) { g = null; }
    if (!g) { for (const x of p.L) F.out.add(new T.Mesh(x, p.m)); return !F.paquets.length; }
    if (p.L.length > 1) p.L.forEach(x => x.dispose());
    const m = p.m, me = new T.Mesh(g, m); me.castShadow = opt.ombres !== false && !m.transparent && !(m.emissiveIntensity > .5); me.receiveShadow = true; me.matrixAutoUpdate = false; F.out.add(me);
    return !F.paquets.length;
  }
  function liberer(grp, geomSeule) {
    if (geomSeule) { grp.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); return; }
    const partages = new Set([...KIT.partages(), ...materiauxPartages(), cour, toitCour]);
    grp.traverse(o => { if (!o.isMesh) return; o.geometry.dispose(); const m = o.material; if (!partages.has(m)) { if (m.map) m.map.dispose(); if (m.emissiveMap && m.emissiveMap !== m.map) m.emissiveMap.dispose(); if (m.bumpMap && m.bumpMap !== KIT.ribs) m.bumpMap.dispose(); m.dispose(); } });
  }

  function chargerSecteur(k) {
    if (secteurs.has(k) || !idx.secteurs[k]) return; secteurs.set(k, 'charge');
    const fin = E('chargement bâtiments', 'secteur ' + k);
    fetch(base + k + '.json' + qv).then(r => r.json()).then(d => {
      fin(d.b.length + ' bâtiments');
      secteurs.set(k, d.b);
      for (const b of d.b) { const ck = Math.floor(b.cx / CELLM) + '_' + Math.floor(b.cz / CELLM); let c = cells.get(ck); if (!c) cells.set(ck, c = { cx: (Math.floor(b.cx / CELLM) + .5) * CELLM, cz: (Math.floor(b.cz / CELLM) + .5) * CELLM, batis: [], etat: 'vide', lod: 1 }); c.batis.push(b); }
    }).catch(e => { fin('échec ' + e); secteurs.delete(k); });
  }

  const api = {
    root, stats, actif: true,
    get attente() { return file.length; },
    get rayon() { return R_IN; }, get rayonDetail() { return R_FULL; },
    // réglage dynamique (téléphone qui rame) : rayon réduit, les cellules trop loin sont libérées au prochain passage
    setRayon(r, d) { R_IN = r; R_OUT = r + 50; if (d !== undefined) R_FULL = d; },
    // appelée ~4 fois par seconde : charge les secteurs proches, programme / décharge les cellules
    maj(x, z) {
      if (!api.actif) { for (const c of cells.values()) if (c.etat !== 'vide') api.vider(c); file = []; return; }
      const si = Math.floor((x + 10000) / 1000), sj = Math.floor((-z + 6000) / 1000);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) chargerSecteur((si + a) + '_' + (sj + b));
      for (const c of cells.values()) {
        const d = Math.hypot(c.cx - x, c.cz - z), lod = d < R_FULL ? 0 : 1;
        if (d > R_OUT) { if (c.etat !== 'vide') api.vider(c); continue; }
        if (c.etat === 'vide' && d < R_IN) api.programmer(c, lod);
        else if (c.etat !== 'vide' && c.lod === 1 && lod === 0) api.programmer(c, 0);                 // on s'approche : version détaillée
        else if (c.etat === 'construit' && c.lod === 0 && d > R_FULL + 45) api.programmer(c, 1);      // on s'éloigne : version simple
      }
      file = file.filter(c => c.etat === 'attente' || c.etat === 'remplace').sort((p, q) => Math.hypot(p.cx - x, p.cz - z) - Math.hypot(q.cx - x, q.cz - z));
    },
    programmer(c, lod) {
      // l'ancienne version reste affichée jusqu'à ce que la nouvelle soit prête
      if (c.tmp) { liberer(c.tmp); root.remove(c.tmp); }
      c.lod = lod; c.etat = c.groupe ? 'remplace' : 'attente'; c.tmp = new T.Group(); c.reste = c.batis.slice(); c.F = null; c.vu = false; if (!file.includes(c)) file.push(c);
    },
    // appelée à chaque image : fabrique au plus un bâtiment ou une étape de fusion (budget en ms)
    tache(budget = 8) {
      const t0 = performance.now();
      while (file.length && performance.now() - t0 < budget) {
        const c = file[0];
        if (c.reste.length) {
          const b = c.reste.shift();
          const fin = E('génération façades', b.id + ' ' + b.st + ' ' + b.f.length + 'f lod' + c.lod);
          try { fabriquer(b, c.tmp, c.lod); stats.batiments++; } catch (e) { console.warn('façade', b.id, e); }
          fin();
          if (!c.groupe && !c.vu) { root.add(c.tmp); c.vu = true; }   // apparition progressive (première construction)
          if (!c.groupe) opt.masquer([b.id], true);
          break;
        }
        if (!c.F) c.F = preparerFusion(c.tmp);
        if (!c.F.paquets) { const fin = E('fusion cellule (copie)', c.batis.length + ' bât.'); etapePrep(c.F, budget, t0); fin(c.F.i + '/' + c.F.meshes.length); continue; }
        const finF = E('fusion cellule (paquet)', c.F.paquets.length + ' restants');
        const fini = etapeFusion(c.F); finF();
        if (fini) {
          file.shift(); root.remove(c.tmp); liberer(c.tmp, true); c.tmp = null;
          if (c.groupe) { root.remove(c.groupe); liberer(c.groupe); } else stats.cellules++;
          c.groupe = c.F.out; c.F = null; root.add(c.groupe); c.etat = 'construit';
          c.ids = c.batis.map(b => b.id); opt.masquer(c.ids, true);
        }
      }
      stats.ms = performance.now() - t0;
    },
    vider(c) {
      const fin = E('déchargement cellule', c.batis.length + ' bât.');
      if (c.groupe) { root.remove(c.groupe); liberer(c.groupe); c.groupe = null; }
      if (c.tmp) { root.remove(c.tmp); liberer(c.tmp); c.tmp = null; }
      c.F = null; file = file.filter(x => x !== c);
      if (c.ids) { opt.masquer(c.ids, false); c.ids = null; }
      if (c.ids || c.etat === 'construit') stats.cellules = Math.max(0, stats.cellules - 1);
      opt.masquer(c.batis.map(b => b.id), false);
      c.etat = 'vide'; fin();
    },
  };
  return api;
}
