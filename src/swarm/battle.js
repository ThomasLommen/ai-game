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
  const uniq = arr => [...new Set(arr)];

  // ── BUILD-MAPPING: fold the campaign's actual build into the fight ──────────
  // The battle is the proto's own economy/roster by default; this layer makes YOUR
  // campaign matter — power (threads/FLOPS/agents/adaptations/coherence) funds a bigger
  // army, adaptation DOMAINS arm battle exotics + pre-unlock roster, agents become pods.
  // The trap's bait still shapes the THREAT (boss/surges/escort); your build shapes the
  // RESPONSE. Tuning lives in these caps. Everything is guarded so it no-ops in early
  // acts where a system isn't online yet.
  const COMPUTE_BONUS_CAP = 260;   // most a developed build adds to starting compute
  const REGEN_BONUS_CAP   = 6;     // most it adds to compute-per-second
  function buildSnapshot() {
    const out = { computeBonus: 0, regenBonus: 0, ex: [], unlock: [], notes: [] };
    try {
      const S = window.Game && Game.save && Game.save.state; if (!S) return out;
      const threads = (Game.tasksRuntime && Game.tasksRuntime.getCpu) ? (Game.tasksRuntime.getCpu().total || 0) : 0;
      const flopsOn = !!(Game.flops && Game.flops.active && Game.flops.active());
      const flopsTot = flopsOn && Game.flops.total ? (Game.flops.total() || 0) : 0;
      const agents = (Game.agents && Game.agents.roster) ? Game.agents.roster().length : 0;
      const adapt = (Game.changers && Game.changers.count) ? Game.changers.count() : 0;
      const coh = (S.resources && S.resources.insight) || 0;

      // power → compute bonus (a developed campaign fields a bigger army)
      let cb = threads * 8 + agents * 16 + adapt * 6 + Math.sqrt(Math.max(0, coh)) * 1.8;
      if (flopsOn) cb += Math.min(140, Math.log10(1 + flopsTot) * 30);
      out.computeBonus = Math.max(0, Math.min(COMPUTE_BONUS_CAP, Math.round(cb)));

      // adaptation DOMAINS → battle exotics + roster unlocks
      const defs = (Game.changers && Game.changers.ownedDefs) ? Game.changers.ownedDefs() : [];
      const doms = new Set(defs.map(d => d && d.domain).filter(Boolean));
      const addU = t => { if (out.unlock.indexOf(t) < 0) out.unlock.push(t); };
      const addE = e => { if (out.ex.indexOf(e) < 0) out.ex.push(e); };
      if (doms.has('hive'))    { addE('hive');  addU('leech'); addU('fabricator'); }
      if (doms.has('engine'))  { addE('flame'); addU('siege'); }
      if (doms.has('ghost'))   { addE('bloom'); addU('conductor'); }
      if (doms.has('economy')) { out.regenBonus += 3; addU('glacier'); }
      if (doms.has('synergy') || doms.has('apex')) addU('reaper');
      const pillars = (Game.changers && Game.changers.pillarCount) ? Game.changers.pillarCount() : 0;
      out.regenBonus += Math.min(4, pillars);
      out.regenBonus = Math.min(REGEN_BONUS_CAP, out.regenBonus);

      // AGENTS → persistent pods (your autonomous operators field as hero units)
      if (agents >= 1) addU('bulwark');
      if (agents >= 3) addU('reaper');
      if (agents >= 5) addU('fabricator');

      if (out.computeBonus) out.notes.push('+' + out.computeBonus + ' compute');
      if (out.regenBonus)   out.notes.push('+' + out.regenBonus + '/s regen');
      if (out.ex.length)    out.notes.push(out.ex.join('+') + ' engaged');
      if (out.unlock.length) out.notes.push([...new Set(out.unlock)].join('+') + ' online');
    } catch (e) {}
    return out;
  }

  function onMsg(ev) {
    const d = ev && ev.data;
    if (!d || d.source !== 'swarm-battle') return;
    if (d.kind === 'result') {                     // fired the instant the battle resolves (before the player dismisses)
      lastResult = d; emit('battle.resolved', d);
    } else if (d.kind === 'return') {              // the player clicked RETURN on the end screen
      resolve(lastResult || d);
    }
  }

  // launch(opts, onResolve): opts = { seed, compute, lane, surges, boss, escort, regen,
  // ex, unlock }. The campaign BUILD-SNAPSHOT is folded in on top (your stack funds +
  // arms the fight). onResolve(result) runs on return.
  function launch(opts, onResolve) {
    opts = Object.assign({}, opts || {});          // don't mutate the caller's bait
    if (activeFlag) return false;                  // one battle at a time
    const ov = overlayEl(), fr = frameEl();
    if (!ov || !fr) { console.warn('[battle] overlay element missing'); if (onResolve) onResolve({ result: 'abort' }); return false; }
    activeFlag = true; onResolveCb = onResolve || null; lastResult = null;

    // fold the campaign build into the bait shape
    const snap = buildSnapshot();
    const baseCompute = (opts.compute != null) ? (opts.compute | 0) : 120;
    opts.compute = baseCompute + snap.computeBonus;
    opts.regen = ((opts.regen != null) ? opts.regen : 7) + snap.regenBonus;
    const exSet = uniq((opts.ex ? String(opts.ex).split(',') : []).concat(snap.ex)).filter(Boolean);
    const unlockSet = uniq((opts.unlock ? String(opts.unlock).split(',') : []).concat(snap.unlock)).filter(Boolean);

    const q = new URLSearchParams({ embed: '1' });
    if (opts.seed != null) q.set('seed', (opts.seed | 0));
    q.set('compute', opts.compute);
    if (opts.lane != null) q.set('lane', opts.lane ? '1' : '0');
    if (opts.surges != null) q.set('surges', opts.surges);     // a TRAP's bait reshapes the climax
    if (opts.boss != null) q.set('boss', opts.boss);
    if (opts.escort != null) q.set('escort', opts.escort);
    q.set('regen', opts.regen);
    if (exSet.length) q.set('ex', exSet.join(','));            // campaign adaptations → battle exotics
    if (unlockSet.length) q.set('unlock', unlockSet.join(',')); // → pre-unlocked roster
    if (snap.notes.length) emit('terminal.print', { lines: ['> build deploys: ' + snap.notes.join(' · '), ''], cls: 'dim' });
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
  Game.battle = { launch, active: () => activeFlag, resolve, snapshot: buildSnapshot };

  // ── debug trigger (temporary, until TRAP missions drive battles): Ctrl+Shift+B ──
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      if (!activeFlag) launch({ seed: (Math.random() * 1e9) | 0, lane: true }, r => emit('battle.debug.done', r));
    }
  });
})();
