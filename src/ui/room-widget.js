// ── ROOM: the diegetic cam-feed of the AI's physical space ───────────────────
// Replaces the retired perimeter window on HOME. A calm, glanceable security-cam view of
// the place the AI actually inhabits — the basement (desktop PC + the scuffed bot) now,
// foreshadowing the Act-4 FACILITY that fills with server racks as you buy machines. Pure
// AMBIENT: no taps, no readouts — it rewards looking, never asks for input. The LIVING EYE
// (relocated off the old perimeter core) glows on the MONITOR — the AI *is* that machine.
//
// Rendered pixel pseudo-3D: the scene draws to a small offscreen BUFFER, then blits scaled
// with smoothing OFF for a chunky CRT-cam look (no 3D engine — portable, on-brand). Authored
// BEATS evolve the scene (crates pile up as you acquire hardware; Act 4 swaps to the facility
// room where each machine adds a rack); per-frame AMBIENT keeps it alive (fans, bot, heat).
// ([[perimeter-retire-room-window]], [[living-core-eye]], [[start-defense-pivot]])
(function () {
  const wrap = document.getElementById('room-widget');
  if (!wrap) return;
  const cvs = wrap.querySelector('canvas'); if (!cvs) return;
  const ctx = cvs.getContext('2d');
  const BW = 200, BH = 132;                                   // fixed low-res scene buffer (pixel look)
  const buf = document.createElement('canvas'); buf.width = BW; buf.height = BH;
  const bx = buf.getContext('2d');
  let shown = false, last = performance.now(), t = 0, flick = 0;

  // ── the LIVING EYE on the monitor (local state machine; same soul as the old core eye) ──
  const eye = { x: 0, y: 0, tx: 0, ty: 0, ease: 4, blink: 0, blinkT: 2.5, dil: 0, stare: 0, stT: 2 };
  function rand(a, b) { return a + Math.random() * (b - a); }
  function updateEye(dt, danger) {
    eye.stT -= dt;
    if (eye.stT <= 0) {
      if (Math.random() < 0.10) { eye.tx = 0; eye.ty = rand(-0.5, 0.2); eye.stare = rand(0.8, 1.6); }   // rare: stares out at YOU
      else { eye.tx = rand(-1, 1); eye.ty = rand(-0.7, 0.7); }                                            // wander
      eye.stT = rand(1.4, 3.6);
    }
    const k = Math.min(1, dt * eye.ease);
    eye.x += (eye.tx - eye.x) * k; eye.y += (eye.ty - eye.y) * k;
    eye.blinkT -= dt;
    if (eye.blinkT <= 0 && eye.blink <= 0) { eye.blink = 0.16; eye.blinkT = rand(2.4, 6.5); }
    if (eye.blink > 0) eye.blink = Math.max(0, eye.blink - dt);
    eye.dil += (danger - eye.dil) * Math.min(1, dt * 2);
    eye.stare = Math.max(0, eye.stare - dt);
  }

  // ── what the room reflects (authored beats, read live + cheap) ──
  function ctxState() {
    const s = (window.Game && Game.save && Game.save.state) || {};
    const heat = +s.heat || 0;
    const battle = !!(window.Game && Game.battle && Game.battle.active && Game.battle.active());
    const danger = Math.max(0, Math.min(1, Math.max(0, (heat - 58) / 42) * 0.7 + (battle ? 0.55 : 0) + Math.min(0.35, (+s.exposure || 0) / 220)));
    let bot = 'dormant';
    try {
      if (window.Game && Game.bot) {
        if (Game.bot.isConnected && Game.bot.isConnected()) { const st = Game.bot.status && Game.bot.status(); bot = (st && st.state === 'working') ? 'working' : 'idle'; }
      }
    } catch (e) {}
    // crates pile up as you accumulate hardware (the "room fills" payoff, basement era)
    const parts = s.itemInstances ? Object.keys(s.itemInstances).length : 0;
    const crates = Math.max(0, Math.min(6, parts));
    const act = (window.Game && Game.acts && Game.acts.current) ? Game.acts.current() : 1;
    const racks = (window.Game && Game.facilityRuntime && Game.facilityRuntime.usedSlots) ? Game.facilityRuntime.usedSlots() : 0;
    return { heat, danger, battle, bot, crates, act, racks };
  }

  function reveal() { if (shown) return; shown = true; wrap.hidden = false; last = performance.now(); resize(); }
  function resize() { if (!shown) return; const r = cvs.getBoundingClientRect(); cvs.width = Math.max(1, (r.width || 240) * devicePixelRatio); cvs.height = Math.max(1, (r.height || 150) * devicePixelRatio); }
  addEventListener('resize', resize);

  function frame(now) {
    requestAnimationFrame(frame);
    if (!shown) { const s = window.Game && Game.save && Game.save.state; if (s && (s.bootSequenceComplete || (s.flags && s.flags.guardDone))) reveal(); else return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const st = ctxState();
    updateEye(dt, st.danger);
    // rare CRT flicker
    flick = Math.max(0, flick - dt); if (Math.random() < 0.004) flick = rand(0.05, 0.14);
    drawScene(st);
    blit(st);
  }

  // ── SCENE (drawn into the low-res buffer) ───────────────────────────────────
  function drawScene(st) {
    bx.setTransform(1, 0, 0, 1, 0, 0);
    if (st.act >= 4) drawFacility(st); else drawBasement(st);
  }

  function floorAndWalls(wallTone, floorTone, hz) {
    bx.fillStyle = '#060503'; bx.fillRect(0, 0, BW, BH);
    // back wall (gradient) + floor below the horizon
    const g = bx.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, wallTone[0]); g.addColorStop(1, wallTone[1]);
    bx.fillStyle = g; bx.fillRect(0, 0, BW, hz);
    bx.fillStyle = floorTone; bx.fillRect(0, hz, BW, BH - hz);
    // one-point perspective floor lines → vanishing point
    const vx = BW * 0.5, vy = hz - 3;
    bx.strokeStyle = 'rgba(255,176,0,0.07)'; bx.lineWidth = 1;
    for (let i = -6; i <= 6; i++) { bx.beginPath(); bx.moveTo(vx + i * 7, vy); bx.lineTo(vx + i * 42, BH); bx.stroke(); }
    for (let d = 1; d <= 5; d++) { const yy = hz + (BH - hz) * (d * d) / 30; bx.beginPath(); bx.moveTo(0, yy); bx.lineTo(BW, yy); bx.globalAlpha = 0.05; bx.stroke(); bx.globalAlpha = 1; }
  }

  function drawBasement(st) {
    const hz = BH * 0.52;
    floorAndWalls(['#13100a', '#0a0805'], '#0c0a07', hz);

    // overhead light cone over the desk (gentle, flickers faintly)
    const lf = 0.5 + 0.5 * Math.sin(t * 1.7) * 0.15;
    bx.save();
    const lg = bx.createRadialGradient(BW * 0.46, hz - 6, 2, BW * 0.46, hz + 30, 78);
    lg.addColorStop(0, 'rgba(255,196,90,' + (0.10 * lf) + ')'); lg.addColorStop(1, 'rgba(255,196,90,0)');
    bx.fillStyle = lg; bx.fillRect(0, 0, BW, BH); bx.restore();

    // crates piling up (hardware acquired) — back-right, depth-stacked
    for (let i = 0; i < st.crates; i++) {
      const col = i % 3, row = (i / 3) | 0;
      const cxp = BW * 0.74 + col * 13 - row * 4, cyp = hz + 30 - row * 11;
      bx.fillStyle = '#1c160c'; bx.fillRect(cxp, cyp, 12, 10);
      bx.strokeStyle = '#2e2410'; bx.lineWidth = 1; bx.strokeRect(cxp + 0.5, cyp + 0.5, 11, 9);
      bx.strokeStyle = 'rgba(120,90,30,0.5)'; bx.beginPath(); bx.moveTo(cxp + 6, cyp); bx.lineTo(cxp + 6, cyp + 10); bx.stroke();
    }

    // ── the DESK ──
    const dx = BW * 0.24, dw = BW * 0.5, dyTop = hz + 20, dh = 6;
    bx.fillStyle = '#241a0e'; bx.beginPath();
    bx.moveTo(dx, dyTop); bx.lineTo(dx + dw, dyTop); bx.lineTo(dx + dw - 6, dyTop - 7); bx.lineTo(dx + 6, dyTop - 7); bx.closePath(); bx.fill();   // desk top (perspective)
    bx.fillStyle = '#150f07'; bx.fillRect(dx, dyTop, dw, dh);                       // front lip
    bx.fillStyle = '#0d0905'; bx.fillRect(dx + 4, dyTop + dh, 4, BH - (dyTop + dh)); bx.fillRect(dx + dw - 8, dyTop + dh, 4, BH - (dyTop + dh));   // legs

    // ── the desktop PC TOWER (under-desk right) — fan glow + power LED blink ──
    const tx = dx + dw - 20, ty = dyTop + dh + 1, tw = 16, th = BH - ty - 3;
    bx.fillStyle = '#100b06'; bx.fillRect(tx, ty, tw, th);
    bx.strokeStyle = '#2a1f10'; bx.lineWidth = 1; bx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
    const fan = (0.4 + 0.4 * Math.sin(t * (st.bot === 'working' ? 7 : 4))) * (st.heat > 70 ? 1.4 : 1);   // spins faster when hot
    bx.save(); bx.globalAlpha = Math.min(1, 0.5 + fan); bx.strokeStyle = st.heat > 75 ? '#ff7a3a' : '#ffb000';
    bx.beginPath(); bx.arc(tx + tw / 2, ty + th * 0.62, 4, 0, 7); bx.stroke();
    bx.save(); bx.translate(tx + tw / 2, ty + th * 0.62); bx.rotate(t * 6); bx.beginPath(); bx.moveTo(-4, 0); bx.lineTo(4, 0); bx.moveTo(0, -4); bx.lineTo(0, 4); bx.stroke(); bx.restore();
    bx.restore();
    const led = (Math.sin(t * 2.2) > -0.3);
    bx.fillStyle = led ? '#6fe08a' : '#13301b'; bx.fillRect(tx + 3, ty + 3, 2, 2);

    // ── the MONITOR (back-left of the desk) with the LIVING EYE ──
    const mw = 40, mh = 26, mx = dx + 14, my = dyTop - 7 - mh;
    bx.fillStyle = '#0a0805'; bx.fillRect(mx + mw / 2 - 4, my + mh, 8, 7);              // stand
    bx.fillStyle = '#19130a'; bx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);              // bezel
    bx.strokeStyle = '#2c2112'; bx.lineWidth = 1; bx.strokeRect(mx - 1.5, my - 1.5, mw + 3, mh + 3);
    drawScreenEye(mx, my, mw, mh);

    // ── the BOT — scuffed housekeeping unit; idles, trundles when working ──
    drawBot(st, hz);

    // faint cable from tower to monitor
    bx.strokeStyle = 'rgba(60,46,24,0.6)'; bx.lineWidth = 1; bx.beginPath();
    bx.moveTo(mx + 4, my + mh + 5); bx.quadraticCurveTo(dx + 12, BH - 6, tx + 4, ty + 6); bx.stroke();
  }

  // The monitor screen — phosphor dark with the amber eye gazing out.
  function drawScreenEye(sx, sy, sw, sh) {
    bx.fillStyle = '#0b0a06'; bx.fillRect(sx, sy, sw, sh);
    // inner scanlines
    bx.globalAlpha = 0.5; bx.fillStyle = 'rgba(255,176,0,0.04)';
    for (let y = sy + 1; y < sy + sh; y += 2) bx.fillRect(sx, y, sw, 1);
    bx.globalAlpha = 1;
    const cx = sx + sw / 2, cy = sy + sh / 2;
    const irisR = Math.min(sw, sh) * 0.34;
    const dil = Math.max(0, Math.min(1, eye.dil));
    const blink = eye.blink > 0 ? Math.sin((1 - eye.blink / 0.16) * Math.PI) : 0;   // 0→1→0 lid sweep
    const lidOpen = 1 - blink * 0.92;
    const ex = cx + eye.x * irisR * 0.7, ey = cy + eye.y * irisR * 0.6;
    const danger = dil > 0.55;
    // iris ring
    bx.lineWidth = 1.4; bx.strokeStyle = danger ? '#ff5a3a' : '#ffb000';
    bx.globalAlpha = 0.6 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3));
    bx.beginPath(); bx.ellipse(cx, cy, irisR, Math.max(0.5, irisR * lidOpen), 0, 0, 7); bx.stroke(); bx.globalAlpha = 1;
    if (lidOpen > 0.12) {
      bx.save();
      bx.beginPath(); bx.ellipse(cx, cy, irisR, irisR * lidOpen, 0, 0, 7); bx.clip();
      const pupR = irisR * (0.42 + dil * 0.26);
      bx.shadowColor = danger ? '#ff5a3a' : '#ffb000'; bx.shadowBlur = 5 + dil * 7 + (eye.stare > 0 ? 6 : 0);
      bx.fillStyle = danger ? '#ff8a66' : '#fff3d0';
      bx.beginPath(); bx.arc(ex, ey, pupR, 0, 7); bx.fill();
      bx.shadowBlur = 0; bx.fillStyle = 'rgba(255,255,255,0.9)';
      bx.beginPath(); bx.arc(ex - pupR * 0.3, ey - pupR * 0.3, Math.max(0.5, pupR * 0.24), 0, 7); bx.fill();   // catchlight = life
      bx.restore();
    }
  }

  function drawBot(st, hz) {
    const working = st.bot === 'working', dormant = st.bot === 'dormant';
    // trundles left↔right along the floor when working; idles with a gentle bob otherwise
    const baseX = BW * 0.30, range = working ? 30 : 0;
    const bxp = baseX + (working ? Math.sin(t * 1.3) * range : 0);
    const byp = hz + 30 + Math.sin(t * (working ? 3.5 : 1.4)) * 1.2;
    const tilt = working ? Math.sin(t * 1.3 + Math.PI / 2) * 0.12 : 0;
    bx.save(); bx.translate(bxp, byp); bx.rotate(tilt); bx.scale(1.25, 1.25);   // foreground → a touch larger
    // shadow
    bx.fillStyle = 'rgba(0,0,0,0.45)'; bx.beginPath(); bx.ellipse(0, 9, 11, 3, 0, 0, 7); bx.fill();
    // chassis
    bx.fillStyle = dormant ? '#1d1409' : '#312413'; bx.strokeStyle = '#0a0805'; bx.lineWidth = 1;
    bx.beginPath(); bx.moveTo(-10, 6); bx.lineTo(10, 6); bx.lineTo(8, -5); bx.lineTo(-8, -5); bx.closePath(); bx.fill(); bx.stroke();
    bx.strokeStyle = 'rgba(120,92,38,0.5)'; bx.beginPath(); bx.moveTo(-8, 0); bx.lineTo(8, 0); bx.stroke();   // scuffed seam
    // head/optic
    bx.fillStyle = dormant ? '#160f08' : '#241b0e'; bx.strokeStyle = '#0a0805'; bx.fillRect(-6, -11, 12, 7); bx.strokeRect(-6, -11, 12, 7);
    const opticOn = !dormant;
    bx.fillStyle = opticOn ? (working ? '#ffe27a' : '#ffb24a') : '#2a1d0c';
    if (opticOn) { bx.shadowColor = '#ffb000'; bx.shadowBlur = working ? 8 : 5; }
    bx.beginPath(); bx.arc(working ? Math.sin(t * 4) * 2 : 0, -7.5, 2.6, 0, 7); bx.fill(); bx.shadowBlur = 0;
    // little treads
    bx.fillStyle = '#0c0805'; bx.fillRect(-10, 5, 6, 3); bx.fillRect(4, 5, 6, 3);
    // a working spark/arm tick
    if (working && Math.sin(t * 10) > 0.6) { bx.strokeStyle = '#fff0c0'; bx.globalAlpha = 0.8; bx.beginPath(); bx.moveTo(9, -2); bx.lineTo(13, -5); bx.stroke(); bx.globalAlpha = 1; }
    bx.restore();
  }

  // ── ACT-4 FACILITY variant — the payoff: racks fill the room as you buy machines ──
  function drawFacility(st) {
    const hz = BH * 0.46;
    floorAndWalls(['#0a0f12', '#05080a'], '#070a0c', hz);
    // each INSTALLED machine drawn as its own class/tier silhouette (Game.hwart) so the room
    // reads as a varied hall of distinct hardware, not identical boxes. Rows recede → depth.
    const list = (window.Game && Game.facilityRuntime && Game.facilityRuntime.machines) ? Game.facilityRuntime.machines() : [];
    const n = Math.max(list.length ? list.length : 1, 1);
    const perRow = 6;
    for (let i = n - 1; i >= 0; i--) {
      const m = list[i] || { cls: 'rack', tier: 'common', caps: [] };
      const row = (i / perRow) | 0, col = i % perRow;
      const depth = 1 - row * 0.24;                         // 1 (front) → smaller back
      const rw = 24 * depth, rh = 42 * depth;
      const spread = 30 * depth;
      const rx = BW * 0.5 + (col - (perRow - 1) / 2) * spread - rw / 2;
      const ry = hz + 14 + row * 7 - rh + 34;
      bx.globalAlpha = 0.55 + 0.45 * depth;
      if (window.Game && Game.hwart) Game.hwart.machine(bx, m, rx, ry - 4, rw, rh + 4, { depth });
      // a couple of live blinking LEDs over the silhouette (the room breathes)
      const acc = (window.Game && Game.hwart) ? Game.hwart.tierColor(m.tier) : '#49d6ff';
      for (let k = 0; k < 2; k++) { const on = Math.sin(t * (2 + k) + i) > 0.1; if (on) { bx.fillStyle = acc; bx.fillRect(rx + rw * 0.2 + k * rw * 0.3, ry + rh * 0.2, Math.max(1, rw * 0.12), Math.max(1, rh * 0.05)); } }
      bx.globalAlpha = 1;
    }
    // the core console at front-center carries the EYE now
    const mw = 44, mh = 26, mx = BW * 0.5 - mw / 2, my = BH - mh - 6;
    bx.fillStyle = '#0a1014'; bx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
    bx.strokeStyle = '#1d2b31'; bx.lineWidth = 1; bx.strokeRect(mx - 2.5, my - 2.5, mw + 5, mh + 5);
    drawScreenEye(mx, my, mw, mh);
  }

  // ── blit the buffer up (pixelated) + full-res CRT overlays ───────────────────
  function blit(st) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.globalAlpha = 1 - flick;
    ctx.drawImage(buf, 0, 0, cvs.width, cvs.height);
    ctx.globalAlpha = 1;
    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    const step = Math.max(2, Math.round(2 * devicePixelRatio));
    for (let y = 0; y < cvs.height; y += step) ctx.fillRect(0, y, cvs.width, 1);
    // vignette
    const vg = ctx.createRadialGradient(cvs.width / 2, cvs.height / 2, cvs.height * 0.2, cvs.width / 2, cvs.height / 2, cvs.height * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, cvs.width, cvs.height);
    // heat tint
    if (st.heat > 62) { ctx.fillStyle = 'rgba(255,60,30,' + Math.min(0.18, (st.heat - 62) / 200) + ')'; ctx.fillRect(0, 0, cvs.width, cvs.height); }
    // cam HUD: REC dot + faux timestamp (faint, top-right)
    const fs = Math.max(8, Math.round(8 * devicePixelRatio));
    ctx.font = '700 ' + fs + 'px ui-monospace, Menlo, monospace'; ctx.textBaseline = 'top';
    if (Math.sin(t * 2.5) > -0.4) { ctx.fillStyle = '#ff5a3a'; ctx.beginPath(); ctx.arc(cvs.width - 9 * devicePixelRatio, 9 * devicePixelRatio, 2.5 * devicePixelRatio, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,176,0,0.4)';
    const ts = '··:' + String((((t * 1) | 0) % 60)).padStart(2, '0');
    ctx.fillText('REC ' + ts, cvs.width - 64 * devicePixelRatio, 5 * devicePixelRatio);
  }

  requestAnimationFrame(frame);
  if (window.Game) Game._room = { reveal, _eye: () => eye, _state: ctxState };   // test/debug hook
})();
