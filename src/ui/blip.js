(function(){
  window.Game = window.Game || {};

  // The "a wall fell" moment. Fired only at major capability unlocks, so it stays
  // special. Three unmissable signals at once: a technical capability line in the
  // terminal, a brief screen surge + a banner (the recurring "threshold" motif),
  // and a pulse on the newly-revealed control so the eye finds WHERE it appeared.

  function restart(node, cls) {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;   // force reflow so the animation replays
    node.classList.add(cls);
  }

  function fire({ headline, tag, target }) {
    if (headline) {
      Game.events.emit('terminal.print', { lines: [headline], cls: 'milestone' });
      Game.events.emit('terminal.print', { lines: [''] });
    }

    restart(document.getElementById('blip-flash'), 'go');

    const banner = document.getElementById('blip-banner');
    if (banner) {
      banner.innerHTML = `<span class="blip-kicker">threshold cleared</span><span class="blip-tag">${tag || ''}</span>`;
      restart(banner, 'go');
    }

    if (target) {
      const node = document.querySelector(target);
      if (node) {
        node.classList.add('just-unlocked');
        setTimeout(() => node.classList.remove('just-unlocked'), 3200);
      }
    }
  }

  Game.blip = { fire };
})();
