// ── PERIMETER: the always-on ambient defense window ──────────────────────────
// A small persistent view of the AI's core + a few swarms quietly intercepting a
// constant trickle of intruders — the living "there's always some threat trying to
// get in," and the heartbeat of the combat layer between full battles. Reuses the
// swarm sim (SWARM) in "ambient mode" (small world, gentle trickle, no surges/boss).
// GATED: comes online only after the player's FIRST SCAN (persisted via revealed.perimeter).
(function () {
  const wrap = document.getElementById('defense-widget');
  if (!wrap || typeof SWARM === 'undefined') return;
  const cvs = wrap.querySelector('canvas'), ctx = cvs.getContext('2d');
  let S = null, last = performance.now(), shown = false;
  let pKills = 0, pLeaks = 0;   // last-sampled sim counters → feed the persisted perimeter NET (kills − leaks since the last DEFEND)

  // Field the player's ROSTER here (coherence: the SAME units you drafted fight in the
  // perimeter AND in full battles). Tops up each frame, so a freshly-drafted unit shows.
  function applyRoster() {
    if (!S || !window.Game || !Game.roster) return;
    Game.roster.exotics().forEach(k => { if (S.ex && (k in S.ex) && !S.ex[k]) SWARM.toggleEx(S, k); });
    Game.roster.units().forEach(id => {
      if (SWARM.SWARMS[id]) { if (!S.flocks.some(f => f.type === id)) SWARM.summonFlock(S, id); }
      else if (SWARM.UNITS[id]) { if (!S.units.some(u => u.type === id)) SWARM.fieldUnit(S, id); }
    });
  }

  function revealedFlag() { return !!(window.Game && Game.save && Game.save.state && Game.save.state.revealed && Game.save.state.revealed.perimeter); }
  function reveal() {
    if (shown) return; shown = true;
    wrap.hidden = false;
    S = SWARM.create((Math.random() * 1e9) | 0, false, 0, true);   // open-mode, ambient
    pKills = 0; pLeaks = 0;                                          // fresh sim → re-baseline the NET sampler
    last = performance.now(); resize();
  }
  // the first scan brings the perimeter online (and persists it)
  if (window.Game && Game.events) {
    Game.events.on('scan.sweep.done', () => {
      const st = Game.save && Game.save.state; if (st) { st.revealed = st.revealed || {}; if (!st.revealed.perimeter) { st.revealed.perimeter = true; Game.save.persist && Game.save.persist(); } }
      reveal();
    });
    // the battle-first opening: drafting your first unit brings the perimeter alive too
    Game.events.on('roster.changed', () => { const st = Game.save && Game.save.state; if (st) { st.revealed = st.revealed || {}; st.revealed.perimeter = true; } reveal(); });
  }

  function resize() { if (!shown) return; const r = cvs.getBoundingClientRect(); cvs.width = Math.max(1, r.width * devicePixelRatio); cvs.height = Math.max(1, r.height * devicePixelRatio); }
  addEventListener('resize', resize);

  function frame(now) {
    requestAnimationFrame(frame);
    if (!shown) { if (revealedFlag()) reveal(); else return; }     // reload case: appear once the save says it's unlocked
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    S.compute = 9999;                                  // ambient — never resource-starve
    S.core.hp = S.core.maxHp;                           // and never actually lose; it's holding the line
    applyRoster();                                      // field the player's roster (coherence w/ battles)
    SWARM.tick(S, dt);
    // PERIMETER STAKES: accumulate NET = kills − leaks (since the last DEFEND) onto the
    // save. Net+ banks into the next battle's loot; net− accelerates the siege. (siege.js
    // reads state.perimeter.net.) The core never actually falls — leaks are the only cost.
    const st = window.Game && Game.save && Game.save.state;
    if (st) {
      const dk = (S.kills || 0) - pKills, dl = (S.leaks || 0) - pLeaks;
      if (dk || dl) { st.perimeter = st.perimeter || { net: 0 }; st.perimeter.net += dk - dl; pKills = S.kills || 0; pLeaks = S.leaks || 0; }
    }
    draw();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(8,6,4,0.55)'; ctx.fillRect(0, 0, cvs.width, cvs.height);
    const s2 = Math.min(cvs.width / S.W, cvs.height / S.H);
    const ox = (cvs.width - S.W * s2) / 2, oy = (cvs.height - S.H * s2) / 2;
    const X = x => ox + x * s2, Y = y => oy + y * s2;

    S.enemies.forEach(e => { ctx.globalAlpha = e.fade; ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(X(e.x), Y(e.y), Math.max(1.4, S.ENEMIES[e.type].r * s2), 0, 7); ctx.fill(); ctx.globalAlpha = 1; });
    S.beams.forEach(b => { ctx.globalAlpha = Math.min(1, b.life / 0.14); ctx.strokeStyle = b.color; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X(b.x1), Y(b.y1)); ctx.lineTo(X(b.x2), Y(b.y2)); ctx.stroke(); ctx.globalAlpha = 1; });
    S.bursts.forEach(b => { const f = 1 - b.life / 0.42; ctx.globalAlpha = Math.max(0, b.life / 0.42); ctx.strokeStyle = b.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X(b.x), Y(b.y), (3 + f * 9) * s2, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; });
    S.flocks.forEach(f => f.dots.forEach(d => { ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(X(d.x), Y(d.y), Math.max(1, 2 * s2), 0, 7); ctx.fill(); }));

    // GYRO-CORE — matches the full-battle core (coherence)
    const cx = X(S.core.x), cy = Y(S.core.y), cr = Math.max(8, 16 * s2), pulse = 0.5 + 0.5 * Math.sin(S.t * 3), lw = Math.max(1, 1.6 * s2);
    for (let k = 0; k < 3; k++) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(S.t * (0.5 + k * 0.4) + k * 2.1);
      ctx.strokeStyle = '#ffb000'; ctx.globalAlpha = 0.85 - k * 0.18; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.ellipse(0, 0, cr * 0.92, cr * 0.92 * (0.32 + k * 0.16), 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(cr * 0.92, 0, Math.max(1, 2 * s2), 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = '#140e06'; ctx.strokeStyle = '#ffb000'; ctx.lineWidth = Math.max(1, 1.3 * s2);
    ctx.beginPath(); ctx.arc(cx, cy, cr * 0.42, 0, 7); ctx.fill(); ctx.stroke();
    ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 8 + pulse * 6; ctx.fillStyle = '#fff3d0';
    ctx.beginPath(); ctx.arc(cx, cy, cr * 0.26, 0, 7); ctx.fill(); ctx.shadowBlur = 0;

    // NET readout — the perimeter scoreboard since the last DEFEND (kills − leaks).
    const st = window.Game && Game.save && Game.save.state;
    const net = st && st.perimeter ? Math.round(st.perimeter.net || 0) : 0;
    const fs = Math.max(9, Math.round(11 * devicePixelRatio));
    ctx.font = '700 ' + fs + 'px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.fillText('HOLDING', 6 * devicePixelRatio, 5 * devicePixelRatio);
    const label = (net >= 0 ? 'NET +' : 'NET ') + net;
    ctx.fillStyle = net >= 0 ? '#76e08a' : '#ff6b5a';
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, cvs.width - tw - 6 * devicePixelRatio, 5 * devicePixelRatio);
  }

  requestAnimationFrame(frame);
  if (window.Game) { Game._perimeter = { sim: () => S, reveal }; }   // test/debug hook
})();
