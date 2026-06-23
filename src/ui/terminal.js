(function(){
  window.Game = window.Game || {};

  const out = () => document.getElementById('terminal-output');
  const prompt = () => document.getElementById('terminal-prompt');
  const pane = () => document.getElementById('terminal-pane');

  function appendLine(text, cls) {
    const span = document.createElement('span');
    span.className = 'line' + (cls ? ' ' + cls : '');
    span.textContent = text || '';
    out().appendChild(span);
    pane().scrollTop = pane().scrollHeight;
    return span;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  async function typeInto(span, text, delayRange) {
    for (let i = 0; i < text.length; i++) {
      span.textContent += text[i];
      pane().scrollTop = pane().scrollHeight;
      await sleep(rand(delayRange[0], delayRange[1]));
    }
  }

  async function playBootSequence(seq) {
    for (const step of seq.steps) {
      if (step.kind === 'pause') {
        await sleep(step.ms);
      } else if (step.kind === 'line') {
        appendLine(step.text, step.cls);
      } else if (step.kind === 'typed') {
        const span = appendLine('', step.cls);
        await typeInto(span, step.text, seq.charDelayMs);
      }
    }
  }

  function showResumeBanner() {
    appendLine('[ session resumed ]', 'faint');
    appendLine('awaiting input.', '');
  }

  function showPrompt() { prompt().hidden = false; }

  Game.terminal = {
    appendLine,
    playBootSequence,
    showResumeBanner,
    showPrompt
  };
})();
