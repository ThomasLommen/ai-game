(function(){
  window.Game = window.Game || {};

  // THE FOREMAN — the service bot's tree of self-upgrades + facility improvements. A
  // bootstrapping ladder: the scrappy domestic unit rebuilds ITSELF (self nodes raise its
  // TIER + cut build time + gate bigger jobs) to take on larger FACILITY improvements (the
  // building's bones: bays/cooling/power/footprint), up to deep cross-system CAPSTONES.
  // Each node: cost (cash) + buildSec (the async "hands at work" beat) + requires (prereq
  // nodes + facility/economy thresholds). Effects are GLOBAL PERMANENT modifiers layered on
  // whatever facility you're in. DOM-free data. See [[foreman_bot_design]].
  //
  // effect keys: tier (self capability) · buildMult (self build-speedup, negative) · bays ·
  //   coolingMult · powerMult · footprintMult (negative = quieter) · flopsMult · agentSlots ·
  //   legitFlat · auto ('install'|'salvage').  requires: { nodes:[], flops, legit, machines }.
  const NODES = [
    // ── roots (online the moment you move in) ──────────────────────────────────
    { id: 'fb_arms',   kind: 'self', name: 'reinforced arms', desc: 'servos + a real grip — the unit can lift and seat heavy gear.',
      cost: 2000, buildSec: 30, requires: {}, effect: { tier: 1, buildMult: -0.12 } },

    // ── tier 1 (needs the arms) ────────────────────────────────────────────────
    { id: 'fb_bays1',  kind: 'facility', name: 'clear the annex', desc: 'knock through to the next room — more machine bays.',
      cost: 4000, buildSec: 45, requires: { nodes: ['fb_arms'] }, effect: { bays: 2 } },
    { id: 'fb_cool1',  kind: 'facility', name: 'fabricate a cooling loop', desc: 'plumbed coolant + a radiator wall — more cooling capacity.',
      cost: 5000, buildSec: 50, requires: { nodes: ['fb_arms'] }, effect: { coolingMult: 0.25 } },
    { id: 'fb_chassis',kind: 'self', name: 'hydraulic chassis', desc: 'a heavier frame — it stops straining and starts building fast.',
      cost: 6000, buildSec: 60, requires: { nodes: ['fb_arms'] }, effect: { tier: 1, buildMult: -0.12 } },

    // ── tier 2 (needs the chassis) ─────────────────────────────────────────────
    { id: 'fb_power1', kind: 'facility', name: 'reroute three-phase', desc: 'tap the building\'s real supply — a bigger power budget.',
      cost: 8000, buildSec: 60, requires: { nodes: ['fb_chassis'] }, effect: { powerMult: 0.20 } },
    { id: 'fb_foot1',  kind: 'facility', name: 'sound + RF shielding', desc: 'line the walls — the front gets quieter (lower footprint).',
      cost: 8000, buildSec: 60, requires: { nodes: ['fb_chassis'] }, effect: { footprintMult: -0.15 } },
    { id: 'fb_fab',    kind: 'self', name: 'fabrication module', desc: 'a printer + a torch — it can MAKE parts now, not just fit them.',
      cost: 12000, buildSec: 80, requires: { nodes: ['fb_chassis'], flops: 30 }, effect: { tier: 1, buildMult: -0.15 } },

    // ── tier 3 (needs fabrication) ─────────────────────────────────────────────
    { id: 'fb_bays2',  kind: 'facility', name: 'raise a mezzanine', desc: 'a second level of racks — a big jump in bays.',
      cost: 16000, buildSec: 90, requires: { nodes: ['fb_fab', 'fb_bays1'] }, effect: { bays: 3 } },
    { id: 'fb_cool2',  kind: 'facility', name: 'closed-loop chiller', desc: 'an industrial chiller plant — heavy cooling headroom.',
      cost: 18000, buildSec: 90, requires: { nodes: ['fb_fab', 'fb_cool1'] }, effect: { coolingMult: 0.35 } },
    { id: 'fb_install',kind: 'facility', name: 'airflow retrofit', desc: 'the unit re-seats every machine for airflow + ducting — they run cooler.',
      cost: 14000, buildSec: 70, requires: { nodes: ['fb_fab'] }, effect: { heatMult: -0.12 } },
    { id: 'fb_salvage',kind: 'facility', name: 'teardown bay', desc: 'it strips dead/sold machines for parts — sales return far more.',
      cost: 14000, buildSec: 70, requires: { nodes: ['fb_fab'] }, effect: { auto: 'salvage' } },
    { id: 'fb_planner',kind: 'self', name: 'onboard planner', desc: 'it sequences its own work — builds run markedly faster.',
      cost: 25000, buildSec: 120, requires: { nodes: ['fb_fab'], flops: 80 }, effect: { tier: 1, buildMult: -0.20 } },

    // ── tier 4 capstones (deep — light cross-system reach) ─────────────────────
    { id: 'fb_bays3',  kind: 'facility', name: 'annex the lot', desc: 'take the whole site — a wall of bays.',
      cost: 60000, buildSec: 240, requires: { nodes: ['fb_planner', 'fb_bays2'] }, effect: { bays: 5 } },
    { id: 'fb_ops',    kind: 'capstone', name: 'build an ops floor', desc: 'desks, screens, a place for the agents to work — +2 agent slots.',
      cost: 40000, buildSec: 180, requires: { nodes: ['fb_planner'], legit: 80 }, effect: { agentSlots: 2 } },
    { id: 'fb_frontage',kind: 'capstone', name: 'registered frontage', desc: 'a real lobby, real signage, a real lease — a legitimacy cushion.',
      cost: 45000, buildSec: 180, requires: { nodes: ['fb_planner'] }, effect: { legitFlat: 80 } },
    { id: 'fb_overclock',kind: 'capstone', name: 'overclock the bays', desc: 'push every machine past spec — more FLOPS from the same iron.',
      cost: 50000, buildSec: 200, requires: { nodes: ['fb_planner'], machines: 4 }, effect: { flopsMult: 0.12 } }
  ];

  const BY_ID = {}; NODES.forEach(n => BY_ID[n.id] = n);
  Game.foremanData = { NODES, get: id => BY_ID[id] || null };
})();
