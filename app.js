// ============================================================================
// Mein Stadtviertel — PPGIS Umfrage / Survey
// ============================================================================

const API = (() => {
  const placeholder = '__PORT_8000__';
  return placeholder.startsWith('__') ? 'http://localhost:8000' : placeholder;
})();

const BOCHUM = { lat: 51.4818, lng: 7.2162 };
const MAX_POINTS = 10;

const state = {
  step: 0,
  lang: 'de',
  data: {
    age_group: null,
    residency_duration: null,
    home: { points: [] },
    favorite: { points: [], reason: '' },
    unsafe: { points: [], reason: '' },
    leisure: { points: [] },
    improve: { points: [], reason: '' },
    satisfaction: null,
    safety_day: null,
    safety_night: null,
    feedback: '',
  },
  submitting: false,
  submitError: null,
};

// ----------------------------------------------------------------------------
// Icons
// ----------------------------------------------------------------------------
const ICONS = {
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
  map: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4l6 2 6-2v14l-6 2-6-2-6 2V6z"/><path d="M9 4v14M15 6v14"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L19 7"/></svg>`,
};

// ----------------------------------------------------------------------------
// Translations
// ----------------------------------------------------------------------------
const OPTION_DEFS = {
  age_group: {
    codes: ['u18', '18_29', '30_44', '45_59', '60p'],
    labels: {
      de: ['unter 18', '18–29', '30–44', '45–59', '60+'],
      en: ['under 18', '18–29', '30–44', '45–59', '60+'],
    },
  },
  residency_duration: {
    codes: ['lt1', '1_5', '5_10', 'gt10'],
    labels: {
      de: ['weniger als 1 Jahr', '1–5 Jahre', '5–10 Jahre', 'mehr als 10 Jahre'],
      en: ['less than 1 year', '1–5 years', '5–10 years', 'more than 10 years'],
    },
  },
};

const TRANSLATIONS = {
  de: {
    pageTitle: 'Mein Stadtviertel — Umfrage',
    brand: 'Mein Stadtviertel',
    themeToggleLabel: 'Farbschema wechseln',
    langToggleLabel: 'Sprache wechseln',
    back: '← Zurück',
    next: 'Weiter →',
    questionOf: (n) => `Frage ${n} von 10`,
    intro: {
      kicker: 'PPGIS · Bürgerbeteiligung',
      title: 'Mein Stadtviertel',
      desc: 'Wir möchten mehr darüber erfahren, wie Sie Ihr Wohnviertel erleben. Bitte markieren Sie die gefragten Orte auf der Karte und beantworten Sie ein paar kurze Fragen dazu.',
      item1: '<strong>Dauer:</strong> ca. 5–10 Minuten',
      item2: '<strong>Karte:</strong> Sie können bis zu 10 Orte pro Frage markieren',
      item3: '<strong>Anonym:</strong> Ihre Angaben werden ohne Namen ausgewertet',
      start: 'Umfrage starten →',
      partner: 'Eine Umfrage in Zusammenarbeit mit der',
    },
    q1: { title: 'Ihre Altersgruppe' },
    q2: { title: 'Wie lange wohnen Sie schon in diesem Viertel?' },
    q3: {
      title: 'Wo wohnen Sie ungefähr?',
      desc: 'Markieren Sie den ungefähren Standort Ihres Wohnorts auf der Karte. Sie können bis zu 10 Punkte markieren.',
      hint: 'Tippen Sie auf die Karte, um Orte zu markieren',
    },
    q4: {
      title: 'Orte, die Sie besonders mögen',
      desc: 'Markieren Sie bis zu 10 Orte in Ihrem Viertel, die Ihnen wichtig sind oder die Sie gerne besuchen.',
      hint: 'Ort(e) markieren',
      textLabel: 'Warum sind Ihnen diese Orte wichtig? (optional)',
      placeholder: 'z. B. ruhig, grün, gute Erinnerungen …',
    },
    q5: {
      title: 'Orte, an denen Sie sich unwohl fühlen',
      desc: 'Markieren Sie bis zu 10 Orte, an denen Sie sich unsicher oder unwohl fühlen.',
      hint: 'Ort(e) markieren',
      textLabel: 'Was stört Sie an diesen Orten? (optional)',
      placeholder: 'z. B. schlechte Beleuchtung, wenig los …',
    },
    q6: {
      title: 'Orte für Freizeit oder Erholung',
      desc: 'Markieren Sie bis zu 10 Orte, die Sie regelmäßig für Freizeit oder Erholung nutzen (z. B. Park, Sportplatz, Treffpunkt).',
      hint: 'Ort(e) markieren',
    },
    q7: {
      title: 'Orte, die verbessert werden sollten',
      desc: 'Gibt es Orte, die Sie verbessern würden? Markieren Sie bis zu 10 davon.',
      hint: 'Ort(e) markieren',
      textLabel: 'Was sollte sich dort ändern? (optional)',
      placeholder: 'z. B. mehr Bänke, bessere Beleuchtung …',
    },
    q8: {
      title: 'Lebensqualität in Ihrem Viertel',
      desc: 'Wie zufrieden sind Sie insgesamt mit der Lebensqualität in Ihrem Viertel?',
      low: 'sehr unzufrieden', high: 'sehr zufrieden',
    },
    q9: {
      title: 'Sicherheitsempfinden',
      desc: 'Wie sicher fühlen Sie sich in Ihrem Viertel …',
      dayLabel: '… tagsüber', nightLabel: '… nachts',
      low: 'sehr unsicher', high: 'sehr sicher',
    },
    q10: {
      title: 'Möchten Sie uns noch etwas mitteilen?',
      desc: 'Alles, was Ihnen sonst noch zu Ihrem Viertel wichtig ist (optional).',
      placeholder: 'Ihre Anmerkungen …',
    },
    review: {
      kicker: 'Fast geschafft',
      title: 'Übersicht',
      desc: 'Bitte überprüfen Sie Ihre Angaben, bevor Sie absenden.',
      labels: {
        age_group: 'Altersgruppe',
        residency_duration: 'Wohndauer',
        home: 'Wohnort',
        favorite: 'Lieblingsorte',
        unsafe: 'Unsichere Orte',
        leisure: 'Freizeitorte',
        improve: 'Verbesserungsorte',
        satisfaction: 'Zufriedenheit',
        safety_day: 'Sicherheit tagsüber',
        safety_night: 'Sicherheit nachts',
      },
      submit: 'Absenden ✓',
      sending: 'Wird gesendet …',
    },
    done: {
      title: 'Vielen Dank!',
      desc: 'Ihre Angaben wurden erfolgreich übermittelt und helfen dabei, unser Viertel besser zu verstehen.',
      again: 'Weitere Antwort abgeben',
    },
    placesMarked: (n) => n === 0 ? 'kein Ort markiert' : `${n} Ort${n === 1 ? '' : 'e'} markiert`,
    mapMarked: (n, max) => `${n} von ${max} Orten markiert`,
    mapRemoveHint: 'Tippen Sie auf einen Marker, um ihn wieder zu entfernen.',
    mapMaxReached: 'Maximal 10 Orte erreicht — entfernen Sie einen, um einen neuen zu setzen.',
    errorPrefix: 'Die Antwort konnte nicht gesendet werden. Bitte versuchen Sie es erneut. (',
  },
  en: {
    pageTitle: 'My Neighborhood — Survey',
    brand: 'My Neighborhood',
    themeToggleLabel: 'Toggle color scheme',
    langToggleLabel: 'Change language',
    back: '← Back',
    next: 'Next →',
    questionOf: (n) => `Question ${n} of 10`,
    intro: {
      kicker: 'PPGIS · Public Participation',
      title: 'My Neighborhood',
      desc: 'We would like to learn more about how you experience your neighborhood. Please mark the requested places on the map and answer a few short questions.',
      item1: '<strong>Duration:</strong> approx. 5–10 minutes',
      item2: '<strong>Map:</strong> You can mark up to 10 places per question',
      item3: '<strong>Anonymous:</strong> Your answers are evaluated without any names',
      start: 'Start survey →',
      partner: 'A survey in collaboration with',
    },
    q1: { title: 'Your age group' },
    q2: { title: 'How long have you lived in this neighborhood?' },
    q3: {
      title: 'Where do you live, approximately?',
      desc: 'Mark the approximate location of your home on the map. You can mark up to 10 points.',
      hint: 'Tap the map to mark places',
    },
    q4: {
      title: 'Places you particularly like',
      desc: 'Mark up to 10 places in your neighborhood that are important to you or that you enjoy visiting.',
      hint: 'Mark place(s)',
      textLabel: 'Why are these places important to you? (optional)',
      placeholder: 'e.g. quiet, green, good memories …',
    },
    q5: {
      title: 'Places where you feel uncomfortable',
      desc: 'Mark up to 10 places where you feel unsafe or uncomfortable.',
      hint: 'Mark place(s)',
      textLabel: 'What bothers you about these places? (optional)',
      placeholder: 'e.g. poor lighting, not much going on …',
    },
    q6: {
      title: 'Places for leisure or recreation',
      desc: 'Mark up to 10 places you regularly use for leisure or recreation (e.g. park, sports field, meeting point).',
      hint: 'Mark place(s)',
    },
    q7: {
      title: 'Places that should be improved',
      desc: 'Are there places you would improve? Mark up to 10 of them.',
      hint: 'Mark place(s)',
      textLabel: 'What should change there? (optional)',
      placeholder: 'e.g. more benches, better lighting …',
    },
    q8: {
      title: 'Quality of life in your neighborhood',
      desc: 'Overall, how satisfied are you with the quality of life in your neighborhood?',
      low: 'very dissatisfied', high: 'very satisfied',
    },
    q9: {
      title: 'Sense of safety',
      desc: 'How safe do you feel in your neighborhood …',
      dayLabel: '… during the day', nightLabel: '… at night',
      low: 'very unsafe', high: 'very safe',
    },
    q10: {
      title: "Anything else you'd like to tell us?",
      desc: 'Anything else about your neighborhood that matters to you (optional).',
      placeholder: 'Your comments …',
    },
    review: {
      kicker: 'Almost done',
      title: 'Overview',
      desc: 'Please review your answers before submitting.',
      labels: {
        age_group: 'Age group',
        residency_duration: 'Length of residency',
        home: 'Home location',
        favorite: 'Favorite places',
        unsafe: 'Unsafe places',
        leisure: 'Leisure places',
        improve: 'Places to improve',
        satisfaction: 'Satisfaction',
        safety_day: 'Safety during day',
        safety_night: 'Safety at night',
      },
      submit: 'Submit ✓',
      sending: 'Sending …',
    },
    done: {
      title: 'Thank you!',
      desc: 'Your answers have been submitted successfully and help us better understand our neighborhood.',
      again: 'Submit another response',
    },
    placesMarked: (n) => n === 0 ? 'no place marked' : `${n} place${n === 1 ? '' : 's'} marked`,
    mapMarked: (n, max) => `${n} of ${max} places marked`,
    mapRemoveHint: 'Tap a marker to remove it.',
    mapMaxReached: 'Maximum of 10 places reached — remove one to add a new one.',
    errorPrefix: 'The response could not be sent. Please try again. (',
  },
};

function t() {
  return TRANSLATIONS[state.lang];
}

// ----------------------------------------------------------------------------
// Step definitions (language-neutral; text resolved via t() at render time)
// ----------------------------------------------------------------------------
const steps = [
  { id: 'intro', kind: 'intro' },
  { id: 'q1', kind: 'options', key: 'age_group', optionsKey: 'age_group', qNum: 1 },
  { id: 'q2', kind: 'options', key: 'residency_duration', optionsKey: 'residency_duration', qNum: 2 },
  { id: 'q3', kind: 'map', key: 'home', qNum: 3 },
  { id: 'q4', kind: 'mapText', key: 'favorite', qNum: 4 },
  { id: 'q5', kind: 'mapText', key: 'unsafe', qNum: 5 },
  { id: 'q6', kind: 'map', key: 'leisure', qNum: 6 },
  { id: 'q7', kind: 'mapText', key: 'improve', qNum: 7 },
  { id: 'q8', kind: 'scale', key: 'satisfaction', qNum: 8 },
  { id: 'q9', kind: 'scale2', qNum: 9 },
  { id: 'q10', kind: 'textarea', key: 'feedback', qNum: 10 },
  { id: 'review', kind: 'review' },
  { id: 'done', kind: 'done' },
];

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------
const stage = document.getElementById('stage');
const progressFill = document.getElementById('progressFill');

function updateProgress() {
  const pct = Math.min(100, Math.round((state.step / (steps.length - 1)) * 100));
  progressFill.style.width = pct + '%';
}

function render() {
  updateProgress();
  const step = steps[state.step];
  stage.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'step';
  el.appendChild(renderStep(step));
  stage.appendChild(el);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nav(canGoBack, nextLabel, onNext, nextDisabled) {
  const tr = t();
  const wrap = document.createElement('div');
  wrap.className = 'step-nav';
  const back = document.createElement('button');
  back.className = 'btn btn-ghost';
  back.textContent = tr.back;
  back.style.visibility = canGoBack ? 'visible' : 'hidden';
  back.onclick = () => { state.step--; render(); };
  const next = document.createElement('button');
  next.className = 'btn btn-primary';
  next.textContent = nextLabel || tr.next;
  next.disabled = !!nextDisabled;
  next.onclick = onNext;
  wrap.append(back, next);
  return wrap;
}

function renderStep(step) {
  const frag = document.createElement('div');
  const tr = t();

  if (step.kind === 'intro') {
    frag.innerHTML = `
      <p class="step-kicker">${tr.intro.kicker}</p>
      <h1 class="step-title">${tr.intro.title}</h1>
      <p class="step-desc">${tr.intro.desc}</p>
      <div class="intro-list">
        <div class="intro-item">${ICONS.clock}<p>${tr.intro.item1}</p></div>
        <div class="intro-item">${ICONS.map}<p>${tr.intro.item2}</p></div>
        <div class="intro-item">${ICONS.shield}<p>${tr.intro.item3}</p></div>
      </div>
      <div class="intro-partner">
        <span>${tr.intro.partner}</span>
        <img src="tu-dortmund-logo.svg" alt="TU Dortmund" class="partner-logo" />
      </div>`;
    const wrap = document.createElement('div');
    wrap.className = 'step-nav';
    wrap.style.justifyContent = 'flex-end';
    const start = document.createElement('button');
    start.className = 'btn btn-primary';
    start.textContent = tr.intro.start;
    start.onclick = () => { state.step++; render(); };
    wrap.appendChild(start);
    frag.appendChild(wrap);
    return frag;
  }

  if (step.kind === 'options') {
    const def = OPTION_DEFS[step.optionsKey];
    const labels = def.labels[state.lang];
    frag.innerHTML = `<p class="step-kicker">${tr.questionOf(step.qNum)}</p><h2 class="step-title">${tr[step.id].title}</h2>`;
    const grid = document.createElement('div');
    grid.className = 'option-grid';
    def.codes.forEach((code, i) => {
      const card = document.createElement('div');
      card.className = 'option-card' + (state.data[step.key] === code ? ' selected' : '');
      card.tabIndex = 0;
      card.innerHTML = `<span class="dot"></span><span>${labels[i]}</span>`;
      card.onclick = () => { state.data[step.key] = code; render(); };
      grid.appendChild(card);
    });
    frag.appendChild(grid);
    frag.appendChild(nav(true, tr.next, () => { state.step++; render(); }, !state.data[step.key]));
    return frag;
  }

  if (step.kind === 'map' || step.kind === 'mapText') {
    const stepTr = tr[step.id];
    frag.innerHTML = `<p class="step-kicker">${tr.questionOf(step.qNum)}</p><h2 class="step-title">${stepTr.title}</h2><p class="step-desc">${stepTr.desc}</p>`;
    const mapWrap = document.createElement('div');
    mapWrap.className = 'map-wrap';
    const mapId = 'map-' + step.id;
    const count = state.data[step.key].points.length;
    const hintText = count > 0 ? tr.mapMarked(count, MAX_POINTS) : stepTr.hint;
    mapWrap.innerHTML = `<div class="map-hint ${count > 0 ? 'placed' : ''}" id="hint-${step.id}">${hintText}</div><div class="map-el" id="${mapId}"></div>`;
    frag.appendChild(mapWrap);

    const note = document.createElement('p');
    note.className = 'map-note';
    note.id = 'note-' + step.id;
    note.textContent = count > 0 ? tr.mapRemoveHint : '';
    frag.appendChild(note);

    if (step.kind === 'mapText') {
      const label = document.createElement('label');
      label.className = 'field-label';
      label.textContent = stepTr.textLabel;
      frag.appendChild(label);
      const ta = document.createElement('textarea');
      ta.rows = 2;
      ta.placeholder = stepTr.placeholder;
      ta.value = state.data[step.key].reason;
      ta.oninput = () => { state.data[step.key].reason = ta.value; };
      frag.appendChild(ta);
    }

    frag.appendChild(nav(true, tr.next, () => { state.step++; render(); }, count === 0));

    // Defer map init until element is in DOM
    requestAnimationFrame(() => initMap(step, mapId));
    return frag;
  }

  if (step.kind === 'scale') {
    const stepTr = tr[step.id];
    frag.innerHTML = `<p class="step-kicker">${tr.questionOf(step.qNum)}</p><h2 class="step-title">${stepTr.title}</h2><p class="step-desc">${stepTr.desc}</p>`;
    frag.appendChild(buildScaleRow(step.key, stepTr.low, stepTr.high));
    frag.appendChild(nav(true, tr.next, () => { state.step++; render(); }, !state.data[step.key]));
    return frag;
  }

  if (step.kind === 'scale2') {
    const stepTr = tr.q9;
    frag.innerHTML = `<p class="step-kicker">${tr.questionOf(step.qNum)}</p><h2 class="step-title">${stepTr.title}</h2><p class="step-desc">${stepTr.desc}</p>`;
    const b1 = document.createElement('div');
    b1.className = 'scale-block';
    b1.innerHTML = `<p class="scale-block-label">${stepTr.dayLabel}</p>`;
    b1.appendChild(buildScaleRow('safety_day', stepTr.low, stepTr.high));
    const b2 = document.createElement('div');
    b2.className = 'scale-block';
    b2.innerHTML = `<p class="scale-block-label">${stepTr.nightLabel}</p>`;
    b2.appendChild(buildScaleRow('safety_night', stepTr.low, stepTr.high));
    frag.append(b1, b2);
    frag.appendChild(nav(true, tr.next, () => { state.step++; render(); }, !(state.data.safety_day && state.data.safety_night)));
    return frag;
  }

  if (step.kind === 'textarea') {
    const stepTr = tr.q10;
    frag.innerHTML = `<p class="step-kicker">${tr.questionOf(step.qNum)}</p><h2 class="step-title">${stepTr.title}</h2><p class="step-desc">${stepTr.desc}</p>`;
    const ta = document.createElement('textarea');
    ta.rows = 4;
    ta.placeholder = stepTr.placeholder;
    ta.value = state.data.feedback;
    ta.oninput = () => { state.data.feedback = ta.value; };
    frag.appendChild(ta);
    frag.appendChild(nav(true, tr.next, () => { state.step++; render(); }, false));
    return frag;
  }

  if (step.kind === 'review') {
    const rv = tr.review;
    frag.innerHTML = `<p class="step-kicker">${rv.kicker}</p><h2 class="step-title">${rv.title}</h2><p class="step-desc">${rv.desc}</p>`;
    const list = document.createElement('div');
    list.className = 'review-list';
    const ageDef = OPTION_DEFS.age_group;
    const resDef = OPTION_DEFS.residency_duration;
    const ageLabel = state.data.age_group ? ageDef.labels[state.lang][ageDef.codes.indexOf(state.data.age_group)] : '—';
    const resLabel = state.data.residency_duration ? resDef.labels[state.lang][resDef.codes.indexOf(state.data.residency_duration)] : '—';
    const rows = [
      [rv.labels.age_group, ageLabel],
      [rv.labels.residency_duration, resLabel],
      [rv.labels.home, tr.placesMarked(state.data.home.points.length)],
      [rv.labels.favorite, tr.placesMarked(state.data.favorite.points.length)],
      [rv.labels.unsafe, tr.placesMarked(state.data.unsafe.points.length)],
      [rv.labels.leisure, tr.placesMarked(state.data.leisure.points.length)],
      [rv.labels.improve, tr.placesMarked(state.data.improve.points.length)],
      [rv.labels.satisfaction, state.data.satisfaction + ' / 5'],
      [rv.labels.safety_day, state.data.safety_day + ' / 5'],
      [rv.labels.safety_night, state.data.safety_night + ' / 5'],
    ];
    rows.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'review-row';
      row.innerHTML = `<span class="k">${k}</span><span class="v">${v}</span>`;
      list.appendChild(row);
    });
    frag.appendChild(list);

    if (state.submitError) {
      const err = document.createElement('div');
      err.className = 'error-banner';
      err.textContent = state.submitError;
      frag.appendChild(err);
    }

    frag.appendChild(nav(true, state.submitting ? rv.sending : rv.submit, submitSurvey, state.submitting));
    return frag;
  }

  if (step.kind === 'done') {
    const dn = tr.done;
    frag.innerHTML = `
      <div class="thank-icon">${ICONS.check}</div>
      <h2 class="step-title">${dn.title}</h2>
      <p class="step-desc">${dn.desc}</p>`;
    const wrap = document.createElement('div');
    wrap.className = 'step-nav';
    wrap.style.justifyContent = 'flex-end';
    const again = document.createElement('button');
    again.className = 'btn btn-ghost';
    again.textContent = dn.again;
    again.onclick = () => { resetState(); render(); };
    wrap.appendChild(again);
    frag.appendChild(wrap);
    return frag;
  }

  return frag;
}

function buildScaleRow(key, lowLabel, highLabel) {
  const wrap = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'scale-row';
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scale-btn' + (state.data[key] === i ? ' selected' : '');
    btn.textContent = i;
    btn.onclick = () => { state.data[key] = i; render(); };
    row.appendChild(btn);
  }
  const caption = document.createElement('div');
  caption.className = 'scale-caption';
  caption.innerHTML = `<span>${lowLabel}</span><span>${highLabel}</span>`;
  wrap.append(row, caption);
  return wrap;
}

// ----------------------------------------------------------------------------
// Map handling (Leaflet) — up to MAX_POINTS markers per question
// ----------------------------------------------------------------------------
function updateMapHint(step) {
  const hint = document.getElementById('hint-' + step.id);
  const note = document.getElementById('note-' + step.id);
  if (!hint) return;
  const tr = t();
  const count = state.data[step.key].points.length;
  if (count === 0) {
    hint.textContent = tr[step.id].hint;
    hint.classList.remove('placed');
    if (note) note.textContent = '';
  } else {
    hint.textContent = tr.mapMarked(count, MAX_POINTS);
    hint.classList.add('placed');
    if (note) note.textContent = tr.mapRemoveHint;
  }
}

function updateNextButtonState(step) {
  const nextBtn = document.querySelector('.btn-primary');
  if (nextBtn) nextBtn.disabled = state.data[step.key].points.length === 0;
}

function flashMaxHint(step) {
  const hint = document.getElementById('hint-' + step.id);
  if (!hint) return;
  const tr = t();
  hint.textContent = tr.mapMaxReached;
  setTimeout(() => updateMapHint(step), 1600);
}

function initMap(step, mapId) {
  const container = document.getElementById(mapId);
  if (!container) return;

  const map = L.map(mapId, { zoomControl: true }).setView([BOCHUM.lat, BOCHUM.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  const pointsRef = state.data[step.key].points;

  function addMarkerFor(point) {
    const marker = L.marker([point.lat, point.lng]).addTo(map);
    marker.on('click', (ev) => {
      if (ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
      const idx = pointsRef.indexOf(point);
      if (idx !== -1) pointsRef.splice(idx, 1);
      map.removeLayer(marker);
      updateMapHint(step);
      updateNextButtonState(step);
    });
    return marker;
  }

  pointsRef.forEach(addMarkerFor);

  map.on('click', (e) => {
    if (pointsRef.length >= MAX_POINTS) {
      flashMaxHint(step);
      return;
    }
    const point = { lat: e.latlng.lat, lng: e.latlng.lng };
    pointsRef.push(point);
    addMarkerFor(point);
    updateMapHint(step);
    updateNextButtonState(step);
  });

  updateMapHint(step);
  setTimeout(() => map.invalidateSize(), 50);
}

// ----------------------------------------------------------------------------
// Submit
// ----------------------------------------------------------------------------
async function submitSurvey() {
  state.submitting = true;
  state.submitError = null;
  render();
  try {
    const payload = {
      language: state.lang,
      age_group: state.data.age_group,
      residency_duration: state.data.residency_duration,
      home_points: state.data.home.points,
      favorite_points: state.data.favorite.points,
      favorite_reason: state.data.favorite.reason,
      unsafe_points: state.data.unsafe.points,
      unsafe_reason: state.data.unsafe.reason,
      leisure_points: state.data.leisure.points,
      improve_points: state.data.improve.points,
      improve_suggestion: state.data.improve.reason,
      satisfaction: state.data.satisfaction,
      safety_day: state.data.safety_day,
      safety_night: state.data.safety_night,
      feedback: state.data.feedback,
    };
    const res = await fetch(`${API}/api/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Server error');
    state.submitting = false;
    state.step++;
    render();
  } catch (err) {
    state.submitting = false;
    state.submitError = t().errorPrefix + err.message + ')';
    render();
  }
}

function resetState() {
  state.step = 0;
  state.data = {
    age_group: null, residency_duration: null,
    home: { points: [] },
    favorite: { points: [], reason: '' },
    unsafe: { points: [], reason: '' },
    leisure: { points: [] },
    improve: { points: [], reason: '' },
    satisfaction: null, safety_day: null, safety_night: null, feedback: '',
  };
  state.submitError = null;
}

// ----------------------------------------------------------------------------
// Theme toggle
// ----------------------------------------------------------------------------
const themeToggle = document.getElementById('themeToggle');
let theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.setAttribute('data-theme', theme);
themeToggle.onclick = () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
};

// ----------------------------------------------------------------------------
// Language toggle
// ----------------------------------------------------------------------------
const langButtons = document.querySelectorAll('.lang-btn');

function updateStaticText() {
  const tr = t();
  const brandEl = document.querySelector('.brand span');
  if (brandEl) brandEl.textContent = tr.brand;
  themeToggle.setAttribute('aria-label', tr.themeToggleLabel);
  document.title = tr.pageTitle;
  document.documentElement.lang = state.lang;
  langButtons.forEach(b => {
    b.classList.toggle('active', b.dataset.lang === state.lang);
    b.setAttribute('aria-pressed', b.dataset.lang === state.lang ? 'true' : 'false');
  });
}

function setLang(lang) {
  if (lang === state.lang) return;
  state.lang = lang;
  updateStaticText();
  render();
}

langButtons.forEach(b => { b.onclick = () => setLang(b.dataset.lang); });

let initialLang = 'de';
if ((navigator.language || '').toLowerCase().startsWith('en')) initialLang = 'en';
state.lang = initialLang;
updateStaticText();

render();
