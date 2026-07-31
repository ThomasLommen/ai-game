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
- A running hack is **visible and interruptible.**

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
hunt does not exist in the opening — it spawns past a heat threshold, in-city
only — whereas the trace runs from turn one, needs no threshold, and is the
building defending itself rather than a system arriving.

Three guardrails, or it turns nasty:

1. **Deterministic and previewed.** "Traces at 3/turn, your hack needs 4 turns" —
   the arithmetic has to be doable before committing. Random failure after a
   four-turn investment is infuriating, not tense.
2. **Abortable.** Pulling a running hack recovers the compute, not the turns.
   Otherwise one misjudgement is a four-turn punishment with no agency.
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

**A hack could not be stopped.** It could — `abortHack` has existed since phase
3 — but only from the panel of the one building it was running against. With
three going at once you had to remember which three buildings and find them
again on the map, so the honest read from playing it was that starting a hack
was a commitment you could not take back. The rig tab now lists everything
running, with its race, what it is holding, a way to jump to the target, and
its own **pull it out**. The button on the building stays where it was.

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

## Not changing

Heat · the escalation ladder and its footprint gating · the hunt · the rival ·
cities, terrain and traits · the war layer · plant/hardware families · the
Accountant · the Ally · save versioning.
