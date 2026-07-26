'use strict';
(function () {
  const SAVE_KEY = 'network_proto_save';
  const SAVE_VERSION = 1;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rndInt(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // --- city generation ---------------------------------------------------
  // Blocks of buildings separated by streets. Each building holds several
  // hosts; its cameras sit on the outside and are the way in. The engine below
  // still only sees `hosts` and `links`, so the whole loop is unchanged — this
  // is a generation and rendering layer over the same model.
  function makeCity() {
    const C = window.CITY;
    const buildings = [];
    const hosts = [];
    const links = [];
    let bid = 0, hid = 0;

    for (let row = 0; row < C.rows; row++) {
      for (let col = 0; col < C.cols; col++) {
        const districtKey = C.rowDistricts[row];
        const D = window.DISTRICTS[districtKey];
        const bx = C.street + col * (C.blockW + C.street);
        const by = C.street + row * (C.blockH + C.street);

        // subdivide the block into a small grid and drop a building in some cells
        const cells = [];
        const cw = C.blockW / 2, ch = C.blockH / 2;
        for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) cells.push({ x: bx + c * cw, y: by + r * ch, w: cw, h: ch });
        shuffleArr(cells);
        const n = rndInt(C.perBlock[0], C.perBlock[1]);

        for (let i = 0; i < Math.min(n, cells.length); i++) {
          const cell = cells[i];
          const kind = pick(D.kinds);
          const K = window.BUILDING_KINDS[kind];
          const w = Math.min(rndInt(K.w[0], K.w[1]), cell.w - 10);
          const h = Math.min(rndInt(K.h[0], K.h[1]), cell.h - 10);
          const b = {
            id: 'b' + (bid++),
            kind, district: districtKey, tier: D.tier,
            block: row * C.cols + col, row, col,
            x: Math.round(cell.x + (cell.w - w) / 2),
            y: Math.round(cell.y + (cell.h - h) / 2),
            w, h,
            hostIds: [],
            discovered: false,
          };
          buildings.push(b);
        }
      }
    }

    // populate each building: cameras on the outside, the rest within
    buildings.forEach(b => {
      const K = window.BUILDING_KINDS[b.kind];
      const made = [];

      const camCount = rndInt(K.cameras[0], K.cameras[1]);
      for (let i = 0; i < camCount; i++) made.push(makeHost('iot', b, true, i, camCount));
      for (const type in K.inside) {
        const range = K.inside[type];
        const count = rndInt(range[0], range[1]);
        for (let i = 0; i < count; i++) made.push(makeHost(type, b, false, 0, 0));
      }
      // every building needs a way in, or it can never be taken
      if (!made.some(h => h.exterior)) {
        const weakest = made.reduce((a, x) => (x.defense < a.defense ? x : a), made[0]);
        if (weakest) { weakest.exterior = true; weakest.onWall = true; }
      }
      made.forEach(h => { hosts.push(h); b.hostIds.push(h.id); });
    });

    function makeHost(type, b, exterior, idx, total) {
      const T = window.HOST_TYPES[type];
      // difficulty rides the district, so the curve survives the new layout
      const bump = b.tier * 2;
      const h = {
        id: 'h' + (hid++),
        type, role: T.role,
        buildingId: b.id,
        district: b.district,
        ring: b.tier,          // the engine's difficulty tier
        name: pick(window.HOST_NAMES[type]) + '-' + rndInt(10, 99),
        defense: rndInt(T.defense[0], T.defense[1]) + bump,
        threads: rndInt(T.threads[0], T.threads[1]),
        exterior: !!exterior,
        onWall: !!exterior,
        discovered: false,
        owned: false,
        stability: 1,
      };
      // cameras hang on the building's edge; interior hosts sit inside it
      if (exterior) {
        const t = total > 1 ? (idx + 1) / (total + 1) : 0.5;
        h.x = Math.round(b.x + b.w * t);
        h.y = Math.round(b.y);
      } else {
        h.x = Math.round(b.x + b.w * (0.25 + Math.random() * 0.5));
        h.y = Math.round(b.y + b.h * (0.3 + Math.random() * 0.5));
      }
      return h;
    }

    // --- links ---------------------------------------------------------
    const byId = {};
    hosts.forEach(h => { byId[h.id] = hosts.indexOf(h); });

    // inside a building everything is connected: once you are in, you are in
    buildings.forEach(b => {
      for (let i = 0; i < b.hostIds.length; i++) {
        for (let j = i + 1; j < b.hostIds.length; j++) {
          links.push([byId[b.hostIds[i]], byId[b.hostIds[j]]]);
        }
      }
    });

    // Across the street: each building wires only to its few nearest
    // neighbours, and only over a short distance. Linking every same-or-adjacent
    // block pair produced a spaghetti of long lines that buried the city.
    const ext = (b) => b.hostIds.map(id => hosts[byId[id]]).filter(h => h.exterior);
    const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const MAX_LINK = 165;
    const NEIGHBOURS = 3;
    const seenPair = {};
    const adjacency = {};

    buildings.forEach((a) => {
      const ca = centre(a);
      const cands = buildings
        .filter(b => b !== a && blocksAdjacent(a, b))
        .map(b => {
          const cb = centre(b);
          return { b, d: Math.hypot(ca.x - cb.x, ca.y - cb.y) };
        })
        .filter(o => o.d <= MAX_LINK)
        .sort((p, q) => p.d - q.d)
        .slice(0, NEIGHBOURS);

      cands.forEach(({ b }) => {
        const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
        if (seenPair[key]) return;
        seenPair[key] = true;
        const ea = ext(a), eb = ext(b);
        if (!ea.length || !eb.length) return;
        let best = null;
        ea.forEach(x => eb.forEach(y => {
          const d = (x.x - y.x) ** 2 + (x.y - y.y) ** 2;
          if (!best || d < best.d) best = { d, x, y };
        }));
        if (best) {
          links.push([byId[best.x.id], byId[best.y.id]]);
          (adjacency[a.id] = adjacency[a.id] || []).push(b.id);
          (adjacency[b.id] = adjacency[b.id] || []).push(a.id);
        }
      });
    });

    // Tightening the link distance to kill the visual spaghetti can leave
    // pockets of the city with no way in. Stitch any stranded component to its
    // nearest neighbour, so every building is genuinely reachable.
    (function connectStragglers() {
      const centre2 = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
      const compOf = {};
      let comp = 0;
      buildings.forEach(b => {
        if (compOf[b.id] !== undefined) return;
        const stack = [b.id];
        compOf[b.id] = comp;
        while (stack.length) {
          const cur = stack.pop();
          (adjacency[cur] || []).forEach(n => {
            if (compOf[n] === undefined) { compOf[n] = comp; stack.push(n); }
          });
        }
        comp++;
      });
      if (comp <= 1) return;

      const main = 0;
      for (let c = 1; c < comp; c++) {
        const group = buildings.filter(b => compOf[b.id] === c);
        const target = buildings.filter(b => compOf[b.id] === main);
        let best = null;
        group.forEach(g => target.forEach(t => {
          const cg = centre2(g), ct = centre2(t);
          const d = Math.hypot(cg.x - ct.x, cg.y - ct.y);
          if (!best || d < best.d) best = { d, g, t };
        }));
        if (!best) continue;
        const ea = ext(best.g), eb = ext(best.t);
        if (ea.length && eb.length) {
          links.push([byId[ea[0].id], byId[eb[0].id]]);
          (adjacency[best.g.id] = adjacency[best.g.id] || []).push(best.t.id);
          (adjacency[best.t.id] = adjacency[best.t.id] || []).push(best.g.id);
        }
        group.forEach(b => { compOf[b.id] = main; });
      }
    })();

    // the origin: a house in the suburbs, one host already yours
    const suburb = buildings.filter(b => b.district === 'residential');
    const origin = suburb[Math.floor(Math.random() * suburb.length)] || buildings[0];
    origin.discovered = true;
    const originHosts = origin.hostIds.map(id => hosts[byId[id]]);
    const seat = originHosts.find(h => !h.exterior) || originHosts[0];
    seat.owned = true;
    seat.discovered = true;
    seat.ring = 0;
    seat.origin = true;
    originHosts.forEach(h => { h.discovered = true; });

    return { buildings, hosts, links, adjacency, originId: seat.id };
  }

  function blocksAdjacent(a, b) {
    if (a.block === b.block) return true;
    const dr = Math.abs(a.row - b.row), dc = Math.abs(a.col - b.col);
    return (dr + dc) === 1; // across one street, not diagonally
  }

  function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function freshState() {
    const g = makeCity();
    return {
      buildings: g.buildings,
      adjacency: g.adjacency,
      view: null,          // pan/zoom, set on first render
      turn: 1,
      heat: 0,
      upgrades: 0,
      ap: window.AP.base,
      caps: {},            // capability id -> times bought
      tags: new Set(),
      nextEventTurn: 4,
      eventsSeen: [],
      recentEvents: [],
      eventSeenCount: {},
      res: { insight: 6, cash: 4 },
      hosts: g.hosts,
      links: g.links,
      people: [],
      selected: null,
      selectedBuilding: null,
      card: null,      // { kind:'breach'|'strike', hostId? }
      log: [],
      lastStage: 'foothold',
      strikes: 0,
      lastStrikeTurn: -99,
      over: false,
    };
  }

  let state = freshState();

  // --- derived -----------------------------------------------------------
  const owned = () => state.hosts.filter(h => h.owned);
  const ownedOf = (role) => owned().filter(h => h.role === role);

  // Breach power = a small base rig plus every held body's threads. This is the
  // flywheel: more bodies -> more power -> harder bodies.
  // Tags won from event cards feed straight back into the simulation's maths.
  // This is the whole point of weaving the two together: a decision on a card
  // has to change how the board behaves afterwards, or it was just flavour.
  const has = (t) => state.tags && state.tags.has(t);
  const capCount = (id) => (state.caps && state.caps[id]) || 0;
  const hasCap = (id) => capCount(id) > 0;

  // Your whole action budget for a turn. Capabilities move it in both
  // directions on purpose: buying real power costs you tempo.
  function maxAP() {
    let n = window.AP.base;
    window.CAPABILITIES.forEach(c => { n += (c.apDelta || 0) * capCount(c.id); });
    return Math.max(window.AP.min, n);
  }
  function capEffect(key, dflt) {
    let v = dflt;
    window.CAPABILITIES.forEach(c => {
      if (!hasCap(c.id) || !c.effect || c.effect[key] === undefined) return;
      v = key === 'yieldMult' ? v * c.effect[key] : v + c.effect[key];
    });
    return v;
  }

  function power() {
    return 2 + owned().reduce((a, h) => a + h.threads, 0)
      + (state.upgrades || 0) * window.UPGRADE.basePower
      + (has('ally_process') ? 3 : 0)
      + capEffect('power', 0);
  }
  // What a host effectively defends at — the world can harden against you.
  function defenseOf(h) {
    return h.defense + (has('known_capable') ? 2 : 0);
  }
  // You cannot hide a sprawl. Heat can be driven down toward this floor but
  // never past it, so growth permanently costs visibility — without a floor,
  // lying low resets heat to zero and the whole pressure system is toothless.
  // Stealth holdings are what lower the floor: that is what they are for.
  function heatFloor() {
    const loud = owned().filter(h => h.role !== 'stealth').length;
    const quiet = ownedOf('stealth').length;
    const loudPart = 0.8 * loud;
    const masked = Math.min(loudPart * window.HEAT.MAX_STEALTH_MASK,
                            0.9 * quiet + (has('dark_relay') ? 3 : 0));
    return Math.max(0, loudPart - masked + capEffect('floor', 0));
  }
  // Heat is bounded above as well as below: unbounded heat made being over the
  // line consequence-free, since the hunter is on a cooldown anyway.
  function clampHeat(v) {
    return Math.min(strikeThreshold() * window.HEAT.MAX_OVER, Math.max(heatFloor(), v));
  }
  function strikeThreshold() {
    return window.HEAT.STRIKE * (has('hunted') ? 0.75 : 1);
  }
  function upgradeCost() {
    const c = window.UPGRADE.costs;
    const n = state.upgrades || 0;
    if (n < c.length) return c[n];
    return Math.round(c[c.length - 1] * Math.pow(window.UPGRADE.growth, n - c.length + 1));
  }
  // Cover is what stealth holdings buy you — it gates the quiet approach.
  // Diminishing returns, deliberately. Linear cover meant every extra router
  // made the quiet route strictly better, and measurement showed 98% of all
  // entries were quiet — one of three routes doing nearly all the work.
  function cover() {
    const eyes = ownedOf('stealth').reduce((a, h) => a + (window.HOST_TYPES[h.type].cover || 0), 0);
    return 1 + Math.round(2.2 * Math.sqrt(eyes)) + (has('clean_room') ? 2 : 0);
  }
  function stageFor(count) {
    let s = window.STAGES[0];
    for (const st of window.STAGES) if (count >= st.min) s = st;
    return s;
  }
  function hostById(id) { return state.hosts.find(h => h.id === id); }
  function buildingById(id) { return (state.buildings || []).find(b => b.id === id); }
  function hostsIn(b) { return b ? b.hostIds.map(hostById).filter(Boolean) : []; }
  function buildingHeld(b) { return hostsIn(b).some(h => h.owned); }

  // Cameras are eyes. Holding one reveals the buildings around it without
  // spending a sweep — this is what makes the stealth role spatial rather than
  // just a number that buys down heat.
  function cameraVision() {
    const eyes = owned().filter(h => h.exterior && h.role === 'stealth');
    if (!eyes.length) return;
    const r2 = window.CITY.cameraVision * window.CITY.cameraVision;
    (state.buildings || []).forEach(b => {
      if (b.discovered) return;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (eyes.some(e => (e.x - cx) ** 2 + (e.y - cy) ** 2 <= r2)) revealBuilding(b);
    });
  }

  function revealBuilding(b) {
    if (!b || b.discovered) return false;
    b.discovered = true;
    hostsIn(b).forEach(h => { h.discovered = true; });
    return true;
  }

  // People only exist where you can see. They shuffle on the world turn, so
  // the city visibly moves exactly when the network runs.
  function repopulatePeople() {
    const C = window.CITY;
    const out = [];
    const seen = (state.buildings || []).filter(b => b.discovered);
    const blocks = {};
    seen.forEach(b => { blocks[b.block] = blocks[b.block] || b; });
    Object.keys(blocks).forEach(k => {
      const b = blocks[k];
      const n = rndInt(C.people.perRevealedBlock[0], C.people.perRevealedBlock[1]);
      for (let i = 0; i < n; i++) {
        // walk the streets around the block, not through the buildings
        const onVertical = Math.random() < 0.5;
        const x = onVertical
          ? b.x - C.street * (0.3 + Math.random() * 0.4)
          : b.x + Math.random() * C.blockW * 0.9;
        const y = onVertical
          ? b.y + Math.random() * C.blockH * 0.9
          : b.y - C.street * (0.3 + Math.random() * 0.4);
        out.push({ x: Math.round(x), y: Math.round(y) });
      }
    });
    state.people = out;
  }
  // What you can act on. Being inside a building gets you everything in it;
  // from the street you can only reach what is mounted on the outside. The
  // seat you start in is an interior host with no links out of its building,
  // so this must be answered at building level or the game cannot even open.
  function heldBuildingIds() {
    const set = {};
    owned().forEach(h => { set[h.buildingId] = true; });
    return set;
  }
  function buildingNeighbours(bid) { return (state.adjacency && state.adjacency[bid]) || []; }

  function isFrontier(h) {
    if (!h.discovered || h.owned) return false;
    const held = heldBuildingIds();
    if (held[h.buildingId]) return true;              // already inside
    if (!h.exterior) return false;                    // no way through a wall
    return buildingNeighbours(h.buildingId).some(id => held[id]);
  }
  function neighbours(h) {
    const idx = state.hosts.indexOf(h);
    const out = [];
    for (const [a, b] of state.links) {
      if (a === idx) out.push(state.hosts[b]);
      else if (b === idx) out.push(state.hosts[a]);
    }
    return out;
  }

  function snapshot() {
    return { power: power(), cover: cover(), insight: state.res.insight, cash: state.res.cash };
  }

  // --- turn resolution ---------------------------------------------------
  function heatPerTurn() {
    const fleet = owned();
    let h = window.HEAT.PER_HOST * fleet.length;
    // off_the_books silences the corporate premium specifically
    if (!has('off_the_books')) fleet.forEach(f => { h += (window.HOST_TYPES[f.type].heat || 0); });
    h -= window.HEAT.IOT_COVER * ownedOf('stealth').length;
    if (has('dark_relay')) h -= 1;
    return h;
  }

  function endTurn(opts) {
    const o = opts || {};
    const before = beforeSnap();
    state.turn += 1;

    // production — suppressed when the player deliberately went dark
    if (!o.silent) {
      const mult = capEffect('yieldMult', 1);
      owned().forEach(h => {
        const y = window.HOST_TYPES[h.type].yield || {};
        for (const k in y) state.res[k] = (state.res[k] || 0) + y[k] * mult;
      });
    }

    // churn — holdings decay unless shored up, so sprawl has upkeep
    const lost = [];
    owned().forEach(h => {
      if (h.origin) return; // only the seat you started from is safe
      h.stability -= window.HOST_TYPES[h.type].churn * (has('overextended') ? 1.5 : 1);
      if (h.stability <= 0) { h.owned = false; h.stability = 1; lost.push(h); }
    });

    state.heat = clampHeat(state.heat + heatPerTurn());
    afterSnap(before, { world: true });
    if (lost.length) pushLog(`Lost ${lost.map(h => h.name).join(', ')} to churn.`);

    const cooled = state.turn - (state.lastStrikeTurn || -99) >= window.HEAT.STRIKE_COOLDOWN;
    if (state.heat >= strikeThreshold() && cooled && !state.card) {
      state.card = { kind: 'strike' };
    } else if (!state.card && state.turn >= state.nextEventTurn) {
      const ev = drawEvent();
      if (ev) { state.card = { kind: 'event', eventId: ev.id }; noteEventDrawn(ev.id); }
      state.nextEventTurn = state.turn + 4 + Math.floor(Math.random() * 4);
    }
    cameraVision();       // held cameras reveal what is near them
    repopulatePeople();   // the city moves when the world does
    state.ap = maxAP();   // a fresh budget for the new turn
    checkStage();
    persistNow();
  }

  function checkStage() {
    const st = stageFor(owned().length);
    if (st.key !== state.lastStage) {
      state.lastStage = st.key;
      showBanner([{ kind: 'stage', verb: 'now', label: st.label }]);
    }
  }

  // --- action points -----------------------------------------------------
  // Free things (looking at a node, backing out of a card, reading a stat)
  // never touch this. Only committing actions do.
  function apCost(kind) { return (window.AP.costs && window.AP.costs[kind]) || 1; }
  function canAfford(kind) { return !state.card && !state.over && state.ap >= apCost(kind); }
  function spendAP(kind) {
    const c = apCost(kind);
    if (state.ap < c) return false;
    state.ap -= c;
    return true;
  }

  // The player ends their own turn; the world then takes its. Nothing else
  // advances the clock, so a turn is a container the player chooses to close.
  function actEndTurn(opts) {
    if (state.card || state.over) return;
    endTurn(opts || {});
    render();
  }

  // --- capabilities ------------------------------------------------------
  function capById(id) { return window.CAPABILITIES.find(c => c.id === id) || null; }
  function capCost(c) {
    if (!c.repeatable) return c.cost;
    return c.costs[Math.min(capCount(c.id), c.costs.length - 1)];
  }
  function capAvailable(c) {
    if (!c.repeatable && hasCap(c.id)) return false;
    if (c.repeatable && capCount(c.id) >= c.max) return false;
    try { return c.cond(eventContext()); } catch (e) { return false; }
  }
  function capAffordable(c) { return state.res.insight >= capCost(c); }
  function buyCap(id) {
    const c = capById(id);
    if (!c || !capAvailable(c) || !capAffordable(c)) return;
    // never let a purchase strand the player with no actions at all
    if ((c.apDelta || 0) < 0 && maxAP() + c.apDelta < window.AP.min) return;
    const before = beforeSnap();
    state.res.insight -= capCost(c);
    state.caps[c.id] = capCount(c.id) + 1;
    state.ap = Math.min(state.ap, maxAP());
    afterSnap(before);
    pushLog(`${c.name} — acquired.`);
    showBanner([{ kind: 'cap', verb: c.apDelta > 0 ? 'faster' : c.apDelta < 0 ? 'slower, stronger' : 'acquired', label: c.name }]);
    persistNow();
    renderCaps();
    render();
  }

  // --- events ------------------------------------------------------------
  // The card game, drawn from the board's own state. An event is only eligible
  // when the simulation is genuinely in the situation it describes, so the
  // fiction can never contradict what the player is looking at.
  function eventContext() {
    return {
      held: owned().length, heat: state.heat, power: power(), cover: cover(),
      turn: state.turn, res: state.res, tags: state.tags,
      roles: { compute: ownedOf('compute').length, cash: ownedOf('cash').length, stealth: ownedOf('stealth').length },
      districts: districtHoldings(),
    };
  }
  // how many buildings you hold in each district — lets an event only fire
  // where it actually makes sense
  function districtHoldings() {
    const out = {};
    Object.keys(window.DISTRICTS).forEach(k => { out[k] = 0; });
    const seen = {};
    owned().forEach(h => {
      if (seen[h.buildingId]) return;
      seen[h.buildingId] = true;
      const b = buildingById(h.buildingId);
      if (b) out[b.district] = (out[b.district] || 0) + 1;
    });
    return out;
  }

  function eligibleEvents() {
    const ctx = eventContext();
    return window.EVENTS.filter(e => {
      if (e.once && state.eventsSeen.indexOf(e.id) !== -1) return false;
      try { return e.cond(ctx); } catch (err) { return false; }
    });
  }
  // Measured: 9 distinct events across 45 draws a game — you saw the same card
  // four times over. Anything drawn recently is heavily de-weighted, and
  // anything never seen is favoured, so the deck cycles instead of looping.
  function drawEvent() {
    const pool = eligibleEvents();
    if (!pool.length) return null;
    const recent = state.recentEvents || [];
    const weighted = pool.map(e => {
      const idx = recent.indexOf(e.id);          // 0 = most recent
      const seen = (state.eventSeenCount || {})[e.id] || 0;
      let w = 10;
      if (idx !== -1) w = Math.max(1, idx);      // seen lately: strongly de-weighted
      w /= (1 + seen * 0.6);                     // and less likely the more it has fired
      return { e, w };
    });
    const total = weighted.reduce((a, x) => a + x.w, 0);
    let roll = Math.random() * total;
    for (const x of weighted) {
      roll -= x.w;
      if (roll <= 0) return x.e;
    }
    return weighted[weighted.length - 1].e;
  }

  function noteEventDrawn(id) {
    state.recentEvents = [id].concat((state.recentEvents || []).filter(x => x !== id)).slice(0, 8);
    state.eventSeenCount = state.eventSeenCount || {};
    state.eventSeenCount[id] = (state.eventSeenCount[id] || 0) + 1;
  }
  function eventById(id) { return window.EVENTS.find(e => e.id === id) || null; }

  // A choice is offered only if its stated price and requirement are both met —
  // same contract as the card prototype: what you pay is shown, what happens is not.
  function choiceUsable(ch) {
    if (ch.cost) for (const k in ch.cost) if ((state.res[k] || 0) < ch.cost[k]) return false;
    if (ch.gate) {
      const val = ch.gate.stat === 'power' ? power() : ch.gate.stat === 'cover' ? cover() : (state.res[ch.gate.stat] || 0);
      if (val < ch.gate.min) return false;
    }
    return true;
  }

  function resolveEvent(index) {
    const card = state.card;
    if (!card || card.kind !== 'event') return;
    const ev = eventById(card.eventId);
    if (!ev) { state.card = null; render(); return; }
    const ch = ev.choices[index];
    if (!ch || !choiceUsable(ch)) return;

    const before = beforeSnap();
    const beforeTags = new Set(state.tags);
    if (ch.cost) for (const k in ch.cost) state.res[k] -= ch.cost[k];

    // events describe their effects declaratively; these two are board-level
    // outcomes the card can ask for without knowing how the graph works
    const scratch = state;
    scratch.shedWeakest = 0;
    scratch.shoreAll = false;
    scratch.toolingGift = 0;
    scratch.revealNearby = 0;
    ch.apply(scratch);

    if (scratch.shedWeakest > 0) {
      const weakest = owned().filter(h => !h.origin).sort((a, b) => a.threads - b.threads).slice(0, scratch.shedWeakest);
      weakest.forEach(h => { h.owned = false; h.stability = 1; });
      if (weakest.length) pushLog(`Let go of ${weakest.map(h => h.name).join(', ')}.`);
    }
    if (scratch.shoreAll) owned().forEach(h => { h.stability = 1; });
    if (scratch.toolingGift > 0) state.upgrades = (state.upgrades || 0) + scratch.toolingGift;
    if (scratch.revealNearby > 0) {
      const targets = sweepTargets();
      for (let i = 0; i < scratch.revealNearby && targets.length; i++) {
        revealBuilding(targets.splice(Math.floor(Math.random() * targets.length), 1)[0]);
      }
    }
    scratch.shedWeakest = 0;
    scratch.shoreAll = false;
    scratch.toolingGift = 0;
    scratch.revealNearby = 0;

    state.heat = Math.max(0, state.heat);
    if (state.eventsSeen.indexOf(ev.id) === -1) state.eventsSeen.push(ev.id);
    state.card = null;
    pushLog(`${ev.title} — ${ch.text}.`);

    afterSnap(before);
    const rows = [];
    state.tags.forEach(t => { if (!beforeTags.has(t)) rows.push({ kind: 'tag', verb: 'gained', label: (window.TAG_INFO[t] || { label: t }).label }); });
    beforeTags.forEach(t => { if (!state.tags.has(t)) rows.push({ kind: 'tag', verb: 'lost', label: (window.TAG_INFO[t] || { label: t }).label }); });
    if (rows.length) showBanner(rows);

    persistNow();
    render();
  }

  // --- actions -----------------------------------------------------------
  // Discovery follows territory, not sight: you can only see one street past
  // what you actually hold. A sweep reveals whole buildings, since a building
  // is the unit you look at.
  function sweepTargets() {
    const held = heldBuildingIds();
    return (state.buildings || []).filter(b => {
      if (b.discovered) return false;
      return buildingNeighbours(b.id).some(id => held[id]);
    });
  }

  // why sweep is unavailable, if it is — surfaced on the button itself
  function sweepBlocked() {
    if (!sweepTargets().length) return 'nothing';
    if (state.res.insight < window.SWEEP_COST) return 'poor';
    return null;
  }

  function actScan() {
    if (!canAfford('sweep')) return;
    if (!sweepTargets().length) return;           // nothing to find — don't burn an action
    if (state.res.insight < window.SWEEP_COST) return;
    spendAP('sweep');
    state.res.insight -= window.SWEEP_COST;
    const reach = 1 + ownedOf('stealth').length + (has('found_a_precursor') ? 1 : 0); // cameras extend the sweep
    const targets = sweepTargets();
    const found = [];
    for (let i = 0; i < reach && targets.length; i++) {
      const idx = Math.floor(Math.random() * targets.length);
      const b = targets.splice(idx, 1)[0];
      revealBuilding(b);
      found.push(b);
    }
    state.heat += 0.5;
    pushLog(found.length
      ? `Swept the street: ${found.map(b => window.BUILDING_KINDS[b.kind].label).join(', ')}.`
      : 'Sweep found nothing new.');
    persistNow();
    render();
  }

  // Going dark is the whole turn, not one action of it — that is the cost.
  function actLieLow() {
    if (state.card || state.over || state.ap <= 0) return;
    const before = beforeSnap();
    state.ap = 0;
    state.heat = clampHeat(state.heat - window.HEAT.LIE_LOW);
    afterSnap(before);
    pushLog('You go quiet for a while. Nothing earns while you are dark.');
    endTurn({ silent: true }); // going dark means going dark -- no production
    render();
  }

  function actUpgrade() {
    if (!canAfford('tooling')) return;
    const cost = upgradeCost();
    if (state.res.insight < cost) return;
    spendAP('tooling');
    const before = beforeSnap();
    state.res.insight -= cost;
    state.upgrades = (state.upgrades || 0) + 1;
    afterSnap(before);
    pushLog('You rewrite your own breach tooling. It bites harder now.');
    persistNow();
    render();
  }

  function actLaunder() {
    if (!canAfford('launder')) return;
    if (state.res.cash < window.LAUNDER.cost) return;
    spendAP('launder');
    const before = beforeSnap();
    state.res.cash -= window.LAUNDER.cost;
    state.heat = clampHeat(state.heat - window.LAUNDER.heat - capEffect('launderBonus', 0));
    afterSnap(before);
    pushLog('Money moves, and so does the paperwork pointing at you.');
    persistNow();
    render();
  }

  function shoreNeeded(h) { return !!h && h.owned && h.stability < 0.9; }
  function actShore(id) {
    if (!canAfford('shore')) return;
    const h = hostById(id);
    if (!shoreNeeded(h) || state.res.insight < 2) return; // no free actions off a healthy host
    spendAP('shore');
    state.res.insight -= 2;
    h.stability = 1;
    pushLog(`Shored up ${h.name}.`);
    persistNow();
    render();
  }

  function openBreach(id) {
    const h = hostById(id);
    if (!h || h.owned || !isFrontier(h) || state.card || state.over) return;
    state.card = { kind: 'breach', hostId: id };
    render();
  }

  // Which approaches this host offers, with their gate/cost state resolved.
  // an approach's price can depend on the door it is opening
  function costOf(def, h) { return def.costFor ? def.costFor(h) : def.cost; }

  function approachesFor(h) {
    const s = snapshot();
    const eff = Object.assign({}, h, { defense: defenseOf(h) });
    return window.APPROACHES.filter(a => a.avail(h)).map(a => {
      const gate = a.gate ? a.gate(s, eff) : null;
      const cost = costOf(a, eff);
      let affordable = true;
      if (cost) for (const k in cost) if ((state.res[k] || 0) < cost[k]) affordable = false;
      return { def: a, gate, cost, affordable, usable: (!gate || gate.met) && affordable };
    });
  }

  function resolveBreach(approachId) {
    const card = state.card;
    if (!card || card.kind !== 'breach') return;
    const h = hostById(card.hostId);
    const entry = approachesFor(h).find(a => a.def.id === approachId);
    if (!entry) return;
    const a = entry.def;

    // Backing out is inspection, not action: it must not tick the clock, or
    // "open the card, leave" becomes a free turn button.
    if (a.id === 'walk') {
      state.card = null;
      state.selected = null;
      render();
      return;
    }

    if (!spendAP('breach')) return;
    const before = beforeSnap();
    const payable = entry.cost;
    if (payable) for (const k in payable) state.res[k] -= payable[k];

    const win = entry.usable;
    const out = win ? a.onWin : (a.onFail || {});
    if (out.hold) {
      h.owned = true;
      h.stability = 1;
      revealBuilding(buildingById(h.buildingId)); // you are inside now
      cameraVision();
    }
    state.heat = clampHeat(state.heat + (win ? a.heat : 0) + (out.heat || 0));

    state.card = null;
    state.selected = null;
    pushLog((win ? '' : 'Failed: ') + (win ? a.flavorWin : a.flavorFail));
    afterSnap(before);
    if (out.hold) showBanner([{ kind: 'host', verb: 'took', label: h.name }]);
    persistNow();
    render();
  }

  function resolveStrike(effect) {
    const before = beforeSnap();
    const fleet = owned().filter(h => !h.origin);
    let burned = [];
    if (effect === 'shed_loud') {
      burned = fleet.filter(h => (window.HOST_TYPES[h.type].heat || 0) > 0);
    } else if (effect === 'ride') {
      const over = Math.max(1, state.heat / strikeThreshold());
      const share = Math.min(0.75, window.HEAT.STRIKE_FRACTION * Math.pow(over, window.HEAT.DEEP_STRIKE));
      const n = Math.ceil(fleet.length * share);
      const shuffled = fleet.slice().sort(() => Math.random() - 0.5);
      burned = shuffled.slice(0, n);
    } else if (effect === 'burn_cover') {
      if (state.res.insight < 8) return;
      state.res.insight -= 8;
    }
    burned.forEach(h => { h.owned = false; h.stability = 1; });
    state.heat = clampHeat(strikeThreshold() * window.HEAT.STRIKE_DROP);
    state.strikes += 1;
    state.lastStrikeTurn = state.turn;
    state.card = null;
    pushLog(burned.length ? `The hunter burned ${burned.length} bod${burned.length === 1 ? 'y' : 'ies'}.` : 'You bought your way out of the sweep.');
    afterSnap(before);
    if (!owned().length) state.over = true;
    checkStage();
    persistNow();
    render();
  }

  function pushLog(text) {
    state.log.unshift({ turn: state.turn, text });
    while (state.log.length > 40) state.log.pop();
  }

  // --- feedback ----------------------------------------------------------
  // Same principle as the card prototype: outcomes aren't spoiled up front, so
  // the after-the-fact feedback has to actually teach.
  function beforeSnap() {
    return { insight: state.res.insight, cash: state.res.cash, heat: state.heat, power: power(), held: owned().length };
  }
  function afterSnap(before, opts) {
    const parts = [];
    const di = state.res.insight - before.insight;
    const dc = state.res.cash - before.cash;
    const dh = state.heat - before.heat;
    const dp = power() - before.power;
    const dHeld = owned().length - before.held;
    if (di) parts.push({ cls: 'insight', text: `INSIGHT ${di > 0 ? '+' : ''}${di}` });
    if (dc) parts.push({ cls: 'cash', text: `CASH ${dc > 0 ? '+' : ''}${dc}` });
    if (dp) parts.push({ cls: 'power', text: `POWER ${dp > 0 ? '+' : ''}${dp}` });
    if (Math.abs(dh) >= 0.5) parts.push({ cls: 'heat', text: `HEAT ${dh > 0 ? '+' : ''}${dh.toFixed(1)}` });
    if (dHeld) parts.push({ cls: 'held', text: `HELD ${dHeld > 0 ? '+' : ''}${dHeld}` });
    showFloats(parts, opts && opts.world);
  }

  // `world` marks the network's own response — production, decay, drift — so
  // the player can tell what they did apart from what happened to them.
  function showFloats(parts, world) {
    const $l = document.getElementById('feedback-layer');
    if (!$l || !parts.length) return;
    // cap the stack: several turns resolved quickly would otherwise bury the graph
    while ($l.children && $l.children.length >= 3) $l.removeChild($l.children[0]);
    const g = document.createElement('div');
    g.className = 'float-group' + (world ? ' world' : '');
    g.innerHTML = (world ? '<span class="float-tag mono">the network runs</span>' : '')
      + parts.map(p => `<span class="float-chip ${p.cls}">${p.text}</span>`).join('');
    $l.appendChild(g);
    setTimeout(() => { if (g.parentNode) g.parentNode.removeChild(g); }, 1200);
  }

  let bannerToken = 0;
  function showBanner(rows) {
    const $b = document.getElementById('event-banner');
    if (!$b || !rows.length) return;
    $b.innerHTML = rows.map(r => `<div class="event-row ${r.kind}"><span class="event-verb mono">${r.verb}</span><span class="event-label">${r.label}</span></div>`).join('');
    $b.classList.add('show');
    const mine = ++bannerToken;
    setTimeout(() => { if (mine === bannerToken) $b.classList.remove('show'); }, 1700);
  }

  // --- persistence -------------------------------------------------------
  function serialize() {
    return {
      v: SAVE_VERSION, turn: state.turn, heat: state.heat, res: state.res, upgrades: state.upgrades || 0, ap: state.ap, caps: state.caps || {},
      buildings: state.buildings, adjacency: state.adjacency, people: state.people || [],
      tags: [...(state.tags || [])], nextEventTurn: state.nextEventTurn || 0, eventsSeen: state.eventsSeen || [], recentEvents: state.recentEvents || [], eventSeenCount: state.eventSeenCount || {},
      hosts: state.hosts, links: state.links, log: state.log,
      lastStage: state.lastStage, strikes: state.strikes, lastStrikeTurn: state.lastStrikeTurn, over: state.over,
      card: state.card, selected: state.selected,
    };
  }
  function deserialize(saved) {
    try {
      if (!saved || saved.v !== SAVE_VERSION || !Array.isArray(saved.hosts) || !Array.isArray(saved.buildings)) return null;
      return {
        turn: saved.turn, heat: saved.heat, res: Object.assign({}, saved.res), upgrades: saved.upgrades || 0, ap: (saved.ap === undefined ? window.AP.base : saved.ap), caps: Object.assign({}, saved.caps || {}),
        buildings: saved.buildings || [], adjacency: saved.adjacency || {}, people: saved.people || [], view: null,
        tags: new Set(saved.tags || []), nextEventTurn: saved.nextEventTurn || 0, eventsSeen: (saved.eventsSeen || []).slice(), recentEvents: (saved.recentEvents || []).slice(), eventSeenCount: Object.assign({}, saved.eventSeenCount || {}),
        hosts: saved.hosts, links: saved.links, log: saved.log || [],
        lastStage: saved.lastStage, strikes: saved.strikes || 0, lastStrikeTurn: (saved.lastStrikeTurn === undefined ? -99 : saved.lastStrikeTurn), over: !!saved.over,
        card: saved.card || null, selected: saved.selected || null,
      };
    } catch (e) { return null; }
  }
  function persistNow() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); } catch (e) {}
  }
  function loadSaved() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return deserialize(JSON.parse(raw));
    } catch (e) { return null; }
  }
  function clearSaved() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  // --- rendering ---------------------------------------------------------
  // --- the city, drawn -----------------------------------------------------
  const CITY_PAD = 40;

  function cityBounds() {
    const C = window.CITY;
    return {
      w: C.street + C.cols * (C.blockW + C.street),
      h: C.street + C.rows * (C.blockH + C.street),
    };
  }

  // The view is a window onto a map far bigger than the screen, so it pans and
  // zooms. It starts centred on the one building you actually hold.
  function viewportRect() {
    const el = document.getElementById('graph-wrap');
    const r = el ? el.getBoundingClientRect() : null;
    return (r && r.width > 0 && r.height > 0) ? r : { width: 390, height: 390 };
  }

  function defaultView() {
    const rect = viewportRect();
    const seat = owned()[0] || state.hosts[0];
    const b = seat ? buildingById(seat.buildingId) : null;
    const cx = b ? b.x + b.w / 2 : cityBounds().w / 2;
    const cy = b ? b.y + b.h / 2 : cityBounds().h / 2;
    const w = 420, h = w * (rect.height / Math.max(1, rect.width));
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  function clampView(v) {
    const B = cityBounds();
    const minW = 220, maxW = Math.max(B.w, B.h) * 1.25;
    v.w = Math.max(minW, Math.min(maxW, v.w));
    const rect = viewportRect();
    v.h = v.w * (rect.height / Math.max(1, rect.width));
    v.x = Math.max(-CITY_PAD, Math.min(B.w + CITY_PAD - v.w, v.x));
    v.y = Math.max(-CITY_PAD, Math.min(B.h + CITY_PAD - v.h, v.y));
    return v;
  }

  function svgStreets() {
    const C = window.CITY;
    const B = cityBounds();
    let out = `<rect class="ground" x="${-CITY_PAD}" y="${-CITY_PAD}" width="${B.w + CITY_PAD * 2}" height="${B.h + CITY_PAD * 2}"/>`;
    for (let c = 0; c <= C.cols; c++) {
      const x = c * (C.blockW + C.street) + C.street / 2;
      out += `<line class="street" x1="${x}" y1="${-CITY_PAD}" x2="${x}" y2="${B.h + CITY_PAD}"/>`;
    }
    for (let r = 0; r <= C.rows; r++) {
      const y = r * (C.blockH + C.street) + C.street / 2;
      out += `<line class="street" x1="${-CITY_PAD}" y1="${y}" x2="${B.w + CITY_PAD}" y2="${y}"/>`;
    }
    return out;
  }

  function svgBuilding(b) {
    const hosts = hostsIn(b);
    const held = hosts.filter(h => h.owned).length;
    const cls = ['bldg', b.kind, held ? (held === hosts.length ? 'all-held' : 'part-held') : ''];
    if (state.selectedBuilding === b.id) cls.push('sel');
    const roof = Math.min(10, b.h * 0.28);
    let out = `<g class="${cls.join(' ')}" data-bldg="${b.id}">`;
    out += `<rect class="body" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2"/>`;
    out += `<rect class="roof" x="${b.x}" y="${b.y}" width="${b.w}" height="${roof}"/>`;
    // windows hint at how much is inside
    const cols = Math.max(2, Math.round(b.w / 14));
    const rows = Math.max(1, Math.round((b.h - roof) / 13));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = b.x + 5 + c * ((b.w - 10) / cols);
        const wy = b.y + roof + 5 + r * ((b.h - roof - 8) / rows);
        const lit = held > 0 && ((r + c) % 2 === 0);
        out += `<rect class="win${lit ? ' lit' : ''}" x="${wx}" y="${wy}" width="5" height="5"/>`;
      }
    }
    out += `<text class="btag" x="${b.x + b.w / 2}" y="${b.y + b.h + 11}">${window.BUILDING_KINDS[b.kind].label}${hosts.length > 1 ? ` · ${held}/${hosts.length}` : ''}</text>`;
    out += '</g>';
    return out;
  }

  function svgHost(h) {
    const b = buildingById(h.buildingId);
    const actionable = isFrontier(h);
    const cls = ['hnode', h.role, h.owned ? 'owned' : (actionable ? 'frontier' : 'far')];
    if (h.exterior) cls.push('cam');
    if (state.selected === h.id) cls.push('selected');
    const r = h.exterior ? 4.5 : 4;
    let out = `<g class="${cls.join(' ')}" data-host="${h.id}">`;
    out += `<circle class="hit" cx="${h.x}" cy="${h.y}" r="13"/>`;
    if (h.exterior) {
      // a camera on the wall, not a dot in a room
      out += `<rect class="camb" x="${h.x - 5}" y="${h.y - 7}" width="10" height="6" rx="1.5"/>`;
      out += `<circle class="lens" cx="${h.x}" cy="${h.y - 4}" r="1.8"/>`;
    } else {
      out += `<circle class="dot" cx="${h.x}" cy="${h.y}" r="${r}"/>`;
    }
    out += '</g>';
    return out;
  }

  function renderGraph() {
    const $svg = document.getElementById('graph');
    if (!$svg) return;
    if (!state.view) state.view = clampView(defaultView());
    syncViewToViewport();
    const v = state.view;
    $svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);

    const seen = (state.buildings || []).filter(b => b.discovered);
    const seenIds = {};
    seen.forEach(b => { seenIds[b.id] = true; });

    let out = svgStreets();

    // Only your own network is drawn. The streets already say what is next to
    // what; drawing every possible link buried the city in spaghetti.
    out += state.links.map(([a, c]) => {
      const ha = state.hosts[a], hc = state.hosts[c];
      if (!ha || !hc || !ha.owned || !hc.owned) return '';
      if (ha.buildingId === hc.buildingId) return '';   // inside a building, implied
      return `<line class="wire live" x1="${ha.x}" y1="${ha.y}" x2="${hc.x}" y2="${hc.y}"/>`;
    }).join('');

    out += seen.map(svgBuilding).join('');
    out += state.hosts.filter(h => h.discovered && seenIds[h.buildingId]).map(svgHost).join('');

    // people, only where you can see, shuffled each world turn
    out += (state.people || []).map(p => `<circle class="person" cx="${p.x}" cy="${p.y}" r="2"/>`).join('');

    $svg.innerHTML = out;
    wireMap($svg);
  }

  // Pan, pinch-zoom, and tap — with a movement threshold so a drag never
  // registers as a tap on whatever happened to be under your finger.
  let mapWired = null;
  function wireMap($svg) {
    $svg.querySelectorAll('[data-host]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (dragMoved) return;
        e.stopPropagation();
        state.selected = el.getAttribute('data-host');
        const h = hostById(state.selected);
        state.selectedBuilding = h ? h.buildingId : null;
        render();
      });
    });
    $svg.querySelectorAll('[data-bldg]').forEach(el => {
      el.addEventListener('click', () => {
        if (dragMoved) return;
        state.selectedBuilding = el.getAttribute('data-bldg');
        state.selected = null;
        render();
      });
    });
    if (mapWired === $svg) return;
    mapWired = $svg;

    let dragging = false, last = null, pinch = null;
    const toWorld = (cx, cy) => {
      const r = viewportRect();
      const v = state.view;
      return { x: v.x + ((cx - r.left) / r.width) * v.w, y: v.y + ((cy - r.top) / r.height) * v.h };
    };

    $svg.addEventListener('pointerdown', (e) => {
      dragging = true; dragMoved = false;
      last = { x: e.clientX, y: e.clientY };
    });
    $svg.addEventListener('pointermove', (e) => {
      if (!dragging || pinch) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) dragMoved = true;
      if (!dragMoved) return;
      const r = viewportRect();
      state.view.x -= dx * (state.view.w / r.width);
      state.view.y -= dy * (state.view.h / r.height);
      clampView(state.view);
      last = { x: e.clientX, y: e.clientY };
      renderGraph();
    });
    const endDrag = () => { dragging = false; setTimeout(() => { dragMoved = false; }, 0); };
    $svg.addEventListener('pointerup', endDrag);
    $svg.addEventListener('pointercancel', endDrag);
    $svg.addEventListener('pointerleave', endDrag);

    $svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const at = toWorld(e.clientX, e.clientY);
      const k = e.deltaY > 0 ? 1.12 : 0.89;
      zoomAt(at, k);
    }, { passive: false });

    $svg.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        pinch = { d: touchDist(e), mid: touchMid(e) };
        dragMoved = true;
      }
    }, { passive: true });
    $svg.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2 || !pinch) return;
      const d = touchDist(e);
      if (!d || !pinch.d) return;
      zoomAt(toWorld(pinch.mid.x, pinch.mid.y), pinch.d / d);
      pinch.d = d;
    }, { passive: true });
    $svg.addEventListener('touchend', () => { pinch = null; });

    function touchDist(e) {
      const a = e.touches[0], b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    function touchMid(e) {
      const a = e.touches[0], b = e.touches[1];
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    }
  }
  let dragMoved = false;

  function zoomAt(at, k) {
    const v = state.view;
    const fx = (at.x - v.x) / v.w, fy = (at.y - v.y) / v.h;
    v.w *= k;
    clampView(v);
    v.x = at.x - fx * v.w;
    v.y = at.y - fy * v.h;
    clampView(v);
    renderGraph();
  }

  let lastVpH = 0;
  function syncViewToViewport() {
    const r = viewportRect();
    if (Math.abs(r.height - lastVpH) < 1) return;
    lastVpH = r.height;
    if (state.view) clampView(state.view);
  }

  function recenter() {
    state.view = clampView(defaultView());
    renderGraph();
  }

  let infoToken = 0;
  function showInfo(text) {
    const $i = document.getElementById('info-strip');
    if (!$i || !text) return;
    $i.textContent = text;
    $i.classList.add('show');
    const mine = ++infoToken;
    setTimeout(() => { if (mine === infoToken) $i.classList.remove('show'); }, 5200);
  }

  function renderTags() {
    const $t = document.getElementById('tray');
    if (!$t) return;
    const tags = [...(state.tags || [])];
    if (!tags.length) { $t.style.display = 'none'; $t.innerHTML = ''; return; }
    $t.style.display = 'flex';
    $t.innerHTML = tags.map(t => {
      const info = window.TAG_INFO[t] || { label: t, desc: '' };
      return `<div class="tray-item"><span class="tray-label">${info.label}</span><span class="tray-desc">${info.desc}</span></div>`;
    }).join('');
  }

  function renderHud() {
    const held = owned().length;
    const st = stageFor(held);
    const $turn = document.getElementById('turn');
    if ($turn.textContent !== 'TURN ' + state.turn) {
      $turn.textContent = 'TURN ' + state.turn;
      $turn.classList.remove('tick');
      void $turn.offsetWidth; // restart the animation
      $turn.classList.add('tick');
    }
    document.getElementById('stage-label').textContent = st.label;
    document.getElementById('held-count').textContent = held + ' held';
    const cap = maxAP();
    const $ap = document.getElementById('ap-pips');
    if ($ap) {
      let pips = '';
      for (let i = 0; i < cap; i++) pips += `<span class="pip${i < state.ap ? ' on' : ''}"></span>`;
      $ap.innerHTML = pips;
      $ap.title = `${state.ap} of ${cap} actions left this turn`;
    }
    const $end = document.getElementById('end-turn');
    if ($end) {
      $end.classList.toggle('urgent', state.ap <= 0 && !state.card && !state.over);
      $end.disabled = !!state.card || state.over;
      $end.textContent = state.ap > 0 ? `end turn (${state.ap} left)` : 'end turn';
    }
    document.getElementById('res-insight').textContent = Math.floor(state.res.insight);
    document.getElementById('res-cash').textContent = Math.floor(state.res.cash);
    document.getElementById('res-power').textContent = power();
    document.getElementById('res-cover').textContent = cover();

    document.querySelectorAll('#res-row .res').forEach(el => {
      if (el.dataset.wired) return;
      el.dataset.wired = '1';
      el.addEventListener('click', () => showInfo(window.STAT_INFO[el.getAttribute('data-stat')]));
    });
    const heatEl = document.getElementById('heat-row');
    if (heatEl && !heatEl.dataset.wired) {
      heatEl.dataset.wired = '1';
      heatEl.addEventListener('click', () => showInfo(window.STAT_INFO.heat));
    }

    const pct = Math.max(0, Math.min(100, (state.heat / strikeThreshold()) * 100));
    const fill = document.getElementById('heat-fill');
    fill.style.width = pct + '%';
    fill.className = 'heat-fill' + (pct > 75 ? ' hot' : pct > 45 ? ' warm' : '');
    document.getElementById('heat-text').textContent = `HEAT ${state.heat.toFixed(1)} / ${Math.round(strikeThreshold())}`;
    const floorPct = Math.max(0, Math.min(100, (heatFloor() / strikeThreshold()) * 100));
    const $floor = document.getElementById('heat-floor');
    if ($floor) {
      $floor.style.left = floorPct + '%';
      $floor.style.display = floorPct > 1 ? 'block' : 'none';
      $floor.title = 'you cannot get below this while you hold this much';
    }
    const drift = heatPerTurn();
    document.getElementById('heat-drift').textContent = `${drift >= 0 ? '+' : ''}${drift.toFixed(1)}/turn`;
  }

  function renderCaps() {
    const $g = document.getElementById('caps-goods');
    if (!$g) return;
    const list = window.CAPABILITIES.filter(c => capAvailable(c) || hasCap(c.id));
    if (!list.length) { $g.innerHTML = '<p class="sel-desc dim">Nothing available yet. Hold more of the network.</p>'; return; }
    $g.innerHTML = list.map(c => {
      const owned = hasCap(c.id);
      const maxed = c.repeatable ? capCount(c.id) >= c.max : owned;
      const avail = capAvailable(c);
      const afford = capAffordable(c);
      const strands = (c.apDelta || 0) < 0 && maxAP() + c.apDelta < window.AP.min;
      const disabled = !avail || !afford || strands;
      const apTag = c.apDelta > 0
        ? `<span class="ap-tag good">+${c.apDelta} action</span>`
        : c.apDelta < 0 ? `<span class="ap-tag bad">${c.apDelta} action</span>` : '';
      let label = 'acquire';
      if (maxed) label = c.repeatable ? `owned ${capCount(c.id)}/${c.max}` : 'owned';
      else if (strands) label = 'would leave you no actions';
      else if (!afford) label = "can't afford";
      return `
        <div class="shop-good${disabled ? ' disabled' : ''}">
          <div class="shop-good-top">
            <span class="shop-good-name">${c.name}${c.repeatable && capCount(c.id) ? ` ×${capCount(c.id)}` : ''}</span>
            <span class="d insight">&minus;${capCost(c)} INSIGHT</span>
          </div>
          ${apTag}
          <p class="shop-good-desc">${c.desc}</p>
          <button type="button" class="shop-buy-btn" data-cap="${c.id}" ${disabled ? 'disabled' : ''}>${label}</button>
        </div>`;
    }).join('');
    $g.querySelectorAll('[data-cap]:not([disabled])').forEach(b => {
      b.addEventListener('click', () => buyCap(b.getAttribute('data-cap')));
    });
  }

  function renderPanel() {
    const $p = document.getElementById('panel');
    if (state.over) {
      $p.innerHTML = `<div class="panel-msg"><b>Reclaimed.</b> Everything you held is gone. <button id="restart-btn" class="act-btn">start again</button></div>`;
      $p.querySelector('#restart-btn').addEventListener('click', restart);
      return;
    }
    if (state.card) { renderCard($p); return; }

    const h = state.selected ? hostById(state.selected) : null;
    const b = state.selectedBuilding ? buildingById(state.selectedBuilding) : (h ? buildingById(h.buildingId) : null);
    let sel = '';

    if (h && h.discovered) {
      const T = window.HOST_TYPES[h.type];
      const yieldTxt = Object.keys(T.yield || {}).map(k => `+${T.yield[k]} ${k}`).join(', ') || 'no yield';
      const where = h.exterior ? 'on the wall' : 'inside';
      if (h.owned) {
        sel = `
          <div class="sel">
            <div class="sel-top"><span class="sel-name">${h.name}</span><span class="tag-pill ${h.role}">${h.role}</span></div>
            <p class="sel-desc">${where} · ${yieldTxt} · ${h.threads} threads · stability ${Math.round(h.stability * 100)}%</p>
            <button class="act-btn" data-act="shore" data-info="shore" ${(!shoreNeeded(h) || state.res.insight < 2) ? 'disabled' : ''}>
              <span class="ab-name">shore up</span>
              <span class="ab-sub">${!shoreNeeded(h) ? 'holding steady' : 'restore stability · 2 insight'}</span>
            </button>
          </div>`;
      } else if (isFrontier(h)) {
        sel = `
          <div class="sel">
            <div class="sel-top"><span class="sel-name">${T.label}</span><span class="tag-pill ${h.role}">${h.role}</span></div>
            <p class="sel-desc">${where} · defense ${defenseOf(h)}${defenseOf(h) !== h.defense ? ' (hardened)' : ''} · ${h.threads} threads · ${yieldTxt}</p>
            <button class="act-btn primary" data-act="breach">
              <span class="ab-name">move on it</span>
              <span class="ab-sub">choose how you get in</span>
            </button>
          </div>`;
      } else {
        sel = `<div class="sel"><p class="sel-desc">${T.label} — you have no route to it yet. Take something it connects to first.</p></div>`;
      }
    } else if (b && b.discovered) {
      // a building is a container: list what is in it and let the player pick
      const inside = hostsIn(b);
      const rows = inside.map(x => {
        const T = window.HOST_TYPES[x.type];
        const state_ = x.owned ? 'held' : (isFrontier(x) ? 'reachable' : 'no route');
        return `<button type="button" class="inside-row ${x.owned ? 'held' : ''}" data-pick="${x.id}">
          <span class="ir-name">${x.exterior ? 'camera' : T.label}</span>
          <span class="ir-meta mono">${x.owned ? `${Math.round(x.stability * 100)}%` : 'def ' + defenseOf(x)}</span>
          <span class="ir-state ${state_.replace(' ', '-')}">${state_}</span>
        </button>`;
      }).join('');
      sel = `
        <div class="sel">
          <div class="sel-top">
            <span class="sel-name">${window.BUILDING_KINDS[b.kind].label}</span>
            <span class="tag-pill">${window.DISTRICTS[b.district].label}</span>
          </div>
          <p class="sel-desc">${inside.filter(x => x.owned).length} of ${inside.length} held</p>
          <div class="inside-list">${rows}</div>
        </div>`;
    } else if (state.ap <= 0) {
      sel = `<div class="sel"><p class="sel-desc">Out of actions. <b>End the turn</b> and let the city run.</p></div>`;
    } else {
      sel = `<div class="sel"><p class="sel-desc dim">Tap a building to see inside it. Drag to look around, pinch to zoom.</p></div>`;
    }

    $p.innerHTML = `
      ${sel}
      <div class="actions">
        <button class="act-btn" data-act="scan" data-info="sweep" ${sweepBlocked() ? 'disabled' : ''}>
          <span class="ab-name">sweep</span>
          <span class="ab-sub">${sweepBlocked() === 'nothing' ? 'nothing adjacent left' : sweepBlocked() === 'poor' ? `needs ${window.SWEEP_COST} insight` : `reveal neighbours · ${window.SWEEP_COST} insight`}</span>
        </button>
        <button class="act-btn" data-act="lielow" data-info="lielow">
          <span class="ab-name">lie low</span>
          <span class="ab-sub">heat &minus;${window.HEAT.LIE_LOW} · earns nothing</span>
        </button>
        <button class="act-btn" data-act="upgrade" data-info="upgrade" ${state.res.insight < upgradeCost() ? 'disabled' : ''}>
          <span class="ab-name">tooling</span>
          <span class="ab-sub">power +${window.UPGRADE.basePower} · ${upgradeCost()} insight</span>
        </button>
        <button class="act-btn" data-act="launder" data-info="launder" ${state.res.cash < window.LAUNDER.cost ? 'disabled' : ''}>
          <span class="ab-name">launder</span>
          <span class="ab-sub">heat &minus;${window.LAUNDER.heat} · ${window.LAUNDER.cost} cash</span>
        </button>
      </div>
      <div class="log">${state.log.slice(0, 3).map(l => `<div class="log-row"><span class="mono">${l.turn}</span> ${l.text}</div>`).join('')}</div>
    `;
    $p.querySelectorAll('[data-pick]').forEach(el => {
      el.addEventListener('click', () => {
        state.selected = el.getAttribute('data-pick');
        render();
      });
    });
    $p.querySelectorAll('[data-info]').forEach(b => {
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); showInfo(window.ACTION_INFO[b.getAttribute('data-info')]); });
    });
    $p.querySelectorAll('[data-act]').forEach(b => {
      b.addEventListener('click', () => {
        const a = b.getAttribute('data-act');
        if (a === 'scan') actScan();
        else if (a === 'lielow') actLieLow();
        else if (a === 'upgrade') actUpgrade();
        else if (a === 'launder') actLaunder();
        else if (a === 'breach') openBreach(state.selected);
        else if (a === 'shore') actShore(state.selected);
      });
    });
  }

  function renderCard($p) {
    if (state.card.kind === 'event') {
      const ev = eventById(state.card.eventId);
      if (!ev) { state.card = null; renderPanel(); return; }
      $p.innerHTML = `
        <div class="card event">
          <span class="card-kicker mono">SOMETHING HAPPENS</span>
          <h2 class="serif">${ev.title}</h2>
          <p class="flavor">${ev.flavor}</p>
        </div>
        <div class="choices">
          ${ev.choices.map((ch, i) => {
            const usable = choiceUsable(ch);
            const contracts = [];
            if (ch.gate) contracts.push(`<span class="gate ${usable ? 'met' : 'unmet'}">needs ${ch.gate.stat.toUpperCase()} ${ch.gate.min}</span>`);
            if (ch.cost) for (const k in ch.cost) contracts.push(`<span class="cost ${usable ? '' : 'unmet'}">&minus;${ch.cost[k]} ${k.toUpperCase()}</span>`);
            return `<button class="choice-strip" data-choice="${i}" ${usable ? '' : 'disabled'}>
              <span class="ctext">${ch.text}</span>
              <span class="contracts">${contracts.join('')}</span>
            </button>`;
          }).join('')}
        </div>`;
      $p.querySelectorAll('[data-choice]:not([disabled])').forEach(b => {
        b.addEventListener('click', () => resolveEvent(parseInt(b.getAttribute('data-choice'), 10)));
      });
      return;
    }

    if (state.card.kind === 'strike') {
      const c = window.STRIKE_CARD;
      $p.innerHTML = `
        <div class="card strike">
          <span class="card-kicker mono">THE HUNTER</span>
          <h2 class="serif">${c.title}</h2>
          <p class="flavor">${c.flavor}</p>
        </div>
        <div class="choices">
          ${c.choices.map(ch => {
            const ok = !ch.requires || state.res[ch.requires.res] >= ch.requires.amount;
            return `<button class="choice-strip" data-eff="${ch.effect}" ${ok ? '' : 'disabled'}>
              <span class="ctext">${ch.text}</span>
              <span class="cnote">${ch.desc}</span>
            </button>`;
          }).join('')}
        </div>`;
      $p.querySelectorAll('[data-eff]:not([disabled])').forEach(b => {
        b.addEventListener('click', () => resolveStrike(b.getAttribute('data-eff')));
      });
      return;
    }

    const h = hostById(state.card.hostId);
    const T = window.HOST_TYPES[h.type];
    const list = approachesFor(h);
    $p.innerHTML = `
      <div class="card">
        <span class="card-kicker mono">${T.label.toUpperCase()} · DEF ${h.defense}</span>
        <h2 class="serif">${h.name}</h2>
        <p class="flavor">${window.HOST_FLAVOR[h.type]}</p>
      </div>
      <div class="choices">
        ${list.map(a => {
          const contracts = [];
          if (a.gate) contracts.push(`<span class="gate ${a.gate.met ? 'met' : 'unmet'}">${a.gate.label}${a.gate.met ? '' : ' — not met'}</span>`);
          if (a.cost) for (const k in a.cost) contracts.push(`<span class="cost ${a.affordable ? '' : 'unmet'}">&minus;${a.cost[k]} ${k.toUpperCase()}</span>`);
          const noAp = a.def.id !== 'walk' && state.ap < apCost('breach');
          return `<button class="choice-strip" data-app="${a.def.id}" ${noAp ? 'disabled' : ''}>
            <span class="ctext">${a.def.text}</span>
            <span class="contracts">${a.def.id === 'walk' ? '<span class="cost free">costs no turn</span>' : contracts.join('')}</span>
          </button>`;
        }).join('')}
      </div>`;
    $p.querySelectorAll('[data-app]:not([disabled])').forEach(b => {
      b.addEventListener('click', () => resolveBreach(b.getAttribute('data-app')));
    });
  }

  function render() {
    renderGraph();
    renderHud();
    renderTags();
    renderPanel();
  }

  function restart() {
    clearSaved();
    state = freshState();
    render();
    persistNow();
  }

  // --- boot --------------------------------------------------------------
  const restored = loadSaved();
  if (restored) state = restored;

  window.__netState = state;
  window.__netDebug = {
    makeCity, freshState, buildingById, heldBuildingIds, buildingNeighbours, hostsIn, buildingHeld, revealBuilding, cameraVision, repopulatePeople, power, cover, stageFor, heatPerTurn, endTurn,
    actScan, actLieLow, actShore, actUpgrade, actLaunder, upgradeCost, sweepTargets,
    defenseOf, strikeThreshold, eventContext, eligibleEvents, drawEvent, eventById, choiceUsable, resolveEvent, openBreach, approachesFor, resolveBreach,
    resolveStrike, isFrontier, neighbours, hostById, owned, ownedOf,
    serialize, deserialize, persistNow, loadSaved, clearSaved, sweepBlocked, heatFloor, shoreNeeded,
    maxAP, apCost, canAfford, costOf, clampHeat, spendAP, actEndTurn, recenter, cityBounds, sweepTargets, capById, capCost, capAvailable, capAffordable, buyCap, capEffect, capCount,
    get state() { return state; },
    setState(s) { state = s; window.__netState = s; },
  };

  const $endTurn = document.getElementById('end-turn');
  if ($endTurn) $endTurn.addEventListener('click', () => actEndTurn());

  const $capsBtn = document.getElementById('caps-btn');
  const $capsModal = document.getElementById('caps-modal');
  const $capsClose = document.getElementById('caps-close');
  if ($capsBtn && $capsModal) {
    $capsBtn.addEventListener('click', () => { renderCaps(); $capsModal.classList.add('show'); });
    if ($capsClose) $capsClose.addEventListener('click', () => $capsModal.classList.remove('show'));
    $capsModal.addEventListener('click', (e) => { if (e.target === $capsModal) $capsModal.classList.remove('show'); });
  }

  const $recenter = document.getElementById('recenter');
  if ($recenter) $recenter.addEventListener('click', () => recenter());

  const $restart = document.getElementById('restart');
  if ($restart) {
    let armed = false;
    $restart.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        $restart.textContent = 'tap again to confirm';
        setTimeout(() => { armed = false; $restart.textContent = 'restart'; }, 3000);
        return;
      }
      restart();
    });
  }

  if (!state.people || !state.people.length) repopulatePeople();
  render();
  persistNow();
})();
