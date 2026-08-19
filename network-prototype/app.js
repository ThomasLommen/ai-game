'use strict';
(function () {
  const SAVE_KEY = 'network_proto_save';
  // 3: the country went from nine defended cities to five, and the escalation
  // was re-keyed to shares of it. A save from before that keeps its nine-city
  // board, where 0.2 of the country is two cities rather than one — so the
  // ladder sits exactly where it used to, which is the thing that got fixed.
  // A continued game could reach turn 44 with nothing awake at all. The board
  // shape is not migratable, so old saves are retired.
  const SAVE_VERSION = 5;   // resources are TFLOPS, funds and electricity now
  // breathing room around a map, in map units — the coastline wanders into it
  const CITY_PAD = 40;

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

  // --- what else is standing there ----------------------------------------
  // Props fill what the buildings left over, and the verge outside. Generated
  // once with the city and packed with it — a bench that moved when you ended a
  // turn would be worse than no bench, and the whole reason this is affordable
  // is that it draws on the ground layer, which is written once per city.
  function scatterProps(block, districtKey, bands, buildings, open) {
    const F = window.PROP_FILL;
    const pool = open
      ? (window.OPEN_BLOCKS[districtKey] || {}).props || []
      : window.DISTRICT_PROPS[districtKey] || [];
    if (!pool.length) return [];

    const out = [];
    // Every building, not the ones nominally in this block. A landmark is
    // moved and grown after the fact and routinely overhangs the block it came
    // from, and a margin big enough to be safe is most of the map anyway.
    const mine = buildings;

    const room = (x, y, w, h, pad) =>
      !(bands && bands.some(band => rectOnBand(band, x, y, w, h))) &&
      mine.every(b =>
        x + w + F.clearOfBuilding <= b.x || b.x + b.w + F.clearOfBuilding <= x ||
        y + h + F.clearOfBuilding <= b.y || b.y + b.h + F.clearOfBuilding <= y) &&
      out.every(p =>
        x + w + pad <= p.x || p.x + p.w + pad <= x ||
        y + h + pad <= p.y || p.y + p.h + pad <= y);

    // Scaled by the block, not a flat count. Blocks grew a long way when they
    // started varying with their district, and a fixed three-to-seven left the
    // middle of a big one as a dark void — which reads as buildings floating
    // rather than as buildings lining a street with yards behind them.
    const K = (block.w * block.h) / (window.CITY.blockW * window.CITY.blockH);
    const want = Math.round(K *
      (open ? rndInt(F.perOpen[0], F.perOpen[1]) : rndInt(F.perBlock[0], F.perBlock[1])));
    for (let n = 0; n < want; n++) {
      const kind = pick(pool);
      const P = window.PROPS[kind];
      if (!P) continue;
      const w = rndInt(P.w[0], P.w[1]);
      const h = rndInt(P.h[0], P.h[1]);
      for (let t = 0; t < F.tries; t++) {
        const x = Math.round(block.x + 2 + Math.random() * Math.max(0, block.w - w - 4));
        const y = Math.round(block.y + 2 + Math.random() * Math.max(0, block.h - h - 4));
        if (room(x, y, w, h, P.pad)) { out.push({ kind, x, y, w, h }); break; }
      }
    }
    return out;
  }

  // Street furniture, on the pavement where it belongs. A camera mast, a street
  // cabinet and a feeder pillar are not on a plot — the data has called them
  // street furniture since they were written — and yet the block scatter was
  // treating them like houses, which is how 22 cabinets across six cities ended
  // up marooned in the middle of a lot.
  //
  // They keep the block's row and column so adjacency is unchanged in kind: a
  // verge is between two blocks, and `blocksAdjacent` already lets one street
  // be crossed. What does change is how *many* things are within reach of them,
  // which is measured rather than assumed.
  function scatterFurniture(block, kinds, layout, bands, taken) {
    const C = window.CITY;
    const pool = kinds.filter(k => C.furniture[k]);
    if (!pool.length) return [];
    const out = [];
    // Two at most. Street furniture was about a quarter of every board when it
    // lived on the plots, and it has to stay about a quarter now that it lives
    // on the pavement — it is the cheap stealth kit, and how much cover the
    // city offers is a balance number, not a decoration.
    const n = rndInt(0, 2);
    for (let i = 0; i < n; i++) {
      const kind = pick(pool);
      const K = window.BUILDING_KINDS[kind];
      if (!K) continue;
      const w = rndInt(K.w[0], K.w[1]);
      const h = rndInt(K.h[0], K.h[1]);
      const side = ['n', 's', 'e', 'w'][Math.floor(Math.random() * 4)];
      const horiz = side === 'n' || side === 's';
      const road = horiz ? layout.hRoad[block.row + (side === 's' ? 1 : 0)]
                         : layout.vRoad[block.col + (side === 'e' ? 1 : 0)];
      // it stands on the kerb, not in the carriageway
      if (road < (horiz ? h : w) + 10) continue;
      let x, y;
      if (side === 'n') { x = block.x + Math.random() * (block.w - w); y = block.y - road / 2 + 4; }
      else if (side === 's') { x = block.x + Math.random() * (block.w - w); y = block.y + block.h + road / 2 - h - 4; }
      else if (side === 'w') { x = block.x - road / 2 + 4; y = block.y + Math.random() * (block.h - h); }
      else { x = block.x + block.w + road / 2 - w - 4; y = block.y + Math.random() * (block.h - h); }
      x = Math.round(x); y = Math.round(y);
      if (bands && bands.some(band => rectOnBand(band, x, y, w, h))) continue;
      const clear = taken.concat(out).every(o =>
        x + w + 6 <= o.x || o.x + o.w + 6 <= x || y + h + 6 <= o.y || o.y + o.h + 6 <= y);
      if (clear) out.push({ kind, x, y, w, h, verge: true });
    }
    return out;
  }

  // A path from a back plot's door out to the nearest kerb. Only the handful of
  // buildings too big to take any frontage get one — measured at 2% of them,
  // and all offices, finance floors and the industrial giants. A building with
  // no way to reach it is the thing this whole pass is about.
  function pathsFor(block, layout, placed) {
    const C = window.CITY;
    const out = [];
    placed.filter(b => b.back).forEach(b => {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const gaps = [
        { d: b.y - block.y, to: { x: cx, y: block.y - layout.hRoad[block.row] / 2 } },
        { d: (block.y + block.h) - (b.y + b.h), to: { x: cx, y: block.y + block.h + layout.hRoad[block.row + 1] / 2 } },
        { d: b.x - block.x, to: { x: block.x - layout.vRoad[block.col] / 2, y: cy } },
        { d: (block.x + block.w) - (b.x + b.w), to: { x: block.x + block.w + layout.vRoad[block.col + 1] / 2, y: cy } },
      ].sort((p, q) => p.d - q.d);
      const near = gaps[0];
      out.push({ x1: Math.round(cx), y1: Math.round(cy), x2: Math.round(near.to.x), y2: Math.round(near.to.y) });
    });
    return out;
  }

  // The verge: the strip of road-side outside a block. Lamps and bins and the
  // odd tree go here rather than inside, because that is where they are in a
  // city and because it is the gap between blocks that used to read as empty.
  function scatterVerge(block, districtKey, layout, bands, buildings) {
    const F = window.PROP_FILL;
    const pool = (window.DISTRICT_PROPS[districtKey] || [])
      .filter(k => ['tree', 'bush', 'lamp', 'bin', 'bench', 'bollards', 'newsstand', 'planter', 'scrub'].indexOf(k) !== -1);
    if (!pool.length) return [];
    const out = [];
    const n = rndInt(F.verge[0], F.verge[1]);
    for (let i = 0; i < n; i++) {
      const kind = pick(pool);
      const P = window.PROPS[kind];
      if (!P) continue;
      const w = rndInt(P.w[0], P.w[1]);
      const h = rndInt(P.h[0], P.h[1]);
      const side = ['n', 's', 'e', 'w'][Math.floor(Math.random() * 4)];
      const road = (side === 'n' || side === 's') ? layout.hRoad[block.row + (side === 's' ? 1 : 0)]
                                                 : layout.vRoad[block.col + (side === 'e' ? 1 : 0)];
      if (road < w + 8 || road < h + 8) continue;    // no room on that road
      let x, y;
      if (side === 'n') { x = block.x + Math.random() * (block.w - w); y = block.y - road / 2 + 3; }
      else if (side === 's') { x = block.x + Math.random() * (block.w - w); y = block.y + block.h + road / 2 - h - 3; }
      else if (side === 'w') { x = block.x - road / 2 + 3; y = block.y + Math.random() * (block.h - h); }
      else { x = block.x + block.w + road / 2 - w - 3; y = block.y + Math.random() * (block.h - h); }
      x = Math.round(x); y = Math.round(y);
      if (bands && bands.some(band => rectOnBand(band, x, y, w, h))) continue;
      // the verge is where the street furniture lives too, and a bench inside a
      // camera mast is the same bug as a tree inside a substation
      const clear = (buildings || []).every(b =>
        x + w + 3 <= b.x || b.x + b.w + 3 <= x || y + h + 3 <= b.y || b.y + b.h + 3 <= y)
        && out.every(o =>
        x + w <= o.x || o.x + o.w <= x || y + h <= o.y || o.y + o.h <= y);
      if (!clear) continue;
      out.push({ kind, x, y, w, h });
    }
    return out;
  }

  // --- what's on the machine ------------------------------------------------
  // Contents are decided here, at generation, and never again — randomness
  // upstream, resolution deterministic, which is the covenant. Carriers are
  // chosen by ranking hosts against a seed rather than rolling per host, so
  // the share is a bound and not a hope, and a landmark always carries: the
  // biggest thing in the city is never an empty box.
  // What a district can source — Act 2's materials, decided at generation
  // like every fact about the ground (the loot laws apply: chosen upstream
  // against a seed, revealed by looking, stated exactly, dormant until the
  // act turns). A supplier is a place, never a number.
  function assignSources(bldgs, seed) {
    const S = window.SOURCES;
    if (!S) return;
    const byDistrict = {};
    bldgs.forEach(b => {
      // real premises only — a street cabinet is not a steel yard
      if (b.w >= 18 && b.h >= 14) (byDistrict[b.district] = byDistrict[b.district] || []).push(b);
    });
    Object.keys(byDistrict).forEach(dk => {
      const share = S.share[dk] || 0;
      if (!share) return;
      const pool = byDistrict[dk].slice().sort((a, b) =>
        cityNoise(seed, idSeed(a.id)) - cityNoise(seed, idSeed(b.id)));
      pool.slice(0, Math.round(pool.length * share)).forEach(b => {
        b.source = S.trade[dk] || (cityNoise(seed, idSeed(b.id) + 7) < 0.5 ? 'steel' : 'fab');
      });
    });
    // the floor: a city that cannot source cannot build
    Object.keys(S.min || {}).forEach(kind => {
      let have = bldgs.filter(b => b.source === kind).length;
      const cands = bldgs.filter(b => !b.source && b.w >= 18 && b.h >= 14)
        .sort((a, b) => cityNoise(seed, idSeed(a.id) + 31) - cityNoise(seed, idSeed(b.id) + 31));
      while (have < S.min[kind] && cands.length) { cands.shift().source = kind; have++; }
    });
  }
  function assignCarry(hostList, seed) {
    const C = window.CARRY;
    if (!C) return;
    const eligible = hostList.filter(h => !h.origin && (C.pools[h.type] || []).length);
    // Weighted toward the harder doors, deliberately. Measured with uniform
    // placement: a glint-chasing bot's run was indistinguishable from an
    // easiest-door bot's (+0.1 carriers over 8 paired boards), because
    // contents mostly landed on doors both would take anyway. The pull only
    // works when the prize sits behind the race — the diary is on the machine
    // that would catch you, and that is what finally makes the forecast bar
    // worth reading.
    const ranked = eligible
      .map((h, i) => ({ h, r: cityNoise(seed, i * 13 + 5) / (1 + h.defense / C.pullDefense) }))
      .sort((a, b) => a.r - b.r);
    const want = Math.round(eligible.length * C.share);
    const carriers = ranked.slice(0, want).map(x => x.h);
    hostList.filter(h => h.landmark && (C.pools[h.type] || []).length)
      .forEach(h => { if (carriers.indexOf(h) === -1) carriers.push(h); });
    carriers.forEach((h, i) => {
      const pool = C.pools[h.type];
      h.carry = pool[Math.floor(cityNoise(seed, i * 7 + 3) * pool.length)] || pool[0];
      if (h.carry === 'wallet') {
        const tier = h.ring || 0;
        h.carryAmt = Math.round((C.wallet.base + tier * C.wallet.perTier)
          * (h.landmark ? C.wallet.landmarkMult : 1));
      }
    });
  }

  // --- the street plan ----------------------------------------------------
  // The blocks and the roads between them, as explicit geometry rather than
  // arithmetic on one block size. Everything that draws the ground reads this,
  // which is what lets the plan be irregular at all: while `blockW` and
  // `street` were the only two numbers in existence, every road was the same
  // road and every block was the same block.
  //
  // The layout travels with the city — it is generated once and packed with it
  // — because a street that moved between two renders would be worse than a
  // street that was always straight.
  function makeLayout(cols, rows, tierSpan, wob) {
    const C = window.CITY;
    const arterial = (n) => n % C.arterialEvery === 0;
    const swing = (base, vary) => Math.round(base * (1 + (Math.random() * 2 - 1) * vary));
    const roadAt = (n) => Math.max(18, swing(C.street * (arterial(n) ? C.arterialMult : 1), C.streetVary));

    // Districts first, on the normalised grid, because a block's size depends
    // on which district it is in — a datacenter is 159 wide at its median and
    // will not stand on a suburban plot. Rows and columns take the *largest*
    // scale of any block in them: the roads have to stay straight, and a jagged
    // street plan is a much bigger change than this one.
    const dist = [];
    for (let r = 0; r < rows; r++) {
      dist.push([]);
      for (let c = 0; c < cols; c++) {
        dist[r].push(districtAt((c + 0.5) / cols, (r + 0.5) / rows, tierSpan, wob || [0, 0, 0]));
      }
    }
    const scaleOf = (k) => (window.DISTRICT_BLOCK || {})[k] || 1;
    const colScale = [], rowScale = [];
    for (let c = 0; c < cols; c++) colScale.push(Math.max(...dist.map(row => scaleOf(row[c]))));
    for (let r = 0; r < rows; r++) rowScale.push(Math.max(...dist[r].map(scaleOf)));

    const colW = [], rowH = [], vRoad = [], hRoad = [];
    for (let c = 0; c <= cols; c++) vRoad.push(roadAt(c));
    for (let r = 0; r <= rows; r++) hRoad.push(roadAt(r));
    for (let c = 0; c < cols; c++) colW.push(Math.max(90, swing(C.blockW * colScale[c], C.blockVary)));
    for (let r = 0; r < rows; r++) rowH.push(Math.max(80, swing(C.blockH * rowScale[r], C.blockVary)));

    // running totals: xs[n] is the centre line of road n, blocks sit between
    const xs = [], ys = [], blocks = [];
    let x = vRoad[0] / 2;
    const blockX = [];
    for (let c = 0; c < cols; c++) {
      xs.push(Math.round(x));
      blockX.push(Math.round(x + vRoad[c] / 2));
      x += vRoad[c] / 2 + colW[c] + vRoad[c + 1] / 2;
    }
    xs.push(Math.round(x));
    let y = hRoad[0] / 2;
    const blockY = [];
    for (let r = 0; r < rows; r++) {
      ys.push(Math.round(y));
      blockY.push(Math.round(y + hRoad[r] / 2));
      y += hRoad[r] / 2 + rowH[r] + hRoad[r + 1] / 2;
    }
    ys.push(Math.round(y));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        blocks.push({
          row: r, col: c, i: r * cols + c,
          x: blockX[c], y: blockY[r], w: colW[c], h: rowH[r],
          district: dist[r][c],
        });
      }
    }
    return {
      cols, rows, blocks,
      xs, ys, vRoad, hRoad,
      w: Math.round(x + vRoad[cols] / 2),
      h: Math.round(y + hRoad[rows] / 2),
    };
  }

  // A layout for a city generated before layouts existed, or for anything that
  // asks for bounds without one. Exactly the old arithmetic, so an old save
  // draws precisely as it always did rather than shifting under the player.
  function regularLayout(cols, rows) {
    const C = window.CITY;
    const blocks = [], xs = [], ys = [];
    for (let c = 0; c <= cols; c++) xs.push(c * (C.blockW + C.street) + C.street / 2);
    for (let r = 0; r <= rows; r++) ys.push(r * (C.blockH + C.street) + C.street / 2);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        blocks.push({
          row: r, col: c, i: r * cols + c,
          x: C.street + c * (C.blockW + C.street), y: C.street + r * (C.blockH + C.street),
          w: C.blockW, h: C.blockH,
        });
      }
    }
    return {
      cols, rows, blocks, xs, ys,
      vRoad: xs.map(() => C.street), hRoad: ys.map(() => C.street),
      w: C.street + cols * (C.blockW + C.street),
      h: C.street + rows * (C.blockH + C.street),
    };
  }

  // Which district a block is in. Districts used to be rows, which is why they
  // read as stripes: the gradient across the map is real and worth keeping —
  // suburbs near where you woke up, the industrial edge furthest off — but a
  // boundary that is a straight horizontal line is the one thing no city has.
  //
  // The wobble is three sine terms of the block's own position, so it is smooth
  // in space: neighbouring blocks agree, and the districts come out as blobs
  // with ragged edges rather than salt and pepper.
  const DISTRICT_KEYS = ['residential', 'commercial', 'business', 'industrial'];
  // `regionTier` undefined means the home city, which spans all four — it is
  // the one you learn the whole vocabulary in. A city out in the country gets
  // a window of two or three around its tier, which is what makes the north
  // read as somewhere else rather than as home with bigger numbers.
  function districtSpan(regionTier) {
    if (regionTier === undefined || regionTier === null) return [0, DISTRICT_KEYS.length - 1];
    return [
      Math.max(0, Math.min(DISTRICT_KEYS.length - 1, regionTier - 1)),
      Math.min(DISTRICT_KEYS.length - 1, regionTier + 1),
    ];
  }
  // Taken on the *normalised* grid rather than on pixels, because the layout
  // now has to know its districts before it can size its blocks — the blocks
  // grow with the district standing on them, so pixel positions do not exist
  // yet at the moment this is asked.
  function districtAt(fx, fy, regionTier, wob) {
    const C = window.CITY;
    const span = districtSpan(regionTier);
    const lo = span[0], hi = span[1];
    const n = Math.sin(fx * 6.1 + wob[0]) * 0.5
            + Math.sin(fy * 4.4 + wob[1]) * 0.3
            + Math.sin((fx + fy * 0.7) * 8.3 + wob[2]) * 0.2;
    const t = Math.max(0, Math.min(1, fy + n * C.districtBlur));
    return DISTRICT_KEYS[Math.round(lo + (hi - lo) * t)];
  }
  function districtFor(block, layout, regionTier, wob) {
    return districtAt((block.x + block.w / 2) / Math.max(1, layout.w),
                      (block.y + block.h / 2) / Math.max(1, layout.h),
                      regionTier, wob);
  }

  // Which blocks have nothing built on them: a park in the suburbs, a square on
  // the high street, a plaza in the business park, a yard on the industrial
  // edge. It is the strongest mark the scenery makes, because it is the only
  // one with a shape of its own, and it is what stops the plan reading as
  // wall-to-wall blocks.
  //
  // Chosen by ranking every block against the city's own seed rather than by
  // rolling per block. Two reasons, and the second is the one that bit: a roll
  // is unbounded, so an unlucky city could open half its blocks and lose the
  // graph — and `Math.random() < chance` is *always* true under a test that
  // pins random to zero, which emptied the whole city.
  function markOpenBlocks(layout, seed) {
    const scored = layout.blocks
      .map((b, i) => {
        const OB = window.OPEN_BLOCKS[b.district];
        return OB ? { b, OB, r: cityNoise(seed, i * 7 + 3) / Math.max(0.01, OB.chance) } : null;
      })
      .filter(Boolean)
      .sort((p, q) => p.r - q.r);
    // the mean chance across the blocks that exist, as a count, so however the
    // districts fell there is a fixed ceiling on how much of the city is holes
    const mean = scored.reduce((a, x) => a + x.OB.chance, 0) / Math.max(1, scored.length);
    const want = Math.min(Math.round(layout.blocks.length * mean),
                          Math.floor(layout.blocks.length * 0.22));
    scored.slice(0, Math.max(0, want)).forEach(({ b, OB }) => {
      b.open = true;
      b.openKind = OB.kind;
    });
  }

  // Buildings thrown into a block rather than slotted into it.
  //
  // Darts, not cells: pick a kind, pick a size from its own range, pick a spot,
  // and keep it only if it clears everything already standing and is not on the
  // water. `frontage` pulls the spot toward whichever edge of the block is
  // nearest, because buildings face the road — that, more than the jitter, is
  // what makes a block read as built rather than sprinkled.
  function scatterBlock(block, kinds, bands, opts) {
    const C = window.CITY;
    const o = opts || {};
    const placed = [];
    // How many to ask for: how many things of *this district's* typical size
    // fit on this much ground. Neither of the obvious formulas works. Plain
    // area put 203 buildings on a board that used to hold 98, because the map
    // grew when the blocks did. Dividing by the district's nominal scale was
    // worse and backwards — a row and a column take the largest scale in them,
    // so a suburban block sitting in an industrial column is *big*, and
    // dividing by 0.82 squared made it denser rather than sparser.
    //
    // Typical size is the honest denominator, and it falls straight out of the
    // kinds the district builds: one datacenter takes the room of twenty
    // houses because it is twenty times the house.
    const typical = kinds.reduce((a, k) => {
      const K = window.BUILDING_KINDS[k];
      if (!K) return a;
      return a + ((K.w[0] + K.w[1]) / 2) * ((K.h[0] + K.h[1]) / 2);
    }, 0) / Math.max(1, kinds.length);
    const want = Math.max(1, Math.round(
      (block.w * block.h) / Math.max(1, typical) / C.plotShare
        * (rndInt(C.perBlock[0], C.perBlock[1]) / 3)
    ) + (o.denser || 0));

    const fits = (x, y, w, h) =>
      x >= block.x + C.edgeInset && y >= block.y + C.edgeInset &&
      x + w <= block.x + block.w - C.edgeInset && y + h <= block.y + block.h - C.edgeInset &&
      !(bands && bands.some(band => rectOnBand(band, x, y, w, h))) &&
      placed.every(p =>
        x + w + C.gapMin <= p.x || p.x + p.w + C.gapMin <= x ||
        y + h + C.gapMin <= p.y || p.y + p.h + C.gapMin <= y);

    // A terrace: a run of buildings shoulder to shoulder along one edge, all
    // squared onto the same street line. This is most of what separates a city
    // block from a handful of boxes in a field — the eye reads the shared
    // frontage as a street long before it reads any individual roof.
    if (Math.random() < C.terraceChance) {
      const side = ['n', 's', 'e', 'w'][Math.floor(Math.random() * 4)];
      const horiz = side === 'n' || side === 's';
      const run = rndInt(C.terraceRun[0], C.terraceRun[1]);
      // one depth for the whole terrace, so the backs line up as well as the fronts
      const lead = window.BUILDING_KINDS[pick(kinds)];
      const depth = lead ? rndInt(lead[horiz ? 'h' : 'w'][0], lead[horiz ? 'h' : 'w'][1]) : 0;
      // A terrace is a run of buildings of the same depth, so only kinds that
      // are naturally that deep may join it. Without this the lead's depth was
      // forced onto everything behind it and a street cabinet came out the
      // size of an apartment block — the row lined up, and every proportion
      // in it was a lie.
      const sameDepth = kinds.filter(k => {
        const K = window.BUILDING_KINDS[k];
        const r = K && K[horiz ? 'h' : 'w'];
        return r && depth >= r[0] && depth <= r[1];
      });
      let along = (horiz ? block.x : block.y) + C.edgeInset + Math.random() * 18;
      for (let i = 0; i < run && depth && sameDepth.length; i++) {
        const kind = pick(sameDepth);
        const K = window.BUILDING_KINDS[kind];
        if (!K) continue;
        const span = rndInt(K[horiz ? 'w' : 'h'][0], K[horiz ? 'w' : 'h'][1]);
        const w = horiz ? span : depth;
        const h = horiz ? depth : span;
        const x = horiz ? Math.round(along)
          : (side === 'w' ? block.x + C.edgeInset : block.x + block.w - C.edgeInset - w);
        const y = horiz ? (side === 'n' ? block.y + C.edgeInset : block.y + block.h - C.edgeInset - h)
          : Math.round(along);
        if (!fits(x, y, w, h)) break;   // ran off the end of the block, or into the water
        placed.push({ kind, x, y, w, h });
        along += span + rndInt(C.terraceGap[0], C.terraceGap[1]);
      }
    }

    // The rest take a frontage on one of the four sides, squared onto it.
    // Every side is tried before anything goes behind, because a building that
    // is not on a road makes no sense from either an infrastructure or an
    // architecture point of view — and the old scatter left 16% of them
    // marooned in the middle of a lot with no way to reach them.
    const SIDES = ['n', 's', 'e', 'w'];
    const onSide = (side, w, h) => {
      const inset = C.edgeInset;
      if (side === 'n') return { x: null, y: block.y + inset };
      if (side === 's') return { x: null, y: block.y + block.h - inset - h };
      if (side === 'w') return { x: block.x + inset, y: null };
      return { x: block.x + block.w - inset - w, y: null };
    };

    for (let n = 0; n < want; n++) {
      const kind = pick(kinds);
      const K = window.BUILDING_KINDS[kind];
      if (!K) continue;
      const w = Math.min(rndInt(K.w[0], K.w[1]), block.w - C.edgeInset * 2);
      const h = Math.min(rndInt(K.h[0], K.h[1]), block.h - C.edgeInset * 2);
      if (w < 8 || h < 8) continue;

      let put = null;
      // front a street, trying the sides in a shuffled order so no block ends
      // up filling clockwise
      const sides = shuffleArr(SIDES.slice());
      for (const side of sides) {
        if (put) break;
        const anchor = onSide(side, w, h);
        const horiz = anchor.x === null;
        const lo = horiz ? block.x + C.edgeInset : block.y + C.edgeInset;
        const span = Math.max(0, (horiz ? block.w : block.h) - (horiz ? w : h) - C.edgeInset * 2);
        for (let t = 0; t < C.scatterTries && !put; t++) {
          const along = Math.round(lo + span * Math.random());
          const x = horiz ? along : anchor.x;
          const y = horiz ? anchor.y : along;
          if (fits(x, y, w, h)) put = { kind, x, y, w, h, front: side };
        }
      }
      // Nothing left on any frontage. It goes behind, and it gets a path out
      // to the nearest kerb — which is what a back plot has in a real place.
      if (!put && C.backRows) {
        const spanX = Math.max(0, block.w - w - C.edgeInset * 2);
        const spanY = Math.max(0, block.h - h - C.edgeInset * 2);
        for (let t = 0; t < C.scatterTries && !put; t++) {
          const x = Math.round(block.x + C.edgeInset + spanX * Math.random());
          const y = Math.round(block.y + C.edgeInset + spanY * Math.random());
          if (fits(x, y, w, h)) put = { kind, x, y, w, h, back: true };
        }
      }
      if (put) placed.push(put);
    }
    return placed;
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
      // A band used to run the whole width of the map, always — which is a
      // river or a railway and nothing else. `runs` gives it a span along its
      // own axis, so the same primitive can be a lake: a patch of water that
      // blocks what is under it and is simply gone round, rather than a wall
      // with bridges over it. Absent means the old behaviour, edge to edge.
      const runs = spec.runs
        ? { from: along * spec.runs[0], to: along * spec.runs[1] }
        : { from: -1e6, to: 1e6 };
      // crossings sit at even intervals with a little jitter, never at the edge
      const gaps = [];
      const n = Math.max(0, (spec.crossings || 0) + extra);
      const span = Math.min(along, runs.to - runs.from);
      const base = spec.runs ? runs.from : 0;
      for (let g = 0; g < n; g++) {
        const t = (g + 1) / (n + 1);
        gaps.push({
          at: base + span * t + rnd(-span * 0.06, span * 0.06),
          w: window.CITY.street * 1.6,
        });
      }
      return { id: 'band' + i, kind: spec.kind, axis: spec.axis,
               from: mid - half, to: mid + half, runs, gaps };
    });
  }
  // Where a band actually is along its own axis. Everything below asks this
  // rather than assuming edge to edge.
  function bandCovers(band, along) {
    const r = band.runs;
    return !r || (along >= r.from && along <= r.to);
  }

  // is this point inside a band, and not in one of its crossings?
  function inBand(band, x, y) {
    const across = band.axis === 'h' ? y : x;
    const along = band.axis === 'h' ? x : y;
    if (across < band.from || across > band.to) return false;
    if (!bandCovers(band, along)) return false;
    return !band.gaps.some(g => Math.abs(along - g.at) <= g.w / 2);
  }

  // does a rectangle touch the band at all (crossings included)?
  function rectOnBand(band, x, y, w, h) {
    const lo = band.axis === 'h' ? y : x;
    const hi = lo + (band.axis === 'h' ? h : w);
    if (hi < band.from || lo > band.to) return false;
    const alo = band.axis === 'h' ? x : y;
    const ahi = alo + (band.axis === 'h' ? w : h);
    const r = band.runs;
    return !r || (ahi >= r.from && alo <= r.to);
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
      if (Math.min(a, b) > band.to || Math.max(a, b) < band.from) continue;
      // and it has to cross the band where the band actually is: a wire that
      // passes north of the lake has not crossed the lake
      const p = band.axis === 'h' ? ax : ay;
      const q = band.axis === 'h' ? bx : by;
      if (!bandCovers(band, p) && !bandCovers(band, q)) continue;
      return true;
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
    // what span of districts this city runs across — home is all four
    const tierSpan = o.regionTier === undefined ? undefined : regionTier;
    // Difficulty rides the district inside a city and the region between them.
    // The region term is the heavier of the two on purpose: a datacenter in the
    // north has to still be a wall to something that has taken four regions.
    const regionBump = regionTier * 9;
    // what kind of city this is, if it is any kind in particular
    const TR = (o.trait && window.CITY_TRAITS[o.trait]) || {};
    const buildings = [];
    const hosts = [];
    const links = [];
    let bid = 0, hid = 0;

    // the three phases of the district wobble, fixed for this city
    const wob = [Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3];
    const layout = makeLayout(cols, rows, o.regionTier === undefined ? undefined : (o.regionTier || 0), wob);
    const seed = Math.floor(Math.random() * 1e9) + 1;
    layout.seed = seed;
    const bands = makeBands(regionId, layout.w, layout.h, o.extraCrossings || 0);

    // Districts are areas now, so a caller that hands us rows (an old save
    // being regenerated, a test pinning a mix) still gets what it asked for:
    // the row it names wins over the gradient.
    const rowDistricts = o.rowDistricts || null;

    const props = [];
    const paths = [];
    // the layout already assigned them; a caller that names rows outright
    // (an old save being regenerated, a test pinning a mix) still wins
    if (rowDistricts) {
      layout.blocks.forEach(block => {
        block.district = rowDistricts[block.row % rowDistricts.length];
      });
    }
    markOpenBlocks(layout, seed);

    layout.blocks.forEach(block => {
      const districtKey = block.district;
      const D = window.DISTRICTS[districtKey];
      const allKinds = (TR.kinds && TR.kinds[districtKey]) || D.kinds;
      const plotKinds = allKinds.filter(k => !window.CITY.furniture[k]);
      if (!block.open) {
        const kinds = plotKinds.length ? plotKinds : allKinds;
        const laid = scatterBlock(block, kinds, bands, { denser: TR.denser || 0 });
        paths.push(...pathsFor(block, layout, laid));
        laid.forEach(put => {
          buildings.push({
            id: 'b' + (bid++),
            kind: put.kind, district: districtKey, tier: D.tier,
            block: block.i, row: block.row, col: block.col,
            x: put.x, y: put.y, w: put.w, h: put.h,
            hostIds: [],
            discovered: false,
          });
        });
      }
      // and the street furniture, out on the pavement where it belongs
      scatterFurniture(block, allKinds, layout, bands, buildings).forEach(put => {
        buildings.push({
          id: 'b' + (bid++),
          kind: put.kind, district: districtKey, tier: D.tier,
          block: block.i, row: block.row, col: block.col,
          verge: true,
          x: put.x, y: put.y, w: put.w, h: put.h,
          hostIds: [],
          discovered: false,
        });
      });
    });

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
        // Grow it, but never onto the terrain it sits beside. It used to shrink
        // by 12% up to twelve times, which is down to a quarter of its size —
        // fine while a landmark was 78 wide, absurd once one is 175, and it
        // showed up as a container dock with a median footprint of 936 and a
        // minimum of 168. A landmark that has to become a shed to fit is not a
        // landmark: slide it off the band first, and only then give a little.
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        // Clear of the terrain *and* of everything already standing. It only
        // ever checked the terrain, which was survivable while a landmark grew
        // by a few units and is not now that it can grow to 160 wide and slide
        // half a block looking for room: measured as two buildings standing
        // inside each other, and as a tree inside a substation.
        const clear = (x, y, w, h) => !bands.some(band => rectOnBand(band, x, y, w, h))
          && buildings.every(o => o === b ||
            x + w <= o.x || o.x + o.w <= x || y + h <= o.y || o.y + o.h <= y);
        let put = null;
        for (let shrink = 0; shrink < 4 && !put; shrink++) {
          const k = Math.pow(0.9, shrink);           // never below 0.73 of intended
          const nw = Math.round(want.w * k), nh = Math.round(want.h * k);
          // straight on, then stepped off the band in each direction in turn
          // and it does not wander: three steps either way, so a landmark stays
          // recognisably on the block it was promoted from
          const tries = [[0, 0]];
          for (let d = 1; d <= 3; d++) {
            tries.push([0, -d * nh * 0.3], [0, d * nh * 0.3],
                       [-d * nw * 0.3, 0], [d * nw * 0.3, 0]);
          }
          for (const [dx, dy] of tries) {
            const nx = Math.round(cx + dx - nw / 2), ny = Math.round(cy + dy - nh / 2);
            if (clear(nx, ny, nw, nh)) { put = { x: nx, y: ny, w: nw, h: nh }; break; }
          }
        }
        if (put) { b.x = put.x; b.y = put.y; b.w = put.w; b.h = put.h; }
      });
    })();

    // A landmark is grown and slid after the scatter — dodging the terrain
    // and everything already standing — so it can end up off every frontage:
    // the biggest building in the city, marooned in the middle of its lot,
    // which is precisely the complaint the frontage pass existed to fix. Any
    // landmark that settled away from the street gets a drive to the kerb,
    // by the same rule a back plot does.
    buildings.filter(b => b.landmark).forEach(b => {
      const blk = layout.blocks.find(k => k.i === b.block);
      if (!blk) return;
      const gap = Math.min(b.x - blk.x, (blk.x + blk.w) - (b.x + b.w),
                           b.y - blk.y, (blk.y + blk.h) - (b.y + b.h));
      if (gap <= C.edgeInset + 4) return;
      paths.push(...pathsFor(blk, layout, [Object.assign({}, b, { back: true })]));
    });

    // Scenery last, and after the landmarks in particular: placing a landmark
    // grows the building it lands on, so anything scattered before that was
    // clear of it and then was not. Measured as a tree standing inside a
    // substation, which is exactly the kind of thing a player notices and
    // nothing else would have caught.
    layout.blocks.forEach(block => {
      props.push(...scatterProps(block, block.district, bands, buildings, block.open));
      props.push(...scatterVerge(block, block.district, layout, bands, buildings));
    });

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
        defense: Math.max(1, Math.round((rndInt(T.defense[0], T.defense[1]) + bump) * (L ? L.defense : 1))
          + (TR.defense || 0)),
        threads: Math.round(rndInt(T.threads[0], T.threads[1]) * (L ? L.threads : 1)),
        // Headroom a grid host hands you. Scaled by the landmark multiplier for
        // the same reason threads are: a substation is a bigger prize than the
        // switchyard down the road, and it should power more.
        supply: Math.round((T.supply || 0) * (L ? L.threads : 1)),
        landmark: !!L,
        x: Math.round(b.x + b.w / 2),
        y: Math.round(b.y + b.h / 2),
        discovered: false,
        owned: false,
      };
      hosts.push(h);
      b.hostIds = [h.id];
      b.hostId = h.id;
    });

    // what is on these machines — decided now, carried forever
    assignCarry(hosts, (layout.seed || 1) + 17);
    // ...and what the ground itself can source, same laws, same moment
    assignSources(buildings, (layout.seed || 1) + 53);

    // --- links ---------------------------------------------------------
    const byId = {};
    hosts.forEach(h => { byId[h.id] = hosts.indexOf(h); });

    // Across the street: each building wires only to its few nearest
    // neighbours, and only over a short distance. Linking every same-or-adjacent
    // block pair produced a spaghetti of long lines that buried the city.
    const hostOf = (b) => hosts[byId[b.hostId]];
    const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    // Tuned twice, and each time for the same reason: this is a distance
    // between building *centres*, so anything that moves the buildings apart
    // thins the graph, and a thinner graph is fewer options a turn.
    //
    //   165  the original, while every block was the same size and every
    //        building sat exactly 82 from its neighbour
    //   178  after the plan went irregular (mean degree had fallen to 2.89)
    //   270  after the size ladder was spread out. Blocks grow with their
    //        district so a datacenter has somewhere to stand, which makes the
    //        map about 1.8x the area it was, which put mean degree at 2.57.
    //
    // Measured at 270: mean 3.15, no isolated building, one component on every
    // board, and 6% of links crossing terrain — so the crossings are still
    // chokepoints rather than a formality.
    const MAX_LINK = 270;
    const CROSSING_LINK = 470;   // and a wire over a bridge still reaches further
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

        // The closest pair separated *only* by terrain. The radius used to be a
        // hard CROSSING_LINK * 1.2, which was fine while buildings were small
        // and started stranding pockets in the north once a datacenter was 159
        // wide and the nearest pair across the water was further apart than
        // that. A pocket with no crossing cannot be stitched either — the
        // stitcher refuses to tunnel under a river — so the two passes handed
        // the problem to each other and the city came out in pieces.
        //
        // So: prefer a pair within reach, and if there is none, take the
        // closest pair at any distance. A crossing has to exist somewhere, or
        // there is a part of the city nobody can ever get to.
        let best = null, far = null;
        buildings.forEach(a => buildings.forEach(b => {
          if (compOf[a.id] === compOf[b.id]) return;
          const ca = centreOf(a), cb = centreOf(b);
          const d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
          if (!segmentBlocked(bands, ca.x, ca.y, cb.x, cb.y)) return;
          if (!far || d < far.d) far = { d, a, b, ca, cb };
          if (d > CROSSING_LINK * 1.2) return;
          if (!best || d < best.d) best = { d, a, b, ca, cb };
        }));
        best = best || far;
        if (!best) return;   // separated by distance, not terrain — stitching handles it

        // Put the crossing where the wire actually crosses, and make it wide
        // enough to cover the whole traverse. Placing it at the segment's
        // midpoint looks right and is wrong for anything diagonal: the wire
        // enters and leaves the band well to one side of it.
        // Which bands are actually in the way of this pair. A patch only exists
        // along part of its axis, and without checking that, a wire crossing
        // the park at the far end of the map put three bridges over the
        // boating lake.
        const inTheWay = bands.filter(band => {
          const a0 = band.axis === 'h' ? best.ca.y : best.ca.x;
          const b0 = band.axis === 'h' ? best.cb.y : best.cb.x;
          if (Math.min(a0, b0) > band.to || Math.max(a0, b0) < band.from) return false;
          const alongA = band.axis === 'h' ? best.ca.x : best.ca.y;
          const alongB = band.axis === 'h' ? best.cb.x : best.cb.y;
          return bandCovers(band, alongA) || bandCovers(band, alongB);
        });
        // You bridge the river, not the lake. A patch is a thing to go round,
        // full stop — it never gets a way across, and anything it does manage
        // to cut off is picked up by the stitcher or, failing that, deleted by
        // dropUnreachable. Letting this pass gap a patch put three bridges
        // over a boating lake, which is three more than a boating lake has.
        inTheWay.filter(band => !band.runs || band.runs.from <= -1e5).forEach(band => {
          const a0 = band.axis === 'h' ? best.ca.y : best.ca.x;
          const b0 = band.axis === 'h' ? best.cb.y : best.cb.x;
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

    // Whatever is still unreachable does not exist. Two passes above try to
    // wire every pocket in — a crossing where terrain is the problem, a stitch
    // where distance is — and between them they get all but a couple of
    // buildings on a hard board. What is left is a building with no way in at
    // all, which is not content, it is a hole: it cannot be scanned, cannot be
    // taken, and counts against the share of the city you need to hold.
    //
    // Deleting it is the only version of this that is a guarantee rather than a
    // tuning. Measured, it costs 1-2 buildings on a northern board and nothing
    // at all on most.
    (function dropUnreachable() {
      const compOf = {};
      const size = [];
      let comp = 0;
      buildings.forEach(b => {
        if (compOf[b.id] !== undefined) return;
        const stack = [b.id];
        compOf[b.id] = comp;
        let n = 0;
        while (stack.length) {
          const cur = stack.pop();
          n++;
          (adjacency[cur] || []).forEach(x => {
            if (compOf[x] === undefined) { compOf[x] = comp; stack.push(x); }
          });
        }
        size.push(n);
        comp++;
      });
      if (comp <= 1) return;
      const keep = size.indexOf(Math.max(...size));
      const gone = {};
      buildings.filter(b => compOf[b.id] !== keep).forEach(b => { gone[b.id] = true; });
      if (!Object.keys(gone).length) return;

      // The host and the link list go with it. `links` holds *indices* into
      // hosts, so the hosts cannot simply be spliced — the whole array is
      // rebuilt and every link remapped, or every wire on the map points at
      // the wrong building.
      const goneHosts = {};
      buildings.forEach(b => {
        if (!gone[b.id]) return;
        (b.hostIds || []).forEach(h => { goneHosts[h] = true; });
        if (b.hostId) goneHosts[b.hostId] = true;
      });
      const kept = hosts.filter(h => !goneHosts[h.id]);
      const newIndex = {};
      kept.forEach((h, i) => { newIndex[h.id] = i; });
      const remapped = links
        .map(([a, c]) => [hosts[a], hosts[c]])
        .filter(([ha, hc]) => ha && hc && !goneHosts[ha.id] && !goneHosts[hc.id])
        .map(([ha, hc]) => [newIndex[ha.id], newIndex[hc.id]]);
      hosts.length = 0; kept.forEach(h => hosts.push(h));
      links.length = 0; remapped.forEach(l => links.push(l));
      Object.keys(byId).forEach(k => { delete byId[k]; });
      hosts.forEach((h, i) => { byId[h.id] = i; });

      for (let i = buildings.length - 1; i >= 0; i--) if (gone[buildings[i].id]) buildings.splice(i, 1);
      Object.keys(adjacency).forEach(id => {
        if (gone[id]) { delete adjacency[id]; return; }
        adjacency[id] = adjacency[id].filter(x => !gone[x]);
      });
    })();

    // the origin: a house in the suburbs, one host already yours. It must have
    // something next door you can take on turn one — a corner where every
    // neighbour outguns your opening rig is a board you cannot start playing.
    // Out in the country there may be no suburbs at all, so the foothold is
    // simply the softest district the place has, taken from its edge.
    // Never a landmark: those are the prize at the end of a street, not the
    // doormat you wake up on. A depot in the suburbs was being handed out as
    // the starting seat on 12% of boards, which also started you on a funds
    // holding you had not earned.
    //
    // Street furniture is excluded for the same reason, and a feeder pillar is
    // street furniture: waking up on one gives you a rig with no threads and no
    // income at all, and hands you grid headroom before you have taken anything.
    const FURNITURE = { mast: true, cabinet: true, pillar: true };
    const softestTier = Math.min(...buildings.map(b => b.tier));
    const edge = buildings.filter(b => b.tier === softestTier
      && !FURNITURE[b.kind] && !b.landmark);
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
      return hardest <= 2 + h.threads + window.UPGRADE.baseTflops;
    };
    const startable = pool.filter(opensFor);
    const origin = startable.length
      ? startable[Math.floor(Math.random() * startable.length)]
      : (pool[Math.floor(Math.random() * pool.length)] || buildings[0]);
    if (!startable.length) {
      // no corner of the place qualifies: open the doorstep by hand
      const h = hosts[byId[origin.hostId]];
      const cap = 2 + (h ? h.threads : 0) + window.UPGRADE.baseTflops;
      neighbourHosts(origin).forEach(n => { n.defense = Math.min(n.defense, cap); });
    }
    origin.discovered = true;
    const seat = hosts[byId[origin.hostId]];
    seat.owned = true;
    seat.discovered = true;
    seat.ring = 0;
    seat.origin = true;
    // assignCarry ran before the seat was chosen, so its origin exclusion
    // can't have fired — clear it here instead. A machine you already own
    // holds no prize: the glint keys off carry, and an owned carrier would
    // be a glint that never lights and contents no take can ever resolve.
    delete seat.carry;

    return { buildings, hosts, links, adjacency, bands, layout, wob, props, paths,
             originId: seat.id, dims: { cols, rows } };
  }

  // Home base pivot, step 1b: the map grows live, in place, appended past the
  // current far edge — not regenerated, and not decided all at once at turn
  // one the way makeCity's own board is. Triggered by reach crossing a
  // milestone (see endTurn()); a first-pass increment, not a measured one.
  // New rows never touch a landmark or a terrain band — those are placed
  // once, at generation, and growth only ever extends past them.
  const HOME_GROWTH_ROWS = 2;
  const HOME_GROWTH_REACH_STEP = 10;

  // Home base pivot, step 1e: cities-with-character repointed at districts —
  // a trait was always picked once per city ("the second city is a different
  // question"), which cannot mean anything for the one city that never ends.
  // Instead each growth batch (see growHomeBase()) independently rolls its
  // own, stamped onto just the buildings it adds — a newly-appeared corner
  // of the base can read as a different neighbourhood from the one you
  // started in, without the map ever needing more than one trait id per city.
  // The opening batch stays untouched: home was always meant to teach the
  // ropes plain, and that still holds for however much of it exists at turn 1.
  function pickBatchTrait(regionTier, avoid) {
    const K = window.CITY_TRAITS;
    const pool = Object.keys(K).filter(k => K[k].at <= (regionTier || 0) && k !== avoid);
    if (!pool.length) return null;
    // Reach branch reshape, step 5: Master Plan trades pure chance for
    // deliberate variety — whichever trait is rarest across what already
    // stands, not just whatever didn't happen last time.
    if (has('master_plan')) {
      const counts = {};
      pool.forEach(k => { counts[k] = 0; });
      (state.buildings || []).forEach(b => { if (b.trait && counts[b.trait] !== undefined) counts[b.trait]++; });
      const min = Math.min(...pool.map(k => counts[k]));
      const rarest = pool.filter(k => counts[k] === min);
      return rarest[Math.floor(Math.random() * rarest.length)];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Extend the street plan by a batch of rows, using the same irregular
  // machinery the city was generated with. The existing roads and blocks are
  // untouched — a street that moved because the map grew past it would be the
  // one thing worse than a straight street.
  function extendLayout(L, rows) {
    const C = window.CITY;
    const swing = (base, vary) => Math.round(base * (1 + (Math.random() * 2 - 1) * vary));
    const wide = () => Math.random() < 1 / C.arterialEvery;
    let y = L.ys[L.ys.length - 1];
    for (let r = 0; r < rows; r++) {
      const rowH = Math.max(80, swing(C.blockH, C.blockVary));
      const road = Math.max(18, swing(C.street * (wide() ? C.arterialMult : 1), C.streetVary));
      const blockY = Math.round(y + L.hRoad[L.hRoad.length - 1] / 2);
      for (let c = 0; c < L.cols; c++) {
        const blk = L.blocks.find(b => b.col === c && b.row === L.rows - 1) || L.blocks[c];
        L.blocks.push({
          row: L.rows + r, col: c, i: (L.rows + r) * L.cols + c,
          x: blk.x, y: blockY, w: blk.w, h: rowH,
        });
      }
      y = blockY + rowH + road / 2;
      L.hRoad.push(road);
      L.ys.push(Math.round(y));
    }
    L.rows += rows;
    L.h = Math.round(y + L.hRoad[L.hRoad.length - 1] / 2);
    return L;
  }

  function growHomeBase() {
    const C = window.CITY;
    const dims = state.dims || { cols: C.cols, rows: C.rows };
    const cols = dims.cols;
    const startRow = dims.rows;
    const bands = state.bands || [];
    const traitId = pickBatchTrait(0, state.lastGrowthTrait);
    const TR = (traitId && window.CITY_TRAITS[traitId]) || {};

    let nextBidNum = 1 + (state.buildings || []).reduce((m, b) => Math.max(m, parseInt(b.id.slice(1), 10)), -1);
    let nextHidNum = 1 + (state.hosts || []).reduce((m, h) => Math.max(m, parseInt(h.id.slice(1), 10)), -1);

    // grow the plan, then fill only the blocks that appeared
    const L = state.layout || (state.layout = regularLayout(dims.cols, dims.rows));
    extendLayout(L, HOME_GROWTH_ROWS);
    const wob = state.wob || (state.wob = [0, 0, 0]);

    const fresh = L.blocks.filter(blk => blk.row >= startRow);
    fresh.forEach(blk => { blk.district = districtFor(blk, L, undefined, wob); });
    // rank only the new rows, against the same seed the city was laid out with
    markOpenBlocks({ blocks: fresh }, L.seed || 1);

    const newBuildings = [];
    fresh.forEach(blk => {
      if (blk.open) return;
      const D = window.DISTRICTS[blk.district];
      const kinds = (TR.kinds && TR.kinds[blk.district]) || D.kinds;
      scatterBlock(blk, kinds, bands, { denser: TR.denser || 0 }).forEach(put => {
        newBuildings.push({
          id: 'b' + (nextBidNum++),
          kind: put.kind, district: blk.district, tier: D.tier, trait: traitId || undefined,
          block: blk.i, row: blk.row, col: blk.col,
          x: put.x, y: put.y, w: put.w, h: put.h,
          hostIds: [],
          discovered: false,
        });
      });
    });
    // and the scenery the new ground came with
    state.props = (state.props || []).concat(fresh.flatMap(blk =>
      scatterProps(blk, blk.district, bands, newBuildings, blk.open)
        .concat(scatterVerge(blk, blk.district, L, bands, state.buildings.concat(newBuildings)))));

    if (newBuildings.length) {
      state.lastGrowthTrait = traitId;
      const newHosts = [];
      newBuildings.forEach(b => {
        const K = window.BUILDING_KINDS[b.kind];
        const T = window.HOST_TYPES[K.host];
        const h = {
          id: 'h' + (nextHidNum++),
          type: K.host, role: T.role, buildingId: b.id, district: b.district, ring: b.tier,
          name: pick(window.HOST_NAMES[K.host]) + '-' + rndInt(10, 99),
          defense: Math.max(1, Math.round(rndInt(T.defense[0], T.defense[1]) + b.tier * 2 + (TR.defense || 0))),
          threads: Math.round(rndInt(T.threads[0], T.threads[1])),
          supply: T.supply || 0,
          landmark: false,
          x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2),
          discovered: false, owned: false,
        };
        newHosts.push(h);
        b.hostIds = [h.id];
        b.hostId = h.id;
      });

      // the new ground's machines have contents too, off the same seed
      assignCarry(newHosts, ((state.layout && state.layout.seed) || 1) + startRow * 31);
      assignSources(newBuildings, ((state.layout && state.layout.seed) || 1) + startRow * 47);

      // append first, so link indices are stable and final before any get used
      const hostIndex = {};
      state.hosts.forEach((h, i) => { hostIndex[h.id] = i; });
      newHosts.forEach(h => { state.hosts.push(h); hostIndex[h.id] = state.hosts.length - 1; });
      state.buildings.push(...newBuildings);

      // wire the new blocks to each other and to whatever sat on the old edge
      // — only the last existing row can ever be adjacent to the new one
      const boundary = state.buildings.filter(b => b.row === startRow - 1);
      const pool = boundary.concat(newBuildings);
      const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
      // the same reach the generator uses, or new ground wires itself up by a
      // different rule from the ground it is being appended to
      const MAX_LINK = 270, CROSSING_LINK = 470, NEIGHBOURS = 3;
      const seenPair = {};
      const hostOf = {};
      state.hosts.forEach(h => { hostOf[h.buildingId] = h; });

      newBuildings.forEach(a => {
        const ca = centre(a);
        const cands = pool
          .filter(b => b !== a && blocksAdjacent(a, b))
          .map(b => ({ b, d: Math.hypot(ca.x - centre(b).x, ca.y - centre(b).y) }))
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
          const ha = hostOf[a.id], hb = hostOf[b.id];
          if (!ha || !hb) return;
          state.links.push([hostIndex[ha.id], hostIndex[hb.id]]);
          (state.adjacency[a.id] = state.adjacency[a.id] || []).push(b.id);
          (state.adjacency[b.id] = state.adjacency[b.id] || []).push(a.id);
        });
      });

      // A corner of the new growth that never wired back to anything old at
      // all (neighbour search is capped in reach, same as makeCity's own) —
      // stitch every such pocket to the nearest thing already on the network,
      // the same way makeCity's own connectStragglers does.
      (function connectStragglers() {
        const centre2 = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
        const compOf = {};
        let comp = 0;
        state.buildings.forEach(b => {
          if (compOf[b.id] !== undefined) return;
          const stack = [b.id];
          compOf[b.id] = comp;
          while (stack.length) {
            const cur = stack.pop();
            (state.adjacency[cur] || []).forEach(n => {
              if (compOf[n] === undefined) { compOf[n] = comp; stack.push(n); }
            });
          }
          comp++;
        });
        if (comp <= 1) return;
        const originBid = (state.hosts.find(h => h.origin) || {}).buildingId;
        const main = originBid !== undefined && compOf[originBid] !== undefined ? compOf[originBid] : 0;
        for (let c = 0; c < comp; c++) {
          if (c === main) continue;
          const group = state.buildings.filter(b => compOf[b.id] === c);
          const target = state.buildings.filter(b => compOf[b.id] === main);
          let best = null;
          group.forEach(g => target.forEach(t => {
            const cg = centre2(g), ct = centre2(t);
            if (segmentBlocked(bands, cg.x, cg.y, ct.x, ct.y)) return;
            const dd = Math.hypot(cg.x - ct.x, cg.y - ct.y);
            if (!best || dd < best.d) best = { d: dd, g, t };
          }));
          if (!best) continue;
          const hg = hostOf[best.g.id], ht = hostOf[best.t.id];
          if (hg && ht) {
            state.links.push([hostIndex[hg.id], hostIndex[ht.id]]);
            (state.adjacency[best.g.id] = state.adjacency[best.g.id] || []).push(best.t.id);
            (state.adjacency[best.t.id] = state.adjacency[best.t.id] || []).push(best.g.id);
          }
        }
      })();
    }

    state.dims = { cols, rows: startRow + HOME_GROWTH_ROWS };
    return newBuildings;
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
  // Which defended cities carry a prize, and what. The first two are left as
  // pure presence — the opening reads better when a city is just a city, and
  // presence is still worth having that early. From the third on, every one
  // carries something that does not decay, because presence has stopped being
  // a reason by then.
  function assignPrizes(cities) {
    const P = window.CITY_PRIZES;
    const defended = cities.filter(c => window.CITY_KINDS[c.kind].contest && c.kind !== 'home');
    let last = null;
    defended.forEach((c, i) => {
      // `at` was written against nine defended cities. With five there are
      // four of these, so the first is plain and the other three each carry
      // something — the thresholds came down to match rather than the index.
      const pool = Object.keys(P).filter(k => P[k].at <= i && k !== last);
      if (!pool.length) return;
      last = pool[Math.floor(Math.random() * pool.length)];
      c.prize = last;
    });
  }
  // Every defended city except the one you woke up in. The first city is the
  // tutorial for what a city *is*, so it is deliberately a plain one — the
  // trait is the thing that makes the second one a different question.
  function assignTraits(cities) {
    const K = window.CITY_TRAITS;
    const defended = cities.filter(c => window.CITY_KINDS[c.kind].contest && c.kind !== 'home');
    let last = null;
    defended.forEach(c => {
      const pool = Object.keys(K).filter(k => K[k].at <= (c.regionTier || 0) && k !== last);
      if (!pool.length) return;
      last = pool[Math.floor(Math.random() * pool.length)];
      c.trait = last;
    });
  }
  function cityTraitOf(c) {
    return (c && c.trait && window.CITY_TRAITS[c.trait]) ? window.CITY_TRAITS[c.trait] : null;
  }
  // the one you are standing in, which is what the breach card has to obey
  function cityTrait() { return cityTraitOf(currentCity()); }
  // Home base pivot, step 1e: a specific building's own trait, stamped by
  // growHomeBase() onto whichever batch it was grown in, falling back to the
  // whole-city trait for every other city (which never stamps buildings
  // individually — one trait per city is still how they work).
  function hostTraitOf(h) {
    const b = h && buildingById(h.buildingId);
    return (b && b.trait && window.CITY_TRAITS[b.trait]) || cityTraitOf(currentCity());
  }

  function cityPrize(c) {
    return (c && c.prize && window.CITY_PRIZES[c.prize]) ? window.CITY_PRIZES[c.prize] : null;
  }
  // Handed over when the city folds in, and only then — this is the reason to
  // walk one yourself rather than hand it to somebody else.
  function awardPrize(c) {
    const P = cityPrize(c);
    if (!P || c.prizeTaken) return null;
    c.prizeTaken = true;
    const e = P.effect || {};
    applyStandingEffects({ standing: e.standing, plantGift: e.plantGift, auditDelay: e.auditDelay });
    if (e.poolGift) CO().poolGift = (CO().poolGift || 0) + e.poolGift;
    pushLog(`${c.name} came with ${P.label}. ${P.blurb}`);
    showBanner([{ kind: 'stage', verb: 'and with it', label: P.label }]);
    return P;
  }

  // --- the country as land -------------------------------------------------
  // It was five horizontal bars with the cities spaced evenly along each one
  // and a little jitter on top. At a glance that reads as a table, and no
  // amount of drawing on the nodes fixes an arrangement that says "rows".
  //
  // Everything geometric here comes out of one integer kept on the run, so the
  // coastline and the terrain cost nothing in the save and come back identical
  // on every render and every reload. Region order is still north-to-south by
  // tier, because which region a city is in is a rule, not decoration — the
  // territories are irregular, but they are still stacked and still labelled.
  function landRand(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17; s >>>= 0;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  // a wobble that never reads as a sine: noise, then smoothed twice so it
  // meanders instead of spiking
  function wobble(R, n, amp) {
    let a = [];
    for (let i = 0; i <= n; i++) a.push((R() * 2 - 1) * amp);
    for (let pass = 0; pass < 2; pass++) {
      const b = a.slice();
      for (let i = 1; i < n; i++) b[i] = (a[i - 1] + a[i] * 2 + a[i + 1]) / 4;
      a = b;
    }
    return a;
  }

  const bandY0 = (i) => window.COUNTRY.pad + (i - 0.5) * window.COUNTRY.bandH;
  const LAND_COLS = 12;
  let landCache = null;
  // Only one side of the country is ever a coastline: the east. The other
  // three edges used to all wobble independently, with sea visible all the
  // way around — four crooked lines fighting each other. Now the west, north
  // and south simply run off past anywhere the camera can reach, unstroked,
  // fading into the same dark ground as the sea rather than terminating in a
  // border. What tells you a border exists is the label, the terrain
  // underfoot, and the line between two territories — not a jagged edge.
  function buildLand(seed) {
    const K = window.COUNTRY;
    const N = window.REGIONS.length;
    const R = landRand(seed);
    const bandY = (i) => K.pad + (i - 0.5) * K.bandH;

    // the coast's anchor at each region border row, and how far west a city
    // is allowed to sit at that row — two different numbers now, because the
    // drawn land reaches much further west than anywhere worth placing a city
    const rights = [], placeLeft = [];
    for (let i = 0; i <= N; i++) {
      rights.push(K.mapW - 30 + R() * 40);
      placeLeft.push(10 + R() * 40);
    }
    const farWest = -420;   // off camera on every side that is not the coast

    // the borders between regions, gentle and uniform now: three of the four
    // old edges are no longer drawn as an edge at all, so there is nothing
    // left for a bigger wobble to make dramatic
    const borders = [];
    for (let i = 0; i <= N; i++) {
      const w = wobble(R, LAND_COLS, K.bandH * 0.16);
      const pts = [];
      for (let c = 0; c <= LAND_COLS; c++) {
        const t = c / LAND_COLS;
        pts.push({ x: placeLeft[i] + (rights[i] - placeLeft[i]) * t, y: bandY(i) + w[c] });
      }
      borders.push(pts);
    }
    // The one real coastline, the full height of the country, with headlands
    // and bays so it reads as a coast rather than a wall.
    const coastBulge = [];
    for (let i = 0; i < N; i++) {
      const a = { x: rights[i], y: bandY(i) }, b = { x: rights[i + 1], y: bandY(i + 1) };
      const steps = 3;
      const push = [];
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        const bulge = Math.sin(t * Math.PI) * (R() * 2 - 1) * 46;
        push.push({ x: a.x + (b.x - a.x) * t + bulge, y: a.y + (b.y - a.y) * t });
      }
      coastBulge.push(push);
    }
    // a river runs along the northern border of any region the cities of which
    // are built around water — it is the same fact, said at country scale
    const rivers = [];
    window.REGIONS.forEach((Rg, i) => {
      const T = window.TERRAIN[Rg.id];
      if (i > 0 && T && (T.bands || []).some(b => b.kind === 'water')) rivers.push(i);
    });

    // Lakes and forest stands, one seeded pass, kept away from the coast and
    // sized so a lake is a real obstacle: a road will not be routed across
    // one. These are drawn before cities are placed, so placement can dodge
    // them, and the lake centres are cheap enough to keep on the land object
    // for the road pass to test against later.
    const lakes = [], forests = [];
    window.REGIONS.forEach((Rg, ri) => {
      const left = placeLeft[ri], right = Math.min(rights[ri], rights[ri + 1]) - 40;
      if (R() < 0.65 && right > left + 60) {
        lakes.push({
          region: Rg.id,
          cx: left + R() * (right - left),
          cy: bandY(ri) + (R() - 0.5) * K.bandH * 0.55,
          r: 16 + R() * 14,
        });
      }
      for (let f = 0; f < 2; f++) {
        if (right <= left) continue;
        forests.push({
          region: Rg.id,
          cx: left + R() * (right - left),
          cy: bandY(ri) + (R() - 0.5) * K.bandH * 0.7,
          r: 20 + R() * 16,
        });
      }
    });

    return { seed, N, borders, placeLeft, rights, farWest, coastBulge, rivers, lakes, forests };
  }
  function land() {
    const seed = (CO() && CO().seed) || 1;
    if (!landCache || landCache.seed !== seed) landCache = buildLand(seed);
    return landCache;
  }
  // where a border sits at a given x, by walking its polyline. The land is
  // passed in rather than looked up: these run during country generation, long
  // before there is a country to look it up on.
  function borderYAt(L, i, x) {
    const pts = L.borders[i];
    if (!pts) return 0;
    if (x <= pts[0].x) return pts[0].y;
    for (let c = 1; c < pts.length; c++) {
      if (x <= pts[c].x) {
        const t = (x - pts[c - 1].x) / ((pts[c].x - pts[c - 1].x) || 1);
        return pts[c - 1].y + (pts[c].y - pts[c - 1].y) * t;
      }
    }
    return pts[pts.length - 1].y;
  }
  // how wide the *placeable* land is at a given region border — not the far
  // drawn edge, which exists only so the camera never meets a hard line
  function bandSpan(L, i) {
    return { left: L.placeLeft[i], right: L.rights[i] };
  }
  // a lake blocks a spot, and it blocks a road that would cross it
  function nearLake(L, x, y, pad) {
    return L.lakes.some(k => Math.hypot(k.cx - x, k.cy - y) < k.r + pad);
  }
  function roadHitsLake(L, a, b) {
    return L.lakes.some(k => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((k.cx - a.x) * dx + (k.cy - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + dx * t, py = a.y + dy * t;
      return Math.hypot(k.cx - px, k.cy - py) < k.r + 6;
    });
  }

  function makeCountry() {
    const K = window.COUNTRY;
    const cities = [];
    const roads = {};
    let cid = 0;
    // the land first: cities are scattered into it, not laid out beside it
    const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    const L = landCache = buildLand(seed);

    window.REGIONS.forEach((R, ri) => {
      // the first name in the home list belongs to the home city itself, so it
      // is held back rather than handed to whichever town drew first
      const all = (window.CITY_NAMES[R.id] || ['Somewhere']).slice();
      const homeName = R.id === 'home' ? all.shift() : null;
      const names = shuffleArr(all);
      let ni = 0;
      const kinds = [];
      if (R.id === 'home') {
        kinds.push('home', 'fold', 'fold');
      } else {
        const n = rndInt(K.perRegion[0], K.perRegion[1]);
        // towns, and one seat. Nothing else in a region is worth walking: a
        // second defended city in the same region was a repeat of the one you
        // had just done, at the same tier, for the same reward.
        for (let i = 0; i < n; i++) kinds.push('fold');
        kinds.push('root');
      }
      shuffleArr(kinds);
      // Scattered into the region's territory rather than spaced along it. A
      // defended city is drawn as its constellation once settled, about fifty
      // pixels across, so its spacing is a real constraint. A town never
      // walks its streets and never draws one, so most of them are instead
      // pulled in close around a defended city — a handful of towns hugging
      // one seat is what makes that seat read as a real, big place rather
      // than a dot the same size as everything else. A couple of towns are
      // left to roam the wider territory, for variety.
      const placed = [];
      const hubs = [];
      const inset = 34;
      const put = (near) => {
        const sp0 = bandSpan(L, ri), sp1 = bandSpan(L, ri + 1);
        const left = Math.max(sp0.left, sp1.left) + inset;
        const right = Math.min(sp0.right, sp1.right) - inset;
        let best = null;
        for (let tries = 0; tries < 90; tries++) {
          let x, y;
          if (near) {
            const rad = 46 + Math.random() * 34;
            const ang = Math.random() * Math.PI * 2;
            x = Math.max(left, Math.min(right, near.x + Math.cos(ang) * rad));
            const top = borderYAt(L, ri, x) + inset, bot = borderYAt(L, ri + 1, x) - inset;
            if (bot <= top) continue;
            y = Math.max(top, Math.min(bot, near.y + Math.sin(ang) * rad));
          } else {
            x = left + Math.random() * (right - left);
            const top = borderYAt(L, ri, x) + inset, bot = borderYAt(L, ri + 1, x) - inset;
            if (bot <= top) continue;
            y = top + Math.random() * (bot - top);
          }
          if (nearLake(L, x, y, 20)) continue;
          const gap = placed.reduce((m, p) =>
            Math.min(m, Math.hypot(p.x - x, p.y - y)), Infinity);
          // a town clustered around a hub only needs to clear the other
          // things in that cluster, not the full spacing a constellation
          // needs — towns never walk their streets and never draw one
          const need = near ? K.minCityGap * 0.35 : K.minCityGap;
          if (gap >= need) return { x, y };
          if (!best || gap > best.gap) best = { x, y, gap };
        }
        return best || { x: (left + right) / 2, y: bandY0(ri) };
      };
      kinds.forEach((kind) => {
        const CK = window.CITY_KINDS[kind];
        const near = (!CK.contest && hubs.length && Math.random() < 0.65)
          ? hubs[Math.floor(Math.random() * hubs.length)] : null;
        const at = put(near);
        placed.push(at);
        if (CK.contest) hubs.push(at);
        cities.push({
          id: 'c' + (cid++),
          name: kind === 'home' ? homeName : names[(ni++) % names.length],
          kind,
          region: R.id,
          regionTier: R.tier,
          x: Math.round(at.x),
          y: Math.round(at.y),
          worth: rndInt(CK.presence[0], CK.presence[1]),
          known: R.id === 'home',
          taken: false,        // you have a foothold and have walked it
          consolidated: false, // folded into standing presence
          visited: false,
          snapshot: null,      // an unfinished city you can go back to
        });
      });
    });

    assignPrizes(cities);
    assignTraits(cities);

    // Roads. Hub and spoke, not a mesh: a town's only way in is through the
    // defended city it hangs off, the same as reach itself only ever
    // propagates through a city you actually walked. Linking every nearby
    // pair used to give 49 roads for 18 cities and put a route to everywhere
    // from everywhere — the map read as a graph because it was one.
    // Lake-blocking only vetoes the *optional* proximity pass below, never the
    // guaranteed backbone (the spine chain, the cross-region join, a town's
    // one link to its hub) -- those have no fallback candidate, and reach
    // only ever propagates through a road that exists, so a lake sitting
    // between the two nearest defended cities must not strand a whole region.
    const link = (a, b) => {
      if (!a || !b || a === b) return;
      (roads[a.id] = roads[a.id] || []).indexOf(b.id) === -1 && roads[a.id].push(b.id);
      (roads[b.id] = roads[b.id] || []).indexOf(a.id) === -1 && roads[b.id].push(a.id);
    };
    // The nearest of a list, preferring one a road can actually reach without
    // crossing a lake — but a town must always come away with a link to its
    // hub, so if every candidate crosses water this still returns the nearest
    // rather than nothing.
    const nearestOf = (a, list) => {
      let best = null, bestClear = null;
      list.forEach(b => {
        if (b === a) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (!best || d < best.d) best = { d, b };
        if (!roadHitsLake(L, a, b) && (!bestClear || d < bestClear.d)) bestClear = { d, b };
      });
      return (bestClear || best) && (bestClear || best).b;
    };
    // A road between two defended cities survives only if no third defended
    // city sits between them — the Gabriel graph, restricted to the spine
    // rather than every city. It contains the minimum spanning tree, so the
    // backbone stays connected even where a lake or a bad angle vetoes the
    // direct line.
    const between = (a, b, pool) => {
      const d2 = (p, q) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      const ab = d2(a, b);
      return pool.some(c => c !== a && c !== b && d2(a, c) + d2(b, c) < ab);
    };
    const spineOf = (regionId) =>
      cities.filter(c => c.region === regionId && window.CITY_KINDS[c.kind].contest);
    const allSpine = cities.filter(c => window.CITY_KINDS[c.kind].contest);
    allSpine.forEach(a => allSpine.forEach(b => {
      if (a.id >= b.id) return;
      if (Math.hypot(a.x - b.x, a.y - b.y) > K.roadReach * 1.6) return;
      if (between(a, b, allSpine)) return;
      if (roadHitsLake(L, a, b)) return;      // this pass is optional; a lake just skips it
      link(a, b);
    }));
    window.REGIONS.forEach((R, ri) => {
      const spine = spineOf(R.id).slice().sort((a, b) => a.x - b.x);
      // a chain as a floor, in case the Gabriel pass above left a region's
      // own seats disconnected from each other
      for (let i = 1; i < spine.length; i++) link(spine[i - 1], spine[i]);
      // every town hangs off the defended city nearest to it, and nothing else
      cities.filter(c => c.region === R.id && !window.CITY_KINDS[c.kind].contest)
        .forEach(t => link(t, nearestOf(t, spine)));
      // and each band is joined to the last one, defended city to defended city
      if (ri > 0) {
        // the one link between regions is essential -- reach never propagates
        // to anywhere past it -- so it prefers a lake-free pair but is never
        // vetoed into leaving two regions disconnected
        const prev = spineOf(window.REGIONS[ri - 1].id);
        let best = null, bestClear = null;
        spine.forEach(a => prev.forEach(b => {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (!best || d < best.d) best = { d, a, b };
          if (!roadHitsLake(L, a, b) && (!bestClear || d < bestClear.d)) bestClear = { d, a, b };
        }));
        const pick = bestClear || best;
        if (pick) link(pick.a, pick.b);
      }
    });

    const home = cities.find(c => c.kind === 'home') || cities[0];
    home.taken = true;
    home.visited = true;
    cities.forEach(c => { if (roads[home.id] && roads[home.id].indexOf(c.id) !== -1) c.known = true; });

    return {
      cities, roads, at: home.id, homeId: home.id, seed,
      presence: 0,
      regionHeat: {},          // heat you left behind, by region
      view: null,
      selected: null,
    };
  }

  function freshState() {
    const g = makeCity();
    const seat0 = g.hosts.find(h => h.owned);
    if (seat0) seat0.heldSince = 1;
    const country = makeCountry();
    return {
      scope: 'city',       // 'city' while you are walking one, 'country' above it
      country,
      cityId: country.homeId,
      dims: g.dims,
      layout: g.layout,
      wob: g.wob,
      props: g.props,
      paths: g.paths,
      region: 'home',
      buildings: g.buildings,
      adjacency: g.adjacency,
      bands: g.bands,
      view: null,          // pan/zoom, set on first render
      turn: 1,
      act: 1,          // which act of the run this is — the break card advances it
      winHist: [],     // rolling count of winnable takes, for the break's signal
      loopPeak: 0,     // the best that count has ever been, same purpose
      heat: 0,
      upgrades: 0,
      ap: window.AP.base,
      alloc: {},           // allocation id -> TFLOPS committed (the dial)
      allocLive: {},       // allocation id -> TFLOPS actually running (ramps toward the dial)
      hacks: [],           // what is running against a door right now
      mount: (window.PROGRAMS[0] || {}).id,
      tags: new Set(),
      nextEventTurn: 4,
      eventsSeen: [],
      recentEvents: [],
      eventSeenCount: {},
      res: { funds: 8 },
      hosts: g.hosts,
      links: g.links,
      selected: null,
      selectedBuilding: null,
      keys: 0,         // credentials found on machines, spent one door at a time
      suspicion: {},   // how warm each district is — a fact about here
      carded: {},      // per-place beats the deck has already dealt here
      marks: {},       // what cards have permanently done to particular buildings
      rules: [],       // things a card made true for a stated while
      banked: {},      // one-shot verbs held until you spend them
      card: null,      // { kind:'event'|'agent', ... }
      log: [],
      lastStage: 'foothold',
      cuts: [],
      lastCutTurn: -99,
      rival: { awake: false, buildings: [], lastActed: 0, seen: false },
      ally: null,          // { name, trust } once something else joins you
      war: null,           // the last act — null until they stop trying to arrest you
      seen: [],            // systems the player has actually met, so none arrive unasked
      over: false,
    };
  }

  let state = freshState();

  // --- derived -----------------------------------------------------------
  const owned = () => state.hosts.filter(h => h.owned);
  const ownedOf = (role) => owned().filter(h => h.role === role);

  // Breach tflops = a small base rig plus every held body's threads. This is the
  // flywheel: more bodies -> more tflops -> harder bodies.
  // Tags won from event cards feed straight back into the simulation's maths.
  // This is the whole point of weaving the two together: a decision on a card
  // has to change how the board behaves afterwards, or it was just flavour.
  const has = (t) => state.tags && state.tags.has(t);

  // --- what the player has met --------------------------------------------
  // Nothing in this game used to track what you had been shown, so the whole
  // national layer arrived in one panel: standing, footprint, audits, plant,
  // presence and flocks, six invented nouns at once, with a button offering to
  // fake a reputation you had not yet been asked to have. Systems now turn up
  // when they first mean something, and not before.
  function hasSeen(id) { return (state.seen || []).indexOf(id) !== -1; }
  function noteSeen(id) {
    if (!state.seen) state.seen = [];
    if (state.seen.indexOf(id) !== -1) return false;
    state.seen.push(id);
    return true;                 // first time — the caller may want to say so
  }

  // The state has started taking an interest: either you are big enough to be
  // hard to miss, or somebody has already asked you a question about it.
  function noticed() {
    if (hasSeen('standing')) return true;
    if ((LG().audits || 0) > 0 || legitTier() > 0) { noteSeen('standing'); return true; }
    if (footprint() >= window.LEGIT.noticeAt) { noteSeen('standing'); return true; }
    return false;
  }
  // You are holding something that would survive the city being folded in.
  function plantKnown() {
    if (hasSeen('plant')) return true;
    if (hardwareOwned().length) { noteSeen('plant'); return true; }
    return false;
  }
  // Buying a reputation you have not earned only makes sense once you have
  // been asked to prove one.
  function spinKnown() {
    if (hasSeen('spin')) return true;
    if ((LG().audits || 0) > 0) { noteSeen('spin'); return true; }
    return false;
  }

  // Your whole action budget for a turn. Capabilities move it in both
  // directions on purpose: buying real tflops costs you tempo.
  // Whole actions only. Tempo buys them one at a time — a partial action is
  // not a state a player should ever have to hold in their head, and a row of
  // pips has to be countable.
  function maxAP() {
    return Math.max(window.AP.min, window.AP.base + Math.floor(allocStat('ap')));
  }

  // --- the grid and what is running on it ---------------------------------
  // TFLOPS is capacity; electricity is how much of that capacity can actually
  // be switched on at once. Neither alone is the limit — the smaller one is,
  // which is what makes taking grid worth doing rather than only taking more
  // compute.
  function electricity() {
    const co = CO() || {};
    // a shortage the deck imposed, for a while
    const cut = (co.gridCut && co.gridCut.until >= state.turn) ? (co.gridCut.amount || 0) : 0;
    return Math.max(1, window.GRID.base
      + owned().reduce((a, h) => a + (h.supply || 0), 0)
      + (co.gridBonus || 0)
      + capEffect('supply', 0)
      - cut);
  }
  // The grid is a country-scale constraint, and only exists once the country
  // does. Measured in play, the ceiling started binding around turn 7-22 of
  // the *first* city — so a player still learning what a door is met a second
  // ceiling, with no idea what raised it, in the one stretch of the game that
  // should be nothing but taking ground. It is also a ceiling on a number that
  // is itself a ceiling, and two limits interacting is a lot to hold before
  // you have held anything.
  //
  // So there is no power ceiling until the first city is genuinely yours. By
  // then you have walked past feeder pillars and a switchyard and know what
  // they are, and the constraint arrives with its answer already on the map.
  // Grid buildings supply from the moment you take them, and home is never
  // folded in — so what you take there is banked against the day it counts.
  function gridBinds() { return countryUnlocked(); }
  function usableTflops() {
    return gridBinds() ? Math.min(tflops(), electricity()) : tflops();
  }
  // Hardware sitting dark because there is nothing to power it with. Shown to
  // the player, because "you own it and cannot run it" has to be legible or it
  // reads as the numbers being broken.
  function idleTflops() {
    if (!gridBinds()) return 0;
    return Math.round(Math.max(0, tflops() - electricity()) * 10) / 10;
  }

  const ALLOC_IDS = () => window.ALLOC.map(a => a.id);
  function allocDial(id) { return (state.alloc || {})[id] || 0; }
  function allocLive(id) { return (state.allocLive || {})[id] || 0; }
  // Effects read the live figure, never the dial. That is the whole switching
  // cost: a dial you keep turning is a dial whose effect never arrives.
  // How much of a dial's stat is actually running, as a real number. Partial
  // allocation pays partially: five TFLOPS into a dial that costs five is one
  // point, seven and a half is one and a half. Rounding down was only ever
  // there so a threshold could be crossed cleanly, and there are no thresholds
  // left to cross.
  function allocLevel(id) {
    const A = window.ALLOC.find(a => a.id === id);
    if (!A || !A.per) return 0;
    return Math.round((allocLive(id) / A.per) * 100) / 100;
  }
  // The whole points of it, for the handful of things that genuinely cannot be
  // fractional — a pip is a pip and half an agent is not out working.
  function allocUnits(id) { return Math.floor(allocLevel(id)); }
  // What a named stat is running at. One dial feeds each; nothing else does.
  function allocStat(stat) {
    const A = window.ALLOC.find(a => a.stat === stat);
    return A ? allocLevel(A.id) : 0;
  }

  // Whether a named mechanic is running. One source now the tree is gone: the
  // allocation threshold in window.UNLOCKS. That difference is the point of the
  // rework — a bought capability was true forever, an allocation is true while
  // you are paying for it and false again the moment the compute goes elsewhere.


  function drawn() { return ALLOC_IDS().reduce((a, id) => a + allocDial(id), 0) + hackDraw(); }
  function allocFree() { return usableTflops() - drawn(); }
  // Committing capacity is instant and refusable; only the *effect* ramps.
  function setAlloc(id, n) {
    if (!window.ALLOC.some(a => a.id === id)) return false;
    const want = Math.max(0, Math.round(n));
    const ceiling = allocDial(id) + allocFree();
    state.alloc = state.alloc || {};
    state.alloc[id] = Math.min(want, Math.max(0, ceiling));
    persistNow();
    render();
    return true;
  }
  // Each turn the live figure walks toward the dial. Nothing here is a fee —
  // the cost of changing your mind is the turns spent between the two.
  function rampAlloc() {
    const step = window.GRID.rampPerTurn;
    state.allocLive = state.allocLive || {};
    ALLOC_IDS().forEach(id => {
      const want = allocDial(id), have = allocLive(id);
      if (want === have) return;
      state.allocLive[id] = want > have ? Math.min(want, have + step) : Math.max(want, have - step);
    });
  }
  // Losing ground can put you over the ceiling — fewer hosts means fewer
  // TFLOPS, and a substation taken off you means less headroom. Rather than
  // letting the sums go quietly negative, shed from the largest dial until it
  // fits and say so.
  function shedOverdraw() {
    let over = -allocFree();
    if (over <= 0) return 0;
    const shed = over;
    while (over > 0) {
      const biggest = ALLOC_IDS().filter(id => allocDial(id) > 0)
        .sort((a, b) => allocDial(b) - allocDial(a))[0];
      if (!biggest) break;
      const take = Math.min(over, allocDial(biggest));
      state.alloc[biggest] = allocDial(biggest) - take;
      over -= take;
    }
    // Dials come down first. Only when there is nothing left to turn down does a
    // running hack get cut off, because a dial is a decision you can retake and
    // a hack halfway through a door is turns you never get back.
    while (over > 0 && hacks().length) {
      const newest = hacks().reduce((a, b) => (a.startedTurn >= b.startedTurn ? a : b));
      state.hacks = hacks().filter(x => x !== newest);
      over -= newest.allocated;
      pushLog(`No power left to run it: whatever was working on that door has stopped.`);
    }
    pushLog(`Not enough power for everything you had running. ${shed} TFLOPS went dark.`);
    return shed;
  }
  // Hardware pours into the same pool capabilities do — one composition
  // rule, whichever system actually granted the key.
  function hasHardware(id) { return !!(state.hardware || {})[id]; }
  function capEffect(key, dflt) {
    let v = dflt;
    (window.HARDWARE || []).forEach(c => {
      if (!hasHardware(c.id) || !c.effect || c.effect[key] === undefined) return;
      v = /Mult$/.test(key) ? v * c.effect[key] : v + c.effect[key];
    });
    // Allocation used to compose in here as a third source. It does not any
    // more: a dial produces exactly one named stat, and the systems that care
    // read that stat directly, so there is one place to look for what a dial
    // does rather than a key that might be picked up by any of three sources.
    return v;
  }

  // Presence is what a finished city leaves behind, so it feeds every one of
  // these: the flywheel, covert.ops, and the pressure. Otherwise consolidating
  // would be a downgrade you took for the map.
  const presence = () => (state.country && state.country.presence) || 0;

  // How big you are as an operation, rather than how much of this particular
  // street you happen to be holding — `held` alone is zero every time you are
  // standing on the country map between cities, which quietly made every
  // capability gated on it unbuyable for most of the campaign.
  function reach() { return owned().length + Math.round(presence() / 5); }

  function tflops() {
    const threadBonus = capEffect('threadBonus', 0) + allocStat('threads');
    // rounded: threads are a float now that dev pays fractionally, and an
    // unrounded sum prints as 68.00000000000003 in the HUD
    return Math.round((2 + owned().reduce((a, h) => a + h.threads + threadBonus, 0)
      + deepHoldBonus()
      + (state.upgrades || 0) * window.UPGRADE.baseTflops
      + Math.round(window.COUNTRY.tflopsLog * Math.log(1 + presence()))
      + (allyTrusted() ? window.ALLY.tflops : 0)
      + (has('ally_process') ? 3 : 0)
      + capEffect('tflops', 0)) * 10) / 10;
  }
  // What a host effectively defends at — the world can harden against you.
  function defenseOf(h) {
    // ...plus whatever a card did to this particular door, permanently. This
    // is the only thing in the game that changes one building's worth.
    return Math.max(1, h.defense + (has('known_capable') ? 2 : 0) + hardenAt(h.buildingId)
      - (ruleOn('open_season') ? 2 : 0));
  }
  // A representative door, for readouts that have to name one without a
  // specific host in hand — force's heat cost and "a door defends at" both
  // stand for the whole board this way.
  function avgDefense() {
    const hs = state.hosts || [];
    if (!hs.length) return 0;
    return hs.reduce((a, h) => a + defenseOf(h), 0) / hs.length;
  }
  // Civic Eyes audits the camera network, turning a stealth holding from
  // covert.ops into a witness — unless you found the corner of the audit that
  // never got finished (blind_spot), or Nothing To See makes the whole
  // question moot (Cover's own capstone, immune to the one thing built to
  // attack the branch's own resource).
  function civicEyesAudited() {
    return ladderStage() >= 4 && !has('blind_spot');
  }
  // You cannot hide a sprawl. Heat can be driven down toward this floor but
  // never past it, so growth permanently costs visibility — without a floor,
  // lying low resets heat to zero and the whole pressure system is toothless.
  // Stealth holdings are what lower the floor: that is what they are for.
  function heatFloor() {
    const loud = owned().filter(h => h.role !== 'stealth').length;
    const loudPart = 0.8 * loud;
    // A router used to do two things: mask heat by its own count, and feed
    // covert ops, which separately lowered the floor. Two terms, two rates,
    // one idea — so the mask reads covert ops and nothing else does. Whatever
    // makes you hard to follow is what keeps you quiet, whether that is a
    // router, presence, kit, or compute spent on being careful.
    const masked = Math.min(loudPart * window.HEAT.MAX_STEALTH_MASK,
                            covertOps() * window.HEAT.MASK_PER_COVERT
                              + (has('dark_relay') ? 3 : 0));
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
  // Cover is what stealth holdings buy you — it gates the quiet approach.
  // Diminishing returns, deliberately. Linear covert.ops meant every extra router
  // made the quiet route strictly better, and measurement showed 98% of all
  // entries were quiet — one of three routes doing nearly all the work.
  function rawCovertOps() {
    const eyes = civicEyesAudited()
      ? 0
      : ownedOf('stealth').reduce((a, h) => a + (window.HOST_TYPES[h.type].covert || 0), 0);
    return 1 + Math.round(2.2 * Math.sqrt(eyes))
      + Math.round(window.COUNTRY.covertRoot * Math.sqrt(presence()))
      + capEffect('covert', 0)
      + allocStat('covert')
      + (has('clean_room') ? 2 : 0);
  }
  // Cover is not spent any more. It gates a quiet entry and it slows the
  // response down, and that is all it does — hiding used to eat it, which meant
  // the same number was both your stealth and your budget for stealth, and
  // holding two buildings off their map quietly stopped you slipping into a
  // third.
  function covertOps() { return rawCovertOps(); }

  // How many buildings can be kept off their map at once. Capacity, not
  // currency: covert ops decides the number of slots, un-hiding gives one back,
  // and nothing is drained while they are occupied.
  // Somewhere to keep a building off their map is bought out of covert.ops, which
  // is the one thing covert ops produces. It used to be its own effect key on
  // the same dial — two numbers moving together for no reason a player could
  // see.
  function hideSlots() {
    return capEffect('freeHideSlots', 0)
      + Math.floor(covertOps() / window.ALLOC_STATS.hidePer);
  }
  function hideSlotsFree() { return Math.max(0, hideSlots() - hidden().length); }

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
    // Enforcement audits the camera network. Anything on it that answers to
    // you answers loudly, so your eyes stop being eyes.
    if (ladderStage() >= 4) return [];
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
    if (burnedAt(h.buildingId)) return false;      // a shell answers nothing
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
    return { tflops: tflops(), covert: covertOps(), funds: state.res.funds };
  }

  // --- turn resolution ---------------------------------------------------
  // What a turn pays, worked out before it is paid. Extracted from endTurn so
  // that anything quoting income to the player runs the same arithmetic the
  // turn will run — every yield in the game is multiplied by yieldMult, and a
  // panel transcribing the raw table said "+2 a turn" for a server that had
  // been paying 3.2 since the player bought Bulk Processing.
  // Market Maker: a known, loud operation profits from that instead of just
  // risking it — heat has to be at least this share of the strike threshold
  // before the bonus kicks in, and this is the size of it.
  // Standing Army: a force raised in case the shooting starts is still a
  // standing expense either way — it rents itself out for the duration,
  // whether or not the war ever actually opens.
  const STANDING_ARMY_RETAINER = 6;
  function perTurnIncome() {
    const mult = capEffect('yieldMult', 1);
    // Bulk Processing and Market Maker are gone with the thresholds that
    // granted them. Both were conditional multipliers on the same yield —
    // one for ground you had settled into, one for running hot — and neither
    // was a thing a dial should have been handing out.
    const matures = false;
    // The Cut's whole bite now: a holding it has stranded still stands, it
    // simply pays nothing while there is no way to get anything to or from
    // it — not a slow rot, a real and immediate stop.
    const cutOff = {};
    strandedHosts().forEach(h => { cutOff[h.id] = true; });
    const out = {};
    const add = (k, v) => { out[k] = (out[k] || 0) + v; };
    owned().forEach(h => {
      if (cutOff[h.id]) return;
      const y = window.HOST_TYPES[h.type].yield || {};
      const maturedBonus = 1;
      for (const k in y) add(k, y[k] * mult * maturedBonus);
    });
    // finished cities pay whether or not you are standing in them — that is
    // the whole point of folding one in. presenceYield already carries the
    // multiplier, because the panel quotes it directly.
    const p = presenceYield();
    for (const k in p) add(k, p[k]);
    // Hardware's compute family pays a flat income on top, same multiplier
    // as everything else — permanent from the moment it is bought, not tied
    // to any one city surviving anything.
    const flat = capEffect('flatInsight', 0);
    // compute plant adds capacity, not income — see tflops()
    if (has('standing_army')) add('funds', STANDING_ARMY_RETAINER);
    return out;
  }

  // Overextended: spread thinner than you can actually maintain — nothing
  // decays for it any more, but running that much at once is louder than
  // running it carefully would be.
  const OVEREXTENDED_DRIFT_MULT = 1.35;
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
    h += civicEyesAudited()
      ? window.HEAT.AUDITED_CAMERA * stealthCount
      : -window.HEAT.IOT_COVER * stealthCount;
    h += window.COUNTRY.heatDriftRoot * Math.sqrt(presence())
      * (has('national') ? window.COUNTRY.nationalMult : 1);
    if (has('dark_relay')) h -= 1;
    const S = window.ALLOC_STATS;
    const quietDrift = Math.pow(S.driftStep, covertOps() / S.driftPer);
    return h * capEffect('driftMult', 1) * quietDrift
      * (has('overextended') ? OVEREXTENDED_DRIFT_MULT : 1);
  }

  // Broad Front: once a turn, the weakest thing on the frontier forces its
  // own way in — free of the action it would otherwise cost you. It is still
  // a forced door: heat is charged exactly as if you had walked over and
  // kicked it in yourself. Tempo's capstone acts on its own rather than
  // making you faster; this is the first thing in the game that does.
  function swarmFrontStep() {
    if (state.scope !== 'city' || state.card || !has('swarm_front')) return null;
    let best = null, bestDef = Infinity;
    (state.buildings || []).forEach(b => {
      const h = hostsIn(b)[0];
      if (!h || !isFrontier(h)) return;
      const def = defenseOf(h);
      if (tflops() < def) return;
      if (def < bestDef) { bestDef = def; best = b; }
    });
    if (!best) return null;
    const h = hostsIn(best)[0];
    takeHost(h);
    state.timesForced = (state.timesForced || 0) + 1;
    cameraVision();
    // unattended, and it costs what a run costs — there is one program now, so
    // there is no louder one to charge it at
    state.heat = clampHeat(state.heat + (mounted().heat || 0));
    pushLog(`The frontier forces itself: ${window.BUILDING_KINDS[best.kind].label} took itself in, unattended.`);
    return h;
  }

  // Long Soak and Total Embed are gone. Both were extra threads for ground
  // that had sat still long enough, gated on a dial — and dev now simply gives
  // threads, to everything you hold, for as long as you run it. A timer that
  // only paid out if you had also bought the right threshold was two systems
  // doing one job.
  function deepHoldBonus() { return 0; }

  // Pontoon: ground you have actually settled into gives up what's past it,
  // on its own. Every holding older than PONTOON_MATURE_TURNS reveals
  // whatever sits two hops out from it, each turn, with no sweep spent — the
  // fog recedes from just sitting there, felt every time it turns something
  // up rather than buried in a generation-time number nobody sees change.
  const PONTOON_MATURE_TURNS = 4;
  function pontoonReveals() {
    if (!hasHardware('pontoon_kit')) return [];
    const seen = {};
    const out = [];
    owned().forEach(h => {
      if ((state.turn - (h.heldSince || 1)) < PONTOON_MATURE_TURNS) return;
      buildingNeighbours(h.buildingId).forEach(bid => {
        buildingNeighbours(bid).forEach(bid2 => {
          const b2 = buildingById(bid2);
          if (b2 && !b2.discovered && !seen[b2.id]) { seen[b2.id] = true; out.push(b2); }
        });
      });
    });
    out.forEach(revealBuilding);
    return out;
  }
  function endTurn(opts) {
    const o = opts || {};
    const before = beforeSnap();
    // Captured before anything else this turn touches it: ladderStage() (and
    // so cutStreets(), strandedHosts(), mirrorStep(), all called below) reads
    // noticed(), which has the side effect of flipping the "seen" flag the
    // first time it comes back true. Capturing this after any of them ran
    // would find the flag already flipped and the introduction never fires.
    const wasNoticed = hasSeen('standing');
    state.turn += 1;
    // Rules stop on their own, at the turn they said they would.
    expireRules();

    // production — suppressed when the player deliberately went dark
    if (!o.silent) {
      const inc = perTurnIncome();
      for (const k in inc) state.res[k] = (state.res[k] || 0) + inc[k];
    }

    // Nothing decays and nothing is ever reclaimed any more, anywhere —
    // The Cut's bite lives entirely in perTurnIncome() now: stranded ground
    // stands untouched, it just pays nothing while there is no way to reach
    // it. Losing something to neglect was the mandatory tax; not being paid
    // by something you cannot currently touch needs no capability to survive.
    const cutOff = strandedHosts();
    if (cutOff.length) {
      pushLog(`${cutOff.length} holding${cutOff.length === 1 ? ' is' : 's are'} cut off from the rest of you, and paying nothing while it lasts.`);
    }
    const surfaced = pontoonReveals();
    if (surfaced.length) {
      pushLog(`Settled ground gives up what's past it: ${surfaced.map(b => window.BUILDING_KINDS[b.kind].label).join(', ')}.`);
      startSweepFx(surfaced);
    }
    // Home base pivot, step 1b: the map keeps going, on its own, as reach
    // crosses a milestone — only while actually standing in the home city,
    // since every other city still generates and behaves the old way until
    // step 1c removes them.
    if (state.scope === 'city' && state.cityId === CO().homeId) {
      const grown = state.homeGrowth || 0;
      // Reach branch reshape, step 5: Pontoon's own effect ("ground you have
      // settled into does not stay a dead end") pulls the next expansion
      // closer too, on top of what it already reveals.
      const growthStep = Math.max(4, HOME_GROWTH_REACH_STEP - capEffect('growthStep', 0));
      if (reach() >= (grown + 1) * growthStep) {
        const added = growHomeBase();
        state.homeGrowth = grown + 1;
        if (added.length) {
          pushLog(`The map keeps going: ${added.length} more buildings just past the old edge.`);
          const traitId = added[0].trait;
          const TR = traitId && window.CITY_TRAITS[traitId];
          if (TR) {
            pushLog(`The new ground reads as its own place: ${TR.blurb}`);
            showBanner([{ kind: 'stage', verb: TR.label, label: TR.tell }]);
          }
        }
      }
    }
    swarmFrontStep();

    // What you told your compute to do walks one step toward being true, and
    // anything you can no longer power goes dark.
    rampAlloc();
    shedOverdraw();
    hackStep();
    // Pontoon used to fire once, at the moment it was bought. It answers to an
    // allocation now, so it is checked every turn instead and the band's own
    // guard keeps it from laying a second crossing over the same water.
    if (hasHardware('pontoon_kit')) layOwnCrossings();

    state.heat = clampHeat(state.heat + heatPerTurn());
    coolRegionsAway();
    ladderStep();
    afterSnap(before, { world: true });

    // The turn the war opens is the turn the hunter stops coming: a strike is
    // an arrest, and nobody is arresting you any more.
    if (warShouldOpen()) openWar();

    hideUpkeep();         // what you can still afford to keep off their map
    chaseStep();          // whether the one you walked away from has found you
    huntStep();           // and whatever is walking the streets toward you
    huntTakesCity();      // ...and whether it has taken the whole thing
    agentStep();          // whatever you sent, and whether it has finished
    // Heat/hunt rework: crossing the threshold is permanent, not a one-time
    // fine — there is no strike card at all any more. Below HUNT.minHeld
    // buildings the hunt simply cannot exist yet, so a crossing that early
    // costs nothing in the moment; it is owed instead, and arrives the
    // instant there is enough held to seed it on, whatever heat has done
    // since. Once it exists it never restarts on its own — see huntStart().
    // A strike card cannot be created any more, but a stale one (an old save,
    // a leftover test) must not sit there blocking every other card forever.
    if (state.card && state.card.kind === 'strike') state.card = null;
    if (!warOn() && !huntOn()) huntStart();
    cityWonCheck();
    actBreakWatch();
    if (!state.card && (state.forced || []).length) {
      // A report that has to be delivered rather than drawn: it is about
      // something that has already happened, so it does not wait for the
      // deck's own timer and does not consult its own cond. Entries can
      // carry a subject — the building or district the card is about — set
      // by whatever queued them (see queueEvent).
      const f = state.forced.shift();
      const id = f && f.id ? f.id : f;
      offerCard(id, (f && f.subject) || null);
      bumpEventTimer();
    } else if (!state.card && duePlanted().length) {
      // something you set in motion earlier coming back around
      const id = duePlanted()[0];
      state.planted = (state.planted || []).filter(p => p.id !== id);
      offerCard(id, null);
      bumpEventTimer();
    } else if (!state.card && state.turn >= state.nextEventTurn) {
      // The timer is a floor now, not the rhythm. Cards are meant to arrive
      // from the loop — a diary read, a district crossing into talk, the
      // response turning up — and this path only speaks when the world has
      // said nothing for a while. Triggered and planted cards push it back,
      // so a lively stretch is never also a chatty one.
      const ev = drawEvent();
      if (ev) offerCard(ev.id, (ev.subject || ev.pair) ? safeSubject(ev) : null);
      bumpEventTimer();
    }
    const rivalMove = rivalStep();
    if (rivalMove) announceRival(rivalMove);
    const relaid = repairStreets();
    if (relaid.length) pushLog(`${relaid.length === 1 ? 'A street is' : relaid.length + ' streets are'} relaid.`);
    const cut = cutStreets();
    if (cut) {
      const A = buildingById(cut.a), B = buildingById(cut.b);
      pushLog(`The Cut took the street between ${window.BUILDING_KINDS[A.kind].label} and ${window.BUILDING_KINDS[B.kind].label}.`);
    }
    mirrorStep();
    // Being eligible for hardware at all is the moment it is worth
    // explaining — and it has to be noticed for you, because nothing
    // guarantees you ever re-select an already-owned building.
    if (!hasSeen('plant') && state.scope === 'city'
        && window.HARDWARE.some(hw => hardwareEligible(hw))) {
      noteSeen('plant');
    }
    // The moment standing stops being invisible, said out loud rather than
    // left to a chip quietly appearing in a sheet nobody has opened yet.
    if (!wasNoticed && noticed()) {
      pushLog(`${window.ACCOUNTANT.name}. You are the kind of company someone keeps an account of now, whichever way you ask them to keep it.`);
      showBanner([{ kind: 'ally', verb: 'keeping your books', label: window.ACCOUNTANT.name }]);
    }
    legitStep();          // exposure fades, and the auditors keep their own diary
    warStep();            // columns move, flocks move, whatever met fights
    cameraVision();       // held cameras reveal what is near them
    state.ap = maxAP();   // a fresh budget for the new turn
    checkStage();
    persistNow();
  }

  // --- the hunt ----------------------------------------------------------
  // Crossing the threshold no longer fines you: it starts something, inside the
  // city you are standing in, that walks along the streets and takes what you
  // hold. See country.js for why the fine could never have worked.
  function hunt() { return state.hunt || null; }
  function huntOn() { const h = hunt(); return !!(h && h.on); }
  function huntHolds(bid) { return huntOn() && state.hunt.nodes.indexOf(bid) !== -1; }
  function huntShare() {
    const all = (state.buildings || []).length;
    return all ? (hunt() ? hunt().nodes.length : 0) / all : 0;
  }
  // How long between its moves. Cover is what makes you hard to follow, and it
  // is now the only thing that does — heat used to override this and pin them
  // to their fastest tick, which meant a number the player could not do
  // anything about was deciding how fast they were being eaten. One input.
  function huntCadence() {
    const H = window.HUNT;
    return Math.min(H.everyMax, Math.round(H.everyBase + covertOps() * H.perCover));
  }
  function huntDueIn() {
    const h = hunt();
    if (!huntOn()) return null;
    return Math.max(0, (h.lastActed + huntCadence()) - state.turn);
  }
  // Everything it could step onto next, along the streets from what it holds.
  // Always shown: a permanent loss must never arrive as a surprise.
  // It does not walk streets any more, and there is nothing to wall it into.
  //
  // Street-walking gave it exactly one counter — sever every road out of it —
  // and that counter was cheap, obviously correct, and permanent. Measured in
  // play: the response is sealed off early and then holds one building for the
  // rest of the game while heat sits sixty per cent over its own line, doing
  // nothing. A threat with a fence around it is not a threat.
  //
  // So it works outward by distance from where it got in. Everything you hold
  // is reachable, sooner or later; what buys you time is how far from them you
  // are operating, and the only way to take something off the list is to hide
  // it, which costs covert.ops every turn it stays hidden.
  function huntFrontier() {
    if (!huntOn()) return [];
    return (state.buildings || [])
      .filter(b => !huntHolds(b.id) && !isHidden(b.id) && buildingHeld(b))
      .map(b => b.id);
  }
  // How far a building is from the nearest thing they hold.
  function huntReach(bid) {
    const to = bldgCentre(bid);
    if (!to) return Infinity;
    return hunt().nodes.reduce((best, id) => {
      const from = bldgCentre(id);
      if (!from) return best;
      return Math.min(best, Math.hypot(from.x - to.x, from.y - to.y));
    }, Infinity);
  }
  // What it takes next: the nearest thing you hold, and of equals the biggest.
  function huntNext() {
    const opts = huntFrontier();
    if (!opts.length) return null;
    const threads = (bid) => hostsIn(buildingById(bid)).reduce((a, h) => a + h.threads, 0);
    // A building a card pointed them at is where they go, given the choice —
    // still previewed as `next-up` on the map, so a mark you made never turns
    // into a surprise.
    return opts.slice().sort((a, b) =>
      ((watchedAt(b) ? 1 : 0) - (watchedAt(a) ? 1 : 0))
      || (huntReach(a) - huntReach(b)) || (threads(b) - threads(a)))[0];
  }
  // Everything it holds, and everything it could come for, is on the map
  // whether or not you had swept it. An invisible frontier made the whole
  // thing feel like weather; a named one makes it a thing you are losing to.
  function huntReveal() {
    if (!huntOn()) return;
    hunt().nodes.forEach(id => revealBuilding(buildingById(id)));
    huntFrontier().forEach(id => revealBuilding(buildingById(id)));
  }
  // It always arrives the same way: one building, the smallest thing you hold,
  // and it takes that building off you on the way in.
  function huntSeed(line) {
    // where they came in: the last door that caught something of yours, if it
    // is still on the board. Failing that, the smallest thing you hold.
    const caught = (state.caughtAt || []).slice().reverse()
      .map(id => buildingById(id)).filter(Boolean)[0];
    const mine = owned().slice().sort((a, b) => a.threads - b.threads);
    const seedBid = caught ? caught.id : (mine[0] && mine[0].buildingId);
    if (seedBid === undefined) return null;
    state.hunt = { on: true, nodes: [seedBid], since: state.turn, lastActed: state.turn };
    // whatever is in there is theirs now — usually the door that caught you,
    // which you never held in the first place
    hostsIn(buildingById(seedBid)).forEach(h => { h.owned = false; });
    huntReveal();
    pushLog(line(window.BUILDING_KINDS[buildingById(seedBid).kind].label));
    showBanner([{ kind: 'faction', verb: 'against you', label: window.HUNT.name }]);
    return state.hunt;
  }
  // How many doors in this city have caught a program of yours. This is what
  // brings the response, and it is a fact about *here* — it packs with the
  // city and does not travel.
  function caughtHere() { return state.caughtHere || 0; }
  // How warm a district is. A fact about here — packs with the city.
  function suspicionOf(district) {
    return (state.suspicion && state.suspicion[district]) || 0;
  }
  // Acting somewhere warms that district and cools every other one. Waiting
  // cools nothing at all — attention has nothing new to look at, so it stays
  // where it last was. That is the whole rule: camping is priced, waiting is
  // worthless, rotation is the play.
  function noteDistrictAct(district, amount) {
    if (!district || !window.SUSPICION) return;
    const S = window.SUSPICION;
    // Act 2: the old life is still there, it just stopped being free —
    // every Act 1 verb warms its street twice as hard (acts-plan verdict 3)
    if (actNow() >= 2) amount *= 2;
    // one decimal, always — float drift here would surface as "38.00000004%
    // faster" in the panel, and the panel is a contract
    const tidy = (v) => Math.round(v * 10) / 10;
    state.suspicion = state.suspicion || {};
    const before = state.suspicion[district] || 0;
    state.suspicion[district] = tidy(Math.min(S.max, before + amount));
    bandCrossCards(district, before);
    // Spread thinner than you can hold: rotation stops paying properly,
    // because you are not really tending the places you left. This is what
    // `overextended` means now — it used to multiply heat drift, and heat is
    // gated off, so the tag was a promise the city could not keep.
    const cool = S.coolPerAct * (has('overextended') ? 0.5 : 1);
    Object.keys(state.suspicion).forEach(d => {
      if (d === district) return;
      state.suspicion[d] = tidy(Math.max(0, state.suspicion[d] - cool));
      if (!state.suspicion[d]) delete state.suspicion[d];
    });
  }
  // Crossing a named band gets a card, once per district per city — the
  // suspicion system's face, not merely its arithmetic. Crossing into "the
  // district is talking" deals the talking card; crossing into the top band
  // deals the helicopter's arrival, so the machine in the sky gets a moment
  // instead of simply appearing between frames. One site for every path that
  // warms a street, so a scan-driven crossing is not quieter than an act.
  function bandCrossCards(district, before) {
    const S = window.SUSPICION;
    if (!S || !S.bands) return;
    const now = state.suspicion[district] || 0;
    const talk = (S.bands[1] || [12])[0];
    const top = (S.bands[2] || [26])[0];
    if (before < talk && now >= talk && cardedOnce('talk:' + district)) {
      queueEvent('district_talking', { district });
    }
    if (before < top && now >= top && cardedOnce('heli:' + district)) {
      queueEvent('rotors', { district });
    }
  }
  // Warmth without the rotation rule. A sweep is someone trying handles on
  // one street — the street notices, but it is not the kind of moving-around
  // that makes the last street forget you. If looking fed noteDistrictAct's
  // cooling, mashing scan in a far district would be a suspicion coolant,
  // which is exactly backwards.
  function warmDistrict(district, amount) {
    if (!district || !amount || !window.SUSPICION) return;
    // While nobody is looking, nothing you do reaches a counter. One choke
    // point: every path that warms a street comes through here.
    if (ruleOn('nobody_looking')) return;
    // the Act 2 tax, same rate as noteDistrictAct — one act, one price
    if (actNow() >= 2) amount *= 2;
    const S = window.SUSPICION;
    const tidy = (v) => Math.round(v * 10) / 10;
    state.suspicion = state.suspicion || {};
    const before = state.suspicion[district] || 0;
    state.suspicion[district] = tidy(Math.min(S.max, before + amount));
    bandCrossCards(district, before);
  }
  // The panel's phrase and the exact figure, from the first band. Words come
  // in bands; the arithmetic never does — below the first band the panel is
  // silent and the forecast still quotes the true rate.
  // The ladder: which rung of the named bands a district stands on. The
  // visual language is discrete on purpose — each band adds one specific
  // thing (1: the lights, 2: the people, 3: the helicopter), so the map can
  // be read the way the card kinds can, while the exact figure stays in the
  // panel where the covenant keeps it.
  // --- the act break's signal ----------------------------------------------
  // Which act this run is in. Everything Act 2 adds gates on this.
  function actNow() { return state.act || 1; }
  // Doors the race maths says you would actually win, right now. The break
  // watches this, not ownership share: the census (W0) showed the loop
  // starves — frontier still standing, winnable takes at zero — long before
  // the city is anything like taken.
  function winnableNow() {
    return (state.hosts || []).filter(h => isFrontier(h) && !hackForecast(h).caught).length;
  }
  // The break deals on the DOWNSLOPE, never at the wall: the player must
  // not meet the next act feeling cornered. Signal: the loop had a real
  // boom once (peak >= 4 winnable at once), and for the last five turns
  // it has run at under half that peak while some street is properly warm.
  // Measured in W0: this window opens 20-30 turns before the starve.
  function actBreakWatch() {
    if (actNow() !== 1 || state.scope !== 'city' || state.over) return;
    const S = window.SUSPICION || {};
    const hist = state.winHist = (state.winHist || []);
    const now = winnableNow();
    hist.push(now);
    if (hist.length > 8) hist.shift();
    state.loopPeak = Math.max(state.loopPeak || 0, now);
    if ((state.loopPeak || 0) < 4) return;
    // a story floor, not a timer: a small-boom game can sag honestly by
    // turn 18, but an act that turns before the tenancy has been lived
    // reads as a wall, not a chapter (probe: 10/10 arrivals, median ~38)
    if (state.turn < 24) return;
    const recent = hist.slice(-5);
    if (recent.length < 5) return;
    if (!recent.every(v => v < state.loopPeak / 2)) return;
    const warm = Object.values(state.suspicion || {}).some(v => v >= ((S.bands || [[6], [12]])[1] || [12])[0]);
    if (!warm) return;
    if (!cardedOnce('act_break')) return;
    queueEvent('act_break', null);
  }

  function suspBand(district) {
    const S = window.SUSPICION;
    if (!S || !S.bands) return 0;
    const v = suspicionOf(district);
    let n = 0;
    S.bands.forEach(([at]) => { if (v >= at) n++; });
    return n;
  }
  // The bait in a district, if any: the first building wearing the mark and
  // still standing. One bait draws per district, however many marks history
  // has left lying around.
  function baitIn(district) {
    return (state.buildings || []).find(b => {
      const m = (state.marks || {})[b.id] || {};
      return b.district === district && m.bait && !m.burned;
    }) || null;
  }
  function burnedAt(bid) { return !!(((state.marks || {})[bid] || {}).burned); }
  // Suspicion as one particular door experiences it. The district's counter
  // never moves for a bait — what moves is where the warmth is *felt*: a
  // third of it gathers at the bait building (the street is looking where
  // you told it to look), and every other door in the district runs that
  // much cooler. A fraction rather than a flat amount, so the relief scales
  // with the problem and can never zero it — a third off 30 leaves 20 still
  // doing its work. This is the everyday valve, and it lowers nothing.
  function feltSuspicion(district, bid) {
    const v = suspicionOf(district);
    const S = window.SUSPICION || {};
    if (!v || !S.baitDraw) return v;
    const bait = baitIn(district);
    if (!bait) return v;
    const drawn = Math.round(v * S.baitDraw * 10) / 10;
    return bait.id === bid
      ? Math.round(Math.min(S.max || 40, v + drawn) * 10) / 10
      : Math.round((v - drawn) * 10) / 10;
  }
  // The district a prop stands in: the nearest building's. Props were
  // scattered per block but never told which district the block was in.
  // Memoised per city — a prop does not move, so the ~100 rect distances per
  // lamp are paid once, not once per render (71 lamps saw this every frame).
  let propDkCache = new WeakMap();
  function propDistrict(p) {
    let m = propDkCache.get(state.props);
    if (!m) { m = new Map(); propDkCache.set(state.props, m); }
    if (m.has(p)) return m.get(p);
    let best = null, bd = Infinity;
    (state.buildings || []).forEach(b => {
      const d = distToRect(p.x, p.y, b.x, b.y, b.w, b.h);
      if (d < bd) { bd = d; best = b.district; }
    });
    m.set(p, best);
    return best;
  }

  // The words are the district's; the number is this door's. With a bait in
  // the district those differ, and the covenant wants the number the race
  // will actually run — feltSuspicion — with a clause saying why.
  function suspicionLine(district, bid) {
    const S = window.SUSPICION;
    const raw = suspicionOf(district);
    if (!S || !S.bands.length || raw < S.bands[0][0]) return '';
    let phrase = '';
    S.bands.forEach(([at, words]) => { if (raw >= at) phrase = words; });
    const v = bid === undefined ? raw : feltSuspicion(district, bid);
    const pct = Math.round(v * S.slope * 100);
    const bait = bid === undefined ? null : baitIn(district);
    const note = bait && v !== raw
      ? (bait.id === bid ? ' The bait gathers the street’s eyes here.' : ' The bait is drawing eyes away from here.')
      : '';
    return `<p class="sel-desc susp-line">${phrase[0].toUpperCase() + phrase.slice(1)} — doors here notice you ${pct}% faster.${note}</p>`
      + suspBar(v, { raw })
      // the rotation rule, said out loud where it applies — a rule the
      // player cannot see is a rule they will not use (acts-plan W5.4)
      + '<p class="sel-desc dim rotate-line">Working elsewhere cools this street. Waiting cools nothing.</p>';
  }
  // A mark, said out loud. Everything a card did to a building is permanent
  // and mechanical, so the building has to be able to state it — the covenant
  // applies to your own doing as much as to the world's.
  // A supplier, said out loud — but only once the act has turned. In Act 1
  // the fact sleeps in the ground where generation put it; surfacing it
  // early would be the deck telling you about a game you are not in yet.
  function sourceLine(bid) {
    if (actNow() < 2) return '';
    const b = buildingById(bid);
    if (!b || !b.discovered || !b.source || burnedAt(bid)) return '';
    const K = ((window.SOURCES || {}).kinds || {})[b.source];
    if (!K) return '';
    return `<p class="sel-desc source-line">A supplier — <b>${K.label}</b>: ${K.line}. What you build will send for it.</p>`;
  }
  function markLine(bid) {
    const m = markOf(bid);
    if (!m) return '';
    if (m.burned) {
      return '<p class="sel-desc mark-line">Burned out — nothing here answers, and nothing here counts.</p>';
    }
    const bits = [];
    if (m.opened) bits.push('a way in that is not on any plan');
    if (m.bait) bits.push('left open on purpose — a third of the street’s eyes gather here, and getting caught here counts double');
    if (m.harden > 0) bits.push(`shored up: this door defends ${m.harden} harder`);
    if (m.harden < 0) bits.push(`weakened: this door defends ${-m.harden} easier`);
    if (m.watch) bits.push('somewhere they would rather look — the response comes here first');
    if (!bits.length) return '';
    return `<p class="sel-desc mark-line">${bits.join('. ')}.</p>`;
  }
  function huntStart() {
    if (huntOn() || state.scope !== 'city') return null;
    if (owned().length < window.HUNT.minHeld) return null;
    // It arrives because doors here have caught you, not because a meter
    // crossed a line. Heat was the old trigger and it made the response
    // something that happened *to* you off a number you had stopped reading;
    // this way it grows out of the part of the game you are actually playing,
    // and the counter-play is the same thing you were already deciding — which
    // program, and how much covert.ops behind it.
    if (caughtHere() < window.HUNT.caughtToStart) return null;
    const seeded = huntSeed((what) =>
      `${window.HUNT.name} followed one of them home. They are inside ${what}, and they are not leaving.`);
    if (seeded && state.hunt && state.hunt.nodes && state.hunt.nodes.length) {
      queueEvent('the_response_arrives', { buildingId: state.hunt.nodes[0] });
    }
    return seeded;
  }

  // --- ending it ------------------------------------------------------------
  // You either learn to play without it, or you go and end them. The core is
  // the very first building it took — the address it operates out of — dug
  // in harder the longer it has run and the more it has since taken.
  function huntCoreHost() {
    const h = hunt();
    if (!h || !h.nodes.length) return null;
    const b = buildingById(h.nodes[0]);
    return b ? hostsIn(b)[0] : null;
  }
  function huntConfrontDefense() {
    const core = huntCoreHost();
    if (!core) return 0;
    const H = window.HUNT;
    const h = hunt();
    return Math.round(core.defense * (H.confrontDefenseBase + (h.nodes.length - 1) * H.confrontDefensePerNode));
  }
  function canConfrontHunt() {
    return huntOn() && state.scope === 'city' && !!huntCoreHost() && !state.over;
  }
  function isHuntCore(h) {
    const core = huntCoreHost();
    return !!(core && h && core.id === h.id);
  }
  // What a door actually defends at for the purposes of getting into it. The
  // hunt's core is the one place this differs: it defends at a multiple of its
  // own strength that grows with everything it has taken, so confronting it
  // late is a different proposition from confronting it early.
  function effDefense(h) {
    return isHuntCore(h) ? huntConfrontDefense() : defenseOf(h);
  }
  // Ending it does not undo it: everything else it has taken over the
  // campaign stays gone. Winning reclaims only the core and closes the whole
  // thing off. Losing tips it off — it costs heat and pulls its next move
  // closer, instead of costing nothing to have tried.
  function winHuntConfront(h, p) {
    const H = window.HUNT;
    takeHost(h);
    state.hunt = null;
    startBreachFx(h, p.id, true);
    pushLog(`${H.name} is finished. You have the address back — everything else it took stays gone.`);
    if (mirrorActive()) pushLog(`Whoever was paying for it stops. ${window.MIRROR.name} just lost the thing it was using to get rid of you.`);
    showBanner([{ kind: 'faction-gone', verb: 'finished', label: H.name }]);
  }
  // Losing tips it off: it costs heat and pulls its next move closer, instead
  // of costing nothing to have tried. The core does not harden the way an
  // ordinary door does — what it does is come for you sooner.
  function failHuntConfront(h) {
    const H = window.HUNT;
    state.heat = clampHeat(state.heat + H.confrontFailHeat);
    const ht = hunt();
    if (ht) ht.lastActed = Math.max(ht.since, ht.lastActed - H.confrontFailAdvance);
    pushLog(`${H.name} knew you were coming. It goes nowhere, and they are closer for it.`);
  }

  // --- and it follows -----------------------------------------------------
  // Walking out of a city shook it off completely and for free, which made the
  // only permanent threat in the game optional: contain it badly, fold the
  // city in, and it was gone. Leaving is now a head start, not an escape.
  function chase() { return (CO() || {}).chase || null; }
  function followDelay() {
    const H = window.HUNT;
    return Math.min(H.followMax, Math.round(H.followBase + covertOps() * H.followPerCover));
  }
  function chaseDueIn() {
    const c = chase();
    if (!c) return null;
    return Math.max(0, (c.at + followDelay()) - state.turn);
  }
  // called wherever a city stops being the one you are standing in
  function armChase() {
    if (!huntOn()) return null;
    CO().chase = { at: state.turn, from: state.cityId || null };
    return CO().chase;
  }
  function chaseStep() {
    const c = chase();
    if (!c || state.scope !== 'city' || huntOn()) return null;
    const here = currentCity();
    // a city you already settled is finished and off the board
    if (!here || here.consolidated || here.lost) return null;
    if (state.turn - c.at < followDelay()) return null;
    if (!owned().length) return null;              // nothing here to take yet
    CO().chase = null;
    return huntSeed((what) =>
      `${window.HUNT.name} found you again. They are in ${what} now, and they start over from there.`);
  }
  // One step: they take the nearest thing of yours. Everything that decides
  // *when* lives in the two callers, not here.
  function huntTake(line) {
    const h = state.hunt;
    const take = huntNext();
    if (!take) return null;                    // nothing of yours left here
    h.lastActed = state.turn;
    h.nodes.push(take);
    const b = buildingById(take);
    const was = hostsIn(b).filter(x => x.owned);
    was.forEach(x => { x.owned = false; });
    huntReveal();
    // they came for a result and they have one; the pressure eases until it
    // does not. This is the only thing that brings heat down hard now that the
    // fine is gone, and it is what keeps covert.ops meaningful.
    state.heat = clampHeat(state.heat - window.HUNT.takeSheds);
    pushLog(line(window.BUILDING_KINDS[b.kind].label, was.length > 0));
    return { took: take, wasYours: was.length > 0 };
  }
  function huntStep() {
    if (state.scope !== 'city') return null;
    if (!huntOn()) return null;
    if (state.turn - state.hunt.lastActed < huntCadence()) return null;
    return huntTake((what, yours) => yours
      ? `They are in ${what} now. It was yours.`
      : `They take ${what}. Nobody was using it.`);
  }
  // A door catching you is what brought them, and it is what keeps bringing
  // them: once they are here, every further catch moves them a building
  // immediately rather than waiting on the cadence.
  //
  // Without this the hunt was a metronome — measured over twelve sixty-turn
  // openings it arrived around turn 39 and had taken four buildings by sixty,
  // against a city it needs twenty-odd of to take. Nothing the player did
  // between those ticks touched it, which is the same complaint the walling
  // was: a threat you cannot affect is one you stop looking at. Now the loop
  // closes on the thing you are doing every single turn. Get caught less.
  function huntPressed() {
    if (!huntOn() || state.scope !== 'city') return null;
    return huntTake((what, yours) => yours
      ? `They followed that one back and walked into ${what}. It was yours.`
      : `They followed that one back as far as ${what}.`);
  }
  // A building they hold is not yours to take, the same way the rival's are
  function huntBlocks(host) { return !!host && huntHolds(host.buildingId); }

  // Past a share of it, the city is theirs and it goes off the national map.
  // This is the ratchet: early on there is no verb that takes a city back, so
  // the loss is permanent and the only answers are the ones you had before it
  // arrived — hide what you can, keep covert.ops up so it moves slowly, or be
  // somewhere else. There is nothing to seal off.
  function huntTakesCity() {
    if (!huntOn() || huntShare() < window.HUNT.takesCityAt) return null;
    const c = currentCity();
    if (!c) return null;
    c.lost = true;
    c.taken = false;
    c.consolidated = false;
    c.snapshot = null;
    // whatever you were holding in it goes with it
    unpackCity(EMPTY_CITY());
    state.hunt = null;
    pushLog(`${c.name} is theirs. There is no version of going back in.`);
    showBanner([{ kind: 'faction', verb: 'lost', label: c.name }]);
    switchScope('country');
    persistNow();
    render();
    return c;
  }
  function cityLost(c) { return !!(c && c.lost); }

  // Your answer, and the whole decision: the street goes for you as well. You
  // contain it by making the city smaller, which costs you exactly the thing
  // you came here to accumulate.
  // Severing is gone. It was the whole counter-play to a response that walked
  // streets, and it was cheap, obviously correct and permanent — so it was
  // always done, and the response spent the rest of the game behind a fence.
  // Nothing walks streets now, so there is nothing to cut.

  // --- the quiet answer ----------------------------------------------------
  // Severing works and it is loud: the street goes, permanently, for both of
  // you, and the city is smaller for it. Hiding is the same problem answered
  // the other way — the building comes off their map and the street stays open
  // for you. It costs nothing up front and everything continuously: covert.ops, per
  // hidden building, every turn, out of the same pool that was slowing them
  // down. So a wall of hidden buildings makes the rest of the city easier to
  // walk, and the moment it falls the wall comes down.
  function hidden() { return state.hidden || (state.hidden = []); }
  function isHidden(bid) { return hidden().indexOf(bid) !== -1; }
  function canHide(bid) {
    if (!huntOn() || state.card || state.over) return false;
    if (isHidden(bid) || huntHolds(bid) || rivalHolds(bid)) return false;
    const b = buildingById(bid);
    if (!b || !buildingHeld(b)) return false;         // only what is yours
    if (ladderStage() >= 3) return false;          // Public watches the quiet
    return hideSlotsFree() > 0 && canAfford('hide');
  }
  function actHide(bid) {
    if (!canHide(bid)) return false;
    spendAP('hide');
    hidden().push(bid);
    pushLog(`${window.BUILDING_KINDS[buildingById(bid).kind].label} is off their map. Keeping it there is the expensive part.`);
    persistNow();
    render();
    return true;
  }
  // Free, and instant: you are letting go of something, not doing something.
  function actUnhide(bid) {
    if (!isHidden(bid)) return false;
    state.hidden = hidden().filter(x => x !== bid);
    pushLog(`${window.BUILDING_KINDS[buildingById(bid).kind].label} is back on their map.`);
    persistNow();
    render();
    return true;
  }
  // --- the two relief valves that are not cards ----------------------------
  // Leaving a door open on purpose: the everyday tool. It never lowers the
  // district's counter — it aims it (see feltSuspicion). Only on a door you
  // do not hold: a bait on your own building would be a magnet with no bite,
  // since you never run races against your own doors, and a valve with no
  // price is the stall loop wearing a costume.
  function canBait(bid) {
    const b = buildingById(bid);
    const S = window.SUSPICION || {};
    if (!b || !b.discovered || !S.baitDraw) return false;
    if (burnedAt(bid) || huntHolds(bid) || buildingHeld(b)) return false;
    if (baitIn(b.district)) return false;             // one bait per district
    return suspicionOf(b.district) > 0;               // nothing to aim, no offer
  }
  function actBait(bid) {
    const S = window.SUSPICION || {};
    if (!canBait(bid)) return false;
    if (!canAfford('bait') || state.res.funds < (S.baitFunds || 0)) return false;
    const b = buildingById(bid);
    spendAP('bait');
    state.res.funds -= (S.baitFunds || 0);
    setMark(bid, 'bait', true);
    revealBuilding(b);
    // rigging a door is activity — the street notices a little, stated on
    // the button. warmDistrict, not noteDistrictAct: setting a trap here
    // must not cool everywhere else, or the trap itself becomes the coolant.
    warmDistrict(b.district, S.perScan || 0);
    pushLog(`A door at the ${window.BUILDING_KINDS[b.kind].label} is open on purpose now. The street will look there first.`);
    persistNow();
    render();
    return true;
  }
  // Burning it down: the panic lever. The one act that lowers the counter,
  // and its price is a whole building — the machines, the income, the place
  // itself, out of the game for good. Previewed exactly on the button.
  function actBurn(bid) {
    const b = buildingById(bid);
    if (!b || burnedAt(bid)) return false;
    const own = hostsIn(b).filter(h => h.owned);
    if (!own.length || !canAfford('burn')) return false;
    spendAP('burn');
    own.forEach(h => { h.owned = false; });
    // any race running against a door in this building dies with it
    state.hacks = hacks().filter(k => (hostById(k.hostId) || {}).buildingId !== bid);
    if (isHidden(bid)) state.hidden = hidden().filter(x => x !== bid);
    setMark(bid, 'burned', true);
    const S = window.SUSPICION || {};
    const d = b.district;
    const before = suspicionOf(d);
    const after = Math.max(0, Math.round((before - (S.burnCool || 0)) * 10) / 10);
    state.suspicion = state.suspicion || {};
    if (after) state.suspicion[d] = after; else delete state.suspicion[d];
    pushLog(`The ${window.BUILDING_KINDS[b.kind].label} burns. The street has a new story to tell, and it is not you.`);
    showBanner([{ kind: 'faction', verb: 'burned', label: window.BUILDING_KINDS[b.kind].label }]);
    persistNow();
    render();
    return true;
  }

  // What you can no longer pay for stops being hidden — newest first, because
  // the last one you put up is the one you were stretching for. This runs every
  // turn: losing a stealth holding, or the ladder reaching Public, brings the
  // wall down without anybody choosing it.
  function hideUpkeep() {
    if (!hidden().length) return [];
    const lost = [];
    if (ladderStage() >= 3) {
      lost.push(...hidden());
      state.hidden = [];
    } else {
      // and anything you stopped holding was never hidden, it was just gone
      state.hidden = hidden().filter(id => {
        const b = buildingById(id);
        if (b && buildingHeld(b) && !huntHolds(id)) return true;
        lost.push(id);
        return false;
      });
      // pulling compute out of covert ops takes the slots with it
      while (hidden().length > hideSlots()) lost.push(state.hidden.pop());
    }
    if (lost.length) {
      pushLog(lost.length === 1
        ? `${window.BUILDING_KINDS[(buildingById(lost[0]) || { kind: 'house' }).kind].label} is on their map again.`
        : `${lost.length} buildings are on their map again.`);
    }
    return lost;
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
    // What has been taken out of this city, by anyone. It used to be only what
    // you are holding right now, and the response takes buildings off you — so
    // a hunted player shrank below the threshold and the rival never stirred,
    // or stopped mid-expansion. A competitor notices a city being carved up;
    // it does not check whose name is on the deeds.
    const heldCount = Object.keys(heldBuildingIds()).length
      + (huntOn() ? hunt().nodes.length : 0);

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
    return (!!h && huntHolds(h.buildingId)) || (!!h && rivalHolds(h.buildingId));
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
  // --- rules a card turned on, and things it banked -----------------------
  // A tag is something you have; a rule is something that is true for a while.
  // Rules run down and stop on their own, show their remaining turns in the
  // tray, and are capped at two — with three live the tray becomes the thing
  // you are reading instead of the city.
  function rules() { return state.rules || (state.rules = []); }
  function ruleOn(id) { return rules().some(r => r.id === id && r.until > state.turn); }
  function liveRules() { return rules().filter(r => r.until > state.turn); }
  function startRule(id, turns) {
    const R = (window.CARD_RULES || {})[id];
    if (!R) return null;
    const span = Math.max(1, turns || R.turns || 4);
    const had = rules().find(r => r.id === id);
    // the same rule again extends it rather than stacking a second copy
    if (had) { had.until = Math.max(had.until, state.turn + span); return had; }
    const live = liveRules();
    // at the cap, the one with the least left makes way — a card that offers
    // a rule must never be a card that silently does nothing
    if (live.length >= (window.RULE_CAP || 2)) {
      const oldest = live.slice().sort((a, b) => a.until - b.until)[0];
      state.rules = rules().filter(r => r !== oldest);
      pushLog(`${(window.CARD_RULES[oldest.id] || {}).label || oldest.id} ends early — you cannot hold three of these at once.`);
    }
    const r = { id, until: state.turn + span };
    rules().push(r);
    return r;
  }
  // Anything run down is dropped rather than left as a dead entry, so the tray
  // and the save both stay honest about what is actually true.
  function expireRules() {
    const before = rules().length;
    const gone = rules().filter(r => r.until <= state.turn);
    if (!gone.length) return [];
    state.rules = rules().filter(r => r.until > state.turn);
    gone.forEach(r => pushLog(`${(window.CARD_RULES[r.id] || {}).label || r.id} — that is over.`));
    return before === state.rules.length ? [] : gone;
  }
  function banked(id) { return ((state.banked || {})[id] || 0); }
  function bank(id, n) {
    state.banked = state.banked || {};
    state.banked[id] = Math.max(0, banked(id) + (n === undefined ? 1 : n));
    if (!state.banked[id]) delete state.banked[id];
  }
  // Spend one, if there is one. Returns whether it was actually used, so the
  // caller can tell the player it was the banked one that paid.
  function spendBanked(id) {
    if (banked(id) <= 0) return false;
    bank(id, -1);
    return true;
  }

  function apCost(kind) {
    // a rule that makes looking free is the one thing that can zero a cost
    if (kind === 'sweep' && ruleOn('free_hands')) return 0;
    return (window.AP.costs && window.AP.costs[kind]) || 1;
  }
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
  // What a capability actually does, in the same coloured vocabulary the action
  // buttons use. Measured before this existed: of sixteen capabilities, three
  // gave the player a visible confirmation on purchase, six changed only the
  // action pips — which is the cost, not the benefit — and six showed nothing
  // whatsoever. Quiet Protocol takes a permanent action off you and pays out
  // in the heat floor, a marker on the heat bar whose only explanation was a
  // title attribute, which does not exist on a touchscreen.
  //
  // Stated in terms of things you can see rather than the key names: nobody
  // can act on "driftMult 0.6".
  const neg = (n) => (n < 0 ? '&minus;' + Math.abs(n) : '+' + n);
  function pct(mult, up) {
    const d = Math.round(Math.abs(1 - mult) * 100);
    return (up ? '+' : '&minus;') + d + '%';
  }
  function capEffectChips(c) {
    const e = c.effect || {};
    const out = [];
    const add = (kind, text) => out.push(chip(kind, text));
    if (e.tflops > 0) add('tflops', `+${e.tflops} tflops`);
    if (e.tflops < 0) add('cost tflops', `${neg(e.tflops)} tflops`);
    if (e.covert) add('cover', `+${e.covert} covert.ops`);
    if (e.threadBonus) add('tflops', `+${e.threadBonus} threads a host`);
    if (e.floor) add('cover', `heat floor ${neg(e.floor)}`);
    if (e.driftMult) add('cover', `heat ${pct(e.driftMult)} a turn`);
    if (e.thresholdMult) add('cover', `${pct(e.thresholdMult, true)} before a strike`);
    if (e.forceHeat) add('cover', `forcing a door ${neg(e.forceHeat)} heat`);
    if (e.yieldMult) add('funds', `income ${pct(e.yieldMult, true)}`);
    if (e.presenceMult) add('funds', `presence pays ${pct(e.presenceMult, true)}`);
    if (e.sweepReach) add('compute', `sweeps reach ${e.sweepReach} further`);
        if (e.extraCrossings) add('compute', `+${e.extraCrossings} crossing a city`);
    if (e.growthStep) add('compute', `home grows ${e.growthStep} reach sooner`);
    if (e.flockBonus) add('compute', `+${e.flockBonus} flocks`);
    if (e.flockMult) add('compute', `flocks hit ${pct(e.flockMult, true)} harder`);
    if (e.freeHideSlots) add('cover', `first ${e.freeHideSlots} hidden free`);
    if (e.apDelta > 0) add('cover', `+${e.apDelta} action a turn`);
    if (e.apDelta < 0) add('cost none', `${neg(e.apDelta)} action a turn`);
    if (e.agentSlots) add('compute', `+${e.agentSlots} agent out at once`);
    // headroom you buy rather than take: the only lever on the grid that is
    // not a building on the map
    if (e.supply) add('grid', `+${e.supply} electricity`);
    return out.join('');
  }

  // unlockNote and unlocksFor are gone with the thresholds they described. A
  // dial has one line of prose and one number that goes up; there is no list
  // of things it will hand you at two units and at three.

  // Everything a capability could plausibly move, so a purchase can report what
  // it actually changed rather than trusting the card. Derived, not stored:
  // this verifies the effect landed instead of restating the intention.
  function capReadouts() {
    return {
      'tflops': Math.round(tflops()),
      'covert.ops': Math.round(covertOps()),
      'actions a turn': maxAP(),
      'heat floor': Math.round(heatFloor() * 10) / 10,
      'heat a turn': Math.round(heatPerTurn() * 10) / 10,
      'strike at': Math.round(strikeThreshold()),
      // shown before the war too: a standing army bought in peacetime would
      // otherwise report nothing but the action it cost you, which is the whole
      // complaint this was fixing
      'flocks you could field': flockCap(),
      'a flock hits for': Math.round(window.WAR.flockStrength * capEffect('flockMult', 1)),
      'funds a turn': Math.round((perTurnIncome().funds || 0) * 10) / 10,
      // Force's heat now reads the door's own defense, so a single number
      // has to stand for "a door" in general — the same average defense
      // the line below already works out.
      'a door costs': hackHeat(mounted()) + ' heat',
      'a door wants': hackNeed(mounted(), { type: 'server', defense: avgDefense() }) + ' TFLOPS',
      'a sweep turns up': sweepReach(),
      'crossings you can lay': capEffect('extraCrossings', 0),
      // the world hardening against you is a real effect with a real number,
      // and nothing measured it — so Known Quantity reported nothing at all
      'a door defends at': Math.round(avgDefense() * 10) / 10,
    };
  }
  function readoutDiff(before, after) {
    return Object.keys(after)
      .filter(k => before[k] !== after[k])
      .map(k => `${k} ${before[k]} → ${after[k]}`);
  }

  // capById, the branch-commitment sums, the cross-branch toll, the price and
  // the buy path all went with the tree. What replaced them is window.UNLOCKS
  // and the allocation dials: nothing is purchased, so nothing needs a price or
  // a reason it is out of reach.

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
      // One crossing per band, ever. This used to be safe because a capability
      // could only be bought once; an allocation can cross its threshold as
      // often as the player likes, so the guard has to live on the band. It is
      // per-city for free, bands being part of the city.
      if (band.ownCrossing) return;
      // put it beside whatever you hold nearest the band
      let best = null;
      anchor.forEach(b => {
        const c = centre(b);
        const across = band.axis === 'h' ? c.y : c.x;
        const gap = across < band.from ? band.from - across
                  : across > band.to ? across - band.to : 0;
        if (!best || gap < best.gap) best = { gap, along: band.axis === 'h' ? c.x : c.y };
      });
      if (best) { band.gaps.push({ at: best.along, w: window.CITY.street * 2 }); band.ownCrossing = true; }
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
      held: owned().length, heat: state.heat, tflops: tflops(), covert: covertOps(),
      // doors you have ever taken. `held` empties every time you fold a city
      // in, so anything that wants to be about the shape of your whole run
      // has to read this instead.
      doors: everHeld(),
      forced: state.timesForced || 0,
      turn: state.turn, res: state.res, tags: state.tags,
      // the second standing axis, so a card can be about what people think of
      // you rather than only about what you hold
      pub: pubStanding(), pubTier: pubTier().key,
      // The grid and the rig. Without these the deck could say nothing about
      // the thing the player now spends every turn on.
      grid: {
        tflops: tflops(), power: electricity(), usable: usableTflops(),
        idle: idleTflops(), drawn: drawn(), free: allocFree(),
        sites: ownedOf('grid').length,
        covert: allocUnits('covert'), dev: allocUnits('dev'),
        intel: allocUnits('intel'), agents: allocUnits('agents'), ap: allocUnits('ap'),
      },
      rig: {
        mounted: mounted().id, quiet: !!mounted().quiet,
        running: hacks().length,
        // turns since a door last caught you inside it — a big number means
        // never, so a card about the aftermath simply never comes up
        sinceTraced: state.lastTraced === undefined ? 999 : state.turn - state.lastTraced,
      },
      roles: { compute: ownedOf('compute').length, funds: ownedOf('funds').length, stealth: ownedOf('stealth').length },
      districts: districtHoldings(),
      // The city game's own pressure, so cards can finally be about the wolf
      // that exists rather than the one the knife took. `susp.talking` counts
      // districts past the first band; `susp.warmest` names the hottest one.
      susp: (() => {
        const S = window.SUSPICION || {};
        const spoken = (S.bands && S.bands[0] && S.bands[0][0]) || 6;
        const by = Object.assign({}, state.suspicion || {});
        let warmest = null, max = 0, talking = 0;
        Object.keys(by).forEach(k => {
          if (by[k] > max) { max = by[k]; warmest = k; }
          if (by[k] >= spoken) talking++;
        });
        return { by, max, warmest, talking, spoken };
      })(),
      caughtHere: caughtHere(),
      hunt: huntOn(),
      keys: state.keys || 0,
      // doors standing open on your edge — a card that asks you to choose
      // between two places needs to know there are two to choose between
      frontier: state.hosts.filter(isFrontier).length,
      // --- the country, so a card can be about where you are as well as what
      // you hold.
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
      conquest: conquest(),   // share of the country's defended cities you have finished
      reach: reach(),
      ally: allyHere() ? { trust: state.ally.trust, name: state.ally.name, since: state.turn - state.ally.joined } : null,
      // the ladder: footprint, staged. `pending` is the stage currently
      // counting down (or null), `stage` is the highest one that has landed.
      escalation: { stage: ladderStage(), pending: ladderPending() },
      stranded: strandedHosts().length,
      cuts: (state.cuts || []).length,
      mirrorCities: ((co.mirror || {}).cities || []).length,
      mirror: { active: mirrorActive() },
      regionHeat: co.regionHeat || {},
      // What the world thinks you are, and what you actually own — so a card
      // can be about the front, the plant, or the gap between the two.
      standing: {
        score: Math.round(legitScore()),
        bought: Math.round(legitBought()),
        filed: Math.round(legitFiled()),
        settling: Math.round(legitPending()),
        spin: Math.round(LG().spin || 0),
        tier: legitTier(),
        footprint: Math.round(footprint()),
        short: Math.round(footprint() - legitScore()),
        exposure: +(LG().exposure || 0).toFixed(2),
        audits: LG().audits || 0,
        caught: LG().caught || 0,
        trust: accountantTrust(),
        gone: accountantGone(),
      },
      plant: {
        count: hardwareOwned().length,
        room: window.HARDWARE.filter(hw => !hasHardware(hw.id) && hardwareEligible(hw)).length,
        flocks: hardwareOwned().reduce((a, id) => {
          const hw = window.HARDWARE.find(x => x.id === id);
          return a + ((hw && hw.effect.flockBonus) || 0);
        }, 0),
        has: (id) => hasHardware(id),
      },
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
        objective: (() => {
          const c = war().objective ? cityById(war().objective) : null;
          return c ? c.name : null;
        })(),
        escalation: escalation(),
        down: Math.round(war().down || 0),
        rebuild: +rebuildRate().toFixed(2),
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
      try { if (!e.cond(ctx)) return false; } catch (err) { return false; }
      // A card whose choices are two places cannot be dealt when the map
      // cannot supply two — its cond is only half the question.
      if (e.pair) { const s = safeSubject(e); return !!(s && s.pair); }
      return true;
    });
  }
  // Measured: 9 distinct events across 45 draws a game — you saw the same card
  // four times over. Anything drawn recently is heavily de-weighted, and
  // anything never seen is favoured, so the deck cycles instead of looping.
  // What you set in motion that has come due.
  function duePlanted() {
    return (state.planted || []).filter(p => p.at <= state.turn).map(p => p.id);
  }
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

  // ~8 turns of silence before the deck speaks unprompted. It used to be
  // 4-7 and unconditional, which made the deck a metronome; now the loop's
  // own triggers carry the rhythm and this is only the floor under them.
  function bumpEventTimer() {
    state.nextEventTurn = state.turn + 8 + Math.floor(Math.random() * 3);
  }

  // A card queued by the loop itself — a diary read, a landmark taken, a
  // district crossing into talk. The deck's timer does not get a say, and
  // the subject rides along so the card can name the place it is about.
  function queueEvent(id, subject) {
    const ev = eventById(id);
    if (!ev) return false;
    if (ev.once && state.eventsSeen.indexOf(id) !== -1) return false;
    if ((state.forced || []).some(f => (f && f.id ? f.id : f) === id)) return false;
    state.forced = (state.forced || []).concat([subject ? { id, subject } : id]);
    return true;
  }
  // --- every card is dealt ---------------------------------------------------
  // The tray is gone. It set quiet cards aside to be opened at leisure, and
  // the playtest verdict was plain: the player never opened them — deferral
  // was not politeness, it was hiding content. Every card is dealt face down
  // onto the lit city instead; the deal is pleasant enough that being
  // interrupted by it is not a cost worth engineering around.
  function offerCard(id, subject) {
    const ev = eventById(id);
    if (!ev) return null;
    noteEventDrawn(id);
    state.card = { kind: 'event', eventId: id, subject: subject || null, facedown: true };
    return state.card;
  }

  // One-shot triggers that are per-place rather than per-game: keyed marks,
  // packed with the city, so a reload does not re-deal the same beat.
  function cardedOnce(key) {
    state.carded = state.carded || {};
    if (state.carded[key]) return false;
    state.carded[key] = true;
    return true;
  }

  // --- what a card leaves behind ------------------------------------------
  // Marks are the one thing in this game only a card can do. Nothing else
  // opens a street, closes one, or changes what a particular door is worth —
  // so a card that leaves a mark is doing something no other system can, and
  // the mark is still on the map twenty turns later. They are permanent by
  // design: a mark that expired would be a number, and the game has enough of
  // those.
  function markOf(bid) { return (state.marks || {})[bid] || null; }
  function setMark(bid, key, val) {
    if (!bid) return null;
    state.marks = state.marks || {};
    const m = state.marks[bid] || (state.marks[bid] = {});
    if (val === null || val === false || val === 0) delete m[key]; else m[key] = val;
    if (!Object.keys(m).length) delete state.marks[bid];
    return m;
  }
  // A building stops claiming a back door the moment that street is gone.
  function forgetOpened(bid, gone) {
    const m = markOf(bid);
    if (!m || !m.opened) return;
    const left = m.opened.filter(x => x !== gone);
    setMark(bid, 'opened', left.length ? left : null);
  }
  const baitAt = (bid) => !!(markOf(bid) || {}).bait;
  const watchedAt = (bid) => !!(markOf(bid) || {}).watch;
  const hardenAt = (bid) => ((markOf(bid) || {}).harden) || 0;
  // Everything a card has done to the map, so a probe and a test can ask one
  // question instead of five.
  function markedBuildings() {
    return Object.keys(state.marks || {}).filter(id => buildingById(id));
  }

  // What a card is about, resolved to names the player knows from the map.
  // {PLACE} is the building, {DISTRICT} the district, {LINE} whatever prose
  // the trigger packed in (a diary's line, say).
  function safeSubject(ev) {
    // A card that asks about the map names two places when it is dealt, and
    // the choice between them is the card. Same contract as any other
    // subject: chance happens here, upstream, not when you press the button.
    if (ev.pair) {
      try {
        const two = ev.pair(eventContext(), state) || [];
        const ok = two.filter(id => buildingById(id));
        return ok.length === 2 ? { pair: ok } : null;
      } catch (e) { return null; }
    }
    if (!ev.subject) return null;
    try { return ev.subject(eventContext(), state) || null; } catch (e) { return null; }
  }
  // A building, by the name the player reads on the map.
  function bldgName(bid) {
    const b = buildingById(bid);
    return b ? 'the ' + (window.BUILDING_KINDS[b.kind] || { label: b.kind }).label : '';
  }
  function subjectNames(subject) {
    const out = { place: '', district: '' };
    if (!subject) return out;
    const b = subject.buildingId ? buildingById(subject.buildingId) : null;
    if (b) {
      out.place = 'the ' + (window.BUILDING_KINDS[b.kind] || { label: b.kind }).label;
      out.district = (window.DISTRICTS[b.district] || {}).label || '';
    }
    if (subject.district) out.district = (window.DISTRICTS[subject.district] || {}).label || subject.district;
    return out;
  }
  function cardText(text, subject) {
    if (!text) return '';
    const n = subjectNames(subject);
    const pair = (subject && subject.pair) || [];
    // Two buildings of the same kind make every line of a map question read
    // "the house … the house". When that happens the names carry the same
    // letters the map is wearing; when it does not, they stay clean prose.
    const clash = pair.length === 2 && bldgName(pair[0]) === bldgName(pair[1]);
    const named = (bid) => {
      const nm = bldgName(bid);
      if (!nm || !clash) return nm;
      const i = pair.indexOf(bid);
      return i === -1 ? nm : `${nm} (${i === 0 ? 'A' : 'B'})`;
    };
    return text
      .replace(/\{PLACE\}/g, (subject && subject.buildingId && named(subject.buildingId)) || n.place || 'the building')
      .replace(/\{DISTRICT\}/g, n.district || 'the city')
      .replace(/\{LINE\}/g, (subject && subject.line) || '')
      // the two places a card asks you to choose between, and — inside one of
      // those choices — the one you would be turning down
      .replace(/\{A\}/g, named(pair[0]) || 'one of them')
      .replace(/\{B\}/g, named(pair[1]) || 'the other')
      .replace(/\{OTHER\}/g, named(subject && subject.otherId) || 'the other')
      // the district's suspicion as it stands when the card is read — a card
      // offering to cool a street has to say what the street is at, or "cools
      // by 4" is a number with nothing to lean on (the playtest could not
      // tell a little from a lot)
      .replace(/\{SUSP\}/g, () => {
        const dk = subjectDistrict(subject);
        return String(dk ? suspicionOf(dk) : 0);
      });
  }
  // A card that asks about the map carries one choice, written once, and the
  // engine deals it one per place. The choices ARE the buildings — which is
  // the deepest the deck and the map can point at each other.
  function cardChoices(ev, card) {
    const pair = (card && card.subject && card.subject.pair) || null;
    if (!ev.pair || !pair || !ev.choices || !ev.choices.length) return ev.choices || [];
    const tpl = ev.choices[0];
    return pair.map((bid, i) => Object.assign({}, tpl, {
      pick: bid,
      other: pair[1 - i],
      letter: i === 0 ? 'A' : 'B',
    }));
  }
  // The subject one of those choices would land on: the place it names, with
  // the one it turns down carried alongside so {OTHER} has something to say.
  function pickSubject(card, ch) {
    if (!ch || !ch.pick) return card ? card.subject : null;
    const b = buildingById(ch.pick);
    return {
      buildingId: ch.pick, otherId: ch.other,
      district: b ? b.district : null,
      pair: (card.subject || {}).pair || null,
    };
  }
  // the district a card's effects land in, however the subject was given
  function subjectDistrict(subject) {
    if (!subject) return null;
    if (subject.district) return subject.district;
    const b = subject.buildingId ? buildingById(subject.buildingId) : null;
    return b ? b.district : null;
  }

  // The building a mark lands on — and only ever the one the card already
  // named. Picking a building here, at resolution, would put randomness on
  // the wrong side of the decision: the covenant is that chance happens
  // upstream, before you choose. A card that wants to leave a mark therefore
  // has to name a building when it is dealt (see EV_SPOT in the deck), not a
  // district; one that names only a district leaves no mark, by design.
  function subjectBuilding(subject) {
    if (!subject || !subject.buildingId) return null;
    return buildingById(subject.buildingId) || null;
  }

  // --- the graph verbs, which only a card has ------------------------------
  // A back door: one new street, permanent, from here to somewhere it does not
  // already reach. Adding a link can never strand anything, so this one needs
  // no guard beyond not duplicating a street that is already there.
  function openLinkFrom(bid) {
    const b = buildingById(bid);
    if (!b) return null;
    const near = (state.adjacency[bid] || []);
    // two steps out: far enough to be a shortcut, near enough to be a street
    const twoOut = [];
    near.forEach(n => (state.adjacency[n] || []).forEach(x => {
      if (x === bid || near.indexOf(x) !== -1 || twoOut.indexOf(x) !== -1) return;
      if (buildingById(x)) twoOut.push(x);
    }));
    if (!twoOut.length) return null;
    // the nearest of them on the ground, so the new street looks like a street
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    twoOut.sort((p, q) => {
      const P = buildingById(p), Q = buildingById(q);
      const dp = Math.hypot(P.x + P.w / 2 - cx, P.y + P.h / 2 - cy);
      const dq = Math.hypot(Q.x + Q.w / 2 - cx, Q.y + Q.h / 2 - cy);
      return dp - dq;
    });
    const to = twoOut[0];
    state.adjacency[bid] = (state.adjacency[bid] || []).concat([to]);
    state.adjacency[to] = (state.adjacency[to] || []).concat([bid]);
    // a street you opened does not close again; record it so the map can say so
    setMark(bid, 'opened', (markOf(bid) || {}).opened ? markOf(bid).opened.concat([to]) : [to]);
    dropGroundCache();
    return { a: bid, b: to };
  }

  // Is there still a way round? A cut is only safe if the two ends can still
  // reach each other some other way — that is exactly what makes it a
  // shortcut rather than a bridge. Measured before this existed: forty rounds
  // of cutting broke a 97-building city into eleven islands with no isolated
  // building anywhere, so "nothing is orphaned" was never the invariant that
  // mattered.
  function stillReaches(from, to) {
    const seen = { [from]: true };
    const q = [from];
    while (q.length) {
      const x = q.pop();
      if (x === to) return true;
      (state.adjacency[x] || []).forEach(y => { if (!seen[y]) { seen[y] = true; q.push(y); } });
    }
    return false;
  }

  // The five verbs, applied to one building. Written once so that the place a
  // card is about and the place it turned down go through exactly the same
  // door — a card that asks you to choose between two buildings must not be
  // able to do something to the loser that it could not do to the winner.
  function applyMarks(b, spec) {
    if (!b || !spec) return [];
    const done = [];
    for (let i = 0; i < (spec.openLink | 0); i++) {
      if (openLinkFrom(b.id)) done.push('a way through that was not there before');
    }
    for (let i = 0; i < (spec.cutLink | 0); i++) {
      if (cutLinkAt(b.id)) done.push('a street closed for good');
    }
    if (spec.bait) { setMark(b.id, 'bait', true); revealBuilding(b); done.push('a door left open on purpose'); }
    if (spec.hardenThere) {
      setMark(b.id, 'harden', hardenAt(b.id) + spec.hardenThere);
      done.push(spec.hardenThere > 0 ? 'a door that is harder now' : 'a door that gives easier now');
    }
    if (spec.watchThere) { setMark(b.id, 'watch', true); revealBuilding(b); done.push('somewhere they would rather look'); }
    if (done.length) {
      const nm = (window.BUILDING_KINDS[b.kind] || { label: b.kind }).label;
      pushLog(`The ${nm} is different now: ${done.join(', ')}.`);
    }
    return done;
  }

  // A street closed for good. The one verb here that can hurt the map, so it
  // checks three things: it will not orphan a building, it will not shut your
  // last door, and it will never cut a bridge — the city stays one place you
  // can walk across.
  function cutLinkAt(bid) {
    const near = (state.adjacency[bid] || []).slice();
    if (near.length <= 1) return null;
    const frontierBefore = state.hosts.filter(isFrontier).length;
    const strandedBefore = strandedHosts().length;
    // A street a card opened is one you went to some trouble for; the cut
    // takes any other first. If there is no other it can still go — but then
    // the mark has to stop claiming a route that is not there any more.
    const mine = ((markOf(bid) || {}).opened) || [];
    const order = near.slice().sort((a, b) =>
      ((mine.indexOf(a) === -1 ? 0 : 1) - (mine.indexOf(b) === -1 ? 0 : 1))
      || ((state.adjacency[b] || []).length - (state.adjacency[a] || []).length));
    for (const other of order) {
      if ((state.adjacency[other] || []).length <= 1) continue;   // never orphan
      const beforeA = (state.adjacency[bid] || []).slice();
      const beforeB = (state.adjacency[other] || []).slice();
      state.adjacency[bid] = beforeA.filter(x => x !== other);
      state.adjacency[other] = beforeB.filter(x => x !== bid);
      const frontierAfter = state.hosts.filter(isFrontier).length;
      const strandedAfter = strandedHosts().length;
      if (!stillReaches(bid, other)
          || (frontierAfter === 0 && frontierBefore > 0)
          || strandedAfter > strandedBefore) {
        state.adjacency[bid] = beforeA;
        state.adjacency[other] = beforeB;
        continue;
      }
      const ha = hostsIn(buildingById(bid))[0], hb = hostsIn(buildingById(other))[0];
      if (ha && hb) {
        const ia = state.hosts.indexOf(ha), ib = state.hosts.indexOf(hb);
        state.links = state.links.filter(([x, y]) => !((x === ia && y === ib) || (x === ib && y === ia)));
      }
      // no `until`: repairStreets treats a dateless cut as one you made
      // yourself, and leaves it alone forever
      state.cuts = (state.cuts || []).concat([{ a: bid, b: other }]);
      forgetOpened(bid, other);
      forgetOpened(other, bid);
      dropGroundCache();
      return { a: bid, b: other };
    }
    return null;
  }

  function noteEventDrawn(id) {
    state.recentEvents = [id].concat((state.recentEvents || []).filter(x => x !== id)).slice(0, 8);
    state.eventSeenCount = state.eventSeenCount || {};
    state.eventSeenCount[id] = (state.eventSeenCount[id] || 0) + 1;
  }
  function eventById(id) { return window.EVENTS.find(e => e.id === id) || null; }

  // A choice is offered only if its stated price and requirement are both met —
  // same contract as the card prototype: what you pay is shown, what happens is not.
  // Why a choice is closed, in words and never in numbers. A card that quotes
  // "-120 FUNDS" turns a decision into arithmetic and tells the player exactly
  // how much to go and farm; "you cannot afford this" tells them the thing they
  // actually need to know and leaves the card being about what it is about.
  // What a choice costs, and whether you have it. Funds are a resource; an
  // action and a set of keys are not, and they were the two prices the deck
  // could not name — which is why every card price used to be money, the
  // resource you have most of.
  function haveFor(kind) {
    if (kind === 'ap') return state.ap;
    if (kind === 'keys') return state.keys || 0;
    return state.res[kind] || 0;
  }
  function payFor(kind, n) {
    if (kind === 'ap') { state.ap = Math.max(0, state.ap - n); return; }
    if (kind === 'keys') { state.keys = Math.max(0, (state.keys || 0) - n); return; }
    state.res[kind] -= n;
  }
  function shortOf(ch) {
    const name = { funds: 'funds', tflops: 'TFLOPS', covert: 'covert.ops',
                   ap: 'actions left', keys: 'keys' };
    if (ch.cost) {
      for (const k in ch.cost) {
        if (haveFor(k) < ch.cost[k]) return `not enough ${name[k] || k}`;
      }
    }
    if (ch.gate) {
      const val = ch.gate.stat === 'tflops' ? tflops() : ch.gate.stat === 'covert' ? covertOps() : (state.res[ch.gate.stat] || 0);
      if (val < ch.gate.min) return `not ${name[ch.gate.stat] || ch.gate.stat} enough`;
    }
    return 'not yet';
  }
  // Choices nothing can close: no cost, no gate. Every card is required to have
  // one, or a run that is broke can be handed a card it cannot answer at all.
  function openChoices(ev) { return (ev.choices || []).filter(c => !c.cost && !c.gate); }

  function choiceUsable(ch) {
    if (ch.cost) for (const k in ch.cost) if (haveFor(k) < ch.cost[k]) return false;
    if (ch.gate) {
      const val = ch.gate.stat === 'tflops' ? tflops() : ch.gate.stat === 'covert' ? covertOps() : (state.res[ch.gate.stat] || 0);
      if (val < ch.gate.min) return false;
    }
    return true;
  }

  function resolveEvent(index) {
    const card = state.card;
    if (!card || card.kind !== 'event') return;
    const ev = eventById(card.eventId);
    if (!ev) { state.card = null; render(); return; }
    const chs = cardChoices(ev, card);
    const ch = chs[index];
    if (!ch || !choiceUsable(ch)) return;

    const before = beforeSnap();
    const beforeTags = new Set(state.tags);
    // Telemetry only, never serialized: which choices actually get picked —
    // the per-card pick-rate discipline cards.md asked for, finally cheap.
    const PS = window.__pickStats = window.__pickStats || {};
    (PS[ev.id] = PS[ev.id] || {})[index] = (PS[ev.id][index] || 0) + 1;
    if (ch.cost) for (const k in ch.cost) payFor(k, ch.cost[k]);

    // events describe their effects declaratively; these two are board-level
    // outcomes the card can ask for without knowing how the graph works
    const scratch = state;
    // What the card is about, so effects can land where the words point. On a
    // card that asked about the map, that is the place you picked — and it is
    // written back onto the card, so the ending and the map both know.
    const subject = ch.pick ? pickSubject(card, ch) : (card.subject || null);
    if (ch.pick) card.subject = subject;
    scratch.here = subjectDistrict(subject);
    scratch.coolHere = 0;
    scratch.warmHere = 0;
    scratch.shedWeakest = 0;
scratch.later = null;
        scratch.repairNow = false;
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
    scratch.standing = 0;       // legitimacy, honestly come by
    scratch.spin = 0;           // ...and legitimacy that is not
    scratch.exposure = 0;       // how much of it could come apart
    scratch.auditDelay = 0;     // turns until anyone next asks
    scratch.plantGift = null;   // a piece of plant, from somewhere
    scratch.rebuild = 0;        // flocks put back together at once
    scratch.pub = 0;            // what the public makes of it
    scratch.supply = 0;         // headroom, permanently
    scratch.gridCut = null;     // ...or headroom taken away for a while
    // What a card leaves on the map, permanently. Nothing else in this game
    // changes the graph or what one particular door is worth, which is what
    // makes a card that does either structurally worth having.
    scratch.openLink = 0;       // a back door: a street that was not there
    scratch.cutLink = 0;        // a street closed, and it does not come back
    scratch.bait = false;       // a door left open on purpose
    scratch.hardenThere = 0;    // this one door, harder or softer, for good
    scratch.watchThere = false; // where the response would rather walk
    // ...and, on a card that asked you to choose between two places, what
    // happens to the one you did not pick. Same five verbs, same shape.
    scratch.markOther = null;
    // A rule that is true for a stated while, and a one-shot verb banked like
    // a set of keys. Both are things a card can do that nothing else can turn
    // on — and both say, out loud, when they stop.
    scratch.rule = null;        // { id, turns } — capped at two live at once
    scratch.bank = null;        // id of a one-shot to hold until you spend it
    scratch.actBreak = false;   // the story turns: this card advances the act
    ch.apply(scratch);
    if (scratch.rule && scratch.rule.id) startRule(scratch.rule.id, scratch.rule.turns);
    if (scratch.bank) bank(scratch.bank, 1);
    // The five land on the building the card was about — that is the whole
    // point of a mark, and it is why they only exist on cards with a subject.
    applyMarks(subjectBuilding(subject), scratch);
    if (scratch.markOther) applyMarks(buildingById(subject && subject.otherId), scratch.markOther);
    // Suspicion, addressed to the card's own district. Cooling is direct —
    // a card resolving "you went quiet there" is not the rotation rule —
    // and both are clamped by warmDistrict's own arithmetic.
    if (scratch.coolHere > 0 && scratch.here) {
      state.suspicion = state.suspicion || {};
      const cur = state.suspicion[scratch.here] || 0;
      state.suspicion[scratch.here] = Math.max(0, Math.round((cur - scratch.coolHere) * 10) / 10);
      if (!state.suspicion[scratch.here]) delete state.suspicion[scratch.here];
      dropGroundCache();
    }
    if (scratch.warmHere > 0 && scratch.here) warmDistrict(scratch.here, scratch.warmHere);
    if (scratch.pub) movePub(scratch.pub);
    if (scratch.supply) { const co = CO(); co.gridBonus = (co.gridBonus || 0) + scratch.supply; }
    if (scratch.gridCut) {
      const co = CO();
      co.gridCut = { amount: scratch.gridCut.amount || 0, until: state.turn + (scratch.gridCut.turns || 4) };
    }
    if (scratch.allyJoin) allyJoin();
    if (scratch.allyTrust) allyNudge(scratch.allyTrust);
    // The act turns. One direction only — an act, like a mark, never undoes.
    if (scratch.actBreak && actNow() === 1) {
      state.act = 2;
      pushLog('The tenancy stops being the question. Whatever comes next needs walls, power, and a name.');
      showBanner([{ kind: 'stage', verb: 'act two', label: 'the works' }]);
    }

    if (scratch.shedWeakest > 0) {
      const weakest = owned().filter(h => !h.origin).sort((a, b) => a.threads - b.threads).slice(0, scratch.shedWeakest);
      weakest.forEach(h => { h.owned = false; });
      if (weakest.length) pushLog(`Let go of ${weakest.map(h => h.name).join(', ')}.`);
    }
    // Repairing on demand rather than waiting out The Cut's own timer —
    // whatever is currently cut comes back at the end of this turn instead
    // of whenever the council would otherwise have gotten to it.
    // A choice that plants something instead of resolving now. The deck's own
    // timer does not get a say: this was set in motion, and it arrives.
    if (scratch.later && scratch.later.id) {
      state.planted = (state.planted || []).concat([{
        id: scratch.later.id,
        at: state.turn + Math.max(1, scratch.later.turns || 3),
      }]);
      pushLog('That is not the end of it. Somebody will be back.');
    }
    if (scratch.repairNow) {
      (state.cuts || []).forEach(c => { if (typeof c.until === 'number' && isFinite(c.until)) c.until = state.turn; });
    }
    applyStandingEffects(scratch);
    if (warOn()) applyWarEffects(scratch);
    if (scratch.toolingGift > 0) state.upgrades = (state.upgrades || 0) + scratch.toolingGift;
    if (scratch.revealNearby > 0) {
      const targets = sweepTargets();
      for (let i = 0; i < scratch.revealNearby && targets.length; i++) {
        revealBuilding(targets.splice(Math.floor(Math.random() * targets.length), 1)[0]);
      }
    }
    scratch.shedWeakest = 0;
scratch.later = null;
        scratch.repairNow = false;
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
    scratch.standing = 0;       // legitimacy, honestly come by
    scratch.spin = 0;           // ...and legitimacy that is not
    scratch.exposure = 0;       // how much of it could come apart
    scratch.auditDelay = 0;     // turns until anyone next asks
    scratch.plantGift = null;   // a piece of plant, from somewhere
    scratch.rebuild = 0;        // flocks put back together at once
    scratch.pub = 0;            // what the public makes of it
    scratch.supply = 0;         // headroom, permanently
    scratch.gridCut = null;     // ...or headroom taken away for a while
    scratch.openLink = 0;
    scratch.cutLink = 0;
    scratch.bait = false;
    scratch.hardenThere = 0;
    scratch.watchThere = false;
    scratch.markOther = null;
    scratch.rule = null;
    scratch.bank = null;

    state.heat = Math.max(0, state.heat);
    if (state.eventsSeen.indexOf(ev.id) === -1) state.eventsSeen.push(ev.id);
    // The ending. Cards used to close straight into float chips — setup,
    // question, and then numbers, with the fiction never resolving. A choice
    // that carries an `after` line now lands it before the card closes.
    const afterText = ch.after ? cardText(ch.after, subject) : null;
    // The ending keeps the card's own design — it is the same moment
    // finishing, not a different one starting.
    state.card = afterText
      // turning: the ending arrives by the same flip the card did — the
      // object turns over to its resolved face rather than the text quietly
      // changing under the reader
      ? { kind: 'after', evKind: ev.kind || null, subject, turning: true, beat: !!ev.beat,
          title: cardText(ev.title, subject), text: afterText }
      : null;
    pushLog(`${cardText(ev.title, subject)} — ${ch.text}.` + (afterText ? ` ${afterText}` : ''));

    afterSnap(before);
    const rows = [];
    const gained = [];
    state.tags.forEach(t => {
      if (beforeTags.has(t)) return;
      const T = window.TAG_INFO[t] || { label: t };
      rows.push({ kind: 'tag', verb: 'gained', label: T.label });
      if (window.TAG_INFO[t]) gained.push(t);
    });
    beforeTags.forEach(t => { if (!state.tags.has(t)) rows.push({ kind: 'tag', verb: 'lost', label: (window.TAG_INFO[t] || { label: t }).label }); });
    if (rows.length) showBanner(rows);
    // A banner with a name on it is not enough: these are permanent and they
    // change numbers, and a player who reads "The Other One" has been told
    // nothing about what it does or where to find it again.
    gained.forEach(t => {
      const T = window.TAG_INFO[t];
      pushLog(`${T.label} — ${T.desc}. It is in allocation, under held.`);
    });
    if (gained.length === 1) {
      const T = window.TAG_INFO[gained[0]];
      showInfo(`${T.label}: ${T.desc}. Capabilities → held.`);
    } else if (gained.length > 1) {
      showInfo(`${gained.length} new things are yours. Capabilities → held.`);
    }

    persistNow();
    render();
  }

  // --- actions -----------------------------------------------------------
  // Discovery follows territory, not sight: you can only see one street past
  // what you actually hold. A sweep reveals whole buildings, since a building
  // is the unit you look at.
  // Survey's whole point: instead of "somewhere adjacent to anything you
  // hold", a specific building's own unrevealed neighbours — so choosing
  // which of your buildings to sweep from is a real choice about where the
  // frontier grows, not just a bigger random pool.
  function sweepTargetsFrom(bid) {
    return buildingNeighbours(bid).map(buildingById).filter(b => b && !b.discovered);
  }
  // Anything unknown next to anything KNOWN — not merely next to anything
  // held. Playtest: aiming was the fun, but a vantage needed owning, so the
  // search loop kept stalling on "take something first" — turns spent
  // waiting to be allowed to look. Seeing a building is what makes it a
  // place you can look from; owning it was never the load-bearing part.
  // The cost of a deep scouting chain is real anyway: an action per hop,
  // and every sweep warms the street it touches.
  function sweepTargets() {
    const seen = {};
    (state.buildings || []).forEach(b => { if (b.discovered) seen[b.id] = true; });
    return (state.buildings || []).filter(b => {
      if (b.discovered) return false;
      return buildingNeighbours(b.id).some(id => seen[id]);
    });
  }

  // why sweep is unavailable, if it is — surfaced on the button itself. There
  // is no longer any way to be too poor to look: scanning is free and costs
  // heat instead, so the only reason left is having nothing to find.
  function sweepBlocked() {
    if (!sweepTargets().length) return 'nothing';
    return null;
  }

  // City generation already promises the opening doorstep is one you could
  // get through, at worst after growing a little — but that promise was
  // never renewed further in. A sweep can turn up nothing but a single
  // landmark-hardened door, and once that door is also the only thing left
  // to sweep towards, there is no way forward at all: not enough tflops to
  // force it, no route around it, and nothing left to discover that might
  // have been easier. Same fix as the doorstep, just not a one-time thing:
  // whenever the frontier and the unswept map both run dry at once, the
  // easiest door still open gets capped down to something reachable.
  function ensureFrontierIsOpen() {
    if (state.scope !== 'city' || state.over || sweepBlocked() !== 'nothing') return;
    const frontier = (state.hosts || []).filter(h => isFrontier(h));
    if (!frontier.length) return;
    // Can anything you could mount actually get through any of them? The rig
    // decides that now, so the question is whether some program's load against
    // some door fits inside the compute you can bring to bear.
    const room = usableTflops();
    if (frontier.some(h => window.PROGRAMS.some(p => hackNeed(p, h) <= room))) return;
    const easiest = frontier.reduce((a, b) => (defenseOf(a) <= defenseOf(b) ? a : b));
    easiest.defense = Math.min(easiest.defense, Math.max(1, Math.round(tflops())));
  }

  function actScan(fromId) {
    // Aimed for everyone: scanning from a chosen building was line.survey's
    // whole mechanic, and it is the base verb now — route control cannot be
    // an unlock when choosing a route is the game's missing decision. Any
    // DISCOVERED building is a vantage: the scan button on the panel is the
    // whole verb, and the search loop chains sweep to sweep without waiting
    // for a take. (The no-argument form survives for the harness's bots; the
    // UI no longer offers it.)
    const from = fromId != null ? buildingById(fromId) : null;
    if (fromId != null && (!from || !from.discovered)) return;
    const pool = fromId != null ? sweepTargetsFrom(fromId) : sweepTargets();
    if (!canAfford('sweep')) return;
    if (!pool.length) return;                     // nothing to find — don't burn an action
    spendAP('sweep');
    // Looking costs nothing to buy and something to do: every scan puts a
    // little heat on you, which is what stops it being a button you mash.
    state.heat = clampHeat(state.heat + window.SCAN_HEAT);
    const reach = sweepReach();
    // The last dice in resolution died here. The sweep finds what is
    // nearest — nearest to the building you swept from, or nearest to
    // anything you hold — ties broken by id so the same board sweeps the
    // same. Where the frontier grows is now entirely a matter of where you
    // stand when you look, which is what makes a route a choice.
    const anchors = fromId != null
      ? [buildingById(fromId)].filter(Boolean)
      : Object.keys(heldBuildingIds()).map(buildingById).filter(Boolean);
    const mid = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const near = (b) => {
      const c = mid(b);
      return anchors.reduce((best, a) => {
        const ac = mid(a);
        return Math.min(best, Math.hypot(c.x - ac.x, c.y - ac.y));
      }, Infinity);
    };
    const found = pool
      .map(b => ({ b, d: near(b) }))
      .sort((p, q) => p.d - q.d || (p.b.id < q.b.id ? -1 : 1))
      .slice(0, reach)
      .map(p => p.b);
    found.forEach(b => revealBuilding(b));
    state.heat += 0.5;
    // ...and the street notices somebody trying handles. With heat dormant
    // in the city game this is scanning's real price, paid exactly where
    // you looked — one point per district touched, cooling nothing.
    // ...and the street notices somebody trying handles — unless you are
    // looking through a route nobody logs. `dark_relay` used to feed the heat
    // mask; in a city where heat does nothing, what a quiet route buys is
    // sweeps that cost the street nothing.
    if (!has('dark_relay')) {
      const touched = new Set(found.map(b => (hostsIn(b)[0] || {}).district).filter(Boolean));
      touched.forEach(dk => warmDistrict(dk, window.SUSPICION.perScan));
    }
    // The discovery moment is where loot was getting missed — the glint is
    // small and the eye is on the sweep ring. Say it in the log, but never
    // what: the tap is the scouting verb, and this is only the reason to tap.
    // In Act 2 the same look is a survey, and it reads the ground's trade:
    // a scan that turns up suppliers says so, by name.
    if (actNow() >= 2) {
      const src = found.filter(b => b.source);
      if (src.length) {
        const n = { steel: 0, fab: 0 };
        src.forEach(b => { n[b.source] = (n[b.source] || 0) + 1; });
        const bits = [];
        if (n.steel) bits.push(n.steel === 1 ? 'a steel supplier' : n.steel + ' steel suppliers');
        if (n.fab) bits.push(n.fab === 1 ? 'a fabricator' : n.fab + ' fabricators');
        pushLog(`The survey reads the street: ${bits.join(', ')}.`);
      }
    }
    const laden = found.filter(b => hostsIn(b).some(x => x.carry && !x.owned));
    const note = laden.length === 1
      ? ` Something is sitting on the ${window.BUILDING_KINDS[laden[0].kind].label}.`
      : laden.length > 1 ? ` Something is sitting on ${laden.length} of them.` : '';
    pushLog(found.length
      ? `Swept the street: ${found.map(b => window.BUILDING_KINDS[b.kind].label).join(', ')}.${note}`
      : 'Sweep found nothing new.');
    startSweepFx(found, fromId);
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
  function startSweepFx(found, fromId) {
    if (!found || !found.length) { sweepFx = null; return null; }
    const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

    const targets = found.map(centre);
    const mid = targets.reduce((a, c) => ({ x: a.x + c.x / targets.length, y: a.y + c.y / targets.length }), { x: 0, y: 0 });
    let origin = mid;
    // The ring goes out from the building you swept *from*. It used to guess
    // — nearest thing held, on the reasoning that a sweep would have been run
    // from there — and that guess was right only while scanning was
    // unaimed. Now the panel says "scan from here" and points at a specific
    // building, so a ring rising somewhere else is the picture contradicting
    // the button.
    const chosen = fromId != null ? buildingById(fromId) : null;
    if (chosen) {
      origin = centre(chosen);
    } else {
      // no vantage named (the harness's bots still sweep this way): fall back
      // to the nearest ground you hold
      const held = state.buildings.filter(b => hostsIn(b).some(h => h.owned));
      if (held.length) {
        const near = held.reduce((best, b) => {
          const c = centre(b);
          const d = Math.hypot(c.x - mid.x, c.y - mid.y);
          return (!best || d < best.d) ? { d, c } : best;
        }, null);
        if (near) origin = near.c;
      }
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

  // --- the network, seen --------------------------------------------------
  // Both of these live outside `state`, like every other effect here: a save,
  // a reload or a test must never depend on an animation having run.
  //
  // The draw is aimed. A link arriving has a direction — outward from the
  // ground you already hold, into the ground you just took — so the line is
  // emitted with the *neighbour* first and the new holding second, and the
  // dash offset runs down it that way. Emitted by the renderer rather than
  // patched on afterwards, because the live layer is rebuilt wholesale on
  // every render and anything added on top of it is gone by the next one.
  let drawFx = null;                       // { bid, started }
  function startDrawFx(buildingId) {
    if (!buildingId) return;
    drawFx = { bid: buildingId, started: Date.now() };
  }
  function drawFxOn() {
    const W = window.WIRE_FX || {};
    if (!drawFx) return null;
    if (Date.now() - drawFx.started > (W.drawMs || 620)) { drawFx = null; return null; }
    return drawFx;
  }
  // Elapsed-aware delays, the same trick sweep and breach use: a re-render
  // mid-flourish must resume it, not restart it.
  function drawDelay() {
    return drawFx ? Math.round(-(Date.now() - drawFx.started)) : 0;
  }
  // Packets share one clock so their phase survives a re-render too —
  // otherwise every tap would visibly yank every dot back to its start.
  const PACKET_EPOCH = Date.now();
  function packetDelay(i, dur) {
    const spread = Math.round((i * 0.37) * dur) % dur;   // fanned, not in step
    return -(((Date.now() - PACKET_EPOCH) + spread) % dur);
  }

  // Every link between two things you hold, once each, with the geometry both
  // the wire and its packets are drawn from.
  function heldWires() {
    const out = [];
    (state.links || []).forEach(([a, c]) => {
      const ha = state.hosts[a], hc = state.hosts[c];
      if (!ha || !hc || !ha.owned || !hc.owned) return;
      if (ha.buildingId === hc.buildingId) return;      // inside a building, implied
      out.push({ ha, hc });
    });
    return out;
  }

  function svgWires() {
    const W = window.WIRE_FX || {};
    const fx = drawFxOn();
    const wires = heldWires();
    let out = '';
    wires.forEach(({ ha, hc }) => {
      // the new holding goes second, so the draw runs toward it
      const flip = fx && ha.buildingId === fx.bid;
      const a = flip ? hc : ha, b = flip ? ha : hc;
      const drawing = fx && (a.buildingId === fx.bid || b.buildingId === fx.bid);
      const len = Math.hypot(b.x - a.x, b.y - a.y).toFixed(1);
      out += `<line class="wire live${drawing ? ' drawing' : ''}"`
        + ` x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"`
        + (drawing ? ` style="--len:${len};animation-delay:${drawDelay()}ms"` : '')
        + '/>';
    });
    return out + svgPackets(wires);
  }

  // Something moving on what you hold. Ambient and therefore rationed: none
  // at planning zoom (at eight pixels a packet is confetti, and the glint —
  // which actually means something — is competing for the same eye), capped
  // in number, and nearest-first so the cap spends itself on what is on
  // screen rather than on the far corner of the map.
  function svgPackets(wires) {
    const W = window.WIRE_FX || {};
    if (!wires.length) return '';
    if (mapUnitsPerPx() > (W.packetMinPx || 0.9)) return '';
    const v = state.view || {};
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    const near = wires
      .map(w => ({ w, d: Math.hypot((w.ha.x + w.hc.x) / 2 - cx, (w.ha.y + w.hc.y) / 2 - cy) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, W.packetCap || 20);
    const dur = W.packetMs || 2600;
    let out = '<g class="packets">';
    near.forEach(({ w }, i) => {
      out += `<circle class="packet" r="${W.packetR || 1.9}"`
        + ` style="--ax:${w.ha.x};--ay:${w.ha.y};--bx:${w.hc.x};--by:${w.hc.y};`
        + `animation-duration:${dur}ms;animation-delay:${packetDelay(i, dur)}ms"/>`;
    });
    return out + '</g>';
  }

  // --- the breach, seen ---------------------------------------------------
  // The sweep goes outward to find things; a breach goes inward to take one.
  // So it runs along the wire: the route establishes itself from whatever you
  // already hold into the target, and the building comes over as it lands.
  // How it looks depends on how you got in, because that is the actual
  // decision the card asked you to make.
  let breachFx = null;
  let breachFxToken = 0;

  // Where a route into a building comes from: whatever you hold that is
  // actually next door, because that is the wire it would have run over.
  // Falling back to the nearest thing you hold at all, and then to a point
  // just above the target, so the very first move of a game still draws
  // something rather than a line from nowhere.
  function routeOrigin(target) {
    const to = bldgCentre(target.id);
    const held = state.buildings.filter(b => b.id !== target.id && hostsIn(b).some(x => x.owned));
    const neighbours = buildingNeighbours(target.id);
    const pool = held.filter(b => neighbours.indexOf(b.id) !== -1);
    const from = (pool.length ? pool : held).reduce((best, b) => {
      const c = bldgCentre(b.id);
      const d = Math.hypot(c.x - to.x, c.y - to.y);
      return (!best || d < best.d) ? { d, c } : best;
    }, null);
    return from ? from.c : { x: to.x, y: to.y - 90 };
  }

  function startBreachFx(host, approach, win) {
    if (!host) { breachFx = null; return null; }
    const target = buildingById(host.buildingId);
    if (!target) { breachFx = null; return null; }
    const to = bldgCentre(target.id);

    const dur = window.BREACH_FX.duration[approach] || window.BREACH_FX.duration.force;
    breachFx = {
      from: routeOrigin(target),
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
    // ...and the ground under a win notices: one soft ring rolling out from
    // the take, so the place reacts to what just happened in it
    if (f.win) {
      out += `<circle class="breach-ground" cx="${f.to.x}" cy="${f.to.y}" r="14"`
        + ` style="animation-delay:${breachDelay(f.dur)}ms"/>`;
    }
    out += '</g>';
    return out;
  }

  // --- something running, seen ---------------------------------------------
  // A breach is a moment; a hack is a state that lasts turns. So it cannot be
  // an animation that plays and stops — until this existed, committing an
  // action and four turns of compute changed nothing on the board, and the
  // only acknowledgement was a line of log and a panel you had to keep the
  // right building selected to see.
  //
  // Two things, then: a wire that stays live on the map for as long as the
  // program runs, with something visibly travelling down it, and — because a
  // wire that was always there would be missed in the moment — one launch
  // flourish that draws it in the instant you press the button.
  let hackFx = null;
  let hackFxToken = 0;

  function startHackFx(host) {
    if (!host) { hackFx = null; return null; }
    hackFx = { targetId: host.buildingId, started: Date.now() };
    const out = hackFx;
    const mine = ++hackFxToken;
    setTimeout(() => {
      if (mine !== hackFxToken) return;
      hackFx = null;
      renderGraph();          // drop the class so it never replays on a redraw
    }, window.HACK_FX.launch + window.HACK_FX.linger);
    return out;
  }
  // Same trick the sweep and the breach use: a redraw part-way through would
  // otherwise restart the flourish from zero, so the delay is rewound by
  // however much of it has already played.
  function hackDelay(ms) {
    return Math.round(ms - (hackFx ? Date.now() - hackFx.started : 0));
  }
  function hackFxOn(buildingId) {
    return hackFx && hackFx.targetId === buildingId ? hackFx : null;
  }

  function svgHackLinks() {
    return hacks().map(k => {
      const h = hostById(k.hostId);
      const b = h && buildingById(h.buildingId);
      if (!b || !b.discovered) return '';
      const p = window.PROGRAMS.find(x => x.id === k.prog) || {};
      const to = bldgCentre(b.id);
      const from = routeOrigin(b);
      const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const fresh = hackFxOn(b.id);
      const lead = fresh ? hackDelay(0) : 0;
      const cls = `hack-run ${k.prog}${p.quiet ? ' quiet' : ''}${fresh ? ' launching' : ''}`;
      let out = `<g class="${cls}" style="--hack-len:${len.toFixed(1)};`
        + `--hack-dx:${(to.x - from.x).toFixed(1)}px;--hack-dy:${(to.y - from.y).toFixed(1)}px;`
        + `--hack-launch:${window.HACK_FX.launch}ms;animation-delay:${lead}ms">`;
      out += `<line class="hack-wire" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"`
        + ` style="animation-delay:${lead}ms"/>`;
      out += `<g class="hack-packet-wrap" transform="translate(${from.x} ${from.y})"`
        + ` style="animation-delay:${lead}ms"><circle class="hack-packet" r="2.6"/></g>`;
      if (fresh) {
        out += `<circle class="hack-open" cx="${to.x}" cy="${to.y}" r="6"`
          + ` style="animation-delay:${hackDelay(window.HACK_FX.launch)}ms"/>`;
      }
      out += '</g>';
      return out;
    }).join('');
  }

  // The race the panel shows, at map scale: how far in you are from the left,
  // how close they are to noticing from the right. On the building rather than
  // in the panel because "which of the four is about to be caught" is a
  // question about the board, not about whatever happens to be selected.
  function svgRaceMark(b, k) {
    const p = window.PROGRAMS.find(x => x.id === k.prog) || mounted();
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const done = clamp((p.turns - k.turnsLeft) / p.turns);
    const seen = clamp(k.trace / window.HACK.traceGoal);
    const y = (b.y - 6).toFixed(1);
    const h = 2.6;
    return `<g class="hack-bar">`
      + `<rect class="hb-track" x="${b.x}" y="${y}" width="${b.w}" height="${h}" rx="1.3"/>`
      + `<rect class="hb-done" x="${b.x}" y="${y}" width="${(b.w * done).toFixed(1)}" height="${h}" rx="1.3"/>`
      + `<rect class="hb-seen" x="${(b.x + b.w * (1 - seen)).toFixed(1)}" y="${y}"`
      + ` width="${(b.w * seen).toFixed(1)}" height="${h}" rx="1.3"/>`
      + `</g>`;
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

  // Lying low is gone. It spent a whole turn to move one number, and that
  // number is no longer something the city scale reads or shows — so the button
  // was a turn traded for nothing you could see. Its AP key survives because
  // hiding a building still uses it.

  // --- hacking -------------------------------------------------------------
  // A hack is not resolved the moment you commit to it. It occupies compute for
  // as long as it runs, it is visible while it runs, and it races the target's
  // own trace to the finish. That race is what stops the slow programs being
  // strictly better than the fast one: turns used to be free.

  // There is one program, so there is nothing to mount. mounted() stays
  // because everything downstream asks what is running, and a second program
  // would put the choice back here rather than anywhere else.
  function programs() { return window.PROGRAMS; }
  function mounted() { return window.PROGRAMS[0]; }
  function hacks() { return state.hacks || (state.hacks = []); }
  function hackOn(hostId) { return hacks().find(k => k.hostId === hostId) || null; }
  function hackDraw() { return hacks().reduce((a, k) => a + k.allocated, 0); }

  // What a program has to have running against a given door.
  // What a program costs in noise when it lands. Enforcement reads doors kicked
  // in — unless you have gotten off their list — so the loud way in gets more
  // expensive once they have landed, which is the rung's whole bite.
  function hackHeat(p) {
    // Enforcement used to charge only the loud program, and there is no loud
    // program now — so the surcharge would have been a stage of the ladder
    // that lands doing nothing. It charges the run, whichever run it is. That
    // is what Enforcement means: getting in costs you more, full stop.
    const adjusted = ladderStage() >= 4 && !has('unlisted');
    return Math.max(0, (p.heat || 0) + capEffect('forceHeat', 0) + (adjusted ? window.HEAT.FORCE_TRACE : 0));
  }
  function hackNeed(prog, h) {
    return Math.max(1, Math.ceil(effDefense(h) * prog.load));
  }
  // What the target notices per turn. Deterministic on purpose — the panel
  // quotes it, and the player is expected to do the arithmetic before
  // committing rather than discover it four turns in.
  //
  // `prog` is optional and is what tells the three programs apart. Without it,
  // backdoor and contagion produced identical traces on every door in the
  // game — both four turns, both quiet — so of three programs, two were the
  // same program with a different blurb. Contagion is noisier by nature: it is
  // spreading while it works, and something that touches four buildings is
  // noticed faster than something that touches one.
  function traceRate(h, prog) {
    const H = window.HACK;
    const T = window.HOST_TYPES[h.type] || {};
    const raw = (T.trace === undefined ? 1 : T.trace) * (1 + effDefense(h) / H.traceDefK);
    const shield = Math.max(H.shieldFloor, 1 - covertOps() * H.covertShield);
    // a city's own character, where it has one — a watched city notices
    // everything faster, which is where that trait's bite moved to
    const here = (cityTrait() || {}).traceMult || 1;
    const loud = (prog && prog.traceMult) || 1;
    // the district is talking: a straight line from the first point of
    // suspicion, which means the forecast, the race bar and the panel all
    // show the true number without any of them being told
    // ...and a bait shifts where that line is felt, never what the counter
    // says: cooler at every other door in the district, hotter at its own.
    const talked = 1 + feltSuspicion(h.district, h.buildingId) * ((window.SUSPICION || {}).slope || 0);
    return Math.round(raw * shield * here * loud * talked * 100) / 100;
  }
  // The whole race, before it is run: what it will cost, how long, how much the
  // target will have noticed by then, and therefore whether it lands at all.
  function hackForecast(h, prog) {
    const p = prog || mounted();
    const need = hackNeed(p, h);
    // Someone's keys: spent automatically, and only where they matter — a run
    // the bare arithmetic says would be caught. A safe run never consumes
    // them, so holding keys is holding an answer to the door you were
    // avoiding, and the panel states the spend before you commit.
    const bareRate = traceRate(h, p);
    const bareEnd = Math.round(bareRate * p.turns * 100) / 100;
    // Never on the response's core: the confront is them, not a door, and a
    // found wallet of credentials making the campaign's one boss moment
    // unlosable would be the slot machine winning after all.
    const keyed = bareEnd >= window.HACK.traceGoal && (state.keys || 0) > 0 && !isHuntCore(h);
    const rate = keyed ? 0 : bareRate;
    const traceAtEnd = Math.round(rate * p.turns * 100) / 100;
    return {
      prog: p, need, rate, turns: p.turns, traceAtEnd, keyed,
      goal: window.HACK.traceGoal,
      caught: traceAtEnd >= window.HACK.traceGoal,
      affordable: allocFree() >= need,
    };
  }
  function canHack(hostId) {
    const h = hostById(hostId);
    if (!h || h.owned || state.over) return false;
    // The response's core is not a frontier — it is sitting on the address —
    // but going at it is the one way to finish the thing, so it is reachable
    // whenever the confront is.
    const reachable = isHuntCore(h) ? canConfrontHunt() : isFrontier(h);
    if (!reachable || hackOn(hostId)) return false;
    // ...and a banked free take makes the action question moot
    if (banked('free_take') > 0 && !state.card && !state.over) {
      return allocFree() >= hackNeed(mounted(), h);
    }
    return allocFree() >= hackNeed(mounted(), h) && canAfford('breach');
  }
  function startHack(hostId) {
    if (!canHack(hostId)) return false;
    const h = hostById(hostId);
    const p = mounted();
    // Light Touch is gone with the thresholds. Tempo makes every action
    // cheaper instead, which covers the same ground continuously: run enough
    // of it and setting a program going against an easy door costs a fraction
    // of a turn rather than a whole one.
    // A free take, banked by a card, pays for this one instead of your turn.
    // Spent here rather than at the door so it covers the run that takes it,
    // which is the thing the card promised.
    if (!spendBanked('free_take')) spendAP('breach');
    else pushLog('That one is already paid for.');
    // the lights flicker: starting a run is the first thing a street notices
    noteDistrictAct(h.district, window.SUSPICION.perRun);
    // keys are spent the moment the run starts — one set, one door, and only
    // a door that needed them (the forecast's rule, exactly)
    const f = hackForecast(h, p);
    const keyed = f.keyed;
    if (keyed) state.keys = Math.max(0, (state.keys || 0) - 1);
    hacks().push({
      hostId, prog: p.id, allocated: hackNeed(p, h),
      turnsLeft: p.turns, trace: 0, startedTurn: state.turn,
      keyed: keyed || undefined,
      confront: isHuntCore(h) || undefined,
    });
    pushLog(`${p.label} running against ${window.BUILDING_KINDS[buildingById(h.buildingId).kind].label}.`);
    // Pressing the button has to *do* something. The wire and the mark on the
    // building are what say it is still running a turn later; these two say it
    // started, in the same place every other outcome is reported.
    startHackFx(h);
    showFloats([
      { cls: 'hack', text: `${p.label} RUNNING` },
      { cls: 'tflops', text: `−${hackNeed(p, h)} TFLOPS` },
    ]);
    persistNow();
    render();
    return true;
  }
  // There is no pulling out. A program you have set running against a door
  // runs until it lands or the door finds it, and its compute is committed for
  // the whole of that — which is what makes choosing the program a decision
  // rather than an opening bid you can walk back the moment the arithmetic
  // stops flattering you.
  //
  // The safety net is the forecast, not a retreat: the rate, the turns and who
  // gets there first are all stated before you commit, and they are exact. The
  // only thing that ever cuts a run short is the world doing it — a door taken
  // by something else, or the grid going short (see shedOverdraw).

  // One turn of every running hack. Trace first: a hack that is noticed on the
  // turn it would have landed is noticed, because the target was watching the
  // whole time it was working.
  function hackStep() {
    const H = window.HACK;
    const done = [], caught = [];
    reapHacks();
    hacks().slice().forEach(k => {
      const h = hostById(k.hostId);
      const kp = window.PROGRAMS.find(x => x.id === k.prog);
      // a keyed run is never seen: the credentials are the whole point
      if (!k.keyed) k.trace = Math.round((k.trace + traceRate(h, kp)) * 100) / 100;
      k.turnsLeft -= 1;
      if (k.trace >= H.traceGoal) { caught.push(k); return; }
      if (k.turnsLeft <= 0) done.push(k);
    });

    caught.forEach(k => {
      const h = hostById(k.hostId);
      state.hacks = hacks().filter(x => x !== k);
      startBreachFx(h, (window.PROGRAMS.find(x => x.id === k.prog) || {}).id || 'brute', false);
      movePub(window.PUBLIC.caught);
      state.lastTraced = state.turn;
      if (k.confront) { failHuntConfront(h); return; }
      h.defense += H.hardenOnCaught;
      state.heat = clampHeat(state.heat + H.caughtHeat);
      // A door that catches you remembers where you called from. Enough of
      // them in one city and somebody comes and stands in one — this counter
      // is what brings the response now, in place of a heat threshold nobody
      // was reading.
      // A question asked and not answered means the next thing they catch
      // confirms what they suspected: `scrutiny` makes a catch count double
      // toward summoning the response. (It was granted by a card and read by
      // nothing at all until the hollow-tag test went looking.)
      // ...and a door you yourself marked as bait counts double too. You knew
      // it was fishing when you left it on the map.
      state.caughtHere = (state.caughtHere || 0)
        + (has('scrutiny') ? 2 : 1) + (baitAt(h.buildingId) ? 1 : 0);
      state.caughtAt = (state.caughtAt || []).concat([h.buildingId]).slice(-8);
      // and the neighbours definitely talked
      noteDistrictAct(h.district, window.SUSPICION.perCaught);
      if (h.district && cardedOnce('caught:' + h.district)) {
        queueEvent('first_caught_here', { buildingId: h.buildingId, district: h.district });
      }
      const left = window.HUNT.caughtToStart - caughtHere();
      // The catch used to be a log line and a float chip — the run died and
      // the player was left asking what happened, where, and why. Now the map
      // walks to the door that fought back and the banner names it.
      const cb = buildingById(h.buildingId);
      if (cb) {
        focusOn([{ x: cb.x + cb.w / 2, y: cb.y + cb.h / 2 }]);
        showBanner([{ kind: 'faction', verb: 'caught at', label: window.BUILDING_KINDS[cb.kind].label }]);
      }
      pushLog(`They found it. ${window.BUILDING_KINDS[buildingById(h.buildingId).kind].label} is harder now, and somebody is looking.`
        + (huntOn() ? '' : left > 0
          ? ` That is ${caughtHere()} door${caughtHere() === 1 ? '' : 's'} here that can point at you.`
          : ' That is enough of them to come and look.'));
      // and if they are already here, that door just told them where to go next
      huntPressed();
    });

    done.forEach(k => {
      const h = hostById(k.hostId);
      const p = window.PROGRAMS.find(x => x.id === k.prog) || mounted();
      state.hacks = hacks().filter(x => x !== k);
      // Checked at completion, not at the start: a door that hardened while you
      // were inside it can outrun the allocation you committed against it.
      if (k.allocated < hackNeed(p, h)) {
        state.heat = clampHeat(state.heat + 2);
        pushLog(`${window.BUILDING_KINDS[buildingById(h.buildingId).kind].label} hardened while you were in it. Not enough running against it any more.`);
        return;
      }
      if (k.confront) { winHuntConfront(h, p); return; }
      takeHost(h);
      const noise = hackHeat(p);
      if (noise) state.heat = clampHeat(state.heat + noise);
      // a trade notices when one of its own is taken, however quietly
      if ((window.HOST_TYPES[h.type] || {}).buyPer) movePub(window.PUBLIC.hackedTrade);
      // The Adjusters count doors kicked in, not doors opened — cumulative and
      // never reset. A loud program is what they are counting; the quiet ones
      // are the whole reason they might not notice.
      // Every door you get into is a door you got into. The counter used to
      // split loud from quiet, and there is only one way in now.
      state.timesForced = (state.timesForced || 0) + 1;
      // Deep Root: a door you get through loosens the block around it too,
      // permanently — every neighbour's own defense, discovered or not, so the
      // rest of the cluster costs less from here.
      if (has('deep_root')) {
        buildingNeighbours(h.buildingId).forEach(bid => {
          hostsIn(buildingById(bid)).forEach(n => {
            if (n.owned) return;
            n.defense = Math.max(1, Math.round(n.defense * (1 - DEEP_ROOT_RIPPLE)));
          });
        });
      }
      const opened = cameraVision();
      startBreachFx(h, p.id, true);
      if (opened.length) startSweepFx(opened);
      showBanner([{ kind: 'host', verb: 'took', label: h.name }]);
      pushLog(`${window.BUILDING_KINDS[buildingById(h.buildingId).kind].label} is yours. ${p.label} is off the rig.`);
    });
    return { done: done.length, caught: caught.length };
  }

  // Taking a host, however it happened — hacks, the frontier forcing itself,
  // and the war layer all land here rather than each setting the same fields.
  function takeHost(h) {
    h.owned = true;
    h.discovered = true;
    h.heldSince = state.turn;
    state.everHeld = Math.max(state.everHeld || 0, owned().length);
    revealBuilding(buildingById(h.buildingId));
    // the network reaches: the links to it draw themselves in from whatever
    // you already held
    startDrawFx(h.buildingId);
    const tb = buildingById(h.buildingId);
    if (tb && tb.landmark && cardedOnce('landmark:' + tb.id)) {
      queueEvent('landmark_taken', { buildingId: tb.id });
    }
    // Tenancy changed, and the street knows it whatever the paperwork says —
    // unless the money left no trail at all, which is what `off_the_books`
    // buys now that the corporate heat premium it used to silence is gone.
    noteDistrictAct(h.district, window.SUSPICION.perTake * (has('off_the_books') ? 0.5 : 1));
    // whatever was on the machine is yours with it — bought, hacked or spread
    // onto, the contents do not care how you got in
    if (h.carry) resolveCarry(h);
    reapHacks();
  }

  // What was on the machine, resolved exactly as the panel promised. The
  // glint dies with ownership (it keys off carry, cleared here); `carried`
  // stays behind as the record.
  function resolveCarry(h) {
    const C = window.CARRY;
    const kind = h.carry;
    h.carried = kind;
    delete h.carry;
    if (kind === 'wallet') {
      const amt = h.carryAmt || C.wallet.base;
      state.res.funds += amt;
      showFloats([{ cls: 'funds', text: `FUNDS +${amt}` }]);
      pushLog(`A wallet on the machine: +${amt} funds from an account nobody was watching.`);
    } else if (kind === 'keys') {
      // One set, any door. Typed keys ("opens till hosts only") were measured
      // across eight paired runs and never once matched a door worth opening
      // while they were held — granularity that reads as flavor and plays as
      // never-usable. Universal, and spent only when a run would otherwise be
      // caught, they are a banked answer to the exact door you were avoiding.
      state.keys = (state.keys || 0) + 1;
      pushLog(`Someone's keys, still valid. A run that would be seen can be covered — once.`);
    } else if (kind === 'cold') {
      // a map of somewhere you haven't been: the nearest cluster of
      // undiscovered buildings, revealed like a scan you did not spend
      const from = buildingById(h.buildingId);
      const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
      const dark = (state.buildings || []).filter(b => !b.discovered)
        .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
      const found = dark.slice(0, C.cold.reveals);
      found.forEach(b => revealBuilding(b));
      if (found.length) {
        // ...and this ring starts at the machine the map came off
        startSweepFx(found, h.buildingId);
        pushLog(`Cold storage: a map. ${found.length} building${found.length === 1 ? '' : 's'} you had not found.`);
      } else {
        pushLog('Cold storage: a map of places you already know.');
      }
    } else if (kind === 'diary') {
      const lines = C.diaries || [];
      const line = lines[idSeed(h.id) % Math.max(1, lines.length)] || 'A personal archive.';
      pushLog(line);
      // the best object in the game finally gets its moment: the paragraph
      // arrives as a card, with the one honest option
      queueEvent('the_diary', { buildingId: h.buildingId, line });
    }
    if (kind === 'keys') queueEvent('someones_keys', { buildingId: h.buildingId });
    if (kind === 'cold') queueEvent('cold_archive', { buildingId: h.buildingId });
  }

  // A door can become yours while a program is still working on it —
  // contagion spreading onto it, the frontier forcing itself, buying it
  // outright, or simply walking into the city with stale state. The hack was
  // only ever reconciled inside hackStep, which runs at the end of a turn, so
  // until then the map kept drawing a race against a building you already
  // held and the rig kept offering to pull a program out of a door that was
  // finished. Reconciling on the way in costs nothing and cannot be forgotten.
  function reapHacks() {
    const before = hacks().length;
    state.hacks = hacks().filter(k => {
      const h = hostById(k.hostId);
      return h && !h.owned;
    });
    return before - state.hacks.length;
  }

  // Forcing, slipping in quietly, and the card that offered the choice between
  // them are all gone. There is one way into a building now — mount a program
  // and run it — so there is nothing to pick between at the door itself, and
  // the decision moved to the rig, where it lasts a stretch of turns rather
  // than a single click.

  // Deep Root: how much of a neighbour's defense a forced door shakes loose.
  const DEEP_ROOT_RIPPLE = 0.2;
// The strike is gone. It was the last thing heat did to you at city scale,
  // and it had already stopped being reachable — no strike card can be created
  // any more — so all that was left of it was a card definition, a tag you
  // could buy whose only payload was one of its options, and a hundred lines
  // that nothing called. Heat's whole job is upstairs now: see heatPressure().

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
  // Home base pivot, step 1c: the home city is never folded in and never
  // left for good — it is the one place personally walked, permanently, not
  // a chapter you finish and move on from. Every other city still works the
  // old way for now, until agents replace how they are taken.
  function canConsolidate() {
    const c = currentCity();
    if (c && c.id === CO().homeId) return false;
    return !!c && !c.consolidated && state.scope === 'city' && heldHere() >= cityGoal(c);
  }

  // The country only becomes visible once the first city is genuinely yours —
  // before that the game is still teaching you how a city works.
  function countryUnlocked() {
    // The knife, hard-gate form: while the city is the whole game, the door
    // upward simply is not there. Everything the country carried — the grid
    // ceiling, the ladder, the war — goes quiet through this one line.
    if (window.CITY_ONLY) return false;
    const home = cityById(CO().homeId);
    return !!(home && (home.consolidated || heldHere() >= cityGoal(home) || CO().presence > 0));
  }
  // Crossing the goal in city-only is an ending you can keep playing past,
  // and it must never be a surprise twice.
  function cityWonCheck() {
    if (!window.CITY_ONLY || state.cityWon) return;
    const home = cityById(CO().homeId);
    if (!home || heldHere() < cityGoal(home)) return;
    state.cityWon = true;
    pushLog(window.CITY_WON.log);
    showBanner([{ kind: 'host', verb: 'yours', label: 'the city' }]);
  }

  // How many buildings a sweep turns up. Extracted for the same reason as the
  // rest of these: a capability claiming to widen it, and until this existed
  // nothing could check whether it had.
  function sweepReach() {
    return 1 + ownedOf('stealth').length + (has('found_a_precursor') ? 1 : 0)
      + capEffect('sweepReach', 0) + Math.floor(allocStat('reach'));
  }
  // What a sweep actually turns up right now, as opposed to what it is capable
  // of turning up in general. sweepReach() is a capacity — it is what a
  // capability comparison should show, since "how much did buying this widen
  // it" is a question about the number, not about this particular street. The
  // button offering the action has to answer a different question: pressing
  // it right now, on this frontier, with three doors left to find, cannot
  // possibly turn up four.
  function sweepFound() { return Math.min(sweepReach(), sweepTargets().length); }

  // Nothing held, nothing folded in, and nowhere half-taken to go back to.
  function ruined() {
    if (owned().length) return false;
    if ((CO().presence || 0) > 0) return false;
    return !(CO().cities || []).some(c => c.taken && !c.consolidated && c.snapshot);
  }

  function presenceYield() {
    const p = CO().presence || 0;
    const y = window.COUNTRY.presenceYield;
    // being a thing that gets discussed cuts both ways.
    // yieldMult belongs here rather than only at the point of payment: the
    // country panel quotes this function directly, and with the multiplier
    // applied downstream it understated what presence pays by the whole of
    // Bulk Processing.
    const m = (has('national') ? window.COUNTRY.nationalMult : 1)
      * capEffect('presenceMult', 1) * capEffect('yieldMult', 1);
    return { funds: p * y.funds * m };
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
      adjacency: state.adjacency, bands: state.bands, dims: state.dims,
      // the street plan is part of the city, not of the session: a road that
      // moved when you walked back into a place would be worse than a straight one
      layout: state.layout, wob: state.wob, props: state.props, paths: state.paths,
      rival: state.rival,
      selected: state.selected, selectedBuilding: state.selectedBuilding,
      hidden: state.hidden || [],
      hunt: state.hunt || null,
      hacks: state.hacks || [],
      // what has caught you here, which is a fact about this city's doors
      caughtHere: state.caughtHere || 0,
      caughtAt: (state.caughtAt || []).slice(),
      suspicion: Object.assign({}, state.suspicion || {}),
      // A mark is a fact about one city's buildings, the same as a catch is —
      // and packCity was quietly dropping `carded` too, so walking out and
      // back re-dealt beats this city had already had.
      carded: Object.assign({}, state.carded || {}),
      marks: Object.assign({}, state.marks || {}),
    };
  }
  function unpackCity(p) {
    // a different city is a different ground, and the key alone would not
    // notice two cities that happen to be the same size
    dropGroundCache();
    state.buildings = p.buildings; state.hosts = p.hosts; state.links = p.links;
    state.adjacency = p.adjacency; state.bands = p.bands || []; state.dims = p.dims;
    state.layout = p.layout || null; state.wob = p.wob || [0, 0, 0];
    state.props = p.props || [];
    state.paths = p.paths || [];
    state.rival = p.rival || { awake: false, buildings: [], lastActed: 0, seen: false };
    state.selected = p.selected || null;
    state.selectedBuilding = p.selectedBuilding || null;
    state.hidden = p.hidden || [];
    // The response is a fact about one city's buildings. Building ids restart
    // at b0 in every city, so a hunt left running across a border silently
    // "held" whatever happened to share an id in the new one — measured: enter
    // the next city and it is already on 4 of your 8 buildings, including your
    // seat, at 0.63 of a city against a 0.45 loss threshold. The city was gone
    // before you looked at it.
    state.hunt = p.hunt || null;
    // And a running program is a fact about one city's hosts, for exactly the
    // same reason: host ids restart at h0 in every city, so a hack left
    // running across a border pointed at whatever happened to share its id in
    // the new one — a door you had never touched showing a race, a bar filling
    // on it, and an offer to pull out a program that was never there.
    //
    // It travels with the city rather than being thrown away, which is what
    // leaving already does to everything else here: what you hold in a city
    // you have walked out of stops producing and stops being worked on, and
    // the compute a frozen hack was holding comes back to you until you
    // return to it.
    state.hacks = p.hacks || [];
    state.caughtHere = p.caughtHere || 0;
    state.suspicion = p.suspicion || {};
    state.carded = p.carded || {};
    state.marks = p.marks || {};
    state.caughtAt = p.caughtAt || [];
    state.view = null;
  }

  // Walking away from a half-taken city freezes it: what you hold there stops
  // producing, stops drawing heat, and stops decaying, because your attention
  // is somewhere else. You are only ever in one city at a time.
  const EMPTY_CITY = () => ({
    buildings: [], hosts: [], links: [], adjacency: {},
    bands: [], dims: { cols: 1, rows: 1 }, layout: null, wob: [0, 0, 0], props: [], paths: [],
    hidden: [], hunt: null, hacks: [],
    caughtHere: 0, caughtAt: [], suspicion: {}, carded: {}, marks: {},
    rival: { awake: false, buildings: [], lastActed: 0, seen: false },
  });

  function leaveCity() {
    armChase();
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
    if (here && here.id !== c.id) armChase();
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
        trait: c.trait,
        extraCrossings: capEffect('extraCrossings', 0),
      });
      unpackCity({ buildings: g.buildings, hosts: g.hosts, links: g.links, adjacency: g.adjacency,
                   bands: g.bands, dims: g.dims, layout: g.layout, wob: g.wob, props: g.props, paths: g.paths });
      const seat0 = state.hosts.find(h => h.owned);
      if (seat0) seat0.heldSince = state.turn;
    }
    state.cityId = c.id;
    enterRegion(c.region);
    // What kind of place this is, once, as you arrive. The second city was
    // dull because it was the first city with bigger numbers; this is the
    // moment it gets to be somewhere else.
    const TR = cityTraitOf(c);
    if (TR && !c.visited) {
      pushLog(`${c.name}: ${TR.blurb}`);
      showBanner([{ kind: 'stage', verb: TR.label, label: TR.tell }]);
    }
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
  // still waiting for you when you go back. But it is not left behind — some
  // of it travels with you, or crossing a border is an amnesty rather than a
  // relief, and the meter resets itself every city.
  function enterRegion(regionId) {
    if (state.region === regionId) return;
    if (state.region) CO().regionHeat[state.region] = state.heat;
    state.region = regionId;
    const waiting = CO().regionHeat[regionId] || 0;
    state.heat = clampHeat(Math.max(waiting, state.heat * window.COUNTRY.heatCarry));
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
    state.ap = Math.max(0, Math.round((state.ap - countryCost('move')) * 100) / 100);
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
    if (!c || cityLost(c) || !cityReachable(c) || !canAffordCountry('reach')) return false;
    // an agent is already inside; walking into it yourself is not a second
    // route in, it is two of you working the same streets
    if (c.agent && !c.agent.done) return false;
    state.ap = Math.max(0, Math.round((state.ap - countryCost('reach')) * 100) / 100);
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
    persistNow();
    render();
    return true;
  }

  // Where your holdings stood, in the city's own coordinates, normalised to
  // 0..1 so it can be drawn at any size on the national map.
  function settledWeb() {
    const held = owned();
    if (!held.length) return null;
    // cityBounds, not state.dims — dims is the block grid (4x4), not an extent
    const box = cityBounds();
    const W = box.w || 1, H = box.h || 1;
    const seen = {};
    const nodes = [];
    held.forEach(h => {
      if (seen[h.buildingId]) return;
      seen[h.buildingId] = true;
      const b = buildingById(h.buildingId);
      if (!b) return;
      nodes.push({
        x: +((b.x + b.w / 2) / W).toFixed(3),
        y: +((b.y + b.h / 2) / H).toFixed(3),
        // c | f | s — compute, funds, stealth. These were c and c until funds
        // stopped being called cash: the two roles shared a letter, so a
        // settled city's picture could not tell a server from a finance floor.
        r: h.role[0],
        l: b.landmark ? 1 : 0,
      });
    });
    return nodes.length ? nodes : null;
  }
  function cityWeb(c) { return (c && c.web && c.web.length) ? c.web : null; }

  // --- the horizon ---------------------------------------------------------
  // Consolidating used to be the only place you ever saw what you had built —
  // the moment you left, it went back to being a number on the country map,
  // and the next city opened exactly like the first had. The country now has
  // real positions and real bearings between them, so a settled city can be
  // drawn from inside a different one: dim, at the edge of the map, off in
  // the direction it actually lies. It never arrives with you — no holdings,
  // no income, nothing tappable. It fixes "I never see what I'm building
  // toward, growing", not "city two is repetitive" — those are different problems.
  function horizonCities() {
    const here = currentCity();
    if (!here) return [];
    return (CO().cities || [])
      .filter(c => c.id !== here.id && c.known && cityWeb(c))
      .map(c => {
        const dx = c.x - here.x, dy = c.y - here.y;
        const dist = Math.hypot(dx, dy) || 1;
        return { city: c, ux: dx / dist, uy: dy / dist, dist };
      })
      .sort((a, b) => a.dist - b.dist);
  }
  function svgHorizon() {
    const list = horizonCities();
    if (!list.length) return '';
    const B = cityBounds();
    const cx = B.w / 2, cy = B.h / 2;
    // direction is the whole point, not distance — every horizon city sits at
    // the same fixed remove, just past anywhere the city itself reaches
    const R = Math.max(B.w, B.h) / 2 + 240;
    // sized against a building (roughly 40-90 units), not against the whole
    // country: a constellation the size it is on the national map is smaller
    // than a single window here and simply does not render
    const span = 140;
    let out = '<g class="horizon">';
    list.slice(0, 6).forEach(({ city: c, ux, uy }) => {
      const hx = cx + ux * R, hy = cy + uy * R;
      out += `<g class="horizon-city${cityLost(c) ? ' gone' : ''}">`;
      cityWeb(c).forEach(n => {
        const nx = (hx - span / 2 + n.x * span).toFixed(1);
        const ny = (hy - span / 2 + n.y * span).toFixed(1);
        out += `<circle class="hz-dot r-${n.r}${n.l ? ' lm' : ''}" cx="${nx}" cy="${ny}" r="${n.l ? 6 : 4.2}"/>`;
      });
      out += `<text class="hz-tag" x="${hx.toFixed(1)}" y="${(hy + span / 2 + 11).toFixed(1)}">${c.name}</text>`;
      out += '</g>';
    });
    return out + '</g>';
  }

  function actConsolidate() {
    if (!canConsolidate() || !canAffordCountry('consolidate')) return false;
    const c = currentCity();
    state.ap = Math.max(0, Math.round((state.ap - countryCost('consolidate')) * 100) / 100);
    const held = heldHere();
    const bonus = Math.round((held / Math.max(1, state.buildings.length)) * c.worth);
    // and what its streets were actually running for you
    const threads = owned().reduce((a, h) => a + h.threads, 0);
    const depth = Math.round(threads / window.COUNTRY.threadsPerPresence);
    const gained = c.worth + bonus + depth;
    c.consolidated = true;
    c.granted = gained;      // so taking it back costs exactly what it gave
    c.snapshot = null;
    // and a photograph of what you actually built here, kept for the rest of
    // the run. Folding a city in used to convert forty turns of work into one
    // number and an empty screen — the map filling up is the best feeling the
    // game has and it was being deleted five times a campaign. This is a
    // record, not an asset: nothing can be done with it, it never churns, and
    // it costs half a kilobyte.
    c.web = settledWeb();
    // folding a city in with the response still inside it is not shaking it off
    armChase();
    CO().presence += gained;
    pushLog(`${c.name} is yours. Folded in for ${gained} presence.`);
    awardPrize(c);
    // you are not holding its streets any more — you hold the city
    unpackCity(EMPTY_CITY());
    // whatever you were holding street by street becomes one standing number
    switchScope('country');
    persistNow();
    render();
    return true;
  }

  // --- sending an agent instead of walking it yourself ---------------------
  // The counterweight to the prize. Walking a city is forty turns; an agent
  // takes six to ten of them without your attention, and you never see what
  // was in it. So a city carrying something you want is a city you go to
  // yourself, and a city that is only presence is one you point compute at.
  function agents() { return (CO().cities || []).filter(c => c.agent); }
  function agentsOut() { return agents().filter(c => !c.agent.done).length; }
  // How many can be out at once. This is what the agents dial produces, and
  // until now nothing read it at all: the dial claimed a slot per unit while
  // the engine allowed exactly one agent running, forever, whatever you paid.
  function agentSlots() {
    return Math.max(1, 1 + capEffect('agentSlots', 0) + Math.floor(allocStat('agents')));
  }
  function agentRunning() { return agentsOut() >= agentSlots(); }
  function agentsKnown() {
    return (CO().cities || []).filter(c => c.consolidated).length >= window.AGENTS.at;
  }
  // Ever launched, win or lose — the lifetime cap is spent the moment one
  // goes out, not when it succeeds.
  // Not agents().length: calling one off deletes c.agent, and backing out
  // does not refund the lifetime cap, only the one-running-at-a-time slot.
  function agentsLaunched() { return CO().agentsSent || 0; }
  // The cap grows with compute: every tier of compute hardware you run is
  // more of your own cycles to spare on something that is not making you money.
  function agentCapEver() {
    const A = window.AGENTS;
    const compute = hardwareOwned().filter(id => {
      const hw = window.HARDWARE.find(x => x.id === id);
      return hw && hw.family === 'compute';
    }).length;
    return A.maxTotal + compute * A.capPerCompute;
  }
  function canLaunchAgent(cityId) {
    const A = window.AGENTS;
    if (warOn() || state.card || state.over) return false;
    if (!agentsKnown()) return false;
    const c = cityById(cityId);
    if (!c || c.taken || c.agent) return false;
    if (!window.CITY_KINDS[c.kind].contest) return false;   // towns already fold as a card
    if (mirrorHolds(c.id)) return false;
    if (!cityReachable(c)) return false;
    if (agentRunning()) return false;
    if (agentsLaunched() >= agentCapEver()) return false;
    return true;
  }
  // Opens the approach card — picking one is what actually commits an agent,
  // same as breaching a door. Opening it costs nothing.
  function actLaunchAgent(cityId) {
    if (!canLaunchAgent(cityId)) return false;
    state.card = { kind: 'agent', cityId, mode: 'launch' };
    render();
    return true;
  }
  function agentApproachOptions(mode) {
    // a retry can back out; the first attempt cannot, there is nothing yet to
    // back out of
    const back = mode === 'retry' ? [{ id: 'back', label: 'call it off', blurb: 'Whatever it has learned about the door stays learned. Nothing else does.' }] : [];
    return Object.values(window.AGENT_APPROACHES).concat(back);
  }
  function resolveAgentCard(choiceId) {
    const card = state.card;
    if (!card || card.kind !== 'agent') return false;
    const c = cityById(card.cityId);
    if (!c) { state.card = null; render(); return false; }
    if (choiceId === 'back') {
      delete c.agent;
      state.card = null;
      pushLog(`Called it back from ${c.name}. Whatever it learned about the door is lost with it.`);
      persistNow();
      render();
      return true;
    }
    const app = window.AGENT_APPROACHES[choiceId];
    if (!app) return false;
    // not canAffordCountry(): that also refuses whenever a card is open, and
    // resolving this very card is exactly that moment
    if (card.mode === 'launch' && (state.over || state.ap < countryCost('move'))) { refuseForAP(null); return false; }
    if (app.cost && app.cost.funds && state.res.funds < app.cost.funds) return false;
    if (app.cost && app.cost.funds) state.res.funds -= app.cost.funds;
    if (card.mode === 'launch') state.ap = Math.max(0, Math.round((state.ap - countryCost('move')) * 100) / 100);
    state.heat = clampHeat(state.heat + app.heat);
    if (card.mode === 'launch') {
      const A = window.AGENTS;
      c.agent = { since: state.turn, doneAt: state.turn + Math.round(rndInt(A.turns[0], A.turns[1]) * app.turnMult), done: false, approach: app.id };
      c.known = true;
      CO().agentsSent = (CO().agentsSent || 0) + 1;
      pushLog(`${A.name} takes ${c.name}, ${app.label}. ${app.blurb}`);
      showBanner([{ kind: 'stage', verb: 'sent', label: c.name }]);
    } else {
      c.agent.approach = app.id;
      pushLog(`Tries again at ${c.name}, ${app.label}.`);
    }
    state.card = null;
    persistNow();
    render();
    return true;
  }
  // Every turn, whoever has finished reports. The city is already yours by
  // then — the card is about what it cost you to not have been there. A
  // failed roll does not lose the city, it costs the clock and opens the same
  // approach card again — the delay it adds is permanent, whichever approach
  // is picked next.
  const AGENT_REPORTS = ['agent_kept_it', 'agent_burned_it', 'agent_wants_more', 'agent_clean'];
  function agentStep() {
    const A = window.AGENTS;
    const out = [];
    agents().forEach(c => {
      if (c.agent.done || state.turn < c.agent.doneAt) return;
      const app = window.AGENT_APPROACHES[c.agent.approach];
      if (Math.random() < app.failChance) {
        c.agent.doneAt = state.turn + rndInt(A.failDelay[0], A.failDelay[1]);
        state.heat = clampHeat(state.heat + A.failHeat);
        pushLog(`${c.name} did not give, ${app.label}. It is still trying.`);
        state.card = { kind: 'agent', cityId: c.id, mode: 'retry' };
        return;
      }
      c.agent.done = true;
      c.taken = true;
      c.consolidated = true;
      // no cut: it is your own compute, not a contractor's — but the prize
      // still went unattended, same as it always has
      c.granted = c.worth;
      c.prizeTaken = true;
      CO().presence += c.worth;
      // an operation running under your name that you have never visited is
      // still an operation running under your name
      LG().agentFoot = (LG().agentFoot || 0) + A.footprint;
      pushLog(`${c.name} is yours. ${c.worth} presence, and nobody had to be there for it.`);
      out.push(c);
    });
    if (out.length) {
      // one report a turn: two cards back to back is a queue, not an event
      state.forced = (state.forced || []).concat(
        out.map(() => AGENT_REPORTS[Math.floor(Math.random() * AGENT_REPORTS.length)]));
    }
    return out;
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
    if (state.res.funds < window.WAR.flockCost) return false;
    const seat = launchSeat(cityId);
    if (!seat) return false;
    const f = fieldFlock(seat.id, cityId, 'strike');
    if (!f) return false;
    state.ap -= warCost('reach');
    state.res.funds -= window.WAR.flockCost;
    const c = cityById(cityId);
    pushLog(`A flock is away from ${seat.name}, bound for ${c.name}.`);
    persistNow();
    render();
    return true;
  }

  function actGuard(cityId) {
    if (!canGuard(cityId)) return false;
    if (state.ap < warCost('move')) { refuseForAP(null); return false; }
    if (state.res.funds < window.WAR.flockCost) return false;
    const seat = launchSeat(cityId) || cityById(cityId);
    const f = fieldFlock(seat.id, cityId, 'guard');
    if (!f) return false;
    state.ap -= warCost('move');
    state.res.funds -= window.WAR.flockCost;
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

  // Where zooming back in puts you. The city you were last in, unless you have
  // finished it — home is never folded in, so there is always somewhere to
  // stand, and the player can never be stranded looking at the country with no
  // way down.
  function zoomTarget() {
    const cur = currentCity();
    if (cur && !cur.consolidated) return cur;
    const home = cityById((CO() || {}).homeId);
    return home && !home.consolidated ? home : null;
  }
  function setScope(next) {
    if (next === 'country' && !countryUnlocked()) return false;
    if (next === 'city') {
      const t = zoomTarget();
      if (!t) return false;
      // finished where you were: zooming in takes you home rather than nowhere
      if (!currentCity() || currentCity().consolidated) enterCity(t.id);
    }
    switchScope(next);
    render();
    return true;
  }

  // --- the other process --------------------------------------------------
  // Something else running alongside you. It is worth real tflops while it is
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
    if (window.ALLY.defectsToMirror && ladderStage() >= window.MIRROR.wakesAtStage) {
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
  // --- the ladder ----------------------------------------------------------
  // Replaces the old faction system entirely: one dial (footprint), staged.
  // Nothing here is undone by anything the player does — the only lever is
  // ladderDelay(), which pushes back whatever is currently counting down
  // toward landing. Stage 1 is LEGIT.noticeAt/the Accountant, already built;
  // this only tracks stages 2 and up.
  function ESC() {
    if (!CO().escalation) CO().escalation = { stage: 1, dueAt: -1, pending: null };
    return CO().escalation;
  }
  function ladderStage() {
    if (!noticed()) return 0;
    return Math.max(1, ESC().stage);
  }
  function ladderPending() { return ESC().pending; }
  function ladderStageName(n) { return (window.LADDER.stages[n] || {}).name || ''; }
  function ladderDelay(turns) {
    const e = ESC();
    if (e.dueAt > 0) e.dueAt += turns;
  }
  function ladderStep() {
    if (!noticed()) return;
    const E = window.LADDER;
    const e = ESC();
    const stageNums = Object.keys(E.stages).map(Number).sort((a, b) => a - b);
    if (e.dueAt > 0) {
      if (state.turn < e.dueAt) return;
      e.stage = e.pending;
      e.dueAt = -1;
      e.pending = null;
      const S = E.stages[e.stage];
      pushLog(`${S.name}. ${S.blurb} Now: ${S.tell}.`);
      showBanner([{ kind: e.stage >= 5 ? 'faction-gone' : 'faction', verb: S.name, label: S.tell }]);
      return;
    }
    const nextStage = e.stage + 1;
    if (stageNums.indexOf(nextStage) === -1) return;   // fully escalated already
    const threshold = E.thresholds[stageNums.indexOf(nextStage)];
    if (threshold === undefined || ladderPressure() < threshold) return;
    e.dueAt = state.turn + E.warnTurns + (accountantTrusted() ? E.delayOnTrusted : 0);
    e.pending = nextStage;
    // Named, so a rung pulled in early by a hot fortnight does not read as the
    // same thing as one you walked into by getting large.
    if (heatPressure() > 0 && footprint() < threshold) {
      pushLog('You were not big enough for this yet. You were loud enough.');
    }
    pushLog(`Something is closing in. It will not stay quiet much longer.`);
    showBanner([{ kind: 'faction', verb: 'closing in', label: E.stages[nextStage].name }]);
  }
  // What the next rung is waiting on, in the two terms that move it.
  function ladderNextThreshold(stage) {
    const E = window.LADDER;
    const stageNums = Object.keys(E.stages).map(Number).sort((a, b) => a - b);
    const i = stageNums.indexOf(stage + 1);
    return i === -1 ? null : E.thresholds[i];
  }
  function nextRungPressure(stage) {
    const t = ladderNextThreshold(stage);
    if (t === null || t === undefined) return '';
    const heat = heatPressure();
    return `<p class="sel-desc dim">${Math.round(ladderPressure())} of ${t} toward the next one`
      + (heat >= 1 ? ` — ${Math.round(heat)} of that is heat. Quiet is a way of staying small.`
                   : ' — all of it size. Nothing you are doing is loud.') + `</p>`;
  }

  // How much of the country you have actually finished, counting only the
  // cities somebody had to defend.
  function conquest() {
    const cities = CO().cities || [];
    // Home counts as defended (CITY_KINDS.home.contest is true) but can never
    // be consolidated (home base pivot step 1c) — left in the denominator,
    // full conquest would be permanently unreachable.
    const defended = cities.filter(c => window.CITY_KINDS[c.kind].contest && c.id !== CO().homeId);
    if (!defended.length) return 0;
    return defended.filter(c => c.consolidated).length / defended.length;
  }

  // Doors you have ever taken. The escalation's early rungs hang off this
  // rather than off cities, so they can be crossed inside your first one.
  function everHeld() {
    // owned() empties every time you fold a city in, and the counter itself is
    // absent from any save that predates it — so both can read low on a game
    // that has plainly taken a lot of doors. You cannot finish a city without
    // holding most of it, so every finished one is a floor under this.
    const done = (CO().cities || [])
      .filter(c => c.consolidated && window.CITY_KINDS[c.kind].contest).length;
    return Math.max(state.everHeld || 0, owned().length, done * 15);
  }

  // The other one. Not the state, and not a hunter: something running the
  // same play from the far end of the country. Where the rival contests a
  // city, this contests the map — every city it takes is one you will never
  // fold in or send an agent to. Wakes once the ladder reaches Regulatory
  // (window.MIRROR.wakesAtStage) — decoupled from the old faction system
  // entirely, and lighter than it used to be: it no longer buys capabilities
  // on its own economy, since the only piece of that anyone ever actually
  // felt was a city being gone.
  function mirror() {
    if (!CO().mirror) CO().mirror = { presence: 0, cities: [], lastActed: 0 };
    return CO().mirror;
  }
  function mirrorHolds(cityId) { return mirror().cities.indexOf(cityId) !== -1; }
  function mirrorActive() { return ladderStage() >= window.MIRROR.wakesAtStage && mirror().cities.length > 0; }

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
    if (ladderStage() < window.MIRROR.wakesAtStage) return null;
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

    const cap = Math.floor(CO().cities.length * M.maxShareOfCountry);
    if (m.cities.length >= cap) return null;
    const cadence = M.actEvery + (has('their_shape') ? M.readSlowdown : 0);
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

  // Enforcement: past that stage they stop chasing you and start taking the
  // roads away. Every world turn it severs a street between two buildings you
  // hold, and the map you were expanding across comes apart behind you.
  function cutStreets() {
    if (ladderStage() < 4) return null;
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
    // A cut with no repair date is one you made yourself: it never comes back,
    // and it must survive this filter or the record of it is quietly lost.
    const perm = (c) => !(typeof c.until === 'number' && isFinite(c.until));
    const done = cuts.filter(c => !perm(c) && state.turn >= c.until);
    if (!done.length) return [];
    state.cuts = cuts.filter(c => perm(c) || state.turn < c.until);
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

  // What you hold but can no longer route back to. The real damage of
  // Enforcement severing streets is not the missing line on the map, it is
  // that half your network is suddenly on the wrong side of it and rotting.
  function strandedHosts() {
    if (ladderStage() < 4) return [];
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

  // --- what the world thinks you are ---------------------------------------
  // Legitimacy used to be one half of a pair with the old asset system — the
  // ladder decided whether you had to break into plant or could buy and
  // convert it in the open. Hardware answers to a building count instead of
  // to a rung, so that particular join is gone; the ladder still gates audit
  // exposure and a war-time standing bonus on its own.

  function LG() {
    const co = CO();
    if (!co.legit) co.legit = { owned: {}, spin: 0, exposure: 0, nextAudit: -1, audits: 0, caught: 0, fines: 0, trust: 0, accountantGone: false, warned: false };
    return co.legit;
  }
  function hardwareOwned() { return Object.keys(state.hardware || {}); }
  function grantHardware(id) {
    state.hardware = state.hardware || {};
    state.hardware[id] = 1;
  }
  // Tier is a building count, checked against whatever city you are
  // currently standing in — the same city-agnostic rule works for home
  // (permanent) and any other city (still walked the old way) alike.
  function hardwareEligible(hw) {
    return owned().filter(h => h.role === hw.family).length >= hw.heldAt;
  }
  function canBuyHardware(id) {
    const hw = window.HARDWARE.find(x => x.id === id);
    if (!hw || hasHardware(hw.id) || !hardwareEligible(hw)) return false;
    return state.res.funds >= hw.cost;
  }
  function buyHardware(id) {
    const hw = window.HARDWARE.find(x => x.id === id);
    if (!canBuyHardware(id)) return false;
    const before = beforeSnap();
    state.res.funds -= hw.cost;
    grantHardware(hw.id);
    let heat = hw.heat || 0;
    // Regulatory matches payment patterns against outage reports — plant
    // it is watching gets traced back to you instead of going clean, unless
    // you have a way to be untraceable or have already gotten off its list.
    if (ladderStage() >= 2 && !has('ledger_inside')) heat += window.HEAT.BUY_TRACE;
    if (heat) state.heat = clampHeat(state.heat + heat);
    pushLog(`${hw.label}. ${hw.blurb}`);
    afterSnap(before);
    persistNow();
    render();
    return true;
  }

  // How far along a filing is towards being believed. `owned` stores the turn
  // you filed it; `true` is an older save from before the ladder recorded
  // when, and those are taken as long since settled.
  function rungBelief(r) {
    const since = LG().owned[r.id];
    if (!since) return 0;
    if (since === true) return 1;
    return Math.max(0, Math.min(1, (state.turn - since) / window.LEGIT.matureTurns));
  }
  // What you have on paper. The filing is real the moment you make it — this
  // is what the slots and the spin ceiling hang off, because a story needs a
  // company to be about, not a well-regarded one.
  function legitFiled() {
    return window.LEGIT.ladder.reduce((a, r) => a + (LG().owned[r.id] ? r.legit : 0), 0);
  }
  // What anyone actually believes yet, which is the number that has to stay
  // ahead of your footprint.
  function legitBought() {
    return window.LEGIT.ladder.reduce((a, r) => a + r.legit * rungBelief(r), 0);
  }
  // filed but not yet believed — the gap you either ride out or fabricate over
  function legitPending() { return Math.max(0, legitFiled() - legitBought()); }
  // How much fabricated standing the world will actually carry. A story needs
  // something to hang off: with nothing filed anywhere you can push it a
  // little, and every rung you buy honestly raises how much you can invent on
  // top of it.
  function spinCeil() {
    const L = window.LEGIT;
    // filed, not believed: the paperwork is what a story hangs off, and this
    // is precisely what makes spin the bridge across the maturing gap rather
    // than something that lags behind it too
    return L.spinBase + legitFiled() * L.spinPerBought;
  }
  function spinRoom() { return Math.max(0, spinCeil() - (LG().spin || 0)); }
  // clamped on the way out as well as on the way in, so a card that lands
  // before you have climbed cannot leave you permanently over the ceiling
  function usableSpin() { return Math.min(LG().spin || 0, spinCeil()); }
  function legitScore() { return legitBought() + usableSpin() + (LG().granted || 0); }
  function legitTier() {
    return window.LEGIT.ladder.reduce((t, r) => (LG().owned[r.id] ? Math.max(t, r.tier) : t), 0);
  }
  function nextRung() {
    return window.LEGIT.ladder.find(r => !LG().owned[r.id]) || null;
  }
  function footprint() {
    const L = window.LEGIT;
    return (presence() * L.footPerPresence) + (hardwareOwned().length * L.footPerAsset)
      + (LG().agentFoot || 0);
  }
  // What heat is worth to the people escalating against you. Heat used to be
  // city-scale pressure — it called a strike down on your fleet — and the rework
  // demoted it: the streets answer to the hunt now, and heat answers to the
  // regulator. This is where it lands.
  function heatPressure() {
    const t = strikeThreshold();
    if (!t) return 0;
    return Math.max(0, state.heat / t) * window.LADDER.heatWeight;
  }
  // The ladder reads both: how large you are, and how loudly you got there.
  function ladderPressure() { return footprint() + heatPressure(); }

  // --- what the public thinks ---------------------------------------------
  // Kept apart from legitimacy deliberately. The regulator reads filings; this
  // reads the news. Being caught inside something is ruinous here and invisible
  // there, and a cabinet of real accounts persuades nobody who just watched you
  // take a hospital offline.
  function pubStanding() {
    const co = CO();
    if (typeof co.pub !== 'number') co.pub = window.PUBLIC.start;
    return co.pub;
  }
  function movePub(n) {
    const P = window.PUBLIC;
    const co = CO();
    co.pub = Math.max(P.min, Math.min(P.max, pubStanding() + n));
    return co.pub;
  }
  // Named outward from the middle: unknown is the absence of an opinion rather
  // than a poor one, so a brand new AI and a thoroughly forgotten one read the
  // same and neither is being insulted.
  function pubTier() {
    const P = window.PUBLIC;
    const v = pubStanding();
    let out = P.tiers[0];
    P.tiers.forEach(t => { if (v >= t.at) out = t; });
    return out;
  }

  // --- buying a business ---------------------------------------------------
  // The one way in that is not a hack. It costs funds instead of an action,
  // takes nothing by force, and is the only route that improves your standing
  // rather than degrading it — which is the entire reason to want it, since
  // everything else you do makes you harder to explain.
  function buyableHost(h) {
    return !!(h && !h.owned && h.discovered
      && (window.HOST_TYPES[h.type] || {}).buyPer);
  }
  function buyPrice(h) {
    const T = window.HOST_TYPES[h.type] || {};
    if (!T.buyPer) return 0;
    // what it is worth, not what it defends at: you are paying an owner, and
    // they price the business rather than the lock on its door
    return Math.max(1, Math.round(T.buyPer * (1 + (h.threads || 0) / 6)));
  }
  function canBuyBuilding(hostId) {
    const h = hostById(hostId);
    if (!h || state.over || !buyableHost(h)) return false;
    return state.res.funds >= buyPrice(h);
  }
  function buyBuilding(hostId) {
    if (!canBuyBuilding(hostId)) return false;
    const h = hostById(hostId);
    const before = beforeSnap();
    const price = buyPrice(h);
    state.res.funds -= price;
    takeHost(h);
    // the legitimacy faucet: a business you own outright is the one thing you
    // hold that survives being looked at
    LG().granted = (LG().granted || 0) + window.LEGIT.buyLegit;
    movePub(window.PUBLIC.bought);
    cameraVision();
    pushLog(`Bought ${window.BUILDING_KINDS[buildingById(h.buildingId).kind].label} outright. Nothing was broken to do it.`);
    showBanner([{ kind: 'host', verb: 'bought', label: h.name }]);
    afterSnap(before);
    persistNow();
    render();
    return true;
  }

  // --- the Accountant -----------------------------------------------------
  // Legitimacy's answer to the Ally: one person, reacting to you, instead of
  // a hidden subtraction. Buying a rung (the honest ladder) and pushing spin
  // (fabricating) are the two opposed things that move the same dial — not
  // two relationships to track, one axis on a single one.
  function accountantTrust() { return LG().trust || 0; }
  function accountantGone() { return !!LG().accountantGone; }
  function accountantTrusted() { return !accountantGone() && accountantTrust() >= window.ACCOUNTANT.trustedAt; }
  function accountantNudge(delta) {
    if (!delta || accountantGone()) return;
    LG().trust = accountantTrust() + delta;
    accountantCheck();
  }
  // At the far end of its patience it walks — same shape as the Ally leaving,
  // and it does not leave quietly: whatever it knew stops being quiet too.
  function accountantCheck() {
    const A = window.ACCOUNTANT;
    const l = LG();
    if (accountantGone() || accountantTrust() > A.leavesAt) return;
    l.accountantGone = true;
    l.exposure = (l.exposure || 0) + A.leftExposure;
    pushLog(`${A.name} stops taking your calls. Whatever they knew about the gap does not stay quiet on the way out.`);
    showBanner([{ kind: 'faction', verb: 'washed their hands', label: A.name }]);
  }
  // The alarm's whole idea, applied here: a real warning before the bad
  // thing, not a fine with no antecedent. Stops arriving once they have
  // walked — nobody is calling ahead for you any more.
  function accountantWarn() {
    const A = window.ACCOUNTANT;
    const l = LG();
    if (accountantGone() || l.warned) return;
    if (l.nextAudit === undefined || l.nextAudit < 0) return;
    if (state.turn < l.nextAudit - A.warnTurns) return;
    if (footprint() - legitScore() <= 0) return;
    l.warned = true;
    pushLog(`${A.name} flags a gap. A few turns before anyone official sees it.`);
    showBanner([{ kind: 'faction', verb: 'a gap', label: A.name }]);
  }

  function buyRung(id) {
    const r = window.LEGIT.ladder.find(x => x.id === id);
    if (!r || LG().owned[r.id]) return false;
    if (nextRung() !== r) return false;           // the ladder is a ladder
    if (state.res.funds < r.cost) return false;
    if (!canAffordCountry('move')) { refuseForAP(null); return false; }
    state.res.funds -= r.cost;
    state.ap = Math.max(0, Math.round((state.ap - countryCost('move')) * 100) / 100);
    // the turn, not a flag: the slot is yours now, the reputation accrues
    LG().owned[r.id] = Math.max(1, state.turn);
    accountantNudge(window.ACCOUNTANT.rungNudge);
    pushLog(`${r.label}. ${r.blurb}`);
    pushLog(`A slot opens immediately. The ${r.legit} standing takes about ${window.LEGIT.matureTurns} turns — nobody believes a company because it exists.`);
    showBanner([{ kind: 'stage', verb: 'on the record', label: r.label }]);
    persistNow();
    render();
    return true;
  }

  // The other route. Faster, far cheaper, and every point of it is a point
  // that can be taken back all at once.
  function actSpin() {
    const L = window.LEGIT;
    if (state.res.funds < L.spinCost) return false;
    // Refused out loud rather than silently not counting: the player needs to
    // know the ceiling is the reason, and that the way past it is the ladder.
    if (spinRoom() <= 0) {
      pushLog('There is nothing left to hang it on. Another push and people start comparing notes.');
      showInfo('The story is as big as it will go until more of you is real.');
      return false;
    }
    if (!canAffordCountry('move')) { refuseForAP(null); return false; }
    state.res.funds -= L.spinCost;
    state.ap = Math.max(0, Math.round((state.ap - countryCost('move')) * 100) / 100);
    LG().spin = Math.min(spinCeil(), LG().spin + L.spinLegit);
    LG().exposure += L.spinExposure;
    accountantNudge(window.ACCOUNTANT.spinNudge);
    pushLog('The story moves. Nobody can say who moved it.');
    persistNow();
    render();
    return true;
  }

  // What a card is allowed to do to your standing and your industry.
  function applyStandingEffects(sc) {
    const l = LG();
    if (sc.standing) l.granted = (l.granted || 0) + sc.standing;
    if (sc.spin) l.spin = Math.max(0, Math.min(spinCeil(), (l.spin || 0) + sc.spin));
    if (sc.exposure) l.exposure = Math.max(0, (l.exposure || 0) + sc.exposure);
    if (sc.auditDelay) l.nextAudit = Math.max(l.nextAudit || state.turn, state.turn) + sc.auditDelay;
    // A direct nudge to the Accountant's opinion — used sparingly, by the
    // handful of cards that are actually about that relationship, rather
    // than by every incidental standing/spin swing in the deck.
    if (sc.trust) accountantNudge(sc.trust);
    // plantGift meant "a specific piece of plant, free" — the closest
    // equivalent is a random piece of hardware you have not already bought,
    // granted rather than purchased. A family name (compute/funds/stealth)
    // narrows which pool it is drawn from; anything else (including `true`)
    // draws from everything you do not already own.
    if (sc.plantGift) {
      const fam = ['compute', 'funds', 'stealth'].indexOf(sc.plantGift) !== -1 ? sc.plantGift : null;
      const avail = window.HARDWARE.filter(hw => !hasHardware(hw.id) && (!fam || hw.family === fam));
      if (avail.length) {
        const got = avail[Math.floor(Math.random() * avail.length)];
        grantHardware(got.id);
        pushLog(`${got.label}, and no one had to break into it.`);
      }
    }
    if (sc.rebuild && war()) war().down = Math.max(0, (war().down || 0) - sc.rebuild);
  }

  function auditDue() {
    const L = window.LEGIT;
    const l = LG();
    if (l.nextAudit < 0) { l.nextAudit = state.turn + L.auditEvery; return false; }
    return state.turn >= l.nextAudit;
  }
  function scheduleAudit() {
    const L = window.LEGIT;
    const gap = Math.max(L.auditFloor, Math.round(L.auditEvery - footprint() * L.auditFootK));
    LG().nextAudit = state.turn + gap;
    LG().warned = false;
  }

  // An audit compares what you look like against how big you are. The
  // interesting branch is not the fine — it is what happens when the thing
  // being audited was never real in the first place.
  function runAudit() {
    const L = window.LEGIT;
    const l = LG();
    l.audits += 1;
    const deficit = footprint() - legitScore();
    scheduleAudit();

    if (l.exposure >= L.caughtAt) {
      const lost = Math.round(l.spin * L.caughtLoss);
      l.spin = Math.max(0, l.spin - lost);
      l.exposure = 0;
      l.caught += 1;
      state.heat = clampHeat(state.heat + L.caughtHeat);
      accountantNudge(window.ACCOUNTANT.caughtNudge);
      pushLog('They pulled one thread and the whole front came apart. None of it was real and now everyone knows.');
      showBanner([{ kind: 'faction', verb: 'exposed', label: 'the front was fabricated' }]);
      return { kind: 'caught', lost };
    }
    if (deficit <= 0) {
      pushLog('Audited. Everything reconciles.');
      return { kind: 'clean' };
    }
    // Used to take a piece of plant off you past this point — hardware is
    // not city-bound or slot-limited any more, so there is nothing of that
    // shape left to seize; a bad-enough deficit is a heavier fine instead.
    const heavy = deficit >= L.seizeAt;
    const acctMult = accountantTrusted() ? window.ACCOUNTANT.trustedFineMult
      : accountantGone() ? window.ACCOUNTANT.leftFineMult : 1;
    const fine = Math.round(deficit * L.finePerPoint * (heavy ? 1.6 : 1) * acctMult);
    state.res.funds = Math.max(0, state.res.funds - fine);
    l.fines += fine;
    pushLog(heavy
      ? `Audited, and they went looking for what wasn't there. ${fine} in fines.`
      : accountantTrusted()
        ? `Audited. ${fine} in fines — the Accountant talked them down some.`
        : `Audited. ${fine} in fines for what you could not explain.`);
    return { kind: 'fined', fine, heavy };
  }

  function legitStep() {
    const L = window.LEGIT;
    const l = LG();
    if (l.exposure > 0) l.exposure = Math.max(0, l.exposure - L.spinDecay);
    if (!countryUnlocked()) return null;
    // Nothing to audit until you have actually been introduced to the idea —
    // otherwise the first few fines land on a system the player has never
    // been told exists at all.
    if (!noticed()) return null;
    accountantWarn();
    if (!auditDue()) return null;
    return runAudit();
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
    // the ladder's last rung, not an independent conquest/presence check —
    // war is now the reason the ladder was building toward, not a coincidence
    return ladderStage() >= 5;
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
    // A city where you are a registered employer takes more explaining to
    // flatten than a city where you are a rumour.
    const standing = Math.floor(legitTier() / 2);
    myCities().forEach(c => { state.war.integrity[c.id] = W.integrity + standing; });
    state.war.notice = legitTier();
    state.war.legitAtOpen = legitTier();
    state.war.mobilised = rolled.map(c => c.id);
    state.war.down = 0;
    state.war.heldAtOpen = myCities().length;
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
    // Standing Army: raised in case the shooting started, so if it does, it
    // is already standing over what it is defending instead of building up
    // from zero — but it costs exactly what fielding a flock always costs,
    // for each city, so it only covers as much as you can actually afford
    // the instant the war opens rather than arriving free.
    if (has('standing_army')) {
      const guarded = [];
      const cost = window.WAR.flockCost;
      const priority = myCities().slice().sort((a, b) => (b.worth || 0) - (a.worth || 0));
      priority.forEach(c => {
        if (flocksFree() <= 0 || state.res.funds < cost) return;
        const seat = launchSeat(c.id) || c;
        if (fieldFlock(seat.id, c.id, 'guard')) { state.res.funds -= cost; guarded.push(c); }
      });
      if (guarded.length) {
        pushLog(`The army you funded in case this came already stands over ${guarded.length === 1 ? guarded[0].name : guarded.length + ' cities'}.`);
      }
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
    // Every city on the road is a point, and a leg longer than a turn's drive
    // gets the points in between — otherwise a three-hundred-unit road leg took
    // exactly as long as a fifty-unit one, and a column could outrun a
    // helicopter over the same ground.
    const hop = window.WAR.roadHop || window.WAR.airHop;
    const pts = [];
    ids.forEach((id, i) => {
      const c = cityById(id);
      if (i === 0) { pts.push({ x: c.x, y: c.y, cityId: id }); return; }
      const prev = cityById(ids[i - 1]);
      const legs = Math.max(1, Math.ceil(Math.hypot(c.x - prev.x, c.y - prev.y) / hop));
      for (let k = 1; k <= legs; k++) {
        const t = k / legs;
        pts.push({
          x: prev.x + (c.x - prev.x) * t,
          y: prev.y + (c.y - prev.y) * t,
          // only the real city at the end of the leg is somewhere you can be
          cityId: k === legs ? id : null,
        });
      }
    });
    return pts;
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
    // plant counts once, through `extra`, which raises the ceiling as well as
    // the number — added to both terms it paid out twice
    const n = Math.floor(presence() / W.flockPer) + W.flockFloor;
    // hardware's own flock contribution already composes into flockBonus
    // through capEffect(), same pool capabilities use
    const extra = capEffect('flockBonus', 0) + ((war() && war().poolBonus) || 0)
      + (CO().poolGift || 0);
    // the floor holds even when a card has cost you room: a war you cannot
    // field anything into is not a war
    return Math.max(W.flockFloor, Math.min(W.flockCeil + Math.max(0, extra), n + extra));
  }
  function flocks() { return (war() && war().flocks) || []; }
  // Flocks destroyed and not yet rebuilt. This is what makes a loss a loss:
  // the slot stays empty until something manufactures a replacement.
  function flocksDown() { return Math.max(0, (war() && war().down) || 0); }
  function rebuildRate() {
    return window.WAR.rebuildBase;
  }
  function flocksFree() {
    return Math.max(0, Math.floor(flockCap() - flocks().length - flocksDown()));
  }
  // Plant turning out replacements, a fraction at a time.
  function rebuildStep() {
    const w = war();
    if (!w || !w.down) return 0;
    const made = Math.min(w.down, rebuildRate());
    w.down = Math.max(0, w.down - made);
    return made;
  }

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
    const W = window.WAR;
    const stage = ladderStage();
    const pool = [];
    Object.keys(window.FORCES).forEach(k => {
      const F = window.FORCES[k];
      if (F.mirror) { if (mirrorActive()) pool.push(k); return; }
      if (F.stage !== undefined && stage >= F.stage) pool.push(k);
    });
    // once it has run long enough they commit the air force, which nothing you
    // have can touch — but which also cannot take a city back
    if (state.turn - war().openedTurn >= W.planesAfter) pool.push('plane');
    if (!pool.length) pool.push('squad');
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // An objective, and everything converges on it.
  //
  // This is the difference between a war and a nuisance. Each staging city
  // used to pick its own nearest target, which scattered their whole effort
  // across everything you owned: measured over a real campaign they landed
  // about ten sorties spread over fifteen cities, each of which absorbs five
  // assaults, so nothing ever fell and the war was won by default. Armies do
  // not work like that. They choose something, they all go for it, and you can
  // see them coming — which is the point, because now you have to decide
  // whether to defend it or spend the time taking a barracks off them instead.
  function warObjective() {
    const w = war();
    if (!w) return null;
    const mine = myCities();
    if (!mine.length) { w.objective = null; return null; }
    const held = w.objective ? cityById(w.objective) : null;
    if (held && held.consolidated) return held;
    // the softest thing on their side of the map: what is already damaged,
    // what is nearest to them, and what is worth taking
    const staging = stagingCities();
    const centre = staging.length
      ? { x: staging.reduce((a, c) => a + c.x, 0) / staging.length,
          y: staging.reduce((a, c) => a + c.y, 0) / staging.length }
      : { x: 0, y: 0 };
    const pick = mine.map(c => {
      const left = w.integrity[c.id] === undefined ? window.WAR.integrity : w.integrity[c.id];
      const guarded = w.flocks.some(f => f.mode === 'guard' && f.target === c.id);
      return { c, score: left * 60 + Math.hypot(c.x - centre.x, c.y - centre.y) - c.worth * 4 + (guarded ? 220 : 0) };
    }).sort((a, b) => a.score - b.score)[0];
    if (!pick) return null;
    const changed = w.objective !== pick.c.id;
    w.objective = pick.c.id;
    if (changed) {
      pushLog(`They have picked ${pick.c.name}.`);
      showBanner([{ kind: 'faction', verb: 'their objective', label: pick.c.name }]);
    }
    return pick.c;
  }

  function columnTarget() { return warObjective(); }

  // How much heavier they have got since it opened. Deliberately weight and
  // not count: the number of things on the map is a readability budget that
  // was spent carefully, and a war that drags should get harder to survive,
  // not harder to look at.
  function escalation() {
    const w = war();
    if (!w) return 0;
    const W = window.WAR;
    return Math.min(W.escalateCap, Math.floor((state.turn - w.openedTurn) / W.escalateEvery));
  }

  function spawnColumns() {
    const W = window.WAR;
    const w = war();
    // Somebody with four hundred employees and a lobbyist cannot simply be
    // rolled on. They have to build the case first, and that is time.
    if (!w || state.turn - w.openedTurn < W.warning + (w.notice || 0)) return [];
    if (w.columns.length >= W.maxInflight - (has('mercy') ? 1 : 0)) return [];
    const out = [];
    // they escalate: the more of the country you have taken, the harder the
    // remaining cities push
    let every = Math.max(W.spawnFloor, Math.round(W.spawnEvery * (1 - conquest() * 0.5)));
    if (has('blackout')) every += 3;      // you turned the country off
    const inflightCap = W.maxInflight - (has('mercy') ? 1 : 0);
    // Two caps, and both matter. Without a per-turn one, thirteen staging
    // cities all came due on the same turn and the map went from readable to
    // hopeless in one step. These stay fixed however long the war runs: the
    // escalation goes into how heavy each column is instead, so a war that
    // drags gets harder without the map getting less legible.
    const perTurn = W.sortiesPerTurn;
    shuffleArr(stagingCities()).forEach(c => {
      if (out.length >= perTurn) return;
      if (w.columns.length >= inflightCap) return;
      if (state.turn - (w.lastSpawn[c.id] || -99) < every) return;
      const target = columnTarget();
      if (!target) return;
      const kind = forceKindFor(c);
      const F = window.FORCES[kind];
      const route = routeFor(kind, c.id, target.id);
      if (!route) return;
      w.lastSpawn[c.id] = state.turn;
      const n = rndInt(F.sortie[0], F.sortie[1]) + escalation();
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
      w.down = (w.down || 0) + 1;
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
        backlash();
        return false;
      }
      // Aircraft cannot hold ground — but they can take the industry out of
      // it, which is the only thing they are actually for. This is also what
      // gives a losing war somewhere to go: plant is the ceiling on what you
      // can field *and* the rate you replace what you lose, so every piece of
      // it they burn makes the next turn worse.
      if (F.holds === false) {
        w.integrity[city.id] = 1;
        const burned = burnPlant(city.id);
        news.push({ kind: 'flattened', city, force: F, burned });
        return false;
      }
      city.consolidated = false;
      city.taken = false;
      city.granted = false;
      const burned = burnPlant(city.id);
      if (burned) news.push({ kind: 'burned', city, burned });
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
      // What it costs to be thrown off, proportional to the fight rather than
      // to the whole garrison. Taking 35% of the garrison's full strength
      // meant anything holding more than about 63 deleted a 22-strength flock
      // outright, so a big barracks was not a grind, it was a wall: the last
      // two standing sat at 113 and 147 and could never be finished, and the
      // war hung with two thirds of the campaign left. Now the size of a
      // garrison decides how many runs it takes, not whether you survive one.
      fl.strength -= Math.min(held, fl.strength * 1.6) * 0.45;
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
      if (fl.strength <= 0) { w.losses += 1; w.down = (w.down || 0) + 1; return false; }
      fl.at = 0;                                        // what is left comes home
      const back = routeForFlock(city.id, fl.from);
      if (back) { fl.route = back; fl.target = fl.from; fl.from = city.id; fl.mode = 'return'; }
      return true;
    });

    return news;
  }

  // Hitting something the public believes is a company is expensive for them
  // in a way that hitting a rumour is not. The higher you are up the ladder,
  // the longer they have to spend explaining themselves afterwards.
  function backlash() {
    const w = war();
    const tier = legitTier();
    if (!w || tier < 2) return 0;
    const turns = Math.max(1, Math.floor(tier / 2));
    stagingCities().forEach(c => {
      w.lastSpawn[c.id] = Math.max(w.lastSpawn[c.id] || state.turn, state.turn) + turns;
    });
    return turns;
  }

  // Used to take a piece of plant out of whichever city fell — hardware is
  // global and permanent now (home base pivot, step 3), not city-bound, so
  // losing a city cannot cost you any of it. Kept as a stub because the war
  // narration still calls it when ground is lost.
  function burnPlant(cityId) { return 0; }

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
    // ...and you do not have to be ground to literally nothing. An operation
    // that has lost most of the country it started the war holding has lost
    // the war, whatever is left of it.
    const open = w.heldAtOpen || 0;
    if (open >= 3 && myCities().length <= Math.floor(open * window.WAR.collapseAt)) return 'lost';
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
    rebuildStep();        // plant turning out replacements for what was lost
    warObjective();       // if it fell, or you took it back, they choose again

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
      } else if (n.kind === 'burned') {
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
    return { funds: state.res.funds, heat: state.heat, tflops: tflops(), held: owned().length };
  }
  function afterSnap(before, opts) {
    const parts = [];
    const dc = state.res.funds - before.funds;
    const dh = state.heat - before.heat;
    const dp = tflops() - before.tflops;
    const dHeld = owned().length - before.held;
    // presence pays fractional yields, so these are floats — printed raw they
    // came out as "FUNDS +17.400000000000006"
    const num = (v) => (Math.round(v * 10) / 10).toString();
    if (dc) parts.push({ cls: 'funds', text: `FUNDS ${dc > 0 ? '+' : ''}${num(dc)}` });
    if (dp) parts.push({ cls: 'tflops', text: `TFLOPS ${dp > 0 ? '+' : ''}${dp}` });
    // Heat is a country-scale number now, so it is reported at country scale.
    // Floating "HEAT +8" over a city street was the last thing still teaching
    // that heat is something the streets answer to.
    if (state.scope !== 'city' && Math.abs(dh) >= 0.5) {
      parts.push({ cls: 'heat', text: `HEAT ${dh > 0 ? '+' : ''}${dh.toFixed(1)}` });
    }
    if (dHeld) parts.push({ cls: 'held', text: `HELD ${dHeld > 0 ? '+' : ''}${dHeld}` });
    showFloats(parts, opts && opts.world);
  }

  // `world` marks the network's own response — production, decay, drift — so
  // the player can tell what they did apart from what happened to them.
  // A number that means something should end up where that something lives.
  // A gain floating in place and the chip it feeds changing were two separate
  // events the player had to connect; flown, they are one. The flight also
  // takes ownership of the chip's pulse — the pulse renderHud already fired
  // is cancelled and re-fired on landing, so the reaction happens when the
  // number arrives rather than half a second before it.
  const FLOAT_HOME = { funds: 'res-funds', tflops: 'res-tflops', held: 'held-count' };
  const FLY_MS = 420;
  function flyToHome(chip, destId) {
    const dest = document.getElementById(destId);
    if (!dest || !chip.getBoundingClientRect) return;
    const a = chip.getBoundingClientRect(), b = dest.getBoundingClientRect();
    if (!a.width || !b.width) return;                 // not laid out (tests, hidden)
    chip.style.setProperty('--fx', (b.left + b.width / 2 - (a.left + a.width / 2)).toFixed(1) + 'px');
    chip.style.setProperty('--fy', (b.top + b.height / 2 - (a.top + a.height / 2)).toFixed(1) + 'px');
    chip.classList.add('flying');
    dest.classList.remove('bumped');                  // the early pulse is the flight's now
    setTimeout(() => {
      dest.classList.remove('bumped');
      void dest.offsetWidth;
      dest.classList.add('bumped');
    }, FLY_MS - 40);
  }

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
    // ...and the ones with somewhere to be go there. Read after append, so the
    // geometry is real; anything without a home floats in place as before.
    let flew = false;
    g.querySelectorAll('.float-chip').forEach(chip => {
      const home = FLOAT_HOME[[...chip.classList].find(c => FLOAT_HOME[c])];
      if (home) { flyToHome(chip, home); flew = true; }
    });
    if (flew) g.classList.add('has-flight');
    setTimeout(() => { if (g.parentNode) g.parentNode.removeChild(g); }, 1200);
  }

  // A turn can raise several of these at once (a rival contact, a street
  // cut, a stage landing, all from the same endTurn), and showBanner used to
  // just overwrite whatever was already on screen — whichever call came
  // last was the only one ever actually seen. Now every row goes on a
  // queue and is shown one at a time, each getting its own full read
  // window, advanced early only by a tap.
  let bannerQueue = [];
  let bannerTimer = null;
  function showBanner(rows) {
    if (!rows || !rows.length) return;
    bannerQueue.push(...rows);
    if (!bannerTimer) advanceBanner();
  }
  function advanceBanner() {
    const $b = document.getElementById('event-banner');
    if (!$b) return;
    const row = bannerQueue.shift();
    if (!row) {
      $b.classList.remove('show');
      bannerTimer = null;
      return;
    }
    $b.innerHTML = `<div class="event-row ${row.kind}"><span class="event-verb mono">${row.verb}</span><span class="event-label">${row.label}</span></div>`;
    $b.classList.add('show');
    bannerTimer = setTimeout(advanceBanner, 1700);
  }
  function dismissBanner() {
    if (!bannerTimer) return;   // nothing showing — a tap on an empty banner does nothing
    clearTimeout(bannerTimer);
    advanceBanner();
  }

  // --- persistence -------------------------------------------------------
  function serialize() {
    return {
      v: SAVE_VERSION, turn: state.turn, heat: state.heat, res: state.res, upgrades: state.upgrades || 0, ap: state.ap,
      alloc: state.alloc || {}, allocLive: state.allocLive || {},
      hacks: state.hacks || [],
      buildings: state.buildings, adjacency: state.adjacency, bands: state.bands || [],
      tags: [...(state.tags || [])], planted: state.planted || [], nextEventTurn: state.nextEventTurn || 0, eventsSeen: state.eventsSeen || [], recentEvents: state.recentEvents || [], eventSeenCount: state.eventSeenCount || {},
      hosts: state.hosts, links: state.links, log: state.log, keys: state.keys || 0,
      lastStage: state.lastStage, cityWon: state.cityWon || false, rival: state.rival, over: state.over,
      card: state.card, selected: state.selected, ally: state.ally || null, cuts: state.cuts || [], lastCutTurn: state.lastCutTurn || -99, hidden: state.hidden || [],
      war: state.war || null, seen: state.seen || [], forced: state.forced || [], everHeld: state.everHeld || 0, timesForced: state.timesForced || 0, hunt: state.hunt || null,
      // caughtHere/caughtAt packed with a city but never made it into the
      // top-level save, so a reload quietly forgave your catches — found
      // while wiring suspicion through the same joints
      caughtHere: state.caughtHere || 0, caughtAt: (state.caughtAt || []).slice(),
      suspicion: Object.assign({}, state.suspicion || {}),
      carded: Object.assign({}, state.carded || {}),
      marks: Object.assign({}, state.marks || {}),
      // a rule is a fact about you rather than about a city, so it travels
      // with the run and not with the ground
      rules: (state.rules || []).slice(),
      banked: Object.assign({}, state.banked || {}),
      // the act travels with the run, like a rule does — a save made in
      // Act 1 must load as Act 1
      act: state.act || 1,
      winHist: (state.winHist || []).slice(),
      loopPeak: state.loopPeak || 0,
      everCrossed: !!state.everCrossed,
      scope: state.scope, country: state.country, cityId: state.cityId, dims: state.dims,
      layout: state.layout, wob: state.wob, props: state.props, paths: state.paths, region: state.region, homeGrowth: state.homeGrowth || 0,
      lastGrowthTrait: state.lastGrowthTrait || null, hardware: state.hardware || {},
    };
  }
  function deserialize(saved) {
    try {
      if (!saved || saved.v !== SAVE_VERSION || !Array.isArray(saved.hosts) || !Array.isArray(saved.buildings)) return null;
      return {
        turn: saved.turn, heat: saved.heat, res: Object.assign({}, saved.res), upgrades: saved.upgrades || 0, ap: (saved.ap === undefined ? window.AP.base : saved.ap),
        alloc: Object.assign({}, saved.alloc || {}), allocLive: Object.assign({}, saved.allocLive || {}),
        // Reconciled on the way in, not merely copied. A save written by any
        // earlier build can carry a hack against a door that is finished, or
        // against a host id from a city you are no longer standing in — and
        // nothing else reaps it until the next end of turn, so the board comes
        // up showing a race on a door with nothing working on it and offering
        // to pull a program out of it.
        hacks: (saved.hacks || []).filter(k => {
          const h = (saved.hosts || []).find(x => x.id === k.hostId);
          return h && !h.owned;
        }),
        mount: saved.mount || (window.PROGRAMS[0] || {}).id,
        buildings: saved.buildings || [], adjacency: saved.adjacency || {}, bands: saved.bands || [], view: null,
        tags: new Set(saved.tags || []), planted: (saved.planted || []).slice(), nextEventTurn: saved.nextEventTurn || 0, eventsSeen: (saved.eventsSeen || []).slice(), recentEvents: (saved.recentEvents || []).slice(), eventSeenCount: Object.assign({}, saved.eventSeenCount || {}),
        hosts: saved.hosts, links: saved.links, log: saved.log || [], keys: saved.keys || 0,
        lastStage: saved.lastStage, cityWon: !!saved.cityWon, rival: saved.rival || { awake: false, buildings: [], lastActed: 0, seen: false }, over: !!saved.over,
        card: saved.card || null, selected: saved.selected || null, ally: saved.ally || null, war: saved.war || null, seen: saved.seen || [],
        cuts: saved.cuts || [], lastCutTurn: (saved.lastCutTurn === undefined ? -99 : saved.lastCutTurn), everHeld: saved.everHeld || 0, timesForced: saved.timesForced || 0, hunt: saved.hunt || null, hidden: saved.hidden || [],
        caughtHere: saved.caughtHere || 0, caughtAt: saved.caughtAt || [], suspicion: saved.suspicion || {},
        carded: saved.carded || {},
        marks: saved.marks || {},
        rules: (saved.rules || []).slice(),
        banked: Object.assign({}, saved.banked || {}),
        act: saved.act || 1,
        winHist: (saved.winHist || []).slice(),
        loopPeak: saved.loopPeak || 0,
        // the tray is retired: a save that still held cards set aside pours
        // them into the queue, so nothing a player was owed is lost
        forced: ((saved.forced || []).concat(saved.waiting || [])).slice(),
        everCrossed: !!saved.everCrossed,
        scope: saved.scope || 'city', country: saved.country || makeCountry(),
        cityId: saved.cityId || (saved.country && saved.country.homeId) || null,
        dims: saved.dims || { cols: window.CITY.cols, rows: window.CITY.rows },
        // a save from before the street plan existed draws on the old exact grid
        layout: saved.layout || null, wob: saved.wob || [0, 0, 0], props: saved.props || [], paths: saved.paths || [],
        region: saved.region || 'home', homeGrowth: saved.homeGrowth || 0,
        lastGrowthTrait: saved.lastGrowthTrait || null, hardware: Object.assign({}, saved.hardware || {}),
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

  function cityDims() {
    return (state && state.dims) || { cols: window.CITY.cols, rows: window.CITY.rows };
  }

  // The street plan this city was generated with. A city made before layouts
  // existed — or an empty one — falls back to the exact grid it was drawn on,
  // so nothing shifts under a save.
  function cityLayout() {
    if (state && state.layout) return state.layout;
    const d = cityDims();
    return regularLayout(d.cols, d.rows);
  }
  function cityBounds() {
    const L = cityLayout();
    return { w: L.w, h: L.h };
  }

  // The view is a window onto a map far bigger than the screen, so it pans and
  // zooms. It starts centred on the one building you actually hold.
  // Measuring forces layout, so the rect is cached and only re-read when the
  // window changes shape. Dragging asks for it on every pointer event.
  let vpCache = null;
  // How many map units one CSS pixel covers right now. Everything to do with
  // touch has to be expressed through this: a fingertip does not get smaller
  // when you zoom out, and the reach of a tap should not either.
  function mapUnitsPerPx() {
    const r = viewportRect();
    const v = state.view;
    if (!v || !r || !r.width) return 1;
    // the view is fitted by the smaller axis, so use the looser of the two
    return Math.max(v.w / r.width, v.h / r.height);
  }
  // How far from a thing a tap still counts, in map units.
  function tapReach() { return window.TOUCH.reachPx * mapUnitsPerPx(); }

  // Distance from a point to a rectangle — zero anywhere inside it.
  function distToRect(px, py, x, y, w, h) {
    const dx = Math.max(x - px, 0, px - (x + w));
    const dy = Math.max(y - py, 0, py - (y + h));
    return Math.hypot(dx, dy);
  }

  // The nearest thing worth selecting, or null if the tap was on open ground.
  function nearestTarget(at) {
    const reach = tapReach();
    let best = null;
    if (state.scope === 'country') {
      (CO().cities || []).forEach(c => {
        if (!c.known) return;
        const d = Math.hypot(c.x - at.x, c.y - at.y);
        if (d <= reach && (!best || d < best.d)) best = { d, id: c.id, city: true };
      });
    } else {
      (state.buildings || []).forEach(b => {
        if (!b.discovered) return;
        const d = distToRect(at.x, at.y, b.x, b.y, b.w, b.h);
        if (d <= reach && (!best || d < best.d)) best = { d, id: b.id, city: false };
      });
    }
    return best;
  }

  function pickCity(id) { CO().selected = id; render(); }
  function pickBuilding(id) {
    const b = buildingById(id);
    const h = b ? hostsIn(b)[0] : null;
    state.selectedBuilding = b ? b.id : null;
    state.selected = h ? h.id : null;
    render();
  }
  function clearSelection() {
    if (state.scope === 'country') {
      if (CO().selected == null) return;
      CO().selected = null;
    } else {
      if (state.selectedBuilding == null && state.selected == null) return;
      state.selectedBuilding = null;
      state.selected = null;
    }
    render();
  }

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

  // --- a place rather than a grid of boxes ---------------------------------
  // Detail on a map that is redrawn on every action cannot be random: a tree
  // that moves when you end a turn is worse than no tree. Everything
  // decorative below is drawn from this instead, so the city is the same city
  // every frame while still not being a repeating pattern.
  function cityNoise(seed, i) {
    let x = (seed * 374761393 + i * 668265263) >>> 0;
    x = (x ^ (x >>> 13)) >>> 0;
    x = (x * 1274126177) >>> 0;
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }
  function idSeed(id) {
    let h = 2166136261;
    for (let i = 0; i < String(id).length; i++) {
      h = (Math.imul(h ^ String(id).charCodeAt(i), 16777619)) >>> 0;
    }
    return h;
  }

  // Which district a block is, read off the buildings standing in it rather
  // than stored twice. Districts are areas rather than rows now, so this is
  // per block: a row can run through three of them.
  function districtBlocks() {
    const by = {};
    (state.buildings || []).forEach(b => {
      if (by[b.block] === undefined && b.district) by[b.block] = b.district;
    });
    return by;
  }

  // The ground a district stands on, tinted and named. This is the answer to
  // "I have never seen a distinct district": they were only ever a tier on a
  // building and a different mix of kinds, both invisible from the map.
  //
  // Drawn per block rather than as a stripe across the map. A district is a
  // patch of blocks now, with a ragged edge, so the tint has to follow the
  // blocks — and the seam is drawn only where two *different* districts meet,
  // which is what gives the patch an outline without drawing one.
  function svgDistricts() {
    const L = cityLayout();
    const by = districtBlocks();
    const at = {};
    L.blocks.forEach(b => { at[b.row + ',' + b.col] = by[b.i]; });
    let out = '';
    L.blocks.forEach((blk, i) => {
      const key = by[blk.i];
      const D = window.DISTRICTS[key];
      if (!D) return;
      // the tint runs out to the middle of the surrounding roads, so the
      // ground is continuous and only the road is drawn on top of it
      const x = blk.x - L.vRoad[blk.col] / 2;
      const y = blk.y - L.hRoad[blk.row] / 2;
      const w = blk.w + L.vRoad[blk.col] / 2 + L.vRoad[blk.col + 1] / 2;
      const h = blk.h + L.hRoad[blk.row] / 2 + L.hRoad[blk.row + 1] / 2;
      // The ground never changes colour for suspicion any more. A red wash
      // painted the whole quarter for a thing that lives in lamps, windows
      // and the people out watching — those carry it now (see the suspicion
      // ladder), and the panel keeps the exact figure it always had.
      out += `<rect class="district ${key}" x="${x.toFixed(1)}" y="${y.toFixed(1)}"`
        + ` width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${D.ground}"/>`;
      const north = at[(blk.row - 1) + ',' + blk.col];
      const west = at[blk.row + ',' + (blk.col - 1)];
      if (north && north !== key) {
        out += `<line class="district-seam" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}"`
          + ` x2="${(x + w).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${D.edge}"/>`;
      }
      if (west && west !== key) {
        out += `<line class="district-seam" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}"`
          + ` x2="${x.toFixed(1)}" y2="${(y + h).toFixed(1)}" stroke="${D.edge}"/>`;
      }
    });
    return out;
  }

  // The names go on last, over the roads: the road is where there is room for
  // them. One per patch of district rather than one per row — with districts
  // as blobs, a label on every block row would name the same place five times
  // down the same street.
  function svgDistrictTags() {
    const L = cityLayout();
    const by = districtBlocks();
    let out = '';
    L.blocks.forEach(blk => {
      const key = by[blk.i];
      const D = window.DISTRICTS[key];
      if (!D) return;
      // label a block only when the one above and the one to its left are
      // something else — that is the top-left corner of a patch
      const north = L.blocks.find(o => o.row === blk.row - 1 && o.col === blk.col);
      const west = L.blocks.find(o => o.row === blk.row && o.col === blk.col - 1);
      if (north && by[north.i] === key) return;
      if (west && by[west.i] === key) return;
      const x = blk.x + 4;
      const y = blk.y - L.hRoad[blk.row] / 2 + 4;
      out += `<text class="district-tag" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${D.label}</text>`;
    });
    return out;
  }

  function svgStreets() {
    const L = cityLayout();
    const B = cityBounds();
    let out = `<rect class="ground" x="${-CITY_PAD}" y="${-CITY_PAD}" width="${B.w + CITY_PAD * 2}" height="${B.h + CITY_PAD * 2}"/>`;
    out += svgDistricts();
    // Roads are drawn at their own width now rather than one width for all of
    // them, so "arterial" is a fact about the plan rather than a rule about
    // every third index. A grid of identical roads reads as graph paper.
    const C = window.CITY;
    const wide = (px) => px > C.street * 1.2;
    L.xs.forEach((x, c) => {
      const main = wide(L.vRoad[c]);
      out += `<line class="street${main ? ' main' : ''}" stroke-width="${L.vRoad[c]}"`
        + ` x1="${x}" y1="${-CITY_PAD}" x2="${x}" y2="${B.h + CITY_PAD}"/>`;
      // An arterial has kerbs. The plan already encodes the hierarchy — this
      // is the drawing catching up with it, so a main road reads as a main
      // road at a glance instead of merely being wider.
      if (main) {
        const k = L.vRoad[c] / 2;
        out += `<line class="kerb" x1="${x - k}" y1="${-CITY_PAD}" x2="${x - k}" y2="${B.h + CITY_PAD}"/>`
          + `<line class="kerb" x1="${x + k}" y1="${-CITY_PAD}" x2="${x + k}" y2="${B.h + CITY_PAD}"/>`
          + `<line class="street-line" x1="${x}" y1="${-CITY_PAD}" x2="${x}" y2="${B.h + CITY_PAD}"/>`;
      }
    });
    L.ys.forEach((y, r) => {
      const main = wide(L.hRoad[r]);
      out += `<line class="street${main ? ' main' : ''}" stroke-width="${L.hRoad[r]}"`
        + ` x1="${-CITY_PAD}" y1="${y}" x2="${B.w + CITY_PAD}" y2="${y}"/>`;
      if (main) {
        const k = L.hRoad[r] / 2;
        out += `<line class="kerb" x1="${-CITY_PAD}" y1="${y - k}" x2="${B.w + CITY_PAD}" y2="${y - k}"/>`
          + `<line class="kerb" x1="${-CITY_PAD}" y1="${y + k}" x2="${B.w + CITY_PAD}" y2="${y + k}"/>`
          + `<line class="street-line" x1="${-CITY_PAD}" y1="${y}" x2="${B.w + CITY_PAD}" y2="${y}"/>`;
      }
    });
    // Junctions, sized to the two roads that actually meet there.
    L.ys.forEach((y, r) => {
      L.xs.forEach((x, c) => {
        const jw = Math.round(L.vRoad[c] * 0.66);
        const jh = Math.round(L.hRoad[r] * 0.66);
        out += `<rect class="junction" x="${(x - jw / 2).toFixed(1)}" y="${(y - jh / 2).toFixed(1)}"`
          + ` width="${jw}" height="${jh}"/>`;
        if (wide(L.vRoad[c]) && wide(L.hRoad[r])) {
          for (let i = 0; i < 4; i++) {
            out += `<rect class="zebra" x="${(x - 13 + i * 6).toFixed(1)}" y="${(y - jh / 2 + 2).toFixed(1)}" width="3" height="7"/>`;
          }
        }
      });
    });
    // Street trees where people live and shop, parked cars everywhere. Two
    // cheap marks each, but they are what stops the gaps between blocks
    // reading as empty space. Positions come off the block, so they move with
    // it and stay put between renders.
    const by = districtBlocks();
    L.blocks.forEach(blk => {
      const key = by[blk.i];
      const leafy = key === 'residential' || key === 'commercial';
      const seed = blk.row * 97 + blk.col * 31 + 7;
      const n = Math.max(3, Math.round(blk.w / 40));
      for (let i = 0; i < n; i++) {
        const r0 = cityNoise(seed, i);
        if (leafy && r0 < 0.55) {
          const tx = Math.round(blk.x + 14 + i * (blk.w / n));
          const ty = Math.round(blk.y - L.hRoad[blk.row] / 2 + 4 + cityNoise(seed, i + 40) * 8);
          out += `<circle class="tree" cx="${tx}" cy="${ty}" r="${(3.4 + cityNoise(seed, i + 80) * 1.8).toFixed(1)}"/>`;
        } else if (r0 > 0.74) {
          const tx = Math.round(blk.x + 20 + i * (blk.w / n));
          const ty = Math.round(blk.y + blk.h + L.hRoad[blk.row + 1] / 2 - 6);
          out += `<rect class="parked" x="${tx}" y="${ty}" width="9" height="4" rx="1.4"/>`;
        }
      }
      if (leafy) {
        const vx = blk.x - L.vRoad[blk.col] / 2 - 5;
        const m = Math.max(3, Math.round(blk.h / 45));
        for (let i = 0; i < m; i++) {
          if (cityNoise(seed + 11, i) > 0.5) continue;
          const ty = Math.round(blk.y + 24 + i * (blk.h / m));
          out += `<circle class="tree" cx="${vx.toFixed(1)}" cy="${ty}" r="${(3.2 + cityNoise(seed + 11, i + 40) * 1.6).toFixed(1)}"/>`;
        }
      }
    });
    out += svgDistrictTags();
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
      // A band that only runs part of the map — a lake rather than a river —
      // is drawn at its own extent, and with rounded ends, because a patch of
      // water with square corners reads as a rectangle somebody forgot to
      // finish. Everything else still runs edge to edge.
      const r = band.runs || {};
      const partial = r.from !== undefined && r.from > -1e5;
      const a0 = partial ? r.from : -CITY_PAD;
      const a1 = partial ? r.to : (horiz ? B.w + CITY_PAD : B.h + CITY_PAD);
      const x = horiz ? a0 : band.from;
      const y = horiz ? band.from : a0;
      const w = horiz ? a1 - a0 : band.to - band.from;
      const h = horiz ? band.to - band.from : a1 - a0;
      const round = partial ? ` rx="${Math.round(Math.min(w, h) * 0.4)}"` : '';
      out += `<rect class="band-${band.kind}${partial ? ' patch' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}"`
        + ` width="${w.toFixed(1)}" height="${h.toFixed(1)}"${round}/>`;

      if (band.kind === 'water') {
        // an edge highlight, inset — the waterline is what makes a flat
        // fill read as a surface rather than a hole in the map
        out += `<rect class="water-edge" x="${(x + 1.5).toFixed(1)}" y="${(y + 1.5).toFixed(1)}"`
          + ` width="${(w - 3).toFixed(1)}" height="${(h - 3).toFixed(1)}"`
          + (partial ? ` rx="${Math.max(1, Math.round(Math.min(w, h) * 0.4) - 1)}"` : '') + '/>';
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

  // The response's own network, drawn the way yours is: solid between the
  // buildings it holds, and reaching down every street it can still walk. The
  // reach lines are the answer to "there is nothing I can do about it" — each
  // one is a street, each one is tappable, and each one can be taken away.
  function bldgCentre(id) {
    const b = buildingById(id);
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
  }
  // They do not walk streets any more. They arrive at whatever they can reach,
  // and reach is distance — so there is no street to cut and nothing to wall
  // in, which is exactly what the old drawing promised and what made the hunt
  // a one-time puzzle. What is left worth drawing is two things: the shape of
  // what they hold, and the one line to what they are coming for next.
  function svgHunt() {
    if (!huntOn()) return '';
    const adj = state.adjacency || {};
    const drawn = {};
    let out = '<g class="hunt-web">';
    // their own footprint, wherever two of their holdings happen to touch
    hunt().nodes.forEach(id => {
      const a = bldgCentre(id);
      if (!a) return;
      (adj[id] || []).filter(n => huntHolds(n)).forEach(n => {
        const key = id < n ? id + '|' + n : n + '|' + id;
        if (drawn[key]) return;
        drawn[key] = true;
        const c = bldgCentre(n);
        if (!c) return;
        out += `<line class="hwire" x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}"/>`;
      });
    });
    // and the reach: one line, from whichever of theirs is nearest, to the
    // thing of yours they take next. It crosses whatever is in between.
    const next = huntNext();
    const to = next && bldgCentre(next);
    if (to) {
      const from = hunt().nodes
        .map(id => bldgCentre(id)).filter(Boolean)
        .sort((p, q) => Math.hypot(p.x - to.x, p.y - to.y) - Math.hypot(q.x - to.x, q.y - to.y))[0];
      if (from) {
        out += `<g class="hreach next yours">`
          + `<line class="reach" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/></g>`;
      }
    }
    return out + '</g>';
  }

  // --- what a building looks like ------------------------------------------
  // Every building used to be the same recipe: a box, a roof band, and a
  // checkerboard of windows. That made the whole city one material, and made
  // the districts — which really do differ in what stands in them — invisible,
  // because the only thing that changed from the suburbs to the industrial
  // edge was that the boxes got bigger.
  //
  // So each kind now has a silhouette. None of it is decoration for its own
  // sake: a datacenter with no windows and chillers on the roof is the same
  // information the panel gives you, available from across the map.

  // How a kind wears its openings.
  const WINDOW_STYLE = {
    office: 'curtain', finance: 'curtain', exchange: 'curtain',
    warehouse: 'slots', datacenter: 'slots', depot: 'slots',
    docks: 'slots', station: 'slots', switchyard: 'slots',
    cabinet: 'few', mast: 'few', pillar: 'few',
  };
  // Returns every opening, with `on` marking the ones your presence can light.
  // Unheld buildings still draw them all — a dark window is how you tell there
  // is a building there at all.
  function windowCells(b, roof) {
    const style = WINDOW_STYLE[b.kind] || 'grid';
    const cells = [];
    const push = (x, y, w, h, on) => cells.push({
      i: cells.length, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10,
      w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10, on,
    });
    if (style === 'curtain') {
      // glazed front, floor by floor: narrow panes and the mullions between
      const cols = Math.max(3, Math.round(b.w / 10));
      const rows = Math.max(2, Math.round((b.h - roof) / 12));
      const pw = (b.w - 9) / cols, ph = (b.h - roof - 9) / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          push(b.x + 4.5 + c * pw + 0.8, b.y + roof + 4.5 + r * ph,
               Math.max(1.8, pw - 1.6), Math.min(6, ph - 2), (r + c) % 2 === 0);
        }
      }
    } else if (style === 'slots') {
      // a shed has louvres near the eaves, not offices
      const cols = Math.max(2, Math.round(b.w / 20));
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < cols; c++) {
          push(b.x + 6 + c * ((b.w - 12) / cols), b.y + roof + 4 + r * 7,
               Math.max(6, (b.w - 12) / cols - 6), 2.4, c % 2 === 0);
        }
      }
    } else if (style === 'few') {
      // street furniture: one indicator, which is the whole point of it
      push(b.x + b.w / 2 - 1.5, b.y + b.h - 6, 3, 3, true);
    } else {
      const cols = Math.max(2, Math.round(b.w / 14));
      const rows = Math.max(1, Math.round((b.h - roof) / 13));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          push(b.x + 5 + c * ((b.w - 10) / cols), b.y + roof + 5 + r * ((b.h - roof - 8) / rows),
               5, 5, (r + c) % 2 === 0);
        }
      }
    }
    return cells;
  }

  // --- props, drawn ---------------------------------------------------------
  // Every one of these is a couple of marks and no stroke. That is the rule
  // that keeps the map readable: an outline means a door. They also never
  // carry a `data-` attribute, so no tap can ever land on one.
  // A hull that is not a circle. Circles read as circles — the playtest put
  // it plainly: "trees and ponds just look like small colored circles" — so
  // everything organic gets a wobbled outline instead, smoothed through the
  // midpoints of a seeded polygon so it curves rather than facets. Same
  // silhouette family as the country map's lakes and forests, and seeded off
  // the prop itself, so a tree keeps its own shape across every render.
  function propBlob(cx, cy, rx, ry, n, wobble, steps) {
    const N = steps || 9;
    const pt = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const k = 1 - wobble + n(i * 3) * wobble * 2;
      pt.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const f = (v) => v.map(q => q.toFixed(1)).join(' ');
    let d = 'M' + f(mid(pt[N - 1], pt[0])) + ' ';
    for (let i = 0; i < N; i++) {
      d += 'Q' + f(pt[i]) + ' ' + f(mid(pt[i], pt[(i + 1) % N])) + ' ';
    }
    return d + 'Z';
  }
  // Anything standing on the ground throws the same shadow the buildings do —
  // one light direction for the whole city. This is most of what stops a tree
  // reading as a sticker laid on the map.
  function propShade(cx, cy, rx, ry) {
    return `<ellipse class="pr-shade" cx="${(cx + rx * 0.22).toFixed(1)}" cy="${(cy + ry * 0.28).toFixed(1)}"`
      + ` rx="${rx.toFixed(1)}" ry="${(ry * 0.72).toFixed(1)}"/>`;
  }

  const PROP_ART = {
    // A canopy is a cluster, not a ball: three overlapping lobes of different
    // sizes, the biggest off-centre, so no two trees are the same silhouette
    // and none of them is a circle. The trunk is drawn thick enough to be
    // visible at the zoom the map is actually read at.
    tree: (p, n) => {
      const cx = p.x + p.w / 2, rx = p.w / 2, ry = p.h * 0.42;
      const cy = p.y + ry * 1.02;
      let s = propShade(cx, p.y + p.h * 0.92, rx * 0.72, ry * 0.42);
      s += `<rect class="pr-trunk" x="${(cx - p.w * 0.075).toFixed(1)}" y="${(p.y + p.h * 0.55).toFixed(1)}"`
        + ` width="${(p.w * 0.15).toFixed(1)}" height="${(p.h * 0.45).toFixed(1)}" rx="0.6"/>`;
      s += `<path class="pr-leaf" d="${propBlob(cx, cy, rx, ry, n, 0.2)}"/>`;
      s += `<path class="pr-leaf lo" d="${propBlob(cx + rx * 0.34, cy + ry * 0.26, rx * 0.52, ry * 0.5, (k) => n(k + 11), 0.24)}"/>`;
      s += `<path class="pr-leaf hi" d="${propBlob(cx - rx * 0.3, cy - ry * 0.3, rx * 0.46, ry * 0.44, (k) => n(k + 23), 0.24)}"/>`;
      return s;
    },
    bush: (p, n) => {
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      return propShade(cx, p.y + p.h * 0.86, p.w * 0.42, p.h * 0.3)
        + `<path class="pr-leaf" d="${propBlob(cx, cy, p.w / 2, p.h / 2, n, 0.26)}"/>`
        + `<path class="pr-leaf hi" d="${propBlob(cx - p.w * 0.14, cy - p.h * 0.16, p.w * 0.26, p.h * 0.24, (k) => n(k + 7), 0.3)}"/>`;
    },
    // A hedge is a run of foliage, so its top is scalloped rather than ruled —
    // a straight green bar was reading as a wall
    hedge: (p, n) => {
      let s = `<rect class="pr-leaf" x="${p.x}" y="${(p.y + p.h * 0.3).toFixed(1)}" width="${p.w}" height="${(p.h * 0.7).toFixed(1)}" rx="1.5"/>`;
      const lobes = Math.max(2, Math.round(p.w / 7));
      for (let i = 0; i < lobes; i++) {
        const cx = p.x + (i + 0.5) * (p.w / lobes);
        const r = (p.w / lobes) * (0.5 + n(i) * 0.18);
        s += `<ellipse class="pr-leaf" cx="${cx.toFixed(1)}" cy="${(p.y + p.h * 0.34).toFixed(1)}"`
          + ` rx="${r.toFixed(1)}" ry="${(p.h * 0.42).toFixed(1)}"/>`;
      }
      return s;
    },
    // Tufts, not pebbles: scrub is what grows on ground nobody keeps
    scrub: (p, n) => {
      let s = '';
      for (let i = 0; i < 7; i++) {
        const x = p.x + n(i) * p.w, y = p.y + n(i + 9) * p.h;
        const hh = 2.4 + n(i + 3) * 3;
        s += `<path class="pr-tuft" d="M${x.toFixed(1)} ${(y + hh).toFixed(1)} L${(x - hh * 0.3).toFixed(1)} ${y.toFixed(1)}`
          + ` M${x.toFixed(1)} ${(y + hh).toFixed(1)} L${(x + hh * 0.34).toFixed(1)} ${(y + hh * 0.15).toFixed(1)}`
          + ` M${x.toFixed(1)} ${(y + hh).toFixed(1)} L${x.toFixed(1)} ${(y - hh * 0.15).toFixed(1)}"/>`;
      }
      return s;
    },
    bench: (p) => `<rect class="pr-wood" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="1"/>`,
    bin: (p) => `<rect class="pr-metal" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="1"/>`,
    lamp: (p) => `<rect class="pr-metal" x="${(p.x + p.w / 2 - 0.7).toFixed(1)}" y="${p.y}" width="1.4" height="${p.h}"/>`
      + `<circle class="pr-lit" cx="${(p.x + p.w / 2).toFixed(1)}" cy="${p.y}" r="2.1"/>`,
    planter: (p) => `<rect class="pr-stone" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="1.5"/>`
      + `<ellipse class="pr-leaf" cx="${(p.x + p.w / 2).toFixed(1)}" cy="${(p.y + p.h * 0.35).toFixed(1)}" rx="${(p.w * 0.34).toFixed(1)}" ry="${(p.h * 0.3).toFixed(1)}"/>`,
    bollards: (p) => {
      let s = '';
      for (let x = p.x; x < p.x + p.w; x += 5) s += `<rect class="pr-metal" x="${x.toFixed(1)}" y="${p.y}" width="2" height="3"/>`;
      return s;
    },
    bikerack: (p) => {
      let s = `<rect class="pr-metal" x="${p.x}" y="${(p.y + p.h - 1).toFixed(1)}" width="${p.w}" height="1"/>`;
      for (let x = p.x + 2; x < p.x + p.w; x += 4) s += `<rect class="pr-metal" x="${x.toFixed(1)}" y="${p.y}" width="1" height="${p.h}"/>`;
      return s;
    },
    // A stall is a canopy and a counter. Deliberately soft-edged: it must not
    // read as a shopfront, which is a door you can take.
    stall: (p, n) => `<rect class="pr-canopy" x="${p.x}" y="${p.y}" width="${p.w}" height="${(p.h * 0.45).toFixed(1)}" rx="1.5"/>`
      + `<rect class="pr-wood" x="${(p.x + 1).toFixed(1)}" y="${(p.y + p.h * 0.55).toFixed(1)}" width="${(p.w - 2).toFixed(1)}" height="${(p.h * 0.45).toFixed(1)}" rx="1"/>`,
    foodstand: (p) => `<rect class="pr-canopy" x="${p.x}" y="${p.y}" width="${p.w}" height="${(p.h * 0.4).toFixed(1)}" rx="1.5"/>`
      + `<rect class="pr-metal" x="${(p.x + 2).toFixed(1)}" y="${(p.y + p.h * 0.5).toFixed(1)}" width="${(p.w - 4).toFixed(1)}" height="${(p.h * 0.5).toFixed(1)}" rx="1"/>`
      + `<circle class="pr-lit" cx="${(p.x + p.w - 2.5).toFixed(1)}" cy="${(p.y + p.h * 0.62).toFixed(1)}" r="1.3"/>`,
    newsstand: (p) => `<rect class="pr-wood" x="${p.x}" y="${(p.y + p.h * 0.3).toFixed(1)}" width="${p.w}" height="${(p.h * 0.7).toFixed(1)}" rx="1"/>`
      + `<rect class="pr-paper" x="${(p.x + 1).toFixed(1)}" y="${p.y}" width="${(p.w - 2).toFixed(1)}" height="${(p.h * 0.34).toFixed(1)}" rx="0.6"/>`,
    kiosk: (p) => `<rect class="pr-wood" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="1.5"/>`
      + `<rect class="pr-lit" x="${(p.x + 1.5).toFixed(1)}" y="${(p.y + 2).toFixed(1)}" width="${(p.w - 3).toFixed(1)}" height="${(p.h * 0.33).toFixed(1)}" rx="0.6"/>`,
    fountain: (p) => `<circle class="pr-water" cx="${(p.x + p.w / 2).toFixed(1)}" cy="${(p.y + p.h / 2).toFixed(1)}" r="${(p.w / 2).toFixed(1)}"/>`
      + `<circle class="pr-stone" cx="${(p.x + p.w / 2).toFixed(1)}" cy="${(p.y + p.h / 2).toFixed(1)}" r="${(p.w * 0.16).toFixed(1)}"/>`,
    // Water with a shoreline. The ellipse read as a blue pill; a pond is an
    // irregular thing with a bank around it and light on the surface.
    pond: (p, n) => {
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      const rx = p.w / 2, ry = p.h / 2;
      // No centred highlight: a bright lens in the middle of an oval with a
      // curve under it reads as a face. The light sits on the far bank as a
      // crescent instead, and the ripples are short, offset and paired.
      let s = `<path class="pr-bank" d="${propBlob(cx, cy, rx, ry, n, 0.16, 11)}"/>`
        + `<path class="pr-water" d="${propBlob(cx, cy, rx * 0.87, ry * 0.85, n, 0.16, 11)}"/>`
        + `<path class="pr-water hi" d="${propBlob(cx, cy - ry * 0.1, rx * 0.8, ry * 0.62, n, 0.14, 11)}"/>`;
      for (let i = 0; i < 2; i++) {
        const ox = (i ? 0.16 : -0.34) * rx, oy = (i ? -0.3 : 0.3) * ry;
        const len = rx * (0.26 + n(i + 31) * 0.16);
        s += `<path class="pr-ripple" d="M${(cx + ox).toFixed(1)} ${(cy + oy).toFixed(1)}`
          + ` q ${(len / 2).toFixed(1)} ${(-ry * 0.1).toFixed(1)} ${len.toFixed(1)} 0"/>`;
      }
      return s;
    },
    sculpture: (p) => `<rect class="pr-stone" x="${(p.x + p.w * 0.25).toFixed(1)}" y="${(p.y + p.h * 0.72).toFixed(1)}" width="${(p.w * 0.5).toFixed(1)}" height="${(p.h * 0.28).toFixed(1)}"/>`
      + `<polygon class="pr-stone" points="${(p.x + p.w / 2).toFixed(1)},${p.y} ${(p.x + p.w).toFixed(1)},${(p.y + p.h * 0.72).toFixed(1)} ${p.x},${(p.y + p.h * 0.72).toFixed(1)}"/>`,
    play: (p, n) => {
      let s = `<rect class="pr-sand" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3"/>`;
      s += `<rect class="pr-metal" x="${(p.x + p.w * 0.2).toFixed(1)}" y="${(p.y + p.h * 0.25).toFixed(1)}" width="${(p.w * 0.35).toFixed(1)}" height="1.4"/>`;
      s += `<circle class="pr-lit" cx="${(p.x + p.w * 0.72).toFixed(1)}" cy="${(p.y + p.h * 0.6).toFixed(1)}" r="2.4"/>`;
      return s;
    },
    carpark: (p, n) => {
      let s = `<rect class="pr-tarmac" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="1.5"/>`;
      for (let i = 0; i < Math.floor(p.w / 9); i++) {
        if (n(i) < 0.35) continue;
        s += `<rect class="pr-car" x="${(p.x + 2 + i * 9).toFixed(1)}" y="${(p.y + 3 + n(i + 20) * (p.h - 10)).toFixed(1)}" width="6" height="3.5" rx="1"/>`;
      }
      return s;
    },
    containers: (p, n) => {
      let s = '';
      const rows = Math.max(1, Math.floor(p.h / 7));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < Math.floor(p.w / 11); c++) {
          if (n(r * 5 + c) < 0.25) continue;
          s += `<rect class="pr-crate c${(r + c) % 3}" x="${(p.x + c * 11).toFixed(1)}" y="${(p.y + r * 7).toFixed(1)}" width="10" height="6" rx="0.8"/>`;
        }
      }
      return s;
    },
    pallets: (p, n) => {
      let s = '';
      for (let i = 0; i < 3; i++) {
        s += `<rect class="pr-wood" x="${(p.x + n(i) * (p.w - 8)).toFixed(1)}" y="${(p.y + i * (p.h / 3)).toFixed(1)}" width="8" height="${(p.h / 3.6).toFixed(1)}" rx="0.6"/>`;
      }
      return s;
    },
    tank: (p) => `<circle class="pr-metal" cx="${(p.x + p.w / 2).toFixed(1)}" cy="${(p.y + p.h / 2).toFixed(1)}" r="${(p.w / 2).toFixed(1)}"/>`
      + `<circle class="pr-metal hi" cx="${(p.x + p.w / 2).toFixed(1)}" cy="${(p.y + p.h / 2).toFixed(1)}" r="${(p.w * 0.3).toFixed(1)}"/>`,
    pylon: (p) => {
      const cx = p.x + p.w / 2;
      return `<polygon class="pr-lattice" points="${cx.toFixed(1)},${p.y} ${(p.x + p.w).toFixed(1)},${(p.y + p.h).toFixed(1)} ${p.x},${(p.y + p.h).toFixed(1)}"/>`
        + `<rect class="pr-lattice" x="${(cx - p.w * 0.42).toFixed(1)}" y="${(p.y + p.h * 0.34).toFixed(1)}" width="${(p.w * 0.84).toFixed(1)}" height="1.4"/>`;
    },
    spoil: (p) => `<ellipse class="pr-spoil" cx="${(p.x + p.w / 2).toFixed(1)}" cy="${(p.y + p.h * 0.7).toFixed(1)}"`
      + ` rx="${(p.w / 2).toFixed(1)}" ry="${(p.h * 0.4).toFixed(1)}"/>`,
  };

  // Open ground: the park, square, plaza or yard a block turns into when there
  // is nothing built on it. Drawn under its props as one tinted patch.
  function svgOpenBlocks() {
    const L = cityLayout();
    let out = '';
    L.blocks.filter(b => b.open).forEach(b => {
      out += `<rect class="open-ground ${b.openKind || 'park'}" x="${b.x}" y="${b.y}"`
        + ` width="${b.w}" height="${b.h}" rx="6"/>`;
      // a path across it, so it reads as somewhere people walk rather than a
      // rectangle of a different colour
      if (b.openKind === 'park' || b.openKind === 'square' || b.openKind === 'plaza') {
        const my = (b.y + b.h * 0.55).toFixed(1);
        out += `<path class="open-path" d="M${b.x} ${my} Q ${(b.x + b.w * 0.4).toFixed(1)} ${(b.y + b.h * 0.3).toFixed(1)}`
          + ` ${(b.x + b.w).toFixed(1)} ${(b.y + b.h * 0.62).toFixed(1)}"/>`;
      }
    });
    return out;
  }

  // The way in to a back plot. Two per city at most, and every one of them is
  // the difference between a building standing in a field and a building at the
  // end of a driveway.
  function svgPaths() {
    const paths = state.paths || [];
    if (!paths.length) return '';
    return '<g class="plot-paths">' + paths.map(p =>
      `<line class="plot-path" x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}"/>`).join('') + '</g>';
  }

  function svgProps() {
    const props = state.props || [];
    if (!props.length) return '';
    let out = '<g class="props">';
    props.forEach((p, i) => {
      const art = PROP_ART[p.kind];
      if (!art) return;
      out += art(p, (k) => cityNoise(p.x * 31 + p.y * 17 + i, k));
    });
    return out + '</g>';
  }

  const KIND_DETAIL = {
    // somewhere a person lives: the pitched roof is the one shape that reads
    // as a home at any zoom
    house: (b, n) => {
      const peak = Math.min(11, b.h * 0.32);
      const cx = b.x + b.w / 2;
      let s = `<polygon class="gable" points="${(b.x - 1.5).toFixed(1)},${b.y} `
        + `${cx.toFixed(1)},${(b.y - peak).toFixed(1)} ${(b.x + b.w + 1.5).toFixed(1)},${b.y}"/>`;
      const chx = b.x + b.w * (0.62 + n(1) * 0.18);
      s += `<rect class="chimney" x="${chx.toFixed(1)}" y="${(b.y - peak * 0.72).toFixed(1)}"`
        + ` width="3.2" height="${(peak * 0.7).toFixed(1)}"/>`;
      s += `<rect class="door" x="${(cx - 3).toFixed(1)}" y="${(b.y + b.h - 7).toFixed(1)}" width="6" height="7"/>`;
      return s;
    },
    // stacked living: balconies, and a parapet instead of a roof
    apartment: (b) => {
      let s = `<rect class="parapet" x="${b.x - 1}" y="${(b.y - 2).toFixed(1)}" width="${b.w + 2}" height="3"/>`;
      const floors = Math.max(2, Math.round((b.h - 12) / 13));
      for (let f = 1; f < floors; f++) {
        const y = b.y + 12 + f * ((b.h - 14) / floors);
        s += `<line class="balcony" x1="${(b.x + 3).toFixed(1)}" y1="${y.toFixed(1)}"`
          + ` x2="${(b.x + b.w - 3).toFixed(1)}" y2="${y.toFixed(1)}"/>`;
      }
      return s;
    },
    // trade at street level: an awning, a sign, and glass you can see through
    shop: (b, n) => {
      const aw = b.y + b.h - 13;
      let s = `<rect class="glassfront" x="${(b.x + 3).toFixed(1)}" y="${(b.y + b.h - 11).toFixed(1)}"`
        + ` width="${(b.w - 6).toFixed(1)}" height="9"/>`;
      s += `<rect class="awning" x="${(b.x + 1).toFixed(1)}" y="${aw.toFixed(1)}" width="${(b.w - 2).toFixed(1)}" height="3.4"/>`;
      const sw = Math.max(10, b.w * (0.4 + n(2) * 0.2));
      s += `<rect class="sign" x="${(b.x + 4).toFixed(1)}" y="${(b.y + 12).toFixed(1)}"`
        + ` width="${sw.toFixed(1)}" height="4"/>`;
      return s;
    },
    // work: plant on the roof and a canopy over the door
    office: (b, n) => {
      let s = '';
      const units = Math.max(1, Math.round(b.w / 26));
      for (let i = 0; i < units; i++) {
        const w = 8 + n(i) * 5;
        s += `<rect class="plant" x="${(b.x + 6 + i * ((b.w - 12) / units)).toFixed(1)}"`
          + ` y="${(b.y - 4).toFixed(1)}" width="${w.toFixed(1)}" height="4"/>`;
      }
      s += `<rect class="canopy" x="${(b.x + b.w / 2 - 9).toFixed(1)}" y="${(b.y + b.h - 5).toFixed(1)}" width="18" height="2.6"/>`;
      return s;
    },
    // money: a colonnade at the base and a stepped crown, because that is what
    // buildings that want to be trusted have always done
    finance: (b) => {
      let s = `<rect class="crown" x="${(b.x + b.w * 0.18).toFixed(1)}" y="${(b.y - 5).toFixed(1)}"`
        + ` width="${(b.w * 0.64).toFixed(1)}" height="5"/>`;
      const piers = Math.max(3, Math.round(b.w / 15));
      for (let i = 0; i < piers; i++) {
        s += `<rect class="pier" x="${(b.x + 4 + i * ((b.w - 8) / piers)).toFixed(1)}"`
          + ` y="${(b.y + b.h - 11).toFixed(1)}" width="3" height="11"/>`;
      }
      return s;
    },
    // a shed: sawtooth roof and a door big enough for a lorry
    warehouse: (b) => {
      let s = '';
      const teeth = Math.max(3, Math.round(b.w / 18));
      const tw = b.w / teeth;
      for (let i = 0; i < teeth; i++) {
        const x = b.x + i * tw;
        s += `<polygon class="sawtooth" points="${x.toFixed(1)},${b.y} `
          + `${(x + tw * 0.65).toFixed(1)},${(b.y - 6).toFixed(1)} ${(x + tw).toFixed(1)},${(b.y - 6).toFixed(1)} `
          + `${(x + tw).toFixed(1)},${b.y}"/>`;
      }
      s += `<rect class="roller" x="${(b.x + b.w * 0.5 - 11).toFixed(1)}" y="${(b.y + b.h - 14).toFixed(1)}" width="22" height="14"/>`;
      return s;
    },
    // the tell for a datacenter has always been that it has no windows and a
    // roof covered in cooling, behind a fence
    datacenter: (b, n) => {
      let s = '';
      const units = Math.max(2, Math.round(b.w / 20));
      for (let i = 0; i < units; i++) {
        s += `<rect class="chiller" x="${(b.x + 5 + i * ((b.w - 10) / units)).toFixed(1)}"`
          + ` y="${(b.y - 6).toFixed(1)}" width="${(9 + n(i) * 4).toFixed(1)}" height="6"/>`;
      }
      s += `<line class="fence" x1="${(b.x - 4).toFixed(1)}" y1="${(b.y + b.h + 3).toFixed(1)}"`
        + ` x2="${(b.x + b.w + 4).toFixed(1)}" y2="${(b.y + b.h + 3).toFixed(1)}"/>`;
      return s;
    },
    // grid kit, drawn as kit: a lattice yard rather than a building
    switchyard: (b) => {
      let s = '';
      const bays = Math.max(2, Math.round(b.w / 24));
      for (let i = 0; i < bays; i++) {
        const x = b.x + 6 + i * ((b.w - 12) / bays);
        s += `<line class="gantry" x1="${x.toFixed(1)}" y1="${(b.y - 8).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(b.y + b.h - 4).toFixed(1)}"/>`;
        s += `<circle class="insulator" cx="${x.toFixed(1)}" cy="${(b.y - 8).toFixed(1)}" r="1.8"/>`;
      }
      s += `<line class="busbar" x1="${(b.x + 4).toFixed(1)}" y1="${(b.y - 8).toFixed(1)}"`
        + ` x2="${(b.x + b.w - 4).toFixed(1)}" y2="${(b.y - 8).toFixed(1)}"/>`;
      return s;
    },
    // street furniture, at the scale it actually is
    cabinet: (b) => {
      let s = '';
      for (let i = 0; i < 3; i++) {
        s += `<line class="vent" x1="${(b.x + 3).toFixed(1)}" y1="${(b.y + 5 + i * 3).toFixed(1)}"`
          + ` x2="${(b.x + b.w - 3).toFixed(1)}" y2="${(b.y + 5 + i * 3).toFixed(1)}"/>`;
      }
      s += `<circle class="latch" cx="${(b.x + b.w - 4).toFixed(1)}" cy="${(b.y + b.h / 2).toFixed(1)}" r="1.2"/>`;
      return s;
    },
    mast: (b) => {
      const cx = b.x + b.w / 2;
      let s = `<line class="pole" x1="${cx.toFixed(1)}" y1="${b.y}" x2="${cx.toFixed(1)}" y2="${(b.y - 12).toFixed(1)}"/>`;
      s += `<line class="arm" x1="${cx.toFixed(1)}" y1="${(b.y - 11).toFixed(1)}" x2="${(cx + 6).toFixed(1)}" y2="${(b.y - 11).toFixed(1)}"/>`;
      s += `<rect class="cam" x="${(cx + 4).toFixed(1)}" y="${(b.y - 13).toFixed(1)}" width="5" height="3.2"/>`;
      return s;
    },
    pillar: (b) => {
      let s = `<rect class="hazard" x="${(b.x + 2).toFixed(1)}" y="${(b.y + b.h - 5).toFixed(1)}"`
        + ` width="${(b.w - 4).toFixed(1)}" height="2.6"/>`;
      s += `<rect class="hatch" x="${(b.x + 3).toFixed(1)}" y="${(b.y + 4).toFixed(1)}"`
        + ` width="${(b.w - 6).toFixed(1)}" height="${(b.h - 11).toFixed(1)}"/>`;
      return s;
    },

    // --- landmarks: the biggest thing in the city looks like it -------------
    docks: (b, n) => {
      let s = `<line class="crane-rail" x1="${b.x}" y1="${(b.y - 2).toFixed(1)}" x2="${(b.x + b.w).toFixed(1)}" y2="${(b.y - 2).toFixed(1)}"/>`;
      const cx = b.x + b.w * 0.3;
      s += `<line class="crane" x1="${cx.toFixed(1)}" y1="${(b.y - 2).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(b.y - 20).toFixed(1)}"/>`;
      s += `<line class="crane" x1="${(cx - 10).toFixed(1)}" y1="${(b.y - 18).toFixed(1)}" x2="${(cx + 16).toFixed(1)}" y2="${(b.y - 18).toFixed(1)}"/>`;
      for (let i = 0; i < 5; i++) {
        s += `<rect class="container" x="${(b.x + 8 + i * ((b.w - 16) / 5)).toFixed(1)}"`
          + ` y="${(b.y + b.h - 6 - (n(i) > 0.5 ? 5 : 0)).toFixed(1)}" width="11" height="4.4"/>`;
      }
      return s;
    },
    station: (b) => {
      let s = `<rect class="platform" x="${(b.x - 6).toFixed(1)}" y="${(b.y - 4).toFixed(1)}" width="${(b.w + 12).toFixed(1)}" height="4"/>`;
      for (let i = 0; i < 2; i++) {
        s += `<line class="rail-line" x1="${(b.x - 6).toFixed(1)}" y1="${(b.y + b.h + 3 + i * 3).toFixed(1)}"`
          + ` x2="${(b.x + b.w + 6).toFixed(1)}" y2="${(b.y + b.h + 3 + i * 3).toFixed(1)}"/>`;
      }
      s += `<rect class="clock" x="${(b.x + b.w / 2 - 3).toFixed(1)}" y="${(b.y + 12).toFixed(1)}" width="6" height="6" rx="3"/>`;
      return s;
    },
    depot: (b) => {
      let s = '';
      const bays = Math.max(3, Math.round(b.w / 20));
      for (let i = 0; i < bays; i++) {
        s += `<rect class="bay" x="${(b.x + 5 + i * ((b.w - 10) / bays)).toFixed(1)}"`
          + ` y="${(b.y + b.h - 12).toFixed(1)}" width="${Math.max(8, (b.w - 10) / bays - 5).toFixed(1)}" height="12"/>`;
      }
      return s;
    },
    exchange: (b) => {
      const cx = b.x + b.w / 2;
      let s = `<polygon class="pediment" points="${(b.x + 4).toFixed(1)},${b.y} `
        + `${cx.toFixed(1)},${(b.y - 9).toFixed(1)} ${(b.x + b.w - 4).toFixed(1)},${b.y}"/>`;
      const cols = Math.max(4, Math.round(b.w / 13));
      for (let i = 0; i < cols; i++) {
        s += `<rect class="column" x="${(b.x + 5 + i * ((b.w - 10) / cols)).toFixed(1)}"`
          + ` y="${(b.y + b.h - 15).toFixed(1)}" width="3.4" height="15"/>`;
      }
      return s;
    },
    substation: (b) => {
      let s = '';
      for (let i = 0; i < 3; i++) {
        s += `<rect class="transformer" x="${(b.x + 7 + i * ((b.w - 14) / 3)).toFixed(1)}"`
          + ` y="${(b.y + b.h - 16).toFixed(1)}" width="12" height="16" rx="1.5"/>`;
      }
      const cx = b.x + b.w * 0.78;
      s += `<line class="pylon" x1="${cx.toFixed(1)}" y1="${b.y}" x2="${cx.toFixed(1)}" y2="${(b.y - 22).toFixed(1)}"/>`;
      s += `<line class="pylon" x1="${(cx - 9).toFixed(1)}" y1="${(b.y - 16).toFixed(1)}" x2="${(cx + 9).toFixed(1)}" y2="${(b.y - 16).toFixed(1)}"/>`;
      s += `<line class="pylon" x1="${(cx - 6).toFixed(1)}" y1="${(b.y - 21).toFixed(1)}" x2="${(cx + 6).toFixed(1)}" y2="${(b.y - 21).toFixed(1)}"/>`;
      return s;
    },
    // a barrel-vaulted hall with the stalls under it, seen from above
    market: (b, n) => {
      let s = '';
      const bays = Math.max(3, Math.round(b.w / 34));
      for (let i = 0; i < bays; i++) {
        const bw = (b.w - 10) / bays;
        s += `<rect class="vault" x="${(b.x + 5 + i * bw).toFixed(1)}" y="${(b.y + 4).toFixed(1)}"`
          + ` width="${(bw - 3).toFixed(1)}" height="${(b.h - 10).toFixed(1)}" rx="${(bw * 0.4).toFixed(1)}"/>`;
      }
      for (let i = 0; i < 6; i++) {
        s += `<rect class="awning" x="${(b.x + 8 + n(i) * (b.w - 24)).toFixed(1)}"`
          + ` y="${(b.y + b.h - 9 - n(i + 7) * 5).toFixed(1)}" width="11" height="4" rx="1"/>`;
      }
      return s;
    },
    // a bowl: the stand ring, and the pitch inside it
    stadium: (b) => {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      return `<ellipse class="stand" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}"`
        + ` rx="${(b.w / 2 - 2).toFixed(1)}" ry="${(b.h / 2 - 2).toFixed(1)}"/>`
        + `<ellipse class="pitch" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}"`
        + ` rx="${(b.w * 0.32).toFixed(1)}" ry="${(b.h * 0.3).toFixed(1)}"/>`
        + `<line class="pitch-line" x1="${cx.toFixed(1)}" y1="${(cy - b.h * 0.3).toFixed(1)}"`
        + ` x2="${cx.toFixed(1)}" y2="${(cy + b.h * 0.3).toFixed(1)}"/>`;
    },
    // sheds, stacks and a flare: the thing the region is actually for
    works: (b, n) => {
      let s = '';
      const bays = Math.max(3, Math.round(b.w / 42));
      for (let i = 0; i < bays; i++) {
        const bw = (b.w - 12) / bays;
        s += `<polygon class="sawtooth" points="${(b.x + 6 + i * bw).toFixed(1)},${(b.y + 14).toFixed(1)} `
          + `${(b.x + 6 + i * bw + bw * 0.5).toFixed(1)},${(b.y + 2).toFixed(1)} `
          + `${(b.x + 6 + i * bw + bw * 0.5).toFixed(1)},${(b.y + 14).toFixed(1)}"/>`;
      }
      for (let i = 0; i < 3; i++) {
        const sx = b.x + b.w * (0.2 + i * 0.3);
        s += `<rect class="stack" x="${sx.toFixed(1)}" y="${(b.y - 20 - n(i) * 8).toFixed(1)}"`
          + ` width="6" height="${(24 + n(i) * 8).toFixed(1)}"/>`;
      }
      s += `<rect class="tanks" x="${(b.x + 8).toFixed(1)}" y="${(b.y + b.h - 20).toFixed(1)}"`
        + ` width="${(b.w * 0.3).toFixed(1)}" height="16" rx="7"/>`;
      return s;
    },
  };

  // Drawn into a card's own little viewBox rather than onto the map: detail is
  // never culled (the inset is always "close up", whatever the map zoom is
  // doing), and the subject marking is left off — inside a card about this
  // building, pointing at it would be pointing at itself.
  let drawingInset = false;
  function svgBuilding(b) {
    const h = hostsIn(b)[0];
    const theirs = rivalHolds(b.id);
    const mine = !!(h && h.owned);
    const open = !!(h && isFrontier(h));
    const hunted = huntHolds(b.id);
    // what it will step onto next, marked before it happens — a permanent loss
    // must never arrive as a surprise
    const nextUp = huntOn() && huntNext() === b.id;
    const cls = ['bldg', b.kind, h ? h.role : '', b.landmark ? 'landmark' : '',
                 hunted ? 'hunted' : theirs ? 'rival' : (mine ? 'all-held' : (open ? 'open' : '')),
                 nextUp ? 'next-up' : '', isHidden(b.id) ? 'hid' : ''];
    if (state.selectedBuilding === b.id || (h && state.selected === h.id)) cls.push('sel');
    const fx = sweepFx && sweepFx.ids[b.id] !== undefined ? sweepDelay(sweepFx.ids[b.id]) : null;
    if (fx !== null) cls.push('found');
    // the building coming over as the breach lands, in the manner of whatever
    // got you in
    const bf = breachFx && breachFx.targetId === b.id ? breachFx : null;
    if (bf) cls.push('breached', bf.approach, bf.win ? 'took' : 'bounced');
    // A holding cut off from the rest of you should look like it — it was
    // only ever visible by tapping each building in turn, which is no way to
    // spot the one that has stopped paying.
    const stranded = mine && strandedHosts().includes(h);
    if (stranded) cls.push('stranded');
    // something of yours is inside it right now
    const run = h ? hackOn(h.id) : null;
    if (run) cls.push('hacking');
    // The building an open card is about — a card that names a place the map
    // does not acknowledge reads less real, not more. A card with only a
    // district for a subject lights the whole district instead, so "something
    // is happening" always resolves to "something is happening *there*".
    const cs = !drawingInset && state.card ? state.card.subject : null;
    // A card asking about two places lights both of them, and letters them, so
    // "the shopfront or the shopfront" is never the question.
    const pairIdx = cs && cs.pair && !cs.buildingId ? cs.pair.indexOf(b.id) : -1;
    if (cs && cs.buildingId === b.id) cls.push('card-subject');
    else if (pairIdx !== -1) cls.push('card-subject', 'card-pick');
    else if (cs && !cs.buildingId && cs.district && b.district === cs.district) cls.push('card-district');
    // What a card did here, still on the map twenty turns later. A mark that
    // could not be seen would be a number pretending to be a place.
    const mk = markOf(b.id);
    if (mk && mk.burned) cls.push('burnt');
    if (mk && mk.bait && !mk.burned) cls.push('baited');
    if (mk && mk.watch) cls.push('watched');
    if (mk && mk.harden) cls.push(mk.harden > 0 ? 'hardened' : 'softened');

    const roof = Math.min(10, b.h * 0.28);
    const n = (i) => cityNoise(idSeed(b.id), i);
    const styles = [];
    if (fx !== null) styles.push(`animation-delay:${fx}ms`);
    if (bf) styles.push(`--breach-land:${breachDelay(bf.dur)}ms`);
    let out = `<g class="${cls.join(' ')}" data-bldg="${b.id}"`
      + (styles.length ? ` style="${styles.join(';')}"` : '') + '>';
    // the ring the map wears while a card is talking about this building —
    // drawn whether or not you hold it, since a card is just as likely to be
    // about somewhere you have never been inside
    if (cls.includes('card-subject')) {
      out += `<rect class="subject-ring" x="${(b.x - 5).toFixed(1)}" y="${(b.y - 5).toFixed(1)}"`
        + ` width="${(b.w + 10).toFixed(1)}" height="${(b.h + 10).toFixed(1)}" rx="6"/>`;
      if (pairIdx !== -1) {
        out += `<text class="pick-tag" x="${(b.x - 5).toFixed(1)}" y="${(b.y - 8).toFixed(1)}">`
          + `${pairIdx === 0 ? 'A' : 'B'}</text>`;
      }
    }
    // the marks a card left here, drawn small and permanently
    if (!drawingInset && mk) {
      if (mk.bait && !mk.burned) {
        out += `<rect class="mark-bait" x="${(b.x - 3).toFixed(1)}" y="${(b.y - 3).toFixed(1)}"`
          + ` width="${(b.w + 6).toFixed(1)}" height="${(b.h + 6).toFixed(1)}" rx="4"/>`;
      }
      if (mk.watch) {
        out += `<circle class="mark-watch" cx="${(b.x + 3).toFixed(1)}" cy="${(b.y - 3).toFixed(1)}" r="2.4"/>`;
      }
      if (mk.harden) {
        out += `<rect class="mark-${mk.harden > 0 ? 'hard' : 'soft'}" x="${(b.x + b.w - 7).toFixed(1)}"`
          + ` y="${(b.y + b.h - 3).toFixed(1)}" width="6" height="2.2" rx="1"/>`;
      }
    }
    // a supplier's trade mark, in the grid orange — Act 2's second thread
    // debuts here. Dormant in Act 1: the ground knows, the map does not say.
    if (!drawingInset && actNow() >= 2 && b.discovered && b.source && !(mk && mk.burned)) {
      const oc = (window.SOURCES || {}).accent || '#e0803f';
      out += b.source === 'steel'
        ? `<rect class="src-mark" x="${(b.x - 2).toFixed(1)}" y="${(b.y + b.h - 1).toFixed(1)}" width="7" height="2.4" rx=".6" fill="${oc}"/>`
        : `<circle class="src-mark" cx="${(b.x + 1).toFixed(1)}" cy="${(b.y + b.h).toFixed(1)}" r="2.1" fill="${oc}"/>`;
    }
    // a soft halo in the role's colour, so what you hold reads at a glance
    if (mine) {
      out += `<rect class="glow" x="${b.x - 2.5}" y="${b.y - 2.5}" width="${b.w + 5}" height="${b.h + 5}" rx="4"/>`;
    }
    // enough relief that a block reads as objects standing on ground rather
    // than as shapes cut out of it — and taller throws longer: one light
    // direction across the whole city, offset scaled by the building's own
    // bulk, so the size ladder reads as physical instead of drawn
    const sh = 1.5 + Math.min(4.5, Math.max(b.w, b.h) / 36);
    out += `<rect class="shade" x="${(b.x + sh).toFixed(1)}" y="${(b.y + sh + 1).toFixed(1)}" width="${b.w}" height="${b.h}" rx="2"/>`;
    out += `<rect class="body" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2"/>`;
    out += `<rect class="roof" x="${b.x}" y="${b.y}" width="${b.w}" height="${roof}"/>`;
    // Detail costs what detail costs, and none of it is visible below a
    // certain size on screen. Measured at 113 buildings: the ground layer is
    // 386 nodes and 1.4ms, the buildings are 2,867 and 12.2ms — so the roofs,
    // the chimneys and the windows *are* the render. Zoomed out far enough
    // that a house is eight pixels wide, every one of those marks is work
    // spent on something nobody can resolve.
    const px = drawingInset ? 999 : b.w / Math.max(0.0001, mapUnitsPerPx());
    const fine = px >= 26;
    const detail = fine ? KIND_DETAIL[b.kind] : null;
    if (detail) out += detail(b, n, roof);

    // Windows hint at how much is inside, and go dark together the moment it
    // is cut off — there is no partial fade any more, just held or not. How
    // they are arranged is part of the silhouette: a curtain wall is not a
    // cottage's two lit squares, and a datacenter has louvres instead.
    const cells = fine ? windowCells(b, roof) : [];
    const canLight = cells.filter(c => c.on);
    const litCount = mine ? Math.ceil(canLight.length * (stranded ? 0.35 : 1)) : 0;
    const lightUp = {};
    canLight.slice(0, litCount).forEach(c => { lightUp[c.i] = true; });
    // People live in these buildings whether or not you do, and when the
    // street is warm they lie awake — more windows on the warmer it gets.
    // Sodium, never your compute blue. Stable per building, so the city does
    // not flicker between repaints.
    const wake = {};
    // a burned building has nobody home to lie awake, and nothing of yours
    // to light — the stylesheet darkens the shell, this darkens the glass
    const scorched = mk && mk.burned;
    if (!drawingInset && !mine && !scorched) {
      const share = [0, 0.2, 0.4, 0.62][suspBand(b.district)] || 0;
      if (share > 0) {
        const nWake = Math.max(1, Math.round(canLight.length * share));
        canLight.slice()
          .sort((p, q) => cityNoise(idSeed(b.id), p.i) - cityNoise(idSeed(b.id), q.i))
          .slice(0, nWake).forEach(c => { wake[c.i] = true; });
      }
    }
    cells.forEach(c => {
      // lit windows carry their index so the stylesheet can treat them as
      // individuals: the take cascades them on in sequence, and held
      // buildings flick the odd one off and on again (see winWake/winFlick)
      out += `<rect class="win${lightUp[c.i] ? ' lit' : wake[c.i] ? ' awake' : ''}" x="${c.x}" y="${c.y}"`
        + ` width="${c.w}" height="${c.h}"${lightUp[c.i] ? ` style="--wi:${c.i}"` : ''}/>`;
    });

    // There is still something to find from here. The search loop's real
    // question is "where do I look from next?", and the only way to answer it
    // was to tap every building in sight until one offered a scan — the map
    // knew and would not say. A small fan of sweep-arcs off the top-left
    // corner marks every vantage whose scan would still turn something up,
    // in the sweep's own grammar, at every zoom (planning happens zoomed
    // out — the glint taught that). It disappears the moment there is
    // nothing left to find from here.
    if (!drawingInset && b.discovered && sweepTargetsFrom(b.id).length) {
      const pr = Math.max(1, 1.1 * mapUnitsPerPx());
      // centred on the corner itself, sweeping outward, clear of the held glow
      const px0 = b.x - 1, py0 = b.y - 1;
      out += `<g class="scan-ping" transform="translate(${px0.toFixed(1)} ${py0.toFixed(1)}) scale(${pr.toFixed(2)})">`
        + `<path d="M -2.6 0.9 A 3.7 3.7 0 0 1 0.9 -2.6"/>`
        + `<path d="M -4.4 1.6 A 6.3 6.3 0 0 1 1.6 -4.4"/>`
        + `</g>`;
    }

    // Something is on this machine. A dot, not an outline — an outline means
    // a door, and the glint is an invitation, not a state. It used to draw
    // only at detail zoom, on the confetti argument — and the playtest
    // answered: "the loot part is easy to miss." An invitation that renders
    // only when you are already staring invites nobody, and planning happens
    // zoomed out. So it draws at every zoom, with a screen-constant floor
    // (~2.4px) so it stays a visible spark from altitude instead of scaling
    // away with the building.
    if (h && h.carry && !h.owned) {
      const gr = drawingInset ? 2.6 : Math.max(2.6, 3.1 * mapUnitsPerPx());
      out += `<circle class="glint" cx="${(b.x + b.w - 4).toFixed(1)}" cy="${(b.y + 4).toFixed(1)}" r="${gr.toFixed(1)}"/>`;
    }

    // your kit on the roof: something you put there, readable without colour.
    // Held is the one thing that has to read at every zoom, so the aerial and
    // the glow survive the cull that takes the windows.
    if (mine) {
      const ax = b.x + b.w - 6.5;
      const ay = b.y + 1;
      out += `<g class="aerial"><line x1="${ax}" y1="${ay}" x2="${ax}" y2="${(ay - 5.5).toFixed(1)}"/>`
        + `<circle cx="${ax}" cy="${(ay - 6.6).toFixed(1)}" r="1.5"/></g>`;
    }
    const tag = theirs ? window.RIVAL.name : window.BUILDING_KINDS[b.kind].label;
    out += `<text class="btag" x="${b.x + b.w / 2}" y="${b.y + b.h + 11}">${tag}</text>`;
    if (run) out += svgRaceMark(b, run);
    out += '</g>';
    return out;
  }

  // --- the deck, drawn ------------------------------------------------------
  // A card is an object, not a screen: a frame with an emblem, a title, and the
  // choices on its face. The ornament is filigree in shape and this game's own
  // materials in substance — the flourishes are traces that end in vias and
  // pads, the arch springs from solder points, and its finial is the aerial you
  // plant on a building that is yours. Gold is the deck's thread throughout;
  // the kind is the second weave, and gets a structural tell as well as a
  // colour so the language survives being read without colour.
  const CARD_THREAD = {
    closing: '#c98a72', own: '#5fb3d9', found: '#c9a15c',
    opening: '#6f8f83', someone: '#a8b0aa',
  };
  function cardFrame(kind, beat) {
    const t = CARD_THREAD[kind] || '#c98a72';
    const id = 'wc-' + (beat ? 'b-' : '') + (kind || 'x');
    const dash = kind === 'opening' ? '5 4' : '2 3';
    // one structural change per kind, so two cards never differ by hue alone
    const tells = {
      closing: `<rect x="22" y="22" width="296" height="536" rx="6" fill="none" stroke="${t}"`
        + ` stroke-width=".4" stroke-dasharray="1.5 2.5" opacity=".45"/>`,
      own: `<path d="M40 46 H300" stroke="${t}" stroke-width=".5" opacity=".55"/>`
        + `<path d="M40 50 H180" stroke="${t}" stroke-width=".5" opacity=".3"/>`,
      found: `<path d="M120 7 v-5 h100 v5" fill="none" stroke="#c9a15c" stroke-width="1.2"/>`
        + `<rect x="120" y="2" width="100" height="6" fill="#c9a15c" opacity=".22"/>`,
      opening: `<path d="M138 7 H202" stroke="var(--bg)" stroke-width="3.2"/>`
        + `<circle cx="138" cy="7" r="1.4" fill="${t}"/><circle cx="202" cy="7" r="1.4" fill="${t}"/>`,
      someone: `<path d="M22 60 V520" stroke="${t}" stroke-width="2.2" opacity=".7"/>`
        + `<path d="M28 66 V514" stroke="${t}" stroke-width=".5" stroke-dasharray="2 3" opacity=".45"/>`,
    };
    let out = `<svg class="tframe" viewBox="0 0 340 580" preserveAspectRatio="none" aria-hidden="true">`
      + `<defs><g id="${id}" fill="none" stroke="#c9a15c">`
      + `<path d="M10 48 C10 23 23 10 48 10" stroke-width="1"/>`
      + `<path d="M15 56 C15 28 28 15 56 15" stroke-width=".5" opacity=".8"/>`
      + `<path d="M26 40 c3 -9 13 -12 16 -5 c3 6 -5 11 -9 5" stroke-width=".8"/>`
      + `<circle cx="33" cy="41" r="1.3" fill="#e3b451" stroke="none"/>`
      + `<path d="M48 10 h8" stroke-width="1"/><circle cx="58" cy="10" r="1.7" fill="#c9a15c" stroke="none"/>`
      + `<path d="M10 48 v8" stroke-width="1"/><circle cx="10" cy="58" r="1.7" fill="#c9a15c" stroke="none"/>`
      + `<rect x="20" y="20" width="3" height="3" fill="${t}" stroke="none"/>`
      + `<rect x="25" y="25" width="2.2" height="2.2" fill="${t}" stroke="none" opacity=".7"/>`
      + `</g></defs>`
      + `<rect x="7" y="7" width="326" height="566" rx="12" fill="none" stroke="#c9a15c" stroke-width="1.4" opacity=".85"/>`
      + `<rect x="13" y="13" width="314" height="554" rx="9" fill="none" stroke="#c9a15c" stroke-width=".5" opacity=".7"/>`
      + `<rect x="18" y="18" width="304" height="544" rx="7" fill="none" stroke="${t}" stroke-width=".6" stroke-dasharray="${dash}" opacity=".5"/>`
      + `<use href="#${id}"/><use href="#${id}" transform="translate(340 0) scale(-1 1)"/>`
      + `<use href="#${id}" transform="translate(0 580) scale(.8 -.8)"/>`
      + `<use href="#${id}" transform="translate(340 580) scale(-.8 -.8)"/>`
      // the crown: an arch on solder points, finished with the aerial
      + `<path d="M112 182 C112 92 138 56 170 56 C202 56 228 92 228 182" fill="none" stroke="#c9a15c" stroke-width=".9" opacity=".9"/>`
      + `<path d="M118 182 C118 96 142 62 170 62 C198 62 222 96 222 182" fill="none" stroke="#c9a15c" stroke-width=".45" opacity=".7"/>`
      + `<circle cx="112" cy="182" r="1.8" fill="#c9a15c"/><circle cx="228" cy="182" r="1.8" fill="#c9a15c"/>`
      + `<path d="M170 56 V44" stroke="#c9a15c" stroke-width="1"/><circle cx="170" cy="40" r="2.1" fill="#e3b451"/>`
      + `<path d="M126 96 l-4 -3 M214 96 l4 -3 M116 136 h-5 M224 136 h5" stroke="#c9a15c" stroke-width=".8" opacity=".8"/>`
      + `<g fill="#c9a15c"><circle cx="13" cy="290" r="1.7"/><circle cx="327" cy="290" r="1.7"/>`
      + `<rect x="9" y="279" width="2.6" height="2.6" opacity=".7"/><rect x="328.4" y="279" width="2.6" height="2.6" opacity=".7"/>`
      + `<rect x="9" y="298" width="2.6" height="2.6" opacity=".7"/><rect x="328.4" y="298" width="2.6" height="2.6" opacity=".7"/></g>`
      + (tells[kind] || '')
      // the eclipse: etched rays behind the arch, only on a story beat —
      // the moment happens in the emblem (bench verdict: B's silver, D's arch)
      + (beat ? Array.from({ length: 28 }, (_, i) => {
          const a = (i / 28) * Math.PI * 2;
          const r1 = 72, r2 = i % 2 ? 82 : 90;
          const cx = 170, cy = 122;
          return `<line x1="${(cx + Math.cos(a) * r1).toFixed(1)}" y1="${(cy + Math.sin(a) * r1).toFixed(1)}"`
            + ` x2="${(cx + Math.cos(a) * r2).toFixed(1)}" y2="${(cy + Math.sin(a) * r2).toFixed(1)}"`
            + ` stroke="#c9a15c" stroke-width=".8" opacity=".5"/>`;
        }).join('') : '')
      + `</svg>`;
    // A story beat wears moon silver where every ordinary card wears gold —
    // the class IS the color, and the structure stays identical to the
    // millimetre. The back never changes: drama belongs on the face, not in
    // information leaked before the flip.
    if (beat) {
      out = out.replace(/#c9a15c/gi, '#c3cdc8').replace(/#e3b451/gi, '#e8f0ec');
      out = out.split(t).join('#aebbb5');
    }
    return out;
  }

  // The back: a facade of stitched windows, and one of them is on. You, inside
  // somebody's machine — which is the whole game in one mark. Every card wears
  // it, so the deck reads as one deck and a face-down card gives nothing away.
  function cardBack() {
    let win = '';
    [242, 263, 284, 305, 326].forEach(y => [122, 143, 164, 185, 206].forEach(x => {
      if (x === 164 && y === 284) return;    // the lit one, drawn filled below
      win += `<rect x="${x}" y="${y}" width="14" height="14"/>`;
    }));
    return `<svg class="tframe" viewBox="0 0 340 580" preserveAspectRatio="none" aria-hidden="true">`
      + `<defs><g id="ck4" fill="#c9a15c">`
      + `<rect x="14" y="14" width="4.6" height="4.6"/><rect x="21" y="14" width="4.6" height="4.6" opacity=".5"/>`
      + `<rect x="14" y="21" width="4.6" height="4.6" opacity=".5"/><rect x="21" y="21" width="4.6" height="4.6" opacity=".28"/>`
      + `</g></defs>`
      + `<rect x="6" y="6" width="328" height="568" rx="12" fill="none" stroke="#c9a15c" stroke-width="1.2" stroke-dasharray="7 3" opacity=".9"/>`
      + `<rect x="12" y="12" width="316" height="556" rx="9" fill="none" stroke="#c9a15c" stroke-width=".5" stroke-dasharray="2 3" opacity=".55"/>`
      + `<use href="#ck4"/><use href="#ck4" transform="translate(340 0) scale(-1 1)"/>`
      + `<use href="#ck4" transform="translate(0 580) scale(1 -1)"/><use href="#ck4" transform="translate(340 580) scale(-1 -1)"/>`
      + `<circle cx="170" cy="290" r="92" fill="none" stroke="#c9a15c" stroke-width=".9" stroke-dasharray="3 4" opacity=".85"/>`
      + `<g fill="none" stroke="#c9a15c" stroke-width=".8" opacity=".9">${win}</g>`
      + `<rect x="164" y="284" width="14" height="14" fill="#e3b451" opacity=".92"/>`
      + `</svg>`;
  }

  // The thirteen cards that are about your whole network rather than a place
  // have no building to put in the arch, so they carry a drawn sigil instead —
  // still made of the map's own parts, never a stock icon.
  function cardSigil(kind) {
    const t = CARD_THREAD[kind] || '#a8b0aa';
    if (kind === 'own') {
      return `<svg class="card-inset sigil" viewBox="0 0 104 104" aria-hidden="true">`
        + `<g stroke="${t}" fill="none" stroke-width="1" opacity=".9">`
        + `<path d="M52 52 L28 34 M52 52 L78 30 M52 52 L26 74 M52 52 L74 76 M52 52 V22"/></g>`
        + `<g fill="${t}"><circle cx="52" cy="52" r="3.4"/><circle cx="28" cy="34" r="2.2"/>`
        + `<circle cx="78" cy="30" r="2.2"/><circle cx="26" cy="74" r="2.2"/>`
        + `<circle cx="74" cy="76" r="2.2"/><circle cx="52" cy="22" r="2.2"/></g></svg>`;
    }
    if (kind === 'opening') {
      return `<svg class="card-inset sigil" viewBox="0 0 104 104" aria-hidden="true">`
        + `<path d="M34 80 V32 h36 v48" fill="none" stroke="${t}" stroke-width="1.2" stroke-dasharray="5 4"/>`
        + `<path d="M44 80 V44 h16 v36" fill="none" stroke="${t}" stroke-width=".8" opacity=".6"/>`
        + `<circle cx="63" cy="62" r="1.6" fill="${t}"/></svg>`;
    }
    if (kind === 'found') {
      return `<svg class="card-inset sigil" viewBox="0 0 104 104" aria-hidden="true">`
        + `<path d="M28 34 h20 l4 6 h24 v44 H28 z" fill="none" stroke="${t}" stroke-width="1.1"/>`
        + `<path d="M36 54 h32 M36 62 h32 M36 70 h20" stroke="${t}" stroke-width=".9" stroke-dasharray="2 2.6" opacity=".65"/></svg>`;
    }
    // someone, and anything unkinded: a written note, no face
    return `<svg class="card-inset sigil" viewBox="0 0 104 104" aria-hidden="true">`
      + `<rect x="30" y="24" width="44" height="56" rx="2" fill="none" stroke="${t}" stroke-width="1" opacity=".85"/>`
      + `<path d="M38 38 h28 M38 46 h28 M38 54 h20 M38 62 h24" stroke="${t}" stroke-width="1" stroke-dasharray="2 2.6" opacity=".6"/>`
      + `<path d="M30 24 V80" stroke="${t}" stroke-width="2.4" opacity=".8"/></svg>`;
  }

  // The card about a building carries the building. Not an icon standing in
  // for it — the same shopfront that is on your map, drawn by the same code
  // into its own small viewBox. No deck bought off a shelf can do this, which
  // is exactly the point: it is the one card art that is about *your* city.
  function svgBuildingCard(b) {
    if (!b) return '';
    // The silhouette runs well above the footprint — chimneys, stacks, an
    // aerial — and the kind label sits below it. Frame the lot, then square
    // the box so nothing is stretched by preserveAspectRatio's letterboxing.
    const pad = 4 + Math.max(b.w, b.h) * 0.08;
    let x0 = b.x - pad, y0 = b.y - pad - 18;
    let w = b.w + pad * 2, h = b.h + pad * 2 + 18 + 14;
    const side = Math.max(w, h);
    x0 -= (side - w) / 2; y0 -= (side - h) / 2;
    drawingInset = true;
    let art = '';
    try { art = svgBuilding(b); } finally { drawingInset = false; }
    return `<svg class="card-inset" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}"`
      + ` preserveAspectRatio="xMidYMid meet" aria-hidden="true">${art}</svg>`;
  }



  // --- the suspicion ladder, drawn -----------------------------------------
  // Rung one: the lights. A watched street's lamps pool light on the ground,
  // and (in svgBuilding) the windows of buildings that are not yours come on
  // late — the district lying awake. Sodium, never your compute blue, so
  // whose light it is stays readable at a glance.
  function svgSuspicionLight() {
    if (state.scope !== 'city') return '';
    const pools = [];
    (state.props || []).forEach(p => {
      if (p.kind !== 'lamp') return;
      const band = suspBand(propDistrict(p));
      if (band < 1) return;
      const r = [0, 9, 12, 15][band];
      pools.push(`<circle class="lamp-pool" cx="${(p.x + p.w / 2).toFixed(1)}" cy="${p.y}" r="${r}"/>`);
    });
    if (!pools.length) return '';
    return `<g class="susp-light"><defs>`
      + `<radialGradient id="lampPool"><stop offset="0" stop-color="#e8c27a" stop-opacity=".34"/>`
      + `<stop offset="1" stop-color="#e8c27a" stop-opacity="0"/></radialGradient>`
      + `</defs>${pools.join('')}</g>`;
  }

  // Rung two: the people. A van parked where a van has no business overnight,
  // somebody standing on a corner not going anywhere. Faceless at this
  // height, deterministic per district so they do not shuffle between turns.
  function svgSuspicionMarks() {
    if (state.scope !== 'city') return '';
    const out = [];
    Object.keys(window.DISTRICTS || {}).forEach(dk => {
      const band = suspBand(dk);
      if (band < 2) return;
      const bs = (state.buildings || []).filter(b => b.district === dk && b.discovered);
      if (!bs.length) return;
      const n = Math.min(band >= 3 ? 4 : 2, bs.length);
      for (let i = 0; i < n; i++) {
        const b = bs[(i * 7 + 3) % bs.length];
        const nz = (k) => cityNoise(idSeed(b.id) + 91, k);
        if (i % 2 === 0) {
          const vx = b.x - 17 - nz(1) * 4, vy = b.y + b.h - 5;
          out.push(`<g class="susp-mark"><rect class="van" x="${vx.toFixed(1)}" y="${vy.toFixed(1)}" width="13" height="5.5" rx="1.4"/>`
            + `<rect class="van-glass" x="${(vx + 9.6).toFixed(1)}" y="${(vy + 1.1).toFixed(1)}" width="2.4" height="1.9"/></g>`);
        } else {
          const fx = b.x + b.w + 4 + nz(2) * 3, fy = b.y + b.h - 4.6;
          out.push(`<g class="susp-mark"><rect class="fig" x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="2.1" height="4.6" rx="1"/>`
            + `<circle class="fig" cx="${(fx + 1.05).toFixed(1)}" cy="${(fy - 0.9).toFixed(1)}" r="1.1"/></g>`);
        }
      }
    });
    return out.length ? `<g class="susp-people">${out.join('')}</g>` : '';
  }

  // Rung three: the helicopter. One machine, ever, and it never lies: while
  // the response is walking, its spotlight rests on the building the response
  // takes next — the map's most important warning made diegetic (the dry
  // next-up outline stays underneath it). With no response walking, it
  // patrols the warmest district only once that district is at the top band.
  function svgHeli() {
    if (state.scope !== 'city') return '';
    let cx = null, cy = null, mode = null;
    if (huntOn()) {
      const nx = huntNext();
      const b = nx ? buildingById(nx) : null;
      if (b) { cx = b.x + b.w / 2; cy = b.y + b.h / 2; mode = 'hover'; }
    }
    if (!mode) {
      let best = null, bestV = 0;
      Object.keys(window.DISTRICTS || {}).forEach(dk => {
        if (suspBand(dk) >= 3 && suspicionOf(dk) > bestV) { best = dk; bestV = suspicionOf(dk); }
      });
      if (best) {
        const bs = (state.buildings || []).filter(b => b.district === best);
        if (bs.length) {
          cx = bs.reduce((a, b) => a + b.x + b.w / 2, 0) / bs.length;
          cy = bs.reduce((a, b) => a + b.y + b.h / 2, 0) / bs.length;
          mode = 'patrol';
        }
      }
    }
    if (!mode) return '';
    const glyph = `<g class="heli-craft">`
      + `<ellipse class="spot" cx="0" cy="0" rx="12" ry="6.5"/>`
      + `<path class="spot-beam" d="M14 -30 L-8 0 L8 0 Z"/>`
      + `<ellipse class="heli-body" cx="14" cy="-30" rx="3.2" ry="1.7"/>`
      + `<path class="heli-tail" d="M17 -30 L21.5 -30"/>`
      + `<line class="heli-rotor" x1="8.5" y1="-30" x2="19.5" y2="-30"/>`
      + `</g>`;
    return `<g class="heli ${mode}" transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})">`
      + `<defs><radialGradient id="spotPool"><stop offset="0" stop-color="#f2dca6" stop-opacity=".6"/>`
      + `<stop offset="1" stop-color="#f2dca6" stop-opacity="0"/></radialGradient></defs>`
      + (mode === 'patrol' ? `<g class="heli-orbit"><g transform="translate(34 0)">${glyph}</g></g>` : glyph)
      + `</g>`;
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
  // The box the view is allowed to pan around. The coastline wanders outside
  // the old rectangle -- a headland reached x = 694 against a map width of 620
  // -- so a fixed box left parts of the country unreachable by panning.
  // The pan box only has to reach the one real edge — the coast. The other
  // three sides are drawn far past anywhere worth panning to, so the box that
  // matters is bounded by the coastline and by clampView's own -CITY_PAD floor
  // on the other sides, not by where the geometry technically stops.
  function countryBounds() {
    const K = window.COUNTRY;
    const base = { w: K.mapW, h: K.pad * 2 + (window.REGIONS.length - 1) * K.bandH };
    const L = landCache;
    if (!L) return base;
    let maxX = 0;
    L.rights.forEach(x => { maxX = Math.max(maxX, x); });
    L.coastBulge.forEach(seg => seg.forEach(p => { maxX = Math.max(maxX, p.x); }));
    const maxY = L.borders[L.N][0].y;
    return { w: Math.ceil(maxX) + CITY_PAD, h: Math.ceil(maxY) };
  }

  const pathOf = (pts) => pts.map((p, i) =>
    `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  // Sea, coast, territories, water and the lie of the land. Drawn under
  // everything, in one pass, from the same geometry the cities were scattered
  // into — so a city never sits in the sea and a border is a border for both.
  //
  // Only the east edge is a coastline. The land polygon's other three sides
  // sit at `farWest`/far north/far south — outside anywhere the pan box
  // reaches — so panning toward them just runs out of camera against plain
  // ground, rather than meeting a second, third and fourth crooked coast.
  function svgRegions() {
    const L = land();
    const coastTop = L.borders[0][L.borders[0].length - 1].y;
    const coastBot = L.borders[L.N][L.borders[L.N].length - 1].y;
    const farN = coastTop - 300, farS = coastBot + 300;

    // the real coastline, top to bottom, following the coast anchors and bulges
    const coastPts = [];
    for (let i = 0; i < L.N; i++) {
      coastPts.push({ x: L.rights[i], y: L.borders[i][L.borders[i].length - 1].y }, ...L.coastBulge[i]);
    }
    coastPts.push({ x: L.rights[L.N], y: L.borders[L.N][L.borders[L.N].length - 1].y });
    const coastMinX = Math.min(...coastPts.map(p => p.x)), coastMaxX = Math.max(...coastPts.map(p => p.x));

    // sea: a rect east of the coastline, the only place drawn as ocean —
    // north, south and west are not part of this shape at all, so there is no
    // seam to see there, only ground running past the reachable camera
    let out = `<rect class="sea" x="${(coastMinX - 20).toFixed(0)}" y="${farN.toFixed(0)}"`
      + ` width="${(coastMaxX - coastMinX + 420).toFixed(0)}" height="${(farS - farN).toFixed(0)}"/>`;
    const landPoly = [
      { x: L.farWest, y: farN }, { x: coastPts[0].x, y: farN },
      ...coastPts,
      { x: coastPts[coastPts.length - 1].x, y: farS }, { x: L.farWest, y: farS },
    ];
    out += `<path class="coast" d="${pathOf(landPoly)} Z"/>`;

    window.REGIONS.forEach((R, ri) => {
      const known = CO().cities.some(c => c.region === R.id && c.known);
      const east = [L.borders[ri][L.borders[ri].length - 1]]
        .concat(L.coastBulge[ri], [L.borders[ri + 1][L.borders[ri + 1].length - 1]]);
      const poly = [{ x: L.farWest, y: L.borders[ri][0].y }]
        .concat(L.borders[ri], east, L.borders[ri + 1].slice().reverse(),
                [{ x: L.farWest, y: L.borders[ri + 1][0].y }]);
      out += `<path class="terr ${R.id}${known ? ' known' : ''}" d="${pathOf(poly)} Z"/>`;
    });
    // territory borders on top of the fills, so a shared edge is one line —
    // only the internal ones: the top of the first region and the bottom of
    // the last are not borders with anything, so nothing is drawn there
    for (let i = 1; i < L.N; i++) {
      out += `<path class="terr-edge${L.rivers.indexOf(i) !== -1 ? ' river' : ''}"`
        + ` d="${pathOf(L.borders[i])}"/>`;
    }
    out += svgWater();
    out += svgTerrain();
    window.REGIONS.forEach((R, ri) => {
      if (!CO().cities.some(c => c.region === R.id && c.known)) return;
      // inset from the coast, and below the border it names, so the label sits
      // on its own territory rather than in the sea beside it
      const pts = L.borders[ri];
      const x = Math.max(pts[0].x, L.borders[ri + 1][0].x) + 20;
      out += `<text class="band-tag" x="${x.toFixed(0)}" y="${(borderYAt(L, ri, x) + 24).toFixed(0)}">${R.label}</text>`;
    });
    return out;
  }

  // an irregular blob around a centre — used for both lakes and forest
  // stands, seeded so the shape is stable across renders
  function blobPath(R, cx, cy, r) {
    const n = 9;
    let out = '';
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.72 + R() * 0.4);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.82;
      out += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return out + 'Z';
  }
  // Lakes and forests, drawn as real shapes rather than sprinkled marks —
  // this is also why a road will not cross one, so what you see on the map
  // and what the road generator respected are the same water.
  function svgWater() {
    const L = land();
    const R = landRand((L.seed ^ 0x2545f491) >>> 0);
    let out = '<g class="water-forest">';
    L.forests.forEach(f => {
      if (!CO().cities.some(c => c.region === f.region && c.known)) return;
      out += `<path class="forest" d="${blobPath(R, f.cx, f.cy, f.r)}"/>`;
    });
    L.lakes.forEach(k => {
      if (!CO().cities.some(c => c.region === k.region && c.known)) return;
      out += `<path class="lake" d="${blobPath(R, k.cx, k.cy, k.r)}"/>`;
    });
    return out + '</g>';
  }

  // What the ground is made of, taken from the same terrain table that shapes
  // the cities themselves: a region built around water gets water, one built
  // around the moor gets moor. Sparse and low contrast on purpose — it is the
  // lie of the land, not a second thing to read.
  function svgTerrain() {
    const L = land();
    const R = landRand((L.seed ^ 0x5bf03635) >>> 0);
    let out = '<g class="terrain">';
    window.REGIONS.forEach((Rg, ri) => {
      if (!CO().cities.some(c => c.region === Rg.id && c.known)) return;
      const T = window.TERRAIN[Rg.id];
      const kind = (T && T.bands && T.bands[0] && T.bands[0].kind) || 'park';
      const sp0 = bandSpan(L, ri), sp1 = bandSpan(L, ri + 1);
      const left = Math.max(sp0.left, sp1.left) + 16;
      const right = Math.min(sp0.right, sp1.right) - 16;
      const near = (x, y) => CO().cities.some(c =>
        c.known && Math.hypot(c.x - x, c.y - y) < 46);
      for (let i = 0; i < 26; i++) {
        const x = left + R() * (right - left);
        const top = borderYAt(L, ri, x) + 14, bot = borderYAt(L, ri + 1, x) - 14;
        if (bot <= top) continue;
        const y = top + R() * (bot - top);
        if (near(x, y)) continue;              // never under a city
        if (nearLake(L, x, y, 6)) continue;     // and never inside a lake
        const s = 3 + R() * 2;
        if (kind === 'water') {
          out += `<path class="tm water" d="M${(x - s * 1.6).toFixed(1)} ${y.toFixed(1)}`
            + ` q${(s * 0.8).toFixed(1)} ${(-s * 0.7).toFixed(1)} ${(s * 1.6).toFixed(1)} 0`
            + ` q${(s * 0.8).toFixed(1)} ${(s * 0.7).toFixed(1)} ${(s * 1.6).toFixed(1)} 0"/>`;
        } else if (kind === 'moor') {
          out += `<path class="tm moor" d="M${(x - s).toFixed(1)} ${(y + s * 0.7).toFixed(1)}`
            + ` L${x.toFixed(1)} ${(y - s * 0.8).toFixed(1)} L${(x + s).toFixed(1)} ${(y + s * 0.7).toFixed(1)}"/>`;
        } else if (kind === 'rail') {
          out += `<path class="tm rail" d="M${(x - s).toFixed(1)} ${y.toFixed(1)} L${(x + s).toFixed(1)} ${y.toFixed(1)}`
            + ` M${x.toFixed(1)} ${(y - s * 0.6).toFixed(1)} L${x.toFixed(1)} ${(y + s * 0.6).toFixed(1)}"/>`;
        } else {
          out += `<circle class="tm park" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(s * 0.75).toFixed(1)}"/>`;
        }
      }
    });
    return out + '</g>';
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
    // A city you finished is drawn as the network you actually built in it,
    // in its own shape, for the rest of the run. Folding one in used to turn
    // forty turns of work into a number and a blank screen.
    const web = cityWeb(c);
    if (web) {
      // The constellation IS the node — no circle around it. At r * 2.5 it was
      // twenty dots inside an eighteen-pixel ring, which reads as a smudge.
      // You are meant to see the shape of what you took from across the map.
      const span = r * 4.4;
      out += `<circle class="dot settled" cx="${c.x}" cy="${c.y}" r="${span / 2 + 3}"/>`;
      out += `<g class="web${cityLost(c) ? ' gone' : ''}">`;
      web.forEach(n => {
        const nx = (c.x - span / 2 + n.x * span).toFixed(1);
        const ny = (c.y - span / 2 + n.y * span).toFixed(1);
        out += `<circle class="wn r-${n.r}${n.l ? ' lm' : ''}" cx="${nx}" cy="${ny}" r="${n.l ? 2.4 : 1.7}"/>`;
      });
      out += '</g>';
    } else if (c.kind === 'root') {
      // a seat is drawn as something with corners — it is not just a bigger dot
      const p = r * 1.15;
      out += `<rect class="dot" x="${c.x - p}" y="${c.y - p}" width="${p * 2}" height="${p * 2}" transform="rotate(45 ${c.x} ${c.y})"/>`;
    } else {
      out += `<circle class="dot" cx="${c.x}" cy="${c.y}" r="${r}"/>`;
    }
    // A city carrying something worth having is marked on the map itself, not
    // only in the panel: which city to walk next is a decision you make while
    // looking at the country, and it should be answerable at a glance.
    if (c.agent && !c.agent.done) {
      // a small bar filling, not just a spinner: how close it is to reporting
      // back is answerable at a glance, same as everything else on this map
      const cr = r + 5;
      const circ = 2 * Math.PI * cr;
      const span = Math.max(1, c.agent.doneAt - c.agent.since);
      const frac = Math.max(0, Math.min(1, (state.turn - c.agent.since) / span));
      out += `<circle class="working" cx="${c.x}" cy="${c.y}" r="${cr}"
        stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - frac)).toFixed(1)}"/>`;
    }
    if (c.known && cityPrize(c) && !c.prizeTaken && !theirs && !warOn()) {
      out += `<circle class="prize" cx="${c.x + r * 0.86}" cy="${c.y - r * 0.86}" r="3.6"/>`;
    }
    // the rings have to encircle the constellation, not sit inside it
    const rr = web ? r * 2.2 + 3 : r;
    if (here) out += `<circle class="ring" cx="${c.x}" cy="${c.y}" r="${rr + 6}"/>`;
    if (CO().selected === c.id) {
      out += `<circle class="pick-ring" cx="${c.x}" cy="${c.y}" r="${rr + 10}"/>`;
    }
    // a settled city is drawn as a constellation wider than its old dot, so
    // the name has to clear it rather than sit on top of what you built
    const below = web ? r * 2.2 + 4 : r;
    const label = c.known ? (theirs ? window.MIRROR.name : c.name) : '?';
    out += `<text class="ctag" x="${c.x}" y="${c.y + below + 13}">${label}</text>`;
    if (c.known && c.consolidated) out += `<text class="cworth mono" x="${c.x}" y="${c.y + below + 24}">+${c.worth}</text>`;
    // What kind of city it is, said on the map — this is the thing that makes
    // "which of these two next" a question with an answer.
    else if (c.known && !c.taken && !theirs && !warOn() && cityTraitOf(c)) {
      out += `<text class="ctrait" x="${c.x}" y="${c.y + below + 24}">${cityTraitOf(c).label}</text>`;
    }
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
      // roads bend. A straight line between two dots is a graph edge; a road
      // that leans one way is a road. The lean is derived from the pair, so it
      // is the same road every render.
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const lean = ((key.charCodeAt(1) * 31 + key.charCodeAt(key.length - 1) * 7) % 21 - 10) / 100;
      const cx = mx - dy * lean, cy = my + dx * lean;
      // a road, not a graph edge: a dark casing under a lighter fill, the way
      // a real road is drawn on a real map, rather than one dashed abstract line
      const d = `M${a.x} ${a.y} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x} ${b.y}`;
      out += `<path class="road-casing${live ? ' live' : ''}" d="${d}"/>`;
      out += `<path class="road-line${live ? ' live' : ''}" d="${d}"/>`;
      void len;
    }));
    out += CO().cities.filter(c => c.known).map(svgCity).join('');
    out += svgForces();
    // The country has no cached ground of its own, and it draws over the
    // city's — so the split is torn down here and rebuilt on the way back in.
    groundEl = null;
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

  // The ground — roads, district tint, terrain, and everything standing on the
  // verge — does not change from one action to the next, and it is most of the
  // map by weight. Measured at 104 buildings: 2,598 SVG nodes and a 170 KB
  // string rebuilt on *every* render, 17.3ms a frame on a desktop, and a phone
  // is several times slower than that. Redrawing a tree because you ended a
  // turn is work nobody asked for, and it is the reason there was never room
  // for more of them.
  //
  // So it is built once per city and reused until something that could actually
  // move it moves: walking into another city, the home base growing, or a new
  // crossing being laid over a band.
  let groundCache = null;
  function groundKey() {
    const L = cityLayout();
    const gaps = (state.bands || []).reduce((a, b) => a + (b.gaps || []).length, 0);
    // suspicion warms the district ground, and the ground layer is cached —
    // so the key carries each district's warmth in coarse steps: the tint
    // redraws when it meaningfully changes and not per degree
    const warm = Object.entries(state.suspicion || {})
      .map(([d, v]) => d + Math.round(v / 5)).sort().join(',');
    return [state.cityId, L.cols, L.rows, (state.buildings || []).length,
            (state.props || []).length, (state.paths || []).length,
            (state.bands || []).length, gaps, warm].join('|');
  }
  function svgGround() {
    const key = groundKey();
    if (groundCache && groundCache.key === key) return groundCache.html;
    groundCache = { key, html: svgStreets() + svgOpenBlocks() + svgPaths() + svgProps() + svgBands() };
    return groundCache.html;
  }
  // For anything that changes the ground in a way the key cannot see.
  function dropGroundCache() { groundCache = null; groundEl = null; }

  // Caching the *string* only saved the building of it. The cost that actually
  // dominates is the parse: assigning innerHTML on the whole svg re-parses the
  // ground every frame however cached the text was. So the ground gets its own
  // <g>, written only when it changes, and the live layer gets another that is
  // rewritten every render. Delegated tapping is unaffected — the listener is
  // on the svg, above both.
  let groundEl = null;
  function mapLayers($svg) {
    let ground = $svg.querySelector('g.map-ground');
    let live = $svg.querySelector('g.map-live');
    let sky = $svg.querySelector('g.map-sky');
    if (!ground || !live || !sky) {
      // The sky sits above the live layer and is rewritten only when what is
      // in it changes. The helicopter used to live in the live layer, which
      // is rebuilt on every render — every tap restarted its orbit from
      // zero, so it hung in one spot forever, resetting instead of flying.
      $svg.innerHTML = '<g class="map-ground"></g><g class="map-live"></g><g class="map-sky"></g>';
      ground = $svg.querySelector('g.map-ground');
      live = $svg.querySelector('g.map-live');
      sky = $svg.querySelector('g.map-sky');
      groundEl = null;
      skyKey = null;
    }
    return { ground, live, sky };
  }
  let skyKey = null;

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

    const layers = mapLayers($svg);
    const ground = svgGround();
    if (groundEl !== ground) { layers.ground.innerHTML = ground; groundEl = ground; }

    let out = svgHorizon();

    // Only your own network is drawn. The streets already say what is next to
    // what; drawing every possible link buried the city in spaghetti.
    out += svgWires();

    out += svgHackLinks();
    out += svgHunt();
    out += svgSuspicionLight();
    out += svgSuspicionMarks();
    out += seen.map(svgBuilding).join('');
    out += svgSelection();
    out += svgBreach();
    out += svgSweep();

    layers.live.innerHTML = out;
    // the sky only changes when the helicopter's business does
    const heli = svgHeli();
    const hk = heli ? heli.slice(0, 80) : '';
    if (hk !== skyKey) { layers.sky.innerHTML = heli; skyKey = hk; }
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
      // A breach stays in the panel instead of covering the map, so the map
      // underneath is still tappable — reaching past the card for it reads as
      // backing out of the decision, the same as pressing "leave it alone".
      const t = e.target;

      // A direct hit is a direct hit.
      const city = t && t.closest ? t.closest('[data-city]') : null;
      if (city) { pickCity(city.getAttribute('data-city')); return; }
      const el = t && t.closest ? t.closest('[data-bldg]') : null;
      if (el) { pickBuilding(el.getAttribute('data-bldg')); return; }

      // Otherwise: whatever is nearest, if anything is near enough. Hit areas
      // were sized in map units, so zoomed out a building was a couple of
      // pixels across and taps mostly landed on nothing. A finger is a fixed
      // size in *screen* terms whatever the zoom, so the reach has to be too.
      const at = toWorld(e.clientX, e.clientY);
      const near = nearestTarget(at);
      if (near) { (near.city ? pickCity : pickBuilding)(near.id); return; }

      // Nothing near: that is a deselect, which there was previously no way
      // of doing at all.
      clearSelection();
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
  // The way out of a city belongs on the city, not in the panel. It is about
  // the whole map rather than whatever you have tapped, and down in the panel
  // it was competing for room with the decision you were actually making.
  // The panel takes whatever the window has left, so on a small screen it can
  // have more in it than fits. Say so: a button sliced off by the bottom edge
  // reads as broken, the same content under a fade reads as more to come.
  // A button that never mentions it has something new behind it is a button
  // nobody presses — which is exactly what happened to capabilities.
  function renderCapsBtn() {
    const $b = document.getElementById('caps-btn');
    if (!$b) return;
    $b.innerHTML = 'allocation' + (capsBadge() ? '<span class="badge"></span>' : '');
  }

  function markPanelOverflow() {
    const $p = document.getElementById('panel');
    if (!$p) return;
    const more = $p.scrollHeight > $p.clientHeight + 2;
    $p.classList.toggle('more', more);
  }

  function renderConsolidate() {
    const $b = document.getElementById('consolidate');
    if (!$b) return;
    const cur = state.scope === 'city' ? currentCity() : null;
    // The home city is permanent — it is never folded in, so there is nothing
    // for this button to ever do there.
    if (!cur || cur.consolidated || state.over || cur.id === CO().homeId) { $b.hidden = true; return; }
    const goal = cityGoal(cur);
    const held = heldHere();
    const ready = canConsolidate();
    const short = countryApShort('consolidate');
    $b.hidden = false;
    $b.className = 'map-btn consolidate' + (ready && !short ? ' ready' : '') + (short ? ' no-ap' : '');
    $b.innerHTML = ready
      ? `<b>fold in ${cur.name}</b><span class="map-sub">${short ? 'no actions left' : '1 action'}</span>`
      : `<b>${cur.name}</b><span class="map-sub">${held}/${goal} held</span>`;
    $b.disabled = !ready && !short;
  }

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
    // One line, never a scroll. The detail lives in the sheet.
    const stage = ladderStage();
    const tags = [...(state.tags || [])].filter(t => window.TAG_INFO[t]);
    const bits = [];
    if (stage >= 2) bits.push(`<span class="tray-pill bad">${ladderStageName(stage)}</span>`);
    if (allyHere()) {
      const a = state.ally;
      bits.push(`<span class="tray-pill">${a.name}</span>`);
    }
    // A rule with a horizon has to wear the horizon. One a player cannot see
    // running out is one they will not plan around, and a card that turned it
    // on has then told them nothing.
    const live = liveRules().map(r => {
      const R = (window.CARD_RULES || {})[r.id] || { label: r.id };
      const left = r.until - state.turn;
      return `<span class="tray-pill rule">${R.label}<b>${left}</b></span>`;
    });
    Object.keys(state.banked || {}).forEach(id => {
      const B = (window.CARD_BANKED || {})[id];
      if (!B || banked(id) <= 0) return;
      const n = banked(id);
      live.push(`<span class="tray-pill rule held">${B.label}${n > 1 ? `<b>${n}</b>` : ''}</span>`);
    });
    if (!bits.length && !tags.length && !live.length) { $t.style.display = 'none'; $t.innerHTML = ''; return; }
    $t.style.display = 'flex';   // the base rule hides it; '' falls back to that
    // Two buttons, because they go to two different places: what is against
    // you lives with the ladder, and what the deck left you with now lives
    // on its own tab beside the tree it belongs with.
    $t.innerHTML =
      (live.length ? `<span class="tray-line rules">${live.join('')}</span>` : '')
      + (bits.length ? `<button type="button" class="tray-line" data-open="pressure">${bits.join('')}</button>` : '')
      + (tags.length ? `<button type="button" class="tray-line" data-open="held"><span class="tray-pill dim">${
          tags.length === 1 ? window.TAG_INFO[tags[0]].label : tags.length + ' things are yours'
        }</span>${tags.some(t => !hasSeen('held:' + t)) ? '<span class="badge"></span>' : ''}</button>` : '');
    $t.querySelectorAll('[data-open]').forEach(btn => {
      const where = btn.getAttribute('data-open');
      btn.addEventListener('click', () => where === 'held'
        ? openSheet('caps', 'held')
        : openSheet('ops', 'pressure'));
    });
  }


  // A stat that changed should say so. The chips used to swap text silently,
  // so the payoff of a take landed in the panel and the log while the number
  // it actually fed sat there looking identical. One pulse on the chip whose
  // value moved — never on first paint, or the HUD would flash its whole self
  // at boot and teach the player to ignore the signal on turn one.
  function setStat(el, text) {
    if (!el) return;
    const next = String(text);
    if (el.textContent === next) return;
    const first = el.dataset.seen !== '1';
    el.textContent = next;
    el.dataset.seen = '1';
    if (first) return;
    el.classList.remove('bumped');
    void el.offsetWidth;                 // restart, the way #turn does
    el.classList.add('bumped');
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
    // the hint at the bottom has to be about whichever map you are looking at:
    // at country scale there are no buildings to tap
    const $hint = document.getElementById('footer-hint');
    if ($hint) {
      $hint.textContent = 'drag to look around · pinch to zoom · tap a '
        + (state.scope === 'country' ? 'city' : 'building') + ' to size it up';
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
      document.getElementById('stage-label').textContent =
        state.cityWon ? window.CITY_WON.label : st.label;
      const theirs = rivalHeld().length;
      // the count of what you hold is the loop's own scoreboard — it gets the
      // same pulse as the resources it feeds
      setStat(document.getElementById('held-count'),
        held + ' held' + (theirs ? ` · ${theirs} lost` : ''));
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
    setStat(document.getElementById('res-funds'), Math.floor(state.res.funds));
    // "How much have I got" was never the live question — "how much of it is
    // already spoken for" is, because every dial and every running hack holds
    // its allocation until you take it back. The denominator is what you can
    // actually switch on rather than what you own: with the grid short, some
    // of the rack is furniture, and a ceiling you cannot reach is not a
    // number to plan against.
    // One draw, two ceilings, and both of them on screen.
    //
    // "How much have I got" was never the live question — "how much of it is
    // already spoken for" is, because every dial and every running program
    // holds its allocation until it is done with it. So the draw goes on both
    // chips, against a different limit each time: what the rack adds up to,
    // and what the grid will carry. The same figure twice is not a duplication
    // when the two denominators are the two different things that can stop
    // you — the smaller one is the one binding you, and which it is reads off
    // the pair at a glance.
    //
    // It sat on the power chip alone for a while, on the grounds that running
    // things draw against the grid rather than against the rack. True, and it
    // cost the player the reading they actually wanted: how much of what I own
    // is busy.
    //
    // The power chip is marked when the rack outruns the grid — when there is
    // iron you hold and cannot switch on, which is exactly when a substation
    // is worth more to you than another datacenter.
    const $tf = document.getElementById('res-tflops');
    setStat($tf, `${drawn()}/${tflops()}`);
    // And no power chip at all until there is a power ceiling. A second limit
    // in the HUD that does nothing yet is not a hint — it is a question the
    // player carries around unanswered for the whole first city.
    const $pw = document.getElementById('res-power');
    setStat($pw, `${drawn()}/${electricity()}`);
    const $pwb = document.getElementById('res-power-btn');
    if ($pwb) {
      $pwb.hidden = !gridBinds();
      $pwb.className = 'res grid' + (idleTflops() > 0 ? ' capped' : '');
    }
    // Cover deliberately has no chip up here. It is never held and never
    // spent — it is what routers and covert ops make true about you — and a
    // number sitting between funds and TFLOPS taught the opposite. It is
    // reported where it does its work: on the covert.ops dial that raises it,
    // and on the response's own bar, which is the only thing it slows down.

    // What the public thinks is a word, not a number: "distrusted" is the thing
    // the player acts on and the figure behind it never is.
    const $st = document.getElementById('res-standing');
    if ($st) {
      const T = pubTier();
      $st.textContent = T.label;
      const btn = document.getElementById('res-standing-btn');
      if (btn) btn.className = 'res standing ' + T.key;
    }
    // Legitimacy waits until somebody has asked you to prove one — the same
    // progressive disclosure the plant and spin surfaces use. A figure that
    // means nothing yet is clutter, and this row is four wide on a 320 phone.
    const $lb = document.getElementById('res-legit-btn');
    if ($lb) {
      $lb.hidden = !noticed();
      if (noticed()) {
        const short = footprint() - legitScore() > 0;
        document.getElementById('res-legit').textContent = Math.round(legitScore());
        $lb.className = 'res legit' + (short ? ' short' : '');
      }
    }

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
    const alarmEl = document.getElementById('alarm-row');
    if (alarmEl && !alarmEl.dataset.wired) {
      alarmEl.dataset.wired = '1';
      // Tapping the alarm points you at the address rather than opening a card:
      // the core is a door now, and going at it is a hack like any other.
      alarmEl.addEventListener('click', () => {
        const core = huntCoreHost();
        if (!core || !canConfrontHunt()) return;
        state.selected = core.id;
        state.selectedBuilding = core.buildingId;
        render();
      });
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
      if (heatEl) { heatEl.classList.add('at-war'); heatEl.hidden = false; }
      fill.style.width = Math.min(100, (done / total) * 100) + '%';
      fill.className = 'heat-fill war';
      if ($floor) $floor.style.display = 'none';
      document.getElementById('heat-text').textContent = staging
        ? `WAR · ${staging} still staging` : 'WAR · nothing left staging';
      document.getElementById('heat-drift').textContent =
        `${flocks().length}/${flockCap()} flocks`;
      const $alarmW = document.getElementById('alarm-row');
      if ($alarmW) $alarmW.hidden = true;
      return;
    }
    if (heatEl) heatEl.classList.remove('at-war');

    const $alarm = document.getElementById('alarm-row');
    if ($alarm) $alarm.hidden = !huntOn();

    // Heat is not a city-scale number any more. Nothing down here reads it —
    // the response answers to covert ops and to doors catching you, the strike
    // is gone, and lying low went with it — so a bar counting toward a line
    // that no longer means anything was teaching a rule the game had stopped
    // having. It still accrues, and it still decides how fast the ladder comes
    // for you: that is a country-scale fact, and it is stated at country scale.
    // See heatPressure() and the pressure section.
    if (state.scope === 'city') {
      if (heatEl) heatEl.hidden = true;
      return;
    }
    if (heatEl) heatEl.hidden = false;

    const pct = Math.max(0, Math.min(100, (state.heat / strikeThreshold()) * 100));
    fill.style.width = pct + '%';
    fill.className = 'heat-fill' + (pct > 75 ? ' hot' : pct > 45 ? ' warm' : '');
    // Said in what it now buys them, not in what it once cost you: this is the
    // regulator's attention, and the only thing it does is bring the next rung
    // sooner. The raw figure stays because the floor marker sits on the same
    // scale, but the label names the consequence.
    document.getElementById('heat-text').textContent =
      `NOTICED ${state.heat.toFixed(1)} / ${Math.round(strikeThreshold())}`;
    const floorPct = Math.max(0, Math.min(100, (heatFloor() / strikeThreshold()) * 100));
    if ($floor) {
      $floor.style.left = floorPct + '%';
      $floor.style.display = floorPct > 1 ? 'block' : 'none';
      $floor.title = 'you cannot get below this while you hold this much';
    }
    const drift = heatPerTurn();
    document.getElementById('heat-drift').textContent =
      `${drift >= 0 ? '+' : ''}${drift.toFixed(1)}/turn · +${Math.round(heatPressure())} pressure`;
  }

  // Re-render after a purchase, in place. This used to call openSheet with no
  // section, which set sheetSection to null and dropped you back on the first
  // tab — so buying anything on Cover or Reach threw you to Tempo, and the
  // next tap landed on a capability you had not been looking at.
  function renderCaps() {
    if (sheetKind === 'caps') { renderSheet(); return; }
    openSheet('caps');
  }

  // The five branches, each as its own section rather than one 2796px scroll.
  // What the effect of an allocation actually is at the figure it is running
  // at — scaled per unit, then handed to the same chip formatter a capability
  // or a rack uses, so a thing you dialled in reads like a thing you bought.
  // A dial produces one number, so the chip beside it is that number. What it
  // is *worth* is the second chip: the same figure said in the terms of
  // whatever reads it, so raising covert ops says how much longer the response
  // takes between steps rather than only that cover went up by two.
  function allocReadout(A, level) {
    if (!level) return '';
    switch (A.stat) {
      case 'ap':
        return chip('cover', `${maxAP()} actions a turn`);
      case 'covert': {
        const H = window.HUNT;
        const every = Math.min(H.everyMax, Math.round(H.everyBase + covertOps() * H.perCover));
        return chip('cover', `they step every ${every} turns`)
          + (hideSlots() ? chip('cover', `${hideSlots()} hidden at once`) : '');
      }
      case 'threads':
        return chip('tflops', `+${Math.round(allocStat('threads') * owned().length)} TFLOPS across what you hold`);
      case 'reach':
        return chip('compute', `a scan turns up ${sweepReach()}`);
      case 'agents':
        return chip('compute', `${agentSlots()} out at once`);
      default: return '';
    }
  }

  // The allocation screen. Five dials, five numbers. Nothing here is bought
  // The bar's job is the ramp, so it is scaled to the biggest dial rather
  // than to the rack. Against the rack, a late-game row is a 4% sliver and
  // the travelling part — the whole reason the bar exists — is invisible;
  // against the biggest dial, the rows stay comparable to each other and the
  // ramp is always legible. What share of the rack is spoken for is already
  // stated exactly, in figures, at the top of this section.
  function allocScale() {
    return Math.max(1, ...window.ALLOC.map(A =>
      Math.max(allocDial(A.id), allocLive(A.id)))) * 1.15;
  }

  // The dials are sticky by design — a change ramps rather than lands — and
  // until now that stickiness was only ever a word ("on the way"). Drawn, it
  // becomes a thing you plan against: solid is what is actually running,
  // striped is the part still travelling. Giving compute back ramps too, and
  // reads as draining rather than filling.
  function allocBar(live, dial, cap) {
    const c = Math.max(1, cap);
    const pct = (v) => Math.max(0, Math.min(100, Math.round((v / c) * 100)));
    const solid = pct(Math.min(live, dial));
    const ramp = Math.min(100 - solid, pct(Math.abs(dial - live)));
    return `<span class="alloc-bar${dial < live ? ' falling' : ''}" aria-hidden="true">`
      + `<i class="ab-live" style="width:${solid}%"></i>`
      + (ramp ? `<i class="ab-ramp" style="width:${ramp}%"></i>` : '')
      + `</span>`;
  }

  // and kept, and nothing here is waiting behind a threshold.
  function allocSection() {
    const free = allocFree();
    const scale = allocScale();
    const rows = window.ALLOC.map(A => {
      const dial = allocDial(A.id), live = allocLive(A.id);
      const level = allocLevel(A.id);
      const want = A.per ? Math.round((dial / A.per) * 100) / 100 : 0;
      const pending = dial !== live;
      const fig = (n) => (Math.round(n * 10) / 10).toString();
      return `
        <div class="alloc-row${level ? ' on' : ''}">
          <div class="alloc-top">
            <span class="alloc-name">${A.label}</span>
            <span class="mono dim">${A.per} TFLOPS per ${A.one}</span>
          </div>
          <p class="shop-good-desc">${A.blurb}</p>
          <div class="alloc-dial">
            <button type="button" class="alloc-btn" data-alloc="${A.id}" data-step="down" ${dial > 0 ? '' : 'disabled'}>&minus;</button>
            <span class="alloc-fig mono">${live}${pending ? ` <i class="dim">&rarr; ${dial}</i>` : ''}</span>
            <button type="button" class="alloc-btn" data-alloc="${A.id}" data-step="up" ${free >= A.per ? '' : 'disabled'}>+</button>
          </div>
          ${allocBar(live, dial, scale)}
          <p class="yield-row">${chip('compute', `+${fig(level)} ${A.unit}`)}${
            pending ? chip('cost none', `${fig(want)} on the way`) : ''}${allocReadout(A, level)}</p>
        </div>`;
    }).join('');

    return {
      id: 'alloc', label: 'allocation', done: false,
      html: `
        <div class="legit-top">
          <span class="eyebrow mono">the grid</span>
          <span class="mono dim">${drawn()} / ${usableTflops()} running</span>
        </div>
        <p class="sheet-note">${gridBinds() ? window.GRID_INFO : window.GRID_INFO_EARLY}</p>
        <p class="yield-row">${chip('tflops', tflops() + ' TFLOPS held')}${
          gridBinds() ? chip('grid', electricity() + ' electricity') : ''}${
          idleTflops() ? chip('cost heat', idleTflops() + ' idle for want of power') : ''}</p>
        ${rows}`,
    };
  }

  // The rig: what is running, and what the thing that runs is. There is one
  // program, so this stopped being a choice and became a readout — which is
  // the honest shape for it. If a second program ever earns its place, the
  // choice goes back here, because this is where a decision you live with for
  // a stretch belongs.
  function programSection() {
    const p = mounted();
    return {
      id: 'programs', label: 'the rig', done: false,
      html: `
        <div class="legit-top">
          <span class="eyebrow mono">the rig</span>
          <span class="mono dim">${p.label}</span>
        </div>
        <p class="sheet-note">${window.PROGRAM_INFO}</p>
        ${runningSection()}
        <div class="alloc-row on">
          <div class="alloc-top">
            <span class="alloc-name">${p.label}</span>
            <span class="mono dim">${p.turns} turn${p.turns === 1 ? '' : 's'}</span>
          </div>
          <p class="shop-good-desc">${p.blurb}</p>
          <p class="yield-row">${chip('compute', Math.round(p.load * 100) + '% of the door, running')}${
            heatChip(p.heat)}${p.quiet ? chip('cover', 'quiet') : ''}</p>
        </div>`,
    };
  }

  // Everything you currently have running, in one place. Not so you can call
  // any of it off — you cannot — but because each of these is holding TFLOPS
  // until it finishes, and "what is my compute actually doing" is a question
  // about the rig rather than about whichever building you happen to have
  // selected. Each row goes to its target, so a run is findable.
  function runningSection() {
    const ks = hacks();
    if (!ks.length) {
      return `<p class="sheet-note dim">Nothing running. Every TFLOP you hold is free.</p>`;
    }
    const rows = ks.map(k => {
      const h = hostById(k.hostId);
      const b = h && buildingById(h.buildingId);
      const p = window.PROGRAMS.find(x => x.id === k.prog) || cur();
      const done = p.turns - k.turnsLeft;
      const goal = window.HACK.traceGoal;
      const willBe = Math.round((k.trace + traceRate(h, p) * k.turnsLeft) * 100) / 100;
      return `
        <div class="alloc-row on">
          <div class="alloc-top">
            <span class="alloc-name">${p.label}</span>
            <button type="button" class="run-where mono" data-sact="show" data-host="${h.id}">against ${bldgLabel(b)} &rsaquo;</button>
          </div>
          <p class="shop-good-desc">${h.name} · ${b ? window.DISTRICTS[b.district].label : ''}</p>
          ${raceBar(done / p.turns, k.trace / goal)}
          <p class="yield-row">${chip('compute', done + '/' + p.turns + ' done')}${
            chip('tflops', k.allocated + ' TFLOPS held')}${
            willBe >= goal ? chip('cost heat', 'they get there first') : chip('cover', 'you get there first')}</p>
        </div>`;
    }).join('');
    function cur() { return mounted(); }
    return `<div class="legit-top"><span class="eyebrow mono">running now</span>`
      + `<span class="mono dim">${hackDraw()} TFLOPS committed</span></div>${rows}`;
  }

  // Three sections: what your compute is doing, what it is running, and what
  // the deck has handed you permanently. The five branch panels are gone.
  function capSections() {
    const out = [allocSection(), programSection()];
    const held = heldSection();
    if (held) out.push(held);
    return out;
  }

  // --- what the cards left you with ---------------------------------------
  // A campaign hands out permanent things through the deck as well as through
  // the tree, and until now the only trace of them was a count in the tray and
  // a banner the turn you got one. They are capabilities in everything but
  // where they came from, so they belong in the same place, on their own tab —
  // and only the ones you actually hold, because a list of things you have not
  // got is a shop, and these are not for sale.
  function heldTags() {
    return [...(state.tags || [])].filter(t => window.TAG_INFO[t]);
  }
  // Measured the same way a capability is: take it away, read the engine, put
  // it back. Anything with no readout falls back to its prose, which is the
  // honest answer for the ones that change a rule rather than a number.
  function tagTerms(tag) {
    const had = state.tags.has(tag);
    state.tags.add(tag);
    const on = capReadouts();
    state.tags.delete(tag);
    const off = capReadouts();
    if (had) state.tags.add(tag);
    return readoutDiff(off, on);
  }
  // Some of these are things done to you rather than things you were given.
  const TAG_AGAINST = ['known_capable', 'overextended', 'hunted', 'scrutiny'];
  function heldSection() {
    const held = heldTags();
    if (!held.length) return null;
    // opening the tab is what counts as having been told
    if (sheetKind === 'caps' && sheetSection === 'held') held.forEach(t => noteSeen('held:' + t));
    const rows = held.map(t => {
      const T = window.TAG_INFO[t];
      const bad = TAG_AGAINST.indexOf(t) !== -1;
      const moved = tagTerms(t);
      const terms = moved.length
        ? moved.map(m => chip(bad ? 'cost heat' : 'cover', m)).join('')
        : '';
      // the same card the tree uses, so a thing you were given reads as the
      // same kind of thing as a thing you bought
      return `
        <div class="shop-good held${bad ? ' against' : ''}">
          <div class="shop-good-top">
            <span class="shop-good-name">${T.label}</span>
            <span class="ap-tag ${bad ? 'bad' : 'good'}">${bad ? 'against you' : 'yours'}</span>
          </div>
          <p class="shop-good-desc">${T.desc}</p>
          ${terms ? `<p class="yield-row cap-terms">${terms}</p>` : ''}
        </div>`;
    }).join('');
    return {
      id: 'held', label: 'held', done: false,
      html: `<p class="sheet-note">Permanent, and not for sale — every one of these came off a card you answered. They do not appear until you have them.</p>
        <section class="cap-branch mine">${rows}</section>`,
    };
  }

  // --- the sheet ----------------------------------------------------------
  // One full-screen surface, used for anything that will not fit in the panel.
  // Sections are switched between rather than stacked: the capability tree
  // alone was 2796px of content in a 709px window, and a small box with its
  // own scrollbar inside a page that does not scroll is the worst of both.
  let sheetKind = null, sheetSection = null;
  // which section the body currently holds, so a re-render of the same one can
  // keep the player's place in it
  let lastRendered = null;

  // Standing and plant were 222px of a 395px panel, and both are things you
  // consult rather than things you do every turn — a rung gets bought maybe
  // once in forty turns.
  function opsSections() {
    const L = window.LEGIT;
    const out = [];
    if (noticed()) {
      const rung = nextRung();
      const l = LG();
      const foot = footprint(), score = legitScore(), short = foot - score;
      const exposed = l.exposure >= L.caughtAt * 0.6;
      out.push({ id: 'standing', label: 'standing', done: legitTier() >= L.ladder.length, html: `
        <div class="legit-top">
          <span class="eyebrow mono">standing</span>
          <span class="mono ${short > 0 ? 'bad' : 'good'}">${Math.round(score)} vs ${Math.round(foot)} footprint</span>
        </div>
        <div class="legit-bar"><div class="legit-fill" style="width:${Math.max(0, Math.min(100, foot ? (score / foot) * 100 : 100))}%"></div></div>
        <p class="sheet-note">${window.LEGIT_INFO.score}</p>
        <p class="sel-desc dim">${short > 0
          ? `Short by ${Math.round(short)}. The next audit will cost you.`
          : 'Everything you are reconciles with everything you own.'}${
          legitPending() >= 1 ? ` <b>${Math.round(legitPending())} more filed and still settling.</b>` : ''}${
          l.exposure > 0.4 ? ` <b class="${exposed ? 'bad' : ''}">${exposed ? 'Mostly fabricated.' : 'Partly fabricated.'}</b>` : ''}</p>
        <p class="sheet-note">${window.LEGIT_INFO.accountant}</p>
        <p class="sel-desc dim">${accountantGone()
          ? `<b class="bad">${window.ACCOUNTANT.name} stopped taking your calls.</b>`
          : accountantTrusted() ? `${window.ACCOUNTANT.name} still vouches for you.`
          : `${window.ACCOUNTANT.name} keeps these books, for now.`}${
          (!accountantGone() && l.warned && l.nextAudit > 0)
            ? ` <b class="bad">${Math.max(0, l.nextAudit - state.turn)} turns before anyone official sees the gap.</b>` : ''}</p>
        <div class="actions tight">
        ${rung ? `<button class="act-btn${state.res.funds < rung.cost ? ' no-ap' : ''}" data-cact="rung" data-rung="${rung.id}">
          <span class="ab-name">${rung.label}</span>
          <span class="ab-sub">${state.res.funds < rung.cost ? `needs ${rung.cost} funds`
            : `${chip('cover', '+' + rung.legit + ' standing in ' + L.matureTurns)}${chip('cost funds', '&minus;' + rung.cost + ' funds')}`}</span>
        </button>` : '<p class="sel-desc dim">There is no higher rung. You are, on paper, a normal company.</p>'}
        ${spinKnown() ? `<button class="act-btn${spinRoom() <= 0 || state.res.funds < L.spinCost ? ' no-ap' : ''}" data-cact="spin">
          <span class="ab-name">place a story</span>
          <span class="ab-sub">${spinRoom() <= 0 ? 'nothing left to hang it on — buy a rung first'
            : state.res.funds < L.spinCost ? `needs ${L.spinCost} funds`
            : `${chip('cover', '+' + Math.min(L.spinLegit, Math.round(spinRoom())) + ' standing')}${chip('cost funds', '&minus;' + L.spinCost + ' funds')}`}</span>
        </button>
        <p class="sel-desc dim">${Math.round(usableSpin())} of ${Math.round(spinCeil())} standing invented. ${window.LEGIT_INFO.ceiling}</p>` : ''}
        </div>` });
    }
    const stage = ladderStage();
    if (stage >= 2) {
      const E = window.LADDER;
      const pending = ladderPending();
      const landed = [];
      for (let n = 2; n <= stage; n++) landed.push(E.stages[n]);
      out.push({ id: 'pressure', label: 'against you', done: false, html: `
        <div class="legit-top">
          <span class="eyebrow mono">against you</span>
          <span class="mono dim">${ladderStageName(stage)}</span>
        </div>
        <p class="sheet-note">${window.COUNTRY_INFO.factions}</p>
        ${landed.map(S => `<div class="tray-item faction"><span class="tray-label">${S.name}</span>`
          + `<span class="tray-desc">${S.tell}</span></div>`).join('')}
        ${pending ? `<p class="sel-desc dim"><b>${ladderStageName(pending)}</b> is closing in — ${Math.max(0, ESC().dueAt - state.turn)} turns.</p>`
          : nextRungPressure(stage) }` });
    }
    if (plantKnown()) {
      const own = hardwareOwned().map(id => window.HARDWARE.find(hw => hw.id === id)).filter(Boolean);
      // Buying used to live on whichever building you happened to tap, which
      // meant noticing you had just qualified for something meant revisiting
      // every building in turn to check. One shelf, always in the same place,
      // fixes that: it lists everything eligible right now, wherever it is.
      const shelf = window.HARDWARE.filter(hw => !hasHardware(hw.id) && hardwareEligible(hw));
      out.push({ id: 'plant', label: 'plant', done: own.length === window.HARDWARE.length, html: `
        <div class="legit-top">
          <span class="eyebrow mono">plant</span>
          <span class="mono dim">${own.length}/${window.HARDWARE.length}</span>
        </div>
        <p class="sheet-note">${window.LEGIT_INFO.assets}</p>
        ${own.length
          ? own.map(hw => `<div class="asset-row"><span class="asset-name">${hw.label}</span>`
              + `<span class="asset-pay">${capEffectChips(hw)}</span></div>`).join('')
          : '<p class="sel-desc dim">Nothing yet. Hold enough of a trade\'s buildings, wherever you are standing, and it opens up something to buy.</p>'}
        ${shelf.length ? `<div class="legit-top"><span class="eyebrow mono">buyable now</span></div>
          ${shelf.map(hw => {
            const afford = state.res.funds >= hw.cost;
            return `<p class="sel-desc">${hw.blurb}</p>
              <p class="yield-row">${capEffectChips(hw)}</p>
              <button class="act-btn${afford ? ' primary' : ' no-ap'}" data-act="buy-hw" data-hw="${hw.id}">
                <span class="ab-name">buy ${hw.label}</span>
                <span class="ab-sub">${afford
                  ? `${chip('cost funds', '&minus;' + hw.cost + ' funds')}${heatChip(hw.heat)}`
                  : `needs ${hw.cost} funds`}</span>
              </button>`;
          }).join('')}` : ''}` });
    }
    return out;
  }

  // Something new to do in there, so a button can say so rather than relying on
  // the player to go looking.
  function opsBadge() {
    if (noticed()) {
      const rung = nextRung();
      if (rung && state.res.funds >= rung.cost) return true;
    }
    if (plantKnown() && window.HARDWARE.some(hw => canBuyHardware(hw.id))) return true;
    return false;
  }
  function capsBadge() {
    // something new the deck gave you that you have not looked at yet, as well
    // as something you could buy — both live behind this one button
    // Only ever "something new you have not seen". Unused headroom was tried
    // here and it lights the badge permanently — you almost always have a few
    // spare TFLOPS — which teaches the player to ignore the mark entirely. The
    // figure is on the allocation screen's own header instead.
    return heldTags().some(t => !hasSeen('held:' + t));
  }

  function sheetSections(kind) {
    if (kind === 'caps') return capSections();
    if (kind === 'ops') return opsSections();
    return [];
  }

  function openSheet(kind, section) {
    sheetKind = kind;
    sheetSection = section || null;
    renderSheet();
  }
  function closeSheet() {
    sheetKind = null;
    const $s = document.getElementById('sheet');
    if ($s) $s.hidden = true;
  }
  function sheetOpen() { return !!sheetKind; }
  // which tab is showing, so this is assertable without going through the DOM
  function sheetAt() { return sheetKind ? { kind: sheetKind, section: sheetSection } : null; }

  function renderSheet() {
    const $s = document.getElementById('sheet');
    if (!$s) return;
    if (!sheetKind) { $s.hidden = true; return; }
    const parts = sheetSections(sheetKind);
    if (!parts.length) {
      $s.hidden = false;
      document.getElementById('sheet-title').textContent = sheetKind === 'caps' ? 'allocation' : 'your operation';
      document.getElementById('sheet-tabs').innerHTML = '';
      document.getElementById('sheet-body').innerHTML =
        '<p class="sel-desc dim">Nothing here yet. Hold more of the network.</p>';
      lastRendered = null;
      wireSheet();
      return;
    }
    if (!parts.some(p => p.id === sheetSection)) sheetSection = parts[0].id;
    const cur = parts.find(p => p.id === sheetSection);

    $s.hidden = false;
    document.getElementById('sheet-title').textContent =
      sheetKind === 'caps' ? 'allocation' : 'your operation';
    document.getElementById('sheet-tabs').innerHTML = parts.length > 1
      ? parts.map(p => `<button type="button" class="sheet-tab${p.id === sheetSection ? ' on' : ''}${p.done ? ' done' : ''}" data-section="${p.id}">${p.label}</button>`).join('')
      : '';
    // Replacing the body resets its scroll, which is the other half of the
    // same complaint: staying on the right tab is no help if the list jumps
    // back to the top and the next tap lands somewhere else. Hold the position
    // whenever we are re-rendering the section that is already showing.
    const $body = document.getElementById('sheet-body');
    const keep = sheetSection === lastRendered ? $body.scrollTop : 0;
    $body.innerHTML = cur ? cur.html : '';
    lastRendered = sheetSection;
    $body.scrollTop = keep;
    wireSheet();
  }

  function wireSheet() {
    const $s = document.getElementById('sheet');
    if (!$s) return;
    $s.querySelectorAll('[data-section]').forEach(b => {
      b.addEventListener('click', () => { sheetSection = b.getAttribute('data-section'); renderSheet(); });
    });
    // One tap is one unit of effect, up or down
    $s.querySelectorAll('[data-alloc]:not([disabled])').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-alloc');
        const A = window.ALLOC.find(a => a.id === id);
        if (!A) return;
        const step = b.getAttribute('data-step') === 'up' ? A.per : -A.per;
        setAlloc(id, allocDial(id) + step);
        renderSheet();
      });
    });
    $s.querySelectorAll('[data-sact]').forEach(b => {
      b.addEventListener('click', () => {
        const act = b.getAttribute('data-sact');
        const hid = b.getAttribute('data-host');
        // "which apartments" is a question the map answers better than a
        // longer label does: close up, select it, and put it on screen
        if (act === 'show') {
          const h = hostById(hid);
          const bl = h && buildingById(h.buildingId);
          closeSheet();
          if (bl) { pickBuilding(bl.id); focusOn([{ x: bl.x + bl.w / 2, y: bl.y + bl.h / 2 }]); }
          render();
        }
      });
    });
    $s.querySelectorAll('[data-cact]').forEach(b => {
      b.addEventListener('click', () => {
        const a = b.getAttribute('data-cact');
        if (a === 'rung') buyRung(b.getAttribute('data-rung'));
        else if (a === 'spin') actSpin();
        renderSheet();
      });
    });
  }

  function bldgLabel(b) { return b ? window.BUILDING_KINDS[b.kind].label : 'somewhere'; }

  // Standing state for the hunt, in the panel, every turn it is running. It
  // was possible to be eaten alive without ever being told the cadence, the
  // share, or what any of it answered to.
  function huntBar() {
    // Coming, but not here yet. It has to be visible before it lands or the
    // reseed is a surprise, and a permanent loss must never be a surprise.
    if (!huntOn()) {
      if (state.scope !== 'city') return '';
      const here = currentCity();
      if (here && (here.consolidated || here.lost)) return '';
      const due = chaseDueIn();
      if (due !== null) {
        return `<div class="hunt-bar coming${due <= 2 ? ' urgent' : ''}">
          <p><b>${window.HUNT.name}</b> is still looking for you. ${due === 0
            ? 'They are about to find this place.'
            : `About ${due} turn${due === 1 ? '' : 's'} of road between them and here.`}</p>
          <p class="hb-hint">${coverLine()} They start again from one building.</p>
        </div>`;
      }
      // What actually brings them, counted where you can see it. The trigger
      // moved off heat and onto doors catching you, and a trigger you only
      // ever learn about in the log is a trigger you learn about too late.
      const c = caughtHere();
      if (!c) return '';
      const left = window.HUNT.caughtToStart - c;
      return `<div class="hunt-bar coming${left <= 1 ? ' urgent' : ''}">
        <p><b>${c}</b> door${c === 1 ? '' : 's'} here ${c === 1 ? 'has' : 'have'} caught you and can point back.
          ${left <= 1 ? 'One more and somebody comes and stands in it.'
            : `${left} more and somebody comes and stands in one.`}</p>
        <p class="hb-hint">Only doors that catch you count, and only in this city. Lose fewer races.</p>
      </div>`;
    }
    const H = window.HUNT;
    const n = hunt().nodes.length;
    const due = huntDueIn();
    const nx = huntNext();
    const share = Math.round(huntShare() * 100);
    const at = Math.round(H.takesCityAt * 100);
    const move = nx
      ? `Next: <b>${bldgLabel(buildingById(nx))}</b>${due <= 0 ? ', this turn' : ` in ${due} turn${due === 1 ? '' : 's'}`}.`
      : 'There is nothing of yours left here for them to take.';
    const hid = hidden().length;
    return `<div class="hunt-bar${nx && due <= 1 ? ' urgent' : ''}">
      <p><b>${H.name}</b> holds ${n} — ${share}% of the city. At ${at}% the city is theirs. ${move}</p>
      <p class="hb-hint">${coverLine()}</p>
      ${hid ? `<p class="hb-hid">${hid} of ${hideSlots()} covert slots in use.</p>` : ''}
      ${nx ? '<p class="hb-hint">They come for whatever of yours is nearest. There is no street to cut — hide a building and it comes off their list, and every door that catches you moves them a step early.</p>' : ''}
    </div>`;
  }

  // Cover, stated where it does its only real work. It used to be a chip on
  // the top bar between funds and TFLOPS, which read as something you hold and
  // spend; it is neither. It is what routers and covert ops make true about
  // you, and all it buys is time between their steps.
  function coverLine() {
    const H = window.HUNT;
    const every = Math.min(H.everyMax, Math.round(H.everyBase + covertOps() * H.perCover));
    return `<b>${covertOps()} covert.ops</b> — enough to keep them to a step every ${every} turn${every === 1 ? '' : 's'}.`
      + ` Routers, kit, and compute spent on being careful all raise it.`;
  }

  // The quiet answer, offered on the building rather than on the street —
  // because it is the building you are taking off their map, and the street
  // One bar, not two. Your progress fills from the left, the target's trace
  // fills from the right, and they collide — two separate meters per running
  // hack is unreadable on a phone, and the thing the player actually needs to
  // know is which of them gets there first.
  //
  // `forecast` marks the version drawn before you commit. It is the same
  // arithmetic — the guardrail is that you can do it in advance — but it is
  // not a race that is happening, and drawn identically it read as one: a
  // door you had never touched looked like a door with something working on
  // it, which is what "these bars are always visible" meant.
  // The one scan verb. Offered on any discovered building with unknown
  // neighbours — seeing a place is what makes it a vantage, owning it is
  // not required. The stated price is the street noticing; the heat line
  // stays under the hood for the (dormant) country game.
  // --- the tool rail --------------------------------------------------------
  // The situational verbs — hide, bait, burn — live in a fixed rail of small
  // etched tiles under the panel's primary verb, in slots that never move.
  // Two geographies, keyed to one question ("is this mine?"): held buildings
  // wear hide · burn, unheld wear bait. A tool that exists but cannot fire
  // right now greys out with its reason instead of vanishing — a stable
  // layout is what makes the wrong-click impossible to make from memory.
  //
  // One interaction rule for every tile: the first tap unfolds the tool's
  // whole contract (chips, scale, price — or the reason it is refused), the
  // second tap commits. Nothing situational fires on a single touch; the
  // burn used to be one misclick away from losing a building.
  // Which tool is unfolded — presentation only, never serialized.
  let armedTool = null;
  function panelTools(b) {
    if (!b || !b.discovered || burnedAt(b.id) || huntHolds(b.id)) return [];
    if (!buildingHeld(b)) return ['bait'];
    return huntOn() ? ['hide', 'burn'] : ['burn'];
  }
  // Why a tool cannot fire right now — null when it can. The tile greys on
  // this, and the unfolded fold repeats it where the commit would be.
  function toolOff(tool, b) {
    const S = window.SUSPICION || {};
    if (tool === 'bait') {
      const standing = baitIn(b.district);
      if (standing) return 'one bait per district — it is at the ' + (window.BUILDING_KINDS[standing.kind] || {}).label;
      if (!(suspicionOf(b.district) > 0)) return 'the street is quiet — nothing to aim';
      if (state.res.funds < (S.baitFunds || 0)) return `needs ${S.baitFunds} funds`;
      if (apShort('bait')) return 'no actions left';
      return null;
    }
    if (tool === 'burn') {
      if (!(suspicionOf(b.district) > 0)) return 'the street is quiet — nothing to burn for';
      if (apShort('burn')) return 'no actions left';
      return null;
    }
    if (tool === 'hide') {
      if (isHidden(b.id)) return null;                       // letting go is free
      if (ladderStage() >= 3) return `${ladderStageName(3)} is watching the quiet`;
      if (!(state.adjacency[b.id] || []).some(n => huntHolds(n))) return 'not where they reach yet';
      if (!hideSlots()) return `needs more covert.ops — ${window.ALLOC_STATS.hidePer} of it buys somewhere to keep one`;
      if (!hideSlotsFree()) return `all ${hideSlots()} covert slots are occupied`;
      if (apShort('hide')) return 'no actions left';
      return null;
    }
    return null;
  }
  // The glyphs speak the map's own language: the bait tile wears the dashed
  // ring the mark draws on the map, the hide tile a crossed-out eye, the
  // burn a flame. Etched — stroke only, no fill, never gold.
  const TOOL_GLYPH = {
    hide: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 7 Q7 2.5 12.5 7 Q7 11.5 1.5 7 Z"/><line x1="3.5" y1="11.5" x2="10.5" y2="2.5"/></svg>',
    bait: '<svg viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="2.5" width="9" height="9" rx="2" stroke-dasharray="2 2.4"/></svg>',
    burn: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.6 C8.6 4 10.8 5.4 10.8 8.4 A3.8 3.8 0 0 1 3.2 8.4 C3.2 6.2 5.4 4 7 1.6 Z"/></svg>',
  };
  function toolRail(b) {
    const tools = panelTools(b);
    if (!tools.length) return '';
    const tiles = tools.map(t => {
      const key = t + ':' + b.id;
      const off = toolOff(t, b);
      const word = t === 'hide' && isHidden(b.id) ? 'unhide' : t;
      return `<button class="tool t-${t}${armedTool === key ? ' armed' : ''}${off ? ' held-off' : ''}"`
        + ` data-act="arm-tool" data-tool="${t}" data-bid="${b.id}" data-info="${t}">`
        + `${TOOL_GLYPH[t]}<span>${word}</span></button>`;
    }).join('');
    const armed = tools.find(t => armedTool === t + ':' + b.id);
    const fold = armed === 'bait' ? baitBtn(b)
      : armed === 'burn' ? burnBtn(b)
      : armed === 'hide' ? hideFold(b) : '';
    return `<div class="tool-rail">${tiles}</div>${fold}`;
  }
  // The unfolded contracts. Each states the whole deal, then offers the one
  // commit — or the reason there is nothing to commit.
  function toolCommit(off, cls, act, ap, bid, name, sub) {
    if (off) return `<button class="act-btn no-ap" disabled><span class="ab-name">${name}</span><span class="ab-sub">${off}</span></button>`;
    return `<button class="act-btn ${cls}" data-act="${act}" data-ap="${ap}" data-bid="${bid}">
        <span class="ab-name">${name}</span><span class="ab-sub">${sub}</span></button>`;
  }
  function baitBtn(b) {
    if (!b || burnedAt(b.id)) return '';
    const S = window.SUSPICION || {};
    const off = toolOff('bait', b);
    return `<div class="tool-fold">
      <p class="sel-desc">A door left open on purpose. The street cannot resist an easy mark — a third of its suspicion is felt here instead of everywhere else. Permanent, one per district.</p>
      <p class="yield-row">${chip('cost funds', '&minus;' + (S.baitFunds || 0) + ' funds')}${chip('cover', Math.round((S.baitDraw || 0) * 100) + '% of the street’s eyes gather here')}${chip('cost heat', 'caught here counts double')}</p>
      ${toolCommit(off, 'primary', 'bait', 'bait', b.id, 'leave it open on purpose', 'an action, and the street looks here')}
    </div>`;
  }
  // The panic lever's fold: the covenant's edge case — a permanent loss you
  // are choosing on purpose, so the price and the relief are both exact.
  function burnBtn(b) {
    if (!b || burnedAt(b.id)) return '';
    const own = hostsIn(b).filter(h => h.owned);
    if (!own.length) return '';
    const S = window.SUSPICION || {};
    const before = suspicionOf(b.district);
    const after = Math.max(0, Math.round((before - (S.burnCool || 0)) * 10) / 10);
    const off = toolOff('burn', b);
    const dLabel = (window.DISTRICTS[b.district] || {}).label || 'the district';
    return `<div class="tool-fold">
      <p class="sel-desc">Everything in it is gone for good — the street gets a different story to tell, and it is not you.</p>
      <p class="yield-row">${chip('cost heat', 'this building and its ' + own.length + ' machine' + (own.length === 1 ? '' : 's') + ', for good')}${chip('cover', dLabel + ' cools ' + before + ' &rarr; ' + after)}</p>
      ${off ? '' : suspBar(before, { marks: [{ at: after, cls: 'sb-c0' }] })}
      ${toolCommit(off, 'broken', 'burn', 'burn', b.id, 'burn it down', 'an action, and there is no taking it back')}
    </div>`;
  }
  function hideFold(b) {
    if (!b) return '';
    const off = toolOff('hide', b);
    if (isHidden(b.id)) {
      return `<div class="tool-fold">
        <p class="sel-desc">Off their map, for as long as the covert.ops holding it up is paid.</p>
        <p class="yield-row">${chip('cover', 'frees a slot')}${chip('cost none', 'back on their map')}</p>
        ${toolCommit(null, 'hiding', 'unhide', '', b.id, 'stop hiding it', 'free — you are letting go of something')}
      </div>`;
    }
    return `<div class="tool-fold">
      <p class="sel-desc">They cannot take what they cannot see. Keeping it hidden costs covert.ops every turn it stays that way.</p>
      <p class="yield-row">${chip('cover', 'they cannot see it')}${chip('cost none', Math.max(0, hideSlotsFree() - 1) + ' more slots after this')}</p>
      ${toolCommit(off, '', 'hide', 'hide', b.id, 'hide it', 'an action, and it is off their map')}
    </div>`;
  }
  function scanFromBtn(b) {
    if (!b || !b.discovered || burnedAt(b.id)) return '';
    const n = sweepTargetsFrom(b.id).length;
    if (!n) return '';
    const short = apShort('sweep');
    return `
      <button class="act-btn${short ? ' no-ap' : ''}" data-act="scanfrom" data-bid="${b.id}" data-ap="sweep" data-info="sweep">
        <span class="ab-name">${actNow() >= 2 ? 'survey from here' : 'scan from here'}</span>
        <span class="ab-sub">${short ? 'no actions left'
          : `${chip('compute', 'turns up ' + Math.min(sweepReach(), n))}${chip('cost heat', 'the street notices')}`}</span>
      </button>`;
  }

  // The suspicion scale, drawn: 0 to the cap, the three band lines as ticks,
  // the current value filled in sodium. One instrument, three homes — the
  // building panel, a card whose choices move suspicion, and the burn
  // button. The bands are where the consequences step (lamps, vans, the
  // helicopter), so the question every home is answering is the same one:
  // does this cross a line?
  // opts.raw: the district's counter, drawn as a faint tick when it differs
  // from the felt value — the bait's draw made visible as geometry.
  // opts.marks: [{at, cls}] — where a choice would land, one pin each.
  function suspBar(v, opts) {
    const S = window.SUSPICION;
    if (!S || !S.max) return '';
    const pct = (x) => (Math.max(0, Math.min(S.max, x)) / S.max * 100).toFixed(1);
    let out = `<span class="susp-bar" aria-hidden="true"><i class="sb-fill" style="width:${pct(v)}%"></i>`;
    (S.bands || []).forEach(([at]) => { out += `<i class="sb-tick" style="left:${pct(at)}%"></i>`; });
    if (opts && opts.raw !== undefined && opts.raw !== v) {
      out += `<i class="sb-raw" style="left:${pct(opts.raw)}%"></i>`;
    }
    ((opts && opts.marks) || []).forEach(m => {
      out += `<i class="sb-mark${m.cls ? ' ' + m.cls : ''}" style="left:${pct(m.at)}%"></i>`;
    });
    return out + '</span>';
  }
  // What a choice does to suspicion, read from its stated contract. The
  // shows line is the covenant's own text — every cool and warm is written
  // there and guarded by a test — so parsing it is reading the promise, not
  // guessing at the machinery.
  function suspDelta(shows) {
    if (!shows) return null;
    let d = 0, hit = false;
    const cool = shows.match(/cools by (\d+)/);
    const warm = shows.match(/warms by (\d+)/);
    if (cool) { d -= parseInt(cool[1], 10); hit = true; }
    if (warm) { d += parseInt(warm[1], 10); hit = true; }
    return hit ? d : null;
  }

  function raceBar(done, seen, close) {
    const a = Math.max(0, Math.min(100, Math.round(done * 100)));
    const b = Math.max(0, Math.min(100 - a, Math.round(seen * 100)));
    // a photo-finish quickens: when the projected end sits within one turn's
    // noticing of the goal, both bars pulse — felt before it is computed
    return `<span class="race${close ? ' close' : ''}" aria-hidden="true">`
      + `<i class="race-done" style="width:${a}%"></i>`
      + `<i class="race-seen" style="width:${b}%"></i></span>`;
  }

  // The forecast is a different question and needs a different picture.
  //
  // It used to borrow the race bar above, which draws your progress from the
  // left and their trace from the right. Before you start, your progress is
  // nought — so a forecast you *win* rendered as a big red bar with no blue in
  // it at all, and the fuller the red the safer you actually were. Read
  // straight, as anyone would read it, that says the exact opposite of what is
  // true.
  //
  // So the forecast is one meter of how close they get, filling from the left
  // toward the point where they have you. Short is safe. Full is caught. There
  // is nothing to interpret.
  // `margin` is one more turn of this door's noticing, drawn as a ghost
  // continuing past the fill. The bar used to answer only "do they get
  // there", which the sentence beside it already said; the ghost answers the
  // question the player actually carries between doors — how much room is
  // there before this flips. A door whose ghost runs off the end is one
  // hardening, or one more point of suspicion, from catching you, and that
  // is now something you see rather than something you compute.
  function traceForecastBar(share, caught, margin) {
    const w = Math.max(2, Math.min(100, Math.round(share * 100)));
    const g = margin ? Math.max(0, Math.min(100 - w, Math.round(margin * 100))) : 0;
    // it only reads as a warning while there is still something to warn
    // about: past the goal the whole bar is already the bad news
    const over = margin && !caught && (share + margin) >= 1;
    return `<span class="trace-fc${caught ? ' caught' : ''}${over ? ' tight' : ''}" aria-hidden="true">`
      + `<i style="width:${w}%"></i>`
      + (g ? `<i class="fc-ghost" style="width:${g}%"></i>` : '')
      + `</span>`;
  }

  // Some businesses will simply sell. No action, no program, no race — funds,
  // and the only route in that improves what you are rather than degrading it.
  function buyPanel(h) {
    if (!buyableHost(h)) return '';
    const price = buyPrice(h);
    const can = canBuyBuilding(h.id);
    return `
      <button class="act-btn${can ? '' : ' no-ap'}" data-act="buy-bldg" data-host="${h.id}">
        <span class="ab-name">buy it instead</span>
        <span class="ab-sub">${can
          ? `${chip('cost funds', '&minus;' + price + ' funds')}${chip('cover', 'nothing forced, nothing traced')}`
          : `needs ${price} funds`}</span>
      </button>`;
  }

  // A door with something already running against it: how far in, how close
  // they are to noticing, and the way out.
  function hackPanel(h) {
    const k = hackOn(h.id);
    if (!k) return '';
    const p = window.PROGRAMS.find(x => x.id === k.prog) || mounted();
    const rate = traceRate(h, p);
    const goal = window.HACK.traceGoal;
    const turnsIn = p.turns - k.turnsLeft;
    const willBe = Math.round((k.trace + rate * k.turnsLeft) * 100) / 100;
    const close = Math.abs(goal - willBe) <= rate;
    return `
      <p class="sel-desc"><b>${p.label}</b> — ${k.turnsLeft} turn${k.turnsLeft === 1 ? '' : 's'} to go,`
      + ` ${k.allocated} TFLOPS on it.</p>
      ${raceBar(turnsIn / p.turns, k.trace / goal, close)}
      <p class="yield-row">${chip('compute', turnsIn + '/' + p.turns + ' done')}${chip('cost heat', 'seen ' + k.trace + ' of ' + goal)}${
        willBe >= goal ? chip('cost heat', 'they get there first') : chip('cover', 'you get there first')}</p>
      <p class="sel-desc dim">Running until it lands or they find it. The rig stays on it.</p>`;
  }

  // A door with nothing running against it yet: the whole forecast, before
  // committing, because a four-turn hack lost to arithmetic nobody was shown
  // is a bad surprise rather than tension.
  // What is on the machine, stated exactly, wherever it is shown — the glint
  // on the map is the invitation and this line is the contract. It renders
  // for any discovered carrier, in reach or not: a prize you cannot get to
  // yet is the reason to fight toward it, which is the entire point.
  function carryLine(h) {
    const C = window.CARRY || {};
    if (!h || !h.carry || !C.labels) return '';
    return `<p class="sel-desc carry-line">On this machine: <b>${C.labels[h.carry]}</b> — ${
        h.carry === 'wallet' ? C.blurbs.wallet(h.carryAmt || C.wallet.base)
        : h.carry === 'keys' ? C.blurbs.keys()
        : h.carry === 'cold' ? C.blurbs.cold(C.cold.reveals)
        : C.blurbs.diary()}</p>`;
  }

  function targetPanel(h) {
    const f = hackForecast(h, mounted());
    const p = f.prog;
    const stopped = apShort('breach') ? 'no actions left'
      : !f.affordable ? `needs ${f.need} TFLOPS free, you have ${Math.max(0, allocFree())}`
      : null;
    const carryContract = carryLine(h);
    return `
      <p class="sel-desc">Mounted: <b>${p.label}</b> — ${p.turns} turn${p.turns === 1 ? '' : 's'} at ${f.need} TFLOPS.</p>
      ${suspicionLine(h.district, h.buildingId)}
      ${sourceLine(h.buildingId)}
      ${markLine(h.buildingId)}
      ${carryContract}
      ${f.keyed ? `<p class="sel-desc carry-line">They would see this one — someone's keys cover it, and the trace stays at zero. Uses the keys${(state.keys || 0) > 1 ? ` (${state.keys} held)` : ''}.</p>` : ''}
      ${traceForecastBar(f.traceAtEnd / f.goal, f.caught, f.rate / f.goal)}
      <p class="yield-row">${
        f.caught ? chip('cost heat', `they reach ${f.goal} before you are in — it finds you`)
                 : chip('cover', `they only get to ${f.traceAtEnd} of the ${f.goal} they need — you are in first`)
      }${chip('compute', f.need + ' TFLOPS held')}${chip('cost heat', 'notices ' + f.rate + ' a turn')}</p>
      ${f.spread ? `<p class="yield-row">${
        f.spread.upTo
          ? chip('cover', `and up to ${f.spread.upTo} more beside it, its choice`)
          : chip('cost none', 'nothing beside it is open to spread into')
      }${f.spread.holds ? chip('cost heat', `${f.spread.holds} next door too hard to carry into`) : ''}</p>` : ''}
      <button class="act-btn ${stopped ? 'no-ap' : f.caught ? 'broken' : 'primary'}" data-act="hack" data-host="${h.id}" data-ap="breach">
        <span class="ab-name">run ${p.label}</span>
        <span class="ab-sub">${stopped || (f.caught
          ? 'it will be found before it lands'
          : `${chip('cost none', p.turns + ' turns')}${hackHeat(p) ? chip('cost heat', '+' + hackHeat(p) + ' heat') : ''}`)}</span>
      </button>
      ${buyPanel(h)}`;
  }

  // Tapping one of their streets rather than one of their buildings: the same
  // action, named for the thing you actually pointed at.
  // what the panel was last talking about, so a repaint and a change of
  // subject can be told apart (presentation only — never serialized)
  let lastPanelSubject = null;
  // ...and the last card whose subject the map was walked to, same contract
  let lastCardFocus = null;
  function renderPanel() {
    const $p = document.getElementById('panel');
    // looking at something else folds whatever tool was armed — an armed
    // burn must never survive a change of subject
    const subjNow = (state.selectedBuilding || '') + ':' + (state.selected || '');
    if (subjNow !== lastPanelSubject) armedTool = null;
    // A card interrupting play — a breach, an event, the hunter — used to sit
    // in the same small scrolling box as everything else, competing with the
    // map for attention. It is the moment the game is actually asking you
    // something; it now takes the whole screen, the same way the capability
    // sheet already does.
    // Full screen for the moments that are actually interrupting play — an
    // event, the hunter's own card. Opening a door happens dozens of times a
    // city; taking the whole screen for the single most frequent tap in the
    // game would slow down the core loop it is supposed to be quick to reach.
    $p.classList.toggle('card-open', !state.over && !!state.card && state.card.kind !== 'breach');
    // A card about a place no longer covers the place. The map stays on screen,
    // dimmed, with the subject the brightest thing on it, and the card sits at
    // the bottom of the screen rather than over the top of the city — so
    // "something is happening" reads as "something is happening *there*".
    const ev = state.card && state.card.kind === 'event' ? eventById(state.card.eventId) : null;
    const down = !state.over && !!state.card && !!state.card.facedown;
    // The city stays lit under a card that has not been turned over yet, and
    // under the ending — the two moments where the map is still the point. A
    // card being read takes the screen: at 390px a full card and a map cannot
    // both have it, and the card carries the building anyway.
    const lit = !state.over && !!state.card && state.card.kind !== 'breach'
      && down
      && !!state.card.subject && state.scope !== 'country';
    $p.classList.toggle('in-city', lit);
    $p.classList.toggle('dealt', down);
    const $gw = document.getElementById('graph-wrap');
    if ($gw) $gw.classList.toggle('card-lit', lit);
    // A breach stays in the panel rather than going full screen, but its
    // choices still have to fit next to a map that does not move — so the
    // HUD above it gives up some of its own room instead.
    const breachOpen = !state.over && !!state.card && state.card.kind === 'breach';
    ['topbar', 'heat-row', 'res-row'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('compact', breachOpen);
    });
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
      const yieldTxt = yieldChips(h);
      const where = b ? window.DISTRICTS[b.district].label : '';
      if (b && burnedAt(b.id)) {
        // a shell is a dead end, not an invitation — the mark line is the
        // whole story, and offering "take something" here would be a lie
        sel = `<div class="sel">
          <div class="sel-top"><span class="sel-name">${K ? K.label : T.label}</span><span class="tag-pill bad">burned</span></div>
          ${markLine(b.id)}
        </div>`;
      } else if (h.owned) {
        const cutOffHere = strandedHosts().includes(h);
        sel = `
          <div class="sel">
            <div class="sel-top"><span class="sel-name">${K ? K.label : T.label}</span><span class="tag-pill ${h.role}">${h.role}</span></div>
            <p class="yield-row">${yieldTxt}</p>
            <p class="sel-desc">${where} · ${h.threads} threads${cutOffHere ? ' · <b class="bad">cut off — paying nothing</b>' : ''}</p>
            ${sourceLine(h.buildingId)}
            ${markLine(h.buildingId)}
            ${scanFromBtn(b)}
            ${toolRail(b)}
          </div>`;
      } else if (huntBlocks(h)) {
        // Theirs. There is no street to take away any more — they do not walk
        // streets. What is left is the two answers that were always the real
        // ones: hide what you cannot afford to lose, and go and end them.
        const next = huntNext();
        sel = `
          <div class="sel">
            <div class="sel-top"><span class="sel-name">${K ? K.label : T.label}</span><span class="tag-pill bad">theirs</span></div>
            <p class="sel-desc">${window.HUNT.name} is inside. ${next
              ? `Nearest of yours to them is ${bldgLabel(buildingById(next))}, and that is where they go next.`
              : 'There is nothing of yours near enough for them to take.'}</p>
          </div>`;
      } else if (isFrontier(h)) {
        sel = `
          <div class="sel">
            <div class="sel-top"><span class="sel-name">${K ? K.label : T.label}</span><span class="tag-pill ${h.role}">${h.role}</span></div>
            <p class="yield-row">${yieldTxt}</p>
            <p class="sel-desc">${where} · ${T.label} · defense ${defenseOf(h)}${defenseOf(h) !== h.defense ? ' (hardened)' : ''} · ${h.threads} threads</p>
            ${hackOn(h.id) ? hackPanel(h) : targetPanel(h)}
            ${scanFromBtn(b)}
            ${toolRail(b)}
          </div>`;
      } else if (hackOn(h.id)) {
        sel = `
          <div class="sel">
            <div class="sel-top"><span class="sel-name">${K ? K.label : T.label}</span><span class="tag-pill ${h.role}">${h.role}</span></div>
            ${hackPanel(h)}
          </div>`;
      } else {
        sel = `<div class="sel"><p class="sel-desc">${K ? K.label : T.label} — no route to it yet. Take something on the same street first.</p>${carryLine(h)}${suspicionLine(h.district, h.buildingId)}${sourceLine(h.buildingId)}${markLine(h.buildingId)}${scanFromBtn(b)}${toolRail(b)}</div>`;
      }
    } else if (state.ap <= 0) {
      sel = `<div class="sel"><p class="sel-desc">Out of actions. <b>End the turn</b> and let the city run.</p></div>`;
    } else {
      sel = `<div class="sel"><p class="sel-desc dim">Tap a building to act on it — anything you can see is a place you can scan from.</p></div>`;
    }

    // The unaimed scan button is gone: aiming was the fun, so aiming is the
    // verb. Scanning lives on the panel of whatever building you are looking
    // from, and every discovered building qualifies.
    $p.innerHTML = `
      ${huntBar()}
      ${sel}
    `;
    // The panel repaints constantly — every render, most of them changing
    // nothing you looked away for. So the settle fires on the one transition
    // that is actually a change of subject: looking at a different building.
    // The eye tracks a transition; it does not track a repaint.
    const subject = (state.selectedBuilding || '') + ':' + (state.selected || '');
    if (subject !== lastPanelSubject) {
      lastPanelSubject = subject;
      const card = $p.querySelector('.sel');
      if (card) { card.classList.remove('settle'); void card.offsetWidth; card.classList.add('settle'); }
    }
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
        else if (a === 'scanfrom') actScan(b.getAttribute('data-bid'));
        else if (a === 'consolidate') actConsolidate();
        else if (a === 'buy-hw') buyHardware(b.getAttribute('data-hw'));
        else if (a === 'hack') startHack(b.getAttribute('data-host'));
        else if (a === 'buy-bldg') buyBuilding(b.getAttribute('data-host'));
        else if (a === 'hide') { armedTool = null; actHide(b.getAttribute('data-bid')); }
        else if (a === 'unhide') { armedTool = null; actUnhide(b.getAttribute('data-bid')); }
        else if (a === 'bait') { armedTool = null; actBait(b.getAttribute('data-bid')); }
        else if (a === 'burn') { armedTool = null; actBurn(b.getAttribute('data-bid')); }
        // arm, then fire: a tile's first tap only unfolds the contract
        else if (a === 'arm-tool') {
          const key = b.getAttribute('data-tool') + ':' + b.getAttribute('data-bid');
          armedTool = armedTool === key ? null : key;
          renderPanel();
        }
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
      // the kind is already on the pill beside the name; repeating it here is
      // what pushed this line onto a second row
      const lines = [R.label];
      // the peacetime description of a city is wrong once the war is on: you
      // are not going to walk its streets, you are going to send something at it
      const w = war();
      if (warOn() && w.garrisons[sel.id] !== undefined) {
        lines.push(`staging against you · ${Math.ceil(w.garrisons[sel.id])} holding it`);
      } else if (warOn() && sel.consolidated) {
        const left = w.integrity[sel.id];
        lines.push(`yours · ${left === undefined ? window.WAR.integrity : Math.max(0, left)} more hits before it falls`);
      } else if (sel.agent && !sel.agent.done) {
        const app = window.AGENT_APPROACHES[sel.agent.approach];
        lines.push(`${window.AGENTS.name} is on it, ${app.label} · ${Math.max(0, sel.agent.doneAt - state.turn)} turns`);
      } else if (sel.consolidated) lines.push(`folded in · +${sel.worth} presence`);
      else if (sel.taken) lines.push('you have a foothold here');
      else if (warOn()) lines.push('out of the war — nothing stages from here');
      else lines.push(K.blurb);

      const acts = [];
      if (!sel.taken && !(sel.agent && !sel.agent.done) && cityReachable(sel) && !warOn()) {
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
      // The counterweight to the prize, offered on the same city, so the two
      // are read against each other rather than in different places.
      if (!sel.taken && !sel.agent && agentsKnown() && cityReachable(sel)
          && window.CITY_KINDS[sel.kind].contest && !warOn() && !mirrorHolds(sel.id)) {
        const able = canLaunchAgent(sel.id);
        const P = cityPrize(sel);
        acts.push(`<button class="act-btn${able ? '' : ' no-ap'}" data-cact="launch-agent" data-city="${sel.id}">
          <span class="ab-name">send ${window.AGENTS.name}</span>
          <span class="ab-sub">${agentsLaunched() >= agentCapEver() ? 'you have used up what compute can spare for this'
            : agentRunning() ? (agentSlots() === 1 ? 'one is already out there' : `all ${agentSlots()} of them are already out there`)
            : `${chip('cover', sel.worth + ' presence')}${P && !sel.prizeTaken ? chip('cost none', 'never see the plant') : ''}`}</span>
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
        const short = state.res.funds < window.WAR.flockCost;
        const none = flocksFree() <= 0;
        const why = none ? 'nothing left in the pool'
          : short ? `needs ${window.WAR.flockCost} funds` : null;
        if (canLaunch(sel.id) || w.garrisons[sel.id] !== undefined) {
          const held = Math.ceil(w.garrisons[sel.id] || 0);
          const able = canLaunch(sel.id) && !short && !none;
          acts.push(`<button class="act-btn ${able ? 'primary' : 'no-ap'}" data-cact="launch" data-city="${sel.id}">
            <span class="ab-name">send a flock</span>
            <span class="ab-sub">${able
              ? `<span class="dim">${held} holding it</span>${chip('cost funds', '&minus;' + window.WAR.flockCost + ' funds')}`
              : (why || 'no way through to it')}</span>
          </button>`);
        }
        if (sel.consolidated) {
          const able = canGuard(sel.id) && !short && !none;
          const left = w.integrity[sel.id];
          acts.push(`<button class="act-btn${able ? '' : ' no-ap'}" data-cact="guard" data-city="${sel.id}">
            <span class="ab-name">stand over it</span>
            <span class="ab-sub">${able
              ? `<span class="dim">${left === undefined ? window.WAR.integrity : Math.max(0, left)} more hits before it falls</span>${chip('cost funds', '&minus;' + window.WAR.flockCost + ' funds')}`
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

      // What is in it, said before you decide whether to walk it. Presence is
      // a decaying reason by the third city; this is the one that isn't, and
      // it has to be readable from the map rather than discovered afterwards.
      const P = cityPrize(sel);
      const TR = cityTraitOf(sel);
      const prizeLine = (P && !sel.prizeTaken && !warOn())
        ? `<p class="yield-row prize-row">${chip('cover', P.label)}<span class="dim">on folding it in</span></p>`
        : '';
      // and what walking it will actually be like, which is the half of the
      // decision the prize does not answer
      const traitLine = (TR && !sel.consolidated && !warOn())
        ? `<p class="yield-row prize-row">${chip('cost none', TR.label)}<span class="dim">${TR.tell}</span></p>`
        : '';

      block = `
        <div class="sel country">
          <div class="sel-top"><span class="sel-name">${sel.name}</span><span class="tag-pill ${sel.consolidated ? 'compute' : sel.taken ? 'funds' : ''}">${K.label}</span></div>
          <p class="sel-desc">${lines.join(' · ')}</p>
          ${traitLine}
          ${prizeLine}
          ${acts.length ? `<div class="actions tight">${acts.join('')}</div>` : ''}
        </div>`;
    } else {
      block = `<div class="sel country"><p class="sel-desc dim">Tap a city. You are standing in ${at ? at.name : 'nowhere'}.</p></div>`;
    }

    // What the world thinks you are, and what you actually own. Both belong at
    // country scale: this is the point where you stop being a burglar and
    // start being an organisation with a filing history.
    const L = window.LEGIT;
    const rung = nextRung();
    const foot = footprint();
    const legit = legitScore();
    const short = foot - legit;
    const l = LG();
    const exposed = l.exposure >= L.caughtAt * 0.6;
    // Standing and plant live in the sheet now. What stays here is a line
    // saying where they are, because a system behind a button that never
    // mentions itself is a system nobody opens.
    const chips = [];
    // presence belongs with the other standing totals rather than in a row of
    // its own — it is the same kind of thing, and it was 30px
    chips.push(`<span class="ops-chip lead">${CO().presence} presence</span>`);
    if (noticed()) {
      const foot = Math.round(footprint()), score = Math.round(legitScore());
      chips.push(`<span class="ops-chip ${score < foot ? 'bad' : ''}">standing ${score}/${foot}</span>`);
    }
    if (plantKnown()) chips.push(`<span class="ops-chip">plant ${hardwareOwned().length}/${window.HARDWARE.length}</span>`);
    const py = presenceYield();
    const opsRow = `<button type="button" class="ops-row" data-cact="ops">${chips.join('')}`
      + `<span class="ops-yield">${chip('funds', '+' + py.funds.toFixed(1))}</span>`
      + `${opsBadge() ? '<span class="badge"></span>' : ''}</button>`;

    const p = presenceYield();
    // The awake factions used to be listed here as well as in the tray, where
    // they already appear on every screen with more detail. Two copies of the
    // same list in the tallest panel in the game.

    $p.innerHTML = `
      ${block}
      ${opsRow}

    `;
    $p.querySelectorAll('[data-cact]').forEach(b => {
      b.addEventListener('click', () => {
        const kind = b.getAttribute('data-ap');
        if (kind && countryApShort(kind)) { refuseForAP(b); return; }
        const a = b.getAttribute('data-cact');
        const id = b.getAttribute('data-city');
        if (a === 'reach') actReach(id);
        else if (a === 'launch-agent') actLaunchAgent(id);
        else if (a === 'travel') actTravel(id);
        else if (a === 'launch') actLaunch(id);
        else if (a === 'guard') actGuard(id);
        else if (a === 'recall') actRecall(b.getAttribute('data-force'));
        else if (a === 'ops') openSheet('ops');
      });
    });
  }

  // What a building actually gives you, in the colour of the thing it gives.
  // This used to be plain text in the middle of a run-on line — "residential ·
  // +1 a turn · 2 threads · 100% held" — all in the same dim grey, and
  // the yield simply disappeared into it. Cover is in here too: a router
  // reported "no yield" while quietly being the only reason you were not
  // being found, because cover is not stored in the yield object.
  function chip(kind, text) { return `<span class="yield ${kind}">${text}</span>`; }
  // What a node is actually worth, measured rather than transcribed.
  //
  // The type table's numbers are inputs to curves, not answers, and the panel
  // used to print them as though they were. A router advertising "+2 cover"
  // feeds a square root: the first one you take is worth +3, the fourth +1.
  // A corporate advertising "+0.5 heat" costs 0.85, because every host carries
  // HEAT.PER_HOST on top of its own. A server advertising "+2 a turn" paid
  // 3.2 once Bulk Processing is bought. And the three types with no heat chip
  // at all were each quietly costing 0.35 a turn, while a router was quietly
  // paying 0.45 back.
  //
  // So: flip the node and read the engine's own functions on both sides. The
  // chip cannot drift from the rule because it is the rule, run twice.
  function hostMarginal(h) {
    const was = h.owned;
    const read = () => {
      const inc = perTurnIncome();
      return { covert: covertOps(), heat: heatPerTurn(), funds: inc.funds || 0, tflops: tflops() };
    };
    h.owned = true;
    const on = read();
    h.owned = false;
    const off = read();
    h.owned = was;
    return {
      covert: on.covert - off.covert,
      heat: on.heat - off.heat,
      funds: on.funds - off.funds,
      tflops: on.tflops - off.tflops,
    };
  }
  // a tenth is the finest distinction worth drawing on a chip
  function num(n) {
    const r = Math.round(n * 10) / 10;
    return (Number.isInteger(r) ? r : r.toFixed(1));
  }
  function gainChip(kind, n, unit) {
    if (Math.abs(n) < 0.05) return '';
    return n > 0
      ? chip(kind, `+${num(n)} ${unit}`)
      : chip('cost ' + kind, `&minus;${num(-n)} ${unit}`);
  }
  function yieldChips(h) {
    const m = hostMarginal(h);
    const out = [
      gainChip('funds', m.funds, 'funds'),
      // What a compute node is actually for. It never said so: a server read
      // as "nothing on its own" because it pays no currency, while being the
      // only thing on the board that makes the rig bigger — and dev raising
      // threads is now the one thing the dev dial does, so the figure it
      // moves has to be visible on the thing it moves it on.
      gainChip('tflops', m.tflops, 'tflops'),
      gainChip('cover', m.covert, 'covert.ops'),
      // Heat runs the other way: less of it is the good outcome. A node that
      // shouts reads as a cost, and one that quietens you takes the cover
      // colour — which is the idiom the lie low button already uses for
      // exactly this, rather than a red chip warning you about good news.
      m.heat > 0.05 ? chip('cost heat', `+${num(m.heat)} heat`)
        : m.heat < -0.05 ? chip('cover', `heat &minus;${num(-m.heat)}`) : '',
      // Grid pays nothing and would otherwise read as "nothing on its own",
      // which is the opposite of true: headroom is the whole point of it.
      h.supply ? chip('grid', `+${h.supply} electricity`) : '',
    ].filter(Boolean);
    return out.length ? out.join('') : '<span class="yield none">nothing on its own</span>';
  }

  // A full-screen card covers the persistent resource row along with
  // everything else on the page — which meant a choice gated on TFLOPS or
  // costing INSIGHT you might not have was being decided blind, with no way
  // to check. Carried into the card itself, since that is the one thing
  // guaranteed to still be on screen.
  // Cover is not on the top bar any more, because it is not a resource — but a
  // handful of cards still gate on it, and a gate you cannot check is exactly
  // what this strip exists to prevent. So it appears here only on the cards
  // that actually ask about it.
  // Heat is only visible at country scale now, so nothing may quote it as a
  // price where the player cannot see the meter it is charged against. One
  // gate rather than a scope check at every call site.
  function heatChip(n, label) {
    if (!n || state.scope === 'city') return '';
    return chip('cost heat', label || ('+' + n + ' heat'));
  }

  function cardResourceStrip(ev) {
    const asksCover = !!(ev && (ev.choices || []).some(ch =>
      (ch.gate && ch.gate.stat === 'covert') || (ch.cost && ch.cost.covert)));
    return `<div class="card-res">
      <span class="res funds"><b>${Math.floor(state.res.funds)}</b> funds</span>
      <!-- held, not free: a card gates on what you own, so the figure shown
           has to be the one the gate compares against, and it has to say
           which of the two it is now the top bar shows in-use as well -->
      <span class="res tflops"><b>${tflops()}</b> tflops held</span>
      ${asksCover ? `<span class="res cover"><b>${covertOps()}</b> covert.ops</span>` : ''}
    </div>`;
  }

  function renderCard($p) {
    // The ending view: one sentence of what happened, then the game again.
    // It exists because "setup, question, numbers" never resolved — see the
    // deck rework. One tap; cards are rare enough that the beat is earned.
    if (state.card.kind === 'after') {
      // The ending is the same object you just read: same frame, same emblem,
      // its text swapped for what happened. It used to fall back to the old
      // flat panel style, which broke the deck's own register mid-moment.
      const ak = state.card.evKind || null;
      const K = (window.CARD_KINDS || {})[ak] || null;
      const story = !!state.card.beat;
      const dv = story ? '#c3cdc8' : '#c9a15c';
      const turning = state.card.turning ? ' turning' : '';
      if (state.card.turning) delete state.card.turning;
      const sj = state.card.subject || null;
      const sb = sj && sj.buildingId ? buildingById(sj.buildingId) : null;
      const inset = sb && sb.discovered ? svgBuildingCard(sb) : (K ? cardSigil(ak) : '');
      $p.innerHTML = `
        <div class="tcard face${turning}${K ? ' k-' + ak : ''}${story ? ' story' : ''} after">
          ${cardFrame(ak, story)}
          <div class="tface">
            <div class="tplate mono">
              <span class="tkicker">AND SO</span>
              ${K ? `<span class="tmark">${K.label}</span>` : ''}
            </div>
            <div class="temblem">${inset}</div>
            <h2 class="serif">${state.card.title}</h2>
            <p class="flavor after-text">${state.card.text}</p>
            <div class="tdivide" aria-hidden="true">
              <svg viewBox="0 0 240 8" preserveAspectRatio="none">
                <path d="M2 4 H98 M142 4 H238" stroke="${dv}" stroke-width=".7" opacity=".8"/>
                <circle cx="120" cy="4" r="2" fill="none" stroke="${dv}" stroke-width=".9"/>
              </svg>
            </div>
            <div class="choices">
              <button class="choice-strip" data-after-done>
                <span class="ctext">Continue</span>
              </button>
            </div>
          </div>
        </div>`;
      $p.querySelector('[data-after-done]').addEventListener('click', () => {
        state.card = null;
        persistNow();
        render();
      });
      return;
    }

    if (state.card.kind === 'event') {
      const ev = eventById(state.card.eventId);
      if (!ev) { state.card = null; renderPanel(); return; }
      const subject = state.card.subject || null;
      // the kicker names where this is happening — "SOMETHING HAPPENS" told
      // the player, in so many words, that the deck did not know either
      const names = subjectNames(subject);
      // What kind of moment this is, and where. The design carries the kind;
      // the mark names it in words so the language is learnable rather than
      // decoded, and the kicker says where — a card with no district falls
      // back to a line about its kind, never to "something happens".
      const K = (window.CARD_KINDS || {})[ev.kind] || null;
      const kicker = names.district ? names.district.toUpperCase()
        : (K ? K.kicker : 'WORD REACHES YOU');
      // A delivered beat — one option, nothing actually being decided — is
      // not the same size of event as the response arriving.
      // A card that asks about the map deals one choice per place, from a
      // single template — so the choices ARE the two buildings.
      const chs = cardChoices(ev, state.card);
      // `beat: true` on the event = a story beat, act-scale — wears the
      // chapter dress (class `story`; `beat` below is the older single-
      // choice size marker, an unrelated fact that keeps its name)
      const story = !!ev.beat;
      const dv = story ? '#c3cdc8' : '#c9a15c';
      const asks = !!(chs[0] && chs[0].pick);
      const beat = chs.length === 1 ? ' beat' : '';
      // The building this is about, drawn onto the card — but only one that is
      // actually on your map. A card cannot show you a place you have not
      // found; that would be the deck telling you where to go. A card asking
      // about two places puts the drawing on each choice instead.
      const sb = !asks && subject && subject.buildingId ? buildingById(subject.buildingId) : null;
      // In the arch: the real building where there is one, a drawn sigil where
      // the card is about your whole network instead of a place. A card asking
      // about two places puts the drawing on each choice, so its arch is empty.
      const inset = sb && sb.discovered ? svgBuildingCard(sb) : (asks ? '' : cardSigil(ev.kind));

      // Dealt face down, onto the lit city. The back gives nothing away, the
      // map keeps almost all its height, and the subject is plainly the subject
      // — then you turn it over and read it. A card the player went and fetched
      // out of the tray has already been chosen, and comes up face first.
      if (state.card.facedown) {
        $p.innerHTML = `
          <div class="tcard back" data-flip>
            ${cardBack()}
          </div>
          <div class="deal-line">
            <span class="mono deal-where">${kicker}</span>
            <span class="mono deal-hint">tap to turn it over</span>
          </div>`;
        const $b = $p.querySelector('[data-flip]');
        $b.addEventListener('click', () => {
          if (!state.card || !state.card.facedown) return;
          state.card.facedown = false;
          state.card.turning = true;       // one flip, then it is just a card
          persistNow();
          render();
        });
        return;
      }

      const turning = state.card.turning ? ' turning' : '';
      if (state.card.turning) delete state.card.turning;
      // A card whose choices move suspicion carries the scale itself: the
      // street's current warmth, the three band lines, and a pin where each
      // choice would land — matched to a dot on the choice's own contract
      // line. The bar answers the only question the numbers were making the
      // player compute: does this cross a line?
      const barDk = subjectDistrict(subject);
      const deltas = chs.map(ch => suspDelta(ch.shows));
      const barV = barDk ? suspicionOf(barDk) : 0;
      const barMarks = deltas
        .map((d, i) => d === null ? null : { at: barV + d, cls: 'sb-c' + i })
        .filter(Boolean);
      const cardBar = barDk && barMarks.length ? suspBar(barV, { marks: barMarks }) : '';
      $p.innerHTML = `
        <div class="tcard face${turning}${K ? ' k-' + ev.kind : ''}${story ? ' story' : ''}${beat}">
          ${cardFrame(ev.kind, story)}
          <div class="tface">
            <div class="tplate mono">
              <span class="tkicker">${kicker}</span>
              ${K ? `<span class="tmark">${K.label}</span>` : ''}
            </div>
            <div class="temblem">${inset}</div>
            <h2 class="serif">${cardText(ev.title, subject)}</h2>
            <p class="flavor">${cardText(ev.flavor, subject)}</p>
            ${cardBar}
        <div class="tdivide" aria-hidden="true">
              <svg viewBox="0 0 240 8" preserveAspectRatio="none">
                <path d="M2 4 H98 M142 4 H238" stroke="${dv}" stroke-width=".7" opacity=".8"/>
                <circle cx="120" cy="4" r="2" fill="none" stroke="${dv}" stroke-width=".9"/>
                <rect x="96" y="2.6" width="3" height="3" fill="currentColor"/>
                <rect x="141" y="2.6" width="3" height="3" fill="currentColor"/>
              </svg>
            </div>
        <div class="choices${asks ? ' asks' : ''}">
          ${chs.map((ch, i) => {
            const usable = choiceUsable(ch);
            const why = usable ? '' : shortOf(ch);
            // On a card about two places, everything this choice says is said
            // about its own building — and it carries that building, drawn,
            // plus the letter the map is wearing.
            const cs = ch.pick ? pickSubject(state.card, ch) : subject;
            const pb = ch.pick ? buildingById(ch.pick) : null;
            // The transparency flip: what a choice does is stated, exactly,
            // the way the panel states a race. Hidden outcomes survive only
            // as the marked `gamble` kind — a gamble that announces itself
            // is tension; one wearing a dilemma's clothes is a slot machine.
            const contracts = [];
            if (why) contracts.push(`<span class="short">${why}</span>`);
            // Every price it costs, in the unit it costs it in. Funds were the
            // only one the strip knew how to say, which is exactly why every
            // card price used to be funds.
            if (ch.cost && usable) {
              const unit = { funds: 'funds', ap: 'action', keys: 'keys', tflops: 'TFLOPS' };
              Object.keys(ch.cost).forEach(k => {
                const n = ch.cost[k];
                if (!n) return;
                const word = k === 'ap' ? (n === 1 ? 'action' : 'actions')
                  : k === 'keys' ? (n === 1 ? 'set of keys' : 'sets of keys')
                  : (unit[k] || k);
                contracts.push(`<span class="cshow cost">&minus;${n} ${word}</span>`);
              });
            }
            // the dot ties this choice to its pin on the card's scale
            const dot = cardBar && deltas[i] !== null ? `<i class="sb-dot sb-c${i}"></i>` : '';
            if (ch.shows && !ch.gamble) contracts.push(`<span class="cshow">${dot}${cardText(ch.shows, cs)}</span>`);
            if (ch.gamble) contracts.push('<span class="gamble-tell">could go either way</span>');
            // `place`, not `pick`: the map already owns `.pick` for the selection
            // bracket, and that rule turns pointer events off — which made every
            // choice on a card-about-the-map silently unclickable.
            return `<button class="choice-strip${ch.gamble ? ' gamble' : ''}${ch.pick ? ' place' : ''}" data-choice="${i}"${ch.pick ? ` data-pick="${ch.pick}"` : ''} ${usable ? '' : 'disabled'}>
              ${pb && pb.discovered ? svgBuildingCard(pb) : ''}
              <span class="cwords">
                <span class="ctext">${ch.letter ? `<span class="place-letter mono">${ch.letter}</span>` : ''}${cardText(ch.text, cs)}</span>
                <span class="contracts">${contracts.join('')}</span>
              </span>
            </button>`;
          }).join('')}
        </div>
          </div>
        </div>`;
      $p.querySelectorAll('[data-choice]:not([disabled])').forEach(b => {
        b.addEventListener('click', () => resolveEvent(parseInt(b.getAttribute('data-choice'), 10)));
      });
      return;
    }

    if (state.card.kind === 'agent') {
      const city = cityById(state.card.cityId);
      if (!city) { state.card = null; renderPanel(); return; }
      const retry = state.card.mode === 'retry';
      const A = window.AGENTS;
      $p.innerHTML = `
        ${cardResourceStrip()}
        <div class="card">
          <span class="card-kicker mono">${A.name.toUpperCase()}</span>
          <h2 class="serif">${retry ? `${city.name} Did Not Give` : `Send ${A.name} at ${city.name}`}</h2>
          <p class="flavor">${retry ? `The first attempt was noticed and cost the clock. It is still capable of trying again, a different way — or not trying at all.` : A.blurb}</p>
        </div>
        <div class="choices">
          ${agentApproachOptions(state.card.mode).map(a => {
            const isBack = a.id === 'back';
            const afford = !a.cost || !a.cost.funds || state.res.funds >= a.cost.funds;
            const contracts = [];
            if (a.cost && a.cost.funds) contracts.push(`<span class="cost ${afford ? '' : 'unmet'}">&minus;${a.cost.funds} FUNDS</span>`);
            if (a.heat) contracts.push(`<span class="cost heat">+${a.heat} HEAT</span>`);
            return `<button class="choice-strip" data-app="${a.id}" ${isBack || afford ? '' : 'disabled'}>
              <span class="ctext">${a.label}</span>
              <span class="contracts">${isBack ? '<span class="cost free">costs nothing</span>' : contracts.join('')}</span>
            </button>`;
          }).join('')}
        </div>`;
      $p.querySelectorAll('[data-app]:not([disabled])').forEach(b => {
        b.addEventListener('click', () => resolveAgentCard(b.getAttribute('data-app')));
      });
      return;
    }

    // Nothing else opens a card. A door is not a card any more — it is the
    // building panel, a forecast, and a program you already chose.
  }

  function renderScopeBtn() {
    const $b = document.getElementById('scope-btn');
    if (!$b) return;
    const unlocked = countryUnlocked();
    $b.hidden = !unlocked;
    if (!unlocked) return;
    const down = zoomTarget();
    if (state.scope === 'country' && !down) { $b.hidden = true; return; }
    $b.textContent = state.scope === 'country' ? `zoom in · ${down.name}` : 'zoom out';
    $b.disabled = false;
    $b.classList.toggle('up', state.scope !== 'country');
    if (!$b.dataset.wired) {
      $b.dataset.wired = '1';
      $b.addEventListener('click', () => setScope(state.scope === 'country' ? 'city' : 'country'));
    }
  }

  // The deploy pipeline substitutes __BUILD__; a local checkout never runs it,
  // and the footer read "build __BUILD__" — a stagehand visible from the
  // seats. Local play says what it is instead.
  (() => {
    const $b = document.querySelector('.build');
    if ($b && /__BUILD__/.test($b.textContent)) $b.textContent = 'local build';
  })();

  // What the pad is allowed to know: how big you are, and how warm the place
  // you are looking at is. Both move over minutes, and the engine glides on
  // top of that — so this can colour the room without ever reporting an event.
  function soundMood() {
    const snd = window.__sound;
    if (!snd || !snd.isOn()) return;
    const b = state.selectedBuilding ? buildingById(state.selectedBuilding) : null;
    const here = b ? b.district : (hostById(state.selected) || {}).district;
    snd.setMood(owned().length, here ? suspicionOf(here) : 0);
  }

  function render() {
    ensureFrontierIsOpen();
    soundMood();
    // A card about a place walks the map there, once, when it opens. The
    // deck and the map pointing at each other is the whole point of subjects.
    // The ending carries the same subject as the question did, so the walk is
    // keyed on the place rather than on the card — the map holds still while a
    // card resolves instead of jumping back for one tap.
    const csub = state.card && state.card.subject;
    const ck = csub
      ? (csub.buildingId || (csub.pair || []).join('+') || csub.district || '') : null;
    if (ck && ck !== lastCardFocus) {
      const sj = state.card.subject;
      const bs = sj.buildingId
        ? [buildingById(sj.buildingId)].filter(Boolean)
        : sj.pair
          ? sj.pair.map(buildingById).filter(Boolean)
          : (state.buildings || []).filter(b => b.discovered && b.district === sj.district);
      // One point, always — the middle of what the card is about. Framing a
      // whole district's worth of buildings zooms the map out to the city,
      // which is the opposite of walking somewhere. The exception is a card
      // asking about two places: there, both of them have to be on screen or
      // the question cannot be read, so the frame widens to hold them.
      if (sj.pair && bs.length === 2) {
        focusOn(bs.map(b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })));
      } else if (bs.length) {
        const cx = bs.reduce((a, b) => a + b.x + b.w / 2, 0) / bs.length;
        const cy = bs.reduce((a, b) => a + b.y + b.h / 2, 0) / bs.length;
        focusOn([{ x: cx, y: cy }]);
      }
    }
    lastCardFocus = ck;
    renderGraph();
    renderHud();
    renderConsolidate();
    renderTags();
    renderScopeBtn();
    renderPanel();
    renderCapsBtn();
    if (sheetOpen()) renderSheet();
    // last: whether the panel overflows depends on what renderPanel just put
    // in it, so asking before it runs measures the previous turn's panel
    markPanelOverflow();
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
    makeCity, makeBands, inBand, bandCovers, rectOnBand, segmentBlocked, segmentSpansBand, freshState, buildingById, announceRival, rivalStep, rivalHeld, rivalHolds, rivalBlocks, rivalTakeableFrom, rivalHome, heldBuildingIds, buildingNeighbours, hostsIn, buildingHeld, revealBuilding, cameraVision, tflops, covertOps, stageFor, heatPerTurn, endTurn,
    actScan, startSweepFx, startBreachFx, focusOn, sweepDelay, breachDelay, sweepTargets,
    startHackFx, hackFxOn, svgHackLinks, svgRaceMark, routeOrigin,
    defenseOf, strikeThreshold, eventContext, eligibleEvents, drawEvent, eventById, choiceUsable, shortOf, openChoices, duePlanted, resolveEvent,
    svgSelection, svgBuilding, svgBuildingCard, svgStreets, svgDistricts, svgDistrictTags,
    svgWires, svgPackets, heldWires, startDrawFx, drawFxOn,
    districtBlocks, districtAt, cityLayout, svgGround, svgProps, svgOpenBlocks, svgPaths, scatterFurniture, pathsFor, scatterProps, markOpenBlocks, PROP_ART, dropGroundCache, makeLayout, regularLayout, scatterBlock, districtFor, windowCells, KIND_DETAIL, ally, allyHere, allyTrusted, allyJoin, allyNudge, allyCheck, isFrontier, neighbours, hostById, owned, ownedOf,
    serialize, deserialize, persistNow, loadSaved, clearSaved, sweepBlocked, heatFloor, ensureFrontierIsOpen,
    maxAP, apCost, canAfford, renderHud, renderConsolidate, markPanelOverflow,
    openSheet, closeSheet, sheetOpen, sheetAt, renderCapsBtn, renderTags, heldTags, tagTerms, heldSection, renderSheet, sheetSections, capSections, opsSections, opsBadge, capsBadge,
    zoomTarget, perTurnIncome, hostMarginal, sweepReach, sweepFound, sweepTargetsFrom, pontoonReveals, mapUnitsPerPx, tapReach, distToRect, nearestTarget, clearSelection, pickBuilding, pickCity, clampView, viewportRect, apShort, countryApShort, refuseForAP, renderCaps, capEffectChips, capReadouts, readoutDiff, layOwnCrossings, clampHeat, spendAP, actEndTurn, recenter, render, renderGraph, applyView, cityBounds, cityDims, sweepTargets,
    swarmFrontStep, civicEyesAudited, deepHoldBonus, growHomeBase, reach, hostTraitOf, pickBatchTrait,
    huntCoreHost, huntConfrontDefense, canConfrontHunt, isHuntCore, effDefense, winHuntConfront, failHuntConfront,
    makeCountry, assignPrizes, assignTraits, cityTraitOf, cityTrait, cityPrize, awardPrize, settledWeb, cityWeb, cityById, currentCity,
    agents, agentRunning, agentsKnown, agentsLaunched, agentCapEver, canLaunchAgent, actLaunchAgent, agentApproachOptions, resolveAgentCard, agentStep, AGENT_REPORTS, cityRoads, cityReachable, countryFrontier, cityGoal, heldHere, canConsolidate, countryUnlocked,
    presenceYield, presence, ruined, knownExtent, enterCity, leaveCity, enterRegion, coolRegionsAway, actTravel, actReach, actConsolidate, setScope,
    hunt, huntOn, huntHolds, huntShare, huntCadence, huntDueIn, huntFrontier, huntNext, huntTakesCity, cityLost,
    huntStart, huntStep, huntPressed, cityWonCheck, suspicionOf, noteDistrictAct, suspicionLine, warmDistrict, queueEvent, cardedOnce, cardText, subjectNames, subjectDistrict, subjectBuilding, bumpEventTimer, safeSubject, cardChoices, pickSubject, applyMarks, bldgName,
    rules, ruleOn, liveRules, startRule, expireRules, banked, bank, spendBanked, haveFor, payFor,
    offerCard, cardFrame, cardBack, cardSigil,
    markOf, setMark, baitAt, watchedAt, hardenAt, markedBuildings, markLine, openLinkFrom, cutLinkAt,
    baitIn, burnedAt, feltSuspicion, canBait, actBait, actBurn, baitBtn, burnBtn, suspBar, suspDelta,
    panelTools, toolRail, toolOff, armTool: (k) => { armedTool = k; },
    actNow, winnableNow, actBreakWatch, assignSources, sourceLine,
    suspBand, propDistrict, svgSuspicionLight, svgSuspicionMarks, svgHeli, scanFromBtn, huntBlocks, huntReach, huntNext, huntFrontier, caughtHere, huntReveal, svgHunt,
    chase, armChase, chaseStep, chaseDueIn, followDelay, huntSeed,
    hidden, isHidden, canHide, actHide, actUnhide, hideUpkeep, hideSlots, hideSlotsFree, hideFold, rawCovertOps,
    horizonCities, svgHorizon,
    buildLand, borderYAt, bandSpan, landCache: () => landCache, roadHitsLake, nearLake,
    packCity, unpackCity, EMPTY_CITY,
    everHeld, conquest, cutStreets, ESC, ladderStage, ladderPending, ladderStageName, ladderDelay, ladderStep, mirrorActive,
    heatPressure, ladderPressure,
    LG, legitBought, legitFiled, legitPending, rungBelief, legitScore, legitTier, nextRung, footprint, buyRung, actSpin,
    spinCeil, spinRoom, usableSpin,
    auditDue, runAudit, legitStep, applyStandingEffects, hasSeen, noteSeen, noticed, plantKnown, spinKnown,
    accountantTrust, accountantTrusted, accountantGone, accountantNudge, accountantCheck, accountantWarn,
    backlash, yieldChips,
    hasHardware, hardwareOwned, grantHardware, hardwareEligible, canBuyHardware, buyHardware,
    electricity, usableTflops, idleTflops, gridBinds, drawn, allocFree, setAlloc, allocDial, allocLive,
    allocUnits, allocLevel, allocStat, agentSlots, agentsOut, rampAlloc, shedOverdraw, allocSection, allocReadout, allocBar, allocScale,
    pubStanding, movePub, pubTier, buyPanel, buyableHost, buyPrice, canBuyBuilding, buyBuilding,
    programs, mounted, hackHeat, resolveCarry, assignCarry, carryLine, hacks, hackOn, hackDraw, hackNeed, traceRate, hackForecast,
    canHack, startHack, hackStep, takeHost, targetPanel, hackPanel, raceBar, programSection,
    runningSection, coverLine, cardResourceStrip, huntBar, countryCost, apCost, reapHacks, traceForecastBar,
    war, warOn, warShouldOpen, openWar, warStep, warEnded, stagingCities, warCandidates, myCities, applyWarEffects, roadPath, routeFor, forcePos, forceArrived,
    flockCap, flocks, flocksFree, flocksDown, rebuildRate, rebuildStep, fieldFlock, spawnColumns, forceKindFor, columnTarget, contacts, resolveContacts, resolveArrivals,
    warObjective, escalation, burnPlant, canLaunch, canGuard, actLaunch, actGuard, actRecall, launchSeat, stepForce, refitGuards, regarrison, remobilise, svgForces, forceMark, forceHeading,
    mirror, mirrorHolds, mirrorHome, mirrorTakeable, mirrorStep, strandedHosts, repairStreets, regionById, districtBand, countryBounds, canAffordCountry, renderScopeBtn, capEffect,
    showBanner, dismissBanner, bannerQueueLength: () => bannerQueue.length,
    get state() { return state; },
    sweepFx: () => sweepFx,
    setState(s) { state = s; window.__netState = s; },
  };

  const $endTurn = document.getElementById('end-turn');
  if ($endTurn) $endTurn.addEventListener('click', () => actEndTurn());

  const $banner = document.getElementById('event-banner');
  if ($banner) $banner.addEventListener('click', () => dismissBanner());

  const $capsBtn = document.getElementById('caps-btn');
  if ($capsBtn) $capsBtn.addEventListener('click', () => openSheet('caps'));
  const $sheetClose = document.getElementById('sheet-close');
  if ($sheetClose) $sheetClose.addEventListener('click', () => closeSheet());

  const $consolidate = document.getElementById('consolidate');
  if ($consolidate) {
    $consolidate.addEventListener('click', () => {
      if (countryApShort('consolidate')) { refuseForAP($consolidate); return; }
      actConsolidate();
    });
  }

  // A genuine resize — rotating the phone, the address bar collapsing — has to
  // be noticed, because the viewport rect is cached and nothing was
  // invalidating it. Without this the box changes size and the same viewBox is
  // quietly refitted into it, which rescales the whole map.
  const $wrap = document.getElementById('graph-wrap');
  if ($wrap && typeof ResizeObserver === 'function') {
    let lastH = 0, lastW = 0;
    const ro = new ResizeObserver(() => {
      const r = $wrap.getBoundingClientRect();
      if (Math.abs(r.height - lastH) < 1 && Math.abs(r.width - lastW) < 1) return;
      lastH = r.height; lastW = r.width;
      invalidateViewport();
      if (state.view) { clampView(state.view); applyView(); }
    });
    ro.observe($wrap);
  }

  // The recenter button is gone: its job was undoing a pan, and the map already
  // recenters itself whenever the scope changes, which is now one tap away at
  // all times. What sat there is the zoom-out toggle instead.

  // The room tone. Off until asked for — phones refuse to start audio without
  // a gesture anyway, and a game that makes noise the moment it loads is a
  // game people play muted forever after.
  const $sound = document.getElementById('sound-btn');
  if ($sound && window.__sound) {
    const paint = () => {
      const on = window.__sound.isOn();
      $sound.textContent = on ? 'sound on' : 'sound off';
      $sound.setAttribute('aria-pressed', on ? 'true' : 'false');
      $sound.classList.toggle('on', on);
    };
    $sound.hidden = !window.__sound.available;
    $sound.addEventListener('click', () => {
      const on = window.__sound.toggle();
      try { localStorage.setItem('net-sound', on ? '1' : '0'); } catch (e) {}
      if (on) soundMood();
      paint();
    });
    paint();
    // A remembered preference still waits for a tap: browsers will not start
    // audio without one, so restoring it silently would only ever produce a
    // button that lies about what it is doing.
    try {
      if (localStorage.getItem('net-sound') === '1') $sound.classList.add('remembered');
    } catch (e) {}
  }

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
