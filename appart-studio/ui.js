// Appart Studio — interface : adresse → arrivée face à l'immeuble → plan.
import { locateApartment, geocode, orientationName, setApartmentFloor } from './locate.js';
import { createFacadeView } from './view.js';
import { createPlanEditor, ROOM_TYPES } from './planEditor.js';
import { createApartment } from './buildApartment.js';
import { createCam3d } from './cam3d.js';
import { sunPosition, sunDirection } from './sun.js';
import { calculateSolarReport, verifySolarAt } from './solarAnalysis.js';
import { scoreSoleil } from './solarScore.js';
import { findSafeRectangle, footprintArea, floorFitsBuilding } from './footprint.js';
import { automaticWindowCount, automaticWindowPositions, limitApartmentDepth, fractionWithinDay } from './apartmentDefaults.js';

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
.as-ui button{font:inherit;color:#fff;cursor:pointer;touch-action:manipulation;min-width:44px;min-height:44px}
.as-ui input,.as-ui select{font:inherit;min-height:44px;box-sizing:border-box;-webkit-user-select:text;user-select:text}
.as-ui input[type=range]{min-height:44px;touch-action:pan-y}
#as-launch{position:fixed;z-index:80;left:calc(14px + env(safe-area-inset-left));bottom:calc(18px + env(safe-area-inset-bottom));background:linear-gradient(135deg,#e2364d,#b51f32);border:1px solid #ffffff40;border-radius:16px;padding:13px 18px;font-weight:800;letter-spacing:.04em;box-shadow:0 8px 28px #0009}
#as-start,#as-loading{position:fixed;inset:0;z-index:90;display:none;align-items:center;justify-content:center;background:rgba(5,8,12,.22);-webkit-backdrop-filter:none;backdrop-filter:none;padding:18px}
#as-loading{background:rgba(5,8,12,.72);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
#as-candidates{display:none;margin:10px 0;padding:10px;border:1px solid #ffffff22;border-radius:12px;background:#0d141edb}
#as-candidates.on{display:block}#as-candidates .choices{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
#as-candidates button,#as-confirm{border:1px solid #ffffff2a;background:#263343;border-radius:10px;padding:9px 12px;font-weight:700}
#as-confirm-step{display:none;align-items:center;justify-content:space-between;gap:10px;margin:8px 0;padding:10px;border-radius:12px;background:#1b2330}
#as-confirm-step.on{display:flex}#as-confirm-step span{font-size:13px;font-weight:700}
#as-enter{display:none;font-weight:800;background:#1e654a;border-color:#43c58c}#as-enter.on{display:inline-flex}
#as-start.on,#as-loading.on{display:flex}
#as-card{width:min(440px,100%);max-height:calc(100dvh - 36px - env(safe-area-inset-top) - env(safe-area-inset-bottom));overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:#121822f2;border:1px solid #ffffff22;border-radius:24px;padding:24px 20px 20px;box-shadow:0 20px 60px #000a;position:relative}
#as-card h1{margin:0;font-size:26px;letter-spacing:-.02em}#as-card h1 em{font-style:normal;color:#ff4d63}
#as-card p{margin:6px 0 18px;color:#aeb8c7;font-size:14px}
#as-x{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;border:0;background:#ffffff14}
.as-lbl{display:block;font-size:12px;font-weight:700;color:#8b97a8;letter-spacing:.08em;text-transform:uppercase;margin:0 0 6px}
#as-addr{width:100%;box-sizing:border-box;padding:15px 14px;border-radius:14px;border:1px solid #ffffff2a;background:#1b2330;color:#fff;font:17px -apple-system,Arial;outline:none;-webkit-user-select:text;user-select:text}
#as-addr:focus{border-color:#ff4d63}
#as-sug{margin:6px 0 0;border-radius:14px;overflow:hidden;background:#1b2330;border:1px solid #ffffff1a;display:none}
#as-sug.on{display:block}#as-sug button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #ffffff10;background:none;padding:12px 14px}
#as-sug button small{display:block;color:#8b97a8;font-size:12px}
#as-floor-control{display:flex;align-items:center;gap:14px;margin:12px 0 4px}
#as-floor-control input,#as-floor-live input{flex:1;min-width:0;width:100%;accent-color:#ff4d63;height:44px;touch-action:pan-y}
#as-floor-value,#as-floor-live-value{min-width:112px;text-align:right;font-size:20px;font-weight:850;white-space:nowrap;font-variant-numeric:tabular-nums}
#as-floor-live{display:none;align-items:center;gap:10px;margin:8px 0 2px;padding:8px 10px;border-radius:12px;background:#1b2330}
#as-floor-live.on{display:flex}
#as-floor-live-value{font-size:17px;min-width:92px}
#as-go{width:100%;margin-top:18px;height:56px;border-radius:16px;border:0;background:linear-gradient(135deg,#ff4d63,#c8233a);font-weight:800;font-size:17px;box-shadow:0 8px 24px #ff4d6340}
#as-go:disabled{opacity:.45}
#as-err{color:#ff8a9a;font-size:13px;min-height:18px;margin-top:10px}
#as-tests{display:none;margin-top:14px;border-top:1px solid #ffffff18;padding-top:12px}
#as-tests.on{display:block}#as-tests div{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#as-tests button{border:1px solid #ffffff22;background:#1b2330;border-radius:10px;padding:9px 6px;font-size:12px;text-align:left}
#as-spin{width:54px;height:54px;border-radius:50%;border:4px solid #ffffff22;border-top-color:#ff4d63;animation:asr 0.9s linear infinite;margin:0 auto 18px}
@keyframes asr{to{transform:rotate(360deg)}}
#as-loading .box{text-align:center}#as-loading b{font-size:20px;display:block}#as-loading span{color:#aeb8c7;font-size:14px;display:block;margin-top:6px}
#as-bar{position:fixed;z-index:85;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));max-height:calc(100dvh - 20px - env(safe-area-inset-top));overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;display:none;background:#10161ff0;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border:1px solid #ffffff22;border-radius:22px;padding:14px;box-shadow:0 12px 40px #000a}
#as-bar.on{display:block}
#as-bar .t{font-weight:800;font-size:17px}#as-bar .s{color:#aeb8c7;font-size:13px;margin-top:2px}
#as-bar .warn{color:#ffb86b;font-size:12px;margin-top:6px}
#as-bar .row{display:flex;gap:8px;margin-top:12px}
#as-bar .adj{flex:0 0 auto;width:58px;height:50px;border-radius:14px;border:1px solid #ffffff22;background:#1b2330;font-weight:800;font-size:18px}
#as-bar .adjl{align-self:center;color:#8b97a8;font-size:12px;text-align:center;flex:0 0 64px}
#as-draw{flex:1;height:50px;border-radius:14px;border:0;background:linear-gradient(135deg,#ff4d63,#c8233a);font-weight:800}
#as-window-calc{flex:1;height:50px;border-radius:14px;border:1px solid #ffffff25;background:#24536a;font-weight:800;font-size:14px}
#as-window-settings{margin-top:10px;padding:11px;border:1px solid #ffffff24;border-radius:14px;background:#10161ff2}
#as-window-settings .row{display:flex;align-items:center;gap:7px;margin:7px 0}
#as-window-settings .row>label{flex:1;min-width:0;font-size:11px;color:#aeb8c7}
#as-window-settings input,#as-window-settings select{box-sizing:border-box;width:100%;margin-top:4px;padding:8px;border:1px solid #ffffff22;border-radius:9px;background:#1b2330;color:#fff;font:14px -apple-system,Arial}
#as-window-settings .count-btn,#as-personalize{min-width:44px;height:44px;border-radius:10px;border:1px solid #ffffff22;background:#202a38;font-weight:800}
#as-personalize{padding:0 10px;font-size:12px}
#as-window-warning{font-size:11px;color:#ffc17a;line-height:1.4;margin-top:5px}#as-win-custom{display:none;margin-top:8px}
#as-win-custom.on{display:block}
#as-win-custom details{padding:8px 0;border-top:1px solid #ffffff18}
#as-win-custom summary{font-weight:700;font-size:12px;padding:5px}
#as-win-custom .fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
#as-window-results{font-size:12px;color:#d8e2ee;white-space:pre-wrap;margin-top:8px;max-height:180px;overflow:auto}
#as-bar .links{display:flex;justify-content:space-between;margin-top:10px}
#as-bar .links button{border:0;background:none;color:#8b97a8;font-size:13px;padding:4px 2px}
#as-dbg{display:none;margin-top:10px;font:11px/1.45 ui-monospace,Menlo,monospace;color:#9fb0c4;white-space:pre-wrap}
#as-dbg.on{display:block}
#as3-details{display:none;position:absolute;z-index:4;left:10px;right:10px;top:calc(64px + env(safe-area-inset-top));max-height:44vh;overflow:auto;padding:12px;border:1px solid #ffffff28;border-radius:16px;background:#10161ff2;box-shadow:0 12px 36px #000b;pointer-events:auto}
#as3-details.on{display:block}
#as3-dbg-text{font:11px/1.5 ui-monospace,Menlo,monospace;color:#c8d5e5;white-space:pre-wrap}
#as3-verify{width:100%;height:40px;margin-top:8px;border:1px solid #ffffff25;border-radius:10px;background:#24536a;font-weight:800}
#as3-verify-results{margin-top:8px;font-size:12px;line-height:1.5;white-space:pre-wrap;color:#f0e4c7}
@media(min-width:760px){#as-bar{left:50%;right:auto;width:460px;transform:translateX(-50%)}}

/* vue 3D */
#as-3d{position:fixed;inset:0;z-index:88;display:none;pointer-events:none;isolation:isolate}
#as-3d.on{display:block}
#as3-touch{position:absolute;inset:0;z-index:0;pointer-events:auto;touch-action:none}
#as3-top{position:absolute;z-index:2;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top));display:flex;gap:8px;align-items:center;pointer-events:none}
#as3-top button{pointer-events:auto}#as3-title{pointer-events:none}
#as3-top button{width:46px;height:46px;border-radius:14px;border:1px solid #ffffff2a;background:#10161fe0;font-size:19px;flex:0 0 auto;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
#as3-title{flex:1;min-width:0;background:#10161fe0;border:1px solid #ffffff22;border-radius:14px;padding:6px 12px;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
#as3-title b{display:block;font-size:14px}#as3-title span{display:block;font-size:11px;color:#aeb8c7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#as3-bottom{position:absolute;z-index:2;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));pointer-events:none}
#as3-bottom>*{pointer-events:auto}#as3-help{pointer-events:none}
#as3-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:#10161fe8;border:1px solid #ffffff22;border-radius:18px;padding:6px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
#as3-modes button{height:52px;border-radius:13px;border:0;background:none;font-weight:800;font-size:14px}
#as3-modes button.on{background:#ff4d63}
#as3-win{display:none;align-items:center;gap:8px;margin-bottom:8px}
#as3-win.on{display:flex}
#as3-win button{width:52px;height:46px;border-radius:14px;border:1px solid #ffffff2a;background:#10161fe8;font-size:20px;font-weight:800}
#as3-win span{flex:1;text-align:center;background:#10161fe8;border:1px solid #ffffff22;border-radius:14px;height:46px;line-height:46px;font-weight:700;font-size:14px}
#as3-help{text-align:center;font-size:12px;color:#e8edf5;text-shadow:0 1px 3px #000;margin-bottom:8px;transition:opacity .2s}
#as3-help.hidden{display:none}
#as3-sun{background:#10161fe8;border:1px solid #ffffff22;border-radius:14px;padding:5px 9px;margin-bottom:8px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
#as3-sun .sun-head{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800}
#as3-sun .sun-toggle{width:100%;height:44px;border:0;background:transparent;text-align:left;padding:0;font-size:12px;font-weight:800}
#as3-sun .sun-summary{color:#ffd58a;font-variant-numeric:tabular-nums}
#as3-sun .sun-caret{margin-left:auto;color:#aeb8c7}
#as3-sun .sun-controls{display:none;padding-top:5px}
#as3-sun.expanded .sun-controls{display:block}
#as3-sun input[type=range]{width:100%;height:44px;accent-color:#ffbf65;display:block;margin:2px 0}
#as3-sun .sun-shortcuts{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
#as3-sun button{min-width:44px;min-height:44px;height:44px;border-radius:9px;border:1px solid #ffffff20;background:#202a38;font-size:10px;font-weight:700;padding:0 3px}
#as3-sun .sun-toggle{height:44px;border:0;background:transparent}
#as3-sun button.on{background:#a45b26;border-color:#ffd58a}
#as3-sun .sun-play{width:100%;height:44px;margin-top:6px;background:#8a5128;font-size:12px}
#as3-sun .sun-analysis{width:100%;height:44px;margin-top:6px;background:#24536a;font-size:12px}
#as3-sun .sun-report{display:none;margin-top:7px;padding:8px;-webkit-overflow-scrolling:touch;border-radius:10px;background:#080d14;color:#d8e2ee;font-size:11px;white-space:pre-wrap;max-height:180px;overflow:auto}
#as3-sun .sun-report.on{display:block}
#as3-sun .sun-progress{height:4px;background:#ffffff20;border-radius:9px;overflow:hidden;margin-top:6px;display:none}
#as3-sun .sun-progress.on{display:block}
#as3-sun .sun-progress span{display:block;height:100%;width:0;background:#ffd58a;transition:width .12s}
@media(min-width:760px){#as3-sun{max-width:520px;margin-left:auto;margin-right:auto}}

#as3-joy{position:absolute;z-index:3;left:24px;bottom:calc(112px + env(safe-area-inset-bottom));width:116px;height:116px;border-radius:50%;background:#ffffff18;border:2px solid #ffffff40;display:none;pointer-events:auto;touch-action:none}
#as3-joy.on{display:block}
#as3-joy div{position:absolute;left:33px;top:33px;width:46px;height:46px;border-radius:50%;background:#ffffffd0;box-shadow:0 2px 10px #0008}
/* éditeur */
#as-editor{position:fixed;inset:0;z-index:95;background:#0d121a;display:none;flex-direction:column;isolation:isolate}
#as-editor.on{display:flex}
#ase-top{position:relative;z-index:4;display:flex;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top)) 10px 8px;border-bottom:1px solid #ffffff14}
#ase-top button{width:44px;height:44px;border-radius:12px;border:1px solid #ffffff1f;background:#1b2330;font-size:20px;flex:0 0 auto}
#ase-title{flex:1;min-width:0}#ase-title b{display:block;font-size:16px}#ase-title span{display:block;font-size:12px;color:#8b97a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ase-cv{position:relative;z-index:0;flex:1;width:100%;min-height:0;touch-action:none;display:block}
#ase-hint{position:absolute;z-index:1;left:12px;right:12px;bottom:calc(150px + env(safe-area-inset-bottom));text-align:center;font-size:12px;color:#aeb8c7;pointer-events:none;transition:.2s}
#ase-hint.flash{color:#fff;font-weight:700;font-size:14px}
#ase-sheet{position:absolute;z-index:5;left:10px;right:10px;bottom:calc(150px + env(safe-area-inset-bottom));max-height:calc(100dvh - 230px - env(safe-area-inset-top) - env(safe-area-inset-bottom));overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;background:#161e2af5;border:1px solid #ffffff22;border-radius:18px;padding:14px;display:none;box-shadow:0 10px 40px #000b}
#ase-sheet.on{display:block}#ase-sheet b{display:block;margin-bottom:10px}
.ase-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.ase-grid button{height:46px;border-radius:12px;border:2px solid;background:#1b2330;font-size:12px;font-weight:700;padding:0 2px}
.ase-row{display:flex;gap:6px;flex-wrap:wrap}.ase-row button{flex:1;height:46px;border-radius:12px;border:1px solid #ffffff22;background:#1b2330;font-weight:700;min-width:70px}
.ase-danger{background:#5a1d27!important;border-color:#ff4d6366!important}
#ase-bottom{position:relative;z-index:4;padding:8px 10px calc(10px + env(safe-area-inset-bottom));border-top:1px solid #ffffff14;background:#0d121a}
#ase-3d{width:100%;height:44px;border-radius:12px;border:1px dashed #ffffff33;background:none;color:#8b97a8;font-weight:700;margin-bottom:8px}#ase-3d small{font-weight:500;opacity:.7}
#ase-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
#ase-tools button{height:64px;border-radius:16px;border:1px solid #ffffff1f;background:#1b2330;font-weight:700;font-size:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
#ase-tools button i{font-style:normal;font-size:20px;line-height:1}
#ase-tools button.on{background:#ff4d63;border-color:#ff4d63}
`;

export async function initAppartStudio({ THREE, scene, camera, renderer, CITY, drone, ground }) {
  if (window.__appartStudio?.mounted) return;
  const state = { mounted: true, res: null, picked: null, selectedBuildingId: null, buildingConfirmed: false, floor: 2, floorMax: 15, settingsTouched: false, windowSettings: null };
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
    <div id="as-floor-control"><input id="as-floor-range" type="range" min="0" max="15" value="2" step="1"><output id="as-floor-value">2e étage / 15</output></div>
    <button id="as-go" disabled>Voir mon immeuble</button>
    <div id="as-err"></div>
    <div id="as-tests"><span class="as-lbl">Adresses de test</span><div></div></div>
  </div></section>
  <section id="as-3d" class="as-ui">
    <div id="as3-top"><button id="as3-back" aria-label="Retour au plan">←</button><div id="as3-title"><b>Mon appartement</b><span></span></div><button id="as3-details-btn" aria-label="Détails">ⓘ</button><button id="as3-quit" aria-label="Quitter">✕</button></div><div id="as3-details"><div id="as3-dbg-text"></div><button id="as3-verify">Vérifier à l’heure affichée</button><div id="as3-verify-results"></div></div>
    <div id="as3-bottom"><div id="as3-help"></div>
      <div id="as3-win"><button id="as3-wp">‹</button><span id="as3-wl"></span><button id="as3-wn">›</button></div>
      <div id="as3-modes"><button data-m="maquette">Maquette</button><button data-m="visite">Visite</button><button data-m="fenetre">Fenêtres</button></div></div>
  </section>
  <section id="as-loading" class="as-ui"><div class="box"><div id="as-spin"></div><b>On trouve votre immeuble…</b><span id="as-step">Recherche de l'adresse</span></div></section>
  <section id="as-bar" class="as-ui">
    <div class="t" id="as-bt"></div><div class="s" id="as-bs"></div><div class="warn" id="as-bw"></div><div id="as-candidates"></div>
    <div id="as-confirm-step"><span>C’est bien cet immeuble ?</span><button id="as-confirm">Oui, continuer</button></div>
    <div id="as-floor-live"><input id="as-floor-range-live" type="range" min="0" max="15" value="2" step="1"><output id="as-floor-live-value">2e étage / 15</output></div>
    <div class="row"><button class="adj" id="as-m">−</button><div class="adjl">Ajuster<br>la hauteur</div><button class="adj" id="as-p">+</button></div>
    <div id="as-window-settings">
      <div class="row"><b style="flex:1">Fenêtres côté rue</b><button class="count-btn" id="as-count-minus">−</button><b id="as-window-count">1</b><button class="count-btn" id="as-count-plus">+</button><button id="as-personalize">Personnaliser</button></div>
      <div class="row">
        <label>Largeur (m)<input id="as-win-width" type="number" inputmode="decimal" inputmode="decimal" min="0.5" max="4" step="0.05" value="1.20"></label>
        <label>Hauteur (m)<input id="as-win-height" type="number" inputmode="decimal" min="0.5" max="3.5" step="0.05" value="2.10"></label>
      </div>
      <div class="row">
        <label>Allège (m)<input id="as-win-sill" type="number" inputmode="decimal" min="0" max="2" step="0.05" value="0.90"></label>
        <label>Mur façade (m)<input id="as-win-thickness" type="number" inputmode="decimal" min="0.15" max="1.2" step="0.05" value="0.35"></label>
        <label>Plafond (m)<input id="as-win-ceiling" type="number" inputmode="decimal" min="2.2" max="4" step="0.05" value="2.80"></label>
      </div>
      <div id="as-window-warning"></div><div id="as-win-custom"></div><div id="as-window-results"></div>
    </div>
    <div class="row" id="as-draw-actions"><button id="as-window-calc">Calculer</button><button id="as-enter" class="primary">Valider l’étage et entrer</button><button id="as-draw">Modifier le plan</button></div>
    <div class="links"><button id="as-change">← Changer d'adresse</button><button id="as-dbgb">Détails</button><button id="as-quit">Quitter</button></div>
    <div id="as-dbg"></div>
  </section>`);
  const $ = id => document.getElementById(id);
  const defaultWindowSettings = (haussmann,facadeSpan=6) => ({
    count:automaticWindowCount(facadeSpan),facadeSpan,width:1.2,height:haussmann?2.4:2.1,sill:haussmann?0.5:0.9,
    facadeThickness:haussmann?0.5:0.35,ceilingHeight:haussmann?3.0:2.8,customize:false,windows:[]
  });
  state.windowSettings=defaultWindowSettings(false);
  function ensureWindowSettings(){
    const s=state.windowSettings;s.count=Math.max(1,Math.min(8,Number(s.count)||1));s.windows||=[];
    while(s.windows.length<s.count){const i=s.windows.length;s.windows.push({width:s.width,height:s.height,sill:s.sill,positionMode:'distance',distance:(Number(s.facadeSpan)||6)*(i+1)/(s.count+1)});}
    s.windows.length=s.count;return s;
  }
  function settingsForPlan(){const s=ensureWindowSettings();return {count:s.count,width:s.width,height:s.height,sill:s.sill,facadeThickness:s.facadeThickness,ceilingHeight:s.ceilingHeight,customize:!!s.customize,windows:s.customize?s.windows.map(w=>({...w})):[]};}
  function renderWindowSettings(){
    const s=ensureWindowSettings();$('as-window-count').textContent=s.count;
    $('as-win-width').value=s.width;$('as-win-height').value=s.height;$('as-win-sill').value=s.sill;
    $('as-win-thickness').value=s.facadeThickness;$('as-win-ceiling').value=s.ceilingHeight;
    $('as-personalize').textContent=s.customize?'Masquer':'Personnaliser';
    const custom=$('as-win-custom');custom.classList.toggle('on',!!s.customize);
    const tooTall=s.customize?s.windows.some(w=>Number(w.sill??s.sill)+Number(w.height??s.height)>s.ceilingHeight-0.18):Number(s.sill)+Number(s.height)>s.ceilingHeight-0.18;
    $('as-window-warning').textContent=tooTall?'Attention : la fenêtre dépasse la hauteur sous plafond. Sa hauteur réelle sera réduite dans la 3D et le calcul.':'';
    custom.innerHTML=s.customize?s.windows.map((w,i)=>`<details><summary>Fenêtre ${i+1}</summary><div class="fields">
      <label>Largeur (m)<input type="number" inputmode="decimal" min="0.5" max="4" step="0.05" data-wi="${i}" data-wf="width" value="${w.width}"></label>
      <label>Hauteur (m)<input type="number" inputmode="decimal" min="0.5" max="3.5" step="0.05" data-wi="${i}" data-wf="height" value="${w.height}"></label>
      <label>Allège (m)<input type="number" inputmode="decimal" min="0" max="2" step="0.05" data-wi="${i}" data-wf="sill" value="${w.sill}"></label>
      <label>Position<select data-wi="${i}" data-wf="positionMode"><option value="left" ${w.positionMode==='left'?'selected':''}>Gauche</option><option value="center" ${w.positionMode==='center'?'selected':''}>Centre</option><option value="right" ${w.positionMode==='right'?'selected':''}>Droite</option><option value="distance" ${w.positionMode==='distance'?'selected':''}>Distance depuis gauche</option></select></label>
      <label>Distance (m)<input type="number" inputmode="decimal" min="0" max="20" step="0.05" data-wi="${i}" data-wf="distance" value="${w.distance}"></label>
    </div></details>`).join(''):'';
  }
  function floorText(f,max){return f===0?'RDC / '+max:floorName(f)+' / '+max;}
  function syncFloorControls(){
    for(const [rid,vid] of [['as-floor-range','as-floor-value'],['as-floor-range-live','as-floor-live-value']]){
      $(rid).max=state.floorMax;$(rid).value=state.floor;$(vid).textContent=floorText(state.floor,state.floorMax);
    }
  }
  function setFloor(f){
    state.floor=Math.max(0,Math.min(state.floorMax,Math.round(Number(f)||0)));syncFloorControls();
    if(state.res){const fd=setApartmentFloor(state.res,state.floor);view.setFloor(fd);showBar(state.res);}
  }
  const apt = createApartment(ctx), cam3 = createCam3d(ctx);
  cam3.mount($('as-3d'));
  const joy = document.getElementById('as3-joy');
  const bottom = $('as3-bottom');
  const placeJoy = () => { const r = bottom.getBoundingClientRect(); joy.style.bottom = Math.max(12, window.innerHeight - r.top + 12) + 'px'; };
  const bottomObserver = new ResizeObserver(placeJoy); bottomObserver.observe(bottom);
  window.addEventListener('resize', placeJoy); placeJoy();
  const editor = createPlanEditor({ onBack: () => $('as-bar').classList.add('on'), onView3D: () => open3d() });
  renderWindowSettings();
  for(const [id,key,min,max] of [['as-win-width','width',0.5,4],['as-win-height','height',0.5,3.5],['as-win-sill','sill',0,2],['as-win-thickness','facadeThickness',0.15,1.2],['as-win-ceiling','ceilingHeight',2.2,4]]){
    $(id).onchange=e=>{state.windowSettings[key]=Math.max(min,Math.min(max,Number(e.target.value)||min));state.settingsTouched=true;renderWindowSettings();};
  }
  $('as-count-minus').onclick=()=>{state.windowSettings.count=Math.max(1,state.windowSettings.count-1);ensureWindowSettings();renderWindowSettings();state.settingsTouched=true;};
  $('as-count-plus').onclick=()=>{state.windowSettings.count=Math.min(8,state.windowSettings.count+1);ensureWindowSettings();renderWindowSettings();state.settingsTouched=true;};
  $('as-personalize').onclick=()=>{state.windowSettings.customize=!state.windowSettings.customize;ensureWindowSettings();renderWindowSettings();state.settingsTouched=true;};
  $('as-win-custom').addEventListener('change',e=>{
    const i=Number(e.target.dataset.wi),key=e.target.dataset.wf;if(!Number.isInteger(i)||!key||!state.windowSettings.windows[i])return;
    state.windowSettings.windows[i][key]=key==='positionMode'?e.target.value:Number(e.target.value);state.settingsTouched=true;
  });
  $('as-floor-range').oninput=e=>setFloor(e.target.value);
  $('as-floor-range-live').oninput=e=>setFloor(e.target.value);
  syncFloorControls();

  const HELP = { maquette: 'Glisse pour tourner autour · pince pour zoomer', visite: 'Joystick pour marcher · glisse à droite pour regarder', fenetre: 'Ta vraie vue · glisse pour regarder autour' };
  const TYPE_N = Object.fromEntries(ROOM_TYPES.map(([k, n]) => [k, n]));
  let helpTimer = 0;
  function setMode3d(m) {
    apt.setDollhouse(m === 'maquette');
    cam3.setMode(m);
    document.querySelectorAll('#as3-modes button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    $('as3-help').textContent = HELP[m];
    $('as3-help').classList.remove('hidden');
    clearTimeout(helpTimer);
    helpTimer = setTimeout(() => $('as3-help').classList.add('hidden'), 4000);
    $('as3-win').classList.toggle('on', m === 'fenetre'); if (m === 'fenetre') winLabel();
    if (m === 'visite') document.getElementById('as3-sun')?.classList.remove('expanded');
  }
  function winLabel() {
    const ws = cam3.windows(), plan = state.plan3d, w = ws[cam3.win];
    const room = w && plan.pieces.find(r => r.polygone && pointIn(w.centre, r.polygone, 0.45));
    $('as3-wl').textContent = 'Fenêtre ' + (cam3.win + 1) + '/' + ws.length + (room?.type ? ' · ' + TYPE_N[room.type] : '');
  }
  function pointIn(c, poly, tol) {   // la fenêtre est sur le bord : on teste un point légèrement à l'intérieur de chaque côté
    for (const [dx, dy] of [[0, tol], [0, -tol], [tol, 0], [-tol, 0]]) { const p = [c[0] + dx, c[1] + dy]; let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins; } if (ins) return true; }
    return false;
  }
  const sunUI = { date: null, fraction: 0.5, bounds: null, timer: 0, target: null };
  function disposeSolarTrees() {
    for (const group of [state.solarTreeGroup, state.solarGreeneryGroup]) {
      if (!group) continue;
      scene.remove(group);
      group.traverse(o => { o.geometry?.dispose?.(); if (o.material) for (const m of [].concat(o.material)) m.dispose?.(); });
    }
    state.solarTreeGroup = null;
    state.solarGreeneryGroup = null;
  }
  const parisParts = d => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const parisDay = d => { const p = parisParts(d); return new Date(Date.UTC(+p.year, +p.month - 1, +p.day)); };
  function dayBounds(day, lat, lon) {
    const start = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    let first = null, last = null;
    for (let minute = 0; minute < 1440; minute++) {
      const t = new Date(start + minute * 60000);
      if (sunPosition(t, lat, lon).el > 0) { if (first === null) first = t.getTime(); last = t.getTime(); }
    }
    return first === null ? null : { first, last };
  }
  function stopSunDay() { if (sunUI.timer) clearInterval(sunUI.timer); sunUI.timer = 0; const b = document.getElementById('as3-sun-play'); if (b) b.textContent = '▶ Journée accélérée · 12 s'; }
  function updateSunScene() {
    if (!sunUI.bounds || !sunUI.target || !state.res) return;
    const ms = sunUI.bounds.first + (sunUI.bounds.last - sunUI.bounds.first) * sunUI.fraction;
    const date = new Date(ms), p = sunPosition(date, state.res.lat, state.res.lon);
    if (p.el <= 0) { drone.setSun(null); return; }
    drone.setSun(sunDirection(p.az, p.el), sunUI.target);
    const timeText = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(date);
    const label = document.getElementById('as3-sun-summary');
    if (label) label.textContent = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).format(sunUI.date || date) + ' · ' + timeText;
    const hour = document.getElementById('as3-sun-hour'); if (hour) hour.value = String(Math.round(sunUI.fraction * 1000));
  }
  function setSunDate(day) {
    const r = state.res; if (!r) return;
    stopSunDay(); sunUI.date = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    sunUI.bounds = dayBounds(sunUI.date, r.lat, r.lon);
    const dateLabel = document.getElementById('as3-sun-date');
    if (dateLabel) dateLabel.textContent = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', year: 'numeric' }).format(sunUI.date);
    const range = document.getElementById('as3-sun-date-range');
    if (range) {
      const y = sunUI.date.getUTCFullYear(), days = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86400000;
      range.max = String(days - 1); range.value = String(Math.round((sunUI.date - Date.UTC(y, 0, 1)) / 86400000));
    }
    const slider = document.getElementById('as3-sun-hour');
    if (!sunUI.bounds) { if (slider) slider.disabled = true; drone.setSun(null); return; }
    if (slider) slider.disabled = false;
    const today=parisDay(new Date()).getTime()===sunUI.date.getTime();
    sunUI.fraction=fractionWithinDay(Date.now(),sunUI.bounds.first,sunUI.bounds.last,today);updateSunScene();
  }
  function mountSunControls(r, target) {
    let panel = document.getElementById('as3-sun');
    if (!panel) {
      panel = document.createElement('div'); panel.id = 'as3-sun';
      panel.innerHTML = '<div class="sun-head"><button class="sun-toggle" id="as3-sun-toggle" aria-expanded="false">☀ <span class="sun-summary" id="as3-sun-summary">21 juin · --:--</span><span class="sun-caret" id="as3-sun-caret">▾</span></button></div><div class="sun-controls"><div id="as3-sun-date"></div><input id="as3-sun-date-range" aria-label="Date" type="range" min="0" max="365" step="1"><div class="sun-shortcuts"><button data-sundate="winter">21 déc.</button><button data-sundate="spring">21 mars</button><button data-sundate="summer">21 juin</button><button data-sundate="today">Aujourd’hui</button></div><input id="as3-sun-hour" aria-label="Heure entre lever et coucher" type="range" min="0" max="1000" step="1"><button class="sun-play" id="as3-sun-play">▶ Journée accélérée · 12 s</button><button class="sun-analysis" id="as3-sun-analysis">Calculer le soleil par pièce</button><div class="sun-progress" id="as3-sun-progress"><span></span></div><div class="sun-report" id="as3-sun-report"></div></div>';
      $('as3-bottom').insertBefore(panel, $('as3-modes'));
      $('as3-sun-toggle').onclick = () => { const open = panel.classList.toggle('expanded'); $('as3-sun-toggle').setAttribute('aria-expanded', String(open)); $('as3-sun-caret').textContent = open ? '▴' : '▾'; };
      $('as3-sun-analysis').onclick = async () => {
        const button=$('as3-sun-analysis'), report=$('as3-sun-report'), progress=$('as3-sun-progress'), progressFill=progress.firstElementChild;
        if (!state.plan3d || !apt.info) return;
        disposeSolarTrees(); button.disabled=true; button.textContent='Calcul en cours…'; report.classList.add('on'); progress.classList.add('on'); progressFill.style.width='0%'; report.textContent='Préparation du BVH et des arbres…';
        try {
          const result=await calculateSolarReport({THREE,scene,drone,ground,res:r,plan:state.plan3d,fr:apt.info.fr,onProgress:p=>{
            if(p.total) progressFill.style.width=(100*p.done/p.total)+'%';
            report.textContent=p.stage==='arbres'?'Chargement des arbres…':p.stage==='calcul'?'Calcul '+p.done+'/'+p.total+' · fenêtre '+p.window+' · '+p.date:'Finalisation…';
          }});
          state.solarReport=result; state.solarTreeGroup=result.treeGroup; state.solarGreeneryGroup=result.greeneryGroup; window.__appartStudioSolarReport=result;
          const names={sejour:'Séjour',chambre:'Chambre',bureau:'Bureau',dressing:'Dressing',cuisine:'Cuisine',entree:'Entrée',sdb:'Salle de bain',wc:'WC'};
          const roomText=result.rooms.map(room=>{const h=room.hours;return (names[room.type]||room.type||'Pièce')+' · '+room.windows.length+' fenêtre(s) · hiver '+h.winter.toFixed(1)+' h · printemps '+h.spring.toFixed(1)+' h · été '+h.summer.toFixed(1)+' h · aujourd’hui '+h.today.toFixed(1)+' h';}).join('\n');
          const winText=result.windows.map(w=>{const h=w.byDate;return 'Fenêtre '+w.id+' ('+(names[w.roomType]||w.roomType)+') : hiver '+h.winter.hours.toFixed(1)+' h · printemps '+h.spring.hours.toFixed(1)+' h · été '+h.summer.hours.toFixed(1)+' h · aujourd’hui '+h.today.hours.toFixed(1)+' h';}).join('\n');
          const score=scoreSoleil(result.rooms);
          const scoreText=score.grade?'Score Soleil : '+score.grade+' · hiver '+score.winterHours.toFixed(1)+' h · été '+score.summerHours.toFixed(1)+' h · soleil direct simulé, hors météo':'Score Soleil : séjour/chambre non identifié · soleil direct simulé, hors météo';
          report.textContent=scoreText+'\n\nArbres 3D pris en compte : '+result.trees+'\n\nPIÈCES\n'+roomText+'\n\nFENÊTRES\n'+winText;
        } catch(e) { report.textContent='Analyse indisponible : '+e.message; }
        finally { button.disabled=false; button.textContent='Recalculer le soleil par pièce'; }
      };
      panel.querySelectorAll('[data-sundate]').forEach(b => b.onclick = () => {
        const y = sunUI.date?.getUTCFullYear() || parisDay(new Date()).getUTCFullYear();
        const fixed = { winter: [11, 21], spring: [2, 21], summer: [5, 21] };
        const d = b.dataset.sundate === 'today' ? parisDay(new Date()) : new Date(Date.UTC(y, fixed[b.dataset.sundate][0], fixed[b.dataset.sundate][1]));
        panel.querySelectorAll('[data-sundate]').forEach(x => x.classList.toggle('on', x === b)); setSunDate(d);
      });
      $('as3-sun-date-range').oninput = e => { const y = sunUI.date?.getUTCFullYear() || parisDay(new Date()).getUTCFullYear(); setSunDate(new Date(Date.UTC(y, 0, 1 + Number(e.target.value)))); };
      $('as3-sun-hour').oninput = e => { stopSunDay(); sunUI.fraction = Number(e.target.value) / 1000; updateSunScene(); };
      $('as3-sun-play').onclick = () => {
        if (sunUI.timer) { stopSunDay(); return; }
        if (!sunUI.bounds) return;
        const start = performance.now(); $('as3-sun-play').textContent = 'Ⅱ Pause';
        sunUI.timer = setInterval(() => {
          if (!$('as-3d').classList.contains('on')) { stopSunDay(); return; }
          sunUI.fraction = Math.min(1, (performance.now() - start) / 12000); updateSunScene();
          if (sunUI.fraction >= 1) stopSunDay();
        }, 100);
      };
    }
    sunUI.target = target;
    const today = parisDay(new Date()); setSunDate(today);
    panel.querySelectorAll('[data-sundate]').forEach(b => b.classList.toggle('on', b.dataset.sundate === 'today'));
  }
  function open3d(planOverride=null, initialMode='maquette') {
    const r = state.res; if (!r) return;
    state.solarReport = null;
    const plan = planOverride || editor.getPlan(), bounds=computeApartmentBounds(r);
    if(!bounds){$('as-bw').textContent='Aucune emprise sûre ne peut contenir cet appartement.';return;}
    const Hcheck=Math.max(2.2,Math.min(4,Number(plan.settings?.ceilingHeight)||2.8));
    if(!floorFitsBuilding(r.floorData,Hcheck)){$('as-bw').textContent='Étage refusé : plancher + hauteur sous plafond dépassent le toit du bâtiment IGN.';return;}
    plan.footprint=bounds.footprint; state.plan3d = plan;
    window.__setWorld?.('3d');
    const { F, n } = r.local, u = [-n[1], n[0]], v = [-n[0], -n[1]];
    const lvl = r.snap ? r.snap.h : (r.floorData.floor === 0 ? r.floorData.hRDC : r.floorData.hEtage);
    const H = Math.max(2.2, Math.min(4, Number(plan.settings?.ceilingHeight) || Math.max(2.4, Math.min(3.6, lvl - 0.25))));
    const fr = { F, u, v, floorY: view.floorY(r), H, buildingId: r.feature.properties?.cleabs };
    sunUI.target = [F[0], fr.floorY + H / 2, F[1]];
    view.suspend();
    apt.build(plan, fr, { dollhouse: initialMode==='maquette' });
    $('as3-title').querySelector('span').textContent = (r.housenumber ? r.housenumber + ' ' : '') + (r.street || r.address) + ' · ' + floorName(r.floorData.floor) + ' · ' + plan.pieces.reduce((s, p) => s + p.surface, 0).toFixed(1).replace('.', ',') + ' m²';
    $('as-3d').classList.add('on'); placeJoy();
    cam3.start(apt.info, plan, initialMode);
    if(initialMode==='fenetre'){const mainWindow=Math.floor(plan.ouvertures.filter(o=>o.type==='fenetre').length/2);cam3.setMode('fenetre',mainWindow);}
    setMode3d(initialMode);
    mountSunControls(r, sunUI.target);
  }
  function close3d() { stopSunDay(); disposeSolarTrees(); $('as3-details').classList.remove('on'); $('as3-verify-results').textContent = ''; drone.setSun(null); cam3.stop(); apt.hide(); $('as-3d').classList.remove('on'); view.resume(); }
  document.querySelectorAll('#as3-modes button').forEach(b => b.onclick = () => setMode3d(b.dataset.m));
  $('as3-wp').onclick = () => { cam3.nextWindow(-1); winLabel(); };
  $('as3-wn').onclick = () => { cam3.nextWindow(1); winLabel(); };
  $('as3-back').onclick = () => { close3d(); $('as-draw').onclick(); };
  // La découpe est appliquée une fois à l'entrée ; aucune boucle de rescannage de la ville en 3D.

  // le bouton n'apparaît qu'une fois le jeu lancé (écran de chargement fermé)
  const showLaunch = setInterval(() => { if (!$('loader')) { $('as-launch').style.display = ''; clearInterval(showLaunch); } }, 500);

  // Le slider reste à 15 tant que l'immeuble n'est pas identifié.
  state.floorMax=15;setFloor(2);

  // tests cachés : appui long sur le titre
  $('as-tests').querySelector('div').innerHTML = TESTS.map((t, i) => `<button data-t="${i}">${esc(t[0].replace(/, 750\d\d Paris/, ''))}<br><small>${floorName(t[1])}</small></button>`).join('');
  let lp = 0;
  $('as-h1').addEventListener('pointerdown', () => { lp = setTimeout(() => $('as-tests').classList.toggle('on'), 650); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('as-h1').addEventListener(ev, () => clearTimeout(lp));
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const t = TESTS[Number(b.dataset.t)]; $('as-addr').value = t[0]; state.picked = null; state.res=null; state.floorMax=15; setFloor(t[1]); $('as-go').disabled = false; go(); });

  // autocomplétion
  let sugT = 0, sugN = 0;
  $('as-addr').addEventListener('input', () => {
    state.picked = null; $('as-err').textContent = '';
    state.floorMax=15;state.res=null;syncFloorControls();
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
  const enter = () => { document.body.classList.add('as-mode'); $('as-start').classList.add('on'); window.__setWorld?.('photo'); setTimeout(() => $('as-addr').focus(), 250); };
  function quit() {
    stopSunDay(); disposeSolarTrees(); drone.setSun(null); cam3.stop(); apt.hide(); view.hide(); editor.close();
    for (const id of ['as-start', 'as-loading', 'as-bar', 'as-3d']) $(id).classList.remove('on');
    document.body.classList.remove('as-mode'); state.res = null;
  }
  $('as-launch').onclick = enter;
  $('as-x').onclick = () => { if (state.res) { $('as-start').classList.remove('on'); $('as-bar').classList.add('on'); } else quit(); };
  $('as-quit').onclick = quit;
  $('as3-quit').onclick = quit;
  $('as-change').onclick = () => { $('as-floor-live').classList.remove('on'); $('as-confirm-step').classList.remove('on'); state.res=null;state.selectedBuildingId=null;state.buildingConfirmed=false;state.floorMax=15;syncFloorControls();$('as-bar').classList.remove('on');$('as-start').classList.add('on'); };

  // localisation
  async function go() {
    $('as-sug').classList.remove('on'); $('as-err').textContent = '';state.buildingConfirmed=false;
    const q = $('as-addr').value.trim(); if (!q) return;
    $('as-start').classList.remove('on'); $('as-loading').classList.add('on'); $('as-step').textContent = 'Recherche de l\'adresse';
    try {
      const res = await locateApartment(q, state.floor, ctx, state.picked, state.selectedBuildingId);
      state.floorMax=Math.max(0,(Number(res.floorData.floors)||16)-1);
      if(state.floor>state.floorMax)setApartmentFloor(res,state.floorMax);
      state.floor=res.floorData.floor;
      if(!state.settingsTouched){state.windowSettings=defaultWindowSettings(res.floorData.haussmann);renderWindowSettings();}
      syncFloorControls();
      $('as-step').textContent = 'Chargement du quartier';
      const F = res.local.F, n = res.local.n;
      await drone.teleport(F[0] + n[0] * 8, F[1] + n[1] * 8, { nom: res.address, dist: 0, alt: 25 });
      $('as-step').textContent = 'Calcul de votre étage';
      const v = await view.show(res);
      disposeSolarTrees(); state.solarReport = null; state.res = res; res.gap = v.gap;
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
  $('as-confirm').onclick=()=>{state.buildingConfirmed=true;$('as-confirm-step').classList.remove('on');$('as-floor-live').classList.add('on');syncFloorControls();};
  $('as-addr').addEventListener('input',()=>{state.picked=null;state.selectedBuildingId=null;});

  function showBar(res) {
    const fd = res.floorData, street = res.street || res.address.replace(/^\d+\w?\s+/, '').replace(/\s+\d{5}.*$/, '');
    $('as-bt').textContent = (res.housenumber ? res.housenumber + ' ' : '') + (street || res.address);
    $('as-bs').textContent = floorName(fd.floor) + ' · façade ' + orientationName(res.local.bearing) + ' · rue de ' + Math.round(res.gap ?? 0) + ' m' + (res.snap ? ' · calé sur les fenêtres ✓' : '');
    $('as-bw').textContent = res.matchMode !== 'adresse exacte' && res.matchMode !== 'bâtiment choisi' ? 'Immeuble proposé par proximité BAN : vérifie le contour avant de continuer.' : '';
    const candidates=res.candidateFeatures||[],$c=$('as-candidates');
    if(candidates.length>1){$c.classList.add('on');$c.innerHTML='<b>Plusieurs bâtiments proches — choisis le bon</b><div class="choices">'+candidates.map((c,i)=>'<button data-candidate="'+esc(c.id)+'">Bâtiment '+String.fromCharCode(65+i)+' · '+Math.round(c.distance)+' m</button>').join('')+'</div>';$c.querySelectorAll('[data-candidate]').forEach(b=>b.onclick=()=>{state.selectedBuildingId=b.dataset.candidate;go();});}
    else{$c.classList.remove('on');$c.innerHTML='';}
    $('as-confirm-step').classList.toggle('on',!state.buildingConfirmed);
    $('as-floor-live').classList.toggle('on',state.buildingConfirmed);$('as-enter').classList.toggle('on',state.buildingConfirmed);syncFloorControls();renderDbg();
  }
  function renderDbg() {
    const r = state.res; if (!r) return;
    const p = r.feature.properties || {}, fd = r.floorData;
    const when = sunUI.bounds ? new Date(sunUI.bounds.first + (sunUI.bounds.last - sunUI.bounds.first) * sunUI.fraction) : new Date();
    const sp = sunPosition(when, r.lat, r.lon), n = r.local.n;
    const incidence = Math.acos(Math.max(-1, Math.min(1, Math.cos(sp.el * Math.PI / 180) * (Math.sin(sp.az * Math.PI / 180) * n[0] - Math.cos(sp.az * Math.PI / 180) * n[1])))) * 180 / Math.PI;
    const facadeSun = sp.el > 0 && Math.cos(incidence * Math.PI / 180) > 0.02;
    const score = state.solarReport ? scoreSoleil(state.solarReport.rooms) : null;
    const scoreText = score?.grade
      ? 'Score Soleil : ' + score.grade + ' · hiver ' + score.winterHours.toFixed(1) + ' h · été ' + score.summerHours.toFixed(1) + ' h · soleil direct simulé, hors météo'
      : 'Score Soleil : analyse des pièces requise · soleil direct simulé, hors météo';
    $('as-dbg').textContent = [
      'ID IGN : ' + (p.cleabs || '?') + ' · ' + r.matchMode,
      'Hauteur : ' + fd.height.toFixed(1) + ' m · niveaux IGN : ' + fd.floors + ' (RDC compris)',
      'RDC ' + fd.hRDC.toFixed(2) + ' m · étage ' + fd.hEtage.toFixed(2) + ' m' + (fd.haussmann ? ' · haussmannien' : ''),
      (r.snap ? 'Plancher calé sur la façade : ' + r.snap.y.toFixed(2) + ' m alt. · niveau ' + r.snap.h.toFixed(2) + ' m' : 'Plancher estimé : ' + fd.offset.toFixed(2) + ' m au-dessus du sol') + ' · correction ' + (r.adjust >= 0 ? '+' : '') + r.adjust.toFixed(2),
      'Façade : ' + Math.round(r.local.bearing) + '° · adresse → façade ' + r.facade.distance.toFixed(1) + ' m · rue ' + (r.gap ?? 0).toFixed(1) + ' m',
      'Diagnostic emprise : '+r.matchMode+' · candidats crédibles '+(r.candidateCount??1)+' · surface IGN '+(computeApartmentBounds(r)?.footprintArea?.toFixed(1)??'—')+' m²',
      'Profondeur sûre : '+(computeApartmentBounds(r)?.safeBounds?.v1?.toFixed(2)??'—')+' m · hauteur bâtiment / plancher : '+fd.height.toFixed(1)+' / '+fd.offset.toFixed(1)+' m',
      'Écart volume affiché / emprise : non mesuré (aucune correspondance métrique vérifiée entre tuiles 3D et WFS).',
      'Soleil : azimut ' + sp.az.toFixed(1) + '° · élévation ' + sp.el.toFixed(1) + '° · incidence façade ' + incidence.toFixed(1) + '° · soleil sur la façade : ' + (facadeSun ? 'oui' : 'non'),
      scoreText,
      'Programmes WebGL : ' + (renderer.info.programs?.length ?? 'indisponible'),
      'FPS : ' + Math.round(window.__fps || 0),
    ].join('\n');
    if ($('as3-dbg-text')) $('as3-dbg-text').textContent = $('as-dbg').textContent;
  }
  function computeApartmentBounds(r){
    const {F,A,B,n}=r.local,u=[-n[1],n[0]],v=[-n[0],-n[1]],pu=P=>(P[0]-F[0])*u[0]+(P[1]-F[1])*u[1];
    const north=[-u[1],-v[1]],span=[pu(A),pu(B)].sort((a,b)=>a-b),source=r.local.footprints||[[r.local.ring]];
    const footprint=source.map(poly=>poly.map(ring=>ring.map(P=>{const dx=P[0]-F[0],dz=P[1]-F[1];return [dx*u[0]+dz*u[1],dx*v[0]+dz*v[1]];})));
    const safe=findSafeRectangle(footprint,span,{frontMargin:0.15,sideMargin:0.15,maxDepth:8,minWidth:1.5,minDepth:1.5,step:0.05});
    if(!safe)return null;return {F,u,v,north,span,safeBounds:{u0:safe.u0,u1:safe.u1,v1:safe.v1},footprint,footprintArea:footprintArea(footprint)};
  }
  function makeSettingsPlan(r){
    const bounds=computeApartmentBounds(r);if(!bounds)throw new Error('Emprise IGN trop étroite pour calculer un appartement.');
    const s=settingsForPlan(),u0=bounds.safeBounds.u0,u1=bounds.safeBounds.u1,depth=limitApartmentDepth(bounds.safeBounds.v1,8,1.5),span=u1-u0,autoPositions=automaticWindowPositions(span,s.count);
    const murs=[{id:'F',a:[u0,0],b:[u1,0],epaisseur:s.facadeThickness,facade:true},
      {id:'E',a:[u1,0],b:[u1,depth],epaisseur:0.25,ext:true},{id:'S',a:[u1,depth],b:[u0,depth],epaisseur:0.25,ext:true},{id:'W',a:[u0,depth],b:[u0,0],epaisseur:0.25,ext:true}];
    const ouvertures=[];
    for(let i=0;i<s.count;i++){
      const c=s.customize?s.windows[i]:null,width=Number(c?.width??s.width)||1.2,mode=c?.positionMode||'distance',dist=Number(c?.distance);
      const along=mode==='left'?width/2+0.2:mode==='center'?span/2:mode==='right'?span-width/2-0.2:Number.isFinite(dist)&&dist>0&&c?dist:autoPositions[i];
      const center=Math.max(width/2+0.2,Math.min(span-width/2-0.2,along));
      ouvertures.push({id:'w'+(i+1),murId:'F',type:'fenetre',centre:[u0+center,0],largeur:width,hauteur:Number(c?.height??s.height)||2.1,allege:Number(c?.sill??s.sill)});
    }
    return {murs,ouvertures,pieces:[{id:'r0',type:'sejour',polygone:[[u0,0],[u1,0],[u1,depth],[u0,depth]],surface:span*depth}],settings:s};
  }
  $('as-enter').onclick=()=>{
    const r=state.res;if(!r||!state.buildingConfirmed)return;
    try{const bounds=computeApartmentBounds(r);if(!bounds)throw new Error('Emprise insuffisante : il faut au moins 1,5 m de profondeur exploitable.');
      const plan=makeSettingsPlan(r);plan.footprint=bounds.footprint;limitApartmentDepth(bounds.safeBounds.v1,8,1.5);open3d(plan,'fenetre');
    }catch(e){$('as-bw').textContent=e.message||String(e);}
  };
  $('as-window-calc').onclick=async()=>{
    const r=state.res;if(!r)return;const button=$('as-window-calc'),out=$('as-window-results');
    button.disabled=true;button.textContent='Calcul…';out.textContent='Calcul des fenêtres, embrasures et masques…';disposeSolarTrees();state.solarReport=null;
    try{
      const bounds=computeApartmentBounds(r);if(!bounds)throw new Error('Emprise IGN trop étroite pour calculer un appartement.');
      const plan=makeSettingsPlan(r);plan.footprint=bounds.footprint;const fr={F:bounds.F,u:bounds.u,v:bounds.v,floorY:view.floorY(r),H:plan.settings.ceilingHeight};
      if(!floorFitsBuilding(r.floorData,fr.H))throw new Error('Étage refusé : plancher + hauteur sous plafond dépassent le toit du bâtiment IGN.');
      const result=await calculateSolarReport({THREE,scene,drone,ground,res:r,plan,fr,onProgress:p=>{out.textContent=p.stage==='calcul'?'Calcul '+p.done+'/'+p.total+' fenêtres/dates…':'Préparation des obstacles et arbres…';}});
      state.solarReport=result;state.solarTreeGroup=result.treeGroup;state.solarGreeneryGroup=result.greeneryGroup;renderDbg();
      const score=scoreSoleil(result.rooms),keys=['winter','spring','summer','today'],labels={winter:'Hiver',spring:'Printemps',summer:'Été',today:'Aujourd’hui'};
      out.textContent='SCORE SOLEIL : '+(score.grade||'—')+(score.grade?' · '+score.winterHours.toFixed(1)+' h hiver · '+score.summerHours.toFixed(1)+' h été':' · pièce non classée')+
        '\nSoleil direct simulé, hors météo\n\n'+result.windows.map((w,i)=>{const h=w.byDate;return 'Fenêtre '+(i+1)+' : '+keys.map(k=>labels[k]+' '+h[k].hours.toFixed(1)+' h').join(' · ');}).join('\n');
    }catch(e){out.textContent='Calcul impossible : '+(e.message||e);}
    finally{button.disabled=false;button.textContent='Recalculer';}
  };
  setInterval(() => { if ($('as-dbg').classList.contains('on')) renderDbg(); }, 1000);
  $('as-dbgb').onclick = () => $('as-dbg').classList.toggle('on');
  $('as3-details-btn').onclick = () => { $('as3-details').classList.toggle('on'); renderDbg(); };
  $('as3-verify').onclick = async () => {
    const out = $('as3-verify-results'), button = $('as3-verify');
    if (!state.plan3d || !apt.info || !$('as-3d').classList.contains('on')) { out.textContent = 'Entrez d’abord dans la vue 3D.'; return; }
    const when = sunUI.bounds ? new Date(sunUI.bounds.first + (sunUI.bounds.last - sunUI.bounds.first) * sunUI.fraction) : new Date();
    const time = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(when);
    button.disabled = true; button.textContent = 'Vérification…'; out.textContent = 'Calcul des rayons directs à ' + time + ' (heure de Paris)…';
    disposeSolarTrees();
    try {
      const result = await verifySolarAt({ THREE, scene, drone, ground, res: state.res, plan: state.plan3d, fr: apt.info.fr, date: when });
      state.solarTreeGroup = result.treeGroup;
      state.solarGreeneryGroup = result.greeneryGroup;
      out.textContent = 'À ' + time + ' (heure de Paris) · ' + result.trees + ' arbres pris en compte\\n' +
        result.windows.map((w, i) => 'Fenêtre ' + (i + 1) + ' : soleil ' + (w.sun ? 'oui' : 'non') + ' · vitre éclairée ' + Math.round(w.fraction * 100) + ' %').join('\\n');
    } catch (e) { out.textContent = 'Vérification impossible : ' + e.message; }
    finally { button.disabled = false; button.textContent = 'Re-vérifier à l’heure affichée'; }
  };
  const adjust = d => { const r = state.res; if (!r) return; r.adjust = Math.round((r.adjust + d) * 100) / 100; view.refresh(); renderDbg(); };
  $('as-m').onclick = () => adjust(-0.1);
  $('as-p').onclick = () => adjust(0.1);

  // plan
  $('as-draw').onclick = () => {
    const r=state.res;if(!r)return;
    const bounds=computeApartmentBounds(r);
    if(!bounds){$('as-bw').textContent='Emprise IGN trop étroite ou irrégulière pour garantir le placement de cet appartement.';return;}
    $('as-bar').classList.remove('on');
    editor.open({key:r.address+'|'+r.floorData.floor,title:r.address+' · '+floorName(r.floorData.floor),
      street:r.street,orient:orientationName(r.local.bearing),north:bounds.north,facadeSpan:bounds.span,safeBounds:bounds.safeBounds,settings:settingsForPlan()});
    state.frame={F:bounds.F,u:bounds.u,v:bounds.v,floorY:view.floorY(r)};
  };

  Object.assign(state, { open: enter, quit, tests: TESTS, editor, view, apt, cam3, open3d, setMode3d });
}
