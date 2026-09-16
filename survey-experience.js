// Respondent experience: previous-version inspired one-question-at-a-time survey flow.
(function () {
  if (typeof question === 'undefined' || typeof render === 'undefined') return;

  const baseQuestion = question;
  const baseMapInit = mapInit;
  const baseRender = render;
  let currentStep = 0; // 0 = intro, 1..N = visible survey steps
  let wizardReady = false;

  function activeQuestions() {
    return (def?.questions || []).filter(q => visible(q));
  }

  function applySurveyTheme() {
    if (!def) return;
    const s = def.settings || {};
    document.body.classList.add('survey-modern');
    document.body.style.backgroundColor = s.backgroundColor || '#f7f7f3';
    if (s.backgroundImage) {
      const alpha = Math.min(0.72, Math.max(0, Number(s.backgroundOverlay ?? 0.22)));
      const safeUrl = String(s.backgroundImage).replace(/"/g, '%22');
      document.body.style.backgroundImage = `linear-gradient(rgba(255,255,255,${alpha}),rgba(255,255,255,${alpha})),url("${safeUrl}")`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
    } else {
      document.body.style.backgroundImage = 'linear-gradient(180deg,#f8f8f5,#f4f6f2)';
    }
  }

  function topbarMarkup() {
    const s = def.settings || {};
    const logo = s.logo ? `<img class="respondent-brand-logo" src="${s.logo}" alt="Survey logo">` : '<span class="respondent-brand-mark">S</span>';
    return `<header class="respondent-topbar" id="respondentTopbar">
      <div class="respondent-brand">${logo}<div class="respondent-brand-copy"><div class="respondent-brand-title">${esc(def.title || 'Survey')}</div><div class="respondent-brand-sub">Community survey</div></div></div>
      <div class="respondent-step-label" id="respondentStepLabel">Welcome</div>
    </header><div class="experience-progress"><div class="experience-progress-fill" id="experienceProgressFill"></div></div>`;
  }

  function prepareIntro() {
    const head = document.querySelector('.survey-head');
    if (!head) return;
    head.classList.add('experience-intro');
    if (!head.querySelector('.survey-kicker')) {
      const kicker = document.createElement('div');
      kicker.className = 'survey-kicker';
      kicker.textContent = 'Welcome';
      head.prepend(kicker);
    }
    if (!head.querySelector('.survey-intro-note')) {
      const note = document.createElement('div');
      note.className = 'survey-intro-note';
      note.innerHTML = '<span>●</span><span>Your answers are saved as you move through the survey. For map questions, you can search for a city or choose to share your current location.</span>';
      head.append(note);
    }
    if (!head.querySelector('[data-start-survey]')) {
      const row = document.createElement('div');
      row.className = 'survey-start-row';
      row.innerHTML = '<button class="btn btn-primary" type="button" data-start-survey>Start survey →</button>';
      head.append(row);
      row.querySelector('[data-start-survey]').addEventListener('click', () => {
        currentStep = 1;
        showCurrentStep(true);
      });
    }
  }

  function prepareQuestionCards() {
    const questions = def.questions || [];
    document.querySelectorAll('[data-qid]').forEach(card => {
      const q = questions.find(item => item.id === card.dataset.qid);
      if (!q) return;
      card.classList.add('experience-question-hidden');
      if (!card.querySelector('.step-kicker-modern')) {
        const heading = card.querySelector('h3,h2');
        if (heading) {
          const kicker = document.createElement('div');
          kicker.className = 'step-kicker-modern';
          kicker.textContent = LABEL_FOR_TYPE(q.type);
          heading.before(kicker);
        }
      }
    });
  }

  function LABEL_FOR_TYPE(type) {
    const labels = {
      short_text: 'Text answer', long_text: 'Open response', number: 'Number', email: 'Email', phone: 'Phone',
      date: 'Date', time: 'Time', datetime: 'Date & time', yes_no: 'Yes or no', single_choice: 'Choose one',
      multiple_choice: 'Choose all that apply', dropdown: 'Select an option', rating: 'Rating', slider: 'Scale',
      matrix: 'Matrix', map_multi: 'Map question', photo: 'Photo', photos: 'Photos', audio: 'Voice response',
      video: 'Video response', file: 'File upload', signature: 'Signature', ranking: 'Ranking', allocation: 'Allocation',
      info: 'Information', section: 'Section', consent: 'Consent'
    };
    return labels[type] || 'Question';
  }

  function createNav() {
    if (document.getElementById('experienceNav')) return;
    const nav = document.createElement('div');
    nav.id = 'experienceNav';
    nav.className = 'experience-nav';
    nav.innerHTML = `<button class="btn" type="button" data-prev>← Back</button><span class="experience-nav-hint">Use Back and Next to move through the survey.</span><div class="experience-nav-right"><button class="btn btn-primary" type="button" data-next>Next →</button></div>`;
    const form = document.getElementById('form');
    form?.insertAdjacentElement('afterend', nav);
    nav.querySelector('[data-prev]').addEventListener('click', previousStep);
    nav.querySelector('[data-next]').addEventListener('click', nextStep);
  }

  function currentQuestion() {
    const qs = activeQuestions();
    if (currentStep <= 0 || currentStep > qs.length) return null;
    return qs[currentStep - 1];
  }

  function validateCurrent(q) {
    if (!q || ['info', 'section'].includes(q.type) || !q.required) return true;
    const value = ans[q.id];
    let invalid = missing(value);
    if (q.type === 'map_multi') invalid = !value?.points?.length;
    if (q.type === 'matrix') {
      const rows = q.config?.rows || [];
      invalid = rows.some(row => !value?.[row]);
    }
    if (q.type === 'allocation') {
      const total = Object.values(value || {}).reduce((sum, n) => sum + Number(n || 0), 0);
      invalid = total !== Number(q.config?.total || 100);
    }
    const card = document.querySelector(`[data-qid="${q.id}"]`);
    const error = card?.querySelector('[data-error]');
    if (invalid) {
      if (error) error.textContent = q.type === 'allocation' ? `Please allocate exactly ${q.config?.total || 100} ${q.config?.unit || 'points'}.` : 'Please answer this question before continuing.';
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    if (error) error.textContent = '';
    return true;
  }

  function nextStep() {
    const qs = activeQuestions();
    const q = currentQuestion();
    if (q && !validateCurrent(q)) return;
    if (currentStep < qs.length) {
      currentStep += 1;
      showCurrentStep(true);
      return;
    }
    if (preview) return;
    const form = document.getElementById('form');
    if (form?.requestSubmit) form.requestSubmit();
  }

  function previousStep() {
    if (currentStep <= 1) currentStep = 0;
    else currentStep -= 1;
    showCurrentStep(true);
  }

  function closeAllFullMaps() {
    document.querySelectorAll('.map-stage.map-fullscreen').forEach(stage => stage.classList.remove('map-fullscreen'));
    document.body.classList.remove('map-overlay-open');
  }

  function showCurrentStep(scrollTop) {
    const qs = activeQuestions();
    if (currentStep > qs.length) currentStep = qs.length;
    closeAllFullMaps();

    const head = document.querySelector('.survey-head');
    head?.classList.toggle('experience-hidden', currentStep !== 0);
    document.querySelectorAll('[data-qid]').forEach(card => card.classList.add('experience-question-hidden'));

    const nav = document.getElementById('experienceNav');
    if (nav) nav.classList.toggle('experience-hidden', currentStep === 0 || qs.length === 0);

    const stepLabel = document.getElementById('respondentStepLabel');
    const fill = document.getElementById('experienceProgressFill');
    const next = nav?.querySelector('[data-next]');
    const prev = nav?.querySelector('[data-prev]');

    if (currentStep === 0) {
      if (stepLabel) stepLabel.textContent = 'Welcome';
      if (fill) fill.style.width = '0%';
    } else {
      const q = qs[currentStep - 1];
      const card = document.querySelector(`[data-qid="${q.id}"]`);
      card?.classList.remove('experience-question-hidden');
      if (stepLabel) stepLabel.textContent = `Question ${currentStep} of ${qs.length}`;
      if (fill) fill.style.width = `${Math.round((currentStep / Math.max(1, qs.length)) * 100)}%`;
      if (next) next.textContent = currentStep === qs.length ? (preview ? 'End of preview' : 'Submit response →') : 'Next →';
      if (next) next.disabled = preview && currentStep === qs.length;
      if (prev) prev.style.visibility = 'visible';

      requestAnimationFrame(() => {
        if (q.type === 'map_multi') {
          const entry = maps.get(q.id);
          entry?.m?.invalidateSize?.();
          const full = q.config?.fullScreen !== false;
          if (full) setTimeout(() => card?.querySelector('[data-open-full]')?.click(), 120);
        }
      });
    }
    if (scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setupWizard() {
    if (!def) return;
    applySurveyTheme();
    if (!document.getElementById('respondentTopbar')) {
      root.insertAdjacentHTML('beforebegin', topbarMarkup());
    }
    root.classList.add('experience-stage');
    prepareIntro();
    prepareQuestionCards();
    createNav();
    wizardReady = true;
    showCurrentStep(false);
  }

  question = function (q) {
    const element = baseQuestion(q);
    if (q.type !== 'map_multi') return element;

    const slot = element.querySelector('.answer-slot');
    const c = q.config || {};
    const max = Math.min(50, Math.max(1, Number(c.maxPoints) || 1));
    const locationButton = c.allowGeo !== false ? '<button class="btn" type="button" data-use-location>◎ Use my location</button>' : '';
    const citySearch = c.allowCitySearch !== false
      ? `<div class="map-search-tools"><input type="search" data-city-input placeholder="Enter a city or place name" aria-label="City or place name"><button class="btn" type="button" data-city-search>Find city</button>${locationButton}</div><div class="map-city-results" data-city-results></div>`
      : `<div class="row-wrap">${locationButton}</div>`;
    const fullButton = c.fullScreen !== false ? '<button class="btn map-open-full" type="button" data-open-full>⛶ Full-screen map</button>' : '';

    slot.innerHTML = `<div class="map-experience"><div class="map-intro"><div><strong>Select locations on the map</strong><div class="small muted">You can add up to ${max} ${max === 1 ? 'point' : 'points'}.</div></div><span class="map-location-status" data-location-status>Search for a city, use your location, or navigate manually.</span></div>${citySearch}<div class="map-stage" data-map-stage><div class="map-stage-toolbar">${fullButton}<button class="btn map-close-full" type="button" data-close-full>← Back</button><button class="btn map-done-full" type="button" data-done-full>Done ✓</button><button class="btn" type="button" data-undo>Undo</button><button class="btn" type="button" data-clear>Clear</button><span data-count>0 of ${max} selected</span></div><div class="map-box" id="map_${q.id}"></div></div><div class="small muted">Map data © OpenStreetMap contributors. Place search powered by Photon.</div></div>`;
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

    const m = L.map(mapElement, { zoomControl: true }).setView([Number(c.lat || 51.5136), Number(c.lng || 7.4653)], Number(c.zoom || 12));
    const layer = L.layerGroup().addTo(m);
    const helperLayer = L.layerGroup().addTo(m);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
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
      if (current.length >= max) return alert(`You can select a maximum of ${max} points.`);
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
      const current = [...points()]; current.pop(); set(q.id, current.length ? { geometry: 'map_multi', points: current } : null); draw();
    });
    card?.querySelector('[data-clear]')?.addEventListener('click', () => { set(q.id, null); draw(); });

    const openFull = () => {
      if (!stage) return;
      stage.classList.add('map-fullscreen');
      document.body.classList.add('map-overlay-open');
      setTimeout(() => { m.invalidateSize(); if (m.getZoom() < 13) m.setZoom(13); }, 90);
    };
    const closeFull = () => {
      if (!stage) return;
      stage.classList.remove('map-fullscreen');
      document.body.classList.remove('map-overlay-open');
      setTimeout(() => m.invalidateSize(), 90);
    };
    card?.querySelector('[data-open-full]')?.addEventListener('click', openFull);
    card?.querySelector('[data-close-full]')?.addEventListener('click', closeFull);
    card?.querySelector('[data-done-full]')?.addEventListener('click', closeFull);

    card?.querySelector('[data-use-location]')?.addEventListener('click', () => {
      if (!navigator.geolocation) { if (status) status.textContent = 'Location is unavailable in this browser.'; return; }
      if (status) status.textContent = 'Requesting your location…';
      navigator.geolocation.getCurrentPosition(position => {
        const lat = position.coords.latitude, lng = position.coords.longitude;
        helperLayer.clearLayers();
        L.circle([lat, lng], { radius: Math.max(20, position.coords.accuracy || 50), weight: 2, fillOpacity: .08, interactive: false }).addTo(helperLayer);
        m.setView([lat, lng], 15);
        if (status) status.textContent = 'Map centered on your location. Tap the map to select a point.';
      }, () => { if (status) status.textContent = 'Location permission was not available. Search for a city instead.'; }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });

    async function searchCity() {
      const query = cityInput?.value.trim();
      if (!query || !results) return;
      results.innerHTML = '';
      if (status) status.textContent = 'Searching…';
      try {
        const language = encodeURIComponent((navigator.language || 'en').split('-')[0]);
        const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=${language}`);
        if (!response.ok) throw new Error('Search failed');
        const data = await response.json();
        const features = Array.isArray(data.features) ? data.features : [];
        if (!features.length) { if (status) status.textContent = 'No matching place was found.'; return; }
        features.forEach(feature => {
          const coords = feature.geometry?.coordinates || [];
          if (coords.length < 2) return;
          const p = feature.properties || {};
          const label = [p.name, p.city, p.state, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = label || query;
          button.addEventListener('click', () => { m.setView([Number(coords[1]), Number(coords[0])], 13); results.innerHTML = ''; if (status) status.textContent = `Map moved to ${label || query}. Tap the map to select your response.`; });
          results.appendChild(button);
        });
        if (status) status.textContent = 'Choose the matching place below.';
      } catch (_) { if (status) status.textContent = 'Place search is temporarily unavailable. Navigate the map manually.'; }
    }

    card?.querySelector('[data-city-search]')?.addEventListener('click', searchCity);
    cityInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchCity(); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && stage?.classList.contains('map-fullscreen')) closeFull(); });

    draw();
    setTimeout(() => m.invalidateSize(), 80);
  };

  render = function () {
    baseRender();
    setupWizard();
  };

  if (def) {
    try { maps.forEach(entry => entry.m?.remove?.()); maps.clear(); } catch (_) {}
    render();
  }
})();
