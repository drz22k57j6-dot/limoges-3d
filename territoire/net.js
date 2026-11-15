// Réseau du mode Territoire.
// - « en ligne » : Trystero (WebRTC pair-à-pair, signalisation par relais Nostr publics) — gratuit, sans serveur ni compte ;
// - « local »    : BroadcastChannel (plusieurs onglets du même navigateur) — pour tester.
// Interface commune : net.send(type, data), net.on(type, cb(data)), net.peers(), net.close().
export async function connect(mode, room) {
  const handlers = new Map(), on = (t, cb) => handlers.set(t, cb), fire = (t, d) => { const h = handlers.get(t); if (h) h(d); };
  if (mode === 'local') {
    const bc = new BroadcastChannel('territoire-' + room);
    bc.onmessage = e => fire(e.data.t, e.data.d);
    return { mode, on, send: (t, d) => bc.postMessage({ t, d }), peers: () => -1, close: () => bc.close() };
  }
  const { joinRoom } = await import('./vendor/trystero.mjs');
  const r = joinRoom({ appId: 'drz22k57j6-dot/limoges-3d/territoire', identity: 'none' }, room);
  const actions = new Map(); let n = 0;
  const act = t => { if (!actions.has(t)) { const a = r.makeAction(t.slice(0, 12)); a.onMessage(d => fire(t, d)); actions.set(t, a); } return actions.get(t); };
  for (const t of ['st', 'tr', 'tc', 'cap', 'kill', 'hello', 'snap']) act(t);
  try { r.onPeerJoin(() => { n++; fire('peer', n); }); r.onPeerLeave(() => { n = Math.max(0, n - 1); fire('peer', n); }); } catch (e) {}
  return { mode, on, send: (t, d) => { try { act(t).send(d); } catch (e) {} }, peers: () => n, close: () => { try { r.leave(); } catch (e) {} } };
}
