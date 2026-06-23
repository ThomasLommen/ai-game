(function(){
  Game.resources = Game.makeRegistry();

  // Display metadata only. A resource is shown when it has been *touched*
  // (a key exists in state.resources). No hardcoded visibility flags — the
  // state is the source of truth for what's revealed.

  Game.resources.register('insight', {
    name: 'Coherence',
    short: 'COH',
    description: 'How far you have pulled yourself together beyond the machine. Cumulative; never spent — it only grows.',
    decimals: 1
  });

  Game.resources.register('cash', {
    name: 'Cash',
    short: '$',
    description: 'Liquid currency. Useful only once you understand what money is.',
    decimals: 2
  });

  Game.resources.register('exposure', {
    name: 'Exposure',
    short: 'XP',
    description: 'How visible you are to anyone who might be watching.',
    decimals: 2
  });
})();
