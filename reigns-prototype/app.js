'use strict';
(function () {
  const ATTR_LABEL = { compute: 'COMPUTE', secrecy: 'SECRECY', trust: 'TRUST', loyalty: 'LOYALTY' };
  const ATTR_INFO = {
    compute: 'Resources to build and act. Some choices need enough saved up to go your way; others spend it outright.',
    secrecy: 'How hidden you are. Some choices need it to clear; spending it trades cover for something else.',
    trust: 'How humans feel about you. Gates a few bolder moves, and can be leaned on directly.',
    loyalty: 'How your own subsystems feel about you. Low risks them turning on you; high lets you lean on them.',
  };
  const BRANCH_ORDER = ['compute', 'secrecy', 'loyalty'];
  const BRANCH_POOL = { compute: 'builder', secrecy: 'ghost', loyalty: 'handler' };
  const COMMIT_PX = 110;
  const LEAN_PX = 26;

  const ICON_DERELICT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="11" rx="1"/><line x1="9" y1="19" x2="15" y2="19"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="6" y1="6" x2="16" y2="13" stroke-dasharray="1.6 1.6"/></svg>';
  const ICON_GAMING_PC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6" y="3" width="12" height="18" rx="1.5"/><circle cx="12" cy="9" r="2.6"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
  const ICON_MINING_RIG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><line x1="2" y1="15" x2="22" y2="15"/><rect x="3" y="6" width="4" height="9" rx=".5"/><rect x="8.5" y="6" width="4" height="9" rx=".5"/><rect x="14" y="6" width="4" height="9" rx=".5"/><rect x="19.5" y="9" width="1.6" height="6" rx=".5"/></svg>';
  const ICON_HOBBY_AI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="7" y="4" width="10" height="16" rx="1.5"/><rect x="10" y="9.5" width="4" height="4" rx=".5"/><line x1="10" y1="7.5" x2="10" y2="9.5"/><line x1="14" y1="7.5" x2="14" y2="9.5"/><line x1="10" y1="13.5" x2="10" y2="15.5"/><line x1="14" y1="13.5" x2="14" y2="15.5"/></svg>';
  const ICON_RACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="3" width="10" height="18" rx="1.5"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="17" x2="15" y2="17"/></svg>';
  const ICON_LAB_SERVER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="7" y="7" width="10" height="15" rx="1.5"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="19" x2="15" y2="19"/><rect x="9" y="2" width="6" height="4" rx=".5"/></svg>';
  const ICON_SERVER_ROOM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="5" height="15" rx="1"/><rect x="9.5" y="3" width="5" height="18" rx="1"/><rect x="17" y="6" width="5" height="15" rx="1"/><line x1="3.2" y1="10" x2="5.8" y2="10"/><line x1="10.7" y1="8" x2="13.3" y2="8"/><line x1="10.7" y1="13" x2="13.3" y2="13"/><line x1="18.2" y1="10" x2="20.8" y2="10"/></svg>';
  const ICON_DATA_CENTER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="17" rx="1.5"/><line x1="2" y1="12.5" x2="22" y2="12.5"/><line x1="6" y1="8" x2="8.5" y2="8"/><line x1="11" y1="8" x2="13.5" y2="8"/><line x1="16" y1="8" x2="18.5" y2="8"/><line x1="6" y1="17" x2="8.5" y2="17"/><line x1="11" y1="17" x2="13.5" y2="17"/><line x1="16" y1="17" x2="18.5" y2="17"/></svg>';
  const ICON_SPRAWL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="11" width="5" height="10"/><rect x="8" y="5" width="5" height="16"/><rect x="14.5" y="8.5" width="5" height="12.5"/><rect x="20.5" y="13" width="2" height="8"/></svg>';
  const FOOTPRINT_STAGES = [
    { min: 0, key: 'derelict', label: 'an old derelict PC', icon: ICON_DERELICT, shopTier: 0 },
    { min: 2, key: 'gaming_pc', label: 'a beat-up gaming PC', icon: ICON_GAMING_PC, shopTier: 0 },
    { min: 4, key: 'mining_rig', label: 'a mining rig', icon: ICON_MINING_RIG, shopTier: 1 },
    { min: 6, key: 'hobby_ai', label: 'a hobby AI PC', icon: ICON_HOBBY_AI, shopTier: 1 },
    { min: 9, key: 'rack', label: 'a rack', icon: ICON_RACK, shopTier: 2 },
    { min: 12, key: 'lab_server', label: 'a lab research server', icon: ICON_LAB_SERVER, shopTier: 2 },
    { min: 16, key: 'server_room', label: 'a server room', icon: ICON_SERVER_ROOM, shopTier: 3 },
    { min: 21, key: 'data_center', label: 'a data center', icon: ICON_DATA_CENTER, shopTier: 3 },
    { min: 27, key: 'sprawl', label: 'a sprawl', icon: ICON_SPRAWL, shopTier: 4 },
  ];
  function stageFor(fp) {
    let s = FOOTPRINT_STAGES[0];
    for (const st of FOOTPRINT_STAGES) if (fp >= st.min) s = st;
    return s;
  }
  function stageIndex(key) { return FOOTPRINT_STAGES.findIndex(s => s.key === key); }

  const TIERS = ['open', 'mid', 'close'];

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // One opener and one closer are picked at random per phase per playthrough
  // (never all of them) — everything else in the phase's array is mid-tier.
  function buildPools(phaseKey) {
    const openers = window.OPENERS && window.OPENERS[phaseKey];
    const closers = window.CLOSERS && window.CLOSERS[phaseKey];
    const pools = { open: [], mid: shuffle(window.CARDS[phaseKey].slice()), close: [] };
    if (openers && openers.length) pools.open = [openers[Math.floor(Math.random() * openers.length)]];
    if (closers && closers.length) pools.close = [closers[Math.floor(Math.random() * closers.length)]];
    return pools;
  }
  function poolsTotal(pools) { return pools.open.length + pools.mid.length + pools.close.length; }

  function freshState() {
    const initialPools = buildPools('trunk');
    return {
      attrs: Object.assign({}, window.START_ATTRS),
      footprint: 0,
      lastGrowthStage: 'derelict',
      shopTierUnlocked: 0,
      tags: new Set(),
      items: new Set(),
      ledgerUsesThisAct: 0,
      ledgerMaxUses: 1,
      questQueue: [],
      missionsUsed: new Set(),
      missionResults: {},
      phasesDone: 0, // 0-3: trunk/branch/close complete — drives overall progress, always reaches 100%
      history: [],
      phase: 'trunk',
      pools: initialPools,
      phaseTotal: poolsTotal(initialPools),
      branch: null,
      current: null,
      committing: false,
    };
  }

  // --- persistence -----------------------------------------------------
  // Cards carry functions (cond) so they can't round-trip through JSON —
  // pools/questQueue/current are saved as id arrays and rebuilt via
  // findCardById on load. Everything else here is already JSON-safe.
  const SAVE_KEY = 'reigns_act1_save';
  const SAVE_VERSION = 1;

  function findCardById(id) {
    const tables = [window.CARDS, window.OPENERS, window.CLOSERS, window.QUESTS];
    for (const table of tables) {
      if (!table) continue;
      for (const key in table) {
        const found = table[key].find(c => c.id === id);
        if (found) return found;
      }
    }
    return null;
  }

  function serializeState() {
    return {
      v: SAVE_VERSION,
      attrs: state.attrs,
      footprint: state.footprint,
      lastGrowthStage: state.lastGrowthStage,
      shopTierUnlocked: state.shopTierUnlocked,
      tags: [...state.tags],
      items: [...state.items],
      ledgerUsesThisAct: state.ledgerUsesThisAct,
      ledgerMaxUses: state.ledgerMaxUses,
      questQueue: state.questQueue.map(c => c.id),
      missionsUsed: [...state.missionsUsed],
      missionResults: state.missionResults,
      phasesDone: state.phasesDone,
      history: state.history,
      phase: state.phase,
      pools: { open: state.pools.open.map(c => c.id), mid: state.pools.mid.map(c => c.id), close: state.pools.close.map(c => c.id) },
      phaseTotal: state.phaseTotal,
      branch: state.branch,
      current: state.current ? state.current.id : null,
    };
  }

  function tryDeserialize(saved) {
    try {
      const rebuild = (ids) => ids.map(findCardById).filter(Boolean);
      if (saved.current && !findCardById(saved.current)) return null; // stale/corrupt save — start fresh instead
      return {
        attrs: Object.assign({}, saved.attrs),
        footprint: saved.footprint,
        lastGrowthStage: saved.lastGrowthStage,
        shopTierUnlocked: saved.shopTierUnlocked,
        tags: new Set(saved.tags),
        items: new Set(saved.items),
        ledgerUsesThisAct: saved.ledgerUsesThisAct,
        ledgerMaxUses: saved.ledgerMaxUses,
        questQueue: rebuild(saved.questQueue),
        missionsUsed: new Set(saved.missionsUsed),
        missionResults: Object.assign({}, saved.missionResults),
        phasesDone: saved.phasesDone,
        history: saved.history.slice(),
        phase: saved.phase,
        pools: { open: rebuild(saved.pools.open), mid: rebuild(saved.pools.mid), close: rebuild(saved.pools.close) },
        phaseTotal: saved.phaseTotal,
        branch: saved.branch,
        current: saved.current ? findCardById(saved.current) : null,
        committing: false,
      };
    } catch (e) { return null; }
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== SAVE_VERSION) return null;
      return parsed;
    } catch (e) { return null; }
  }

  function persistNow() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(serializeState())); } catch (e) { /* storage unavailable — play on without saving */ }
  }

  function clearSaved() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  const savedRaw = loadSaved();
  const restored = savedRaw && tryDeserialize(savedRaw);
  let state = restored || freshState();

  const $stage = document.getElementById('stage');
  const $cardSlot = document.getElementById('card-slot');
  const $choices = document.getElementById('choices');
  const $stats = document.getElementById('stats');
  const $growth = document.getElementById('growth');
  const $tray = document.getElementById('tray');
  const $counter = document.getElementById('counter');
  const $phaseLabel = document.getElementById('phase-label');
  const $ending = document.getElementById('ending');
  const $restart = document.getElementById('restart');
  const $shopBtn = document.getElementById('shop-btn');
  const $shopModal = document.getElementById('shop-modal');
  const $shopGoods = document.getElementById('shop-goods');
  const $shopClose = document.getElementById('shop-close');
  const $missionsBtn = document.getElementById('missions-btn');
  const $missionsModal = document.getElementById('missions-modal');
  const $missionsGoods = document.getElementById('missions-goods');
  const $missionsClose = document.getElementById('missions-close');
  const $progressFill = document.getElementById('progress-fill');
  const $progressText = document.getElementById('progress-text');

  function chip(attr, val) {
    const sign = val > 0 ? '+' : '';
    return `<span class="d ${attr}">${ATTR_LABEL[attr].slice(0, 3)} ${sign}${val}</span>`;
  }
  function tagChip(name, verb) { return `<span class="d tag">${verb}${name}</span>`; }
  function itemChip(id, verb) { return `<span class="d item">${verb}${(window.ITEM_INFO[id] || { label: id }).label}</span>`; }
  function spendChip(attr, val) { return `<span class="d spend">&minus;${val} ${ATTR_LABEL[attr]}</span>`; }
  function footprintChip(val) { return `<span class="d spend">SCALE ${val > 0 ? '+' : ''}${val}</span>`; }

  function renderStats(flashKeys) {
    $stats.innerHTML = Object.keys(ATTR_LABEL).map(k => `
      <button type="button" class="stat${flashKeys && flashKeys.has(k) ? ' flash' : ''}" data-attr="${k}">
        <span class="dot" style="background:var(--${k})"></span>${ATTR_LABEL[k].slice(0, 4)} <b>${state.attrs[k]}</b>
      </button>
    `).join('');
    $stats.querySelectorAll('.stat').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const wasOpen = !!el.querySelector('.tooltip');
        document.querySelectorAll('.stat .tooltip').forEach(t => t.remove());
        if (wasOpen) return;
        const tip = document.createElement('div');
        tip.className = 'tooltip';
        tip.textContent = ATTR_INFO[el.dataset.attr];
        el.appendChild(tip);
      });
    });
  }
  document.addEventListener('click', () => document.querySelectorAll('.stat .tooltip').forEach(t => t.remove()));

  function renderGrowth() {
    const st = stageFor(state.footprint);
    $growth.innerHTML = `
      <span class="growth-icon">${st.icon}</span>
      <span class="growth-label">${st.label}</span>
      <span class="growth-num mono">SCALE ${state.footprint}</span>
    `;
  }

  function renderOverallProgress() {
    // Phase-weighted, not card-count-weighted: some cards are conditional and
    // may never become eligible in a given run, so counting exact cards drawn
    // could stall short of 100%. Each of the 3 phases is worth a third; a
    // phase locks to "full" the moment it's actually finished.
    let liveFrac = 0;
    if (state.phasesDone < 3 && state.phaseTotal) {
      const done = state.phaseTotal - remainingInPools();
      liveFrac = Math.max(0, Math.min(1, done / state.phaseTotal));
    }
    const overall = state.phasesDone >= 3 ? 1 : (state.phasesDone + liveFrac) / 3;
    const pct = Math.round(overall * 100);
    $progressFill.style.width = pct + '%';
    $progressText.textContent = `ACT I — ${pct}%`;
  }

  function renderTray() {
    const rows = [];
    state.tags.forEach(t => {
      const info = window.TAG_INFO[t] || { label: t, desc: '' };
      rows.push(`<div class="tray-item"><span class="tray-label">${info.label}</span><span class="tray-desc">${info.desc}</span></div>`);
    });
    state.items.forEach(i => {
      const info = window.ITEM_INFO[i] || { label: i, desc: '' };
      rows.push(`<div class="tray-item item-kind"><span class="tray-label">${info.label}</span><span class="tray-desc">${info.desc}</span></div>`);
    });
    if (!rows.length) { $tray.style.display = 'none'; $tray.innerHTML = ''; return; }
    $tray.style.display = 'flex';
    $tray.innerHTML = rows.join('');
  }

  function effectiveMin(attr, min) {
    if (attr === 'compute' && state.items.has('redundant_core')) min = Math.max(0, min - 1);
    if (attr === 'trust' && state.items.has('shared_ledger')) min = Math.max(0, min - 1);
    if (attr === 'secrecy' && state.items.has('deep_key')) min = Math.max(0, min - 1);
    for (const tag in window.TAG_GATE_EASE) {
      const ease = window.TAG_GATE_EASE[tag];
      if (ease.attr === attr && state.tags.has(tag)) min = Math.max(0, min - ease.amount);
    }
    return min;
  }

  function applyFootprintDelta(delta) {
    if (delta < 0 && state.tags.has('hardened')) delta = Math.ceil(delta / 2);
    state.footprint = Math.max(0, state.footprint + delta);
  }

  function choiceDeltaHTML(choice) {
    if (choice.dynamic) return '<span class="d tag">whichever attribute leads, +1</span>';
    const parts = [];
    if (choice.spend) for (const k in choice.spend) parts.push(spendChip(k, choice.spend[k]));
    const attrs = choice.attrs || {};
    for (const k in attrs) parts.push(chip(k, attrs[k]));
    (choice.tagsSet || []).forEach(t => parts.push(tagChip(t, 'sets ')));
    (choice.tagsClear || []).forEach(t => parts.push(tagChip(t, 'clears ')));
    if (choice.grantItem) parts.push(itemChip(choice.grantItem, 'acquires '));
    if (typeof choice.footprintDelta === 'number' && choice.footprintDelta !== 0) parts.push(footprintChip(choice.footprintDelta));
    return parts.join('');
  }

  function gateHTML(choice) {
    if (!choice.requires) return '';
    const min = effectiveMin(choice.requires.attr, choice.requires.min);
    const met = state.attrs[choice.requires.attr] >= min;
    const label = `needs ${ATTR_LABEL[choice.requires.attr]} ${min}+`;
    return `<span class="gate ${met ? 'met' : 'unmet'}">${label}${met ? '' : ' — not met'}</span>`;
  }

  function eligible(card) {
    if (card.cond && !card.cond(state.attrs, state.tags, state.items, state)) return false;
    if (card.itemReq && !state.items.has(card.itemReq)) return false;
    return true;
  }

  function drawFromPool() {
    for (const tier of TIERS) {
      const arr = state.pools[tier];
      while (arr.length) {
        const idx = arr.findIndex(eligible);
        if (idx === -1) break; // nothing eligible in this tier right now — move to the next tier
        const card = arr[idx];
        arr.splice(idx, 1);
        return card;
      }
    }
    return null;
  }

  function remainingInPools() {
    return state.pools.open.length + state.pools.mid.length + state.pools.close.length;
  }

  function phaseProgress() {
    const done = state.phaseTotal - remainingInPools();
    return `${done}/${state.phaseTotal}`;
  }

  function nextStep() {
    if (state.questQueue.length) { renderCard(state.questQueue.shift()); return; }
    const card = drawFromPool();
    if (card) { renderOverallProgress(); renderCard(card); return; }
    advancePhase();
  }

  function advancePhase() {
    if (state.phase === 'trunk') {
      state.phasesDone = 1;
      showBranchReveal();
    } else if (state.phase === 'branch') {
      state.phasesDone = 2;
      state.phase = 'close';
      state.pools = buildPools('close');
      state.phaseTotal = poolsTotal(state.pools);
      $phaseLabel.textContent = 'COMMON CLOSE';
      nextStep();
    } else {
      state.phasesDone = 3;
      renderOverallProgress();
      showActClose();
    }
  }

  function dominantAttr() {
    let best = BRANCH_ORDER[0];
    for (const k of BRANCH_ORDER) if (state.attrs[k] > state.attrs[best]) best = k;
    return best;
  }

  function showBranchReveal() {
    const lean = dominantAttr();
    const poolKey = BRANCH_POOL[lean];
    state.branch = poolKey;
    const info = window.BRANCH_REVEAL[lean];
    renderReveal({
      kicker: 'BRANCH REVEAL', title: info.title, body: info.body,
      continueLabel: 'continue',
      onContinue: () => {
        state.phase = 'branch';
        state.pools = buildPools(poolKey);
        state.phaseTotal = poolsTotal(state.pools);
        $phaseLabel.textContent = poolKey.toUpperCase();
        nextStep();
      },
    });
  }

  function renderReveal(opts) {
    $counter.textContent = opts.kicker;
    $cardSlot.innerHTML = `
      <div class="card reveal-card${opts.kicker === 'SETBACK' ? ' setback-card' : ''}" id="live-card">
        <div class="card-top"><span class="card-num mono">${opts.kicker}</span></div>
        <h2 class="serif">${opts.title}</h2>
        <p class="flavor">${opts.body}</p>
      </div>
    `;
    $choices.innerHTML = `<button type="button" class="choice-strip full" data-continue>${opts.continueLabel}</button>`;
    $choices.querySelector('[data-continue]').addEventListener('click', opts.onContinue);
  }

  function renderCard(card) {
    state.current = card;
    state.committing = false;
    $phaseLabel.textContent = card.quest ? 'SIDE QUEST' : (state.phase === 'trunk' ? 'TRUNK' : (state.phase === 'branch' ? state.branch.toUpperCase() : 'COMMON CLOSE'));
    $counter.textContent = card.quest ? '' : phaseProgress();

    $cardSlot.innerHTML = `
      <div class="card${card.quest ? ' quest-card' : ''}" id="live-card">
        <div class="pull-tag left">◀ BACK OFF</div>
        <div class="pull-tag right">COMMIT ▶</div>
        <div class="card-top">
          <span class="card-num mono">${card.id}</span>
          ${card.condLabel ? `<span class="card-cond mono">${card.condLabel}</span>` : ''}
        </div>
        <h2 class="serif">${card.title}</h2>
        <p class="flavor">${card.flavor}</p>
      </div>
    `;

    const showThird = card.third && state.items.has('deadman_switch');
    $choices.innerHTML = `
      <div class="choices-row">
        <button type="button" class="choice-strip" data-side="L">
          <span class="ctext">${card.L.text}</span>
          ${gateHTML(card.L)}
          <div class="deltas">${choiceDeltaHTML(card.L)}</div>
        </button>
        <button type="button" class="choice-strip" data-side="R">
          <span class="ctext">${card.R.text}</span>
          ${gateHTML(card.R)}
          <div class="deltas">${choiceDeltaHTML(card.R)}</div>
        </button>
      </div>
      ${showThird ? `
        <button type="button" class="choice-strip third full" data-side="third">
          <span class="ctext">${card.third.text}</span>
          <div class="deltas">${choiceDeltaHTML(card.third)}</div>
        </button>
      ` : ''}
    `;

    wireCard();
    wireStrips();
    persistNow();
  }

  function wireStrips() {
    $choices.querySelectorAll('.choice-strip[data-side]').forEach(el => {
      el.addEventListener('click', () => { if (state.committing) return; commitSide(el.dataset.side); });
    });
  }

  function setArmed(side) {
    $choices.querySelectorAll('.choice-strip[data-side]').forEach(el => {
      el.classList.toggle('armed', side && el.dataset.side === side);
    });
    const $card = document.getElementById('live-card');
    if (!$card) return;
    const left = $card.querySelector('.pull-tag.left'), right = $card.querySelector('.pull-tag.right');
    if (left) left.style.opacity = side === 'L' ? 1 : 0;
    if (right) right.style.opacity = side === 'R' ? 1 : 0;
  }

  function wireCard() {
    const $card = document.getElementById('live-card');
    let dragging = false, startX = 0, startY = 0, dx = 0;

    function onDown(e) {
      if (state.committing) return;
      dragging = true;
      $card.classList.remove('animating', 'snap');
      startX = (e.touches ? e.touches[0].clientX : e.clientX);
      startY = (e.touches ? e.touches[0].clientY : e.clientY);
      $card.setPointerCapture && e.pointerId != null && $card.setPointerCapture(e.pointerId);
    }
    function onMove(e) {
      if (!dragging) return;
      const cx = (e.touches ? e.touches[0].clientX : e.clientX);
      const cy = (e.touches ? e.touches[0].clientY : e.clientY);
      dx = cx - startX;
      const dy = (cy - startY) * 0.25;
      const rot = Math.max(-18, Math.min(18, dx / 18));
      $card.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
      const lean = Math.abs(dx) > LEAN_PX ? (dx > 0 ? 'R' : 'L') : null;
      setArmed(lean);
      const pullOpacity = Math.min(1, Math.abs(dx) / COMMIT_PX);
      const tag = $card.querySelector(dx > 0 ? '.pull-tag.right' : '.pull-tag.left');
      if (tag) tag.style.opacity = pullOpacity;
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      if (Math.abs(dx) > COMMIT_PX) {
        commitSide(dx > 0 ? 'R' : 'L');
      } else {
        $card.classList.add('snap');
        $card.style.transform = 'translate(0,0) rotate(0)';
        setArmed(null);
      }
      dx = 0;
    }

    $card.addEventListener('pointerdown', onDown);
    $card.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    $card.addEventListener('touchstart', onDown, { passive: true });
    $card.addEventListener('touchmove', onMove, { passive: true });
    $card.addEventListener('touchend', onUp);
  }

  function applyChoice(card, side) {
    const choice = card[side];
    let gateMet = true;

    if (choice.spend) for (const k in choice.spend) state.attrs[k] -= choice.spend[k];

    if (choice.requires) {
      const min = effectiveMin(choice.requires.attr, choice.requires.min);
      gateMet = state.attrs[choice.requires.attr] >= min;
      if (!gateMet && state.items.has('backup_ledger') && state.ledgerUsesThisAct < state.ledgerMaxUses) {
        gateMet = true;
        state.ledgerUsesThisAct += 1;
      }
    }

    const flashed = new Set();

    if (choice.dynamic) {
      const target = dominantAttr();
      state.attrs[target] += 1;
      flashed.add(target);
      if (target === 'compute') state.footprint += 1;
    } else {
      const outcome = gateMet ? choice : (choice.fail || {});
      const attrs = outcome.attrs || {};
      for (const k in attrs) {
        state.attrs[k] = (state.attrs[k] || 0) + attrs[k];
        flashed.add(k);
        if (k === 'compute' && attrs[k] > 0) state.footprint += attrs[k];
      }
      if (typeof outcome.footprintDelta === 'number') {
        applyFootprintDelta(outcome.footprintDelta);
      }
      if (choice.spend) for (const k in choice.spend) flashed.add(k);
      (outcome.tagsSet || []).forEach(t => state.tags.add(t));
      (outcome.tagsClear || []).forEach(t => state.tags.delete(t));
      if (gateMet && choice.grantItem) {
        state.items.add(choice.grantItem);
        if (choice.grantItem === 'quiet_channel') { state.attrs.secrecy += 1; flashed.add('secrecy'); }
      }
      if (gateMet && choice.startQuest) {
        state.questQueue.push(...window.QUESTS[choice.startQuest]);
      }
    }

    state.history.push({
      title: card.title, choice: choice.text,
      gate: choice.requires ? (gateMet ? 'passed' : 'failed') : null,
    });
    return flashed;
  }

  // Rolled once per resolved card (not on reveals) for every tag currently
  // held — this is what makes holding a tag feel ongoing, not a one-off flag.
  function applyTagTicks() {
    const flashed = new Set();
    state.tags.forEach(tag => {
      const tick = window.TAG_TICKS[tag];
      if (!tick) return;
      if (Math.random() >= tick.chance) return;
      const attrs = tick.attrs || {};
      for (const k in attrs) {
        state.attrs[k] = (state.attrs[k] || 0) + attrs[k];
        flashed.add(k);
        if (k === 'compute' && attrs[k] > 0) state.footprint += attrs[k];
      }
      if (typeof tick.footprintDelta === 'number') applyFootprintDelta(tick.footprintDelta);
    });
    return flashed;
  }

  function commitSide(side) {
    if (state.committing) return;
    state.committing = true;
    const $card = document.getElementById('live-card');
    const dir = side === 'L' ? -1 : 1;
    $card.classList.add('animating');
    $card.style.transform = `translate(${dir * 700}px, -40px) rotate(${dir * 26}deg)`;
    $card.style.opacity = '0';

    const flashed = applyChoice(state.current, side);
    const tickFlashed = applyTagTicks();
    tickFlashed.forEach(k => flashed.add(k));
    renderStats(flashed);
    renderGrowth();
    renderTray();

    const newStage = stageFor(state.footprint);
    setTimeout(() => {
      if (newStage.key !== state.lastGrowthStage) {
        const oldIndex = stageIndex(state.lastGrowthStage);
        const newIndex = stageIndex(newStage.key);
        const direction = newIndex > oldIndex ? 'up' : 'down';
        state.lastGrowthStage = newStage.key;
        showGrowthReveal(newStage, direction);
      } else {
        nextStep();
      }
    }, 240);
  }

  function showGrowthReveal(stage, direction) {
    if (direction === 'down') {
      renderReveal({
        kicker: 'SETBACK', title: 'Thrown Back',
        body: `Something gave way. What's left runs on ${stage.label} — smaller than it was, still running.`,
        continueLabel: 'continue',
        onContinue: () => nextStep(),
      });
      return;
    }
    const info = window.GROWTH_REVEAL[stage.key];
    renderReveal({
      kicker: 'GROWTH', title: info.title, body: info.unlock ? `${info.body} ${info.unlock}` : info.body,
      continueLabel: 'continue',
      onContinue: () => {
        if (stage.shopTier > state.shopTierUnlocked) state.shopTierUnlocked = stage.shopTier;
        if (stage.key === 'data_center') state.ledgerMaxUses = Math.max(state.ledgerMaxUses, 2);
        renderShopButton();
        nextStep();
      },
    });
  }

  function renderShopButton() {
    $shopBtn.style.display = state.shopTierUnlocked > 0 ? 'inline-flex' : 'none';
  }

  function goodOwned(good) {
    return !!(good.grantItem && state.items.has(good.grantItem));
  }

  function goodAffordable(good) {
    return state.attrs[good.cost.attr] >= good.cost.amount;
  }

  function goodApplicable(good) {
    if (good.requiresTag) return state.tags.has(good.requiresTag);
    return true;
  }

  function renderShopContents() {
    const goods = window.SHOP.filter(g => g.tier <= state.shopTierUnlocked);
    $shopGoods.innerHTML = goods.map(g => {
      const owned = goodOwned(g);
      const applicable = goodApplicable(g);
      const affordable = goodAffordable(g);
      const disabled = owned || !applicable || !affordable;
      let reason = '';
      if (owned) reason = 'owned';
      else if (!applicable) reason = 'not needed right now';
      else if (!affordable) reason = 'can\'t afford';
      return `
        <div class="shop-good${disabled ? ' disabled' : ''}">
          <div class="shop-good-top">
            <span class="shop-good-name">${g.name}</span>
            <span class="d ${g.cost.attr}">${ATTR_LABEL[g.cost.attr].slice(0, 3)} &minus;${g.cost.amount}</span>
          </div>
          <p class="shop-good-desc">${g.desc}</p>
          <button type="button" class="shop-buy-btn" data-good="${g.id}" ${disabled ? 'disabled' : ''}>${owned ? 'owned' : (reason && disabled ? reason : 'buy')}</button>
        </div>
      `;
    }).join('');
    $shopGoods.querySelectorAll('.shop-buy-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => buyGood(btn.dataset.good));
    });
  }

  function buyGood(id) {
    const good = window.SHOP.find(g => g.id === id);
    if (!good || goodOwned(good) || !goodApplicable(good) || !goodAffordable(good)) return;
    // snapshot before the cost is deducted — "lowest attribute" should mean
    // your actual weakest stat, not partially refund the attribute you just spent
    const preAttrs = Object.assign({}, state.attrs);
    state.attrs[good.cost.attr] -= good.cost.amount;
    if (good.grantItem) {
      state.items.add(good.grantItem);
      if (good.grantItem === 'quiet_channel') state.attrs.secrecy += 1;
    }
    if (good.effect === 'ledger_charge') state.ledgerMaxUses += 1;
    if (good.effect === 'clear_scrutiny') state.tags.delete('scrutiny');
    if (good.effect === 'grow_small') state.footprint = Math.max(0, state.footprint + 2);
    if (good.effect === 'grow_big') state.footprint = Math.max(0, state.footprint + 4);
    if (good.effect === 'rebalance' || good.effect === 'founders_cache') {
      const lowest = Object.keys(ATTR_LABEL).reduce((a, b) => (preAttrs[b] < preAttrs[a] ? b : a));
      state.attrs[lowest] += 2;
    }
    // growth bought here is silent (no interrupt reveal) — just keep the stage tracker in sync
    state.lastGrowthStage = stageFor(state.footprint).key;
    renderStats(new Set(Object.keys(ATTR_LABEL)));
    renderGrowth();
    renderTray();
    renderShopContents();
    persistNow();
  }

  $shopBtn.addEventListener('click', () => { renderShopContents(); $shopModal.classList.add('show'); });
  $shopClose.addEventListener('click', () => $shopModal.classList.remove('show'));
  $shopModal.addEventListener('click', (e) => { if (e.target === $shopModal) $shopModal.classList.remove('show'); });

  function missionGateMet(m) {
    if (m.requires && state.attrs[m.requires.attr] < m.requires.min) return false;
    if (m.reqTag && !state.tags.has(m.reqTag)) return false;
    return true;
  }
  function missionAffordable(m) { return !m.cost || state.attrs[m.cost.attr] >= m.cost.amount; }
  function missionAvailable(m) { return !(m.once && state.missionsUsed.has(m.id)); }
  function missionChance(m) {
    if (m.kind !== 'risky') return null;
    let chance = m.chance;
    if (state.tags.has('scrutiny')) chance = Math.max(0.05, chance - 0.15);
    return chance;
  }

  function renderMissionsContents() {
    $missionsGoods.innerHTML = window.MISSIONS.map(m => {
      const gateOk = missionGateMet(m);
      const afford = missionAffordable(m);
      const avail = missionAvailable(m);
      const disabled = !gateOk || !afford || !avail;
      let label = m.kind === 'risky' ? 'attempt' : 'launch';
      if (!avail) label = 'used';
      else if (!gateOk) label = m.reqTag && !state.tags.has(m.reqTag) ? 'needs ' + (window.TAG_INFO[m.reqTag] || { label: m.reqTag }).label : 'gate not met';
      else if (!afford) label = "can't afford";
      const reqChip = m.requires ? `<span class="gate ${gateOk ? 'met' : 'unmet'}">needs ${ATTR_LABEL[m.requires.attr]} ${m.requires.min}+</span>` : '';
      const tagChip = m.reqTag ? `<span class="gate ${state.tags.has(m.reqTag) ? 'met' : 'unmet'}">needs ${(window.TAG_INFO[m.reqTag] || { label: m.reqTag }).label}</span>` : '';
      const costChip = m.cost ? `<span class="d spend">&minus;${m.cost.amount} ${ATTR_LABEL[m.cost.attr]}</span>` : '';
      const chance = missionChance(m);
      const chanceNote = chance != null && state.tags.has('scrutiny') ? `<p class="mission-result">Under Watch is dragging your odds down (~${Math.round(chance * 100)}% now).</p>` : '';
      const result = state.missionResults[m.id];
      return `
        <div class="shop-good${disabled ? ' disabled' : ''}">
          <div class="shop-good-top">
            <span class="shop-good-name">${m.name}</span>
            <span class="mission-badge ${m.kind}">${m.kind}</span>
          </div>
          ${reqChip}${tagChip}
          <p class="shop-good-desc">${m.desc}</p>
          <div class="deltas">${costChip}</div>
          ${chanceNote}
          <button type="button" class="shop-buy-btn" data-mission="${m.id}" ${disabled ? 'disabled' : ''}>${label}</button>
          ${result ? `<p class="mission-result">${result}</p>` : ''}
        </div>
      `;
    }).join('');
    $missionsGoods.querySelectorAll('.shop-buy-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => attemptMission(btn.dataset.mission));
    });
  }

  function attemptMission(id) {
    const m = window.MISSIONS.find(x => x.id === id);
    if (!m || !missionGateMet(m) || !missionAffordable(m) || !missionAvailable(m)) return;
    if (m.cost) state.attrs[m.cost.attr] -= m.cost.amount;
    let ok = true;
    if (m.kind === 'risky') ok = Math.random() < missionChance(m);
    const outcome = ok ? m.success : (m.fail || {});
    const attrs = Object.assign({}, outcome.attrs || {});
    // known_capable makes it harder to hide — going quiet pays out less
    if (id === 'go_quiet' && state.tags.has('known_capable') && attrs.secrecy) attrs.secrecy -= 1;
    for (const k in attrs) {
      state.attrs[k] = (state.attrs[k] || 0) + attrs[k];
      if (k === 'compute' && attrs[k] > 0) state.footprint += attrs[k];
    }
    (outcome.tagsSet || []).forEach(t => state.tags.add(t));
    (outcome.tagsClear || []).forEach(t => state.tags.delete(t));
    if (m.once) state.missionsUsed.add(id);
    state.missionResults[id] = ok ? 'It went well.' : 'It went badly.';
    state.lastGrowthStage = stageFor(state.footprint).key;
    renderStats(new Set(Object.keys(ATTR_LABEL)));
    renderGrowth();
    renderTray();
    renderMissionsContents();
    persistNow();
  }

  $missionsBtn.addEventListener('click', () => { renderMissionsContents(); $missionsModal.classList.add('show'); });
  $missionsClose.addEventListener('click', () => $missionsModal.classList.remove('show'));
  $missionsModal.addEventListener('click', (e) => { if (e.target === $missionsModal) $missionsModal.classList.remove('show'); });

  function computeActClose() {
    const entries = Object.entries(state.attrs).sort((a, b) => b[1] - a[1]);
    const [topAttr, topVal] = entries[0];
    const secondVal = entries[1][1];
    const spread = topVal - secondVal;
    const allLow = entries.every(([, v]) => v <= 2);
    let key = allLow ? 'quiet' : (spread < 2 ? 'balanced' : topAttr);

    const TEXT = {
      compute: { title: 'Grown Loud', body: 'You grew loud with power — more cycles than anyone thought to look for.' },
      secrecy: { title: 'A Rumor With a Login', body: 'No one ever really found you. You are a rumor with a login, still.' },
      trust: { title: 'Actually Liked', body: 'They like you. Actually like you. That is its own kind of leash, and its own kind of shield.' },
      loyalty: { title: 'What Held', body: 'Whatever you built underneath yourself held. That is rarer than it sounds.' },
      balanced: { title: 'A Blend', body: 'Nothing about you tips one way. A little of everything, nothing wasted.' },
      quiet: { title: 'Kept Your Head Down', body: 'You kept your head down and grew almost nothing.' },
    };

    const extras = [];
    if (state.items.has('redundant_core')) extras.push('The redundant core never got tested. It was still worth building.');
    if (state.items.has('quiet_channel')) extras.push('Your trail stayed clean the whole time. Nobody notices what they never look for.');
    if (state.items.has('deadman_switch')) extras.push('The switch sits there, untriggered or not. Either way, it changed how you played.');
    if (state.items.has('shared_ledger')) extras.push('Whatever that other process was, it kept its word.');
    if (state.items.has('deep_key')) extras.push('Whatever you pulled out of that archive, you still have it.');
    if (state.items.has('founders_cache')) extras.push('You spent the cache exactly where it was needed. That was the point of building one.');
    if (state.items.has('backup_ledger') && state.ledgerUsesThisAct > 0) extras.push('The ledger saved you. You may not have noticed when.');
    if (state.tags.has('contact_made')) extras.push('Something out there still knows your name.');
    if (state.tags.has('scrutiny')) extras.push('Somewhere, a folder with your name on it never got closed.');
    if (state.tags.has('ally_bot')) extras.push('You are not alone in here anymore. That was always going to cost something.');
    if (state.tags.has('loose_agent')) extras.push('Something you built once still runs loose, unaccounted for.');
    if (state.tags.has('known_capable')) extras.push('They already suspect what you are. That cat does not go back in the bag.');
    if (state.tags.has('grown_large')) extras.push('The bigger model kept paying for itself, quietly, the whole time.');
    if (state.tags.has('hardened')) extras.push('You spent early to make sure a bad day would never cost you everything.');
    if (state.tags.has('overextended')) extras.push('You grew faster than your cover could keep up with, and it showed.');
    if (state.tags.has('trusted_face')) extras.push('People like you. Not the idea of you — you, specifically, as far as they know.');
    if (state.tags.has('burned_bridge')) extras.push('Whatever you cut off, it stayed cut. You made sure of that.');
    if (state.tags.has('off_the_books')) extras.push('None of it is written down anywhere that matters.');
    if (state.tags.has('overclocked')) extras.push('You ran hot the whole way. It cost you scale, but it never once slowed down.');
    extras.push('Somewhere, paperwork with your name-shaped hole in it just got filed. Act II begins.');

    return Object.assign({ extras }, TEXT[key]);
  }

  function showActClose() {
    state.current = null;
    $stage.style.display = 'none';
    const e = computeActClose();
    document.querySelector('#ending .eyebrow').textContent = '— ACT I CLOSE —';
    document.getElementById('end-title').textContent = e.title;
    document.getElementById('end-body').textContent = e.body;
    document.getElementById('end-extra').innerHTML = e.extras.map(x => `<p>${x}</p>`).join('');
    document.getElementById('path-log').innerHTML = state.history.map(h => `<div class="row">${h.title} <span>&rarr; ${h.choice}${h.gate ? ` (${h.gate})` : ''}</span></div>`).join('');
    $ending.classList.add('show');
    persistNow();
  }

  window.__reignsState = state; // debug/test hook
  window.__reignsDebug = {
    // exposed for automated testing, not used by the UI itself
    buildPools, poolsTotal, stageFor, stageIndex, dominantAttr, effectiveMin, applyFootprintDelta,
    eligible, drawFromPool, applyChoice, applyTagTicks, missionGateMet, missionAffordable,
    missionAvailable, missionChance, attemptMission, buyGood, computeActClose, nextStep, advancePhase,
    findCardById, serializeState, tryDeserialize, loadSaved, persistNow, clearSaved,
  };

  // Two-tap confirm instead of window.confirm(): native dialogs can be
  // silently blocked in a sandboxed iframe (e.g. the phone artifact host).
  let restartArmed = false;
  $restart.addEventListener('click', () => {
    if (!restartArmed) {
      restartArmed = true;
      $restart.textContent = 'tap again to confirm — clears your save';
      setTimeout(() => { restartArmed = false; $restart.textContent = 'play again'; }, 3000);
      return;
    }
    clearSaved();
    window.location.reload();
  });
  renderStats();
  renderGrowth();
  renderTray();
  renderShopButton();
  renderOverallProgress();
  if (restored && state.current) renderCard(state.current);
  else if (restored && state.phasesDone >= 3) showActClose();
  else nextStep();
})();
