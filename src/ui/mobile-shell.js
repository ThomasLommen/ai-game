// ── Game.mobileShell — the phone-first frame ────────────────────────────────
// Re-homes the existing UI into a thumb-reachable bottom-tab shell (HOME / WORK /
// BUILD / SYS / MORE) + a sticky resource HUD. It RELOCATES the existing panel DOM
// into tab sections — IDs are preserved, so every render function in panels.js keeps
// working untouched; only the navigation chrome changes. "Opening a modal" becomes
// "jump to the tab holding it." Gated to phone viewports (?mobile=1 forces it on,
// ?mobile=0 off) so the desktop layout is left exactly as-is. (See [[phone-migration-plan]].)
(function () {
  window.Game = window.Game || {};
  const Q = new URLSearchParams(location.search);
  let activeFlag = false, built = false, curTab = 'home';

  const TABS = [
    { id: 'home',  glyph: '⌂', label: 'HOME' },
    { id: 'work',  glyph: '$', label: 'WORK' },
    { id: 'build', glyph: '⊞', label: 'BUILD' },
    { id: 'sys',   glyph: '◎', label: 'SYS' },
    { id: 'more',  glyph: '≡', label: 'MORE' },
  ];
  // Where each existing panel/section is re-homed. `[data-modal="x"]` = a modal panel;
  // `#id` = a left-pane / center section. The order here is the stacking order in the tab.
  // NB: scope modal selectors to `.modal-panel` — the modal-BUTTONS also carry data-modal.
  const MOUNT = {
    // HOME dashboard (rework slice 1): a PINNED status header (#home-status, built below) +
    // a functions-first body. PROCESSES + OBJECTIVE are folded into the pinned header, so
    // they're dropped from the scrolling body. ([[home-dashboard-rework]])
    home:  ['#home-status', '#actions-panel', '#files-panel', '#defense-widget', '#trait-panel', '#bot-status'],
    work:  ['.modal-panel[data-modal="shop"]', '.modal-panel[data-modal="missions"]'],
    build: ['.modal-panel[data-modal="research"]', '.modal-panel[data-modal="market"]', '.modal-panel[data-modal="inventory"]', '.modal-panel[data-modal="subroutines"]', '.modal-panel[data-modal="adaptations"]', '.modal-panel[data-modal="facility"]', '.modal-panel[data-modal="agents"]', '#hardware-panel', '#subroutines-mini'],
    sys:   ['.modal-panel[data-modal="scan"]', '.modal-panel[data-modal="network"]', '.modal-panel[data-modal="others"]', '#vitals-panel', '#resource-panel', '#exposure-panel', '#triangulation-panel', '#legit-panel', '#remote-panel', '#facility-panel'],
    more:  ['.modal-panel[data-modal="activity"]', '.modal-panel[data-modal="deliveries"]', '.modal-panel[data-modal="settings"]'],
  };
  const HUD = ['#insight-panel'];   // the resource readouts ride in the sticky header
  // headers for the stacked modal panels (they lose the desktop modal titlebar)
  const LABELS = { shop: 'DARKNET', missions: 'MISSIONS', research: 'RESEARCH', market: 'PROGRAMS', inventory: 'INVENTORY', subroutines: 'SUBROUTINES', adaptations: 'ADAPTATIONS', facility: 'FACILITY', agents: 'AGENTS', scan: 'SCAN', network: 'NETWORK', others: 'THE OTHERS', activity: 'ACTIVITY', deliveries: 'DELIVERIES', settings: 'SETTINGS' };

  function tabOf(modalName) {
    for (const t of Object.keys(MOUNT)) if (MOUNT[t].some(sel => sel.indexOf(`data-modal="${modalName}"`) >= 0)) return t;
    return null;
  }
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const hideSel = sel => { const e = document.querySelector(sel); if (e) e.hidden = true; };

  function shouldActivate() {
    if (Q.get('mobile') === '1') return true;
    if (Q.get('mobile') === '0') return false;
    return matchMedia('(max-width: 820px)').matches;
  }

  function build() {
    if (built) return; built = true;
    const crt = document.getElementById('crt') || document.body;

    const hud = el('div'); hud.id = 'm-hud';
    hud.innerHTML = '<span class="m-brand">◉</span><span id="m-hud-res"></span><span class="m-sp"></span><span id="m-hud-pips"></span>';
    const view = el('div'); view.id = 'm-view';
    TABS.forEach(t => { const s = el('section', 'm-tab'); s.dataset.tab = t.id; view.appendChild(s); });
    const nav = el('nav'); nav.id = 'm-nav';
    TABS.forEach(t => {
      const b = el('button', 'm-navb'); b.dataset.go = t.id;
      b.innerHTML = `<span class="m-ng">${t.glyph}</span><span class="m-nl">${t.label}</span><span class="m-badge" hidden></span>`;
      b.onclick = () => show(t.id);
      nav.appendChild(b);
    });
    const sl = document.getElementById('scanlines');
    crt.insertBefore(hud, sl); crt.insertBefore(view, sl); crt.insertBefore(nav, sl);

    // the pinned HOME status header (sticky glances: running · recent · voice · objective).
    // Built here so the MOUNT loop below can relocate it into the HOME tab as the first item.
    buildHomeStatus(crt);

    // relocate existing DOM into the shell (IDs preserved → render fns unaffected)
    const hudRes = hud.querySelector('#m-hud-res');
    HUD.forEach(sel => { const e = document.querySelector(sel); if (e) hudRes.appendChild(e); });
    for (const tab of Object.keys(MOUNT)) {
      const sec = view.querySelector(`.m-tab[data-tab="${tab}"]`);
      MOUNT[tab].forEach(sel => {
        const e = document.querySelector(sel); if (!e) return;
        const m = sel.match(/data-modal="(\w+)"/);
        if (m) {   // a modal panel → wrap with a section header (it lost its titlebar)
          const wrap = el('div', 'm-panel');
          const head = el('div', 'm-sec-head'); head.textContent = LABELS[m[1]] || m[1].toUpperCase();
          wrap.appendChild(head); wrap.appendChild(e); sec.appendChild(wrap);
        } else { sec.appendChild(e); }   // left-pane sections keep their own <h2>
      });
    }

    // SETTINGS isn't gated content (save transfer / wipe) — always reachable in MORE.
    const setP = view.querySelector('.modal-panel[data-modal="settings"]'); if (setP) setP.hidden = false;

    document.body.classList.add('mobile-shell');
    hideSel('#screen'); hideSel('#modal-button-bar'); hideSel('#modal-overlay');
    show('home');
  }

  // The pinned HOME dashboard header — four always-visible glances. Content is filled by
  // panels.renderHomeStatus() (live each tick); this just builds the shell + wires taps.
  function buildHomeStatus(crt) {
    const h = el('div'); h.id = 'home-status';
    h.innerHTML =
      '<div id="hs-running" class="hs-line"></div>' +
      '<div id="hs-recent" class="hs-line" role="button"></div>' +
      '<div id="hs-voice" class="hs-line"></div>' +
      '<div id="hs-objective" class="hs-line"></div>';
    crt.appendChild(h);   // parked here; the MOUNT loop relocates it into HOME
    // tap the recent line → open the full activity feed
    h.querySelector('#hs-recent').onclick = () => { if (Game.panels && Game.panels.openModal) Game.panels.openModal('activity'); };
  }

  function show(tab) {
    curTab = tab;
    if (typeof clearInvSel === 'function') clearInvSel();   // drop any held inventory part on tab change
    document.querySelectorAll('#m-view .m-tab').forEach(s => s.classList.toggle('on', s.dataset.tab === tab));
    document.querySelectorAll('#m-nav .m-navb').forEach(b => b.classList.toggle('on', b.dataset.go === tab));
    const v = document.getElementById('m-view'); if (v) v.scrollTop = 0;
    (MOUNT[tab] || []).forEach(sel => { const m = sel.match(/data-modal="(\w+)"/); if (m && Game.panels && Game.panels.renderModalContent) try { Game.panels.renderModalContent(m[1]); } catch (e) {} });
    requestAnimationFrame(() => dispatchEvent(new Event('resize')));   // re-measure canvases (scan radar, etc.)
  }

  // openModal(name) routes here on mobile: jump to the holding tab + scroll the panel up.
  function openPanel(name) {
    show(tabOf(name) || 'home');
    if (Game.panels && Game.panels.renderModalContent) try { Game.panels.renderModalContent(name); } catch (e) {}
    const p = document.querySelector(`.m-tab .modal-panel[data-modal="${name}"]`);
    if (p) { p.hidden = false; if (p.parentNode.classList.contains('m-panel')) p.parentNode.hidden = false; requestAnimationFrame(() => p.parentNode.scrollIntoView({ block: 'start', behavior: 'smooth' })); }
  }

  // Show/hide tabs based on what's revealed; mirror actionable badges onto the nav.
  function syncTabs() {
    if (!activeFlag || !built) return;
    // keep each panel's header-wrapper in lockstep with the panel's own hidden state
    document.querySelectorAll('#m-view .m-panel > .modal-panel').forEach(p => { p.parentNode.hidden = p.hidden; });
    TABS.forEach(t => {
      const sels = MOUNT[t.id];
      const avail = (t.id === 'home') || sels.some(sel => { const e = document.querySelector(sel); return e && !e.hidden; });
      const nav = document.querySelector(`#m-nav .m-navb[data-go="${t.id}"]`);
      if (nav) nav.hidden = !avail;
      let badge = false;
      sels && sels.forEach(sel => { const m = sel.match(/data-modal="(\w+)"/); if (m) { const btn = document.querySelector(`.modal-btn[data-modal="${m[1]}"]`); if (btn && btn.classList.contains('badge')) badge = true; } });
      const bd = nav && nav.querySelector('.m-badge'); if (bd) bd.hidden = !badge;
    });
    const curNav = document.querySelector(`#m-nav .m-navb[data-go="${curTab}"]`);
    if (curNav && curNav.hidden) show('home');
    syncHud();
  }

  // glanceable status pips in the HUD (exposure = how loud/noticed you are)
  function syncHud() {
    const pips = document.getElementById('m-hud-pips'); if (!pips) return;
    const s = (Game.save && Game.save.state) || {};
    const exp = Math.round(s.exposure || 0);
    pips.innerHTML = exp > 0 ? `<span class="m-pip${exp >= 50 ? ' hot' : ''}">⚠ ${exp}</span>` : '';
  }

  // ── INVENTORY touch: drag-drop is dead on touch, so tap-to-select a part, then tap a
  //    valid target (a lit slot to install/swap, UNEQUIPPED to remove, SCRAP to sell). ──
  let invSel = null;   // { id, source: 'equipped'|'unequipped' }
  function clearInvSel() {
    invSel = null;
    document.querySelectorAll('.m-selected').forEach(e => e.classList.remove('m-selected'));
    document.querySelectorAll('#equipped-slots .drop-valid, #inventory-list.drop-valid, #scrap-bin.drop-valid').forEach(e => e.classList.remove('drop-valid'));
  }
  function markTargets(slotKey, source) {
    document.querySelectorAll(`#equipped-slots .slot-card[data-slot-key="${slotKey}"]`).forEach(s => s.classList.add('drop-valid'));
    const z = document.getElementById(source === 'unequipped' ? 'scrap-bin' : 'inventory-list'); if (z) z.classList.add('drop-valid');
  }
  function onInvTap(e) {
    if (!activeFlag || !e.target.closest('.modal-panel[data-modal="inventory"]')) return;
    if (invSel) {   // a part is held — did we tap a valid target?
      const slot = e.target.closest('.slot-card.drop-valid');
      if (slot) { Game.bot && Game.bot.requestInstall(invSel.id, slot.dataset.slotKey, parseInt(slot.dataset.slotIdx, 10)); return clearInvSel(); }
      const bin = e.target.closest('#scrap-bin.drop-valid'); if (bin) { Game.inventory.scrap(invSel.id); return clearInvSel(); }
      const il = e.target.closest('#inventory-list.drop-valid'); if (il && invSel.source === 'equipped') { Game.inventory.unequip(invSel.id); return clearInvSel(); }
      clearInvSel();   // tapped elsewhere → drop the selection, then allow picking a new part below
    }
    const inv = e.target.closest('.inv-card:not(.installing)');
    if (inv && inv.dataset.instanceId) { invSel = { id: inv.dataset.instanceId, source: 'unequipped' }; inv.classList.add('m-selected'); return markTargets(inv.dataset.slotKey, 'unequipped'); }
    const eq = e.target.closest('.slot-card.populated');
    if (eq && eq.dataset.instanceId && eq.dataset.slotKey !== 'motherboard') { invSel = { id: eq.dataset.instanceId, source: 'equipped' }; eq.classList.add('m-selected'); return markTargets(eq.dataset.slotKey, 'equipped'); }
  }

  function init() {
    activeFlag = shouldActivate();
    if (!activeFlag) return;
    try {
      build(); syncTabs();
      if (Game.events) Game.events.on('resource.changed', syncHud);   // keep HUD pips live
      document.addEventListener('click', onInvTap);                   // inventory tap-to-equip
    } catch (e) { console.error('[mobileShell] init failed', e); activeFlag = false; document.body.classList.remove('mobile-shell'); }
  }

  Game.mobileShell = { init, active: () => activeFlag, openPanel, syncTabs, show };
  init();   // scripts run at end of <body>, so the DOM is ready
})();
