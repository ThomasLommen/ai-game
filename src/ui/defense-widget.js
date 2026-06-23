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
  const FLOCKS = ['hunter', 'locust', 'leech', 'hunter'];
  let S = null, last = performance.now(), shown = false;

  function revealedFlag() { return !!(window.Game && Game.save && Game.save.state && Game.save.state.revealed && Game.save.state.revealed.perimeter); }
  function reveal() {
    if (shown) return; shown = true;
    wrap.hidden = false;
    S = SWARM.create((Math.random() * 1e9) | 0, false, 0, true);   // open-mode, ambient
    last = performance.now(); resize();
  }
  // the first scan brings the perimeter online (and persists it)
  if (window.Game && Game.events) Game.events.on('scan.sweep.done', () => {
    const st = Game.save && Game.save.state; if (st) { st.revealed = st.revealed || {}; if (!st.revealed.perimeter) { st.revealed.perimeter = true; Game.save.persist && Game.save.persist(); } }
    reveal();
  });

  function resize() { if (!shown) return; const r = cvs.getBoundingClientRect(); cvs.width = Math.max(1, r.width * devicePixelRatio); cvs.height = Math.max(1, r.height * devicePixelRatio); }
  addEventListener('resize', resize);

  function frame(now) {
    requestAnimationFrame(frame);
    if (!shown) { if (revealedFlag()) reveal(); else return; }     // reload case: appear once the save says it's unlocked
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    S.compute = 9999;                                  // ambient — never resource-starve
    S.core.hp = S.core.maxHp;                           // and never actually lose; it's just ambiance
    while (S.flocks.length < 4) SWARM.summonFlock(S, FLOCKS[S.flocks.length % FLOCKS.length]);
    SWARM.tick(S, dt);
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

    const cx = X(S.core.x), cy = Y(S.core.y), cr = Math.max(7, 15 * s2), pulse = 0.5 + 0.5 * Math.sin(S.t * 3);
    ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 7 + pulse * 5; ctx.fillStyle = '#ffb000';
    ctx.beginPath(); ctx.moveTo(cx, cy - cr); ctx.lineTo(cx + cr, cy); ctx.lineTo(cx, cy + cr); ctx.lineTo(cx - cr, cy); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  }

  requestAnimationFrame(frame);
})();
