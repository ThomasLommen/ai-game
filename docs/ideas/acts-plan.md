# The acts: one loop, played three ways

The verdict that starts this plan: **the city loop and the deck are the game.**
The country layer is not weaker content on the same game — it is a different
game, built before every rule that made the city good existed: before the
covenant, before aimed looking, before suspicion-as-consequence, before the
deck became the narrator. Playtests never left city one, and every improvement
that has landed in months has been a city improvement.

So the whole game gets built around the loop, and the acts are the same loop
pointed at different nouns.

## The loop, abstracted

What Act 1 actually is, with the burglary stripped off:

> **look** (aimed, at a cost) → **choose a door** (previewed exactly) →
> **run a race** (your rate against theirs) → **hold the thing** (it pays,
> permanently) → **the street notices** (pressure from your own activity) →
> **the world answers in cards** (the deck narrates and mutates the map).

Every act instantiates all six verbs. No act adds a seventh, and no act adds
a meter — the oldest rules on the traps list.

- **Act 1 — the tenancy** *(exists)*: look = sweep, door = defense, race =
  trace, hold = machines, notice = suspicion, answer = the living deck.
- **Act 2 — the works**: look = survey, door = the deal, race = the bid,
  hold = the build, notice = the public, answer = the deck in a new thread.
- **Act 3 — the siege** *(seeded only)*: they run the loop against you, on
  the graph you built.

## The country: the knife becomes policy

The country/war layer never returns **as a layer**. Its fate:

1. **Declared dead now** — this document is the declaration.
2. **The 92 dormant cards become a quarry.** The best fiction re-enters
   through the city deck, the way the heat ghosts were re-keyed — country
   cards for a country game was correct, and there is no country game.
3. **`country.js` and the war machinery are deleted when Act 2 ships** — not
   before (we never hold two half-things), and not later (a dead system that
   stays in the repo becomes a museum nobody dares dust).

## Act 2 — The Works

The fiction: the city is substantially yours and tenancy stops being the
question. Now you build something real — the factory, the prepare-for-war
storyline — which cannot be done from the shadows. **The inversion: Act 1 you
hide from the city; Act 2 you must show it something.** The front stops being
flavor and becomes the load-bearing wall.

### Stage W0 — the endgame census *(first, before anything)*

Measure where Act 1 actually decays rather than guessing. Bot games to 100
turns, sampled per 10: frontier size, takes available, suspicion mean, funds
surplus, distinct verbs used per turn. The act break lands where the knee is.

**Check:** a chart with a visible knee, and a number.

### Stage W1 — the act break, and the act wearing its own light

The break is dealt as a card — the deck is the act structure. Crossing it:

- a new save field `act`, the gate every W-stage hangs off
- the palette shifts (see *the act is visible in its materials*, below)
- the pad changes progression — the full seven-chord Warrior//Worrier loop
  has sat dormant in `data.js` since the sound sessions, waiting for exactly
  this: Act 1 holds the single Gm; Act 2 gets the whole loop *(bench decision
  with your ears, not mine)*

**Check:** the break fires from the loop at the measured knee; a save made in
Act 1 loads as Act 1; the shift is visible in one screenshot.

**W1 mechanics SHIPPED (2026-08-19):** `state.act` (old saves default 1, act
survives save/load, one direction only); `actBreakWatch` deals `act_break`
on the downslope — boom of ≥4 winnable takes, five turns under half peak,
a street at band 2, past a turn-24 story floor. Probe: 9-10 of 10 bot games,
arrivals 24-80, median ~37 (a game still booming rightly gets no break).
Verdict 3 shipped with it: both warming choke points double in Act 2. The
card carries `beat: true` — the chapter dress the beat class wears is the
next bench; the palette shift lands with it.

### Stage W2 — materials and the survey

Suppliers are what the look-verb finds now: buildings yield **materials** as
a carry-class fact (decided at generation, packed with the city — the loot
laws apply). Steel in the industrial belt, fabrication in the business park.
The survey is the same aimed scan with the same action price and the same
street-warming — looking is still activity.

**Check:** a survey names what a district can source; materials obey every
carry law; no new meter (materials are cargo, not a currency chip).

**W2 SHIPPED (2026-08-19):** `b.source` ('steel'|'fab') assigned at
generation off the city seed — industrial sources steel (45%), the business
park fabrication (40%), the high street either (12%), the suburbs nothing;
every city floors at 3 steel + 2 fab, because a city that cannot source
cannot build. Dormant in Act 1 (no line, no mark — the ground knows, the map
does not say). In Act 2 the scan button reads "survey from here", a survey
that turns up suppliers names them in the log, the panel states the trade,
and the map wears the first grid orange (`.src-mark`: a beam for steel, a
dot for fabrication). Nothing mints a number: a supplier is a place a
delivery will start from (W3), and cargo will exist only in trucks and at
sites (W4).

### Stage W3 — deliveries drive on roads

The exclusivity fix of Act 2, and its visual thesis. Materials move from
supplier to site as **trucks that follow the street grid** — routed along
the roads (`pathsFor` and the road plan already exist), never as
straight-line wires, because freight cannot fly through buildings. A
delivery:

- takes real turns, **visibly in transit** on the map
- is previewed exactly: route drawn, turns stated, exposure stated
- can be interdicted — a cut street forces the long way round; the response
  (later, inspectors) can sit on a route; a watched building is a bad street
  to drive past

...which is the moment `openLink`, `cutLink`, `hardenThere` and
`watchThere` stop being flavor and become strategy. The mark verbs were
built for this without knowing it.

**Check:** a truck follows roads and only roads; cutting its street reroutes
it and the preview updates; a delivery seen mid-transit after a reload is
still mid-transit.

**W3 pass 1 SHIPPED (2026-08-19):** the road lattice as a graph (a junction
at every crossing, a door per building straight out to its nearest street —
pathsFor's own move), Dijkstra routes, every segment axis-aligned on a real
road, guard-tested against diagonals. A cut closes the lattice edge nearest
the pair's midpoint ("the street between", as The Cut always said) — live
trucks reroute from where they stand, or park when nothing goes through.
The **yard** is a rail tool on any held building in Act 2 (one per city);
**send a truck** is the primary strip on held suppliers — priced (1 action
+ 2 funds), previewed to the turn (route drawn on the map on selection,
speed 520 px/turn ⇒ 3-7 turns across the city) and the street (+1 suspicion
per district crossed, act-doubling included in the quote). Trucks are real
glyphs driving turn by turn with their remaining road ghosted; arrivals
stack as crates at the yard (`yardStock` — cargo at a site, no HUD chip);
mid-transit survives save/load exactly. Still to come in W3: inspectors
sitting on routes (W5's response), and consumption (W4 builds on the yard).

### Stage W4 — the works itself

A site among buildings you hold, built in stages — site, power, line, works —
each stage a **previewed race** (funds + materials + turns against an
opposing rate: permits lapse, inspectors move). Power is a graph fact: the
site must hold a connected path to grid buildings, through streets, holdable
and cuttable like everything else. The works grows on the map, stage by
stage, in silhouette.

**Check:** every stage previews like a door; severing the power path stalls
the build and says so; the invariant suite holds (a build can never strand a
building).

**W4 SHIPPED (2026-08-19):** four stages (site 6f/1s/3t → power 8f/1s/1f/4t →
line 10f/2s/1f/4t → works 12f/1s/2f/5t) on the yard, each a previewed race:
notice accrues at `1 + 0.15 × felt suspicion` per turn against a red-tape
line of 14, and the quoted projection includes the noise the build itself
makes (a bait genuinely helps a building site). Red tape and a cut power
path are STALLS, never losses — progress holds, the panel says why, cooling
or re-holding the path resumes. Power = a held street path from the yard to
a grid building, BFS over held buildings minus cuts, required from the power
stage on. Breaking ground stamps `groundBroken` (verdict 8's clock, spent by
W5). The silhouette grows one block per standing stage with a crane while
building; the fourth stage queues the `works_online` story beat. The graph
is never modified — no build can strand a building, by construction.

**Spine census (overnight, 2026-08-19):** 14 bot games through the whole
arc: the break fires 14/14 (median ~40), the yard follows — and the works
came online in ZERO games. Blocked-turn census: funds ~930, materials 430,
red tape 116, power 0. Three findings and their proposals (the haulage
front, the deal, the 2-unit load) are written up in
`act2-economy-and-the-deal.md` for the grill. Nothing is built.

### Stage W5 — the front (and the suspicion answer)

The public lens: `pubStanding` and the `pub_*` cards come forward as Act 2's
second pressure. Building is loud by definition — each stage warms the whole
city — and the counterweight is **the front**: legitimate businesses you run
in buildings you hold. A front cools its district every turn, costs real
money to run, and is *visible* — a thing on the map with your name near it,
which the world's answer can target.

**This is the suspicion valve, and the only new one.** The grill killed the
"lie low" verb before it was born, and rightly: stalling until cool is the
exact degenerate loop the heat system died of — the suite still carries the
test *"acting warms here and cools there — waiting cools nothing"*, and a
lie-low button would repeal it. Relief stays things you **do**:

1. *(shipped)* **the bait aims it**: the bait mark is player-placeable, and a
   third of a baited district's suspicion is felt at the bait instead of
   everywhere else — moved, never lowered, reachable from district one;
2. *(shipped)* **the burn pays for it**: torch a building you hold for one
   band of cooling — the number drops, and the price is territory;
3. *(stays as-is)* cards remain the priced, occasional faucet — now anchored
   ("cools by 4, from 14") so the player can tell a little from a lot;
4. *(now, free)* the rotation rule gets said out loud — the panel states
   "working elsewhere cools this street", because a rule the player cannot
   see is a rule they will not use;
5. *(Act 2)* the front: cooling as infrastructure — bought, running, exposed.

**Check:** a front cools measurably and costs measurably; shutting it stops
both; the census shows suspicion pressure survives (no strategy holds every
district cold for free).

**W5 economy half SHIPPED (2026-08-20, per the five verdicts):** the
haulage front (open on a held building for 10f; offers deterministic,
previewed delivery jobs — pay 4 + 2/turn, cools its district 2 on
delivery, occupies a real truck, dies with its building); **the deal**
(unheld suppliers sell at 3× — 6f a load); trucks carry 2; the fleet caps
3 concurrent cabs so jobs and supply runs fight for them. Re-census:
games with a powered yard finish Act 2 in **26-29 turns — the sprint
verdict hit exactly** (was: zero games finished at all). The remaining
soft-lock is **grid access**: the power stage has no deal-equivalent, so
a run that never takes a grid building near the yard stalls forever.
Verdict: (a) — **the metered hookup, SHIPPED (2026-08-20)**: a stage
with no held path to a grid building is not refused; the utility sells
power at a stranger's price (+6f per stage, quoted as its own chip), and
a metered stage is immune to street cuts — paid up front, the utility
does not care whose streets those are. A held path stays free, so the
grid building is the good road and the meter the expensive one. Census:
12/20 works online (from 0), zero power blocks; powered-yard games run
Act 2 in 37-44 turns, metered ones slower but alive. Public lens +
inspectors still parked per the sequencing verdict — next grill.

### Stage W6 — the Act 2 deck

The batch, written for the act: inspections, the union, the journalist
(`pub_*` finally in their element), rival bids as **pair questions** ("two
suppliers, one contract"), sabotage beats where a competitor cuts *your*
street. Act 2 cards carry a second thread (see below) so a dealt card says
which act it belongs to before a word is read.

**Check:** pick-rate census; every Act 2 card previews and resolves; the
hollow-tag guard holds.

### Act 3 — the siege *(seed only, not planned here)*

When the works comes online, the state answers: the hunt at scale, on the
same map — multiple response webs, cutting **your** streets, besieging the
routes W3 built. War as defense of the graph you own, with the factory's
output as banked one-shot verbs. No country map. No columns. Planned only
after Act 2 is played and grilled.

## The act is visible in its materials

The gameplay stays; the *stuff* changes, grounded in what the stuff really
is. The Act 1/Act 2 distinction list, for reaction:

| surface | Act 1 — the tenancy | Act 2 — the works |
| --- | --- | --- |
| **movement** | data flies: wires as line-of-sight diagonals, packets between rooftops | freight drives: trucks on road centerlines, turning at junctions, queueing at the works |
| **light** | deep night; your windows are the only blue | pre-dawn: the horizon warms, more windows lit by default — the city waking around what you are building |
| **accent** | compute blue and funds gold | the **grid orange** (`#e0803f`, sitting in the palette barely used) as Act 2's second thread — on card frames, route lines, the works itself |
| **sound** | the held Gm drone | the full seven-chord loop, dormant since the sound bench, finally spent |
| **people** | watchers: vans, corner figures, the helicopter | workers and customers: the same faceless figures, but *yours* — queues at fronts, crews at the site; the suspicion ladder still overlays in its own colour, so watchers and workers never blur |
| **construction** | marks: rings, dashes, bait | cranes and scaffolds on the site; the works growing in silhouette, stage by stage — progress you can see from full zoom-out |
| **the look-verb** | the sweep ring, cover-green, at night | the survey: same ring drawn in daylight tick-marks (theodolite grammar), same price |
| **the response** | the red web, walking | inspectors: the same walking web in bureaucratic slate — Act 3 turns it red again, which will land like a chord change |
| **history** | marks accumulate | **nothing resets**: Act 1's marks, cuts, back doors and bait stay on the map — the city remembers what you did to it, and Act 2 is played on that scar tissue |
| **cards** | gold thread, kind as second weave | same frames, second thread in grid orange; the back stays identical (a back that varies is a marked card — across acts too) |

The rule under all of it: an act never invents a new visual language, it
re-lights the one the map already speaks — the same way the card kinds were
derived, not invented.

## Order

```
W0 census  →  W1 break  →  W2 materials  →  W3 roads  →  W4 works  →  W5 front  →  W6 deck
                                              └── the spine is W3–W5 ──┘
```

W0 and the rotation-surfacing line from W5.1 are immediate. If the whole
thing has to shrink: W1 + W3 + W5 is the irreducible act — the break, the
trucks, the front.

## The grill's verdicts (2026-08-19)

1. **The break lands *before* the loop starves, dealt as a card.** Never
   player-chosen, never at the wall — the player must not feel cornered into
   the next act. The census gives the leading signal: winnable takes start
   sagging (growth halved) a full 20-30 turns before the starve, so the
   break card deals on the *downslope*, while there is still meat — first
   sampled window where winnable takes fall and stay under half their peak
   with suspicion in band 2+. Tune on bots, verify by feel.
2. **Story beats get their own dress** *(SHIPPED: bench verdict — B's
   moon-silver thread with D's eclipse arch; class `story`, keyed off
   `beat: true`; the ending keeps the dress; deal and turn run at half
   speed; the back is bit-identical to every other card's, guard-tested)*. Act-scale cards (the break, the
   response arriving, endings) are a marked class the player learns to
   recognize on sight — a heavier chapter frame, its own thread, the deal
   given more ceremony. The **back stays identical** (a back that varies is
   a marked card — the drama belongs on the face and in the deal, not in
   information leaked before the flip).
3. **Act 1's verbs stay live in Act 2, at doubled street-warming.**
4. **Materials are cargo only.** Never a HUD chip, never a meter.
5. **Trucks are real glyphs**, driving the roads turn by turn.
6. **The pad does not change at the break.** No sound work until most of the
   game is solid.
7. **Act 2 is shorter and denser than Act 1** — a sprint, not a second
   life: ~60-70% of Act 1's healthy phase, emergent from stage costs and
   supply distances (tuned on bots, never a timer). It ends on an event:
   the final works stage lands, the Act 3 seed card deals.
8. **Breaking ground starts the clock.** The act has a free prologue —
   arrive, survey, stockpile, place fronts (Act 1's suspicion clock never
   stops, so the prologue cannot be grazed) — and the first works stage
   wakes the public lens and the inspectors' escalation. The break card is
   dealt *to* you; breaking ground is the answer you give it. Casing is
   free; the moment you touch the door, the race is on.

## Open questions for the grill

1. **Where does the break land** — at the measured knee, on taking the
   landmark, or player-chosen ("break ground") once conditions are met? *(my
   vote: player-chosen with conditions from the knee — an act break you press
   is an act break you remember)*
2. **Does Act 1's verb set stay live in Act 2** — can you still take
   buildings, just louder? *(my vote: yes, at doubled street-warming — the
   old life is still there, it just stopped being free)*
3. **Materials: cargo only, or also a HUD chip?** *(my vote: cargo only —
   the moment it is a number it is a meter)*
4. **Trucks: how real?** One truck glyph per delivery moving turn-by-turn,
   or an abstract "in transit 3 turns" route glow? *(my vote: the glyph — it
   is the act's whole visual thesis)*
5. **Does the pad switch progressions at the break?** *(bench decision —
   needs your ears)*
6. **How long is Act 2** — target turn count before Act 3 seeds? *(measure
   in bot play first, like everything else)*

## W0 result — the census ran (2026-08-19)

16 bot games × 100 turns (greedy-with-rotation bot: hacks coolest winnable
door, buys what sells, plays cards randomly; no allocation tuning, so the
absolute plateau is bot-limited — the *shape* is the claim, not the level).

| turn | frontier | winnable takes | owned | districts | susp mean/max | acts/turn |
|---|---|---|---|---|---|---|
| 10 | 1.0 | 1.0 | 5% | 1.5 | 13/15 | 1.6 |
| 20 | 2.0 | 1.3 | 10% | 1.8 | 18/24 | 1.6 |
| 30 | 3.8 | 0.8 | 15% | 2.3 | 20/29 | 1.7 |
| 40 | 4.3 | 0.5 | 19% | 2.3 | 20/34 | 1.8 |
| 50 | 4.8 | 0.7 | 21% | 2.5 | 20/35 | 1.7 |
| 60 | 5.9 | 0.8 | 22% | 2.6 | 19/34 | 1.4 |
| 70 | 5.3 | 0.1 | 23% | 2.6 | 19/33 | 1.1 |
| 80 | 5.8 | 0.1 | 24% | 2.6 | 19/33 | 0.6 |
| 90 | 5.0 | 0.0 | 24% | 2.7 | 20/33 | 0.6 |
| 100 | 4.2 | 0.1 | 24% | 2.7 | 19/33 | 0.4 |

**The knee is ~40–60.** Growth halves after turn 40 and the loop starves by
70: the frontier still *exists* (5+ doors) but winnable takes go to ~0 while
suspicion parks at ~19 mean — the doors are there, the race maths says no.
Acts per turn then decays to idling. Full series in `w0-census.json`.

Consequences adopted:
- **The act break should key on the loop starving, not on % city owned** —
  winnable takes ≈ 0 across streets while suspicion holds, is the signal; a
  human hits it later than the bot but hits the same wall.
- **The valve corner is real**: 10–13 of 16 games spent time at ≤1 district
  held with a street past band 2 — the bait/burn exist for a state the game
  actually visits.
- **Watch-list closed, differently than expected**: roadworks/power_cut conds
  are fine (eligible 424/480 turns; the draw is fair at ~1/27). The scarce
  resource is *unprompted deals* — triggered cards outnumber them ~3:1. Not
  a bug; noted for W6 so the Act 2 batch is not written into a faucet that
  cannot pour it.
- W5.4 shipped with this pass: the panel now says the rotation rule out loud
  on every warm street ("Working elsewhere cools this street. Waiting cools
  nothing.").

## The simplify pass shipped (2026-08-21) — one material, lots, shopfronts

Playtest verdicts (half-map, first real Act 2 run) landed as six commits:

1. **One material.** Steel/fabrication collapsed into `materials` — half
   the nouns, same trucks. Stages priced in `mat`; old saves fold both
   piles into one, nothing lost.
2. **The works rises on a vacant lot.** The yard is ground, not a
   building: open blocks wear a dashed orange edge in Act 2, tapping one
   offers *break ground* — a single act that pays the site stage, clears
   the lot, and starts the clock. Silhouette, crane, flag and crates all
   live on the lot; it cannot burn. The power path runs from held
   buildings across the street from the lot; the flag tile is retired.
   Legacy building-yard saves migrate to the nearest lot with stock and
   scaffolds intact.
3. **Fronts are shopfront-class.** A sign goes up only on a shopfront or
   offices — with a striped awning and the hanging sign on the map.
4. **The caught count is a chip.** Red eye in the top row, pulses at
   one-away, tap walks the map to the doors. The explaining bar keeps a
   3-catch teaching budget, then retires.
5. **The fleet is alive.** Trucks creep their remaining road in real time
   (own keyed layer, motion path, never past the per-turn truth);
   deliveries pop crates at the gate.
6. **Measured perf pass.** At a held half-map, zoomed out, 10× CPU
   throttle: idle 10fps → ~50, drag 8fps → ~37. Fixes: one flicking
   window per building; planning zoom stills every ambient tick; the
   drag rides a composited `#graph-slide` layer with staged viewBox
   commits; pinch writes at a 90ms stride.

### Post-rework spine census (20 bot games × 150 turns, unseeded)

Works online in 3–9/20 across bot variants (pre-rework baseline: 12/20).
High run-to-run variance, but two blocks dominate every run:

- **The metered premium recurs.** Bots break ground on unheld lots and pay
  `hookup 6` on every stage from power on (~18f extra) — "needs 14/16/18
  funds" is the top blocked-turn bucket. A held street to the lot erases
  it (lots average 2–5 buildings within power reach), but the bot never
  invests in one. Watch the human playtest: if the premium feels like a
  tax rather than a choice, candidate knobs are a one-time hookup or a
  cheaper repeat price — grill before touching.
- **Red tape at the lot** (~300–560 blocked turns/run): bots neither cool
  the yard's street nor pick cool lots. The bait does aim at the lot
  (felt suspicion at the lot benefits from the district's bait), so the
  designed answer exists; humans may simply play it.

Bot income also confirmed the shopfront restriction has teeth: variants
that never held a shop ran 0 jobs and starved. The morning card now says
where the sign goes.
