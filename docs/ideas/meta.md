# Meta — what a run is

The systems and story exist inside an unframed container: a run starts, a
run happens, a run ends, and nothing tells the player what a run *was* or
invites the next one. This document is the frame — the roguelite scaffolding
that turns "I played" into "I played *that*, and next time I'll play *this*."
It is the lowest-priority folder (the game inside the frame has to be right
first) but the highest-leverage for *replay*, which a roguelite lives or
dies on.

## A. The chronicle ★ [M] — a run you can look back on

Right now a run vanishes when it ends. A **chronicle** — the run, told back
in its own voice — is the cheapest thing that makes runs feel authored:

- A single scrolling record, written *as it happens* (the log already
  half-is this), kept at end of run: the seat you woke in, the cities in
  the order you took them, the turn the response first came, who the
  Journalist decided you were, how it ended.
- Written in the card-voice, not as stats. "You woke in a house on Ashmoor
  Street. By the spring you had the high street. They came for you in the
  estuary, and you let them have three blocks to keep the docks."
- Shareable as text (fits the self-contained ethos — no backend). The
  Journalist arc (`story.md` §2) *is* this if it ships: the run narrated by
  someone who was watching.
- Measure: none — it's a mirror. But it's the artifact that makes a player
  screenshot a run, which is the cheapest marketing a game has.

## B. The seed & the daily [S]

- **named seeds** — a run's generation is already deterministic-ish; expose
  the seed so a board can be replayed or handed to someone. "Try seed
  ASHMOOR — the estuary lake nearly landlocks the docks."
- **the daily** — one seeded run a day, everyone the same board. The
  chronicle makes it social without a server: compare how differently the
  same city fell. Classic roguelite retention, near-free here.

## C. Difficulty — as questions, not numbers ★ [M]

The trap (`README.md`) is difficulty as bigger defense — a longer wait, not
a harder question. Difficulty done right *changes what the player must
think about*. A ladder of modifiers, each a new consideration:

- **the file** — you start already known: `caughtHere` seeded, a card
  already has your pattern. Changes the opening from *establish* to *stay
  ahead*.
- **the rival wakes early** — the mirror moves from turn one. The country
  is a race, not a conquest.
- **thin grid** — electricity binds in the *first* city. The two-ceiling
  problem, front-loaded (deliberately the thing that was pulled *out* of
  early game — here it's the hard mode).
- **the watched country** — every city has the `watched` trait; the trace
  race is the whole game, covert.ops mandatory.
- Stack them (Slay the Spire's Ascension model): each is a discrete rule,
  named, so "difficulty 4" means four specific things, not "×1.4 numbers."
- Measure: each modifier should change the *winning bot profile*, not just
  the win rate. If greedy still wins at every level, the modifier is a
  number, not a question.

## D. Unlocks — content, not power ★ [S–M]

Roguelite unlocks are dangerous: unlock *power* and early runs feel gimped;
unlock *content* and the pool deepens without breaking balance. This game
should only ever unlock the second kind:

- **origins** (`story.md` §1) unlock by ending: win the licence to unlock
  the accident origin, etc. Each is a lateral start, never a stronger one.
- **cards** join the pool as you see their preconditions once — the deck
  *learns the player's history*, so a veteran's deck is richer, not
  stronger.
- **the second program** (`systems.md` §A) could be an unlock rather than a
  default: the first campaign is backdoor-only (the proven loop, clean),
  and siphon/worm arrives once you've won once — the "now here's the next
  idea" moment, diegetically earned.
- Never unlock: starting TFLOPS, better dials, cheaper anything. Power
  unlocks are the snowball (`design-lens.md`) wearing a progression hat.

## E. Onboarding [M] — the first ten minutes

The game is deep and currently explains itself through play and tap-info.
For a wider audience the opening needs a hand, without a tutorial that
insults the deep player:

- **the guided first city** — the origin house arc *is* the tutorial:
  each early card teaches one verb (scan, run, dial, hide) by needing it,
  never by lecturing. The landlord clock gives the opening shape. This is
  the onboarding that costs nothing extra because it's also content.
- **the "why" caption** — the first time each system does something to you,
  one line names it ("this is heat — the regulator noticing; it only
  matters at country scale"). Once, dismissable, never again.
- **progressive reveal** — the country scope button, the allocation
  screen's deeper dials, the war — appear *when reached*, not at the start.
  The HUD grows with the run. (Partly true already; make it a principle.)
- Measure: a fresh player (or a naive bot with no strategy) should survive
  the first city. Currently an unguided bot does fine — a human's problem
  is comprehension, not difficulty, so measure *taps on info* dropping over
  a session, not win rate.

## F. Scoring — a number the mastery can point at [S]

Not required, but a run with no score is a run with nothing to beat. If
scored, score the *fiction*, not the spreadsheet:

- **conquest**: cities held, turns taken, times caught (fewer is prouder).
- **the licence**: how legitimate, how quietly.
- **the exit**: how *little* you held when you left — lightness as
  mastery.
- **stewardship**: how long unseen.
- Each ending scores its *own* virtue, so there's no single leaderboard
  flattening four playstyles into one. Measure: the four scores shouldn't
  correlate — if the conquest-best run also scores best on exit, the
  scores aren't measuring different things.

## G. Framing the whole [S] — the title and the frame

Small but real: the game is "The Network" and opens straight into a house.
A single framing beat — a black screen, three lines in the voice, the hum
starting — would set the fantasy before the first tap. And a title that
*is* the fantasy. Cheap, and it's the first thing anyone sees.

## Priority within meta

Meta is the last thread to pull — the game inside has to be worth
re-running first. But *within* it, if pulled:

1. **The chronicle (A)** — makes any run feel authored; feeds the
   Journalist; near-free; the artifact players share.
2. **Onboarding via the origin arc (E)** — the widest-audience unlock, and
   it's also content, so it's never wasted.
3. **Difficulty-as-questions (C)** — what keeps the proven loop alive past
   the first win, for the players who finish it.
4. Seeds/daily/unlocks/scoring — retention scaffolding, valuable but only
   once there's a game people finish twice.
