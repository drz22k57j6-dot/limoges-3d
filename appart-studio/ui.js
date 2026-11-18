// Appart Studio — interface : adresse → arrivée face à l'immeuble → plan.
import { locateApartment, geocode, orientationName } from './locate.js';
import { createFacadeView } from './view.js';
import { createPlanEditor, ROOM_TYPES } from './planEditor.js';
import { createApartment } from './buildApartment.js';
import { createCam3d } from './cam3d.js';

// adresses de démonstration : rue Cler (7e), là où le moteur de façades habille les vraies rues
const TESTS = [
  ['38 Rue Cler, 75007 Paris', 2], ['33 Rue Cler, 75007 Paris', 4], ['44 Rue Cler, 75007 Paris', 5],
  ['46 Rue Cler, 75007 Paris', 3], ['40 Rue Cler, 75007 Paris', 1],
  ['10 Rue de Rivoli, 75004 Paris', 4], ['15 Rue des Écouffes, 75004 Paris', 1], ['10 Avenue Victor-Hugo, 75016 Paris', 5],
];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const floorName = f => f === 0 ? 'Rez-de-chaussée' : f === 1 ? '1er étage' : f + 'e étage';

const CSS = `
body.as-mode > :not(#c):not(.as-ui):not(script):not(style){display:none!important}
body.as-mode #as-launch{display:none!important}
.as-ui{font:15px/1.35 -apple-system,BlinkMacSystemFont,'SF Pro Text',Arial;color:#fff;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.as-ui button{font:inherit;color:#fff;cursor:pointer;touch-action:manipulation}
#as-launch{position:fixed;z-index:80;left:calc(14px + env(safe-area-inset-left));bottom:calc(18px + env(safe-area-inset-bottom));background:linear-gradient(135deg,#e2364d,#b51f32);border:1px solid #ffffff40;border-radius:16px;padding:13px 18px;font-weight:800;letter-spacing:.04em;box-shadow:0 8px 28px #0009}
#as-start,#as-loading{position:fixed;inset:0;z-index:90;display:none;align-items:center;justify-content:center;background:#05080dcc;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);padding:18px}
#as-start.on,#as-loading.on{display:flex}
#as-card{width:min(440px,100%);background:#121822f2;border:1px solid #ffffff22;border-radius:24px;padding:24px 20px 20px;box-shadow:0 20px 60px #000a;position:relative}
#as-card h1{margin:0;font-size:26px;letter-spacing:-.02em}#as-card h1 em{font-style:normal;color:#ff4d63}
#as-card p{margin:6px 0 18px;color:#aeb8c7;font-size:14px}
#as-x{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;border:0;background:#ffffff14}
.as-lbl{display:block;font-size:12px;font-weight:700;color:#8b97a8;letter-spacing:.08em;text-transform:uppercase;margin:0 0 6px}
#as-addr{width:100%;box-sizing:border-box;padding:15px 14px;border-radius:14px;border:1px solid #ffffff2a;background:#1b2330;color:#fff;font:17px -apple-system,Arial;outline:none;-webkit-user-select:text;user-select:text}
#as-addr:focus{border-color:#ff4d63}
#as-sug{margin:6px 0 0;border-radius:14px;overflow:hidden;background:#1b2330;border:1px solid #ffffff1a;display:none}
#as-sug.on{display:block}#as-sug button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #ffffff10;background:none;padding:12px 14px}
#as-sug button small{display:block;color:#8b97a8;font-size:12px}
#as-floors{display:flex;gap:7px;overflow-x:auto;padding:2px 0 4px;margin-top:16px;scrollbar-width:none}#as-floors::-webkit-scrollbar{display:none}
#as-floors button{flex:0 0 auto;min-width:52px;height:46px;border-radius:12px;border:1px solid #ffffff22;background:#1b2330;font-weight:700}
#as-floors button.on{background:#ff4d63;border-color:#ff4d63}
#as-go{width:100%;margin-top:18px;height:56px;border-radius:16px;border:0;background:linear-gradient(135deg,#ff4d63,#c8233a);font-weight:800;font-size:17px;box-shadow:0 8px 24px #ff4d6340}
#as-go:disabled{opacity:.45}
#as-err{color:#ff8a9a;font-size:13px;min-height:18px;margin-top:10px}
#as-tests{display:none;margin-top:14px;border-top:1px solid #ffffff18;padding-top:12px}
#as-tests.on{display:block}#as-tests div{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#as-tests button{border:1px solid #ffffff22;background:#1b2330;border-radius:10px;padding:9px 6px;font-size:12px;text-align:left}
#as-spin{width:54px;height:54px;border-radius:50%;border:4px solid #ffffff22;border-top-color:#ff4d63;animation:asr 0.9s linear infinite;margin:0 auto 18px}
@keyframes asr{to{transform:rotate(360deg)}}
#as-loading .box{text-align:center}#as-loading b{font-size:20px;display:block}#as-loading span{color:#aeb8c7;font-size:14px;display:block;margin-top:6px}
#as-bar{position:fixed;z-index:85;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));display:none;background:#10161ff0;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border:1px solid #ffffff22;border-radius:22px;padding:14px;box-shadow:0 12px 40px #000a}
#as-bar.on{display:block}
#as-bar .t{font-weight:800;font-size:17px}#as-bar .s{color:#aeb8c7;font-size:13px;margin-top:2px}
#as-bar .warn{color:#ffb86b;font-size:12px;margin-top:6px}
#as-bar .row{display:flex;gap:8px;margin-top:12px}
#as-bar .adj{flex:0 0 auto;width:58px;height:50px;border-radius:14px;border:1px solid #ffffff22;background:#1b2330;font-weight:800;font-size:18px}
#as-bar .adjl{align-self:center;color:#8b97a8;font-size:12px;text-align:center;flex:0 0 64px}
#as-draw{flex:1;height:50px;border-radius:14px;border:0;background:linear-gradient(135deg,#ff4d63,#c8233a);font-weight:800}
#as-bar .links{display:flex;justify-content:space-between;margin-top:10px}
#as-bar .links button{border:0;background:none;color:#8b97a8;font-size:13px;padding:4px 2px}
#as-dbg{display:none;margin-top:10px;font:11px/1.45 ui-monospace,Menlo,monospace;color:#9fb0c4;white-space:pre-wrap}
#as-dbg.on{display:block}
@media(min-width:760px){#as-bar{left:50%;right:auto;width:460px;transform:translateX(-50%)}}

/* vue 3D */
#as-3d{position:fixed;inset:0;z-index:88;display:none;pointer-events:none}
#as-3d.on{display:block}
#as3-touch{position:absolute;inset:0;pointer-events:auto;touch-action:none}
#as3-top{position:absolute;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top));display:flex;gap:8px;align-items:center;pointer-events:auto}
#as3-top button{width:46px;height:46px;border-radius:14px;border:1px solid #ffffff2a;background:#10161fe0;font-size:19px;flex:0 0 auto;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
#as3-title{flex:1;min-width:0;background:#10161fe0;border:1px solid #ffffff22;border-radius:14px;padding:6px 12px;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
#as3-title b{display:block;font-size:14px}#as3-title span{display:block;font-size:11px;color:#aeb8c7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#as3-bottom{position:absolute;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));pointer-events:auto}
#as3-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:#10161fe8;border:1px solid #ffffff22;border-radius:18px;padding:6px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
#as3-modes button{height:52px;border-radius:13px;border:0;background:none;font-weight:800;font-size:14px}
#as3-modes button.on{background:#ff4d63}
#as3-win{display:none;align-items:center;gap:8px;margin-bottom:8px}
#as3-win.on{display:flex}
#as3-win button{width:52px;height:46px;border-radius:14px;border:1px solid #ffffff2a;background:#10161fe8;font-size:20px;font-weight:800}#as3-wo{width:auto!important;padding:0 12px;font-size:13px!important;white-space:nowrap}
#as3-win span{flex:1;text-align:center;background:#10161fe8;border:1px solid #ffffff22;border-radius:14px;height:46px;line-height:46px;font-weight:700;font-size:14px}
#as3-help{text-align:center;font-size:12px;color:#e8edf5;text-shadow:0 1px 3px #000;margin-bottom:8px}
#as3-joy{position:absolute;left:24px;bottom:calc(112px + env(safe-area-inset-bottom));width:116px;height:116px;border-radius:50%;background:#ffffff18;border:2px solid #ffffff40;display:none;pointer-events:auto;touch-action:none}
#as3-joy.on{display:block}
#as3-joy div{position:absolute;left:33px;top:33px;width:46px;height:46px;border-radius:50%;background:#ffffffd0;box-shadow:0 2px 10px #0008}
/* éditeur */
#as-editor{position:fixed;inset:0;z-index:95;background:#0d121a;display:none;flex-direction:column}
#as-editor.on{display:flex}
#ase-top{display:flex;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top)) 10px 8px;border-bottom:1px solid #ffffff14}
#ase-top button{width:44px;height:44px;border-radius:12px;border:1px solid #ffffff1f;background:#1b2330;font-size:20px;flex:0 0 auto}
#ase-title{flex:1;min-width:0}#ase-title b{display:block;font-size:16px}#ase-title span{display:block;font-size:12px;color:#8b97a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ase-cv{flex:1;width:100%;min-height:0;touch-action:none;display:block}
#ase-hint{position:absolute;left:12px;right:12px;bottom:calc(150px + env(safe-area-inset-bottom));text-align:center;font-size:12px;color:#aeb8c7;pointer-events:none;transition:.2s}
#ase-hint.flash{color:#fff;font-weight:700;font-size:14px}
#ase-sheet{position:absolute;left:10px;right:10px;bottom:calc(150px + env(safe-area-inset-bottom));background:#161e2af5;border:1px solid #ffffff22;border-radius:18px;padding:14px;display:none;box-shadow:0 10px 40px #000b}
#ase-sheet.on{display:block}#ase-sheet b{display:block;margin-bottom:10px}
.ase-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.ase-grid button{height:46px;border-radius:12px;border:2px solid;background:#1b2330;font-size:12px;font-weight:700;padding:0 2px}
.ase-row{display:flex;gap:6px;flex-wrap:wrap}.ase-row button{flex:1;height:46px;border-radius:12px;border:1px solid #ffffff22;background:#1b2330;font-weight:700;min-width:70px}
.ase-danger{background:#5a1d27!important;border-color:#ff4d6366!important}
#ase-bottom{padding:8px 10px calc(10px + env(safe-area-inset-bottom));border-top:1px solid #ffffff14;background:#0d121a}
#ase-3d{width:100%;height:44px;border-radius:12px;border:1px dashed #ffffff33;background:none;color:#8b97a8;font-weight:700;margin-bottom:8px}#ase-3d small{font-weight:500;opacity:.7}
#ase-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
#ase-tools button{height:64px;border-radius:16px;border:1px solid #ffffff1f;background:#1b2330;font-weight:700;font-size:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
#ase-tools button i{font-style:normal;font-size:20px;line-height:1}
#ase-tools button.on{background:#ff4d63;border-color:#ff4d63}
`;

export async function initAppartStudio({ THREE, scene, camera, renderer, CITY, drone, ground }) {
  if (window.__appartStudio?.mounted) return;
  const state = { mounted: true, res: null, picked: null, floor: 2 };
  window.__appartStudio = state;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const ctx = { THREE, scene, camera, renderer, CITY, drone, ground };
  const view = createFacadeView(ctx);

  document.body.insertAdjacentHTML('beforeend', `
  <button id="as-launch" class="as-ui" style="display:none">APPART STUDIO</button>
  <section id="as-start" class="as-ui"><div id="as-card">
    <button id="as-x" aria-label="Fermer">✕</button>
    <h1 id="as-h1">Appart <em>Studio</em></h1>
    <p>Votre appartement en 3D, à votre étage, avec votre vraie vue et votre vrai soleil.</p>
    <label class="as-lbl" for="as-addr">Adresse de l'appartement</label>
    <input id="as-addr" type="text" inputmode="text" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" placeholder="Ex. 38 rue Cler">
    <div id="as-sug"></div>
    <span class="as-lbl" style="margin-top:16px">Étage</span>
    <div id="as-floors"></div>
    <button id="as-go" disabled>Voir mon immeuble</button>
    <div id="as-err"></div>
    <div id="as-tests"><span class="as-lbl">Adresses de test</span><div></div></div>
  </div></section>
  <section id="as-3d" class="as-ui">
    <div id="as3-top"><button id="as3-back" aria-label="Retour au plan">←</button><div id="as3-title"><b>Mon appartement</b><span></span></div><button id="as3-quit" aria-label="Quitter">✕</button></div>
    <div id="as3-bottom"><div id="as3-help"></div>
      <div id="as3-win"><button id="as3-wp">‹</button><span id="as3-wl"></span><button id="as3-wn">›</button><button id="as3-wo">Ouvrir</button></div>
      <div id="as3-modes"><button data-m="maquette">Maquette</button><button data-m="visite">Visite</button><button data-m="fenetre">Fenêtres</button></div></div>
  </section>
  <section id="as-loading" class="as-ui"><div class="box"><div id="as-spin"></div><b>On trouve votre immeuble…</b><span id="as-step">Recherche de l'adresse</span></div></section>
  <section id="as-bar" class="as-ui">
    <div class="t" id="as-bt"></div><div class="s" id="as-bs"></div><div class="warn" id="as-bw"></div>
    <div class="row"><button class="adj" id="as-m">−</button><div class="adjl">Ajuster<br>la hauteur</div><button class="adj" id="as-p">+</button></div>
    <div class="row"><button id="as-draw">C'est bien mon étage → Dessiner mon plan</button></div>
    <div class="links"><button id="as-change">← Changer d'adresse</button><button id="as-dbgb">Détails</button><button id="as-quit">Quitter</button></div>
    <div id="as-dbg"></div>
  </section>`);
  const $ = id => document.getElementById(id);
  const apt = createApartment(ctx), cam3 = createCam3d(ctx);
  cam3.mount($('as-3d'));
  const editor = createPlanEditor({ onBack: () => $('as-bar').classList.add('on'), onView3D: () => open3d() });
  const HELP = { maquette: 'Glisse pour tourner autour · pince pour zoomer', visite: 'Joystick pour marcher · glisse à droite pour regarder', fenetre: 'Ta vraie vue · glisse pour regarder autour' };
  const TYPE_N = Object.fromEntries(ROOM_TYPES.map(([k, n]) => [k, n]));
  function setMode3d(m) {
    apt.setDollhouse(m === 'maquette');
    cam3.setMode(m);
    document.querySelectorAll('#as3-modes button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    $('as3-help').textContent = HELP[m];
    $('as3-win').classList.toggle('on', m === 'fenetre'); if (m === 'fenetre') winLabel();
  }
  function winLabel() {
    const ws = cam3.windows(), plan = state.plan3d, w = ws[cam3.win];
    const room = w && plan.pieces.find(r => r.polygone && pointIn(w.centre, r.polygone, 0.45));
    $('as3-wl').textContent = 'Fenêtre ' + (cam3.win + 1) + '/' + ws.length + (room?.type ? ' · ' + TYPE_N[room.type] : '');
    $('as3-wo').textContent = cam3.windowOpen(cam3.win) ? 'Fermer' : 'Ouvrir';
  }
  function pointIn(c, poly, tol) {   // la fenêtre est sur le bord : on teste un point légèrement à l'intérieur de chaque côté
    for (const [dx, dy] of [[0, tol], [0, -tol], [tol, 0], [-tol, 0]]) { const p = [c[0] + dx, c[1] + dy]; let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins; } if (ins) return true; }
    return false;
  }
  async function waitFacadeMetadata(id, timeout = 3000) {
    const until = performance.now() + timeout;
    while (performance.now() < until) {
      const L = window.__facadeEtages?.get(id);
      if (L?.length) return L;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return window.__facadeEtages?.get(id) || [];
  }
  function open3d() {
    const r = state.res; if (!r) return;
    const plan = editor.getPlan(); state.plan3d = plan;
    const { F, n } = r.local, u = [-n[1], n[0]], v = [-n[0], -n[1]];
    const lvl = r.snap ? r.snap.h : (r.floorData.floor === 0 ? r.floorData.hRDC : r.floorData.hEtage);
    const H = Math.max(2.4, Math.min(3.6, lvl - 0.25));
    const facadeList = window.__facadeEtages?.get(r.feature.properties?.cleabs) || [];
    const facadeMeta = facadeList.reduce((best,e) => { const dx=e.b[0]-e.a[0],dz=e.b[1]-e.a[1],l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((F[0]-e.a[0])*dx+(F[1]-e.a[1])*dz)/l2)),d=Math.hypot(F[0]-e.a[0]-dx*t,F[1]-e.a[1]-dz*t); return !best || d<best.d ? {e,d} : best; },null)?.e;
    const floorY = view.floorY(r);
    const facadeIndex = facadeMeta?.ent && r.floorData.floor >= 1 ? r.floorData.floor + 1 : r.floorData.floor;
    const edgeA = facadeMeta?.a, edgeB = facadeMeta?.b;
    const edgeDx = edgeB ? edgeB[0] - edgeA[0] : 0, edgeDz = edgeB ? edgeB[1] - edgeA[1] : 0, edgeLen = Math.hypot(edgeDx, edgeDz) || 1;
    const facadeWindows = (facadeMeta?.travees?.[facadeIndex] || []).map((w,i) => {
      const wx=edgeA[0]+edgeDx/edgeLen*w.position, wz=edgeA[1]+edgeDz/edgeLen*w.position;
      return { id: facadeMeta.k+':'+facadeIndex+':'+i, u:(wx-F[0])*u[0]+(wz-F[1])*u[1], width:w.width, allege:w.allege, height:w.height, guardrail:!!w.guardrail };
    });
    plan.ouvertures = plan.ouvertures.map(o => {
      if (o.type !== 'fenetre' || !o.centre || !facadeWindows.length) return o;
      const bay=facadeWindows.reduce((best,x)=>!best||Math.abs(x.u-o.centre[0])<Math.abs(best.u-o.centre[0])?x:best,null);
      return { ...o, guardrail: !!bay?.guardrail };
    });
    let facadeProxy = null;
    if (facadeMeta && edgeA && edgeB) {
      const depth=facadeMeta.facadeDepth ?? .34, midX=(edgeA[0]+edgeB[0])/2+v[0]*depth, midZ=(edgeA[1]+edgeB[1])/2+v[1]*depth;
      facadeProxy = new THREE.Mesh(new THREE.PlaneGeometry(edgeLen,H),new THREE.MeshBasicMaterial({ side:THREE.DoubleSide, colorWrite:false }));
      facadeProxy.position.set(midX,floorY+H/2,midZ);
      facadeProxy.rotation.y=Math.atan2(-edgeDz,edgeDx);
      facadeProxy.updateMatrixWorld(true);
    }
    const fr = { F, u, v, floorY, H, buildingId: r.feature.properties?.cleabs, facadeDepth: facadeMeta?.facadeDepth ?? 0.34, facadeProxy, makeGuardrail: facadeMeta?.makeGuardrail, facadeWindows };
    view.suspend();
    apt.build(plan, fr, { dollhouse: true });
    $('as3-title').querySelector('span').textContent = (r.housenumber ? r.housenumber + ' ' : '') + (r.street || r.address) + ' · ' + floorName(r.floorData.floor) + ' · ' + plan.pieces.reduce((s, p) => s + p.surface, 0).toFixed(1).replace('.', ',') + ' m²';
    $('as-3d').classList.add('on');
    cam3.start(apt.info, plan, 'maquette'); setMode3d('maquette');
  }
  function close3d() { cam3.stop(); apt.hide(); $('as-3d').classList.remove('on'); view.resume(); }
  document.querySelectorAll('#as3-modes button').forEach(b => b.onclick = () => setMode3d(b.dataset.m));
  $('as3-wp').onclick = () => { cam3.nextWindow(-1); winLabel(); };
  $('as3-wn').onclick = () => { cam3.nextWindow(1); winLabel(); };
  $('as3-wo').onclick = () => { cam3.toggleCurrentWindow(); winLabel(); };
  $('as3-back').onclick = () => { close3d(); $('as-draw').onclick(); };
  setInterval(() => { if ($('as-3d').classList.contains('on')) apt.tick(0.5); }, 500);

  // le bouton n'apparaît qu'une fois le jeu lancé (écran de chargement fermé)
  const showLaunch = setInterval(() => { if (!$('loader')) { $('as-launch').style.display = ''; clearInterval(showLaunch); } }, 500);

  // étages
  $('as-floors').innerHTML = Array.from({ length: 16 }, (_, f) => `<button data-f="${f}">${f === 0 ? 'RDC' : f}</button>`).join('');
  const setFloor = f => { state.floor = f; document.querySelectorAll('#as-floors button').forEach(b => b.classList.toggle('on', Number(b.dataset.f) === f)); };
  document.querySelectorAll('#as-floors button').forEach(b => b.onclick = () => setFloor(Number(b.dataset.f)));
  setFloor(2);

  // tests cachés : appui long sur le titre
  $('as-tests').querySelector('div').innerHTML = TESTS.map((t, i) => `<button data-t="${i}">${esc(t[0].replace(/, 750\d\d Paris/, ''))}<br><small>${floorName(t[1])}</small></button>`).join('');
  let lp = 0;
  $('as-h1').addEventListener('pointerdown', () => { lp = setTimeout(() => $('as-tests').classList.toggle('on'), 650); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('as-h1').addEventListener(ev, () => clearTimeout(lp));
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const t = TESTS[Number(b.dataset.t)]; $('as-addr').value = t[0]; state.picked = null; setFloor(t[1]); $('as-go').disabled = false; go(); });

  // autocomplétion
  let sugT = 0, sugN = 0;
  $('as-addr').addEventListener('input', () => {
    state.picked = null; $('as-err').textContent = '';
    const q = $('as-addr').value.trim(); $('as-go').disabled = q.length < 4;
    clearTimeout(sugT);
    if (q.length < 3) { $('as-sug').classList.remove('on'); return; }
    sugT = setTimeout(async () => {
      const n = ++sugN;
      try {
        const list = await geocode(q, CITY, 5); if (n !== sugN) return;
        $('as-sug').innerHTML = list.map((f, i) => `<button data-s="${i}">${esc(f.properties.name || f.properties.label)}<small>${esc(f.properties.postcode || '')} ${esc(f.properties.city || '')}</small></button>`).join('');
        $('as-sug').classList.toggle('on', list.length > 0);
        $('as-sug').querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
          const f = list[Number(b.dataset.s)]; state.picked = f; $('as-addr').value = f.properties.label; $('as-sug').classList.remove('on'); $('as-go').disabled = false; $('as-addr').blur();
        });
      } catch (e) { /* l'autocomplétion est un confort : on se tait */ }
    }, 250);
  });
  $('as-addr').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('as-go').disabled) go(); });

  // ouverture / fermeture
  const enter = () => { document.body.classList.add('as-mode'); $('as-start').classList.add('on'); setTimeout(() => $('as-addr').focus(), 250); };
  function quit() {
    cam3.stop(); apt.hide(); view.hide(); editor.close();
    for (const id of ['as-start', 'as-loading', 'as-bar', 'as-3d']) $(id).classList.remove('on');
    document.body.classList.remove('as-mode'); state.res = null;
  }
  $('as-launch').onclick = enter;
  $('as-x').onclick = () => { if (state.res) { $('as-start').classList.remove('on'); $('as-bar').classList.add('on'); } else quit(); };
  $('as-quit').onclick = quit;
  $('as3-quit').onclick = quit;
  $('as-change').onclick = () => { $('as-bar').classList.remove('on'); $('as-start').classList.add('on'); };

  // localisation
  async function go() {
    $('as-sug').classList.remove('on'); $('as-err').textContent = '';
    const q = $('as-addr').value.trim(); if (!q) return;
    $('as-start').classList.remove('on'); $('as-loading').classList.add('on'); $('as-step').textContent = 'Recherche de l\'adresse';
    try {
      const res = await locateApartment(q, state.floor, ctx, state.picked);
      if (res.facadeChoices?.length > 1) {
        const choices = res.facadeChoices.map((c,i) => (i+1) + '. ' + c.street).join('\n');
        const answer = window.prompt('Votre appartement donne sur :\n' + choices + '\n\nSaisis le numéro de la rue :', '1');
        if (answer !== null) {
          const selected = res.facadeChoices[Number(answer)-1];
          if (selected) { res.street = selected.street; res.facade = selected.facade; res.local = selected.local; }
        }
      }
      $('as-step').textContent = 'Chargement du quartier';
      await waitFacadeMetadata(res.feature.properties?.cleabs, 3000);
      const F = res.local.F, n = res.local.n;
      await drone.teleport(F[0] + n[0] * 8, F[1] + n[1] * 8, { nom: res.address, dist: 0, alt: 25 });
      $('as-step').textContent = 'Calcul de votre étage';
      const v = await view.show(res);
      state.res = res; res.gap = v.gap;
      view.onSnap(() => { if (state.res === res) showBar(res); });
      showBar(res);
      $('as-loading').classList.remove('on'); $('as-bar').classList.add('on');
    } catch (e) {
      console.error('[Appart Studio]', e);
      $('as-loading').classList.remove('on'); $('as-start').classList.add('on');
      $('as-err').textContent = e.message || 'Erreur inattendue.';
    }
  }
  $('as-go').onclick = go;

  function showBar(res) {
    const fd = res.floorData, street = res.street || res.address.replace(/^\d+\w?\s+/, '').replace(/\s+\d{5}.*$/, '');
    $('as-bt').textContent = (res.housenumber ? res.housenumber + ' ' : '') + (street || res.address);
    $('as-bs').textContent = floorName(fd.floor) + ' · façade ' + orientationName(res.local.bearing) + ' · rue de ' + Math.round(res.gap ?? 0) + ' m' + (res.snap ? ' · calé sur les fenêtres ✓' : '');
    $('as-bw').textContent = fd.floor > fd.topFloor ? 'Attention : selon l\'IGN, cet immeuble a ' + (fd.topFloor + 1) + ' niveaux (RDC compris).' : (res.matchMode !== 'adresse exacte' ? 'Immeuble choisi par proximité : vérifie que c\'est le bon.' : '');
    renderDbg();
  }
  function renderDbg() {
    const r = state.res; if (!r) return;
    const p = r.feature.properties || {}, fd = r.floorData;
    $('as-dbg').textContent = [
      'ID IGN : ' + (p.cleabs || '?') + ' · ' + r.matchMode,
      'Hauteur : ' + fd.height.toFixed(1) + ' m · niveaux IGN : ' + fd.floors + ' (RDC compris)',
      'RDC ' + fd.hRDC.toFixed(2) + ' m · étage ' + fd.hEtage.toFixed(2) + ' m' + (fd.haussmann ? ' · haussmannien' : ''),
      (r.snap ? 'Plancher calé sur la façade : ' + r.snap.y.toFixed(2) + ' m alt. · niveau ' + r.snap.h.toFixed(2) + ' m' : 'Plancher estimé : ' + fd.offset.toFixed(2) + ' m au-dessus du sol') + ' · correction ' + (r.adjust >= 0 ? '+' : '') + r.adjust.toFixed(2),
      'Façade : ' + Math.round(r.local.bearing) + '° · adresse → façade ' + r.facade.distance.toFixed(1) + ' m · rue ' + (r.gap ?? 0).toFixed(1) + ' m',
      'FPS : ' + Math.round(window.__fps || 0),
    ].join('\n');
  }
  setInterval(() => { if ($('as-dbg').classList.contains('on')) renderDbg(); }, 1000);
  $('as-dbgb').onclick = () => $('as-dbg').classList.toggle('on');
  const adjust = d => { const r = state.res; if (!r) return; r.adjust = Math.round((r.adjust + d) * 100) / 100; view.refresh(); renderDbg(); };
  $('as-m').onclick = () => adjust(-0.1);
  $('as-p').onclick = () => adjust(0.1);

  // plan
  $('as-draw').onclick = () => {
    const r = state.res; if (!r) return;
    const { F, A, B, n } = r.local, u = [-n[1], n[0]], v = [-n[0], -n[1]];
    const pu = P => (P[0] - F[0]) * u[0] + (P[1] - F[1]) * u[1];
    const north = [0 * u[0] + -1 * u[1], 0 * v[0] + -1 * v[1]];        // nord local = (0,-1) exprimé dans le plan
    const pv = P => (P[0] - F[0]) * v[0] + (P[1] - F[1]) * v[1];
    const span = [pu(A), pu(B)].sort((a, b) => a - b);
    const footprint = r.local.ring.map(P => [pu(P), pv(P)]);
    const facadeEdge = [[pu(A), pv(A)], [pu(B), pv(B)]];
    const id = r.feature.properties?.cleabs, facades = window.__facadeEtages?.get(id) || [];
    let facade = null, bestD = Infinity;
    for (const e of facades) { const dx=e.b[0]-e.a[0], dz=e.b[1]-e.a[1], l2=dx*dx+dz*dz||1; const t=Math.max(0,Math.min(1,((F[0]-e.a[0])*dx+(F[1]-e.a[1])*dz)/l2)); const d=Math.hypot(F[0]-e.a[0]-dx*t,F[1]-e.a[1]-dz*t); if(d<bestD){bestD=d;facade=e;} }
    const floorIndex = facade?.ent && r.floorData.floor >= 1 ? r.floorData.floor + 1 : r.floorData.floor;
    const facadeWindows = (facade?.travees?.[floorIndex] || []).map((w,i) => { const dx=facade.b[0]-facade.a[0], dz=facade.b[1]-facade.a[1], L=Math.hypot(dx,dz)||1; const along=((dx/L)*u[0]+(dz/L)*u[1])>=0?w.position:L-w.position; const world=[facade.a[0]+dx/L*along, facade.a[1]+dz/L*along]; return { id: facade.k+':'+floorIndex+':'+i, u: pu(world), width: w.width, allege: w.allege, height: w.height }; });
    $('as-bar').classList.remove('on');
    editor.open({
      key: r.address + '|' + r.floorData.floor, title: r.address + ' · ' + floorName(r.floorData.floor),
      street: r.street, orient: orientationName(r.local.bearing), north, facadeSpan: span, footprint, facadeEdge, facadeWindows,
    });
    state.frame = { F, u, v, floorY: view.floorY(r) };
  };

  Object.assign(state, { open: enter, quit, tests: TESTS, editor, view, apt, cam3, open3d, setMode3d });
}
