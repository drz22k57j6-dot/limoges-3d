// Étape 10 — export GLB (glTF 2.0 binaire), lisible par GLTFLoader de Three.js et donc par Limoges 3D.
// La provenance complète est embarquée dans les « extras » du nœud racine.
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export async function exportGLB(root, { environment = false, interior = false } = {}) {
  const saved = [];
  root.traverse(o => {
    if (o.name === 'Environnement_mesure') { saved.push([o, o.visible]); o.visible = environment; }
    if (o.name.startsWith('INTERIEUR_GENERE')) { saved.push([o, o.visible]); o.visible = interior; }
  });
  root.userData.studio.export = { environnement: environment, interieur_genere: interior };
  try {
    const glb = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
    return glb;
  } finally { for (const [o, v] of saved) o.visible = v; }
}
export function download(buf, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// Publication dans le dépôt GitHub (API REST, jeton fourni par l'utilisateur, jamais stocké sans son accord)
export async function publishToGitHub({ token, repo, branch = 'main', glb, entry }) {
  const api = `https://api.github.com/repos/${repo}/contents/`, H = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const get = async path => { const r = await fetch(api + path + '?ref=' + branch, { headers: H }); return r.ok ? r.json() : null; };
  const put = async (path, content, message) => {
    const old = await get(path);
    const r = await fetch(api + path, { method: 'PUT', headers: H, body: JSON.stringify({ message, content, branch, ...(old ? { sha: old.sha } : {}) }) });
    if (!r.ok) throw new Error('GitHub ' + r.status + ' : ' + (await r.text()).slice(0, 200));
  };
  const file = `data/studio/${entry.id}.glb`;
  await put(file, b64(glb), `Studio : modèle ${entry.id}`);
  const man = await get('data/studio/manifest.json');
  const list = man ? JSON.parse(decodeURIComponent(escape(atob(man.content.replace(/\n/g, ''))))) : { batiments: [] };
  list.batiments = list.batiments.filter(b => b.id !== entry.id).concat([{ ...entry, fichier: entry.id + '.glb' }]);
  await put('data/studio/manifest.json', btoa(unescape(encodeURIComponent(JSON.stringify(list, null, 1)))), `Studio : manifeste (${entry.id})`);
  return file;
}
