// Simplify spatial questions to one configurable point-map question.
// Existing saved legacy map types remain readable, but new surveys only expose
// the unified Map question with a 1–50 point limit.
(function () {
  if (typeof GROUPS === 'undefined' || typeof LABEL === 'undefined') return;

  GROUPS.Maps = [['map_multi', 'Map question']];
  LABEL.map_multi = 'Map question';

  const originalQNew = qNew;
  qNew = function (type) {
    const q = originalQNew(type);
    if (type === 'map_multi') {
      q.title = 'Map question';
      q.config.maxPoints = 1;
      q.config.popup = q.config.popup || {};
      q.config.popup.enabled = false;
      q.config.popup.type = q.config.popup.type || 'single_choice';
      q.config.popup.question = q.config.popup.question || 'Tell us more about this place';
      q.config.popup.options = q.config.popup.options || ['Positive', 'Neutral', 'Negative'];
    }
    return q;
  };

  function clampPointLimit(value) {
    return Math.min(50, Math.max(1, Number(value) || 1));
  }

  mapConfig = function (q) {
    const c = q.config || (q.config = {});
    const p = c.popup || (c.popup = {});
    c.maxPoints = clampPointLimit(c.maxPoints);
    return `<div class="inspector-section">
      <div class="panel-title">Map configuration</div>
      <div class="row">
        ${f('Latitude', `<input id="lat" type="number" step=".0001" value="${c.lat ?? 51.5136}">`)}
        ${f('Longitude', `<input id="lng" type="number" step=".0001" value="${c.lng ?? 7.4653}">`)}
      </div>
      ${f('Zoom', `<input id="zoom" type="number" min="3" max="19" value="${c.zoom || 12}">`)}
      ${f('Maximum points', `<input id="maxPoints" type="number" min="1" max="50" step="1" value="${c.maxPoints}">`, 'Choose how many locations respondents may add, from 1 to 50.')}
    </div>
    <div class="inspector-section">
      <div class="panel-title">Popup follow-up</div>
      <label class="check-row"><input id="popOn" type="checkbox" ${p.enabled ? 'checked' : ''}> Ask a follow-up after each mapped point</label>
      ${f('Popup question', inp(p.question || '', 'popQ'))}
      ${f('Popup type', '<select id="popType"><option value="short_text">Open text</option><option value="single_choice">Single choice</option><option value="rating">1–5 rating</option></select>')}
      ${listEditor('popOptions', 'Popup choices', p.options || [])}
    </div>`;
  };

  function refreshPreview() {
    try {
      localStorage.setItem('survey-builder-preview', JSON.stringify(state));
      const frame = document.getElementById('livePreviewFrame');
      if (frame) frame.src = `survey.html?preview=local&embed=1&t=${Date.now()}`;
    } catch (_) {}
  }

  const originalWireQ = wireQ;
  wireQ = function (q) {
    originalWireQ(q);
    if (q.type !== 'map_multi') return;
    const input = document.getElementById('maxPoints');
    if (!input) return;
    input.min = '1';
    input.max = '50';
    input.step = '1';
    const normalize = () => {
      const value = clampPointLimit(input.value);
      input.value = value;
      q.config.maxPoints = value;
      renderCanvas();
      refreshPreview();
    };
    input.addEventListener('change', normalize);
    input.addEventListener('blur', normalize);
  };

  // Rebuild the palette immediately so only the unified map question is shown.
  renderPalette();
  render();
  refreshPreview();
})();
