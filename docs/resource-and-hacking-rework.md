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
| Cover | **Covert Ops** — an allocation level. Capacity, not currency. |
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

**Phases 1 and 2 are done.** Insight, the capability tree, and cover-as-currency
are all gone; TFLOPS, electricity, funds, grid buildings and the allocation
screen are all in. The resource row is three entries: funds, TFLOPS, cover.

Two things landed differently from the plan above, both for good reasons found
while building:

- Covert ops turned into a **ladder** rather than a set of unrelated grants: one
  unit is somewhere to keep a building hidden, two makes hiding free of an
  action, three makes a quiet entry untraceable. Quiet Protocol had to move to
  two, because at one it shared a threshold with the first slot and "hiding
  costs you an action" was unreachable on any real board.
- The mechanics that were capability nodes live in a `window.UNLOCKS` table
  mapping each to an allocation threshold, with the prose that used to sit on the
  capability card now shown on the dial that grants it. Without that the
  allocation screen was five sliders with no stated consequences.

**Open balance question for playtesting:** a network of nothing but compute now
earns nothing at all, because funds come only from commercial ground. The opening
is genuinely poor until a till or an office is taken. Nothing early is mandatory,
so this should read as intended rather than as a stall — but it changes the shape
of the first ten turns and wants playing.

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

## Deferred until all six phases are done

Sixteen event-card conditions in `data.js` gate on `hasCap(...)`. Emptying the
capability tree in phase 1 makes every one of them permanently false, so those
cards stop appearing — they do not break, they just never come up again.

Some of them should be regated onto allocation levels instead of capability
ownership, but that is a content decision per card and it is being taken after
the six phases land, not during them. Until then, treat those cards as dormant
rather than as a bug.

## Not changing

Heat · the escalation ladder and its footprint gating · the hunt · the rival ·
cities, terrain and traits · the war layer · plant/hardware families · the
Accountant · the Ally · save versioning.
