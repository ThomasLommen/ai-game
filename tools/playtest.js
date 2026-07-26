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
    const target = pickTarget(d, (a, b) => a.defense - b.defense);
    if (target) return breach(d, target, null, OFFERED);
    if (buyTooling(d)) return 'tooling';
    return sweepOrNull(d);
  },

  // prefer cameras and quiet entries; lie low early
  ghost(d) {
    if (d.state.heat > d.strikeThreshold() * 0.5) { d.actLieLow(); return 'lielow'; }
    const cam = pickTarget(d, (a, b) => (b.exterior - a.exterior) || (a.defense - b.defense));
    if (cam) return breach(d, cam, ['quiet', 'force'], OFFERED);
    if (buyTooling(d)) return 'tooling';
    return sweepOrNull(d);
  },

  // chase corporate holdings and use money as the heat valve
  money(d) {
    if (d.state.res.cash >= 8 && d.state.heat > d.strikeThreshold() * 0.55) { d.actLaunder(); return 'launder'; }
    const rich = pickTarget(d, (a, b) => (roleRank(b) - roleRank(a)) || (a.defense - b.defense));
    if (rich) return breach(d, rich, null, OFFERED);
    if (buyTooling(d)) return 'tooling';
    return sweepOrNull(d);
  },

  // buy power, then kick down the biggest doors
  builder(d) {
    if (buyCapability(d, 'parallel_ops')) return 'cap';
    if (buyTooling(d)) return 'tooling';
    const big = pickTarget(d, (a, b) => b.threads - a.threads);
    if (big) return breach(d, big, null, OFFERED);
    return sweepOrNull(d);
  },

  // a rough approximation of an attentive human: keep heat low, keep holdings
  // healthy, expand steadily, buy what is affordable
  balanced(d) {
    const s = d.state;
    if (s.heat > d.strikeThreshold() * 0.7) { d.actLieLow(); return 'lielow'; }
    const sick = d.owned().filter(h => d.shoreNeeded(h)).sort((a, b) => a.stability - b.stability)[0];
    if (sick && s.res.insight >= 2 && s.ap > 0) { d.actShore(sick.id); return 'shore'; }
    if (buyCapability(d)) return 'cap';
    const target = pickTarget(d, (a, b) => a.defense - b.defense);
    if (target) return breach(d, target, null, OFFERED);
    if (buyTooling(d)) return 'tooling';
    return sweepOrNull(d);
  },
};

function roleRank(h) { return h.role === 'cash' ? 2 : h.role === 'compute' ? 1 : 0; }

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

function buyCapability(d, only) {
  const caps = CAPS || [];
  for (const c of caps) {
    if (only && c.id !== only) continue;
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
    const usable = ev.choices.map((c, i) => ({ c, i })).filter(x => d.choiceUsable(x.c));
    const pickIdx = usable.length ? usable[0].i : 0;
    d.resolveEvent(pickIdx);
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
  const strat = STRATEGIES[strategyName];

  const eventsFired = {};
  const approaches = {};
  const offered = {};
  OFFERED = offered;
  const heatSamples = [];
  let strikes = 0, stalledTurns = 0;

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

    const apBefore = d.state.ap;
    const action = strat(d);
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

  return {
    strategy: strategyName,
    turns: d.state.turn,
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

function run() {
  const all = [];
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
    console.log(`   power ${fmt(mean(runs.map(r => r.power)), 0)} · maxAP ${fmt(mean(runs.map(r => r.maxAP)), 2)}` +
                ` · idle turns ${fmt(mean(runs.map(r => r.stalledTurns)), 0)}`);
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

  if (JSON_OUT) {
    require('fs').writeFileSync(JSON_OUT, JSON.stringify(all, null, 2));
    console.log(`\nwrote ${JSON_OUT}`);
  }
}

run();
