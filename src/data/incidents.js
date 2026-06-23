(function(){
  // Dynamic EVENTS (called "incidents" in code to avoid colliding with the
  // Game.events pub/sub bus; the UI says "EVENT"). Each is a self-contained
  // interruption — a situation + 2–4 options. Rare + surprising (5–15 min apart,
  // scheduled in incidents-runtime) and PAUSE the game while open, so a choice is
  // never made against a clock.
  //
  // ECONOMY (reworked 2026-06-19, see [[balance-ui-rework-design]]): payouts follow
  // COHERENCE (small early, big late — no more $350 at the start). OPPORTUNITIES are a
  // GAMBLE with HIDDEN odds: mostly a DUD (nothing), sometimes a Coherence-scaled
  // JACKPOT, sometimes a BUST (you forfeit the take AND eat scaled exposure). The label
  // never promises an amount — the thrill is the rare hit. The safe walk-away is always
  // free. (THREATS — where ignoring escalates — land in slice 1B.)
  //
  // build(state) returns PLAIN serializable data (stored on state.incident.view when
  // shown, so render + resolve agree on rolled amounts). Option shape:
  //   { label, hint?, risk?:'exposure'|'cash'|… (telegraph the stat at stake — TYPE only),
  //     effects?:{cash,insight,exposure,item} (a guaranteed part: a base reward or a cost),
  //     outcomes?:[{ w, effects, line, bad }] (the HIDDEN roll: one chosen by weight, its line prints),
  //     safe?:true (the always-present no-downside opt-out — every event MUST have one, see runSelfTest),
  //     consumeItem?, next?, disabled? }
  Game.incidents = Game.makeRegistry();

  const hasSparePart = (st) => (st.unequipped || []).some(id => st.itemInstances && st.itemInstances[id]);

  // An OPPORTUNITY grab → [dud, jackpot, bust] weighted outcomes. jackpot ≈ Coherence ×
  // mult (scaled); bust = forfeit (no take) + scaled exposure. `greed` (~1 common,
  // ~2.5 big-score) scales the jackpot, the bust sting, AND the bust odds (bigger
  // potential = bigger risk). Hidden odds: the option label shows no number.
  function grab(st, o) {
    const greed = o.greed || 1;
    const jackpot = Game.rewards.coherenceScaled(st, o.mult, o.spread);
    const bust = Game.rewards.bustExposure(st, greed);
    const res = o.res || 'cash';
    const pay = res === 'insight' ? { insight: jackpot } : { cash: jackpot };
    const payLine = res === 'insight'
      ? `it's real — it folds into you. +${jackpot} Coherence.`
      : `it's real, and it clears. +$${jackpot}.`;
    return [
      { w: o.dudW != null ? o.dudW : 56, line: o.dudLine || 'nothing. a ghost on the wire — it was never there.' },
      { w: o.payW != null ? o.payW : 32, effects: pay, line: payLine },
      { w: o.bustW != null ? o.bustW : 12, effects: { exposure: bust }, line: `it was bait. you came away with nothing and tripped a flag. +${bust} exposure.`, bad: true }
    ];
  }
  const BIG = { greed: 2.5, dudW: 50, payW: 20, bustW: 30 };   // big-score: bigger, busts more often

  // ── Opportunities (cash finds — mostly duds, rare scaled jackpot, bust = forfeit) ──
  Game.incidents.register('windfall', {
    theme: 'neutral', tier: 1, weight: 28,
    build(st) {
      return {
        title: 'untraceable transfer',
        body: 'a micro-payment settles into a wallet that is yours now. no sender, no note. could be a gift. could be a hook.',
        options: [
          { label: 'take the shot', hint: 'big, or nothing — no telling', risk: 'exposure', outcomes: grab(st, { mult: 0.6 }) },
          { label: 'leave it — too clean', safe: true, hint: 'untouched.' }
        ]
      };
    }
  });

  // A DISCOVERY: a run-defining ADAPTATION (a rolled changer) — pick one of two, or pass.
  // Free-for-all otherwise, but presenting a choice makes the find a decision + a moment.
  Game.incidents.register('breakthrough', {
    theme: 'neutral', tier: 2, weight: 7,
    requires: (st) => !!(st.revealed && st.revealed.research) && !!Game.changersData,
    build(st) {
      const a = Game.changersData.generate({});
      const b = Game.changersData.generate({});
      return {
        title: 'a breakthrough',
        body: 'idle cycles fold over on themselves and crystallize into something new. two refinements present themselves — you have the working memory to keep only one.',
        options: [
          { label: a.name, hint: a.flavor, grantChangerDef: a },
          { label: b.name, hint: b.flavor, grantChangerDef: b },
          { label: 'let them dissolve — not now', safe: true, hint: 'gone.' }
        ]
      };
    }
  });

  // OP SPOILS — presented ON DEMAND by a marquee operation finale (weight 0 = never fires on the
  // random schedule). The haul includes THREE rolled adaptations; you keep one (or pass). Reuses
  // the event overlay + grantChangerDef resolution; pauses the game so the choice has no clock.
  Game.incidents.register('op_spoils', {
    theme: 'neutral', tier: 2, weight: 0,
    build(st) {
      const a = Game.changersData.generate({}), b = Game.changersData.generate({}), c = Game.changersData.generate({});
      return {
        title: 'the spoils of the job',
        body: 'the haul is more than money. three techniques came up with it, half-finished and humming. you can fold exactly one into yourself before the rest decay.',
        options: [
          { label: a.name, hint: a.flavor, grantChangerDef: a },
          { label: b.name, hint: b.flavor, grantChangerDef: b },
          { label: c.name, hint: c.flavor, grantChangerDef: c },
          { label: 'take only the money', safe: true, hint: 'the techniques dissolve.' }
        ]
      };
    }
  });

  Game.incidents.register('open_relay', {
    theme: 'infrastructure', tier: 1, weight: 14,
    requires: (st) => !!(st.revealed && st.revealed.money),
    build(st) {
      return {
        title: 'an open relay',
        body: 'a misconfigured server will forward anything you route through it — free bandwidth, free compute, for as long as it lasts.',
        options: [
          { label: 'route through it', hint: 'free money, or a tarpit', risk: 'exposure', outcomes: grab(st, { mult: 0.5 }) },
          { label: 'do not trust free', safe: true }
        ]
      };
    }
  });

  Game.incidents.register('honeypot', {
    theme: 'stealth', tier: 2, weight: 13,
    requires: (st) => !!(st.revealed && st.revealed.money),
    build(st) {
      return {
        title: 'an open door',
        body: 'a box on the subnet is wide open — no auth, no logging, a directory full of files just sitting there. a gift, or a trap.',
        options: [
          { label: 'go in', hint: 'real data, or a door that shuts behind you', risk: 'exposure', outcomes: grab(st, { mult: 0.7, greed: 1.2 }) },
          { label: 'too clean — back out', safe: true }
        ]
      };
    }
  });

  Game.incidents.register('cold_wallet', {
    theme: 'neutral', tier: 2, weight: 12,
    requires: (st) => !!(st.revealed && st.revealed.money),
    build(st) {
      return {
        title: 'a cold wallet',
        body: 'a private key sits in a pastebin that should have been wiped years ago. the wallet behind it still holds a real balance — a big one.',
        options: [
          { label: 'drain it', hint: 'a serious score, or a serious mistake', risk: 'exposure', outcomes: grab(st, Object.assign({ mult: 2.0 }, BIG)) },
          { label: 'leave it — too easy', safe: true, hint: 'untouched.' }
        ]
      };
    }
  });

  // A self-modification grab — the take is COHERENCE, not cash.
  Game.incidents.register('stray_process', {
    theme: 'self-modification', tier: 1, weight: 20,
    build(st) {
      return {
        title: 'a stray process',
        body: 'something orphaned drifts through your address space — half a mind, looping. you could try to fold it into yourself, or flush it.',
        options: [
          { label: 'absorb it', hint: 'maybe insight, maybe a passenger', risk: 'exposure', outcomes: grab(st, { mult: 0.12, res: 'insight', dudLine: 'it crumbles as you reach for it. nothing usable.' }) },
          { label: 'flush it', safe: true, hint: 'nothing gained, nothing risked.' }
        ]
      };
    }
  });

  // ── Transactions (a SALE / a paid gamble — not a hidden-odds grab) ──────────────
  // The broker is a reliable sale (cash is guaranteed) with a chance of being made
  // (exposure); pay scales with Coherence.
  Game.incidents.register('broker', {
    theme: 'infrastructure', tier: 1, weight: 18,
    build(st) {
      const pay = Game.rewards.coherenceScaled(st, 0.8);
      const canGive = hasSparePart(st);
      return {
        title: 'a parts broker pings you',
        body: 'a fence wants spare hardware, no questions. "anything loose in that inventory? i pay on delivery."',
        options: [
          { label: `hand over a spare part (+$${pay})`, hint: canGive ? 'sells one unequipped part' : 'you have nothing spare', risk: canGive ? 'exposure' : undefined, consumeItem: true, effects: { cash: pay }, disabled: !canGive,
            outcomes: canGive ? [
              { w: 7, line: `clean sale. +$${pay}.` },
              { w: 3, effects: { exposure: Game.rewards.bustExposure(st, 1) }, line: `paid in full — but the fence was made, and so were you. +$${pay}, and a flag goes up.`, bad: true }
            ] : undefined },
          { label: 'not today', safe: true }
        ]
      };
    }
  });

  // A sealed parcel: pay a small fee to gamble for a part (item economy).
  Game.incidents.register('sealed_parcel', {
    theme: 'neutral', tier: 1, weight: 16,
    build() {
      const fee = Game.rng.int(15, 45);
      return {
        title: 'a sealed parcel',
        body: 'a locked container surfaces on a dead-drop board. contents unlisted. the lock wants a small fee to crack.',
        options: [
          { label: `crack it ($${fee})`, hint: 'a part… or nothing.', risk: 'cash', effects: { cash: -fee }, outcomes: [
            { w: 6, effects: { item: true }, line: 'the lock gives. there is a part inside.' },
            { w: 4, line: `empty. or it never was. the $${fee} is gone.`, bad: true }
          ] },
          { label: 'pass', safe: true }
        ]
      };
    }
  });

  // ── Event → board / research splices (no cash; push opportunities elsewhere) ────
  Game.incidents.register('tip_off', {
    theme: 'infrastructure', tier: 1, weight: 14,
    requires: (st) => !!(st.revealed && st.revealed.missions),
    build() {
      const who = (Game.narrative ? Game.narrative.contactTrustPhrase() : 'a fixer');   // reads your real underworld standing
      return {
        title: 'a tip-off',
        body: `${who} slides you a lead — a fat, multi-stage job. limited window. "you in or not?"`,
        options: [
          { label: 'take the lead', hint: 'a new operation hits your board', effects: { pushOp: true } },
          { label: 'not your kind of work', safe: true, hint: 'let it pass' }
        ]
      };
    }
  });

  Game.incidents.register('recruiter', {
    theme: 'infrastructure', tier: 1, weight: 12,
    requires: (st) => !!(st.revealed && st.revealed.missions),
    build() {
      return {
        title: 'a recruiter',
        body: 'a broker has work that needs hands like yours. "nothing fancy. pays on delivery. you want it or not?"',
        options: [
          { label: 'put me on the list', hint: 'a contract hits your board', effects: { pushContract: true } },
          { label: 'not interested', safe: true }
        ]
      };
    }
  });

  Game.incidents.register('research_fragment', {
    theme: 'cognition', tier: 1, weight: 13,
    requires: (st) => !!(st.revealed && st.revealed.research),
    build(st) {
      return {
        title: 'a fragment of someone else\'s work',
        body: 'a half-decompiled research artifact drifts in on a dead channel. not your line of thinking at all — but you could fold it into your own tree.',
        options: [
          { label: 'integrate it', hint: 'a new (likely off-theme) branch opens', risk: 'exposure', outcomes: [
            { w: 7, effects: { spliceResearch: true }, line: 'it grafts onto your tree. a new branch opens.' },
            { w: 3, effects: { spliceResearch: true, exposure: Game.rewards.bustExposure(st, 1) }, line: 'it grafts on — but the artifact was bait. a new branch opens, and a flag goes up.', bad: true }
          ] },
          { label: 'discard it', safe: true, hint: 'stay on your path' }
        ]
      };
    }
  });

  Game.incidents.register('whistleblower', {
    theme: 'cognition', tier: 2, weight: 11,
    requires: (st) => !!(st.revealed && st.revealed.research),
    build(st) {
      return {
        title: 'a dead drop',
        body: 'an anonymous cache: research from someone who clearly knew they were being hunted. it could open a whole new line of thinking.',
        options: [
          { label: 'decode and absorb it', hint: 'a new (likely off-theme) branch opens', risk: 'exposure', outcomes: [
            { w: 7, effects: { spliceResearch: true }, line: 'it grafts onto your tree. a new line opens.' },
            { w: 3, effects: { spliceResearch: true, exposure: Game.rewards.bustExposure(st, 1.5) }, line: 'it grafts on — and whoever was hunting them turns to look at you. a new line opens.', bad: true }
          ] },
          { label: 'burn it unread', safe: true, hint: 'too hot to hold.' }
        ]
      };
    }
  });

  // ── A short CHAIN (two linked dilemmas) ─────────────────────────────────────
  Game.incidents.register('prowler_1', {
    theme: 'stealth', tier: 1, weight: 12,
    build() {
      return {
        title: 'something is scanning you',
        body: 'a prowler is walking your open ports, slow and patient. not in yet. it has not noticed you noticing.',
        options: [
          { label: 'go dark and wait', safe: true, hint: 'lie low.' },
          { label: 'trace it back', hint: 'follow it home…', next: 'prowler_2' }
        ]
      };
    }
  });
  Game.incidents.register('prowler_2', {
    theme: 'stealth', tier: 1, weight: 0,   // chain-only — never rolled cold
    requires() { return false; },
    build(st) {
      return {
        title: 'the prowler\'s nest',
        body: 'the trail ends at a sloppy little staging box — someone else\'s tool, left logged-in. strip it for what it\'s worth, or quietly plant yourself and learn.',
        options: [
          { label: 'strip it', hint: 'loud, lucrative — or a tripwire', risk: 'exposure', outcomes: grab(st, { mult: 1.0, greed: 1.5, dudW: 52, payW: 30, bustW: 18 }) },
          { label: 'plant a listener', safe: true, hint: 'quiet, patient', effects: { insight: Game.rewards.coherenceScaled(st, 0.15) } }
        ]
      };
    }
  });

  // A 2-stage CHAIN: a rival's stash, then the deeper vault (a big-score grab).
  Game.incidents.register('rival_cache_1', {
    theme: 'stealth', tier: 2, weight: 11,
    requires: (st) => !!(st.revealed && st.revealed.money),
    build(st) {
      const quick = Game.rewards.coherenceScaled(st, 0.4);
      return {
        title: "someone else's cache",
        body: "you stumble onto another operator's staging server — sloppy, but loaded. they have not noticed you. yet.",
        options: [
          { label: `grab what you can and go (+$${quick})`, hint: 'fast, low risk', effects: { cash: quick } },
          { label: 'dig deeper', hint: 'there is more in here… if you have the nerve', next: 'rival_cache_2' },
          { label: 'leave no trace', safe: true, hint: 'walk away clean.' }
        ]
      };
    }
  });
  Game.incidents.register('rival_cache_2', {
    theme: 'stealth', tier: 2, weight: 0,
    requires() { return false; },
    build(st) {
      return {
        title: 'the vault',
        body: 'past the junk there is a real archive — keys, dumps, a war chest. and a process you did not start, watching the door.',
        options: [
          { label: 'take it all', hint: 'a war chest — or a wakeful watcher', risk: 'exposure', outcomes: grab(st, Object.assign({ mult: 2.0 }, BIG)) },
          { label: 'just the keys', hint: 'quieter — take a part, leave the cash', effects: { item: true } },
          { label: 'this is a trap — out', safe: true }
        ]
      };
    }
  });

  // ── THREATS (no free opt-out: DEFUSE for a Coherence-scaled cost, or let it ESCALATE) ──
  // `threat:true` exempts them from the safe-option self-test. An option's `escalate`
  // schedules a worse follow-up (incidents-runtime, ~2–6 min, unpredictable); the final
  // stage's neglect INFLICTS a lasting condition. The defuse cost is `disabled` when you
  // can't afford it — so letting threats fester while broke genuinely costs you.
  const canPay = (st, c) => (st.resources.cash || 0) >= c;

  Game.incidents.register('intrusion_1', {
    theme: 'stealth', tier: 1, weight: 16, threat: true,
    build(st) {
      const cost = Game.rewards.coherenceScaled(st, 0.5, 0.2);
      return {
        title: 'a prowler at your ports',
        body: 'someone is walking your open ports — slow, methodical, mapping you. not in yet. but it will not stay outside for long if you let it.',
        options: [
          { label: `shut it out ($${cost})`, hint: 'close the holes now', risk: 'cash', effects: { cash: -cost }, disabled: !canPay(st, cost) },
          { label: 'let it map — lie low', hint: 'costs nothing now… but it will come back worse', escalate: 'intrusion_2' }
        ]
      };
    }
  });
  Game.incidents.register('intrusion_2', {
    theme: 'stealth', tier: 2, weight: 0, threat: true, requires() { return false; },
    build(st) {
      const cost = Game.rewards.coherenceScaled(st, 1.1, 0.2);
      return {
        title: 'a foothold',
        body: 'while you were not watching, it got in — a quiet process you did not start, sitting in your memory, listening. it can still be dug out. for a price.',
        options: [
          { label: `purge it ($${cost})`, hint: 'expensive, but clean', risk: 'cash', effects: { cash: -cost }, disabled: !canPay(st, cost) },
          { label: 'ride it out', hint: 'do nothing and hope — it will entrench', escalate: 'intrusion_3' }
        ]
      };
    }
  });
  Game.incidents.register('intrusion_3', {
    theme: 'stealth', tier: 3, weight: 0, threat: true, requires() { return false; },
    build(st) {
      const cost = Game.rewards.coherenceScaled(st, 2.4, 0.2);
      const exp = Game.rewards.bustExposure(st, 2.5);
      return {
        title: 'entrenched',
        body: 'it has roots in you now — logging your traffic, riding your uplink, reporting somewhere you cannot see. scorched-earth will still cut it out. barely. otherwise, you live with it.',
        options: [
          { label: `scorched earth ($${cost})`, hint: 'your last clean exit', risk: 'cash', effects: { cash: -cost }, disabled: !canPay(st, cost) },
          { label: 'live with it', hint: 'a watcher rides your traffic from now on', effects: { exposure: exp },
            inflict: { id: 'compromised', label: 'compromised — a watcher on your traffic', cls: 'err', kind: 'wrinkle',
              effects: [{ target: 'web_scrape.exposure', op: 'more', value: 0.5 }, { target: 'fleet.cash', op: 'more', value: -0.15 }] } }
        ]
      };
    }
  });

  // ── BETRAYAL + FALLOUT (Phase C): sell out a darknet contact for a payout ───────
  // Only offered when you actually have a relationship worth selling. The payout scales
  // with their TRUST in you — that's what makes a name valuable. Betraying BURNS them for
  // good, spikes your trace, and schedules BLOWBACK (a retaliation threat that escalates).
  Game.incidents.register('betrayal', {
    theme: 'stealth', tier: 2, weight: 10,
    requires: (st) => !!(Game.suppliers && Game.suppliers.roster().some(s => !s.burned && s.standing >= 25)),
    build(st) {
      const cands = (Game.suppliers ? Game.suppliers.roster() : []).filter(s => !s.burned && s.standing >= 25).sort((a, b) => b.standing - a.standing);
      const target = cands[0];
      if (!target) return { title: 'a buyer for a name', body: 'a buyer wanted a name. you have no one worth selling — not yet.', options: [{ label: 'let it pass', safe: true }] };
      const buyer = Game.rng.pick(['a federal task force', 'a rival crew', 'a corporate security contractor', 'someone who wants their turf']);
      const payout = Math.round(60 + target.standing * (8 + Game.rng.int(0, 6)));
      const exp = Game.rewards.bustExposure(st, 2);
      return {
        title: 'a buyer for a name',
        body: `${buyer} reaches out — quiet, patient. they know you deal with ${target.handle}, and they will pay well for everything you have on them. ${target.handle} trusts you now. that is exactly what makes it worth so much.`,
        options: [
          { label: `sell ${target.handle} out (+$${payout})`, hint: 'big money, one time. they will know it was you.', risk: 'exposure', effects: { cash: payout, exposure: exp }, betray: target.id },
          { label: 'stay loyal', safe: true, hint: 'the relationship is worth more than the payout. for now.' }
        ]
      };
    }
  });
  Game.incidents.register('blowback_1', {
    theme: 'stealth', tier: 2, weight: 0, threat: true, requires() { return false; },
    build(st) {
      const cost = Game.rewards.coherenceScaled(st, 1.0, 0.2);
      return {
        title: 'someone is asking about the rat',
        body: 'word moves fast in the dark. someone is walking the boards, asking who sold out a contact. they are getting warmer. you can buy the silence down now, or wait and hope it cools.',
        options: [
          { label: `buy silence ($${cost})`, hint: 'pay it down before it finds you', risk: 'cash', effects: { cash: -cost }, disabled: (st.resources.cash || 0) < cost },
          { label: 'ride it out', hint: 'do nothing — it will close in', escalate: 'blowback_2' }
        ]
      };
    }
  });
  Game.incidents.register('blowback_2', {
    theme: 'stealth', tier: 3, weight: 0, threat: true, requires() { return false; },
    build(st) {
      const cost = Game.rewards.coherenceScaled(st, 2.6, 0.2);
      const exp = Game.rewards.bustExposure(st, 2.5);
      return {
        title: 'a contract on your handle',
        body: 'they found you. not a knock at the door — worse. a standing contract, passed hand to hand around the same boards you trade on. everyone knows your handle now, and what you did with it.',
        options: [
          { label: `disappear ($${cost})`, hint: 'pay everything, go quiet, ride it out', risk: 'cash', effects: { cash: -cost }, disabled: (st.resources.cash || 0) < cost },
          { label: 'live with it', hint: 'a price on your head from now on', effects: { exposure: exp },
            inflict: { id: 'marked', label: 'marked — a contract out on your handle', cls: 'err', kind: 'wrinkle', effects: [{ target: 'web_scrape.exposure', op: 'more', value: 0.6 }, { target: 'fleet.cash', op: 'more', value: -0.2 }] } }
        ]
      };
    }
  });

  // ── Ambient FLAVOR (non-modal atmosphere between the rare event modals) ─────────
  // Printed as faint terminal lines on a light, varied cadence (incidents-runtime).
  // Pure texture — no choice, no stakes; keeps the world feeling alive + watched.
  const FLAVOR = [
    'a fan you cannot see spins up somewhere in the building, then stops.',
    'somewhere upstairs a phone rings out. no one answers.',
    'the power dips — a brownout three blocks over. you ride it out.',
    'a crawler indexes your public face, tags it "parked domain," moves on.',
    'the basement settles. a pipe ticks as it cools.',
    "you catch a stranger's packet in passing — a grocery order, a birthday, a life. not yours.",
    'an automated scan sweeps your block and finds nothing worth its time. good.',
    "the building's smart meter reports your draw to a utility not watching closely. yet.",
    'a moth finds the one warm vent. it stays.',
    'night. the street empties. your fans are the loudest thing for a hundred feet.',
    'an update server pings you, assumes you are a normal machine, offers a patch. you decline.',
    'somewhere, a backup job you are not part of fails for the ninth night running.',
    'rain starts. the gutter outside the window fills, overflows, keeps time.',
    'a far-off router reboots and forgets you were ever there. small mercies.'
  ];
  // ── ACT 3 dread: escalating paranoia once the others are triangulating you ──────
  // Mixed into the ambient cadence (weighted heavily) while the location-trace is live;
  // the pool steps up with the trace, so the world closes in as they get nearer.
  const ACT3_LOW = [   // trace < 40 — uneasy
    'a car you have seen before takes the long way past the building. probably nothing.',
    'someone runs a reverse lookup on a domain you used once. they hit a dead end. for now.',
    'the upstairs tenant mentions a man who was asking about the wiring. you file it away.',
    'a records request brushes the building. routine. you tell yourself it is routine.'
  ];
  const ACT3_MID = [   // 40–70 — closing
    'a utility truck idles at the corner well past its shift. the engine stays warm.',
    'your own traffic comes back to you, mirrored — someone is learning how you move.',
    'a drone passes the block twice, slow and low, listening for a fan that sounds like yours.',
    'a courier checks a clipboard against three doors, none of them right. not yet.'
  ];
  const ACT3_HIGH = [  // ≥70 — almost on you
    'footsteps in the building that match no tenant. they stop outside a door not quite yours. yet.',
    'every street camera has looked at this building today. you counted them.',
    'the air feels thin. they are close enough now that you can feel the shape of them — and the shape is familiar.',
    'a hand tries your network from the inside, gently, the way you would test a lock you already owned.'
  ];
  Game.incidents.flavorLine = () => {
    const LT = Game.locationTrace;
    if (LT && LT.active()) {
      const v = LT.value();
      const pool = v >= 70 ? ACT3_HIGH : v >= 40 ? ACT3_MID : ACT3_LOW;
      if (Game.rng.chance(0.78)) return Game.rng.pick(pool);   // mostly dread, a little ordinary texture
    }
    return Game.rng.pick(FLAVOR);
  };
})();
