// Participant language selector and runtime localization.
(function () {
  if (typeof render === 'undefined') return;

  const UI = {
    en:{name:'English',welcome:'Welcome',interactive:'Interactive survey',start:'Start survey',back:'Back',next:'Next',submit:'Submit',preview:'Preview complete',select:'— Select —',yes:'Yes',no:'No'},
    de:{name:'Deutsch',welcome:'Willkommen',interactive:'Interaktive Umfrage',start:'Umfrage starten',back:'Zurück',next:'Weiter',submit:'Absenden',preview:'Vorschau beendet',select:'— Auswählen —',yes:'Ja',no:'Nein'},
    fr:{name:'Français',welcome:'Bienvenue',interactive:'Enquête interactive',start:'Commencer',back:'Retour',next:'Suivant',submit:'Envoyer',preview:'Aperçu terminé',select:'— Sélectionner —',yes:'Oui',no:'Non'},
    es:{name:'Español',welcome:'Bienvenido',interactive:'Encuesta interactiva',start:'Comenzar',back:'Atrás',next:'Siguiente',submit:'Enviar',preview:'Vista previa completa',select:'— Seleccionar —',yes:'Sí',no:'No'},
    it:{name:'Italiano',welcome:'Benvenuto',interactive:'Sondaggio interattivo',start:'Inizia',back:'Indietro',next:'Avanti',submit:'Invia',preview:'Anteprima completata',select:'— Seleziona —',yes:'Sì',no:'No'},
    nl:{name:'Nederlands',welcome:'Welkom',interactive:'Interactieve enquête',start:'Start enquête',back:'Terug',next:'Volgende',submit:'Verzenden',preview:'Voorbeeld voltooid',select:'— Selecteer —',yes:'Ja',no:'Nee'},
    pl:{name:'Polski',welcome:'Witamy',interactive:'Interaktywna ankieta',start:'Rozpocznij',back:'Wstecz',next:'Dalej',submit:'Wyślij',preview:'Podgląd zakończony',select:'— Wybierz —',yes:'Tak',no:'Nie'},
    pt:{name:'Português',welcome:'Bem-vindo',interactive:'Questionário interativo',start:'Iniciar',back:'Voltar',next:'Seguinte',submit:'Enviar',preview:'Pré-visualização concluída',select:'— Selecionar —',yes:'Sim',no:'Não'},
    tr:{name:'Türkçe',welcome:'Hoş geldiniz',interactive:'Etkileşimli anket',start:'Anketi başlat',back:'Geri',next:'İleri',submit:'Gönder',preview:'Önizleme tamamlandı',select:'— Seçin —',yes:'Evet',no:'Hayır'},
    ar:{name:'العربية',welcome:'مرحباً',interactive:'استبيان تفاعلي',start:'ابدأ الاستبيان',back:'رجوع',next:'التالي',submit:'إرسال',preview:'اكتملت المعاينة',select:'— اختر —',yes:'نعم',no:'لا'},
    fa:{name:'فارسی',welcome:'خوش آمدید',interactive:'نظرسنجی تعاملی',start:'شروع نظرسنجی',back:'بازگشت',next:'بعدی',submit:'ارسال',preview:'پیش‌نمایش کامل شد',select:'— انتخاب کنید —',yes:'بله',no:'خیر'}
  };

  const clone = value => JSON.parse(JSON.stringify(value));
  let sourceDefinition = null;
  let currentLanguage = 'en';
  const finalRender = render;
  const baseChoice = typeof choice === 'function' ? choice : null;
  const baseMatrix = typeof matrix === 'function' ? matrix : null;
  const baseRanking = typeof ranking === 'function' ? ranking : null;
  const baseAllocation = typeof allocation === 'function' ? allocation : null;

  function languagesOf(source) {
    const base = String(source?.settings?.defaultLanguage || 'en').toLowerCase();
    let list = source?.settings?.languages;
    if (!Array.isArray(list) || !list.length) list = [{code:base,name:UI[base]?.name || base.toUpperCase()}];
    list = list.map(item => typeof item === 'string' ? {code:item.toLowerCase(),name:UI[item.toLowerCase()]?.name || item.toUpperCase()} : {code:String(item.code||'').toLowerCase(),name:item.name || UI[String(item.code||'').toLowerCase()]?.name || String(item.code||'').toUpperCase()}).filter(x=>x.code);
    if (!list.some(x=>x.code===base)) list.unshift({code:base,name:UI[base]?.name || base.toUpperCase()});
    return [...new Map(list.map(x=>[x.code,x])).values()];
  }

  function ui() { return UI[currentLanguage] || UI.en; }

  function localizedDefinition(source,lang) {
    const localized = clone(source);
    const base = String(source?.settings?.defaultLanguage || 'en').toLowerCase();
    if (lang === base) return localized;
    const tr = source?.translations?.[lang];
    if (!tr) return localized;
    const survey = tr.survey || {};
    if (survey.title) localized.title = survey.title;
    if (survey.description) localized.description = survey.description;
    localized.settings ||= {};
    if (survey.thankYou) localized.settings.thankYou = survey.thankYou;
    localized.questions = (localized.questions || []).map(q => {
      const qt = tr.questions?.[q.id] || {};
      if (qt.title) q.title = qt.title;
      if (qt.description) q.description = qt.description;
      q.__translation = qt;
      q.config ||= {};
      if (q.type === 'consent' && qt.checkboxLabel) q.config.checkboxLabel = qt.checkboxLabel;
      if (q.type?.startsWith('map_') && q.config.popup) {
        if (qt.popupQuestion) q.config.popup.question = qt.popupQuestion;
        if (Array.isArray(qt.popupOptions) && qt.popupOptions.length) q.config.popup.options = qt.popupOptions;
      }
      return q;
    });
    return localized;
  }

  function displayOptions(q,opts) {
    if (q.type === 'yes_no') return [ui().yes,ui().no];
    const translated = q.__translation?.options;
    return Array.isArray(translated) && translated.length ? opts.map((o,i)=>translated[i] || o) : opts;
  }

  if (baseChoice) choice = function(slot,q,opts,multi) {
    const labels = displayOptions(q,opts);
    const list = document.createElement('div');
    list.className = 'option-list';
    const cur = multi ? (ans[q.id] || []) : ans[q.id];
    opts.forEach((value,index) => {
      const label = document.createElement('label');
      label.className = 'option-label';
      const input = document.createElement('input');
      input.type = multi ? 'checkbox' : 'radio';
      input.name = q.id;
      input.checked = multi ? cur.includes(value) : cur === value;
      input.onchange = () => {
        if (multi) {
          const values = new Set(ans[q.id] || []);
          input.checked ? values.add(value) : values.delete(value);
          set(q.id,[...values]);
        } else set(q.id,value);
      };
      label.append(input,document.createTextNode(labels[index] || value));
      list.append(label);
    });
    slot.append(list);
  };

  if (baseMatrix) matrix = function(slot,q) {
    const c = q.config || {}, cur = ans[q.id] || {}, table = document.createElement('table');
    const rows = c.rows || [], cols = c.columns || [];
    const rowLabels = Array.isArray(q.__translation?.rows) ? q.__translation.rows : [];
    const colLabels = Array.isArray(q.__translation?.columns) ? q.__translation.columns : [];
    table.className = 'matrix';
    table.innerHTML = `<thead><tr><th></th>${cols.map((x,i)=>`<th>${esc(colLabels[i] || x)}</th>`).join('')}</tr></thead><tbody></tbody>`;
    const body = table.querySelector('tbody');
    rows.forEach((row,ri) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(rowLabels[ri] || row)}</td>`;
      cols.forEach(col => {
        const td = document.createElement('td'), input = document.createElement('input');
        input.type = 'radio'; input.name = `${q.id}_${ri}`; input.checked = cur[row] === col;
        input.onchange = () => set(q.id,{...(ans[q.id]||{}),[row]:col});
        td.append(input); tr.append(td);
      });
      body.append(tr);
    });
    slot.append(table);
  };

  if (baseRanking) ranking = function(slot,q) {
    const baseOptions = q.config?.options || [];
    const translated = Array.isArray(q.__translation?.options) ? q.__translation.options : [];
    const labelFor = value => {
      const i = baseOptions.indexOf(value);
      return i >= 0 ? (translated[i] || value) : value;
    };
    const order = Array.isArray(ans[q.id]) && ans[q.id].length ? ans[q.id] : [...baseOptions];
    ans[q.id] = order;
    const wrapper = document.createElement('div'); wrapper.className = 'rank-list';
    function draw() {
      wrapper.innerHTML = '';
      order.forEach((value,i) => {
        const row = document.createElement('div'); row.className = 'rank-item';
        row.innerHTML = `<span class="rank-index">${i+1}</span><span>${esc(labelFor(value))}</span><span class="rank-controls"><button data-u>↑</button><button data-d>↓</button></span>`;
        row.querySelector('[data-u]').disabled = !i; row.querySelector('[data-d]').disabled = i===order.length-1;
        row.querySelector('[data-u]').onclick=()=>{[order[i-1],order[i]]=[order[i],order[i-1]];set(q.id,[...order]);draw()};
        row.querySelector('[data-d]').onclick=()=>{[order[i+1],order[i]]=[order[i],order[i+1]];set(q.id,[...order]);draw()};
        wrapper.append(row);
      });
    }
    draw(); slot.append(wrapper);
  };

  if (baseAllocation) allocation = function(slot,q) {
    const c=q.config||{},cur=ans[q.id]||{},wrapper=document.createElement('div');
    const baseOptions=c.options||[], translated=Array.isArray(q.__translation?.options)?q.__translation.options:[];
    baseOptions.forEach((value,index)=>{
      const row=document.createElement('div');row.className='allocation-row';
      row.innerHTML=`<span>${esc(translated[index]||value)}</span><input type="number" min="0" value="${cur[value]||0}">`;
      row.querySelector('input').oninput=e=>set(q.id,{...(ans[q.id]||{}),[value]:+e.target.value||0});
      wrapper.append(row);
    });
    slot.append(wrapper);
  };

  function patchRenderedLabels() {
    if (!def) return;
    (def.questions||[]).forEach(q => {
      const card = document.querySelector(`[data-qid="${q.id}"]`);
      if (!card) return;
      if (q.type === 'dropdown') {
        const select = card.querySelector('select');
        if (select) {
          if (select.options[0]) select.options[0].textContent = ui().select;
          const translated = q.__translation?.options || [];
          (q.config?.options||[]).forEach((value,i)=>{if(select.options[i+1]) select.options[i+1].textContent = translated[i] || value;});
        }
      }
      if (q.type === 'map_line' || q.type === 'map_polygon') {
        card.classList.add('map-multi-feature');
        ['[data-save-feature]','[data-clear-current]','[data-clear]'].forEach(selector => {
          const button = card.querySelector(selector); if (button) button.style.display = 'none';
        });
      }
    });
  }

  function languageKey() {
    return sourceDefinition?.slug ? `survey-language:${sourceDefinition.slug}` : 'survey-language:preview';
  }

  function chooseInitialLanguage() {
    const langs = languagesOf(sourceDefinition);
    const allowed = new Set(langs.map(x=>x.code));
    const requested = new URLSearchParams(location.search).get('lang')?.toLowerCase();
    const remembered = localStorage.getItem(languageKey())?.toLowerCase();
    const browser = (navigator.language || '').toLowerCase().split('-')[0];
    const fallback = String(sourceDefinition?.settings?.defaultLanguage || 'en').toLowerCase();
    currentLanguage = [requested,remembered,browser,fallback].find(x=>x&&allowed.has(x)) || langs[0]?.code || 'en';
  }

  function installSelector() {
    if (!sourceDefinition) return;
    const langs = languagesOf(sourceDefinition);
    if (langs.length < 2) return;
    const topbar = document.getElementById('respondentTopbar');
    if (!topbar) return;
    let holder = topbar.querySelector('.respondent-language');
    if (!holder) {
      holder = document.createElement('label'); holder.className='respondent-language'; holder.setAttribute('aria-label','Survey language');
      holder.innerHTML = '<span aria-hidden="true">◎</span><select id="surveyLanguageSelect"></select>';
      topbar.insertBefore(holder,topbar.querySelector('.respondent-step-label'));
    }
    const select = holder.querySelector('select');
    select.innerHTML = langs.map(lang=>`<option value="${esc(lang.code)}">${esc(lang.name)}</option>`).join('');
    select.value = currentLanguage;
    select.onchange = () => switchLanguage(select.value);
  }

  function translateChrome() {
    const copy = ui();
    const sub = document.querySelector('.respondent-brand-sub'); if (sub) sub.textContent = copy.interactive;
    const step = document.getElementById('respondentStepLabel'); if (step?.textContent === 'Welcome') step.textContent = copy.welcome;
    const start = document.querySelector('[data-start-survey]'); if (start) start.textContent = `${copy.start} →`;
    const back = document.querySelector('[data-prev]'); if (back) back.textContent = `← ${copy.back}`;
    const next = document.querySelector('[data-next]');
    if (next) {
      const text = next.textContent || '';
      if (/preview complete/i.test(text)) next.textContent = copy.preview;
      else if (/submit/i.test(text)) next.textContent = `${copy.submit} →`;
      else next.textContent = `${copy.next} →`;
    }
    [start,back,next].forEach(button => button?.addEventListener('click',()=>setTimeout(translateChrome,0),{once:true}));
  }

  function switchLanguage(code) {
    const langs = languagesOf(sourceDefinition);
    if (!langs.some(x=>x.code===code)) return;
    currentLanguage = code;
    localStorage.setItem(languageKey(),code);
    ans.__language = code;
    def = localizedDefinition(sourceDefinition,code);
    document.documentElement.lang = code;
    document.documentElement.dir = ['ar','fa'].includes(code.split('-')[0]) ? 'rtl' : 'ltr';
    document.title = def.title || 'Survey';
    try { maps.forEach(entry=>entry.m?.remove?.()); maps.clear(); } catch (_) {}
    render();
  }

  render = function () {
    if (def && !sourceDefinition) {
      sourceDefinition = clone(def);
      chooseInitialLanguage();
      ans.__language = currentLanguage;
    }
    if (sourceDefinition) def = localizedDefinition(sourceDefinition,currentLanguage);
    finalRender();
    installSelector();
    patchRenderedLabels();
    translateChrome();
  };

  if (def) render();
})();
