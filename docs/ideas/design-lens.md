# The design lens — research, applied to this game

Not a survey. Each section is a body of design thinking, what it actually
says, and what it says about *this* game specifically.

## What kind of game is this?

Genre labels first, because they decide which literature applies. This is a
**strategy roguelite wearing a storylet deck**, and its living relatives are:

- **FTL** — one run, mounting pressure, a map you cross while something
  chases you. The chase/region structure is already FTL-shaped.
- **Into the Breach** — perfect information, threats that state their next
  move, small numbers that matter. The detection race and the hunt's named
  next target are already Into-the-Breach-shaped.
- **Fallen London / King of Dragon Pass** — storylets gated on qualities,
  a world that answers to numbers the fiction never mentions. The deck is
  already quality-based narrative; it just doesn't know it yet.
- **Slay the Spire** — content at scale balanced by metrics. The playtest
  harness makes this genuinely available here.
- **Reigns** — the dead ancestor. Everything left of it should be treated
  as a survival, not a feature.

And the fantasy being sold, which every idea should be tested against:
**you are an infant superintelligence growing in the walls of a country**.
The player feelings that fantasy runs on are *quiet omniscient growth*
(watching the network breathe), *paranoia* (who has noticed), and
*escalating consequence* (the world reorganising itself around your
existence). Ideas that feed one of those three belong; ideas that would fit
any strategy game go to the back of the queue.

## Interesting decisions — the Sid Meier audit

"A game is a series of interesting decisions." The useful version of the
quote is the audit: list the decisions the player actually makes, then ask
of each — does it have consequence, is the answer non-obvious, does it
depend on state? The game's current decision inventory:

| decision | real? | notes |
| --- | --- | --- |
| which door next | **yes** — the core | spatial, previewed, race-priced |
| how to set the dials | **yes** | ramp makes it sticky, which is the point |
| when to hide a building | yes, situational | only once the response exists |
| when to leave a city / where next | **yes** | the country-scale core |
| buy vs hack | half | buy is a legitimacy faucet; rarely tense |
| scan | **no** | near-free, always correct — a reflex |
| what to mount | gone | by design, until a second program earns entry |
| card choices | mixed | best ones are dilemmas; many are price checks |

The lesson for this folder: a new system should either **join this table as
a new real decision** or **promote one of the "no/half" rows**. Promoting
scan is probably the single cheapest decision-win available (see
`systems.md`, Intel).

## The tension curve — what FTL's fleet actually does

FTL's rebel fleet is a pacing machine: it converts *time spent* into
*pressure*, so dawdling is a decision instead of a default. This game has
that machine at country scale — the ladder climbs with footprint and heat,
the mirror takes cities, the chase follows you — but **city one has no
fleet**. Measured: the hunt reached only 3 of 10 forty-turn openings, the
ladder sits at stage 0 the whole first city, and heat now does nothing
there at all. The first hours run on novelty alone.

The literature's warning is just as important: FTL's fleet works because it
is *visible, fair, and escapable at a price*. A pressure source the player
cannot see or plan against is weather, and this game already deleted its
weather twice. Whatever fills the city-one gap must state its schedule.
Candidates in `systems.md` §Pressure.

## Perfect information — the Into the Breach covenant

Into the Breach shows enemy intent every turn and lets the player fail with
full knowledge. This game made the same promise: the race is exact, the
response names its next building, a permanent loss must never be a
surprise. Two implications for new work:

1. **Codify it.** Every threat added must state its next move; every gamble
   must show its arithmetic before commitment. This is a design law now,
   not a preference — write it into any new system's spec.
2. **Randomness belongs upstream, not downstream.** Generate variety in the
   *board* (which doors exist, what is on them), never in the *resolution*
   (whether the thing you computed happens). Slay the Spire follows the
   same split: random offers, deterministic fights.

## Juice — Nijman's list, Jonasson & Purho's law

"The Art of Screenshake" and "Juice It or Lose It" reduce to one law: the
same event, feedback-rich, feels like a different game. The tricks are
named — anticipation, impact pause, follow-through, cascading secondary
motion, sound on everything. This game's equivalent of the gunshot is **the
take** — a building becoming yours — and it currently gets a border-color
change, a banner, and a log line. The full candidate list is in
`visuals.md`; the lens point is priority: **juice the take first**, because
it is the loop's payoff moment, and a payoff that lands harder makes every
system upstream of it feel better for free.

The web-specific caveat: this is an SVG map on phones with a 16ms budget
already half-spent. Juice here means CSS transforms, opacity, and paced
cascades — not particle storms. And `prefers-reduced-motion` is already
respected; keep it that way.

## Storylets — what Failbetter and Short would say about the deck

Quality-based narrative: small pieces of story (storylets) gated on
numeric/boolean qualities, firing when the world state matches. The deck
already **is** this — `cond` functions over game state, tags, once-flags,
planted timers. What the QBN literature says is missing:

1. **Chains with memory.** The power of storylets is that story N+1 can see
   what you chose in story N. The tag machinery exists; almost no card uses
   it for *narrative* (they use it for mechanics). Eight arc sketches in
   `story.md`.
2. **Qualities the player can watch move.** Fallen London shows you the
   numbers that gate stories. Here, public standing gates cards invisibly.
   Even one line — "this arrived because of what the papers say" — closes
   the loop.
3. **Specificity beats scope.** The strongest storylets reference the
   concrete situation ("the switchyard you took last week"), not the
   abstract one. The deck's `cond` functions can see actual buildings; no
   card names one yet. One new card *kind* unlocks this (see `cards.md`).

## Card design at scale — the Slay the Spire lessons

Two that transfer directly:

- **Broad roles, not combo pairs.** StS cards work alone and *happen* to
  combine; cards that only work with their partner read as dead draws. For
  this deck: every card's every option should do something at the moment it
  appears — the existing "always one affordable choice" rule is half of
  this; the other half is "never print a card that is only good if an
  earlier card was chosen."
- **Metrics-driven balance.** Mega Crit balanced from play data. This repo
  has `tools/playtest.js` and a headless harness — the same discipline that
  tuned the trace race can tune the deck: track per-card pick rates and
  outcome deltas across bot runs, find the cards nobody would ever pick.

## Loot — the psychology, used honestly

The literature is blunt: variable-ratio reward schedules are the most
compulsive and the least respectable — they are the slot machine. But the
*honest* half of the finding is that **anticipation outperforms payout**:
the wanting is where the feeling lives, and anticipation can be built with
full information. Which happens to be this game's covenant anyway.

So the design law for any loot system here: **the player may always learn
what is on a machine before committing to it, at a price** — and the reward
for scouting is targeting, not gambling. "Something is on this one" is a
reason to fight toward a specific door; a chest that explodes with random
numbers is a reason to stop respecting the game. Full sketch in
`systems.md` §Loot.

## The snowball — the 4X disease and this game's exposure

4X postmortems name the pattern: the early leader compounds, the midgame
decides, the endgame is a formality that takes hours. This game already
took precautions — presence→TFLOPS is logarithmic, seats don't grow longer
with tier, the ladder deletes tools as you grow. Its remaining exposure:

- The **war** is one big battle at the end — exactly the "steamroller"
  shape the genre warns about. Options: make it shorter and sharper, or
  make it optional via other endings (`story.md` §Endings).
- **Nothing scales with player skill mid-run.** The response's cadence
  reads covert.ops, but a player who never gets caught simply outruns every
  system. That may be fine — mastery should feel like something — but the
  chronicle/scoring ideas in `meta.md` give that mastery a mirror instead
  of leaving it unwitnessed.

## Sources

- [The Art of Screenshake — write-up](https://victorweidar.wordpress.com/2016/10/06/the-art-of-screenshake/) · [Squeezing more juice out of your game design](https://www.gamedeveloper.com/design/squeezing-more-juice-out-of-your-game-design-) · [Game feel on the web](https://valdemird.com/blog/game-feel-on-the-web/)
- [Emily Short — Storylets: You Want Them](https://emshort.blog/2019/11/29/storylets-you-want-them/) · [Beyond Branching: QBN structures](https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/) · [Survey of storylet-based design](https://emshort.blog/2019/01/06/kreminski-on-storylets/) · [Quality-Based Narrative overview](https://videlais.github.io/simple-qbn/qbn.html)
- [Slay the Spire: Metrics-Driven Design and Balance (GDC)](https://www.gdcvault.com/play/1025731/-Slay-the-Spire-Metrics) · [Game design tips from Slay the Spire](https://www.cloudfallstudios.com/blog/2020/11/2/game-design-tips-reverse-engineering-slay-the-spires-decisions)
- [The Snowball and the Steamroller: 4X design](http://www.big-game-theory.com/2015/02/the-snowball-and-steamroller.html) · [The 4X boring-endgame problem](https://forums.civfanatics.com/threads/the-core-of-4x-games-boring-endgame-problem-a-short-essay-about-rapidly-increasing-complexity.677400/) · [FTL: Faster Than Light](https://en.wikipedia.org/wiki/FTL:_Faster_Than_Light)
- [Reward schedules guide](https://www.numberanalytics.com/blog/ultimate-guide-reward-schedules-game-design) · [The psychology of loot](https://bugnet.io/blog/the-psychology-of-loot-and-why-it-works) · [Skinner box mechanics critique](https://medium.com/design-bootcamp/product-design-and-psychology-the-mechanism-of-skinner-box-techniques-in-video-game-design-5b7315e2d7b4)
