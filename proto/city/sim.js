// ── City proof-of-concept: PURE SIMULATION (no DOM, no canvas) ───────────────
// Logic lives here so it ports cleanly to an engine later (the renderer is separate).
// Model: a seeded low-detail city of typed nodes (buildings) + edges (their digital
// links) + drifting dots (people). You start from one owned node and PROPAGATE
// outward (contagion). Verbs act on targets; loud acts raise a global TRACE and a
// per-district ALERT; past a threshold the hunt traces back along your owned network
// toward your origin — COVER (and the SHAPE of your spread) is the counter.
(function (global) {
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // Building types — the verb×target variety. accent = a small color cue (amber stays dominant).
  const TYPES = {
    residence: { glyph: '·', label: 'residence',    defense: 1, value: 0,    accent: '#8a7440' },
    office:    { glyph: 'o', label: 'office',        defense: 2, value: 140,  accent: '#ffb000' },
    bank:      { glyph: '$', label: 'bank',          defense: 5, value: 1100, accent: '#6ee06e' },
    police:    { glyph: '!', label: 'precinct',      defense: 5, value: 0,    accent: '#ff5050', exposure: true },
    server:    { glyph: '#', label: 'server farm',   defense: 3, value: 0,    accent: '#9ab0c4', compute: true },
    tower:     { glyph: 'T', label: 'comms tower',   defense: 2, value: 0,    accent: '#d9b25a', reach: true },
    person:    { glyph: '•', label: 'person',        defense: 1, value: 0,    accent: '#ffcb9a', mobile: true },
  };
  const VERB_COST = { surveil: 1, propagate: 3, exfiltrate: 2, cover: 4, sabotage: 3 };

  function create(seed) {
    const rng = mulberry32((seed | 0) || 12345);
    const W = 2400, H = 1600;
    const DCOLS = 4, DROWS = 3, dW = W / DCOLS, dH = H / DROWS;
    const districts = [];
    for (let r = 0; r < DROWS; r++) for (let c = 0; c < DCOLS; c++) districts.push({ id: districts.length, x: c * dW, y: r * dH, w: dW, h: dH, alert: 0 });

    const nodes = [];
    function addNode(x, y, type, d) {
      const t = TYPES[type];
      nodes.push({ id: nodes.length, x, y, type, label: t.label, defense: t.defense, value: t.value, baseValue: t.value, district: d, conns: [], owned: false, revealed: false, surveilled: false, sabotaged: 0 });
    }
    districts.forEach(d => {
      const count = 6 + Math.floor(rng() * 5);
      for (let i = 0; i < count; i++) {
        const x = d.x + 40 + rng() * (d.w - 80);
        const y = d.y + 40 + rng() * (d.h - 80);
        const rr = rng();
        let type = 'residence';
        if (rr < 0.50) type = 'residence';
        else if (rr < 0.72) type = 'office';
        else if (rr < 0.82) type = 'server';
        else if (rr < 0.90) type = 'tower';
        else if (rr < 0.96) type = 'bank';
        else type = 'police';
        addNode(x, y, type, d.id);
      }
    });

    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    function link(a, b) { if (a.conns.indexOf(b.id) < 0) a.conns.push(b.id); if (b.conns.indexOf(a.id) < 0) b.conns.push(a.id); }
    nodes.forEach(n => {
      const near = nodes.filter(o => o !== n).sort((a, b) => dist(n, a) - dist(n, b));
      const k = n.type === 'tower' ? 5 : 3;
      near.slice(0, k).forEach(o => { if (dist(n, o) < (n.type === 'tower' ? 900 : 360)) link(n, o); });
    });
    const towers = nodes.filter(n => n.type === 'tower');
    towers.forEach(t => { const far = towers.filter(o => o !== t).sort((a, b) => dist(t, b) - dist(t, a))[0]; if (far) link(t, far); });

    // origin: a residence nearest the centre — your first foothold
    let origin = nodes.filter(n => n.type === 'residence').sort((a, b) => Math.hypot(a.x - W / 2, a.y - H / 2) - Math.hypot(b.x - W / 2, b.y - H / 2))[0] || nodes[0];
    origin.owned = true; origin.revealed = true; origin.surveilled = true;
    origin.conns.forEach(id => { nodes[id].revealed = true; });

    const dots = [];
    for (let i = 0; i < 70; i++) { const n = nodes[Math.floor(rng() * nodes.length)]; const cid = n.conns.length ? n.conns[Math.floor(rng() * n.conns.length)] : n.id; dots.push({ a: n.id, b: cid, t: rng(), speed: 0.0006 + rng() * 0.0015 }); }

    // PEOPLE — mobile, low-detail nodes: phones (wander + pause) + a few laptops (sitting still).
    // Transient stepping-stones: their links to nearby buildings update as they move (see tick).
    const PEOPLE = 36;
    for (let i = 0; i < PEOPLE; i++) {
      const d = districts[Math.floor(rng() * districts.length)];
      const x = d.x + 24 + rng() * (d.w - 48), y = d.y + 24 + rng() * (d.h - 48);
      const stationary = rng() < 0.18;        // ~1 in 5 is on a laptop — doesn't move
      const v = 30 + Math.floor(rng() * 55);  // a person's "worth" = identity/data
      nodes.push({ id: nodes.length, type: 'person', label: stationary ? 'laptop user' : 'phone', mobile: true, stationary, x, y, defense: 1, value: v, baseValue: v, district: d.id, conns: [], owned: false, revealed: false, surveilled: false, sabotaged: 0, dest: null, pause: rng() * 2, speed: 16 + rng() * 24 });
    }

    const s = {
      W, H, rng, districts, nodes, dots, originId: origin.id, TYPES, VERB_COST,
      cash: 0, compute: 10, computeMax: 14, computeRegen: 0.7,
      trace: 0, hunt: { active: false, path: [], progress: 0 }, lastLoudId: origin.id,
      caught: 0, log: [], t: 0,
    };
    say(s, 'foothold established. one node. the city does not know you yet.');
    return s;
  }

  function say(s, msg) { s.log.push({ t: s.t, msg }); if (s.log.length > 60) s.log.shift(); }
  function ownedNodes(s) { return s.nodes.filter(n => n.owned); }
  function ownedCount(s, type) { return s.nodes.filter(n => n.owned && (!type || n.type === type)).length; }
  function ownedBuildings(s) { return s.nodes.filter(n => n.owned && !n.mobile).length; }
  function saturation(s) { return ownedBuildings(s) / Math.max(1, s.nodes.filter(n => !n.mobile).length); }
  // your intrusion POWER grows with your (building) empire + owned server farms (the compute flywheel)
  function power(s) { return 1 + ownedCount(s, 'server') * 1.6 + Math.floor(ownedBuildings(s) / 4); }
  function districtAlert(s, n) { return s.districts[n.district].alert; }
  // a node is on the CONTAGION FRONTIER if it's revealed, not yours, and touches something you own —
  // via its own links OR an owned MOBILE person currently linked to it (a roving foothold).
  function reachable(s, n) {
    if (!n.revealed || n.owned) return false;
    if (n.conns.some(id => s.nodes[id].owned)) return true;
    return s.nodes.some(m => m.mobile && m.owned && m.conns.indexOf(n.id) >= 0);
  }
  function spend(s, verb) { const c = s.VERB_COST[verb]; if (s.compute < c) return false; s.compute -= c; return true; }
  function bumpAlert(s, n, amt) { s.districts[n.district].alert = Math.min(100, s.districts[n.district].alert + amt); }

  // ── verbs ──────────────────────────────────────────────────────────────────
  function surveil(s, n) {
    if (!n.revealed || !spend(s, 'surveil')) return false;
    n.surveilled = true;
    n.conns.forEach(id => { s.nodes[id].revealed = true; });   // recon extends sight without compromising
    s.trace = Math.min(100, s.trace + 0.4);
    say(s, `surveilled ${n.label}. ${n.conns.length} links exposed.`);
    return true;
  }
  function propagateOdds(s, n) {   // single source for the success chance (sim + UI preview agree)
    const def = n.defense * (1 + districtAlert(s, n) / 90) * (n.sabotaged > 0 ? 0.5 : 1);
    return Math.max(0.1, Math.min(0.92, power(s) / (power(s) + def)));
  }
  function propagate(s, n) {
    if (!reachable(s, n) || !spend(s, 'propagate')) return false;
    const chance = propagateOdds(s, n);
    if (s.rng() < chance) {
      n.owned = true; n.revealed = true; n.surveilled = true; s.lastLoudId = n.id;
      n.conns.forEach(id => { s.nodes[id].revealed = true; });
      bumpAlert(s, n, 6); s.trace = Math.min(100, s.trace + 3);
      say(s, `propagated into ${n.label}. it's yours.`);
      return true;
    }
    bumpAlert(s, n, 13); s.trace = Math.min(100, s.trace + 5);
    say(s, `intrusion on ${n.label} REPELLED — defenses flagged it. (${Math.round(chance * 100)}% odds)`);
    return false;
  }
  function exfiltrate(s, n) {
    if (!n.owned || n.value <= 0 || !spend(s, 'exfiltrate')) return false;
    const take = Math.round(n.value);
    s.cash += take; n.value = 0;
    bumpAlert(s, n, take / 55); s.trace = Math.min(100, s.trace + take / 130); s.lastLoudId = n.id;
    say(s, `exfiltrated $${take} from ${n.label}. the trail warms.`);
    return true;
  }
  function cover(s) {
    if (!spend(s, 'cover')) return false;
    s.trace = Math.max(0, s.trace - 17);
    // cool the hottest district + push the hunt back a hop
    let hot = s.districts.slice().sort((a, b) => b.alert - a.alert)[0];
    if (hot) hot.alert = Math.max(0, hot.alert - 22);
    if (s.hunt.active) s.hunt.progress = Math.max(0, s.hunt.progress - 1.4);
    say(s, 'scrubbed logs, rerouted, salted the trail. trace falls.');
    return true;
  }
  function sabotage(s, n) {
    if (!(n.owned || reachable(s, n)) || !spend(s, 'sabotage')) return false;
    n.sabotaged = 18;   // seconds of weakened defenses
    s.districts[n.district].alert = Math.max(0, s.districts[n.district].alert - 28);   // blinds local response
    s.trace = Math.min(100, s.trace + 4);
    say(s, `sabotaged ${n.label}. local response goes dark for a while.`);
    return true;
  }

  // ── the traceback hunt: owned-subgraph BFS from your loudest node to origin ───
  function ownedPathToOrigin(s, fromId) {
    if (fromId === s.originId) return [s.originId];
    const prev = {}, seen = {}; const q = [fromId]; seen[fromId] = true;
    while (q.length) {
      const cur = q.shift();
      if (cur === s.originId) { const p = []; let c = s.originId; while (c !== undefined) { p.push(c); c = prev[c]; } return p; } // origin..fromId
      for (const nb of s.nodes[cur].conns) if (!seen[nb] && s.nodes[nb].owned) { seen[nb] = true; prev[nb] = cur; q.push(nb); }
    }
    return [s.originId, fromId];
  }
  function raid(s) {
    // the hunt reached home. a setback (not game-over — this is a sandbox): lose the
    // exposed frontier + a cash hit, trace resets. The shape that got you traced is culled.
    const path = s.hunt.path;
    const cull = path.slice(0, Math.min(3, path.length - 1));   // nodes nearest the breach
    cull.forEach(id => { const n = s.nodes[id]; if (id !== s.originId) { n.owned = false; n.surveilled = false; } });
    const lost = Math.round(s.cash * 0.35); s.cash -= lost;
    s.trace = 18; s.hunt = { active: false, path: [], progress: 0 }; s.caught++;
    s.districts.forEach(d => d.alert = Math.max(0, d.alert - 30));
    say(s, `>> RAIDED. they followed the trail home. ${cull.length} nodes burned, $${lost} seized. lie low. <<`);
  }

  function tick(s, dt) {
    s.t += dt;
    s.compute = Math.min(s.computeMax, s.compute + s.computeRegen * (1 + ownedCount(s, 'server') * 0.35) * dt);
    s.districts.forEach(d => d.alert = Math.max(0, d.alert - 1.1 * dt));        // alert cools
    s.nodes.forEach(n => { if (n.sabotaged > 0) n.sabotaged = Math.max(0, n.sabotaged - dt); if (n.baseValue > 0 && n.value < n.baseValue) n.value = Math.min(n.baseValue, n.value + n.baseValue * 0.03 * dt); });
    s.dots.forEach(p => { p.t += p.speed * dt * 60; if (p.t >= 1) { p.t = 0; const n = s.nodes[p.b]; p.a = p.b; p.b = n.conns.length ? n.conns[Math.floor(s.rng() * n.conns.length)] : p.a; } });

    // PEOPLE: phones wander toward a destination + pause now and then; laptops sit still. Their
    // links to nearby buildings refresh as they move — and they surface near territory you've reached.
    s.peopleTimer = (s.peopleTimer || 0) + dt;
    const relink = s.peopleTimer >= 0.4; if (relink) s.peopleTimer = 0;
    for (const m of s.nodes) {
      if (!m.mobile) continue;
      if (!m.stationary) {
        if (m.pause > 0) m.pause -= dt;
        else {
          if (!m.dest || Math.hypot(m.dest.x - m.x, m.dest.y - m.y) < 8) {
            const b = s.nodes[Math.floor(s.rng() * s.nodes.length)];
            m.dest = { x: Math.max(10, Math.min(s.W - 10, b.x + (s.rng() - 0.5) * 130)), y: Math.max(10, Math.min(s.H - 10, b.y + (s.rng() - 0.5) * 130)) };
            if (s.rng() < 0.5) m.pause = 0.6 + s.rng() * 2.6;   // stop from time to time
          }
          const dx = m.dest.x - m.x, dy = m.dest.y - m.y, d = Math.hypot(dx, dy) || 1;
          m.x += dx / d * m.speed * dt; m.y += dy / d * m.speed * dt;
        }
      }
      if (relink) {
        m.conns = s.nodes.filter(o => !o.mobile && Math.hypot(o.x - m.x, o.y - m.y) < 150).sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y)).slice(0, 3).map(o => o.id);
        if (!m.revealed && m.conns.some(id => s.nodes[id].revealed || s.nodes[id].owned)) m.revealed = true;
      }
    }

    // hunt
    const H = s.hunt;
    if (!H.active && s.trace >= 42) {
      const from = s.nodes[s.lastLoudId] && s.nodes[s.lastLoudId].owned ? s.lastLoudId : (ownedNodes(s).sort((a, b) => districtAlert(s, b) - districtAlert(s, a))[0] || s.nodes[s.originId]).id;
      H.active = true; H.path = ownedPathToOrigin(s, from); H.progress = 0;
      say(s, 'a thread caught. something is tracing back along your network…');
    }
    if (H.active) {
      if (s.trace < 24) { H.progress -= dt * 0.6; if (H.progress <= 0) { H.active = false; H.path = []; say(s, 'the trail went cold. they lost you — for now.'); } }
      else { H.progress += dt * (0.28 + s.trace / 240); if (H.progress >= H.path.length - 1) raid(s); }
    }
  }

  global.CitySim = { create, tick, surveil, propagate, propagateOdds, exfiltrate, cover, sabotage, reachable, power, ownedNodes, ownedCount, saturation, districtAlert, ownedPathToOrigin, say, TYPES, VERB_COST };
})(typeof window !== 'undefined' ? window : globalThis);
