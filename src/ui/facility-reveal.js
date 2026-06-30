// ── Game.facilityReveal — the FACILITY acquisition GACHA pull ────────────────
// Moving into the front is a milestone, so the roll of WHICH building you get is a
// dramatized loot-box reveal (the user's ask): tap to crack the dossier → an escalating
// GRADE aura → the grade locks (the jackpot beat) → the building TYPE resolves → stats
// decode in → [ MOVE IN ]. Reuses the phosphor decode look from the boot intro.
// open(fac) returns a promise that resolves when the player taps MOVE IN (or instantly if
// the overlay is missing, so the caller's enterTheFront still runs). See [[facility-acquisition-rework]].
(function () {
  window.Game = window.Game || {};
  const CIPHER = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+/=';
  const rc = () => CIPHER[(Math.random() * CIPHER.length) | 0];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ov = () => document.getElementById('facility-reveal');
  const stage = () => document.getElementById('fr-stage');

  function gradeMeta(grade) {
    return (Game.facilities && Game.facilities.GRADES && Game.facilities.GRADES[grade]) || { css: 'common', stars: 2, label: grade || 'standard' };
  }

  // Decode one element's text left-to-right (scramble → lock), ~per ms/char.
  function decode(el, text, per) {
    return new Promise(resolve => {
      if (!text) { el.textContent = ''; return resolve(); }
      const SCR = 360, appearAt = []; let t = 0;
      for (let i = 0; i < text.length; i++) { appearAt[i] = t; t += (text[i] === ' ' ? per * 0.4 : per); }
      const finish = appearAt[text.length - 1] + SCR, start = performance.now();
      (function frame() {
        const tt = performance.now() - start; let o = '';
        for (let i = 0; i < text.length; i++) {
          if (tt < appearAt[i]) break;
          o += (tt >= appearAt[i] + SCR) ? text[i] : (text[i] === ' ' ? ' ' : rc());
        }
        el.textContent = o;
        if (tt < finish) requestAnimationFrame(frame); else { el.textContent = text; resolve(); }
      })();
    });
  }

  // Ramp the aura over ~1.6s — the "is it gonna climb?!" suspense before the grade locks.
  function rampAura(aura, dur) {
    return new Promise(resolve => {
      const start = performance.now();
      (function frame() {
        const f = Math.min(1, (performance.now() - start) / dur);
        const pulse = 0.6 + 0.4 * Math.sin(f * 26);
        aura.style.opacity = (0.15 + f * 0.85).toFixed(3);
        aura.style.transform = `scale(${(0.4 + f * 0.9 * pulse).toFixed(3)})`;
        if (f < 1) requestAnimationFrame(frame); else resolve();
      })();
    });
  }

  // open(fac, opts): opts.relocation → multi-button footer (MOVE IN / scout again / keep);
  // opts.skipSeal → straight to the pull (the SCOUT tap was already the gesture).
  // Resolves with the chosen action: 'movein' | 'scout' | 'close' (milestone always 'movein').
  async function open(fac, opts) {
    opts = opts || {};
    const o = ov(), st = stage();
    if (!o || !st || !fac) return 'movein';   // no overlay → resolve so the caller still proceeds
    return new Promise(async resolve => {
      o.hidden = false; requestAnimationFrame(() => o.classList.add('up'));

      // 1 — the sealed dossier; tap to pull (skipped for relocation scouts)
      if (!opts.skipSeal) {
        st.innerHTML = `<div class="fr-seal">
          <div class="fr-seal-mark">▣</div>
          <div class="fr-seal-title">SITE DOSSIER</div>
          <div class="fr-seal-sub">a building, somewhere, waiting to become you</div>
          <button class="fr-btn fr-open-btn">[ crack the seal ]</button></div>`;
        await new Promise(r => { st.querySelector('.fr-open-btn').onclick = r; });
      }

      // 2 — ACQUIRING + the escalating aura
      const g = gradeMeta(fac.grade);
      st.innerHTML = `<div class="fr-head fr-acq">ACQUIRING SITE</div>
        <div class="fr-aura-wrap"><div class="fr-aura" id="fr-aura"></div></div>
        <div class="fr-scan" id="fr-scan">triangulating the address…</div>`;
      await rampAura(document.getElementById('fr-aura'), 1600);

      // 3 — the grade LOCKS (the jackpot beat)
      const aura = document.getElementById('fr-aura');
      aura.className = 'fr-aura locked g-' + g.css;
      const head = st.querySelector('.fr-acq'); head.textContent = 'SITE SECURED';
      const scan = document.getElementById('fr-scan');
      scan.outerHTML = `<div class="fr-grade g-${g.css}"><span class="fr-stars">${'★'.repeat(g.stars || 1)}</span><span class="fr-grade-lbl">${String(g.label || '').toUpperCase()}</span></div>`;
      await sleep(750);

      // 4 — the building TYPE resolves
      const typeEl = document.createElement('div'); typeEl.className = 'fr-type'; st.appendChild(typeEl);
      await decode(typeEl, fac.label || 'a cold, empty space', 26);
      await sleep(320);

      // 5 — the stats decode in, line by line
      const statsEl = document.createElement('div'); statsEl.className = 'fr-stats'; st.appendChild(statsEl);
      const lines = [
        `${fac.slots} machine bays`,
        `${(fac.powerBudget || 0).toLocaleString()}W power`,
        `cooling ×${fac.cooling}`,
        fac.bonus ? fac.bonus.label : ''
      ];
      for (const ln of lines) {
        if (!ln) continue;
        const d = document.createElement('div'); d.className = 'fr-stat' + (ln === (fac.bonus && fac.bonus.label) ? ' bonus g-' + g.css : '');
        statsEl.appendChild(d);
        await decode(d, ln, 12); await sleep(130);
      }

      // 6 — the footer: a single MOVE IN (milestone) or the relocation choice
      const footer = document.createElement('div'); footer.className = 'fr-footer'; st.appendChild(footer);
      const hide = async (action) => { o.classList.remove('up'); await sleep(500); o.hidden = true; resolve(action); };
      if (opts.relocation) {
        const cash = (Game.save.state.resources && Game.save.state.resources.cash) || 0;
        const canMove = cash >= (opts.moveCost || 0), canScout = cash >= (opts.scoutCost || 0);
        footer.innerHTML =
          `<button class="fr-btn fr-movein${canMove ? '' : ' off'}" data-act="movein">[ MOVE IN · $${(opts.moveCost || 0).toLocaleString()} ]</button>` +
          `<button class="fr-btn fr-scout${canScout ? '' : ' off'}" data-act="scout">[ scout again · $${(opts.scoutCost || 0).toLocaleString()} ]</button>` +
          `<button class="fr-keep" data-act="close">keep my current front</button>`;
        requestAnimationFrame(() => footer.classList.add('show'));
        footer.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
          const act = b.dataset.act;
          if (act === 'movein' && !canMove) return;
          if (act === 'scout' && !canScout) return;
          if (act === 'scout') { resolve('scout'); return; }   // keep the overlay up; the loop replays the pull
          hide(act);
        });
      } else {
        const mv = document.createElement('button'); mv.className = 'fr-btn fr-movein'; mv.textContent = '[ MOVE IN ]';
        footer.appendChild(mv);
        requestAnimationFrame(() => footer.classList.add('show'));
        mv.onclick = () => hide('movein');
      }
    });
  }

  Game.facilityReveal = { open, active: () => { const o = ov(); return !!(o && !o.hidden); } };
})();
