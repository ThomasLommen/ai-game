export const meta = {
  name: 'civ-evolution-ideas',
  description: 'Civilizations that evolve deep tech from scratch: 7 lenses, depth-audited, judged',
  phases: [
    { title: 'Research+Generate', detail: 'seven lenses on self-evolving civilizations' },
    { title: 'Depth audit', detail: 'adversarially attack each depth claim' },
    { title: 'Judge', detail: 'rank with audits in hand' },
  ],
}

const PROFILE = `
BUILDER PROFILE:
- Solo hobby builder, loves the whole arc: brainstorm -> build -> debug -> from scratch. Ships browser games/sims (vanilla JS, canvas, PWA, node). Can learn Python/JAX/PyTorch; heavy Claude Code user, comfortable with agents in the loop. Loves the "overnight run writes a report I read with coffee" rhythm.
- HARDWARE: gaming laptop, RTX 5070 laptop GPU (8GB VRAM, CUDA, Blackwell sm_120), 64GB DDR5 RAM. Can run 24/7. Be honest about the 8GB ceiling.
- PHONE CHECK-IN IS A HARD REQUIREMENT: progress must be checkable from a phone — PWA served over Tailscale from the laptop, or pushed to GitHub Pages, plus ntfy.sh push. The 30-second check-in view is a first-class feature.
- Near-zero chores. Occasional god-tier nudges welcome; daily maintenance is not.
- CRITICAL CONSTRAINT: this is a BRAND NEW STANDALONE PROJECT. It must NOT be about, plug into, or evolve any existing game the builder has already made. No "your shipped game" framing anywhere. Invent the world from scratch as part of the project.

THE ASK — read carefully:
The builder wants a GAME-LIKE WORLD where CIVILIZATIONS evolve, survive, and above all INVENT — with genuine DEPTH to the evolution. Their words: "cavemen discovering fire, creates houses, discovers tools and maybe one day in the future creates technology or something wild." They also want worlds that CHANGE, or multiple/changing worlds.

THE HARD PROBLEM (address it head-on, it is the whole ask):
A hand-authored tech tree is NOT depth — it is a finite list the designer already wrote, and watching agents walk it is boring by week 2. Real depth requires a mechanism where the space of possible inventions is UNBOUNDED OR COMBINATORIALLY VAST and the system genuinely discovers within it. Candidate mechanisms worth grounding in research: combinatorial invention over an adjacent possible (Kauffman; W. Brian Arthur's "technology is combination"), autocatalytic sets / artificial chemistry, DreamCoder-style wake-sleep library learning (solve tasks with programs, COMPRESS solutions into new named primitives — those primitives literally ARE the discovered technologies, and they compound forever), program synthesis over a survival DSL, LLM-as-physics adjudicating novel recipes (Infinite Craft's unbounded crafting space) with caching so it is affordable, emergent tool use from multi-agent RL, cultural transmission / iterated learning, niche construction. Say precisely WHY your idea's invention space does not bottom out, and be honest about where it actually does.

WHAT THE BUILDER LIKED, AND WHAT WAS MISSING FROM IT:
They were drawn to two earlier ideas but felt both were missing something:
 (a) "Homunculus" — a Voyager-style local agent whose permanent asset is an ever-growing library of executable skills it writes and tests for itself (retrieve -> generate -> execute -> retry on traceback -> distill into named tested skill -> index; nightly auto-curriculum proposes tasks requiring composition of 2+ existing skills).
 (b) "Ouroboros Forge" — a STaR/rejection-sampling flywheel: a local Qwen3-4B attempts tasks, only trajectories passing a mechanical verifier survive, weekly Unsloth QLoRA finetune on its own verified wins, new checkpoint must beat old on a held-out eval or it is discarded.
DIAGNOSIS of what they were missing: both grow real capability but neither has a WORLD. No place, no scarcity, no stakes, no death, no competition, no history, nothing inhabited — a skill library is a list of functions, a finetuned model is a chart. The fix the builder is reaching for: put those engines INSIDE a world with survival stakes, so the growing skill library IS a civilization's technology, and losing it means the tribe starves. Where it fits your lens, build on these engines rather than ignoring them.

MISSING ANGLES from earlier rounds to weave in where they fit (do not force all of them):
- A NOVELTY/BOREDOM DETECTOR: the system instruments its own surprise (statistical novelty on world state / first-time-ever events) and pushes to the phone ONLY when something genuinely new happened. In a civ sim thousands of things happen nightly — without this the feed is noise. Strongly encouraged.
- Other humans as perturbation: anonymous web visitors or friends can nudge the public world (visitors as weather, omens, a guestbook that becomes scripture) — cheap non-stationarity and a reason the artifact is public.
- Sonification: a generative radio station of the world; the most passive check-in possible (leave it on).
- A physical artifact: a daily receipt-printer chronicle or e-ink frame — the check-in ritual off-screen.
- One shared substrate reused across projects: headless sim harness + lineage/event DB + PWA chronicle + push.
- Benchmark hygiene on a thermally-variable gaming laptop if any fitness signal is timing-based.

WHAT MAKES AN IDEA GOOD HERE:
- Depth mechanism is real, named, and honest about its ceiling.
- Watchable in 30 seconds on a phone AND rewarding to binge for an hour.
- Runs itself; surprises on check-in.
- First genuinely delightful moment within 1-2 weekends (a crude version that already invents something you did not author).
- Still surprising at 6 months.
- Debuggable, tinkerable, buildable solo.

METHOD — DO REAL RESEARCH FIRST: run 4-8 web searches to ground your lens in what actually exists and works right now (papers, live repos, hobby precedents, what fits 8GB VRAM, token costs). Name real repos/papers/models. Do not invent capabilities. Do not recommend dead projects.

Return 5-6 ideas via the structured output tool. Concrete beats poetic: name the data structures, the algorithms, the models, the cadences.`

const IDEA_SCHEMA = {
  type: 'object', required: ['ideas'],
  properties: { ideas: { type: 'array', minItems: 5, maxItems: 6, items: {
    type: 'object',
    required: ['name','pitch','world','invention_engine','why_unbounded','depth_ladder','what_selects','changing_worlds','novelty_detector','phone_view','hardware_use','input_cadence','tech','first_weekend','six_months_later','honest_ceiling','research_notes'],
    properties: {
      name: { type: 'string' },
      pitch: { type: 'string', description: 'two sentences max' },
      world: { type: 'string', description: 'the setting and its physical substrate: what the world is made of, what agents are, what resources exist' },
      invention_engine: { type: 'string', description: 'the exact mechanism by which NEW technologies/capabilities come into existence — data structures and algorithm, not vibes' },
      why_unbounded: { type: 'string', description: 'why the invention space is not a finite authored tech tree; the combinatorics or compression argument' },
      depth_ladder: { type: 'string', description: 'concrete trajectory: what week 1 looks like, then the real rungs, up to the wildest plausible endpoint' },
      what_selects: { type: 'string', description: 'survival/competition pressure: what kills a civilization, what makes one outcompete another' },
      changing_worlds: { type: 'string', description: 'how the world changes over time, or how multiple worlds work' },
      novelty_detector: { type: 'string', description: 'how the system decides something is genuinely new and worth telling you about' },
      phone_view: { type: 'string' },
      hardware_use: { type: 'string', description: 'honest use of 5070 8GB / 64GB RAM, or CPU-only' },
      input_cadence: { type: 'string' },
      tech: { type: 'string' },
      first_weekend: { type: 'string' },
      six_months_later: { type: 'string' },
      honest_ceiling: { type: 'string', description: 'where this ACTUALLY plateaus and roughly when; no salesmanship' },
      research_notes: { type: 'string', description: 'what you verified via web search: repos, papers, models, costs, with names/URLs' },
    },
  } } },
}

const LENSES = [
  { key: 'combinatorial', prompt: `You are a specialist in COMBINATORIAL INVENTION: the adjacent possible (Kauffman), W. Brian Arthur's theory that technologies are combinations of prior technologies, autocatalytic sets, artificial chemistry, crafting-graph algebras, and Infinite-Craft-style unbounded recipe spaces adjudicated by an LLM with aggressive caching. Generate ideas ONLY from this lens: civilizations whose tech tree GENERATES ITSELF by combination, where every discovery expands the set of possible next discoveries. Research how to keep combination semantically meaningful rather than nonsense soup (typed properties, physical attributes, conservation laws, an LLM oracle constrained by a property schema), and be concrete about cost/caching if an LLM adjudicates.` },
  { key: 'library-learning', prompt: `You are a specialist in PROGRAM SYNTHESIS AND LIBRARY LEARNING as the engine of technology: DreamCoder's wake-sleep loop (solve tasks by search, then COMPRESS repeated solution fragments into new named primitives that enter the DSL, then train a neural recognition model to guide future search), Stitch/corpus-compression, LAPS, and Voyager-style skill libraries. This is the single best mechanism for the builder's exact ask, because a compressed abstraction IS a discovered technology: 'make fire' becomes a primitive that every later program can call. Generate ideas ONLY from this lens: agents survive in a world by writing programs, and the library that accretes is the civilization's technology. Research DreamCoder and its successors, what runs on modest hardware, and how to keep the task distribution growing.` },
  { key: 'agent-society', prompt: `You are a specialist in LLM AGENT SOCIETIES: generative agents (memory stream / reflection / planning), Altera's Project Sid (1000+ agents developing specialization, governance, religion, economies in Minecraft), cultural transmission and iterated learning, emergent institutions, norms and myth. Generate ideas ONLY from this lens: small societies whose CULTURE and KNOWLEDGE compound across generations — elders teach children, knowledge is lossy in transmission, writing/records change everything when invented. Research honest token economics: what a local 7B/4B on 8GB VRAM can sustain 24/7 versus a small Claude Haiku budget, and design tick cadences that keep it under roughly a dollar a day. Be rigorous that culture is GROUNDED in a hard deterministic sim substrate, not free-floating prose.` },
  { key: 'embodied-rl', prompt: `You are a specialist in EMBODIED MULTI-AGENT LEARNING: Neural MMO, OpenAI's emergent tool use (hide and seek), evolving bodies and brains together, niche construction, GPU-vectorized worlds (JAX / Brax / Jax2D / Craftax), curriculum from competition. Generate ideas ONLY from this lens: technology as LEARNED and EVOLVED behavior in embodied agents — using a tool, building a shelter, controlling fire — emerging from survival pressure rather than symbolic recipes. Research what actually fits and trains on a single 8GB GPU overnight, and be honest about how many capability tiers are realistically reachable versus advertised.` },
  { key: 'changing-worlds', prompt: `You are a specialist in WORLDS THAT CHANGE AND MULTIPLE WORLDS: climate cycles, tectonics, ice ages, seasons over millennia, catastrophes and extinction events, migration and colonization, island biogeography and allopatric divergence, procedurally generated planets with DIFFERENT PHYSICS or resource distributions, and comparative-civilization science across parallel worlds run in parallel. Generate ideas ONLY from this lens: the world is the antagonist and the curriculum — civilizations must adapt, migrate, or die, and running many divergent worlds side by side is the product. Research planet/world generation, environment-generation-as-curriculum (UED), and how to run many worlds in parallel on this hardware.` },
  { key: 'chronicle', prompt: `You are a specialist in DEEP HISTORY SIMULATION AND CHRONICLE GENERATION: the Dwarf Fortress legends lineage, Ultima Ratio Regum, procedural mythology, dynasties, wars, named artifacts, ruins and archaeology of earlier ages, and history that is READ rather than watched. Generate ideas ONLY from this lens: the artifact the builder checks on their phone is a living chronicle — an encyclopedia, a newspaper of the age, a museum of invented artifacts — generated from a hard simulation underneath. The invention depth must still be real (combination, library learning, or agent invention), but the DELIVERY is text and archaeology: the joy is reading what happened while you slept and browsing the museum of things that never existed before. Research procedural history generation and how to keep generated text grounded and non-repetitive over months.` },
  { key: 'wildcard', prompt: `You are a wildcard specialist in UNUSUAL SUBSTRATES for evolving civilizations — go where the obvious lenses (combinatorial crafting, library learning, LLM agent societies, embodied RL, world generation, chronicle) do not. Consider: multi-scale bottom-up emergence (artificial chemistry -> protocells -> organisms -> societies, all in one running system); economies and markets as the invention engine (firms, capital, division of labor, patents); language and memetics first (naming games, a religion whose scripture mutates, ideas as the replicating unit); civilizations of PROGRAMS competing for cycles inside a VM who invent by editing code; insect-scale superorganisms scaling to cities; civilizations that must discover the laws of their own physics through in-world experiment (science as the tech engine); a world where the player is a myth and belief is a resource. Generate ideas ONLY from outside the obvious buckets. Research feasibility of whatever you pick.` },
]

phase('Research+Generate')
const audited = await pipeline(
  LENSES,
  l => agent(`${l.prompt}\n${PROFILE}`, { label: `ideas:${l.key}`, phase: 'Research+Generate', schema: IDEA_SCHEMA })
        .then(r => r ? r.ideas.map(i => ({ ...i, lens: l.key })) : []),
  (ideas, l) => ideas.length === 0 ? [] : agent(
      `You are a ruthless simulation-design critic with deep knowledge of artificial life, program synthesis, multi-agent RL and procedural generation. Below are ${ideas.length} project ideas for a civilization-evolution simulator. The builder's central demand is DEPTH: they want cavemen discovering fire, then houses, then tools, then eventually something wild — via genuine discovery, not a hand-authored tech tree walked by bots.

For EACH idea, attack the depth claim as hard as you can and answer honestly:
1. Does the invention space actually stay open, or does it bottom out? Where EXACTLY does it stop, and after roughly how many weeks of running?
2. Is the "discovery" real, or is it the designer's authored content being revealed in a random order? (This is the most common fatal flaw — be merciless about it.)
3. Is the depth mechanism computationally honest on ONE 8GB laptop GPU running overnight, or does it quietly need a datacenter / a big API bill?
4. Semantic-nonsense risk: does the combination/generation mechanism produce meaningful technologies or drivel that only LOOKS like a tech tree?
5. What ONE change would most raise its real ceiling?
Also flag any research claim in research_notes that you believe is wrong, dubious, or post-dates what you can verify.

Score reaches_depth: "yes" (genuinely open-ended for 6+ months), "partial" (real discovery but a visible ceiling within months), "no" (authored content in disguise, or the mechanism will not work as described).

IDEAS (JSON):\n${JSON.stringify(ideas, null, 1)}`,
      { label: `audit:${l.key}`, phase: 'Depth audit', effort: 'high', schema: {
        type: 'object', required: ['audits'],
        properties: { audits: { type: 'array', items: {
          type: 'object', required: ['name','reaches_depth','ceiling','authored_content_risk','compute_honesty','one_change'],
          properties: {
            name: { type: 'string' },
            reaches_depth: { type: 'string', enum: ['yes','partial','no'] },
            ceiling: { type: 'string', description: 'where and when it actually stops' },
            authored_content_risk: { type: 'string' },
            compute_honesty: { type: 'string' },
            semantic_risk: { type: 'string' },
            one_change: { type: 'string', description: 'the single change that most raises the ceiling' },
            dubious_claims: { type: 'string' },
          } } } },
      } }
    ).then(a => {
      const byName = {}
      ;(a && a.audits || []).forEach(x => { byName[x.name] = x })
      return ideas.map(i => ({ ...i, audit: byName[i.name] || null }))
    })
)

const all = audited.filter(Boolean).flat()
log(`${all.length} ideas generated and depth-audited`)

phase('Judge')
const JUDGE_SCHEMA = {
  type: 'object', required: ['ranked','missing_angles','synthesis'],
  properties: {
    ranked: { type: 'array', minItems: 8, maxItems: 10, items: {
      type: 'object', required: ['name','lens','score','why','risk','depth_verdict'],
      properties: {
        name: { type: 'string' }, lens: { type: 'string' },
        score: { type: 'number' },
        why: { type: 'string' },
        risk: { type: 'string' },
        depth_verdict: { type: 'string', description: 'your own call on whether the depth is real, informed by the audit' },
        combo_with: { type: 'string' },
      } } },
    synthesis: { type: 'string', description: 'if the best answer is a hybrid of 2-3 pool ideas, describe that hybrid concretely in a paragraph' },
    missing_angles: { type: 'array', items: { type: 'string' } },
  },
}
const verdict = await agent(
  `You are a sharp, skeptical judge of simulation-game design with deep ML and ALife knowledge. Rank the BEST 8-10 ideas for THIS builder. Each idea carries an adversarial depth audit — weight it heavily but form your own view; auditors sometimes over-penalize good ideas and under-penalize elegant-sounding ones.

Judge hard on: (1) is the invention depth REAL — would month 3 contain technologies the builder never authored and could not have predicted; (2) does a 30-second phone check-in actually delight, and is there something to binge; (3) honest fit to one 8GB laptop GPU with near-zero chores; (4) a delightful crude version within 1-2 weekends; (5) still surprising at 6 months. Punish: authored tech trees in disguise, LLM-adjudication cost bombs, semantic nonsense generators, datacenter fantasies, ideas whose first cool moment is a month of infrastructure away. Reward: mechanisms where the builder can READ what was invented and see it is genuinely novel.

Then, in 'synthesis', describe the single best hybrid you would actually build, drawing concretely on 2-3 pool ideas — this is likely more valuable than any single pitch.

${PROFILE}

IDEA POOL WITH AUDITS (JSON):\n${JSON.stringify(all, null, 1)}`,
  { label: 'judge', phase: 'Judge', schema: JUDGE_SCHEMA, effort: 'high' }
)
return { all, verdict }