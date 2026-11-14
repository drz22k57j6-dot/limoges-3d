// Registre de provenance : chaque caractéristique du modèle dit d'où elle vient et avec quelle confiance.
export const KINDS = {
  mesuree: { label: 'Mesurée', color: '#3ecf8e', desc: 'valeur issue d\'une mesure (LiDAR, cadastre, relevé IGN)' },
  photographiee: { label: 'Photographiée', color: '#4ea8ff', desc: 'extraite de photos réelles (rue ou aériennes)' },
  deduite: { label: 'Déduite', color: '#ffb547', desc: 'calculée à partir d\'autres données, plausible mais non observée' },
  generee: { label: 'Générée', color: '#ff6b8b', desc: 'inventée pour compléter le modèle — ne reflète pas la réalité' },
};

export class Provenance {
  constructor() { this.items = []; this.sources = new Map(); }
  // key unique ; value lisible ; kind ∈ KINDS ; conf 0..1 ; source = clé de source ; note = explication
  set(key, label, value, kind, conf, source, note = '') {
    if (!KINDS[kind]) throw new Error('provenance inconnue ' + kind);
    const it = { key, label, value, kind, conf: Math.round(Math.max(0, Math.min(1, conf)) * 100) / 100, source, note };
    const i = this.items.findIndex(x => x.key === key);
    if (i >= 0) this.items[i] = it; else this.items.push(it);
    return it;
  }
  get(key) { return this.items.find(x => x.key === key); }
  source(id, name, licence, url = '') { this.sources.set(id, { id, name, licence, url }); }
  toJSON() { return { caracteristiques: this.items, sources: [...this.sources.values()] }; }
}

export function confLabel(c) { return c >= 0.8 ? 'élevée' : c >= 0.55 ? 'moyenne' : c >= 0.3 ? 'faible' : 'très faible'; }
