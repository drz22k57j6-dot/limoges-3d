/* Appart Studio — QA tactile Lot 0.
 * À exécuter dans la console du navigateur après avoir ouvert Appart Studio.
 * Préférer DevTools responsive : 390 × 844, émulation tactile activée.
 * Le script ne quitte pas l'appartement et restaure les valeurs qu'il modifie.
 */
(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = el => {
    if (!el || !el.isConnected || el.disabled) return false;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0;
  };
  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const describe = el => el ? (el.id ? '#'+el.id : el.tagName.toLowerCase()+(el.className && typeof el.className==='string' ? '.'+el.className.trim().replace(/\s+/g,'.') : '')) : 'null';
  const results = [];
  const testHit = el => {
    const [x,y] = center(el), hit = document.elementFromPoint(x,y);
    const ok = hit === el || el.contains(hit);
    results.push({control:describe(el),x:Math.round(x),y:Math.round(y),hit:describe(hit),ok,stack:document.elementsFromPoint(x,y).slice(0,5).map(describe)});
    return ok;
  };
  const testRange = async el => {
    const old = el.value, min = Number(el.min || 0), max = Number(el.max || 100), step = Number(el.step || 1);
    const next = Number(old) + (Number(old) + step <= max ? step : -step);
    el.value = String(next); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
    await sleep(30);
    const ok = Number(el.value) !== Number(old);
    results.push({control:describe(el),valueChanged:ok,before:old,after:el.value});
    return ok;
  };
  const testNumber = async el => {
    const old = el.value, min = Number(el.min || 0), max = Number(el.max || 9999), step = Number(el.step || 0.05);
    const next = Number(old) + (Number(old) + step <= max ? step : -step);
    el.value = String(Number(next.toFixed(3))); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
    await sleep(30);
    const ok = Number(el.value) !== Number(old);
    results.push({control:describe(el),valueChanged:ok,before:old,after:el.value});
    el.value = old; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
    return ok;
  };
  const controls = [...document.querySelectorAll('.as-ui button:not(:disabled),.as-ui input:not(:disabled),.as-ui select:not(:disabled),#ase-sheet button:not(:disabled),#ase-sheet input:not(:disabled),#ase-sheet select:not(:disabled)')].filter(visible);
  for (const el of controls) testHit(el);

  for (const selector of ['#as-floor-range','#as-floor-range-live','#as3-sun-date-range','#as3-sun-hour']) {
    const el=document.querySelector(selector); if(visible(el)){testHit(el);await testRange(el);}
  }
  for (const el of document.querySelectorAll('#as-win-width,#as-win-height,#as-win-sill,#as-win-thickness,#as-win-ceiling,#as-win-custom input,#ase-op-w,#ase-op-pos,#ase-op-h,#ase-op-sill,#ase-thickness,#ase-ceiling')) {
    if(visible(el)){testHit(el);await testNumber(el);}
  }

  const minus=document.querySelector('#as-count-minus'),plus=document.querySelector('#as-count-plus'),count=document.querySelector('#as-window-count');
  if(visible(minus)&&visible(plus)&&count){
    const before=count.textContent;testHit(minus);minus.click();await sleep(20);
    const down=count.textContent!==before;plus.click();await sleep(20);
    const restored=count.textContent===before;
    results.push({control:'boutons − / +',valueChanged:down&&restored,before,after:count.textContent});
  }
  const personalize=document.querySelector('#as-personalize'),custom=document.querySelector('#as-win-custom');
  if(visible(personalize)&&custom){
    const before=custom.classList.contains('on');testHit(personalize);personalize.click();const changed=custom.classList.contains('on')!==before;
    personalize.click();results.push({control:'#as-personalize',valueChanged:changed});
  }
  const failures=results.filter(r=>r.ok===false||r.valueChanged===false);
  const report={viewport:{width:innerWidth,height:innerHeight,hasTouch:navigator.maxTouchPoints>0,maxTouchPoints:navigator.maxTouchPoints},controlsFound:controls.length,checks:results.length,failures,results};
  console.log('[Appart Studio Touch QA]',report);
  window.__appartStudioTouchQA=report;
  if(failures.length) console.error('ÉCHEC : contrôles bloqués ou sans changement de valeur.',failures);
  else console.info('Hit-tests et changements de valeurs ciblés : OK. Cela ne remplace pas un vrai test au doigt sur iPhone.');
  return report;
})();
