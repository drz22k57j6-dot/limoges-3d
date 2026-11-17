import { locateApartment, updateFloor } from './locate.js';

const TESTS=[
 ['10 rue de Rivoli, 75004 Paris',4],
 ['1 boulevard Voltaire, 75011 Paris',2],
 ['12 rue de la Ferronnerie, 75001 Paris',1],
 ['10 avenue Victor-Hugo, 75016 Paris',5],
 ['8 avenue de France, 75013 Paris',10],
];
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export async function initAppartStudio({THREE,scene,camera,renderer,CITY,drone,ground}){
 if(window.__appartStudio?.mounted)return;
 const state=window.__appartStudio={mounted:true,current:null,debug:false};
 const style=document.createElement('style');
 style.textContent=`
 #as-launch{position:fixed;z-index:80;left:calc(14px + env(safe-area-inset-left));bottom:calc(18px + env(safe-area-inset-bottom));background:#b51f32;color:#fff;border:1px solid #ffffff55;border-radius:14px;padding:12px 16px;font:700 14px -apple-system,Arial;box-shadow:0 6px 24px #0008;touch-action:manipulation}
 #as-panel{position:fixed;z-index:81;left:10px;right:10px;bottom:calc(72px + env(safe-area-inset-bottom));max-height:72dvh;overflow:auto;background:#10141deF;color:#fff;border:1px solid #ffffff30;border-radius:18px;padding:14px;font:14px/1.4 -apple-system,Arial;display:none;box-shadow:0 10px 35px #0009;touch-action:pan-y}
 #as-panel.on{display:block}#as-panel input,#as-panel select{width:100%;padding:12px;border-radius:10px;border:1px solid #ffffff35;background:#202735;color:#fff;font:16px -apple-system,Arial;touch-action:manipulation}
 #as-panel button{touch-action:manipulation;border:1px solid #ffffff30;border-radius:10px;background:#293445;color:#fff;padding:10px;font:600 13px -apple-system,Arial}
 #as-go{background:#b51f32!important}#as-status{font-size:12px;color:#b9c5d4;min-height:18px;margin:8px 0}
 #as-tests{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}
 #as-adjust{display:flex;gap:8px;align-items:center}#as-adjust button{flex:1}
 #as-debug{font:11px/1.45 ui-monospace,monospace;color:#aab8ca;white-space:pre-wrap;margin-top:10px}
 #as-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}#as-head b{font-size:16px}
 @media(min-width:700px){#as-panel{left:18px;right:auto;width:380px;bottom:18px;max-height:80vh}}
 `;
 document.head.appendChild(style);
 document.body.insertAdjacentHTML('beforeend',`
 <button id="as-launch">APPART STUDIO</button>
 <section id="as-panel" aria-label="Appart Studio">
  <div id="as-head"><b>Localiser un appartement</b><button id="as-close">✕</button></div>
  <input id="as-address" autocomplete="street-address" placeholder="Adresse à Paris…">
  <div id="as-tests"></div>
  <label for="as-floor">Étage (0 = RDC)</label>
  <input id="as-floor" type="number" min="0" max="40" step="1" value="1">
  <div id="as-adjust" style="margin-top:8px"><button id="as-minus">− 10 cm</button><button id="as-plus">+ 10 cm</button></div>
  <button id="as-go" style="width:100%;margin-top:9px">LOCALISER L'APPARTEMENT</button>
  <div id="as-status">5 adresses de démonstration préchargées.</div>
  <div id="as-debug"></div>
 </section>`);
 const panel=document.getElementById('as-panel'),address=document.getElementById('as-address'),floor=document.getElementById('as-floor'),status=document.getElementById('as-status'),debug=document.getElementById('as-debug');
 document.getElementById('as-tests').innerHTML=TESTS.map((t,i)=>'<button data-test="'+i+'">'+(i+1)+'. '+esc(t[0].replace(', Paris',''))+'</button>').join('');
 document.getElementById('as-launch').onclick=()=>panel.classList.toggle('on');
 document.getElementById('as-close').onclick=()=>panel.classList.remove('on');
 document.querySelectorAll('[data-test]').forEach(b=>b.onclick=()=>{const t=TESTS[Number(b.dataset.test)];address.value=t[0];floor.value=t[1];});
 async function run(){
  const old=state.current?.marker;if(old){scene.remove(old);old.traverse(o=>{o.geometry?.dispose?.();if(o.material)o.material.dispose?.();});state.current=null;}
  status.textContent='Géocodage, recherche BAN et emprise IGN…';debug.textContent='';
  document.getElementById('as-go').disabled=true;
  try{
   const result=await locateApartment(address.value,Number(floor.value),{THREE,scene,camera,renderer,CITY,drone,ground});
   state.current=result;
   const p=result.feature.properties,fd=result.floorData;
   status.textContent='✓ '+result.matchMode+' · '+result.address;
   debug.textContent=[
    'ID IGN : '+(p.cleabs||'inconnu'),
    'Hauteur IGN : '+(fd.height.toFixed(2))+' m · étages BD TOPO : '+fd.floors+' (RDC inclus)',
    'RDC : '+fd.hRDC.toFixed(2)+' m · étage courant : '+fd.hEtage.toFixed(2)+' m · toit : '+fd.hToit.toFixed(2)+' m',
    'Plancher : '+fd.offset.toFixed(2)+' m au-dessus du sol + correction '+result.adjust.toFixed(2)+' m',
    'Façade : '+result.facade.edgeAngle.toFixed(3)+' rad · BAN→façade : '+result.facade.distance.toFixed(2)+' m',
    result.exact?'BAN exact : '+result.exact.address.label+' ('+result.exact.address.source+')':'Secours WFS : '+result.fallbackDistance.toFixed(2)+' m du point BAN',
    fd.haussmann?'RDC haut (heuristique haussmannien)':'RDC standard'
   ].join('\n');
  }catch(e){status.textContent='Erreur : '+e.message;debug.textContent='';console.error('[Appart Studio]',e);}
  finally{document.getElementById('as-go').disabled=false;}
 }
 document.getElementById('as-go').onclick=run;
 document.getElementById('as-minus').onclick=()=>adjust(-.1);
 document.getElementById('as-plus').onclick=()=>adjust(.1);
 function adjust(delta){
  const r=state.current;if(!r)return;
  updateFloor(r,delta,ground);
  debug.textContent=debug.textContent.replace(/Correction [^\n]+/,'Correction '+r.adjust.toFixed(2)+' m');
 }
 window.__appartStudio={...state,locate:run,tests:TESTS,adjust};
}
