// ============================================================================
// Mein Stadtviertel — PPGIS Umfrage
// ============================================================================

const API = (() => {
  const placeholder = '__PORT_8000__';
  return placeholder.startsWith('__') ? 'http://localhost:8000' : placeholder;
})();

const BOCHUM = { lat: 51.4818, lng: 7.2162 };

const state = {
  step: 0,
  data: {
    age_group: null,
    residency_duration: null,
    home: null,
    favorite: { point: null, reason: '' },
    unsafe: { point: null, reason: '' },
    leisure: null,
    improve: { point: null, reason: '' },
    satisfaction: null,
    safety_day: null,
    safety_night: null,
    feedback: '',
  },
  maps: {},
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
// Step definitions
// ----------------------------------------------------------------------------
const steps = [
  { id: 'intro', kind: 'intro' },
  { id: 'q1', kind: 'options', title: 'Ihre Altersgruppe', kicker: 'Frage 1 von 10',
    key: 'age_group',
    options: ['unter 18', '18–29', '30–44', '45–59', '60+'] },
  { id: 'q2', kind: 'options', title: 'Wie lange wohnen Sie schon in diesem Viertel?', kicker: 'Frage 2 von 10',
    key: 'residency_duration',
    options: ['weniger als 1 Jahr', '1–5 Jahre', '5–10 Jahre', 'mehr als 10 Jahre'] },
  { id: 'q3', kind: 'map', title: 'Wo wohnen Sie ungefähr?', kicker: 'Frage 3 von 10',
    desc: 'Markieren Sie den ungefähren Standort Ihres Wohnorts auf der Karte. Ein genauer Punkt ist nicht nötig.',
    key: 'home', hint: 'Tippen Sie auf die Karte, um Ihren Wohnort zu markieren' },
  { id: 'q4', kind: 'mapText', title: 'Ein Ort, den Sie besonders mögen', kicker: 'Frage 4 von 10',
    desc: 'Markieren Sie einen Ort in Ihrem Viertel, der Ihnen wichtig ist oder den Sie gerne besuchen.',
    key: 'favorite', hint: 'Ort markieren', textLabel: 'Warum ist Ihnen dieser Ort wichtig? (optional)',
    placeholder: 'z. B. ruhig, grün, gute Erinnerungen …' },
  { id: 'q5', kind: 'mapText', title: 'Ein Ort, an dem Sie sich unwohl fühlen', kicker: 'Frage 5 von 10',
    desc: 'Markieren Sie einen Ort, an dem Sie sich unsicher oder unwohl fühlen.',
    key: 'unsafe', hint: 'Ort markieren', textLabel: 'Was stört Sie an diesem Ort? (optional)',
    placeholder: 'z. B. schlechte Beleuchtung, wenig los …' },
  { id: 'q6', kind: 'map', title: 'Ein Ort für Freizeit oder Erholung', kicker: 'Frage 6 von 10',
    desc: 'Markieren Sie einen Ort, den Sie regelmäßig für Freizeit oder Erholung nutzen (z. B. Park, Sportplatz, Treffpunkt).',
    key: 'leisure', hint: 'Ort markieren' },
  { id: 'q7', kind: 'mapText', title: 'Ein Ort, der verbessert werden sollte', kicker: 'Frage 7 von 10',
    desc: 'Gibt es einen Ort, den Sie verbessern würden? Markieren Sie ihn.',
    key: 'improve', hint: 'Ort markieren', textLabel: 'Was sollte sich dort ändern? (optional)',
    placeholder: 'z. B. mehr Bänke, bessere Beleuchtung …' },
  { id: 'q8', kind: 'scale', title: 'Lebensqualität in Ihrem Viertel', kicker: 'Frage 8 von 10',
    desc: 'Wie zufrieden sind Sie insgesamt mit der Lebensqualität in Ihrem Viertel?',
    key: 'satisfaction', low: 'sehr unzufrieden', high: 'sehr zufrieden' },
  { id: 'q9', kind: 'scale2', title: 'Sicherheitsempfinden', kicker: 'Frage 9 von 10',
    desc: 'Wie sicher fühlen Sie sich in Ihrem Viertel …' },
  { id: 'q10', kind: 'textarea', title: 'Möchten Sie uns noch etwas mitteilen?', kicker: 'Frage 10 von 10',
    desc: 'Alles, was Ihnen sonst noch zu Ihrem Viertel wichtig ist (optional).',
    key: 'feedback' },
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
  const wrap = document.createElement('div');
  wrap.className = 'step-nav';
  const back = document.createElement('button');
  back.className = 'btn btn-ghost';
  back.textContent = '← Zurück';
  back.style.visibility = canGoBack ? 'visible' : 'hidden';
  back.onclick = () => { state.step--; render(); };
  const next = document.createElement('button');
  next.className = 'btn btn-primary';
  next.textContent = nextLabel || 'Weiter →';
  next.disabled = !!nextDisabled;
  next.onclick = onNext;
  wrap.append(back, next);
  return wrap;
}

function renderStep(step) {
  const frag = document.createElement('div');

  if (step.kind === 'intro') {
    frag.innerHTML = `
      <p class="step-kicker">PPGIS · Bürgerbeteiligung</p>
      <h1 class="step-title">Mein Stadtviertel</h1>
      <p class="step-desc">Wir möchten mehr darüber erfahren, wie Sie Ihr Wohnviertel erleben. Bitte markieren Sie die gefragten Orte auf der Karte und beantworten Sie ein paar kurze Fragen dazu.</p>
      <div class="intro-list">
        <div class="intro-item">${ICONS.clock}<p><strong>Dauer:</strong> ca. 5–10 Minuten</p></div>
        <div class="intro-item">${ICONS.map}<p><strong>Karte:</strong> Sie markieren 5 Orte in Ihrem Viertel</p></div>
        <div class="intro-item">${ICONS.shield}<p><strong>Anonym:</strong> Ihre Angaben werden ohne Namen ausgewertet</p></div>
      </div>`;
    const wrap = document.createElement('div');
    wrap.className = 'step-nav';
    wrap.style.justifyContent = 'flex-end';
    const start = document.createElement('button');
    start.className = 'btn btn-primary';
    start.textContent = 'Umfrage starten →';
    start.onclick = () => { state.step++; render(); };
    wrap.appendChild(start);
    frag.appendChild(wrap);
    return frag;
  }

  if (step.kind === 'options') {
    frag.innerHTML = `<p class="step-kicker">${step.kicker}</p><h2 class="step-title">${step.title}</h2>`;
    const grid = document.createElement('div');
    grid.className = 'option-grid';
    step.options.forEach(opt => {
      const card = document.createElement('div');
      card.className = 'option-card' + (state.data[step.key] === opt ? ' selected' : '');
      card.tabIndex = 0;
      card.innerHTML = `<span class="dot"></span><span>${opt}</span>`;
      card.onclick = () => { state.data[step.key] = opt; render(); };
      grid.appendChild(card);
    });
    frag.appendChild(grid);
    frag.appendChild(nav(true, 'Weiter →', () => { state.step++; render(); }, !state.data[step.key]));
    return frag;
  }

  if (step.kind === 'map' || step.kind === 'mapText') {
    frag.innerHTML = `<p class="step-kicker">${step.kicker}</p><h2 class="step-title">${step.title}</h2><p class="step-desc">${step.desc}</p>`;
    const mapWrap = document.createElement('div');
    mapWrap.className = 'map-wrap';
    const mapId = 'map-' + step.id;
    const current = step.kind === 'mapText' ? state.data[step.key].point : state.data[step.key];
    mapWrap.innerHTML = `<div class="map-hint ${current ? 'placed' : ''}" id="hint-${step.id}">${current ? '✓ Ort markiert' : step.hint}</div><div class="map-el" id="${mapId}"></div>`;
    frag.appendChild(mapWrap);

    if (step.kind === 'mapText') {
      const label = document.createElement('label');
      label.className = 'field-label';
      label.textContent = step.textLabel;
      frag.appendChild(label);
      const ta = document.createElement('textarea');
      ta.rows = 2;
      ta.placeholder = step.placeholder;
      ta.value = state.data[step.key].reason;
      ta.oninput = () => { state.data[step.key].reason = ta.value; };
      frag.appendChild(ta);
    }

    const hasPoint = step.kind === 'mapText' ? !!state.data[step.key].point : !!state.data[step.key];
    frag.appendChild(nav(true, 'Weiter →', () => { state.step++; render(); }, !hasPoint));

    // Defer map init until element is in DOM
    requestAnimationFrame(() => initMap(step, mapId));
    return frag;
  }

  if (step.kind === 'scale') {
    frag.innerHTML = `<p class="step-kicker">${step.kicker}</p><h2 class="step-title">${step.title}</h2><p class="step-desc">${step.desc}</p>`;
    frag.appendChild(buildScaleRow(step.key, step.low, step.high));
    frag.appendChild(nav(true, 'Weiter →', () => { state.step++; render(); }, !state.data[step.key]));
    return frag;
  }

  if (step.kind === 'scale2') {
    frag.innerHTML = `<p class="step-kicker">${step.kicker}</p><h2 class="step-title">${step.title}</h2><p class="step-desc">${step.desc}</p>`;
    const b1 = document.createElement('div');
    b1.className = 'scale-block';
    b1.innerHTML = `<p class="scale-block-label">… tagsüber</p>`;
    b1.appendChild(buildScaleRow('safety_day', 'sehr unsicher', 'sehr sicher'));
    const b2 = document.createElement('div');
    b2.className = 'scale-block';
    b2.innerHTML = `<p class="scale-block-label">… nachts</p>`;
    b2.appendChild(buildScaleRow('safety_night', 'sehr unsicher', 'sehr sicher'));
    frag.append(b1, b2);
    frag.appendChild(nav(true, 'Weiter →', () => { state.step++; render(); }, !(state.data.safety_day && state.data.safety_night)));
    return frag;
  }

  if (step.kind === 'textarea') {
    frag.innerHTML = `<p class="step-kicker">${step.kicker}</p><h2 class="step-title">${step.title}</h2><p class="step-desc">${step.desc}</p>`;
    const ta = document.createElement('textarea');
    ta.rows = 4;
    ta.placeholder = 'Ihre Anmerkungen …';
    ta.value = state.data.feedback;
    ta.oninput = () => { state.data.feedback = ta.value; };
    frag.appendChild(ta);
    frag.appendChild(nav(true, 'Weiter →', () => { state.step++; render(); }, false));
    return frag;
  }

  if (step.kind === 'review') {
    frag.innerHTML = `<p class="step-kicker">Fast geschafft</p><h2 class="step-title">Übersicht</h2><p class="step-desc">Bitte überprüfen Sie Ihre Angaben, bevor Sie absenden.</p>`;
    const list = document.createElement('div');
    list.className = 'review-list';
    const rows = [
      ['Altersgruppe', state.data.age_group],
      ['Wohndauer', state.data.residency_duration],
      ['Wohnort markiert', state.data.home ? 'Ja' : 'Nein'],
      ['Lieblingsort markiert', state.data.favorite.point ? 'Ja' : 'Nein'],
      ['Unsicherer Ort markiert', state.data.unsafe.point ? 'Ja' : 'Nein'],
      ['Freizeitort markiert', state.data.leisure ? 'Ja' : 'Nein'],
      ['Verbesserungsort markiert', state.data.improve.point ? 'Ja' : 'Nein'],
      ['Zufriedenheit', state.data.satisfaction + ' / 5'],
      ['Sicherheit tagsüber', state.data.safety_day + ' / 5'],
      ['Sicherheit nachts', state.data.safety_night + ' / 5'],
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

    frag.appendChild(nav(true, state.submitting ? 'Wird gesendet …' : 'Absenden ✓', submitSurvey, state.submitting));
    return frag;
  }

  if (step.kind === 'done') {
    frag.innerHTML = `
      <div class="thank-icon">${ICONS.check}</div>
      <h2 class="step-title">Vielen Dank!</h2>
      <p class="step-desc">Ihre Angaben wurden erfolgreich übermittelt und helfen dabei, unser Viertel besser zu verstehen.</p>`;
    const wrap = document.createElement('div');
    wrap.className = 'step-nav';
    wrap.style.justifyContent = 'flex-end';
    const again = document.createElement('button');
    again.className = 'btn btn-ghost';
    again.textContent = 'Weitere Antwort abgeben';
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
// Map handling (Leaflet)
// ----------------------------------------------------------------------------
function initMap(step, mapId) {
  const container = document.getElementById(mapId);
  if (!container) return;

  const map = L.map(mapId, { zoomControl: true }).setView([BOCHUM.lat, BOCHUM.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  let marker = null;
  const existing = step.kind === 'mapText' ? state.data[step.key].point : state.data[step.key];
  if (existing) {
    marker = L.marker([existing.lat, existing.lng]).addTo(map);
  }

  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    if (marker) marker.setLatLng(e.latlng); else marker = L.marker(e.latlng).addTo(map);
    if (step.kind === 'mapText') state.data[step.key].point = { lat, lng };
    else state.data[step.key] = { lat, lng };
    const hint = document.getElementById('hint-' + step.id);
    if (hint) { hint.textContent = '✓ Ort markiert'; hint.classList.add('placed'); }
    const nextBtn = document.querySelector('.btn-primary');
    if (nextBtn) nextBtn.disabled = false;
  });

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
      age_group: state.data.age_group,
      residency_duration: state.data.residency_duration,
      home_lat: state.data.home?.lat, home_lng: state.data.home?.lng,
      favorite_lat: state.data.favorite.point?.lat, favorite_lng: state.data.favorite.point?.lng,
      favorite_reason: state.data.favorite.reason,
      unsafe_lat: state.data.unsafe.point?.lat, unsafe_lng: state.data.unsafe.point?.lng,
      unsafe_reason: state.data.unsafe.reason,
      leisure_lat: state.data.leisure?.lat, leisure_lng: state.data.leisure?.lng,
      improve_lat: state.data.improve.point?.lat, improve_lng: state.data.improve.point?.lng,
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
    if (!res.ok) throw new Error('Serverfehler beim Speichern');
    state.submitting = false;
    state.step++;
    render();
  } catch (err) {
    state.submitting = false;
    state.submitError = 'Die Antwort konnte nicht gesendet werden. Bitte versuchen Sie es erneut. (' + err.message + ')';
    render();
  }
}

function resetState() {
  state.step = 0;
  state.data = {
    age_group: null, residency_duration: null, home: null,
    favorite: { point: null, reason: '' }, unsafe: { point: null, reason: '' },
    leisure: null, improve: { point: null, reason: '' },
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

render();
