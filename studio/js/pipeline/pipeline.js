// Orchestrateur du pipeline de reconstruction (étapes 1 à 9 ; l'export est dans export.js).
// Indépendant de la ville : il reçoit un bâtiment normalisé et des « sources » disponibles.
import { normalizePolygon, centroid, bboxOf, perimeter, ringArea, minAreaRect, median, fromL93, toL93, pointInPolygon } from '../geo.js';
import * as IGN from '../sources/ign.js';
import * as PX from '../sources/panoramax.js';
import * as IMG from '../sources/images.js';
import { neighbourhoodStyle, inferColor, robustColor } from './style.js';
import { analyseRoof, groundAlongOutline } from './roof.js';
import * as FA from './facade.js';
import { Provenance } from '../provenance.js';

export const STEPS = [
  'Identification du bâtiment', 'Emprise et dimensions', 'LiDAR : volume et toiture', 'Orthophoto : couleurs et toiture',
  'Photos de façades (Panoramax, photos perso)', 'Rectification des façades', 'Fenêtres, portes, balcons', 'Matériaux PBR', 'Intérieur plausible (généré)', 'Export GLB',
];

const MUR_RGB = { 'béton': [198, 193, 184], 'pierre': [176, 170, 158], 'meulière': [190, 160, 120], 'brique': [168, 96, 72], 'aggloméré': [214, 207, 194], 'bois': [146, 108, 74] };

export class Reconstruction {
  constructor(building, opts = {}) {
    this.b = building; this.o = { lidar: true, ortho: true, panoramax: true, maxDist: 90, ...opts };
    this.prov = new Provenance(); this.log = opts.log || (() => {}); this.step = opts.step || (() => {});
    this.userPhotos = []; this.settings = { balcons: {}, fenetres: null };
  }
  async analyse() {
    const t0 = performance.now();
    await this.s1(); await this.s2(); await this.s3(); await this.s4(); await this.s5(); await this.s6(); await this.s7();
    this.log(`Analyse terminée en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    return this;
  }
  // ---- 1. identification ----
  async s1() {
    this.step(0, 'run'); const b = this.b, a = b.attrs, pv = this.prov;
    pv.source(b.source, b.source === 'ign' ? 'IGN BD TOPO® (bâtiment)' : 'OpenStreetMap', b.source === 'ign' ? 'Licence Ouverte 2.0' : 'ODbL 1.0');
    pv.set('id', 'Identifiant', b.id, 'mesuree', 1, b.source);
    if (a.rnb) pv.set('rnb', 'Identifiant RNB', a.rnb, 'mesuree', 1, b.source);
    if (a.usage) pv.set('usage', 'Usage', a.usage + (a.usage2 ? ' / ' + a.usage2 : ''), 'mesuree', 0.8, b.source, 'attribut de la base');
    if (a.date) pv.set('date', 'Date d\'apparition', String(a.date).slice(0, 4), 'mesuree', 0.6, b.source, 'date de la donnée (souvent proche de la construction)');
    if (a.logements) pv.set('logements', 'Logements', a.logements, 'mesuree', 0.8, b.source, 'fichiers fonciers');
    this.step(0, 'ok', `${b.id} · ${a.usage || 'usage inconnu'}`);
  }
  // ---- 2. emprise ----
  async s2() {
    this.step(1, 'run'); const b = this.b;
    this.P = normalizePolygon(b.outer, b.holes); // coordonnées absolues (Lambert-93 ou plan local)
    const c = centroid(this.P); this.origin = [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100];
    this.Pl = { outer: this.P.outer.map(p => [p[0] - this.origin[0], p[1] - this.origin[1]]), holes: this.P.holes.map(h => h.map(p => [p[0] - this.origin[0], p[1] - this.origin[1]])) };
    const area = ringArea(this.P.outer) + this.P.holes.reduce((s, h) => s + ringArea(h), 0), per = perimeter(this.P.outer);
    const rect = minAreaRect(this.Pl.outer);
    this.dims = { area, per, length: Math.max(rect.w, rect.d), width: Math.min(rect.w, rect.d), orient: ((rect.w > rect.d ? rect.ang : rect.ang + Math.PI / 2) * 180 / Math.PI + 360) % 180 };
    const pp = this.b.attrs.precision_plani, conf = pp ? (pp <= 1.5 ? 0.85 : pp <= 5 ? 0.6 : 0.4) : 0.6;
    const pv = this.prov;
    pv.set('emprise', 'Empreinte au sol', `${this.P.outer.length} sommets${this.P.holes.length ? `, ${this.P.holes.length} cour(s)` : ''}`, 'mesuree', conf, this.b.source, pp ? `précision planimétrique annoncée : ${pp} m` : '');
    pv.set('surface', 'Surface au sol', area.toFixed(0) + ' m²', 'mesuree', conf, this.b.source);
    pv.set('perimetre', 'Périmètre', per.toFixed(1) + ' m', 'mesuree', conf, this.b.source);
    pv.set('gabarit', 'Rectangle englobant', `${this.dims.length.toFixed(1)} × ${this.dims.width.toFixed(1)} m`, 'deduite', conf, this.b.source, 'rectangle orienté minimal ; un bâtiment courbe est plus long que ce rectangle');
    if (this.b.crs === 'EPSG:2154') { const [lon, lat] = fromL93(...this.origin); this.lonlat = [lon, lat]; } else this.lonlat = this.b.origin;
    this.step(1, 'ok', `${area.toFixed(0)} m² · périmètre ${per.toFixed(0)} m`);
  }
  // ---- 3. LiDAR ----
  async s3() {
    this.step(2, 'run'); const pv = this.prov, a = this.b.attrs;
    if (this.b.source !== 'ign' || !this.o.lidar) {
      const h = a.hauteur || (a.etages ? a.etages * 3 : 9);
      this.roof = { ok: false }; this.ground = { min: 0, max: 0, median: 0 }; this.top = h; this.parapet = 0;
      pv.set('hauteur', 'Hauteur', h.toFixed(1) + ' m', a.hauteur ? 'mesuree' : 'deduite', a.hauteur ? 0.5 : 0.2, this.b.source, 'pas de LiDAR disponible ici');
      pv.set('toit', 'Forme du toit', a.forme_toit || 'plat (par défaut)', a.forme_toit ? 'mesuree' : 'generee', a.forme_toit ? 0.5 : 0.1, this.b.source);
      this.step(2, 'warn', 'pas de LiDAR : hauteur ' + h.toFixed(1) + ' m'); return;
    }
    pv.source('lidar', 'IGN LiDAR HD (MNS / MNT 50 cm)', 'Licence Ouverte 2.0');
    const bb = bboxOf(this.P, 4), res = Math.max(0.5, (bb[2] - bb[0]) / 2048, (bb[3] - bb[1]) / 2048);
    this.log(`LiDAR : grille ${((bb[2] - bb[0]) / res) | 0} × ${((bb[3] - bb[1]) / res) | 0} à ${res} m`);
    [this.mns, this.mnt] = await Promise.all([IGN.elevationGrid('MNS', bb, res), IGN.elevationGrid('MNT', bb, res)]);
    if (this.mns.valid < 0.5) throw new Error('LiDAR HD absent sur cette zone (couverture ' + Math.round(this.mns.valid * 100) + ' %)');
    try { this.mntNear = await IGN.elevationGrid('MNT', bboxOf(this.P, 32), 1); } catch (e) { this.mntNear = null; }
    const roof = this.roof = analyseRoof(this.P, this.mns, this.mnt, { origin: this.origin });
    this.ground = groundAlongOutline(this.P, this.mnt, this.origin);
    if (!roof.ok) { this.step(2, 'err', roof.reason); throw new Error(roof.reason); }
    const flatShare = roof.planes.filter(p => p.slope < 6).reduce((s, p) => s + p.count, 0) / roof.planes.reduce((s, p) => s + p.count, 0);
    this.parapet = flatShare > 0.5 ? 0.5 : 0;
    const zEave = median(roof.Z), H = zEave - this.ground.min, conf = Math.min(0.95, 0.5 + roof.coverage * 0.45);
    this.top = zEave;
    pv.set('alt_sol', 'Altitude du sol', `${this.ground.min.toFixed(1)} → ${this.ground.max.toFixed(1)} m`, 'mesuree', 0.9, 'lidar', `dénivelé de ${(this.ground.max - this.ground.min).toFixed(1)} m le long du bâtiment`);
    pv.set('hauteur', 'Hauteur (sol bas → toit)', H.toFixed(1) + ' m', 'mesuree', conf, 'lidar', a.hauteur ? `BD TOPO : ${a.hauteur} m` : '');
    pv.set('hauteur_haut', 'Hauteur côté sol haut', (zEave - this.ground.max).toFixed(1) + ' m', 'mesuree', conf, 'lidar');
    pv.set('toit', 'Forme du toit', roof.type, 'mesuree', conf, 'lidar', `${roof.planes.length} plan(s) RANSAC, écart moyen ${(roof.rms * 100).toFixed(0)} cm, ${(roof.coverage * 100).toFixed(0)} % des points expliqués`);
    roof.planes.forEach((p, i) => pv.set('pan' + i, `Pan ${i + 1}`, `pente ${p.slope.toFixed(1)}°, ${p.slope >= 6 ? 'orienté ' + p.azimuth.toFixed(0) + '°, ' : ''}${(p.count * this.mns.rx * this.mns.ry).toFixed(0)} m²`, 'mesuree', conf, 'lidar'));
    pv.set('superstructures', 'Édicules / cheminées', `${roof.supers.length} détecté(s)`, 'mesuree', roof.supers.length ? 0.75 : 0.5, 'lidar', 'volumes au-dessus du toit (composantes LiDAR > 1,2 m²)');
    if (this.parapet) pv.set('acrotere', 'Acrotère', this.parapet + ' m', 'deduite', 0.35, 'lidar', 'valeur type pour un toit-terrasse ; trop fin pour le LiDAR 50 cm');
    if (a.toit) pv.set('mat_toit', 'Matériau du toit (cadastre)', a.toit.join(' + '), 'mesuree', 0.5, this.b.source, 'déclaration fiscale (fichiers fonciers)');
    this.step(2, 'ok', `${roof.type} · H ${H.toFixed(1)} m · ${roof.supers.length} édicule(s)`);
  }
  // ---- 4. orthophoto ----
  async s4() {
    this.step(3, 'run'); const pv = this.prov;
    if (this.b.source !== 'ign' || !this.o.ortho) { this.step(3, 'skip', 'orthophoto IGN indisponible ici'); return; }
    pv.source('ortho', 'IGN BD ORTHO® HR (20 cm)', 'Licence Ouverte 2.0');
    const bb = bboxOf(this.P, 25); this.ortho = await IGN.orthophoto(bb, 0.2);
    // recalage : un bâtiment haut « penche » sur l'orthophoto. On cherche le décalage qui aligne les bords du toit.
    const o = this.ortho, W = o.W, H = o.H, d = o.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const L = new Float32Array(W * H); for (let i = 0; i < W * H; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    o.lum = L; o.rgba = d;
    const grad = (x, y) => { const c = (x - bb[0]) / o.res, r = (bb[3] - y) / o.res; const ci = c | 0, ri = r | 0; if (ci < 1 || ri < 1 || ci >= W - 1 || ri >= H - 1) return 0; return Math.hypot(L[ri * W + ci + 1] - L[ri * W + ci - 1], L[(ri + 1) * W + ci] - L[(ri - 1) * W + ci]); };
    const pts = []; for (const r of [this.P.outer]) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.6); for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
    const sub = pts.filter((_, i) => i % Math.max(1, Math.ceil(pts.length / 1500)) === 0);
    let best = [0, 0], bs = -1; const R = 6, st = 0.4;
    for (let dx = -R; dx <= R; dx += st) for (let dy = -R; dy <= R; dy += st) { let s = 0; for (const p of sub) s += grad(p[0] + dx, p[1] + dy); if (s > bs) { bs = s; best = [dx, dy]; } }
    let s0 = 0; for (const p of sub) s0 += grad(p[0], p[1]);
    this.orthoShift = bs > s0 * 1.08 ? best : [0, 0];
    // couleur du toit (pixels du toit décalés)
    const cols = [[], [], []];
    for (let r = 0; r < H; r += 2) for (let c = 0; c < W; c += 2) { const x = bb[0] + (c + 0.5) * o.res - this.orthoShift[0], y = bb[3] - (r + 0.5) * o.res - this.orthoShift[1]; if (pointInPolygon(x, y, this.P)) { const i = (r * W + c) * 4; cols[0].push(d[i]); cols[1].push(d[i + 1]); cols[2].push(d[i + 2]); } }
    this.roofColor = cols.map(a => Math.round(median(a)));
    // couleur de chaque superstructure
    if (this.roof && this.roof.ok) for (const s of this.roof.supers) { const x = s.cx + this.origin[0] + this.orthoShift[0], y = s.cy + this.origin[1] + this.orthoShift[1], c = ((x - bb[0]) / o.res) | 0, r = ((bb[3] - y) / o.res) | 0, i = (Math.max(0, Math.min(H - 1, r)) * W + Math.max(0, Math.min(W - 1, c))) * 4; s.color = [d[i], d[i + 1], d[i + 2]]; }
    pv.set('toit_texture', 'Texture du toit', `orthophoto 20 cm, recalée de ${Math.hypot(...this.orthoShift).toFixed(1)} m`, 'photographiee', 0.8, 'ortho', `décalage (${this.orthoShift.map(v => v.toFixed(1)).join(', ')}) m : la photo aérienne n'est pas une vraie orthophoto pour les bâtiments hauts`);
    pv.set('toit_couleur', 'Couleur du toit', 'rgb(' + this.roofColor.join(',') + ')', 'photographiee', 0.8, 'ortho', 'médiane des pixels du toit (ombres et reflets inclus)');
    this.step(3, 'ok', `recalage ${Math.hypot(...this.orthoShift).toFixed(1)} m · toit rgb(${this.roofColor})`);
  }
  // ---- 5. photos ----
  async s5() {
    this.step(4, 'run'); const pv = this.prov;
    this.groups = FA.facadeGroups(this.P, this.origin);
    FA.facadeProfiles(this.groups, { mnt: this.mnt, roof: this.roof, origin: this.origin, fallbackGround: this.ground.min, fallbackTop: this.ground.min + this.top, parapet: this.parapet });
    FA.allocTextures(this.groups);
    pv.set('facades', 'Façades', `${this.groups.length} pans de façade`, 'deduite', 0.8, this.b.source, 'contour découpé dès que l\'orientation tourne de plus de 22°');
    this.photos = [];
    if (this.o.panoramax && this.lonlat) {
      pv.source('panoramax', 'Panoramax (photos de rue)', 'licence propre à chaque photo');
      let m = this.o.maxDist; const bb = bboxOf(this.P, m);
      const toLL = (x, y) => this.b.crs === 'EPSG:2154' ? fromL93(x, y) : this.b.proj.inv(x, y);
      const [w, s] = toLL(bb[0], bb[1]), [e, n] = toLL(bb[2], bb[3]);
      // recherche multi-sources : Panoramax + Mapillary (si jeton) ; rayon élargi automatiquement si rien n'est trouvé
      const search = async (rad) => {
        const b2 = bboxOf(this.P, rad), [w2, s2] = toLL(b2[0], b2[1]), [e2, n2] = toLL(b2[2], b2[3]); let out = [];
        try { out = out.concat(await PX.searchPhotos(w2, s2, e2, n2, 500)); } catch (er) { this.log('Panoramax : ' + er.message); }
        if (this.o.mapillaryToken) {
          try { const ml = await IMG.mapillary(w2, s2, e2, n2, this.o.mapillaryToken); out = out.concat(ml.map(x => ({ ...x, sd: x.full, source: 'Mapillary' }))); pv.source('mapillary', 'Mapillary (photos de rue)', 'CC-BY-SA 4.0'); }
          catch (er) { this.log('Mapillary : ' + er.message); }
        }
        return out;
      };
      let photos = await search(m);
      if (!photos.length && m < 250) { this.log(`Aucune photo à ${m} m : recherche élargie à 250 m`); photos = await search(250); if (photos.length) this.o.maxDist = m = 250; }
      this.photosAll = photos;
      try { this.commons = await IMG.commons(this.lonlat[0], this.lonlat[1], 800); } catch (er) { this.commons = []; }
      this.log(`Photos de rue : ${photos.length} (Panoramax${this.o.mapillaryToken ? ' + Mapillary' : ''}) dans ${m} m · Wikimedia Commons : ${this.commons.length} à aligner`);
      if (photos.length && this.b.crs === 'EPSG:2154') {
        const bbE = bboxOf(this.P, m + 5), res = Math.max(1, (bbE[2] - bbE[0]) / 1024, (bbE[3] - bbE[1]) / 1024);
        try { [this.mnsEnv, this.mntEnv] = await Promise.all([IGN.elevationGrid('MNS', bbE, res), IGN.elevationGrid('MNT', bbE, res)]); } catch (er) { this.log('occultations LiDAR indisponibles'); }
      }
      for (const ph of photos) {
        const [x, y] = this.b.crs === 'EPSG:2154' ? toL93(ph.lon, ph.lat) : this.b.proj.fwd(ph.lon, ph.lat);
        let gz = this.mntEnv ? IGN.sampleGrid(this.mntEnv, x, y) : NaN; if (gz !== gz) gz = this.ground.min;
        ph.cam = { x: x - this.origin[0], y: y - this.origin[1], z: gz + 2.3 };
      }
      FA.scorePhotos(this.groups, photos, { origin: this.origin, mnsEnv: this.mnsEnv, maxDist: m });
      // on garde les meilleures photos (mémoire iPhone : 8 images « sd » au plus)
      const score = new Map(); for (const g of this.groups) g.cands.slice(0, 3).forEach(c => score.set(c.ph, (score.get(c.ph) || 0) + c.score));
      this.photos = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
      for (const ph of this.photos) { try { ph.pix = await PX.loadPixels(ph, 'sd'); } catch (er) { this.log('photo ' + ph.id + ' : ' + er.message); } }
      this.photos = this.photos.filter(p => p.pix);
      const near = photos.length ? Math.min(...photos.map(p => Math.hypot(p.cam.x, p.cam.y))) : null;
      pv.set('photos', 'Photos de rue utilisables (auto)', `${this.photos.length} / ${photos.length} trouvées`, this.photos.length ? 'photographiee' : 'deduite', this.photos.length ? 0.7 : 0.1, 'panoramax',
        photos.length ? `photo la plus proche à ${near.toFixed(0)} m du centre ; visibilité testée avec le LiDAR (arbres, bâtiments)` : 'aucune photo Panoramax dans le rayon de recherche');
    }
    for (const up of this.userPhotos) { const g = this.groups[up.group]; if (g) FA.applyUserPhoto(g, up.pix, up.corners); }
    if (this.userPhotos.length) pv.source('perso', 'Photos fournies par l\'utilisateur', 'droits de l\'utilisateur');
    this.step(4, this.photos.length || this.userPhotos.length ? 'ok' : 'warn', `${this.photos.length} photo(s) Panoramax · ${this.userPhotos.length} perso`);
  }
  // ---- 6. rectification ----
  async s6() {
    this.step(5, 'run'); const pv = this.prov; let filled = 0, total = 0;
    for (const g of this.groups) { if (this.photos.length) filled += FA.projectPhotos(g, { origin: this.origin, mnsEnv: this.mnsEnv, maxDist: this.o.maxDist }); await tick(); }
    // couverture réelle (pixels de mur photographiés) et couleur de mur
    const rgb = [[], [], []];
    for (const g of this.groups) {
      let n = 0, m = 0;
      for (let px = 0; px < g.tw; px++) { const s = (px + 0.5) / g.r, gz = FA.profileAt(g, s, 'ground'), ez = FA.profileAt(g, s, 'eave'); for (let py = 0; py < g.th; py++) { const z = g.zTop - (py + 0.5) / g.r; if (z < gz || z > ez) continue; n++; if (g.src[py * g.tw + px]) { m++; if ((px + py) % 3 === 0) { const o = (py * g.tw + px) * 4; rgb[0].push(g.rgba[o]); rgb[1].push(g.rgba[o + 1]); rgb[2].push(g.rgba[o + 2]); } } } }
      g.coverage = n ? m / n : 0; total += n; filled += 0; g.photoPx = m;
    }
    const cov = this.groups.reduce((s, g) => s + g.photoPx, 0) / Math.max(1, total);
    this.coverage = cov;
    const a = this.b.attrs, mat = (a.murs || []).find(m => MUR_RGB[m]);
    this.wallColorKind = rgb[0].length > 500 ? 'photographiee' : mat ? 'deduite' : a.couleur ? 'mesuree' : 'generee'; this.wallColor = null;
    // couleur des murs, par ordre de fiabilité : photos du bâtiment > photos de rue mesurées sur lui > bâtiments semblables du quartier > cadastre
    let own = rgb[0].length > 500 ? robustColor(rgb[0].map((r, i) => [r, rgb[1][i], rgb[2][i]])) : null;
    if (!own && this.o.style !== false && this.b.crs === 'EPSG:2154') {
      try {
        if (!this.style) this.style = await neighbourhoodStyle(this, { mapillaryToken: this.o.mapillaryToken, log: this.log, progress: f => this.step(5, 'run', `couleurs du quartier ${Math.round(f * 100)} %`) });
        const me = this.style && this.style.measured.find(b => b.id === this.b.id);
        if (me) { this.wallColor = me.color; this.wallColorKind = 'photographiee'; pv.source('rue', 'Photos de rue (Panoramax, Mapillary)', 'licences des photos');
          pv.set('mur_couleur', 'Couleur des murs', 'rgb(' + me.color + ')', 'photographiee', me.conf, 'rue', `mesurée sur ${me.photos.size} photo(s) de rue, ${me.samples.length} points de façade non masqués (LiDAR)`); }
        else if (this.style) {
          const a2 = this.b.attrs, inf = inferColor(this.style, { id: this.b.id, center: this.origin, usage: a2.usage, annee: a2.date ? +String(a2.date).slice(0, 4) : null, h: a2.hauteur || this.top, murs: a2.murs });
          if (inf) { this.wallColor = inf.color; this.wallColorKind = 'deduite'; this.colorFrom = inf.from;
            pv.set('mur_couleur', 'Couleur des murs', 'rgb(' + inf.color + ')', 'deduite', inf.conf, 'rue', `aucune photo de ce bâtiment : copiée des ${inf.from.length} bâtiments photographiés les plus semblables du quartier (âge, usage, hauteur, matériau, distance) sur ${this.style.measured.length} mesurés`); }
        }
      } catch (er) { this.log('Style du quartier : ' + er.message); }
    }
    if (this.wallColor && (this.wallColorKind === 'photographiee' || this.wallColorKind === 'deduite') && !own) { /* déjà fixée par le style du quartier */ }
    else if (own) { this.wallColor = own; pv.set('mur_couleur', 'Couleur des murs', 'rgb(' + this.wallColor + ')', 'photographiee', Math.min(0.8, 0.4 + cov), this.photos.length ? 'panoramax' : 'perso', 'médiane des pixels de façade photographiés (balance des blancs non corrigée)'); }
    else if (mat) { this.wallColor = MUR_RGB[mat]; pv.set('mur_couleur', 'Couleur des murs', 'rgb(' + this.wallColor + ')', 'deduite', 0.3, this.b.source, `teinte type pour « ${a.murs.join(' + ')} » (fichiers fonciers) — aucune photo de façade exploitable`); }
    else if (a.couleur) { this.wallColor = cssToRgb(a.couleur); pv.set('mur_couleur', 'Couleur des murs', a.couleur, 'mesuree', 0.4, this.b.source, 'tag OSM building:colour'); }
    else { this.wallColor = [212, 205, 192]; pv.set('mur_couleur', 'Couleur des murs', 'rgb(' + this.wallColor + ')', 'generee', 0.1, '-', 'enduit clair par défaut'); }
    if (this.manualColor) { this.wallColor = this.manualColor; this.wallColorKind = 'deduite'; pv.set('mur_couleur', 'Couleur des murs', 'rgb(' + this.wallColor + ')', 'deduite', 0.5, 'perso', 'choisie à l\'œil par l\'utilisateur'); }
    if (a.murs) pv.set('mat_murs', 'Matériau des murs (cadastre)', a.murs.join(' + '), 'mesuree', 0.5, this.b.source, 'déclaration fiscale (fichiers fonciers)');
    pv.set('facade_texture', 'Texture des façades', `${(cov * 100).toFixed(0)} % photographiée`, cov > 0.05 ? 'photographiee' : 'generee', cov > 0.05 ? Math.min(0.75, cov) : 0.05, cov > 0.05 ? 'panoramax' : '-',
      cov > 0.05 ? 'photos projetées sur la façade à l\'échelle (position caméra GPS ± quelques mètres) ; le reste est une texture d\'enduit générée' : 'aucune photo : enduit générique teinté — ce n\'est PAS l\'aspect réel de la façade');
    this.step(5, cov > 0.05 ? 'ok' : 'warn', `façades photographiées à ${(cov * 100).toFixed(0)} %`);
  }
  // ---- 7. ouvertures ----
  async s7() {
    this.step(6, 'run'); const pv = this.prov, a = this.b.attrs;
    const eaves = this.groups.flatMap(g => g.samples.map(q => q.eave)).sort((x, y) => x - y);
    const eaveRef = this.parapet ? median(this.roof.Z) : eaves[Math.floor(eaves.length * 0.1)] ?? this.ground.min + this.top;
    this.floors = FA.floorModel(a, eaveRef, this.ground.min, 0.35, a.usage);
    pv.set('etages', 'Étages', `${this.floors.n} (hauteur d'étage ${this.floors.h.toFixed(2)} m)`, a.etages ? 'mesuree' : 'deduite', this.floors.conf, this.b.source, this.floors.note);
    pv.set('niveaux', 'Niveaux de plancher', `${this.floors.levels.length} niveaux horizontaux`, 'deduite', this.floors.conf * 0.8, 'lidar', 'planchers alignés sous le toit ; sur un terrain en pente, les niveaux bas n\'existent que côté bas');
    const prm = this.settings.fenetres || (this.floors.residential ? { spacing: 2.9, width: 1.3, height: 1.4, sill: 0.95 } : { spacing: 3.3, width: 1.8, height: 1.7, sill: 0.9 });
    let nPhoto = 0, nDed = 0;
    for (const g of this.groups) {
      g.windows = []; g.doors = [];
      if (g.coverage > 0.35) {
        const det = FA.detectWindows(g, this.floors);
        if (det.windows.length >= Math.max(1, g.L / 10) * this.floors.levels.length * 0.4) { g.windows = det.windows; g.winKind = 'photographiee'; nPhoto += det.windows.length; }
      }
      if (!g.windows.length) { g.windows = FA.deduceWindows(g, this.floors, prm); g.winKind = 'deduite'; nDed += g.windows.length; }
      g.balcony = !!this.settings.balcons[g.id];
    }
    // portes : au pied des cages d'escalier probables (gros édicules d'un toit-terrasse)
    const cores = this.roof && this.roof.ok ? this.roof.supers.filter(s => s.area >= 5 && s.area <= 80 && s.h >= 1.2) : [];
    this.cores = cores;
    for (const c of cores) {
      let best = null, bd = Infinity;
      for (const g of this.groups) for (let s = 0.8; s < g.L - 0.8; s += 0.5) { const p = FA.facadePoint(g, s), d = Math.hypot(p.x - c.cx, p.y - c.cy) + FA.profileAt(g, s, 'ground') * 0.0; if (d < bd) { bd = d; best = { g, s }; } }
      if (best && bd < 15) { const gz = FA.profileAt(best.g, best.s, 'ground'); best.g.doors.push({ s: best.s, w: 1.4, z: gz, h: 2.3 }); best.g.windows = best.g.windows.filter(w => !(Math.abs(w.s - best.s) < 1.4 && w.z < gz + 2.6)); }
    }
    pv.set('fenetres', 'Fenêtres', `${nPhoto + nDed} (${nPhoto} détectées sur photo, ${nDed} déduites)`, nPhoto > nDed ? 'photographiee' : 'deduite', nPhoto > nDed ? 0.55 : 0.25, nPhoto ? 'panoramax' : this.b.source,
      nDed ? `trame déduite : 1 fenêtre ${prm.width} m tous les ${prm.spacing} m par étage (valeurs types « ${this.floors.residential ? 'logement' : 'activité'} ») — position réelle non observée` : 'colonnes sombres détectées dans chaque bande d\'étage');
    pv.set('portes', 'Portes d\'entrée', `${cores.length}`, 'deduite', cores.length ? 0.25 : 0.1, 'lidar', 'placées au pied des édicules (cages d\'escalier probables)');
    const nb = this.groups.filter(g => g.balcony).length;
    pv.set('balcons', 'Balcons', nb ? `${nb} façade(s) avec balcons` : 'aucun', nb ? 'deduite' : 'deduite', nb ? 0.3 : 0.2, '-', nb ? 'ajoutés manuellement (réglage)' : 'non détectés automatiquement ; activables par façade dans les réglages');
    this.step(6, nPhoto ? 'ok' : 'warn', `${nPhoto + nDed} fenêtres (${nPhoto} photo / ${nDed} déduites) · ${cores.length} porte(s)`);
  }
}
// Photo posée (à la main dans l'aligneur, ou automatiquement) : projetée sur toutes les façades visibles
Reconstruction.prototype.applyPosed = async function (ph) {
  const d = Math.hypot(ph.cam.x, ph.cam.y) + 40, need = bboxOf(this.P, d);
  const bb = this.mnsEnv && this.mnsEnv.bb;
  if (this.b.crs === 'EPSG:2154' && (!bb || need[0] < bb[0] || need[1] < bb[1] || need[2] > bb[2] || need[3] > bb[3])) {
    const res = Math.max(1, (need[2] - need[0]) / 2048, (need[3] - need[1]) / 2048);
    try { [this.mnsEnv, this.mntEnv] = await Promise.all([IGN.elevationGrid('MNS', need, res), IGN.elevationGrid('MNT', need, res)]); } catch (e) { this.log('occultations LiDAR indisponibles'); }
  }
  ph.W = ph.pix.W; ph.H = ph.pix.H;
  const ctx = { origin: this.origin, mnsEnv: ph.ignoreOcclusion ? null : this.mnsEnv, maxDist: Math.max(this.o.maxDist, d + 20) };
  const saved = this.groups.map(g => g.cands);
  FA.scorePhotos(this.groups, [ph], ctx);
  let n = 0;
  for (const g of this.groups) { if (g.cands.length) n += FA.projectPhotos(g, ctx, g.cands, 2); await tick(); }
  this.groups.forEach((g, i) => (g.cands = saved[i]));
  (this.posed = this.posed || []).push(ph);
  this.prov.source(ph.sourceKey || 'perso', ph.sourceName || 'Photos posées à la main', ph.licence || 'droits de l\'utilisateur');
  this.log(`Photo « ${ph.label || ph.id} » projetée : ${n} pixels de façade`);
  await this.s6(); await this.s7();
  return n;
};
const tick = () => new Promise(r => setTimeout(r, 0));
function cssToRgb(c) { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = c; const h = x.fillStyle; return h.startsWith('#') ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : [210, 205, 195]; }
