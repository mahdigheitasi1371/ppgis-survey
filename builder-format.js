// Formatting toolbar for survey texts in the builder: bold, italic, underline, link,
// bullet list, numbered list and "remove formatting". The text is stored with simple
// markers (see text-format.js), which the survey page shows as formatted text.
(function () {
  'use strict';
  // Paragraph texts: all tools
  const BLOCK_FIELDS = [
    '#surveyDescription', '#thankYou', 'textarea[id^="qDescription_"]',
    'textarea[data-tr-key="description"]', 'textarea[data-survey-tr-key="description"]', 'textarea[data-survey-tr-key="thankYou"]'
  ].join(',');
  // Question titles and the consent checkbox text: no lists
  const INLINE_FIELDS = [
    'input[id^="qTitle_"]', 'input[data-tr-key="title"]', 'input[id^="checkboxLabel"]', 'input[data-tr-key="checkboxLabel"]'
  ].join(',');

  const TOOLS = [
    {id: 'bold', label: '<b>B</b>', title: 'Bold (Ctrl+B)', wrap: '**'},
    {id: 'italic', label: '<i>I</i>', title: 'Italic (Ctrl+I)', wrap: '*'},
    {id: 'underline', label: '<u>U</u>', title: 'Underline (Ctrl+U)', wrap: '__'},
    {id: 'link', label: '🔗', title: 'Insert link (Ctrl+K)'},
    {id: 'bullets', label: '•&#8201;List', title: 'Bullet list', block: true},
    {id: 'numbers', label: '1.&#8201;List', title: 'Numbered list', block: true},
    {id: 'clear', label: 'T<sub>×</sub>', title: 'Remove formatting'}
  ];

  function changed(field, value, start, end) {
    field.value = value;
    field.focus();
    field.setSelectionRange(start, end);
    field.dispatchEvent(new Event('input', {bubbles: true}));
  }

  function wrap(field, marker) {
    const {value, selectionStart: s, selectionEnd: e} = field;
    const m = marker.length;
    // Already formatted around the selection -> remove the markers
    if (value.slice(s - m, s) === marker && value.slice(e, e + m) === marker && !(marker === '*' && value.slice(s - 2, s) === '**')) {
      return changed(field, value.slice(0, s - m) + value.slice(s, e) + value.slice(e + m), s - m, e - m);
    }
    const sel = value.slice(s, e);
    if (sel.startsWith(marker) && sel.endsWith(marker) && sel.length > 2 * m) {
      return changed(field, value.slice(0, s) + sel.slice(m, -m) + value.slice(e), s, e - 2 * m);
    }
    // Keep spaces outside the markers ("**word** " instead of "**word **")
    const lead = sel.match(/^\s*/)[0], trail = sel.match(/\s*$/)[0];
    const core = sel.trim() || 'text';
    const next = value.slice(0, s) + lead + marker + core + marker + trail + value.slice(e);
    const a = s + lead.length + m;
    changed(field, next, a, a + core.length);
  }

  function link(field) {
    const {value, selectionStart: s, selectionEnd: e} = field;
    let url = window.prompt('Link address (for example https://www.tu-dortmund.de):', 'https://');
    if (!url || url === 'https://') return field.focus();
    url = url.trim();
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) url = /@/.test(url) && !/\//.test(url) ? `mailto:${url}` : `https://${url}`;
    const text = value.slice(s, e).trim() || url.replace(/^(https?:\/\/|mailto:|tel:)/i, '');
    const piece = `[${text.replace(/[\[\]]/g, '')}](${url.replace(/[()\s]/g, encodeURIComponent)})`;
    changed(field, value.slice(0, s) + piece + value.slice(e), s + 1, s + 1 + text.length);
  }

  function list(field, numbered) {
    const {value, selectionStart: s, selectionEnd: e} = field;
    const from = value.lastIndexOf('\n', s - 1) + 1;
    let to = value.indexOf('\n', Math.max(s, e - (e > s && value[e - 1] === '\n' ? 1 : 0)));
    if (to < 0) to = value.length;
    const lines = value.slice(from, to).split('\n');
    const bullet = /^\s*(?:[-•]|\*(?!\*))\s+/, number = /^\s*\d{1,3}[.)]\s+/;
    const isList = lines.every(l => !l.trim() || (numbered ? number : bullet).test(l));
    let n = 0;
    const next = lines.map(l => {
      const plain = l.replace(bullet, '').replace(number, '');
      if (isList) return plain;
      if (!plain.trim()) return l;
      n += 1;
      return (numbered ? `${n}. ` : '- ') + plain;
    }).join('\n');
    changed(field, value.slice(0, from) + next + value.slice(to), from, from + next.length);
  }

  function clear(field) {
    const F = window.PPGISFormat;
    let {value, selectionStart: s, selectionEnd: e} = field;
    if (s === e) { s = 0; e = value.length; }
    let part = F ? F.strip(value.slice(s, e)) : value.slice(s, e);
    part = part.split('\n').map(l => l.replace(/^\s*(?:[-•]|\*(?!\*))\s+/, '').replace(/^\s*\d{1,3}[.)]\s+/, '')).join('\n');
    changed(field, value.slice(0, s) + part + value.slice(e), s, s + part.length);
  }

  function apply(field, tool) {
    if (tool.wrap) return wrap(field, tool.wrap);
    if (tool.id === 'link') return link(field);
    if (tool.id === 'bullets') return list(field, false);
    if (tool.id === 'numbers') return list(field, true);
    if (tool.id === 'clear') return clear(field);
  }

  function attach(field, isBlock) {
    if (field.dataset.fmtReady) return;
    field.dataset.fmtReady = '1';
    const bar = document.createElement('div');
    bar.className = 'fmt-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Text formatting');
    TOOLS.filter(t => isBlock || !t.block).forEach(tool => {
      // <span role="button">, not <button>: the bar sits inside a <label>, where a real
      // button would become the label's control.
      const b = document.createElement('span');
      b.className = 'fmt-btn';
      b.setAttribute('role', 'button');
      b.tabIndex = 0;
      b.title = tool.title;
      b.setAttribute('aria-label', tool.title);
      b.innerHTML = tool.label;
      b.addEventListener('mousedown', ev => ev.preventDefault()); // keep the selection in the field
      b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); apply(field, tool); });
      b.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); apply(field, tool); } });
      bar.appendChild(b);
    });
    field.before(bar);
    field.classList.add('fmt-field');
    field.addEventListener('keydown', ev => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      const key = ev.key.toLowerCase();
      const tool = {b: TOOLS[0], i: TOOLS[1], u: TOOLS[2], k: TOOLS[3]}[key];
      if (tool) { ev.preventDefault(); apply(field, tool); }
    });
  }

  function scan() {
    document.querySelectorAll(BLOCK_FIELDS).forEach(f => attach(f, true));
    document.querySelectorAll(INLINE_FIELDS).forEach(f => attach(f, false));
  }
  new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
})();
