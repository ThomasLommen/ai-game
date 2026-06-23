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

  function autoscroll() { const o = out(); if (o) o.scrollTop = o.scrollHeight; }

  // Decode a line LEFT-TO-RIGHT: resolved text grows from the left, characters scramble at
  // the leading edge, nothing ahead shown yet. For the LETTER (`heavy`) it reads like
  // someone WRITING IT LIVE — a deliberate per-char pace plus a HESITATION before each
  // word — so the words land with weight. Machine boot logs decode fast (not heavy).
  //   *_CHAR  — ms the leading edge spends per character (appearance pace)
  //   WORD_PAUSE — extra beat before each new word (the writer pausing)
  //   SCRAMBLE_MS — how long each char scrambles before it locks
  const HEAVY_MS_PER_CHAR = 42, LIGHT_MS_PER_CHAR = 15;
  const WORD_PAUSE = 150;
  const SCRAMBLE_MS = 520;
  function decryptInto(span, text, heavy) {
    return new Promise(resolve => {
      if (!text) { span.textContent = ''; return resolve(); }
      const per = heavy ? HEAVY_MS_PER_CHAR : LIGHT_MS_PER_CHAR;
      const wordPause = heavy ? WORD_PAUSE : 0;
      // precompute each char's appear time, with a hesitation entering every new word
      const appearAt = new Array(text.length);
      let t = 0, inWord = false;
      for (let j = 0; j < text.length; j++) {
        const space = text[j] === ' ';
        if (!space && !inWord) { t += wordPause; inWord = true; }
        if (space) inWord = false;
        appearAt[j] = t;
        t += space ? per * 0.4 : per;
      }
      const finishAt = appearAt[text.length - 1] + SCRAMBLE_MS;
      const start = performance.now();
      (function frame() {
        if (skipFlag) { span.textContent = text; return resolve(); }
        const tt = performance.now() - start;
        let o = '';
        for (let j = 0; j < text.length; j++) {
          if (tt < appearAt[j]) break;                                     // not reached yet
          if (tt >= appearAt[j] + SCRAMBLE_MS) o += text[j];               // locked
          else o += (text[j] === ' ') ? ' ' : randChar();                 // still scrambling
        }
        span.textContent = o; autoscroll();
        if (tt < finishAt) requestAnimationFrame(frame);
        else { span.textContent = text; resolve(); }
      })();
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
      if (step.kind === 'pause') { await sleep(Math.min(step.ms || 0, 2400)); }
      else if (step.kind === 'line') { await decryptInto(line(step.cls), step.text || '', false); }
      else if (step.kind === 'typed') {
        await decryptInto(line(step.cls || 'letter'), step.text || '', true);   // the letter writes heavy
        if (!skipFlag) await sleep(Math.max(850, (step.text || '').length * 30));   // let the sentence land before the next
      }
    }
    if (!skipFlag) await sleep(1200);
    ov.classList.remove('up');
    await sleep(620);
    ov.hidden = true;
  }

  Game.intro = { play, active: () => { const ov = overlay(); return !!(ov && !ov.hidden); } };
})();
