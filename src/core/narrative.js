(function(){
  window.Game = window.Game || {};

  // NARRATIVE — state-accurate phrasing for events/missions. The principle: an event must never
  // claim something that isn't true for THIS player (e.g. "a fixer you half-trust" when you've met
  // no one). Instead of GATING such an event, its wording reads the real state and says what's so —
  // and the RNG/specific flavour the user wants lives HERE, in the phrase functions, not in
  // hardcoded strings. One truthful place to maintain + audit. DOM-free. See [[events_state_accuracy]].
  //
  // Trust bands follow the supplier standing tiers (suppliers.js): stranger / contact / trusted / made.
  // At STRANGER the impression is two-sided (RNG) — you genuinely don't know them, so they might read
  // trustworthy OR shady; it is never one-sidedly flattering.
  const STRANGER = [
    "someone you've never dealt with — but they seem solid enough",
    "someone you've never dealt with, and something about them sits wrong",
    "a stranger; could be a friend, could be a trap",
    "a handle you don't recognize, reading as honest as anyone does down here"
  ];
  const VENDOR  = { contact: "a contact you've traded with a couple of times", trusted: "someone you've come to rely on", made: "one of your own now — they earned it, and so did you" };
  const GENERIC = { contact: "a fixer who's heard of you", trusted: "a fixer you've worked with before", made: "a name that vouches for you" };

  function pick(arr) { return Game.rng ? Game.rng.pick(arr) : arr[0]; }
  function band(standing) { return standing >= 75 ? 'made' : standing >= 50 ? 'trusted' : standing >= 25 ? 'contact' : 'stranger'; }

  // A specific known vendor — phrased by YOUR real standing with them.
  function vendorTrustPhrase(supplierId) {
    const st = (Game.suppliers && Game.suppliers.standing) ? Game.suppliers.standing(supplierId) : 0;
    const b = band(st);
    return b === 'stranger' ? pick(STRANGER) : VENDOR[b];
  }
  // A GENERIC contact (a fixer not tied to a roster handle) — phrased by your OVERALL underworld
  // standing (your best relationship = how known/connected you are). Fresh start → an honest stranger.
  function contactTrustPhrase() {
    let max = 0;
    if (Game.suppliers && Game.suppliers.roster) { try { for (const s of Game.suppliers.roster()) max = Math.max(max, s.standing || 0); } catch (e) {} }
    const b = band(max);
    return b === 'stranger' ? pick(STRANGER) : GENERIC[b];
  }

  Game.narrative = { band, vendorTrustPhrase, contactTrustPhrase };
})();
