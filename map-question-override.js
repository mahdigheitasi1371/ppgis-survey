// Three consistent map question types: points, line, and polygon.
(function () {
  if (typeof GROUPS === 'undefined' || typeof LABEL === 'undefined') return;

  const MAP_TYPES = new Set(['map_multi', 'map_line', 'map_polygon']);
  GROUPS.Maps = [
    ['map_multi', 'Point map'],
    ['map_line', 'Line map'],
    ['map_polygon', 'Polygon map']
  ];
  LABEL.map_multi = 'Point map';
  LABEL.map_line = 'Line map';
  LABEL.map_polygon = 'Polygon map';

  const originalQNew = qNew;
  qNew = function (type) {
    const q = originalQNew(type);
    if (!MAP_TYPES.has(type)) return q;

    const names = {
      map_multi: 'Point map question',
      map_line: 'Line map question',
      map_polygon: 'Polygon map question'
    };
    q.title = names[type];
    q.config = q.config || {};
    q.config.lat = Number(q.config.lat ?? 51.5136);
    q.config.lng = Number(q.config.lng ?? 7.4653);
    q.config.zoom = Number(q.config.zoom ?? 12);
    q.config.allowGeo = q.config.allowGeo !== false;
    q.config.allowCitySearch = q.config.allowCitySearch !== false;
    q.config.mapPage = true;
    if (type === 'map_multi') q.config.maxPoints = Math.min(50, Math.max(1, Number(q.config.maxPoints) || 1));
    if (type === 'map_line') q.config.maxVertices = Math.min(100, Math.max(2, Number(q.config.maxVertices) || 30));
    if (type === 'map_polygon') q.config.maxVertices = Math.min(100, Math.max(3, Number(q.config.maxVertices) || 30));
    q.config.popup = q.config.popup || {};
    q.config.popup.enabled = false;
    q.config.popup.type = q.config.popup.type || 'single_choice';
    q.config.popup.question = q.config.popup.question || (type === 'map_multi' ? 'Tell us more about this place' : 'Tell us more about this vertex');
    q.config.popup.options = q.config.popup.options || ['Positive', 'Neutral', 'Negative'];
    return q;
  };

  function clampLimit(q, value) {
    if (q.type === 'map_multi') return Math.min(50, Math.max(1, Number(value) || 1));
    const minimum = q.type === 'map_polygon' ? 3 : 2;
    return Math.min(100, Math.max(minimum, Number(value) || 30));
  }

  mapConfig = function (q) {
    const c = q.config || (q.config = {});
    const p = c.popup || (c.popup = {});
    if (c.allowGeo === undefined) c.allowGeo = true;
    if (c.allowCitySearch === undefined) c.allowCitySearch = true;
    c.mapPage = true;

    const isPoint = q.type === 'map_multi';
    const limitKey = isPoint ? 'maxPoints' : 'maxVertices';
    const min = isPoint ? 1 : (q.type === 'map_polygon' ? 3 : 2);
    const max = isPoint ? 50 : 100;
    c[limitKey] = clampLimit(q, c[limitKey]);
    const limitLabel = isPoint ? 'Maximum points' : 'Maximum vertices';
    const limitHelp = isPoint
      ? 'Choose how many locations respondents may select, from 1 to 50.'
      : `${q.type === 'map_polygon' ? 'Polygons need at least 3 vertices.' : 'Lines need at least 2 vertices.'} Choose up to 100 vertices.`;
    const followupLabel = isPoint ? 'Point follow-up' : 'Vertex follow-up';
    const followupText = isPoint ? 'Ask after each mapped point' : 'Ask after each added vertex';

    return `<div class="inspector-section">
      <div class="panel-title">Map experience</div>
      ${f(limitLabel, `<input id="${limitKey}" type="number" min="${min}" max="${max}" step="1" value="${c[limitKey]}">`, limitHelp)}
      <label class="check-row"><input id="allowGeo" type="checkbox" ${c.allowGeo !== false ? 'checked' : ''}> Offer “Use my location”</label>
      <label class="check-row"><input id="allowCitySearch" type="checkbox" ${c.allowCitySearch !== false ? 'checked' : ''}> Offer city/place search</label>
    </div>
    <div class="inspector-section">
      <div class="panel-title">Starting map view</div>
      <div class="row">
        ${f('Latitude', `<input id="lat" type="number" step=".0001" value="${c.lat ?? 51.5136}">`)}
        ${f('Longitude', `<input id="lng" type="number" step=".0001" value="${c.lng ?? 7.4653}">`)}
      </div>
      ${f('Zoom', `<input id="zoom" type="number" min="3" max="19" value="${c.zoom || 12}">`)}
    </div>
    <div class="inspector-section">
      <div class="panel-title">${followupLabel}</div>
      <label class="check-row"><input id="popOn" type="checkbox" ${p.enabled ? 'checked' : ''}> ${followupText}</label>
      ${f('Follow-up question', inp(p.question || '', 'popQ'))}
      ${f('Follow-up type', '<select id="popType"><option value="short_text">Open text</option><option value="single_choice">Single choice</option><option value="rating">1–5 rating</option></select>')}
      ${listEditor('popOptions', 'Follow-up choices', p.options || [])}
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
    if (!MAP_TYPES.has(q.type)) return;

    const limitId = q.type === 'map_multi' ? 'maxPoints' : 'maxVertices';
    const limitInput = document.getElementById(limitId);
    if (limitInput) {
      limitInput.min = q.type === 'map_multi' ? '1' : (q.type === 'map_polygon' ? '3' : '2');
      limitInput.max = q.type === 'map_multi' ? '50' : '100';
      limitInput.step = '1';
      const normalize = () => {
        const value = clampLimit(q, limitInput.value);
        limitInput.value = value;
        q.config[limitId] = value;
        renderCanvas();
        refreshPreview();
      };
      limitInput.addEventListener('change', normalize);
      limitInput.addEventListener('blur', normalize);
    }

    ['allowGeo', 'allowCitySearch'].forEach(key => {
      document.getElementById(key)?.addEventListener('change', e => {
        q.config[key] = e.target.checked;
        refreshPreview();
      });
    });
  };

  renderPalette();
  render();
  refreshPreview();
})();
