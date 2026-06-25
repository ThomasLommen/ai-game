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
  const ENEMY_HP_MUL = 2;   // global enemy-HP knob (they were dying too fast)
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
  function genLanes(rng, W, H, core, n) { n = Math.max(1, n || 4); const lanes = [], base = rng() * Math.PI * 2; for (let i = 0; i < n; i++) { const ang = base + i * (Math.PI * 2 / n) + (rng() - 0.5) * 0.7; lanes.push(laneGeom(genLanePts(rng, W, H, core, ang))); } return lanes; }
  // ── DIFFICULTY CURVE: ACT = structure (lanes / menagerie / boss), WAVE = pressure
  // (count / HP / surge length). Every fight is a real challenge from #1. (difficulty-scaling-design)
  function difficulty(act, wave) {
    act = Math.max(1, act | 0); wave = Math.max(0, wave | 0);
    const lanes = Math.min(5, 1 + (act - 1) + Math.floor(wave / 5));
    const tier = act === 1 ? (wave >= 3 ? 1 : 0) : Math.min(3, act);   // act1 probes→rusher/enforcer late; act2 +ward; act3+ full
    const intensity = 1 + wave * 0.12 + (act - 1) * 0.15;              // count + HP multiplier
    const surges = 3 + Math.floor(wave / 3) + (act - 1);              // longer battles deeper in
    const boss = act >= 4 ? 'juggernaut' : (act >= 2 && wave % 4 === 3) ? 'juggernaut' : 'enforcer';
    const escort = 1 + Math.floor((act - 1) + wave / 4);             // boss escort grows with depth
    return { lanes, tier, intensity, surges, boss, escort };
  }
  function pickWaveLanes(s) { const n = s.lanes.length; if (!n) { s.waveLanes = []; return; } const count = Math.max(1, Math.min(n, 1 + Math.floor(s.rng() * (1 + s.surge * 0.5)))); const idx = [...Array(n).keys()]; for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(s.rng() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; } s.waveLanes = idx.slice(0, count).sort((a, b) => a - b); }

  function create(seed, laneMode, startCompute, ambient, opts) {
    opts = opts || {};   // opts = battle shape (a TRAP's bait reshapes the climax): { surges, boss, escort, regen }
    const rng = mulberry32((seed | 0) || 7);
    // PORTRAIT arena (the game is played in portrait — no landscape lock). ambient = the
    // small always-on perimeter window on HOME (kept as its own small shape).
    const W = ambient ? 480 : 1280, H = ambient ? 290 : 2000;
    const mn = Math.min(W, H);
    const s = {
      W, H, rng, t: 0, seed: (seed | 0) || 7,
      core: { x: W / 2, y: H / 2, r: 42, hp: 100, maxHp: 100, lvl: 1, marks: [], maxMarks: 1, cd: 0,   // r = body radius (collision + render, both frames); marks = your FOCUS-FIRE targets
              eye: { x: 0, y: 0, tx: 0, ty: 0, dil: 0, blink: 0, blinkT: 2 + Math.random() * 3, t: 0, staring: false } },   // the LIVING gaze (updateEye): wanders, locks on, blinks, sometimes stares at YOU
      viewR: ambient ? 200 : Math.round(mn * 0.469), spawnR: ambient ? 175 : Math.round(mn * 0.64), ambient: !!ambient,
      // BATTLE v2: no live compute economy. Channels (offense/shield/core) are BUILD-STATS
      // accrued from picks/roster/boost; chMult = 1 + chBonus. The guard reads/counters your
      // dominant BUILD channel. (battle-duel-rework v2.)
      counter: null, threatRead: null,    // THE DUEL: the guard reads your lean + counters that channel
      pick: null, picksTaken: [], newPicks: [], picksOff: !!opts.picksOff,   // picksTaken = all (incl pre-applied run-build); newPicks = taken THIS battle → persisted to the run
      chBonus: { offense: 0, shield: 0, core: 0 }, podCap: 2, coreBase: 100, pierce: 0, regenMul: 1,
      podDmgMul: 1, podHpMul: 1, podXpMul: 1,   // POD theme: greater-unit damage / HP / level-speed
      flocks: [], enemies: [], shots: [], beams: [], bursts: [], waves: [],
      units: [],
      lanes: [], waveLanes: [], laneMode: laneMode !== false,   // laneMode ON by default — enemies snake down lanes (vs open 360)
      stance: 'guard',              // guard (intercept nearest core) | hunt (elites) | press (engage far)
      maxFlocks: 6,                 // swarms are the star — 6 flocks base (upgrades/hive push higher)
      threat: 0, surge: 0, kills: 0, leaks: 0, bossSpawned: false,   // leaks = intruders that reached the core (perimeter NET = kills − leaks)
      spawnAccum: 0, surgeT: 1.5, warn: null,    // warn = { ang, t } surge telegraph — first wave comes quickly
      rushed: 0,                                  // waves you FORCED early — each one improves end-of-battle loot
      ex: { hive: false, flame: false, bloom: false },
      unlocked: { hunter: true },   // START with ONE swarm — the rest are drafted in as surges hit
      draft: null,
      won: false, lost: false, log: [],
      SWARMS, ENEMIES, AMMO, UNITS, nextId: 1,
    };
    // campaign BUILD-MAPPING (battle.js folds these in): pre-engaged exotics + pre-unlocked
    // roster from your adaptations/agents, so a developed build starts armed, not bare.
    if (opts.boost) { const bb = +opts.boost || 0; s.chBonus.offense += bb; s.chBonus.shield += bb; s.chBonus.core += bb; }   // campaign build power lifts every channel
    if (Array.isArray(opts.ex)) opts.ex.forEach(k => { if (k in s.ex) s.ex[k] = true; });
    if (s.ex.hive) s.maxFlocks = 10;
    if (Array.isArray(opts.unlock)) opts.unlock.forEach(t => { if (SWARMS[t] || UNITS[t]) s.unlocked[t] = true; });
    // DIFFICULTY: derive the curve from ACT (structure) + WAVE (pressure); explicit opts override (traps/guard).
    s.act = Math.max(1, opts.act || 1); s.wave = Math.max(0, opts.wave || 0);
    const D = difficulty(s.act, s.wave);
    s.tier = opts.tier != null ? opts.tier : D.tier;
    s.intensity = opts.intensity != null ? opts.intensity : D.intensity;
    s.GOAL_SURGES = opts.surges || D.surges;
    s.boss = opts.boss || D.boss;
    s.bossEscort = (opts.escort != null) ? opts.escort : D.escort;
    s.laneCount = opts.laneCount != null ? opts.laneCount : (opts.lanes != null ? opts.lanes : D.lanes);
    s.threat = (s.intensity - 1) * 42;   // wave/act pressure → tougher enemies from the first hit
    // RUN-BUILD: the picks you've accrued so far this RUN are pre-applied each battle
    // (they persist across the run's battles; the campaign carries the list).
    if (Array.isArray(opts.picks)) opts.picks.forEach(id => { const p = PICKS.find(x => x.id === id) || (SIGNATURES[Object.keys(SIGNATURES).find(k => SIGNATURES[k].id === id)]); if (p) { p.apply(s); s.picksTaken.push(id); } });
    if (s.laneMode) { s.lanes = genLanes(rng, W, H, s.core, s.laneCount); pickWaveLanes(s); }
    say(s, s.laneMode ? 'a node of yours. they come down the lit lanes — hold the core. TAP a threat to focus fire.'
                      : 'a node of yours. they come from the dark — hold the core. TAP a threat to focus fire.');
    ensureField(s);   // your roster auto-deploys; your BUILD governs how strong it is
    if (opts.opener && !s.picksOff) offerPick(s);   // the FIRST battle opens on a make-or-break pick
    return s;
  }
  function say(s, m) { s.log.push(m); if (s.log.length > 40) s.log.shift(); }
  const uid = s => 'u' + (s.nextId++);

  // ── CHANNELS as BUILD-STATS (no live dial) ───────────────────────────────────
  const CHANNELS = ['offense', 'shield', 'core'];
  // channel multiplier = 1.0 baseline + accrued pick/roster/boost bonus. The dominant
  // channel is your LEAN — what the guard reads and counters.
  function chMult(s, ch) { return 1.0 + (s.chBonus[ch] || 0) + (s.overextend && ch === readLean(s).ch ? 0.5 : 0); }   // OVEREXTEND amps your dominant channel
  function od(s, v) { return v * chMult(s, 'offense'); }   // OFFENSE-scaled army damage (swarm + pods)
  function pdmg(s, u) { return od(s, u.dmg) * (s.podDmgMul || 1) * (u.type === 'strider' && s.striderOver ? 1.8 : 1); }   // a POD's attack damage (pod theme + strider signature)
  // your ROSTER auto-deploys — no summoning-by-spend. One flock per unlocked swarm, up to 2 pods.
  function ensureField(s) {
    if (s.won || s.lost) return;
    // DESIRED player flock count = one per unlocked swarm type + bonus flocks (SWARM EXPANSION /
    // RELENTLESS / ENDLESS TIDE) + HIVE — so raising the cap actually fields MORE swarms (duplicates
    // of your types), instead of doing nothing because you only have a couple of types.
    const types = []; for (const t in SWARMS) { if (t !== 'brood' && s.unlocked[t]) types.push(t); }
    if (types.length) {
      const want = Math.min(s.maxFlocks, types.length + (s.bonusFlocks || 0) + (s.ex.hive ? 4 : 0));
      const mine = () => s.flocks.reduce((n, f) => n + (f.owned ? 0 : 1), 0);
      for (const t of types) { if (mine() >= want || s.flocks.length >= s.maxFlocks) break; if (!s.flocks.some(f => f.type === t && !f.owned)) summonFlock(s, t); }
      let i = 0; while (mine() < want && s.flocks.length < s.maxFlocks && i < 80) { summonFlock(s, types[i % types.length]); i++; }   // duplicates to fill the cap
    }
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
    return { x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r, vx: 0, vy: 0, hp: SWARMS[f.type].dotHp * (s.dotHpMul || 1) };   // ENDLESS TIDE halves dot HP
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
    const phb = Math.round(d.hp * (s.podHpMul || 1));   // POD theme: tougher chassis
    s.units.push({ id: uid(s), type, behavior: d.behavior, color: d.color, r: d.r, x: sx, y: sy, vx: 0, vy: 0, hp: phb, maxHp: phb, lvl: 1, xp: 0, dmg: d.dmg, cd: 0, walk: 0, aim: 0, thumpT: 0, moveTo: d.movable ? { x: sx, y: sy } : null });
    say(s, `${d.name} deployed — ${d.role}.`); return true;
  }
  function moveUnit(s, id, x, y) {                          // player repositions a movable pod (bulwark/siege)
    const u = s.units.find(u => u.id === id); if (!u || !UNITS[u.type].movable) return false;
    u.moveTo = { x: Math.max(30, Math.min(s.W - 30, x)), y: Math.max(30, Math.min(s.H - 30, y)) };
    return true;
  }
  function coreCost(s) { return 50 + s.core.lvl * 45; }
  function upgradeCore(s) { if (s.won || s.lost || !spend(s, coreCost(s))) return false; s.core.lvl++; say(s, `core-gun tuned to v${s.core.lvl}.`); return true; }
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
  // your LEAN = the dominant build channel + how far it LEADS the others (commitment).
  function readLean(s) {
    let ch = 'offense', v = -Infinity;
    CHANNELS.forEach(c => { const b = s.chBonus[c] || 0; if (b > v) { v = b; ch = c; } });
    const others = CHANNELS.filter(c => c !== ch).map(c => s.chBonus[c] || 0);
    const avgOther = others.reduce((a, b) => a + b, 0) / (others.length || 1);
    return { ch, lead: v - avgOther };
  }
  function armCounter(s) {                                   // read the lean at telegraph time → lock the counter for the incoming surge
    const { ch, lead } = readLean(s);
    let mag = Math.max(0, Math.min(1, lead / 0.9));           // 1 channel-pick (≈0.3 lead) → ~0.33; ~3 picks → full
    if (s.overextend) mag = Math.min(1, mag * 1.5);           // OVEREXTEND: harder lean → harder counter (the only duel kiss/curse)
    if (mag < 0.08) { s.counter = null; s.threatRead = null; return; }
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
  // tier: 'common' = small stat tune (smoothing) · 'rewrite' = a solid rule-rewrite ·
  // 'marquee' = a rare, telegraphed run-definer that carries a COST (kiss/curse). Duel-answers stay clean.
  const PICKS = [
    // ── commons: a thin layer of stat tunes ──
    { id: 'od_offense', name: 'TUNE · OFFENSE',   kind: 'offense', tier: 'common', desc: '+0.3 offense multiplier (swarm + pod damage)', apply: s => { s.chBonus.offense += 0.3; } },
    { id: 'od_shield',  name: 'TUNE · SHIELD',    kind: 'shield',  tier: 'common', desc: '+0.3 shield multiplier (core HP + regen)',     apply: s => { s.chBonus.shield += 0.3; } },
    { id: 'od_core',    name: 'TUNE · FOCUS-FIRE', kind: 'core',   tier: 'common', desc: '+0.3 focus-fire multiplier (damage to your marked target)', apply: s => { s.chBonus.core += 0.3; } },
    // ── solid rewrites / build tools ──
    { id: 'swarm_cap',  name: 'SWARM EXPANSION',  kind: 'cap',  tier: 'rewrite', max: 3, desc: '+2 swarm flocks on the field', apply: s => { s.maxFlocks += 2; s.bonusFlocks = (s.bonusFlocks || 0) + 2; } },
    { id: 'extra_pod',  name: 'EXTRA POD BAY',    kind: 'pod',  tier: 'rewrite', max: 2, desc: '+1 fielded pod',     apply: s => { s.podCap += 1; } },
    { id: 'hardened',   name: 'HARDENED CORE',    kind: 'edge', tier: 'rewrite', max: 3, desc: '+50 base core HP',   apply: s => { s.coreBase += 50; } },
    { id: 'selfrepair', name: 'SELF-REPAIR',      kind: 'edge', tier: 'rewrite', max: 3, desc: 'the core self-repairs (+4 HP/s)', apply: s => { s.selfRepairFlat = (s.selfRepairFlat || 0) + 4; } },
    // ── duel-answers: clean, no cost ──
    { id: 'pierce',     name: 'PIERCING ROUNDS',  kind: 'duel', tier: 'rewrite', max: 2, desc: 'your army punches through 40% of enemy shields',   apply: s => { s.pierce = Math.min(0.8, s.pierce + 0.4); } },
    // ── FOCUS-FIRE theme (the triage tap) ──
    { id: 'chain_focus', name: 'CHAIN FOCUS',     kind: 'focus', tier: 'rewrite', max: 1, desc: 'your focus-fire bonus bleeds to enemies near the marked target', apply: s => { s.chainFocus = true; } },
    { id: 'twin_marks',  name: 'TWIN MARKS',      kind: 'focus', tier: 'marquee', max: 1, cost: 'per-target bonus is halved', desc: 'hold TWO focus-fire targets at once', apply: s => { s.core.maxMarks = 2; } },
    // ── CORE theme (the thing you defend) ──
    { id: 'siege_cannon', name: 'SIEGE CANNON',   kind: 'core', tier: 'marquee', max: 1, cost: 'the core stops self-repairing', desc: 'the core fires a heavy beam down your focus line', apply: s => { s.siegeCannon = true; s.regenMul = 0; } },
    // ── SWARM theme (the flocks) ──
    { id: 'split_doctrine', name: 'SPLIT DOCTRINE', kind: 'swarm', tier: 'rewrite', max: 1, desc: 'kills split off a fresh mini-flock (brief cooldown)', apply: s => { s.splitDoctrine = true; } },
    { id: 'endless_tide',   name: 'ENDLESS TIDE',   kind: 'swarm', tier: 'marquee', max: 1, cost: 'every swarm dot has half HP', desc: 'many more swarms + regrow almost instantly', apply: s => { s.endlessTide = true; s.maxFlocks += 30; s.bonusFlocks = (s.bonusFlocks || 0) + 6; s.dotHpMul = (s.dotHpMul || 1) * 0.5; } },
    // ── DEATH theme (what kills trigger) ──
    { id: 'harvest_field',  name: 'HARVEST FIELD',  kind: 'death', tier: 'rewrite', max: 1, desc: 'enemy deaths heal your core a little', apply: s => { s.harvestField = true; } },
    { id: 'scorched_earth', name: 'SCORCHED EARTH', kind: 'death', tier: 'marquee', max: 1, cost: 'the blasts hurt your own swarms too', desc: 'every enemy death detonates an AoE', apply: s => { s.scorchedEarth = true; } },
    // ── DUEL theme (the guard counter) ──
    { id: 'overextend',     name: 'OVEREXTEND',     kind: 'duel', tier: 'rewrite', max: 1, desc: 'your dominant channel hits much harder — but so does the counter against it', apply: s => { s.overextend = true; } },
    // ── EXPANSION: a 2nd solid rewrite per theme (deepens each axis) ──
    { id: 'kamikaze',    name: 'KAMIKAZE PROTOCOL', kind: 'swarm', tier: 'rewrite', max: 1, desc: 'swarm dots detonate a small blast when they die', apply: s => { s.kamikaze = true; } },
    { id: 'relentless',  name: 'RELENTLESS',        kind: 'swarm', tier: 'rewrite', desc: '+1 swarm flock; swarms regrow faster and their dots are tougher', apply: s => { s.maxFlocks += 1; s.bonusFlocks = (s.bonusFlocks || 0) + 1; s.relentlessRegen = true; s.dotHpMul = (s.dotHpMul || 1) * 1.3; } },
    { id: 'bulwark_arc', name: 'BULWARK ARC',       kind: 'core',  tier: 'rewrite', max: 1, desc: 'the core projects a barrier toward your focus target, slowing enemies on that side', apply: s => { s.bulwarkArc = true; } },
    { id: 'executioner', name: 'EXECUTIONER',       kind: 'focus', tier: 'rewrite', max: 1, desc: 'your army instantly executes a focus target below 18% HP', apply: s => { s.executioner = true; } },
    { id: 'sunder',      name: 'SUNDER',            kind: 'focus', tier: 'rewrite', max: 1, desc: 'focus targets shed their shields fast and take extra damage', apply: s => { s.sunder = true; } },
    { id: 'viral_load',  name: 'VIRAL LOAD',        kind: 'death', tier: 'rewrite', max: 1, desc: 'kills near a focus target spread a contagion to nearby enemies', apply: s => { s.viralLoad = true; } },
    // ── POD theme (the greater units — strider/bulwark/siege/glacier/conductor/reaper/fabricator) ──
    { id: 'heavy_ordnance',     name: 'HEAVY ORDNANCE',     kind: 'pod', tier: 'rewrite', desc: 'your pods hit 40% harder', apply: s => { s.podDmgMul = (s.podDmgMul || 1) * 1.4; } },
    { id: 'reinforced_chassis', name: 'REINFORCED CHASSIS', kind: 'pod', tier: 'rewrite', desc: 'your pods have +60% HP', apply: s => { const k = 1.6; s.podHpMul = (s.podHpMul || 1) * k; s.units.forEach(u => { u.maxHp = Math.round(u.maxHp * k); u.hp = Math.round(u.hp * k); }); } },
    { id: 'field_promotion',    name: 'FIELD PROMOTION',    kind: 'pod', tier: 'rewrite', desc: 'your pods gain rank from field XP much faster', apply: s => { s.podXpMul = (s.podXpMul || 1) * 2.2; } },
    { id: 'overlord',           name: 'OVERLORD PROTOCOL',  kind: 'pod', tier: 'marquee', max: 1, cost: 'you can field only ONE pod', desc: 'your single pod is vastly stronger (×2.2 damage + HP)', apply: s => { s.podCap = 1; const k = 2.2; s.podDmgMul = (s.podDmgMul || 1) * k; s.podHpMul = (s.podHpMul || 1) * k; s.units.forEach(u => { u.maxHp = Math.round(u.maxHp * k); u.hp = Math.round(u.hp * k); }); if (s.units.length > 1) s.units.length = 1; } },
  ];
  // SIGNATURE picks — the HYBRID source: each exotic/unit you brought in from the
  // roster injects its own marquee card, so the hand is YOUR build talking (slice 4).
  // req(s) reads what you fielded (s.ex exotics, s.unlocked units). One-shot (max 1).
  const SIGNATURES = {
    hive:   { id: 'sig_hive',   name: 'HIVE OVERMIND',     kind: 'sig', req: s => s.ex.hive,        desc: '+3 flock cap and swarms regrow far faster',            apply: s => { s.maxFlocks += 3; s.hiveRegen = true; } },
    flame:  { id: 'sig_flame',  name: 'FIRESTORM',         kind: 'sig', req: s => s.ex.flame,       desc: 'your swarms set enemies alight (damage-over-time)',     apply: s => { s.firestorm = true; } },
    bloom:  { id: 'sig_bloom',  name: 'PANDEMIC',          kind: 'sig', req: s => s.ex.bloom,       desc: 'contagion deaths seed a much wider radius',             apply: s => { s.pandemic = true; } },
    reaper: { id: 'sig_reaper', name: 'HARVEST PROTOCOL',  kind: 'sig', req: s => s.unlocked.reaper, desc: 'your reaper executes enemies from much higher HP',     apply: s => { s.harvest = true; } },
    siege:  { id: 'sig_siege',  name: 'SATURATION FIRE',   kind: 'sig', req: s => s.unlocked.siege,  desc: 'your siege scatters far more cluster bomblets',        apply: s => { s.saturation = true; } },
    strider:    { id: 'sig_strider',    name: 'OVERCHARGED RAILGUN', kind: 'sig', req: s => s.unlocked.strider,    desc: 'your strider\'s railgun hits far harder',                 apply: s => { s.striderOver = true; } },
    bulwark:    { id: 'sig_bulwark',    name: 'AEGIS WALL',          kind: 'sig', req: s => s.unlocked.bulwark,    desc: 'your bulwark is far tougher and self-repairs much faster', apply: s => { s.aegisWall = true; const u = s.units.find(x => x.type === 'bulwark'); if (u) { u.maxHp = Math.round(u.maxHp * 1.8); u.hp = Math.round(u.hp * 1.8); } } },
    glacier:    { id: 'sig_glacier',    name: 'DEEP FREEZE',         kind: 'sig', req: s => s.unlocked.glacier,    desc: 'your glacier thumps faster, freezing a much wider ring',  apply: s => { s.deepFreeze = true; } },
    conductor:  { id: 'sig_conductor',  name: 'POWER GRID',          kind: 'sig', req: s => s.unlocked.conductor,  desc: 'your conductor overclocks a wider swarm, much harder',    apply: s => { s.powerGrid = true; } },
    fabricator: { id: 'sig_fabricator', name: 'MASS PRODUCTION',     kind: 'sig', req: s => s.unlocked.fabricator, desc: 'your fabricator prints a much bigger drone brood',        apply: s => { s.massProduction = true; } },
  };
  function eligibleSigs(s) { return Object.keys(SIGNATURES).map(k => SIGNATURES[k]).filter(g => g.req(s) && pickCount(s, g.id) < 1); }
  function pickCount(s, id) { let n = 0; for (const x of s.picksTaken) if (x === id) n++; return n; }
  function offerPick(s) {
    if (s.pick || s.won || s.lost || s.picksOff) return;
    // the everyday hand = commons + solid rewrites (marquees are rare + telegraphed, injected below)
    const avail = PICKS.filter(p => p.tier !== 'marquee' && pickCount(s, p.id) < (p.max || 99));
    for (let i = avail.length - 1; i > 0; i--) { const j = Math.floor(s.rng() * (i + 1)); const t = avail[i]; avail[i] = avail[j]; avail[j] = t; }
    const hand = avail.slice(0, 3);
    // ONE special slot: a roster SIGNATURE (more likely), else sometimes a rare MARQUEE
    const sigs = eligibleSigs(s);
    const marquees = PICKS.filter(p => p.tier === 'marquee' && pickCount(s, p.id) < (p.max || 1));
    const r = s.rng();
    if (sigs.length && r < 0.5) hand[Math.floor(s.rng() * hand.length)] = sigs[Math.floor(s.rng() * sigs.length)];
    else if (marquees.length && r < 0.78) hand[Math.floor(s.rng() * hand.length)] = marquees[Math.floor(s.rng() * marquees.length)];
    s.pick = { hand };
    say(s, 'a make-or-break PICK opens — reshape your build.');
  }
  function takePick(s, id) {
    if (!s.pick) return false;
    const p = s.pick.hand.find(x => x.id === id);
    if (p) { p.apply(s); s.picksTaken.push(id); s.newPicks.push(id); say(s, `picked ${p.name}.`); }
    s.pick = null; return true;
  }

  // ── enemies + surges ────────────────────────────────────────────────────────
  function spawnEnemy(s, type, opts) {
    const def = ENEMIES[type], hp = def.hp * ENEMY_HP_MUL * (1 + s.threat * 0.012);   // tankier so they don't pop instantly
    const e = { id: uid(s), type, hp, maxHp: hp, r: def.r, color: def.color, elite: def.elite, poison: 0, chill: 0, frozen: 0, shield: def.shield || 0, shieldMax: def.shield || 0, coredmgMul: 1, speedMul: 1, lastHit: 0, hitT: 0, fade: 0.65, laneIdx: null, dist: 0, blockedBy: null };   // spawn already mostly visible — no slow materialize
    if (opts && opts.surge) applyCounter(s, e);              // surge spawns carry the guard's counter
    if (s.laneMode && s.lanes.length) {                        // walk down a lane — STAGGERED along it so a wave streams, not stacks
      const li = opts && opts.lane != null ? opts.lane : Math.floor(s.rng() * s.lanes.length);
      e.laneIdx = li; e.dist = (opts && opts.dist) || 0;
      const p = posOnLane(s.lanes[li], e.dist); e.x = p.x; e.y = p.y;
    } else {                                                   // open: a point on the ring (angle + radial rings spread the wave out)
      const ang = opts && opts.ang != null ? opts.ang : (opts && opts.angBase != null ? opts.angBase + (s.rng() - 0.5) * 0.5 : s.rng() * TAU);
      const rad = (opts && opts.rad) || s.spawnR;
      e.x = s.core.x + Math.cos(ang) * rad; e.y = s.core.y + Math.sin(ang) * rad;
    }
    s.enemies.push(e);
  }
  function tickSpawns(s, dt) {
    if (s.ambient) {   // idle-defense window — a gentle endless trickle, no surges/draft/boss
      s.spawnAccum += dt * 0.7;
      while (s.spawnAccum >= 1) { s.spawnAccum -= 1; spawnEnemy(s, 'probe'); }
      return;
    }
    if (s.bossSpawned || s.surge >= s.GOAL_SURGES) return;   // boss is out — clear the field to finish
    // WAVE DEFENSE: no trickle — each surge is a discrete wave, and the NEXT one only
    // telegraphs once you've cleared every enemy from the last.
    if (s.warn) { s.warn.t -= dt; if (s.warn.t <= 0) { doSurge(s, s.warn.ang); s.warn = null; } }
    else if (s.enemies.length === 0) {   // field clear → arm the next wave after a short beat
      s.surgeT -= dt;
      if (s.surgeT <= 0) { s.warn = { ang: s.rng() * TAU, t: 2.2 }; if (s.laneMode) pickWaveLanes(s); armCounter(s); say(s, s.laneMode ? '>> SURGE inbound — watch the lit lanes. <<' : '>> SURGE inbound — watch the marked arc. <<'); }
    }
  }
  // THREAT TIER gates the enemy menagerie (set by act + mission): tier 0 = all standard
  // probes; higher tiers unlock the nastier types. Surges escalate DENSITY, not the menu.
  function tierPool(tier) { const p = []; if (tier >= 1) p.push('rusher', 'enforcer'); if (tier >= 2) p.push('ward'); if (tier >= 3) p.push('splitter', 'disruptor'); return p; }
  function doSurge(s, ang) {
    s.surge++; s.threat += 6;
    // PLACE each spawn so a wave doesn't pile on one point: lane mode → round-robin the wave's
    // lanes + stagger DIST down each (a streaming column); open mode → fan across the arc + radial rings.
    const laneList = s.laneMode ? (s.waveLanes && s.waveLanes.length ? s.waveLanes : s.lanes.map((_, i) => i)) : null;
    const fill = {}; let rr = 0, arc = 0;
    function place(type) {
      const o = { surge: true };
      if (s.laneMode) {
        const lane = laneList[rr++ % laneList.length];
        const k = (fill[lane] = (fill[lane] || 0) + 1) - 1;     // this lane's slot → spacing down the path
        o.lane = lane; o.dist = k * 30 + s.rng() * 10;
      } else {
        o.ang = ang + ((arc % 9) / 9 - 0.44) * 1.15 + (s.rng() - 0.5) * 0.12;   // fan across ~1.1 rad of the marked arc
        o.rad = s.spawnR + (Math.floor(arc / 9) % 3) * 20;                       // stack in 3 radial rings
        arc++;
      }
      spawnEnemy(s, type, o);
    }
    if (s.surge >= s.GOAL_SURGES) {                          // CLIMAX — the boss wave ends the run
      s.bossSpawned = true; place(s.boss);
      for (let i = 0; i < s.bossEscort; i++) place('enforcer');
      say(s, s.boss === 'juggernaut'
        ? '>> THE JUGGERNAUT BREAKS FROM THE DARK. bring it down and the node is yours. <<'
        : '>> THE BAIT IS TAKEN — they close in for the kill. break them and the ground is yours. <<');
      return;
    }
    const c = s.counter;
    let pool = tierPool(s.tier), specials = Math.min(12, Math.floor(s.surge * 1.3));   // tier gates the menu; surge sets the count
    if (c) { pool = pool.concat(COUNTER[c.channel].add).filter(t => ENEMIES[t]); specials += Math.round(c.mag * 4); }   // the counter FLOODS its anti-build types
    const probes = Math.round((2 + s.surge * 1.3) * (s.intensity || 1));   // WAVE pressure piles on count
    for (let i = 0; i < probes; i++) place('probe');
    for (let i = 0; i < specials; i++) place(pool.length ? pool[Math.floor(s.rng() * pool.length)] : 'probe');
    s.surgeT = 1.5 + s.rng() * 1;   // brief beat after the field clears before the next wave telegraphs
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
      if (s.core.marks.indexOf(e.id) >= 0) v -= 5000;          // FOCUS-FIRE — the swarm concentrates on your marked target(s)
      if (v < bv) { bv = v; best = e; }
    }
    f.tgtId = best ? best.id : null; f.tx = best ? best.x : null; f.ty = best ? best.y : null;
  }
  function updateFlocks(s, dt) {
    const disrupt = s.enemies.filter(e => e.type === 'disruptor');
    for (const f of s.flocks) {
      let cx = 0, cy = 0; for (const d of f.dots) { cx += d.x; cy += d.y; } const n = f.dots.length || 1; f.cx = cx / n; f.cy = cy / n;
      f.tgtT -= dt; if (f.tgtT <= 0) { f.tgtT = 0.3; pickFlockTarget(s, f); }
      const spd0 = SWARMS[f.type].speed * (f.buff ? (s.powerGrid ? 1.5 : 1.25) : 1);        // conductor overclock (POWER GRID stronger)
      // LEASH — the swarm holds a PERIMETER around the core (so enemies advance into view
      // before being met) unless you're in PRESS stance. guard = tight, hunt = wider.
      const leash = s.stance === 'press' ? 1e9 : s.viewR * (s.stance === 'hunt' ? 1.7 : 1.45);   // wide — the swarm ranges out to meet enemies near where they enter
      for (const d of f.dots) {
        const spd = disrupt.length && jammedAt(disrupt, d.x, d.y) ? spd0 * 0.55 : spd0;   // DISRUPTOR jam slows the swarm
        let tx, ty;
        if (f.behavior === 'peel') { const e = nearestEnemy(s, d.x, d.y); tx = e ? e.x : s.core.x; ty = e ? e.y : s.core.y; }
        else if (f.behavior === 'swirl') { const px = f.tx ?? f.cx, py = f.ty ?? f.cy, a = Math.atan2(d.y - py, d.x - px) + 1.15; tx = px + Math.cos(a) * 44; ty = py + Math.sin(a) * 44; }
        else { tx = f.tx ?? f.cx; ty = f.ty ?? f.cy; }            // lock → the one enemy
        const tdc = dist(tx, ty, s.core.x, s.core.y);            // clamp the chase target to the leash ring
        if (tdc > leash) { const k = leash / tdc; tx = s.core.x + (tx - s.core.x) * k; ty = s.core.y + (ty - s.core.y) * k; }
        const dd = dist(d.x, d.y, tx, ty) || 1; let ax = (tx - d.x) / dd, ay = (ty - d.y) / dd;
        for (const o of f.dots) { if (o === d) continue; const sx = d.x - o.x, sy = d.y - o.y, m = sx * sx + sy * sy; if (m < 220 && m > 0) { const im = 1 / Math.sqrt(m); ax += sx * im * 0.55; ay += sy * im * 0.55; } }
        ax += (f.cx - d.x) * 0.0018; ay += (f.cy - d.y) * 0.0018;  // mild cohesion
        d.vx += ax * spd * dt * 3.2; d.vy += ay * spd * dt * 3.2;
        const v = Math.hypot(d.vx, d.vy) || 1; if (v > spd) { d.vx = d.vx / v * spd; d.vy = d.vy / v * spd; }
        d.x += d.vx * dt; d.y += d.vy * dt;
      }
      f.regenT -= dt; if (f.regenT <= 0 && f.dots.length < f.cap) { f.regenT = (s.endlessTide ? 0.12 : s.hiveRegen ? 0.32 : s.relentlessRegen ? 0.5 : s.ex.hive ? 0.5 : 0.85) * (f.buff ? 0.6 : 1); f.dots.push(spawnDot(s, f)); }   // ENDLESS TIDE / HIVE / RELENTLESS regrow faster
    }
    for (let i = s.flocks.length - 1; i >= 0; i--) if (s.flocks[i].dots.length === 0) { say(s, `a ${s.flocks[i].type} swarm was wiped — redeploying.`); s.flocks.splice(i, 1); }
  }
  function dotDamage(s, dt) {
    const CONTACT = 20, disruptors = s.enemies.filter(e => e.type === 'disruptor');
    for (const f of s.flocks) {
      const dmg = SWARMS[f.type].dotDmg * (f.buff ? (s.powerGrid ? 1.8 : 1.4) : 1) * chMult(s, 'offense');   // OFFENSE channel scales swarm DPS (POWER GRID stronger overclock)
      for (const d of f.dots) {
        const e = nearestEnemy(s, d.x, d.y, CONTACT); if (!e) continue;
        let m = 1 + markMul(s, e); if (e.poison > 0) m += 0.5; if (e.frozen > 0) m += 1.0;   // SYNERGY: marked + poisoned (+50%) + frozen (+100% shatter)
        let amt = dmg * m * dt; if (disruptors.length && jammedAt(disruptors, d.x, d.y)) amt *= 0.45;   // DISRUPTOR jam blunts the swarm
        damageEnemy(s, e, amt);
        if (f.applies === 'poison') e.poison = Math.min(60, e.poison + 20 * dt);
        if (s.firestorm) e.poison = Math.min(60, e.poison + 12 * dt);   // FIRESTORM signature: every swarm sets enemies alight
        d.hp -= ENEMIES[e.type].dotDmg * dt;                      // the enemy fights back while latched
      }
      if (s.kamikaze) for (const d of f.dots) if (d.hp <= 0) { for (const e of s.enemies) if (dist(e.x, e.y, d.x, d.y) < 44) damageEnemy(s, e, 14 * chMult(s, 'offense')); s.bursts.push({ x: d.x, y: d.y, life: 0.28, color: '#ffae5a' }); }   // KAMIKAZE: dying dots detonate
      f.dots = f.dots.filter(d => d.hp > 0);
    }
  }

  // ── core-gun (projectiles) ──────────────────────────────────────────────────
  function makeBrood(s, owner, cap) { return { id: uid(s), type: 'brood', color: '#ffd24a', behavior: 'peel', applies: null, cap, dots: [], tgtId: null, tx: null, ty: null, cx: s.core.x, cy: s.core.y, tgtT: 0, regenT: 0, owned: owner }; }
  // CORE channel = FOCUS-FIRE potency: how much extra your army does to the marked target.
  // CHAIN FOCUS rewrite bleeds a fraction to enemies near a mark; TWIN MARKS halves the per-target bonus.
  function markMul(s, e) {
    const base = (0.9 + (s.core.lvl - 1) * 0.25) * chMult(s, 'core');
    const twinPen = s.core.maxMarks > 1 ? 0.55 : 1;
    if (s.core.marks.indexOf(e.id) >= 0) return base * twinPen + (s.sunder ? 0.45 * chMult(s, 'core') : 0);   // SUNDER: extra vuln on focus targets
    if (s.chainFocus && s._markPos) { for (const mp of s._markPos) if (dist(e.x, e.y, mp.x, mp.y) < 95) return base * 0.5 * twinPen; }
    return 0;
  }
  function updateCore(s, dt) {
    s.core.cd -= dt;
    // marks are PLAYER-SET (triage tap) only — so the reticle unambiguously means "you focused this".
    // No mark = the swarm defends on its stance default (nearest-to-core for GUARD).
    s.core.marks = s.core.marks.filter(id => s.enemies.some(e => e.id === id));   // drop focus targets that died/left
    s._markPos = s.core.marks.map(id => { const e = s.enemies.find(x => x.id === id); return e ? { x: e.x, y: e.y } : null; }).filter(Boolean);
    if (s.executioner || s.sunder) for (const id of s.core.marks) {   // FOCUS rewrites that act ON the marked target
      const e = s.enemies.find(x => x.id === id); if (!e) continue;
      if (s.sunder && e.shield > 0) e.shield = Math.max(0, e.shield - 70 * dt);   // SUNDER melts the shield
      if (s.executioner && e.hp > 0 && e.hp < e.maxHp * 0.18) { e.hp = 0; s.bursts.push({ x: e.x, y: e.y, life: 0.4, color: '#ff5a6a', ring: true }); }   // EXECUTIONER finishes it
    }
    if (s.siegeCannon) {   // SIEGE CANNON — the core fires a heavy beam down your focus line
      s.core.cannonCd = (s.core.cannonCd || 0) - dt;
      if (s.core.cannonCd <= 0 && s.core.marks.length) {
        s.core.cannonCd = 1.6;
        const tgt = s.enemies.find(x => x.id === s.core.marks[0]);
        if (tgt) { hitEnemy(s, tgt, 120 * chMult(s, 'core')); s.beams.push({ x1: s.core.x, y1: s.core.y, x2: tgt.x, y2: tgt.y, life: 0.18, color: '#ffd24a', rail: true }); }
      }
    }
    // move all live shots
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
    else { u.cd = 1 / 0.55; hitEnemy(s, tgt, pdmg(s, u)); s.beams.push({ x1: u.x, y1: u.y, x2: tgt.x, y2: tgt.y, life: 0.14, color: '#ffffff', rail: true }); }
  }
  function uAnchor(s, u, dt) {                             // BULWARK — a player-placed WALL: walk to where you put it, then plug + grind; self-repairs
    if (u.moveTo) { const dx = u.moveTo.x - u.x, dy = u.moveTo.y - u.y, d = Math.hypot(dx, dy) || 1; if (d > 4) { const step = Math.min(d, 95 * dt); u.x += dx / d * step; u.y += dy / d * step; u.walk += step * 0.04; } }
    u.aim = Math.atan2(s.core.y - u.y, s.core.x - u.x);
    u.hp = Math.min(u.maxHp, u.hp + (s.aegisWall ? 40 : 16) * dt);     // self-repair (AEGIS WALL repairs faster)
    if (u.cd <= 0) { let hit = false; for (const e of s.enemies) if (dist(e.x, e.y, u.x, u.y) < u.r + ENEMIES[e.type].r + 30) { hitEnemy(s, e, pdmg(s, u)); hit = true; } if (hit) u.cd = 1 / 1.6; }   // grind the pile
  }
  function uArtillery(s, u, dt) {                          // SIEGE — player-placed; lobs cluster rockets at distant clusters (poison bomblets on contagion ammo)
    if (u.moveTo) { const dx = u.moveTo.x - u.x, dy = u.moveTo.y - u.y, d = Math.hypot(dx, dy) || 1; if (d > 4) { const step = Math.min(d, 70 * dt); u.x += dx / d * step; u.y += dy / d * step; u.walk += step * 0.04; } }
    const tgt = densestEnemy(s) || nearestEnemy(s, u.x, u.y);
    if (tgt) u.aim = Math.atan2(tgt.y - u.y, tgt.x - u.x);
    if (u.cd > 0 || !tgt) return;
    u.cd = 1 / 0.5;
    s.shots.push({ x: u.x, y: u.y, tid: tgt.id, tx: tgt.x, ty: tgt.y, speed: 300, dmg: pdmg(s, u), splash: 0, poison: 6, color: '#e0913f', life: 3.2, lob: true, rocket: true, split: 120, bomblets: s.saturation ? 8 : 5 });   // SATURATION FIRE signature
  }
  function uCryo(s, u, dt) {                               // GLACIER — roams in, then THUMPS the ground → an expanding FREEZING SHOCKWAVE (chill → freeze → shatter)
    const tgt = nearestEnemy(s, u.x, u.y);
    roam(s, u, tgt ? tgt.x : null, tgt ? tgt.y : null, 70, 88, dt);
    if (u.thumpT > 0) u.thumpT -= dt;
    if (u.cd <= 0 && tgt && dist(tgt.x, tgt.y, u.x, u.y) < 300) {
      u.cd = s.deepFreeze ? 1.4 : 2.2; u.thumpT = 0.32;     // recover + play the slam (DEEP FREEZE thumps faster + wider)
      s.waves.push({ x: u.x, y: u.y, r: 0, maxR: s.deepFreeze ? 360 : 245, speed: 300, hit: {} });
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
    for (const f of s.flocks) if (dist(f.cx, f.cy, u.x, u.y) < (s.powerGrid ? 360 : 235)) f.buff = true;   // POWER GRID overclocks a wider swarm
    for (const e of s.enemies) if (e.elite && dist(e.x, e.y, u.x, u.y) < e.r + 18) u.hp -= ENEMIES[e.type].dotDmg * dt;
  }
  function uReaper(s, u, dt) {                             // REAPER — fast; DETONATES a poisoned target's stacks as AoE, EXECUTES low-HP enemies for a COMPUTE refund
    let tgt = null, bv = -Infinity;
    for (const e of s.enemies) { const v = (e.poison > 0 ? 1e4 : 0) + (e.hp < e.maxHp * 0.22 ? 6e3 : 0) - dist(e.x, e.y, u.x, u.y); if (v > bv) { bv = v; tgt = e; } }
    roam(s, u, tgt ? tgt.x : null, tgt ? tgt.y : null, 26, 182, dt);
    if (u.cd > 0 || !tgt || dist(tgt.x, tgt.y, u.x, u.y) > 48) return;
    u.cd = 1 / 1.7; s.beams.push({ x1: u.x, y1: u.y, x2: tgt.x, y2: tgt.y, life: 0.1, color: '#9ef0c0' });
    if (tgt.hp <= tgt.maxHp * (s.harvest ? 0.32 : 0.18)) { tgt.hp = 0; s.bursts.push({ x: tgt.x, y: tgt.y, life: 0.4, color: '#9ef0c0', ring: true }); return; }   // EXECUTE the weak (HARVEST signature lifts the threshold)
    hitEnemy(s, tgt, pdmg(s, u));
    if (tgt.poison > 0) { const blast = tgt.poison * 1.6; for (const o of s.enemies) if (dist(o.x, o.y, tgt.x, tgt.y) < 92) damageEnemy(s, o, blast); tgt.poison = 0; s.bursts.push({ x: tgt.x, y: tgt.y, life: 0.45, color: '#76e08a', ring: true }); }
  }
  function uFabricator(s, u, dt) {                         // FABRICATOR — slow; keeps a free BROOD flock of mini-drones topped up (doesn't count vs the flock cap)
    const tgt = nearestEnemy(s, u.x, u.y);
    roam(s, u, tgt ? tgt.x : null, tgt ? tgt.y : null, 240, 32, dt);   // slow hexapod carrier
    let brood = s.flocks.find(f => f.owned === u.id);
    const bcap = (s.massProduction ? 16 : 8) + u.lvl * (s.massProduction ? 3 : 2);   // MASS PRODUCTION → bigger brood
    if (!brood) { brood = makeBrood(s, u.id, bcap); for (let i = 0; i < 3; i++) brood.dots.push(spawnDot(s, brood)); s.flocks.push(brood); say(s, 'fabricator spins up a drone brood.'); }
    else brood.cap = bcap;
  }

  function onKill(s, e) {
    s.kills++;
    s.bursts.push({ x: e.x, y: e.y, life: 0.42, color: e.color, big: e.elite });
    for (const u of s.units) { u.xp += (e.elite ? 14 : 4) * (s.podXpMul || 1); checkUnitLevel(s, u); }   // FIELD PROMOTION speeds pod XP
    if (ENEMIES[e.type].splits) {                                // SPLITTER bursts into spawnlings (on its lane, where it fell)
      const d2 = ENEMIES.spawnling;
      for (let i = 0; i < ENEMIES[e.type].splits; i++) { const a = s.rng() * TAU; s.enemies.push({ id: uid(s), type: 'spawnling', x: e.x + Math.cos(a) * 18, y: e.y + Math.sin(a) * 18, hp: d2.hp, maxHp: d2.hp, r: d2.r, color: d2.color, elite: false, poison: 0, chill: 0, frozen: 0, shield: 0, shieldMax: 0, lastHit: 0, hitT: 0, fade: 1, laneIdx: e.laneIdx, dist: Math.max(0, e.dist - 12), blockedBy: null }); }
    }
    if (s.ex.bloom && e.poison > 0) {                            // EXOTIC: contagion bloom — death seeds the cluster
      for (const o of s.enemies) if (o !== e && o.hp > 0 && dist(o.x, o.y, e.x, e.y) < (s.pandemic ? 150 : 96)) o.poison = Math.min(60, o.poison + 30);   // PANDEMIC signature widens the bloom
      s.bursts.push({ x: e.x, y: e.y, life: 0.5, color: '#76e08a', ring: true });
    }
    if (s.harvestField && !s.core.invuln) s.core.hp = Math.min(s.core.maxHp, s.core.hp + 1.5);   // HARVEST FIELD: kills heal the core
    if (s.viralLoad && s._markPos && s._markPos.some(mp => dist(mp.x, mp.y, e.x, e.y) < 120)) {   // VIRAL LOAD: a kill near a focus target seeds contagion
      for (const o of s.enemies) if (o !== e && o.hp > 0 && dist(o.x, o.y, e.x, e.y) < 90) o.poison = Math.min(60, o.poison + 25);
      s.bursts.push({ x: e.x, y: e.y, life: 0.4, color: '#76e08a', ring: true });
    }
    if (s.scorchedEarth) {                                       // SCORCHED EARTH: every death detonates — and singes your own swarms
      for (const o of s.enemies) if (o !== e && o.hp > 0 && dist(o.x, o.y, e.x, e.y) < 85) damageEnemy(s, o, 30 * chMult(s, 'offense'));
      for (const f of s.flocks) for (const d of f.dots) if (dist(d.x, d.y, e.x, e.y) < 85) d.hp -= 8;
      s.bursts.push({ x: e.x, y: e.y, life: 0.45, color: '#ff7a3a', ring: true });
    }
    if (s.splitDoctrine && (s.t - (s.splitTime || -9) > 1.0) && s.flocks.filter(f => !f.owned).length < s.maxFlocks) {   // SPLIT DOCTRINE: a kill spins off a fresh mini-flock
      const def = SWARMS.hunter, f = { id: uid(s), type: 'hunter', color: def.color, behavior: def.behavior, applies: def.applies || null, cap: 6, dots: [], tgtId: null, tx: null, ty: null, cx: e.x, cy: e.y, tgtT: 0, regenT: 0 };
      for (let i = 0; i < 4; i++) f.dots.push({ x: e.x + (s.rng() - 0.5) * 20, y: e.y + (s.rng() - 0.5) * 20, vx: 0, vy: 0, hp: def.dotHp * (s.dotHpMul || 1) });
      s.flocks.push(f); s.splitTime = s.t;
    }
  }
  function coreHit(s, e) {
    e.dead = true;
    s.leaks++;                          // a leak — counts even in the perimeter (where hp is pinned): drives the NET gauge
    if (s.core.invuln) return;
    s.core.hp -= ENEMIES[e.type].coredmg * (e.coredmgMul || 1);
    if (s.core.hp <= 0) { s.core.hp = 0; s.lost = true; say(s, '>> CORE BREACHED. they are inside you. the node is lost. <<'); }
  }
  function updateEnemies(s, dt) {
    const anchors = s.units.filter(u => u.behavior === 'anchor');     // bulwarks taunt + soak
    for (const e of s.enemies) {
      if (e.fade < 1) e.fade = Math.min(1, e.fade + dt * 14);   // near-instant fade-in right where they appear
      if (e.poison > 0) { e.hp -= e.poison * 0.25 * dt; e.poison = Math.max(0, e.poison - dt * 4); }   // poison BYPASSES shields (the WARD counter)
      if (e.shieldMax && e.shield < e.shieldMax && s.t - e.lastHit > 2) e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * 0.5 * dt);   // WARD shield regen when not pressured
      if (e.frozen > 0) { e.frozen -= dt; e.chill = 100; e.blockedBy = null; continue; }   // frozen solid — it doesn't move
      e.chill = Math.max(0, e.chill - dt * 18);
      let block = null; for (const a of anchors) if (dist(e.x, e.y, a.x, a.y) < a.r + ENEMIES[e.type].r + 26) { block = a; break; }   // a bulwark plugging the path
      e.blockedBy = block ? block.id : null;
      const chillSlow = e.chill > 0 ? 1 - Math.min(0.6, e.chill / 100 * 0.6) : 1;
      let sp = ENEMIES[e.type].speed * chillSlow * (e.poison > 0 ? 0.92 : 1) * (e.speedMul || 1);   // CORE-GUN counter speeds them up
      if (s.bulwarkArc && s._markPos && s._markPos.length) {   // BULWARK ARC: a barrier toward your focus target slows enemies on that side
        const mp = s._markPos[0], aMark = Math.atan2(mp.y - s.core.y, mp.x - s.core.x), aEne = Math.atan2(e.y - s.core.y, e.x - s.core.x);
        const dA = Math.abs(((aEne - aMark + Math.PI) % TAU) - Math.PI);
        if (dA < 0.8 && dist(e.x, e.y, s.core.x, s.core.y) < 180) sp *= 0.4;
      }
      if (block) {                                                    // halted at the wall — grind through it, no advance
        block.hp -= ENEMIES[e.type].dotDmg * dt;
      } else if (e.laneIdx != null && s.lanes[e.laneIdx]) {           // follow its lane in to the core
        const lane = s.lanes[e.laneIdx]; e.dist += sp * dt; const p = posOnLane(lane, e.dist); e.x = p.x; e.y = p.y;
        if (e.dist >= lane.len) coreHit(s, e);
      } else {                                                        // open mode / manually-placed → straight at the core
        const dx = s.core.x - e.x, dy = s.core.y - e.y, d = Math.hypot(dx, dy) || 1; e.x += dx / d * sp * dt; e.y += dy / d * sp * dt;
        if (d < (s.core.r || 42)) coreHit(s, e);   // removed only once it reaches the VISIBLE core edge (no early vanish)
      }
    }
    for (const e of s.enemies) if (e.hp <= 0 && !e.dead) { e.dead = true; onKill(s, e); }
    s.enemies = s.enemies.filter(e => !e.dead);
  }

  // ── the LIVING EYE ──────────────────────────────────────────────────────────
  // A pupil inside the core that WANDERS, briefly LOCKS onto the nearest/biggest threat
  // (and your focus-marked target), glances at your own units now and then, BLINKS, and
  // rarely stops to stare straight out at the player. Its temperament reacts to danger:
  // calm + slow when safe, fast-darting + dilated + reddening when the core is pressed.
  // Pure state (s.core.eye) — both renderers (app.js + defense-widget.js) draw it.
  function updateEye(s, dt) {
    const c = s.core, e = c.eye; if (!e) return;
    const R = c.r || 42, range = R * 0.40;
    // agitation: enemy count + how close the nearest is + how hurt the core is
    let near = Infinity; for (const en of s.enemies) { const d = dist(en.x, en.y, c.x, c.y); if (d < near) near = d; }
    const closeness = isFinite(near) ? Math.max(0, 1 - near / (s.viewR || 200)) : 0;
    const agi = Math.min(1, s.enemies.length / 7 * 0.55 + closeness * 0.7 + (1 - c.hp / (c.maxHp || 1)) * 0.5);
    e.dil += (agi - e.dil) * Math.min(1, dt * 3);
    // blink — a quick close/open every few seconds
    e.blinkT -= dt;
    if (e.blinkT <= 0 && e.blink <= 0) { e.blink = 1; e.blinkT = 2.2 + s.rng() * 4.8; }
    if (e.blink > 0) e.blink = Math.max(0, e.blink - dt / 0.17);
    // gaze behaviour — pick a new focus when the hold timer runs out
    e.t -= dt;
    if (e.t <= 0) {
      e.staring = false;
      const n = s.enemies.length, roll = s.rng(), lockChance = 0.22 + agi * 0.58;
      if (n > 0 && roll < lockChance) {
        let tgt = null;
        if (s._markPos && s._markPos.length && s.rng() < 0.45) tgt = s._markPos[Math.floor(s.rng() * s._markPos.length)];
        else if (s.rng() < 0.2 && (s.units.length || s.flocks.length)) {                 // glance at our OWN
          if (s.units.length && s.rng() < 0.5) { const u = s.units[Math.floor(s.rng() * s.units.length)]; tgt = { x: u.x, y: u.y }; }
          else if (s.flocks.length) { const f = s.flocks[Math.floor(s.rng() * s.flocks.length)]; tgt = { x: f.cx, y: f.cy }; }
        } else {                                                                          // nearest, elites pulled forward
          let best = null, bv = Infinity; for (const en of s.enemies) { let v = dist(en.x, en.y, c.x, c.y); if (en.elite) v -= 80; if (v < bv) { bv = v; best = en; } }
          if (best) tgt = { x: best.x, y: best.y };
        }
        if (tgt) { const dx = tgt.x - c.x, dy = tgt.y - c.y, d = Math.hypot(dx, dy) || 1; e.tx = dx / d * range; e.ty = dy / d * range; }
        else { e.tx = (s.rng() * 2 - 1) * range * 0.7; e.ty = (s.rng() * 2 - 1) * range * 0.7; }
        e.t = (0.4 + s.rng() * 0.5) * (1 - agi * 0.45);                                   // brief lock; darts faster when agitated
      } else if (n === 0 && roll < 0.12) {
        e.tx = 0; e.ty = 0; e.staring = true; e.t = 0.9 + s.rng() * 1.1;                   // STARE straight out at the player
      } else {
        const a = s.rng() * TAU, rr = s.rng() * range * 0.85; e.tx = Math.cos(a) * rr; e.ty = Math.sin(a) * rr;   // slow WANDER
        e.t = (1.3 + s.rng() * 1.8) * (1 - agi * 0.4);
      }
    }
    const ease = Math.min(1, dt * (3 + agi * 9));    // smooth drift when calm, snappy saccade when agitated
    e.x += (e.tx - e.x) * ease; e.y += (e.ty - e.y) * ease;
  }

  function tick(s, dt) {
    if (s.won || s.lost || s.pick) return;   // a pending make-or-break PICK pauses the board
    dt = Math.min(0.05, dt); s.t += dt;
    ensureField(s);                                               // keep the roster deployed (re-fields a wiped flock)
    // SHIELD channel = core survivability: it sets the core's max HP and regen rate.
    if (!s.core.invuln) {
      s.core.maxHp = Math.round((s.coreBase || 100) * chMult(s, 'shield'));   // HARDENED CORE lifts the base
      if (s.core.hp > s.core.maxHp) s.core.hp = s.core.maxHp;
      // NO baseline self-repair — regen comes ONLY from the SHIELD channel + the SELF-REPAIR pick.
      const regen = ((s.chBonus.shield || 0) * 6 + (s.selfRepairFlat || 0)) * (s.regenMul == null ? 1 : s.regenMul);
      if (regen > 0) s.core.hp = Math.min(s.core.maxHp, s.core.hp + regen * dt);
    }
    s.threat += dt * 0.18;
    tickSpawns(s, dt);
    updateFlocks(s, dt);
    dotDamage(s, dt);
    updateCore(s, dt);
    updateEye(s, dt);            // the core's LIVING gaze (both frames render s.core.eye)
    updateUnits(s, dt);
    updateWaves(s, dt);
    updateEnemies(s, dt);
    s.beams = s.beams.filter(b => (b.life -= dt) > 0);
    s.bursts = s.bursts.filter(b => (b.life -= dt) > 0);
    if (s.bossSpawned && s.enemies.length === 0) { s.won = true; say(s, '>> THE JUGGERNAUT FALLS. the node is SECURED. <<'); }
  }

  // FORCE the next wave early (even before the field is clear → waves stack). Each forced
  // wave bumps `rushed`, which the campaign turns into better end-of-battle loot. Risk/reward.
  function sendWave(s) {
    if (s.won || s.lost || s.bossSpawned || s.surge >= s.GOAL_SURGES || s.warn) return false;
    s.rushed++;
    s.warn = { ang: s.rng() * TAU, t: 0.6 }; if (s.laneMode) pickWaveLanes(s); armCounter(s);
    say(s, `>> WAVE FORCED (${s.rushed}) — loot quality rising. <<`);
    return true;
  }
  // TRIAGE: the player taps an enemy → the whole army focus-fires it.
  function setFocus(s, id) {
    const e = s.enemies.find(x => x.id === id); if (!e) return false;
    const i = s.core.marks.indexOf(id);
    if (i >= 0) { s.core.marks.splice(i, 1); return true; }   // tap an already-focused enemy = un-focus it
    s.core.marks.push(id);
    while (s.core.marks.length > s.core.maxMarks) s.core.marks.shift();   // evict the oldest mark
    s.bursts.push({ x: e.x, y: e.y, life: 0.45, color: '#ffd24a', ring: true });   // a confirm pulse on the new focus
    return true;
  }
  global.SWARM = { create, tick, summonFlock, fieldUnit, unitCost, moveUnit, upgradeCore, setStance, toggleEx, pickDraft, coreCost, flockCap, chMult, CHANNELS, setFocus, sendWave, difficulty, offerPick, takePick, PICKS, SIGNATURES, eligibleSigs, _hit: damageEnemy, SWARMS, ENEMIES, AMMO, UNITS };
})(typeof window !== 'undefined' ? window : globalThis);
