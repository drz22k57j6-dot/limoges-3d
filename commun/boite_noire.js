// Boîte noire v2 : connaître la cause de chaque crash, surtout sur iPhone où Safari ferme l'onglet sans aucun message.
//
// Principe
// - Une session n'est JAMAIS considérée comme terminée proprement, sauf appel explicite à terminer(). Passer en
//   arrière-plan, recharger, fermer l'onglet : la session reste « potentiellement interrompue » et sera classée au
//   relancement suivant (avec le contexte : premier plan / arrière-plan / rechargement détecté).
// - Toutes les 2 s : instantané (images/s, rendu, compteurs three.js, mémoire séparée, étapes en cours), pics et maxima.
// - Double sauvegarde : localStorage (synchrone) + IndexedDB (asynchrone). Au relancement on garde la plus récente.
//
// Mémoire : ce qui est MESURÉ et ce qui est ESTIMÉ est toujours distingué.
//   js_mo        : tas JavaScript mesuré (Chrome uniquement : performance.memory) — absent sur Safari
//   geo_mo       : octets réels des tableaux de géométrie présents en mémoire JS (mesuré, côté processeur)
//   tex_est_mo   : textures, estimation (largeur × hauteur × 4 × 1,33 pour les mipmaps)
//   rt_est_mo    : cibles de rendu (post-traitement, ombres, images d'identification), estimation
//   toile_est_mo : tampon d'affichage du canvas, estimation
//   gpu_est_mo   : somme estimée de ce qui est envoyé au processeur graphique — JAMAIS une mesure de la VRAM réelle
import { MOTEUR, HISTORIQUE } from './version_moteur.js';

const K_SES = 'bn2.session', K_CR = 'bn2.crashs', K_HIST = 'bn2.sessions';
const lire = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const r1 = v => Math.round(v * 10) / 10;
const MO = 1048576;

// --- IndexedDB (copie de secours, survit si localStorage est vidé ou n'a pas été écrit sur disque)
function idb() {
  return new Promise(res => { try { const q = indexedDB.open('boite_noire', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => res(null); } catch (e) { res(null); } });
}
const idbGet = (db, k) => new Promise(res => { if (!db) return res(null); try { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); } catch (e) { res(null); } });
const idbSet = (db, k, v) => { if (!db) return; try { db.transaction('kv', 'readwrite', { durability: 'strict' }).objectStore('kv').put(v, k); } catch (e) { try { db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch (e2) {} } };   // écriture forcée sur disque

export async function demarrerBoiteNoire(opt) {
  const t0 = performance.now(), sec = () => r1((performance.now() - t0) / 1000);
  const appareil = { ua: navigator.userAgent.slice(0, 180), dpr: devicePixelRatio, ecran: screen.width + '×' + screen.height, ram_go: navigator.deviceMemory || null, coeurs: navigator.hardwareConcurrency || null, tactile: matchMedia('(pointer:coarse)').matches };
  const db = await idb();

  // ---------- 1. classer la session précédente (jamais propre sans terminer())
  const a = lire(K_SES), b = await idbGet(db, K_SES);
  const prev = !a ? b : !b ? a : ((b.battement || 0) > (a.battement || 0) ? b : a);
  if (prev && prev.etat !== 'terminee') {
    const cr = { ...prev, classe: classer(prev), diag: diagnostic(prev), source: prev === b && b !== a ? 'IndexedDB' : 'localStorage' };
    const L = lire(K_CR) || []; if (!L.some(x => x.id === cr.id)) { L.unshift(cr); ecrire(K_CR, L.slice(0, 25)); idbSet(db, K_CR, L.slice(0, 25)); }
  }
  if (prev) { const H = lire(K_HIST) || []; if (!H.some(x => x.id === prev.id)) { H.unshift({ id: prev.id, moteur: prev.moteur, debut: prev.debut, duree_s: (prev.snaps.at(-1) || {}).t || 0, fin: prev.etat === 'terminee' ? 'terminée' : classer(prev).code, max: prev.max }); ecrire(K_HIST, H.slice(0, 80)); } }

  // ---------- 2. nouvelle session
  const ses = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), moteur: MOTEUR, version_fichiers: opt.version || '', debut: new Date().toISOString(), appareil,
    etat: document.visibilityState === 'visible' ? 'active' : 'arriere-plan', etat_depuis: 0, battement: Date.now(), pagehide: null, passages_arriere_plan: 0,
    snaps: [], ev: [], critiques: [], etapes: [], en_cours: [], max: {}, pics: [] };
  const sauver = () => { ses.battement = Date.now(); ecrire(K_SES, ses); idbSet(db, K_SES, ses); };

  // ---------- 3. événements (erreurs, WebGL, cycle de vie) — toujours horodatés
  // événements : répétitions regroupées (×n) ; les événements critiques sont gardés à part (jamais chassés par un flot de messages)
  const note = (type, msg) => {
    msg = String(msg).slice(0, 300); const der = ses.ev[ses.ev.length - 1];
    if (der && der.type === type && der.msg === msg) { der.n = (der.n || 1) + 1; der.t2 = sec(); return; }
    const e = { t: sec(), type, msg }; ses.ev.push(e); if (ses.ev.length > 50) ses.ev.shift();
    if (type === 'webgl' || type === 'erreur' || type === 'promesse' || type === 'pic') { ses.critiques.push(e); if (ses.critiques.length > 25) ses.critiques.shift(); }
  };
  addEventListener('error', e => note('erreur', (e.message || e) + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')));
  addEventListener('unhandledrejection', e => note('promesse', e.reason && (e.reason.stack || e.reason.message) || e.reason));
  const ce = console.error.bind(console), cw = console.warn.bind(console);
  console.error = (...x) => { note('console.error', x.map(v => v && v.message || v).join(' ')); ce(...x); };
  console.warn = (...x) => { note('console.warn', x.map(v => v && v.message || v).join(' ')); cw(...x); };
  const cv = opt.renderer.domElement;
  cv.addEventListener('webglcontextlost', () => { note('webgl', 'contexte WebGL PERDU'); ses.max.contexte_perdu = (ses.max.contexte_perdu || 0) + 1; sauver(); });
  cv.addEventListener('webglcontextrestored', () => { note('webgl', 'contexte WebGL restauré'); sauver(); });
  document.addEventListener('visibilitychange', () => {
    const v = document.visibilityState === 'visible'; ses.etat = v ? 'active' : 'arriere-plan'; ses.etat_depuis = sec(); if (!v) ses.passages_arriere_plan++;
    note('cycle', v ? 'retour au premier plan' : 'passage en arrière-plan (session toujours considérée comme ouverte)'); sauver();
  });
  // rechargement / fermeture d'onglet : simplement noté, la session reste « non terminée »
  addEventListener('pagehide', e => { ses.pagehide = { t: sec(), persisted: !!e.persisted }; note('cycle', 'pagehide (rechargement, navigation ou fermeture)'); sauver(); });
  addEventListener('pageshow', e => { if (e.persisted) { ses.pagehide = null; note('cycle', 'page restaurée depuis le cache'); sauver(); } });

  // ---------- 4. étapes des moteurs (avec durée) : si l'onglet meurt pendant une étape, elle reste « en cours »
  let nEt = 0;
  function debut(moteur, action, detail = '') {
    const e = { n: ++nEt, moteur, action, detail: String(detail).slice(0, 100), t: sec() }; ses.en_cours.push(e); if (ses.en_cours.length > 12) ses.en_cours.shift();
    return function fin(extra) { const i = ses.en_cours.indexOf(e); if (i >= 0) ses.en_cours.splice(i, 1); const d = Math.round((sec() - e.t) * 1000); ses.etapes.push({ ...e, ms: d, ...(extra ? { info: String(extra).slice(0, 80) } : {}) }); if (ses.etapes.length > 60) ses.etapes.shift(); if (d > 120) note('lent', `${moteur} · ${action} ${e.detail} : ${d} ms`); };
  }
  function ponctuel(moteur, action, detail = '') { ses.etapes.push({ n: ++nEt, moteur, action, detail: String(detail).slice(0, 100), t: sec(), ms: 0 }); if (ses.etapes.length > 60) ses.etapes.shift(); }

  // ---------- 5. mesure mémoire (séparée) toutes les 2 s, avec l'instantané
  const RT_SEEN = new WeakSet();
  function cibles() {
    const out = new Set(), voir = (o, prof) => { if (!o || prof > 3 || typeof o !== 'object' || RT_SEEN.has(o)) return; if (o.isWebGLRenderTarget) { out.add(o); return; } if (Array.isArray(o)) { o.forEach(x => voir(x, prof + 1)); return; } if (prof < 3 && (o.isPass || o.passes || o.renderTarget1)) for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object' && !v.isObject3D && !v.isMaterial && !v.isTexture) voir(v, prof + 1); } };
    for (const c of (opt.ciblesRendu ? safe(opt.ciblesRendu) : []) || []) voir(c, 0);
    opt.scene.traverse(o => { if (o.isLight && o.castShadow && o.shadow && o.shadow.map) out.add(o.shadow.map); });
    return out;
  }
  function mesurer() {
    const geos = new Set(), texs = new Set(), parts = {};
    let geo = 0, tex = 0;
    opt.scene.traverse(o => {
      if (!o.geometry && !o.material) return;
      let sys = 'autre'; for (let p = o; p; p = p.parent) { const n = p.userData && p.userData.bnNom || (p.name === 'quartier_facades' ? 'façades' : p.name === 'lampadaires' ? 'lampadaires' : p.name === 'rue_test' ? 'rue test' : null); if (n) { sys = n; break; } }
      const g = o.geometry;
      if (g && !geos.has(g)) { geos.add(g); let by = 0; for (const k in g.attributes) { const at = g.attributes[k]; by += at.array ? at.array.byteLength : (at.data && at.data.array ? at.data.array.byteLength / Math.max(1, at.data.stride / at.itemSize) : 0); } if (g.index) by += g.index.array.byteLength; geo += by; parts['géo ' + sys] = (parts['géo ' + sys] || 0) + by; }
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'aoMap', 'envMap']) {
        const t = m[k]; if (!t || texs.has(t)) continue; texs.add(t); const im = t.image; const w = im && (im.width || im.videoWidth) || 0, h = im && (im.height || im.videoHeight) || 0; const by = w * h * 4 * (t.generateMipmaps !== false ? 1.33 : 1) * (t.isCubeTexture ? 6 : 1); tex += by; parts['tex ' + sys] = (parts['tex ' + sys] || 0) + by;
      }
    });
    let rt = 0; for (const c of cibles()) { const w = c.width || (c.mapSize && c.mapSize.x) || 0, h = c.height || (c.mapSize && c.mapSize.y) || 0, bpp = (c.texture && c.texture.type === 1016 /* HalfFloat */) ? 8 : (c.texture && c.texture.type === 1015) ? 16 : 4, s = Math.max(1, c.samples || 1); rt += w * h * (bpp * s + (c.depthBuffer !== false ? 4 * s : 0)); }
    const dpr = opt.renderer.getPixelRatio(), toile = cv.width * cv.height * 4 * 3;   // tampons avant / arrière / profondeur
    const js = performance.memory ? performance.memory.usedJSHeapSize / MO : null;
    return { js_mo: js === null ? null : r1(js), js_source: js === null ? 'non disponible (Safari)' : 'mesuré (Chrome)', geo_mo: r1(geo / MO), tex_est_mo: r1(tex / MO), rt_est_mo: r1(rt / MO), toile_est_mo: r1(toile / MO), gpu_est_mo: r1((geo + tex + rt + toile) / MO), textures_n: texs.size, geometries_n: geos.size, dpr,
      parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, r1(v / MO)]).sort((x, y) => y[1] - x[1]).slice(0, 10)) };
  }

  // ---------- 6. images/s, pire image
  // compteurs de rendu cumulés sur toute l'image (post-traitement compris) : sinon three.js ne garde que la dernière passe
  opt.renderer.info.autoReset = false; let rendu = { triangles: 0, calls: 0 };
  let frames = 0, acc = 0, fps = 0, dtMax = 0, lastF = performance.now();
  function image() {
    const ri = opt.renderer.info.render; if (ri.calls) rendu = { triangles: ri.triangles, calls: ri.calls }; opt.renderer.info.reset(); const n = performance.now(), d = n - lastF; lastF = n; frames++; acc += d; dtMax = Math.max(dtMax, d); if (acc > 1000) { fps = frames * 1000 / acc; frames = 0; acc = 0; } }

  // ---------- 7. instantané + pics + maxima
  let prevS = null;
  function instantane() {
    const fin = debut('boîte noire', 'instantané');
    const inf = opt.renderer.info, m = mesurer(), st = opt.etat ? safe(opt.etat) : {};
    const s = { t: sec(), vis: document.visibilityState[0], fps: Math.round(fps), pire_ms: Math.round(dtMax), tri_k: Math.round(rendu.triangles / 1000), appels: rendu.calls, three: { geo: inf.memory.geometries, tex: inf.memory.textures, prog: inf.programs ? inf.programs.length : null }, mem: m, en_cours: ses.en_cours.map(e => `${e.moteur}:${e.action} ${e.detail}`.trim()), ...st };
    // pics : variation brutale entre deux instantanés
    if (prevS) {
      const dG = s.mem.gpu_est_mo - prevS.mem.gpu_est_mo, dJ = (s.mem.js_mo ?? 0) - (prevS.mem.js_mo ?? 0), dT = s.tri_k - prevS.tri_k;
      if (dG > 40 || dJ > 60 || (dT > 600 && s.tri_k > 1.8 * prevS.tri_k) || s.pire_ms > 400) { const p = { t: s.t, gpu_est: `${prevS.mem.gpu_est_mo} → ${s.mem.gpu_est_mo} Mo`, js: s.mem.js_mo === null ? 'n/d' : `${prevS.mem.js_mo} → ${s.mem.js_mo} Mo`, tri_k: `${prevS.tri_k} → ${s.tri_k}`, pire_ms: s.pire_ms, pendant: s.en_cours.concat(ses.etapes.slice(-4).map(e => `${e.moteur}:${e.action} ${e.detail} (${e.ms} ms)`)) }; ses.pics.push(p); if (ses.pics.length > 20) ses.pics.shift(); note('pic', `GPU estimé ${p.gpu_est}, triangles ${p.tri_k}k, pire image ${s.pire_ms} ms`); }
    }
    const M = ses.max, up = (k, v) => { if (v !== null && v !== undefined && !(v <= (M[k] ?? -1))) M[k] = v; };
    up('gpu_est_mo', m.gpu_est_mo); up('geo_mo', m.geo_mo); up('tex_est_mo', m.tex_est_mo); up('rt_est_mo', m.rt_est_mo); up('js_mo', m.js_mo); up('tri_k', s.tri_k); up('appels', s.appels); up('pire_ms', s.pire_ms); up('textures_n', m.textures_n);
    ses.snaps.push(s); if (ses.snaps.length > 20) ses.snaps.shift(); prevS = s; dtMax = 0;
    fin(); ses.etapes.pop();   // l'instantané lui-même n'encombre pas l'historique
    sauver();
  }
  function safe(f) { try { return f(); } catch (e) { return { err: String(e) }; } }
  setInterval(instantane, 2000); setTimeout(instantane, 800);
  sauver();

  const api = {
    image, note, debut, ponctuel,
    etape(s) { /* compat v1 */ if (s) ponctuel('jeu', s); },
    // à appeler UNIQUEMENT quand le joueur quitte volontairement (bouton) : sinon la session reste « potentiellement interrompue »
    terminer() { ses.etat = 'terminee'; note('cycle', 'session terminée explicitement'); sauver(); },
    crashs: () => lire(K_CR) || [], sessions: () => lire(K_HIST) || [], session: () => ses, historique: HISTORIQUE, moteur: MOTEUR,
    effacer() { ecrire(K_CR, []); idbSet(db, K_CR, []); },
    texte: c => rapportTexte(c), parVersion,
    instantane,
  };
  return api;
}

// --- classement d'une session non terminée
function classer(s) {
  const d = s.snaps.at(-1) || {};
  const C = (s.critiques || []).concat(s.ev || []);
  if (C.some(e => e.type === 'webgl' && /PERDU/.test(e.msg))) return { code: 'gpu', texte: 'Contexte WebGL perdu (mémoire graphique saturée) — le jeu a rechargé la page' + (s.pagehide ? '' : ' ou l\'onglet est mort') };
  if (s.pagehide && !s.pagehide.persisted) return { code: 'quitte', texte: 'Page quittée ou rechargée (pagehide reçu) — probablement volontaire, mais Safari peut aussi recharger après un crash' };
  if (s.etat === 'arriere-plan') return { code: 'arriere', texte: `Interrompue en arrière-plan (${s.passages_arriere_plan} passage·s) — iOS a pu libérer l'onglet ou l'utilisateur l'a fermé : indéterminable` };
  return { code: 'crash', texte: `Crash probable au premier plan (dernier signe de vie ${d.t ?? '?'} s après le lancement)` };
}

// --- diagnostic détaillé
function diagnostic(s) {
  const L = s.snaps, d = L.at(-1) || {}, ev = (s.critiques || []).concat(s.ev || []), m = d.mem || {}, M = s.max || {}, out = [];
  out.push(`Mémoire au dernier instantané : JS ${m.js_mo === null || m.js_mo === undefined ? 'non mesurable (Safari)' : m.js_mo + ' Mo (mesuré)'} · géométries ${m.geo_mo} Mo (mesuré) · textures ~${m.tex_est_mo} Mo · cibles de rendu ~${m.rt_est_mo} Mo · total GPU estimé ~${m.gpu_est_mo} Mo (estimation, pas la VRAM réelle).`);
  out.push(`Maxima de la session : GPU estimé ${M.gpu_est_mo ?? '?'} Mo, géométries ${M.geo_mo ?? '?'} Mo, textures ~${M.tex_est_mo ?? '?'} Mo, ${M.tri_k ?? '?'}k triangles, ${M.appels ?? '?'} appels, pire image ${M.pire_ms ?? '?'} ms.`);
  if ((m.gpu_est_mo || 0) > 700) out.push('Charge mémoire graphique très élevée : sur iPhone, Safari ferme l\'onglet autour de 1 à 1,5 Go pour l\'ensemble de la page.');
  if (m.parts) out.push('Plus gros postes : ' + Object.entries(m.parts).slice(0, 4).map(([k, v]) => `${k} ${v} Mo`).join(', ') + '.');
  if (s.pics && s.pics.length) { const p = s.pics.at(-1); out.push(`Dernier pic à ${p.t} s : GPU estimé ${p.gpu_est}, triangles ${p.tri_k}k, pendant : ${p.pendant.slice(0, 3).join(' | ')}.`); }
  if (d.en_cours && d.en_cours.length) out.push('Étape(s) en cours au dernier instantané : ' + d.en_cours.join(' | ') + '.');
  if (s.en_cours && s.en_cours.length) out.push('Étape(s) jamais terminées : ' + s.en_cours.map(e => `${e.moteur}:${e.action} ${e.detail} (depuis ${e.t} s)`).join(' | ') + '.');
  if ((d.fps || 60) < 12) out.push(`Le jeu ramait fortement (${d.fps} im/s, pire image ${d.pire_ms} ms).`);
  for (const e of (s.critiques || []).filter(e => e.type === 'erreur' || e.type === 'promesse').slice(-2)) out.push('Erreur : ' + e.msg);
  if ((s.critiques || []).some(e => e.type === 'webgl' && /PERDU/.test(e.msg))) out.unshift('Le contexte WebGL a été perdu : le processeur graphique n\'avait plus assez de mémoire.');
  return out;
}

// --- comparaison par version du moteur
function parVersion(sessions) {
  const V = new Map();
  for (const s of sessions) { const v = s.moteur || '?'; if (!V.has(v)) V.set(v, { v, sessions: 0, crashs: 0, durees: [], gpu: [] }); const o = V.get(v); o.sessions++; if (s.fin === 'crash' || s.fin === 'gpu') o.crashs++; o.durees.push(s.duree_s); if (s.max && s.max.gpu_est_mo) o.gpu.push(s.max.gpu_est_mo); }
  const med = a => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null;
  return [...V.values()].map(o => ({ v: o.v, sessions: o.sessions, crashs: o.crashs, duree_mediane_s: med(o.durees), gpu_max_median_mo: med(o.gpu) }));
}

// --- rapport texte (aucune donnée personnelle : pas d'identifiant de compte, pas de stockage du navigateur)
function rapportTexte(c) {
  const d = c.snaps.at(-1) || {};
  return [`RAPPORT DE CRASH · moteur ${c.moteur} · fichiers ${c.version_fichiers}`, `Session ${c.id} · ${c.debut} · durée ${d.t ?? '?'} s · ${c.classe.texte}`, `Appareil : ${c.appareil.ua}`, `Écran ${c.appareil.ecran} ×${c.appareil.dpr} · RAM ${c.appareil.ram_go || '?'} Go · tactile ${c.appareil.tactile}`, `Sauvegarde lue depuis : ${c.source}`,
    'Diagnostic :', ...c.diag.map(x => ' - ' + x), 'Pics :', ...(c.pics || []).slice(-4).map(p => ' ' + JSON.stringify(p)), 'Dernières étapes des moteurs :', ...(c.etapes || []).slice(-15).map(e => ` ${e.t}s ${e.moteur} · ${e.action} ${e.detail} (${e.ms} ms)`),
    'Derniers instantanés :', ...c.snaps.slice(-5).map(s => ' ' + JSON.stringify(s)), 'Événements critiques :', ...(c.critiques || []).slice(-10).map(e => ` ${e.t}s ${e.type} : ${e.msg}`), 'Derniers événements :', ...(c.ev || []).slice(-15).map(e => ` ${e.t}s ${e.type} : ${e.msg}${e.n ? ' (×' + e.n + ')' : ''}`)].join('\n').replace(/```/g, "'''");
}
