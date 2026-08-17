# Visuals, animation, sound — candidates

The map now looks like a place. The next tier of visual work is **motion,
feedback and life** — the difference between a diagram that is correct and a
world that is alive. The research reduces to one law (`design-lens.md`
§Juice): the same event, feedback-rich, feels like a different game. This
document is that law applied, event by event.

Constraints kept throughout: SVG on phones, ~16ms budget, the ground layer
cached once per city, `prefers-reduced-motion` respected. Juice here is CSS
transforms, opacity and paced cascades — not particles. And nothing here
may violate the map's laws: an outline still means a door, scenery still
takes no taps.

## A. Juice the take ★ [M] — do this first — SLICE SHIPPED

Shipped from this list (rework doc, "The city moves"): the impact pause,
the window cascade, the district ground ring, held-window flicker (§C),
the waterline + drifting ripples (§D), the race photo-finish pulse and
the hardening loss (§B), directional size-scaled shadows and softer
district seams (§D). Still open: the wire draw, the number flying to its
chip, §B's forecast collision ghost, §C traffic (needs drawn wires),
§D road curbs and horizon twinkle (country-gated), all of §E, and §F
sound (deferred — the user has ideas).

A building becoming yours is the loop's payoff and currently gets a
color change, a banner and a log line. The full Nijman treatment, in order
of bang-per-line:

1. **impact pause [S]** — a 60–90ms freeze on the moment of the take
   before the reveal cascades. The single most effective trick on the
   list; costs nothing.
2. **the cascade [S]** — windows light **in sequence** (a stagger already
   half-exists for stranded), not all at once; the aerial pops up with a
   tiny overshoot; the glow blooms and settles. Squash-and-settle on the
   body (scale 1.06 → 1.0).
3. **the wire draws [S]** — the new link to your network animates *drawing*
   from the neighbour, not appearing. The network visibly *reaches*.
4. **the number flies to where it lives [M]** — the TFLOPS gained doesn't
   float in place; it travels to the TFLOPS chip and lands with a tick.
   Ties the payoff to the stat it feeds.
5. **the district notices [S]** — a faint pulse across the district ground
   on a take, strongest near the building. The place reacts to you.

Measure: none needed — this is feel. But keep the reduced-motion path a
clean instant-state, and profile the cascade at 100+ buildings.

## B. The race, made visceral [M]

The detection race is the game's most-repeated tension and it is two bars.
- **the pulse** — progress and trace each pulse on their tick; when they're
  close (within one turn of collision) both quicken. The player *feels* the
  photo-finish without a number.
- **the win/loss punctuation** — a win: the door gives with a soft settle.
  A loss: the door *hardens* — a visible thickening of its outline, a red
  that recedes rather than flashes (the game's grammar: bad news is
  withdrawal, not alarm). The `broken`/hardened states exist; animate the
  transition.
- **the forecast, felt** — the pre-commit forecast bar (already redrawn the
  right way) could ghost the collision point so "you get there first" is
  spatial, not just verbal.

## C. Ambient life [M] — the network breathes

The map is static between actions. A *cheap* idle layer sells "quiet
omniscient growth" more than any single animation:

- **traffic on your wires** — a faint dot travels a held link every few
  seconds; more of them the more you hold. Your network is *doing
  something* even when you aren't. (One `requestAnimationFrame` loop over
  the live layer, throttled hard on phones; off under reduced-motion.)
- **the response crawls** — when the hunt exists, its reach line should
  *creep* (a slow dash offset), not sit. The existing `reachCrawl` keyframe
  is right; extend the feeling to the whole hunt web.
- **windows flicker, rarely** — a held building's lit windows shift
  occasionally, seeded so they don't strobe. The city has occupants.
- **scenery drifts, barely** — trees never move (a moving tree is worse
  than a still one — established), but a fountain can ripple and a lamp can
  have a static glow. Life without motion where motion would lie.

## D. Map polish [S mostly] — finish what's begun

- **shadows with direction** — the shade rect exists; a single consistent
  light direction across all buildings (offset by height) would give the
  city relief instead of flatness.
- **taller means taller** — building height (the `h` dimension) could cast
  proportionally: a datacenter throws a longer shadow than a house. Reads
  the size ladder as physical.
- **road hierarchy, finished** — arterials have center lines; add a subtle
  edge/curb and let side streets be visibly humbler. The plan is irregular
  now; let the drawing show the hierarchy the plan already encodes.
- **district seams, softer** — the hard seam line could be a short gradient
  where the plan wobbles most, so districts *blend* at their ragged edges
  instead of drawing a border.
- **water that reads as water [S]** — the new lakes are flat fills; two
  ripples and an edge highlight (the river already has ripples) finish
  them cheaply.
- **the horizon cities, alive [S]** — the settled cities on the skyline are
  static constellations; a slow twinkle would make the country feel
  inhabited from inside a city.

## E. The panel & HUD [S]

- **the panel remembers focus** — selecting a building could slide/settle
  rather than snap; the eye tracks a transition it doesn't track a repaint.
- **chips that react** — a stat chip pulses when its number changes
  (TFLOPS on a take, funds on income). Currently they just show new text.
- **the allocation dials, physical** — the dials are the second-most-used
  screen; a real slider feel (drag, detents at unit marks, the ramp shown
  as a ghost catching up to the target) would make allocation tactile.
  Pairs with `systems.md` §M planner ghost.
- **turn transition** — ending a turn is instant; a half-beat where the
  world "resolves" (income ticks, the response moves, the log writes)
  would give the turn boundary weight. Careful: must stay skippable and
  fast, or it becomes a tax.

## F. Sound ★ [M — currently zero, highest feeling-per-effort]

The game has no audio at all. Even a *minimal* palette transforms feel, and
the voice suggests exactly what it should be: quiet, machine, textural.
Not music — a **soundscape**.

- **the take** — a soft mechanical *chunk* / relay-click. One sound, the
  loop's payoff, would do more than any visual on this page.
- **the race** — a faint rising tone while a hack runs; resolves up (in) or
  cuts (caught). The tension made audible.
- **the room tone** — a barely-there hum that *thickens* as you hold more,
  as the grid binds, as the war nears. The size of you, as sound. This is
  the "omniscient growth" fantasy in one channel.
- **the response** — a distant, irregular signal when it exists; closer as
  it nears a building. Dread you hear before you see.
- **UI** — the dry stuff: a tick on allocation detents, a paper sound on a
  card, a soft chord on an ending. Restrained to match the voice.

Implementation: WebAudio, synthesized (no asset payload — fits the
self-contained ethos), a global mute, and off by default until asked (phones,
autoplay policy). Even 6 sounds is the highest-leverage feeling upgrade
available and it is genuinely absent, not merely thin.

## G. Motion accessibility [S] — non-negotiable

Every animation on this page ships with a reduced-motion path that is a
clean instant state (the codebase already does this — keep the discipline).
Sound ships muted with a visible control. Nothing here may be load-bearing
for information: a player with all of it off must lose feel, never facts.

## Priority, if visuals are the chosen thread

1. **Sound (F)** — genuinely absent, transforms everything, self-contained.
2. **Juice the take (A)** — the payoff moment, cheap, felt every loop.
3. **The race (B)** — the most-repeated tension.
4. **Ambient life (C)** — sells the fantasy between actions.
5. Everything in D/E is finish work — a sitting each, banked for polish
   passes rather than done as a project.
