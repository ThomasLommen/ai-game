export const meta = {
  name: 'glyphworks-deep-dive',
  description: 'Deep dive on Glyphworks: systems that maximise the rate and ceiling of unexpected events',
  phases: [
    { title: 'Propose', detail: 'seven lenses on what to add' },
    { title: 'Critique', detail: 'score each addition by surprise-per-complexity' },
    { title: 'Architect', detail: 'assemble the final design and build order' },
  ],
}

const DATA = '/tmp/claude-0/-home-user-ai-game/01c0b2f8-b1f9-50ef-8584-3f694aac66d0/tasks/ideas3_full.json'

const AUDIENCE = `
HOW TO WRITE — NON-NEGOTIABLE:
You are writing for a talented self-taught hobby game developer. He builds browser games in plain JavaScript, ships them, debugs them. He is smart, curious, and will happily learn anything — but he does NOT have a machine-learning or CS-research vocabulary, and he has already told us that the jargon in earlier documents made the ideas impossible to judge. If he cannot understand your mechanism, it does not exist.

RULES:
- Explain like you are talking to a good programmer at a pub. Short sentences. Concrete images.
- Any technical term must be defined in plain words in the same sentence you first use it. BANNED unless defined inline: MDL, DSL, abstraction (in the compiler sense), enumerative search, observational equivalence, autotelic, quality-diversity, MAP-Elites, PPO, wake-sleep, niche construction, stationarity, s-expression, corpus, prior, epoch, cache invalidation, combinatorics, non-stationarity, credit assignment, emergent (use it only when you say emergent FROM WHAT).
- Never use a metaphor as if it were a mechanism. If a thing is literally a number going up, say so.
- When you propose a system, always answer: what does it let the world do that it could not do before? Give a concrete example of a specific unexpected event it makes possible.
- Be honest about cost and about the chance it does nothing.`

const CONTEXT = `
THE PROJECT — GLYPHWORKS (read the real design first):
The file ${DATA} is JSON with a key "all" containing 42 project designs, each with an attached "audit" object. Find the one named "Glyphworks" and read every field AND its full audit. Also read "Ashcairn", "Emberlisp", "The Slow Kiln" and "Palimpsest" for mechanisms worth borrowing. Do this BEFORE proposing anything.

Glyphworks in plain terms: a river valley of about 400 sites. Small tribes survive, and everything a person does is a short program in a tiny made-up language (roughly 40 commands like move, take, heat, wait). Nobody writes their behaviour — the computer brute-force searches for programs that keep them alive. Every simulated night, a compressor reads all the programs that worked and finds chunks of code that keep repeating; each repeated chunk gets pulled out, given a name by a small local language model, and becomes a new single command. That growing list of named chunks is the tribe's technology, and nobody authored it.
Glyphworks' one big addition: a named chunk that always runs at one spot and is expensive can be BUILT as a "works" — a physical building standing on a map tile. Once built, running that chunk there costs a fraction of what it did, AND a works can hold physical states bare hands cannot (a kiln sustains a temperature that no single heat command can). So a building does not only make things cheaper, it makes new things possible, which opens the next tier of what can be invented.

THE BUILDER'S GOAL — THIS IS THE DESIGN TARGET, OPTIMISE FOR IT:
He has explicitly abandoned "reach real technology" and "be open-ended" as goals. What he actually wants, in his own words: as much depth as reasonably possible so the world "might someday do more and more unexpected things." He was most excited by this specific sentence about month six: "maybe once or twice in six months, a building that can only be made from a material another building produces — the moment craft becomes industry. It might not happen. That's the bet." The CHANCE of it, and the fact that it might not happen, is precisely what makes it feel living to him.

So the objective function is: MAXIMISE THE SUSTAINED RATE OF GENUINELY UNEXPECTED EVENTS, AND THE CEILING ON HOW BIG A SURPRISE IS POSSIBLE. An "unexpected event" means something the builder did not author and could not have predicted from the rules he wrote. Rare-but-possible big events are worth more than a steady drip of small ones. A system that adds machinery without raising either the rate or the ceiling is worthless here.

WHAT THE AUDIT ALREADY ESTABLISHED — treat these as known problems to solve, do not rediscover them:
1. STOREYS ARE AUTHORED. With ~12 hand-written physics rules you get 3-5 qualitative levels of technology and then only sprawl. The audit's proposed fix: rewrite the physics as ~6 rule TEMPLATES with blank numbers in them, and let a works fill in the blanks with values it can physically sustain — so the built environment extends the rulebook itself rather than just reaching further along a fixed one.
2. THE BOTTLENECK IS THE SUPPLY OF PROBLEMS, NOT THE COMPRESSOR. Every audit across 42 designs independently concluded this. A world that only poses "you are hungry / cold / something broke" runs out of genuinely new problems in about 6-10 weeks. Something must keep generating new goals just beyond what the tribe can currently do.
3. COMPRESSION IS NOT THE SAME AS EFFICIENCY. The compressor makes programs SHORTER, not cheaper to run. A short chunk can be enormously expensive to execute. Left alone, the compressor and survival pressure fight each other.
4. SILENT WRONG ANSWERS. The search remembers "I tried this program, here is what happened" so it does not redo work. But what a program does depends on which buildings are in reach, and buildings get built and fall down. Remember it wrong and the search silently reuses an answer from a world that no longer exists. Nothing crashes; the map just goes wrong weeks later.
5. THROUGHPUT. A slow implementation gives maybe a few million program attempts per night when ten times that is needed. Also, past about three layers deep, blind brute-force stalls — something has to guide the search toward promising programs.
6. THE NAMING MODEL MANUFACTURES FAKE DEPTH. A small model will confidently name meaningless repeated patterns, and roughly three out of four repeated chunks are plumbing with no human meaning.
7. AUTHORED SEAMS. Two places where the designer's taste sneaks back in: the rule deciding which chunks become buildings, and a hand-written table mapping program syntax to build costs (that table is a recipe book in disguise).

HIS SITUATION:
- Gaming laptop: RTX 5070 laptop GPU (8GB video memory), 64GB RAM, can run 24/7.
- Progress must be checkable from a phone in 30 seconds, and rewarding to binge for an hour. The map is the check-in.
- Near-zero chores. Occasional god-nudges are welcome and fun; nightly maintenance is not.
- AN AI WRITES THE CODE. This removes learning-curve and labour objections — assume competent implementation of anything, in any language. It does NOT remove: his tuning burden (moving numbers by taste for months), his debugging burden (especially silent-wrong-answer bugs), or the fact that building faster brings any plateau FORWARD rather than raising it. Design work and taste are his job.

METHOD: research where it helps (4-8 web searches for real algorithms, papers, repos, and what runs on this hardware), but spend most of your effort on DESIGN. Name real mechanisms with real data structures. Be specific enough that a competent engineer could build it.`

const PROPOSE_SCHEMA = {
  type: 'object', required: ['systems'],
  properties: { systems: { type: 'array', minItems: 4, maxItems: 6, items: {
    type: 'object',
    required: ['name','plain_explanation','what_new_becomes_possible','concrete_surprise_example','why_it_raises_the_ceiling','how_it_works','authored_risk','build_cost','tuning_burden','interactions','honest_chance_it_does_nothing'],
    properties: {
      name: { type: 'string', description: 'a short memorable name for this system' },
      plain_explanation: { type: 'string', description: '3-5 sentences, pub-explanation, zero undefined jargon' },
      what_new_becomes_possible: { type: 'string', description: 'what the world can do with this that it could not do without it' },
      concrete_surprise_example: { type: 'string', description: 'one specific, vivid, plausible unexpected event this makes possible — the kind of thing that would show up on his phone' },
      why_it_raises_the_ceiling: { type: 'string', description: 'does it raise the CEILING on how big a surprise can be, or only the RATE of small ones? Answer directly.' },
      how_it_works: { type: 'string', description: 'the actual mechanism: data structures, algorithm, when it runs. Specific enough to build.' },
      authored_risk: { type: 'string', description: 'how much of what emerges was secretly written by the designer? Be harsh.' },
      build_cost: { type: 'string', description: 'rough size given an AI writes the code' },
      tuning_burden: { type: 'string', description: 'what the human will have to fiddle with, honestly' },
      interactions: { type: 'string', description: 'which other systems it needs, feeds, or fights with' },
      honest_chance_it_does_nothing: { type: 'string', description: 'realistic probability this adds nothing, and why' },
    } } } },
}

const LENSES = [
  { key: 'matter', prompt: `LENS: MATTER AND PHYSICS — making the stuff of the world deep and unauthored. Your job is the substance layer: what things are made of, how they transform, and why the space of possible materials does not run out. Consider: a GENERATED core (a few dozen numbers per element from which all reaction rules and product properties are DERIVED by fixed formulas, so no list of possible materials exists anywhere, including in the builder's head — a new world is a new draw of numbers); continuous property vectors instead of named items so blends and alloys are literally continuous; phase changes and thresholds; conservation laws as a mechanical referee that makes nonsense impossible; rule TEMPLATES with blank numbers that a building can fill in; measuring the reachable set of substances on day one as a go/no-go test. Research artificial chemistry, generative reaction systems, property-space design.` },
  { key: 'works', prompt: `LENS: THE BUILDINGS THEMSELVES — the heart of Glyphworks and the thing he fell in love with. Your job: make buildings as generative as possible. Consider: buildings that install new rule-template instances rather than merely caching a recipe (so the rulebook grows); buildings made from materials only another building can produce (SECOND-ORDER WORKS — he named this as his dream event, so treat maximising its probability and frequency as an explicit design goal, and say exactly what makes it more likely); buildings that compose with neighbours so a workshop then a village then something like a factory falls out without those words existing in the code; maintenance, decay, and over-building as a real failure mode; ruins that a later tribe can read and partially recover; buildings that change what is SEARCHABLE nearby (a place where thinking is cheap); buildings that only work in certain terrain. Be concrete about what makes each of these fire more often.` },
  { key: 'curriculum', prompt: `LENS: WHAT DRIVES INVENTION — the audit says the supply of problems is the true bottleneck, and nobody designed a solution. Your job is the goal-generating engine. Consider: goals proposed automatically and kept only if they sit just beyond current ability (unsolved at one budget, solved at three times that budget, retired once easy); an archive of goals spread across a space of physical properties so the frontier keeps receding as the buildings open new regions; survival as the lethal floor and property-frontier goals as the receding ceiling; rival tribes as each other's curriculum; the world itself as antagonist. Research OMNI-EPIC, MAGELLAN, learning-progress curricula, minimal criterion coevolution, and open-ended task generation — then give the hobby-scale version that is a couple of hundred lines, not a research programme.` },
  { key: 'society', prompt: `LENS: PEOPLE, KNOWLEDGE AND ECONOMY — the layer that turns a search engine into a world with drama. Your job: social systems that create NEW invention pressures rather than decoration. Consider: knowledge living in specific people's heads so that when the last person who knows something dies, it is genuinely deleted and everything built on it breaks (a dark age with a stack trace); a limit on how much can be taught per season so a big library becomes a liability and tribes must choose what to keep; specialists, secrets, and trade in knowledge; conflict over buildings because buildings are the thing worth taking; migration and splitting; rediscovery of something previously lost, detected by matching behaviour rather than matching code. Say for each how it INCREASES the number of surprising things that can happen, not just how it adds flavour.` },
  { key: 'instrumentation', prompt: `LENS: SEEING THE SURPRISE — a surprise that the builder cannot see did not happen. Your job: detect, verify, rank and present unexpected events, and stop him fooling himself. Consider: how to tell a first-ever event from noise; detecting when a new thing has become load-bearing for everything else; re-running a night with one invention suppressed to measure whether it actually MATTERED rather than merely being new; a matched control world running with invention switched off so he can tell whether his engine is the cause of anything; gating the naming model so only things used by two groups on two different problems earn a name; notification discipline (at most a few pushes a day plus one guaranteed morning digest); the map as its own lie detector; the time-lapse; what makes an hour-long browse rewarding. Research novelty detection and surprise metrics, but keep the proposals cheap and concrete.` },
  { key: 'longhorizon', prompt: `LENS: MONTH SIX TO YEAR TWO — everything else in this pool dies around week ten. Your job is sustained freshness over a very long run. Consider: geology and climate on long cycles that invalidate what was built; floods and catastrophes that interact with what exists rather than being random; the river moving; resources depleting so success creates its own scarcity; multiple valleys with different generated physics and rare migration between them, where whether an invention survives transplant is a computed measure of whether it was a real law or a local trick; epochs and archaeology; deliberate human god-nudges designed to be a fun ritual rather than a chore; and the honest question of whether "add more physics" can be automated or must stay manual. Be specific about what each buys in months, and about what genuinely cannot be fixed.` },
  { key: 'engine', prompt: `LENS: THROUGHPUT AND CORRECTNESS — the unglamorous lens, and possibly the highest-leverage one, because the rate of surprise is directly proportional to how many experiments run per night. Your job: the machine underneath. Consider: how fast the little virtual machine that runs tribe programs must be and how to get there (language choice, bytecode, memory layout, parallelism across cores); how to guide the search once blind brute force stalls around three layers deep, including what job the 8GB GPU should actually do (the audit says a small neural network that predicts which commands are worth trying, trained nightly — NOT naming things); how to remember past attempts without silently reusing answers from a world that no longer exists, given buildings appear and decay; strict determinism and replayability so any night can be re-run exactly; budgeting everything in virtual steps rather than wall-clock so a hot laptop and a cool one produce identical history; a watchdog because a 3am crash that silently stops the world is the real chore. Give concrete numbers where you can.` },
]

phase('Propose')
const critiqued = await pipeline(
  LENSES,
  l => agent(`${CONTEXT}\n\n${l.prompt}\n\n${AUDIENCE}\n\nPropose 4-6 systems from your lens only. Every one must be justified by how it raises the rate or the ceiling of unexpected events.`,
        { label: `propose:${l.key}`, phase: 'Propose', schema: PROPOSE_SCHEMA, effort: 'high' })
        .then(r => r ? r.systems.map(s => ({ ...s, lens: l.key })) : []),
  (systems, l) => systems.length === 0 ? [] : agent(
      `You are a ruthless simulation-design critic. Below are ${systems.length} proposed additions to Glyphworks (described in the context). The builder's goal is to MAXIMISE THE SUSTAINED RATE AND CEILING OF GENUINELY UNEXPECTED EVENTS — things he did not author and could not predict.

For EACH proposal, judge hard:
1. Does it raise the CEILING (new KINDS of surprise become possible) or only the RATE (more of the same kind)? Ceiling-raisers are worth far more.
2. How much of what "emerges" was actually written by the designer in disguise? Every hand-written table, threshold, or classifier is a place his taste re-enters. Name them.
3. Will it actually work, or is it a research programme wearing a weekend's clothing?
4. Does it fight any other proposal, or silently depend on one that is not there?
5. Is the surprise it produces LEGIBLE — would he notice and understand it, or would it vanish into noise?

Score each: keep_verdict = "core" (build it, the design fails without it), "strong" (clear win, build after core), "cheap-win" (small effort, real payoff), "later" (real but wait), or "cut" (machinery without payoff, or authored content in disguise).
Give each a surprise_per_effort score 1-10. Be stingy above 7.

${CONTEXT}

PROPOSALS (JSON):\n${JSON.stringify(systems, null, 1)}`,
      { label: `critique:${l.key}`, phase: 'Critique', effort: 'high', schema: {
        type: 'object', required: ['verdicts'],
        properties: { verdicts: { type: 'array', items: {
          type: 'object', required: ['name','keep_verdict','surprise_per_effort','ceiling_or_rate','authored_seams','will_it_work','notes'],
          properties: {
            name: { type: 'string' },
            keep_verdict: { type: 'string', enum: ['core','strong','cheap-win','later','cut'] },
            surprise_per_effort: { type: 'number' },
            ceiling_or_rate: { type: 'string' },
            authored_seams: { type: 'string' },
            will_it_work: { type: 'string' },
            legibility: { type: 'string' },
            notes: { type: 'string' },
          } } } },
      } }
    ).then(c => {
      const by = {}
      ;(c && c.verdicts || []).forEach(x => { by[x.name] = x })
      return systems.map(s => ({ ...s, critique: by[s.name] || null }))
    })
)

const all = critiqued.filter(Boolean).flat()
log(`${all.length} systems proposed and critiqued`)

phase('Architect')
const design = await agent(
  `You are the lead designer. Below are ${all.length} proposed additions to Glyphworks, each with a critic's verdict. Assemble THE design — one coherent project the builder can actually start, aimed squarely at his goal: the highest sustained rate of genuinely unexpected events, with a real chance of rare big ones (his dream event: a building that can only be made from a material another building produces).

Produce:
- A NAME for the project. Not "Glyphworks" — something better, short, evocative, and about the substrate rather than the story.
- THE SPINE: the core loop in plain language, in the order it runs, so a programmer understands the whole machine in one read.
- WHAT MAKES IT DIFFERENT from the original Glyphworks, and why each change raises the ceiling.
- A BUILD ORDER in phases. For each phase: what gets built, what it unlocks, the first thing he will SEE, and roughly how long with an AI writing code. Phase one must produce a genuine surprise fast — the earlier the better.
- THE CUT LIST: what you deliberately left out and why, including good ideas that would sink it.
- THE HONEST FORECAST: expected rate of genuinely unexpected events at month 1, 3, 6, 12, and what he will actually be doing with his time in each period. Include what it looks like if the bet does NOT pay off.
- THE THREE NUMBERS that decide whether this is working, measurable early, so he can bail or double down on evidence rather than hope.
- THE DREAM EVENT: exactly what has to be true for second-order buildings to happen, an honest probability, and what raises it most.

${CONTEXT}

${AUDIENCE}

Write the whole thing so he can read it end to end and understand every sentence. This is the document he will build from.

PROPOSALS WITH CRITIQUES (JSON):\n${JSON.stringify(all, null, 1)}`,
  { label: 'architect', phase: 'Architect', effort: 'high', schema: {
    type: 'object',
    required: ['project_name','name_rationale','spine','what_changed','build_order','cut_list','forecast','three_numbers','dream_event'],
    properties: {
      project_name: { type: 'string' },
      name_rationale: { type: 'string' },
      spine: { type: 'string' },
      what_changed: { type: 'string' },
      build_order: { type: 'array', items: {
        type: 'object', required: ['phase','builds','unlocks','first_thing_you_see','duration'],
        properties: { phase: { type: 'string' }, builds: { type: 'string' }, unlocks: { type: 'string' },
          first_thing_you_see: { type: 'string' }, duration: { type: 'string' }, risk: { type: 'string' } } } },
      cut_list: { type: 'string' },
      forecast: { type: 'string' },
      three_numbers: { type: 'string' },
      dream_event: { type: 'string' },
      biggest_risk: { type: 'string' },
    } } }
)

return { all, design }