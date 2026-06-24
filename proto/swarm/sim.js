// ── proto/swarm: PURE sim (no DOM/canvas) — 360° SWARM DEFENSE ───────────────
// You are a fixed central CORE. Hostiles fade in from the fog on all sides and
// converge on you. You spend COMPUTE (regen + kill-spike) to field TYPED swarm-
// FLOCKS (auto-fight by STANCE), a HERO (tripod), and a CORE-GUN with ammo types.
// Continuous pressure + telegraphed SURGES. STATES (poison) + exotic RULE-REWRITERS
// (hive / flamethrower / contagion-bloom) = the build. Validates the loop is fun +
// readable before we thread it into the real game. (See gameplay-rework memory.)
(function (global) {
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const TAU = Math.PI * 2;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  // ── data ──────────────────────────────────────────────────────────────────
  const SWARMS = {
    hunter: { name: 'hunter', color: '#49d2ff', behavior: 'lock',  cost: 45, cap: 18, dotHp: 7, dotDmg: 12, speed: 340, desc: 'locks one target · anti-elite' },
    locust: { name: 'locust', color: '#ffc23a', behavior: 'swirl', cost: 45, cap: 28, dotHp: 4, dotDmg: 4,  speed: 390, desc: 'swirls a cluster · anti-horde' },
    leech:  { name: 'leech',  color: '#76e08a', behavior: 'peel',  cost: 55, cap: 22, dotHp: 5, dotDmg: 5,  speed: 360, applies: 'poison', desc: 'peels off · spreads contagion' },
    brood:  { name: 'brood',  color: '#ffd24a', behavior: 'peel',  cost: 0,  cap: 10, dotHp: 4, dotDmg: 6,  speed: 320, applies: null, desc: 'fabricator drones' },   // hidden — spawned by the FABRICATOR, not on the palette
  };
  const ENEMIES = {
    probe:     { name: 'probe',     hp: 24,  speed: 48, coredmg: 1, dotDmg: 5,  bounty: 6,  r: 9,  color: '#ff6a5a', elite: false },
    enforcer:  { name: 'enforcer',  hp: 155, speed: 33, coredmg: 4, dotDmg: 15, bounty: 26, r: 17, color: '#ff49c4', elite: true  },
    rusher:    { name: 'rusher',    hp: 16,  speed: 90, coredmg: 2, dotDmg: 4,  bounty: 7,  r: 7,  color: '#ff9a3a', elite: false },                 // fast glass sprinter
    ward:      { name: 'ward',      hp: 70,  speed: 30, coredmg: 3, dotDmg: 10, bounty: 22, r: 13, color: '#ff5a8a', elite: true,  shield: 70 },     // regen shield eats chip dmg
    splitter:  { name: 'splitter',  hp: 60,  speed: 32, coredmg: 2, dotDmg: 7,  bounty: 16, r: 13, color: '#ff7a3a', elite: false, splits: 3 },      // bursts into spawnlings
    spawnling: { name: 'spawnling', hp: 10,  speed: 62, coredmg: 1, dotDmg: 3,  bounty: 3,  r: 6,  color: '#ffb060', elite: false },                 // splitter child
    disruptor: { name: 'disruptor', hp: 95,  speed: 28, coredmg: 3, dotDmg: 8,  bounty: 24, r: 14, color: '#c060ff', elite: true,  jam: 105 },       // jams nearby swarms
    juggernaut:{ name: 'juggernaut',hp: 2200,speed: 20, coredmg: 14, dotDmg: 22,bounty: 120,r: 30, color: '#ff2884', elite: true,  shield: 300 },     // THE BOSS — huge, shielded, slow, brutal
  };
  const AMMO = {
    kinetic:   { name: 'kinetic',   dmg: 22, rate: 1.5,  pspeed: 800, splash: 0,  poison: 0, color: '#ffd9a0', desc: 'fast direct rounds' },
    contagion: { name: 'contagion', dmg: 9,  rate: 0.85, pspeed: 430, splash: 66, poison: 9, color: '#76e08a', desc: 'slow · poisons + spreads' },
  };
  // GREATER UNITS (the hero tier) — persistent, level via field XP, COMPUTE-summoned. One per type (re-summon = refit).
  const UNITS = {
    strider: { name: 'strider', color: '#ff9e6b', cost: 80,  hp: 300, dmg: 60, r: 13, behavior: 'striker',   role: 'roams + railguns the heavies' },
    bulwark: { name: 'bulwark', color: '#c8b27a', cost: 95,  hp: 820, dmg: 10, r: 25, behavior: 'anchor',    movable: true, role: 'a WALL you place on a lane — blocks + grinds' },
    siege:   { name: 'siege',   color: '#e0913f', cost: 115, hp: 240, dmg: 48, r: 16, behavior: 'artillery', movable: true, role: 'artillery you place — lobs cluster rockets' },
    glacier:    { name: 'glacier',    color: '#8fd4ff', cost: 105, hp: 320, dmg: 7,  r: 15, behavior: 'cryo',       role: 'roams — chills, then FREEZES (shatter)' },
    conductor:  { name: 'conductor',  color: '#caa6ff', cost: 95,  hp: 260, dmg: 0,  r: 14, behavior: 'support',    role: 'plants in the swarm — OVERCLOCKS nearby flocks' },
    reaper:     { name: 'reaper',     color: '#9ef0c0', cost: 105, hp: 230, dmg: 28, r: 13, behavior: 'reaper',     role: 'fast — DETONATES poison + EXECUTES the weak' },
    fabricator: { name: 'fabricator', color: '#ffd24a', cost: 120, hp: 380, dmg: 0,  r: 23, behavior: 'fabricator', role: 'slow — PRINTS mini-drones that swarm' },
  };

  // ── LANES (ported from the TD proof) — procedural snaking paths from the fog edge to the core ──
  function distToSeg(px, py, a, b) { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1; let t = ((px - a.x) * dx + (py - a.y) * dy) / L; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t)); }
  function posOnLane(lane, d) { for (const sg of lane.segs) { if (d <= sg.start + sg.d || sg === lane.segs[lane.segs.length - 1]) { const f = Math.max(0, Math.min(1, (d - sg.start) / sg.d)); return { x: sg.a.x + (sg.b.x - sg.a.x) * f, y: sg.a.y + (sg.b.y - sg.a.y) * f }; } } return lane.pts[lane.pts.length - 1]; }
  function laneGeom(pts) { let len = 0; const segs = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y); segs.push({ a, b, d, start: len }); len += d; } return { pts, segs, len }; }
  function perimeterPoint(W, H, core, ang) { const m = 60, dx = Math.cos(ang), dy = Math.sin(ang); const tx = dx > 0 ? (W - m - core.x) / dx : dx < 0 ? (m - core.x) / dx : 1e9; const ty = dy > 0 ? (H - m - core.y) / dy : dy < 0 ? (m - core.y) / dy : 1e9; return { x: core.x + dx * Math.min(tx, ty), y: core.y + dy * Math.min(tx, ty) }; }
  function genLanePts(rng, W, H, core, ang) {
    const spawn = perimeterPoint(W, H, core, ang), perp = Math.atan2(core.y - spawn.y, core.x - spawn.x) + Math.PI / 2;
    const harmonics = [], nH = 2 + Math.floor(rng() * 3); for (let h = 0; h < nH; h++) harmonics.push({ freq: 0.5 + rng() * 3.4, phase: rng() * Math.PI * 2, amp: 0.4 + rng() * 1.0 });
    let norm = 0; for (const h of harmonics) norm += h.amp;
    const baseAmp = 110 + rng() * 230, bias = (rng() - 0.5) * 1.3, steps = 10 + Math.floor(rng() * 12), pts = [spawn];
    for (let i = 1; i <= steps; i++) { const t = i / (steps + 1), bx = spawn.x + (core.x - spawn.x) * t, by = spawn.y + (core.y - spawn.y) * t; let off = bias; for (const h of harmonics) off += (h.amp / norm) * Math.sin(t * h.freq * Math.PI * 2 + h.phase); off *= baseAmp * Math.sin(Math.PI * t); let x = bx + Math.cos(perp) * off, y = by + Math.sin(perp) * off; pts.push({ x: Math.max(45, Math.min(W - 45, x)), y: Math.max(45, Math.min(H - 45, y)) }); }
    pts.push({ x: core.x, y: core.y }); return pts;
  }
  function genLanes(rng, W, H, core) { const n = 4, lanes = [], base = rng() * Math.PI * 2; for (let i = 0; i < n; i++) { const ang = base + i * (Math.PI * 2 / n) + (rng() - 0.5) * 0.7; lanes.push(laneGeom(genLanePts(rng, W, H, core, ang))); } return lanes; }
  function pickWaveLanes(s) { const n = s.lanes.length; if (!n) { s.waveLanes = []; return; } const count = Math.max(1, Math.min(n, 1 + Math.floor(s.rng() * (1 + s.surge * 0.5)))); const idx = [...Array(n).keys()]; for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(s.rng() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; } s.waveLanes = idx.slice(0, count).sort((a, b) => a - b); }

  function create(seed, laneMode, startCompute, ambient, opts) {
    opts = opts || {};   // opts = battle shape (a TRAP's bait reshapes the climax): { surges, boss, escort, regen }
    const rng = mulberry32((seed | 0) || 7);
    const W = ambient ? 480 : 2000, H = ambient ? 290 : 1280;   // ambient = the small always-on idle-defense window (tight, core-centred)
    const s = {
      W, H, rng, t: 0, seed: (seed | 0) || 7,
      core: { x: W / 2, y: H / 2, hp: 100, maxHp: 100, lvl: 1, fn: 'mark', markId: null, ammo: 'kinetic', cd: 0 },
      viewR: ambient ? 200 : 600, spawnR: ambient ? 175 : 820, ambient: !!ambient,
      // COMPUTE is no longer a hoard-and-spend currency — it's a fixed pool you ALLOCATE
      // live across 3 channels (Offense / Shield / Core-gun). `alloc` = your target split,
      // `allocEff` = the live value that LERPS toward it (momentum, so a swing takes ~0.6s).
      // Units/core scale from their channel's share. (battle-duel-rework slice 1.)
      alloc:    { offense: 34, shield: 33, core: 33 },
      allocEff: { offense: 34, shield: 33, core: 33 },
      counter: null, threatRead: null,    // THE DUEL: the guard reads your lean + counters that channel (slice 2)
      pick: null, picksTaken: [], picksOff: !!opts.picksOff,   // one make-or-break PICK per round (slice 3); picksOff = headless sims

      chBonus: { offense: 0, shield: 0, core: 0 }, podCap: 2, coreBase: 100, pierce: 0, counterResist: 0, feint: 0, regenMul: 1,
      flocks: [], enemies: [], shots: [], beams: [], bursts: [], waves: [],
      units: [],
      lanes: [], waveLanes: [], laneMode: laneMode !== false,   // laneMode ON by default — enemies snake down lanes (vs open 360)
      stance: 'guard',              // guard (intercept nearest core) | hunt (elites) | press (engage far)
      maxFlocks: 6,                 // swarms are the star — 6 flocks base (upgrades/hive push higher)
      threat: 0, surge: 0, GOAL_SURGES: opts.surges || 8, kills: 0, bossSpawned: false,   // GOAL_SURGES = the surge the BOSS arrives on (the run's climax)
      boss: opts.boss || 'juggernaut', bossEscort: (opts.escort != null) ? opts.escort : 6,   // the climax — what's drawn in + escort count (a trap's bait reshapes this)
      spawnAccum: 0, surgeT: 9, warn: null,    // warn = { ang, t } surge telegraph
      ex: { hive: false, flame: false, bloom: false },
      unlocked: { hunter: true },   // START with ONE swarm — the rest are drafted in as surges hit
      draft: null,
      won: false, lost: false, log: [],
      SWARMS, ENEMIES, AMMO, UNITS, nextId: 1,
    };
    // campaign BUILD-MAPPING (battle.js folds these in): pre-engaged exotics + pre-unlocked
    // roster from your adaptations/agents, so a developed build starts armed, not bare.
    if (Array.isArray(opts.ex)) opts.ex.forEach(k => { if (k in s.ex) s.ex[k] = true; });
    if (s.ex.hive) s.maxFlocks = 10;
    if (Array.isArray(opts.unlock)) opts.unlock.forEach(t => { if (SWARMS[t] || UNITS[t]) s.unlocked[t] = true; });
    if (s.laneMode) { s.lanes = genLanes(rng, W, H, s.core); pickWaveLanes(s); }
    say(s, s.laneMode ? 'a node of yours. they come down the lanes — watch the lit ones. BUDGET your compute. hold the core.'
                      : 'a node of yours. they come from the dark — every side. BUDGET your compute. hold the core.');
    ensureField(s);   // your roster auto-deploys; the DIAL governs how strong it is
    return s;
  }
  function say(s, m) { s.log.push(m); if (s.log.length > 40) s.log.shift(); }
  const uid = s => 'u' + (s.nextId++);

  // ── COMPUTE ALLOCATION DIAL (the new tactical layer) ─────────────────────────
  const CHANNELS = ['offense', 'shield', 'core'];
  // effective multiplier for a channel: even split (33.3%) → 1.0; all-in (≈100%) → ≈2.1; starved (≈0%) → 0.45.
  function chMult(s, ch) { return 0.45 + (s.allocEff[ch] || 0) * 0.0165 + (s.chBonus[ch] || 0); }   // picks add flat channel bonuses
  function od(s, v) { return v * chMult(s, 'offense'); }   // OFFENSE-scaled army damage
  // set one channel's TARGET %, giving way proportionally from the other two (each floored at 5%), renormalized to 100.
  function setAlloc(s, ch, pct) {
    if (CHANNELS.indexOf(ch) < 0) return;
    pct = Math.max(5, Math.min(90, pct));
    const others = CHANNELS.filter(c => c !== ch), a = s.alloc;
    const osum = others.reduce((t, c) => t + a[c], 0) || 1, remain = 100 - pct;
    a[ch] = pct; others.forEach(c => { a[c] = Math.max(5, remain * (a[c] / osum)); });
    const tot = CHANNELS.reduce((t, c) => t + a[c], 0) || 1, k = 100 / tot;
    CHANNELS.forEach(c => { a[c] = Math.round(a[c] * k); });
    const drift = 100 - CHANNELS.reduce((t, c) => t + a[c], 0); a[ch] += drift;   // park rounding on the channel you set
  }
  function nudgeAlloc(s, ch, delta) { setAlloc(s, ch, (s.alloc[ch] || 0) + delta); }
  function tickAlloc(s, dt) {                                // lerp the live split toward the target (momentum)
    const k = Math.min(1, dt * 1.6);                        // ~0.6s to mostly catch up
    CHANNELS.forEach(c => { s.allocEff[c] += (s.alloc[c] - s.allocEff[c]) * k; });
  }
  // your ROSTER auto-deploys — no summoning-by-spend. One flock per unlocked swarm, up to 2 pods.
  function ensureField(s) {
    if (s.won || s.lost) return;
    for (const t in SWARMS) { if (t === 'brood' || !s.unlocked[t]) continue; if (s.flocks.length >= s.maxFlocks) break; if (!s.flocks.some(f => f.type === t && !f.owned)) summonFlock(s, t); }
    for (const t in UNITS) { if (!s.unlocked[t]) continue; if (s.units.length >= (s.podCap || 2)) break; if (!s.units.some(u => u.type === t)) fieldUnit(s, t); }
  }
  function spend(s, n) { return true; }                     // compute is no longer spent — kept as a no-op so existing call sites stay intact
  function flockCap(s, type) { return SWARMS[type].cap + (s.ex.hive ? 5 : 0); }

  function summonFlock(s, type) {
    const def = SWARMS[type]; if (!def || s.won || s.lost) return false;
    if (s.flocks.length >= s.maxFlocks) { say(s, 'flock cap reached — the hive adaptation fields more.'); return false; }
    if (!spend(s, def.cost)) return false;
    const cap = flockCap(s, type);
    const f = { id: uid(s), type, color: def.color, behavior: def.behavior, applies: def.applies || null, cap, dots: [], tgtId: null, tx: null, ty: null, cx: s.core.x, cy: s.core.y, tgtT: 0, regenT: 0 };
    for (let i = 0; i < cap; i++) f.dots.push(spawnDot(s, f));
    s.flocks.push(f);
    say(s, `${def.name} swarm online — ${cap} units.`);
    return true;
  }
  function spawnDot(s, f) {
    let ox = s.core.x, oy = s.core.y, on = false;
    if (f.owned) { const o = s.units.find(u => u.id === f.owned); if (o) { ox = o.x; oy = o.y; on = true; } }   // brood prints ON its fabricator
    const a = s.rng() * TAU, r = on ? s.rng() * 13 : 26 + s.rng() * 34;
    return { x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r, vx: 0, vy: 0, hp: SWARMS[f.type].dotHp };
  }

  function unitCost(s, type) { const u = s.units.find(u => u.type === type); return u ? Math.round(UNITS[type].cost * (0.7 + u.lvl * 0.55)) : UNITS[type].cost; }
  function fieldUnit(s, type) {
    const d = UNITS[type]; if (!d || s.won || s.lost) return false;
    const ex = s.units.find(u => u.type === type);
    if (ex) {                                                   // re-summon a type you own = REFIT it (one per type keeps the field uncrowded)
      if (!spend(s, unitCost(s, type))) return false;
      ex.lvl++; ex.dmg = Math.round(ex.dmg * 1.4); ex.maxHp = Math.round(ex.maxHp * 1.25); ex.hp = ex.maxHp;
      say(s, `${d.name} refit to mk${ex.lvl}.`); return true;
    }
    if (s.units.length >= (s.podCap || 2)) { say(s, `pod cap reached — only ${s.podCap || 2} pods at a time.`); return false; }
    if (!spend(s, d.cost)) return false;
    const ang = s.rng() * TAU, rr = 78, sx = s.core.x + Math.cos(ang) * rr, sy = s.core.y + Math.sin(ang) * rr;
    s.units.push({ id: uid(s), type, behavior: d.behavior, color: d.color, r: d.r, x: sx, y: sy, vx: 0, vy: 0, hp: d.hp, maxHp: d.hp, lvl: 1, xp: 0, dmg: d.dmg, cd: 0, walk: 0, aim: 0, thumpT: 0, moveTo: d.movable ? { x: sx, y: sy } : null });
    say(s, `${d.name} deployed — ${d.role}.`); return true;
  }
  function moveUnit(s, id, x, y) {                          // player repositions a movable pod (bulwark/siege)
    const u = s.units.find(u => u.id === id); if (!u || !UNITS[u.type].movable) return false;
    u.moveTo = { x: Math.max(30, Math.min(s.W - 30, x)), y: Math.max(30, Math.min(s.H - 30, y)) };
    return true;
  }
  function coreCost(s) { return 50 + s.core.lvl * 45; }
  function upgradeCore(s) { if (s.won || s.lost || !spend(s, coreCost(s))) return false; s.core.lvl++; say(s, `core-gun tuned to v${s.core.lvl}.`); return true; }
  function swapAmmo(s) { s.core.ammo = s.core.ammo === 'kinetic' ? 'contagion' : 'kinetic'; say(s, `core-gun loaded: ${s.core.ammo}.`); }
  function setStance(s, st) { s.stance = st; say(s, `swarm stance: ${st}.`); }
  function toggleEx(s, k) {
    s.ex[k] = !s.ex[k];
    if (k === 'hive') { s.maxFlocks = s.ex.hive ? 10 : 6; s.flocks.forEach(f => f.cap = flockCap(s, f.type)); }
    say(s, `adaptation ${k} ${s.ex[k] ? 'engaged — the board shifts.' : 'disengaged.'}`);
  }

  // ── per-run DRAFT GATE: start with a STARTER set, draft the rest in as surges hit ──
  const DRAFTABLE = ['hunter', 'locust', 'leech', 'strider', 'bulwark', 'siege', 'glacier', 'conductor', 'reaper', 'fabricator'];
  function offerDraft(s) {
    if (s.draft || s.won || s.lost) return;
    const locked = DRAFTABLE.filter(t => !s.unlocked[t]); if (!locked.length) return;
    for (let i = locked.length - 1; i > 0; i--) { const j = Math.floor(s.rng() * (i + 1)); const t = locked[i]; locked[i] = locked[j]; locked[j] = t; }
    s.draft = { picks: locked.slice(0, Math.min(3, locked.length)) };
    say(s, 'a RESEARCH DRAFT opens — bring one new unit online before the surge lands.');
  }
  function pickDraft(s, type) {
    if (!s.draft) return false;
    if (type && s.draft.picks.indexOf(type) >= 0) { s.unlocked[type] = true; say(s, `drafted ${(SWARMS[type] || UNITS[type]).name} — now buildable.`); }
    else say(s, 'draft skipped.');
    s.draft = null; return true;
  }

  // ── THE DUEL: the guard reads your dominant lean + counters that channel ───────
  // You COMMIT by where you pour compute; each surge the guard reads your lean and
  // floods the anti-build for it, scaled to how hard you've leaned. Counter = a soft
  // TAX, not a wall (it LAGS your lean by a round → outrace / diversify / bait-pivot).
  const COUNTER = {
    offense: { read: 'OFFENSE',  tell: 'hardening its shells — shielded breakers inbound', add: ['ward', 'disruptor'], shield: 95 },   // anti-swarm: tanky + jam blunts your DPS
    shield:  { read: 'SHIELD',   tell: 'massing breakers — they will hit the core harder',   add: ['enforcer', 'rusher'], coredmg: 1.1 },  // anti-turtle: raw core pressure
    core:    { read: 'CORE-GUN', tell: 'flooding fast rushers — they outrun your core',       add: ['rusher'],              speed: 0.6 },   // anti-core: speed overwhelms the function
  };
  function readLean(s) { let ch = 'offense', v = -1; CHANNELS.forEach(c => { if (s.allocEff[c] > v) { v = s.allocEff[c]; ch = c; } }); return { ch, share: v }; }
  function armCounter(s) {                                   // read the lean at telegraph time → lock the counter for the incoming surge
    const { ch, share } = readLean(s);
    let mag = Math.max(0, Math.min(1, (share - 40 - (s.feint || 0)) / 45));  // ≤40% even-ish = no counter; FEINT softens the read
    mag *= (1 - (s.counterResist || 0));                      // ADAPTIVE PLATING blunts the counter
    if (mag < 0.06) { s.counter = null; s.threatRead = null; return; }
    s.counter = { channel: ch, mag };
    s.threatRead = `the guard reads your ${COUNTER[ch].read} — ${COUNTER[ch].tell}.`;
    say(s, '>> ' + s.threatRead + ' <<');
  }
  function applyCounter(s, e) {                              // bake the locked counter into a surge enemy's stats
    const c = s.counter; if (!c) return; const def = COUNTER[c.channel];
    if (def.shield) { const add = def.shield * c.mag; e.shield += add; e.shieldMax += add; }
    if (def.coredmg) e.coredmgMul = 1 + def.coredmg * c.mag;
    if (def.speed) e.speedMul = 1 + def.speed * c.mag;
  }

  // ── THE PICKS: one make-or-break choice per round reshapes your build ─────────
  // Baseline deck (slice 3). Some stack (channel overclocks), some cap out. Several
  // answer the DUEL directly (pierce/adaptive/feint) so a hand can address the counter.
  const PICKS = [
    { id: 'od_offense', name: 'OVERCLOCK · OFFENSE', kind: 'offense', desc: '+0.3 to your offense multiplier (swarm + pod damage)', apply: s => { s.chBonus.offense += 0.3; } },
    { id: 'od_shield',  name: 'REINFORCE · SHIELD',  kind: 'shield',  desc: '+0.3 to your shield multiplier (core HP + regen)',     apply: s => { s.chBonus.shield += 0.3; } },
    { id: 'od_core',    name: 'TUNE · CORE-GUN',     kind: 'core',    desc: '+0.3 to your core-gun multiplier (function potency)',   apply: s => { s.chBonus.core += 0.3; } },
    { id: 'swarm_cap',  name: 'SWARM EXPANSION',     kind: 'cap',  max: 3, desc: '+2 swarm flock cap', apply: s => { s.maxFlocks += 2; } },
    { id: 'extra_pod',  name: 'EXTRA POD BAY',       kind: 'cap',  max: 2, desc: '+1 fielded pod',     apply: s => { s.podCap += 1; } },
    { id: 'pierce',     name: 'PIERCING ROUNDS',     kind: 'edge', max: 2, desc: 'your army punches through 40% of enemy shields',   apply: s => { s.pierce = Math.min(0.8, s.pierce + 0.4); } },
    { id: 'hardened',   name: 'HARDENED CORE',       kind: 'edge', max: 3, desc: '+50 base core HP',   apply: s => { s.coreBase += 50; } },
    { id: 'selfrepair', name: 'SELF-REPAIR',         kind: 'edge', max: 2, desc: 'core regen doubled', apply: s => { s.regenMul *= 2; } },
    { id: 'adaptive',   name: 'ADAPTIVE PLATING',    kind: 'duel', max: 2, desc: "the guard's counter bites 35% less",               apply: s => { s.counterResist = Math.min(0.7, s.counterResist + 0.35); } },
    { id: 'feint',      name: 'FEINT PROTOCOL',      kind: 'duel', max: 2, desc: 'the guard misreads your lean — softer counters',   apply: s => { s.feint += 12; } },
  ];
  function pickCount(s, id) { let n = 0; for (const x of s.picksTaken) if (x === id) n++; return n; }
  function offerPick(s) {
    if (s.pick || s.won || s.lost || s.picksOff) return;
    const avail = PICKS.filter(p => pickCount(s, p.id) < (p.max || 99));
    for (let i = avail.length - 1; i > 0; i--) { const j = Math.floor(s.rng() * (i + 1)); const t = avail[i]; avail[i] = avail[j]; avail[j] = t; }
    s.pick = { hand: avail.slice(0, Math.min(3, avail.length)) };
    say(s, 'a make-or-break PICK opens — reshape your build.');
  }
  function takePick(s, id) {
    if (!s.pick) return false;
    const p = s.pick.hand.find(x => x.id === id);
    if (p) { p.apply(s); s.picksTaken.push(id); say(s, `picked ${p.name}.`); }
    s.pick = null; return true;
  }

  // ── enemies + surges ────────────────────────────────────────────────────────
  function spawnEnemy(s, type, opts) {
    const def = ENEMIES[type], hp = def.hp * (1 + s.threat * 0.012);
    const e = { id: uid(s), type, hp, maxHp: hp, r: def.r, color: def.color, elite: def.elite, poison: 0, chill: 0, frozen: 0, shield: def.shield || 0, shieldMax: def.shield || 0, coredmgMul: 1, speedMul: 1, lastHit: 0, hitT: 0, fade: 0, laneIdx: null, dist: 0, blockedBy: null };
    if (opts && opts.surge) applyCounter(s, e);              // surge spawns carry the guard's counter
    if (s.laneMode && s.lanes.length) {                        // spawn at a lane mouth, walk it in
      const li = opts && opts.lane != null ? opts.lane : Math.floor(s.rng() * s.lanes.length);
      e.laneIdx = li; const p = posOnLane(s.lanes[li], 0); e.x = p.x; e.y = p.y;
    } else {                                                   // open: appear on the fog ring at an angle
      const ang = opts && opts.ang != null ? opts.ang + (s.rng() - 0.5) * 0.5 : s.rng() * TAU;
      e.x = s.core.x + Math.cos(ang) * s.spawnR; e.y = s.core.y + Math.sin(ang) * s.spawnR;
    }
    s.enemies.push(e);
  }
  function tickSpawns(s, dt) {
    if (s.ambient) {   // idle-defense window — a gentle endless trickle, no surges/draft/boss
      s.spawnAccum += dt * 0.7;
      while (s.spawnAccum >= 1) { s.spawnAccum -= 1; spawnEnemy(s, 'probe'); }
      return;
    }
    if (s.bossSpawned || s.surge >= s.GOAL_SURGES) return;   // boss is out — stop feeding so you can clear the field + finish it
    const rate = 0.4 + s.threat * 0.03 + s.t * 0.004;  // continuous trickle — gentler at the start, escalating
    s.spawnAccum += dt * rate;
    while (s.spawnAccum >= 1) { s.spawnAccum -= 1; spawnEnemy(s, 'probe'); }
    if (s.warn) { s.warn.t -= dt; if (s.warn.t <= 0) { doSurge(s, s.warn.ang); s.warn = null; } }
    else { s.surgeT -= dt; if (s.surgeT <= 0) { s.warn = { ang: s.rng() * TAU, t: 2.6 }; if (s.laneMode) pickWaveLanes(s); armCounter(s); say(s, s.laneMode ? '>> SURGE inbound — watch the lit lanes. <<' : '>> SURGE inbound — watch the marked arc. <<'); } }   // the guard reads your lean at telegraph time (armCounter)
  }
  function surgePool(surge) { const p = []; if (surge >= 2) p.push('rusher', 'enforcer'); if (surge >= 3) p.push('ward'); if (surge >= 4) p.push('splitter', 'disruptor'); return p; }   // threats unlock as the run escalates
  function doSurge(s, ang) {
    s.surge++; s.threat += 6;
    const from = () => s.laneMode ? { lane: s.waveLanes[Math.floor(s.rng() * s.waveLanes.length)] } : { ang: ang + (s.rng() - 0.5) * 0.3 };
    const surgeAt = (mk) => Object.assign({ surge: true }, mk());   // tag surge spawns so the counter bakes in
    if (s.surge >= s.GOAL_SURGES) {                          // CLIMAX — the boss wave ends the run
      s.bossSpawned = true; spawnEnemy(s, s.boss, surgeAt(from));
      for (let i = 0; i < s.bossEscort; i++) spawnEnemy(s, 'enforcer', surgeAt(from));
      say(s, s.boss === 'juggernaut'
        ? '>> THE JUGGERNAUT BREAKS FROM THE DARK. bring it down and the node is yours. <<'
        : '>> THE BAIT IS TAKEN — they close in for the kill. break them and the ground is yours. <<');
      return;
    }
    const c = s.counter;
    let pool = surgePool(s.surge), specials = Math.min(12, Math.floor(s.surge * 1.3));   // smaller early surges
    if (c) { pool = pool.concat(COUNTER[c.channel].add).filter(t => ENEMIES[t]); specials += Math.round(c.mag * 4); }   // the counter FLOODS its anti-build types
    const probes = 3 + s.surge * 2;
    for (let i = 0; i < probes; i++) spawnEnemy(s, 'probe', surgeAt(from));
    for (let i = 0; i < specials; i++) spawnEnemy(s, pool.length ? pool[Math.floor(s.rng() * pool.length)] : 'probe', surgeAt(from));
    s.surgeT = 15 + s.rng() * 4;
    say(s, `SURGE ${s.surge}/${s.GOAL_SURGES}${c ? ' [COUNTER: ' + COUNTER[c.channel].read + ']' : ''} — ${probes + specials} hostiles.`);
    offerPick(s);   // each round hands you a make-or-break PICK (one per surge) — answer the wave you provoked
  }

  function nearestEnemy(s, x, y, maxR) { let b = null, bd = maxR || 1e9; for (const e of s.enemies) { const d = dist(x, y, e.x, e.y); if (d < bd) { bd = d; b = e; } } return b; }
  function densestEnemy(s) { let b = null, bn = -1; for (const e of s.enemies) { let n = 0; for (const o of s.enemies) if (dist(e.x, e.y, o.x, o.y) < 80) n++; if (n > bn) { bn = n; b = e; } } return b; }
  function damageEnemy(s, e, amt) {                          // all army damage routes here → shields soak first (WARD)
    if (amt <= 0) return; e.hitT = s.t; e.lastHit = s.t;
    if (e.shield > 0) {
      if (s.pierce > 0) { const through = amt * s.pierce; e.hp -= through; amt -= through; }   // PIERCING ROUNDS bypass part of the shield
      const a = Math.min(e.shield, amt); e.shield -= a; amt -= a;
    }
    if (amt > 0) e.hp -= amt;
  }
  function jammedAt(disruptors, x, y) { for (const z of disruptors) if (dist(x, y, z.x, z.y) < ENEMIES[z.type].jam) return true; return false; }   // inside a DISRUPTOR's jam field?

  // ── flocks: boids + per-archetype targeting ─────────────────────────────────
  function pickFlockTarget(s, f) {
    if (!s.enemies.length) { f.tgtId = null; f.tx = s.core.x; f.ty = s.core.y; return; }   // nothing to hunt → regroup at the core
    let best = null, bv = Infinity;
    for (const e of s.enemies) {
      const dCore = dist(e.x, e.y, s.core.x, s.core.y), dFlock = dist(e.x, e.y, f.cx, f.cy);
      let v = s.stance === 'guard' ? dCore : s.stance === 'hunt' ? (e.elite ? 0 : 1e4) + dFlock : dFlock;
      if (f.behavior === 'lock' && e.elite) v -= 60;           // hunters favour the heavies
      if (v < bv) { bv = v; best = e; }
    }
    f.tgtId = best ? best.id : null; f.tx = best ? best.x : null; f.ty = best ? best.y : null;
  }
  function updateFlocks(s, dt) {
    const disrupt = s.enemies.filter(e => e.type === 'disruptor');
    for (const f of s.flocks) {
      let cx = 0, cy = 0; for (const d of f.dots) { cx += d.x; cy += d.y; } const n = f.dots.length || 1; f.cx = cx / n; f.cy = cy / n;
      f.tgtT -= dt; if (f.tgtT <= 0) { f.tgtT = 0.3; pickFlockTarget(s, f); }
      const spd0 = SWARMS[f.type].speed * (f.buff ? 1.25 : 1);        // conductor overclock
      for (const d of f.dots) {
        const spd = disrupt.length && jammedAt(disrupt, d.x, d.y) ? spd0 * 0.55 : spd0;   // DISRUPTOR jam slows the swarm
        let tx, ty;
        if (f.behavior === 'peel') { const e = nearestEnemy(s, d.x, d.y); tx = e ? e.x : s.core.x; ty = e ? e.y : s.core.y; }
        else if (f.behavior === 'swirl') { const px = f.tx ?? f.cx, py = f.ty ?? f.cy, a = Math.atan2(d.y - py, d.x - px) + 1.15; tx = px + Math.cos(a) * 44; ty = py + Math.sin(a) * 44; }
        else { tx = f.tx ?? f.cx; ty = f.ty ?? f.cy; }            // lock → the one enemy
        const dd = dist(d.x, d.y, tx, ty) || 1; let ax = (tx - d.x) / dd, ay = (ty - d.y) / dd;
        for (const o of f.dots) { if (o === d) continue; const sx = d.x - o.x, sy = d.y - o.y, m = sx * sx + sy * sy; if (m < 220 && m > 0) { const im = 1 / Math.sqrt(m); ax += sx * im * 0.55; ay += sy * im * 0.55; } }
        ax += (f.cx - d.x) * 0.0018; ay += (f.cy - d.y) * 0.0018;  // mild cohesion
        d.vx += ax * spd * dt * 3.2; d.vy += ay * spd * dt * 3.2;
        const v = Math.hypot(d.vx, d.vy) || 1; if (v > spd) { d.vx = d.vx / v * spd; d.vy = d.vy / v * spd; }
        d.x += d.vx * dt; d.y += d.vy * dt;
      }
      f.regenT -= dt; if (f.regenT <= 0 && f.dots.length < f.cap) { f.regenT = (s.ex.hive ? 0.5 : 0.85) * (f.buff ? 0.6 : 1); f.dots.push(spawnDot(s, f)); }
    }
    for (let i = s.flocks.length - 1; i >= 0; i--) if (s.flocks[i].dots.length === 0) { say(s, `a ${s.flocks[i].type} swarm was wiped — redeploying.`); s.flocks.splice(i, 1); }
  }
  function dotDamage(s, dt) {
    const CONTACT = 20, disruptors = s.enemies.filter(e => e.type === 'disruptor');
    for (const f of s.flocks) {
      const dmg = SWARMS[f.type].dotDmg * (f.buff ? 1.4 : 1) * chMult(s, 'offense');   // OFFENSE channel scales swarm DPS
      for (const d of f.dots) {
        const e = nearestEnemy(s, d.x, d.y, CONTACT); if (!e) continue;
        let m = 1 + markMul(s, e); if (e.poison > 0) m += 0.5; if (e.frozen > 0) m += 1.0;   // SYNERGY: marked + poisoned (+50%) + frozen (+100% shatter)
        let amt = dmg * m * dt; if (disruptors.length && jammedAt(disruptors, d.x, d.y)) amt *= 0.45;   // DISRUPTOR jam blunts the swarm
        damageEnemy(s, e, amt);
        if (f.applies === 'poison') e.poison = Math.min(60, e.poison + 20 * dt);
        d.hp -= ENEMIES[e.type].dotDmg * dt;                      // the enemy fights back while latched
      }
      f.dots = f.dots.filter(d => d.hp > 0);
    }
  }

  // ── core-gun (projectiles) ──────────────────────────────────────────────────
  function makeBrood(s, owner, cap) { return { id: uid(s), type: 'brood', color: '#ffd24a', behavior: 'peel', applies: null, cap, dots: [], tgtId: null, tx: null, ty: null, cx: s.core.x, cy: s.core.y, tgtT: 0, regenT: 0, owned: owner }; }
  function swapCoreFn(s) {
    const fns = ['mark', 'slow', 'aura', 'drones']; s.core.fn = fns[(fns.indexOf(s.core.fn) + 1) % fns.length];
    if (s.core.fn !== 'drones') { const bi = s.flocks.findIndex(f => f.owned === 'core'); if (bi >= 0) s.flocks.splice(bi, 1); }   // retire the core brood when leaving drones
    if (s.core.fn !== 'mark') s.core.markId = null;          // drop the mark when leaving designator
    say(s, `core reconfigured → ${s.core.fn.toUpperCase()}.`);
  }
  function markMul(s, e) { return s.core.markId === e.id ? (0.75 + (s.core.lvl - 1) * 0.25) * chMult(s, 'core') : 0; }   // CORE channel scales the mark bonus
  function updateCore(s, dt) {
    const lv = s.core.lvl; s.core.cd -= dt;
    if (s.core.fn === 'mark') {                              // DESIGNATOR — paint the biggest threat; the army hits it harder (no damage itself)
      if (s.core.cd <= 0 || !s.enemies.some(e => e.id === s.core.markId)) {
        s.core.cd = 1.2; let best = null, bv = -Infinity;
        for (const e of s.enemies) { const v = (e.elite ? 1e6 : 0) - dist(e.x, e.y, s.core.x, s.core.y); if (v > bv) { bv = v; best = e; } }   // nearest-to-core elite, else most-advanced
        s.core.markId = best ? best.id : null;
      }
    } else if (s.core.fn === 'aura') {                       // pulsing close-range AoE shock
      if (s.core.cd <= 0) { s.core.cd = 1.1; const R = 150 + lv * 22; for (const e of s.enemies) if (dist(e.x, e.y, s.core.x, s.core.y) < R) hitEnemy(s, e, (14 + lv * 6) * chMult(s, 'core')); s.bursts.push({ x: s.core.x, y: s.core.y, life: 0.45, color: '#ffb000', ring: true }); }
    } else if (s.core.fn === 'drones') {                     // passively keep a free brood topped up
      let brood = s.flocks.find(f => f.owned === 'core'); if (!brood) { brood = makeBrood(s, 'core', 4 + lv * 2); for (let i = 0; i < 3; i++) brood.dots.push(spawnDot(s, brood)); s.flocks.push(brood); } else brood.cap = 4 + lv * 2;
    }
    // (the SLOW function is applied in updateEnemies) — move all live shots regardless of fn
    for (const sh of s.shots) {
      const e = s.enemies.find(x => x.id === sh.tid); const tx = e ? e.x : sh.tx, ty = e ? e.y : sh.ty;
      const dx = tx - sh.x, dy = ty - sh.y, d = Math.hypot(dx, dy) || 1; sh.x += dx / d * sh.speed * dt; sh.y += dy / d * sh.speed * dt; sh.life -= dt;
      if (sh.rocket) { if (d < sh.split || sh.life <= 0) { sh.hit = true; splitRocket(s, sh); } }   // SIEGE: pop into bomblets before impact
      else if (d < 14 || sh.life <= 0) { sh.hit = true; applyShot(s, sh, e); }
    }
    s.shots = s.shots.filter(sh => !sh.hit);
  }
  function splitRocket(s, sh) {                            // cluster munition — scatters bomblets around the aim point, each its own little blast
    s.bursts.push({ x: sh.x, y: sh.y, life: 0.22, color: '#ffe6c0', ring: true });
    const n = sh.bomblets || 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + s.rng() * 0.6, spread = 36 + s.rng() * 74;
      s.shots.push({ x: sh.x, y: sh.y, tid: null, tx: sh.tx + Math.cos(a) * spread, ty: sh.ty + Math.sin(a) * spread, speed: 430, dmg: sh.dmg * 0.85, splash: 46, poison: sh.poison, color: '#ffb060', life: 0.8, bomblet: true });
    }
  }
  function applyShot(s, sh, e) {
    const mult = o => 1 + markMul(s, o) + (o.poison > 0 ? 0.4 : 0) + (o.frozen > 0 ? 1.0 : 0);   // mark + states carry through to shells too
    if (e) { damageEnemy(s, e, sh.dmg * mult(e)); if (sh.poison) e.poison = Math.min(60, e.poison + sh.poison); }
    if (sh.splash > 0) {
      for (const o of s.enemies) { if (dist(o.x, o.y, sh.x, sh.y) < sh.splash) { damageEnemy(s, o, sh.dmg * 0.3 * mult(o)); o.poison = Math.min(60, o.poison + sh.poison * 0.7); } }
      s.bursts.push({ x: sh.x, y: sh.y, life: 0.4, color: sh.color, ring: true });
    }
  }

  // ── GREATER UNITS — each behavior is a distinct field role. Persistent, level via field XP. ──
  function checkUnitLevel(s, u) { const need = 20 + u.lvl * 16; if (u.xp >= need) { u.xp -= need; u.lvl++; u.dmg = Math.round(u.dmg * 1.25); u.maxHp += 25; u.hp = Math.min(u.maxHp, u.hp + 25); say(s, `${UNITS[u.type].name} reached mk${u.lvl} (field XP).`); } }
  function hitEnemy(s, e, dmg) { let m = 1 + markMul(s, e); if (e.poison > 0) m += 0.4; if (e.frozen > 0) m += 1.0; damageEnemy(s, e, dmg * m); }   // burst hit + state/mark bonuses (frozen = shatter)
  function nearestElite(s, x, y) { let t = null, bv = -Infinity; for (const e of s.enemies) { const v = (e.elite ? 1e5 : 0) - dist(e.x, e.y, x, y); if (v > bv) { bv = v; t = e; } } return t; }
  function roam(s, u, tx, ty, pref, spd, dt) {            // stride toward a target, hold at weapon range, leashed near the core
    let mx = 0, my = 0;
    if (tx != null) { const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy) || 1, m = d > pref + 25 ? 1 : d < pref - 50 ? -1 : 0; mx += dx / d * m; my += dy / d * m; u.aim = Math.atan2(dy, dx); }
    const dc = dist(u.x, u.y, s.core.x, s.core.y), leash = s.viewR * 0.82; if (dc > leash) { mx += (s.core.x - u.x) / dc * 1.6; my += (s.core.y - u.y) / dc * 1.6; }
    const ml = Math.hypot(mx, my); if (ml > 0.01) { u.x += mx / ml * spd * dt; u.y += my / ml * spd * dt; u.walk += spd * dt * 0.045; }
  }
  function updateUnits(s, dt) {
    for (const f of s.flocks) f.buff = false;                        // conductors re-mark buffed flocks each tick
    for (const u of s.units) {
      u.cd -= dt;
      if (u.behavior === 'striker') uStriker(s, u, dt);
      else if (u.behavior === 'anchor') uAnchor(s, u, dt);
      else if (u.behavior === 'artillery') uArtillery(s, u, dt);
      else if (u.behavior === 'cryo') uCryo(s, u, dt);
      else if (u.behavior === 'support') uSupport(s, u, dt);
      else if (u.behavior === 'reaper') uReaper(s, u, dt);
      else if (u.behavior === 'fabricator') uFabricator(s, u, dt);
    }
    for (let i = s.units.length - 1; i >= 0; i--) if (s.units[i].hp <= 0) {
      const dead = s.units[i];
      if (dead.behavior === 'fabricator') { const bi = s.flocks.findIndex(f => f.owned === dead.id); if (bi >= 0) s.flocks.splice(bi, 1); }
      say(s, `>> the ${dead.type} is destroyed — its levels lost with it. <<`); s.units.splice(i, 1);
    }
  }
  function uStriker(s, u, dt) {                            // STRIDER — roams + railguns the heaviest threat (flame cone under the exotic)
    const tgt = nearestElite(s, u.x, u.y);
    roam(s, u, tgt ? tgt.x : null, tgt ? tgt.y : null, s.ex.flame ? 175 : 245, 135, dt);
    for (const e of s.enemies) if (e.elite && dist(e.x, e.y, u.x, u.y) < e.r + 22) u.hp -= ENEMIES[e.type].dotDmg * dt;
    if (u.cd > 0 || !tgt) return;
    if (s.ex.flame) { u.cd = 1 / 3.4; const ang = u.aim; for (const e of s.enemies) { const a2 = Math.atan2(e.y - u.y, e.x - u.x), dA = Math.abs(((a2 - ang + Math.PI) % TAU) - Math.PI); if (dist(e.x, e.y, u.x, u.y) < 300 && dA < 0.5) { hitEnemy(s, e, 17); e.poison = Math.min(60, e.poison + 10); } } s.beams.push({ x1: u.x, y1: u.y, x2: u.x + Math.cos(ang) * 300, y2: u.y + Math.sin(ang) * 300, life: 0.13, color: '#ff8a3a', cone: true, ang }); }
    else { u.cd = 1 / 0.55; hitEnemy(s, tgt, od(s, u.dmg)); s.beams.push({ x1: u.x, y1: u.y, x2: tgt.x, y2: tgt.y, life: 0.14, color: '#ffffff', rail: true }); }
  }
  function uAnchor(s, u, dt) {                             // BULWARK — a player-placed WALL: walk to where you put it, then plug + grind; self-repairs
    if (u.moveTo) { const dx = u.moveTo.x - u.x, dy = u.moveTo.y - u.y, d = Math.hypot(dx, dy) || 1; if (d > 4) { const step = Math.min(d, 95 * dt); u.x += dx / d * step; u.y += dy / d * step; u.walk += step * 0.04; } }
    u.aim = Math.atan2(s.core.y - u.y, s.core.x - u.x);
    u.hp = Math.min(u.maxHp, u.hp + 16 * dt);                          // self-repair
    if (u.cd <= 0) { let hit = false; for (const e of s.enemies) if (dist(e.x, e.y, u.x, u.y) < u.r + ENEMIES[e.type].r + 30) { hitEnemy(s, e, od(s, u.dmg)); hit = true; } if (hit) u.cd = 1 / 1.6; }   // grind the pile
  }
  function uArtillery(s, u, dt) {                          // SIEGE — player-placed; lobs cluster rockets at distant clusters (poison bomblets on contagion ammo)
    if (u.moveTo) { const dx = u.moveTo.x - u.x, dy = u.moveTo.y - u.y, d = Math.hypot(dx, dy) || 1; if (d > 4) { const step = Math.min(d, 70 * dt); u.x += dx / d * step; u.y += dy / d * step; u.walk += step * 0.04; } }
    const tgt = densestEnemy(s) || nearestEnemy(s, u.x, u.y);
    if (tgt) u.aim = Math.atan2(tgt.y - u.y, tgt.x - u.x);
    if (u.cd > 0 || !tgt) return;
    u.cd = 1 / 0.5;
    s.shots.push({ x: u.x, y: u.y, tid: tgt.id, tx: tgt.x, ty: tgt.y, speed: 300, dmg: od(s, u.dmg), splash: 0, poison: 6, color: '#e0913f', life: 3.2, lob: true, rocket: true, split: 120, bomblets: 5 });
  }
  function uCryo(s, u, dt) {                               // GLACIER — roams in, then THUMPS the ground → an expanding FREEZING SHOCKWAVE (chill → freeze → shatter)
    const tgt = nearestEnemy(s, u.x, u.y);
    roam(s, u, tgt ? tgt.x : null, tgt ? tgt.y : null, 70, 88, dt);
    if (u.thumpT > 0) u.thumpT -= dt;
    if (u.cd <= 0 && tgt && dist(tgt.x, tgt.y, u.x, u.y) < 300) {
      u.cd = 2.2; u.thumpT = 0.32;                          // recover + play the slam
      s.waves.push({ x: u.x, y: u.y, r: 0, maxR: 245, speed: 300, hit: {} });
    }
    for (const e of s.enemies) if (e.elite && dist(e.x, e.y, u.x, u.y) < e.r + 22) u.hp -= ENEMIES[e.type].dotDmg * dt;
  }
  function updateWaves(s, dt) {                            // freezing shockwaves: the expanding ring chills (then freezes) whatever its front sweeps over
    for (const w of s.waves) {
      const prev = w.r; w.r += w.speed * dt;
      for (const e of s.enemies) { if (w.hit[e.id]) continue; const d = dist(e.x, e.y, w.x, w.y); if (d <= w.r && d >= prev - 18) { w.hit[e.id] = 1; e.chill = Math.min(100, e.chill + 80); if (e.chill >= 100 && e.frozen <= 0) e.frozen = 2.6; } }
    }
    s.waves = s.waves.filter(w => w.r < w.maxR);
  }
  function uSupport(s, u, dt) {                            // CONDUCTOR — hovers with the swarm; flocks in range get OVERCLOCKED (faster, harder, regen quicker)
    let cx = 0, cy = 0, n = 0; for (const f of s.flocks) { cx += f.cx; cy += f.cy; n++; }
    roam(s, u, n ? cx / n : null, n ? cy / n : null, 40, 92, dt);
    for (const f of s.flocks) if (dist(f.cx, f.cy, u.x, u.y) < 235) f.buff = true;
    for (const e of s.enemies) if (e.elite && dist(e.x, e.y, u.x, u.y) < e.r + 18) u.hp -= ENEMIES[e.type].dotDmg * dt;
  }
  function uReaper(s, u, dt) {                             // REAPER — fast; DETONATES a poisoned target's stacks as AoE, EXECUTES low-HP enemies for a COMPUTE refund
    let tgt = null, bv = -Infinity;
    for (const e of s.enemies) { const v = (e.poison > 0 ? 1e4 : 0) + (e.hp < e.maxHp * 0.22 ? 6e3 : 0) - dist(e.x, e.y, u.x, u.y); if (v > bv) { bv = v; tgt = e; } }
    roam(s, u, tgt ? tgt.x : null, tgt ? tgt.y : null, 26, 182, dt);
    if (u.cd > 0 || !tgt || dist(tgt.x, tgt.y, u.x, u.y) > 48) return;
    u.cd = 1 / 1.7; s.beams.push({ x1: u.x, y1: u.y, x2: tgt.x, y2: tgt.y, life: 0.1, color: '#9ef0c0' });
    if (tgt.hp <= tgt.maxHp * 0.18) { tgt.hp = 0; s.bursts.push({ x: tgt.x, y: tgt.y, life: 0.4, color: '#9ef0c0', ring: true }); return; }   // EXECUTE the weak (kill resolves in updateEnemies)
    hitEnemy(s, tgt, od(s, u.dmg));
    if (tgt.poison > 0) { const blast = tgt.poison * 1.6; for (const o of s.enemies) if (dist(o.x, o.y, tgt.x, tgt.y) < 92) damageEnemy(s, o, blast); tgt.poison = 0; s.bursts.push({ x: tgt.x, y: tgt.y, life: 0.45, color: '#76e08a', ring: true }); }
  }
  function uFabricator(s, u, dt) {                         // FABRICATOR — slow; keeps a free BROOD flock of mini-drones topped up (doesn't count vs the flock cap)
    const tgt = nearestEnemy(s, u.x, u.y);
    roam(s, u, tgt ? tgt.x : null, tgt ? tgt.y : null, 240, 32, dt);   // slow hexapod carrier
    let brood = s.flocks.find(f => f.owned === u.id);
    if (!brood) { brood = makeBrood(s, u.id, 8 + u.lvl * 2); for (let i = 0; i < 3; i++) brood.dots.push(spawnDot(s, brood)); s.flocks.push(brood); say(s, 'fabricator spins up a drone brood.'); }
    else brood.cap = 8 + u.lvl * 2;
  }

  function onKill(s, e) {
    s.kills++;
    s.bursts.push({ x: e.x, y: e.y, life: 0.42, color: e.color, big: e.elite });
    for (const u of s.units) { u.xp += e.elite ? 14 : 4; checkUnitLevel(s, u); }
    if (ENEMIES[e.type].splits) {                                // SPLITTER bursts into spawnlings (on its lane, where it fell)
      const d2 = ENEMIES.spawnling;
      for (let i = 0; i < ENEMIES[e.type].splits; i++) { const a = s.rng() * TAU; s.enemies.push({ id: uid(s), type: 'spawnling', x: e.x + Math.cos(a) * 18, y: e.y + Math.sin(a) * 18, hp: d2.hp, maxHp: d2.hp, r: d2.r, color: d2.color, elite: false, poison: 0, chill: 0, frozen: 0, shield: 0, shieldMax: 0, lastHit: 0, hitT: 0, fade: 1, laneIdx: e.laneIdx, dist: Math.max(0, e.dist - 12), blockedBy: null }); }
    }
    if (s.ex.bloom && e.poison > 0) {                            // EXOTIC: contagion bloom — death seeds the cluster
      for (const o of s.enemies) if (o !== e && o.hp > 0 && dist(o.x, o.y, e.x, e.y) < 96) o.poison = Math.min(60, o.poison + 30);
      s.bursts.push({ x: e.x, y: e.y, life: 0.5, color: '#76e08a', ring: true });
    }
  }
  function coreHit(s, e) { e.dead = true; if (s.core.invuln) return; s.core.hp -= ENEMIES[e.type].coredmg * (e.coredmgMul || 1); if (s.core.hp <= 0) { s.core.hp = 0; s.lost = true; say(s, '>> CORE BREACHED. they are inside you. the node is lost. <<'); } }
  function updateEnemies(s, dt) {
    const anchors = s.units.filter(u => u.behavior === 'anchor');     // bulwarks taunt + soak
    for (const e of s.enemies) {
      if (e.fade < 1) e.fade = Math.min(1, e.fade + dt * 1.8);
      if (e.poison > 0) { e.hp -= e.poison * 0.25 * dt; e.poison = Math.max(0, e.poison - dt * 4); }   // poison BYPASSES shields (the WARD counter)
      if (e.shieldMax && e.shield < e.shieldMax && s.t - e.lastHit > 2) e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * 0.5 * dt);   // WARD shield regen when not pressured
      if (e.frozen > 0) { e.frozen -= dt; e.chill = 100; e.blockedBy = null; continue; }   // frozen solid — it doesn't move
      e.chill = Math.max(0, e.chill - dt * 18);
      let block = null; for (const a of anchors) if (dist(e.x, e.y, a.x, a.y) < a.r + ENEMIES[e.type].r + 26) { block = a; break; }   // a bulwark plugging the path
      e.blockedBy = block ? block.id : null;
      const chillSlow = e.chill > 0 ? 1 - Math.min(0.6, e.chill / 100 * 0.6) : 1;
      let sp = ENEMIES[e.type].speed * chillSlow * (e.poison > 0 ? 0.92 : 1) * (e.speedMul || 1);   // CORE-GUN counter speeds them up
      if (s.core.fn === 'slow' && dist(e.x, e.y, s.core.x, s.core.y) < 150 + s.core.lvl * 22) sp *= 0.5;   // CORE slow function
      if (block) {                                                    // halted at the wall — grind through it, no advance
        block.hp -= ENEMIES[e.type].dotDmg * dt;
      } else if (e.laneIdx != null && s.lanes[e.laneIdx]) {           // follow its lane in to the core
        const lane = s.lanes[e.laneIdx]; e.dist += sp * dt; const p = posOnLane(lane, e.dist); e.x = p.x; e.y = p.y;
        if (e.dist >= lane.len) coreHit(s, e);
      } else {                                                        // open mode / manually-placed → straight at the core
        const dx = s.core.x - e.x, dy = s.core.y - e.y, d = Math.hypot(dx, dy) || 1; e.x += dx / d * sp * dt; e.y += dy / d * sp * dt;
        if (d < 42) coreHit(s, e);
      }
    }
    for (const e of s.enemies) if (e.hp <= 0 && !e.dead) { e.dead = true; onKill(s, e); }
    s.enemies = s.enemies.filter(e => !e.dead);
  }

  function tick(s, dt) {
    if (s.won || s.lost || s.pick) return;   // a pending make-or-break PICK pauses the board
    dt = Math.min(0.05, dt); s.t += dt;
    tickAlloc(s, dt);                                              // ease the live split toward the target
    ensureField(s);                                               // keep the roster deployed (re-fields a wiped flock)
    // SHIELD channel = core survivability: it sets the core's max HP and regen rate.
    if (!s.core.invuln) {
      s.core.maxHp = Math.round((s.coreBase || 100) * chMult(s, 'shield'));   // HARDENED CORE lifts the base
      if (s.core.hp > s.core.maxHp) s.core.hp = s.core.maxHp;
      s.core.hp = Math.min(s.core.maxHp, s.core.hp + 6 * chMult(s, 'shield') * (s.regenMul || 1) * dt);   // SELF-REPAIR doubles regen
    }
    s.threat += dt * 0.18;
    tickSpawns(s, dt);
    updateFlocks(s, dt);
    dotDamage(s, dt);
    updateCore(s, dt);
    updateUnits(s, dt);
    updateWaves(s, dt);
    updateEnemies(s, dt);
    s.beams = s.beams.filter(b => (b.life -= dt) > 0);
    s.bursts = s.bursts.filter(b => (b.life -= dt) > 0);
    if (s.bossSpawned && s.enemies.length === 0) { s.won = true; say(s, '>> THE JUGGERNAUT FALLS. the node is SECURED. <<'); }
  }

  global.SWARM = { create, tick, summonFlock, fieldUnit, unitCost, moveUnit, upgradeCore, swapAmmo, swapCoreFn, setStance, toggleEx, pickDraft, coreCost, flockCap, setAlloc, nudgeAlloc, chMult, CHANNELS, offerPick, takePick, PICKS, SWARMS, ENEMIES, AMMO, UNITS };
})(typeof window !== 'undefined' ? window : globalThis);
