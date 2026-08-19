# The night census: Act 2's spine, played by bots

*(written overnight 2026-08-19 → 20; nothing in here is built — it is all
for the morning grill)*

## Method

14 bot games × 150 turns, playing the whole arc: tenancy → the break →
yard → trucks → the works. The bot rotates to the coolest winnable door,
prefers suppliers and grid buildings after the break, buys supplier
buildings outright when they will sell, baits districts past 18, keeps
three trucks rolling, stocks ahead, and raises a stage the moment
`worksShort` says nothing. It is not clever, but it is diligent — and
diligence is the right instrument for finding walls.

## Result

**The works came online in 0 of 14 games.** The break arrived in 14/14
(median ~turn 40 — the W1 signal works); the yard followed within a turn;
then the spine starved. Best game: three stages by turn 150. Most games:
zero or one.

The blocked-turn census (every turn a build was wanted and refused, all
games pooled):

| refusal | blocked turns |
| --- | --- |
| **needs funds (6/8/10)** | **~930** |
| needs steel in the yard | 352 |
| needs fabrication in the yard | 78 |
| red tape gets there first | 116 |
| no power path | 0 |
| ready (and built) | 7 |

## The three findings

### 1. Act 2 has no income — the headline

Act 2 added three money sinks at once — dispatches (2f), stages (36f
total), baits (4f), plus buying suppliers — and **zero money sources**.
Act 1's yields are tuned for Act 1's spending. The bots died broke, and a
human would arrive at the same wall a little later. The economy needs an
Act 2 faucet, and W5 already owns the natural one:

**Proposal: the front is a haulage firm.** Unify W5's front with W3's
trucks instead of inventing a new noun:

- A front is a legitimate business you open in a held building (funds to
  open, like the plan says).
- It runs the same trucks on the same roads — **commercial jobs**: the
  city pays for deliveries you carry for it. Income per completed run.
- Running jobs is visible legitimate busy-ness: it **cools its district**
  (the W5 valve, now with a mechanical reason — the street sees a working
  company, not a mystery).
- It is exposed exactly as planned: a thing on the map with your name
  near it, targetable by the world's answer, and it stops earning and
  cooling the moment its street is cut or its building lost.

One system: trucks become both supply line and front. The suspicion valve,
the Act 2 income, and the "you must show the city something" inversion are
the same object.

### 2. Supplier access can hard-block the spine

Several games never broke ground because no steel+fab pair was ever held:
the break deliberately fires on the downslope — when winnable takes are
scarce — and then Act 2's first demand is *two more specific takes*. When
the remaining suppliers are all behind doors the race maths refuses, the
game soft-locks out of its own third act. Buying helped (14/14 broke vs
13/14 before) but did not fix it (0/0 buy games still occur — not every
supplier will sell).

**Proposal: the deal — the plan's own Act 2 door, finally built.** The
abstraction table always said Act 2's door = *the deal*, race = *the bid*.
A supplier you do not hold can be dealt with:

- **Option A — per-load premium:** dispatch from a stranger's yard at
  ~3× the truck price. No commitment, always available, expensive.
- **Option B — the contract:** one negotiated payment opens the supplier
  permanently (a handshake, not a burglary). Previewed exactly.
- **Option C — the bid:** a contract raced against a rival bidder's rate
  — the Act 2 race grammar in its purest form, and W6's "two suppliers,
  one contract" pair card becomes its event-shaped sibling.

My vote: **A now (it un-blocks the spine with one small verb), C as the
W6-era upgrade**, B never (a flat unlock is a door without a race).

### 3. The sprint is running at half speed

Per-stage cadence measured ~20-25 turns (deliver 2-3 loads at 3-7 turns
each, then build 3-5) → a full works ≈ 80-100 turns of Act 2 against the
sprint verdict of 40-60. Levers, cheapest first:

- **a truck carries 2 units** (halves logistics turns, keeps every price);
- stage material costs trimmed (5 steel 4 fab → 4/3);
- more concurrent trucks (fleet size as a front upgrade?).

My vote: the 2-unit load first, then re-census before touching costs.

*(Red tape at 116 blocked-turns and power at 0: the race pressure is
present but not the wall, and the power graph never randomly strangles a
game. Both working as designed.)*

## For the grill

1. The haulage front: buy the unification (front = trucks = income +
   cooling + exposure), or keep the front as a pure cost the way the plan
   first wrote it?
2. If fronts earn, what stops "open fronts everywhere"? My vote: each
   front needs a held building + an opening price + one truck occupied
   per job — the fleet is the cap, and jobs compete with supply runs for
   the same trucks (a real tension, not a rule).
3. The deal: per-load premium now (A) and the bid later (C)? Numbers: 3×
   feels right (6f a load vs 2f from your own yard)?
4. The 2-unit truck load — any fiction objection? (A lorry that carries
   one girder was always a bit silly.)
5. Ground-break clock (verdict 8) — with the funds wall fixed, should the
   public lens + inspectors land in the same W5 pass, or after a tempo
   re-census?
