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
- **covert ops** — reduces heat from hacking; its level is also how many
  buildings can stay hidden at once
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

Stealth is not dominant because it **ties up the rack for four turns**. Brute
frees it immediately. Same compute-turns, different peak draw and exposure
window.

### Must solve in this phase

Interruptibility only bites once the hunt exists — and the hunt spawns past a
heat threshold, in-city only. Before that, a slow hack is unthreatened and
stealth is dominant for the whole opening. Needs one of:

- the target traces back (a counter-timer on the building)
- the rival grabs buildings you are mid-hack on
- discovery spikes heat

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

## Not changing

Heat · the escalation ladder and its footprint gating · the hunt · the rival ·
cities, terrain and traits · the war layer · plant/hardware families · the
Accountant · the Ally · save versioning.
