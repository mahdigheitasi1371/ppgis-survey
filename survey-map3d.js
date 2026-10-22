// 3D point map question ("map_3d").
// Step 1: participants see a normal top-down map and tap (or search) the place they want to look at.
// Step 2: the map flies in and tilts into a 3D view with buildings; taps now place points.
// Answers use the same shape as the point map: {geometry:'map_3d', points:[{lat,lng,popupAnswer?}]},
// so the dashboard, CSV and SHP export treat them like normal map points.
// Map library: MapLibre GL (open source), loaded only when a survey contains a 3D map question.
// Map data: OpenFreeMap (free OpenStreetMap vector tiles with building heights, no API key).
(function () {
  'use strict';

  const LIB = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl';
  const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  // Aerial view: NRW aerial photos (served by our own server, see /api/tiles/aerial) on top of
  // Sentinel-2 cloudless satellite imagery (EOX, CC BY 4.0) for areas outside NRW, with
  // OpenStreetMap 3D buildings and street names from OpenFreeMap.
  function aerialStyle(api) {
    return {
      version: 8,
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sources: {
        s2: {type: 'raster', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'], tileSize: 256, maxzoom: 15,
             attribution: '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless 2016</a> by EOX (CC BY 4.0)'},
        aerial: {type: 'raster', tiles: [`${api}/api/tiles/aerial/{z}/{x}/{y}.jpg`], tileSize: 256, minzoom: 10, maxzoom: 20,
                 bounds: [5.85, 50.32, 9.47, 52.54],
                 attribution: 'Luftbild © <a href="https://www.bezreg-koeln.nrw.de/geobasis-nrw" target="_blank" rel="noopener">Geobasis NRW</a> (dl-de/zero-2-0)'},
        omt: {type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}
      },
      layers: [
        {id: 'bg', type: 'background', paint: {'background-color': '#24302a'}},
        {id: 's2', type: 'raster', source: 's2'},
        {id: 'aerial', type: 'raster', source: 'aerial'},
        {id: 'ppgis-3d-buildings', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 14,
         paint: {'fill-extrusion-color': '#e6e0d4', 'fill-extrusion-vertical-gradient': true,
                 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
                 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
                 'fill-extrusion-opacity': 1}},
        {id: 'road-names', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 14,
         layout: {'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'symbol-placement': 'line'},
         paint: {'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,.75)', 'text-halo-width': 1.4}},
        {id: 'place-names', type: 'symbol', source: 'omt', 'source-layer': 'place',
         layout: {'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 14},
         paint: {'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,.8)', 'text-halo-width': 1.6}}
      ]
    };
  }

  // Map buttons to rotate and tilt the 3D view (also possible with two fingers / right mouse button)
  class ViewControl {
    constructor(labels) { this.labels = labels; }
    onAdd(map) {
      this.map = map;
      const box = document.createElement('div');
      box.className = 'maplibregl-ctrl maplibregl-ctrl-group map3d-viewctrl';
      const btn = (txt, label, fn) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = txt; b.title = label; b.setAttribute('aria-label', label);
        b.addEventListener('click', e => { e.stopPropagation(); fn(); });
        box.appendChild(b);
      };
      btn('↺', this.labels.rotateLeft, () => map.easeTo({bearing: map.getBearing() - 45, duration: 450}));
      btn('↻', this.labels.rotateRight, () => map.easeTo({bearing: map.getBearing() + 45, duration: 450}));
      btn('⤒', this.labels.tiltMore, () => map.easeTo({pitch: Math.min(75, map.getPitch() + 15), duration: 400}));
      btn('⤓', this.labels.tiltLess, () => map.easeTo({pitch: Math.max(0, map.getPitch() - 15), duration: 400}));
      this.box = box;
      return box;
    }
    onRemove() { this.box?.remove(); this.map = undefined; }
  }
  const DETAIL_ZOOM = 15; // at or above this zoom a tap places a point; below it a tap flies into 3D

  const TEXT = {
    en: {
      step1: 'Step 1: Search or tap the area you want to look at more closely.',
      step2: 'Step 2: Tap the exact spot to place a point (up to {n}). Turn and tilt the view with the ↺ ↻ ⤒ ⤓ buttons, two fingers or the right mouse button.',
      rotateLeft: 'Rotate left', rotateRight: 'Rotate right', tiltMore: 'Tilt more', tiltLess: 'Tilt less', showMap: 'Map view', showAerial: 'Aerial view',
      overview: '← Choose another area', undo: 'Undo', clear: 'Clear', search: 'Search', searchPh: 'Search a street or place',
      useLocation: '◎ Use my location', count: '{n} / {max} selected', max: 'Maximum of {max} points reached.',
      added: 'Point added. Add another point or continue.', flying: 'Opening the 3D view…', cleared: 'Points cleared.',
      noLib: 'The 3D map could not be loaded. Please check your internet connection and reload the page.',
      searching: 'Searching…', noResult: 'No matching place was found.', searchFail: 'Place search is not available right now. You can move the map by hand.',
      locating: 'Finding your location…', noLocation: 'Your location is not available. Search for a place or move the map by hand.'
    },
    de: {
      step1: 'Schritt 1: Suchen Sie den Bereich oder tippen Sie darauf, um ihn genauer anzusehen.',
      step2: 'Schritt 2: Tippen Sie auf die genaue Stelle, um einen Punkt zu setzen (bis zu {n}). Drehen und neigen Sie die Ansicht mit ↺ ↻ ⤒ ⤓, mit zwei Fingern oder der rechten Maustaste.',
      rotateLeft: 'Nach links drehen', rotateRight: 'Nach rechts drehen', tiltMore: 'Stärker neigen', tiltLess: 'Weniger neigen', showMap: 'Kartenansicht', showAerial: 'Luftbild',
      overview: '← Anderen Bereich wählen', undo: 'Rückgängig', clear: 'Löschen', search: 'Suchen', searchPh: 'Straße oder Ort suchen',
      useLocation: '◎ Meinen Standort verwenden', count: '{n} / {max} gewählt', max: 'Maximal {max} Punkte erreicht.',
      added: 'Punkt gesetzt. Setzen Sie einen weiteren Punkt oder fahren Sie fort.', flying: '3D-Ansicht wird geöffnet…', cleared: 'Punkte gelöscht.',
      noLib: 'Die 3D-Karte konnte nicht geladen werden. Bitte prüfen Sie Ihre Internetverbindung und laden Sie die Seite neu.',
      searching: 'Suche läuft…', noResult: 'Kein passender Ort gefunden.', searchFail: 'Die Ortssuche ist gerade nicht verfügbar. Sie können die Karte von Hand verschieben.',
      locating: 'Standort wird ermittelt…', noLocation: 'Ihr Standort ist nicht verfügbar. Suchen Sie einen Ort oder verschieben Sie die Karte von Hand.'
    }
  };
  function tr(key, vars) {
    const lang = String(window.SurveyLanguage?.get?.() || document.documentElement.lang || 'en').slice(0, 2);
    let s = (TEXT[lang] || TEXT.en)[key] || TEXT.en[key] || key;
    Object.entries(vars || {}).forEach(([k, v]) => { s = s.replaceAll(`{${k}}`, v); });
    return s;
  }
  const escHtml = v => { const d = document.createElement('div'); d.textContent = String(v ?? ''); return d.innerHTML; };

  let libPromise = null;
  function loadLibrary() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-maplibre]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = `${LIB}.css`; css.dataset.maplibre = '1';
        document.head.appendChild(css);
      }
      const script = document.createElement('script');
      script.src = `${LIB}.js`;
      script.onload = () => window.maplibregl ? resolve(window.maplibregl) : reject(new Error('missing'));
      script.onerror = () => { libPromise = null; reject(new Error('load failed')); };
      document.head.appendChild(script);
    });
    return libPromise;
  }

  // Card markup (same layout classes as the other map questions)
  function card(q, element) {
    const c = q.config || {};
    const max = Math.min(50, Math.max(1, Number(c.maxPoints) || 10));
    const title = escHtml(q.title || '3D map');
    const desc = q.description ? `<p class="qdesc">${escHtml(q.description)}</p>` : '';
    const required = q.required ? '<span class="required-mark">*</span>' : '';
    const search = c.allowCitySearch !== false
      ? `<div class="map-search-row"><input type="search" data-3d-search-input placeholder="${escHtml(tr('searchPh'))}"><button class="map-search-button" type="button" data-3d-search>${escHtml(tr('search'))}</button></div><div class="map-city-results" data-3d-results></div>`
      : '';
    const geo = c.allowGeo !== false ? `<button class="map-action" type="button" data-3d-locate>${escHtml(tr('useLocation'))}</button>` : '';
    element.classList.add('map-page-card', 'map3d-card');
    element.innerHTML = `<div class="map-page-canvas"><div class="map-box map3d-box" id="map3d_${q.id}"></div></div>
      <aside class="map-floating-panel">
        <div class="map-panel-handle"></div>
        <h3>${title}${required}</h3>
        ${desc}
        <div class="map-point-limit" data-3d-step>${escHtml(tr('step1'))}</div>
        ${search}
        <div class="map-actions-row">${geo}<button class="map-action" type="button" data-3d-overview hidden>${escHtml(tr('overview'))}</button><button class="map-action" type="button" data-3d-basemap>${escHtml(tr((c.background || 'aerial') === 'map' ? 'showAerial' : 'showMap'))}</button><button class="map-action" type="button" data-3d-undo>${escHtml(tr('undo'))}</button><button class="map-action" type="button" data-3d-clear>${escHtml(tr('clear'))}</button></div>
        <div class="map-location-status" data-3d-status></div>
        <div class="map-count" data-3d-count>${escHtml(tr('count', {n: 0, max}))}</div>
        <div class="error-text" data-error></div>
      </aside>`;
    return element;
  }

  // ctx: {maps, getAnswer(id), setAnswer(id, value), popup(config) -> Promise, api}
  async function init(q, ctx) {
    const el = document.getElementById(`map3d_${q.id}`);
    if (!el || ctx.maps.has(q.id)) return;
    ctx.maps.set(q.id, {m: null, kind: '3d'});
    const cardEl = el.closest('[data-qid]');
    const status = cardEl?.querySelector('[data-3d-status]');
    const stepEl = cardEl?.querySelector('[data-3d-step]');
    const countEl = cardEl?.querySelector('[data-3d-count]');
    const overviewBtn = cardEl?.querySelector('[data-3d-overview]');
    const c = q.config || {};
    const max = Math.min(50, Math.max(1, Number(c.maxPoints) || 10));
    const home = {center: [Number(c.lng || 7.4653), Number(c.lat || 51.5136)], zoom: Number(c.zoom || 12), pitch: 0, bearing: 0};
    const detailZoom = Math.max(DETAIL_ZOOM, Number(c.zoom3d || 17));
    const pitch = Math.min(75, Math.max(30, Number(c.pitch || 60)));
    const setStatus = t => { if (status) status.textContent = t || ''; };

    let maplibregl;
    try { maplibregl = await loadLibrary(); }
    catch (_) { setStatus(tr('noLib')); ctx.maps.delete(q.id); return; }
    if (!document.body.contains(el)) { ctx.maps.delete(q.id); return; }

    let basemap = (c.background || 'aerial') === 'map' ? 'map' : 'aerial';
    const styleFor = kind => ctx.style || (kind === 'map' ? STYLE : aerialStyle(ctx.api));
    const map = new maplibregl.Map({
      container: el, style: styleFor(basemap), center: home.center, zoom: home.zoom, pitch: 0, bearing: 0,
      maxPitch: 75, attributionControl: false, dragRotate: true, touchPitch: true
    });
    map.addControl(new maplibregl.AttributionControl({compact: true}), 'bottom-left');
    map.addControl(new maplibregl.NavigationControl({visualizePitch: true}), 'top-right');
    map.addControl(new ViewControl({rotateLeft: tr('rotateLeft'), rotateRight: tr('rotateRight'), tiltMore: tr('tiltMore'), tiltLess: tr('tiltLess')}), 'top-right');
    const basemapBtn = cardEl?.querySelector('[data-3d-basemap]');
    basemapBtn?.addEventListener('click', () => {
      basemap = basemap === 'map' ? 'aerial' : 'map';
      map.setStyle(styleFor(basemap));
      basemapBtn.textContent = tr(basemap === 'map' ? 'showAerial' : 'showMap');
    });
    ctx.maps.set(q.id, {m: map, kind: '3d'});

    // 3D buildings: use the style's own extrusion layer if it has one, otherwise add one
    map.on('style.load', () => {
      const style = map.getStyle() || {};
      const hasExtrusion = (style.layers || []).some(l => l.type === 'fill-extrusion');
      if (hasExtrusion) return;
      const vectorSource = Object.entries(style.sources || {}).find(([, s]) => s.type === 'vector');
      if (!vectorSource) return;
      try {
        map.addLayer({
          id: 'ppgis-3d-buildings', type: 'fill-extrusion', source: vectorSource[0], 'source-layer': 'building', minzoom: 14,
          paint: {
            'fill-extrusion-color': '#e0d9cc', 'fill-extrusion-vertical-gradient': true,
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
            'fill-extrusion-opacity': 1
          }
        });
      } catch (_) { /* style without a building layer: the map still works in 3D, just without extruded buildings */ }
    });

    const markers = [];
    const points = () => (ctx.getAnswer(q.id)?.points || []).slice();
    function save(list) { ctx.setAnswer(q.id, list.length ? {geometry: 'map_3d', points: list} : null); }
    function draw() {
      markers.splice(0).forEach(mk => mk.remove());
      points().forEach((p, i) => {
        const dot = document.createElement('div');
        dot.className = 'map3d-marker';
        dot.title = `${i + 1}`;
        dot.addEventListener('click', ev => {
          ev.stopPropagation();
          if (map.getZoom() < DETAIL_ZOOM - 0.01) flyIntoDetail(p.lng, p.lat);
        });
        markers.push(new maplibregl.Marker({element: dot, anchor: 'center'}).setLngLat([p.lng, p.lat]).addTo(map));
      });
      if (countEl) countEl.textContent = tr('count', {n: points().length, max});
    }
    function updateStage() {
      const detail = map.getZoom() >= DETAIL_ZOOM - 0.01;
      if (stepEl) stepEl.textContent = detail ? tr('step2', {n: max}) : tr('step1');
      if (overviewBtn) overviewBtn.hidden = !detail;
      cardEl?.classList.toggle('map3d-detail', detail);
    }
    function flyIntoDetail(lng, lat) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      map.easeTo({center: [lng, lat], zoom: detailZoom, pitch, bearing: -20, duration: reduce ? 0 : 700, essential: true});
      map.once('moveend', () => { setStatus(''); updateStage(); });
      updateStage();
    }

    map.on('zoomend', updateStage);
    map.on('click', async e => {
      if (map.getZoom() < DETAIL_ZOOM - 0.01) { flyIntoDetail(e.lngLat.lng, e.lngLat.lat); return; }
      const list = points();
      if (list.length >= max) { setStatus(tr('max', {max})); return; }
      const p = {lat: +e.lngLat.lat.toFixed(6), lng: +e.lngLat.lng.toFixed(6)};
      if (c.popup?.enabled && typeof ctx.popup === 'function') {
        p.popupAnswer = await ctx.popup(c.popup);
        if (p.popupAnswer === undefined) return;
      }
      list.push(p); save(list); draw(); setStatus(tr('added'));
    });

    overviewBtn?.addEventListener('click', () => { map.flyTo({...home, essential: true}); map.once('moveend', updateStage); });
    cardEl?.querySelector('[data-3d-undo]')?.addEventListener('click', () => { const l = points(); l.pop(); save(l); draw(); });
    cardEl?.querySelector('[data-3d-clear]')?.addEventListener('click', () => { save([]); draw(); setStatus(tr('cleared')); });
    cardEl?.querySelector('[data-3d-locate]')?.addEventListener('click', () => {
      if (!navigator.geolocation) { setStatus(tr('noLocation')); return; }
      setStatus(tr('locating'));
      navigator.geolocation.getCurrentPosition(pos => flyIntoDetail(pos.coords.longitude, pos.coords.latitude),
        () => setStatus(tr('noLocation')), {enableHighAccuracy: true, timeout: 10000, maximumAge: 60000});
    });

    const input = cardEl?.querySelector('[data-3d-search-input]');
    const results = cardEl?.querySelector('[data-3d-results]');
    async function search() {
      const query = input?.value.trim();
      if (!query || !results) return;
      results.innerHTML = ''; setStatus(tr('searching'));
      try {
        const lang = String(window.SurveyLanguage?.get?.() || document.documentElement.lang || navigator.language || 'en').slice(0, 2);
        const r = await fetch(`${ctx.api}/api/geocode?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(lang)}`);
        if (!r.ok) throw new Error('search');
        const found = (await r.json()).results || [];
        if (!found.length) { setStatus(tr('noResult')); return; }
        setStatus('');
        found.forEach(item => {
          const b = document.createElement('button');
          b.type = 'button'; b.textContent = item.label || query;
          b.addEventListener('click', () => { results.innerHTML = ''; flyIntoDetail(Number(item.lng), Number(item.lat)); });
          results.appendChild(b);
        });
      } catch (_) { setStatus(tr('searchFail')); }
    }
    cardEl?.querySelector('[data-3d-search]')?.addEventListener('click', search);
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(); } });

    // Keep existing points visible: open straight in 3D around them
    const existing = points();
    if (existing.length) {
      const last = existing[existing.length - 1];
      map.jumpTo({center: [last.lng, last.lat], zoom: detailZoom, pitch, bearing: -20});
    }
    draw(); updateStage();
    setTimeout(() => map.resize(), 80);
  }

  window.PPGIS3D = {card, init, loadLibrary};
})();
