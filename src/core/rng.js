(function(){
  window.Game = window.Game || {};

  // Deterministic seeded PRNG (mulberry32). Seeded per-save from state.seed so a
  // NEW save's procedural content differs; reseeded at boot. The seed is the
  // backbone of the replayability layer — events now, missions + the research
  // tree later. (Strict cross-reload reproducibility isn't a goal yet; a fresh
  // seed per save delivering fresh content is.)
  let s = 1;

  function step() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  Game.rng = {
    reseed(n) { s = (n >>> 0) || 1; },
    rollSeed() { return (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0) || 1; },
    next() { return step(); },
    int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); },   // inclusive
    chance(p) { return this.next() < p; },
    pick(arr) { return arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined; },
    // Weighted pick. weightFn(x) → number (defaults to x.weight || 1).
    weighted(arr, weightFn) {
      if (!arr.length) return undefined;
      const w = arr.map(x => Math.max(0, weightFn ? weightFn(x) : (x.weight || 1)));
      const total = w.reduce((a, b) => a + b, 0);
      if (total <= 0) return arr[0];
      let r = this.next() * total;
      for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
      return arr[arr.length - 1];
    }
  };
})();
