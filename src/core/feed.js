// ── Game.feed — notification router (HOME dashboard rework, slice 3) ─────────
// The old model dumped ~140 sources into one scrolling terminal LOG. This routes
// each terminal.print into the right surface:
//   faint  → AMBIENT  → the HOME voice line (Game.voice)
//   cyan   → BIG BEAT → a full-screen story SHEET (Game.story)
//   else   → dropped  (err/dim/'' chatter)
// The transient bottom TOASTS were removed 2026-06-27 — players never read them, and
// every category they covered already has a better home: warnings show the '! LOCKED
// OUT' banner in VITALS + land in RECENT, big beats are sheets, ambient is the voice
// line. Curated, persistent notifications live in RECENT, fed by explicit
// Game.activity.log calls. ([[home-dashboard-rework]] · [[remove-feed-toasts]])
(function () {
  window.Game = window.Game || {};

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
    const booted = !!(Game.save && Game.save.state && Game.save.state.bootSequenceComplete);
    if (lane === 'ambient') { if (Game.voice) Game.voice.say(text); return; }
    if (!booted) return;
    if (lane === 'beat' && Game.story) {   // big narrative beats take over the screen (paused)
      Game.story.present((payload.lines || []).map(clean).filter(Boolean));
      return;
    }
    // warning / happening: no transient popup anymore — the curated RECENT log
    // (Game.activity.log) is the home for anything worth keeping.
  }

  Game.feed = { route, classify };
})();
