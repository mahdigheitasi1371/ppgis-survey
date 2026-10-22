// Simple, safe text formatting for survey texts (titles, help texts, introduction, thank-you text).
// Texts are stored as plain text with a few markers, so exports stay readable:
//   **bold**   *italic*   __underlined__   [link text](https://example.org)
//   lines starting with "- " or "• "  -> bullet list
//   lines starting with "1. ", "2. " -> numbered list
// Everything else is escaped, so no HTML from a survey text can run in the page.
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const SAFE_URL = /^(https?:\/\/|mailto:|tel:)/i;
  const BULLET = /^\s*(?:[-•]|\*(?!\*))\s+(.*)$/;
  const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/;
  const MARKERS = /\*\*[^*\n]+\*\*|__[^_\n]+__|(^|[^*\w])\*[^*\s][^*\n]*\*(?!\*)|\[[^\]\n]+\]\([^)\s]+\)/;

  function inline(text) {
    let s = esc(text);
    // Links first, so their text can still be bold/italic.
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      const raw = url.replace(/&amp;/g, '&');
      const href = SAFE_URL.test(raw) ? raw : (/^www\./i.test(raw) ? `https://${raw}` : null);
      if (!href) return m;
      return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    s = s.replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1<em>$2</em>');
    return s;
  }

  // Block text: paragraphs/line breaks plus bullet and numbered lists.
  function block(text) {
    const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let list = null, items = [], buffer = [];
    const flushText = () => { if (buffer.length) { out.push({text: buffer.map(inline).join('\n')}); buffer = []; } };
    const flushList = () => { if (list) { out.push({html: `<${list} class="fmt-list">${items.map(i => `<li>${inline(i)}</li>`).join('')}</${list}>`}); list = null; items = []; } };
    for (const line of lines) {
      const b = line.match(BULLET), n = !b && line.match(NUMBER);
      if (b || n) {
        const kind = b ? 'ul' : 'ol';
        flushText();
        if (list && list !== kind) flushList();
        list = kind; items.push((b || n)[1]);
      } else {
        flushList();
        buffer.push(line);
      }
    }
    flushText(); flushList();
    // Joined without extra newlines next to lists (the text keeps white-space: pre-line).
    let html = '';
    out.forEach((part, i) => {
      if (part.html) { html += part.html; return; }
      let t = part.text;
      if (i > 0 && out[i - 1].html) t = t.replace(/^\n/, '');
      if (i < out.length - 1 && out[i + 1].html) t = t.replace(/\n$/, '');
      html += t;
    });
    return html;
  }

  function hasFormatting(text, asBlock) {
    const s = String(text ?? '');
    if (MARKERS.test(s)) return true;
    return !!asBlock && s.split('\n').some(l => BULLET.test(l) || NUMBER.test(l));
  }

  function strip(text) {
    return String(text ?? '')
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1')
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')
      .replace(/__([^_\n]+)__/g, '$1')
      .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1$2');
  }

  window.PPGISFormat = {inline, block, strip, hasFormatting, esc};
})();
