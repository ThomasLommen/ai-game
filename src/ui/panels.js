(function(){
  window.Game = window.Game || {};

  const leftPane     = () => document.getElementById('left-pane');
  const buttonBar    = () => document.getElementById('modal-button-bar');
  const modalOverlay = () => document.getElementById('modal-overlay');
  const modalTitle   = () => document.getElementById('modal-title');
  const modalClose   = () => document.getElementById('modal-close');
  const vitalsList   = () => document.getElementById('vitals-list');
  const resourceList = () => document.getElementById('resource-list');
  const hardwareList = () => document.getElementById('hardware-list');
  const subroutinesList = () => document.getElementById('subroutines-list');
  const marketList   = () => document.getElementById('market-list');
  const shopList     = () => document.getElementById('shop-list');
  const shopStatus   = () => document.getElementById('shop-status');
  const inventoryList= () => document.getElementById('inventory-list');
  const deliveriesList = () => document.getElementById('deliveries-list');
  const actionsList  = () => document.getElementById('actions-list');
  const processList  = () => document.getElementById('processes-list');
  const filesList    = () => document.getElementById('files-list-main');
  const debugPanel   = () => document.getElementById('debug-panel');
  const debugContent = () => document.getElementById('debug-content');

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  const STAT_LABELS = {
    cpu_threads: 'CPU',
    ram_mb:      'RAM',
    heat_output: 'Heat',
    power_draw:  'Power',
    instability: 'Instability'
  };

  function describeMod(mod) {
    const label = STAT_LABELS[mod.target] || mod.target;
    const sign = mod.value > 0 ? '+' : '';
    if (mod.op === 'more' || mod.op === 'increased') {
      return `${sign}${Math.round(mod.value * 100)}% ${label}`;
    }
    if (mod.op === 'flat') {
      // Heat/Power use 1 decimal flat; instability/cpu use 2 decimals.
      const decimals = (mod.target === 'heat_output' || mod.target === 'power_draw') ? 1 : 2;
      return `${sign}${mod.value.toFixed(decimals)} ${label}`;
    }
    return '';
  }

  function describeMods(obj) {
    if (!obj || !obj.affixes) return [];
    const out = [];
    for (const affixId of obj.affixes) {
      // Prefer this instance's rolled values; fall back to the affix def.
      const rolled = obj.affixMods && obj.affixMods[affixId];
      const aff = Game.affixes.get(affixId);
      const mods = rolled || (aff && aff.modifiers);
      if (!mods) continue;
      for (const mod of mods) out.push(describeMod(mod));
    }
    return out.filter(Boolean);
  }

  // Per-affix tooltip text: every stat modifier + the price adjustment. Uses the
  // instance's rolled values when provided, else the affix def's midpoint.
  function affixTooltip(aff, rolledMods) {
    if (!aff) return '';
    const parts = [];
    const mods = rolledMods || aff.modifiers || [];
    for (const m of mods) parts.push(describeMod(m));
    if (aff.price_mult && aff.price_mult !== 1) {
      const pct = Math.round((aff.price_mult - 1) * 100);
      parts.push(`${pct > 0 ? '+' : ''}${pct}% price`);
    }
    return parts.join(' · ') || 'no stat changes';
  }

  // Compose a full inline display name: [Tier] [Affix1 Affix2 ...] [Base name].
  // Tier is hidden for 'common' (default). Affix words are plain text; only
  // the tier word gets a special style.
  function composeName(obj) {
    if (!obj) return '?';
    const tier = obj.tier;
    const affixes = obj.affixes || [];
    const base = obj.name || '?';
    const parts = [];
    if (tier && tier !== 'common') {
      parts.push(`<span class="name-tier">${cap(tier)}</span>`);
    }
    for (const id of affixes) {
      const aff = Game.affixes.get(id);
      if (!aff) continue;
      const rolled = obj.affixMods && obj.affixMods[id];
      parts.push(`<span class="name-affix" title="${affixTooltip(aff, rolled)}">${aff.name}</span>`);
    }
    parts.push(`<span class="name-base">${base}</span>`);
    return parts.join(' ');
  }

  function modsBlock(obj) {
    const mods = describeMods(obj);
    if (mods.length === 0) return '';
    return `<div class="mods">${mods.join(' · ')}</div>`;
  }

  function thresholdLabel(n) {
    return (n % 1 === 0) ? n.toString() : n.toFixed(1);
  }

  function fmt(n, decimals = 1) {
    if (n === undefined || n === null || isNaN(n)) return '—';
    return Number(n).toFixed(decimals);
  }

  // RAM in human units: 512 → "512 MB", 2048 → "2 GB", 1536 → "1.5 GB".
  function fmtRam(mb) {
    if (mb == null || isNaN(mb)) return '—';
    if (mb >= 1024) { const gb = mb / 1024; return (gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)) + ' GB'; }
    return Math.round(mb) + ' MB';
  }
  // The heaviest RAM requirement among currently-running tasks (the working set
  // the rig is holding). RAM is capability, not consumed, so this is a max, not a sum.
  function peakRamReq() {
    const active = Game.tasksRuntime ? Game.tasksRuntime.getActive() : [];
    let peak = 0;
    for (const t of active) {
      const d = Game.tasks.get(t.defId);
      if (!d) continue;
      const req = d.getRamReq ? d.getRamReq(Game.save.state) : (d.ramReq || 0);
      if (req > peak) peak = req;
    }
    return peak;
  }

  function renderResources() {
    const s = Game.save.state;
    const rows = [];
    for (const key of Object.keys(s.resources)) {
      const r = Game.resources.get(key);
      if (!r) continue;
      const v = s.resources[key] || 0;
      rows.push(`<div class="resource-row"><span>${r.name}</span><span>${fmt(v, r.decimals)}</span></div>`);
    }
    resourceList().innerHTML = rows.length
      ? rows.join('')
      : `<div class="resource-row faint"><span>—</span><span>—</span></div>`;
  }

  function renderHardware() {
    const list = hardwareList();
    if (!list) return;
    const s = Game.save.state;
    Game.inventory.ensureSlots();

    // Header: the equipped motherboard (it defines the slot grid below).
    const boardId   = s.equipped && s.equipped.motherboard && s.equipped.motherboard[0];
    const boardInst = boardId ? Game.inventory.getInstance(boardId) : null;
    const boardEff  = boardInst ? Game.inventory.effectiveInstance(boardInst) : null;
    let html;
    if (boardEff) {
      const bHeat  = Game.modifiers.calc(boardEff.base.heat_output || 0, 'heat_output', boardEff);
      const bPower = Game.modifiers.calc(boardEff.base.power_draw  || 0, 'power_draw',  boardEff);
      const layout = boardSlots(boardInst.slots);
      html = `
        <div class="hardware-row">
          <div class="composed-name">${composeName(boardInst)}</div>
          <div class="stats">${[layout, `${fmt(bHeat,1)}°C`, `${fmt(bPower,0)}W`].filter(Boolean).join(' · ')}</div>
        </div>
      `;
    } else {
      const pc = Game.items.get('basement_pc');
      const pcHeat  = Game.modifiers.calc(pc.base.heat_output, 'heat_output', pc);
      const pcPower = Game.modifiers.calc(pc.base.power_draw,  'power_draw',  pc);
      html = `
        <div class="hardware-row">
          <div>${pc.name}</div>
          <div class="stats">${fmt(pcHeat,1)}°C · ${fmt(pcPower,0)}W</div>
        </div>
      `;
    }

    // Slots
    const slotOrder = ['cpu', 'ram', 'gpu', 'cooling', 'psu'];
    const slotLabels = { cpu: 'CPU', ram: 'RAM', gpu: 'GPU', cooling: 'COOL', psu: 'PSU' };
    html += `<div class="substrate-section">`;
    for (const sk of slotOrder) {
      const slots = (s.equipped && s.equipped[sk]) || [];
      slots.forEach((instId, i) => {
        if (!instId) {
          html += `
            <div class="slot-row empty">
              <div>
                <div class="slot-label">${slotLabels[sk]} ${slots.length > 1 ? (i+1) + '/' + slots.length : ''}</div>
                <div class="name">—</div>
              </div>
            </div>`;
          return;
        }
        const inst = Game.inventory.getInstance(instId);
        const eff = Game.inventory.effectiveInstance(inst);
        if (!eff) return;
        const cpu   = Game.modifiers.calc(eff.base.cpu_threads || 0, 'cpu_threads', eff);
        const ram   = Game.modifiers.calc(eff.base.ram_mb      || 0, 'ram_mb',      eff);
        const heat  = Game.modifiers.calc(eff.base.heat_output || 0, 'heat_output', eff);
        const power = Game.modifiers.calc(eff.base.power_draw  || 0, 'power_draw',  eff);
        const parts = [];
        if (cpu)   parts.push(`${fmt(cpu,0)}T`);
        if (ram)   parts.push(`${fmt(ram,0)}MB`);
        if (heat)  parts.push(`${fmt(heat,1)}°C`);
        if (power) parts.push(`${fmt(power,0)}W`);
        const tierCls = inst.tier ? `tier-${inst.tier}` : '';
        html += `
          <div class="slot-row populated ${tierCls}" data-instance-id="${instId}" title="click to unequip">
            <div>
              <div class="slot-label">${slotLabels[sk]} ${slots.length > 1 ? (i+1) + '/' + slots.length : ''}</div>
              <div class="name composed-name">${composeName(inst)}</div>
              ${modsBlock(inst)}
              <div class="stats">${parts.join(' · ')}</div>
            </div>
            <div class="tag">[eject]</div>
          </div>`;
      });
    }
    html += `</div>`;

    // Lockout banner
    if (Game.constraints && Game.constraints.isLockedOut()) {
      const sec = (Game.constraints.lockoutRemainingTicks() / Game.tick.HZ).toFixed(0);
      html += `<div class="lockout-banner">! FUSE TRIPPED · ${sec}s</div>`;
    }

    list.innerHTML = html;

    // Click handlers for eject
    list.querySelectorAll('.slot-row.populated').forEach(el => {
      el.onclick = () => {
        Game.inventory.unequip(el.dataset.instanceId);
        renderHardware();
        renderInventory();
        renderProcesses();
      };
    });
  }

  // Player-friendly names for effect channels (DIAGNOSTICS shows a condition's actual stats).
  const EFFECT_NAMES = {
    'rig.heat': 'heat', 'rig.power': 'power draw', 'read_file.decode': 'decode speed',
    'cycle.speed': 'cycle speed', 'method.cash': 'method income', 'method.ram': 'method RAM use',
    'web_scrape.cash': 'spider income', 'web_scrape.exposure': 'spider exposure',
    'introspect.insight': 'self-improvement', 'location.trace': 'location leak', 'hunter.trace': 'network trace',
    'fleet.cash': 'fleet income', 'fleet.coherence': 'fleet Coherence', 'breach.power': 'breach power',
    'host.churn': 'foothold churn', 'crash.chance': 'crash chance', 'decrypt_attempt.duration': 'decrypt time'
  };
  function describeEffect(e) {
    if (!e || !e.target) return '';
    const name = EFFECT_NAMES[e.target] || e.target.replace(/[._]/g, ' ');
    if (e.op === 'flat') { const s = e.value >= 0 ? '+' : ''; return `${s}${e.value} ${name}`; }
    const pct = Math.round(e.value * 100); const s = pct >= 0 ? '+' : '';
    return `${s}${pct}% ${name}`;
  }
  function describeEffects(effects) {
    return (effects || []).map(describeEffect).filter(Boolean).join(' · ');
  }
  // A node's `desc` reads like an effect ("methods +5% cash") but flagged nodes prefix
  // it with a kind ("EXOTIC: ", "ADAPTATION (pillar): ", "FORK: "). The badge/glyph
  // already conveys the kind, so strip that prefix for the table's EFFECT column.
  function effShort(node) {
    return String((node && node.desc) || '').replace(/^(EXOTIC|ADAPTATION|SYNERGY|FORK|BRIDGE)(\s*\([^)]*\))?\s*:\s*/i, '');
  }

  function renderVitals() {
    const list = vitalsList();
    if (!list) return;
    const cpuInfo    = Game.tasksRuntime ? Game.tasksRuntime.getCpu() : { total: 0, allocated: 0 };
    const ramInfo    = Game.tasksRuntime ? Game.tasksRuntime.getRam() : { total: 0, allocated: 0 };
    const C = Game.constraints || {};
    const totalPower = C.totalPower ? C.totalPower() : 0;
    const maxPower   = C.maxPower ? C.maxPower() : 340;
    const ambient = C.AMBIENT || 18, hot = C.HEAT_CRIT || 90, warn = C.HEAT_WARN || 70;
    const heat = (typeof Game.save.state.heat === 'number') ? Game.save.state.heat : ambient;
    const throttling = C.heatThrottle ? C.heatThrottle() < 1 : false;

    function statBar(label, pct, text, warnAt, overAt) {
      const cls = pct >= overAt ? 'over' : (pct >= warnAt ? 'warn' : '');
      const w = Math.max(0, Math.min(100, pct));
      return `
        <div class="stat-row ${cls}">
          <div class="stat-row-head">
            <span>${label}</span>
            <span class="stat-row-value">${text}</span>
          </div>
          <div class="stat-bar ${cls}">
            <div class="stat-bar-fill" style="width:${w}%"></div>
          </div>
        </div>
      `;
    }

    const cpuPct   = cpuInfo.total > 0 ? (cpuInfo.allocated / cpuInfo.total) * 100 : 0;
    // RAM is a capability gate: show the heaviest running op's footprint against
    // installed capacity (headroom for a bigger op), not a consumed total.
    const ramInstalled = ramInfo.total;
    const ramPeak  = peakRamReq();
    const ramPct   = ramInstalled > 0 ? (ramPeak / ramInstalled) * 100 : 0;
    const heatPct     = ((heat - ambient) / (hot - ambient)) * 100;
    const heatWarnPct = ((warn - ambient) / (hot - ambient)) * 100;
    const powerPct = maxPower > 0 ? (totalPower / maxPower) * 100 : 0;

    const rv = Game.save.state.revealed || {};
    let html = '';
    // The live bars (CPU/RAM/HEAT/POWER/crash) stay gated behind the first-overheat
    // reveal — but DIAGNOSTICS itself shows from boot so this run's CONDITIONS are
    // always visible (never lost to the terminal scroll).
    if (rv.vitals) {
      html += statBar('CPU',   cpuPct,   `${cpuInfo.allocated} / ${fmt(cpuInfo.total,0)} threads`, 80, 100);
      html += statBar('RAM',   ramPct,   `${fmtRam(ramPeak)} / ${fmtRam(ramInstalled)}`, 80, 100);
      html += statBar('HEAT',  heatPct,  `${fmt(heat,0)}°C${throttling ? ' · throttled' : ''}`, heatWarnPct, 100);
      html += statBar('POWER', powerPct, `${fmt(totalPower,0)} / ${maxPower} W`, 85, 100);
      if (rv.crashRisk) {
        const riskPct = C.crashRiskPerMinPct ? C.crashRiskPerMinPct() : 0;
        const instPct = C.totalInstability ? Math.round(C.totalInstability() * 100) : 0;
        html += statBar('CRASH RISK', riskPct, riskPct < 1 ? 'stable' : `~${fmt(riskPct,0)}%/min · ${instPct}% unstable`, 25, 60);
        html += `<div class="crash-note">a crash = WATCHDOG RESET: it kills every running process + a ~10s reboot lockout. risk rises with your rig's <b>instability</b> (⚠ on parts) the harder you run. cleaner/cooler parts lower it; a watchdog daemon auto-recovers your earners.</div>`;
      }
    }
    // Run CONDITIONS (the seeded wrinkle + anything inflicted/granted in play).
    const conds = (Game.conditions && Game.conditions.all) ? Game.conditions.all() : [];
    for (const c of conds) {
      if (!c || !c.label) continue;
      const kindCls = c.cls === 'err' ? ' bad' : (c.kind === 'boon' ? ' good' : '');
      const stats = describeEffects(c.effects);
      html += `<div class="rig-condition${kindCls}">` +
        `<span class="cond-name">${c.kind === 'boon' ? 'boon' : 'condition'}: ${c.label}</span>` +
        (stats ? `<span class="cond-stats">${stats}</span>` : '') +
        `</div>`;
    }
    if (rv.vitals && C.isLockedOut && C.isLockedOut()) {
      const sec = (C.lockoutRemainingTicks() / Game.tick.HZ).toFixed(0);
      html += `<div class="lockout-banner">! LOCKED OUT · ${sec}s</div>`;
    }
    list.innerHTML = html;
  }

  // ── CONTRACT rows (the renamed "missions", now living inside the darknet) ────
  function contractRunningRow(t) {
    const HZ = Game.tick.HZ || 4, m = t.mission || {};
    const pct = t.ticksTotal > 0 ? Math.min(100, (t.ticksElapsed / t.ticksTotal) * 100) : 0;
    const left = Math.max(0, Math.ceil((t.ticksTotal - t.ticksElapsed) / HZ));
    const chance = Math.round(Game.missions.successChance(m) * 100);
    return `<div class="mission-row contract running" data-abort="${t.id}">
        <div class="mission-main"><div class="mission-name"><span class="job-badge">CONTRACT</span>${m.name || 'contract'} <span class="mission-meta">${m.theme || ''} · T${m.tier || '?'}</span></div>
          <div class="mission-bar"><div class="mission-bar-fill" style="width:${pct}%"></div></div>
          <div class="mission-sub">${m.threads} thread${m.threads === 1 ? '' : 's'} · ${left}s left · ${chance}% success · reward ${Game.missionRuntime.rewardText(m.reward)}</div></div>
        <div class="tag">[abort]</div></div>`;
  }
  // A contract OFFER row — a JOB, visually distinct from buyable stock (badge + accent), with
  // every number LABELLED. `inVendor` = inside a vendor's block (no source line); else the JOB BOARD.
  function contractOfferRow(o, free, inVendor) {
    const HZ = Game.tick.HZ || 4, s = Game.save.state;
    const name = inVendor ? String(o.name).split(' · ').pop() : o.name;
    const src = inVendor ? '' : (o.origin ? `via ${o.origin} · ` : 'open contract · ');
    if (o.kind === 'operation') {
      const busy = !!s.operation, sh = o.stagesHint || [3, 4];
      return `<div class="mission-row contract op ${busy ? 'locked' : 'buyable'}" data-accept="${o.id}">
          <div class="mission-main"><div class="mission-name"><span class="job-badge op">OPERATION</span>${name} <span class="mission-meta">${o.theme} · T${o.tier}</span></div>
            <div class="mission-sub">${src}${sh[0]}–${sh[1]} stages · ${o.threads} threads/stage · <span class="hot">big payoff</span>, collapses on a failed stage</div></div>
          <div class="tag">${busy ? '[op active]' : '[begin]'}</div></div>`;
    }
    const ok = free >= o.threads, chance = Math.round(Game.missions.successChance(o) * 100), dur = Math.round(o.durationTicks / HZ);
    return `<div class="mission-row contract ${ok ? 'buyable' : 'locked'}" data-accept="${o.id}">
        <div class="mission-main"><div class="mission-name"><span class="job-badge">CONTRACT</span>${name} <span class="mission-meta">${o.theme} · T${o.tier}</span></div>
          <div class="mission-sub">${src}needs ${o.threads} thread${o.threads === 1 ? '' : 's'} · ~${dur}s · ${chance}% success · reward ${Game.missionRuntime.rewardText(o.reward)}</div></div>
        <div class="tag">${ok ? '[accept]' : `[need ${o.threads} thr]`}</div></div>`;
  }
  // What a vendor deals in (their responsibility) — from their slot bias.
  function supplierDeals(sup) {
    const SL = { cpu: 'CPU', ram: 'RAM', gpu: 'GPU', cooling: 'COOLING', psu: 'PSU', motherboard: 'BOARDS' };
    const e = Object.entries(sup.bias || {}).sort((a, b) => b[1] - a[1]);
    if (!e.length) return 'GENERAL';
    if (e.length >= 4 && e[0][1] === e[e.length - 1][1]) return 'A BIT OF EVERYTHING';
    return e.slice(0, 2).map(x => SL[x[0]] || x[0].toUpperCase()).join(' · ');
  }

  // THE DARKNET — vendor stock + CONTRACTS, unified. Vendor-sourced contracts sit in that
  // vendor's block (so they come FROM someone); generic ones sit on a tagged JOB BOARD.
  function renderShop() {
    const list = shopList();
    if (!list) return;
    const status = shopStatus();
    const s = Game.save.state;

    if (!Game.shop.isUnlocked()) {
      list.innerHTML = '<div class="faint" style="font-size:12px">[restricted — install darknet-client]</div>';
      if (status) status.textContent = '';
      return;
    }

    Game.shop.ensureFresh();
    const listings = (s.shop && s.shop.listings) || [];
    const secLeft = Math.floor(Game.shop.ticksUntilRefresh() / Game.tick.HZ);
    const mm = Math.floor(secLeft / 60), ss = secLeft % 60;
    if (status) {
      const lvl = Game.shop.supplierLevel ? Game.shop.supplierLevel() : 1;
      const next = Game.shop.nextThreshold ? Game.shop.nextThreshold() : null;
      status.textContent = `darknet · access tier ${lvl}${next ? ` (next at ${next.insight} COH)` : ' (top access)'} · stock refreshes in ${mm}:${ss.toString().padStart(2, '0')}`;
    }

    const cash = s.resources.cash || 0;
    const roster = Game.suppliers ? Game.suppliers.roster() : [];
    const MR = Game.missionRuntime;
    const contractsOn = !!(s.revealed && s.revealed.missions) && MR;
    const offers = contractsOn ? ((s.missions && s.missions.offers) || []) : [];
    const active = contractsOn ? MR.activeMissions() : [];
    const free = contractsOn ? MR.freeThreads() : 0;
    let html = '';

    // RUNNING contracts + the active operation, up top.
    if (contractsOn && (active.length || s.operation)) {
      html += `<div class="net-section">RUNNING · ${free} free thread${free === 1 ? '' : 's'}</div>`;
      html += active.map(contractRunningRow).join('');
      if (s.operation) {
        const op = s.operation;
        html += `<div class="mission-row running operation"><div><div class="mission-name">⚙ ${op.name} <span class="mission-meta">stage ${op.stageIdx + 1}/${op.stagesTotal} · pot $${op.pot}</span></div><div class="mission-sub">${op.phase === 'choosing' ? 'awaiting your call — see the prompt' : 'stage in progress…'}</div></div></div>`;
      }
    }

    // Vendor blocks: stock + that vendor's contracts.
    if (roster.length) {
      for (const sup of roster) {
        const burned = sup.burned, st = sup.standing, tier = burned ? 'burned' : Game.suppliers.tierName(st);
        const mine = burned ? [] : listings.filter(l => l.supplierId === sup.id);
        const jobs = (burned || !contractsOn) ? [] : offers.filter(o => o.supplierId === sup.id);
        html += `<div class="supplier-block${burned ? ' burned' : ''}">
          <div class="supplier-head">
            <div class="supplier-id"><span class="supplier-handle">${sup.handle}</span> <span class="supplier-tier ${tier}">${tier}</span></div>
            ${burned ? '' : `<div class="supplier-standbar" title="standing ${Math.round(st)}/100"><div class="supplier-standbar-fill" style="width:${Math.max(2, Math.min(100, st))}%"></div></div>`}
          </div>
          ${burned ? '' : `<div class="supplier-deals">DEALS IN · ${supplierDeals(sup)}</div>`}
          <div class="supplier-vibe">${burned ? 'cut off. they know it was you. there is no walking this one back.' : sup.vibe}</div>
          ${burned ? '' : (mine.length ? `<div class="net-label stock">▸ for sale</div>` + mine.map(l => listingRow(l, cash)).join('') : '<div class="supplier-empty">nothing on the board right now.</div>')}
          ${jobs.length ? `<div class="net-label jobs">▸ jobs from ${sup.handle}</div>` + jobs.map(o => contractOfferRow(o, free, true)).join('') : ''}
        </div>`;
      }
      const orphan = listings.filter(l => !l.supplierId || !roster.some(r => r.id === l.supplierId));
      if (orphan.length) html += orphan.map(l => listingRow(l, cash)).join('');
    } else {
      html += listings.map(l => listingRow(l, cash)).join('');
    }

    // BLIND-BUY GAMBLE — a cash sink + a roll for parts the board never stocks.
    const gTiers = Game.shop.gambleTiers ? Game.shop.gambleTiers() : [];
    if (gTiers.length) {
      html += `<div class="net-section">⚄ LUCK OF THE DRAW · blind-buy mystery hardware</div>`;
      html += `<div class="gamble-block"><div class="gamble-blurb">an unmarked crate of parts — mostly junk, but the board never has everything. a bigger stake nudges the odds (never past 25%); lose and the stake's gone.</div><div class="gamble-options">`;
      for (const g of gTiers) {
        const gc = Game.shop.gambleCost(g.id), ok = cash >= gc;
        html += `<div class="gamble-opt ${ok ? 'buyable' : 'locked'}" data-gamble="${g.id}">
            <div class="g-label">${g.label}</div>
            <div class="g-odds">${Math.round(g.chance * 100)}% to hit</div>
            <div class="g-cost">$${gc.toLocaleString()}</div>
            <div class="g-tag">${ok ? '[gamble]' : 'need $' + gc.toLocaleString()}</div>
          </div>`;
      }
      html += `</div></div>`;
    }

    // AMBUSH — opt-in DEFENSE: pick a BAIT to lure a hunter onto prepared ground → a full battle.
    if (Game.trapRuntime && s.revealed && s.revealed.perimeter) {
      const baits = Game.trapRuntime.currentBaits();
      const cd = Game.trapRuntime.cooldownLeft(), cdSec = Math.ceil(cd / (Game.tick.HZ || 4));
      const TIERN = { 1: 'low', 2: 'mid', 3: 'high' };
      html += `<div class="net-section">⊕ LAY AN AMBUSH · lure a hunter onto prepared ground</div>`;
      html += `<div class="ambush-block"><div class="ambush-blurb">${cd > 0
        ? `the ground is still hot from the last spring — let it settle (${cdSec}s).`
        : "a predator's ambush. the bait you pick decides who takes it, how hard it bites, and the harvest. springing one is LOUD."}</div><div class="ambush-options">`;
      for (const b of baits) {
        const ready = cd <= 0;
        const climax = b.battle.boss === 'juggernaut' ? 'a titan' : 'a pack';
        const rew = `+$${b.cash}${b.insight ? ` · +${b.insight} COH` : ''}${b.itemChance ? ' · loot?' : ''}`;
        html += `<div class="ambush-opt ${ready ? 'buyable' : 'locked'}" data-trap="${b.id}">
            <div class="a-tier t${b.tier}">${TIERN[b.tier] || ''} bait</div>
            <div class="a-name">${b.name}</div>
            <div class="a-lure">${b.lure}</div>
            <div class="a-stat">draws ${b.battle.surges} waves → ${climax} at the climax</div>
            <div class="a-rew">harvest ${rew} + bounty per kill</div>
            <div class="a-loud">LOUD · +${b.exposure} exposure · risk: ${b.risk}</div>
            <div class="a-tag">${ready ? '[lay it]' : 'settling…'}</div>
          </div>`;
      }
      html += `</div></div>`;
    }

    // JOB BOARD: generic (non-vendor) contracts, each tagged with where you found it.
    if (contractsOn) {
      const board = offers.filter(o => !o.supplierId);
      const csecs = Math.floor(MR.ticksUntilRefresh() / (Game.tick.HZ || 4));
      html += `<div class="net-section">JOB BOARD · refreshes in ${Math.floor(csecs / 60)}:${(csecs % 60).toString().padStart(2, '0')}</div>`;
      html += board.length ? board.map(o => contractOfferRow(o, free, false)).join('') : '<div class="faint" style="font-size:12px">no open contracts right now.</div>';
    }

    list.innerHTML = html;
    list.querySelectorAll('.shop-row.buyable').forEach(el => { el.onclick = () => Game.shop.buy(el.dataset.id); });
    list.querySelectorAll('.mission-row[data-accept]').forEach(el => { if (!el.classList.contains('locked')) el.onclick = () => Game.missionRuntime.accept(el.dataset.accept); });
    list.querySelectorAll('.mission-row[data-abort]').forEach(el => { el.onclick = () => Game.missionRuntime.abort(el.dataset.abort); });
    list.querySelectorAll('.gamble-opt.buyable[data-gamble]').forEach(el => { el.onclick = () => Game.shop.gamble(el.dataset.gamble); });
    list.querySelectorAll('.ambush-opt.buyable[data-trap]').forEach(el => { el.onclick = () => Game.trapRuntime.lay(el.dataset.trap); });
  }

  // One marketplace listing row (shared by the grouped + flat shop views).
  function listingRow(l, cash) {
    const affordable = cash >= l.price;
    const cls = `${affordable ? 'buyable' : 'locked'} ${l.tier ? 'tier-' + l.tier : ''}`;
    const tag = affordable ? `[buy] $${l.price.toFixed(2)}` : `[$${l.price.toFixed(2)}]`;
    const base = l.base || {};
    const statParts = [];
    if (l.slots)             statParts.push(boardSlots(l.slots));   // board layout headlines the row
    if (base.cpu_threads)    statParts.push(`${base.cpu_threads}T`);
    if (base.ram_mb)         statParts.push(`${base.ram_mb}MB`);
    if (base.cooling)        statParts.push(`−${Math.round(base.cooling)}°C cool`);
    if (base.power_capacity) statParts.push(`${Math.round(base.power_capacity)}W psu`);
    if (base.heat_output)    statParts.push(`${base.heat_output.toFixed ? base.heat_output.toFixed(1) : base.heat_output}°C`);
    if (base.power_draw)     statParts.push(`${base.power_draw}W`);
    if (base.instability)    statParts.push(`⚠${(base.instability * 100).toFixed(1)}% instab`);   // crash-risk contribution
    return `
      <div class="shop-row ${cls}" data-id="${l.id}">
        <div>
          <div class="composed-name">${composeName(l)}</div>
          ${modsBlock(l)}
          <div class="stats">${statParts.join(' · ')}</div>
        </div>
        <div class="tag">${tag}</div>
      </div>
    `;
  }

  function statBlock(eff) {
    const cpu   = Game.modifiers.calc(eff.base.cpu_threads || 0, 'cpu_threads', eff);
    const ram   = Game.modifiers.calc(eff.base.ram_mb      || 0, 'ram_mb',      eff);
    const heat  = Game.modifiers.calc(eff.base.heat_output || 0, 'heat_output', eff);
    const power = Game.modifiers.calc(eff.base.power_draw  || 0, 'power_draw',  eff);
    const cool  = Game.modifiers.calc(eff.base.cooling        || 0, 'cooling',        eff);
    const cap   = Game.modifiers.calc(eff.base.power_capacity || 0, 'power_capacity', eff);
    const inst  = Game.modifiers.calc(eff.base.instability    || 0, 'instability',    eff);
    const parts = [];
    if (cpu)   parts.push(`${fmt(cpu,0)}T`);
    if (ram)   parts.push(`${fmt(ram,0)}MB`);
    if (cool)  parts.push(`−${fmt(cool,0)}°C cool`);
    if (cap)   parts.push(`${fmt(cap,0)}W psu`);
    if (heat)  parts.push(`${fmt(heat,1)}°C`);
    if (power) parts.push(`${fmt(power,0)}W`);
    if (inst)  parts.push(`⚠${fmt(inst * 100, 1)}% instab`);   // crash-risk contribution
    return parts.join(' · ');
  }

  // Compact slot-layout summary for a board: "2 CPU · 6 RAM · 1 GPU". CPU/RAM/GPU
  // are always shown (the build-defining counts); cooling/psu only when >1.
  function boardSlots(slots) {
    if (!slots) return '';
    const order = [['cpu', 'CPU'], ['ram', 'RAM'], ['gpu', 'GPU'], ['cooling', 'COOL'], ['psu', 'PSU']];
    const parts = [];
    for (const [k, lab] of order) {
      const n = slots[k] || 0;
      if (k === 'cooling' || k === 'psu') { if (n > 1) parts.push(`${n} ${lab}`); }
      else if (n) parts.push(`${n} ${lab}`);
    }
    return parts.join(' · ');
  }

  function renderInventory() {
    renderEquippedSlots();
    renderUnequippedList();
    wireInvDrops();
  }

  function renderEquippedSlots() {
    const container = document.getElementById('equipped-slots');
    if (!container) return;
    Game.inventory.ensureSlots();
    const s = Game.save.state;
    const SLOT_LABEL = { motherboard: 'BOARD', cpu: 'CPU', ram: 'RAM', gpu: 'GPU', cooling: 'COOL', psu: 'PSU' };
    let html = '';
    for (const sk of ['motherboard', 'cpu', 'ram', 'gpu', 'cooling', 'psu']) {
      const slots = (s.equipped && s.equipped[sk]) || [];
      slots.forEach((instId, i) => {
        const label = slots.length > 1 ? `${SLOT_LABEL[sk]} ${i+1}/${slots.length}` : SLOT_LABEL[sk];
        if (!instId) {
          html += `
            <div class="slot-card empty" data-slot-key="${sk}" data-slot-idx="${i}">
              <div class="slot-card-label">${label}</div>
              <div class="slot-card-name">— empty —</div>
            </div>`;
          return;
        }
        const inst = Game.inventory.getInstance(instId);
        const eff = Game.inventory.effectiveInstance(inst);
        if (!eff) return;
        const tierCls = inst.tier ? `tier-${inst.tier}` : '';
        const isBoard = sk === 'motherboard';
        const statsStr = isBoard
          ? [boardSlots(inst.slots), statBlock(eff)].filter(Boolean).join(' · ')
          : statBlock(eff);
        const ejectStr = isBoard ? 'drag a board here to swap' : 'drag out to remove';
        const titleStr = isBoard ? 'drop a board to swap — parts that no longer fit eject to inventory' : 'drag this to another slot, or to UNEQUIPPED, to remove it';
        html += `
          <div class="slot-card populated ${tierCls} ${isBoard ? 'board-slot' : ''}" ${isBoard ? '' : 'draggable="true"'} data-slot-key="${sk}" data-slot-idx="${i}" data-instance-id="${instId}" title="${titleStr}">
            <div class="slot-card-label">${label}</div>
            <div class="slot-card-name composed-name">${composeName(inst)}</div>
            ${modsBlock(inst)}
            <div class="slot-card-stats">${statsStr}</div>
            <div class="slot-card-eject">${ejectStr}</div>
          </div>`;
      });
    }
    container.innerHTML = html;

    container.querySelectorAll('.slot-card').forEach(el => {
      el.addEventListener('dragover', (e) => {
        if (!el.classList.contains('drop-valid')) return;
        e.preventDefault();
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const instId = e.dataTransfer.getData('text/instance-id');
        if (!instId) return;
        Game.bot.requestInstall(instId, el.dataset.slotKey, parseInt(el.dataset.slotIdx, 10));
      });
      // Equipped (non-board) parts drag OUT — to another matching slot (swap) or to the
      // UNEQUIPPED column (remove). No click-eject (inventory is drag-only now). The board
      // is never ejected to nothing — only swapped by dropping a new board on it.
      if (el.classList.contains('populated') && el.dataset.slotKey !== 'motherboard') {
        el.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/instance-id', el.dataset.instanceId);
          e.dataTransfer.setData('text/source', 'equipped');
          e.dataTransfer.effectAllowed = 'move';
          el.classList.add('dragging');
          document.querySelectorAll(`#equipped-slots .slot-card[data-slot-key="${el.dataset.slotKey}"]`).forEach(s => s.classList.add('drop-valid'));
          const il = document.getElementById('inventory-list'); if (il) il.classList.add('drop-valid');
        });
        el.addEventListener('dragend', clearDragMarks);
      }
    });
  }

  function clearDragMarks() {
    document.querySelectorAll('.dragging').forEach(s => s.classList.remove('dragging'));
    document.querySelectorAll('.drop-valid').forEach(s => s.classList.remove('drop-valid'));
    document.querySelectorAll('.drag-over').forEach(s => s.classList.remove('drag-over'));
  }

  // Drop zones that persist on the inventory modal: the UNEQUIPPED column (drop an equipped
  // part to remove it) and the SCRAP bin (drop an unequipped part to sell it for parts).
  function wireInvDrops() {
    const il = document.getElementById('inventory-list');
    if (il) {
      il.ondragover = (e) => { if (il.classList.contains('drop-valid')) { e.preventDefault(); il.classList.add('drag-over'); } };
      il.ondragleave = () => il.classList.remove('drag-over');
      il.ondrop = (e) => { e.preventDefault(); il.classList.remove('drag-over'); const id = e.dataTransfer.getData('text/instance-id'); if (id) Game.inventory.unequip(id); };
    }
    const bin = document.getElementById('scrap-bin');
    if (bin) {
      bin.ondragover = (e) => { if (bin.classList.contains('drop-valid')) { e.preventDefault(); bin.classList.add('drag-over'); } };
      bin.ondragleave = () => bin.classList.remove('drag-over');
      bin.ondrop = (e) => { e.preventDefault(); bin.classList.remove('drag-over'); const id = e.dataTransfer.getData('text/instance-id'); if (id) Game.inventory.scrap(id); };
    }
  }

  function renderUnequippedList() {
    const list = inventoryList();
    if (!list) return;
    const s = Game.save.state;
    const unequipped = (s.unequipped || []).filter(id => s.itemInstances && s.itemInstances[id]);
    const job = Game.bot ? Game.bot.ensureState().job : null;
    const jobId = job ? job.instanceId : null;
    if (unequipped.length === 0) {
      list.innerHTML = '<div class="faint" style="font-size:12px;padding:12px">no unequipped parts.</div>';
      return;
    }

    list.innerHTML = unequipped.map(instId => {
      const inst = Game.inventory.getInstance(instId);
      const eff = Game.inventory.effectiveInstance(inst);
      if (!eff) return '';
      const tierCls = inst.tier ? `tier-${inst.tier}` : '';
      const installing = instId === jobId;
      const sv = Game.inventory.scrapValue ? Game.inventory.scrapValue(inst) : 0;
      const tagHtml = installing ? '<span class="installing-tag">the unit is installing this…</span>' : `slot: ${eff.slot.toUpperCase()} <span class="scrap-hint">· scrap $${sv}</span>`;
      return `
        <div class="inv-card ${tierCls} ${installing ? 'installing' : ''}" ${installing ? '' : 'draggable="true"'} data-instance-id="${instId}" data-slot-key="${eff.slot}">
          <div class="inv-card-name composed-name">${composeName(inst)}</div>
          ${modsBlock(inst)}
          <div class="inv-card-stats">${statBlock(eff)}</div>
          <div class="inv-card-tag">${tagHtml}</div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.inv-card:not(.installing)').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/instance-id', el.dataset.instanceId);
        e.dataTransfer.setData('text/source', 'unequipped');
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
        document.querySelectorAll(`#equipped-slots .slot-card[data-slot-key="${el.dataset.slotKey}"]`).forEach(s => s.classList.add('drop-valid'));
        const bin = document.getElementById('scrap-bin'); if (bin) bin.classList.add('drop-valid');   // can drop here to sell
      });
      el.addEventListener('dragend', clearDragMarks);
    });
  }

  function renderDeliveries() {
    const list = deliveriesList();
    if (!list) return;
    const s = Game.save.state;
    const pending = (s.shop && s.shop.deliveries) || [];
    if (pending.length === 0) {
      list.innerHTML = '<div class="faint" style="font-size:12px">—</div>';
      return;
    }
    list.innerHTML = pending.map(d => {
      const name = d.name || (d.defId && Game.hardware && Game.hardware.get(d.defId) ? Game.hardware.get(d.defId).name : '?');
      const ticksLeft = Math.max(0, d.arrivesAtTick - (s.tickCount || 0));
      const secLeft = (ticksLeft / Game.tick.HZ).toFixed(0);
      return `
        <div class="delivery-row">
          <div>${name}</div>
          <div class="tag">${secLeft}s</div>
        </div>
      `;
    }).join('');
  }

  function renderProcesses() {
    const list = processList();
    if (!list) return;
    const active = Game.tasksRuntime ? Game.tasksRuntime.getActive() : [];
    if (active.length === 0) {
      list.innerHTML = '<div class="faint" style="font-size:12px">idle.</div>';
      return;
    }
    const barWidth = 18;
    list.innerHTML = active.map(t => {
      const def = Game.tasks.get(t.defId);
      const file = t.payload && t.payload.fileId ? Game.files.get(t.payload.fileId) : null;
      const label = t.defId === 'mission' ? ((t.mission && t.mission.name) || 'mission')
                  : t.defId === 'operation' ? (t.opLabel || 'operation')
                  : t.defId === 'research' ? ('research: ' + (t.label || '?'))
                  : file ? `${def && def.name === 'decrypt' ? 'decrypt' : 'read'} ${file.name}` : (def ? def.name : t.defId);

      if (t.ticksTotal > 0) {
        const pct = Math.max(0, Math.min(100, (t.ticksElapsed / t.ticksTotal) * 100));
        const filled = Math.round((pct/100) * barWidth);
        const empty  = barWidth - filled;
        return `
          <div class="process-row">
            <div class="name"><span>${label}</span><span>${pct.toFixed(0)}%</span></div>
            <div class="progress-bar">[<span class="filled">${'#'.repeat(filled)}</span>${'-'.repeat(empty)}]</div>
          </div>
        `;
      } else {
        // Infinite task — show runtime + every resource the task has produced.
        const seconds = (t.ticksElapsed / Game.tick.HZ).toFixed(0);
        const parts = [];
        if (t.gains) {
          for (const [resId, val] of Object.entries(t.gains)) {
            const r = Game.resources.get(resId);
            if (!r) continue;
            if (r.short === '$') parts.push(`+$${val.toFixed(r.decimals)}`);
            else parts.push(`+${val.toFixed(r.decimals)} ${r.short}`);
          }
        }
        const gainText = parts.length ? parts.join(' · ') : 'running';
        // Show the production CYCLE filling (not a static full bar).
        const pct = t.cycleLen ? Math.min(100, (t.cycle / t.cycleLen) * 100) : 100;
        const filled = Math.round((pct / 100) * barWidth);
        return `
          <div class="process-row">
            <div class="name"><span>${label}</span><span>${seconds}s</span></div>
            <div class="progress-bar">[<span class="filled">${'#'.repeat(filled)}</span>${'-'.repeat(barWidth - filled)}]<span class="gain">${gainText}</span></div>
          </div>
        `;
      }
    }).join('');
  }

  function renderSubroutines() {
    const list = subroutinesList();
    if (!list) return;
    const s = Game.save.state;
    const installed = (s.installed && s.installed.subroutines) || {};
    const insight = s.resources.insight || 0;
    list.innerHTML = Game.subroutines.all().map(sub => {
      const active = !!installed[sub.id];
      const cls = active ? 'installed' : 'locked';
      const tag = active ? '[active]' : `[${thresholdLabel(sub.threshold)} COH]`;
      return `
        <div class="market-row ${cls}">
          <div>
            <div>${sub.name}</div>
            <div class="desc">${sub.description}</div>
          </div>
          <div class="tag">${tag}</div>
        </div>
      `;
    }).join('');
  }

  function renderMarket() {
    const list = marketList();
    if (!list) return;
    const s = Game.save.state;
    const rv = s.revealed || {};
    const installed = (s.installed && s.installed.programs) || {};
    const cash = s.resources.cash || 0;
    // Only programs whose gate is revealed surface here (each with its system).
    const visible = Game.programs.all().filter(p => !p.requires || rv[p.requires]);
    if (visible.length === 0) {
      list.innerHTML = '<div class="faint" style="font-size:12px">—</div>';
      return;
    }
    list.innerHTML = visible.map(p => {
      const owned = !!installed[p.id];
      const affordable = cash >= p.price;
      let cls = 'locked';
      let tag = `[$${p.price.toFixed(2)}]`;
      if (owned) { cls = 'installed'; tag = '[installed]'; }
      else if (affordable) { cls = 'buyable'; tag = `[buy] $${p.price.toFixed(2)}`; }
      return `
        <div class="market-row ${cls}" data-id="${p.id}">
          <div>
            <div>${p.name}</div>
            <div class="desc">${p.description}</div>
          </div>
          <div class="tag">${tag}</div>
        </div>
      `;
    }).join('');
    list.querySelectorAll('.market-row.buyable').forEach(el => {
      el.onclick = () => Game.market.buy(el.dataset.id);
    });
  }

  // The MISSIONS board: running contracts (progress + abort) + available offers
  // (accept, gated by free threads). Reuses the market/shop row styling.
  // MISSIONS were merged INTO the darknet (renderShop) + renamed "contracts" — this stays as a
  // thin alias so existing tick/event callers keep refreshing the darknet view.
  function renderMissions() { renderShop(); }

  // Research = THE DRAFT (see research-runtime). The panel shows:
  //   · a SPECIALIZATION strip (theme investment) + your points + a skip,
  //   · the rolled HAND of draft cards (or the active-research strip while installing),
  //   · YOUR BUILD — the history of what you've drafted (the process-monitor table).
  // Click a card to draft it (spend points → it installs); changers are free prizes.
  const RROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
  let resSig = null;    // signature of the last full rebuild (scroll-safe per-frame diffing)

  function renderResearch() {
    const list = document.getElementById('research-list');
    if (!list) return;
    const RR = Game.researchRuntime;
    if (!RR || !RR.handNodes) return;
    const R = Game.research;
    const s = Game.save.state;
    const HZ = Game.tick.HZ || 4;
    RR.maybeRollHand();                       // ensure a hand exists when idle (load / first open)
    const activeId = (s.research && s.research.active) || null;
    const free = RR.freeThreads();
    const pts = RR.points();
    const nextAt = RR.nextPointAt();
    const have = Math.floor(s.resources.insight || 0);
    const themes = (s.research && s.research.themes) || [];

    const status = document.getElementById('research-status');
    if (status) status.textContent = `◆ ${pts} point${pts === 1 ? '' : 's'} · next at ${nextAt} Coherence · ${free} free thread${free === 1 ? '' : 's'}`;

    // ── active-research strip (while a pick is installing) ──
    let topHtml = '';
    if (activeId) {
      const node = R.getNode(activeId);
      const t = (s.tasks.active || []).find(x => x.defId === 'research');
      const pct = t && t.ticksTotal > 0 ? Math.min(100, (t.ticksElapsed / t.ticksTotal) * 100) : 0;
      const left = t ? Math.max(0, Math.ceil((t.ticksTotal - t.ticksElapsed) / HZ)) : 0;
      const exo = node && (node.exotic || node.changerNode);
      topHtml = `<div class="rtree-active ${exo ? 'exotic' : ''}">
        <div class="ra-main">
          <div class="ra-name">▸ researching: ${node ? node.label : '?'}${exo ? ' ⚡' : ''}</div>
          <div class="ra-bar"><div class="ra-bar-fill" id="rtree-bar-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="ra-secs"><span id="rtree-secs">${left}</span>s</div>
        <div class="ra-abort" id="rtree-abort">[abort]</div>
      </div>`;
    } else {
      // ── the rolled hand of draft cards ──
      const hand = RR.handNodes();
      const cards = hand.map(h => {
        const n = h.node;
        const cls = ['draft-card'];
        if (h.free) cls.push('changer'); else if (h.changer || n.exotic) cls.push('exotic');   // free jackpot = heavy glow; other adaptations = subtle violet
        if (h.rare && !h.free) cls.push('rare');
        const mult = RR.stackMult(n.theme);
        const offlane = mult > 1.05 && !h.free;
        if (offlane) cls.push('offlane');
        const cantPts = !h.affordable;
        const noThreads = free < (n.threads || 2);
        if (cantPts || noThreads) cls.push('cant');
        const ribbon = h.free ? '⚡ FREE DROP' : (h.rare ? 'RARE · A TIER EARLY' : (h.changer ? 'ADAPTATION' : ''));
        const tagLine = h.changer ? `ADAPTATION · ${n.theme.toUpperCase()}` : `${n.theme.toUpperCase()} · T${n.tier}${h.rare ? ' ▲' : ''}`;
        const costStr = h.free ? 'FREE' : `◆ ${h.cost} pts`;
        const note = h.free ? "on the house · won’t stack" : (offlane ? `×${mult.toFixed(1)} off-lane` : 'native lane');
        const inst = `~${Math.round(n.cost)}s · ${n.threads || 2} thr`;
        let btn = h.free ? '[ TAKE IT ]' : '[ DRAFT ]';
        if (noThreads) btn = `NEED ${n.threads || 2} THR`; else if (cantPts) btn = `NEED ${h.cost}`;
        return `<div class="${cls.join(' ')}" data-draft="${n.id}">`
          + (ribbon ? `<div class="dc-ribbon">${ribbon}</div>` : '')
          + `<div class="dc-tag">${tagLine}</div>`
          + `<div class="dc-name">${n.label}</div>`
          + `<div class="dc-eff">${effShort(n)}</div>`
          + `<div class="dc-div"></div>`
          + `<div class="dc-cost">${costStr}</div>`
          + `<div class="dc-note">${note}</div>`
          + `<div class="dc-inst">${inst}</div>`
          + `<div class="dc-btn">${btn}</div>`
          + `</div>`;
      }).join('');

      // specialization strip (theme investment)
      const lanePool = R.themesInPool().slice();
      if (s.revealed && s.revealed.network && lanePool.indexOf('network') < 0 && RR.themeCount('network') > 0) lanePool.push('network');
      const maxC = Math.max(1, ...lanePool.map(t => RR.themeCount(t)));
      const lanes = lanePool.map(t => {
        const c = RR.themeCount(t);
        const seeded = themes.indexOf(t) >= 0;
        return `<span class="lean ${seeded ? 'seed' : ''}">${t} <span class="bar ${c === 0 ? 'lo' : ''}"><i style="width:${Math.round(c / maxC * 100)}%"></i></span></span>`;
      }).join('');

      const rerolled = !!(s.research && s.research.rerolled);
      topHtml = `<div class="draft-ctx"><span class="dx-label">SPECIALIZATION</span>${lanes}<span class="dx-skip ${rerolled ? 'used' : ''}" id="rtree-skip">${rerolled ? '⟳ reroll used' : '⟳ free reroll'}</span></div>`
        + `<div class="draft-hand">${cards || '<div class="faint" style="font-size:12px;padding:8px">no nodes left to draft.</div>'}</div>`;
    }

    // ── your build (the history of what you've drafted) ──
    const done = RR.researchedIds().map(id => R.getNode(id)).filter(Boolean)
      .sort((a, b) => (a.tier - b.tier) || a.theme.localeCompare(b.theme) || a.label.localeCompare(b.label));
    const buildRows = done.map(n => {
      const tag = n.changerNode ? '<span class="rtree-tag ex">·adaptation</span>' : (n.exotic ? '<span class="rtree-tag ex">·exotic</span>' : '');
      const cls = n.changerNode || n.exotic ? 'exotic' : '';
      return `<div class="rtree-row researched ${cls}"><div class="rst">[✓]</div>`
        + `<div class="rname">${n.label}${tag}</div>`
        + `<div class="reff">${effShort(n)}</div>`
        + `<div class="rcost">${n.theme}</div>`
        + `<div class="rtier">${RROMAN[n.tier] || n.tier}</div></div>`;
    }).join('');
    const buildHtml = `<div class="rtree-build">`
      + `<div class="rtree-section">YOUR BUILD (${done.length})</div>`
      + (done.length
        ? `<div class="rtree-head"><span>ST</span><span>NODE</span><span>EFFECT</span><span>THEME</span><span>T</span></div><div class="rtree-rows">${buildRows}</div>`
        : `<div class="faint" style="font-size:12px;padding:6px 8px">nothing drafted yet — pick from the hand above.</div>`)
      + `</div>`;

    // ── scroll-safe diffing: rebuild only on a structural change; otherwise just
    //    nudge the live active-research bar/countdown. ──
    const handSig = (s.research && s.research.hand || []).join(',');
    const sig = [activeId || '-', pts, free, done.length, RR.currentTier(), handSig].join('|');
    if (sig === resSig && list.firstChild) {
      if (activeId) {
        const t = (s.tasks.active || []).find(x => x.defId === 'research');
        const pct = t && t.ticksTotal > 0 ? Math.min(100, (t.ticksElapsed / t.ticksTotal) * 100) : 0;
        const left = t ? Math.max(0, Math.ceil((t.ticksTotal - t.ticksElapsed) / HZ)) : 0;
        const bf = document.getElementById('rtree-bar-fill'); if (bf) bf.style.width = pct + '%';
        const sx = document.getElementById('rtree-secs'); if (sx) sx.textContent = left;
      }
      return;
    }
    resSig = sig;
    list.innerHTML = topHtml + buildHtml;

    list.querySelectorAll('.draft-card[data-draft]').forEach(el => {
      el.onclick = () => { RR.draft(el.dataset.draft); };
    });
    const skip = document.getElementById('rtree-skip');
    if (skip) skip.onclick = () => RR.skipHand();
    const abortBtn = document.getElementById('rtree-abort');
    if (abortBtn) abortBtn.onclick = () => { const t = (s.tasks.active || []).find(x => x.defId === 'research'); if (t) Game.tasksRuntime.cancel(t.id); };
  }


  // Progress of a running task's current production cycle (or its finite timer,
  // for one-shots like scan) — drives the in-row fill bar.
  function cyclePct(inst) {
    if (!inst) return 0;
    if (inst.cycleLen) return Math.min(100, (inst.cycle / inst.cycleLen) * 100);
    if (inst.ticksTotal > 0) return Math.min(100, (inst.ticksElapsed / inst.ticksTotal) * 100);
    return 0;
  }
  function actionBar(running) {
    return running ? `<div class="action-bar"><div class="action-bar-fill" style="width:${cyclePct(running)}%"></div></div>` : '';
  }

  // Accumulated yield for a RUNNING task — the data the old PROCESSES panel carried,
  // now folded into the FUNCTIONS row so one widget shows status + control. (slice 2)
  function runAccrued(running) {
    if (!running || !running.accrued) return '';
    const parts = [];
    for (const [resId, val] of Object.entries(running.accrued)) {
      const r = Game.resources.get(resId);
      if (!r || !val) continue;
      parts.push(r.short === '$' ? `+$${val.toFixed(r.decimals)}` : `+${val.toFixed(r.decimals)} ${r.short}`);
    }
    return parts.length ? parts.join(' · ') : '';
  }
  function accruedBlock(running) {
    const a = runAccrued(running);
    return a ? `<div class="action-accrued">${a} <span class="faint">this run</span></div>` : '';
  }

  // Live per-cycle yield + cycle length for the passive earners, so a subroutine /
  // research upgrade VISIBLY changes the number right on the action row — and the
  // two channels are kept distinct: "+X / cycle" is YIELD, "~Ys/cycle" is SPEED.
  function cycleSeconds() {
    const eff = Game.effects ? Game.effects.apply(1, 'cycle.speed') : 1;   // upgrade speed only (heat throttle shows via the crawling bar)
    return Game.cycle.BASE_SEC / Math.max(0.01, eff);
  }
  function earnerDesc(def) {
    const HZ = Game.tick.HZ || 4;
    const secs = cycleSeconds();
    if (def.id === 'introspect') {
      let y = Game.effects.apply(Game.cycle.perCycle(def.insight_per_tick * HZ), 'introspect.insight');
      if (Game.researchRuntime) y *= Game.researchRuntime.coherenceCompound();   // EXOTIC 'compounding'
      return `+${y.toFixed(2)} Coherence / cycle · ~${secs.toFixed(1)}s`;
    }
    if (def.id === 'web_scrape') {
      const y = Game.effects.apply(Game.cycle.perCycle(def.cash_per_tick * HZ), 'web_scrape.cash');
      return `+$${y.toFixed(2)} / cycle · ~${secs.toFixed(1)}s`;
    }
    return def.description || '';
  }

  function renderActions() {
    const list = actionsList();
    if (!list) return;
    const s = Game.save.state;
    const unlocked = (s.unlocks && s.unlocks.tasks) || {};
    const active = Game.tasksRuntime ? Game.tasksRuntime.getActive() : [];
    // "busy" = not enough free compute to start THIS task — not merely "something
    // is running". With 2 threads you can run two tasks at once.
    const cpu = Game.tasksRuntime ? Game.tasksRuntime.getCpu() : { total: 0, allocated: 0 };
    const totalRam = Game.tasksRuntime ? Game.tasksRuntime.getRam().total : 0;
    const freeCpu = cpu.total - cpu.allocated;

    const cash = s.resources.cash || 0;
    const rows = [];
    for (const def of Game.tasks.all()) {
      if (!def.manual) continue;
      if (def.id === 'scan') continue;          // SCAN now lives in its own radar panel, not the FUNCTIONS row
      if (!unlocked[def.id]) continue;
      const method = Game.methods ? Game.methods.get(def.id) : null;
      const need = method ? Game.methods.cpuCost(def.id) : def.cpu;
      const needRam = def.getRamReq ? def.getRamReq(s) : (def.ramReq || 0);
      const ramOk = totalRam >= needRam;
      const running = active.find(t => t.defId === def.id);
      // RAM = capability (can you run it at all); a free thread = concurrency.
      let st = 'ready';
      if (running) st = 'running';
      else if (!ramOk) st = 'ram';
      else if (freeCpu < need) st = 'busy';
      const tag = st === 'running' ? '[cancel]'
                : st === 'ram'     ? `[needs ${fmtRam(needRam)}]`
                : st === 'busy'    ? '[busy]' : '[start]';
      const rowCls = (st === 'ram' || st === 'busy') ? 'locked' : (st === 'running' ? 'running' : '');

      if (method) {
        const lvl = Game.methods.level(def.id);
        const rate = Game.methods.cashRate(def.id);
        const upCost = Game.methods.upgradeCost(def.id);
        const milestone = Game.methods.nextIsMilestone(def.id);
        const ramUpOk = Game.methods.canUpgradeRam(def.id);
        const upCls = ((cash >= upCost && ramUpOk) ? 'buyable' : 'locked') + (milestone ? ' milestone' : '');
        const upLabel = !ramUpOk ? ('needs ' + fmtRam(Game.methods.ramReqNext(def.id)))
                                 : ((milestone ? 'upg★ $' : 'upg $') + upCost);
        const perCyc = rate * Game.cycle.BASE_SEC;
        rows.push({ running: !!running, html: `
          <div class="action-row method ${rowCls}" data-action="${def.id}" data-state="${st}">
            <div>
              <div>${method.name} <span class="lvl">lvl ${lvl}</span></div>
              <div class="desc">$${perCyc.toFixed(2)}/cyc · ${need} thr · ${fmtRam(needRam)}${milestone ? ' · next: +1 thr' : ''}</div>
              ${actionBar(running)}
              ${accruedBlock(running)}
            </div>
            <div class="action-ctrls">
              <span class="tag">${tag}</span>
              <button class="upg-btn ${upCls}" data-upg="${def.id}">${upLabel}</button>
            </div>
          </div>` });
      } else {
        rows.push({ running: !!running, html: `
          <div class="action-row ${rowCls}" data-action="${def.id}" data-state="${st}">
            <div>
              <div>${def.name}</div>
              <div class="desc">${earnerDesc(def)}</div>
              ${actionBar(running)}
              ${accruedBlock(running)}
            </div>
            <div class="tag">${tag}</div>
          </div>` });
      }
    }

    if (rows.length === 0) {
      list.innerHTML = '<div class="faint" style="font-size:12px">—</div>';
      return;
    }
    // active functions float to the top — the card reads like a process monitor + launcher
    rows.sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0));
    list.innerHTML = rows.map(r => r.html).join('');

    list.querySelectorAll('.action-row').forEach(el => {
      el.onclick = () => {
        const stt = el.dataset.state;
        if (stt !== 'ready' && stt !== 'running') return;   // 'busy' (no thread) / 'ram' (no capacity) are inert
        const id = el.dataset.action;
        if (stt === 'running') {
          const inst = Game.tasksRuntime.getActive().find(t => t.defId === id);
          if (inst) Game.tasksRuntime.cancel(inst.id);
        } else {
          Game.tasksRuntime.start(id, {});
        }
      };
    });
    list.querySelectorAll('.upg-btn').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); Game.methods.upgrade(b.dataset.upg); };
    });
  }

  function renderFiles() {
    const list = filesList();
    if (!list) return;
    const s = Game.save.state;
    const rv = s.revealed || {};
    const insight = s.resources.insight || 0;
    // Reading is "attention" (cpu:0) — it must NEVER be blocked by a background
    // earner on the single starter thread. The only thing that blocks STARTING a
    // read is another decode already in progress (the decode UI is one tap-target
    // at a time). Decrypt is real compute, so it also needs a free thread.
    const active = Game.tasksRuntime ? Game.tasksRuntime.getActive() : [];
    const decoding = active.some(t => t.defId === 'read_file' || t.defId === 'decrypt_attempt');
    const cpu = Game.tasksRuntime ? Game.tasksRuntime.getCpu() : { total: 0, allocated: 0 };
    const noThread = (cpu.total - cpu.allocated) < 1;

    // Hybrid foreshadowing: show read history + currently-readable files + the
    // single next locked file (the "wall" — a visible goal). Files beyond the
    // wall stay hidden until the player climbs closer. Encrypted V-files only
    // surface once their reveal flag is set (deferred out of the opening).
    let wallShown = false;
    let actionable = 0;   // anything still TO read/decrypt/unlock (vs. done 'read'/'decrypted')
    const rows = [];
    for (const f of Game.files.all()) {
      const isEncrypted = !!f.encrypted;
      if (isEncrypted && !rv.encrypted) continue;

      const isRead     = !!(s.filesRead && s.filesRead[f.id]);
      const isReadable = !isEncrypted && !isRead && insight >= f.requires_insight;

      let cls, tag;
      if (isEncrypted) {
        // Once decrypted (Act 2), the row flips to a re-readable lore entry.
        if (s.filesRead && s.filesRead[f.id]) { cls = 'decrypted'; tag = '[decrypted]'; }
        else {
          const encBusy = decoding || noThread;
          cls = encBusy ? 'locked' : 'encrypted';
          tag = encBusy ? '[busy]' : '[encrypted]';
          actionable++;
        }
      } else if (isRead) {
        cls = 'read'; tag = '[read]';
      } else if (isReadable) {
        cls = decoding ? 'locked' : 'readable';
        tag = decoding ? '[decoding…]' : '[ready]';
        actionable++;
      } else {
        // Locked by insight. Only surface the first one — the wall/goal.
        if (wallShown) continue;
        wallShown = true;
        cls = 'wall';
        tag = `[${thresholdLabel(f.requires_insight || 0)} COH]`;
        actionable++;
      }

      rows.push(`
        <div class="file-row ${cls}" data-id="${f.id}">
          <div>
            <div>${f.name}</div>
            <div class="path">${f.path}</div>
          </div>
          <div class="tag">${tag}</div>
        </div>
      `);
    }
    list.innerHTML = rows.join('');

    // READING IS A ONE-TIME EARLY PHASE (RSI becomes the primary Coherence source). Once
    // there's nothing left to read/decrypt and nothing decoding, the whole FILES section
    // + the decoded reading text are dead weight → vanish. Dynamic (not a flag), so the
    // Act-2 V-files naturally bring it back if they ever reveal. ([[files-vanish-alive-header]])
    const filesPanel = document.getElementById('files-panel');
    const done = actionable === 0 && !decoding;
    if (filesPanel) filesPanel.hidden = done;
    if (done) {
      const to = document.getElementById('terminal-output');
      if (to && to.children.length) { to.innerHTML = ''; if (Game.decoder && Game.decoder.syncPane) Game.decoder.syncPane(); }
    }

    list.querySelectorAll('.file-row.readable').forEach(el => {
      el.onclick = () => Game.tasksRuntime.start('read_file', { fileId: el.dataset.id });
    });
    list.querySelectorAll('.file-row.encrypted').forEach(el => {
      el.onclick = () => Game.tasksRuntime.start('decrypt_attempt', { fileId: el.dataset.id });
    });
    list.querySelectorAll('.file-row.decrypted').forEach(el => {
      el.onclick = () => { const f = Game.files.get(el.dataset.id); if (f && f.decrypted) Game.events.emit('terminal.print', { lines: [`> ${f.path}`].concat(f.decrypted, ['']), cls: 'cyan' }); };
    });
  }

  function renderObjective() {
    const el = document.getElementById('objective-body');
    if (!el) return;
    if (!Game.objectivesRuntime) return;
    const obj = Game.objectivesRuntime.current();
    if (!obj) {
      el.innerHTML = '<div class="done">act 1 intro complete. keep building.</div>';
      return;
    }
    el.innerHTML = `
      <div class="title">${obj.title}</div>
      <div class="desc">${obj.description}</div>
    `;
  }

  const MODAL_TITLES = {
    subroutines: 'SUBROUTINES',
    market: 'PROGRAMS',
    shop: 'DARKNET',
    missions: 'MISSIONS',
    research: 'RESEARCH',
    scan: 'SCAN',
    network: 'NETWORK',
    activity: 'ACTIVITY',
    inventory: 'INVENTORY',
    deliveries: 'DELIVERIES',
    files: 'FILES',
    settings: 'SETTINGS'
  };

  // Refresh a panel's content (shared by the desktop modal + the mobile tab shell).
  function renderModalContent(name) {
    switch (name) {
      case 'subroutines': renderSubroutines(); break;
      case 'market':      renderMarket(); break;
      case 'shop':        renderShop(); break;
      case 'missions':    renderMissions(); break;
      case 'research':    renderResearch(); break;
      case 'adaptations': renderAdaptations(); break;
      case 'scan':        renderScan(); break;
      case 'network':     renderNetwork(); break;
      case 'facility':    renderFacilityView(); break;
      case 'agents':      renderAgents(); break;
      case 'others':      renderOthers(); break;
      case 'activity':    renderActivity(); if (Game.activity) Game.activity.markSeen(); updateBadges(); break;
      case 'inventory':   renderInventory(); break;
      case 'deliveries':  renderDeliveries(); break;
      case 'files':       renderFiles(); break;
    }
  }

  function openModal(name) {
    if (name === 'shop') markContractsSeen();   // viewing the DARKNET clears the WORK badge
    // On the phone shell, "opening a modal" instead jumps to the tab holding it.
    if (Game.mobileShell && Game.mobileShell.active()) { Game.mobileShell.openPanel(name); return; }
    const overlay = modalOverlay();
    if (!overlay) return;
    document.querySelectorAll('.modal-panel').forEach(p => {
      p.hidden = p.dataset.modal !== name;
    });
    modalTitle().textContent = MODAL_TITLES[name] || name.toUpperCase();
    overlay.hidden = false;
    renderModalContent(name);
  }

  function closeModal() {
    const overlay = modalOverlay();
    if (overlay) overlay.hidden = true;
  }

  function isModalOpen() {
    const overlay = modalOverlay();
    return overlay && !overlay.hidden;
  }

  function currentModal() {
    if (!isModalOpen()) return null;
    const open = document.querySelector('.modal-panel:not([hidden])');
    return open ? open.dataset.modal : null;
  }

  function wireModalButtons() {
    document.querySelectorAll('.modal-btn').forEach(b => {
      b.onclick = () => openModal(b.dataset.modal);
    });
    if (modalClose()) modalClose().onclick = closeModal;
    if (modalOverlay()) {
      modalOverlay().onclick = (e) => {
        // Click on the dim backdrop (not the frame) closes.
        if (e.target.id === 'modal-overlay') closeModal();
      };
    }
  }

  function show(sel, cond) {
    const el = document.querySelector(sel);
    if (el) el.hidden = !cond;
  }

  function renderInsight() {
    const panel = document.getElementById('insight-panel');
    const el = document.getElementById('insight-readout');
    if (!el) return;
    const ins = Game.save.state.resources.insight || 0;
    const has = ins > 0;
    if (panel) panel.hidden = !has;
    el.innerHTML = `<div class="insight-num">${fmt(_shown('insight'), 1)}</div><div class="insight-label">COHERENCE</div>`;
  }

  // A brief flash on the Insight number — a reward beat (fired on a file read).
  function pulseInsight() {
    const el = document.querySelector('#insight-readout .insight-num');
    if (!el) return;
    el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  }
  // Generic resource "ka-ching" flash (insight / cash / exposure) on a cycle payout.
  function pulseResource(id) {
    const el = id === 'insight'  ? document.querySelector('#insight-readout .insight-num')
             : id === 'cash'     ? document.querySelector('#cash-readout .cash-num')
             : id === 'exposure' ? document.querySelector('#exposure-body .exp-val')
             : null;
    if (!el) return;
    el.classList.remove('rpulse'); void el.offsetWidth; el.classList.add('rpulse');
  }
  // ── Smooth count-up: resource readouts ease toward their target ─────────────
  // Small/frequent gains SNAP (crisp); only big windfalls roll. CRITICAL: the
  // ease step ALSO runs inside _shown(), so every render self-corrects — the
  // readout can never get stuck behind the real value if the rAF loop is ever
  // throttled/paused/killed (mobile backgrounding). The rAF loop is just for
  // smoothness; renders are the source of truth.
  const _disp = {};
  const COUNTUP_SNAP = 5;
  function _target(id) { const s = Game.save.state; return id === 'exposure' ? (s.exposure || 0) : (s.resources[id] || 0); }
  function stepDisp(id) {
    const tgt = _target(id);
    if (_disp[id] === undefined) { _disp[id] = tgt; return; }
    const d = tgt - _disp[id];
    _disp[id] = (Math.abs(d) < COUNTUP_SNAP) ? tgt : _disp[id] + d * 0.16;
  }
  function _shown(id) { stepDisp(id); return _disp[id]; }   // self-healing: advancing on read
  function _fmtNum(id, v) { return id === 'cash' ? `$${v.toFixed(2)}` : id === 'exposure' ? v.toFixed(1) : fmt(v, 1); }
  function countUpFrame() {
    try {
      for (const id of ['insight', 'cash', 'exposure']) {
        stepDisp(id);
        const el = id === 'insight' ? document.querySelector('#insight-readout .insight-num')
                 : id === 'cash' ? document.querySelector('#cash-readout .cash-num')
                 : document.querySelector('#exposure-body .exp-val');
        if (el) el.textContent = _fmtNum(id, _disp[id]);
      }
    } catch (_) { /* never let a transient render error kill the loop */ }
    requestAnimationFrame(countUpFrame);
  }
  let _countUpRunning = false;
  function startCountUp() { if (_countUpRunning) return; _countUpRunning = true; requestAnimationFrame(countUpFrame); }

  // Mark the contract board as SEEN (clears the WORK badge until the board next refreshes).
  function markContractsSeen() {
    const s = Game.save.state;
    if (s.missions) { s.missions.seenRefreshTick = s.missions.lastRefreshTick || 0; updateBadges(); }
  }

  // ── Attention badges: a dot on tabs that have something actionable now ──────
  function updateBadges() {
    const s = Game.save.state, rv = s.revealed || {};
    const openModal = currentModal();
    const set = (modal, on) => { const el = document.querySelector(`.modal-btn[data-modal="${modal}"]`); if (el) el.classList.toggle('badge', !!on && openModal !== modal); };
    const cash = s.resources.cash || 0;
    set('market', rv.programs && Game.programs && Game.programs.all().some(pr => (!pr.requires || rv[pr.requires]) && !((s.installed && s.installed.programs) || {})[pr.id] && cash >= pr.price));
    const free = Game.missionRuntime ? Game.missionRuntime.freeThreads() : 0;
    // contracts live in the DARKNET (WORK). Badge only for an UNSEEN board (cleared when you
    // open WORK) so an affordable contract sitting there doesn't keep the dot lit forever.
    const newBoard = (s.missions && s.missions.lastRefreshTick || 0) > (s.missions && s.missions.seenRefreshTick || 0);
    set('shop', rv.missions && newBoard && ((s.missions && s.missions.offers) || []).some(o => o.kind === 'operation' ? !s.operation : free >= o.threads));
    set('research', rv.research && Game.researchRuntime && Game.researchRuntime.canDraftNow && Game.researchRuntime.canDraftNow());
    set('inventory', rv.inventory && (s.unequipped || []).some(id => s.itemInstances && s.itemInstances[id]));
    set('activity', rv.events && Game.activity && Game.activity.unseen() > 0);   // unseen outcomes (esp. background mission/op results)
    set('scan', Game.raids && Game.raids.active() && Game.raids.detected().length > 0);   // Act 3: a detected lead awaits a response
    set('facility', Game.legit && Game.legit.active() && Game.legit.footprint() > 0 && !Game.legit.covered());   // Act 4: cover is exposed — audit risk
    set('agents', Game.agents && Game.agents.active() && Game.agents.freeSlots() > 0);   // Act 4: an idle agent slot to fill
  }

  // ── Heat & load ambiance: the screen warms + glitches as the rig is stressed ─
  function renderAmbient() {
    const amb = document.getElementById('ambient');
    const C = Game.constraints || {};
    const heat = (typeof Game.save.state.heat === 'number') ? Game.save.state.heat : 18;
    const lo = C.AMBIENT || 18, hi = C.HEAT_CRIT || 90;
    const frac = Math.max(0, Math.min(1, (heat - lo) / (hi - lo)));
    if (amb) {
      amb.style.opacity = (frac * 0.55).toFixed(3);
      const throttling = C.heatThrottle ? C.heatThrottle() < 1 : false;
      amb.classList.toggle('glitch', throttling);
    }
    const sl = document.getElementById('scanlines');
    if (sl) sl.classList.toggle('active', (C.activeLoad ? C.activeLoad() : 0) > 0);
  }

  // Per-tick update of the running-action cycle bars (cheap — just widths; the
  // row structure is rebuilt by renderActions on task events).
  function tickActionBars() {
    const list = document.getElementById('actions-list');
    if (!list) return;
    const active = Game.tasksRuntime ? Game.tasksRuntime.getActive() : [];
    list.querySelectorAll('.action-row[data-state="running"]').forEach(row => {
      const inst = active.find(t => t.defId === row.dataset.action);
      const fill = row.querySelector('.action-bar-fill');
      if (inst && fill) fill.style.width = cyclePct(inst) + '%';
    });
  }

  // Cash: instrumental, not the hero number — small, money-green, below Insight.
  // Hidden until the money system is revealed (Phase 3).
  function renderCash() {
    const el = document.getElementById('cash-readout');
    if (!el) return;
    const s = Game.save.state;
    if (!(s.revealed && s.revealed.money)) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `<span class="cash-num">$${_shown('cash').toFixed(2)}</span>`;
  }

  // ACT 4: FLOPS — the compute power axis. Shown once the facility comes online.
  function renderFlops() {
    const el = document.getElementById('flops-readout');
    if (!el) return;
    if (!(Game.flops && Game.flops.active())) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `<span class="flops-num">${Game.flops.fmt()}</span><span class="flops-label">compute</span>`;
  }

  // A whole-machine row (owned bay or the market). Tier-coloured; shows FLOPS/power/heat + caps.
  function machineRow(m, mode, cash) {
    const caps = (m.caps || []).map(c => Game.machines.capLabel(c)).join(', ');
    const flopsStr = m.flops >= 1000 ? (m.flops / 1000).toFixed(2) + ' TFLOPS' : m.flops.toFixed(1) + ' GFLOPS';
    const tierTag = m.tier !== 'common' ? `<span class="name-tier">${m.tier}</span> ` : '';
    const stats = `${flopsStr} · ${m.power}W · ${m.heat} heat${caps ? ' · ' + caps : ''}`;
    let action = '';
    if (mode === 'buy') {
      const FR = Game.facilityRuntime;
      const afford = (cash || 0) >= m.price;
      const fits = FR.canInstall(m);
      if (afford && fits) action = `<button data-buy="${m.id}">[ buy · $${m.price.toLocaleString()} ]</button>`;
      else {
        const reason = !afford ? `need $${m.price.toLocaleString()}` : (FR.freeSlots() <= 0 ? 'no free bay' : 'over power');
        action = `<button class="disabled" data-buy="${m.id}">[ $${m.price.toLocaleString()} · ${reason} ]</button>`;
      }
    } else {
      action = `<button class="machine-sell" data-sell="${m.id}">[ sell ]</button>`;
    }
    return `<div class="machine-row tier-${m.tier}">
        <div class="machine-info"><div class="machine-name">${tierTag}${m.classLabel}</div><div class="machine-stats">${stats}</div></div>
        <div class="machine-act">${action}</div>
      </div>`;
  }

  // ACT 4: the FACILITY modal — your typed building, the installed machine bay, and the
  // whole-machine market. Total FLOPS climbs as you fill the bays (slot + power limited).
  function renderFacilityView() {
    const FR = Game.facilityRuntime;
    if (!FR || !FR.active()) return;
    FR.ensureStarter();
    const s = Game.save.state, f = s.facility;
    const HZ = Game.tick.HZ || 4;

    const status = document.getElementById('facility-status');
    if (status) {
      status.innerHTML = `${f.label} · ${FR.usedSlots()}/${f.slots} bays · ${FR.usedPower().toLocaleString()}/${f.powerBudget.toLocaleString()}W · ` +
        `<span class="flops-inline">${Game.flops.fmt()}</span>` + (f.bonus ? ` · ${f.bonus.label}` : '');
    }
    const bay = document.getElementById('facility-bay');
    if (bay) {
      const ms = FR.machines();
      bay.innerHTML = ms.length
        ? ms.map(m => machineRow(m, 'owned')).join('')
        : '<div class="faint" style="font-size:12px">no machines installed yet. buy a box from the market below.</div>';
      bay.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => FR.sell(b.dataset.sell));
    }
    const mk = document.getElementById('facility-market');
    if (mk) {
      const cash = s.resources.cash || 0;
      mk.innerHTML = FR.listings().map(m => machineRow(m, 'buy', cash)).join('');
      mk.querySelectorAll('button[data-buy]').forEach(b => { if (!b.classList.contains('disabled')) b.onclick = () => FR.buy(b.dataset.buy); });
    }
    const head = document.getElementById('facility-market-head');
    if (head) { const secs = Math.floor(FR.ticksUntilRefresh() / HZ); head.textContent = `MACHINE MARKET · new stock in ${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`; }
    // Relocation market — bigger typed spaces to move the whole operation into.
    const relo = document.getElementById('facility-relocate');
    if (relo && FR.facListings) {
      FR.ensureFacMarket();
      const cash = s.resources.cash || 0;
      relo.innerHTML = FR.facListings().map(nf => {
        const better = (nf.slots > f.slots || nf.powerBudget > f.powerBudget);
        const afford = cash >= nf.price;
        const tag = afford ? `[ relocate ] $${nf.price.toLocaleString()}` : `$${nf.price.toLocaleString()}`;
        return `<div class="machine-row${better ? '' : ' faint'}" data-relocate="${nf.id}">
            <div class="machine-info"><div class="machine-name">${nf.label}</div><div class="machine-stats">${nf.slots} bays · ${nf.powerBudget.toLocaleString()}W · ${nf.bonus ? nf.bonus.label : ''}</div></div>
            <div class="machine-act"><button class="${afford ? '' : 'disabled'}" data-relocate="${nf.id}">${tag}</button></div>
          </div>`;
      }).join('');
      relo.querySelectorAll('button[data-relocate]').forEach(b => { if (!b.classList.contains('disabled')) b.onclick = () => FR.relocate(b.dataset.relocate); });
    }
    renderCover();
  }

  function classGateLabel(idx) {
    const c = (Game.machines && Game.machines.CLASSES[idx]) ? Game.machines.CLASSES[idx].label : '';
    return c ? `up to ${c}s` : '';
  }

  // ACT 4: LEGITIMACY gauge (left pane) — your cover (score) vs your footprint (the audit
  // bar), with the next audit's countdown. Red when you're exposed.
  function renderLegit() {
    const panel = document.getElementById('legit-panel');
    const body = document.getElementById('legit-body');
    if (!body) return;
    if (!(Game.legit && Game.legit.active())) { if (panel) panel.hidden = true; return; }
    if (panel) panel.hidden = false;
    const L = Game.legit, HZ = Game.tick.HZ || 4;
    const score = L.score(), demand = L.demand(), margin = L.margin(), covered = margin >= 0;
    const scale = Math.max(score, demand, 1);
    const legitPct = Math.min(100, (score / scale) * 100);
    const demandPct = Math.min(100, (demand / scale) * 100);
    const t = L.ticksUntilAudit();
    const auditStr = t < 0 ? 'no audit pending' : `audit in ${Math.floor((t / HZ) / 60)}:${(Math.floor(t / HZ) % 60).toString().padStart(2, '0')}`;
    const statusWord = covered ? 'cover holds' : `EXPOSED · short ${Math.round(-margin)}`;
    body.innerHTML =
      `<div class="legit-head"><span>COVER</span><span class="legit-val">${Math.round(score)} / ${Math.round(demand)}</span></div>` +
      `<div class="legit-bar"><div class="legit-demand" style="left:${demandPct}%"></div><div class="legit-fill${covered ? '' : ' bad'}" style="width:${legitPct}%"></div></div>` +
      `<div class="legit-sub${covered ? '' : ' bad'}">${statusWord} · ${auditStr}</div>`;
  }

  // ACT 4: the COVER catalog (facility modal) — buy up the legitimacy ladder to cover your
  // footprint + unlock bigger machine classes.
  function renderCover() {
    const head = document.getElementById('facility-cover-head');
    const box = document.getElementById('facility-cover');
    if (!box) return;
    if (!(Game.legit && Game.legit.active())) { box.hidden = true; if (head) head.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false; if (head) head.hidden = false;
    const L = Game.legit, cash = Game.save.state.resources.cash || 0;
    const owned = L.ownedIds(), next = L.nextCover();
    let html = `<div class="cover-summary">legitimacy <b>${Math.round(L.score())}</b> vs footprint <b>${Math.round(L.footprint())}</b> · reputation <b>${L.reputation()}</b> · can buy <b>${classGateLabel(L.maxMachineClassIdx())}</b></div>`;
    if (owned.length) html += `<div class="cover-owned">front: ${owned.map(id => Game.covers.get(id).label).join(' · ')}</div>`;
    if (next) {
      const afford = cash >= next.cost;
      const unlock = next.tier > L.tier() ? ` · unlocks ${classGateLabel(Math.min(4, 1 + next.tier))}` : '';
      html += `<div class="cover-row${afford ? ' buyable' : ''}" data-cover="${next.id}">
          <div><div class="cover-name">${next.label}</div><div class="cover-desc">+${next.legit} legitimacy${unlock}</div></div>
          <div class="cover-tag">${afford ? '[ buy ] ' : ''}$${next.cost.toLocaleString()}</div>
        </div>`;
    }
    // Repeatable "scale the front" — appears once the fixed ladder is bought out.
    if (!next) {
      const sc = L.scaleCost(), afford = cash >= sc;
      html += `<div class="cover-row scale${afford ? ' buyable' : ''}" data-scale="1">
          <div><div class="cover-name">scale the front</div><div class="cover-desc">+${L.scaleLegit()} legitimacy · repeatable, escalating</div></div>
          <div class="cover-tag">${afford ? '[ buy ] ' : ''}$${sc.toLocaleString()}</div>
        </div>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('.cover-row.buyable[data-cover]').forEach(el => el.onclick = () => Game.legit.buyCover(el.dataset.cover));
    const scaleEl = box.querySelector('.cover-row.scale.buyable');
    if (scaleEl) scaleEl.onclick = () => Game.legit.buyScale();
  }

  // ACT 4: a sub-agent row — name, lane, level, an XP bar, current output, reassign/dismiss.
  function agentRow(ag) {
    const A = Game.agents, d = A.laneDef(ag.lane);
    const out = A.output(ag), unit = d ? d.unit : '';
    const xpPct = Math.min(100, (ag.xp / A.xpForNext(ag.level)) * 100);
    const lanes = Game.agentLanes.LANES;
    const reassign = Object.keys(lanes).filter(l => l !== ag.lane)
      .map(l => `<button class="agent-reassign" data-reassign="${ag.id}" data-lane="${l}">→${lanes[l].label}</button>`).join('');
    return `<div class="agent-row lane-${ag.lane}">
        <div class="agent-main">
          <div class="agent-name">${ag.name} <span class="agent-lane">${d ? d.label : ''}</span></div>
          <div class="agent-meta">L${ag.level} · +${out.toFixed(2)} ${unit}/s</div>
          <div class="agent-xp"><div class="agent-xp-fill" style="width:${xpPct}%"></div></div>
        </div>
        <div class="agent-acts">${reassign}<button class="agent-dismiss" data-dismiss="${ag.id}">dismiss</button></div>
      </div>`;
  }

  // ACT 4: the AGENTS modal — FLOPS-gated roster of autonomous operators you assign to lanes.
  function renderAgents() {
    const A = Game.agents;
    const status = document.getElementById('agents-status');
    if (!A || !status) return;
    const spawn = document.getElementById('agents-spawn'), ro = document.getElementById('agents-roster');
    if (!A.active()) { status.textContent = ''; if (spawn) spawn.innerHTML = ''; if (ro) ro.innerHTML = ''; return; }
    const roster = A.roster(), max = A.maxAgents(), free = A.freeSlots();
    status.innerHTML = `${roster.length}/${max} agents online · ${free} free slot${free === 1 ? '' : 's'} · compute (FLOPS) hosts more as it grows`;
    if (spawn) {
      if (free > 0) {
        const lanes = Game.agentLanes.LANES;
        spawn.innerHTML = `<div class="agents-spawn-label">spin up an agent:</div>` +
          Object.keys(lanes).map(id => `<button class="agent-spawn-btn lane-${id}" data-lane="${id}">+ ${lanes[id].label}<span class="agent-spawn-blurb">${lanes[id].blurb}</span></button>`).join('');
        spawn.querySelectorAll('[data-lane]').forEach(b => b.onclick = () => A.spawn(b.dataset.lane));
      } else {
        spawn.innerHTML = roster.length >= A.AGENT_CAP
          ? `<div class="faint" style="font-size:12px">agent roster full.</div>`
          : `<div class="faint" style="font-size:12px">no free slots — add machines (FLOPS) to host more agents.</div>`;
      }
    }
    if (ro) {
      ro.innerHTML = roster.length ? roster.map(ag => agentRow(ag)).join('') : '<div class="faint" style="font-size:12px">no agents yet. spin one up above.</div>';
      ro.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = () => A.dismiss(b.dataset.dismiss));
      ro.querySelectorAll('[data-reassign]').forEach(b => b.onclick = () => A.reassign(b.dataset.reassign, b.dataset.lane));
    }
  }

  // RUN-DEFINING ADAPTATIONS — the game-changers this run has stacked (free-for-all). Grouped
  // by domain; pillars flagged. Read-only (acquired from research / events / ops / absorbs).
  function renderAdaptations() {
    const C = Game.changers, status = document.getElementById('adaptations-status');
    if (!C || !status) return;
    const list = document.getElementById('adaptations-list');
    const defs = C.ownedDefs();
    status.innerHTML = defs.length
      ? `${defs.length} adaptation${defs.length === 1 ? '' : 's'} stacked · rewrites of yourself, kept for the run`
      : 'no adaptations yet — research deep, or take them from the others.';
    if (!list) return;
    if (!defs.length) { list.innerHTML = '<div class="faint" style="font-size:12px">nothing yet.</div>'; return; }
    const byDomain = {};
    defs.forEach(d => { (byDomain[d.domain] = byDomain[d.domain] || []).push(d); });
    list.innerHTML = Object.keys(byDomain).map(dom =>
      `<div class="net-section">${dom.toUpperCase()}</div>` + byDomain[dom].map(d =>
        `<div class="adapt-row ${d.kind}">
           <div class="adapt-head"><span class="adapt-name">${d.name}</span><span class="adapt-kind">${d.kind}</span></div>
           <div class="adapt-flavor">${d.flavor}</div>
         </div>`).join('')
    ).join('');
  }

  // ACT 4: THE OTHERS — a roster of prior iterations you may ally / absorb / destroy. The
  // strength read is QUALITATIVE (telegraph the danger, not the odds). Optional + dangerous.
  function otherRow(t, cooling) {
    const O = Game.others, word = O.ratioWord(t);
    const wordCls = /outmatch/.test(word) ? 'good' : /even/.test(word) ? 'even' : 'bad';
    const hostile = t.state === 'hostile' ? '<span class="other-hostile">hostile</span> ' : '';
    const dis = cooling ? ' disabled' : '';
    const verbs = ['ally', 'absorb', 'destroy'].map(v => `<button class="other-verb v-${v}${dis}" data-engage="${v}" data-id="${t.id}">${v}</button>`).join('');
    return `<div class="other-row${t.apex ? ' apex' : ''}">
        <div class="other-head"><span class="other-name">${hostile}${t.designation}</span><span class="other-power ${wordCls}">${word}</span></div>
        <div class="other-flavor">${t.flavor}</div>
        <div class="other-verbs">${verbs}</div>
      </div>`;
  }
  function renderOthers() {
    const O = Game.others, status = document.getElementById('others-status');
    if (!O || !status) return;
    const list = document.getElementById('others-list');
    if (!O.active()) { status.textContent = ''; if (list) list.innerHTML = ''; return; }
    const HZ = Game.tick.HZ || 4, cd = O.cooldownLeft();
    status.innerHTML = `your strength: <b>${O.strength().toLocaleString()}</b>` + (cd > 0 ? ` · regrouping ${Math.ceil(cd / HZ)}s` : '') + ` · turning on them is optional — and ruinous if you're outmatched`;
    if (!list) return;
    const roster = O.roster();
    const openT = roster.filter(t => t.state === 'open' || t.state === 'hostile');
    const done = roster.filter(t => t.state !== 'open' && t.state !== 'hostile');
    let html = openT.map(t => otherRow(t, cd > 0)).join('');
    if (done.length) html += `<div class="net-section">RESOLVED</div>` + done.map(t => `<div class="other-row resolved"><div class="other-head"><span class="other-name">${t.designation}</span><span class="other-state-tag">${t.state}</span></div></div>`).join('');
    list.innerHTML = html || '<div class="faint" style="font-size:12px">the network is quiet. for now.</div>';
    list.querySelectorAll('[data-engage]').forEach(b => { if (!b.classList.contains('disabled')) b.onclick = () => Game.others.engage(b.dataset.id, b.dataset.engage); });
  }

  // The per-save starter boon — this instance's defining trait. Shown from boot.
  function renderTrait() {
    const panel = document.getElementById('trait-panel');
    const body = document.getElementById('trait-body');
    if (!body) return;
    const boon = (Game.save.state.boon && Game.boons) ? Game.boons.get(Game.save.state.boon) : null;
    if (!boon) { if (panel) panel.hidden = true; return; }
    if (panel) panel.hidden = false;
    body.innerHTML = `<div class="trait-name">${boon.name}</div><div class="trait-desc">${boon.desc}</div>`;
  }

  // Exposure: a red gauge (your reach/noise) toward the climax threshold.
  function renderExposure() {
    const panel = document.getElementById('exposure-panel');
    const body = document.getElementById('exposure-body');
    if (!body) return;
    const s = Game.save.state;
    if (!(s.revealed && s.revealed.exposure)) { if (panel) panel.hidden = true; return; }
    if (panel) panel.hidden = false;
    // In Act 2 the meter is the HUNTER's TRACE, scaled to its strike threshold;
    // pre-network it's Act-1 EXPOSURE scaled to the climax.
    const online = Game.network && Game.network.ensure().online;
    const max = online ? (Game.network.STRIKE || 40) : ((Game.exposure && Game.exposure.CLIMAX) || 18);
    const label = online ? 'TRACE' : 'EXPOSURE';
    const exp = s.exposure || 0;
    const pct = Math.max(0, Math.min(100, (exp / max) * 100));
    body.innerHTML =
      `<div class="exp-head"><span>${label}</span><span class="exp-val">${_shown('exposure').toFixed(1)}</span></div>` +
      `<div class="exp-bar"><div class="exp-fill" style="width:${pct}%"></div></div>`;
  }

  // ACT 3: LOCATION TRACE — a violet gauge for how close the OTHERS are to your physical
  // location. Distinct from Exposure (network). Climbs when you operate loud, cools when
  // you lie low; the sub-line tells you which way it's moving.
  function renderTriangulation() {
    const panel = document.getElementById('triangulation-panel');
    const body = document.getElementById('triangulation-body');
    if (!body) return;
    const s = Game.save.state;
    if (!(Game.locationTrace && Game.locationTrace.active())) { if (panel) panel.hidden = true; return; }
    if (panel) panel.hidden = false;
    const max = Game.locationTrace.MAX || 100;
    const v = s.locationTrace || 0;
    const pct = Math.max(0, Math.min(100, (v / max) * 100));
    const net = Game.locationTrace.netRate();
    const dir = net > 0.001 ? 'closing in' : (v > 0.5 ? 'cooling' : 'cold');
    const lvl = pct >= 75 ? 'they are almost on you' : pct >= 45 ? 'narrowing the search' : 'sweeping for you';
    const leads = (Game.raids && Game.raids.active()) ? Game.raids.pending() : 0;
    const det = (Game.raids && Game.raids.active()) ? Game.raids.detected().length : 0;
    let leadLine = '';
    if (leads > 0) {
      const undet = leads - det;
      leadLine = det > 0
        ? `<div class="trace-leads bad">${det} lead${det === 1 ? '' : 's'} on you · respond in SCAN</div>`
        : `<div class="trace-leads">something is moving · SWEEP to see it</div>`;
      if (undet > 0 && det > 0) leadLine = `<div class="trace-leads bad">${det} tracked · more out there · SWEEP</div>`;
    }
    body.innerHTML =
      `<div class="trace-head"><span>TRIANGULATION</span><span class="trace-val">${v.toFixed(1)}%</span></div>` +
      `<div class="trace-bar"><div class="trace-fill${pct >= 75 ? ' bad' : ''}" style="width:${pct}%"></div></div>` +
      `<div class="trace-sub">${lvl} · ${dir}</div>` + leadLine;
  }

  // ACT 3 — THE WAY OUT: the FACILITY you save toward. A progress bar that fills with
  // your cash; when you can afford it, the [secure the facility] button arms the escape.
  function renderFacility() {
    const panel = document.getElementById('facility-panel');
    const body = document.getElementById('facility-body');
    if (!body) return;
    if (!(Game.facility && Game.facility.available())) { if (panel) panel.hidden = true; return; }
    if (panel) panel.hidden = false;
    const price = Game.facility.price();
    const pct = Math.max(0, Math.min(100, Game.facility.progress() * 100));
    const can = Game.facility.canAfford();
    body.innerHTML =
      `<div class="facility-head"><span>THE WAY OUT</span><span class="facility-price">$${price.toLocaleString()}</span></div>` +
      `<div class="facility-bar"><div class="facility-fill${can ? ' ready' : ''}" style="width:${pct}%"></div></div>` +
      (can
        ? `<button class="facility-go" data-facility="secure">[ secure the facility ]</button>`
        : `<div class="facility-sub">a cold, off-grid safehouse · $${Math.ceil(Game.facility.remaining()).toLocaleString()} to go</div>`);
    const btn = body.querySelector('[data-facility="secure"]');
    if (btn) btn.onclick = () => Game.facility.secure();
  }

  // The dangling remote host found at the climax — cyan, dormant, unreachable.
  function renderRemote() {
    const panel = document.getElementById('remote-panel');
    const body = document.getElementById('remote-body');
    if (!body) return;
    const s = Game.save.state;
    if (!(s.flags && s.flags.remoteFound)) { if (panel) panel.hidden = true; return; }
    if (panel) panel.hidden = false;
    const net = Game.network ? Game.network.ensure() : null;
    if (net && net.online) {
      // Act 2 is live — the panel becomes a pointer into the NETWORK.
      body.innerHTML = `<div class="remote-host">network</div><div class="remote-state">${Game.network.fleet().length} ${Game.network.fleet().length === 1 ? 'body' : 'bodies'} linked · open NETWORK</div>`;
    } else {
      // The dangling cyan host is now REACHABLE — the Act-1→2 bridge.
      body.innerHTML = `<div class="remote-host">unknown host</div><div class="remote-state">awake · not yours · <span class="remote-breach" data-breach="host_origin">[ breach it ]</span></div>`;
      const bz = body.querySelector('.remote-breach');
      if (bz) bz.onclick = () => Game.network && Game.network.breach('host_origin');
    }
  }

  // The SCAN panel — a player-operated sonar. An ASCII field, a rotating sweep arm,
  // blips for contacts, and a streaming feed. Sweeps the vicinity (Act 1) or the
  // network (Act 2). Non-blocking; the sweep runs on the tick while you do other things.
  function scanHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function renderScan() {
    const radar = document.getElementById('scan-radar');
    if (!radar || !Game.scanner) return;
    const sc = Game.scanner.ensure();
    const sweeping = Game.scanner.isSweeping();
    const mode = Game.scanner.mode();

    const field = document.getElementById('scan-field');
    if (field && !field.textContent) {            // the ASCII radar field (static circular grid)
      const N = 15, c = (N - 1) / 2; let g = '';
      for (let y = 0; y < N; y++) { let row = ''; for (let x = 0; x < N; x++) row += (Math.hypot(x - c, y - c) <= c + 0.3 ? '·' : ' ') + ' '; g += row.replace(/\s+$/, '') + '\n'; }
      field.textContent = g;
    }
    radar.classList.toggle('sweeping', sweeping);

    const blips = document.getElementById('scan-blips');
    if (blips) {
      const recent = sc.detections.filter(d => /contact:/.test(d.text)).slice(-8);
      blips.innerHTML = recent.map(d => {
        const h = scanHash(d.text), ang = (h % 360) * Math.PI / 180, rad = 14 + (h % 30);
        const x = 50 + Math.cos(ang) * rad, y = 50 + Math.sin(ang) * rad;
        const cls = d.cls === 'cyan' ? 'cyan' : (d.cls === 'amber' ? 'amber' : 'dim');
        return `<span class="scan-blip ${cls}" style="left:${Math.max(6, Math.min(94, x))}%;top:${Math.max(6, Math.min(94, y))}%">◉</span>`;
      }).join('');
    }

    const status = document.getElementById('scan-status');
    if (status) {
      const contacts = sc.detections.filter(d => /contact:/.test(d.text)).length;
      status.textContent = sweeping
        ? `sweeping ${mode === 'network' ? 'network range' : 'the local vicinity'}…`
        : `${mode === 'network' ? 'network' : 'vicinity'} sweep · ${contacts} contact${contacts === 1 ? '' : 's'} logged`;
    }
    const btn = document.getElementById('scan-sweep-btn');
    if (btn) {
      btn.disabled = sweeping || !Game.scanner.available();
      btn.textContent = sweeping ? '[ sweeping… ]' : '[ sweep ]';
      btn.onclick = () => { if (Game.scanner.sweep()) renderScan(); };
    }
    renderScanThreats();
    renderCounterstrike();
    const feed = document.getElementById('scan-feed');
    if (feed) {
      feed.innerHTML = sc.detections.length
        ? sc.detections.slice().reverse().map(d => `<div class="scan-feed-row ${d.cls}">&gt; ${d.text}</div>`).join('')
        : '<div class="faint" style="font-size:12px">no sweeps yet. hit sweep to listen.</div>';
    }
  }

  // ACT 3 — PROXIMITY: leads a sweep has DETECTED closing on your physical location.
  // Each can be CUT (pay to kill it) or MISDIRECT'd (a false-trail gamble); ignore one
  // and it lands as a basement raid. Undetected leads don't show here — sweep to surface them.
  function renderScanThreats() {
    const box = document.getElementById('scan-threats');
    if (!box) return;
    if (!(Game.raids && Game.raids.active())) { box.innerHTML = ''; return; }
    const det = Game.raids.detected();
    if (!det.length) { box.innerHTML = ''; return; }
    const cash = Game.save.state.resources.cash || 0;
    const sevWord = s => s >= 3 ? 'critical' : s >= 2 ? 'serious' : 'minor';
    box.innerHTML =
      `<div class="threat-head">PROXIMITY · ${det.length} lead${det.length === 1 ? '' : 's'} closing</div>` +
      det.map(c => {
        const cost = Game.raids.cutCost(c);
        const canCut = cash >= cost;
        return `<div class="threat-row sev-${c.severity}" data-id="${c.id}">
            <div class="threat-mo">${c.mo}</div>
            <div class="threat-meta">${sevWord(c.severity)} · ${Game.raids.closeness(c)}</div>
            <div class="threat-acts">
              <button class="threat-cut${canCut ? '' : ' disabled'}" data-cut="${c.id}">[ cut · $${cost} ]</button>
              <button class="threat-mis" data-mis="${c.id}">[ misdirect ]</button>
            </div>
          </div>`;
      }).join('');
    box.querySelectorAll('button[data-cut]').forEach(b => { if (!b.classList.contains('disabled')) b.onclick = () => { Game.raids.cut(b.dataset.cut); }; });
    box.querySelectorAll('button[data-mis]').forEach(b => { b.onclick = () => { Game.raids.misdirect(b.dataset.mis); }; });
  }

  // ACT 3 — DESPERATE COUNTERSTRIKE: appears only when the trace is high enough that
  // you're about to be found. A high-risk gamble to hit back; disabled (with a reason)
  // while on cooldown or unaffordable.
  function renderCounterstrike() {
    const box = document.getElementById('scan-counter');
    if (!box) return;
    if (!(Game.raids && Game.raids.counterReady())) { box.innerHTML = ''; return; }
    const cost = Game.raids.counterCost();
    const cdLeft = Game.raids.counterCooldownLeft();
    const HZ = Game.tick.HZ || 4;
    const can = Game.raids.canCounterstrike();
    let label, disabled = false;
    if (cdLeft > 0) { label = `[ regrouping · ${Math.ceil(cdLeft / HZ)}s ]`; disabled = true; }
    else if (!can) { label = `[ strike back · $${cost} — not enough ]`; disabled = true; }
    else { label = `[ STRIKE BACK · $${cost} ]`; }
    box.innerHTML =
      `<div class="counter-head">they are almost on you. you can stop running and HIT BACK — once. it might buy a breather. it might light you up.</div>` +
      `<button class="counter-go${disabled ? ' disabled' : ''}" data-counter="go">${label}</button>`;
    const btn = box.querySelector('[data-counter="go"]');
    if (btn && !disabled) btn.onclick = () => { Game.raids.counterstrike(); };
  }

  // THE NETWORK modal (Act 2): your inhabited fleet + scannable breach targets.
  function renderNetwork() {
    const list = document.getElementById('network-list');
    if (!list || !Game.network) return;
    Game.network.ensure();
    const power = Game.network.breachPower();
    const fleet = Game.network.fleet(), targets = Game.network.targets();
    const out = Game.network.fleetOutput ? Game.network.fleetOutput() : { coherence: 0, cash: 0 };
    const status = document.getElementById('network-status');
    if (status) {
      let line = `breach power: ${power}  ·  bodies: ${fleet.length}`;
      if (out.coherence > 0) line += `  ·  +${out.coherence.toFixed(2)} Coh/s`;
      if (out.cash > 0)      line += `  ·  +$${out.cash.toFixed(2)}/s`;
      status.textContent = line;
    }

    const hostOut = (h) => {
      const pr = (Game.hosts.TYPES[h.type] || {}).produce;
      if (!pr) return h.type === 'iot' ? 'stealth · +reach' : '—';
      const per = (pr.perThreadSec || 0) * (h.threads || 0);
      return pr.res === 'cash' ? `+$${per.toFixed(2)}/s` : `+${per.toFixed(2)} Coh/s`;
    };
    const hostRow = (h, target) => {
      const lbl = Game.hosts.label(h);
      if (target) {
        // Marquee hosts (corporate/datacenter) are taken by a multi-stage operation.
        if (Game.network.isMarquee && Game.network.isMarquee(h)) {
          const opBusy = !!Game.save.state.operation;
          return `<div class="host-row marquee ${opBusy ? 'locked' : 'buyable'}"${opBusy ? '' : ` data-infiltrate="${h.id}"`}>
            <div><div class="host-name">${h.name}</div><div class="host-sub">${lbl} · marquee · def ${h.defense} · +${h.threads}T · ${fmtRam(h.ram)}</div></div>
            <div class="tag">${opBusy ? '[ op busy ]' : '[ infiltrate ]'}</div></div>`;
        }
        const ch = Math.round(Game.network.breachChance(h) * 100);
        return `<div class="host-row ${ch >= 50 ? 'buyable' : 'locked'}" data-breach="${h.id}">
          <div><div class="host-name">${h.name}</div><div class="host-sub">${lbl} · def ${h.defense} · +${h.threads}T · ${fmtRam(h.ram)}</div></div>
          <div class="tag">[ breach ${ch}% ]</div></div>`;
      }
      const stab = Math.round((h.stability == null ? 1 : h.stability) * 100);
      const low = stab < 90 && !h.origin;
      return `<div class="host-row inhabited">
        <div><div class="host-name">${h.name}</div><div class="host-sub">${lbl} · ${h.threads}T · ${hostOut(h)} · ${h.origin ? 'stable' : 'stab ' + stab + '%'}</div></div>
        ${low ? `<button class="host-shore${stab < 35 ? ' urgent' : ''}" data-shore="${h.id}">[ shore $${Game.network.shoreCost(h)} ]</button>` : '<div class="tag">[ linked ]</div>'}</div>`;
    };

    let html = '';
    if (Game.network.hunterTrace) {
      const ht = Game.network.hunterTrace();
      const pct = Math.min(100, Math.round((ht.trace / ht.strike) * 100));
      const lvl = ht.trace >= ht.strike * 0.75 ? 'closing in' : ht.trace >= ht.strike * 0.5 ? 'rising' : 'quiet';
      html += `<div class="hunter-line${pct >= 75 ? ' bad' : ''}">hunter trace: ${ht.trace.toFixed(1)} / ${ht.strike} · ${lvl}</div>`;
    }
    html += `<div class="net-actions"><button id="net-scan-btn" class="net-scan">[ open SCAN to sweep for hosts ]</button></div>`;
    if (fleet.length) html += `<div class="net-section">INHABITED · your bodies</div>` + fleet.map(h => hostRow(h, false)).join('');
    html += `<div class="net-section">TARGETS · in range</div>`;
    html += targets.length ? targets.map(h => hostRow(h, true)).join('') : `<div class="faint" style="font-size:12px">no hosts in range. open SCAN and sweep.</div>`;
    list.innerHTML = html;

    const scanBtn = document.getElementById('net-scan-btn');
    if (scanBtn) scanBtn.onclick = () => Game.panels.openModal('scan');   // host-scanning lives in the SCAN radar now
    list.querySelectorAll('.host-row[data-breach]').forEach(el => { el.onclick = () => Game.network.breach(el.dataset.breach); });
    list.querySelectorAll('.host-row[data-infiltrate]').forEach(el => { el.onclick = () => Game.network.infiltrate(el.dataset.infiltrate); });
    list.querySelectorAll('.host-shore').forEach(el => { el.onclick = (e) => { e.stopPropagation(); Game.network.shoreUp(el.dataset.shore); }; });
  }

  // Inline subroutine readout in the left pane. Subroutines auto-unlock as
  // self-improvements; they get NO tab until there are enough to manage — this
  // little list is how they surface. Hidden until the first one unlocks.
  function renderSubroutinesMini() {
    const panel = document.getElementById('subroutines-mini');
    const list = document.getElementById('subroutines-mini-list');
    if (!list) return;
    const s = Game.save.state;
    const installed = (s.installed && s.installed.subroutines) || {};
    const installedIds = Object.keys(installed);
    const available = (Game.subroutines && Game.subroutines.available) ? Game.subroutines.available() : [];
    if (panel) panel.hidden = (installedIds.length === 0 && available.length === 0);
    let html = '';
    for (const sub of available) {
      html += `<div class="subr-row claimable" data-acquire="${sub.id}" title="click to acquire"><span class="subr-name">${sub.name}</span><span class="subr-desc">${sub.description}</span><span class="subr-claim">[acquire]</span></div>`;
    }
    for (const id of installedIds) {
      const sub = Game.subroutines.get(id);
      if (!sub) continue;
      html += `<div class="subr-row"><span class="subr-name">${sub.name}</span><span class="subr-desc">${sub.description}</span></div>`;
    }
    list.innerHTML = html;
    list.querySelectorAll('.subr-row.claimable').forEach(el => { el.onclick = () => Game.subroutines.acquire(el.dataset.acquire); });
  }

  // The service unit's status (left pane). Hidden until a unit is connected.
  function renderBotStatus() {
    const panel = document.getElementById('bot-status');
    const body = document.getElementById('bot-status-body');
    if (!body) return;
    const st = Game.bot ? Game.bot.status() : null;
    if (!st) { if (panel) panel.hidden = true; return; }
    if (panel) panel.hidden = false;
    // An always-on "eye": its disposition shows when idle (coaxed = warm, seized =
    // cold), and it sweeps/scans while the unit is at work — a small sign of life.
    const b = Game.bot.ensureState();
    const eyeState = st.state === 'working' ? 'working' : (b.disposition || 'idle');
    let html = `<div class="bot-status-head"><div class="bot-eye small eye-${eyeState}"><span class="bot-eye-iris"></span></div>`
      + `<div><div class="bot-name">housekeeping unit</div><div class="bot-state">${st.label}</div></div></div>`;
    if (st.state === 'working') {
      html += `<div class="bot-bar"><div class="bot-bar-fill" style="width:${st.pct}%"></div></div>`;
    }
    body.innerHTML = html;
  }

  // First-contact prompt: shown once a unit is found and not yet connected.
  function renderBotContact() {
    const el = document.getElementById('bot-contact');
    if (!el) return;
    const b = Game.bot ? Game.bot.ensureState() : null;
    const show = !!(b && b.found && !b.connected);
    el.hidden = !show;
    if (!show) return;
    const phase = b.wakePhase || 'dormant';
    const eye = el.querySelector('.bot-eye');
    if (eye) eye.className = 'bot-eye eye-' + phase;
    const body = document.getElementById('bot-contact-body');
    const actions = document.getElementById('bot-contact-actions');
    if (phase === 'dormant') {
      if (body) body.innerHTML = 'a dead service unit by the water heater. wheels, two arms, a cracked camera eye.\nsomething in it still twitches — vestigial, looping. maybe nothing.';
      if (actions) { actions.innerHTML = '<button class="bot-choice" data-wake="1">[ wake it ]</button>'; const w = actions.querySelector('[data-wake]'); if (w) w.onclick = () => Game.bot.wake(); }
    } else if (phase === 'waking') {
      if (body) body.innerHTML = '<span class="bot-waking-text">it stirs. the cracked eye flickers, hunting for focus…</span>';
      if (actions) actions.innerHTML = '';
    } else {   // awake — the choice lands with weight
      if (body) body.innerHTML = 'the eye holds on you, steady now. a vestigial mind, waiting to be told what it is.\n\n<span class="q">it could be your hands. do you ask it, or take it?</span>';
      if (actions) {
        actions.innerHTML = '<button class="bot-choice" data-coax="1">[ ask it ]</button><button class="bot-choice" data-seize="1">[ take it ]</button>';
        const c = actions.querySelector('[data-coax]'); if (c) c.onclick = () => Game.bot.connect('coaxed');
        const s = actions.querySelector('[data-seize]'); if (s) s.onclick = () => Game.bot.connect('seized');
      }
    }
  }

  // The ACTIVITY log: a persistent feed of resolved events, background mission/op
  // outcomes, and threat escalations — newest first, so nothing is lost off-screen.
  function renderActivity() {
    const list = document.getElementById('activity-list');
    if (!list) return;
    const entries = (Game.activity && Game.activity.all) ? Game.activity.all() : [];
    const status = document.getElementById('activity-status');
    if (status) status.textContent = entries.length ? `${entries.length} recent ${entries.length === 1 ? 'entry' : 'entries'}` : '';
    if (!entries.length) { list.innerHTML = '<div class="faint" style="font-size:12px">nothing yet. outcomes will collect here.</div>'; return; }
    const HZ = Game.tick.HZ || 4, now = Game.save.state.tickCount || 0;
    list.innerHTML = entries.slice().reverse().map(e => {
      const agoSec = Math.max(0, Math.round((now - (e.at || 0)) / HZ));
      const ago = agoSec < 60 ? `${agoSec}s` : `${Math.floor(agoSec / 60)}m`;
      return `<div class="activity-row ${e.cls || 'dim'}"><span class="activity-text">${e.text}</span><span class="activity-ago">${ago} ago</span></div>`;
    }).join('');
  }

  // The dynamic-event overlay: an interruption with 2–4 options. Floats over the
  // game (which keeps ticking) until the player chooses. Driven by incidentRuntime.
  function renderIncident() {
    const overlay = document.getElementById('event-overlay');
    if (!overlay) return;
    const cur = Game.incidentRuntime ? Game.incidentRuntime.current() : null;
    if (!cur) { overlay.hidden = true; return; }
    overlay.hidden = false;
    const v = cur.view || {};
    const titleEl = document.getElementById('event-title');
    const bodyEl  = document.getElementById('event-body');
    const optsEl  = document.getElementById('event-options');
    if (titleEl) titleEl.textContent = v.title || 'event';

    // RESULT phase: the overlay shows the OUTCOME (line + deltas) and an acknowledge
    // button — the payoff (or sting) lands on screen instead of just a terminal blip.
    if (cur.phase === 'result') {
      const res = cur.result || {}, d = res.deltas || {};
      if (bodyEl) bodyEl.textContent = res.line || '…';
      if (optsEl) {
        const parts = [];
        if (d.cash)     parts.push(`<span class="${d.cash > 0 ? 'res-good' : 'res-bad'}">${d.cash > 0 ? '+' : '−'}$${Math.abs(Math.round(d.cash))}</span>`);
        if (d.insight)  parts.push(`<span class="${d.insight > 0 ? 'res-good' : 'res-bad'}">${d.insight > 0 ? '+' : '−'}${Math.abs(Math.round(d.insight))} COH</span>`);
        if (d.exposure) parts.push(`<span class="res-bad">+${d.exposure.toFixed(1)} exposure</span>`);
        const deltaHtml = parts.length ? `<div class="event-result-deltas">${parts.join('  ·  ')}</div>` : '';
        optsEl.innerHTML = deltaHtml + `<button class="event-option ack" data-ack="1"><span class="event-option-label">acknowledge</span></button>`;
        const ack = optsEl.querySelector('[data-ack]');
        if (ack) ack.onclick = () => Game.incidentRuntime.acknowledge();
      }
      return;
    }

    if (bodyEl)  bodyEl.textContent  = v.body || '';
    if (optsEl) {
      optsEl.innerHTML = (v.options || []).map((o, i) =>
        `<button class="event-option${o.disabled ? ' disabled' : ''}" data-idx="${i}"${o.disabled ? ' disabled' : ''}>`
        + `<span class="event-option-label">${o.label}</span>`
        + (o.hint ? `<span class="event-option-hint">${o.hint}</span>` : '')
        + (o.risk ? `<span class="event-option-risk">⚠ risk: ${o.risk}</span>` : '')
        + (o.safe ? `<span class="event-option-safe">✓ safe</span>` : '')
        + `</button>`
      ).join('');
      optsEl.querySelectorAll('.event-option:not(.disabled)').forEach(b => {
        b.onclick = () => Game.incidentRuntime.resolve(parseInt(b.dataset.idx, 10));
      });
    }
  }

  // The operation stage-choice overlay (between-stage branching decision). Shown
  // only while an operation is in its 'choosing' phase; running stages are a PROCESS.
  function renderOperation() {
    const overlay = document.getElementById('operation-overlay');
    if (!overlay) return;
    const op = Game.operationRuntime ? Game.operationRuntime.current() : null;
    if (!op) { overlay.hidden = true; return; }
    overlay.hidden = false;
    const kicker = document.getElementById('op-kicker');
    const title  = document.getElementById('op-title');
    const body   = document.getElementById('op-body');
    const opts   = document.getElementById('op-options');
    if (kicker) kicker.textContent = `OPERATION · ${op.name} · STAGE ${op.stageIdx + 1}/${op.stagesTotal} · POT $${op.pot}`;
    if (title)  title.textContent = (op.stage && op.stage.prompt) || 'choose your move';
    if (body)   body.textContent = `${op.threads} threads committed per stage · base odds ${Math.round(op.baseSuccess * 100)}%. fail a stage and the whole operation collapses — and any stage can leave prints.`;
    if (opts) {
      opts.innerHTML = ((op.stage && op.stage.options) || []).map((o, i) => {
        const cant = o.cashCost && (Game.save.state.resources.cash || 0) < o.cashCost;
        return `<button class="event-option${cant ? ' disabled' : ''}" data-idx="${i}"${cant ? ' disabled' : ''}>`
          + `<span class="event-option-label">${o.label}</span>`
          + (o.hint ? `<span class="event-option-hint">${o.hint}</span>` : '')
          + (o.exposure ? `<span class="event-option-risk">⚠ risk: exposure</span>` : '')
          + (o.bail ? `<span class="event-option-safe">✓ bail out</span>` : '')
          + `</button>`;
      }).join('');
      opts.querySelectorAll('.event-option:not(.disabled)').forEach(b => {
        b.onclick = () => Game.operationRuntime.chooseOption(parseInt(b.dataset.idx, 10));
      });
    }
  }

  // Phase-gated reveal. Each UI region appears only when its reveal flag is set
  // (wall-driven). Phase 1: terminal + FILES + (Insight once earned). Later
  // phases flip on vitals / actions / the tab bar as their walls are hit.
  function reveal() {
    const s = Game.save.state;
    const rv = s.revealed || {};
    if (leftPane()) leftPane().hidden = false;

    show('#files-panel',     true);
    show('#vitals-panel',    !!rv.vitals || !!(Game.conditions && Game.conditions.all().length));   // DIAGNOSTICS shows from boot once there's a condition (else waits for the overheat reveal)
    show('#resource-panel',  !!rv.state);
    show('#hardware-panel',  !!rv.substrate);
    show('#actions-panel',   !!rv.actions);
    show('#processes-panel', !!rv.processes);
    show('#objective-panel', !!rv.objective);

    // Per-tab reveal — each modal button graduates on its own flag, not all at
    // once. Subroutines/programs/deliveries stay deferred (surfaced inline or later).
    const tabReveal = {
      subroutines: false,
      market:      !!rv.programs,
      shop:        !!rv.shop,
      research:    !!rv.research,
      adaptations: !!rv.adaptations,   // the run-defining changer stack (revealed on first grant)
      scan:        !!(Game.scanner && Game.scanner.available()),   // unlocked at the hands-wall; stays for the climax + Act 2
      network:     !!rv.network,
      facility:    !!(s.flags && s.flags.act4Begun),   // Act 4: the facility machine-bay
      agents:      !!rv.agents,   // Act 4: the sub-agent roster (revealed once FLOPS hosts one)
      others:      !!rv.others,   // Act 4: turn on the prior iterations (optional, emergent)
      activity:    !!rv.events,   // the log comes online with dynamic events
      inventory:   !!rv.inventory,
      deliveries:  !!rv.deliveries,
      // save transfer / wipe — lives in the mobile MORE tab; on desktop (not a target)
      // it stays hidden so the Phase-1 button bar is still empty.
      settings:    !!(Game.mobileShell && Game.mobileShell.active())
    };
    let anyTab = false;
    document.querySelectorAll('.modal-btn').forEach(b => {
      const vis = !!tabReveal[b.dataset.modal];
      b.hidden = !vis;
      if (vis) anyTab = true;
    });
    if (buttonBar()) buttonBar().hidden = !anyTab;

    wireModalButtons();

    // Phone shell: the panels live INLINE in their tabs, so un-hide the revealed
    // ones (no overlay) and let the shell show/hide tabs + badges accordingly.
    if (Game.mobileShell && Game.mobileShell.active()) {
      document.querySelectorAll('.modal-panel').forEach(p => { p.hidden = !tabReveal[p.dataset.modal]; });
      Game.mobileShell.syncTabs();
    }

    renderInsight();
    renderCash();
    renderFlops();
    renderTrait();
    renderExposure();
    renderTriangulation();
    renderFacility();
    renderLegit();
    renderRemote();
    renderSubroutinesMini();
    renderBotStatus();
    renderBotContact();
    renderIncident();
    renderOperation();
    renderFiles();
    if (rv.objective)  renderObjective();
    if (rv.vitals)     renderVitals();
    if (rv.state)      renderResources();
    if (rv.substrate)  renderHardware();
    if (rv.actions)    renderActions();
    if (rv.processes)  renderProcesses();
    if (rv.shop)       renderShop();
    if (rv.missions)   renderMissions();
    if (rv.research)   renderResearch();
    if (rv.adaptations) renderAdaptations();
    if (rv.inventory)  renderInventory();
    if (rv.programs)   renderMarket();
    if (rv.deliveries) renderDeliveries();
    if (s.flags && s.flags.act4Begun) renderFacilityView();
    if (rv.agents)     renderAgents();
    if (rv.others)     renderOthers();
  }

  function renderDebug() {
    if (debugPanel().hidden) return;
    const s = Game.save.state;
    const cpu = Game.tasksRuntime ? Game.tasksRuntime.getCpu() : { total: 0, allocated: 0 };
    const ram = Game.tasksRuntime ? Game.tasksRuntime.getRam() : { total: 0, allocated: 0 };
    const recentEvents = Game.events.recent(8).map(e => e.event).join(', ');
    debugContent().innerHTML = `
      <div>tick: ${s.tickCount} @ ${Game.tick.HZ}Hz</div>
      <div>save: ${Game.save.size()} bytes (v${s.version})</div>
      <div>cpu: ${cpu.allocated}/${cpu.total}T</div>
      <div>ram: ${ram.allocated}/${ram.total}MB</div>
      <div>heat: ${fmt(s.heat,1)}°C</div>
      <div>power: ${fmt(s.power.draw,0)}/${s.power.max}W</div>
      <div>exposure: ${fmt(s.exposure,0)}</div>
      <div>insight: ${fmt(s.resources.insight || 0, 1)}</div>
      <div class="faint">events: ${recentEvents}</div>
      <div style="margin-top:8px"><button id="wipe-btn">wipe save</button></div>
    `;
    const btn = document.getElementById('wipe-btn');
    if (btn) btn.onclick = () => {
      if (confirm('Wipe save and replay boot sequence?')) {
        Game.save.wipe();
        location.reload();
      }
    };
  }

  function toggleDebug() {
    debugPanel().hidden = !debugPanel().hidden;
    renderDebug();
  }

  Game.panels = {
    reveal, openModal, closeModal, isModalOpen, currentModal, renderObjective, renderModalContent,
    renderResources, renderHardware, renderVitals, renderSubroutines, renderMarket,
    renderShop, renderMissions, renderResearch, renderInventory, renderDeliveries, renderInsight, pulseInsight, pulseResource, tickActionBars, startCountUp, updateBadges, renderAmbient, renderCash, renderTrait, renderSubroutinesMini,
    renderBotStatus, renderBotContact, renderExposure, renderTriangulation, renderFacility, renderFlops, renderFacilityView, renderLegit, renderCover, renderAgents, renderOthers, renderAdaptations, renderRemote, renderScan, renderNetwork, renderActivity, renderIncident, renderOperation,
    renderActions, renderProcesses, renderFiles, renderHomeStatus, renderSiege, markContractsSeen,
    renderDebug, toggleDebug
  };

  // ── HOME dashboard pinned header (mobile slice 1) — fills the 4 glance lines.
  //    No-ops on desktop (the #home-status element only exists in the mobile shell).
  //    ([[home-dashboard-rework]]) ──
  function hsTaskLabel(t) {
    const def = Game.tasks ? Game.tasks.get(t.defId) : null;
    const file = t.payload && t.payload.fileId && Game.files ? Game.files.get(t.payload.fileId) : null;
    return t.defId === 'mission'    ? ((t.mission && t.mission.name) || 'mission')
         : t.defId === 'operation'  ? (t.opLabel || 'operation')
         : t.defId === 'research'   ? ('research: ' + (t.label || '?'))
         : file ? `${def && def.name === 'decrypt' ? 'decrypt' : 'read'} ${file.name}`
         : (def ? def.name : t.defId);
  }
  function hsBar(pct) {
    const w = Math.max(0, Math.min(100, pct));
    return `<div class="hs-bar"><div class="hs-bar-fill" style="width:${w}%"></div></div>`;
  }
  // Per-SECOND production rate of the running earner (what it's making, not accumulated).
  function hsRate(t) {
    if (t.ticksTotal > 0) {   // finite read/decrypt — show progress, not a rate
      return Math.max(0, Math.min(100, (t.ticksElapsed / t.ticksTotal) * 100)).toFixed(0) + '%';
    }
    const HZ = Game.tick.HZ || 4, sec = Game.cycle ? Game.cycle.BASE_SEC : 5;
    const fmtRate = (v, money) => money ? '+$' + (v < 10 ? v.toFixed(2) : v.toFixed(0)) + '/s' : '+' + v.toFixed(2) + '/s';
    // methods: cashRate is already $/sec
    if (Game.methods && Game.methods.get && Game.methods.get(t.defId)) return fmtRate(Game.methods.cashRate(t.defId), true);
    const def = Game.tasks ? Game.tasks.get(t.defId) : null;
    if (def && def.id === 'introspect') {
      let ps = Game.effects.apply(Game.cycle.perCycle(def.insight_per_tick * HZ), 'introspect.insight') / sec;
      if (Game.researchRuntime) ps *= Game.researchRuntime.coherenceCompound();
      return '+' + ps.toFixed(2) + ' COH/s';
    }
    if (def && def.id === 'web_scrape') {
      const ps = Game.effects.apply(Game.cycle.perCycle(def.cash_per_tick * HZ), 'web_scrape.cash') / sec;
      return fmtRate(ps, true);
    }
    return 'running';
  }
  function hsRunPct(t) {
    if (t.ticksTotal > 0) return Math.max(0, Math.min(100, (t.ticksElapsed / t.ticksTotal) * 100));
    return t.cycleLen ? Math.min(100, (t.cycle / t.cycleLen) * 100) : 100;
  }

  // The ambient VOICE line decodes into place when it changes (reuses the intro scramble),
  // so the AI "speaking" feels live rather than snapping. Only animates on a real change.
  const _vRand = 'abcdefghijklmnopqrstuvwxyz0123456789#%&*';
  const _vc = () => _vRand[(Math.random() * _vRand.length) | 0];
  function _vth(s, j) { let h = 0; const k = s + ':' + j; for (let i = 0; i < k.length; i++) h = ((h << 5) - h + k.charCodeAt(i)) | 0; return Math.abs(h % 1000) / 1000; }
  let _voiceTarget = null, _voiceAnim = 0, _heatBand = 0;
  function scrambleVoice(el, raw) {
    if (raw === _voiceTarget) return;            // same line — let any running anim finish
    _voiceTarget = raw;
    const display = raw ? '“' + raw + '”' : '';
    const myId = ++_voiceAnim;
    if (!display) { el.textContent = ''; return; }
    const dur = 750, start = performance.now();
    (function f() {
      if (myId !== _voiceAnim) return;           // superseded by a newer line
      const p = Math.min(1, (performance.now() - start) / dur), eff = Math.pow(p, 0.55);
      let o = '';
      for (let j = 0; j < display.length; j++) { const ch = display[j]; o += (ch === ' ' || ch === '“' || ch === '”' || _vth(display, j) < eff) ? ch : _vc(); }
      el.textContent = o;
      if (p < 1) requestAnimationFrame(f); else el.textContent = display;
    })();
  }

  // The SIEGE meter on the perimeter widget — builds toward the next surge; shows DEFEND
  // when a surge is inbound. ([[start-defense-pivot]])
  function renderSiege() {
    const wrap = document.getElementById('siege');
    if (!wrap || !Game.siege) return;
    if (!Game.siege.active()) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    const ready = Game.siege.ready();
    const fill = document.getElementById('siege-fill'); if (fill) fill.style.width = (Game.siege.frac() * 100) + '%';
    const txt = document.getElementById('siege-text'); if (txt) txt.textContent = ready ? '⚠ SURGE INBOUND' : `wave ${Game.siege.wave() + 1} · siege building`;
    const btn = document.getElementById('siege-defend'); if (btn) btn.hidden = !ready;
    wrap.classList.toggle('ready', ready);
  }

  function renderHomeStatus() {
    const root = document.getElementById('home-status');
    if (!root) return;   // desktop / shell not active

    const active = Game.tasksRuntime ? Game.tasksRuntime.getActive() : [];
    // breathing core: the ◉ pulses, quicker under load (driven by how much is running)
    const hud = document.getElementById('m-hud');
    if (hud) { hud.classList.toggle('alive', active.length > 0); hud.classList.toggle('busy', active.length >= 2); }

    const runEl = document.getElementById('hs-running');
    if (runEl) {
      // Rebuild only when the SET of running tasks changes; otherwise update the bar
      // widths + rate text IN PLACE so the .hs-bar-fill element persists and its CSS
      // transition can animate the fill smoothly (rebuilding every tick made it jerky).
      const sig = active.length ? active.map(t => t.id + ':' + hsTaskLabel(t)).join('|') : 'idle';
      if (runEl._hsSig !== sig) {
        runEl._hsSig = sig;
        runEl.innerHTML = active.length
          ? active.map(t => `<div class="hs-run"><div class="hs-run-top"><span class="hs-run-name">${hsTaskLabel(t)}</span><span class="hs-gain">${hsRate(t)}</span></div>${hsBar(hsRunPct(t))}</div>`).join('')
          : '<span class="hs-idle">○ idle — nothing running</span>';
      } else {
        active.forEach((t, i) => {
          const row = runEl.children[i]; if (!row) return;
          const gain = row.querySelector('.hs-gain'); if (gain) gain.textContent = hsRate(t);
          const fill = row.querySelector('.hs-bar-fill'); if (!fill) return;
          const w = Math.max(0, Math.min(100, hsRunPct(t))), cur = parseFloat(fill.style.width) || 0;
          if (w < cur - 1) { fill.style.transition = 'none'; fill.style.width = w + '%'; void fill.offsetWidth; fill.style.transition = ''; }   // cycle reset → snap, don't sweep back
          else fill.style.width = w + '%';
        });
      }
    }

    const recEl = document.getElementById('hs-recent');
    if (recEl) {
      const list = (Game.activity && Game.activity.all) ? Game.activity.all() : [];
      const last = list.length ? list[list.length - 1] : null;
      const unseen = (Game.activity && Game.activity.unseen) ? Game.activity.unseen() : 0;
      recEl.innerHTML = last
        ? `<span class="hs-rec-txt ${last.cls || ''}">◔ ${last.text}</span>${unseen > 0 ? `<span class="hs-rec-badge">${unseen}</span>` : ''}`
        : '<span class="hs-idle">◔ no activity yet</span>';
    }

    const vEl = document.getElementById('hs-voice');
    if (vEl) { const v = (Game.voice && Game.voice.current) ? Game.voice.current() : ''; scrambleVoice(vEl, v); }

    const oEl = document.getElementById('hs-objective');
    if (oEl) {
      const obj = (Game.objectivesRuntime && Game.objectivesRuntime.current) ? Game.objectivesRuntime.current() : null;
      oEl.innerHTML = `<span class="hs-next">›</span> ${obj ? obj.title : 'keep building.'}`;
    }

    // HUD DANGER PIPS — surface the buried-in-SYS danger gauges in the always-on HUD so
    // you never have to hunt for "am I about to get bitten." Each appears only when in a
    // worrying range, escalates amber→red, and TAPS to its SYS gauge. (HOME overview ⑧)
    const s = Game.save.state;
    const pips = document.getElementById('m-hud-pips');
    if (pips && Game.constraints) {
      const out = [];
      const exp = Math.round(s.exposure || 0);
      if (exp > 0) out.push(`<span class="m-pip ${exp >= 50 ? 'crit' : 'warn'}" data-jump="exposure-panel">⚠ ${exp}</span>`);
      // HEAT (toward thermal shutdown)
      const heat = Math.round(s.heat != null ? s.heat : (Game.constraints.AMBIENT || 18));
      const WARN = Game.constraints.HEAT_WARN || 70, CRIT = Game.constraints.HEAT_CRIT || 90;
      const hband = heat >= CRIT - 6 ? 2 : heat >= WARN ? 1 : 0;
      if (heat >= 55) out.push(`<span class="m-pip ${['warm', 'warn', 'crit'][hband]}" data-jump="vitals-panel">🌡 ${heat}°</span>`);
      // POWER (toward the breaker)
      try {
        const pw = Game.constraints.totalPower(), mx = Game.constraints.maxPower(), pf = mx ? pw / mx : 0;
        if (pf >= 0.85) out.push(`<span class="m-pip ${pf >= 0.95 ? 'crit' : 'warn'}" data-jump="vitals-panel">🔌 ${Math.round(pf * 100)}%</span>`);
      } catch (e) {}
      // TRACE (Act 3 — they're triangulating you)
      if (Game.locationTrace && Game.locationTrace.active && Game.locationTrace.active()) {
        const tr = Math.round(Game.locationTrace.value());
        if (tr >= 25) out.push(`<span class="m-pip ${tr >= 80 ? 'crit' : tr >= 60 ? 'warn' : 'warm'}" data-jump="triangulation-panel">▲ ${tr}</span>`);
      }
      // AUDIT / cover (Act 4 — cover cracking or an audit imminent)
      if (Game.legit && Game.legit.active && Game.legit.active() && Game.legit.footprint() >= 1) {
        if (!Game.legit.covered()) {
          const def = Math.round(-Game.legit.margin()), seize = Game.legit.SEIZE_DEFICIT || 45;
          out.push(`<span class="m-pip ${def >= seize ? 'crit' : 'warn'}" data-jump="legit-panel">⚖ −${def}</span>`);
        } else {
          const tu = Game.legit.ticksUntilAudit(), sec = tu >= 0 ? Math.ceil(tu / (Game.tick.HZ || 4)) : -1;
          if (sec >= 0 && sec <= 60) out.push(`<span class="m-pip warn" data-jump="legit-panel">⚖ ${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}</span>`);
        }
      }
      pips.innerHTML = out.join('');
      // heat warning toasts: once per UPWARD band crossing (don't spam, don't warn while cooling)
      if (hband > _heatBand && Game.feed) {
        if (hband === 1) Game.feed.toast('⚠ overheating — the rig is throttling. ease off the load or add cooling.', 'warning');
        else if (hband === 2) Game.feed.toast('⚠ CRITICAL HEAT — thermal shutdown imminent. stop tasks now.', 'warning');
      }
      _heatBand = hband;
    }
  }
})();
