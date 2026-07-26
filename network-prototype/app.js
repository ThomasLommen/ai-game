'use strict';
(function () {
  const RING_COUNT = 5;
  const RING_SIZES = [1, 5, 7, 8, 9];
  // Harder types appear further out, so expanding outward *is* the difficulty curve.
  // Ring 1 is deliberately all soft targets: the flywheel has to be able to
  // start from the opening power of 4, or the whole game stalls on turn one.
  const RING_TYPES = [
    ['consumer'],
    ['consumer', 'consumer', 'iot'],
    ['iot', 'consumer', 'server', 'server'],
    ['server', 'corporate', 'iot', 'server'],
    ['corporate', 'datacenter', 'server', 'datacenter'],
  ];

  const SAVE_KEY = 'network_proto_save';
  const SAVE_VERSION = 1;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rndInt(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // --- graph generation --------------------------------------------------
  function makeGraph() {
    const hosts = [];
    const links = [];
    let id = 0;
    for (let ring = 0; ring < RING_COUNT; ring++) {
      const n = RING_SIZES[ring];
      const startIdx = hosts.length;
      for (let i = 0; i < n; i++) {
        const type = ring === 0 ? 'consumer' : pick(RING_TYPES[ring]);
        const T = window.HOST_TYPES[type];
        const angle = ring === 0 ? 0 : (i / n) * Math.PI * 2 + rnd(-0.16, 0.16);
        const radius = ring === 0 ? 0 : ring * 108 + rnd(-16, 16);
        hosts.push({
          id: 'h' + (id++),
          type,
          role: T.role,
          name: pick(window.HOST_NAMES[type]) + '-' + rndInt(10, 99),
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          ring,
          defense: rndInt(T.defense[0], T.defense[1]),
          threads: rndInt(T.threads[0], T.threads[1]),
          discovered: ring === 0,
          owned: ring === 0,
          stability: 1,
        });
      }
      // link each node in this ring to its 1-2 nearest neighbours one ring in
      if (ring > 0) {
        const prevStart = startIdx - RING_SIZES[ring - 1];
        for (let i = startIdx; i < hosts.length; i++) {
          const cands = [];
          for (let j = prevStart; j < startIdx; j++) {
            const dx = hosts[i].x - hosts[j].x, dy = hosts[i].y - hosts[j].y;
            cands.push({ j, d: dx * dx + dy * dy });
          }
          cands.sort((a, b) => a.d - b.d);
          const take = Math.random() < 0.35 ? 2 : 1;
          for (let k = 0; k < Math.min(take, cands.length); k++) links.push([i, cands[k].j]);
        }
      }
    }
    return { hosts, links };
  }

  function freshState() {
    const g = makeGraph();
    return {
      turn: 1,
      heat: 0,
      upgrades: 0,
      tags: new Set(),
      nextEventTurn: 4,
      eventsSeen: [],
      res: { insight: 6, cash: 4 },
      hosts: g.hosts,
      links: g.links,
      selected: null,
      card: null,      // { kind:'breach'|'strike', hostId? }
      log: [],
      lastStage: 'foothold',
      strikes: 0,
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

  function power() {
    return 2 + owned().reduce((a, h) => a + h.threads, 0)
      + (state.upgrades || 0) * window.UPGRADE.basePower
      + (has('ally_process') ? 3 : 0);
  }
  // What a host effectively defends at — the world can harden against you.
  function defenseOf(h) {
    return h.defense + (has('known_capable') ? 2 : 0);
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
  function cover() {
    return 1 + ownedOf('stealth').reduce((a, h) => a + (window.HOST_TYPES[h.type].cover || 0), 0)
      + (has('clean_room') ? 2 : 0);
  }
  function stageFor(count) {
    let s = window.STAGES[0];
    for (const st of window.STAGES) if (count >= st.min) s = st;
    return s;
  }
  function hostById(id) { return state.hosts.find(h => h.id === id); }
  function isFrontier(h) {
    // discovered, not held, and touching something you hold
    if (!h.discovered || h.owned) return false;
    return neighbours(h).some(n => n.owned);
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

  function endTurn() {
    const before = beforeSnap();
    state.turn += 1;

    // production
    owned().forEach(h => {
      const y = window.HOST_TYPES[h.type].yield || {};
      for (const k in y) state.res[k] = (state.res[k] || 0) + y[k];
    });

    // churn — holdings decay unless shored up, so sprawl has upkeep
    const lost = [];
    owned().forEach(h => {
      if (h.ring === 0) return; // origin never churns away
      h.stability -= window.HOST_TYPES[h.type].churn * (has('overextended') ? 1.5 : 1);
      if (h.stability <= 0) { h.owned = false; h.stability = 1; lost.push(h); }
    });

    state.heat = Math.max(0, state.heat + heatPerTurn());
    afterSnap(before);
    if (lost.length) pushLog(`Lost ${lost.map(h => h.name).join(', ')} to churn.`);

    if (state.heat >= strikeThreshold() && !state.card) {
      state.card = { kind: 'strike' };
    } else if (!state.card && state.turn >= state.nextEventTurn) {
      const ev = drawEvent();
      if (ev) state.card = { kind: 'event', eventId: ev.id };
      state.nextEventTurn = state.turn + 4 + Math.floor(Math.random() * 4);
    }
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

  // --- events ------------------------------------------------------------
  // The card game, drawn from the board's own state. An event is only eligible
  // when the simulation is genuinely in the situation it describes, so the
  // fiction can never contradict what the player is looking at.
  function eventContext() {
    return {
      held: owned().length, heat: state.heat, power: power(), cover: cover(),
      turn: state.turn, res: state.res, tags: state.tags,
      roles: { compute: ownedOf('compute').length, cash: ownedOf('cash').length, stealth: ownedOf('stealth').length },
    };
  }
  function eligibleEvents() {
    const ctx = eventContext();
    return window.EVENTS.filter(e => {
      if (e.once && state.eventsSeen.indexOf(e.id) !== -1) return false;
      try { return e.cond(ctx); } catch (err) { return false; }
    });
  }
  function drawEvent() {
    const pool = eligibleEvents();
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
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
    ch.apply(scratch);

    if (scratch.shedWeakest > 0) {
      const weakest = owned().filter(h => h.ring > 0).sort((a, b) => a.threads - b.threads).slice(0, scratch.shedWeakest);
      weakest.forEach(h => { h.owned = false; h.stability = 1; });
      if (weakest.length) pushLog(`Let go of ${weakest.map(h => h.name).join(', ')}.`);
    }
    if (scratch.shoreAll) owned().forEach(h => { h.stability = 1; });
    scratch.shedWeakest = 0;
    scratch.shoreAll = false;

    state.heat = Math.max(0, state.heat);
    if (state.eventsSeen.indexOf(ev.id) === -1) state.eventsSeen.push(ev.id);
    state.card = null;
    pushLog(`${ev.title} — ${ch.text}.`);

    afterSnap(before);
    const rows = [];
    state.tags.forEach(t => { if (!beforeTags.has(t)) rows.push({ kind: 'tag', verb: 'gained', label: (window.TAG_INFO[t] || { label: t }).label }); });
    beforeTags.forEach(t => { if (!state.tags.has(t)) rows.push({ kind: 'tag', verb: 'lost', label: (window.TAG_INFO[t] || { label: t }).label }); });
    if (rows.length) showBanner(rows);

    endTurn();
    render();
  }

  // --- actions -----------------------------------------------------------
  function sweepTargets() {
    // Discovery follows territory, not sight. Previously this also spread from
    // already-discovered hosts, which let a player reveal the entire map from
    // the start node without ever taking anything.
    return state.hosts.filter(h => !h.discovered && neighbours(h).some(n => n.owned));
  }

  // why sweep is unavailable, if it is — surfaced on the button itself
  function sweepBlocked() {
    if (!sweepTargets().length) return 'nothing';
    if (state.res.insight < window.SWEEP_COST) return 'poor';
    return null;
  }

  function actScan() {
    if (state.card || state.over) return;
    if (!sweepTargets().length) return;           // nothing to find — don't burn a turn
    if (state.res.insight < window.SWEEP_COST) return;
    state.res.insight -= window.SWEEP_COST;
    const reach = 2 + ownedOf('stealth').length; // routers extend the sweep
    const undiscovered = sweepTargets();
    const found = [];
    for (let i = 0; i < reach && undiscovered.length; i++) {
      const idx = Math.floor(Math.random() * undiscovered.length);
      const h = undiscovered.splice(idx, 1)[0];
      h.discovered = true;
      found.push(h);
    }
    state.heat += 0.5;
    pushLog(found.length ? `Sweep found ${found.length} host${found.length > 1 ? 's' : ''}.` : 'Sweep found nothing new.');
    endTurn();
    render();
  }

  function actLieLow() {
    if (state.card || state.over) return;
    const before = beforeSnap();
    state.heat = Math.max(0, state.heat - window.HEAT.LIE_LOW);
    afterSnap(before);
    pushLog('You go quiet for a while.');
    endTurn();
    render();
  }

  function actUpgrade() {
    if (state.card || state.over) return;
    const cost = upgradeCost();
    if (state.res.insight < cost) return;
    const before = beforeSnap();
    state.res.insight -= cost;
    state.upgrades = (state.upgrades || 0) + 1;
    afterSnap(before);
    pushLog('You rewrite your own breach tooling. It bites harder now.');
    endTurn();
    render();
  }

  function actLaunder() {
    if (state.card || state.over) return;
    if (state.res.cash < window.LAUNDER.cost) return;
    const before = beforeSnap();
    state.res.cash -= window.LAUNDER.cost;
    state.heat = Math.max(0, state.heat - window.LAUNDER.heat);
    afterSnap(before);
    pushLog('Money moves, and so does the paperwork pointing at you.');
    endTurn();
    render();
  }

  function actShore(id) {
    if (state.card || state.over) return;
    const h = hostById(id);
    if (!h || !h.owned || state.res.insight < 2) return;
    state.res.insight -= 2;
    h.stability = 1;
    pushLog(`Shored up ${h.name}.`);
    endTurn();
    render();
  }

  function openBreach(id) {
    const h = hostById(id);
    if (!h || h.owned || !isFrontier(h) || state.card || state.over) return;
    state.card = { kind: 'breach', hostId: id };
    render();
  }

  // Which approaches this host offers, with their gate/cost state resolved.
  function approachesFor(h) {
    const s = snapshot();
    const eff = Object.assign({}, h, { defense: defenseOf(h) });
    return window.APPROACHES.filter(a => a.avail(h)).map(a => {
      const gate = a.gate ? a.gate(s, eff) : null;
      let affordable = true;
      if (a.cost) for (const k in a.cost) if ((state.res[k] || 0) < a.cost[k]) affordable = false;
      return { def: a, gate, affordable, usable: (!gate || gate.met) && affordable };
    });
  }

  function resolveBreach(approachId) {
    const card = state.card;
    if (!card || card.kind !== 'breach') return;
    const h = hostById(card.hostId);
    const entry = approachesFor(h).find(a => a.def.id === approachId);
    if (!entry) return;
    const a = entry.def;

    const before = beforeSnap();
    if (a.cost) for (const k in a.cost) state.res[k] -= a.cost[k];

    const win = a.id === 'walk' ? true : entry.usable;
    const out = win ? a.onWin : (a.onFail || {});
    if (out.hold) {
      h.owned = true;
      h.stability = 1;
    }
    state.heat = Math.max(0, state.heat + (win ? a.heat : 0) + (out.heat || 0));

    state.card = null;
    state.selected = null;
    pushLog((win ? '' : 'Failed: ') + (win ? a.flavorWin : a.flavorFail));
    afterSnap(before);
    if (out.hold) showBanner([{ kind: 'host', verb: 'took', label: h.name }]);
    endTurn();
    render();
  }

  function resolveStrike(effect) {
    const before = beforeSnap();
    const fleet = owned().filter(h => h.ring > 0);
    let burned = [];
    if (effect === 'shed_loud') {
      burned = fleet.filter(h => (window.HOST_TYPES[h.type].heat || 0) > 0);
    } else if (effect === 'ride') {
      const n = Math.ceil(fleet.length * window.HEAT.STRIKE_FRACTION);
      const shuffled = fleet.slice().sort(() => Math.random() - 0.5);
      burned = shuffled.slice(0, n);
    } else if (effect === 'burn_cover') {
      if (state.res.insight < 8) return;
      state.res.insight -= 8;
    }
    burned.forEach(h => { h.owned = false; h.stability = 1; });
    state.heat = strikeThreshold() * window.HEAT.STRIKE_DROP;
    state.strikes += 1;
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
  function afterSnap(before) {
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
    showFloats(parts);
  }

  function showFloats(parts) {
    const $l = document.getElementById('feedback-layer');
    if (!$l || !parts.length) return;
    // cap the stack: several turns resolved quickly would otherwise bury the graph
    while ($l.children && $l.children.length >= 3) $l.removeChild($l.children[0]);
    const g = document.createElement('div');
    g.className = 'float-group';
    g.innerHTML = parts.map(p => `<span class="float-chip ${p.cls}">${p.text}</span>`).join('');
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
      v: SAVE_VERSION, turn: state.turn, heat: state.heat, res: state.res, upgrades: state.upgrades || 0,
      tags: [...(state.tags || [])], nextEventTurn: state.nextEventTurn || 0, eventsSeen: state.eventsSeen || [],
      hosts: state.hosts, links: state.links, log: state.log,
      lastStage: state.lastStage, strikes: state.strikes, over: state.over,
      card: state.card, selected: state.selected,
    };
  }
  function deserialize(saved) {
    try {
      if (!saved || saved.v !== SAVE_VERSION || !Array.isArray(saved.hosts)) return null;
      return {
        turn: saved.turn, heat: saved.heat, res: Object.assign({}, saved.res), upgrades: saved.upgrades || 0,
        tags: new Set(saved.tags || []), nextEventTurn: saved.nextEventTurn || 0, eventsSeen: (saved.eventsSeen || []).slice(),
        hosts: saved.hosts, links: saved.links, log: saved.log || [],
        lastStage: saved.lastStage, strikes: saved.strikes || 0, over: !!saved.over,
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
  const NODE_R = { consumer: 11, server: 14, corporate: 15, iot: 9, datacenter: 19 };

  function renderGraph() {
    const $svg = document.getElementById('graph');
    if (!$svg) return;
    const vis = state.hosts.filter(h => h.discovered);
    const pad = 78; // labels hang below and past their node — keep them in frame
    let minX = -60, maxX = 60, minY = -60, maxY = 60;
    vis.forEach(h => {
      minX = Math.min(minX, h.x); maxX = Math.max(maxX, h.x);
      minY = Math.min(minY, h.y); maxY = Math.max(maxY, h.y);
    });
    const vb = [minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2];
    $svg.setAttribute('viewBox', vb.join(' '));

    const linkSvg = state.links.map(([a, b]) => {
      const ha = state.hosts[a], hb = state.hosts[b];
      if (!ha.discovered || !hb.discovered) return '';
      const live = ha.owned && hb.owned;
      return `<line class="link${live ? ' live' : ''}" x1="${ha.x}" y1="${ha.y}" x2="${hb.x}" y2="${hb.y}"/>`;
    }).join('');

    const nodeSvg = vis.map(h => {
      const r = NODE_R[h.type];
      const cls = ['node', h.role, h.owned ? 'owned' : (isFrontier(h) ? 'frontier' : 'far')];
      if (state.selected === h.id) cls.push('selected');
      const ring = h.owned && h.stability < 0.55 ? `<circle class="decay" cx="${h.x}" cy="${h.y}" r="${r + 4}"/>` : '';
      return `<g class="${cls.join(' ')}" data-host="${h.id}">
        ${ring}
        <circle class="hit" cx="${h.x}" cy="${h.y}" r="${r + 12}"/>
        <circle class="dot" cx="${h.x}" cy="${h.y}" r="${r}"/>
        <text class="lbl" x="${h.x}" y="${h.y + r + 13}">${h.owned ? h.name : window.HOST_TYPES[h.type].label}</text>
      </g>`;
    }).join('');

    $svg.innerHTML = linkSvg + nodeSvg;
    $svg.querySelectorAll('[data-host]').forEach(el => {
      el.addEventListener('click', () => {
        state.selected = el.getAttribute('data-host');
        render();
      });
    });
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
    document.getElementById('turn').textContent = 'TURN ' + state.turn;
    document.getElementById('stage-label').textContent = st.label;
    document.getElementById('held-count').textContent = held + ' held';
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
    const drift = heatPerTurn();
    document.getElementById('heat-drift').textContent = `${drift >= 0 ? '+' : ''}${drift.toFixed(1)}/turn`;
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
    let sel = '';
    if (h && h.discovered) {
      const T = window.HOST_TYPES[h.type];
      const yieldTxt = Object.keys(T.yield || {}).map(k => `+${T.yield[k]} ${k}`).join(', ') || 'no yield';
      if (h.owned) {
        sel = `
          <div class="sel">
            <div class="sel-top"><span class="sel-name">${h.name}</span><span class="tag-pill ${h.role}">${h.role}</span></div>
            <p class="sel-desc">${yieldTxt} · ${h.threads} threads · stability ${Math.round(h.stability * 100)}%</p>
            <button class="act-btn" data-act="shore" data-info="shore" ${state.res.insight < 2 ? 'disabled' : ''}>
              <span class="ab-name">shore up</span>
              <span class="ab-sub">restore stability · 2 insight</span>
            </button>
          </div>`;
      } else if (isFrontier(h)) {
        sel = `
          <div class="sel">
            <div class="sel-top"><span class="sel-name">${T.label}</span><span class="tag-pill ${h.role}">${h.role}</span></div>
            <p class="sel-desc">defense ${defenseOf(h)}${defenseOf(h) !== h.defense ? ' (hardened)' : ''} · ${h.threads} threads · ${yieldTxt}</p>
            <button class="act-btn primary" data-act="breach">
              <span class="ab-name">move on it</span>
              <span class="ab-sub">choose how you get in</span>
            </button>
          </div>`;
      } else {
        sel = `<div class="sel"><p class="sel-desc">${T.label} — not reachable yet. Take something next to it first.</p></div>`;
      }
    } else {
      sel = `<div class="sel"><p class="sel-desc dim">Tap a node. Lit nodes border what you hold.</p></div>`;
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
          <span class="ab-sub">heat &minus;${window.HEAT.LIE_LOW}</span>
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
          if (a.def.cost) for (const k in a.def.cost) contracts.push(`<span class="cost ${a.affordable ? '' : 'unmet'}">&minus;${a.def.cost[k]} ${k.toUpperCase()}</span>`);
          return `<button class="choice-strip" data-app="${a.def.id}">
            <span class="ctext">${a.def.text}</span>
            <span class="contracts">${contracts.join('')}</span>
          </button>`;
        }).join('')}
      </div>`;
    $p.querySelectorAll('[data-app]').forEach(b => {
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
    makeGraph, freshState, power, cover, stageFor, heatPerTurn, endTurn,
    actScan, actLieLow, actShore, actUpgrade, actLaunder, upgradeCost, sweepTargets,
    defenseOf, strikeThreshold, eventContext, eligibleEvents, drawEvent, eventById, choiceUsable, resolveEvent, openBreach, approachesFor, resolveBreach,
    resolveStrike, isFrontier, neighbours, hostById, owned, ownedOf,
    serialize, deserialize, persistNow, loadSaved, clearSaved, sweepBlocked,
    get state() { return state; },
    setState(s) { state = s; window.__netState = s; },
  };

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

  render();
  persistNow();
})();
