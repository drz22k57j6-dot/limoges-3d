// Boîte noire : trouver la cause de chaque crash (surtout iPhone, où Safari ferme l'onglet sans message).
// Toutes les 2 s, un instantané de l'état du jeu est écrit dans le stockage du navigateur (mémoire estimée,
// triangles, appels de dessin, images/s, position, moteur de façades, tuiles, dernières erreurs et étapes en cours).
// Au lancement suivant, si la session précédente ne s'est pas fermée proprement, on la classe en crash et on
// établit un diagnostic. Rapports : ⚙ → Crashs (copier, ou envoyer sur GitHub en un geste).
const K_SES = 'bn.session', K_CR = 'bn.crashs';
const lire = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const r1 = v => Math.round(v * 10) / 10;

export function demarrerBoiteNoire(opt) {
  const t0 = performance.now(), id = Date.now().toString(36);
  const ev = [], snaps = []; let etape = '', mem = { geo: 0, tex: 0, parts: {} }, fps = 0, frames = 0, lastF = performance.now(), dtMax = 0;
  const appareil = { ua: navigator.userAgent.slice(0, 160), dpr: devicePixelRatio, ecran: screen.width + '×' + screen.height, ram: navigator.deviceMemory || null, coeurs: navigator.hardwareConcurrency || null };

  // --- session précédente : propre ou crash ?
  const prev = lire(K_SES);
  if (prev && !prev.propre && prev.snaps && prev.snaps.length) {
    const L = lire(K_CR) || []; L.unshift({ ...prev, diag: diagnostic(prev) }); ecrire(K_CR, L.slice(0, 15));
  }
  const ses = { id, debut: new Date().toISOString(), appareil, propre: false, snaps, ev, version: opt.version || '' };

  // --- événements
  const note = (type, msg) => { ev.push({ t: r1((performance.now() - t0) / 1000), type, msg: String(msg).slice(0, 300) }); if (ev.length > 40) ev.shift(); };
  addEventListener('error', e => note('erreur', (e.message || e) + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')));
  addEventListener('unhandledrejection', e => note('promesse', e.reason && (e.reason.stack || e.reason.message) || e.reason));
  const ce = console.error.bind(console), cw = console.warn.bind(console);
  console.error = (...a) => { note('console.error', a.map(x => x && x.message || x).join(' ')); ce(...a); };
  console.warn = (...a) => { note('console.warn', a.map(x => x && x.message || x).join(' ')); cw(...a); };
  const cv = opt.renderer.domElement;
  cv.addEventListener('webglcontextlost', () => note('webgl', 'contexte WebGL PERDU (le GPU a lâché : trop de mémoire graphique)'));
  cv.addEventListener('webglcontextrestored', () => note('webgl', 'contexte WebGL restauré'));
  // départ / retour de l'onglet : une fermeture volontaire n'est pas un crash
  const propre = v => { ses.propre = v; ecrire(K_SES, ses); };
  addEventListener('pagehide', () => propre(true));
  document.addEventListener('visibilitychange', () => propre(document.visibilityState === 'hidden'));

  // --- mémoire estimée (parcours de la scène toutes les 8 s) : géométries + textures, par sous-système
  function mesurer() {
    const vus = new Set(), tex = new Set(), parts = {};
    let geo = 0, tx = 0;
    opt.scene.traverse(o => {
      if (!o.geometry && !o.material) return;
      let sys = 'autre'; for (let p = o; p; p = p.parent) { if (p.userData && p.userData.bnNom) { sys = p.userData.bnNom; break; } if (p.name === 'quartier_facades') { sys = 'façades'; break; } if (p.name === 'lampadaires') { sys = 'lampadaires'; break; } }
      const g = o.geometry; if (g && !vus.has(g)) { vus.add(g); let b = 0; for (const k in g.attributes) { const a = g.attributes[k]; b += (a.array ? a.array.byteLength : (a.data && a.data.array ? a.data.array.byteLength : 0)); } if (g.index) b += g.index.array.byteLength; geo += b; parts[sys] = (parts[sys] || 0) + b; }
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'aoMap', 'metalnessMap']) { const t = m[k]; if (!t || tex.has(t)) continue; tex.add(t); const im = t.image; if (!im) continue; const w = im.width || 0, h = im.height || 0; const b = w * h * 4 * 1.33; tx += b; parts['tex ' + sys] = (parts['tex ' + sys] || 0) + b; }
    });
    mem = { geo: geo / 1048576, tex: tx / 1048576, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, r1(v / 1048576)]).sort((a, b) => b[1] - a[1]).slice(0, 8)) };
  }

  function instantane() {
    const inf = opt.renderer.info, st = opt.etat ? safe(opt.etat) : {};
    const s = { t: r1((performance.now() - t0) / 1000), fps: Math.round(fps), pire_ms: Math.round(dtMax), tri_k: Math.round(inf.render.triangles / 1000), appels: inf.render.calls, geos: inf.memory.geometries, textures: inf.memory.textures, progs: inf.programs ? inf.programs.length : null,
      mo_geo: r1(mem.geo), mo_tex: r1(mem.tex), parts: mem.parts, tas: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, etape, ...st };
    snaps.push(s); if (snaps.length > 15) snaps.shift(); dtMax = 0;
    ecrire(K_SES, ses);
  }
  function safe(f) { try { return f(); } catch (e) { return { err: String(e) }; } }
  setInterval(mesurer, 8000); setTimeout(mesurer, 1500);
  setInterval(instantane, 2000);

  const api = {
    // appelée à chaque image (images/s, pire image)
    image() { const n = performance.now(), d = n - lastF; lastF = n; frames++; dtMax = Math.max(dtMax, d); if ((api._acc = (api._acc || 0) + d) > 1000) { fps = frames * 1000 / api._acc; frames = 0; api._acc = 0; } },
    // étape en cours d'un moteur (si l'onglet meurt pendant, on le saura)
    etape(s) { etape = String(s).slice(0, 120); },
    note,
    crashs: () => lire(K_CR) || [],
    effacer() { ecrire(K_CR, []); },
    session: () => ses,
    texte(c) { return rapportTexte(c); },
  };
  return api;
}

// --- diagnostic à partir des derniers instantanés
function diagnostic(s) {
  const L = s.snaps, d = L[L.length - 1] || {}, a = L[0] || d, ev = s.ev || [];
  const tot = (d.mo_geo || 0) + (d.mo_tex || 0), pente = L.length > 1 ? ((d.mo_geo + d.mo_tex) - (a.mo_geo + a.mo_tex)) / Math.max(1, d.t - a.t) : 0;
  const causes = [];
  if (ev.some(e => e.type === 'webgl' && /PERDU/.test(e.msg))) causes.push('Contexte WebGL perdu : le processeur graphique a manqué de mémoire.');
  if (tot > 700) causes.push(`Mémoire graphique très haute (${Math.round(tot)} Mo estimés ; iPhone : l'onglet est fermé vers 1 à 1,5 Go avec le reste du navigateur).`);
  else if (pente > 8) causes.push(`Mémoire en forte hausse juste avant (+${Math.round(pente)} Mo/s).`);
  const top = d.parts ? Object.entries(d.parts).slice(0, 3).map(([k, v]) => `${k} ${v} Mo`).join(', ') : '';
  if (top) causes.push('Plus gros consommateurs : ' + top + '.');
  if ((d.tri_k || 0) > 2500) causes.push(`Beaucoup de triangles à l'écran (${d.tri_k}k).`);
  if ((d.appels || 0) > 1500) causes.push(`Beaucoup d'appels de dessin (${d.appels}).`);
  if ((d.fps || 60) < 12) causes.push(`Le jeu ramait fort (${d.fps} im/s, pire image ${d.pire_ms} ms).`);
  if (d.etape) causes.push('Étape en cours au moment du crash : ' + d.etape + '.');
  const err = ev.filter(e => e.type === 'erreur' || e.type === 'promesse').slice(-2);
  for (const e of err) causes.push('Erreur juste avant : ' + e.msg);
  if (!causes.length) causes.push('Aucun signe clair : crash probablement mémoire côté Safari (rien d\'anormal mesuré).');
  return causes;
}

function rapportTexte(c) {
  const d = c.snaps[c.snaps.length - 1] || {};
  return [`CRASH ${c.debut} (durée ${d.t || '?'} s) · version ${c.version}`, `Appareil : ${c.appareil.ua}`, `Écran ${c.appareil.ecran} ×${c.appareil.dpr} · RAM ${c.appareil.ram || '?'} Go`,
    'Diagnostic :', ...c.diag.map(x => ' - ' + x), 'Derniers instantanés :', ...c.snaps.slice(-6).map(s => ' ' + JSON.stringify(s)), 'Derniers événements :', ...(c.ev || []).slice(-12).map(e => ` ${e.t}s ${e.type} : ${e.msg}`)].join('\n');
}
