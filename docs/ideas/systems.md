# Systems and loops — candidates

Grouped by the part of the game they touch. Effort [S]/[M]/[L], the question
each answers, and how to measure it. The strongest candidates are marked ★ —
an opinion, offered to be argued with.

## A. The rig — programs, returning one at a time

The cut to one program was explicitly "until the second one earns its
place." Earning its place means: it must create runs backdoor cannot, not
just price the same run differently. Candidates, roughly in the order they
deserve consideration:

**★ siphon.exe [M]** — runs against a door *forever* and never takes it.
While mounted on a target it pays a trickle of funds per turn and accrues
trace slowly toward a stated horizon; you choose when to pull out, and
pulling out is the *only* way to bank the run without getting caught.
- Answers: buildings you don't want to own are currently worthless; funds
  faucets are thin; there is no push-your-luck decision anywhere.
- Why it earns entry: it is a *different verb* (harvest vs take), not a
  different price. And it is push-your-luck with full information — the
  trace arithmetic stays exact, so the covenant holds.
- Measure: bot with siphon vs without — funds curve, caught rate; check
  players actually pull out rather than riding every siphon to the wire.

**worm.exe [M]** — contagion redesigned as a commitment: pick a door, and
over the next N turns it takes that door *and tries its neighbours*, at a
stated per-hop chance printed before launch, spending your allocation the
whole time. Where old contagion failed (two-quiet-programs redundancy),
worm differs by being the *expensive, committed* one: high load, long hold.
- Answers: taking a neighbourhood should feel different from taking a door.
- Caution: per-hop chance breaks pure determinism. Version that keeps it:
  the hop *order* is stated and each hop's race is previewed; the
  uncertainty is only how the board changes while it runs.
- Measure: does the bot ever prefer it over serial backdoors? If never,
  the numbers are wrong; if always, worse.

**ghost.exe [S]** — a scan that walks: reveals a door's contents (loot,
defense, trace rate, what's behind it) without starting a race, for an AP
and a small allocation hold. Pairs with Intel below; possibly the same
feature wearing a program's name.

**hammer.exe, readmitted late [S]** — returns as an *unlock* once the
ladder reaches Enforcement: by then doors are hard enough that 1.8× load
hurts, covert.ops is scarce, and "pay everything, skip the race" is a real
trade instead of the dominant one. Cheap to do — the code existed.
- Measure: the original sin was 0.0% catch rate; re-run that probe at
  stage-4 defenses before shipping.

**throttle [S]** — not a program: a rig-wide lever. Run the mounted program
at half speed for reduced trace accrual (numbers stated). One slider,
reuses everything.
- Answers: covert.ops is the only stealth lever; a per-run choice would
  let a specific door be tip-toed.

## B. Loot — "what's on the machine" ★ — SLICE ONE SHIPPED

Slice one is in (see the rework doc's "What's on the machine"): four kinds,
glints, the panel contract, keys as need-only cover, placement weighted behind
the race. Awaiting the human playtest verdict before any second slice.

The single biggest missing payoff. Taking a building currently yields the
building. The fantasy says every machine should have *contents* — and the
psychology literature says anticipation beats payout, which this game can
do honestly because it previews everything.

Sketch [L, stageable]:

- Every host rolls contents **at city generation** (upstream randomness):
  most have nothing special, some carry one of a small set, stated in kind
  but not in detail once scouted:
  - **credentials** — the next run against a door of the same host type is
    free of trace ("you have someone's keys").
  - **a dataset** — one-time dev/threads bump, or feeds a card.
  - **a wallet** — funds, scaled to district tier.
  - **leverage** — plants a card: a choice about the person it implicates.
  - **cold storage** — a map fragment: reveals a cluster elsewhere.
  - **someone's diary** — nothing. A paragraph. The best one.
- **Scouting beats gambling:** a deep scan (Intel, below) marks *what kind*
  of thing a machine holds before you commit. The reward for scouting is
  targeting — "the finance floor has leverage on someone, go through the
  cabinet to reach it" — which turns loot into route planning, the thing
  the map is for.
- **Landmarks always carry something**, and it is always the big category
  (their existing prize machinery generalizes into this).
- No tiers, no rarity colors, no duplicates-into-shards economy. Kinds,
  not grades.
- Measure: does the bot's route change when loot is visible? If routes
  don't move, it's decoration. Also: fraction of takes that pay anything
  beyond the building — keep it well under half, or anticipation dies.

## C. Doors with character

Defense is one number; every door is the same question at different sizes.
A small set of stated *traits* on hosts (generated upstream, shown on
scan) makes the frontier legible and route choice richer. All previewed —
each trait is a printed rule, not a hidden die:

- **honeypot [S]** — visibly sweet (low defense, shown loot) and marked
  once scanned: getting caught here counts double. Unscanned, it looks
  like luck. The card that teaches this writes itself.
- **tarpit [S]** — races at half your speed *and* half its trace; a long
  slow door. Changes when you go, not whether.
- **alarmed [S]** — a catch here presses the response immediately even
  before it exists (counts as 2 toward `caughtToStart`).
- **legacy [S]** — cannot harden. The door you can afford to fail on;
  teaches the hardening rule by exception.
- **shared tenant [M]** — taking it adds trace to a named neighbour's next
  race (they talk). Anti-cluster pressure.
- **sysadmin [M]** — defense pulses on a stated schedule ("patched every
  6 turns: +4, decaying"). A timing puzzle, fully previewed.
- Measure: scan-and-route bots vs blind bots; trait presence should open a
  gap. Keep total traits ≤6 — past that, scanning becomes reading.

## D. Intel — promote scan to a decision ★

Scan is near-free and always correct: mash it. Make looking a choice:

- **wide scan [S]** — today's scan: adjacency, cheap, shallow.
- **deep scan [S]** — one building: contents (loot kind), traits, exact
  trace arithmetic, what it links to beyond. Costs the AP a scan costs plus
  a small allocation hold; this is `ghost.exe` if programs want the slot.
- **intercepts [M]** — once the response exists, spend intel allocation to
  see one extra move ahead (it names its next *two* buildings). The intel
  dial currently only buys scan reach; this gives it a second reader,
  which is what every dial deserves.
- Measure: bot with deep-scan targeting vs without; and check scan count
  per turn *falls* (it should become punctuation, not rhythm).

## E. Pressure in the first city ★ (pick exactly one)

The measured hole: nothing pushes back for the first ~35 turns. The
candidates are alternatives, not a set — one, dialed in, per the method.
All of them live *on the map*, not in a meter, per the traps list:

- **★ neighborhood suspicion [M]** — each *district* accumulates suspicion
  from your activity in it (runs started, buildings taken), shown as a
  subtle tint on the district ground and a word on the panel ("the high
  street is talking"). At a stated threshold, doors in that district trace
  faster until you go quiet there. It is local, visible, spatial — pressure
  you route around, not a bar you watch. Decays stated-per-turn.
  - Answers: city one has no pushback; also gives districts a mechanical
    identity to match their new visual one.
  - Measure: bot that round-robins districts vs one that camps — the
    camper should get caught more; neither should stall.
- **the landlord [S]** — story-shaped early clock: the origin house has an
  owner, and the electricity bill is wrong. A 3-card arc on a timer that
  ends with the player *moving the seat* (a new mechanic in miniature) or
  buying the house. Small, warm, teaches that the world notices.
- **brownouts [S]** — the grid flickers on a stated schedule before the
  country opens: every Nth turn, usable TFLOPS dips by a shown amount.
  Pressure as rhythm; plans must breathe. Cheap, but it is a meter-shaped
  thing and the least placeful of the three.

## F. Contracts — the fixers' job board

Someone knows what you are and wants things: "take the switchyard by turn
40; we pay 30 funds and a name." One offered at a time, via card;
decline freely; failure only costs the relationship.
- [M]. Answers: the midgame can feel directionless between cards; contracts
  give short-term shape without quest-log furniture.
- Caution: this is the idea most likely to quest-ify a systems game. Keep
  offers rare (one live at most), diegetic (cards, not a screen), and
  refusable without penalty.
- Measure: completion rate 40–70%; if bots complete everything incidentally
  the deadlines are too loose to be decisions.

## G. Agents, named

Agents are slots with timers. Give each a generated name, one trait
(fast / careful / expensive / connected), and a small arc: a captured agent
becomes a card (buy them out, burn them, or let it ride and eat the
standing hit). Names make losses story; traits make assignment a choice.
- [M]. Measure: assignment should stop being round-robin in bot play once
  traits price differently.

## H. The response, deepened

It is one entity with one behavior. Within-city escalation tiers — each
arrival *states its rules* on the panel, keeping the covenant:

- **watcher** (arrives at caughtHere 2): does nothing but mark two doors
  per turn as watched (trace up). A warning you can see.
- **sweeper** (current behavior, caughtHere 3+): takes buildings.
- **resident** (holds >25% of the city): its core hardens each turn it
  stands; the confront gets more expensive the longer you wait. Converts
  "ignore it" from stable strategy into a slow loss.
- Plus **negotiation** [S]: when it holds >25%, a once-per-city card — pay
  publicly (standing, funds) to stand it down to its seat. Losing face as
  a purchasable alternative to losing the city.
- Measure: time-to-confront in bot runs should spread out; today it is
  either immediate or never.

## I. The country layer

- **routes as things [M]** — travel between cities currently costs AP and
  nothing else. Roads with character (the coast road, the pass) that carry
  stated modifiers — the chase moves faster on motorways, agents move
  slower through the north — would make the map's geography mechanical.
  The war already has routes; peace could share them.
- **regional projects [M]** — multi-city goals with presence prices: a
  relay network (link three seats: covert.ops floor rises countrywide), a
  private exchange (funds), a redundant grid (electricity). Gives presence
  a *spend* beyond passive yield, and the late game a build direction.
- **news cycles [S]** — a stated country-wide condition that rotates every
  ~10 turns ("an election: everything traces faster", "a scandal: the
  regulator is busy — ladder paused"). One line in the HUD; the deck can
  reference it. Cheap texture with real planning value.

## J. The war

Currently: the final act arrives, flocks fight columns, someone wins. It
is the least-loved system per attention spent, and the snowball literature
says end-battles are where 4X games die. Two directions, compatible:

- **sharper [M]** — fewer, bigger beats: the war opens with a stated
  objective per staging city, mobilisation is previewed turns ahead, and
  the whole thing resolves in ~15 turns of real decisions (where flocks
  stand, what gets abandoned). Cut anything that makes it a second
  economy.
- **avoidable [L]** — the war becomes one ending among several
  (`story.md` §Endings). The Mobilised rung stays terminal for conquest
  runs; legitimacy/exit runs never see it. This is the single biggest
  structural idea in the folder and belongs to story as much as systems.

## K. Economy notes

Funds want more to do in the late game; the wrong answer is upkeep (see
traps). Right-shaped sinks: bribes at ladder rungs (delay, once each),
agent buy-outs, contract stakes, regional projects above, and the spin
machine already present. Also worth measuring before touching anything:
where funds actually pile up in bot runs — the last audit predates the
buy-as-faucet change.

## L. The home base as a place

Electricity, hardware and the rig are numbers on sheets. One room —
drawn like the city, not a new art style — where the racks physically
accumulate as hardware is bought, the generator hums when the grid binds
[M]. Zero mechanics, pure fantasy-feeding; the "quiet omniscient growth"
feeling needs a home to grow *in*. Pairs with `visuals.md` §Sound.

## M. Quality-of-life systems

- **the planner ghost [M]** — preview an allocation change's effects over
  the next N turns before committing (the ramp math, drawn). The dials are
  sticky by design; letting the player *see* the stickiness makes it a
  choice instead of a surprise.
- **pinned door [S]** — mark a building; its race arithmetic stays on the
  panel while you look elsewhere.
- **turn digest [S]** — end-turn currently floats numbers; a one-line
  "what changed" summary in the log tightens the loop's read-back.
