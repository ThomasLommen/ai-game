export const meta = {
  name: 'four-picks-plain',
  description: 'Plain-language month-6 reality check on the four shortlisted civ designs',
  phases: [
    { title: 'Project forward', detail: 'what month 6 actually looks like, per idea' },
    { title: 'Diagnose the picks', detail: 'what the four choices reveal' },
  ],
}

const DATA = '/tmp/claude-0/-home-user-ai-game/01c0b2f8-b1f9-50ef-8584-3f694aac66d0/tasks/ideas3_full.json'

const AUDIENCE = `
WHO YOU ARE WRITING FOR — THIS IS THE MOST IMPORTANT INSTRUCTION:
A talented self-taught hobby game developer. He builds browser games in plain JavaScript, ships them, debugs them, loves the craft. He is smart and will happily learn anything.
He does NOT have an ML/CS-research vocabulary. He has just told us, in his own words, that he could not understand most of these design documents and that the words got in the way of judging the ideas.

THEREFORE:
- Write like you are explaining an exciting project to a friend at a pub, not like a paper.
- BANNED unless you define it in the same sentence in plain words: MDL, DSL, lambda abstraction, enumerative search, observational equivalence, autotelic, quality-diversity, MAP-Elites, PPO, wake-sleep, niche construction, stationarity, s-expression, IR, corpus, prior, ISA, opcode (define it), bytecode (define it), raster (say "grid of pixels"), genome (fine, but say what it means here), UED, credit assignment, sparse reward, CFL, non-stationarity.
- Prefer concrete images to abstractions. "A compressor notices the tribe keeps doing the same five steps in a row and gives that five-step sequence a name" beats "MDL abstraction over the corpus".
- Never use a metaphor as if it were a mechanism. If something is literally just a number going up, say so.
- Short sentences. No bullet-point soup. No hype.

BE BRUTALLY HONEST. He is trying not to fall in love with a project for the wrong reason. Your job is to make month 6 vivid and TRUE, including the boring and disappointing parts. If the honest answer is "by month 6 you are mostly tuning parameters and the new things it invents are combinations of old things wearing new names", say exactly that.`

const SCHEMA = {
  type: 'object',
  required: ['plain_pitch','how_it_invents_plain','month6_screen','month6_invented_examples','reaches_technology','honest_month6_feeling','best_moment','worst_moment','who_should_pick_it','jargon_decoder'],
  properties: {
    plain_pitch: { type: 'string', description: '3-4 sentences. Zero jargon. What this thing IS.' },
    how_it_invents_plain: { type: 'string', description: 'The invention mechanism explained so a JS game dev gets it, in plain words, concretely. Use a worked example of one invention happening.' },
    month6_screen: { type: 'string', description: 'Literally describe what is on his phone screen on a random morning in month 6. Be concrete and specific.' },
    month6_invented_examples: { type: 'string', description: '5-8 realistic examples of things it will actually have invented by month 6, with honest names. Not the best case — the realistic case.' },
    reaches_technology: { type: 'string', description: 'Does it get anywhere near "cavemen -> fire -> houses -> tools -> technology"? Answer honestly and say what the real endpoint is. If the civilization framing is a costume over something else, say so bluntly.' },
    honest_month6_feeling: { type: 'string', description: 'What does checking it FEEL like at month 6 versus week 2? Is it still exciting? What is he doing with his time by then?' },
    best_moment: { type: 'string', description: 'The single best moment this project will give him, and roughly when it lands.' },
    worst_moment: { type: 'string', description: 'The most likely moment he loses interest or gets stuck, and when.' },
    who_should_pick_it: { type: 'string', description: 'One sentence: the kind of person this is the right project for.' },
    jargon_decoder: { type: 'string', description: 'The 4-6 pieces of jargon from the original design doc, each with a one-line plain-English translation. Format as "TERM — plain meaning" lines.' },
  },
}

const PICKS = [
  { key: 'Ashcairn', note: 'Note: this one and Glyphworks are closely related — be clear about what Ashcairn is on its own, without buildings.' },
  { key: 'Glyphworks', note: 'Note: this is built on top of an Ashcairn/Emberlisp-style substrate. Be explicit that picking it means building that first, and say how much extra work the buildings layer is.' },
  { key: 'LOAM', note: 'Note: the audit says the farming/domestication half will work but the landscape-engineering half (irrigation channels, terraces) may never arrive. Give both a realistic month 6 WITH and WITHOUT that half landing.' },
  { key: 'Cinderloom', note: 'Note: the audit says its "civilization" framing may be a costume over an evolving-code experiment, and that its inventions are things like memcpy loops, not houses. Be very direct about whether a person who wants CAVEMEN would be disappointed.' },
]

phase('Project forward')
const results = await parallel(PICKS.map(p => () =>
  agent(`Read the JSON file at ${DATA} (use Bash: python3 -c to load it, or jq). It contains a list under key "all" of 42 project ideas, each with an "audit" object attached. Find the idea whose "name" field starts with "${p.key}". Read ALL of its fields and its full audit carefully.

Then write a plain-language reality check on it for the person described below. ${p.note}

Ground everything in the design's actual mechanism and in what the audit says its real ceiling is. Where the design's own pitch and the audit disagree, believe the audit and say so plainly.

${AUDIENCE}`,
    { label: `plain:${p.key}`, phase: 'Project forward', schema: SCHEMA, effort: 'high' })
    .then(r => r ? { ...r, name: p.key } : null)
))

const projections = results.filter(Boolean)
log(`${projections.length}/4 projections done`)

phase('Diagnose the picks')
const diag = await agent(
  `Read the JSON at ${DATA} (key "all" = 42 ideas, each with an "audit"). A hobby game developer read all 42 designs, said he could not understand most of the vocabulary, and picked exactly these four as the ones he understood somewhat AND found interesting:

  Ashcairn, Cinderloom, Glyphworks, LOAM

He then answered three questions:
- Asked which morning check-in he actually wants, he chose: "A map becoming a city — a valley map, last night a kiln appeared where there wasn't one, the tribe built it themselves, and the settlement is visibly clustering around it. Tap-and-hold to scrub 6 months of history." (This is Glyphworks' check-in.)
- Asked whether it matters if the sim never reaches real "technology", he said he is NOT SURE YET and wants month 6 explained first.
- Asked about stack appetite, he said: "as it won't be me doing the coding but you I'm up for anything." (An AI agent will do the implementation; he directs, watches, and debugs alongside.)

Your job — be a sharp, honest analyst:
1. What do these four picks have in common? Read the actual pitches of all 42 and work out what distinguishes the four he chose from the 38 he didn't. Be specific and evidence-based, not flattering.
2. Which of the four is he most likely to have picked for a WRONG reason — i.e. the pitch's language promises something the mechanism does not deliver — and what exactly is the mismatch?
3. Are any two of the four actually the same project, or one a superset of another? Check this carefully against the designs.
4. Given his stated check-in preference and that an AI will write the code, what does that change about which is the right pick? Note specifically: "an AI writes the code" removes learning-curve objections but does NOT remove debugging burden, tuning burden, or the risk of a project whose hard part is systems engineering rather than design.
5. Name the ONE thing he should decide before anything else, and lay out the actual fork in the road.

${AUDIENCE}`,
  { label: 'diagnose', phase: 'Diagnose the picks', effort: 'high', schema: {
    type: 'object',
    required: ['common_thread','wrong_reason_pick','overlaps','ai_writes_code_implications','the_one_decision'],
    properties: {
      common_thread: { type: 'string' },
      wrong_reason_pick: { type: 'string' },
      overlaps: { type: 'string' },
      ai_writes_code_implications: { type: 'string' },
      the_one_decision: { type: 'string', description: 'The single fork in the road, laid out concretely with what each branch gets him.' },
      what_he_actually_wants: { type: 'string', description: 'Your best read on the underlying desire, stated in one short paragraph.' },
    } } }
)

return { projections, diag }