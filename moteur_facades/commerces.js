// Moteur de commerces parisiens — devantures réalistes selon le vrai type de commerce (APUR BDCOM + OpenStreetMap).
// Chaque type définit : devanture (boiserie traditionnelle, alu moderne, vitrage dans la pierre), enseigne,
// éclairage, intérieur (comptoirs, rayons, produits), extérieur (terrasse, store banne, étals, croix verte, carotte…).
// API : classer(cat, osm) → type ; buildShop(ctx) appelé par travée depuis facades.js (ctx.shop = {type, nom, chaine, ferme}).

// ------------------------------------------------------------------ classification
const MOTS = [
  ['vacant', /vacant|travaux|à louer/i],
  ['pharmacie', /pharmac/i], ['tabac', /tabac|presse|tobacco|newsagent/i],
  ['boulangerie', /boulang|pâtiss|patiss|bakery|pastry|viennois/i],
  ['boucherie', /bouch|charcut|volaill|butcher|deli/i], ['fromagerie', /fromag|cheese|crémerie|cremerie|dairy/i],
  ['poissonnerie', /poisson|seafood|fish/i], ['primeur', /primeur|fruits|légumes|greengrocer/i],
  ['caviste', /cavist|vins|wine|alcohol|spiritueux/i], ['chocolatier', /chocolat|confis|confectionery/i],
  ['superette', /supér|super|alimentation générale|supermarket|convenience|épicerie générale|minimarch|hypermarch/i],
  ['epicerie', /épicerie|epicerie|traiteur|bio|organic|grocery/i],
  ['rapide', /rapide|fast|kebab|snack|sandwich|pizz|burger|tacos/i],
  ['cafe', /café|cafe|bar|brasserie|débit de boissons|pub/i], ['restaurant', /restau|crêper|creper/i],
  ['fleuriste', /fleur|florist|garden/i], ['librairie', /librair|livre|books|papeter|stationery/i],
  ['pressing', /pressing|cordonn|dry_cleaning|laundry_service|retouche|tailor/i], ['laverie', /laverie|laundry|lavomat/i],
  ['coiffeur', /coiff|barb|hairdresser/i], ['beaute', /beauté|beauty|esthét|ongl|parfum|cosmetic|perfum|institut/i],
  ['opticien', /opti/i], ['immobilier', /immobil|estate_agent|agence/i], ['banque', /banque|bank|crédit|assurance|insurance|change/i],
  ['mode', /habill|vêtement|clothes|chauss|shoes|maroquin|bag|bijou|jewel|boutique|fashion|mode|lingerie|prêt-à-porter/i],
  ['maison', /meuble|furniture|décor|interior|bricol|hardware|quincaill|électro|electronics|téléphon|mobile_phone|informat|computer/i],
  ['sante', /médic|medic|dentist|doctor|clinic|kiné|labor|vétér|veterin|radiol/i],
];
export function classer(cat = '', osm = {}) {
  const s = [cat, osm.shop, osm.amenity, osm.craft, osm.office, osm.cuisine].filter(Boolean).join(' ');
  if (osm.amenity === 'cafe' || osm.amenity === 'bar' || osm.amenity === 'pub') return 'cafe';
  if (osm.amenity === 'fast_food') return 'rapide';
  if (osm.amenity === 'restaurant') return 'restaurant';
  for (const [t, re] of MOTS) if (re.test(s)) return t;
  return s ? 'autre' : 'vacant';
}

// ------------------------------------------------------------------ chaînes (couleurs d'enseigne seulement, sans logo)
const CHAINES = [
  [/franprix/i, '#e05a1f', '#fff'], [/carrefour/i, '#1f4f9c', '#fff'], [/monop/i, '#111', '#fff'], [/picard/i, '#1d4f9a', '#fff'],
  [/nicolas/i, '#5b1a2a', '#e6c97a'], [/paul\b/i, '#111', '#d9c08a'], [/starbucks/i, '#1e5b3e', '#fff'], [/mcdonald/i, '#c8102e', '#ffc72c'],
  [/burger king/i, '#d62300', '#f5ebdc'], [/société générale|societe generale/i, '#d0021b', '#111'], [/bnp/i, '#00915a', '#fff'],
  [/crédit agricole|credit agricole/i, '#0f6e6c', '#fff'], [/lcl/i, '#1b3a8a', '#ffd400'], [/caisse d'épargne|caisse d.epargne/i, '#d0021b', '#fff'],
  [/orpi/i, '#e2001a', '#fff'], [/century 21/i, '#252526', '#beaf87'], [/foncia/i, '#1d3f8f', '#fff'], [/optic 2000/i, '#1a3b8f', '#fff'],
  [/afflelou/i, '#111', '#fff'], [/krys/i, '#003a70', '#fff'], [/sephora/i, '#111', '#fff'], [/yves rocher/i, '#2f6b2f', '#fff'],
  [/la poste/i, '#ffcc00', '#003da5'], [/subway/i, '#0a7a3d', '#f2b700'], [/marie blach/i, '#6b1d2e', '#fff'], [/naturalia/i, '#5a8f2a', '#fff'],
  [/biocoop/i, '#4b7f2c', '#fff'], [/g20/i, '#e2001a', '#fff'], [/intermarch/i, '#e2001a', '#fff'], [/lidl/i, '#0050aa', '#fff200'],
];

// ------------------------------------------------------------------ types
// dev : 'bois' (boiserie peinte en saillie), 'alu' (cadre fin moderne), 'pierre' (vitrage dans la baie de pierre)
// ens : 'bandeau' (panneau peint), 'lettres' (lettres en relief sur la pierre), 'caisson' (caisson lumineux)
// lum : couleur de l'éclairage intérieur ; mur : teinte des murs intérieurs ; store : couleurs de store banne
export const TYPES = {
  boulangerie: { dev: 'bois', cols: ['#5a1f24', '#1f3a2e', '#2a3a5a', '#e9dfc4', '#6b4a2b'], ens: 'bandeau', font: 'Georgia, serif', lum: 0xffd9a0, mur: 0xe9d9bc, store: .4, dehors: null, decor: 'pain' },
  pharmacie: { dev: 'alu', cols: ['#f4f4f4', '#2a2a2a'], ens: 'lettres', txt: '#1a8a3a', font: 'Arial, sans-serif', lum: 0xf2fbff, mur: 0xf4f6f6, drapeau: 'croix', decor: 'rayons', nom: 'PHARMACIE' },
  tabac: { dev: 'alu', cols: ['#7a1f1f', '#1d2a44', '#2a2a2a'], ens: 'bandeau', font: 'Arial, sans-serif', lum: 0xfff0d8, mur: 0xd9c9a8, drapeau: 'carotte', decor: 'bar', terrasse: .7, store: .8, nom: 'BAR TABAC' },
  cafe: { dev: 'bois', cols: ['#1f3a2e', '#5a1f24', '#2b2b2b', '#1e2a44', '#6b4a2b', '#8a2a1a'], ens: 'bandeau', font: 'Georgia, serif', lum: 0xffd29a, mur: 0xc9a77a, decor: 'bar', terrasse: 1, store: .95 },
  restaurant: { dev: 'bois', cols: ['#2b2b2b', '#1f3a2e', '#5a1f24', '#e9dfc4', '#3b2a1c'], ens: 'bandeau', font: 'Georgia, serif', lum: 0xffc98a, mur: 0xd9c3a0, decor: 'tables', terrasse: .6, store: .75, ardoise: .8 },
  rapide: { dev: 'alu', cols: ['#c8102e', '#111', '#f2b700', '#1a7a3d'], ens: 'caisson', font: 'Arial Black, sans-serif', lum: 0xffffff, mur: 0xf2efe8, decor: 'comptoir', menuLum: 1, terrasse: .25 },
  superette: { dev: 'alu', cols: ['#e05a1f', '#1f4f9c', '#111', '#2f6b2f'], ens: 'caisson', font: 'Arial Black, sans-serif', lum: 0xf4fbff, mur: 0xf6f6f2, decor: 'rayonsHauts', dehors: 'etal', pDehors: .5 },
  epicerie: { dev: 'bois', cols: ['#1f3a2e', '#3b2a1c', '#5a4632', '#2a3a5a'], ens: 'bandeau', font: 'Georgia, serif', lum: 0xffe1b0, mur: 0xe9dcc4, decor: 'rayons', dehors: 'etal', pDehors: .4, store: .5 },
  primeur: { dev: 'pierre', cols: ['#2f6b2f', '#1f3a2e'], ens: 'bandeau', font: 'Arial, sans-serif', lum: 0xfff3dc, mur: 0xe6e2d6, decor: 'cagettes', dehors: 'etal', pDehors: 1, store: 1 },
  boucherie: { dev: 'bois', cols: ['#7a1f23', '#1e2a44', '#e9dfc4'], ens: 'bandeau', font: 'Georgia, serif', lum: 0xffffff, mur: 0xf4f1ea, decor: 'vitrineFroide', store: .6 },
  poissonnerie: { dev: 'pierre', cols: ['#1e3a5a', '#e9eef2'], ens: 'bandeau', font: 'Georgia, serif', lum: 0xf2fbff, mur: 0xe9f0f2, decor: 'banc', dehors: 'banc', pDehors: .6, store: .8 },
  fromagerie: { dev: 'bois', cols: ['#1f3a2e', '#e9dfc4', '#3b2a1c', '#2a3a5a'], ens: 'bandeau', font: 'Georgia, serif', lum: 0xffe8c0, mur: 0xefe6d2, decor: 'fromages', store: .5 },
  caviste: { dev: 'bois', cols: ['#5b1a2a', '#2b2b2b', '#1f3a2e'], ens: 'bandeau', font: 'Georgia, serif', lum: 0xffcf90, mur: 0x8a6a48, decor: 'bouteilles' },
  chocolatier: { dev: 'bois', cols: ['#3b2a1c', '#e9dfc4', '#5a1f24'], ens: 'bandeau', font: 'Georgia, serif', lum: 0xffe4b8, mur: 0xefe4d0, decor: 'vitrineBasse' },
  fleuriste: { dev: 'pierre', cols: ['#2f4a3a', '#e9dfc4'], ens: 'bandeau', font: 'Georgia, serif', lum: 0xfff6e6, mur: 0xe6e2d6, decor: 'plantes', dehors: 'fleurs', pDehors: 1 },
  librairie: { dev: 'bois', cols: ['#1e2a44', '#2b2b2b', '#5a1f24', '#1f3a2e'], ens: 'bandeau', font: 'Georgia, serif', lum: 0xffe4b8, mur: 0xd9c9a8, decor: 'livres', dehors: 'bac', pDehors: .4 },
  pressing: { dev: 'alu', cols: ['#1d4f9a', '#f4f4f4'], ens: 'bandeau', font: 'Arial, sans-serif', lum: 0xf4fbff, mur: 0xf2f2ee, decor: 'portants', nom: 'PRESSING' },
  laverie: { dev: 'alu', cols: ['#1d4f9a', '#e2001a', '#f4f4f4'], ens: 'caisson', font: 'Arial Black, sans-serif', lum: 0xf4fbff, mur: 0xf4f4f0, decor: 'machines', nom: 'LAVERIE' },
  coiffeur: { dev: 'alu', cols: ['#111', '#f4f4f4', '#5a1f24'], ens: 'lettres', font: 'Didot, Georgia, serif', lum: 0xfff3e0, mur: 0xefebe4, decor: 'fauteuils' },
  beaute: { dev: 'alu', cols: ['#111', '#f4f4f4', '#d9a0a8'], ens: 'lettres', font: 'Didot, Georgia, serif', lum: 0xfff6ee, mur: 0xf6efea, decor: 'rayons' },
  opticien: { dev: 'alu', cols: ['#111', '#1a3b8f', '#f4f4f4'], ens: 'lettres', font: 'Arial, sans-serif', lum: 0xffffff, mur: 0xf4f4f4, decor: 'vitrineBasse', nom: 'OPTICIEN' },
  immobilier: { dev: 'alu', cols: ['#e2001a', '#1d3f8f', '#252526'], ens: 'caisson', font: 'Arial, sans-serif', lum: 0xffffff, mur: 0xf2f2f0, decor: 'annonces' },
  banque: { dev: 'pierre', cols: ['#00915a', '#d0021b', '#1b3a8a', '#0f6e6c'], ens: 'lettres', font: 'Arial, sans-serif', lum: 0xf4fbff, mur: 0xe9ecee, decor: 'banque', dab: 1, verreOpaque: .6 },
  mode: { dev: 'pierre', cols: ['#111', '#e9dfc4', '#2b2b2b', '#5a4632'], ens: 'lettres', font: 'Didot, Georgia, serif', lum: 0xfff6ea, mur: 0xf2eee6, decor: 'mannequins' },
  maison: { dev: 'alu', cols: ['#2b2b2b', '#5a4632', '#1e2a44'], ens: 'bandeau', font: 'Arial, sans-serif', lum: 0xfff3e0, mur: 0xefebe4, decor: 'objets' },
  sante: { dev: 'alu', cols: ['#f4f4f4', '#5a6a7a'], ens: 'lettres', font: 'Arial, sans-serif', lum: 0xf4fbff, mur: 0xf4f4f4, decor: 'attente', verreOpaque: 1 },
  autre: { dev: 'alu', cols: ['#2b2b2b', '#5a4632', '#1e2a44', '#5a1f24'], ens: 'bandeau', font: 'Arial, sans-serif', lum: 0xfff3e0, mur: 0xe9e4da, decor: 'objets' },
  vacant: { vacant: 1 },
};
const NOMS = { boulangerie: 'BOULANGERIE', boucherie: 'BOUCHERIE', fromagerie: 'FROMAGERIE', primeur: 'PRIMEUR', caviste: 'CAVE', epicerie: 'ÉPICERIE', cafe: 'CAFÉ', restaurant: 'RESTAURANT', rapide: 'SNACK', superette: 'ALIMENTATION', fleuriste: 'FLEURS', librairie: 'LIBRAIRIE', coiffeur: 'COIFFURE', beaute: 'INSTITUT', immobilier: 'IMMOBILIER', banque: 'BANQUE', mode: 'BOUTIQUE', maison: 'MAISON', sante: 'CABINET', autre: 'COMMERCE', poissonnerie: 'POISSONNERIE', chocolatier: 'CHOCOLATIER' };

// ------------------------------------------------------------------ utilitaires
const matCache = new Map();
export const materiauxPartages = () => new Set(matCache.values());
function mat(T, k, make) { if (!matCache.has(k)) matCache.set(k, make()); return matCache.get(k); }
const emis = (T, hex, i = 1.2) => mat(T, 'em' + hex + i, () => new T.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: i, roughness: .5 }));
const peint = (T, css, rough = .35) => mat(T, 'p' + css + rough, () => new T.MeshStandardMaterial({ color: new T.Color(css), roughness: rough, metalness: .05 }));
const pick = (R, a) => a[Math.floor(R() * a.length)];
const TQ = (typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches) ? .5 : 1;
function texte(T, txt, w, h, fond, enc, font, opt = {}) {
  const c = document.createElement('canvas'); c.width = w * TQ; c.height = h * TQ; const g = c.getContext('2d'); g.scale(TQ, TQ);
  if (fond) { g.fillStyle = fond; g.fillRect(0, 0, w, h); } else g.clearRect(0, 0, w, h);
  if (opt.filet) { g.strokeStyle = enc; g.lineWidth = h * .04; g.strokeRect(h * .08, h * .08, w - h * .16, h - h * .16); }
  let sz = h * (opt.taille || .58); g.font = `${opt.gras === false ? '' : 'bold '}${sz}px ${font}`;
  while (g.measureText(txt).width > w * .9 && sz > 8) { sz *= .92; g.font = `${opt.gras === false ? '' : 'bold '}${sz}px ${font}`; }
  g.fillStyle = enc; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (opt.ombre) { g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowOffsetY = h * .03; g.shadowBlur = h * .04; }
  g.fillText(txt, w / 2, h * .54);
  if (opt.sous) { g.font = `${h * .17}px ${font}`; g.fillText(opt.sous, w / 2, h * .86); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}
const planTex = (T, tex, rough = .45, transp = false) => new T.MeshStandardMaterial({ map: tex, roughness: rough, transparent: transp, alphaTest: transp ? .3 : 0 });

// ------------------------------------------------------------------ construction d'une travée de commerce
export function buildShop(c) {
  const { T, G, extra, M, R, H, cx, y0, ww, wh, REC, shop } = c;
  const t = TYPES[shop.type] || TYPES.autre;
  if (t.vacant || shop.ferme) {   // local vide : rideau baissé tagué, ou vitrine blanchie « À LOUER »
    if (R() < .6 || shop.ferme) H.shopFront(T, G, extra, M, R, cx, y0, ww, wh, REC, shop.ancien || '', false, true, c.tagP);
    else vitrineBlanchie(c);
    return;
  }
  const ch = shop.nom && CHAINES.find(x => x[0].test(shop.nom));
  const sr = mkR(shop.id || shop.nom || shop.type);   // aléa propre au commerce (même couleur sur toutes ses travées)
  const col = ch ? ch[1] : pick(sr, t.cols), enc = ch ? ch[2] : (t.txt || (['#e9dfc4', '#f4f4f4', '#fff'].includes(col) ? '#2a2a2a' : (sr() < .5 ? '#d9b765' : '#f1ead8')));
  const dev = c.style === 'riche' && t.dev === 'alu' ? 'pierre' : t.dev;
  const z = -REC + .1, fasc = .55, gh = wh - fasc - .45;   // hauteur vitrée
  const cadre = peint(T, col, dev === 'bois' ? .3 : .25);
  // --- devanture
  if (dev === 'bois') {   // boiserie : pilastres et soubassement en saillie sur la pierre, corniche en tête (sur tout le groupe)
    const x0 = c.first ? c.gx0 + .08 : cx - c.bw / 2, x1 = c.last ? c.gx1 - .08 : cx + c.bw / 2, w = x1 - x0, xm = (x0 + x1) / 2;
    extra.push([H.box(T, w, .55, .18, xm, y0 + .27, .09), cadre]);
    extra.push([H.box(T, w, fasc + .12, .16, xm, y0 + wh - fasc / 2, .08), cadre]);
    extra.push([H.box(T, w + .1, .08, .26, xm, y0 + wh + .1, .12), cadre]);
    if (c.first) extra.push([H.box(T, .3, wh + .1, .22, x0 + .15, y0 + wh / 2, .11), cadre], [H.box(T, .36, .22, .26, x0 + .15, y0 + wh - .05, .12), cadre]);
    if (c.last) extra.push([H.box(T, .3, wh + .1, .22, x1 - .15, y0 + wh / 2, .11), cadre], [H.box(T, .36, .22, .26, x1 - .15, y0 + wh - .05, .12), cadre]);
    if (!c.first) extra.push([H.box(T, .2, wh - fasc, .2, cx - c.bw / 2, y0 + (wh - fasc) / 2, .1), cadre]);
    for (const k of [-1, 1]) extra.push([H.box(T, ww * .4, .3, .04, cx + k * ww * .22, y0 + .27, .2), cadre]);   // panneaux du soubassement
  } else {
    const fin = dev === 'alu' ? .06 : .09;
    for (const g of [H.box(T, ww, .45, .1, cx, y0 + .22, z), H.box(T, fin, gh, .1, cx - ww / 2 + fin / 2, y0 + .45 + gh / 2, z), H.box(T, fin, gh, .1, cx + ww / 2 - fin / 2, y0 + .45 + gh / 2, z), H.box(T, ww, .06, .1, cx, y0 + .45 + gh, z)]) extra.push([g, dev === 'alu' ? M.paint(0x2b2d2f, .35, .5) : cadre]);
    extra.push([H.box(T, ww, fasc, REC, cx, y0 + wh - fasc / 2, -REC / 2), M.paint(0x3a3a38, .6)]);
  }
  // porte du commerce (sur une travée du groupe) ou meneau
  const porte = c.first && (c.last || sr() < .5) || (!c.first && c.last && sr() < .3);
  const pz = dev === 'bois' ? z + .02 : z;
  if (porte) { const pw = Math.min(1, ww * .4), px = cx + (sr() < .5 ? -1 : 1) * (ww / 2 - pw / 2 - .1); for (const g of [H.box(T, .06, gh, .08, px - pw / 2, y0 + .45 + gh / 2 - .22, pz + .02), H.box(T, .06, gh, .08, px + pw / 2, y0 + .45 + gh / 2 - .22, pz + .02)]) extra.push([g, dev === 'alu' ? M.paint(0x2b2d2f, .35, .5) : cadre]); extra.push([H.box(T, .03, .5, .04, px - pw / 2 + .12, y0 + 1.1, pz + .07), M.laiton]); }
  else extra.push([H.box(T, .07, gh, .08, cx, y0 + .45 + gh / 2, pz), dev === 'alu' ? M.paint(0x2b2d2f, .35, .5) : cadre]);
  // vitrage
  if (t.verreOpaque && R() < t.verreOpaque) extra.push([new T.PlaneGeometry(ww - .2, gh * .55).translate(cx, y0 + .5 + gh * .28, z - .01), mat(T, 'givre', () => new T.MeshStandardMaterial({ color: 0xe8ecee, roughness: .6, transparent: true, opacity: .85 }))]);
  G.vit.push(H.box(T, ww - .16, gh, .01, cx, y0 + .45 + gh / 2, z - .02));
  // --- enseigne (une seule par commerce, centrée sur le groupe)
  if (c.first) {
    const gw = c.gx1 - c.gx0 - .4, gm = (c.gx0 + c.gx1) / 2, nom = (shop.nom || t.nom || NOMS[shop.type] || 'COMMERCE').toUpperCase().slice(0, 34);
    const sous = !shop.nom || shop.nom.toUpperCase() === (t.nom || NOMS[shop.type]) ? null : (t.nom || NOMS[shop.type] || null);
    if (t.ens === 'lettres') {   // lettres découpées posées sur la pierre (ou le bandeau)
      const tx = texte(T, nom, 1024, 128, null, t.txt || (col === '#f4f4f4' ? '#222' : col), t.font, { taille: .7, ombre: true });
      extra.push([new T.PlaneGeometry(Math.min(gw, nom.length * .32 + .6), .42).translate(gm, y0 + wh - fasc / 2, dev === 'bois' ? .17 : .06), planTex(T, tx, .3, true)]);
    } else if (t.ens === 'caisson') {   // caisson lumineux
      const tx = texte(T, nom, 1024, 128, col, enc, t.font, { taille: .62 });
      extra.push([H.box(T, gw, .5, .14, gm, y0 + wh - fasc / 2, .08), M.paint(0x222222, .4)]);
      extra.push([new T.PlaneGeometry(gw - .06, .44).translate(gm, y0 + wh - fasc / 2, .156), new T.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: .55, roughness: .3 })]);
    } else {   // bandeau peint, lettres dorées ou crème
      const tx = texte(T, nom, 1024, 128, col, enc, t.font, { taille: .56, filet: dev === 'bois', sous: dev === 'bois' && sous ? null : null });
      extra.push([new T.PlaneGeometry(gw, fasc * .82).translate(gm, y0 + wh - fasc / 2, dev === 'bois' ? .165 : .06), planTex(T, tx, .35)]);
      if (dev === 'bois' && sous) {   // inscriptions peintes à la feuille d'or sur la vitre
        const t2 = texte(T, sous, 512, 96, null, '#d9b765', t.font, { taille: .55, gras: false });
        extra.push([new T.PlaneGeometry(Math.min(ww - .3, 1.8), .32).translate(cx, y0 + .45 + gh * .82, z - .005), planTex(T, t2, .3, true)]);
      }
    }
    // horaires / logos CB collés sur la porte
    extra.push([new T.PlaneGeometry(.22, .3).translate(cx + ww * .3, y0 + 1.5, z - .004), mat(T, 'horaires', () => planTex(T, texte(T, 'HORAIRES', 128, 160, '#f4f1e8', '#333', 'Arial', { taille: .16, filet: true }), .5))]);
  }
  // --- intérieur
  const deep = H.DEEP - .05, zb = -REC - deep;
  H.room(T, G, R, cx, y0 - .25, ww + .3, wh + .25, -REC, deep, { shop: true, pal: t.mur });
  extra.push([new T.PlaneGeometry(ww * .9, .06).translate(cx, y0 + wh - fasc - .02, -REC - .4).rotateX(0), emis(T, t.lum, 1.4)]);   // réglette lumineuse
  extra.push([new T.PlaneGeometry(ww * .9, wh * .55).translate(cx, y0 + wh * .45, zb + .06), mat(T, 'fond' + t.lum, () => new T.MeshStandardMaterial({ color: t.mur, emissive: t.lum, emissiveIntensity: .25, roughness: .9 }))]);
  if (!G.lod) decor(c, t, cx, y0, ww, gh, -REC, zb, sr);
  // --- extérieur : store banne, drapeau, terrasse, étals
  if (c.first && t.store && sr() < t.store) store(c, t, col, enc, (shop.nom || t.nom || NOMS[shop.type] || '').toUpperCase());
  if (c.last && t.drapeau) drapeau(c, t.drapeau);
  if (t.terrasse && sr() < t.terrasse && c.trottoir > 2.5 && !G.lod) terrasse(c, sr);
  if (t.dehors && R() < (t.pDehors ?? .5) && c.trottoir > 2.2 && !G.lod) dehors(c, t.dehors, cx, ww);
  if (t.ardoise && c.first && sr() < t.ardoise) ardoise(c, c.gx0 + .6);
  if (t.dab && c.last) { extra.push([H.box(T, .5, .7, .08, cx + ww / 2 + .02, y0 + 1.25, .02), M.paint(0x6c7378, .3, .6)], [new T.PlaneGeometry(.22, .16).translate(cx + ww / 2 + .02, y0 + 1.35, .065), emis(T, 0x7fb4e0, .8)]); }
}

function mkR(s) { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); let x = (h >>> 0) % 2147483646 + 1; return () => (x = x * 16807 % 2147483647) / 2147483647; }

function vitrineBlanchie(c) {
  const { T, extra, M, R, H, cx, y0, ww, wh, REC } = c, z = -REC + .1;
  extra.push([H.box(T, ww, .5, .12, cx, y0 + wh - .25, z), M.paint(0x6a6560, .8)]);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = '#e9e6de'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(200,195,185,${.3 + R() * .4})`; g.lineWidth = 6 + R() * 12; g.beginPath(); const x = R() * 256, y = R() * 256; g.arc(x, y, 10 + R() * 30, 0, 5); g.stroke(); }   // blanc d'Espagne passé à la main
  if (R() < .7) { g.fillStyle = '#c62828'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.fillText('À LOUER', 128, 110); g.fillStyle = '#333'; g.font = '18px Arial'; g.fillText('01 4' + Math.floor(R() * 9) + ' ' + (10 + Math.floor(R() * 89)) + ' ' + (10 + Math.floor(R() * 89)), 128, 140); }
  if (R() < c.tagP) H.drawTags(g, R, 256, 256, 1 + Math.floor(R() * 2));
  const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace;
  extra.push([new T.PlaneGeometry(ww - .2, wh - .7).translate(cx, y0 + (wh - .5) / 2, z - .01), new T.MeshStandardMaterial({ map: t, roughness: .9 })]);
}

// ------------------------------------------------------------------ décor intérieur par type
function decor(c, t, cx, y0, ww, gh, zf, zb, sr) {
  const { T, G, R, H } = c, V = (g, col, j = .1) => G.vc.push(H.vc(T, g, col, j, R));
  const B = (w, h, d, x, y, z, col, j) => V(new T.BoxGeometry(w, h, d).translate(x, y, z), col, j);
  const PROD = [0xd9263b, 0x1c6fd8, 0xf2c230, 0x2bb24c, 0xf4f1e8, 0xe8662a, 0x7b3fd1, 0x333333];
  const rang = (x0, x1, y, z, h, d, cols, pas = .07) => { for (let x = x0; x < x1 - pas * .5; x += pas * (.8 + R() * .4)) B(pas * .8, h * (.6 + R() * .4), d, x, y + h * .35, z, pick(R, cols), .15); };
  const fondEtag = (n, col, cols, h = .3) => { B(ww * .9, 2.1, .4, cx, y0 + 1.05, zb + .22, col, 0); for (let i = 0; i < n; i++) { B(ww * .88, .03, .38, cx, y0 + .35 + i * .42, zb + .24, col, 0); rang(cx - ww * .42, cx + ww * .42, y0 + .37 + i * .42, zb + .25, h, .25, cols); } };
  switch (t.decor) {
    case 'pain':   // présentoir vitré, corbeilles de baguettes, étagères à pain au fond
      B(ww * .8, .95, .6, cx, y0 + .47, zf - .9, 0xe9e2d4); B(ww * .8, .3, .55, cx, y0 + 1.1, zf - .9, 0xf4f1ea);
      for (let i = 0; i < 6; i++) V(new T.SphereGeometry(.07, 6, 4).scale(1.6, .7, 1).translate(cx - ww * .3 + i * ww * .12, y0 + 1.0, zf - .9), 0xc08a4a);
      fondEtag(0, 0x6b4a2e, []); for (let s = 0; s < 3; s++) for (let i = 0; i < 9; i++) V(new T.CylinderGeometry(.035, .035, .65, 6).rotateZ(.25 + R() * .2).translate(cx - ww * .38 + i * ww * .09, y0 + .9 + s * .45, zb + .3), 0xc98a45, .2);
      break;
    case 'rayons': case 'rayonsHauts':
      fondEtag(t.decor === 'rayonsHauts' ? 4 : 4, 0xf4f4f2, t.decor === 'rayonsHauts' ? PROD : [0xf4f4f4, 0x9fd0e0, 0xf2c2c8, 0xd9e8c4, 0x1c6fd8], .22);
      if (t.decor === 'rayonsHauts') for (const k of [-.25, .25]) { B(.5, 1.6, ww * .1 + .8, cx + k * ww, y0 + .8, zf - 1.1, 0xf0f0ec, 0); rang(cx + k * ww - .2, cx + k * ww + .2, y0 + 1.6, zf - 1.1, .2, .7, PROD); }
      else B(ww * .6, 1.0, .5, cx, y0 + .5, zf - 1.0, 0xf4f4f2);
      break;
    case 'bar':   // comptoir en zinc, bouteilles rétroéclairées, tables de bistrot
      B(ww * .7, 1.1, .6, cx + ww * .1, y0 + .55, zb + .8, 0x5a3a24); B(ww * .72, .05, .66, cx + ww * .1, y0 + 1.12, zb + .8, 0x9aa0a4);
      fondEtag(0, 0x3a2a1c, []); for (let s = 0; s < 3; s++) rang(cx - ww * .4, cx + ww * .4, y0 + 1.25 + s * .32, zb + .2, .28, .07, [0x2e5a2e, 0x6a3a1a, 0xd9c08a, 0x3a2a5a, 0xeeeeee], .08);
      for (let i = 0; i < 2; i++) { const x = cx - ww * .3 + i * ww * .5; V(new T.CylinderGeometry(.3, .3, .03, 12).translate(x, y0 + .72, zf - .55), 0x9aa0a4); V(new T.CylinderGeometry(.03, .03, .72, 6).translate(x, y0 + .36, zf - .55), 0x222222); }
      break;
    case 'tables':   // nappes blanches, chaises, verres
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const x = cx - ww * .25 + i * ww * .5, z = zf - .6 - j * .8; B(.7, .04, .7, x, y0 + .74, z, 0xf4f4f0, 0); B(.72, .3, .72, x, y0 + .6, z, 0xf2f0ea, 0); for (const k of [-1, 1]) H.chaise(T, G, R, x + k * .45, y0, z, 0x3b2a1c, k * Math.PI / 2); V(new T.CylinderGeometry(.03, .02, .12, 6).translate(x, y0 + .82, z), 0xdde8ea); }
      fondEtag(0, 0x6b4a2e, []);
      break;
    case 'comptoir':   // fast-food : comptoir inox, menu lumineux au-dessus, broche
      B(ww * .8, 1.05, .6, cx, y0 + .52, zb + .9, 0xc8ccce); fondEtag(0, 0xe9e6e0, []);
      c.extra.push([new T.PlaneGeometry(ww * .8, .5).translate(cx, y0 + 2.1, zb + .07), mat(T, 'menuLum', () => { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, 512, 128); for (let i = 0; i < 4; i++) { g.fillStyle = ['#c8102e', '#f2b700', '#2bb24c', '#e8662a'][i]; g.fillRect(10 + i * 125, 12, 115, 70); g.fillStyle = '#fff'; g.font = 'bold 18px Arial'; g.fillText((6 + i * 1.5).toFixed(2) + ' €', 30 + i * 125, 110); } const tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace; return new T.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: .9 }); })]);
      if (R() < .6) V(new T.CylinderGeometry(.14, .1, .6, 8).translate(cx - ww * .3, y0 + 1.5, zb + .35), 0x8a5a2a, .1);
      break;
    case 'cagettes':   // étals inclinés de cagettes
      for (let s = 0; s < 2; s++) { B(ww * .8, .05, .5, cx, y0 + .7 + s * .4, zb + .4 + s * .15, 0x9a7a55, 0); for (let i = 0; i < 5; i++) cagette(c, cx - ww * .32 + i * ww * .16, y0 + .74 + s * .4, zb + .4 + s * .15); }
      break;
    case 'vitrineFroide': case 'vitrineBasse': case 'fromages':
      B(ww * .85, .9, .7, cx, y0 + .45, zf - .9, t.decor === 'vitrineFroide' ? 0xf4f4f4 : 0x6b4a2e); G.vit.push(H.box(T, ww * .85, .35, .02, cx, y0 + 1.07, zf - .55));
      for (let i = 0; i < 8; i++) { const x = cx - ww * .36 + i * ww * .1; if (t.decor === 'fromages') V(new T.CylinderGeometry(.11, .11, .09, 10).translate(x, y0 + .95, zf - .9), pick(R, [0xf2d27a, 0xe9c860, 0xf4ecd6, 0xd99a3a])); else if (t.decor === 'vitrineFroide') B(.14, .05, .2, x, y0 + .93, zf - .9, pick(R, [0xa8323a, 0xc04a4a, 0xe0a0a0, 0x8a2a2a])); else B(.12, .04, .12, x, y0 + .93, zf - .9, pick(R, [0x3b2a1c, 0x6b4a2e, 0xd9b765, 0xf4ecd6])); }
      if (t.decor === 'fromages') for (let s = 0; s < 3; s++) for (let i = 0; i < 6; i++) V(new T.CylinderGeometry(.16, .16, .1, 10).translate(cx - ww * .35 + i * ww * .14, y0 + .6 + s * .45, zb + .25), pick(R, [0xf2d27a, 0xe9c860, 0xf4ecd6, 0xd9a35a]));
      else if (t.decor === 'vitrineFroide') { fondEtag(0, 0xf4f4f4, []); for (let i = 0; i < 5; i++) V(new T.CylinderGeometry(.06, .05, .45, 6).translate(cx - ww * .3 + i * ww * .15, y0 + 1.8, zb + .3), 0xa8424a); }
      else fondEtag(3, 0xf4f1ea, [0x3b2a1c, 0xd9b765, 0xf4ecd6, 0x8a2a2a], .14);
      break;
    case 'bouteilles':
      for (const k of [-1, 0, 1]) { const x = cx + k * ww * .3; B(ww * .28, 2.0, .35, x, y0 + 1, zb + .2, 0x5a3a24, 0); for (let s = 0; s < 6; s++) for (let i = 0; i < 6; i++) V(new T.CylinderGeometry(.035, .035, .3, 6).rotateX(Math.PI / 2).translate(x - ww * .11 + i * ww * .045, y0 + .3 + s * .3, zb + .3), pick(R, [0x1e3a1e, 0x3a1a1a, 0x2a2a1a, 0xd9c08a])); }
      V(new T.CylinderGeometry(.3, .3, .9, 10).translate(cx, y0 + .45, zf - .9), 0x6b4a2e);   // tonneau
      break;
    case 'plantes':
      for (let i = 0; i < 7; i++) H.pot(T, G, R, cx - ww * .4 + i * ww * .13, y0 + (i % 2) * .4, zb + .4 + (i % 3) * .4, true);
      B(ww * .5, .9, .6, cx, y0 + .45, zf - 1.2, 0x8a6a48);
      break;
    case 'livres':
      fondEtag(5, 0x5a3a24, [0x6d7f8a, 0x8a3b32, 0x3f5a46, 0xb7a58a, 0x2f3a52, 0xc9b9a0, 0xe9e2d4], .26);
      B(ww * .6, .8, .9, cx, y0 + .4, zf - 1.0, 0x5a3a24); rang(cx - ww * .28, cx + ww * .28, y0 + .82, zf - 1.0, .05, .7, [0xe9e2d4, 0x8a3b32, 0x2f3a52, 0xf2c230], .2);
      break;
    case 'portants':
      for (const k of [-1, 1]) { B(ww * .35, .03, .03, cx + k * ww * .2, y0 + 1.7, zb + .5, 0x999999, 0); for (let i = 0; i < 9; i++) B(.04, .9, .4, cx + k * ww * .2 - ww * .15 + i * ww * .04, y0 + 1.22, zb + .5, pick(R, [0x2f3a52, 0x111111, 0xe9e2d4, 0x8a3b32, 0x6d7f8a]), .1); }
      B(ww * .5, 1.0, .5, cx, y0 + .5, zf - .8, 0xf4f4f2);
      break;
    case 'machines':   // laverie : rangée de machines à hublot + séchoirs empilés
      for (let i = 0; i < Math.max(2, Math.floor(ww / .7)); i++) { const x = cx - ww / 2 + .4 + i * .7; for (const [y, z] of [[.45, zb + .4], [1.35, zb + .4]]) { B(.62, .85, .62, x, y0 + y, z, 0xf4f4f2, 0); V(new T.CylinderGeometry(.2, .2, .03, 14).rotateX(Math.PI / 2).translate(x, y0 + y + .05, z + .32), 0x333a40, 0); } }
      B(ww * .7, .45, .4, cx, y0 + .22, zf - .6, 0x8a8f94);   // banc
      break;
    case 'fauteuils':   // fauteuils et miroirs de coiffure
      for (let i = 0; i < Math.max(1, Math.floor(ww / .9)); i++) { const x = cx - ww / 2 + .5 + i * .9; V(new T.PlaneGeometry(.6, .9).translate(x, y0 + 1.45, zb + .02), 0xc8d4da, 0); B(.55, .45, .55, x, y0 + .5, zb + .7, 0x111111, 0); B(.55, .55, .08, x, y0 + .95, zb + .95, 0x111111, 0); B(.12, .3, .12, x, y0 + .15, zb + .7, 0x999999, 0); }
      break;
    case 'annonces': {   // agence : vitrine d'annonces suspendues
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 90; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 90); g.fillStyle = '#8aa6b8'; g.fillRect(6, 6, 52, 38); g.fillStyle = '#333'; for (let i = 0; i < 5; i++) g.fillRect(6, 52 + i * 7, 30 + (i * 13) % 22, 3); g.fillStyle = '#c62828'; g.fillRect(6, 80, 28, 6);
      const tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace; const m = mat(T, 'annonce', () => new T.MeshStandardMaterial({ map: tx, roughness: .6, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: .25 }));
      for (let r = 0; r < 3; r++) for (let i = 0; i < Math.floor(ww / .4); i++) c.extra.push([new T.PlaneGeometry(.28, .4).translate(cx - ww / 2 + .3 + i * .4, y0 + .7 + r * .5, zf - .25), m]);
      B(ww * .5, .75, .7, cx, y0 + .37, zb + .8, 0xf4f4f2);
      break; }
    case 'banque': B(ww * .7, 1.0, .6, cx, y0 + .5, zb + .8, 0xe9ecee); V(new T.PlaneGeometry(ww * .5, .8).translate(cx, y0 + 1.6, zb + .02), 0x1b3a8a, 0); break;
    case 'mannequins':   // mannequins en vitrine, podium
      B(ww * .8, .2, .7, cx, y0 + .1, zf - .5, 0xf4f1ea, 0);
      for (let i = 0; i < 2 + Math.floor(R() * 2); i++) { const x = cx - ww * .3 + i * ww * .3, col = pick(R, [0x111111, 0xe9e2d4, 0x8a3b32, 0x2f3a52, 0xb7a58a]); V(new T.CylinderGeometry(.16, .22, .9, 8).translate(x, y0 + .9, zf - .5), col); V(new T.CylinderGeometry(.13, .16, .5, 8).translate(x, y0 + 1.6, zf - .5), col); V(new T.SphereGeometry(.1, 8, 6).translate(x, y0 + 1.97, zf - .5), 0xd9cfc4, 0); V(new T.CylinderGeometry(.015, .015, .3, 4).translate(x, y0 + .35, zf - .5), 0x888888, 0); }
      fondEtag(0, 0xf2eee6, []);
      break;
    case 'attente': for (let i = 0; i < 3; i++) H.chaise(T, G, R, cx - ww * .3 + i * ww * .3, y0, zb + .5, 0x5a6a7a, Math.PI); break;
    default: fondEtag(3, 0xe9e4da, [0x8a6a48, 0x6d7f8a, 0xe9e2d4, 0x2f3a52, 0xb7a58a], .25); B(ww * .5, .9, .6, cx, y0 + .45, zf - 1.0, 0x6b4a2e);
  }
}
function cagette(c, x, y, z) {
  const { T, G, R, H } = c, col = pick(R, [0xd9263b, 0xf2a830, 0x5aa02c, 0xf2d230, 0x7a2a5a, 0xe8662a, 0x3f7a2a]);
  G.vc.push(H.vc(T, new T.BoxGeometry(.38, .14, .28).translate(x, y + .07, z), 0xc9a873, .1, R));
  for (let i = 0; i < 6; i++) G.vc.push(H.vc(T, new T.IcosahedronGeometry(.05, 0).translate(x - .13 + (i % 3) * .13, y + .16, z - .06 + Math.floor(i / 3) * .12), col, .1, R));
}

// ------------------------------------------------------------------ extérieurs
function store(c, t, col, enc, nom) {   // store banne en toile rayée ou unie, lambrequin avec le nom
  const { T, extra, R, cx, y0, wh, gx0, gx1 } = c, w = gx1 - gx0 - .1, xm = (gx0 + gx1) / 2, L = Math.min(2.4, c.trottoir * .7), a = .35;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64; const g = cv.getContext('2d');
  const raye = R() < .55; for (let i = 0; i < 32; i++) { g.fillStyle = raye && i % 2 ? '#efe7d6' : col; g.fillRect(i * 16, 0, 16, 64); }
  const tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace;
  const toile = new T.PlaneGeometry(w, L); toile.rotateX(-Math.PI / 2 + a); toile.translate(xm, y0 + wh + .05 - Math.sin(a) * L / 2, Math.cos(a) * L / 2 + .1);
  extra.push([toile, new T.MeshStandardMaterial({ map: tx, roughness: .95, side: T.DoubleSide })]);
  const lt = texte(T, nom, 1024, 64, col, enc, t.font || 'Arial', { taille: .62 });
  extra.push([new T.PlaneGeometry(w, .3).translate(xm, y0 + wh + .05 - Math.sin(a) * L - .15, Math.cos(a) * L + .1), new T.MeshStandardMaterial({ map: lt, roughness: .9, side: T.DoubleSide })]);
  extra.push([c.H.box(T, w + .1, .12, .12, xm, y0 + wh + .1, .08), c.M.paint(0x6c6f70, .5, .4)]);   // coffre
}
function drapeau(c, kind) {   // enseigne perpendiculaire : croix verte de pharmacie, carotte du tabac
  const { T, extra, cx, y0, wh, ww } = c, x = cx + ww / 2 + .1, y = y0 + wh + .55, z = .55;
  extra.push([c.H.box(T, .06, .06, .5, x, y + .55, .25), c.M.fonte]);
  if (kind === 'croix') { const m = emis(T, 0x18c048, 1.8); extra.push([c.H.box(T, .1, .7, .24, x, y, z), m], [c.H.box(T, .1, .24, .7, x, y, z), m], [c.H.box(T, .08, .78, .32, x, y, z), c.M.paint(0x1a1a1a, .4)]); }
  else { extra.push([new T.OctahedronGeometry(.32, 0).scale(.25, 1.4, 1).translate(x, y - .05, z), emis(T, 0xd0202a, .9)]); }
}
// tressage façon chaise de bistrot parisienne (rotin + Rilsan coloré)
const TRESSES = [['#f2efe6', '#1d3a6a'], ['#f2efe6', '#a0262c'], ['#e9dcc0', '#2b2b2b'], ['#f2efe6', '#2f6b4f'], ['#d9c49a', '#7a4a2a'], ['#f2efe6', '#e2a23a']];
function tresse(T, k) {
  return mat(T, 'tresse' + k, () => {
    const [a, b] = TRESSES[k], cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * 8, y * 8, 8, 8); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x * 8, y * 8 + 7, 8, 1); g.fillRect(x * 8 + 7, y * 8, 1, 8); }
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 3);
    return new T.MeshStandardMaterial({ map: t, roughness: .7, side: T.DoubleSide });
  });
}
function chaiseBistrot(c, x, z, rot, k) {
  const { T, extra } = c, m = new T.Matrix4().makeRotationY(rot).setPosition(x, 0, z);
  const cadre = c.M.paint(0xa77b45, .55), tr = tresse(T, k), P = (g, mm) => extra.push([g.applyMatrix4(m), mm]);
  for (const [a, b] of [[-.19, .17], [.19, .17], [-.17, -.17], [.17, -.17]]) P(new T.CylinderGeometry(.012, .012, .47, 5).translate(a, .235, b), cadre);
  P(new T.BoxGeometry(.42, .03, .4).translate(0, .47, 0), tr);
  P(new T.TorusGeometry(.21, .014, 4, 14, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI).translate(0, .47, 0), cadre);
  P(new T.CylinderGeometry(.22, .22, .3, 12, 1, true, Math.PI / 2 + .55, Math.PI - 1.1).translate(0, .66, .02), tr);
  P(new T.TorusGeometry(.22, .016, 4, 12, Math.PI - 1.1).rotateX(Math.PI / 2).rotateY(2.59).translate(0, .81, .02), cadre);
  for (const sx of [-1, 1]) P(new T.CylinderGeometry(.012, .012, .36, 5).translate(sx * .18, .64, -.1), cadre);
}
function tableBistrot(c, x, z, rond) {
  const { T, extra, M } = c, plateau = c.M.paint(rond ? 0xe9e6df : 0x9aa0a4, .22, rond ? .05 : .7);
  extra.push([rond ? new T.CylinderGeometry(.3, .3, .025, 18).translate(x, .74, z) : new T.BoxGeometry(.6, .025, .6).translate(x, .74, z), plateau]);
  extra.push([new T.CylinderGeometry(.03, .04, .72, 6).translate(x, .37, z), M.fonte]);
  for (let i = 0; i < 3; i++) extra.push([new T.BoxGeometry(.04, .03, .28).translate(0, .02, .12).rotateY(i * 2.09).translate(x, 0, z), M.fonte]);
}
// terrasse parisienne : chaises côte à côte tournées vers la rue, petites tables rondes, parfois terrasse fermée vitrée
function terrasse(c, sr) {
  const { T, G, R, H, gx0, gx1, extra, M } = c;
  if (!c.first) return;
  const libre = 1.8, d = Math.min(3.2, c.trottoir - libre); if (d < .8) return;
  const k = Math.floor(sr() * TRESSES.length), rangs = d > 2.2 ? 2 : 1, rond = sr() < .8, fermee = d > 1.6 && sr() < .3;
  for (let r = 0; r < rangs; r++) {
    const zc = .55 + r * 1.15;
    for (let x = gx0 + .55; x < gx1 - .5; x += 1.15) {
      if (R() < .08) continue;
      tableBistrot(c, x, zc + .45, rond);
      for (const dx of [-.24, .24]) if (R() < .93) chaiseBistrot(c, x + dx + (R() - .5) * .05, zc, (R() - .5) * .25, k);   // côte à côte, face à la rue
      if (R() < .35) { G.vc.push(H.vc(T, new T.CylinderGeometry(.03, .025, .11, 8).translate(x + .1, .81, zc + .4), 0xf2f0e6)); G.vc.push(H.vc(T, new T.CylinderGeometry(.035, .03, .07, 8).translate(x - .1, .79, zc + .5), 0xdde8ea)); }   // tasse, verre
    }
  }
  if (fermee) {   // terrasse fermée : soubassement bois, vitrage, montants
    const z1 = .3 + d, cad = c.M.paint(0x3a2a1c, .4);
    extra.push([H.box(T, gx1 - gx0, .55, .06, (gx0 + gx1) / 2, .27, z1), cad]);
    for (let x = gx0; x <= gx1 + .01; x += (gx1 - gx0) / Math.max(1, Math.round((gx1 - gx0) / 1.3))) extra.push([H.box(T, .06, 2.3, .06, x, 1.15, z1), cad]);
    G.vit.push(H.box(T, gx1 - gx0, 1.6, .01, (gx0 + gx1) / 2, 1.35, z1));
    for (const x of [gx0, gx1]) { extra.push([H.box(T, .06, .55, d, x, .27, .3 + d / 2), cad]); G.vit.push(H.box(T, .01, 1.6, d, x, 1.35, .3 + d / 2)); }
    extra.push([H.box(T, gx1 - gx0 + .1, .08, d + .2, (gx0 + gx1) / 2, 2.32, .3 + d / 2), cad]);
  } else if (sr() < .5) for (const x of [gx0 + .1, gx1 - .1]) {   // bacs à fleurs sur roulettes en bout de terrasse
    G.vc.push(H.vc(T, new T.BoxGeometry(.4, .45, .9).translate(x, .23, .3 + d / 2), 0x2b2b2b));
    H.plante(T, G, R, x, .45, .3 + d / 2, .3, sr() < .5);
  }
}
function dehors(c, kind, cx, ww) {
  const { T, G, R, H, y0 } = c, z = .55;
  if (kind === 'etal') {   // étal incliné de fruits et légumes
    G.vc.push(H.vc(T, new T.BoxGeometry(ww * .9, .75, .7).translate(cx, .37, z), 0x6b5a3a, .1, R));
    for (let i = 0; i < Math.floor(ww * .9 / .4); i++) for (let j = 0; j < 2; j++) cagette(c, cx - ww * .45 + .2 + i * .4, .75 + j * .12, z - .15 + j * .3);
  } else if (kind === 'fleurs') {   // seaux de fleurs coupées, plantes en pot sur gradins
    G.vc.push(H.vc(T, new T.BoxGeometry(ww * .9, .3, .6).translate(cx, .15, z), 0x5a5a52), H.vc(T, new T.BoxGeometry(ww * .9, .3, .35).translate(cx, .45, z - .12), 0x5a5a52));
    for (let i = 0; i < Math.floor(ww / .28); i++) { const x = cx - ww * .42 + i * .28, y = i % 2 ? .6 : .3; G.vc.push(H.vc(T, new T.CylinderGeometry(.11, .09, .25, 8).translate(x, y + .12, z - (i % 2) * .12), 0x8a8f94)); H.plante(T, G, R, x, y + .25, z - (i % 2) * .12, .14, true); }
  } else if (kind === 'banc') {   // banc de glace de poissonnerie
    G.vc.push(H.vc(T, new T.BoxGeometry(ww * .9, .8, .8).translate(cx, .4, z), 0xe9eef2), H.vc(T, new T.BoxGeometry(ww * .88, .05, .78).rotateX(-.2).translate(cx, .85, z), 0xf4f8fa));
    for (let i = 0; i < 10; i++) G.vc.push(H.vc(T, new T.SphereGeometry(.05, 6, 4).scale(3, .6, 1).translate(cx - ww * .4 + i * ww * .08, .9, z + (R() - .5) * .4), pick(R, [0x8a9aa8, 0xc0c8cc, 0xe08a6a, 0x4a5a6a])));
  } else if (kind === 'bac') {   // bac de livres soldés
    G.vc.push(H.vc(T, new T.BoxGeometry(1.0, .7, .5).translate(cx, .35, z), 0x5a3a24)); for (let i = 0; i < 12; i++) G.vc.push(H.vc(T, new T.BoxGeometry(.03 + R() * .03, .22, .16).translate(cx - .45 + i * .08, .8, z), pick(R, [0x6d7f8a, 0x8a3b32, 0x3f5a46, 0xb7a58a, 0xe9e2d4])));
  }
}
function ardoise(c, x) {   // chevalet ardoise avec menu à la craie
  const { T, extra } = c;
  const m = mat(T, 'ardoise', () => { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 192; const g = cv.getContext('2d'); g.fillStyle = '#1e2422'; g.fillRect(0, 0, 128, 192); g.strokeStyle = '#6b4a2e'; g.lineWidth = 10; g.strokeRect(0, 0, 128, 192); g.fillStyle = '#eae6da'; g.font = 'italic 18px "Comic Sans MS", cursive'; g.textAlign = 'center'; ['Menu du jour', '—', 'Entrée + Plat', '18 €', 'Plat du jour', '14,50 €', 'Café gourmand'].forEach((l, i) => g.fillText(l, 64, 30 + i * 23)); const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return new T.MeshStandardMaterial({ map: t, roughness: .9, side: T.DoubleSide }); });
  for (const s of [-1, 1]) extra.push([new T.PlaneGeometry(.55, .85).rotateX(s * .22).rotateY(Math.PI / 2 * 0).translate(x, .45, .9 + s * .09), m]);
}
