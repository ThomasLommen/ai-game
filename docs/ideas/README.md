# Improvement candidates — the menu

Everything is on the table in this folder, and nothing in it is a plan. The
method that got the game here stays the method: strip to basics, check the loop
holds, then add **one thing at a time** and dial it in until it fits. These
documents are what that one thing gets picked *from* — a stocked larder, not a
to-do list. Most of what is here should never be built, and that is the sign
the folder is working.

## How to read a candidate

Every idea carries three annotations:

- **[S] / [M] / [L]** — effort. [S] fits in a sitting, [M] is a real feature,
  [L] is a project with stages of its own.
- **Answers:** the question from play it exists to address. An idea with no
  question behind it is decoration and says so.
- **Measure:** what to check after, with the playtest harness or a probe —
  the same way every change this rework has shipped was checked.

## Where the game stands, honestly

Strengths, per play and per measurement:

- **The core loop is proven.** "The gameplay with hacking is really awesome
  now" — the player's own verdict. Pick a door, run the race, take the
  building. Everything in this folder should serve that loop or get out of
  its way.
- **Determinism as a covenant.** The race is previewed exactly. Nothing
  ambushes the player with dice they could not see. This is rarer than it
  sounds and worth defending against every idea that follows.
- **The map finally looks like a place.** Irregular plan, frontages,
  districts as areas, terraces, props, lakes. The country map has real
  geography. The visual floor is high now.
- **The machinery is unusually good.** A deck engine with conditions, tags,
  once-flags, planted timers and forced reports; a headless playtest harness;
  ~700 tests. Content is cheap to add and cheap to verify here — most games
  never get this.
- **The voice is distinctive.** Dry, lowercase, second person, numbers said
  plainly. It reads like nothing else.

Gaps, also per measurement:

- **City one has almost no pressure.** Heat is country-scale now, the ladder
  gates on footprint (~0 in the first city), and the hunt arrived in only
  3 of 10 forty-turn bot runs. The proven-fun loop currently runs against
  nothing that pushes back.
- **The rig holds one program**, so the mount decision is gone — by design,
  awaiting the second program that earns its place.
- **Scan is nearly free**, so it is a reflex, not a decision.
- **Cards rarely remember.** ~130 events, almost all one-shot; the tag
  machinery that could chain them is barely used for story.
- **There is one ending** (take everything, win the war) and no framing of
  what a run *is*.
- **No sound at all.**

## Selection criteria

When choosing the next one thing, in order:

1. **Does it deepen the loop play already proved fun?** Taking buildings is
   the game. Ideas that feed that outrank ideas that sit beside it.
2. **Does it add a decision, or only content?** A decision changes what the
   player does; content changes what they read. Both are welcome; decisions
   are worth more.
3. **Is it previewable?** Every threat states its next move; every gamble
   shows its arithmetic. Ideas that need hidden dice must justify the break.
4. **Does it fit the voice?** If it needs an exclamation mark, it doesn't.
5. **Can it be measured?** If the harness can't see it land, the playtest
   has to, and "I'll know it when I see it" is a smell.

## Traps — things measured or argued out before, do not re-add

- **Upkeep and decay.** Killed twice (churn/decay, stranded-decay). Ground
  once taken stays taken; pressure comes from actors, not entropy.
- **A second pressure meter in the city.** Heat left the city because a bar
  the player stops reading is worse than no bar. Any city pressure must live
  in things on the map, not in a new gauge.
- **Interactive scenery.** A prop that can be tapped is a door that lies.
  The stylesheet enforces this; keep it enforced.
- **Loot as a slot machine.** Variable-ratio reward schedules work by being
  addictive, not by being good. Anticipation is the honest half — see
  `systems.md` for the version that keeps the covenant.
- **Difficulty as bigger numbers.** A harder door is a longer wait, not a
  harder question. Difficulty should change what the player must think about.
- **Simultaneous live cities.** One city at a time is a rule that carries
  the whole pack/unpack architecture. The cost of breaking it is immense and
  the payoff is spreadsheet management.
- **Cutscenes, lore dumps, named-photo characters.** The fiction works
  because it arrives in 40-word cards and log lines.

## The documents

| file | contents |
| --- | --- |
| `design-lens.md` | the research, applied: what kind of game this is and what the literature says about its exact problems |
| `systems.md` | gameplay systems and loops — programs, loot, doors, intel, pressure, contracts, war, economy |
| `story.md` | narrative — the premise said out loud, a recurring cast, chained arcs, endings |
| `cards.md` | the deck — taxonomy, new choice kinds, and ~60 concrete card sketches |
| `visuals.md` | juice, animation, ambient life, map polish, and sound |
| `meta.md` | what a run is — seeds, chronicle, difficulty, unlocks, onboarding |
