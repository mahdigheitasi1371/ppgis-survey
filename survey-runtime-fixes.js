// Runtime reliability for multilingual maps and mobile viewport changes.
(function () {
  let resizeTimer = null;
  const nativeFetch = window.fetch.bind(window);

  function selectedLanguage() {
    return window.SurveyLanguage?.get?.() || document.documentElement.lang || navigator.language || 'en';
  }

  // Make geocoding follow the participant-selected survey language.
  window.fetch = function (input, init) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (raw && raw.includes('/api/geocode')) {
        const url = new URL(raw, location.origin);
        url.searchParams.set('lang', selectedLanguage().split('-')[0]);
        if (typeof input === 'string') input = url.toString();
        else input = new Request(url.toString(), input);
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };

  function currentMapQuestion() {
    if (typeof def === 'undefined' || !def?.questions) return null;
    const card = document.querySelector('[data-qid]:not(.experience-question-hidden):not(.hidden)');
    if (!card) return null;
    const q = def.questions.find(item => item.id === card.dataset.qid);
    return q?.type?.startsWith('map_') ? q : null;
  }

  function ensureMaps() {
    if (typeof def === 'undefined' || typeof maps === 'undefined' || typeof mapInit !== 'function') return;
    const mapQuestions = (def?.questions || []).filter(q => q.type?.startsWith('map_'));
    mapQuestions.forEach(q => {
      const element = document.getElementById(`map_${q.id}`);
      if (!element) return;
      try {
        if (!maps.has(q.id)) mapInit(q);
      } catch (error) {
        console.warn('Map reinitialization failed', q.id, error);
      }
    });

    const active = currentMapQuestion();
    if (!active) return;
    const entry = maps.get(active.id);
    if (!entry?.m) return;
    [0,80,220,520].forEach(delay => setTimeout(() => {
      try { entry.m.invalidateSize({pan:false}); } catch (_) {}
    }, delay));
  }

  function syncLocalizedHeader() {
    if (typeof def === 'undefined' || !def) return;
    const brand = document.querySelector('.respondent-brand-title');
    if (brand && def.title) brand.textContent = def.title;
  }

  function localizeFeatureLabels() {
    const lang = selectedLanguage().split('-')[0];
    const words = {
      de:{Line:'Linie',Polygon:'Polygon'},fr:{Line:'Ligne',Polygon:'Polygone'},es:{Line:'Línea',Polygon:'Polígono'},
      it:{Line:'Linea',Polygon:'Poligono'},nl:{Line:'Lijn',Polygon:'Polygoon'},pl:{Line:'Linia',Polygon:'Poligon'},
      pt:{Line:'Linha',Polygon:'Polígono'},tr:{Line:'Çizgi',Polygon:'Poligon'},ar:{Line:'خط',Polygon:'مضلع'},
      fa:{Line:'خط',Polygon:'چندضلعی'},uk:{Line:'Лінія',Polygon:'Полігон'},ru:{Line:'Линия',Polygon:'Полигон'},
      zh:{Line:'线',Polygon:'多边形'},ja:{Line:'ライン',Polygon:'ポリゴン'}
    }[lang];
    if (!words) return;
    document.querySelectorAll('.map-feature-label').forEach(label => {
      const text = label.textContent.trim();
      let match = text.match(/^(Line|Polygon)\s+(\d+)$/);
      if (match) label.textContent = `${words[match[1]]} ${match[2]}`;
    });
  }

  function stabilize() {
    syncLocalizedHeader();
    ensureMaps();
    setTimeout(localizeFeatureLabels, 100);
  }

  document.addEventListener('change', event => {
    if (event.target?.id === 'surveyLanguageSelect') {
      [0,60,180,450].forEach(delay => setTimeout(stabilize, delay));
    }
  });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(stabilize, 120);
  });
  window.addEventListener('orientationchange', () => {
    [80,260,600].forEach(delay => setTimeout(stabilize, delay));
  });

  const observer = new MutationObserver(mutations => {
    let relevant = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length) { relevant = true; break; }
    }
    if (relevant) requestAnimationFrame(stabilize);
  });
  observer.observe(document.body, {childList:true,subtree:true});

  [0,120,400].forEach(delay => setTimeout(stabilize, delay));
})();
