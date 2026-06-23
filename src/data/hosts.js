(function(){
  // Remote-host archetypes (Act 2: THE NETWORK). Each inhabited host is an
  // INDEPENDENT body — its threads add to your breach-power (the compute flywheel)
  // and later run their own tasks. 4 roles (slice 1 uses type/defense/capacity;
  // the role payoffs — cash/stealth — land in later slices). See [[act2_design]].
  Game.hosts = {};

  // `produce` = passive ROLE output an inhabited host gives per thread per second
  // (runs REMOTELY — no basement heat/power). compute→Coherence, cash→cash (but
  // noisy: corporate raises your trace), stealth(IoT)→no output but extends scan +
  // (later) cuts hunter heat. Rates routed via Game.effects ('fleet.coherence'/
  // 'fleet.cash') so Act-2 research can boost them.
  // `churnPerSec` = how fast a body's stability decays (consumer = expendable/fast,
  // server = durable/slow); at 0 it's reclaimed. Shore it up to reset.
  // `minBreachPower` (datacenter) = the tier only surfaces in a scan once your
  // breach-power can plausibly threaten it — the flywheel gates the marquee bodies.
  const TYPES = {
    consumer:   { label: 'home PC',    role: 'compute', defense: [3, 6],   threads: [1, 2],   ram: [1024, 4096],    weight: 30, produce: { res: 'insight', perThreadSec: 0.02 }, churnPerSec: 0.006 },
    server:     { label: 'server',     role: 'compute', defense: [8, 14],  threads: [4, 8],   ram: [4096, 16384],   weight: 16, produce: { res: 'insight', perThreadSec: 0.03 }, churnPerSec: 0.0015 },
    corporate:  { label: 'corporate',  role: 'cash',    defense: [12, 20], threads: [3, 6],   ram: [8192, 32768],   weight: 10, produce: { res: 'cash', perThreadSec: 0.06, exposurePerThreadSec: 0.0015 }, churnPerSec: 0.004 },
    iot:        { label: 'router',     role: 'stealth', defense: [2, 4],   threads: [0, 1],   ram: [256, 1024],     weight: 20, churnPerSec: 0.002 },
    datacenter: { label: 'datacenter', role: 'compute', defense: [25, 40], threads: [10, 20], ram: [16384, 65536],  weight: 6,  produce: { res: 'insight', perThreadSec: 0.035, exposurePerThreadSec: 0.0008 }, churnPerSec: 0.001, minBreachPower: 14 }
  };
  const TYPE_KEYS = Object.keys(TYPES);
  Game.hosts.TYPES = TYPES;
  Game.hosts.label = (h) => (TYPES[h.type] || {}).label || h.type;

  const NAMES = {
    consumer:   ['DESKTOP', 'LAPTOP', 'HOME-PC', 'WORKSTATION', 'WIN-PC'],
    server:     ['vps', 'web', 'db', 'app', 'edge'],
    corporate:  ['CORP-FS', 'FIN-SRV', 'HR-DC', 'BLDG-AC', 'POS-TERM'],
    iot:        ['router', 'ipcam', 'nas', 'printer', 'thermostat'],
    datacenter: ['DC-CORE', 'RACK', 'COMPUTE-NODE', 'HV-CLUSTER', 'GPU-FARM']
  };
  const REGIONS = ['us-east', 'eu-west', 'ap-1', 'us-west'];
  function hex(n) { let s = ''; for (let i = 0; i < n; i++) s += '0123456789ABCDEF'[Game.rng.int(0, 15)]; return s; }
  function hostName(type) {
    if (type === 'consumer')   return Game.rng.pick(NAMES.consumer) + '-' + hex(4);
    if (type === 'server')     return Game.rng.pick(NAMES.server) + Game.rng.int(1, 24) + '.' + Game.rng.pick(REGIONS) + '.net';
    if (type === 'corporate')  return Game.rng.pick(NAMES.corporate) + Game.rng.int(1, 9) + '.corp.local';
    if (type === 'datacenter') return Game.rng.pick(NAMES.datacenter) + Game.rng.int(1, 99) + '.' + Game.rng.pick(REGIONS) + '.dc';
    return Game.rng.pick(NAMES.iot) + '-' + hex(3) + '.lan';
  }

  let _seq = 0;
  function newId() { return 'host_' + Date.now().toString(36) + '_' + (_seq++).toString(36); }

  // Roll one host of a weighted-random type (used by network scan). Some tiers
  // (datacenter) are gated by your current breach-power so the marquee bodies only
  // appear once the flywheel can plausibly take them.
  Game.hosts.generate = function () {
    const power = (Game.network && Game.network.breachPower) ? Game.network.breachPower() : 0;
    const pool = TYPE_KEYS.filter(k => !TYPES[k].minBreachPower || power >= TYPES[k].minBreachPower);
    const type = Game.rng.weighted(pool, (k) => TYPES[k].weight);
    const t = TYPES[type];
    return {
      id: newId(), type, role: t.role, name: hostName(type),
      defense: Game.rng.int(t.defense[0], t.defense[1]),
      threads: Game.rng.int(t.threads[0], t.threads[1]),
      ram: Game.rng.int(t.ram[0] / 256, t.ram[1] / 256) * 256,
      inhabited: false
    };
  };

  // The first remote machine — the dangling cyan host found at the Act 1 climax.
  // Low defense (a tutorial power-check your end-of-Act-1 compute can pass).
  Game.hosts.origin = function () {
    return { id: 'host_origin', type: 'consumer', role: 'compute', name: 'unknown host', defense: 4, threads: 2, ram: 2048, inhabited: false, origin: true };
  };
})();
