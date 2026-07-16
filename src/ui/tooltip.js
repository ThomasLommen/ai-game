// ── Game.tooltip — a tap-to-show info card, for content currently hidden behind
// native title="" attributes. title only shows on hover, which doesn't exist on
// touch — and this game is mobile-only, so anything living in a title= is
// effectively invisible to every real player. Mirrors the tap-a-node pattern
// already proven in research-tree.js, generalized for plain DOM elements: give
// an element `data-tip="plain text"` instead of `title="..."` and it gets a
// tap-triggered popover instead of a hover-only one. Not for elements whose tap
// already does something else (equip/acquire/etc — those keep their own affordance).
(function () {
  window.Game = window.Game || {};
  let card = null;

  function ensure() {
    if (card) return card;
    card = document.createElement('div');
    card.id = 'tap-tooltip';
    card.hidden = true;
    document.body.appendChild(card);
    return card;
  }

  function show(target, text) {
    const c = ensure();
    c.textContent = text;
    c.hidden = false;
    const r = target.getBoundingClientRect();
    const cw = c.offsetWidth, ch = c.offsetHeight;
    let left = r.left + r.width / 2 - cw / 2;
    left = Math.max(6, Math.min(window.innerWidth - cw - 6, left));
    let top = r.top - ch - 8;
    if (top < 6) top = r.bottom + 8;
    c.style.left = left + 'px';
    c.style.top = top + 'px';
  }
  function hide() { if (card) card.hidden = true; }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tip]');
    if (t) { e.stopPropagation(); show(t, t.dataset.tip); return; }
    if (card && !card.hidden && e.target.id !== 'tap-tooltip') hide();
  }, true);

  Game.tooltip = { show, hide };
})();
