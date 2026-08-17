# The deck — candidates

The event system is one of the best-built things in the repo: `cond`
functions over full game state, `tags`, `once`, `planted`/`duePlanted`,
`forced`, gates, hidden costs, "always one affordable choice." ~130 cards
exist. This document is (1) what's under-used, (2) new card *kinds* worth
building, and (3) ~60 concrete sketches in the real shape.

## What the machinery already supports and the deck barely uses

- **Chained memory.** `not_your_traffic → precursor_again` and the ally arc
  prove it works; almost nothing else chains. Most of the story ideas need
  zero new engine — just cards with `cond: s => s.tags.has(...)`.
- **Cards that name the board.** `cond` can see `s.buildings`, districts,
  which host caught you. No card references a *specific* building yet. This
  is the single highest-leverage unlock in the deck — see "the specific
  card" below.
- **Planted timers.** `planted` lets a choice now become a card in N turns.
  Used barely. Every "we'll see about that" choice should plant its
  consequence.
- **Forced reports.** `forced` delivers a card about something that already
  happened, jumping the deck timer. Perfect for loot/response beats.

## New card kinds (small engine adds, each unlocks a category)

1. **the specific card** ★ [M] — a card that names a real building on the
   current board (`s.pickBuilding` → the flavor and the apply reference it).
   "The **finance floor on the high street** filed a complaint." Turns
   generic dilemmas into *this* dilemma. Biggest narrative-per-line win
   available; the QBN literature calls specificity the whole game.
2. **the offer with a clock** [S] — a card that plants its own expiry: take
   it now or a worse version returns in N turns. Contracts (`systems.md`
   §F) are this kind. Engine: `planted` already does it; needs a UI tell
   ("this won't wait").
3. **the two-actor card** [M] — resolves against a *relationship* value
   (Journalist, Detective, Broker) and moves it; later cards read it. The
   ally arc is the prototype; generalize it into a `rels` object.
4. **the map card** [S] — a choice that reveals or marks buildings
   (`s.reveal`, a loot pointer). Makes intel and loot narrative, not menu.
5. **the branch card** [S] — a card whose *outcome text* differs by a state
   you can't see coming, teaching a rule by surprise-then-explanation.
   Deterministic (reads state), so the covenant holds.

## Balance discipline (from Slay the Spire, applies to any batch)

- Every option does something the turn it appears. (Half-built into the
  "always one affordable choice" rule; extend to "never only-good-with-a-
  prior-card.")
- Instrument it: add per-card pick-rate and outcome-delta logging to the
  playtest harness, run the bot profiles, and delete any card no profile
  ever picks or that swings nothing. Mega Crit balanced 300 cards this way;
  the harness makes it free here.
- Target mix per draw across a run: ~40% dilemmas (no dominant option),
  ~30% faucets (a clear good option with a cost), ~20% texture (small or
  flavor), ~10% arc beats (gated, chained).

---

## Sketches

Shorthand — real cards are objects like the ones in `data.js`. `cond` is
when it can appear; options are `text → effect`. Voice per `story.md` §6.

### First-city pressure & texture (fills the measured hole)

- **the meter reader** — `held>=3, once` — someone from the utility is at
  the door of a house you route through. → *Let them in* (they see nothing,
  standing +) / *Kill the lights for the visit* (a turn's TFLOPS dip) /
  *Buy a plausible bill* (funds).
- **the neighbour's complaint** — `district suspicion high` — the specific
  card: names a held building. → *Go quiet there* (suspicion down) /
  *Double down* (funds, suspicion up) / *Move out of that block* (unhide
  nothing; it just cools).
- **the fibre cut** — `held>=5` — a backhoe took a line you depended on.
  → *Reroute* (a turn slow) / *Pay for priority repair* (funds) / *Route
  through a router you shouldn't* (heat, teaches a trait).
- **the kid's project** — the Family arc opener — a child two doors down is
  building a "haunted house detector" and it is *good*. → *Feed it false
  positives elsewhere* (clever, standing risk) / *Do nothing* (plants a
  later beat) / *Buy the science fair* (funds, warmth).
- **the landlord's letter** — estate origin, timer — rent is due to a
  person who is dead. → *Pay it from the estate* (funds, legit) / *Forge a
  notice* (heat) / *Buy the freehold* (big funds, ends the arc, a hardware
  piece).

### Loot & doors (if those systems ship)

- **the keys** — `forced` on taking a host with `credentials` — → *Use them
  now* (next same-type run free of trace) / *Sell them* (funds) / *Sit on
  them* (plants a card: someone notices the keys are gone).
- **the diary** — `forced`, host with `someone's diary` — pure texture; one
  paragraph; one option: *Close it.* The best card in the game precisely
  because it does nothing.
- **the honeypot, explained** — first time you scan a honeypot — → *Take it
  anyway, carefully* / *Mark it and route around* / *Feed it something
  false* (turns their trap on them; standing).
- **the shared tenant** — taking a `shared tenant` door — the specific
  card, names the neighbour it just made angrier. → *Take the neighbour
  fast, before they patch* / *Leave them be* / *Apologise, somehow* (funds,
  the neighbour cools).

### The recurring cast

- **the byline** — Journalist opener, `standing != unknown` — a first
  article; wrong in interesting ways. → *Correct the record anonymously*
  (spin, risky) / *Let them be wrong* (the wrongness protects you) / *Send
  them something true* (standing swing, arms the arc).
- **the follow-up** — Journalist, arc — they're closer now, and they've
  named a pattern. → escalating versions of feed / starve / meet.
- **they knew the cabinets** — Detective, after a second seating — the
  response is learning; a card that *shows* it. → *Change how you work*
  (a tag that shifts your trace profile) / *Let them think they're right*
  (a trap) / *Confront early* (arms the confront cheaper, riskier).
- **machine to machine** — Mirror, `ladderStage>=2, once` — the other one
  speaks. What it says depends on how large you are. → *Answer* (a
  relationship begins; unknown payoff) / *Trace the message* (intel, heat)
  / *Ignore it* (it does not ask twice — or does it).

### Arc beats (chained, using tags)

- **the first employee** trio — hire / they notice / they know. (§story 3.1)
- **the chapel** trio — the rumor / the donations / the congregation.
- **the copycat** trio — the imitation / the harm / the blame.
- **the negotiator** — three ladder-timed offers, each a real leash.
- **the museum** — late — they want to demolish the first house.

### Choice-kind showcases (teach the new kinds)

- **the offer that won't wait** (clock card) — a contract with a visible
  timer and a worse rerun.
- **the thing behind the thing** (map card) — a choice that reveals a
  cluster: "the diary mentioned a room. here is the room."
- **the two readings** (branch card) — same setup, outcome differs by
  whether you're over the line on standing; the text explains after.

### Country & late game

- **the election** — news-cycle card — everything traces faster for ~10
  turns; the deck references it. → *Lie low nationally* / *Move fast while
  they're distracted* / *Fund a candidate* (funds, standing, a favour owed).
- **the anniversary** — very late — a year since the house. A mirror card:
  the log recounts, in the voice, three things you did. One option:
  *Continue.*
- **the licence, offered** — legitimacy ending's door — the last
  negotiator offer, on the table, real.

---

## Volume plan

If a "big batch of cards" is wanted as its own deliverable [L], the
disciplined version:

1. Pick **one** under-used mechanic to make narrative (loot, or the
   specific card, or relationships) — cards without a system to reference
   are Reigns cards.
2. Write **one arc** end to end first (5 cards, tagged, tested chaining)
   as the template.
3. Then batch **20–30** texture/faucet cards that need no new engine, to
   thicken the draw.
4. Instrument pick rates, run the bots, cut the dead third.
5. Only then write the next arc.

Rough capacity: the deck could comfortably double to ~250 cards before
draw repetition is a risk, given the `cond` gating spreads them across
run states. But volume is the last step, not the first — a hundred price-
check cards is worse than ten that remember.
