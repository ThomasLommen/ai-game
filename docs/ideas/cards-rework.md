# The deck, measured against the game it now lives in

> **SHIPPED.** All six morning decisions were taken as recommended and are
> live. Measured after, 8 games x 60 turns: the three most-seen cards are all
> loop-triggered — `district_talking` (16), `first_caught_here` (8), the diary
> (7) — the deck narrating the map rather than a timer firing. Every card
> resolves into an ending; zero living cards touch heat; 48 living cards, all
> previewed and resolved; the 92-card country deck sits dormant behind a
> marked divider. What follows is the analysis the decisions came from.


Written overnight, as asked, for the morning's session. Everything below
that is a number was measured against the current build; everything that is
an opinion is marked as one. The older `cards.md` still holds for card
*kinds* and batch discipline — this document is about what has changed
around the deck since it was written, which turns out to be nearly
everything.

## The census

134 events. Measured across six 60-turn bot games in the city-only build,
plus a condition sweep across probed city states from turn 1 to a maxed
late game:

| finding | number |
| --- | --- |
| events whose `cond` can pass in any probed city state | **~28 of 134** |
| events that can never fire — war, country, legitimacy, plant, ally, mirror, agents, all dormant | **~106 (79%)** |
| distinct events actually drawn across six full games | **29** |
| cards drawn per 60 turns | **~10** (one per ~6 turns) |
| mean eligible pool at draw time | **~22** |
| most-repeated card | `old_archive`, in effectively every game |
| conditions reading **suspicion** | **0** |
| conditions reading **loot / carry / keys** | **0** |
| conditions reading **the hunt** | **1** |
| events using "something / somebody" phrasing | **76 of 134** |
| choices marked as gambles | 4 of 377 |
| events carrying any outcome text | **0** |

That last row is the one to sit with, and it is the root of your
"something happened" complaint — see finding 3.

## The findings

### 1. The deck is four-fifths amputated, and the living fifth is a loop

79% of the deck is keyed to systems behind the CITY_ONLY gate. The ~22
cards left cycle forever: `old_archive` comes up essentially every game,
`landlord` and `the_other_one` most games. The de-weighting machinery works
— it is simply rationing a pool a fifth the size it was built for. Nothing
is broken; the knife took the deck's subjects and the deck kept dealing.

### 2. Some of what still fires is *worse* than dead — the heat ghosts

~14 events condition on heat, and they still fire, because heat still
*accrues* in the city (scans feed it) — it just does nothing. So the deck
periodically deals a card about attention, pressure and thin ice
(`thin_ice`, `a_bad_week`, `abuse_report`) whose stakes are a meter the
game retired. The fiction warns about a wolf we shot months ago. These are
incoherent in a way a dead card never is: a dead card is silent, a ghost
card lies.

Meanwhile the pressure that *does* exist — district suspicion, the hunt,
the streets warming under your sweeps — has no cards at all. The deck warns
about the wrong wolf and says nothing about the real one standing in the
map.

### 3. "Something happened" is not a copy problem — the cards have no endings

The event schema is: `title`, `flavor`, `choices[].text`, `apply`. There is
no outcome field. **No card in the game says what happened after you
chose.** The card closes, numbers float to the HUD, and the log records
the label of the button you pressed. The player's sense that every card
ends in "something happened" is exact: the fiction sets up, asks, and
never resolves. Reigns got away with this because the next card *was* the
resolution (your king died of it); here the next card is six turns away
and about something else.

This is the highest-leverage single fix available: an `after` line per
choice — one sentence, in the voice, shown before the card closes. It is
also the cheapest: one field, one render block.

### 4. The deck is placeless in a game that became a place

76 of 134 events speak in "somebody / something / somewhere" — and when
the deck was written, that was honest: the game had no *where*. Now it
does. The map has districts with names and moods, buildings with kinds and
contents, a panel that says "the district is talking" with an exact
figure. Against that, "Something Else Is Already Here" reads like a
telegram from an older game. The old `cards.md` called the specific card
"the single highest-leverage unlock" — the map upgrades since have made
that more true, because now there is real *material* to be specific with:
the deck can name the shopfront on the high street, the district that is
talking, the diary you read two turns ago.

### 5. Cards arrive on a timer, not from your play

The draw rule is: every 4–7 turns, if no card is up, deal one. Nothing you
do causes a card; nothing a card is about need be happening. This is why
the deck feels *beside* the game rather than *in* it — it is the only
system left whose rhythm is disconnected from the loop. Suspicion warms
when you act, wires draw when you take, the hunt comes when you are
caught; the deck fires when the clock says so. (`planted` and `forced`
exist and are the exception — and they are the two mechanisms the old doc
already flagged as under-used.)

### 6. The deck is now the only place the game hides information

The rule — costs shown, outcomes hidden — was inherited from the card
prototype, where hidden outcomes were the whole game. Since then the rest
of this game swore the covenant: every race previewed exactly, every
threat stating its next move, randomness upstream only. The deck is the
last system that conceals. You said the rule is up for debate; my
position, held loosely: **the debate is really about card kinds.**

- A **dilemma** card (trade this for that) gains nothing from hidden
  outcomes — hiding just makes the choice arbitrary, and arbitrary choices
  are why a player stops reading cards. These should preview like the
  panel previews: exactly.
- A **gamble** card is *about* not knowing — and the schema already has a
  `gamble` mark for it, used 4 times in 377 choices. Keep hidden outcomes
  as a marked, rare card kind rather than the default. A gamble that
  announces itself is tension; a gamble wearing a dilemma's clothes is a
  slot machine.
- A **texture** card (the diary; one option: *Close it.*) hides nothing
  because it stakes nothing, and these are the best cards in the game.

So: flip the default to shown, keep hidden as the marked exception. That
also honours what the outcome-text fix starts: cards that resolve.

## The direction — make the deck the game's narrator

One sentence of thesis: **the deck should stop being a second game dealt
on a timer, and become the voice of the first one** — the system that
notices what just happened on the map, names it, and asks you something
about it.

Concretely, ranked by leverage per effort:

1. **Endings** [S] — the `after` field and its render. Kills "something
   happened" at the root. No design risk; do it regardless of every other
   decision.
2. **Re-key the ghosts** [S–M] — the ~14 heat cards are, conceptually,
   suspicion cards already: thin ice, a bad week, an abuse report are all
   "the street is warm" stories. Re-condition them on `suspicion` /
   `caughtHere` / the hunt, and their stakes become real again in an
   afternoon. (Heat-conditioned cards then genuinely cannot fire in
   city-only, which is correct — country cards for a country game.)
3. **Triggered draws** [M] — keep the timer only as a floor ("if the world
   has said nothing in ~8 turns, it speaks anyway"), and add draw triggers
   from the loop: first catch in a district, a landmark taken, a diary
   read, suspicion crossing a band, the hunt arriving, cold storage
   revealing a cluster. `forced` already delivers this kind of card; what
   is missing is the half-dozen call sites that queue them.
4. **The specific card** [M] — the engine picks the real building or
   district the card is about; the flavor names it; while the card is
   open, the map shows it (focus, a mark). The map and the deck finally
   pointing at each other. Every card written after this lands harder.
5. **Cards for the game that exists** [M–L, the batch] — suspicion arcs
   (the neighbour who mentions it, the shopkeeper who has started
   counting the till twice), loot beats (the diary as a forced card — it
   is already the best object in the game and the deck cannot see it),
   scouting fiction (someone has noticed a person walking the streets
   trying handles — that is `perScan`, it deserves a face), and hunt
   escalation beats (which is `systems.md` §H arriving through the deck
   rather than through a new meter).
6. **Retire the dead cleanly** [S] — move the 106 country-and-war cards
   into their own clearly-marked section (they return if the country
   does). The deck file then *reads* as the city deck it is.
7. **Instrument picks** [S] — per-card pick-rate and outcome-delta in the
   harness, per the old doc's Slay-the-Spire discipline. Decide with
   numbers next time, not memory.

## Two worked examples (the shape, not the final words)

**`old_archive` today** — "A Drive Nobody Reformatted. Years of somebody
else's work, still sitting there…" → three choices → numbers float.

Reworked: fires as a `forced` card the turn you take a **server whose
carry rolled cold storage** (the deck noticing the map). Flavor names the
building and the district. Choices preview: *Read it properly* (reveals
the cluster — the cold-storage effect, now narrated), *Sell it on* (+funds,
stated), *Wipe it* (nothing, and the after-line is the reward: "You did
not look. Somewhere, someone sleeps better than they know."). Every path
ends in a sentence.

**`thin_ice` today** — fires off dormant heat; warns about nothing.

Reworked: `cond: s => s.susp.here >= 12` (the district is talking).
"Held Together With Habit — the shopkeeper on ⟨street⟩ has started
counting the till twice." → *Go quiet here* (previewed: this district
cools, stated amount) / *One more job first* (previewed: the next run here
is hotter, stated) / *Send an apology, in cash* (funds, cools more,
after-line about the shopkeeper). The card becomes the suspicion system's
face — pressure that was only arithmetic gets a person.

## For the morning — the decisions, smallest first

1. Ship **endings** for every living card? (My vote: yes, before anything
   else — it is the complaint you actually made.)
2. The transparency flip — outcomes previewed by default, `gamble` as the
   marked exception? (My vote: yes; it joins the covenant and it is what
   the endings fix half-implies.)
3. Re-key the heat ghosts to suspicion/the hunt? (My vote: yes; it is the
   cheapest way the deck starts talking about the real game.)
4. Triggered draws with the timer as floor only? (My vote: yes, but after
   1–3 — it multiplies whatever the cards already are.)
5. The batch: which of the new-system decks first? (My vote: loot beats —
   the diary card alone justifies it — then suspicion arcs.)
6. How far to take the specific card — names in flavor only, or full
   card↔map linkage with focus and marks? (My vote: full linkage; half
   measures here read as typos — a card that names a building the map does
   not acknowledge feels *less* real, not more.)

One older note to retire from the record: the ideas README lists "cards
rarely remember" under gaps — still true — but its traps list has nothing
against any of the above. The traps that *do* apply: no new meters (the
deck must read existing state, not grow its own), and nothing here may
need an exclamation mark.
