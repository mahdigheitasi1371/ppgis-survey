// Multilingual authoring for the survey builder.
(function () {
  if (typeof state === 'undefined' || typeof renderInspector === 'undefined') return;

  const LANGUAGE_CATALOG = [
    ['en','English'],['de','Deutsch'],['fr','Français'],['es','Español'],['it','Italiano'],
    ['nl','Nederlands'],['pl','Polski'],['pt','Português'],['tr','Türkçe'],['ar','العربية'],
    ['uk','Українська'],['ru','Русский'],['fa','فارسی'],['zh','中文'],['ja','日本語']
  ];
  const languageName = code => LANGUAGE_CATALOG.find(x => x[0] === code)?.[1] || code.toUpperCase();

  function normalizeLanguages() {
    state.settings ||= {};
    const base = String(state.settings.defaultLanguage || 'en').toLowerCase();
    state.settings.defaultLanguage = base;
    let languages = state.settings.languages;
    if (!Array.isArray(languages) || !languages.length) languages = [{code:base,name:languageName(base)}];
    languages = languages.map(item => typeof item === 'string' ? {code:item.toLowerCase(),name:languageName(item.toLowerCase())} : {code:String(item.code||'').toLowerCase(),name:item.name||languageName(String(item.code||'').toLowerCase())}).filter(x => x.code);
    if (!languages.some(x => x.code === base)) languages.unshift({code:base,name:languageName(base)});
    state.settings.languages = [...new Map(languages.map(x => [x.code,x])).values()];
    state.translations ||= {};
  }

  function translationRoot(code) {
    state.translations ||= {};
    state.translations[code] ||= {survey:{},questions:{}};
    state.translations[code].survey ||= {};
    state.translations[code].questions ||= {};
    return state.translations[code];
  }

  function qTranslation(code,qid) {
    const root = translationRoot(code);
    root.questions[qid] ||= {};
    return root.questions[qid];
  }

  let previewTimer = null;
  function refreshPreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      try {
        const title = document.getElementById('surveyTitle');
        const description = document.getElementById('surveyDescription');
        if (title) state.title = title.value;
        if (description) state.description = description.value;
        localStorage.setItem('survey-builder-preview', JSON.stringify(state));
        const frame = document.getElementById('livePreviewFrame');
        if (frame) frame.src = `survey.html?preview=local&embed=1&t=${Date.now()}`;
      } catch (_) {}
    }, 180);
  }

  function escAttr(value='') {
    return esc(value).replace(/`/g,'&#96;');
  }

  function languageSettingsHTML() {
    normalizeLanguages();
    const base = state.settings.defaultLanguage;
    const extras = state.settings.languages.filter(x => x.code !== base);
    const available = LANGUAGE_CATALOG.filter(([code]) => !state.settings.languages.some(x => x.code === code));
    return `<div class="inspector-section multilingual-settings">
      <div class="panel-title">Survey languages</div>
      <div class="field-help" style="margin-bottom:10px">Main language: <strong>${esc(languageName(base))}</strong>. Add languages participants can choose from.</div>
      <div class="language-chip-list">${state.settings.languages.map(lang => `<span class="language-chip">${esc(lang.name)} <small>${esc(lang.code.toUpperCase())}</small>${lang.code===base?'':'<button type="button" data-remove-language="'+escAttr(lang.code)+'" aria-label="Remove '+escAttr(lang.name)+'">×</button>'}</span>`).join('')}</div>
      <div class="row" style="margin-top:10px"><select id="languageToAdd"><option value="">Choose language…</option>${available.map(([code,name])=>`<option value="${code}">${esc(name)} (${code.toUpperCase()})</option>`).join('')}<option value="__custom">Custom language…</option></select><button class="btn btn-sm" id="addLanguage" type="button">Add</button></div>
      <div id="customLanguageFields" class="row" style="display:none;margin-top:8px"><input id="customLanguageCode" maxlength="8" placeholder="Code e.g. sv"><input id="customLanguageName" placeholder="Language name"></div>
    </div>${extras.length ? `<div class="inspector-section"><div class="panel-title">Survey translations</div>${extras.map(lang => {
      const t = translationRoot(lang.code).survey;
      return `<details class="translation-block"><summary>${esc(lang.name)}</summary>
        ${f('Survey title', `<input data-survey-tr="title" data-lang="${lang.code}" value="${escAttr(t.title||'')}">`)}
        ${f('Introduction', `<textarea data-survey-tr="description" data-lang="${lang.code}">${esc(t.description||'')}</textarea>`)}
        ${f('Thank-you message', `<textarea data-survey-tr="thankYou" data-lang="${lang.code}">${esc(t.thankYou||'')}</textarea>`)}
      </details>`;
    }).join('')}</div>` : ''}`;
  }

  function questionTranslationsHTML(q) {
    normalizeLanguages();
    const base = state.settings.defaultLanguage;
    const extras = state.settings.languages.filter(x => x.code !== base);
    if (!extras.length) return '';
    return `<div class="inspector-section question-translations"><div class="panel-title">Translations</div><div class="field-help" style="margin-bottom:10px">Translate this question for each participant language.</div>${extras.map(lang => {
      const t = qTranslation(lang.code,q.id);
      let extra = '';
      if (typeof OPTS !== 'undefined' && OPTS.has(q.type)) extra += f('Choices', `<textarea data-q-tr="options" data-lang="${lang.code}">${esc((t.options||[]).join('\n'))}</textarea>`, 'One translated choice per line, in the same order as the main language.');
      if (q.type === 'matrix') {
        extra += f('Rows', `<textarea data-q-tr="rows" data-lang="${lang.code}">${esc((t.rows||[]).join('\n'))}</textarea>`);
        extra += f('Columns', `<textarea data-q-tr="columns" data-lang="${lang.code}">${esc((t.columns||[]).join('\n'))}</textarea>`);
      }
      if (q.type === 'consent') extra += f('Checkbox label', `<input data-q-tr="checkboxLabel" data-lang="${lang.code}" value="${escAttr(t.checkboxLabel||'')}">`);
      if (q.type?.startsWith('map_') && q.config?.popup?.enabled) {
        extra += f('Follow-up question', `<input data-q-tr="popupQuestion" data-lang="${lang.code}" value="${escAttr(t.popupQuestion||'')}">`);
        if (q.config.popup.type === 'single_choice') extra += f('Follow-up choices', `<textarea data-q-tr="popupOptions" data-lang="${lang.code}">${esc((t.popupOptions||[]).join('\n'))}</textarea>`);
      }
      return `<details class="translation-block"><summary>${esc(lang.name)}</summary>
        ${f('Question text', `<input data-q-tr="title" data-lang="${lang.code}" value="${escAttr(t.title||'')}">`)}
        ${f('Description / help text', `<textarea data-q-tr="description" data-lang="${lang.code}">${esc(t.description||'')}</textarea>`)}
        ${extra}
      </details>`;
    }).join('')}</div>`;
  }

  function wireLanguageSettings(inspector) {
    const select = inspector.querySelector('#languageToAdd');
    const custom = inspector.querySelector('#customLanguageFields');
    select?.addEventListener('change', () => {
      if (custom) custom.style.display = select.value === '__custom' ? 'grid' : 'none';
    });
    inspector.querySelector('#addLanguage')?.addEventListener('click', () => {
      let code = select?.value || '';
      let name = '';
      if (code === '__custom') {
        code = (inspector.querySelector('#customLanguageCode')?.value || '').trim().toLowerCase().replace(/[^a-z-]/g,'').slice(0,8);
        name = (inspector.querySelector('#customLanguageName')?.value || '').trim();
        if (!code || !name) return alert('Enter a language code and language name.');
      } else {
        name = languageName(code);
      }
      if (!code) return;
      if (!state.settings.languages.some(x => x.code === code)) state.settings.languages.push({code,name});
      translationRoot(code);
      renderInspector();
      inspector.classList.add('open');
      refreshPreview();
    });
    inspector.querySelectorAll('[data-remove-language]').forEach(button => button.addEventListener('click', () => {
      const code = button.dataset.removeLanguage;
      state.settings.languages = state.settings.languages.filter(x => x.code !== code);
      if (state.translations) delete state.translations[code];
      renderInspector();
      inspector.classList.add('open');
      refreshPreview();
    }));
    inspector.querySelectorAll('[data-survey-tr]').forEach(input => input.addEventListener('input', () => {
      translationRoot(input.dataset.lang).survey[input.dataset.surveyTr] = input.value;
      refreshPreview();
    }));
  }

  function wireQuestionTranslations(inspector,q) {
    inspector.querySelectorAll('[data-q-tr]').forEach(input => input.addEventListener('input', () => {
      const t = qTranslation(input.dataset.lang,q.id);
      const key = input.dataset.qTr;
      if (['options','rows','columns','popupOptions'].includes(key)) t[key] = input.value.split('\n').map(x=>x.trim()).filter(Boolean);
      else t[key] = input.value;
      refreshPreview();
    }));
  }

  normalizeLanguages();
  const baseRenderInspector = renderInspector;
  renderInspector = function () {
    baseRenderInspector();
    normalizeLanguages();
    const inspector = document.getElementById('inspector');
    if (!inspector) return;
    const q = state.questions.find(x => x.id === state.selected);
    if (q) {
      inspector.insertAdjacentHTML('beforeend', questionTranslationsHTML(q));
      wireQuestionTranslations(inspector,q);
    } else {
      const actions = inspector.querySelector('.settings-actions');
      const holder = document.createElement('div');
      holder.innerHTML = languageSettingsHTML();
      while (holder.firstChild) inspector.insertBefore(holder.firstChild, actions || null);
      wireLanguageSettings(inspector);
    }
  };

  renderInspector();
  refreshPreview();
})();
