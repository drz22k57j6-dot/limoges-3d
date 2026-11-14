// Source France : IGN Géoplateforme (BD TOPO, LiDAR HD, BD ORTHO, géocodage). Licence Ouverte 2.0.
// Tous les services ci-dessous répondent avec Access-Control-Allow-Origin: * (utilisables depuis Safari).
import { toL93, pointInRing, distSeg } from '../geo.js';

const WFS = 'https://data.geopf.fr/wfs/ows';
const WMSR = 'https://data.geopf.fr/wms-r/wms';
export const WMTS = 'https://data.geopf.fr/wmts';

export const ignInfo = {
  id: 'ign', name: 'IGN Géoplateforme', licence: 'Licence Ouverte 2.0 (Etalab)', url: 'https://geoservices.ign.fr',
  covers: (lon, lat) => lon > -5.5 && lon < 10 && lat > 41 && lat < 51.5, // France métropolitaine
};

async function getJSON(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (e) { err = e; await new Promise(r => setTimeout(r, 600 * (i + 1))); }
  }
  throw err;
}

const wfsURL = p => WFS + '?' + new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: 'BDTOPO_V3:batiment', OUTPUTFORMAT: 'application/json', ...p });

// Bâtiments dans une emprise (lon/lat) — pour l'affichage sur la carte
export async function buildingsInView(w, s, e, n, max = 1500) {
  const d = await getJSON(wfsURL({ SRSNAME: 'EPSG:4326', COUNT: String(max), BBOX: `${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`, PROPERTYNAME: 'cleabs,hauteur,usage_1,nombre_d_etages,geometrie' }));
  return d.features;
}
// Bâtiment le plus proche d'un point (lon/lat), rayon en m
export async function buildingAt(lon, lat, radius = 3) {
  const d = await getJSON(wfsURL({ SRSNAME: 'EPSG:2154', COUNT: '20', CQL_FILTER: `DWITHIN(geometrie,POINT(${lat} ${lon}),${radius},meters)` }));
  if (!d.features.length) return null;
  const [x, y] = toL93(lon, lat);
  let best = null, bd = Infinity;
  for (const f of d.features) {
    for (const poly of f.geometry.coordinates) {
      const r = poly[0]; let dd = pointInRing(x, y, r) ? 0 : Infinity;
      for (let i = 0; i < r.length - 1 && dd; i++) dd = Math.min(dd, distSeg(x, y, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]));
      if (dd < bd) { bd = dd; best = f; }
    }
  }
  return best;
}
export async function buildingById(cleabs) {
  const d = await getJSON(wfsURL({ SRSNAME: 'EPSG:2154', CQL_FILTER: `cleabs='${cleabs.replace(/'/g, '')}'` }));
  return d.features[0] || null;
}
// Bâtiments autour (pour occlusions et environnement), Lambert-93
export async function buildingsAround(bb) {
  const d = await getJSON(wfsURL({ SRSNAME: 'EPSG:2154', COUNT: '3000', BBOX: `${bb[0]},${bb[1]},${bb[2]},${bb[3]},EPSG:2154`, PROPERTYNAME: 'cleabs,hauteur,geometrie' }));
  return d.features;
}

// Grille d'altitudes (float32) via WMS raster IGN au format BIL. layer: 'MNS' | 'MNT'
export async function elevationGrid(layer, bb, res) {
  const W = Math.min(2048, Math.round((bb[2] - bb[0]) / res)), H = Math.min(2048, Math.round((bb[3] - bb[1]) / res));
  const url = WMSR + '?' + new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: `IGNF_LIDAR-HD_${layer}_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93`, STYLES: '', CRS: 'EPSG:2154', BBOX: bb.join(','), WIDTH: W, HEIGHT: H, FORMAT: 'image/x-bil;bits=32' });
  let err;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = await r.arrayBuffer(); if (buf.byteLength !== W * H * 4) throw new Error('réponse LiDAR inattendue');
      const a = new Float32Array(buf); let valid = 0; for (let k = 0; k < a.length; k++) { if (a[k] < -1000 || a[k] > 9000) a[k] = NaN; else valid++; }
      return { data: a, W, H, bb, rx: (bb[2] - bb[0]) / W, ry: (bb[3] - bb[1]) / H, valid: valid / a.length };
    } catch (e) { err = e; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
  }
  throw err;
}
// échantillonnage bilinéaire d'une grille (x,y Lambert-93)
export function sampleGrid(g, x, y) {
  const c = (x - g.bb[0]) / g.rx - 0.5, r = (g.bb[3] - y) / g.ry - 0.5;
  if (c < 0 || r < 0 || c > g.W - 1 || r > g.H - 1) return NaN;
  const c0 = Math.min(g.W - 2, c | 0), r0 = Math.min(g.H - 2, r | 0), fc = c - c0, fr = r - r0, d = g.data, W = g.W;
  const a = d[r0 * W + c0], b = d[r0 * W + c0 + 1], e = d[(r0 + 1) * W + c0], f = d[(r0 + 1) * W + c0 + 1];
  if (a !== a || b !== b || e !== e || f !== f) { const v = [a, b, e, f].filter(v => v === v); return v.length ? v[0] : NaN; }
  return a * (1 - fc) * (1 - fr) + b * fc * (1 - fr) + e * (1 - fc) * fr + f * fc * fr;
}

// Orthophoto (20 cm) sur une emprise — renvoie un canvas
export async function orthophoto(bb, res = 0.2, layer = 'HR.ORTHOIMAGERY.ORTHOPHOTOS') {
  let W = Math.round((bb[2] - bb[0]) / res), H = Math.round((bb[3] - bb[1]) / res);
  const k = Math.max(1, W / 2048, H / 2048); W = Math.round(W / k); H = Math.round(H / k);
  const url = WMSR + '?' + new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: layer, STYLES: '', CRS: 'EPSG:2154', BBOX: bb.join(','), WIDTH: W, HEIGHT: H, FORMAT: 'image/jpeg' });
  const img = await loadImage(url);
  const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(img, 0, 0);
  return { canvas: c, bb, W, H, res: (bb[2] - bb[0]) / W };
}
export function loadImage(url) {
  return new Promise((ok, ko) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ko(new Error('image ' + url.slice(0, 80))); i.src = url; });
}

export async function geocode(q) {
  const d = await getJSON('https://data.geopf.fr/geocodage/search?' + new URLSearchParams({ q, limit: 5 }));
  return d.features.map(f => ({ label: f.properties.label, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], score: f.properties.score }));
}

// Codes « matériaux » des fichiers fonciers repris par la BD TOPO
const MUR = { 0: 'indéterminé', 1: 'pierre', 2: 'meulière', 3: 'béton', 4: 'brique', 5: 'aggloméré', 6: 'bois', 9: 'autre' };
const TOIT = { 0: 'indéterminé', 1: 'tuiles', 2: 'ardoises', 3: 'zinc / aluminium', 4: 'béton', 9: 'autre' };
export function decodeMateriaux(code, table) {
  if (!code) return null; const T = table === 'toit' ? TOIT : MUR;
  const parts = String(code).split('').map(Number).filter((c, i, a) => a.indexOf(c) === i && !(c === 0 && a.length > 1));
  return parts.map(c => T[c] || '?');
}

// Normalise une entité BD TOPO en description de bâtiment commune à toutes les sources
export function normalizeIGN(f) {
  const p = f.properties, polys = f.geometry.coordinates;
  // plus grand polygone = bâtiment principal ; les autres sont ignorés (rare)
  let best = polys[0], ba = 0;
  for (const poly of polys) { let a = 0; const r = poly[0]; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; if (Math.abs(a) > ba) { ba = Math.abs(a); best = poly; } }
  return {
    source: 'ign', id: p.cleabs, crs: 'EPSG:2154',
    outer: best[0], holes: best.slice(1),
    attrs: {
      usage: p.usage_1, usage2: p.usage_2, nature: p.nature, hauteur: p.hauteur, etages: p.nombre_d_etages, logements: p.nombre_de_logements,
      murs: decodeMateriaux(p.materiaux_des_murs, 'mur'), toit: decodeMateriaux(p.materiaux_de_la_toiture, 'toit'),
      alt_sol_min: p.altitude_minimale_sol, alt_sol_max: p.altitude_maximale_sol, alt_toit_min: p.altitude_minimale_toit, alt_toit_max: p.altitude_maximale_toit,
      date: p.date_d_apparition, precision_plani: p.precision_planimetrique, precision_alti: p.precision_altimetrique, rnb: p.identifiants_rnb, leger: p.construction_legere,
    },
  };
}
