// Modern respondent experience with map-first questions for points, multiple lines, and multiple polygons.
(function () {
  if (typeof question === 'undefined' || typeof render === 'undefined') return;

  const MAP_TYPES = new Set(['map_multi', 'map_line', 'map_polygon']);
  const baseQuestion = question;
  const baseMapInit = mapInit;
  const baseRender = render;
  let currentStep = 0;

  // ---- Skip logic: "if this answer is chosen, continue at question X (or end the survey)" ----
  // Questions between the choice question and the target are treated as hidden: not shown,
  // not required, not counted and not submitted.
  const baseVisible = visible;
  function branchSkipped() {
    const qs = def?.questions || [];
    const skipped = new Set();
    for (let i = 0; i < qs.length; i += 1) {
      const q = qs[i];
      if (skipped.has(q.id) || !baseVisible(q)) continue;
      const rules = Array.isArray(q.config?.branches) ? q.config.branches : [];
      if (!rules.length) continue;
      const value = ans[q.id];
      if (value === undefined || value === null || value === '') continue;
      const opts = q.type === 'yes_no' ? ['Yes', 'No'] : (q.config?.options || []);
      const rule = rules.find(r => r && r.goto && Number.isInteger(r.index) && opts[r.index] !== undefined && opts[r.index] === value);
      if (!rule) continue;
      const end = rule.goto === '__end' ? qs.length : qs.findIndex(x => x.id === rule.goto);
      if (end <= i) continue;
      for (let k = i + 1; k < end; k += 1) skipped.add(qs[k].id);
    }
    return skipped;
  }
  visible = function (q) {
    if (q && branchSkipped().has(q.id)) return false;
    return baseVisible(q);
  };
  const baseSubmit = submit;
  submit = function (e) {
    try {
      (def?.questions || []).forEach(q => { if (!visible(q) && Object.prototype.hasOwnProperty.call(ans, q.id)) delete ans[q.id]; });
    } catch (_) {}
    return baseSubmit.call(this, e);
  };

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
    document.body.classList.toggle('survey-has-bg', !!s.backgroundImage);
    renderBackgroundCredit(s);
  }

  // Small photo credit for the background image (bottom-left on desktop, end of page on mobile)
  function renderBackgroundCredit(s) {
    const text = s.backgroundImage ? String(s.backgroundCredit || '').trim() : '';
    let el = document.getElementById('surveyBgCredit');
    if (!text) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'surveyBgCredit';
      el.className = 'survey-bg-credit';
      document.body.appendChild(el);
    }
    el.textContent = '';
    text.split(/(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.[a-z]{2,}\/[^\s]*)/i).forEach(part => {
      if (!part) return;
      if (/^(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}\/)/i.test(part)) {
        const a = document.createElement('a');
        a.href = /^https?:/i.test(part) ? part : `https://${part}`;
        a.target = '_blank'; a.rel = 'noopener';
        a.textContent = part;
        el.appendChild(a);
      } else {
        el.appendChild(document.createTextNode(part));
      }
    });
  }

  function topbarMarkup() {
    const s = def.settings || {};
    const logos = Array.isArray(s.logos) && s.logos.length ? s.logos : (s.logo ? [s.logo] : []);
    const logo = logos.length
      ? `<div class="respondent-brand-logos">${logos.map(src => `<img class="respondent-brand-logo" src="${src}" alt="Survey logo">`).join('')}</div>`
      : '<span class="respondent-brand-mark">S</span>';
    return `<header class="respondent-topbar" id="respondentTopbar">
      <div class="respondent-brand">${logo}<div class="respondent-brand-copy"><div class="respondent-brand-title">${esc(def.title || 'Survey')}</div></div></div>
      <div class="respondent-step-label" id="respondentStepLabel">Welcome</div>
    </header>
    <div class="experience-progress"><div class="experience-progress-fill" id="experienceProgressFill"></div></div>`;
  }

  function labelForType(type) {
    const labels = {
      short_text:'Text answer', long_text:'Open response', number:'Number', email:'Email', phone:'Phone',
      date:'Date', time:'Time', datetime:'Date & time', yes_no:'Yes or no', single_choice:'Choose one',
      multiple_choice:'Choose all that apply', dropdown:'Select an option', rating:'Rating', slider:'Scale',
      matrix:'Matrix', map_multi:'Point map', map_line:'Line map', map_polygon:'Polygon map', photo:'Photo', photos:'Photos', audio:'Voice response',
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
      if (MAP_TYPES.has(q.type)) return;
      // No small labels above questions or section titles (removed on request).
      if (false) {
        const heading = card.querySelector('h3,h2');
        if (heading) {
          const kicker = document.createElement('div');
          kicker.className = 'step-kicker-modern';
          kicker.textContent = q.type === 'section' ? sectionLabel(q) : labelForType(q.type);
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

  const CONTENT_TYPES = new Set(['info','section']);

  // A section heading is shown on the same page as the question right after it,
  // so participants see the explanation and the first question together.
  // (Map questions use a full-screen layout, so a section before a map keeps its own page.)
  function pages() {
    const qs = activeQuestions();
    const list = [];
    for (let i = 0; i < qs.length; i += 1) {
      const q = qs[i], next = qs[i + 1];
      // Section set to "all questions on one page": group every following question up to the
      // next section heading. Map questions keep their own full-screen page.
      if (q.type === 'section' && q.config?.onePage) {
        const group = [];
        let j = i + 1;
        while (j < qs.length && qs[j].type !== 'section' && !MAP_TYPES.has(qs[j].type)) { group.push(qs[j]); j += 1; }
        if (group.length) { list.push({lead:q, main:group[0], group}); i = j - 1; continue; }
      }
      if (q.type === 'section' && q.config?.hideHeading) continue;
      if (q.type === 'section' && next && !CONTENT_TYPES.has(next.type) && !MAP_TYPES.has(next.type)) {
        list.push({lead:q, main:next});
        i += 1;
      } else {
        list.push({lead:null, main:q});
      }
    }
    return list;
  }

  function currentPage() {
    const ps = pages();
    if (currentStep <= 0 || currentStep > ps.length) return null;
    return ps[currentStep - 1];
  }

  function currentQuestion() {
    return currentPage()?.main || null;
  }

  function sectionLabel(q) {
    const sections = (def?.questions || []).filter(item => item.type === 'section' && !item.config?.hideHeading);
    const index = sections.findIndex(item => item.id === q.id);
    const word = window.SurveyLanguage?.t?.('section') || 'Section';
    return sections.length > 1 && index >= 0 ? `${word} ${index + 1} / ${sections.length}` : word;
  }

  function ensureMapReady(q) {
    if (!q || !MAP_TYPES.has(q.type) || maps.has(q.id)) return;
    mapInit(q);
  }

  function mapDescriptor(q) {
    if (q.type === 'map_line') return {
      label:'Line map', feature:'line', featurePlural:'lines', noun:'vertices', min:2,
      max:Math.min(100,Math.max(2,Number(q.config?.maxVertices)||30)),
      maxFeatures:Math.min(50,Math.max(1,Number(q.config?.maxFeatures)||10)), geometry:'map_line'
    };
    if (q.type === 'map_polygon') return {
      label:'Polygon map', feature:'polygon', featurePlural:'polygons', noun:'vertices', min:3,
      max:Math.min(100,Math.max(3,Number(q.config?.maxVertices)||30)),
      maxFeatures:Math.min(50,Math.max(1,Number(q.config?.maxFeatures)||10)), geometry:'map_polygon'
    };
    const max = Math.min(50,Math.max(1,Number(q.config?.maxPoints)||1));
    return {label:'Point map', feature:'point', featurePlural:'points', noun:max===1?'location':'locations', min:1, max, maxFeatures:max, geometry:'map_multi'};
  }

  function savedFeatures(q, value) {
    if (!value || q.type === 'map_multi') return [];
    if (Array.isArray(value.features)) return value.features.filter(feature => Array.isArray(feature?.points));
    const d = mapDescriptor(q);
    if (Array.isArray(value.points) && value.points.length >= d.min) return [{points:value.points}];
    return [];
  }

  function validateCurrent(q) {
    if (!q || ['info','section'].includes(q.type)) return true;
    const value = ans[q.id];
    const card = document.querySelector(`[data-qid="${q.id}"]`);
    const error = card?.querySelector('[data-error]');

    if ((q.type === 'map_line' || q.type === 'map_polygon') && (value?.draftPoints?.length || 0) > 0) {
      if (error) error.textContent = `Finish or clear the current ${q.type === 'map_line' ? 'line' : 'polygon'} before continuing.`;
      return false;
    }

    if (!q.required) {
      if (error) error.textContent = '';
      return true;
    }

    let invalid = missing(value);
    if (q.type === 'map_multi') invalid = !(value?.points?.length >= 1);
    if (q.type === 'map_line' || q.type === 'map_polygon') invalid = savedFeatures(q, value).length < 1;
    if (q.type === 'matrix') invalid = (q.config?.rows || []).some(row => !value?.[row]);
    if (q.type === 'allocation') {
      const total = Object.values(value || {}).reduce((sum,n) => sum + Number(n || 0), 0);
      invalid = total !== Number(q.config?.total || 100);
    }

    if (invalid) {
      if (error) {
        if (q.type === 'map_line') error.textContent = 'Please finish at least one line before continuing.';
        else if (q.type === 'map_polygon') error.textContent = 'Please finish at least one polygon before continuing.';
        else if (q.type === 'allocation') error.textContent = `Please allocate exactly ${q.config?.total || 100} ${q.config?.unit || 'points'}.`;
        else error.textContent = 'Please answer this question before continuing.';
      }
      return false;
    }
    if (error) error.textContent = '';
    return true;
  }

  function nextStep() {
    const qs = pages();
    const page = currentPage();
    const onPage = page ? (page.group || [page.main]) : [];
    const invalid = onPage.filter(item => !validateCurrent(item));
    if (invalid.length) {
      if (onPage.length > 1) document.querySelector(`[data-qid="${invalid[0].id}"]`)?.scrollIntoView({behavior:'smooth', block:'center'});
      return;
    }
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
    const qs = pages();
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

    document.body.classList.toggle('survey-welcome-active', currentStep === 0);
    if (currentStep === 0) {
      if (label) label.textContent = 'Welcome';
      if (fill) fill.style.width = '0%';
    } else {
      const page = qs[currentStep - 1];
      const q = page.main;
      document.querySelectorAll('.section-lead').forEach(el => el.classList.remove('section-lead'));
      if (page.lead && !page.lead.config?.hideHeading) {
        const leadCard = document.querySelector(`[data-qid="${page.lead.id}"]`);
        leadCard?.classList.remove('experience-question-hidden');
        leadCard?.classList.add('section-lead');
      }
      document.querySelectorAll('.page-group-item').forEach(el => el.classList.remove('page-group-item'));
      (page.group || [q]).forEach(item => {
        const card = document.querySelector(`[data-qid="${item.id}"]`);
        card?.classList.remove('experience-question-hidden');
        if (page.group) {
          card?.classList.add('page-group-item');
          // two options per row on phones only when every option is short (e.g. age groups)
          card?.querySelectorAll('.option-list').forEach(list => {
            const labels = [...list.querySelectorAll('.option-label')].map(l => (l.textContent || '').trim());
            list.classList.toggle('options-short', labels.length > 1 && labels.every(text => text.length <= 16 && !text.split(/\s+/).some(word => word.length > 11)));
          });
        }
      });
      // Count only real questions (not section headings or information texts)
      const realTotal = activeQuestions().filter(item => !CONTENT_TYPES.has(item.type)).length;
      const realDone = qs.slice(0, currentStep).reduce((n, p) => n + (p.group ? p.group.filter(x => !CONTENT_TYPES.has(x.type)).length : (CONTENT_TYPES.has(p.main.type) ? 0 : 1)), 0);
      if (label) label.textContent = realTotal ? `${Math.max(1, realDone)} / ${realTotal}` : `${currentStep} / ${qs.length}`;
      if (fill) fill.style.width = `${Math.round((currentStep / Math.max(1, qs.length)) * 100)}%`;
      if (next) {
        next.textContent = currentStep === qs.length ? (preview ? 'Preview complete' : 'Submit →') : 'Next →';
        next.dataset.lastSource = next.textContent;
        next.disabled = preview && currentStep === qs.length;
      }
      if (MAP_TYPES.has(q.type)) {
        document.body.classList.add('map-page-active');
        requestAnimationFrame(() => {
          ensureMapReady(q);
          const entry = maps.get(q.id);
          entry?.m?.invalidateSize?.();
          setTimeout(() => entry?.m?.invalidateSize?.(), 120);
        });
      }
    }
    if (scrollTop && !document.body.classList.contains('map-page-active')) window.scrollTo({top:0,behavior:'smooth'});
  }

  function refreshNextLabel() {
    if (currentStep <= 0) return;
    const qs = pages();
    const next = document.querySelector('#experienceNav [data-next]');
    if (!next || currentStep > qs.length) return;
    const text = currentStep === qs.length ? (preview ? 'Preview complete' : 'Submit →') : 'Next →';
    if (next.textContent !== text && !(window.SurveyLanguage && next.dataset.lastSource === text)) { next.dataset.lastSource = text; next.textContent = text; }
    next.disabled = preview && currentStep === qs.length;
  }
  document.addEventListener('change', () => setTimeout(refreshNextLabel, 0));

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
    if (!MAP_TYPES.has(q.type)) return element;

    const c = q.config || {};
    const d = mapDescriptor(q);
    const title = esc(q.title || `${d.label} question`);
    const desc = q.description ? `<p class="qdesc">${esc(q.description)}</p>` : '';
    const required = q.required ? '<span class="required-mark">*</span>' : '';
    const locationButton = c.allowGeo !== false ? '<button class="map-action" type="button" data-use-location>◎ Use my location</button>' : '';
    const search = c.allowCitySearch !== false
      ? `<div class="map-search-row"><input type="search" data-city-input placeholder="Search city or place"><button class="map-search-button" type="button" data-city-search>Search</button></div><div class="map-city-results" data-city-results></div>`
      : '';

    const fullscreenButton = '<button class="map-action map-fullscreen-action" type="button" data-map-fullscreen aria-pressed="false">⛶ Full screen</button>';

    let instruction;
    let actions;
    if (q.type === 'map_multi') {
      instruction = `Tap the map to select up to <strong>${d.max}</strong> ${d.noun}.`;
      actions = `${locationButton}${fullscreenButton}<button class="map-action" type="button" data-undo>Undo</button><button class="map-action" type="button" data-clear>Clear</button>`;
    } else {
      instruction = `Tap the map to draw. <strong>Desktop:</strong> right-click to finish. <strong>Mobile:</strong> double-tap to finish. You can create up to <strong>${d.maxFeatures}</strong> ${d.featurePlural}.`;
      actions = `${locationButton}${fullscreenButton}<button class="map-action map-save-feature" type="button" data-save-feature>Finish ${d.feature}</button><button class="map-action" type="button" data-undo>Undo vertex</button><button class="map-action" type="button" data-clear-current>Clear current</button><button class="map-action" type="button" data-remove-saved>Remove last saved</button><button class="map-action" type="button" data-clear>Clear all</button>`;
    }

    element.classList.add('map-page-card');
    element.innerHTML = `<div class="map-page-canvas"><div class="map-box" id="map_${q.id}"></div></div>
      <aside class="map-floating-panel">
        <div class="map-panel-handle"></div>
        <h3>${title}${required}</h3>
        ${desc}
        <div class="map-point-limit">${instruction}</div>
        ${search}
        <div class="map-actions-row">${actions}</div>
        <div class="map-location-status" data-location-status>${q.type === 'map_multi' ? 'Pan or zoom the map, then tap to add a point.' : `Start drawing your first ${d.feature}. Right-click or double-tap when it is finished.`}</div>
        <div class="map-count" data-count>0 selected</div>
        <div class="error-text" data-error></div>
      </aside>`;
    return element;
  };

  mapInit = function (q) {
    if (!MAP_TYPES.has(q.type)) return baseMapInit(q);
    const active = currentQuestion();
    if (!active || active.id !== q.id) return;
    if (maps.has(q.id) || !$(`#map_${q.id}`)) return;

    const c = q.config || {};
    const d = mapDescriptor(q);
    const card = document.querySelector(`[data-qid="${q.id}"]`);
    const status = card?.querySelector('[data-location-status]');
    const results = card?.querySelector('[data-city-results]');
    const cityInput = card?.querySelector('[data-city-input]');
    const mapElement = document.getElementById(`map_${q.id}`);
    const touchMode = window.matchMedia?.('(pointer: coarse)')?.matches === true;
    const fullscreenTarget = document.querySelector('.experience-stage') || card;

    function syncFullscreenButton() {
      const button = card?.querySelector('[data-map-fullscreen]');
      if (!button) return;
      const active = document.fullscreenElement === fullscreenTarget || document.body.classList.contains('map-viewport-fullscreen');
      button.textContent = active ? '⛶ Exit full screen' : '⛶ Full screen';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', active ? 'Exit map full screen' : 'Open map full screen');
    }

    async function toggleFullscreen() {
      const fallbackActive = document.body.classList.contains('map-viewport-fullscreen');
      if (document.fullscreenElement === fullscreenTarget) {
        try { await document.exitFullscreen(); } catch (_) {}
        return;
      }
      if (fallbackActive) {
        document.body.classList.remove('map-viewport-fullscreen');
        syncFullscreenButton();
        setTimeout(() => m.invalidateSize({pan:false}), 50);
        return;
      }
      try {
        if (fullscreenTarget?.requestFullscreen) {
          await fullscreenTarget.requestFullscreen();
          return;
        }
      } catch (_) {}
      document.body.classList.add('map-viewport-fullscreen');
      syncFullscreenButton();
      setTimeout(() => m.invalidateSize({pan:false}), 50);
    }

    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement !== fullscreenTarget) document.body.classList.remove('map-viewport-fullscreen');
      syncFullscreenButton();
      setTimeout(() => m.invalidateSize({pan:false}), 50);
    });

    const m = L.map(mapElement, {
      zoomControl:true,
      doubleClickZoom:q.type === 'map_multi'
    }).setView([Number(c.lat || 51.5136), Number(c.lng || 7.4653)], Number(c.zoom || 12));
    const layer = L.layerGroup().addTo(m);
    const helper = L.layerGroup().addTo(m);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(m);
    maps.set(q.id, {m,layer,helper});

    const value = () => ans[q.id] || {};
    const pointValues = () => value().points || [];
    const featureValues = () => savedFeatures(q, value());
    const draftValues = () => Array.isArray(value().draftPoints) ? value().draftPoints : [];

    function writeFeatures(features, draftPoints) {
      if (!features.length && !draftPoints.length) {
        set(q.id, null);
        return;
      }
      set(q.id, {geometry:d.geometry,features,draftPoints});
    }

    function drawFeatureLabel(latlng, text) {
      L.tooltip({permanent:true,direction:'center',className:'map-feature-label',opacity:.92})
        .setLatLng(latlng).setContent(text).addTo(layer);
    }

    const draw = () => {
      layer.clearLayers();
      if (q.type === 'map_multi') {
        const current = pointValues();
        current.forEach((point,index) => {
          const marker = L.circleMarker([point.lat,point.lng], {radius:6,weight:2,fillOpacity:.95}).addTo(layer);
          marker.bindTooltip(String(index + 1), {permanent:true,direction:'top',offset:[0,-7]});
        });
        const count = card?.querySelector('[data-count]');
        if (count) count.textContent = `${current.length} of ${d.max} selected`;
        return;
      }

      const features = featureValues();
      const draft = draftValues();
      features.forEach((feature,index) => {
        const pts = feature.points || [];
        if (q.type === 'map_line') {
          if (pts.length >= 2) {
            const shape = L.polyline(pts.map(p => [p.lat,p.lng]), {weight:5,opacity:.82}).addTo(layer);
            const bounds = shape.getBounds();
            if (bounds.isValid()) drawFeatureLabel(bounds.getCenter(), `Line ${index + 1}`);
          }
        } else if (pts.length >= 3) {
          const shape = L.polygon(pts.map(p => [p.lat,p.lng]), {weight:3,fillOpacity:.18}).addTo(layer);
          const bounds = shape.getBounds();
          if (bounds.isValid()) drawFeatureLabel(bounds.getCenter(), `Polygon ${index + 1}`);
        }
      });

      draft.forEach((point,index) => {
        const marker = L.circleMarker([point.lat,point.lng], {radius:6,weight:2,fillOpacity:.95}).addTo(layer);
        marker.bindTooltip(String(index + 1), {permanent:true,direction:'top',offset:[0,-7]});
      });
      if (draft.length >= 2) {
        if (q.type === 'map_polygon' && draft.length >= 3) {
          L.polygon(draft.map(p => [p.lat,p.lng]), {weight:3,dashArray:'7 6',fillOpacity:.07}).addTo(layer);
        } else {
          L.polyline(draft.map(p => [p.lat,p.lng]), {weight:4,dashArray:'7 6',opacity:.8}).addTo(layer);
        }
      }

      const count = card?.querySelector('[data-count]');
      if (count) count.textContent = `${features.length} of ${d.maxFeatures} ${d.featurePlural} saved · ${draft.length} draft ${draft.length === 1 ? 'vertex' : 'vertices'}`;
      const saveButton = card?.querySelector('[data-save-feature]');
      if (saveButton) saveButton.disabled = draft.length < d.min || features.length >= d.maxFeatures;
      const removeButton = card?.querySelector('[data-remove-saved]');
      if (removeButton) removeButton.disabled = features.length === 0;
    };

    async function addVertex(latlng) {
      if (q.type === 'map_multi') {
        let current = [...pointValues()];
        if (d.max === 1 && current.length) current = [];
        if (current.length >= d.max) {
          if (status) status.textContent = `Maximum ${d.max} points reached.`;
          return;
        }
        const point = {lat:latlng.lat,lng:latlng.lng};
        if (c.popup?.enabled) {
          point.popupAnswer = await popup(c.popup);
          if (point.popupAnswer === undefined) return;
        }
        current.push(point);
        set(q.id, {geometry:d.geometry,points:current});
        if (status) status.textContent = d.max === 1 ? 'Location selected. Click another place to move it.' : 'Point added. Add another point or continue.';
        draw();
        return;
      }

      const features = featureValues();
      let draft = [...draftValues()];
      if (features.length >= d.maxFeatures) {
        if (status) status.textContent = `Maximum ${d.maxFeatures} ${d.featurePlural} reached.`;
        return;
      }
      if (draft.length >= d.max) {
        if (status) status.textContent = `Maximum ${d.max} vertices reached for this ${d.feature}. Finish it or edit the draft.`;
        return;
      }
      const point = {lat:latlng.lat,lng:latlng.lng};
      if (c.popup?.enabled) {
        point.popupAnswer = await popup(c.popup);
        if (point.popupAnswer === undefined) return;
      }
      draft.push(point);
      writeFeatures(features, draft);
      if (status) {
        const remaining = Math.max(0, d.min - draft.length);
        status.textContent = remaining
          ? `Add ${remaining} more ${remaining === 1 ? 'vertex' : 'vertices'}, then finish the ${d.feature}.`
          : `${d.feature[0].toUpperCase()+d.feature.slice(1)} ready — right-click on desktop or double-tap on mobile to finish.`;
      }
      draw();
    }

    function finishDraft() {
      if (q.type === 'map_multi') return;
      const features = featureValues();
      const draft = [...draftValues()];
      if (draft.length < d.min) {
        if (status) status.textContent = `Add at least ${d.min} vertices before finishing this ${d.feature}.`;
        return;
      }
      if (features.length >= d.maxFeatures) {
        if (status) status.textContent = `Maximum ${d.maxFeatures} ${d.featurePlural} reached.`;
        return;
      }
      const next = [...features, {points:draft}];
      writeFeatures(next, []);
      if (status) status.textContent = next.length >= d.maxFeatures
        ? `${d.feature[0].toUpperCase()+d.feature.slice(1)} ${next.length} saved. Maximum number reached.`
        : `${d.feature[0].toUpperCase()+d.feature.slice(1)} ${next.length} saved. Start drawing ${d.feature} ${next.length + 1}.`;
      draw();
    }

    if (q.type === 'map_multi') {
      m.on('click', e => addVertex(e.latlng));
    } else if (touchMode) {
      let pendingClick = null;
      let pendingLatLng = null;
      let lastTapAt = 0;
      let touchStart = null;
      let suppressClickUntil = 0;

      m.on('click', e => {
        if (Date.now() < suppressClickUntil) return;
        pendingLatLng = e.latlng;
        clearTimeout(pendingClick);
        pendingClick = setTimeout(() => {
          addVertex(pendingLatLng);
          pendingClick = null;
          pendingLatLng = null;
        }, 380);
      });

      mapElement.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) { touchStart = null; return; }
        touchStart = {x:e.touches[0].clientX,y:e.touches[0].clientY};
      }, {passive:true});

      mapElement.addEventListener('touchend', e => {
        const touch = e.changedTouches?.[0];
        if (!touchStart || !touch) return;
        const moved = Math.hypot(touch.clientX-touchStart.x,touch.clientY-touchStart.y);
        touchStart = null;
        if (moved > 14) return;
        const now = Date.now();
        if (now - lastTapAt <= 360) {
          e.preventDefault();
          lastTapAt = 0;
          suppressClickUntil = now + 500;
          clearTimeout(pendingClick);
          pendingClick = null;
          pendingLatLng = null;
          finishDraft();
        } else {
          lastTapAt = now;
        }
      }, {passive:false});
    } else {
      m.on('click', e => addVertex(e.latlng));
      m.on('contextmenu', e => {
        e.originalEvent?.preventDefault?.();
        finishDraft();
      });
      mapElement.addEventListener('contextmenu', e => e.preventDefault());
    }

    card?.querySelector('[data-map-fullscreen]')?.addEventListener('click', toggleFullscreen);
    syncFullscreenButton();

    card?.querySelector('[data-save-feature]')?.addEventListener('click', finishDraft);

    card?.querySelector('[data-undo]')?.addEventListener('click', () => {
      if (q.type === 'map_multi') {
        const current = [...pointValues()];
        current.pop();
        set(q.id, current.length ? {geometry:d.geometry,points:current} : null);
      } else {
        const draft = [...draftValues()];
        draft.pop();
        writeFeatures(featureValues(), draft);
      }
      draw();
    });

    card?.querySelector('[data-clear-current]')?.addEventListener('click', () => {
      writeFeatures(featureValues(), []);
      if (status) status.textContent = `Current ${d.feature} draft cleared. Start again on the map.`;
      draw();
    });

    card?.querySelector('[data-remove-saved]')?.addEventListener('click', () => {
      const features = [...featureValues()];
      if (!features.length) return;
      features.pop();
      writeFeatures(features, draftValues());
      if (status) status.textContent = `Last saved ${d.feature} removed.`;
      draw();
    });

    card?.querySelector('[data-clear]')?.addEventListener('click', () => {
      set(q.id, null);
      if (status) status.textContent = q.type === 'map_multi' ? 'Selection cleared. Tap the map to add a point.' : `All saved ${d.featurePlural} and the current draft were cleared.`;
      draw();
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
        L.circle([lat,lng], {radius:Math.max(20,position.coords.accuracy || 50),weight:2,fillOpacity:.08,interactive:false}).addTo(helper);
        m.setView([lat,lng],15);
        if (status) status.textContent = 'Map centered on your current location. Tap the map to continue your response.';
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
            if (status) status.textContent = `Map moved to ${item.label || query}. Tap the map to continue your response.`;
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
