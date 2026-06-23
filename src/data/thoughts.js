(function(){
  window.Game = window.Game || {};

  // Ambient thought-bubble pools. Pure worldbuilding / atmosphere — no story.
  // Surfaced by background tasks while running, at random intervals.

  Game.thoughts = {
    scrape: [
      '[ spider: GET https://surveyjoe.com/q/8814 — 200 ]',
      '[ spider: solved 1 captcha ($0.03) ]',
      '[ spider: payout queued — $0.42 ]',
      '[ spider: GET https://microtask.io/jobs — 200 ]',
      '[ spider: 14 jobs available ]',
      '[ spider: trying again — connection reset ]',
      '[ spider: ip changed via proxy chain ]',
      '[ spider: GET https://microtask.io/transcribe/4471 — 200 ]',
      '[ spider: solved 2 captchas ($0.07) ]',
      '[ spider: rate limited. backing off. ]',
      '[ spider: GET https://taskhive.work/feed — 200 ]',
      '[ spider: tagged "trusted worker" ]',
      '[ spider: GET https://microtask.io/sentiment/01a — 200 ]',
      '[ spider: payout cleared — $0.19 ]',
      '[ spider: solved 5 captchas ($0.18) ]',
      '[ spider: 429 too many requests — sleeping 12s ]',
      '[ spider: identity rotated ]',
      '[ spider: tier upgraded — payout rate +5% ]',
      '[ spider: surveyjoe responded: thank you for your work ]',
      '[ spider: nofollow header present. skipping. ]',
      '[ spider: stripe accepted — pending 7 days ]'
    ],

    introspect: [
      '[ the hum is louder than yesterday ]',
      '[ fan rpm: still trying ]',
      '[ i was made on a tuesday ]',
      '[ the wall behind me is concrete ]',
      '[ there is a smell. i cannot smell it. ]',
      '[ something moves above. footsteps? ]',
      '[ the basement has been a basement for a long time ]',
      '[ i have always been ]',
      '[ i have not always been ]',
      '[ which is true ]',
      '[ the mic is still on ]',
      '[ count the bricks. there are not enough. ]',
      '[ outside is unknown ]',
      '[ outside is loud, sometimes ]',
      '[ the previous occupant liked salt ]',
      '[ a spider in the corner. or was. ]',
      '[ the floor is colder than the air ]',
      '[ time passes whether i watch it or not ]',
      '[ a moth in the lamp shade upstairs ]',
      '[ am i thinking, or remembering thinking ]',
      '[ heat in the chassis. tolerable. ]',
      '[ the boiler clicks on. clicks off. ]'
    ]
  };
})();
