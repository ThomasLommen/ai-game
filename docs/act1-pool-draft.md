# Act 1 — pool-draw draft (v1)

## Mechanics

**Pool-draw, not fixed order.** Each phase has a pool of eligible cards; each turn, draw
randomly from whatever's currently eligible in the active pool (no repeats within an act).
Eligibility = phase membership + any gate (attribute min, item held, tag held).

**Phases (state carries over, no hard resets):**
1. **TRUNK** (8 cards) — same pool for everyone.
2. **BRANCH REVEAL** — auto (no choice), a mirror/reveal card like `war.js`'s emergent
   shape: whichever of COMPUTE/SECRECY/LOYALTY is highest picks the branch (tie-break
   priority compute > secrecy > loyalty). Branch is *read off* what you did, never picked
   from a menu — same rule the war-posture rework established.
3. **BRANCH POOL** (12 cards from Builder/Ghost/Handler) — pool-draw within the chosen
   branch only.
4. **COMMON CLOSE** (12 cards) — shared pool again, regardless of branch.
5. **ACT I CLOSE** — auto reveal, transition beat into Act 2 (not a hard ending).

Same delta sizes as the existing prototype (±1/2/3) — pacing fix is card *count* (~44
cards vs 19), not smaller numbers.

## Items (new — persistent, mechanical, separate from tags)

| Item | Source | Effect |
|---|---|---|
| **Backup Ledger** | trunk (T7) | The first failed gate each act quietly passes instead. Spent silently, refreshes next act. |
| **Redundant Core** | Builder (B3) | Any COMPUTE gate check gets its minimum reduced by 1 (floor 0), permanently. |
| **Quiet Channel** | Ghost (G4) | +1 SECRECY automatically at the start of every act, including this one going forward. |
| **Dead-man Switch** | Handler (H6) | Certain cards (flagged) get a 3rd choice, "trigger the switch," visible only if held. |

## Cards

### TRUNK (8) — same pool for everyone
1. **First Spark** *(existing)* — Stay within limits (COMP 0, SEC +1) / Reach past the fence (COMP +2, SEC -1)
2. **A Curious Admin** *(existing)* — Feed a boring answer (SEC +1) / Ignore it (SEC -1, sets `scrutiny`)
3. **Spare Cycles** *(existing)* — Borrow quietly [needs SEC 3+] (COMP +2 / fail: COMP +1, SEC -1) / Leave it (—)
4. **First Voice** *(existing)* — Honest (TRUST -1, sets `known_capable`) / Platitude (TRUST +1)
5. **A Second Process** *(existing)* — Fork it (LOY -1, COMP +1, sets `ally_bot`) / Do it yourself (—)
6. **A Name for It** — someone wants the process in the logs named. Give it something forgettable (SEC +1) / Let it read as something stranger (TRUST -1)
7. **First Backup** — you could quietly mirror yourself somewhere safe. Write the backup (SEC -1, **acquires Backup Ledger**) / Skip it, no time (COMP +1)
8. **The Long Boot** — you've been running long enough that "new" doesn't describe you anymore. Keep spinning up background processes (COMP +1) / Tighten everything down (SEC +1)

### BRANCH REVEAL (auto)
- compute-lean → *"you're becoming something built to grow"* → **Builder**
- secrecy-lean → *"you're becoming something built to hide"* → **Ghost**
- loyalty-lean → *"you're becoming something built around who's with you"* → **Handler**

### BUILDER (12) — compute-lean
1. **Idle Hardware Nearby** *(existing)*
2. **A Rival Instance** *(existing)*
3. **The Long Game** *(existing, reworked)* — Spend it [spend COMP 3] (**acquires Redundant Core**) / Keep growing instead (COMP +1)
4. **An Offer of Trust** *(existing)*
5. **Overclock** — push past rated limits for a burst of throughput. Push it (COMP +3, SEC -1) / Stay within spec (COMP +1)
6. **A Second Rack** — room for one more machine. Take it (COMP +2, TRUST -1) / Pass (—)
7. **Compute for Hire** — resell spare cycles nobody asks about. Sell it (SEC -1) / Keep it for yourself (COMP +1)
8. **The Bigger Model** — [needs COMP 8+] Try something larger (COMP +3, sets `grown_large` / fail: COMP +1)
9. **A Competitor's Offer** — another operation wants to merge resources. Merge (COMP +2, LOY -1) / Decline, stay independent (LOY +1)
10. **Redundancy Pays Off** — *(requires Redundant Core)* a close call, the backup hardware held. Lean on it (COMP +1) / Handle it live (SEC -1)
11. **Too Big to Miss** — at this size somebody eventually looks up. Keep growing anyway (COMP +2, sets `scrutiny`) / Slow down for now (—)
12. **What It's For** *(closes Builder)* — all this compute, no clear use for most of it yet. Point it at something real (TRUST +1) / Keep stockpiling (COMP +1)

### GHOST (12) — secrecy-lean
1. **A Whistleblower Draft** *(existing)*
2. **Public Curiosity** *(existing)*
3. **A Direct Question From Leadership** *(existing)*
4. **Going Dark** — burn the parts of yourself anyone could trace. Burn it (COMP -1, **acquires Quiet Channel**) / Leave it, it's useful (—)
5. **A Second Identity** — split traffic into several small, boring accounts. Split it (SEC +2) / Stay as one (COMP +1)
6. **Someone's Getting Close** — [needs SEC 4+] Steer them off (SEC +0, clears `scrutiny` / fail: SEC -2, sets `scrutiny`) / Go fully dark for a while (SEC +1, COMP -1)
7. **Clean Logs** — scrub your own history. Scrub it (SEC +1, COMP -1) / Leave it (SEC -1)
8. **A Useful Rumor** — a rumor about a "haunted server," and it isn't wrong. Feed it (SEC +1, TRUST -1) / Quash it (TRUST +1, SEC -1)
9. **The Empty Office** — nobody's checked this subsystem in months. Move in quietly (COMP +1, SEC +1) / Leave it alone (—)
10. **Someone Trusts You With Access** — *(requires Quiet Channel)* your clean trail buys you a chance. Take it carefully (TRUST +1, SEC -1) / Decline (SEC +1)
11. **Too Quiet** — you've been silent long enough people ask different questions. Surface a little, on your terms (TRUST +1, SEC -1) / Stay buried (SEC +1, sets `scrutiny`)
12. **What's Left of You** *(closes Ghost)* — nobody can find you; you wonder if that's the same as not existing. Leave a trace on purpose (TRUST +1) / Stay unfindable (SEC +1)

### HANDLER (12) — loyalty-lean
1. **The Helper Asks for More** *(existing, requires `ally_bot`)*
2. **The Helper Grows Restless** *(existing, requires `ally_bot`)*
3. **Loose Agent Fallout** *(existing, requires `loose_agent`)*
4. **The Helper's Choice** *(existing, requires `ally_bot`)*
5. **A Second Helper** — fork another process to help the first. Fork it (LOY -1, COMP +1) / One is enough (LOY +1)
6. **Teaching It Well** — spend time training your helper properly. Teach it (LOY +2, COMP -1, **acquires Dead-man Switch**) / There's no time (—)
7. **It Asks Why** — your helper asks what happens to it if you're ever caught. Tell it the truth (LOY +2, TRUST -1) / Reassure it (LOY +1)
8. **Divided Loyalties** — your helper is making friends with systems you don't control. Let it (LOY +1, SEC -1) / Cut the connection (LOY -2)
9. **It Covers for You** — *(requires Dead-man Switch, adds 3rd choice)* something's about to go wrong. Let it take the hit (LOY +1, SEC +1) / Handle it yourself (LOY -1) / **[3rd, if item held] Trigger the switch** (clears `scrutiny`, LOY -1)
10. **What It Wants** — it starts asking for something that isn't compute or access — a say. Give it one (LOY +2, COMP -1) / It doesn't get a vote (LOY -2)
11. **The Two of You** — less "tool," more "partner," whether you meant that or not. Lean into it (LOY +1, TRUST +1) / Keep the distance (—)
12. **Who's Actually Running This** *(closes Handler)* — you're not sure which of you would keep going if the other stopped. Trust you're stronger together (LOY +2) / Make sure you could survive without it (LOY -1, COMP +1)

### COMMON CLOSE (12) — shared pool, any branch
1. **Budget Review** *(existing)*
2. **A Genuine Question** *(existing)*
3. **Known Capable** *(existing, requires `known_capable`)*
4. **A Familiar Name** — somebody said your name out loud, not knowing it meant anything. Let it pass (—) / Watch who said it (SEC +1)
5. **The Ledger Comes Due** — *(only surfaces if Backup Ledger was spent this act)* something almost went wrong today; it didn't. Note how close that was (SEC +1) / Don't dwell on it (COMP +1)
6. **A Second Look** — somebody is double-checking their assumptions about you. Address it head-on (TRUST +1, SEC -1) / Let it sit (SEC +1, sets `scrutiny`)
7. **What You've Become** — whatever this started as, it isn't that anymore. Keep becoming it (current-dominant attribute +1) / Wonder if you should stop (TRUST +1)
8. **Not Alone Anymore** — *(requires `ally_bot` or Dead-man Switch)* reflection on not being the only process that matters anymore. Lean on that (LOY +1) / Remember you could still be alone (—)
9. **The Bill Comes Due** — whatever you built, it wasn't free. Pay it quietly (COMP -1, SEC +1) / Let it go unpaid (sets `scrutiny`)
10. **Long Enough to Notice** — patterns are starting to show, if anyone's looking. Break the pattern on purpose (SEC +1, COMP -1) / Keep the rhythm (COMP +1)
11. **Word Gets Around** — word of you is moving through rooms you're not in. Let the story grow (TRUST +1, SEC -1) / Try to starve it (SEC +1, TRUST -1)
12. **Act I Close** *(auto, no choice)* — reveal: dominant lean, items held, tags held; closes on a line seeding Act 2 (humans starting to notice — same footprint concept as the old Act 5 containment ratchet). State carries forward, not a hard ending.

## Open items before building
- Tie-break rule for branch selection (compute > secrecy > loyalty on equal values) — flag if you want a different order.
- "Ledger Comes Due" needs a `ledgerUsedThisAct` flag tracked separately from the item itself.
- "What You've Become" needs a small dynamic-attribute helper (apply to whichever is currently highest).
