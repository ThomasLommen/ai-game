// ── Game.hwart — procedural hardware ILLUSTRATIONS ───────────────────────────
// One canvas-drawing engine that turns a machine's class/tier/caps (or a part's slot/tier)
// into a recognizable little silhouette, so hardware reads as DISTINCT at a glance — in the
// facility cam (room-widget), the FACILITY machine rows, and the shop/inventory part cards.
// Pure ctx drawing (DOM-free logic) so it ports cleanly. ([[perimeter-retire-room-window]])
(function () {
  window.Game = window.Game || {};

  // tier vocabulary (shared with loot colouring) → the LED/trim accent
  const TIER_COL = { junk: '#9aa0a6', common: '#ffb000', uncommon: '#76e08a', rare: '#5ab0ff' };
  function tierColor(t) { return TIER_COL[t] || '#ffb000'; }

  const BODY = '#14181c', BODY2 = '#1b2127', EDGE = '#0a0d10';
  function led(ctx, x, y, r, col, on) { ctx.fillStyle = on ? col : '#11161a'; if (on) { ctx.shadowColor = col; ctx.shadowBlur = r * 2.2; } ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
  function rrect(ctx, x, y, w, h) { ctx.beginPath(); ctx.rect(x, y, w, h); }

  // ── WHOLE MACHINE (Act-4 facility unit): silhouette by CLASS, accent by TIER, caps as marks ──
  function machine(ctx, m, x, y, w, h, opt) {
    opt = opt || {};
    const acc = tierColor(m.tier), caps = m.caps || [], small = w < 15;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.6, w * 0.045);
    const cls = m.cls;
    if (cls === 'tower' || cls === 'workstation') drawTower(ctx, cls, x, y, w, h, acc, small);
    else if (cls === 'server') drawServer(ctx, x, y, w, h, acc, small);
    else if (cls === 'mainframe') drawMainframe(ctx, x, y, w, h, acc, small);
    else drawRack(ctx, x, y, w, h, acc, small);                 // 'rack' (default)
    if (!small) drawMachineCaps(ctx, caps, x, y, w, h, acc);
    ctx.restore();
  }

  function drawTower(ctx, cls, x, y, w, h, acc, small) {
    const work = cls === 'workstation';
    const bw = w * (work ? 0.62 : 0.5), bh = h * (work ? 0.96 : 0.86);
    const bx = x + (w - bw) / 2, by = y + h - bh;
    ctx.fillStyle = BODY; ctx.strokeStyle = EDGE; rrect(ctx, bx, by, bw, bh); ctx.fill(); ctx.stroke();
    // drive bays (top)
    ctx.strokeStyle = 'rgba(120,130,140,0.35)';
    for (let i = 0; i < (work ? 3 : 2); i++) { const yy = by + bh * 0.12 + i * bh * 0.09; ctx.beginPath(); ctx.moveTo(bx + bw * 0.18, yy); ctx.lineTo(bx + bw * 0.82, yy); ctx.stroke(); }
    // front vent grille (lower)
    ctx.strokeStyle = 'rgba(90,100,110,0.3)';
    for (let i = 0; i < 4 && !small; i++) { const yy = by + bh * 0.55 + i * bh * 0.09; ctx.beginPath(); ctx.moveTo(bx + bw * 0.2, yy); ctx.lineTo(bx + bw * 0.8, yy); ctx.stroke(); }
    if (work) { ctx.fillStyle = 'rgba(90,170,255,0.10)'; ctx.fillRect(bx + bw * 0.14, by + bh * 0.4, bw * 0.46, bh * 0.5); }   // side window glow
    led(ctx, bx + bw * 0.5, by + bh * 0.06, Math.max(1, w * 0.05), acc, true);   // power LED
  }

  function drawServer(ctx, x, y, w, h, acc, small) {
    const bw = w * 0.96, bh = h * 0.42, bx = x + (w - bw) / 2, by = y + h - bh;
    ctx.fillStyle = BODY; ctx.strokeStyle = EDGE; rrect(ctx, bx, by, bw, bh); ctx.fill(); ctx.stroke();
    // rack ears
    ctx.fillStyle = BODY2; ctx.fillRect(bx, by, bw * 0.06, bh); ctx.fillRect(bx + bw * 0.94, by, bw * 0.06, bh);
    // drive sled slats
    ctx.strokeStyle = 'rgba(120,130,140,0.4)';
    const n = small ? 4 : 8; for (let i = 0; i < n; i++) { const xx = bx + bw * 0.12 + i * (bw * 0.76 / n); ctx.beginPath(); ctx.moveTo(xx, by + bh * 0.2); ctx.lineTo(xx, by + bh * 0.8); ctx.stroke(); }
    // status LEDs
    for (let i = 0; i < 3; i++) led(ctx, bx + bw * 0.16 + i * w * 0.07, by + bh * 0.5, Math.max(0.8, w * 0.03), acc, i < 2);
  }

  function drawRack(ctx, x, y, w, h, acc, small) {
    const bw = w * 0.9, bh = h * 0.98, bx = x + (w - bw) / 2, by = y + h - bh;
    ctx.fillStyle = BODY; ctx.strokeStyle = EDGE; rrect(ctx, bx, by, bw, bh); ctx.fill(); ctx.stroke();
    // vented top
    ctx.fillStyle = BODY2; ctx.fillRect(bx, by, bw, bh * 0.08);
    // stacked server units, each a thin bay with LEDs
    const units = small ? 3 : 5, uh = (bh * 0.88) / units, uy0 = by + bh * 0.1;
    for (let u = 0; u < units; u++) {
      const uy = uy0 + u * uh;
      ctx.strokeStyle = 'rgba(70,80,90,0.5)'; ctx.strokeRect(bx + bw * 0.08, uy + uh * 0.16, bw * 0.84, uh * 0.66);
      for (let i = 0; i < 2; i++) led(ctx, bx + bw * 0.16 + i * w * 0.07, uy + uh * 0.5, Math.max(0.8, w * 0.028), acc, (u + i) % 3 !== 0);
      if (!small) { ctx.strokeStyle = 'rgba(110,120,130,0.3)'; for (let k = 0; k < 4; k++) { const xx = bx + bw * 0.42 + k * bw * 0.11; ctx.beginPath(); ctx.moveTo(xx, uy + uh * 0.22); ctx.lineTo(xx, uy + uh * 0.74); ctx.stroke(); } }
    }
  }

  function drawMainframe(ctx, x, y, w, h, acc, small) {
    const bw = w * 0.98, bh = h * 0.98, bx = x + (w - bw) / 2, by = y + h - bh;
    ctx.fillStyle = BODY; ctx.strokeStyle = EDGE; rrect(ctx, bx, by, bw, bh); ctx.fill(); ctx.stroke();
    // 3 vertical cabinet panels
    const panels = 3, pw = bw / panels;
    for (let p = 0; p < panels; p++) {
      const px = bx + p * pw;
      ctx.strokeStyle = 'rgba(60,70,80,0.6)'; ctx.strokeRect(px + pw * 0.08, by + bh * 0.06, pw * 0.84, bh * 0.88);
      // LED matrix
      const rows = small ? 3 : 6;
      for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) led(ctx, px + pw * 0.32 + c * pw * 0.34, by + bh * 0.16 + r * (bh * 0.7 / rows), Math.max(0.7, w * 0.018), acc, (r * 2 + c + p) % 3 !== 0);
    }
    // glowing accent strip (a mainframe's signature)
    ctx.fillStyle = acc; ctx.globalAlpha = 0.5; ctx.shadowColor = acc; ctx.shadowBlur = w * 0.06;
    ctx.fillRect(bx + bw * 0.1, by + bh * 0.02, bw * 0.8, Math.max(1, h * 0.02)); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  // caps as small distinct marks (top-left/right corners, so they don't fight the body)
  function drawMachineCaps(ctx, caps, x, y, w, h, acc) {
    if (caps.indexOf('gpu') >= 0) { ctx.strokeStyle = acc; ctx.globalAlpha = 0.9; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(x + w * (0.34 + i * 0.18), y + h * 0.2, w * 0.06, 0, 7); ctx.stroke(); } ctx.globalAlpha = 1; }   // dense fans
    if (caps.indexOf('cool') >= 0) { ctx.strokeStyle = '#49d6ff'; ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(0.8, w * 0.03); ctx.beginPath(); ctx.moveTo(x + w * 0.16, y + h * 0.3); ctx.bezierCurveTo(x + w * 0.16, y + h * 0.12, x + w * 0.5, y + h * 0.12, x + w * 0.5, y + h * 0.3); ctx.stroke(); ctx.globalAlpha = 1; }   // coolant loop
    if (caps.indexOf('oc') >= 0) { ctx.strokeStyle = '#ff6a3a'; ctx.shadowColor = '#ff6a3a'; ctx.shadowBlur = w * 0.1; ctx.globalAlpha = 0.8; ctx.strokeRect(x + w * 0.04, y + h * 0.04, w * 0.92, h * 0.92); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }   // hot edge
    if (caps.indexOf('eff') >= 0) led(ctx, x + w * 0.84, y + h * 0.14, Math.max(1, w * 0.05), '#76e08a', true);   // green = efficient
    if (caps.indexOf('refurb') >= 0) { ctx.strokeStyle = 'rgba(200,170,90,0.55)'; ctx.lineWidth = Math.max(0.8, w * 0.03); ctx.beginPath(); ctx.moveTo(x + w * 0.62, y + h * 0.62); ctx.lineTo(x + w * 0.8, y + h * 0.78); ctx.stroke(); }   // taped scuff
  }

  // ── PART (basement hardware): icon by SLOT, accent by TIER ───────────────────
  function part(ctx, slot, opt, x, y, w, h) {
    opt = opt || {};
    const acc = tierColor(opt.tier);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(0.8, w * 0.045);
    const cx = x + w / 2, cy = y + h / 2, s = Math.min(w, h);
    if (slot === 'cpu') partCPU(ctx, cx, cy, s, acc);
    else if (slot === 'ram') partRAM(ctx, x, y, w, h, acc);
    else if (slot === 'gpu') partGPU(ctx, x, y, w, h, acc);
    else if (slot === 'psu') partPSU(ctx, x, y, w, h, acc);
    else if (slot === 'cooling') partCooling(ctx, cx, cy, s, acc);
    else if (slot === 'board' || slot === 'motherboard' || slot === 'core') partBoard(ctx, x, y, w, h, acc);
    else partGeneric(ctx, x, y, w, h, acc);
    ctx.restore();
  }

  function partCPU(ctx, cx, cy, s, acc) {
    const r = s * 0.34;
    ctx.fillStyle = BODY; ctx.strokeStyle = acc;
    ctx.beginPath(); ctx.moveTo(cx - r + s * 0.07, cy - r); ctx.lineTo(cx + r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.lineTo(cx - r, cy + r); ctx.lineTo(cx - r, cy - r + s * 0.07); ctx.closePath(); ctx.fill(); ctx.stroke();   // notched corner
    ctx.fillStyle = BODY2; ctx.fillRect(cx - r * 0.5, cy - r * 0.5, r, r);   // die
    // pins along edges
    ctx.strokeStyle = 'rgba(210,180,90,0.7)';
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * r * 0.34, cy + r); ctx.lineTo(cx + i * r * 0.34, cy + r + s * 0.08); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + i * r * 0.34, cy - r); ctx.lineTo(cx + i * r * 0.34, cy - r - s * 0.08); ctx.stroke(); }
  }
  function partRAM(ctx, x, y, w, h, acc) {
    const bw = w * 0.86, bh = h * 0.5, bx = x + (w - bw) / 2, by = y + (h - bh) / 2;
    ctx.fillStyle = BODY; ctx.strokeStyle = acc; rrect(ctx, bx, by, bw, bh); ctx.fill(); ctx.stroke();
    ctx.fillStyle = BODY2; for (let i = 0; i < 4; i++) ctx.fillRect(bx + bw * 0.1 + i * bw * 0.21, by + bh * 0.16, bw * 0.15, bh * 0.4);   // chips
    ctx.strokeStyle = 'rgba(210,180,90,0.8)'; ctx.beginPath(); ctx.moveTo(bx + bw * 0.1, by + bh); ctx.lineTo(bx + bw * 0.45, by + bh); ctx.moveTo(bx + bw * 0.55, by + bh); ctx.lineTo(bx + bw * 0.9, by + bh); ctx.stroke();   // gold contacts w/ notch
  }
  function partGPU(ctx, x, y, w, h, acc) {
    const bw = w * 0.92, bh = h * 0.56, bx = x + (w - bw) / 2, by = y + (h - bh) / 2;
    ctx.fillStyle = BODY; ctx.strokeStyle = EDGE; rrect(ctx, bx, by, bw, bh); ctx.fill(); ctx.stroke();   // shroud
    ctx.strokeStyle = acc; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(bx + bw * (0.32 + i * 0.34), by + bh * 0.5, bh * 0.3, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(bx + bw * (0.32 + i * 0.34), by + bh * 0.5, bh * 0.07, 0, 7); ctx.stroke(); }   // fans
    ctx.fillStyle = 'rgba(210,180,90,0.7)'; ctx.fillRect(bx, by + bh, bw * 0.5, h * 0.08);   // PCIe contacts
    ctx.strokeStyle = BODY2; ctx.strokeRect(bx + bw * 0.92, by - h * 0.05, bw * 0.1, bh * 0.5);   // bracket
  }
  function partPSU(ctx, x, y, w, h, acc) {
    const bw = w * 0.82, bh = h * 0.7, bx = x + (w - bw) / 2, by = y + (h - bh) / 2;
    ctx.fillStyle = BODY; ctx.strokeStyle = EDGE; rrect(ctx, bx, by, bw, bh); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = acc; ctx.beginPath(); ctx.arc(bx + bw * 0.42, by + bh * 0.5, bh * 0.34, 0, 7); ctx.stroke();   // big fan
    ctx.beginPath(); for (let a = 0; a < 4; a++) { const an = a * Math.PI / 2 + 0.4; ctx.moveTo(bx + bw * 0.42, by + bh * 0.5); ctx.lineTo(bx + bw * 0.42 + Math.cos(an) * bh * 0.3, by + bh * 0.5 + Math.sin(an) * bh * 0.3); } ctx.stroke();   // blades
    ctx.strokeStyle = 'rgba(150,150,160,0.6)'; ctx.beginPath(); ctx.moveTo(bx + bw, by + bh * 0.4); ctx.lineTo(bx + bw + w * 0.08, by + bh * 0.4); ctx.stroke();   // cable
  }
  function partCooling(ctx, cx, cy, s, acc) {
    const r = s * 0.32;
    ctx.strokeStyle = '#6a727a'; ctx.strokeRect(cx - r * 1.05, cy - r * 1.05, r * 2.1, r * 2.1);   // frame
    ctx.strokeStyle = acc; ctx.beginPath(); ctx.arc(cx, cy, r * 0.22, 0, 7); ctx.stroke();   // hub
    for (let a = 0; a < 5; a++) { const an = a * (Math.PI * 2 / 5) + 0.5; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * r * 0.22, cy + Math.sin(an) * r * 0.22); ctx.quadraticCurveTo(cx + Math.cos(an + 0.7) * r * 0.7, cy + Math.sin(an + 0.7) * r * 0.7, cx + Math.cos(an + 0.4) * r, cy + Math.sin(an + 0.4) * r); ctx.stroke(); }   // blades
  }
  function partBoard(ctx, x, y, w, h, acc) {
    const bw = w * 0.86, bh = h * 0.86, bx = x + (w - bw) / 2, by = y + (h - bh) / 2;
    ctx.fillStyle = '#0e2018'; ctx.strokeStyle = acc; rrect(ctx, bx, by, bw, bh); ctx.fill(); ctx.stroke();   // green PCB
    ctx.fillStyle = BODY2; ctx.fillRect(bx + bw * 0.12, by + bh * 0.12, bw * 0.3, bw * 0.3);   // CPU socket
    ctx.strokeStyle = 'rgba(160,170,180,0.5)'; for (let i = 0; i < 3; i++) { const xx = bx + bw * 0.56 + i * bw * 0.13; ctx.beginPath(); ctx.moveTo(xx, by + bh * 0.12); ctx.lineTo(xx, by + bh * 0.6); ctx.stroke(); }   // RAM slots
    ctx.fillStyle = acc; for (let i = 0; i < 4; i++) { ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(bx + bw * 0.2 + i * bw * 0.16, by + bh * 0.78, Math.max(0.8, w * 0.025), 0, 7); ctx.fill(); } ctx.globalAlpha = 1;   // caps
    ctx.strokeStyle = 'rgba(180,150,80,0.4)'; ctx.beginPath(); ctx.moveTo(bx + bw * 0.42, by + bh * 0.5); ctx.lineTo(bx + bw * 0.9, by + bh * 0.5); ctx.stroke();   // a trace
  }
  function partGeneric(ctx, x, y, w, h, acc) {
    const bw = w * 0.7, bh = h * 0.7, bx = x + (w - bw) / 2, by = y + (h - bh) / 2;
    ctx.fillStyle = BODY; ctx.strokeStyle = acc; rrect(ctx, bx, by, bw, bh); ctx.fill(); ctx.stroke();
    led(ctx, bx + bw * 0.5, by + bh * 0.5, Math.max(1, w * 0.05), acc, true);
  }

  // ── paint helper: draw into every undrawn <canvas class="hw-ico"> under `root` ──
  // markup carries data-kind ("machine"|"part") + the attrs the draw needs.
  function paint(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('canvas.hw-ico').forEach(cv => {
      if (cv.dataset.painted === '1') return;
      const r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;                 // not laid out yet — a later render repaints
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      const c = cv.getContext('2d'); if (!c) return;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, r.width, r.height);
      try {
        if (cv.dataset.kind === 'machine') machine(c, { cls: cv.dataset.cls, tier: cv.dataset.tier, caps: (cv.dataset.caps || '').split(',').filter(Boolean) }, 1, 1, r.width - 2, r.height - 2);
        else part(c, cv.dataset.slot, { tier: cv.dataset.tier }, 1, 1, r.width - 2, r.height - 2);
      } catch (e) { /* never let an icon break a render */ }
      cv.dataset.painted = '1';
    });
  }

  // markup helpers (emit a placeholder canvas the next paint() fills)
  function machineIcon(m, cls) { return `<canvas class="hw-ico ${cls || 'ico-machine'}" data-kind="machine" data-cls="${m.cls}" data-tier="${m.tier}" data-caps="${(m.caps || []).join(',')}"></canvas>`; }
  function partIcon(slot, tier, cls) { return `<canvas class="hw-ico ${cls || 'ico-part'}" data-kind="part" data-slot="${slot || ''}" data-tier="${tier || 'common'}"></canvas>`; }

  Game.hwart = { tierColor, machine, part, paint, machineIcon, partIcon };
})();
