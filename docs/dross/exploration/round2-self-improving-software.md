# Round 2 — software that improves its own capabilities

Seven lenses on self-improving software, web-researched for feasibility on an RTX 5070 (8GB) + 64GB RAM laptop, then ranked by a skeptical judge.

> Published version: https://claude.ai/code/artifact/7e9df07e-3f7c-4844-bc25-4fd56f2af5bf

## Ranked shortlist


### 88 — The Ladder — self-evolving bot arena for your own game  *(evo-code)*

**Why** — Best fit-to-builder in the pool: headless node sim + canvas replays is literally his shipped skillset, so weekend-1 feasibility is real, not aspirational. The loop is mechanically honest — code is the genome, Elo vs a frozen Hall of Fame is the fitness, and the DRQ paper (verified: arXiv 2601.03335, SakanaAI/drq) documents both that this works and the exact cycling failure the HoF fixes. Capability growth is genuine: tactics exist as diffable code, and the accreted helper library means later bots compose skills earlier bots invented. Replays of a strategy that didn't exist last night are the single best 30-second phone check in the pool. GPU (Qwen2.5-Coder-7B Q4 ≈4.7GB, verified) and CPU are both saturated with zero API spend.

**Risk** — A 7B mutator writes mediocre code, so most mutations are noise and progress leans entirely on sim-side filtering — if his game's headless sim runs hundreds (not thousands) of matches/hr, evolution crawls and week-3 check-ins get samey. The real plateau arrives when the meta converges, and the fix (rule-mutation eras) is human creative input dressed as automation — fun input, but input.

**Pairs with** — Primordial Arena (near-duplicate — steal its MAP-Elites behavior-descriptor archive and 'enter your own hand-written challenger' ritual)


### 83 — Gauntlet Breeder  *(self-play)*

**Why** — The strongest published anti-plateau mechanism here that actually fits 8GB: Kinetix (verified ICLR 2025 Oral, millions of steps/s on one GPU) ships the UED/level-generation machinery, so he forks rather than builds. Capability events are discrete and dated ('first drove a vehicle: night 34'), the fixed human-designed holdout suite is an honest external yardstick against treadmill motion, and it's the one idea that truly uses the 5070 as a compute engine 24/7 with no API bill. Six-month liveliness is its entire design thesis.

**Risk** — The paper's zero-shot generality came from big nets and long compute; a shrunk 2-4M-param config may learn slowly enough that the first two weeks are all ball-nudging — the wow may land weekend 3-4, not 1-2. Forking a research JAX codebase is also a real debugging tax for a JS-native builder (Claude Code mitigates, doesn't erase), and the replay-JSON-to-canvas pipeline is unglamorous glue he must build himself.


### 80 — Night Shift — overnight Claude Code gardens your game behind fitness gates  *(llm-agent-self)*

**Why** — Perfectly matched to the rhythm he already loves and pays rent from night one — 'play last night's feature on your phone' is a first-class check-in. The gate architecture (Playwright playtest bot + perf budgets) is the honest part: it converts agent output into selection, not chores. Ralph-loop overnight practice is established, subscription-covered, and the chronicle accretes real history.

**Risk** — The most 'disguised feature factory' of my picks: without a taste gate, six months of curriculum-invented features tends toward coherent-looking sludge, and the weekly 'meta-night rewrites its own harness' is Darwin-Gödel cosplay unless harness changes are gated by a measurable benchmark — DGM's result depended on exactly that gate. Budget honestly: he will veto and prune, ~5-10 min/day, which is fine but is not zero.


### 78 — Dojo Ladder  *(self-play)*

**Why** — The verified stack (pgx + mctx Gumbel AlphaZero; pgx's Othello demo ≈3h on an A100) makes real strength on a small original game plausible over nights on a 5070, VRAM is genuinely comfortable (~2-4GB), and ONNX-in-browser 'play the champion with the laptop off' is the most shareable phone feature in the pool. Losing to your own invented game around month 2 is a durable, story-shaped payoff; the motif-miner keeps growth from being just an Elo number.

**Risk** — Two quiet over-claims: an A100 is ~5-10x a 5070 laptop, so 'strong in 1-3 nights' is optimistic — plan a week per stage; and inventing a game that is actually deep is the hard part — first drafts are usually solved or first-player-won, at which point AlphaZero flatlines in days and the 'discoveries' feed goes silent. Capability growth is the closest to metric-climbing of my picks; the curriculum stages are what save it, and they're hand-designed.


### 76 — Dream Cartridge  *(train-from-scratch)*

**Why** — Highest surprise-density phone check in the pool: playing your own game's hallucination, and watching Tuesday's dream keep the ball solid where Monday's tunneled. Owning the simulator makes the fitness signal mechanically clean (dream-vs-real divergence, no vibes) and gives infinite free data; the honest downscale from DIAMOND (64x64, small U-Net, next-frame regression first) is correctly calibrated to 8GB, with a CPU-only Pong precedent as the floor. The hard-example-mining collector is a genuine self-improvement loop, and RL-trained-in-dream transferring to the real game is a bloggable month-3 milestone.

**Risk** — Weeks 2-5 are the danger zone: blurry-but-boring dreams that are neither funny-broken nor impressively coherent, and the divergence chart improving without the visuals feeling different — a check-in that requires squinting. Phone-side neural inference is a stretch goal he should treat as optional (websocket streaming is the honest default).


### 74 — The Prodigy  *(train-from-scratch)*

**Why** — Lowest-risk cool moment on the list: Karvonen's numbers (25M params, ~99.8% legal moves, ~1300 Elo, 72h on a 3090) are real, public, and downscale predictably to a 5070 over nights; every capability has a number, and the legal-move-rate curve is the clearest 'it is learning' visual in ML. Phase 3's Elo-conditioning is a genuinely new interface, not a metric, and 'play my model at 3 weeks old' from bed is a lovely artifact.

**Risk** — It's a replication with a known script — the surprise is front-loaded and largely his to consume rather than the system's to generate; expect the imitation ceiling ~1500 by month 2, and the phase-2 expert-iteration escape is the one part with no verified hobby precedent and real reward-hacking-the-Stockfish-eval subtleties. Six-month aliveness depends on him caring about chess.


### 72 — Basement Speedrun  *(train-from-scratch)*

**Why** — The purest 'software rewrites its own method of improving' on the list, and the check-in content — last night's diff, the agent's rationale, PASS/FAIL — is exactly the coffee-report genre he already loves. The lab-notebook-of-dead-ideas is honest anti-repetition state, modded-nanogpt is a verified quarry of transferable techniques, and track rotation is a credible freshness mechanism. Side effect: he exits actually understanding training dynamics.

**Risk** — Two flags: the Prime Intellect 'Claude set the optimizer record' citation is post-my-cutoff and unverified — treat it as plausible, not proven. More biting: one noisy race per night on a thermally-variable gaming laptop means small real wins are indistinguishable from cooling fluctuations — without pinned clocks and repeated runs, the leaderboard becomes a random walk and records fall for fake reasons. Gains at 30-60M-param scale also dry up faster than the 45min→75s story implies.


### 70 — Shader Garden — a MAP-Elites greenhouse that learns your taste  *(evo-code)*

**Why** — MAP-Elites + compile-and-render filtering makes run one reliably produce a diverse grid, shaders render live on the phone GPU (no video pipeline), and the voting-trains-the-critic loop puts the human input exactly where it's fun. All components verified feasible in 8GB with phase scheduling; the gene library of evolved GLSL tricks is legible capability accretion; GitHub Pages auto-gallery is a nice public artifact.

**Risk** — Aesthetic-scorer hacking is the documented failure: CLIP-head fitness converges on symmetric glow-blob soup within weeks, and novelty pressure only delays it — the month-2 check-in risk is 'pretty, samey, dead.' The honest fix (commissioned new primitives when regions stagnate, per Overnight Gallery) is the part that must actually get built, and the three-phase VRAM juggling (render/score/mutate) is more scheduling engineering than the pitch admits.

**Pairs with** — The Overnight Gallery (same skeleton; steal its primitive-commissioning move — new DSL brushes when a region stagnates — as the real capability-growth mechanism)


### 68 — Glitch Cartographer  *(wildcard)*

**Why** — The strongest 'it found something I never taught it' engine in the pool — rediscovering a known Pokémon Red wall-clip on night 2 is a genuine gasp, and macros-joining-the-mutation-pool is real compounding capability (clips unlock cells that expose new anomalies). CPU-massive, GPU-optional, honest about it; PyBoy at scale on hobby hardware is verified practice; Go-Explore cell archiving is the right published mechanism; a TASVideos-worthy novel find is a real external stake.

**Risk** — Per-ROM plateau is nearer than it looks — Gen-1's glitch space is famously well-mined, so 'novel discovery' mostly means 'novel to him,' and each new ROM costs a RAM-map wiring session (the pool's 'one-time' framing undersells it). Anomaly-detector false positives are the chore in disguise: an unpruned feed of 200 fake 'glitches' kills the morning check faster than no feed at all.


### 66 — Red Queen Hill  *(digital-ecology)*

**Why** — The best-verified research grounding in the entire pool (DRQ is exactly this, published, with code) plus the one thing nothing else offers: a 40-year-old external ladder — beating the human benchmark tier list and submitting to a live corewar.co.uk hill gives stakes no self-referential system has. The byte-level GA alone historically produced hill-ranked warriors, so the system works even if the LLM layer contributes nothing; near-zero chore load is credible because pMARS is tiny and battle volume is pure CPU.

**Risk** — Redcode is the farthest from his home turf of any pick — the canvas battle visualizer is his one native foothold, and if that doesn't hook him by week 3 the project quietly dies. The idea's own admission is the tell: 7B local models write poor Redcode, so the 'LLM mad geneticist' layer may be decorative and the honest engine is a classic GA — delightful to watch, but the self-improvement is population-level, not architectural.


## Angles the pool missed

1. Real players as fitness: he ships PWAs people actually play — nothing in the pool evolves game content/bots/levels against telemetry from real human players (itch.io or Pages + a few friends). That's free, genuinely non-stationary selection pressure and the only signal source here that can surprise indefinitely without a hand-built anti-plateau mechanism.

2. DreamCoder-style wake-sleep library learning: the canonical published algorithm for honest capability accretion (solve tasks, compress solutions into a growing DSL, retrain the recognition model) appears nowhere — e.g. pointed at ARC-style puzzles or his games' procedural-content generators, it's a better-grounded 'skill library grows' engine than the Voyager-flavored ideas, and it fits 8GB trivially.

3. A personal nemesis: no idea trains an opponent on HIS play specifically — imitate his input traces, then counter-adapt each week. Self-play vs 'a bot that studies you' is a categorically different delight, the data is free from games he already plays, and it dodges the self-play cycling problem because the anchor is a human who also improves.

4. Distillation as the closing of the loop: several ideas evolve bots/controllers, but none ship the evolved intelligence back into his live games as tiny ONNX/MLP opponents whose player-facing performance becomes the next fitness signal — that's the difference between a lab that improves and shipped software that improves.

5. Cross-project compounding is asserted, never designed: the pool treats each rig as standalone, but the honest 6-month win for this builder is one shared substrate (headless-sim harness + lineage DB + PWA chronicle + ntfy) that every project plugs into — worth choosing idea #1 partly for how much of that substrate it forces him to build.

6. Thermal/benchmark hygiene on a gaming laptop: every timing-based fitness signal in the pool (Night Shift, Basement Speedrun) silently assumes stable clocks; nobody proposes the boring-but-essential fixed-power-limit, repeated-trial, significance-tested harness without which 'records' are noise.


## Full catalog


### Evolving code


#### The Ladder — self-evolving bot arena for your own game

Take one of your shipped browser games (or a fresh 200-line arena game), make bots be plain JS functions, and run a FunSearch-style loop where a local LLM mutates bot source code and a headless node sim is the fitness function. Every morning the ladder has new champions whose replays show tactics that literally did not exist as code the night before.

**The loop** — State that mutates: population of bot programs (JS strategy functions) plus a shared library of named tactic helpers that winners contribute to. Fitness: Elo from round-robin matches in a headless node sim (thousands of matches/hr on CPU), always including a frozen Hall-of-Fame of past champions so scores are anchored, not cyclic (the Digital Red Queen paper documents exactly this cycling failure mode and the hall-of-fame fix). Variation: Qwen2.5-Coder-7B (Ollama, ~4.7GB Q4_K_M) prompted FunSearch-style with 2 parent bots + match stats + error traces; 4-8 island populations with periodic migration (OpenEvolve's architecture, reimplement in ~500 lines of node or call openevolve directly). Anti-plateau: hall-of-fame anchoring, island diversity, and a rule-mutation schedule — every N generations the game itself gets a variant (fog of war, new unit) so the fitness landscape keeps moving.

**Capability growth** — Week 1: bots random-walk and suicide. Month 3: bots that kite, feint, manage economy timing, and call into an accreted tactics library ('orbitStrafe', 'baitAndCollapse') that earlier generations wrote — behaviors visible in replays, not just an Elo number. Concretely new: strategies exist as readable code you can diff against ancestors; the helper library grows monotonically, so later bots compose skills earlier bots invented.

**On your phone** — PWA served by the same node process over Tailscale: live Elo ladder, canvas replay of last night's title match (you already do canvas), lineage tree of the current champion, and a 'what changed' diff view. ntfy.sh push when a new bot dethrones the champion.

**Hardware** — CPU + 64GB RAM run 8-16 parallel sim workers (node worker_threads); the 5070 serves Qwen2.5-Coder-7B at 40-55 tok/s for mutations. GPU is the mutation engine, CPU is the fitness engine — both saturated overnight.

**Input needed** — After setup: zero required. Optional 5-min morning check; occasional rule-mutation ideas when you feel like it. Adding a new game variant is a fun weekend tinker, not a chore.

**Stack** — Node + worker_threads headless sim, canvas replays, vanilla JS PWA, Ollama + Qwen2.5-Coder-7B-Instruct (Q4_K_M), optional openevolve (pip) as the controller with its OpenAI-compatible endpoint pointed at Ollama, SQLite for lineage, Tailscale + ntfy.sh.

**First weekend** — Saturday: arena game + headless sim + 3 handwritten seed bots + Elo harness. Sunday: Ollama mutation loop + Hall of Fame + basic ladder page. First overnight run ends with a bot that beats all your handwritten seeds — that moment reliably happens with even a 7B mutator because the sim filters garbage.

**Six months in** — A 40-generation-deep lineage museum, a tactics library with dozens of evolved helpers, 3-4 game-variant 'eras' each with their own champion dynasty, and replays you show people at parties. The rule-mutation schedule is what keeps it alive at month 6.

**Useful?** — Pure fun, honestly — though the harness (LLM-mutation + headless-fitness + hall-of-fame) becomes a reusable rig you point at other problems (see idea 4).

**Verified** — Verified: openevolve (github.com/algorithmicsuperintelligence/openevolve) is alive in 2026 (recent PRs incl. Claude Code agent integration), replicated AlphaEvolve circle-packing results, and works against any OpenAI-compatible endpoint incl. local. Qwen2.5-Coder-7B Q4_K_M ~4.7GB VRAM, 32K ctx, strongest 7B code model per 2026 8GB-VRAM roundups (localllm.in, morphllm.com); Qwen3-class 8-9B Q4 also fits at 55+ tok/s. Digital Red Queen (arXiv 2601.03335, Sakana AI) confirms LLM-driven adversarial program evolution works AND that pure self-play cycles without hall-of-fame anchoring. EoH (github.com/FeiLiu36/EoH) is an alternative lighter framework.


#### Redcode Hill — a Core War evolver that climbs a real 40-year-old ladder

Run a 24/7 Core War breeding program on your laptop: a classic instruction-level GA as the workhorse plus LLM 'macro-mutations' that restructure warriors strategically, fighting on a home hill anchored by published human champion warriors. It is the purest form of adversarial program evolution, and there is an external, objective skill ladder: benchmark scores against the historic human-written warriors.

**The loop** — State: population of Redcode warriors (MARS assembly, ~100 instructions max). Fitness: pMARS/exhaust battles — round-robin vs the live population PLUS a fixed benchmark set of famous human warriors (Wilkies-style benchmark) so progress is measured against an external standard, not just self-play (again the Digital Red Queen lesson). Variation two-tier: (a) classic instruction-level GA (point mutations, crossover at instruction boundaries) runs millions of battles/night on CPU — this alone historically produced hill-ranked warriors; (b) nightly, Claude (API or Claude Code session) reads the top-10 with their battle stats and a Redcode strategy guide in context, and proposes whole-strategy rewrites (paper/stone/imp/scissors archetypes, quickscan additions). No plateau because the strategy space is famously intransitive (rock-paper-scissors dynamics) and the benchmark warriors give a hard external gradient.

**Capability growth** — Concretely new capabilities = new strategy archetypes appearing in the population: week 1 it only bombs blindly; month 3 the lineage contains self-repairing imp-spirals, quickscanners, and paper/stone hybrids the GA assembled — classifiable by an automatic archetype detector (instruction-pattern heuristics) so the dashboard can announce 'first imp-ring evolved on day 23'.

**On your phone** — PWA over Tailscale: hill standings, benchmark score sparkline, animated core-memory battle visualizer (the classic colored-cells display — trivial and gorgeous in canvas), archetype timeline ('eras' of stone dominance vs paper dominance), push notification on new benchmark high-score.

**Hardware** — Almost entirely CPU: pMARS battles across 16 threads all night (MARS sims are tiny; 64GB lets you keep huge archives in memory). GPU only used when you route macro-mutations through a local model; honest take: 7B local models write poor Redcode, so use Claude API for the ~50 macro-mutations/night (pennies) and let the instruction-level GA do the volume.

**Input needed** — Zero required after setup. Optional: submit your best evolved warrior to the still-active internet hills (corewar.co.uk / KOTH-style hills) once a month for a real-world test — that part is a human ritual, and a fun one.

**Stack** — pMARS or exhaust (C simulators, compile locally), Python GA driver, SQLite archive, Claude API for macro-mutations (~50/night), canvas battle viewer PWA, Tailscale, ntfy.sh.

**First weekend** — Saturday: compile pMARS, write the GA loop, seed with random warriors + 3 classic public warriors, get battles scoring. Sunday: benchmark harness + core visualizer page. First overnight: random soup evolves a crude bomber that beats your random seeds — visible in the visualizer as coherent bombing patterns emerging from noise.

**Six months in** — A deep archive with named eras, a warrior that scores respectably against the human benchmark set, maybe a ranking on a real internet hill under your name — an external achievement no other idea here offers.

**Useful?** — Pure fun. Zero pretense of utility; maximal 'life emerging in the machine' aesthetic.

**Verified** — Verified: Digital Red Queen (arXiv 2601.03335, HN-discussed Jan 2026) does exactly LLM-evolved Core War warriors and reports the self-play-cycling problem; corewar.co.uk and the 2025 Core War Tournament Weekend confirm the community and hills are still alive; classic literature ('On the evolution of corewar warriors', evolved warriors on historical hills) confirms instruction-level GA alone reaches competitive play; CodeClash (arXiv 2511.00839) runs Core War as an LLM arena benchmark. pMARS/exhaust are stable open-source simulators.


#### Shader Garden — a MAP-Elites greenhouse that learns your taste

An overnight MAP-Elites run breeds GLSL fragment shaders — mutated by a local code LLM, scored by a CLIP-based aesthetic model on the 5070 — into an ever-growing gallery of animated art. Your 30-second phone check IS the selection pressure: thumbs up/down retrains the preference head, so the fitness function itself evolves toward your taste.

**The loop** — State: (1) MAP-Elites archive of shaders binned by measurable descriptors (color entropy, motion energy, symmetry score — computed from rendered frames); (2) a 'gene library' of GLSL helper functions (noise variants, palettes, domain-warp tricks) harvested from elite shaders and injectable into prompts; (3) a preference model: LAION-aesthetic-style linear head on CLIP ViT-L/14 embeddings, retrained nightly on your accumulated votes. Fitness = preference score + novelty (CLIP-embedding distance to archive). Variation: Qwen2.5-Coder-7B mutates/crosses shader source with 2 elite parents + the gene library in context; compile errors auto-fail. Anti-plateau: MAP-Elites forces coverage of the descriptor space instead of converging, novelty pressure punishes lookalikes, and the moving preference target (your votes) keeps redirecting search. This is Picbreeder with the human moved to a 30-sec/day phone ritual.

**Capability growth** — New capabilities = new visual techniques existing as reusable code: month 3's gene library contains evolved raymarching fragments, palette systems, and warping tricks that week 1's population couldn't express, and new elites compose them. Also the preference model itself is a capability that didn't exist at week 1 — by month 3 it prefilters thousands of candidates to the ~20 you'd actually like.

**On your phone** — Gallery PWA: nightly 'new blooms' feed of looping WebM/animated shaders (shaders ARE web-native — they render live on the phone GPU via WebGL, no video files needed), swipe to vote, archive heatmap showing which niches filled overnight, lineage view per shader. Served over Tailscale; a static best-of gallery auto-pushed to GitHub Pages to share.

**Hardware** — 5070 does triple duty on a schedule: headless shader rendering (puppeteer with GPU, or wgpu-py) at thousands of 256px clips/night, CLIP ViT-L/14 embedding + aesthetic head (~2GB VRAM), and Qwen2.5-Coder-7B mutations (~5GB) — run render/score and mutate phases alternately to stay under 8GB. 64GB RAM holds the whole archive + embeddings.

**Input needed** — Honest: this one WANTS ~30 sec of voting a few times a week — that's the point (your taste is the signal). It still runs and improves on pure novelty+aesthetic score if you skip a week.

**Stack** — Python driver, wgpu-py or puppeteer headless-GPU for rendering, open_clip ViT-L/14 + logistic preference head (scikit-learn), Ollama + Qwen2.5-Coder-7B for mutation, MAP-Elites archive in SQLite, vanilla JS WebGL gallery PWA, Tailscale + GitHub Pages.

**First weekend** — Saturday: render harness + 20 seed shaders (grab Shadertoy-license-friendly basics) + descriptor computation + MAP-Elites grid. Sunday: LLM mutation loop + gallery PWA with voting. First overnight fills a visibly diverse grid — the 'it made something I actually like' moment usually lands in run one because compile-and-render filters junk hard.

**Six months in** — Thousands-strong archive with lineages going back months, a gene library that reads like an evolved graphics textbook, a taste model that knows you, and a public GitHub Pages gallery that updates itself nightly.

**Useful?** — Mostly fun, with a real side-benefit: an endless supply of original live wallpapers, stream backgrounds, and game-ready shader assets for your own browser games.

**Verified** — Verified: AI Co-Artist (EvoMUSART 2026, arXiv 2512.08951) demonstrates LLM-orchestrated GLSL crossover/mutation with Picbreeder-style interactive evolution — this idea is that plus MAP-Elites and an automated aesthetic scorer so it runs unattended. LAION aesthetic predictor (CLIP+linear head) is standard and tiny; CLIP ViT-L/14 fits comfortably alongside nothing else in 8GB. Genetic programming for shaders has prior art back to Sims/Picbreeder and 'Genetic Programming for Shader Simplification'. Qwen2.5-Coder-7B footprint per 2026 8GB-VRAM guides (localllm.in).


#### Night Shift — OpenEvolve pointed at your own codebase's hot paths

Every night, OpenEvolve (with Claude Code as the mutation agent) attacks one benchmarked hot path in your own game/engine code — collision, pathfinding, particle updates, bundle size — and you wake to a report of verified speedups with diffs. The self-improving part is real and compounding: winning diffs get distilled into a STRATEGIES.md playbook that is fed back into future mutation prompts, so the optimizer gets better at optimizing YOUR code.

**The loop** — State: per-target evolved program variants (OpenEvolve MAP-Elites database) + the playbook file + a target queue. Fitness: your own benchmark harness — vitest/benchmark.js timings, headless-Chrome fps via puppeteer, bundle bytes — with correctness gates (existing test suite must pass; cascade evaluation: fast smoke tests first, full bench for survivors — OpenEvolve supports cascades natively). Variation: OpenEvolve's LLM ensemble — bulk mutations from a cheap/fast model (Cerebras free tier gpt-oss-120b: 1M free tokens/day, absurdly fast; or local Qwen), insight mutations from Claude. Anti-plateau is the honest crux: any single benchmark saturates in days, so a target-generator keeps the queue full — profiler output (biggest self-time functions), new code you write, and 'reopen with tighter budget' rules. The playbook accretion is the second loop: it plateaus only when your codebase stops changing.

**Capability growth** — Week 1 it can only micro-optimize one function. Month 3: it holds a playbook of codebase-specific tricks (e.g. 'typed-array pooling wins in the particle system', 'this data layout beats that one'), auto-selects nightly targets from profiler data, and applies cross-file optimizations seeded by playbook entries — it solves classes of problem it initially failed on, and you can watch the playbook grow.

**On your phone** — Morning-report PWA over Tailscale (or nightly push to a private GitHub Pages): per-target speedup sparklines, last night's best diff (readable on phone), playbook changelog, cumulative 'ms saved per frame' counter. ntfy.sh push when a run beats a standing record or a correctness gate catches a cheat.

**Hardware** — Mostly CPU (benchmarks need quiet, consistent timing — pin workers, disable turbo variance). GPU optional: local Qwen mutations if you want zero API spend, and headless-GPU Chrome for fps benchmarks. This idea least needs the 5070; that's honest.

**Input needed** — 5-min coffee read of the morning report; you approve/merge diffs (keep human merge — evolved code that games a benchmark is a real failure mode, the correctness gates catch most but not all). Queue refills itself from the profiler.

**Stack** — openevolve (pip, algorithmicsuperintelligence/openevolve) with its Claude Code agent integration or plain API config, benchmark.js/vitest + puppeteer harness, Cerebras free tier + Claude API + optional Ollama fallback, git worktrees per experiment, ntfy.sh, Tailscale PWA.

**First weekend** — Saturday: pick 2 hot functions from a real project, write the eval harness (bench + correctness gate), run openevolve's quickstart against them with Cerebras free tier. Sunday: morning-report page + playbook distillation step (a Claude call that summarizes winning diffs). Very likely outcome: a genuine 1.5-3x on at least one target the first night — hot-path JS usually has that much on the table.

**Six months in** — Your engine measurably faster, a playbook that reads like a performance guide written specifically for your codebase, and the rig generalized to every new project you start. This is the idea most likely to still be running at 6 months because it pays rent.

**Useful?** — Directly useful from night one: real speedups in software you actually ship. The playbook also makes YOU a better performance programmer — reading it is the fun part.

**Verified** — Verified: openevolve repo active in 2026 with recent PRs including Claude Code agent integration enhancement and dynamic config; it replicated AlphaEvolve results (circle packing n=26 SOTA) and supports cascade evaluation + islands + any OpenAI-compatible endpoint (huggingface.co/blog/codelion/openevolve). Cerebras free tier: 1M tokens/day free (pricepertoken.com), and the OpenEvolve author reports Cerebras as fastest for iteration loops. Caveat folded in: 'Simple Baselines are Competitive with Code Evolution' (arXiv 2602.16805) suggests much of the win is sampling+good evaluators, not evolution per se — fine, the evaluator IS your benchmark suite, which you control.


#### Creature Atlas — POET-style open-ended neuroevolution zoo on the 5070

Thousands of neural-network creatures learn to walk, jump, and climb in massively parallel JAX physics on your GPU — and the WORLDS evolve too: POET-style, new terrains spawn from ones just barely solved, so the frontier of what any creature can do genuinely never stops moving. Phone check-ins are nightly videos of creatures doing things no creature could do last week.

**The loop** — State: MAP-Elites archive of (environment, controller) pairs — controllers are small MLPs or NEAT genomes, environments are parameterized 2D terrains (gap width, step height, ceiling, friction). Fitness: distance/energy in Brax or a custom ~200-line JAX 2D physics sim, thousands of rollouts in parallel via vmap. Variation: evosax ES / TensorNEAT for controllers; environment mutation + POET's minimal-criterion transfer (new env admitted only if current champions score >C1 but <C2 — solvable-but-not-solved) for worlds. Anti-plateau is POET's whole theorem-in-practice: the environment generator manufactures new gradients forever, and transfer between niches (champion of terrain A seeded into terrain B) produces the stepping-stone jumps plain ES never finds.

**Capability growth** — Literal new behaviors with timestamps: day 3 first stable walk; week 4 first gap-jump; month 2 a creature that climbs a step it physically could not climb before because the transfer from a bouncing-niche champion brought the right gait. The atlas of solved environments only grows — that IS the capability set, enumerable and visualizable.

**On your phone** — Atlas PWA over Tailscale: heatmap of the env-parameter space colored by solved/unsolved, nightly auto-rendered WebM replays of 'first solves', per-niche lineage, and a 'this week's firsts' feed. Push notification on any first-solve of a new environment class.

**Hardware** — This is the idea that truly uses the 5070 as a compute engine, not an LLM host: JAX + Brax/evosax runs 2-10k parallel rollouts of tiny nets entirely on-GPU; 8GB is plenty because genomes are kilobytes (TensorNEAT reports up to 500x over NEAT-Python on consumer GPUs). 64GB RAM holds the full archive + replay buffer. 24/7 duty cycle is exactly what it wants.

**Input needed** — Zero required. Optional tinkering — adding a new environment parameter (water? wind?) is a one-evening mod that visibly reshapes the atlas within days, which is the best kind of nudge-to-payoff ratio.

**Stack** — Python + JAX (CUDA on Blackwell), Brax or hand-rolled jax 2D physics, evosax (30+ ES algorithms) or TensorNEAT, POET admission/transfer logic (~200 lines yourself; Uber's poet repo as reference), matplotlib-to-WebM render worker, FastAPI + vanilla PWA, Tailscale + ntfy.sh.

**First weekend** — Saturday: jax physics sim (start with 2D hopper on flat ground) + evosax CMA-ES loop — first wobbling hop same day. Sunday: environment parameterization + POET admission rule + replay renderer. First overnight: the atlas has 5-10 solved terrains and one genuinely surprising gait. NEAT topology-growth can wait for weekend two.

**Six months in** — Hundreds of solved niches, gait phylogenies, era markers ('the month everything learned to pronk'), and a mesmerizing atlas heatmap that has never stopped expanding. POET is the strongest published anti-plateau mechanism on this list.

**Useful?** — Pure fun — but the evolved-controller pipeline is a straight on-ramp to your browser games: evolved creatures/enemies with organic movement export as tiny MLPs that run in JS at zero cost.

**Verified** — Verified: TensorNEAT (ACM TELO 2025, arXiv 2404.01817) — tensorized NEAT, up to 500x speedup, works with Brax on consumer GPUs; EvoJAX (google/evojax) and evosax (30 ES algorithms, JIT/vmap) are mature and maintained; EvoRL (arXiv 2501.15129) confirms the GPU-accelerated evo-RL stack is current. POET (Uber AI) is older but its mechanism is exactly what 2026 open-endedness work (e.g. 'Evolving Many Worlds', arXiv 2604.11248, population-based NCA petri dishes) still builds on. Recent papers in this space run on single RTX 4090s — a 5070 laptop is the same class, smaller.


#### Majordomo — a Voyager-style skill library that grows real-life automations

A nightly Claude Code session plays Voyager, but the world is your digital life instead of Minecraft: it proposes its own curriculum of small automation skills (scrapers, parsers, digest generators, file organizers), races N candidate implementations against auto-generated tests FunSearch-style, and banks winners into a growing, composable skill library. Each morning's digest is produced BY the skills, so the product and the progress report are the same artifact.

**The loop** — State: skill library (each skill = CLI script + JSON-schema I/O contract + test suite + reliability stats) + curriculum backlog + failure log. Fitness, three honest layers: (1) hard — generated tests + schema validation + 7-day reliability tracking (a skill that breaks gets auto-reopened with its stack traces as context, Voyager's iterative-prompting loop exactly); (2) racing — every new skill gets 3-5 candidate implementations, winner by test pass rate then runtime then dependency count; (3) human — thumbs up/down per digest item from your phone, which reweights the curriculum. Curriculum generator: nightly Claude call reads library + failures + votes and proposes next skills, biased toward composing existing skills into bigger ones (Voyager's core growth trick). Anti-plateau: your life keeps changing, feeds break (forced maintenance evolution), and composition depth grows — month-3 skills call month-1 skills.

**Capability growth** — Genuinely enumerable: week 1 it can fetch one RSS feed. Month 3 the library has 30-60 verified skills — price-watch with history, HN/paper digest tuned by your votes, download-folder taxonomist, calendar-day prep — including composite skills nobody (you or it) explicitly designed, because the curriculum generator proposes compositions. 'Can do new things' is literally the library manifest diff.

**On your phone** — Morning digest as a PWA (Tailscale) or private GitHub Pages push: today's skill outputs up top, then 'library news' — new skills born, skills repaired, skills deprecated — each with a vote button. ntfy.sh push for the digest and for 'new skill wants permission to touch X' approvals.

**Hardware** — Honest: mostly API-driven (your existing Claude Code subscription is the mutation engine — this leans into your overnight-run-plus-coffee-report rhythm). The 5070 runs Qwen2.5-Coder-7B for the cheap candidate-racing volume and local embedding search over the skill library; 64GB RAM is overkill except for local data crunching skills. This is the least GPU idea and the most useful one.

**Input needed** — 2-5 min/morning of reading + voting, weekly approval of any skill wanting new access (credentials, folders). That's higher than the game ideas — but every minute of input here buys actual utility back.

**Stack** — Claude Code headless (claude -p) via cron/Task for the nightly session, skill contracts as JSON schema + pytest/vitest, SQLite for library + reliability stats, Ollama + Qwen2.5-Coder-7B for candidate racing, sentence-transformers for skill retrieval, vanilla PWA + Tailscale + ntfy.sh, git as the skill library's history (the chronicle for free).

**First weekend** — Saturday: skill contract format + runner + 3 handwritten seed skills + digest page. Sunday: the nightly loop — curriculum call, candidate racing, test gate, library commit. First cool moment: Monday's digest contains output from a skill you never wrote, that was proposed, implemented 4 ways, tested, and merged while you slept.

**Six months in** — A personal automation OS with a git history reading like an evolution chronicle, a digest genuinely tuned to you, and the strongest still-alive-at-6-months case here because it delivers daily value. Risk to name: without the racing + reliability gates it degrades into a pile of half-broken scripts — the gates are the project.

**Useful?** — The whole point — this is the 'actually useful in daily life' idea. Fun path and utility path are the same path.

**Verified** — Verified: Voyager (arXiv 2305.16291) established curriculum + executable-code skill library + self-verification as the growth loop; 2026 follow-ups (OpenSkill arXiv 2606.06741, SkillForge arXiv 2604.08618, SkillAudit arXiv 2606.14239) show skill-library self-evolution with trajectory auditing is an active, working paradigm — SkillAudit's paired-trajectory idea (compare with-skill vs without-skill runs) is directly stealable for the reliability gate. Candidate-racing is FunSearch's sample-and-filter insight applied per-skill; 'Simple Baselines' (arXiv 2602.16805) supports that sampling+strong evaluator carries most of the weight, which is exactly this design.


### Self-improving agents


#### Night Shift — overnight Claude Code gardens your game behind fitness gates

Your existing browser game becomes a living project: every night a cron'd Claude Code session picks an item off a self-expanding roadmap, builds it, and only commits if it survives an automated fitness gate. You wake to a coffee-report of what your game learned to do while you slept.

**The loop** — State that mutates: the game repo itself + ROADMAP.md + the harness (CLAUDE.md, gate scripts). Loop: nightly Ralph-style headless loop (Anthropic's official ralph-wiggum plugin or frankbria/ralph-claude-code) runs Claude Code against the top roadmap item; fitness gate = vitest suite + Playwright headless playtest bot (must complete level, no console errors) + Lighthouse perf budget + bundle-size cap; fail = branch quarantined, pass = merge + deploy. Anti-plateau: (a) Voyager-style automatic curriculum — each run ends by proposing 3 new roadmap items scored for novelty vs git history; (b) every 7th night is a meta-night: Claude reads the failure log and rewrites its own CLAUDE.md, prompts, and gate scripts (Darwin-Gödel-lite on the harness), so the mutation engine itself improves.

**Capability growth** — Week 1: fixes bugs, adds small features you seeded. Month 3: the game has systems you never specced — e.g. a save-slot system, a procedural level mode, a replay viewer — because the curriculum invented them; the harness has grown gates you didn't write (a11y checks, mobile-viewport playtests); the playtest bot itself has been upgraded by meta-nights to test behaviors that didn't exist at week 1.

**On your phone** — Nightly run auto-pushes to GitHub Pages: a chronicle page (one entry per night: what was attempted, gate results, screenshot/gif from Playwright, diff stats) + the playable build itself, so the 30-second check is literally playing last night's feature on your phone. ntfy.sh push when a gate fails twice in a row or something big merges.

**Hardware** — CPU only for the loop (node, Playwright, git); GPU optional — can host a local Qwen2.5-Coder-7B as a free 'pre-reviewer' that lints/summarizes diffs before the report. The laptop's job is being always-on, not compute.

**Input needed** — Honest: ~5 min/morning reading the chronicle; occasional roadmap nudge ('more juice, less refactoring'). Weekly: unstick a quarantined branch if you care. No daily chores — gates replace your review.

**Stack** — Claude Code headless (claude -p) + ralph-wiggum plugin, cron/systemd timer, vitest, Playwright, Lighthouse CI, GitHub Actions or local git push to Pages, ntfy.sh. Model: Sonnet via Max plan (covered by subscription) or API.

**First weekend** — Weekend 1: wire one repo with a 5-item roadmap, a Playwright 'can the bot finish level 1' gate, cron at 2am, and the Pages chronicle. First morning where a feature you didn't write passes the gate = the moment.

**Six months in** — A 180-entry chronicle that reads like a dev diary written by your house elf; the game has forked into experimental branches the curriculum spawned; meta-nights have rewritten the harness ~25 times and you can diff harness-v1 vs harness-v25 like archaeology.

**Useful?** — Directly useful: it ships your actual games. The harness generalizes — point it at any repo (your PWA tools, this dashboard itself) and it gardens that too.

**Verified** — Verified: Anthropic shipped an official ralph-wiggum/Ralph Loop plugin (Dec 2025) and community loops (frankbria/ralph-claude-code) run Claude Code headless overnight with fresh context per iteration + prd.json/progress-file state — this exact rhythm is documented working practice in 2026 (claudecodemasterclass, blakecrosley.com, Addy Osmani's 'Self-Improving Coding Agents'). Darwin Gödel Machine (arXiv 2505.22954, ICLR 2026) validated the meta-move: agents modifying their own harness against a benchmark gate went 20%→50% SWE-bench — the meta-night is that idea at hobby scale.


#### Homunculus — a Voyager-style skill library that lives on your laptop

A local agent whose only permanent asset is an ever-growing library of executable skills (small tested JS/Python functions) it writes for itself. Ask it something it can't do and it doesn't fail — it grows the skill, tests it, shelves it, and can compose it forever after.

**The loop** — State: skills/ directory (code + docstring + self-generated tests + usage stats) + embedding index. Loop is straight Voyager: task in → retrieve top-k skills by embedding → local Qwen writes/composes code → execute in sandbox → on error, iterate with the traceback (Voyager's iterative prompting) → on pass, distill into a named, tested skill and index it. Curriculum: a nightly Haiku 4.5 call reads the library and proposes 5 tasks that require composing 2+ existing skills plus one new one (Voyager's automatic curriculum = the anti-plateau mechanism; compositionality compounds). Fitness: tests pass + reuse count; skills unused for 60 days get flagged for consolidation.

**Capability growth** — Week 1: ~10 primitive skills (fetch a URL, resize an image, parse CSV). Month 3: 150+ skills including composites that are genuinely new behaviors — 'archive my Bandcamp wishlist weekly', 'turn a screenshot folder into a contact sheet PDF', 'diff two save files from my game' — each one a thing the system literally could not do before, and each new skill makes the next one cheaper.

**On your phone** — PWA served from the laptop over Tailscale: a skill-tree/constellation view (nodes = skills, edges = composition), a 'born this week' feed, and a text box that lets you fire a task at the agent from bed and watch it retrieve/compose/grow.

**Hardware** — GPU earns its keep: Qwen2.5-Coder-7B Q4_K_M (~4.7GB) via Ollama fits 8GB with room for nomic-embed-text; 64GB RAM lets you keep a second CPU-side model loaded for embeddings/critique. Honest: a 7B writes mediocre first drafts — the execution-feedback retry loop is what makes it work, exactly as Voyager showed with GPT-4 errors.

**Input needed** — A few task requests per week when you want something; otherwise the nightly curriculum feeds itself. Occasional 'that skill is garbage, retire it' taps on the phone.

**Stack** — Ollama (qwen2.5-coder:7b-instruct-q4_K_M, nomic-embed-text), sqlite-vec for retrieval, node/Python sandbox (child_process with timeouts, or Docker), Haiku 4.5 as nightly curriculum+critic (~$3-8/mo at $1/$5 per Mtok), PWA + Tailscale, ntfy.sh.

**First weekend** — Build the loop for one language (node): retrieve→generate→execute→retry→save skill, seed 5 primitives, hardcode 10 curriculum tasks. First time it composes two skills it wrote itself to pass a task neither could alone = the moment.

**Six months in** — A few hundred skills with a visible phylogeny; the interesting question shifts from 'can it do X' to 'what has it decided to get good at' — the curriculum biases toward your actual usage, so the library is a portrait of your digital life.

**Useful?** — Strong: this converges on a personal automation butler whose abilities are auditable code you can read. Every skill is also a snippet library for your own projects.

**Verified** — Verified: Voyager (arXiv 2305.16291) is open source and its three components (curriculum, skill library, iterative prompting with execution feedback) are the proven recipe; follow-ups (SkillFlow arXiv 2504.06188, Odyssey arXiv 2407.15325) confirm skill-library agents remain an active 2025-26 line. 8GB VRAM reality check (morphllm/localllm.in/tembo 2026 guides): Qwen2.5-Coder-7B Q4_K_M ≈4.7GB is the consensus best coder at this tier; expect strong single-function code, weak long-context — hence small skills + retrieval, not big files. Haiku 4.5 pricing $1/$5 per Mtok confirmed (cloudzero/finout 2026).


#### Ouroboros Forge — the model that trains on its own verified wins

The only idea here where the weights themselves evolve: a local Qwen3-4B agent works tasks all week, keeps every trajectory that passes mechanical verification, and every Sunday night your 5070 QLoRA-finetunes the model on its own successes. Monday's model is measurably, permanently better than Sunday's — and you have the eval chart to prove it.

**The loop** — STaR/rejection-sampling flywheel: (1) generate — the current checkpoint attempts batches of tasks in a verifiable domain (tool-calling for your automations, JSON game-content generation validated by your game's schema+sim, text-to-SQL against test DBs) at high temperature, many samples per task; (2) filter — only trajectories that pass the verifier survive; (3) train — overnight Unsloth QLoRA on the winners; (4) gate — new checkpoint must beat the old on a held-out eval suite or it's discarded (fitness gate on weights). Anti-plateau is explicit and honest: self-training plateaus without fresh signal, so a monthly Haiku 4.5 job generates new harder eval+task items from the failure log (curriculum on the benchmark itself), and you rotate in a new task domain each quarter.

**Capability growth** — Week 1: base Qwen3-4B passes maybe 40% of your tool-call suite. Month 3: it reliably emits your exact tool-call dialect, handles multi-step compositions it failed at week 1, and has absorbed whole new task domains (e.g. quest-JSON generation for your game) that were added after launch — new competencies in the weights, not just a score.

**On your phone** — Eval scoreboard PWA (Tailscale): per-domain pass-rate over checkpoint history, W&B-style loss curves, and a 'taste test' panel showing the same prompt answered by checkpoint-1 vs latest. Push notification when a Sunday run produces a gate-passing checkpoint.

**Hardware** — This is the max-GPU idea. Honest numbers: Unsloth QLoRA on Qwen3-4B fits comfortably in 8GB (4-bit base ~2.5GB + adapters/activations); 7B is possible (community consensus: 8GB is the floor) but tight — short context, small batch, gradient accumulation; plan on 4B. Inference of the 4B Q4 checkpoint ~3GB, so generate and serve fit the same card. 64GB RAM holds the dataset and lets CPU-side verifiers run massively parallel while the GPU generates.

**Input needed** — Near-zero weekly (it's a cron pipeline); monthly hour to review the new curriculum items and eval drift. Real risk to budget honestly: silent reward-hacking of your verifier — auditing 10 random winning trajectories monthly is the chore.

**Stack** — Unsloth + QLoRA (4-bit), Qwen3-4B-Instruct base, llama.cpp/Ollama for serving GGUF exports, Python verifier harness, Haiku 4.5 for monthly curriculum (~$2-5/mo), SQLite for trajectory store, static PWA dashboard.

**First weekend** — Pick one domain (tool-calling with 30 tools you define), write the verifier, generate 2k trajectories overnight, run one Unsloth QLoRA pass, and watch held-out pass-rate move. Seeing your own GPU produce a checkpoint that beats its parent = the moment.

**Six months in** — A lineage of ~25 checkpoints with an eval chart telling a real story (jumps, regressions you rolled back, the month it learned SQL); a 4B model that is genuinely yours — shaped by your tasks, runnable nowhere else.

**Useful?** — The finetuned model becomes the free local brain for ideas 2/4/6 — a tool-calling model tuned on your tools is directly, daily useful and costs $0 per token.

**Verified** — Verified: Unsloth QLoRA guides (Red Hat Developer Apr 2026, machinelearningplus, spheron 2026 VRAM tables) put 7B QLoRA at 8GB minimum ('technically possible, tight, add 15-20% headroom') and sub-8GB for smaller models — hence the honest 4B recommendation. STaR-style train-on-verified-successes is the established recipe behind current self-improvement results. Qwen3-4B confirmed as a top pick at this VRAM tier in 2026 roundups (atomic.chat, promptquorum).


#### Primordial Arena — an Elo ladder where your game's bots evolve their own code

Take one of your shipped browser games, make it headless, and let a population of bot species evolve overnight: an LLM mutates their behavior code, thousands of parallel matches compute fitness, and a MAP-Elites archive keeps the weird ones alive. The phone check is a living ladder where new strategies you never programmed climb past old champions.

**The loop** — OpenEvolve/ShinkaEvolve-style LLM-guided program evolution, but the programs are bot controllers (each a ~100-line JS module against your game's API). Nightly: sample parents from a MAP-Elites archive (behavior dimensions: aggression, mobility, economy — measured from match telemetry, so diversity is structural, not vibes); local Qwen2.5-Coder-7B produces mutations/crossovers with match replays + parent code in context; fitness = Elo from a round-robin swiss tournament run headless in node across all cores (64GB RAM = thousands of matches/night); archive admits any elite of its behavior cell. Anti-plateau: MAP-Elites prevents convergence, and a weekly Haiku 4.5 'innovation injection' writes 3 exotic challengers from a natural-language description of the current meta; when the meta truly stagnates, the loop is allowed to mutate the game rules slightly (new map, new resource), restarting the arms race — open-endedness via environment co-evolution.

**Capability growth** — Week 1: bots random-walk and rush. Month 3: named lineages with real emergent tactics — kiting, bait-and-punish, economy denial, map-specific builds — behaviors that exist nowhere in your code or prompts; the archive holds 200+ distinct-by-measurement strategies, and rule-mutation nights have produced meta-shifts you get to discover like patch notes written by evolution.

**On your phone** — GitHub Pages (pushed nightly): the Elo ladder with sparkline histories, a lineage/family tree per species, and — the killer feature — tap any bot to watch a canvas replay of its best match right on your phone (your games already render in browser; replays are just recorded input streams).

**Hardware** — GPU: serves Qwen2.5-Coder-7B Q4_K_M (~4.7GB) for free mutations all night. CPU/RAM: the real workhorse — headless game sims are embarrassingly parallel across cores, and 64GB holds huge tournament state. Honest: no training on GPU here; it's inference + simulation.

**Input needed** — Zero required after setup. Optional and fun: you can enter a hand-written bot as a challenger and see how long your design survives against evolution.

**Stack** — Your own game engine headless in node (worker_threads), MAP-Elites (simple grid archive, ~200 lines), Elo/TrueSkill, Ollama + qwen2.5-coder:7b for mutation, Haiku 4.5 sparingly (~$2/mo), replay recorder + canvas player, GitHub Pages + ntfy.sh.

**First weekend** — Headless-ify one game, define the bot API, seed 8 hand-written bots, run a 500-match tournament, wire one LLM mutation cycle. First time a mutant beats your best hand-written bot = the moment (typically weekend 1-2).

**Six months in** — A season-based chronicle (rule mutations = seasons) with hall-of-fame lineages; genuinely the most 'alive' feeling of the six — evolution keeps finding exploits in your game, which doubles as the best playtesting your game will ever get.

**Useful?** — Mostly pure fun, honestly — but it's elite playtesting/balancing for games you actually ship, and the evolved bots become shippable AI opponents.

**Verified** — Verified: OpenEvolve (PyPI + multiple active GitHub forks, 2026) is a maintained open-source AlphaEvolve implementation confirming LLM-driven program evolution works at accessible scale; ShinkaEvolve (arXiv 2509.19349) and CodeEvolve (arXiv 2510.14150) show 2025-26 SOTA results with open-weight backbones — i.e. a local 7B mutator is a legitimate engine, not a toy. MAP-Elites is the standard quality-diversity algorithm these systems use against plateau. Qwen2.5-Coder-7B at Q4_K_M ≈4.7GB confirmed the best 8GB coder (2026 VRAM guides).


#### Hobby Gödel Machine — an agent archive that rewrites its own harness nightly

A ~500-line coding agent (prompt templates, tool definitions, memory strategy, retry policy) whose nightly job is to propose one modification to its own source, prove it on a private benchmark of tasks mined from your repos, and enter the archive if it improves. You get a family tree of agents, each a self-authored diff away from its parent.

**The loop** — Darwin Gödel Machine at hobby scale (the jennyzzt/dgm recipe, shrunk): archive of agent versions → sample a parent (novelty-weighted, not greedy — DGM's key open-endedness trick) → the parent agent, run via Claude Code, reads its own code + its failure transcripts and writes a self-modification (new tool, better context packing, a self-review pass, different retry logic) → child runs the gauntlet: 25 small tasks (bugs/features mined from your own game repos + mini-SWE-style synthetic tasks) inside Docker with hard pass/fail tests → score gates admission to the archive. Anti-plateau: task suite grows — every gauntlet failure that later gets human-confirmed as 'should be solvable' becomes a new benchmark task, and a monthly job retires saturated tasks (>90% archive pass rate) for harder ones.

**Capability growth** — Week 1: the seed agent solves ~8/25 tasks with naive edit-and-retest. Month 3: the champion has self-installed capabilities the seed lacked — e.g. it grew a failing-test-first workflow, a grep-based repo map tool, a scratchpad memory file, a self-review diff critic — each one visible as a commit authored by an ancestor, and its gauntlet score roughly doubled on a suite that got harder meanwhile.

**On your phone** — Archive explorer PWA (Pages or Tailscale): the phylogenetic tree with per-node score, tap a node to read the self-modification diff and the agent's own written rationale — reading 'why I changed myself' in bed is the core delight. ntfy push on new champion.

**Hardware** — Mostly CPU (Docker gauntlet, git). Inner-loop LLM is API (Haiku 4.5) for reliability; local Qwen2.5-Coder-7B optionally runs a cheap first gauntlet screen so obviously-broken children never spend API tokens. GPU otherwise idle — this idea buys depth with API, not VRAM.

**Input needed** — 10 min/morning reading the new node; monthly hour curating the task suite (the one real chore, and it matters — benchmark rot is how these die). Budget honesty: ~25 tasks x ~60k tokens on Haiku 4.5 ($1/$5 per Mtok) ≈ $2-6/night; cap nightly spend in the runner.

**Stack** — Fork concepts from jennyzzt/dgm (Apache-2.0); runner in Python/node, Docker sandboxes, git worktrees per child, Haiku 4.5 via API with hard budget, Claude Code as the self-modification author, d3 tree dashboard.

**First weekend** — Write the seed agent + 10-task gauntlet + archive as a git repo of branches; run 5 generations manually. First child that beats its parent with a modification you didn't anticipate = the moment.

**Six months in** — An archive of 100+ agents that is genuinely interesting research-adjacent territory: dead branches, convergent discoveries, one lineage that went weird and paid off — plus the practical spoil: the champion becomes your daily-driver coding agent config.

**Useful?** — High: the evolved harness (prompts, tools, workflow) transplants directly into your real Claude Code setup — you're evolving your own CLAUDE.md/tooling with evidence instead of vibes.

**Verified** — Verified: DGM (arXiv 2505.22954, ICLR 2026 poster; code at github.com/jennyzzt/dgm) improved SWE-bench 20%→50% with exactly this archive+self-modify+benchmark-gate loop — the mechanism is published, open source, and downscales because the loop, not model scale, is the engine. Group-Evolving Agents (arXiv 2602.04837) shows 2026 follow-on work on shared-experience evolution. Haiku 4.5 $1/$5 Mtok confirmed; nightly cost math above uses that. Task-suite growth mirrors DGM's own noted dependence on benchmark quality.


#### The Editor — a morning brief that evolves its prompts from what your thumb tells it

A daily phone-first briefing (your feeds, GitHub, weather, releases) whose editorial brain is a set of prompts under GEPA-style reflective evolution: every tap, skip, and star on the phone is fitness, and every night the losing prompt variant gets rewritten by reflection on real traces. It also grows Voyager-style source-adapter skills, so its reach expands, not just its taste.

**The loop** — Two coupled loops. Taste loop: the brief is generated by a DSPy pipeline (gather → dedupe → score → summarize → compose); each morning serves an A/B of two prompt-genome variants interleaved; phone taps/dwell/stars per item are logged as per-module feedback; nightly GEPA reflects on traces ('items about X were skipped again') and mutates the losing genome — Pareto archive over objectives (tap-rate, coverage, brevity) keeps diverse editors alive, which is the anti-plateau mechanism. Reach loop: when scoring notices a repeated gap ('user starred 3 items about local shows but I have no source'), it files a skill-request; a weekly Claude Code session writes+tests a new adapter (a scraper, an iCal parser, a price-watcher) into the skill library — the system's inputs grow over time.

**Capability growth** — Week 1: RSS + GitHub notifications, generic summaries. Month 3: it has grown adapters you never wrote (release-note differs for your dependencies, a local-events scraper, package price watcher), its prompts have evolved a voice and priority scheme legible in the genome diffs, and it starts an occasional 'you usually care about this' item that surprises you — the tap log proves whether it earned it.

**On your phone** — The product IS the phone view: a PWA brief (served via Tailscale, cached offline) where reading is rating — tap to expand (positive), star (strong), swipe (negative). A 'genome' tab shows current prompt DNA vs 30 days ago, and a 'new senses' feed announces freshly grown adapters.

**Hardware** — GPU: local Qwen3-8B Q4 (or your Ouroboros checkpoint) does the bulk scoring/summarizing of hundreds of items nightly for $0. API: GEPA reflection + weekly adapter-writing on Haiku 4.5/Claude Code, ~$3-6/mo — GEPA's sample-efficiency (35x fewer rollouts than RL) is what makes evolution affordable on a hobby budget. Honest: 64GB RAM is overkill here; this idea needs the always-on laptop more than the silicon.

**Input needed** — The lowest of the six because feedback is the usage: 2-5 min of normal morning reading trains it. Zero other required input; occasional 'never show me X' hard rule via a settings tap.

**Stack** — DSPy + dspy.GEPA, Ollama (qwen3:8b-q4_K_M, nomic-embed-text), SQLite event log, node feed-fetchers, weekly cron'd Claude Code for adapter skills, PWA with service worker + Tailscale, ntfy.sh for the 'brief is ready' push.

**First weekend** — Ship the static pipeline: 5 feeds, local-model scoring, PWA with tap logging, two hand-written prompt variants A/B'd. First GEPA run that rewrites a prompt citing your actual skip pattern in its reflection = the moment (weekend 2).

**Six months in** — An editor with 6 months of evolved editorial DNA and a dozen self-grown senses; the genome-diff history reads like the character development of a butler, and losing it would genuinely hurt your mornings — the strongest daily-usefulness endpoint of the six.

**Useful?** — This is the 'actually useful in daily life' flagship: it starts useful on day 2 and compounds — taste evolution makes it sharper, skill growth makes it broader.

**Verified** — Verified: GEPA (arXiv 2507.19457, ICLR 2026 oral; github.com/gepa-ai/gepa; dspy.GEPA in DSPy) does reflective prompt evolution from execution traces, beating GRPO by ~6-20% with up to 35x fewer rollouts and working with small/cheap models — exactly the budget profile of implicit-feedback nightly evolution; production write-ups (Decagon 2026) confirm real-world use. Qwen3-8B Q4_K_M fits 8GB per 2026 VRAM guides. Voyager-style skill growth for adapters per arXiv 2305.16291. Haiku 4.5 $1/$5 Mtok confirmed for the reflection budget.


### Self-play & RL


#### Dojo Ladder

An AlphaZero dojo for a board game YOU invent: nightly self-play generations climb an ELO ladder while a phone PWA replays the drama games and lets you play tonight's champion. You design the game; the machine discovers its theory.

**The loop** — Gumbel AlphaZero loop (pgx env + DeepMind mctx): ~1024 GPU-vectorized self-play games -> replay buffer -> train small ResNet (6 blocks/128ch) -> gating match vs reigning champion (promote at >55% over 200 games) -> promoted net seeds tomorrow's self-play. Ladder ELO from round-robins of all saved checkpoints. Anti-plateau: auto-hardening curriculum — when ELO gain/night drops below threshold, the harness grows the game (board 7x7->9x9->11x11, or switches on a dormant rule module you designed in), forcing re-learning with transfer; periodic from-scratch challenger runs break self-play local optima.

**Capability growth** — Week 1: knows legal moves + cheap tactics. Month 3: plays openings and traps no earlier checkpoint had. A motif-miner diffs gen N vs gen N-5 over a fixed position suite and flags spots where the chosen move FLIPPED and the new move wins the playout — each becomes a named, dated 'discovery' in the chronicle. Curriculum stages mean the agent literally plays board sizes / rule modules that week-1 couldn't parse.

**On your phone** — GitHub Pages PWA pushed hourly by the trainer: ELO ladder chart, last night's gating verdict, 3 auto-picked drama games as tap-through canvas replays, and PLAY THE CHAMPION — policy net exported to ONNX (~5MB) runs in onnxruntime-web, so the phone plays the current best with the laptop off.

**Hardware** — pgx envs + mctx search + training all on the 5070 (current JAX CUDA wheels support Blackwell sm_120). 6x128 ResNet + 1024 parallel envs uses ~2-4GB VRAM — 8GB is comfortable. Honest timing anchors: an 8GB RTX 2070 ran Connect-Four AlphaZero iterations in 1-2h; pgx-scale runs on an A4000 (5070-laptop ballpark) hit strong Hex in ~18h, Othello ~11h — so real strength on a small original game in 1-3 nights, not one evening. 64GB RAM holds the full replay history in memory.

**Input needed** — Design the game once (the fun part). Then zero required input: systemd timer starts nightly runs; Claude Code post-run hook writes the morning digest. Optional: approve a curriculum step or add a rule module — minutes per week.

**Stack** — Python + JAX, pgx custom-env API (copy pgx's hex.py as template), mctx Gumbel AlphaZero, Flax ResNet, ONNX export + onnxruntime-web, vanilla-JS canvas replayer, GitHub Actions/Pages dashboard, simple ELO/TrueSkill script.

**First weekend** — Day 1: train pgx's built-in Connect Four to verify the whole loop end-to-end (visibly strong in hours). Day 2: write your game as a pgx env + the canvas replayer, launch first overnight run; wake to gen-5 beating gen-1 80/100 and the first weird tactic on the ladder page.

**Six months in** — ~150 gated generations across 3-4 game-growth stages, a chronicle of dated named discoveries, and the milestone: you lost to your phone at your own game around month 2 and now study its openings. Friends play the champion via the public page.

**Useful?** — Mostly pure fun, but the rig is a reusable 'train an AI for any turn-based thing' harness (retarget at puzzles/scheduling later) and a legit portfolio piece.

**Verified** — Verified pgx (github.com/sotetsuk/pgx) is the standard vectorized JAX board-game suite (10-100x faster than Python envs) with mctx Gumbel AlphaZero training demos. Published single-GPU times anchor overnight claims: Hex 17.6h / Othello 11.4h / animal-shogi 6.2h on an A4000; Connect-Four AlphaZero iterations 1-2h on an 8GB RTX 2070. rlglab/minizero (IEEE ToG; active through 2026) is a maintained C++ AlphaZero/MuZero/Gumbel alternative if JAX chafes.


#### Ludoforge

Two-level evolution: a coding agent invents board games as programs each night, an AlphaZero pipeline learns each one, and games are selected for measurable depth — so the players AND the game library improve. Your phone gets a new machine-invented game with a trained opponent every week.

**The loop** — Outer loop: nightly headless Claude Code session mutates/crossbreeds game rule-programs (against a pgx-compatible template or the Ludax board-game DSL) gated by a pytest gauntlet (legal-move soundness, termination, state-space sanity). Inner loop: Gumbel AlphaZero trains 3-5 generations per candidate. A GAME's fitness = depth signals computed from self-play logs: ELO spread across generations (learnable skill ceiling), draw rate 5-25%, game-length variance, first-move advantage near 50%. Losers die, winners breed; a MAP-Elites archive binned by branching-factor x game-length preserves mechanical diversity. Non-plateau: deeper games give agents more to learn; stronger agents sharpen the fitness measurements — the two levels feed each other.

**Capability growth** — Week 1: can evaluate one hand-written game. Month 3: a shelf of 15-30 surviving games with mechanics you never wrote (novel capture rules, asymmetric win conditions), each with its own trained champion — the system can now DO a new thing: hand you a genuinely novel, tested, deep game. The evaluator also grows: when two games tie, the agent proposes and codes a new discriminating metric.

**On your phone** — 'Arcade' PWA on GitHub Pages: shelf of game cards with agent-written rules, depth scores, ELO curves; tap any card to play vs its ONNX champion in-browser; weekly new-release push via ntfy.sh.

**Hardware** — 5070 runs the AlphaZero inner loop (2-4GB VRAM); triage-screening uses tiny 3-block nets and few generations so a night covers ~5 candidates, full runs for finalists only. Invention uses their existing Claude Code subscription (~1 session/night); optional local Qwen3-8B-Q4 mutation runs on CPU/64GB RAM so it never steals VRAM from training.

**Input needed** — Play the weekly release, thumbs-up/down (folded into fitness at low weight). Otherwise autonomous. ~10 min/week.

**Stack** — Ludax (GPU-accelerated board-game DSL in JAX, arXiv 2506.22609) or a pgx-style Python template; mctx Gumbel AlphaZero; pytest as mutation gatekeeper; Claude Code -p on a timer; SQLite MAP-Elites archive; ntfy.sh; onnxruntime-web arcade front end.

**First weekend** — Day 1: stand up inner loop on pgx Connect Four + the depth-metric battery; sanity check that metrics rank Connect Four above Tic-Tac-Toe. Day 2: game-program template + test gauntlet; have Claude generate 5 Tic-Tac-Toe mutants; triage-train overnight; wake to the first leaderboard of invented games.

**Six months in** — A 30+ game arcade with a phylogenetic tree of mechanics ('gravity-capture family, gen 12'), a graveyard of ~400 failed designs with autopsies, and one game good enough that you taught it to friends.

**Useful?** — Best real-utility shot of the six: a surviving game is publishable as one of their browser games/PWAs — the system is a game-design co-founder. The rig also retargets to inventing levels/puzzles for their already-shipped games.

**Verified** — arXiv 2604.25067 verified: frontier coding agents can autonomously implement a working AlphaZero Connect-Four pipeline performing comparably to a perfect solver — the invention loop is grounded, not speculative. Ludax (arXiv 2506.22609) is a real GPU-accelerated board-game DSL in JAX built for exactly this kind of game-space search. pgx supplies the fast inner loop; depth metrics mirror the Ludii general-game-design literature.


#### Ghostline

A top-down racer whose C physics compiles both to WASM (you race it in the browser) and to a vectorized native sim (PPO populations train overnight). Every track has a ghost ladder, and the AI's ghosts keep coming for your times — the Linesight/TrackMania arc on a game you own end-to-end.

**The loop** — PufferLib-style C env stepped at ~1M steps/s across CPU threads; PPO per track with small nets. Nightly bandit allocator sends compute to tracks with the highest progress/hour (the learning frontier). A procedural track breeder (splines + widths + surface patches) generates candidates; a track survives only if it separates skill (high time-variance across ladder checkpoints) — auto-hardening curriculum over the track population. Plateau escape: reward schedule (checkpoint-progress -> pure time), periodic fresh-net exploration bursts, and new mechanics you bolt on (ice, boost pads) that visibly reset the arms race.

**Capability growth** — Week 1: laps 3 tracks without wall-grinding. Month 3: late trail-braking, curb-cutting, drift-carry on ice sectors — and discovered shortcuts, auto-flagged by a line-diff tool (new ghost deviates >N meters from the old line AND gains time), each a dated entry in a discovery feed. Plus whole new tracks/surfaces exist that week-1 code couldn't even simulate, and agents transfer onto them.

**On your phone** — The PWA IS the game (their home turf): pick a track, race tonight's ghost on canvas with touch controls; ladder page lists per-track WR history and 'records broken last night'. Ghosts are logged input+state streams, a few KB each, pushed to GitHub Pages; Tailscale for the live training view.

**Hardware** — Honest split: physics is CPU-heavy (16 threads, thousands of parallel envs), the 5070 does PPO forward/backward and is underused with tiny nets — so run 4-6 tracks concurrently, and later a pixel-input CNN variant to use the GPU properly. 64GB RAM = giant rollout buffers.

**Input needed** — Race when you feel like it (your times become the human WRs the AI hunts). Zero required maintenance once the timer runs; adding a surface/mechanic is an optional weekend mod.

**Stack** — Fixed-timestep deterministic C physics core -> emscripten/WASM for browser + PufferLib 3.0 native env for training; PuffeRL PPO; vanilla JS canvas frontend; ghost format = input replay + periodic state snapshots; GitHub Pages ladder, ntfy.sh pushes.

**First weekend** — Day 1: write the 2D car physics (they've shipped canvas games — home turf), playable in browser same day. Day 2: wrap as a PufferLib env, PPO on one oval; by Sunday night the ghost holds a clean racing line you can't beat on that oval.

**Six months in** — A 100+ track campaign, ghost ladders going back months per track, 20+ entries in the shortcut-discovery feed, seasonal championship reports written by Claude, and friends' phone lap times on the public ladder getting hunted too.

**Useful?** — Mostly fun — but it doubles as a shippable browser game where AI ghosts are self-generating content (a single-player game that manufactures its own opposition), squarely in their existing product line.

**Verified** — Linesight (github.com/Linesight-RL/linesight) verified: hobby-scale RL beat 10 of 12 official TrackMania campaign world records by May 2024 — the arc is proven. PufferLib 3.0 (RLJ 2025) verified 3-5M steps/s small-model training on one RTX 5090 (Pong in seconds, Breakout in ~30s); a 5070 laptop at 5-10x slower still yields overnight superhuman lines on custom tracks. tmrl/RLGym ecosystems confirm racing RL is hobby-mature.


#### Gauntlet Breeder

One generalist physics agent versus an endless breeder of tiny contraption-levels (Jax2D): the generator evolves levels at the edge of the agent's ability, the agent trains on whatever it can almost solve, and both escalate. Morning check-in: a gallery of levels born last night and which ones fell.

**The loop** — Kinetix/Jax2D level space (bodies + joints + thrusters + goals encoded as data). Agent: small permutation-invariant transformer policy, PPO with the whole loop jitted on GPU (PureJaxRL-style). Level side: learnability-based sampling / evolutionary UED — levels scored by success-rate variance (~0.5 = frontier: not solved, not impossible); high-regret levels get mutated (add a joint, move a thruster) and re-enter the pool; MAP-Elites archive over (#joints x gravity x goal-distance) preserves motif diversity. The UED arms race is the non-plateau argument — the frontier moves as the agent does. Weekly eval vs a fixed 30-level human-designed holdout suite measures true generalization, not treadmill motion.

**Capability growth** — Visible unlocks: week 1 nudges a ball to a goal; then lever use, catapulting, cart-driving, two-limb locomotion, multi-stage contraptions. Each first-solve of a holdout level is a dated capability event ('first drove a vehicle: night 34'). The generator grows too — new archive regions colonized = new level families invented.

**On your phone** — Nightly gallery PWA on GitHub Pages: 12 canvas replays of levels born overnight (headless-rendered to lightweight trajectory JSON, drawn in JS), holdout progress bars (7/30 -> 9/30), and a 'hall of monsters' of levels that stumped the agent longest. Push (ntfy.sh) when your hand-drawn challenge level finally falls.

**Hardware** — Most GPU-native idea: Jax2D env AND learner run entirely on the 5070 — Kinetix reports millions of env steps/s on a single GPU. Shrink to 2-4M-param nets for the 8GB budget and it fits with headroom; 64GB RAM stores the level archive + replays.

**Input needed** — None required. Optional fun: sketch a challenge level in a tiny phone editor and drop it into the holdout suite.

**Stack** — Fork the Kinetix codebase (FLAIR, ICLR 2025) + Jax2D, keep their UED/SFL machinery, shrink configs; PureJaxRL PPO; MAP-Elites archive; JS canvas replayer; GitHub Actions publish.

**First weekend** — Day 1: get Kinetix's small config training on random levels on the 5070; render 5 replays in the browser. Day 2: enable learnability-based level sampling + build the gallery page; the first overnight run already shows level difficulty visibly tracking agent skill.

**Six months in** — A fossil record: thousands of archived levels in named families, an agent that zero-shots most things you can draw, 40+ dated capability-unlock events. The idea most likely to still surprise at month 6 — open-endedness is its entire design.

**Useful?** — Pure fun / research-flavored. Spinoffs are skills (UED, JAX at speed) and a mesmerizing public artifact, not a daily-life tool — saying so honestly.

**Verified** — Kinetix (arXiv 2410.23208, ICLR 2025) verified: open-ended physics task space on the Jax2D engine, millions of steps/s on a single GPU, agents that zero-shot unseen human-designed levels — this proposal is its hobby-scale fork. Craftax (arXiv 2402.16801) is the fallback open-ended env; minimax (arXiv 2311.12716) provides tested JAX UED/autocurriculum baselines.


#### Backyard Olympics

Evolved jointed creatures compete in a growing calendar of athletic events — bodies AND brains mutate, a MAP-Elites zoo keeps hundreds of specialist species alive, and new events unlock whenever records saturate. You read the morning sports page.

**The loop** — evosax ES (OpenES/CMA-ES) over policy weights + a morphology genome (limb graph), evaluated in Brax/MJX with thousands of parallel GPU rollouts. Fitness per event: sprint time, jump height, sumo ELO from round-robin pushing matches between lineages. Anti-plateau is structural: QDax MAP-Elites with morphology descriptors evolves hundreds of niches instead of one collapsing champion, and an event auto-scheduler adds a new event (hurdles = add obstacles; relay = two bodies) whenever a record stalls N nights — new selection pressure manufactures new behavior.

**Capability growth** — Not one number: new gaits appear (hop -> gallop -> tumble-roll), new bodies (an evolved third limb repurposed as a brake), and new EVENTS exist that week-1 had no code for. Colonizing a new archive region auto-names a species; sumo ELO across generations gives the ladder spine.

**On your phone** — Morning sports page (GitHub Pages PWA): records table with overnight deltas, 5 replay clips (trajectory JSON -> canvas/three.js), sumo ladder, pinch-zoom phylogenetic tree. Push when any record falls by >5%. Claude writes nightly sports commentary — perfect fit for their coffee-report rhythm.

**Hardware** — Least VRAM-hungry idea: ES is forward-only, so the 5070 evaluates 1000+ small MLP policies in parallel well inside 8GB; Brax/MJX does rigid-body rollouts on-GPU. 64GB RAM archives every elite genome ever evolved.

**Input needed** — None required. Optional mod path: design a new event (climbing wall) on a free weekend.

**Stack** — evosax + Brax (or MuJoCo-MJX), QDax MAP-Elites, SQLite lineage DB, trajectory-JSON replays in canvas, GitHub Actions publish, ntfy.sh pushes, nightly Claude Code commentary job.

**First weekend** — Day 1: evosax + Brax ant sprint on the GPU, one event, browser replay working. Day 2: add morphology mutation + the MAP-Elites grid + the sports page; the overnight run yields a first zoo of 50+ elites with visibly different bodies.

**Six months in** — Hundreds of species across 10+ events, era-defining record progressions, extinct lineages in the fossil tree, and months of commentary archives — a self-grown nature documentary.

**Useful?** — Pure fun. The quality-diversity habit transfers to real design-space search later (layouts, strategies), but don't oversell it.

**Verified** — evosax (RobertTLange/evosax) and EvoJAX (google/evojax) verified as mature JAX neuroevolution stacks (evosax is EvoJAX's ES backend); QDax gives GPU MAP-Elites. Brax runs thousands of parallel rollouts on one GPU. ES being forward-only makes the 8GB claim genuinely safe — checked against EvoJAX's design.


#### Garage Bot League

Train a Rocket League 1v1 bot from scratch via self-play in RocketSim (no game running), watch it climb a ladder of its own past selves, then field it against community bots via RLBot. The 'real game' option — emergent aerials are the payoff.

**The loop** — RLGym-PPO (or GigaLearnCPP for throughput) + RocketSim CPU sim; self-play against a pool of past checkpoints prioritized toward ~50% win-rate opponents; skill-unlock reward curriculum (touch -> shot -> save -> aerial touch) then pure win/loss. Honest plateau note: solo bots stall at mid-level play without reward-engineering iterations — that's where the loop closes: nightly eval report + Claude-proposed reward tweaks you approve weekly.

**Capability growth** — The documented community arc, in your own bot: ball-chasing (day 1) -> shooting -> saves -> dribbles -> flicks -> aerials (weeks to months). Each first (first save, first aerial goal) is detected from logs and arrives as a push notification. Genuinely new behaviors in a game you already understand.

**On your phone** — Ladder page (Tailscale-served PWA, mirrored to Pages): checkpoint ELO vs past selves and vs public bots (Nexto as the measuring stick), plus 3 nightly highlight clips — RocketSim state logs rendered in a simple three.js viewer, no game capture needed.

**Hardware** — RocketSim runs on CPU (16 threads feed it thousands of steps/s); the ~2M-param PPO net trains on the 5070 with VRAM to spare. Honest constraints: Windows, an owned copy of Rocket League for the asset dump, and this is the most assembled-from-existing-parts idea of the six.

**Input needed** — Weekly 30-min reward-shaping review (genuinely needed at plateaus); otherwise autonomous overnight runs.

**Stack** — RLGym 2.0 + rocket-league-gym-sim + RocketSim; RLGym-PPO or GigaLearnCPP; RLBot for live matches vs community bots; three.js replay viewer from logged car/ball states; Tailscale dashboard.

**First weekend** — Follow ZealanL's RLGym-PPO beginner guide: env running day 1; the first overnight run reaches competent ball-chasing and rough shooting by Sunday — the guide's documented expectation on consumer PCs.

**Six months in** — A named bot in RLBot community events, a highlight-reel archive running from month-1 whiffs to month-6 aerials, and hard-won PPO/reward-design skill.

**Useful?** — Pure fun + community bragging rights; no daily-life utility, and saying so.

**Verified** — RLGym/RocketSim ecosystem verified hobby-mature: rlgym.org training guides, AechPro/rocket-league-gym-sim, ZealanL/RLGym-PPO-Guide (explicit consumer-PC beginner path), GigaLearnCPP for high-throughput C++ training. Nexto — the strongest public RL bot — came from hobbyist self-play on this stack, proving consumer hardware suffices. Requires owned game assets (real constraint, disclosed).


### Tools that earn their keep


#### Feed Gardener — a news curator whose rankers breed overnight

Local RSS/HN/Reddit ingester where a population of ranking functions competes to fill your morning feed, and every thumb you flick is selection pressure. The feed you read in month 3 is scored by rankers that did not exist in week 1 — with features Claude Code invented overnight.

**The loop** — State that mutates: (1) a population of ~30 rankers (logistic regression / tiny MLPs over embedding + handcrafted features), (2) the feature-extractor library itself, (3) source list. Signal: thumbs up/down, taps, dwell time, and 'saved' actions logged by the PWA — every item shown records which ranker nominated it, so credit assignment is exact. Nightly: rankers re-fit on the labeled corpus, CMA-ES perturbs MLP weights, bottom third culled. Weekly anti-plateau move: a Claude Code 'feature engineer' run reads the biggest ranking failures (loved items ranked low), proposes 2-3 new feature extractors as real Python (e.g. 'author has appeared in your saves', 'comment-to-upvote ratio', 'is a launch post'), backtests them on history, and merges only winners — so the hypothesis space itself grows, which is what stops the loop from converging on 'more of the same'. 10-20% of each day's slate is an exploration lane (items champion rankers hate but a mutant loves), so labels never collapse to the current policy's comfort zone.

**Capability growth** — Week 1: sorts three RSS feeds by embedding similarity to your saves. Month 3: has feature extractors that didn't exist at launch; auto-discovered new sources (follows outbound links from loved items, trials the source in the exploration lane, promotes it if it earns thumbs); runs HDBSCAN topic clustering that mints new named 'beats' (e.g. 'local-first tooling', 'WebGPU') each with its own specialist ranker; a local Qwen3-4B writes one-line 'why you're seeing this' rationales whose prompt is itself GEPA-evolved against your thumbs on the rationale.

**On your phone** — PWA served from the laptop via Tailscale Serve (HTTPS on your tailnet, phone always reaches it): today's 20-item slate with swipe-to-thumb; a 'garden' tab showing the ranker leaderboard, each ranker's lineage tree, and last night's births/deaths; ntfy push at 7am with the top-3 headline digest. 30-second check: read feed, flick thumbs, glance at which mutant just took the crown.

**Hardware** — GPU: bge-small/all-MiniLM sentence-transformers embeddings for ~2-5k items/night (minutes), Qwen3-4B Q4 (~2.5GB) for rationales and topic labels — all comfortably in 8GB. CPU/RAM: 64GB lets the whole embedding corpus + backtests live in memory; CMA-ES over tiny MLPs is trivial. Overnight is ingestion + refit + weekly Claude Code feature run.

**Input needed** — The thumbs ARE the reading — 2-5 min/day of feed use you'd do anyway. No labeling sessions, no config chores. Optional: pasting a URL you loved from elsewhere as a bonus positive.

**Stack** — Python + feedparser; sqlite-vec (active successor to sqlite-vss) for vectors + labels in one .db file; sentence-transformers on CUDA; scikit-learn / tiny PyTorch MLPs + CMA-ES (cma or EvoTorch); Qwen3-4B via llama.cpp/Ollama; GEPA (pip install gepa) for rationale-prompt evolution; vanilla-JS PWA (his home turf) + Tailscale Serve + ntfy for push; Claude Code headless (claude -p) on a nightly cron for the feature-engineer run.

**First weekend** — Sat: feedparser -> sqlite-vec -> embed -> one cosine-similarity ranker -> PWA feed with thumbs. Sun: log (item, ranker, thumb), add 5 hand-written features, fit logistic regression nightly, show ranker-vs-ranker win rate. First surprise arrives day 3-4: the learned ranker visibly beats raw similarity on your own thumbs.

**Six months in** — A feed that is genuinely yours: dozens of retired ranker generations in a browsable lineage, 15+ evolved features (each one a readable Python function with a birth date and a backtest report), beats you never subscribed to but now read daily, and a hit-rate chart that climbed from ~20% to wherever your taste's ceiling is. Debugging = reading the feature code evolution wrote, which is half the fun.

**Useful?** — Directly useful from week 2 — it replaces doomscrolling with a 20-item slate. By month 3 it's the primary way he finds dev tools and papers; the 'why you're seeing this' rationale makes it trustworthy.

**Verified** — Verified: sqlite-vec is the actively maintained successor to sqlite-vss for local vector search in a single .db (asg017, Mozilla Builders); sentence-transformers + sqlite-vec local pipelines are well documented; Qwen3-4B/Phi-4-Mini run in ~2.5GB at Q4_K_M with 8B-class models at ~40 tok/s in 8GB VRAM (localaimaster/localllm 2026 guides); GEPA is real and shipped (ICLR 2026, dspy.GEPA + standalone pip, +20% over GRPO with 35x fewer rollouts) for evolving the rationale prompt; ntfy self-hosted + Tailscale is the standard 2026 homelab push pattern; EvoTorch/cma for CPU-cheap evolution of small rankers.


#### Oracle Terrarium — a forecaster ecology that earns trust per domain

A population of forecasting bots — each a different pipeline (base-rate priors, news retrieval, FRED time-series models, pure LLM reasoning) — bets daily on auto-resolving questions, and a Brier-score ledger decides who breeds and who dies. You wake up to yesterday's graded predictions and watch specific bots earn your trust in specific domains.

**The loop** — State that mutates: each bot is a config file (prompt + tool list + aggregation recipe) plus a shared, growing tool library of data fetchers. Signal: fully automatic ground truth — questions auto-resolve from public APIs (NWS actuals vs forecasts, FRED releases, stock direction, HN front-page survival, GitHub star counts) plus Metaculus bot-tournament questions for external grounding; every prediction is scored (Brier/log) with zero human grading. Selection: per-domain trust ladder; a router weights bots by domain-specific calibration. Breeding: weekly, Claude Code runs a GEPA-style reflective mutation — reads a losing bot's worst-calibrated predictions and its reasoning traces, writes a mutated child config, and may request a NEW tool ('I need a CPI-nowcast fetcher'), which Claude writes, tests, and adds to the shared library. Anti-plateau: the question generator also evolves — new auto-resolvable domains get minted from any public API, so the ecology keeps facing novel terrain; MiniBench's rotating 2-week question sets provide external non-stationarity for free.

**Capability growth** — Week 1: three bots predict rain/no-rain and next-day stock direction. Month 3: 15-30 bots across 6-10 domains; the tool library has grown fetchers no bot had at launch (FRED nowcasts, AskNews retrieval, Google Trends); the router is a real capability that didn't exist before — an ensemble that knows 'bot-7 for weather, bot-12 for macro'; it competes in the live Metaculus FutureEval/MiniBench bot tournaments, so there's an external leaderboard rank that can genuinely surprise.

**On your phone** — PWA dashboard: 'Today's bets' (open predictions with each bot's probability), 'Yesterday graded' (green/red with Brier deltas), per-domain trust ladder with sparkline calibration curves, and a family tree showing which dead bot each champion descends from. ntfy push each morning: '11/14 resolved, bot-Kestrel took the macro crown, tournament rank 47->41.'

**Hardware** — GPU: Qwen3-8B Q4 (~5GB) or DeepSeek-R1-8B runs the cheap daily rollouts (dozens of forecasts/night, reasoning traces kept for the mutation step) — this is what makes 30 bots affordable. CPU: statsmodels/Prophet-style baselines, resolution scrapers. Claude API only for the weekly mutation/tool-writing step (a few dollars/month); Metaculus sponsors LLM+AskNews credits for tournament bots.

**Input needed** — Zero required: questions generate, resolve, and score themselves. Optional fun: add a personal question ('will I ship the game this month') or read a bot's reasoning trace over coffee.

**Stack** — Python; SQLite ledger; forecasting-tools / metaculus-bot template repos (limyifan1, No-Stream on GitHub) for the tournament API; FRED, NWS, yfinance, Firebase HN API for auto-resolution; Ollama Qwen3-8B for rollouts; GEPA-style reflective mutation via nightly headless Claude Code; PWA + Tailscale + ntfy.

**First weekend** — Sat: question spec format + NWS and yfinance resolvers + 3 hand-written bots + Brier ledger. Sun: dashboard PWA + morning ntfy digest. First kill-and-breed cycle the following weekend once ~50 resolutions have accumulated.

**Six months in** — Hundreds of generations of ledger history, a tool library of 20+ fetchers evolution requested, a router ensemble with a public tournament rank, and calibration curves per domain that make 'which AI pipeline actually predicts well' an empirical question you can answer from your couch. Bots keep dying and surprising because the world keeps moving.

**Useful?** — Real daily utility by month 2: 'should I bike or drive', 'is this earnings week volatile', a calibrated second opinion on any 'will X happen' question — with per-domain trust scores telling you when to believe it. Tournament prize pools ($50k/season) are a lottery-ticket bonus.

**Verified** — Verified: Metaculus runs 2026 bot tournaments (Spring AIB, Summer FutureEval, $50k pools) with LLM/search costs sponsored via Anthropic/OpenAI donations and an AskNews partnership; MiniBench = back-to-back 2-week tournaments with ~60 questions auto-created/resolved from FRED, Google Trends, stocks — ideal free external ground truth; a claude-sonnet bot ranked top ~3% vs 1,130 humans in Spring 2026 Cup, so LLM pipelines are genuinely competitive; open-source metaculus-bot repos exist as templates; GEPA's reflect-on-traces-then-mutate loop (35x fewer rollouts than RL) is the right published mechanism for prompt-pipeline breeding; Qwen3-8B/R1-8B at Q4 fit 8GB for cheap local rollouts.


#### The Apprentice — a code model that trains on you every night

A 1.5-3B code model fine-tunes nightly on your repos and on every completion you accepted or rejected that day, then must beat yesterday's champion on a held-out eval of your own code before it's allowed to serve tomorrow's autocomplete. It starts generic and slowly becomes an autocomplete engine that writes in your exact idiom — requestAnimationFrame loops, your entity-component pattern, your canvas boilerplate.

**The loop** — State that mutates: LoRA adapter weights + a promotion ladder of checkpoints + a growing snippet/scaffold command set. Signal: the editor logs every inline completion shown, accepted, rejected, or accepted-then-edited (edit distance = graded reward) — passive, exact, and abundant. Nightly train: continued FIM pretraining on the day's commits + DPO pairs from accepted-vs-rejected completions (Unsloth QLoRA, 1-3h). Gate: champion/challenger — challenger must beat champion on a frozen eval of 500 FIM tasks sampled from YOUR historical commits (exact-match + edit-sim), so regressions can't ship; the eval set itself refreshes monthly from new commits, which prevents overfitting-to-the-benchmark plateau. Second loop: a weekly Claude Code run mines the acceptance logs for recurring multi-line patterns and promotes them into named scaffold commands — a discrete, growing skill list.

**Capability growth** — Week 1: stock Qwen2.5-Coder-1.5B FIM autocomplete. Month 3: writes your PWA service-worker boilerplate and game-loop skeletons unprompted; owns 10-20 earned scaffold commands ('!particles', '!tilemap-collide') that graduated by acceptance count — commands that literally did not exist until the system noticed you needed them; measurably higher acceptance rate on your code than the stock model (the eval chart proves it's learning you, not just code).

**On your phone** — Static dashboard pushed to GitHub Pages after each night's run (no tunnel needed): acceptance-rate trend, champion-vs-challenger eval outcome ('night 34: challenger won, +2.1% edit-sim'), loss curves, and 'what it learned tonight' — 3 sample completions old-champion vs new-champion side by side. Optional ntfy push when a challenger takes the crown.

**Hardware** — The most GPU-honest idea here: QLoRA on a 1.5B-3B model fits 8GB with tight settings (batch 1-2, seq 1024-2048, gradient checkpointing) — verified feasible at 3B, marginal at 4B, so 1.5B is the safe start and 3B the stretch. Nightly 1-3h train + eval; daytime the same GPU serves the champion at Q8 via llama.cpp for near-instant local completions. 64GB RAM covers dataset building and merges.

**Input needed** — Zero beyond coding as usual — acceptance telemetry is the training data. Occasional: glance at the morning report; veto a bad scaffold command.

**Stack** — Qwen2.5-Coder-1.5B/3B (FIM-native) + Unsloth QLoRA + TRL DPO; llama.cpp server with FIM endpoint; VS Code InlineCompletionItemProvider extension (small TypeScript surface, or configure Continue.dev against the local endpoint and log via its hooks); SQLite for telemetry; nightly cron + headless Claude Code for pattern mining; GitHub Pages dashboard.

**First weekend** — Sat: llama.cpp FIM server + minimal VS Code inline-completion extension with accept/reject logging. Sun: dataset builder from his existing repos + first Unsloth QLoRA run + eval harness. First self-improvement moment: night 2's adapter beating base model on his own held-out code.

**Six months in** — A lineage of ~100 nightly checkpoints with an eval chart telling the true story of the plateau-and-breakthrough kind; a scaffold vocabulary that reads like a fossil record of what he built each month; an autocomplete he misses viscerally on any other machine. Tinkering surface everywhere: eval design, DPO mix, when to grow 1.5B->3B.

**Useful?** — Useful from day 3 (free, offline, low-latency autocomplete) and compounding: it's the only completion engine anywhere trained on his acceptance behavior. Also quietly the best privacy story — his code never leaves the laptop.

**Verified** — Verified: Unsloth docs + 2026 guides confirm QLoRA of ~3B models on 8GB VRAM (4-bit, tight batch/seq) is feasible, 7B possible but painful, and Unsloth advises against QLoRA on the newest Qwen3.5 line — hence Qwen2.5-Coder 1.5B/3B, which are FIM-trained and well-supported; Unsloth Desktop now targets exactly this 8GB no-code tier; llama.cpp serves FIM (/infill) locally; 2.5GB-class models hit 40+ tok/s on 8GB cards per 2026 VRAM guides, fine for inline completion latency. Champion/challenger gating borrowed from the Karpathy-style 'define metric, run overnight, read report with coffee' AutoResearch pattern he already loves.


#### Species Lab — POET-style creature evolution across your own games

Port your shipped canvas games into vectorized headless sims and let a GPU-accelerated ecology of NEAT agents and mutating level variants co-evolve 24/7 — thousands of rollouts in parallel on the 5070. The phone view is a zoo: replay GIFs of last night's new champions solving level variants that also didn't exist last week.

**The loop** — State that mutates: agent genomes (network topologies via TensorNEAT, or fixed-topology params via EvoTorch CMA-ES/PGPE) AND the environment population (POET-style paired open-endedness: level variants mutate — gravity, layouts, enemy speed — and survive only if they're 'Goldilocks': too hard for most agents, solvable by some). Signal: pure game score/survival — no human input ever. MAP-Elites archive over behavior descriptors (distance, aggression, movement entropy) preserves diversity so the run explores instead of converging. Anti-plateau is the whole design: POET provably keeps generating new niches because the curriculum invents itself; transfer attempts (drop an elite from game A into game B's variants) inject cross-domain novelty. Monthly stretch: a Claude Code run proposes new behavior descriptors or mutation operators when the archive's fill-rate stalls.

**Capability growth** — Week 1: agents twitch through one game. Month 3: the archive holds named species with visibly different strategies (wall-hugger, pacifist speedrunner); agents beat level variants no human designed; a second and third game joined the roster and cross-game transfer produced a generalist lineage; the level-mutation grammar itself has expanded — the system now trains on content it generated. That's capability growth in the strictest sense: new environments solved, new behaviors in the archive, new games unlocked.

**On your phone** — GitHub Pages gallery, rebuilt nightly by the run: Hall of Fame with in-browser canvas replays (log seeds+actions, replay deterministically in the original JS game — his engines already render this), MAP-Elites heatmap showing archive coverage growing, species family trees, 'this week's weirdest new behavior' clip. ntfy push when a new game variant is first solved.

**Hardware** — The idea that actually saturates the 5070: TensorNEAT/EvoJAX/EvoTorch vectorize entire populations on GPU (up to 500x over NEAT-Python per the TensorNEAT paper) — thousands of parallel env instances of simple physics games easily fit 8GB; 64GB RAM holds the elite archive + replay logs. True 24/7 workload with checkpointing.

**Input needed** — None required — score is the fitness. The human's role is spectator + occasional zookeeper (add a game port, tweak a behavior axis) when he feels like it.

**Stack** — JAX + TensorNEAT (EMI-Group/tensorneat, supports NEAT/CPPN/HyperNEAT, integrates gymnax/Brax) or EvoTorch for simpler fixed-topology runs; game logic re-implemented as pure JAX step functions (his games are small vanilla-JS sims — mechanical port, and Claude Code is good at exactly this translation); pyribs for MAP-Elites; POET algorithm from Uber AI's paper (enhanced-POET repo as reference); nightly artifact build -> GitHub Pages.

**First weekend** — Sat: port simplest game (e.g. a dodge-or-jump sim) to a JAX step function, verify parity vs JS version. Sun: EvoTorch CMA-ES on it + first replay-in-browser page. Genuine wow moment on day 2: watching an evolved agent play YOUR game better than you.

**Six months in** — A living natural-history museum of his own games: hundreds of species, an ever-expanding variant space, replays worth showing friends. Because POET keeps minting niches and new game ports keep arriving, month-6 check-ins still surprise. Also quietly a portfolio piece: 'I built an open-ended evolution lab for my own games.'

**Useful?** — Mostly pure fun — but with real spinoffs: evolved agents become shippable bosses/NPCs in his next browser game, and evolved 'Goldilocks' level variants are literally auto-generated content he can ship as a daily-challenge mode.

**Verified** — Verified: TensorNEAT (GECCO best-paper line, ACM TELO 2025, arXiv 2504.08339) is maintained and reports up to 500x speedup over NEAT-Python on GPU via JAX; EvoTorch (NNAISENSE) is a stable PyTorch-native alternative; EvoJAX demonstrates the hardware-accelerated neuroevolution pattern; pyribs is the standard MAP-Elites library; POET/Enhanced-POET (Uber AI) is the published open-endedness mechanism this leans on. 8GB VRAM is ample because envs are tiny physics sims, not pixels.


#### Inbox Warden — a triager trained by what you already do to your email

A local IMAP triager whose training signal is your natural behavior — archive-unread is a downvote, reply-fast is an upvote — so it gets measurably better at predicting what deserves your attention without you ever labeling anything. Over months it graduates from sorting to acting: earned draft-reply skills for email genres it has proven it understands.

**The loop** — State that mutates: (1) an attention-ranker (logistic regression -> gradient-boosted trees over embedding + metadata features), (2) a genre taxonomy discovered by clustering, (3) a skill library of reply/action templates with per-skill trust scores. Signal: harvested from IMAP flags and timing deltas — replied-within-hours, archived-unread, deleted, starred, time-to-open — diffed on each sync; completely passive. Nightly: re-fit ranker, score yesterday's priority predictions against realized behavior (did the 'urgent' pile actually get fast replies?) and chart precision/recall. Skill loop: when a genre cluster (recurring newsletters, scheduling requests, order confirmations) accumulates N consistent past responses, Claude Code drafts a handler skill; drafts appear as suggestions; each accept/edit/reject updates that skill's trust; skills only get 'auto-suggest by default' status after a proven acceptance streak. Anti-plateau: email distribution drifts constantly (new senders, new projects), and the genre-discovery clustering keeps minting new candidate skills, so there's always a frontier.

**Capability growth** — Week 1: three-bucket priority sort with an accuracy chart. Month 3: things it literally could not do before — discovered genres with named handlers, trusted draft-replies for 4-5 recurring email types, an unsubscribe hit-list generated from 'you have archived 19 of 20 of these unread', a calendar-conflict flag it wrote a parser for. Each new skill is a discrete unlocked capability with its own trust ledger.

**On your phone** — Morning ntfy push: '3 need you, 11 handled, 2 drafts waiting.' PWA over Tailscale: triaged inbox view, one-tap approve/edit/reject on drafts, a 'Warden report card' tab with the prediction-accuracy trend and the skill trust ladder. The 30-second check is genuinely the morning email check, upgraded.

**Hardware** — GPU: Qwen3-4B or Phi-4-Mini Q4 for genre labeling, summarization, and draft generation — well within 8GB, and email volume is tiny by LLM standards; embeddings via sentence-transformers. Everything else CPU. This is the least compute-hungry idea; the GPU earns its keep on draft quality and privacy (mail never leaves the laptop).

**Input needed** — Passive signal from normal email use. Active: approving/editing drafts you'd have written anyway — net-negative time cost once skills earn trust. This is the strongest 'zero chore' story of the six.

**Stack** — Python imap-tools syncing to local maildir + SQLite; sentence-transformers + sqlite-vec; scikit-learn/LightGBM ranker; HDBSCAN genre clustering; Ollama Qwen3-4B for drafts; headless Claude Code weekly for skill authoring; PWA + Tailscale Serve + ntfy. Gmail via IMAP app-password or Gmail API — read + draft-create only, never auto-send.

**First weekend** — Sat: IMAP sync, behavior-signal extractor (replay 2 years of archive history = instant large labeled dataset — this is the trick that makes week 1 impressive), train ranker, backtest chart. Sun: PWA triage view + morning push. Day-2 payoff: a chart proving it predicts which mail you'll ignore with ~90% accuracy from historical data alone.

**Six months in** — A report card showing months of measurable improvement, a dozen trusted skills each with its origin story ('born from the recruiting-email cluster, trust 0.94'), and an inbox that takes 5 minutes instead of 25. Skill trust ledgers make it endlessly tinkerable and fully auditable.

**Useful?** — The most directly life-useful of the six — attention is the scarcest resource and this trains on the ground truth of where yours actually goes. Clear expansion path: same behavioral-signal architecture later absorbs calendar and to-do triage.

**Verified** — Verified: imap-tools/maildir local sync is mature; sqlite-vec + sentence-transformers is the standard 2026 local semantic-search stack; Qwen3-4B/Phi-4-Mini at ~2.5GB Q4 leave headroom for embeddings on 8GB (2026 VRAM guides); ntfy+Tailscale phone-push pattern verified in current homelab writeups; the harvest-a-golden-path-into-a-skill loop mirrors the Voyager skill-library mechanism (verified skill saved with embedding, retrieved when relevant) now common in Claude Code self-learning-skills repos. No claims requiring fine-tuning, so the 8GB ceiling is irrelevant here.


#### Greenhouse — a home dashboard that writes, tests, and composts its own widgets

A phone dashboard where every widget is an organism: an overnight Claude Code gardener writes new widgets as sandboxed JS modules, your glances and taps are the fitness function, and unused widgets get composted while popular ones breed variants. It's OpenEvolve pointed at your own morning check-in.

**The loop** — State that mutates: the widget population itself — real code (sandboxed iframe JS modules against a typed data-API: weather, ICS calendar, git activity, RSS/Feed-Gardener output, finance CSVs, laptop telemetry, any fetcher in the growing connector library). Signal: attention telemetry the PWA already has — impressions, taps, expand-time, pins, explicit compost button; each widget accumulates a fitness score with novelty bonus decay (new widgets get a trial window on the 'seedling' shelf). Nightly gardener run (headless Claude Code, OpenEvolve-style generate-evaluate-select): composts the bottom, mutates the top ('the git-streak widget gets pinned every Monday — try a weekly-review variant'), and occasionally writes a wholly new species, including writing a NEW connector when a widget idea needs data it doesn't have. Anti-plateau: fitness is your attention, which drifts with your life (new project, new season, new obsession) — the target moves, so the population keeps churning; a monthly 'wildcard' mandate forces one out-of-distribution widget per week.

**Capability growth** — Week 1: three hand-written widgets (weather, calendar, git streak). Month 3: 8-12 surviving widgets, most of which you never specified — maybe a 'rain window for tonight's run', a 'PRs awaiting your review', a 'spending vs月 budget burn-down' — plus a connector library that grew from 3 sources to 10 because widgets requested data. The dashboard's feature set expands without a roadmap; that IS the product.

**On your phone** — The artifact IS the phone view: a PWA over Tailscale Serve — main greenhouse (live widgets, tap to expand, long-press to pin/compost), seedling shelf (last night's births, marked with a sprout), and compost log with epitaphs ('lived 12 days, 3 total taps'). ntfy push only when a genuinely new species sprouts.

**Hardware** — CPU-mostly, honestly: the heavy lifting is Claude Code API calls at night (small budget, ~1-2 runs/day). GPU optional but real: Qwen3-4B locally handles cheap inner-loop widget scoring/critique drafts so the expensive model only sees shortlisted mutations, and powers any summarization widgets. 64GB RAM is cushion, not requirement.

**Input needed** — Glancing at your dashboard is the input. Pin/compost taps are optional accelerants. Occasional veto of a dumb widget. No configuration files ever.

**Stack** — Node/vanilla-JS PWA (his exact stack) with widgets as sandboxed iframes + postMessage data contracts; SQLite telemetry; nightly cron -> headless Claude Code with a gardener prompt + widget-API docs; OpenEvolve (github celerycelery/openevolve, pip openevolve) as reference architecture for the generate-evaluate-select loop or used directly with attention-fitness as the evaluator; Tailscale Serve + ntfy; strict CSP so evolved code can't exfiltrate.

**First weekend** — Sat: PWA shell + widget sandbox contract + 3 seed widgets + telemetry. Sun: the gardener prompt + first overnight run. Monday morning delivers the core magic beat immediately: a widget you didn't write is sitting on the seedling shelf.

**Six months in** — A dashboard with a fossil record — the compost log reads like a diary of what you cared about each month — and a connector library that has become a personal-data API for every other project (Feed Gardener and Inbox Warden can plug in as data sources, making this the meta-project that unifies the others). Still surprising because your attention keeps moving.

**Useful?** — Useful immediately (it's a dashboard) and increasingly personalized without effort. Its endgame is being the single phone pane for all six of these ideas — the greenhouse where every other project's status lives.

**Verified** — Verified: OpenEvolve is alive and pip-installable (v0.2.4) with sophisticated evaluation pipelines, and the 2025-26 CodeEvolve/ShinkaEvolve results confirm LLM-driven evolutionary code loops genuinely work at hobby cost (Qwen3-Coder-30B-backbone runs beat AlphaEvolve numbers on some tasks at ~10x lower cost — here the tasks are far easier than circle packing); the 'run overnight, review with coffee' Claude Code loop is an established 2026 pattern (Osmani's self-improving-agents writeup, karpathy AutoResearch pattern); Tailscale Serve HTTPS-on-tailnet + ntfy verified current. Sandboxed-iframe widget isolation is standard web platform, no exotic deps.


### Watching a model learn


#### The Nursery

Raise a language model from babble to conversation on your own GPU. Every night it trains; every morning a 'baby book' entry shows the same 20 prompts answered at its new age, with an agent-written report on which skills appeared overnight.

**The loop** — State that mutates: model weights + a curriculum mix file. Loop: cron launches nightly nanoGPT training (2-4h); at checkpoint, a fixed prompt battery is sampled; Claude Code grades samples against a skill rubric (spelling, subject-verb agreement, pronoun consistency, plot coherence, dialogue, counting, rhyme) and rewrites next night's data mix toward the weakest skills (more dialogue-heavy TinyStories shards, rhyme corpora, GSM-style counting text). Fitness = per-skill pass rates from the rubric, not just val loss. Anti-plateau: staged curriculum with hard graduation gates — TinyStories → simple-English Wikipedia/FineWeb-edu subset → nanochat-style mid-training + SFT so the model gains a genuinely new behavior class (instruction following, chat) rather than asymptoting on stories.

**Capability growth** — Week 1: character soup → real words → grammatical sentences. Month 1: coherent multi-paragraph stories with consistent characters (TinyStories-class, ~10-30M params reaches this). Month 3: after mid-training/SFT it answers questions and holds short chats in its own weird voice — a behavior it literally did not have (no instruction-following circuitry existed). Also trackable: first correct 'he→she' pronoun switch, first rhymed couplet, first counted list — each detected by the grader and stamped as a milestone.

**On your phone** — PWA served from the laptop over Tailscale (plus nightly static export to GitHub Pages as backup): a scrollable 'childhood' timeline — every checkpoint is a card with the same 20 prompts' outputs, skill radar chart, and the agent's 3-line morning report. A slider scrubs any single prompt across all ages. Push notification when a milestone fires ('first coherent dialogue, day 12').

**Hardware** — 5070 8GB is comfortably enough: 10-50M param models in bf16 with grad accumulation; verified an 8GB RTX 5050 does 50k TinyStories iters in ~3h, so nightly increments are real progress. 64GB RAM holds the whole tokenized dataset as memmap. GPT-2-124M-class end state is feasible over many nights with micro-batch 8-16 + grad accum.

**Input needed** — Zero-touch nightly (cron + Claude Code report). Human: read the morning card with coffee; ~15 min/week nudging curriculum or approving a stage graduation. Occasional weekend to build the next stage (SFT data, chat UI).

**Stack** — karpathy/nanoGPT (or modded-nanogpt's arch tricks ported to 1 GPU), TinyStories dataset (HF), FineWeb-edu sample, nanochat's mid-train/SFT recipe scaled down; PyTorch + bf16; Claude Code headless as nightly grader/curriculum-writer; vanilla-JS PWA + Tailscale; checkpoints kept every night forever (50M params fp16 ≈ 100MB, trivial on disk).

**First weekend** — Saturday: nanoGPT + TinyStories training running, checkpoint saver, fixed prompt battery. Sunday: cron job + Claude Code grading script + one-page PWA timeline. First surprise arrives Monday morning: the word-salad from Saturday now has sentences.

**Six months in** — A 180-night scrollable childhood of one specific creature you made — genuinely moving to scrub. It chats, tells stories on themes, and you've probably forked siblings (different curricula, same seed) to race them. The skill-radar history is a real dataset about skill acquisition order you can blog about.

**Useful?** — Mostly fun/art, honestly. Side utility: the harness (nightly train + agent grader + curriculum mixer) becomes reusable infrastructure for every other idea here, and the model can write bedtime-story content for his games.

**Verified** — Verified: TinyStories paper (arxiv.org/pdf/2305.07759) — <10M param models produce fluent coherent stories, trainable <1 day on one GPU; community report of 8GB RTX 5050 doing 50k iters in ~3h. nanochat (github.com/karpathy/nanochat) confirms full pretrain→SFT→chat pipeline exists as minimal hackable code (its $100 speedrun is 8xH100, so only the mid-train/SFT recipe is borrowed, at toy scale). GPT-2 124M on 8GB confirmed feasible via micro-batch + grad accum (karpathy/llm.c discussion #481 ecosystem). Sources: https://arxiv.org/pdf/2305.07759 , https://github.com/karpathy/nanochat , https://github.com/karpathy/llm.c/discussions/481


#### Basement Speedrun

A nanoGPT-speedrun ladder where the competitor is your own training script and the coach is Claude Code: every night the agent proposes one diff to train.py, races it against the champion, and the leaderboard remembers every idea that ever won. The thing that self-improves is the training recipe itself.

**The loop** — State that mutates: train.py (arch, optimizer, LR schedule, data pipeline) + a lab-notebook JSON of every attempted diff and its result. Fitness signal: wall-clock (and tokens) to reach a fixed val loss on a fixed FineWeb-edu shard with a fixed eval — exactly the modded-nanogpt rules, scaled to one 5070. Loop: nightly, Claude Code reads the notebook, picks one hypothesis (Muon over AdamW, LR warmdown shape, QK-norm, untied embeddings, window schedule...), writes the diff, runs champion vs challenger; winner becomes champion, result + diff appended to notebook so the agent never re-tries dead ideas. Anti-plateau: track rotation like the real speedrun — when gains dry up, open a new track (char-level track, 8M-param track, long-context track, chess-PGN track) and the accumulated recipe knowledge transfers.

**Capability growth** — This is capability growth of the SYSTEM, mechanically honest: month 3's script trains the same model in a fraction of week 1's time (real speedrun went 45 min → 75 s on fixed hardware, so hobby-scale 3-10x is plausible), and the notebook contains dozens of validated, transferable training techniques it did not know at week 1 — a growing skill library of recipes. New tracks = new domains conquered with old knowledge.

**On your phone** — Leaderboard PWA (Tailscale + GitHub Pages export): champion time-to-target per track, sparkline of record progression, and a feed where each entry is 'last night's idea' — the diff, the agent's one-paragraph rationale, and PASS/FAIL with loss curves. Reading why an idea failed is half the fun.

**Hardware** — GPU runs a fixed-budget race nightly (e.g., 2h cap); bf16 on Blackwell, torch.compile. 8GB caps model at ~30-60M params with grad accum, which is fine — the benchmark is defined relative to the hardware. 64GB RAM = memmapped FineWeb shard + fast data pipeline experiments.

**Input needed** — Genuinely near-zero: the loop is agent-driven. Human reads the feed, occasionally vetoes a degenerate direction (e.g., agent overfitting the eval) and seeds new hypotheses monthly. Small Claude API/subscription cost for the nightly agent session is the only ongoing spend.

**Stack** — KellerJordan/modded-nanogpt as the quarry of proven techniques (Muon optimizer, arch tricks) + tylerromero.com single-GPU speedrun worklog as the 1-GPU template; FineWeb-edu via HF; Claude Code headless mode in a sandboxed repo with a rule: only train.py may change, eval harness is frozen and hash-checked (prevents reward hacking); SQLite lab notebook; vanilla JS dashboard.

**First weekend** — Set up the frozen benchmark + baseline nanoGPT run Saturday (baseline time recorded); Sunday wire Claude Code to propose-run-record one diff. By Sunday night you may already watch your first record fall — the loop's first self-improvement is a weekend-1 event.

**Six months in** — A local speedrun history with 100+ attempted diffs, a champion script that embarrasses week-1 you, and 4-5 tracks. It stays alive because every new track resets the fun while compounding the recipe library. Also: you now genuinely understand LLM training dynamics at a practitioner level.

**Useful?** — High indirect usefulness: the optimized recipes make every OTHER model-raising project on this list 2-5x faster, and the harness is a personal AutoML rig. Plus it is the purest version of 'software that rewrites itself' he asked for.

**Verified** — Verified: modded-nanogpt speedrun is active — 3.28 val loss target, record under 75s on 8xH100, <400M tokens vs llm.c's 10B (github.com/kellerjordan/modded-nanogpt). Verified agents can drive this loop: Prime Intellect ran Codex + Claude Code on the optimizer track ~10k runs, and a Claude model set the record (2930 steps vs human 2990) — May 2026 (primeintellect.ai/auto-nanogpt). Single-GPU worklog precedent: tylerromero.com/posts/nanogpt-speedrun-worklog. Sources: https://github.com/kellerjordan/modded-nanogpt , https://www.primeintellect.ai/auto-nanogpt , https://www.tylerromero.com/posts/nanogpt-speedrun-worklog/


#### Dream Cartridge

Train a world model to dream YOUR OWN browser game: a neural net watches millions of frames of a canvas game you wrote, learns its physics, and eventually you play inside the hallucination on your phone. The early broken dreams — balls phasing through paddles, melting sprites — are the spectacle.

**The loop** — State that mutates: world-model weights + the data-collection policy. Ground truth is free and infinite because HE OWNS THE SIMULATOR: a headless node/puppeteer bot plays the real game at 100x realtime logging (64x64 frame, action) pairs. Fitness is mechanical: dream N frames from a seed state, replay same actions in the real engine, measure pixel/feature divergence per horizon — a hard number, no vibes. Loop: nightly training; the collector bot then preferentially plays FROM the states where dreams diverged worst (hard-example mining), so the model automatically drills its weakest dynamics. Anti-plateau ladder: longer coherent horizons → diffusion sampler upgrade → new game mechanics patched into the real game (the world literally changes and the model must relearn) → RL agent (tiny DQN) trained purely inside the dream, whose real-game score is a second fitness signal.

**Capability growth** — Week 1: blurry static that vaguely tracks the player sprite. Month 1: 3-5 second coherent playable dreams — ball physics, collisions, score digits that increment. Month 3: things it flatly could not do before: honor a NEW mechanic you added (powerups), sustain 30+ second rollouts, and host an agent that trained only in the dream yet beats a scripted bot in the real game — transfer from imagination, measurable.

**On your phone** — The killer check-in: PLAY THE DREAM on your phone. Export nightly checkpoint to ONNX Runtime Web/WebGPU (a small U-Net at 64x64 runs client-side, or websocket-stream frames from the laptop over Tailscale). Plus a nightly side-by-side GIF: real engine vs dream from identical seeds, with the divergence-vs-horizon chart. Watching Tuesday's dream keep the ball solid where Monday's dream let it tunnel is a genuine 30-second delight.

**Hardware** — Honest scaling of DIAMOND: their full Atari runs took ~12GB on a 4090 for ~2.9 days — over budget. So: 64x64, action-conditioned small U-Net (5-15M params), start with deterministic next-frame regression (the 2025 Hackaday Pong clone did this on CPUs, so a 5070 is luxurious), upgrade to EDM diffusion with few-step sampling later. 64GB RAM buffers millions of frames; CPU runs the headless real-game bots in parallel while GPU trains.

**Input needed** — Fully automatic overnight (bots collect, model trains, GIFs render). Human: morning glance; monthly fun-injection by patching a new mechanic into the game. Building the RL-in-dream stage is a deliberate weekend project, not a chore.

**Stack** — His own vanilla-JS canvas game + puppeteer/node headless harness; PyTorch U-Net (diffusers' basic training loop as scaffold); DIAMOND repo (diamond-wm.github.io) as the reference architecture to shrink; ONNX Runtime Web / WebGPU for phone inference; Tailscale + PWA; every checkpoint archived for 'dream archaeology' scrubbing.

**First weekend** — Saturday: instrument the game, headless bot logging 1M+ frames. Sunday: train next-frame CNN, render first real-vs-dream GIF. The first dream is always hilariously wrong — and by Sunday night divergence@30-frames is already visibly dropping, which is the loop working.

**Six months in** — A shelf of dream cartridges — every checkpoint of every game version — playable from your phone. You've done the GameNGen arc at hobby scale on a game you wrote, and the RL-in-imagination result is a legitimately bloggable achievement.

**Useful?** — Mostly glorious fun. Real side-utility: the trained dynamics model can power game features (ghost/replay prediction, AI opponents) in his shipped games, and the frame-pipeline skills transfer to anything vision.

**Verified** — Verified: DIAMOND (NeurIPS 2024, arxiv 2405.12399) — diffusion world model, 1.46 HNS on Atari 100k, ~12GB VRAM ~2.9 days per game on one RTX 4090, also ran CS:GO as playable neural engine → confirms the approach and calibrates the 8GB downscale. Verified hobby floor: Hackaday (Aug 2025) covered a Pong neural clone trained on old Xeons, no GPU. GameNGen (arxiv 2408.14837) is the aspirational reference. Sources: https://arxiv.org/abs/2405.12399 , https://diamond-wm.github.io/ , https://hackaday.com/2025/08/24/pong-cloned-by-neural-network/ , https://gamengen.github.io/


#### The Conservatory

A char-level transformer learns music from zero — first it can't even write valid notation, then tunes parse, then they're in key, then AABB folk structure appears, then two voices harmonize. Every night ends with a recital you can listen to in bed, and every recital is kept forever.

**The loop** — State that mutates: model weights + curriculum stage + (later) a small reward model of your taste. Fitness is graded by CODE, not vibes: % of samples that parse (abc2midi/music21), correct bar counts per meter, key consistency, melodic range sanity, AABB repeat-structure detection, and for multi-voice stages, interval/harmony rules. Loop: nightly train on current stage's corpus; exam runs on 200 samples; passing thresholds auto-unlocks the next stage (monophonic thesession.org folk → conditioning tokens for key/meter → multi-voice → Bach chorales → mood tags). Anti-plateau: stages keep raising the bar, and month-3 adds preference learning — you star tunes on the phone, stars train a tiny reward model used for best-of-N sampling and periodic fine-tune on the starred set, so its taste co-evolves with yours. (Deliberately avoiding naive self-training on its own output — mode-collapse risk — real corpora anchor every stage.)

**Capability growth** — Week 1: line noise → syntactically valid ABC (watch parse-rate climb 0→95%). Month 1: complete, in-key, correctly-barred jigs and reels with real AABB structure. Month 3: abilities that didn't exist before: compose in a REQUESTED key/meter (conditioning), write a second harmonizing voice, and match a mood tag — each one a new command it obeys, verified by the exam suite.

**On your phone** — Nightly recital feed in the PWA: 12 fresh tunes as tappable audio players (abc2midi + fluidsynth rendered to mp3 on the laptop), sheet-music PNGs (abcm2ps), the exam scorecard, and a star button per tune (stars are training signal — checking in IS the input). A 'this night last month' player pairs old and new recitals for instant contrast.

**Hardware** — Lightest GPU load of the list: 5-15M param char-transformer on ~40-50k tunes trains a stage in a few evenings on the 5070; leaves headroom to run this 24/7 alongside another project, or to race 3 hyperparameter variants nightly and keep the winner (cheap evolutionary selection). CPU does all rendering.

**Input needed** — Automatic nightly. Human: listen to 2-3 tunes at bedtime, star what you like (optional but feeds the reward model). That's it — the input IS the fun part.

**Stack** — nanoGPT char-level on ABC notation; thesession.org data dump (the folk-rnn lineage proves this corpus works: Sturm et al.'s char-RNN, folkrnn.org still live); music21 + abc2midi + fluidsynth + abcm2ps toolchain; Nottingham database and KernScores/Bach chorales for later stages; SQLite for exams/stars; vanilla-JS PWA with <audio>.

**First weekend** — Saturday: download thesession dump, train char model, build parse-rate exam. Sunday: MIDI→mp3 render pipeline + recital PWA page. Sunday night you fall asleep to recital #1 (mostly broken, occasionally haunting) with the parse-rate curve already climbing.

**Six months in** — An audio childhood: 180 recitals from noise to 2-voice harmonized, mood-conditioned tunes, plus a reward model that provably knows your taste. Endless because taste-conditioning and new corpora (Swedish folk, hymns, video-game-style loops) are endless.

**Useful?** — Real: a royalty-free, taste-matched soundtrack generator for his own browser games — 'give me a tense 3/4 loop in D minor' is exactly a shipped-game need. Also ambient music you actually grew yourself.

**Verified** — Verified: folk-rnn (folkrnn.org) is live and its char-RNN-on-ABC lineage (Sturm et al.) is the proven recipe; thesession.org and folkwiki corpora named there. Nottingham database (~1200 tunes) confirmed as standard starter corpus; multiple recent from-scratch LSTM-on-ABC repos exist (e.g., rainalexotl/lstm-folk-music-generation). Model sizes are tiny, so the 8GB claim needs no caveats. Sources: https://folkrnn.org/ , https://github.com/rainalexotl/lstm-folk-music-generation , https://arxiv.org/pdf/2006.09838


#### Seed Garden

A tiny diffusion model learns to draw pixel art while you watch the SAME 64 noise seeds every single night — 64 embryos developing from static into sprites over weeks. Scrub any seed's timeline like a flipbook of an artist learning to draw.

**The loop** — State that mutates: U-Net weights + conditioning stack + dataset. Fitness: FID against held-out sprites, a sprite-classifier's accuracy on generated samples (can a judge tell it's a 'dragon'?), and your phone star-ratings training a small aesthetic head. Loop: nightly DDPM/EDM training; fixed-seed gallery render; weakest class (worst classifier accuracy) gets oversampled next night. Anti-plateau = capability ladder, each rung a new conditioning input the model learns to obey: unconditional 32x32 → class tokens → palette conditioning → text via a frozen tiny CLIP → 32→64 super-res stage → aesthetic-guided sampling. Dataset also grows: scraped/CC sprite packs added monthly, plus a strictly-filtered 'self-expansion pack' (its own best outputs admitted only if the classifier AND novelty check pass, capped at 10% of data to dodge mode collapse — the collapse risk is real and the cap is the honest mitigation).

**Capability growth** — Week 1: colored noise → blobs with symmetry. Month 1: recognizable creatures/items; the classifier agrees ~80% with intended class. Month 3: things it couldn't do at all before: draw 'a red slime' on command (text conditioning), match a requested 4-color palette, output crisp 64x64 — each new conditioning channel is a discrete new skill with a birthday you can point to in the gallery.

**On your phone** — The fixed-seed gallery PWA: a 8x8 grid where each cell is one seed today, and dragging a global slider scrubs all 64 through every checkpoint simultaneously — the single most satisfying 30-second phone check on this list. Star/flag buttons feed the aesthetic head. Nightly push with the 'most-changed seed' as the notification image. Static export to GitHub Pages so it works anywhere.

**Hardware** — 32x32 U-Net diffusion is squarely in 8GB territory (zzbuzzard/pixartdiffusion did 32x32 pixel-art characters at hobby scale; HF diffusers' basic-training tutorial targets a single consumer GPU). Batch 128+ fits at this resolution; a night of training is many epochs. 64GB RAM caches the whole dataset; the 64x64 super-res stage is the only rung that needs care (smaller batches, grad accum).

**Input needed** — Automatic nightly; human stars ~10 sprites a week and drops new sprite packs in a folder monthly. New-rung builds (adding CLIP conditioning) are fun weekend projects, roughly monthly.

**Stack** — PyTorch + HF diffusers' DDPM training loop as scaffold (or from-scratch EDM for tinkering); zzbuzzard/pixartdiffusion as reference; CC0 sprite sources (OpenGameArt, Kenney packs); small OpenCLIP for text conditioning; SQLite for ratings; canvas-based PWA gallery (his home turf); every checkpoint's 64-image gallery archived as a sprite sheet.

**First weekend** — Saturday: dataset + DDPM training on 32x32, fixed-seed sampler. Sunday: gallery PWA with the scrub slider. By Sunday the seeds already went noise→blobs, and the flipbook effect is immediately addictive.

**Six months in** — Tens of thousands of archived embryo-images forming 64 continuous development filmstrips, a model that takes text+palette orders, and an aesthetic head tuned to your eye. New sprite domains (tilesets, portraits, items) keep resetting the fun.

**Useful?** — Directly useful to THIS builder: a house sprite/tileset generator for his browser games, tuned to his palette and taste. 'Generate 20 candidate enemies in my game's palette' is a real dev-time saver.

**Verified** — Verified: zzbuzzard/pixartdiffusion trains diffusion on 32x32 pixel-art characters as a small-dataset hobby project; HF diffusers has an official single-GPU basic-training tutorial; multiple 2024-25 writeups of from-scratch latent diffusion on consumer cards incl. an RTX 5070 Ti build. FID/classifier fitness and self-data caps are standard practice, collapse risk acknowledged. Sources: https://github.com/zzbuzzard/pixartdiffusion , https://huggingface.co/docs/diffusers/tutorials/basic_training , https://medium.com/@thibaut.chauffier/training-diffusion-models-from-scratch-21d7a1f18e9e


#### The Prodigy

A nanoGPT learns chess from raw PGN text — watch legal-move rate climb from 0 to 99.8%, then watch Elo climb a Stockfish ladder night after night. Uniquely crisp progress: every capability has a number, and month 3's trick (playing at any commanded strength) feels like magic.

**The loop** — State that mutates: weights, then a self-play game buffer. Phase 1 (imitation): train on Lichess PGN; nightly gauntlet vs Stockfish skill levels 0-9 produces a real Elo estimate + probe suite (legal-move %, mate-in-1 solve rate, capture accuracy, castling usage) — all mechanical. Phase 2 (the anti-plateau move, ~month 2): imitation ceilings around 1500 Elo, so switch to expert iteration — model plays thousands of games vs itself and graded Stockfish levels overnight; games where it beat expectations (Stockfish-eval'd) are kept and fine-tuned on; the buffer of its own best games is the growing state. Phase 3: Elo-conditioning tokens (train on games labeled by player rating) give it a genuinely new interface: 'play like 1200' / 'play like 1900' on demand — verified to work in Karvonen's experiments.

**Capability growth** — Week 1: illegal-move soup → legal moves >90% (this curve alone is mesmerizing). Month 1: ~1200-1400 Elo, castles correctly, solves most mate-in-1s. Month 3: new abilities, not just bigger numbers: plays at a commanded strength, self-play has pushed it past its imitation ceiling on the ladder, and probing its residual stream shows a linear board-state world model you can visualize — interpretability as a tinkering playground.

**On your phone** — PWA with a chessboard (chessboard.js) replaying last night's best gauntlet game move-by-move, the Elo-ladder chart with one point per night, probe-suite scorecard, and — the fun one — a 'play it' mode: the checkpoint serves moves over websocket/Tailscale so you can play your prodigy from bed at its current (or any historical!) age.

**Hardware** — Directly calibrated to verified numbers: Karvonen's 25M-param model = 72h on one RTX 3090 to ~1300-1500 Elo; a 5070 laptop GPU with 8GB fits a 25M model easily (bf16 + grad accum) at roughly comparable-or-slower throughput → ~1.5-2 weeks of nights to match. GPU idles during the nightly gauntlet, which is CPU-Stockfish-bound — 64GB RAM runs 16+ parallel gauntlet games.

**Input needed** — Fully automatic (train → gauntlet → report). Human: morning glance at the ladder; play it occasionally (your games can join the buffer); one weekend each to build phase 2 and phase 3.

**Stack** — adamkarvonen/train_ChessGPT (nanoGPT-based, exactly this task) + chess_gpt_eval for the gauntlet harness; Lichess open database PGNs; python-chess + Stockfish (free, CPU); expert-iteration loop is ~200 lines on top; chess_llm_interpretability repo for the board-probe visualizations; vanilla-JS board PWA.

**First weekend** — Saturday: clone train_ChessGPT, start training on a Lichess shard, wire the legal-move probe. Sunday: Stockfish gauntlet + ladder chart PWA. Monday morning you watch legal-move % mid-climb — the single clearest 'it is learning' curve in ML.

**Six months in** — An Elo history with visible phase transitions (imitation ramp, plateau, self-play breakout), a shelf of playable historical selves ('play my model at 3 weeks old'), and world-model probe visualizations. Still alive: chess960 track, endgame-tablebase curriculum, style conditioning (train on Tal vs Petrosian games).

**Useful?** — Genuinely useful if he plays chess at all: an opponent that stays exactly at your level via Elo-conditioning and grows alongside you — something Stockfish's fake skill levels are famously bad at. Otherwise pure, highly-measurable fun.

**Verified** — Verified via Karvonen's writeups/repos: 25M-param nanoGPT on chess PGN → 99.8% legal moves and ~1300 Elo in one day-scale train (72h on one RTX 3090 for 25M; 50M hit ~1500), Elo-conditioning and linear board-state probes both demonstrated; training + eval + interpretability repos all public (train_ChessGPT, chess_gpt_eval, chess_llm_interpretability). Imitation ceiling and expert-iteration escape are standard, honest framing. Sources: https://adamkarvonen.github.io/machine_learning/2024/01/03/chess-world-models.html , https://github.com/adamkarvonen/train_ChessGPT , https://github.com/adamkarvonen/chess_gpt_eval , https://adamkarvonen.github.io/machine_learning/2024/03/20/chess-gpt-interventions.html


### Competing ecologies


#### Red Queen Hill

A perpetual private Core War king-of-the-hill running 24/7 on the laptop, where a byte-level genetic algorithm does the overnight grind and a local coder LLM plays 'mad geneticist,' reading battle logs and founding new warrior lineages. The hill itself is the fitness function, so the target never stops moving.

**The loop** — Population of Redcode warriors on a private KotH hill scored by pMARS/exhaust. Loop 1 (continuous, CPU): mutation/crossover on raw instructions, pythonevolverstage-style, fitness = hill score. Loop 2 (nightly, GPU): Qwen2.5-Coder-7B reads top-10 disassemblies + win/loss matrices and writes challenger warriors — the Sakana DRQ recipe, run locally. Compounding state: a motif library — recurring instruction blocks auto-extracted from champions (bomb loops, imp spirals, decoy fields) become named crossover donors, so later generations search a richer space than early ones. Anti-plateau: (a) the hill is the opponent — Red Queen dynamics, no fixed objective; (b) island hills with weekly migration; (c) a benchmark ratchet that injects classic human warriors tier by tier (Dwarf -> Stone -> Paper -> real 94nop hill warriors) each time the current tier falls.

**Capability growth** — Week 1: random bombers that barely self-terminate. Month 3: the population contains discovered strategy classes it did not have — self-replicators, scanners, imp-rings, decoys — each visible as a new named motif-library entry and a new benchmark tier beaten. Concrete new ability: a warrior good enough to submit to the real corewar.co.uk nano hill, an external test that did not exist for the system at week 1.

**On your phone** — PWA served over Tailscale from a node server: hill ladder, d3 ancestry tree, canvas core-memory battle replays (recorded as JSON event streams — exactly the kind of canvas work he has shipped), plus the LLM's nightly 'scouting report' on the new champion. ntfy.sh push when a long-reigning champion is dethroned.

**Hardware** — CPU is the workhorse: pMARS is tiny and fast — 16-20 parallel MARS processes in 64GB RAM gives millions of battles per night. The 5070 runs only the nightly LLM mutation pass (Qwen2.5-Coder-7B Q4_K_M is ~4.7GB, fits with 8K context).

**Input needed** — Near zero. Reads the morning report; every few weeks adds a benchmark pack or tweaks mutation rates when curious. Nothing breaks if ignored for a month.

**Stack** — pMARS or exhaust (C, off the shelf), Python GA harness, SQLite lineage DB, Ollama + Qwen2.5-Coder-7B, node/express + canvas PWA, Tailscale, ntfy.sh.

**First weekend** — pMARS + 500 random warriors + round-robin scorer + mutate/select loop + static ladder page. The first weekend ends with an evolved warrior that reliably beats Dwarf — a warrior nobody wrote.

**Six months in** — Thousands of generations of phylogeny to spelunk, a motif library reading like a bestiary, LLM-founded lineages competing against GA-ground ones (a standing experiment: which does better?), and entries sitting on the real public hills — the 2025 tournament scene shows those hills are still alive.

**Useful?** — Pure fun, honestly — plus real GA and assembly chops. The external hills give it stakes.

**Verified** — Verified: Sakana+MIT 'Digital Red Queen' (arXiv 2601.03335, github.com/SakanaAI/drq, Jan 2026) shows LLM-evolved Core War warriors work and get more general with longer adversarial runs — this idea is its hobby-scale hybrid. RainRat/pythonevolverstage is a live GA evolver repo; corewar.co.uk documents decades of evolvers (RedRace, MicroGP warriors won nano/tiny hills) and a 2025 tournament weekend confirms active hills. 8GB-VRAM guides (localaimaster.com, morphllm.com) confirm Qwen2.5-Coder-7B Q4 at ~4.7GB with 4-8K context is the sweet spot.


#### Snakepit Foundry

A self-hosted Battlesnake ladder where the bots are JS programs that evolve nightly under an LLM coder, and every winner's best trick gets extracted into a shared, growing skill library the whole population can import. When the ladder stagnates, the rules mutate.

**The loop** — Population of ~40 JS snake bots on the official open-source Battlesnake rules engine (or a fast JS port in worker threads). Nightly: ~50k games -> TrueSkill ladder -> bottom third culled, survivors bred by an LLM coder (overnight Claude Code batch, or local Qwen2.5-Coder-7B) that mutates code with the match logs in context. Compounding state: a Voyager-style skill library — the LLM extracts reusable functions from winners (floodFill, voronoiControl, corridorTrapDetect, opponentIntent) into a documented shared module bots can import; the population's capability space is literally a growing API. Anti-plateau: relative fitness (Red Queen ladder) plus a stagnation detector — when Elo variance collapses, the ruleset mutates (hazard sauce, wrapped walls, new map generator), forcing readaptation and new skills.

**Capability growth** — Week 1: bots random-walk with collision avoidance. Month 3: bots import 30+ named library skills including opponent modeling, and survive rulesets (hazard mazes, wrapped mode) that did not exist at week 1 — skills earned on old rules get recombined for new ones. The changelog of the skill library IS the capability record.

**On your phone** — Nightly static export (ladder JSON + replay JSONs + skill-library changelog) pushed to GitHub Pages with a canvas replay player — checkable from any phone with zero server exposure. 'Skills learned this week' is the headline panel.

**Hardware** — CPU: the Go engine or JS port runs thousands of games/hour across cores; 64GB RAM lets replays be kept hot. GPU: optional local coder LLM. Honest alternative: a $5-15/mo Claude API nightly batch writes noticeably better mutations than a 7B local model.

**Input needed** — Zero daily. Weekly: skim the skill changelog, occasionally veto a degenerate rule mutation. It is his home-turf stack, so tinkering is optional joy, not maintenance.

**Stack** — BattlesnakeOfficial/rules (Go) or JS port, node worker-thread tournament runner, TrueSkill (ts-trueskill), Claude Code cron or Ollama+Qwen coder, GitHub Pages PWA, canvas replayer.

**First weekend** — Rules engine + 20 hand-seeded trivial bots + round robin + ladder page + one manual LLM mutation pass that visibly produces a better bot. Self-improvement moment: gen-2 bot beats every gen-1 bot.

**Six months in** — Hundreds of named lineages, a skill library that reads like a strategy textbook written by no one, ruleset history like geological eras ('the Hazard Winter killed the greedy foragers'), and bots strong enough to enter live community Battlesnake events.

**Useful?** — Mostly fun, but the extracted-skill-library pattern is directly reusable in his real projects, and entering community events gives external stakes.

**Verified** — Verified: Battlesnake community and tooling remain active (github.com/xtagon/awesome-battlesnake; battlesnake GitHub topic shows recent repos); the official rules engine is open source. LLM-driven code-evolution loops proven at accessible scale by OpenEvolve and successors ShinkaEvolve/CodeEvolve (arXiv 2510.14150 documents the lineage; ShinkaEvolve adds bandit LLM-ensembles + novelty rejection worth copying for the mutation step). Skill-library accretion is the Voyager pattern (prior art from knowledge, not re-verified).


#### Petri Colosseum

A GPU-parallel combat ecology: thousands of tiny neural agents dueling in a JAX arena at millions of steps per second, with a MAP-Elites archive as the species museum. Elites are periodically distilled into the 'genome' every newborn inherits, so the capability floor of the whole ecology permanently ratchets up.

**The loop** — Agents are 2-4k-param GRU policies in a batched JAX gridworld duel sim (food, walls, projectiles). evosax evolution strategies drive search; fitness = tournament score against opponents SAMPLED FROM THE ARCHIVE, never a fixed bot — Red Queen by construction. Compounding state, two ratchets: (1) MAP-Elites archive keyed on behavior descriptors (aggression, territory held, mobility) preserves every discovered niche forever; (2) distillation ratchet — every N generations, archive elites are distilled into a shared initialization network that newborns inherit, so behaviors once discovered become the new baseline. Anti-plateau: POET-style environment co-evolution — arena parameters mutate toward maps that maximize discrimination between elites, an automatic curriculum that keeps inventing problems.

**Capability growth** — Week 1: agents chase food and bump walls. Month 3: the archive holds behaviorally distinct species — ambushers, kiters, wall-builders, food-deniers — competent on map families that did not exist at week 1, and newborns start life already knowing month-2 skills via the distilled init. New cells lighting up in the archive = new capabilities, by definition.

**On your phone** — Tailscale PWA: the MAP-Elites heatmap filling in over weeks (the single most satisfying open-endedness visual), nightly highlight matches exported as JSON and replayed in canvas, per-niche Elo sparklines. Push notification when a long-empty archive cell is first filled.

**Hardware** — The genuinely GPU-native idea: on the 5070 under WSL2, a JAX sim + population of 8-16k networks is ~100-300MB of parameters — 8GB is ample; throughput is compute-bound at millions of env steps/sec (the EvoJAX/PufferLib regime). 64GB RAM holds the full archive and replay history.

**Input needed** — Lowest of all six ideas once running: it is a closed loop. Human input = watching, plus occasionally adding a new behavior descriptor or arena element. Requires learning JAX (1-2 focused weekends; he can lean on Claude Code hard here).

**Stack** — JAX + evosax (SNES/OpenES) on WSL2 + CUDA, MAP-Elites archive (numpy + SQLite), POET-style env mutation loop, FastAPI + canvas PWA, ntfy.sh.

**First weekend** — evosax OpenES on a minimal 1v1 duel with self-play sampling, live canvas render of the current champion fighting an archive ancestor. Watching gen-200 dismantle gen-10 is the hook.

**Six months in** — A 50x50 archive mostly filled, a gallery of evolved worlds, and a lineage documentary — 'the kiting dynasty fell when spike-walls appeared.' Because the archive never forgets and the environment never settles, it keeps producing firsts.

**Useful?** — Pure fun / research-adjacent. Honest note: of the six, this one most rewards patience and most risks 'number goes up' unless the archive+POET parts are actually built — they are the whole point.

**Verified** — Verified: EvoJAX (arXiv 2202.05008, github.com/google/evojax) and evosax (GECCO '23) are mature GPU-parallel neuroevolution stacks; PufferLib reports 300k-1.2M training steps/sec on a single GPU and 1M+ env steps/sec/core (puffer.ai), and WarpDrive/GPUDrive confirm the thousands-of-parallel-envs-on-one-GPU pattern; EvoX (arXiv 2301.12457) is a torch-side alternative. POET/MAP-Elites cited from prior knowledge (Uber AI 2019 / Mouret & Clune 2015), not re-verified this session.


#### The Exchange Floor

A Darwinian paper-money trading floor: a population of genetic-programming strategies shares one paper portfolio, capital flows to recent out-of-sample Sharpe, and starved strategies go extinct. The market is nonstationary, so the fitness landscape never stops moving — a Red Queen you do not have to build.

**The loop** — Strategies are GP expression trees over a primitive library (indicators, regime filters) evaluated on live crypto feeds via ccxt. Selection is economic: allocation proportional to rolling out-of-sample risk-adjusted PnL; below-threshold strategies die, top performers breed nightly (subtree crossover + mutation). Compounding state: the feature foundry — a nightly LLM+GP step proposes NEW primitive indicators (e.g., a volatility-regime detector); a primitive is admitted to the library only if strategies using it beat matched controls out-of-sample. The searchable strategy space grows over time, which plain GP trading systems never do. Anti-plateau: regime shifts continually kill incumbents; walk-forward-only fitness blocks the classic overfit death spiral.

**Capability growth** — Week 1: strategies combine ~15 stock indicators. Month 3: the primitive library holds evolved features that did not exist (admitted with their validation stats), species specialized per regime, and the system can express strategies that were unrepresentable at week 1. The library changelog is the capability record.

**On your phone** — PWA over Tailscale: per-species equity curves, an allocation treemap, a births/extinctions feed ('MeanRevGen41 starved after 6 days'), and the primitive library with admission evidence. ntfy push on extinction waves and new-primitive admissions. If built on freqtrade as chassis, FreqUI ships a web dashboard for free.

**Hardware** — CPU: vectorized numpy/pandas backtests and GP breeding (64GB RAM = whole candle history in memory). GPU: optional ML species (LightGBM/PyTorch, per FreqAI's model zoo) and the local LLM in the feature foundry.

**Input needed** — Zero daily once feeds are stable; exchange API/websocket plumbing needs occasional attention (honest cost of using live data). Monthly: review admitted primitives.

**Stack** — ccxt websockets, Python GP (DEAP or hand-rolled trees), SQLite, walk-forward evaluator, Ollama LLM for the foundry, FastAPI + PWA or freqtrade+FreqUI chassis, ntfy.sh.

**First weekend** — ccxt candle feed + 200 random GP strategies + vectorized backtester + shared paper portfolio + leaderboard. First check-in already shows selection working: the population's paper PnL distribution visibly tightens.

**Six months in** — A regime chronicle (which species lived through which market era), a primitive library with a dozen validated evolved features, and a genuinely never-boring dashboard because the market keeps changing the rules for free.

**Useful?** — Honest: paper-only, and no expectation of real alpha — crypto markets are near-efficient and evolved edges are usually overfit. Real usefulness: he ends up with live market monitoring, alerting, and deep intuition; treat any live-money step as a separate, skeptical decision.

**Verified** — Verified: freqtrade/FreqAI is mature open source (JOSS paper 10.21105/joss.04864) with dry-run mode, background retraining, and LightGBM/XGBoost/RL model support (freqtrade.io); a 2025 vectorial-GP paper (arXiv 2504.05418) evolved profitable strategies over 7-year datasets — with the usual in-sample caveats, which motivate this idea's walk-forward-only fitness and control-group primitive admission.


#### Spec Wars

Two co-evolving prompt species locked in an arms race with an objective referee: Attacker prompts generate property tests and edge inputs designed to break code; Defender prompts write the implementations. pytest decides who wins — no LLM judge to sweet-talk — and both species' mutation operators evolve too.

**The loop** — Promptbreeder-style units of evolution: each genome = task-prompt + mutation-prompt, and the mutation-prompts co-evolve (self-referential improvement — the system improves its own method of improving). Nightly tournament: for each spec in a rotating domain deck (string algos, date/tz math, parsers, regex), Defender genomes produce code, Attacker genomes produce test batteries; sandboxed pytest scores everything; Elo per genome; binary-tournament GA breeds both populations. Compounding state: a tactic-card library — prompt fragments extracted from winners ('always probe unicode boundaries', 'demand explicit overflow behavior') become composable genes. Anti-plateau: the adversary is the moving target, plus domain-deck rotation and escalating spec ambiguity tiers.

**Capability growth** — Month 3 vs week 1: the Attacker species has discovered whole bug classes it never mentioned early on — unicode normalization, timezone folds, integer overflow, adversarial regex — each a named tactic card; the Defender species accretes defensive idioms. New cards = new capabilities, and both transfer to domains added later.

**On your phone** — The best bedtime read of the six: a nightly match report digest — actual quoted attack tests and the defenses that fell to them — plus species Elo and the tactic-card gallery, as a static page pushed to GitHub Pages, with ntfy push for upsets.

**Hardware** — 100% local and GPU-centric: Qwen2.5-Coder-7B or Qwen3-8B Q4 on the 5070 (4-8K context per the 8GB guides) plays both species overnight — tens of thousands of generations of tokens cost nothing. Scoring runs in a CPU sandbox (docker/firejail).

**Input needed** — Near zero. Occasionally add a domain deck or an ambiguity tier. Genuinely fine to ignore for weeks.

**Stack** — Ollama or llama.cpp server, Python orchestrator, sandboxed pytest + hypothesis, SQLite genome DB, Elo, static-site digest generator, GitHub Pages.

**First weekend** — Two hand-seeded prompts per side + sandbox runner + Elo + first digest. The hook lands fast: the first time an evolved Attacker finds a bug in code YOU wrote as a control defender.

**Six months in** — Hundreds of tactic cards, distinct attacker phylogenies per domain, and a standing control experiment (evolved prompts vs frontier-model one-shots). Domain decks keep it fresh indefinitely.

**Useful?** — Strongest daily-life payoff of the six: the evolved Attacker species IS a battle-tested test-generation prompt library he can point at his real projects, and the sandbox harness doubles as a personal eval rig.

**Verified** — Verified: Promptbreeder (arXiv 2309.16797) validated self-referential prompt+mutation-prompt co-evolution winning via binary tournaments; no canonical open-source repo surfaced, so build the loop from the paper (it is small). 8GB-VRAM guides (localaimaster.com, atomic.chat) confirm Qwen 7-8B Q4 with capped context is the right local stack. Using pytest as referee sidesteps the LLM-judge gaming/self-preference failure mode that plagues judged prompt-evolution setups.


#### Coliseum VM

Design your own tiny adversarial VM — Core War, but yours — and run the interpreter as a GPU compute kernel so every CUDA thread is a complete match: six-figure battles per second on the 5070. When evolution stagnates, the instruction set itself grows a new opcode, making previously impossible behaviors expressible.

**The loop** — Warriors are byte genomes for a ~16-instruction register VM of his own design; a host-side GA (islands, tournament selection) breeds them; fitness = ladder score from massed GPU battles. Compounding state at the LANGUAGE level: a stagnation detector (Elo spread collapse across islands) unlocks the next feature from a designed backlog — CALL/RET, a shared-arena resource well, a self-inspection opcode, message passing — injecting it into the ISA, the mutation operators, and a subroutine gene bank callable once CALL exists. Capability space expands in the deepest possible way: the alphabet of behavior grows. Anti-plateau: Red Queen ladder + island migration + the ISA ratchet, which manufactures a new frontier exactly when progress stalls.

**Capability growth** — Month 3 warriors call evolved subroutines and exploit opcodes that did not exist at week 1 — e.g., nobody could hoard the resource well before the well existed, and the museum records 'first genome ever to use CALL.' Week-1 champions are literally unable to express month-3 strategies.

**On your phone** — The slickest phone story of the six: the VM is also implemented in WebGPU/WGSL, so a GitHub Pages PWA re-simulates any match client-side from a tiny genome JSON — deterministic replays with zero server. Ladder, ISA changelog, memory-grid battle animation in canvas; ntfy push on opcode unlocks.

**Hardware** — The honest full-GPU build: genomes are KB-scale so 8GB VRAM is a non-issue; the 5070 is used for what it is actually good at — massively parallel branchless interpretation (one thread per match, fixed cycle budget, structure copied from the WarpDrive/GPUDrive one-GPU million-steps pattern). 64GB RAM archives every generation.

**Input needed** — Zero daily. His one recurring creative input — designing the next backlog opcode — is the fun part, monthly-ish; an LLM can propose candidates if he would rather curate than invent.

**Stack** — WebGPU/WGSL (browser-native, his home turf) or CUDA via Python/cupy for the battle kernel; node or Python GA host; SQLite archive; GitHub Pages PWA replayer; ntfy.sh.

**First weekend** — Entirely on home turf: JS VM + WGSL kernel port + 1000 random genomes + round-robin + canvas memory view. First self-improvement moment same weekend: evolved genomes beating hand-written seed warriors in an ISA that did not exist on Friday.

**Six months in** — Ten-plus unlocked opcodes each with its own evolutionary era, deep genome archaeology, and a growing subroutine gene bank — plus the option to bolt on idea #1's LLM-lineage loop later since the architecture is the same shape.

**Useful?** — Pure fun, with a side effect: he comes out knowing GPU compute programming (WGSL/CUDA) cold, the most transferable skill any of these ideas teaches.

**Verified** — Verified: decades of Core War evolvers (corewar.co.uk/evolving.htm, cw-evolver.sourceforge.net, RainRat/pythonevolverstage) prove byte-level GAs find real strategies in tiny adversarial ISAs without any LLM; Sakana DRQ (arXiv 2601.03335) shows the same substrate still yields research-grade open-endedness in 2026; WarpDrive (arXiv 2108.13976), GPUDrive, and PufferLib's 1M steps/sec results validate the one-GPU massively-parallel-sim kernel pattern this interpreter copies.


### Wildcards


#### Glitch Cartographer

An overnight expedition system that mines Game Boy games for glitches, wall-clips, and sequence breaks via massively parallel emulation plus a Go-Explore-style save-state archive. You wake to a museum of newly discovered exploits with auto-rendered replay GIFs.

**The loop** — State = archive of compressed PyBoy save-states keyed by cells (map ID, x/y, event-flag hash, inventory hash). Loop: sample a frontier cell -> load state -> mutate input tapes (random + macro-biased) -> hash resulting RAM states into archive. Anomaly detectors flag physically impossible transitions: position delta > walk speed, player tile inside the collision map, event flags fired out of canonical order, HP/item-count overflow. Confirmed anomalies get distilled into named MACROS (minimal input subsequences reproducing the glitch from a state class), and macros join the mutation operator pool — so tech compounds: a wall-clip macro unlocks unreachable cells, which expose new anomalies. Plateau resistance: every macro grows the reachable frontier; when a ROM is mined out, rotate to a new ROM — the anomaly detectors and macro-mining machinery transfer.

**Capability growth** — Week 1 it can only random-walk and flag coordinate anomalies. Month 3 it owns a tech tree of named reusable macros (clip setups, door skips, menu-buffer tricks), CHAINS them into multi-step glitch routes, and can bootstrap on a fresh ROM using only the generic detectors — abilities (traversals, sequence breaks) it literally could not perform before, demonstrated by replayable input tapes.

**On your phone** — 'Expedition log' PWA served from the laptop over Tailscale: nightly discovery feed with GIFs (PyBoy frame capture -> ffmpeg), explored-state heatmap over the game map, tech-tree page of macros with reproduction tapes. Web-push on 'anomaly class never seen before'.

**Hardware** — CPU is the star: headless PyBoy runs at several hundred fps per instance; 16 threads overnight = tens of millions of frames. 64GB RAM holds 100k+ zstd-compressed save-states in memory for instant archive loads. GPU optional and honest about it: a small RND novelty net or learned RAM-dynamics model (PyTorch, tiny) to score surprisingness — nowhere near the 8GB ceiling.

**Input needed** — One-time per game: pick ROM, wire up the RAM map (community-documented for Gen-1 via the pret/pokered disassembly and datacrystal). Then near-zero; occasional pruning of false-positive anomaly rules when the feed gets noisy.

**Stack** — Python + PyBoy (Game Boy) or stable-retro (NES/SNES later), multiprocessing, zstd save-states, SQLite cell archive, Go-Explore cell-selection heuristic, optional PyTorch RND; FastAPI + PWA; ffmpeg for GIFs.

**First weekend** — PyBoy + Pokemon Red, cell archive on (map,x,y), random tapes, one detector: 'player tile is in collision map'. An overnight run plausibly rediscovers known clips/door skips — a real 'it found something I never taught it' moment on day 2.

**Six months in** — An atlas across 3-4 ROMs, dozens of named macros, chained glitch routes, and a shot at a genuinely novel finding worth posting to TASVideos/Glitch City — plus a full fossil record of how each exploit was found.

**Useful?** — Pure fun (a community-notable glitch discovery is real clout, but no daily-life utility).

**Verified** — Verified: PyBoy is a proven high-speed RL substrate — [PokemonRedExperiments](https://github.com/PWhiddy/PokemonRedExperiments) and 2025 papers ([Pokemon Red via RL, arXiv 2502.19920](https://arxiv.org/abs/2502.19920), PPO <10M params beats the game) show headless Gen-1 emulation at scale on hobby hardware. [BizHawk](https://github.com/TASEmulators/BizHawk) actively maintained (Sept 2025 release) with Lua — the upgrade path for console targets. No off-the-shelf glitch-miner exists; nearest ancestor is Uber's Go-Explore (Atari). All components proven, the glue is greenfield.


#### The Roguelike That Patches Itself

A small canvas roguelike whose items, monsters, and rules live in a data DSL — every night a colony of procedural-persona bots plays thousands of runs, telemetry scores the design, and the game ships itself a patch. You wake up and read patch notes the game wrote about its own meta.

**The loop** — State = ruleset genome (JSON: items/monsters/spells composed from ~30 effect atoms) + persona pool. Nightly: 5-10 personas (heuristic/greedy-MCTS bots with distinct utilities: rusher, hoarder, pacifist, glass-cannon) play ~2k headless runs each. Design fitness is multi-objective and mechanical: persona win-rates inside a target band (0.35-0.55), item pick-rate entropy (kills dead AND dominant items), run-length distribution shape, count of strategy clusters (k-means over action histograms — more viable strategies = better). Propose 20-50 candidate patches (number tweaks + grammar-COMPOSED new content), evaluate all in parallel, ship the best. Anti-plateau, two ways: (1) when pick-rate entropy saturates, the generator unlocks or combines effect atoms — the design space itself grows; (2) persona heuristics are tuned adversarially to find degenerate strategies, which the balancer must then patch: a designer-vs-exploiter arms race.

**Capability growth** — Week 1: nerfs damage numbers. Month 3: the game contains items and monster behaviors that did not exist at launch (composed mechanics like 'on-kill: freeze adjacent + leave hazard tile'), personas execute strategies you never coded, and the balance holds against exploiter bots that keep getting meaner.

**On your phone** — Patch-notes feed as a PWA pushed to GitHub Pages by the nightly run: per-patch win-rate deltas and pick-rate shift charts, persona ladder — and the game itself is playable in the same PWA, so you can play last night's meta from bed. Local Qwen3 8B via Ollama writes the patch prose/flavor text.

**Hardware** — Headless deterministic sim in Node worker_threads (port the hot loop to Rust/wasm if needed) — ~10k runs/night on CPU; 64GB keeps full run telemetry in RAM/duckdb. GPU: only the local LLM patch-note writer (Qwen3 8B Q4 ~5GB) and, later, optional small NN personas. Honest: core loop is CPU.

**Input needed** — Build the game once (squarely his wheelhouse). After that: occasional play sessions — his own traces are gold-standard telemetry — and a veto on rare degenerate patches. No daily chores.

**Stack** — Vanilla JS/canvas with a deterministic seeded core split from rendering; Node worker_threads; SQLite/duckdb telemetry; hand-rolled mutation engine; k-means; Ollama + Qwen3 8B; GitHub Pages PWA + web push.

**First weekend** — Strip an existing game (or 7DRL-scale new one) to a deterministic core + 2 personas + win-rate-band targeting over item numbers. The first overnight run already ships a legible patch: 'Fire Wand nerfed — pick rate 92% -> 41%'.

**Six months in** — A game with six months of accreted self-authored content, a browsable meta-history (play patch 1 vs patch 180 side by side), an arms-race log of exploits found and closed — honestly a better-balanced game than hand-tuning would give.

**Useful?** — Fun-first, but the output is a real, shippable game that keeps improving; his play feeds it rather than maintaining it.

**Verified** — Verified: automatic balancing demonstrated in [Demonstrating the Feasibility of Automatic Game Balancing (arXiv 1603.03795)](https://arxiv.org/pdf/1603.03795); procedural-persona playtesting is established industry practice (EA's RL playtesting for FIFA, per [DigitalDefynd case studies](https://digitaldefynd.com/IQ/ai-in-video-game-testing/)); active 2025 work on [autonomous balancing/DDA](https://www.researchgate.net/publication/396953788_Autonomous_Game_Balancing_AI-Driven_Dynamic_Difficulty_Adjustment_and_Fairness_Metrics). No turnkey framework exists — irrelevant here since the game and sim API are his own. Qwen3-class 4B/8B Q4_K_M fits 8GB per [2026 local-model guides](https://www.morphllm.com/best-ollama-models).


#### Ouroboros Forth

A tiny stack language whose optimizer is grown, not written: overnight, a superoptimizer mines new verified rewrite rules and fused superinstructions from its own running programs and hot-swaps them into itself. The compiler you have at month 3 was discovered, not authored.

**The loop** — Three mutating stores: (1) rewrite-rule library, (2) superinstruction ISA + regenerated dispatch loop, (3) growing benchmark corpus. Loop: STOKE-style stochastic search proposes shorter instruction sequences equivalent to observed hot sequences — equivalence checked cheaply by random-input testing, then PROVEN with Z3 over the stack-effect semantics (easy for a pure stack ISA). Survivors become rewrite rules; egg equality saturation composes the entire library so rules combine beyond any single discovery. A trace profiler finds hot opcode n-grams, fuses them into superinstructions, regenerates the VM's dispatch loop via build script, re-benchmarks, and keeps only measured wins. Fitness = actual cycle/instruction counts on the corpus — no proxy metrics. Anti-plateau: every new program added to the corpus exposes new hot patterns; rules compose combinatorially inside the e-graph; escalation path = a template-JIT tier whose codegen templates are mined the same way.

**Capability growth** — Week 1: rediscovers peephole classics ('swap swap -> nothing', 'dup drop -> nothing', constant folding) without being told them. Month 3: holds algebraic identities you didn't know (STOKE-class weird equivalences), runs a fused ISA specialized to YOUR programs, and can fully compile-to-fused-ops programs it previously only interpreted — 2-10x measured speedups, every step logged and provable.

**On your phone** — Speed-ladder dashboard: per-benchmark cycle counts trending down over months, 'rule of the night' card showing before/after disassembly plus the random program that exposed it, rule-library and ISA growth counters. Nightly static-JSON push to GitHub Pages (or live via Tailscale).

**Hardware** — CPU only, honestly: candidate search is embarrassingly parallel across 16 threads; 64GB RAM is genuinely useful for large e-graphs and corpus-wide saturation runs. GPU idle (optional: a local LLM proposing candidate rules as a smarter mutation prior — not required).

**Input needed** — Near-zero after the build. Feeding it a new benchmark program occasionally is fun, not maintenance.

**Stack** — VM in Rust (or prototype in JS, port hot loop); [egg crate](https://egraphs-good.github.io/) for equality saturation; Z3 via z3.rs for verification; STOKE reimplemented small (do NOT use the repo — x86-specific and aging; the idea, not the code); criterion for honest benchmarking.

**First weekend** — 30-opcode stack VM + random-search rule miner + verify-then-promote peephole pass. First overnight yields dozens of machine-verified rules and a measurable speedup — an authentic self-improvement artifact in 48 hours.

**Six months in** — A self-grown optimizing compiler: hundreds of proven rules, a mined instruction set, maybe a template JIT, and a complete history of every self-modification. Endless hood-opening: e-graphs, SMT, VM internals.

**Useful?** — Mostly intellectual fun with big skill transfer (compilers, SMT, Rust); the language can become his personal scripting layer for other projects.

**Verified** — Verified: egg is mature and maintained ([egraphs-good.github.io](https://egraphs-good.github.io/), POPL 2021 paper); egglog is active with [PLDI 2025 tutorials](https://pldi25.sigplan.org/details/pldi-2025-tutorials/4/Unlocking-Optimizations-with-egglog-Equality-Saturation-Meets-Datalog) and real deployments ([DialEgg MLIR optimizer, CGO 2025](https://dl.acm.org/doi/10.1145/3696443.3708957)) — hobby-scale eqsat is well-trodden. STOKE established that stochastic superoptimization finds non-obvious equivalents; owning a tiny custom ISA sidesteps all of STOKE's x86 pain and makes Z3 verification easy mode.


#### House Nervous System

Three to five $5 ESP32s running ESPresense turn the house into a BLE sensor field; the always-on laptop learns where you are, then learns your routines, then starts inventing, shadow-testing, and shipping its own predictions — retiring the ones that miss.

**The loop** — Three layers, each with a hard score. L1 localization: gradient-boosted trees (LightGBM) over multi-node RSSI fingerprints, retrained nightly on accumulated data — room accuracy measurably climbs as fingerprints densify. L2 routines: semi-Markov model over (room, time-of-day, weekday) predicting next-room, bedtime, departure — continuously scored with Brier score against what actually happened. L3 is the capability engine: a hypothesis generator emits candidate SKILLS as declarative rules ('weekdays ~22:40, hallway->bedroom transition => bed within 20 min: push charge-your-watch reminder'), each skill runs in silent shadow mode for a week, gets promoted to live only above a precision threshold, then earns/loses fitness from implicit feedback (notification dismissed = wrong) and is retired on decay. Anti-plateau: every added $3 sensor (door, motion, temp) adds feature columns that expand the hypothesis space; seasons and life changes keep the distribution moving.

**Capability growth** — Week 1: knows which room you're in. Month 3: forecasts bedtime and departure, flags anomalies ('you left; your keys' BLE tag is still home'), and runs live skills it invented and validated itself — behaviors that were not in the codebase at install, with a promotion log proving each one earned its place.

**On your phone** — Home-brain PWA over Tailscale: live floorplan dot (his canvas chops), per-layer accuracy sparklines, a 'skill nursery' page showing shadow-testing hypotheses with running precision, skill hall-of-fame and graveyard. The push notifications ARE the product.

**Hardware** — Honestly CPU-light: LightGBM nightly retrains take minutes; GPU unneeded (optional local LLM to phrase notifications). The resource that matters is the 24/7 laptop as home server + MQTT broker. The 5070 sits this one out — that's fine, it's the usefulness play.

**Input needed** — Honest up-front cost: buy/flash 3-5 ESP32s (~$25 total), carry phone or wear a BLE watch, and spend ~1 week casually labeling ('I'm in the kitchen' button taps) to bootstrap fingerprints. After that: passive — dismissing bad notifications IS the training signal.

**Stack** — [ESPresense](https://espresense.github.io/) firmware on ESP32s, Mosquitto MQTT, Python + LightGBM + a hand-rolled semi-Markov model, SQLite event store, FastAPI + web-push PWA. Skip Home Assistant: keeping it all his code keeps it tinkerable.

**First weekend** — Two nodes + MQTT + a fingerprint-labeling page + kNN room classifier + live floorplan dot on the phone. Watching nightly accuracy climb as data accretes is the first self-improvement moment.

**Six months in** — A house that quietly knows your rhythms, a hall-of-fame of self-invented skills that survived shadow testing, and an expanding sensor field where each cheap new sensor visibly unlocks new learned behaviors.

**Useful?** — Strongest daily-life payoff of the set: presence-aware reminders, anomaly alerts, and routine forecasts he actually uses every day.

**Verified** — Verified: ESPresense is alive and the community standard for BLE room-level presence ([project docs](https://deepwiki.com/ESPresense/ESPresense), [jamesridgway.co.uk writeups](https://www.jamesridgway.co.uk/better-presence-detection-with-home-assistant-and-espresense/), [v3 guide](https://fixtse.com/en/blog/espresense-detection)); multi-node RSSI fingerprinting for room accuracy is established practice. The L3 self-inventing-skills layer is novel glue, but each part (shadow testing, Brier scoring, precision-gated promotion) is straightforward engineering with no research risk.


#### The Overnight Gallery

An always-on generative-art ecosystem: canvas/WebGL program genomes evolve under a local critic ensemble (aesthetic models + novelty), MAP-Elites keeps the styles diverse, and when a style region stagnates the system commissions brand-new drawing primitives for itself. Your phone opens onto a daily exhibition that did not exist yesterday.

**The loop** — State = pyribs MAP-Elites archive over style axes (PCA of CLIP embeddings) x complexity; genomes = ASTs in a drawing DSL (flow fields, L-systems, reaction-diffusion, palette ops). Fitness = local critic ensemble: LAION Aesthetic Predictor V2 + PickScore/HPSv2 (via imscore) + novelty (min CLIP distance to existing elites). Loop: select elites -> mutate/crossover ASTs -> render headless -> score -> insert. Three anti-plateau mechanisms: (1) novelty is measured against the GROWING archive, so the target moves as cells fill; (2) primitive expansion — when a region's improvement rate flatlines, an overnight Claude Code job implements one new DSL primitive (a new 'brush', e.g. differential-growth lines), sandbox-tests it, and adds it to the grammar, growing the search space itself; (3) optional swipe-ratings train a linear preference probe on CLIP embeddings, steering the critic toward YOUR taste. Known failure mode (scorer-hacking) is mitigated by the ensemble + novelty + occasional human swipes.

**Capability growth** — Week 1: mutates parameters of 5 hand-written primitives. Month 3: renders styles composed from primitives it commissioned itself, filling archive regions that were empty at launch; if you swipe, the critic has measurably diverged from stock LAION taste toward yours. New brushes = literal new abilities.

**On your phone** — Gallery PWA: 'tonight's acquisitions' feed, tappable archive heatmap opening any style cell's LINEAGE (ancestry tree of an artwork), optional 10-second swipe-rating screen. Nightly static export to GitHub Pages or live over Tailscale; doubles as an ambient display on a spare monitor/TV.

**Hardware** — Real GPU work: batched CLIP + scorer inference on the 5070 (LAION V2 is CLIP ViT-L/14 + a tiny MLP; PickScore/HPSv2 similar — all comfortably under 8GB); optional SDXL-Turbo later for texture seeding. Rendering farm = headless Chromium running his own canvas/WebGL code. 64GB holds the full archive + embedding index in RAM.

**Input needed** — Zero required — runs indefinitely on frozen scorers + novelty. Optional ~10s/day of swiping personalizes the critic. Approving commissioned primitives is an occasional 2-minute code review he'll enjoy.

**Stack** — [pyribs](https://pyribs.org/) (CMA-ME/CMA-MAE), open_clip, [imscore](https://github.com/RE-N-Y/imscore) or [improved-aesthetic-predictor](https://github.com/christophschuhmann/improved-aesthetic-predictor), Playwright headless rendering, SQLite + numpy/FAISS embedding index, PWA gallery, Claude Code headless (claude -p) for primitive commissions.

**First weekend** — 5 primitives, param-only mutation, LAION scorer + CLIP novelty, 2D archive, gallery page. The first morning already shows an archive filling with genuinely decent, diverse pieces.

**Six months in** — A thousands-strong museum with complete lineage history, a taste model tuned to you, a grammar that visibly grew — and wall art you actually print. The lineage browser alone stays fascinating.

**Useful?** — Fun-first with real artifacts: ambient displays, wallpapers, printed art, a shareable public gallery.

**Verified** — Verified: the exact pipeline is precedented — the [pyribs QDHF tutorial](https://docs.pyribs.org/en/stable/tutorials/qdhf.html) runs MAP-Elites + diffusion + CLIP for diverse image generation; [LAION Aesthetic V2](https://github.com/christophschuhmann/improved-aesthetic-predictor) is a tiny CLIP+MLP that trivially fits 8GB; [imscore](https://github.com/RE-N-Y/imscore) packages PickScore/HPSv2/LAION as local scorers. Substituting his own program-genome renderer for diffusion is the novel (and cheaper) twist; reward-gaming of aesthetic scorers is a documented risk with known mitigations (ensemble + novelty + human-in-loop).


#### Feral Homepage

Your personal start page treats its own layout and widget set as a genome: contextual bandits reallocate screen space from every tap and dwell, and a nightly synthesis pass writes entirely new widgets for needs the telemetry exposes. The UI you see in month 3 was designed by nobody.

**The loop** — State = widget population (each = sandboxed JS module + capability manifest) + per-slot layout policy. Signal = interaction telemetry: taps, dwell, task completions positive; scroll-past and fast-dismiss strongly negative (this explicit annoyance channel is the guard against engagement-hacking clickbait drift). Layout: LinUCB/Thompson contextual bandit per screen slot conditioned on (hour, weekday, device) — regret measurably falls, fully mechanical. Capability growth: a nightly job clusters dead-end interactions (searches typed into the page, taps leading off-site, repeated manual lookups) and prompts Claude Code headless — or local Qwen3 8B for free runs — to WRITE a candidate widget (strict iframe sandbox, postMessage-only capability API, no network unless whitelisted); candidates enter as low-prior bandit arms and are promoted or killed by real usage. Recombination crosses surviving widgets (this chart x that data source). Anti-plateau: your life is nonstationary, so the bandit never converges; each new connected data source (calendar, RSS, the other projects' dashboards) expands the synthesis space.

**Capability growth** — Week 1: reorders hand-made widgets by time of day. Month 3: contains working widgets no human deliberately designed — e.g. it noticed Friday-evening takeout searches and grew a one-tap reorder card — and the phone-morning layout has speciated from the desktop-evening layout.

**On your phone** — It IS the phone view — it's your homepage PWA. Plus an 'evolution log' page: what changed overnight and why (which telemetry cluster triggered which synthesis), per-arm bandit statistics, widget graveyard.

**Hardware** — CPU trivial; GPU only if using local Qwen3 8B (Q4, ~5GB) for widget synthesis instead of Claude API. Honest: this idea doesn't need the hardware — it earns its slot on the self-redesigning-UI mechanism and daily usefulness, and it federates the other projects' dashboards.

**Input needed** — None beyond using your homepage as a homepage — the using is the signal. Occasional widget veto / 30-second sandbox review of a newly synthesized widget.

**Stack** — Vanilla JS PWA (home turf), iframe-sandboxed widget runtime with postMessage capability API, SQLite telemetry, hand-rolled LinUCB (~50 lines, no library), nightly cron running Claude Code headless (claude -p) or Ollama + Qwen3 8B, web push.

**First weekend** — PWA shell + 5 seed widgets + telemetry + Thompson-sampling slot allocator. Layout visibly adapts to your daily rhythm within days — the cheapest first self-improvement moment of all six ideas.

**Six months in** — A UI with a fossil record: replayable layout history, a graveyard of failed widgets, several synthesized survivors you now rely on — and it quietly became the front door to every other project on this list.

**Useful?** — Highest daily-usefulness density here: it is the thing you already open fifty times a day, getting better at being that.

**Verified** — Verified: LinUCB/Thompson contextual bandits are textbook-simple and need no framework; academic adaptive-UI work exists but no maintained hobby framework — this is greenfield glue, which suits the builder. Claude Code headless (claude -p, his existing workflow) handles synthesis; [Qwen3-class 4B/8B Q4_K_M fits 8GB VRAM for local synthesis per 2026 guides](https://www.morphllm.com/best-ollama-models). Main verified risk is engagement-reward degeneracy; the fast-dismiss negative channel and human veto are the standard mitigations.

