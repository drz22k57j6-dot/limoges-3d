// Interface du drone : à l'écran seulement les manches, la vitesse (km/h) et le bouton Réglages.
// Le menu Réglages (façon jeu AAA, par onglets) rend TOUT réglable en direct et le mémorise :
// Lieux (téléportation sans IA), Drone, Caméra, Graphismes, Monde, Interface, Développeur.

const PLACES = {
  'Monuments': [
    ['Tour Eiffel', 48.85837, 2.29448, 520, 150], ['Arc de Triomphe', 48.87378, 2.29504, 220, 60], ['Notre-Dame', 48.85296, 2.34990, 230, 70],
    ['Sacré-Cœur', 48.88672, 2.34308, 240, 70], ['Panthéon', 48.84622, 2.34640, 230, 70], ['Les Invalides', 48.85502, 2.31258, 300, 80],
    ['Hôtel de Ville', 48.85641, 2.35222, 240, 60], ['Tour Montparnasse', 48.84211, 2.32199, 450, 130], ['Tour Saint-Jacques', 48.85805, 2.34890, 140, 50],
    ['Colonne de la Bastille', 48.85321, 2.36914, 180, 50], ['Arc du Carrousel', 48.86174, 2.33289, 150, 30], ['Obélisque de la Concorde', 48.86546, 2.32112, 200, 50],
    ['Institut de France', 48.85728, 2.33729, 180, 50], ['Conciergerie', 48.85600, 2.34560, 200, 50], ['Palais-Royal', 48.86375, 2.33710, 220, 50],
    ['Assemblée nationale', 48.86180, 2.31864, 220, 50], ['Palais de l\'Élysée', 48.87046, 2.31675, 200, 50], ['Bourse de Commerce', 48.86283, 2.34296, 180, 50],
  ],
  'Musées': [
    ['Louvre – Pyramide', 48.86106, 2.33584, 300, 80], ['Musée d\'Orsay', 48.85997, 2.32656, 260, 60], ['Centre Pompidou', 48.86064, 2.35223, 220, 60],
    ['Grand Palais', 48.86613, 2.31248, 280, 70], ['Petit Palais', 48.86603, 2.31477, 200, 50], ['Musée Rodin', 48.85532, 2.31581, 180, 40],
    ['Musée du quai Branly', 48.86092, 2.29784, 220, 50], ['Musée de l\'Orangerie', 48.86378, 2.32266, 160, 40], ['Musée Picasso', 48.85985, 2.36238, 150, 40],
    ['Palais de Tokyo', 48.86398, 2.29700, 200, 50], ['Cité des sciences – Géode', 48.89567, 2.38811, 260, 60], ['Fondation Louis Vuitton', 48.87665, 2.26346, 220, 60],
  ],
  'Églises et lieux de culte': [
    ['Sainte-Chapelle', 48.85544, 2.34502, 160, 50], ['La Madeleine', 48.87005, 2.32450, 180, 50], ['Saint-Sulpice', 48.85107, 2.33476, 200, 60],
    ['Saint-Eustache', 48.86340, 2.34509, 200, 60], ['Saint-Germain-des-Prés', 48.85391, 2.33433, 160, 50], ['Saint-Augustin', 48.87577, 2.31877, 200, 60],
    ['Église de la Trinité', 48.87656, 2.33169, 180, 50], ['Grande Mosquée de Paris', 48.84196, 2.35519, 160, 40],
  ],
  'Places, ponts et avenues': [
    ['Place de la Concorde', 48.86546, 2.32112, 260, 60], ['Place Vendôme', 48.86752, 2.32941, 200, 60], ['Place des Vosges', 48.85561, 2.36549, 200, 50],
    ['Place de la République', 48.86744, 2.36330, 200, 50], ['Place de la Bastille', 48.85321, 2.36914, 220, 60], ['Trocadéro – Chaillot', 48.86200, 2.28777, 280, 70],
    ['Place d\'Italie', 48.83102, 2.35570, 220, 50], ['Place de la Nation', 48.84816, 2.39570, 240, 60], ['Champs-Élysées', 48.86921, 2.30973, 250, 50],
    ['Pont Neuf', 48.85718, 2.34129, 180, 40], ['Pont Alexandre III', 48.86385, 2.31352, 200, 40], ['Pont des Arts', 48.85834, 2.33753, 160, 40],
    ['Pont de Bir-Hakeim', 48.85566, 2.28755, 200, 40], ['Pont de l\'Alma', 48.86277, 2.30154, 180, 40], ['Île Saint-Louis', 48.85190, 2.35716, 260, 60],
    ['Canal Saint-Martin', 48.87107, 2.36575, 180, 40],
  ],
  'Parcs et jardins': [
    ['Jardin des Tuileries', 48.86349, 2.32721, 280, 60], ['Jardin du Luxembourg', 48.84841, 2.33719, 280, 70], ['Champ de Mars', 48.85563, 2.29856, 300, 70],
    ['Jardin des Plantes', 48.84228, 2.35620, 260, 60], ['Buttes-Chaumont', 48.88094, 2.38277, 260, 60], ['Parc Monceau', 48.87969, 2.30904, 220, 50],
    ['Parc de la Villette', 48.89381, 2.39002, 300, 70], ['Parc André-Citroën', 48.84102, 2.27458, 260, 60], ['Père-Lachaise', 48.86139, 2.39330, 300, 70],
    ['Bois de Boulogne', 48.86220, 2.25990, 400, 100], ['Bois de Vincennes', 48.83300, 2.41400, 400, 100], ['Montmartre – Place du Tertre', 48.88654, 2.34076, 160, 50],
  ],
  'Gares': [
    ['Gare du Nord', 48.88094, 2.35532, 260, 60], ['Gare de l\'Est', 48.87675, 2.35925, 240, 60], ['Gare de Lyon', 48.84433, 2.37431, 260, 70],
    ['Gare Saint-Lazare', 48.87622, 2.32533, 240, 60], ['Gare Montparnasse', 48.84055, 2.31941, 260, 70], ['Gare d\'Austerlitz', 48.84253, 2.36488, 260, 60],
    ['Gare de Bercy', 48.83883, 2.38279, 220, 50],
  ],
  'Sport et spectacles': [
    ['Parc des Princes', 48.84144, 2.25303, 300, 80], ['Roland-Garros', 48.84589, 2.24924, 300, 80], ['Accor Arena (Bercy)', 48.83864, 2.37859, 240, 60],
    ['Stade Charléty', 48.81873, 2.34622, 260, 60], ['Opéra Garnier', 48.87197, 2.33160, 230, 60], ['Opéra Bastille', 48.85219, 2.37029, 220, 60],
    ['Philharmonie de Paris', 48.89186, 2.39375, 240, 60], ['Zénith Paris', 48.89394, 2.39312, 200, 50], ['Olympia', 48.87018, 2.32832, 140, 40],
    ['Moulin Rouge', 48.88409, 2.33227, 130, 30],
  ],
  'Quartiers et commerces': [
    ['Les Halles – Canopée', 48.86222, 2.34603, 200, 50], ['Galeries Lafayette', 48.87376, 2.33204, 180, 50], ['Le Marais', 48.85728, 2.35916, 200, 50],
    ['Quartier latin – Sorbonne', 48.84855, 2.34337, 200, 50], ['Belleville', 48.87211, 2.37698, 200, 50], ['Bibliothèque F.-Mitterrand', 48.83346, 2.37572, 320, 90],
    ['Château de Vincennes', 48.84279, 2.43586, 260, 70],
  ],
};

const css = `
html.flying .btns,html.flying #dpTop,html.flying #dpRight,html.flying #speedo,html.flying #street,html.flying #didCount,html.flying #mapwrap{display:none!important}
html.flying.rg-map #mapwrap{display:block!important}
html.rg-nokmh #rgKmh{display:none!important}
#rgKmh,#rgBtn,#rgFps{display:none}
html.flying #rgKmh,html.flying #rgBtn{display:flex}
html.flying.rg-fps #rgFps{display:block}
#rgKmh{position:fixed;z-index:30;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top));align-items:baseline;gap:5px;padding:6px 14px;border-radius:16px;background:rgba(10,12,16,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;font:700 26px/1 -apple-system,Arial,sans-serif;pointer-events:none;font-variant-numeric:tabular-nums}
#rgKmh small{font:600 12px/1 -apple-system,Arial,sans-serif;opacity:.75}
#rgFps{position:fixed;z-index:30;left:calc(10px + env(safe-area-inset-left));top:calc(10px + env(safe-area-inset-top));padding:5px 8px;border-radius:8px;background:rgba(0,0,0,.55);color:#7dffb2;font:600 11px/1.35 ui-monospace,Menlo,monospace;pointer-events:none;white-space:pre}
#rgBtn{position:fixed;z-index:30;right:calc(14px + env(safe-area-inset-right));top:calc(10px + env(safe-area-inset-top));width:48px;height:48px;border-radius:24px;border:1px solid rgba(255,255,255,.2);background:rgba(10,12,16,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;align-items:center;justify-content:center;cursor:pointer}
#rgP{position:fixed;z-index:60;inset:0;display:none;background:rgba(6,8,12,.94);color:#fff;font-family:-apple-system,'SF Pro Text',Arial,sans-serif}
#rgP.on{display:flex}
#rgP *{box-sizing:border-box}
#rgNav{flex:0 0 auto;width:min(190px,32vw);padding:calc(14px + env(safe-area-inset-top)) 8px 14px calc(10px + env(safe-area-inset-left));display:flex;flex-direction:column;gap:4px;border-right:1px solid rgba(255,255,255,.08);overflow-y:auto}
#rgNav h2{font-size:20px;margin:0 8px 10px}
#rgNav button{min-height:44px;border:0;border-radius:10px;background:transparent;color:rgba(255,255,255,.7);font:600 15px/1.1 inherit;text-align:left;padding:0 12px;cursor:pointer}
#rgNav button.on{background:#ff6a1a;color:#fff}
#rgBody{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:calc(14px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(28px + env(safe-area-inset-bottom)) 16px}
#rgHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
#rgHead h3{font-size:22px;margin:0}
#rgX{width:44px;height:44px;flex:0 0 44px;border-radius:22px;border:0;background:rgba(255,255,255,.12);color:#fff;font-size:20px;cursor:pointer}
.rgSec{font-size:13px;font-weight:600;opacity:.55;margin:18px 0 6px}
.rgRow{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:50px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)}
.rgRow>span{font-size:15px;flex:1}
.rgRow>span small,.rgSl>span small{display:block;font-size:12px;opacity:.5;margin-top:2px}
.rgSl{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:15px}
.rgSl output{font:600 14px/1 ui-monospace,Menlo,monospace;color:#ffb27d;text-align:right;align-self:center}
.rgSl input{grid-column:1/3;width:100%;height:32px;accent-color:#ff6a1a}
.rgSeg{display:flex;flex-wrap:wrap;gap:6px}
.rgSeg button,.rgBtn2,.rgGrid button,.rgSug button{min-height:44px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:#fff;font:600 14px/1.2 inherit;cursor:pointer;padding:6px 12px}
.rgSeg button.on{background:#ff6a1a;border-color:#ff6a1a}
.rgTog{position:relative;width:52px;height:32px;flex:0 0 52px;border-radius:16px;border:0;background:rgba(255,255,255,.18);cursor:pointer}
.rgTog::after{content:'';position:absolute;top:3px;left:3px;width:26px;height:26px;border-radius:13px;background:#fff;transition:left .15s}
.rgTog.on{background:#34c759}.rgTog.on::after{left:23px}
.rgGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.rgGrid button{text-align:left;font-weight:500;font-size:13px}
.rgCat{margin-top:6px;border-bottom:1px solid rgba(255,255,255,.06);padding-bottom:6px}
.rgCat summary{min-height:44px;display:flex;align-items:center;font:700 15px inherit;cursor:pointer;list-style:none}
.rgCat summary::-webkit-details-marker{display:none}
.rgCat summary::after{content:'›';margin-left:auto;opacity:.5;font-size:20px;transition:transform .15s}.rgCat[open] summary::after{transform:rotate(90deg)}
.rgIn{width:100%;height:46px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:16px inherit;padding:0 12px;outline:none}
.rgIn:focus{border-color:#ff6a1a}
.rgSug{display:grid;gap:4px;margin-top:6px}.rgSug button{text-align:left;font-weight:500}.rgSug small{display:block;opacity:.55;font-size:12px}
.rgPair{display:grid;grid-template-columns:1fr 1fr auto;gap:6px;margin-top:6px}
.rgInfo{font:12px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;background:rgba(255,255,255,.05);border-radius:10px;padding:10px;margin-top:6px}
@media (max-width:560px){#rgNav{width:118px;padding-left:calc(6px + env(safe-area-inset-left))}#rgNav button{font-size:13px;padding:0 8px}#rgNav h2{font-size:16px}}
`;

function init(D, X) {
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = id => document.getElementById(id), root = document.documentElement;
  const SK = 'reglages-dev-v1';
  let SAVE = {}; try { SAVE = JSON.parse(localStorage.getItem(SK) || '{}'); } catch (e) {}
  const persist = (k, v) => { SAVE[k] = v; try { localStorage.setItem(SK, JSON.stringify(SAVE)); } catch (e) {} };
  const safe = f => { try { return f(); } catch (e) { return null; } };

  // ----------------------------------------------------------- HUD minimal
  const kmh = document.createElement('div'); kmh.id = 'rgKmh'; kmh.innerHTML = '<b>0</b><small>km/h</small>'; document.body.appendChild(kmh);
  const fps = document.createElement('div'); fps.id = 'rgFps'; document.body.appendChild(fps);
  const btn = document.createElement('button'); btn.id = 'rgBtn'; btn.setAttribute('aria-label', 'Réglages');
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  document.body.appendChild(btn);

  // ----------------------------------------------------------- actions
  const click = id => { const t = $(id); if (t) t.click(); };
  const DR = X.DR, G = X.GIMBAL;
  const goPlace = p => { const [x, z] = D.ll(p[2], p[1]); closeP(); D.teleport(x, z, { nom: p[0], dist: p[3], alt: p[4] }); };
  const stickScale = v => { for (const id of ['dsL', 'dsR']) { const e = $(id); if (e) { e.style.scale = v; e.style.transformOrigin = id === 'dsL' ? 'left bottom' : 'right bottom'; } } };
  const stickAlpha = v => { const e = $('dsticks'); if (e) e.style.opacity = v; };
  const lensOn = () => { const b = document.querySelector('#dpLens button.on'); return b ? +b.dataset.i : 0; };

  // ----------------------------------------------------------- définition des réglages
  const seg = (k, label, opts, get, set, note) => ({ t: 'seg', k, label, opts, get, set, note });
  const sl = (k, label, min, max, step, get, set, fmt = v => v, note) => ({ t: 'sl', k, label, min, max, step, get, set, fmt, note });
  const tog = (k, label, get, set, note) => ({ t: 'tog', k, label, get, set, note });
  const act = (label, fn, note) => ({ t: 'act', label, fn, note });
  const sec = label => ({ t: 'sec', label });
  const cap = s => s.charAt(0) + s.slice(1).toLowerCase();

  const TABS = [
    { id: 'lieux', name: 'Lieux' },
    { id: 'drone', name: 'Drone', items: () => [
      sec('Préréglage'),
      seg(null, 'Vitesse max', [[0, '60 km/h'], [1, '300 km/h'], [2, '1500 km/h']], () => D.speed(), v => { D.setSpeed(v); persist('dr.vmax', DR.VMAX); persist('dr.vz', DR.VZ); persist('dr.yaw', DR.YAW); }),
      sec('Vol'),
      sl('dr.vmax', 'Vitesse horizontale max', 5 / 3.6, 2500 / 3.6, 5 / 3.6, () => DR.VMAX, v => DR.VMAX = v, v => Math.round(v * 3.6) + ' km/h'),
      sl('dr.vz', 'Vitesse de montée / descente', 1, 120, 1, () => DR.VZ, v => DR.VZ = v, v => Math.round(v) + ' m/s'),
      sl('dr.yaw', 'Vitesse de rotation', 0.3, 6, 0.05, () => DR.YAW, v => DR.YAW = v, v => Math.round(v * 57.3) + ' °/s'),
      sl('dr.acc', 'Accélération', 0.2, 10, 0.1, () => DR.ACC, v => DR.ACC = v, v => v.toFixed(1), 'Plus haut = démarre plus vite'),
      sl('dr.brake', 'Freinage (manche relâché)', 0.2, 12, 0.1, () => DR.BRAKE, v => DR.BRAKE = v, v => v.toFixed(1)),
      sl('dr.vacc', 'Réactivité verticale', 0.5, 12, 0.1, () => DR.VACC, v => DR.VACC = v, v => v.toFixed(1)),
      sl('dr.expo', 'Courbe expo des manches', 0, 0.95, 0.01, () => DR.EXPO, v => DR.EXPO = v, v => Math.round(v * 100) + ' %', 'Plus haut = plus précis au centre'),
      sl('dr.alt', 'Altitude max', 50, 3000, 10, () => DR.ALTMAX, v => DR.ALTMAX = v, v => Math.round(v) + ' m'),
      tog('dr.coll', 'Collisions avec les bâtiments', () => DR.COLL, v => DR.COLL = v),
      sec('Actions'),
      act('Stabiliser le drone', () => click('bReset')),
    ] },
    { id: 'cam', name: 'Caméra', items: () => [
      seg('cam.view', 'Plein écran', [['cam', 'Caméra du drone'], ['pilot', 'Vue pilote']], () => X.view(), v => X.setView(v)),
      seg('cam.dir', 'Orientation de la caméra', X.gimbalDirs.map((n, i) => [i, cap(n)]), () => G.i, v => X.setGimbal(v)),
      sl(null, 'Inclinaison de la caméra', -90, 30, 1, () => Math.round(G.dirs[G.i][2] * 57.3), v => X.setTilt(v), v => v + '°'),
      seg(null, 'Objectif', [[0, '0,5×'], [1, '1×'], [2, '2×']], lensOn, v => { const b = document.querySelector(`#dpLens button[data-i="${v}"]`); if (b) b.click(); }),
      sec('Prise de vue'),
      act('Prendre une photo', () => { closeP(); setTimeout(() => click('dpShut'), 150); }),
      act('Vidéo : démarrer / arrêter', () => { closeP(); click('dpVid'); }),
      act('Ouvrir la pellicule', () => { closeP(); click('dpRoll'); }),
      act('Retour caméra (petite fenêtre)', () => click('bPip')),
    ] },
    { id: 'gfx', name: 'Graphismes', items: () => [
      seg('gfx.preset', 'Préréglage', X.qualities.map((n, i) => [i, n]), () => X.quality(), v => X.setQuality(v), 'Remet les options de rendu aux valeurs du préréglage'),
      sec('Rendu'),
      sl('gfx.dpr', 'Résolution de rendu', 0.5, 3, 0.05, () => X.q().dpr, v => X.setDpr(v), v => '×' + v.toFixed(2)),
      sl('gfx.far', 'Distance d\'affichage', 400, 6000, 50, () => X.q().far, v => X.setFar(v), v => Math.round(v) + ' m'),
      tog('gfx.shadows', 'Ombres', () => X.shadows(), v => X.setShadows(v)),
      seg('gfx.shadowsize', 'Qualité des ombres', [[1024, 'Basse'], [2048, 'Haute'], [4096, 'Ultra']], () => X.q().shadow, v => X.setShadowSize(v)),
      tog('gfx.trees', 'Arbres', () => X.GFX.trees, v => X.setTrees(v)),
      tog('gfx.voirie', 'Voirie réelle (Plan de voirie de Paris)', () => X.GFX.voirie, v => X.setVoirie(v), 'Trottoirs, bordures et passages piétons aux vraies formes ; sinon routes estimées'),
      tog('gfx.facades', 'Façades détaillées (vrais bâtiments, 7e)', () => X.GFX.facades, v => X.setFacades(v), 'Immeubles habillés par le moteur de façades autour du drone : vraies hauteurs, vrais commerces'),
      sec('Post-traitement'),
      tog('gfx.post', 'Post-traitement', () => X.q().post, v => X.setPost(v), 'Nécessaire pour les réglages ci-dessous'),
      tog('gfx.ao', 'Occlusion ambiante (GTAO)', () => X.q().ao, v => X.setAo(v)),
      sl('gfx.bloom', 'Bloom', 0, 1.5, 0.01, () => X.bloom.s, v => X.setBloom(v), v => v.toFixed(2)),
      sl('gfx.sat', 'Saturation', 0.3, 1.8, 0.01, () => X.grade('sat'), v => X.setGrade('sat', v), v => v.toFixed(2)),
      sl('gfx.contrast', 'Contraste', 0.6, 1.5, 0.01, () => X.grade('contrast'), v => X.setGrade('contrast', v), v => v.toFixed(2)),
      sl('gfx.vig', 'Vignettage', 0, 1, 0.01, () => X.grade('vig'), v => X.setGrade('vig', v), v => v.toFixed(2)),
      sl('gfx.grain', 'Grain', 0, 0.08, 0.001, () => X.grade('grain'), v => X.setGrade('grain', v), v => v.toFixed(3)),
      sl('gfx.exp', 'Exposition', 0.2, 2.5, 0.01, () => X.exposure(), v => X.setExposure(v), v => v.toFixed(2)),
    ] },
    { id: 'monde', name: 'Monde', items: () => [
      seg('monde.type', 'Paris', [['3d', 'Paris 3D (IGN)'], ['photo', 'Paris photoréaliste']], () => X.world(), v => X.setWorld(v), 'Les deux ne se mélangent pas'),
      sec('Heure et soleil'),
      seg('monde.time', 'Moment', X.times.map((n, i) => [i, cap(n)]), () => X.time(), v => X.setTime(v)),
      sl('monde.elev', 'Hauteur du soleil', -12, 85, 1, () => X.sun().elev, v => X.setSun(v, X.sun().az), v => v + '°'),
      sl('monde.az', 'Direction du soleil', 0, 359, 1, () => X.sun().az, v => X.setSun(X.sun().elev, v), v => v + '°'),
    ] },
    { id: 'ui', name: 'Interface', items: () => [
      tog('ui.kmh', 'Vitesse (km/h) à l\'écran', () => !root.classList.contains('rg-nokmh'), v => root.classList.toggle('rg-nokmh', !v)),
      tog('ui.map', 'Mini-carte', () => root.classList.contains('rg-map'), v => root.classList.toggle('rg-map', v)),
      tog('ui.fps', 'Compteur FPS et infos', () => root.classList.contains('rg-fps'), v => root.classList.toggle('rg-fps', v)),
      act('Identifiants des bâtiments (afficher / masquer)', () => click('bId')),
      act('Couleurs des identifiants', () => click('bIdCol')),
      sec('Manches'),
      sl('ui.stick', 'Taille des manches', 0.6, 1.6, 0.05, () => SAVE['ui.stick'] ?? 1, v => stickScale(v), v => Math.round(v * 100) + ' %'),
      sl('ui.alpha', 'Opacité des manches', 0.15, 1, 0.05, () => SAVE['ui.alpha'] ?? 1, v => stickAlpha(v), v => Math.round(v * 100) + ' %'),
    ] },
    { id: 'dev', name: 'Développeur' },
  ];

  // ----------------------------------------------------------- panneau
  const P = document.createElement('div'); P.id = 'rgP';
  P.innerHTML = `<nav id="rgNav"><h2>Réglages</h2>${TABS.map(t => `<button data-t="${t.id}">${t.name}</button>`).join('')}</nav>
    <div id="rgBody"><div id="rgHead"><h3 id="rgTitle"></h3><button id="rgX" aria-label="Fermer">✕</button></div><div id="rgC"></div></div>`;
  document.body.appendChild(P);
  for (const ev of ['touchstart', 'touchmove', 'pointerdown', 'mousedown', 'wheel', 'keydown', 'keyup']) P.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  for (const ev of ['touchstart', 'pointerdown', 'mousedown']) btn.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  let tab = 'lieux', devT = 0;
  function openP() { P.classList.add('on'); show(tab); }
  function closeP() { P.classList.remove('on'); clearInterval(devT); }
  btn.onclick = openP; $('rgX').onclick = closeP;
  P.querySelectorAll('#rgNav button').forEach(b => b.onclick = () => show(b.dataset.t));

  function show(id) {
    tab = id; clearInterval(devT);
    const T = TABS.find(t => t.id === id); $('rgTitle').textContent = T.name;
    P.querySelectorAll('#rgNav button').forEach(b => b.classList.toggle('on', b.dataset.t === id));
    const C = $('rgC'); C.innerHTML = ''; $('rgBody').scrollTop = 0;
    if (id === 'lieux') return showPlaces(C);
    if (id === 'dev') return showDev(C);
    for (const it of T.items()) C.appendChild(control(it));
  }

  function control(it) {
    const el = document.createElement('div');
    const note = it.note ? `<small>${esc(it.note)}</small>` : '';
    if (it.t === 'sec') { el.className = 'rgSec'; el.textContent = it.label; return el; }
    if (it.t === 'act') { el.className = 'rgRow'; el.innerHTML = `<span>${esc(it.label)}${note}</span>`; const b = document.createElement('button'); b.className = 'rgBtn2'; b.textContent = 'OK'; b.onclick = () => it.fn(); el.appendChild(b); return el; }
    if (it.t === 'tog') {
      el.className = 'rgRow'; el.innerHTML = `<span>${esc(it.label)}${note}</span>`; const b = document.createElement('button'); b.className = 'rgTog'; b.setAttribute('aria-label', it.label);
      const paint = () => b.classList.toggle('on', !!safe(it.get)); paint();
      b.onclick = () => { const v = !safe(it.get); safe(() => it.set(v)); if (it.k) persist(it.k, v); paint(); }; el.appendChild(b); return el;
    }
    if (it.t === 'seg') {
      el.style.cssText = 'padding:8px 0 12px;border-bottom:1px solid rgba(255,255,255,.06)';
      el.innerHTML = `<div style="font-size:15px;margin-bottom:8px">${esc(it.label)}${it.note ? `<small style="display:block;font-size:12px;opacity:.5">${esc(it.note)}</small>` : ''}</div>`;
      const g = document.createElement('div'); g.className = 'rgSeg';
      const paint = () => { const cur = safe(it.get); g.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(b.dataset.v) === String(cur))); };
      for (const [v, l] of it.opts) {
        const b = document.createElement('button'); b.dataset.v = v; b.textContent = l;
        b.onclick = () => {
          safe(() => it.set(v));
          if (it.k === 'gfx.preset') { for (const k of Object.keys(SAVE)) if (/^gfx\.(dpr|far|shadowsize|post|ao)$/.test(k)) delete SAVE[k]; persist('gfx.preset', v); setTimeout(() => show(tab), 30); return; }
          if (it.k) persist(it.k, v); paint(); if (!it.k || it.k === 'cam.dir' || it.k === 'monde.time') setTimeout(() => show(tab), 30);
        };
        g.appendChild(b);
      }
      el.appendChild(g); paint(); return el;
    }
    if (it.t === 'sl') {
      el.className = 'rgSl'; const v0 = +safe(it.get) || 0;
      el.innerHTML = `<span>${esc(it.label)}${note}</span><output>${esc(it.fmt(v0))}</output><input type="range" min="${it.min}" max="${it.max}" step="${it.step}" value="${v0}">`;
      const inp = el.querySelector('input'), out = el.querySelector('output');
      inp.oninput = () => { const v = +inp.value; safe(() => it.set(v)); out.textContent = it.fmt(v); if (it.k) persist(it.k, v); };
      return el;
    }
    return el;
  }

  // ----------------------------------------------------------- Lieux
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ALL = Object.entries(PLACES).flatMap(([c, l]) => l.map(p => [...p, c]));
  function showPlaces(C) {
    C.innerHTML = `<details class="rgCat" open><summary>Rues test — moteur de façades</summary><div class="rgGrid"><button data-rt="7e">Rue haussmannienne 7e</button><button data-rt="16e">Avenue riche 16e</button><button data-rt="19e">Rue faubourienne 19e</button><button data-rc="1">Vraie rue Cler (7e réel)</button></div></details>
      <input class="rgIn" id="rgQ" placeholder="Adresse ou lieu à Paris…" autocomplete="off" enterkeyhint="go"><div class="rgSug" id="rgSug"></div>
      ${Object.entries(PLACES).map(([c, l], i) => `<details class="rgCat"${i === 0 ? ' open' : ''}><summary>${esc(c)}<span style="opacity:.45;font-weight:500;margin-left:8px">${l.length}</span></summary><div class="rgGrid">${l.map((p, j) => `<button data-c="${esc(c)}" data-j="${j}">${esc(p[0])}</button>`).join('')}</div></details>`).join('')}`;
    C.querySelectorAll('.rgGrid button[data-c]').forEach(b => b.onclick = () => goPlace(PLACES[b.dataset.c][+b.dataset.j]));
    C.querySelectorAll('button[data-rt]').forEach(b => b.onclick = () => { closeP(); D.rueTest && D.rueTest(b.dataset.rt); });
    C.querySelectorAll('button[data-rc]').forEach(b => b.onclick = () => { closeP(); D.rueCler && D.rueCler(); });
    let T = 0, AB = null; const q = $('rgQ'), box = $('rgSug');
    q.addEventListener('input', () => { clearTimeout(T); T = setTimeout(suggest, 220); });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = box.querySelector('button'); if (f) f.click(); } });
    async function suggest() {
      const s = q.value.trim(); box.innerHTML = ''; if (s.length < 2) return;
      const hits = ALL.filter(p => norm(p[0]).includes(norm(s))).slice(0, 5);
      for (const p of hits) { const b = document.createElement('button'); b.innerHTML = `${esc(p[0])}<small>${esc(p[5])}</small>`; b.onclick = () => goPlace(p); box.appendChild(b); }
      if (s.length < 3) return;
      if (AB) AB.abort(); AB = new AbortController();
      try {
        const r = await fetch('https://data.geopf.fr/geocodage/search?index=address&limit=6&lat=48.8566&lon=2.3522&q=' + encodeURIComponent(/paris/i.test(s) ? s : s + ' Paris'), { signal: AB.signal });
        const d = await r.json(), F = (d.features || []).filter(f => /^75/.test(f.properties.postcode || ''));
        for (const f of F) { const p = f.properties, b = document.createElement('button'); b.innerHTML = `${esc(p.name || p.label)}<small>${esc(p.postcode + ' ' + p.city)}</small>`; b.onclick = () => { const [lon, lat] = f.geometry.coordinates; goPlace([p.label, lat, lon, 70, 30]); }; box.appendChild(b); }
        if (!F.length && !hits.length) box.innerHTML = '<small style="opacity:.6">Rien trouvé à Paris</small>';
      } catch (e) { if (e.name !== 'AbortError' && !hits.length) box.innerHTML = '<small style="opacity:.6">Recherche d\'adresse indisponible</small>'; }
    }
  }

  // ----------------------------------------------------------- Développeur
  function showDev(C) {
    C.innerHTML = `<div class="rgSec">En direct</div><div class="rgInfo" id="rgDevInfo"></div>
      <div class="rgSec">Téléporter</div>
      <div class="rgPair"><input class="rgIn" id="rgTx" inputmode="decimal" placeholder="x (est, m)"><input class="rgIn" id="rgTz" inputmode="decimal" placeholder="z (−nord, m)"><button class="rgBtn2" id="rgTgo">Aller</button></div>
      <div class="rgPair"><input class="rgIn" id="rgTlat" inputmode="decimal" placeholder="latitude"><input class="rgIn" id="rgTlon" inputmode="decimal" placeholder="longitude"><button class="rgBtn2" id="rgTgo2">Aller</button></div>`;
    for (const it of [
      sec('Outils'),
      tog('dev.wire', 'Fil de fer (wireframe)', () => !!SAVE['dev.wire'], v => X.wire(v)),
      tog('ui.fps', 'Compteur FPS à l\'écran', () => root.classList.contains('rg-fps'), v => root.classList.toggle('rg-fps', v)),
      act('Copier la position', () => { const p = X.pos(); if (navigator.clipboard) navigator.clipboard.writeText(`x=${p.x.toFixed(1)} z=${p.z.toFixed(1)} alt=${(p.y - p.sol).toFixed(1)} L93=${p.X.toFixed(1)},${p.Y.toFixed(1)}`).then(() => D.toast('Position copiée'), () => {}); }),
      act('Agent et tableau des bâtiments', () => { closeP(); click('dpMenuB'); }),
      act('Enregistrer une vidéo du jeu', () => { closeP(); click('bRec'); }),
      sec('Réinitialiser'),
      act('Remettre tous les réglages par défaut', () => { try { localStorage.removeItem(SK); } catch (e) {} location.reload(); }, 'Recharge le jeu'),
    ]) C.appendChild(control(it));
    $('rgTgo').onclick = () => { const x = parseFloat($('rgTx').value), z = parseFloat($('rgTz').value); if (isFinite(x) && isFinite(z)) { closeP(); D.teleport(x, z, { nom: `x ${x}, z ${z}`, dist: 0, alt: 40 }); } };
    $('rgTgo2').onclick = () => { const la = parseFloat($('rgTlat').value), lo = parseFloat($('rgTlon').value); if (isFinite(la) && isFinite(lo)) goPlace([`${la}, ${lo}`, la, lo, 0, 40]); };
    const info = () => { const i = safe(X.info) || {}, p = safe(X.pos); if (!p) return; $('rgDevInfo').textContent = `FPS ${FPS}  ·  ${i.calls} draw calls  ·  ${Math.round((i.tris || 0) / 1000)} k triangles\ngéométries ${i.geo}  ·  textures ${i.tex}\nx ${p.x.toFixed(1)}  z ${p.z.toFixed(1)}  y ${p.y.toFixed(1)}  sol ${p.sol.toFixed(1)}  alt ${(p.y - p.sol).toFixed(1)} m\nLambert-93 ${p.X.toFixed(1)} , ${p.Y.toFixed(1)}\nvitesse ${Math.round(Math.hypot(D.PL.vx || 0, D.PL.vz || 0) * 3.6)} km/h  ·  max ${Math.round(DR.VMAX * 3.6)} km/h`; };
    info(); devT = setInterval(info, 500);
  }

  // ----------------------------------------------------------- boucle HUD
  const k = kmh.firstChild; let last = -1, FPS = 0, fr = 0, ft = performance.now();
  (function loop(now) {
    const p = D.PL, v = Math.round(Math.hypot(p.vx || 0, p.vz || 0, p.vy || 0) * 3.6); if (v !== last) { k.textContent = v; last = v; }
    fr++; if (now - ft > 500) { FPS = Math.round(fr * 1000 / (now - ft)); fr = 0; ft = now; if (root.classList.contains('rg-fps')) { const i = safe(X.info) || {}; fps.textContent = `${FPS} FPS\n${i.calls} appels · ${Math.round((i.tris || 0) / 1000)} k tri`; } }
    requestAnimationFrame(loop);
  })(performance.now());

  // ----------------------------------------------------------- réglages mémorisés, appliqués une fois Paris chargé
  const applySaved = () => {
    if ('gfx.preset' in SAVE) safe(() => X.setQuality(SAVE['gfx.preset']));
    for (const t of TABS) if (t.items) for (const it of t.items()) if (it.k && it.k !== 'gfx.preset' && it.k in SAVE && it.set) safe(() => it.set(SAVE[it.k]));
    if (SAVE['dev.wire']) safe(() => X.wire(true));
  };
  (function w(n = 0) { if (window.__roadsReady || n > 900) setTimeout(applySaved, 800); else setTimeout(() => w(n + 1), 200); })();
}

(function wait(n = 0) { if (window.__drone && window.__dev) init(window.__drone, window.__dev); else if (n < 600) setTimeout(() => wait(n + 1), 100); })();
