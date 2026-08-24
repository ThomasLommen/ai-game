export const meta = {
  name: 'self-evolving-ideas',
  description: 'Fan out 6 idea generators on self-evolving projects, then judge/rank',
  phases: [
    { title: 'Generate', detail: 'six lenses on systems that grow themselves' },
    { title: 'Judge', detail: 'rank against the builder profile' },
  ],
}

const PROFILE = `
BUILDER PROFILE (tailor every idea to this person):
- Solo hobby builder who loves the full arc: brainstorm -> build -> debug -> create from scratch.
- Stack & taste: vanilla JS + HTML/CSS, no frameworks, PWAs that run on mobile, CRT/terminal aesthetics, node --test for tests, deploys to GitHub Pages, simple python dev server. Comfortable with Claude Code / AI agents as collaborators.
- Track record: built a substantial AI/hacking incremental sim game (systems: subroutines, darknet market, research trees, agents, network map, city economy, Reigns-style card deck). Side prototypes: tower defense, city sim, card game, network/country sim.
- Already runs overnight bot playtests: scripts play 14+ games x 150 turns while they sleep, write a "census" report they read in the morning. They LOVE this rhythm.
- CORE DESIRE: build something they can WATCH slowly grow or evolve itself over time, with few inputs from time to time, or none at all. The joy is checking in on it and seeing it changed itself.

WHAT MAKES AN IDEA GOOD HERE:
- Genuine emergence/evolution, not a scripted animation of growth. Surprise on check-in is the product.
- Watchable: there is a view (a canvas, a feed, a map, a time-lapse, a daily digest) that makes the change visible and delightful.
- Low ongoing input: it runs itself (browser tab, GitHub Actions cron, or a tiny VPS). Occasional nudges allowed, mandatory daily chores not.
- Buildable solo in vanilla JS or with at most one small new ingredient (a cron, a $5 VPS, an LLM API key). First cool moment within 1-2 weekends.
- Long horizon: still interesting after 6 months of running; accretes history worth scrolling back through.
- Debuggable and tinkerable: they enjoy opening the hood.

Return 5-6 ideas through the structured output tool. Be concrete and specific, not generic ("an evolving ecosystem" is worthless; "creatures are 32-byte genomes decoded into sensor->neuron->muscle graphs, food falls where Perlin noise peaks, speciation measured by genome Hamming distance, tab runs at 60fps and persists to IndexedDB" is the level wanted). Name real mechanisms, real data structures, real cadences. Avoid ideas that secretly require constant babysitting or huge content authoring.`

const IDEA_SCHEMA = {
  type: 'object', required: ['ideas'],
  properties: { ideas: { type: 'array', minItems: 5, maxItems: 6, items: {
    type: 'object',
    required: ['name','pitch','evolution_mechanism','what_you_watch','input_cadence','tech','first_weekend','six_months_later','why_this_user'],
    properties: {
      name: { type: 'string' },
      pitch: { type: 'string', description: 'two sentences max' },
      evolution_mechanism: { type: 'string', description: 'the actual engine of change: what state mutates, what selects, why it does not plateau' },
      what_you_watch: { type: 'string', description: 'the concrete view: what the screen/feed shows on a check-in' },
      input_cadence: { type: 'string', description: 'honest estimate: what the human must do and how often' },
      tech: { type: 'string', description: 'stack + where it runs 24/7 (browser tab? GitHub Actions cron? VPS?)' },
      first_weekend: { type: 'string', description: 'the smallest version that already gives the watching-it-grow feeling' },
      six_months_later: { type: 'string', description: 'what it has become; why it is still surprising' },
      why_this_user: { type: 'string' },
    },
  } } },
}

const LENSES = [
  { key: 'alife', prompt: `You are an artificial-life and evolutionary-simulation specialist. Generate project ideas ONLY from this lens: digital ecosystems, neuroevolution, genomes and mutation, predator/prey dynamics, speciation, open-ended evolution (Tierra, Avida, Lenia, boids+selection, gene regulatory networks). Prioritize open-endedness: what keeps evolution from converging and getting boring? ${PROFILE}` },
  { key: 'llm-world', prompt: `You are a specialist in LLM-agent-driven living worlds. Generate project ideas ONLY from this lens: small societies of LLM agents with persistent memory that live in a simulated place, self-writing lore/newspapers/histories, emergent culture, agents that form relationships, economies, religions; generative-agents-style architectures (memory stream, reflection, planning) scaled DOWN to hobby budget. Be honest about token cost per day and design cadences (e.g. one "day tick" per real day) that keep it under ~$1/day or free-tier. ${PROFILE}` },
  { key: 'generative-growth', prompt: `You are a specialist in generative systems that accrete: procedural growth, L-systems, cellular automata, reaction-diffusion, erosion/deposition sims, growing cities/coral/languages/typefaces/music, time-as-material art. Generate project ideas ONLY from this lens: the artifact gets richer purely by running, and its whole history is legible in the artifact itself (rings in the tree trunk). ${PROFILE}` },
  { key: 'self-modifying', prompt: `You are a specialist in self-improving software. Generate project ideas ONLY from this lens: programs that rewrite or retune themselves — genetic programming, strategies/bots that evolve by tournament, a nightly GitHub Action where a coding agent mutates the codebase and keeps what passes the fitness gate, self-balancing game economies, prompt/agent evolution, code that grows features from its own TODO list. Include at least one idea that leverages the person's existing overnight-bot-playtest habit on their own game. Safety/simplicity: fitness gates and sandboxes, not sci-fi. ${PROFILE}` },
  { key: 'data-organism', prompt: `You are a specialist in data-fed organisms: systems that grow by digesting real-world signals. Generate project ideas ONLY from this lens: a creature/garden/city/map that feeds on real data streams (their GitHub commits, weather, tides, news headlines, website logs, phone steps, home network traffic) and metabolizes them into growth, so real life leaves fossils in the artifact. The mapping must be mechanical and honest, not arbitrary skinning. ${PROFILE}` },
  { key: 'spectator-world', prompt: `You are a specialist in persistent 24/7 worlds and spectator systems: worlds that run continuously on a tiny server or cron while nobody plays — robot economies, wars between procedural factions, an idle civilization writing its own chronicle, Twitch-plays-itself, daily time-lapse digests, a map that visibly ages. Generate project ideas ONLY from this lens. The human is an observer/god who occasionally intervenes, never an operator. ${PROFILE}` },
]

phase('Generate')
const results = await parallel(LENSES.map(l => () =>
  agent(l.prompt, { label: `ideas:${l.key}`, phase: 'Generate', schema: IDEA_SCHEMA })
    .then(r => r && r.ideas.map(i => ({ ...i, lens: l.key })))
))
const all = results.filter(Boolean).flat()
log(`${all.length} ideas generated across ${results.filter(Boolean).length} lenses`)

phase('Judge')
const JUDGE_SCHEMA = {
  type: 'object', required: ['ranked', 'missing_angles'],
  properties: {
    ranked: { type: 'array', minItems: 6, maxItems: 8, items: {
      type: 'object', required: ['name','lens','score','why','risk'],
      properties: {
        name: { type: 'string' }, lens: { type: 'string' },
        score: { type: 'number', description: '0-100 fit for this builder' },
        why: { type: 'string' }, risk: { type: 'string', description: 'the most likely way this one disappoints' },
        combo_with: { type: 'string', description: 'optional: another idea from the pool it merges well with' },
      },
    } },
    missing_angles: { type: 'array', items: { type: 'string' }, description: 'angles the whole pool missed' },
  },
}
const verdict = await agent(
  `You are a sharp product-taste judge. Below is a pool of project ideas for a specific builder, plus their profile. Rank the BEST 6-8 ideas for THIS person (not in general). Judge hard on: genuine emergence (would a check-in actually surprise?), watchability, honest low input, solo-buildable fast, still alive at 6 months. Penalize: disguised chore machines, scripted growth, token-cost bombs, huge content authoring. Note real risks. Also list angles the whole pool missed.\n\n${PROFILE}\n\nIDEA POOL (JSON):\n${JSON.stringify(all, null, 1)}`,
  { label: 'judge', phase: 'Judge', schema: JUDGE_SCHEMA, effort: 'high' }
)
return { all, verdict }