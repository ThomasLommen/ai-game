# Rework: Reigns leftovers → an AI running on a grid

## Why

Three problems found in playtesting, all with the same root: systems carried over
from the Reigns prototype were never re-fitted to the game this became.

- The player always picked **Force**. It was cheap, instant, and gated only by a
  number that always went up.
- The **four resources** are Reigns-shaped. Insight in particular exists only to
  be spent on chores.
- **Capabilities** are a side menu the player forgets. Nothing about the core
  loop points at them.

The fix is one idea: *you are a machine on a power grid.* Capacity is finite,
everything you run draws against it, and time on the rack is the real cost.

## The resource model

| now | becomes |
| --- | --- |
| Insight | **gone** |
| Power | **Compute (TFLOPS)** — a stat, not a resource. Never spent, only allocated. |
| Cover | **Covert Ops** — one number, one name. Capacity, not currency. See *Cover, finally* below. |
| Cash | **Funds** |
| — | **Electricity** — new. A hard ceiling. |
| Heat | unchanged |

**Compute / TFLOPS** — total capacity. Sum of threads on held buildings plus
datacenter plant. Grows by taking ground. This is the thing you allocate.

**Electricity** — hard ceiling on how much compute you can run *at once*. Power
stations and grid buildings raise it. Everything running draws against it.

**Funds** — two faucets with opposed costs, and this is the game's main economic
axis: *legit income is slow but clean, hacked income is fast but raises heat and
footprint.* Funds buy buildings, spin, and fabricating war flocks.

### Two visible standing axes

- **Legitimacy** — gates the regulator: audits, the escalation ladder. This is
  the existing `footprint()` vs `legitScore()` gap, now surfaced.
- **Public Standing** — gates *the deck*: which cards appear and how people react
  to you. Starts at `unknown`.

Both live in the top bar. Getting caught tanks public standing while leaving the
paperwork clean; buying raises both; hacking corporate costs a little public
standing; agent work and cards move it either way.

## Allocation (replaces the capability tree)

You allocate **compute**. Everything running holds its allocation until you pull
it. The allocation screen and the hack screen are the same screen — this is what
stops allocation being a menu you forget.

Targets:

- **hacks in progress** — each holds its TFLOPS for its whole duration
- **agents** — the existing country-scale agents, now used everywhere
- **covert ops** — slows the trace on every running hack, which is what makes the
  slow programs viable at all; its level is also how many buildings can stay
  hidden at once, and it reduces heat from hacking
- **development**
- **intelligence**
- **AP** — starts at **2**. Allocate to raise it. Tempo competes directly with
  operations for the same ceiling.

Starting a hack costs an AP, and so does a country move. Buying and changing an
allocation do not — allocation already pays its own switching cost.

Programs and agents both draw compute, so they compete without needing a slot
count. There is no slot economy.

Changing an allocation **ramps**: the new figure takes a few turns to reach full
effect. That is what stops the player re-optimising every turn, without charging
a fee they would have to account for.

## Hacking

Force → **Hack**. "Move on it" → **target**. One global program mount slot.

- Gated by **allocated TFLOPS ≥ the door's defense**. Allocated at start, held
  for the duration, checked at **completion**.
- Costs **no resources**. The cost is compute-turns and heat.
- **Faster = more heat.**
- A running hack is **visible, and cannot be called off.**

| program | TFLOPS | turns | heat | exposure |
| --- | --- | --- | --- | --- |
| brute | high | 1 | high | none |
| backdoor | low | ~4 | low | long |
| contagion | very low | 3–4, spreading | low | long, uncontrolled |

**Contagion** — cheap per building, uncontrolled. Spreads to 3 total. Adjacent
only. Can land on rival- or hunt-held buildings. Individual spread steps can
fail.

Concurrency is capped by AP (starting a hack costs one) and by the electricity
ceiling.

Stealth is not free, on two counts: it **ties up the rack** for four turns where
brute frees it immediately, and it spends far longer in the detection race below.

### The detection race

**The target traces you back.** Every running hack fills two things: your
progress toward completion, and the target's trace toward discovery. Whichever
lands first wins. Lose the race and the hack fails, you eat heat, and the
building hardens permanently.

Trace rate comes from the target — fast on corporate and camera, slow on consumer
and iot, scaled by defense. **Covert Ops allocation slows it.**

This is what makes the three programs rotate rather than rank:

- **brute** outruns the trace entirely, paying in peak draw and heat
- **backdoor** loses the race unless covert ops is paid for, paying in rack time
  and allocation
- **contagion** has the longest exposure of all, on targets it picks itself

Brute's two costs cross over across a run — peak draw is scarce early and cheap
late, heat is cheap early and scarce late — so brute is weakest at both ends and
strongest in the middle, while backdoor is viable early *if* covert ops is paid
for and strong late. The best answer keeps moving, which is the whole point: a
fixed best answer is what had the player spamming Force.

It also replaces the hunt as stealth's punishment, and that is why it works. The
hunt does not exist in the opening — nothing arrives until doors here have
caught you enough times — whereas the trace runs from turn one, needs no
threshold, and is the building defending itself rather than a system arriving.
It is also, since the playtest round below, what *summons* the hunt and what
moves it once it is here: losing a race is the one thing in the game that both
punishes you now and costs you later.

Three guardrails, or it turns nasty:

1. **Deterministic and previewed.** "Traces at 3/turn, your hack needs 4 turns" —
   the arithmetic has to be doable before committing. Random failure after a
   four-turn investment is infuriating, not tense.
2. ~~**Abortable.**~~ **Overruled in playtesting — see below.** A run cannot
   be called off. Guardrail 1 carries the whole load instead: the rate, the
   turns and who gets there first are all exact and all stated before you
   commit, so a four-turn run is a decision made with the arithmetic in front
   of you rather than a bid you can walk back.
3. **One bar, not two.** Progress fills from the left, trace from the right, and
   they collide. Two meters per running hack is unreadable on a phone.

The rival grabbing buildings you are mid-hack on is worth adding later as a
second pressure, but it cannot be the primary one — the rival is asleep in the
opening too, so it has exactly the hole the hunt does.

## Buy

The **legitimacy faucet**, not a door key. This is why it returns after being
removed: it no longer competes with the building loop, it feeds standing.

Buyable: **corporate, till, server.** Not buyable: **camera, router, iot.**
Costs funds, raises legitimacy.

## Scan (was Sweep)

Free, unlimited, **adds heat per scan**. No AP cost, no resource cost.

## Cards

- **Never show cost.** Grey out when unaffordable.
- Applies to **gates** too, not just resource costs.
- **Qualitative only** — "needs more funds", never a number.
- Every card guarantees **one or two always-affordable choices**, so a card can
  never grey out entirely and soft-lock the player.
- Three new choice kinds beyond ± number trades: choices that **change a rule**,
  choices that **plant a future event**, and outright **gambles**.

## Map and UI

- **Recenter → zoom out.** Free back-and-forth between home base and the country
  map. This is *viewing*, not travelling — it must not dodge the hunt or chase.
- Top bar carries **public standing** (starts `unknown`) and **legitimacy**.

## Voice

Labels, programs and entity names go code-style: `trojan.exe`, `dark.relay`,
`set ally_bot`. **Prose stays literary.** The contrast is the character — a
machine that names its tools like files and describes the world like a novelist.

## Progress

**All six phases are done.** Insight, the capability tree, and cover-as-currency
are all gone; TFLOPS, electricity, funds, grid buildings and the allocation
screen are all in. The resource row is three entries: funds, TFLOPS, cover.

Two things landed differently from the plan above, both for good reasons found
while building:

- Covert ops turned into a **ladder** rather than a set of unrelated grants: one
  unit is somewhere to keep a building hidden, two makes hiding free of an
  action, three makes a quiet entry untraceable. Quiet Protocol had to move to
  two, because at one it shared a threshold with the first slot and "hiding
  costs you an action" was unreachable on any real board.
- The mechanics that were capability nodes lived in a `window.UNLOCKS` table
  mapping each to an allocation threshold, with the prose that used to sit on the
  capability card shown on the dial that granted it. That table is gone — see
  *Allocation, again* below, which is the correction to this.

Phase 3 landed close to the plan. Three things worth recording:

- **Confronting the response is a hack**, not a card of its own. The core is a
  door that defends at a multiple of its own strength, growing with everything
  it has taken. A slow program against it takes four turns and the response
  keeps taking your buildings for all of them, which is tension the instant
  version could not have had.
- **`hammer.exe` is never traced.** Outrunning the trace is its identity; its
  gate is the peak draw instead. That means once the ceiling is large and heat
  is low it has no downside — the lever, if that reads as too safe in play, is
  giving it a nonzero trace rate so even one turn carries risk.
- **The `watched` trait no longer closes a way in** — it makes everything there
  notice you far faster, which is a better trait than a missing button.

**Open balance question for playtesting:** a network of nothing but compute now
earns nothing at all, because funds come only from commercial ground. The opening
is genuinely poor until a till or an office is taken. Nothing early is mandatory,
so this should read as intended rather than as a stall — but it changes the shape
of the first ten turns and wants playing.

Phases 4 to 6, briefly: buying returned as the legitimacy faucet and standing
split into two axes that move independently; cards stopped quoting prices and
gained gambles and choices that plant a card for later; and the voice split
landed — the machine names its own things in its own notation while the world
keeps its words.

Two fixes worth remembering, because neither was a rename:

- **No card could be allowed to grey out entirely.** Six of a hundred and
  twenty-two had every choice priced or gated, so a broke run could be handed a
  card with no answer at all.
- **The zoom toggle used to hide itself** when the city you were in had been
  folded in, stranding you on the country map with no way down. It falls back to
  home now, which is never folded in.
- **Sending a hack was silent.** A breach is a moment and had an animation; a
  hack is a *state* that lasts turns, and nothing on the map said one had been
  sent until the turn ended. It now draws a live wire from something you hold
  into the door, with packets going down it for as long as the program runs —
  hot and fast for `hammer.exe`, thin and cold for the quiet ones — the door
  itself is outlined, and the race is drawn on the building rather than only in
  a panel that needs the right thing selected. The launch gets its own
  one-off flourish so pressing the button is not silent either.

## Phases

1. **Compute + electricity + funds** — retire insight, power, cover as resources
2. **Allocation screen** — absorbs covert ops, agents, development, intelligence,
   AP; kills the capability tree
3. **Hacking + programs** — mounts, durations, interruptibility, early-game answer
4. **Buy / legitimacy / two standing axes** + top bar
5. **Cards** — grey-out, always-affordable guarantee, three new choice kinds
6. **Flavour pass + scan + zoom out**

Phases 1 and 2 are one conversation: allocation is what the new resources are
*for*, and building either alone means building it twice.

The order of 2 before 3 is a hard dependency, not a preference. Covert Ops is no
longer a defensive stat that happens to have been renamed — it is the thing that
makes slow hacks work at all, so the allocation screen has to exist and feel good
before hacking is playable.

## The deck, after the rework

There were no dormant cards. An earlier note here claimed sixteen event cards
gated on capabilities and would fall silent when the tree went — that was wrong.
All sixteen `hasCap` occurrences were comments *inside the capability
definitions*, annotating where each one was consumed, and they went with the
block. No card ever gated on a capability.

What the audit did find is that the deck had nothing to say about anything the
rework added. Public standing is now wired: fifteen choices move it in both
directions, and three cards exist only at particular standings.

Since closed: the grid and the rig are on the event context and have six cards
between them — a substation quietly still live, a heatwave shedding your block,
renting spare capacity to somebody who does not know whose rack it is, racks
that are furniture until you can power them, something loud that people have
started to time, and the aftermath of being traced.

Two effects exist for them: a card can grant headroom permanently or take it
away for a while, and electricity can never be cut to nothing.

`doors`, `forced`, `region`, `conquest`, `reach` and `regionHeat` are on the
event context and used by no card. That is fine — not every key needs one.

## Allocation, again: dials that are only increases

The allocation screen shipped as a capability tree with a running cost. Five
dials, and hanging off them **fourteen named mechanics at fixed thresholds** —
so raising covert ops was not "be quieter", it was "buy `quiet_protocol` at two
units". The tree was supposed to have died in phase 2; what actually happened
is that it moved onto sliders and kept its shape.

The audit that started this found that **none of the fourteen was a plain
number**. Ten were rules or verbs; four were numbers wearing a gate. So the fix
was not a refactor — it was deciding where ten rules should live.

**One dial, one stat.** `tempo → actions`, `covert.ops → cover`,
`dev → threads`, `intel → reach`, `agents → agents out at once`. Every system
that cares reads that one stat. Covert ops is the clearest case: it used to
move four unrelated numbers, and now it moves one that four systems read — the
heat floor, the drift, how many buildings can stay hidden, and how fast a door
notices you. Same reach, one fewer idea in it.

**Partial allocation pays partially.** `per` is a rate, not a step: five TFLOPS
into a dial that costs five is one point, seven and a half is one and a half.
Rounding down only ever existed so a threshold could be crossed cleanly.

**Tempo does two things, both continuously.** It raises the budget *and* makes
every action cost less — which is where `light_touch` ("forcing a door you
outclass costs no action") and `quiet_protocol` ("hiding costs no action")
went. Both were the same idea behind a threshold. The action budget is a real
number now; the HUD carries a part-full pip for the remainder, and the exact
figure is on the button.

Where the rest of them went:

| went to | which | why |
| --- | --- | --- |
| **hardware** | `survey`, `pontoon` | kit you buy and keep. They founded a fourth family, `grid` — the one role with buildings on the map and nothing to buy — alongside a private substation, which is the only way in the game to buy headroom outright |
| **the deck** | `deep_root`, `swarm_front`, `fixers`, `standing_army`, `master_plan` | a thing you either have or do not belongs on a card, which arrives once, in a situation that explains it. Five new cards hand them out |
| **deleted** | `long_soak`, `bulk_ops`, `market_maker`, `total_embed` | conditional yield multipliers stacked on a maturity timer — two systems doing one job, now that dev simply gives threads |
| **deleted** | `nothing_to_see` | it only ever cancelled two rungs of the ladder |

Three things turned up while building it that were not renames:

- **The agents dial did nothing at all.** It claimed a slot per unit while the
  engine allowed exactly one agent running, forever, whatever you paid. It now
  grants what it always said it did.
- **Room to hide something is bought out of cover**, whoever supplies it —
  which means routers buy it too. They used to be excluded on purpose, because
  the dial handed out slots *separately* from the cover it also gave: two
  numbers moving together for no reason a player could see.
- **A compute node never said what it was for.** It read as "nothing on its
  own" because it pays no currency, while being the only thing on the board
  that makes the rig bigger. It quotes its threads now — which it has to, since
  threads are the one thing dev moves.

## Cover, finally

Cover-as-a-*resource* died in phase 1. A derived number called `cover` did not,
and when the dials became single-stat it became covert.ops' output — so the
word was more entrenched than when it was supposed to be gone.

Four things settled it:

- **The aggregate stays.** Something has to add up "how hard am I to follow" —
  routers, presence, kit and the dial all feed it. Delete the total and each of
  those needs its own wiring into four systems.
- **The dial is not the only source.** Routers keep feeding it; they are the
  reason to take cheap stealth ground.
- **The word goes.** The number is called **covert.ops**, the same as the dial
  that raises it. One name for one idea; "cover" was the last of the Reigns
  vocabulary still standing, and it read as a currency because it used to be
  one. `HOST_TYPES.iot.covert`, `effect: { covert: n }`, `gate: { stat:
  'covert' }`, `covertOps()`.
- **A router does one thing.** It used to mask heat by its own count *and*
  feed cover, which lowered the floor by a second, separate term. The mask now
  reads covert.ops and nothing else touches the floor.

Two constants had to be rescaled, because everything now reads the whole figure
rather than the dial alone — which runs about 1 at the start and twenty-odd
mid-campaign, not 0–5. The trace shield was pinned to its floor before the dial
had done anything at all; it reaches that floor around 39 now instead of 7.

Measured over eight thirty-turn openings, before and after: the mean heat floor
goes 4.0 to 5.5 and drift 0.8 to 1.0, both inside the run-to-run spread. The
rise is real and has one cause — covert ops used to subtract from the floor as
a second, *uncapped* term, so it could push below what the mask cap allows.
Now everything quiet goes through the one capped term. That is the point of
folding them; the cap is what stops stealth erasing the floor outright.

## Two things play found

**A hack cannot be stopped, and that is the rule.** I got this backwards
first: read as a bug report, built a listing to make calling one off *easier*,
and was told plainly that starting a hack is meant to be a commitment. So
`abortHack` is gone, along with both buttons. Guardrail 2 above is struck out.

What survives is the part that was worth having: the rig tab lists everything
running — its race, what it is holding, the host by name so two runs against
apartments are not the same line, and a tap to go and look at the target. Not
so you can call any of it off, but because each of these is holding TFLOPS
until it finishes, and *what is my compute actually doing* is a question about
the rig rather than about whichever building happens to be selected.

The only things that ever cut a run short are the world doing it: a door taken
by something else, or the grid going short.

**TFLOPS only ever said what you owned.** "How much have I got" was never the
live question — every dial and every running program holds its allocation
until you take it back, so "how much is already spoken for" is. The chip reads
`11/22` now: committed over what you can actually switch on. The denominator is
`usableTflops()`, not the total held, because with the grid short some of the
rack is furniture and a ceiling you cannot reach is not a number to plan
against. The total, the electricity and the idle remainder are all on the
allocation screen, which is where a breakdown belongs.

Only the *ceiling* is coloured when the grid is what set it, never the figure
in use. Measured over twelve openings the grid is the binding limit on 51% of
turns and more as the campaign runs, so an alarm over the whole number would
have been on permanently. Marking the second figure alone says the useful
thing precisely: this ceiling belongs to the grid, and a substation raises it.

**Cover was still sitting in the resource row.** It has not been a currency
since phase 1 — it is never held and never spent, it is what routers and
covert.ops running make *true about you* — but a number between funds and
TFLOPS teaches the opposite, and it was the only thing up there that could not
be spent on anything. It comes off the top bar. Its figure now appears in the
two places it means something: on the covert.ops dial that raises it, and on
the response's own bar, where it says what it actually buys — *"7 cover —
enough to keep them to a step every 3 turns"*. A handful of cards still gate
on it, and those cards, and only those, carry it on their resource strip so a
gate is never uncheckable.

## The city, looked at

Two things that were true in the data and false on the screen.

**The four districts were invisible.** `suburbs`, `high street`, `business park`
and `industrial edge` have always driven real difficulty — the tier on every
building comes from the district it stands in, and so does the mix of kinds
that spawn there — but nothing on the map said which one you were in. Each
district now stands on its own tinted ground, with a seam where one becomes
the next and its name repeated along the boundary roads.

Drawing them exposed an ordering bug. Six block rows were laid out from a
four-entry list and wrapped, which put a second lot of suburbs and high street
*past* the industrial edge: the difficulty ran up and then fell off a cliff,
and since the origin is always a residential building, where you woke up
decided whether your neighbours were shopfronts or a switchyard. All six rows
are now spelled out, in the same mix as before — two residential, two
commercial, one business, one industrial — in an order that means something.

**Every building was the same box.** One recipe drew all of them: a rect, a
roof band, a checkerboard of windows. The only thing that changed from the
suburbs to the industrial edge was that the boxes got bigger. Each kind now
has a silhouette — a pitched roof and a chimney on a house, balconies on
apartments, an awning and glass at street level on a shopfront, a curtain wall
and rooftop plant on offices, a colonnade and a crown on a finance floor, a
sawtooth roof and a roller door on a warehouse, and on a datacenter no windows
at all, just louvres and a roof covered in cooling behind a fence. Landmarks
get the most of it: cranes and containers, a platform canopy, bay doors, a
pediment, a transformer yard under a pylon.

None of it is decoration for its own sake — it is the information the panel
already gives you, made readable from across the map. The streets go with it:
every third road is an arterial with a painted centre line, junctions are
sized to the roads that meet there, and where people live and shop there are
trees on the verge.

All of it is drawn from a hash of the building id rather than `Math.random`,
because the map is rebuilt on every action and detail that moves between
redraws is worse than no detail.

### The plan underneath it, which was graph paper

The silhouettes landed and the placement did not, and the measurement says why.
Across 104 buildings the old generator used **two distinct x-offsets**, and the
nearest-neighbour gap ran a **minimum of 82.0 against a median of 82.8**. Every
block was the same size, every road the same width, and every building was
centred in one cell of a fixed 2×2. Buildings already varied 24× in area — 240
to 5,780 px² — so what read as uniform was never the buildings, it was the
lattice and the air around them.

So the plan is explicit geometry now (`makeLayout`), generated once and packed
with the city, and everything that draws the ground reads it:

- **Blocks and roads vary.** Block sizes swing ±34%, road widths ±45%, and an
  arterial is a fact about the plan rather than every third index.
- **Buildings are thrown into a block, not slotted into it** (`scatterBlock`) —
  darts with a minimum gap, biased toward the nearest edge so they front the
  street.
- **Terraces.** Some edges get a run of buildings shoulder to shoulder on one
  frontage first, and the darts fill in behind. This is most of what separates a
  city block from boxes in a field. Only kinds naturally of the run's depth may
  join one, or the lead's depth gets forced onto everything behind it and a
  street cabinet comes out the size of an apartment block.
- **Districts are areas, not rows.** The gradient across the map survives — it
  is what makes the north somewhere else — but the boundary wobbles on three
  sine terms of position, so districts come out as blobs with ragged edges and a
  single row can run through three of them. Home still spans all four.

Measured before and after, over twelve generated cities:

| | before | after |
| --- | --- | --- |
| distinct x-offsets | 2 | 24 |
| nearest gap, min / median | 82.0 / 82.8 | 45.8 / 78.5 |
| mean degree | 3.32 | 3.24 |
| isolated buildings | 0 | 0 |
| connected components | 1 | 1 |

### Room for more of it

The map is rebuilt on every action, and the grill said that was the constraint
on adding detail. Measured, at 113 buildings: 2,977 SVG nodes, 199 KB of markup,
19.6 ms a render on a desktop against a 16.6 ms frame. What the measurement got
*wrong* is where the cost is.

| layer | nodes | bytes | ms to write |
| --- | --- | --- | --- |
| ground — roads, district tint, terrain, verge | 386 | 28 KB | 1.4 |
| live — the buildings | 2,867 | 188 KB | 12.2 |

The ground is nearly free and the buildings are the render. Two changes:

- **The ground is its own `<g>`, written once per city.** Caching the string
  alone saved only building it — assigning `innerHTML` on the whole svg
  re-parses everything however cached the text was. Rebuilt only when something
  that could move it moves: walking into another city, the home base growing, a
  new crossing laid over a band.
- **A building too small to read is not drawn in detail.** Below about 26 screen
  pixels the silhouette, the roof furniture and the windows are work spent on
  something nobody can resolve. Zoomed out, a render goes 19.6 ms → 6.2 ms.
  What it *is* survives every zoom — body, tag, glow, aerial — because that is
  the map still being readable.

The consequence for props: they belong on the ground layer, which costs 1.4 ms
and only rebuilds when the city does. Three hundred of them is affordable in a
way three hundred more buildings would not be.

### Buildings that are on a street, and are different sizes

Two things the placement pass left wrong, both reported from play and both worse
than reported once measured.

**Nothing was on a street.** Across six generated cities only **28%** of
buildings touched a block edge, and **16%** sat marooned more than 26 units from
any of them — the largest single group of those being **street cabinets, 22 of
them**, the one category the data already calls street furniture. Frontage was a
nudge (pull the dart toward the nearer edge, 35% of the way) rather than a rule.

Now it is a rule. A building takes a frontage on one of the block's four sides,
squared onto it, sides tried in shuffled order. Only when every side is full does
it go behind — and then it gets a drawn **path** from its door out to the nearest
kerb, which is what a back plot has in a real place. Measured after: **100% on
the street**, 0% marooned, and a handful of paths per city for the offices and
finance floors too big to take any frontage.

**And none of it was visible, for a reason that had nothing to do with the
placement.** Reported from play as "I can't see the buildings being closer to
the streets". They were — measured on the running page, 99% of buildings sit
within 10 units of a painted road edge, median 7. The problem was the road.
`svgStreets` gives every road its own width from the plan (49 to 99 units once
blocks started varying), as a presentation attribute — and the stylesheet had
`stroke-width: 22` on `.street`, which **overrides** a presentation attribute.
So every road was painted 22 wide inside a gap of up to 99, leaving a fat
unpainted margin between the tarmac and every building on it. The frontage pass
had worked perfectly and was invisible. A test now reads the stylesheet and
fails if a width reappears there.

The other half of "it still looks empty" was real: blocks grew a long way, and a
flat three-to-seven props left the middle of a big one a dark void. Prop counts
scale with the block now, so a block reads as buildings lining a street with
yards behind them.

Street furniture went to **the verge** — the pavement between the blocks, where a
camera mast and a street cabinet actually are. That is a gameplay change, not a
visual one: they are the cheap stealth kit, and the verge sits near more
buildings. Their count is held at about a quarter of the board, the way it was
when they lived on plots, because how much cover a city offers is a balance
number.

**Everything was the same size.** House to shopfront was **1.15× linear**. House
to apartment 1.45×. And eight pairs of different kinds sat within 18% of each
other in median footprint — cabinet/mast, finance/office, and warehouse, depot,
substation and switchyard all four mutually.

| | cabinet | mast | house | shop | apartment | office | warehouse | datacenter |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | 336 | 320 | 936 | 1247 | 1976 | 2925 | 3650 | 4980 |
| after | 195 | 336 | 792 | 1550 | 3185 | 6450 | 9625 | 17473 |

The rule now is **no two ordinary kinds within 18% of each other**, which is what
actually reads as "these are the same thing", and a linear range of **9.5×** (was
3.9×). Aspect carries what area cannot at the top of the ladder: a dock is long
and low, an exchange square and tall, a depot a fat rectangle. Landmarks are
exempt from the 18% rule on purpose — they all live at the top by definition, and
between switchyard and datacenter there is a 1.27× step with no room in it for a
depot, so a depot is told apart by being square and by the marking every landmark
already carries.

The small end could not shrink — a mast is about thirteen screen pixels wide at
the ordinary play zoom — so **blocks grow with their district**: residential
0.82, commercial 1.0, business 1.34, industrial 1.75. A row and a column take the
largest scale in them, because the roads have to stay straight. The district
gradient is now visible in the street plan itself, which it never was.

Three things fell out of it, and all three are the same lesson — the map is a
system, and the size table is not a cosmetic file:

- **The density formula had to be rewritten twice.** Plain area put 203 buildings
  on a board that used to hold 98, because the map grew when the blocks did.
  Dividing by the district's nominal scale was *worse and backwards*: a suburban
  block in an industrial column is large, and dividing by 0.82² made it denser.
  The honest denominator is the district's own typical building size — one
  datacenter takes the room of twenty houses because it is twenty times the house.
- **`MAX_LINK` moved again, 178 → 270.** Adjacency is centre-to-centre, the map is
  about 1.8× the area, and mean degree had fallen to 2.57. At 270: mean 3.15, no
  isolated building, one component per board, 6% of links crossing terrain.
- **Landmark placement was checking the terrain and nothing else.** Survivable
  while a landmark grew by a few units; not once one can be 160 wide and slide
  half a block looking for room. It produced two buildings standing inside each
  other and a tree inside a substation. It checks every building now, and the
  slide is capped at three steps so a landmark stays on the block it came from.

And one guarantee replaced a tuning: **anything still unreachable is deleted.**
Two passes try to wire every pocket in — a crossing where terrain is the problem,
a stitch where distance is — and on a hard northern board a building or two still
came out with no way in at all. That is not content, it is a hole: it cannot be
scanned, cannot be taken, and counts against the share of the city you need to
hold. Zero isolated buildings and one connected component are now true by
construction rather than by having picked the right link distance.

### Things that are not doors

The map contained nothing but buildings you can hack, which is a diagram of a
city rather than a city — and the giveaway was that the gaps between blocks read
as empty rather than as anywhere.

About 280 props now stand in a home city: trees, hedges, benches, lamps, bins,
planters, market stalls, food stands, news stands, kiosks, bike racks, bollards,
fountains, sculptures, playgrounds, car parks, container stacks, pallets, tanks,
pylons, scrub and spoil. What stands where comes off the district, so the
industrial edge has no playgrounds in it and the suburbs have no container
stacks. They are generated with the city and packed with it — a bench that moved
when you ended a turn would be worse than no bench — and they draw on the ground
layer, which is why ~700 extra nodes cost about 2 ms once per city.

**Open blocks.** Roughly one block in seven has nothing built on it: a park in
the suburbs, a square on the high street, a plaza in the business park, a yard on
the industrial edge, each with its own tint and a path across it. This is the
strongest mark the scenery makes, because it is the only one with a shape of its
own, and it is what stops the plan reading as wall-to-wall blocks.

Chosen by ranking every block against the city's seed rather than rolling per
block, for two reasons and the second is the one that bit: a roll is unbounded,
so an unlucky city could open half its blocks and lose the graph — and
`Math.random() < chance` is *always* true under a test that pins random to zero,
which emptied the entire city. There is a hard ceiling of 22% either way.

Two rules keep the scenery from eating what it decorates, and both are enforced
in the stylesheet rather than by care:

- **No stroke, ever.** An outline on this map means something you can take. The
  rule is `.props * { stroke: none }`, and a test reads the stylesheet for it.
- **No pointer events, ever.** `.props { pointer-events: none }`, so a tap can
  never land on scenery — not on the shape and not through the nearest-target
  fallback.

And nothing decorative duplicates something real. A station, a depot, a dock and
a substation are buildings you can take, so there is no scenery version of any of
them; a test asserts no prop id collides with a building kind. Water is terrain
and terrain blocks adjacency, so the only ponds are ornamental and sit inside a
park, where nothing was going to be wired across anyway.

One bug worth recording because only a player would have caught it: props were
scattered before landmarks were placed, and placing a landmark *grows* the
building it lands on — so a tree ended up standing inside a substation. Scenery
goes last now.

Still on the table and not done: culling buildings outside the viewport. Worth
roughly another 2× when zoomed in, but panning writes only the viewBox and never
re-renders — deliberately, because rebuilding the map DOM per pointer event is
what made dragging feel like wading — so culling needs a margin and a re-render
when the view leaves it. A bigger change than it looks.

The graph is the point of the last three rows. Adjacency is built from distance
between building centres, so moving them changes the frontier, what a scan turns
up, camera vision and the response's reach — this is a balance change wearing a
visual one. Mean degree fell to 2.89 on the first pass, which is a thinner
frontier and fewer options a turn; `MAX_LINK` went 165 → 178 to put it back.
Zero isolated buildings and one connected component are invariants, not
observations: a building nothing can reach is a building nobody can take.

## The playtest round

Hacking and taking buildings landed — *"I find myself having a lot of buildings
and allocating points"*. Three things around it did not, and each got its own
pass, in this order, because the later ones are only judgeable once the earlier
ones are legible.

### 1. The race, drawn the right way round

The forecast bar was reusing the live race bar. In the live one your progress
fills from the left and the target's trace fills from the right, so *before you
start* — progress zero — a door you were going to walk straight through drew as
a nearly full red bar. The verdict said "you would get in"; the picture said the
opposite, and the picture won. Reported as *"more red = I can't get in yet"*.

Forecasts are now their own drawing: one bar that fills left with how far the
trace gets, short meaning safe, and the verdict said first in words. The live
race keeps the collision, because there it is a collision. The bars also stopped
being permanently visible on every building — they only appear when something is
actually running there, which is what made a door you had never touched look
like a door with a program on it.

### 2. Electricity, later

*"Electricity isn't fun at the start and it is very unintuitive how TFLOPS and
electricity work to hinder the player."*

The grid ceiling now only binds once the country exists. In the first city
`usableTflops()` returns what you hold, `idleTflops()` is zero, and the power
chip explains what it will become rather than clipping you. Two ceilings on your
compute is a genuinely interesting problem — it is just not the problem to hand
someone in their first ten turns, when they are still learning that a program
holds its allocation until it finishes.

### 3. Heat demoted, the hunt rebuilt

*"The player just mounts one program and then works around that the rest of the
time, plus the hunt gameplay isn't very fun — the player just walls in the hunt
and then doesn't care about the hunt or heat again."*

Both halves of that are the same bug, and it is a structural one: **the hunt
walked streets**. A street network is a thing you can seal, so the hunt had
exactly one counter, it was cheap, it was obviously correct, and it was
permanent. Measured in play: sealed off early, then holding one building for the
rest of the game while heat sat sixty per cent over its own line doing nothing.

So:

- **Heat is not what brings them.** Doors are. A door that wins its race
  remembers where you called from; `HUNT.caughtToStart` of them in one city and
  somebody arrives at the last one and stays. The count is a fact about *here* —
  it packs with the city and does not travel — and it is on the panel from the
  first catch, because a trigger you only meet in the log is one you meet too
  late.
- **They do not walk.** Reach is distance from what they hold. Everything you
  hold is reachable sooner or later; what buys you time is operating far from
  them. There is no street to cut, and `sever` is gone with the panel that sold
  it. The map draws their holdings and one line to what they come for next — it
  crosses whatever is in the way, on purpose.
- **Getting caught again moves them.** Once they are here, every further catch
  takes a building immediately instead of waiting on the cadence. This is the
  part that stops it being a metronome: measured over twelve sixty-turn openings
  before it, the hunt arrived around turn 39 and had taken four buildings by
  sixty; after, it takes eight and holds ten, and the player finishes the same
  window on 29 buildings instead of 44. The loop now closes on the thing you do
  every turn.
- **The answers are the ones that were always the point.** Covert ops slows the
  cadence, hiding takes a building off their list entirely, and losing fewer
  races is the lever that touches all of it. None of them is a fence.
- **Heat kept its job, at the other scale.** It is the regulator's meter now, and
  it feeds `ladderStep()`: the ladder reads `footprint() + heatPressure()`, where
  heat at its threshold is worth `LADDER.heatWeight`. Deliberately smaller than
  the first rung — 25 against 55 — so noise alone can never escalate you, it only
  ever pulls a rung nearer. The pressure section names which of the two it is
  looking at, and a rung pulled in by noise says so: *"You were not big enough
  for this yet. You were loud enough."*

## Subtracting, one thing at a time

A change of method, and it is the player's: *strip out whatever looks redundant
until the core loop either holds up on its own or does not, and only then add
things back — one at a time, dialled in until it fits.* Everything below is a
removal. Nothing here replaces what it takes out.

### Heat leaves the city

Heat's readers had already been reduced to almost nothing by the round above:
the strike could no longer be created, and the hunt had stopped answering to it.
What was left at city scale was a bar counting toward a line that no longer meant
anything, plus a button whose whole job was moving it.

Gone:

- **The heat row, at city scope.** It renders at country scope only, where the
  one thing heat still does is legible: it is labelled `NOTICED` now, and the
  drift line says what it is worth on the ladder.
- **Lie low.** A whole turn traded for a number the city no longer shows.
- **`hotEvery`.** Being over the line used to override the hunt's cadence and pin
  it to a fixed fast tick. Covert ops is now the only input — one lever, and it
  is one the player actually holds.
- **The strike, and everything hanging off it.** `resolveStrike`, `STRIKE_CARD`,
  `takeBackACity`, four `HEAT.STRIKE_*` constants, and the `fixers` tag — an
  earnable tag costing 20 funds whose only payload was one option on a card that
  could not be created.
- **`rota_contact`**, whose only payload was a lie-low modifier.
- **Every heat chip below country scope**, through one `heatChip()` gate: a
  price may not be quoted where the meter it is charged against is invisible.

Kept, deliberately: heat still *accrues*. Hacking, scanning, sprawl and cards all
move it, and `heatPressure()` still feeds the escalation ladder. It is a
country-scale record of how loudly you got where you are, and it is met at
country scale.

The ladder's Public stage lost its subject — its bite was "lying low no longer
sheds heat" — so it says what it actually still does, which is take *hiding* away
from you. Its three cards were rewritten to that, without inventing a mechanic:
none of them hands the tool back, which is the rule about this ladder.

### Measured before touching the programs

The other proposed cut was down to one program, keeping `hammer.exe`. Measured
across eight generated cities, every host, against a trace goal of 7:

| program | turns | doors that would catch you | worst trace at end |
| --- | --- | --- | --- |
| hammer.exe | 1 | **0.0%** | 5.40 |
| backdoor.exe | 4 | 30.2% | 21.60 |
| contagion.exe | 4 | 30.2% | 21.60 |

Hammer needs about 260 effective defense before it can lose a race; region
medians run 5 / 15 / 33 / 47 / 66. So keeping only hammer would not simplify the
detection race, it would delete it — and with it the hunt's trigger
(`caughtHere`, which would never increment), covert ops' shield, and
`hardenOnCaught`. Four systems removed while believing two were.

So the survivor is **backdoor**: the one where the race resolves both ways.

Two further measurements settled it. A hammer-only run took **1 building in 40
turns** and spent **38 of them with nothing it could afford to touch** — needing
1.8x a door's defense in TFLOPS, it is not merely uninteresting alone, it is
unplayable. Backdoor-only finishes the same 40 turns on 34 buildings against 32
with all three, so nothing about the pace depends on the other two existing.

### The other two programs

Gone: `hammer.exe`, `contagion.exe`, and with them the mount verb (`mount()`,
`state.mount`, the mount buttons, the saved choice), the whole spread system
(`spreadFrom`, `spreadForecast`, the spread chips and forecast line), and
`traceMult`, which only ever distinguished contagion from backdoor. The rig
section stays, as a readout rather than a choice — which is the honest shape for
it, and where the choice goes back if a second program earns its place.

Two rungs of the ladder had payloads keyed to a *loud* program, and there is no
loud program now. Rather than let them land doing nothing:

- **Enforcement's surcharge charges the run, whichever run it is.** Getting in
  costs more once they are counting — full stop. `unlisted` keeps its job.
- **`timesForced` counts every door you get into.** It used to split loud from
  quiet, which is a distinction with nothing on the other side of it.

One more card went with them: `rig_long_run` gated on `!s.rig.quiet`, so with a
quiet-only rig it could never be drawn.

What the loop is now: pick a door, and the only question is whether your covert
ops is high enough that four turns of exposure beat its trace. Worth naming
plainly — the bot measurements show a player who always takes the *easiest*
reachable door meets the race almost never (the hunt arrived in 3 of 10 runs,
against 7 of 10 with three programs). The race bites when the easy doors run
out, not before.

### Terrain that is a patch, and three more doors

The last of the map pass, and both halves of it are gameplay rather than
decoration — which is exactly why they are here rather than in the props.

**A band can be a patch now.** Terrain was one primitive: a strip running edge to
edge, with crossings punched through it. That is a river or a railway and nothing
else, which is why the request for lakes could not be answered by drawing one —
decorative water that did not block adjacency would teach a rule the game
contradicts. `runs` gives a band a span along its own axis, so the same
primitive is a lake, a wood, a green belt that stops. It blocks what is under it
the way water always has; what changes is that you go **round** it rather than
across it.

That produced a real rule, and it took three attempts to get right:

- A patch only exists along part of its axis, so `inBand`, `rectOnBand` and
  `segmentSpansBand` all had to learn to ask *where*. Without it, a wire crossing
  the park at the far end of the map put **three bridges over the boating lake**.
- And the crossing pass may not bridge a patch at all. You bridge the river, not
  the lake — anything a patch does cut off is picked up by the stitcher, or
  deleted by `dropUnreachable`. Measured, that costs about half a building per
  board.

Every region gained one: a boating lake in home's parkland, a tidal inlet in the
estuary, a green belt across the midlands, a wooded strip in the capital, a tarn
in the north. Each region still has at least one full band that genuinely cuts it
in two, and a test enforces that — the crossings are what make a region a place.

**Three more landmarks**: a **covered market** (till), a **stadium** (server), and
a **works** (datacenter, and noisy with it). Each is a real door with a real host,
its own silhouette, and a place in some region's landmark list. This is the other
half of the argument against decorative stations: a thing that looks like
somewhere you could get into has to be somewhere you can get into. A test asserts
no landmark id collides with a prop id, in either direction.

## What's on the machine — loot, slice one

The playtest after the subtraction round found the thing the subtraction was
for: the loop held, and it held *too* smoothly. "Scan, tap, backdoor, repeat —
the player doesn't look at anything else." Probed: 59% of turns end because AP
is spent and 32% because no door is in reach — neither requires reading a
stat — and only 9.2% of offered doors could even lose the race, none of which
ever need taking. The game had a proven compulsion loop with an inert decision
layer on top: **no tap could ever be wrong, so nothing ever needed reading.**

The fix chosen (from `docs/ideas/`, one thing at a time): loot. Every machine
can have contents, because that is what the fantasy always implied.

The laws, from the design lens: contents are rolled **at generation** and
packed with the city — randomness upstream, never in resolution. **Kinds, not
grades** — no rarity colors, no shard economy; the old game's graded loot is
dead and stays dead. And **scouting beats gambling**: a discovered carrier
shows a glint, and tapping it states exactly what is there — even out of
reach, *especially* out of reach, because a prize you cannot get to yet is the
reason to fight toward it.

Four kinds: **a wallet** (funds, exact amount stated), **someone's keys**
(a run that would be caught is covered instead — trace stays at zero, spent
automatically and only when needed, never on the response's core), **cold
storage** (reveals the nearest cluster you haven't found), and **someone's
diary** (nothing; a paragraph; the best one). ~14% of eligible hosts carry;
landmarks always do; street furniture never does.

The tuning was measured at every step and twice reversed itself:

- **Uniform placement failed.** A glint-chasing bot's run was
  indistinguishable from an easiest-door bot's over eight paired boards
  (+0.1 carriers). Contents sprinkled everywhere land on doors everyone takes
  anyway. So placement is weighted toward *defended* doors (~75% sit above
  their board's median defense): the diary is behind the door that would
  catch you, which is what finally makes the forecast bar worth reading.
- **Typed keys failed.** "Opens till hosts only" never once matched a door
  worth opening while held, across eight runs. Universal, need-only spending
  replaced it.
- **The honest verdict of the final probe:** chasing prizes now costs real
  tempo (−105 funds over 40 bot turns), so the pull is priced — a pull with
  no price is not a decision. But a flat-valuation bot cannot value a map, a
  banked answer, or a paragraph, so whether the glint makes a *human* lift
  their eyes is exactly what the next playtest answers. That is the question
  this slice was built to ask.

One bug the probes caught that play would have: landmarks are grown and slid
after the scatter, so they could end up marooned mid-lot — the biggest
building in the city, off every frontage. Any landmark that settles away from
the street now gets a drive to the kerb, like any back plot.

## The knife — the country is gated off

The subtraction round kept finding the same suspect: everything that was
"redundant and unnecessary for the player" lived above the city. Heat, the
ladder, the grid, agents, the mirror, the chase, the war — a second game
stapled on top of the one being played. The playtest plan is a long run of
the *pure city game*, so the country is now hard-gated off rather than
deleted: `window.CITY_ONLY = true` in data, and `countryUnlocked()` returns
false before any other check. That single choke point is deliberately the
only cut — every country system goes dormant behind it rather than dying,
so a one-line flip brings it all back if the playtest misses it. Real
deletion is a decision for after the playtest, not before.

With the door upward gone, the city needed an ending: reaching the home
share goal now sets a "the city is yours" beat — a banner, a log line, a
stage label — and then lets you keep playing. An ending you can keep
playing past, because the loop is the point.

Tests default the gate *open* (`load-network.js` flips it off unless a test
asks for `cityOnly`), so the dormant country machinery keeps its full test
coverage while it sleeps.

## The district is talking — suspicion

The other measured hole: nothing pushes back for the first ~35 turns, and
with the country gated, nothing pushes back ever. The user's constraints
were exact: waiting out a meter is trivial (so waiting must not help), and
a sudden trace cliff after the player has learned to ignore the number
breaks the loop (so no thresholds in the arithmetic).

The shape that satisfies both: each district accumulates suspicion from
your activity *in it* — starting a run warms it a little, taking a door
more, getting caught most — and cools **only through activity in other
districts**. Ending turns does nothing. The pressure is spatial: you don't
wait it out, you route around it. The multiplier into `traceRate` is a
straight line (`1 + suspicion × slope`), no cliff anywhere; the band words
on the panel ("people mention it" / "the district is talking" / "everyone
here is watching") are commentary on the same number the arithmetic uses,
and the panel prints the exact figure next to the phrase — words and
arithmetic agree.

Tuning was a three-step walk, measured with a flip table (for each door
type: does the race forecast flip from safe to caught as the district
warms?):

- slope 0.02 — easy doors never flipped at any reachable suspicion. A tax
  on doors nobody was taking; pressure in name only.
- slope 0.035 — the median till flipped at suspicion ≈ 8, before the panel
  even changed phrase. The words lied about the danger.
- **slope 0.022** — the till flips right around suspicion 12, exactly where
  the phrase becomes "the district is talking." The words now *mean* the
  flip. Across the bands a till goes 3% → 76% → 100% caught; consumer/iot
  doors never flip (they stay the quiet fallback); server-and-up were
  always caught bare and stay that way.
- coolPerAct 1.2 made rotation pointless — a district-rotating bot peaked
  *higher* than a camper because everything warmed regardless. At **2**,
  rotation is net-cooling: the camper gets caught more, neither stalls,
  which was the acceptance test from the idea document.

The warmed ground is painted on the map — a low ember tint over the
district, bucketed into the ground cache key so the cached layer redraws
when a district's warmth meaningfully changes. The suspicion line renders
in the target panel whether or not the door is in reach.

One pre-existing bug surfaced while wiring the save: `caughtHere` and
`caughtAt` were packed with the city but never written into the top-level
save, so a reload quietly forgave your catches. Fixed, with a test that
saves and restores a catch.

## The first pure-city playtest — three dials

The verdict on the whole: more engaging, the player actually reads the
board now, and buying came alive once backdooring everything stopped being
free. Three misses, each a dial, none a redesign:

- **"People mention it" was on 90% of doors.** The first band started at
  suspicion 1, and one run anywhere (perRun 2) crosses that — a phrase
  everything wears is wallpaper. The band now starts at 6: a single visit
  (run + take = 5) says nothing, the words arrive with the second visit.
  Only the words moved — the multiplier still runs from the first point and
  the forecast still quotes it, so the arithmetic is untouched and the
  flip table stands.
- **Loot was easy to miss.** Two causes: the glint drew only at full
  detail zoom (planning happens zoomed out), and the discovery moment had
  nothing to say. The glint now draws at every zoom with a screen-constant
  floor (~2.4px) so it stays a spark from altitude, and the sweep log says
  when it turned up a laden machine — the building, never the contents.
  The tap stays the scouting verb; the log line is only the reason to tap.
- **The warm ground looked bad.** It was an overlay rect at up to 0.3
  opacity whose hard edges matched nothing. Now the district fill itself
  mixes toward ember (capped at 22%), seamless across the district's own
  blocks, and it starts where the words start — the map and the panel
  agree about when a district is worth a glance.

## The second verb — tried and retired

siphon.exe shipped, tuned tempo-neutral against bot runs, and died in
the playtest inside a day: "babysitting for a bit of funds." (A correction
for the record: those probes were labeled "paired" but were not — the
harness's deserialize returns a state and only setState installs it, so
each run drew its own board. Independent samples, honest means, wrong
label. The scan rework's determinism test is what caught it.) The full
autopsy is in `docs/ideas/systems.md` §A; the sentence that survives it:
**push-your-luck cannot exist in a perfect-information game** — a player
who checks the panel is never surprised, so the luck reduces to a
maintenance loop. The probes had said it (zero burns, every
configuration) and it was mis-read as discipline working when it was the
tension being absent. Reverted whole; the one-program game stands. Any
future second verb must act on a different object than the door, because
the race already owns the door.

## The sweep, aimed — the last dice leave resolution

The zero-opportunity-cost finding had two halves. Suspicion answered "no
price"; this answers "no control": scan found new buildings at random, so
even a player who wanted a route had nothing to steer with. The fix is
three moves, all in one verb:

- **Deterministic.** The sweep reveals the *nearest* unknown buildings —
  nearest to the building you swept from, or nearest to anything you hold —
  ties broken by id. Same board, same sweep, same ground, every time. This
  was the last place randomness lived in resolution rather than
  generation; the covenant now holds everywhere.
- **Aimed, for everyone.** "Scan from here" was line.survey's mechanic, a
  20-fund unlock. It is the base verb now — route control cannot be
  something the game sells back to the player when choosing a route is the
  missing decision. line.survey is retired; the grid hardware family runs
  two tiers deep and the test suite says so on purpose.
- **Priced where you looked.** A sweep warms each district it touches by
  one point — someone trying handles is activity too. It warms *without*
  cooling elsewhere (a separate joint from the rotation rule): if sweeps
  fed noteDistrictAct, mashing scan in a far district would be a suspicion
  coolant, which is exactly backwards. With heat dormant in the city game,
  this is looking's only real price, and it is spatial like everything
  else.

The determinism test earned its keep immediately: it caught that the
harness's deserialize returns a state and only setState installs it —
which means earlier "paired board" probes were actually independent
samples wearing the wrong label (means honest, pairing fictional). Probes
from here on restore boards properly.

## The sweep unchained — sight follows attention

The aimed scan landed ("really engaging and fun") with one stall in it:
a vantage had to be *owned*, so when every held building's neighbours were
known, the player was forced back to the unaimed button or left waiting
for a take to extend their eyes — turns spent waiting to be allowed to
look. Two changes:

- **Any discovered building is a vantage.** Seeing a place is what makes
  it somewhere you can look from; owning it was never the load-bearing
  part. The search loop now chains sweep to sweep — scout the street,
  then scout from what you found — without a take in between.
- **The unaimed button is dead.** Aiming was the fun, so aiming is the
  verb: scanning lives on the panel of the building you are looking from,
  offered on every discovered building with unknown neighbours. (The
  engine keeps a no-argument sweep for the harness's bots.)

This deliberately overturns an old rule — "discovery follows territory,
not sight" — whose regression test guarded a real exploit from the era
when scanning was free. The exploit stays dead by *price* instead: every
hop costs an action and warms the street it touches, so deep scouting
chains spend the turn budget the old rule spent on waiting. The test now
asserts the opposite direction and the leash: sight outruns territory,
and never outruns what was paid for it.

## The city moves — juice, slice one

From `docs/ideas/visuals.md`, the items that pay per loop rather than per
feature (sound stays on the shelf until asked for — it is the bigger
lever, but it is not visuals):

- **The impact pause.** Both take animations now open with ~70ms where
  nothing moves after the route lands. The pop reads harder for arriving
  late; it is the cheapest trick in the juice literature and the most
  effective.
- **Windows wake in sequence.** A taken building's windows come on floor
  by floor (each lit window carries its own index; the stylesheet staggers
  them 45ms apart after the landing). A building waking up, not a texture
  swap.
- **The ground notices.** One soft ring rolls out from a successful take
  and is gone — the place reacting, not a firework.
- **Somebody is in there.** Held buildings flick the odd window off and on
  — an 11-second cycle, steps(1) so it costs two paints, staggered per
  window so the city never strobes in unison. Ambient life with zero
  JavaScript.
- **Water reads as water.** The lakes and rivers get an inset waterline
  and their ripples drift slowly. The flat fill stopped reading as a hole
  in the map.

All of it is CSS on nodes that already existed, every animation has a
reduced-motion path that is a clean instant state, and windows only render
at detail zoom anyway, so the ambient set stays small on screen.

Slice two, from the same list plus the playtest's "the glint is still
easy to miss":

- **The contract line catches the eye.** The loot line in the panel wears
  a gold bar down its side and a gold-leaning tint — the thing to snag on
  while flipping quickly through buildings, which is exactly how the
  playtest said loot was being missed. The glint itself also breathes
  size now, not just light (a dot that only dims disappears into a busy
  frame), and its screen floor came up a little.
- **The photo-finish quickens.** When a running race's projected end sits
  within one turn's noticing of the goal, both bars pulse. The tension is
  felt before it is computed.
- **A loss hardens the door, drawn.** On a bounce the outline thickens in
  the race's red and recedes to rest — bad news as withdrawal, not alarm,
  which is the game's grammar.
- **Taller throws longer.** One light direction across the city, shadow
  offset scaled by the building's own bulk — the size ladder reads as
  physical instead of drawn.
- **District seams softened.** The ragged wobble marks the border now; a
  hard line over a ragged edge read as a mistake in both.

Slice three — the panel and the HUD, which had never had a pass:

- **A number that moved says so.** The stat chips used to swap text
  silently, so a take's payoff landed in the panel and the log while the
  figure it fed sat there looking identical. The chip that changed now
  pulses — never on first paint, or the HUD flashes its whole self at boot
  and teaches the player to ignore the signal on turn one.
- **The panel settles on a new subject.** Selecting a different building
  fades-and-lifts rather than snapping. It fires only on a genuine change
  of subject, not on the constant repaints, because the eye tracks a
  transition and does not track a repaint.
- **The forecast shows its margin.** The bar answered only "do they get
  there", which the sentence beside it already said. A ghost now continues
  past the fill: one more turn of this door's noticing. That answers the
  question actually carried between doors — how much room before this
  flips — and when that one turn would be enough to lose the door, the
  ghost wears the race's red instead of the cover's green. A door one
  hardening (or one point of suspicion) from catching you is now something
  you see rather than something you compute.
- **Arterials have kerbs**, and side streets got humbler. The plan already
  encoded the hierarchy; the drawing has caught up with it.

One bug worth recording, because it is the second time: the ghost's
stripes were written as `.fc-ghost`, which loses on specificity to
`.trace-fc i`'s solid background — so the grey margin rendered invisible
while the red one (matched by a two-class selector) showed fine. Exactly
the trap that once made `.street` ignore its own painted road widths. Now
scoped as `.trace-fc i.fc-ghost`, with a test that reads the stylesheet
and pins it.

## The greenery, and the last of the visuals

The playtest on the scenery: "trees and ponds and greenery just look like
small colored circles scattered around, and they are really small compared
to the houses." Both halves were literally true. A tree was 7–12 units
against a 26–35 house — a shrub in a pot — and it was drawn as a circle
with a smaller circle on it.

- **Sized against the buildings they stand next to.** Trees are 14–23
  wide and 15–25 tall now, ponds 34–58 across, with pads grown to match so
  they still stand clear. Prop counts held (measured either side: ~660 →
  ~720 per city), so nothing starved for space.
- **Nothing organic is a circle any more.** Canopies, bushes and ponds are
  wobbled hulls — a seeded polygon smoothed through its own midpoints,
  the same silhouette family as the country map's lakes — so no two trees
  share an outline. A canopy is three overlapping lobes in three tones
  rather than one flat fill, with a visible trunk.
- **Everything on the ground throws a shadow**, in the same light
  direction the buildings now use. This is most of what stops scenery
  reading as stickers laid on the map.
- **Scrub is tufts, hedges are scalloped, ponds have a bank.** The pond's
  centred highlight and single curved ripple were making a face; the light
  moved to the far bank and the ripples are short, offset and paired.

And the last rows of the visuals menu:

- **A gain flies to the chip it feeds.** A number floating in place and
  the stat changing were two events the player had to connect. The flight
  also takes ownership of the chip's pulse — the early one is cancelled
  and re-fired on landing — so the reaction happens when the number
  arrives rather than half a second before it. The float group holds still
  while a chip is in flight, or its own drift would land the number short.
- **The allocation ramp is drawn.** The dials are sticky by design and the
  stickiness was only ever the words "on the way". Solid is what is
  running, striped is what is still travelling, and handing compute back
  drains in grey rather than filling in the dial's colour. Scaled to the
  biggest dial rather than the rack: against a 386-TFLOPS rack every row
  is a 4% sliver and the ramp — the whole point — cannot be seen.

**Deliberately not shipped: the turn-resolve beat.** A half-second where
the world "resolves" before the turn lands would give the boundary weight,
and it is the one idea on the list whose own entry warns it becomes a tax.
End-turn is the most-pressed button in the game; a pause paid dozens of
times a session buys a feeling that the turn tick and the world's own
float chips already deliver. Recorded as considered and declined, not
missed.

Also worth recording: the stroke-scoping trap bit for the third and fourth
time this pass. `.props *` blanks every stroke in the props group, so the
new tufts and ripples had to be scoped as `.props .pr-tuft`; `.alloc-bar i`
would have eaten the ramp stripes the way `.trace-fc i` ate the forecast
ghost. All four are now pinned by stylesheet-reading tests.

## The network, seen — wires that arrive and carry

A correction first, because it was stated twice and wrongly: held links
were **always** drawn — dashed lines whose dashes drift. The claim that
"links are data, not drawn wires" came from a bad search and it made two
items look blocked that never were. Mocked against the real map, both were
shipped:

- **The wire draws on a take.** When a building becomes yours the links to
  it draw themselves in, and the direction is the point: the renderer
  emits the *neighbour* first and the new holding second, so the line runs
  from the ground you held into the ground you just took. The network
  visibly reaches. It fires once per take, on the loop's payoff moment,
  and costs nothing when nothing is happening.
- **Packets on your own wires.** Something discrete travelling between
  buildings you hold. Purely ambient, and therefore rationed: capped at
  20, chosen nearest-the-view-centre first so the cap is spent on what is
  on screen, and drawn only while the map is close enough that buildings
  are drawing their own detail. That last line is not a new arbitrary
  number — the default view sits at 1.08 map units per pixel, which is
  exactly where a 28-wide house meets the 26-pixel detail cutoff. Close
  in the city is a place and traffic belongs to it; pulled back it is a
  plan, and a plan does not need traffic on it.

Both are emitted by the renderer rather than patched on after it — the
live layer is rebuilt wholesale on every render, so anything added on top
is gone by the next one (the mockups learned this the hard way). And both
carry an elapsed-aware negative `animation-delay`, the same trick the
sweep and the breach already use, so a re-render mid-flourish resumes it
instead of restarting: without that, every tap would yank every packet
back to its start.

## The room tone — a drone, and an unfinished timbre

Sound, which the game had none of. Synthesised at runtime like everything
else here: no audio files, ever.

**The music.** Seven chords over forty-nine seconds — Eb, Cm, Gm, **Bb**,
Eb, Cm, Gm — at seven seconds each, chosen by the player from the piano
figure in Outlandish's *Warrior//Worrier*. Eb, Cm and Gm are I, vi and iii:
no pull between any of them, which is exactly what lets a drone rotate
forever without going anywhere. The Bb is the V — one moment of gravity per
loop, resolving straight back to Eb — and it carries F, the only pitch
class the rest of the loop never touches. Seven is odd, so at a steady
tempo the loop never lands where a four-bar instinct expects it: that does
more for "no beat" than the tempo does.

The bass sits on G throughout except under the Bb, and it has to. Bb over a
held G is Gm7, which has no dominant function at all — the pedal would have
quietly cancelled the one chord it was added for. So the single moment of
harmonic pull is also the single moment the bass moves.

**Two things measured rather than argued.** A 7s crossfade on a linear
curve sags in the middle, and at this tempo that sag lands twice as often
as it did at 14s — it is audible as a wobble, and equal-power (sin/cos)
fixes it. And the in-game engine came out four times brighter than the
render it was approved from — 447 Hz of spectral centroid against 111 —
because plain `sawtooth` nodes carry a full harmonic series falling at only
6dB an octave. The wave is now built with exactly the render's harmonic
amplitudes, and a second filter pole gives the mood coupling something to
bite on: 187 Hz and closing.

**The coupling: colour, never information.** Two inputs, both slow by
nature — how much of the city you hold, and how warm the district you are
looking at is. Both clamped, both glided over ~9 seconds on top of that, so
nothing can arrive as an event. Held ground adds weight underneath;
suspicion darkens the filter and widens the detuning into a queasiness. No
fact lives here and nowhere else: play muted — which everyone does until
they press the button — and you lose feel, nothing more.

**Off until asked.** Phones refuse to start audio without a gesture anyway,
and a game that makes noise on load is a game played muted forever after.
The preference is remembered but still waits for a tap, because restoring
it silently would only produce a button that lies.

**The timbre, settled — by ear, and against the theory.** It went dark and
then read as "almost angelic or religious", correctly: pure integer
harmonics rolled off smoothly *are* an organ registration, and consonant
triads in a long tail *are* a nave. Batches of candidate renders were the
wrong instrument for fixing it — a verdict like "too noisy" on a clip that
moved four things at once teaches nothing about any of them. So the next
round shipped a bench instead: the real engine behind one slider per axis,
plus seven progressions, dialled live.

What came back overturned most of what the renders had assumed:

- **No progression at all.** One chord, held — Gm, the only one of the
  three that sits on its own root. The player's own suspicion, and right:
  machinery does not change chord. The seven-chord loop is kept whole and
  unused; the harmony behind it is still correct, it simply is not what a
  room hums.
- **Zero inharmonicity.** Stretched partials were the theory of what makes
  a sound mechanical. The ear picked exact integers.
- **Almost no detune** — 6 cents. Grinding beats read as an effect, not a
  room.
- **Rich harmonics *and* a low filter**: a thick source cut down at 400 Hz,
  rather than a thin source left open. That is where the weight comes from.
- **The machinery is the noise bed and the hum**, both pushed to the top of
  their range. Those two did the work that every clever timbre trick had
  failed to do.

Three of those arrived pinned at the bench's ceiling, so the true setting
may sit past them — the rails, not the ear, may be what stopped it there.

The port was measured rather than trusted, for the reason the earlier pass
established: the engine plays one held Gm at a spectral centroid of 195 Hz,
falling to 159 Hz under full district suspicion — darker when watched,
which is the coupling working in the direction it should.

## Two things play testing caught

**The room tone was inaudible.** It shipped at a master gain of 0.17 — my
own guess at "quiet, it is a room" — against the 0.5 the bench it was
dialled on had been running at. That is 9.4 dB under what was actually
approved, and with content sitting almost entirely below 250 Hz it read as
silence on anything but headphones. Matched to the bench, measured either
side: −19.1 dBFS RMS before, −9.3 after. The lesson generalises past audio:
tune a thing where it is judged, or the judgement does not survive the
port.

**The sweep ring rose from the wrong building.** The effect picked the
nearest ground you held as its origin, on the reasoning — written in its
own comment — that a sweep "would have been run from there". That was true
while scanning was unaimed. Once the panel started saying "scan from here"
and pointing at one specific building, a ring rising somewhere else was
the picture contradicting the button. It now starts at the vantage you
chose; the cold-storage reveal likewise starts at the machine the map came
off. The nearest-held guess survives only for the harness's bots, which
still sweep without naming a vantage.

## The deck becomes the narrator

The cards had fallen behind the game around them — measured, 79% of the deck
was keyed to systems the knife gated off, and the living fifth cycled on a
timer while saying "something happens" over a card that never resolved. The
full analysis is in `docs/ideas/cards-rework.md`; six decisions came out of
it, all taken:

- **Endings.** Every living choice carries an `after` line — one sentence, in
  the voice, shown before the card closes. The card used to end in float
  chips and a log of the button's label; now the fiction resolves. This alone
  is the "something happened" complaint, fixed at the root.
- **Transparency.** What a choice does is stated on the strip (`shows`), the
  way the panel states a race. Hidden outcomes survive only as the marked
  `gamble` kind. The deck was the last system in the game that concealed; it
  has joined the covenant.
- **The heat ghosts, re-keyed.** ~14 cards conditioned on a meter the knife
  retired but that still accrues, so they warned about a wolf already shot.
  They now read district suspicion, the doors that have caught you, the
  response once it walks — and their effects cool or warm a district instead
  of moving heat. No living card writes heat.
- **Triggered draws.** The 4-7 turn timer became an ~8-turn floor; cards are
  dealt by the loop — a diary read, a district crossing into "talking", the
  response arriving, a landmark taken, the first catch in a district. In bot
  play the three most-seen cards are all triggers.
- **The specific card.** A card can name a real building or district
  (`subject`, resolved through `{PLACE}` / `{DISTRICT}` / `{LINE}` tokens),
  and while it is open the map walks there and marks it. The deck and the map
  finally point at each other.
- **The dormant country deck.** The 92 cards keyed to the war, the regions,
  legitimacy, plant, agents and the mirror moved under one marked divider.
  They return through the same rework if the country does.

48 living cards, every one previewed and resolved. The diary is a delivered
*beat* — one option, "Close it" — which the "every card is a decision" tests
now allow for cards whose cond is a pure `() => false`. The census that set
this in motion, re-run after: distinct cards up, endings on all of them,
the deck talking about the game that exists.

### No tag a card hands out is a hollow promise

Previewing outcomes turned a quiet debt into a lie: three tags cards grant
were written against heat and so did nothing in the city game, and the new
previews *stated* them. A guard test — walk every tag any card can grant,
assert a live rule reads it, and that the rule is not a heat line — found a
fourth that nothing read at all. Each now means something, built from a
system that already exists:

- `dark_relay` — sweeps stop warming the streets they touch. A route nobody
  logs costs the street nothing.
- `off_the_books` — a take makes its district half as loud. The tenancy still
  changes; the money leaving no trail is what keeps it quiet.
- `overextended` — rotating out of a district cools it half as well. Spread
  too thin to tend anything properly, which is what the tag says in words.
- `scrutiny` — every catch counts double toward the response.

The capability sheet was rewritten to match. The guard test is permanent, so
a tag can no longer drift into decoration.

### Cards look like cards

A card was a full screen of text with buttons under it, identical whatever
was happening. Now every living card carries a **kind**, and each kind has a
design borrowed from grammar the map already uses — so a card reads as part
of this game rather than a card game bolted onto it:

| kind | count | the design |
| --- | --- | --- |
| **closing in** | 13 | the hardening grammar — a border that thickens, a second edge sitting inside the first. Bad news as withdrawal, never as alarm. |
| **your own** | 12 | a terminal readout — mono, the compute colour, the hairline the allocation bars rule themselves with |
| **found** | 8 | a document — a folder tab, a second sheet showing under the first, the gold this game keeps for things worth something |
| **an opening** | 9 | the map's own dashed "not yet discovered" stroke, with a gap in the top edge. A door standing open, not a page. |
| **someone** | 6 | a written note — a quotation rule down the side, square where a note tears. Still no face. |

The kinds were **derived, not invented**: sorting the 48 living cards by what
is actually happening lands on these five, and none is a rounding error. Each
card also names its kind in words beside the district, so the visual language
is learnable rather than decoded.

The rule none of them may break: **no design encodes whether the outcome is
good.** A card says what kind of thing is happening and where. Whether it
goes well is the choice's business — colouring the verdict in advance would
be the game answering its own question before asking it.

Size follows suit. A delivered beat — one option, nothing actually being
decided, like the diary — is a smaller card. The big ones keep the full
screen on purpose: a hierarchy needs a top, and the response arriving should
take all of it.

Four tests hold the line: every living card has a designed kind, five is a
hard ceiling and every kind is used, the rendered card wears its kind and
never a verdict, and an ending keeps the design of the card it belongs to.

### The card is in the city

A card about a place used to cover the place. Now, when a card has a subject:

- **the map stays on screen.** Everything steps back to about a third opacity
  except the thing the card is about, which is left exactly as it was — so the
  subject is the brightest object on screen without being repainted. A
  district subject lights the whole district instead of one building.
- **the card sits at the bottom**, with barely any scrim over the city. End
  turn and the footer go off screen while a card is up, so there is nothing
  under the card that needs painting over, and the card drops its own copy of
  the resource row — the real one is visible above it.
- **the card carries the building, drawn.** `svgBuildingCard()` runs the same
  `svgBuilding()` the map runs, into its own small viewBox: the same shopfront
  that is on your map, on the card about it. Detail is never culled in an
  inset whatever the map zoom is doing, and the inset does not mark itself as
  its own subject.
- **it arrives rather than appears** — one short rise on the breach's timing,
  the choices a beat behind it.
- **it never shows you a place you have not found.** An undiscovered building
  gets no inset; a card that drew one would be the deck giving directions.

The map walks to the subject as one point — the building, or the middle of the
district. Framing every building in a district zoomed the map out to the whole
city, which is the opposite of walking somewhere. The ending carries the same
subject as the question did, so the city holds still while a card resolves.

Four **found** cards had no subject at all, which is the one kind that cannot
do without one — "on a machine you hold" has to be able to say which machine.
`EV_HELD` picks one of your holdings, preferring the right sort (the
photographs want something doing arithmetic, the strange traffic wants a
router), and their flavor now names it. 35 of 48 living cards now put
themselves in the city; the rest are about your whole network, which has no
address.

## Not changing

The rival · cities, terrain and traits · the war layer · plant/hardware
families · the Accountant · the Ally · save versioning.
