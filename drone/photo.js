// Drone photo : appareil photo ultra HD (objectifs 0,5× / 1× / 2×), pilote automatique « photographier une adresse »,
// pellicule enregistrée dans le navigateur (IndexedDB), et nouvelle interface du drone façon appareil photo.
// Branché sur la scène du jeu par index.html : initDronePhoto(api).
//
// Objectifs (équivalents 24×36, photo au format 4:3 comme un iPhone) :
//   0,5× = 13 mm (ultra grand-angle), 1× = 26 mm, 2× = 52 mm.
// Pilote automatique : géocodage IGN de l'adresse → bâtiment IGN le plus proche → façade côté rue (côté de l'adresse)
// → points de prise de vue calculés pour cadrer toute la façade sans obstacle → vol au-dessus des toits → 4 photos.

const LENSES = [{ id: '0.5', mm: 13 }, { id: '1', mm: 26 }, { id: '2', mm: 52 }];
const SENSOR_W = 34.6, SENSOR_H = 25.95;   // largeur / hauteur 24×36 recadrée en 4:3 (diagonale 43,3 mm)
const vfov43 = mm => 2 * Math.atan(SENSOR_H / (2 * mm)) * 180 / Math.PI;
const hfov43 = mm => 2 * Math.atan(SENSOR_W / (2 * mm)) * 180 / Math.PI;

// ---- Lambert-93 (IGN, ellipsoïde GRS80) : longitude/latitude → mètres
function lambert93(lon, lat) {
  const n = 0.7256077650, C = 11754255.426, Xs = 700000, Ys = 12655612.050, e = 0.08181919112, l0 = 3 * Math.PI / 180;
  const p = lat * Math.PI / 180, s = Math.sin(p);
  const L = Math.log(Math.tan(Math.PI / 4 + p / 2) * Math.pow((1 - e * s) / (1 + e * s), e / 2));
  const R = C * Math.exp(-n * L), g = n * (lon * Math.PI / 180 - l0);
  return [Xs + R * Math.sin(g), Ys - R * Math.cos(g)];
}

// ---- pellicule (IndexedDB)
const DB = { db: null };
function dbOpen() {
  if (DB.db) return Promise.resolve(DB.db);
  return new Promise((res, rej) => { const r = indexedDB.open('pellicule-paris', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(DB.db = r.result); r.onerror = () => rej(r.error); });
}
async function dbAll() { const db = await dbOpen(); return new Promise(res => { const out = []; const c = db.transaction('photos').objectStore('photos').openCursor(null, 'prev'); c.onsuccess = () => { const k = c.result; if (k) { out.push(k.value); k.continue(); } else res(out); }; }); }
async function dbPut(v) { const db = await dbOpen(); return new Promise((res, rej) => { const t = db.transaction('photos', 'readwrite').objectStore('photos').add(v); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); }
async function dbDel(id) { const db = await dbOpen(); return new Promise(res => { const t = db.transaction('photos', 'readwrite').objectStore('photos').delete(id); t.onsuccess = () => res(); }); }

export function initDronePhoto(A) {
  const { THREE } = A;
  const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
  const PHOTO = isTouch ? [3264, 2448] : [4032, 3024];   // 8 Mpx sur téléphone (mémoire), 12 Mpx sinon
  const $ = id => document.getElementById(id);
  const S = { lens: 0, busy: false, last: null };
  A.GIMBAL.photoV = () => vfov43(LENSES[S.lens].mm);    // la vue en direct a le même champ vertical que la photo

  // =========================================================== interface
  const css = document.createElement('style'); css.textContent = `
  :root{--dp-acc:#ffd60a;--dp-glass:rgba(16,18,22,.42);--dp-line:rgba(255,255,255,.16)}
  .flying .btns,.flying #speedo,.flying #street,.flying #didCount,.flying #bPlane{display:none!important}
  .flying #mapwrap{width:108px;height:108px;left:calc(14px + env(safe-area-inset-left));top:calc(60px + env(safe-area-inset-top));border-width:1px;border-color:var(--dp-line)}
  .flying.pip #pipBox{top:calc(60px + env(safe-area-inset-top));border:1px solid var(--dp-line);border-radius:14px;width:208px;height:117px}
  #dp{display:none;position:fixed;inset:0;z-index:8;pointer-events:none;font-family:-apple-system,'SF Pro Text','Helvetica Neue',Arial,sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
  .flying #dp{display:block}
  #dp *{box-sizing:border-box}
  #dpBands i{position:absolute;top:0;bottom:0;background:rgba(0,0,0,.38);pointer-events:none}
  #dpGrid{position:absolute;top:0;bottom:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.14),rgba(255,255,255,.14)),linear-gradient(rgba(255,255,255,.14),rgba(255,255,255,.14)),linear-gradient(90deg,rgba(255,255,255,.14),rgba(255,255,255,.14)),linear-gradient(90deg,rgba(255,255,255,.14),rgba(255,255,255,.14));background-size:100% 1px,100% 1px,1px 100%,1px 100%;background-position:0 33.33%,0 66.66%,33.33% 0,66.66% 0;background-repeat:no-repeat}
  #dpTop{position:absolute;left:0;right:0;top:0;padding:calc(10px + env(safe-area-inset-top)) calc(14px + env(safe-area-inset-right)) 10px calc(14px + env(safe-area-inset-left));display:flex;align-items:center;gap:10px;background:linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,0))}
  #dpTel{font:600 12px/1 inherit;letter-spacing:.04em;display:flex;gap:12px;opacity:.92;white-space:nowrap}
  #dpTel b{font-weight:600;color:var(--dp-acc)}
  #dpSearch{flex:1;max-width:420px;margin:0 auto;pointer-events:auto;position:relative}
  #dpSearch input{width:100%;height:36px;border-radius:18px;border:1px solid var(--dp-line);background:var(--dp-glass);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);color:#fff;font:500 14px/1 inherit;padding:0 14px 0 34px;outline:none}
  #dpSearch input::placeholder{color:rgba(255,255,255,.6)}
  #dpSearch svg{position:absolute;left:12px;top:11px;opacity:.7}
  #dpSugg{position:absolute;left:0;right:0;top:42px;border-radius:14px;overflow:hidden;background:rgba(22,24,28,.92);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid var(--dp-line);display:none}
  #dpSugg div{padding:11px 14px;font:500 14px/1.25 inherit;border-bottom:1px solid rgba(255,255,255,.07);cursor:pointer}
  #dpSugg div small{display:block;opacity:.55;font-size:12px;margin-top:2px}
  #dpMenuB{pointer-events:auto;width:36px;height:36px;border-radius:18px;border:1px solid var(--dp-line);background:var(--dp-glass);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);display:grid;place-items:center;cursor:pointer}
  #dpRight{position:absolute;right:calc(18px + env(safe-area-inset-right));top:50%;transform:translateY(-62%);display:flex;flex-direction:column;align-items:center;gap:14px;pointer-events:auto}
  #dpLens{display:flex;flex-direction:column;gap:6px;padding:5px;border-radius:22px;background:var(--dp-glass);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
  #dpLens button{width:34px;height:34px;border-radius:17px;border:0;background:transparent;color:#fff;font:600 11px/1 inherit;cursor:pointer}
  #dpLens button.on{background:rgba(0,0,0,.55);color:var(--dp-acc);font-size:12px}
  #dpShut{width:72px;height:72px;border-radius:50%;border:4px solid #fff;background:transparent;padding:4px;cursor:pointer}
  #dpShut i{display:block;width:100%;height:100%;border-radius:50%;background:#fff;transition:transform .12s}
  #dpShut:active i,#dpShut.snap i{transform:scale(.86)}
  #dpShut.busy{opacity:.45}
  #dpRow{display:flex;gap:14px;align-items:center}
  #dpRoll{width:42px;height:42px;border-radius:10px;border:1.5px solid rgba(255,255,255,.85);background:#111 center/cover;cursor:pointer}
  #dpVid{width:42px;height:42px;border-radius:21px;border:1px solid var(--dp-line);background:var(--dp-glass);display:grid;place-items:center;cursor:pointer}
  #dpVid i{width:14px;height:14px;border-radius:7px;background:#ff3b30;transition:border-radius .2s}
  #dpVid.on i{border-radius:3px}
  #dpFlash{position:absolute;inset:0;background:#fff;opacity:0;transition:opacity .35s}
  #dpAuto{position:absolute;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);display:none;align-items:center;gap:12px;padding:10px 12px 10px 16px;border-radius:24px;background:rgba(16,18,22,.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid var(--dp-line);pointer-events:auto;max-width:min(560px,70vw)}
  #dpAuto.on{display:flex}
  #dpAuto p{margin:0;font:500 13px/1.3 inherit}
  #dpAuto p b{display:block;font-weight:600;color:var(--dp-acc);font-size:11px;letter-spacing:.08em;text-transform:uppercase}
  #dpAuto button{border:0;border-radius:16px;padding:8px 12px;background:rgba(255,255,255,.14);color:#fff;font:600 12px/1 inherit;cursor:pointer}
  #dpSheet,#dpGal,#dpView{position:fixed;inset:0;z-index:30;display:none;pointer-events:auto;font-family:-apple-system,'SF Pro Text','Helvetica Neue',Arial,sans-serif;color:#fff}
  #dpSheet{background:rgba(0,0,0,.35)}
  #dpSheet .card{position:absolute;right:calc(14px + env(safe-area-inset-right));top:calc(54px + env(safe-area-inset-top));width:280px;border-radius:18px;background:rgba(28,30,34,.94);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid var(--dp-line);overflow:hidden}
  #dpSheet .it{display:flex;justify-content:space-between;align-items:center;padding:13px 16px;font:500 14px/1 inherit;border-bottom:1px solid rgba(255,255,255,.07);cursor:pointer}
  #dpSheet .it span{opacity:.6;font-size:13px}
  #dpGal{background:#000;overflow:auto}
  #dpGal header,#dpView header{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;padding:calc(12px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 12px calc(16px + env(safe-area-inset-left));background:rgba(0,0,0,.7);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);font:600 17px/1 inherit;z-index:2}
  #dpGal header button,#dpView header button{border:0;background:none;color:var(--dp-acc);font:500 16px/1 inherit;cursor:pointer}
  #dpGrid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:2px;padding:2px calc(2px + env(safe-area-inset-right)) 2px calc(2px + env(safe-area-inset-left))}
  #dpGrid2 div{aspect-ratio:4/3;background:#222 center/cover;cursor:pointer}
  #dpGal .empty{padding:60px 20px;text-align:center;opacity:.6;font:500 15px/1.5 inherit}
  #dpView{background:#000}
  #dpView .ph{position:absolute;inset:0;display:grid;place-items:center;padding:56px 0 86px}
  #dpView .ph img{max-width:100%;max-height:100%;object-fit:contain}
  #dpView footer{position:absolute;left:0;right:0;bottom:0;padding:10px calc(16px + env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));background:rgba(0,0,0,.7);display:flex;align-items:center;gap:12px}
  #dpView footer p{flex:1;margin:0;font:500 12px/1.4 inherit;opacity:.85}
  #dpView footer p b{font-size:13px;opacity:1;display:block}
  #dpView footer button{border:0;border-radius:16px;padding:9px 14px;background:rgba(255,255,255,.14);color:#fff;font:600 13px/1 inherit;cursor:pointer}
  #dpView footer button.del{color:#ff453a}
  /* manches redessinés */
  .dst{width:132px!important;height:132px!important;background:rgba(10,12,16,.16)!important;border:1px solid rgba(255,255,255,.22)!important;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
  .dst::before,.dst::after{background:rgba(255,255,255,.12)!important}
  .dst span{display:none}
  .dkn{width:44px!important;height:44px!important;margin:-22px 0 0 -22px!important;background:rgba(255,255,255,.92)!important;box-shadow:0 2px 10px rgba(0,0,0,.35)!important}
  #dsR{right:calc(112px + env(safe-area-inset-right))!important}
  `;
  document.head.appendChild(css);
  const ic = (d, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ui = document.createElement('div'); ui.id = 'dp';
  ui.innerHTML = `<div id="dpBands"><i id="dpB1"></i><i id="dpB2"></i></div><div id="dpGrid"></div><div id="dpFlash"></div>
  <div id="dpTop"><div id="dpTel"><span>ALT <b id="dpAlt">0 m</b></span><span>VIT <b id="dpSpd">0,0 m/s</b></span><span id="dpWhere"></span></div>
    <div id="dpSearch">${ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 14)}<input id="dpQ" placeholder="Photographier une adresse à Paris…" autocomplete="off" enterkeyhint="go"><div id="dpSugg"></div></div>
    <div id="dpMenuB">${ic('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', 18)}</div></div>
  <div id="dpRight"><div id="dpLens">${LENSES.map((l, i) => `<button data-i="${i}">${l.id === '0.5' ? '.5' : l.id}${i === 0 ? '' : '×'}</button>`).join('')}</div>
    <button id="dpShut" aria-label="Prendre une photo"><i></i></button>
    <div id="dpRow"><div id="dpRoll" aria-label="Pellicule"></div><div id="dpVid" aria-label="Vidéo"><i></i></div></div></div>
  <div id="dpAuto"><p><b id="dpAutoT">Pilote automatique</b><span id="dpAutoS"></span></p><button id="dpStop">Reprendre la main</button></div>`;
  document.body.appendChild(ui);
  const sheet = document.createElement('div'); sheet.id = 'dpSheet'; sheet.innerHTML = '<div class="card" id="dpCard"></div>'; document.body.appendChild(sheet);
  const gal = document.createElement('div'); gal.id = 'dpGal'; gal.innerHTML = '<header><button id="dpGalX">Fermer</button><span>Pellicule</span><span id="dpGalN" style="opacity:.6;font-size:13px;font-weight:500"></span></header><div id="dpGrid2"></div>'; document.body.appendChild(gal);
  const view = document.createElement('div'); view.id = 'dpView'; view.innerHTML = '<header><button id="dpViewX">Pellicule</button><span id="dpViewT" style="font-size:15px"></span><span style="width:60px"></span></header><div class="ph"><img id="dpImg" alt=""></div><footer><p id="dpInfo"></p><button id="dpShare">Enregistrer</button><button class="del" id="dpDel">Supprimer</button></footer>'; document.body.appendChild(view);
  for (const el of [ui, sheet, gal, view]) for (const ev of ['touchstart', 'pointerdown', 'mousedown']) el.addEventListener(ev, e => { if (e.target.closest('#dpTop,#dpRight,#dpAuto,#dpSheet,#dpGal,#dpView')) e.stopPropagation(); }, { passive: true });

  // bandes 4:3 : ce qui est entre les bandes est exactement la photo
  function layout() {
    const W = innerWidth, H = innerHeight, w = Math.min(W, H * 4 / 3), b = (W - w) / 2;
    $('dpB1').style.cssText = `left:0;width:${b}px`; $('dpB2').style.cssText = `right:0;width:${b}px`;
    $('dpGrid').style.cssText = `left:${b}px;width:${w}px`;
  }
  addEventListener('resize', layout); layout();
  function setLens(i) { S.lens = i; for (const b of $('dpLens').children) b.classList.toggle('on', +b.dataset.i === i); }
  $('dpLens').onclick = e => { const b = e.target.closest('button'); if (b) setLens(+b.dataset.i); };
  setLens(0);

  // menu
  const items = () => [
    ['Qualité d\'image', A.qualityName(), () => { A.click('bQ'); }],
    ['Identifiants des bâtiments', A.DID.on ? 'Affichés' : 'Masqués', () => A.click('bId')],
    ['Couleur unique par bâtiment', A.DID.colors ? 'Oui' : 'Non', () => A.click('bIdCol')],
    ['Retour caméra', document.documentElement.classList.contains('pip') ? 'Ouvert' : 'Fermé', () => A.click('bPip')],
    ['Orientation de la nacelle', A.GIMBAL.dirs[A.GIMBAL.i][0].toLowerCase(), () => A.click('bCam')],
    ['Heure du jour', '', () => A.click('bTime')],
    ['Grille de cadrage', $('dpGrid').style.display === 'none' ? 'Non' : 'Oui', () => { const g = $('dpGrid'); g.style.display = g.style.display === 'none' ? '' : 'none'; }],
    ['Mode FPS à pied', '›', () => { location.href = 'apied/'; }],
  ];
  function openSheet() { $('dpCard').innerHTML = ''; for (const [t, v, f] of items()) { const d = document.createElement('div'); d.className = 'it'; d.innerHTML = `${t}<span>${v}</span>`; d.onclick = () => { f(); setTimeout(openSheet, 60); }; $('dpCard').appendChild(d); } sheet.style.display = 'block'; }
  $('dpMenuB').onclick = openSheet; sheet.onclick = e => { if (e.target === sheet) sheet.style.display = 'none'; };
  $('dpVid').onclick = () => { A.click('bRec'); setTimeout(() => $('dpVid').classList.toggle('on', !!(A.recording())), 300); };

  // télémétrie
  let telT = 0;
  A.onFrame(dt => {
    if ((telT -= dt) > 0) return; telT = 0.2;
    const P = A.PL, g = A.surfaceH(P.x, P.z);
    $('dpAlt').textContent = Math.round(P.y - g) + ' m'; $('dpSpd').textContent = (P.spd || 0).toFixed(1).replace('.', ',') + ' m/s';
    $('dpWhere').textContent = A.streetName() || '';
  });

  // =========================================================== photo
  async function tilesSettled(maxMs = 6000) {
    const t0 = performance.now(); let calm = 0;
    while (performance.now() - t0 < maxMs) {
      await new Promise(r => setTimeout(r, 120)); const T = A.cityTiles();
      if (!T || (T.stats.downloading === 0 && T.stats.parsing === 0)) { if (++calm >= 4) return; } else calm = 0;
    }
  }
  async function takePhoto(meta = {}) {
    if (S.busy) return null; S.busy = true; $('dpShut').classList.add('busy', 'snap');
    try {
      await tilesSettled(meta.auto ? 7000 : 2500);
      const { renderer, camera } = A, comp = A.composer();
      const [W, H] = PHOTO, pr = renderer.getPixelRatio(), aspect = camera.aspect, fov = camera.fov;
      const hidden = []; for (const L of A.DID.labels.values()) if (L.sp.visible) { L.sp.visible = false; hidden.push(L.sp); }
      const dv = A.drone.visible; A.drone.visible = false;
      // bâtiment au centre de la photo (identifiant IGN exact, passe d'identifiants)
      const ign = meta.ign || A.centreBuilding();
      renderer.setPixelRatio(1); renderer.setSize(W, H, false);
      camera.aspect = 4 / 3; camera.fov = vfov43(LENSES[S.lens].mm); camera.updateProjectionMatrix();
      if (comp) { comp.setPixelRatio(1); comp.setSize(W, H); comp.render(0.016); } else renderer.render(A.scene, camera);
      const blob = await new Promise(r => renderer.domElement.toBlob(r, 'image/jpeg', 0.94));
      camera.aspect = aspect; camera.fov = fov; camera.updateProjectionMatrix(); renderer.setPixelRatio(pr); A.resize();
      for (const s of hidden) s.visible = true; A.drone.visible = dv;
      if (!blob) throw new Error('capture');
      const thumb = await makeThumb(blob);
      const rec = { date: Date.now(), blob, thumb, w: W, h: H, lens: LENSES[S.lens].id, mm: LENSES[S.lens].mm, ign: ign || null,
        adresse: meta.adresse || A.streetName() || '', vue: meta.vue || 'Manuelle',
        pos: { x: +A.PL.x.toFixed(1), alt: +(A.PL.y - A.surfaceH(A.PL.x, A.PL.z)).toFixed(1), z: +A.PL.z.toFixed(1) } };
      rec.id = await dbPut(rec);
      setRoll(thumb); flash();
      return rec;
    } catch (e) { console.warn('photo', e); A.toast('Photo impossible : ' + e.message); return null; }
    finally { S.busy = false; $('dpShut').classList.remove('busy'); setTimeout(() => $('dpShut').classList.remove('snap'), 150); }
  }
  async function makeThumb(blob) {
    const bmp = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    c.getContext('2d').drawImage(bmp, 0, 0, 400, 300); bmp.close && bmp.close();
    return new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
  }
  function flash() { const f = $('dpFlash'); f.style.transition = 'none'; f.style.opacity = 0.85; requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = 0; }); }
  let rollURL = null;
  function setRoll(b) { if (rollURL) URL.revokeObjectURL(rollURL); rollURL = b ? URL.createObjectURL(b) : null; $('dpRoll').style.backgroundImage = rollURL ? `url(${rollURL})` : ''; }
  dbAll().then(L => L[0] && setRoll(L[0].thumb)).catch(() => {});
  $('dpShut').onclick = () => { if (!AUTO.active) takePhoto(); };
  addEventListener('keydown', e => { if (e.code === 'KeyP' && A.mode() === 'plane' && document.activeElement !== $('dpQ')) takePhoto(); });

  // =========================================================== pellicule
  const urls = [];
  async function openGallery() {
    for (const u of urls.splice(0)) URL.revokeObjectURL(u);
    const L = await dbAll(); $('dpGrid2').innerHTML = ''; $('dpGalN').textContent = L.length + ' photo' + (L.length > 1 ? 's' : '');
    if (!L.length) $('dpGrid2').outerHTML = '<div id="dpGrid2"><div class="empty" style="grid-column:1/-1;aspect-ratio:auto;background:none">Aucune photo pour l\'instant.<br>Appuie sur le déclencheur, ou tape une adresse en haut.</div></div>';
    for (const p of L) { const u = URL.createObjectURL(p.thumb); urls.push(u); const d = document.createElement('div'); d.style.backgroundImage = `url(${u})`; d.onclick = () => openPhoto(p); $('dpGrid2').appendChild(d); }
    gal.style.display = 'block';
  }
  let cur = null, curURL = null;
  function openPhoto(p) {
    cur = p; if (curURL) URL.revokeObjectURL(curURL); curURL = URL.createObjectURL(p.blob); $('dpImg').src = curURL;
    const d = new Date(p.date);
    $('dpViewT').textContent = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    $('dpInfo').innerHTML = `<b>${esc(p.adresse || 'Paris')}</b>${esc(p.vue)} · objectif ${p.lens.replace('.', ',')}× (${p.mm} mm) · ${p.w}×${p.h}${p.ign ? '<br>' + esc(p.ign) : ''}`;
    view.style.display = 'block';
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('dpRoll').onclick = openGallery; $('dpGalX').onclick = () => { gal.style.display = 'none'; };
  $('dpViewX').onclick = () => { view.style.display = 'none'; openGallery(); };
  $('dpDel').onclick = async () => { if (!cur) return; await dbDel(cur.id); view.style.display = 'none'; const L = await dbAll(); setRoll(L[0] ? L[0].thumb : null); openGallery(); };
  $('dpShare').onclick = async () => {
    if (!cur) return; const name = 'paris-drone-' + new Date(cur.date).toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.jpg';
    const file = new File([cur.blob], name, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: cur.adresse || 'Paris' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = curURL; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };

  // =========================================================== recherche d'adresse (géocodeur IGN)
  let sugT = 0, sugAbort = null;
  $('dpQ').addEventListener('input', () => { clearTimeout(sugT); sugT = setTimeout(suggest, 220); });
  $('dpQ').addEventListener('keydown', e => { if (e.key === 'Enter') { const f = $('dpSugg').firstChild; if (f) f.click(); else suggest(true); } });
  $('dpQ').addEventListener('blur', () => setTimeout(() => { $('dpSugg').style.display = 'none'; }, 250));
  async function suggest(go) {
    const q = $('dpQ').value.trim(); if (q.length < 3) { $('dpSugg').style.display = 'none'; return; }
    if (sugAbort) sugAbort.abort(); sugAbort = new AbortController();
    try {
      const r = await fetch('https://data.geopf.fr/geocodage/search?index=address&limit=6&lat=48.8566&lon=2.3522&q=' + encodeURIComponent(/paris/i.test(q) ? q : q + ' Paris'), { signal: sugAbort.signal });
      const d = await r.json(); const F = (d.features || []).filter(f => /^75/.test(f.properties.postcode || ''));
      $('dpSugg').innerHTML = '';
      for (const f of F) { const p = f.properties, el = document.createElement('div'); el.innerHTML = `${esc(p.name || p.label)}<small>${esc(p.postcode + ' ' + p.city)}</small>`; el.onclick = () => { $('dpSugg').style.display = 'none'; $('dpQ').value = p.label; $('dpQ').blur(); shootAddress(f); }; $('dpSugg').appendChild(el); }
      $('dpSugg').style.display = F.length ? 'block' : 'none';
      if (go && F[0]) $('dpSugg').firstChild.click();
      if (!F.length && go) A.toast('Adresse introuvable à Paris');
    } catch (e) { if (e.name !== 'AbortError') A.toast('Recherche indisponible'); }
  }

  // =========================================================== géométrie des bâtiments
  const rings = () => A.rings(), tops = A.ringTop;
  function ringsNear(x, z, rad) {
    const out = new Set(), C = A.CELL;
    for (let i = Math.floor((x - rad) / C); i <= Math.floor((x + rad) / C); i++) for (let j = Math.floor((z - rad) / C); j <= Math.floor((z + rad) / C); j++) for (const k of A.ringGrid.get(A.key(i, j)) || []) out.add(k);
    return [...out];
  }
  function inside(r, x, z) { let c = false; for (let k = 0, j = r.length / 2 - 1; k < r.length / 2; j = k++) { const xi = r[2 * k], zi = r[2 * k + 1], xj = r[2 * j], zj = r[2 * j + 1]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; } return c; }
  function edgeDist(r, x, z) { let best = 1e9, bk = -1, bt = 0; for (let k = 0; k < r.length / 2 - 1; k++) { const ax = r[2 * k], az = r[2 * k + 1], dx = r[2 * k + 2] - ax, dz = r[2 * k + 3] - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(x - ax - t * dx, z - az - t * dz); if (d < best) { best = d; bk = k; bt = t; } } return [best, bk, bt]; }
  function solidAt(x, y, z, skip) { for (const i of ringsNear(x, z, 0)) { if (i === skip || tops[i] < y) continue; if (inside(rings()[i], x, z)) return true; } return false; }
  function clearOf(x, y, z, skip, R = 1.4) { // aucun mur plus haut que le drone à moins de R
    for (const i of ringsNear(x, z, R + 1)) { if (i === skip && false) continue; if (tops[i] < y - 0.3) continue; const r = rings()[i]; if (inside(r, x, z)) return false; if (edgeDist(r, x, z)[0] < R) return false; }
    return true;
  }
  function lineClear(P, L, skip) { const d = Math.hypot(L.x - P.x, L.y - P.y, L.z - P.z), n = Math.ceil(d / 0.8); for (let k = 1; k < n; k++) { const t = k / n; if (d * (1 - t) < 2.5) break; const x = P.x + (L.x - P.x) * t, y = P.y + (L.y - P.y) * t, z = P.z + (L.z - P.z) * t; if (y < A.surfaceH(x, z) + 0.3) return false; if (solidAt(x, y, z, skip)) return false; } return true; }

  // façade côté adresse : arête la plus proche, prolongée tant que la direction est la même (±25°)
  function facadeFor(x, z) {
    let best = null;
    for (const i of ringsNear(x, z, 40)) { const r = rings()[i]; const ins = inside(r, x, z); const [d, k, t] = edgeDist(r, x, z); const score = ins ? -1 : d; if (d < 45 && (!best || score < best.score)) best = { i, k, t, score, ins }; }
    if (!best) return null;
    const r = rings()[best.i], m = r.length / 2 - 1, P = k => [r[2 * (((k % m) + m) % m)], r[2 * (((k % m) + m) % m) + 1]];
    const dir = k => { const a = P(k), b = P(k + 1); return Math.atan2(b[1] - a[1], b[0] - a[0]); };
    const d0 = dir(best.k); let k0 = best.k, k1 = best.k;
    const same = a => Math.abs(Math.atan2(Math.sin(a - d0), Math.cos(a - d0))) < 0.44;
    for (let s = 0; s < m && same(dir(k0 - 1)); s++) k0--;
    for (let s = 0; s < m && same(dir(k1 + 1)); s++) k1++;
    const a = P(k0), b = P(k1 + 1), W = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; let nx = -(b[1] - a[1]) / (W || 1), nz = (b[0] - a[0]) / (W || 1);
    // normale vers l'extérieur (vers l'adresse si elle est dehors, sinon loin du centre)
    let cx = 0, cz = 0; for (let k = 0; k < m; k++) { cx += r[2 * k]; cz += r[2 * k + 1]; } cx /= m; cz /= m;
    const ref = best.ins ? [mx - cx, mz - cz] : [x - mx, z - mz]; if (nx * ref[0] + nz * ref[1] < 0) { nx = -nx; nz = -nz; }
    if (!inside(r, mx - nx * 0.5, mz - nz * 0.5)) { nx = -nx; nz = -nz; }
    const g = A.surfaceH(mx + nx * 3, mz + nz * 3), H = Math.max(3, tops[best.i] - g);
    return { i: best.i, mx, mz, nx, nz, W: Math.max(W, 6), g, H, top: tops[best.i] };
  }
  // point de vue : la façade entière dans le cadre (objectif choisi), rien entre le drone et elle
  function viewpoint(F, angDeg, aerial, lens) {
    const h = hfov43(LENSES[lens].mm) * Math.PI / 360, v = vfov43(LENSES[lens].mm) * Math.PI / 360;
    const a = angDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = F.nx * c - F.nz * s, dz = F.nx * s + F.nz * c;
    const look = new THREE.Vector3(F.mx, F.g + F.H * (aerial ? 0.6 : 0.5), F.mz);
    const dW = (F.W * 0.58) / Math.tan(h), dH = (F.H * 0.58) / Math.tan(v), ideal = Math.max(5, dW, dH) * (aerial ? 1.25 : 1) / Math.max(0.6, c);
    const alts = aerial ? [F.top + 22, F.top + 32, F.top + 45] : [look.y, look.y + 4, look.y + 8, look.y + 14, F.top + 6, F.top + 14, F.top + 26];
    const dists = []; for (let f = 1; f >= 0.35; f -= 0.08) dists.push(ideal * f); for (let f = 1.15; f <= 1.6; f += 0.15) dists.push(ideal * f);
    for (const y of alts) for (const d of dists) {
      const P = new THREE.Vector3(F.mx + dx * (d + (aerial ? 12 : 0)), Math.max(y, A.surfaceH(F.mx + dx * d, F.mz + dz * d) + 2.5), F.mz + dz * (d + (aerial ? 12 : 0)));
      if (!clearOf(P.x, P.y, P.z, F.i)) continue;
      if (!lineClear(P, look, F.i)) continue;
      return { P, look, dist: d };
    }
    return null;
  }

  // =========================================================== pilote automatique
  const AUTO = { active: false, wp: [], i: 0, wait: 0, cancel: false };
  A.setAuto(AUTO);
  $('dpStop').onclick = () => stopAuto('Commandes rendues');
  function stopAuto(msg) { AUTO.active = false; AUTO.wp = []; A.GIMBAL.ov = null; $('dpAuto').classList.remove('on'); if (msg) A.toast(msg); }
  function status(t, s) { $('dpAutoT').textContent = t; $('dpAutoS').textContent = s; $('dpAuto').classList.add('on'); }
  async function shootAddress(f) {
    if (A.mode() !== 'plane') return;
    const [lon, lat] = f.geometry.coordinates, [X, Y] = lambert93(lon, lat), x = X - A.CITY.X0, z = -(Y - A.CITY.Y0), label = f.properties.label;
    if (Math.abs(x) > 2950 || Math.abs(z) > 2950) { A.toast('Cette adresse est hors de la zone 3D chargée (centre de Paris pour l\'instant)'); return; }
    const F = facadeFor(x, z); if (!F) { A.toast('Aucun bâtiment trouvé à cette adresse'); return; }
    const shots = [['Façade', 0, false], ['Trois-quarts gauche', 35, false], ['Trois-quarts droite', -35, false], ['Vue aérienne', 0, true]];
    const plan = []; for (const [nm, ang, aer] of shots) { const v = viewpoint(F, ang, aer, S.lens); if (v) plan.push({ nm, ...v }); }
    if (!plan.length) { A.toast('Pas de point de vue dégagé trouvé pour cette façade'); return; }
    // vol : monter au-dessus des toits, traverser, descendre au point de vue
    const P0 = new THREE.Vector3(A.PL.x, A.PL.y, A.PL.z);
    const cruiseFor = (a, b) => { let m = 0; const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 8); for (let k = 0; k <= n; k++) { const t = k / n; m = Math.max(m, A.planeGround(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)); } return Math.max(m + 18, A.surfaceH(a.x, a.z) + 40); };
    AUTO.wp = []; let prev = P0;
    for (const s of plan) {
      const c = Math.max(cruiseFor(prev, s.P), prev.y, s.P.y);
      AUTO.wp.push({ p: new THREE.Vector3(prev.x, c, prev.z), fast: true }, { p: new THREE.Vector3(s.P.x, c, s.P.z), fast: true }, { p: s.P.clone(), shot: s, look: s.look });
      prev = s.P;
    }
    AUTO.i = 0; AUTO.wait = 0; AUTO.active = true; AUTO.label = label; AUTO.F = F; AUTO.done = 0; AUTO.total = plan.length;
    status('En route', label + ' · ' + plan.length + ' photos prévues');
  }
  const tmpV = new THREE.Vector3();
  // appelé par la physique du drone à la place des manches
  AUTO.step = (dt) => {
    const PL = A.PL;
    if (A.DS.lx || A.DS.ly || A.DS.rx || A.DS.ry) { stopAuto('Pilote automatique annulé : commandes reprises'); return false; }
    const w = AUTO.wp[AUTO.i]; if (!w) { stopAuto(); return false; }
    if (AUTO.wait > 0) { AUTO.wait -= dt; PL.vx *= 0.8; PL.vz *= 0.8; PL.vy *= 0.8; return true; }
    tmpV.set(w.p.x - PL.x, w.p.y - PL.y, w.p.z - PL.z);
    const dh = Math.hypot(tmpV.x, tmpV.z), vmax = w.fast ? 15 : 4;
    const want = Math.min(vmax, dh * 0.9 + 0.2), vy = THREE.MathUtils.clamp(tmpV.y * 1.2, -4, 5);
    const k = Math.min(1, dt * 2);
    PL.vx += ((dh > 0.05 ? tmpV.x / dh * want : 0) - PL.vx) * k; PL.vz += ((dh > 0.05 ? tmpV.z / dh * want : 0) - PL.vz) * k; PL.vy += (vy - PL.vy) * k;
    // cap : vers la route pendant le vol, vers la façade au point de vue
    const tgtYaw = w.look ? Math.atan2(w.look.x - PL.x, w.look.z - PL.z) : dh > 3 ? Math.atan2(tmpV.x, tmpV.z) : PL.yaw;
    let dy = tgtYaw - PL.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); PL.yaw += dy * Math.min(1, dt * 2.2);
    if (w.look) { const dd = Math.hypot(w.look.x - PL.x, w.look.z - PL.z); A.GIMBAL.ov = { yaw: 0, tilt: Math.atan2(w.look.y - PL.y, dd) }; } else A.GIMBAL.ov = { yaw: 0, tilt: -0.12 };
    if (dh < 0.35 && Math.abs(tmpV.y) < 0.35 && Math.hypot(PL.vx, PL.vz) < 0.4 && Math.abs(dy) < 0.03) {
      if (w.shot) {
        AUTO.wait = 9; status('Prise de vue', w.shot.nm + ' · ' + AUTO.label);
        takePhoto({ auto: true, adresse: AUTO.label, vue: w.shot.nm }).then(r => { AUTO.done += r ? 1 : 0; AUTO.wait = 0.4; AUTO.i++;
          if (AUTO.i >= AUTO.wp.length) { stopAuto(); A.toast(AUTO.done + ' photo' + (AUTO.done > 1 ? 's' : '') + ' dans la pellicule'); } else status('En route', AUTO.wp[AUTO.i].shot ? AUTO.wp[AUTO.i].shot.nm : 'Point de vue suivant'); });
      } else AUTO.i++;
    }
    return true;
  };
  return { takePhoto, openGallery, AUTO, lambert93, shootAddress, facadeFor, viewpoint };
}
