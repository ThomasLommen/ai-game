# The card covenant — making the deck a living world

Playtest verdict (2026-08-23): the deck read as "get this resource / choose
between these resources" — dull, unimportant, no sense that the world is
alive and reacting. Census confirmed it: of ~63 living city cards, nearly
every one resolved to funds and/or suspicion; ~12 touched the map; chains
existed only in the ally line and the hunter warning/bite/counter sets;
recurring people: the ally, nobody else.

## The law

Every city-deck card must do at least one of:

1. **Change the map, visibly** — a mark, a street, a building's fate.
2. **Change a rule** — a timed CARD_RULE or a permanent tag.
3. **Advance a person** — shift a face's stance; the face returns.
4. **Schedule a consequence** — a named sequel planted with a stated
   shape and turn-range ("within the week").

Funds may sweeten a choice; they may never be the card. Declared per card
in a `covenant: [...]` field, validated by the deck lint test, which
ratchets: the covenant-bearing count only goes up.

Randomness ≤ 1/4 of draws unprompted; the rest keyed to the ledger of the
player's own acts or to world thresholds. Sequel timing rolls when the
choice resolves (seeded), upstream of the sequel itself.

## The faces

Recurring people with serialized stance (-3..3), spoken in words under
their name, read as a number by conds:

- **the fixer** — keys and doors; his ledger is the deck's first taught
  lesson in consequence (locksmiths_ledger → book_changes_hands).
- **the inspector** — red tape made human; lives at the works fence.
- **the journalist** — the public lens on-ramp for W5; prints what you
  feed her, watches what you don't.

Portraits: single-trace profile busts (D2 bench verdict) — deliberately
human against the machine, sage line with a faint gold ghost, gold only
in the eyes. Stance line renders under the card title.

## Dress tiers

ordinary gold → **incident** (weathered orange; the world moving) →
story beat (moon silver; an act turning).

## Shipped in phase 1 (this commit)

- Engine: faces store + stance lines, recent-acts ledger (burn/catch/
  transit/ground/job), planted sequels carry subjects + ranged timing,
  choice `need`/`needText` gates, scratch verbs (face, hardenNeighbours,
  hardenDistrict, watchWarmest, tapeProofNow, buildDelay, boardUp),
  watched_roads rule via one truckSpeed(), boarded dress (plywood planks).
- Cards: locksmiths_ledger (replaces the_locksmith), book_changes_hands,
  the_vigil, pothole_petition, clipboard, column_inches, sold_for_parts.
- Covenant lint in the test suite.
- Wave 2: nine of the flattest merchants deepened in place, keeping
  their fiction — net_curtains (the street watches back), empty_office
  and landlord (a way through, permanently), curfew_talk (organised
  streets harden), dead_drop (it is the fixer's drop), buried_archive
  (the journalist's byline), the_paperwork (the inspector files the
  gap) — plus covenant tags on already-compliant cards. Ratchet at 21.

## Phase 2 shipped — card-called works

The works' big verbs are ceremonies now. The lot's *break ground* and the
works panel's *raise* buttons deal a card face-up, instantly (`callCard`:
no flip, no deck timer). The card frames the real ways to do the act —
dawn openly (−6f) vs night quietly (−10f, the street hears nothing while
it builds) for the ground; your own power vs the meter (priced +6, cut-
immune) for each stage — with exact costs as chips (`materials` is a
payable card unit now, drawn from the yard). Every called card keeps a
free walk-away choice. Red tape still gates the call at the button; power
and prices grey with their reasons on the card. The direct verbs
(actBreakGround/actBuildStage) survive for bots and tests.

## Phase 3 shipped — postures own the allocation, the dial retires

Three named stances split the rack by shares, recomputed every turn from
what is usable and not inside a run — growth flows into the lean you
chose with no screen to visit:

- **running quiet** — covert 45 / intel 15 / dev 10, 30 loose
- **the day job** — dev 25 / covert 20 / tempo 15 / intel 10, 30 loose
- **all hands** — dev 35 / tempo 30 / intel 10, 25 loose

Switching is the called card *Change of Posture* (−1 action; the current
stance greys with its name; free walk-away; dense 4-choice card dress).
The bottom-bar button names the current posture and deals the card. The
dial mechanics survive underneath (`posture: null` = manual — engine
tests and the country scope); the allocation sheet only opens for manual
saves. Card-granted permanent bumps ride the existing tag/hardware
channels (clean_room, ally_process) — no new plumbing needed.

## Next (approved plan)

1. Rewrite the worst resource-only offenders as reaction cards (keep
   frequency, deepen weight).
2. ~~Card-called works~~ — shipped, see above.
3. ~~Postures + upgrades, dial retired~~ — shipped, see above.
4. Act 3 war, card-native from birth — parked until Act 2 playtests solid.
