// Autres sources d'images de bâtiments (en plus de Panoramax). Toutes utilisables depuis le navigateur.
// Chaque image est normalisée : { id, source, thumb, full, lon, lat, azimuth?, fov?, spherical, licence, auteur, page, pose: 'auto'|'approx'|'aucune' }

// ---- Wikimedia Commons : photos géolocalisées sous licence libre (CC-BY, CC-BY-SA, domaine public) ----
export async function commons(lon, lat, radius = 500) {
  const u = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', generator: 'geosearch', ggscoord: `${lat}|${lon}`, ggsradius: Math.min(10000, radius), ggsnamespace: 6, ggslimit: 50,
    prop: 'imageinfo|coordinates', iiprop: 'url|extmetadata|size', iiurlwidth: 1600, coprop: 'type|heading', format: 'json', origin: '*' });
  const d = await (await fetch(u)).json(); const pages = Object.values(d.query?.pages || {});
  return pages.filter(p => p.imageinfo && /\.(jpe?g|png|webp)$/i.test(p.title)).map(p => {
    const ii = p.imageinfo[0], m = ii.extmetadata || {}, c = (p.coordinates || [])[0] || {};
    const strip = h => String(h || '').replace(/<[^>]+>/g, '').trim();
    return { id: 'commons-' + p.pageid, source: 'Wikimedia Commons', thumb: ii.thumburl, full: ii.thumburl || ii.url, lon: c.lon, lat: c.lat, azimuth: c.heading != null && !isNaN(+c.heading) ? +c.heading : null,
      spherical: false, licence: strip(m.LicenseShortName?.value) || 'voir la page', auteur: strip(m.Artist?.value).slice(0, 60), page: ii.descriptionurl, pose: c.heading ? 'approx' : 'aucune', titre: p.title.replace(/^File:/, '') };
  });
}

// ---- Mapillary (Meta) : photos de rue CC-BY-SA, position et cap calculés. Jeton gratuit à créer sur mapillary.com/developer ----
export async function mapillary(w, s, e, n, token) {
  const u = 'https://graph.mapillary.com/images?' + new URLSearchParams({ access_token: token, bbox: [w, s, e, n].join(','), limit: 200,
    fields: 'id,computed_geometry,geometry,computed_compass_angle,compass_angle,thumb_256_url,thumb_2048_url,camera_type,captured_at,creator' });
  const r = await fetch(u); if (!r.ok) throw new Error('Mapillary HTTP ' + r.status + (r.status === 401 ? ' (jeton invalide)' : ''));
  const d = await r.json();
  return (d.data || []).map(x => { const g = (x.computed_geometry || x.geometry).coordinates; const sph = /spherical|equirect/.test(x.camera_type || '');
    return { id: 'mly-' + x.id, source: 'Mapillary', thumb: x.thumb_256_url, full: x.thumb_2048_url, lon: g[0], lat: g[1], azimuth: x.computed_compass_angle ?? x.compass_angle, fov: sph ? 360 : 70, spherical: sph,
      licence: 'CC-BY-SA 4.0', auteur: x.creator?.username || 'Mapillary', page: 'https://www.mapillary.com/app/?pKey=' + x.id, date: x.captured_at ? new Date(x.captured_at).toISOString() : '', pose: 'auto' }; });
}

// ---- Image depuis une adresse web (le serveur doit autoriser CORS) ----
export async function fromURL(url) {
  const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
  const blob = await r.blob(); if (!/^image\//.test(blob.type)) throw new Error('ce n\'est pas une image');
  return blob;
}

// ---- Lecture EXIF (JPEG) : GPS, cap de la boussole, focale équivalente 24×36 ----
export async function readExif(blob) {
  const b = new DataView(await blob.slice(0, 256 * 1024).arrayBuffer()); const out = {};
  if (b.getUint16(0) !== 0xFFD8) return out;
  let o = 2;
  while (o < b.byteLength - 4) {
    const m = b.getUint16(o), L = b.getUint16(o + 2);
    if (m === 0xFFE1 && b.getUint32(o + 4) === 0x45786966) { parseTiff(b, o + 10, out); break; }
    if ((m & 0xFF00) !== 0xFF00) break; o += 2 + L;
  }
  return out;
}
function parseTiff(b, t, out) {
  const le = b.getUint16(t) === 0x4949, u16 = p => b.getUint16(p, le), u32 = p => b.getUint32(p, le);
  const rat = p => u32(p) / (u32(p + 4) || 1);
  const ifd = (p, cb) => { const n = u16(p); for (let i = 0; i < n; i++) { const e = p + 2 + i * 12; cb(u16(e), u16(e + 2), u32(e + 4), e + 8); } };
  let exifP = 0, gpsP = 0;
  ifd(t + u32(t + 4), (tag, type, cnt, vp) => { if (tag === 0x8769) exifP = u32(vp); if (tag === 0x8825) gpsP = u32(vp); if (tag === 0x010F) out.marque = str(b, t + u32(vp), cnt); if (tag === 0x0110) out.modele = str(b, t + u32(vp), cnt); });
  if (exifP) ifd(t + exifP, (tag, type, cnt, vp) => { if (tag === 0xA405) out.focale35 = u16(vp); if (tag === 0x920A) out.focale = rat(t + u32(vp)); if (tag === 0x9003) out.date = str(b, t + u32(vp), cnt); });
  if (gpsP) { const g = {}; ifd(t + gpsP, (tag, type, cnt, vp) => { const at = t + u32(vp);
    if (tag === 1 || tag === 3 || tag === 16) g[tag] = String.fromCharCode(b.getUint8(vp));
    if (tag === 2 || tag === 4) g[tag] = rat(at) + rat(at + 8) / 60 + rat(at + 16) / 3600;
    if (tag === 6) g[6] = rat(at); if (tag === 17) g[17] = rat(at); });
    if (g[2] != null) { out.lat = g[2] * (g[1] === 'S' ? -1 : 1); out.lon = g[4] * (g[3] === 'W' ? -1 : 1); }
    if (g[6] != null) out.alt = g[6]; if (g[17] != null) out.cap = g[17]; }
  if (out.focale35) out.fov = 2 * Math.atan(18 / out.focale35) * 180 / Math.PI; // champ horizontal (36 mm de large)
}
const str = (b, p, n) => { let s = ''; for (let i = 0; i < n - 1 && p + i < b.byteLength; i++) s += String.fromCharCode(b.getUint8(p + i)); return s.trim(); };
