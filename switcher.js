// Sélecteur de mode flottant, partagé par toutes les pages (Limoges 3D, carte, générateur).
(() => {
  const base = new URL('.', document.currentScript.src).href; // racine du site
  const MODES = [
    { id: '3d', ic: '🚗', name: 'Limoges 3D', href: base },
    { id: 'apied', ic: '🚶', name: 'À pied (Saltline)', href: base + 'apied/' },
    { id: 'metro', ic: '🚇', name: 'Métro de Paris', href: base + 'metro/' },
    { id: 'carte', ic: '🗺️', name: 'Carte des bâtiments', href: base + 'carte/' },
    { id: 'studio', ic: '🏗️', name: 'Générateur', href: base + 'studio/' },
  ];
  const path = location.pathname;
  const cur = path.includes('/metro/') ? 'metro' : path.includes('/apied/') ? 'apied' : path.includes('/carte/') ? 'carte' : path.includes('/studio/') ? 'studio' : '3d';
  const css = document.createElement('style');
  css.textContent = `#mswitch{position:fixed;left:calc(10px + env(safe-area-inset-left));top:50%;transform:translateY(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#mswitch button{width:52px;height:52px;border-radius:50%;border:2px solid #ffffff55;background:rgba(15,20,28,.82);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-shadow:0 4px 14px #0007;position:relative}
#mswitch button.cur{border-color:#ffd60a}
#mswitch .opt{display:none}#mswitch.open .opt{display:flex}
#mswitch .opt span{position:absolute;left:60px;white-space:nowrap;background:rgba(15,20,28,.9);color:#fff;font-size:13px;padding:4px 9px;border-radius:8px;pointer-events:none}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'mswitch';
  const main = document.createElement('button'); const me = MODES.find(m => m.id === cur);
  main.textContent = me.ic; main.className = 'cur'; main.title = 'Changer de mode'; main.setAttribute('aria-label', 'Changer de mode (actuel : ' + me.name + ')');
  box.appendChild(main);
  for (const m of MODES) {
    if (m.id === cur) continue;
    const b = document.createElement('button'); b.className = 'opt'; b.innerHTML = m.ic + '<span>' + m.name + '</span>'; b.setAttribute('aria-label', m.name);
    b.onclick = e => { e.stopPropagation(); location.href = m.href; };
    box.appendChild(b);
  }
  main.onclick = e => { e.stopPropagation(); box.classList.toggle('open'); };
  for (const ev of ['pointerdown', 'touchstart', 'mousedown']) box.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  document.addEventListener('click', () => box.classList.remove('open'));
  const add = () => document.body.appendChild(box);
  document.body ? add() : addEventListener('DOMContentLoaded', add);
})();
