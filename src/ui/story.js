// ── Game.story — the narrative BEAT sheet (HOME dashboard rework, slice 4) ───
// Big beats (cls 'cyan', routed here by Game.feed) no longer scroll past in a log —
// they take over the screen as a paused MOMENT you acknowledge with [continue]. The
// game freezes while one is up (Game.paused checks story.active()). Beats queue, so a
// scripted sequence is tapped through one line at a time, visual-novel style. NOT
// archived — you can't miss one because it pauses. ([[home-dashboard-rework]])
(function () {
  window.Game = window.Game || {};
  const queue = [];
  let showing = false, current = null, storyArmedAt = 0;   // [continue] is inert for 2s (anti-misclick)
  let NOARM = false; try { NOARM = /[?&]noarm=1/.test(location.search); } catch (e) {}   // test bypass

  const overlay = () => document.getElementById('story-overlay');
  const bodyEl = () => document.getElementById('story-body');

  // present(content): content is a string or an array of lines (one beat = one sheet).
  function present(content) {
    const lines = Array.isArray(content) ? content : [content];
    const clean = lines.map(l => String(l).replace(/^>\s*/, '').trim()).filter(Boolean);
    if (!clean.length) return;
    queue.push(clean);
    if (!showing) next();
  }

  function next() {
    const ov = overlay(), bd = bodyEl();
    if (!ov || !bd) { queue.length = 0; showing = false; return; }
    const beat = queue.shift();
    if (!beat) { hide(); return; }
    current = beat; showing = true;
    bd.innerHTML = beat.map(l => `<div class="story-line">${escapeHtml(l)}</div>`).join('');
    storyArmedAt = NOARM ? 0 : Date.now() + 2000;
    if (!NOARM) { ov.classList.add('arming'); void ov.offsetWidth; setTimeout(() => { if (Date.now() >= storyArmedAt - 30) ov.classList.remove('arming'); }, 2000); }
    ov.hidden = false;
    requestAnimationFrame(() => ov.classList.add('up'));
  }

  function advance() {
    if (queue.length) next();
    else hide();
  }

  function hide() {
    const ov = overlay();
    showing = false; current = null;
    if (ov) { ov.classList.remove('up'); setTimeout(() => { ov.hidden = true; }, 350); }
  }

  // the text being shown + everything still queued (for tests / debugging)
  function debugText() { return [current || [], ...queue].map(b => b.join(' ')).join(' — '); }

  function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function wire() {
    const btn = document.getElementById('story-continue');
    if (btn && !btn._wired) { btn._wired = true; btn.onclick = () => { if (Date.now() < storyArmedAt) return; advance(); }; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  Game.story = { present, advance, active: () => showing, debugText, _queueLen: () => queue.length };
})();
