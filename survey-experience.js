// Modern respondent experience with dedicated map-page questions inspired by map-first PPGIS tools.
(function () {
  if (typeof question === 'undefined' || typeof render === 'undefined') return;

  const baseQuestion = question;
  const baseMapInit = mapInit;
  const baseRender = render;
  let currentStep = 0; // 0=intro, 1..N=visible questions

  function activeQuestions() {
    return (def?.questions || []).filter(q => visible(q));
  }

  function applySurveyTheme() {
    if (!def) return;
    const s = def.settings || {};
    document.body.classList.add('survey-modern');
    document.body.style.backgroundColor = s.backgroundColor || '#f5f7f4';
    if (s.backgroundImage) {
      const alpha = Math.min(0.72, Math.max(0, Number(s.backgroundOverlay ?? 0.18)));
      const safeUrl = String(s.backgroundImage).replace(/"/g, '%22');
      document.body.style.backgroundImage = `linear-gradient(rgba(255,255,255,${alpha}),rgba(255,255,255,${alpha})),url("${safeUrl}")`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
    } else {
      document.body.style.backgroundImage = 'linear-gradient(145deg,#eef3ef 0%,#f8faf7 45%,#f1f4f0 100%)';
    }
  }

  function topbarMarkup() {
    const s = def.settings || {};
    const logo = s.logo
      ? `<img class="respondent-brand-logo" src="${s.logo}" alt="Survey logo">`
      : '<span class="respondent-brand-mark">S</span>';
    return `<header class="respondent-topbar" id="respondentTopbar">
      <div class="respondent-brand">${logo}<div class="respondent-brand-copy"><div class="respondent-brand-title">${esc(def.title || 'Survey')}</div><div class="respondent-brand-sub">Interactive survey</div></div></div>
      <div class="respondent-step-label" id="respondentStepLabel">Welcome</div>
    </header>
    <div class="experience-progress"><div class="experience-progress-fill" id="experienceProgressFill"></div></div>`;
  }

  function labelForType(type) {
    const labels = {
      short_text:'Text answer', long_text:'Open response', number:'Number', email:'Email', phone:'Phone',
      date:'Date', time:'Time', datetime:'Date & time', yes_no:'Yes or no', single_choice:'Choose one',
      multiple_choice:'Choose all that apply', dropdown:'Select an option', rating:'Rating', slider:'Scale',
      matrix:'Matrix', map_multi:'Map question', photo:'Photo', photos:'Photos', audio:'Voice response',
      video:'Video response', file:'File upload', signature:'Signature', ranking:'Ranking', allocation:'Allocation',
      info:'Information', section:'Section', consent:'Consent'
    };
    return labels[type] || 'Question';
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
    if (!head.querySelector('.survey-intro-meta')) {
      const meta = document.createElement('div');
      meta.className = 'survey-intro-meta';
      meta.innerHTML = '<span>Interactive</span><span>Map-enabled</span><span>Mobile friendly</span>';
      head.append(meta);
    }
    if (!head.querySelector('[data-start-survey]')) {
      const row = document.createElement('div');
      row.className = 'survey-start-row';
      row.innerHTML = '<button class="btn btn-primary" type="button" data-start-survey>Start survey <span aria-hidden="true">→</span></button>';
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
      if (q.type === 'map_multi') return;
      if (!card.querySelector('.step-kicker-modern')) {
        const heading = card.querySelector('h3,h2');
        if (heading) {
          const kicker = document.createElement('div');
          kicker.className = 'step-kicker-modern';
          kicker.textContent = labelForType(q.type);
          heading.before(kicker);
        }
      }
    });
  }

  function createNav() {
    if (document.getElementById('experienceNav')) return;
    const nav = document.createElement('div');
    nav.id = 'experienceNav';
    nav.className = 'experience-nav';
    nav.innerHTML = `<button class="btn experience-back" type="button" data-prev>← Back</button><div class="experience-nav-right"><button class="btn btn-primary experience-next" type="button" data-next>Next →</button></div>`;
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
    if (!q || ['info','section'].includes(q.type) || !q.required) return true;
    const value = ans[q.id];
    let invalid = missing(value);
    if (q.type === 'map_multi') invalid = !value?.points?.length;
    if (q.type === 'matrix') invalid = (q.config?.rows || []).some(row => !value?.[row]);
    if (q.type === 'allocation') {
      const total = Object.values(value || {}).reduce((sum,n) => sum + Number(n || 0), 0);
      invalid = total !== Number(q.config?.total || 100);
    }
    const card = document.querySelector(`[data-qid="${q.id}"]`);
    const error = card?.querySelector('[data-error]');
    if (invalid) {
      if (error) error.textContent = q.type === 'allocation'
        ? `Please allocate exactly ${q.config?.total || 100} ${q.config?.unit || 'points'}.`
        : 'Please answer this question before continuing.';
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
    document.getElementById('form')?.requestSubmit?.();
  }

  function previousStep() {
    if (currentStep <= 1) currentStep = 0;
    else currentStep -= 1;
    showCurrentStep(true);
  }

  function showCurrentStep(scrollTop) {
    const qs = activeQuestions();
    if (currentStep > qs.length) currentStep = qs.length;
    const head = document.querySelector('.survey-head');
    head?.classList.toggle('experience-hidden', currentStep !== 0);
    document.querySelectorAll('[data-qid]').forEach(card => card.classList.add('experience-question-hidden'));

    const nav = document.getElementById('experienceNav');
    if (nav) nav.classList.toggle('experience-hidden', currentStep === 0 || qs.length === 0);

    const label = document.getElementById('respondentStepLabel');
    const fill = document.getElementById('experienceProgressFill');
    const next = nav?.querySelector('[data-next]');
    document.body.classList.remove('map-page-active');

    if (currentStep === 0) {
      if (label) label.textContent = 'Welcome';
      if (fill) fill.style.width = '0%';
    } else {
      const q = qs[currentStep - 1];
      const card = document.querySelector(`[data-qid="${q.id}"]`);
      card?.classList.remove('experience-question-hidden');
      if (label) label.textContent = `${currentStep} / ${qs.length}`;
      if (fill) fill.style.width = `${Math.round((currentStep / Math.max(1, qs.length)) * 100)}%`;
      if (next) {
        next.textContent = currentStep === qs.length ? (preview ? 'Preview complete' : 'Submit →') : 'Next →';
        next.disabled = preview && currentStep === qs.length;
      }
      if (q.type === 'map_multi') {
        document.body.classList.add('map-page-active');
        requestAnimationFrame(() => {
          const entry = maps.get(q.id);
          entry?.m?.invalidateSize?.();
          setTimeout(() => entry?.m?.invalidateSize?.(), 120);
        });
      }
    }
    if (scrollTop && !document.body.classList.contains('map-page-active')) {
      window.scrollTo({top:0,behavior:'smooth'});
    }
  }

  function setupWizard() {
    if (!def) return;
    applySurveyTheme();
    if (!document.getElementById('respondentTopbar')) root.insertAdjacentHTML('beforebegin', topbarMarkup());
    root.classList.add('experience-stage');
    prepareIntro();
    prepareQuestionCards();
    createNav();
    showCurrentStep(false);
  }

  question = function (q) {
    const element = baseQuestion(q);
    if (q.type !== 'map_multi') return element;

    const c = q.config || {};
    const max = Math.min(50, Math.max(1, Number(c.maxPoints) || 1));
    const title = esc(q.title || 'Map question');
    const desc = q.description ? `<p class="qdesc">${esc(q.description)}</p>` : '';
    const required = q.required ? '<span class="required-mark">*</span>' : '';
    const locationButton = c.allowGeo !== false
      ? '<button class="map-action" type="button" data-use-location>◎ Use my location</button>'
      : '';
    const search = c.allowCitySearch !== false
      ? `<div class="map-search-row"><input type="search" data-city-input placeholder="Search city or place"><button class="map-search-button" type="button" data-city-search>Search</button></div><div class="map-city-results" data-city-results></div>`
      : '';

    element.classList.add('map-page-card');
    element.innerHTML = `<div class="map-page-canvas"><div class="map-box" id="map_${q.id}"></div></div>
      <aside class="map-floating-panel">
        <div class="map-panel-handle"></div>
        <div class="step-kicker-modern">Map question</div>
        <h3>${title}${required}</h3>
        ${desc}
        <div class="map-point-limit">Select up to <strong>${max}</strong> ${max === 1 ? 'location' : 'locations'} on the map.</div>
        ${search}
        <div class="map-actions-row">${locationButton}<button class="map-action" type="button" data-undo>Undo</button><button class="map-action" type="button" data-clear>Clear</button></div>
        <div class="map-location-status" data-location-status>Pan or zoom the map, then tap to add a point.</div>
        <div class="map-count" data-count>0 of ${max} selected</div>
        <div class="error-text" data-error></div>
      </aside>`;
    return element;
  };

  mapInit = function (q) {
    if (q.type !== 'map_multi') return baseMapInit(q);
    if (maps.has(q.id) || !$(`#map_${q.id}`)) return;

    const c = q.config || {};
    const max = Math.min(50, Math.max(1, Number(c.maxPoints) || 1));
    const card = document.querySelector(`[data-qid="${q.id}"]`);
    const status = card?.querySelector('[data-location-status]');
    const results = card?.querySelector('[data-city-results]');
    const cityInput = card?.querySelector('[data-city-input]');

    const m = L.map(`map_${q.id}`, {zoomControl:true}).setView(
      [Number(c.lat || 51.5136), Number(c.lng || 7.4653)],
      Number(c.zoom || 12)
    );
    const layer = L.layerGroup().addTo(m);
    const helper = L.layerGroup().addTo(m);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19,
      attribution:'&copy; OpenStreetMap contributors'
    }).addTo(m);
    maps.set(q.id, {m,layer,helper});

    const points = () => ans[q.id]?.points || [];
    const draw = () => {
      layer.clearLayers();
      const current = points();
      current.forEach((point,index) => {
        const marker = L.marker([point.lat,point.lng]).addTo(layer);
        marker.bindTooltip(String(index + 1), {permanent:true,direction:'top',offset:[0,-8]});
      });
      const count = card?.querySelector('[data-count]');
      if (count) count.textContent = `${current.length} of ${max} selected`;
    };

    async function addPoint(latlng) {
      let current = [...points()];
      if (max === 1 && current.length) current = [];
      if (current.length >= max) {
        if (status) status.textContent = `Maximum ${max} points reached.`;
        return;
      }
      const point = {lat:latlng.lat,lng:latlng.lng};
      if (c.popup?.enabled) {
        point.popupAnswer = await popup(c.popup);
        if (point.popupAnswer === undefined) return;
      }
      current.push(point);
      set(q.id, {geometry:'map_multi',points:current});
      if (status) status.textContent = max === 1 ? 'Location selected. You can move it by clicking another place.' : 'Point added. Add another point or continue.';
      draw();
    }

    m.on('click', e => addPoint(e.latlng));
    card?.querySelector('[data-undo]')?.addEventListener('click', () => {
      const current = [...points()];
      current.pop();
      set(q.id, current.length ? {geometry:'map_multi',points:current} : null);
      draw();
    });
    card?.querySelector('[data-clear]')?.addEventListener('click', () => {
      set(q.id, null);
      draw();
      if (status) status.textContent = 'Selection cleared. Tap the map to add a point.';
    });

    card?.querySelector('[data-use-location]')?.addEventListener('click', () => {
      if (!navigator.geolocation) {
        if (status) status.textContent = 'Current location is not available in this browser.';
        return;
      }
      if (status) status.textContent = 'Requesting your location…';
      navigator.geolocation.getCurrentPosition(position => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        helper.clearLayers();
        L.circle([lat,lng], {
          radius:Math.max(20,position.coords.accuracy || 50),
          weight:2,
          fillOpacity:.08,
          interactive:false
        }).addTo(helper);
        m.setView([lat,lng],15);
        if (status) status.textContent = 'Map centered on your current location. Tap the map to select your answer.';
      }, () => {
        if (status) status.textContent = 'Location permission was not available. Search for a city or navigate manually.';
      }, {enableHighAccuracy:true,timeout:10000,maximumAge:60000});
    });

    async function searchCity() {
      const query = cityInput?.value.trim();
      if (!query || !results) return;
      results.innerHTML = '';
      if (status) status.textContent = 'Searching for that place…';
      try {
        const language = (navigator.language || 'en').split('-')[0];
        const response = await fetch(`${API}/api/geocode?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(language)}`);
        if (!response.ok) throw new Error('Search failed');
        const data = await response.json();
        const found = Array.isArray(data.results) ? data.results : [];
        if (!found.length) {
          if (status) status.textContent = 'No matching place was found. Try a larger nearby city.';
          return;
        }
        found.forEach(item => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = item.label || query;
          button.addEventListener('click', () => {
            m.setView([Number(item.lat),Number(item.lng)],13);
            results.innerHTML = '';
            if (status) status.textContent = `Map moved to ${item.label || query}. Tap the map to add your point.`;
          });
          results.appendChild(button);
        });
        if (status) status.textContent = 'Choose the matching place.';
      } catch (_) {
        if (status) status.textContent = 'Place search is temporarily unavailable. You can still pan and zoom the map manually.';
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
    setTimeout(() => m.invalidateSize(),80);
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
