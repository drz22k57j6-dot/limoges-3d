// Agent du drone : on lui parle dans une conversation, il pilote le drone, photographie les bâtiments et tient
// un tableau des résultats (bâtiment, adresse, identifiant IGN, photos).
// - Sans clé : il comprend les ordres simples (« photographie 10 rue de Rivoli », « scanne les monuments »,
//   « arrête », « tableau », « reprends la mission »).
// - Avec une clé API Claude (facultative, saisie dans le jeu, gardée dans ce navigateur seulement) : conversation libre,
//   il décide lui-même quoi faire avec les mêmes outils.
// Monuments : Wikidata (lieux de Paris protégés au titre du patrimoine), classés du plus connu au moins connu
// d'après le nombre de Wikipédia qui ont un article sur eux. Positions : Wikidata, sinon géocodeur IGN.

const MODEL = 'claude-sonnet-5-5';
const WD_QUERY = `SELECT ?item ?label ?sl ?coord WHERE {
  ?item wdt:P1435 ?heritage; wdt:P131+ wd:Q90; wdt:P625 ?coord; wikibase:sitelinks ?sl.
  ?item rdfs:label ?label FILTER(LANG(?label) = "fr")
} ORDER BY DESC(?sl) LIMIT 400`;
// secours si Wikidata est inaccessible : grands monuments, géocodés par l'IGN
const FALLBACK = ['Tour Eiffel', 'Cathédrale Notre-Dame de Paris', 'Musée du Louvre', 'Arc de Triomphe', 'Basilique du Sacré-Cœur', 'Panthéon', 'Hôtel des Invalides', 'Opéra Garnier', 'Centre Pompidou', 'Sainte-Chapelle', 'Musée d\'Orsay', 'Place de la Concorde', 'Hôtel de Ville de Paris', 'Grand Palais', 'Petit Palais', 'Conciergerie', 'Palais du Luxembourg', 'Église de la Madeleine', 'Pont Neuf', 'Colonne de Juillet'];

export function initAgent(A) {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ST = { mission: null, running: false, stop: false, hist: [], key: (() => { try { return localStorage.getItem('agent_cle_claude') || ''; } catch (e) { return ''; } })() };
  try { ST.mission = JSON.parse(localStorage.getItem('agent_mission') || 'null'); } catch (e) {}

  // ------------------------------------------------------------- interface
  const css = document.createElement('style'); css.textContent = `
  #agB{position:fixed;z-index:9;top:calc(10px + env(safe-area-inset-top));right:calc(58px + env(safe-area-inset-right));height:36px;padding:0 13px 0 10px;border-radius:18px;border:1px solid rgba(255,255,255,.16);background:rgba(16,18,22,.42);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);color:#fff;font:600 13px/1 -apple-system,'SF Pro Text',Arial,sans-serif;display:none;align-items:center;gap:7px;cursor:pointer}
  .flying #agB{display:flex} #agB i{width:8px;height:8px;border-radius:4px;background:#8e8e93} #agB.run i{background:#30d158;box-shadow:0 0 8px #30d158}
  #ag{position:fixed;z-index:31;top:0;right:0;bottom:0;width:min(400px,100vw);display:none;flex-direction:column;background:rgba(18,20,24,.94);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-left:1px solid rgba(255,255,255,.1);color:#fff;font-family:-apple-system,'SF Pro Text','Helvetica Neue',Arial,sans-serif}
  #ag.on{display:flex}
  #ag header{display:flex;align-items:center;gap:10px;padding:calc(12px + env(safe-area-inset-top)) 14px 10px;border-bottom:1px solid rgba(255,255,255,.08)}
  #ag header b{flex:1;font:600 16px/1.2 inherit} #ag header b small{display:block;font-weight:400;font-size:12px;opacity:.55;margin-top:2px}
  #ag header button{border:0;background:rgba(255,255,255,.1);color:#fff;border-radius:14px;padding:7px 11px;font:600 12px/1 inherit;cursor:pointer}
  #agLog{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
  .agm{max-width:86%;padding:9px 12px;border-radius:16px;font:400 14px/1.4 inherit;white-space:pre-wrap;word-wrap:break-word}
  .agm.me{align-self:flex-end;background:#0a84ff;border-bottom-right-radius:5px} .agm.bot{align-self:flex-start;background:rgba(255,255,255,.1);border-bottom-left-radius:5px}
  .agm.sys{align-self:center;background:none;opacity:.55;font-size:12px;padding:2px}
  #agChips{display:flex;gap:6px;padding:0 14px 8px;overflow-x:auto} #agChips button{flex:none;border:1px solid rgba(255,255,255,.18);background:none;color:#fff;border-radius:15px;padding:7px 11px;font:500 12px/1 inherit;cursor:pointer}
  #agIn{display:flex;gap:8px;padding:8px 12px calc(10px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.08)}
  #agIn input{flex:1;height:38px;border-radius:19px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;padding:0 14px;font:400 15px/1 inherit;outline:none}
  #agIn button{width:38px;height:38px;border-radius:19px;border:0;background:#0a84ff;color:#fff;font:700 16px/1 inherit;cursor:pointer}
  #agTab{position:fixed;inset:0;z-index:32;display:none;background:#000;color:#fff;overflow:auto;font-family:-apple-system,'SF Pro Text','Helvetica Neue',Arial,sans-serif}
  #agTab.on{display:block}
  #agTab header{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;padding:calc(12px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 12px calc(16px + env(safe-area-inset-left));background:rgba(0,0,0,.8);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);font:600 17px/1 inherit;z-index:2}
  #agTab header button{border:0;background:none;color:#ffd60a;font:500 16px/1 inherit;cursor:pointer}
  #agTab table{width:100%;border-collapse:collapse;font:400 13px/1.35 inherit}
  #agTab th{position:sticky;top:52px;background:#111;text-align:left;font-weight:600;font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.8;padding:8px 10px}
  #agTab td{padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.07);vertical-align:top}
  #agTab td.ph{display:flex;gap:4px;flex-wrap:wrap} #agTab td.ph img{width:72px;height:54px;object-fit:cover;border-radius:4px;cursor:pointer}
  #agTab td code{font:500 11px/1.3 ui-monospace,Menlo,monospace;opacity:.75}
  #agTab .st{font-size:12px;opacity:.7}`;
  document.head.appendChild(css);
  document.body.insertAdjacentHTML('beforeend', `<button id="agB"><i></i>Agent</button>
  <div id="ag"><header><b>Agent drone<small id="agSub">prêt</small></b><button id="agTabB">Tableau</button><button id="agKeyB">Clé</button><button id="agX">✕</button></header>
  <div id="agLog"></div><div id="agChips"><button data-c="scanne les monuments">Scanner les monuments</button><button data-c="reprends la mission">Reprendre</button><button data-c="arrête">Arrêter</button><button data-c="état">État</button><button data-c="tableau">Tableau</button></div>
  <div id="agIn"><input id="agQ" placeholder="Parle à l'agent…" enterkeyhint="send"><button id="agGo">↑</button></div></div>
  <div id="agTab"><header><button id="agTabX">Fermer</button><span>Bâtiments photographiés</span><span id="agTabN" style="opacity:.6;font-size:13px;font-weight:500"></span></header><table><thead><tr><th>Bâtiment</th><th>Adresse</th><th>Photos</th></tr></thead><tbody id="agRows"></tbody></table></div>`);
  for (const el of [$('agB'), $('ag'), $('agTab')]) for (const ev of ['touchstart', 'pointerdown', 'mousedown']) el.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  addEventListener('keydown', e => { if (document.activeElement === $('agQ')) e.stopPropagation(); }, true);
  $('agB').onclick = () => { $('ag').classList.add('on'); if (!$('agLog').children.length) hello(); setTimeout(() => $('agQ').focus(), 50); };
  $('agX').onclick = () => $('ag').classList.remove('on');
  $('agTabB').onclick = openTable; $('agTabX').onclick = () => $('agTab').classList.remove('on');
  $('agChips').onclick = e => { const b = e.target.closest('button'); if (b) send(b.dataset.c); };
  $('agGo').onclick = () => send($('agQ').value); $('agQ').addEventListener('keydown', e => { if (e.key === 'Enter') send($('agQ').value); });
  $('agKeyB').onclick = () => {
    const k = prompt('Clé API Claude (facultative). Elle reste dans ce navigateur et sert uniquement à parler à l\'agent librement. Laisse vide pour la retirer.', ST.key || '');
    if (k === null) return; ST.key = k.trim(); try { ST.key ? localStorage.setItem('agent_cle_claude', ST.key) : localStorage.removeItem('agent_cle_claude'); } catch (e) {}
    say('sys', ST.key ? 'Clé enregistrée : conversation libre activée.' : 'Sans clé : ordres simples uniquement.');
  };
  function say(who, t) { const d = document.createElement('div'); d.className = 'agm ' + who; d.textContent = t; $('agLog').appendChild(d); $('agLog').scrollTop = 1e9; return d; }
  function sub(t) { $('agSub').textContent = t; $('agB').classList.toggle('run', ST.running); }
  function hello() {
    say('bot', 'Je pilote le drone pour toi. Dis-moi par exemple :\n• « photographie 10 rue de Rivoli »\n• « scanne les monuments » (du plus connu au moins connu)\n• « arrête », « reprends la mission », « tableau »' + (ST.key ? '' : '\n\nAvec une clé API Claude (bouton Clé), tu peux aussi me parler librement.'));
    if (ST.mission && ST.mission.i < ST.mission.list.length) say('sys', `Mission en pause : ${ST.mission.i}/${ST.mission.list.length} monuments faits. « reprends la mission » pour continuer.`);
  }

  // ------------------------------------------------------------- outils
  const geocode = async (q, index = 'address') => {
    const r = await fetch(`https://data.geopf.fr/geocodage/search?index=${index}&limit=1&lat=48.8566&lon=2.3522&q=` + encodeURIComponent(/paris/i.test(q) ? q : q + ' Paris'));
    const d = await r.json(); const f = (d.features || [])[0];
    return f && /^75/.test(f.properties.postcode || (f.properties.postcode && f.properties.postcode[0]) || '75') ? f : null;
  };
  async function photographier(lieu, nom) {
    let f = typeof lieu === 'object' ? lieu : (await geocode(lieu)) || (await geocode(lieu, 'poi'));
    if (!f) return { ok: false, erreur: 'adresse introuvable à Paris' };
    if (nom) f = { ...f, properties: { ...f.properties, nom } };
    if (!f.properties.label) f.properties.label = nom || lieu;
    if (A.mode() !== 'plane') return { ok: false, erreur: 'le drone n\'est pas en vol' };
    sub('en vol · ' + (nom || f.properties.label));
    const r = await A.photo.shootAddress(f);
    return { ok: (r && r.photos) > 0, ...r };
  }
  async function monuments() {
    try {
      const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(WD_QUERY), { headers: { Accept: 'application/sparql-results+json' } });
      const d = await r.json(), seen = new Set(), out = [];
      for (const b of d.results.bindings) {
        const id = b.item.value.split('/').pop(); if (seen.has(id)) continue; seen.add(id);
        const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value); if (!m) continue;
        out.push({ nom: b.label.value, wikidata: id, notoriete: +b.sl.value, lon: +m[1], lat: +m[2] });
      }
      if (out.length) return { source: 'Wikidata (classement : nombre de Wikipédia)', list: out };
    } catch (e) { console.warn('wikidata', e); }
    return { source: 'liste de secours (géocodeur IGN)', list: FALLBACK.map(n => ({ nom: n })) };
  }
  async function runMission() {
    if (ST.running) return; ST.running = true; ST.stop = false; sub('mission en cours');
    const M = ST.mission;
    while (M.i < M.list.length && !ST.stop) {
      const m = M.list[M.i];
      say('sys', `${M.i + 1}/${M.list.length} · ${m.nom}`);
      let f = null;
      if (m.lon != null) f = { geometry: { type: 'Point', coordinates: [m.lon, m.lat] }, properties: { label: m.nom, nom: m.nom } };
      else { const g = await geocode(m.nom, 'poi') || await geocode(m.nom); if (g) f = { ...g, properties: { ...g.properties, label: g.properties.label || m.nom, nom: m.nom } }; }
      let r = f ? await photographier(f, m.nom) : { ok: false, erreur: 'position introuvable' };
      m.resultat = r.ok ? `${r.photos} photo${r.photos > 1 ? 's' : ''}` : (r.annule ? 'interrompu' : r.erreur || 'échec');
      if (r.annule) { say('bot', `Mission en pause sur ${m.nom} (tu as repris les commandes).`); break; }
      say('bot', (r.ok ? '✅ ' : '⚠️ ') + m.nom + ' — ' + m.resultat);
      M.i++; save();
    }
    ST.running = false; sub(M.i >= M.list.length ? 'mission terminée' : 'en pause');
    if (M.i >= M.list.length) say('bot', `Mission terminée : ${M.list.filter(m => /photo/.test(m.resultat || '')).length} monuments photographiés. Ouvre le tableau pour voir les photos.`);
  }
  function save() { try { localStorage.setItem('agent_mission', JSON.stringify(ST.mission)); } catch (e) {} }
  async function startMonuments(n) {
    say('sys', 'Recherche des monuments de Paris…');
    const { source, list } = await monuments();
    const L = list.filter(m => m.lon == null || A.inCityLL(m.lon, m.lat)).slice(0, n || list.length);
    ST.mission = { type: 'monuments', source, i: 0, list: L, debut: Date.now() }; save();
    say('bot', `${L.length} monuments à photographier, du plus connu au moins connu (${source}). Premier : ${L[0] ? L[0].nom : '—'}. C'est parti.`);
    runMission();
  }
  function stop() { ST.stop = true; if (A.photo.AUTO.active) A.photo.stopAuto('Arrêt demandé'); sub('à l\'arrêt'); }
  function etat() {
    const M = ST.mission; const a = A.photo.AUTO;
    return M ? `Mission ${M.type} : ${M.i}/${M.list.length}${ST.running ? ' (en cours' + (a.active ? ', ' + (a.nom || a.label) : '') + ')' : ' (en pause)'}` : (a.active ? 'En vol vers ' + a.label : 'Au repos, aucune mission.');
  }

  // ------------------------------------------------------------- tableau des résultats
  async function openTable() {
    const P = await A.photo.allPhotos(); const G = new Map();
    for (const p of P) { if (p.vue === 'Manuelle' && !p.nom) continue; const k = p.ign || p.nom || p.adresse; let g = G.get(k); if (!g) G.set(k, g = { nom: p.nom, adresse: p.adresse, ign: p.ign, photos: [] }); g.photos.push(p); if (!g.nom && p.nom) g.nom = p.nom; }
    const urls = []; $('agRows').innerHTML = ''; $('agTabN').textContent = G.size + ' bâtiment' + (G.size > 1 ? 's' : '');
    for (const g of G.values()) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><b>${esc(g.nom || g.adresse || 'Bâtiment')}</b><br><code>${esc(g.ign || 'identifiant IGN non lu')}</code></td><td>${esc(g.adresse)}<div class="st">${new Date(g.photos[0].date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></td><td class="ph"></td>`;
      for (const p of g.photos.slice(0, 6)) { const u = URL.createObjectURL(p.thumb); urls.push(u); const im = document.createElement('img'); im.src = u; im.title = p.vue; im.onclick = () => { $('agTab').classList.remove('on'); A.photo.openPhoto(p); }; tr.lastChild.appendChild(im); }
      $('agRows').appendChild(tr);
    }
    if (!G.size) $('agRows').innerHTML = '<tr><td colspan="3" style="padding:40px;text-align:center;opacity:.6">Aucun bâtiment photographié par l\'agent pour l\'instant.</td></tr>';
    $('agTab').classList.add('on');
  }

  // ------------------------------------------------------------- compréhension
  async function send(t) {
    t = (t || '').trim(); if (!t) return; $('agQ').value = ''; say('me', t);
    const n = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/^(stop|arrete|arret|pause)/.test(n)) { stop(); say('bot', 'Arrêté. « reprends la mission » pour continuer.'); return; }
    if (/tableau|resultat/.test(n)) { openTable(); return; }
    if (/^(etat|statut|ou en es|status)/.test(n)) { say('bot', etat()); return; }
    if (/repren|continue/.test(n) && ST.mission) { say('bot', 'Je reprends.'); runMission(); return; }
    if (/monument/.test(n) && /(scan|photo|tous|fais|lance|va|commence)/.test(n)) { const m = /(\d+)/.exec(n); startMonuments(m ? +m[1] : 0); return; }
    if (ST.key) return llm(t);
    const m = /^(?:photographie|photographier|prends en photo|scanne|va (?:a|au|voir)|vas (?:a|au)|filme)\s+(.+)$/i.exec(t.normalize('NFC'));
    if (m) { say('bot', 'J\'y vais : ' + m[1]); const r = await photographier(m[1]); say('bot', r.ok ? `✅ ${r.photos} photo${r.photos > 1 ? 's' : ''} dans la pellicule.` : '⚠️ ' + (r.annule ? 'interrompu' : r.erreur)); sub('prêt'); return; }
    say('bot', 'Je n\'ai pas compris. Essaie « photographie 10 rue de Rivoli », « scanne les monuments », « arrête » ou « tableau ».' + (ST.key ? '' : ' Pour une conversation libre, ajoute une clé API Claude (bouton Clé).'));
  }

  // conversation libre avec Claude (outils = mêmes actions que ci-dessus)
  const TOOLS = [
    { name: 'photographier', description: 'Envoie le drone photographier un bâtiment à Paris (adresse ou nom de lieu). Le drone vole au-dessus des toits, cadre la façade et prend 4 photos (façade, deux trois-quarts, vue aérienne). Attend la fin.', input_schema: { type: 'object', properties: { lieu: { type: 'string' }, nom: { type: 'string', description: 'nom du bâtiment ou du monument, si connu' } }, required: ['lieu'] } },
    { name: 'scanner_monuments', description: 'Lance la mission : photographier les monuments protégés de Paris du plus connu au moins connu (Wikidata). Démarre en arrière-plan.', input_schema: { type: 'object', properties: { nombre: { type: 'integer', description: 'nombre maximum de monuments, 0 = tous' } } } },
    { name: 'reprendre_mission', description: 'Reprend la mission en pause.', input_schema: { type: 'object', properties: {} } },
    { name: 'arreter', description: 'Arrête le drone et met la mission en pause.', input_schema: { type: 'object', properties: {} } },
    { name: 'etat', description: 'État du drone et de la mission.', input_schema: { type: 'object', properties: {} } },
    { name: 'resultats', description: 'Liste des bâtiments déjà photographiés (nom, adresse, identifiant IGN, nombre de photos).', input_schema: { type: 'object', properties: {} } },
  ];
  async function tool(name, inp) {
    if (name === 'photographier') return await photographier(inp.lieu, inp.nom);
    if (name === 'scanner_monuments') { startMonuments(inp.nombre || 0); return { lance: true }; }
    if (name === 'reprendre_mission') { if (!ST.mission) return { erreur: 'aucune mission' }; runMission(); return { repris: true }; }
    if (name === 'arreter') { stop(); return { arrete: true }; }
    if (name === 'etat') return { etat: etat() };
    if (name === 'resultats') { const P = await A.photo.allPhotos(); const G = {}; for (const p of P) { const k = p.ign || p.adresse; (G[k] ||= { nom: p.nom, adresse: p.adresse, ign: p.ign, photos: 0 }).photos++; } return Object.values(G).slice(0, 80); }
    return { erreur: 'outil inconnu' };
  }
  async function llm(t) {
    ST.hist.push({ role: 'user', content: t }); const wait = say('bot', '…');
    try {
      for (let turn = 0; turn < 8; turn++) {
        const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': ST.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: MODEL, max_tokens: 800, tools: TOOLS, messages: ST.hist,
            system: 'Tu es l\'agent qui pilote un drone photo dans une reproduction 3D de Paris (données IGN). Tu réponds en français, très court. Tu utilises les outils pour agir. Tu ne dis jamais qu\'une photo est prise tant que l\'outil ne l\'a pas confirmé.' }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error ? d.error.message : r.status);
        ST.hist.push({ role: 'assistant', content: d.content });
        const txt = d.content.filter(c => c.type === 'text').map(c => c.text).join('\n'); if (txt) { wait.textContent = txt; }
        const uses = d.content.filter(c => c.type === 'tool_use'); if (!uses.length) break;
        const res = []; for (const u of uses) { say('sys', '→ ' + u.name + (u.input.lieu ? ' : ' + u.input.lieu : '')); res.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(await tool(u.name, u.input)) }); }
        ST.hist.push({ role: 'user', content: res });
      }
    } catch (e) { wait.textContent = 'Erreur de l\'API Claude : ' + e.message; ST.hist.pop(); }
    if (ST.hist.length > 40) ST.hist = ST.hist.slice(-30).filter((m, i) => i || m.role === 'user');
    sub(ST.running ? 'mission en cours' : 'prêt');
  }
  return { send, openTable, startMonuments, stop, ST };
}
