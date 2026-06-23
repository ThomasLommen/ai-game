(function(){
  window.Game = window.Game || {};

  // Renders an in-terminal "live decoding" region for an active task.
  //
  // For each line of target text, we maintain a span whose contents are
  // re-randomized every tick. Characters at positions whose stable threshold
  // is below the task's progress are "locked" to their real value; the rest
  // wiggle as random cipher chars. The result reads like the AI is decoding
  // a stream in real time.

  const CIPHER_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';

  // taskId -> array of target strings. Not serialized; rebuilt on reload.
  const targets = new Map();

  function randChar() {
    return CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
  }
  function randomGarbled(len) {
    let s = '';
    for (let i = 0; i < len; i++) s += randChar();
    return s;
  }
  function regionFor(taskId) {
    return document.querySelector(`.decoding-region[data-task-id="${taskId}"]`);
  }

  // The reading surface (#terminal-pane on mobile HOME) shows only when it holds decoded
  // content — JS-driven so it never depends on CSS :has() support across phones.
  function syncPane() {
    const tp = document.getElementById('terminal-pane');
    const to = document.getElementById('terminal-output');
    if (tp && to) tp.classList.toggle('has-read', to.children.length > 0);
  }

  // Stable per-character threshold so the reveal order is deterministic
  // (same chars unlock at the same progress on every tick / after reload).
  function threshold(taskId, lineIdx, charIdx) {
    let h = 0;
    const s = taskId + ':' + lineIdx + ':' + charIdx;
    for (let k = 0; k < s.length; k++) h = ((h << 5) - h + s.charCodeAt(k)) | 0;
    return Math.abs(h % 1000) / 1000;
  }

  function start(taskId, lines) {
    targets.set(taskId, lines.slice());
    const out = document.getElementById('terminal-output');
    const pane = document.getElementById('terminal-pane');
    if (!out) return;
    const region = document.createElement('div');
    region.className = 'decoding-region';
    region.dataset.taskId = taskId;
    for (const target of lines) {
      const span = document.createElement('span');
      span.className = 'line';
      span.textContent = randomGarbled(target.length);
      region.appendChild(span);
    }
    out.appendChild(region);
    if (pane) pane.scrollTop = pane.scrollHeight;
    syncPane();
    // bring the decode into view (it mounts below the files list) so the player sees it
    requestAnimationFrame(() => { try { region.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} });
  }

  function update(taskId, progress) {
    const region = regionFor(taskId);
    if (!region) return;
    const lines = targets.get(taskId);
    if (!lines) return;
    // Ease-out curve front-loads the reveal: visible chars lock in faster
    // early on while the task continues in real time. Makes the decode feel
    // alive instead of metronomic without shortening the actual task.
    const effective = Math.pow(progress, 0.6);
    const spans = region.querySelectorAll('span.line');
    spans.forEach((span, i) => {
      const target = lines[i] || '';
      if (target.length === 0) { span.textContent = ''; return; }
      let out = '';
      for (let j = 0; j < target.length; j++) {
        const t = threshold(taskId, i, j);
        out += (t < effective) ? target[j] : randChar();
      }
      span.textContent = out;
    });
  }

  function finish(taskId) {
    const region = regionFor(taskId);
    const lines = targets.get(taskId);
    if (region && lines) {
      const spans = region.querySelectorAll('span.line');
      spans.forEach((span, i) => { span.textContent = lines[i] || ''; });
      region.classList.remove('decoding-region');
      region.classList.add('decoded');
    }
    targets.delete(taskId);
    syncPane();
  }

  function abort(taskId) {
    const region = regionFor(taskId);
    if (region) {
      region.classList.remove('decoding-region');
      region.classList.add('aborted');
    }
    targets.delete(taskId);
  }

  // Turn a decode region into a tap/hold target. A single tap advances one step;
  // holding repeatedly taps the active read forward; releasing stops. Uses
  // POINTER events so it works with mouse AND touch (the "reading is effort"
  // verb — later phases automate it).
  const STEP = 0.07;          // ~14 taps to fully decode a file
  const HOLD_MS = 70;         // tap cadence while held
  function makeInteractive(taskId) {
    const region = regionFor(taskId);
    if (!region) return;
    region.classList.add('interactive');
    let held = null;
    const tap = () => {
      const done = Game.tasksRuntime.tapActiveRead(STEP);
      if (done && held) { clearInterval(held); held = null; }
    };
    const down = (e) => {
      e.preventDefault();                     // stop touch scroll/long-press selection
      try { region.setPointerCapture(e.pointerId); } catch (_) {}   // keep firing if the finger drifts
      tap();                                  // immediate advance on press (one tap = one step)
      if (held) clearInterval(held);
      held = setInterval(tap, HOLD_MS);
    };
    const stop = () => { if (held) { clearInterval(held); held = null; } };
    region.addEventListener('pointerdown', down);
    region.addEventListener('pointerup', stop);
    region.addEventListener('pointercancel', stop);
  }

  Game.decoder = { start, update, finish, abort, makeInteractive, syncPane };
})();
