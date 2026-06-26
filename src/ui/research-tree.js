// ── Game.researchTree — the VISUAL SKILL-TREE research picker ────────────────
// Renders the seeded research graph as a pan/pinch tree on a canvas. The DRAFT mechanic is
// unchanged (RR rolls a HAND + a reroll; you pick one) — this is the visual layer. The whole
// tree shows as DIM SILHOUETTES (shape · theme colour · tier · ⚡ exotic mark), your RESEARCHED
// nodes are SOLID (the tree is your build record), and the current draft HAND is LIT. Tap a lit
// node → a tooltip card with effect/cost/[DRAFT]; tap a silhouette → a minimal locked hint.
// ([[research-tree-rework-design]])
(function () {
  window.Game = window.Game || {};
  const TH = { compute: '#ffb000', cognition: '#c79bff', hardware: '#ff9a4a', network: '#49d6ff', stealth: '#79e08c' };
  const ORDER = ['cognition', 'compute', 'hardware', 'network', 'stealth'];

  let cvs = null, ctx = null, wrap = null, tip = null;
  let cam = { x: 0, y: 0, scale: 1 }, fitted = false, layout = null, layoutSig = '';
  let lastHandSig = null, selId = null;
  const pointers = new Map(); let pinchD = 0, panLast = null, downPt = null, moved = 0;

  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
  function networkOn() { const s = Game.save.state; return !!(s.revealed && s.revealed.network); }

  // ── layout: theme LANES (x) × TIER (y), CORE at the top. Stable per run. ──
  function buildLayout() {
    const R = Game.research;
    const nodes = R.all().filter(n => !n.act2 || networkOn());
    const present = ORDER.filter(t => nodes.some(n => n.theme === t));
    const LANE_W = 158, TIER_H = 126, SPREAD = 64, TOP = 156, MARGIN = 90;
    const laneX = t => MARGIN + present.indexOf(t) * LANE_W + LANE_W / 2;
    const groups = {};
    nodes.forEach(n => { const k = n.theme + '|' + n.tier; (groups[k] = groups[k] || []).push(n); });
    const pos = {};
    Object.keys(groups).forEach(k => {
      const arr = groups[k].slice().sort((a, b) => a.id.localeCompare(b.id));
      const lx = laneX(arr[0].theme), y = TOP + (arr[0].tier - 1) * TIER_H;
      arr.forEach((n, i) => { pos[n.id] = { x: lx + (i - (arr.length - 1) / 2) * SPREAD, y, node: n }; });
    });
    const worldW = MARGIN * 2 + present.length * LANE_W;
    const worldH = TOP + 4 * TIER_H + 30;
    const core = { x: worldW / 2, y: TOP - TIER_H * 0.72 };
    return { pos, present, worldW, worldH, core };
  }
  function ensureLayout() {
    const sig = Game.research.all().filter(n => !n.act2 || networkOn()).length + '|' + networkOn();
    if (!layout || sig !== layoutSig) { layout = buildLayout(); layoutSig = sig; fitted = false; }
    return layout;
  }

  // ── camera ──
  function fit(centerOn) {
    const L = ensureLayout(); if (!cvs.width) return;
    const cw = cvs.width / devicePixelRatio, ch = cvs.height / devicePixelRatio;
    const s = Math.min(cw / L.worldW, ch / L.worldH) * 0.96;
    cam.scale = Math.max(0.3, Math.min(1.6, s));
    const cx = centerOn ? centerOn.x : L.worldW / 2, cy = centerOn ? centerOn.y : L.worldH / 2;
    cam.x = cw / 2 - cx * cam.scale; cam.y = ch / 2 - cy * cam.scale;
    fitted = true;
  }
  function handCenter() {
    const RR = Game.researchRuntime; if (!RR) return null;
    const hand = RR.handNodes ? RR.handNodes() : []; const L = ensureLayout();
    const ps = hand.map(h => L.pos[h.node.id]).filter(Boolean);
    if (!ps.length) return null;
    return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length };
  }
  function recenter() { fit(null); }   // fit the WHOLE tree, centered (everything visible)
  function panTo(pt) {   // gentle re-center on a point WITHOUT rescaling (used when a new hand rolls)
    if (!pt || !cvs.width) return;
    const cw = cvs.width / devicePixelRatio, ch = cvs.height / devicePixelRatio;
    cam.x = cw / 2 - pt.x * cam.scale; cam.y = ch / 2 - pt.y * cam.scale;
  }
  const toWorld = (sx, sy) => ({ x: (sx - cam.x) / cam.scale, y: (sy - cam.y) / cam.scale });

  // ── node state ──
  function stateOf(id, researched, handIds) {
    if (researched[id]) return 'done';
    if (handIds[id]) return 'hand';
    return 'sil';
  }

  // ── draw ──
  function draw() {
    if (!cvs || !ctx) return;
    if (cvs.offsetParent === null) return;   // panel not visible → skip
    resizeIfNeeded();
    const L = ensureLayout();
    if (!fitted) recenter();
    const RR = Game.researchRuntime, R = Game.research, s = Game.save.state;
    const researched = {}; (RR.researchedIds ? RR.researchedIds() : []).forEach(id => researched[id] = 1);
    const hand = RR.handNodes ? RR.handNodes() : []; const handIds = {}; hand.forEach(h => handIds[h.node.id] = h);
    const activeId = (s.research && s.research.active) || null;

    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.fillStyle = '#080605'; ctx.fillRect(0, 0, cvs.width, cvs.height);
    ctx.setTransform(cam.scale * devicePixelRatio, 0, 0, cam.scale * devicePixelRatio, cam.x * devicePixelRatio, cam.y * devicePixelRatio);

    // LINKS
    const core = L.core;
    R.all().forEach(n => {
      const p = L.pos[n.id]; if (!p) return;
      const parents = (n.parents && n.parents.length) ? n.parents.map(id => L.pos[id]).filter(Boolean) : [core];
      parents.forEach(pp => {
        const lit = researched[n.id] || (pp.node && researched[pp.node.id]);
        const col = TH[n.theme] || '#ffb000';
        ctx.strokeStyle = rgba(col, lit ? 0.5 : 0.14); ctx.lineWidth = lit ? 2 : 1.2;
        ctx.beginPath(); ctx.moveTo(pp.x, pp.y); const my = (pp.y + p.y) / 2; ctx.bezierCurveTo(pp.x, my, p.x, my, p.x, p.y); ctx.stroke();
      });
    });
    // CORE
    drawNode({ x: core.x, y: core.y, node: { theme: 'compute' } }, 'core', false, false);
    // NODES
    R.all().forEach(n => {
      const p = L.pos[n.id]; if (!p) return;
      const st = stateOf(n.id, researched, handIds);
      drawNode(p, st, n.id === activeId, n.id === selId, handIds[n.id]);
    });
  }

  function drawNode(p, st, active, sel, h) {
    const n = p.node, col = TH[n.theme] || '#ffb000', exo = !!(n.exotic || n.changerNode);
    const r = st === 'core' ? 19 : (exo ? 14 : 11);
    const t = Date.now();
    if (st === 'core') {
      ctx.fillStyle = '#1a1308'; ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.stroke();
      label(p.x, p.y + r + 13, 'CORE', '#ffd24a', 11, true); return;
    }
    // glow for the LIT hand (and a faint exotic shimmer on silhouettes)
    if (st === 'hand') {
      const pulse = 0.5 + 0.5 * Math.sin(t / 380 + p.x);
      ctx.save(); ctx.shadowColor = h && (h.free || h.changer) ? '#b78cff' : col; ctx.shadowBlur = (exo ? 22 : 15) * (0.6 + 0.4 * pulse);
      ctx.strokeStyle = h && (h.free || h.changer) ? '#b78cff' : col; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, 0, 7); ctx.stroke(); ctx.restore();
    }
    if (sel) { ctx.strokeStyle = '#fff3d0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r + 9, 0, 7); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7);
    if (st === 'done') {
      ctx.fillStyle = rgba(col, 0.92); ctx.fill(); ctx.strokeStyle = '#0a0805'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#0a0805'; ctx.font = '700 11px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText('✓', p.x, p.y + 4);
      if (active) { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r + 6 + Math.sin(t / 200) * 2, 0, 7); ctx.stroke(); }
      label(p.x, p.y + r + 13, n.label, rgba(col, 0.92), 10, exo);
    } else if (st === 'hand') {
      ctx.fillStyle = '#1c1408'; ctx.fill(); ctx.strokeStyle = h && (h.free || h.changer) ? '#b78cff' : col; ctx.lineWidth = 2.4; ctx.stroke();
      if (exo) { ctx.fillStyle = '#d9c2ff'; ctx.font = '700 12px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText('⚡', p.x, p.y + 4); }
      label(p.x, p.y + r + 13, n.label, h && (h.free || h.changer) ? '#d9c2ff' : rgba(col, 0.95), 10, true);
    } else {   // SILHOUETTE — shape + theme + tier + exotic mark only, no name
      ctx.fillStyle = '#141009'; ctx.fill(); ctx.strokeStyle = rgba(col, exo ? 0.5 : 0.32); ctx.lineWidth = 1.5; ctx.stroke();
      if (exo) { ctx.save(); ctx.globalAlpha = 0.45 + 0.25 * Math.sin(t / 500 + p.y); ctx.fillStyle = '#b78cff'; ctx.font = '700 10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText('⚡', p.x, p.y + 4); ctx.restore(); }
      else { ctx.fillStyle = rgba(col, 0.4); ctx.font = '8px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText('T' + n.tier, p.x, p.y + 3); }
    }
    ctx.textAlign = 'left';
  }
  function label(x, y, text, col, size, bold) {
    ctx.fillStyle = col; ctx.font = (bold ? '700 ' : '') + size + 'px ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillText(text.length > 16 ? text.slice(0, 15) + '…' : text, x, y); ctx.textAlign = 'left';
  }

  // ── hit-test + tooltip ──
  function hitTest(sx, sy) {
    const L = ensureLayout(), w = toWorld(sx, sy); let best = null, bd = 26 * 26;
    for (const id in L.pos) { const p = L.pos[id]; const d = (p.x - w.x) ** 2 + (p.y - w.y) ** 2; if (d < bd) { bd = d; best = id; } }
    return best;
  }
  function showTip(id) {
    const RR = Game.researchRuntime, R = Game.research, n = R.getNode(id); if (!n || !tip) { hideTip(); return; }
    selId = id;
    const L = ensureLayout(), p = L.pos[id];
    const researched = {}; (RR.researchedIds() || []).forEach(x => researched[x] = 1);
    const hand = RR.handNodes(); const h = hand.find(x => x.node.id === id);
    const col = TH[n.theme] || '#ffb000', exo = !!(n.exotic || n.changerNode);
    const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    let html = '';
    if (researched[id]) {
      html = `<div class="rt-k" style="color:${col}">✓ RESEARCHED${exo ? ' · ⚡' : ''}</div><div class="rt-n">${esc(n.label)}</div><div class="rt-e">${esc(n.desc || '')}</div>`;
    } else if (h) {
      const ribbon = h.free ? '⚡ FREE DROP' : (h.rare ? 'RARE · A TIER EARLY' : (h.changer ? 'ADAPTATION' : `${n.theme.toUpperCase()} · TIER ${n.tier}`));
      const free = RR.freeThreads(), needThr = n.threads || 2;
      const costStr = h.free ? 'FREE' : `◆ ${h.cost} pts`;
      const cant = !h.affordable || free < needThr;
      const why = !h.affordable ? `need ${h.cost} pts` : (free < needThr ? `need ${needThr} threads` : '');
      const acc = (h.free || h.changer) ? '#b78cff' : col;
      html = `<div class="rt-k" style="color:${acc}">${ribbon}</div><div class="rt-n">${esc(n.label)}${exo ? ' ⚡' : ''}</div>`
        + `<div class="rt-e">${esc(n.desc || '')}</div>`
        + `<div class="rt-m">${costStr} · ~${Math.round(n.cost)}s · ${needThr} thr</div>`
        + `<button class="rt-btn${cant ? ' off' : ''}" data-draft="${id}" style="border-color:${acc};color:${acc}">${cant ? esc(why) : '[ DRAFT ]'}</button>`;
    } else {
      html = `<div class="rt-k" style="color:${rgba(col, 0.7)}">● LOCKED · ${n.theme.toUpperCase()} · TIER ${n.tier}${exo ? ' · ⚡ EXOTIC' : ''}</div><div class="rt-e" style="opacity:.7">not offered yet — it can surface in a future hand.</div>`;
    }
    tip.innerHTML = html; tip.hidden = false;
    // position near the node, clamped to the wrap
    const sx = p.x * cam.scale + cam.x, sy = p.y * cam.scale + cam.y;
    const ww = wrap.clientWidth, wh = wrap.clientHeight;
    tip.style.left = Math.max(6, Math.min(ww - tip.offsetWidth - 6, sx - tip.offsetWidth / 2)) + 'px';
    tip.style.top = (sy + 22 + 96 > wh ? Math.max(6, sy - 22 - tip.offsetHeight) : sy + 22) + 'px';
    const btn = tip.querySelector('.rt-btn[data-draft]');
    if (btn && !btn.classList.contains('off')) btn.onclick = (e) => { e.stopPropagation(); if (RR.draft(btn.dataset.draft)) { hideTip(); } };
  }
  function hideTip() { selId = null; if (tip) tip.hidden = true; }

  // ── pointer interaction (pan / pinch / tap) ──
  function bind() {
    cvs.addEventListener('pointerdown', e => {
      cvs.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pointers.size === 1) { panLast = { x: e.offsetX, y: e.offsetY }; downPt = { x: e.offsetX, y: e.offsetY }; moved = 0; }
      else if (pointers.size === 2) { const p = [...pointers.values()]; pinchD = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
    });
    cvs.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pointers.size === 2) {
        const p = [...pointers.values()]; const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
        if (pinchD) zoomAt(mid.x, mid.y, d / pinchD); pinchD = d; moved += 10;
      } else if (panLast) {
        cam.x += e.offsetX - panLast.x; cam.y += e.offsetY - panLast.y; moved += Math.abs(e.offsetX - panLast.x) + Math.abs(e.offsetY - panLast.y);
        panLast = { x: e.offsetX, y: e.offsetY };
      }
    });
    function up(e) {
      if (pointers.size === 1 && downPt && moved < 6) { const id = hitTest(downPt.x, downPt.y); if (id) showTip(id); else hideTip(); }
      pointers.delete(e.pointerId); panLast = null; pinchD = 0;
    }
    cvs.addEventListener('pointerup', up); cvs.addEventListener('pointercancel', up);
    cvs.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.12 : 0.89); }, { passive: false });
  }
  function zoomAt(sx, sy, f) {
    const ns = Math.max(0.3, Math.min(2.4, cam.scale * f)); const k = ns / cam.scale;
    cam.x = sx - (sx - cam.x) * k; cam.y = sy - (sy - cam.y) * k; cam.scale = ns;
  }

  function resizeIfNeeded() {
    const r = cvs.getBoundingClientRect();
    const w = Math.round(r.width * devicePixelRatio), h = Math.round(r.height * devicePixelRatio);
    if (w && h && (cvs.width !== w || cvs.height !== h)) { cvs.width = w; cvs.height = h; fitted = false; }
  }

  function mount(canvas, wrapEl, tipEl) {
    if (cvs === canvas) return; cvs = canvas; wrap = wrapEl; tip = tipEl; ctx = cvs.getContext('2d');
    bind(); fitted = false; loop();
  }
  function loop() {
    requestAnimationFrame(loop);
    if (!cvs || cvs.offsetParent === null) return;
    // auto-center when a NEW hand rolls
    const RR = Game.researchRuntime;
    const sig = RR && RR.handNodes ? RR.handNodes().map(h => h.node.id).join(',') : '';
    if (sig !== lastHandSig) { lastHandSig = sig; hideTip(); if (sig) panTo(handCenter()); }
    draw();
    // keep the tooltip glued to its node while panning/zooming
    if (selId && tip && !tip.hidden) { const p = ensureLayout().pos[selId]; if (p) { const sx = p.x * cam.scale + cam.x, sy = p.y * cam.scale + cam.y, ww = wrap.clientWidth, wh = wrap.clientHeight; tip.style.left = Math.max(6, Math.min(ww - tip.offsetWidth - 6, sx - tip.offsetWidth / 2)) + 'px'; tip.style.top = (sy + 22 + tip.offsetHeight > wh ? Math.max(6, sy - 22 - tip.offsetHeight) : sy + 22) + 'px'; } }
  }

  Game.researchTree = { mount, recenter, hideTip, _layout: ensureLayout,
    _screen: (id) => { const p = ensureLayout().pos[id]; return p ? { x: p.x * cam.scale + cam.x, y: p.y * cam.scale + cam.y } : null; },
    _tap: (id) => showTip(id) };   // test hooks

})();
