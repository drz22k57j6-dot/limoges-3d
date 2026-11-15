// Match par équipes (Bleu contre Rouge) dans la vraie ville, en attendant le multijoueur :
// soldats contrôlés par l'ordinateur qui suivent les rues, se mettent à couvert derrière les barricades et tirent,
// point lumineux coloré au-dessus de chaque joueur (alliés visibles à travers les murs, ennemis seulement à vue),
// barricades (blocs béton, sacs de sable, grilles de chantier du jeu Saltline) qui bloquent la rue et les balles.
import * as THREE from 'three';

export const EQUIPES = [
  { id: 'bleu', nom: 'Bleu', col: 0x2f7bff },
  { id: 'rouge', nom: 'Rouge', col: 0xff3b30 },
];
const BARRICADES = [
  { prop: 'jersey_barrier', nom: 'Béton' },
  { prop: 'sandbags', nom: 'Sacs de sable' },
  { prop: 'fence_panel', nom: 'Grille' },
];
const NOMS = ['Alex', 'Sam', 'Nina', 'Yanis', 'Léa', 'Moussa', 'Inès', 'Hugo', 'Sarah', 'Karim', 'Jade', 'Tom', 'Lina', 'Noah', 'Emma', 'Adam', 'Zoé', 'Rayan', 'Chloé', 'Enzo', 'Maya', 'Ilyes', 'Lou', 'Nathan'];

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.28, 'rgba(255,255,255,0.95)'); r.addColorStop(0.5, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// soldat original, simple et lisible de loin : treillis neutre, gilet et brassard à la couleur de l'équipe
function soldierModel(col) {
  const g = new THREE.Group();
  const M = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
  const cloth = M(0x4a4f45), team = M(col, 0.6), skin = M(0xc58f6b, 0.7), dark = M(0x1c1e20, 0.5), gun = new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.4, metalness: 0.6 });
  const box = (w, h, d, m, x, y, z, parent = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const hip = new THREE.Group(); hip.position.y = 0.95; g.add(hip);
  const legs = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(0.1 * s, 0, 0); hip.add(p); box(0.15, 0.5, 0.17, cloth, 0, -0.25, 0, p); box(0.13, 0.42, 0.15, cloth, 0, -0.68, 0, p); box(0.15, 0.08, 0.26, dark, 0, -0.91, 0.04, p); return p; });
  const torso = new THREE.Group(); torso.position.y = 0.95; g.add(torso);
  box(0.4, 0.55, 0.24, cloth, 0, 0.3, 0, torso); box(0.43, 0.42, 0.28, team, 0, 0.33, 0, torso);   // gilet
  const head = box(0.2, 0.23, 0.22, skin, 0, 0.73, 0, torso); box(0.24, 0.11, 0.26, team, 0, 0.84, 0, torso);   // casque
  const arms = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(0.25 * s, 0.52, 0); torso.add(p); box(0.11, 0.3, 0.12, cloth, 0, -0.14, 0, p); box(0.12, 0.06, 0.13, team, 0, -0.03, 0, p); return p; });
  arms[0].rotation.x = -1.2; arms[1].rotation.x = -1.35; arms[0].rotation.z = 0.35; arms[1].rotation.z = -0.25;
  const rifle = new THREE.Group(); rifle.position.set(0.05, 0.38, -0.32); torso.add(rifle);
  box(0.06, 0.08, 0.62, gun, 0, 0, 0, rifle); box(0.05, 0.14, 0.06, gun, 0, -0.08, 0.06, rifle);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd27a })); flash.position.set(0, 0, -0.36); flash.visible = false; rifle.add(flash);
  g.userData = { legs, torso, arms, head, flash };
  return g;
}

export function createTeams(G, phys, root, opt = {}) {
  const cam = G.camera, P = G.player;
  const perTeam = opt.parEquipe ?? 10;
  const dotTex = dotTexture();
  const bots = [], barr = [];
  const score = [0, 0];
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const now = () => performance.now() / 1000;
  const myTeam = 0;

  // ---------- zones de départ : le joueur (Bleu) et une rue à 250–400 m (Rouge)
  const start = P.pos.clone();
  function roadPoints() {
    const pts = [];
    for (const S of phys.allSectors()) for (const r of S.roads) for (let k = 0; k < r.p.length / 2; k += 3) pts.push([r.p[2 * k], r.p[2 * k + 1], r.w]);
    return pts;
  }
  let spawn = [start.clone(), null];
  {
    const pts = roadPoints().filter(([x, z, w]) => w >= 6 && Math.hypot(x - start.x, z - start.z) > 250 && Math.hypot(x - start.x, z - start.z) < 400);
    const p = pts.length ? pts[(Math.random() * pts.length) | 0] : [start.x + 300, start.z, 8];
    spawn[1] = new THREE.Vector3(p[0], 0, p[1]);
  }
  const spawnAround = (t) => { const c = spawn[t]; for (let i = 0; i < 12; i++) { const a = Math.random() * 6.283, r = 3 + Math.random() * 14, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; const y = phys.surface(x, z); if (phys.groundHeight(x, z, y + 3) <= y + 0.5) return new THREE.Vector3(x, y, z); } return new THREE.Vector3(c.x, phys.surface(c.x, c.z), c.z); };

  // ---------- points lumineux
  function makeDot(team) {
    const ally = team === myTeam;
    const m = new THREE.SpriteMaterial({ map: dotTex, color: EQUIPES[team].col, depthTest: !ally, depthWrite: false, transparent: true, sizeAttenuation: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const s = new THREE.Sprite(m); s.scale.setScalar(ally ? 0.016 : 0.013); s.renderOrder = 10; return s;
  }

  // ---------- soldats
  function makeBot(team, i) {
    const mesh = soldierModel(EQUIPES[team].col); root.add(mesh);
    const dot = makeDot(team); root.add(dot);
    const b = { team, name: NOMS[(team * 12 + i) % NOMS.length], mesh, dot, pos: spawnAround(team), vel: new THREE.Vector3(), yaw: 0, hp: 100, alive: true, respawnAt: 0, phase: Math.random() * 6, nextThink: Math.random() * 0.4, nextShot: 0, burst: 0, target: null, stuckT: 0, lastPos: new THREE.Vector3(), turn: 0, turnT: 0, aimT: 0, holdT: 0, type: 'soldier' };
    b.damage = (amt, point, dir, part) => { if (!b.alive) return false; b.hp -= amt; b.hurtBy = 'player'; if (b.hp <= 0) { kill(b, 'Vous'); return true; } b.target = 'player'; return false; };
    bots.push(b); return b;
  }
  for (let t = 0; t < 2; t++) for (let i = 0; i < (t === myTeam ? perTeam - 1 : perTeam); i++) makeBot(t, i);

  function kill(b, by) {
    b.alive = false; b.respawnAt = now() + 6; b.deadT = 0; score[1 - b.team]++;
    feed(by, b.name, b.team);
    try { G.events.emit('enemy:killed', { enemy: b, pos: b.pos, type: 'soldier' }); } catch (e) {}
  }

  // ---------- tirs du joueur : les soldats ennemis sont des cibles du moteur
  const E = G.enemies, origRay = E.raycast.bind(E);
  const hitSphere = (o, d, c, r, max) => { v1.subVectors(c, o); const t = v1.dot(d); if (t < 0 || t > max) return -1; const q = v1.lengthSq() - t * t; return q <= r * r ? t - Math.sqrt(r * r - q) : -1; };
  E.raycast = (o, d, max = 300) => {
    let best = origRay(o, d, max), bd = best ? best.dist : max;
    for (const b of bots) {
      if (!b.alive || b.team === myTeam) continue;
      const head = v2.set(b.pos.x, b.pos.y + 1.68, b.pos.z), th = hitSphere(o, d, head, 0.17, bd);
      if (th >= 0) { bd = th; best = { enemy: b, part: 'weak', dist: th, point: o.clone().addScaledVector(d, th), normal: d.clone().negate() }; continue; }
      for (const y of [0.45, 0.95, 1.3]) { const tb = hitSphere(o, d, v2.set(b.pos.x, b.pos.y + y, b.pos.z), 0.3, bd); if (tb >= 0) { bd = tb; best = { enemy: b, part: 'body', dist: tb, point: o.clone().addScaledVector(d, tb), normal: d.clone().negate() }; break; } }
    }
    return best;
  };

  // ---------- le joueur : mort → retour à la base Bleue (pas d'écran de fin)
  const origDamage = P.damage.bind(P);
  let deadUntil = 0;
  P.damage = (amt, from) => {
    if (!P.alive || deadUntil) return;
    if (P.health - amt > 0) return origDamage(amt, from);
    score[1 - myTeam]++; feed(lastShooter || 'Rouge', 'Vous', myTeam);
    deadUntil = now() + 4; P.invulnerable = true; P.enabled = false; msg('Éliminé — retour à la base dans 4 s', 3.5);
  };
  let lastShooter = null;

  // ---------- barricades
  let barKind = 0;
  function placeBarricade() {
    const def = BARRICADES[barKind], o = G.props.build(def.prop, { seed: barr.length + 3 });
    const yaw = Math.round((P.yaw) / (Math.PI / 12)) * (Math.PI / 12);   // en travers du regard, par pas de 15°
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), x = P.pos.x + fx * 3.2, z = P.pos.z + fz * 3.2, y = phys.surface(x, z);
    o.position.set(x, y, z); o.rotation.y = yaw; o.traverse(n => { if (n.isMesh) { n.castShadow = n.receiveShadow = true; } }); root.add(o);
    const sz = o.userData.size || [3, 0.9, 0.6], boxes = [], n = Math.max(1, Math.round(sz[0] / Math.max(0.3, sz[2])));
    const ux = Math.cos(yaw), uz = -Math.sin(yaw), half = Math.max(0.15, sz[2] / 2);
    for (let i = 0; i < n; i++) { const s = (i + 0.5) / n * sz[0] - sz[0] / 2, cx = x + ux * s, cz = z + uz * s;
      boxes.push(phys.addBox([cx - half, y, cz - half], [cx + half, y + sz[1], cz + half], { surface: def.prop === 'sandbags' ? 'dirt' : def.prop === 'fence_panel' ? 'metal' : 'concrete', tag: 'barricade' })); }
    barr.push({ o, boxes, x, z }); if (barr.length > 14) removeBarricade(barr[0]);
    msg(def.nom + ' posée (' + barr.length + '/14)', 1.2);
  }
  function removeBarricade(B) { root.remove(B.o); for (const b of B.boxes) phys.removeBox(b); barr.splice(barr.indexOf(B), 1); }
  // quelques barricades rouges devant leur base
  function enemyBarricades() {
    for (let i = 0; i < 3; i++) {
      const a = Math.atan2(start.x - spawn[1].x, start.z - spawn[1].z) + (i - 1) * 0.7, d = 18 + i * 4, x = spawn[1].x + Math.sin(a) * d, z = spawn[1].z + Math.cos(a) * d, y = phys.surface(x, z);
      const o = G.props.build(i === 1 ? 'jersey_barrier' : 'sandbags', { seed: 40 + i }); o.position.set(x, y, z); o.rotation.y = a + Math.PI / 2; o.traverse(n => { if (n.isMesh) n.castShadow = n.receiveShadow = true; }); root.add(o);
      const sz = o.userData.size || [2, 0.9, 0.6], ux = Math.cos(o.rotation.y), uz = -Math.sin(o.rotation.y), boxes = [];
      for (let k = 0; k < 4; k++) { const s = (k + 0.5) / 4 * sz[0] - sz[0] / 2; boxes.push(phys.addBox([x + ux * s - 0.3, y, z + uz * s - 0.3], [x + ux * s + 0.3, y + sz[1], z + uz * s + 0.3], { tag: 'barricade' })); }
      barr.push({ o, boxes, x, z, fixe: true });
    }
  }
  try { enemyBarricades(); } catch (e) { console.warn('barricades', e); }

  // ---------- interface : score, fil des éliminations, bouton barricade
  const css = document.createElement('style'); css.textContent = `
  #eqScore{position:fixed;z-index:45;top:calc(44px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);display:flex;gap:2px;font:700 22px/1 'Big Shoulders Display',sans-serif;letter-spacing:.06em;pointer-events:none}
  #eqScore b{padding:6px 14px 4px;color:#fff;min-width:64px;text-align:center}#eqScore .b{background:rgba(47,123,255,.82)}#eqScore .r{background:rgba(255,59,48,.82)}
  #eqFeed{position:fixed;z-index:45;top:calc(52px + env(safe-area-inset-top));right:calc(12px + env(safe-area-inset-right));font:600 13px 'Barlow Condensed',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#e8e4da;text-align:right;pointer-events:none}
  #eqFeed div{background:rgba(11,13,15,.55);padding:4px 8px;margin-bottom:3px}#eqFeed i{font-style:normal;opacity:.6;margin:0 6px}
  #eqMsg{position:fixed;z-index:46;left:50%;top:38%;transform:translateX(-50%);font:600 18px 'Barlow Condensed',sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#fff;text-shadow:0 2px 8px #000;pointer-events:none;opacity:0;transition:opacity .3s}
  #eqBar{position:fixed;z-index:40;right:calc(12px + env(safe-area-inset-right));top:calc(52px + env(safe-area-inset-top) + 120px);display:flex;flex-direction:column;gap:6px}
  #eqBar button{height:42px;padding:0 12px;font:600 12px/1 'Barlow Condensed',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#e8e4da;background:rgba(11,13,15,.55);border:1px solid rgba(232,228,218,.42);cursor:pointer}`;
  document.head.appendChild(css);
  const ui = document.createElement('div');
  ui.innerHTML = `<div id="eqScore"><b class="b" id="eqB">0</b><b class="r" id="eqR">0</b></div><div id="eqFeed"></div><div id="eqMsg"></div>
  <div id="eqBar"><button id="eqPose">🧱 Poser</button><button id="eqType">${BARRICADES[0].nom}</button><button id="eqOte">Retirer</button></div>`;
  document.body.appendChild(ui);
  const $ = id => document.getElementById(id);
  for (const id of ['eqPose', 'eqType', 'eqOte']) for (const ev of ['pointerdown', 'touchstart', 'mousedown']) $(id).addEventListener(ev, e => e.stopPropagation(), { passive: true });
  $('eqPose').onclick = e => { e.stopPropagation(); placeBarricade(); };
  $('eqType').onclick = e => { e.stopPropagation(); barKind = (barKind + 1) % BARRICADES.length; $('eqType').textContent = BARRICADES[barKind].nom; };
  $('eqOte').onclick = e => { e.stopPropagation(); let best = null, bd = 8; for (const B of barr) { if (B.fixe) continue; const d = Math.hypot(B.x - P.pos.x, B.z - P.pos.z); if (d < bd) { bd = d; best = B; } } if (best) { removeBarricade(best); msg('Barricade retirée', 1); } else msg('Aucune barricade à moins de 8 m', 1.2); };
  addEventListener('keydown', e => { if (e.code === 'KeyB') placeBarricade(); if (e.code === 'KeyN') $('eqType').click(); });
  let msgT = 0; function msg(t, d = 2) { const m = $('eqMsg'); m.textContent = t; m.style.opacity = 1; msgT = now() + d; }
  function feed(a, b, teamDead) { const f = $('eqFeed'), d = document.createElement('div'); const ca = EQUIPES[1 - teamDead].col.toString(16).padStart(6, '0'), cb = EQUIPES[teamDead].col.toString(16).padStart(6, '0');
    d.innerHTML = `<span style="color:#${ca}">${a}</span><i>✕</i><span style="color:#${cb}">${b}</span>`; f.prepend(d); while (f.children.length > 5) f.lastChild.remove(); setTimeout(() => d.remove(), 6000); }

  // ---------- intelligence des soldats
  function nearestRoadDir(x, z) {   // direction de la rue la plus proche (le long de son axe)
    const S = phys.secAt(x, z); const C = 16, ci = Math.floor(x / C), cj = Math.floor(z / C); let bd = 1e9, dx = 0, dz = 0, cx = 0, cz = 0;
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) for (const v of S.roadGrid.get(i * 1000003 + j) || []) {
      const r = S.roads[(v / 4096) | 0], k = v % 4096, p = r.p, ax = p[2 * k], az = p[2 * k + 1], ex = p[2 * k + 2] - ax, ez = p[2 * k + 3] - az, L2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)), px = ax + t * ex, pz = az + t * ez, d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; const L = Math.sqrt(L2); dx = ex / L; dz = ez / L; cx = px; cz = pz; }
    }
    return bd < 40 ? { dx, dz, cx, cz, d: bd } : null;
  }
  const targetsOf = b => { const out = []; for (const o of bots) if (o.alive && o.team !== b.team) out.push(o); if (b.team !== myTeam && P.alive && !deadUntil) out.push('player'); return out; };
  const posOf = t => t === 'player' ? P.pos : t.pos;
  const eyeOf = (t, out) => t === 'player' ? out.copy(P.eye || P.pos).setY((P.eye ? P.eye.y : P.pos.y + 1.6)) : out.set(t.pos.x, t.pos.y + 1.55, t.pos.z);
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();

  function think(b, t) {
    // cible visible la plus proche (portée 90 m)
    let best = null, bd = 90;
    for (const o of targetsOf(b)) { const p = posOf(o), d = Math.hypot(p.x - b.pos.x, p.z - b.pos.z); if (d < bd) { eyeOf(b, e1); eyeOf(o, e2); if (phys.lineOfSight(e1, e2)) { bd = d; best = o; } } }
    b.target = best; b.targetD = bd;
  }
  function shoot(b, t) {
    const o = b.target; if (!o) return; const d = b.targetD;
    b.mesh.userData.flash.visible = true; b.flashT = t + 0.05;
    const p = Math.max(0.07, Math.min(0.5, 0.55 - d / 160)) * (o === 'player' && P.crouching ? 0.7 : 1);
    try { G.events.emit('enemy:fire', { enemy: b, pos: b.pos, type: 'hound' }); } catch (e) {}
    if (Math.random() < p) {
      const dmg = 9 + Math.random() * 7;
      if (o === 'player') { lastShooter = b.name; P.damage(dmg, b.pos.clone()); }
      else { o.hp -= dmg; if (o.hp <= 0 && o.alive) kill(o, b.name); }
    }
  }
  function updateBot(b, dt, t) {
    const U = b.mesh.userData;
    if (!b.alive) {
      b.deadT += dt; U.torso.rotation.x = Math.min(1.5, b.deadT * 4); b.mesh.position.y = b.pos.y - Math.min(0.5, b.deadT); b.dot.visible = false;
      if (t > b.respawnAt) { b.pos.copy(spawnAround(b.team)); b.hp = 100; b.alive = true; b.target = null; U.torso.rotation.x = 0; }
      b.mesh.visible = b.deadT < 5; return;
    }
    b.mesh.visible = true;
    if (t > b.nextThink) { b.nextThink = t + 0.35 + Math.random() * 0.2; think(b, t); }
    const goal = spawn[1 - b.team];
    let mx = 0, mz = 0, speed = 3.4;
    if (b.target) {
      const p = posOf(b.target); b.yaw = Math.atan2(-(p.x - b.pos.x), -(p.z - b.pos.z));
      // à découvert : avance un peu ; près d'une barricade : reste à couvert
      speed = b.targetD > 40 ? 1.6 : 0;
      if (t > b.nextShot) { shoot(b, t); b.burst++; b.nextShot = t + (b.burst % 3 ? 0.13 : 0.9 + Math.random() * 0.8); }
      mx = -Math.sin(b.yaw); mz = -Math.cos(b.yaw);
    } else {
      let gx = goal.x - b.pos.x, gz = goal.z - b.pos.z; const gl = Math.hypot(gx, gz) || 1; gx /= gl; gz /= gl;
      if (gl < 25) { gx = -gx; gz = -gz; }   // arrivé dans le camp adverse : tourne autour
      const R = nearestRoadDir(b.pos.x, b.pos.z);
      if (R) { let s = Math.sign(R.dx * gx + R.dz * gz) || 1; mx = R.dx * s * 0.75 + gx * 0.25 + (R.cx - b.pos.x) * 0.04; mz = R.dz * s * 0.75 + gz * 0.25 + (R.cz - b.pos.z) * 0.04; }
      else { mx = gx; mz = gz; }
      if (b.turnT > t) { const c = Math.cos(b.turn), s = Math.sin(b.turn); [mx, mz] = [mx * c - mz * s, mx * s + mz * c]; }
      const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
      const want = Math.atan2(-mx, -mz); let dy = want - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); b.yaw += dy * Math.min(1, dt * 6);
    }
    b.vel.x = mx * speed; b.vel.z = mz * speed; b.vel.y -= 9.8 * dt;
    const r = phys.moveCapsule(b.pos, b.vel, dt, 0.3, 1.75, true);
    if (r.onGround) b.vel.y = 0;
    // coincé contre un mur : tourne pendant 1,5 s
    b.stuckT += dt; if (b.stuckT > 1.6) { if (speed > 0.5 && b.pos.distanceTo(b.lastPos) < 1.0) { b.turn = (Math.random() < 0.5 ? 1 : -1) * (1 + Math.random()); b.turnT = t + 1.5; } b.stuckT = 0; b.lastPos.copy(b.pos); }
    // animation
    const mv = Math.hypot(b.vel.x, b.vel.z); b.phase += dt * mv * 2.6; const sw = Math.sin(b.phase) * Math.min(1, mv / 2) * 0.7;
    U.legs[0].rotation.x = sw; U.legs[1].rotation.x = -sw;
    b.mesh.position.copy(b.pos); b.mesh.rotation.y = b.yaw;
    if (b.flashT && t > b.flashT) U.flash.visible = false;
    b.dot.visible = true; b.dot.position.set(b.pos.x, b.pos.y + 2.15, b.pos.z);
  }

  let t0 = now();
  return {
    bots, barr, score, spawn,
    update(dt) {
      const t = now(); dt = Math.min(dt, 0.05);
      for (const b of bots) updateBot(b, dt, t);
      if (deadUntil && t > deadUntil) { deadUntil = 0; const p = spawnAround(myTeam); P.reset({ pos: p, yaw: P.yaw }); P.enabled = true; P.invulnerable = false; msg('De retour au combat', 1.2); }
      $('eqB').textContent = score[0]; $('eqR').textContent = score[1];
      if (msgT && t > msgT) { $('eqMsg').style.opacity = 0; msgT = 0; }
      void t0;
    },
  };
}
