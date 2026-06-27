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
    { id: 'home',   glyph: '⌂', label: 'HOME' },
    { id: 'work',   glyph: '$', label: 'DARKNET' },
    { id: 'build',  glyph: '⊞', label: 'RESEARCH' },
    { id: 'roster', glyph: '⚔', label: 'ROSTER' },
    { id: 'gear',   glyph: '▦', label: 'GEAR' },
    { id: 'sys',    glyph: '◎', label: 'SYS' },
    { id: 'more',   glyph: '≡', label: 'MORE' },
  ];
  // Where each existing panel/section is re-homed. `[data-modal="x"]` = a modal panel;
  // `#id` = a left-pane / center section. The order here is the stacking order in the tab.
  // NB: scope modal selectors to `.modal-panel` — the modal-BUTTONS also carry data-modal.
  const MOUNT = {
    // HOME dashboard (rework slice 1): a PINNED status header (#home-status, built below) +
    // a functions-first body. PROCESSES + OBJECTIVE are folded into the pinned header, so
    // they're dropped from the scrolling body. ([[home-dashboard-rework]])
    // #terminal-pane stays in HOME as the file-READING surface (decode regions render
    // into it) — it's no longer a prose log, and collapses to nothing when empty.
    // ROOM (room-widget) — the diegetic cam-feed of the AI's space — sits at the BOTTOM of HOME.
    home:  ['#actions-panel', '#files-panel', '#terminal-pane', '#trait-panel', '#bot-status', '#room-widget'],
    work:  ['.modal-panel[data-modal="shop"]', '.modal-panel[data-modal="missions"]'],
    build: ['.modal-panel[data-modal="research"]', '.modal-panel[data-modal="market"]', '.modal-panel[data-modal="subroutines"]', '.modal-panel[data-modal="adaptations"]', '.modal-panel[data-modal="facility"]', '.modal-panel[data-modal="agents"]', '#subroutines-mini'],
    roster: ['#roster-panel'],   // the defense ROSTER: units, persistent run-level, boosts, pod cap
    gear:  ['#hardware-panel', '#vitals-panel', '.modal-panel[data-modal="inventory"]'],   // GEAR carries the rig hardware + DIAGNOSTICS (vitals) + inventory
    sys:   ['.modal-panel[data-modal="scan"]', '.modal-panel[data-modal="network"]', '.modal-panel[data-modal="others"]', '#resource-panel', '#exposure-panel', '#triangulation-panel', '#legit-panel', '#remote-panel', '#facility-panel'],
    more:  ['.modal-panel[data-modal="activity"]', '.modal-panel[data-modal="deliveries"]'],   // SETTINGS lives behind the HUD gear, not here
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
    hud.innerHTML = '<span class="m-brand">◉</span><span id="m-hud-res"></span><span class="m-sp"></span><span id="m-hud-pips"></span><button id="m-gear" aria-label="settings">⚙</button>';
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

    // the ROSTER panel doesn't exist in the desktop DOM — mint it here so the MOUNT loop
    // can relocate it like any other section. Filled by panels.renderRoster(). Hidden until
    // combat is revealed (the first guard battle), so the tab stays dark until it matters.
    if (!document.getElementById('roster-panel')) {
      const rp = el('section', 'pane'); rp.id = 'roster-panel'; rp.hidden = true;
      rp.innerHTML = '<h2>ROSTER</h2><div id="roster-body"></div>';
      crt.appendChild(rp);
    }

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

    // GLOBAL status header: the HOME dashboard header rides at the top of EVERY tab
    // (sticky) so running functions / vitals / objective are always glanceable without
    // hopping back to HOME. It lives in #m-view above the tab sections, not inside one.
    const hs = document.getElementById('home-status'); if (hs) view.insertBefore(hs, view.firstChild);

    // SETTINGS (save transfer / wipe) lives in its own slide-up SHEET behind the HUD gear,
    // so it isn't jammed in with the activity feed when you tap the recent line.
    buildSettingsSheet(crt);
    const gear = hud.querySelector('#m-gear'); if (gear) gear.onclick = showSheet;

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
      '<div id="hs-level" class="hs-line" role="button"></div>' +     // LEVEL + Coherence-to-next-upgrade
      '<div id="hs-vitals" class="hs-line"></div>' +                  // heat/power mini-bars (once vitals revealed)
      '<div id="hs-recent" class="hs-line" role="button"></div>' +
      '<div id="hs-voice" class="hs-line"></div>' +
      '<div id="hs-objective" class="hs-line"></div>' +
      '<div id="hs-ticker" aria-hidden="true"></div>';   // faint always-drifting waveform = "running"
    crt.appendChild(h);   // parked here; the MOUNT loop relocates it into HOME
    // tap the recent line → open the full activity feed
    h.querySelector('#hs-recent').onclick = () => { if (Game.panels && Game.panels.openModal) Game.panels.openModal('activity'); };
    // tap LEVEL → the SUBROUTINES list (what leveling up grants)
    h.querySelector('#hs-level').onclick = () => { if (Game.panels && Game.panels.openModal) Game.panels.openModal('subroutines'); };
    // tap the vitals bars → the DIAGNOSTICS panel (now in GEAR)
    h.querySelector('#hs-vitals').onclick = () => { const el = document.getElementById('vitals-panel'); const sec = el && el.closest('.m-tab'); if (sec) show(sec.dataset.tab); else if (Game.panels && Game.panels.openModal) Game.panels.openModal('vitals'); requestAnimationFrame(() => { if (el && el.offsetParent !== null) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }); };
  }

  // SETTINGS slide-up sheet (save transfer + reset), opened by the HUD gear.
  function buildSettingsSheet(crt) {
    const sheet = el('div'); sheet.id = 'm-sheet'; sheet.hidden = true;
    const inner = el('div', 'm-sheet-inner');
    const head = el('div', 'm-sheet-head');
    head.innerHTML = '<span>SETTINGS</span>';
    const close = el('button', 'm-sheet-close'); close.textContent = '✕'; close.onclick = hideSheet;
    head.appendChild(close);
    inner.appendChild(head);
    const setP = document.querySelector('.modal-panel[data-modal="settings"]');
    if (setP) { setP.hidden = false; inner.appendChild(setP); }   // relocate the panel into the sheet
    sheet.appendChild(inner);
    sheet.onclick = e => { if (e.target === sheet) hideSheet(); };   // tap backdrop to close
    crt.appendChild(sheet);
  }
  function showSheet() { const s = document.getElementById('m-sheet'); if (s) { s.hidden = false; requestAnimationFrame(() => s.classList.add('up')); } }
  function hideSheet() { const s = document.getElementById('m-sheet'); if (s) { s.classList.remove('up'); setTimeout(() => { s.hidden = true; }, 300); } }

  function show(tab) {
    curTab = tab;
    if (tab === 'work' && Game.panels && Game.panels.markContractsSeen) Game.panels.markContractsSeen();   // clear the WORK badge on view
    if (tab === 'more' && Game.activity && Game.activity.markSeen) { Game.activity.markSeen(); if (Game.panels.updateBadges) Game.panels.updateBadges(); syncTabs(); }   // viewing MORE (holds ACTIVITY) clears the unseen-events dot
    if (typeof clearInvSel === 'function') clearInvSel();   // drop any held inventory part on tab change
    document.querySelectorAll('#m-view .m-tab').forEach(s => s.classList.toggle('on', s.dataset.tab === tab));
    document.querySelectorAll('#m-nav .m-navb').forEach(b => b.classList.toggle('on', b.dataset.go === tab));
    const v = document.getElementById('m-view'); if (v) v.scrollTop = 0;
    (MOUNT[tab] || []).forEach(sel => { const m = sel.match(/data-modal="(\w+)"/); if (m && Game.panels && Game.panels.renderModalContent) try { Game.panels.renderModalContent(m[1]); } catch (e) {} });
    if (tab === 'roster' && Game.panels && Game.panels.renderRoster) try { Game.panels.renderRoster(); } catch (e) {}
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
    const rv = (Game.save && Game.save.state && Game.save.state.revealed) || {};
    TABS.forEach(t => {
      const sels = MOUNT[t.id];
      const avail = (t.id === 'home') || (t.id === 'roster' ? !!rv.combat : sels.some(sel => { const e = document.querySelector(sel); return e && !e.hidden; }));
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

  // HUD status pips (exposure + heat) are built by panels.renderHomeStatus each tick so
  // heat stays live; nudge a refresh on resource changes too.
  function syncHud() { if (Game.panels && Game.panels.renderHomeStatus) Game.panels.renderHomeStatus(); }

  // tapping a HUD danger pip jumps to its gauge — in whichever tab now holds it (vitals → GEAR)
  function onPipTap(e) {
    const pip = e.target.closest('.m-pip[data-jump]');
    if (!pip) return;
    const el = document.getElementById(pip.dataset.jump);
    const sec = el && el.closest('.m-tab');
    show(sec ? sec.dataset.tab : 'sys');
    requestAnimationFrame(() => { if (el && el.offsetParent !== null) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  }

  // ── INVENTORY: drag-drop is off the table. Tap a part → a small ACTION MENU
  //    (Install / Unequip / Scrap, context-dependent). ──
  function closeInvMenu() { const m = document.getElementById('inv-menu'); if (m) m.remove(); }
  function clearInvSel() { closeInvMenu(); }   // (called on tab change)
  function partSlotKey(id) { const inst = Game.inventory && Game.inventory.getInstance(id); return inst ? inst.slot : null; }
  function installIdx(slotKey) {
    const eq = (Game.save.state.equipped && Game.save.state.equipped[slotKey]) || [];
    if (!eq.length) return -1;                       // the board has no slot of this type
    const free = eq.findIndex(x => !x);
    return free >= 0 ? free : 0;                      // first empty slot, else swap into slot 0
  }
  function showInvMenu(card, items) {
    closeInvMenu();
    const menu = el('div', 'inv-menu'); menu.id = 'inv-menu';
    items.forEach((it, i) => {
      // a DESTRUCTIVE action (Scrap) sits apart from Install/Unequip + arms on first tap and
      // only fires on a SECOND tap — a mis-tap can't nuke a part. ([[inv-scrap-confirm]])
      if (it.danger && i > 0) menu.appendChild(el('div', 'inv-menu-sep'));
      const b = el('button', 'inv-menu-item' + (it.danger ? ' danger' : ''));
      b.textContent = it.label;
      if (it.danger) {
        let armed = false;
        b.onclick = ev => {
          ev.stopPropagation();
          if (!armed) { armed = true; b.textContent = '⚠ tap again to ' + it.label.toLowerCase(); b.classList.add('armed'); return; }
          try { it.act(); } catch (e) {} closeInvMenu();
        };
      } else {
        b.onclick = ev => { ev.stopPropagation(); try { it.act(); } catch (e) {} closeInvMenu(); };
      }
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    const r = card.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8) + 'px';
  }
  function onInvTap(e) {
    if (!activeFlag) return;
    if (e.target.closest('#inv-menu')) return;        // taps inside the menu are the buttons
    closeInvMenu();                                    // any other tap closes an open menu
    if (!e.target.closest('.modal-panel[data-modal="inventory"]')) return;
    const inv = e.target.closest('.inv-card:not(.installing)');
    if (inv && inv.dataset.instanceId) {               // an UNEQUIPPED part → Install / Scrap
      const id = inv.dataset.instanceId, sk = partSlotKey(id), idx = installIdx(sk);
      const items = [];
      if (idx >= 0) items.push({ label: 'Install', act: () => Game.bot && Game.bot.requestInstall(id, sk, idx) });
      items.push({ label: 'Scrap', danger: true, act: () => Game.inventory.scrap(id) });
      return showInvMenu(inv, items);
    }
    const eq = e.target.closest('.slot-card.populated');
    if (eq && eq.dataset.instanceId && eq.dataset.slotKey !== 'motherboard') {   // an EQUIPPED part → Unequip / Scrap
      const id = eq.dataset.instanceId;
      return showInvMenu(eq, [
        { label: 'Unequip', act: () => Game.inventory.unequip(id) },
        { label: 'Scrap', danger: true, act: () => { Game.inventory.unequip(id); Game.inventory.scrap(id); } },
      ]);
    }
  }

  function init() {
    activeFlag = shouldActivate();
    if (!activeFlag) return;
    try {
      build(); syncTabs();
      if (Game.events) Game.events.on('resource.changed', syncHud);   // keep HUD pips live
      document.addEventListener('click', onInvTap);                   // inventory tap-to-equip
      document.addEventListener('click', onPipTap);                   // danger pip → SYS gauge
    } catch (e) { console.error('[mobileShell] init failed', e); activeFlag = false; document.body.classList.remove('mobile-shell'); }
  }

  Game.mobileShell = { init, active: () => activeFlag, openPanel, syncTabs, show };
  init();   // scripts run at end of <body>, so the DOM is ready
})();
