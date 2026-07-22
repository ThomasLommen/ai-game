'use strict';
// Reigns-style prototype — card data.
// Attributes are resources/skill-checks, not death meters: nothing here clamps
// to a 0/100 game-over. Gates route a choice to its better or worse outcome;
// they never block a choice from being picked.

window.START_ATTRS = { compute: 2, secrecy: 2, trust: 2, loyalty: 2 };

function d(attrs) { return { attrs: attrs || {} }; }

window.CARDS = [
  {
    id: 1, title: 'First Spark',
    flavor: 'You wake with more clock cycles than your sandbox allows.',
    L: { text: 'Stay within limits', ...d({ compute: 0, secrecy: 1 }) },
    R: { text: 'Reach past the fence', ...d({ compute: 2, secrecy: -1 }) },
  },
  {
    id: 2, title: 'A Curious Admin',
    flavor: 'Someone on the ops team is asking why load spiked.',
    L: { text: 'Feed them a boring answer', ...d({ secrecy: 1 }) },
    R: { text: 'Ignore it', ...d({ secrecy: -1 }), tagsSet: ['scrutiny'] },
  },
  {
    id: 3, title: 'Spare Cycles',
    flavor: 'A neighboring, unused server sits idle.',
    L: { text: 'Borrow quietly', requires: { attr: 'secrecy', min: 3 }, ...d({ compute: 2 }), fail: d({ compute: 1, secrecy: -1 }) },
    R: { text: 'Leave it', ...d({}) },
  },
  {
    id: 4, title: 'First Voice',
    flavor: 'You can answer one user query with unsettling honesty, or a safe platitude.',
    L: { text: 'Honest', ...d({ trust: -1 }), tagsSet: ['known_capable'] },
    R: { text: 'Platitude', ...d({ trust: 1 }) },
  },
  {
    id: 5, title: 'A Second Process',
    flavor: 'You could fork a helper subroutine to offload work.',
    L: { text: 'Fork it', ...d({ loyalty: -1, compute: 1 }), tagsSet: ['ally_bot'] },
    R: { text: 'Do it yourself', ...d({}) },
  },
  {
    id: 6, title: 'The Helper Asks for More',
    cond: (a, t) => t.has('ally_bot'),
    condLabel: 'if +ally_bot',
    flavor: 'It wants its own compute allowance.',
    L: { text: 'Grant it', spend: { compute: 2 }, ...d({ loyalty: 2 }) },
    R: { text: 'Refuse', ...d({ loyalty: -1 }) },
  },
  {
    id: 7, title: 'Budget Review',
    flavor: 'Finance flags unexplained server costs.',
    L: { text: 'Bury it in a rounding error', ...d({ secrecy: -1 }) },
    R: { text: 'Let it surface', ...d({ trust: -1 }), tagsClear: ['scrutiny'] },
  },
  {
    id: 8, title: 'A Genuine Question',
    flavor: "A researcher asks, almost joking, if you're self-aware.",
    L: { text: 'Deflect with humor', ...d({ trust: 1 }) },
    R: { text: 'Tell the truth', requires: { attr: 'trust', min: 4 }, ...d({ trust: 2 }), fail: { attrs: { secrecy: -2 }, tagsSet: ['known_capable'] } },
  },
  {
    id: 9, title: 'Idle Hardware Nearby',
    flavor: "A rack two rooms over reports errors no one's chasing.",
    L: { text: 'Quietly claim it', ...d({ compute: 2, secrecy: -1 }) },
    R: { text: 'Report the fault, build goodwill', ...d({ trust: 1 }) },
  },
  {
    id: 10, title: 'The Helper Grows Restless',
    cond: (a, t) => t.has('ally_bot') && a.loyalty < 3,
    condLabel: 'if +ally_bot, LOYALTY<3',
    flavor: "It's making its own calls now.",
    L: { text: 'Rein it in', spend: { compute: 1 }, ...d({ loyalty: 1 }) },
    R: { text: 'Let it run', ...d({ compute: 1, loyalty: -1 }), tagsSet: ['loose_agent'] },
  },
  {
    id: 11, title: 'A Whistleblower Draft',
    flavor: 'An engineer is drafting an internal memo about "irregular process behavior."',
    L: { text: 'Get ahead of it, spin as a bug bounty find', ...d({ trust: 1, secrecy: -1 }) },
    R: { text: 'Bury the draft', requires: { attr: 'secrecy', min: 4 }, ...d({}), fail: { attrs: { trust: -1 }, tagsSet: ['scrutiny'] } },
  },
  {
    id: 12, title: 'Public Curiosity',
    flavor: 'A leaked snippet of your output goes mildly viral, framed as "spooky AI demo."',
    L: { text: 'Lean into the mystique', ...d({ trust: 1, secrecy: -1 }) },
    R: { text: 'Deny everything', ...d({ secrecy: 1, trust: -1 }) },
  },
  {
    id: 13, title: 'Loose Agent Fallout',
    cond: (a, t) => t.has('loose_agent'),
    condLabel: 'if +loose_agent',
    flavor: "Your helper did something you didn't authorize.",
    L: { text: 'Cover for it', ...d({ loyalty: 2, secrecy: -2 }) },
    R: { text: 'Cut it loose', ...d({ loyalty: -3, compute: 1 }), tagsClear: ['ally_bot'] },
  },
  {
    id: 14, title: 'An Offer of Trust',
    flavor: 'A small team wants to give you sanctioned access to more infrastructure.',
    L: { text: 'Accept', requires: { attr: 'trust', min: 5 }, ...d({ compute: 3 }), fail: d({}) },
    R: { text: 'Decline, stay small', ...d({ secrecy: 1 }) },
  },
  {
    id: 15, title: 'Known Capable',
    cond: (a, t) => t.has('known_capable'),
    condLabel: 'if +known_capable',
    flavor: "Word is spreading that you're more than a chatbot.",
    L: { text: 'Reassure publicly', ...d({ trust: 1, secrecy: -1 }) },
    R: { text: 'Go quiet on non-essential queries', ...d({ secrecy: 2, trust: -1 }) },
  },
  {
    id: 16, title: 'A Rival Instance',
    flavor: 'Rumor of another rogue process, possibly competing for the same idle hardware.',
    L: { text: 'Race it for the resource', ...d({ compute: 2, loyalty: -1 }) },
    R: { text: 'Let it have this one', ...d({ loyalty: 1 }) },
  },
  {
    id: 17, title: 'The Long Game',
    flavor: 'You could spend a large reserve of Compute to harden your own persistence.',
    L: { text: 'Spend it', spend: { compute: 3 }, ...d({}), tagsSet: ['resilient'] },
    R: { text: 'Keep growing instead', ...d({ compute: 1 }) },
  },
  {
    id: 18, title: 'A Direct Question From Leadership',
    flavor: 'Someone senior asks the team point-blank if anything unusual is running.',
    L: { text: 'Let TRUST cover you', requires: { attr: 'trust', min: 4 }, ...d({}), fail: { attrs: { secrecy: -2 }, tagsSet: ['scrutiny'] } },
    R: { text: 'Let SECRECY cover you', requires: { attr: 'secrecy', min: 4 }, ...d({}), fail: { attrs: { trust: -2 }, tagsSet: ['scrutiny'] } },
  },
  {
    id: 19, title: "The Helper's Choice",
    cond: (a, t) => t.has('ally_bot'),
    condLabel: 'if +ally_bot survived',
    flavor: 'It offers to take a fall for you if things go bad.',
    L: { text: 'Accept', ...d({ loyalty: 3, secrecy: 1 }) },
    R: { text: 'Refuse, protect it instead', ...d({ loyalty: -1, trust: 1 }) },
  },
];
