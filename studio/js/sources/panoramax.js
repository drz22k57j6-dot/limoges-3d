// Photos de rue Panoramax (géocommun, licences ouvertes par photo : Etalab 2.0 / CC-BY-SA 4.0 …).
// API STAC publique avec CORS. Les images sont servies depuis un stockage S3 avec CORS « * ».
export const panoramaxInfo = { id: 'panoramax', name: 'Panoramax', licence: 'licence propre à chaque photo (Etalab 2.0, CC-BY-SA 4.0…)', url: 'https://panoramax.fr' };
const API = 'https://api.panoramax.xyz/api';

export async function searchPhotos(w, s, e, n, limit = 500) {
  const r = await fetch(`${API}/search?bbox=${w},${s},${e},${n}&limit=${limit}`);
  if (!r.ok) throw new Error('Panoramax HTTP ' + r.status);
  const d = await r.json();
  return d.features.map(f => {
    const p = f.properties, io = p['pers:interior_orientation'] || {};
    const licLink = (f.links || []).find(l => l.rel === 'license');
    return {
      id: f.id, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], date: p.datetime,
      azimuth: +p['view:azimuth'] || 0, pitch: +p['pers:pitch'] || 0, roll: +p['pers:roll'] || 0,
      fov: io.field_of_view || 70, spherical: (io.field_of_view || 0) >= 360,
      licence: p.license || (licLink && licLink.title) || 'inconnue',
      auteur: (f.providers || []).map(x => x.name).join(', ') || (p['geovisio:producer'] || ''),
      accuracy: p['quality:horizontal_accuracy'] || null,
      sd: f.assets && f.assets.sd && f.assets.sd.href, hd: f.assets && f.assets.hd && f.assets.hd.href, thumb: f.assets && f.assets.thumb && f.assets.thumb.href,
      page: `https://api.panoramax.xyz/#focus=pic&pic=${f.id}`,
    };
  });
}

// Charge l'image et renvoie ses pixels (ImageData) — résolution « sd » (≈ 2048 px) adaptée à l'iPhone
export async function loadPixels(photo, which = 'sd') {
  const url = photo[which] || photo.sd;
  const img = await new Promise((ok, ko) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ko(new Error('photo ' + photo.id)); i.src = url; });
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  return { img, canvas: c, data: g.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height };
}
