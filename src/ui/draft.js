// ── Game.draft — the 1-of-N pick overlay (opening pick + post-win prizes) ────
// A full-screen choice that PAUSES the game (Game.paused checks draft.active()) until you
// pick. Used for the opening roster pick and battle prizes. ([[start-defense-pivot]])
(function () {
  if (typeof window === 'undefined') return;
  window.Game = window.Game || {};
  let activeFlag = false, cb = null;

  const overlay = () => document.getElementById('draft-overlay');
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // ARM DELAY — buttons are inert for 2s after the overlay opens (anti-misclick). The
  // 'arming' class dims the buttons + sweeps a progress bar; the guard is the real safety.
  let NOARM = false; try { NOARM = /[?&]noarm=1/.test(location.search); } catch (e) {}   // test bypass
  const ARM_MS = 2000;
  let armedAt = 0;
  function arm(ov) { if (NOARM) { armedAt = 0; return; } armedAt = Date.now() + ARM_MS; ov.classList.add('arming'); void ov.offsetWidth; setTimeout(() => { if (Date.now() >= armedAt - 30) ov.classList.remove('arming'); }, ARM_MS); }
  function armed() { return NOARM || Date.now() >= armedAt; }

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
    ov.hidden = false; arm(ov); requestAnimationFrame(() => ov.classList.add('up'));
  }

  // info({ kicker, title, lines:[html], onClose }) — a RESULT pop-up (e.g. battle spoils):
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
    ov.hidden = false; arm(ov); requestAnimationFrame(() => ov.classList.add('up'));
  }

  function hide() { const ov = overlay(); activeFlag = false; if (ov) { ov.classList.remove('up'); setTimeout(() => { ov.hidden = true; }, 300); } }

  Game.draft = { present, info, active: () => activeFlag };
})();
