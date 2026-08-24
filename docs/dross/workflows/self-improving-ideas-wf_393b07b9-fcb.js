export const meta = {
  name: 'self-improving-ideas',
  description: 'Research-backed brainstorm: software that improves/evolves its own capabilities',
  phases: [
    { title: 'Research+Generate', detail: 'seven lenses on self-improving systems, web-grounded' },
    { title: 'Judge', detail: 'rank against builder profile' },
  ],
}

const PROFILE = `
BUILDER PROFILE (tailor every idea to this person):
- Solo hobby builder who loves the full arc: brainstorm -> build -> debug -> create from scratch. Has shipped browser games/sims (vanilla JS, PWAs, canvas, node); can learn Python/CUDA-adjacent tooling. Heavy Claude Code user — comfortable putting coding agents in the loop, already loves the "overnight run writes a report I read with coffee" rhythm.
- HARDWARE: gaming laptop, 64GB DDR5 RAM, NVIDIA RTX 5070 laptop GPU with 8GB VRAM (CUDA, Blackwell). Can run overnight or 24/7. Use it: local LLMs, RL/neuroevolution training, massively parallel sims, small model training from scratch. Be honest about the 8GB VRAM ceiling.
- PHONE REQUIREMENT (hard): progress must be checkable from a phone — a PWA/web dashboard served from the laptop (Tailscale/localtunnel) or pushed to GitHub Pages, push notifications, daily digest. The check-in view is a first-class feature, not an afterthought.
- CORE DESIRE: software that IMPROVES ITSELF or EVOLVES ITS OWN CAPABILITIES over time with few or no human inputs. Not scripted growth — genuine open-ended improvement where a check-in can surprise. The "self-improving software" lens is what excites them most: programs that rewrite/retune themselves, capabilities that expand, skill libraries that grow.
- BONUS (not required): over time it could become ACTUALLY USEFUL to them in daily life. Pure-fun ideas welcome too.

WHAT MAKES AN IDEA GOOD:
- The improvement loop is mechanical and honest: what state mutates/trains, what the fitness/feedback signal is, what stops it plateauing. "Capabilities evolve" must mean the system can DO new things later that it couldn't do before (new skills, new tools, new behaviors) — not only a number going up.
- Watchable from the couch/bed: a dashboard, ladder, gallery, feed, or chronicle where the change is visible and delightful in a 30-second phone check.
- Low ongoing input: runs itself overnight or continuously; occasional nudges fine, daily chores not.
- Solo-buildable: first genuinely cool self-improvement moment within 1-2 weekends; no team, no cloud bill bombs (local compute preferred; small LLM API budgets OK if justified).
- Still alive at 6 months: accretes history, keeps surprising.
- Debuggable/tinkerable: opening the hood is part of the fun.

METHOD — DO REAL RESEARCH FIRST: before writing ideas, run 3-6 web searches to ground your lens in what is actually feasible RIGHT NOW (state of local models that fit in 8GB VRAM, current results/repos in your area, hobby-scale success stories, framework maturity). Fold findings into the ideas and into research_notes. Do not invent capabilities; do not recommend dead projects.

Return 5-6 ideas via the structured output tool. Be concrete: name real algorithms, real data structures, real models, real cadences, real repos/papers where relevant. Generic filler is worthless.`

const IDEA_SCHEMA = {
  type: 'object', required: ['ideas'],
  properties: { ideas: { type: 'array', minItems: 5, maxItems: 6, items: {
    type: 'object',
    required: ['name','pitch','self_improvement_engine','capability_growth','phone_view','hardware_use','input_cadence','tech','first_weekend','six_months_later','usefulness_path','research_notes'],
    properties: {
      name: { type: 'string' },
      pitch: { type: 'string', description: 'two sentences max' },
      self_improvement_engine: { type: 'string', description: 'the loop: what mutates/trains, what the fitness/feedback signal is, why it does not plateau' },
      capability_growth: { type: 'string', description: 'what NEW things it can do at month 3 that it could not at week 1 — concretely' },
      phone_view: { type: 'string', description: 'exactly what the phone check-in shows and how it is served' },
      hardware_use: { type: 'string', description: 'how the 5070 8GB / 64GB RAM are used, honestly; or "CPU only, GPU not needed"' },
      input_cadence: { type: 'string', description: 'honest: what the human must do and how often' },
      tech: { type: 'string' },
      first_weekend: { type: 'string', description: 'smallest version that already visibly improves itself' },
      six_months_later: { type: 'string' },
      usefulness_path: { type: 'string', description: 'honest path to being useful in daily life, or "pure fun"' },
      research_notes: { type: 'string', description: 'what you verified via web search: models/repos/results/costs with names' },
    },
  } } },
}

const LENSES = [
  { key: 'evo-code', prompt: `You are a specialist in evolutionary computation over CODE: genetic programming, AlphaEvolve/FunSearch-style LLM-guided evolutionary search, program synthesis, superoptimization, evolving shaders/strategies/heuristics where tests or benchmarks are the fitness function. Research the current state (AlphaEvolve, FunSearch, OpenEvolve and similar open-source reimplementations, hobby GP frameworks) and generate ideas ONLY from this lens.` },
  { key: 'llm-agent-self', prompt: `You are a specialist in self-improving LLM AGENTS: agents that grow their own skill library (Voyager-style), rewrite their own prompts/tools/memory, nightly Claude Code sessions that expand a project from its own roadmap behind fitness gates, local-model agents that distill experience into reusable skills. Research what local models actually run well in 8GB VRAM in 2026 (quantized Qwen/Llama/etc via Ollama/llama.cpp/vLLM) and realistic API budgets, then generate ideas ONLY from this lens. At least one idea should use overnight Claude Code as the mutation engine with automated gates.` },
  { key: 'self-play', prompt: `You are a specialist in systems that TEACH THEMSELVES GAMES/TASKS via self-play and RL: AlphaZero-lite, neuroevolution vs gradient RL, ELO ladders of self-play generations, learning to play a game the builder wrote, TrackMania/rocket-sim style learning, curriculum that auto-hardens. Research hobby-scale self-play successes and frameworks (PettingZoo, Gymnasium, JAX-based sims like Brax/PGX, minizero etc) and what an 8GB 5070 can train overnight, then generate ideas ONLY from this lens. The watchable artifact is the ladder/replays of the thing visibly getting better and inventing tactics.` },
  { key: 'useful-evolver', prompt: `You are a specialist in personal software that EVOLVES INTO USEFULNESS: a tool that starts dumb and grows capabilities from feedback — a personal news/content curator whose filters evolve from thumbs, a forecaster ecology that earns trust per domain, a home dashboard that writes its own widgets, an autocomplete/snippet engine trained on the builder's own code, a fitness/finance/email triager that gets measurably better. The self-improvement must be genuine (selection/training on real feedback), the chore load near zero, privacy local-first. Research current local-first tooling and generate ideas ONLY from this lens.` },
  { key: 'train-from-scratch', prompt: `You are a specialist in WATCHING SMALL MODELS LEARN: training tiny neural nets from scratch where the learning process itself is the spectacle — a nanoGPT-class model learning language with nightly sample galleries, tiny diffusion learning to draw, a world-model learning to dream a game, RNN music that matures, each checkpoint preserved so you can scroll the model's childhood. Research what is trainable from scratch on an 8GB 5070 in overnight increments (nanoGPT speedruns, tiny diffusion repos, tinystories-class results) and generate ideas ONLY from this lens. Capability growth = the model demonstrably acquiring skills (rhyme, grammar, perspective, harmony) over weeks.` },
  { key: 'digital-ecology', prompt: `You are a specialist in COMPETITIVE DIGITAL ECOLOGIES of programs: populations of bots/strategies/agents that compete, breed, and expand their own capability space — Core War with evolution, trading-bot paper-money ecosystems, prompt-species competing on tasks, tournament ladders where new mutant strategies enter nightly, GPU-parallel tournaments (thousands of matches/sec). The twist vs plain alife: the population's CAPABILITIES compound (strategies get libraries, memory, learned submodules). Research prior art (Core War evolvers, Halite/Battlecode bot ecosystems, evolved trading research) and generate ideas ONLY from this lens.` },
  { key: 'wildcard', prompt: `You are a wildcard: generate self-improving-software project ideas that DON'T fit the obvious buckets (evolving code, LLM agents, self-play RL, tiny-model training, bot ecologies, personal-tool evolvers) — hybrids and weird angles: software that redesigns its own UI from usage, a compiler/interpreter that optimizes itself, a procedural game that patches its own rules from playtest telemetry, a robot vacuum-style mapper that learns the house, a speedrunning TAS that discovers glitches, a language that its programs extend, self-improving art installations. Research feasibility of whatever you pick. Generate ideas ONLY from outside the obvious buckets.` },
]

phase('Research+Generate')
const results = await parallel(LENSES.map(l => () =>
  agent(`${l.prompt}\n${PROFILE}`, { label: `ideas:${l.key}`, phase: 'Research+Generate', schema: IDEA_SCHEMA })
    .then(r => r && r.ideas.map(i => ({ ...i, lens: l.key })))
))
const all = results.filter(Boolean).flat()
log(`${all.length} ideas generated across ${results.filter(Boolean).length} lenses`)

phase('Judge')
const JUDGE_SCHEMA = {
  type: 'object', required: ['ranked', 'missing_angles'],
  properties: {
    ranked: { type: 'array', minItems: 7, maxItems: 10, items: {
      type: 'object', required: ['name','lens','score','why','risk'],
      properties: {
        name: { type: 'string' }, lens: { type: 'string' },
        score: { type: 'number', description: '0-100 fit for this builder' },
        why: { type: 'string' }, risk: { type: 'string', description: 'most likely way it disappoints' },
        combo_with: { type: 'string', description: 'optional: another pool idea it merges well with' },
      },
    } },
    missing_angles: { type: 'array', items: { type: 'string' } },
  },
}
const verdict = await agent(
  `You are a sharp, skeptical product-taste judge with deep ML/systems knowledge. Rank the BEST 7-10 ideas for THIS builder. Judge hard on: (1) genuine capability self-improvement — the system can DO new things later, not just a metric climbing; (2) would a phone check-in actually surprise and delight; (3) honest fit to an 8GB-VRAM laptop and near-zero chore load; (4) first cool self-improvement moment within 1-2 weekends, still alive at 6 months; (5) usefulness upside is a bonus, not required. Punish: disguised chore machines, "capability growth" that is really hyperparameter tuning, VRAM fantasies, API cost bombs, dead-framework bets, ideas where the plateau is obviously 3 weeks out. Sanity-check research claims against your own knowledge and flag dubious ones in risk. Also list angles the whole pool missed.\n\n${PROFILE}\n\nIDEA POOL (JSON):\n${JSON.stringify(all, null, 1)}`,
  { label: 'judge', phase: 'Judge', schema: JUDGE_SCHEMA, effort: 'high' }
)
return { all, verdict }