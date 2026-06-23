// ── Game.feed — notification router (HOME dashboard rework, slice 3) ─────────
// The old model dumped ~140 sources into one scrolling terminal LOG. This routes
// each terminal.print into the right surface instead:
//   faint  → AMBIENT  → the HOME voice line (Game.voice)
//   err    → WARNING  → a transient toast (red)
//   cyan   → BIG BEAT → a transient toast (cyan)   [slice 4 upgrades these to sheets]
//   else   → HAPPENING→ a transient toast (amber)
// The persistent RECENT feed stays fed by explicit Game.activity.log calls (curated),
// so nothing double-logs. ([[home-dashboard-rework]])
(function () {
  window.Game = window.Game || {};
  const MAX_TOASTS = 3, TOAST_MS = 3400;

  function classify(cls) {
    if (cls === 'faint') return 'ambient';
    if (cls === 'err') return 'warning';
    if (cls === 'cyan') return 'beat';
    return 'happening';   // dim / milestone / ''
  }
  const clean = line => String(line || '').replace(/^>\s*/, '').trim();

  function route(payload) {
    if (!payload) return;
    const text = (payload.lines || []).map(clean).filter(Boolean).join(' ').trim();
    if (!text) return;   // blank spacer lines were log rhythm; lanes don't need them
    const lane = payload.lane || classify(payload.cls);
    // stay quiet during the boot cutscene (its lines play in the intro, not as toasts)
    const booted = !!(Game.save && Game.save.state && Game.save.state.bootSequenceComplete);
    if (lane === 'ambient') { if (Game.voice) Game.voice.say(text); return; }
    if (!booted) return;
    toast(text, lane);
  }

  // ── transient toasts ──
  function container() {
    let c = document.getElementById('feed-toasts');
    if (!c) { c = document.createElement('div'); c.id = 'feed-toasts'; (document.getElementById('crt') || document.body).appendChild(c); }
    return c;
  }
  function toast(text, lane) {
    const c = container();
    while (c.children.length >= MAX_TOASTS) c.removeChild(c.firstChild);
    const t = document.createElement('div');
    t.className = 'feed-toast ' + lane;
    t.textContent = text;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 350); }, TOAST_MS);
  }

  Game.feed = { route, classify, toast };
})();
