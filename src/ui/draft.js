// ── Game.draft — the shared full-screen overlay: present() (1-of-N pick, e.g. level-up
// drafts), info() (result pop-up, e.g. ambush spoils), compare() (the STANDOFF screen).
// PAUSES the game (Game.paused checks draft.active()) until you resolve it. ([[start-defense-pivot]])
(function () {
  if (typeof window === 'undefined') return;
  window.Game = window.Game || {};
  let activeFlag = false, cb = null;

  const overlay = () => document.getElementById('draft-overlay');
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // ARM DELAY — buttons are inert for 2s after the overlay opens (anti-misclick). The
  // 'arming' class dims the buttons + sweeps a progress bar; the guard is the real safety.
  let NOARM = false; try { NOARM = /[?&]noarm=1/.test(location.search); } catch (e) {}   // test bypass
  const ARM_MS = 1000;
  let armedAt = 0, hideTimer = null;
  function arm(ov) { if (NOARM) { armedAt = 0; return; } armedAt = Date.now() + ARM_MS; ov.classList.add('arming'); void ov.offsetWidth; setTimeout(() => { if (Date.now() >= armedAt - 30) ov.classList.remove('arming'); }, ARM_MS); }
  function armed() { return NOARM || Date.now() >= armedAt; }
  // Show the overlay AND cancel any pending hide — otherwise a stale hide() timer from the
  // previous pop-up (e.g. spoils → calm draft on the SAME overlay) fires 300ms later and
  // hides the new one while it's still active, leaving the game paused on an invisible
  // overlay (couldn't start functions; froze the game tick). The token guards re-shows.
  function show(ov) { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } ov.hidden = false; arm(ov); requestAnimationFrame(() => ov.classList.add('up')); }

  // present({ kicker, title, items:[{id,name,desc,kind}], onPick(item) })
  function present(opts) {
    const ov = overlay(); if (!ov) { if (opts && opts.onPick && opts.items && opts.items[0]) opts.onPick(opts.items[0]); return; }
    activeFlag = true; cb = opts.onPick || null;
    document.getElementById('draft-kicker').textContent = opts.kicker || 'DRAFT';
    document.getElementById('draft-title').textContent = opts.title || 'choose one';
    const cards = document.getElementById('draft-cards');
    cards.innerHTML = (opts.items || []).map((it, i) => `
      <button class="draft-card ${it.kind === 'exotic' ? 'exotic' : 'unit'}" data-i="${i}">
        <span class="draft-card-kind">${esc(it.tag || (it.kind === 'exotic' ? 'EXOTIC' : 'UNIT'))}</span>
        <span class="draft-card-name">${esc(it.name)}</span>
        <span class="draft-card-desc">${esc(it.desc || '')}</span>
      </button>`).join('');
    cards.querySelectorAll('.draft-card').forEach(b => {
      b.onclick = () => { if (!armed()) return; const it = (opts.items || [])[+b.dataset.i]; hide(); if (cb) { const f = cb; cb = null; try { f(it); } catch (e) { console.error('[draft] onPick threw', e); } } };
    });
    show(ov);
  }

  // info({ kicker, title, lines:[html], onClose }) — a RESULT pop-up (e.g. ambush spoils):
  // same paused full-screen overlay, but a read-out + a single [continue] instead of a choice.
  function info(opts) {
    const ov = overlay(); if (!ov) { if (opts && opts.onClose) opts.onClose(); return; }
    activeFlag = true; cb = null;
    document.getElementById('draft-kicker').textContent = opts.kicker || '';
    document.getElementById('draft-title').textContent = opts.title || '';
    const cards = document.getElementById('draft-cards');
    cards.innerHTML = `<div class="draft-info">${(opts.lines || []).map(l => `<div class="draft-info-row">${l}</div>`).join('')}</div>` +
      `<button class="draft-card draft-continue" data-c="1"><span class="draft-card-name">continue</span></button>`;
    let closed = false;
    cards.querySelector('.draft-continue').onclick = () => { if (!armed() || closed) return; closed = true; hide(); if (opts.onClose) { try { opts.onClose(); } catch (e) { console.error('[draft] onClose threw', e); } } };
    show(ov);
  }

  function hide() { const ov = overlay(); activeFlag = false; if (ov) { ov.classList.remove('up'); if (hideTimer) clearTimeout(hideTimer); hideTimer = setTimeout(() => { hideTimer = null; if (!activeFlag && ov) ov.hidden = true; }, 300); } }

  // compare({ kicker, title, body, rows:[{label,you,them,adv:'you'|'them'}], verdict,
  // oddsPct, engageLabel, onEngage }) — the build-vs-threat STANDOFF screen (see
  // standoff-runtime.js): a terminal scan readout, no stat grid, no minigame. Same
  // paused overlay as present()/info(), a different card layout.
  function compare(opts) {
    const ov = overlay(); if (!ov) { if (opts && opts.onEngage) opts.onEngage(); return; }
    activeFlag = true; cb = null;
    document.getElementById('draft-kicker').textContent = opts.kicker || 'STANDOFF';
    document.getElementById('draft-title').textContent = opts.title || '';
    const cards = document.getElementById('draft-cards');
    const advTag = adv => adv === 'you' ? '<span class="standoff-adv-you">[ADVANTAGE: YOU]</span>' : '<span class="standoff-adv-them">[ADVANTAGE: THEM]</span>';
    const rowLine = r => `<div class="standoff-line"><span class="standoff-sys">&gt;</span> ${esc((r.label || '').toUpperCase())} ${esc(r.you)} vs ${r.them == null ? '—' : esc(r.them)} &nbsp;${advTag(r.adv)}</div>`;
    const lines = [`<div class="standoff-line"><span class="standoff-sys">&gt;</span> analyzing target...</div>`];
    if (opts.body) lines.push(`<div class="standoff-line"><span class="standoff-sys">&gt;</span> ${esc(opts.body)}</div>`);
    (opts.rows || []).forEach(r => lines.push(rowLine(r)));
    lines.push(`<div class="standoff-line"><span class="standoff-sys">&gt;</span> resolving odds<span class="standoff-cursor"></span></div>`);
    cards.innerHTML =
      `<div class="standoff-scan">${lines.join('')}</div>` +
      `<div class="standoff-final">${Math.round(opts.oddsPct || 0)}% — ${esc(opts.verdict || '')}</div>` +
      `<button class="draft-card draft-continue" data-c="1"><span class="draft-card-name">${esc(opts.engageLabel || 'engage')}</span></button>`;
    let closed = false;
    cards.querySelector('.draft-continue').onclick = () => { if (!armed() || closed) return; closed = true; hide(); if (opts.onEngage) { try { opts.onEngage(); } catch (e) { console.error('[draft] onEngage threw', e); } } };
    show(ov);
  }

  Game.draft = { present, info, compare, active: () => activeFlag };
})();
