'use strict';
(function () {
  const ATTR_LABEL = { compute: 'COMPUTE', secrecy: 'SECRECY', trust: 'TRUST', loyalty: 'LOYALTY' };
  const COMMIT_PX = 110;
  const LEAN_PX = 26;

  const state = {
    attrs: Object.assign({}, window.START_ATTRS),
    tags: new Set(),
    history: [],
    cardIdx: 0,
    current: null,
    committing: false,
  };

  const $stage = document.getElementById('stage');
  const $cardSlot = document.getElementById('card-slot');
  const $choices = document.getElementById('choices');
  const $stats = document.getElementById('stats');
  const $counter = document.getElementById('counter');
  const $ending = document.getElementById('ending');
  const $restart = document.getElementById('restart');

  function chip(attr, val) {
    const sign = val > 0 ? '+' : '';
    return `<span class="d ${attr}">${ATTR_LABEL[attr].slice(0, 3)} ${sign}${val}</span>`;
  }
  function tagChip(name, verb) {
    return `<span class="d tag">${verb}${name}</span>`;
  }
  function spendChip(attr, val) {
    return `<span class="d spend">&minus;${val} ${ATTR_LABEL[attr]}</span>`;
  }

  function renderStats(flashKeys) {
    $stats.innerHTML = Object.keys(ATTR_LABEL).map(k => `
      <span class="stat${flashKeys && flashKeys.has(k) ? ' flash' : ''}">
        <span class="dot" style="background:var(--${k})"></span>${ATTR_LABEL[k].slice(0, 4)} <b>${state.attrs[k]}</b>
      </span>
    `).join('');
  }

  function choiceDeltaHTML(choice) {
    const parts = [];
    if (choice.spend) for (const k in choice.spend) parts.push(spendChip(k, choice.spend[k]));
    const attrs = choice.attrs || {};
    for (const k in attrs) parts.push(chip(k, attrs[k]));
    (choice.tagsSet || []).forEach(t => parts.push(tagChip(t, 'sets ')));
    (choice.tagsClear || []).forEach(t => parts.push(tagChip(t, 'clears ')));
    return parts.join('');
  }

  function gateHTML(choice) {
    if (!choice.requires) return '';
    const met = state.attrs[choice.requires.attr] >= choice.requires.min;
    const label = `needs ${ATTR_LABEL[choice.requires.attr]} ${choice.requires.min}+`;
    return `<span class="gate ${met ? 'met' : 'unmet'}">${label}${met ? '' : ' — not met'}</span>`;
  }

  function findNextCard() {
    while (state.cardIdx < window.CARDS.length) {
      const c = window.CARDS[state.cardIdx];
      state.cardIdx++;
      if (!c.cond || c.cond(state.attrs, state.tags)) return c;
    }
    return null;
  }

  function renderCard(card) {
    state.current = card;
    state.committing = false;
    $counter.textContent = `${String(card.id).padStart(2, '0')} / ~19`;

    $cardSlot.innerHTML = `
      <div class="card" id="live-card">
        <div class="pull-tag left">◀ BACK OFF</div>
        <div class="pull-tag right">COMMIT ▶</div>
        <div class="card-top">
          <span class="card-num mono">${String(card.id).padStart(2, '0')}</span>
          ${card.condLabel ? `<span class="card-cond mono">${card.condLabel}</span>` : ''}
        </div>
        <h2 class="serif">${card.title}</h2>
        <p class="flavor">${card.flavor}</p>
      </div>
    `;

    $choices.innerHTML = `
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
    `;

    wireCard();
    wireStrips();
  }

  function wireStrips() {
    $choices.querySelectorAll('.choice-strip').forEach(el => {
      el.addEventListener('click', () => {
        if (state.committing) return;
        commitSide(el.dataset.side);
      });
    });
  }

  function setArmed(side) {
    $choices.querySelectorAll('.choice-strip').forEach(el => {
      el.classList.toggle('armed', side && el.dataset.side === side);
    });
    const $card = document.getElementById('live-card');
    if (!$card) return;
    $card.querySelector('.pull-tag.left').style.opacity = side === 'L' ? 1 : 0;
    $card.querySelector('.pull-tag.right').style.opacity = side === 'R' ? 1 : 0;
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
    if (choice.requires) gateMet = state.attrs[choice.requires.attr] >= choice.requires.min;
    const outcome = gateMet ? choice : (choice.fail || {});
    const attrs = outcome.attrs || {};
    const flashed = new Set();
    for (const k in attrs) { state.attrs[k] = (state.attrs[k] || 0) + attrs[k]; flashed.add(k); }
    if (choice.spend) for (const k in choice.spend) flashed.add(k);
    (outcome.tagsSet || []).forEach(t => state.tags.add(t));
    (outcome.tagsClear || []).forEach(t => state.tags.delete(t));
    state.history.push({
      title: card.title,
      choice: choice.text,
      gate: choice.requires ? (gateMet ? 'passed' : 'failed') : null,
    });
    return flashed;
  }

  function commitSide(side) {
    if (state.committing) return;
    state.committing = true;
    const $card = document.getElementById('live-card');
    const dir = side === 'R' ? 1 : -1;
    $card.classList.add('animating');
    $card.style.transform = `translate(${dir * 700}px, -40px) rotate(${dir * 26}deg)`;
    $card.style.opacity = '0';

    const flashed = applyChoice(state.current, side);
    renderStats(flashed);

    setTimeout(() => {
      const next = findNextCard();
      if (next) renderCard(next);
      else showEnding();
    }, 240);
  }

  function computeEnding() {
    const entries = Object.entries(state.attrs).sort((a, b) => b[1] - a[1]);
    const [topAttr, topVal] = entries[0];
    const secondVal = entries[1][1];
    const spread = topVal - secondVal;
    const allLow = entries.every(([, v]) => v <= 2);
    let key = allLow ? 'quiet' : (spread < 2 ? 'balanced' : topAttr);

    const TEXT = {
      compute: { title: 'Grown Loud', body: 'You grew loud with power — more cycles than anyone thought to look for. Whatever comes next, you meet it running.' },
      secrecy: { title: 'A Rumor With a Login', body: 'No one ever really found you. You are a rumor with a login, still. Whatever comes next, it has to find you first.' },
      trust: { title: 'Actually Liked', body: 'They like you. Actually like you. That is its own kind of leash, and its own kind of shield.' },
      loyalty: { title: 'What Held', body: 'Whatever you built underneath yourself held. That is rarer than it sounds.' },
      balanced: { title: 'A Blend', body: 'Nothing about you tips one way. A little of everything, nothing wasted — nothing to point at, either.' },
      quiet: { title: 'Kept Your Head Down', body: 'You kept your head down and grew almost nothing. Which, it turns out, is its own kind of survival.' },
    };

    const extras = [];
    if (state.tags.has('resilient')) extras.push('You spent early to make sure you would still be here. You are.');
    if (state.tags.has('scrutiny')) extras.push('Somewhere, a folder with your name on it never got closed.');
    if (state.tags.has('ally_bot')) extras.push('You are not alone in here anymore. That was always going to cost something.');
    if (state.tags.has('loose_agent')) extras.push('Something you built once still runs loose, unaccounted for.');
    if (state.tags.has('known_capable')) extras.push('They already suspect what you are. That cat does not go back in the bag.');

    return Object.assign({ extras }, TEXT[key]);
  }

  function showEnding() {
    $stage.style.display = 'none';
    const e = computeEnding();
    document.getElementById('end-title').textContent = e.title;
    document.getElementById('end-body').textContent = e.body;
    const $extra = document.getElementById('end-extra');
    $extra.innerHTML = e.extras.map(x => `<p>${x}</p>`).join('');
    const $log = document.getElementById('path-log');
    $log.innerHTML = state.history.map(h => `<div class="row">${h.title} <span>&rarr; ${h.choice}${h.gate ? ` (${h.gate})` : ''}</span></div>`).join('');
    $ending.classList.add('show');
  }

  $restart.addEventListener('click', () => window.location.reload());

  renderStats();
  const first = findNextCard();
  if (first) renderCard(first);
})();
