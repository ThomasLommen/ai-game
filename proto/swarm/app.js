// ── proto/swarm: renderer + input + UI (DOM/canvas side; sim.js stays pure) ───
(function () {
  const cvs = document.getElementById('field'), ctx = cvs.getContext('2d');
  const $ = id => document.getElementById(id);
  // NO meta progression — every run starts equal; power comes from within the run, freshness from seeding + the draft.
  // ── EMBED MODE: when launched inside the campaign (iframe), the launch opts ride
  //    in on the URL, the dev chrome hides, and the outcome is posted back up. ──
  const EMBED = (function () { try { return !!window.parent && window.parent !== window; } catch (e) { return true; } })();
  const Q = new URLSearchParams(location.search);
  const qNum = (k, d) => { const v = parseFloat(Q.get(k)); return isFinite(v) ? v : d; };
  let laneMode = Q.has('lane') ? Q.get('lane') !== '0' : true;
  const makeSeed = () => (EMBED && Q.has('seed')) ? (qNum('seed', 7) | 0) : (Math.random() * 1e9) | 0;
  const battleOpts = () => {                                  // a TRAP's bait rides in on the URL to reshape the climax
    const o = {};
    if (Q.has('surges')) o.surges = qNum('surges');
    if (Q.has('boss')) o.boss = Q.get('boss');
    if (Q.has('escort')) o.escort = qNum('escort');
    if (Q.has('regen')) o.regen = qNum('regen');
    if (Q.has('ex')) o.ex = Q.get('ex').split(',').filter(Boolean);          // campaign adaptations → battle exotics
    if (Q.has('unlock')) o.unlock = Q.get('unlock').split(',').filter(Boolean); // → pre-unlocked roster
    return o;
  };
  const newState = () => SWARM.create(makeSeed(), laneMode, Q.has('compute') ? qNum('compute', 120) : undefined, false, battleOpts());
  let S = newState(), posted = false;
  let last = performance.now(), lastLogLen = -1, lastDraftSig = '';
  function postResult(kind) {                                  // report up to the campaign (kind: 'result' | 'return')
    try { window.parent.postMessage({ source: 'swarm-battle', kind, result: S.won ? 'won' : S.lost ? 'lost' : 'abort', surge: S.surge, goal: S.GOAL_SURGES, kills: S.kills, units: S.units.map(u => ({ type: u.type, lvl: u.lvl })) }, '*'); } catch (e) {}
  }

  let scale = 1, ox = 0, oy = 0, userZoom = 1;
  const ZOOM = 0.8;   // base fit (<1 = zoomed out with breathing room); userZoom is the player's pinch/buttons
  function recompute() {
    scale = Math.min(cvs.width / S.W, cvs.height / S.H) * ZOOM * userZoom;
    ox = (cvs.width - S.W * scale) / 2; oy = (cvs.height - S.H * scale) / 2;   // stays centred on the core
  }
  function resize() {
    cvs.width = cvs.clientWidth * devicePixelRatio; cvs.height = cvs.clientHeight * devicePixelRatio;
    recompute();
  }
  function setZoom(z) { userZoom = Math.max(0.6, Math.min(3.5, z)); recompute(); }
  window.addEventListener('resize', resize); resize();
  const X = x => ox + x * scale, Y = y => oy + y * scale;
  const s2wX = sx => (sx * devicePixelRatio - ox) / scale, s2wY = sy => (sy * devicePixelRatio - oy) / scale;

  // ── select + move the placeable pods (bulwark/siege) on the field ──
  let selId = null;
  function pickPod(wx, wy) { let hit = null; for (const u of S.units) if (S.UNITS[u.type].movable && Math.hypot(u.x - wx, u.y - wy) < u.r + 16) hit = u; return hit; }
  function onTap(wx, wy) { const hit = pickPod(wx, wy); if (hit) selId = (selId === hit.id ? null : hit.id); else if (selId && S.units.some(u => u.id === selId)) SWARM.moveUnit(S, selId, wx, wy); else selId = null; }
  cvs.addEventListener('click', e => onTap(s2wX(e.clientX), s2wY(e.clientY)));
  // pinch-to-zoom the battlefield (two fingers); a pinch suppresses the tap
  let pinch = null, pinched = false;
  const dist2 = ts => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
  cvs.addEventListener('touchstart', e => { if (e.touches.length === 2) { pinch = { d: dist2(e.touches), z: userZoom }; pinched = true; } }, { passive: true });
  cvs.addEventListener('touchmove', e => { if (e.touches.length === 2 && pinch) { e.preventDefault(); setZoom(pinch.z * dist2(e.touches) / pinch.d); } }, { passive: false });
  cvs.addEventListener('touchend', e => {
    if (e.touches.length < 2) pinch = null;
    if (pinched) { if (e.touches.length === 0) pinched = false; return; }   // don't tap-place after a pinch
    const t = e.changedTouches && e.changedTouches[0]; if (t) onTap(s2wX(t.clientX), s2wY(t.clientY));
  }, { passive: true });
  // desktop: wheel zooms
  cvs.addEventListener('wheel', e => { e.preventDefault(); setZoom(userZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }, { passive: false });

  // ── input — static buttons wired by id (no rebuild = no eaten clicks) ──
  $('s_hunter').onclick = () => SWARM.summonFlock(S, 'hunter');
  $('s_locust').onclick = () => SWARM.summonFlock(S, 'locust');
  $('s_leech').onclick  = () => SWARM.summonFlock(S, 'leech');
  $('st_guard').onclick = () => SWARM.setStance(S, 'guard');
  $('st_hunt').onclick  = () => SWARM.setStance(S, 'hunt');
  $('st_press').onclick = () => SWARM.setStance(S, 'press');
  $('u_strider').onclick = () => SWARM.fieldUnit(S, 'strider');
  $('u_bulwark').onclick = () => SWARM.fieldUnit(S, 'bulwark');
  $('u_siege').onclick   = () => SWARM.fieldUnit(S, 'siege');
  $('u_glacier').onclick = () => SWARM.fieldUnit(S, 'glacier');
  $('u_conductor').onclick = () => SWARM.fieldUnit(S, 'conductor');
  $('u_reaper').onclick = () => SWARM.fieldUnit(S, 'reaper');
  $('u_fabricator').onclick = () => SWARM.fieldUnit(S, 'fabricator');
  $('u_corefn').onclick = () => SWARM.swapCoreFn(S);
  $('u_core').onclick   = () => SWARM.upgradeCore(S);
  $('u_ammo').onclick   = () => SWARM.swapAmmo(S);
  $('ex_hive').onclick  = () => SWARM.toggleEx(S, 'hive');
  $('ex_flame').onclick = () => SWARM.toggleEx(S, 'flame');
  $('ex_bloom').onclick = () => SWARM.toggleEx(S, 'bloom');
  // zoom + collapse-the-menus (visible in embed too — gameplay, not dev chrome)
  $('zoomin').onclick  = () => setZoom(userZoom * 1.25);
  $('zoomout').onclick = () => setZoom(userZoom / 1.25);
  $('hideui').onclick  = () => document.body.classList.toggle('ui-hidden');
  $('reseed').onclick   = () => { S = newState(); posted = false; lastLogLen = -1; };
  $('mode').onclick     = () => { laneMode = !laneMode; S = newState(); posted = false; lastLogLen = -1; };
  $('draft-cards').addEventListener('click', e => { const c = e.target.closest('[data-draft]'); if (c) SWARM.pickDraft(S, c.dataset.draft); });
  $('draft-skip').onclick = () => SWARM.pickDraft(S, null);

  // ── embed: strip the dev chrome; the end-overlay button returns to the campaign ──
  if (EMBED) {
    ['mode', 'reseed'].forEach(id => { const b = $(id); if (b) b.style.display = 'none'; });
    const exrail = $('exrail'); if (exrail) exrail.style.display = 'none';   // adaptations come from the roster (auto-applied), not demo toggles
    const brandSub = document.querySelector('.brand .dim'); if (brandSub) brandSub.style.display = 'none';   // drop the "swarm proof" dev tag in-world
    const r2 = $('reseed2'); if (r2) { r2.removeAttribute('onclick'); r2.textContent = '⏎ RETURN TO TERMINAL'; r2.onclick = () => postResult('return'); }
  }

  // ── render ──
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, cvs.width, cvs.height);
    const cx = X(S.core.x), cy = Y(S.core.y);

    // faint vision ring
    ctx.strokeStyle = 'rgba(120,150,200,0.10)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, S.viewR * scale, 0, 7); ctx.stroke();

    // ── lanes (dim paths; the fog veils the far ends) ──
    if (S.laneMode) S.lanes.forEach((lane, li) => {
      const active = S.waveLanes.indexOf(li) >= 0;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = active ? 'rgba(255,80,80,0.09)' : 'rgba(255,176,0,0.035)'; ctx.lineWidth = 46 * scale;
      ctx.beginPath(); lane.pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](X(p.x), Y(p.y))); ctx.stroke();
      ctx.strokeStyle = active ? 'rgba(255,120,90,0.26)' : 'rgba(255,176,0,0.10)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); lane.pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](X(p.x), Y(p.y))); ctx.stroke();
    });

    // ── enemies (drawn UNDER the fog so distant ones are veiled) ──
    S.enemies.forEach(e => {
      const x = X(e.x), y = Y(e.y), def = S.ENEMIES[e.type], a = e.fade;
      const flash = e.hitT && (S.t - e.hitT < 0.08);
      const ang = Math.atan2(S.core.y - e.y, S.core.x - e.x);
      ctx.globalAlpha = a;
      let col = flash ? '#ffffff' : e.color;
      if (!flash) {
        if (e.frozen > 0) col = '#bfe8ff';                                         // frozen solid
        else if (e.chill > 0) col = blend(e.color, '#8fd4ff', Math.min(0.65, e.chill / 100));  // chilled
        else if (e.poison > 0) col = blend(e.color, '#76e08a', Math.min(0.6, e.poison / 60));  // poisoned
      }
      ctx.fillStyle = col; ctx.strokeStyle = '#05060a'; ctx.lineWidth = 1.5;
      const r = def.r * scale * (flash ? 1.3 : 1), T = e.type;
      ctx.save(); ctx.translate(x, y);
      if (T === 'enforcer') {                         // hexagon + ring (tanky heavy)
        ctx.rotate(ang);
        ctx.beginPath(); for (let i = 0; i < 6; i++) { const aa = i / 6 * Math.PI * 2 + 0.5; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(aa) * r, Math.sin(aa) * r); } ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = col; ctx.globalAlpha = a * 0.5; ctx.beginPath(); ctx.arc(0, 0, r + 4 * scale, 0, 7); ctx.stroke();
      } else if (T === 'rusher') {                    // sleek fast dart
        ctx.rotate(ang); if (!flash) { ctx.shadowColor = col; ctx.shadowBlur = 7; }
        ctx.beginPath(); ctx.moveTo(r * 1.6, 0); ctx.lineTo(-r * 0.8, -r * 0.7); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.8, r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      } else if (T === 'ward') {                       // diamond bastion (shield bubble drawn after)
        ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(0, -r); ctx.lineTo(-r, 0); ctx.lineTo(0, r); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (T === 'splitter') {                   // 3-lobe blob, slowly tumbling
        ctx.rotate(S.t * 0.6 + e.x * 0.01); for (let i = 0; i < 3; i++) { const aa = i / 3 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(aa) * r * 0.5, Math.sin(aa) * r * 0.5, r * 0.62, 0, 7); ctx.fill(); ctx.stroke(); }
      } else if (T === 'disruptor') {                  // pulsing orb + inner ring
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
        const p2 = 0.5 + 0.5 * Math.sin(S.t * 5); ctx.strokeStyle = col; ctx.globalAlpha = a * (0.3 + p2 * 0.35); ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, 7); ctx.stroke();
      } else if (T === 'juggernaut') {                  // BOSS — spiked armored core with a pulsing heart
        ctx.rotate(ang); ctx.fillStyle = col;
        for (let i = 0; i < 8; i++) { const aa = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(aa) * r, Math.sin(aa) * r); ctx.lineTo(Math.cos(aa + 0.13) * r * 1.5, Math.sin(aa + 0.13) * r * 1.5); ctx.lineTo(Math.cos(aa + 0.26) * r, Math.sin(aa + 0.26) * r); ctx.closePath(); ctx.fill(); }
        ctx.beginPath(); for (let i = 0; i < 8; i++) { const aa = i / 8 * Math.PI * 2; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(aa) * r, Math.sin(aa) * r); } ctx.closePath(); ctx.fill(); ctx.stroke();
        const p2 = 0.5 + 0.5 * Math.sin(S.t * 4); ctx.fillStyle = '#fff'; ctx.globalAlpha = a * (0.4 + p2 * 0.4); ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      } else {                                        // probe + spawnling = SHARD (crystalline splinter)
        ctx.rotate(S.t * 0.9 + e.x * 0.013); if (!flash) { ctx.shadowColor = col; ctx.shadowBlur = 6; }
        const R = r * 1.5, SP = [[0, -1.3], [0.4, -0.3], [1.0, 0.08], [0.3, 0.4], [0.08, 1.3], [-0.36, 0.34], [-0.96, 0.18], [-0.4, -0.36]];
        ctx.beginPath(); SP.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p[0] * R, p[1] * R)); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      }
      ctx.restore();
      if ((T === 'ward' || T === 'juggernaut') && e.shield > 0 && !flash) { ctx.strokeStyle = '#bfe8ff'; ctx.globalAlpha = a * (0.3 + 0.45 * (e.shield / e.shieldMax)); ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.arc(x, y, (def.r + 6) * scale, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }   // shield bubble
      if (T === 'disruptor' && !flash) { ctx.strokeStyle = 'rgba(192,96,255,0.16)'; ctx.lineWidth = 1.2 * scale; ctx.beginPath(); ctx.arc(x, y, def.jam * scale, 0, 7); ctx.stroke(); }   // jam field
      if ((T === 'probe' || T === 'spawnling') && !flash) { ctx.fillStyle = '#ffe0d6'; ctx.beginPath(); ctx.arc(x, y, r * 0.34, 0, 7); ctx.fill(); }   // shard core glint
      if (e.poison > 0 && !flash) { ctx.fillStyle = '#9affb0'; for (let i = 0; i < 2; i++) { const pa = S.t * 4 + i * 3 + e.x; ctx.globalAlpha = a * 0.5; ctx.fillRect(x + Math.cos(pa) * r, y + Math.sin(pa) * r, 1.6 * scale, 1.6 * scale); } }
      if (e.frozen > 0 && !flash) { ctx.strokeStyle = '#e6f7ff'; ctx.globalAlpha = a * 0.85; ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 0; i < 6; i++) { const fa = i / 6 * Math.PI * 2 + 0.4, px = x + Math.cos(fa) * (r + 3 * scale), py = y + Math.sin(fa) * (r + 3 * scale); ctx[i ? 'lineTo' : 'moveTo'](px, py); } ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1; }
      const hpf = e.hp / e.maxHp;
      if (hpf < 0.999) { const w = (def.r * 2.4) * scale; ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2, y - r - 6 * scale, w, 3 * scale); ctx.fillStyle = hpf > 0.5 ? '#76e08a' : hpf > 0.25 ? '#e0913f' : '#ff5050'; ctx.fillRect(x - w / 2, y - r - 6 * scale, w * hpf, 3 * scale); }
      ctx.globalAlpha = 1;
    });

    // ── core-gun projectiles ──
    S.shots.forEach(sh => {
      const x = X(sh.x), y = Y(sh.y); ctx.fillStyle = sh.color; ctx.shadowColor = sh.color; ctx.shadowBlur = sh.rocket ? 11 : 7;
      if (sh.rocket) {                                          // a flaring rocket with an exhaust tail
        const a = Math.atan2(sh.ty - sh.y, sh.tx - sh.x);
        ctx.strokeStyle = sh.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 3 * scale; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(a) * 17 * scale, y - Math.sin(a) * 17 * scale); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.beginPath(); ctx.arc(x, y, (sh.rocket ? 5 : sh.bomblet ? 2.6 : sh.splash ? 5.2 : 3.4) * scale, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    });

    // ── fog veil: darkness closes in past the vision ring ──
    const g = ctx.createRadialGradient(cx, cy, S.viewR * scale * 0.74, cx, cy, S.viewR * scale * 1.2);
    g.addColorStop(0, 'rgba(5,6,10,0)'); g.addColorStop(1, 'rgba(5,6,10,0.94)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cvs.width, cvs.height);

    // ── surge telegraph (over the fog) ──
    if (S.laneMode) {                                          // light the active lanes (where the surge pours in) + spawn arrows
      const pulse = 0.5 + 0.5 * Math.sin(S.t * 5);
      S.waveLanes.forEach(li => {
        const lane = S.lanes[li]; if (!lane) return;
        ctx.strokeStyle = `rgba(255,80,80,${0.16 + pulse * 0.16})`; ctx.lineWidth = 2.4 * scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); lane.pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](X(p.x), Y(p.y))); ctx.stroke();
        const sp = lane.pts[0], sx = X(sp.x), sy = Y(sp.y), nx = lane.pts[1] || S.core;
        ctx.strokeStyle = `rgba(255,80,80,${0.5 + pulse * 0.4})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(sx, sy, (10 + pulse * 3) * scale, 0, 7); ctx.stroke();
        const a = Math.atan2(Y(nx.y) - sy, X(nx.x) - sx), as = 9 * scale; ctx.fillStyle = '#ff5050'; ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(as * 1.7, 0); ctx.lineTo(-as * 0.4, -as); ctx.lineTo(-as * 0.4, as); ctx.closePath(); ctx.fill(); ctx.restore();
      });
    } else if (S.warn) {
      const pulse = 0.5 + 0.5 * Math.sin(S.t * 8), r = (S.viewR + 60) * scale;
      ctx.strokeStyle = `rgba(255,70,70,${0.4 + pulse * 0.5})`; ctx.lineWidth = 5 * scale;
      ctx.beginPath(); ctx.arc(cx, cy, r, S.warn.ang - 0.5, S.warn.ang + 0.5); ctx.stroke();
      const ax = cx + Math.cos(S.warn.ang) * r, ay = cy + Math.sin(S.warn.ang) * r;
      ctx.fillStyle = '#ff4646'; ctx.save(); ctx.translate(ax, ay); ctx.rotate(S.warn.ang + Math.PI); const as = 10 * scale;
      ctx.beginPath(); ctx.moveTo(as, 0); ctx.lineTo(-as * 0.5, -as); ctx.lineTo(-as * 0.5, as); ctx.closePath(); ctx.fill(); ctx.restore();
    }

    // ── swarm flocks (yours — always visible, even in the dark) ──
    S.flocks.forEach(f => {
      const fx = X(f.cx), fy = Y(f.cy);
      ctx.fillStyle = f.color; ctx.globalAlpha = 0.05; ctx.beginPath(); ctx.arc(fx, fy, 44 * scale, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      f.dots.forEach(d => {
        const x = X(d.x), y = Y(d.y);
        ctx.fillStyle = f.color; ctx.globalAlpha = 0.22; ctx.beginPath(); ctx.arc(x, y, 4.7 * scale, 0, 7); ctx.fill();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, 2.5 * scale, 0, 7); ctx.fill();
      });
      ctx.globalAlpha = 0.55; ctx.fillStyle = f.color; ctx.font = `${Math.round(10 * scale)}px monospace`; ctx.textAlign = 'center';
      ctx.fillText(`${f.type}·${f.dots.length}`, fx, fy - 44 * scale); ctx.globalAlpha = 1;
    });

    // ── beams (hero rail / flame cone) ──
    S.beams.forEach(b => {
      const al = Math.min(1, b.life / 0.14);
      if (b.cone) {
        ctx.fillStyle = b.color; ctx.globalAlpha = al * 0.32;
        ctx.beginPath(); ctx.moveTo(X(b.x1), Y(b.y1));
        ctx.arc(X(b.x1), Y(b.y1), 232 * scale, b.ang - 0.5, b.ang + 0.5); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = al; ctx.strokeStyle = b.color; ctx.shadowColor = b.color; ctx.shadowBlur = 10; ctx.lineCap = 'round';
        ctx.lineWidth = (b.rail ? 3 : 2) * scale; ctx.beginPath(); ctx.moveTo(X(b.x1), Y(b.y1)); ctx.lineTo(X(b.x2), Y(b.y2)); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    });

    // ── impact / death bursts ──
    S.bursts.forEach(b => {
      const f = 1 - b.life / (b.ring ? 0.5 : 0.42), x = X(b.x), y = Y(b.y);
      ctx.globalAlpha = Math.max(0, b.life / 0.5); ctx.strokeStyle = b.color; ctx.shadowColor = b.color; ctx.shadowBlur = 8;
      ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.arc(x, y, ((b.big ? 8 : 4) + f * (b.ring ? 60 : 18)) * scale, 0, 7); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    });

    // ── freezing shockwaves (glacier thump) ──
    (S.waves || []).forEach(w => {
      const x = X(w.x), y = Y(w.y), f = w.r / w.maxR, al = Math.max(0, 1 - f);
      ctx.strokeStyle = '#bfe8ff'; ctx.shadowColor = '#bfe8ff'; ctx.shadowBlur = 10;
      ctx.globalAlpha = al * 0.8; ctx.lineWidth = 4 * scale; ctx.beginPath(); ctx.arc(x, y, w.r * scale, 0, 7); ctx.stroke();
      ctx.globalAlpha = al * 0.35; ctx.lineWidth = 1.5 * scale; ctx.beginPath(); ctx.arc(x, y, Math.max(0, w.r - 11) * scale, 0, 7); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    });

    // ── pods ──
    S.units.forEach(drawUnit);

    // selected movable pod — highlight ring + dashed line to its move destination + a crosshair marker
    if (selId) {
      const u = S.units.find(o => o.id === selId);
      if (!u) selId = null;
      else {
        const ux = X(u.x), uy = Y(u.y), pulse = 0.5 + 0.5 * Math.sin(S.t * 6);
        ctx.strokeStyle = `rgba(255,255,255,${0.5 + pulse * 0.4})`; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.arc(ux, uy, (u.r + 11) * scale, 0, 7); ctx.stroke();
        if (u.moveTo && Math.hypot(u.moveTo.x - u.x, u.moveTo.y - u.y) > 8) {
          const mx = X(u.moveTo.x), my = Y(u.moveTo.y), k = 7 * scale;
          ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2 * scale; ctx.setLineDash([5 * scale, 5 * scale]); ctx.lineDashOffset = -S.t * 30;
          ctx.beginPath(); ctx.moveTo(ux, uy); ctx.lineTo(mx, my); ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = u.color; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.moveTo(mx - k, my); ctx.lineTo(mx + k, my); ctx.moveTo(mx, my - k); ctx.lineTo(mx, my + k); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(mx, my, k, 0, 7); ctx.stroke();
        }
      }
    }

    // ── core ──
    if (S.core.markId) {                                       // MARK — a rotating reticle on the designated target + a designator line
      const e = S.enemies.find(o => o.id === S.core.markId);
      if (e) {
        const ex = X(e.x), ey = Y(e.y), rr = (S.ENEMIES[e.type].r + 11) * scale;
        ctx.strokeStyle = 'rgba(255,210,74,0.28)'; ctx.lineWidth = 1 * scale; ctx.setLineDash([4 * scale, 5 * scale]); ctx.lineDashOffset = -S.t * 24;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2 * scale; ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 6;
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(S.t * 1.6);
        for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(rr, -rr * 0.45); ctx.lineTo(rr, -rr); ctx.lineTo(rr * 0.45, -rr); ctx.stroke(); }
        ctx.restore(); ctx.shadowBlur = 0;
      }
    }
    if (S.core.fn === 'slow') { const R = (150 + S.core.lvl * 22) * scale; ctx.fillStyle = 'rgba(127,168,201,0.05)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(127,168,201,0.28)'; ctx.lineWidth = 1.5 * scale; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke(); }
    else if (S.core.fn === 'aura') { const R = (150 + S.core.lvl * 22) * scale; ctx.strokeStyle = 'rgba(255,176,0,0.16)'; ctx.lineWidth = 1.5 * scale; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke(); }
    const pulse = 0.5 + 0.5 * Math.sin(S.t * 3), cr = 34 * scale, hpf = S.core.hp / S.core.maxHp;
    ctx.strokeStyle = hpf > 0.4 ? 'rgba(255,176,0,0.35)' : 'rgba(255,80,80,0.6)'; ctx.lineWidth = 3.5 * scale;
    ctx.beginPath(); ctx.arc(cx, cy, cr + 11 * scale, -Math.PI / 2, -Math.PI / 2 + hpf * 7); ctx.stroke();
    // GYRO-CORE — an optic in nested rotating gimbal rings (from the saved unit concepts).
    const low = hpf <= 0.4;
    const cMain = low ? '#ff5a5a' : '#ffb000', cAcc = low ? '#ffd0d0' : '#ffd24a', cEye = low ? '#ffe2e2' : '#fff3d0';
    for (let k = 0; k < 3; k++) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(S.t * (0.5 + k * 0.4) + k * 2.1);
      ctx.strokeStyle = cMain; ctx.globalAlpha = 0.85 - k * 0.16; ctx.lineWidth = 2.4 * scale;
      ctx.beginPath(); ctx.ellipse(0, 0, cr * 0.92, cr * 0.92 * (0.32 + k * 0.16), 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = cAcc; ctx.shadowColor = cMain; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(cr * 0.92, 0, 2.6 * scale, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#140e06'; ctx.strokeStyle = cMain; ctx.lineWidth = 2 * scale;   // hub
    ctx.beginPath(); ctx.arc(cx, cy, cr * 0.42, 0, 7); ctx.fill(); ctx.stroke();
    ctx.shadowColor = cMain; ctx.shadowBlur = 14 + pulse * 12;                        // the optic / eye
    ctx.fillStyle = cEye; ctx.beginPath(); ctx.arc(cx, cy, cr * 0.26 * (0.85 + pulse * 0.2), 0, 7); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#140e06'; ctx.beginPath(); ctx.arc(cx, cy, cr * 0.12, 0, 7); ctx.fill();

    // ── boss health bar (top) while the JUGGERNAUT lives ──
    const boss = S.enemies.find(e => e.type === 'juggernaut');
    if (boss) {
      const dpr = devicePixelRatio, bw = Math.min(cvs.width * 0.5, 760), bx = (cvs.width - bw) / 2, by = 76 * dpr, bh = 15 * dpr;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#ff2884'; ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), bh);
      if (boss.shield > 0) { ctx.fillStyle = '#bfe8ff'; ctx.fillRect(bx, by - 5 * dpr, bw * (boss.shield / boss.shieldMax), 4 * dpr); }
      ctx.strokeStyle = '#ff2884'; ctx.lineWidth = 1 * dpr; ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = '#fff'; ctx.font = `${Math.round(12 * dpr)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('◈ JUGGERNAUT', cvs.width / 2, by + bh / 2); ctx.textBaseline = 'alphabetic';
    }
  }

  function drawUnit(u) {
    if (u.behavior === 'anchor') drawBulwark(u);
    else if (u.behavior === 'artillery') drawSiege(u);
    else if (u.behavior === 'support') drawConductor(u);
    else if (u.behavior === 'reaper') drawReaper(u);
    else if (u.behavior === 'fabricator') drawFabricator(u);
    else { drawWalker(u); }                                     // striker (strider) + cryo (glacier) both walk
  }
  function drawConductor(u) {                                   // CONDUCTOR — a RESONATOR FORK emitter + pulsing overclock aura + links to buffed flocks
    const x = X(u.x), y = Y(u.y), aim = u.aim || 0, tp = (S.t * 0.6) % 1, jy = y + 4 * scale;
    ctx.strokeStyle = u.color; ctx.globalAlpha = (1 - tp) * 0.3; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.arc(x, y, (40 + tp * 195) * scale, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.strokeStyle = u.color; ctx.globalAlpha = 0.4; ctx.lineWidth = 1 * scale; ctx.setLineDash([3 * scale, 4 * scale]); ctx.lineDashOffset = -S.t * 20;   // overclock links
    S.flocks.forEach(f => { if (f.buff) { ctx.beginPath(); ctx.moveTo(x, jy); ctx.lineTo(X(f.cx), Y(f.cy)); ctx.stroke(); } });
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#8a6ec0'; ctx.lineWidth = 4.5 * scale; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y + 18 * scale); ctx.lineTo(x, jy); ctx.stroke();   // stem
    [[-13, -19], [0, -22], [13, -19]].forEach(([dx, dy]) => {                  // 3 prongs + glowing tips
      ctx.strokeStyle = '#d9ccff'; ctx.lineWidth = 3.4 * scale; ctx.beginPath(); ctx.moveTo(x, jy); ctx.lineTo(x + dx * scale, y + dy * scale); ctx.stroke();
      ctx.fillStyle = u.color; ctx.shadowColor = u.color; ctx.shadowBlur = 7; ctx.beginPath(); ctx.arc(x + dx * scale, y + dy * scale, 3.6 * scale, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    });
    ctx.strokeStyle = '#f4ecff'; ctx.globalAlpha = 0.55 + 0.45 * Math.sin(S.t * 13); ctx.lineWidth = 1.5 * scale;   // arcing energy across the prongs
    ctx.beginPath(); ctx.moveTo(x - 13 * scale, y - 19 * scale); ctx.lineTo(x - 5 * scale, y - 13 * scale + Math.sin(S.t * 22) * 3 * scale); ctx.lineTo(x + 5 * scale, y - 16 * scale); ctx.lineTo(x + 13 * scale, y - 19 * scale); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#140e28'; ctx.strokeStyle = u.color; ctx.lineWidth = 1.5 * scale; ctx.beginPath(); ctx.arc(x, jy, 8 * scale, 0, 7); ctx.fill(); ctx.stroke();   // optic hub at the junction
    unitEye(x, jy, aim, 9 * scale, '#efe2ff');
    unitTag(u, x, y, 22 * scale, 0);
  }
  function drawReaper(u) {                                      // REAPER — a sleek green dart with a scythe arc + glowing optic
    const x = X(u.x), y = Y(u.y), aim = u.aim || 0, R = 12 * scale;
    ctx.save(); ctx.translate(x, y); ctx.rotate(aim);
    ctx.shadowColor = u.color; ctx.shadowBlur = 9; ctx.fillStyle = u.color; ctx.strokeStyle = '#0a1a12'; ctx.lineWidth = 1.5 * scale;
    ctx.beginPath(); ctx.moveTo(R * 1.4, 0); ctx.lineTo(-R * 0.7, -R * 0.9); ctx.lineTo(-R * 0.1, 0); ctx.lineTo(-R * 0.7, R * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#dffaf0'; ctx.lineWidth = 2 * scale; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(-R * 0.1, -R * 0.2, R * 0.95, -1.4, 0.25); ctx.stroke();
    ctx.fillStyle = '#0a1a12'; ctx.beginPath(); ctx.arc(R * 0.25, 0, R * 0.42, 0, 7); ctx.fill();
    ctx.fillStyle = '#eafff5'; ctx.shadowColor = u.color; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(R * 0.3, 0, R * 0.18, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.restore();
    unitTag(u, x, y, R + 2 * scale, 0);
  }
  function drawFabricator(u) {                                  // FABRICATOR — a big slow 6-legged carrier; drones brood on its dome
    const x = X(u.x), y = Y(u.y), aim = u.aim || 0, R = u.r * scale, walk = u.walk || 0;
    ctx.strokeStyle = '#8a6e1e'; ctx.lineWidth = 2.8 * scale; ctx.lineCap = 'round';   // 6 legs
    for (let i = 0; i < 6; i++) {
      const la = i / 6 * Math.PI * 2 + 0.3, step = Math.sin(walk * 2 + i * 1.0) * 2.5 * scale;
      const hx = x + Math.cos(la) * R * 0.8, hy = y + Math.sin(la) * R * 0.8;
      const fx = x + Math.cos(la) * (R + 20 * scale), fy = y + Math.sin(la) * (R + 20 * scale) + step;
      const kx = (hx + fx) / 2 + Math.cos(la) * 3 * scale, ky = (hy + fy) / 2 - 6 * scale;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }
    ctx.fillStyle = '#2a2208'; ctx.strokeStyle = '#0a0805'; ctx.lineWidth = 2 * scale;   // domed nest body
    ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill(); ctx.stroke();
    ctx.shadowColor = u.color; ctx.shadowBlur = 5; ctx.fillStyle = u.color;              // drones brooding ON the dome
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + walk * 0.25, rr = R * (0.62 + (i % 3) * 0.13); ctx.globalAlpha = 0.5 + 0.4 * Math.sin(S.t * 3 + i); ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 2.3 * scale, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    unitEye(x, y, aim, R * 0.5, '#fff0b0');
    unitTag(u, x, y, R + 4 * scale, 0);
  }
  // shared bits: a single big glowing EYE, an mk label, an hp bar
  function unitEye(x, y, aim, R, eyeC) {
    ctx.fillStyle = '#100a04'; ctx.beginPath(); ctx.arc(x + Math.cos(aim) * 4 * scale, y + Math.sin(aim) * 4 * scale, R * 0.6, 0, 7); ctx.fill();
    ctx.shadowColor = eyeC; ctx.shadowBlur = 8; ctx.fillStyle = eyeC;
    ctx.beginPath(); ctx.arc(x + Math.cos(aim) * 5 * scale, y + Math.sin(aim) * 5 * scale, R * 0.3, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  }
  function unitTag(u, x, y, R, bob) {
    ctx.fillStyle = u.color; ctx.font = `${Math.round(9 * scale)}px monospace`; ctx.textAlign = 'center'; ctx.fillText('mk' + u.lvl, x, y - R - 9 * scale - bob);
    const w = 30 * scale, f = u.hp / u.maxHp; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2, y + R + 6 * scale, w, 3.2 * scale); ctx.fillStyle = f > 0.4 ? u.color : '#ff5050'; ctx.fillRect(x - w / 2, y + R + 6 * scale, w * f, 3.2 * scale);
  }
  function drawWalker(u) {                                      // STRIDER / GLACIER — a tripedal walker that roams + fires
    const cryo = u.behavior === 'cryo';
    const x = X(u.x), y = Y(u.y), aim = u.aim || 0, walk = u.walk || 0, R = (cryo ? 14 : 13) * scale;
    const slam = cryo && u.thumpT > 0 ? Math.sin((1 - u.thumpT / 0.32) * Math.PI) * 6 * scale : 0;   // body dips on the thump
    const bob = Math.sin(walk * 2) * 1.7 * scale - slam;
    ctx.strokeStyle = cryo ? '#5fa8d6' : '#9a5e36'; ctx.lineWidth = 2.6 * scale; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const la = aim + Math.PI + (i - 1) * 1.05, step = Math.sin(walk * 2 + i * 2.094);
      const lift = Math.max(0, step) * 6 * scale, reach = (25 + step * 7) * scale;
      const hx = x + Math.cos(la) * R * 0.7, hy = y + Math.sin(la) * R * 0.7 - bob, fx = x + Math.cos(la) * reach, fy = y + Math.sin(la) * reach - lift;
      const kx = (hx + fx) / 2 + Math.cos(la) * 2 * scale, ky = (hy + fy) / 2 - 5 * scale;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }
    ctx.fillStyle = u.color; ctx.strokeStyle = '#0a0805'; ctx.lineWidth = 1.5 * scale;
    ctx.beginPath(); ctx.arc(x, y - bob, R, 0, 7); ctx.fill(); ctx.stroke();
    unitEye(x, y - bob, aim, R, cryo ? '#dffaff' : (S.ex.flame ? '#ff8a3a' : '#ffd9a0'));
    unitTag(u, x, y, R, bob);
  }
  function drawBulwark(u) {                                     // BULWARK — an 8-legged planted bastion + shield ring
    const x = X(u.x), y = Y(u.y), aim = u.aim || 0, R = u.r * scale, walk = u.walk || 0;
    ctx.strokeStyle = 'rgba(200,178,122,0.22)'; ctx.lineWidth = 1.6 * scale; ctx.beginPath(); ctx.arc(x, y, R + 30 * scale, 0, 7); ctx.stroke();  // the block/grind zone — enemies pile up here
    ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 2.4 * scale; ctx.lineCap = 'round';   // 8 legs splayed out (subtle idle shuffle)
    for (let i = 0; i < 8; i++) {
      const la = i / 8 * Math.PI * 2 + 0.2, step = Math.sin(walk * 2 + i * 0.9) * 2 * scale;
      const hx = x + Math.cos(la) * R * 0.78, hy = y + Math.sin(la) * R * 0.78;
      const fx = x + Math.cos(la) * (R + 17 * scale), fy = y + Math.sin(la) * (R + 17 * scale) + step;
      const kx = (hx + fx) / 2 + Math.cos(la) * 3 * scale, ky = (hy + fy) / 2 - 5 * scale;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }
    ctx.fillStyle = u.color; ctx.strokeStyle = '#0a0805'; ctx.lineWidth = 2 * scale;   // hex carapace + inner plate
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, px = x + Math.cos(a) * R, py = y + Math.sin(a) * R; ctx[i ? 'lineTo' : 'moveTo'](px, py); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a1206'; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, px = x + Math.cos(a) * R * 0.64, py = y + Math.sin(a) * R * 0.64; ctx[i ? 'lineTo' : 'moveTo'](px, py); } ctx.closePath(); ctx.fill();
    unitEye(x, y, aim, R * 0.74, '#ffe3b0');
    unitTag(u, x, y, R + 4 * scale, 0);
  }
  function drawSiege(u) {                                       // SIEGE — heavy stationary mortar-form, one big upturned eye
    const x = X(u.x), y = Y(u.y), aim = u.aim || 0, R = u.r * scale;
    ctx.fillStyle = '#241509'; ctx.strokeStyle = '#0a0805'; ctx.lineWidth = 2 * scale;
    ctx.beginPath(); ctx.moveTo(x - R * 1.2, y + R * 0.8); ctx.lineTo(x + R * 1.2, y + R * 0.8); ctx.lineTo(x + R * 0.7, y - R * 0.4); ctx.lineTo(x - R * 0.7, y - R * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();  // wide base
    ctx.fillStyle = u.color; ctx.beginPath(); ctx.arc(x, y - R * 0.2, R * 0.85, 0, 7); ctx.fill(); ctx.stroke();
    unitEye(x, y - R * 0.2, aim, R * 0.85, '#ffd0a0');
    unitTag(u, x, y, R, 0);
  }

  function blend(a, b, t) { const pa = hx(a), pb = hx(b); return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(pa[1] + (pb[1] - pa[1]) * t)},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`; }
  function hx(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }

  // ── UI (update text/classes only — never rebuild a button) ──
  function ui() {
    $('compute').textContent = Math.floor(S.compute);
    $('corehp').textContent = Math.ceil(S.core.hp);
    const cb = $('corebar'); cb.style.width = Math.max(0, S.core.hp / S.core.maxHp * 100) + '%'; cb.style.background = S.core.hp / S.core.maxHp < 0.35 ? '#ff5050' : 'var(--amber)';
    $('threat').textContent = Math.round(S.threat);
    $('surge').textContent = S.surge + ' / ' + S.GOAL_SURGES;
    $('mode').textContent = 'MODE: ' + (laneMode ? 'LANES' : 'OPEN');

    ['hunter', 'locust', 'leech'].forEach(t => { aff('s_' + t, S.SWARMS[t].cost); $('s_' + t).style.display = S.unlocked[t] ? '' : 'none'; });
    ['strider', 'bulwark', 'siege', 'glacier', 'conductor', 'reaper', 'fabricator'].forEach(unitBtn);
    const FNDESC = { mark: 'paints the biggest threat — your army hits it harder', slow: 'slows enemies near the core', aura: 'pulses AoE damage around the core', drones: 'passively prints a free brood' };
    $('corefn_n').textContent = 'CORE: ' + S.core.fn.toUpperCase();
    $('corefn_d').textContent = FNDESC[S.core.fn] + ' — tap to cycle';
    const cc = SWARM.coreCost(S); aff('u_core', cc); $('core_c').textContent = '⚡' + cc; $('core_d').textContent = `v${S.core.lvl} · stronger`;
    $('u_ammo').style.display = S.core.fn === 'turret' ? '' : 'none';
    $('ammo_n').textContent = 'AMMO: ' + S.core.ammo.toUpperCase(); $('ammo_d').textContent = S.AMMO[S.core.ammo].desc + ' — tap to swap';

    $('st_guard').classList.toggle('on', S.stance === 'guard'); $('st_hunt').classList.toggle('on', S.stance === 'hunt'); $('st_press').classList.toggle('on', S.stance === 'press');
    $('ex_hive').classList.toggle('on', S.ex.hive); $('ex_flame').classList.toggle('on', S.ex.flame); $('ex_bloom').classList.toggle('on', S.ex.bloom);

    const hp = $('hero');
    if (S.units.length) { hp.style.display = 'block'; hp.innerHTML = S.units.map(u => `<div class="hn" style="color:${u.color}">${u.type.toUpperCase()} · mk${u.lvl}</div><div style="color:var(--mid);margin-bottom:5px">hp ${Math.ceil(u.hp)}/${u.maxHp}${u.dmg ? ` · dmg ${u.dmg}` : ''}${u.type === 'strider' && S.ex.flame ? ' · flame' : ''}</div>`).join(''); }
    else hp.style.display = 'none';

    if (S.log.length !== lastLogLen) { const l = $('log'); l.innerHTML = S.log.slice(-6).map(m => `<div>${m}</div>`).join(''); l.scrollTop = l.scrollHeight; lastLogLen = S.log.length; }

    const dr = $('draft');                                // research draft (pauses the board)
    if (S.draft) {
      const sig = S.draft.picks.join(',');
      if (sig !== lastDraftSig) {
        lastDraftSig = sig;
        $('draft-cards').innerHTML = S.draft.picks.map(t => {
          const isU = !!S.UNITS[t], def = isU ? S.UNITS[t] : S.SWARMS[t];
          return `<button class="draftcard" data-draft="${t}" style="--c:${def.color}"><div class="dc-tag">${isU ? 'POD' : 'SWARM'}</div><div class="dc-name">${def.name.toUpperCase()}</div><div class="dc-desc">${isU ? def.role : def.desc}</div><div class="dc-cost">⚡${def.cost}</div></button>`;
        }).join('');
      }
      dr.style.display = 'flex';
    } else { lastDraftSig = ''; dr.style.display = 'none'; }

    const ov = $('overlay');
    if (S.won || S.lost) {
      ov.style.display = 'flex'; ov.className = S.won ? 'win' : 'lose';
      $('ov-title').textContent = S.won ? 'NODE SECURED' : 'CORE BREACHED';
      $('ov-sub').innerHTML = `reached surge ${S.surge}/${S.GOAL_SURGES} &middot; ${S.kills} kills<br>`
        + `pods: ${S.units.map(u => u.type + ' mk' + u.lvl).join(', ') || '—'} &middot; ${S.flocks.length} swarms<br>`
        + `<span style="color:var(--mid)">${EMBED ? (S.won ? 'the intrusion is purged — return to the terminal' : 'they broke through — fall back to the terminal') : 'a fresh node every run — no carry-over'}</span>`;
    } else ov.style.display = 'none';
  }
  function aff(id, cost) { $(id).classList.toggle('noafford', S.compute < cost); }
  function unitBtn(type) {
    const d = S.UNITS[type], ex = S.units.find(u => u.type === type), cost = SWARM.unitCost(S, type);
    $(type + '_n').textContent = ex ? `REFIT ${d.name.toUpperCase()} → mk${ex.lvl + 1}` : `DEPLOY ${d.name.toUpperCase()}`;
    $(type + '_c').textContent = '⚡' + cost;
    const btn = $('u_' + type); btn.classList.toggle('noafford', S.compute < cost); btn.classList.toggle('owned', !!ex);
    btn.style.display = S.unlocked[type] ? '' : 'none';   // hidden until drafted
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!S.draft) SWARM.tick(S, dt);   // a draft pauses the board
    if (EMBED && !posted && (S.won || S.lost)) { posted = true; postResult('result'); }   // tell the campaign the moment it resolves
    draw(); ui();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__sw = { state: () => S };
})();
