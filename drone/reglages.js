// Interface épurée du drone : à l'écran seulement les manches, la vitesse en km/h et un bouton Réglages.
// Le panneau Réglages regroupe tout : vitesse max, aller à une adresse (géocodeur IGN, sans IA),
// monuments et lieux connus (téléportation en un clic), caméra, affichage et autres options du jeu.

const MONUMENTS = [
  // [nom, latitude, longitude, distance de vue (m), hauteur de vue (m)]
  ['Tour Eiffel', 48.85837, 2.29448, 520, 150], ['Arc de Triomphe', 48.87378, 2.29504, 220, 60],
  ['Notre-Dame', 48.85296, 2.34990, 230, 70], ['Sacré-Cœur', 48.88672, 2.34308, 240, 70],
  ['Louvre – Pyramide', 48.86106, 2.33584, 300, 80], ['Musée d\'Orsay', 48.85997, 2.32656, 260, 60],
  ['Panthéon', 48.84622, 2.34640, 230, 70], ['Les Invalides', 48.85502, 2.31258, 300, 80],
  ['Opéra Garnier', 48.87197, 2.33160, 230, 60], ['Place de la Concorde', 48.86546, 2.32112, 260, 60],
  ['Hôtel de Ville', 48.85641, 2.35222, 240, 60], ['Centre Pompidou', 48.86064, 2.35223, 220, 60],
  ['Tour Montparnasse', 48.84211, 2.32199, 450, 130], ['Grand Palais', 48.86613, 2.31248, 280, 70],
  ['Petit Palais', 48.86603, 2.31477, 200, 50], ['Pont Alexandre III', 48.86385, 2.31352, 200, 40],
  ['Colonne de la Bastille', 48.85321, 2.36914, 180, 50], ['Opéra Bastille', 48.85219, 2.37029, 220, 60],
  ['Sainte-Chapelle', 48.85544, 2.34502, 160, 50], ['Conciergerie', 48.85600, 2.34560, 200, 50],
  ['Place des Vosges', 48.85561, 2.36549, 200, 50], ['Trocadéro – Chaillot', 48.86200, 2.28777, 280, 70],
  ['Palais du Luxembourg', 48.84841, 2.33719, 260, 60], ['La Madeleine', 48.87005, 2.32450, 180, 50],
  ['Place Vendôme', 48.86752, 2.32941, 200, 60], ['Pont Neuf', 48.85718, 2.34129, 180, 40],
  ['Saint-Sulpice', 48.85107, 2.33476, 200, 60], ['Saint-Eustache', 48.86340, 2.34509, 200, 60],
  ['Les Halles – Canopée', 48.86222, 2.34603, 200, 50], ['Tour Saint-Jacques', 48.85805, 2.34890, 140, 50],
  ['Moulin Rouge', 48.88409, 2.33227, 130, 30], ['Champs-Élysées', 48.86921, 2.30973, 250, 50],
  ['Place de la République', 48.86744, 2.36330, 200, 50], ['Canal Saint-Martin', 48.87107, 2.36575, 180, 40],
  ['Galeries Lafayette', 48.87376, 2.33204, 180, 50], ['Institut de France', 48.85728, 2.33729, 180, 50],
  ['Pont des Arts', 48.85834, 2.33753, 160, 40], ['Jardin des Plantes', 48.84228, 2.35620, 260, 60],
  ['Grande Mosquée', 48.84196, 2.35519, 160, 40], ['Gare du Nord', 48.88094, 2.35532, 260, 60],
  ['Gare de Lyon', 48.84433, 2.37431, 260, 70], ['Gare Saint-Lazare', 48.87622, 2.32533, 240, 60],
  ['Bibliothèque F.-Mitterrand', 48.83346, 2.37572, 320, 90], ['Accor Arena (Bercy)', 48.83864, 2.37859, 240, 60],
  ['Père-Lachaise', 48.86139, 2.39330, 300, 70], ['La Villette – Géode', 48.89567, 2.38811, 220, 50],
  ['Parc des Princes', 48.84144, 2.25303, 300, 80], ['Roland-Garros', 48.84589, 2.24924, 300, 80],
  ['Château de Vincennes', 48.84279, 2.43586, 260, 70], ['Buttes-Chaumont', 48.88094, 2.38277, 260, 60],
];

const PROXY = [
  ['Caméra', [['dpShut', 'Prendre une photo'], ['dpVid', 'Vidéo (début / fin)'], ['dpRoll', 'Pellicule'], ['bPip', null], ['bCam', null]]],
  ['Affichage', [['bTime', null], ['bQ', null], ['bId', null], ['bIdCol', null], ['bVille', null]]],
  ['Autres', [['dpMenuB', 'Agent et tableau des bâtiments'], ['bFoot', null], ['bReset', 'Stabiliser le drone']]],
];

const css = `
html.flying .btns,html.flying #dpTop,html.flying #dpRight,html.flying #speedo,html.flying #street,html.flying #didCount,html.flying #mapwrap{display:none!important}
html.flying.rg-map #mapwrap{display:block!important}
#rgKmh,#rgBtn{display:none}
html.flying #rgKmh,html.flying #rgBtn{display:flex}
#rgKmh{position:fixed;z-index:30;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top));align-items:baseline;gap:5px;padding:6px 14px;border-radius:16px;background:rgba(10,12,16,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;font:700 26px/1 -apple-system,'SF Pro Display',Arial,sans-serif;pointer-events:none;font-variant-numeric:tabular-nums}
#rgKmh small{font:600 12px/1 -apple-system,Arial,sans-serif;opacity:.75}
#rgBtn{position:fixed;z-index:30;right:calc(14px + env(safe-area-inset-right));top:calc(10px + env(safe-area-inset-top));width:48px;height:48px;border-radius:24px;border:1px solid rgba(255,255,255,.2);background:rgba(10,12,16,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;align-items:center;justify-content:center;cursor:pointer}
#rgP{position:fixed;z-index:60;inset:0;display:none;background:rgba(0,0,0,.35);font-family:-apple-system,'SF Pro Text',Arial,sans-serif;color:#fff}
#rgP.on{display:block}
#rgP *,#rgKmh,#rgBtn{box-sizing:border-box}
#rgS{position:absolute;right:0;top:0;bottom:0;width:min(440px,100%);background:rgba(20,22,26,.96);overflow-y:auto;-webkit-overflow-scrolling:touch;padding:calc(12px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) 16px}
#rgS header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
#rgS h2{font-size:22px;margin:0}
#rgS h3{font-size:13px;font-weight:600;text-transform:none;opacity:.6;margin:18px 0 8px}
#rgX{width:44px;height:44px;border-radius:22px;border:0;background:rgba(255,255,255,.12);color:#fff;font-size:20px;cursor:pointer}
.rgSeg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.rgSeg button,.rgList button,.rgMon button{min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:#fff;font:600 14px/1.2 inherit;cursor:pointer;padding:8px 10px;text-align:left}
.rgSeg button{text-align:center;font-size:15px}
.rgSeg button.on{background:#ff6a1a;border-color:#ff6a1a}
.rgList{display:grid;gap:6px}
.rgMon{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.rgMon button{font-weight:500;font-size:13px}
#rgQ{width:100%;height:46px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:16px inherit;padding:0 14px;outline:none}
#rgQ:focus{border-color:#ff6a1a}
#rgSug{display:grid;gap:4px;margin-top:6px}
#rgSug button{min-height:44px;border-radius:10px;border:0;background:rgba(255,255,255,.06);color:#fff;text-align:left;padding:8px 12px;font:500 14px/1.25 inherit;cursor:pointer}
#rgSug small{display:block;opacity:.55;font-size:12px}
.rgLens{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:6px}
`;

function init(D) {
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = id => document.getElementById(id);

  const kmh = document.createElement('div'); kmh.id = 'rgKmh'; kmh.innerHTML = '<b>0</b><small>km/h</small>'; document.body.appendChild(kmh);
  const btn = document.createElement('button'); btn.id = 'rgBtn'; btn.setAttribute('aria-label', 'Réglages');
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  document.body.appendChild(btn);

  const P = document.createElement('div'); P.id = 'rgP';
  P.innerHTML = `<div id="rgS"><header><h2>Réglages</h2><button id="rgX" aria-label="Fermer">✕</button></header>
  <h3>Vitesse maximale</h3><div class="rgSeg" id="rgSpd">${D.modes.map((v, i) => `<button data-m="${i}">${v} km/h</button>`).join('')}</div>
  <h3>Aller à une adresse</h3><input id="rgQ" placeholder="Adresse ou monument à Paris…" autocomplete="off" enterkeyhint="go"><div id="rgSug"></div>
  <h3>Monuments et lieux connus</h3><div class="rgMon">${MONUMENTS.map((m, i) => `<button data-i="${i}">${esc(m[0])}</button>`).join('')}</div>
  <h3>Objectif</h3><div class="rgLens" id="rgLens"><button data-l="0">0,5×</button><button data-l="1">1×</button><button data-l="2">2×</button></div>
  ${PROXY.map(([t, items]) => `<h3>${t}</h3><div class="rgList">${items.map(([id, l]) => `<button data-p="${id}" data-l="${esc(l || '')}"></button>`).join('')}${t === 'Affichage' ? '<button id="rgMap"></button>' : ''}</div>`).join('')}
  </div>`;
  document.body.appendChild(P);
  // le jeu ne doit pas recevoir les touchers ni les touches tapées dans le panneau
  for (const ev of ['touchstart', 'touchmove', 'pointerdown', 'mousedown', 'wheel']) P.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  for (const el of [btn]) for (const ev of ['touchstart', 'pointerdown', 'mousedown']) el.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  $('rgQ').addEventListener('keydown', e => e.stopPropagation());

  const lensSel = () => { const on = document.querySelector('#dpLens button.on'); return on ? +on.dataset.i : -1; };
  function refresh() {
    P.querySelectorAll('#rgSpd button').forEach(b => b.classList.toggle('on', +b.dataset.m === D.speed()));
    const L = lensSel(); P.querySelectorAll('#rgLens button').forEach(b => b.classList.toggle('on', +b.dataset.l === L));
    P.querySelectorAll('[data-p]').forEach(b => { const t = $(b.dataset.p); b.style.display = t ? '' : 'none'; if (t) b.textContent = b.dataset.l || (t.textContent || '').trim() || b.dataset.p; });
    $('rgMap').textContent = document.documentElement.classList.contains('rg-map') ? 'Masquer la mini-carte' : 'Afficher la mini-carte';
  }
  const open = () => { refresh(); P.classList.add('on'); }, close = () => { P.classList.remove('on'); $('rgQ').blur(); };
  btn.onclick = open; $('rgX').onclick = close; P.addEventListener('click', e => { if (e.target === P) close(); });
  P.querySelectorAll('#rgSpd button').forEach(b => b.onclick = () => { D.setSpeed(+b.dataset.m); D.toast('Vitesse max : ' + D.modes[D.speed()] + ' km/h'); refresh(); });
  P.querySelectorAll('#rgLens button').forEach(b => b.onclick = () => { const t = document.querySelector(`#dpLens button[data-i="${b.dataset.l}"]`); if (t) t.click(); setTimeout(refresh, 60); });
  P.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { const t = $(b.dataset.p); if (!t) return; if (['dpRoll', 'dpMenuB'].includes(b.dataset.p)) close(); t.click(); setTimeout(refresh, 80); });
  $('rgMap').onclick = () => { document.documentElement.classList.toggle('rg-map'); refresh(); };

  const goMonument = i => { const m = MONUMENTS[i], [x, z] = D.ll(m[2], m[1]); close(); D.teleport(x, z, { nom: m[0], dist: m[3], alt: m[4] }); };
  P.querySelectorAll('.rgMon button').forEach(b => b.onclick = () => goMonument(+b.dataset.i));

  // recherche : monuments de la liste + adresses (géocodeur IGN), téléportation directe
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let T = 0, AB = null;
  $('rgQ').addEventListener('input', () => { clearTimeout(T); T = setTimeout(suggest, 220); });
  $('rgQ').addEventListener('keydown', e => { if (e.key === 'Enter') { const f = $('rgSug').firstChild; if (f) f.click(); } });
  async function suggest() {
    const q = $('rgQ').value.trim(), box = $('rgSug'); box.innerHTML = ''; if (q.length < 2) return;
    const mons = MONUMENTS.map((m, i) => [m, i]).filter(([m]) => norm(m[0]).includes(norm(q))).slice(0, 4);
    for (const [m, i] of mons) { const b = document.createElement('button'); b.innerHTML = `${esc(m[0])}<small>Monument</small>`; b.onclick = () => goMonument(i); box.appendChild(b); }
    if (q.length < 3) return;
    if (AB) AB.abort(); AB = new AbortController();
    try {
      const r = await fetch('https://data.geopf.fr/geocodage/search?index=address&limit=6&lat=48.8566&lon=2.3522&q=' + encodeURIComponent(/paris/i.test(q) ? q : q + ' Paris'), { signal: AB.signal });
      const d = await r.json(), F = (d.features || []).filter(f => /^75/.test(f.properties.postcode || ''));
      for (const f of F) {
        const p = f.properties, b = document.createElement('button'); b.innerHTML = `${esc(p.name || p.label)}<small>${esc(p.postcode + ' ' + p.city)}</small>`;
        b.onclick = () => { const [lon, lat] = f.geometry.coordinates, [x, z] = D.ll(lon, lat); close(); D.teleport(x, z, { nom: p.label, dist: 70, alt: 30 }); };
        box.appendChild(b);
      }
      if (!F.length && !mons.length) box.innerHTML = '<small style="opacity:.6">Rien trouvé à Paris</small>';
    } catch (e) { if (e.name !== 'AbortError' && !mons.length) box.innerHTML = '<small style="opacity:.6">Recherche d\'adresse indisponible</small>'; }
  }

  const k = kmh.firstChild; let last = -1;
  (function loop() { const p = D.PL, v = Math.round(Math.hypot(p.vx || 0, p.vz || 0, p.vy || 0) * 3.6); if (v !== last) { k.textContent = v; last = v; } requestAnimationFrame(loop); })();
}

(function wait(n = 0) { if (window.__drone) init(window.__drone); else if (n < 600) setTimeout(() => wait(n + 1), 100); })();
