// Dashboard: find a response by its participation code (to answer data requests) and,
// at the anonymisation step, remove all participation codes of a survey.
(function () {
  'use strict';
  function panel() {
    const metrics = document.getElementById('metrics');
    if (!metrics || document.getElementById('codePanel') || typeof selected === 'undefined' || !selected || typeof responses === 'undefined') return;
    const withCodes = responses.filter(r => r.participation_code).length;
    const box = document.createElement('div');
    box.id = 'codePanel';
    box.className = 'card code-panel';
    box.innerHTML = `<div class="code-panel-head"><strong>Participation codes</strong><span class="muted small">${withCodes} response${withCodes === 1 ? '' : 's'} with a code</span></div>
      <form class="code-find"><input id="codeInput" placeholder="e.g. K7M4-Q2XP" autocomplete="off" aria-label="Participation code"><button class="btn" type="submit">Find</button></form>
      <div id="codeResult" class="small"></div>
      <div class="code-panel-foot"><button class="btn btn-danger" id="clearCodes" type="button" ${withCodes ? '' : 'disabled'}>Remove all codes (anonymise)</button>
      <span class="muted small">Do this when data collection ends. Afterwards, responses can no longer be linked to a participant.</span></div>`;
    metrics.after(box);
    box.querySelector('.code-find').addEventListener('submit', e => {
      e.preventDefault();
      const code = box.querySelector('#codeInput').value.trim().toUpperCase().replace(/\s+/g, '');
      const out = box.querySelector('#codeResult');
      const hit = (responses || []).find(r => (r.participation_code || '') === code);
      if (!code) { out.textContent = ''; return; }
      if (!hit) { out.innerHTML = '<span class="error-text">No response with this code.</span>'; return; }
      out.innerHTML = `Found: response from ${new Date(hit.submitted_at).toLocaleString()} <button class="btn btn-danger btn-sm" type="button" id="codeDelete">Delete this response</button>`;
      out.querySelector('#codeDelete').addEventListener('click', async () => { await deleteResponse(hit.id); box.remove(); panel(); });
    });
    box.querySelector('#clearCodes').addEventListener('click', async () => {
      if (!confirm(`Remove the participation codes of all ${withCodes} responses?\n\nAfter this, participants can no longer ask for their data, because responses can no longer be linked to them. This cannot be undone.`)) return;
      try {
        const r = await api(`/api/builder/surveys/${encodeURIComponent(selected.id)}/clear-codes`, {method: 'POST'});
        const data = await r.json();
        (responses || []).forEach(x => { x.participation_code = null; });
        alert(`${data.cleared} code(s) removed.`);
        box.remove(); panel();
      } catch (err) { alert('Could not remove the codes: ' + (err.message || err)); }
    });
  }
  new MutationObserver(() => panel()).observe(document.documentElement, {childList: true, subtree: true});
})();
