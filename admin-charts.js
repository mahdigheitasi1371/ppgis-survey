// Live per-question charts for the admin dashboard.
// window.AdminCharts.render(container, definition, responses) draws one card per question:
//   choices / yes-no / consent  -> horizontal bars (count + share), in option order
//   multiple choice             -> bars (share of respondents who picked each option)
//   rating / slider / number    -> distribution columns + average
//   ranking                     -> average rank per item (1 = most important)
//   allocation                  -> average allocated amount per option
//   point / line / polygon maps -> live map of all features + pop-up answer bars
//   matrix                      -> count table per row and column
//   text                        -> number of answers + latest answers
//   photos / audio / files      -> number of uploaded files
// Single-series charts: one colour (the platform accent), values in text colour, hover tooltips.
(function () {
  'use strict';

  const CONTENT = new Set(['info', 'section']);
  const TEXT = new Set(['short_text', 'long_text', 'email', 'phone', 'date', 'time', 'datetime']);
  const MEDIA = new Set(['photo', 'photos', 'audio', 'video', 'file', 'signature']);
  const maps = [];

  const esc = (v = '') => { const d = document.createElement('div'); d.textContent = String(v); return d.innerHTML; };
  const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(1);
  const pct = (n, total) => total ? Math.round((n / total) * 100) : 0;
  const answered = v => !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length));

  // ---------- tooltip (one shared element) ----------
  let tip;
  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    document.addEventListener('pointermove', event => {
      const target = event.target.closest?.('[data-tip]');
      if (!target) { tip.classList.remove('show'); return; }
      tip.textContent = target.dataset.tip;
      tip.classList.add('show');
      const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
      let x = event.clientX + pad, y = event.clientY - h - pad;
      if (x + w > window.innerWidth - 8) x = event.clientX - w - pad;
      if (y < 8) y = event.clientY + pad;
      tip.style.transform = `translate(${x}px,${y}px)`;
    });
    document.addEventListener('scroll', () => tip.classList.remove('show'), true);
    return tip;
  }

  // ---------- building blocks ----------
  function hbars(rows, opts = {}) {
    // rows: [{label, value, note}] ; value drives bar length
    if (!rows.length) return empty();
    const max = Math.max(1, ...rows.map(r => r.value));
    return `<div class="hbars">${rows.map(r => {
      const w = Math.max(r.value > 0 ? 1.5 : 0, (r.value / max) * 100);
      const tipText = r.tip || `${r.label}: ${r.note || fmt(r.value)}`;
      return `<div class="hbar" data-tip="${esc(tipText)}" tabindex="0" aria-label="${esc(tipText)}">
        <span class="hbar-label">${esc(r.label)}</span>
        <span class="hbar-track"><span class="hbar-fill" style="width:${w}%"></span></span>
        <span class="hbar-value">${esc(r.note || fmt(r.value))}</span>
      </div>`;
    }).join('')}</div>${opts.caption ? `<div class="chart-caption">${esc(opts.caption)}</div>` : ''}`;
  }

  function columns(bins, opts = {}) {
    // bins: [{label, value}] ; vertical columns from a shared baseline
    if (!bins.some(b => b.value > 0)) return empty();
    const max = Math.max(1, ...bins.map(b => b.value));
    return `<div class="cols" style="--n:${bins.length}">${bins.map(b => {
      const h = b.value ? Math.max(3, (b.value / max) * 100) : 0;
      const tipText = `${opts.prefix || ''}${b.label}: ${b.value} ${b.value === 1 ? 'response' : 'responses'}`;
      return `<div class="col" data-tip="${esc(tipText)}" tabindex="0" aria-label="${esc(tipText)}">
        <span class="col-value">${b.value || ''}</span>
        <span class="col-bar"><span class="col-fill" style="height:${h}%"></span></span>
        <span class="col-label">${esc(b.label)}</span>
      </div>`;
    }).join('')}</div>${opts.caption ? `<div class="chart-caption">${esc(opts.caption)}</div>` : ''}`;
  }

  const empty = () => '<p class="chart-empty">No answers yet.</p>';

  function stat(value, label) {
    return `<div class="chart-stat"><span class="chart-stat-value">${esc(value)}</span><span class="chart-stat-label">${esc(label)}</span></div>`;
  }

  // ---------- per-type charts ----------
  function choiceChart(q, values, total) {
    const multi = q.type === 'multiple_choice' || (q.type === 'photo_choice' && q.config?.multiple);
    let options = q.type === 'yes_no' ? ['Yes', 'No'] : (q.config?.options || []).slice();
    if (q.type === 'consent') options = [q.config?.checkboxLabel || 'Agreed'];
    const counts = new Map(options.map(o => [String(o), 0]));
    values.forEach(v => {
      const picks = multi ? (Array.isArray(v) ? v : []) : [q.type === 'consent' ? (v ? (q.config?.checkboxLabel || 'Agreed') : null) : v];
      picks.filter(answered).forEach(p => counts.set(String(p), (counts.get(String(p)) || 0) + 1));
    });
    const base = multi ? values.length : [...counts.values()].reduce((a, b) => a + b, 0);
    const rows = [...counts.entries()].map(([label, value]) => ({
      label: label || '(empty)', value,
      note: `${value} · ${pct(value, base)}%`,
      tip: `${label}: ${value} of ${base} (${pct(value, base)}%)`
    }));
    return hbars(rows, {caption: multi ? `Share of ${base} respondents who selected each option (several allowed)` : `${base} answers`});
  }

  function numericChart(q, values) {
    const nums = values.map(Number).filter(Number.isFinite);
    if (!nums.length) return empty();
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const c = q.config || {};
    let bins;
    if (q.type === 'rating') {
      const lo = Number.isFinite(+c.min) ? +c.min : 1, hi = Number.isFinite(+c.max) ? +c.max : 5;
      bins = [];
      for (let v = lo; v <= hi && bins.length < 21; v += 1) bins.push({label: String(v), value: nums.filter(n => Math.round(n) === v).length});
    } else {
      const lo = Math.min(...nums), hi = Math.max(...nums);
      if (lo === hi) bins = [{label: fmt(lo), value: nums.length}];
      else {
        const k = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(nums.length)))), step = (hi - lo) / k;
        bins = Array.from({length: k}, (_, i) => {
          const a = lo + i * step, b = i === k - 1 ? hi : lo + (i + 1) * step;
          return {label: `${fmt(+a.toFixed(1))}–${fmt(+b.toFixed(1))}`, value: nums.filter(n => n >= a && (i === k - 1 ? n <= b : n < b)).length};
        });
      }
    }
    return `${stat(fmt(+mean.toFixed(2)), `average of ${nums.length} answers`)}${columns(bins, {prefix: q.type === 'rating' ? 'Value ' : ''})}`;
  }

  function rankingChart(q, values) {
    const items = q.config?.options || [];
    const lists = values.filter(Array.isArray);
    if (!lists.length || !items.length) return empty();
    const rows = items.map(item => {
      const ranks = lists.map(l => l.indexOf(item)).filter(i => i >= 0).map(i => i + 1);
      const avg = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : items.length;
      const first = lists.filter(l => l[0] === item).length;
      return {label: item, avg, value: items.length + 1 - avg, note: `Ø ${avg.toFixed(1)}`,
        tip: `${item}: average rank ${avg.toFixed(2)} · ranked first by ${first} of ${lists.length}`};
    }).sort((a, b) => a.avg - b.avg);
    return hbars(rows, {caption: `Average rank from ${lists.length} answers – 1 = most important; longer bar = more important`});
  }

  function allocationChart(q, values) {
    const opts = q.config?.options || [];
    const objs = values.filter(v => v && typeof v === 'object');
    if (!objs.length) return empty();
    const rows = opts.map(o => {
      const avg = objs.reduce((s, x) => s + Number(x?.[o] || 0), 0) / objs.length;
      return {label: o, value: avg, note: fmt(+avg.toFixed(1)), tip: `${o}: average ${avg.toFixed(1)} ${q.config?.unit || 'points'}`};
    });
    return hbars(rows, {caption: `Average ${q.config?.unit || 'points'} from ${objs.length} answers`});
  }

  function matrixChart(q, values) {
    const rows = q.config?.rows || [], cols = q.config?.columns || [];
    const objs = values.filter(v => v && typeof v === 'object');
    if (!objs.length) return empty();
    let max = 1;
    const grid = rows.map(r => cols.map(c => { const n = objs.filter(o => o[r] === c).length; max = Math.max(max, n); return n; }));
    return `<div class="matrix-wrap"><table class="matrix-table"><thead><tr><th></th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr><th>${esc(r)}</th>${grid[i].map((n, j) => `<td data-tip="${esc(`${r} – ${cols[j]}: ${n}`)}" style="--a:${(n / max).toFixed(2)}"><span>${n || ''}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="chart-caption">${objs.length} answers · darker = more answers</div>`;
  }

  function textChart(values) {
    if (!values.length) return empty();
    const latest = values.slice(0, 5).map(v => `<li>“${esc(String(v).slice(0, 220))}${String(v).length > 220 ? '…' : ''}”</li>`).join('');
    return `${stat(String(values.length), values.length === 1 ? 'answer' : 'answers')}<ul class="chart-quotes">${latest}</ul>${values.length > 5 ? '<div class="chart-caption">Latest 5 shown – see all in the responses table or CSV.</div>' : ''}`;
  }

  function mediaChart(values) {
    const files = values.reduce((s, v) => s + (Array.isArray(v) ? v.length : (v ? 1 : 0)), 0);
    return files ? stat(String(files), `${files === 1 ? 'file' : 'files'} from ${values.length} ${values.length === 1 ? 'response' : 'responses'}`) : empty();
  }

  function mapChart(q, values, card) {
    const features = [];
    values.forEach(v => {
      if (!v) return;
      if (q.type === 'map_multi') (v.points || []).forEach(p => features.push({kind: 'point', p}));
      else (Array.isArray(v.features) ? v.features : (v.points ? [{points: v.points}] : [])).forEach(f => features.push({kind: q.type === 'map_line' ? 'line' : 'polygon', pts: f.points || []}));
    });
    const noun = q.type === 'map_multi' ? 'points' : q.type === 'map_line' ? 'lines' : 'polygons';
    let html = `${stat(String(features.length), `${noun} from ${values.length} ${values.length === 1 ? 'response' : 'responses'}`)}<div class="chart-map" data-map></div>`;
    const popup = q.config?.popup;
    if (popup?.enabled && q.type === 'map_multi') {
      const answers = features.map(f => f.p?.popupAnswer).filter(answered);
      if (popup.type === 'rating') html += `<div class="chart-sub">${esc(popup.question || 'Pop-up question')}</div>` + numericChart({type: 'rating', config: {min: 1, max: 5}}, answers);
      else if (popup.type === 'open_text') html += `<div class="chart-sub">${esc(popup.question || 'Pop-up question')}</div>` + textChart(answers);
      else html += `<div class="chart-sub">${esc(popup.question || 'Pop-up question')}</div>` + choiceChart({type: 'single_choice', config: {options: popup.options || []}}, answers);
    }
    card.innerHTML += html;
    const el = card.querySelector('[data-map]');
    if (!window.L) { el.innerHTML = '<p class="chart-empty">Map library could not be loaded.</p>'; return; }
    const c = q.config || {};
    const m = L.map(el, {scrollWheelZoom: false, attributionControl: true}).setView([+c.lat || 51.5136, +c.lng || 7.4653], +c.zoom || 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'}).addTo(m);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--chart-color').trim() || '#1f7a68';
    const layer = L.featureGroup().addTo(m);
    features.forEach(f => {
      if (f.kind === 'point' && Number.isFinite(+f.p?.lat) && Number.isFinite(+f.p?.lng)) {
        const mk = L.circleMarker([+f.p.lat, +f.p.lng], {radius: 6, color: '#ffffff', weight: 2, fillColor: accent, fillOpacity: 0.85});
        if (answered(f.p.popupAnswer)) mk.bindTooltip(esc(String(f.p.popupAnswer)));
        mk.addTo(layer);
      } else if (f.pts?.length) {
        const ll = f.pts.filter(p => Number.isFinite(+p.lat) && Number.isFinite(+p.lng)).map(p => [+p.lat, +p.lng]);
        if (ll.length < 2) return;
        (f.kind === 'line' ? L.polyline(ll, {color: accent, weight: 2}) : L.polygon(ll, {color: accent, weight: 2, fillOpacity: 0.1})).addTo(layer);
      }
    });
    if (features.length) { try { m.fitBounds(layer.getBounds().pad(0.2), {maxZoom: 15}); } catch (_) {} }
    maps.push(m);
    setTimeout(() => m.invalidateSize(), 60);
  }

  function timelineChart(responses) {
    if (!responses.length) return '';
    const days = new Map();
    responses.forEach(r => { const d = new Date(r.submitted_at); if (isNaN(d)) return; const k = d.toISOString().slice(0, 10); days.set(k, (days.get(k) || 0) + 1); });
    const keys = [...days.keys()].sort();
    const start = new Date(keys[0]), end = new Date(keys[keys.length - 1]);
    const bins = [];
    for (let d = new Date(start); d <= end && bins.length < 60; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      bins.push({label: new Date(k).toLocaleDateString(undefined, {day: 'numeric', month: 'short'}), value: days.get(k) || 0});
    }
    const shown = bins.slice(-30);
    return `<article class="card analysis-card chart-card chart-wide"><div class="chart-head"><h3>Responses per day</h3></div>${columns(shown, {caption: shown.length < bins.length ? 'Last 30 days' : ''})}</article>`;
  }

  // ---------- main ----------
  function render(container, def, responses) {
    ensureTip();
    maps.splice(0).forEach(m => { try { m.remove(); } catch (_) {} });
    container.innerHTML = timelineChart(responses);
    const qs = (def?.questions || []).filter(q => !CONTENT.has(q.type));
    qs.forEach((q, index) => {
      const values = responses.map(r => r.answers?.[q.id]).filter(answered);
      const card = document.createElement('article');
      card.className = 'card analysis-card chart-card' + (q.type.startsWith('map_') ? ' chart-wide' : '');
      card.innerHTML = `<div class="chart-head"><span class="chart-index">${index + 1}</span><h3>${esc(q.title || 'Question')}</h3><span class="chart-count" title="Answered / responses">${values.length}/${responses.length}</span></div>`;
      container.appendChild(card);
      let body = '';
      if (['single_choice', 'dropdown', 'yes_no', 'multiple_choice', 'photo_choice', 'consent'].includes(q.type)) body = choiceChart(q, values, responses.length);
      else if (['rating', 'slider', 'number'].includes(q.type)) body = numericChart(q, values);
      else if (q.type === 'ranking') body = rankingChart(q, values);
      else if (q.type === 'allocation') body = allocationChart(q, values);
      else if (q.type === 'matrix') body = matrixChart(q, values);
      else if (q.type.startsWith('map_')) { mapChart(q, values, card); return; }
      else if (MEDIA.has(q.type)) body = mediaChart(values);
      else if (TEXT.has(q.type)) body = textChart(values);
      else body = textChart(values.map(v => typeof v === 'object' ? JSON.stringify(v) : v));
      card.innerHTML += body;
    });
    if (!qs.length) container.innerHTML += '<div class="card analysis-card"><p class="chart-empty">This survey has no questions yet.</p></div>';
  }

  window.AdminCharts = {render};
})();
