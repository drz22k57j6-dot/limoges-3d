// Source mondiale de secours : OpenStreetMap (ODbL) via l'API Overpass et Nominatim.
// Pas de LiDAR : hauteur issue des tags (height, building:levels) sinon estimée.
import { localProjection } from '../geo.js';

export const osmInfo = { id: 'osm', name: 'OpenStreetMap (Overpass)', licence: 'ODbL 1.0 — © contributeurs OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' };
const OVERPASS = 'https://overpass-api.de/api/interpreter';

async function overpass(q) {
  const r = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!r.ok) throw new Error('Overpass HTTP ' + r.status); return r.json();
}
export async function osmBuildingsInView(w, s, e, n) {
  const d = await overpass(`[out:json][timeout:25];way["building"](${s},${w},${n},${e});out geom tags 2000;`);
  return d.elements.filter(x => x.geometry).map(x => ({ type: 'Feature', id: 'osm-way-' + x.id, properties: { cleabs: 'osm-way-' + x.id, hauteur: +x.tags.height || null, usage_1: x.tags.building },
    geometry: { type: 'Polygon', coordinates: [x.geometry.map(p => [p.lon, p.lat])] } }));
}
export async function osmBuildingAt(lon, lat) {
  const d = await overpass(`[out:json][timeout:25];way["building"](around:15,${lat},${lon});out geom tags;`);
  if (!d.elements.length) return null;
  const x = d.elements[0], P = localProjection(lon, lat), t = x.tags || {};
  const lv = +t['building:levels'] || null, h = parseFloat(t.height) || (lv ? lv * 3 + (+t['roof:height'] || 0) : null);
  return {
    source: 'osm', id: 'osm-way-' + x.id, crs: 'local', proj: P, origin: [lon, lat],
    outer: x.geometry.map(p => P.fwd(p.lon, p.lat)), holes: [],
    attrs: { usage: t.building, hauteur: h, etages: lv, logements: +t['building:flats'] || null, murs: t['building:material'] ? [t['building:material']] : null, toit: t['roof:material'] ? [t['roof:material']] : null,
      forme_toit: t['roof:shape'] || null, couleur: t['building:colour'] || null, couleur_toit: t['roof:colour'] || null, date: t.start_date || null },
  };
}
export async function nominatim(q) {
  const r = await fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ q, format: 'json', limit: 5 }));
  return (await r.json()).map(x => ({ label: x.display_name, lon: +x.lon, lat: +x.lat, score: x.importance }));
}
