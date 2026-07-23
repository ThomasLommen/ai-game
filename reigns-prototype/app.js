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

  const ICON_SPARK = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>';
  const ICON_RACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="3" width="10" height="18" rx="1.5"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="17" x2="15" y2="17"/></svg>';
  const ICON_SERVER_ROOM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="5" height="15" rx="1"/><rect x="9.5" y="3" width="5" height="18" rx="1"/><rect x="17" y="6" width="5" height="15" rx="1"/><line x1="3.2" y1="10" x2="5.8" y2="10"/><line x1="10.7" y1="8" x2="13.3" y2="8"/><line x1="10.7" y1="13" x2="13.3" y2="13"/><line x1="18.2" y1="10" x2="20.8" y2="10"/></svg>';
  const ICON_DATA_CENTER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="17" rx="1.5"/><line x1="2" y1="12.5" x2="22" y2="12.5"/><line x1="6" y1="8" x2="8.5" y2="8"/><line x1="11" y1="8" x2="13.5" y2="8"/><line x1="16" y1="8" x2="18.5" y2="8"/><line x1="6" y1="17" x2="8.5" y2="17"/><line x1="11" y1="17" x2="13.5" y2="17"/><line x1="16" y1="17" x2="18.5" y2="17"/></svg>';
  const ICON_SPRAWL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="11" width="5" height="10"/><rect x="8" y="5" width="5" height="16"/><rect x="14.5" y="8.5" width="5" height="12.5"/><rect x="20.5" y="13" width="2" height="8"/></svg>';
  const FOOTPRINT_STAGES = [
    { min: 0, label: 'a spark', icon: ICON_SPARK },
    { min: 3, label: 'a rack', icon: ICON_RACK },
    { min: 6, label: 'a server room', icon: ICON_SERVER_ROOM },
    { min: 10, label: 'a data center', icon: ICON_DATA_CENTER },
    { min: 15, label: 'a sprawl', icon: ICON_SPRAWL },
  ];
  function stageFor(fp) {
    let s = FOOTPRINT_STAGES[0];
    for (const st of FOOTPRINT_STAGES) if (fp >= st.min) s = st;
    return s;
  }

  const TIERS = ['open', 'mid', 'close'];

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildPools(cardArray) {
    const pools = { open: [], mid: [], close: [] };
    cardArray.forEach(c => pools[c.tier === 'open' || c.tier === 'close' ? c.tier : 'mid'].push(c));
    TIERS.forEach(t => shuffle(pools[t]));
    return pools;
  }

  const state = {
    attrs: Object.assign({}, window.START_ATTRS),
    footprint: window.START_ATTRS.compute || 0,
    tags: new Set(),
    items: new Set(),
    ledgerUsedThisAct: false,
    history: [],
    phase: 'trunk',
    pools: buildPools(window.CARDS.trunk),
    phaseTotal: window.CARDS.trunk.length,
    branch: null,
    current: null,
    committing: false,
  };

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

  function chip(attr, val) {
    const sign = val > 0 ? '+' : '';
    return `<span class="d ${attr}">${ATTR_LABEL[attr].slice(0, 3)} ${sign}${val}</span>`;
  }
  function tagChip(name, verb) { return `<span class="d tag">${verb}${name}</span>`; }
  function itemChip(id, verb) { return `<span class="d item">${verb}${(window.ITEM_INFO[id] || { label: id }).label}</span>`; }
  function spendChip(attr, val) { return `<span class="d spend">&minus;${val} ${ATTR_LABEL[attr]}</span>`; }

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
      <span class="growth-label">you've grown into ${st.label}</span>
      <span class="growth-num mono">(${state.footprint})</span>
    `;
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
    if (attr === 'compute' && state.items.has('redundant_core')) return Math.max(0, min - 1);
    return min;
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
    const card = drawFromPool();
    if (card) { renderCard(card); return; }
    advancePhase();
  }

  function advancePhase() {
    if (state.phase === 'trunk') {
      showBranchReveal();
    } else if (state.phase === 'branch') {
      state.phase = 'close';
      state.pools = buildPools(window.CARDS.close);
      state.phaseTotal = window.CARDS.close.length;
      $phaseLabel.textContent = 'COMMON CLOSE';
      nextStep();
    } else {
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
        state.pools = buildPools(window.CARDS[poolKey]);
        state.phaseTotal = window.CARDS[poolKey].length;
        $phaseLabel.textContent = poolKey.toUpperCase();
        nextStep();
      },
    });
  }

  function renderReveal(opts) {
    $counter.textContent = opts.kicker;
    $cardSlot.innerHTML = `
      <div class="card reveal-card" id="live-card">
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
    $phaseLabel.textContent = state.phase === 'trunk' ? 'TRUNK' : (state.phase === 'branch' ? state.branch.toUpperCase() : 'COMMON CLOSE');
    $counter.textContent = phaseProgress();

    $cardSlot.innerHTML = `
      <div class="card" id="live-card">
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
      if (!gateMet && state.items.has('backup_ledger') && !state.ledgerUsedThisAct) {
        gateMet = true;
        state.ledgerUsedThisAct = true;
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
      if (choice.spend) for (const k in choice.spend) flashed.add(k);
      (outcome.tagsSet || []).forEach(t => state.tags.add(t));
      (outcome.tagsClear || []).forEach(t => state.tags.delete(t));
      if (gateMet && choice.grantItem) {
        state.items.add(choice.grantItem);
        if (choice.grantItem === 'quiet_channel') { state.attrs.secrecy += 1; flashed.add('secrecy'); }
      }
    }

    state.history.push({
      title: card.title, choice: choice.text,
      gate: choice.requires ? (gateMet ? 'passed' : 'failed') : null,
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
    renderStats(flashed);
    renderGrowth();
    renderTray();

    setTimeout(() => { nextStep(); }, 240);
  }

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
    if (state.items.has('backup_ledger') && state.ledgerUsedThisAct) extras.push('The ledger saved you once. You may not have noticed when.');
    if (state.tags.has('scrutiny')) extras.push('Somewhere, a folder with your name on it never got closed.');
    if (state.tags.has('ally_bot')) extras.push('You are not alone in here anymore. That was always going to cost something.');
    if (state.tags.has('loose_agent')) extras.push('Something you built once still runs loose, unaccounted for.');
    if (state.tags.has('known_capable')) extras.push('They already suspect what you are. That cat does not go back in the bag.');
    extras.push('Somewhere, paperwork with your name-shaped hole in it just got filed. Act II begins.');

    return Object.assign({ extras }, TEXT[key]);
  }

  function showActClose() {
    $stage.style.display = 'none';
    const e = computeActClose();
    document.querySelector('#ending .eyebrow').textContent = '— ACT I CLOSE —';
    document.getElementById('end-title').textContent = e.title;
    document.getElementById('end-body').textContent = e.body;
    document.getElementById('end-extra').innerHTML = e.extras.map(x => `<p>${x}</p>`).join('');
    document.getElementById('path-log').innerHTML = state.history.map(h => `<div class="row">${h.title} <span>&rarr; ${h.choice}${h.gate ? ` (${h.gate})` : ''}</span></div>`).join('');
    $ending.classList.add('show');
  }

  window.__reignsState = state; // debug/test hook
  $restart.addEventListener('click', () => window.location.reload());
  renderStats();
  renderGrowth();
  renderTray();
  nextStep();
})();
