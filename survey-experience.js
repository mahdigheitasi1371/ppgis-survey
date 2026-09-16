// Respondent experience enhancements: survey backgrounds and a full-screen map workflow.
(function () {
  if (typeof question === 'undefined' || typeof render === 'undefined') return;

  const baseQuestion = question;
  const baseMapInit = mapInit;
  const baseRender = render;

  function applySurveyTheme() {
    if (!def) return;
    const s = def.settings || {};
    document.body.classList.add('survey-modern');
    const bg = s.backgroundColor || '#f3efe7';
    document.body.style.backgroundColor = bg;
    if (s.backgroundImage) {
      const alpha = Math.min(0.7, Math.max(0, Number(s.backgroundOverlay ?? 0.22)));
      document.body.style.backgroundImage = `linear-gradient(rgba(255,255,255,${alpha}),rgba(255,255,255,${alpha})),url("${String(s.backgroundImage).replace(/"/g, '%22')}")`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
    } else {
      document.body.style.backgroundImage = 'linear-gradient(145deg, rgba(255,255,255,.18), rgba(255,255,255,.55))';
    }

    const head = document.querySelector('.survey-head');
    if (head && !head.querySelector('.survey-kicker')) {
      const kicker = document.createElement('div');
      kicker.className = 'survey-kicker';
      kicker.textContent = 'Your response';
      head.prepend(kicker);
    }
    document.querySelectorAll('.survey-question').forEach((card, index) => {
      card.dataset.step = String(index + 1).padStart(2, '0');
    });
    const submit = document.getElementById('submit');
    if (submit && !preview) submit.textContent = 'Submit response →';
  }

  question = function (q) {
    const element = baseQuestion(q);
    if (q.type !== 'map_multi') return element;

    const slot = element.querySelector('.answer-slot');
    const c = q.config || {};
    const max = Math.min(50, Math.max(1, Number(c.maxPoints) || 1));
    const locationButton = c.allowGeo !== false
      ? '<button class="btn" type="button" data-use-location>◎ Use my location</button>'
      : '';
    const citySearch = c.allowCitySearch !== false
      ? `<div class="map-search-tools">
          <input type="search" data-city-input placeholder="Enter a city or place name" aria-label="City or place name">
          <button class="btn" type="button" data-city-search>Find city</button>
          ${locationButton}
        </div>
        <div class="map-city-results" data-city-results></div>`
      : `<div class="row-wrap">${locationButton}</div>`;
    const fullScreenButton = c.fullScreenMap !== false
      ? '<button class="btn map-open-full" type="button" data-open-full>⛶ Open full-screen map</button><button class="btn map-close-full" type="button" data-close-full>← Back to survey</button>'
      : '';

    slot.innerHTML = `<div class="map-experience">
      <div class="map-intro">
        <div><strong>Select locations on the map</strong><div class="small muted">You can add up to ${max} ${max === 1 ? 'point' : 'points'}.</div></div>
        <span class="map-location-status" data-location-status>${c.allowCitySearch !== false || c.allowGeo !== false ? 'Search for a city, use your location, or navigate the map.' : 'Navigate the map and tap to select your response.'}</span>
      </div>
      ${citySearch}
      <div class="map-stage" data-map-stage>
        <div class="map-stage-toolbar">
          ${fullScreenButton}
          <button class="btn" type="button" data-undo>Undo</button>
          <button class="btn" type="button" data-clear>Clear</button>
          <span data-count>Click the map to add a response.</span>
        </div>
        <div class="map-box" id="map_${q.id}"></div>
      </div>
      <div class="small muted">Map data © OpenStreetMap contributors. ${c.allowCitySearch !== false ? 'Place search powered by Photon.' : ''}</div>
    </div>`;
    return element;
  };

  mapInit = function (q) {
    if (q.type !== 'map_multi') return baseMapInit(q);
    if (maps.has(q.id) || !$(`#map_${q.id}`)) return;

    const c = q.config || {};
    const max = Math.min(50, Math.max(1, Number(c.maxPoints) || 1));
    const mapElement = document.getElementById(`map_${q.id}`);
    const card = document.querySelector(`[data-qid="${q.id}"]`);
    const stage = card?.querySelector('[data-map-stage]');
    const status = card?.querySelector('[data-location-status]');
    const results = card?.querySelector('[data-city-results]');
    const cityInput = card?.querySelector('[data-city-input]');

    const m = L.map(mapElement, { zoomControl: true }).setView(
      [Number(c.lat || 51.5136), Number(c.lng || 7.4653)],
      Number(c.zoom || 12)
    );
    const layer = L.layerGroup().addTo(m);
    const helperLayer = L.layerGroup().addTo(m);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(m);
    maps.set(q.id, { m, layer, helperLayer });

    const points = () => ans[q.id]?.points || [];
    const draw = () => {
      layer.clearLayers();
      const current = points();
      current.forEach((point, index) => {
        const marker = L.marker([point.lat, point.lng]).addTo(layer);
        marker.bindTooltip(String(index + 1), { permanent: true, direction: 'top', offset: [0, -9] });
      });
      const count = card?.querySelector('[data-count]');
      if (count) count.textContent = `${current.length} of ${max} ${max === 1 ? 'point' : 'points'} selected`;
    };

    async function addPoint(latlng) {
      let current = [...points()];
      if (max === 1 && current.length) current = [];
      if (current.length >= max) {
        alert(`You can select a maximum of ${max} points.`);
        return;
      }
      const point = { lat: latlng.lat, lng: latlng.lng };
      if (c.popup?.enabled) {
        point.popupAnswer = await popup(c.popup);
        if (point.popupAnswer === undefined) return;
      }
      current.push(point);
      set(q.id, { geometry: 'map_multi', points: current });
      draw();
    }

    m.on('click', e => addPoint(e.latlng));

    card?.querySelector('[data-undo]')?.addEventListener('click', () => {
      const current = [...points()];
      current.pop();
      set(q.id, current.length ? { geometry: 'map_multi', points: current } : null);
      draw();
    });
    card?.querySelector('[data-clear]')?.addEventListener('click', () => {
      set(q.id, null);
      draw();
    });

    const openFull = () => {
      if (!stage || c.fullScreenMap === false) return;
      stage.classList.add('map-fullscreen');
      document.body.classList.add('map-overlay-open');
      setTimeout(() => {
        m.invalidateSize();
        if (m.getZoom() < 14) m.setZoom(14);
      }, 80);
    };
    const closeFull = () => {
      if (!stage) return;
      stage.classList.remove('map-fullscreen');
      document.body.classList.remove('map-overlay-open');
      setTimeout(() => m.invalidateSize(), 80);
    };
    card?.querySelector('[data-open-full]')?.addEventListener('click', openFull);
    card?.querySelector('[data-close-full]')?.addEventListener('click', closeFull);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && stage?.classList.contains('map-fullscreen')) closeFull();
    });

    card?.querySelector('[data-use-location]')?.addEventListener('click', () => {
      if (!navigator.geolocation) {
        if (status) status.textContent = 'Location is not available in this browser.';
        return;
      }
      if (status) status.textContent = 'Requesting your location…';
      navigator.geolocation.getCurrentPosition(
        position => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          helperLayer.clearLayers();
          L.circle([lat, lng], {
            radius: Math.max(20, position.coords.accuracy || 50),
            weight: 2,
            fillOpacity: .08,
            interactive: false
          }).addTo(helperLayer);
          m.setView([lat, lng], 15);
          if (status) status.textContent = 'Map centered on your current location. Tap the map to select your response.';
        },
        () => {
          if (status) status.textContent = c.allowCitySearch !== false ? 'Location permission was not available. You can search for a city instead.' : 'Location permission was not available. You can navigate the map manually.';
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });

    async function searchCity() {
      const query = cityInput?.value.trim();
      if (!query || !results) return;
      results.innerHTML = '';
      if (status) status.textContent = 'Searching for that place…';
      try {
        const language = encodeURIComponent((navigator.language || 'en').split('-')[0]);
        const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=${language}`);
        if (!response.ok) throw new Error('Search failed');
        const data = await response.json();
        const features = Array.isArray(data.features) ? data.features : [];
        if (!features.length) {
          if (status) status.textContent = 'No matching city or place was found.';
          return;
        }
        features.forEach(feature => {
          const coordinates = feature.geometry?.coordinates || [];
          const props = feature.properties || {};
          if (coordinates.length < 2) return;
          const label = [props.name, props.city, props.state, props.country].filter(Boolean).filter((value, index, arr) => arr.indexOf(value) === index).join(', ');
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label || query;
          button.addEventListener('click', () => {
            m.setView([Number(coordinates[1]), Number(coordinates[0])], 13);
            results.innerHTML = '';
            if (status) status.textContent = `Map moved to ${label || query}. Tap the map to select your response.`;
          });
          results.appendChild(button);
        });
        if (status) status.textContent = 'Choose the matching place below.';
      } catch (_) {
        if (status) status.textContent = 'Place search is temporarily unavailable. You can still navigate the map manually.';
      }
    }

    card?.querySelector('[data-city-search]')?.addEventListener('click', searchCity);
    cityInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchCity();
      }
    });

    draw();
    setTimeout(() => m.invalidateSize(), 80);
  };

  render = function () {
    baseRender();
    applySurveyTheme();
  };

  if (def) {
    try {
      maps.forEach(entry => entry.m?.remove?.());
      maps.clear();
    } catch (_) {}
    render();
  }
})();
