// Appart Studio — RÉFÉRENCE SOLEIL (testée) : position du soleil, conversion vers les axes du jeu,
// heures d'ensoleillement par fenêtre, arbres de Paris. Aucune dépendance.
// Repère du jeu : +X = Est, +Y = Haut, −Z = Nord (voir index.html).

const RAD = Math.PI / 180;

// Position du soleil — algorithme NOAA (précision ~0,1°, largement suffisante).
// Retour : { az: azimut en degrés depuis le Nord, sens horaire ; el: élévation en degrés }
export function sunPosition(date, lat, lon) {
  const jd = date.getTime() / 86400000 + 2440587.5, T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * RAD) * 0.000289;
  const om = 125.04 - 1934.136 * T, lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60, eps = eps0 + 0.00256 * Math.cos(om * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lam * RAD)) / RAD;
  const y = Math.tan(eps / 2 * RAD) ** 2;
  const eqt = 4 / RAD * (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  let ha = (utcMin + eqt + 4 * lon) / 4 - 180; if (ha < -180) ha += 360;
  const zen = Math.acos(Math.sin(lat * RAD) * Math.sin(decl * RAD) + Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(ha * RAD)) / RAD;
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat * RAD) * Math.cos(zen * RAD) - Math.sin(decl * RAD)) / (Math.cos(lat * RAD) * Math.sin(zen * RAD))))) / RAD;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  const el = 90 - zen;
  return { az, el: el + refraction(el) };
}
function refraction(el) {           // réfraction atmosphérique (degrés)
  if (el > 85) return 0;
  const te = Math.tan(el * RAD);
  const a = el > 5 ? 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5 : el > -0.575 ? 1735 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711))) : -20.774 / te;
  return a / 3600;
}

// Direction VERS le soleil dans le repère du jeu (vecteur unitaire [x, y, z]).
export function sunDirection(az, el) {
  const ce = Math.cos(el * RAD);
  return [Math.sin(az * RAD) * ce, Math.sin(el * RAD), -Math.cos(az * RAD) * ce];
}

// Une journée échantillonnée (heure UTC, par pas de `stepMin` minutes), soleil au-dessus de l'horizon uniquement.
export function daySamples(day, lat, lon, stepMin = 15) {
  const out = [], d0 = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  for (let m = 0; m < 1440; m += stepMin) {
    const date = new Date(d0 + m * 60000), p = sunPosition(date, lat, lon);
    if (p.el > 0) out.push({ date, ...p, dir: sunDirection(p.az, p.el) });
  }
  return out;
}

// Heures de soleil DIRECT reçues par une fenêtre un jour donné.
// win : { points: [[x,y,z]...] (5 points sur la vitre, côté extérieur, décalés de 5 cm), normal: [x,0,z] vers la rue }
// isBlocked(origin, dir) → true si un obstacle (bâtiment, arbre opaque) coupe le rayon. Fourni par l'appelant (three-mesh-bvh).
// treeTransmission(origin, dir) → 0..1 (optionnel) : part de lumière qui traverse les arbres (feuillage).
// Résultat : { hours, minutes: [{date, frac}], first, last } — frac = part de la vitre au soleil (0..1).
export function windowSunHours(win, samples, isBlocked, treeTransmission = null, stepMin = 15) {
  let total = 0; const minutes = [];
  for (const s of samples) {
    const cosI = s.dir[0] * win.normal[0] + s.dir[2] * win.normal[2];
    if (cosI <= 0.02) { minutes.push({ date: s.date, frac: 0 }); continue; }   // soleil derrière la façade
    let lit = 0;
    for (const p of win.points) {
      if (isBlocked(p, s.dir)) continue;
      lit += treeTransmission ? treeTransmission(p, s.dir, s.date) : 1;
    }
    const frac = lit / win.points.length;
    minutes.push({ date: s.date, frac });
    total += frac * stepMin;
  }
  const on = minutes.filter(m => m.frac > 0.2);
  return { hours: total / 60, minutes, first: on[0]?.date || null, last: on[on.length - 1]?.date || null };
}

// ---------- Arbres de Paris (Open Data Ville de Paris, jeu « les-arbres ») ----------
// Retour : [{ lon, lat, h, r, espece, caduc }] — h hauteur (m), r rayon de houppier estimé (m).
const PERSISTANTS = /pin|sapin|cèdre|cedre|if|thuya|chêne vert|chene vert|magnolia grandiflora|laurier|houx|cypr/i;
export async function fetchTrees(lon, lat, radiusM = 120) {
  const where = `within_distance(geo_point_2d, geom'POINT(${lon} ${lat})', ${radiusM}m)`;
  const url = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/les-arbres/records?' + new URLSearchParams({
    where, limit: '100', select: 'geo_point_2d,hauteurenm,circonferenceencm,libellefrancais,genre,stadedeveloppement',
  });
  const out = []; let offset = 0;
  for (let page = 0; page < 10; page++) {
    const r = await fetch(url + '&offset=' + offset); if (!r.ok) throw new Error('Arbres Paris : HTTP ' + r.status);
    const d = await r.json();
    for (const t of d.results || []) {
      const g = t.geo_point_2d; if (!g) continue;
      const circ = Number(t.circonferenceencm) || 0;
      // la hauteur vaut parfois 0 dans la base : estimation par le stade ou la circonférence
      let h = Number(t.hauteurenm) || 0;
      if (h <= 0 || h > 45) h = ({ 'Jeune (arbre)': 6, 'Jeune (arbre)Adulte': 10, 'Adulte': 15, 'Mature': 20 })[t.stadedeveloppement] || (circ ? Math.min(30, 4 + circ / 9) : 10);
      const r2 = Math.max(1.5, Math.min(9, h * 0.32));
      const nom = (t.libellefrancais || '') + ' ' + (t.genre || '');
      out.push({ lon: g.lon, lat: g.lat, h, r: r2, espece: (t.libellefrancais || t.genre || 'Arbre').trim(), caduc: !PERSISTANTS.test(nom) });
    }
    offset += 100; if (offset >= (d.total_count || 0)) break;
  }
  return out;
}

// Transmission de la lumière à travers un houppier (sphère posée sur un tronc de hauteur 40 % de h).
// Feuillus : très opaques mai→octobre, presque transparents en hiver.
export function leafTransmission(tree, date) {
  if (!tree.caduc) return 0.15;
  const m = date.getUTCMonth();                       // 0 = janvier
  return [0.75, 0.75, 0.7, 0.45, 0.25, 0.15, 0.15, 0.15, 0.2, 0.35, 0.6, 0.75][m];
}
// Rayon (origine o, direction d, repère du jeu) contre la sphère du houppier centrée en c (repère du jeu).
export function rayHitsCrown(o, d, c, r) {
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2], cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc; if (disc < 0) return false;
  return -b + Math.sqrt(disc) > 0;
}
