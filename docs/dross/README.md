# DROSS — and the search that found it

A brand-new project, unrelated to anything else in this repo. Parked here because it is
the only repository this session could reach; it deserves its own home eventually.

## Start here

| | |
|---|---|
| **[DESIGN.md](DESIGN.md)** | The build document. Read this one. |
| **[SYSTEMS.md](SYSTEMS.md)** | The 42 candidate systems it was assembled from, with critic verdicts. |
| [Published build document](https://claude.ai/code/artifact/b0c4248e-8681-403a-9dda-6ec34f0268e7) | Same thing, formatted, phone-friendly, with the diagram. |

## What DROSS is

A river valley where small tribes survive. Everything a person does is a short program in a
tiny made-up language. Nobody writes their behaviour — the computer searches for programs
that keep them alive. Each night a compressor reads the programs that worked, finds chunks
that keep repeating, and turns each one into a new named command. That growing list of names
is the tribe's technology, and nobody authored it. When a named chunk is expensive and always
runs at one spot, the tribe **builds** it — a kiln, a weir, standing on a map tile.

**The hinge:** a building's upkeep is paid in real material, and the specification of that
material is derived from what the building must survive. To hold 1,780 K you need a lining
that melts above ~2,370 K, and the lining is eaten by what it holds. So the only way to hold
a bigger number is a better wall, and a wall is a material. When no rock in the valley has
that property, exactly one route remains: a material another building made.

That is the dream event — the moment craft becomes industry — and this design makes it the
only door rather than a lucky coincidence. Odds of seeing one inside six months, mechanically
detected: **~60%**, against ~15% for the design it grew out of.

Everything else follows from three refusals: don't write the materials (roll ~20 elements and
derive all chemistry from them), don't write the rules (write six templates with blanks that
buildings fill in), and don't write the goals (the world reads its own limits and asks for
what it cannot yet do).

## Next step

**Phase 0, "the lathe"** — a weekend, ~900 lines, no simulation in it at all. It rolls
chemistries and screens them: how deep does the material chain go, is there a self-feeding
set of processes, do heat-treatment schedules matter. It answers whether a given world can
contain the dream event *before* three months are spent. Rerolling is free.

## How this was found

Five rounds, ~90 agents, each round narrowing. Full pools kept because the discarded ideas
carry the reasoning.

| Round | What it asked | Output |
|---|---|---|
| [1](exploration/round1-self-evolving-terrarium.md) | Something that grows itself with few inputs | 36 ideas |
| [2](exploration/round2-self-improving-software.md) | Software that improves its own capabilities ([published](https://claude.ai/code/artifact/7e9df07e-3f7c-4844-bc25-4fd56f2af5bf)) | 42 ideas |
| [3](exploration/round3-civilizations.md) | Civilizations that invent their own technology ([published](https://claude.ai/code/artifact/73b9685b-f329-4b12-a367-faa9c62a62e6)) | 42 ideas, every one depth-audited — **none survived as open-ended** |
| [4](exploration/round4-the-four-picks.md) | Four shortlisted designs explained without jargon | Month-6 projections + choice diagnosis |
| 5 → [DESIGN.md](DESIGN.md) | Rebuild the winner to maximise unexpected events | 42 systems → DROSS |

`data/` holds the raw JSON for every round (source of truth — the markdown is generated from
it). `workflows/` holds the scripts that produced them. `artifacts/` holds the published HTML.

## The honest part, kept on purpose

If the bet does not pay, it will not look like failure — it will look magnificent. 140
buildings in handsome clusters, a river that has visibly moved, a lovely time-lapse, and
underneath it 139 variants of two known kinds with every record set before night 90. The
three numbers in DESIGN.md exist to catch that in week ten instead of month five.

Accepted ceiling: every surprise this world can produce is material and spatial. The biggest
possible one is shaped like "an unexpected substance, building, or landscape event."
