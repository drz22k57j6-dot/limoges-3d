// Équipes : nom, identité (couleur, emblème, devise), description et QG unique (un vrai bâtiment).
// Stockage : base en ligne si configurée (Supabase, contraintes d'unicité côté serveur), sinon ce téléphone uniquement.
(() => {
  const C = window.CARTE, $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COLORS = ['#ff3b30', '#ff9f0a', '#ffd60a', '#30d158', '#00c7be', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#a2845e', '#ffffff', '#1c1c1e'];
  const EMBLEMS = ['🦁', '🐺', '🦅', '🐉', '🦂', '🐍', '🦈', '🐻', '🦊', '🐗', '⚡', '🔥', '👑', '⚔️', '🛡️', '💎', '🏰', '⭐', '🌙', '☠️'];
  const CFG = window.EQUIPES_CONFIG || null; // { url, key } de Supabase
  let teams = [], mine = null, picking = false;

  // ---------- stockage ----------
  const local = {
    async list() { try { return JSON.parse(localStorage.getItem('equipes') || '[]'); } catch (e) { return []; } },
    async save(t) { const l = await this.list(); const i = l.findIndex(x => x.id === t.id); if (i >= 0) l[i] = t; else l.push(t); localStorage.setItem('equipes', JSON.stringify(l)); return t; },
  };
  const remote = CFG && {
    h: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    async list() { const r = await fetch(CFG.url + '/rest/v1/equipes?select=*', { headers: this.h }); if (!r.ok) throw new Error('lecture ' + r.status); return (await r.json()).map(fromRow); },
    async save(t) {
      const r = await fetch(CFG.url + '/rest/v1/equipes' + (t._saved ? '?id=eq.' + t.id : ''), { method: t._saved ? 'PATCH' : 'POST', headers: this.h, body: JSON.stringify(toRow(t)) });
      if (r.status === 409) { const e = await r.text(); throw new Error(/qg/.test(e) ? 'Ce bâtiment est déjà le QG d\'une autre équipe.' : 'Ce nom d\'équipe est déjà pris.'); }
      if (!r.ok) throw new Error('enregistrement ' + r.status); return fromRow((await r.json())[0]);
    },
  };
  const toRow = t => ({ id: t.id, nom: t.nom, couleur: t.couleur, embleme: t.embleme, devise: t.devise, description: t.description, qg_id: t.qg?.id || null, qg_lat: t.qg?.lat ?? null, qg_lon: t.qg?.lon ?? null, qg_adresse: t.qg?.adresse || null });
  const fromRow = r => ({ id: r.id, nom: r.nom, couleur: r.couleur, embleme: r.embleme, devise: r.devise, description: r.description, qg: r.qg_id ? { id: r.qg_id, lat: r.qg_lat, lon: r.qg_lon, adresse: r.qg_adresse } : null, _saved: true });
  // Base sur GitHub : lecture du fichier data/equipes.json, écriture par une issue « [EQUIPE] » validée par un robot GitHub Actions.
  const REPO = 'drz22k57j6-dot/limoges-3d';
  const github = {
    async list() {
      const r = await fetch('https://raw.githubusercontent.com/' + REPO + '/main/data/equipes.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('lecture ' + r.status);
      const online = (await r.json()).equipes.map(t => ({ ...t, _saved: true }));
      // demandes envoyées depuis ce téléphone pas encore validées par le robot
      const pend = (await local.list()).filter(t => t._pending && !online.some(o => o.id === t.id && o.maj >= t._pending));
      return online.concat(pend.filter(p => !online.some(o => o.id === p.id)));
    },
    async save(t) {
      const body = 'Demande envoyée depuis la carte de Limoges. Ne pas modifier le bloc ci-dessous.\n\n```json\n' + JSON.stringify(toJSON(t), null, 1) + '\n```';
      const url = 'https://github.com/' + REPO + '/issues/new?' + new URLSearchParams({ title: '[EQUIPE] ' + t.nom, body });
      window.open(url, '_blank');
      const p = { ...toJSON(t), _pending: new Date().toISOString() }; await local.save(p);
      return p;
    },
  };
  const toJSON = t => ({ id: t.id, nom: t.nom, couleur: t.couleur, embleme: t.embleme, devise: t.devise, description: t.description, qg: t.qg });
  const store = remote || github;
  async function refresh() {
    try { teams = await store.list(); } catch (e) { teams = await local.list(); }
    try { const id = localStorage.getItem('mon_equipe'); mine = teams.find(t => t.id === id) || null; } catch (e) {}
    drawHQ(); C.restyle();
  }

  // ---------- interface ----------
  const css = document.createElement('style');
  css.textContent = `#eqBtn{position:fixed;right:10px;top:calc(64px + env(safe-area-inset-top));z-index:1000;background:rgba(17,20,26,.9);color:#fff;border:0;font:700 14px -apple-system,sans-serif;padding:9px 16px;border-radius:20px;box-shadow:0 4px 14px #0007}
#eqPanel{position:fixed;inset:0;z-index:1300;background:#0d1117f2;display:none;overflow:auto;padding:calc(16px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));color:#eee;font:15px/1.4 -apple-system,sans-serif}
#eqPanel.on{display:block}#eqPanel h2{margin:4px 0 12px;font-size:22px}
#eqPanel label{display:block;color:#9aa6b8;font-size:13px;margin:12px 0 5px}
#eqPanel input,#eqPanel textarea{width:100%;font:16px -apple-system,sans-serif;padding:11px;border-radius:12px;border:1px solid #2f3b50;background:#0a0e14;color:#fff}
#eqPanel textarea{min-height:90px;resize:vertical}
.eqRow{display:flex;flex-wrap:wrap;gap:8px}.eqRow button{width:40px;height:40px;border-radius:50%;border:3px solid transparent;cursor:pointer;font-size:22px;background:#1b2230}.eqRow button.on{border-color:#ffd60a}
.eqBtnP{display:block;width:100%;margin-top:14px;padding:14px;border:0;border-radius:14px;font:800 16px -apple-system,sans-serif;background:#ffd60a;color:#111}
.eqBtnS{display:block;width:100%;margin-top:10px;padding:12px;border:1px solid #2f3b50;border-radius:14px;font:600 15px -apple-system,sans-serif;background:none;color:#fff}
.eqCard{display:flex;gap:12px;align-items:center;background:#161c26;border-radius:14px;padding:12px;margin:8px 0;border-left:6px solid}
.eqCard .em{font-size:30px}.eqCard b{display:block;font-size:16px}.eqCard small{color:#9aa6b8}
.eqHQ{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;border:3px solid #fff;font-size:20px;box-shadow:0 3px 10px #000a}
.eqErr{color:#ff6b6b;margin-top:8px}.eqNote{color:#7d889a;font-size:12px;margin-top:14px}
#eqPick{position:fixed;left:50%;transform:translateX(-50%);top:calc(56px + env(safe-area-inset-top));z-index:1000;background:#ffd60a;color:#111;font:700 14px -apple-system,sans-serif;padding:9px 14px;border-radius:14px;display:none;text-align:center}`;
  document.head.appendChild(css);
  document.body.insertAdjacentHTML('beforeend', `<button id="eqBtn">👥 Équipes</button><div id="eqPick">Reste appuyé 3 s sur le bâtiment de ton QG<br><u id="eqPickCancel">annuler</u></div><div id="eqPanel"></div>`);
  $('eqBtn').onclick = () => openList();
  $('eqPickCancel').onclick = () => { picking = false; $('eqPick').style.display = 'none'; openForm(); };
  const close = () => $('eqPanel').classList.remove('on');
  const badge = t => `<span class="em">${t.embleme}</span>`;

  function openList() {
    const p = $('eqPanel'); p.classList.add('on');
    p.innerHTML = `<button class="eqBtnS" id="eqX" style="width:auto;float:right;margin:0">Fermer</button><h2>Équipes</h2>
      ${mine ? `<label>Mon équipe</label>${card(mine)}<button class="eqBtnS" id="eqEdit">Modifier mon équipe</button>` : '<button class="eqBtnP" id="eqNew">Créer mon équipe</button>'}
      <label>Toutes les équipes (${teams.length})</label>${teams.filter(t => t !== mine).map(card).join('') || '<div class="eqNote">Aucune autre équipe pour l\'instant.</div>'}
      <div class="eqNote">Base partagée sur GitHub : chaque nom et chaque QG est unique, vérifié par le robot de la base. Une équipe « en attente » est validée en 1 à 2 minutes.</div>`;
    $('eqX').onclick = close;
    if ($('eqNew')) $('eqNew').onclick = () => openForm(null);
    if ($('eqEdit')) $('eqEdit').onclick = () => openForm(mine);
    p.querySelectorAll('[data-go]').forEach(el => (el.onclick = () => { const t = teams.find(x => x.id === el.dataset.go); if (t?.qg) { close(); C.map.setView([t.qg.lat, t.qg.lon], 18); } }));
  }
  const card = t => `<div class="eqCard" style="border-color:${t.couleur}" data-go="${t.id}">${badge(t)}<div><b>${esc(t.nom)}</b><small>${esc(t.devise || '')}</small><br><small>${t.qg ? '🏠 QG : ' + esc(t.qg.adresse || 'bâtiment choisi') : 'Pas encore de QG'}</small>${t._pending ? '<br><small style="color:#ffb547">⏳ en attente de validation</small>' : ''}</small>${t.description ? `<div style="font-size:13px;margin-top:4px">${esc(t.description)}</div>` : ''}</div></div>`;

  let draft = null;
  function openForm(t) {
    if (t !== undefined) draft = t ? { ...t } : { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)), nom: '', couleur: COLORS[Math.floor(Math.random() * 10)], embleme: EMBLEMS[Math.floor(Math.random() * EMBLEMS.length)], devise: '', description: '', qg: null };
    const p = $('eqPanel'); p.classList.add('on');
    p.innerHTML = `<button class="eqBtnS" id="eqX" style="width:auto;float:right;margin:0">Fermer</button><h2>${draft._saved || teams.some(x => x.id === draft.id) ? 'Modifier' : 'Créer'} mon équipe</h2>
      <label>Nom de l'équipe</label><input id="eqNom" maxlength="24" value="${esc(draft.nom)}" placeholder="Les Aurenciens">
      <label>Couleur</label><div class="eqRow" id="eqCol">${COLORS.map(c => `<button data-c="${c}" style="background:${c}" class="${c === draft.couleur ? 'on' : ''}"></button>`).join('')}</div>
      <label>Emblème</label><div class="eqRow" id="eqEm">${EMBLEMS.map(e => `<button data-e="${e}" class="${e === draft.embleme ? 'on' : ''}">${e}</button>`).join('')}</div>
      <label>Devise (ton identité en une phrase)</label><input id="eqDev" maxlength="60" value="${esc(draft.devise)}" placeholder="Le quartier d'abord">
      <label>Description</label><textarea id="eqDesc" maxlength="300" placeholder="Qui vous êtes, ce que vous voulez faire de la ville…">${esc(draft.description)}</textarea>
      <label>QG (un vrai bâtiment, unique)</label>
      <div>${draft.qg ? '🏠 ' + esc(draft.qg.adresse || draft.qg.id) : '<span class="eqNote">Aucun QG choisi</span>'}</div>
      <button class="eqBtnS" id="eqPickBtn">${draft.qg ? 'Changer de QG' : 'Choisir le QG sur la carte'}</button>
      <button class="eqBtnP" id="eqSave">Enregistrer l'équipe</button><div class="eqNote">GitHub va s'ouvrir avec ta demande déjà remplie : touche « Submit new issue ». Il faut un compte GitHub (gratuit).</div><div class="eqErr" id="eqErr"></div>`;
    const keep = () => { draft.nom = $('eqNom').value.trim(); draft.devise = $('eqDev').value.trim(); draft.description = $('eqDesc').value.trim(); };
    $('eqX').onclick = close;
    p.querySelectorAll('#eqCol button').forEach(b => (b.onclick = () => { keep(); draft.couleur = b.dataset.c; openForm(); }));
    p.querySelectorAll('#eqEm button').forEach(b => (b.onclick = () => { keep(); draft.embleme = b.dataset.e; openForm(); }));
    $('eqPickBtn').onclick = () => { keep(); picking = true; close(); $('eqPick').style.display = 'block'; };
    $('eqSave').onclick = async () => {
      keep(); const err = m => ($('eqErr').textContent = m);
      if (draft.nom.length < 2) return err('Choisis un nom d\'au moins 2 caractères.');
      if (teams.some(x => x.id !== draft.id && x.nom.toLowerCase() === draft.nom.toLowerCase())) return err('Ce nom d\'équipe est déjà pris.');
      if (!draft.qg) return err('Choisis ton QG sur la carte.');
      const owner = teams.find(x => x.id !== draft.id && x.qg?.id === draft.qg.id); if (owner) return err(`Ce bâtiment est déjà le QG de « ${owner.nom} ».`);
      try { const saved = await store.save(draft); localStorage.setItem('mon_equipe', saved.id); await refresh(); openList(); if (saved._pending) setTimeout(refresh, 90000); }
      catch (e) { err(e.message); }
    };
  }

  // ---------- fiche bâtiment : QG ----------
  window.EQ = {
    hqOf: id => teams.find(t => t.qg?.id === id) || null,
    cardExtra(f, info) { // appelé par la fiche du bâtiment
      const id = f.properties.identifiants_rnb || f.properties.cleabs, owner = this.hqOf(id), box = document.createElement('div');
      if (owner) box.innerHTML = `<div class="eqCard" style="border-color:${owner.couleur};margin-top:12px">${badge(owner)}<div><b>QG de ${esc(owner.nom)}</b><small>${esc(owner.devise || '')}</small></div></div>`;
      else if (picking) {
        const ok = ['Habitation', 'Commerce / services', 'Habitation + commerce', 'Industrie', 'Sport', 'Non précisé'].includes(info.type);
        box.innerHTML = ok ? `<button class="eqBtnP" id="eqHere">🏠 Installer le QG de « ${esc(draft?.nom || 'mon équipe')} » ici</button>` : '<div class="eqErr">Une annexe (garage, abri) ne peut pas être un QG.</div>';
        setTimeout(() => { const b = $('eqHere'); if (b) b.onclick = () => { draft.qg = { id, lat: info.lat, lon: info.lon, adresse: info.adresse() }; picking = false; $('eqPick').style.display = 'none'; $('card').classList.remove('on'); openForm(); }; });
      }
      return box;
    },
  };

  // ---------- QG sur la carte ----------
  let hqLayer = L.layerGroup().addTo(C.map);
  function drawHQ() {
    hqLayer.clearLayers();
    for (const t of teams) if (t.qg) L.marker([t.qg.lat, t.qg.lon], { icon: L.divIcon({ className: '', html: `<div class="eqHQ" style="background:${t.couleur}">${t.embleme}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] }), title: 'QG de ' + t.nom, interactive: false }).addTo(hqLayer);
  }
  refresh();
})();
