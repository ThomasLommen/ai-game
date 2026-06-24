// ── Game.draft — the 1-of-N pick overlay (opening pick + post-win prizes) ────
// A full-screen choice that PAUSES the game (Game.paused checks draft.active()) until you
// pick. Used for the opening roster pick and battle prizes. ([[start-defense-pivot]])
(function () {
  if (typeof window === 'undefined') return;
  window.Game = window.Game || {};
  let activeFlag = false, cb = null;

  const overlay = () => document.getElementById('draft-overlay');
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // present({ kicker, title, items:[{id,name,desc,kind}], onPick(item) })
  function present(opts) {
    const ov = overlay(); if (!ov) { if (opts && opts.onPick && opts.items && opts.items[0]) opts.onPick(opts.items[0]); return; }
    activeFlag = true; cb = opts.onPick || null;
    document.getElementById('draft-kicker').textContent = opts.kicker || 'DRAFT';
    document.getElementById('draft-title').textContent = opts.title || 'choose one';
    const cards = document.getElementById('draft-cards');
    cards.innerHTML = (opts.items || []).map((it, i) => `
      <button class="draft-card ${it.kind === 'exotic' ? 'exotic' : 'unit'}" data-i="${i}">
        <span class="draft-card-kind">${it.kind === 'exotic' ? 'EXOTIC' : 'UNIT'}</span>
        <span class="draft-card-name">${esc(it.name)}</span>
        <span class="draft-card-desc">${esc(it.desc || '')}</span>
      </button>`).join('');
    cards.querySelectorAll('.draft-card').forEach(b => {
      b.onclick = () => { const it = (opts.items || [])[+b.dataset.i]; hide(); if (cb) { const f = cb; cb = null; try { f(it); } catch (e) { console.error('[draft] onPick threw', e); } } };
    });
    ov.hidden = false; requestAnimationFrame(() => ov.classList.add('up'));
  }

  function hide() { const ov = overlay(); activeFlag = false; if (ov) { ov.classList.remove('up'); setTimeout(() => { ov.hidden = true; }, 300); } }

  Game.draft = { present, active: () => activeFlag };
})();
