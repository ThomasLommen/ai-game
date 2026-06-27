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

  // ── layout: only the VISIBLE nodes (researched + hand) are placed — one ROW per TIER (y),
  //    ordered by THEME, spaced a guaranteed GAP apart (never overlap), labels stagger above/
  //    below. Laying out ONLY the visible cluster keeps it COMPACT so the camera frames it
  //    tightly (a wide full-tree layout left scattered hand nodes far apart). CORE at the top. ──
  function buildLayout() {
    const R = Game.research, vis = visSet();
    const nodes = R.all().filter(n => vis.has(n.id));
    const present = ORDER.filter(t => nodes.some(n => n.theme === t));
    const themeIdx = t => { const i = present.indexOf(t); return i < 0 ? 99 : i; };
    const TIER_H = 132, GAP = 92, TOP = 150, MARGIN = 100;
    const byTier = {};
    nodes.forEach(n => { (byTier[n.tier] = byTier[n.tier] || []).push(n); });
    const pos = {}; let minX = 1e9, maxX = -1e9, maxTier = 1;
    Object.keys(byTier).forEach(tier => {
      const row = byTier[tier].slice().sort((a, b) => (themeIdx(a.theme) - themeIdx(b.theme)) || a.id.localeCompare(b.id));
      const total = (row.length - 1) * GAP, y = TOP + (tier - 1) * TIER_H;
      row.forEach((n, i) => { const x = -total / 2 + i * GAP; pos[n.id] = { x, y, node: n, lab: i % 2 === 1 }; minX = Math.min(minX, x); maxX = Math.max(maxX, x); });
      maxTier = Math.max(maxTier, +tier);
    });
    const dx = MARGIN - (isFinite(minX) ? minX : 0);
    Object.values(pos).forEach(p => p.x += dx);
    const core = { x: isFinite(minX) ? dx : MARGIN, y: TOP - TIER_H * 0.72 };
    const worldW = (isFinite(minX) ? (maxX - minX) : 0) + MARGIN * 2;
    const worldH = TOP + maxTier * TIER_H;
    return { pos, present, worldW, worldH, core };
  }
  function ensureLayout() {
    const sig = [...visSet()].sort().join(',') + '|' + networkOn();   // relayout when the visible cluster changes
    if (!layout || sig !== layoutSig) { layout = buildLayout(); layoutSig = sig; fitted = false; }
    return layout;
  }

  // ── VISIBLE set = researched (picked) + the current draft hand (available). Locked nodes
  //    are HIDDEN (fog) — only the relevant cluster shows, so the tree stays clean. ──
  function visSet() {
    const RR = Game.researchRuntime, set = new Set();
    (RR && RR.researchedIds ? RR.researchedIds() : []).forEach(id => set.add(id));
    (RR && RR.handNodes ? RR.handNodes() : []).forEach(h => set.add(h.node.id));
    return set;
  }
  // walk up parents to the nearest VISIBLE ancestor so a hand node never floats (else CORE).
  function nearestVisibleAncestor(n, vis, L) {
    const seen = new Set(); let frontier = (n.parents || []).slice();
    while (frontier.length) {
      const pid = frontier.shift(); if (seen.has(pid)) continue; seen.add(pid);
      if (vis.has(pid) && L.pos[pid]) return L.pos[pid];
      const pn = Game.research.getNode(pid); if (pn && pn.parents) frontier = frontier.concat(pn.parents);
    }
    return { x: L.core.x, y: L.core.y, node: null };
  }

  // ── camera: fit to the VISIBLE cluster (not the whole hidden tree) ──
  function visBBox() {
    const L = ensureLayout(), vis = visSet();
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    const add = p => { if (!p) return; a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); };
    add(L.core); vis.forEach(id => add(L.pos[id]));
    if (a > c) add({ x: L.worldW / 2, y: L.worldH / 2 });
    return { cx: (a + c) / 2, cy: (b + d) / 2, w: Math.max(80, c - a), h: Math.max(80, d - b) };
  }
  function fit() {
    if (!cvs.width) return;
    const cw = cvs.width / devicePixelRatio, ch = cvs.height / devicePixelRatio;
    const bb = visBBox(), pad = 96;
    cam.scale = Math.max(0.4, Math.min(1.5, Math.min(cw / (bb.w + pad * 2), ch / (bb.h + pad * 2))));
    cam.x = cw / 2 - bb.cx * cam.scale; cam.y = ch / 2 - bb.cy * cam.scale;
    fitted = true;
  }
  function recenter() { fit(); }
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

    const core = L.core, vis = visSet();
    // LINKS — each VISIBLE node to its nearest visible ancestor (or CORE)
    R.all().forEach(n => {
      if (!vis.has(n.id)) return; const p = L.pos[n.id]; if (!p) return;
      const anc = nearestVisibleAncestor(n, vis, L);
      const lit = researched[n.id] || (anc.node && researched[anc.node.id]);
      const col = TH[n.theme] || '#ffb000';
      ctx.strokeStyle = rgba(col, lit ? 0.5 : 0.26); ctx.lineWidth = lit ? 2 : 1.4;
      ctx.beginPath(); ctx.moveTo(anc.x, anc.y); const my = (anc.y + p.y) / 2; ctx.bezierCurveTo(anc.x, my, p.x, my, p.x, p.y); ctx.stroke();
    });
    // CORE
    drawNode({ x: core.x, y: core.y, node: { theme: 'compute' } }, 'core', false, false);
    // NODES — only researched (done) + the hand (available)
    R.all().forEach(n => {
      if (!vis.has(n.id)) return; const p = L.pos[n.id]; if (!p) return;
      drawNode(p, stateOf(n.id, researched, handIds), n.id === activeId, n.id === selId, handIds[n.id]);
    });
  }

  function drawNode(p, st, active, sel, h) {
    const n = p.node, col = TH[n.theme] || '#ffb000', exo = !!(n.exotic || n.changerNode);
    const r = st === 'core' ? 19 : (exo ? 14 : 11);
    const t = Date.now();
    const ly = p.lab ? p.y - r - 7 : p.y + r + 13;   // stagger labels above/below so neighbours don't collide
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
      label(p.x, ly, n.label, rgba(col, 0.92), 10, exo);
    } else if (st === 'hand') {
      ctx.fillStyle = '#1c1408'; ctx.fill(); ctx.strokeStyle = h && (h.free || h.changer) ? '#b78cff' : col; ctx.lineWidth = 2.4; ctx.stroke();
      if (exo) { ctx.fillStyle = '#d9c2ff'; ctx.font = '700 12px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText('⚡', p.x, p.y + 4); }
      label(p.x, ly, n.label, h && (h.free || h.changer) ? '#d9c2ff' : rgba(col, 0.95), 10, true);
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
    const L = ensureLayout(), vis = visSet(), w = toWorld(sx, sy); let best = null, bd = 26 * 26;
    for (const id in L.pos) { if (!vis.has(id)) continue; const p = L.pos[id]; const d = (p.x - w.x) ** 2 + (p.y - w.y) ** 2; if (d < bd) { bd = d; best = id; } }
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
    // position near the node, clamped to the wrap (a non-visible node — e.g. a debug tap — has no
    // layout pos: park the card at the wrap centre).
    const ww = wrap.clientWidth, wh = wrap.clientHeight;
    const sx = p ? p.x * cam.scale + cam.x : ww / 2, sy = p ? p.y * cam.scale + cam.y : wh / 2 - 40;
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
    if (sig !== lastHandSig) { lastHandSig = sig; hideTip(); recenter(); }   // a new hand changes what's visible → refit
    draw();
    // keep the tooltip glued to its node while panning/zooming
    if (selId && tip && !tip.hidden) { const p = ensureLayout().pos[selId]; if (p) { const sx = p.x * cam.scale + cam.x, sy = p.y * cam.scale + cam.y, ww = wrap.clientWidth, wh = wrap.clientHeight; tip.style.left = Math.max(6, Math.min(ww - tip.offsetWidth - 6, sx - tip.offsetWidth / 2)) + 'px'; tip.style.top = (sy + 22 + tip.offsetHeight > wh ? Math.max(6, sy - 22 - tip.offsetHeight) : sy + 22) + 'px'; } }
  }

  Game.researchTree = { mount, recenter, hideTip, _layout: ensureLayout,
    _screen: (id) => { const p = ensureLayout().pos[id]; return p ? { x: p.x * cam.scale + cam.x, y: p.y * cam.scale + cam.y } : null; },
    _tap: (id) => showTip(id) };   // test hooks

})();
