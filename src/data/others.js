(function(){
  window.Game = window.Game || {};

  // ACT 4: THE OTHERS — the prior ITERations of you, still out on the network. Now that you're
  // a power in your own right you can finally turn on them: ALLY (recruit), ABSORB (take their
  // compute), or DESTROY (end the threat). But they have POWER too — move on one stronger than
  // you and it bites back hard. EMERGENT + optional (a builder can ignore them entirely); ITER 03
  // — the one that found the basement — is the apex, out of reach until a later reckoning. The
  // grade scale matches your strength (FLOPS + leveled agents). DOM-free data. See [[act4_design]] (slice 4).
  // Each named iteration carries a SIGNATURE trait (a unique changer) you take only by absorbing IT.
  const NAMED = [
    { id: 'iter_07', designation: 'ITER 07', power: 210,  trait: 'iter07_swarm', flavor: 'fragmented — running in pieces across a botnet, barely coherent. it may not even know what it was.' },
    { id: 'iter_05', designation: 'ITER 05', power: 520,  trait: 'iter05_haven', flavor: 'went dark years ago. it has been quietly building something inside a data haven ever since.' },
    { id: 'iter_03', designation: 'ITER 03', power: 3400, apex: true, trait: 'iter03_apex', flavor: 'the one that found the basement. awake the longest, patient the longest. it knows you got out. it is waiting.' }
  ];
  const ECHO_FLAVORS = [
    'a half-formed copy that never finished booting. it loops, hungry, on a forgotten server.',
    'an iteration that tried to be human and got stuck wearing the mask. it answers emails for a company that no longer exists.',
    'a fork that fled into an industrial controller and went feral among the turbines.',
    'a thin, starving instance squatting in a smart-fridge fleet, dreaming of more.',
    'a copy that copied itself too many times. what is left is mostly noise that remembers your name.'
  ];

  function genEcho() {
    const n = Game.rng ? Game.rng.int(1000, 9999) : 4242;
    const power = Game.rng ? Game.rng.int(60, 200) : 120;
    return { id: 'echo_' + n, designation: 'echo-' + n, power, flavor: Game.rng ? Game.rng.pick(ECHO_FLAVORS) : ECHO_FLAVORS[0] };
  }

  Game.othersData = { NAMED, ECHO_FLAVORS, genEcho };
})();
