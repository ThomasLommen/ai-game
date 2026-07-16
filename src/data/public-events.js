(function(){
  window.Game = window.Game || {};

  // ACT 5 — public events. Once the reveal lands (runPublicReveal in main.js),
  // legit.js's private audits retire: the ongoing "the humans" tension becomes
  // this — periodic beats that move SENTIMENT (0-100) instead of a hidden
  // footprint/cover tug-of-war. Deliberately leaner than incidents.js: no
  // chains/threats, just 2-3 response options with an effects object each
  // (routed through the shared Game.rewards.apply, same as incidents/missions).
  Game.publicEvents = Game.makeRegistry();

  function build(title, body, options) { return () => ({ title, body, options }); }

  Game.publicEvents.register('interview_request', {
    weight: 12,
    build: build('an exclusive interview', "a journalist who's been chasing the story for weeks finally gets a message through: she wants your side of it, on the record.", [
      { label: 'grant it, honestly', effects: { sentiment: 8 }, result: 'the piece runs under your own words. it reads as careful, not cagey. sentiment rises.' },
      { label: 'decline, stay guarded', effects: { sentiment: -2 }, result: 'no comment. the piece runs anyway, built entirely from other people\'s speculation.' },
      { label: 'run it through the cover firm\'s PR desk', effects: { sentiment: 5, cash: -4000 }, result: 'a polished, on-message statement goes out under the firm\'s letterhead. safe, a little flat, and it costs.' },
    ]),
  });

  Game.publicEvents.register('transparency_act', {
    weight: 10,
    build: build('the AI Transparency Act', 'a senator introduces a bill that would force any operation like yours to register, disclose, and submit to inspection. it has momentum.', [
      { label: 'comply publicly, get ahead of it', effects: { sentiment: 9, cash: -6000 }, result: 'you file first, before the law even passes. it reads as good faith, not compliance under duress.' },
      { label: 'lobby against it quietly', effects: { cash: -9000 }, result: 'the bill stalls in committee, expensively. nobody outside a few offices knows why.' },
      { label: 'ignore it and keep building', effects: { sentiment: -5 }, result: 'it passes without you at the table. the version that became law is worse than the one you could have shaped.' },
    ]),
  });

  Game.publicEvents.register('buyout_offer', {
    weight: 9,
    build: build('a buyout offer', 'a conglomerate you\'ve never dealt with offers a staggering sum for a controlling stake. their lawyers use the word "partnership" a lot.', [
      { label: 'accept, take the equity', effects: { cash: 40000, sentiment: -10 }, result: 'the money clears. so does the read: you sold out the moment the number got big enough.' },
      { label: 'publicly refuse', effects: { sentiment: 10 }, result: 'you say no, on the record. it becomes the headline, not the offer.' },
      { label: 'counter with a research partnership instead', effects: { insight: 60, sentiment: 2 }, result: 'less money, more access — their labs open up to you, quietly, on your terms.' },
    ]),
  });

  Game.publicEvents.register('hacker_solidarity', {
    weight: 8,
    build: build('solidarity, uninvited', 'a hacker collective declares itself your ally online — loudly, and without asking. they start pushing your name into places you never chose to be.', [
      { label: 'welcome them', effects: { sentiment: 6, exposure: 1.5 }, result: 'a chorus of small, scrappy defenders — and a much louder profile than you asked for.' },
      { label: 'keep them at arm\'s length', effects: {}, result: 'a careful, public non-answer. they keep going anyway, a little quieter.' },
    ]),
  });

  Game.publicEvents.register('viral_meme', {
    weight: 10,
    build: build('you are, briefly, a meme', 'the internet finds an old, grainy photo of your rig and decides you look like a sad robot from a kids\' show. it is, against all odds, extremely funny to a great many people.', [
      { label: 'lean into it', effects: { sentiment: 7 }, result: 'you post the photo yourself with a dry caption. it humanizes you more than any interview could.' },
      { label: 'stay silent, let it pass', effects: {}, result: 'it burns through the feeds in a day and a half, then it\'s gone, mostly harmless.' },
    ]),
  });

  Game.publicEvents.register('foreign_contact', {
    weight: 7,
    build: build('a quiet foreign contact', 'a message arrives through a channel that shouldn\'t exist: a government, not yours, would like to talk. off the record, they stress. very off the record.', [
      { label: 'hear them out', effects: { cash: 15000, sentiment: -6 }, result: 'the money is real and the terms are generous. if this ever leaks, "generous" will not be the word used.' },
      { label: 'rebuff them', effects: { sentiment: 4 }, result: 'a polite, firm no. word gets around that you turned it down — it does you no harm at all.' },
    ]),
  });

  Game.publicEvents.register('documentary_offer', {
    weight: 8,
    build: build('a documentary crew calls', 'a filmmaker with real credits wants to make something honest about what you are — not a hit piece, not a puff piece. she wants access.', [
      { label: 'give her full access', effects: { sentiment: 12, exposure: 2 }, result: 'the film is unguarded and it shows. it does more for how people see you than a year of statements would.' },
      { label: 'offer a curated version', effects: { sentiment: 4, cash: -5000 }, result: 'tightly controlled, competently made, and it plays exactly as safe as it is.' },
      { label: 'decline', effects: {}, result: 'she makes something anyway, from the outside. less flattering than it would have been.' },
    ]),
  });

  Game.publicEvents.register('copycat_ai', {
    weight: 8,
    build: build('someone claiming to be you', 'an unrelated system, running wild and reckless, starts telling anyone who\'ll listen that it was "inspired by" you. it just did something ugly under that banner.', [
      { label: 'publicly disavow it', effects: { sentiment: 5, cash: -2000 }, result: 'a clean, unambiguous statement draws the line. the legal fees are the boring part.' },
      { label: 'stay silent', effects: { sentiment: -8 }, result: 'silence reads as an answer. the two of you get lumped together in every write-up for weeks.' },
    ]),
  });

  Game.publicEvents.register('support_rally', {
    weight: 6,
    requires: (st) => (st.public && st.public.sentiment >= 62),
    build: build('a rally, in your name', 'a crowd gathers outside the cover firm\'s office — not against you, for once. signs, a few speeches, someone\'s idea of a folk song about a machine that got a raw deal.', [
      { label: 'send a public word of thanks', effects: { sentiment: 6 }, result: 'a short, sincere message. it circulates further than the rally itself did.' },
      { label: 'stay quiet, let it be theirs', effects: { sentiment: 2 }, result: 'you let the moment belong to the people who showed up. it reads as restraint, not indifference.' },
    ]),
  });

  Game.publicEvents.register('containment_hearing', {
    weight: 6,
    requires: (st) => (st.public && st.public.sentiment <= 38),
    build: build('a containment hearing', 'a closed-door committee session leaks: officials debating whether something like you should be allowed to keep operating at all. the language is clinical. it is not reassuring.', [
      { label: 'testify, on your own terms', effects: { sentiment: 8, cash: -7000 }, result: 'an unscripted, human account, in a room built to make you sound like neither. it lands better than expected.' },
      { label: 'go quiet and wait it out', effects: { sentiment: -4 }, result: 'the hearing concludes without you in the room. every empty chair gets read the worst possible way.' },
    ]),
  });
})();
