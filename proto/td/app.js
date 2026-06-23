// ── TD proof: renderer + input + UI (DOM/canvas side; sim.js stays pure) ──────
(function () {
  const cvs = document.getElementById('field'), ctx = cvs.getContext('2d');
  const $ = id => document.getElementById(id);
  let S = TD.create((Math.random() * 1e9) | 0);
  let armed = null, selId = null, mouse = { x: 0, y: 0, on: false }, last = performance.now(), lastInspSig = '';

  let scale = 1, ox = 0, oy = 0;
  function resize() {
    cvs.width = cvs.clientWidth * devicePixelRatio; cvs.height = cvs.clientHeight * devicePixelRatio;
    scale = Math.min(cvs.width / S.W, cvs.height / S.H) * 0.98;
    ox = (cvs.width - S.W * scale) / 2; oy = (cvs.height - S.H * scale) / 2;
  }
  window.addEventListener('resize', resize); resize();
  const w2sX = x => ox + x * scale, w2sY = y => oy + y * scale;
  const s2wX = sx => (sx * devicePixelRatio - ox) / scale, s2wY = sy => (sy * devicePixelRatio - oy) / scale;

  // ── input ──
  cvs.addEventListener('mousemove', e => { mouse.x = s2wX(e.clientX); mouse.y = s2wY(e.clientY); mouse.on = true; });
  cvs.addEventListener('mouseleave', () => mouse.on = false);
  cvs.addEventListener('click', e => {
    const wx = s2wX(e.clientX), wy = s2wY(e.clientY);
    if (armed) { TD.placeTower(S, armed, wx, wy); return; }
    // select a tower
    let best = null, bd = 28; S.towers.forEach(t => { const d = Math.hypot(t.x - wx, t.y - wy); if (d < bd) { bd = d; best = t; } });
    selId = best ? best.id : null;
  });
  // touch: tap to place/select
  cvs.addEventListener('touchend', e => { const t = e.changedTouches[0]; const wx = s2wX(t.clientX), wy = s2wY(t.clientY); if (armed) TD.placeTower(S, armed, wx, wy); else { let b = null, bd = 30; S.towers.forEach(o => { const d = Math.hypot(o.x - wx, o.y - wy); if (d < bd) { bd = d; b = o; } }); selId = b ? b.id : null; } }, { passive: true });
  cvs.addEventListener('touchmove', e => { const t = e.touches[0]; mouse.x = s2wX(t.clientX); mouse.y = s2wY(t.clientY); mouse.on = true; }, { passive: true });

  $('provoke').onclick = () => TD.provoke(S);
  $('startwave').onclick = () => TD.startWaveNow(S);
  $('reseed').onclick = () => { S = TD.create((Math.random() * 1e9) | 0); armed = null; selId = null; };
  // delegated clicks (survive the per-frame innerHTML rebuilds) — the fix for "can't place/upgrade"
  buildPalette();
  $('palette').addEventListener('click', e => { const b = e.target.closest('[data-tw]'); if (b) { armed = armed === b.dataset.tw ? null : b.dataset.tw; selId = null; } });
  $('inspector').addEventListener('click', e => { if (e.target.closest('#upg') && selId) TD.upgradeTower(S, selId); });

  // ── render ──
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#070504'; ctx.fillRect(0, 0, cvs.width, cvs.height);

    // winding lanes — ACTIVE lanes (where this/next wave comes) glow red + pulse + an inbound arrow
    S.lanes.forEach((lane, li) => {
      const active = S.waveLanes.indexOf(li) >= 0;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = active ? 'rgba(255,80,80,0.11)' : 'rgba(255,176,0,0.035)'; ctx.lineWidth = 50 * scale;
      ctx.beginPath(); lane.pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](w2sX(p.x), w2sY(p.y))); ctx.stroke();
      ctx.strokeStyle = active ? 'rgba(255,120,90,0.30)' : 'rgba(255,176,0,0.10)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); lane.pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](w2sX(p.x), w2sY(p.y))); ctx.stroke();
      const sp = lane.pts[0], sx = w2sX(sp.x), sy = w2sY(sp.y);
      if (active) {
        const pulse = 0.5 + 0.5 * Math.sin(S.t * 5);
        ctx.strokeStyle = `rgba(255,80,80,${0.55 + pulse * 0.4})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(sx, sy, (10 + pulse * 3) * scale, 0, 7); ctx.stroke();
        const nx = lane.pts[1] || S.core, a = Math.atan2(w2sY(nx.y) - sy, w2sX(nx.x) - sx), as = 9 * scale;
        ctx.fillStyle = '#ff5050'; ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(as * 1.7, 0); ctx.lineTo(-as * 0.4, -as); ctx.lineTo(-as * 0.4, as); ctx.closePath(); ctx.fill(); ctx.restore();
      } else {
        ctx.strokeStyle = 'rgba(150,110,50,0.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, 8 * scale, 0, 7); ctx.stroke();
      }
    });

    // armed placement preview
    if (armed && mouse.on) {
      const def = S.TOWERS[armed], ok = TD.placeValid(S, armed, mouse.x, mouse.y) && S.cash >= def.cost;
      const x = w2sX(mouse.x), y = w2sY(mouse.y);
      ctx.fillStyle = ok ? 'rgba(110,224,110,0.10)' : 'rgba(255,80,80,0.10)';
      ctx.beginPath(); ctx.arc(x, y, def.range * scale, 0, 7); ctx.fill();
      ctx.strokeStyle = ok ? '#6ee06e' : '#ff5050'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, def.range * scale, 0, 7); ctx.stroke();
      ctx.fillStyle = ok ? def.color : '#ff5050'; ctx.globalAlpha = 0.7; const sz = 16 * scale; ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz); ctx.globalAlpha = 1;
    }

    // towers — emplacement: hex base, a barrel that AIMS at its target, glowing core, level pips
    S.towers.forEach(tw => {
      const x = w2sX(tw.x), y = w2sY(tw.y), def = S.TOWERS[tw.type], R = 12 * scale, aim = tw.aim || 0;
      if (tw.id === selId) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, tw.range * scale, 0, 7); ctx.stroke(); }
      // base plate (hex)
      ctx.fillStyle = '#160f08'; ctx.strokeStyle = def.color; ctx.lineWidth = 1.5;
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6, px = x + Math.cos(a) * R, py = y + Math.sin(a) * R; ctx[i ? 'lineTo' : 'moveTo'](px, py); } ctx.closePath(); ctx.fill(); ctx.stroke();
      // barrel — points at the current target
      ctx.save(); ctx.translate(x, y); ctx.rotate(aim);
      const bl = R * 1.95, bw = 5 * scale;
      ctx.fillStyle = def.color; ctx.fillRect(-2 * scale, -bw / 2, bl, bw);
      ctx.fillStyle = '#0a0805'; ctx.fillRect(bl - 3 * scale, -bw / 2, 2 * scale, bw);   // barrel tip notch
      if (tw.muzzle > 0) {   // muzzle flash at the barrel tip while firing
        const mf = tw.muzzle / 0.08; ctx.globalAlpha = mf; ctx.fillStyle = '#fff'; ctx.shadowColor = def.color; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(bl + 2 * scale, 0, (3 + mf * 3) * scale, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      ctx.restore();
      // glowing core hub
      ctx.fillStyle = def.color; ctx.shadowColor = def.color; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(x, y, 3.5 * scale, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      // level pips — small dots ringing the base
      for (let i = 0; i < tw.level - 1; i++) { const a = -Math.PI / 2 + i * 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * (R + 4 * scale), y + Math.sin(a) * (R + 4 * scale), 1.6 * scale, 0, 7); ctx.fill(); }
      if (tw.id === selId) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, R + 3 * scale, 0, 7); ctx.stroke(); }
    });

    // fire beams — bright glowing tracer that fades fast
    S.beams.forEach(b => {
      const a = Math.min(1, b.life / 0.11), x1 = w2sX(b.x1), y1 = w2sY(b.y1), x2 = w2sX(b.x2), y2 = w2sY(b.y2);
      ctx.globalAlpha = a; ctx.strokeStyle = b.color; ctx.shadowColor = b.color; ctx.shadowBlur = 9; ctx.lineCap = 'round';
      ctx.lineWidth = 3 * scale; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.lineWidth = 1 * scale; ctx.strokeStyle = '#fff'; ctx.globalAlpha = a * 0.8; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    });
    // impact bursts — expanding ring where an attacker died
    (S.bursts || []).forEach(b => {
      const f = 1 - b.life / 0.35, x = w2sX(b.x), y = w2sY(b.y);
      ctx.globalAlpha = Math.max(0, b.life / 0.35); ctx.strokeStyle = b.color; ctx.shadowColor = b.color; ctx.shadowBlur = 8;
      ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.arc(x, y, (4 + f * 18) * scale, 0, 7); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    });

    // attackers — flash white + swell on the frames right after a hit lands
    S.attackers.forEach(at => {
      const def = S.ATTACKERS[at.type], x = w2sX(at.x), y = w2sY(at.y), r0 = def.r * scale;
      const flash = at.hitT && (S.t - at.hitT < 0.09), r = r0 * (flash ? 1.35 : 1);
      if (flash) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; }
      ctx.fillStyle = flash ? '#ffffff' : def.color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      if (at.slowT > 0) { ctx.strokeStyle = '#7fa8c9'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r0 + 2, 0, 7); ctx.stroke(); }
      const w = 16 * scale, hp = at.hp / at.maxHp;   // hp bar
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2, y - r0 - 6 * scale, w, 3 * scale);
      ctx.fillStyle = hp > 0.5 ? '#6ee06e' : hp > 0.25 ? '#e0913f' : '#ff5050'; ctx.fillRect(x - w / 2, y - r0 - 6 * scale, w * hp, 3 * scale);
    });

    // core
    const cx = w2sX(S.core.x), cy = w2sY(S.core.y), pulse = 0.5 + 0.5 * Math.sin(S.t * 3);
    const cr = 26 * scale;
    ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 16 + pulse * 10;
    ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.moveTo(cx, cy - cr); ctx.lineTo(cx + cr, cy); ctx.lineTo(cx, cy + cr); ctx.lineTo(cx - cr, cy); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#1a1206'; ctx.font = `${Math.round(10 * scale)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('CORE', cx, cy);
  }

  // ── UI ──
  function bar(id, pct, warn) { const el = $(id); if (!el) return; el.style.width = Math.max(0, Math.min(100, pct)) + '%'; el.style.background = warn && pct < 35 ? '#ff5050' : warn && pct < 60 ? '#e0913f' : 'var(--amber)'; }
  function buildPalette() {   // built ONCE — rebuilding every frame ate the clicks (the place-tower bug)
    $('palette').innerHTML = Object.keys(S.TOWERS).map(k => {
      const t = S.TOWERS[k];
      return `<button class="tw" data-tw="${k}" style="--c:${t.color}"><span class="tw-name">${t.name.toUpperCase()}</span><span class="tw-desc">${t.desc}</span><span class="tw-cost">$${t.cost}</span></button>`;
    }).join('');
  }
  function updatePalette() {   // per-frame: just toggle classes, never rebuild
    $('palette').querySelectorAll('[data-tw]').forEach(b => { const t = S.TOWERS[b.dataset.tw]; b.classList.toggle('armed', armed === b.dataset.tw); b.classList.toggle('noafford', S.cash < t.cost); });
  }
  function ui() {
    bar('corebar', S.core.hp / S.core.maxHp * 100, true);
    $('corehp').textContent = Math.ceil(S.core.hp) + ' / ' + S.core.maxHp;
    $('cash').textContent = '$' + Math.round(S.cash);
    $('wave').textContent = S.wave + ' / ' + S.GOAL_WAVES;
    $('threat').textContent = Math.round(S.threat);
    updatePalette();
    $('armedhint').style.display = armed ? 'block' : 'none';
    if (armed) $('armedhint').textContent = `${S.TOWERS[armed].name.toUpperCase()} armed — click a spot off the lanes to place`;
    const inPrep = S.phase === 'prep' && !S.won && !S.lost;
    $('startwave').style.display = inPrep ? 'inline-block' : 'none';
    $('provoke').style.display = inPrep ? 'inline-block' : 'none';   // loudness only between waves
    $('prep').style.display = S.phase === 'prep' && !S.won && !S.lost ? 'inline' : 'none';
    if (S.phase === 'prep') $('prep').textContent = `next wave in ${Math.ceil(S.prep)}s`;

    const tw = selId ? S.towers.find(t => t.id === selId) : null;
    const insp = $('inspector');
    if (tw) {
      const c = TD.towerUpCost(tw), ok = S.cash >= c;
      // SIG-GATE: only rebuild the innerHTML when something shown changes — otherwise the per-frame
      // rebuild replaces the #upg button between mousedown/up and eats the click (the upgrade bug).
      const sig = `${tw.id}|${tw.level}|${Math.round(tw.dmg)}|${Math.round(tw.range)}|${tw.rate.toFixed(2)}|${ok}`;
      if (sig !== lastInspSig) {
        insp.style.display = 'block';
        insp.innerHTML = `<div class="i-name" style="color:${S.TOWERS[tw.type].color}">${S.TOWERS[tw.type].name.toUpperCase()} · lvl ${tw.level}</div>`
          + `<div class="i-stat">dmg ${Math.round(tw.dmg)} · range ${Math.round(tw.range)} · ${tw.rate.toFixed(1)}/s${tw.slow ? ' · slows' : ''}</div>`
          + `<button id="upg" class="i-btn ${ok ? '' : 'off'}">UPGRADE · $${c}</button>`;
        lastInspSig = sig;
      }
    } else if (lastInspSig !== '') { insp.style.display = 'none'; lastInspSig = ''; }

    const log = $('log'); log.innerHTML = S.log.slice(-6).map(l => `<div>${l}</div>`).join(''); log.scrollTop = log.scrollHeight;
    const ov = $('overlay');
    if (S.won || S.lost) { ov.style.display = 'flex'; ov.className = S.won ? 'win' : 'lose'; $('ov-title').textContent = S.won ? 'NODE HELD' : 'CORE BREACHED'; $('ov-sub').textContent = S.won ? `you held all ${S.GOAL_WAVES} waves.` : `reached wave ${S.wave}. they got through.`; }
    else ov.style.display = 'none';
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    TD.tick(S, dt); draw(); ui();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__td = { state: () => S, arm: t => { armed = t; }, place: (t, x, y) => TD.placeTower(S, t, x, y) };
})();
