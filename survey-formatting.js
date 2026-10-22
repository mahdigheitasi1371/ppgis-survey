// Shows formatted survey texts (bold, italic, underline, links, lists) on the participant page.
// Runs after the page has drawn a question: it reads the plain text with its markers and
// replaces it with the safe HTML from text-format.js.
(function () {
  'use strict';
  const F = window.PPGISFormat;
  if (!F) return;
  // Paragraph texts (may contain lists)
  const BLOCK = '.qdesc, .survey-desc';
  // One-line texts (titles and headings): only bold, italic, underline and links
  const INLINE = '.survey-question h3, .section-block > h2, .survey-title, .map-floating-panel h3, .survey-question .option-label > span';

  function formatBlock(el) {
    if (el.children.length && !el.querySelector('.fmt-list, a, strong, em, u')) return; // has other markup: leave alone
    const text = el.textContent;
    if (!F.hasFormatting(text, true)) return;
    el.innerHTML = F.block(text);
  }

  // Titles can contain other elements (e.g. the red * for required questions),
  // so only their text pieces are formatted.
  function formatInline(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) if (F.hasFormatting(n.nodeValue, false)) nodes.push(n);
    nodes.forEach(node => {
      if (node.parentElement?.closest('a')) return;
      const span = document.createElement('span');
      span.innerHTML = F.inline(node.nodeValue);
      node.replaceWith(...span.childNodes);
    });
  }

  function run(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(BLOCK).forEach(formatBlock);
    scope.querySelectorAll(INLINE).forEach(formatInline);
    if (scope !== document && scope.matches) {
      if (scope.matches(BLOCK)) formatBlock(scope);
      if (scope.matches(INLINE)) formatInline(scope);
    }
  }

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; run(document); });
  });
  function start() {
    run(document);
    observer.observe(document.body, {childList: true, subtree: true, characterData: true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  // Links inside a clickable answer should open the link, not tick the answer.
  document.addEventListener('click', e => {
    const a = e.target.closest?.('.option-label a');
    if (a) e.stopPropagation();
  }, true);
})();
