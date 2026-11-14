// Universal Building Studio — interface.
import * as THREE from 'three';
import * as IGN from './sources/ign.js';
import * as OSM from './sources/osm.js';
import { Reconstruction, STEPS } from './pipeline/pipeline.js';
import { buildModel, provenanceMaterials } from './pipeline/model.js';
import { exportGLB, download, publishToGitHub } from './pipeline/export.js';
import { lidarDeviation, footprintAgreement, renderTopView } from './compare.js';
import { Viewer } from './viewer.js';
import { KINDS, confLabel } from './provenance.js';
import { fromL93, toL93, bboxOf } from './geo.js';
import { loadPixels } from './sources/panoramax.js';
import * as IMG from './sources/images.js';
import { openAligner, initialPose } from './aligner.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const S = { b: null, R: null, viewer: null, layer: null, sel: null, detail: null };
window.__studio = S; // pour le débogage / les tests automatisés

// ---------------- onglets ----------------
function view(v) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  for (const id of ['map', 'view', 'cmp']) $(id).style.display = id === v ? 'block' : 'none';
  if (v === 'view') { ensureViewer(); S.viewer.resize(); }
  if (v === 'map') map.invalidateSize();
}
document.querySelectorAll('.tabs button').forEach(b => (b.onclick = () => view(b.dataset.v)));
function sec(s) { document.querySelectorAll('#ptabs button').forEach(b => b.classList.toggle('on', b.dataset.s === s)); document.querySelectorAll('.sec').forEach(x => x.classList.toggle('on', x.id === s)); }
document.querySelectorAll('#ptabs button').forEach(b => (b.onclick = () => sec(b.dataset.s)));
function ensureViewer() { if (!S.viewer) { $('view').style.display = 'block'; S.viewer = new Viewer($('c3d')); } }

// ---------------- carte ----------------
const map = L.map('map', { zoomControl: false, maxZoom: 21 }).setView([45.84575, 1.2326], 17);
const wmts = (layer, fmt, max) => L.tileLayer(`${IGN.WMTS}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${fmt}`, { maxNativeZoom: max, maxZoom: 21, attribution: '© IGN' });
const plan = wmts('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png', 19), ortho = wmts('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg', 19);
const osmT = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 21, maxNativeZoom: 19, attribution: '© OpenStreetMap' });
ortho.addTo(map); L.control.layers({ 'Photo aérienne IGN': ortho, 'Plan IGN': plan, 'OpenStreetMap': osmT }, null, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);
const inFrance = () => { const c = map.getCenter(); return IGN.ignInfo.covers(c.lng, c.lat); };
let loadTok = 0;
async function refreshBuildings() {
  if (map.getZoom() < 16) { if (S.layer) { map.removeLayer(S.layer); S.layer = null; } return; }
  const b = map.getBounds(), tok = ++loadTok;
  try {
    const feats = inFrance() ? await IGN.buildingsInView(b.getWest(), b.getSouth(), b.getEast(), b.getNorth()) : await OSM.osmBuildingsInView(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
    if (tok !== loadTok) return;
    if (S.layer) map.removeLayer(S.layer);
    S.layer = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
      style: f => ({ color: f.properties.cleabs === S.b?.id ? '#ffb547' : '#fff', weight: f.properties.cleabs === S.b?.id ? 3 : 1, fillColor: heightColor(f.properties.hauteur), fillOpacity: 0.35 }),
      onEachFeature: (f, l) => l.on('click', e => { L.DomEvent.stop(e); pick(f.properties.cleabs, e.latlng); }),
    }).addTo(map);
  } catch (e) { log('Carte : ' + e.message); }
}
const heightColor = h => !h ? '#888' : h < 6 ? '#5ac8fa' : h < 15 ? '#34c759' : h < 30 ? '#ffcc00' : '#ff3b30';
map.on('moveend', refreshBuildings); refreshBuildings();
map.on('click', e => pick(null, e.latlng));

async function pick(id, ll) {
  try {
    setInfo('<span class="note">Recherche du bâtiment…</span>');
    let b;
    if (inFrance()) { const f = id ? await IGN.buildingById(id) : await IGN.buildingAt(ll.lng, ll.lat, 4); b = f && IGN.normalizeIGN(f); }
    else b = await OSM.osmBuildingAt(ll.lng, ll.lat);
    if (!b) { setInfo('<span class="note">Aucun bâtiment ici.</span>'); return; }
    select(b);
  } catch (e) { setInfo('<div class="warn">Erreur : ' + esc(e.message) + '</div>'); }
}
function select(b) {
  S.b = b; S.R = null; $('bAna').disabled = false; $('bGen').disabled = true; $('bDl').disabled = true; $('bPub').disabled = true;
  if (S.sel) map.removeLayer(S.sel);
  const ll = b.crs === 'EPSG:2154' ? b.outer.map(p => fromL93(p[0], p[1]).reverse()) : b.outer.map(p => b.proj.inv(p[0], p[1]).reverse());
  S.sel = L.polygon(ll, { color: '#ffb547', weight: 3, fillOpacity: 0.1 }).addTo(map);
  if (S.layer) S.layer.setStyle(f => ({ color: f.properties.cleabs === b.id ? '#ffb547' : '#fff', weight: f.properties.cleabs === b.id ? 3 : 1, fillColor: heightColor(f.properties.hauteur), fillOpacity: 0.35 }));
  const a = b.attrs, rows = [
    ['Identifiant', b.id], ['Source', b.source === 'ign' ? 'IGN BD TOPO' : 'OpenStreetMap'], ['Usage', a.usage], ['Hauteur (base)', a.hauteur && a.hauteur + ' m'], ['Étages', a.etages], ['Logements', a.logements],
    ['Murs', a.murs?.join(' + ')], ['Toit', a.toit?.join(' + ')], ['Altitude sol', a.alt_sol_min != null ? `${a.alt_sol_min} → ${a.alt_sol_max} m` : null], ['Altitude toit', a.alt_toit_min != null ? `${a.alt_toit_min} → ${a.alt_toit_max} m` : null],
    ['Date', a.date && String(a.date).slice(0, 10)], ['RNB', a.rnb], ['Sommets', b.outer.length],
  ].filter(r => r[1] != null && r[1] !== '');
  setInfo(`<table>${rows.map(r => `<tr><td class="k">${r[0]}</td><td>${esc(r[1])}</td></tr>`).join('')}</table><div class="row"><button class="btn pri" onclick="document.getElementById('bAna').click()">Analyser le bâtiment</button></div>`);
  sec('sBat');
}
const setInfo = h => ($('batInfo').innerHTML = h);

// ---------------- recherche d'adresse (accepte « 1 à 31 rue X ») ----------------
async function search(q) {
  q = q.trim(); if (!q) return;
  setInfo('<span class="note">Géocodage…</span>');
  const geo = async s => (inFrance() || /france|\d{5}/i.test(s) ? IGN.geocode(s) : OSM.nominatim(s));
  const m = q.match(/^(\d+)\s*(?:à|a|-|au)\s*(\d+)\s+(.+)$/i);
  try {
    if (m) {
      const [r1, r2] = await Promise.all([geo(m[1] + ' ' + m[3]), geo(m[2] + ' ' + m[3])]); if (!r1[0] || !r2[0]) throw new Error('adresse introuvable');
      map.setView([(r1[0].lat + r2[0].lat) / 2, (r1[0].lon + r2[0].lon) / 2], 18);
      // le bâtiment qui borde les deux adresses
      const c1 = await IGN.buildingAt(r1[0].lon, r1[0].lat, 30), c2 = await IGN.buildingAt(r2[0].lon, r2[0].lat, 30);
      if (c1 && c2 && c1.properties.cleabs === c2.properties.cleabs) return select(IGN.normalizeIGN(c1));
      log(`Les adresses ${m[1]} et ${m[2]} touchent des bâtiments différents ; sélection du n° ${m[1]}`);
      if (c1) return select(IGN.normalizeIGN(c1));
    } else {
      const r = await geo(q); if (!r[0]) throw new Error('adresse introuvable');
      map.setView([r[0].lat, r[0].lon], 19); await pick(null, { lat: r[0].lat, lng: r[0].lon });
    }
  } catch (e) { setInfo('<div class="warn">' + esc(e.message) + '</div>'); }
}
$('go').onclick = () => search($('q').value); $('q').onkeydown = e => { if (e.key === 'Enter') search($('q').value); };
$('greco').onclick = () => { $('q').value = '1 à 31 allée Le Gréco, 87100 Limoges'; search($('q').value); };

// ---------------- pipeline ----------------
function renderSteps(st = {}) {
  $('steps').innerHTML = STEPS.map((s, i) => { const x = st[i] || {}; const ic = { run: '⏳', ok: '✅', warn: '⚠️', err: '❌', skip: '➖' }[x.s] || '◻️'; return `<li><span>${ic}</span><span>${i + 1}. ${s}</span><span class="d">${esc(x.d || '')}</span></li>`; }).join('');
}
renderSteps();
const stepState = {}; const setStep = (i, s, d = '') => { stepState[i] = { s, d }; renderSteps(stepState); };
function log(m) { const l = $('log'); l.textContent += m + '\n'; l.scrollTop = 1e9; console.log('[studio]', m); }

$('bAna').onclick = async () => {
  if (!S.b) return; sec('sPipe'); for (const k in stepState) delete stepState[k]; renderSteps(); $('log').textContent = '';
  $('bAna').disabled = $('bGen').disabled = true;
  const R = S.R = new Reconstruction(S.b, { lidar: $('srcLidar').checked, ortho: $('srcOrtho').checked, panoramax: $('srcPano').checked, maxDist: +$('srcDist').value || 90, mapillaryToken: (() => { try { return $('imMlyTok').value.trim() || localStorage.getItem('studio_mly') || ''; } catch (e) { return $('imMlyTok').value.trim(); } })(), log, step: setStep });
  try { await R.analyse(); $('bGen').disabled = false; renderProv(); renderFacades(); G.items = G.items.filter(x => x.blob); $('imPano').onclick(); imAdd((R.commons || [])); }
  catch (e) { log('ERREUR : ' + e.message); console.error(e); }
  $('bAna').disabled = false;
};
$('bGen').onclick = () => generate();
async function generate() {
  const R = S.R; if (!R) return; $('bGen').disabled = true;
  try {
    setStep(7, 'run'); setStep(8, 'run');
    if (!S.detail) S.detail = await IGN.loadImage('../data/tex/enduit_d.jpg').catch(() => null);
    ensureViewer();
    const root = await buildModel(R, { detail: S.detail, interior: $('vInt').checked });
    S.viewer.setModel(root); S.viewer.setVisible('Environnement_mesure', $('vEnv').checked);
    if ($('vProv').checked) S.viewer.setProvenanceMode(true, provMats());
    let tris = 0; root.traverse(o => { if (o.isMesh && o.visible) tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; });
    setStep(7, 'ok', `atlas ${R.model.atlas.W}×${R.model.atlas.H} · ${Math.round(tris / 1000)} k triangles`);
    setStep(8, 'ok', `${R.floors.levels.length} planchers fictifs`);
    setStep(9, '', 'onglet Export');
    view('view'); renderProv(); renderCompare(); $('bDl').disabled = false; $('bPub').disabled = false;
  } catch (e) { log('ERREUR génération : ' + e.message); console.error(e); setStep(7, 'err', e.message); }
  $('bGen').disabled = false;
}
let _pm = null; const provMats = () => (_pm && _pm.R === S.R ? _pm.m : (_pm = { R: S.R, m: { ...provenanceMaterials(S.R), cadres: new THREE.MeshStandardMaterial({ color: 0x777777 }) } }).m);
$('vProv').onchange = e => { if (!S.R?.model) return; S.viewer.setProvenanceMode(e.target.checked, provMats()); $('legend').style.display = e.target.checked ? 'block' : 'none'; };
$('legend').innerHTML = Object.entries(KINDS).map(([k, v]) => `<div><i style="background:${v.color}"></i>${v.label}</div>`).join('');
$('vInt').onchange = e => { S.viewer?.setVisible('INTERIEUR_GENERE', e.target.checked); S.viewer?.setOpacity(e.target.checked ? 0.25 : 1); };
$('vEnv').onchange = e => S.viewer?.setVisible('Environnement_mesure', e.target.checked);

// ---------------- provenance ----------------
function renderProv() {
  const R = S.R; if (!R) return; const pv = R.prov;
  const groups = Object.keys(KINDS).map(k => [k, pv.items.filter(i => i.kind === k).length]);
  $('sProv').innerHTML = `<div class="row">${groups.map(([k, n]) => `<span class="tag t-${k}">${KINDS[k].label} : ${n}</span>`).join(' ')}</div>
  <table><tr><th>Caractéristique</th><th>Valeur</th><th>Origine · confiance</th></tr>${pv.items.map(i => `<tr><td>${esc(i.label)}</td><td>${esc(i.value)}${i.note ? `<div class="note">${esc(i.note)}</div>` : ''}</td><td><span class="tag t-${i.kind}">${KINDS[i.kind].label}</span><br><span class="note">${confLabel(i.conf)}</span><span class="conf"><i style="width:${i.conf * 100}%"></i></span></td></tr>`).join('')}</table>
  <p class="note">Sources : ${[...pv.sources.values()].map(s => `${esc(s.name)} (${esc(s.licence)})`).join(' · ')}${R.photos?.length ? '<br>Photos : ' + R.photos.map(p => `<a href="${p.page}" target="_blank">${esc(p.auteur || p.id.slice(0, 8))}</a> (${esc(p.licence)})`).join(', ') : ''}</p>
  <div class="warn">Les éléments <b>déduits</b> et <b>générés</b> ne sont pas des observations. Aucune façade inventée n'est présentée comme photographiée : seuls les pixels réellement issus d'une photo sont marqués « Photographiée » (vue Provenance en 3D).</div>`;
}

// ---------------- façades : réglages et photos perso ----------------
function renderFacades() {
  const R = S.R; if (!R) return; const f = R.settings.fenetres || (R.floors.residential ? { spacing: 2.9, width: 1.3, height: 1.4, sill: 0.95 } : { spacing: 3.3, width: 1.8, height: 1.7, sill: 0.9 });
  $('sFac').innerHTML = `<table><tr><th>Façade</th><th>Photo</th><th>Fenêtres</th><th>Balcons</th></tr>${R.groups.map(g => `<tr><td>${esc(g.name)}</td><td>${Math.round((g.coverage || 0) * 100)} %</td><td><span class="tag t-${g.winKind}">${g.windows.length}</span></td><td><input type="checkbox" data-bal="${g.id}" ${R.settings.balcons[g.id] ? 'checked' : ''}></td></tr>`).join('')}</table>
  <p class="note">Trame des fenêtres déduites (utilisée là où aucune photo ne permet de les détecter) :</p>
  <div class="row">entraxe <input type="number" step="0.1" id="fSp" value="${f.spacing}"> largeur <input type="number" step="0.1" id="fW" value="${f.width}"> hauteur <input type="number" step="0.1" id="fH" value="${f.height}"> allège <input type="number" step="0.05" id="fSi" value="${f.sill}"></div>
  <div class="row"><button class="btn" id="fApply">Appliquer et régénérer</button></div>
  <hr style="border-color:var(--line)"><p class="note"><b>Couleur des murs</b> — actuelle : <span class="tag t-${R.wallColorKind}">${KINDS[R.wallColorKind]?.label || ''}</span>. Vous pouvez regarder le bâtiment sur Google Street View (lien officiel, rien n'est copié automatiquement) et corriger la teinte à l'œil.</p>
  <div class="row"><a class="btn" target="_blank" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${R.lonlat[1]},${R.lonlat[0]}">Voir sur Street View ↗</a><input type="color" id="fCol" value="#${(R.wallColor || [210, 205, 195]).map(v => v.toString(16).padStart(2, '0')).join('')}" style="width:56px;height:40px;border:0;background:none"><button class="btn" id="fColOk">Utiliser cette couleur</button></div>
  <hr style="border-color:var(--line)"><p class="note"><b>Ajouter ma photo</b> (la vôtre, ou une photo libre de droits) : choisissez la façade, puis touchez ses 4 coins sur la photo (bas-gauche, bas-droite, haut-droite, haut-gauche, vus de face). La photo est redressée à l'échelle et marquée « Photographiée ».</p>
  <div class="row"><select id="upG">${R.groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select><input type="file" id="upF" accept="image/*"></div>`;
  $('sFac').querySelectorAll('[data-bal]').forEach(c => (c.onchange = () => { R.settings.balcons[c.dataset.bal] = c.checked; }));
  $('fColOk').onclick = async () => { const h = $('fCol').value; R.wallColor = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); R.wallColorKind = 'deduite'; R.manualColor = R.wallColor;
    R.prov.set('mur_couleur', 'Couleur des murs', 'rgb(' + R.wallColor + ')', 'deduite', 0.5, 'perso', 'choisie à l\'œil par l\'utilisateur (aucune donnée extraite automatiquement)'); renderProv(); await generate(); };
  $('fApply').onclick = async () => { R.settings.fenetres = { spacing: +$('fSp').value, width: +$('fW').value, height: +$('fH').value, sill: +$('fSi').value }; await R.s7(); renderFacades(); await generate(); };
  $('upF').onchange = async e => { const file = e.target.files[0]; if (!file) return; const g = R.groups[+$('upG').value]; const pix = await fileToPixels(file); const corners = await askCorners(pix); if (!corners) return; R.userPhotos.push({ group: g.id, pix, corners }); const FA = await import('./pipeline/facade.js'); FA.applyUserPhoto(g, pix, corners); R.prov.source('perso', 'Photos fournies par l\'utilisateur', 'droits de l\'utilisateur'); await R.s6(); await R.s7(); renderFacades(); renderProv(); await generate(); };
}
async function fileToPixels(file) {
  const bmp = await createImageBitmap(file); const k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, c.width, c.height);
  return { canvas: c, data: g.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height };
}
function askCorners(pix) {
  return new Promise(done => {
    const ui = $('cornerUI'), cv = $('cornerC'), names = ['bas-gauche', 'bas-droite', 'haut-droite', 'haut-gauche']; let pts = [];
    cv.width = pix.W; cv.height = pix.H; const g = cv.getContext('2d');
    const draw = () => { g.drawImage(pix.canvas, 0, 0); g.strokeStyle = '#ffb547'; g.fillStyle = '#ffb547'; g.lineWidth = Math.max(2, pix.W / 400); g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); if (pts.length === 4) g.closePath(); g.stroke(); pts.forEach(p => { g.beginPath(); g.arc(p[0], p[1], pix.W / 120, 0, 7); g.fill(); }); $('cornerTxt').textContent = pts.length < 4 ? `Touchez le coin ${names[pts.length]} de la façade` : '4 coins posés'; $('cornerOk').disabled = pts.length < 4; };
    cv.onpointerdown = e => { if (pts.length >= 4) return; const r = cv.getBoundingClientRect(), s = Math.min(r.width / pix.W, r.height / pix.H), ox = (r.width - pix.W * s) / 2, oy = (r.height - pix.H * s) / 2; pts.push([(e.clientX - r.left - ox) / s, (e.clientY - r.top - oy) / s]); draw(); };
    $('cornerReset').onclick = () => { pts = []; draw(); };
    const end = v => { ui.style.display = 'none'; done(v); };
    $('cornerCancel').onclick = () => end(null); $('cornerOk').onclick = () => end(pts);
    ui.style.display = 'flex'; draw();
  });
}

// ---------------- comparaison ----------------
function renderCompare() {
  const R = S.R; if (!R?.model) return; const c = $('cmp'); c.innerHTML = '';
  const dev = lidarDeviation(R), fp = footprintAgreement(R);
  const card = (h, inner) => { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = `<h3>${h}</h3>` + inner; c.appendChild(d); return d; };
  if (R.ortho) {
    const d = card('Vue du ciel : modèle ↔ orthophoto IGN', '<div class="swipe"></div><input type="range" min="0" max="100" value="50"><div class="note">Glissez : à gauche le modèle, à droite la photo aérienne. Les bâtiments hauts « penchent » sur la photo (recalage appliqué au toit).</div>');
    const top = renderTopView(S.viewer, R, THREE), base = R.ortho.canvas, w = d.querySelector('.swipe');
    const a = document.createElement('canvas'); a.width = top.width; a.height = top.height; a.getContext('2d').drawImage(base, 0, 0, a.width, a.height);
    const b = document.createElement('canvas'); b.width = top.width; b.height = top.height; const bg = b.getContext('2d'); bg.fillStyle = '#1b1f26'; bg.fillRect(0, 0, b.width, b.height); bg.drawImage(top, 0, 0); b.className = 'top';
    w.append(a, b); const rg = d.querySelector('input'); const upd = () => (b.style.clipPath = `inset(0 ${100 - rg.value}% 0 0)`); rg.oninput = upd; upd();
  }
  if (dev) {
    const d = card('Toit : écart modèle ↔ LiDAR (MNS)', `<table><tr><td class="k">Écart médian</td><td>${(dev.median * 100).toFixed(0)} cm</td></tr><tr><td class="k">95 % des points à moins de</td><td>${(dev.p95 * 100).toFixed(0)} cm</td></tr><tr><td class="k">Points à moins de 30 cm</td><td>${(dev.within30 * 100).toFixed(0)} %</td></tr>${fp ? `<tr><td class="k">Emprise couverte par du « haut » LiDAR</td><td>${(fp.insideHigh * 100).toFixed(0)} %</td></tr><tr><td class="k">IoU emprise ↔ LiDAR > 2,5 m</td><td>${(fp.iou * 100).toFixed(0)} % <span class="note">(${fp.note})</span></td></tr>` : ''}</table><div class="note">Rouge : LiDAR plus haut que le modèle · bleu : plus bas · blanc : identique (échelle ±1 m).</div>`);
    dev.canvas.style.cssText = 'width:100%;max-width:720px;image-rendering:pixelated;border-radius:8px;background:#000;margin-top:6px'; d.appendChild(dev.canvas);
  }
  if (R.style) {
    const sw = c => `<span style="display:inline-block;width:22px;height:22px;border-radius:5px;vertical-align:middle;border:1px solid #0006;background:rgb(${c})"></span>`;
    const me = R.style.measured.find(b => b.id === R.b.id);
    const d = card('Couleurs réelles du quartier', `<div class="row">${sw(R.wallColor)} <b>Couleur retenue</b> <span class="tag t-${R.wallColorKind}">${KINDS[R.wallColorKind]?.label || ''}</span></div>
      <div class="note">${R.style.measured.length} façades voisines mesurées sur ${R.style.photosUsed} photos de rue (sur ${R.style.photosFound} trouvées dans ${R.style.radius} m), en retirant ombres, vitres, ciel et tout ce que le LiDAR montre devant (arbres…).</div>
      ${me ? '<div class="note">Ce bâtiment est lui-même visible sur des photos : couleur mesurée directement.</div>' : (R.colorFrom || []).map(f => `<div class="row">${sw(f.color)} <span class="note">${esc(f.usage || '')} ${f.annee || ''} · ressemblance ${(f.s * 100).toFixed(0)} %</span></div>`).join('')}
      <div class="row"><button class="btn" id="styleMap">Voir les couleurs mesurées sur la carte</button></div>`);
    d.querySelector('#styleMap').onclick = () => {
      if (S.styleLayer) map.removeLayer(S.styleLayer);
      S.styleLayer = L.layerGroup(R.style.measured.map(b => L.polygon(b.ring.map(p => fromL93(p[0], p[1]).reverse()), { color: '#000', weight: 1, fillColor: `rgb(${b.color})`, fillOpacity: 0.95 }))).addTo(map);
      view('map'); map.fitBounds(L.featureGroup(S.styleLayer.getLayers()).getBounds());
    };
  }
  const ph = (R.photos || []);
  const d = card('Photos réelles ↔ modèle', ph.length ? '' : `<div class="note">Aucune photo de rue exploitable dans ${R.o.maxDist} m (Panoramax). Ajoutez la vôtre dans l'onglet Façades.</div>`);
  for (const p of ph) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<img src="${p.thumb}" style="height:54px;border-radius:6px"><span class="note">${esc(p.auteur)} · ${esc((p.date || '').slice(0, 10))} · ${Math.round(Math.hypot(p.cam.x, p.cam.y))} m · ${esc(p.licence)}</span><button class="btn">Superposer en 3D</button>`;
    row.querySelector('button').onclick = () => { view('view'); S.viewer.enterPhoto(p, R); $('photoBar').style.display = 'flex'; $('photoInfo').textContent = `Photo ${p.auteur} (${p.licence}) — position GPS ±${p.accuracy || '?'} m`; S.viewer.setOpacity(+$('opa').value); };
    d.appendChild(row);
  }
  for (const u of R.userPhotos) { const r = document.createElement('div'); r.className = 'note'; r.textContent = `Photo perso appliquée sur « ${R.groups[u.group]?.name} ».`; d.appendChild(r); }
}
$('opa').oninput = e => S.viewer.setOpacity(+e.target.value);
$('photoExit').onclick = () => { S.viewer.exitPhoto(); $('photoBar').style.display = 'none'; };

// ---------------- galerie d'images multi-sources + aligneur ----------------
const G = { items: [] };
function imAdd(list) { for (const it of list) if (!G.items.find(x => x.id === it.id)) G.items.push(it); renderGallery(); }
function imInfo(t) { $('imInfo').textContent = t; }
function renderGallery() {
  const R = S.R; const dist = it => (R && it.lon != null && R.b.crs === 'EPSG:2154') ? Math.round(Math.hypot(...toL93(it.lon, it.lat).map((v, i) => v - R.origin[i]))) : null;
  $('imGrid').innerHTML = G.items.map((it, i) => { const d = dist(it); return `<div class="im"><img src="${esc(it.thumbURL || it.thumb || '')}" loading="lazy" alt=""><div><b>${esc(it.source)}</b>${d != null ? ' · ' + d + ' m' : ''}<br><span class="note">${esc(it.licence || '')}${it.auteur ? ' · ' + esc(it.auteur) : ''}</span><br>${it.applied ? '<span class="tag t-photographiee">appliquée</span>' : it.pose === 'auto' ? '<span class="tag t-mesuree">pose auto</span>' : '<span class="tag t-deduite">à aligner</span>'}
    <div class="row"><button class="btn" data-al="${i}">Aligner</button>${it.pose === 'auto' ? `<button class="btn" data-ap="${i}">Appliquer</button>` : ''}${it.page ? `<a class="btn" href="${esc(it.page)}" target="_blank">↗</a>` : ''}</div></div></div>`; }).join('');
  $('imGrid').querySelectorAll('[data-al]').forEach(b => (b.onclick = () => alignItem(G.items[+b.dataset.al])));
  $('imGrid').querySelectorAll('[data-ap]').forEach(b => (b.onclick = () => applyItem(G.items[+b.dataset.ap], null)));
}
async function itemPixels(it) {
  if (it.pix) return it.pix;
  if (it.blob) { it.pix = await fileToPixels(it.blob); return it.pix; }
  it.pix = await loadPixels({ sd: it.full, id: it.id }, 'sd'); return it.pix;
}
async function needModel() { if (!S.R) { imInfo('Analysez d\'abord un bâtiment (onglet Pipeline).'); return false; } if (!S.R.model) await generate(); return !!S.R.model; }
async function alignItem(it) {
  if (!(await needModel())) return; imInfo('Chargement de l\'image…');
  try {
    const pix = await itemPixels(it); imInfo('');
    if (it.spherical) { imInfo('Image 360° : utilisez « Appliquer » (pose GPS) puis vérifiez dans Comparer.'); return; }
    const { pose, src } = initialPose(S.R, { lon: it.lon, lat: it.lat, azimuth: it.azimuth, fov: it.fov, pitch: it.pitch, h: it.h });
    view('view');
    openAligner({ viewer: S.viewer, R: S.R, pix, init: pose, label: `${it.source} — départ : ${src.join(', ')}`, onApply: P => applyItem(it, P) });
  } catch (e) { imInfo('Image illisible : ' + e.message + (it.source === 'Wikimedia Commons' ? '' : ' (le site doit autoriser CORS)')); }
}
async function applyItem(it, P) {
  if (!(await needModel())) return; const R = S.R;
  try {
    const pix = await itemPixels(it); let ph;
    if (P) ph = { id: it.id, label: it.source, pix, spherical: false, ignoreOcclusion: true, fov: P.fov, azimuth: P.az, pitch: P.pitch, cam: { x: P.x, y: P.y, z: P.z } };
    else { const [X, Y] = toL93(it.lon, it.lat); let gz = R.ground.min; ph = { id: it.id, label: it.source, pix, spherical: !!it.spherical, fov: it.fov || 70, azimuth: it.azimuth || 0, pitch: 0, cam: { x: X - R.origin[0], y: Y - R.origin[1], z: gz + 2.3 } };
      const m = R.mntEnv || R.mntNear; if (m) { const z = IGN.sampleGrid(m, X, Y); if (z === z) ph.cam.z = z + 2.3; } }
    ph.sourceKey = 'img-' + it.source; ph.sourceName = it.source; ph.licence = it.licence; ph.auteur = it.auteur; ph.page = it.page; ph.date = it.date || '';
    imInfo('Projection sur les façades…');
    const n = await R.applyPosed(ph); it.applied = true; (R.photos = R.photos || []).push(ph);
    imInfo(n ? `${n} pixels de façade remplacés par la photo. Modèle régénéré.` : 'Aucune façade visible depuis cette pose (ou masquée par les arbres/LiDAR).');
    renderProv(); renderFacades(); renderGallery(); await generate();
  } catch (e) { imInfo('Erreur : ' + e.message); console.error(e); }
}
S.applyItem = applyItem; S.G = G;
$('imFiles').onchange = async e => {
  const files = [...e.target.files]; imInfo(`Lecture de ${files.length} photo(s)…`);
  for (const f of files) { const ex = await IMG.readExif(f).catch(() => ({})); imAdd([{ id: 'perso-' + f.name + f.size, source: 'Ma photo', blob: f, thumbURL: URL.createObjectURL(f), lon: ex.lon, lat: ex.lat, azimuth: ex.cap, fov: ex.fov, licence: 'vos droits', auteur: [ex.marque, ex.modele].filter(Boolean).join(' '), pose: 'aucune', date: ex.date }]); }
  imInfo(files.length + ' photo(s) ajoutée(s). Touchez « Aligner ».');
};
$('imCommons').onclick = async () => { if (!S.R) return imInfo('Analysez d\'abord un bâtiment.'); imInfo('Recherche Wikimedia Commons…'); try { const l = await IMG.commons(S.R.lonlat[0], S.R.lonlat[1], 600); imAdd(l); imInfo(`${l.length} photo(s) libres géolocalisées à moins de 600 m (à aligner).`); } catch (e) { imInfo('Commons : ' + e.message); } };
$('imPano').onclick = () => { const R = S.R; if (!R) return imInfo('Analysez d\'abord un bâtiment.'); const l = (R.photosAll || []).map(p => ({ id: 'px-' + p.id, source: p.source || 'Panoramax', thumb: p.thumb, full: p.sd, lon: p.lon, lat: p.lat, azimuth: p.azimuth, fov: p.fov, spherical: p.spherical, licence: p.licence, auteur: p.auteur, page: p.page, date: p.date, pose: 'auto' })); imAdd(l); imInfo(l.length ? `${l.length} photo(s) de rue (posées automatiquement).` : `Aucune photo Panoramax dans ${R.o.maxDist} m (augmentez le rayon dans Sources puis réanalysez).`); };
// Jeton client Mapillary (lecture seule, fait pour être utilisé dans une page web publique)
const MLY_DEFAULT = 'MLY|29931174879810116|4f77277d661dbe2c485a4770b357cc82';
$('imMlyTok').value = MLY_DEFAULT;
try { const t = localStorage.getItem('studio_mly'); if (t) $('imMlyTok').value = t; } catch (e) {}
$('imMly').onclick = async () => { const R = S.R, tok = $('imMlyTok').value.trim(); if (!R) return imInfo('Analysez d\'abord un bâtiment.'); if (!tok) return imInfo('Créez un jeton gratuit sur mapillary.com/dashboard/developers puis collez-le.');
  try { localStorage.setItem('studio_mly', tok); } catch (e) {}
  imInfo('Recherche Mapillary…'); try { const bb = bboxOf(R.P, 150), [w, s] = fromL93(bb[0], bb[1]), [e, n] = fromL93(bb[2], bb[3]); const l = await IMG.mapillary(w, s, e, n, tok); imAdd(l); imInfo(`${l.length} photo(s) Mapillary à moins de 150 m.`); } catch (e) { imInfo(e.message); } };
$('imUrlGo').onclick = async () => { const u = $('imUrl').value.trim(); if (!u) return; try { const blob = await IMG.fromURL(u); const ex = await IMG.readExif(blob).catch(() => ({})); imAdd([{ id: 'url-' + u, source: 'Image web', blob, thumbURL: URL.createObjectURL(blob), lon: ex.lon, lat: ex.lat, azimuth: ex.cap, fov: ex.fov, licence: 'à vérifier (' + new URL(u).hostname + ')', page: u, pose: 'aucune' }]); imInfo('Image importée : vérifiez que vous avez le droit de l\'utiliser.'); } catch (e) { imInfo('Import impossible : ' + e.message + ' — téléchargez l\'image puis ajoutez-la via « Mes photos ».'); } };

// ---------------- export ----------------
$('bDl').onclick = async () => {
  const R = S.R; if (!R?.model) return; $('dlInfo').textContent = 'Export…';
  try { const glb = await exportGLB(R.model.root, { environment: $('xEnv').checked, interior: $('xInt').checked }); download(glb, `${R.b.id}.glb`); $('dlInfo').textContent = `${(glb.byteLength / 1e6).toFixed(1)} Mo`; setStep(9, 'ok', `${(glb.byteLength / 1e6).toFixed(1)} Mo`); }
  catch (e) { $('dlInfo').textContent = 'Erreur : ' + e.message; }
};
try { const t = localStorage.getItem('studio_gh'); if (t) { $('ghTok').value = t; $('ghMem').checked = true; } } catch (e) {}
$('bPub').onclick = async () => {
  const R = S.R; if (!R?.model) return; const token = $('ghTok').value.trim(); if (!token) { $('pubInfo').textContent = 'Jeton requis.'; return; }
  try { if ($('ghMem').checked) localStorage.setItem('studio_gh', token); else localStorage.removeItem('studio_gh'); } catch (e) {}
  if (R.b.crs !== 'EPSG:2154') { $('pubInfo').textContent = 'Seuls les bâtiments en France (Lambert-93) se placent dans Limoges 3D.'; return; }
  $('pubInfo').textContent = 'Envoi…';
  try {
    const glb = await exportGLB(R.model.root, { environment: false, interior: false });
    const f = await publishToGitHub({ token, repo: $('ghRepo').value.trim(), glb, entry: studioEntry(R) });
    $('pubInfo').innerHTML = `Publié : ${esc(f)}. GitHub Pages met ~1 min à se mettre à jour, puis ouvrez <a href="../?studio=1" target="_blank">Limoges 3D avec ?studio=1</a>.`;
  } catch (e) { $('pubInfo').textContent = 'Erreur : ' + e.message; }
};
export function studioEntry(R) { return { id: R.b.id, nom: R.b.attrs.usage || R.b.id, origine: { crs: R.b.crs, x: R.origin[0], y: R.origin[1], z0: R.z0 }, emprise: R.P.outer.map(p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]), genere_le: new Date().toISOString() }; }
S.studioEntry = studioEntry; S.exportGLB = exportGLB;

// ---------------- paramètres d'URL : ?id=…, ?adresse=…, &auto=1 ----------------
(async () => {
  const u = new URLSearchParams(location.search);
  if (u.get('adresse')) { $('q').value = u.get('adresse'); await search(u.get('adresse')); }
  else if (u.get('id')) { const f = await IGN.buildingById(u.get('id')); if (f) { const b = IGN.normalizeIGN(f); select(b); const [lon, lat] = fromL93(...b.outer[0]); map.setView([lat, lon], 18); } }
  if (u.get('auto') && S.b) { await $('bAna').onclick(); if (S.R?.groups) await generate(); window.__studioDone = true; }
})();
