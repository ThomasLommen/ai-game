// ── City proof: renderer + input + UI (the DOM/canvas side; sim.js stays pure) ──
(function () {
  const cvs = document.getElementById('map'), ctx = cvs.getContext('2d');
  const $ = id => document.getElementById(id);
  let S = CitySim.create((Math.random() * 1e9) | 0);
  let cam = { x: 0, y: 0, zoom: 0.5 }, selId = null, armed = null, last = performance.now();

  // The ARSENAL — data-driven so it can grow without ever looking "capped". The flow
  // is verb-FIRST: arm an ability, then pick a target, then USE (decouples abilities
  // from any one target → the open-world "point anything at anything" illusion).
  const VCOLOR = { propagate: '#ffb000', surveil: '#9ab0c4', exfiltrate: '#6ee06e', sabotage: '#ff5050', cover: '#9ef09e' };
  const ABILITIES = [
    { id: 'propagate', name: 'PROPAGATE', glyph: '⇲', global: false,
      valid: n => CitySim.reachable(S, n),
      why: n => n.owned ? 'already yours' : 'not reachable yet — it must touch a node you own',
      preview: n => `compromise <b>${n.label}</b> — ${Math.round(CitySim.propagateOdds(S, n) * 100)}% odds. success makes it yours and opens its links.` },
    { id: 'surveil', name: 'SURVEIL', glyph: '◎', global: false,
      valid: n => n.revealed,
      why: () => 'not visible from here',
      preview: n => `map <b>${n.label}</b> — expose its ${n.conns.length} links. quiet recon, almost no trace.` },
    { id: 'exfiltrate', name: 'EXFILTRATE', glyph: '$', global: false,
      valid: n => n.owned && n.value > 0,
      why: n => !n.owned ? 'not yours — propagate in first' : 'already drained (refilling…)',
      preview: n => `pull <b>$${Math.round(n.value)}</b> out of ${n.label}. loud — trace + local alert climb.` },
    { id: 'sabotage', name: 'SABOTAGE', glyph: '✕', global: false,
      valid: n => n.owned || CitySim.reachable(S, n),
      why: () => 'must be owned or reachable',
      preview: n => `sabotage ${n.label} — district alert −28, its defenses drop for a while.` },
    { id: 'cover', name: 'COVER', glyph: '~', global: true,
      preview: () => `scrub logs, reroute, salt the trail — trace −17, cool the hottest district, push the hunt back a step.` },
  ];
  const AB = id => ABILITIES.find(a => a.id === id);

  function resize() { cvs.width = cvs.clientWidth * devicePixelRatio; cvs.height = cvs.clientHeight * devicePixelRatio; }
  window.addEventListener('resize', resize); resize();
  // centre on origin
  (function () { const o = S.nodes[S.originId]; cam.x = o.x; cam.y = o.y; })();

  const w2sX = wx => (wx - cam.x) * cam.zoom + cvs.width / 2;
  const w2sY = wy => (wy - cam.y) * cam.zoom + cvs.height / 2;
  const s2wX = sx => (sx - cvs.width / 2) / cam.zoom + cam.x;
  const s2wY = sy => (sy - cvs.height / 2) / cam.zoom + cam.y;

  // ── input: pan (drag/touch), zoom (wheel/buttons), select (tap) ──
  let dragging = false, moved = false, lastP = null;
  function down(x, y) { dragging = true; moved = false; lastP = { x, y }; }
  function move(x, y) { if (!dragging) return; const dx = x - lastP.x, dy = y - lastP.y; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; cam.x -= dx * devicePixelRatio / cam.zoom; cam.y -= dy * devicePixelRatio / cam.zoom; lastP = { x, y }; }
  function up(x, y) { if (dragging && !moved) pick(x, y); dragging = false; }
  function pick(sx, sy) {
    const wx = s2wX(sx * devicePixelRatio), wy = s2wY(sy * devicePixelRatio);
    let best = null, bd = 22 / cam.zoom;
    S.nodes.forEach(n => { if (!n.revealed) return; const d = Math.hypot(n.x - wx, n.y - wy); if (d < bd) { bd = d; best = n; } });
    selId = best ? best.id : null;
  }
  cvs.addEventListener('mousedown', e => down(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
  window.addEventListener('mouseup', e => up(e.clientX, e.clientY));
  cvs.addEventListener('touchstart', e => { const t = e.touches[0]; down(t.clientX, t.clientY); }, { passive: true });
  cvs.addEventListener('touchmove', e => { const t = e.touches[0]; move(t.clientX, t.clientY); }, { passive: true });
  cvs.addEventListener('touchend', e => { const t = e.changedTouches[0]; up(t.clientX, t.clientY); }, { passive: true });
  cvs.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
  function zoomAt(sx, sy, f) { const wx = s2wX(sx * devicePixelRatio), wy = s2wY(sy * devicePixelRatio); cam.zoom = Math.max(0.18, Math.min(2.4, cam.zoom * f)); cam.x = wx - (sx * devicePixelRatio - cvs.width / 2) / cam.zoom; cam.y = wy - (sy * devicePixelRatio - cvs.height / 2) / cam.zoom; }
  $('zin').onclick = () => zoomAt(cvs.clientWidth / 2, cvs.clientHeight / 2, 1.25);
  $('zout').onclick = () => zoomAt(cvs.clientWidth / 2, cvs.clientHeight / 2, 1 / 1.25);
  $('reseed').onclick = () => { S = CitySim.create((Math.random() * 1e9) | 0); selId = null; armed = null; const o = S.nodes[S.originId]; cam = { x: o.x, y: o.y, zoom: 0.5 }; };

  function act(verb) {                          // execute a verb on the current target (or globally)
    const a = AB(verb); if (!a) return;
    if (a.global) { CitySim[verb](S); return; }
    const n = selId != null ? S.nodes[selId] : null;
    if (n && a.valid(n)) CitySim[verb](S, n);
  }
  function renderBar() {                        // the arsenal (rebuilt each frame: armed + affordability)
    $('ablist').innerHTML = ABILITIES.map(a => {
      const cost = S.VERB_COST[a.id], afford = S.compute >= cost;
      return `<button class="ab ${armed === a.id ? 'armed' : ''} ${afford ? '' : 'noafford'}" data-ab="${a.id}">` +
        `<span class="abk" style="${armed === a.id ? 'color:' + VCOLOR[a.id] : ''}">${a.glyph}</span><span class="abn">${a.name}</span><span class="abc">⚙${cost}</span></button>`;
    }).join('');
    $('ablist').querySelectorAll('[data-ab]').forEach(b => b.onclick = () => { armed = armed === b.dataset.ab ? null : b.dataset.ab; });
  }

  // ── render ──
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#070504'; ctx.fillRect(0, 0, cvs.width, cvs.height);

    // districts: faint frame + red alert wash
    S.districts.forEach(d => {
      const x = w2sX(d.x), y = w2sY(d.y), w = d.w * cam.zoom, h = d.h * cam.zoom;
      ctx.strokeStyle = 'rgba(255,176,0,0.05)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
      if (d.alert > 4) { ctx.fillStyle = `rgba(255,60,60,${Math.min(0.16, d.alert / 600)})`; ctx.fillRect(x, y, w, h); }
    });

    // edges between revealed nodes (owned links brighter)
    S.nodes.forEach(n => { if (!n.revealed) return; n.conns.forEach(id => { if (id < n.id) return; const o = S.nodes[id]; if (!o.revealed) return; const both = n.owned && o.owned; ctx.strokeStyle = both ? 'rgba(255,176,0,0.32)' : 'rgba(255,176,0,0.07)'; ctx.lineWidth = both ? 1.4 : 1; ctx.beginPath(); ctx.moveTo(w2sX(n.x), w2sY(n.y)); ctx.lineTo(w2sX(o.x), w2sY(o.y)); ctx.stroke(); }); });

    // dots (people / traffic) flowing along revealed edges — glowing moving sparks (the living city).
    // bright core + soft halo, sized with zoom so they read at any scale.
    const dsz = Math.max(2.6, Math.min(10, 3.8 * cam.zoom));
    S.dots.forEach(p => {
      const a = S.nodes[p.a], b = S.nodes[p.b]; if (!a.revealed || !b.revealed) return;
      const x = w2sX(a.x + (b.x - a.x) * p.t), y = w2sY(a.y + (b.y - a.y) * p.t);
      ctx.fillStyle = 'rgba(255,180,75,0.20)'; ctx.beginPath(); ctx.arc(x, y, dsz, 0, 7); ctx.fill();          // halo
      ctx.fillStyle = '#ffd890'; ctx.beginPath(); ctx.arc(x, y, dsz * 0.46, 0, 7); ctx.fill();                 // bright core
    });

    // the traceback hunt (red creeping line + glowing front)
    const H = S.hunt;
    if (H.active && H.path.length > 1) {
      ctx.strokeStyle = 'rgba(255,60,60,0.85)'; ctx.lineWidth = 2.2; ctx.beginPath();
      for (let i = 0; i < H.path.length; i++) { const n = S.nodes[H.path[i]]; const fn = i === 0 ? 'moveTo' : 'lineTo'; ctx[fn](w2sX(n.x), w2sY(n.y)); }
      ctx.stroke();
      const seg = Math.min(H.path.length - 1, Math.floor(H.progress)); const fr = H.progress - seg;
      const a = S.nodes[H.path[seg]], b = S.nodes[H.path[Math.min(seg + 1, H.path.length - 1)]];
      const fx = w2sX(a.x + (b.x - a.x) * fr), fy = w2sY(a.y + (b.y - a.y) * fr);
      ctx.fillStyle = '#ff5050'; ctx.shadowColor = '#ff5050'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(fx, fy, 4.5, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    }

    // mobile people's (dynamic, directional) links to nearby buildings — dashed = wireless/transient,
    // shown for the people you OWN or have selected (so you see the bridge they make).
    S.nodes.forEach(m => {
      if (!m.mobile || !m.revealed || !(m.owned || m.id === selId)) return;
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      m.conns.forEach(id => { const o = S.nodes[id]; if (!o.revealed) return; ctx.strokeStyle = m.owned ? 'rgba(255,176,0,0.30)' : 'rgba(255,225,180,0.22)'; ctx.beginPath(); ctx.moveTo(w2sX(m.x), w2sY(m.y)); ctx.lineTo(w2sX(o.x), w2sY(o.y)); ctx.stroke(); });
      ctx.setLineDash([]);
    });

    // nodes (revealed only) — buildings as squares, people as moving circles
    const sz = Math.max(4, Math.min(16, 8.5 * cam.zoom));     // buildings (a bit bigger now)
    const psz = Math.max(2.8, Math.min(9, 4.2 * cam.zoom));   // people
    S.nodes.forEach(n => {
      if (!n.revealed) return;
      const x = w2sX(n.x), y = w2sY(n.y), t = S.TYPES[n.type], reach = CitySim.reachable(S, n);
      if (n.mobile) {
        if (n.owned) { ctx.fillStyle = t.accent; ctx.beginPath(); ctx.arc(x, y, psz, 0, 7); ctx.fill(); ctx.strokeStyle = '#ffe6ad'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, psz + 1.6, 0, 7); ctx.stroke(); }
        else if (reach) { const pulse = 0.5 + 0.5 * Math.sin(S.t * 4); ctx.fillStyle = `rgba(255,205,155,${0.45 + pulse * 0.4})`; ctx.beginPath(); ctx.arc(x, y, psz, 0, 7); ctx.fill(); }
        else { ctx.fillStyle = 'rgba(255,200,155,0.55)'; ctx.beginPath(); ctx.arc(x, y, psz * 0.82, 0, 7); ctx.fill(); }
        if (n.stationary) { ctx.strokeStyle = 'rgba(255,210,160,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - psz, y + psz + 1.5); ctx.lineTo(x + psz, y + psz + 1.5); ctx.stroke(); }   // a "desk" line = laptop, sitting still
        if (n.id === selId) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, psz + 3.5, 0, 7); ctx.stroke(); }
        return;
      }
      if (n.owned) { ctx.fillStyle = t.accent; ctx.globalAlpha = 0.9; ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz); ctx.globalAlpha = 1; ctx.strokeStyle = '#ffe6ad'; ctx.lineWidth = 1; ctx.strokeRect(x - sz / 2 - 1, y - sz / 2 - 1, sz + 2, sz + 2); }
      else if (reach) { const pulse = 0.5 + 0.5 * Math.sin(S.t * 4); ctx.strokeStyle = `rgba(255,176,0,${0.5 + pulse * 0.45})`; ctx.lineWidth = 1.4; ctx.strokeRect(x - sz / 2, y - sz / 2, sz, sz); ctx.fillStyle = 'rgba(255,176,0,0.12)'; ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz); }
      else { ctx.strokeStyle = 'rgba(160,120,50,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(x - sz / 2, y - sz / 2, sz, sz); }
      ctx.fillStyle = t.accent; ctx.fillRect(x - sz / 2, y - sz / 2 - 2, Math.max(2, sz * 0.4), 2);   // type accent pip
      if (sz >= 9 && (n.surveilled || n.owned)) { ctx.fillStyle = n.owned ? '#1a1206' : t.accent; ctx.font = `${Math.round(sz * 0.85)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t.glyph, x, y + 0.5); }
      if (n.id === selId) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.strokeRect(x - sz / 2 - 3, y - sz / 2 - 3, sz + 6, sz + 6); }
    });

    // armed-ability validity highlight — point a verb at the world, see where it bites
    if (armed) { const a = AB(armed); if (a && !a.global) { const col = VCOLOR[armed], pulse = 0.55 + 0.45 * Math.sin(S.t * 5); ctx.globalAlpha = 0.35 + pulse * 0.5; ctx.strokeStyle = col; ctx.lineWidth = 1.6; S.nodes.forEach(n => { if (!n.revealed || !a.valid(n)) return; const x = w2sX(n.x), y = w2sY(n.y); if (n.mobile) { ctx.beginPath(); ctx.arc(x, y, psz + 3.5, 0, 7); ctx.stroke(); } else ctx.strokeRect(x - sz / 2 - 3, y - sz / 2 - 3, sz + 6, sz + 6); }); ctx.globalAlpha = 1; } }

    // origin marker
    const o = S.nodes[S.originId]; ctx.strokeStyle = '#ffb000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w2sX(o.x), w2sY(o.y), Math.max(7, sz), 0, 7); ctx.stroke();
  }

  // ── UI overlay ──
  function bar(id, pct, warn) { const el = $(id); el.style.width = Math.max(0, Math.min(100, pct)) + '%'; el.style.background = warn && pct > 65 ? '#ff5050' : (warn && pct > 40 ? '#e0913f' : 'var(--amber)'); }
  function ui() {
    $('cash').textContent = '$' + Math.round(S.cash).toLocaleString();
    $('compute').textContent = S.compute.toFixed(1) + ' / ' + S.computeMax;
    bar('computebar', S.compute / S.computeMax * 100, false);
    $('trace').textContent = Math.round(S.trace) + '%';
    bar('tracebar', S.trace, true);
    $('owned').textContent = CitySim.ownedCount(S);
    $('sat').textContent = (CitySim.saturation(S) * 100).toFixed(1) + '%';
    const goal = Math.min(100, S.cash / 5000 * 100); $('goalbar').style.width = goal + '%';
    $('hunt').style.display = S.hunt.active ? 'block' : 'none';

    const log = $('log'); log.innerHTML = S.log.slice(-8).map(l => `<div>${l.msg}</div>`).join('');
    log.scrollTop = log.scrollHeight;

    renderBar();
    const a = armed ? AB(armed) : null;
    const ah = $('armedhint');
    if (a) { ah.style.display = 'block'; ah.textContent = a.global ? `${a.name} armed — hit USE` : `${a.name} armed — pick a target ▸`; }
    else ah.style.display = 'none';

    // inspector: target info, plus (when a verb is armed) its outcome HERE + USE
    const n = selId != null ? S.nodes[selId] : null;
    let html = '';
    if (n) {
      const t = S.TYPES[n.type], reach = CitySim.reachable(S, n);
      const status = n.owned ? '<span style="color:var(--amber)">OWNED</span>' : reach ? '<span style="color:#e0913f">REACHABLE</span>' : 'seen';
      html += `<div class="ititle" style="color:${t.accent}">${t.glyph} ${n.label}</div>`
        + `<div class="dim">defense ${n.defense}${n.sabotaged > 0 ? ' · sabotaged' : ''} · alert ${Math.round(CitySim.districtAlert(S, n))}% · ${status}</div>`
        + (n.mobile ? `<div class="dim">${n.stationary ? 'on a laptop — sitting still' : 'on the move — a roving stepping-stone'}; bridges to ${n.conns.length} nearby building${n.conns.length === 1 ? '' : 's'}</div><div>data: <b style="color:#6ee06e">$${Math.round(n.value)}</b></div>`
          : n.baseValue > 0 ? `<div>holdings: <b style="color:#6ee06e">$${Math.round(n.value)}</b></div>`
          : t.compute ? '<div class="dim">owning this raises compute regen</div>' : t.exposure ? '<div class="dim">precinct — sabotage cools its district</div>' : t.reach ? '<div class="dim">comms tower — long-range links</div>' : '');
    }
    if (a) {
      const afford = S.compute >= S.VERB_COST[a.id];
      if (a.global) {
        html += `<div class="action"><div class="alabel">~ ${a.name} <span class="dim">(global)</span></div><div class="apreview">${a.preview()}</div>`
          + `<button id="usebtn" class="use glob ${afford ? '' : 'off'}">USE ⚙${S.VERB_COST[a.id]}</button></div>`;
      } else if (!n) {
        html += `<div class="action"><div class="alabel">▸ ${a.name} armed</div><div class="apreview">pick a target — its valid spots are lit on the map.</div></div>`;
      } else {
        const ok = a.valid(n);
        html += `<div class="action"><div class="alabel">▸ ${a.name} → ${n.label}</div>`
          + `<div class="apreview ${ok ? '' : 'bad'}">${ok ? a.preview(n) : 'can’t — ' + a.why(n)}</div>`
          + `<button id="usebtn" class="use ${ok && afford ? '' : 'off'}">USE ⚙${S.VERB_COST[a.id]}</button></div>`;
      }
    } else if (!n) {
      html = '<div class="dim">arm an ability ◂ from the bar, then pick a target. dim squares are reachable — spread into them.</div>';
    } else {
      html += '<div class="dim" style="margin-top:10px">arm an ability ◂ to act on this.</div>';
    }
    $('inspector').innerHTML = html;
    const ub = $('usebtn'); if (ub) ub.onclick = () => { if (armed) act(armed); };
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    CitySim.tick(S, dt);
    draw(); ui();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // debug handle (proto only) — drive/inspect the running instance from tests
  window.__city = { state: () => S, act, arm: id => { armed = id; }, select: id => { selId = id; }, recenter: id => { const n = S.nodes[id]; cam.x = n.x; cam.y = n.y; }, setZoom: z => { cam.zoom = z; } };
})();
