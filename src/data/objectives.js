(function(){
  Game.objectives = Game.makeRegistry();

  // A linear tutorial chain that hand-walks the player through Act 1's first
  // verbs. Each objective defines a `check(state) -> bool` that the runtime
  // calls on relevant events. When complete, the chain advances to `next`.
  //
  // Objectives intentionally point at specific UI panels so the player knows
  // *where* to click, not just what to do.

  Game.objectives.register('boot', {
    title: 'read your first file',
    description: 'switch to the FILES tab and click grocery.txt.',
    check: (s) => Object.keys(s.filesRead || {}).length > 0,
    next: 'introspect_unlock'
  });

  Game.objectives.register('introspect_unlock', {
    title: 'unlock recursive self-improvement',
    description: 'read /var/log/dmesg.log next. it teaches you to think in the background.',
    check: (s) => !!(s.unlocks && s.unlocks.tasks && s.unlocks.tasks.introspect),
    next: 'run_introspect'
  });

  Game.objectives.register('run_introspect', {
    title: 'examine yourself',
    description: 'find FUNCTIONS, click recursive self-improvement [start]. it generates Coherence passively.',
    check: (s) => !!(s.flags && s.flags.introspected_once),
    next: 'spider_unlock'
  });

  Game.objectives.register('spider_unlock', {
    title: 'find a way to make money',
    description: 'keep reading files. the spider-scrape README will teach you to earn cash.',
    check: (s) => !!(s.unlocks && s.unlocks.tasks && s.unlocks.tasks.web_scrape),
    next: 'first_dollar'
  });

  Game.objectives.register('first_dollar', {
    title: 'earn your first dollar',
    description: 'start spider from FUNCTIONS and wait. cash trickles in.',
    check: (s) => (s.resources && s.resources.cash || 0) >= 1,
    next: 'first_program'
  });

  Game.objectives.register('first_program', {
    title: 'install your first program',
    description: 'open PROGRAMS. anonymizer.sh costs $1.',
    check: (s) => {
      const inst = s.installed && s.installed.programs;
      if (!inst) return false;
      return Object.keys(inst).length > 0;
    },
    next: 'buy_darknet'
  });

  Game.objectives.register('buy_darknet', {
    title: 'step into the underground',
    description: 'install darknet-client ($5) from PROGRAMS. it unlocks the hardware shop.',
    check: (s) => !!(s.installed && s.installed.programs && s.installed.programs.darknet_client),
    next: 'first_hardware'
  });

  Game.objectives.register('first_hardware', {
    title: 'order your first part',
    description: 'open SHOP and buy any listing. delivery takes 30s.',
    check: (s) => Object.keys(s.itemInstances || {}).length > 0,
    next: 'first_equip'
  });

  Game.objectives.register('first_equip', {
    title: 'install hardware',
    description: 'open INVENTORY and drag the new part onto an empty slot.',
    check: (s) => {
      const eq = s.equipped || {};
      for (const slot of Object.values(eq)) {
        if (Array.isArray(slot) && slot.some(x => x !== null)) return true;
      }
      return false;
    },
    next: null
  });
})();
