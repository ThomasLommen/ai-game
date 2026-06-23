// ── Game.battle: launch a full intrusion-defense ENGAGEMENT over the campaign ──
// The battle itself lives in the swarm proof (proto/swarm), embedded in an iframe so
// there is ONE source of truth for the combat. The campaign FREEZES while it runs
// (Game.paused checks battle.active()) until the player resolves it and returns. The
// outcome rides back via postMessage. The campaign decides what a win/loss MEANS
// (rewards / consequences) in the onResolve callback — this module is just the
// launch/teardown plumbing + the bridge between the two frames.
(function () {
  if (typeof window === 'undefined') return;
  const SRC = 'proto/swarm/index.html';
  let activeFlag = false, onResolveCb = null, lastResult = null, listening = false;

  const overlayEl = () => document.getElementById('battle-overlay');
  const frameEl = () => document.getElementById('battle-frame');
  const emit = (name, data) => { try { window.Game && Game.events && Game.events.emit(name, data); } catch (e) {} };

  function onMsg(ev) {
    const d = ev && ev.data;
    if (!d || d.source !== 'swarm-battle') return;
    if (d.kind === 'result') {                     // fired the instant the battle resolves (before the player dismisses)
      lastResult = d; emit('battle.resolved', d);
    } else if (d.kind === 'return') {              // the player clicked RETURN on the end screen
      resolve(lastResult || d);
    }
  }

  // launch(opts, onResolve): opts = { seed, compute, lane }. onResolve(result) runs on return.
  function launch(opts, onResolve) {
    opts = opts || {};
    if (activeFlag) return false;                  // one battle at a time
    const ov = overlayEl(), fr = frameEl();
    if (!ov || !fr) { console.warn('[battle] overlay element missing'); if (onResolve) onResolve({ result: 'abort' }); return false; }
    activeFlag = true; onResolveCb = onResolve || null; lastResult = null;
    const q = new URLSearchParams({ embed: '1' });
    if (opts.seed != null) q.set('seed', (opts.seed | 0));
    if (opts.compute != null) q.set('compute', opts.compute);
    if (opts.lane != null) q.set('lane', opts.lane ? '1' : '0');
    if (opts.surges != null) q.set('surges', opts.surges);     // a TRAP's bait reshapes the climax
    if (opts.boss != null) q.set('boss', opts.boss);
    if (opts.escort != null) q.set('escort', opts.escort);
    if (opts.regen != null) q.set('regen', opts.regen);
    if (!listening) { window.addEventListener('message', onMsg); listening = true; }
    fr.src = SRC + '?' + q.toString();
    ov.hidden = false;
    requestAnimationFrame(() => ov.classList.add('up'));   // fade in
    lockLandscape();                                       // the board is landscape; turn the phone (installed PWA)
    emit('battle.launched', opts);
    return true;
  }

  // The combat board is landscape-shaped; in the phone shell, request landscape for the
  // duration (works in the installed PWA's standalone mode; a no-op in a plain tab).
  function lockLandscape() {
    if (!(Game.mobileShell && Game.mobileShell.active())) return;
    try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) {}
  }
  function unlockOrientation() { try { const o = screen.orientation; if (o && o.unlock) o.unlock(); } catch (e) {} }

  function resolve(result) {
    if (!activeFlag) return;
    activeFlag = false;
    unlockOrientation();
    const ov = overlayEl(), fr = frameEl(), cb = onResolveCb; onResolveCb = null;
    if (ov) { ov.classList.remove('up'); setTimeout(() => { ov.hidden = true; if (fr) fr.src = 'about:blank'; }, 450); }
    emit('battle.ended', result);
    if (cb) { try { cb(result); } catch (e) { console.error('[battle] onResolve threw', e); } }
  }

  window.Game = window.Game || {};
  Game.battle = { launch, active: () => activeFlag, resolve };

  // ── debug trigger (temporary, until TRAP missions drive battles): Ctrl+Shift+B ──
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      if (!activeFlag) launch({ seed: (Math.random() * 1e9) | 0, lane: true }, r => emit('battle.debug.done', r));
    }
  });
})();
