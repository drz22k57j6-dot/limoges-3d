import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchInventoryTrees, fetchInventoryGreenery } from './solarAnalysis.js';

test('inventory Paris : lit les arbres du secteur local et conserve les coordonnées jeu', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    return { ok: true, json: async () => ({ a: [
      [3000.8, -640.0, 1, 12, 8.4, 0.43, 1, 233151],
      [3300, -640, 13, 10, 5, 0.3, 1, 999]
    ] }) };
  };
  try {
    const rows = await fetchInventoryTrees(2.3, 48.8, { ll: () => [3000.8, -640] }, 150);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].x, 3000.8);
    assert.equal(rows[0].z, -640);
    assert.equal(rows[0].h, 12);
    assert.equal(rows[0].caduc, true);
    assert.equal(calls.length, 9);
    assert.ok(calls.every(url => url.includes('/data/paris/vegetation/')));
  } finally { globalThis.fetch = previous; }
});

test('inventaire Paris : identifie les conifères persistants', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ a: [
    [3000, -640, 13, 10, 5, 0.3, 1, 1],
    [3001, -640, 14, 8, 4, 0.2, 1, 2]
  ] }) });
  try {
    const rows = await fetchInventoryTrees(2.3, 48.8, { ll: () => [3000, -640] }, 150);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(t => t.caduc === false));
  } finally { globalThis.fetch = previous; }
});

test('inventaire Paris : récupère haies et massifs des secteurs voisins', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    a: [], h: [[[[3000,-640],[3010,-640]], 1.2, 1.5]], m: [[[[2990,-630],[3000,-630],[3000,-640]], 2]]
  }) });
  try {
    const result = await fetchInventoryGreenery(2.3, 48.8, { ll: () => [3000, -640] }, 180);
    assert.equal(result.hedges.length, 9);
    assert.equal(result.massifs.length, 9);
  } finally { globalThis.fetch = previous; }
});
