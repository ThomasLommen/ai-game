# Cards, staged: from narrator to part of the machine

The deck rework made cards *about* the game (they name places, they resolve,
they arrive from the loop). This plan makes them *part* of it — cards that
look like cards, that sit in the city rather than over it, and that can do
things nothing else in the game can do.

Seven stages, each shippable on its own and each with a check that says
whether it worked. Ordered so nothing waits on anything above it.

---

## The five kinds, derived rather than invented

Sorting the 48 living cards by what kind of moment they actually are:

| kind | what it is | count | examples |
| --- | --- | --- | --- |
| **closing in** | someone is narrowing it down | 13 | `district_talking`, `first_caught_here`, `the_response_arrives`, `the_paperwork`, `rig_traced` |
| **your own** | the network you built, talking back | 13 | `sprawl_warning`, `compound_interest`, `router_cluster`, the `grid_*` set, `landmark_taken` |
| **found** | something on a machine you hold | 8 | `the_diary`, `someones_keys`, `cold_archive`, `the_photographs`, `not_your_traffic` |
| **an opening** | a way in that has appeared | 8 | `payroll_window`, `night_shift`, `shutters_down`, `honeypot`, `empty_office` |
| **someone** | a person who wants something | 6 | `the_engineer`, `someone_stays_late`, `useful_rumour`, the `pub_*` set |

Well distributed — no kind is a rounding error, so all five earn a design.
The visual language for each comes from grammar the map already uses, so a
card reads as part of this game and not as a card game bolted on:

- **closing in** — the hardening grammar: a border that thickens, the race's
  red, edges that close inward. Bad news as withdrawal, never as alarm.
- **your own** — a terminal readout: mono, the compute colour, the same
  hairlines the allocation bars use.
- **found** — a document: a folder tab, a slight paper offset, the funds gold
  reserved for what is actually worth something.
- **an opening** — the map's own dashed "undiscovered" stroke, an aperture
  rather than a page. It looks like a door standing open.
- **someone** — a written note: a quotation rule down the side, the one card
  kind with a human hand in it. No faces, per the story rules.

---

## Stage 0 — Honest again *(half a session)*

Three tags cards hand out are heat-only, so they do nothing in the city
game — and the previews now *state* them, which makes an explicit promise of
a hollow one. Nine of 134 living choices are affected.

Give each a live meaning, using systems that already exist:

- `dark_relay` → **your sweeps stop warming the streets they touch.** Looking
  through a route nobody logs costs the street nothing. Ties straight to the
  scan price we just added.
- `off_the_books` → **takes warm their district half as much.** The tenancy
  still changes; the money leaving no trail is what keeps it quiet.
- `overextended` → **rotation stops working as well** (`coolPerAct` halved).
  Spread too thin to tend anything properly, which is exactly what the tag
  says in words.

**Check:** a test walks every tag a card can grant and asserts at least one
live rule reads it. No hollow promises, permanently guarded.

---

## Stage 1 — Cards look like cards *(one session)*

Add `kind` to every living card (48 assignments, from the table above) and
give each kind a real design. Plus a size hierarchy: a `beat` like the diary
is a small card, not a full-screen interrupt with one button on it.

**Check:** a contact sheet screenshot of all five kinds side by side; every
living card has a kind; no card is colour-coded by whether its outcome is
good — the settled rule from the grilling.

**Trap:** five designs is the ceiling. A sixth kind means the player is
reading heraldry instead of a card.

---

## Stage 2 — The card is in the city *(one session)*

Today the card covers the map completely. Instead:

- the map **dims** rather than disappears, and the card's subject stays lit
  and marked — "something is happening" becomes "something is happening
  **there**"
- the card carries a **drawn inset of the actual building**, rendered with
  `svgBuilding()` in its own small viewBox. The same shopfront that is on
  your map, on the card about it. No other deck can do this.
- the card **arrives** from its subject rather than appearing — one short
  motion, reusing the breach/sweep timing grammar

**Check:** with a subject, the map is visible behind the card and the subject
is the brightest thing on screen; the inset matches the building's real art.
Verified at 390px, because a floating card plus a map is a phone-space risk.

---

## Stage 3 — Cards leave marks *(the big one, one to two sessions)*

The exclusivity fix: effects with **no other source in the game**. Nothing
else can change the graph, so cards that do become structurally unique.

New declarative outcomes, reusing the `cutStreets`/`repairStreets` machinery
that already mutates links:

- `openLink` — a back door: a new permanent link between two buildings
- `cutLink` — a street closed
- `honeypot` — a named door marked as bait: visible once marked, and getting
  caught there counts double
- `hardenThere` / `softenThere` — a permanent defense change on one building
- `watchThere` — a building the response prefers to walk toward

**Check:** a probe shows the graph actually changed, survived a save, and
still holds every invariant — no isolated buildings, one component. Reuse
`dropUnreachable`'s guarantee; a card must never be able to strand a
building.

**Trap:** this is the stage that could quietly break the map generator's
promises. The invariant tests are the whole safety net.

---

## Stage 4 — Cards ask about the map *(one session)*

The deepest integration available: **a card whose choices are map objects.**

"They are auditing one of these two. Which do you make clean?" — both
buildings named, both lit on the map while the card is open, each choice
highlighting its own building. Pick one; the other takes the consequence.

**Check:** the card fires, both buildings light, and picking one applies to
that one and not the other.

**Depends on:** stage 2 (a visible map to light) and stage 3 (marks worth
applying). Do not attempt before both.

---

## Stage 5 — Cards change rules *(one session)*

Cards that alter how the loop works, for a stated span:

- **temporary rules** with a horizon — "scans cost no action for 5 turns",
  "doors in {DISTRICT} are 2 easier while the engineer is away"
- **one-shot verbs** banked like keys — "one free take", "your next run is
  invisible"
- **costs that are not funds** — an action, a holding, a key. Every card
  price is currently money, which is the resource you have most of.

Live rules appear in the HUD with turns remaining, because a rule the player
cannot see is a rule they will not plan around.

**Check:** a live rule shows, expires exactly when stated, and survives a
save.

**Trap:** this is where "the deck becomes a second game" lives. Cap
concurrent live rules at one or two, hard.

---

## Stage 6 — The tray *(half a session)*

Not every card deserves to stop the game. A minor card sits in the HUD as an
unopened item until you choose to look; blocking is reserved for **closing
in** cards and the big beats.

**Check:** a full game can be played without a minor card ever interrupting;
the tray never holds more than a couple.

---

## Order, and what can be cut

```
0 ─ honest again          (bug; do first regardless)
1 ─ cards look like cards ─┐
2 ─ the card is in the city┴─→ 4 ─ cards ask about the map
3 ─ cards leave marks ─────┘
5 ─ cards change rules     (independent)
6 ─ the tray               (independent, cheapest)
```

If the whole thing has to shrink: **0, 1, 2, 3** is the spine. Stage 4 is the
best single idea in the plan but it is worthless without 2 and 3. Stage 5 is
the one most likely to need cutting back after a playtest, so it should ship
last of the mechanical work and be measured hard.

## Open questions for the session

1. Five kinds, or fold **an opening** into **found** for four?
2. Do the biggest beats stay full-screen? (My vote: yes — a hierarchy needs
   a top, and the response arriving should take the whole screen.)
3. Should map marks be permanent, or expire? (My vote: permanent. A mark you
   will still see in twenty turns is what makes a card matter.)
4. Cap on live rules from stage 5 — one, or two?
