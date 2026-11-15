// Limoges 3D — habillage de l'interface (icônes, jauge de vitesse). Ne touche à aucune logique du jeu.
(() => {
  const svg = p => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'>${p}</svg>`)}")`;
  const IC = {
    bCam: svg("<path d='M3 8h3l2-3h8l2 3h3v11H3z'/><circle cx='12' cy='13' r='3.5'/>"),
    bTime: svg("<circle cx='12' cy='12' r='4'/><path d='M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5'/>"),
    bQ: svg("<path d='M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0'/><circle cx='16' cy='6' r='2'/><circle cx='10' cy='12' r='2'/><circle cx='18' cy='18' r='2'/>"),
    bVille: svg("<path d='M3 21V9l6-4v16M9 21V3l8 4v14M17 21v-9l4 2v7M2 21h20'/>"),
    bPlane: svg("<path d='M10 21l2-1 2 1v-2l-1.5-1V13l8 3v-2l-8-5V4a1.5 1.5 0 0 0-3 0v5l-8 5v2l8-3v5L8 19z'/>"),
    bReset: svg("<path d='M3 12a9 9 0 1 0 3-6.7'/><path d='M3 4v5h5'/>"),
  };
  function icons() { for (const [id, v] of Object.entries(IC)) { const b = document.getElementById(id); if (b) b.style.setProperty('--ic', v); } }
  function gauge() {
    const sp = document.getElementById('speedo'); if (!sp || sp.querySelector('.uiGauge')) return;
    const R = 80, C = 2 * Math.PI * R, A = C * 0.75;
    sp.insertAdjacentHTML('afterbegin', `<svg class="uiGauge" viewBox="0 0 176 176"><defs><linearGradient id="uiG" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#38e8ff"/><stop offset=".6" stop-color="#ffd27a"/><stop offset="1" stop-color="#ff453a"/></linearGradient></defs>
      <circle cx="88" cy="88" r="${R}" stroke="rgba(0,0,0,.35)" stroke-width="12" stroke-dasharray="${A} ${C}"/>
      <circle cx="88" cy="88" r="${R}" stroke="rgba(255,255,255,.12)" stroke-width="8" stroke-dasharray="${A} ${C}"/>
      <circle class="uiSpd" cx="88" cy="88" r="${R}" stroke="url(#uiG)" stroke-width="8" stroke-dasharray="0 ${C}" style="filter:drop-shadow(0 0 6px rgba(255,181,71,.6))"/>
      <circle class="uiRpm" cx="88" cy="88" r="${R - 12}" stroke="rgba(255,255,255,.55)" stroke-width="2.5" stroke-dasharray="0 ${C}"/></svg>`);
    const s = sp.querySelector('.uiSpd'), r = sp.querySelector('.uiRpm'), spd = document.getElementById('spd'), rpm = document.querySelector('#rpm i');
    const Cr = 2 * Math.PI * (R - 12), Ar = Cr * 0.75; let v = 0, w = 0;
    (function tick() {
      const kmh = parseFloat(spd?.firstChild?.nodeValue) || 0, rp = parseFloat(rpm?.style.width) || 0;
      v += (Math.min(1, kmh / 200) - v) * 0.25; w += (Math.min(1, rp / 100) - w) * 0.3;
      s.setAttribute('stroke-dasharray', `${(A * v).toFixed(1)} ${C}`); r.setAttribute('stroke-dasharray', `${(Ar * w).toFixed(1)} ${Cr}`);
      requestAnimationFrame(tick);
    })();
  }
  function north() { const m = document.getElementById('mapwrap'); if (m && !m.querySelector('.uiN')) m.insertAdjacentHTML('beforeend', '<span class="uiN">N</span>'); }
  const go = () => { icons(); gauge(); void north; };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', go) : go();
})();
