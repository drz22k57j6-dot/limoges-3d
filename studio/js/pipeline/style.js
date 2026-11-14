// Moteur « style de quartier » : mesure la couleur réelle des façades de TOUS les bâtiments autour,
// à partir des photos de rue (Panoramax + Mapillary), puis donne une couleur aux bâtiments jamais photographiés
// en copiant les bâtiments mesurés les plus semblables (âge, usage, hauteur, matériau, distance).
// Principe des mondes automatiques (Flight Simulator / Blackshark) : forme mesurée + façade « géo-typique ».
import * as IGN from '../sources/ign.js';
import * as PX from '../sources/panoramax.js';
import * as IMG from '../sources/images.js';
import { fromL93, toL93, median, pointInRing } from '../geo.js';
import { projector } from './facade.js';

const tick = () => new Promise(r => setTimeout(r, 0));

async function buildingsWithAttrs(bb) {
  const u = 'https://data.geopf.fr/wfs/ows?' + new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: 'BDTOPO_V3:batiment', OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:2154', COUNT: '5000', BBOX: `${bb.join(',')},EPSG:2154`,
    PROPERTYNAME: 'cleabs,hauteur,usage_1,nombre_d_etages,materiaux_des_murs,date_d_apparition,altitude_minimale_sol,geometrie' });
  const d = await (await fetch(u)).json();
  return d.features.map(f => { const p = f.properties; const ring = f.geometry.coordinates[0][0];
    return { id: p.cleabs, ring, h: p.hauteur || 6, usage: p.usage_1, etages: p.nombre_d_etages, murs: IGN.decodeMateriaux(p.materiaux_des_murs, 'mur'), annee: p.date_d_apparition ? +String(p.date_d_apparition).slice(0, 4) : null, sol: p.altitude_minimale_sol, samples: [], photos: new Set() }; });
}

// correction de balance des blancs « monde gris » partielle (par photo)
function wbGains(pix) {
  let r = 0, g = 0, b = 0, n = 0; const d = pix.data, step = Math.max(4, ((d.length / 4) / 20000) | 0) * 4;
  for (let i = 0; i < d.length; i += step) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  const m = (r + g + b) / 3; const k = c => Math.max(0.85, Math.min(1.18, 1 + (m / (c || 1) - 1) * 0.5));
  return [k(r), k(g), k(b)];
}

// couleur robuste d'un ensemble d'échantillons : on écarte vitres/ombres (sombres) et ciel/reflets (très clairs)
export function robustColor(samples) {
  // ciel (bleu clair saturé), feuillage (vert saturé), vitres/ombres (sombre), reflets (très clair) exclus
  const v = samples.filter(s => { const l = 0.299 * s[0] + 0.587 * s[1] + 0.114 * s[2];
    if (l < 45 || l > 235) return false;
    if (s[2] > s[0] + 22 && s[2] > s[1] + 4 && l > 110) return false; // ciel
    if (s[1] > s[0] + 18 && s[1] > s[2] + 12) return false; // végétation
    return true; });
  if (v.length < 6 || v.length < samples.length * 0.25) return null; // trop de ciel/feuillage : mesure peu fiable
  v.sort((a, b) => (0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]) - (0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2]));
  const sl = v.slice(Math.floor(v.length * 0.4), Math.ceil(v.length * 0.85)); // partie éclairée de l'enduit
  return [0, 1, 2].map(c => Math.round(median(sl.map(s => s[c]))));
}

export async function neighbourhoodStyle(R, { radius = 300, maxPhotos = 30, mapillaryToken = '', log = () => {}, progress = () => {} } = {}) {
  if (R.b.crs !== 'EPSG:2154') return null;
  const c = R.origin, bb = [c[0] - radius, c[1] - radius, c[0] + radius, c[1] + radius];
  log(`Style du quartier : bâtiments et photos dans ${radius} m…`);
  const [blds, env] = await Promise.all([buildingsWithAttrs(bb), Promise.all([IGN.elevationGrid('MNS', bb, Math.max(1, (2 * radius) / 1024)), IGN.elevationGrid('MNT', bb, Math.max(1, (2 * radius) / 1024))]).catch(() => [null, null])]);
  const [mns, mnt] = env;
  const [w, s] = fromL93(bb[0], bb[1]), [e, n] = fromL93(bb[2], bb[3]);
  let photos = [];
  try { photos = photos.concat((await PX.searchPhotos(w, s, e, n, 500)).map(p => ({ ...p, url: p.sd, src: 'Panoramax' }))); } catch (er) { log('Panoramax : ' + er.message); }
  if (mapillaryToken) {
    try { photos = photos.concat((await IMG.mapillary(w, s, e, n, mapillaryToken, 'thumb_1024_url')).map(p => ({ ...p, url: p.full, src: 'Mapillary' }))); } catch (er) { log('Mapillary : ' + er.message); }
  }
  // répartition spatiale : au plus 1 photo par case de 25 m, puis plafond (mémoire et données mobiles)
  const cells = new Map();
  for (const p of photos) { [p.x, p.y] = toL93(p.lon, p.lat); const k = Math.floor(p.x / 25) + ',' + Math.floor(p.y / 25); if (!cells.has(k) || (p.src === 'Mapillary' && cells.get(k).src !== 'Mapillary')) cells.set(k, p); }
  let pick = [...cells.values()];
  // priorité aux photos proches du bâtiment étudié
  pick.sort((a, b) => Math.hypot(a.x - c[0], a.y - c[1]) - Math.hypot(b.x - c[0], b.y - c[1])); pick = pick.slice(0, maxPhotos);
  log(`Style du quartier : ${blds.length} bâtiments, ${photos.length} photos (${pick.length} analysées)`);
  const sample = (g, x, y) => g ? IGN.sampleGrid(g, x, y) : NaN;
  for (const b of blds) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of b.ring) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } b.bb = [x0, y0, x1, y1]; }
  let done = 0;
  for (const ph of pick) {
    progress(done++ / pick.length);
    let pix; try { pix = await PX.loadPixels({ sd: ph.url, id: ph.id }, 'sd'); } catch (er) { continue; }
    ph.W = pix.W; ph.H = pix.H; const P = projector(ph), gains = wbGains(pix);
    let gz = sample(mnt, ph.x, ph.y); if (gz !== gz) gz = 0; const cz = gz + 2.2;
    for (const b of blds) {
      // bâtiments à moins de 45 m de la photo
      if (ph.x < b.bb[0] - 45 || ph.x > b.bb[2] + 45 || ph.y < b.bb[1] - 45 || ph.y > b.bb[3] + 45) continue;
      const r = b.ring;
      let ground = sample(mnt, r[0][0], r[0][1]); if (ground !== ground) ground = b.sol ?? gz;
      for (let i = 0; i < r.length - 1; i++) {
        const a = r[i], q = r[i + 1], L = Math.hypot(q[0] - a[0], q[1] - a[1]); if (L < 3) continue;
        let nx = (q[1] - a[1]) / L, ny = -(q[0] - a[0]) / L; // normale (sens indéterminé : on oriente vers l'extérieur)
        const mx = (a[0] + q[0]) / 2, my = (a[1] + q[1]) / 2; if (pointInRing(mx + nx * 0.5, my + ny * 0.5, r)) { nx = -nx; ny = -ny; }
        const n = Math.min(8, Math.ceil(L / 3));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, x = a[0] + (q[0] - a[0]) * t + nx * 0.15, y = a[1] + (q[1] - a[1]) * t + ny * 0.15;
          const dx = ph.x - x, dy = ph.y - y, d = Math.hypot(dx, dy); if (d > 45 || d < 3) continue;
          const cosA = (dx * nx + dy * ny) / d; if (cosA < 0.3) continue;
          for (const fz of [0.2, 0.45, 0.65]) {
            const z = ground + Math.max(1.2, Math.min(b.h * fz, b.h - 1.5)); // jamais près de la corniche (risque de ciel)
            // occultation : arbres, voitures hautes, autres bâtiments (LiDAR)
            let occ = false; const st = Math.floor(d);
            for (let j = 1; j < st && !occ; j++) { const u = j / st, hx = x + dx * u, hy = y + dy * u, hz = z + (cz - z) * u, m = sample(mns, hx, hy); if (m === m && m > hz + 0.6) occ = true; }
            if (occ) continue;
            const uv = P(x - ph.x, y - ph.y, z - cz); if (!uv) continue;
            const cx = Math.round(uv[0]), cy = Math.round(uv[1]); if (cx < 1 || cy < 1 || cx >= pix.W - 1 || cy >= pix.H - 1) continue;
            let rr = 0, gg = 0, bb2 = 0; for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const o = ((cy + oy) * pix.W + cx + ox) * 4; rr += pix.data[o]; gg += pix.data[o + 1]; bb2 += pix.data[o + 2]; }
            b.samples.push([Math.min(255, rr / 9 * gains[0]), Math.min(255, gg / 9 * gains[1]), Math.min(255, bb2 / 9 * gains[2])]); b.photos.add(ph.src + ':' + ph.id);
          }
        }
      }
    }
    pix = null; await tick();
  }
  progress(1);
  const measured = [];
  for (const b of blds) { if (b.photos.size && b.samples.length >= 8) { b.color = robustColor(b.samples); if (b.color) { b.conf = Math.min(0.8, 0.35 + 0.1 * b.photos.size + b.samples.length / 400); measured.push(b); } } }
  log(`Style du quartier : couleur mesurée sur ${measured.length} bâtiment(s) voisins`);
  return { blds, measured, photosUsed: pick.length, photosFound: photos.length, radius };
}

// similarité entre deux bâtiments (0..1)
function similarity(a, b, dist) {
  let s = Math.exp(-dist / 250);
  s *= a.usage && b.usage ? (a.usage === b.usage ? 1 : 0.45) : 0.7;
  if (a.annee && b.annee) s *= Math.exp(-Math.abs(a.annee - b.annee) / 15); else s *= 0.7;
  s *= Math.exp(-Math.abs(Math.log((a.h || 6) / (b.h || 6))) * 1.2);
  if (a.murs && b.murs) s *= a.murs.some(m => b.murs.includes(m)) ? 1 : 0.6;
  return s;
}
// couleur d'un bâtiment non photographié = moyenne pondérée des k voisins mesurés les plus semblables
export function inferColor(style, target) {
  const tc = target.center, cands = style.measured.filter(b => b.id !== target.id).map(b => {
    let cx = 0, cy = 0; for (const p of b.ring) { cx += p[0]; cy += p[1]; } cx /= b.ring.length; cy /= b.ring.length;
    return { b, s: similarity(target, b, Math.hypot(cx - tc[0], cy - tc[1])) * b.conf };
  }).sort((x, y) => y.s - x.s).slice(0, 5).filter(x => x.s > 0.01);
  if (!cands.length) return null;
  const W = cands.reduce((t, x) => t + x.s, 0), col = [0, 1, 2].map(k => Math.round(cands.reduce((t, x) => t + x.b.color[k] * x.s, 0) / W));
  return { color: col, from: cands.map(x => ({ id: x.b.id, color: x.b.color, s: x.s, annee: x.b.annee, usage: x.b.usage })), conf: Math.min(0.6, cands[0].s * 1.5) };
}
