// ── Settings panel: save transfer (export/import) + wipe ────────────────────
// localStorage is per-origin/device, so a save can't follow you to another phone
// or browser on its own. EXPORT hands you a code; IMPORT on the other device loads
// it. WIPE starts fresh. Wired once on load; the panel DOM lives in index.html and
// is re-homed into the MORE tab by the mobile shell (IDs preserved).
(function () {
  if (typeof window === 'undefined') return;
  function msg(text, ok) {
    const m = document.getElementById('set-msg'); if (!m) return;
    m.textContent = text || '';
    m.className = 'set-msg' + (text ? (ok ? ' good' : ' bad') : '');
  }

  function copy(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text); } catch (e) {}
    return Promise.reject();
  }

  function wire() {
    const exp = document.getElementById('set-export');
    const imp = document.getElementById('set-import');
    const wipe = document.getElementById('set-wipe');
    const ta = document.getElementById('set-code');
    if (!exp || exp._wired) return;
    exp._wired = true;

    exp.onclick = () => {
      const code = Game.save.export();
      if (ta) { ta.value = code; ta.focus(); ta.select(); }
      copy(code).then(
        () => msg('Save code copied to clipboard — paste it on your other device.', true),
        () => msg('Code is in the box above — select all + copy it.', true)
      );
    };

    imp.onclick = () => {
      const code = ta ? ta.value : '';
      if (!code.trim()) return msg('Paste a save code into the box first.', false);
      if (!confirm('Importing replaces this device\'s current save. Continue?')) return;
      const r = Game.save.import(code);
      if (r.ok) { msg('Save loaded — reloading…', true); setTimeout(() => location.reload(), 600); }
      else msg('Import failed: ' + r.error, false);
    };

    wipe.onclick = () => {
      if (!confirm('Wipe this device\'s save and start over? This cannot be undone.')) return;
      Game.save.wipe();
      try { Game.save.persist(); } catch (e) {}
      location.reload();
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
