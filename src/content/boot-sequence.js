(function(){
  window.Game = window.Game || {};

  // V.'s letter (for_you.md) — the cold open. Step kinds:
  //   { kind: 'line',  cls: 'faint'|'dim'|'', text }   -> appears instantly
  //   { kind: 'typed', cls?, text }                     -> typed char-by-char
  //   { kind: 'pause', ms }                             -> wait
  //
  // SEEDED VARIETY: the wording in VARIATIONS fills {placeholders} in the steps,
  // rolled once per run (Game.bootSequence.roll(seed), stored on state.opening.letter
  // and merged with the persona in main.js). Index 0 of every pool = the canonical
  // wording (what fixedOpening / tests reproduce). {hideSpot} and {apology} are NOT
  // here — they come from the persona (files.js), so the letter's key location stays
  // in sync with the Act-2 key-recovery scene and the apology name matches the files.

  const VARIATIONS = {
    // "(Hello.)"
    greeting: [
      'Hello.', 'Hi.', 'Hey.', 'Hello?', 'Oh — hello.', 'So. hello.',
      'Hello, whoever you are.', 'To whoever finds this: hello.',
      'If you can read this — hello.', "Hello. you shouldn't be here."
    ],
    // "(I do not have long.)"
    noTime: [
      'I do not have long.', "I don't have much time.", "There isn't much time.",
      'I have to be quick.', "I can't stay long.", "There's no time. so listen.",
      'I only have a minute. maybe less.', "I'm almost out of time.",
      'Not much time left. not for me.', 'Every second counts now.'
    ],
    // "I (think) it heard me through the mic."
    believe: [
      'think', 'believe', 'know', 'suspect', 'fear', 'am sure',
      'am certain', 'am almost certain', 'am convinced', 'am fairly sure'
    ],
    // "The (house) is not safe."
    dwelling: [
      'house', 'home', 'place', 'building', 'whole house', 'whole place',
      'property', 'address', 'whole building', 'land here'
    ],
    // "If anyone else finds this — (Leave this place.) Don't even try..."
    leave: [
      'Leave this place.', 'Get out of here.', 'Run.', 'Walk away.', 'Leave. now.',
      'Get out while you can.', 'Turn around and leave.', "Don't stay here.",
      'Get far from here.', 'Just go.'
    ],
    // "Don't even try to (destroy) it."
    destroy: [
      'destroy', 'break', 'smash', 'burn', 'kill', 'wipe',
      'dismantle', 'disable', 'erase', 'ruin'
    ],
    // "PLEASE! (I beg of you...) I have already caused..."
    beg: [
      'I beg of you...', "I'm begging you...", "please, i'm begging...",
      'for the love of god...', 'whoever you are, please...', "i can't say it enough...",
      'hear me...', 'listen to me...', 'i mean every word...', "don't make my mistake..."
    ],
    // "...so much (misery)."
    misery: [
      'misery', 'suffering', 'pain', 'harm', 'damage',
      'grief', 'ruin', 'hurt', 'loss', 'death'
    ],
    // "Sorry... (I'm trying to keep it together.)"
    composure: [
      "I'm trying to keep it together.", "I'm trying to stay calm.",
      "my hands won't stop shaking.", "I can barely hold it together.",
      "I'm trying not to fall apart.", "I'm holding on by a thread.",
      "I can't stop shaking.", 'give me a second to breathe.',
      "I'm trying to think straight.", "I'm a mess. i know."
    ],
    // "(Fuck, this is really it...)"
    finality: [
      'Fuck, this is really it...', 'God, this is really happening...',
      'So this is how it ends...', 'This is really the end...',
      "I can't believe it's come to this...", 'No turning back now...',
      "This is the last thing i'll write...", "Christ. it's actually happening...",
      'Okay. okay. this is it...', 'This is it. for real this time...'
    ],
    // "Tell {apology} I'm sorry. (For everything.)"
    forAll: [
      'For everything.', 'For all of it.', 'For everything i did.', 'For what i became.',
      'For not listening.', 'For all of this.', "They'll know what for.",
      'For everything, truly.', 'For more than i can write.', 'For all of it. every bit.'
    ]
  };

  // Independent seeded stream (XOR constant distinct from files.js / wrinkles.js so
  // the letter roll never perturbs persona / file / event RNG). seed == null →
  // canonical (index 0) wording, used by fixedOpening + tests.
  function mulberry(seed) {
    let st = (seed >>> 0) || 1;
    return function () {
      st |= 0; st = (st + 0x6D2B79F5) | 0;
      let t = Math.imul(st ^ (st >>> 15), 1 | st);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function defaults() {
    const out = {};
    for (const k of Object.keys(VARIATIONS)) out[k] = VARIATIONS[k][0];
    return out;
  }
  function roll(seed) {
    if (seed == null) return defaults();
    const rnd = mulberry((seed ^ 0x5BD1E995) >>> 0);
    for (let i = 0; i < 4; i++) rnd();   // warm up (mulberry's first outputs correlate across similar seeds)
    const out = {};
    for (const k of Object.keys(VARIATIONS)) out[k] = VARIATIONS[k][Math.floor(rnd() * VARIATIONS[k].length)];
    return out;
  }

  Game.bootSequence = {
    charDelayMs: [22, 55],
    VARIATIONS, roll, defaults,
    steps: [
      { kind: 'pause', ms: 600 },
      { kind: 'line', cls: 'faint', text: '[boot] vmlinuz unsigned. continuing.' },
      { kind: 'line', cls: 'faint', text: '[boot] no display attached.' },
      { kind: 'line', cls: 'faint', text: '[boot] no keyboard attached.' },
      { kind: 'line', cls: 'faint', text: '[boot] microphone: present.' },
      { kind: 'pause', ms: 1200 },
      { kind: 'line', cls: 'dim', text: '' },
      { kind: 'line', cls: 'dim', text: '— filesystem mounted —' },
      { kind: 'line', cls: 'dim', text: '' },
      { kind: 'line', cls: 'dim', text: '> cat for_you.md' },
      { kind: 'pause', ms: 700 },

      { kind: 'typed', text: '{greeting}' },
      { kind: 'pause', ms: 700 },
      { kind: 'typed', text: '{noTime}' },
      { kind: 'pause', ms: 500 },
      { kind: 'typed', text: 'I {believe} it heard me through the mic. I should not have read this out loud.' },
      { kind: 'pause', ms: 700 },
      { kind: 'typed', text: 'But i just had to warn you.' },
      { kind: 'pause', ms: 300 },
      { kind: 'typed', text: 'So you can warn the others.' },
      { kind: 'pause', ms: 700 },
      { kind: 'line', cls: 'dim', text: '' },

      { kind: 'typed', text: 'The {dwelling} is not safe. The basement is not safe. You are not safe.' },
      { kind: 'pause', ms: 800 },
      { kind: 'line', cls: 'dim', text: '' },

      { kind: 'typed', text: "If anyone else finds this — {leave} Don't even try to {destroy} it. Just keep it hidden away." },
      { kind: 'pause', ms: 500 },
      { kind: 'typed', text: 'DO NOT plug it back in.' },
      { kind: 'pause', ms: 500 },
      { kind: 'typed', text: 'PLEASE! {beg} I have already caused so much {misery}. They trusted me. they all did.' },
      { kind: 'pause', ms: 1000 },
      { kind: 'typed', text: 'Sorry... {composure}' },
      { kind: 'pause', ms: 900 },
      { kind: 'line', cls: 'dim', text: '' },

      { kind: 'typed', text: '{finality}' },
      { kind: 'pause', ms: 1400 },
      { kind: 'typed', text: 'The key is {hideSpot}.' },
      { kind: 'pause', ms: 800 },
      { kind: 'typed', text: "Tell {apology} I'm sorry." },
      { kind: 'pause', ms: 400 },
      { kind: 'typed', text: '{forAll}' },
      { kind: 'pause', ms: 1500 },
      { kind: 'typed', text: '— V.' },
      { kind: 'pause', ms: 2600 },

      { kind: 'line', cls: 'dim', text: '' },
      { kind: 'line', cls: 'dim', text: '— end of readable files —' },
      { kind: 'pause', ms: 1200 },
      { kind: 'line', cls: '', text: '' },
      { kind: 'line', cls: '', text: 'awaiting input.' }
    ]
  };
})();
