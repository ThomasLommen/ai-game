// ── TD proof: PURE sim (no DOM/canvas) — defend ONE node ──────────────────────
// The node's CONNECTIONS are LANES; attackers march them toward your CORE. You place
// netsec TOWERS along the lanes. Your "loudness" (THREAT) scales the waves. Hold N waves
// or the core breaches. (The tactical layer of the two-sided TD-war — see gameplay-rework.)
(function (global) {
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  const TOWERS = {
    firewall: { name: 'firewall',    cost: 50, range: 95,  dmg: 7,  rate: 2.2, slow: 0,    color: '#ffb000', desc: 'steady single-target' },
    tarpit:   { name: 'tarpit',      cost: 60, range: 85,  dmg: 2,  rate: 1.4, slow: 0.55, color: '#7fa8c9', desc: 'slows what it hits' },
    daemon:   { name: 'kill-daemon', cost: 95, range: 122, dmg: 34, rate: 0.6, slow: 0,    color: '#ff5050', desc: 'heavy, slow-firing' },
  };
  const ATTACKERS = {
    scanner: { name: 'scanner',      hp: 22, speed: 62, bounty: 7,  coredmg: 1, r: 6, color: '#ff9a5a' },
    purge:   { name: 'purge-daemon', hp: 80, speed: 42, bounty: 20, coredmg: 3, r: 9, color: '#ff5050' },
  };

  function distToSeg(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
    let t = ((px - a.x) * dx + (py - a.y) * dy) / L; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
  }
  function posOnLane(lane, dist) {
    for (const sg of lane.segs) {
      if (dist <= sg.start + sg.d || sg === lane.segs[lane.segs.length - 1]) {
        const f = Math.max(0, Math.min(1, (dist - sg.start) / sg.d));
        return { x: sg.a.x + (sg.b.x - sg.a.x) * f, y: sg.a.y + (sg.b.y - sg.a.y) * f };
      }
    }
    return lane.pts[lane.pts.length - 1];
  }

  // ── procedural SNAKING lanes — each from a perimeter spawn, weaving toward the core so
  //    towers at the bends hit a unit multiple times; never the same node twice (seeded). ──
  function laneGeom(pts) {
    let len = 0; const segs = [];
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const d = Math.hypot(b.x - a.x, b.y - a.y); segs.push({ a, b, d, start: len }); len += d; }
    return { pts, segs, len };
  }
  function perimeterPoint(W, H, core, ang) {
    const m = 55, dx = Math.cos(ang), dy = Math.sin(ang);
    const tx = dx > 0 ? (W - m - core.x) / dx : dx < 0 ? (m - core.x) / dx : 1e9;
    const ty = dy > 0 ? (H - m - core.y) / dy : dy < 0 ? (m - core.y) / dy : 1e9;
    const t = Math.min(tx, ty);
    return { x: core.x + dx * t, y: core.y + dy * t };
  }
  function genLanePts(rng, W, H, core, ang) {
    const spawn = perimeterPoint(W, H, core, ang);
    const perp = Math.atan2(core.y - spawn.y, core.x - spawn.x) + Math.PI / 2;
    // A unique WANDER PROFILE per lane = a few sinusoids at random freq/phase/amp. No two lanes
    // (or nodes) share a shape: some come out smooth + lazy, some tight + busy — the RNG decides.
    const harmonics = []; const nH = 2 + Math.floor(rng() * 3);     // 2–4 harmonics
    for (let h = 0; h < nH; h++) harmonics.push({ freq: 0.5 + rng() * 3.4, phase: rng() * Math.PI * 2, amp: 0.4 + rng() * 1.0 });
    let norm = 0; for (const h of harmonics) norm += h.amp;
    const baseAmp = 80 + rng() * 165;       // how wide it wanders
    const bias = (rng() - 0.5) * 1.3;       // a lazy lean to one side
    const steps = 9 + Math.floor(rng() * 11);   // 9–19 waypoints (smoother vs sharper)
    const pts = [spawn];
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 1);
      const bx = spawn.x + (core.x - spawn.x) * t, by = spawn.y + (core.y - spawn.y) * t;
      let off = bias; for (const h of harmonics) off += (h.amp / norm) * Math.sin(t * h.freq * Math.PI * 2 + h.phase);
      off *= baseAmp * Math.sin(Math.PI * t);   // taper: starts at the edge, converges on the core
      let x = bx + Math.cos(perp) * off, y = by + Math.sin(perp) * off;
      x = Math.max(45, Math.min(W - 45, x)); y = Math.max(45, Math.min(H - 45, y));
      pts.push({ x, y });
    }
    pts.push({ x: core.x, y: core.y });
    return pts;
  }
  function genLanes(rng, W, H, core) {
    const n = 3, lanes = [], base = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) { const ang = base + i * (Math.PI * 2 / n) + (rng() - 0.5) * 0.7; lanes.push(laneGeom(genLanePts(rng, W, H, core, ang))); }
    return lanes;
  }
  // Which lanes a wave comes down — a SUBSET (sometimes one, sometimes all), telegraphed in prep.
  function pickWaveLanes(s) {
    const n = s.lanes.length;
    const count = Math.max(1, Math.min(n, 1 + Math.floor(s.rng() * (1 + s.wave * 0.5 + s.threat * 0.04))));
    const idx = [...Array(n).keys()];
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(s.rng() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    s.waveLanes = idx.slice(0, count).sort((a, b) => a - b);
  }

  function create(seed) {
    const rng = mulberry32((seed | 0) || 7);
    const W = 1200, H = 800, core = { x: 600, y: 410, hp: 20, maxHp: 20 };
    const lanes = genLanes(rng, W, H, core);
    const s = {
      W, H, rng, core, lanes, TOWERS, ATTACKERS, GOAL_WAVES: 8,
      attackers: [], towers: [], beams: [], bursts: [], cash: 160, wave: 0, threat: 0, waveLanes: [],
      phase: 'prep', prep: 6, spawnQ: [], spawnT: 0, t: 0, won: false, lost: false, log: [],
    };
    pickWaveLanes(s);   // telegraph the first wave's lanes during the opening prep
    say(s, 'a node of yours. watch the lit lanes — that is where they come. line them before they do.');
    return s;
  }
  function say(s, m) { s.log.push(m); if (s.log.length > 40) s.log.shift(); }

  function buildWave(s) {
    s.wave++;
    const n = 4 + s.wave * 2 + Math.floor(s.threat / 15);
    const hpMul = 1 + s.wave * 0.16 + s.threat * 0.01;
    const q = [];
    for (let i = 0; i < n; i++) {
      const purge = s.wave >= 3 && s.rng() < 0.18 + s.threat * 0.004;
      const def = purge ? ATTACKERS.purge : ATTACKERS.scanner;
      const laneIdx = s.waveLanes.length ? s.waveLanes[Math.floor(s.rng() * s.waveLanes.length)] : Math.floor(s.rng() * s.lanes.length);
      q.push({ type: purge ? 'purge' : 'scanner', laneIdx, hp: Math.round(def.hp * hpMul), delay: i * (0.55 - Math.min(0.3, s.wave * 0.02)) });
    }
    s.spawnQ = q; s.spawnT = 0; s.phase = 'active';
    say(s, `wave ${s.wave} inbound — ${n} hostiles.`);
  }
  function startWaveNow(s) { if (s.phase === 'prep') { s.prep = 0; buildWave(s); return true; } return false; }
  // PROVOKE = "be loud." Only between waves; pays NOTHING up front — it just cranks the THREAT,
  // so the next wave is bigger/from more lanes (and so is the bounty IF you can hold it).
  function provoke(s) {
    if (s.lost || s.won || s.phase !== 'prep') return false;
    s.threat += 10; pickWaveLanes(s);
    say(s, `you got loud — threat ${s.threat}. the incoming wave grows (more bounty if you hold).`);
    return true;
  }

  function placeTower(s, type, x, y) {
    const def = s.TOWERS[type]; if (!def || s.cash < def.cost) return false;
    if (x < 20 || x > s.W - 20 || y < 20 || y > s.H - 20) return false;
    if (Math.hypot(x - s.core.x, y - s.core.y) < 60) return false;
    for (const lane of s.lanes) for (const sg of lane.segs) if (distToSeg(x, y, sg.a, sg.b) < 26) return false;
    for (const tw of s.towers) if (Math.hypot(x - tw.x, y - tw.y) < 34) return false;
    s.cash -= def.cost;
    s.towers.push({ id: 't' + Date.now().toString(36) + Math.floor(s.rng() * 1000), type, x, y, range: def.range, dmg: def.dmg, rate: def.rate, slow: def.slow, cd: 0, level: 1, aim: 0, muzzle: 0 });
    return true;
  }
  function towerUpCost(tw) { return Math.round(TOWERS[tw.type].cost * (0.8 + tw.level * 0.5)); }
  function upgradeTower(s, id) {
    const tw = s.towers.find(t => t.id === id); if (!tw) return false;
    const c = towerUpCost(tw); if (s.cash < c) return false;
    s.cash -= c; tw.level++;
    tw.dmg = Math.round(tw.dmg * 2.3); tw.range += 16; tw.rate *= 1.12;   // >2× per level → one upgrade beats two base towers
    return true;
  }
  function placeValid(s, type, x, y) {
    const def = s.TOWERS[type]; if (!def) return false;
    if (x < 20 || x > s.W - 20 || y < 20 || y > s.H - 20) return false;
    if (Math.hypot(x - s.core.x, y - s.core.y) < 60) return false;
    for (const lane of s.lanes) for (const sg of lane.segs) if (distToSeg(x, y, sg.a, sg.b) < 26) return false;
    for (const tw of s.towers) if (Math.hypot(x - tw.x, y - tw.y) < 34) return false;
    return true;
  }

  function tick(s, dt) {
    if (s.lost || s.won) return;
    s.t += dt;
    if (s.phase === 'prep') { s.prep -= dt; if (s.prep <= 0) buildWave(s); }
    if (s.phase === 'active' && s.spawnQ.length) {
      s.spawnT += dt;
      while (s.spawnQ.length && s.spawnQ[0].delay <= s.spawnT) {
        const a = s.spawnQ.shift();
        s.attackers.push({ id: 'a' + Math.random().toString(36).slice(2, 7), type: a.type, laneIdx: a.laneIdx, dist: 0, x: 0, y: 0, hp: a.hp, maxHp: a.hp, slowT: 0 });
      }
    }
    // move attackers
    for (const at of s.attackers) {
      const def = s.ATTACKERS[at.type];
      const sp = at.slowT > 0 ? def.speed * 0.45 : def.speed;
      at.dist += sp * dt; if (at.slowT > 0) at.slowT -= dt;
      const lane = s.lanes[at.laneIdx]; const p = posOnLane(lane, at.dist); at.x = p.x; at.y = p.y;
      if (at.dist >= lane.len) { s.core.hp -= def.coredmg; at.dead = true; if (s.core.hp <= 0) { s.core.hp = 0; s.lost = true; say(s, '>> CORE BREACHED. they are inside. the node is lost. <<'); } }
    }
    s.attackers = s.attackers.filter(a => !a.dead);
    // towers aim + fire (hitscan beams + muzzle/hit/death FX)
    s.beams = s.beams.filter(b => { b.life -= dt; return b.life > 0; });
    s.bursts = (s.bursts || []).filter(b => { b.life -= dt; return b.life > 0; });
    for (const tw of s.towers) {
      if (tw.muzzle > 0) tw.muzzle = Math.max(0, tw.muzzle - dt);
      let best = null, bd = tw.range;
      for (const at of s.attackers) { const d = Math.hypot(at.x - tw.x, at.y - tw.y); if (d < bd) { bd = d; best = at; } }
      if (best) tw.aim = Math.atan2(best.y - tw.y, best.x - tw.x);   // barrel tracks the nearest target
      tw.cd -= dt; if (tw.cd > 0 || !best) continue;
      tw.cd = 1 / tw.rate; best.hp -= tw.dmg; best.hitT = s.t; tw.muzzle = 0.08;
      if (tw.slow > 0) best.slowT = 1.5;
      s.beams.push({ x1: tw.x, y1: tw.y, x2: best.x, y2: best.y, life: 0.11, color: s.TOWERS[tw.type].color });
      if (best.hp <= 0) { best.dead = true; s.cash += s.ATTACKERS[best.type].bounty; s.bursts.push({ x: best.x, y: best.y, life: 0.35, color: s.ATTACKERS[best.type].color }); }
    }
    s.attackers = s.attackers.filter(a => !a.dead);
    // wave end
    if (s.phase === 'active' && s.spawnQ.length === 0 && s.attackers.length === 0) {
      if (s.wave >= s.GOAL_WAVES) { s.won = true; say(s, '>> HELD. every lane held. the node is yours. <<'); }
      else { s.phase = 'prep'; s.prep = 7; s.threat += 4; pickWaveLanes(s); say(s, `wave ${s.wave} cleared. breathe — and watch the lit lanes.`); }
    }
  }

  global.TD = { create, tick, placeTower, placeValid, upgradeTower, towerUpCost, provoke, startWaveNow, posOnLane, distToSeg, TOWERS, ATTACKERS };
})(typeof window !== 'undefined' ? window : globalThis);
