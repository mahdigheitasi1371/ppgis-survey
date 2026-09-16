// Three consistent map question types: points, multiple lines, and multiple polygons.
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
    if (type === 'map_multi') {
      q.config.maxPoints = Math.min(50, Math.max(1, Number(q.config.maxPoints) || 1));
    } else {
      q.config.maxFeatures = Math.min(50, Math.max(1, Number(q.config.maxFeatures) || 10));
      q.config.maxVertices = type === 'map_polygon'
        ? Math.min(100, Math.max(3, Number(q.config.maxVertices) || 30))
        : Math.min(100, Math.max(2, Number(q.config.maxVertices) || 30));
    }
    q.config.popup = q.config.popup || {};
    q.config.popup.enabled = false;
    q.config.popup.type = q.config.popup.type || 'single_choice';
    q.config.popup.question = q.config.popup.question || (type === 'map_multi' ? 'Tell us more about this place' : 'Tell us more about this vertex');
    q.config.popup.options = q.config.popup.options || ['Positive', 'Neutral', 'Negative'];
    return q;
  };

  function clampPointLimit(value) {
    return Math.min(50, Math.max(1, Number(value) || 1));
  }

  function clampFeatureLimit(value) {
    return Math.min(50, Math.max(1, Number(value) || 10));
  }

  function clampVertexLimit(q, value) {
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
    if (isPoint) c.maxPoints = clampPointLimit(c.maxPoints);
    else {
      c.maxFeatures = clampFeatureLimit(c.maxFeatures);
      c.maxVertices = clampVertexLimit(q, c.maxVertices);
    }

    const geometryName = q.type === 'map_polygon' ? 'polygons' : 'lines';
    const minimumVertices = q.type === 'map_polygon' ? 3 : 2;
    const followupLabel = isPoint ? 'Point follow-up' : 'Vertex follow-up';
    const followupText = isPoint ? 'Ask after each mapped point' : 'Ask after each added vertex';

    return `<div class="inspector-section">
      <div class="panel-title">Map experience</div>
      ${isPoint
        ? f('Maximum points', `<input id="maxPoints" type="number" min="1" max="50" step="1" value="${c.maxPoints}">`, 'Choose how many locations respondents may select, from 1 to 50.')
        : `${f(`Maximum ${geometryName}`, `<input id="maxFeatures" type="number" min="1" max="50" step="1" value="${c.maxFeatures}">`, `Respondents can save one ${geometryName.slice(0,-1)} and then draw another, up to 50 separate ${geometryName}.`)}${f('Maximum vertices per feature', `<input id="maxVertices" type="number" min="${minimumVertices}" max="100" step="1" value="${c.maxVertices}">`, `${q.type === 'map_polygon' ? 'A polygon needs at least 3 vertices.' : 'A line needs at least 2 vertices.'} Choose up to 100 vertices per saved feature.`)}`}
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

    const numericInputs = [];
    if (q.type === 'map_multi') {
      numericInputs.push(['maxPoints', clampPointLimit]);
    } else {
      numericInputs.push(['maxFeatures', clampFeatureLimit]);
      numericInputs.push(['maxVertices', value => clampVertexLimit(q, value)]);
    }

    numericInputs.forEach(([id, clamp]) => {
      const input = document.getElementById(id);
      if (!input) return;
      const normalize = () => {
        const value = clamp(input.value);
        input.value = value;
        q.config[id] = value;
        renderCanvas();
        refreshPreview();
      };
      input.addEventListener('change', normalize);
      input.addEventListener('blur', normalize);
    });

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
