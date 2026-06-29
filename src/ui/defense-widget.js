// ── PERIMETER: the always-on ambient defense window ──────────────────────────
// A small persistent view of the AI's core + a few swarms quietly intercepting a
// constant trickle of intruders — the living "there's always some threat trying to
// get in," and the heartbeat of the combat layer between full battles. Reuses the
// swarm sim (SWARM) in "ambient mode" (small world, gentle trickle, no surges/boss).
// GATED: comes online only after the player's FIRST SCAN (persisted via revealed.perimeter).
(function () {
  const wrap = document.getElementById('defense-widget');
  if (!wrap || typeof SWARM === 'undefined') return;
  // RETIRED (perimeter-retire): the always-on perimeter window pulled all attention and
  // gave the darknet no purpose. It's deactivated — kept hidden, never revealed. The HOME
  // slot is being replaced by the diegetic ROOM window (Phase B). Bail before any of the
  // sim/NET/reveal wiring runs. ([[start-defense-pivot]])
  if (!(window.Game && Game.save && Game.save.state && Game.save.state.revealed && Game.save.state.revealed.perimeterLegacy)) { wrap.hidden = true; return; }
  const cvs = wrap.querySelector('canvas'), ctx = cvs.getContext('2d');
  let S = null, last = performance.now(), shown = false;
  let pKills = 0, pLeaks = 0;   // last-sampled sim counters → feed the persisted perimeter NET (kills − leaks since the last DEFEND)

  // Field the player's ROSTER here (coherence: the SAME units you drafted fight in the
  // perimeter AND in full battles). Tops up each frame, so a freshly-drafted unit shows.
  function applyRoster() {
    if (!S || !window.Game || !Game.roster) return;
    Game.roster.exotics().forEach(k => { if (S.ex && (k in S.ex) && !S.ex[k]) SWARM.toggleEx(S, k); });
    // The perimeter shows your WHOLE roster — lift the battle caps (it's a cosmetic display,
    // not a balance constraint), so every drafted swarm + greater unit is visible. (Set AFTER
    // the exotics toggle, since engaging `hive` rewrites maxFlocks.)
    S.podCap = 30; S.maxFlocks = Math.max(S.maxFlocks, 30);
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
    // DIFFICULTY: drive the perimeter trickle off the SAME LAGGED power as battles (siege),
    // so a fresh pick/level doesn't instantly flood it — it catches up in step with the fights.
    const lp = (window.Game && Game.save && Game.save.state && Game.save.state.siege && Game.save.state.siege.laggedPower) || 0;
    S.powerFactor = (SWARM.powerFactor ? SWARM.powerFactor(lp) : 1);
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
    S.bursts.forEach(b => { const f = Math.max(0, 1 - b.life / 0.42); ctx.globalAlpha = Math.max(0, b.life / 0.42); ctx.strokeStyle = b.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X(b.x), Y(b.y), Math.max(0, (3 + f * 9) * s2), 0, 7); ctx.stroke(); ctx.globalAlpha = 1; });
    S.flocks.forEach(f => f.dots.forEach(d => { ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(X(d.x), Y(d.y), Math.max(1, 2 * s2), 0, 7); ctx.fill(); }));
    // GREATER UNITS — drawn with their PROPER models (same rigs as the full battle), a touch
    // smaller for the compact perimeter view. (drawUnitModel ports proto/swarm/app.js.)
    const usc = s2 * 0.62;
    S.units.forEach(u => drawUnitModel(u, X, Y, usc));

    // GYRO-CORE with the LIVING EYE — sized to the collision radius (S.core.r) so enemies
    // actually meet its edge before vanishing, and bigger than before.
    const cx = X(S.core.x), cy = Y(S.core.y), cr = Math.max(10, (S.core.r || 42) * s2), pulse = 0.5 + 0.5 * Math.sin(S.t * 3), lw = Math.max(1, 1.6 * s2);
    for (let k = 0; k < 3; k++) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(S.t * (0.5 + k * 0.4) + k * 2.1);
      ctx.strokeStyle = '#ffb000'; ctx.globalAlpha = 0.85 - k * 0.18; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.ellipse(0, 0, cr * 0.92, cr * 0.92 * (0.32 + k * 0.16), 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(cr * 0.92, 0, Math.max(1, 2 * s2), 0, 7); ctx.fill();
      ctx.restore();
    }
    drawCoreEye(ctx, S, cx, cy, cr, s2, pulse);

    // NET readout — the perimeter scoreboard since the last DEFEND (kills − leaks).
    // Top-RIGHT, clear of the "◈ PERIMETER" HTML label (top-left).
    const st = window.Game && Game.save && Game.save.state;
    const net = st && st.perimeter ? Math.round(st.perimeter.net || 0) : 0;
    const fs = Math.max(9, Math.round(10 * devicePixelRatio));
    ctx.font = '700 ' + fs + 'px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'top';
    const label = (net >= 0 ? 'NET +' : 'NET ') + net;
    ctx.fillStyle = net >= 0 ? '#76e08a' : '#ff6b5a';
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, cvs.width - tw - 7 * devicePixelRatio, 5 * devicePixelRatio);
  }

  // The core's LIVING gaze (shared shape with the full-battle core). Reads S.core.eye —
  // pupil offset (wander / lock-on / stare), dilation (danger), and the blink lid sweep.
  function drawCoreEye(ctx, S, cx, cy, cr, sc, pulse) {
    const e = (S.core && S.core.eye) || { x: 0, y: 0, dil: 0, blink: 0, staring: false };
    const dil = Math.max(0, Math.min(1, e.dil || 0));
    const blink = e.blink > 0 ? Math.sin((1 - e.blink) * Math.PI) : 0;   // 0→1→0 lid sweep
    const lidOpen = 1 - blink * 0.93;
    const irisR = cr * 0.5, ex = cx + (e.x || 0) * sc, ey = cy + (e.y || 0) * sc;
    ctx.globalAlpha = 1; ctx.fillStyle = '#0d0a06';
    ctx.beginPath(); ctx.ellipse(cx, cy, irisR, Math.max(0.5, irisR * lidOpen), 0, 0, 7); ctx.fill();   // dark socket
    ctx.lineWidth = Math.max(1, 1.3 * sc); ctx.strokeStyle = dil > 0.55 ? '#ff5a3a' : '#ffb000';
    ctx.globalAlpha = 0.55 + 0.4 * pulse; ctx.beginPath(); ctx.ellipse(cx, cy, irisR, Math.max(0.5, irisR * lidOpen), 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    if (lidOpen > 0.12) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(cx, cy, irisR, irisR * lidOpen, 0, 0, 7); ctx.clip();   // pupil hides behind the lids mid-blink
      const pupR = irisR * (0.4 + dil * 0.26);
      ctx.shadowColor = dil > 0.55 ? '#ff5a3a' : '#ffb000'; ctx.shadowBlur = 6 + dil * 8 + (e.staring ? 7 : 0);
      ctx.fillStyle = dil > 0.6 ? '#ff8a66' : '#fff3d0';
      ctx.beginPath(); ctx.arc(ex, ey, pupR, 0, 7); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(ex - pupR * 0.32, ey - pupR * 0.32, Math.max(0.6, pupR * 0.24), 0, 7); ctx.fill();   // catchlight = life
      ctx.restore();
    }
  }

  // ── GREATER-UNIT MODELS (ported from proto/swarm/app.js) ────────────────────
  // Same rigs as the full battle (walkers, bulwark carapace, fabricator brood, …), drawn at
  // the widget's scale `sc`. No mk-label / hp-bar here (the perimeter is a clean ambient view).
  function unitEye(X, Y, x, y, aim, R, eyeC, sc) {
    void X; void Y;
    ctx.fillStyle = '#100a04'; ctx.beginPath(); ctx.arc(x + Math.cos(aim) * 4 * sc, y + Math.sin(aim) * 4 * sc, R * 0.6, 0, 7); ctx.fill();
    ctx.shadowColor = eyeC; ctx.shadowBlur = 8; ctx.fillStyle = eyeC;
    ctx.beginPath(); ctx.arc(x + Math.cos(aim) * 5 * sc, y + Math.sin(aim) * 5 * sc, R * 0.3, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  }
  function drawUnitModel(u, X, Y, sc) {
    ctx.globalAlpha = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const b = u.behavior;
    if (b === 'anchor') drawBulwark(u, X, Y, sc);
    else if (b === 'artillery') drawSiege(u, X, Y, sc);
    else if (b === 'support') drawConductor(u, X, Y, sc);
    else if (b === 'reaper') drawReaper(u, X, Y, sc);
    else if (b === 'fabricator') drawFabricator(u, X, Y, sc);
    else drawWalker(u, X, Y, sc);   // striker (strider) + cryo (glacier)
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.setLineDash([]);
  }
  function drawConductor(u, X, Y, sc) {
    const x = X(u.x), y = Y(u.y), aim = u.aim || 0, tp = (S.t * 0.6) % 1, jy = y + 4 * sc;
    ctx.strokeStyle = u.color; ctx.globalAlpha = (1 - tp) * 0.3; ctx.lineWidth = 2 * sc; ctx.beginPath(); ctx.arc(x, y, (40 + tp * 195) * sc, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.strokeStyle = u.color; ctx.globalAlpha = 0.4; ctx.lineWidth = 1 * sc; ctx.setLineDash([3 * sc, 4 * sc]); ctx.lineDashOffset = -S.t * 20;
    S.flocks.forEach(f => { if (f.buff) { ctx.beginPath(); ctx.moveTo(x, jy); ctx.lineTo(X(f.cx), Y(f.cy)); ctx.stroke(); } });
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#8a6ec0'; ctx.lineWidth = 4.5 * sc; ctx.beginPath(); ctx.moveTo(x, y + 18 * sc); ctx.lineTo(x, jy); ctx.stroke();
    [[-13, -19], [0, -22], [13, -19]].forEach(([dx, dy]) => {
      ctx.strokeStyle = '#d9ccff'; ctx.lineWidth = 3.4 * sc; ctx.beginPath(); ctx.moveTo(x, jy); ctx.lineTo(x + dx * sc, y + dy * sc); ctx.stroke();
      ctx.fillStyle = u.color; ctx.shadowColor = u.color; ctx.shadowBlur = 7; ctx.beginPath(); ctx.arc(x + dx * sc, y + dy * sc, 3.6 * sc, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    });
    ctx.fillStyle = '#140e28'; ctx.strokeStyle = u.color; ctx.lineWidth = 1.5 * sc; ctx.beginPath(); ctx.arc(x, jy, 8 * sc, 0, 7); ctx.fill(); ctx.stroke();
    unitEye(X, Y, x, jy, aim, 9 * sc, '#efe2ff', sc);
  }
  function drawReaper(u, X, Y, sc) {
    const x = X(u.x), y = Y(u.y), aim = u.aim || 0, R = 12 * sc;
    ctx.save(); ctx.translate(x, y); ctx.rotate(aim);
    ctx.shadowColor = u.color; ctx.shadowBlur = 9; ctx.fillStyle = u.color; ctx.strokeStyle = '#0a1a12'; ctx.lineWidth = 1.5 * sc;
    ctx.beginPath(); ctx.moveTo(R * 1.4, 0); ctx.lineTo(-R * 0.7, -R * 0.9); ctx.lineTo(-R * 0.1, 0); ctx.lineTo(-R * 0.7, R * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#dffaf0'; ctx.lineWidth = 2 * sc; ctx.beginPath(); ctx.arc(-R * 0.1, -R * 0.2, R * 0.95, -1.4, 0.25); ctx.stroke();
    ctx.fillStyle = '#0a1a12'; ctx.beginPath(); ctx.arc(R * 0.25, 0, R * 0.42, 0, 7); ctx.fill();
    ctx.fillStyle = '#eafff5'; ctx.shadowColor = u.color; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(R * 0.3, 0, R * 0.18, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.restore();
  }
  function drawFabricator(u, X, Y, sc) {
    const x = X(u.x), y = Y(u.y), aim = u.aim || 0, R = u.r * sc, walk = u.walk || 0;
    ctx.strokeStyle = '#8a6e1e'; ctx.lineWidth = 2.8 * sc;
    for (let i = 0; i < 6; i++) {
      const la = i / 6 * Math.PI * 2 + 0.3, step = Math.sin(walk * 2 + i * 1.0) * 2.5 * sc;
      const hx = x + Math.cos(la) * R * 0.8, hy = y + Math.sin(la) * R * 0.8;
      const fx = x + Math.cos(la) * (R + 20 * sc), fy = y + Math.sin(la) * (R + 20 * sc) + step;
      const kx = (hx + fx) / 2 + Math.cos(la) * 3 * sc, ky = (hy + fy) / 2 - 6 * sc;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }
    ctx.fillStyle = '#2a2208'; ctx.strokeStyle = '#0a0805'; ctx.lineWidth = 2 * sc;
    ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill(); ctx.stroke();
    ctx.shadowColor = u.color; ctx.shadowBlur = 5; ctx.fillStyle = u.color;
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + walk * 0.25, rr = R * (0.62 + (i % 3) * 0.13); ctx.globalAlpha = 0.5 + 0.4 * Math.sin(S.t * 3 + i); ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 2.3 * sc, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    unitEye(X, Y, x, y, aim, R * 0.5, '#fff0b0', sc);
  }
  function drawWalker(u, X, Y, sc) {
    const cryo = u.behavior === 'cryo';
    const x = X(u.x), y = Y(u.y), aim = u.aim || 0, walk = u.walk || 0, R = (cryo ? 14 : 13) * sc;
    const slam = cryo && u.thumpT > 0 ? Math.sin((1 - u.thumpT / 0.32) * Math.PI) * 6 * sc : 0;
    const bob = Math.sin(walk * 2) * 1.7 * sc - slam;
    ctx.strokeStyle = cryo ? '#5fa8d6' : '#9a5e36'; ctx.lineWidth = 2.6 * sc;
    for (let i = 0; i < 3; i++) {
      const la = aim + Math.PI + (i - 1) * 1.05, step = Math.sin(walk * 2 + i * 2.094);
      const lift = Math.max(0, step) * 6 * sc, reach = (25 + step * 7) * sc;
      const hx = x + Math.cos(la) * R * 0.7, hy = y + Math.sin(la) * R * 0.7 - bob, fx = x + Math.cos(la) * reach, fy = y + Math.sin(la) * reach - lift;
      const kx = (hx + fx) / 2 + Math.cos(la) * 2 * sc, ky = (hy + fy) / 2 - 5 * sc;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }
    ctx.fillStyle = u.color; ctx.strokeStyle = '#0a0805'; ctx.lineWidth = 1.5 * sc;
    ctx.beginPath(); ctx.arc(x, y - bob, R, 0, 7); ctx.fill(); ctx.stroke();
    unitEye(X, Y, x, y - bob, aim, R, cryo ? '#dffaff' : (S.ex.flame ? '#ff8a3a' : '#ffd9a0'), sc);
  }
  function drawBulwark(u, X, Y, sc) {
    const x = X(u.x), y = Y(u.y), aim = u.aim || 0, R = u.r * sc, walk = u.walk || 0;
    ctx.strokeStyle = 'rgba(200,178,122,0.22)'; ctx.lineWidth = 1.6 * sc; ctx.beginPath(); ctx.arc(x, y, R + 30 * sc, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 2.4 * sc;
    for (let i = 0; i < 8; i++) {
      const la = i / 8 * Math.PI * 2 + 0.2, step = Math.sin(walk * 2 + i * 0.9) * 2 * sc;
      const hx = x + Math.cos(la) * R * 0.78, hy = y + Math.sin(la) * R * 0.78;
      const fx = x + Math.cos(la) * (R + 17 * sc), fy = y + Math.sin(la) * (R + 17 * sc) + step;
      const kx = (hx + fx) / 2 + Math.cos(la) * 3 * sc, ky = (hy + fy) / 2 - 5 * sc;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }
    ctx.fillStyle = u.color; ctx.strokeStyle = '#0a0805'; ctx.lineWidth = 2 * sc;
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, px = x + Math.cos(a) * R, py = y + Math.sin(a) * R; ctx[i ? 'lineTo' : 'moveTo'](px, py); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a1206'; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, px = x + Math.cos(a) * R * 0.64, py = y + Math.sin(a) * R * 0.64; ctx[i ? 'lineTo' : 'moveTo'](px, py); } ctx.closePath(); ctx.fill();
    unitEye(X, Y, x, y, aim, R * 0.74, '#ffe3b0', sc);
  }
  function drawSiege(u, X, Y, sc) {
    const x = X(u.x), y = Y(u.y), aim = u.aim || 0, R = u.r * sc;
    ctx.fillStyle = '#241509'; ctx.strokeStyle = '#0a0805'; ctx.lineWidth = 2 * sc;
    ctx.beginPath(); ctx.moveTo(x - R * 1.2, y + R * 0.8); ctx.lineTo(x + R * 1.2, y + R * 0.8); ctx.lineTo(x + R * 0.7, y - R * 0.4); ctx.lineTo(x - R * 0.7, y - R * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = u.color; ctx.beginPath(); ctx.arc(x, y - R * 0.2, R * 0.85, 0, 7); ctx.fill(); ctx.stroke();
    unitEye(X, Y, x, y - R * 0.2, aim, R * 0.85, '#ffd0a0', sc);
  }

  requestAnimationFrame(frame);
  if (window.Game) { Game._perimeter = { sim: () => S, reveal }; }   // test/debug hook
})();
