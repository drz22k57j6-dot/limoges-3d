// Appart Studio — éditeur de plan 2D tactile (vue de dessus, la rue en haut).
// Repère du plan : u = le long de la façade (m, vers la droite), v = vers l'intérieur (m, vers le bas). Façade = v 0, verrouillée.
import { detectRooms, pointInPoly, labelPoint, distSeg } from './roomDetect.js';

export const ROOM_TYPES = [
  ['sejour', 'Séjour', '#e9b872'], ['chambre', 'Chambre', '#8fb3ff'], ['cuisine', 'Cuisine', '#f08a5d'],
  ['sdb', 'Salle de bain', '#6fd3d0'], ['wc', 'WC', '#9ad2a5'], ['entree', 'Entrée', '#c7b9ff'],
  ['bureau', 'Bureau', '#ffd36e'], ['dressing', 'Dressing', '#d7a6c9'],
];
const TYPE = Object.fromEntries(ROOM_TYPES.map(([k, n, c]) => [k, { n, c }]));
const HINTS = {
  piece: 'Touche une pièce pour la nommer · tire les poignées blanches pour redimensionner',
  mur: 'Glisse du doigt pour tracer un mur · un espace fermé devient une pièce',
  fenetre: 'Touche un mur pour poser une fenêtre · fais-la glisser pour la déplacer',
  porte: 'Touche un mur pour poser une porte · fais-la glisser pour la déplacer',
};
const OPEN_DEF = { fenetre: { w: 1.2, allege: 0.9, h: 2.3 }, porte: { w: 0.83, allege: 0, h: 2.04 } };
const fmt = x => x.toFixed(2).replace('.', ',');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createPlanEditor({ onBack, onView3D }) {
  const root = document.createElement('section');
  root.id = 'as-editor'; root.className = 'as-ui';
  root.innerHTML = `
  <header id="ase-top"><button id="ase-back" aria-label="Retour">←</button><div id="ase-title"><b>Mon plan</b><span></span></div>
    <button id="ase-undo" aria-label="Annuler">↶</button><button id="ase-redo" aria-label="Rétablir">↷</button></header>
  <canvas id="ase-cv"></canvas>
  <div id="ase-hint"></div>
  <div id="ase-sheet"></div>
  <footer id="ase-bottom">
    <button id="ase-settings">Réglages appartement</button><button id="ase-3d">Voir en 3D ✦</button>
    <nav id="ase-tools">
      <button data-tool="piece"><i>✋</i>Pièces</button><button data-tool="mur"><i>▬</i>Mur</button>
      <button data-tool="fenetre"><i>▭</i>Fenêtre</button><button data-tool="porte"><i>◜</i>Porte</button>
    </nav></footer>`;
  document.body.appendChild(root);
  const cv = root.querySelector('#ase-cv'), ctx = cv.getContext('2d');
  const sheet = root.querySelector('#ase-sheet'), hint = root.querySelector('#ase-hint');

  let P = null, ctxInfo = null, tool = 'piece', view = { s: 40, ox: 0, oy: 0 }, rooms = [];
  let hist = [], fut = [], drag = null, sel = null, storeKey = '';

  // ---------- données ----------
  function defaultWindowOps(settings, u0, u1, start = 1) {
    const count = Math.max(1, Math.min(8, Number(settings?.count) || 1)), span = u1 - u0, margin = 0.2, ops = [];
    for (let i = 0; i < count; i++) {
      const cfg = settings?.customize ? settings.windows?.[i] : null;
      const width = Math.max(0.5, Math.min(4, Number(cfg?.width ?? settings?.width) || 1.2));
      const mode = cfg?.positionMode || 'distance', distance = Number(cfg?.distance);
      const along = mode === 'left' ? width / 2 + margin : mode === 'center' ? span / 2 : mode === 'right' ? span - width / 2 - margin
        : Number.isFinite(distance) && distance > 0 ? distance : span * (i + 1) / (count + 1);
      const center = Math.max(width / 2 + margin, Math.min(span - width / 2 - margin, along));
      ops.push({ id:'o'+(start+i), wall:'F', p:[u0+center,0], w:width,
        allege:Number(cfg?.sill ?? settings?.sill) || 0.9, h:Number(cfg?.height ?? settings?.height) || 2.1, type:'fenetre' });
    }
    return ops;
  }
  const fresh = () => {
    const b=ctxInfo?.safeBounds, o=b?{u0:b.u0,u1:b.u1,v1:b.v1}:{u0:-2.5,u1:2.5,v1:4};
    const settings=JSON.parse(JSON.stringify(ctxInfo?.settings||{count:1,width:1.2,height:2.1,sill:0.9,facadeThickness:0.35,ceilingHeight:2.8,customize:false,windows:[]}));
    return {o,settings,walls:[],ops:defaultWindowOps(settings,o.u0,o.u1),labels:[{p:[0,Math.min(2,(b?.v1||4)/2)],type:'sejour'}],n:10};
  };
  function outline() {
    const { u0, u1, v1 } = P.o;
    return [{ id: 'F', a: [u0, 0], b: [u1, 0], ext: true, facade: true }, { id: 'E', a: [u1, 0], b: [u1, v1], ext: true },
      { id: 'S', a: [u1, v1], b: [u0, v1], ext: true }, { id: 'W', a: [u0, v1], b: [u0, 0], ext: true }];
  }
  const allWalls = () => outline().concat(P.walls);
  const wallById = id => allWalls().find(w => w.id === id);
  function opSpan(op) {
    const w = wallById(op.wall); if (!w) return null;
    const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L = Math.hypot(...d); if (L < 0.3) return null;
    const e = [d[0] / L, d[1] / L], width = Math.min(op.w, L - 0.1);
    let t = (op.p[0] - w.a[0]) * e[0] + (op.p[1] - w.a[1]) * e[1];
    t = Math.max(width / 2 + 0.05, Math.min(L - width / 2 - 0.05, t));
    const c = [w.a[0] + e[0] * t, w.a[1] + e[1] * t];
    return { w, e, c, width, a: [c[0] - e[0] * width / 2, c[1] - e[1] * width / 2], b: [c[0] + e[0] * width / 2, c[1] + e[1] * width / 2] };
  }
  function recompute() {
    rooms = detectRooms(allWalls().map(w => [w.a, w.b])).map(r => {
      const lab = P.labels.find(l => pointInPoly(l.p, r.poly));
      return { ...r, type: lab?.type || null, lp: labelPoint(r.poly) };
    });
  }
  function commit() {
    hist.push(JSON.stringify(P)); if (hist.length > 80) hist.shift(); fut = [];
    try { localStorage.setItem(storeKey, JSON.stringify(P)); } catch (e) {}
    recompute(); draw();
  }
  function restore(json) { P = JSON.parse(json); try { localStorage.setItem(storeKey, json); } catch (e) {} sel = null; closeSheet(); recompute(); fit(); draw(); }

  // ---------- vue ----------
  const toScr = p => [view.ox + p[0] * view.s, view.oy + p[1] * view.s];
  const toPlan = (x, y) => [(x - view.ox) / view.s, (y - view.oy) / view.s];
  const clampPlan = p => { const b = ctxInfo?.safeBounds; return b ? [Math.max(b.u0, Math.min(b.u1, p[0])), Math.max(0, Math.min(b.v1, p[1]))] : p; };
  function size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  }
  function fit() {
    const r = cv.getBoundingClientRect(), { u0, u1, v1 } = P.o;
    const bw = (u1 - u0) + 2.4, bh = v1 + 4.2;                        // marge + rue au-dessus
    view.s = Math.max(14, Math.min(90, Math.min(r.width / bw, (r.height - 20) / bh)));
    view.ox = r.width / 2 - ((u0 + u1) / 2) * view.s;
    view.oy = (r.height - v1 * view.s) / 2 + 1.4 * view.s;
  }

  // ---------- dessin ----------
  function line(a, b, w, col, cap = 'butt') {
    const [x1, y1] = toScr(a), [x2, y2] = toScr(b);
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = cap; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function text(s, p, { size = 13, bold = false, col = '#fff', align = 'center', bg = null } = {}) {
    const [x, y] = Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && p.scr ? p : toScr(p);
    ctx.font = (bold ? '700 ' : '500 ') + size + 'px -apple-system,Arial'; ctx.textAlign = align; ctx.textBaseline = 'middle';
    if (bg) { const w = ctx.measureText(s).width + 10; ctx.fillStyle = bg; ctx.fillRect(x - (align === 'center' ? w / 2 : 5), y - size * .75, w, size * 1.5); }
    ctx.fillStyle = col; ctx.fillText(s, x, y);
  }
  function draw() {
    if (!P) return;
    const r = size(), W = r.width, H = r.height, s = view.s, { u0, u1, v1 } = P.o;
    ctx.fillStyle = '#0d121a'; ctx.fillRect(0, 0, W, H);
    // grille 50 cm / 1 m
    const [gu0, gv0] = toPlan(0, 0), [gu1, gv1] = toPlan(W, H);
    for (let u = Math.floor(gu0 * 2) / 2; u <= gu1; u += 0.5) { const x = view.ox + u * s; ctx.strokeStyle = Number.isInteger(u) ? '#1c2533' : '#141b26'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let v = Math.floor(gv0 * 2) / 2; v <= gv1; v += 0.5) { const y = view.oy + v * s; ctx.strokeStyle = Number.isInteger(v) ? '#1c2533' : '#141b26'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // la rue
    ctx.fillStyle = '#232c3a'; ctx.fillRect(0, 0, W, view.oy - 0.25 * s);
    ctx.fillStyle = '#2d3848'; ctx.fillRect(0, view.oy - 0.25 * s - 0.9 * s, W, 0.9 * s);   // trottoir
    text((ctxInfo.street || 'LA RUE').toUpperCase(), [(u0 + u1) / 2, -2.4], { size: 12, bold: true, col: '#7f8ba0' });
    // façade réelle de l'immeuble (étendue IGN)
    if (ctxInfo.facadeSpan) line([ctxInfo.facadeSpan[0], 0], [ctxInfo.facadeSpan[1], 0], Math.max(3, 0.16 * s), '#4a5568');
    // pièces
    for (const rm of rooms) {
      const t = rm.type ? TYPE[rm.type] : null;
      ctx.beginPath(); rm.poly.forEach((p, i) => { const [x, y] = toScr(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
      ctx.fillStyle = (t ? t.c : '#8792a3') + (sel?.room === rm ? '66' : '33'); ctx.fill();
    }
    // murs
    for (const w of allWalls()) {
      const isSel = sel?.wall === w.id;
      line(w.a, w.b, Math.max(3, (w.facade ? 0.4 : w.ext ? 0.25 : 0.12) * s), isSel ? '#ff9f43' : w.facade ? '#ff4d63' : '#eef2f8', 'square');
    }
    // ouvertures
    for (const op of P.ops) {
      const sp = opSpan(op); if (!sp) continue;
      const th = (sp.w.facade ? 0.4 : sp.w.ext ? 0.25 : 0.12) * s + 2;
      line(sp.a, sp.b, th, '#0d121a');
      const isSel = sel?.op === op.id, col = isSel ? '#ff9f43' : op.type === 'fenetre' ? '#5fd4ff' : '#ffd36e';
      if (op.type === 'fenetre') {
        const nrm = [-sp.e[1], sp.e[0]], off = th / s * 0.28;
        for (const k of [-1, 0, 1]) line([sp.a[0] + nrm[0] * off * k, sp.a[1] + nrm[1] * off * k], [sp.b[0] + nrm[0] * off * k, sp.b[1] + nrm[1] * off * k], k ? 2 : 1.5, col);
      } else {
        // porte : battant + arc côté intérieur
        let nrm = [-sp.e[1], sp.e[0]]; if (sp.w.ext) { const c = [(u0 + u1) / 2, v1 / 2]; if ((c[0] - sp.c[0]) * nrm[0] + (c[1] - sp.c[1]) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]]; }
        const [ax, ay] = toScr(sp.a), R = sp.width * s, a0 = Math.atan2(sp.e[1], sp.e[0]), a1 = Math.atan2(nrm[1], nrm[0]);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + Math.cos(a1) * R, ay + Math.sin(a1) * R); ctx.stroke();
        let d = a1 - a0; d = Math.atan2(Math.sin(d), Math.cos(d));
        ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(ax, ay, R, a0, a1, d < 0); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // noms + surfaces
    for (const rm of rooms) {
      const t = rm.type ? TYPE[rm.type] : null;
      const [x, y] = toScr(rm.lp);
      ctx.font = '700 14px -apple-system,Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = t ? '#fff' : '#c3cbd8'; ctx.fillText(t ? t.n : 'Pièce ?', x, y - 8);
      ctx.font = '500 12px -apple-system,Arial'; ctx.fillStyle = '#c3cbd8'; ctx.fillText(fmt(rm.area) + ' m²', x, y + 9);
    }
    // cotes
    text(fmt(u1 - u0) + ' m', [(u0 + u1) / 2, -0.62], { size: 12, bold: true, col: '#ffd0d6', bg: '#232c3acc' });
    const [dx, dy] = toScr([u1, v1 / 2]); ctx.save(); ctx.translate(dx + 22, dy); ctx.rotate(-Math.PI / 2);
    ctx.font = '700 12px -apple-system,Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#c3cbd8'; ctx.fillText(fmt(v1) + ' m', 0, 0); ctx.restore();
    text('FAÇADE · ' + (ctxInfo.orient || ''), [u0, -0.62], { size: 10, bold: true, col: '#ff8a9a', align: 'left' });
    // poignées
    if (tool === 'piece') for (const h of handles()) {
      const [x, y] = toScr(h.p); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0d121a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0d121a'; ctx.font = '700 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(h.k === 'SE' ? '⤡' : h.k === 'S' ? '↕' : '↔', x, y + 1);
    }
    // mur en cours
    if (drag?.kind === 'draw' && drag.b) {
      ctx.setLineDash([8, 6]); line(drag.a, drag.b, 4, '#ff9f43'); ctx.setLineDash([]);
      const L = Math.hypot(drag.b[0] - drag.a[0], drag.b[1] - drag.a[1]);
      text(fmt(L) + ' m', [(drag.a[0] + drag.b[0]) / 2, (drag.a[1] + drag.b[1]) / 2 - 18 / s], { size: 12, bold: true, bg: '#ff9f43', col: '#111' });
      for (const p of [drag.a, drag.b]) { const [x, y] = toScr(p); ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); }
    }
    // boussole (nord réel)
    const nc = ctxInfo.north, cx = W - 34, cy = view.oy - 1.4 * s - 6 > 60 ? 40 : 40;
    ctx.fillStyle = '#0d121acc'; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 7); ctx.fill(); ctx.strokeStyle = '#ffffff40'; ctx.lineWidth = 1; ctx.stroke();
    const a = Math.atan2(nc[1], nc[0]);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = '#ff4d63'; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(6, 2); ctx.lineTo(-6, 2); ctx.fill();
    ctx.fillStyle = '#c3cbd8'; ctx.beginPath(); ctx.moveTo(0, 16); ctx.lineTo(6, 2); ctx.lineTo(-6, 2); ctx.fill(); ctx.restore();
    ctx.font = '700 10px Arial'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('N', cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
  }

  // ---------- interactions ----------
  function handles() {
    const { u0, u1, v1 } = P.o;
    return [{ k: 'E', p: [u1, v1 / 2] }, { k: 'W', p: [u0, v1 / 2] }, { k: 'S', p: [(u0 + u1) / 2, v1] }, { k: 'SE', p: [u1, v1] }];
  }
  const pxd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * view.s;
  function nodes() {
    const n = []; for (const w of allWalls()) n.push(w.a, w.b);
    return n;
  }
  function clampIn(p) { const { u0, u1, v1 } = P.o; return [Math.max(u0, Math.min(u1, p[0])), Math.max(0, Math.min(v1, p[1]))]; }
  const g10 = x => Math.round(x * 10) / 10;
  function snap(p, start = null) {
    p = p.slice();
    let lock = null;
    if (start) {
      const du = p[0] - start[0], dv = p[1] - start[1];
      if (Math.abs(du) < Math.abs(dv) * 0.2) { p[0] = start[0]; lock = 'u'; } else if (Math.abs(dv) < Math.abs(du) * 0.2) { p[1] = start[1]; lock = 'v'; }
    }
    // 1. nœud existant
    for (const n of nodes()) if (pxd(n, p) < 22 && (!lock || (lock === 'u' ? Math.abs(n[0] - p[0]) < 0.01 : Math.abs(n[1] - p[1]) < 0.01))) return clampIn(n);
    // 2. sur un mur
    let best = null, bd = 20;
    for (const w of allWalls()) {
      let q;
      if (lock) {
        const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]];
        const k = lock === 'u' ? 0 : 1, o = 1 - k;
        if (Math.abs(d[k]) < 1e-6) continue;
        const t = (p[k] - w.a[k]) / d[k]; if (t < 0 || t > 1) continue;
        q = [0, 0]; q[k] = p[k]; q[o] = w.a[o] + d[o] * t;
      } else {
        const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L2 = d[0] * d[0] + d[1] * d[1] || 1;
        const t = Math.max(0, Math.min(1, ((p[0] - w.a[0]) * d[0] + (p[1] - w.a[1]) * d[1]) / L2));
        q = [w.a[0] + d[0] * t, w.a[1] + d[1] * t];
      }
      const dd = pxd(q, p); if (dd < bd) { bd = dd; best = q; }
    }
    if (best) return clampIn(best);
    // 3. grille 10 cm
    return clampIn([lock === 'u' ? p[0] : g10(p[0]), lock === 'v' ? p[1] : g10(p[1])]);
  }
  function hitOpening(p) {
    let best = null, bd = 20;
    for (const op of P.ops) { const sp = opSpan(op); if (!sp) continue; const d = distSeg(p, sp.a, sp.b) * view.s; if (d < bd) { bd = d; best = op; } }
    return best;
  }
  function hitWall(p, px, walls = allWalls()) {
    let best = null, bd = px;
    for (const w of walls) { const d = distSeg(p, w.a, w.b) * view.s; if (d < bd) { bd = d; best = w; } }
    return best;
  }
  function projectOn(w, p) {
    const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L2 = d[0] * d[0] + d[1] * d[1] || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - w.a[0]) * d[0] + (p[1] - w.a[1]) * d[1]) / L2));
    return [w.a[0] + d[0] * t, w.a[1] + d[1] * t];
  }
  function evPt(e) { const r = cv.getBoundingClientRect(); return clampPlan(toPlan(e.clientX - r.left, e.clientY - r.top)); }

  cv.addEventListener('pointerdown', e => {
    if (!P) return; e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const p = evPt(e);
    if (tool === 'piece') {
      const h = handles().find(h => pxd(h.p, p) < 26);
      if (h) { drag = { kind: 'handle', k: h.k }; closeSheet(); return; }
    }
    const op = hitOpening(p);
    if (op && tool !== 'mur') { sel = { op: op.id }; drag = { kind: 'op', id: op.id, moved: false }; openOpSheet(op); draw(); return; }
    if (tool === 'mur') { const a = snap(p); drag = { kind: 'draw', a, b: a }; sel = null; closeSheet(); draw(); return; }
    if (tool === 'fenetre' || tool === 'porte') {
      const w = hitWall(p, 30); if (!w) { flash('Touche un mur'); return; }
      const d = OPEN_DEF[tool], L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      if (L < 0.7) { flash('Mur trop court'); return; }
      let nop;
      if (tool === 'fenetre' && (w.facade || w.id === 'F')) {
        const anchors = ctxInfo?.facadeWindows || [];
        const anchor = anchors.slice().sort((a, b) => Math.abs(a.u - p[0]) - Math.abs(b.u - p[0]))[0];
        if (!anchor || Math.abs(anchor.u - p[0]) > 1.0) { flash('Touchez une vraie fenêtre de la façade'); return; }
        if (P.ops.some(o => o.wall === w.id && Math.abs(o.p[0] - anchor.u) < (o.w + anchor.width) / 2 + 0.25)) { flash('Cette fenêtre est déjà placée'); return; }
        nop = { id: 'o' + P.n++, wall: w.id, p: [anchor.u, 0], w: anchor.width, type: tool, allege: anchor.allege, h: anchor.height, facadeWindowId: anchor.id };
      } else {
        const nop0 = { id: 'o' + P.n++, wall: w.id, p: projectOn(w, p), w: Math.min(d.w, L - 0.2), type: tool, allege: d.allege, h: d.h };
        // pas de chevauchement : on décale la nouvelle ouverture à côté de sa voisine (50 cm de trumeau)
        const e = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], tOf = q => (q[0] - w.a[0]) * e[0] + (q[1] - w.a[1]) * e[1];
        let t = tOf(nop0.p);
        for (let k = 0; k < 6; k++) {
          const hit = P.ops.find(o => o.wall === w.id && Math.abs(tOf(o.p) - t) < (o.w + nop0.w) / 2 + 0.5);
          if (!hit) break;
          const to = tOf(hit.p); t = to + Math.sign(t - to || 1) * ((hit.w + nop0.w) / 2 + 0.5);
        }
        if (t < nop0.w / 2 + 0.05 || t > L - nop0.w / 2 - 0.05) { flash('Plus de place sur ce mur'); return; }
        nop0.p = [w.a[0] + e[0] * t, w.a[1] + e[1] * t];
        nop = nop0;
      }
      P.ops.push(nop); sel = { op: nop.id }; drag = { kind: 'op', id: nop.id, moved: true }; openOpSheet(nop); draw(); return;
    }
    // outil Pièces : mur intérieur puis pièce
    const w = hitWall(p, 14, P.walls);
    if (w) { sel = { wall: w.id }; openWallSheet(w); draw(); return; }
    const rm = rooms.find(r => pointInPoly(p, r.poly));
    if (rm) { sel = { room: rm }; openRoomSheet(rm); draw(); return; }
    sel = null; closeSheet(); draw();
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return; e.preventDefault();
    const p = evPt(e);
    if (drag.kind === 'handle') {
      const o = P.o, k = drag.k;
      const bounds = ctxInfo?.safeBounds || { u0: -20, u1: 20, v1: 20 };
      if (k.includes('E')) o.u1 = Math.min(bounds.u1, Math.max(o.u0 + 1.5, g10(p[0])));
      if (k === 'W') o.u0 = Math.max(bounds.u0, Math.min(o.u1 - 1.5, g10(p[0])));
      if (k.includes('S')) o.v1 = Math.min(bounds.v1, Math.max(1.5, g10(p[1])));
      recompute(); draw();
    } else if (drag.kind === 'op') {
      const op = P.ops.find(o => o.id === drag.id), w = op && wallById(op.wall);
      if (w) { op.p = projectOn(w, p); drag.moved = true; draw(); }
    } else if (drag.kind === 'draw') { drag.b = snap(p, drag.a); draw(); }
  });
  const end = e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'draw') {
      const L = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
      if (L >= 0.3) { P.walls.push({ id: 'p' + P.n++, a: d.a, b: d.b }); commit(); const nb = rooms.length, todo = rooms.some(r => !r.type); flash(nb + (nb > 1 ? ' pièces' : ' pièce') + (todo ? ' · outil Pièces pour nommer « Pièce ? »' : '')); }
      else draw();
    } else if (d.kind === 'handle') { commit(); fit(); draw(); }
    else if (d.kind === 'op' && d.moved) commit();
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

  // ---------- feuilles du bas ----------
  function closeSheet() { sheet.classList.remove('on'); sheet.innerHTML = ''; }
  function openRoomSheet(rm) {
    sheet.innerHTML = `<b>${esc(rm.type ? TYPE[rm.type].n : 'Quelle pièce ?')} · ${fmt(rm.area)} m²</b><div class="ase-grid">${ROOM_TYPES.map(([k, n, c]) =>
      `<button data-type="${k}" style="border-color:${c};${rm.type === k ? 'background:' + c + '44' : ''}">${n}</button>`).join('')}</div>`;
    sheet.classList.add('on');
    sheet.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
      P.labels = P.labels.filter(l => !pointInPoly(l.p, rm.poly));
      P.labels.push({ p: rm.lp, type: b.dataset.type }); sel = null; closeSheet(); commit();
    });
  }
  function openOpSheet(op) {
    const name = op.type === 'fenetre' ? 'Fenêtre' : 'Porte';
    const leftDistance = Math.max(0, op.p[0] - P.o.u0);
    sheet.innerHTML = `<b>${name}</b>
      <label>Largeur (m)<input id="ase-op-w" type="number" inputmode="decimal" min="0.5" max="4" step="0.05" value="${op.w}"></label>
      ${op.type === 'fenetre' ? `<div class="ase-row"><button data-pos="left">Gauche</button><button data-pos="center">Centre</button><button data-pos="right">Droite</button></div>
      <label>Distance depuis le bord gauche (m)<input id="ase-op-pos" type="number" min="0" max="${P.o.u1-P.o.u0}" step="0.05" value="${leftDistance}"></label>
      <label>Hauteur (m)<input id="ase-op-h" type="number" min="0.5" max="3.5" step="0.05" value="${op.h || 2.1}"></label>
      <label>Allège (m)<input id="ase-op-sill" type="number" min="0" max="2" step="0.05" value="${op.allege ?? 0.9}"></label>` : ''}
      <div class="ase-row"><button id="ase-del" class="ase-danger">Supprimer</button><button id="ase-ok">OK</button></div>`;
    sheet.classList.add('on');
    const apply = (key,value,min,max) => { op[key]=Math.max(min,Math.min(max,Number(value)||min)); commit(); };
    sheet.querySelector('#ase-op-w').onchange=e=>apply('w',e.target.value,0.5,4);
    if(op.type==='fenetre'){
      sheet.querySelector('#ase-op-h').onchange=e=>apply('h',e.target.value,0.5,3.5);
      sheet.querySelector('#ase-op-sill').onchange=e=>apply('allege',e.target.value,0,2);
      sheet.querySelector('#ase-op-pos').onchange=e=>{op.p[0]=P.o.u0+Math.max(0,Math.min(P.o.u1-P.o.u0,Number(e.target.value)||0));commit();};
      sheet.querySelectorAll('[data-pos]').forEach(b=>b.onclick=()=>{
        const width=op.w, span=P.o.u1-P.o.u0, d=b.dataset.pos==='left'?width/2+0.2:b.dataset.pos==='right'?span-width/2-0.2:span/2;
        op.p=[P.o.u0+d,0];commit();openOpSheet(op);
      });
    }
    sheet.querySelector('#ase-del').onclick = () => { P.ops = P.ops.filter(o => o.id !== op.id); sel = null; closeSheet(); commit(); };
    sheet.querySelector('#ase-ok').onclick = () => { sel = null; closeSheet(); draw(); };
  }
  function openSettingsSheet() {
    P.settings ||= {};
    P.settings.facadeThickness ??= 0.35; P.settings.ceilingHeight ??= 2.8;
    sheet.innerHTML = `<b>Réglages appartement</b>
      <label>Épaisseur du mur de façade (m)<input id="ase-thickness" type="number" min="0.15" max="1.2" step="0.05" value="${P.settings.facadeThickness}"></label>
      <label>Hauteur sous plafond (m)<input id="ase-ceiling" type="number" min="2.2" max="4" step="0.05" value="${P.settings.ceilingHeight}"></label>
      <div class="ase-row"><button id="ase-settings-ok">Fermer</button></div>`;
    sheet.classList.add('on');
    sheet.querySelector('#ase-thickness').onchange=e=>{P.settings.facadeThickness=Math.max(0.15,Math.min(1.2,Number(e.target.value)||0.35));commit();};
    sheet.querySelector('#ase-ceiling').onchange=e=>{P.settings.ceilingHeight=Math.max(2.2,Math.min(4,Number(e.target.value)||2.8));commit();};
    sheet.querySelector('#ase-settings-ok').onclick=()=>{closeSheet();draw();};
  }
  function openWallSheet(w) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    sheet.innerHTML = `<b>Mur intérieur · ${fmt(L)} m</b><div class="ase-row"><button id="ase-del" class="ase-danger">Supprimer ce mur</button><button id="ase-ok">OK</button></div>`;
    sheet.classList.add('on');
    sheet.querySelector('#ase-del').onclick = () => { P.walls = P.walls.filter(x => x.id !== w.id); P.ops = P.ops.filter(o => o.wall !== w.id); sel = null; closeSheet(); commit(); };
    sheet.querySelector('#ase-ok').onclick = () => { sel = null; closeSheet(); draw(); };
  }
  let flashT = 0;
  function flash(msg) { hint.textContent = msg; hint.classList.add('flash'); clearTimeout(flashT); flashT = setTimeout(() => { hint.classList.remove('flash'); hint.textContent = HINTS[tool]; }, 1400); }

  // ---------- barre d'outils ----------
  function setTool(t) {
    tool = t; sel = null; closeSheet(); hint.textContent = HINTS[t];
    root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); draw();
  }
  root.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  root.querySelector('#ase-undo').onclick = () => { if (hist.length > 1) { fut.push(hist.pop()); restore(hist[hist.length - 1]); } };
  root.querySelector('#ase-redo').onclick = () => { if (fut.length) { const j = fut.pop(); hist.push(j); restore(j); } };
  root.querySelector('#ase-settings').onclick = openSettingsSheet;
  root.querySelector('#ase-back').onclick = () => { close(); onBack?.(); };
  root.querySelector('#ase-3d').onclick = () => {
    if (!rooms.length) { flash('Dessine au moins une pièce fermée'); return; }
    if (rooms.some(r => !r.type)) { flash('Nomme d\'abord chaque « Pièce ? »'); return; }
    close(); onView3D?.();
  };
  window.addEventListener('resize', () => { if (P && root.classList.contains('on')) { fit(); draw(); } });

  function close() { root.classList.remove('on'); closeSheet(); }

  return {
    open(info) {
      ctxInfo = info; storeKey = 'as-plan:' + info.key;
      let saved = null; try { saved = JSON.parse(localStorage.getItem(storeKey) || 'null'); } catch (e) {}
      P = saved && saved.o ? saved : fresh();
      P.settings = { ...(ctxInfo.settings || {}), ...(P.settings || {}) };
      P.ops = P.ops.filter(o => !o.facadeWindowId);
      if (!P.ops.some(o => o.type === 'fenetre' && o.wall === 'F')) P.ops.push(...defaultWindowOps(P.settings, P.o.u0, P.o.u1, P.n));
      P.n = Math.max(P.n || 1, 10 + P.ops.length);
      if (ctxInfo.safeBounds) {
        const b = ctxInfo.safeBounds;
        P.o.u0 = Math.max(b.u0, Math.min(b.u1 - 1.5, P.o.u0));
        P.o.u1 = Math.min(b.u1, Math.max(P.o.u0 + 1.5, P.o.u1));
        P.o.v1 = Math.min(b.v1, Math.max(1.5, P.o.v1));
        const cp = q => clampPlan(q);
        P.walls.forEach(w => { w.a = cp(w.a); w.b = cp(w.b); });
        P.labels.forEach(l => { l.p = cp(l.p); });
        P.ops.forEach(o => { o.p = cp(o.p); });
      }
      hist = [JSON.stringify(P)]; fut = []; sel = null;
      root.querySelector('#ase-title span').textContent = info.title;
      root.classList.add('on'); recompute(); setTool('piece');
      requestAnimationFrame(() => { fit(); draw(); });
    },
    close,
    // position écran (px CSS, relative au canvas) d'un point du plan — tests automatiques
    screenOf(p) { const r = cv.getBoundingClientRect(), [x, y] = toScr(p); return [r.left + x, r.top + y]; },
    reset() { P = fresh(); commit(); fit(); draw(); },
    // données pour la phase 3 (génération 3D) — plan en mètres, repère u/v
    getPlan() {
      return {
        murs: allWalls().map(w => ({ id: w.id, a: w.a, b: w.b, epaisseur: w.facade ? (P.settings?.facadeThickness || 0.35) : w.ext ? 0.25 : 0.15, facade: !!w.facade })),
        ouvertures: P.ops.map(o => { const sp = opSpan(o); return { id: o.id, murId: o.wall, type: o.type, centre: sp?.c, largeur: sp?.width ?? o.w, allege: o.allege, hauteur: o.h }; }),
        pieces: rooms.map((r, i) => ({ id: 'r' + i, type: r.type, polygone: r.poly, surface: r.area })),
        settings: { ...P.settings },
      };
    },
  };
}
