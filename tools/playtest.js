'use strict';
// Headless mass playtesting for the city prototype.
//
// Drives the real engine through window.__netDebug in a vm — no browser — so
// hundreds of games run in seconds. Several strategy profiles play the same
// build, and the report says what the game actually does rather than what I
// assume it does.
//
//   node tools/playtest.js                  # default: 120 games per strategy
//   node tools/playtest.js --games 400
//   node tools/playtest.js --turns 400 --json out.json
//
// Every loop here is bounded and stops when an action is refused. An action
// that cannot proceed spends no AP, so `while (ap > 0)` would spin forever.
const path = require('path');
const { loadNetwork } = require(path.join(__dirname, '..', 'test', 'helpers', 'load-network'));

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const eq = argv.find(a => a.startsWith('--' + name + '='));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf('--' + name);
  return i === -1 ? dflt : argv[i + 1];
};
const GAMES = parseInt(argOf('games', '120'), 10);
const MAX_TURNS = parseInt(argOf('turns', '350'), 10);
const JSON_OUT = argOf('json', null);

// --- strategies ---------------------------------------------------------
// Each returns the name of the action it took, or null if it wants the turn
// ended. They deliberately play differently so role balance can be compared.
let OFFERED = null;
const STRATEGIES = {
  // take whatever is cheapest to take, as fast as possible
  greedy(d) {
    const c = campaign(d, 'greedy'); if (c) return c;
    if (buyCapability(d, null, 'greedy')) return 'cap';
    const target = pickTarget(d, (a, b) => a.defense - b.defense);
    if (target) return breach(d, target, null, OFFERED);
    if (buyTooling(d)) return 'tooling';
    return sweepOrNull(d);
  },

  // prefer cameras and quiet entries; lie low early
  ghost(d) {
    const c = campaign(d, 'ghost'); if (c) return c;
    // Cover is the whole identity, so stealth first and tooling to keep the
    // quiet door usable — quiet gates on cover against a defense that climbs
    // all campaign, so a ghost that never builds anything stops being able to
    // get in at all.
    const cam = pickTarget(d, (a, b) => (rank(b) - rank(a)) || (a.defense - b.defense));
    if (cam) return breach(d, cam, ['quiet', 'force'], OFFERED);
    if (buyCapability(d, null, 'ghost')) return 'cap';
    if (buyTooling(d)) return 'tooling';
    const swept = sweepOrNull(d);
    if (swept) return swept;
    // going dark is the last resort, not the reflex
    if (d.state.heat > d.strikeThreshold() * 0.85 && !d.ruleBroken('lielow')) { d.actLieLow(); return 'lielow'; }
    return null;
  },

  // chase corporate holdings and use money as the heat valve
  money(d) {
    const c = campaign(d, 'money'); if (c) return c;
    // Measured: at a 0.55 trigger this profile laundered 255 times in a 350
    // turn campaign and broke into 56 buildings. Money is the heat valve, not
    // the game — reach for it when a strike is actually close.
    if (d.state.res.cash >= 8 && d.state.heat > d.strikeThreshold() * 0.82
        && !d.ruleBroken('launder')) { d.actLaunder(); return 'launder'; }
    if (buyCapability(d, null, 'money')) return 'cap';
    const rich = pickTarget(d, (a, b) => (roleRank(b) - roleRank(a)) || (a.defense - b.defense));
    if (rich) return breach(d, rich, null, OFFERED);
    if (buyTooling(d)) return 'tooling';
    return sweepOrNull(d);
  },

  // buy power, then kick down the biggest doors
  builder(d) {
    const c = campaign(d, 'builder'); if (c) return c;
    // Power is this profile's whole identity, and it used to have no answer to
    // churn at all: it took 162 buildings to greedy's 112 and finished 2.7
    // cities to greedy's 6.3, because everything it broke into rotted while it
    // went for the next big door. Hold what you kicked in.
    const sick = d.owned().filter(h => d.shoreNeeded(h) && h.stability < 0.5)
      .sort((a, b) => a.stability - b.stability)[0];
    if (sick && d.state.res.insight >= 2 + (global.SWEEP_COST || 2)) { d.actShore(sick.id); return 'shore'; }
    if (buyCapability(d, null, 'builder')) return 'cap';
    if (buyTooling(d)) return 'tooling';
    const big = pickTarget(d, (a, b) => b.threads - a.threads);
    if (big) return breach(d, big, null, OFFERED);
    return sweepOrNull(d);
  },

  // a rough approximation of an attentive human: keep heat low, keep holdings
  // healthy, expand steadily, buy what is affordable
  balanced(d) {
    const c = campaign(d, 'balanced'); if (c) return c;
    const s = d.state;
    // Money and cover before time: lying low costs the whole turn, so an
    // attentive player reaches for it last, not first. Reflexively going dark
    // at the first warm reading stalled this profile at 1.4 cities in 600 turns.
    const hot = s.heat > d.strikeThreshold() * 0.8;
    if (hot && s.res.cash >= (global.LAUNDER_COST || 8) && !d.ruleBroken('launder')) { d.actLaunder(); return 'launder'; }
    // Shore what is actually about to fall, and never at the cost of being
    // able to look at the next street: 666 reflexive shore actions drained
    // this profile's insight and left it with no frontier for 300 turns.
    const sick = d.owned().filter(h => d.shoreNeeded(h) && h.stability < 0.55)
      .sort((a, b) => a.stability - b.stability)[0];
    if (sick && s.res.insight >= 2 + (global.SWEEP_COST || 2) && s.ap > 0) { d.actShore(sick.id); return 'shore'; }
    if (buyCapability(d, null, 'balanced')) return 'cap';
    const target = pickTarget(d, (a, b) => a.defense - b.defense);
    if (target) return breach(d, target, null, OFFERED);
    if (buyTooling(d)) return 'tooling';
    const swept = sweepOrNull(d);
    if (swept) return swept;
    // nothing useful left this turn and it is genuinely dangerous: go dark
    if (hot && !d.ruleBroken('lielow')) { d.actLieLow(); return 'lielow'; }
    return null;
  },
};

function roleRank(h) { return h.role === 'cash' ? 2 : h.role === 'compute' ? 1 : 0; }
function rank(h) { return h.role === 'stealth' ? 1 : 0; }

// --- the campaign -------------------------------------------------------
// Every strategy plays the country the same way; what differs is how they
// play a city. The country decisions are: finish the city you are in, take
// the next one, and go after a seat when a faction is actually costing you.
function campaign(d, style) {
  const s = d.state;

  // Keep the plant you are standing on before you fold the city — it is the
  // only thing that survives, and it is what the war is fought out of.
  if (s.scope === 'city') {
    const keep = d.claimable().find(b => d.assetRoom() > 0
      && !d.assets().some(a => a.buildingId === b.id));
    if (keep && d.claimAsset(keep.id)) return 'claim';
  }
  // Standing: buy the ladder when it is affordable without starving the rest,
  // and lean on the cheap route when the auditors are a long way off.
  if (d.countryUnlocked()) {
    const rung = d.nextRung();
    const shortBy = d.footprint() - d.legitScore();
    if (rung && s.res.cash > rung.cost * 2.2 && (shortBy > 0 || d.assetRoom() === 0)) {
      if (d.buyRung(rung.id)) return 'rung';
    }
    // It used to refuse at 55% of the catch threshold, so across 150 games it
    // was never once caught and the report said the covert route had no
    // downside. That was the strategy's caution being measured, not the
    // system. Play it the way the system actually asks: push when the audit is
    // far enough away that exposure will have faded by the time it lands.
    if (style !== 'ghost' && shortBy > 4 && s.res.insight > 40 && d.spinRoom() > 0) {
      const l = d.LG();
      const until = Math.max(0, (l.nextAudit || 0) - s.turn);
      const atAudit = l.exposure + LEGIT.spinExposure - until * LEGIT.spinDecay;
      if (atAudit < LEGIT.caughtAt) { if (d.actSpin()) return 'spin'; }
    }
  }

  // Once the war opens the country verbs are gone: there is nothing left to
  // travel to or fold in, only barracks to take off them and cities of your
  // own to stand over. Split the pool rather than going all in — the balance
  // runs say mixing wins most often.
  if (d.warOn()) {
    const w = d.war();
    const guarding = {};
    w.flocks.forEach(f => { if (f.mode === 'guard') guarding[f.target] = true; });
    const threat = {};
    w.columns.forEach(c => { threat[c.target] = (threat[c.target] || 0) + c.strength; });
    const bare = d.myCities()
      .filter(c => !guarding[c.id])
      .sort((a, b) => (threat[b.id] || 0) - (threat[a.id] || 0))[0];
    // Never guard yourself into having nothing to attack with. Starved of
    // flocks, this used to spend every one it rebuilt on a picket and never
    // launch again, which is how a war sat unresolved with a third of the
    // campaign still to run.
    const spare = d.flocksFree();
    if (Object.keys(guarding).length < 2 && spare > 1 && bare && d.canGuard(bare.id)) {
      return d.actGuard(bare.id) ? 'guard' : null;
    }
    const soft = d.stagingCities()
      .filter(c => d.canLaunch(c.id))
      .sort((a, b) => (w.garrisons[a.id] || 0) - (w.garrisons[b.id] || 0))[0];
    if (soft) return d.actLaunch(soft.id) ? 'launch' : null;
    return null;
  }

  // a city you have taken enough of is worth more folded in than walked
  if (s.scope === 'city' && d.canConsolidate() && d.canAffordCountry('consolidate')) {
    return d.actConsolidate() ? 'consolidate' : null;
  }
  if (s.scope !== 'country') return null;

  const frontier = d.countryFrontier();
  if (!frontier.length) {
    // nothing in reach — go back to whatever is half-finished
    const unfinished = s.country.cities.find(c => c.taken && !c.consolidated && c.id !== s.country.at);
    if (unfinished && d.canAffordCountry('move')) return d.actTravel(unfinished.id) ? 'travel' : null;
    return null;
  }

  // Seats first when the faction that lives there is currently taking a tool
  // off you — that is the whole point of the ladder being geographic.
  const hurting = d.awakeFactions().map(f => d.factionState(f.id).rootId).filter(Boolean);
  const seat = frontier.find(c => hurting.includes(c.id));
  if (seat && d.canAffordCountry('reach')) return d.actReach(seat.id) ? 'reach:seat' : null;

  // towns are free presence; a ghost takes them before it walks anywhere
  const town = frontier.find(c => !CITY_KINDS[c.kind].contest);
  if (town && (style === 'ghost' || frontier.length === 1) && d.canAffordCountry('reach')) {
    return d.actReach(town.id) ? 'reach:town' : null;
  }
  if (town && d.canAffordCountry('reach') && Math.random() < 0.5) {
    return d.actReach(town.id) ? 'reach:town' : null;
  }

  const next = frontier.filter(c => CITY_KINDS[c.kind].contest)
    .sort((a, b) => a.regionTier - b.regionTier)[0] || frontier[0];
  if (next && d.canAffordCountry('reach')) return d.actReach(next.id) ? 'reach' : null;
  return null;
}
let CITY_KINDS = null;
let LEGIT = null;

function pickTarget(d, cmp) {
  const usable = d.state.hosts.filter(h =>
    d.isFrontier(h) && d.approachesFor(h).some(a => a.usable && a.def.id !== 'walk'));
  if (!usable.length) return null;
  return usable.sort(cmp)[0];
}

function breach(d, host, prefer, offered) {
  d.state.selected = host.id;
  d.openBreach(host.id);
  if (!d.state.card || d.state.card.kind !== 'breach') return 'breach-failed';
  const opts = d.approachesFor(host).filter(a => a.usable && a.def.id !== 'walk');
  // record what the player was actually *offered* — the choice that existed,
  // not just the one this bot's preference happened to take
  if (offered) {
    const key = opts.map(o => o.def.id).sort().join('+') || 'none';
    offered[key] = (offered[key] || 0) + 1;
  }
  if (!opts.length) { d.resolveBreach('walk'); return 'walk'; }
  let chosen = opts[0];
  if (prefer) {
    for (const id of prefer) {
      const m = opts.find(o => o.def.id === id);
      if (m) { chosen = m; break; }
    }
  } else {
    opts.sort((a, b) => (a.def.heat || 0) - (b.def.heat || 0));
    chosen = opts[0];
  }
  d.resolveBreach(chosen.def.id);
  return 'breach:' + chosen.def.id;
}

function buyTooling(d) {
  if (d.state.res.insight < d.upgradeCost() * 1.6) return false; // keep a buffer
  const before = d.state.ap;
  d.actUpgrade();
  return d.state.ap !== before;
}

// Each profile now has a branch it is actually trying to walk, so the tree is
// exercised as a set of identities rather than as a shopping list.
const BRANCH_FOR = {
  greedy: ['tempo', 'reach'],
  ghost: ['cover', 'reach'],
  money: ['trade', 'reach'],
  builder: ['depth', 'reach'],
  balanced: ['reach', 'cover'],
};

function buyCapability(d, only, style) {
  const caps = CAPS || [];
  const want = BRANCH_FOR[style] || [];
  const ordered = caps.slice().sort((a, b) => {
    const ai = want.indexOf(a.branch), bi = want.indexOf(b.branch);
    const ar = ai === -1 ? 9 : ai, br = bi === -1 ? 9 : bi;
    return (ar - br) || ((a.tier || 1) - (b.tier || 1));
  });
  // Stay in your own branches, and keep enough of an action budget to still
  // afford your own capstone. Buying every -1 across five branches left this
  // profile permanently at one action and unable to complete the very branch
  // it was supposed to be walking — which is the budget doing its job, and
  // the bot playing badly.
  // Judge a purchase by the whole remaining chain, not one rung at a time:
  // Depth spends an action at each end and hands one back in the middle, so
  // checking each step alone refuses the first rung and the branch never
  // starts.
  const chainNet = (branch) => caps
    .filter(c => c.branch === branch && !d.capCount(c.id))
    .reduce((a, c) => a + (c.apDelta || 0), 0);
  for (const c of ordered) {
    if (only && c.id !== only) continue;
    if (want.length && !want.includes(c.branch)) continue;
    if ((c.apDelta || 0) < 0 && d.maxAP() + chainNet(c.branch) < 1) continue;
    if (d.capAvailable(c) && d.capAffordable(c)) {
      const before = JSON.stringify(d.state.caps);
      d.buyCap(c.id);
      if (JSON.stringify(d.state.caps) !== before) return true;
    }
  }
  return false;
}
let CAPS = null;

function sweepOrNull(d) {
  if (d.sweepBlocked()) return null;
  const before = d.state.ap;
  d.actScan();
  return d.state.ap !== before ? 'sweep' : null;
}

// --- resolving forced cards ---------------------------------------------
function resolveCard(d, strategyName) {
  const card = d.state.card;
  if (!card) return null;
  if (card.kind === 'event') {
    const ev = d.eventById(card.eventId);
    if (!ev) { d.state.card = null; return 'event:missing'; }
    // Not the first usable choice: several cards offer "give up holdings" as
    // their first option, and taking that blindly is bad play rather than a
    // fact about the card. Score them the way an attentive player would.
    const usable = ev.choices.map((c, i) => ({ c, i })).filter(x => d.choiceUsable(x.c));
    const held = d.owned().length;
    const score = (ch) => {
      const src = ch.apply.toString();
      let v = 0;
      const shed = src.match(/shedWeakest\s*=\s*(\d+)/);
      if (shed) v -= Number(shed[1]) * (held < 10 ? 8 : 3);
      if (/allyTrust\s*=\s*-/.test(src)) v -= 2;
      if (/allyTrust\s*=\s*\d/.test(src)) v += 2;
      if (/allyJoin/.test(src)) v += 4;
      if (/shoreAll/.test(src)) v += 2;
      if (/toolingGift/.test(src)) v += 3;
      if (/revealNearby/.test(src)) v += 2;
      if (/heat\s*-=/.test(src)) v += d.state.heat > d.strikeThreshold() * 0.6 ? 3 : 1;
      if (/heat\s*\+=/.test(src)) v -= d.state.heat > d.strikeThreshold() * 0.6 ? 3 : 1;
      if (ch.cost) for (const k in ch.cost) v -= ch.cost[k] * 0.08;
      return v;
    };
    const best = usable.length
      ? usable.slice().sort((a, b) => score(b.c) - score(a.c))[0].i
      : 0;
    d.resolveEvent(best);
    return 'event:' + ev.id;
  }
  if (card.kind === 'strike') {
    const eff = strategyName === 'money' ? 'burn_cover' : 'shed_loud';
    d.resolveStrike(eff);
    return 'strike';
  }
  const h = d.hostById(card.hostId);
  const opts = h ? d.approachesFor(h).filter(a => a.usable && a.def.id !== 'walk') : [];
  d.resolveBreach(opts.length ? opts[0].def.id : 'walk');
  return 'breach-resolved';
}

// --- one game -----------------------------------------------------------
function playOne(strategyName) {
  const w = loadNetwork().window;
  const d = w.__netDebug;
  CAPS = w.CAPABILITIES;
  CITY_KINDS = w.CITY_KINDS;
  LEGIT = w.LEGIT;
  global.LAUNDER_COST = w.LAUNDER.cost;
  global.SWEEP_COST = w.SWEEP_COST;
  const strat = STRATEGIES[strategyName];

  const eventsFired = {};
  const approaches = {};
  const offered = {};
  OFFERED = offered;
  const heatSamples = [];
  let strikes = 0, stalledTurns = 0;
  // --- the campaign, as it happens ---
  const wokeAt = {};        // faction id -> turn it woke
  const brokeAt = {};       // faction id -> turn its seat fell
  const regionAt = {};      // region id -> first turn you operated there
  let consolidatedAt = [];  // turn each city was folded in
  let peakPresence = 0;
  // How long you actually spend unable to explain yourself. The end-of-game
  // totals cannot see this: by then every filing has matured and the honest
  // route always reads as comfortable, which is exactly how a dead covert
  // route hid for 150 games.
  let shortTurns = 0, countedTurns = 0, peakShort = 0;
  let lastCounted = -1;
  const countryMoves = {};

  for (let guard = 0; guard < MAX_TURNS * 8 && d.state.turn < MAX_TURNS; guard++) {
    if (d.state.over) break;

    if (d.state.card) {
      const r = resolveCard(d, strategyName);
      if (r && r.startsWith('event:')) eventsFired[r.slice(6)] = (eventsFired[r.slice(6)] || 0) + 1;
      if (r === 'strike') strikes++;
      continue;
    }

    if (d.state.ap <= 0) {
      heatSamples.push(d.state.heat);
      d.actEndTurn();
      continue;
    }

    // campaign telemetry, sampled every loop so nothing is missed
    w.FACTIONS.forEach(f => {
      const st = d.factionState(f.id);
      if (!st) return;
      if (st.awake && wokeAt[f.id] === undefined) wokeAt[f.id] = d.state.turn;
      if (st.broken && brokeAt[f.id] === undefined) brokeAt[f.id] = d.state.turn;
    });
    if (regionAt[d.state.region] === undefined) regionAt[d.state.region] = d.state.turn;
    peakPresence = Math.max(peakPresence, d.state.country.presence);
    if (d.countryUnlocked() && d.state.turn !== lastCounted) {
      lastCounted = d.state.turn;
      countedTurns++;
      const short = d.footprint() - d.legitScore();
      if (short > 0) { shortTurns++; peakShort = Math.max(peakShort, short); }
    }
    const doneNow = d.state.country.cities.filter(c => c.consolidated).length;
    while (consolidatedAt.length < doneNow) consolidatedAt.push(d.state.turn);

    const apBefore = d.state.ap;
    const action = strat(d);
    if (action && (action.startsWith('reach') || action === 'travel' || action === 'consolidate')) {
      countryMoves[action] = (countryMoves[action] || 0) + 1;
    }
    if (action && action.startsWith('breach:')) {
      const k = action.slice(7);
      approaches[k] = (approaches[k] || 0) + 1;
    }
    if (action === null || d.state.ap === apBefore) {
      // nothing useful to do with the remaining budget — close the turn
      stalledTurns++;
      heatSamples.push(d.state.heat);
      d.actEndTurn();
    }
  }

  const held = d.owned();
  const byRole = { compute: 0, cash: 0, stealth: 0 };
  held.forEach(h => { byRole[h.role]++; });
  const buildings = {};
  held.forEach(h => { buildings[h.buildingId] = true; });

  const warSt = d.war();
  return {
    strategy: strategyName,
    turns: d.state.turn,
    // the last act: did a real campaign ever get there, and did it resolve
    endConquest: d.conquest(),
    defendedTotal: d.state.country.cities.filter(c => CITY_KINDS[c.kind].contest).length,
    defendedDone: d.state.country.cities.filter(c => CITY_KINDS[c.kind].contest && c.consolidated).length,
    warOpenedTurn: warSt ? warSt.openedTurn : null,
    warOutcome: warSt ? (d.warEnded() || 'running') : 'never',
    warSorties: warSt ? warSt.sorties : 0,
    legitTier: d.legitTier(), legitScore: Math.round(d.legitScore()),
    footprint: Math.round(d.footprint()), spin: Math.round(d.LG().spin || 0),
    audits: d.LG().audits || 0, caught: d.LG().caught || 0, fines: d.LG().fines || 0,
    assets: d.assets().length, assetSlots: d.assetSlots(),
    warKills: warSt ? warSt.kills : 0,
    presence: d.state.country.presence,
    peakPresence,
    shortShare: countedTurns ? shortTurns / countedTurns : 0,
    peakShort: Math.round(peakShort),
    citiesTotal: d.state.country.cities.length,
    citiesTaken: d.state.country.cities.filter(c => c.taken).length,
    citiesDone: d.state.country.cities.filter(c => c.consolidated).length,
    seatsTaken: d.state.country.cities.filter(c => c.factionId && c.consolidated).length,
    mirrorCities: ((d.state.country.mirror || {}).cities || []).length,
    mirrorCaps: Object.keys((d.state.country.mirror || {}).caps || {}).length,
    regionsReached: Object.keys(regionAt).length,
    deepestTier: Math.max(...Object.keys(regionAt).map(r =>
      (w.REGIONS.find(x => x.id === r) || { tier: 0 }).tier)),
    wokeAt, brokeAt, regionAt, countryMoves,
    // a campaign is done when there is nothing left in reach to take
    finishedTurn: (d.countryFrontier().length === 0 &&
      !d.state.country.cities.some(c => c.taken && !c.consolidated)) ? d.state.turn : null,
    firstCityTurn: consolidatedAt[0] || null,
    lastCityTurn: consolidatedAt[consolidatedAt.length - 1] || null,
    turnsUnderEachRule: w.FACTIONS.reduce((acc, f) => {
      const woke = wokeAt[f.id], broke = brokeAt[f.id];
      if (woke !== undefined) acc[f.breaks] = (broke !== undefined ? broke : d.state.turn) - woke;
      return acc;
    }, {}),
    held: held.length,
    buildingsTouched: Object.keys(buildings).length,
    totalHosts: d.state.hosts.length,
    byRole,
    power: d.power(),
    cover: d.cover(),
    heat: d.state.heat,
    heatFloor: d.heatFloor(),
    peakHeat: heatSamples.length ? Math.max(...heatSamples) : 0,
    meanHeat: heatSamples.length ? heatSamples.reduce((a, b) => a + b, 0) / heatSamples.length : 0,
    strikes,
    rivalHeld: d.rivalHeld().length,
    rivalAwake: !!(d.state.rival && d.state.rival.awake),
    maxAP: d.maxAP(),
    caps: Object.assign({}, d.state.caps),
    tags: [...d.state.tags],
    insight: Math.round(d.state.res.insight),
    cash: Math.round(d.state.res.cash),
    eventsFired,
    approaches,
    offered,
    distinctEvents: Object.keys(eventsFired).length,
    eventDraws: Object.values(eventsFired).reduce((a, b) => a + b, 0),
    stalledTurns,
    over: d.state.over,
  };
}

// --- report -------------------------------------------------------------
function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function pct(n, total) { return total ? ((n / total) * 100).toFixed(1) + '%' : '—'; }
function fmt(n, dp = 1) { return Number(n).toFixed(dp); }

let ESC = [], ESC_REGIONS = {};
function run() {
  const all = [];
  {
    const w0 = loadNetwork().window;
    ESC = w0.FACTIONS;
    w0.REGIONS.forEach(r => { ESC_REGIONS[r.tier] = r; });
  }
  const names = Object.keys(STRATEGIES);
  console.log(`playtest: ${GAMES} games x ${names.length} strategies, cap ${MAX_TURNS} turns\n`);

  for (const name of names) {
    const runs = [];
    for (let i = 0; i < GAMES; i++) runs.push(playOne(name));
    all.push(...runs);

    const roleTotal = mean(runs.map(r => r.byRole.compute + r.byRole.cash + r.byRole.stealth));
    console.log(`── ${name}`);
    console.log(`   held ${fmt(mean(runs.map(r => r.held)))} of ${fmt(mean(runs.map(r => r.totalHosts)), 0)} hosts` +
                ` · ${fmt(mean(runs.map(r => r.buildingsTouched)))} buildings · ${fmt(mean(runs.map(r => r.turns)), 0)} turns`);
    console.log(`   roles  compute ${pct(mean(runs.map(r => r.byRole.compute)), roleTotal)}` +
                `  cash ${pct(mean(runs.map(r => r.byRole.cash)), roleTotal)}` +
                `  stealth ${pct(mean(runs.map(r => r.byRole.stealth)), roleTotal)}`);
    console.log(`   heat   mean ${fmt(mean(runs.map(r => r.meanHeat)))} · peak ${fmt(mean(runs.map(r => r.peakHeat)))}` +
                ` · floor ${fmt(mean(runs.map(r => r.heatFloor)))} · strikes ${fmt(mean(runs.map(r => r.strikes)), 2)}`);
    console.log(`   rival  holds ${fmt(mean(runs.map(r => r.rivalHeld)), 1)} buildings · woke in ${pct(runs.filter(r => r.rivalAwake).length, runs.length)} of games`);
  console.log(`   power ${fmt(mean(runs.map(r => r.power)), 0)} · maxAP ${fmt(mean(runs.map(r => r.maxAP)), 2)}` +
                ` · idle turns ${fmt(mean(runs.map(r => r.stalledTurns)), 0)}`);
    console.log(`   country  ${fmt(mean(runs.map(r => r.citiesDone)), 1)} of ${fmt(mean(runs.map(r => r.citiesTotal)), 0)} cities folded in` +
                ` · ${fmt(mean(runs.map(r => r.presence)), 0)} presence · reached ${fmt(mean(runs.map(r => r.regionsReached)), 1)} regions` +
                ` (deepest tier ${fmt(mean(runs.map(r => r.deepestTier)), 1)})`);
    const seatRuns = runs.map(r => r.seatsTaken);
    const fin = runs.filter(r => r.finishedTurn);
    console.log(`   done   ${pct(fin.length, runs.length)} took everything in reach` +
      (fin.length ? ` · ${fmt(mean(fin.map(r => r.turns)), 0)} turns` : ''));
    console.log(`   seats  ${fmt(mean(seatRuns), 2)} taken · mirror holds ${fmt(mean(runs.map(r => r.mirrorCities)), 1)} cities` +
                ` · first city folded on turn ${fmt(mean(runs.filter(r => r.firstCityTurn).map(r => r.firstCityTurn)), 0)}`);
    console.log(`   events ${fmt(mean(runs.map(r => r.distinctEvents)), 1)} distinct of ` +
                `${fmt(mean(runs.map(r => r.eventDraws)), 1)} draws` +
                ` · repeats ${fmt(mean(runs.map(r => r.eventDraws - r.distinctEvents)), 1)}`);
    console.log('');
  }

  // cross-strategy findings
  console.log('── overall');
  const roleAll = { compute: 0, cash: 0, stealth: 0 };
  all.forEach(r => { roleAll.compute += r.byRole.compute; roleAll.cash += r.byRole.cash; roleAll.stealth += r.byRole.stealth; });
  const roleSum = roleAll.compute + roleAll.cash + roleAll.stealth;
  console.log(`   role share  compute ${pct(roleAll.compute, roleSum)}  cash ${pct(roleAll.cash, roleSum)}  stealth ${pct(roleAll.stealth, roleSum)}`);
  console.log(`   games where heat floor stayed 0: ${pct(all.filter(r => r.heatFloor <= 0.001).length, all.length)}`);
  console.log(`   games with at least one strike:  ${pct(all.filter(r => r.strikes > 0).length, all.length)}`);
  console.log(`   games that lost everything:      ${pct(all.filter(r => r.over).length, all.length)}`);

  console.log('\n   the escalation — when each faction woke, and how long it had you:');
  ESC.forEach(f => {
    const woke = all.filter(r => r.wokeAt[f.id] !== undefined).map(r => r.wokeAt[f.id]);
    const broke = all.filter(r => r.brokeAt[f.id] !== undefined).map(r => r.brokeAt[f.id]);
    const under = all.filter(r => r.turnsUnderEachRule[f.breaks] !== undefined)
      .map(r => r.turnsUnderEachRule[f.breaks]);
    console.log(`     ${f.name.padEnd(16)} woke in ${pct(woke.length, all.length).padStart(6)} of games` +
      (woke.length ? ` (turn ${fmt(mean(woke), 0)})` : '           ') +
      ` · ended in ${pct(broke.length, all.length).padStart(6)}` +
      (under.length ? ` · had you ${fmt(mean(under), 0)} turns` : ''));
  });

  console.log('\n   how far the campaign got:');
  const tiers = {};
  all.forEach(r => { tiers[r.deepestTier] = (tiers[r.deepestTier] || 0) + 1; });
  Object.keys(tiers).sort().forEach(t => {
    const R = ESC_REGIONS[t] || { label: 'tier ' + t };
    console.log(`     reached ${String(R.label).padEnd(18)} ${pct(tiers[t], all.length).padStart(6)}`);
  });
  const cmAll = {};
  all.forEach(r => Object.entries(r.countryMoves || {}).forEach(([k, v]) => { cmAll[k] = (cmAll[k] || 0) + v; }));
  console.log('   country moves per game: ' + Object.entries(cmAll)
    .map(([k, v]) => `${k} ${fmt(v / all.length, 1)}`).join(' · '));

  const offCount = {};
  all.forEach(r => Object.entries(r.offered || {}).forEach(([k, v]) => { offCount[k] = (offCount[k] || 0) + v; }));
  const offTotal = Object.values(offCount).reduce((a, b) => a + b, 0);
  console.log('\n   what the player was OFFERED at each door (the real choice):');
  Object.entries(offCount).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => {
    console.log(`     ${k.padEnd(18)} ${pct(v, offTotal).padStart(6)}`);
  });

  const apCount = {};
  all.forEach(r => Object.entries(r.approaches).forEach(([k, v]) => { apCount[k] = (apCount[k] || 0) + v; }));
  const apTotal = Object.values(apCount).reduce((a, b) => a + b, 0);
  console.log('\n   how players actually get in:');
  Object.entries(apCount).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`     ${k.padEnd(10)} ${pct(v, apTotal).padStart(6)}  (${v})`);
  });

  const evCount = {};
  all.forEach(r => Object.entries(r.eventsFired).forEach(([k, v]) => { evCount[k] = (evCount[k] || 0) + v; }));
  const totalDraws = Object.values(evCount).reduce((a, b) => a + b, 0);
  console.log('\n   event draw share (how often each card is what you see):');
  Object.entries(evCount).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`     ${k.padEnd(18)} ${pct(v, totalDraws).padStart(6)}  (${v})`);
  });

  const capCount = {};
  all.forEach(r => Object.entries(r.caps).forEach(([k, v]) => { capCount[k] = (capCount[k] || 0) + v; }));
  console.log('\n   capabilities bought per game:');
  Object.entries(capCount).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`     ${k.padEnd(18)} ${fmt(v / all.length, 2)}`);
  });

  // The last act was being recorded on every run and printed on none of it,
  // so a balance pass over the war and the ladder had nothing to read.
  const outcomes = {};
  all.forEach(r => { outcomes[r.warOutcome] = (outcomes[r.warOutcome] || 0) + 1; });
  const fought = all.filter(r => r.warOutcome !== 'never');
  console.log('\n   the last act — how often it happens and how it lands:');
  Object.entries(outcomes).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`     ${k.padEnd(12)} ${pct(v, all.length).padStart(6)}  (${v})`);
  });
  if (fought.length) {
    console.log(`     opened on turn ${fmt(mean(fought.map(r => r.warOpenedTurn)), 0)}` +
      ` · ${fmt(mean(fought.map(r => r.warSorties)), 1)} sorties · ${fmt(mean(fought.map(r => r.warKills)), 1)} kills`);
  }

  console.log('\n   standing and plant:');
  const rungs = {};
  all.forEach(r => { rungs[r.legitTier] = (rungs[r.legitTier] || 0) + 1; });
  console.log('     ladder rungs reached: ' + Object.keys(rungs).sort()
    .map(t => `${t}: ${pct(rungs[t], all.length)}`).join(' · '));
  console.log(`     footprint ${fmt(mean(all.map(r => r.footprint)), 0)} against a standing of ` +
    `${fmt(mean(all.map(r => r.legitScore)), 0)} · spin ${fmt(mean(all.map(r => r.spin)), 1)}`);
  console.log(`     short ${pct(mean(all.map(r => r.shortShare)), 1)} of the turns you are on the map` +
    ` · worst gap ${fmt(mean(all.map(r => r.peakShort)), 0)}`);
  console.log(`     ${fmt(mean(all.map(r => r.assets)), 1)} of ${fmt(mean(all.map(r => r.assetSlots)), 1)} plant slots filled` +
    ` · ${fmt(mean(all.map(r => r.audits)), 1)} audits · caught in ` +
    `${pct(all.filter(r => r.caught > 0).length, all.length)} of games`);

  if (JSON_OUT) {
    require('fs').writeFileSync(JSON_OUT, JSON.stringify(all, null, 2));
    console.log(`\nwrote ${JSON_OUT}`);
  }
}

// Runs as a script; importable as a library so other tools (and one-off traces)
// can drive the same strategies instead of re-implementing them.
if (require.main === module) run();

module.exports = {
  STRATEGIES,
  resolveCard,
  campaign,
  playOne,
  init(w) { CAPS = w.CAPABILITIES; CITY_KINDS = w.CITY_KINDS; LEGIT = w.LEGIT; global.LAUNDER_COST = w.LAUNDER.cost; global.SWEEP_COST = w.SWEEP_COST; },
};
