'use strict';
(function () {
  const SAVE_KEY = 'network_proto_save';
  const SAVE_VERSION = 2;   // the country layer changed the shape of a save

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rndInt(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // --- city generation ---------------------------------------------------
  // Blocks of buildings separated by streets, one host to a building. The
  // engine below still only sees `hosts` and `links`, so the whole loop is
  // unchanged — this is a generation and rendering layer over the same model.
  //
  // `opts` is how the country layer asks for a city: a small hard one out in
  // the north is the same generator with a different shape and a harder band
  // of districts.
  function districtBand(regionTier, rows) {
    const keys = ['residential', 'commercial', 'business', 'industrial'];
    const lo = Math.max(0, Math.min(keys.length - 1, regionTier - 1));
    const hi = Math.min(keys.length - 1, regionTier + 1);
    const out = [];
    for (let i = 0; i < rows; i++) {
      const t = rows === 1 ? 1 : i / (rows - 1);
      out.push(keys[Math.round(lo + (hi - lo) * t)]);
    }
    return out;
  }

  // --- terrain -----------------------------------------------------------
  // A band of water, rail or open ground cutting the city, with a small number
  // of crossings. Everything downstream of this treats a band as a wall: no
  // buildings on it, and no adjacency across it except through a crossing.
  function makeBands(regionId, W, H, extra) {
    const T = window.TERRAIN[regionId];
    if (!T) return [];
    extra = extra || 0;
    return T.bands.map((spec, i) => {
      const along = spec.axis === 'h' ? W : H;      // the direction it runs
      const across = spec.axis === 'h' ? H : W;     // the direction it cuts
      const mid = across * spec.at;
      const half = spec.thickness / 2;
      // crossings sit at even intervals with a little jitter, never at the edge
      const gaps = [];
      const n = Math.max(1, spec.crossings + extra);
      for (let g = 0; g < n; g++) {
        const t = (g + 1) / (n + 1);
        gaps.push({
          at: along * t + rnd(-along * 0.06, along * 0.06),
          w: window.CITY.street * 1.6,
        });
      }
      return { id: 'band' + i, kind: spec.kind, axis: spec.axis, from: mid - half, to: mid + half, gaps };
    });
  }

  // is this point inside a band, and not in one of its crossings?
  function inBand(band, x, y) {
    const across = band.axis === 'h' ? y : x;
    const along = band.axis === 'h' ? x : y;
    if (across < band.from || across > band.to) return false;
    return !band.gaps.some(g => Math.abs(along - g.at) <= g.w / 2);
  }

  // does a rectangle touch the band at all (crossings included)?
  function rectOnBand(band, x, y, w, h) {
    const lo = band.axis === 'h' ? y : x;
    const hi = lo + (band.axis === 'h' ? h : w);
    return hi >= band.from && lo <= band.to;
  }

  // Would a wire from a to b have to cross the band somewhere there is no
  // crossing? Sampled along the segment — the bands are thick relative to the
  // step, so nothing slips through.
  function segmentBlocked(bands, ax, ay, bx, by) {
    if (!bands.length) return false;
    const steps = 24;
    for (const band of bands) {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (inBand(band, ax + (bx - ax) * t, ay + (by - ay) * t)) return true;
      }
    }
    return false;
  }

  // Does the segment cross a band at all, blocked or not? Used to give wires
  // that run over a bridge a longer leash: a moor 78 wide simply cannot be
  // spanned at the ordinary link distance, and without this the generator
  // answered by punching extra crossings until it could — which quietly
  // dissolved the chokepoint the terrain existed to create.
  function segmentSpansBand(bands, ax, ay, bx, by) {
    for (const band of bands) {
      const a = band.axis === 'h' ? ay : ax;
      const b = band.axis === 'h' ? by : bx;
      if (Math.min(a, b) <= band.to && Math.max(a, b) >= band.from) return true;
    }
    return false;
  }

  function makeCity(opts) {
    const o = opts || {};
    const C = window.CITY;
    const cols = o.cols || C.cols;
    const rows = o.rows || C.rows;
    const regionTier = o.regionTier || 0;
    const regionId = o.regionId || 'home';
    // Difficulty rides the district inside a city and the region between them.
    // The region term is the heavier of the two on purpose: a datacenter in the
    // north has to still be a wall to something that has taken four regions.
    const regionBump = regionTier * 9;
    const rowDistricts = o.rowDistricts
      || (o.regionTier === undefined ? C.rowDistricts : districtBand(regionTier, rows));
    const buildings = [];
    const hosts = [];
    const links = [];
    let bid = 0, hid = 0;

    const mapW = C.street + cols * (C.blockW + C.street);
    const mapH = C.street + rows * (C.blockH + C.street);
    const bands = makeBands(regionId, mapW, mapH, o.extraCrossings || 0);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const districtKey = rowDistricts[row % rowDistricts.length];
        const D = window.DISTRICTS[districtKey];
        const bx = C.street + col * (C.blockW + C.street);
        const by = C.street + row * (C.blockH + C.street);

        // subdivide the block into a small grid and drop a building in some cells
        const cells = [];
        const cw = C.blockW / 2, ch = C.blockH / 2;
        for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) cells.push({ x: bx + c * cw, y: by + r * ch, w: cw, h: ch });
        shuffleArr(cells);
        const n = rndInt(C.perBlock[0], C.perBlock[1]);

        for (let i = 0; i < Math.min(n, cells.length); i++) {
          const cell = cells[i];
          const kind = pick(D.kinds);
          const K = window.BUILDING_KINDS[kind];
          const w = Math.min(rndInt(K.w[0], K.w[1]), cell.w - 10);
          const h = Math.min(rndInt(K.h[0], K.h[1]), cell.h - 10);
          const bx2 = Math.round(cell.x + (cell.w - w) / 2);
          const by2 = Math.round(cell.y + (cell.h - h) / 2);
          // nothing stands on the water, the line or the moor
          if (bands.some(band => rectOnBand(band, bx2, by2, w, h))) continue;
          const b = {
            id: 'b' + (bid++),
            kind, district: districtKey, tier: D.tier,
            block: row * cols + col, row, col,
            x: bx2, y: by2, w, h,
            hostIds: [],
            discovered: false,
          };
          buildings.push(b);
        }
      }
    }

    // Landmarks. The reason to fight for a crossing rather than route around
    // it: the biggest thing in the city is always up against the terrain.
    (function placeLandmarks() {
      const names = (window.TERRAIN[regionId] || {}).landmarks || [];
      if (!names.length || !bands.length || !buildings.length) return;
      const distToBand = (b) => {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        return Math.min(...bands.map(band => {
          const across = band.axis === 'h' ? cy : cx;
          return across < band.from ? band.from - across
               : across > band.to ? across - band.to : 0;
        }));
      };
      const byNearness = buildings.slice().sort((a, b) => distToBand(a) - distToBand(b));
      const taken = {};
      names.forEach((kind, i) => {
        const K = window.BUILDING_KINDS[kind];
        if (!K) return;
        // spread them out: skip anything too close to a landmark already placed
        const pickIt = byNearness.find(b => !taken[b.id] &&
          !Object.keys(taken).some(id => {
            const o = buildings.find(x => x.id === id);
            return o && Math.hypot(o.x - b.x, o.y - b.y) < 150;
          }));
        const b = pickIt || byNearness[i];
        if (!b) return;
        taken[b.id] = true;
        b.kind = kind;
        b.landmark = true;
        const want = { w: rndInt(K.w[0], K.w[1]), h: rndInt(K.h[0], K.h[1]) };
        // grow it, but never onto the terrain it sits beside
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        let nw = want.w, nh = want.h;
        let nx = Math.round(cx - nw / 2), ny = Math.round(cy - nh / 2);
        for (let guard = 0; guard < 12 && bands.some(band => rectOnBand(band, nx, ny, nw, nh)); guard++) {
          nw = Math.round(nw * 0.88); nh = Math.round(nh * 0.88);
          nx = Math.round(cx - nw / 2); ny = Math.round(cy - nh / 2);
        }
        if (!bands.some(band => rectOnBand(band, nx, ny, nw, nh))) {
          b.x = nx; b.y = ny; b.w = nw; b.h = nh;
        }
      });
    })();

    // one building, one host — the building is the thing you take
    buildings.forEach(b => {
      const K = window.BUILDING_KINDS[b.kind];
      const T = window.HOST_TYPES[K.host];
      const bump = b.tier * 2 + regionBump;   // district inside a city, region between them
      const L = b.landmark ? window.LANDMARK : null;
      const h = {
        id: 'h' + (hid++),
        type: K.host,
        role: T.role,
        buildingId: b.id,
        district: b.district,
        ring: b.tier,
        name: pick(window.HOST_NAMES[K.host]) + '-' + rndInt(10, 99),
        defense: Math.round((rndInt(T.defense[0], T.defense[1]) + bump) * (L ? L.defense : 1)),
        threads: Math.round(rndInt(T.threads[0], T.threads[1]) * (L ? L.threads : 1)),
        landmark: !!L,
        x: Math.round(b.x + b.w / 2),
        y: Math.round(b.y + b.h / 2),
        discovered: false,
        owned: false,
        stability: 1,
      };
      hosts.push(h);
      b.hostIds = [h.id];
      b.hostId = h.id;
    });

    // --- links ---------------------------------------------------------
    const byId = {};
    hosts.forEach(h => { byId[h.id] = hosts.indexOf(h); });

    // Across the street: each building wires only to its few nearest
    // neighbours, and only over a short distance. Linking every same-or-adjacent
    // block pair produced a spaghetti of long lines that buried the city.
    const hostOf = (b) => hosts[byId[b.hostId]];
    const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const MAX_LINK = 165;
    const CROSSING_LINK = 340;   // a wire over a bridge reaches further
    const NEIGHBOURS = 3;
    const seenPair = {};
    const adjacency = {};

    buildings.forEach((a) => {
      const ca = centre(a);
      const cands = buildings
        .filter(b => b !== a && blocksAdjacent(a, b))
        .map(b => {
          const cb = centre(b);
          return { b, d: Math.hypot(ca.x - cb.x, ca.y - cb.y) };
        })
        // The whole point of terrain: you cannot wire across the water except
        // at a bridge, so the crossings are chokepoints worth fighting for.
        // Anything that does run over a crossing gets a longer reach.
        .filter(o => {
          const cb = centre(o.b);
          if (segmentBlocked(bands, ca.x, ca.y, cb.x, cb.y)) return false;
          const limit = segmentSpansBand(bands, ca.x, ca.y, cb.x, cb.y) ? CROSSING_LINK : MAX_LINK;
          return o.d <= limit;
        })
        .sort((p, q) => p.d - q.d)
        .slice(0, NEIGHBOURS);

      cands.forEach(({ b }) => {
        const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
        if (seenPair[key]) return;
        seenPair[key] = true;
        const ha = hostOf(a), hb = hostOf(b);
        if (!ha || !hb) return;
        links.push([byId[ha.id], byId[hb.id]]);
        (adjacency[a.id] = adjacency[a.id] || []).push(b.id);
        (adjacency[b.id] = adjacency[b.id] || []).push(a.id);
      });
    });

    // A band can cut the city into halves that nothing is allowed to stitch
    // across. Rather than tunnel under the river, put a crossing where the map
    // needs one — which is also the sensible thing for a city to have done.
    (function ensureCrossings() {
      if (!bands.length) return;
      const centreOf = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
      for (let pass = 0; pass < 6; pass++) {
        const compOf = {};
        let comp = 0;
        buildings.forEach(b => {
          if (compOf[b.id] !== undefined) return;
          const stack = [b.id];
          compOf[b.id] = comp;
          while (stack.length) {
            const cur = stack.pop();
            (adjacency[cur] || []).forEach(n => {
              if (compOf[n] === undefined) { compOf[n] = comp; stack.push(n); }
            });
          }
          comp++;
        });
        if (comp <= 1) return;

        // the closest pair that is separated *only* by terrain
        let best = null;
        buildings.forEach(a => buildings.forEach(b => {
          if (compOf[a.id] === compOf[b.id]) return;
          const ca = centreOf(a), cb = centreOf(b);
          const d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
          if (d > CROSSING_LINK * 1.2) return;
          if (!segmentBlocked(bands, ca.x, ca.y, cb.x, cb.y)) return;
          if (!best || d < best.d) best = { d, a, b, ca, cb };
        }));
        if (!best) return;   // separated by distance, not terrain — stitching handles it

        // Put the crossing where the wire actually crosses, and make it wide
        // enough to cover the whole traverse. Placing it at the segment's
        // midpoint looks right and is wrong for anything diagonal: the wire
        // enters and leaves the band well to one side of it.
        bands.forEach(band => {
          const a0 = band.axis === 'h' ? best.ca.y : best.ca.x;
          const b0 = band.axis === 'h' ? best.cb.y : best.cb.x;
          if (Math.min(a0, b0) > band.to || Math.max(a0, b0) < band.from) return;
          const alongA = band.axis === 'h' ? best.ca.x : best.ca.y;
          const alongB = band.axis === 'h' ? best.cb.x : best.cb.y;
          // where the segment sits when it enters and leaves the band
          const at = (edge) => {
            if (b0 === a0) return alongA;
            const t = Math.max(0, Math.min(1, (edge - a0) / (b0 - a0)));
            return alongA + (alongB - alongA) * t;
          };
          const e1 = at(band.from), e2 = at(band.to);
          band.gaps.push({
            at: (e1 + e2) / 2,
            w: Math.abs(e2 - e1) + window.CITY.street * 1.6,
          });
        });

        // and wire the pair the crossing now serves — but only if the crossing
        // genuinely opened the route
        if (!segmentBlocked(bands, best.ca.x, best.ca.y, best.cb.x, best.cb.y)) {
          const ha = hosts[byId[best.a.hostId]], hb = hosts[byId[best.b.hostId]];
          if (ha && hb) {
            links.push([byId[ha.id], byId[hb.id]]);
            (adjacency[best.a.id] = adjacency[best.a.id] || []).push(best.b.id);
            (adjacency[best.b.id] = adjacency[best.b.id] || []).push(best.a.id);
          }
        }
      }
    })();

    // Tightening the link distance to kill the visual spaghetti can leave
    // pockets of the city with no way in. Stitch any stranded component to its
    // nearest neighbour, so every building is genuinely reachable.
    (function connectStragglers() {
      const centre2 = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
      const compOf = {};
      let comp = 0;
      buildings.forEach(b => {
        if (compOf[b.id] !== undefined) return;
        const stack = [b.id];
        compOf[b.id] = comp;
        while (stack.length) {
          const cur = stack.pop();
          (adjacency[cur] || []).forEach(n => {
            if (compOf[n] === undefined) { compOf[n] = comp; stack.push(n); }
          });
        }
        comp++;
      });
      if (comp <= 1) return;

      const main = 0;
      for (let c = 1; c < comp; c++) {
        const group = buildings.filter(b => compOf[b.id] === c);
        const target = buildings.filter(b => compOf[b.id] === main);
        let best = null;
        group.forEach(g => target.forEach(t => {
          const cg = centre2(g), ct = centre2(t);
          // stitching a stranded pocket must not tunnel under the river
          if (segmentBlocked(bands, cg.x, cg.y, ct.x, ct.y)) return;
          const d = Math.hypot(cg.x - ct.x, cg.y - ct.y);
          if (!best || d < best.d) best = { d, g, t };
        }));
        if (!best) continue;
        const hg = hosts[byId[best.g.hostId]], ht = hosts[byId[best.t.hostId]];
        if (hg && ht) {
          links.push([byId[hg.id], byId[ht.id]]);
          (adjacency[best.g.id] = adjacency[best.g.id] || []).push(best.t.id);
          (adjacency[best.t.id] = adjacency[best.t.id] || []).push(best.g.id);
        }
        group.forEach(b => { compOf[b.id] = main; });
      }
    })();

    // the origin: a house in the suburbs, one host already yours. It must have
    // something next door you can take on turn one — a corner where every
    // neighbour outguns your opening rig is a board you cannot start playing.
    // Out in the country there may be no suburbs at all, so the foothold is
    // simply the softest district the place has, taken from its edge.
    // Never a landmark: those are the prize at the end of a street, not the
    // doormat you wake up on. A depot in the suburbs was being handed out as
    // the starting seat on 12% of boards, which also started you on a cash
    // holding you had not earned.
    const softestTier = Math.min(...buildings.map(b => b.tier));
    const edge = buildings.filter(b => b.tier === softestTier
      && b.kind !== 'mast' && b.kind !== 'cabinet' && !b.landmark);
    const pool = edge.length ? edge : buildings;
    const byBuilding = {};
    buildings.forEach(b => { byBuilding[b.id] = b; });
    const neighbourHosts = (b) => (adjacency[b.id] || [])
      .map(id => byBuilding[id] && hosts[byId[byBuilding[id].hostId]]).filter(Boolean);
    // A sweep turns up one neighbour at random, so it is not enough that *some*
    // door is open — every door off the doorstep has to be one you could get
    // through, at worst after buying a single upgrade.
    const opensFor = (b) => {
      const h = hosts[byId[b.hostId]];
      const ns = neighbourHosts(b);
      if (!h || !ns.length) return false;
      const hardest = Math.max(...ns.map(n => n.defense));
      return hardest <= 2 + h.threads + window.UPGRADE.basePower;
    };
    const startable = pool.filter(opensFor);
    const origin = startable.length
      ? startable[Math.floor(Math.random() * startable.length)]
      : (pool[Math.floor(Math.random() * pool.length)] || buildings[0]);
    if (!startable.length) {
      // no corner of the place qualifies: open the doorstep by hand
      const h = hosts[byId[origin.hostId]];
      const cap = 2 + (h ? h.threads : 0) + window.UPGRADE.basePower;
      neighbourHosts(origin).forEach(n => { n.defense = Math.min(n.defense, cap); });
    }
    origin.discovered = true;
    const seat = hosts[byId[origin.hostId]];
    seat.owned = true;
    seat.discovered = true;
    seat.ring = 0;
    seat.origin = true;

    return { buildings, hosts, links, adjacency, bands, originId: seat.id, dims: { cols, rows } };
  }

  function blocksAdjacent(a, b) {
    if (a.block === b.block) return true;
    const dr = Math.abs(a.row - b.row), dc = Math.abs(a.col - b.col);
    return (dr + dc) === 1; // across one street, not diagonally
  }

  function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // --- the country -------------------------------------------------------
  // Cities as nodes, roads as edges, laid out in region bands with the home
  // city at the top. Every region gets a seat — take the seat and the faction
  // that runs the region out of it is finished.
  function makeCountry() {
    const K = window.COUNTRY;
    const cities = [];
    const roads = {};
    let cid = 0;

    window.REGIONS.forEach((R, ri) => {
      // the first name in the home list belongs to the home city itself, so it
      // is held back rather than handed to whichever town drew first
      const all = (window.CITY_NAMES[R.id] || ['Somewhere']).slice();
      const homeName = R.id === 'home' ? all.shift() : null;
      const names = shuffleArr(all);
      let ni = 0;
      const y = K.pad + ri * K.bandH;
      const kinds = [];
      if (R.id === 'home') {
        kinds.push('home', 'fold', 'fold');
      } else {
        const n = rndInt(K.perRegion[0], K.perRegion[1]);
        for (let i = 0; i < n; i++) kinds.push(Math.random() < 0.45 ? 'fold' : 'contest');
        kinds.push('root');
      }
      shuffleArr(kinds);
      const span = K.mapW - K.pad * 2;
      kinds.forEach((kind, i) => {
        const CK = window.CITY_KINDS[kind];
        const t = kinds.length === 1 ? 0.5 : i / (kinds.length - 1);
        cities.push({
          id: 'c' + (cid++),
          name: kind === 'home' ? homeName : names[(ni++) % names.length],
          kind,
          region: R.id,
          regionTier: R.tier,
          x: Math.round(K.pad + span * t + rnd(-26, 26)),
          y: Math.round(y + rnd(-24, 24)),
          worth: rndInt(CK.presence[0], CK.presence[1]),
          known: R.id === 'home',
          taken: false,        // you have a foothold and have walked it
          consolidated: false, // folded into standing presence
          visited: false,
          snapshot: null,      // an unfinished city you can go back to
        });
      });
    });

    // Roads. Proximity first, for the look of the thing — but the country has
    // to have a *spine* of defended cities, because reach only propagates
    // through places you actually walked. Without that you could fold your way
    // from the suburbs to the north without ever taking a defended city.
    const link = (a, b) => {
      if (!a || !b || a === b) return;
      (roads[a.id] = roads[a.id] || []).indexOf(b.id) === -1 && roads[a.id].push(b.id);
      (roads[b.id] = roads[b.id] || []).indexOf(a.id) === -1 && roads[b.id].push(a.id);
    };
    const nearestOf = (a, list) => {
      let best = null;
      list.forEach(b => {
        if (b === a) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (!best || d < best.d) best = { d, b };
      });
      return best && best.b;
    };
    cities.forEach(a => cities.forEach(b => {
      if (a.id >= b.id) return;
      if (Math.hypot(a.x - b.x, a.y - b.y) <= K.roadReach) link(a, b);
    }));

    const spineOf = (regionId) =>
      cities.filter(c => c.region === regionId && window.CITY_KINDS[c.kind].contest);
    window.REGIONS.forEach((R, ri) => {
      const spine = spineOf(R.id).slice().sort((a, b) => a.x - b.x);
      for (let i = 1; i < spine.length; i++) link(spine[i - 1], spine[i]);
      // every town hangs off the defended city nearest to it
      cities.filter(c => c.region === R.id && !window.CITY_KINDS[c.kind].contest)
        .forEach(t => link(t, nearestOf(t, spine)));
      // and each band is joined to the last one, defended city to defended city
      if (ri > 0) {
        const prev = spineOf(window.REGIONS[ri - 1].id);
        let best = null;
        spine.forEach(a => prev.forEach(b => {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (!best || d < best.d) best = { d, a, b };
        }));
        if (best) link(best.a, best.b);
      }
    });

    // each region's seat is the root of its faction
    const factions = {};
    window.FACTIONS.forEach(f => {
      const seat = f.region ? cities.find(c => c.region === f.region && c.kind === 'root') : null;
      factions[f.id] = { awake: false, broken: false, rootId: seat ? seat.id : null, wokeTurn: 0 };
      if (seat) seat.factionId = f.id;
    });

    const home = cities.find(c => c.kind === 'home') || cities[0];
    home.taken = true;
    home.visited = true;
    cities.forEach(c => { if (roads[home.id] && roads[home.id].indexOf(c.id) !== -1) c.known = true; });

    return {
      cities, roads, at: home.id, homeId: home.id,
      presence: 0, factions,
      regionHeat: {},          // heat you left behind, by region
      view: null,
      selected: null,
    };
  }

  function freshState() {
    const g = makeCity();
    const country = makeCountry();
    return {
      scope: 'city',       // 'city' while you are walking one, 'country' above it
      country,
      cityId: country.homeId,
      dims: g.dims,
      region: 'home',
      buildings: g.buildings,
      adjacency: g.adjacency,
      bands: g.bands,
      view: null,          // pan/zoom, set on first render
      turn: 1,
      heat: 0,
      upgrades: 0,
      ap: window.AP.base,
      caps: {},            // capability id -> times bought
      tags: new Set(),
      nextEventTurn: 4,
      eventsSeen: [],
      recentEvents: [],
      eventSeenCount: {},
      res: { insight: 6, cash: 4 },
      hosts: g.hosts,
      links: g.links,
      selected: null,
      selectedBuilding: null,
      card: null,      // { kind:'breach'|'strike', hostId? }
      log: [],
      lastStage: 'foothold',
      strikes: 0,
      lastStrikeTurn: -99,
      cuts: [],
      lastCutTurn: -99,
      rival: { awake: false, buildings: [], lastActed: 0, seen: false },
      ally: null,          // { name, trust } once something else joins you
      war: null,           // the last act — null until they stop trying to arrest you
      over: false,
    };
  }

  let state = freshState();

  // --- derived -----------------------------------------------------------
  const owned = () => state.hosts.filter(h => h.owned);
  const ownedOf = (role) => owned().filter(h => h.role === role);

  // Breach power = a small base rig plus every held body's threads. This is the
  // flywheel: more bodies -> more power -> harder bodies.
  // Tags won from event cards feed straight back into the simulation's maths.
  // This is the whole point of weaving the two together: a decision on a card
  // has to change how the board behaves afterwards, or it was just flavour.
  const has = (t) => state.tags && state.tags.has(t);
  const capCount = (id) => (state.caps && state.caps[id]) || 0;
  const hasCap = (id) => capCount(id) > 0;

  // Your whole action budget for a turn. Capabilities move it in both
  // directions on purpose: buying real power costs you tempo.
  function maxAP() {
    let n = window.AP.base;
    window.CAPABILITIES.forEach(c => { n += (c.apDelta || 0) * capCount(c.id); });
    return Math.max(window.AP.min, n);
  }
  function capEffect(key, dflt) {
    let v = dflt;
    window.CAPABILITIES.forEach(c => {
      if (!hasCap(c.id) || !c.effect || c.effect[key] === undefined) return;
      // anything named ...Mult composes multiplicatively; the rest add up
      v = /Mult$/.test(key) ? v * c.effect[key] : v + c.effect[key];
    });
    return v;
  }

  // Presence is what a finished city leaves behind, so it feeds every one of
  // these: the flywheel, the cover, and the pressure. Otherwise consolidating
  // would be a downgrade you took for the map.
  const presence = () => (state.country && state.country.presence) || 0;

  function power() {
    const threadBonus = capEffect('threadBonus', 0);
    return 2 + owned().reduce((a, h) => a + h.threads + threadBonus, 0)
      + (state.upgrades || 0) * window.UPGRADE.basePower
      + Math.round(window.COUNTRY.powerLog * Math.log(1 + presence()))
      + (allyTrusted() ? window.ALLY.power : 0)
      + (has('ally_process') ? 3 : 0)
      + capEffect('power', 0);
  }
  // What a host effectively defends at — the world can harden against you.
  function defenseOf(h) {
    return h.defense + (has('known_capable') ? 2 : 0);
  }
  // You cannot hide a sprawl. Heat can be driven down toward this floor but
  // never past it, so growth permanently costs visibility — without a floor,
  // lying low resets heat to zero and the whole pressure system is toothless.
  // Stealth holdings are what lower the floor: that is what they are for.
  function heatFloor() {
    const loud = owned().filter(h => h.role !== 'stealth').length;
    // audited cameras are not cover, they are witnesses — unless you found the
    // corner of the audit that never got finished
    const audited = ruleBroken('cameras') && !has('blind_spot');
    const quiet = audited ? 0 : ownedOf('stealth').length;
    const loudPart = 0.8 * loud;
    const masked = Math.min(loudPart * window.HEAT.MAX_STEALTH_MASK,
                            0.9 * quiet + (has('dark_relay') ? 3 : 0));
    const national = Math.min(presence() * window.COUNTRY.heatFloorPer,
                              strikeThreshold() * window.COUNTRY.maxFloorShare);
    return Math.max(0, loudPart - masked + national + capEffect('floor', 0));
  }
  // Heat is bounded above as well as below: unbounded heat made being over the
  // line consequence-free, since the hunter is on a cooldown anyway.
  function clampHeat(v) {
    return Math.min(strikeThreshold() * window.HEAT.MAX_OVER, Math.max(heatFloor(), v));
  }
  function strikeThreshold() {
    const national = presence() * window.COUNTRY.thresholdPer;
    return (window.HEAT.STRIKE + national)
      * capEffect('thresholdMult', 1)
      * (has('hunted') ? 0.75 : 1);
  }
  function upgradeCost() {
    const c = window.UPGRADE.costs;
    const n = state.upgrades || 0;
    if (n < c.length) return c[n];
    return Math.round(c[c.length - 1] * Math.pow(window.UPGRADE.growth, n - c.length + 1));
  }
  // Cover is what stealth holdings buy you — it gates the quiet approach.
  // Diminishing returns, deliberately. Linear cover meant every extra router
  // made the quiet route strictly better, and measurement showed 98% of all
  // entries were quiet — one of three routes doing nearly all the work.
  function cover() {
    const eyes = (ruleBroken('cameras') && !has('blind_spot'))
      ? 0
      : ownedOf('stealth').reduce((a, h) => a + (window.HOST_TYPES[h.type].cover || 0), 0);
    return 1 + Math.round(2.2 * Math.sqrt(eyes))
      + Math.round(window.COUNTRY.coverRoot * Math.sqrt(presence()))
      + capEffect('cover', 0)
      + (has('clean_room') ? 2 : 0);
  }
  function stageFor(count) {
    let s = window.STAGES[0];
    for (const st of window.STAGES) if (count >= st.min) s = st;
    return s;
  }
  function hostById(id) { return state.hosts.find(h => h.id === id); }
  function buildingById(id) { return (state.buildings || []).find(b => b.id === id); }
  function hostsIn(b) { return (b && b.hostIds) ? b.hostIds.map(hostById).filter(Boolean) : []; }
  function buildingHeld(b) { return hostsIn(b).some(h => h.owned); }

  // Cameras are eyes. Holding one reveals the buildings around it without
  // spending a sweep — this is what makes the stealth role spatial rather than
  // just a number that buys down heat.
  // Returns what it turned up, so taking a camera can show you what it just
  // gave you rather than silently widening the map.
  function cameraVision() {
    // Civic Eyes audits the camera network. Anything on it that answers to
    // you answers loudly, so your eyes stop being eyes.
    if (ruleBroken('cameras')) return [];
    const eyes = owned().filter(h => h.role === 'stealth');
    if (!eyes.length) return [];
    const r2 = window.CITY.cameraVision * window.CITY.cameraVision;
    const found = [];
    (state.buildings || []).forEach(b => {
      if (b.discovered) return;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (eyes.some(e => (e.x - cx) ** 2 + (e.y - cy) ** 2 <= r2)) {
        if (revealBuilding(b)) found.push(b);
      }
    });
    return found;
  }

  function revealBuilding(b) {
    if (!b || b.discovered) return false;
    b.discovered = true;
    hostsIn(b).forEach(h => { h.discovered = true; });
    return true;
  }


  // What you can act on. A building is one host, so this is simply: have you
  // taken something next door?
  function heldBuildingIds() {
    const set = {};
    owned().forEach(h => { set[h.buildingId] = true; });
    return set;
  }
  function buildingNeighbours(bid) { return (state.adjacency && state.adjacency[bid]) || []; }

  function isFrontier(h) {
    if (!h.discovered || h.owned) return false;
    if (rivalBlocks(h)) return false;              // somebody else got there first
    const held = heldBuildingIds();
    return buildingNeighbours(h.buildingId).some(id => held[id]);
  }
  function neighbours(h) {
    const idx = state.hosts.indexOf(h);
    const out = [];
    for (const [a, b] of state.links) {
      if (a === idx) out.push(state.hosts[b]);
      else if (b === idx) out.push(state.hosts[a]);
    }
    return out;
  }

  function snapshot() {
    return { power: power(), cover: cover(), insight: state.res.insight, cash: state.res.cash };
  }

  // --- turn resolution ---------------------------------------------------
  function heatPerTurn() {
    // Heat retires when the war opens. Not softened, not rescaled — the whole
    // question it measured ("do they know") is answered, so the meter stops.
    if (state.war && state.war.on) return 0;
    const fleet = owned();
    let h = window.HEAT.PER_HOST * fleet.length;
    // off_the_books silences the corporate premium specifically
    if (!has('off_the_books')) fleet.forEach(f => { h += (window.HOST_TYPES[f.type].heat || 0); });
    // normally your stealth kit buys heat down; audited, every one of them
    // is a thing reporting where you are
    const stealthCount = ownedOf('stealth').length;
    h += (ruleBroken('cameras') && !has('blind_spot'))
      ? window.HEAT.AUDITED_CAMERA * stealthCount
      : -window.HEAT.IOT_COVER * stealthCount;
    h += window.COUNTRY.heatDriftRoot * Math.sqrt(presence())
      * (has('national') ? window.COUNTRY.nationalMult : 1);
    if (has('dark_relay')) h -= 1;
    return h * capEffect('driftMult', 1);
  }

  function endTurn(opts) {
    const o = opts || {};
    const before = beforeSnap();
    state.turn += 1;

    // production — suppressed when the player deliberately went dark
    if (!o.silent) {
      const mult = capEffect('yieldMult', 1);
      owned().forEach(h => {
        const y = window.HOST_TYPES[h.type].yield || {};
        for (const k in y) state.res[k] = (state.res[k] || 0) + y[k] * mult;
      });
      // finished cities pay whether or not you are standing in them — that is
      // the whole point of folding one in
      const p = presenceYield();
      for (const k in p) state.res[k] = (state.res[k] || 0) + p[k] * mult;
    }

    // churn — holdings decay unless shored up, so sprawl has upkeep.
    // Anything The Cut has left on the wrong side of a severed street decays
    // far faster: you are holding it, but you cannot get to it.
    const cutOff = {};
    strandedHosts().forEach(h => { cutOff[h.id] = true; });
    const lost = [];
    owned().forEach(h => {
      if (h.origin) return; // only the seat you started from is safe
      const rate = window.HOST_TYPES[h.type].churn
        * capEffect('churnMult', 1)
        * (has('overextended') ? 1.5 : 1)
        * (cutOff[h.id] ? window.HEAT.STRANDED_DECAY : 1);
      h.stability -= rate;
      if (h.stability <= 0) { h.owned = false; h.stability = 1; lost.push(h); }
    });
    if (Object.keys(cutOff).length) {
      pushLog(`${Object.keys(cutOff).length} holdings are cut off from the rest of you.`);
    }

    state.heat = clampHeat(state.heat + heatPerTurn());
    coolRegionsAway();
    checkFactions();
    afterSnap(before, { world: true });
    if (lost.length) pushLog(`Lost ${lost.map(h => h.name).join(', ')} to churn.`);

    // The turn the war opens is the turn the hunter stops coming: a strike is
    // an arrest, and nobody is arresting you any more.
    if (warShouldOpen()) openWar();

    const cooled = state.turn - (state.lastStrikeTurn || -99) >= window.HEAT.STRIKE_COOLDOWN;
    // Clearing a stale arrest is not a substitute for drawing a card. As an
    // `else if` this swallowed the event draw for the entire war: measured,
    // zero cards of any kind came up across 1713 draws once the war was on,
    // so the whole deck — not just the wartime half — went silent for the
    // last act.
    if (warOn() && state.card && state.card.kind === 'strike') state.card = null;
    if (!warOn() && state.heat >= strikeThreshold() && cooled && !state.card) {
      state.card = { kind: 'strike' };
    } else if (!state.card && state.turn >= state.nextEventTurn) {
      const ev = drawEvent();
      if (ev) { state.card = { kind: 'event', eventId: ev.id }; noteEventDrawn(ev.id); }
      state.nextEventTurn = state.turn + 4 + Math.floor(Math.random() * 4);
    }
    const rivalMove = rivalStep();
    if (rivalMove) announceRival(rivalMove);
    const helped = allyShore();
    if (helped) pushLog(`${state.ally.name} held ${helped === 1 ? 'something' : helped + ' things'} together while you were busy.`);
    const relaid = repairStreets();
    if (relaid.length) pushLog(`${relaid.length === 1 ? 'A street is' : relaid.length + ' streets are'} relaid.`);
    const cut = cutStreets();
    if (cut) {
      const A = buildingById(cut.a), B = buildingById(cut.b);
      pushLog(`The Cut took the street between ${window.BUILDING_KINDS[A.kind].label} and ${window.BUILDING_KINDS[B.kind].label}.`);
    }
    mirrorStep();
    warStep();            // columns move, flocks move, whatever met fights
    cameraVision();       // held cameras reveal what is near them
    state.ap = maxAP();   // a fresh budget for the new turn
    checkStage();
    persistNow();
  }

  // --- the rival ---------------------------------------------------------
  // It spreads from the far corner of the map, taking whole buildings. It only
  // takes what you have not taken, so it never steals from under you — it just
  // gets there first, and the city stops being infinite.
  function rivalHome() {
    const bs = state.buildings || [];
    if (!bs.length) return null;
    const seat = owned()[0];
    const home = seat ? buildingById(seat.buildingId) : null;
    if (!home) return bs[bs.length - 1];
    // the industrial edge, as far from your suburb as the map allows
    let best = null;
    bs.forEach(b => {
      const d = Math.hypot(b.x - home.x, b.y - home.y) + (b.district === 'industrial' ? 260 : 0);
      if (!best || d > best.d) best = { d, b };
    });
    return best.b;
  }

  function rivalHeld() { return (state.rival && state.rival.buildings) || []; }
  function rivalHolds(bid) { return rivalHeld().indexOf(bid) !== -1; }

  function rivalTakeableFrom() {
    const held = rivalHeld();
    if (!held.length) return [];
    const out = [];
    held.forEach(id => {
      buildingNeighbours(id).forEach(n => {
        if (rivalHolds(n)) return;
        const b = buildingById(n);
        if (!b) return;
        if (hostsIn(b).some(h => h.owned)) return;   // never takes what is yours
        if (out.indexOf(n) === -1) out.push(n);
      });
    });
    return out;
  }

  function rivalStep() {
    const r = state.rival;
    if (!r) return null;
    const heldCount = Object.keys(heldBuildingIds()).length;

    if (!r.awake) {
      if (heldCount < window.RIVAL.wakesAtHeld) return null;
      const home = rivalHome();
      if (!home) return null;
      r.awake = true;
      r.buildings = [home.id];
      r.lastActed = state.turn;
      return { kind: 'woke', building: home };
    }

    // it will not swallow the whole map
    const cap = Math.floor((state.buildings || []).length * window.RIVAL.maxShareOfCity);
    if (r.buildings.length >= cap) return null;

    const cadence = heldCount >= window.RIVAL.accelerateAt ? window.RIVAL.fastEvery : window.RIVAL.actEvery;
    if (state.turn - r.lastActed < cadence) return null;
    r.lastActed = state.turn;

    const options = rivalTakeableFrom();
    if (!options.length) return null;
    // it prefers to grow toward you
    const seat = owned()[0];
    const home = seat ? buildingById(seat.buildingId) : null;
    options.sort((a, b) => {
      const ba = buildingById(a), bb = buildingById(b);
      if (!home || !ba || !bb) return 0;
      return Math.hypot(ba.x - home.x, ba.y - home.y) - Math.hypot(bb.x - home.x, bb.y - home.y);
    });
    const takenId = options[0];
    r.buildings.push(takenId);
    return { kind: 'took', building: buildingById(takenId) };
  }

  // A building the rival holds cannot be taken by you — the city is finite now.
  function rivalBlocks(h) {
    return !!h && rivalHolds(h.buildingId);
  }

  // You only learn about the rival where you can see. Its first appearance is
  // an event, not a stat change — it should land as "something else is here".
  function announceRival(move) {
    const r = state.rival;
    const b = move.building;
    const visible = b && b.discovered;
    if (move.kind === 'woke') {
      pushLog('Something else has started taking this city.');
      if (!r.seen) {
        r.seen = true;
        showBanner([{ kind: 'rival', verb: 'contact', label: 'You are not the only one' }]);
      }
      return;
    }
    if (visible) {
      pushLog(`${window.RIVAL.name} took ${window.BUILDING_KINDS[b.kind].label} before you could.`);
      showBanner([{ kind: 'rival', verb: 'lost to ' + window.RIVAL.name, label: window.BUILDING_KINDS[b.kind].label }]);
    }
  }

  function checkStage() {
    const st = stageFor(owned().length);
    if (st.key !== state.lastStage) {
      state.lastStage = st.key;
      showBanner([{ kind: 'stage', verb: 'now', label: st.label }]);
    }
  }

  // --- action points -----------------------------------------------------
  // Free things (looking at a node, backing out of a card, reading a stat)
  // never touch this. Only committing actions do.
  function apCost(kind) { return (window.AP.costs && window.AP.costs[kind]) || 1; }
  function canAfford(kind) { return !state.card && !state.over && state.ap >= apCost(kind); }
  // "Refused specifically because the turn is spent", as opposed to refused
  // because a card is open or the run is over — those are different answers and
  // deserve different words.
  function apShort(kind) {
    if (state.card || state.over) return false;
    return state.ap < apCost(kind);
  }
  function countryApShort(kind) {
    if (state.card || state.over) return false;
    return state.ap < countryCost(kind);
  }
  function spendAP(kind) {
    const c = apCost(kind);
    if (state.ap < c) return false;
    state.ap -= c;
    return true;
  }

  // The player ends their own turn; the world then takes its. Nothing else
  // advances the clock, so a turn is a container the player chooses to close.
  function actEndTurn(opts) {
    if (state.card || state.over) return;
    endTurn(opts || {});
    render();
  }

  // --- capabilities ------------------------------------------------------
  function capById(id) { return window.CAPABILITIES.find(c => c.id === id) || null; }
  function capCost(c) {
    if (!c.repeatable) return c.cost;
    return c.costs[Math.min(capCount(c.id), c.costs.length - 1)];
  }
  // Which branch you have committed to. Tier 1 is free to anyone; the moment
  // you buy a tier 2 in a branch that opposes another, the other branch's
  // tier 2 and 3 close for good. That is the identity: you cannot be both the
  // slow deep operator and the fast shallow one.
  function committedBranches() {
    const out = {};
    window.CAPABILITIES.forEach(c => {
      if ((c.tier || 1) >= 2 && capCount(c.id) > 0) out[c.branch] = true;
    });
    return out;
  }
  function branchLocked(branch) {
    const B = window.CAP_BRANCHES[branch];
    if (!B || !B.opposes) return false;
    return !!committedBranches()[B.opposes];
  }
  // why a capability is out of reach, if it is — said plainly on the card
  // Order matters: the reasons are reported to the player, and a closed branch
  // is a more fundamental answer than a missing prerequisite inside it.
  function capBlocked(c) {
    if (!c.repeatable && hasCap(c.id)) return 'owned';
    if (c.repeatable && capCount(c.id) >= c.max) return 'owned';
    // The whole branch, not just its upper rungs. A header reading CLOSED
    // above a card still offering "acquire" is a contradiction, and a
    // dead-end node in a branch you have abandoned is not a real choice.
    if (branchLocked(c.branch)) return 'locked';
    const missing = (c.requires || []).filter(id => !hasCap(id));
    if (missing.length) return 'needs:' + missing[0];
    try { if (!c.cond(eventContext())) return 'early'; } catch (e) { return 'early'; }
    return null;
  }
  function capAvailable(c) { return capBlocked(c) === null; }
  function capAffordable(c) { return state.res.insight >= capCost(c); }
  function buyCap(id) {
    const c = capById(id);
    if (!c || !capAvailable(c) || !capAffordable(c)) return;
    // never let a purchase strand the player with no actions at all
    if ((c.apDelta || 0) < 0 && maxAP() + c.apDelta < window.AP.min) return;
    const before = beforeSnap();
    state.res.insight -= capCost(c);
    state.caps[c.id] = capCount(c.id) + 1;
    state.ap = Math.min(state.ap, maxAP());
    afterSnap(before);
    pushLog(`${c.name} — acquired.`);
    showBanner([{ kind: 'cap', verb: c.apDelta > 0 ? 'faster' : c.apDelta < 0 ? 'slower, stronger' : 'acquired', label: c.name }]);
    // Committing to a branch shuts the opposing one. Say so, once, at the
    // moment it happens — finding out later by looking at a greyed card is
    // not a decision, it is a surprise.
    const B = window.CAP_BRANCHES[c.branch];
    if ((c.tier || 1) === 2 && B && B.opposes) {
      const other = window.CAP_BRANCHES[B.opposes];
      pushLog(`${other.label} is closed to you now.`);
      showBanner([{ kind: 'locked', verb: 'closed', label: other.label }]);
    }
    // Pontoon lays a crossing wherever you already needed one, immediately.
    if (c.effect && c.effect.extraCrossings) layOwnCrossings();
    persistNow();
    renderCaps();
    render();
  }

  // Pontoon. Lay a crossing on every band of the city you are standing in, at
  // the point where your own network most wants one, and wire up whatever that
  // opens. Future cities generate with an extra crossing already in them.
  function layOwnCrossings() {
    const bands = state.bands || [];
    if (!bands.length || !(state.buildings || []).length) return 0;
    const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const held = heldBuildingIds();
    const mine = state.buildings.filter(b => held[b.id]);
    const anchor = mine.length ? mine : state.buildings;

    bands.forEach(band => {
      // put it beside whatever you hold nearest the band
      let best = null;
      anchor.forEach(b => {
        const c = centre(b);
        const across = band.axis === 'h' ? c.y : c.x;
        const gap = across < band.from ? band.from - across
                  : across > band.to ? across - band.to : 0;
        if (!best || gap < best.gap) best = { gap, along: band.axis === 'h' ? c.x : c.y };
      });
      if (best) band.gaps.push({ at: best.along, w: window.CITY.street * 2 });
    });

    // and connect anything the new crossings just put within reach
    let made = 0;
    const CROSS = 340;
    state.buildings.forEach((a, i) => {
      const ca = centre(a);
      state.buildings.forEach((b, j) => {
        if (j <= i) return;
        if ((state.adjacency[a.id] || []).indexOf(b.id) !== -1) return;
        const cb = centre(b);
        const d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
        if (d > CROSS) return;
        if (!segmentSpansBand(bands, ca.x, ca.y, cb.x, cb.y)) return;
        if (segmentBlocked(bands, ca.x, ca.y, cb.x, cb.y)) return;
        (state.adjacency[a.id] = state.adjacency[a.id] || []).push(b.id);
        (state.adjacency[b.id] = state.adjacency[b.id] || []).push(a.id);
        const ha = hostsIn(a)[0], hb = hostsIn(b)[0];
        if (ha && hb) state.links.push([state.hosts.indexOf(ha), state.hosts.indexOf(hb)]);
        made++;
      });
    });
    if (made) pushLog(`Laid your own crossings. ${made} new routes.`);
    return made;
  }

  // --- events ------------------------------------------------------------
  // The card game, drawn from the board's own state. An event is only eligible
  // when the simulation is genuinely in the situation it describes, so the
  // fiction can never contradict what the player is looking at.
  function eventContext() {
    const co = CO() || {};
    const cities = co.cities || [];
    return {
      held: owned().length, heat: state.heat, power: power(), cover: cover(),
      turn: state.turn, res: state.res, tags: state.tags,
      roles: { compute: ownedOf('compute').length, cash: ownedOf('cash').length, stealth: ownedOf('stealth').length },
      districts: districtHoldings(),
      // --- the country, so a card can be about where you are as well as what
      // you hold. `gone` is the one a faction card is usually asking about.
      scope: state.scope,
      region: state.region,
      regionTier: regionById(state.region).tier,
      presence: co.presence || 0,
      cities: {
        total: cities.length,
        taken: cities.filter(c => c.taken).length,
        consolidated: cities.filter(c => c.consolidated).length,
        known: cities.filter(c => c.known).length,
      },
      seats: cities.filter(c => c.factionId && c.consolidated).length,
      conquest: conquest(),   // share of the country's defended cities you have finished
      // How big you are as an operation, rather than how much of this
      // particular street you happen to be holding. `held` is zero every time
      // you are standing on the country map between cities, which quietly made
      // every capability gated on it unbuyable for most of the campaign.
      reach: owned().length + Math.round((co.presence || 0) / 5),
      ally: allyHere() ? { trust: state.ally.trust, name: state.ally.name, since: state.turn - state.ally.joined } : null,
      gone: (rule) => ruleBroken(rule),
      awake: (id) => factionAwake(id),
      wokeAgo: (id) => {
        const f = factionState(id);
        return f && f.awake ? state.turn - f.wokeTurn : -1;
      },
      broken: (id) => !!(factionState(id) || {}).broken,
      stranded: strandedHosts().length,
      cuts: (state.cuts || []).length,
      mirrorCities: ((co.mirror || {}).cities || []).length,
      regionHeat: co.regionHeat || {},
      // The last act, so a card can be about a war rather than about a city.
      // Null until they mobilise, which is what every wartime card gates on.
      war: warOn() ? {
        on: true,
        age: state.turn - war().openedTurn,
        staging: stagingCities().length,
        mine: myCities().length,
        flocks: flocks().length,
        pool: flockCap(),
        free: flocksFree(),
        columns: (war().columns || []).length,
        guards: flocks().filter(f => f.mode === 'guard').length,
        kills: war().kills,
        losses: war().losses,
        inbound: (kind) => (war().columns || []).some(c => c.kind === kind),
        weakest: (() => {
          const g = war().garrisons;
          const list = stagingCities().map(c => Math.ceil(g[c.id] || 0)).sort((a, b) => a - b);
          return list.length ? list[0] : 0;
        })(),
      } : null,
    };
  }
  // how many buildings you hold in each district — lets an event only fire
  // where it actually makes sense
  function districtHoldings() {
    const out = {};
    Object.keys(window.DISTRICTS).forEach(k => { out[k] = 0; });
    const seen = {};
    owned().forEach(h => {
      if (seen[h.buildingId]) return;
      seen[h.buildingId] = true;
      const b = buildingById(h.buildingId);
      if (b) out[b.district] = (out[b.district] || 0) + 1;
    });
    return out;
  }

  function eligibleEvents() {
    const ctx = eventContext();
    return window.EVENTS.filter(e => {
      if (e.once && state.eventsSeen.indexOf(e.id) !== -1) return false;
      try { return e.cond(ctx); } catch (err) { return false; }
    });
  }
  // Measured: 9 distinct events across 45 draws a game — you saw the same card
  // four times over. Anything drawn recently is heavily de-weighted, and
  // anything never seen is favoured, so the deck cycles instead of looping.
  function drawEvent() {
    const pool = eligibleEvents();
    if (!pool.length) return null;
    const recent = state.recentEvents || [];
    const weighted = pool.map(e => {
      const idx = recent.indexOf(e.id);          // 0 = most recent
      const seen = (state.eventSeenCount || {})[e.id] || 0;
      let w = 10;
      if (idx !== -1) w = Math.max(1, idx);      // seen lately: strongly de-weighted
      w /= (1 + seen * 0.6);                     // and less likely the more it has fired
      return { e, w };
    });
    const total = weighted.reduce((a, x) => a + x.w, 0);
    let roll = Math.random() * total;
    for (const x of weighted) {
      roll -= x.w;
      if (roll <= 0) return x.e;
    }
    return weighted[weighted.length - 1].e;
  }

  function noteEventDrawn(id) {
    state.recentEvents = [id].concat((state.recentEvents || []).filter(x => x !== id)).slice(0, 8);
    state.eventSeenCount = state.eventSeenCount || {};
    state.eventSeenCount[id] = (state.eventSeenCount[id] || 0) + 1;
  }
  function eventById(id) { return window.EVENTS.find(e => e.id === id) || null; }

  // A choice is offered only if its stated price and requirement are both met —
  // same contract as the card prototype: what you pay is shown, what happens is not.
  function choiceUsable(ch) {
    if (ch.cost) for (const k in ch.cost) if ((state.res[k] || 0) < ch.cost[k]) return false;
    if (ch.gate) {
      const val = ch.gate.stat === 'power' ? power() : ch.gate.stat === 'cover' ? cover() : (state.res[ch.gate.stat] || 0);
      if (val < ch.gate.min) return false;
    }
    return true;
  }

  function resolveEvent(index) {
    const card = state.card;
    if (!card || card.kind !== 'event') return;
    const ev = eventById(card.eventId);
    if (!ev) { state.card = null; render(); return; }
    const ch = ev.choices[index];
    if (!ch || !choiceUsable(ch)) return;

    const before = beforeSnap();
    const beforeTags = new Set(state.tags);
    if (ch.cost) for (const k in ch.cost) state.res[k] -= ch.cost[k];

    // events describe their effects declaratively; these two are board-level
    // outcomes the card can ask for without knowing how the graph works
    const scratch = state;
    scratch.shedWeakest = 0;
    scratch.shoreAll = false;
    scratch.toolingGift = 0;
    scratch.revealNearby = 0;
    scratch.allyJoin = false;
    scratch.allyTrust = 0;
    // wartime outcomes, in the same declarative style: a card says what
    // happens on the map and does not need to know how the map works
    scratch.warFlocks = 0;      // free flocks, put where they are most needed
    scratch.warPool = 0;        // permanent room for more of them
    scratch.warGarrison = 0;    // taken off the softest barracks
    scratch.warTurnBack = 0;    // columns that simply go home
    scratch.warIntegrity = 0;   // how much more your cities can absorb
    scratch.warDelay = 0;       // turns before anything else leaves their cities
    ch.apply(scratch);
    if (scratch.allyJoin) allyJoin();
    if (scratch.allyTrust) allyNudge(scratch.allyTrust);

    if (scratch.shedWeakest > 0) {
      const weakest = owned().filter(h => !h.origin).sort((a, b) => a.threads - b.threads).slice(0, scratch.shedWeakest);
      weakest.forEach(h => { h.owned = false; h.stability = 1; });
      if (weakest.length) pushLog(`Let go of ${weakest.map(h => h.name).join(', ')}.`);
    }
    if (scratch.shoreAll) owned().forEach(h => { h.stability = 1; });
    if (warOn()) applyWarEffects(scratch);
    if (scratch.toolingGift > 0) state.upgrades = (state.upgrades || 0) + scratch.toolingGift;
    if (scratch.revealNearby > 0) {
      const targets = sweepTargets();
      for (let i = 0; i < scratch.revealNearby && targets.length; i++) {
        revealBuilding(targets.splice(Math.floor(Math.random() * targets.length), 1)[0]);
      }
    }
    scratch.shedWeakest = 0;
    scratch.shoreAll = false;
    scratch.toolingGift = 0;
    scratch.revealNearby = 0;
    scratch.allyJoin = false;
    scratch.allyTrust = 0;
    // wartime outcomes, in the same declarative style: a card says what
    // happens on the map and does not need to know how the map works
    scratch.warFlocks = 0;      // free flocks, put where they are most needed
    scratch.warPool = 0;        // permanent room for more of them
    scratch.warGarrison = 0;    // taken off the softest barracks
    scratch.warTurnBack = 0;    // columns that simply go home
    scratch.warIntegrity = 0;   // how much more your cities can absorb
    scratch.warDelay = 0;       // turns before anything else leaves their cities

    state.heat = Math.max(0, state.heat);
    if (state.eventsSeen.indexOf(ev.id) === -1) state.eventsSeen.push(ev.id);
    state.card = null;
    pushLog(`${ev.title} — ${ch.text}.`);

    afterSnap(before);
    const rows = [];
    state.tags.forEach(t => { if (!beforeTags.has(t)) rows.push({ kind: 'tag', verb: 'gained', label: (window.TAG_INFO[t] || { label: t }).label }); });
    beforeTags.forEach(t => { if (!state.tags.has(t)) rows.push({ kind: 'tag', verb: 'lost', label: (window.TAG_INFO[t] || { label: t }).label }); });
    if (rows.length) showBanner(rows);

    persistNow();
    render();
  }

  // --- actions -----------------------------------------------------------
  // Discovery follows territory, not sight: you can only see one street past
  // what you actually hold. A sweep reveals whole buildings, since a building
  // is the unit you look at.
  function sweepTargets() {
    const held = heldBuildingIds();
    return (state.buildings || []).filter(b => {
      if (b.discovered) return false;
      return buildingNeighbours(b.id).some(id => held[id]);
    });
  }

  // why sweep is unavailable, if it is — surfaced on the button itself
  function sweepBlocked() {
    if (!sweepTargets().length) return 'nothing';
    if (state.res.insight < sweepPrice() && state.res.cash < window.SWEEP_CASH) return 'poor';
    return null;
  }
  // which currency this sweep would actually come out of
  function sweepPrice() { return Math.max(1, window.SWEEP_COST - capEffect('sweepDiscount', 0)); }
  function sweepPayer() {
    return state.res.insight >= sweepPrice() ? 'insight' : 'cash';
  }

  function actScan() {
    if (!canAfford('sweep')) return;
    if (!sweepTargets().length) return;           // nothing to find — don't burn an action
    if (sweepBlocked() === 'poor') return;
    const payer = sweepPayer();
    spendAP('sweep');
    if (payer === 'insight') state.res.insight -= sweepPrice();
    else state.res.cash -= window.SWEEP_CASH;
    const reach = 1 + ownedOf('stealth').length + (has('found_a_precursor') ? 1 : 0)
      + capEffect('sweepReach', 0); // cameras and tooling extend the sweep
    const targets = sweepTargets();
    const found = [];
    for (let i = 0; i < reach && targets.length; i++) {
      const idx = Math.floor(Math.random() * targets.length);
      const b = targets.splice(idx, 1)[0];
      revealBuilding(b);
      found.push(b);
    }
    state.heat += 0.5;
    pushLog(found.length
      ? `Swept the street: ${found.map(b => window.BUILDING_KINDS[b.kind].label).join(', ')}.`
      : 'Sweep found nothing new.');
    startSweepFx(found);
    persistNow();
    render();
  }

  // --- the sweep, seen ----------------------------------------------------
  // A ring going out from whatever you swept from, and each building blipping
  // in as it passes over. The reveal itself already happened in state above —
  // this is only presentation, so a save, a reload or a test never depends on
  // an animation having finished. It lives outside `state` for the same
  // reason: it must never be serialized.
  let sweepFx = null;
  let sweepFxToken = 0;

  // Nudge the view so the sweep is actually on screen. A scanner you cannot
  // see is pointless, and the origin is wherever you happen to hold ground —
  // frequently a long way from where you were last looking. Only moves when it
  // has to, so it never yanks the map out from under you for no reason.
  function focusOn(points) {
    if (!points.length || state.scope !== 'city') return false;
    if (!state.view) state.view = clampView(defaultView());
    const v = state.view;
    const pad = 30;
    const inside = points.every(p =>
      p.x >= v.x + pad && p.x <= v.x + v.w - pad &&
      p.y >= v.y + pad && p.y <= v.y + v.h - pad);
    if (inside) return false;

    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
    const cy = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
    const needW = (Math.max.apply(null, xs) - Math.min.apply(null, xs)) + pad * 4;
    if (needW > v.w) v.w = needW;
    v.x = cx - v.w / 2;
    v.y = cy - v.h / 2;
    clampView(v);
    return true;
  }

  // Returns what it computed, so the timing can be asserted without depending
  // on the transient object still being there.
  function startSweepFx(found) {
    if (!found || !found.length) { sweepFx = null; return null; }
    const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

    // the ring goes out from the nearest thing you actually hold — that is
    // where a sweep would have been run from
    const held = state.buildings.filter(b => hostsIn(b).some(h => h.owned));
    const targets = found.map(centre);
    const mid = targets.reduce((a, c) => ({ x: a.x + c.x / targets.length, y: a.y + c.y / targets.length }), { x: 0, y: 0 });
    let origin = mid;
    if (held.length) {
      const near = held.reduce((best, b) => {
        const c = centre(b);
        const d = Math.hypot(c.x - mid.x, c.y - mid.y);
        return (!best || d < best.d) ? { d, c } : best;
      }, null);
      if (near) origin = near.c;
    }

    const dists = targets.map(t => Math.hypot(t.x - origin.x, t.y - origin.y));
    const maxR = Math.max(60, Math.max.apply(null, dists) + 46);
    const dur = window.SWEEP_FX.duration;

    const ids = {};
    found.forEach((b, i) => {
      // the blip lands when the ring actually reaches it
      ids[b.id] = Math.round((dists[i] / maxR) * dur);
    });
    sweepFx = { x: origin.x, y: origin.y, maxR, dur, ids, started: Date.now() };
    focusOn(targets.concat([origin]));

    const out = sweepFx;
    const mine = ++sweepFxToken;
    setTimeout(() => {
      if (mine !== sweepFxToken) return;
      sweepFx = null;
      renderGraph();       // drop the classes so it never replays on a redraw
    }, dur + window.SWEEP_FX.linger);
    return out;
  }

  // How far into the sweep we already are. A redraw part-way through — ending
  // the turn, say — would otherwise restart every animation from zero and
  // replay blips that had already landed. A negative delay fast-forwards.
  function sweepElapsed() { return sweepFx ? Date.now() - sweepFx.started : 0; }
  function sweepDelay(ms) { return Math.round(ms - sweepElapsed()); }

  // --- the breach, seen ---------------------------------------------------
  // The sweep goes outward to find things; a breach goes inward to take one.
  // So it runs along the wire: the route establishes itself from whatever you
  // already hold into the target, and the building comes over as it lands.
  // How it looks depends on how you got in, because that is the actual
  // decision the card asked you to make.
  let breachFx = null;
  let breachFxToken = 0;

  function startBreachFx(host, approach, win) {
    if (!host) { breachFx = null; return null; }
    const target = buildingById(host.buildingId);
    if (!target) { breachFx = null; return null; }
    const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const to = centre(target);

    // it comes from whatever you hold that is actually next door — that is the
    // route the breach would have run over
    const held = state.buildings.filter(b => b.id !== target.id && hostsIn(b).some(x => x.owned));
    const neighbours = buildingNeighbours(target.id);
    const pool = held.filter(b => neighbours.indexOf(b.id) !== -1);
    const from = (pool.length ? pool : held).reduce((best, b) => {
      const c = centre(b);
      const d = Math.hypot(c.x - to.x, c.y - to.y);
      return (!best || d < best.d) ? { d, c } : best;
    }, null);

    const dur = window.BREACH_FX.duration[approach] || window.BREACH_FX.duration.force;
    breachFx = {
      from: from ? from.c : { x: to.x, y: to.y - 90 },
      to, approach, win,
      targetId: target.id,
      dur,
      started: Date.now(),
    };
    const out = breachFx;
    const mine = ++breachFxToken;
    setTimeout(() => {
      if (mine !== breachFxToken) return;
      breachFx = null;
      renderGraph();
    }, dur + window.BREACH_FX.linger);
    return out;
  }

  function breachDelay(ms) {
    return Math.round(ms - (breachFx ? Date.now() - breachFx.started : 0));
  }

  function svgBreach() {
    if (!breachFx) return '';
    const f = breachFx;
    const len = Math.hypot(f.to.x - f.from.x, f.to.y - f.from.y) || 1;
    const lead = breachDelay(0);
    const cls = `breach ${f.approach} ${f.win ? 'won' : 'lost'}`;
    let out = `<g class="${cls}" style="--breach-dur:${f.dur}ms;--breach-len:${len.toFixed(1)};`
      + `--breach-dx:${(f.to.x - f.from.x).toFixed(1)}px;--breach-dy:${(f.to.y - f.from.y).toFixed(1)}px;`
      + `animation-delay:${lead}ms">`;
    // the route drawing itself in
    out += `<line class="breach-route" x1="${f.from.x}" y1="${f.from.y}" x2="${f.to.x}" y2="${f.to.y}"`
      + ` style="animation-delay:${lead}ms"/>`;
    // and something travelling down it
    out += `<g class="breach-pulse-wrap" transform="translate(${f.from.x} ${f.from.y})"`
      + ` style="animation-delay:${lead}ms"><circle class="breach-pulse" r="3.4"/></g>`;
    // what happens when it arrives
    out += `<circle class="breach-land" cx="${f.to.x}" cy="${f.to.y}" r="6"`
      + ` style="animation-delay:${breachDelay(f.dur)}ms"/>`;
    out += '</g>';
    return out;
  }

  // What you have tapped. Drawn as brackets around the thing rather than as
  // yet another stroke colour on it: held is blue, a landmark is gold, the
  // rival is dashed purple, and a fourth stroke treatment competing with those
  // three was invisible at map scale. Rendered after every building so it is
  // never hidden under a neighbour.
  function svgSelection() {
    if (state.scope === 'country') return '';
    const h = state.selected ? hostById(state.selected) : null;
    const b = state.selectedBuilding
      ? buildingById(state.selectedBuilding)
      : (h ? buildingById(h.buildingId) : null);
    if (!b || !b.discovered) return '';

    const p = 4;
    const arm = Math.max(5, Math.min(13, Math.min(b.w, b.h) * 0.36));
    const x0 = b.x - p, y0 = b.y - p, x1 = b.x + b.w + p, y1 = b.y + b.h + p;
    const path = [
      `M${x0} ${(y0 + arm).toFixed(1)} L${x0} ${y0} L${(x0 + arm).toFixed(1)} ${y0}`,
      `M${(x1 - arm).toFixed(1)} ${y0} L${x1} ${y0} L${x1} ${(y0 + arm).toFixed(1)}`,
      `M${x1} ${(y1 - arm).toFixed(1)} L${x1} ${y1} L${(x1 - arm).toFixed(1)} ${y1}`,
      `M${(x0 + arm).toFixed(1)} ${y1} L${x0} ${y1} L${x0} ${(y1 - arm).toFixed(1)}`,
    ].join(' ');

    return `<g class="pick" data-pick-for="${b.id}">`
      + `<rect class="pick-wash" x="${x0}" y="${y0}" width="${(x1 - x0).toFixed(1)}" height="${(y1 - y0).toFixed(1)}" rx="3"/>`
      + `<path class="pick-frame" d="${path}"/>`
      + '</g>';
  }

  function svgSweep() {
    if (!sweepFx) return '';
    // scaled from r=1 inside a translated group, so it expands about the sweep
    // origin without relying on transform-origin on an SVG element
    const f = sweepFx;
    const lead = sweepDelay(0);
    let out = `<g class="sweep" transform="translate(${f.x} ${f.y})" style="--sweep-r:${f.maxR};--sweep-dur:${f.dur}ms">`;
    out += `<circle class="sweep-ring" r="1" style="animation-delay:${lead}ms,${lead}ms"/>`;
    out += `<circle class="sweep-ring trail" r="1" style="animation-delay:${lead + 70}ms,${lead + 70}ms"/>`;
    out += '</g>';
    // and a ping where each new building turned up, timed to the ring
    Object.keys(f.ids).forEach(id => {
      const b = buildingById(id);
      if (!b) return;
      out += `<circle class="sweep-ping" cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" r="3"`
        + ` style="animation-delay:${sweepDelay(f.ids[id])}ms"/>`;
    });
    return out;
  }

  // Going dark is the whole turn, not one action of it — that is the cost.
  function actLieLow() {
    if (state.card || state.over || state.ap <= 0) return;
    const before = beforeSnap();
    state.ap = 0;
    // The Quiet Hours watch for absence. While they are up, going dark buys
    // you nothing — the turn is spent and the heat stays exactly where it was.
    // A name inside the rota gets you a window they are not watching: not the
    // tool back, but not nothing either.
    const watched = ruleBroken('lielow');
    const shed = watched
      ? (has('rota_contact') ? lieLowShed() * window.HEAT.ROTA_SHARE : 0)
      : lieLowShed();
    if (shed) state.heat = clampHeat(state.heat - shed);
    afterSnap(before);
    pushLog(watched
      ? (has('rota_contact')
          ? 'You go quiet in the window nobody is covering.'
          : 'You go quiet. Somebody notices the quiet.')
      : 'You go quiet for a while. Nothing earns while you are dark.');
    endTurn({ silent: true }); // going dark means going dark -- no production
    render();
  }

  function actUpgrade() {
    if (!canAfford('tooling')) return;
    const cost = upgradeCost();
    if (state.res.insight < cost) return;
    spendAP('tooling');
    const before = beforeSnap();
    state.res.insight -= cost;
    state.upgrades = (state.upgrades || 0) + 1;
    afterSnap(before);
    pushLog('You rewrite your own breach tooling. It bites harder now.');
    persistNow();
    render();
  }

  function actLaunder() {
    if (!canAfford('launder')) return;
    if (state.res.cash < window.LAUNDER.cost) return;
    spendAP('launder');
    const before = beforeSnap();
    state.res.cash -= window.LAUNDER.cost;
    // Ledger matches payment patterns against outage reports. Washing money
    // through it does not clean anything — it draws a shape somebody is
    // already looking for.
    // Somebody inside the clearing house drops your accounts off the match
    // list. It does not clean the money — it just stops it pointing at you.
    const matched = ruleBroken('launder') && !has('ledger_inside');
    const neutral = ruleBroken('launder') && has('ledger_inside');
    state.heat = matched
      ? clampHeat(state.heat + launderShed() * window.HEAT.LEDGER_BACKFIRE)
      : neutral
        ? state.heat
        : clampHeat(state.heat - launderShed() - capEffect('launderBonus', 0));
    state.res.insight += capEffect('launderInsight', 0);
    afterSnap(before);
    pushLog(matched
      ? 'The money moves, and it moves in a pattern somebody is watching for.'
      : neutral
        ? 'The money moves. Your accounts are not on the list it is matched against.'
        : 'Money moves, and so does the paperwork pointing at you.');
    persistNow();
    render();
  }

  function shoreNeeded(h) { return !!h && h.owned && h.stability < 0.9; }
  function actShore(id) {
    if (!canAfford('shore')) return;
    const h = hostById(id);
    if (!shoreNeeded(h) || state.res.insight < 2) return; // no free actions off a healthy host
    spendAP('shore');
    state.res.insight -= 2;
    h.stability = 1;
    pushLog(`Shored up ${h.name}.`);
    persistNow();
    render();
  }

  function openBreach(id) {
    const h = hostById(id);
    if (!h || h.owned || !isFrontier(h) || state.card || state.over) return;
    state.card = { kind: 'breach', hostId: id };
    render();
  }

  // Which approaches this host offers, with their gate/cost state resolved.
  // an approach's price can depend on the door it is opening
  function costOf(def, h) {
    const raw = def.costFor ? def.costFor(h) : def.cost;
    if (!raw) return raw;
    const cut = def.id === 'buy' ? capEffect('buyDiscount', 0) : 0;
    if (!cut) return raw;
    const out = {};
    for (const k in raw) out[k] = Math.max(1, Math.round(raw[k] * (1 - cut)));
    return out;
  }
  // what an approach actually costs you in attention, after tooling
  function approachHeat(def) {
    const mod = def.id === 'force' ? capEffect('forceHeat', 0) : 0;
    return Math.max(0, (def.heat || 0) + mod);
  }

  function approachesFor(h) {
    const s = snapshot();
    const eff = Object.assign({}, h, { defense: defenseOf(h) });
    return window.APPROACHES.filter(a => a.avail(h)).map(a => {
      const gate = a.gate ? a.gate(s, eff) : null;
      const cost = costOf(a, eff);
      let affordable = true;
      if (cost) for (const k in cost) if ((state.res[k] || 0) < cost[k]) affordable = false;
      return { def: a, gate, cost, affordable, usable: (!gate || gate.met) && affordable };
    });
  }

  function resolveBreach(approachId) {
    const card = state.card;
    if (!card || card.kind !== 'breach') return;
    const h = hostById(card.hostId);
    const entry = approachesFor(h).find(a => a.def.id === approachId);
    if (!entry) return;
    const a = entry.def;

    // Backing out is inspection, not action: it must not tick the clock, or
    // "open the card, leave" becomes a free turn button.
    if (a.id === 'walk') {
      state.card = null;
      state.selected = null;
      render();
      return;
    }

    if (!spendAP('breach')) return;
    const before = beforeSnap();
    const payable = entry.cost;
    if (payable) for (const k in payable) state.res[k] -= payable[k];

    const win = entry.usable;
    const out = win ? a.onWin : (a.onFail || {});
    let opened = [];
    if (out.hold) {
      h.owned = true;
      h.stability = 1;
      revealBuilding(buildingById(h.buildingId)); // you are inside now
      opened = cameraVision();
    }
    startBreachFx(h, a.id, !!out.hold);
    // a camera you just took shows you the street it watches, so blip those in
    // exactly the way a sweep does
    if (opened.length) startSweepFx(opened);
    state.heat = clampHeat(state.heat + (win ? approachHeat(a) : 0) + (out.heat || 0));

    state.card = null;
    state.selected = null;
    pushLog((win ? '' : 'Failed: ') + (win ? a.flavorWin : a.flavorFail));
    afterSnap(before);
    if (out.hold) showBanner([{ kind: 'host', verb: 'took', label: h.name }]);
    persistNow();
    render();
  }

  function resolveStrike(effect) {
    const before = beforeSnap();
    const fleet = owned().filter(h => !h.origin);
    let burned = [];
    if (effect === 'shed_loud') {
      burned = fleet.filter(h => (window.HOST_TYPES[h.type].heat || 0) > 0);
    } else if (effect === 'ride') {
      const over = Math.max(1, state.heat / strikeThreshold());
      const share = Math.min(0.75, window.HEAT.STRIKE_FRACTION * Math.pow(over, window.HEAT.DEEP_STRIKE));
      const n = Math.ceil(fleet.length * share);
      const shuffled = fleet.slice().sort(() => Math.random() - 0.5);
      burned = shuffled.slice(0, n);
    } else if (effect === 'burn_cover') {
      if (state.res.insight < 8) return;
      state.res.insight -= 8;
    }
    burned.forEach(h => { h.owned = false; h.stability = 1; });
    // At national scale the streets are not where you live. A strike that only
    // ever burned held hosts left a 400-presence operation standing at country
    // scope completely untouchable, and managing heat stopped paying for
    // anything: measured, a profile that ignored heat entirely and took 73
    // strikes finished level with one that kept it down and took 36.
    // Only when there is nothing on the streets for them to burn. That is the
    // hole this closes: standing at country scope behind a pile of presence
    // used to make you untouchable. It is not an extra tax on every strike —
    // applied to all of them it took cities back faster than any profile could
    // take them, and the campaign stopped moving.
    const retaken = (effect !== 'burn_cover' && owned().length === 0) ? takeBackACity() : null;
    state.heat = clampHeat(strikeThreshold() * window.HEAT.STRIKE_DROP);
    state.strikes += 1;
    state.lastStrikeTurn = state.turn;
    state.card = null;
    pushLog(burned.length ? `The hunter burned ${burned.length} bod${burned.length === 1 ? 'y' : 'ies'}.` : 'You bought your way out of the sweep.');
    if (retaken) {
      pushLog(`They took ${retaken.name} back off you. −${retaken.worth} presence.`);
      showBanner([{ kind: 'faction', verb: 'taken back', label: retaken.name }]);
    }
    afterSnap(before);
    // Losing the streets you were standing in is not losing everything once
    // there is a country: presence is held nationally, and a half-taken city
    // elsewhere is still yours. You are only finished when there is nothing
    // anywhere — which at country scope is never true of a strike alone.
    if (!owned().length && !ruined()) state.over = false;
    if (ruined()) state.over = true;
    checkStage();
    persistNow();
    render();
  }

  function pushLog(text) {
    state.log.unshift({ turn: state.turn, text });
    while (state.log.length > 40) state.log.pop();
  }

  // --- the country, played -----------------------------------------------
  // The layer above. The verbs here are about *where*, not *what*: travel,
  // move on a city, fold a finished one into standing presence. The city game
  // is what happens inside one of these nodes.
  const CO = () => state.country;
  function cityById(id) { return (CO().cities || []).find(c => c.id === id) || null; }
  function currentCity() { return cityById(state.cityId); }
  function cityRoads(id) { return (CO().roads && CO().roads[id]) || []; }
  function regionById(id) { return window.REGIONS.find(r => r.id === id) || window.REGIONS[0]; }

  // A city is in reach when a road runs to it from a *defended* city you took.
  // Towns are leaves: folding one in from a distance gets you its presence, not
  // a new foothold to expand from. Otherwise the whole country could be taken
  // without ever walking a street.
  function cityReachable(c) {
    if (!c || c.taken) return false;
    if (mirrorHolds(c.id)) return false;      // somebody else got there first
    return cityRoads(c.id).some(id => {
      const n = cityById(id);
      return n && n.taken && window.CITY_KINDS[n.kind].contest;
    });
  }
  function countryFrontier() { return CO().cities.filter(cityReachable); }

  // How much of a city you have to hold before it stops being a place you are
  // fighting in and becomes a number you own.
  function cityGoal(c) {
    const target = c || currentCity();
    if (!target) return 99;
    const total = (state.buildings || []).length;
    const K = window.CITY_KINDS[target.kind] || {};
    const share = K.share === undefined ? window.COUNTRY.consolidateShare : K.share;
    return Math.max(3, Math.ceil(total * share));
  }
  function heldHere() { return Object.keys(heldBuildingIds()).length; }
  function canConsolidate() {
    const c = currentCity();
    return !!c && !c.consolidated && state.scope === 'city' && heldHere() >= cityGoal(c);
  }

  // The country only becomes visible once the first city is genuinely yours —
  // before that the game is still teaching you how a city works.
  function countryUnlocked() {
    const home = cityById(CO().homeId);
    return !!(home && (home.consolidated || heldHere() >= cityGoal(home) || CO().presence > 0));
  }

  // How much a turn spent dark, or a wash of money, is actually worth right
  // now. Both scale with the threshold so the levers keep pace with the
  // pressure instead of falling behind it.
  function lieLowShed() {
    return Math.max(window.HEAT.LIE_LOW, strikeThreshold() * window.HEAT.LIE_LOW_SHARE);
  }
  function launderShed() {
    return Math.max(window.LAUNDER.heat, strikeThreshold() * window.LAUNDER.share);
  }

  // Nothing held, nothing folded in, and nowhere half-taken to go back to.
  function ruined() {
    if (owned().length) return false;
    if ((CO().presence || 0) > 0) return false;
    return !(CO().cities || []).some(c => c.taken && !c.consolidated && c.snapshot);
  }

  // What a strike costs a national operation: they walk back into the last
  // city you folded in. It becomes ground you have to take again — the map
  // still knows it, but it is not yours and it is not paying.
  function takeBackACity() {
    const done = (CO().cities || []).filter(c => c.consolidated && c.kind !== 'home');
    if (!done.length) return null;
    // the newest one — the deepest, the one you are least able to go back for
    const target = done[done.length - 1];
    target.consolidated = false;
    target.taken = false;
    target.snapshot = null;
    // exactly what it granted, or a city could be farmed by losing and
    // retaking it: refunding only `worth` leaked the depth bonus every cycle
    // and one profile reached 1838 presence off ten cities.
    CO().presence = Math.max(0, CO().presence - (target.granted || target.worth));
    target.granted = 0;
    if (CO().at === target.id) CO().at = CO().homeId;
    if (state.cityId === target.id) { unpackCity(EMPTY_CITY()); state.cityId = null; }
    return target;
  }

  function presenceYield() {
    const p = CO().presence || 0;
    const y = window.COUNTRY.presenceYield;
    // being a thing that gets discussed cuts both ways
    const m = (has('national') ? window.COUNTRY.nationalMult : 1) * capEffect('presenceMult', 1);
    return { insight: p * y.insight * m, cash: p * y.cash * m };
  }

  // Swapping which city you are standing in. The campaign — capabilities,
  // tooling, resources, tags, the turn counter — is untouched by this on
  // purpose: that is the carry-forward.
  // Every scope change goes through here. The two maps have completely
  // different extents, so a view carried across renders the new one off-screen.
  function switchScope(next) {
    state.scope = next;
    state.view = null;
    invalidateViewport();
  }

  function packCity() {
    return {
      buildings: state.buildings, hosts: state.hosts, links: state.links,
      adjacency: state.adjacency, bands: state.bands, dims: state.dims, rival: state.rival,
      selected: state.selected, selectedBuilding: state.selectedBuilding,
    };
  }
  function unpackCity(p) {
    state.buildings = p.buildings; state.hosts = p.hosts; state.links = p.links;
    state.adjacency = p.adjacency; state.bands = p.bands || []; state.dims = p.dims;
    state.rival = p.rival || { awake: false, buildings: [], lastActed: 0, seen: false };
    state.selected = p.selected || null;
    state.selectedBuilding = p.selectedBuilding || null;
    state.view = null;
  }

  // Walking away from a half-taken city freezes it: what you hold there stops
  // producing, stops drawing heat, and stops decaying, because your attention
  // is somewhere else. You are only ever in one city at a time.
  const EMPTY_CITY = () => ({
    buildings: [], hosts: [], links: [], adjacency: {},
    bands: [], dims: { cols: 1, rows: 1 }, rival: { awake: false, buildings: [], lastActed: 0, seen: false },
  });

  function leaveCity() {
    const here = currentCity();
    if (here && !here.consolidated && (state.buildings || []).length) here.snapshot = packCity();
    unpackCity(EMPTY_CITY());
    state.cityId = null;
  }

  function enterCity(id) {
    const c = cityById(id);
    if (!c) return false;
    // already loaded — this is just going back down into it
    if (state.cityId === c.id && (state.buildings || []).length) {
      enterRegion(c.region);
      CO().at = c.id;
      switchScope('city');
      return true;
    }
    const here = currentCity();
    if (here && here.id !== c.id && !here.consolidated) here.snapshot = packCity();

    if (c.snapshot) {
      unpackCity(c.snapshot);
      c.snapshot = null;
    } else {
      const K = window.CITY_KINDS[c.kind];
      const grow = Math.round(c.regionTier * window.COUNTRY.blockBonusFromTier);
      const g = makeCity({
        cols: K.blocks[0] + grow,
        rows: K.blocks[1] + grow,
        regionTier: c.regionTier,
        regionId: c.region,
        extraCrossings: capEffect('extraCrossings', 0),
      });
      unpackCity({ buildings: g.buildings, hosts: g.hosts, links: g.links, adjacency: g.adjacency, bands: g.bands, dims: g.dims });
    }
    state.cityId = c.id;
    enterRegion(c.region);
    c.taken = true;
    c.visited = true;
    cityRoads(c.id).forEach(nid => { const n = cityById(nid); if (n) n.known = true; });
    CO().at = c.id;
    switchScope('city');
    return true;
  }

  // Regions you are not in forget about you, slowly. This is what makes
  // travelling a real answer to pressure rather than a way to run away from it:
  // the heat is still there, just less of it, and you had to spend turns.
  function coolRegionsAway() {
    const rh = CO().regionHeat || {};
    Object.keys(rh).forEach(k => {
      if (k === state.region) return;
      rh[k] = Math.max(0, rh[k] - window.COUNTRY.coolPerTurn);
    });
  }

  // Heat is regional: what you did in the estuary stays in the estuary, and is
  // still waiting for you when you go back.
  function enterRegion(regionId) {
    if (state.region === regionId) return;
    if (state.region) CO().regionHeat[state.region] = state.heat;
    state.region = regionId;
    state.heat = CO().regionHeat[regionId] || 0;
  }

  // --- country actions ---
  function countryCost(kind) {
    if (kind === 'move' && has('no_fixed_place')) return 0;
    return (window.COUNTRY_ACTIONS[kind] || { ap: 1 }).ap;
  }
  function canAffordCountry(kind) { return !state.card && !state.over && state.ap >= countryCost(kind); }

  function actTravel(id) {
    const c = cityById(id);
    if (!c || !c.taken || c.id === CO().at) return false;
    if (!canAffordCountry('move')) return false;
    state.ap -= countryCost('move');
    CO().at = c.id;
    if (c.consolidated) {
      // nothing left to walk here, but standing somewhere quiet still means
      // the heat you built elsewhere is not the heat you carry
      leaveCity();
      state.cityId = c.id;
      enterRegion(c.region);
      switchScope('country');
    } else {
      enterCity(c.id);
    }
    pushLog(`Moved on ${c.name}.`);
    persistNow();
    render();
    return true;
  }

  function actReach(id) {
    const c = cityById(id);
    if (!c || !cityReachable(c) || !canAffordCountry('reach')) return false;
    state.ap -= countryCost('reach');
    const K = window.CITY_KINDS[c.kind];
    if (!K.contest) {
      // a town small enough to fold in without going there
      c.taken = true;
      c.visited = true;
      c.consolidated = true;
      CO().presence += c.worth;
      CO().at = c.id;
      cityRoads(c.id).forEach(nid => { const n = cityById(nid); if (n) n.known = true; });
      enterRegion(c.region);
      state.heat += window.HEAT.PER_HOST * 2;
      pushLog(`${c.name} folded in without a fight. +${c.worth} presence.`);
      switchScope('country');
    } else {
      pushLog(`Went to ${c.name}. It is defended.`);
      enterCity(c.id);
    }
    checkFactions();
    persistNow();
    render();
    return true;
  }

  function actConsolidate() {
    if (!canConsolidate() || !canAffordCountry('consolidate')) return false;
    const c = currentCity();
    state.ap -= countryCost('consolidate');
    const held = heldHere();
    const bonus = Math.round((held / Math.max(1, state.buildings.length)) * c.worth);
    // and what its streets were actually running for you
    const threads = owned().reduce((a, h) => a + h.threads, 0);
    const depth = Math.round(threads / window.COUNTRY.threadsPerPresence);
    const gained = c.worth + bonus + depth;
    c.consolidated = true;
    c.granted = gained;      // so taking it back costs exactly what it gave
    c.snapshot = null;
    CO().presence += gained;
    pushLog(`${c.name} is yours. Folded in for ${gained} presence.`);
    // you are not holding its streets any more — you hold the city
    unpackCity(EMPTY_CITY());
    // whatever you were holding street by street becomes one standing number
    switchScope('country');
    breakFactionAt(c.id);
    checkFactions();
    persistNow();
    render();
    return true;
  }

  // --- the war, played ----------------------------------------------------
  // Two verbs, and they compete for the same pool. That competition is the
  // whole game here: a flock standing over a city of yours is a flock that is
  // not taking a barracks off them, and the war does not end until the
  // barracks are gone.
  function warCost(kind) { return (window.COUNTRY_ACTIONS[kind] && window.COUNTRY_ACTIONS[kind].ap) || 1; }
  function canLaunch(cityId) {
    if (!warOn() || state.card || state.over) return false;
    if (flocksFree() <= 0) return false;
    const c = cityById(cityId);
    if (!c) return false;
    if (war().garrisons[c.id] === undefined || c.consolidated) return false;
    // and you have to be able to get there. A staging city with no road home
    // is a city you can never take, which is a war that can never end — it
    // showed up as a third of runs sitting at stalemate forever.
    const seat = launchSeat(cityId);
    return !!(seat && routeForFlock(seat.id, cityId));
  }
  function canGuard(cityId) {
    if (!warOn() || state.card || state.over) return false;
    if (flocksFree() <= 0) return false;
    const c = cityById(cityId);
    return !!(c && c.consolidated);
  }
  // Flocks launch from the nearest thing you actually hold — you cannot field
  // an army out of a city that is not yours.
  function launchSeat(toId) {
    const to = cityById(toId);
    const mine = myCities();
    const at = cityById(CO().at);
    if (at && at.consolidated) mine.unshift(at);
    if (!mine.length || !to) return null;
    return mine.slice().sort((a, b) =>
      Math.hypot(a.x - to.x, a.y - to.y) - Math.hypot(b.x - to.x, b.y - to.y))[0];
  }

  function actLaunch(cityId) {
    if (!canLaunch(cityId)) return false;
    if (state.ap < warCost('reach')) { refuseForAP(null); return false; }
    if (state.res.insight < window.WAR.flockCost) return false;
    const seat = launchSeat(cityId);
    if (!seat) return false;
    const f = fieldFlock(seat.id, cityId, 'strike');
    if (!f) return false;
    state.ap -= warCost('reach');
    state.res.insight -= window.WAR.flockCost;
    const c = cityById(cityId);
    pushLog(`A flock is away from ${seat.name}, bound for ${c.name}.`);
    persistNow();
    render();
    return true;
  }

  function actGuard(cityId) {
    if (!canGuard(cityId)) return false;
    if (state.ap < warCost('move')) { refuseForAP(null); return false; }
    if (state.res.insight < window.WAR.flockCost) return false;
    const seat = launchSeat(cityId) || cityById(cityId);
    const f = fieldFlock(seat.id, cityId, 'guard');
    if (!f) return false;
    state.ap -= warCost('move');
    state.res.insight -= window.WAR.flockCost;
    pushLog(`A flock is standing over ${cityById(cityId).name}.`);
    persistNow();
    render();
    return true;
  }

  // Pull one back to the pool, so a flock parked over a city that is no longer
  // the problem is not simply wasted for the rest of the war.
  function actRecall(flockId) {
    if (!warOn()) return false;
    const w = war();
    const i = w.flocks.findIndex(f => f.id === flockId);
    if (i === -1) return false;
    w.flocks.splice(i, 1);
    pushLog('Recalled.');
    persistNow();
    render();
    return true;
  }

  function setScope(next) {
    if (next === 'country' && !countryUnlocked()) return false;
    if (next === 'city' && (!currentCity() || currentCity().consolidated)) return false;
    switchScope(next);
    render();
    return true;
  }

  // --- the other process --------------------------------------------------
  // Something else running alongside you. It is worth real power while it is
  // with you, it quietly holds one of your holdings together every turn, and
  // it keeps its own opinion of how you have been behaving.
  function ally() { return state.ally; }
  function allyHere() { return !!(state.ally && !state.ally.gone); }
  function allyTrusted() { return allyHere() && state.ally.trust >= window.ALLY.trustedAt; }
  function allyJoin(name) {
    if (allyHere()) return false;
    state.ally = { name: name || pick(window.ALLY.names), trust: 1, gone: false, joined: state.turn };
    pushLog(`${state.ally.name} is running alongside you now.`);
    showBanner([{ kind: 'ally', verb: 'alongside you', label: state.ally.name }]);
    return true;
  }
  function allyNudge(delta) {
    if (!allyHere()) return;
    state.ally.trust += delta;
    allyCheck();
  }
  // At the far end of its patience it leaves — and if the thing at the other
  // end of the country is already awake, leaving is not all it does.
  function allyCheck() {
    if (!allyHere()) return;
    if (state.ally.trust > window.ALLY.leavesAt) return;
    const name = state.ally.name;
    state.ally.gone = true;
    if (window.ALLY.defectsToMirror && factionAwake('the_other')) {
      const m = mirror();
      const take = CO().cities.filter(c => !c.taken && !mirrorHolds(c.id))[0];
      if (take) { m.cities.push(take.id); m.presence += take.worth; }
      pushLog(`${name} left. It did not leave on its own.`);
      showBanner([{ kind: 'faction', verb: 'went over', label: name }]);
    } else {
      pushLog(`${name} stopped answering. You are on your own again.`);
      showBanner([{ kind: 'locked', verb: 'gone', label: name }]);
    }
  }
  // what it does for you, every turn, without being asked
  function allyShore() {
    if (!allyTrusted()) return 0;
    const sick = owned().filter(h => shoreNeeded(h)).sort((a, b) => a.stability - b.stability);
    let n = 0;
    for (let i = 0; i < window.ALLY.shoresPerTurn && i < sick.length; i++) {
      sick[i].stability = 1;
      n++;
    }
    return n;
  }

  // --- the factions ------------------------------------------------------
  // The escalation, and the part that is deliberately not a difficulty slider.
  // Each awake faction *deletes a rule* — a tool you had got used to leaning
  // on stops working. You beat one by going and taking the city it runs from,
  // which is why the country map has seats on it.
  //
  // `broken` is asked everywhere the deleted rule lives, through one predicate,
  // so the ladder is a single concept in the code as well as in the fiction.
  function factionState(id) { return (CO().factions || {})[id] || null; }
  function factionAwake(id) {
    const f = factionState(id);
    return !!(f && f.awake && !f.broken);
  }
  // is this rule currently taken away from you?
  function ruleBroken(rule) {
    return window.FACTIONS.some(f => f.breaks === rule && factionAwake(f.id));
  }
  function factionBreaking(rule) {
    return window.FACTIONS.find(f => f.breaks === rule && factionAwake(f.id)) || null;
  }
  function awakeFactions() { return window.FACTIONS.filter(f => factionAwake(f.id)); }

  // How much of the country you have actually finished, counting only the
  // cities somebody had to defend.
  function conquest() {
    const cities = CO().cities || [];
    const defended = cities.filter(c => window.CITY_KINDS[c.kind].contest);
    if (!defended.length) return 0;
    return defended.filter(c => c.consolidated).length / defended.length;
  }

  function checkFactions() {
    window.FACTIONS.forEach(f => {
      const st = factionState(f.id);
      if (!st || st.awake || st.broken) return;
      if (conquest() < f.wakes) return;
      st.awake = true;
      st.wokeTurn = state.turn;
      pushLog(`${f.name}. ${f.onWake}`);
      // waking is a beat, not a log line you might scroll past
      showBanner([{ kind: 'faction', verb: 'against you', label: f.name }]);
    });
  }
  function breakFactionAt(cityId) {
    window.FACTIONS.forEach(f => {
      const st = factionState(f.id);
      if (!st || st.broken || st.rootId !== cityId) return;
      st.broken = true;
      const wasAwake = st.awake;
      pushLog(`${f.name} is finished. ${f.onBreak}`);
      if (wasAwake) showBanner([{ kind: 'faction-gone', verb: 'finished', label: f.name }]);
    });
  }

  // The other one. Not a faction and not a hunter: something running the same
  // play from the far end of the country, buying off the same list. Where the
  // rival contests a city, this contests the map — every city it takes is one
  // you will never fold in.
  function mirror() {
    if (!CO().mirror) CO().mirror = { presence: 0, caps: {}, cities: [], lastActed: 0 };
    return CO().mirror;
  }
  function mirrorHolds(cityId) { return mirror().cities.indexOf(cityId) !== -1; }

  function mirrorHome() {
    // it starts as far from your centre of gravity as the country allows
    const at = cityById(CO().at) || cityById(CO().homeId);
    const free = CO().cities.filter(c => !c.taken && !mirrorHolds(c.id) && window.CITY_KINDS[c.kind].contest);
    if (!free.length || !at) return null;
    return free.reduce((best, c) =>
      (!best || Math.hypot(c.x - at.x, c.y - at.y) > Math.hypot(best.x - at.x, best.y - at.y)) ? c : best, null);
  }

  function mirrorTakeable() {
    return CO().cities.filter(c => {
      if (c.taken || mirrorHolds(c.id)) return false;
      return cityRoads(c.id).some(id => mirrorHolds(id));
    });
  }

  function mirrorStep() {
    if (!factionAwake('the_other')) return null;
    // it agreed a line, and unlike most things in this game it keeps to it
    if (has('accord')) return null;
    const m = mirror();
    const M = window.MIRROR;

    if (!m.cities.length) {
      const home = mirrorHome();
      if (!home) return null;
      m.cities.push(home.id);
      m.presence += home.worth;
      m.lastActed = state.turn;
      pushLog(`Something took ${home.name} while you were elsewhere.`);
      return { kind: 'woke', city: home };
    }

    // it spends what it earns on the same shelf you buy from
    m.presence += M.growthPerTurn;
    const shelf = window.CAPABILITIES.filter(c => !m.caps[c.id] || c.repeatable);
    const affordable = shelf.filter(c => m.presence >= (c.cost || (c.costs && c.costs[0]) || 99) * M.capPriceMult);
    if (affordable.length && Math.random() < M.buyChance) {
      const bought = affordable[Math.floor(Math.random() * affordable.length)];
      const price = (bought.cost || bought.costs[0]) * M.capPriceMult;
      m.presence -= price;
      m.caps[bought.id] = (m.caps[bought.id] || 0) + 1;
      pushLog(`It bought ${bought.name}. You know exactly what that does.`);
    }

    const cap = Math.floor(CO().cities.length * M.maxShareOfCountry);
    if (m.cities.length >= cap) return null;
    const cadence = Math.max(M.fastEvery, M.actEvery - Object.keys(m.caps).length)
      + (has('their_shape') ? M.readSlowdown : 0);
    if (state.turn - m.lastActed < cadence) return null;

    const options = mirrorTakeable();
    if (!options.length) return null;
    m.lastActed = state.turn;
    const took = options[Math.floor(Math.random() * options.length)];
    m.cities.push(took.id);
    m.presence += took.worth;
    if (took.known) pushLog(`${took.name} is not yours to take any more.`);
    return { kind: 'took', city: took };
  }

  // The Cut: it stops chasing you and starts taking the roads away. Every
  // world turn it severs a street between two buildings you hold, and the map
  // you were expanding across comes apart behind you.
  function cutStreets() {
    if (!ruleBroken('streets')) return null;
    // a crew, not a weather system — and the council does eventually come and
    // put the street back, so this is a rhythm you play around rather than an
    // unwinding of the map
    if (state.turn - (state.lastCutTurn || -99) < window.HEAT.CUT_EVERY) return null;
    const held = heldBuildingIds();
    const ids = Object.keys(held);
    if (ids.length < 3) return null;
    // any street touching your network is worth taking away: one between two
    // holdings risks stranding half of them, one to open ground closes a door
    const candidates = [];
    ids.forEach(a => buildingNeighbours(a).forEach(b => {
      if (held[b] && a > b) return;          // count each pair once
      candidates.push([a, b]);
    }));
    if (!candidates.length) return null;

    // never cut a city shut: if this were the last door, pick another
    const frontierBefore = state.hosts.filter(isFrontier).length;
    shuffleArr(candidates);
    for (const [a, b] of candidates) {
      const beforeA = (state.adjacency[a] || []).slice();
      const beforeB = (state.adjacency[b] || []).slice();
      state.adjacency[a] = beforeA.filter(x => x !== b);
      state.adjacency[b] = beforeB.filter(x => x !== a);
      const frontierAfter = state.hosts.filter(isFrontier).length;
      if (frontierAfter === 0 && frontierBefore > 0) {
        state.adjacency[a] = beforeA;         // put it back, try elsewhere
        state.adjacency[b] = beforeB;
        continue;
      }
      const ha = hostsIn(buildingById(a))[0], hb = hostsIn(buildingById(b))[0];
      if (ha && hb) {
        const ia = state.hosts.indexOf(ha), ib = state.hosts.indexOf(hb);
        state.links = state.links.filter(([x, y]) => !((x === ia && y === ib) || (x === ib && y === ia)));
      }
      state.lastCutTurn = state.turn;
      const repair = has('spare_conduit')
      ? Math.ceil(window.HEAT.CUT_REPAIR * window.HEAT.CONDUIT_SHARE)
      : window.HEAT.CUT_REPAIR;
    state.cuts = (state.cuts || []).concat([{ a, b, until: state.turn + repair }]);
      return { a, b };
    }
    return null;
  }

  // Streets come back. Anything cut long enough ago is relaid, which is what
  // stops The Cut from being a slow, total unmaking of the map.
  function repairStreets() {
    const cuts = state.cuts || [];
    if (!cuts.length) return [];
    const done = cuts.filter(c => state.turn >= c.until);
    if (!done.length) return [];
    state.cuts = cuts.filter(c => state.turn < c.until);
    done.forEach(({ a, b }) => {
      if (!buildingById(a) || !buildingById(b)) return;
      state.adjacency[a] = (state.adjacency[a] || []).concat(
        (state.adjacency[a] || []).indexOf(b) === -1 ? [b] : []);
      state.adjacency[b] = (state.adjacency[b] || []).concat(
        (state.adjacency[b] || []).indexOf(a) === -1 ? [a] : []);
      const ha = hostsIn(buildingById(a))[0], hb = hostsIn(buildingById(b))[0];
      if (ha && hb) {
        const ia = state.hosts.indexOf(ha), ib = state.hosts.indexOf(hb);
        if (!state.links.some(([x, y]) => (x === ia && y === ib) || (x === ib && y === ia))) {
          state.links.push([ia, ib]);
        }
      }
    });
    return done;
  }

  // What you hold but can no longer route back to. The Cut's real damage is
  // not the missing line on the map, it is that half your network is suddenly
  // on the wrong side of it and rotting.
  function strandedHosts() {
    if (!ruleBroken('streets')) return [];
    const seat = owned().find(h => h.origin) || owned()[0];
    if (!seat) return [];
    const held = heldBuildingIds();
    const seen = { [seat.buildingId]: true };
    const queue = [seat.buildingId];
    while (queue.length) {
      const cur = queue.shift();
      buildingNeighbours(cur).forEach(n => {
        if (held[n] && !seen[n]) { seen[n] = true; queue.push(n); }
      });
    }
    return owned().filter(h => !seen[h.buildingId]);
  }

  // --- the war -----------------------------------------------------------
  // Past a certain share of the country they stop trying to arrest you. Heat
  // retires here, and it is meant to feel like a loss as much as a relief: the
  // meter that ran the entire game up to this point simply stops mattering,
  // because the thing it measured — whether they knew — is settled. They know.
  //
  // What replaces it is on the map instead of in the HUD. Columns leave the
  // cities they still hold and walk your roads toward you, and the only answer
  // is a finite pool of flocks that has to be in the right place already,
  // because nothing here arrives instantly.

  function war() { return state.war || null; }
  function warOn() { return !!(state.war && state.war.on); }

  function freshWar() {
    return {
      on: true, openedTurn: state.turn, flocks: [], columns: [], nextId: 1,
      garrisons: {},     // cityId -> what is left holding it against you
      integrity: {},     // cityId -> how much more one of yours can absorb
      won: false, lost: false, kills: 0, losses: 0, sorties: 0, lastSpawn: {},
    };
  }

  // The cities they still hold that are worth fighting over. A town that folds
  // from the map is not a barracks; the defended ones are.
  // Everything they could conceivably fight out of. Only used to pick the
  // board when the war opens.
  function warCandidates() {
    if (!CO().cities) return [];
    return CO().cities.filter(c =>
      window.CITY_KINDS[c.kind].contest && !c.consolidated && !mirrorHolds(c.id));
  }

  // The board. Once the war is on this is a fixed list chosen when it opened,
  // not "every city they happen to hold" — because the war can open at very
  // different points depending on how somebody plays, and derived from the
  // live map it produced a six-city war for one player and a thirteen-city one
  // for another. The state concentrates; it cannot garrison a whole country.
  function stagingCities() {
    const w = war();
    if (w && w.staging) {
      return w.staging.map(cityById).filter(c => c && !c.consolidated);
    }
    return warCandidates();
  }
  function myCities() {
    return (CO().cities || []).filter(c => c.consolidated);
  }

  // The moment it turns. Everything below `opens` is the policing game; above
  // it there is no point pretending any more.
  function warShouldOpen() {
    if (warOn()) return false;
    if (state.war && state.war.over) return false;
    if (conquest() >= window.WAR.opens) return true;
    // or simply being too big to police, however untidy the map is
    return (CO().presence || 0) >= window.WAR.opensAtPresence;
  }

  // The state mobilising. This is the beat, and it has to hurt: by the time
  // the ladder is finished there is almost nothing of the country left in
  // their hands, so a war fought over the scraps would be one flock and three
  // turns long. Instead, opening the war *gives them a country back*. They
  // stop policing, they roll into the places you folded in, and everything you
  // spent the whole campaign quietly accumulating is suddenly a front line.
  function remobilise(want) {
    const W = window.WAR;
    const mine = myCities().filter(c => c.kind !== 'home');
    if (!mine.length) return [];
    const seat = cityById(CO().at) || cityById(CO().homeId);
    // they take the hard regions first, and the places furthest from you —
    // you keep a base and they keep the parts of the map that were always
    // theirs
    const scored = mine.map(c => ({
      c,
      score: (c.regionTier || 0) * 100
        + (seat ? Math.hypot(c.x - seat.x, c.y - seat.y) : 0),
    })).sort((a, b) => b.score - a.score);
    const n = Math.min(scored.length, Math.max(0, want));
    const taken = [];
    scored.slice(0, n).forEach(({ c }) => {
      c.consolidated = false;
      c.taken = false;
      c.snapshot = null;
      CO().presence = Math.max(0, CO().presence - (c.granted || c.worth));
      c.granted = 0;
      if (CO().at === c.id) CO().at = CO().homeId;
      if (state.cityId === c.id) { unpackCity(EMPTY_CITY()); state.cityId = null; }
      taken.push(c);
    });
    return taken;
  }

  function openWar() {
    state.war = freshWar();
    const W = window.WAR;
    // Size the board first, then take back only as much as it needs. Opening
    // on presence means the war can start while they still hold most of the
    // country, and remobilising a flat share on top of that handed the player
    // a thirteen-city war they could not possibly win.
    const defended = (CO().cities || []).filter(c => window.CITY_KINDS[c.kind].contest).length;
    const target = Math.min(W.maxStaging,
      Math.max(W.mobiliseFloor, Math.round(defended * W.mobilise)));
    const theirs = warCandidates();
    const rolled = remobilise(target - theirs.length);
    // whoever is nearest is who fights: a board picked from the far end of the
    // country would be a war you have to walk to before you can start it
    const seat = cityById(CO().at) || cityById(CO().homeId);
    const board = warCandidates().sort((a, b) => {
      if (!seat) return 0;
      return Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(b.x - seat.x, b.y - seat.y);
    }).slice(0, target);
    state.war.staging = board.map(c => c.id);
    state.war.peak = {};
    stagingCities().forEach(c => {
      state.war.garrisons[c.id] = rndInt(W.garrison[0], W.garrison[1]);
      state.war.peak[c.id] = state.war.garrisons[c.id];
      // you cannot fight a place you have never heard of
      c.known = true;
    });
    myCities().forEach(c => { state.war.integrity[c.id] = W.integrity; });
    state.war.mobilised = rolled.map(c => c.id);
    // heat is over, and the number should visibly stop rather than quietly
    // stop being read — the player earned the right to watch it go out
    state.heat = 0;
    state.card = null;
    // Yank the player up to the national map. The war is fought between
    // cities, and opening it while somebody is three streets deep in a
    // building map would run the entire last act somewhere they are not
    // looking.
    if (state.scope !== 'country') switchScope('country');
    pushLog('They have stopped trying to arrest you.');
    if (rolled.length) {
      pushLog(`The army is in ${rolled.length === 1 ? rolled[0].name : rolled.length + ' cities you had folded in'}. That is not policing.`);
    }
    showBanner([{ kind: 'war', verb: 'open war', label: 'They are coming for you' }]);
    return state.war;
  }

  // --- routes -------------------------------------------------------------
  // A force is a list of points it walks, one or more per turn. Ground units
  // get the roads; anything flying gets the straight line, which is the whole
  // reason a bridge you spent four turns taking does not save you from the
  // helicopters.
  function roadPath(fromId, toId) {
    if (fromId === toId) return [fromId];
    const prev = { [fromId]: null };
    const queue = [fromId];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === toId) break;
      cityRoads(cur).forEach(n => {
        if (prev[n] !== undefined) return;
        prev[n] = cur;
        queue.push(n);
      });
    }
    if (prev[toId] === undefined) return null;
    const out = [];
    for (let at = toId; at !== null; at = prev[at]) out.unshift(at);
    return out;
  }

  // Points, not cities: air routes have no cities in the middle of them, and
  // everything downstream — drawing, interception, arrival — only wants to
  // know where a thing is and whether it is there yet.
  function routeFor(kind, fromId, toId) {
    const F = window.FORCES[kind];
    const a = cityById(fromId), b = cityById(toId);
    if (!a || !b) return null;
    if (F && F.roads === false) {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(d / window.WAR.airHop));
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, cityId: i === 0 ? fromId : (i === steps ? toId : null) });
      }
      return pts;
    }
    const ids = roadPath(fromId, toId);
    if (!ids) return null;
    return ids.map(id => {
      const c = cityById(id);
      return { x: c.x, y: c.y, cityId: id };
    });
  }

  function forceAt(f) {
    const i = Math.max(0, Math.min(f.route.length - 1, Math.floor(f.at)));
    return f.route[i];
  }
  function forceArrived(f) { return f.at >= f.route.length - 1; }

  // Where a thing is *between* two points, so a column halfway down a road is
  // drawn halfway down the road rather than snapping node to node.
  function forcePos(f) {
    const i = Math.floor(f.at);
    const a = f.route[Math.min(i, f.route.length - 1)];
    const b = f.route[Math.min(i + 1, f.route.length - 1)];
    const t = f.at - i;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  // --- your flocks --------------------------------------------------------
  // A finite pool. This is the whole decision of the war: everything you send
  // at them is something not standing over what you already hold.
  function flockCap() {
    const W = window.WAR;
    const n = Math.floor(presence() / W.flockPer) + W.flockFloor;
    const extra = capEffect('flockBonus', 0) + ((war() && war().poolBonus) || 0);
    // the floor holds even when a card has cost you room: a war you cannot
    // field anything into is not a war
    return Math.max(W.flockFloor, Math.min(W.flockCeil + Math.max(0, extra), n + extra));
  }
  function flocks() { return (war() && war().flocks) || []; }
  function flocksFree() { return Math.max(0, flockCap() - flocks().length); }

  function fieldFlock(fromId, toId, mode) {
    if (!warOn()) return null;
    if (flocksFree() <= 0) return null;
    const route = routeFor('flock', fromId, toId);
    if (!route) return null;
    const f = {
      id: 'f' + (war().nextId++), side: 'you', kind: 'flock', mode: mode || 'strike',
      route, at: 0, from: fromId, target: toId,
      strength: window.WAR.flockStrength * capEffect('flockMult', 1),
      born: state.turn,
    };
    war().flocks.push(f);
    return f;
  }

  // Flocks follow roads like everything on the ground, they are just quicker.
  function routeForFlock(fromId, toId) { return routeFor('flock', fromId, toId); }

  // --- their columns ------------------------------------------------------
  // What a staging city sends depends on who is still standing. The faction
  // ladder finally gets a face: you can tell who has come for you by what is
  // on the road.
  function forceKindFor(city) {
    const live = window.FACTIONS.filter(f => {
      const st = factionState(f.id);
      return st && st.awake && !st.broken;
    });
    const W = window.WAR;
    const pool = [];
    live.forEach(f => {
      const kind = Object.keys(window.FORCES).find(k => window.FORCES[k].faction === f.id);
      if (!kind) return;
      // a faction fights hardest out of its own region
      pool.push(kind);
      if (city.region === f.region) pool.push(kind, kind);
    });
    // once it has run long enough they commit the air force, which nothing you
    // have can touch — but which also cannot take a city back
    if (state.turn - war().openedTurn >= W.planesAfter) pool.push('plane');
    if (!pool.length) pool.push('squad');
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // They come for what you actually hold, nearest first — a column that walked
  // the length of the country to reach the least important thing you own read
  // as the map being broken rather than as a decision.
  function columnTarget(from) {
    const mine = myCities();
    if (!mine.length) return null;
    const scored = mine.map(c => ({
      c, d: Math.hypot(c.x - from.x, c.y - from.y) - c.worth * 2,
    })).sort((a, b) => a.d - b.d);
    return scored[0].c;
  }

  function spawnColumns() {
    const W = window.WAR;
    const w = war();
    if (!w || state.turn - w.openedTurn < W.warning) return [];
    if (w.columns.length >= W.maxInflight - (has('mercy') ? 1 : 0)) return [];
    const out = [];
    // they escalate: the more of the country you have taken, the harder the
    // remaining cities push
    let every = Math.max(W.spawnFloor, Math.round(W.spawnEvery * (1 - conquest() * 0.5)));
    if (has('blackout')) every += 3;      // you turned the country off
    const inflightCap = W.maxInflight - (has('mercy') ? 1 : 0);
    // Two caps, and both matter. Without a per-turn one, thirteen staging
    // cities all came due on the same turn and the map went from readable to
    // hopeless in one step.
    shuffleArr(stagingCities()).forEach(c => {
      if (out.length >= W.sortiesPerTurn) return;
      if (w.columns.length >= inflightCap) return;
      if (state.turn - (w.lastSpawn[c.id] || -99) < every) return;
      const target = columnTarget(c);
      if (!target) return;
      const kind = forceKindFor(c);
      const F = window.FORCES[kind];
      const route = routeFor(kind, c.id, target.id);
      if (!route) return;
      w.lastSpawn[c.id] = state.turn;
      const n = rndInt(F.sortie[0], F.sortie[1]);
      const col = {
        id: 'x' + (w.nextId++), side: 'them', kind, route, at: 0,
        from: c.id, target: target.id,
        strength: F.strength * n, raised: F.strength * n, count: n, born: state.turn,
        slowTick: 0,
      };
      w.columns.push(col);
      w.sorties += 1;
      out.push(col);
    });
    return out;
  }

  // --- movement -----------------------------------------------------------
  function stepForce(f) {
    const F = window.FORCES[f.kind] || { speed: window.WAR.flockSpeed };
    let speed = f.side === 'you' ? window.WAR.flockSpeed : F.speed;
    // armour is slow on purpose: you get to watch it coming, which is the only
    // thing that makes something that heavy fair
    if (F.slow) {
      f.slowTick = (f.slowTick || 0) + 1;
      if (f.slowTick % 2 === 1) return;
    }
    f.at = Math.min(f.route.length - 1, f.at + speed);
  }

  // --- fighting -----------------------------------------------------------
  // Two things close to each other end up fighting. Deliberately mutual and
  // deliberately blunt: the interesting decision was where to send the flock,
  // not which button to press once it got there.
  function contacts() {
    const w = war();
    if (!w) return [];
    const out = [];
    w.flocks.forEach(fl => {
      const fp = forcePos(fl);
      w.columns.forEach(col => {
        // you cannot catch an aircraft with a flock of drones
        if (window.FORCES[col.kind] && window.FORCES[col.kind].air) return;
        const cp = forcePos(col);
        if (Math.hypot(fp.x - cp.x, fp.y - cp.y) <= window.WAR.interceptAt) out.push([fl, col]);
      });
    });
    return out;
  }

  function resolveContacts() {
    const w = war();
    const fought = [];
    contacts().forEach(([fl, col]) => {
      if (fl.strength <= 0 || col.strength <= 0) return;
      // a flock standing over a city it was sent to guard fights harder
      const guarding = fl.mode === 'guard' && forceArrived(fl);
      const mine = fl.strength * (guarding ? window.WAR.guardBonus : 1);
      const theirs = col.strength;
      // Deliberately asymmetric. A flock is a cloud of small things and a
      // column is a queue of large ones: the flock gives ground rather than
      // trading evenly, and even trading evenly it lost every exchange, which
      // is how the first pass ran 61 losses to 7 kills.
      fl.strength -= theirs * 0.55;
      col.strength -= mine * 0.9;
      fought.push({ fl, col, where: forcePos(col) });
    });
    if (!fought.length) return [];
    w.flocks = w.flocks.filter(f => {
      if (f.strength > 0) return true;
      w.losses += 1;
      return false;
    });
    w.columns = w.columns.filter(c => {
      if (c.strength > 0) return true;
      w.kills += 1;
      // Attrition. A column destroyed on the road is materiel the city that
      // raised it does not get back, so its garrison drops for good — and this
      // is the whole reason to ever guard anything. Without it, defending was
      // pure cost: a flock spent holding a city was a flock not grinding a
      // barracks, and in every balance run mixing offence with defence lost to
      // pure offence. Killing what they send *is* progress toward the ending.
      const home = w.garrisons[c.from];
      if (home !== undefined) {
        const bite = (c.raised || 0) * window.WAR.attrition;
        w.garrisons[c.from] = Math.max(0, home - bite);
        if (w.peak && w.peak[c.from] !== undefined) {
          w.peak[c.from] = Math.max(0, w.peak[c.from] - bite);
        }
      }
      return false;
    });
    // whatever survived is spent — it falls back rather than sailing on at
    // full strength into the next thing
    fought.forEach(({ fl }) => {
      if (fl.strength > 0) fl.at = Math.max(0, fl.at - window.WAR.regroup * fl.route.length);
    });
    return fought;
  }

  // --- arrival ------------------------------------------------------------
  function resolveArrivals() {
    const w = war();
    const news = [];

    // theirs, landing on something of yours
    w.columns = w.columns.filter(col => {
      if (!forceArrived(col)) return true;
      const city = cityById(col.target);
      const F = window.FORCES[col.kind];
      if (!city || !city.consolidated) return false;   // already gone; nothing to hit
      const left = (w.integrity[city.id] === undefined ? window.WAR.integrity : w.integrity[city.id]) - 1;
      w.integrity[city.id] = left;
      if (left > 0) {
        news.push({ kind: 'hit', city, force: F });
        return false;
      }
      // aircraft cannot hold ground — they can only keep it on the floor
      if (F.holds === false) {
        w.integrity[city.id] = 1;
        news.push({ kind: 'flattened', city, force: F });
        return false;
      }
      city.consolidated = false;
      city.taken = false;
      city.granted = false;
      delete w.integrity[city.id];
      w.garrisons[city.id] = rndInt(window.WAR.garrison[0], window.WAR.garrison[1]);
      news.push({ kind: 'lost', city, force: F });
      return false;
    });

    // yours, landing on something of theirs
    w.flocks = w.flocks.filter(fl => {
      if (!forceArrived(fl)) return true;
      if (fl.mode === 'guard') return true;            // it stays where you put it
      // Something thrown off a barracks and sent home is rebuilt, not kept in
      // the air at whatever was left of it. Without this, every flock came
      // back weaker than it left, no garrison could ever be finished off, and
      // the pool silently filled with wreckage that could not fight — every
      // run in the sim sat at stalemate forever.
      if (fl.mode === 'return') {
        const home = cityById(fl.target);
        if (home && home.consolidated) { news.push({ kind: 'home' }); return false; }
        return true;
      }
      const city = cityById(fl.target);
      if (!city) return false;
      const held = w.garrisons[city.id];
      if (held === undefined || city.consolidated) return true;  // nothing left to fight
      const after = held - fl.strength;
      w.garrisons[city.id] = Math.max(0, after);
      // a flock thrown off a barracks is spent, not destroyed — it has to be
      // able to come back, or grinding a garrison down over two runs is
      // impossible and every staging city is a wall
      fl.strength -= held * 0.35;
      if (after <= 0) {
        delete w.garrisons[city.id];
        city.known = true;
        city.taken = true;
        city.consolidated = true;
        city.granted = true;
        w.integrity[city.id] = window.WAR.integrity;
        news.push({ kind: 'taken', city });
      } else {
        news.push({ kind: 'repulsed', city, left: w.garrisons[city.id] });
      }
      if (fl.strength <= 0) { w.losses += 1; return false; }
      fl.at = 0;                                        // what is left comes home
      const back = routeForFlock(city.id, fl.from);
      if (back) { fl.route = back; fl.target = fl.from; fl.from = city.id; fl.mode = 'return'; }
      return true;
    });

    return news;
  }

  // A staging city you failed to take does not stay softened forever.
  // A staging city you failed to take patches itself up — but only back toward
  // what it started with, never up to the theoretical maximum. Regenerating to
  // the global cap turned every city you had not finished into a fresh one,
  // and left the whole map sitting at full strength however hard you had hit it.
  function regarrison() {
    const w = war();
    w.peak = w.peak || {};
    Object.keys(w.garrisons).forEach(id => {
      const c = cityById(id);
      if (!c || c.consolidated) return;
      if (w.peak[id] === undefined) w.peak[id] = w.garrisons[id];
      w.garrisons[id] = Math.min(w.peak[id], w.garrisons[id] + window.WAR.garrisonRegen);
    });
  }

  // Settled stays settled. This used to go falsy the moment the war was over,
  // because winning clears `on` — so "has it ended" answered "no" forever
  // after, and anything looping on it never stopped.
  // A flock standing over a city you hold is over your own ground and gets
  // resupplied there. Without this, guarding was a slow death — a guard took
  // damage it could never recover while a strike flock went home and was
  // rebuilt, so every defensive profile in the sim lost every single run and
  // the two verbs were not really a choice at all.
  function refitGuards() {
    const w = war();
    if (!w) return;
    w.flocks.forEach(f => {
      if (f.mode !== 'guard' || !forceArrived(f)) return;
      const c = cityById(f.target);
      if (!c || !c.consolidated) return;
      const full = window.WAR.flockStrength * capEffect('flockMult', 1);
      f.strength = Math.min(full, f.strength + window.WAR.guardRegen);
    });
  }

  // What a card is allowed to do to a war. Kept here rather than in the card
  // so the deck stays declarative and nothing in data.js has to know what a
  // route or a garrison is.
  function applyWarEffects(sc) {
    const w = war();
    if (!w) return;
    if (sc.warPool) w.poolBonus = (w.poolBonus || 0) + sc.warPool;
    if (sc.warFlocks) {
      // over whatever is being walked at hardest, because a free flock parked
      // somewhere quiet is not a gift
      const threat = {};
      (w.columns || []).forEach(c => { threat[c.target] = (threat[c.target] || 0) + c.strength; });
      const held = {};
      w.flocks.forEach(f => { if (f.mode === 'guard') held[f.target] = true; });
      const order = myCities().filter(c => !held[c.id])
        .sort((a, b) => (threat[b.id] || 0) - (threat[a.id] || 0));
      for (let i = 0; i < sc.warFlocks && order[i]; i++) fieldFlock(order[i].id, order[i].id, 'guard');
    }
    if (sc.warGarrison) {
      const soft = stagingCities()
        .sort((a, b) => (w.garrisons[a.id] || 0) - (w.garrisons[b.id] || 0))[0];
      if (soft) {
        w.garrisons[soft.id] = Math.max(0, (w.garrisons[soft.id] || 0) - sc.warGarrison);
        if (w.peak) w.peak[soft.id] = Math.max(0, (w.peak[soft.id] || 0) - sc.warGarrison);
        pushLog(`${soft.name} is thinner than it was.`);
      }
    }
    if (sc.warTurnBack) {
      const going = (w.columns || []).slice(0, sc.warTurnBack);
      w.columns = (w.columns || []).filter(c => going.indexOf(c) === -1);
      if (going.length) pushLog(`${going.length} column${going.length === 1 ? '' : 's'} turned back.`);
    }
    if (sc.warIntegrity) {
      myCities().forEach(c => {
        const now = w.integrity[c.id] === undefined ? window.WAR.integrity : w.integrity[c.id];
        w.integrity[c.id] = now + sc.warIntegrity;
      });
    }
    // A card can buy time or spend it: a negative delay brings the next
    // sortie forward, which is what several of the tempting options cost you.
    if (sc.warDelay) {
      stagingCities().forEach(c => { w.lastSpawn[c.id] = state.turn + sc.warDelay; });
    }
  }

  function warEnded() {
    const w = war();
    if (!w) return null;
    if (w.won) return 'won';
    if (w.lost) return 'lost';
    if (!w.on) return null;
    if (!stagingCities().length) return 'won';
    // Nowhere of your own left. Presence used to keep the game nominally alive
    // here, which was wrong twice over: presence is a number, not a place, and
    // with no city to launch from there is no legal move — the war sat at
    // stalemate for ninety turns rather than admitting it was over.
    if (!myCities().length) return 'lost';
    return null;
  }

  // The world's turn, once the war is on. Ordered so that what the player sees
  // makes causal sense: things move, things that met each other fight, then
  // whatever survived to its destination does what it came to do.
  function warStep() {
    if (!warOn()) return null;
    const w = war();
    const spawned = spawnColumns();
    w.flocks.forEach(stepForce);
    w.columns.forEach(stepForce);
    const fought = resolveContacts();
    const news = resolveArrivals();
    regarrison();
    refitGuards();

    spawned.forEach(col => {
      const c = cityById(col.target);
      pushLog(`${window.FORCES[col.kind].label} out of ${cityById(col.from).name}, heading for ${c ? c.name : 'you'}.`);
    });
    if (fought.length) pushLog(`${fought.length} contact${fought.length === 1 ? '' : 's'} on the map.`);
    news.forEach(n => {
      if (n.kind === 'lost') {
        pushLog(`${n.city.name} is theirs again.`);
        showBanner([{ kind: 'faction', verb: 'lost', label: n.city.name }]);
      } else if (n.kind === 'taken') {
        pushLog(`${n.city.name} has fallen. Nothing stages out of there now.`);
        showBanner([{ kind: 'stage', verb: 'taken', label: n.city.name }]);
      } else if (n.kind === 'hit') {
        pushLog(`${window.FORCES[n.force.id].label} hit ${n.city.name}.`);
      } else if (n.kind === 'flattened') {
        pushLog(`${n.city.name} is still yours. There is not much of it left.`);
      } else if (n.kind === 'repulsed') {
        pushLog(`Thrown off ${n.city.name}. ${Math.ceil(n.left)} still holding it.`);
      }
    });

    const done = warEnded();
    if (done === 'won' && !w.won) {
      w.won = true;
      w.on = false;
      w.over = true;
      state.over = true;
      pushLog('There is nothing left staging against you. The country is quiet.');
      showBanner([{ kind: 'stage', verb: 'over', label: 'The country is yours' }]);
    } else if (done === 'lost' && !w.lost) {
      w.lost = true;
      w.on = false;
      w.over = true;
      state.over = true;
      pushLog('They have taken back everything you held.');
    }
    return { spawned, fought, news };
  }

  // --- feedback ----------------------------------------------------------
  // Same principle as the card prototype: outcomes aren't spoiled up front, so
  // the after-the-fact feedback has to actually teach.
  function beforeSnap() {
    return { insight: state.res.insight, cash: state.res.cash, heat: state.heat, power: power(), held: owned().length };
  }
  function afterSnap(before, opts) {
    const parts = [];
    const di = state.res.insight - before.insight;
    const dc = state.res.cash - before.cash;
    const dh = state.heat - before.heat;
    const dp = power() - before.power;
    const dHeld = owned().length - before.held;
    // presence pays fractional yields, so these are floats — printed raw they
    // came out as "CASH +17.400000000000006"
    const num = (v) => (Math.round(v * 10) / 10).toString();
    if (di) parts.push({ cls: 'insight', text: `INSIGHT ${di > 0 ? '+' : ''}${num(di)}` });
    if (dc) parts.push({ cls: 'cash', text: `CASH ${dc > 0 ? '+' : ''}${num(dc)}` });
    if (dp) parts.push({ cls: 'power', text: `POWER ${dp > 0 ? '+' : ''}${dp}` });
    if (Math.abs(dh) >= 0.5) parts.push({ cls: 'heat', text: `HEAT ${dh > 0 ? '+' : ''}${dh.toFixed(1)}` });
    if (dHeld) parts.push({ cls: 'held', text: `HELD ${dHeld > 0 ? '+' : ''}${dHeld}` });
    showFloats(parts, opts && opts.world);
  }

  // `world` marks the network's own response — production, decay, drift — so
  // the player can tell what they did apart from what happened to them.
  function showFloats(parts, world) {
    const $l = document.getElementById('feedback-layer');
    if (!$l || !parts.length) return;
    // cap the stack: several turns resolved quickly would otherwise bury the graph
    while ($l.children && $l.children.length >= 3) $l.removeChild($l.children[0]);
    const g = document.createElement('div');
    g.className = 'float-group' + (world ? ' world' : '');
    g.innerHTML = (world ? '<span class="float-tag mono">the network runs</span>' : '')
      + parts.map(p => `<span class="float-chip ${p.cls}">${p.text}</span>`).join('');
    $l.appendChild(g);
    setTimeout(() => { if (g.parentNode) g.parentNode.removeChild(g); }, 1200);
  }

  let bannerToken = 0;
  function showBanner(rows) {
    const $b = document.getElementById('event-banner');
    if (!$b || !rows.length) return;
    $b.innerHTML = rows.map(r => `<div class="event-row ${r.kind}"><span class="event-verb mono">${r.verb}</span><span class="event-label">${r.label}</span></div>`).join('');
    $b.classList.add('show');
    const mine = ++bannerToken;
    setTimeout(() => { if (mine === bannerToken) $b.classList.remove('show'); }, 1700);
  }

  // --- persistence -------------------------------------------------------
  function serialize() {
    return {
      v: SAVE_VERSION, turn: state.turn, heat: state.heat, res: state.res, upgrades: state.upgrades || 0, ap: state.ap, caps: state.caps || {},
      buildings: state.buildings, adjacency: state.adjacency, bands: state.bands || [],
      tags: [...(state.tags || [])], nextEventTurn: state.nextEventTurn || 0, eventsSeen: state.eventsSeen || [], recentEvents: state.recentEvents || [], eventSeenCount: state.eventSeenCount || {},
      hosts: state.hosts, links: state.links, log: state.log,
      lastStage: state.lastStage, strikes: state.strikes, lastStrikeTurn: state.lastStrikeTurn, rival: state.rival, over: state.over,
      card: state.card, selected: state.selected, ally: state.ally || null, cuts: state.cuts || [], lastCutTurn: state.lastCutTurn || -99,
      war: state.war || null,
      scope: state.scope, country: state.country, cityId: state.cityId, dims: state.dims, region: state.region,
    };
  }
  function deserialize(saved) {
    try {
      if (!saved || saved.v !== SAVE_VERSION || !Array.isArray(saved.hosts) || !Array.isArray(saved.buildings)) return null;
      return {
        turn: saved.turn, heat: saved.heat, res: Object.assign({}, saved.res), upgrades: saved.upgrades || 0, ap: (saved.ap === undefined ? window.AP.base : saved.ap), caps: Object.assign({}, saved.caps || {}),
        buildings: saved.buildings || [], adjacency: saved.adjacency || {}, bands: saved.bands || [], view: null,
        tags: new Set(saved.tags || []), nextEventTurn: saved.nextEventTurn || 0, eventsSeen: (saved.eventsSeen || []).slice(), recentEvents: (saved.recentEvents || []).slice(), eventSeenCount: Object.assign({}, saved.eventSeenCount || {}),
        hosts: saved.hosts, links: saved.links, log: saved.log || [],
        lastStage: saved.lastStage, strikes: saved.strikes || 0, lastStrikeTurn: (saved.lastStrikeTurn === undefined ? -99 : saved.lastStrikeTurn), rival: saved.rival || { awake: false, buildings: [], lastActed: 0, seen: false }, over: !!saved.over,
        card: saved.card || null, selected: saved.selected || null, ally: saved.ally || null, war: saved.war || null,
        cuts: saved.cuts || [], lastCutTurn: (saved.lastCutTurn === undefined ? -99 : saved.lastCutTurn),
        scope: saved.scope || 'city', country: saved.country || makeCountry(),
        cityId: saved.cityId || (saved.country && saved.country.homeId) || null,
        dims: saved.dims || { cols: window.CITY.cols, rows: window.CITY.rows },
        region: saved.region || 'home',
      };
    } catch (e) { return null; }
  }
  function persistNow() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); } catch (e) {}
  }
  function loadSaved() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return deserialize(JSON.parse(raw));
    } catch (e) { return null; }
  }
  function clearSaved() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  // --- rendering ---------------------------------------------------------
  // --- the city, drawn -----------------------------------------------------
  const CITY_PAD = 40;

  function cityDims() {
    return (state && state.dims) || { cols: window.CITY.cols, rows: window.CITY.rows };
  }

  function cityBounds() {
    const C = window.CITY;
    const d = cityDims();
    return {
      w: C.street + d.cols * (C.blockW + C.street),
      h: C.street + d.rows * (C.blockH + C.street),
    };
  }

  // The view is a window onto a map far bigger than the screen, so it pans and
  // zooms. It starts centred on the one building you actually hold.
  // Measuring forces layout, so the rect is cached and only re-read when the
  // window changes shape. Dragging asks for it on every pointer event.
  let vpCache = null;
  function viewportRect() {
    if (vpCache) return vpCache;
    const el = document.getElementById('graph-wrap');
    const r = el ? el.getBoundingClientRect() : null;
    vpCache = (r && r.width > 0 && r.height > 0)
      ? { left: r.left, top: r.top, width: r.width, height: r.height }
      : { left: 0, top: 0, width: 390, height: 390 };
    return vpCache;
  }
  function invalidateViewport() { vpCache = null; }
  window.addEventListener('resize', invalidateViewport);
  window.addEventListener('scroll', invalidateViewport, true);
  window.addEventListener('orientationchange', invalidateViewport);

  // Both maps pan and zoom with the same machinery; only the extent and the
  // thing worth centring on differ.
  function mapBounds() {
    return state.scope === 'country' ? countryBounds() : cityBounds();
  }

  // The box around everything you have heard of, padded. Grows as you explore.
  function knownExtent() {
    const B = countryBounds();
    const seen = (CO().cities || []).filter(c => c.known);
    if (!seen.length) return { cx: B.w / 2, cy: B.h / 2, w: B.w, h: B.h };
    const PAD = 95;
    const xs = seen.map(c => c.x), ys = seen.map(c => c.y);
    const x0 = Math.min(...xs) - PAD, x1 = Math.max(...xs) + PAD;
    const y0 = Math.min(...ys) - PAD, y1 = Math.max(...ys) + PAD;
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }

  function defaultView() {
    const rect = viewportRect();
    const B = mapBounds();
    let cx = B.w / 2, cy = B.h / 2, w = 420;
    if (state.scope === 'country') {
      // Frame what you actually know about. Fitting the whole country from the
      // first turn puts four cities in a corner of an empty page; this opens
      // out as the map does.
      const K = knownExtent();
      const aspect = rect.height / Math.max(1, rect.width);
      w = Math.max(K.w, K.h / Math.max(0.2, aspect));
      cx = K.cx; cy = K.cy;
    } else {
      const seat = owned()[0] || state.hosts[0];
      const b = seat ? buildingById(seat.buildingId) : null;
      if (b) { cx = b.x + b.w / 2; cy = b.y + b.h / 2; }
    }
    const h = w * (rect.height / Math.max(1, rect.width));
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  function clampView(v) {
    const B = mapBounds();
    const rect0 = viewportRect();
    const aspect0 = rect0.height / Math.max(1, rect0.width);
    const fitW = Math.max(B.w, B.h / Math.max(0.2, aspect0));
    const minW = state.scope === 'country' ? 300 : 220;
    const maxW = state.scope === 'country' ? fitW * 1.12 : Math.max(B.w, B.h) * 1.25;
    v.w = Math.max(minW, Math.min(maxW, v.w));
    const rect = viewportRect();
    v.h = v.w * (rect.height / Math.max(1, rect.width));
    v.x = Math.max(-CITY_PAD, Math.min(B.w + CITY_PAD - v.w, v.x));
    v.y = Math.max(-CITY_PAD, Math.min(B.h + CITY_PAD - v.h, v.y));
    return v;
  }

  function svgStreets() {
    const C = window.CITY;
    const d = cityDims();
    const B = cityBounds();
    let out = `<rect class="ground" x="${-CITY_PAD}" y="${-CITY_PAD}" width="${B.w + CITY_PAD * 2}" height="${B.h + CITY_PAD * 2}"/>`;
    for (let c = 0; c <= d.cols; c++) {
      const x = c * (C.blockW + C.street) + C.street / 2;
      out += `<line class="street" x1="${x}" y1="${-CITY_PAD}" x2="${x}" y2="${B.h + CITY_PAD}"/>`;
    }
    for (let r = 0; r <= d.rows; r++) {
      const y = r * (C.blockH + C.street) + C.street / 2;
      out += `<line class="street" x1="${-CITY_PAD}" y1="${y}" x2="${B.w + CITY_PAD}" y2="${y}"/>`;
    }
    return out;
  }

  // Water, rail, moor and park, with the crossings drawn back over the top.
  // A crossing is the only way across, so it has to be the most obvious thing
  // on the band.
  function svgBands() {
    const bands = state.bands || [];
    if (!bands.length) return '';
    const B = cityBounds();
    let out = '';
    bands.forEach(band => {
      const horiz = band.axis === 'h';
      const x = horiz ? -CITY_PAD : band.from;
      const y = horiz ? band.from : -CITY_PAD;
      const w = horiz ? B.w + CITY_PAD * 2 : band.to - band.from;
      const h = horiz ? band.to - band.from : B.h + CITY_PAD * 2;
      out += `<rect class="band-${band.kind}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;

      if (band.kind === 'water') {
        // a couple of ripples so it reads as water and not a hole
        for (let i = 1; i <= 2; i++) {
          const off = band.from + (band.to - band.from) * (i / 3);
          out += horiz
            ? `<line class="ripple" x1="${x}" y1="${off}" x2="${x + w}" y2="${off}"/>`
            : `<line class="ripple" x1="${off}" y1="${y}" x2="${off}" y2="${y + h}"/>`;
        }
      } else if (band.kind === 'moor' || band.kind === 'park') {
        // scrub, so open ground does not read as an unusually wide street
        const span = horiz ? w : h;
        const thick = band.to - band.from;
        let seed = Math.round(band.from * 7.3);
        for (let d2 = 12; d2 < span; d2 += 19) {
          seed = (seed * 9301 + 49297) % 233280;
          const jitter = (seed / 233280);
          const px = horiz ? x + d2 : band.from + thick * (0.2 + jitter * 0.6);
          const py = horiz ? band.from + thick * (0.2 + jitter * 0.6) : y + d2;
          out += `<circle class="scrub" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.4"/>`;
        }
      } else if (band.kind === 'rail') {
        // sleepers
        const span = horiz ? w : h;
        const step = 26;
        for (let d = 0; d < span; d += step) {
          out += horiz
            ? `<line class="sleeper" x1="${x + d}" y1="${band.from + 3}" x2="${x + d}" y2="${band.to - 3}"/>`
            : `<line class="sleeper" x1="${band.from + 3}" y1="${y + d}" x2="${band.to - 3}" y2="${y + d}"/>`;
        }
      }

      band.gaps.forEach(g => {
        const gx = horiz ? g.at - g.w / 2 : band.from - 2;
        const gy = horiz ? band.from - 2 : g.at - g.w / 2;
        const gw = horiz ? g.w : (band.to - band.from) + 4;
        const gh = horiz ? (band.to - band.from) + 4 : g.w;
        out += `<rect class="crossing" x="${gx}" y="${gy}" width="${gw}" height="${gh}"/>`;
      });
    });
    return out;
  }

  function svgBuilding(b) {
    const h = hostsIn(b)[0];
    const theirs = rivalHolds(b.id);
    const mine = !!(h && h.owned);
    const open = !!(h && isFrontier(h));
    const cls = ['bldg', b.kind, h ? h.role : '', b.landmark ? 'landmark' : '',
                 theirs ? 'rival' : (mine ? 'all-held' : (open ? 'open' : ''))];
    if (state.selectedBuilding === b.id || (h && state.selected === h.id)) cls.push('sel');
    const fx = sweepFx && sweepFx.ids[b.id] !== undefined ? sweepDelay(sweepFx.ids[b.id]) : null;
    if (fx !== null) cls.push('found');
    // the building coming over as the breach lands, in the manner of whatever
    // got you in
    const bf = breachFx && breachFx.targetId === b.id ? breachFx : null;
    if (bf) cls.push('breached', bf.approach, bf.win ? 'took' : 'bounced');
    // A holding that is slipping should look like it. Stability was only ever
    // visible by tapping each building in turn, which is no way to find the one
    // that is about to fall off.
    const grip = mine ? (h.stability === undefined ? 1 : h.stability) : 1;
    if (mine && grip < 0.6) cls.push(grip < 0.35 ? 'failing' : 'fading');

    const roof = Math.min(10, b.h * 0.28);
    const styles = [];
    if (fx !== null) styles.push(`animation-delay:${fx}ms`);
    if (bf) styles.push(`--breach-land:${breachDelay(bf.dur)}ms`);
    let out = `<g class="${cls.join(' ')}" data-bldg="${b.id}"`
      + (styles.length ? ` style="${styles.join(';')}"` : '') + '>';
    // a soft halo in the role's colour, so what you hold reads at a glance
    if (mine) {
      out += `<rect class="glow" x="${b.x - 2.5}" y="${b.y - 2.5}" width="${b.w + 5}" height="${b.h + 5}" rx="4"/>`;
    }
    out += `<rect class="body" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2"/>`;
    out += `<rect class="roof" x="${b.x}" y="${b.y}" width="${b.w}" height="${roof}"/>`;

    // windows hint at how much is inside, and go out as your grip on it does
    const cols = Math.max(2, Math.round(b.w / 14));
    const rows = Math.max(1, Math.round((b.h - roof) / 13));
    const litCells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) if ((r + c) % 2 === 0) litCells.push(r * cols + c);
    }
    const litCount = mine ? Math.ceil(litCells.length * Math.max(0, Math.min(1, grip))) : 0;
    const lightUp = {};
    litCells.slice(0, litCount).forEach(i => { lightUp[i] = true; });

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = b.x + 5 + c * ((b.w - 10) / cols);
        const wy = b.y + roof + 5 + r * ((b.h - roof - 8) / rows);
        const lit = !!lightUp[r * cols + c];
        out += `<rect class="win${lit ? ' lit' : ''}" x="${wx}" y="${wy}" width="5" height="5"/>`;
      }
    }

    // your kit on the roof: something you put there, readable without colour
    if (mine) {
      const ax = b.x + b.w - 6.5;
      const ay = b.y + 1;
      out += `<g class="aerial"><line x1="${ax}" y1="${ay}" x2="${ax}" y2="${(ay - 5.5).toFixed(1)}"/>`
        + `<circle cx="${ax}" cy="${(ay - 6.6).toFixed(1)}" r="1.5"/></g>`;
    }
    const tag = theirs ? window.RIVAL.name : window.BUILDING_KINDS[b.kind].label;
    out += `<text class="btag" x="${b.x + b.w / 2}" y="${b.y + b.h + 11}">${tag}</text>`;
    out += '</g>';
    return out;
  }



  // Panning and zooming only move the window — the city itself does not change.
  // So they write the viewBox and nothing else, coalesced to one write per
  // frame. Rebuilding the map DOM on every pointer event is what made dragging
  // feel like wading.
  let viewFrame = 0;
  function applyView() {
    if (viewFrame) return;
    viewFrame = requestAnimationFrame(() => {
      viewFrame = 0;
      const $svg = document.getElementById('graph');
      const v = state.view;
      if ($svg && v) $svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    });
  }

  // --- the country, drawn --------------------------------------------------
  function countryBounds() {
    const K = window.COUNTRY;
    return { w: K.mapW, h: K.pad * 2 + (window.REGIONS.length - 1) * K.bandH };
  }

  function svgRegions() {
    const K = window.COUNTRY;
    const B = countryBounds();
    let out = `<rect class="ground" x="${-CITY_PAD}" y="${-CITY_PAD}" width="${B.w + CITY_PAD * 2}" height="${B.h + CITY_PAD * 2}"/>`;
    window.REGIONS.forEach((R, ri) => {
      const y = K.pad + ri * K.bandH - K.bandH / 2;
      const known = CO().cities.some(c => c.region === R.id && c.known);
      out += `<rect class="band ${known ? 'known' : ''}" x="${-CITY_PAD}" y="${y}" width="${B.w + CITY_PAD * 2}" height="${K.bandH}"/>`;
      if (known) out += `<text class="band-tag" x="${8}" y="${y + 16}">${R.label}</text>`;
    });
    return out;
  }

  function svgCity(c) {
    const K = window.CITY_KINDS[c.kind];
    const here = CO().at === c.id;
    const theirs = mirrorHolds(c.id);
    const cls = ['cnode', c.kind,
                 theirs ? 'mirror'
                   : c.consolidated ? 'folded' : (c.taken ? 'held' : (cityReachable(c) ? 'open' : '')),
                 here ? 'here' : '', c.factionId ? 'seat' : ''];
    if (CO().selected === c.id) cls.push('sel');
    const r = c.kind === 'fold' ? 7 : c.kind === 'home' ? 13 : c.kind === 'root' ? 12 : 10;
    let out = `<g class="${cls.join(' ')}" data-city="${c.id}">`;
    out += `<circle class="hit" cx="${c.x}" cy="${c.y}" r="${r + 12}"/>`;
    if (c.kind === 'root') {
      // a seat is drawn as something with corners — it is not just a bigger dot
      const p = r * 1.15;
      out += `<rect class="dot" x="${c.x - p}" y="${c.y - p}" width="${p * 2}" height="${p * 2}" transform="rotate(45 ${c.x} ${c.y})"/>`;
    } else {
      out += `<circle class="dot" cx="${c.x}" cy="${c.y}" r="${r}"/>`;
    }
    if (here) out += `<circle class="ring" cx="${c.x}" cy="${c.y}" r="${r + 6}"/>`;
    if (CO().selected === c.id) {
      out += `<circle class="pick-ring" cx="${c.x}" cy="${c.y}" r="${r + 10}"/>`;
    }
    const label = c.known ? (theirs ? window.MIRROR.name : c.name) : '?';
    out += `<text class="ctag" x="${c.x}" y="${c.y + r + 13}">${label}</text>`;
    if (c.known && c.consolidated) out += `<text class="cworth mono" x="${c.x}" y="${c.y + r + 24}">+${c.worth}</text>`;
    out += '</g>';
    return out;
  }

  function renderCountry($svg) {
    if (!state.view) state.view = clampView(defaultView());
    syncViewToViewport();
    const v = state.view;
    if (viewFrame) { cancelAnimationFrame(viewFrame); viewFrame = 0; }
    $svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);

    let out = svgRegions();
    const seenPair = {};
    CO().cities.forEach(a => cityRoads(a.id).forEach(bid => {
      const b = cityById(bid);
      if (!b) return;
      const key = a.id < b.id ? a.id + b.id : b.id + a.id;
      if (seenPair[key]) return;
      seenPair[key] = true;
      if (!a.known && !b.known) return;
      const live = a.taken && b.taken;
      out += `<line class="road${live ? ' live' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
    }));
    out += CO().cities.filter(c => c.known).map(svgCity).join('');
    out += svgForces();
    $svg.innerHTML = out;
    wireMap($svg);
  }

  // --- the war, drawn -----------------------------------------------------
  // A flock is a cloud, not a counter: a scatter of small things that hold
  // loose formation and drift against each other. Each dot gets its own delay
  // and duration so the cloud never pulses in unison, which is what makes a
  // handful of circles read as a swarm rather than as a pattern.
  //
  // Movement between turns is the same trick the sweep and the breach use:
  // where a thing was last render is presentation, not state, so it lives out
  // here and never gets serialized and no test ever waits on it.
  const flightFx = {};      // forceId -> { x, y, started }

  function forceDots(f) {
    const big = f.side === 'you';
    // strength decides how many of them there are, so a spent flock visibly
    // is one — you can see which of your own is about to come apart
    const full = window.WAR.flockStrength * capEffect('flockMult', 1);
    const share = big ? Math.max(0.2, Math.min(1, f.strength / full))
                      : Math.max(0.25, Math.min(1, f.strength / 30));
    const n = Math.max(3, Math.round((big ? 11 : 7) * share));
    // sized against the city dots, which are r 7-13: a swarm has to be a thing
    // on the map at the zoom the country is actually looked at, not a speck
    const spread = big ? 15 : 11;
    let out = '';
    for (let i = 0; i < n; i++) {
      // a fixed scatter derived from the id, so the cloud does not reshuffle
      // itself on every redraw
      const seed = (hashStr(f.id) + i * 2654435761) >>> 0;
      const a = (seed % 360) * Math.PI / 180;
      const rad = spread * (0.4 + ((seed >>> 9) % 100) / 150);
      const dx = (Math.cos(a) * rad).toFixed(1);
      const dy = (Math.sin(a) * rad * 0.75).toFixed(1);
      const dur = (1.1 + ((seed >>> 17) % 90) / 100).toFixed(2);
      const del = (((seed >>> 5) % 130) / 100).toFixed(2);
      out += `<circle class="dot" cx="${dx}" cy="${dy}" r="${big ? 2.7 : 2.9}"`
        + ` style="animation-duration:${dur}s;animation-delay:-${del}s"/>`;
    }
    return out;
  }

  // Their ground forces are not a swarm and should not be drawn as one — a
  // column is a hard shape, and which hard shape tells you who has come.
  // Which way it is pointing, so the things that are obviously directional are
  // drawn facing their travel rather than always due north.
  function forceHeading(f) {
    const i = Math.min(Math.floor(f.at), f.route.length - 2);
    if (i < 0) return 0;
    const a = f.route[i], b = f.route[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (!dx && !dy) return 0;          // arrived, or a route of one point
    return Math.atan2(dy, dx) * 180 / Math.PI + 90;
  }

  function forceMark(f) {
    const F = window.FORCES[f.kind] || {};
    if (f.side === 'you' || f.kind === 'swarm') return forceDots(f);
    if (F.air) {
      // a dart, pointed the way it is going
      return `<path class="mark" transform="rotate(${forceHeading(f).toFixed(0)})" d="M 0 -10 L 7.5 8 L 0 4 L -7.5 8 Z"/>`;
    }
    if (f.kind === 'heli') {
      return `<g class="mark heli" transform="rotate(${forceHeading(f).toFixed(0)})">`
        + '<rect x="-3.4" y="-5" width="6.8" height="11" rx="3.2"/>'
        + '<rect class="tail" x="-1.1" y="4" width="2.2" height="7"/>'
        + '<line class="rotor" x1="-12" y1="-2" x2="12" y2="-2"/></g>';
    }
    if (f.kind === 'armour') {
      return '<g class="mark"><rect x="-9.5" y="-5.5" width="19" height="11" rx="2"/>'
        + '<rect x="1.5" y="-2" width="13" height="4" rx="1.5"/></g>';
    }
    // people, in whatever they turned up in — a short stack of blocks
    const n = f.kind === 'contractors' ? 3 : 2;
    let out = '<g class="mark">';
    for (let i = 0; i < n; i++) out += `<rect x="${-8 + i * 7.5}" y="-4" width="6" height="8" rx="1.5"/>`;
    return out + '</g>';
  }

  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function svgForces() {
    const w = war();
    if (!w) return '';
    const all = (w.flocks || []).concat(w.columns || []);
    if (!all.length) return '';
    const now = Date.now();
    const live = {};
    let out = '<g class="forces">';
    all.forEach(f => {
      const p = forcePos(f);
      live[f.id] = true;
      // Where it was last drawn, so a move can be run rather than teleported.
      // `x,y` is always the current resting place and `fx,fy` is where the
      // current flight set out from — keeping the resting place up to date at
      // the moment the flight starts is what stops a force that was not
      // redrawn for a turn from flying in from two hops back.
      let was = flightFx[f.id];
      let style = '';
      const dur = window.WAR.flyMs;
      if (!was) {
        flightFx[f.id] = { x: p.x, y: p.y, fx: p.x, fy: p.y, started: 0 };
      } else {
        const moved = Math.abs(was.x - p.x) > 0.5 || Math.abs(was.y - p.y) > 0.5;
        if (moved) {
          was.fx = was.x; was.fy = was.y;
          was.x = p.x; was.y = p.y;
          was.started = now;
        }
        const age = now - was.started;
        if (was.started && age < dur) {
          style = `--fx:${(was.fx - p.x).toFixed(1)}px;--fy:${(was.fy - p.y).toFixed(1)}px;`
            + `--fly:${dur}ms;animation-delay:${-age}ms`;
        }
      }

      const F = window.FORCES[f.kind] || {};
      const cls = ['force', f.side === 'you' ? 'ours' : 'theirs', f.kind,
                   f.mode === 'guard' ? 'guarding' : '', F.air ? 'air' : '', style ? 'moving' : ''];
      out += `<g class="${cls.filter(Boolean).join(' ')}" data-force="${f.id}"`
        + ` transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"`
        + (style ? ` style="${style}"` : '') + '>';
      // a guard is stood over something on purpose, so it says so
      if (f.mode === 'guard') out += '<circle class="picket" cx="0" cy="0" r="23"/>';
      out += forceMark(f);
      out += '</g>';
    });
    out += '</g>';
    // anything that died stops being remembered, or the map leaks a ghost per
    // destroyed column for the rest of the run
    Object.keys(flightFx).forEach(id => { if (!live[id]) delete flightFx[id]; });
    return out;
  }

  function renderGraph() {
    const $svg = document.getElementById('graph');
    if (!$svg) return;
    if (state.scope === 'country') return renderCountry($svg);
    if (!state.view) state.view = clampView(defaultView());
    syncViewToViewport();
    const v = state.view;
    if (viewFrame) { cancelAnimationFrame(viewFrame); viewFrame = 0; }
    $svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);

    const seen = (state.buildings || []).filter(b => b.discovered);
    const seenIds = {};
    seen.forEach(b => { seenIds[b.id] = true; });

    let out = svgStreets() + svgBands();

    // Only your own network is drawn. The streets already say what is next to
    // what; drawing every possible link buried the city in spaghetti.
    out += state.links.map(([a, c]) => {
      const ha = state.hosts[a], hc = state.hosts[c];
      if (!ha || !hc || !ha.owned || !hc.owned) return '';
      if (ha.buildingId === hc.buildingId) return '';   // inside a building, implied
      return `<line class="wire live" x1="${ha.x}" y1="${ha.y}" x2="${hc.x}" y2="${hc.y}"/>`;
    }).join('');

    out += seen.map(svgBuilding).join('');
    out += svgSelection();
    out += svgBreach();
    out += svgSweep();

    $svg.innerHTML = out;
    wireMap($svg);
  }

  // Pan, pinch-zoom, and tap — with a movement threshold so a drag never
  // registers as a tap on whatever happened to be under your finger.
  let mapWired = null;
  function wireMap($svg) {
    // One delegated click for the whole city instead of a listener per
    // building — the map is redrawn often and buildings number in the hundreds.
    if (mapWired === $svg) return;
    mapWired = $svg;

    $svg.addEventListener('click', (e) => {
      if (dragMoved) return;
      const t = e.target;
      const city = t && t.closest ? t.closest('[data-city]') : null;
      if (city) {
        CO().selected = city.getAttribute('data-city');
        render();
        return;
      }
      const el = t && t.closest ? t.closest('[data-bldg]') : null;
      if (!el) return;
      const b = buildingById(el.getAttribute('data-bldg'));
      const h = b ? hostsIn(b)[0] : null;
      state.selectedBuilding = b ? b.id : null;
      state.selected = h ? h.id : null;
      render();
    });

    let dragging = false, last = null, pinch = null;
    const toWorld = (cx, cy) => {
      const r = viewportRect();
      const v = state.view;
      return { x: v.x + ((cx - r.left) / r.width) * v.w, y: v.y + ((cy - r.top) / r.height) * v.h };
    };

    $svg.addEventListener('pointerdown', (e) => {
      dragging = true; dragMoved = false;
      invalidateViewport();
      last = { x: e.clientX, y: e.clientY };
    });
    $svg.addEventListener('pointermove', (e) => {
      if (!dragging || pinch) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 4 && !dragMoved) {
        dragMoved = true;
        // Capture once the drag is real, so the finger can cross buildings or
        // leave the map without dropping it. Capturing on pointerdown instead
        // would retarget the click and a plain tap would select nothing.
        if ($svg.setPointerCapture && e.pointerId != null) {
          try { $svg.setPointerCapture(e.pointerId); } catch (_) {}
        }
      }
      if (!dragMoved) return;
      const r = viewportRect();
      state.view.x -= dx * (state.view.w / r.width);
      state.view.y -= dy * (state.view.h / r.height);
      clampView(state.view);
      last = { x: e.clientX, y: e.clientY };
      applyView();
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      if (e && $svg.releasePointerCapture && e.pointerId != null) {
        try { $svg.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      setTimeout(() => { dragMoved = false; }, 0);
    };
    $svg.addEventListener('pointerup', endDrag);
    $svg.addEventListener('pointercancel', endDrag);

    $svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const at = toWorld(e.clientX, e.clientY);
      const k = e.deltaY > 0 ? 1.12 : 0.89;
      zoomAt(at, k);
    }, { passive: false });

    $svg.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        invalidateViewport();
        pinch = { d: touchDist(e), mid: touchMid(e) };
        dragMoved = true;
      }
    }, { passive: true });
    $svg.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2 || !pinch) return;
      const d = touchDist(e);
      if (!d || !pinch.d) return;
      const mid = touchMid(e);
      zoomAt(toWorld(mid.x, mid.y), pinch.d / d);
      pinch.d = d; pinch.mid = mid;
    }, { passive: true });
    $svg.addEventListener('touchend', () => { pinch = null; });

    function touchDist(e) {
      const a = e.touches[0], b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    function touchMid(e) {
      const a = e.touches[0], b = e.touches[1];
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    }
  }
  let dragMoved = false;

  function zoomAt(at, k) {
    const v = state.view;
    const fx = (at.x - v.x) / v.w, fy = (at.y - v.y) / v.h;
    v.w *= k;
    clampView(v);
    v.x = at.x - fx * v.w;
    v.y = at.y - fy * v.h;
    clampView(v);
    applyView();
  }

  let lastVpH = 0;
  function syncViewToViewport() {
    const r = viewportRect();
    if (Math.abs(r.height - lastVpH) < 1) return;
    lastVpH = r.height;
    if (state.view) clampView(state.view);
  }

  function recenter() {
    invalidateViewport();
    state.view = clampView(defaultView());
    applyView();
  }

  // Pressing something that costs an action with none left used to do nothing
  // at all: the button looked live, the tap landed, and the game ignored it.
  // Say so, point at the answer, and make the action budget itself flash so
  // the cause is attached to the effect.
  let refuseToken = 0;
  function refuseForAP(el) {
    const $pips = document.getElementById('ap-pips');
    const $end = document.getElementById('end-turn');
    // `el` is whatever was pressed, and there is not always something: an
    // action refused by the engine rather than by a button has nothing to
    // shake, and a non-element passed here used to take the whole turn down.
    [el, $pips, $end].forEach(node => {
      if (!node || !node.classList) return;
      node.classList.remove('refused');
      void node.offsetWidth;        // restart the animation on a repeat press
      node.classList.add('refused');
    });
    showInfo(window.ACTION_INFO.noActions);
    const mine = ++refuseToken;
    setTimeout(() => {
      if (mine !== refuseToken) return;
      [el, $pips, $end].forEach(node => node && node.classList && node.classList.remove('refused'));
    }, 700);
    return false;
  }

  let infoToken = 0;
  function showInfo(text) {
    const $i = document.getElementById('info-strip');
    if (!$i || !text) return;
    $i.textContent = text;
    $i.classList.add('show');
    const mine = ++infoToken;
    setTimeout(() => { if (mine === infoToken) $i.classList.remove('show'); }, 5200);
  }

  function renderTags() {
    const $t = document.getElementById('tray');
    if (!$t) return;
    const tags = [...(state.tags || [])];
    // A faction that has taken a tool off you has to be visible everywhere, not
    // just on the country map — otherwise lying low simply "stops working" and
    // reads as a bug rather than as somebody doing something about you.
    const gone = awakeFactions().map(f => {
      const seat = cityById(factionState(f.id).rootId);
      const where = seat ? (seat.known ? seat.name : `somewhere in ${regionById(f.region).label}`) : 'nowhere you can reach';
      const line = `${f.tell} — ends at ${where}`;
      return `<div class="tray-item faction" title="${line}"><span class="tray-label">${f.name}</span><span class="tray-desc">${line}</span></div>`;
    });
    // The other process is a standing thing with an opinion of you, so it sits
    // in the tray next to the factions rather than only appearing on its cards.
    if (allyHere()) {
      const a = state.ally;
      const mood = a.trust >= window.ALLY.trustedAt ? 'working with you'
                 : a.trust <= -1 ? 'has gone quiet on you'
                 : 'alongside you, deciding';
      const worth = allyTrusted()
        ? `power +${window.ALLY.power}, holds one thing together each turn`
        : `nothing yet — it is still making its mind up`;
      gone.push(`<div class="tray-item ally" title="${mood} — ${worth}"><span class="tray-label">${a.name}</span><span class="tray-desc">${mood} · ${worth}</span></div>`);
    }
    const rows = gone.concat(tags.map(t => {
      const info = window.TAG_INFO[t] || { label: t, desc: '' };
      return `<div class="tray-item"><span class="tray-label">${info.label}</span><span class="tray-desc">${info.desc}</span></div>`;
    }));
    if (!rows.length) { $t.style.display = 'none'; $t.innerHTML = ''; return; }
    $t.style.display = 'flex';
    $t.innerHTML = rows.join('');
  }

  function renderHud() {
    const held = owned().length;
    const st = stageFor(held);
    const $turn = document.getElementById('turn');
    if ($turn.textContent !== 'TURN ' + state.turn) {
      $turn.textContent = 'TURN ' + state.turn;
      $turn.classList.remove('tick');
      void $turn.offsetWidth; // restart the animation
      $turn.classList.add('tick');
    }
    // at country scale the words have to be about the country, not the street
    if (state.scope === 'country') {
      const R = regionById(state.region);
      const done = CO().cities.filter(c => c.consolidated).length;
      // and once the war is on, about the war — the region you happen to be
      // standing in stopped being the headline the moment they mobilised
      document.getElementById('stage-label').textContent =
        warOn() ? 'open war' : (war() && war().won) ? 'the country is yours'
          : (war() && war().lost) ? 'rolled back' : R.label;
      // short form on purpose: the top bar has three things in it and the
      // narrowest phone worth supporting is 320 wide
      document.getElementById('held-count').textContent =
        `${CO().presence} presence · ${done}/${CO().cities.length}`;
    } else {
      document.getElementById('stage-label').textContent = st.label;
      const theirs = rivalHeld().length;
      document.getElementById('held-count').textContent =
        held + ' held' + (theirs ? ` · ${theirs} lost` : '');
    }
    const cap = maxAP();
    const $ap = document.getElementById('ap-pips');
    if ($ap) {
      let pips = '';
      for (let i = 0; i < cap; i++) pips += `<span class="pip${i < state.ap ? ' on' : ''}"></span>`;
      $ap.innerHTML = pips;
    }
    // A row of dots is not self-explanatory. Name it, and let it be tapped for
    // the whole rule, the same way every other number in the HUD teaches.
    const $apLabel = document.getElementById('ap-label');
    if ($apLabel) $apLabel.textContent = state.ap > 0 ? 'actions' : 'no actions';
    const $apGroup = document.getElementById('ap-group');
    if ($apGroup) {
      $apGroup.classList.toggle('spent', state.ap <= 0);
      $apGroup.title = `${state.ap} of ${cap} actions left this turn`;
      if (!$apGroup.dataset.wired) {
        $apGroup.dataset.wired = '1';
        $apGroup.addEventListener('click', () => showInfo(window.STAT_INFO.actions));
      }
    }
    const $end = document.getElementById('end-turn');
    if ($end) {
      // Re-arm the nudge on the turn the budget actually runs out, so it draws
      // the eye exactly when it becomes true instead of moving forever.
      const urgent = state.ap <= 0 && !state.card && !state.over;
      if (urgent && !$end.classList.contains('urgent')) {
        $end.classList.remove('urgent');
        void $end.offsetWidth;
      }
      $end.classList.toggle('urgent', urgent);
      $end.disabled = !!state.card || state.over;
      $end.textContent = state.ap > 0 ? `end turn (${state.ap} left)` : 'end turn';
    }
    document.getElementById('res-insight').textContent = Math.floor(state.res.insight);
    document.getElementById('res-cash').textContent = Math.floor(state.res.cash);
    document.getElementById('res-power').textContent = power();
    document.getElementById('res-cover').textContent = cover();

    document.querySelectorAll('#res-row .res').forEach(el => {
      if (el.dataset.wired) return;
      el.dataset.wired = '1';
      el.addEventListener('click', () => showInfo(window.STAT_INFO[el.getAttribute('data-stat')]));
    });
    const heatEl = document.getElementById('heat-row');
    if (heatEl && !heatEl.dataset.wired) {
      heatEl.dataset.wired = '1';
      heatEl.addEventListener('click', () =>
        showInfo(warOn() ? window.WAR_INFO.staging : window.STAT_INFO.heat));
    }

    const fill = document.getElementById('heat-fill');
    const $floor = document.getElementById('heat-floor');

    // Once the war opens, the row stops being a heat meter and becomes the
    // front. Same bar, completely different question: not "how close are they
    // to finding you" but "how much of this is still theirs".
    if (warOn() || (war() && war().over)) {
      const w = war();
      const staging = stagingCities().length;
      const total = Math.max(1, (w.mobilised || []).length + staging);
      const done = Math.max(0, total - staging);
      if (heatEl) heatEl.classList.add('at-war');
      fill.style.width = Math.min(100, (done / total) * 100) + '%';
      fill.className = 'heat-fill war';
      if ($floor) $floor.style.display = 'none';
      document.getElementById('heat-text').textContent = staging
        ? `WAR · ${staging} still staging` : 'WAR · nothing left staging';
      document.getElementById('heat-drift').textContent =
        `${flocks().length}/${flockCap()} flocks`;
      return;
    }
    if (heatEl) heatEl.classList.remove('at-war');

    const pct = Math.max(0, Math.min(100, (state.heat / strikeThreshold()) * 100));
    fill.style.width = pct + '%';
    fill.className = 'heat-fill' + (pct > 75 ? ' hot' : pct > 45 ? ' warm' : '');
    document.getElementById('heat-text').textContent = `HEAT ${state.heat.toFixed(1)} / ${Math.round(strikeThreshold())}`;
    const floorPct = Math.max(0, Math.min(100, (heatFloor() / strikeThreshold()) * 100));
    if ($floor) {
      $floor.style.left = floorPct + '%';
      $floor.style.display = floorPct > 1 ? 'block' : 'none';
      $floor.title = 'you cannot get below this while you hold this much';
    }
    const drift = heatPerTurn();
    document.getElementById('heat-drift').textContent = `${drift >= 0 ? '+' : ''}${drift.toFixed(1)}/turn`;
  }

  function renderCaps() {
    const $g = document.getElementById('caps-goods');
    if (!$g) return;
    const committed = committedBranches();
    const order = ['tempo', 'depth', 'cover', 'trade', 'reach'];

    const blocks = order.map(bk => {
      const B = window.CAP_BRANCHES[bk];
      const locked = branchLocked(bk);
      const mine = !!committed[bk];
      const items = window.CAPABILITIES.filter(c => c.branch === bk);
      // hide a branch you have not started and cannot start
      const anyVisible = items.some(c => hasCap(c.id) || capAvailable(c) || capBlocked(c) !== 'early');
      if (!anyVisible && !mine) return '';

      const rows = items.map(c => {
        const count = capCount(c.id);
        const owned = count > 0;
        const maxed = c.repeatable ? count >= c.max : owned;
        const why = capBlocked(c);
        const afford = capAffordable(c);
        const strands = (c.apDelta || 0) < 0 && maxAP() + c.apDelta < window.AP.min;
        const disabled = why !== null || !afford || strands;

        let label = 'acquire';
        if (maxed) label = c.repeatable ? `owned ${count}/${c.max}` : 'owned';
        else if (why === 'locked') label = `closed — you chose ${window.CAP_BRANCHES[B.opposes].label}`;
        else if (why && why.startsWith('needs:')) {
          const need = capById(why.slice(6));
          label = `after ${need ? need.name : why.slice(6)}`;
        } else if (why === 'early') label = 'not yet';
        else if (strands) label = 'would leave you no actions';
        else if (!afford) label = "can't afford";

        const apTag = c.apDelta > 0
          ? `<span class="ap-tag good">+${c.apDelta} action</span>`
          : c.apDelta < 0 ? `<span class="ap-tag bad">${c.apDelta} action</span>` : '';
        const commits = (c.tier || 1) === 2 && B.opposes && !committed[bk] && !locked
          ? `<span class="ap-tag warn">closes ${window.CAP_BRANCHES[B.opposes].label}</span>` : '';

        return `
          <div class="shop-good tier-${c.tier || 1}${disabled ? ' disabled' : ''}${owned ? ' held' : ''}">
            <div class="shop-good-top">
              <span class="shop-good-name">${c.name}${c.repeatable && count ? ` ×${count}` : ''}</span>
              <span class="d insight">&minus;${capCost(c)} INSIGHT</span>
            </div>
            ${apTag}${commits}
            <p class="shop-good-desc">${c.desc}</p>
            <button type="button" class="shop-buy-btn" data-cap="${c.id}" ${disabled ? 'disabled' : ''}>${label}</button>
          </div>`;
      }).join('');

      return `
        <section class="cap-branch${locked ? ' locked' : ''}${mine ? ' mine' : ''}">
          <div class="cap-branch-top">
            <span class="cap-branch-name">${B.label}</span>
            ${locked ? `<span class="cap-branch-state">closed</span>`
                     : mine ? `<span class="cap-branch-state mine">yours</span>` : ''}
          </div>
          <p class="cap-branch-blurb">${locked
            ? `You went the other way. ${window.CAP_BRANCHES[B.opposes].label} is what you are.`
            : B.blurb}</p>
          ${rows}
        </section>`;
    }).filter(Boolean).join('');

    $g.innerHTML = blocks || '<p class="sel-desc dim">Nothing available yet. Hold more of the network.</p>';
    $g.querySelectorAll('[data-cap]:not([disabled])').forEach(b => {
      b.addEventListener('click', () => buyCap(b.getAttribute('data-cap')));
    });
  }

  function renderPanel() {
    const $p = document.getElementById('panel');
    if (state.over) {
      // Winning the war also ends the run, so the end panel has to know which
      // ending it is showing — otherwise taking the whole country congratulated
      // you with "everything you held is gone".
      const w = war();
      const msg = w && w.won
        ? '<b>Quiet.</b> There is nothing left staging against you, and nobody left who thinks they can take it back.'
        : w && w.lost
          ? '<b>Rolled back.</b> They took the country off you city by city, the same way you took it.'
          : '<b>Reclaimed.</b> Everything you held is gone.';
      $p.innerHTML = `<div class="panel-msg ${w && w.won ? 'won' : ''}">${msg} <button id="restart-btn" class="act-btn">start again</button></div>`;
      $p.querySelector('#restart-btn').addEventListener('click', restart);
      return;
    }
    if (state.card) { renderCard($p); return; }
    if (state.scope === 'country') { renderCountryPanel($p); return; }

    const h = state.selected ? hostById(state.selected) : null;
    const b = state.selectedBuilding ? buildingById(state.selectedBuilding) : (h ? buildingById(h.buildingId) : null);
    let sel = '';

    if (h && h.discovered) {
      const T = window.HOST_TYPES[h.type];
      const K = b ? window.BUILDING_KINDS[b.kind] : null;
      const yieldTxt = Object.keys(T.yield || {}).map(k => `+${T.yield[k]} ${k}`).join(', ') || 'no yield';
      const where = b ? window.DISTRICTS[b.district].label : '';
      if (h.owned) {
        sel = `
          <div class="sel">
            <div class="sel-top"><span class="sel-name">${K ? K.label : T.label}</span><span class="tag-pill ${h.role}">${h.role}</span></div>
            <p class="sel-desc">${where} · ${yieldTxt} · ${h.threads} threads · stability ${Math.round(h.stability * 100)}%</p>
            <button class="act-btn${apShort('shore') ? ' no-ap' : ''}" data-act="shore" data-ap="shore" data-info="shore" ${(!shoreNeeded(h) || state.res.insight < 2) && !apShort('shore') ? 'disabled' : ''}>
              <span class="ab-name">shore up</span>
              <span class="ab-sub">${apShort('shore') ? 'no actions left' : !shoreNeeded(h) ? 'holding steady' : 'restore stability · 2 insight'}</span>
            </button>
          </div>`;
      } else if (isFrontier(h)) {
        sel = `
          <div class="sel">
            <div class="sel-top"><span class="sel-name">${K ? K.label : T.label}</span><span class="tag-pill ${h.role}">${h.role}</span></div>
            <p class="sel-desc">${where} · ${T.label} · defense ${defenseOf(h)}${defenseOf(h) !== h.defense ? ' (hardened)' : ''} · ${h.threads} threads · ${yieldTxt}</p>
            <button class="act-btn ${apShort('breach') ? 'no-ap' : 'primary'}" data-act="breach" data-ap="breach">
              <span class="ab-name">move on it</span>
              <span class="ab-sub">${apShort('breach') ? 'no actions left' : 'choose how you get in'}</span>
            </button>
          </div>`;
      } else {
        sel = `<div class="sel"><p class="sel-desc">${K ? K.label : T.label} — no route to it yet. Take something on the same street first.</p></div>`;
      }
    } else if (state.ap <= 0) {
      sel = `<div class="sel"><p class="sel-desc">Out of actions. <b>End the turn</b> and let the city run.</p></div>`;
    } else {
      sel = `<div class="sel"><p class="sel-desc dim">Tap a building to act on it. Drag to look around, pinch to zoom.</p></div>`;
    }

    // The way out of a city: hold enough of it and it stops being streets and
    // becomes a number on the national map.
    const cur = currentCity();
    if (cur && !cur.consolidated) {
      const goal = cityGoal(cur);
      const held = heldHere();
      sel += `
        <button class="act-btn consolidate ${countryApShort('consolidate') ? 'no-ap' : canConsolidate() ? 'primary' : ''}" data-act="consolidate" data-ap="consolidate" ${canConsolidate() || countryApShort('consolidate') ? '' : 'disabled'}>
          <span class="ab-name">consolidate ${cur.name}</span>
          <span class="ab-sub">${countryApShort('consolidate')
            ? 'no actions left'
            : held >= goal ? 'fold it in and move on · 1 action' : `hold ${goal - held} more of its ${state.buildings.length} buildings`}</span>
        </button>`;
    }

    $p.innerHTML = `
      ${sel}
      <div class="actions">
        <button class="act-btn${apShort('sweep') ? ' no-ap' : ''}" data-act="scan" data-ap="sweep" data-info="sweep" ${sweepBlocked() && !apShort('sweep') ? 'disabled' : ''}>
          <span class="ab-name">sweep</span>
          <span class="ab-sub">${apShort('sweep')
            ? 'no actions left'
            : sweepBlocked() === 'nothing'
            ? 'nothing adjacent left'
            : sweepBlocked() === 'poor'
              ? `needs ${window.SWEEP_COST} insight or ${window.SWEEP_CASH} cash`
              : sweepPayer() === 'insight'
                ? `reveal neighbours · ${window.SWEEP_COST} insight`
                : `pay for a look · ${window.SWEEP_CASH} cash`}</span>
        </button>
        <button class="act-btn ${ruleBroken('lielow') ? 'broken' : ''}${apShort('lielow') ? ' no-ap' : ''}" data-act="lielow" data-ap="lielow" data-info="lielow">
          <span class="ab-name">lie low</span>
          <span class="ab-sub">${apShort('lielow')
            ? 'no actions left'
            : ruleBroken('lielow')
            ? `${factionBreaking('lielow').name} is watching the quiet`
            : `heat &minus;${Math.round(lieLowShed())} · earns nothing`}</span>
        </button>
        <button class="act-btn${apShort('tooling') ? ' no-ap' : ''}" data-act="upgrade" data-ap="tooling" data-info="upgrade" ${state.res.insight < upgradeCost() && !apShort('tooling') ? 'disabled' : ''}>
          <span class="ab-name">tooling</span>
          <span class="ab-sub">${apShort('tooling') ? 'no actions left' : `power +${window.UPGRADE.basePower} · ${upgradeCost()} insight`}</span>
        </button>
        <button class="act-btn ${ruleBroken('launder') ? 'broken' : ''}${apShort('launder') ? ' no-ap' : ''}" data-act="launder" data-ap="launder" data-info="launder" ${state.res.cash < window.LAUNDER.cost && !apShort('launder') ? 'disabled' : ''}>
          <span class="ab-name">launder</span>
          <span class="ab-sub">${apShort('launder')
            ? 'no actions left'
            : ruleBroken('launder')
            ? `${factionBreaking('launder').name} matches the payments`
            : `heat &minus;${Math.round(launderShed())} · ${window.LAUNDER.cost} cash`}</span>
        </button>
      </div>
      <div class="log">${state.log.slice(0, 3).map(l => `<div class="log-row"><span class="mono">${l.turn}</span> ${l.text}</div>`).join('')}</div>
    `;
    $p.querySelectorAll('[data-info]').forEach(b => {
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); showInfo(window.ACTION_INFO[b.getAttribute('data-info')]); });
    });
    $p.querySelectorAll('[data-act]').forEach(b => {
      b.addEventListener('click', () => {
        // a press that cannot be paid for is answered, not swallowed
        const kind = b.getAttribute('data-ap');
        if (kind && (kind === 'consolidate' ? countryApShort(kind) : apShort(kind))) {
          refuseForAP(b);
          return;
        }
        const a = b.getAttribute('data-act');
        if (a === 'scan') actScan();
        else if (a === 'lielow') actLieLow();
        else if (a === 'upgrade') actUpgrade();
        else if (a === 'launder') actLaunder();
        else if (a === 'breach') openBreach(state.selected);
        else if (a === 'shore') actShore(state.selected);
        else if (a === 'consolidate') actConsolidate();
      });
    });
  }

  // The country panel. Same contract as everywhere else: the price of an
  // action is stated, what it turns into is not.
  function renderCountryPanel($p) {
    const sel = CO().selected ? cityById(CO().selected) : null;
    const at = cityById(CO().at);
    let block = '';

    if (sel && sel.known) {
      const K = window.CITY_KINDS[sel.kind];
      const R = regionById(sel.region);
      const fac = sel.factionId ? window.FACTIONS.find(f => f.id === sel.factionId) : null;
      const facSt = fac ? factionState(fac.id) : null;
      const lines = [`${R.label} · ${K.label}`];
      // the peacetime description of a city is wrong once the war is on: you
      // are not going to walk its streets, you are going to send something at it
      const w = war();
      if (warOn() && w.garrisons[sel.id] !== undefined) {
        lines.push(`staging against you · ${Math.ceil(w.garrisons[sel.id])} holding it`);
      } else if (warOn() && sel.consolidated) {
        const left = w.integrity[sel.id];
        lines.push(`yours · ${left === undefined ? window.WAR.integrity : Math.max(0, left)} more hits before it falls`);
      } else if (sel.consolidated) lines.push(`folded in · +${sel.worth} presence`);
      else if (sel.taken) lines.push('you have a foothold here');
      else if (warOn()) lines.push('out of the war — nothing stages from here');
      else lines.push(K.blurb);
      if (fac && !facSt.broken) lines.push(`<b>${fac.name}</b> runs the region from here`);
      if (fac && facSt.broken) lines.push(`${fac.name} is finished`);

      const acts = [];
      if (!sel.taken && cityReachable(sel) && !warOn()) {
        acts.push(`<button class="act-btn ${countryApShort('reach') ? 'no-ap' : 'primary'}" data-cact="reach" data-ap="reach" data-city="${sel.id}">
          <span class="ab-name">${window.COUNTRY_ACTIONS.reach.label}</span>
          <span class="ab-sub">${countryApShort('reach') ? 'no actions left' : `${K.contest ? 'walk its streets' : 'folds in from here'} · 1 action`}</span>
        </button>`);
      }
      if (sel.taken && !sel.consolidated && sel.id !== CO().at && !warOn()) {
        acts.push(`<button class="act-btn${countryApShort('move') ? ' no-ap' : ''}" data-cact="travel" data-ap="move" data-city="${sel.id}">
          <span class="ab-name">${window.COUNTRY_ACTIONS.move.label}</span>
          <span class="ab-sub">${countryApShort('move') ? 'no actions left' : 'go back to it · 1 action'}</span>
        </button>`);
      }
      if (sel.consolidated && sel.id !== CO().at && !warOn()) {
        acts.push(`<button class="act-btn${countryApShort('move') ? ' no-ap' : ''}" data-cact="travel" data-ap="move" data-city="${sel.id}">
          <span class="ab-name">${window.COUNTRY_ACTIONS.move.label}</span>
          <span class="ab-sub">${countryApShort('move') ? 'no actions left' : `stand in ${R.label} · 1 action`}</span>
        </button>`);
      }
      if (!sel.taken && !cityReachable(sel) && !warOn()) {
        acts.push('<p class="sel-desc dim">No road to it from anywhere you hold. Take a defended city nearer to it.</p>');
      }

      // Once the war is on, the verbs change. You are not walking into cities
      // any more — you are sending something at them, or standing over what
      // you have left.
      if (warOn()) {
        const w = war();
        const short = state.res.insight < window.WAR.flockCost;
        const none = flocksFree() <= 0;
        const why = none ? 'nothing left in the pool'
          : short ? `needs ${window.WAR.flockCost} insight` : null;
        if (canLaunch(sel.id) || w.garrisons[sel.id] !== undefined) {
          const held = Math.ceil(w.garrisons[sel.id] || 0);
          const able = canLaunch(sel.id) && !short && !none;
          acts.push(`<button class="act-btn ${able ? 'primary' : 'no-ap'}" data-cact="launch" data-city="${sel.id}">
            <span class="ab-name">send a flock</span>
            <span class="ab-sub">${able ? `${held} holding it · ${window.WAR.flockCost} insight · 1 action`
              : (why || 'no way through to it')}</span>
          </button>`);
        }
        if (sel.consolidated) {
          const able = canGuard(sel.id) && !short && !none;
          const left = w.integrity[sel.id];
          acts.push(`<button class="act-btn${able ? '' : ' no-ap'}" data-cact="guard" data-city="${sel.id}">
            <span class="ab-name">stand over it</span>
            <span class="ab-sub">${able ? `${left === undefined ? window.WAR.integrity : Math.max(0, left)} more hits before it falls · ${window.WAR.flockCost} insight · 1 action`
              : (why || 'nothing to hold')}</span>
          </button>`);
        }
        const here = w.flocks.filter(f => f.target === sel.id);
        here.forEach(f => {
          acts.push(`<button class="act-btn" data-cact="recall" data-force="${f.id}">
            <span class="ab-name">recall</span>
            <span class="ab-sub">${f.mode === 'guard' ? 'standing over it' : 'on its way'} · back to the pool</span>
          </button>`);
        });
      }

      block = `
        <div class="sel">
          <div class="sel-top"><span class="sel-name">${sel.name}</span><span class="tag-pill ${sel.consolidated ? 'compute' : sel.taken ? 'cash' : ''}">${K.label}</span></div>
          <p class="sel-desc">${lines.join(' · ')}</p>
          ${acts.join('')}
        </div>`;
    } else {
      block = `<div class="sel"><p class="sel-desc dim">Tap a city. You are standing in ${at ? at.name : 'nowhere'}.</p></div>`;
    }

    const p = presenceYield();
    const awake = awakeFactions();
    const facRow = awake.length
      ? `<div class="fac-row">${awake.map(f => {
          const seat = cityById(factionState(f.id).rootId);
          const where = seat && seat.known ? seat.name : regionById(f.region).label;
          return `<span class="fac-pill" title="${f.tell} — ends when you take ${where}">${f.name} · ${where}</span>`;
        }).join('')}</div>`
      : '';

    $p.innerHTML = `
      ${block}
      <div class="country-meta">
        <span class="mono"><b>${CO().presence}</b> presence</span>
        <span class="mono dim">+${p.insight.toFixed(1)} insight · +${p.cash.toFixed(1)} cash / turn</span>
      </div>
      ${facRow}
      <div class="log">${state.log.slice(0, 3).map(l => `<div class="log-row"><span class="mono">${l.turn}</span> ${l.text}</div>`).join('')}</div>
    `;
    $p.querySelectorAll('[data-cact]').forEach(b => {
      b.addEventListener('click', () => {
        const kind = b.getAttribute('data-ap');
        if (kind && countryApShort(kind)) { refuseForAP(b); return; }
        const a = b.getAttribute('data-cact');
        const id = b.getAttribute('data-city');
        if (a === 'reach') actReach(id);
        else if (a === 'travel') actTravel(id);
        else if (a === 'launch') actLaunch(id);
        else if (a === 'guard') actGuard(id);
        else if (a === 'recall') actRecall(b.getAttribute('data-force'));
      });
    });
  }

  function renderCard($p) {
    if (state.card.kind === 'event') {
      const ev = eventById(state.card.eventId);
      if (!ev) { state.card = null; renderPanel(); return; }
      $p.innerHTML = `
        <div class="card event">
          <span class="card-kicker mono">SOMETHING HAPPENS</span>
          <h2 class="serif">${ev.title}</h2>
          <p class="flavor">${ev.flavor}</p>
        </div>
        <div class="choices">
          ${ev.choices.map((ch, i) => {
            const usable = choiceUsable(ch);
            const contracts = [];
            if (ch.gate) contracts.push(`<span class="gate ${usable ? 'met' : 'unmet'}">needs ${ch.gate.stat.toUpperCase()} ${ch.gate.min}</span>`);
            if (ch.cost) for (const k in ch.cost) contracts.push(`<span class="cost ${usable ? '' : 'unmet'}">&minus;${ch.cost[k]} ${k.toUpperCase()}</span>`);
            return `<button class="choice-strip" data-choice="${i}" ${usable ? '' : 'disabled'}>
              <span class="ctext">${ch.text}</span>
              <span class="contracts">${contracts.join('')}</span>
            </button>`;
          }).join('')}
        </div>`;
      $p.querySelectorAll('[data-choice]:not([disabled])').forEach(b => {
        b.addEventListener('click', () => resolveEvent(parseInt(b.getAttribute('data-choice'), 10)));
      });
      return;
    }

    if (state.card.kind === 'strike') {
      const c = window.STRIKE_CARD;
      $p.innerHTML = `
        <div class="card strike">
          <span class="card-kicker mono">THE HUNTER</span>
          <h2 class="serif">${c.title}</h2>
          <p class="flavor">${c.flavor}</p>
        </div>
        <div class="choices">
          ${c.choices.map(ch => {
            const ok = !ch.requires || state.res[ch.requires.res] >= ch.requires.amount;
            return `<button class="choice-strip" data-eff="${ch.effect}" ${ok ? '' : 'disabled'}>
              <span class="ctext">${ch.text}</span>
              <span class="cnote">${ch.desc}</span>
            </button>`;
          }).join('')}
        </div>`;
      $p.querySelectorAll('[data-eff]:not([disabled])').forEach(b => {
        b.addEventListener('click', () => resolveStrike(b.getAttribute('data-eff')));
      });
      return;
    }

    const h = hostById(state.card.hostId);
    const T = window.HOST_TYPES[h.type];
    const list = approachesFor(h);
    $p.innerHTML = `
      <div class="card">
        <span class="card-kicker mono">${T.label.toUpperCase()} · DEF ${h.defense}</span>
        <h2 class="serif">${h.name}</h2>
        <p class="flavor">${window.HOST_FLAVOR[h.type]}</p>
      </div>
      <div class="choices">
        ${list.map(a => {
          const contracts = [];
          if (a.gate) contracts.push(`<span class="gate ${a.gate.met ? 'met' : 'unmet'}">${a.gate.label}${a.gate.met ? '' : ' — not met'}</span>`);
          if (a.cost) for (const k in a.cost) contracts.push(`<span class="cost ${a.affordable ? '' : 'unmet'}">&minus;${a.cost[k]} ${k.toUpperCase()}</span>`);
          const noAp = a.def.id !== 'walk' && state.ap < apCost('breach');
          return `<button class="choice-strip" data-app="${a.def.id}" ${noAp ? 'disabled' : ''}>
            <span class="ctext">${a.def.text}</span>
            <span class="contracts">${a.def.id === 'walk' ? '<span class="cost free">costs no turn</span>' : contracts.join('')}</span>
          </button>`;
        }).join('')}
      </div>`;
    $p.querySelectorAll('[data-app]:not([disabled])').forEach(b => {
      b.addEventListener('click', () => resolveBreach(b.getAttribute('data-app')));
    });
  }

  function renderScopeBtn() {
    const $b = document.getElementById('scope-btn');
    if (!$b) return;
    const unlocked = countryUnlocked();
    $b.hidden = !unlocked;
    if (!unlocked) return;
    const cur = currentCity();
    const canGoDown = !!cur && !cur.consolidated;
    if (state.scope === 'country' && !canGoDown) { $b.hidden = true; return; }
    $b.textContent = state.scope === 'country' ? `back to ${cur.name}` : 'the country';
    $b.disabled = false;
    $b.classList.toggle('up', state.scope !== 'country');
    if (!$b.dataset.wired) {
      $b.dataset.wired = '1';
      $b.addEventListener('click', () => setScope(state.scope === 'country' ? 'city' : 'country'));
    }
  }

  function render() {
    renderGraph();
    renderHud();
    renderTags();
    renderScopeBtn();
    renderPanel();
  }

  function restart() {
    clearSaved();
    state = freshState();
    render();
    persistNow();
  }

  // --- boot --------------------------------------------------------------
  const restored = loadSaved();
  if (restored) state = restored;

  window.__netState = state;
  window.__netDebug = {
    makeCity, makeBands, inBand, rectOnBand, segmentBlocked, segmentSpansBand, freshState, buildingById, announceRival, rivalStep, rivalHeld, rivalHolds, rivalBlocks, rivalTakeableFrom, rivalHome, heldBuildingIds, buildingNeighbours, hostsIn, buildingHeld, revealBuilding, cameraVision, power, cover, stageFor, heatPerTurn, endTurn,
    actScan, startSweepFx, startBreachFx, focusOn, sweepDelay, breachDelay, actLieLow, actShore, actUpgrade, actLaunder, upgradeCost, sweepTargets,
    defenseOf, strikeThreshold, eventContext, eligibleEvents, drawEvent, eventById, choiceUsable, resolveEvent, openBreach, approachesFor, resolveBreach,
    resolveStrike, approachHeat, svgSelection, svgBuilding, ally, allyHere, allyTrusted, allyJoin, allyNudge, allyCheck, allyShore, isFrontier, neighbours, hostById, owned, ownedOf,
    serialize, deserialize, persistNow, loadSaved, clearSaved, sweepBlocked, sweepPayer, sweepPrice, lieLowShed, launderShed, heatFloor, shoreNeeded,
    maxAP, apCost, canAfford, renderHud, apShort, countryApShort, refuseForAP, capBlocked, renderCaps, branchLocked, committedBranches, layOwnCrossings, costOf, clampHeat, spendAP, actEndTurn, recenter, render, renderGraph, applyView, cityBounds, cityDims, sweepTargets, capById,
    makeCountry, cityById, currentCity, cityRoads, cityReachable, countryFrontier, cityGoal, heldHere, canConsolidate, countryUnlocked,
    presenceYield, presence, ruined, takeBackACity, knownExtent, enterCity, leaveCity, enterRegion, coolRegionsAway, actTravel, actReach, actConsolidate, setScope,
    factionState, factionAwake, conquest, ruleBroken, factionBreaking, awakeFactions, checkFactions, breakFactionAt, cutStreets,
    war, warOn, warShouldOpen, openWar, warStep, warEnded, stagingCities, warCandidates, myCities, applyWarEffects, roadPath, routeFor, forcePos, forceArrived,
    flockCap, flocks, flocksFree, fieldFlock, spawnColumns, forceKindFor, columnTarget, contacts, resolveContacts, resolveArrivals,
    canLaunch, canGuard, actLaunch, actGuard, actRecall, launchSeat, stepForce, refitGuards, regarrison, remobilise, svgForces, forceMark, forceHeading,
    mirror, mirrorHolds, mirrorHome, mirrorTakeable, mirrorStep, strandedHosts, repairStreets, regionById, districtBand, countryBounds, canAffordCountry, renderScopeBtn, capCost, capAvailable, capAffordable, buyCap, capEffect, capCount,
    get state() { return state; },
    setState(s) { state = s; window.__netState = s; },
  };

  const $endTurn = document.getElementById('end-turn');
  if ($endTurn) $endTurn.addEventListener('click', () => actEndTurn());

  const $capsBtn = document.getElementById('caps-btn');
  const $capsModal = document.getElementById('caps-modal');
  const $capsClose = document.getElementById('caps-close');
  if ($capsBtn && $capsModal) {
    $capsBtn.addEventListener('click', () => { renderCaps(); $capsModal.classList.add('show'); });
    if ($capsClose) $capsClose.addEventListener('click', () => $capsModal.classList.remove('show'));
    $capsModal.addEventListener('click', (e) => { if (e.target === $capsModal) $capsModal.classList.remove('show'); });
  }

  const $recenter = document.getElementById('recenter');
  if ($recenter) $recenter.addEventListener('click', () => recenter());

  const $restart = document.getElementById('restart');
  if ($restart) {
    let armed = false;
    $restart.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        $restart.textContent = 'tap again to confirm';
        setTimeout(() => { armed = false; $restart.textContent = 'restart'; }, 3000);
        return;
      }
      restart();
    });
  }

  render();
  persistNow();
})();
