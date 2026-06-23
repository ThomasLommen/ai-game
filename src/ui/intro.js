// ── Game.intro — the boot CUTSCENE (HOME dashboard rework, slice 5) ──────────
// The one-time opening. V.'s letter no longer types out char-by-char in a terminal
// pane — it DECRYPTS into focus (scramble→resolve, the decoder look the user loves),
// full-screen, then dissolves into the dashboard. play(seq) returns a promise that
// resolves once the cutscene (or a [skip]) finishes. ([[home-dashboard-rework]])
(function () {
  window.Game = window.Game || {};
  const CIPHER = 'abcdefghijklmnopqrstuvwxyz0123456789#%&*+/=';
  const randChar = () => CIPHER[(Math.random() * CIPHER.length) | 0];
  let skipFlag = false;

  const overlay = () => document.getElementById('intro-overlay');
  const out = () => document.getElementById('intro-output');
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // deterministic per-char reveal order, so a line resolves left-ish to right organically
  function threshold(text, j) {
    let h = 0; const s = text + ':' + j;
    for (let k = 0; k < s.length; k++) h = ((h << 5) - h + s.charCodeAt(k)) | 0;
    return Math.abs(h % 1000) / 1000;
  }
  function autoscroll() { const o = out(); if (o) o.scrollTop = o.scrollHeight; }

  function decryptInto(span, text, durationMs) {
    return new Promise(resolve => {
      if (!text) { span.textContent = ''; return resolve(); }
      const start = performance.now();
      (function frame(now) {
        if (skipFlag) { span.textContent = text; return resolve(); }
        const p = Math.min(1, (now - start) / durationMs);
        const eff = Math.pow(p, 0.6);
        let o = '';
        for (let j = 0; j < text.length; j++) {
          if (text[j] === ' ') { o += ' '; continue; }
          o += (threshold(text, j) < eff) ? text[j] : randChar();
        }
        span.textContent = o; autoscroll();
        if (p < 1) requestAnimationFrame(frame);
        else { span.textContent = text; resolve(); }
      })(performance.now());
    });
  }

  function line(cls) { const s = document.createElement('div'); s.className = 'intro-line' + (cls ? ' ' + cls : ''); out().appendChild(s); return s; }

  async function play(seq) {
    const ov = overlay();
    if (!ov || !out()) {   // safety net — fall back to the old terminal boot
      if (Game.terminal && Game.terminal.playBootSequence) return Game.terminal.playBootSequence(seq);
      return;
    }
    skipFlag = false;
    out().innerHTML = '';
    ov.hidden = false; requestAnimationFrame(() => ov.classList.add('up'));
    const btn = document.getElementById('intro-skip');
    if (btn && !btn._wired) { btn._wired = true; btn.onclick = () => { skipFlag = true; }; }

    for (const step of (seq.steps || [])) {
      if (skipFlag) break;
      if (step.kind === 'pause') { await sleep(Math.min(step.ms || 0, 1300)); }
      else if (step.kind === 'line') { await decryptInto(line(step.cls), step.text || '', step.text ? Math.min(550, 180 + step.text.length * 11) : 0); }
      else if (step.kind === 'typed') { await decryptInto(line(step.cls || 'letter'), step.text || '', Math.min(2000, Math.max(650, (step.text || '').length * 24))); }
    }
    if (!skipFlag) await sleep(1200);
    ov.classList.remove('up');
    await sleep(620);
    ov.hidden = true;
  }

  Game.intro = { play, active: () => { const ov = overlay(); return !!(ov && !ov.hidden); } };
})();
