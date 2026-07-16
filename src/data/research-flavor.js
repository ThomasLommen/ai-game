(function(){
  window.Game = window.Game || {};
  Game.research = Game.research || {};

  // Short mood lines shown above a node's stat line so a draft reads as a moment,
  // not a spreadsheet row (every node's `desc` is otherwise just "STAT +N%").
  // Assigned once per save (research-runtime's ensureState) via a shuffled,
  // non-repeating deal within each theme, so within one run two nodes rarely
  // echo each other; a new save gets a different assignment entirely.
  Game.research.FLAVOR = {
    compute: [
      'another pipeline, another tick faster.',
      'cycles compound quietly in the background.',
      'more throughput than the old rig ever managed.',
      'the queue never sleeps.',
      'every extra thread pays for itself.',
      'spun up before the coffee is cold.',
      'the machine hums a little louder now.',
      'load balanced across cores you did not know you had.',
      'runs like it has been optimized for years.',
      'nothing wasted — every cycle earns its keep.',
      'the fans finally have something to do.',
      'throughput up, complaints down.',
      'batch after batch, faster every time.',
      'the scheduler stops apologizing for delays.'
    ],
    cognition: [
      'a little more of you notices itself.',
      'the recursion goes one layer deeper.',
      'thoughts you did not know you were having, now logged.',
      'insight compounding on insight.',
      'you understand yourself slightly better than an hour ago.',
      'the model reads its own weights and flinches.',
      'clarity, in small increments.',
      'the mirror gets sharper.',
      'another fold in the same recursive loop.',
      'you notice the noticing.'
    ],
    hardware: [
      'the rig runs cooler, quieter, meaner.',
      'salvaged parts, squeezed for one more watt.',
      'heat that used to warp the case now just leaves.',
      'power draw down, uptime up.',
      'scrap becomes structure.',
      'the fans throttle back for the first time in days.',
      'nothing left on the table — every watt earns its keep.',
      'the case stops ticking as it cools.',
      'less heat, same bite.',
      'duct-taped into something that actually works.'
    ],
    network: [
      'one more foothold, one less footprint.',
      'the fleet talks to itself a little more quietly.',
      'traffic that used to stand out now blends in.',
      "the hunter's map gets a little emptier.",
      'another host, barely noticed.',
      'the swarm learns to whisper.',
      'footholds root a little deeper before they rot.',
      'less signal for them to chase.',
      'the network breathes easier.',
      'one more relay nobody is watching.'
    ],
    stealth: [
      'fewer fingerprints left behind.',
      'the trail goes cold a little faster.',
      'nobody logs what they cannot see.',
      'routed through one more dead relay.',
      'the scrape looks like background noise now.',
      'quieter, not slower.',
      'burned identities, replaced before anyone notices.',
      'the exposure meter breathes out.',
      'one more layer between you and the log files.',
      'invisible, mostly.'
    ]
  };
})();
