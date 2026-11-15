// Fiche d'un bâtiment réel (commune à la carte et au jeu 3D) : type, habitants, valeur, loyers, équipe propriétaire du QG.
// Expose window.BAT. Les styles sont préfixés #bat… pour ne rien casser dans les pages hôtes.
(() => {
  const PRIX = { appart: 1531, maison: 1864 };   // € / m², médianes des ventes 2025 à Limoges (DVF)
  const LOYER = { appart: 11.41, maison: 10.0 }; // € / m² / mois hors charges
  const LOYER_COMMERCE = 10;                      // € / m² / mois — hypothèse du jeu, pas une donnée
  const PERS_PAR_LOGEMENT = 1.9;                  // hypothèse (taille moyenne des ménages)
  const TYPES = {
    hab: { n: 'Habitation', c: '#4ea8ff' }, com: { n: 'Commerce / services', c: '#ff9f0a' }, mix: { n: 'Habitation + commerce', c: '#bf5af2' },
    ind: { n: 'Industrie', c: '#a2845e' }, spo: { n: 'Sport', c: '#30d158' }, rel: { n: 'Culte', c: '#ffd60a' }, agr: { n: 'Agricole', c: '#7a9a3a' },
    ann: { n: 'Annexe (garage, abri)', c: '#636a76' }, ind0: { n: 'Non précisé', c: '#b8bec8' },
  };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = id => document.getElementById(id);
  function typeOf(p) {
    const u = [p.usage_1, p.usage_2], res = u.includes('Résidentiel'), com = u.includes('Commercial et services');
    if (res && com) return 'mix'; if (res) return 'hab'; if (com) return 'com';
    if (p.usage_1 === 'Indifférencié' && p.nombre_de_logements > 0) return 'hab';
    return { 'Industriel': 'ind', 'Sportif': 'spo', 'Religieux': 'rel', 'Agricole': 'agr', 'Annexe': 'ann' }[p.usage_1] || 'ind0';
  }
  const idOf = f => f.properties.identifiants_rnb || f.properties.cleabs;

  // ---------- Lambert-93 -> WGS84 (pour le jeu 3D, dont le repère est en Lambert-93) ----------
  const A = 6378137, F = 1 / 298.257222101, E = Math.sqrt(2 * F - F * F), LON0 = 3 * Math.PI / 180, P0 = 46.5 * Math.PI / 180, P1 = 44 * Math.PI / 180, P2 = 49 * Math.PI / 180;
  const mF = p => Math.cos(p) / Math.sqrt(1 - E * E * Math.sin(p) ** 2), tF = p => Math.tan(Math.PI / 4 - p / 2) / ((1 - E * Math.sin(p)) / (1 + E * Math.sin(p))) ** (E / 2);
  const N = (Math.log(mF(P1)) - Math.log(mF(P2))) / (Math.log(tF(P1)) - Math.log(tF(P2))), FF = mF(P1) / (N * tF(P1) ** N), R0 = A * FF * tF(P0) ** N;
  function fromL93(x, y) { const dx = x - 700000, dy = R0 - (y - 6600000), r = Math.hypot(dx, dy), t = (r / (A * FF)) ** (1 / N), th = Math.atan2(dx, dy); let p = Math.PI / 2 - 2 * Math.atan(t); for (let i = 0; i < 8; i++) p = Math.PI / 2 - 2 * Math.atan(t * ((1 - E * Math.sin(p)) / (1 + E * Math.sin(p))) ** (E / 2)); return [(th / N + LON0) * 180 / Math.PI, p * 180 / Math.PI]; }
  function toL93(lon, lat) { const p = lat * Math.PI / 180, r = A * FF * tF(p) ** N, th = N * (lon * Math.PI / 180 - LON0); return [700000 + r * Math.sin(th), 6600000 + R0 - r * Math.cos(th)]; }

  // ---------- données IGN (BD TOPO) ----------
  const PROPS = 'cleabs,usage_1,usage_2,nombre_de_logements,nombre_d_etages,hauteur,date_d_apparition,materiaux_des_murs,materiaux_de_la_toiture,identifiants_rnb,construction_legere,geometrie';
  const wfs = p => 'https://data.geopf.fr/wfs/ows?' + new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: 'BDTOPO_V3:batiment', OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326', PROPERTYNAME: PROPS, ...p });
  function inRing(x, y, r) { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins; }
  const contains = (f, lon, lat) => f.geometry.coordinates.some(poly => inRing(lon, lat, poly[0]));
  async function featureAt(lon, lat, radius = 4) {
    const d = await (await fetch(wfs({ COUNT: '20', CQL_FILTER: `DWITHIN(geometrie,POINT(${lat} ${lon}),${radius},meters)` }))).json();
    if (!d.features.length) return null;
    return d.features.find(f => contains(f, lon, lat)) || d.features.sort((a, b) => (b.properties.hauteur || 0) - (a.properties.hauteur || 0))[0];
  }
  async function featureById(id) {
    const f = /^BATIMENT/.test(id) ? `cleabs='${id}'` : `identifiants_rnb LIKE '%${String(id).replace(/[^A-Z0-9]/gi, '')}%'`;
    const d = await (await fetch(wfs({ COUNT: '1', CQL_FILTER: f }))).json(); return d.features[0] || null;
  }
  const centre = f => { const c = f.geometry.coordinates[0][0]; return [c.reduce((s, q) => s + q[0], 0) / c.length, c.reduce((s, q) => s + q[1], 0) / c.length]; };

  // ---------- interface ----------
  const css = document.createElement('style');
  css.textContent = `#batRing{position:fixed;z-index:100000;width:64px;height:64px;margin:-32px 0 0 -32px;pointer-events:none;display:none}
#batCard{position:fixed;z-index:100001;left:0;right:0;bottom:0;max-height:72dvh;overflow:auto;background:#161a22;color:#eee;border-radius:18px 18px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom));transform:translateY(105%);transition:transform .25s;box-shadow:0 -10px 40px #0008;font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;text-align:left;-webkit-user-select:text;user-select:text}
#batCard.on{transform:none}
@media (min-width:800px),(orientation:landscape) and (max-height:600px){#batCard{left:auto;right:12px;bottom:12px;top:12px;width:380px;max-height:none;border-radius:18px;transform:translateX(110%)}#batCard.on{transform:none}}
#batCard h2{margin:0 0 2px;font-size:20px;letter-spacing:0}#batCard .addr{color:#9aa6b8;margin-bottom:10px}
#batCard .type{display:inline-block;padding:3px 10px;border-radius:10px;font-weight:700;color:#111;margin-bottom:10px}
#batCard .big{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0 12px}
#batCard .big div{background:#0e1117;border-radius:12px;padding:9px 8px}#batCard .big small{color:#9aa6b8;font-size:11px;display:block}#batCard .big b{font-size:17px}
#batCard table{width:100%;border-collapse:collapse;font-size:13px}#batCard td{padding:6px 2px;border-bottom:1px solid #262c38;vertical-align:top}#batCard td:first-child{color:#9aa6b8;width:45%}
#batCard .src{font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:4px;white-space:nowrap}
#batCard .m{background:#3ecf8e33;color:#3ecf8e}#batCard .e{background:#ffb54733;color:#ffb547}
#batCard .note{color:#7d889a;font-size:11.5px;margin-top:10px}
#batClose{position:absolute;right:12px;top:10px;background:#ffffff1a;border:0;color:#fff;width:32px;height:32px;border-radius:50%;font-size:18px}`;
  document.head.appendChild(css);
  const mount = () => {
    document.body.insertAdjacentHTML('beforeend', `<svg id="batRing" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="rgba(0,0,0,.35)" stroke="#ffffff33" stroke-width="6"/><circle id="batArc" cx="32" cy="32" r="26" fill="none" stroke="#ffd60a" stroke-width="6" stroke-linecap="round" stroke-dasharray="163.4" stroke-dashoffset="163.4" transform="rotate(-90 32 32)"/></svg><div id="batCard"><button id="batClose">×</button><div id="batBody"></div></div>`);
    $('batClose').onclick = hide;
    for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'wheel']) $('batCard').addEventListener(ev, e => e.stopPropagation(), { passive: true });
  };
  document.body ? mount() : addEventListener('DOMContentLoaded', mount);
  function hide() { $('batCard').classList.remove('on'); }

  // appui long générique : pick(e) renvoie un objet « cible » (ou null) ; resolve(cible) -> Promise<feature>
  function longPress(el, pick, resolve, opts = {}) {
    const HOLD = opts.hold || 3000; let press = null;
    el.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      const target = pick(e); if (!target) return;
      const pending = Promise.resolve(resolve(target)).catch(() => null); // la donnée se charge pendant les 3 s
      press = { x: e.clientX, y: e.clientY, t0: performance.now(), pending };
      const ring = $('batRing'), arc = $('batArc'); ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px'; ring.style.display = 'block';
      const me = press;
      const step = async () => { if (press !== me) return; const k = Math.min(1, (performance.now() - me.t0) / HOLD); arc.setAttribute('stroke-dashoffset', 163.4 * (1 - k));
        if (k < 1) return requestAnimationFrame(step);
        cancel(); navigator.vibrate?.(30); const f = await me.pending; if (f) show(f); else opts.onMiss?.(); };
      requestAnimationFrame(step);
    });
    const cancel = () => { press = null; const r = $('batRing'); if (r) { r.style.display = 'none'; $('batArc').setAttribute('stroke-dashoffset', 163.4); } };
    el.addEventListener('pointermove', e => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) cancel(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, cancel);
    el.addEventListener('contextmenu', e => e.preventDefault());
    return cancel;
  }

  function areaM2(f) {
    const lat0 = f.geometry.coordinates[0][0][0][1] * Math.PI / 180, kx = 111320 * Math.cos(lat0), ky = 110574; let Ar = 0;
    const ring = r => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * kx * r[i + 1][1] * ky - r[i + 1][0] * kx * r[i][1] * ky; return Math.abs(s) / 2; };
    for (const poly of f.geometry.coordinates) { Ar += ring(poly[0]); for (const h of poly.slice(1)) Ar -= ring(h); }
    return Ar;
  }
  const eur = v => v >= 1e6 ? (v / 1e6).toFixed(2).replace('.', ',') + ' M€' : Math.round(v).toLocaleString('fr-FR') + ' €';
  const M = '<span class="src m">mesuré</span>', Es = '<span class="src e">estimé</span>';
  function show(f) {
    const p = f.properties, k = typeOf(p), T = TYPES[k], sol = areaM2(f);
    const etages = p.nombre_d_etages || (p.hauteur ? Math.max(1, Math.round(p.hauteur / 2.9)) : 1);
    const plancher = sol * etages * 0.8, logements = p.nombre_de_logements || 0;
    const habitable = k === 'mix' ? plancher * 0.75 : (k === 'hab' ? plancher : 0), commerce = k === 'mix' ? plancher * 0.25 : (k === 'com' ? Math.min(plancher, sol) : 0);
    const appart = logements > 1;
    const valeur = habitable * (appart ? PRIX.appart : PRIX.maison) + commerce * PRIX.appart;
    const loyer = habitable * (appart ? LOYER.appart : LOYER.maison) + commerce * LOYER_COMMERCE;
    const hab = logements ? Math.round(logements * PERS_PAR_LOGEMENT) : (k === 'hab' ? Math.round(habitable / 40) : 0);
    const [cx, cy] = centre(f);
    $('batBody').innerHTML = `<h2>${T.n}</h2><div class="addr" id="batAddr">Recherche de l'adresse…</div><span class="type" style="background:${T.c}">${esc(p.usage_1)}${p.usage_2 ? ' + ' + esc(p.usage_2) : ''}</span>
      <div class="big"><div><small>Habitants</small><b>${hab || '—'}</b></div><div><small>Valeur du bien</small><b>${valeur ? eur(valeur) : '—'}</b></div><div><small>Loyers / mois</small><b>${loyer ? eur(loyer) : '—'}</b></div></div>
      <table>
        <tr><td>Logements</td><td>${logements || '—'} ${logements ? M : ''}</td></tr>
        <tr><td>Habitants</td><td>${hab || '—'} ${hab ? Es : ''}</td></tr>
        <tr><td>Hauteur</td><td>${p.hauteur ? p.hauteur.toFixed(1) + ' m ' + M : '—'}</td></tr>
        <tr><td>Étages</td><td>${etages} ${p.nombre_d_etages ? M : Es}</td></tr>
        <tr><td>Surface au sol</td><td>${Math.round(sol)} m² ${M}</td></tr>
        <tr><td>Surface de plancher</td><td>≈ ${Math.round(plancher)} m² ${Es}</td></tr>
        <tr><td>Valeur du bien</td><td>${valeur ? eur(valeur) + ' ' + Es : '—'}<br><small style="color:#7d889a">${habitable ? `${Math.round(habitable)} m² × ${appart ? PRIX.appart : PRIX.maison} €/m² (${appart ? 'appartements' : 'maison'})` : ''}${commerce ? ` + ${Math.round(commerce)} m² commerce` : ''}</small></td></tr>
        <tr><td>Loyers mensuels</td><td>${loyer ? eur(loyer) + ' ' + Es : '—'}</td></tr>
        <tr><td>Date d'apparition</td><td>${p.date_d_apparition ? String(p.date_d_apparition).slice(0, 4) + ' ' + M : '—'}</td></tr>
        <tr id="batShops" style="display:none"><td>Commerces</td><td></td></tr>
        <tr><td>Identifiant</td><td style="font-size:11px">${esc(idOf(f))}</td></tr>
      </table>
      <div class="note">Mesuré : données IGN BD TOPO. Estimé : calculé avec les prix de vente médians 2025 à Limoges (DVF : ${PRIX.appart} €/m² appartement, ${PRIX.maison} €/m² maison), un loyer de ${LOYER.appart} €/m² (appartement) et ${LOYER.maison} €/m² (maison), ${PERS_PAR_LOGEMENT} habitant par logement. Loyer commercial : ${LOYER_COMMERCE} €/m², hypothèse de jeu. Ordres de grandeur, pas une estimation immobilière.</div>`;
    if (window.EQ) $('batBody').appendChild(EQ.cardExtra(f, { type: T.n, lat: cy, lon: cx, adresse: () => $('batAddr').textContent }));
    $('batCard').classList.add('on');
    fetch(`https://data.geopf.fr/geocodage/reverse?lon=${cx}&lat=${cy}&limit=1`).then(r => r.json()).then(d => { const a = d.features?.[0]?.properties; $('batAddr').textContent = a ? a.label : 'Adresse inconnue'; }).catch(() => ($('batAddr').textContent = ''));
    if (k === 'com' || k === 'mix') {
      const q = `[out:json][timeout:15];(node["shop"](around:15,${cy},${cx});node["amenity"~"restaurant|cafe|bar|bank|pharmacy|fast_food|bakery"](around:15,${cy},${cx}););out tags 10;`;
      fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) }).then(r => r.json()).then(d => {
        const l = d.elements.map(e => e.tags.name ? `${e.tags.name} (${e.tags.shop || e.tags.amenity})` : (e.tags.shop || e.tags.amenity)).filter(Boolean);
        if (l.length) { const tr = $('batShops'); tr.style.display = ''; tr.lastElementChild.innerHTML = esc(l.join(', ')) + ' <span class="src m">OSM</span>'; }
      }).catch(() => {});
    }
  }
  window.BAT = { TYPES, typeOf, idOf, show, hide, longPress, featureAt, featureById, fromL93, toL93, inRing, contains, centre, wfs };
})();
